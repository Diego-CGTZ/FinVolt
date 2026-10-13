/**
 * RecurringTransaction — Modelo de Dominio para Operaciones Recurrentes (US-043)
 *
 * Representa patrones de operaciones financieras periódicas detectadas
 * por el motor de inteligencia de FinVolt (salarios, rentas, suscripciones,
 * préstamos, servicios, etc.).
 *
 * Criterios de Aceptación:
 * - Detecta salario, renta, suscripciones, préstamos y otros patrones.
 * - Periodicidad y confianza almacenadas.
 */

import type { TransactionType } from './Transaction';

export type RecurringPatternType =
  | 'SALARY'        // Salario / Nómina / Sueldo
  | 'RENT'          // Renta / Alquiler / Arrendamiento
  | 'SUBSCRIPTION'  // Suscripciones digitales o servicios recurrentes (Netflix, Spotify, etc.)
  | 'LOAN'          // Préstamos, hipotecas, pagos a crédito, financiamientos
  | 'UTILITY'       // Servicios públicos o recurrentes (Luz, CFE, Agua, Internet, Telefonía)
  | 'OTHER';        // Otros patrones recurrentes detectados por periodicidad

export type RecurringPeriodicity =
  | 'WEEKLY'        // Semanal (~7 días)
  | 'BIWEEKLY'      // Catorcenal / Bisemanal (~14 días)
  | 'SEMIMONTHLY'   // Quincenal (~15 días, o días 15 y fin de mes)
  | 'MONTHLY'       // Mensual (~30 días o mismo día cada mes)
  | 'BIMONTHLY'     // Bimestral (~60 días)
  | 'QUARTERLY'     // Trimestral (~90 días)
  | 'ANNUAL'        // Anual (~365 días)
  | 'CUSTOM';       // Intervalo personalizado consistente

export type RecurringStatus =
  | 'DETECTED'      // Detectado automáticamente por el motor de análisis
  | 'CONFIRMED'     // Confirmado y verificado por el usuario
  | 'PAUSED'        // Temporalmente pausado por el usuario
  | 'DISMISSED';    // Rechazado o descartado por el usuario

export interface RecurringTransaction {
  id: string;
  userId: string;
  accountId?: string | null;

  /** Nombre descriptivo legible (ej. "Nómina Quincenal", "Renta", "Netflix") */
  name: string;

  /** Tipo de patrón financiero identificado */
  patternType: RecurringPatternType;

  /** Flujo contable del movimiento */
  transactionType: TransactionType;

  /** Comercio normalizado si aplica */
  merchant: string | null;

  /** Comercio en bruto original */
  merchantRaw: string | null;

  /** Descripción representativa */
  description: string | null;

  /** Periodicidad detectada */
  periodicity: RecurringPeriodicity;

  /** Intervalo promedio detectado en días entre operaciones */
  intervalDays: number;

  /** Tolerancia en días para desfases de fin de semana o días festivos */
  toleranceDays: number;

  /** Monto promedio en centavos (minor units) */
  averageAmountMinor: number;

  /** Último monto registrado en centavos (minor units) */
  lastAmountMinor: number;

  /** Moneda en formato ISO 4217 (ej. 'MXN') */
  currency: string;

  /** Indica si los importes presentan variaciones (ej. recibo de luz variable) */
  isVariableAmount: boolean;

  /** Puntuación de confianza (0 - 100) basada en periodicidad, montos y semántica */
  confidenceScore: number;

  /** Fecha de la primera transacción registrada en la serie recurrente */
  firstOccurrence: Date;

  /** Fecha de la última transacción observada */
  lastOccurrence: Date;

  /** Fecha estimada de la próxima ocurrencia proyectada */
  nextExpectedOccurrence: Date;

  /** Cantidad total de transacciones que forman parte de la serie recurrente */
  occurrenceCount: number;

  /** IDs de las transacciones asociadas que componen esta recurrencia */
  transactionIds: string[];

  /** Estado actual de la recurrencia */
  status: RecurringStatus;

  /** Metadatos opcionales adicionales (ej. tags, reglas detectadas) */
  metadata?: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRecurringTransactionInput {
  id?: string;
  userId: string;
  accountId?: string | null;
  name: string;
  patternType: RecurringPatternType;
  transactionType: TransactionType;
  merchant?: string | null;
  merchantRaw?: string | null;
  description?: string | null;
  periodicity: RecurringPeriodicity;
  intervalDays: number;
  toleranceDays?: number;
  averageAmountMinor: number;
  lastAmountMinor: number;
  currency: string;
  isVariableAmount?: boolean;
  confidenceScore: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  nextExpectedOccurrence: Date;
  occurrenceCount: number;
  transactionIds: string[];
  status?: RecurringStatus;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}
