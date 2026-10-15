/**
 * BudgetConsumption.test.ts — Suite de pruebas para US-047 (Consumo de Presupuesto)
 *
 * Criterios de Aceptación (AC):
 * - Gasto por categoría.
 * - Porcentaje consumido.
 * - Periodo mensual.
 * - Exclusión de transfers y movimientos no aplicables.
 *
 * Dependencias: US-046, US-008
 */

import assert from 'node:assert/strict';
import type { Budget } from '../../src/domain/models/Budget';
import type { Transaction, TransactionType, TransactionStatus } from '../../src/domain/models/Transaction';
import { BudgetConsumptionCalculator } from '../../src/domain/services/budgets/BudgetConsumptionCalculator';
import { GetBudgetConsumptionUseCase } from '../../src/application/useCases/GetBudgetConsumptionUseCase';
import type { IBudgetRepository } from '../../src/domain/repositories/IBudgetRepository';
import type { ITransactionRepository } from '../../src/domain/repositories/ITransactionRepository';

function buildBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: overrides.id || `b-${Math.random().toString(36).substring(7)}`,
    userId: overrides.userId || 'user-us047',
    categoryId: overrides.categoryId || 'cat-groceries',
    month: overrides.month || '2026-10',
    amountMinor: overrides.amountMinor ?? 500000, // $5,000.00
    amount: overrides.amount ?? ((overrides.amountMinor ?? 500000) / 100),
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
    userId: overrides.userId || 'user-us047',
    accountId: overrides.accountId || 'acc-1',
    type: overrides.type || 'EXPENSE',
    amountMinor: overrides.amountMinor ?? 100000, // $1,000.00
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

export async function runBudgetConsumptionTests(): Promise<void> {
  console.log('[TEST] Iniciando pruebas de US-047: Consumo de Presupuesto...\n');

  const userId = 'user-us047';
  const month = '2026-10';

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Gasto por Categoría y Porcentaje Consumido Estándar
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[TEST 1] Gasto por categoría y cálculo de porcentaje consumido');
  {
    const budget = buildBudget({
      categoryId: 'cat-groceries',
      month: '2026-10',
      amountMinor: 500000, // $5,000.00
      percentage: 50.0,
    });

    const tx = buildTransaction({
      categoryId: 'cat-groceries',
      amountMinor: 250000, // $2,500.00
      type: 'EXPENSE',
      occurredAt: new Date('2026-10-12T10:00:00.000Z'),
    });

    const res = BudgetConsumptionCalculator.calculate({
      budgets: [budget],
      transactions: [tx],
      month: '2026-10',
      userId,
    });

    assert.equal(res.categories.length, 1);
    const catRes = res.categories[0];
    assert.equal(catRes.spentMinor, 250000);
    assert.equal(catRes.spent, 2500.0);
    assert.equal(catRes.remainingMinor, 250000);
    assert.equal(catRes.remaining, 2500.0);
    assert.equal(catRes.overspentMinor, 0);
    assert.equal(catRes.percentageUsed, 50.0);
    assert.equal(catRes.status, 'ON_TRACK');
    console.log('  [OK] Gasto, remanente y porcentaje consumido (50.0%) calculados exactamente');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Exclusión Estricta de Transferencias (TRANSFER)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 2] Exclusión estricta de transferencias (TRANSFER)');
  {
    const budget = buildBudget({
      categoryId: 'cat-savings',
      amountMinor: 1000000, // $10,000.00
    });

    // Transferencia entre cuentas propias con categoryId asignado
    const transferTx = buildTransaction({
      categoryId: 'cat-savings',
      amountMinor: 800000, // $8,000.00
      type: 'TRANSFER' as TransactionType,
      occurredAt: new Date('2026-10-15T12:00:00.000Z'),
    });

    const res = BudgetConsumptionCalculator.calculate({
      budgets: [budget],
      transactions: [transferTx],
      month,
      userId,
    });

    const catRes = res.categories[0];
    assert.equal(catRes.spentMinor, 0, 'La transferencia NO debe sumar gasto al presupuesto');
    assert.equal(catRes.spent, 0);
    assert.equal(catRes.percentageUsed, 0);
    assert.equal(catRes.remaining, 10000.0);
    console.log('  [OK] Regla de exclusión: Las transferencias nunca consumen presupuesto');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Exclusión Estricta de Ingresos (INCOME)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 3] Exclusión estricta de ingresos (INCOME)');
  {
    const budget = buildBudget({
      categoryId: 'cat-work',
      amountMinor: 200000,
    });

    const incomeTx = buildTransaction({
      categoryId: 'cat-work',
      amountMinor: 5000000, // $50,000.00
      type: 'INCOME' as TransactionType,
      occurredAt: new Date('2026-10-15T12:00:00.000Z'),
    });

    const res = BudgetConsumptionCalculator.calculate({
      budgets: [budget],
      transactions: [incomeTx],
      month,
      userId,
    });

    const catRes = res.categories[0];
    assert.equal(catRes.spentMinor, 0, 'Los ingresos NO deben computarse como gasto de presupuesto');
    console.log('  [OK] Regla de exclusión: Los ingresos no afectan el presupuesto de gastos');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Manejo de Reembolsos y Devoluciones (REFUND)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 4] Manejo de devoluciones/reembolsos (REFUND)');
  {
    const budget = buildBudget({
      categoryId: 'cat-clothes',
      amountMinor: 300000, // $3,000.00
    });

    // Compra de $1,000
    const expenseTx = buildTransaction({
      categoryId: 'cat-clothes',
      amountMinor: 100000,
      type: 'EXPENSE',
      occurredAt: new Date('2026-10-05T12:00:00.000Z'),
    });

    // Devolución de $200
    const refundTx = buildTransaction({
      categoryId: 'cat-clothes',
      amountMinor: 20000,
      type: 'EXPENSE',
      status: 'REFUND',
      occurredAt: new Date('2026-10-08T12:00:00.000Z'),
    });

    const res = BudgetConsumptionCalculator.calculate({
      budgets: [budget],
      transactions: [expenseTx, refundTx],
      month,
      userId,
    });

    const catRes = res.categories[0];
    assert.equal(catRes.spentMinor, 80000, 'Gasto neto: 1,000 - 200 = $800.00');
    assert.equal(catRes.spent, 800.0);
    assert.equal(catRes.remaining, 2200.0);
    console.log('  [OK] Los reembolsos disminuyen correctamente el gasto neto de la categoría');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Filtro Estricto por Periodo Mensual (YYYY-MM)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 5] Filtro por periodo mensual estricto (YYYY-MM)');
  {
    const budget = buildBudget({
      categoryId: 'cat-general',
      amountMinor: 200000, // $2,000.00
      month: '2026-10',
    });

    // Movimiento en mes previo (Sep 30)
    const prevMonthTx = buildTransaction({
      categoryId: 'cat-general',
      amountMinor: 50000,
      occurredAt: new Date('2026-09-30T23:59:59.000Z'),
    });

    // Movimiento en mes actual (Oct 10)
    const currentMonthTx = buildTransaction({
      categoryId: 'cat-general',
      amountMinor: 80000,
      occurredAt: new Date('2026-10-10T12:00:00.000Z'),
    });

    // Movimiento en mes siguiente (Nov 01)
    const nextMonthTx = buildTransaction({
      categoryId: 'cat-general',
      amountMinor: 40000,
      occurredAt: new Date('2026-11-01T00:00:01.000Z'),
    });

    const res = BudgetConsumptionCalculator.calculate({
      budgets: [budget],
      transactions: [prevMonthTx, currentMonthTx, nextMonthTx],
      month: '2026-10',
      userId,
    });

    const catRes = res.categories[0];
    assert.equal(catRes.spentMinor, 80000, 'Solo la transacción de Octubre debe ser contabilizada');
    assert.equal(catRes.spent, 800.0);
    console.log('  [OK] Transacciones fuera del mes calendario ignoradas correctamente');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Detección de Sobregiro y Métrica Overspent (OVERSPENT)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 6] Detección de sobregiro y métrica overspent (status: OVERSPENT)');
  {
    const budget = buildBudget({
      categoryId: 'cat-entertainment',
      amountMinor: 100000, // $1,000.00
    });

    const tx = buildTransaction({
      categoryId: 'cat-entertainment',
      amountMinor: 130000, // $1,300.00 (Exceso de $300)
    });

    const res = BudgetConsumptionCalculator.calculate({
      budgets: [budget],
      transactions: [tx],
      month,
      userId,
    });

    const catRes = res.categories[0];
    assert.equal(catRes.spent, 1300.0);
    assert.equal(catRes.percentageUsed, 130.0);
    assert.equal(catRes.remaining, 0.0);
    assert.equal(catRes.overspentMinor, 30000);
    assert.equal(catRes.overspent, 300.0);
    assert.equal(catRes.status, 'OVERSPENT');
    assert.equal(res.hasOverspentCategories, true);
    assert.equal(res.totalOverspent, 300.0);
    console.log('  [OK] Sobregiro (+30.0%, status OVERSPENT, overspent $300.00) reportado fielmente');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 7: Umbral de Advertencia al Acercarse al Límite (WARNING >= 80%)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 7] Umbral de advertencia al acercarse al límite (status: WARNING)');
  {
    const budget = buildBudget({
      categoryId: 'cat-fuel',
      amountMinor: 200000, // $2,000.00
    });

    const tx = buildTransaction({
      categoryId: 'cat-fuel',
      amountMinor: 170000, // $1,700.00 = 85.0%
    });

    const res = BudgetConsumptionCalculator.calculate({
      budgets: [budget],
      transactions: [tx],
      month,
      userId,
    });

    const catRes = res.categories[0];
    assert.equal(catRes.percentageUsed, 85.0);
    assert.equal(catRes.status, 'WARNING');
    assert.equal(catRes.remaining, 300.0);
    assert.equal(res.warningCategoriesCount, 1);
    console.log('  [OK] Estado WARNING activado al superar el 80% del presupuesto sin rebasarlo');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 8: Gastos No Presupuestados (Unbudgeted Spent)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 8] Gastos no presupuestados (unbudgetedSpent)');
  {
    const budget = buildBudget({
      categoryId: 'cat-budgeted',
      amountMinor: 500000,
    });

    // Gasto en categoría sin presupuesto en el mes
    const unbudgetedTx = buildTransaction({
      categoryId: 'cat-other-unbudgeted',
      amountMinor: 65000, // $650.00
    });

    const res = BudgetConsumptionCalculator.calculate({
      budgets: [budget],
      transactions: [unbudgetedTx],
      month,
      userId,
    });

    assert.equal(res.unbudgetedSpentMinor, 65000);
    assert.equal(res.unbudgetedSpent, 650.0);
    assert.equal(res.unbudgetedTransactionsCount, 1);
    console.log('  [OK] Movimientos de categorías no presupuestadas segregados con precisión');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 9: Exclusión de Estados de Transacción No Efectivos
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 9] Exclusión de estados de transacción no efectivos');
  {
    const budget = buildBudget({
      categoryId: 'cat-test',
      amountMinor: 500000,
    });

    const candidateTx = buildTransaction({
      categoryId: 'cat-test',
      amountMinor: 100000,
      status: 'CANDIDATE' as TransactionStatus,
    });
    const duplicateTx = buildTransaction({
      categoryId: 'cat-test',
      amountMinor: 200000,
      status: 'DUPLICATE' as TransactionStatus,
    });
    const rejectedTx = buildTransaction({
      categoryId: 'cat-test',
      amountMinor: 300000,
      status: 'REJECTED' as TransactionStatus,
    });

    const res = BudgetConsumptionCalculator.calculate({
      budgets: [budget],
      transactions: [candidateTx, duplicateTx, rejectedTx],
      month,
      userId,
    });

    const catRes = res.categories[0];
    assert.equal(catRes.spentMinor, 0, 'CANDIDATE, DUPLICATE y REJECTED deben ser ignorados');
    assert.equal(catRes.transactionsCount, 0);
    console.log('  [OK] Invariante de ciclo de vida financiero respetada (solo estados efectivos)');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 10: Precisión Aritmética en Centavos (Minor Units) sin Deriva Flotante
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 10] Precisión aritmética en minor units sin deriva flotante');
  {
    const budget = buildBudget({
      categoryId: 'cat-micro',
      amountMinor: 20000, // $200.00
    });

    // 10 microgastos de $12.34 cada uno
    const microTxs: Transaction[] = [];
    for (let i = 0; i < 10; i++) {
      microTxs.push(
        buildTransaction({
          categoryId: 'cat-micro',
          amountMinor: 1234, // $12.34
        })
      );
    }

    const res = BudgetConsumptionCalculator.calculate({
      budgets: [budget],
      transactions: microTxs,
      month,
      userId,
    });

    const catRes = res.categories[0];
    assert.equal(catRes.spentMinor, 12340);
    assert.equal(catRes.spent, 123.4);
    assert.equal(catRes.remainingMinor, 20000 - 12340); // 7660
    assert.equal(catRes.remaining, 76.6);
    console.log('  [OK] Sumas repetidas en centavos sin residuo de 0.1 + 0.2');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 11: Múltiples Categorías y Cálculo Global Consolidado
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 11] Múltiples categorías y consolidación global');
  {
    const bRent = buildBudget({
      id: 'b-rent',
      categoryId: 'cat-rent',
      amountMinor: 800000, // $8,000.00
      percentage: 50.0,
    });
    const bFood = buildBudget({
      id: 'b-food',
      categoryId: 'cat-food',
      amountMinor: 400000, // $4,000.00
      percentage: 25.0,
    });
    const bFun = buildBudget({
      id: 'b-fun',
      categoryId: 'cat-fun',
      amountMinor: 200000, // $2,000.00
      percentage: 12.5,
    });

    const txRent = buildTransaction({
      categoryId: 'cat-rent',
      amountMinor: 800000, // 100% de renta
    });
    const txFood = buildTransaction({
      categoryId: 'cat-food',
      amountMinor: 200000, // 50% de comida
    });
    const txFun = buildTransaction({
      categoryId: 'cat-fun',
      amountMinor: 300000, // 150% de ocio (sobregiro de $1,000)
    });

    const res = BudgetConsumptionCalculator.calculate({
      budgets: [bRent, bFood, bFun],
      transactions: [txRent, txFood, txFun],
      month,
      userId,
    });

    assert.equal(res.totalBudgeted, 14000.0);
    assert.equal(res.totalSpent, 13000.0);
    assert.equal(res.totalRemaining, 2000.0); // Restante en Food ($2,000)
    assert.equal(res.totalOverspent, 1000.0); // Sobregiro en Fun ($1,000)
    assert.equal(res.hasOverspentCategories, true);
    assert.equal(res.overspentCategoriesCount, 1);
    console.log('  [OK] Agregados globales y detección cruzada de sobregiros consistentes');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 12: Orquestación de Extremo a Extremo en GetBudgetConsumptionUseCase
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 12] Orquestación E2E en GetBudgetConsumptionUseCase');
  {
    const budget = buildBudget({
      categoryId: 'cat-1',
      month: '2026-10',
      amountMinor: 500000,
    });
    const tx = buildTransaction({
      categoryId: 'cat-1',
      amountMinor: 200000,
    });

    const mockBudgetRepo: IBudgetRepository = {
      save: async () => {},
      saveMany: async () => {},
      findById: async () => budget,
      findByUserAndMonth: async () => [budget],
      findByCategoryAndMonth: async () => budget,
      findAll: async () => [budget],
      delete: async () => {},
      clear: async () => {},
    };

    const mockTxRepo: ITransactionRepository = {
      createTransaction: async (i) => i as any,
      getTransaction: async () => tx,
      updateTransaction: async (id, u) => ({ ...tx, ...u }),
      deleteTransaction: async () => {},
      listTransactions: async () => [tx],
      findByFingerprint: async () => null,
    };

    const useCase = new GetBudgetConsumptionUseCase(mockBudgetRepo, mockTxRepo);

    // 1. Asíncrono con repositorios
    const asyncSummary = await useCase.execute({
      userId,
      month: '2026-10',
    });
    assert.equal(asyncSummary.categories.length, 1);
    assert.equal(asyncSummary.totalSpent, 2000.0);
    assert.equal(asyncSummary.overallPercentageUsed, 40.0);

    // 2. Sincrónico en memoria
    const syncSummary = useCase.executeSync({
      userId,
      month: '2026-10',
      budgets: [budget],
      transactions: [tx],
    });
    assert.equal(syncSummary.totalSpent, 2000.0);
    assert.equal(syncSummary.overallPercentageUsed, 40.0);
    console.log('  [OK] Ejecución asíncrona y síncrona en use case completadas con éxito');
  }

  console.log('\n========================================');
  console.log('  [RESULTADO] Todas las pruebas de US-047 pasaron exitosamente (12/12).');
  console.log('========================================\n');
}
