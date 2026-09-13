ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();
ALTER TABLE public.tax_periods ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS categories_user_id_idx ON public.categories(user_id);
CREATE INDEX IF NOT EXISTS transactions_user_id_idx ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS documents_user_id_idx ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS tax_periods_user_id_idx ON public.tax_periods(user_id);
CREATE INDEX IF NOT EXISTS settings_user_id_idx ON public.settings(user_id);

DROP POLICY IF EXISTS "categories open" ON public.categories;
DROP POLICY IF EXISTS "transactions open" ON public.transactions;
DROP POLICY IF EXISTS "documents open" ON public.documents;
DROP POLICY IF EXISTS "tax_periods open" ON public.tax_periods;
DROP POLICY IF EXISTS "settings open" ON public.settings;

CREATE POLICY "categories own" ON public.categories FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "transactions own" ON public.transactions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "documents own" ON public.documents FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "tax_periods own" ON public.tax_periods FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "settings own" ON public.settings FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.categories FROM anon;
REVOKE ALL ON public.transactions FROM anon;
REVOKE ALL ON public.documents FROM anon;
REVOKE ALL ON public.tax_periods FROM anon;
REVOKE ALL ON public.settings FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_periods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT ALL ON public.categories TO service_role;
GRANT ALL ON public.transactions TO service_role;
GRANT ALL ON public.documents TO service_role;
GRANT ALL ON public.tax_periods TO service_role;
GRANT ALL ON public.settings TO service_role;

DROP POLICY IF EXISTS "belege read" ON storage.objects;
DROP POLICY IF EXISTS "belege insert" ON storage.objects;
DROP POLICY IF EXISTS "belege update" ON storage.objects;
DROP POLICY IF EXISTS "belege delete" ON storage.objects;

CREATE POLICY "belege owner read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'belege' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.storage_path = storage.objects.name AND d.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "belege owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'belege' AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "belege owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'belege' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.storage_path = storage.objects.name AND d.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    bucket_id = 'belege' AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "belege owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'belege' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.storage_path = storage.objects.name AND d.user_id = auth.uid()
      )
    )
  );