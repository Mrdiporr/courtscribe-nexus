// Per-session transcription status tracking.
// Lightweight localStorage-backed store so any component can render
// what the transcribe-audio edge function is doing for a given session.
//
// States include 'interrupted' (a previously queued/in-flight request that
// never confirmed completion, e.g. after a reload) and 'received' (the
// provider returned a result but the local save did not commit yet).

export type TranscriptionState =
  | 'idle'
  | 'queued'
  | 'in-flight'
  | 'completed'
  | 'deduped'
  | 'received'
  | 'interrupted'
  | 'failed';

export interface TranscriptionStatus {
  sessionId: string;
  state: TranscriptionState;
  updatedAt: string; // ISO
  attempt: number;
  lastError?: string;
  idempotencyKey?: string;
}

const STORAGE_KEY = 'myjuris:transcription-status:v1';
const EVENT = 'myjuris:transcription-status';

/**
 * A queued/in-flight request older than this is treated as interrupted
 * rather than claiming a live request indefinitely (proposed 120s lease).
 */
export const STALE_REQUEST_THRESHOLD_MS = 120_000;

function readAll(): Record<string, TranscriptionStatus> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, TranscriptionStatus>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota — ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT));
  }
}

export function getTranscriptionStatus(sessionId: string): TranscriptionStatus | undefined {
  return readAll()[sessionId];
}

export function setTranscriptionStatus(
  sessionId: string,
  patch: Partial<Omit<TranscriptionStatus, 'sessionId' | 'updatedAt'>>
): TranscriptionStatus {
  const all = readAll();
  const prev = all[sessionId] ?? { sessionId, state: 'idle' as TranscriptionState, updatedAt: new Date().toISOString(), attempt: 0 };
  const next: TranscriptionStatus = {
    ...prev,
    ...patch,
    sessionId,
    updatedAt: new Date().toISOString(),
  };
  all[sessionId] = next;
  writeAll(all);
  return next;
}

/**
 * Recover stale statuses: a queued/in-flight entry older than the lease
 * threshold becomes 'interrupted' with retry available. Fresh entries and
 * terminal states are untouched. Returns the ids that were reconciled.
 */
export function reconcileStaleStatuses(now: number = Date.now()): string[] {
  const all = readAll();
  const reconciled: string[] = [];
  for (const [id, status] of Object.entries(all)) {
    if (status.state !== 'queued' && status.state !== 'in-flight') continue;
    const age = now - new Date(status.updatedAt).getTime();
    if (isNaN(age) || age < STALE_REQUEST_THRESHOLD_MS) continue;
    all[id] = {
      ...status,
      state: 'interrupted',
      lastError: 'Interrupted before completing. Retry to continue.',
    };
    reconciled.push(id);
  }
  if (reconciled.length > 0) writeAll(all);
  return reconciled;
}

export function clearTranscriptionStatus(sessionId: string) {
  const all = readAll();
  if (all[sessionId]) {
    delete all[sessionId];
    writeAll(all);
  }
}

export const TRANSCRIPTION_STATUS_EVENT = EVENT;
