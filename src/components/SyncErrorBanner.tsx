// Inline banner for a session card summarizing the last sync failure
// with a one-click retry. Error strings are sanitized before display.
import { AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, type MouseEvent } from 'react';
import { useManualSync } from '@/hooks/useManualSync';

interface Props {
  transcriptError?: string;
  recordingError?: string;
  className?: string;
}

// Strip out anything that looks sensitive (JWTs, URLs with query strings,
// stack line numbers) before showing an error to the user.
function sanitize(msg?: string): string | null {
  if (!msg) return null;
  const clean = msg
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[token]')
    .replace(/https?:\/\/\S+/g, '[url]')
    .replace(/\s+at\s+[^\s]+:\d+:\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > 160 ? `${clean.slice(0, 157)}…` : clean;
}

export function SyncErrorBanner({ transcriptError, recordingError, className }: Props) {
  const { isSyncing, startSync } = useManualSync();
  const [retrying, setRetrying] = useState(false);

  const errors = [
    transcriptError ? { source: 'Transcript', text: sanitize(transcriptError) } : null,
    recordingError ? { source: 'Recording', text: sanitize(recordingError) } : null,
  ].filter(Boolean) as { source: string; text: string | null }[];

  if (errors.length === 0) return null;

  const type = transcriptError && recordingError ? 'both' : transcriptError ? 'transcripts' : 'recordings';

  const onRetry = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (isSyncing || retrying) return;
    setRetrying(true);
    try {
      await startSync(type);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'mt-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs',
        className,
      )}
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-destructive">Last sync failed</p>
        <ul className="mt-0.5 space-y-0.5 text-muted-foreground">
          {errors.map((err) => (
            <li key={err.source} className="truncate">
              <span className="font-medium text-foreground">{err.source}:</span>{' '}
              {err.text ?? 'Unknown error'}
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={onRetry}
        disabled={isSyncing || retrying}
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded border border-destructive/40 bg-background px-2 py-1 text-[11px] font-medium text-destructive',
          'hover:bg-destructive/10 disabled:opacity-60',
        )}
      >
        {retrying || isSyncing ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <RefreshCw className="h-3 w-3" />
        )}
        Retry sync
      </button>
    </div>
  );
}
