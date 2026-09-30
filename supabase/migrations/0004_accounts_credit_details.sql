-- US-017 / Account Credit Details: Fechas de corte, pago y límite de crédito
-- Permite registrar fechas de corte y pago opcionales para tarjetas de crédito.

ALTER TABLE public.accounts
ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(15, 2),
ADD COLUMN IF NOT EXISTS cutoff_day SMALLINT CHECK (cutoff_day BETWEEN 1 AND 31),
ADD COLUMN IF NOT EXISTS payment_due_day SMALLINT CHECK (payment_due_day BETWEEN 1 AND 31);
