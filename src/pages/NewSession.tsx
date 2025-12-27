// New Session Setup
// Case number as unique ID, search existing cases

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mic, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PostureSelector } from '@/components/PostureSelector';
import { CaseSearchDialog } from '@/components/CaseSearchDialog';
import { saveSession } from '@/lib/storage';
import { useCloudSync } from '@/hooks/useCloudSync';
import { useToast } from '@/hooks/use-toast';
import type { Session, RecordingPosture } from '@/types/session';

interface CloudCase {
  id: string;
  case_number: string;
  case_title: string | null;
  court_name: string | null;
}

export default function NewSession() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isOnline, getOrCreateCase } = useCloudSync();
  
  const [isCreating, setIsCreating] = useState(false);
  const [showCaseSearch, setShowCaseSearch] = useState(false);
  const [selectedCase, setSelectedCase] = useState<CloudCase | null>(null);
  
  // Form state - case number is important for uniqueness
  const [courtName, setCourtName] = useState('');
  const [caseTitle, setCaseTitle] = useState('');
  const [caseNumber, setCaseNumber] = useState('');
  const [posture, setPosture] = useState<RecordingPosture>('personal_notes');

  // Handle case number blur - search for existing case
  const handleCaseNumberBlur = useCallback(() => {
    if (caseNumber.trim() && isOnline) {
      setShowCaseSearch(true);
    }
  }, [caseNumber, isOnline]);

  // Handle search button click
  const handleSearchClick = useCallback(() => {
    if (caseNumber.trim()) {
      setShowCaseSearch(true);
    } else {
      toast({
        description: "Enter a case number to search",
      });
    }
  }, [caseNumber, toast]);

  // Handle case selection from search
  const handleSelectCase = useCallback((caseData: CloudCase) => {
    setSelectedCase(caseData);
    setCaseNumber(caseData.case_number);
    if (caseData.case_title) setCaseTitle(caseData.case_title);
    if (caseData.court_name) setCourtName(caseData.court_name);
    toast({
      description: "Case selected. New session will be added to this case.",
    });
  }, [toast]);

  // Handle create new case
  const handleCreateNewCase = useCallback(() => {
    setSelectedCase(null);
  }, []);

  const handleStartSession = async () => {
    setIsCreating(true);
    
    try {
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      
      // If online and has case number, get or create case in cloud
      let cloudCaseId: string | undefined;
      if (isOnline && caseNumber.trim()) {
        const cloudCase = selectedCase || await getOrCreateCase(
          caseNumber.trim(),
          caseTitle.trim() || undefined,
          courtName.trim() || undefined
        );
        cloudCaseId = cloudCase?.id;
      }
      
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

      // Store cloud case ID in session for later sync
      if (cloudCaseId) {
        (session as any).cloudCaseId = cloudCaseId;
      }

      await saveSession(session);
      navigate(`/record/${sessionId}`);
    } catch (error) {
      console.error('Error creating session:', error);
      toast({
        title: "Error",
        description: "Failed to create session",
        variant: "destructive",
      });
      setIsCreating(false);
    }
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
        {/* Case number with search */}
        <section className="space-y-4 animate-fade-in">
          <p className="text-sm text-muted-foreground">
            Enter a case number to search for existing cases or create a new one.
          </p>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="number">Case/Suit Number</Label>
              <div className="flex gap-2">
                <Input
                  id="number"
                  placeholder="e.g., FHC/L/CS/123/2024"
                  value={caseNumber}
                  onChange={(e) => {
                    setCaseNumber(e.target.value);
                    setSelectedCase(null);
                  }}
                  onBlur={handleCaseNumberBlur}
                  className="flex-1"
                />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={handleSearchClick}
                  disabled={!caseNumber.trim()}
                  title="Search for existing case"
                >
                  <Search className="w-4 h-4" />
                </Button>
              </div>
              {selectedCase && (
                <p className="text-xs text-primary">
                  ✓ Adding to existing case: {selectedCase.case_number}
                </p>
              )}
              {!isOnline && caseNumber.trim() && (
                <p className="text-xs text-muted-foreground">
                  Offline - case will be synced when online
                </p>
              )}
            </div>

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

      {/* Case search dialog */}
      <CaseSearchDialog
        open={showCaseSearch}
        onOpenChange={setShowCaseSearch}
        caseNumber={caseNumber}
        onSelectCase={handleSelectCase}
        onCreateNew={handleCreateNewCase}
      />
    </div>
  );
}
