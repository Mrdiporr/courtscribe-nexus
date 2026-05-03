// AI-Powered Post-Court Review Panel
// Session summaries, highlight suggestions, follow-up detection
// All AI features are clearly labeled and dismissible

import { useState } from 'react';
import { Sparkles, FileText, Lightbulb, AlertCircle, X, ChevronDown, ChevronUp, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAISettings } from '@/hooks/useAISettings';
import type { Session, Marker, Note, Adjournment, AISuggestion } from '@/types/session';

interface AIReviewPanelProps {
  session: Session;
  markers: Marker[];
  notes: Note[];
  adjournments: Adjournment[];
}

// Mock AI suggestions for demonstration (in production, these would come from an AI service)
function generateMockSuggestions(
  session: Session,
  markers: Marker[],
  notes: Note[],
  adjournments: Adjournment[]
): AISuggestion[] {
  const suggestions: AISuggestion[] = [];
  
  // Summary suggestion
  suggestions.push({
    id: 'summary-1',
    sessionId: session.id,
    type: 'summary',
    content: `This ${Math.round(session.totalDurationMs / 60000)} minute session${session.caseTitle ? ` for "${session.caseTitle}"` : ''} includes ${markers.length} marker(s), ${notes.length} note(s), and ${adjournments.length} adjournment record(s). ${adjournments.some(a => a.confidence === 'unconfirmed') ? 'Some adjournment dates require confirmation.' : 'All adjournment dates have been reviewed.'}`,
    createdAt: new Date(),
    dismissed: false,
    aiModel: 'myJuris AI',
  });

  // Highlight suggestions based on markers
  if (markers.length > 0) {
    const importantMarkers = markers.filter(m => 
      m.label.toLowerCase().includes('important') || 
      m.label.toLowerCase().includes('key') ||
      m.label.toLowerCase().includes('ruling') ||
      m.label.toLowerCase().includes('objection')
    );
    
    if (importantMarkers.length > 0) {
      suggestions.push({
        id: 'highlight-1',
        sessionId: session.id,
        type: 'highlight',
        content: `${importantMarkers.length} potentially significant moment(s) were marked during this session. Consider reviewing: ${importantMarkers.map(m => m.label).join(', ')}.`,
        createdAt: new Date(),
        dismissed: false,
        aiModel: 'myJuris AI',
      });
    }
  }

  // Follow-up detection based on adjournments
  const upcomingAdjournments = adjournments.filter(a => {
    if (!a.nextDate) return false;
    const nextDate = new Date(a.nextDate);
    const now = new Date();
    const daysUntil = Math.ceil((nextDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntil > 0 && daysUntil <= 14;
  });

  if (upcomingAdjournments.length > 0) {
    suggestions.push({
      id: 'followup-1',
      sessionId: session.id,
      type: 'followup',
      content: `${upcomingAdjournments.length} upcoming court date(s) within the next 2 weeks. Ensure all necessary preparations are in order.`,
      createdAt: new Date(),
      dismissed: false,
      aiModel: 'myJuris AI',
    });
  }

  // Unconfirmed adjournments warning
  const unconfirmedAdj = adjournments.filter(a => a.confidence === 'unconfirmed');
  if (unconfirmedAdj.length > 0) {
    suggestions.push({
      id: 'followup-2',
      sessionId: session.id,
      type: 'followup',
      content: `${unconfirmedAdj.length} adjournment date(s) remain unconfirmed. Please verify these dates before your next court appearance.`,
      createdAt: new Date(),
      dismissed: false,
      aiModel: 'myJuris AI',
    });
  }

  return suggestions;
}

const typeConfig = {
  summary: {
    icon: FileText,
    label: 'Session Summary',
    bgClass: 'bg-primary/5 border-primary/20',
  },
  highlight: {
    icon: Lightbulb,
    label: 'Key Highlight',
    bgClass: 'bg-warning-muted border-warning/20',
  },
  followup: {
    icon: AlertCircle,
    label: 'Follow-up Required',
    bgClass: 'bg-destructive/5 border-destructive/20',
  },
};

export function AIReviewPanel({ session, markers, notes, adjournments }: AIReviewPanelProps) {
  const { aiEnabled } = useAISettings();
  const [isExpanded, setIsExpanded] = useState(true);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  if (!aiEnabled) {
    return null;
  }

  const allSuggestions = generateMockSuggestions(session, markers, notes, adjournments);
  const suggestions = allSuggestions.filter(s => !dismissedIds.has(s.id));

  if (suggestions.length === 0 && dismissedIds.size === 0) {
    return null;
  }

  const handleDismiss = (id: string) => {
    setDismissedIds(prev => new Set(prev).add(id));
  };

  const handleDismissAll = () => {
    setDismissedIds(new Set(allSuggestions.map(s => s.id)));
  };

  return (
    <section className="space-y-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 bg-card border border-border rounded-lg hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-primary/10">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <span className="font-serif font-medium">AI Insights</span>
          <Badge variant="outline" className="text-xs font-normal">
            <Bot className="w-3 h-3 mr-1" />
            AI-Assisted
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {suggestions.length > 0 && (
            <span className="text-xs text-muted-foreground">{suggestions.length} suggestion(s)</span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="space-y-2">
          {suggestions.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground bg-card border border-border rounded-lg">
              All AI suggestions have been dismissed.
              <button 
                onClick={() => setDismissedIds(new Set())}
                className="ml-1 text-primary hover:underline"
              >
                Show again
              </button>
            </div>
          ) : (
            <>
              {suggestions.map((suggestion) => {
                const config = typeConfig[suggestion.type];
                const Icon = config.icon;

                return (
                  <div
                    key={suggestion.id}
                    className={`p-3 rounded-lg border ${config.bgClass} relative group`}
                  >
                    <button
                      onClick={() => handleDismiss(suggestion.id)}
                      className="absolute top-2 right-2 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-background/50 transition-opacity"
                      aria-label="Dismiss suggestion"
                    >
                      <X className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>

                    <div className="flex items-start gap-3 pr-6">
                      <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {config.label}
                          </span>
                        </div>
                        <p className="text-sm">{suggestion.content}</p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {suggestions.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDismissAll}
                  className="w-full text-xs text-muted-foreground"
                >
                  Dismiss all suggestions
                </Button>
              )}
            </>
          )}

          <p className="text-xs text-center text-muted-foreground px-4">
            AI suggestions are for reference only. Always verify information independently.
          </p>
        </div>
      )}
    </section>
  );
}
