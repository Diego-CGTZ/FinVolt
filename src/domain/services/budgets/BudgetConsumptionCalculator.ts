/**
 * BudgetConsumptionCalculator — Motor de Cálculo de Consumo de Presupuesto (US-047)
 *
 * Implementa estrictamente los Criterios de Aceptación (AC):
 * - Gasto por categoría en unidades menores (centavos enteros).
 * - Porcentaje consumido relativo al presupuesto de cada categoría y total.
 * - Filtro estricto por periodo mensual (YYYY-MM).
 * - Exclusión estricta de transferencias (TRANSFER) y movimientos no aplicables
 *   (INCOME, estados no efectivos como CANDIDATE, MATCHED, DUPLICATE, REJECTED).
 * - Deducción correcta de devoluciones / reembolsos (REFUND).
 */

import type { Transaction } from '../../models/Transaction';
import type { Budget } from '../../models/Budget';
import type { Category } from '../../models/Category';
import type {
  CategoryBudgetConsumption,
  MonthlyBudgetConsumptionSummary,
  BudgetConsumptionStatus,
} from '../../models/BudgetConsumption';
import { FinancialStateMachine } from '../lifecycle/FinancialStateMachine';

export interface CalculateBudgetConsumptionParams {
  budgets: Budget[];
  transactions: Transaction[];
  month: string;
  userId?: string;
  categories?: Record<string, Category>;
}

export class BudgetConsumptionCalculator {
  /**
   * Determina si la fecha de una transacción pertenece al mes objetivo (YYYY-MM en UTC)
   */
  public static isTransactionInMonth(occurredAt: Date | string, targetMonth: string): boolean {
    const d = new Date(occurredAt);
    if (isNaN(d.getTime())) return false;
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}` === targetMonth;
  }

  /**
   * Determina si una transacción es aplicable para consumo de presupuestos de gasto.
   * Reglas de US-047:
   * 1. Debe tener estado financiero efectivo (CONFIRMED, PENDING, POSTED, REFUND).
   * 2. Exclusión estricta de TRANSFER (transferencias entre cuentas propias no consumen presupuesto).
   * 3. Exclusión de INCOME (los ingresos no consumen presupuesto de gastos).
   */
  public static isApplicableExpense(tx: Transaction): boolean {
    // Excluir estados no efectivos
    if (!FinancialStateMachine.isEffective(tx.status)) {
      return false;
    }

    // Exclusión estricta de transferencias e ingresos
    if (tx.type === 'TRANSFER' || tx.type === 'INCOME') {
      return false;
    }

    // Aplican gastos y reembolsos
    return tx.type === 'EXPENSE' || tx.status === 'REFUND';
  }


  /**
   * Calcula el consumo de presupuestos por categoría y consolidado para un mes
   */
  public static calculate(
    params: CalculateBudgetConsumptionParams
  ): MonthlyBudgetConsumptionSummary {
    const { budgets, transactions, month, userId = 'user-default', categories = {} } = params;

    // Filtrar presupuestos activos pertenecientes al mes evaluado
    const monthBudgets = budgets.filter((b) => b.month === month && b.isActive);

    // Mapa rápido de presupuesto por categoría
    const budgetsByCategory: Record<string, Budget> = {};
    for (const b of monthBudgets) {
      budgetsByCategory[b.categoryId] = b;
    }

    // Agrupadores de gasto por categoría
    const spentMinorByCategory: Record<string, number> = {};
    const txIdsByCategory: Record<string, string[]> = {};
    for (const b of monthBudgets) {
      spentMinorByCategory[b.categoryId] = 0;
      txIdsByCategory[b.categoryId] = [];
    }

    let unbudgetedSpentMinor = 0;
    let unbudgetedTransactionsCount = 0;

    // Procesar transacciones
    for (const tx of transactions) {
      // 1. Verificar mes calendario
      if (!this.isTransactionInMonth(tx.occurredAt, month)) {
        continue;
      }

      // 2. Verificar aplicabilidad (exclusión de transfers e ingresos)
      if (!this.isApplicableExpense(tx)) {
        continue;
      }

      const txAmountMinor = Math.round(Number(tx.amountMinor));
      const signedDeltaMinor = tx.status === 'REFUND' ? -txAmountMinor : txAmountMinor;


      // 3. Atribución a categoría
      if (tx.categoryId && budgetsByCategory[tx.categoryId]) {
        spentMinorByCategory[tx.categoryId] =
          (spentMinorByCategory[tx.categoryId] || 0) + signedDeltaMinor;
        txIdsByCategory[tx.categoryId].push(tx.id);
      } else {
        // Gasto no presupuestado
        unbudgetedSpentMinor += signedDeltaMinor;
        unbudgetedTransactionsCount++;
      }
    }

    // Construir desglose por categoría
    const categoryConsumptions: CategoryBudgetConsumption[] = [];
    let totalBudgetedMinor = 0;
    let totalSpentMinor = 0;
    let totalRemainingMinor = 0;
    let totalOverspentMinor = 0;

    for (const b of monthBudgets) {
      totalBudgetedMinor += b.amountMinor;

      // El gasto neto no puede ser negativo
      const rawSpent = spentMinorByCategory[b.categoryId] || 0;
      const spentMinor = Math.max(0, rawSpent);
      totalSpentMinor += spentMinor;

      const remainingMinor = Math.max(0, b.amountMinor - spentMinor);
      const overspentMinor = Math.max(0, spentMinor - b.amountMinor);

      totalRemainingMinor += remainingMinor;
      totalOverspentMinor += overspentMinor;

      const percentageUsed =
        b.amountMinor > 0
          ? Number(((spentMinor / b.amountMinor) * 100).toFixed(2))
          : 0;

      let status: BudgetConsumptionStatus = 'ON_TRACK';
      if (percentageUsed > 100) {
        status = 'OVERSPENT';
      } else if (percentageUsed >= 80) {
        status = 'WARNING';
      }

      const categoryMeta = categories[b.categoryId];

      categoryConsumptions.push({
        budgetId: b.id,
        categoryId: b.categoryId,
        categoryName: categoryMeta?.name || 'Categoría',
        categoryIcon: categoryMeta?.icon || null,
        categoryColor: categoryMeta?.color || null,
        month: b.month,
        budgetAmountMinor: b.amountMinor,
        budgetAmount: Number((b.amountMinor / 100).toFixed(2)),
        spentMinor,
        spent: Number((spentMinor / 100).toFixed(2)),
        remainingMinor,
        remaining: Number((remainingMinor / 100).toFixed(2)),
        overspentMinor,
        overspent: Number((overspentMinor / 100).toFixed(2)),
        percentageUsed,
        percentageOfTotalBudget: b.percentage,
        status,
        transactionsCount: (txIdsByCategory[b.categoryId] || []).length,
        transactionIds: txIdsByCategory[b.categoryId] || [],
        currency: b.currency,
      });
    }

    // Ordenar de mayor consumo a menor
    categoryConsumptions.sort((a, b) => b.percentageUsed - a.percentageUsed);

    const overallPercentageUsed =
      totalBudgetedMinor > 0
        ? Number(((totalSpentMinor / totalBudgetedMinor) * 100).toFixed(2))
        : 0;

    const currency = monthBudgets.length > 0 ? monthBudgets[0].currency : 'MXN';

    const warningCategoriesCount = categoryConsumptions.filter(
      (c) => c.status === 'WARNING'
    ).length;
    const overspentCategoriesCount = categoryConsumptions.filter(
      (c) => c.status === 'OVERSPENT'
    ).length;

    return {
      userId,
      month,
      currency,
      totalBudgetedMinor,
      totalBudgeted: Number((totalBudgetedMinor / 100).toFixed(2)),
      totalSpentMinor,
      totalSpent: Number((totalSpentMinor / 100).toFixed(2)),
      totalRemainingMinor,
      totalRemaining: Number((totalRemainingMinor / 100).toFixed(2)),
      totalOverspentMinor,
      totalOverspent: Number((totalOverspentMinor / 100).toFixed(2)),
      overallPercentageUsed,
      categories: categoryConsumptions,
      unbudgetedSpentMinor: Math.max(0, unbudgetedSpentMinor),
      unbudgetedSpent: Number((Math.max(0, unbudgetedSpentMinor) / 100).toFixed(2)),
      unbudgetedTransactionsCount,
      hasOverspentCategories: overspentCategoriesCount > 0,
      warningCategoriesCount,
      overspentCategoriesCount,
    };
  }
}
