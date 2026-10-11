-- US-023: Modelo Transaction Candidate (Normalization & Reconciliation Epic)
-- Crea la tabla `transaction_candidates` para almacenar representaciones intermedias
-- normalizadas de movimientos financieros generados por el pipeline de ingestión
-- (notificaciones, emails, estados de cuenta, etc.) antes de ser conciliados
-- o confirmados por el usuario.
--
-- INVARIANTE ESTRICTA DE DOMINIO:
-- Un TransactionCandidate NO es una Transaction final.
-- NUNCA se inserta directamente en la tabla `transactions` sin pasar formalmente
-- por la conciliación o confirmación del usuario.

-- ── 1. Tipos ENUM ──────────────────────────────────────────────────────────────

-- Estado del ciclo de vida del candidato de transacción
DO $$ BEGIN
  CREATE TYPE public.candidate_status AS ENUM (
    'PENDING_REVIEW',   -- Detectado y pendiente de revisión o confirmación
    'AUTO_CONFIRMED',   -- Confirmado automáticamente por reglas de alta confianza
    'REJECTED',         -- Descartado por el usuario o por regla de exclusión
    'RECONCILED'        -- Vinculado y reconciliado formalmente con una transacción existente
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ── 2. Tabla transaction_candidates ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transaction_candidates (
  -- Identidad
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID          NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Vínculo inmutable con el evento crudo de origen (US-018)
  raw_event_id      UUID          NOT NULL REFERENCES public.raw_events(id) ON DELETE CASCADE,

  -- Fuente y proveedor detectado
  source            public.raw_event_source NOT NULL,
  provider          TEXT          NOT NULL,                       -- Ej: 'BBVA', 'NU', 'SANTANDER', 'GENERIC'

  -- Valores financieros cuantitativos
  amount_minor      BIGINT        NOT NULL CHECK (amount_minor > 0), -- Monto en centavos (minor units)
  currency          CHAR(3)       NOT NULL DEFAULT 'MXN',            -- ISO 4217
  type              public.transaction_type NOT NULL,                -- EXPENSE, INCOME, TRANSFER

  -- Datos normalizados preliminares de comercio
  merchant_raw      TEXT,                                            -- Comercio exacto extraído de la fuente
  merchant          TEXT,                                            -- Nombre normalizado preliminar

  -- Momento operacional
  occurred_at       TIMESTAMPTZ   NOT NULL,                          -- Fecha/hora reportada por la fuente

  -- Confianza y clasificación
  confidence_score  SMALLINT      NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),

  -- Pistas y contexto de la cuenta involucrada
  account_hint      JSONB         DEFAULT '{}'::jsonb,              -- Ej: {"last4Digits": "1029", "accountType": "DEBIT"}

  -- Ciclo de vida y estado
  status            public.candidate_status NOT NULL DEFAULT 'PENDING_REVIEW',

  -- Trazabilidad íntegra
  raw_payload       JSONB         NOT NULL DEFAULT '{}'::jsonb,      -- Copia del payload original
  metadata          JSONB         NOT NULL DEFAULT '{}'::jsonb,      -- Metadatos adicionales de extracción

  -- Marcas de tiempo
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── 3. Índices para rendimiento ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_candidates_user_id
  ON public.transaction_candidates (user_id);

CREATE INDEX IF NOT EXISTS idx_candidates_raw_event_id
  ON public.transaction_candidates (raw_event_id);

CREATE INDEX IF NOT EXISTS idx_candidates_status
  ON public.transaction_candidates (user_id, status);

CREATE INDEX IF NOT EXISTS idx_candidates_occurred_at
  ON public.transaction_candidates (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidates_provider
  ON public.transaction_candidates (user_id, provider);

CREATE INDEX IF NOT EXISTS idx_candidates_confidence
  ON public.transaction_candidates (user_id, confidence_score);

-- ── 4. Trigger de actualización automática de updated_at ───────────────────────
CREATE OR REPLACE FUNCTION public.handle_candidate_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  new.updated_at = NOW();
  RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_candidate_updated ON public.transaction_candidates;
CREATE TRIGGER on_candidate_updated
  BEFORE UPDATE ON public.transaction_candidates
  FOR EACH ROW EXECUTE PROCEDURE public.handle_candidate_updated_at();

-- ── 5. Seguridad: Row Level Security (RLS) ────────────────────────────────────
ALTER TABLE public.transaction_candidates ENABLE ROW LEVEL SECURITY;

-- Política SELECT: El usuario solo puede consultar sus propios candidatos
CREATE POLICY "Users can view own transaction candidates"
  ON public.transaction_candidates
  FOR SELECT
  USING (auth.uid() = user_id);

-- Política INSERT: El usuario solo puede registrar candidatos bajo su identidad
CREATE POLICY "Users can insert own transaction candidates"
  ON public.transaction_candidates
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Política UPDATE: El usuario solo puede actualizar candidatos propios
CREATE POLICY "Users can update own transaction candidates"
  ON public.transaction_candidates
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Política DELETE: El usuario solo puede eliminar candidatos propios
CREATE POLICY "Users can delete own transaction candidates"
  ON public.transaction_candidates
  FOR DELETE
  USING (auth.uid() = user_id);
