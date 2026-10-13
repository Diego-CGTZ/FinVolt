/**
 * US-039: Parser de Estados de Cuenta Nu México
 *
 * Soporta Tarjeta de Crédito Nu y Cuenta Nu (débito/cajitas).
 */

import type { ExtractedPdfTable } from '../../../interfaces/IPdfTextExtractor';
import { BaseStatementParser } from './BaseStatementParser';

export class NuStatementParser extends BaseStatementParser {
  readonly bankCode = 'NU';
  readonly bankName = 'Nu México Financiera';

  canParse(bankHint: string, rawText: string, _tables?: ExtractedPdfTable[]): boolean {
    const hint = (bankHint || '').toUpperCase();
    if (hint === 'NU' || hint.includes('NUBANK')) return true;

    const upper = (rawText || '').toUpperCase();
    return (
      upper.includes('NU MEXICO') ||
      upper.includes('NU PAGOS') ||
      upper.includes('TARJETA DE CREDITO NU') ||
      upper.includes('CUENTA NU') ||
      (upper.includes('NU') && upper.includes('ESTADO DE CUENTA'))
    );
  }
}
