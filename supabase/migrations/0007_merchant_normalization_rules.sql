-- US-024: Reglas de Normalización de Comercios (Normalization & Reconciliation Epic)
-- Crea la tabla `merchant_rules` para almacenar reglas determinísticas
-- y configurables que unifican variantes textuales de comercios en nombres canónicos
-- preservando el texto original de la transacción.

CREATE TABLE IF NOT EXISTS public.merchant_rules (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL para reglas del sistema
  merchant_name   TEXT          NOT NULL,                                    -- Nombre canónico (ej: 'Amazon', 'Uber')
  patterns        TEXT[]        NOT NULL DEFAULT '{}',                       -- Variantes y patrones reconocidos
  pattern_type    TEXT          NOT NULL DEFAULT 'CONTAINS' CHECK (pattern_type IN ('CONTAINS', 'REGEX', 'EXACT', 'PREFIX')),
  priority        SMALLINT      NOT NULL DEFAULT 50,                         -- Mayor número = mayor prioridad
  category_hint   TEXT,                                                      -- Sugerencia de categoría
  is_user_defined BOOLEAN       NOT NULL DEFAULT false,
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Índices de consulta frecuente
CREATE INDEX IF NOT EXISTS idx_merchant_rules_active_priority
  ON public.merchant_rules(is_active, priority DESC);

CREATE INDEX IF NOT EXISTS idx_merchant_rules_user_id
  ON public.merchant_rules(user_id);

CREATE INDEX IF NOT EXISTS idx_merchant_rules_merchant_name
  ON public.merchant_rules(merchant_name);

-- ── 3. Row Level Security (RLS) ─────────────────────────────────────────────
ALTER TABLE public.merchant_rules ENABLE ROW LEVEL SECURITY;

-- Lectura: Cualquier usuario autenticado puede leer las reglas globales (user_id IS NULL)
-- y sus propias reglas personalizadas (user_id = auth.uid())
CREATE POLICY "Users can read global and own merchant rules"
  ON public.merchant_rules
  FOR SELECT
  USING (user_id IS NULL OR user_id = auth.uid());

-- Inserción: Usuarios solo pueden crear reglas donde user_id = auth.uid()
CREATE POLICY "Users can create own merchant rules"
  ON public.merchant_rules
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- Modificación: Solo el dueño de la regla puede modificarla
CREATE POLICY "Users can update own merchant rules"
  ON public.merchant_rules
  FOR UPDATE
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid())
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- Eliminación: Solo el dueño puede eliminar sus reglas
CREATE POLICY "Users can delete own merchant rules"
  ON public.merchant_rules
  FOR DELETE
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid());
