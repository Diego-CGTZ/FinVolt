/**
 * US-041: Validador de Archivos XLSX y Hojas de Cálculo Financieras
 *
 * Criterios de Aceptación:
 * 1. Validación de extensión (.xlsx, .xlsm, .xls) y tipo MIME permitido.
 * 2. Validación de tamaño (no vacío, límite de 20 MB).
 * 3. Sanitización de nombre de archivo contra path traversal.
 * 4. Validación de Magic Bytes (firma PKZIP para OOXML o compuesto OLE2 para XLS).
 * 5. Cálculo de hash criptográfico SHA-256 para deduplicación e idempotencia.
 */

import { sha256Bytes, sha256Hex } from '../fingerprint/Sha256';

export interface XlsxValidationOptions {
  maxSizeBytes?: number;
  minSizeBytes?: number;
}

export interface ValidateXlsxInput {
  fileName: string;
  fileSizeBytes: number;
  mimeType?: string;
  content: Uint8Array | ArrayBuffer | string;
  sha256?: string;
}

export interface XlsxValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedFileName: string;
  contentBytes: Uint8Array;
  sha256: string;
  fileSizeBytes: number;
}

export class XlsxFileValidator {
  public static readonly DEFAULT_MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
  public static readonly DEFAULT_MIN_SIZE_BYTES = 1; // 1 byte

  private static readonly ALLOWED_EXTENSIONS = ['.xlsx', '.xlsm', '.xls'];

  private static readonly ALLOWED_MIME_TYPES = new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroenabled.12',
    'application/octet-stream',
    'application/x-excel',
    'application/excel',
  ]);

  /**
   * Sanitiza el nombre de archivo eliminando path traversal y caracteres peligrosos.
   */
  public static sanitizeFileName(fileName: string): string {
    if (!fileName || typeof fileName !== 'string') return 'extracto.xlsx';

    let clean = fileName.replace(/\\/g, '/');
    const lastSlash = clean.lastIndexOf('/');
    if (lastSlash >= 0) {
      clean = clean.slice(lastSlash + 1);
    }

    clean = clean.replace(/\.{2,}/g, '.');
    clean = clean.replace(/[<>:"/\\|?*\x00-\x1F\x7F]/g, '_');

    const lower = clean.toLowerCase();
    const hasAllowedExt = this.ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
    if (!hasAllowedExt) {
      clean = `${clean}.xlsx`;
    }

    if (clean.length > 120) {
      clean = `${clean.slice(0, 115)}.xlsx`;
    }

    return clean.trim() || 'extracto.xlsx';
  }

  /**
   * Convierte la entrada (Uint8Array, ArrayBuffer, base64 o Data URI) a Uint8Array puro.
   */
  public static toUint8Array(content: Uint8Array | ArrayBuffer | string): Uint8Array {
    if (content instanceof Uint8Array) {
      return content;
    }

    if (content instanceof ArrayBuffer) {
      return new Uint8Array(content);
    }

    if (typeof content === 'string') {
      let b64 = content.trim();
      if (b64.startsWith('data:')) {
        const commaIdx = b64.indexOf(',');
        if (commaIdx >= 0) {
          b64 = b64.slice(commaIdx + 1);
        }
      }

      // Decodificación base64 segura para browser / React Native / Node
      if (typeof atob !== 'undefined') {
        const binaryString = atob(b64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      }

      const globalBuffer = (globalThis as Record<string, any>).Buffer;
      if (typeof globalBuffer !== 'undefined') {
        const buf = globalBuffer.from(b64, 'base64');
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      }

      // Fallback
      const bytes = new Uint8Array(b64.length);
      for (let i = 0; i < b64.length; i++) {
        bytes[i] = b64.charCodeAt(i) & 0xff;
      }
      return bytes;
    }

    return new Uint8Array(0);
  }

  /**
   * Valida la firma binaria (Magic Bytes):
   * - OOXML (.xlsx, .xlsm): Firma PKZip (0x50, 0x4B, 0x03, 0x04)
   * - OLE2 (.xls): Firma compuesta (0xD0, 0xCF, 0x11, 0xE0)
   */
  public static validateMagicBytes(bytes: Uint8Array): { isValid: boolean; format: 'OOXML' | 'OLE2' | 'UNKNOWN' } {
    if (!bytes || bytes.length < 4) {
      return { isValid: false, format: 'UNKNOWN' };
    }

    // PK\x03\x04 (PKZip OOXML)
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
      return { isValid: true, format: 'OOXML' };
    }

    // OLE2 Compound File Binary Format (.xls legado)
    if (
      bytes.length >= 8 &&
      bytes[0] === 0xd0 &&
      bytes[1] === 0xcf &&
      bytes[2] === 0x11 &&
      bytes[3] === 0xe0 &&
      bytes[4] === 0xa1 &&
      bytes[5] === 0xb1 &&
      bytes[6] === 0x1a &&
      bytes[7] === 0xe1
    ) {
      return { isValid: true, format: 'OLE2' };
    }

    return { isValid: false, format: 'UNKNOWN' };
  }

  /**
   * Ejecuta la validación exhaustiva de un archivo de estado de cuenta XLSX.
   */
  public static validate(
    input: ValidateXlsxInput,
    options?: XlsxValidationOptions,
  ): XlsxValidationResult {
    const errors: string[] = [];
    const maxBytes = options?.maxSizeBytes ?? this.DEFAULT_MAX_SIZE_BYTES;
    const minBytes = options?.minSizeBytes ?? this.DEFAULT_MIN_SIZE_BYTES;

    // 1. Sanitización de nombre
    const sanitizedFileName = this.sanitizeFileName(input.fileName);

    // 2. Validación de extensión
    const lowerName = (input.fileName || '').trim().toLowerCase();
    const hasValidExt = this.ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (!hasValidExt) {
      errors.push(`El archivo "${input.fileName}" debe tener una extensión válida (.xlsx, .xlsm, .xls).`);
    }

    // 3. Validación de tamaño
    const contentBytes = this.toUint8Array(input.content);
    const reportedSize = input.fileSizeBytes || 0;
    const actualSize = contentBytes.length;
    const effectiveSize = Math.max(reportedSize, actualSize);

    if (effectiveSize < minBytes || (actualSize === 0 && reportedSize === 0)) {
      errors.push('El archivo XLSX está vacío (0 bytes).');
    }
    if (effectiveSize > maxBytes) {
      const maxMb = Math.round(maxBytes / (1024 * 1024));
      errors.push(`El archivo excede el tamaño máximo permitido (${maxMb} MB).`);
    }

    // 4. Validación de tipo MIME
    if (input.mimeType) {
      const normalizedMime = input.mimeType.trim().toLowerCase();
      if (!this.ALLOWED_MIME_TYPES.has(normalizedMime)) {
        errors.push(`Tipo MIME no admitido: "${input.mimeType}". Se requiere formato de hoja de cálculo.`);
      }
    }

    // 5. Validación de Magic Bytes
    if (contentBytes.length >= 4) {
      const magic = this.validateMagicBytes(contentBytes);
      if (!magic.isValid) {
        errors.push('Firma de archivo XLSX inválida: no corresponde a un libro de Excel auténtico.');
      }
    }

    // 6. Cálculo de SHA-256 para idempotencia
    let sha256 = input.sha256;
    if (!sha256) {
      if (contentBytes.length > 0) {
        sha256 = sha256Bytes(contentBytes);
      } else {
        sha256 = sha256Hex(sanitizedFileName);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedFileName,
      contentBytes,
      sha256,
      fileSizeBytes: effectiveSize,
    };
  }
}
