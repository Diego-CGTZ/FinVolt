/**
 * US-042: Servicio de Mapeo Manual de Columnas y Previsualización
 *
 * Criterios de Aceptación:
 * 1. Mapeo flexible de Fecha, Monto (único o cargo/abono), Descripción, Comercio y Tipo.
 * 2. Previsualización en tiempo real de filas analizadas con validación de datos.
 * 3. Conversión directa a configuraciones de CsvStatementParser y XlsxStatementParser.
 * 4. Búsqueda y sugerencia de plantillas guardadas previas.
 */

import type {
  ColumnMappingConfig,
  IColumnMappingService,
  MappingPreviewResult,
  MappingPreviewRow,
  MappingTemplate,
} from '../../interfaces/IColumnMappingService';
import type { CsvColumnMapping } from '../../interfaces/ICsvStatementParser';
import type { XlsxColumnMapping } from '../../interfaces/IXlsxStatementParser';
import type { TransactionType } from '../../models/Transaction';
import { CsvColumnDetector } from '../csv/CsvColumnDetector';
import { defaultMerchantNormalizer } from '../MerchantNormalizer';
import { StatementDateHelper } from '../statements/parsers/StatementDateHelper';

export class ColumnMappingService implements IColumnMappingService {
  /**
   * Valida si la configuración de mapeo cuenta con los campos indispensables.
   */
  public validateMapping(mapping: ColumnMappingConfig): {
    isValid: boolean;
    missingFields: string[];
    errors: string[];
  } {
    const missingFields: string[] = [];
    const errors: string[] = [];

    // 1. Fecha obligatoria
    if (mapping.dateColumn === undefined || mapping.dateColumn === null || mapping.dateColumn === '') {
      missingFields.push('dateColumn');
      errors.push('La columna de Fecha es obligatoria.');
    }

    // 2. Descripción o Comercio obligatorio
    const hasDesc = mapping.descriptionColumn !== undefined && mapping.descriptionColumn !== null && mapping.descriptionColumn !== '';
    const hasMerchant = mapping.merchantColumn !== undefined && mapping.merchantColumn !== null && mapping.merchantColumn !== '';
    if (!hasDesc && !hasMerchant) {
      missingFields.push('descriptionColumn');
      errors.push('Se requiere al menos la columna de Descripción o Comercio.');
    }

    // 3. Monto según el modo
    if (mapping.amountMode === 'SINGLE') {
      if (mapping.amountColumn === undefined || mapping.amountColumn === null || mapping.amountColumn === '') {
        missingFields.push('amountColumn');
        errors.push('En modo de Monto Único, la columna de Importe es obligatoria.');
      }
    } else if (mapping.amountMode === 'SPLIT') {
      const hasCharge = mapping.chargeColumn !== undefined && mapping.chargeColumn !== null && mapping.chargeColumn !== '';
      const hasCredit = mapping.creditColumn !== undefined && mapping.creditColumn !== null && mapping.creditColumn !== '';
      if (!hasCharge && !hasCredit) {
        missingFields.push('chargeColumn');
        missingFields.push('creditColumn');
        errors.push('En modo Cargo/Abono, debe seleccionar al menos una columna de Cargo o Abono.');
      }
    }

    return {
      isValid: errors.length === 0,
      missingFields,
      errors,
    };
  }

  /**
   * Genera una previsualización de cómo se interpretarán las filas con el mapeo actual.
   */
  public generatePreview(
    headers: string[],
    sampleRows: any[][],
    mapping: ColumnMappingConfig,
  ): MappingPreviewResult {
    const validation = this.validateMapping(mapping);
    const previewRows: MappingPreviewRow[] = [];

    const effectiveRows = (sampleRows || []).slice(0, 10);
    let validRowsCount = 0;
    let invalidRowsCount = 0;

    for (let i = 0; i < effectiveRows.length; i++) {
      const row = effectiveRows[i];
      const rawCells: Record<string, any> = {};
      for (let c = 0; c < headers.length; c++) {
        rawCells[headers[c]] = row[c] !== undefined ? row[c] : '';
      }

      // Si el mapeo no es válido a nivel estructural, retornar filas en estado inválido
      if (!validation.isValid) {
        previewRows.push({
          rowIndex: i + 1,
          rawCells,
          parsedDate: null,
          formattedDate: '—',
          amount: null,
          amountMinor: 0,
          type: 'EXPENSE',
          description: '',
          merchant: '',
          currency: mapping.defaultCurrency || 'MXN',
          isValid: false,
          validationError: validation.errors.join(', '),
        });
        invalidRowsCount++;
        continue;
      }

      // 1. Parseo de Fecha
      const dateCell = this.extractCellValue(row, headers, mapping.dateColumn);
      const parsedDate = this.parseDate(dateCell);
      let formattedDate = 'Fecha inválida';
      if (parsedDate) {
        formattedDate = parsedDate.toISOString().slice(0, 10);
      }

      // 2. Parseo de Monto y Tipo
      let amount: number | null = null;
      let inferredType: TransactionType = 'EXPENSE';

      if (mapping.amountMode === 'SPLIT') {
        const chargeCell = this.extractCellValue(row, headers, mapping.chargeColumn);
        const creditCell = this.extractCellValue(row, headers, mapping.creditColumn);
        const chargeVal = this.parseNumericAmount(chargeCell);
        const creditVal = this.parseNumericAmount(creditCell);

        if (chargeVal !== null && chargeVal > 0) {
          amount = chargeVal;
          inferredType = 'EXPENSE';
        } else if (creditVal !== null && creditVal > 0) {
          amount = creditVal;
          inferredType = 'INCOME';
        } else if (chargeVal !== null && chargeVal !== 0) {
          amount = Math.abs(chargeVal);
          inferredType = chargeVal < 0 ? 'INCOME' : 'EXPENSE';
        } else if (creditVal !== null && creditVal !== 0) {
          amount = Math.abs(creditVal);
          inferredType = 'INCOME';
        }
      } else {
        const amountCell = this.extractCellValue(row, headers, mapping.amountColumn);
        const num = this.parseNumericAmount(amountCell);
        if (num !== null) {
          amount = Math.abs(num);
          inferredType = num < 0 ? 'INCOME' : 'EXPENSE';
        }
      }

      // 3. Descripción y Comercio
      const descCell = this.extractCellValue(row, headers, mapping.descriptionColumn);
      const merchantCell = this.extractCellValue(row, headers, mapping.merchantColumn);
      const description = descCell ? String(descCell).trim() : (merchantCell ? String(merchantCell).trim() : 'Movimiento');
      const merchantRaw = merchantCell ? String(merchantCell).trim() : description;
      const normalized = defaultMerchantNormalizer.normalizeSync(merchantRaw);
      const merchant = normalized.normalizedMerchant || merchantRaw;

      // 4. Tipo explícito
      if (mapping.typeColumn !== undefined && mapping.typeColumn !== null && mapping.typeColumn !== '') {
        const typeCell = String(this.extractCellValue(row, headers, mapping.typeColumn) || '').toUpperCase();
        if (typeCell.includes('ABONO') || typeCell.includes('DEPOSITO') || typeCell.includes('INGRESO') || typeCell.includes('INCOME')) {
          inferredType = 'INCOME';
        } else if (typeCell.includes('CARGO') || typeCell.includes('RETIRO') || typeCell.includes('GASTO') || typeCell.includes('EXPENSE')) {
          inferredType = 'EXPENSE';
        } else if (typeCell.includes('TRASPASO') || typeCell.includes('TRANSFER')) {
          inferredType = 'TRANSFER';
        }
      } else {
        const upperDesc = description.toUpperCase();
        if (upperDesc.includes('NOMINA') || upperDesc.includes('SPEI RECIBIDO') || upperDesc.includes('DEVOLUCION')) {
          inferredType = 'INCOME';
        } else if (upperDesc.includes('TRASPASO') || upperDesc.includes('PAGO DE MI TARJETA')) {
          inferredType = 'TRANSFER';
        }
      }

      // 5. Divisa y Referencia
      const currCell = this.extractCellValue(row, headers, mapping.currencyColumn);
      let currency = mapping.defaultCurrency || 'MXN';
      if (currCell && /^[A-Z]{3}$/i.test(String(currCell).trim())) {
        currency = String(currCell).trim().toUpperCase();
      }

      const refCell = this.extractCellValue(row, headers, mapping.referenceColumn);
      const reference = refCell ? String(refCell).trim() : undefined;

      // Validación fila a fila
      let rowValid = true;
      let rowError: string | undefined;

      if (!parsedDate) {
        rowValid = false;
        rowError = 'No se pudo interpretar la fecha';
      } else if (amount === null || isNaN(amount) || amount <= 0) {
        rowValid = false;
        rowError = 'Importe inválido o cero';
      }

      if (rowValid) validRowsCount++;
      else invalidRowsCount++;

      previewRows.push({
        rowIndex: i + 1,
        rawCells,
        parsedDate,
        formattedDate,
        amount,
        amountMinor: amount ? Math.round(amount * 100) : 0,
        type: inferredType,
        description,
        merchant,
        currency,
        reference,
        isValid: rowValid,
        validationError: rowError,
      });
    }

    return {
      isValid: validation.isValid && invalidRowsCount === 0,
      headers,
      mapping,
      missingRequiredFields: validation.missingFields,
      previewRows,
      totalPreviewRows: effectiveRows.length,
      validRowsCount,
      invalidRowsCount,
    };
  }

  /**
   * Transforma una configuración manual a CsvColumnMapping para CsvStatementParser.
   */
  public toCsvMapping(config: ColumnMappingConfig): CsvColumnMapping {
    const res: CsvColumnMapping = {};
    if (config.dateColumn !== undefined) res.dateColumn = config.dateColumn;
    if (config.descriptionColumn !== undefined) res.descriptionColumn = config.descriptionColumn;
    if (config.amountMode === 'SPLIT') {
      if (config.chargeColumn !== undefined) res.chargeColumn = config.chargeColumn;
      if (config.creditColumn !== undefined) res.creditColumn = config.creditColumn;
    } else {
      if (config.amountColumn !== undefined) res.amountColumn = config.amountColumn;
    }
    if (config.typeColumn !== undefined) res.typeColumn = config.typeColumn;
    if (config.currencyColumn !== undefined) res.currencyColumn = config.currencyColumn;
    if (config.referenceColumn !== undefined) res.referenceColumn = config.referenceColumn;
    return res;
  }

  /**
   * Transforma una configuración manual a XlsxColumnMapping para XlsxStatementParser.
   */
  public toXlsxMapping(config: ColumnMappingConfig): XlsxColumnMapping {
    const res: XlsxColumnMapping = {};
    if (config.dateColumn !== undefined) res.dateColumn = config.dateColumn;
    if (config.descriptionColumn !== undefined) res.descriptionColumn = config.descriptionColumn;
    if (config.amountMode === 'SPLIT') {
      if (config.chargeColumn !== undefined) res.chargeColumn = config.chargeColumn;
      if (config.creditColumn !== undefined) res.creditColumn = config.creditColumn;
    } else {
      if (config.amountColumn !== undefined) res.amountColumn = config.amountColumn;
    }
    if (config.typeColumn !== undefined) res.typeColumn = config.typeColumn;
    if (config.currencyColumn !== undefined) res.currencyColumn = config.currencyColumn;
    if (config.referenceColumn !== undefined) res.referenceColumn = config.referenceColumn;
    return res;
  }

  /**
   * Busca entre plantillas guardadas aquella que coincida mejor con los encabezados del archivo.
   */
  public findBestTemplate(headers: string[], templates: MappingTemplate[]): MappingTemplate | null {
    if (!headers || headers.length === 0 || !templates || templates.length === 0) {
      return null;
    }

    const normalizedCurrent = headers.map((h) => CsvColumnDetector.normalizeHeader(h));
    let bestMatch: MappingTemplate | null = null;
    let highestScore = 0;

    for (const t of templates) {
      if (!t.headers || t.headers.length === 0) continue;

      const templateHeadersNorm = t.headers.map((h) => CsvColumnDetector.normalizeHeader(h));
      const matchCount = templateHeadersNorm.filter((th) => normalizedCurrent.includes(th)).length;
      const score = matchCount / Math.max(templateHeadersNorm.length, normalizedCurrent.length);

      // Si coincide al menos el 60% de los encabezados y es la puntuación más alta
      if (score >= 0.6 && score > highestScore) {
        highestScore = score;
        bestMatch = t;
      }
    }

    return bestMatch;
  }

  private extractCellValue(row: any[], headers: string[], colRef?: string | number): any {
    if (colRef === undefined || colRef === null || colRef === '') return undefined;

    let index = -1;
    if (typeof colRef === 'number') {
      index = colRef;
    } else {
      index = headers.indexOf(colRef);
      if (index === -1) {
        const normRef = CsvColumnDetector.normalizeHeader(colRef);
        index = headers.findIndex((h) => CsvColumnDetector.normalizeHeader(h) === normRef);
      }
    }

    if (index >= 0 && index < row.length) {
      return row[index];
    }
    return undefined;
  }

  private parseDate(val: any): Date | null {
    if (!val) return null;
    if (val instanceof Date) {
      return isNaN(val.getTime()) ? null : val;
    }
    const str = String(val).trim();
    return StatementDateHelper.parseBankDate(str);
  }

  private parseNumericAmount(val: any): number | null {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'number') {
      return isNaN(val) ? null : val;
    }

    const str = String(val).trim();
    if (str.length === 0) return null;

    let clean = str.replace(/[$€£\s]/g, '');
    const isNegative = clean.startsWith('-') || (clean.startsWith('(') && clean.endsWith(')'));
    clean = clean.replace(/[()]/g, '');

    const lastComma = clean.lastIndexOf(',');
    const lastDot = clean.lastIndexOf('.');

    if (lastComma > lastDot && lastComma > 0) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
      clean = clean.replace(/,/g, '');
    }

    const num = parseFloat(clean);
    if (isNaN(num)) return null;
    return isNegative ? -Math.abs(num) : num;
  }
}

export const defaultColumnMappingService = new ColumnMappingService();
