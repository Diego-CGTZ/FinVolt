/**
 * US-038: Detector de Estructuras Tabulares en Estados de Cuenta Bancarios
 *
 * Criterio de Aceptación:
 * "Tablas identificables cuando sea posible"
 *
 * Detecta encabezados, filas de movimientos financieros, transacciones tabulares
 * y secciones de compras a meses sin intereses (MSI).
 */

import type {
  ExtractedPdfTable,
  ExtractedTableRow,
} from '../../interfaces/IPdfTextExtractor';

export class PdfTableDetector {
  /** Patrones de encabezados reconocibles de estados de cuenta bancarios */
  private static readonly HEADER_KEYWORDS = [
    'FECHA',
    'CONCEPTO',
    'DESCRIPCION',
    'CARGOS',
    'RETIROS',
    'ABONOS',
    'DEPOSITOS',
    'IMPORTE',
    'SALDO',
    'REFERENCIA',
    'OPERACION',
  ];

  /** Patrones de secciones de compras diferidas / MSI */
  private static readonly MSI_KEYWORDS = [
    'MESES SIN INTERESES',
    'COMPRAS DIFERIDAS',
    'PLAN DE PAGOS',
    'PROMOCIONES',
    'PAGOS FIJOS',
  ];

  /** Expresión regular para detectar fechas bancarias en diversos formatos */
  private static readonly DATE_REGEX =
    /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}(?:\s*[/]\s*|\s+)(?:ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)[a-z]*(?:(?:\s*[/]\s*|\s+)\d{2,4})?)\b/i;

  /** Expresión regular para detectar importes monetarios */
  private static readonly AMOUNT_REGEX =
    /[-+]?\$?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})\b/g;

  /**
   * Determina si una línea de texto parece ser el encabezado de una tabla bancaria.
   */
  public static isTableHeaderLine(line: string): boolean {
    const upper = line.toUpperCase();
    let matchCount = 0;
    for (const kw of this.HEADER_KEYWORDS) {
      if (upper.includes(kw)) {
        matchCount++;
      }
    }
    // Si contiene al menos 2 palabras clave típicas (ej. FECHA y CONCEPTO, o CARGOS y SALDO)
    return matchCount >= 2;
  }

  /**
   * Determina si una línea anuncia el inicio de una sección de compras a MSI / diferidas.
   */
  public static isMsiSectionHeader(line: string): boolean {
    const upper = line.toUpperCase();
    return this.MSI_KEYWORDS.some((kw) => upper.includes(kw));
  }

  /**
   * Analiza una línea de datos de movimiento y extrae sus campos estructurados.
   */
  public static parseTableRow(rawLine: string, rowNumber: number): ExtractedTableRow | null {
    const trimmed = rawLine.trim();
    if (!trimmed) return null;

    // 1. Detección de fecha
    const dateMatch = this.DATE_REGEX.exec(trimmed);
    const date = dateMatch ? dateMatch[0] : undefined;

    // 2. Detección de importes monetarios
    const amountMatches = trimmed.match(this.AMOUNT_REGEX);
    let amount: number | undefined;
    let amountMinor: number | undefined;
    let type: 'CHARGE' | 'PAYMENT' | 'BALANCE' = 'CHARGE';

    if (amountMatches && amountMatches.length > 0) {
      // Tomamos el primer importe representativo de la transacción
      const cleanAmtStr = amountMatches[0].replace(/[$,\s]/g, '');
      const parsedNum = parseFloat(cleanAmtStr);
      if (!isNaN(parsedNum)) {
        amount = Math.abs(parsedNum);
        amountMinor = Math.round(amount * 100);

        // Si tiene signo negativo explícito o palabras indicativas de abono/pago/ingreso
        const upper = trimmed.toUpperCase();
        if (
          cleanAmtStr.startsWith('-') ||
          upper.includes('ABONO') ||
          upper.includes('PAGO') ||
          upper.includes('DEPOSITO') ||
          upper.includes('NOMINA') ||
          upper.includes('RECIBID') ||
          upper.includes('DEVOLUCION') ||
          upper.includes('A FAVOR')
        ) {
          type = 'PAYMENT';
        } else {
          type = 'CHARGE';
        }
      }
    }

    // Si no contiene ni fecha ni importe monetario, no califica como fila transaccional
    if (!date && amount === undefined) {
      return null;
    }

    // 3. Extracción de descripción/concepto limpiando fechas e importes
    let description = trimmed;
    if (date) {
      description = description.replace(date, '');
    }
    if (amountMatches) {
      for (const m of amountMatches) {
        description = description.replace(m, '');
      }
    }
    description = description.replace(/\s{2,}/g, ' ').trim();

    // 4. Segmentación en celdas basadas en tabuladores o espacios múltiples
    const cells = trimmed
      .split(/\t+|\s{2,}/)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    return {
      rowNumber,
      rawLine: trimmed,
      cells: cells.length > 0 ? cells : [trimmed],
      date,
      description: description.length > 0 ? description : undefined,
      amount,
      amountMinor,
      type,
    };
  }

  /**
   * Escanea el texto completo y construye las tablas detectadas.
   */
  public static detectTables(fullText: string): ExtractedPdfTable[] {
    const lines = fullText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    const tables: ExtractedPdfTable[] = [];

    let currentTable: ExtractedPdfTable | null = null;
    let currentSectionTitle: string | undefined;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Verificación de inicio de sección de MSI
      if (this.isMsiSectionHeader(line)) {
        if (currentTable && currentTable.rows.length > 0) {
          tables.push(currentTable);
        }
        currentSectionTitle = line;
        currentTable = {
          sectionTitle: currentSectionTitle,
          headers: [],
          rows: [],
        };
        continue;
      }

      // Verificación de encabezado de tabla
      if (this.isTableHeaderLine(line)) {
        if (currentTable && currentTable.rows.length > 0) {
          tables.push(currentTable);
        }

        const headers = line
          .split(/\t+|\s{2,}|\|/)
          .map((h) => h.trim())
          .filter((h) => h.length > 0);

        currentTable = {
          sectionTitle: currentSectionTitle || 'Movimientos del Periodo',
          headers: headers.length > 0 ? headers : ['Fecha', 'Concepto', 'Importe'],
          rows: [],
        };
        continue;
      }

      // Si tenemos una tabla abierta o líneas tabulares
      const parsedRow = this.parseTableRow(line, (currentTable?.rows.length || 0) + 1);
      if (parsedRow) {
        if (!currentTable) {
          // Si encontramos filas transaccionales sin un encabezado explícito previo
          currentTable = {
            sectionTitle: currentSectionTitle || 'Transacciones Detectadas',
            headers: ['Fecha', 'Concepto', 'Importe'],
            rows: [],
          };
        }
        currentTable.rows.push(parsedRow);
      } else if (currentTable && currentTable.rows.length > 0 && line.length > 60) {
        // Fin de tabla si encontramos párrafos largos no tabulares
        // (por ejemplo, leyendas legales o avisos del banco)
        if (line.includes('CONDUSEF') || line.includes('CAT') || line.includes('Comprobante') || line.includes('Aclaraciones')) {
          tables.push(currentTable);
          currentTable = null;
          currentSectionTitle = undefined;
        }
      }
    }

    if (currentTable && currentTable.rows.length > 0) {
      tables.push(currentTable);
    }

    return tables;
  }
}
