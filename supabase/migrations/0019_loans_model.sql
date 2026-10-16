-- US-049: Modelo de Préstamos y Contactos (Loans & Shared Expenses)
-- Crea las tablas `contacts`, `loans` y `loan_payments` para representar préstamos y saldos pendientes.
-- Criterios de Aceptación:
-- - User, Contact, Loan, Amount, Payments y Outstanding Balance
-- - Integridad de saldos estricta y aislamiento por usuario (RLS)

-- 1. Tabla de Contactos
CREATE TABLE IF NOT EXISTS public.contacts (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID          NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT          NOT NULL CHECK (length(trim(name)) > 0),
  phone       TEXT,
  email       TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON public.contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON public.contacts(user_id, name);

-- RLS: contacts
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own contacts"
  ON public.contacts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own contacts"
  ON public.contacts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own contacts"
  ON public.contacts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own contacts"
  ON public.contacts FOR DELETE
  USING (auth.uid() = user_id);

-- 2. Tabla de Préstamos (Loans)
CREATE TABLE IF NOT EXISTS public.loans (
  id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID          NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id                UUID          NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  type                      VARCHAR(10)   NOT NULL CHECK (type IN ('LENT', 'BORROWED')),
  amount_minor              BIGINT        NOT NULL CHECK (amount_minor > 0),
  paid_amount_minor         BIGINT        NOT NULL DEFAULT 0 CHECK (paid_amount_minor >= 0),
  outstanding_balance_minor BIGINT        NOT NULL CHECK (outstanding_balance_minor >= 0),
  currency                  CHAR(3)       NOT NULL DEFAULT 'MXN',
  description               TEXT          NOT NULL,
  due_date                  TIMESTAMPTZ,
  status                    VARCHAR(12)   NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAID', 'CANCELLED')),
  account_id                UUID          REFERENCES public.accounts(id) ON DELETE SET NULL,
  transaction_id            UUID          REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ   NOT NULL DEFAULT now(),

  -- Invariantes de saldos
  CONSTRAINT chk_loans_paid_le_amount CHECK (paid_amount_minor <= amount_minor),
  CONSTRAINT chk_loans_balance_math CHECK (outstanding_balance_minor = (amount_minor - paid_amount_minor))
);

CREATE INDEX IF NOT EXISTS idx_loans_user_id ON public.loans(user_id);
CREATE INDEX IF NOT EXISTS idx_loans_contact_id ON public.loans(contact_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON public.loans(user_id, status);
CREATE INDEX IF NOT EXISTS idx_loans_type ON public.loans(user_id, type);

-- RLS: loans
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own loans"
  ON public.loans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own loans"
  ON public.loans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own loans"
  ON public.loans FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own loans"
  ON public.loans FOR DELETE
  USING (auth.uid() = user_id);

-- 3. Tabla de Abonos / Pagos (Loan Payments)
CREATE TABLE IF NOT EXISTS public.loan_payments (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id         UUID          NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  user_id         UUID          NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_minor    BIGINT        NOT NULL CHECK (amount_minor > 0),
  payment_date    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  notes           TEXT,
  transaction_id  UUID          REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loan_payments_loan_id ON public.loan_payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_payments_user_id ON public.loan_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_loan_payments_date ON public.loan_payments(payment_date);

-- RLS: loan_payments
ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own loan payments"
  ON public.loan_payments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own loan payments"
  ON public.loan_payments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own loan payments"
  ON public.loan_payments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own loan payments"
  ON public.loan_payments FOR DELETE
  USING (auth.uid() = user_id);
