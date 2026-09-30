-- US-018: Modelo Raw Event (Android Ingestion Epic)
-- Crea la tabla `raw_events` para almacenar e inmutabilizar toda entrada externa
-- antes de que sea procesada o parseada. NUNCA se inserta directamente en `transactions`.
--
-- Principios de diseño:
-- 1. Inmutabilidad de la entrada: El payload y raw_text original se preservan íntegros.
-- 2. Trazabilidad completa: Relacionable con transacciones mediante source_event_id.
-- 3. Reprocesabilidad: Si un parser falla o se actualiza, el evento puede reprocesarse.
-- 4. Aislamiento: RLS garantiza que ningún usuario acceda a eventos de otro.

-- ── 1. Tipos ENUM ──────────────────────────────────────────────────────────────

-- Fuente del evento externo
DO $$ BEGIN
  CREATE TYPE public.raw_event_source AS ENUM (
    'ANDROID_NOTIFICATION', -- Notificación push capturada en el dispositivo
    'EMAIL',                -- Correo electrónico financiero recibido
    'SMS',                  -- Mensaje de texto bancario
    'BANK_PDF',             -- Archivo PDF de estado de cuenta
    'BANK_CSV',             -- Archivo CSV exportado del banco
    'BANK_XLSX',            -- Hoja de cálculo Excel bancaria
    'MANUAL_IMPORT'         -- Importación manual ad-hoc
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Estado del ciclo de vida del evento crudo
DO $$ BEGIN
  CREATE TYPE public.raw_event_status AS ENUM (
    'PENDING',              -- Recibido y encolado, listo para ser procesado
    'PROCESSED',            -- Parseado exitosamente a transacción o candidato
    'FAILED',               -- Error durante el parseo o extracción
    'IGNORED'               -- No financiero o descartado por reglas de exclusión
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ── 2. Tabla raw_events ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.raw_events (
  -- Identidad
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID          NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Origen y procedencia
  source            public.raw_event_source NOT NULL,
  source_id         TEXT,                             -- Identificador externo (ej. key de notificación, Message-ID)

  -- Datos originales inmutables
  payload           JSONB         NOT NULL DEFAULT '{}'::jsonb, -- Estructura completa de la entrada original
  raw_text          TEXT,                             -- Texto plano original (cuerpo de notificación, etc.)

  -- Metadatos y contexto
  metadata          JSONB         NOT NULL DEFAULT '{}'::jsonb, -- Package name, headers, app version, etc.

  -- Ciclo de vida y procesamiento
  status            public.raw_event_status NOT NULL DEFAULT 'PENDING',
  error_message     TEXT,                             -- Detalle del error si status = 'FAILED'
  retry_count       INTEGER       NOT NULL DEFAULT 0 CHECK (retry_count >= 0),

  -- Marcas temporales
  received_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(), -- Momento en que el evento fue capturado
  processed_at      TIMESTAMPTZ,                          -- Momento en que concluyó el procesamiento
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── 3. Índices ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_raw_events_user_id     ON public.raw_events (user_id);
CREATE INDEX IF NOT EXISTS idx_raw_events_status      ON public.raw_events (status);
CREATE INDEX IF NOT EXISTS idx_raw_events_source      ON public.raw_events (source);
CREATE INDEX IF NOT EXISTS idx_raw_events_received_at ON public.raw_events (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_events_user_status ON public.raw_events (user_id, status);

-- Evitar duplicados idénticos por usuario cuando la fuente proporciona source_id
CREATE UNIQUE INDEX IF NOT EXISTS uq_raw_events_user_source_id 
  ON public.raw_events (user_id, source, source_id) 
  WHERE source_id IS NOT NULL;

-- ── 4. Trigger para updated_at ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_raw_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_raw_events_updated_at ON public.raw_events;
CREATE TRIGGER trigger_raw_events_updated_at
  BEFORE UPDATE ON public.raw_events
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_raw_events_updated_at();

-- ── 5. Seguridad: Row Level Security (RLS) ─────────────────────────────────────
ALTER TABLE public.raw_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own raw events" ON public.raw_events;
CREATE POLICY "Users can view own raw events"
  ON public.raw_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own raw events" ON public.raw_events;
CREATE POLICY "Users can insert own raw events"
  ON public.raw_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own raw events" ON public.raw_events;
CREATE POLICY "Users can update own raw events"
  ON public.raw_events FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own raw events" ON public.raw_events;
CREATE POLICY "Users can delete own raw events"
  ON public.raw_events FOR DELETE
  USING (auth.uid() = user_id);
