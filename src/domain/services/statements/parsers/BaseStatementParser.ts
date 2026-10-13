/**
 * US-039: Parser Base para Estados de Cuenta Bancarios
 *
 * Provee la lógica común de extracción de cuentas, normalización de comercios,
 * determinación de tipo contable y generación de TransactionCandidates con fingerprint.
 */

import type { RawEvent } from '../../../models/RawEvent';
import type { AccountHint, TransactionCandidate } from '../../../models/TransactionCandidate';
import type { TransactionType } from '../../../models/Transaction';
import type {
  ExtractedPdfTable,
  ExtractedTableRow,
  PdfExtractionResult,
} from '../../../interfaces/IPdfTextExtractor';
import type {
  BankStatementParseResult,
  IBankStatementParser,
} from '../../../interfaces/IBankStatementParser';
import { defaultMerchantNormalizer } from '../../MerchantNormalizer';
import { TransactionFingerprintService } from '../../fingerprint/TransactionFingerprintService';
import { StatementDateHelper } from './StatementDateHelper';

export abstract class BaseStatementParser implements IBankStatementParser {
  abstract readonly bankCode: string;
  abstract readonly bankName: string;

  abstract canParse(bankHint: string, rawText: string, tables?: ExtractedPdfTable[]): boolean;

  /**
   * Extrae pistas de la cuenta o tarjeta (ej. últimos 4 dígitos) a partir del texto del PDF.
   */
  protected extractAccountHint(rawText: string): AccountHint | undefined {
    let last4: string | undefined;

    // 1. Patrón con asteriscos o X explícitos en cualquier parte del texto: ej. ****4321, *******8899, XXXXXX1234
    const maskedMatch = /[*Xx]{2,16}\s*(\d{4})\b/.exec(rawText);
    if (maskedMatch) {
      last4 = maskedMatch[1];
    } else {
      // 2. Patrón de terminación explícita: ej. "TERMINACION 1234" o "TERMINADA EN 4567"
      const termMatch = /(?:TERMINACI[OÓ]N|TERMINADA\s*EN)\s*:?\s*(\d{4})\b/i.exec(rawText);
      if (termMatch) {
        last4 = termMatch[1];
      } else {
        // 3. Patrón de cuenta o contrato con dígitos continuos: ej. "CONTRATO NO. 9988771122"
        const numMatch = /(?:TARJETA|CUENTA|CONTRATO|CLABE)[\s\S]{0,25}?\b(\d{4,20})\b/i.exec(rawText);
        if (numMatch) {
          last4 = numMatch[1].slice(-4);
        }
      }
    }

    const isCredit = /TARJETA DE CR[EÉ]DITO|CR[EÉ]DITO|CREDIT/i.test(rawText);
    const isDebit = /D[EÉ]BITO|CHEQUES|LIBRET[OÓ]N|VISTA|PERFILES|INVERSI[OÓ]N/i.test(rawText);

    const accountType: AccountHint['accountType'] = isCredit
      ? 'CREDIT'
      : isDebit
      ? 'DEBIT'
      : 'OTHER';

    if (last4 || this.bankName) {
      return {
        last4Digits: last4,
        accountType,
        bankName: this.bankName,
      };
    }
    return undefined;
  }

  /**
   * Infiere el año por defecto del estado de cuenta a partir del encabezado o periodo.
   */
  protected inferStatementYear(rawText: string): number {
    const yearMatch = /\b(20[2-3]\d)\b/.exec(rawText);
    if (yearMatch) {
      return parseInt(yearMatch[1], 10);
    }
    return new Date().getFullYear();
  }

  /**
   * Determina el tipo contable del movimiento (EXPENSE, INCOME, TRANSFER).
   */
  protected determineTransactionType(
    row: ExtractedTableRow,
    description: string,
  ): TransactionType {
    const upper = (description || '').toUpperCase();

    // 1. Transferencias entre cuentas
    if (
      upper.includes('TRASPASO ENTRE') ||
      upper.includes('TRANSFERENCIA ENTRE CUENTAS') ||
      upper.includes('PAGO DE MI TARJETA') ||
      upper.includes('APORTE A INVERSION')
    ) {
      return 'TRANSFER';
    }

    // 2. Ingresos / Abonos
    if (
      row.type === 'PAYMENT' ||
      upper.includes('NOMINA') ||
      upper.includes('SPEI RECIBIDO') ||
      upper.includes('DEPOSITO') ||
      upper.includes('ABONO') ||
      upper.includes('TRANSFERENCIA RECIBIDA') ||
      upper.includes('DEVOLUCION') ||
      upper.includes('INTERESES GANADOS') ||
      upper.includes('A FAVOR')
    ) {
      return 'INCOME';
    }

    // 3. Gastos / Cargos (por defecto)
    return 'EXPENSE';
  }

  /**
   * Genera una identificación única y estable para un candidato de transacción.
   */
  protected generateCandidateId(prefix = 'cand_stmt'): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}_${crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Procesa las tablas extraídas y genera los candidatos de transacción.
   */
  public async parse(
    rawEvent: RawEvent,
    extractionResult: PdfExtractionResult,
    userId?: string,
  ): Promise<BankStatementParseResult> {
    const rawText = extractionResult.rawText || rawEvent.rawText || '';
    const tables = extractionResult.tables || [];
    const accountHint = this.extractAccountHint(rawText);
    const defaultYear = this.inferStatementYear(rawText);
    const candidates: TransactionCandidate[] = [];

    const ownerUserId = userId || rawEvent.userId;
    let rawRowsProcessed = 0;

    for (const table of tables) {
      for (const row of table.rows) {
        rawRowsProcessed++;

        // Debe contar con importe para ser candidato
        if (row.amount === undefined || row.amount <= 0) {
          continue;
        }

        const rawDesc = row.description || row.rawLine || 'Movimiento bancario';
        const normalizedMerchant = defaultMerchantNormalizer.normalizeSync(rawDesc);
        const merchantClean = normalizedMerchant.normalizedMerchant || rawDesc;
        const type = this.determineTransactionType(row, rawDesc);
        const occurredAt =
          StatementDateHelper.parseBankDate(row.date, defaultYear) ||
          rawEvent.receivedAt ||
          new Date();

        const amountMinor = row.amountMinor || Math.round(row.amount * 100);

        // Huella determinística calculada para conciliación y deduplicación (US-025)
        const fingerprint = TransactionFingerprintService.calculate({
          account: accountHint || 'unassigned',
          amountMinor,
          currency: 'MXN',
          date: occurredAt,
          merchant: merchantClean,
          type,
        });

        // Nivel de confianza según completitud de datos (90-95% para parser específico)
        const confidenceScore = row.date && row.description ? 95 : 85;

        const candidate: TransactionCandidate = {
          id: this.generateCandidateId(),
          userId: ownerUserId,
          rawEventId: rawEvent.id,
          source: 'BANK_PDF',
          provider: this.bankCode,
          amountMinor,
          amount: row.amount,
          currency: 'MXN',
          type,
          merchantRaw: rawDesc,
          merchant: merchantClean,
          occurredAt,
          confidenceScore,
          accountHint,
          status: 'PENDING_REVIEW',
          fingerprint,
          rawPayload: JSON.parse(JSON.stringify(rawEvent.payload || {})),
          metadata: {
            tableSection: table.sectionTitle,
            rowNumber: row.rowNumber,
            rawRowLine: row.rawLine,
            bankCode: this.bankCode,
            bankName: this.bankName,
            isMsiSection: table.sectionTitle?.includes('MESES') || table.sectionTitle?.includes('PROMOCION'),
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        candidates.push(candidate);
      }
    }

    return {
      candidates,
      bankDetected: this.bankCode,
      accountHint,
      rawRowsProcessed,
      candidatesGenerated: candidates.length,
      metadata: {
        tablesCount: tables.length,
        totalPages: extractionResult.totalPages,
        parserName: this.constructor.name,
      },
    };
  }
}
