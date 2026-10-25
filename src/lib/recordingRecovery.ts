// Pure helpers for recording recovery decisions.
// Kept free of side effects so acceptance criteria stay unit-testable.

import type { AudioChunk } from '@/types/session';

/**
 * Next append-only chunk index: strictly after the last stored chunk,
 * never reusing (and therefore never overwriting) a committed index.
 */
export function nextChunkIndex(chunks: Pick<AudioChunk, 'chunkIndex'>[]): number {
  if (chunks.length === 0) return 0;
  return chunks.reduce((max, c) => Math.max(max, c.chunkIndex), -1) + 1;
}

/** Base offset (ms) new capture should continue from after committed audio. */
export function resumeOffsetMs(chunks: Pick<AudioChunk, 'chunkIndex' | 'startOffsetMs' | 'durationMs'>[]): number {
  if (chunks.length === 0) return 0;
  const last = chunks.reduce((a, b) => (b.chunkIndex > a.chunkIndex ? b : a));
  return last.startOffsetMs + last.durationMs;
}
