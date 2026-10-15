/**
 * Budget — Modelo de Presupuestos (US-046)
 *
 * Criterios de Aceptación (AC):
 * - Presupuesto mensual por categoría.
 * - Categoría asignada.
 * - Monto (en minor units y decimal).
 * - Porcentaje asignado (0-100%).
 * - Suma de porcentajes ≤ 100% para el periodo mensual.
 * - Usuario aislado por RLS.
 *
 * Dependencias: US-007 (Modelo de categorías).
 */

export interface Budget {
  id: string;
  userId: string;
  /** Categoría financiera asociada (US-007) */
  categoryId: string;
  /** Periodo mensual en formato YYYY-MM (ej. "2026-10") */
  month: string;
  /** Monto presupuestado en unidades menores (centavos) */
  amountMinor: number;
  /** Monto en unidades mayores (pesos con 2 decimales) */
  amount: number;
  /** Porcentaje del presupuesto total (0 a 100) */
  percentage: number;
  /** Moneda en formato ISO 4217 (default 'MXN') */
  currency: string;
  /** Notas u observaciones opcionales */
  notes: string | null;
  /** Estado del presupuesto */
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBudgetInput {
  id?: string;
  userId: string;
  categoryId: string;
  month: string;
  amountMinor: number;
  percentage: number;
  currency?: string;
  notes?: string | null;
}

export interface UpdateBudgetInput {
  id: string;
  amountMinor?: number;
  percentage?: number;
  notes?: string | null;
  isActive?: boolean;
}

export interface BudgetMonthlySummary {
  userId: string;
  month: string;
  budgets: Budget[];
  totalBudgetedMinor: number;
  totalBudgeted: number;
  totalPercentage: number;
  remainingPercentage: number;
  isFullyAllocated: boolean;
  currency: string;
}

export class BudgetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetValidationError';
  }
}

export class BudgetPercentageOverflowError extends BudgetValidationError {
  public readonly attemptedTotal: number;
  public readonly maxAllowed: number;

  constructor(attemptedTotal: number, maxAllowed = 100) {
    super(
      `La suma de porcentajes de presupuesto excede el límite permitido. Intento: ${attemptedTotal.toFixed(
        2
      )}%, Máximo: ${maxAllowed.toFixed(2)}%`
    );
    this.name = 'BudgetPercentageOverflowError';
    this.attemptedTotal = attemptedTotal;
    this.maxAllowed = maxAllowed;
  }
}
