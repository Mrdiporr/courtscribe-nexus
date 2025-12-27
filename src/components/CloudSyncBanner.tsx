// Cloud sync consent banner
// Prompts user when online and not yet consented

import { Cloud, CloudOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CloudSyncBannerProps {
  isOnline: boolean;
  showPrompt: boolean;
  onGrant: () => void;
  onDeny: () => void;
}

export function CloudSyncBanner({
  isOnline,
  showPrompt,
  onGrant,
  onDeny,
}: CloudSyncBannerProps) {
  if (!showPrompt || !isOnline) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 animate-fade-in">
      <div className="max-w-lg mx-auto bg-card border border-border rounded-lg shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Cloud className="w-5 h-5 text-primary" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm">Enable Cloud Backup?</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Your data is stored locally. Enable cloud backup to sync across devices and prevent data loss.
            </p>
            
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={onGrant} className="gap-1">
                <Cloud className="w-3 h-3" />
                Enable Backup
              </Button>
              <Button size="sm" variant="outline" onClick={onDeny}>
                Keep Local Only
              </Button>
            </div>
          </div>
          
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0"
            onClick={onDeny}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
