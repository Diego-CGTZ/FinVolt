/**
 * US-037: Implementación de Almacenamiento de Estados de Cuenta sobre Supabase Storage
 *
 * Utiliza el bucket `bank-statements` con RLS particionado por usuario.
 * Ruta: <userId>/<sha256>-<sanitizedFileName>.pdf
 */

import { supabase } from '../api/supabaseClient';
import type {
  IBankStatementStorageService,
  StatementUploadParams,
  StoredStatementFile,
} from '../../domain/interfaces/IBankStatementStorageService';

export class SupabaseStatementStorageService implements IBankStatementStorageService {
  public static readonly BUCKET_NAME = 'bank-statements';

  private readonly bucketName: string;

  constructor(bucketName: string = SupabaseStatementStorageService.BUCKET_NAME) {
    this.bucketName = bucketName;
  }

  async upload(params: StatementUploadParams): Promise<StoredStatementFile> {
    const storagePath = `${params.userId}/${params.sha256}-${params.fileName}`;
    const contentType = params.mimeType || 'application/pdf';
    const now = new Date();

    const fileSizeBytes =
      params.fileBuffer instanceof Uint8Array
        ? params.fileBuffer.length
        : typeof params.fileBuffer === 'string'
          ? params.fileBuffer.length
          : 0;

    const { error } = await supabase.storage
      .from(this.bucketName)
      .upload(storagePath, params.fileBuffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      throw new Error(`Error al subir el estado de cuenta a Supabase Storage: ${error.message}`);
    }

    return {
      bucket: this.bucketName,
      storagePath,
      fileName: params.fileName,
      fileSizeBytes,
      mimeType: contentType,
      sha256: params.sha256,
      userId: params.userId,
      uploadedAt: now,
    };
  }

  async getDownloadUrl(storagePath: string, expiresInSeconds = 3600): Promise<string> {
    const { data, error } = await supabase.storage
      .from(this.bucketName)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new Error(
        `Error al generar URL firmada para ${storagePath}: ${error?.message || 'URL no generada'}`,
      );
    }

    return data.signedUrl;
  }

  async delete(storagePath: string): Promise<void> {
    const { error } = await supabase.storage.from(this.bucketName).remove([storagePath]);
    if (error) {
      throw new Error(`Error al eliminar estado de cuenta de Supabase Storage: ${error.message}`);
    }
  }

  async exists(storagePath: string): Promise<boolean> {
    try {
      const folder = storagePath.split('/')[0];
      const filename = storagePath.split('/').slice(1).join('/');

      const { data, error } = await supabase.storage.from(this.bucketName).list(folder, {
        search: filename,
      });

      if (error || !data) return false;
      return data.some((f) => f.name === filename);
    } catch {
      return false;
    }
  }
}
