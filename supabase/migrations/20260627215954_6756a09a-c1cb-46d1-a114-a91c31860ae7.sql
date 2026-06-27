
-- 1. Per-device sync_consent
ALTER TABLE public.sync_consent DROP CONSTRAINT IF EXISTS sync_consent_device_id_key;
ALTER TABLE public.sync_consent ADD COLUMN IF NOT EXISTS sync_mode text NOT NULL DEFAULT 'ask';
ALTER TABLE public.sync_consent ADD COLUMN IF NOT EXISTS device_label text;
ALTER TABLE public.sync_consent ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DO $$ BEGIN
  ALTER TABLE public.sync_consent ADD CONSTRAINT sync_consent_user_device_unique UNIQUE (user_id, device_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS update_sync_consent_updated_at ON public.sync_consent;
CREATE TRIGGER update_sync_consent_updated_at
  BEFORE UPDATE ON public.sync_consent
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Conflict-resolution metadata
ALTER TABLE public.transcripts ADD COLUMN IF NOT EXISTS updated_by_device text;
ALTER TABLE public.transcripts ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

ALTER TABLE public.speaker_segments ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.speaker_segments ADD COLUMN IF NOT EXISTS updated_by_device text;

DROP TRIGGER IF EXISTS update_speaker_segments_updated_at ON public.speaker_segments;
CREATE TRIGGER update_speaker_segments_updated_at
  BEFORE UPDATE ON public.speaker_segments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Recording sync timestamp
ALTER TABLE public.cloud_sessions ADD COLUMN IF NOT EXISTS recording_synced_at timestamptz;
ALTER TABLE public.cloud_sessions ADD COLUMN IF NOT EXISTS recording_size_bytes bigint;

-- 4. Idempotency for transcribe-audio
CREATE TABLE IF NOT EXISTS public.transcribe_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  audio_sha256 text,
  status text NOT NULL DEFAULT 'pending',
  response jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transcribe_requests TO authenticated;
GRANT ALL ON public.transcribe_requests TO service_role;

ALTER TABLE public.transcribe_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own transcribe requests"
  ON public.transcribe_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert their own transcribe requests"
  ON public.transcribe_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update their own transcribe requests"
  ON public.transcribe_requests FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete their own transcribe requests"
  ON public.transcribe_requests FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_transcribe_requests_updated_at ON public.transcribe_requests;
CREATE TRIGGER update_transcribe_requests_updated_at
  BEFORE UPDATE ON public.transcribe_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS transcribe_requests_user_created_idx
  ON public.transcribe_requests (user_id, created_at DESC);
