// Settings Page
// Theme, data management, and recording preferences

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Moon, Sun, Monitor, Trash2, HardDrive, Mic } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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

type RecordingQuality = 'low' | 'medium' | 'high';

export default function Settings() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  
  const [sessionCount, setSessionCount] = useState(0);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [recordingQuality, setRecordingQuality] = useState<RecordingQuality>('medium');

  useEffect(() => {
    async function loadStats() {
      const sessions = await getAllSessions();
      setSessionCount(sessions.length);
    }
    loadStats();

    // Load saved quality preference
    const savedQuality = localStorage.getItem('recordingQuality') as RecordingQuality;
    if (savedQuality) {
      setRecordingQuality(savedQuality);
    }
  }, []);

  const handleQualityChange = (value: RecordingQuality) => {
    setRecordingQuality(value);
    localStorage.setItem('recordingQuality', value);
    toast({ description: "Recording quality updated" });
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
            <p>MyBarrister</p>
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
