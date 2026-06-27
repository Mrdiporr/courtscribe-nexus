// Per-device consent + sync-mode management.
// Mirrors public.sync_consent rows so each device can be configured independently.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getDeviceId, getDeviceLabel } from '@/lib/deviceId';

export type DeviceSyncMode = 'online' | 'offline' | 'ask';

export interface DeviceConsentRow {
  id: string;
  device_id: string;
  device_label: string | null;
  consented: boolean;
  sync_mode: DeviceSyncMode;
  consented_at: string | null;
  updated_at: string;
}

export function useDeviceConsent() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<DeviceConsentRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('sync_consent')
      .select('id, device_id, device_label, consented, sync_mode, consented_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (!error && data) setDevices(data as DeviceConsentRow[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const upsertCurrentDevice = useCallback(async (mode: DeviceSyncMode, consented: boolean) => {
    if (!user?.id) return null;
    const deviceId = getDeviceId();
    const label = getDeviceLabel();
    const { data, error } = await supabase
      .from('sync_consent')
      .upsert(
        {
          user_id: user.id,
          device_id: deviceId,
          device_label: label,
          sync_mode: mode,
          consented,
          consented_at: consented ? new Date().toISOString() : null,
        },
        { onConflict: 'user_id,device_id' }
      )
      .select()
      .single();
    if (!error) await load();
    return data;
  }, [user, load]);

  const updateDeviceMode = useCallback(async (deviceId: string, mode: DeviceSyncMode) => {
    if (!user?.id) return;
    await supabase
      .from('sync_consent')
      .update({ sync_mode: mode, consented: mode !== 'offline' })
      .eq('user_id', user.id)
      .eq('device_id', deviceId);
    await load();
  }, [user, load]);

  const revokeDevice = useCallback(async (deviceId: string) => {
    if (!user?.id) return;
    await supabase
      .from('sync_consent')
      .delete()
      .eq('user_id', user.id)
      .eq('device_id', deviceId);
    await load();
  }, [user, load]);

  const renameDevice = useCallback(async (deviceId: string, label: string) => {
    if (!user?.id) return;
    await supabase
      .from('sync_consent')
      .update({ device_label: label })
      .eq('user_id', user.id)
      .eq('device_id', deviceId);
    await load();
  }, [user, load]);

  return {
    devices,
    loading,
    currentDeviceId: getDeviceId(),
    currentDeviceLabel: getDeviceLabel(),
    refresh: load,
    upsertCurrentDevice,
    updateDeviceMode,
    revokeDevice,
    renameDevice,
  };
}
