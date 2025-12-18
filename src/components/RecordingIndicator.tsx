// Visual recording indicator - always visible when recording
// Follows "no courtroom disruption" principle with minimal design

import { cn } from '@/lib/utils';

interface RecordingIndicatorProps {
  isRecording: boolean;
  isPaused: boolean;
  className?: string;
}

export function RecordingIndicator({ isRecording, isPaused, className }: RecordingIndicatorProps) {
  if (!isRecording) return null;

  return (
    <div 
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full",
        isPaused 
          ? "bg-muted text-muted-foreground" 
          : "bg-recording/10 text-recording",
        className
      )}
    >
      <div 
        className={cn(
          "w-2.5 h-2.5 rounded-full",
          isPaused 
            ? "bg-muted-foreground" 
            : "recording-indicator"
        )} 
      />
      <span className="text-xs font-medium uppercase tracking-wide">
        {isPaused ? 'Paused' : 'Recording'}
      </span>
    </div>
  );
}
