/**
 * US-037: Contrato de Almacenamiento Seguro de Estados de Cuenta Bancarios
 *
 * Desacopla la infraestructura física (Supabase Storage, S3 o memoria)
 * del dominio de la aplicación.
 */

export interface StoredStatementFile {
  bucket: string;
  storagePath: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  sha256: string;
  userId: string;
  uploadedAt: Date;
}

export interface StatementUploadParams {
  userId: string;
  fileName: string;
  fileBuffer: Uint8Array | string;
  mimeType?: string;
  sha256: string;
}

export interface IBankStatementStorageService {
  /**
   * Sube un archivo de estado de cuenta de forma segura a la carpeta del usuario.
   */
  upload(params: StatementUploadParams): Promise<StoredStatementFile>;

  /**
   * Obtiene una URL firmada o accesible para descarga o lectura del documento.
   */
  getDownloadUrl(storagePath: string, expiresInSeconds?: number): Promise<string>;

  /**
   * Elimina un archivo de estado de cuenta almacenado.
   */
  delete(storagePath: string): Promise<void>;

  /**
   * Verifica si un archivo ya existe en storage para el usuario.
   */
  exists(storagePath: string): Promise<boolean>;
}
