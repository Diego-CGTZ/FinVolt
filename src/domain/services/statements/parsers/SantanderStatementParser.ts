/**
 * US-039: Parser de Estados de Cuenta Santander México
 *
 * Soporta cuentas de cheques, Súper Nómina y tarjetas de crédito LikeU y Fiesta Rewards.
 */

import type { ExtractedPdfTable } from '../../../interfaces/IPdfTextExtractor';
import { BaseStatementParser } from './BaseStatementParser';

export class SantanderStatementParser extends BaseStatementParser {
  readonly bankCode = 'SANTANDER';
  readonly bankName = 'Banco Santander México';

  canParse(bankHint: string, rawText: string, _tables?: ExtractedPdfTable[]): boolean {
    const hint = (bankHint || '').toUpperCase();
    if (hint === 'SANTANDER') return true;

    const upper = (rawText || '').toUpperCase();
    return (
      upper.includes('BANCO SANTANDER') ||
      upper.includes('SANTANDER MEXICO') ||
      upper.includes('SUPER CUENTA') ||
      upper.includes('SUPER NOMINA') ||
      (upper.includes('SANTANDER') && upper.includes('ESTADO DE CUENTA'))
    );
  }
}
