// Audio recording hook with chunked capture
// Offline-first, crash-safe design:
// - Explicit start only (no auto-start, no auto-resume)
// - All audio writes serialized through RecordingWriteQueue
// - Append-only IndexedDB writes; committed audio is never replaced
// - Failed batches stay queued in memory and remain retryable
// - Interruptions (track loss, backgrounding, reload) mark the session
//   'interrupted' without ever auto-restarting capture

import { useState, useRef, useCallback, useEffect } from 'react';
import { saveAudioChunk, saveSession, getSession, getAudioChunks } from '@/lib/storage';
import { RecordingWriteQueue } from '@/lib/recordingWriteQueue';
import { nextChunkIndex, resumeOffsetMs } from '@/lib/recordingRecovery';
import type { AudioChunk } from '@/types/session';

const CHUNK_DURATION_MS = 30000; // 30 second batches for crash safety

interface UseRecorderOptions {
  sessionId: string;
  onError?: (error: Error) => void;
}

interface UseRecorderReturn {
  isRecording: boolean;
  isStarting: boolean;
  isPaused: boolean;
  elapsedMs: number;
  error: Error | null;
  saveError: Error | null;
  pendingBatches: number;
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<boolean>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  retrySave: () => Promise<boolean>;
}

export function useRecorder({ sessionId, onError }: UseRecorderOptions): UseRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const [pendingBatches, setPendingBatches] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkIndexRef = useRef(0);
  const baseOffsetRef = useRef(0); // offset where appended capture continues
  const sessionStartRef = useRef<number>(0);
  const chunkStartRef = useRef<number>(0);
  const pausedTotalRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const chunkTimerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const queueRef = useRef<RecordingWriteQueue | null>(null);
  const recorderMimeRef = useRef('audio/webm');
  const stopDataResolveRef = useRef<(() => void) | null>(null);
  const stoppingRef = useRef(false);
  const startingRef = useRef(false);
  const visibilityHandlerRef = useRef<(() => void) | null>(null);

  const reportError = useCallback((err: unknown, fallback: string) => {
    const error = err instanceof Error ? err : new Error(fallback);
    setError(error);
    onError?.(error);
    return error;
  }, [onError]);

  // Update elapsed time (paused time excluded)
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = window.setInterval(() => {
        const pausedNow = pausedAtRef.current !== null ? Date.now() - pausedAtRef.current : 0;
        setElapsedMs(Date.now() - sessionStartRef.current - pausedTotalRef.current - pausedNow);
      }, 100);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording, isPaused]);

  const releaseStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  /** Detach the current batch; arriving audio belongs to the next batch. */
  const enqueueBatch = useCallback(() => {
    const queue = queueRef.current;
    if (!queue || chunksRef.current.length === 0) return false;

    const blob = new Blob(chunksRef.current, { type: recorderMimeRef.current });
    chunksRef.current = [];

    const chunk: AudioChunk = {
      id: `${sessionId}_chunk_${chunkIndexRef.current}`,
      sessionId,
      chunkIndex: chunkIndexRef.current,
      createdAt: new Date(),
      durationMs: Date.now() - chunkStartRef.current,
      startOffsetMs: baseOffsetRef.current + (chunkStartRef.current - sessionStartRef.current),
      blob,
    };
    // Index assigned monotonically at enqueue time; a failed batch keeps its
    // index so a retry re-inserts the exact same append-only record.
    chunkIndexRef.current += 1;
    chunkStartRef.current = Date.now();
    queue.append(chunk);
    setPendingBatches(queue.pending.length);
    return true;
  }, [sessionId]);

  /** Serialize a flush attempt; failed batches remain queued for retry. */
  const flushQueue = useCallback(async (): Promise<boolean> => {
    const queue = queueRef.current;
    if (!queue) return true;
    try {
      await queue.flush();
      setSaveError(null);
      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to save audio');
      setSaveError(error);
      onError?.(error);
      return false;
    } finally {
      setPendingBatches(queue.pending.length);
    }
  }, [onError]);

  const markSession = useCallback(async (
    status: 'active' | 'interrupted' | 'closed',
    extra: Partial<{ totalDurationMs: number }> = {},
  ): Promise<boolean> => {
    try {
      const session = await getSession(sessionId);
      if (!session) return false;
      await saveSession({ ...session, status, updatedAt: new Date(), ...extra });
      return true;
    } catch (err) {
      reportError(err, 'Could not update the session record');
      return false;
    }
  }, [sessionId, reportError]);

  /** Total capture duration including previously committed audio. */
  const totalDuration = useCallback((): number => {
    const pausedNow = pausedAtRef.current !== null ? Date.now() - pausedAtRef.current : 0;
    return baseOffsetRef.current + Date.now() - sessionStartRef.current - pausedTotalRef.current - pausedNow;
  }, []);

  /**
   * Interruption path (track ended, backgrounded, storage failure mid-capture).
   * Stops foreground capture, keeps failed/pending batches retryable, marks the
   * session 'interrupted'. Recovery always requires a fresh user action.
   */
  const interruptCapture = useCallback(async (reason?: string): Promise<void> => {
    const rec = mediaRecorderRef.current;
    if (!rec || stoppingRef.current) return;
    stoppingRef.current = true;

    if (chunkTimerRef.current) {
      clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
    if (visibilityHandlerRef.current) {
      document.removeEventListener('visibilitychange', visibilityHandlerRef.current);
      visibilityHandlerRef.current = null;
    }

    const stopped = new Promise<void>(resolve => { stopDataResolveRef.current = resolve; });
    try {
      if (rec.state !== 'inactive') rec.stop();
    } catch { /* already inactive */ }
    await stopped;
    stopDataResolveRef.current = null;

    releaseStream();
    mediaRecorderRef.current = null;
    setIsRecording(false);
    setIsPaused(false);
    if (pausedAtRef.current !== null) {
      pausedTotalRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }

    enqueueBatch();
    await flushQueue(); // best effort — failed batches stay queued
    await markSession('interrupted');
    stoppingRef.current = false;
    if (reason) onError?.(new Error(reason));
  }, [enqueueBatch, flushQueue, markSession, onError, releaseStream]);

  const startRecording = useCallback(async (): Promise<boolean> => {
    // R1: at most one stream and recorder; duplicate starts are ignored.
    if (startingRef.current || stoppingRef.current || mediaRecorderRef.current) return false;
    startingRef.current = true;
    setIsStarting(true);
    setError(null);
    setSaveError(null);

    try {
      const session = await getSession(sessionId);
      if (!session) {
        throw new Error('This session no longer exists. Nothing was captured.');
      }

      // R7: continue after the last stored chunk; never overwrite saved audio.
      const existing = await getAudioChunks(sessionId);
      const sorted = [...existing].sort((a, b) => a.chunkIndex - b.chunkIndex);
      chunkIndexRef.current = nextChunkIndex(sorted);
      baseOffsetRef.current = resumeOffsetMs(sorted);

      if (typeof MediaRecorder === 'undefined') {
        throw new Error('Audio recording is not supported in this browser.');
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        throw new Error('Microphone access was not granted. Allow the microphone and try again.');
      }
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      let mediaRecorder: MediaRecorder;
      try {
        mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch {
        releaseStream();
        throw new Error('This device cannot record audio in a supported format.');
      }
      recorderMimeRef.current = mimeType || mediaRecorder.mimeType || 'audio/webm';
      mediaRecorderRef.current = mediaRecorder;

      // R2: the session activation write is part of startup; if it is rejected
      // nothing is captured and no recording state is shown.
      try {
        await saveSession({ ...session, status: 'active', updatedAt: new Date() });
      } catch {
        releaseStream();
        mediaRecorderRef.current = null;
        throw new Error('Could not mark this session as recording. Nothing was captured.');
      }

      chunksRef.current = [];
      sessionStartRef.current = Date.now();
      chunkStartRef.current = Date.now();
      pausedTotalRef.current = 0;
      pausedAtRef.current = null;
      queueRef.current = new RecordingWriteQueue(saveAudioChunk);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      mediaRecorder.onstop = () => {
        stopDataResolveRef.current?.();
      };

      // R3: persist a batch periodically; writes are serialized by the queue.
      chunkTimerRef.current = window.setInterval(() => {
        if (chunksRef.current.length > 0) {
          enqueueBatch();
          void flushQueue();
        }
      }, CHUNK_DURATION_MS);

      mediaRecorder.start(1000); // collect data every second
      setIsRecording(true);
      setIsPaused(false);

      // R6: a dead microphone track stops capture safely.
      stream.getTracks().forEach(track => {
        track.addEventListener('ended', () => {
          void interruptCapture('Microphone stopped responding. Recording stopped safely.');
        });
      });

      // R6: leaving the foreground stops capture; recovery is explicit.
      visibilityHandlerRef.current = () => {
        if (document.visibilityState === 'hidden') {
          void interruptCapture('Recording stopped because the app left the foreground. Your saved audio is safe.');
        }
      };
      document.addEventListener('visibilitychange', visibilityHandlerRef.current);

      return true;
    } catch (err) {
      reportError(err, 'Failed to start recording');
      releaseStream();
      mediaRecorderRef.current = null;
      return false;
    } finally {
      startingRef.current = false;
      setIsStarting(false);
    }
  }, [sessionId, enqueueBatch, flushQueue, interruptCapture, releaseStream, reportError]);

  const stopRecording = useCallback(async (): Promise<boolean> => {
    const rec = mediaRecorderRef.current;
    if (!rec || stoppingRef.current) return false;
    stoppingRef.current = true;

    // R5: finalization waits for final data delivery.
    const stopped = new Promise<void>(resolve => { stopDataResolveRef.current = resolve; });
    try {
      if (rec.state !== 'inactive') rec.stop();
    } catch { /* already inactive */ }
    await stopped;
    stopDataResolveRef.current = null;

    if (chunkTimerRef.current) {
      clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
    if (visibilityHandlerRef.current) {
      document.removeEventListener('visibilitychange', visibilityHandlerRef.current);
      visibilityHandlerRef.current = null;
    }
    releaseStream();
    mediaRecorderRef.current = null;
    setIsRecording(false);
    setIsPaused(false);
    if (pausedAtRef.current !== null) {
      pausedTotalRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }

    enqueueBatch();
    const ok = await flushQueue();
    if (ok) {
      setPendingBatches(0);
      await markSession('closed', { totalDurationMs: totalDuration() });
      stoppingRef.current = false;
      return true;
    }
    // R5: keep pending bytes; the session stays recoverable, no navigation.
    await markSession('interrupted');
    stoppingRef.current = false;
    return false;
  }, [enqueueBatch, flushQueue, markSession, releaseStream, totalDuration]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      pausedAtRef.current = Date.now();
      setIsPaused(true);
    }
  }, [isRecording, isPaused]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      if (pausedAtRef.current !== null) {
        pausedTotalRef.current += Date.now() - pausedAtRef.current;
        pausedAtRef.current = null;
      }
      setIsPaused(false);
    }
  }, [isRecording, isPaused]);

  /** Retry failed/pending batch(es). Never re-records, never duplicates audio. */
  const retrySave = useCallback(async (): Promise<boolean> => {
    const queue = queueRef.current;
    if (!queue) return true;
    const ok = await flushQueue();
    return ok;
  }, [flushQueue]);

  // Cleanup on unmount: stop foreground capture and release the microphone.
  useEffect(() => {
    return () => {
      if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);
      if (visibilityHandlerRef.current) {
        document.removeEventListener('visibilitychange', visibilityHandlerRef.current);
      }
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== 'inactive') {
        try { rec.stop(); } catch { /* ignore */ }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      mediaRecorderRef.current = null;
    };
  }, []);

  return {
    isRecording,
    isStarting,
    isPaused,
    elapsedMs,
    error,
    saveError,
    pendingBatches,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    retrySave,
  };
}
