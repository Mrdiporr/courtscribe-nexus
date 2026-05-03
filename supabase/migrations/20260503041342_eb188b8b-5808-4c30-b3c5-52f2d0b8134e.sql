
-- 1. sync_consent: add user_id and scope policies
ALTER TABLE public.sync_consent ADD COLUMN IF NOT EXISTS user_id uuid;

DROP POLICY IF EXISTS "Authenticated insert sync_consent" ON public.sync_consent;
DROP POLICY IF EXISTS "Authenticated read sync_consent" ON public.sync_consent;
DROP POLICY IF EXISTS "Authenticated update sync_consent" ON public.sync_consent;

DELETE FROM public.sync_consent WHERE user_id IS NULL;
ALTER TABLE public.sync_consent ALTER COLUMN user_id SET NOT NULL;

CREATE POLICY "Users read own sync_consent" ON public.sync_consent
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own sync_consent" ON public.sync_consent
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own sync_consent" ON public.sync_consent
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own sync_consent" ON public.sync_consent
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 2. recordings storage bucket: scope by user folder
DROP POLICY IF EXISTS "Authenticated read from recordings" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload to recordings" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete from recordings" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update to recordings" ON storage.objects;
DROP POLICY IF EXISTS "Public read from recordings" ON storage.objects;
DROP POLICY IF EXISTS "Public upload to recordings" ON storage.objects;
DROP POLICY IF EXISTS "Public delete from recordings" ON storage.objects;

CREATE POLICY "Users read own recordings" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'recordings' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users upload own recordings" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'recordings' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users update own recordings" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'recordings' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete own recordings" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'recordings' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 3. Missing DELETE policies
CREATE POLICY "Users can delete own sessions" ON public.cloud_sessions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own transcripts" ON public.transcripts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
