// Case search dialog for finding existing cases
// Case number is unique identifier

import { useState, useEffect, useCallback } from 'react';
import { Search, FileText, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useCloudSync } from '@/hooks/useCloudSync';

interface Case {
  id: string;
  case_number: string;
  case_title: string | null;
  court_name: string | null;
  created_at: string;
}

interface CaseSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseNumber: string;
  onSelectCase: (caseData: Case) => void;
  onCreateNew: () => void;
}

export function CaseSearchDialog({
  open,
  onOpenChange,
  caseNumber,
  onSelectCase,
  onCreateNew,
}: CaseSearchDialogProps) {
  const { searchCase, isOnline } = useCloudSync();
  const [searchResults, setSearchResults] = useState<Case[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Search when dialog opens with a case number
  useEffect(() => {
    if (open && caseNumber.trim() && isOnline) {
      performSearch();
    }
  }, [open, caseNumber, isOnline]);

  const performSearch = useCallback(async () => {
    if (!caseNumber.trim()) return;
    
    setIsSearching(true);
    setHasSearched(true);
    
    try {
      const results = await searchCase(caseNumber.trim());
      setSearchResults(results || []);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [caseNumber, searchCase]);

  const handleSelectCase = (caseData: Case) => {
    onSelectCase(caseData);
    onOpenChange(false);
  };

  const handleCreateNew = () => {
    onCreateNew();
    onOpenChange(false);
  };

  // Exact match check
  const exactMatch = searchResults.find(
    c => c.case_number.toLowerCase() === caseNumber.toLowerCase().trim()
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Case Found
          </DialogTitle>
          <DialogDescription>
            {exactMatch
              ? "This case number already exists. Would you like to add a new session to it?"
              : "Similar case numbers found. Select one or create a new case."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isOnline && (
            <div className="p-3 bg-warning-muted rounded-lg text-sm text-warning">
              You're offline. Case search requires an internet connection.
            </div>
          )}

          {isSearching ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : searchResults.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {searchResults.map((caseItem) => (
                <button
                  key={caseItem.id}
                  onClick={() => handleSelectCase(caseItem)}
                  className={`w-full text-left p-3 rounded-lg border transition-all hover:border-primary/30 ${
                    caseItem.case_number.toLowerCase() === caseNumber.toLowerCase().trim()
                      ? 'bg-primary/5 border-primary/30'
                      : 'bg-card border-border'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{caseItem.case_number}</p>
                      {caseItem.case_title && (
                        <p className="text-sm text-muted-foreground truncate">
                          {caseItem.case_title}
                        </p>
                      )}
                      {caseItem.court_name && (
                        <p className="text-xs text-muted-foreground truncate">
                          {caseItem.court_name}
                        </p>
                      )}
                    </div>
                    {caseItem.case_number.toLowerCase() === caseNumber.toLowerCase().trim() && (
                      <span className="text-xs font-medium text-primary shrink-0">
                        Exact Match
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : hasSearched ? (
            <div className="text-center py-6 text-muted-foreground">
              <p>No matching cases found</p>
              <p className="text-sm mt-1">Create a new case with this number</p>
            </div>
          ) : null}

          <div className="flex gap-2 pt-2">
            {!exactMatch && (
              <Button 
                variant="default" 
                className="flex-1 gap-2"
                onClick={handleCreateNew}
              >
                <Plus className="w-4 h-4" />
                Create New Case
              </Button>
            )}
            {exactMatch && (
              <Button 
                variant="default" 
                className="flex-1"
                onClick={() => handleSelectCase(exactMatch)}
              >
                Add Session to This Case
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
