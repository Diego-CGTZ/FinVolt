/**
 * US-039: Parser de Estados de Cuenta BBVA México
 *
 * Soporta cuentas de débito (Libretón) y tarjetas de crédito (Azul, Oro, Platino).
 */

import type { ExtractedPdfTable } from '../../../interfaces/IPdfTextExtractor';
import { BaseStatementParser } from './BaseStatementParser';

export class BBVAStatementParser extends BaseStatementParser {
  readonly bankCode = 'BBVA';
  readonly bankName = 'BBVA México';

  canParse(bankHint: string, rawText: string, _tables?: ExtractedPdfTable[]): boolean {
    const hint = (bankHint || '').toUpperCase();
    if (hint === 'BBVA' || hint.includes('BANCOMER')) return true;

    const upper = (rawText || '').toUpperCase();
    return (
      upper.includes('BBVA BANCOMER') ||
      upper.includes('BBVA MEXICO') ||
      upper.includes('GRUPO FINANCIERO BBVA') ||
      (upper.includes('BBVA') && (upper.includes('LIBRETON') || upper.includes('ESTADO DE CUENTA')))
    );
  }
}
