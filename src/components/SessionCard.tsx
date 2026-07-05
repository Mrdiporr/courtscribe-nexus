// Session card for session list view
// Shows key metadata without inferring legal meaning

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Calendar, Clock, CheckCircle2, AlertCircle, FileText, Mic } from 'lucide-react';
import { SyncBadge, type SyncState } from '@/components/SyncBadge';
import { SyncErrorBanner } from '@/components/SyncErrorBanner';
import { TranscriptionStatusBadge } from '@/components/TranscriptionStatusBadge';
import { useTranscriptionStatus } from '@/hooks/useTranscriptionStatus';
import { getOfflineTranscript, getRecordingSync } from '@/lib/offlineStorage';
import { useCloudSyncSettings } from '@/hooks/useCloudSyncSettings';
import type { Session } from '@/types/session';


interface SessionCardProps {
  session: Session;
  onClick: () => void;
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-NG', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(date));
}

export function SessionCard({ session, onClick }: SessionCardProps) {
  const { isOfflineMode } = useCloudSyncSettings();
  const [transcriptState, setTranscriptState] = useState<{ state: SyncState; at: Date | null; exists: boolean; error?: string }>({ state: 'unknown', at: null, exists: false });
  const [recordingState, setRecordingState] = useState<{ state: SyncState; at: Date | null; error?: string }>({ state: 'unknown', at: null });
  const transcriptionStatus = useTranscriptionStatus(session.id);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [t, r] = await Promise.all([
        getOfflineTranscript(session.id),
        getRecordingSync(session.id),
      ]);
      if (cancelled) return;
      const tState: SyncState = !t ? 'unknown'
        : t.lastSyncError ? 'error'
        : isOfflineMode && !t.syncedAt ? 'offline-only'
        : t.needsSync ? 'pending'
        : t.syncedAt ? 'synced' : 'unknown';
      setTranscriptState({ state: tState, at: t?.syncedAt ? new Date(t.syncedAt) : null, exists: !!t, error: t?.lastSyncError });
      const rState: SyncState = !r ? (isOfflineMode ? 'offline-only' : 'pending')
        : r.lastError ? 'error'
        : isOfflineMode && !r.syncedAt ? 'offline-only'
        : r.needsSync ? 'pending'
        : r.syncedAt ? 'synced' : 'unknown';
      setRecordingState({ state: rState, at: r?.syncedAt ? new Date(r.syncedAt) : null, error: r?.lastError });
    }
    load();
    const handler = () => load();
    window.addEventListener('myjuris:sync-updated', handler);
    return () => { cancelled = true; window.removeEventListener('myjuris:sync-updated', handler); };
  }, [session.id, isOfflineMode]);


  const statusColors = {
    active: 'border-l-recording',
    interrupted: 'border-l-warning',
    closed: 'border-l-muted-foreground',
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "w-full text-left p-4 bg-card rounded-lg border border-border cursor-pointer",
        "border-l-4 transition-all hover:shadow-md hover:border-primary/30",
        "focus:outline-none focus:ring-2 focus:ring-ring",
        statusColors[session.status]
      )}
    >

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {session.caseTitle ? (
              <h3 className="font-serif font-semibold truncate">{session.caseTitle}</h3>
            ) : (
              <h3 className="font-serif text-muted-foreground">Untitled Session</h3>
            )}
          </div>

          {session.courtName && (
            <p className="text-sm text-muted-foreground truncate">{session.courtName}</p>
          )}

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {formatDate(session.createdAt)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {formatDuration(session.totalDurationMs)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Mic className="w-3 h-3" /> Recording
            </span>
            <SyncBadge state={recordingState.state} lastSyncedAt={recordingState.at} compact />
            {transcriptState.exists && (
              <>
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground ml-2">
                  <FileText className="w-3 h-3" /> Transcript
                </span>
                <SyncBadge state={transcriptState.state} lastSyncedAt={transcriptState.at} compact />
              </>
            )}
            <TranscriptionStatusBadge status={transcriptionStatus} compact className="ml-2" />
          </div>

          <SyncErrorBanner
            transcriptError={transcriptState.error}
            recordingError={recordingState.error}
          />
        </div>

        <div className="shrink-0">
          {session.reviewComplete ? (
            <CheckCircle2 className="w-5 h-5 text-success" />
          ) : session.status === 'closed' ? (
            <AlertCircle className="w-5 h-5 text-warning" />
          ) : null}
        </div>
      </div>
    </button>
  );
}


