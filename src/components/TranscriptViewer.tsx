// Transcript viewer with editable speaker labels
// New paragraph for each speaker change

import { useState, useCallback } from 'react';
import { Edit2, Check, X, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SpeakerSegment } from '@/hooks/useTranscription';

interface TranscriptViewerProps {
  segments: SpeakerSegment[];
  speakerLabels: Record<string, string>;
  onUpdateSpeakerLabel: (speakerId: string, newLabel: string) => void;
  onSeek?: (timestampMs: number) => void;
  currentTimeMs?: number;
}

export function TranscriptViewer({
  segments,
  speakerLabels,
  onUpdateSpeakerLabel,
  onSeek,
  currentTimeMs = 0,
}: TranscriptViewerProps) {
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const formatTimestamp = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startEditing = useCallback((speakerId: string) => {
    setEditingSpeakerId(speakerId);
    setEditValue(speakerLabels[speakerId] || '');
  }, [speakerLabels]);

  const saveEdit = useCallback(() => {
    if (editingSpeakerId && editValue.trim()) {
      onUpdateSpeakerLabel(editingSpeakerId, editValue.trim());
    }
    setEditingSpeakerId(null);
    setEditValue('');
  }, [editingSpeakerId, editValue, onUpdateSpeakerLabel]);

  const cancelEdit = useCallback(() => {
    setEditingSpeakerId(null);
    setEditValue('');
  }, []);

  // Group consecutive segments by speaker for paragraph rendering
  const groupedSegments = segments.reduce<Array<{
    speakerId: string;
    speakerLabel: string;
    startMs: number;
    endMs: number;
    segments: SpeakerSegment[];
  }>>((acc, segment) => {
    const lastGroup = acc[acc.length - 1];
    
    if (lastGroup && lastGroup.speakerId === segment.speakerId) {
      // Same speaker, add to existing group
      lastGroup.segments.push(segment);
      lastGroup.endMs = segment.endMs;
    } else {
      // New speaker, create new group
      acc.push({
        speakerId: segment.speakerId,
        speakerLabel: speakerLabels[segment.speakerId] || segment.speakerLabel,
        startMs: segment.startMs,
        endMs: segment.endMs,
        segments: [segment],
      });
    }
    
    return acc;
  }, []);

  if (segments.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No transcript available</p>
        <p className="text-sm mt-1">Transcribe the recording to see the text here</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groupedSegments.map((group, groupIndex) => {
        const isActive = currentTimeMs >= group.startMs && currentTimeMs <= group.endMs;
        
        return (
          <div
            key={`${group.speakerId}-${groupIndex}`}
            className={`p-4 rounded-lg border transition-all ${
              isActive
                ? 'bg-primary/5 border-primary/20'
                : 'bg-card border-border hover:border-primary/20'
            }`}
          >
            {/* Speaker label - only shown for first group or when speaker changes */}
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-primary" />
                </div>
                
                {editingSpeakerId === group.speakerId ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="h-8 text-sm"
                      placeholder="Enter speaker name"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit();
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      autoFocus
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveEdit}>
                      <Check className="w-4 h-4 text-success" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="font-medium text-sm truncate">
                      {speakerLabels[group.speakerId] || group.speakerLabel}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:opacity-100"
                      onClick={() => startEditing(group.speakerId)}
                    >
                      <Edit2 className="w-3 h-3" />
                    </Button>
                  </>
                )}
              </div>
              
              <button
                onClick={() => onSeek?.(group.startMs)}
                className="text-xs font-mono text-muted-foreground hover:text-primary transition-colors shrink-0"
              >
                {formatTimestamp(group.startMs)}
              </button>
            </div>

            {/* Combined text from all segments in this group */}
            <p className="text-sm leading-relaxed pl-10">
              {group.segments.map((seg, i) => (
                <span
                  key={seg.id}
                  className={`${
                    currentTimeMs >= seg.startMs && currentTimeMs <= seg.endMs
                      ? 'bg-primary/20 rounded px-0.5'
                      : ''
                  }`}
                  onClick={() => onSeek?.(seg.startMs)}
                  style={{ cursor: onSeek ? 'pointer' : 'default' }}
                >
                  {seg.text}
                  {i < group.segments.length - 1 ? ' ' : ''}
                </span>
              ))}
            </p>
          </div>
        );
      })}
    </div>
  );
}
