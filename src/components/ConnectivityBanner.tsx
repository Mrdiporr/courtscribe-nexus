// Small global banner shown while offline, while auto-sync is running,
// or briefly after coming back online with pending offline edits.

import { useConnectivityStatus } from '@/hooks/useConnectivityStatus';
import { CloudOff, Cloud, RefreshCw, CloudAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatTime(d: Date | null) {
  if (!d) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function ConnectivityBanner() {
  const { online, pendingCount, activity, lastSyncedAt, lastMessage } = useConnectivityStatus();

  // Nothing to show: online, idle, nothing pending.
  if (online && activity === 'idle' && pendingCount === 0) return null;

  let Icon = CloudCheck;
  let label = '';
  let tone: 'muted' | 'warning' | 'info' | 'error' = 'muted';

  if (!online) {
    Icon = CloudOff;
    tone = 'warning';
    label =
      pendingCount > 0
        ? `Offline — ${pendingCount} edit${pendingCount === 1 ? '' : 's'} will sync when you're back online`
        : 'Offline — changes will be saved locally';
  } else if (activity === 'syncing') {
    Icon = RefreshCw;
    tone = 'info';
    label = `Syncing ${pendingCount || ''} item${pendingCount === 1 ? '' : 's'}…`.replace('  ', ' ');
  } else if (activity === 'error') {
    Icon = CloudAlert;
    tone = 'error';
    label = lastMessage || 'Some items failed to sync';
  } else if (activity === 'completed') {
    Icon = CloudCheck;
    tone = 'info';
    label = `Synced — up to date${lastSyncedAt ? ` at ${formatTime(lastSyncedAt)}` : ''}`;
  } else if (pendingCount > 0) {
    Icon = CloudOff;
    tone = 'warning';
    label = `${pendingCount} offline edit${pendingCount === 1 ? '' : 's'} pending sync`;
  }

  const toneClass = {
    muted: 'bg-muted text-muted-foreground border-border',
    info: 'bg-primary/10 text-primary border-primary/20',
    warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
    error: 'bg-destructive/10 text-destructive border-destructive/30',
  }[tone];

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed bottom-4 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-full border px-4 py-2 text-sm shadow-md backdrop-blur',
        toneClass
      )}
    >
      <Icon className={cn('h-4 w-4', activity === 'syncing' && 'animate-spin')} aria-hidden />
      <span>{label}</span>
    </div>
  );
}
