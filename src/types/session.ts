// Core data model for court sessions
// Following append-only, immutable audio principles

export type SessionStatus = 'active' | 'interrupted' | 'closed';
export type RecordingPosture = 'personal_notes' | 'open_recording';
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unconfirmed';

export interface Session {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  status: SessionStatus;
  
  // Court context (all optional, no inference)
  courtName?: string;
  caseTitle?: string;
  caseNumber?: string;
  
  // Privacy posture
  recordingPosture: RecordingPosture;
  
  // Review state
  reviewedAt?: Date;
  reviewComplete: boolean;
  
  // Duration tracking
  totalDurationMs: number;
}

export interface AudioChunk {
  id: string;
  sessionId: string;
  chunkIndex: number;
  createdAt: Date;
  durationMs: number;
  startOffsetMs: number; // Offset from session start
  blob: Blob;
  integrityHash?: string;
}

export interface Marker {
  id: string;
  sessionId: string;
  createdAt: Date;
  timestampMs: number; // Offset from session start
  label: string;
  color?: string;
}

export interface Note {
  id: string;
  sessionId: string;
  createdAt: Date;
  timestampMs: number; // Offset from session start
  content: string;
}

export interface Adjournment {
  id: string;
  sessionId: string;
  createdAt: Date;
  timestampMs: number;
  
  // Manual entry fields
  nextDate?: string;
  reason?: string;
  
  // Confidence tracking
  confidence: ConfidenceLevel;
  confirmedAt?: Date;
  confirmedBy: 'user' | 'ai_suggested' | 'unconfirmed';
}

// AI assistance types (post-court only)
export interface AISuggestion {
  id: string;
  sessionId: string;
  type: 'summary' | 'highlight' | 'followup';
  content: string;
  createdAt: Date;
  dismissed: boolean;
  aiModel?: string;
}
