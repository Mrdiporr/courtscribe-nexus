// Session Review Screen
// Post-court review with transcription, timeline, and calendar

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, CheckCircle, Flag, StickyNote, Gavel, Trash2, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TimeDisplay } from '@/components/TimeDisplay';
import { 
  getSession, 
  getAudioChunks, 
  getMarkers, 
  getNotes, 
  getAdjournments,
  saveSession,
  saveAdjournment,
  deleteSession
} from '@/lib/storage';
import { useToast } from '@/hooks/use-toast';
import { useAISettings } from '@/hooks/useAISettings';
import { useTranscription, type SpeakerSegment } from '@/hooks/useTranscription';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ExportMenu } from '@/components/ExportMenu';
import { AIReviewPanel } from '@/components/AIReviewPanel';
import { TranscriptViewer } from '@/components/TranscriptViewer';
import { CalendarButton } from '@/components/CalendarButton';
import { saveOfflineTranscript, getOfflineTranscript, initOfflineDB } from '@/lib/offlineStorage';
import { useSessionSyncStatus } from '@/hooks/useSyncStatus';
import { SyncBadge } from '@/components/SyncBadge';

import type { Session, AudioChunk, Marker, Note, Adjournment, ConfidenceLevel } from '@/types/session';
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';

export default function Review() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { aiEnabled } = useAISettings();
  const audioRef = useRef<HTMLAudioElement>(null);
  const { status: syncStatus } = useSessionSyncStatus(sessionId);

  
  const [session, setSession] = useState<Session | null>(null);
  const [audioChunks, setAudioChunks] = useState<AudioChunk[]>([]);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [adjournments, setAdjournments] = useState<Adjournment[]>([]);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showTranscribeConsent, setShowTranscribeConsent] = useState(false);

  // Transcription state
  const {
    isTranscribing,
    progress: transcriptionProgress,
    transcription,
    speakerLabels,
    transcribeAudio,
    updateSpeakerLabel,
    setTranscription,
  } = useTranscription();

  useEffect(() => {
    async function loadData() {
      if (!sessionId) return;
      
      await initOfflineDB();
      
      const [s, chunks, m, n, adj] = await Promise.all([
        getSession(sessionId),
        getAudioChunks(sessionId),
        getMarkers(sessionId),
        getNotes(sessionId),
        getAdjournments(sessionId),
      ]);
      
      setSession(s || null);
      setAudioChunks(chunks.sort((a, b) => a.chunkIndex - b.chunkIndex));
      setMarkers(m);
      setNotes(n);
      setAdjournments(adj);

      // Combine audio chunks
      if (chunks.length > 0) {
        const sortedChunks = chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
        const combinedBlob = new Blob(
          sortedChunks.map(c => c.blob),
          { type: 'audio/webm' }
        );
        setAudioBlob(combinedBlob);
        const url = URL.createObjectURL(combinedBlob);
        setAudioUrl(url);
      }

      // Load existing offline transcript
      const offlineTranscript = await getOfflineTranscript(sessionId);
      if (offlineTranscript) {
        setTranscription({
          text: offlineTranscript.fullText,
          speakerSegments: offlineTranscript.segments.map(seg => ({
            id: seg.id,
            speakerId: seg.speakerId,
            speakerLabel: seg.speakerLabel,
            segmentIndex: seg.segmentIndex,
            text: seg.text,
            startMs: seg.startMs,
            endMs: seg.endMs,
          })),
          language: offlineTranscript.languageCode,
        });
      }
    }
    loadData();

    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [sessionId]);

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (timeMs: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = timeMs / 1000;
    setCurrentTime(timeMs);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime * 1000);
    }
  };

  // Transcription handlers
  const handleTranscribeClick = () => {
    if (aiEnabled) {
      setShowTranscribeConsent(true);
    } else {
      toast({
        title: "AI Features Disabled",
        description: "Enable AI features in Settings to use transcription.",
        variant: "destructive",
      });
    }
  };

  const handleTranscribeConfirm = async () => {
    setShowTranscribeConsent(false);
    if (audioBlob && sessionId) {
      const result = await transcribeAudio(audioBlob);
      if (result) {
        // Auto-save to IndexedDB
        await saveOfflineTranscript({
          id: `transcript_${sessionId}`,
          sessionId,
          caseNumber: session?.caseNumber,
          fullText: result.text,
          segments: result.speakerSegments.map(seg => ({
            id: seg.id,
            speakerId: seg.speakerId,
            speakerLabel: seg.speakerLabel,
            text: seg.text,
            startMs: seg.startMs,
            endMs: seg.endMs,
            segmentIndex: seg.segmentIndex,
          })),
          languageCode: result.language || 'en',
          createdAt: new Date(),
          updatedAt: new Date(),
          needsSync: true,
        });
      }
    }
  };

  const confirmAdjournment = async (adj: Adjournment, confidence: ConfidenceLevel) => {
    const updated: Adjournment = {
      ...adj,
      confidence,
      confirmedAt: new Date(),
      confirmedBy: 'user',
    };
    await saveAdjournment(updated);
    setAdjournments(prev => prev.map(a => a.id === adj.id ? updated : a));
    toast({ description: "Adjournment confirmed" });
  };

  const markReviewComplete = async () => {
    if (!session || !sessionId) return;
    
    const updated: Session = {
      ...session,
      reviewComplete: true,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    };
    await saveSession(updated);
    setSession(updated);
    toast({ description: "Review marked as complete" });
  };

  const handleDelete = async () => {
    if (!sessionId) return;
    await deleteSession(sessionId);
    toast({ description: "Session deleted permanently" });
    navigate('/');
  };

  // Combine all timeline items
  const timelineItems = [
    ...markers.map(m => ({ ...m, type: 'marker' as const })),
    ...notes.map(n => ({ ...n, type: 'note' as const })),
    ...adjournments.map(a => ({ ...a, type: 'adjournment' as const })),
  ].sort((a, b) => a.timestampMs - b.timestampMs);

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading session...</p>
      </div>
    );
  }

  const formatTimestamp = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="container flex items-center h-16 px-4 gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-serif text-lg font-semibold truncate">
              {session.caseTitle || 'Session Review'}
            </h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {session.caseNumber && (
                <span className="truncate">{session.caseNumber}</span>
              )}
              {session.courtName && session.caseNumber && <span>•</span>}
              {session.courtName && (
                <span className="truncate">{session.courtName}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ExportMenu 
              session={session} 
              markers={markers} 
              notes={notes} 
              adjournments={adjournments}
              audioBlob={audioBlob}
            />
            {session.reviewComplete && (
              <CheckCircle className="w-5 h-5 text-success shrink-0" />
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container px-4 py-6 space-y-6">
        {/* Audio player */}
        {audioUrl && (
          <section className="bg-card border border-border rounded-lg p-4 space-y-4">
            <audio 
              ref={audioRef} 
              src={audioUrl} 
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => setIsPlaying(false)}
            />
            
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={handlePlayPause}
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </Button>
              
              <div className="flex-1">
                <div className="flex justify-between text-sm text-muted-foreground mb-1">
                  <TimeDisplay milliseconds={currentTime} size="sm" />
                  <TimeDisplay milliseconds={session.totalDurationMs} size="sm" />
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all"
                    style={{ width: `${(currentTime / session.totalDurationMs) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Transcription button */}
            <div className="flex items-center gap-2">
              {!transcription && !isTranscribing && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-2"
                  onClick={handleTranscribeClick}
                  disabled={!aiEnabled}
                >
                  <FileText className="w-4 h-4" />
                  Transcribe Recording
                </Button>
              )}
              
              {isTranscribing && (
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Transcribing audio...</span>
                  </div>
                  <Progress value={transcriptionProgress} className="h-1" />
                </div>
              )}

              {transcription && (
                <div className="text-sm text-success flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" />
                  Transcript available
                </div>
              )}
            </div>
          </section>
        )}

        {/* AI Review Panel */}
        <AIReviewPanel 
          session={session} 
          markers={markers} 
          notes={notes} 
          adjournments={adjournments} 
        />

        {/* Tabs for Timeline and Transcript */}
        <Tabs defaultValue="timeline" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="transcript" disabled={!transcription}>
              Transcript
              {transcription && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({transcription.speakerSegments.length})
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="space-y-4 mt-4">
            <h2 className="font-serif text-lg font-medium">Timeline</h2>
            
            {timelineItems.length > 0 ? (
              <div className="space-y-3">
                {timelineItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSeek(item.timestampMs)}
                    className="w-full text-left p-3 bg-card border border-border rounded-lg hover:border-primary/30 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      {item.type === 'marker' && <Flag className="w-4 h-4 text-warning mt-0.5 shrink-0" />}
                      {item.type === 'note' && <StickyNote className="w-4 h-4 text-primary mt-0.5 shrink-0" />}
                      {item.type === 'adjournment' && <Gavel className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">
                            {formatTimestamp(item.timestampMs)}
                          </span>
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">
                            {item.type}
                          </span>
                        </div>
                        
                        {item.type === 'marker' && (
                          <p className="text-sm mt-1">{(item as Marker).label}</p>
                        )}
                        
                        {item.type === 'note' && (
                          <p className="text-sm mt-1">{(item as Note).content}</p>
                        )}
                        
                        {item.type === 'adjournment' && (
                          <div className="mt-1 space-y-2">
                            {(item as Adjournment).nextDate && (
                              <div className="flex items-center justify-between">
                                <p className="text-sm">
                                  Next date: {new Date((item as Adjournment).nextDate!).toLocaleDateString('en-NG')}
                                </p>
                                <CalendarButton
                                  caseTitle={session.caseTitle}
                                  caseNumber={session.caseNumber}
                                  nextDate={(item as Adjournment).nextDate!}
                                  courtName={session.courtName}
                                  reason={(item as Adjournment).reason}
                                />
                              </div>
                            )}
                            {(item as Adjournment).reason && (
                              <p className="text-sm text-muted-foreground">{(item as Adjournment).reason}</p>
                            )}
                            
                            {/* Confidence buttons */}
                            {(item as Adjournment).confidence === 'unconfirmed' && (
                              <div className="flex gap-2 mt-2">
                                <Button 
                                  variant="confidence-high" 
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    confirmAdjournment(item as Adjournment, 'high');
                                  }}
                                >
                                  Confirm
                                </Button>
                                <Button 
                                  variant="confidence-medium" 
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    confirmAdjournment(item as Adjournment, 'medium');
                                  }}
                                >
                                  Uncertain
                                </Button>
                              </div>
                            )}
                            
                            {(item as Adjournment).confidence !== 'unconfirmed' && (
                              <span className={`text-xs font-medium ${
                                (item as Adjournment).confidence === 'high' ? 'text-confidence-high' :
                                (item as Adjournment).confidence === 'medium' ? 'text-confidence-medium' :
                                'text-confidence-low'
                              }`}>
                                {(item as Adjournment).confidence === 'high' ? '✓ Confirmed' : '? Uncertain'}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No markers, notes, or adjournments recorded
              </p>
            )}
          </TabsContent>

          {/* Transcript Tab */}
          <TabsContent value="transcript" className="mt-4">
            {transcription && (
              <TranscriptViewer
                segments={transcription.speakerSegments}
                speakerLabels={speakerLabels}
                onUpdateSpeakerLabel={updateSpeakerLabel}
                onSeek={handleSeek}
                currentTimeMs={currentTime}
              />
            )}
          </TabsContent>
        </Tabs>

        {/* Actions */}
        <section className="space-y-3 pt-4">
          {!session.reviewComplete && (
            <Button 
              className="w-full" 
              size="lg"
              onClick={markReviewComplete}
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              Mark Review Complete
            </Button>
          )}
          
          <Button 
            variant="destructive" 
            className="w-full"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Session Permanently
          </Button>
        </section>
      </main>

      {/* Transcription consent dialog */}
      <AlertDialog open={showTranscribeConsent} onOpenChange={setShowTranscribeConsent}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transcribe Recording?</AlertDialogTitle>
            <AlertDialogDescription>
              This will send the audio to an AI service for transcription. The transcript will include speaker detection to help identify different voices.
              <br /><br />
              <strong>Note:</strong> Speaker labels are estimates and may need manual correction.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleTranscribeConfirm}>
              <FileText className="w-4 h-4 mr-2" />
              Transcribe
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the recording and all associated notes, markers, and adjournment records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
