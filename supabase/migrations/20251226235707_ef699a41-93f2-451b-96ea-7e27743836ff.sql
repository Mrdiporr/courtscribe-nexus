-- Create cases table with unique case number
CREATE TABLE public.cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_number TEXT NOT NULL UNIQUE,
  case_title TEXT,
  court_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create cloud_sessions table for synced session data
CREATE TABLE public.cloud_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  local_id TEXT NOT NULL UNIQUE,
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  recording_posture TEXT NOT NULL DEFAULT 'personal_notes',
  review_complete BOOLEAN NOT NULL DEFAULT false,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  total_duration_ms BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create transcripts table
CREATE TABLE public.transcripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.cloud_sessions(id) ON DELETE CASCADE,
  full_text TEXT,
  language_code TEXT DEFAULT 'en',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create speaker_segments table for diarization
CREATE TABLE public.speaker_segments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transcript_id UUID NOT NULL REFERENCES public.transcripts(id) ON DELETE CASCADE,
  speaker_id TEXT NOT NULL,
  speaker_label TEXT NOT NULL DEFAULT 'Speaker',
  segment_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  start_ms BIGINT NOT NULL,
  end_ms BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create cloud_adjournments table
CREATE TABLE public.cloud_adjournments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.cloud_sessions(id) ON DELETE CASCADE,
  timestamp_ms BIGINT NOT NULL,
  next_date DATE,
  reason TEXT,
  confidence TEXT NOT NULL DEFAULT 'unconfirmed',
  confirmed_at TIMESTAMP WITH TIME ZONE,
  confirmed_by TEXT NOT NULL DEFAULT 'unconfirmed',
  google_calendar_event_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sync_consent table to track user consent
CREATE TABLE public.sync_consent (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  consented BOOLEAN NOT NULL DEFAULT false,
  consented_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_cloud_sessions_case_id ON public.cloud_sessions(case_id);
CREATE INDEX idx_cloud_sessions_local_id ON public.cloud_sessions(local_id);
CREATE INDEX idx_transcripts_session_id ON public.transcripts(session_id);
CREATE INDEX idx_speaker_segments_transcript_id ON public.speaker_segments(transcript_id);
CREATE INDEX idx_speaker_segments_speaker_id ON public.speaker_segments(speaker_id);
CREATE INDEX idx_cloud_adjournments_session_id ON public.cloud_adjournments(session_id);
CREATE INDEX idx_cases_case_number ON public.cases(case_number);

-- Enable RLS on all tables
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloud_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.speaker_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloud_adjournments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_consent ENABLE ROW LEVEL SECURITY;

-- Create public access policies (since no auth is required for this app)
CREATE POLICY "Allow public read for cases"
  ON public.cases FOR SELECT USING (true);

CREATE POLICY "Allow public insert for cases"
  ON public.cases FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update for cases"
  ON public.cases FOR UPDATE USING (true);

CREATE POLICY "Allow public read for cloud_sessions"
  ON public.cloud_sessions FOR SELECT USING (true);

CREATE POLICY "Allow public insert for cloud_sessions"
  ON public.cloud_sessions FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update for cloud_sessions"
  ON public.cloud_sessions FOR UPDATE USING (true);

CREATE POLICY "Allow public read for transcripts"
  ON public.transcripts FOR SELECT USING (true);

CREATE POLICY "Allow public insert for transcripts"
  ON public.transcripts FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update for transcripts"
  ON public.transcripts FOR UPDATE USING (true);

CREATE POLICY "Allow public read for speaker_segments"
  ON public.speaker_segments FOR SELECT USING (true);

CREATE POLICY "Allow public insert for speaker_segments"
  ON public.speaker_segments FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update for speaker_segments"
  ON public.speaker_segments FOR UPDATE USING (true);

CREATE POLICY "Allow public read for cloud_adjournments"
  ON public.cloud_adjournments FOR SELECT USING (true);

CREATE POLICY "Allow public insert for cloud_adjournments"
  ON public.cloud_adjournments FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update for cloud_adjournments"
  ON public.cloud_adjournments FOR UPDATE USING (true);

CREATE POLICY "Allow public read for sync_consent"
  ON public.sync_consent FOR SELECT USING (true);

CREATE POLICY "Allow public insert for sync_consent"
  ON public.sync_consent FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update for sync_consent"
  ON public.sync_consent FOR UPDATE USING (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for updated_at
CREATE TRIGGER update_cases_updated_at
  BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cloud_sessions_updated_at
  BEFORE UPDATE ON public.cloud_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_transcripts_updated_at
  BEFORE UPDATE ON public.transcripts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();