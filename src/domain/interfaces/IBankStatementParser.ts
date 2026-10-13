/**
 * US-039: Contratos e Interfaces para el Parser de Estados de Cuenta Bancarios en PDF
 *
 * Criterios de Aceptación:
 * 1. Parser específico por banco (BBVA, Santander, Banorte, Nu, AMEX, Genérico).
 * 2. Extrae fecha, monto, descripción y tipo contable (EXPENSE, INCOME, TRANSFER).
 * 3. Genera TransactionCandidate canónicos con fingerprint y confianza.
 * 4. Conserva la fuente original (RawEvent y source = 'BANK_PDF').
 *
 * INVARIANTE ARQUITECTÓNICA:
 * Nunca escribe directamente en la tabla o entidad Transaction.
 */

import type { RawEvent } from '../models/RawEvent';
import type { AccountHint, TransactionCandidate } from '../models/TransactionCandidate';
import type { ExtractedPdfTable, PdfExtractionResult } from './IPdfTextExtractor';

export interface BankStatementParseResult {
  /** Candidatos de transacción generados a partir de los movimientos del estado de cuenta */
  candidates: TransactionCandidate[];

  /** Banco detectado que ejecutó el parseo */
  bankDetected: string;

  /** Pistas de la cuenta detectadas en el encabezado (ej. últimos 4 dígitos) */
  accountHint?: AccountHint;

  /** Periodo reportado en el estado de cuenta (si está disponible) */
  period?: {
    startDate?: Date;
    endDate?: Date;
    rawPeriod?: string;
  };

  /** Saldo final reportado en el estado de cuenta (en unidades menores/centavos) */
  statementBalanceMinor?: number;

  /** Total de filas o movimientos crudos procesados */
  rawRowsProcessed: number;

  /** Total de candidatos válidos generados */
  candidatesGenerated: number;

  /** Metadatos adicionales de la extracción y parseo */
  metadata?: Record<string, unknown>;
}

export interface IBankStatementParser {
  /** Código único del banco o parser (ej. 'BBVA', 'SANTANDER', 'BANORTE', 'NU', 'AMEX', 'GENERIC') */
  readonly bankCode: string;

  /** Nombre legible de la institución */
  readonly bankName: string;

  /**
   * Determina si este parser puede procesar el texto y las tablas del estado de cuenta.
   */
  canParse(bankHint: string, rawText: string, tables?: ExtractedPdfTable[]): boolean;

  /**
   * Convierte los movimientos y tablas extraídas en una lista de TransactionCandidates.
   */
  parse(
    rawEvent: RawEvent,
    extractionResult: PdfExtractionResult,
    userId?: string,
  ): Promise<BankStatementParseResult>;
}
