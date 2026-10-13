/**
 * US-042: Interfaz y Modelos para Mapeo Manual de Columnas (Manual Column Mapping)
 *
 * Acceptance Criteria:
 * 1. Mapeo de Date, Amount, Description, Merchant y Type.
 * 2. Preview en tiempo real de filas analizadas.
 * 3. Guardar y aplicar mapping (plantillas/templates reutilizables).
 *
 * Invariante arquitectónica:
 * Cero inserciones directas en el modelo Transaction.
 */

import type { CsvColumnMapping } from './ICsvStatementParser';
import type { XlsxColumnMapping } from './IXlsxStatementParser';
import type { TransactionType } from '../models/Transaction';

export type AmountMode = 'SINGLE' | 'SPLIT';

export interface ColumnMappingConfig {
  dateColumn?: string | number;
  amountMode: AmountMode;
  amountColumn?: string | number;
  chargeColumn?: string | number;
  creditColumn?: string | number;
  descriptionColumn?: string | number;
  merchantColumn?: string | number;
  typeColumn?: string | number;
  currencyColumn?: string | number;
  referenceColumn?: string | number;
  defaultCurrency?: string;
}

export interface MappingPreviewRow {
  rowIndex: number;
  rawCells: Record<string, any>;
  parsedDate: Date | null;
  formattedDate: string;
  amount: number | null;
  amountMinor: number;
  type: TransactionType;
  description: string;
  merchant: string;
  currency: string;
  reference?: string;
  isValid: boolean;
  validationError?: string;
}

export interface MappingPreviewResult {
  isValid: boolean;
  headers: string[];
  mapping: ColumnMappingConfig;
  missingRequiredFields: string[];
  previewRows: MappingPreviewRow[];
  totalPreviewRows: number;
  validRowsCount: number;
  invalidRowsCount: number;
}

export interface MappingTemplate {
  id: string;
  userId?: string;
  name: string;
  bankHint?: string;
  fileType?: 'CSV' | 'XLSX' | 'ANY';
  headers: string[];
  mapping: ColumnMappingConfig;
  createdAt: string;
  updatedAt: string;
}

export interface IMappingTemplateRepository {
  save(template: Omit<MappingTemplate, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<MappingTemplate>;
  findById(id: string): Promise<MappingTemplate | null>;
  findAll(userId?: string): Promise<MappingTemplate[]>;
  delete(id: string): Promise<boolean>;
}

export interface IColumnMappingService {
  validateMapping(mapping: ColumnMappingConfig): { isValid: boolean; missingFields: string[]; errors: string[] };
  generatePreview(headers: string[], sampleRows: any[][], mapping: ColumnMappingConfig): MappingPreviewResult;
  toCsvMapping(config: ColumnMappingConfig): CsvColumnMapping;
  toXlsxMapping(config: ColumnMappingConfig): XlsxColumnMapping;
  findBestTemplate(headers: string[], templates: MappingTemplate[]): MappingTemplate | null;
}
