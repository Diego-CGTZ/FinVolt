-- US-007: Modelo de Categorías
-- Crea la tabla `categories` con RLS y un seed de categorías predefinidas
-- del sistema (user_id = NULL) disponibles para todos los usuarios.
--
-- Dependencias: US-005 (RLS base ya habilitado en el proyecto)

-- ── 1. Tabla categories ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  -- NULL indica categoría predefinida del sistema (compartida, no editable por usuario)
  name        TEXT        NOT NULL,
  icon        TEXT,                          -- nombre de icono (ej: "home", "car", "food")
  color       TEXT,                          -- color hex (ej: "#FF6B6B")
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Un usuario no puede tener dos categorías con el mismo nombre
  CONSTRAINT unique_category_per_user UNIQUE (user_id, name)
);

-- ── 2. Índices ─────────────────────────────────────────────────────────────────
CREATE INDEX idx_categories_user_id ON public.categories (user_id);

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- SELECT: el usuario ve sus propias categorías + las del sistema (user_id IS NULL)
CREATE POLICY "Users can view their own and system categories"
ON public.categories
FOR SELECT
USING (user_id IS NULL OR auth.uid() = user_id);

-- INSERT: solo puede insertar categorías propias (user_id debe ser su uid)
CREATE POLICY "Users can insert their own categories"
ON public.categories
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- UPDATE: solo puede editar sus propias categorías (no las del sistema)
CREATE POLICY "Users can update their own categories"
ON public.categories
FOR UPDATE
USING (auth.uid() = user_id);

-- DELETE: solo puede eliminar sus propias categorías
CREATE POLICY "Users can delete their own categories"
ON public.categories
FOR DELETE
USING (auth.uid() = user_id);

-- ── 4. Seed de categorías predefinidas del sistema ────────────────────────────
-- user_id = NULL → disponibles para todos, no editables por usuarios
INSERT INTO public.categories (name, icon, color, user_id) VALUES
  -- Gastos
  ('Alimentación',     'restaurant',    '#FF6B6B', NULL),
  ('Transporte',       'car',           '#4ECDC4', NULL),
  ('Vivienda',         'home',          '#45B7D1', NULL),
  ('Salud',            'medical',       '#96CEB4', NULL),
  ('Entretenimiento',  'game-controller','#FFEAA7', NULL),
  ('Ropa',             'shirt',         '#DDA0DD', NULL),
  ('Educación',        'book',          '#98D8C8', NULL),
  ('Servicios',        'flash',         '#F7DC6F', NULL),
  ('Supermercado',     'basket',        '#82E0AA', NULL),
  ('Restaurantes',     'fast-food',     '#F1948A', NULL),
  ('Cafeterías',       'cafe',          '#C39BD3', NULL),
  ('Gasolina',         'gas-station',   '#85C1E9', NULL),
  ('Suscripciones',    'card',          '#A9CCE3', NULL),
  ('Mascota',          'paw',           '#FAD7A0', NULL),
  ('Viajes',           'airplane',      '#A8D8EA', NULL),
  ('Regalos',          'gift',          '#FFA07A', NULL),
  ('Farmacia',         'medkit',        '#90EE90', NULL),
  ('Tecnología',       'laptop',        '#778CA3', NULL),
  ('Seguros',          'shield',        '#B8C6DB', NULL),
  ('Impuestos',        'document-text', '#CCD1D1', NULL),
  -- Ingresos
  ('Salario',          'briefcase',     '#27AE60', NULL),
  ('Freelance',        'laptop-outline','#2ECC71', NULL),
  ('Inversiones',      'trending-up',   '#52BE80', NULL),
  ('Ventas',           'storefront',    '#58D68D', NULL),
  ('Reembolsos',       'return-down-back','#A9DFBF', NULL),
  -- Transferencias / Neutro
  ('Transferencia',    'swap-horizontal','#BDC3C7', NULL),
  ('Ahorro',           'wallet',        '#2980B9', NULL),
  ('Otros',            'ellipsis-horizontal','#95A5A6', NULL)
ON CONFLICT DO NOTHING;
