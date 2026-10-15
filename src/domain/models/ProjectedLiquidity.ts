/**
 * ProjectedLiquidity — Modelo de Liquidez Proyectada (US-045)
 *
 * Criterios de Aceptación (AC):
 * - Liquid Assets + Expected Income - Credit Obligations - Committed Expenses
 * - Horizonte configurable (ej. 7, 15, 30, 60, 90 días o fecha personalizada)
 * - Cálculo determinístico (aritmética exacta en minor units/centavos, sin drift de punto flotante)
 *
 * Dependencias:
 * - US-016 (Calcular liquidez real y separación de activos líquidos de tarjetas de crédito)
 * - US-044 (Modelo de obligaciones futuras y motor de generación de ocurrencias)
 */

import type { ObligationCertainty, ObligationDirection } from './FutureObligation';

export type LiquidityHorizonPreset = 7 | 14 | 15 | 30 | 60 | 90 | 180 | 365;

export interface ProjectedLiquidityConfig {
  /** Fecha inicial de la proyección en UTC. Por defecto: hoy. */
  startDate?: Date;
  /** Horizonte en días (ej. 7, 15, 30, 60, 90). */
  horizonDays: number;
  /** Incluir también gastos estimados en la proyección conservadora (default: true). */
  includeEstimatedExpenses?: boolean;
  /** Moneda de cálculo (ISO 4217, default: 'MXN'). */
  currency?: string;
}

export interface ProjectedLiquidityEvent {
  obligationId?: string;
  name: string;
  dueDate: Date;
  direction: ObligationDirection;
  certainty: ObligationCertainty;
  amountMinor: number;
  amount: number;
  currency: string;
  accountId: string | null;
  categoryId: string | null;
}

export interface ProjectedLiquidityPoint {
  /** Fecha en formato ISO YYYY-MM-DD */
  date: string;
  timestamp: number;
  dayIndex: number;
  /** Saldo de liquidez al inicio del día en minor units */
  startingLiquidityMinor: number;
  /** Ingresos proyectados este día */
  incomesMinor: number;
  /** Obligaciones de crédito vencidas este día */
  creditObligationsMinor: number;
  /** Gastos comprometidos (fijos/firme) este día */
  committedExpensesMinor: number;
  /** Gastos estimados (probables) este día */
  estimatedExpensesMinor: number;
  /** Saldo de liquidez proyectado al cierre del día */
  projectedLiquidityMinor: number;
  /** En unidades mayores (pesos/dólares redondeado a 2 decimales) */
  projectedLiquidity: number;
  incomes: number;
  creditObligations: number;
  committedExpenses: number;
  estimatedExpenses: number;
  /** Eventos ocurridos en este día */
  events: ProjectedLiquidityEvent[];
}

export interface LiquidAssetsBreakdown {
  cash: number;
  checking: number;
  savings: number;
  digitalWallets: number;
}

export interface ProjectedLiquidityResult {
  startDate: Date;
  endDate: Date;
  horizonDays: number;
  currency: string;

  /**
   * Componentes de la fórmula canónica de AC (en minor units):
   * Liquid Assets + Expected Income - Credit Obligations - Committed Expenses
   */
  liquidAssetsMinor: number;
  expectedIncomeMinor: number;
  expectedIncomeCommittedMinor: number;
  expectedIncomeEstimatedMinor: number;

  creditObligationsMinor: number;
  committedExpensesMinor: number;
  estimatedExpensesMinor: number;
  totalExpensesMinor: number;

  /**
   * Resultado canónico de la fórmula de AC:
   * Liquid Assets + Expected Income - Credit Obligations - Committed Expenses
   */
  finalProjectedLiquidityMinor: number;
  finalProjectedLiquidity: number;

  /**
   * Liquidez proyectada conservadora (descuenta también gastos estimados):
   * finalProjectedLiquidityMinor - estimatedExpensesMinor
   */
  conservativeProjectedLiquidityMinor: number;
  conservativeProjectedLiquidity: number;

  /** Representaciones en unidades mayores (pesos con 2 decimales) */
  liquidAssets: number;
  expectedIncome: number;
  creditObligations: number;
  committedExpenses: number;
  estimatedExpenses: number;
  totalExpenses: number;

  /** Desglose de activos líquidos por tipo de cuenta */
  liquidAssetsBreakdown: LiquidAssetsBreakdown;

  /** Métricas analíticas de riesgo de liquidez (base para US-057) */
  minimumLiquidityMinor: number;
  minimumLiquidity: number;
  minimumLiquidityDate: Date | null;
  isDeficitProjected: boolean;
  daysUntilDeficit: number | null;

  /** Total de ocurrencias de obligaciones analizadas en el horizonte */
  occurrencesCount: number;

  /** Trayectoria diaria de liquidez proyectada */
  timeline: ProjectedLiquidityPoint[];
}
