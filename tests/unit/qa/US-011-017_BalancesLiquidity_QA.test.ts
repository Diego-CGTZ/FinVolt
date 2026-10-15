/// <reference types="node" />
/**
 * QA robusto: US-015 (balances), US-016 (liquidez real), US-017 (dashboard basico)
 * Cubre ademas el calculo contable usado por US-009..US-013 (gasto, ingreso, transferencia, tarjeta, efectivo).
 */
import assert from 'node:assert/strict';
import {
  calculateAccountBalance,
  calculateAggregateBalances,
  calculateLiquidityMetrics,
  calculateMonthlyFinancialSummary,
  calculateCreditObligations,
  getTransactionDelta,
  isTransferInflow,
} from '../../../src/domain/services/BalanceCalculatorService';
import type { Account } from '../../../src/domain/models/Account';
import type { Transaction } from '../../../src/domain/models/Transaction';

const NOW = new Date('2026-10-14T12:00:00Z');

function acc(p: Partial<Account> & { id: string; type: Account['type'] }): Account {
  return {
    userId: 'u1',
    name: p.id,
    currency: 'MXN',
    initialBalance: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...p,
  };
}

let seq = 0;
function tx(p: Partial<Transaction> & { accountId: string; type: Transaction['type']; amountMinor: number }): Transaction {
  seq++;
  return {
    id: `t${seq}`,
    userId: 'u1',
    currency: 'MXN',
    occurredAt: NOW,
    postedAt: null,
    merchantRaw: null,
    merchant: null,
    description: null,
    categoryId: null,
    source: 'MANUAL',
    sourceEventId: null,
    status: 'CONFIRMED',
    confidenceScore: null,
    fingerprint: null,
    linkedTransactionId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...p,
  };
}

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  [OK] ${name}`);
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${(e as Error).message.split('\n')[0]}`);
    throw e;
  }
}

export async function runQaTests(): Promise<void> {
  const failures: string[] = [];
  const t = (name: string, fn: () => void) => {
    try {
      check(name, fn);
    } catch {
      failures.push(name);
    }
  };

  console.log('[QA US-015] Balances por cuenta');
  t('gasto resta, ingreso suma', () => {
    const a = acc({ id: 'a', type: 'CHECKING', initialBalance: 1000 });
    const b = calculateAccountBalance(a, [
      tx({ accountId: 'a', type: 'EXPENSE', amountMinor: 25050 }),
      tx({ accountId: 'a', type: 'INCOME', amountMinor: 100000 }),
    ]);
    assert.equal(b.currentBalance, 1749.5);
    assert.equal(b.totalExpense, 250.5);
    assert.equal(b.totalIncome, 1000);
  });
  t('REJECTED y DUPLICATE no afectan balance', () => {
    const a = acc({ id: 'a', type: 'CHECKING' });
    const b = calculateAccountBalance(a, [
      tx({ accountId: 'a', type: 'EXPENSE', amountMinor: 5000, status: 'REJECTED' }),
      tx({ accountId: 'a', type: 'EXPENSE', amountMinor: 5000, status: 'DUPLICATE' }),
    ]);
    assert.equal(b.currentBalance, 0);
  });
  t('transacciones de otra cuenta se ignoran', () => {
    const a = acc({ id: 'a', type: 'CASH' });
    const b = calculateAccountBalance(a, [tx({ accountId: 'zzz', type: 'EXPENSE', amountMinor: 100 })]);
    assert.equal(b.transactionCount, 0);
    assert.equal(b.currentBalance, 0);
  });
  t('precision decimal: 0.1 + 0.2 centavos acumulados (30 x $0.10 = $3.00 exacto)', () => {
    const a = acc({ id: 'a', type: 'CASH' });
    const txs = Array.from({ length: 30 }, () => tx({ accountId: 'a', type: 'INCOME', amountMinor: 10 }));
    const b = calculateAccountBalance(a, txs);
    assert.equal(b.currentBalance, 3, `balance=${b.currentBalance}`);
  });
  t('precision decimal: miles de centavos impares suman exacto', () => {
    const a = acc({ id: 'a', type: 'CASH' });
    const txs = Array.from({ length: 1000 }, (_, i) =>
      tx({ accountId: 'a', type: 'INCOME', amountMinor: 33 + (i % 7) }),
    );
    const expectedMinor = txs.reduce((s, x) => s + x.amountMinor, 0);
    const b = calculateAccountBalance(a, txs);
    assert.equal(Math.round(b.currentBalance * 100), expectedMinor);
    assert.equal(b.currentBalance, expectedMinor / 100, `balance=${b.currentBalance} esperado=${expectedMinor / 100}`);
  });

  console.log('\n[QA US-011] Transferencias entre cuentas');
  t('TRANSFER_OUT resta en origen y TRANSFER_IN suma en destino (marcador explicito)', () => {
    const out = tx({ accountId: 'a', type: 'TRANSFER', amountMinor: 10000, sourceEventId: 'TRANSFER_OUT' });
    const inn = tx({ accountId: 'b', type: 'TRANSFER', amountMinor: 10000, sourceEventId: 'TRANSFER_IN' });
    assert.equal(getTransactionDelta(out), -100);
    assert.equal(getTransactionDelta(inn), 100);
  });
  t('transferencia neta total entre cuentas propias = 0 en patrimonio', () => {
    const accounts = [acc({ id: 'a', type: 'CHECKING', initialBalance: 500 }), acc({ id: 'b', type: 'SAVINGS' })];
    const txs = [
      tx({ accountId: 'a', type: 'TRANSFER', amountMinor: 20000, sourceEventId: 'TRANSFER_OUT' }),
      tx({ accountId: 'b', type: 'TRANSFER', amountMinor: 20000, sourceEventId: 'TRANSFER_IN' }),
    ];
    const agg = calculateAggregateBalances(accounts, txs);
    assert.equal(agg.totalNetWorth, 500);
    assert.equal(agg.totalExpense, 0);
    assert.equal(agg.totalIncome, 0);
  });
  t('descripcion "Transferencia a Ahorros" es SALIDA (no entrada)', () => {
    const o = tx({ accountId: 'a', type: 'TRANSFER', amountMinor: 100, description: 'Transferencia a Ahorros' });
    assert.equal(isTransferInflow(o), false, 'se interpreto como entrada por contener " a "');
  });
  t('descripcion "Pago a tarjeta" es SALIDA (no entrada)', () => {
    const o = tx({ accountId: 'a', type: 'TRANSFER', amountMinor: 100, description: 'Pago a tarjeta BBVA' });
    assert.equal(isTransferInflow(o), false, 'se interpreto como entrada por contener " a "');
  });
  t('descripcion "Transferencia desde Nomina" es ENTRADA', () => {
    const o = tx({ accountId: 'a', type: 'TRANSFER', amountMinor: 100, description: 'Transferencia desde Nomina' });
    assert.equal(isTransferInflow(o), true);
  });

  console.log('\n[QA US-012] Tarjeta de credito');
  t('gasto con tarjeta genera deuda y no liquidez', () => {
    const accounts = [
      acc({ id: 'c', type: 'CREDIT_CARD', creditLimit: 20000, cutoffDay: 5, paymentDueDay: 25 }),
      acc({ id: 'd', type: 'CHECKING', initialBalance: 3000 }),
    ];
    const txs = [tx({ accountId: 'c', type: 'EXPENSE', amountMinor: 120000 })];
    const liq = calculateLiquidityMetrics(accounts, txs);
    assert.equal(liq.creditCardDebt, 1200);
    assert.equal(liq.realLiquidity, 3000);
    assert.equal(liq.projectedLiquidity, 1800);
    assert.equal(liq.accountingBalance, 1800);
  });
  t('pago de tarjeta (INCOME en tarjeta + EXPENSE en debito) reduce la deuda', () => {
    const accounts = [acc({ id: 'c', type: 'CREDIT_CARD' }), acc({ id: 'd', type: 'CHECKING', initialBalance: 5000 })];
    const txs = [
      tx({ accountId: 'c', type: 'EXPENSE', amountMinor: 100000 }),
      tx({ accountId: 'c', type: 'TRANSFER', amountMinor: 40000, sourceEventId: 'TRANSFER_IN' }),
      tx({ accountId: 'd', type: 'TRANSFER', amountMinor: 40000, sourceEventId: 'TRANSFER_OUT' }),
    ];
    const co = calculateCreditObligations(accounts, txs);
    assert.equal(co.totalCreditDebt, 600);
    assert.equal(co.cardsWithDebtCount, 1);
    assert.equal(calculateAggregateBalances(accounts, txs).totalLiquidAssets, 4600);
  });
  t('tarjeta con saldo a favor no cuenta como deuda ni como liquidez', () => {
    const accounts = [acc({ id: 'c', type: 'CREDIT_CARD', initialBalance: 500 })];
    const co = calculateCreditObligations(accounts, []);
    assert.equal(co.totalCreditDebt, 0);
    assert.equal(calculateLiquidityMetrics(accounts, []).realLiquidity, 0);
  });
  t('tarjeta con deuda inicial negativa se refleja', () => {
    const accounts = [acc({ id: 'c', type: 'CREDIT_CARD', initialBalance: -2500 })];
    assert.equal(calculateCreditObligations(accounts, []).obligations[0].debtAmount, 2500);
  });

  console.log('\n[QA US-013] Efectivo');
  t('cuenta CASH cuenta como liquidez y refleja gastos', () => {
    const accounts = [acc({ id: 'x', type: 'CASH', initialBalance: 1000 })];
    const txs = [tx({ accountId: 'x', type: 'EXPENSE', amountMinor: 35000 })];
    assert.equal(calculateLiquidityMetrics(accounts, txs).liquidAccountsBreakdown.cash, 650);
  });
  t('efectivo sobregirado (negativo) no aporta liquidez positiva', () => {
    const accounts = [acc({ id: 'x', type: 'CASH', initialBalance: 100 })];
    const txs = [tx({ accountId: 'x', type: 'EXPENSE', amountMinor: 50000 })];
    assert.equal(calculateLiquidityMetrics(accounts, txs).realLiquidity, 0);
  });

  console.log('\n[QA US-016] Liquidez real vs contable');
  t('transferencias NO son gastos ni ingresos reales', () => {
    const accounts = [acc({ id: 'a', type: 'CHECKING', initialBalance: 1000 }), acc({ id: 'b', type: 'SAVINGS' })];
    const txs = [
      tx({ accountId: 'a', type: 'TRANSFER', amountMinor: 30000, sourceEventId: 'TRANSFER_OUT' }),
      tx({ accountId: 'b', type: 'TRANSFER', amountMinor: 30000, sourceEventId: 'TRANSFER_IN' }),
    ];
    const liq = calculateLiquidityMetrics(accounts, txs);
    assert.equal(liq.actualExpenses, 0);
    assert.equal(liq.actualIncomes, 0);
    assert.equal(liq.realLiquidity, 1000);
  });
  t('compromisos no efectivos (CANDIDATE) reducen liquidez proyectada', () => {
    const accounts = [acc({ id: 'a', type: 'CHECKING', initialBalance: 1000 })];
    const txs = [tx({ accountId: 'a', type: 'EXPENSE', amountMinor: 20000, status: 'CANDIDATE' })];
    const liq = calculateLiquidityMetrics(accounts, txs);
    assert.equal(liq.pendingCommitments, 200);
    assert.equal(liq.realLiquidity, 1000);
    assert.equal(liq.projectedLiquidity, 800);
  });
  t('gasto PENDING no se descuenta DOS veces (balance + compromisos)', () => {
    const accounts = [acc({ id: 'a', type: 'CHECKING', initialBalance: 1000 })];
    const txs = [tx({ accountId: 'a', type: 'EXPENSE', amountMinor: 20000, status: 'PENDING' })];
    const liq = calculateLiquidityMetrics(accounts, txs);
    // El gasto ya baja el balance a 800. Proyectada no deberia bajar a 600.
    assert.ok(liq.projectedLiquidity >= 800, `proyectada=${liq.projectedLiquidity}`);
  });
  t('sin cuentas ni transacciones devuelve ceros', () => {
    const liq = calculateLiquidityMetrics([], []);
    assert.equal(liq.realLiquidity, 0);
    assert.equal(liq.projectedLiquidity, 0);
    assert.equal(liq.accountingBalance, 0);
  });

  console.log('\n[QA US-017] Dashboard basico: resumen mensual');
  t('solo cuenta el mes de referencia', () => {
    const txs = [
      tx({ accountId: 'a', type: 'INCOME', amountMinor: 1000000, occurredAt: new Date(2026, 9, 3) }),
      tx({ accountId: 'a', type: 'EXPENSE', amountMinor: 250000, occurredAt: new Date(2026, 9, 10) }),
      tx({ accountId: 'a', type: 'EXPENSE', amountMinor: 999900, occurredAt: new Date(2026, 8, 30) }),
    ];
    const s = calculateMonthlyFinancialSummary(txs, new Date(2026, 9, 14));
    assert.equal(s.monthlyIncome, 10000);
    assert.equal(s.monthlyExpense, 2500);
    assert.equal(s.monthlyNetSavings, 7500);
    assert.equal(s.monthlySavingsRate, 75);
    assert.equal(s.monthlyTransactionsCount, 2);
  });
  t('limites de mes: ultimo y primer instante', () => {
    const txs = [
      tx({ accountId: 'a', type: 'EXPENSE', amountMinor: 100, occurredAt: new Date(2026, 9, 1, 0, 0, 0) }),
      tx({ accountId: 'a', type: 'EXPENSE', amountMinor: 100, occurredAt: new Date(2026, 9, 31, 23, 59, 59) }),
      tx({ accountId: 'a', type: 'EXPENSE', amountMinor: 100, occurredAt: new Date(2026, 10, 1, 0, 0, 0) }),
    ];
    assert.equal(calculateMonthlyFinancialSummary(txs, new Date(2026, 9, 14)).monthlyTransactionsCount, 2);
  });
  t('tasa de ahorro con gasto > ingreso es 0, no negativa', () => {
    const txs = [
      tx({ accountId: 'a', type: 'INCOME', amountMinor: 1000, occurredAt: new Date(2026, 9, 3) }),
      tx({ accountId: 'a', type: 'EXPENSE', amountMinor: 5000, occurredAt: new Date(2026, 9, 4) }),
    ];
    const s = calculateMonthlyFinancialSummary(txs, new Date(2026, 9, 14));
    assert.equal(s.monthlySavingsRate, 0);
    assert.equal(s.monthlyNetSavings, -40);
  });
  t('sin ingresos tasa 0 y sin division por cero', () => {
    const s = calculateMonthlyFinancialSummary([], new Date(2026, 9, 14));
    assert.equal(s.monthlySavingsRate, 0);
    assert.ok(Number.isFinite(s.monthlyNetSavings));
  });
  t('nombre del mes en espanol y capitalizado', () => {
    const s = calculateMonthlyFinancialSummary([], new Date(2026, 9, 14));
    assert.match(s.currentMonthName, /^Octubre/);
  });
  t('REJECTED/DUPLICATE excluidos del mes', () => {
    const txs = [
      tx({ accountId: 'a', type: 'EXPENSE', amountMinor: 100, occurredAt: new Date(2026, 9, 3), status: 'REJECTED' }),
      tx({ accountId: 'a', type: 'EXPENSE', amountMinor: 100, occurredAt: new Date(2026, 9, 3), status: 'DUPLICATE' }),
    ];
    assert.equal(calculateMonthlyFinancialSummary(txs, new Date(2026, 9, 14)).monthlyExpense, 0);
  });

  console.log(`\n[RESULTADO] ${passed} OK, ${failures.length} FAIL`);
  if (failures.length) {
    throw new Error(`Casos fallidos: ${failures.join(' | ')}`);
  }
}
