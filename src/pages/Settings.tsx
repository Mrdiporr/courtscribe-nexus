// Settings Page
// Theme, data management, AI controls, cloud sync, and recording preferences

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Moon, Sun, Monitor, Trash2, HardDrive, Mic, Sparkles, AlertTriangle, Cloud, CloudOff, Upload, RefreshCw } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { getAllSessions, deleteSession } from '@/lib/storage';
import { useAISettings } from '@/hooks/useAISettings';
import { useCloudSyncSettings, type SyncMode } from '@/hooks/useCloudSyncSettings';
import { useManualSync } from '@/hooks/useManualSync';
import { useDeviceConsent } from '@/hooks/useDeviceConsent';
import { getTranscriptsNeedingSync } from '@/lib/offlineStorage';
import { Input } from '@/components/ui/input';
import { Smartphone, Trash2 as Trash2Icon } from 'lucide-react';


type RecordingQuality = 'low' | 'medium' | 'high';

export default function Settings() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const { aiEnabled, setAIEnabled } = useAISettings();
  const { syncMode, setSyncMode } = useCloudSyncSettings();
  const { isSyncing, progress, startSync } = useManualSync();
  const { devices, currentDeviceId, currentDeviceLabel, upsertCurrentDevice, updateDeviceMode, revokeDevice, renameDevice } = useDeviceConsent();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  
  const [sessionCount, setSessionCount] = useState(0);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [recordingQuality, setRecordingQuality] = useState<RecordingQuality>('medium');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    async function loadStats() {
      const sessions = await getAllSessions();
      setSessionCount(sessions.length);
      
      // Get pending sync count
      const pendingTranscripts = await getTranscriptsNeedingSync();
      setPendingSyncCount(pendingTranscripts.length);
    }
    loadStats();

    // Load saved quality preference
    const savedQuality = localStorage.getItem('recordingQuality') as RecordingQuality;
    if (savedQuality) {
      setRecordingQuality(savedQuality);
    }

    // Monitor online status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleQualityChange = (value: RecordingQuality) => {
    setRecordingQuality(value);
    localStorage.setItem('recordingQuality', value);
    toast({ description: "Recording quality updated" });
  };

  const handleSyncModeChange = (mode: SyncMode) => {
    setSyncMode(mode);
    // Mirror this device's choice into the per-device consent registry.
    upsertCurrentDevice(mode, mode !== 'offline').catch(err => console.error('device consent upsert', err));
    toast({
      description: mode === 'online'
        ? "Cloud sync enabled for this device"
        : mode === 'offline'
        ? "Offline mode enabled for this device"
        : "Will ask before syncing on this device"
    });
  };


  const handleClearAllData = async () => {
    const sessions = await getAllSessions();
    for (const session of sessions) {
      await deleteSession(session.id);
    }
    setSessionCount(0);
    setShowClearDialog(false);
    toast({ description: "All data cleared" });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="container flex items-center h-16 px-4 gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-serif text-xl font-semibold">Settings</h1>
        </div>
      </header>

      <main className="container px-4 py-6 space-y-8">
        {/* Theme Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Sun className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-serif text-lg font-medium">Appearance</h2>
          </div>
          
          <div className="bg-card border border-border rounded-lg p-4">
            <Label className="text-sm font-medium mb-3 block">Theme Preference</Label>
            <RadioGroup
              value={theme}
              onValueChange={setTheme}
              className="space-y-3"
            >
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="light" id="theme-light" />
                <Label htmlFor="theme-light" className="flex items-center gap-2 cursor-pointer">
                  <Sun className="w-4 h-4" />
                  Light
                </Label>
              </div>
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="dark" id="theme-dark" />
                <Label htmlFor="theme-dark" className="flex items-center gap-2 cursor-pointer">
                  <Moon className="w-4 h-4" />
                  Dark
                </Label>
              </div>
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="system" id="theme-system" />
                <Label htmlFor="theme-system" className="flex items-center gap-2 cursor-pointer">
                  <Monitor className="w-4 h-4" />
                  System Default
                </Label>
              </div>
            </RadioGroup>
          </div>
        </section>

        {/* Recording Quality Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Mic className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-serif text-lg font-medium">Recording</h2>
          </div>
          
          <div className="bg-card border border-border rounded-lg p-4 space-y-3">
            <Label className="text-sm font-medium">Audio Quality</Label>
            <Select value={recordingQuality} onValueChange={handleQualityChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">
                  <span className="flex flex-col">
                    <span>Low Quality</span>
                    <span className="text-xs text-muted-foreground">Smaller files, longer sessions</span>
                  </span>
                </SelectItem>
                <SelectItem value="medium">
                  <span className="flex flex-col">
                    <span>Medium Quality</span>
                    <span className="text-xs text-muted-foreground">Balanced (Recommended)</span>
                  </span>
                </SelectItem>
                <SelectItem value="high">
                  <span className="flex flex-col">
                    <span>High Quality</span>
                    <span className="text-xs text-muted-foreground">Larger files, clearer audio</span>
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Changes apply to new recordings only
            </p>
          </div>
        </section>

        {/* AI Features Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-serif text-lg font-medium">AI Features</h2>
          </div>
          
          <div className="bg-card border border-border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 mr-4">
                <p className="text-sm font-medium">Enable AI Assistance</p>
                <p className="text-xs text-muted-foreground">
                  AI-powered session summaries, highlight suggestions, and follow-up detection
                </p>
              </div>
              <Switch
                checked={aiEnabled}
                onCheckedChange={(checked) => {
                  setAIEnabled(checked);
                  toast({ 
                    description: checked ? "AI features enabled" : "AI features paused"
                  });
                }}
              />
            </div>
            
            {!aiEnabled && (
              <div className="flex items-start gap-2 p-3 bg-warning-muted rounded-lg border border-warning/20">
                <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">AI features paused</p>
                  <p className="text-xs text-muted-foreground">
                    Session summaries, highlights, and follow-up suggestions will not appear in review mode.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Cloud Sync Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            {isOnline ? (
              <Cloud className="w-5 h-5 text-muted-foreground" />
            ) : (
              <CloudOff className="w-5 h-5 text-muted-foreground" />
            )}
            <h2 className="font-serif text-lg font-medium">Cloud Sync</h2>
            {!isOnline && (
              <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">Offline</span>
            )}
          </div>
          
          <div className="bg-card border border-border rounded-lg p-4 space-y-4">
            <div>
              <Label className="text-sm font-medium mb-3 block">Sync Mode</Label>
              <RadioGroup
                value={syncMode}
                onValueChange={(v) => handleSyncModeChange(v as SyncMode)}
                className="space-y-3"
              >
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="online" id="sync-online" />
                  <Label htmlFor="sync-online" className="flex items-center gap-2 cursor-pointer">
                    <Cloud className="w-4 h-4" />
                    <div>
                      <span>Online Mode</span>
                      <p className="text-xs text-muted-foreground">Automatically sync when connected</p>
                    </div>
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="offline" id="sync-offline" />
                  <Label htmlFor="sync-offline" className="flex items-center gap-2 cursor-pointer">
                    <CloudOff className="w-4 h-4" />
                    <div>
                      <span>Offline Mode</span>
                      <p className="text-xs text-muted-foreground">Keep data local only</p>
                    </div>
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="ask" id="sync-ask" />
                  <Label htmlFor="sync-ask" className="flex items-center gap-2 cursor-pointer">
                    <RefreshCw className="w-4 h-4" />
                    <div>
                      <span>Ask Each Time</span>
                      <p className="text-xs text-muted-foreground">Prompt before syncing data</p>
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Manual Sync Controls */}
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Pending Sync Items</p>
                  <p className="text-xs text-muted-foreground">Transcripts waiting to be synced</p>
                </div>
                <span className="text-2xl font-mono font-semibold">{pendingSyncCount}</span>
              </div>

              {isSyncing && (
                <div className="space-y-2">
                  <Progress value={(progress.current / Math.max(progress.total, 1)) * 100} />
                  <p className="text-xs text-muted-foreground text-center">{progress.message}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => startSync('transcripts')}
                  disabled={!isOnline || isSyncing || pendingSyncCount === 0}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Sync Transcripts
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => startSync('recordings')}
                  disabled={!isOnline || isSyncing}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Sync Recordings
                </Button>
              </div>
              <Button 
                variant="default" 
                className="w-full"
                onClick={() => startSync('both')}
                disabled={!isOnline || isSyncing}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                Sync All to Cloud
              </Button>
              
              {!isOnline && (
                <p className="text-xs text-muted-foreground text-center">
                  Connect to the internet to sync data
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Devices Section — per-device consent & sync mode */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-serif text-lg font-medium">Devices</h2>
          </div>

          <div className="bg-card border border-border rounded-lg p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Each device has its own consent and sync mode. Revoke a device to immediately stop
              it from syncing new data to the cloud.
            </p>

            {devices.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No devices registered yet. Pick a sync mode above to register this device.
              </p>
            )}

            <ul className="divide-y divide-border">
              {devices.map((d) => {
                const isCurrent = d.device_id === currentDeviceId;
                const isRenaming = renamingId === d.device_id;
                return (
                  <li key={d.id} className="py-3 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {isRenaming ? (
                          <div className="flex gap-2">
                            <Input
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              className="h-8"
                              maxLength={64}
                            />
                            <Button size="sm" onClick={async () => {
                              await renameDevice(d.device_id, renameValue.trim() || 'Device');
                              setRenamingId(null);
                            }}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => setRenamingId(null)}>Cancel</Button>
                          </div>
                        ) : (
                          <button
                            className="text-left"
                            onClick={() => { setRenamingId(d.device_id); setRenameValue(d.device_label ?? ''); }}
                          >
                            <p className="text-sm font-medium truncate">
                              {d.device_label ?? 'Unnamed device'}
                              {isCurrent && <span className="ml-2 text-[10px] uppercase tracking-wide text-primary">this device</span>}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono truncate">{d.device_id}</p>
                          </button>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => revokeDevice(d.device_id)}
                        title="Revoke device"
                        aria-label="Revoke device"
                      >
                        <Trash2Icon className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground w-16 shrink-0">Mode</Label>
                      <Select
                        value={d.sync_mode}
                        onValueChange={(v) => updateDeviceMode(d.device_id, v as SyncMode)}
                      >
                        <SelectTrigger className="h-8 text-xs flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="online">Online sync</SelectItem>
                          <SelectItem value="offline">Offline only</SelectItem>
                          <SelectItem value="ask">Ask each time</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {d.consented_at && (
                      <p className="text-[10px] text-muted-foreground">
                        Consented {new Date(d.consented_at).toLocaleString()}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>

            {!devices.some(d => d.device_id === currentDeviceId) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => upsertCurrentDevice(syncMode, syncMode !== 'offline')}
              >
                Register this device ({currentDeviceLabel})
              </Button>
            )}
          </div>
        </section>


        {/* Data Management Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-serif text-lg font-medium">Data Management</h2>
          </div>
          
          <div className="bg-card border border-border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Stored Sessions</p>
                <p className="text-xs text-muted-foreground">All data is stored locally on device</p>
              </div>
              <span className="text-2xl font-mono font-semibold">{sessionCount}</span>
            </div>
            
            <div className="border-t border-border pt-4">
              <Button 
                variant="destructive" 
                className="w-full"
                onClick={() => setShowClearDialog(true)}
                disabled={sessionCount === 0}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear All Data
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                This action cannot be undone
              </p>
            </div>
          </div>
        </section>

        {/* About Section */}
        <section className="pt-4">
          <div className="text-center text-xs text-muted-foreground space-y-1">
            <p>myJuris</p>
            <p>Court recording assistant for Nigerian legal practitioners</p>
            <p className="font-mono">v0.1.0-pilot</p>
          </div>
        </section>
      </main>

      {/* Clear All Data Dialog */}
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {sessionCount} session(s), including recordings, notes, markers, and adjournment records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleClearAllData}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear All Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
