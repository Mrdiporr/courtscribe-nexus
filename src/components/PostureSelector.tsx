// Recording posture selection
// "Personal Notes Mode" (default) vs "Open Recording Mode"

import { cn } from '@/lib/utils';
import { Shield, Users } from 'lucide-react';
import type { RecordingPosture } from '@/types/session';

interface PostureSelectorProps {
  value: RecordingPosture;
  onChange: (posture: RecordingPosture) => void;
  disabled?: boolean;
}

export function PostureSelector({ value, onChange, disabled }: PostureSelectorProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Recording posture</p>
      
      <div className="grid gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange('personal_notes')}
          className={cn(
            "flex items-start gap-4 p-4 rounded-lg border-2 text-left transition-all",
            "hover:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed",
            value === 'personal_notes' 
              ? "border-primary bg-primary/5" 
              : "border-border bg-card"
          )}
        >
          <Shield className="w-5 h-5 mt-0.5 text-primary shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">Personal Notes Mode</p>
            <p className="text-sm text-muted-foreground">
              Private memory aid for your own reference. Not intended for sharing.
            </p>
          </div>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange('open_recording')}
          className={cn(
            "flex items-start gap-4 p-4 rounded-lg border-2 text-left transition-all",
            "hover:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed",
            value === 'open_recording' 
              ? "border-primary bg-primary/5" 
              : "border-border bg-card"
          )}
        >
          <Users className="w-5 h-5 mt-0.5 text-primary shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">Open Recording Mode</p>
            <p className="text-sm text-muted-foreground">
              You affirm that appropriate permission has been granted for this recording.
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
