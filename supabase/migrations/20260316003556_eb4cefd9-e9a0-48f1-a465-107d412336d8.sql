-- Create profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add user_id to tables that need ownership
ALTER TABLE public.cases ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.cloud_sessions ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.transcripts ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Allow public insert for cases" ON public.cases;
DROP POLICY IF EXISTS "Allow public read for cases" ON public.cases;
DROP POLICY IF EXISTS "Allow public update for cases" ON public.cases;

DROP POLICY IF EXISTS "Allow public insert for cloud_sessions" ON public.cloud_sessions;
DROP POLICY IF EXISTS "Allow public read for cloud_sessions" ON public.cloud_sessions;
DROP POLICY IF EXISTS "Allow public update for cloud_sessions" ON public.cloud_sessions;

DROP POLICY IF EXISTS "Allow public insert for transcripts" ON public.transcripts;
DROP POLICY IF EXISTS "Allow public read for transcripts" ON public.transcripts;
DROP POLICY IF EXISTS "Allow public update for transcripts" ON public.transcripts;

DROP POLICY IF EXISTS "Allow public insert for speaker_segments" ON public.speaker_segments;
DROP POLICY IF EXISTS "Allow public read for speaker_segments" ON public.speaker_segments;
DROP POLICY IF EXISTS "Allow public update for speaker_segments" ON public.speaker_segments;
DROP POLICY IF EXISTS "Allow public delete for speaker_segments" ON public.speaker_segments;

DROP POLICY IF EXISTS "Allow public insert for cloud_adjournments" ON public.cloud_adjournments;
DROP POLICY IF EXISTS "Allow public read for cloud_adjournments" ON public.cloud_adjournments;
DROP POLICY IF EXISTS "Allow public update for cloud_adjournments" ON public.cloud_adjournments;

-- New authenticated-only policies for cases
CREATE POLICY "Users can read own cases" ON public.cases
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own cases" ON public.cases
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own cases" ON public.cases
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own cases" ON public.cases
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- New authenticated-only policies for cloud_sessions
CREATE POLICY "Users can read own sessions" ON public.cloud_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON public.cloud_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON public.cloud_sessions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- New authenticated-only policies for transcripts
CREATE POLICY "Users can read own transcripts" ON public.transcripts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transcripts" ON public.transcripts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own transcripts" ON public.transcripts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Speaker segments: access via transcript ownership
CREATE POLICY "Users can read own speaker_segments" ON public.speaker_segments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.transcripts t WHERE t.id = transcript_id AND t.user_id = auth.uid()));
CREATE POLICY "Users can insert own speaker_segments" ON public.speaker_segments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.transcripts t WHERE t.id = transcript_id AND t.user_id = auth.uid()));
CREATE POLICY "Users can update own speaker_segments" ON public.speaker_segments
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.transcripts t WHERE t.id = transcript_id AND t.user_id = auth.uid()));
CREATE POLICY "Users can delete own speaker_segments" ON public.speaker_segments
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.transcripts t WHERE t.id = transcript_id AND t.user_id = auth.uid()));

-- Cloud adjournments: access via session ownership
CREATE POLICY "Users can read own adjournments" ON public.cloud_adjournments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cloud_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));
CREATE POLICY "Users can insert own adjournments" ON public.cloud_adjournments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.cloud_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));
CREATE POLICY "Users can update own adjournments" ON public.cloud_adjournments
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cloud_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));

-- Update storage policies to require authentication
DROP POLICY IF EXISTS "Allow public upload to recordings" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read from recordings" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete from recordings" ON storage.objects;

CREATE POLICY "Authenticated upload to recordings" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'recordings');
CREATE POLICY "Authenticated read from recordings" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'recordings');
CREATE POLICY "Authenticated delete from recordings" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'recordings');

-- Updated_at trigger for profiles
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();