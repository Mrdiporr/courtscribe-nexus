// Offline Storage for Transcripts
// IndexedDB storage for transcripts with case linking and cloud sync support

import type { Session } from '@/types/session';

const DB_NAME = 'mybarrister_db';
const DB_VERSION = 2; // Increment version to add new stores

export interface OfflineTranscript {
  id: string;
  sessionId: string;
  caseNumber?: string;
  fullText: string;
  segments: SpeakerSegment[];
  languageCode: string;
  createdAt: Date;
  updatedAt: Date;
  syncedAt?: Date; // When last synced to cloud
  needsSync: boolean; // Flag for pending sync
}

export interface SpeakerSegment {
  id: string;
  speakerId: string;
  speakerLabel: string;
  text: string;
  startMs: number;
  endMs: number;
  segmentIndex: number;
}

export interface SyncQueue {
  id: string;
  type: 'transcript' | 'recording' | 'both';
  sessionId: string;
  createdAt: Date;
  status: 'pending' | 'syncing' | 'completed' | 'failed';
  errorMessage?: string;
}

let db: IDBDatabase | null = null;

export async function initOfflineDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Existing stores from v1 (handled by main storage.ts)
      
      // Transcripts store for offline storage
      if (!database.objectStoreNames.contains('transcripts_offline')) {
        const transcriptStore = database.createObjectStore('transcripts_offline', { keyPath: 'id' });
        transcriptStore.createIndex('sessionId', 'sessionId', { unique: false });
        transcriptStore.createIndex('caseNumber', 'caseNumber', { unique: false });
        transcriptStore.createIndex('needsSync', 'needsSync', { unique: false });
      }

      // Sync queue for manual sync operations
      if (!database.objectStoreNames.contains('sync_queue')) {
        const syncStore = database.createObjectStore('sync_queue', { keyPath: 'id' });
        syncStore.createIndex('status', 'status', { unique: false });
        syncStore.createIndex('type', 'type', { unique: false });
        syncStore.createIndex('sessionId', 'sessionId', { unique: false });
      }
    };
  });
}

// Generic store getter
async function getStore(storeName: string, mode: IDBTransactionMode = 'readonly') {
  const database = await initOfflineDB();
  const transaction = database.transaction(storeName, mode);
  return transaction.objectStore(storeName);
}

// Transcript operations
export async function saveOfflineTranscript(transcript: OfflineTranscript): Promise<void> {
  const store = await getStore('transcripts_offline', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.put({
      ...transcript,
      updatedAt: new Date(),
      needsSync: true,
    });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getOfflineTranscript(sessionId: string): Promise<OfflineTranscript | undefined> {
  const store = await getStore('transcripts_offline');
  const index = store.index('sessionId');
  return new Promise((resolve, reject) => {
    const request = index.get(sessionId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllOfflineTranscripts(): Promise<OfflineTranscript[]> {
  const store = await getStore('transcripts_offline');
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function getTranscriptsNeedingSync(): Promise<OfflineTranscript[]> {
  const store = await getStore('transcripts_offline');
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const all = (request.result || []) as OfflineTranscript[];
      resolve(all.filter(t => t.needsSync === true));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getTranscriptsByCaseNumber(caseNumber: string): Promise<OfflineTranscript[]> {
  const store = await getStore('transcripts_offline');
  const index = store.index('caseNumber');
  return new Promise((resolve, reject) => {
    const request = index.getAll(caseNumber);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function markTranscriptSynced(id: string): Promise<void> {
  const store = await getStore('transcripts_offline', 'readwrite');
  return new Promise((resolve, reject) => {
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const transcript = getRequest.result;
      if (transcript) {
        transcript.syncedAt = new Date();
        transcript.needsSync = false;
        const putRequest = store.put(transcript);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve();
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function deleteOfflineTranscript(id: string): Promise<void> {
  const store = await getStore('transcripts_offline', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Sync queue operations
export async function addToSyncQueue(item: Omit<SyncQueue, 'id' | 'createdAt' | 'status'>): Promise<string> {
  const store = await getStore('sync_queue', 'readwrite');
  const id = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  
  return new Promise((resolve, reject) => {
    const request = store.put({
      ...item,
      id,
      createdAt: new Date(),
      status: 'pending',
    });
    request.onsuccess = () => resolve(id);
    request.onerror = () => reject(request.error);
  });
}

export async function getSyncQueue(): Promise<SyncQueue[]> {
  const store = await getStore('sync_queue');
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const items = (request.result || []) as SyncQueue[];
      // Sort by creation date, oldest first
      items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingSyncItems(): Promise<SyncQueue[]> {
  const store = await getStore('sync_queue');
  const index = store.index('status');
  return new Promise((resolve, reject) => {
    const request = index.getAll('pending');
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function updateSyncQueueItem(id: string, updates: Partial<SyncQueue>): Promise<void> {
  const store = await getStore('sync_queue', 'readwrite');
  return new Promise((resolve, reject) => {
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const item = getRequest.result;
      if (item) {
        const putRequest = store.put({ ...item, ...updates });
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve();
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function removeSyncQueueItem(id: string): Promise<void> {
  const store = await getStore('sync_queue', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearCompletedSyncItems(): Promise<void> {
  const store = await getStore('sync_queue', 'readwrite');
  const index = store.index('status');
  
  return new Promise((resolve, reject) => {
    const request = index.getAllKeys('completed');
    request.onsuccess = () => {
      const keys = request.result || [];
      keys.forEach(key => store.delete(key));
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}
