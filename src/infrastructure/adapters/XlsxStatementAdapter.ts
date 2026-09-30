import type {
  AdapterValidationResult,
  FinancialSourceAdapter,
} from '../../domain/interfaces/FinancialSourceAdapter';
import type { CreateRawEventDTO, RawEventSource } from '../../domain/models/RawEvent';

export interface XlsxSheetSummary {
  name: string;
  rowCount: number;
  dataPreview?: unknown[];
}

export interface XlsxStatementInput {
  fileName: string;
  sheets: XlsxSheetSummary[];
  sha256?: string;
  rawBufferBase64?: string;
  uploadedAt?: Date | string;
}

/**
 * Adaptador para Estados de Cuenta en formato Excel / XLSX (US-019).
 *
 * Normaliza libros de cálculo bancarios en un CreateRawEventDTO canónico.
 */
export class XlsxStatementAdapter implements FinancialSourceAdapter<XlsxStatementInput> {
  readonly source: RawEventSource = 'BANK_XLSX';
  readonly name = 'Bank XLSX Statement Adapter';
  readonly description = 'Adapta hojas de cálculo Excel (.xlsx / .xls) de entidades financieras';

  canHandle(input: unknown): input is XlsxStatementInput {
    if (!input || typeof input !== 'object') return false;
    const item = input as Record<string, unknown>;
    const isExcelName =
      typeof item.fileName === 'string' &&
      (item.fileName.toLowerCase().endsWith('.xlsx') || item.fileName.toLowerCase().endsWith('.xls'));
    return isExcelName && Array.isArray(item.sheets);
  }

  validate(input: XlsxStatementInput): AdapterValidationResult {
    if (!input.fileName) {
      return { isValid: false, reason: 'El nombre del archivo es obligatorio.' };
    }
    const isExcel =
      input.fileName.toLowerCase().endsWith('.xlsx') || input.fileName.toLowerCase().endsWith('.xls');
    if (!isExcel) {
      return { isValid: false, reason: 'El archivo debe ser de formato Excel (.xlsx o .xls).' };
    }
    if (!Array.isArray(input.sheets) || input.sheets.length === 0) {
      return { isValid: false, reason: 'El archivo Excel debe contener al menos una hoja de cálculo.' };
    }
    return { isValid: true };
  }

  async adapt(input: XlsxStatementInput): Promise<CreateRawEventDTO> {
    const receivedAt = input.uploadedAt ? new Date(input.uploadedAt) : new Date();
    const totalRows = input.sheets.reduce((sum, s) => sum + s.rowCount, 0);
    const sourceId = input.sha256 || `xlsx-${input.fileName}-${input.sheets.length}sheets`;

    return {
      source: this.source,
      sourceId,
      payload: {
        fileName: input.fileName,
        sheets: input.sheets,
        totalSheets: input.sheets.length,
        totalRows,
        rawBufferBase64: input.rawBufferBase64,
      },
      rawText: `Excel: ${input.fileName} (${input.sheets.map((s) => `${s.name}: ${s.rowCount} filas`).join(', ')})`,
      metadata: {
        fileName: input.fileName,
        sheetsList: input.sheets.map((s) => s.name),
        totalRows,
        origin: 'XlsxStatementUpload',
      },
      receivedAt,
    };
  }
}
