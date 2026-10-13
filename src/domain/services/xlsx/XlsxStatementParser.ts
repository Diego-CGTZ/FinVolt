/**
 * US-041: Parser de Estados de Cuenta y Libros Financieros XLSX
 *
 * Acceptance Criteria:
 * 1. Hojas y columnas detectadas (soporte multihoja, auto-detección de fila de encabezados y columnas).
 * 2. Soporte de formatos numéricos de fecha de Excel y cadenas de fecha universales.
 * 3. Filas convertidas a candidates (TransactionCandidate con fingerprint determinístico de US-025).
 * 4. Trazabilidad completa con RawEvent y preservación de fuentes.
 *
 * Invariante arquitectónica: Cero inserciones directas en el modelo Transaction.
 */

import * as XLSX from 'xlsx';
import type {
  IXlsxStatementParser,
  XlsxColumnMapping,
  XlsxParseOptions,
  XlsxParseResult,
} from '../../interfaces/IXlsxStatementParser';
import type { RawEvent } from '../../models/RawEvent';
import type { TransactionCandidate } from '../../models/TransactionCandidate';
import type { TransactionType } from '../../models/Transaction';
import { CsvColumnDetector } from '../csv/CsvColumnDetector';
import { defaultMerchantNormalizer } from '../MerchantNormalizer';
import { StatementDateHelper } from '../statements/parsers/StatementDateHelper';
import { TransactionFingerprintService } from '../fingerprint/TransactionFingerprintService';
import { XlsxFileValidator } from './XlsxFileValidator';

export class XlsxStatementParser implements IXlsxStatementParser {
  /**
   * Extrae la lista de nombres de hojas disponibles en el libro XLSX.
   */
  public listSheets(content: Uint8Array | ArrayBuffer | string): string[] {
    try {
      const bytes = XlsxFileValidator.toUint8Array(content);
      const workbook = XLSX.read(bytes, { type: 'array', bookSheets: true });
      return workbook.SheetNames || [];
    } catch {
      return [];
    }
  }

  /**
   * Parsea el libro XLSX y genera candidatos financieros estructurados.
   */
  public async parse(
    content: Uint8Array | ArrayBuffer | string,
    rawEvent: RawEvent,
    options?: XlsxParseOptions,
    userId?: string,
  ): Promise<XlsxParseResult> {
    const bytes = XlsxFileValidator.toUint8Array(content);
    if (!bytes || bytes.length === 0) {
      return this.emptyResult('No se proporcionó contenido binario válido para el archivo XLSX.');
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
    } catch (err) {
      return this.emptyResult(`Error al leer la estructura del libro XLSX: ${err instanceof Error ? err.message : String(err)}`);
    }

    const availableSheets = workbook.SheetNames || [];
    if (availableSheets.length === 0) {
      return this.emptyResult('El archivo XLSX no contiene ninguna hoja.');
    }

    // 1. Selección de hoja de trabajo
    let targetSheetName = availableSheets[0];
    if (options?.sheetName && availableSheets.includes(options.sheetName)) {
      targetSheetName = options.sheetName;
    } else if (
      options?.sheetIndex !== undefined &&
      options.sheetIndex >= 0 &&
      options.sheetIndex < availableSheets.length
    ) {
      targetSheetName = availableSheets[options.sheetIndex];
    }

    const worksheet = workbook.Sheets[targetSheetName];
    if (!worksheet) {
      return {
        success: false,
        sheetName: targetSheetName,
        availableSheets,
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        duplicatesCount: 0,
        reconciledCount: 0,
        candidates: [],
        mappingUsed: {},
        errors: [`No se encontró la hoja "${targetSheetName}".`],
      };
    }

    // 2. Extracción de matriz bidimensional de datos
    const rawMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      blankrows: false,
    });

    if (!rawMatrix || rawMatrix.length === 0) {
      return {
        success: true,
        sheetName: targetSheetName,
        availableSheets,
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        duplicatesCount: 0,
        reconciledCount: 0,
        candidates: [],
        mappingUsed: {},
      };
    }

    // 3. Localización de la fila de encabezados
    const headerRowIdx = options?.headerRowIndex !== undefined
      ? options.headerRowIndex
      : this.findHeaderRowIndex(rawMatrix);

    const headers: string[] = (rawMatrix[headerRowIdx] || []).map((cell) => String(cell ?? '').trim());
    const dataRows = rawMatrix.slice(headerRowIdx + 1);

    // Muestras como cadenas de texto para detector
    const sampleRows: string[][] = dataRows.slice(0, 10).map((row) =>
      row.map((cell) => (cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell ?? '').trim())),
    );

    // 4. Detección o combinación de mapeo de columnas
    const detectedMapping = CsvColumnDetector.detectMapping(headers, sampleRows);
    const effectiveMapping: XlsxColumnMapping = {
      ...detectedMapping,
      ...(options?.mapping || {}),
    };

    const ownerUserId = userId || rawEvent.userId;
    const rawBank = options?.bankHint || (rawEvent.metadata?.bankDetected as string) || (rawEvent.payload?.bankDetected as string);
    const provider = rawBank && rawBank !== 'UNKNOWN' ? rawBank : 'XLSX_IMPORT';
    const defaultCurrency = options?.defaultCurrency || 'MXN';

    const candidates: TransactionCandidate[] = [];
    let invalidRows = 0;

    // 5. Procesamiento fila por fila
    for (let r = 0; r < dataRows.length; r++) {
      const row = dataRows[r];
      if (options?.skipEmptyRows !== false && row.every((c) => c === '' || c === null || c === undefined)) {
        continue;
      }

      const dateRaw = this.getCellValue(row, headers, effectiveMapping.dateColumn);
      const descRaw = this.getCellValue(row, headers, effectiveMapping.descriptionColumn);

      // Evaluación de importes (cargos/abonos o monto único)
      let amountVal: number | null = null;
      let inferredType: TransactionType = 'EXPENSE';

      if (effectiveMapping.chargeColumn !== undefined || effectiveMapping.creditColumn !== undefined) {
        const chargeStr = this.getCellValue(row, headers, effectiveMapping.chargeColumn);
        const creditStr = this.getCellValue(row, headers, effectiveMapping.creditColumn);
        const chargeNum = this.parseNumericAmount(chargeStr);
        const creditNum = this.parseNumericAmount(creditStr);

        if (chargeNum !== null && chargeNum > 0) {
          amountVal = chargeNum;
          inferredType = 'EXPENSE';
        } else if (creditNum !== null && creditNum > 0) {
          amountVal = creditNum;
          inferredType = 'INCOME';
        } else if (chargeNum !== null && chargeNum !== 0) {
          amountVal = Math.abs(chargeNum);
          inferredType = chargeNum < 0 ? 'INCOME' : 'EXPENSE';
        } else if (creditNum !== null && creditNum !== 0) {
          amountVal = Math.abs(creditNum);
          inferredType = 'INCOME';
        }
      }

      if (amountVal === null && effectiveMapping.amountColumn !== undefined) {
        const amountRaw = this.getCellValue(row, headers, effectiveMapping.amountColumn);
        const num = this.parseNumericAmount(amountRaw);
        if (num !== null) {
          amountVal = Math.abs(num);
          inferredType = num < 0 ? 'INCOME' : 'EXPENSE';
        }
      }

      if (amountVal === null || amountVal <= 0) {
        invalidRows++;
        continue;
      }

      // Parseo de fecha
      const dateParsed = this.parseDateValue(dateRaw);
      const occurredAt = dateParsed || rawEvent.receivedAt || new Date();

      // Tipo explícito si existe columna
      if (effectiveMapping.typeColumn !== undefined) {
        const typeStr = String(this.getCellValue(row, headers, effectiveMapping.typeColumn) || '').toUpperCase();
        if (typeStr) {
          if (typeStr.includes('ABONO') || typeStr.includes('DEPOSITO') || typeStr.includes('INGRESO') || typeStr.includes('INCOME')) {
            inferredType = 'INCOME';
          } else if (typeStr.includes('CARGO') || typeStr.includes('RETIRO') || typeStr.includes('GASTO') || typeStr.includes('EXPENSE')) {
            inferredType = 'EXPENSE';
          } else if (typeStr.includes('TRASPASO') || typeStr.includes('TRANSFER')) {
            inferredType = 'TRANSFER';
          }
        }
      } else {
        const upperDesc = String(descRaw || '').toUpperCase();
        if (upperDesc.includes('NOMINA') || upperDesc.includes('SPEI RECIBIDO') || upperDesc.includes('DEVOLUCION')) {
          inferredType = 'INCOME';
        } else if (upperDesc.includes('TRASPASO') || upperDesc.includes('PAGO DE MI TARJETA')) {
          inferredType = 'TRANSFER';
        }
      }

      // Divisa
      let currency = defaultCurrency;
      if (effectiveMapping.currencyColumn !== undefined) {
        const currStr = String(this.getCellValue(row, headers, effectiveMapping.currencyColumn) || '').trim().toUpperCase();
        if (currStr && /^[A-Z]{3}$/.test(currStr)) {
          currency = currStr;
        }
      }

      // Normalización de comercio
      const rawMerchant = descRaw ? String(descRaw) : 'Movimiento XLSX';
      const normResult = defaultMerchantNormalizer.normalizeSync(rawMerchant);
      const cleanMerchant = normResult.normalizedMerchant || rawMerchant;

      const amountMinor = Math.round(amountVal * 100);

      const reference = effectiveMapping.referenceColumn !== undefined
        ? String(this.getCellValue(row, headers, effectiveMapping.referenceColumn) || '')
        : undefined;

      // Huella determinística SHA-256 (US-025)
      const fingerprint = TransactionFingerprintService.calculate({
        account: provider,
        amountMinor,
        currency,
        date: occurredAt,
        merchant: cleanMerchant,
        type: inferredType,
      });

      const confidenceScore = dateParsed && descRaw ? 95 : 80;

      const candidate: TransactionCandidate = {
        id: this.generateCandidateId(),
        userId: ownerUserId,
        rawEventId: rawEvent.id,
        source: 'BANK_XLSX',
        provider,
        accountHint: {
          bankName: provider,
        },
        amount: amountVal,
        amountMinor,
        currency,
        type: inferredType,
        merchant: cleanMerchant,
        merchantRaw: rawMerchant,
        occurredAt,
        status: 'PENDING_REVIEW',
        confidenceScore,
        fingerprint,
        rawPayload: JSON.parse(JSON.stringify(rawEvent.payload || {})),
        metadata: {
          confidenceLevel: confidenceScore >= 90 ? 'HIGH' : 'MEDIUM',
          sourceType: 'BANK_XLSX',
          fileName: rawEvent.payload?.fileName,
          sheetName: targetSheetName,
          rowIndex: r + headerRowIdx + 2,
          reference: reference || undefined,
          parsedAt: new Date().toISOString(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      candidates.push(candidate);
    }

    return {
      success: true,
      sheetName: targetSheetName,
      availableSheets,
      totalRows: dataRows.length,
      validRows: candidates.length,
      invalidRows,
      duplicatesCount: 0,
      reconciledCount: 0,
      candidates,
      mappingUsed: effectiveMapping,
    };
  }

  private emptyResult(errorMessage: string): XlsxParseResult {
    return {
      success: false,
      sheetName: '',
      availableSheets: [],
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      duplicatesCount: 0,
      reconciledCount: 0,
      candidates: [],
      mappingUsed: {},
      errors: [errorMessage],
    };
  }

  /**
   * Encuentra la fila que contiene los encabezados en caso de filas de metadatos iniciales.
   */
  private findHeaderRowIndex(matrix: any[][]): number {
    const maxLookahead = Math.min(matrix.length, 12);
    for (let i = 0; i < maxLookahead; i++) {
      const row = matrix[i] || [];
      const rowStrings = row.map((c) => String(c ?? '').trim().toUpperCase());
      const hasDate = rowStrings.some((s) => s.includes('FECHA') || s.includes('DATE') || s.includes('DIA'));
      const hasConcept = rowStrings.some((s) => s.includes('CONCEPTO') || s.includes('DESCRIP') || s.includes('DETALLE'));
      const hasAmount = rowStrings.some(
        (s) => s.includes('MONTO') || s.includes('IMPORTE') || s.includes('CARGO') || s.includes('ABONO') || s.includes('AMOUNT'),
      );

      if ((hasDate && hasConcept) || (hasDate && hasAmount) || (hasConcept && hasAmount)) {
        return i;
      }
    }
    return 0;
  }

  private getCellValue(row: any[], headers: string[], columnRef?: string | number): any {
    if (columnRef === undefined || columnRef === null || columnRef === -1) {
      return undefined;
    }

    let colIndex = -1;
    if (typeof columnRef === 'number') {
      colIndex = columnRef;
    } else {
      colIndex = headers.indexOf(columnRef);
      if (colIndex === -1) {
        const normRef = CsvColumnDetector.normalizeHeader(columnRef);
        colIndex = headers.findIndex((h) => CsvColumnDetector.normalizeHeader(h) === normRef);
      }
    }

    if (colIndex >= 0 && colIndex < row.length) {
      return row[colIndex];
    }
    return undefined;
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

  private parseDateValue(val: any): Date | null {
    if (!val) return null;

    if (val instanceof Date) {
      if (!isNaN(val.getTime())) {
        return new Date(Date.UTC(val.getFullYear(), val.getMonth(), val.getDate(), 12, 0, 0));
      }
    }

    // Número serial de Excel (ej: 45577 para 2024-10-12)
    if (typeof val === 'number' && val > 1000 && val < 90000) {
      const parsedDate = XLSX.SSF.parse_date_code(val);
      if (parsedDate && parsedDate.y && parsedDate.m && parsedDate.d) {
        return new Date(Date.UTC(parsedDate.y, parsedDate.m - 1, parsedDate.d, 12, 0, 0));
      }
    }

    const str = String(val).trim();
    return StatementDateHelper.parseBankDate(str);
  }

  private generateCandidateId(): string {
    const randomHex = Math.random().toString(36).slice(2, 10);
    return `cand_xlsx_${Date.now()}_${randomHex}`;
  }
}
