import { useEffect, useState } from 'react';
import {
  getTranscriptionStatus,
  TRANSCRIPTION_STATUS_EVENT,
  type TranscriptionStatus,
} from '@/lib/transcriptionStatus';

export function useTranscriptionStatus(sessionId: string | undefined) {
  const [status, setStatus] = useState<TranscriptionStatus | undefined>(() =>
    sessionId ? getTranscriptionStatus(sessionId) : undefined
  );

  useEffect(() => {
    if (!sessionId) return;
    const refresh = () => setStatus(getTranscriptionStatus(sessionId));
    refresh();
    window.addEventListener(TRANSCRIPTION_STATUS_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(TRANSCRIPTION_STATUS_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [sessionId]);

  return status;
}
