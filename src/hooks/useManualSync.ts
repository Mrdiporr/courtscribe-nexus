// Manual Sync Hook with deterministic conflict resolution
// - Transcripts: compare updated_at + version between local IndexedDB and cloud
//   (latest wins; tie → higher version; tie → remote wins).
// - Speaker segments: replaced atomically when the transcript wins on the push side;
//   pulled fresh when the remote wins.
// - Recordings: uploaded to private bucket, sync timestamp recorded both locally
//   (IndexedDB) and on cloud_sessions.recording_synced_at.

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { getDeviceId } from '@/lib/deviceId';
import {
  getTranscriptsNeedingSync,
  markTranscriptSynced,
  applyRemoteTranscript,
  setRecordingSync,
  addToSyncQueue,
  type OfflineTranscript,
} from '@/lib/offlineStorage';

export type SyncType = 'transcripts' | 'recordings' | 'both';

interface SyncProgress {
  current: number;
  total: number;
  type: SyncType;
  status: 'idle' | 'syncing' | 'completed' | 'error';
  message?: string;
}

function emitSyncUpdated() {
  window.dispatchEvent(new CustomEvent('myjuris:sync-updated'));
}
function emitSyncStart(type: string) {
  window.dispatchEvent(new CustomEvent('myjuris:sync-start', { detail: { type } }));
}
function emitSyncEnd(status: 'completed' | 'error', message?: string) {
  window.dispatchEvent(new CustomEvent('myjuris:sync-end', { detail: { status, message } }));
}


export function useManualSync() {
  const { toast } = useToast();
  const { user } = useAuth();
  const deviceId = getDeviceId();

  const [isSyncing, setIsSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress>({
    current: 0, total: 0, type: 'both', status: 'idle',
  });

  const getCloudSessionId = useCallback(async (localSessionId: string) => {
    const { data, error } = await supabase
      .from('cloud_sessions')
      .select('id')
      .eq('local_id', localSessionId)
      .maybeSingle();
    if (error) { console.error('getCloudSessionId', error); return null; }
    return data?.id || null;
  }, []);

  // ---- Conflict resolution for one transcript ----
  const syncTranscript = useCallback(async (
    local: OfflineTranscript,
    cloudSessionId: string
  ): Promise<{ ok: boolean; resolution: 'pushed' | 'pulled' | 'no-op' | 'failed'; error?: string }> => {
    if (!user?.id) return { ok: false, resolution: 'failed', error: 'Not signed in' };

    try {
      // 1. Fetch remote transcript (if any) for conflict comparison.
      const { data: remote, error: fetchErr } = await supabase
        .from('transcripts')
        .select('id, full_text, language_code, updated_at, version, updated_by_device')
        .eq('session_id', cloudSessionId)
        .maybeSingle();
      if (fetchErr) throw fetchErr;

      const localTs = new Date(local.updatedAt).getTime();
      const remoteTs = remote ? new Date(remote.updated_at).getTime() : 0;
      const localVer = local.version ?? 1;
      const remoteVer = remote?.version ?? 0;

      // Deterministic rule: newer updated_at wins; on tie, higher version wins; on tie, remote wins.
      const remoteWins =
        !!remote && (
          remoteTs > localTs ||
          (remoteTs === localTs && remoteVer > localVer)
        );

      if (remoteWins && remote.updated_by_device !== deviceId) {
        // Pull remote → IndexedDB
        const { data: segs } = await supabase
          .from('speaker_segments')
          .select('*')
          .eq('transcript_id', remote.id)
          .order('segment_index', { ascending: true });

        await applyRemoteTranscript({
          id: local.id,
          sessionId: local.sessionId,
          caseNumber: local.caseNumber,
          fullText: remote.full_text,
          languageCode: remote.language_code,
          createdAt: local.createdAt,
          updatedAt: new Date(remote.updated_at),
          syncedAt: new Date(),
          needsSync: false,
          version: remoteVer,
          updatedByDevice: remote.updated_by_device ?? undefined,
          segments: (segs ?? []).map((s: any) => ({
            id: s.id,
            speakerId: s.speaker_id,
            speakerLabel: s.speaker_label,
            text: s.text,
            startMs: Number(s.start_ms),
            endMs: Number(s.end_ms),
            segmentIndex: s.segment_index,
            updatedAt: s.updated_at ? new Date(s.updated_at) : undefined,
            updatedByDevice: s.updated_by_device ?? undefined,
          })),
        });
        return { ok: true, resolution: 'pulled' };
      }

      // Otherwise push local → cloud.
      const nextVersion = Math.max(localVer, remoteVer) + (remote ? 1 : 0);

      const { data: tr, error: upErr } = await supabase
        .from('transcripts')
        .upsert({
          session_id: cloudSessionId,
          full_text: local.fullText,
          language_code: local.languageCode,
          user_id: user.id,
          updated_by_device: deviceId,
          version: nextVersion || localVer,
          updated_at: new Date(local.updatedAt).toISOString(),
        }, { onConflict: 'session_id' })
        .select('id')
        .single();
      if (upErr) throw upErr;

      if (local.segments?.length) {
        await supabase.from('speaker_segments').delete().eq('transcript_id', tr.id);
        const rows = local.segments.map(seg => ({
          transcript_id: tr.id,
          speaker_id: seg.speakerId,
          speaker_label: seg.speakerLabel,
          text: seg.text,
          start_ms: seg.startMs,
          end_ms: seg.endMs,
          segment_index: seg.segmentIndex,
          updated_by_device: deviceId,
        }));
        const { error: segErr } = await supabase.from('speaker_segments').insert(rows);
        if (segErr) throw segErr;
      }

      await markTranscriptSynced(local.id);
      return { ok: true, resolution: 'pushed' };
    } catch (err: any) {
      console.error('syncTranscript failed', err);
      await markTranscriptSynced(local.id, { error: err?.message ?? 'sync failed' });
      return { ok: false, resolution: 'failed', error: err?.message };
    }
  }, [user, deviceId]);

  const syncTranscripts = useCallback(async () => {
    const items = await getTranscriptsNeedingSync();
    let success = 0, failed = 0;
    for (let i = 0; i < items.length; i++) {
      setProgress(p => ({ ...p, current: i + 1, total: items.length, message: `Transcript ${i + 1} of ${items.length}` }));
      const cloudId = await getCloudSessionId(items[i].sessionId);
      if (!cloudId) { failed++; continue; }
      const res = await syncTranscript(items[i], cloudId);
      res.ok ? success++ : failed++;
    }
    emitSyncUpdated();
    return { success, failed };
  }, [syncTranscript, getCloudSessionId]);

  const syncRecordings = useCallback(async () => {
    let success = 0, failed = 0;
    if (!user?.id) return { success, failed };
    const { getAllSessions, getAudioChunks } = await import('@/lib/storage');
    const sessions = await getAllSessions();
    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      setProgress(p => ({ ...p, current: i + 1, total: sessions.length, message: `Recording ${i + 1} of ${sessions.length}` }));
      try {
        const chunks = await getAudioChunks(session.id);
        if (!chunks.length) continue;
        const blob = new Blob(chunks.map(c => c.blob), { type: 'audio/webm' });
        const filePath = `${user.id}/sessions/${session.id}/recording.webm`;
        const { error: upErr } = await supabase.storage
          .from('recordings')
          .upload(filePath, blob, { cacheControl: '3600', upsert: true, contentType: 'audio/webm' });
        if (upErr) {
          console.error('Upload error', session.id, upErr);
          await setRecordingSync({ sessionId: session.id, syncedAt: null, sizeBytes: blob.size, needsSync: true, lastError: upErr.message });
          failed++;
          continue;
        }
        const now = new Date();
        const cloudId = await getCloudSessionId(session.id);
        if (cloudId) {
          await supabase.from('cloud_sessions').update({
            recording_synced_at: now.toISOString(),
            recording_size_bytes: blob.size,
          }).eq('id', cloudId);
        }
        await setRecordingSync({ sessionId: session.id, syncedAt: now, sizeBytes: blob.size, needsSync: false });
        success++;
      } catch (err: any) {
        console.error('syncRecordings session failure', session.id, err);
        await setRecordingSync({ sessionId: session.id, syncedAt: null, sizeBytes: 0, needsSync: true, lastError: err?.message });
        failed++;
      }
    }
    emitSyncUpdated();
    return { success, failed };
  }, [user, getCloudSessionId]);

  const startSync = useCallback(async (type: SyncType) => {
    if (isSyncing) return;
    setIsSyncing(true);
    setProgress({ current: 0, total: 0, type, status: 'syncing', message: 'Starting sync…' });
    try {
      let tr = { success: 0, failed: 0 };
      let rec = { success: 0, failed: 0 };
      if (type === 'transcripts' || type === 'both') {
        setProgress(p => ({ ...p, message: 'Syncing transcripts…' }));
        tr = await syncTranscripts();
      }
      if (type === 'recordings' || type === 'both') {
        setProgress(p => ({ ...p, message: 'Syncing recordings…' }));
        rec = await syncRecordings();
      }
      const ok = tr.success + rec.success;
      const ko = tr.failed + rec.failed;
      setProgress({
        current: ok + ko, total: ok + ko, type,
        status: ko > 0 ? 'error' : 'completed',
        message: ko > 0 ? `Completed with ${ko} error(s)` : 'Sync completed',
      });
      toast({
        description: `Synced ${ok} item(s)${ko > 0 ? `, ${ko} failed` : ''}`,
        variant: ko > 0 ? 'destructive' : 'default',
      });
    } catch (err) {
      console.error('startSync', err);
      setProgress(p => ({ ...p, status: 'error', message: 'Sync failed' }));
      toast({ title: 'Sync Failed', description: 'An error occurred during sync.', variant: 'destructive' });
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, syncTranscripts, syncRecordings, toast]);

  const queueSync = useCallback(async (sessionId: string, type: SyncType) => {
    const mapped = type === 'both' ? 'both' : type === 'transcripts' ? 'transcript' : 'recording';
    await addToSyncQueue({ type: mapped, sessionId });
    toast({ description: 'Added to sync queue' });
  }, [toast]);

  return { isSyncing, progress, startSync, queueSync, syncTranscripts, syncRecordings };
}
