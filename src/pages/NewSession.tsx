// New Session Setup
// Minimal form - no required fields, capture first

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PostureSelector } from '@/components/PostureSelector';
import { saveSession } from '@/lib/storage';
import type { Session, RecordingPosture } from '@/types/session';

export default function NewSession() {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);
  
  // Form state - all optional
  const [courtName, setCourtName] = useState('');
  const [caseTitle, setCaseTitle] = useState('');
  const [caseNumber, setCaseNumber] = useState('');
  const [posture, setPosture] = useState<RecordingPosture>('personal_notes');

  const handleStartSession = async () => {
    setIsCreating(true);
    
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    
    const session: Session = {
      id: sessionId,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'active',
      courtName: courtName.trim() || undefined,
      caseTitle: caseTitle.trim() || undefined,
      caseNumber: caseNumber.trim() || undefined,
      recordingPosture: posture,
      reviewComplete: false,
      totalDurationMs: 0,
    };

    await saveSession(session);
    navigate(`/record/${sessionId}`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="container flex items-center h-16 px-4 gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-serif text-lg font-semibold">New Session</h1>
        </div>
      </header>

      <main className="container px-4 py-6 space-y-8 max-w-lg mx-auto">
        {/* Optional context fields */}
        <section className="space-y-4 animate-fade-in">
          <p className="text-sm text-muted-foreground">
            All fields are optional. You can add details during review.
          </p>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="court">Court</Label>
              <Input
                id="court"
                placeholder="e.g., Federal High Court, Lagos"
                value={courtName}
                onChange={(e) => setCourtName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="case">Case Title</Label>
              <Input
                id="case"
                placeholder="e.g., ABC Ltd v. XYZ Corp"
                value={caseTitle}
                onChange={(e) => setCaseTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="number">Case/Suit Number</Label>
              <Input
                id="number"
                placeholder="e.g., FHC/L/CS/123/2024"
                value={caseNumber}
                onChange={(e) => setCaseNumber(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Recording posture */}
        <section className="animate-fade-in" style={{ animationDelay: '100ms' }}>
          <PostureSelector 
            value={posture} 
            onChange={setPosture}
          />
        </section>

        {/* Start button */}
        <section className="pt-4 animate-fade-in" style={{ animationDelay: '200ms' }}>
          <Button 
            variant="record"
            size="xl"
            className="w-full gap-3"
            onClick={handleStartSession}
            disabled={isCreating}
          >
            <Mic className="w-5 h-5" />
            <span>Begin Recording</span>
          </Button>
          
          <p className="text-xs text-center text-muted-foreground mt-4">
            Recording will begin when you tap the button.
            <br />
            Tap to manually start — never automatic.
          </p>
        </section>
      </main>
    </div>
  );
}
