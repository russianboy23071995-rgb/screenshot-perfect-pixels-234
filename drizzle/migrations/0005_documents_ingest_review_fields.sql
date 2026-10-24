ALTER TABLE public.documents
  ADD COLUMN sha256 text,
  ADD COLUMN source text,
  ADD COLUMN source_ref text,
  ADD COLUMN sender text,
  ADD COLUMN subject text,
  ADD COLUMN received_at timestamptz,
  ADD COLUMN review_status text NOT NULL DEFAULT 'neu',
  ADD COLUMN review_note text;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_review_status_check
  CHECK (review_status IN ('neu','zu_pruefen','geprueft','dublette','fehler'));

UPDATE public.documents SET review_status = 'geprueft';

CREATE UNIQUE INDEX documents_user_sha256_unique
  ON public.documents (user_id, sha256)
  WHERE sha256 IS NOT NULL;