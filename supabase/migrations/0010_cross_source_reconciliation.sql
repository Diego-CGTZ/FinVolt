-- US-027: Reconciliación cross-source
-- Agrega la columna sources_evidence (JSONB) para almacenar evidencia histórica de múltiples
-- fuentes (notificaciones, emails, estados de cuenta PDF/CSV) asociadas a la misma operación.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS sources_evidence JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_transactions_sources_evidence
  ON public.transactions USING gin (sources_evidence);
