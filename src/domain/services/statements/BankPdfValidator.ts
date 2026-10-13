/**
 * US-037: Validador de Estados de Cuenta Bancarios en PDF
 *
 * Criterios de Aceptación:
 * - Validación de tipo MIME y extensión (.pdf).
 * - Validación de tamaño (límites mínimos y máximos).
 * - Validación de integridad de encabezado y magic bytes (%PDF-).
 * - Sanitización segura del nombre de archivo.
 * - Detección preliminar de institución bancaria.
 */

import { sha256Bytes, sha256Hex } from '../fingerprint/Sha256';

export interface PdfValidationOptions {
  /** Tamaño máximo permitido en bytes (por defecto 20 MB = 20 * 1024 * 1024) */
  maxSizeBytes?: number;
  /** Tamaño mínimo permitido en bytes (por defecto 1 byte) */
  minSizeBytes?: number;
  /** Si debe exigir validación estricta de Magic Bytes (%PDF-) */
  requireMagicBytes?: boolean;
}

export interface ValidatePdfInput {
  fileName: string;
  fileSizeBytes: number;
  mimeType?: string;
  /** Contenido binario (Uint8Array), cadena base64 o texto ascii */
  content?: Uint8Array | string;
  sha256?: string;
}

export interface PdfValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedFileName: string;
  sha256: string;
  detectedBank: string;
  fileSizeBytes: number;
}

export class BankPdfValidator {
  public static readonly DEFAULT_MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
  public static readonly DEFAULT_MIN_SIZE_BYTES = 1; // 1 byte
  public static readonly PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2d]; // '%PDF-' en ASCII

  /**
   * Sanitiza el nombre del archivo para prevenir path traversal, inyección de caracteres
   * de control y caracteres incompatibles con sistemas de archivos y S3/Supabase Storage.
   */
  public static sanitizeFileName(fileName: string): string {
    if (!fileName || typeof fileName !== 'string') return 'statement.pdf';

    // 1. Extraer el basename (remover rutas / o \)
    let clean = fileName.replace(/\\/g, '/');
    const lastSlash = clean.lastIndexOf('/');
    if (lastSlash >= 0) {
      clean = clean.slice(lastSlash + 1);
    }

    // 2. Prevenir secuencias de path traversal
    clean = clean.replace(/\.{2,}/g, '.');

    // 3. Remover caracteres de control y caracteres peligrosos para storage URLs
    clean = clean.replace(/[<>:"/\\|?*\x00-\x1F\x7F]/g, '_');

    // 4. Si tras limpiar no tiene extensión .pdf, asegurar que termine en .pdf
    if (!clean.toLowerCase().endsWith('.pdf')) {
      clean = `${clean}.pdf`;
    }

    // 5. Longitud máxima razonable
    if (clean.length > 120) {
      const ext = '.pdf';
      clean = `${clean.slice(0, 120 - ext.length)}${ext}`;
    }

    return clean.trim() || 'statement.pdf';
  }

  /**
   * Verifica si los primeros bytes del archivo corresponden a la firma canónica de PDF (%PDF-).
   */
  public static verifyMagicBytes(content: Uint8Array | string): boolean {
    if (!content) return false;

    if (content instanceof Uint8Array) {
      if (content.length < 5) return false;
      for (let i = 0; i < 5; i++) {
        if (content[i] !== this.PDF_MAGIC_BYTES[i]) return false;
      }
      return true;
    }

    if (typeof content === 'string') {
      const trimmed = content.trim();
      // Si es un string con prefijo base64 data URI
      if (trimmed.startsWith('data:application/pdf;base64,')) {
        const base64Data = trimmed.slice('data:application/pdf;base64,'.length);
        return this.verifyBase64MagicBytes(base64Data);
      }
      // Si es texto plano o base64
      if (trimmed.startsWith('%PDF-')) return true;

      // Intentar decodificar los primeros bytes de base64
      return this.verifyBase64MagicBytes(trimmed);
    }

    return false;
  }

  /**
   * Verifica si una cadena base64 comienza con los bytes %PDF- ('JVBERi0' en base64).
   */
  private static verifyBase64MagicBytes(base64Str: string): boolean {
    // En base64 estándar: '%PDF-' se codifica como 'JVBERi0'
    const cleanB64 = base64Str.replace(/\s/g, '');
    return cleanB64.startsWith('JVBERi0') || cleanB64.startsWith('JVBER');
  }

  /**
   * Extrae o calcula el hash SHA-256 del contenido del archivo.
   */
  public static computeSha256(content?: Uint8Array | string, fallbackId?: string): string {
    if (!content) {
      return fallbackId ? sha256Hex(fallbackId) : sha256Hex(`file-${Date.now()}`);
    }

    if (content instanceof Uint8Array) {
      return sha256Bytes(content);
    }

    if (typeof content === 'string') {
      return sha256Hex(content);
    }

    return sha256Hex(`file-${Date.now()}`);
  }

  /**
   * Detecta la institución financiera a partir del nombre del archivo o del texto inicial.
   */
  public static detectBankHint(fileName: string, rawTextSnippet?: string): string {
    const fn = (fileName || '').toUpperCase();
    const findBank = (str: string): string | null => {
      if (str.includes('BBVA') || str.includes('BANCOMER')) return 'BBVA';
      if (str.includes('SANTANDER')) return 'SANTANDER';
      if (str.includes('BANORTE') || str.includes('IXE')) return 'BANORTE';
      if (str.includes('CITIBANAMEX') || str.includes('BANAMEX') || str.includes('CITI')) return 'CITIBANAMEX';
      if (str.includes('NU') || str.includes('NU BANK') || str.includes('NUBANK')) return 'NU';
      if (str.includes('AMEX') || str.includes('AMERICAN EXPRESS')) return 'AMEX';
      if (str.includes('HSBC')) return 'HSBC';
      if (str.includes('SCOTIABANK')) return 'SCOTIABANK';
      if (str.includes('MERCADO PAGO') || str.includes('MERCADOPAGO')) return 'MERCADO_PAGO';
      if (str.includes('INBURSA')) return 'INBURSA';
      if (str.includes('BANCO AZTECA') || str.includes('AZTECA')) return 'BANCO_AZTECA';
      if (str.includes('HEY BANCO') || str.includes('HEYBANCO')) return 'HEY_BANCO';
      if (str.includes('KLAR')) return 'KLAR';
      if (str.includes('STP')) return 'STP';
      return null;
    };

    const fromFileName = findBank(fn);
    if (fromFileName) return fromFileName;

    if (rawTextSnippet) {
      const fromContent = findBank(rawTextSnippet.toUpperCase());
      if (fromContent) return fromContent;
    }

    return 'UNKNOWN';
  }

  /**
   * Ejecuta la validación exhaustiva de un archivo de estado de cuenta PDF.
   */
  public static validate(
    input: ValidatePdfInput,
    options?: PdfValidationOptions,
  ): PdfValidationResult {
    const errors: string[] = [];
    const maxSizeBytes = options?.maxSizeBytes ?? this.DEFAULT_MAX_SIZE_BYTES;
    const minSizeBytes = options?.minSizeBytes ?? this.DEFAULT_MIN_SIZE_BYTES;
    const requireMagicBytes = options?.requireMagicBytes ?? true;

    // 1. Validación de nombre de archivo
    if (!input.fileName || typeof input.fileName !== 'string' || input.fileName.trim().length === 0) {
      errors.push('El nombre del archivo es obligatorio.');
    } else {
      const cleanName = input.fileName.trim().toLowerCase();
      if (!cleanName.endsWith('.pdf')) {
        errors.push('El archivo debe tener extensión .pdf válida.');
      }
    }

    const sanitizedFileName = this.sanitizeFileName(input.fileName || 'statement.pdf');

    // 2. Validación de tipo MIME
    if (input.mimeType) {
      const normalizedMime = input.mimeType.trim().toLowerCase();
      if (normalizedMime !== 'application/pdf') {
        errors.push(`Tipo MIME no permitido (${input.mimeType}). Únicamente se admiten archivos application/pdf.`);
      }
    }

    // 3. Validación de tamaño
    if (input.fileSizeBytes === undefined || input.fileSizeBytes === null || isNaN(input.fileSizeBytes)) {
      errors.push('El tamaño del archivo es obligatorio.');
    } else if (input.fileSizeBytes < minSizeBytes) {
      errors.push(`El archivo está vacío (tamaño: ${input.fileSizeBytes} bytes).`);
    } else if (input.fileSizeBytes > maxSizeBytes) {
      const maxMb = (maxSizeBytes / (1024 * 1024)).toFixed(1);
      const actualMb = (input.fileSizeBytes / (1024 * 1024)).toFixed(1);
      errors.push(`El archivo excede el tamaño máximo permitido de ${maxMb} MB (tamaño actual: ${actualMb} MB).`);
    }

    // 4. Validación de Magic Bytes / Encabezado PDF
    if (input.content && requireMagicBytes) {
      const hasValidHeader = this.verifyMagicBytes(input.content);
      if (!hasValidHeader) {
        errors.push('El contenido del archivo no es un documento PDF válido (encabezado %PDF- ausente).');
      }
    }

    // 5. Cálculo / Verificación de SHA-256
    let sha256 = input.sha256?.trim().toLowerCase() || '';
    if (!sha256 && input.content) {
      sha256 = this.computeSha256(input.content);
    } else if (sha256 && !/^[a-f0-9]{64}$/.test(sha256)) {
      errors.push('El hash SHA-256 provisto tiene un formato hexadecimal inválido.');
    } else if (!sha256) {
      sha256 = this.computeSha256(undefined, `${input.fileName}-${input.fileSizeBytes}`);
    }

    // 6. Detección preliminar de banco
    const detectedBank = this.detectBankHint(input.fileName || '', typeof input.content === 'string' ? input.content : undefined);

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedFileName,
      sha256,
      detectedBank,
      fileSizeBytes: input.fileSizeBytes || 0,
    };
  }
}
