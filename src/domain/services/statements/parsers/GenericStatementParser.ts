/**
 * US-039: Parser Genérico / Fallback para Estados de Cuenta Bancarios
 *
 * Procesa cualquier tabla estructurada o filas transaccionales detectadas
 * cuando la institución no cuenta con un parser dedicado.
 */

import type { ExtractedPdfTable } from '../../../interfaces/IPdfTextExtractor';
import { BaseStatementParser } from './BaseStatementParser';

export class GenericStatementParser extends BaseStatementParser {
  readonly bankCode = 'GENERIC';
  readonly bankName = 'Institución Bancaria';

  canParse(_bankHint: string, _rawText: string, _tables?: ExtractedPdfTable[]): boolean {
    // El parser genérico puede procesar cualquier estado de cuenta como fallback
    return true;
  }
}
