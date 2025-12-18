// Session Review Screen
// Post-court review workflow with timeline

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, CheckCircle, Flag, StickyNote, Gavel, Trash2 } from 'lucide-react';
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

export default function Review() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement>(null);
  
  const [session, setSession] = useState<Session | null>(null);
  const [audioChunks, setAudioChunks] = useState<AudioChunk[]>([]);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [adjournments, setAdjournments] = useState<Adjournment[]>([]);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!sessionId) return;
      
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
        const url = URL.createObjectURL(combinedBlob);
        setAudioUrl(url);
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
            {session.courtName && (
              <p className="text-xs text-muted-foreground truncate">{session.courtName}</p>
            )}
          </div>
          {session.reviewComplete && (
            <CheckCircle className="w-5 h-5 text-success shrink-0" />
          )}
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
          </section>
        )}

        {/* Timeline */}
        <section className="space-y-4">
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
                            <p className="text-sm">
                              Next date: {new Date((item as Adjournment).nextDate!).toLocaleDateString('en-NG')}
                            </p>
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
        </section>

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
