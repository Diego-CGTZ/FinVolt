-- US-044: Modelo de Obligaciones Futuras
-- Crea la tabla `future_obligations` para representar ingresos y gastos futuros
-- comprometidos o esperados (renta, nómina, préstamos, suscripciones, pago de crédito).
-- Base relacional para US-045 (Liquidez Proyectada) y US-056 (Credit Due Date Alert).

CREATE TABLE IF NOT EXISTS public.future_obligations (
  id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID          NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Relaciones opcionales cuando apliquen
  account_id                UUID          REFERENCES public.accounts(id) ON DELETE SET NULL,
  category_id               UUID          REFERENCES public.categories(id) ON DELETE SET NULL,
  recurring_transaction_id  TEXT,

  -- Definición descriptiva
  name                      TEXT          NOT NULL,
  description               TEXT,

  -- Dirección y naturaleza contable
  direction                 TEXT          NOT NULL CHECK (direction IN ('INCOME', 'EXPENSE')),
  obligation_type           TEXT          NOT NULL CHECK (
    obligation_type IN ('SALARY', 'RENT', 'SUBSCRIPTION', 'LOAN', 'UTILITY', 'CREDIT_CARD_PAYMENT', 'OTHER')
  ),
  certainty                 TEXT          NOT NULL DEFAULT 'COMMITTED' CHECK (certainty IN ('COMMITTED', 'EXPECTED')),

  -- Monto en unidades menores (centavos)
  amount_minor              BIGINT        NOT NULL CHECK (amount_minor > 0),
  currency                  CHAR(3)       NOT NULL DEFAULT 'MXN',

  -- Periodicidad y cálculo de ocurrencias
  periodicity               TEXT          NOT NULL CHECK (
    periodicity IN ('WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'ANNUAL', 'CUSTOM', 'ONE_TIME')
  ),
  interval_days             INTEGER       CHECK (interval_days IS NULL OR interval_days > 0),

  -- Fechas operacionales
  next_due_date             TIMESTAMPTZ   NOT NULL,
  anchor_day                SMALLINT      NOT NULL DEFAULT 1 CHECK (anchor_day BETWEEN 1 AND 31),
  end_date                  TIMESTAMPTZ,
  last_fulfilled_at         TIMESTAMPTZ,

  -- Estado del ciclo de vida
  status                    TEXT          NOT NULL DEFAULT 'ACTIVE' CHECK (
    status IN ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')
  ),

  -- Metadatos adicionales
  metadata                  JSONB         NOT NULL DEFAULT '{}'::jsonb,

  -- Auditoría
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_future_obligations_user_id ON public.future_obligations(user_id);
CREATE INDEX IF NOT EXISTS idx_future_obligations_next_due_date ON public.future_obligations(next_due_date);
CREATE INDEX IF NOT EXISTS idx_future_obligations_account_id ON public.future_obligations(account_id);
CREATE INDEX IF NOT EXISTS idx_future_obligations_category_id ON public.future_obligations(category_id);
CREATE INDEX IF NOT EXISTS idx_future_obligations_status ON public.future_obligations(status);

-- Seguridad: Row Level Security (RLS)
ALTER TABLE public.future_obligations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own future obligations"
  ON public.future_obligations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own future obligations"
  ON public.future_obligations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own future obligations"
  ON public.future_obligations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own future obligations"
  ON public.future_obligations FOR DELETE
  USING (auth.uid() = user_id);
