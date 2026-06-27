// Visual sync status indicator (synced / pending / offline-only / syncing)
import { Cloud, CloudOff, CloudUpload, Check, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

export type SyncState = 'synced' | 'pending' | 'syncing' | 'offline-only' | 'error' | 'unknown';

interface SyncBadgeProps {
  state: SyncState;
  lastSyncedAt?: Date | null;
  className?: string;
  compact?: boolean;
}

const COPY: Record<SyncState, { label: string; Icon: typeof Cloud; tone: string }> = {
  synced:        { label: 'Synced',        Icon: Check,        tone: 'bg-success/10 text-success border-success/30' },
  pending:       { label: 'Pending sync',  Icon: CloudUpload,  tone: 'bg-warning/10 text-warning border-warning/30' },
  syncing:       { label: 'Syncing…',      Icon: Loader2,      tone: 'bg-primary/10 text-primary border-primary/30' },
  'offline-only':{ label: 'Local only',    Icon: CloudOff,     tone: 'bg-muted text-muted-foreground border-border' },
  error:         { label: 'Sync failed',   Icon: AlertCircle,  tone: 'bg-destructive/10 text-destructive border-destructive/30' },
  unknown:       { label: 'Not synced',    Icon: Cloud,        tone: 'bg-muted text-muted-foreground border-border' },
};

export function SyncBadge({ state, lastSyncedAt, className, compact }: SyncBadgeProps) {
  const { label, Icon, tone } = COPY[state];
  const ts = lastSyncedAt ? new Date(lastSyncedAt) : null;
  const rel = ts && !isNaN(ts.getTime()) ? formatDistanceToNow(ts, { addSuffix: true }) : null;
  return (
    <span
      title={rel ? `Last sync ${rel}` : label}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
        tone,
        className
      )}
    >
      <Icon className={cn('w-3 h-3', state === 'syncing' && 'animate-spin')} />
      <span>{label}</span>
      {!compact && rel && <span className="opacity-70">· {rel}</span>}
    </span>
  );
}
