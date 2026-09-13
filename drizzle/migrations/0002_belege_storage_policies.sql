CREATE POLICY "belege read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'belege');
CREATE POLICY "belege insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'belege');
CREATE POLICY "belege update" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'belege');
CREATE POLICY "belege delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'belege');
