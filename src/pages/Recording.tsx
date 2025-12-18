// Active Recording Screen
// Minimal UI, focus on reliability

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Pause, Play, Square, Flag, StickyNote, Gavel } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RecordingIndicator } from '@/components/RecordingIndicator';
import { TimeDisplay } from '@/components/TimeDisplay';
import { useRecorder } from '@/hooks/useRecorder';
import { getSession, saveMarker, saveNote, saveAdjournment } from '@/lib/storage';
import { useToast } from '@/hooks/use-toast';
import type { Session, Marker, Note, Adjournment } from '@/types/session';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Recording() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [session, setSession] = useState<Session | null>(null);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [showAdjournmentDialog, setShowAdjournmentDialog] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [adjournmentDate, setAdjournmentDate] = useState('');
  const [adjournmentReason, setAdjournmentReason] = useState('');

  const {
    isRecording,
    isPaused,
    elapsedMs,
    error,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
  } = useRecorder({
    sessionId: sessionId || '',
    onError: (err) => {
      toast({
        title: "Recording Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    async function loadSession() {
      if (sessionId) {
        const s = await getSession(sessionId);
        setSession(s || null);
      }
    }
    loadSession();
  }, [sessionId]);

  // Auto-start recording when component mounts
  useEffect(() => {
    if (sessionId && !isRecording && !error) {
      startRecording();
    }
  }, [sessionId]);

  const handleAddMarker = async () => {
    if (!sessionId) return;
    
    const marker: Marker = {
      id: `marker_${Date.now()}`,
      sessionId,
      createdAt: new Date(),
      timestampMs: elapsedMs,
      label: `Marker at ${Math.floor(elapsedMs / 60000)}:${String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, '0')}`,
    };
    
    await saveMarker(marker);
    toast({ description: "Marker added" });
  };

  const handleSaveNote = async () => {
    if (!sessionId || !noteContent.trim()) return;
    
    const note: Note = {
      id: `note_${Date.now()}`,
      sessionId,
      createdAt: new Date(),
      timestampMs: elapsedMs,
      content: noteContent.trim(),
    };
    
    await saveNote(note);
    setNoteContent('');
    setShowNoteDialog(false);
    toast({ description: "Note saved" });
  };

  const handleSaveAdjournment = async () => {
    if (!sessionId) return;
    
    const adjournment: Adjournment = {
      id: `adj_${Date.now()}`,
      sessionId,
      createdAt: new Date(),
      timestampMs: elapsedMs,
      nextDate: adjournmentDate || undefined,
      reason: adjournmentReason.trim() || undefined,
      confidence: 'unconfirmed',
      confirmedBy: 'unconfirmed',
    };
    
    await saveAdjournment(adjournment);
    setAdjournmentDate('');
    setAdjournmentReason('');
    setShowAdjournmentDialog(false);
    toast({ description: "Adjournment noted" });
  };

  const handleEndSession = async () => {
    await stopRecording();
    navigate(`/review/${sessionId}`);
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar with recording indicator */}
      <header className="p-4 flex items-center justify-between">
        <RecordingIndicator isRecording={isRecording} isPaused={isPaused} />
        {session.caseTitle && (
          <p className="text-sm text-muted-foreground truncate max-w-[50%]">
            {session.caseTitle}
          </p>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4">
        {/* Time display */}
        <div className="mb-12">
          <TimeDisplay milliseconds={elapsedMs} size="lg" />
        </div>

        {/* Recording controls */}
        <div className="flex items-center justify-center gap-6 mb-12">
          {isPaused ? (
            <Button 
              variant="record" 
              size="icon-lg" 
              className="rounded-full"
              onClick={resumeRecording}
            >
              <Play className="w-7 h-7" />
            </Button>
          ) : (
            <Button 
              variant="secondary" 
              size="icon-lg" 
              className="rounded-full"
              onClick={pauseRecording}
            >
              <Pause className="w-7 h-7" />
            </Button>
          )}
          
          <Button 
            variant="record-stop" 
            size="icon-lg" 
            className="rounded-full"
            onClick={handleEndSession}
          >
            <Square className="w-6 h-6" />
          </Button>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center justify-center gap-3">
          <Button 
            variant="marker" 
            size="sm" 
            className="gap-2"
            onClick={handleAddMarker}
          >
            <Flag className="w-4 h-4" />
            Marker
          </Button>
          
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2"
            onClick={() => setShowNoteDialog(true)}
          >
            <StickyNote className="w-4 h-4" />
            Note
          </Button>
          
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2"
            onClick={() => setShowAdjournmentDialog(true)}
          >
            <Gavel className="w-4 h-4" />
            Adjourn
          </Button>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-4">
        <p className="text-xs text-center text-muted-foreground">
          Recording saved locally • {session.recordingPosture === 'personal_notes' ? 'Personal notes mode' : 'Open recording mode'}
        </p>
      </footer>

      {/* Note Dialog */}
      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Enter your note..."
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              rows={4}
            />
            <Button onClick={handleSaveNote} disabled={!noteContent.trim()}>
              Save Note
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Adjournment Dialog */}
      <Dialog open={showAdjournmentDialog} onOpenChange={setShowAdjournmentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Adjournment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adj-date">Next Date (if mentioned)</Label>
              <Input
                id="adj-date"
                type="date"
                value={adjournmentDate}
                onChange={(e) => setAdjournmentDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adj-reason">Reason (optional)</Label>
              <Textarea
                id="adj-reason"
                placeholder="e.g., For continuation of cross-examination"
                value={adjournmentReason}
                onChange={(e) => setAdjournmentReason(e.target.value)}
                rows={2}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              You can confirm or edit this during review
            </p>
            <Button onClick={handleSaveAdjournment}>
              Save Adjournment
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
