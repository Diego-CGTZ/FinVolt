-- US-025: Fingerprint determinístico para transaction_candidates
-- Agrega columna fingerprint a la tabla transaction_candidates para
-- soportar detección temprana de duplicados y reconciliación (US-025, US-026, US-027).

ALTER TABLE public.transaction_candidates
  ADD COLUMN IF NOT EXISTS fingerprint TEXT;

CREATE INDEX IF NOT EXISTS idx_candidates_fingerprint
  ON public.transaction_candidates (user_id, fingerprint)
  WHERE fingerprint IS NOT NULL;
