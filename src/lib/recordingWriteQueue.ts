import type { AudioChunk } from '@/types/session';

/** Failed audio remains queued; only committed batches are removed. */
export class RecordingWriteQueue {
  readonly pending: AudioChunk[] = [];
  private active: Promise<void> | undefined;
  constructor(private readonly write: (chunk: AudioChunk) => Promise<void>) {}
  append(chunk: AudioChunk) { this.pending.push(chunk); }
  flush(): Promise<void> {
    if (this.active) return this.active;
    this.active = this.drain().finally(() => { this.active = undefined; });
    return this.active;
  }
  private async drain() {
    while (this.pending.length) {
      const chunk = this.pending[0];
      await this.write(chunk);
      this.pending.shift();
    }
  }
}