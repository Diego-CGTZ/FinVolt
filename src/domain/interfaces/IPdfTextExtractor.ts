/**
 * US-038: Contrato para Extracción de Texto y Tablas de Estados de Cuenta PDF
 *
 * Criterios de Aceptación:
 * 1. Texto extraído (páginas, líneas, texto consolidado).
 * 2. Tablas identificables cuando sea posible (filas, columnas, importes, fechas).
 * 3. Errores manejados (PDF corrupto, escaneado o protegido).
 * 4. Documento original conservado.
 */

export interface ExtractedPdfPage {
  pageNumber: number;
  text: string;
  lines: string[];
}

export interface ExtractedTableRow {
  rowNumber: number;
  rawLine: string;
  cells: string[];
  date?: string;
  description?: string;
  amountMinor?: number;
  amount?: number;
  type?: 'CHARGE' | 'PAYMENT' | 'BALANCE';
}

export interface ExtractedPdfTable {
  sectionTitle?: string;
  headers: string[];
  rows: ExtractedTableRow[];
}

export interface PdfExtractionMetadata {
  producer?: string;
  creationDate?: string;
  isEncrypted?: boolean;
  hasSearchableText?: boolean;
  bankDetected?: string;
  pagesCount: number;
  tablesCount: number;
  totalRowsDetected: number;
}

export interface PdfExtractionResult {
  success: boolean;
  rawText: string;
  totalPages: number;
  pages: ExtractedPdfPage[];
  tables: ExtractedPdfTable[];
  metadata: PdfExtractionMetadata;
  errorMessage?: string;
}

export interface IPdfTextExtractor {
  extractText(content: Uint8Array | string): Promise<PdfExtractionResult>;
}
