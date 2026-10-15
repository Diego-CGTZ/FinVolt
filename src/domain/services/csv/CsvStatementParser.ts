/**
 * US-040: Parser de Archivos CSV y Generador de TransactionCandidates
 *
 * Criterios de Aceptación:
 * 1. Parser compatible con RFC 4180 (manejo de comillas, saltos de línea y delimitadores).
 * 2. Conversión estructurada de filas a TransactionCandidates canónicos.
 * 3. Normalización de fecha, comercio y tipos contables.
 * 4. Cálculo de fingerprint determinístico SHA-256 e inmutabilidad de la fuente.
 */

import type { RawEvent } from '../../models/RawEvent';
import type { TransactionCandidate } from '../../models/TransactionCandidate';
import type { TransactionType } from '../../models/Transaction';
import type {
  CsvColumnMapping,
  CsvParseOptions,
  CsvParseResult,
  ICsvStatementParser,
} from '../../interfaces/ICsvStatementParser';
import { defaultMerchantNormalizer } from '../MerchantNormalizer';
import { TransactionFingerprintService } from '../fingerprint/TransactionFingerprintService';
import { StatementDateHelper } from '../statements/parsers/StatementDateHelper';
import { CsvFileValidator } from './CsvFileValidator';
import { CsvColumnDetector } from './CsvColumnDetector';

export class CsvStatementParser implements ICsvStatementParser {
  /**
   * Parsea texto CSV dividiéndolo en filas y columnas respetando comillas dobles y caracteres de escape.
   */
  public static parseCsvLines(csvText: string, delimiter = ','): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;
    let i = 0;
    const len = csvText.length;

    while (i < len) {
      const char = csvText[i];

      if (char === '"') {
        if (inQuotes && i + 1 < len && csvText[i + 1] === '"') {
          // Comilla escapada "" dentro de una celda entrecomillada
          currentCell += '"';
          i += 2;
          continue;
        } else {
          // Alternar estado de comillas
          inQuotes = !inQuotes;
          i++;
          continue;
        }
      }

      if (!inQuotes && char === delimiter) {
        currentRow.push(currentCell.trim());
        currentCell = '';
        i++;
        continue;
      }

      if (!inQuotes && (char === '\n' || char === '\r')) {
        // Manejar \r\n o \n individual
        if (char === '\r' && i + 1 < len && csvText[i + 1] === '\n') {
          i++;
        }
        currentRow.push(currentCell.trim());
        if (currentRow.some((c) => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
        i++;
        continue;
      }

      currentCell += char;
      i++;
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c.length > 0)) {
        rows.push(currentRow);
      }
    }

    return rows;
  }

  /**
   * Parsea un importe monetario numérico de una celda CSV.
   */
  private static parseAmount(value?: string): number | null {
    if (!value || typeof value !== 'string') return null;
    let clean = value.replace(/[^\d.,()\-+]/g, '');
    if (!clean) return null;

    // Notacion contable: (1,234.50) significa negativo
    let negative = false;
    if (/^\(.*\)$/.test(clean)) {
      negative = true;
      clean = clean.slice(1, -1);
    }
    // Signo menos al final (1,234.50-) o al inicio
    if (clean.endsWith('-')) {
      negative = true;
      clean = clean.slice(0, -1);
    }
    clean = clean.replace(/[()]/g, '');
    if (clean.startsWith('-')) {
      negative = true;
      clean = clean.slice(1);
    }
    clean = clean.replace(/^\+/, '');

    const lastComma = clean.lastIndexOf(',');
    const lastDot = clean.lastIndexOf('.');
    if (lastComma !== -1 && lastDot !== -1) {
      // Ambos separadores: el ultimo es el decimal (1.234,56 europeo / 1,234.56 estandar)
      if (lastComma > lastDot) {
        clean = clean.replace(/\./g, '').replace(',', '.');
      } else {
        clean = clean.replace(/,/g, '');
      }
    } else if (lastComma !== -1) {
      // Solo comas: "12,50" decimal; "1,234" o "1,234,567" miles
      const decimals = clean.length - lastComma - 1;
      const commaCount = clean.split(',').length - 1;
      if (commaCount === 1 && decimals >= 1 && decimals <= 2) {
        clean = clean.replace(',', '.');
      } else {
        clean = clean.replace(/,/g, '');
      }
    }

    if (!/^\d*\.?\d+$|^\d+\.$/.test(clean)) return null;
    const num = parseFloat(clean);
    if (isNaN(num)) return null;
    return negative ? -num : num;
  }

  /**
   * Obtiene el valor de una celda por nombre de columna o índice numérico.
   */
  private static getCellValue(
    row: string[],
    headers: string[],
    colIdentifier?: string | number,
  ): string | undefined {
    if (colIdentifier === undefined || colIdentifier === null) return undefined;

    if (typeof colIdentifier === 'number') {
      return row[colIdentifier];
    }

    const idx = headers.findIndex(
      (h) => h.toUpperCase() === String(colIdentifier).toUpperCase(),
    );
    if (idx !== -1) {
      return row[idx];
    }

    // Intento con normalización
    const normId = CsvColumnDetector.normalizeHeader(String(colIdentifier));
    const normIdx = headers.findIndex((h) => CsvColumnDetector.normalizeHeader(h) === normId);
    return normIdx !== -1 ? row[normIdx] : undefined;
  }

  /**
   * Genera un identificador único para el candidato.
   */
  private generateCandidateId(prefix = 'cand_csv'): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}_${crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Parsea el contenido CSV y genera los candidatos de transacción.
   */
  public async parse(
    rawCsvText: string,
    rawEvent: RawEvent,
    options?: CsvParseOptions,
    userId?: string,
  ): Promise<CsvParseResult> {
    const delimiter = options?.delimiter || CsvFileValidator.detectDelimiter(rawCsvText);
    const parsedRows = CsvStatementParser.parseCsvLines(rawCsvText, delimiter);

    if (parsedRows.length === 0) {
      return {
        candidates: [],
        duplicatesCount: 0,
        reconciledCount: 0,
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        detectedMapping: { dateColumn: 0, descriptionColumn: 1 },
        delimiterUsed: delimiter,
        rawEventId: rawEvent.id,
      };
    }

    const hasHeader = options?.hasHeader !== false;
    let headers: string[] = [];
    let dataRows: string[][] = [];

    if (hasHeader) {
      headers = parsedRows[0];
      dataRows = parsedRows.slice(1);
    } else {
      headers = parsedRows[0].map((_, i) => `Col_${i}`);
      dataRows = parsedRows;
    }

    // Detección o uso de mapeo provisto
    const detectedMapping = CsvColumnDetector.detectMapping(headers, dataRows.slice(0, 10));
    const effectiveMapping: CsvColumnMapping = {
      ...detectedMapping,
      ...(options?.mapping || {}),
    };

    const ownerUserId = userId || rawEvent.userId;
    const rawBank = options?.bankHint || (rawEvent.metadata?.bankDetected as string) || (rawEvent.payload?.bankDetected as string);
    const provider = (rawBank && rawBank !== 'UNKNOWN') ? rawBank : 'CSV_IMPORT';
    const defaultCurrency = options?.defaultCurrency || 'MXN';

    const candidates: TransactionCandidate[] = [];
    let invalidRows = 0;

    for (let r = 0; r < dataRows.length; r++) {
      const row = dataRows[r];
      if (options?.skipEmptyRows !== false && row.every((c) => c.length === 0)) {
        continue;
      }

      const dateRaw = CsvStatementParser.getCellValue(row, headers, effectiveMapping.dateColumn);
      const descRaw = CsvStatementParser.getCellValue(row, headers, effectiveMapping.descriptionColumn);

      // Evaluación de importes
      let amountVal: number | null = null;
      let inferredType: TransactionType = 'EXPENSE';

      if (effectiveMapping.chargeColumn !== undefined || effectiveMapping.creditColumn !== undefined) {
        const chargeStr = CsvStatementParser.getCellValue(row, headers, effectiveMapping.chargeColumn);
        const creditStr = CsvStatementParser.getCellValue(row, headers, effectiveMapping.creditColumn);
        const chargeNum = CsvStatementParser.parseAmount(chargeStr);
        const creditNum = CsvStatementParser.parseAmount(creditStr);

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

      // Si no se obtuvo de cargo/abono, evaluar columna de monto general
      if (amountVal === null && effectiveMapping.amountColumn !== undefined) {
        const amountStr = CsvStatementParser.getCellValue(row, headers, effectiveMapping.amountColumn);
        const num = CsvStatementParser.parseAmount(amountStr);
        if (num !== null) {
          amountVal = Math.abs(num);
          inferredType = num < 0 ? 'INCOME' : 'EXPENSE';
        }
      }

      // Si no hay importe o es cero, fila inválida
      if (amountVal === null || amountVal <= 0) {
        invalidRows++;
        continue;
      }

      // Parseo de fecha
      const dateParsed = StatementDateHelper.parseBankDate(dateRaw);
      const occurredAt = dateParsed || rawEvent.receivedAt || new Date();

      // Tipo explícito si existe
      if (effectiveMapping.typeColumn !== undefined) {
        const typeStr = CsvStatementParser.getCellValue(row, headers, effectiveMapping.typeColumn)?.toUpperCase();
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
        // Inferencia por descripción
        const upperDesc = (descRaw || '').toUpperCase();
        if (upperDesc.includes('NOMINA') || upperDesc.includes('SPEI RECIBIDO') || upperDesc.includes('DEVOLUCION')) {
          inferredType = 'INCOME';
        } else if (upperDesc.includes('TRASPASO') || upperDesc.includes('PAGO DE MI TARJETA')) {
          inferredType = 'TRANSFER';
        }
      }

      // Moneda
      let currency = defaultCurrency;
      if (effectiveMapping.currencyColumn !== undefined) {
        const currStr = CsvStatementParser.getCellValue(row, headers, effectiveMapping.currencyColumn)?.toUpperCase();
        if (currStr && /^[A-Z]{3}$/.test(currStr)) {
          currency = currStr;
        }
      }

      // Normalización de comercio
      const rawMerchant = descRaw || 'Movimiento CSV';
      const normResult = defaultMerchantNormalizer.normalizeSync(rawMerchant);
      const cleanMerchant = normResult.normalizedMerchant || rawMerchant;

      const amountMinor = Math.round(amountVal * 100);

      // Referencia o folio
      const reference = effectiveMapping.referenceColumn !== undefined
        ? CsvStatementParser.getCellValue(row, headers, effectiveMapping.referenceColumn)
        : undefined;

      // Huella determinística calculada para conciliación y deduplicación (US-025)
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
        source: 'BANK_CSV',
        provider,
        amountMinor,
        amount: amountVal,
        currency,
        type: inferredType,
        merchantRaw: rawMerchant,
        merchant: cleanMerchant,
        occurredAt,
        confidenceScore,
        status: 'PENDING_REVIEW',
        fingerprint,
        rawPayload: JSON.parse(JSON.stringify(rawEvent.payload || {})),
        metadata: {
          csvRowNumber: r + (hasHeader ? 2 : 1),
          rawRow: row,
          reference,
          detectedMapping: effectiveMapping,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      candidates.push(candidate);
    }

    return {
      candidates,
      duplicatesCount: 0,
      reconciledCount: 0,
      totalRows: dataRows.length,
      validRows: candidates.length,
      invalidRows,
      detectedMapping: effectiveMapping,
      delimiterUsed: delimiter,
      rawEventId: rawEvent.id,
    };
  }
}
