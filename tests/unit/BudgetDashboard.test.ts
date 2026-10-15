/**
 * BudgetDashboard.test.ts — Suite de pruebas para US-048 (Dashboard de Presupuestos)
 *
 * Criterios de Aceptación (AC):
 * - Presupuesto, consumido, restante y porcentaje.
 * - Categorías.
 * - Estados de alerta (ON_TRACK, WARNING, OVERSPENT).
 *
 * Dependencias: US-047
 */

import assert from 'node:assert/strict';
import type { Budget } from '../../src/domain/models/Budget';
import type { Transaction, TransactionType } from '../../src/domain/models/Transaction';
import { BudgetConsumptionCalculator } from '../../src/domain/services/budgets/BudgetConsumptionCalculator';
import { GetBudgetConsumptionUseCase } from '../../src/application/useCases/GetBudgetConsumptionUseCase';
import type { IBudgetRepository } from '../../src/domain/repositories/IBudgetRepository';
import type { ITransactionRepository } from '../../src/domain/repositories/ITransactionRepository';

function buildBudget(overrides: Partial<Budget> = {}): Budget {
  const amountMinor = overrides.amountMinor ?? 500000;
  return {
    id: overrides.id || `b-${Math.random().toString(36).substring(7)}`,
    userId: overrides.userId || 'user-us048',
    categoryId: overrides.categoryId || 'cat-groceries',
    month: overrides.month || '2026-10',
    amountMinor,
    amount: overrides.amount ?? (amountMinor / 100),
    percentage: overrides.percentage ?? 50.0,
    currency: overrides.currency || 'MXN',
    notes: overrides.notes || null,
    isActive: overrides.isActive ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: overrides.id || `tx-${Math.random().toString(36).substring(7)}`,
    userId: overrides.userId || 'user-us048',
    accountId: overrides.accountId || 'acc-1',
    type: overrides.type || 'EXPENSE',
    amountMinor: overrides.amountMinor ?? 100000,
    currency: overrides.currency || 'MXN',
    occurredAt: overrides.occurredAt || new Date('2026-10-15T12:00:00.000Z'),
    postedAt: overrides.postedAt || new Date('2026-10-15T12:00:00.000Z'),
    merchantRaw: overrides.merchantRaw || 'Supermercado Raw',
    merchant: overrides.merchant || 'Supermercado',
    description: overrides.description || 'Compra mensual',
    categoryId: overrides.categoryId ?? 'cat-groceries',
    source: overrides.source || 'MANUAL',
    sourceEventId: overrides.sourceEventId || null,
    status: overrides.status || 'CONFIRMED',
    confidenceScore: overrides.confidenceScore ?? 1.0,
    fingerprint: overrides.fingerprint || 'fp-1',
    linkedTransactionId: overrides.linkedTransactionId ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function runBudgetDashboardTests(): Promise<void> {
  console.log('[TEST] Iniciando pruebas de US-048: Dashboard de Presupuestos...\n');

  const userId = 'user-us048';
  const month = '2026-10';

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Métricas Globales del Dashboard (Presupuesto, Consumido, Restante, Porcentaje)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[TEST 1] Métricas globales del dashboard (Presupuesto, Consumido, Restante, Porcentaje)');
  {
    const b1 = buildBudget({ categoryId: 'cat-housing', amountMinor: 1000000 }); // $10,000.00
    const b2 = buildBudget({ categoryId: 'cat-food', amountMinor: 500000 });     // $5,000.00

    const tx1 = buildTransaction({ categoryId: 'cat-housing', amountMinor: 600000 }); // $6,000.00
    const tx2 = buildTransaction({ categoryId: 'cat-food', amountMinor: 300000 });    // $3,000.00

    const dashboard = BudgetConsumptionCalculator.calculate({
      budgets: [b1, b2],
      transactions: [tx1, tx2],
      month,
      userId,
    });

    assert.equal(dashboard.totalBudgeted, 15000.0, 'Total presupuestado debe ser $15,000.00');
    assert.equal(dashboard.totalSpent, 9000.0, 'Total consumido debe ser $9,000.00');
    assert.equal(dashboard.totalRemaining, 6000.0, 'Total restante debe ser $6,000.00');
    assert.equal(dashboard.overallPercentageUsed, 60.0, 'Porcentaje global consumido debe ser 60.0%');
    assert.equal(dashboard.totalOverspent, 0, 'No debe haber sobregiro');
    console.log('  [OK] Métricas globales consolidadas calculadas con exactitud');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Desglose por Categorías
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 2] Desglose y métricas por categoría en el Dashboard');
  {
    const bHousing = buildBudget({ categoryId: 'cat-housing', amountMinor: 800000, percentage: 80.0 });
    const bFun = buildBudget({ categoryId: 'cat-fun', amountMinor: 200000, percentage: 20.0 });

    const txHousing = buildTransaction({ categoryId: 'cat-housing', amountMinor: 400000 });

    const dashboard = BudgetConsumptionCalculator.calculate({
      budgets: [bHousing, bFun],
      transactions: [txHousing],
      month,
      userId,
    });

    assert.equal(dashboard.categories.length, 2);

    const catHousing = dashboard.categories.find((c) => c.categoryId === 'cat-housing');
    assert.ok(catHousing);
    assert.equal(catHousing.budgetAmount, 8000.0);
    assert.equal(catHousing.spent, 4000.0);
    assert.equal(catHousing.remaining, 4000.0);
    assert.equal(catHousing.percentageUsed, 50.0);
    assert.equal(catHousing.percentageOfTotalBudget, 80.0);

    const catFun = dashboard.categories.find((c) => c.categoryId === 'cat-fun');
    assert.ok(catFun);
    assert.equal(catFun.budgetAmount, 2000.0);
    assert.equal(catFun.spent, 0.0);
    assert.equal(catFun.remaining, 2000.0);
    assert.equal(catFun.percentageUsed, 0.0);
    assert.equal(catFun.percentageOfTotalBudget, 20.0);

    console.log('  [OK] Desglose individual de cada categoría verificado');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Estado de Alerta: ON_TRACK (< 80%)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 3] Estado de alerta ON_TRACK cuando el gasto es < 80%');
  {
    const budget = buildBudget({ amountMinor: 1000000 }); // $10,000.00
    const tx = buildTransaction({ amountMinor: 750000 }); // $7,500.00 (75%)

    const dashboard = BudgetConsumptionCalculator.calculate({
      budgets: [budget],
      transactions: [tx],
      month,
      userId,
    });

    assert.equal(dashboard.categories[0].status, 'ON_TRACK');
    assert.equal(dashboard.hasOverspentCategories, false);
    assert.equal(dashboard.warningCategoriesCount, 0);
    assert.equal(dashboard.overspentCategoriesCount, 0);
    console.log('  [OK] Estado ON_TRACK asignado y cero alertas activadas');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Estado de Alerta: WARNING (>= 80% y <= 100%)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 4] Estado de alerta WARNING cuando el gasto está entre 80% y 100%');
  {
    const budget = buildBudget({ amountMinor: 1000000 }); // $10,000.00
    const tx = buildTransaction({ amountMinor: 850000 }); // $8,500.00 (85%)

    const dashboard = BudgetConsumptionCalculator.calculate({
      budgets: [budget],
      transactions: [tx],
      month,
      userId,
    });

    assert.equal(dashboard.categories[0].status, 'WARNING');
    assert.equal(dashboard.categories[0].remaining, 1500.0);
    assert.equal(dashboard.categories[0].overspent, 0);
    assert.equal(dashboard.warningCategoriesCount, 1);
    assert.equal(dashboard.hasOverspentCategories, false);
    console.log('  [OK] Estado WARNING activado correctamente al rebasar el 80%');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Estado de Alerta: OVERSPENT (> 100%)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 5] Estado de alerta OVERSPENT cuando el gasto supera el 100%');
  {
    const budget = buildBudget({ amountMinor: 1000000 }); // $10,000.00
    const tx = buildTransaction({ amountMinor: 1250000 }); // $12,500.00 (125%)

    const dashboard = BudgetConsumptionCalculator.calculate({
      budgets: [budget],
      transactions: [tx],
      month,
      userId,
    });

    assert.equal(dashboard.categories[0].status, 'OVERSPENT');
    assert.equal(dashboard.categories[0].remaining, 0, 'Restante debe ser 0 en sobregiro');
    assert.equal(dashboard.categories[0].overspent, 2500.0, 'Excedente debe ser $2,500.00');
    assert.equal(dashboard.categories[0].percentageUsed, 125.0);
    assert.equal(dashboard.hasOverspentCategories, true);
    assert.equal(dashboard.overspentCategoriesCount, 1);
    console.log('  [OK] Estado OVERSPENT y monto excedido computados con precisión');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Coexistencia de Múltiples Estados de Alerta en el Dashboard
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 6] Coexistencia de ON_TRACK, WARNING y OVERSPENT simultáneamente');
  {
    const bSafe = buildBudget({ categoryId: 'cat-safe', amountMinor: 1000000 });
    const bWarn = buildBudget({ categoryId: 'cat-warn', amountMinor: 1000000 });
    const bOver = buildBudget({ categoryId: 'cat-over', amountMinor: 1000000 });

    const txSafe = buildTransaction({ categoryId: 'cat-safe', amountMinor: 200000 }); // 20%
    const txWarn = buildTransaction({ categoryId: 'cat-warn', amountMinor: 900000 }); // 90%
    const txOver = buildTransaction({ categoryId: 'cat-over', amountMinor: 1400000 }); // 140%

    const dashboard = BudgetConsumptionCalculator.calculate({
      budgets: [bSafe, bWarn, bOver],
      transactions: [txSafe, txWarn, txOver],
      month,
      userId,
    });

    assert.equal(dashboard.categories.find((c) => c.categoryId === 'cat-safe')?.status, 'ON_TRACK');
    assert.equal(dashboard.categories.find((c) => c.categoryId === 'cat-warn')?.status, 'WARNING');
    assert.equal(dashboard.categories.find((c) => c.categoryId === 'cat-over')?.status, 'OVERSPENT');

    assert.equal(dashboard.warningCategoriesCount, 1);
    assert.equal(dashboard.overspentCategoriesCount, 1);
    assert.equal(dashboard.hasOverspentCategories, true);
    assert.equal(dashboard.totalOverspent, 4000.0);
    console.log('  [OK] Dashboard reporta conteos de alerta diferenciados coherentemente');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 7: Segregación de Gastos No Presupuestados (unbudgetedSpent)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 7] Segregación de gastos en categorías sin presupuesto asignado');
  {
    const budget = buildBudget({ categoryId: 'cat-budgeted', amountMinor: 500000 });

    const txBudgeted = buildTransaction({ categoryId: 'cat-budgeted', amountMinor: 200000 });
    const txUnbudgeted1 = buildTransaction({ categoryId: 'cat-unbudgeted', amountMinor: 150000 });
    const txUnbudgeted2 = buildTransaction({ categoryId: null, amountMinor: 50000 }); // Sin categoría

    const dashboard = BudgetConsumptionCalculator.calculate({
      budgets: [budget],
      transactions: [txBudgeted, txUnbudgeted1, txUnbudgeted2],
      month,
      userId,
    });

    assert.equal(dashboard.totalSpent, 2000.0, 'Gasto presupuestado debe ser exclusivamente $2,000.00');
    assert.equal(dashboard.unbudgetedSpent, 2000.0, 'Gasto no presupuestado debe ser $1,500 + $500 = $2,000.00');
    assert.equal(dashboard.unbudgetedTransactionsCount, 2);
    console.log('  [OK] Gastos sin presupuesto asignado segregados con éxito');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 8: Aislamiento por Periodo Mensual en Dashboard
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 8] Aislamiento estricto por periodo mensual (YYYY-MM)');
  {
    const budgetOct = buildBudget({ month: '2026-10', amountMinor: 500000 });
    const budgetNov = buildBudget({ month: '2026-11', amountMinor: 600000 });

    const txOct = buildTransaction({ occurredAt: new Date('2026-10-15T12:00:00Z'), amountMinor: 200000 });
    const txNov = buildTransaction({ occurredAt: new Date('2026-11-05T12:00:00Z'), amountMinor: 300000 });

    const dashboardOct = BudgetConsumptionCalculator.calculate({
      budgets: [budgetOct, budgetNov],
      transactions: [txOct, txNov],
      month: '2026-10',
      userId,
    });

    assert.equal(dashboardOct.totalBudgeted, 5000.0);
    assert.equal(dashboardOct.totalSpent, 2000.0);
    assert.equal(dashboardOct.overallPercentageUsed, 40.0);

    const dashboardNov = BudgetConsumptionCalculator.calculate({
      budgets: [budgetOct, budgetNov],
      transactions: [txOct, txNov],
      month: '2026-11',
      userId,
    });

    assert.equal(dashboardNov.totalBudgeted, 6000.0);
    assert.equal(dashboardNov.totalSpent, 3000.0);
    assert.equal(dashboardNov.overallPercentageUsed, 50.0);
    console.log('  [OK] Selector de mes aísla correctamente presupuestos y gastos');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 9: Deducción Automática de Reembolsos en el Dashboard
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 9] Deducción de reembolsos en el consumo del dashboard');
  {
    const budget = buildBudget({ amountMinor: 500000 });

    const txExpense = buildTransaction({ amountMinor: 400000, type: 'EXPENSE', status: 'CONFIRMED' });
    const txRefund = buildTransaction({ amountMinor: 100000, type: 'EXPENSE', status: 'REFUND' });

    const dashboard = BudgetConsumptionCalculator.calculate({
      budgets: [budget],
      transactions: [txExpense, txRefund],
      month,
      userId,
    });

    assert.equal(dashboard.totalSpent, 3000.0, 'Gasto neto: 4,000 - 1,000 = $3,000.00');
    assert.equal(dashboard.totalRemaining, 2000.0);
    assert.equal(dashboard.overallPercentageUsed, 60.0);
    console.log('  [OK] Reembolsos disminuyen de forma neta el gasto de la categoría');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 10: Exclusión Estricta de Movimientos No Financieros o Transferencias
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 10] Exclusión de transferencias y transacciones rechazadas en el Dashboard');
  {
    const budget = buildBudget({ amountMinor: 500000 });

    const txTransfer = buildTransaction({ type: 'TRANSFER' as TransactionType, amountMinor: 300000 });
    const txRejected = buildTransaction({ status: 'REJECTED', amountMinor: 200000 });
    const txDuplicate = buildTransaction({ status: 'DUPLICATE', amountMinor: 100000 });

    const dashboard = BudgetConsumptionCalculator.calculate({
      budgets: [budget],
      transactions: [txTransfer, txRejected, txDuplicate],
      month,
      userId,
    });

    assert.equal(dashboard.totalSpent, 0, 'Movimientos no aplicables no deben computarse en el gasto');
    assert.equal(dashboard.totalRemaining, 5000.0);
    console.log('  [OK] Reglas de exclusión preservadas en los cálculos del dashboard');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 11: Precisión Aritmética en Minor Units (Centavos Enteros)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 11] Integridad y precisión aritmética en minor units sin deriva de flotantes');
  {
    const budget = buildBudget({ amountMinor: 100000 }); // $1,000.00
    // 3 movimientos de $333.33 (33333 centavos)
    const tx1 = buildTransaction({ amountMinor: 33333 });
    const tx2 = buildTransaction({ amountMinor: 33333 });
    const tx3 = buildTransaction({ amountMinor: 33333 });

    const dashboard = BudgetConsumptionCalculator.calculate({
      budgets: [budget],
      transactions: [tx1, tx2, tx3],
      month,
      userId,
    });

    assert.equal(dashboard.categories[0].spentMinor, 99999);
    assert.equal(dashboard.categories[0].remainingMinor, 1);
    assert.equal(dashboard.categories[0].remaining, 0.01);
    console.log('  [OK] Aritmética de centavos exacta sin problemas de float');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 12: Orquestación E2E en Caso de Uso de Consumo de Presupuestos
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 12] Orquestación integral de extremo a extremo para el Dashboard');
  {
    const b1 = buildBudget({ categoryId: 'cat-1', amountMinor: 400000, percentage: 40.0 });
    const b2 = buildBudget({ categoryId: 'cat-2', amountMinor: 600000, percentage: 60.0 });

    const tx1 = buildTransaction({ categoryId: 'cat-1', amountMinor: 360000 }); // 90% -> WARNING
    const tx2 = buildTransaction({ categoryId: 'cat-2', amountMinor: 750000 }); // 125% -> OVERSPENT

    const mockBudgetRepo: IBudgetRepository = {
      save: async () => {},
      saveMany: async () => {},
      findById: async () => b1,
      findByUserAndMonth: async () => [b1, b2],
      findByCategoryAndMonth: async () => b1,
      findAll: async () => [b1, b2],
      delete: async () => {},
      clear: async () => {},
    };

    const mockTxRepo: ITransactionRepository = {
      createTransaction: async (i) => i as any,
      getTransaction: async () => tx1,
      updateTransaction: async (id, u) => ({ ...tx1, ...u }),
      deleteTransaction: async () => {},
      listTransactions: async () => [tx1, tx2],
      findByFingerprint: async () => null,
    };

    const useCase = new GetBudgetConsumptionUseCase(mockBudgetRepo, mockTxRepo);

    const summary = await useCase.execute({ userId, month });

    assert.equal(summary.totalBudgeted, 10000.0);
    assert.equal(summary.totalSpent, 11100.0);
    assert.equal(summary.hasOverspentCategories, true);
    assert.equal(summary.warningCategoriesCount, 1);
    assert.equal(summary.overspentCategoriesCount, 1);
    assert.equal(summary.categories.length, 2);

    console.log('  [OK] Orquestación E2E del caso de uso y dashboard validada al 100%');
  }

  console.log('\n========================================');
  console.log('  [RESULTADO] Todas las pruebas de US-048 pasaron exitosamente (12/12).');
  console.log('========================================\n');
}
