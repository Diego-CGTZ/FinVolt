/**
 * US-040: Contratos e Interfaces para Importación de Movimientos desde CSV
 *
 * Criterios de Aceptación:
 * 1. Archivo validado (MIME, extensión, tamaño, delimitador, encoding/BOM).
 * 2. Columnas detectadas (mapeo automático inteligente de fecha, monto, concepto, tipo).
 * 3. Filas convertidas a candidates (TransactionCandidate con fingerprint y confianza).
 * 4. Deduplicación y reconciliación aplicadas (por SHA-256 de archivo y fingerprint de filas).
 *
 * INVARIANTE ARQUITECTÓNICA:
 * Ninguna fila o candidato se inserta directamente en la tabla/modelo Transaction.
 */

import type { TransactionCandidate } from '../models/TransactionCandidate';
import type { RawEvent } from '../models/RawEvent';

export interface CsvColumnMapping {
  /** Nombre o índice (0-based) de la columna de fecha */
  dateColumn?: string | number;

  /** Nombre o índice (0-based) de la columna de concepto o descripción */
  descriptionColumn?: string | number;

  /** Nombre o índice de columna única de monto con signo (+/-) */
  amountColumn?: string | number;

  /** Nombre o índice de columna específica para cargos/retiros (débito) */
  chargeColumn?: string | number;

  /** Nombre o índice de columna específica para abonos/depósitos (crédito) */
  creditColumn?: string | number;

  /** Nombre o índice de columna de tipo explícito (CARGO/ABONO, GASTO/INGRESO) */
  typeColumn?: string | number;

  /** Nombre o índice de columna de moneda (MXN, USD, etc.) */
  currencyColumn?: string | number;

  /** Nombre o índice de columna de referencia, folio o número de autorización */
  referenceColumn?: string | number;

  /** Nombre o índice de categoría sugerida */
  categoryColumn?: string | number;
}

export interface CsvParseOptions {
  /** Delimitador de columnas (por defecto detectado automáticamente: , ; \t |) */
  delimiter?: string;

  /** Si la primera fila corresponde a los encabezados (por defecto true) */
  hasHeader?: boolean;

  /** Mapeo manual o parcial de columnas para sobrescribir la detección automática */
  mapping?: Partial<CsvColumnMapping>;

  /** Moneda por defecto si no viene especificada (por defecto 'MXN') */
  defaultCurrency?: string;

  /** Nombre de la institución bancaria o proveedor si se conoce */
  bankHint?: string;

  /** Si debe omitir filas vacías o no transaccionales (por defecto true) */
  skipEmptyRows?: boolean;
}

export interface CsvParseResult {
  /** Candidatos válidos generados a partir de las filas */
  candidates: TransactionCandidate[];

  /** Cantidad de filas que resultaron duplicadas */
  duplicatesCount: number;

  /** Cantidad de filas que se reconciliaron con transacciones/candidatos previos */
  reconciledCount: number;

  /** Total de filas encontradas en el archivo */
  totalRows: number;

  /** Filas procesadas exitosamente */
  validRows: number;

  /** Filas omitidas por falta de datos esenciales o formato no válido */
  invalidRows: number;

  /** Mapeo final utilizado (detectado o provisto) */
  detectedMapping: CsvColumnMapping;

  /** Delimitador efectivo utilizado */
  delimiterUsed: string;

  /** Identificador del RawEvent de origen asociado */
  rawEventId?: string;

  /** Metadatos de la importación */
  metadata?: Record<string, unknown>;
}

export interface ICsvStatementParser {
  /**
   * Parsea el contenido en texto plano del CSV y produce la lista estructurada de candidatos.
   */
  parse(
    rawCsvText: string,
    rawEvent: RawEvent,
    options?: CsvParseOptions,
    userId?: string,
  ): Promise<CsvParseResult>;
}
