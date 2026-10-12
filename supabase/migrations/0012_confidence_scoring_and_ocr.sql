-- 0012_confidence_scoring_and_ocr.sql
-- US-029: Confidence Score & Reglas para OCR y Fuentes Heterogéneas
-- Agrega soporte formal para fuentes OCR en raw_event_source y transaction_source.

DO $$ BEGIN
  ALTER TYPE public.raw_event_source ADD VALUE IF NOT EXISTS 'OCR';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE public.transaction_source ADD VALUE IF NOT EXISTS 'OCR';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

COMMENT ON COLUMN public.transaction_candidates.confidence_score IS 'Puntuación determinística y reproducible de confianza 0-100 (US-029)';
COMMENT ON COLUMN public.transactions.confidence_score IS 'Puntuación determinística y reproducible de confianza 0-100 (US-029)';
