-- US-008: Modelo canónico de transacción
-- Crea la tabla `transactions` como el modelo único de transacción de la aplicación.
-- Toda operación financiera (manual, importada o auto-detectada) termina aquí.
--
-- Dependencias:
--   US-006 — tabla `accounts` debe existir
--   US-007 — tabla `categories` debe existir

-- ── 1. Tipos ENUM ──────────────────────────────────────────────────────────────

-- Tipo de transacción
CREATE TYPE public.transaction_type AS ENUM (
  'EXPENSE',    -- Gasto (dinero sale de la cuenta)
  'INCOME',     -- Ingreso (dinero entra a la cuenta)
  'TRANSFER'    -- Transferencia entre cuentas propias
);

-- Estado del ciclo de vida de la transacción (ver US-028 para la state machine completa)
CREATE TYPE public.transaction_status AS ENUM (
  'CANDIDATE',  -- Detectada automáticamente, pendiente de revisión
  'CONFIRMED',  -- Confirmada por el usuario o con alta confianza
  'PENDING',    -- Autorizada pero no liquidada (ej: reserva de hotel)
  'POSTED',     -- Liquidada/asentada en el banco
  'TRANSFER',   -- Parte de una transferencia entre cuentas
  'REFUND',     -- Devolución de una transacción anterior
  'DUPLICATE',  -- Detectada como duplicado de otra entrada
  'REJECTED'    -- Descartada (falso positivo, error, etc.)
);

-- Fuente de origen de la transacción
CREATE TYPE public.transaction_source AS ENUM (
  'MANUAL',         -- Registrada a mano por el usuario
  'NOTIFICATION',   -- Capturada desde notificación push del banco
  'EMAIL',          -- Extraída de un correo financiero
  'SMS',            -- Extraída de SMS bancario
  'STATEMENT_PDF',  -- Importada de un estado de cuenta PDF
  'STATEMENT_CSV',  -- Importada de un CSV bancario
  'STATEMENT_XLSX'  -- Importada de un Excel bancario
);

-- ── 2. Tabla transactions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  -- Identidad
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Cuenta y tipo
  account_id        UUID          NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  type              public.transaction_type   NOT NULL,

  -- Monto (en minor units de la moneda — centavos)
  -- Ej: MXN 123.45 → amount_minor = 12345, currency = 'MXN'
  -- Evitamos decimales flotantes para precisión exacta en operaciones financieras.
  amount_minor      BIGINT        NOT NULL CHECK (amount_minor > 0),
  currency          CHAR(3)       NOT NULL DEFAULT 'MXN',

  -- Fechas operacionales
  occurred_at       TIMESTAMPTZ   NOT NULL,             -- Cuándo ocurrió el evento (del usuario o fuente)
  posted_at         TIMESTAMPTZ,                        -- Cuándo fue liquidada por el banco (nullable si pending)

  -- Datos del comercio / contraparte
  merchant_raw      TEXT,                               -- Nombre original (tal como llega de la fuente)
  merchant          TEXT,                               -- Nombre normalizado (ver US-024)
  description       TEXT,                               -- Nota o descripción libre

  -- Clasificación
  category_id       UUID          REFERENCES public.categories(id) ON DELETE SET NULL,

  -- Trazabilidad de fuente
  source            public.transaction_source NOT NULL DEFAULT 'MANUAL',
  source_event_id   TEXT,                               -- ID del raw_event de origen (ver US-018)

  -- Reconciliación y deduplicación
  status            public.transaction_status NOT NULL DEFAULT 'CONFIRMED',
  confidence_score  SMALLINT      CHECK (confidence_score BETWEEN 0 AND 100),
  -- Huella determinística para detección de duplicados (ver US-025)
  -- sha256( account_id || amount_minor || currency || date(occurred_at) || merchant_raw || type )
  fingerprint       TEXT          UNIQUE,

  -- Para transferencias: referencia a la transacción contraria (cuenta destino)
  linked_transaction_id UUID      REFERENCES public.transactions(id) ON DELETE SET NULL,

  -- Timestamps de sistema
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── 3. Índices ─────────────────────────────────────────────────────────────────
-- Consultas por usuario (siempre presentes en queries con RLS)
CREATE INDEX idx_transactions_user_id      ON public.transactions (user_id);

-- Consultas por cuenta (balances, listados por cuenta)
CREATE INDEX idx_transactions_account_id  ON public.transactions (account_id);

-- Rango de fechas (el caso más común: "transacciones del mes")
CREATE INDEX idx_transactions_occurred_at ON public.transactions (occurred_at DESC);

-- Búsqueda por estado (filtros de candidatos, pendientes, etc.)
CREATE INDEX idx_transactions_status      ON public.transactions (status);

-- Búsqueda por categoría (reportes por categoría)
CREATE INDEX idx_transactions_category_id ON public.transactions (category_id);

-- Deduplicación rápida por fingerprint
CREATE INDEX idx_transactions_fingerprint ON public.transactions (fingerprint) WHERE fingerprint IS NOT NULL;

-- ── 4. Trigger para updated_at ─────────────────────────────────────────────────
-- Reutiliza la función update_updated_at_column() creada en 0000_core_security.sql
CREATE TRIGGER set_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 5. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- SELECT: el usuario solo ve sus propias transacciones
CREATE POLICY "Users can view own transactions"
  ON public.transactions
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: el usuario solo puede crear transacciones para sí mismo
CREATE POLICY "Users can insert own transactions"
  ON public.transactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: el usuario solo puede editar sus propias transacciones
CREATE POLICY "Users can update own transactions"
  ON public.transactions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: el usuario solo puede borrar sus propias transacciones
CREATE POLICY "Users can delete own transactions"
  ON public.transactions
  FOR DELETE
  USING (auth.uid() = user_id);
