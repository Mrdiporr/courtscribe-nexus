// Compact indicator for the transcribe-audio edge function state per session.
import { Loader2, CheckCircle2, Clock, CopyCheck, AlertTriangle, FileAudio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import type { TranscriptionState, TranscriptionStatus } from '@/lib/transcriptionStatus';

interface Props {
  status?: TranscriptionStatus;
  compact?: boolean;
  className?: string;
}

const COPY: Record<TranscriptionState, { label: string; Icon: typeof Clock; tone: string; spin?: boolean }> = {
  idle:        { label: 'Not transcribed', Icon: FileAudio,   tone: 'bg-muted text-muted-foreground border-border' },
  queued:      { label: 'Queued',          Icon: Clock,       tone: 'bg-muted text-muted-foreground border-border' },
  'in-flight': { label: 'Transcribing…',   Icon: Loader2,     tone: 'bg-primary/10 text-primary border-primary/30', spin: true },
  completed:   { label: 'Transcribed',     Icon: CheckCircle2, tone: 'bg-success/10 text-success border-success/30' },
  deduped:     { label: 'Deduped',         Icon: CopyCheck,   tone: 'bg-success/10 text-success border-success/30' },
  failed:      { label: 'Failed',          Icon: AlertTriangle, tone: 'bg-destructive/10 text-destructive border-destructive/30' },
};

export function TranscriptionStatusBadge({ status, compact, className }: Props) {
  if (!status || status.state === 'idle') return null;
  const meta = COPY[status.state];
  const ts = status.updatedAt ? new Date(status.updatedAt) : null;
  const rel = ts && !isNaN(ts.getTime()) ? formatDistanceToNow(ts, { addSuffix: true }) : null;
  const title =
    status.state === 'failed' && status.lastError
      ? `${meta.label}: ${status.lastError}${rel ? ` (${rel})` : ''}`
      : rel
      ? `${meta.label} · ${rel}`
      : meta.label;

  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
        meta.tone,
        className
      )}
    >
      <meta.Icon className={cn('w-3 h-3', meta.spin && 'animate-spin')} />
      <span>{meta.label}</span>
      {!compact && rel && <span className="opacity-70">· {rel}</span>}
    </span>
  );
}
