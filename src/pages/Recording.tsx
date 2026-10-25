// Active Recording Screen
// Minimal UI, focus on reliability.
// Explicit start only — capture never begins or resumes automatically.

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Mic, Pause, Play, Square, Flag, StickyNote, Gavel, RotateCcw, ArrowRight, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RecordingIndicator } from '@/components/RecordingIndicator';
import { TimeDisplay } from '@/components/TimeDisplay';
import { useRecorder } from '@/hooks/useRecorder';
import { getSession, getAudioChunks, saveMarker, saveNote, saveAdjournment } from '@/lib/storage';
import { useToast } from '@/hooks/use-toast';
import { ThemeToggle } from '@/components/ThemeToggle';
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
  const [existingChunkCount, setExistingChunkCount] = useState(0);
  const [retryingSave, setRetryingSave] = useState(false);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [showAdjournmentDialog, setShowAdjournmentDialog] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [adjournmentDate, setAdjournmentDate] = useState('');
  const [adjournmentReason, setAdjournmentReason] = useState('');

  const {
    isRecording,
    isStarting,
    isPaused,
    elapsedMs,
    error,
    saveError,
    pendingBatches,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    retrySave,
  } = useRecorder({
    sessionId: sessionId || '',
    onError: (err) => {
      toast({
        title: "Recording Notice",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    async function loadSession() {
      if (!sessionId) return;
      const [s, chunks] = await Promise.all([getSession(sessionId), getAudioChunks(sessionId)]);
      setSession(s || null);
      setExistingChunkCount(chunks.length);
    }
    loadSession();
  }, [sessionId]);

  // R1: no microphone request and no capture until the user presses Start.
  // R6: recovery after an interruption never restarts capture automatically.

  const handleStart = async () => {
    const ok = await startRecording();
    if (ok) setExistingChunkCount(0); // appended capture is live; counts shown pre-start
  };

  const handleRetrySave = async () => {
    setRetryingSave(true);
    const ok = await retrySave();
    setRetryingSave(false);
    if (ok) {
      toast({ description: "Saved audio recovered" });
    } else {
      toast({
        title: "Still not saved",
        description: "The waiting audio could not be saved yet. Your committed audio is safe. Try again.",
        variant: "destructive",
      });
    }
  };

  const handleAddMarker = async () => {
    if (!sessionId) return;

    const marker: Marker = {
      id: `marker_${Date.now()}`,
      sessionId,
      createdAt: new Date(),
      timestampMs: elapsedMs,
      label: `Marker at ${Math.floor(elapsedMs / 60000)}:${String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, '0')}`,
    };

    try {
      await saveMarker(marker);
      toast({ description: "Marker added" });
    } catch {
      // R8: failure keeps capture running and the marker is not claimed saved.
      toast({
        title: "Marker not saved",
        description: "The marker could not be saved. Capture continues; try again.",
        variant: "destructive",
      });
    }
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

    try {
      await saveNote(note);
      setNoteContent('');
      setShowNoteDialog(false);
      toast({ description: "Note saved" });
    } catch {
      // R8: keep the dialog open with the typed text so nothing is lost.
      toast({
        title: "Note not saved",
        description: "Your note is still here — try saving again.",
        variant: "destructive",
      });
    }
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

    try {
      await saveAdjournment(adjournment);
      setAdjournmentDate('');
      setAdjournmentReason('');
      setShowAdjournmentDialog(false);
      toast({ description: "Adjournment noted" });
    } catch {
      // R8: keep the dialog open with the entered values.
      toast({
        title: "Adjournment not saved",
        description: "Your entry is still here — try saving again.",
        variant: "destructive",
      });
    }
  };

  // R5: navigation waits until every batch is committed.
  const handleEndSession = async () => {
    const finalized = await stopRecording();
    if (finalized) {
      navigate(`/review/${sessionId}`);
    } else {
      toast({
        title: "Final save incomplete",
        description: "Recording stopped and your committed audio is safe. Retry saving below, then continue to review.",
        variant: "destructive",
      });
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading session...</p>
      </div>
    );
  }

  const wasInterrupted = session.status === 'interrupted';
  const canLeaveForReview = !isRecording && !saveError && pendingBatches === 0 && existingChunkCount >= 0 && session.status !== 'active';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar with recording indicator */}
      <header className="p-4 flex items-center justify-between">
        <RecordingIndicator isRecording={isRecording} isPaused={isPaused} />
        <div className="flex items-center gap-2">
          {session.caseTitle && (
            <p className="text-sm text-muted-foreground truncate max-w-[40%]">
              {session.caseTitle}
            </p>
          )}
          <ThemeToggle />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4">
        {isRecording || isStarting ? (
          <>
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
                  aria-label="Resume recording"
                >
                  <Play className="w-7 h-7" />
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="icon-lg"
                  className="rounded-full"
                  onClick={pauseRecording}
                  disabled={isStarting}
                  aria-label="Pause recording"
                >
                  <Pause className="w-7 h-7" />
                </Button>
              )}

              <Button
                variant="record-stop"
                size="icon-lg"
                className="rounded-full"
                onClick={handleEndSession}
                disabled={isStarting || pendingBatches > 3}
                aria-label="Stop recording"
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
          </>
        ) : (
          <>
            {/* Explicit start / recovery screen */}
            <div className="text-center space-y-6 max-w-md">
              {wasInterrupted && (
                <div className="flex items-start gap-3 p-4 rounded-lg border border-warning/40 bg-warning/10 text-left">
                  <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-medium">Recording was interrupted</p>
                    <p className="text-sm text-muted-foreground">
                      {existingChunkCount > 0
                        ? `${existingChunkCount} saved audio segment${existingChunkCount === 1 ? '' : 's'} are safe on this device. Resuming appends after the last saved audio — nothing is overwritten.`
                        : 'No audio was saved yet. You can start again safely.'}
                    </p>
                  </div>
                </div>
              )}

              {saveError && (
                <div className="flex items-start gap-3 p-4 rounded-lg border border-destructive/40 bg-destructive/10 text-left">
                  <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-medium">Some recorded audio is waiting to be saved</p>
                    <p className="text-sm text-muted-foreground">
                      {pendingBatches} batch{pendingBatches === 1 ? '' : 'es'} could not be written
                      {existingChunkCount > 0 ? `, but ${existingChunkCount} saved segment${existingChunkCount === 1 ? '' : 's'} are safe` : ''}.
                      Audio already saved is never replaced.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 mt-1"
                      onClick={handleRetrySave}
                      disabled={retryingSave}
                    >
                      <RotateCcw className="w-4 h-4" />
                      {retryingSave ? 'Retrying…' : 'Retry save'}
                    </Button>
                  </div>
                </div>
              )}

              <Button
                variant="record"
                size="xl"
                className="gap-3"
                onClick={handleStart}
                disabled={isStarting}
              >
                <Mic className="w-5 h-5" />
                <span>{wasInterrupted && existingChunkCount > 0 ? 'Resume recording' : 'Start recording'}</span>
              </Button>
              <p className="text-xs text-muted-foreground">
                Recording starts only when you tap the button — never automatic.
              </p>

              {canLeaveForReview && existingChunkCount >= 0 && session.status !== 'active' && (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => navigate(`/review/${sessionId}`)}
                >
                  <ArrowRight className="w-4 h-4" />
                  Continue to review
                </Button>
              )}
            </div>
          </>
        )}
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
