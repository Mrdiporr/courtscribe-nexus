// Offline Storage for Transcripts
// IndexedDB storage for transcripts with case linking, cloud sync metadata,
// and per-session recording sync tracking.

import type { Session } from '@/types/session';

const DB_NAME = 'mybarrister_offline_db';
const DB_VERSION = 2;

export interface OfflineTranscript {
  id: string;
  sessionId: string;
  caseNumber?: string;
  fullText: string;
  segments: SpeakerSegment[];
  languageCode: string;
  createdAt: Date;
  updatedAt: Date;
  syncedAt?: Date;
  needsSync: boolean;
  version?: number;
  updatedByDevice?: string;
  lastSyncError?: string;
}

export interface SpeakerSegment {
  id: string;
  speakerId: string;
  speakerLabel: string;
  text: string;
  startMs: number;
  endMs: number;
  segmentIndex: number;
  updatedAt?: Date;
  updatedByDevice?: string;
}

export interface SyncQueue {
  id: string;
  type: 'transcript' | 'recording' | 'both';
  sessionId: string;
  createdAt: Date;
  status: 'pending' | 'syncing' | 'completed' | 'failed';
  errorMessage?: string;
}

export interface RecordingSyncRecord {
  sessionId: string;
  syncedAt: Date | null;
  sizeBytes: number;
  needsSync: boolean;
  lastError?: string;
}

let db: IDBDatabase | null = null;

export async function initOfflineDB(): Promise<IDBDatabase> {
  if (db) return db;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { db = request.result; resolve(db); };
    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains('transcripts_offline')) {
        const s = database.createObjectStore('transcripts_offline', { keyPath: 'id' });
        s.createIndex('sessionId', 'sessionId', { unique: false });
        s.createIndex('caseNumber', 'caseNumber', { unique: false });
        s.createIndex('needsSync', 'needsSync', { unique: false });
      }
      if (!database.objectStoreNames.contains('sync_queue')) {
        const s = database.createObjectStore('sync_queue', { keyPath: 'id' });
        s.createIndex('status', 'status', { unique: false });
        s.createIndex('type', 'type', { unique: false });
        s.createIndex('sessionId', 'sessionId', { unique: false });
      }
      if (!database.objectStoreNames.contains('recording_sync')) {
        database.createObjectStore('recording_sync', { keyPath: 'sessionId' });
      }
    };
  });
}

async function getStore(storeName: string, mode: IDBTransactionMode = 'readonly') {
  const database = await initOfflineDB();
  return database.transaction(storeName, mode).objectStore(storeName);
}

// ---------- Transcripts ----------
export async function saveOfflineTranscript(transcript: OfflineTranscript): Promise<void> {
  const store = await getStore('transcripts_offline', 'readwrite');
  return new Promise((resolve, reject) => {
    const next = {
      ...transcript,
      updatedAt: new Date(),
      needsSync: true,
      version: (transcript.version ?? 0) + 1,
    };
    const req = store.put(next);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getOfflineTranscript(sessionId: string): Promise<OfflineTranscript | undefined> {
  const store = await getStore('transcripts_offline');
  const index = store.index('sessionId');
  return new Promise((resolve, reject) => {
    const req = index.get(sessionId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllOfflineTranscripts(): Promise<OfflineTranscript[]> {
  const store = await getStore('transcripts_offline');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getTranscriptsNeedingSync(): Promise<OfflineTranscript[]> {
  const all = await getAllOfflineTranscripts();
  return all.filter(t => t.needsSync === true);
}

export async function getTranscriptsByCaseNumber(caseNumber: string): Promise<OfflineTranscript[]> {
  const store = await getStore('transcripts_offline');
  const index = store.index('caseNumber');
  return new Promise((resolve, reject) => {
    const req = index.getAll(caseNumber);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function markTranscriptSynced(id: string, opts: { error?: string } = {}): Promise<void> {
  const store = await getStore('transcripts_offline', 'readwrite');
  return new Promise((resolve, reject) => {
    const get = store.get(id);
    get.onsuccess = () => {
      const t = get.result;
      if (!t) return resolve();
      if (opts.error) {
        t.lastSyncError = opts.error;
      } else {
        t.syncedAt = new Date();
        t.needsSync = false;
        t.lastSyncError = undefined;
      }
      const put = store.put(t);
      put.onsuccess = () => resolve();
      put.onerror = () => reject(put.error);
    };
    get.onerror = () => reject(get.error);
  });
}

// Apply a remote version locally if it is strictly newer (used by conflict resolution).
export async function applyRemoteTranscript(remote: OfflineTranscript): Promise<'applied' | 'kept-local'> {
  const local = await getOfflineTranscript(remote.sessionId);
  if (!local) {
    const store = await getStore('transcripts_offline', 'readwrite');
    await new Promise<void>((res, rej) => {
      const r = store.put({ ...remote, needsSync: false, syncedAt: new Date() });
      r.onsuccess = () => res(); r.onerror = () => rej(r.error);
    });
    return 'applied';
  }
  const localTs = new Date(local.updatedAt).getTime();
  const remoteTs = new Date(remote.updatedAt).getTime();
  // Deterministic rule: latest updated_at wins; on tie, higher version wins; on tie, remote wins.
  const remoteWins =
    remoteTs > localTs ||
    (remoteTs === localTs && (remote.version ?? 0) > (local.version ?? 0));
  if (!remoteWins) return 'kept-local';
  const store = await getStore('transcripts_offline', 'readwrite');
  await new Promise<void>((res, rej) => {
    const r = store.put({ ...local, ...remote, needsSync: false, syncedAt: new Date() });
    r.onsuccess = () => res(); r.onerror = () => rej(r.error);
  });
  return 'applied';
}

export async function deleteOfflineTranscript(id: string): Promise<void> {
  const store = await getStore('transcripts_offline', 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---------- Recording sync tracking ----------
export async function getRecordingSync(sessionId: string): Promise<RecordingSyncRecord | undefined> {
  const store = await getStore('recording_sync');
  return new Promise((resolve, reject) => {
    const req = store.get(sessionId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllRecordingSync(): Promise<RecordingSyncRecord[]> {
  const store = await getStore('recording_sync');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function setRecordingSync(rec: RecordingSyncRecord): Promise<void> {
  const store = await getStore('recording_sync', 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(rec);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---------- Sync queue ----------
export async function addToSyncQueue(item: Omit<SyncQueue, 'id' | 'createdAt' | 'status'>): Promise<string> {
  const store = await getStore('sync_queue', 'readwrite');
  const id = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return new Promise((resolve, reject) => {
    const req = store.put({ ...item, id, createdAt: new Date(), status: 'pending' });
    req.onsuccess = () => resolve(id);
    req.onerror = () => reject(req.error);
  });
}

export async function getSyncQueue(): Promise<SyncQueue[]> {
  const store = await getStore('sync_queue');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const items = (req.result || []) as SyncQueue[];
      items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingSyncItems(): Promise<SyncQueue[]> {
  const store = await getStore('sync_queue');
  const index = store.index('status');
  return new Promise((resolve, reject) => {
    const req = index.getAll('pending');
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function updateSyncQueueItem(id: string, updates: Partial<SyncQueue>): Promise<void> {
  const store = await getStore('sync_queue', 'readwrite');
  return new Promise((resolve, reject) => {
    const get = store.get(id);
    get.onsuccess = () => {
      const item = get.result;
      if (!item) return resolve();
      const put = store.put({ ...item, ...updates });
      put.onsuccess = () => resolve();
      put.onerror = () => reject(put.error);
    };
    get.onerror = () => reject(get.error);
  });
}

export async function removeSyncQueueItem(id: string): Promise<void> {
  const store = await getStore('sync_queue', 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearCompletedSyncItems(): Promise<void> {
  const store = await getStore('sync_queue', 'readwrite');
  const index = store.index('status');
  return new Promise((resolve, reject) => {
    const req = index.getAllKeys('completed');
    req.onsuccess = () => {
      const keys = req.result || [];
      keys.forEach(k => store.delete(k));
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}
