// Manual Sync Hook
// Handles manual syncing of transcripts and recordings to cloud

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { 
  getTranscriptsNeedingSync, 
  markTranscriptSynced,
  addToSyncQueue,
  updateSyncQueueItem,
  removeSyncQueueItem,
  getPendingSyncItems,
  type OfflineTranscript,
  type SyncQueue
} from '@/lib/offlineStorage';
import { getAudioChunks } from '@/lib/storage';

export type SyncType = 'transcripts' | 'recordings' | 'both';

interface SyncProgress {
  current: number;
  total: number;
  type: SyncType;
  status: 'idle' | 'syncing' | 'completed' | 'error';
  message?: string;
}

export function useManualSync() {
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress>({
    current: 0,
    total: 0,
    type: 'both',
    status: 'idle',
  });

  // Sync a single transcript to cloud
  const syncTranscript = useCallback(async (transcript: OfflineTranscript, cloudSessionId: string): Promise<boolean> => {
    try {
      // First, create or update the transcript
      const { data: transcriptData, error: transcriptError } = await supabase
        .from('transcripts')
        .upsert({
          session_id: cloudSessionId,
          full_text: transcript.fullText,
          language_code: transcript.languageCode,
        }, { onConflict: 'session_id' })
        .select()
        .single();

      if (transcriptError) throw transcriptError;

      // Then sync speaker segments
      if (transcript.segments && transcript.segments.length > 0) {
        const segmentsToInsert = transcript.segments.map(seg => ({
          transcript_id: transcriptData.id,
          speaker_id: seg.speakerId,
          speaker_label: seg.speakerLabel,
          text: seg.text,
          start_ms: seg.startMs,
          end_ms: seg.endMs,
          segment_index: seg.segmentIndex,
        }));

        // Delete existing segments first
        await supabase
          .from('speaker_segments')
          .delete()
          .eq('transcript_id', transcriptData.id);

        // Insert new segments
        const { error: segmentsError } = await supabase
          .from('speaker_segments')
          .insert(segmentsToInsert);

        if (segmentsError) throw segmentsError;
      }

      // Mark transcript as synced locally
      await markTranscriptSynced(transcript.id);
      return true;
    } catch (error) {
      console.error('Error syncing transcript:', error);
      return false;
    }
  }, []);

  // Get cloud session ID for a local session
  const getCloudSessionId = useCallback(async (localSessionId: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase
        .from('cloud_sessions')
        .select('id')
        .eq('local_id', localSessionId)
        .single();

      if (error) throw error;
      return data?.id || null;
    } catch (error) {
      console.error('Error getting cloud session:', error);
      return null;
    }
  }, []);

  // Sync all pending transcripts
  const syncTranscripts = useCallback(async (): Promise<{ success: number; failed: number }> => {
    const transcripts = await getTranscriptsNeedingSync();
    let success = 0;
    let failed = 0;

    for (let i = 0; i < transcripts.length; i++) {
      const transcript = transcripts[i];
      setProgress(prev => ({
        ...prev,
        current: i + 1,
        total: transcripts.length,
        message: `Syncing transcript ${i + 1} of ${transcripts.length}...`,
      }));

      const cloudSessionId = await getCloudSessionId(transcript.sessionId);
      if (cloudSessionId) {
        const synced = await syncTranscript(transcript, cloudSessionId);
        if (synced) {
          success++;
        } else {
          failed++;
        }
      } else {
        failed++;
      }
    }

    return { success, failed };
  }, [syncTranscript, getCloudSessionId]);

  // Sync recordings (audio chunks) to cloud storage
  const syncRecordings = useCallback(async (): Promise<{ success: number; failed: number }> => {
    let success = 0;
    let failed = 0;

    try {
      // Get all local sessions
      const { getAllSessions, getAudioChunks } = await import('@/lib/storage');
      const sessions = await getAllSessions();

      for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i];
        setProgress(prev => ({
          ...prev,
          current: i + 1,
          total: sessions.length,
          message: `Syncing recording ${i + 1} of ${sessions.length}...`,
        }));

        try {
          const chunks = await getAudioChunks(session.id);
          if (chunks.length === 0) continue;

          // Combine all chunks into a single blob
          const audioBlob = new Blob(
            chunks.map(c => c.blob),
            { type: 'audio/webm' }
          );

          const filePath = `sessions/${session.id}/recording.webm`;

          // Upload to storage bucket
          const { error: uploadError } = await supabase.storage
            .from('recordings')
            .upload(filePath, audioBlob, {
              cacheControl: '3600',
              upsert: true,
              contentType: 'audio/webm',
            });

          if (uploadError) {
            console.error('Upload error for session', session.id, uploadError);
            failed++;
          } else {
            success++;
          }
        } catch (err) {
          console.error('Error syncing recording for session', session.id, err);
          failed++;
        }
      }
    } catch (error) {
      console.error('Error in syncRecordings:', error);
    }

    return { success, failed };
  }, []);

  // Main sync function
  const startSync = useCallback(async (type: SyncType) => {
    if (isSyncing) return;

    setIsSyncing(true);
    setProgress({
      current: 0,
      total: 0,
      type,
      status: 'syncing',
      message: 'Starting sync...',
    });

    try {
      let transcriptResults = { success: 0, failed: 0 };
      let recordingResults = { success: 0, failed: 0 };

      if (type === 'transcripts' || type === 'both') {
        setProgress(prev => ({ ...prev, message: 'Syncing transcripts...' }));
        transcriptResults = await syncTranscripts();
      }

      if (type === 'recordings' || type === 'both') {
        setProgress(prev => ({ ...prev, message: 'Syncing recordings...' }));
        recordingResults = await syncRecordings();
      }

      const totalSuccess = transcriptResults.success + recordingResults.success;
      const totalFailed = transcriptResults.failed + recordingResults.failed;

      setProgress({
        current: totalSuccess + totalFailed,
        total: totalSuccess + totalFailed,
        type,
        status: totalFailed > 0 ? 'error' : 'completed',
        message: totalFailed > 0 
          ? `Completed with ${totalFailed} error(s)` 
          : 'Sync completed successfully',
      });

      toast({
        description: `Synced ${totalSuccess} item(s)${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`,
        variant: totalFailed > 0 ? 'destructive' : 'default',
      });
    } catch (error) {
      console.error('Sync error:', error);
      setProgress(prev => ({
        ...prev,
        status: 'error',
        message: 'Sync failed. Please try again.',
      }));
      toast({
        title: 'Sync Failed',
        description: 'An error occurred during sync. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, syncTranscripts, syncRecordings, toast]);

  // Queue a sync for later
  const queueSync = useCallback(async (sessionId: string, type: SyncType) => {
    const mappedType = type === 'both' ? 'both' : type === 'transcripts' ? 'transcript' : 'recording';
    await addToSyncQueue({
      type: mappedType,
      sessionId,
    });
    toast({ description: 'Added to sync queue' });
  }, [toast]);

  return {
    isSyncing,
    progress,
    startSync,
    queueSync,
    syncTranscripts,
    syncRecordings,
  };
}
