-- 0013_confidence_thresholds.sql
-- US-030: Thresholds de Confianza y Reglas de Decisión Automatizada
--
-- Criterios de Aceptación:
-- ≥90 auto confirm; 70-89 register + review; <70 require user; thresholds configurables.
--
-- Crea la tabla `user_confidence_thresholds` para almacenar la parametrización
-- personalizada de los umbrales de decisión por cada usuario, manteniendo valores
-- por defecto canónicos (auto_confirm: 90, review: 70).

CREATE TABLE IF NOT EXISTS public.user_confidence_thresholds (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID          NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Umbral para confirmación automática sin intervención humana (Default: 90)
  auto_confirm_threshold  SMALLINT      NOT NULL DEFAULT 90
                                        CHECK (auto_confirm_threshold >= 0 AND auto_confirm_threshold <= 100),

  -- Umbral para registrar el movimiento pero encolarlo a revisión (Default: 70)
  review_threshold        SMALLINT      NOT NULL DEFAULT 70
                                        CHECK (review_threshold >= 0 AND review_threshold <= 100),

  -- Invariante relacional: el umbral de revisión no puede exceder el de auto-confirmación
  CONSTRAINT check_thresholds_coherence CHECK (review_threshold <= auto_confirm_threshold),

  created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Comentarios explicativos de dominio
COMMENT ON TABLE public.user_confidence_thresholds IS 'Configuración de umbrales de confianza por usuario para automatización de transacciones (US-030)';
COMMENT ON COLUMN public.user_confidence_thresholds.auto_confirm_threshold IS 'Score mínimo (>= auto_confirm) para auto-confirmar sin requerir usuario (Default: 90)';
COMMENT ON COLUMN public.user_confidence_thresholds.review_threshold IS 'Score mínimo (>= review && < auto_confirm) para registrar y revisar (Default: 70)';

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_user_confidence_thresholds_user_id
  ON public.user_confidence_thresholds(user_id);

-- ── Row Level Security (RLS) ─────────────────────────────────────────────
ALTER TABLE public.user_confidence_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own confidence thresholds"
  ON public.user_confidence_thresholds
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own confidence thresholds"
  ON public.user_confidence_thresholds
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own confidence thresholds"
  ON public.user_confidence_thresholds
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own confidence thresholds"
  ON public.user_confidence_thresholds
  FOR DELETE
  USING (auth.uid() = user_id);
