-- US-006: Modelo de Cuentas Financieras
-- Este script crea la tabla `accounts` y aplica políticas RLS para garantizar que un usuario 
-- solo pueda ver y modificar sus propias cuentas.

-- 1. Crear tipo enumerado para los tipos de cuenta
CREATE TYPE account_type AS ENUM (
  'CHECKING', 
  'SAVINGS', 
  'CREDIT_CARD', 
  'CASH', 
  'DIGITAL_WALLET', 
  'OTHER'
);

-- 2. Crear tabla accounts
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type account_type NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MXN',
  initial_balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Habilitar RLS
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- 4. Crear políticas RLS
-- Un usuario puede VER solo sus cuentas
CREATE POLICY "Users can view their own accounts" 
ON public.accounts 
FOR SELECT 
USING (auth.uid() = user_id);

-- Un usuario puede INSERTAR sus propias cuentas
CREATE POLICY "Users can insert their own accounts" 
ON public.accounts 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Un usuario puede ACTUALIZAR sus propias cuentas
CREATE POLICY "Users can update their own accounts" 
ON public.accounts 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Un usuario puede ELIMINAR sus propias cuentas
CREATE POLICY "Users can delete their own accounts" 
ON public.accounts 
FOR DELETE 
USING (auth.uid() = user_id);
