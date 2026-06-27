// Per-session sync status reader (transcript + recording)
import { useEffect, useState, useCallback } from 'react';
import { getOfflineTranscript, getRecordingSync } from '@/lib/offlineStorage';
import { useCloudSyncSettings } from '@/hooks/useCloudSyncSettings';
import type { SyncState } from '@/components/SyncBadge';

export interface SessionSyncStatus {
  transcript: { state: SyncState; lastSyncedAt: Date | null; hasTranscript: boolean };
  recording: { state: SyncState; lastSyncedAt: Date | null };
}

function resolveState(opts: {
  exists: boolean;
  needsSync: boolean;
  syncedAt?: Date | null;
  error?: string;
  offlineMode: boolean;
}): SyncState {
  if (!opts.exists) return 'unknown';
  if (opts.error) return 'error';
  if (opts.offlineMode && !opts.syncedAt) return 'offline-only';
  if (opts.needsSync) return 'pending';
  if (opts.syncedAt) return 'synced';
  return 'unknown';
}

export function useSessionSyncStatus(sessionId: string | undefined) {
  const { isOfflineMode } = useCloudSyncSettings();
  const [status, setStatus] = useState<SessionSyncStatus | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    const [t, r] = await Promise.all([
      getOfflineTranscript(sessionId),
      getRecordingSync(sessionId),
    ]);
    setStatus({
      transcript: {
        hasTranscript: !!t,
        lastSyncedAt: t?.syncedAt ? new Date(t.syncedAt) : null,
        state: resolveState({
          exists: !!t,
          needsSync: !!t?.needsSync,
          syncedAt: t?.syncedAt ?? null,
          error: t?.lastSyncError,
          offlineMode: isOfflineMode,
        }),
      },
      recording: {
        lastSyncedAt: r?.syncedAt ? new Date(r.syncedAt) : null,
        state: resolveState({
          exists: true,
          needsSync: r ? r.needsSync : true,
          syncedAt: r?.syncedAt ?? null,
          error: r?.lastError,
          offlineMode: isOfflineMode,
        }),
      },
    });
  }, [sessionId, isOfflineMode]);

  useEffect(() => { refresh(); }, [refresh]);

  // Refresh when other tabs/hooks signal a sync completed
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener('myjuris:sync-updated', handler);
    return () => window.removeEventListener('myjuris:sync-updated', handler);
  }, [refresh]);

  return { status, refresh };
}
