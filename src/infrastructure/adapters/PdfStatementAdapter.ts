import type {
  AdapterValidationResult,
  FinancialSourceAdapter,
} from '../../domain/interfaces/FinancialSourceAdapter';
import type { CreateRawEventDTO, RawEventSource } from '../../domain/models/RawEvent';

export interface PdfStatementInput {
  fileUri?: string;
  fileName: string;
  fileSizeBytes: number;
  sha256: string;
  extractedText: string;
  pagesCount?: number;
  bankDetected?: string;
  uploadedAt?: Date | string;
}

/**
 * Adaptador para Estados de Cuenta en PDF (US-019).
 *
 * Normaliza archivos PDF bancarios y su texto extraído en un
 * CreateRawEventDTO canónico para posterior procesamiento por el parser de PDFs.
 */
export class PdfStatementAdapter implements FinancialSourceAdapter<PdfStatementInput> {
  readonly source: RawEventSource = 'BANK_PDF';
  readonly name = 'Bank PDF Statement Adapter';
  readonly description = 'Adapta estados de cuenta y comprobantes bancarios en formato PDF';

  canHandle(input: unknown): input is PdfStatementInput {
    if (!input || typeof input !== 'object') return false;
    const item = input as Record<string, unknown>;
    return (
      typeof item.fileName === 'string' &&
      item.fileName.toLowerCase().endsWith('.pdf') &&
      typeof item.sha256 === 'string' &&
      typeof item.extractedText === 'string'
    );
  }

  validate(input: PdfStatementInput): AdapterValidationResult {
    if (!input.fileName || !input.fileName.toLowerCase().endsWith('.pdf')) {
      return { isValid: false, reason: 'El archivo debe tener extensión .pdf válida.' };
    }
    if (!input.sha256 || input.sha256.trim() === '') {
      return { isValid: false, reason: 'El hash SHA-256 es requerido para asegurar integridad y deduplicación.' };
    }
    if (typeof input.extractedText !== 'string' || input.extractedText.trim() === '') {
      return { isValid: false, reason: 'El archivo PDF no contiene texto extraído o es ilegible.' };
    }
    return { isValid: true };
  }

  async adapt(input: PdfStatementInput): Promise<CreateRawEventDTO> {
    const receivedAt = input.uploadedAt ? new Date(input.uploadedAt) : new Date();

    return {
      source: this.source,
      sourceId: input.sha256,
      payload: {
        fileName: input.fileName,
        fileSizeBytes: input.fileSizeBytes,
        sha256: input.sha256,
        pagesCount: input.pagesCount || 1,
        bankDetected: input.bankDetected,
        fileUri: input.fileUri,
      },
      rawText: input.extractedText,
      metadata: {
        fileName: input.fileName,
        fileSizeBytes: input.fileSizeBytes,
        bankDetected: input.bankDetected || 'UNKNOWN',
        origin: 'PdfStatementUpload',
      },
      receivedAt,
    };
  }
}
