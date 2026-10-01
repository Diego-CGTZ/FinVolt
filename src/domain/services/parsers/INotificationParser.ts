/**
 * US-021: Parser Interface
 *
 * Contrato que deben cumplir todos los parsers de notificaciones financieras.
 */

import type { RawEvent } from '../../models/RawEvent';
import type { TransactionType } from '../../models/Transaction';
import type { AccountHint } from '../../models/TransactionCandidate';

export interface ParsedCandidateResult {
  amount: number;
  currency: string;
  type: TransactionType;
  merchantRaw: string | null;
  merchant: string | null;
  occurredAt: Date;
  accountHint?: AccountHint;
  confidence: number;
  parserName: string;
}

export interface INotificationParser {
  readonly parserName: string;

  /**
   * Determina si este parser puede procesar el evento según el proveedor
   * o las características del payload.
   */
  canParse(provider: string, rawEvent: RawEvent): boolean;

  /**
   * Parsea el evento crudo y extrae los campos estructurados del candidato.
   * Si no puede extraer los datos esenciales (ej: falta monto), retorna null.
   */
  parse(rawEvent: RawEvent): Promise<ParsedCandidateResult | null>;
}
