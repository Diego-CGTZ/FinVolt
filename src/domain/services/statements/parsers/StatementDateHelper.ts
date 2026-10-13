/**
 * US-039: Helper de Normalización de Fechas para Estados de Cuenta Bancarios
 *
 * Soporta formatos bancarios típicos en México e Iberoamérica:
 * - 12/OCT/2026, 12-OCT-26, 12 OCT 2026
 * - 12/10/2026, 12-10-2026, 12/10/26
 * - 2026-10-12
 * - Formatos con mes abreviado o completo sin año (infiriendo año del periodo o fecha actual)
 */

export class StatementDateHelper {
  private static readonly MONTH_MAP: Record<string, number> = {
    ENE: 0,
    ENERO: 0,
    JAN: 0,
    FEB: 1,
    FEBRERO: 1,
    MAR: 2,
    MARZO: 2,
    ABR: 3,
    ABRIL: 3,
    APR: 3,
    MAY: 4,
    MAYO: 4,
    JUN: 5,
    JUNIO: 6,
    JUL: 6,
    JULIO: 6,
    AGO: 7,
    AGOSTO: 7,
    AUG: 7,
    SEP: 8,
    SEPTIEMBRE: 8,
    SET: 8,
    OCT: 9,
    OCTUBRE: 9,
    NOV: 10,
    NOVIEMBRE: 10,
    DIC: 11,
    DICIEMBRE: 11,
    DEC: 11,
  };

  /**
   * Intenta parsear una cadena de fecha bancaria a un objeto Date válido.
   */
  public static parseBankDate(rawDateStr?: string, defaultYear?: number): Date | null {
    if (!rawDateStr || typeof rawDateStr !== 'string') return null;

    const trimmed = rawDateStr.trim().toUpperCase();
    const fallbackYear = defaultYear || new Date().getFullYear();

    // 1. Formato ISO: YYYY-MM-DD
    const isoMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(trimmed);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10) - 1;
      const day = parseInt(isoMatch[3], 10);
      return new Date(Date.UTC(year, month, day, 12, 0, 0));
    }

    // 2. Formato alfanumérico: DD/MMM/YYYY o DD-MMM-YYYY o DD MMM YYYY o DD/MMM
    const alphaMatch = /^(\d{1,2})(?:\s*[/ -]\s*)([A-Z]{3,10})(?:(?:\s*[/ -]\s*)(\d{2,4}))?/.exec(trimmed);
    if (alphaMatch) {
      const day = parseInt(alphaMatch[1], 10);
      const monthStr = alphaMatch[2];
      const yearStr = alphaMatch[3];

      const month = this.MONTH_MAP[monthStr];
      if (month !== undefined) {
        let year = fallbackYear;
        if (yearStr) {
          year = yearStr.length === 2 ? 2000 + parseInt(yearStr, 10) : parseInt(yearStr, 10);
        }
        return new Date(Date.UTC(year, month, day, 12, 0, 0));
      }
    }

    // 3. Formato numérico estándar: DD/MM/YYYY o DD-MM-YYYY o DD/MM/YY
    const numericMatch = /^(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?/.exec(trimmed);
    if (numericMatch) {
      const day = parseInt(numericMatch[1], 10);
      const month = parseInt(numericMatch[2], 10) - 1;
      const yearStr = numericMatch[3];

      let year = fallbackYear;
      if (yearStr) {
        year = yearStr.length === 2 ? 2000 + parseInt(yearStr, 10) : parseInt(yearStr, 10);
      }

      if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
        return new Date(Date.UTC(year, month, day, 12, 0, 0));
      }
    }

    return null;
  }
}
