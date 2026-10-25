// Transcription hook for audio-to-text with speaker diarization
// Recovery-safe: explicit intent, preflight validation, incremental attempts,
// sanitized errors, and separation of "received" from "durable saved".

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  setTranscriptionStatus,
  getTranscriptionStatus,
} from '@/lib/transcriptionStatus';

const MIN_AUDIO_BYTES = 1024; // refuse near-empty audio before any invocation
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MiB payload cap

export interface SpeakerSegment {
  id: string;
  speakerId: string;
  speakerLabel: string;
  segmentIndex: number;
  text: string;
  startMs: number;
  endMs: number;
}

export interface TranscriptionResult {
  text: string;
  speakerSegments: SpeakerSegment[];
  language?: string;
  duration?: number;
}

/** Safe, bounded user-facing error. Never leaks provider/database details. */
function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : '';
  if (/network|fetch|Failed to fetch|NetworkError/i.test(raw)) {
    return 'Could not reach the transcription service. Check your connection and retry.';
  }
  if (/401|JWT|session/i.test(raw)) {
    return 'Sign in again, then retry transcription.';
  }
  if (/429|rate|too many/i.test(raw)) {
    return 'The transcription service is busy. Wait a moment and retry.';
  }
  return 'Transcription failed. Your recording and any existing transcript are safe.';
}

export function useTranscription() {
  const { toast } = useToast();
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);
  const [speakerLabels, setSpeakerLabels] = useState<Record<string, string>>({});

  // Convert blob to base64
  const blobToBase64 = useCallback((blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }, []);

  // Compute a stable idempotency key from the audio bytes so retries of the
  // exact same recording are deduplicated server-side.
  const sha256Hex = useCallback(async (blob: Blob): Promise<string> => {
    const buf = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  }, []);

  // Transcribe audio blob. Optional sessionId enables per-session status
  // tracking so UI can surface queued / in-flight / deduped / failed states.
  // Retries reuse the same audio identity and increment the attempt counter.
  const transcribeAudio = useCallback(async (
    audioBlob: Blob,
    opts: { sessionId?: string } = {},
  ): Promise<TranscriptionResult | null> => {
    const { sessionId } = opts;
    const bumpStatus = (patch: Parameters<typeof setTranscriptionStatus>[1]) => {
      if (sessionId) setTranscriptionStatus(sessionId, patch);
    };

    // Preflight: no invocation, nothing changes, audio is preserved.
    if (!audioBlob || audioBlob.size < MIN_AUDIO_BYTES) {
      toast({
        title: 'Cannot transcribe',
        description: 'This recording is too short to transcribe. Nothing was sent.',
        variant: 'destructive',
      });
      return null;
    }
    if (audioBlob.size > MAX_AUDIO_BYTES) {
      toast({
        title: 'Cannot transcribe',
        description: 'This recording is too large to send for transcription (over 25 MB).',
        variant: 'destructive',
      });
      return null;
    }

    setIsTranscribing(true);
    setProgress(10);

    // Each invocation is one attempt; retries increment, never loop.
    const prevStatus = sessionId ? getTranscriptionStatus(sessionId) : undefined;
    const attempt = (prevStatus?.attempt ?? 0) + 1;

    try {
      setProgress(20);
      const [audioBase64, idempotencyKey] = await Promise.all([
        blobToBase64(audioBlob),
        sha256Hex(audioBlob),
      ]);

      // Mark queued (post-hash, pre-network) so the UI can show progress.
      bumpStatus({ state: 'queued', idempotencyKey, lastError: undefined });

      setProgress(40);
      bumpStatus({
        state: 'in-flight',
        idempotencyKey,
        attempt,
        lastError: undefined,
      });

      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: { audio: audioBase64 },
        headers: { 'x-idempotency-key': idempotencyKey },
      });

      if (error) {
        throw new Error(error.message || 'Transcription failed');
      }

      setProgress(80);

      if (!data || data.error) {
        throw new Error(data?.error || 'No transcription data returned');
      }

      // Validate the response before displaying or storing anything.
      const rawText = typeof data.text === 'string' ? data.text : '';
      const rawSegments = Array.isArray(data.speakerSegments) ? data.speakerSegments : [];
      const validSegments = rawSegments.filter((seg: unknown) => {
        const s = seg as { text?: unknown; startMs?: unknown; endMs?: unknown };
        return (
          typeof s?.text === 'string' &&
          typeof s?.startMs === 'number' && Number.isFinite(s.startMs) && s.startMs >= 0 &&
          typeof s?.endMs === 'number' && Number.isFinite(s.endMs) && s.endMs >= s.startMs
        );
      });
      if (!rawText.trim() && validSegments.length === 0) {
        throw new Error('The transcription service returned no usable text.');
      }

      const result: TranscriptionResult = {
        text: rawText,
        speakerSegments: validSegments.map((seg: Record<string, unknown>, i: number) => ({
          id: typeof seg.id === 'string' ? seg.id : `seg_${i}`,
          speakerId: typeof seg.speakerId === 'string' ? seg.speakerId : `speaker_${i}`,
          speakerLabel: typeof seg.speakerLabel === 'string' ? seg.speakerLabel : `Speaker ${i + 1}`,
          segmentIndex: typeof seg.segmentIndex === 'number' ? seg.segmentIndex : i,
          text: seg.text as string,
          startMs: seg.startMs as number,
          endMs: seg.endMs as number,
        })),
        language: typeof data.language === 'string' ? data.language : undefined,
        duration: typeof data.duration === 'number' ? data.duration : undefined,
      };

      // Initialize speaker labels
      const labels: Record<string, string> = {};
      result.speakerSegments.forEach(seg => {
        if (!labels[seg.speakerId]) {
          labels[seg.speakerId] = seg.speakerLabel;
        }
      });
      setSpeakerLabels(labels);

      setTranscription(result);
      setProgress(100);

      // Network success — durable completion is claimed only after the local
      // save commits (Review page downgrades this to 'received' on failure).
      bumpStatus({
        state: data.idempotent ? 'deduped' : 'completed',
        idempotencyKey,
        attempt,
        lastError: undefined,
      });

      toast({
        description: data.idempotent
          ? 'Transcription reused (deduped)'
          : 'Transcription complete',
      });
      return result;

    } catch (error) {
      const message = safeErrorMessage(error);
      bumpStatus({ state: 'failed', lastError: message, attempt });
      toast({
        title: 'Transcription Failed',
        description: message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsTranscribing(false);
    }
  }, [blobToBase64, sha256Hex, toast]);

  // Update speaker label - this updates all segments with that speaker ID
  const updateSpeakerLabel = useCallback((speakerId: string, newLabel: string) => {
    setSpeakerLabels(prev => ({
      ...prev,
      [speakerId]: newLabel,
    }));

    // Update the transcription segments with the new label
    setTranscription(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        speakerSegments: prev.speakerSegments.map(seg =>
          seg.speakerId === speakerId
            ? { ...seg, speakerLabel: newLabel }
            : seg
        ),
      };
    });
  }, []);

  // Get label for a speaker
  const getSpeakerLabel = useCallback((speakerId: string): string => {
    return speakerLabels[speakerId] || speakerId;
  }, [speakerLabels]);

  // Clear transcription
  const clearTranscription = useCallback(() => {
    setTranscription(null);
    setSpeakerLabels({});
    setProgress(0);
  }, []);

  return {
    isTranscribing,
    progress,
    transcription,
    speakerLabels,
    transcribeAudio,
    updateSpeakerLabel,
    getSpeakerLabel,
    clearTranscription,
    setTranscription,
  };
}
