import type {
  AdapterValidationResult,
  FinancialSourceAdapter,
} from '../../domain/interfaces/FinancialSourceAdapter';
import type { CreateRawEventDTO, RawEventSource } from '../../domain/models/RawEvent';

export interface CsvStatementInput {
  fileName: string;
  rawContent: string;
  delimiter?: string;
  headers?: string[];
  rowsCount?: number;
  sha256?: string;
  uploadedAt?: Date | string;
}

/**
 * Adaptador para Estados de Cuenta y Movimientos en CSV (US-019).
 *
 * Transforma archivos y flujos CSV descargados de la banca en línea
 * en un CreateRawEventDTO canónico.
 */
export class CsvStatementAdapter implements FinancialSourceAdapter<CsvStatementInput> {
  readonly source: RawEventSource = 'BANK_CSV';
  readonly name = 'Bank CSV Statement Adapter';
  readonly description = 'Adapta archivos CSV con transacciones bancarias';

  canHandle(input: unknown): input is CsvStatementInput {
    if (!input || typeof input !== 'object') return false;
    const item = input as Record<string, unknown>;
    return (
      typeof item.fileName === 'string' &&
      item.fileName.toLowerCase().endsWith('.csv') &&
      typeof item.rawContent === 'string'
    );
  }

  validate(input: CsvStatementInput): AdapterValidationResult {
    if (!input.fileName || !input.fileName.toLowerCase().endsWith('.csv')) {
      return { isValid: false, reason: 'El archivo debe tener extensión .csv válida.' };
    }
    if (!input.rawContent || input.rawContent.trim() === '') {
      return { isValid: false, reason: 'El archivo CSV se encuentra vacío.' };
    }
    return { isValid: true };
  }

  async adapt(input: CsvStatementInput): Promise<CreateRawEventDTO> {
    const receivedAt = input.uploadedAt ? new Date(input.uploadedAt) : new Date();
    const sourceId = input.sha256 || `csv-${input.fileName}-${input.rawContent.length}`;

    return {
      source: this.source,
      sourceId,
      payload: {
        fileName: input.fileName,
        delimiter: input.delimiter || ',',
        headers: input.headers || [],
        rowsCount: input.rowsCount || input.rawContent.split('\n').filter(Boolean).length,
      },
      rawText: input.rawContent,
      metadata: {
        fileName: input.fileName,
        headersDetected: input.headers || [],
        origin: 'CsvStatementUpload',
      },
      receivedAt,
    };
  }
}
