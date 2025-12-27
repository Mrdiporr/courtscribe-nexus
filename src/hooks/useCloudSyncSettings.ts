// Cloud Sync Settings Hook
// Manages cloud sync consent and offline mode preferences

import { useState, useEffect, useCallback } from 'react';

const SYNC_MODE_KEY = 'cloudSyncMode';

export type SyncMode = 'online' | 'offline' | 'ask';

export function useCloudSyncSettings() {
  const [syncMode, setSyncModeState] = useState<SyncMode>(() => {
    const stored = localStorage.getItem(SYNC_MODE_KEY);
    return (stored as SyncMode) || 'ask'; // Default to ask
  });

  useEffect(() => {
    localStorage.setItem(SYNC_MODE_KEY, syncMode);
  }, [syncMode]);

  const setSyncMode = useCallback((mode: SyncMode) => {
    setSyncModeState(mode);
  }, []);

  const isOnlineMode = syncMode === 'online';
  const isOfflineMode = syncMode === 'offline';
  const shouldAsk = syncMode === 'ask';

  return {
    syncMode,
    setSyncMode,
    isOnlineMode,
    isOfflineMode,
    shouldAsk,
  };
}

// Static getter for non-hook contexts
export function getSyncMode(): SyncMode {
  const stored = localStorage.getItem(SYNC_MODE_KEY);
  return (stored as SyncMode) || 'ask';
}
