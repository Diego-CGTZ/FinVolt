/**
 * US-037: Almacenamiento en memoria para Estados de Cuenta Bancarios
 *
 * Emula el comportamiento seguro y particionado de Supabase Storage para
 * pruebas unitarias, desarrollo local y pruebas automatizadas offline.
 */

import type {
  IBankStatementStorageService,
  StatementUploadParams,
  StoredStatementFile,
} from '../../domain/interfaces/IBankStatementStorageService';

export class InMemoryStatementStorageService implements IBankStatementStorageService {
  public static readonly BUCKET_NAME = 'bank-statements';

  private storage: Map<string, { file: StoredStatementFile; buffer: Uint8Array | string }> = new Map();

  async upload(params: StatementUploadParams): Promise<StoredStatementFile> {
    const now = new Date();
    // Estructura segura: <userId>/<sha256>-<fileName>
    const storagePath = `${params.userId}/${params.sha256}-${params.fileName}`;
    const fileSizeBytes =
      params.fileBuffer instanceof Uint8Array
        ? params.fileBuffer.length
        : typeof params.fileBuffer === 'string'
          ? params.fileBuffer.length
          : 0;

    const storedFile: StoredStatementFile = {
      bucket: InMemoryStatementStorageService.BUCKET_NAME,
      storagePath,
      fileName: params.fileName,
      fileSizeBytes,
      mimeType: params.mimeType || 'application/pdf',
      sha256: params.sha256,
      userId: params.userId,
      uploadedAt: now,
    };

    this.storage.set(storagePath, {
      file: storedFile,
      buffer: params.fileBuffer,
    });

    return storedFile;
  }

  async getDownloadUrl(storagePath: string): Promise<string> {
    const item = this.storage.get(storagePath);
    if (!item) {
      throw new Error(`Archivo no encontrado en storage: ${storagePath}`);
    }
    return `https://inmemory.storage.local/${InMemoryStatementStorageService.BUCKET_NAME}/${storagePath}`;
  }

  async delete(storagePath: string): Promise<void> {
    this.storage.delete(storagePath);
  }

  async exists(storagePath: string): Promise<boolean> {
    return this.storage.has(storagePath);
  }

  /**
   * Helper para inspección en tests
   */
  getFile(storagePath: string): StoredStatementFile | null {
    return this.storage.get(storagePath)?.file || null;
  }

  count(): number {
    return this.storage.size;
  }

  clear(): void {
    this.storage.clear();
  }
}
