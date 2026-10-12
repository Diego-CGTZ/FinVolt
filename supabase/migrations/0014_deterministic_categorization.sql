-- 0014_deterministic_categorization.sql
-- US-031: Categorización Determinística (Merchant mapping -> Rules -> User corrections -> Fallback)
--
-- Crea la tabla `user_category_rules` para permitir a los usuarios definir
-- mapeos de comercios, reglas sintácticas y correcciones manuales persistentes
-- que alimentan la Etapa 3 (User Corrections) del motor determinístico.

CREATE TABLE IF NOT EXISTS public.user_category_rules (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Patrón textual o nombre del comercio a coincidir
  merchant_pattern  TEXT          NOT NULL,

  -- Categoría asignada (nombre y referencia opcional a la tabla categories)
  category_name     TEXT          NOT NULL,
  category_id       UUID          REFERENCES public.categories(id) ON DELETE SET NULL,

  -- Prioridad para resolución de ambigüedades (mayor número = mayor precedencia)
  priority          SMALLINT      NOT NULL DEFAULT 50,

  -- Indica si la regla fue originada por corrección manual explícita
  is_user_correction BOOLEAN      NOT NULL DEFAULT true,

  is_active         BOOLEAN       NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Índices de consulta frecuente por usuario
CREATE INDEX IF NOT EXISTS idx_user_category_rules_user_id
  ON public.user_category_rules(user_id);

CREATE INDEX IF NOT EXISTS idx_user_category_rules_merchant_pattern
  ON public.user_category_rules(user_id, merchant_pattern);

-- Comentarios explicativos
COMMENT ON TABLE public.user_category_rules IS 'Reglas determinísticas y correcciones de usuario para categorización de transacciones (US-031)';
COMMENT ON COLUMN public.user_category_rules.merchant_pattern IS 'Patrón, palabra clave o nombre de comercio asociado';
COMMENT ON COLUMN public.user_category_rules.category_name IS 'Nombre canónico de la categoría asignada determinísticamente';

-- ── Row Level Security (RLS) ─────────────────────────────────────────────
ALTER TABLE public.user_category_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own category rules"
  ON public.user_category_rules
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own category rules"
  ON public.user_category_rules
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own category rules"
  ON public.user_category_rules
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own category rules"
  ON public.user_category_rules
  FOR DELETE
  USING (auth.uid() = user_id);
