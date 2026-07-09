// Additional acceptance tests focused on speaker-segment behaviour during
// offline → online sync. Segments are atomically replaced when the transcript
// wins on either side of the conflict — they never merge.

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  saveOfflineTranscript,
  getOfflineTranscript,
  applyRemoteTranscript,
  initOfflineDB,
  type OfflineTranscript,
  type SpeakerSegment,
} from '@/lib/offlineStorage';

function seg(overrides: Partial<SpeakerSegment>): SpeakerSegment {
  return {
    id: 's',
    speakerId: 'speaker_1',
    speakerLabel: 'Speaker 1',
    text: '',
    startMs: 0,
    endMs: 1000,
    segmentIndex: 0,
    ...overrides,
  };
}

function baseTranscript(overrides: Partial<OfflineTranscript> = {}): OfflineTranscript {
  const now = new Date('2026-07-05T10:00:00Z');
  return {
    id: 'transcript_session-seg',
    sessionId: 'session-seg',
    caseNumber: 'SUIT/9/2026',
    fullText: 'base',
    segments: [seg({ id: 'a', text: 'Local A' })],
    languageCode: 'en',
    createdAt: now,
    updatedAt: now,
    needsSync: true,
    version: 1,
    updatedByDevice: 'device-A',
    ...overrides,
  };
}

async function resetDb() {
  const db = await initOfflineDB();
  const stores = ['transcripts_offline', 'sync_queue', 'recording_sync'];
  await Promise.all(
    stores.map(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const req = db.transaction(name, 'readwrite').objectStore(name).clear();
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        })
    )
  );
}

async function saveAt(date: Date, t: OfflineTranscript) {
  const db = await initOfflineDB();
  await new Promise<void>((resolve, reject) => {
    const req = db
      .transaction('transcripts_offline', 'readwrite')
      .objectStore('transcripts_offline')
      .put({ ...t, updatedAt: date, needsSync: true });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

describe('speaker-segment conflict outcomes', () => {
  beforeEach(async () => { await resetDb(); });

  it('remote wins: segments are replaced wholesale (no merge)', async () => {
    await saveAt(new Date('2026-07-05T10:00:00Z'), baseTranscript({
      segments: [
        seg({ id: 'a', text: 'Local A', segmentIndex: 0 }),
        seg({ id: 'b', text: 'Local B', segmentIndex: 1, startMs: 1000, endMs: 2000 }),
      ],
    }));
    const remote = baseTranscript({
      updatedAt: new Date('2026-07-05T11:00:00Z'),
      version: 5,
      segments: [seg({ id: 'r1', text: 'Remote only', segmentIndex: 0 })],
    });

    const outcome = await applyRemoteTranscript(remote);
    expect(outcome).toBe('applied');

    const merged = await getOfflineTranscript('session-seg');
    expect(merged!.segments).toHaveLength(1);
    expect(merged!.segments[0].id).toBe('r1');
    // Ensure no local id leaked in — segments are replaced, never merged.
    expect(merged!.segments.find(s => s.id === 'a')).toBeUndefined();
    expect(merged!.segments.find(s => s.id === 'b')).toBeUndefined();
  });

  it('local wins: remote segments are ignored entirely', async () => {
    await saveAt(new Date('2026-07-05T15:00:00Z'), baseTranscript({
      version: 4,
      segments: [seg({ id: 'l1', text: 'Kept local', speakerLabel: 'Judge' })],
    }));
    const remote = baseTranscript({
      updatedAt: new Date('2026-07-05T09:00:00Z'),
      version: 99,
      segments: [seg({ id: 'r1', text: 'Should be ignored' })],
    });

    const outcome = await applyRemoteTranscript(remote);
    expect(outcome).toBe('kept-local');

    const merged = await getOfflineTranscript('session-seg');
    expect(merged!.segments).toHaveLength(1);
    expect(merged!.segments[0].id).toBe('l1');
    expect(merged!.segments[0].speakerLabel).toBe('Judge');
  });

  it('no local record: remote is inserted with its segments verbatim', async () => {
    const remote = baseTranscript({
      updatedAt: new Date('2026-07-05T12:00:00Z'),
      version: 2,
      segments: [
        seg({ id: 'r1', text: 'One', segmentIndex: 0 }),
        seg({ id: 'r2', text: 'Two', segmentIndex: 1, startMs: 1000, endMs: 2000 }),
      ],
    });

    const outcome = await applyRemoteTranscript(remote);
    expect(outcome).toBe('applied');
    const stored = await getOfflineTranscript('session-seg');
    expect(stored!.segments.map(s => s.id)).toEqual(['r1', 'r2']);
    expect(stored!.needsSync).toBe(false);
    expect(stored!.syncedAt).toBeDefined();
  });

  it('offline edit followed by remote pull preserves needsSync when local wins', async () => {
    // Simulate an offline edit through the normal API (bumps version, needsSync=true).
    await saveOfflineTranscript(baseTranscript({
      version: 0,
      segments: [seg({ id: 'edit', text: 'Offline edit' })],
    }));
    const local = await getOfflineTranscript('session-seg');
    expect(local!.needsSync).toBe(true);

    // Older remote arrives — should not overwrite the pending offline edit.
    const remote = baseTranscript({
      updatedAt: new Date('2026-07-05T09:00:00Z'),
      version: 0,
      segments: [seg({ id: 'stale', text: 'stale' })],
    });
    const outcome = await applyRemoteTranscript(remote);
    expect(outcome).toBe('kept-local');

    const after = await getOfflineTranscript('session-seg');
    expect(after!.needsSync).toBe(true);
    expect(after!.segments[0].id).toBe('edit');
  });
});
