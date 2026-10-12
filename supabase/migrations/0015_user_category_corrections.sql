-- 0015_user_category_corrections.sql
-- US-032: Correcciones del Usuario y Aprendizaje de Reglas Reutilizables
--
-- Criterios de Aceptación:
-- Corrección guardada; puede crear regla/preferencia reutilizable; no altera el raw event original.

CREATE TABLE IF NOT EXISTS public.user_category_corrections (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Tipo de entidad intervenida y su ID
  entity_type             TEXT          NOT NULL CHECK (entity_type IN ('TRANSACTION', 'CANDIDATE')),
  entity_id               TEXT          NOT NULL,

  -- Vínculo de solo lectura al evento crudo de origen (inmutable)
  raw_event_id            UUID          REFERENCES public.raw_events(id) ON DELETE SET NULL,

  -- Datos del comercio
  merchant                TEXT,
  merchant_raw            TEXT,

  -- Historial de cambio de categoría
  previous_category_name  TEXT,
  previous_category_id    UUID          REFERENCES public.categories(id) ON DELETE SET NULL,
  new_category_name       TEXT          NOT NULL,
  new_category_id         UUID          REFERENCES public.categories(id) ON DELETE SET NULL,

  -- Si se convirtió en regla de aprendizaje para futuras operaciones
  save_as_rule            BOOLEAN       NOT NULL DEFAULT false,
  created_rule_id         UUID,
  pattern_used            TEXT,

  created_at              TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_user_category_corrections_user_id
  ON public.user_category_corrections(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_category_corrections_entity
  ON public.user_category_corrections(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_user_category_corrections_raw_event_id
  ON public.user_category_corrections(raw_event_id);

-- Comentarios explicativos
COMMENT ON TABLE public.user_category_corrections IS 'Auditoría inmutable de correcciones manuales de categoría realizadas por el usuario (US-032)';
COMMENT ON COLUMN public.user_category_corrections.raw_event_id IS 'Referencia inmutable al evento crudo original que nunca es alterado';
COMMENT ON COLUMN public.user_category_corrections.save_as_rule IS 'Indica si la corrección originó una regla de categorización reutilizable';

-- ── Row Level Security (RLS) ─────────────────────────────────────────────
ALTER TABLE public.user_category_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own category corrections"
  ON public.user_category_corrections
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own category corrections"
  ON public.user_category_corrections
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own category corrections"
  ON public.user_category_corrections
  FOR DELETE
  USING (auth.uid() = user_id);
