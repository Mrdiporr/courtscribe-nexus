// MyBarrister Home - Session List
// Entry point for the lawyer

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Scale, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SessionCard } from '@/components/SessionCard';
import { ThemeToggle } from '@/components/ThemeToggle';
import { getAllSessions, initDB } from '@/lib/storage';
import type { Session } from '@/types/session';

export default function Index() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSessions() {
      await initDB();
      const allSessions = await getAllSessions();
      // Sort by most recent first
      allSessions.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setSessions(allSessions);
      setIsLoading(false);
    }
    loadSessions();
  }, []);

  const pendingReview = sessions.filter(s => s.status === 'closed' && !s.reviewComplete);
  const recentSessions = sessions.slice(0, 10);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="container flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-3">
            <Scale className="w-6 h-6 text-primary" />
            <h1 className="font-serif text-xl font-semibold">MyBarrister</h1>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container px-4 py-6 space-y-8">
        {/* New Session CTA */}
        <section className="animate-fade-in">
          <Button 
            size="xl" 
            className="w-full justify-start gap-4"
            onClick={() => navigate('/new-session')}
          >
            <Plus className="w-5 h-5" />
            <span>New Court Session</span>
          </Button>
        </section>

        {/* Pending Review */}
        {pendingReview.length > 0 && (
          <section className="space-y-4 animate-fade-in" style={{ animationDelay: '100ms' }}>
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-lg font-medium">Pending Review</h2>
              <span className="text-sm text-warning font-medium">
                {pendingReview.length} session{pendingReview.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-3">
              {pendingReview.map((session) => (
                <SessionCard 
                  key={session.id} 
                  session={session}
                  onClick={() => navigate(`/review/${session.id}`)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Recent Sessions */}
        <section className="space-y-4 animate-fade-in" style={{ animationDelay: '200ms' }}>
          <h2 className="font-serif text-lg font-medium">Recent Sessions</h2>
          
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : recentSessions.length > 0 ? (
            <div className="space-y-3">
              {recentSessions.map((session) => (
                <SessionCard 
                  key={session.id} 
                  session={session}
                  onClick={() => navigate(`/review/${session.id}`)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Scale className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No sessions yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Start a new session to begin recording
              </p>
            </div>
          )}
        </section>

        {/* Offline indicator */}
        <div className="fixed bottom-4 left-4 right-4">
          <div className="bg-muted/80 backdrop-blur rounded-full px-4 py-2 text-center">
            <p className="text-xs text-muted-foreground">
              All data stored locally on this device
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
