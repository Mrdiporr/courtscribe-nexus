import { useEffect, useState } from 'react';
import {
  getTranscriptionStatus,
  reconcileStaleStatuses,
  TRANSCRIPTION_STATUS_EVENT,
  type TranscriptionStatus,
} from '@/lib/transcriptionStatus';

export function useTranscriptionStatus(sessionId: string | undefined) {
  const [status, setStatus] = useState<TranscriptionStatus | undefined>(() => {
    if (!sessionId) return undefined;
    reconcileStaleStatuses();
    return getTranscriptionStatus(sessionId);
  });

  useEffect(() => {
    if (!sessionId) return;
    const refresh = () => {
      reconcileStaleStatuses();
      setStatus(getTranscriptionStatus(sessionId));
    };
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
