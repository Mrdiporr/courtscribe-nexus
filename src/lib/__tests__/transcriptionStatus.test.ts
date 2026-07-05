// Verifies the per-session transcription status helper's state transitions
// so the UI badge (queued → in-flight → completed / deduped / failed) can be
// trusted end-to-end.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getTranscriptionStatus,
  setTranscriptionStatus,
  clearTranscriptionStatus,
} from '@/lib/transcriptionStatus';

describe('transcription status tracker', () => {
  beforeEach(() => localStorage.clear());

  it('returns undefined before any status is written', () => {
    expect(getTranscriptionStatus('session-x')).toBeUndefined();
  });

  it('transitions queued → in-flight → completed and persists', () => {
    setTranscriptionStatus('session-1', { state: 'queued', idempotencyKey: 'abc' });
    let s = getTranscriptionStatus('session-1');
    expect(s?.state).toBe('queued');
    expect(s?.idempotencyKey).toBe('abc');

    setTranscriptionStatus('session-1', { state: 'in-flight', attempt: 1 });
    s = getTranscriptionStatus('session-1');
    expect(s?.state).toBe('in-flight');
    expect(s?.attempt).toBe(1);
    // idempotency key is preserved across patches
    expect(s?.idempotencyKey).toBe('abc');

    setTranscriptionStatus('session-1', { state: 'completed', lastError: undefined });
    expect(getTranscriptionStatus('session-1')?.state).toBe('completed');
  });

  it('records failure with sanitized-ready error message', () => {
    setTranscriptionStatus('session-2', { state: 'failed', lastError: 'upstream 502' });
    const s = getTranscriptionStatus('session-2');
    expect(s?.state).toBe('failed');
    expect(s?.lastError).toBe('upstream 502');
  });

  it('supports deduped state (idempotent cache hit)', () => {
    setTranscriptionStatus('session-3', { state: 'deduped' });
    expect(getTranscriptionStatus('session-3')?.state).toBe('deduped');
  });

  it('clearTranscriptionStatus removes an entry without affecting others', () => {
    setTranscriptionStatus('a', { state: 'completed' });
    setTranscriptionStatus('b', { state: 'in-flight' });
    clearTranscriptionStatus('a');
    expect(getTranscriptionStatus('a')).toBeUndefined();
    expect(getTranscriptionStatus('b')?.state).toBe('in-flight');
  });
});
