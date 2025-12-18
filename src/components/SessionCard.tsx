// Session card for session list view
// Shows key metadata without inferring legal meaning

import { cn } from '@/lib/utils';
import { Calendar, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import type { Session } from '@/types/session';

interface SessionCardProps {
  session: Session;
  onClick: () => void;
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-NG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

export function SessionCard({ session, onClick }: SessionCardProps) {
  const statusColors = {
    active: 'border-l-recording',
    interrupted: 'border-l-warning',
    closed: 'border-l-muted-foreground',
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-4 bg-card rounded-lg border border-border",
        "border-l-4 transition-all hover:shadow-md hover:border-primary/30",
        statusColors[session.status]
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 min-w-0">
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
