// Global connectivity + auto-sync status.
// Tracks navigator online state, pending offline edits, sync activity, and last sync time.

import { useEffect, useState, useCallback } from 'react';
import { getAllOfflineTranscripts, getAllRecordingSync } from '@/lib/offlineStorage';

export type SyncActivity = 'idle' | 'syncing' | 'completed' | 'error';

export interface ConnectivityStatus {
  online: boolean;
  pendingCount: number;
  activity: SyncActivity;
  lastSyncedAt: Date | null;
  lastMessage?: string;
}

export function useConnectivityStatus(): ConnectivityStatus {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [activity, setActivity] = useState<SyncActivity>('idle');
  const [lastMessage, setLastMessage] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    const [transcripts, recs] = await Promise.all([
      getAllOfflineTranscripts(),
      getAllRecordingSync(),
    ]);
    const pendingT = transcripts.filter(t => t.needsSync).length;
    const pendingR = recs.filter(r => r.needsSync).length;
    setPendingCount(pendingT + pendingR);

    const times: number[] = [];
    for (const t of transcripts) if (t.syncedAt) times.push(new Date(t.syncedAt).getTime());
    for (const r of recs) if (r.syncedAt) times.push(new Date(r.syncedAt).getTime());
    setLastSyncedAt(times.length ? new Date(Math.max(...times)) : null);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onUpdated = () => refresh();
    const onStart = () => setActivity('syncing');
    const onEnd = (e: Event) => {
      const detail = (e as CustomEvent).detail as { status: SyncActivity; message?: string };
      setActivity(detail?.status ?? 'completed');
      setLastMessage(detail?.message);
      refresh();
      // Reset back to idle after a short delay so the banner doesn't stay on error/completed forever.
      window.setTimeout(() => setActivity('idle'), 4000);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('myjuris:sync-updated', onUpdated);
    window.addEventListener('myjuris:sync-start', onStart);
    window.addEventListener('myjuris:sync-end', onEnd);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('myjuris:sync-updated', onUpdated);
      window.removeEventListener('myjuris:sync-start', onStart);
      window.removeEventListener('myjuris:sync-end', onEnd);
    };
  }, [refresh]);

  return { online, pendingCount, activity, lastSyncedAt, lastMessage };
}
