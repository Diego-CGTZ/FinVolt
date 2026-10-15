/**
 * FutureObligation — Modelo de obligaciones futuras (US-044)
 *
 * Representa ingresos y gastos futuros comprometidos o esperados
 * (renta, nómina, suscripciones, préstamos, pago de tarjeta, etc.).
 * Es la base para la liquidez proyectada (US-045) y las alertas (US-056).
 *
 * Criterios de Aceptación:
 * - Modelo para obligaciones.
 * - Periodicidad.
 * - Monto.
 * - Fecha próxima.
 * - Relación con cuenta/categoría cuando aplique.
 *
 * Decisiones de diseño:
 *   - `amountMinor`: entero positivo en minor units (centavos). `direction` indica el flujo.
 *   - Fechas en UTC. `anchorDay` evita la deriva de fin de mes (31 ene -> 28 feb -> 31 mar).
 *   - `certainty` separa lo comprometido (renta, préstamo) de lo esperado (nómina probable).
 *   - `recurringTransactionId` enlaza con el patrón detectado en US-043 cuando aplica.
 */

import type { RecurringPeriodicity } from './RecurringTransaction';

/** Flujo de dinero de la obligación. */
export type ObligationDirection = 'INCOME' | 'EXPENSE';

export type ObligationType =
  | 'SALARY'
  | 'RENT'
  | 'SUBSCRIPTION'
  | 'LOAN'
  | 'UTILITY'
  | 'CREDIT_CARD_PAYMENT'
  | 'OTHER';

/** COMMITTED: obligación firme. EXPECTED: ingreso/gasto probable pero no garantizado. */
export type ObligationCertainty = 'COMMITTED' | 'EXPECTED';

/** Periodicidad: las de US-043 más ONE_TIME para obligaciones de un solo pago. */
export type ObligationPeriodicity = RecurringPeriodicity | 'ONE_TIME';

export type ObligationStatus =
  | 'ACTIVE'      // Vigente, genera ocurrencias futuras
  | 'PAUSED'      // Pausada por el usuario
  | 'COMPLETED'   // Cumplida (ONE_TIME pagada o llegó a endDate)
  | 'CANCELLED';  // Cancelada

export interface FutureObligation {
  id: string;
  userId: string;

  /** Cuenta relacionada (nullable cuando no aplica). */
  accountId: string | null;
  /** Categoría relacionada (nullable cuando no aplica). */
  categoryId: string | null;
  /** Patrón recurrente de origen (US-043), si fue derivada de uno. */
  recurringTransactionId: string | null;

  name: string;
  description: string | null;
  direction: ObligationDirection;
  obligationType: ObligationType;
  certainty: ObligationCertainty;

  /** Monto en minor units (centavos). Siempre positivo. */
  amountMinor: number;
  /** ISO 4217, 3 caracteres. */
  currency: string;

  periodicity: ObligationPeriodicity;
  /** Intervalo en días. Obligatorio solo para periodicity = 'CUSTOM'. */
  intervalDays: number | null;

  /** Fecha de la próxima ocurrencia pendiente. */
  nextDueDate: Date;
  /** Día del mes (1-31) usado para periodicidades mensuales o mayores. */
  anchorDay: number;
  /** Fecha límite opcional: después de ella no hay más ocurrencias. */
  endDate: Date | null;

  /** Última fecha en que se registró como cumplida. */
  lastFulfilledAt: Date | null;

  status: ObligationStatus;
  metadata?: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFutureObligationInput {
  id?: string;
  userId: string;
  accountId?: string | null;
  categoryId?: string | null;
  recurringTransactionId?: string | null;
  name: string;
  description?: string | null;
  direction: ObligationDirection;
  obligationType?: ObligationType;
  certainty?: ObligationCertainty;
  amountMinor: number;
  currency?: string;
  periodicity: ObligationPeriodicity;
  intervalDays?: number | null;
  nextDueDate: Date;
  endDate?: Date | null;
  status?: ObligationStatus;
  metadata?: Record<string, unknown>;
}

export type UpdateFutureObligationInput = Partial<
  Omit<FutureObligation, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
>;

/** Una ocurrencia proyectada concreta de una obligación. */
export interface ObligationOccurrence {
  obligationId: string;
  dueDate: Date;
  direction: ObligationDirection;
  amountMinor: number;
  currency: string;
  certainty: ObligationCertainty;
  accountId: string | null;
  categoryId: string | null;
}
