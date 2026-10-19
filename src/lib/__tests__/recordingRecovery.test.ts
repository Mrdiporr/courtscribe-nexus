import { describe, it, expect } from 'vitest';
import { saveAudioChunk, getAudioChunks, initDB } from '@/lib/storage';
import { RecordingWriteQueue } from '@/lib/recordingWriteQueue';
import type { AudioChunk } from '@/types/session';
const chunk = (index: number): AudioChunk => ({ id: `recovery_chunk_${index}`, sessionId: 'recovery', chunkIndex: index, createdAt: new Date(), durationMs: 30000, startOffsetMs: index * 30000, blob: new Blob(['audio']) });
describe('recording recovery acceptance', () => {
  it('R7 refuses to replace immutable audio', async () => {
    await saveAudioChunk(chunk(0));
    await expect(saveAudioChunk({ ...chunk(0), blob: new Blob(['replacement']) })).rejects.toBeDefined();
    expect((await getAudioChunks('recovery'))[0].durationMs).toBe(30000);
    expect((await getAudioChunks('recovery')).filter(c => c.chunkIndex === 0)).toHaveLength(1);
  });
  it('R4 retains a failed batch and retries exactly once in order', async () => {
    let fail = true;
    const saved: number[] = [];
    const queue = new RecordingWriteQueue(async c => { if (fail) throw new Error('quota'); saved.push(c.chunkIndex); });
    queue.append(chunk(1)); queue.append(chunk(2));
    await expect(queue.flush()).rejects.toThrow('quota');
    expect(queue.pending.length).toBe(2);
    fail = false;
    await queue.flush(); await queue.flush();
    expect(saved).toEqual([1, 2]);
    expect(queue.pending).toHaveLength(0);
  });
  it('R3 serializes writes arriving during a delayed commit', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>(r => { release = r; });
    const saved: number[] = [];
    const queue = new RecordingWriteQueue(async c => { await gate; saved.push(c.chunkIndex); });
    queue.append(chunk(3));
    const first = queue.flush();
    queue.append(chunk(4));
    const second = queue.flush();
    release?.(); await Promise.all([first, second]);
    expect(saved).toEqual([3, 4]);
  });
  it('R4 transaction abort never acknowledges a saved chunk', async () => {
    const db = await initDB();
    const original = db.transaction.bind(db);
    const { vi } = await import('vitest');
    const spy = vi.spyOn(db, 'transaction').mockImplementation((...args: Parameters<IDBDatabase['transaction']>) => {
      const tx = original(...args);
      const add = tx.objectStore('audioChunks').add.bind(tx.objectStore('audioChunks'));
      vi.spyOn(tx.objectStore('audioChunks'), 'add').mockImplementation((...values: Parameters<IDBObjectStore['add']>) => {
        const request = add(...values); request.addEventListener('success', () => tx.abort()); return request;
      });
      return tx;
    });
    await expect(saveAudioChunk(chunk(99))).rejects.toBeDefined();
    spy.mockRestore();
    expect((await getAudioChunks('recovery')).some(c => c.chunkIndex === 99)).toBe(false);
  });
});
