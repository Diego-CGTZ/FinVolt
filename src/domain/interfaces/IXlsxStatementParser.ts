/**
 * US-041: Interfaz y Contratos de Ingestión de Estados de Cuenta XLSX
 *
 * Acceptance Criteria:
 * 1. Archivo validado (MIME, extensión .xlsx, tamaño máx 20 MB, magic bytes PK/ZIP).
 * 2. Hojas y columnas detectadas (soporte multihoja, mapeo inteligente de columnas).
 * 3. Filas convertidas a candidates (TransactionCandidate con fingerprint determinístico).
 * 4. Deduplicación y reconciliación aplicada (idempotencia de archivo y candidatos).
 *
 * Invariante arquitectónica: Cero inserciones directas en el modelo Transaction.
 */

import type { TransactionCandidate } from '../models/TransactionCandidate';
import type { RawEvent } from '../models/RawEvent';

export interface XlsxSheetInfo {
  name: string;
  rowCount: number;
  columnCount: number;
}

export interface XlsxColumnMapping {
  dateColumn?: string | number;
  descriptionColumn?: string | number;
  amountColumn?: string | number;
  chargeColumn?: string | number;
  creditColumn?: string | number;
  typeColumn?: string | number;
  currencyColumn?: string | number;
  referenceColumn?: string | number;
  categoryColumn?: string | number;
}

export interface XlsxParseOptions {
  sheetName?: string;
  sheetIndex?: number;
  headerRowIndex?: number;
  mapping?: XlsxColumnMapping;
  bankHint?: string;
  defaultCurrency?: string;
  skipEmptyRows?: boolean;
}

export interface XlsxParseResult {
  success: boolean;
  sheetName: string;
  availableSheets: string[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicatesCount: number;
  reconciledCount: number;
  candidates: TransactionCandidate[];
  mappingUsed: XlsxColumnMapping;
  errors?: string[];
}

export interface IXlsxStatementParser {
  /**
   * Extrae la lista de nombres de hojas disponibles en el libro XLSX.
   */
  listSheets(content: Uint8Array | ArrayBuffer | string): string[];

  /**
   * Parsea el contenido binario o base64 de un archivo XLSX y genera candidatos financieros.
   */
  parse(
    content: Uint8Array | ArrayBuffer | string,
    rawEvent: RawEvent,
    options?: XlsxParseOptions,
    userId?: string,
  ): Promise<XlsxParseResult>;
}
