// Transcription hook for audio-to-text with speaker diarization
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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

  // Transcribe audio blob
  const transcribeAudio = useCallback(async (audioBlob: Blob): Promise<TranscriptionResult | null> => {
    setIsTranscribing(true);
    setProgress(10);

    try {
      setProgress(20);
      const [audioBase64, idempotencyKey] = await Promise.all([
        blobToBase64(audioBlob),
        sha256Hex(audioBlob),
      ]);

      setProgress(40);
      console.log('Sending audio for transcription...');

      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: { audio: audioBase64 },
        headers: { 'x-idempotency-key': idempotencyKey },
      });

      if (error) {
        console.error('Transcription error:', error);
        throw new Error(error.message || 'Transcription failed');
      }


      setProgress(80);

      if (!data || data.error) {
        throw new Error(data?.error || 'No transcription data returned');
      }

      const result: TranscriptionResult = {
        text: data.text,
        speakerSegments: data.speakerSegments || [],
        language: data.language,
        duration: data.duration,
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
      
      toast({ description: "Transcription complete" });
      return result;

    } catch (error) {
      console.error('Transcription error:', error);
      toast({
        title: "Transcription Failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
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
