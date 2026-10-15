/**
 * BudgetConsumption — Modelo de Consumo de Presupuesto (US-047)
 *
 * Representa el cálculo de cuánto del presupuesto se ha consumido por categoría
 * en un periodo mensual determinado (YYYY-MM).
 *
 * Criterios de Aceptación (AC):
 * - Gasto por categoría.
 * - Porcentaje consumido.
 * - Periodo mensual.
 * - Exclusión de transferencias y movimientos no aplicables.
 *
 * Dependencias: US-046 (Modelo de presupuestos), US-008 (Modelo canónico de transacción).
 */

export type BudgetConsumptionStatus = 'ON_TRACK' | 'WARNING' | 'OVERSPENT';

export interface CategoryBudgetConsumption {
  budgetId: string;
  categoryId: string;
  categoryName?: string;
  categoryIcon?: string | null;
  categoryColor?: string | null;
  month: string;

  /** Monto asignado al presupuesto en minor units (centavos) */
  budgetAmountMinor: number;
  /** Monto presupuestado en decimales */
  budgetAmount: number;

  /** Gasto real incurrido en el mes en minor units */
  spentMinor: number;
  /** Gasto real en decimales */
  spent: number;

  /** Remanente disponible (0 si hay sobregiro) */
  remainingMinor: number;
  remaining: number;

  /** Monto excedido en minor units si spentMinor > budgetAmountMinor */
  overspentMinor: number;
  overspent: number;

  /** Porcentaje consumido del presupuesto de la categoría (ej. 75.5, 120.0) */
  percentageUsed: number;

  /** Porcentaje del total de presupuestos del mes que representa esta categoría */
  percentageOfTotalBudget: number;

  /** Estado visual de salud del presupuesto */
  status: BudgetConsumptionStatus;

  /** Número de transacciones imputadas a esta categoría */
  transactionsCount: number;

  /** IDs de transacciones computadas */
  transactionIds: string[];

  currency: string;
}

export interface MonthlyBudgetConsumptionSummary {
  userId: string;
  month: string;
  currency: string;

  /** Presupuesto global del mes en centavos */
  totalBudgetedMinor: number;
  totalBudgeted: number;

  /** Gasto global del mes en categorías presupuestadas */
  totalSpentMinor: number;
  totalSpent: number;

  /** Remanente global disponible */
  totalRemainingMinor: number;
  totalRemaining: number;

  /** Total sobregirado acumulado en categorías en exceso */
  totalOverspentMinor: number;
  totalOverspent: number;

  /** Porcentaje consumido general sobre el total presupuestado */
  overallPercentageUsed: number;

  /** Desglose por categoría presupuestada */
  categories: CategoryBudgetConsumption[];

  /** Gastos ocurridos en el mes sin presupuesto asignado */
  unbudgetedSpentMinor: number;
  unbudgetedSpent: number;
  unbudgetedTransactionsCount: number;

  /** Métricas de estado */
  hasOverspentCategories: boolean;
  warningCategoriesCount: number;
  overspentCategoriesCount: number;
}
