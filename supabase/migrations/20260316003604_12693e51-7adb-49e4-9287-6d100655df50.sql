-- Fix sync_consent table policies
DROP POLICY IF EXISTS "Allow public insert for sync_consent" ON public.sync_consent;
DROP POLICY IF EXISTS "Allow public read for sync_consent" ON public.sync_consent;
DROP POLICY IF EXISTS "Allow public update for sync_consent" ON public.sync_consent;

CREATE POLICY "Authenticated insert sync_consent" ON public.sync_consent
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated read sync_consent" ON public.sync_consent
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated update sync_consent" ON public.sync_consent
  FOR UPDATE TO authenticated USING (true);