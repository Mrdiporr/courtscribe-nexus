// Per-session transcription status tracking.
// Lightweight localStorage-backed store so any component can render
// what the transcribe-audio edge function is doing for a given session.

export type TranscriptionState =
  | 'idle'
  | 'queued'
  | 'in-flight'
  | 'completed'
  | 'deduped'
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

export function clearTranscriptionStatus(sessionId: string) {
  const all = readAll();
  if (all[sessionId]) {
    delete all[sessionId];
    writeAll(all);
  }
}

export const TRANSCRIPTION_STATUS_EVENT = EVENT;
