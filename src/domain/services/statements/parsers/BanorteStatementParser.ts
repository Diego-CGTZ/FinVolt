/**
 * US-039: Parser de Estados de Cuenta Banorte / IXE México
 */

import type { ExtractedPdfTable } from '../../../interfaces/IPdfTextExtractor';
import { BaseStatementParser } from './BaseStatementParser';

export class BanorteStatementParser extends BaseStatementParser {
  readonly bankCode = 'BANORTE';
  readonly bankName = 'Grupo Financiero Banorte';

  canParse(bankHint: string, rawText: string, _tables?: ExtractedPdfTable[]): boolean {
    const hint = (bankHint || '').toUpperCase();
    if (hint === 'BANORTE' || hint.includes('IXE')) return true;

    const upper = (rawText || '').toUpperCase();
    return (
      upper.includes('BANORTE') ||
      upper.includes('BANCO MERCANTIL DEL NORTE') ||
      upper.includes('GRUPO FINANCIERO BANORTE') ||
      upper.includes('IXE BANCO')
    );
  }
}
