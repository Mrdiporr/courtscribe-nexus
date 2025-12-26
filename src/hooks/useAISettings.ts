// AI Settings Hook
// Manages AI functionality kill switch state

import { useState, useEffect, useCallback } from 'react';

const AI_ENABLED_KEY = 'aiEnabled';

export function useAISettings() {
  const [aiEnabled, setAIEnabledState] = useState<boolean>(() => {
    const stored = localStorage.getItem(AI_ENABLED_KEY);
    return stored !== null ? stored === 'true' : true; // Default enabled
  });

  useEffect(() => {
    localStorage.setItem(AI_ENABLED_KEY, String(aiEnabled));
  }, [aiEnabled]);

  const setAIEnabled = useCallback((enabled: boolean) => {
    setAIEnabledState(enabled);
  }, []);

  const toggleAI = useCallback(() => {
    setAIEnabledState(prev => !prev);
  }, []);

  return {
    aiEnabled,
    setAIEnabled,
    toggleAI,
  };
}

// Static getter for non-hook contexts
export function getAIEnabled(): boolean {
  const stored = localStorage.getItem(AI_ENABLED_KEY);
  return stored !== null ? stored === 'true' : true;
}
