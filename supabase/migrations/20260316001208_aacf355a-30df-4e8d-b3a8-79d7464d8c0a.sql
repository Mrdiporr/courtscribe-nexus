
-- Create storage bucket for audio recordings
INSERT INTO storage.buckets (id, name, public)
VALUES ('recordings', 'recordings', false);

-- Allow public upload to recordings bucket
CREATE POLICY "Allow public upload to recordings"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'recordings');

-- Allow public read from recordings bucket
CREATE POLICY "Allow public read from recordings"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'recordings');

-- Allow public delete from recordings bucket (for re-uploads)
CREATE POLICY "Allow public delete from recordings"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'recordings');
