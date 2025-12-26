// Export Menu Component
// Dropdown menu for exporting session data in various formats

import { Download, FileText, Music, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { exportToPDF, exportAudio, exportNotes } from '@/lib/export';
import type { Session, Marker, Note, Adjournment } from '@/types/session';

interface ExportMenuProps {
  session: Session;
  markers: Marker[];
  notes: Note[];
  adjournments: Adjournment[];
  audioBlob?: Blob | null;
}

export function ExportMenu({ session, markers, notes, adjournments, audioBlob }: ExportMenuProps) {
  const { toast } = useToast();

  const handleExportPDF = async () => {
    try {
      await exportToPDF({ session, markers, notes, adjournments });
      toast({ description: "PDF report exported successfully" });
    } catch (error) {
      console.error('Export error:', error);
      toast({ 
        variant: "destructive",
        description: "Failed to export PDF" 
      });
    }
  };

  const handleExportAudio = async () => {
    if (!audioBlob) {
      toast({ 
        variant: "destructive",
        description: "No audio recording available" 
      });
      return;
    }

    try {
      await exportAudio(audioBlob, session);
      toast({ description: "Audio file exported successfully" });
    } catch (error) {
      console.error('Export error:', error);
      toast({ 
        variant: "destructive",
        description: "Failed to export audio" 
      });
    }
  };

  const handleExportNotes = async () => {
    try {
      await exportNotes({ session, markers, notes, adjournments });
      toast({ description: "Notes exported successfully" });
    } catch (error) {
      console.error('Export error:', error);
      toast({ 
        variant: "destructive",
        description: "Failed to export notes" 
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Export Session</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        <DropdownMenuItem onClick={handleExportPDF}>
          <FileText className="w-4 h-4 mr-2" />
          <div className="flex flex-col">
            <span>PDF Report</span>
            <span className="text-xs text-muted-foreground">Court-ready document</span>
          </div>
        </DropdownMenuItem>
        
        <DropdownMenuItem onClick={handleExportNotes}>
          <FileDown className="w-4 h-4 mr-2" />
          <div className="flex flex-col">
            <span>Markdown Notes</span>
            <span className="text-xs text-muted-foreground">Plain text format</span>
          </div>
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem 
          onClick={handleExportAudio}
          disabled={!audioBlob}
        >
          <Music className="w-4 h-4 mr-2" />
          <div className="flex flex-col">
            <span>Audio Recording</span>
            <span className="text-xs text-muted-foreground">
              {audioBlob ? 'WebM format' : 'No recording available'}
            </span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
