-- US-046: Modelo de Presupuestos
-- Crea la tabla `budgets` para representar presupuestos mensuales por categoría.
-- Criterios de Aceptación:
-- - Presupuesto mensual por categoría
-- - Monto en minor units
-- - Porcentaje asignado
-- - Suma de porcentajes <= 100%
-- - Usuario aislado por RLS

CREATE TABLE IF NOT EXISTS public.budgets (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID          NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id   UUID          NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,

  -- Periodo mensual YYYY-MM
  month         VARCHAR(7)    NOT NULL CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),

  -- Monto presupuestado en unidades menores (centavos)
  amount_minor  BIGINT        NOT NULL CHECK (amount_minor > 0),

  -- Porcentaje del presupuesto total (0.00 a 100.00)
  percentage    NUMERIC(5,2)  NOT NULL CHECK (percentage >= 0.00 AND percentage <= 100.00),

  -- Moneda y notas
  currency      CHAR(3)       NOT NULL DEFAULT 'MXN',
  notes         TEXT,

  -- Estado del presupuesto
  is_active     BOOLEAN       NOT NULL DEFAULT true,

  -- Auditoría
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),

  -- Restricción de unicidad: Una sola asignación presupuestal por categoría en un mismo mes
  CONSTRAINT uq_budgets_user_category_month UNIQUE (user_id, category_id, month)
);

-- Índices de consulta frecuente
CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON public.budgets(user_id, month);
CREATE INDEX IF NOT EXISTS idx_budgets_category_id ON public.budgets(category_id);
CREATE INDEX IF NOT EXISTS idx_budgets_is_active ON public.budgets(is_active);

-- Función y Trigger para garantizar invariante: suma de porcentajes <= 100% por usuario y mes
CREATE OR REPLACE FUNCTION public.check_budget_percentage_sum()
RETURNS TRIGGER AS $$
DECLARE
  total_pct NUMERIC;
BEGIN
  IF NEW.is_active = true THEN
    SELECT COALESCE(SUM(percentage), 0)
    INTO total_pct
    FROM public.budgets
    WHERE user_id = NEW.user_id
      AND month = NEW.month
      AND is_active = true
      AND id <> NEW.id;

    IF (total_pct + NEW.percentage) > 100.00 THEN
      RAISE EXCEPTION 'La suma total de porcentajes de presupuesto excede el 100%%. Total intentado: %', (total_pct + NEW.percentage);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_budget_percentage_sum ON public.budgets;
CREATE TRIGGER trg_check_budget_percentage_sum
  BEFORE INSERT OR UPDATE ON public.budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.check_budget_percentage_sum();

-- Seguridad: Row Level Security (RLS)
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own budgets"
  ON public.budgets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own budgets"
  ON public.budgets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own budgets"
  ON public.budgets FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own budgets"
  ON public.budgets FOR DELETE
  USING (auth.uid() = user_id);
