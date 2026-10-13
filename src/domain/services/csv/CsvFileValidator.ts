/**
 * US-040: Validador de Archivos CSV Financieros
 *
 * Criterios de Aceptación:
 * 1. Validación de extensión (.csv) y tipo MIME permitido.
 * 2. Validación de tamaño (no vacío, límite de 10 MB).
 * 3. Sanitización de nombre de archivo contra path traversal.
 * 4. Detección y remoción de BOM (\uFEFF) y normalización de texto.
 * 5. Detección automática del delimitador (, ; \t |).
 * 6. Cálculo de hash criptográfico SHA-256 para deduplicación.
 */

import { sha256Bytes, sha256Hex } from '../fingerprint/Sha256';

export interface CsvValidationOptions {
  maxSizeBytes?: number;
  minSizeBytes?: number;
  allowedDelimiters?: string[];
}

export interface ValidateCsvInput {
  fileName: string;
  fileSizeBytes: number;
  mimeType?: string;
  content: Uint8Array | string;
  sha256?: string;
}

export interface CsvValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedFileName: string;
  normalizedText: string;
  detectedDelimiter: string;
  sha256: string;
  fileSizeBytes: number;
}

export class CsvFileValidator {
  public static readonly DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
  public static readonly DEFAULT_MIN_SIZE_BYTES = 1; // 1 byte
  public static readonly CANDIDATE_DELIMITERS = [',', ';', '\t', '|'];

  private static readonly ALLOWED_MIME_TYPES = new Set([
    'text/csv',
    'application/csv',
    'text/plain',
    'text/comma-separated-values',
    'application/vnd.ms-excel',
    'text/x-csv',
    'application/octet-stream',
  ]);

  /**
   * Sanitiza el nombre de archivo eliminando secuencias peligrosas y caracteres de control.
   */
  public static sanitizeFileName(fileName: string): string {
    if (!fileName || typeof fileName !== 'string') return 'import.csv';

    let clean = fileName.replace(/\\/g, '/');
    const lastSlash = clean.lastIndexOf('/');
    if (lastSlash >= 0) {
      clean = clean.slice(lastSlash + 1);
    }

    clean = clean.replace(/\.{2,}/g, '.');
    clean = clean.replace(/[<>:"/\\|?*\x00-\x1F\x7F]/g, '_');

    if (!clean.toLowerCase().endsWith('.csv')) {
      clean = `${clean}.csv`;
    }

    if (clean.length > 120) {
      clean = `${clean.slice(0, 116)}.csv`;
    }

    return clean.trim() || 'import.csv';
  }

  /**
   * Convierte contenido binario (Uint8Array), base64 data URI o texto crudo en una cadena limpia sin BOM.
   */
  public static normalizeContentToText(content: Uint8Array | string): string {
    if (!content) return '';

    let text = '';
    if (content instanceof Uint8Array) {
      if (typeof TextDecoder !== 'undefined') {
        try {
          text = new TextDecoder('utf-8').decode(content);
        } catch {
          text = String.fromCharCode(...content);
        }
      } else {
        text = String.fromCharCode(...content);
      }
    } else if (typeof content === 'string') {
      const trimmed = content.trim();
      if (trimmed.startsWith('data:text/csv;base64,') || trimmed.startsWith('data:application/csv;base64,')) {
        const b64 = trimmed.split(',')[1];
        text = typeof atob !== 'undefined'
          ? atob(b64)
          : (typeof (globalThis as Record<string, any>).Buffer !== 'undefined'
              ? (globalThis as Record<string, any>).Buffer.from(b64, 'base64').toString('utf-8')
              : b64);
      } else {
        text = content;
      }
    }

    // Remover Byte Order Mark (BOM) UTF-8 (\uFEFF)
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }

    return text;
  }

  /**
   * Detecta automáticamente el delimitador más probable evaluando las primeras líneas.
   */
  public static detectDelimiter(csvText: string, candidates = this.CANDIDATE_DELIMITERS): string {
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 5);
    if (lines.length === 0) return ',';

    const scores: Record<string, number> = {};
    for (const delimiter of candidates) {
      scores[delimiter] = 0;
      let previousCount: number | null = null;
      let consistent = true;

      for (const line of lines) {
        // Contar ocurrencias fuera de comillas dobles
        let inQuotes = false;
        let count = 0;
        for (let i = 0; i < line.length; i++) {
          if (line[i] === '"') inQuotes = !inQuotes;
          else if (!inQuotes && line[i] === delimiter) count++;
        }

        if (previousCount === null) {
          previousCount = count;
        } else if (previousCount !== count) {
          consistent = false;
        }

        scores[delimiter] += count;
      }

      // Recompensa por consistencia fila a fila
      if (consistent && (previousCount || 0) > 0) {
        scores[delimiter] += 50;
      }
    }

    let bestDelimiter = ',';
    let maxScore = -1;
    for (const d of candidates) {
      if (scores[d] > maxScore) {
        maxScore = scores[d];
        bestDelimiter = d;
      }
    }

    return maxScore > 0 ? bestDelimiter : ',';
  }

  /**
   * Valida integralmente un archivo CSV para su ingestión.
   */
  public static validate(
    input: ValidateCsvInput,
    options?: CsvValidationOptions,
  ): CsvValidationResult {
    const errors: string[] = [];
    const maxSizeBytes = options?.maxSizeBytes ?? this.DEFAULT_MAX_SIZE_BYTES;
    const minSizeBytes = options?.minSizeBytes ?? this.DEFAULT_MIN_SIZE_BYTES;

    // 1. Nombre y extensión
    if (!input.fileName || typeof input.fileName !== 'string' || input.fileName.trim().length === 0) {
      errors.push('El nombre del archivo es obligatorio.');
    } else {
      const lowerName = input.fileName.trim().toLowerCase();
      if (!lowerName.endsWith('.csv')) {
        errors.push('El archivo debe tener extensión .csv válida.');
      }
    }

    const sanitizedFileName = this.sanitizeFileName(input.fileName || 'statement.csv');

    // 2. Tipo MIME (si fue provisto)
    if (input.mimeType) {
      const mime = input.mimeType.trim().toLowerCase();
      if (!this.ALLOWED_MIME_TYPES.has(mime)) {
        errors.push(`Tipo MIME no permitido (${input.mimeType}). Únicamente se admiten archivos CSV.`);
      }
    }

    // 3. Tamaño
    if (input.fileSizeBytes === undefined || input.fileSizeBytes === null || isNaN(input.fileSizeBytes)) {
      errors.push('El tamaño del archivo es obligatorio.');
    } else if (input.fileSizeBytes < minSizeBytes) {
      errors.push(`El archivo está vacío (0 bytes).`);
    } else if (input.fileSizeBytes > maxSizeBytes) {
      const maxMb = (maxSizeBytes / (1024 * 1024)).toFixed(1);
      const actualMb = (input.fileSizeBytes / (1024 * 1024)).toFixed(1);
      errors.push(`El archivo excede el tamaño máximo permitido de ${maxMb} MB (tamaño actual: ${actualMb} MB).`);
    }

    // 4. Normalizar texto y verificar que no esté vacío
    const normalizedText = this.normalizeContentToText(input.content);
    if (normalizedText.trim().length === 0 && errors.length === 0) {
      errors.push('El archivo CSV no contiene texto ni filas legibles.');
    }

    // 5. Detectar delimitador
    const detectedDelimiter = this.detectDelimiter(normalizedText, options?.allowedDelimiters);

    // 6. Calcular SHA-256
    let sha256 = input.sha256?.trim().toLowerCase() || '';
    if (!sha256 && input.content) {
      sha256 = input.content instanceof Uint8Array
        ? sha256Bytes(input.content)
        : sha256Hex(normalizedText);
    } else if (!sha256) {
      sha256 = sha256Hex(`${input.fileName}-${input.fileSizeBytes}-${Date.now()}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedFileName,
      normalizedText,
      detectedDelimiter,
      sha256,
      fileSizeBytes: input.fileSizeBytes || 0,
    };
  }
}
