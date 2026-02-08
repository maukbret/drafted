-- Create storage bucket for frame images (cropped slices)
INSERT INTO storage.buckets (id, name, public)
VALUES ('frame-images', 'frame-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload frame images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'frame-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to update their own frame images
CREATE POLICY "Users can update frame images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'frame-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to delete their own frame images
CREATE POLICY "Users can delete frame images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'frame-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow public read access to frame images
CREATE POLICY "Public can view frame images"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'frame-images');
