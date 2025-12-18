// Offline-first storage using IndexedDB
// Crash-safe, append-only for audio chunks

import type { Session, AudioChunk, Marker, Note, Adjournment } from '@/types/session';

const DB_NAME = 'mybarrister_db';
const DB_VERSION = 1;

let db: IDBDatabase | null = null;

export async function initDB(): Promise<IDBDatabase> {
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

      // Sessions store
      if (!database.objectStoreNames.contains('sessions')) {
        const sessionStore = database.createObjectStore('sessions', { keyPath: 'id' });
        sessionStore.createIndex('status', 'status', { unique: false });
        sessionStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Audio chunks store (append-only)
      if (!database.objectStoreNames.contains('audioChunks')) {
        const chunkStore = database.createObjectStore('audioChunks', { keyPath: 'id' });
        chunkStore.createIndex('sessionId', 'sessionId', { unique: false });
        chunkStore.createIndex('sessionChunk', ['sessionId', 'chunkIndex'], { unique: true });
      }

      // Markers store
      if (!database.objectStoreNames.contains('markers')) {
        const markerStore = database.createObjectStore('markers', { keyPath: 'id' });
        markerStore.createIndex('sessionId', 'sessionId', { unique: false });
      }

      // Notes store
      if (!database.objectStoreNames.contains('notes')) {
        const noteStore = database.createObjectStore('notes', { keyPath: 'id' });
        noteStore.createIndex('sessionId', 'sessionId', { unique: false });
      }

      // Adjournments store
      if (!database.objectStoreNames.contains('adjournments')) {
        const adjStore = database.createObjectStore('adjournments', { keyPath: 'id' });
        adjStore.createIndex('sessionId', 'sessionId', { unique: false });
      }
    };
  });
}

// Generic CRUD operations
async function getStore(storeName: string, mode: IDBTransactionMode = 'readonly') {
  const database = await initDB();
  const transaction = database.transaction(storeName, mode);
  return transaction.objectStore(storeName);
}

export async function saveSession(session: Session): Promise<void> {
  const store = await getStore('sessions', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.put(session);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getSession(id: string): Promise<Session | undefined> {
  const store = await getStore('sessions');
  return new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllSessions(): Promise<Session[]> {
  const store = await getStore('sessions');
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function saveAudioChunk(chunk: AudioChunk): Promise<void> {
  const store = await getStore('audioChunks', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.put(chunk);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getAudioChunks(sessionId: string): Promise<AudioChunk[]> {
  const store = await getStore('audioChunks');
  const index = store.index('sessionId');
  return new Promise((resolve, reject) => {
    const request = index.getAll(sessionId);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function saveMarker(marker: Marker): Promise<void> {
  const store = await getStore('markers', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.put(marker);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getMarkers(sessionId: string): Promise<Marker[]> {
  const store = await getStore('markers');
  const index = store.index('sessionId');
  return new Promise((resolve, reject) => {
    const request = index.getAll(sessionId);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function saveNote(note: Note): Promise<void> {
  const store = await getStore('notes', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.put(note);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getNotes(sessionId: string): Promise<Note[]> {
  const store = await getStore('notes');
  const index = store.index('sessionId');
  return new Promise((resolve, reject) => {
    const request = index.getAll(sessionId);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function saveAdjournment(adjournment: Adjournment): Promise<void> {
  const store = await getStore('adjournments', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.put(adjournment);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getAdjournments(sessionId: string): Promise<Adjournment[]> {
  const store = await getStore('adjournments');
  const index = store.index('sessionId');
  return new Promise((resolve, reject) => {
    const request = index.getAll(sessionId);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteSession(id: string): Promise<void> {
  // Delete session and all related data
  const database = await initDB();
  const transaction = database.transaction(['sessions', 'audioChunks', 'markers', 'notes', 'adjournments'], 'readwrite');
  
  // Delete from all stores
  transaction.objectStore('sessions').delete(id);
  
  // Delete related audio chunks
  const chunkStore = transaction.objectStore('audioChunks');
  const chunkIndex = chunkStore.index('sessionId');
  const chunkRequest = chunkIndex.getAllKeys(id);
  chunkRequest.onsuccess = () => {
    (chunkRequest.result || []).forEach(key => chunkStore.delete(key));
  };

  // Delete related markers
  const markerStore = transaction.objectStore('markers');
  const markerIndex = markerStore.index('sessionId');
  const markerRequest = markerIndex.getAllKeys(id);
  markerRequest.onsuccess = () => {
    (markerRequest.result || []).forEach(key => markerStore.delete(key));
  };

  // Delete related notes
  const noteStore = transaction.objectStore('notes');
  const noteIndex = noteStore.index('sessionId');
  const noteRequest = noteIndex.getAllKeys(id);
  noteRequest.onsuccess = () => {
    (noteRequest.result || []).forEach(key => noteStore.delete(key));
  };

  // Delete related adjournments
  const adjStore = transaction.objectStore('adjournments');
  const adjIndex = adjStore.index('sessionId');
  const adjRequest = adjIndex.getAllKeys(id);
  adjRequest.onsuccess = () => {
    (adjRequest.result || []).forEach(key => adjStore.delete(key));
  };

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
