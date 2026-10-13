/**
 * US-039: Parser de Estados de Cuenta American Express México (AMEX)
 */

import type { ExtractedPdfTable } from '../../../interfaces/IPdfTextExtractor';
import { BaseStatementParser } from './BaseStatementParser';

export class AmexStatementParser extends BaseStatementParser {
  readonly bankCode = 'AMEX';
  readonly bankName = 'American Express México';

  canParse(bankHint: string, rawText: string, _tables?: ExtractedPdfTable[]): boolean {
    const hint = (bankHint || '').toUpperCase();
    if (hint === 'AMEX' || hint.includes('AMERICAN EXPRESS')) return true;

    const upper = (rawText || '').toUpperCase();
    return (
      upper.includes('AMERICAN EXPRESS') ||
      upper.includes('THE AMERICAN EXPRESS') ||
      upper.includes('AMEX BANK') ||
      upper.includes('CENTURION')
    );
  }
}
