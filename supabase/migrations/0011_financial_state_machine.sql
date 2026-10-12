-- 0011_financial_state_machine.sql
-- US-028: State Machine financiera
-- Agrega el estado MATCHED al enum public.transaction_status para soportar
-- el ciclo de vida completo de transacciones conciliadas y emparejadas.

ALTER TYPE public.transaction_status ADD VALUE IF NOT EXISTS 'MATCHED' BEFORE 'CONFIRMED';

COMMENT ON TYPE public.transaction_status IS 'Estados formales de la State Machine financiera (US-028): CANDIDATE, MATCHED, CONFIRMED, PENDING, POSTED, REFUND, TRANSFER, DUPLICATE, REJECTED';
