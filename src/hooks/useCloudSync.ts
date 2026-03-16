// Cloud sync hook with consent management
// Local-first with optional cloud backup

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

const DEVICE_ID_KEY = 'mybarrister_device_id';
const SYNC_CONSENT_KEY = 'mybarrister_sync_consent';

export function useCloudSync() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [hasConsent, setHasConsent] = useState<boolean | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showConsentPrompt, setShowConsentPrompt] = useState(false);

  // Get or create device ID
  const getDeviceId = useCallback(() => {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  }, []);

  // Load consent status
  useEffect(() => {
    const consent = localStorage.getItem(SYNC_CONSENT_KEY);
    if (consent === 'true') {
      setHasConsent(true);
    } else if (consent === 'false') {
      setHasConsent(false);
    } else {
      setHasConsent(null); // Not yet asked
    }
  }, []);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Show consent prompt if not yet asked
      if (hasConsent === null) {
        setShowConsentPrompt(true);
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check on mount
    if (navigator.onLine && hasConsent === null) {
      setShowConsentPrompt(true);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [hasConsent]);

  // Grant consent
  const grantConsent = useCallback(async () => {
    localStorage.setItem(SYNC_CONSENT_KEY, 'true');
    setHasConsent(true);
    setShowConsentPrompt(false);

    const deviceId = getDeviceId();
    try {
      await supabase.from('sync_consent').upsert({
        device_id: deviceId,
        consented: true,
        consented_at: new Date().toISOString(),
      }, { onConflict: 'device_id' });
      
      toast({ description: "Cloud sync enabled. Your data will be backed up." });
    } catch (error) {
      console.error('Error saving consent:', error);
    }
  }, [getDeviceId, toast]);

  // Deny consent
  const denyConsent = useCallback(() => {
    localStorage.setItem(SYNC_CONSENT_KEY, 'false');
    setHasConsent(false);
    setShowConsentPrompt(false);
    toast({ description: "Data will remain local only." });
  }, [toast]);

  // Sync session to cloud
  const syncSession = useCallback(async (session: any, caseId?: string) => {
    if (!hasConsent || !isOnline) return null;
    
    setIsSyncing(true);
    try {
      const { data, error } = await supabase
        .from('cloud_sessions')
        .upsert({
          local_id: session.id,
          case_id: caseId || null,
          status: session.status,
          recording_posture: session.recordingPosture,
          review_complete: session.reviewComplete,
          reviewed_at: session.reviewedAt || null,
          total_duration_ms: session.totalDurationMs,
          user_id: user?.id,
        }, { onConflict: 'local_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error syncing session:', error);
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [hasConsent, isOnline, user]);

  // Search for existing case by case number
  const searchCase = useCallback(async (caseNumber: string) => {
    if (!isOnline) return null;
    
    try {
      const { data, error } = await supabase
        .from('cases')
        .select('*')
        .ilike('case_number', `%${caseNumber}%`)
        .limit(10);

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error searching cases:', error);
      return null;
    }
  }, [isOnline]);

  // Get or create case
  const getOrCreateCase = useCallback(async (caseNumber: string, caseTitle?: string, courtName?: string) => {
    if (!isOnline) return null;

    try {
      // First check if case exists
      const { data: existing } = await supabase
        .from('cases')
        .select('*')
        .eq('case_number', caseNumber)
        .single();

      if (existing) return existing;

      // Create new case
      const { data, error } = await supabase
        .from('cases')
        .insert({
          case_number: caseNumber,
          case_title: caseTitle || null,
          court_name: courtName || null,
          user_id: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting/creating case:', error);
      return null;
    }
  }, [isOnline]);

  // Get sessions for a case
  const getSessionsForCase = useCallback(async (caseId: string) => {
    if (!isOnline) return [];

    try {
      const { data, error } = await supabase
        .from('cloud_sessions')
        .select('*')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting sessions for case:', error);
      return [];
    }
  }, [isOnline]);

  return {
    isOnline,
    hasConsent,
    isSyncing,
    showConsentPrompt,
    grantConsent,
    denyConsent,
    syncSession,
    searchCase,
    getOrCreateCase,
    getSessionsForCase,
    getDeviceId,
  };
}
