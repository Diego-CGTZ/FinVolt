-- US-037: Upload de PDF bancario (Statements Epic)
-- Bucket de almacenamiento seguro para estados de cuenta bancarios con RLS particionado por usuario.

-- 1. Crear el bucket en storage.buckets si no existe
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bank-statements',
  'bank-statements',
  false,
  20971520, -- 20 MB límite (20 * 1024 * 1024 bytes)
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY['application/pdf'];

-- 2. Políticas de seguridad (Row Level Security) para storage.objects
-- Estructura de rutas: bank-statements/<user_id>/<sha256>-<sanitized_filename>.pdf

-- Política: Insertar archivos únicamente en la carpeta correspondiente a auth.uid()
CREATE POLICY "Users can upload bank statements to own folder"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'bank-statements' AND
  auth.uid() = (storage.foldername(name))[1]::uuid
);

-- Política: El usuario solo puede consultar y descargar sus propios estados de cuenta
CREATE POLICY "Users can read own bank statements"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'bank-statements' AND
  auth.uid() = (storage.foldername(name))[1]::uuid
);

-- Política: El usuario solo puede eliminar sus propios estados de cuenta
CREATE POLICY "Users can delete own bank statements"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'bank-statements' AND
  auth.uid() = (storage.foldername(name))[1]::uuid
);
