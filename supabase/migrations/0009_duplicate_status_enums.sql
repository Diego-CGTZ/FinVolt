-- US-026: Detección de duplicados
-- Agrega el valor 'DUPLICATE' a candidate_status y raw_event_status si no existen previamente.

DO $$ BEGIN
  ALTER TYPE public.candidate_status ADD VALUE IF NOT EXISTS 'DUPLICATE';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE public.raw_event_status ADD VALUE IF NOT EXISTS 'DUPLICATE';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
