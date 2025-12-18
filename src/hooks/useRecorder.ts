// Audio recording hook with chunked capture
// Offline-first, crash-safe design

import { useState, useRef, useCallback, useEffect } from 'react';
import { saveAudioChunk, saveSession, getSession } from '@/lib/storage';
import type { Session, AudioChunk } from '@/types/session';

const CHUNK_DURATION_MS = 30000; // 30 second chunks for crash safety

interface UseRecorderOptions {
  sessionId: string;
  onError?: (error: Error) => void;
}

interface UseRecorderReturn {
  isRecording: boolean;
  isPaused: boolean;
  elapsedMs: number;
  error: Error | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
}

export function useRecorder({ sessionId, onError }: UseRecorderOptions): UseRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkIndexRef = useRef(0);
  const sessionStartRef = useRef<number>(0);
  const chunkStartRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Update elapsed time
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - sessionStartRef.current);
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

  const saveChunk = useCallback(async (blob: Blob) => {
    if (blob.size === 0) return;

    const chunk: AudioChunk = {
      id: `${sessionId}_chunk_${chunkIndexRef.current}`,
      sessionId,
      chunkIndex: chunkIndexRef.current,
      createdAt: new Date(),
      durationMs: Date.now() - chunkStartRef.current,
      startOffsetMs: chunkStartRef.current - sessionStartRef.current,
      blob,
    };

    try {
      await saveAudioChunk(chunk);
      chunkIndexRef.current += 1;
      chunkStartRef.current = Date.now();
      chunksRef.current = [];
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to save audio chunk');
      setError(error);
      onError?.(error);
    }
  }, [sessionId, onError]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
          ? 'audio/webm;codecs=opus' 
          : 'audio/webm',
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      chunkIndexRef.current = 0;
      sessionStartRef.current = Date.now();
      chunkStartRef.current = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // Save chunks periodically for crash safety
      const chunkInterval = setInterval(() => {
        if (chunksRef.current.length > 0 && isRecording) {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          saveChunk(blob);
        }
      }, CHUNK_DURATION_MS);

      mediaRecorder.onstop = async () => {
        clearInterval(chunkInterval);
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          await saveChunk(blob);
        }
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setIsPaused(false);

      // Update session status
      const session = await getSession(sessionId);
      if (session) {
        await saveSession({ ...session, status: 'active', updatedAt: new Date() });
      }

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to start recording');
      setError(error);
      onError?.(error);
    }
  }, [sessionId, saveChunk, onError, isRecording]);

  const stopRecording = useCallback(async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      setIsRecording(false);
      setIsPaused(false);

      // Update session
      const session = await getSession(sessionId);
      if (session) {
        await saveSession({
          ...session,
          status: 'closed',
          updatedAt: new Date(),
          totalDurationMs: Date.now() - sessionStartRef.current,
        });
      }
    }
  }, [isRecording, sessionId]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  }, [isRecording, isPaused]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    }
  }, [isRecording, isPaused]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [isRecording]);

  return {
    isRecording,
    isPaused,
    elapsedMs,
    error,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
  };
}
