// Auto-sync hook
// Triggers background sync when online and sync mode is 'online'

import { useEffect, useRef, useCallback } from 'react';
import { useCloudSyncSettings } from '@/hooks/useCloudSyncSettings';
import { useManualSync } from '@/hooks/useManualSync';
import { getTranscriptsNeedingSync } from '@/lib/offlineStorage';

const AUTO_SYNC_INTERVAL_MS = 60_000; // Check every 60 seconds

export function useAutoSync() {
  const { isOnlineMode } = useCloudSyncSettings();
  const { isSyncing, startSync } = useManualSync();
  const intervalRef = useRef<number | null>(null);
  const isSyncingRef = useRef(false);

  // Keep ref in sync to avoid stale closures
  useEffect(() => {
    isSyncingRef.current = isSyncing;
  }, [isSyncing]);

  const attemptAutoSync = useCallback(async () => {
    if (isSyncingRef.current || !navigator.onLine) return;

    try {
      const pending = await getTranscriptsNeedingSync();
      if (pending.length > 0) {
        console.log(`[AutoSync] Found ${pending.length} pending items, syncing...`);
        await startSync('both');
      }
    } catch (error) {
      console.error('[AutoSync] Error during auto-sync check:', error);
    }
  }, [startSync]);

  useEffect(() => {
    if (!isOnlineMode) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Sync immediately when coming online
    const handleOnline = () => {
      console.log('[AutoSync] Back online, triggering sync...');
      attemptAutoSync();
    };

    window.addEventListener('online', handleOnline);

    // Initial sync attempt
    attemptAutoSync();

    // Periodic check
    intervalRef.current = window.setInterval(attemptAutoSync, AUTO_SYNC_INTERVAL_MS);

    return () => {
      window.removeEventListener('online', handleOnline);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isOnlineMode, attemptAutoSync]);

  return { isAutoSyncEnabled: isOnlineMode };
}
