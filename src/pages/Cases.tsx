// Case Management Page
// View all sessions grouped by case with filtering and search

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Filter, FolderOpen, Calendar, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { SessionCard } from '@/components/SessionCard';
import { getAllSessions, initDB } from '@/lib/storage';
import type { Session } from '@/types/session';
import { formatDistanceToNow } from 'date-fns';

type SortOption = 'recent' | 'caseNumber' | 'sessionCount';
type FilterOption = 'all' | 'pending' | 'reviewed';

interface CaseGroup {
  caseNumber: string;
  caseTitle?: string;
  courtName?: string;
  sessions: Session[];
  lastActivity: Date;
}

export default function Cases() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [expandedCases, setExpandedCases] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function loadSessions() {
      await initDB();
      const allSessions = await getAllSessions();
      setSessions(allSessions);
      setIsLoading(false);
    }
    loadSessions();
  }, []);

  // Group sessions by case
  const caseGroups = useMemo(() => {
    const groups = new Map<string, CaseGroup>();
    const uncategorized: Session[] = [];

    sessions.forEach(session => {
      const caseKey = session.caseNumber || '';
      
      if (!caseKey) {
        uncategorized.push(session);
        return;
      }

      if (!groups.has(caseKey)) {
        groups.set(caseKey, {
          caseNumber: session.caseNumber || '',
          caseTitle: session.caseTitle,
          courtName: session.courtName,
          sessions: [],
          lastActivity: new Date(session.updatedAt),
        });
      }

      const group = groups.get(caseKey)!;
      group.sessions.push(session);
      
      // Update case title if not set
      if (!group.caseTitle && session.caseTitle) {
        group.caseTitle = session.caseTitle;
      }
      if (!group.courtName && session.courtName) {
        group.courtName = session.courtName;
      }
      
      // Track latest activity
      const sessionDate = new Date(session.updatedAt);
      if (sessionDate > group.lastActivity) {
        group.lastActivity = sessionDate;
      }
    });

    // Add uncategorized group if there are sessions without case numbers
    if (uncategorized.length > 0) {
      groups.set('__uncategorized__', {
        caseNumber: 'Uncategorized',
        sessions: uncategorized,
        lastActivity: new Date(Math.max(...uncategorized.map(s => new Date(s.updatedAt).getTime()))),
      });
    }

    return Array.from(groups.values());
  }, [sessions]);

  // Filter and sort cases
  const filteredCases = useMemo(() => {
    let result = [...caseGroups];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(group => 
        group.caseNumber.toLowerCase().includes(query) ||
        group.caseTitle?.toLowerCase().includes(query) ||
        group.courtName?.toLowerCase().includes(query)
      );
    }

    // Apply status filter
    if (filterBy !== 'all') {
      result = result.map(group => ({
        ...group,
        sessions: group.sessions.filter(s => {
          if (filterBy === 'pending') return !s.reviewComplete;
          if (filterBy === 'reviewed') return s.reviewComplete;
          return true;
        })
      })).filter(group => group.sessions.length > 0);
    }

    // Apply sorting
    switch (sortBy) {
      case 'recent':
        result.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
        break;
      case 'caseNumber':
        result.sort((a, b) => a.caseNumber.localeCompare(b.caseNumber));
        break;
      case 'sessionCount':
        result.sort((a, b) => b.sessions.length - a.sessions.length);
        break;
    }

    return result;
  }, [caseGroups, searchQuery, sortBy, filterBy]);

  const toggleCase = (caseNumber: string) => {
    setExpandedCases(prev => {
      const next = new Set(prev);
      if (next.has(caseNumber)) {
        next.delete(caseNumber);
      } else {
        next.add(caseNumber);
      }
      return next;
    });
  };

  const totalSessions = sessions.length;
  const totalCases = caseGroups.filter(g => g.caseNumber !== 'Uncategorized').length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="container flex items-center h-16 px-4 gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-serif text-xl font-semibold">Cases</h1>
        </div>
      </header>

      <main className="container px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Total Cases</p>
            <p className="text-2xl font-mono font-semibold">{totalCases}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Total Sessions</p>
            <p className="text-2xl font-mono font-semibold">{totalSessions}</p>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search cases..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="flex gap-2">
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most Recent</SelectItem>
                <SelectItem value="caseNumber">Case Number</SelectItem>
                <SelectItem value="sessionCount">Session Count</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterBy} onValueChange={(v) => setFilterBy(v as FilterOption)}>
              <SelectTrigger className="flex-1">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sessions</SelectItem>
                <SelectItem value="pending">Pending Review</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Case List */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : filteredCases.length > 0 ? (
            filteredCases.map((group) => {
              const isExpanded = expandedCases.has(group.caseNumber);
              const pendingCount = group.sessions.filter(s => !s.reviewComplete).length;

              return (
                <Collapsible
                  key={group.caseNumber}
                  open={isExpanded}
                  onOpenChange={() => toggleCase(group.caseNumber)}
                >
                  <div className="bg-card border border-border rounded-lg overflow-hidden">
                    <CollapsibleTrigger asChild>
                      <button className="w-full p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left">
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                        )}
                        
                        <FolderOpen className="w-5 h-5 text-primary shrink-0" />
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-mono font-medium truncate">
                              {group.caseNumber}
                            </p>
                            {pendingCount > 0 && (
                              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
                                {pendingCount} pending
                              </Badge>
                            )}
                          </div>
                          {group.caseTitle && (
                            <p className="text-sm text-muted-foreground truncate">
                              {group.caseTitle}
                            </p>
                          )}
                          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDistanceToNow(group.lastActivity, { addSuffix: true })}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {group.sessions.length} session{group.sessions.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      </button>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="border-t border-border p-3 space-y-2 bg-muted/30">
                        {group.sessions
                          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                          .map((session) => (
                            <SessionCard
                              key={session.id}
                              session={session}
                              onClick={() => navigate(`/review/${session.id}`)}
                            />
                          ))}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })
          ) : (
            <div className="text-center py-12">
              <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No cases found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {searchQuery ? 'Try adjusting your search' : 'Start a new session to create cases'}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
