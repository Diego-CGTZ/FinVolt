/**
 * US-040: Detector Inteligente de Mapeo de Columnas CSV
 *
 * Criterio de Aceptación:
 * "Columnas detectadas"
 *
 * Analiza nombres de encabezados e inspecciona muestras de datos para asociar
 * automáticamente las columnas de Fecha, Monto (o Cargos/Abonos separados),
 * Concepto, Tipo, Moneda y Referencia.
 */

import type { CsvColumnMapping } from '../../interfaces/ICsvStatementParser';

export class CsvColumnDetector {
  private static readonly DATE_KEYWORDS = [
    'FECHA',
    'DATE',
    'FECHA OPERACION',
    'FECHA DE OPERACION',
    'FECHA VALOR',
    'FECHA DE VALOR',
    'F. OPERACION',
    'FECHA DE APLICACION',
    'POSTED DATE',
    'TRANS DATE',
    'TRANSACTION DATE',
  ];

  private static readonly AMOUNT_KEYWORDS = [
    'MONTO',
    'IMPORTE',
    'AMOUNT',
    'TOTAL',
    'CANTIDAD',
    'VALOR',
    'IMPORTE MXN',
  ];

  private static readonly CHARGE_KEYWORDS = [
    'CARGO',
    'CARGOS',
    'RETIRO',
    'RETIROS',
    'GASTO',
    'DEBIT',
    'DEBE',
    'SALIDAS',
  ];

  private static readonly CREDIT_KEYWORDS = [
    'ABONO',
    'ABONOS',
    'DEPOSITO',
    'DEPOSITOS',
    'PAGO',
    'CREDIT',
    'HABER',
    'ENTRADAS',
  ];

  private static readonly DESCRIPTION_KEYWORDS = [
    'CONCEPTO',
    'DESCRIPCION',
    'DESCRIPCIÓN',
    'DETALLE',
    'COMERCIO',
    'ESTABLECIMIENTO',
    'DESCRIPTION',
    'MERCHANT',
    'MEMO',
    'NOTAS',
    'TRANSACCION',
    'MOVIMIENTO',
  ];

  private static readonly TYPE_KEYWORDS = [
    'TIPO',
    'TYPE',
    'NATURALEZA',
    'OPERACION',
    'MOVIMIENTO TIPO',
  ];

  private static readonly CURRENCY_KEYWORDS = [
    'MONEDA',
    'DIVISA',
    'CURRENCY',
  ];

  private static readonly REFERENCE_KEYWORDS = [
    'REFERENCIA',
    'FOLIO',
    'REF',
    'AUTORIZACION',
    'AUTORIZACIÓN',
    'ID TRANSACCION',
  ];

  private static readonly CATEGORY_KEYWORDS = [
    'CATEGORIA',
    'CATEGORÍA',
    'CATEGORY',
    'RUBRO',
  ];

  /**
   * Limpia y normaliza un encabezado para comparación (remueve acentos, espacios extras, mayúsculas).
   */
  public static normalizeHeader(header: string): string {
    return header
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Evalúa los encabezados provistos y deduce el mapeo de columnas.
   */
  public static detectMapping(
    headers: string[],
    sampleRows?: string[][],
  ): CsvColumnMapping {
    const normalizedHeaders = headers.map((h) => this.normalizeHeader(h));

    let dateCol: string | number = -1;
    let descCol: string | number = -1;
    let amountCol: string | number = -1;
    let chargeCol: string | number = -1;
    let creditCol: string | number = -1;
    let typeCol: string | number = -1;
    let currencyCol: string | number = -1;
    let refCol: string | number = -1;
    let catCol: string | number = -1;

    const findBestMatch = (keywords: string[]): number => {
      // 1. Coincidencia exacta
      for (let i = 0; i < normalizedHeaders.length; i++) {
        const h = normalizedHeaders[i];
        for (const kw of keywords) {
          if (h === kw) return i;
        }
      }
      // 2. Coincidencia parcial (includes)
      for (let i = 0; i < normalizedHeaders.length; i++) {
        const h = normalizedHeaders[i];
        for (const kw of keywords) {
          if (h.includes(kw)) return i;
        }
      }
      return -1;
    };

    // 1. Detectar Fecha
    dateCol = findBestMatch(this.DATE_KEYWORDS);

    // 2. Detectar Concepto / Descripción
    descCol = findBestMatch(this.DESCRIPTION_KEYWORDS);

    // 3. Detectar si existen columnas separadas de Cargo y Abono
    chargeCol = findBestMatch(this.CHARGE_KEYWORDS);
    creditCol = findBestMatch(this.CREDIT_KEYWORDS);

    // 4. Si no hay columnas separadas de cargo/abono (o además hay una de importe general)
    amountCol = findBestMatch(this.AMOUNT_KEYWORDS);

    // 5. Detectar columnas opcionales
    typeCol = findBestMatch(this.TYPE_KEYWORDS);
    currencyCol = findBestMatch(this.CURRENCY_KEYWORDS);
    refCol = findBestMatch(this.REFERENCE_KEYWORDS);
    catCol = findBestMatch(this.CATEGORY_KEYWORDS);

    // 6. Inspección de filas de muestra si algún campo crítico quedó sin asociar
    if (sampleRows && sampleRows.length > 0) {
      if (dateCol === -1) {
        dateCol = this.findDateColumnFromSamples(sampleRows);
      }
      if (amountCol === -1 && chargeCol === -1 && creditCol === -1) {
        amountCol = this.findAmountColumnFromSamples(sampleRows);
      }
      if (descCol === -1) {
        descCol = this.findTextColumnFromSamples(sampleRows, [dateCol, amountCol, chargeCol, creditCol]);
      }
    }

    // Fallbacks si no se encontró por nombre (asumir posiciones estándar de banca: Col 0 Fecha, Col 1 Descripción, Col 2 Monto)
    if (dateCol === -1 && headers.length > 0) dateCol = 0;
    if (descCol === -1 && headers.length > 1) descCol = 1;
    if (amountCol === -1 && chargeCol === -1 && headers.length > 2) amountCol = 2;

    const mapping: CsvColumnMapping = {
      dateColumn: headers[dateCol as number] ?? dateCol,
      descriptionColumn: headers[descCol as number] ?? descCol,
    };

    if (amountCol !== -1) {
      mapping.amountColumn = headers[amountCol as number] ?? amountCol;
    }
    if (chargeCol !== -1) {
      mapping.chargeColumn = headers[chargeCol as number] ?? chargeCol;
    }
    if (creditCol !== -1) {
      mapping.creditColumn = headers[creditCol as number] ?? creditCol;
    }
    if (typeCol !== -1) {
      mapping.typeColumn = headers[typeCol as number] ?? typeCol;
    }
    if (currencyCol !== -1) {
      mapping.currencyColumn = headers[currencyCol as number] ?? currencyCol;
    }
    if (refCol !== -1) {
      mapping.referenceColumn = headers[refCol as number] ?? refCol;
    }
    if (catCol !== -1) {
      mapping.categoryColumn = headers[catCol as number] ?? catCol;
    }

    return mapping;
  }

  private static findDateColumnFromSamples(sampleRows: string[][]): number {
    const dateRegex = /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}\s+[A-Za-z]{3}\s*\d{2,4})\b/;
    const colCounts: Record<number, number> = {};

    for (const row of sampleRows) {
      for (let c = 0; c < row.length; c++) {
        if (dateRegex.test(row[c].trim())) {
          colCounts[c] = (colCounts[c] || 0) + 1;
        }
      }
    }

    let bestCol = -1;
    let max = 0;
    for (const [col, count] of Object.entries(colCounts)) {
      if (count > max) {
        max = count;
        bestCol = parseInt(col, 10);
      }
    }
    return bestCol;
  }

  private static findAmountColumnFromSamples(sampleRows: string[][]): number {
    const amountRegex = /^[-+]?\$?\s*(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{1,2})?$/;
    const colCounts: Record<number, number> = {};

    for (const row of sampleRows) {
      for (let c = 0; c < row.length; c++) {
        const val = row[c].trim();
        if (val.length > 0 && amountRegex.test(val) && !/^\d{4}$/.test(val)) {
          colCounts[c] = (colCounts[c] || 0) + 1;
        }
      }
    }

    let bestCol = -1;
    let max = 0;
    for (const [col, count] of Object.entries(colCounts)) {
      if (count > max) {
        max = count;
        bestCol = parseInt(col, 10);
      }
    }
    return bestCol;
  }

  private static findTextColumnFromSamples(
    sampleRows: string[][],
    excludeCols: (string | number)[],
  ): number {
    const excludes = new Set(excludeCols.map((c) => Number(c)));
    let bestCol = -1;
    let maxLength = 0;

    for (const row of sampleRows) {
      for (let c = 0; c < row.length; c++) {
        if (!excludes.has(c)) {
          const val = row[c].trim();
          if (val.length > maxLength && !/^[-+]?\$?\d+/.test(val)) {
            maxLength = val.length;
            bestCol = c;
          }
        }
      }
    }
    return bestCol;
  }
}
