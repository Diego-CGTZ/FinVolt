/**
 * ProjectedLiquidity.test.ts — Suite de pruebas para US-045 (Liquidez Proyectada)
 *
 * Criterios de Aceptación (AC):
 * - Liquid Assets + Expected Income - Credit Obligations - Committed Expenses
 * - Horizonte configurable
 * - Cálculo determinístico
 *
 * Dependencias: US-016, US-044
 */

import assert from 'node:assert/strict';
import type { Account } from '../../src/domain/models/Account';
import type { FutureObligation } from '../../src/domain/models/FutureObligation';
import { ProjectedLiquidityCalculator } from '../../src/domain/services/liquidity/ProjectedLiquidityCalculator';
import { CalculateProjectedLiquidityUseCase } from '../../src/application/useCases/CalculateProjectedLiquidityUseCase';
import { GetLiquidityUseCase } from '../../src/application/useCases/GetLiquidityUseCase';
import type { IFutureObligationRepository } from '../../src/domain/repositories/IFutureObligationRepository';

function createAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: overrides.id || `acc-${Math.random().toString(36).substring(7)}`,
    userId: overrides.userId || 'user-us045',
    name: overrides.name || 'Cuenta Test',
    type: overrides.type || 'CHECKING',
    currency: overrides.currency || 'MXN',
    initialBalance: overrides.initialBalance ?? 0,
    creditLimit: overrides.creditLimit,
    cutoffDay: overrides.cutoffDay,
    paymentDueDay: overrides.paymentDueDay,
    createdAt: overrides.createdAt || new Date(),
    updatedAt: overrides.updatedAt || new Date(),
  };
}



function buildObligation(overrides: Partial<FutureObligation> = {}): FutureObligation {
  const now = new Date('2026-10-15T00:00:00.000Z');
  return {
    id: overrides.id || `ob-${Math.random().toString(36).substring(7)}`,
    userId: 'user-us045',
    accountId: overrides.accountId ?? null,
    categoryId: overrides.categoryId ?? null,
    recurringTransactionId: null,
    name: overrides.name || 'Obligación Test',
    description: null,
    direction: overrides.direction || 'EXPENSE',
    obligationType: overrides.obligationType || 'OTHER',
    certainty: overrides.certainty || 'COMMITTED',
    amountMinor: overrides.amountMinor ?? 100000, // 1,000.00 por defecto
    currency: overrides.currency || 'MXN',
    periodicity: overrides.periodicity || 'MONTHLY',
    intervalDays: overrides.intervalDays ?? null,
    nextDueDate: overrides.nextDueDate || new Date(now),
    anchorDay: overrides.anchorDay ?? 15,
    endDate: overrides.endDate ?? null,
    lastFulfilledAt: null,
    status: overrides.status || 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function runProjectedLiquidityTests(): Promise<void> {
  console.log('[TEST] Iniciando pruebas de US-045: Liquidez Proyectada...');

  const baseDate = new Date('2026-10-15T00:00:00.000Z');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Fórmula Canónica de AC:
  // Liquid Assets + Expected Income - Credit Obligations - Committed Expenses
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 1] Fórmula Canónica de AC determinista');
  {
    // Liquid assets: Checking $10,000 + Cash $2,500 = $12,500
    const checking = createAccount({
      id: 'acc-chk',
      name: 'Banco BBVA',
      type: 'CHECKING',
      initialBalance: 10000,
    });
    const cash = createAccount({
      id: 'acc-cash',
      name: 'Efectivo Cartera',
      type: 'CASH',
      initialBalance: 2500,
    });
    // Credit card con deuda de $3,500
    const creditCard = createAccount({
      id: 'acc-cc',
      name: 'Tarjeta Oro',
      type: 'CREDIT_CARD',
      initialBalance: -3500,
    });

    // Ingreso esperado: Salario $15,000 (vence en 5 días)
    const incomeObligation = buildObligation({
      id: 'ob-income',
      name: 'Nómina',
      direction: 'INCOME',
      obligationType: 'SALARY',
      certainty: 'COMMITTED',
      amountMinor: 1500000, // $15,000.00
      nextDueDate: new Date('2026-10-20T00:00:00.000Z'),
      periodicity: 'ONE_TIME',
    });

    // Gastos comprometidos: Renta $8,000 y Préstamo $2,000 = $10,000
    const rentObligation = buildObligation({
      id: 'ob-rent',
      name: 'Renta Depto',
      direction: 'EXPENSE',
      obligationType: 'RENT',
      certainty: 'COMMITTED',
      amountMinor: 800000, // $8,000.00
      nextDueDate: new Date('2026-10-25T00:00:00.000Z'),
      periodicity: 'ONE_TIME',
    });
    const loanObligation = buildObligation({
      id: 'ob-loan',
      name: 'Crédito Auto',
      direction: 'EXPENSE',
      obligationType: 'LOAN',
      certainty: 'COMMITTED',
      amountMinor: 200000, // $2,000.00
      nextDueDate: new Date('2026-10-28T00:00:00.000Z'),
      periodicity: 'ONE_TIME',
    });

    const result = ProjectedLiquidityCalculator.calculate({
      accounts: [checking, cash, creditCard],
      transactions: [],
      obligations: [incomeObligation, rentObligation, loanObligation],
      config: {
        startDate: baseDate,
        horizonDays: 30,
      },
    });

    // Fórmula: 12,500 (activos) + 15,000 (ingresos) - 3,500 (crédito) - 10,000 (gastos) = $14,000
    assert(result.liquidAssets === 12500, 'Activos líquidos deben ser exactamente 12,500.00');
    assert(result.expectedIncome === 15000, 'Ingresos esperados deben ser 15,000.00');
    assert(result.creditObligations === 3500, 'Obligaciones de crédito deben ser 3,500.00');
    assert(result.committedExpenses === 10000, 'Gastos comprometidos deben ser 10,000.00');
    assert(result.finalProjectedLiquidity === 14000, 'Liquidez final proyectada debe ser 14,000.00');
    assert(result.finalProjectedLiquidityMinor === 1400000, 'Aritmética en centavos debe ser 1,400,000');
    console.log('  [OK] Fórmula canónica Liquid Assets + Expected Income - Credit Obligations - Committed Expenses validada');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Exclusión Estricta de Tarjetas de Crédito de Activos Líquidos (US-016)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 2] Exclusión estricta de tarjetas de crédito en activos líquidos');
  {
    const creditCard = createAccount({
      id: 'acc-cc-pos',
      name: 'Línea de Crédito',
      type: 'CREDIT_CARD',
      initialBalance: 20000, // Línea o saldo aparente
    });
    const savings = createAccount({
      id: 'acc-sav',
      name: 'Ahorro Retiro',
      type: 'SAVINGS',
      initialBalance: 5000,
    });

    const result = ProjectedLiquidityCalculator.calculate({
      accounts: [creditCard, savings],
      transactions: [],
      obligations: [],
      config: { startDate: baseDate, horizonDays: 30 },
    });

    assert(result.liquidAssets === 5000, 'Solo la cuenta de ahorros debe formar parte de activos líquidos');
    assert(result.liquidAssetsBreakdown.savings === 5000, 'Desglose de ahorros correcto');
    console.log('  [OK] Regla US-016: Tarjetas de crédito excluidas de activos líquidos');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Horizonte Configurable (7, 15, 30, 60, 90 días)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 3] Horizonte temporal configurable');
  {
    const checking = createAccount({ id: 'chk-1', initialBalance: 1000, type: 'CHECKING' });

    // Gasto semanal recurrente de $100 que vence cada 7 días a partir del día 3
    const weeklyExpense = buildObligation({
      id: 'ob-weekly',
      name: 'Gimnasio Semanal',
      direction: 'EXPENSE',
      certainty: 'COMMITTED',
      amountMinor: 10000, // $100.00
      periodicity: 'WEEKLY',
      nextDueDate: new Date('2026-10-18T00:00:00.000Z'), // Día +3
    });

    // 7 días: incluye ocurrencia el día 18 (1 ocurrencia = $100)
    const res7 = ProjectedLiquidityCalculator.calculate({
      accounts: [checking],
      obligations: [weeklyExpense],
      config: { startDate: baseDate, horizonDays: 7 },
    });
    assert(res7.committedExpenses === 100, `Horizonte 7D debe incluir 1 gasto semanal (obtenido ${res7.committedExpenses})`);

    // 15 días: incluye ocurrencias días 18 y 25 (2 ocurrencias = $200)
    const res15 = ProjectedLiquidityCalculator.calculate({
      accounts: [checking],
      obligations: [weeklyExpense],
      config: { startDate: baseDate, horizonDays: 15 },
    });
    assert(res15.committedExpenses === 200, `Horizonte 15D debe incluir 2 gastos semanales (obtenido ${res15.committedExpenses})`);

    // 30 días: incluye días 18, 25, Nov 1, Nov 8 (4 ocurrencias = $400)
    const res30 = ProjectedLiquidityCalculator.calculate({
      accounts: [checking],
      obligations: [weeklyExpense],
      config: { startDate: baseDate, horizonDays: 30 },
    });
    assert(res30.committedExpenses === 400, `Horizonte 30D debe incluir 4 gastos semanales (obtenido ${res30.committedExpenses})`);

    // 60 días: incluye al menos 8 ocurrencias
    const res60 = ProjectedLiquidityCalculator.calculate({
      accounts: [checking],
      obligations: [weeklyExpense],
      config: { startDate: baseDate, horizonDays: 60 },
    });
    assert(res60.committedExpenses >= 800, 'Horizonte 60D escala ocurrencias proporcionalmente');
    console.log('  [OK] Horizontes configurables (7, 15, 30, 60 días) proyectan ocurrencias exactas');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Segregación entre Gastos Comprometidos vs Estimados
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 4] Segregación de gastos comprometidos vs estimados');
  {
    const checking = createAccount({ id: 'chk-1', initialBalance: 5000, type: 'CHECKING' });

    // Comprometido: Renta $2,000
    const committedRent = buildObligation({
      id: 'rent-1',
      name: 'Renta',
      direction: 'EXPENSE',
      certainty: 'COMMITTED',
      amountMinor: 200000,
      nextDueDate: new Date('2026-10-20T00:00:00.000Z'),
      periodicity: 'ONE_TIME',
    });

    // Estimado: Restaurantes / Ocio $800
    const estimatedDining = buildObligation({
      id: 'dining-1',
      name: 'Salidas Restaurantes Estimadas',
      direction: 'EXPENSE',
      certainty: 'EXPECTED',
      amountMinor: 80000,
      nextDueDate: new Date('2026-10-22T00:00:00.000Z'),
      periodicity: 'ONE_TIME',
    });

    const res = ProjectedLiquidityCalculator.calculate({
      accounts: [checking],
      obligations: [committedRent, estimatedDining],
      config: { startDate: baseDate, horizonDays: 30 },
    });

    assert(res.committedExpenses === 2000, 'Gastos comprometidos deben ser 2,000.00');
    assert(res.estimatedExpenses === 800, 'Gastos estimados deben ser 800.00');
    assert(res.totalExpenses === 2800, 'Total de gastos debe ser 2,800.00');

    // La fórmula estándar de AC solo deduce comprometidos: 5,000 - 2,000 = 3,000
    assert(res.finalProjectedLiquidity === 3000, 'Fórmula estándar de AC deduce solo gastos comprometidos (3,000.00)');
    // La fórmula conservadora deduce ambos: 5,000 - 2,800 = 2,200
    assert(res.conservativeProjectedLiquidity === 2200, 'Fórmula conservadora deduce gastos comprometidos + estimados (2,200.00)');
    console.log('  [OK] Segregación entre gastos COMMITTED y EXPECTED validada');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Segregación de Ingresos Esperados (Committed vs Estimated)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 5] Segregación de ingresos esperados (fijos vs probables)');
  {
    const checking = createAccount({ id: 'chk-1', initialBalance: 1000, type: 'CHECKING' });

    const fixedSalary = buildObligation({
      id: 'sal-1',
      name: 'Sueldo Fijo',
      direction: 'INCOME',
      certainty: 'COMMITTED',
      amountMinor: 1200000, // 12,000.00
      nextDueDate: new Date('2026-10-20T00:00:00.000Z'),
      periodicity: 'ONE_TIME',
    });

    const probableBonus = buildObligation({
      id: 'bonus-1',
      name: 'Bono Probable',
      direction: 'INCOME',
      certainty: 'EXPECTED',
      amountMinor: 300000, // 3,000.00
      nextDueDate: new Date('2026-10-25T00:00:00.000Z'),
      periodicity: 'ONE_TIME',
    });

    const res = ProjectedLiquidityCalculator.calculate({
      accounts: [checking],
      obligations: [fixedSalary, probableBonus],
      config: { startDate: baseDate, horizonDays: 30 },
    });

    assert(res.expectedIncome === 15000, 'Ingresos esperados totales deben ser 15,000.00');
    assert(res.expectedIncomeCommittedMinor === 1200000, 'Ingreso comprometido minor units 1,200,000');
    assert(res.expectedIncomeEstimatedMinor === 300000, 'Ingreso estimado minor units 300,000');
    console.log('  [OK] Ingresos esperados segregados por nivel de certidumbre');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Detección de Caídas de Liquidez y Déficit Temporal (Base US-057)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 6] Detección de caídas de liquidez temporal (dip) y déficit');
  {
    // Empieza con $2,000 en banco
    const checking = createAccount({ id: 'chk-1', initialBalance: 2000, type: 'CHECKING' });

    // Día 5: Renta de $3,500 cae antes de cobrar nómina -> saldo cae a -$1,500
    const rent = buildObligation({
      id: 'ob-rent',
      name: 'Renta',
      direction: 'EXPENSE',
      certainty: 'COMMITTED',
      amountMinor: 350000,
      nextDueDate: new Date('2026-10-20T00:00:00.000Z'), // Día +5
      periodicity: 'ONE_TIME',
    });

    // Día 15: Sueldo de $10,000 rescata el saldo -> final es positivo $8,500
    const salary = buildObligation({
      id: 'ob-sal',
      name: 'Sueldo',
      direction: 'INCOME',
      certainty: 'COMMITTED',
      amountMinor: 1000000,
      nextDueDate: new Date('2026-10-30T00:00:00.000Z'), // Día +15
      periodicity: 'ONE_TIME',
    });

    const res = ProjectedLiquidityCalculator.calculate({
      accounts: [checking],
      obligations: [rent, salary],
      config: { startDate: baseDate, horizonDays: 30 },
    });

    assert(res.finalProjectedLiquidity === 8500, 'El saldo final es positivo ($8,500.00)');
    assert(res.isDeficitProjected === true, 'Debe detectar déficit proyectado intermedio');
    assert(res.minimumLiquidity === -1500, 'Punto más bajo de liquidez debe ser -$1,500.00');
    assert(res.daysUntilDeficit === 5, 'Días hasta el primer déficit debe ser 5');
    console.log('  [OK] Alerta matemática de déficit temporal y dip negativo detectada con precisión');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 7: Respeto de Anclaje de Fechas y Fin de Mes (anchorDay)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 7] Respeto de anchorDay en cálculos mensuales');
  {
    const checking = createAccount({ id: 'chk-1', initialBalance: 5000, type: 'CHECKING' });

    // Obligación mensual anclada al día 31
    const endOfMonthObligation = buildObligation({
      id: 'ob-eom',
      name: 'Membresía Fin de Mes',
      direction: 'EXPENSE',
      certainty: 'COMMITTED',
      amountMinor: 50000, // $500.00
      periodicity: 'MONTHLY',
      anchorDay: 31,
      nextDueDate: new Date('2026-10-31T00:00:00.000Z'),
    });

    // Horizonte de 90 días cubre Octubre, Noviembre, Diciembre y principios de Enero
    const res = ProjectedLiquidityCalculator.calculate({
      accounts: [checking],
      obligations: [endOfMonthObligation],
      config: { startDate: baseDate, horizonDays: 90 },
    });

    // Oct 31, Nov 30, Dic 31 -> 3 ocurrencias
    assert(res.committedExpenses === 1500, `Debe generar 3 ocurrencias de fin de mes ($1,500.00, obtenido ${res.committedExpenses})`);
    console.log('  [OK] Anclaje de día de fin de mes opera sin derivas de calendario');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 8: Integridad Aritmética de Trayectoria Diaria en Centavos
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 8] Aritmética continua en la línea de tiempo sin drift');
  {
    const checking = createAccount({ id: 'chk-1', initialBalance: 1234.56, type: 'CHECKING' });

    const smallIncome = buildObligation({
      name: 'Micro Interés',
      direction: 'INCOME',
      certainty: 'COMMITTED',
      amountMinor: 123, // $1.23
      nextDueDate: new Date('2026-10-16T00:00:00.000Z'),
      periodicity: 'ONE_TIME',
    });

    const smallExpense = buildObligation({
      name: 'Micro Cargo',
      direction: 'EXPENSE',
      certainty: 'COMMITTED',
      amountMinor: 456, // $4.56
      nextDueDate: new Date('2026-10-17T00:00:00.000Z'),
      periodicity: 'ONE_TIME',
    });

    const res = ProjectedLiquidityCalculator.calculate({
      accounts: [checking],
      obligations: [smallIncome, smallExpense],
      config: { startDate: baseDate, horizonDays: 5 },
    });

    assert(res.liquidAssetsMinor === 123456, 'Centavos iniciales 123,456');
    assert(res.expectedIncomeMinor === 123, 'Centavos ingreso 123');
    assert(res.committedExpensesMinor === 456, 'Centavos gasto 456');
    assert(res.finalProjectedLiquidityMinor === 123456 + 123 - 456, 'Aritmética exacta de centavos');
    assert(res.finalProjectedLiquidity === 1231.23, '1234.56 + 1.23 - 4.56 = 1231.23');
    console.log('  [OK] Línea de tiempo y minor units sin errores de floating point');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 9: Consistencia de Pasivo de Tarjeta y Obligación CREDIT_CARD_PAYMENT
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 9] No duplicación de pasivo de tarjeta contra pago programado');
  {
    // Tarjeta con saldo negativo de -$4,000 (deuda)
    const creditCard = createAccount({
      id: 'acc-card',
      type: 'CREDIT_CARD',
      initialBalance: -4000,
    });
    const checking = createAccount({
      id: 'acc-chk',
      type: 'CHECKING',
      initialBalance: 10000,
    });

    // El usuario programa un pago de tarjeta por $4,000 en sus obligaciones
    const cardPaymentObligation = buildObligation({
      name: 'Pago Mensual Tarjeta',
      direction: 'EXPENSE',
      obligationType: 'CREDIT_CARD_PAYMENT',
      certainty: 'COMMITTED',
      amountMinor: 400000, // $4,000.00
      nextDueDate: new Date('2026-10-25T00:00:00.000Z'),
      periodicity: 'ONE_TIME',
    });

    const res = ProjectedLiquidityCalculator.calculate({
      accounts: [checking, creditCard],
      obligations: [cardPaymentObligation],
      config: { startDate: baseDate, horizonDays: 30 },
    });

    // 10,000 activos - 4,000 de tarjeta = 6,000 (no 10,000 - 4,000 - 4,000 = 2,000)
    assert(res.finalProjectedLiquidity === 6000, `Liquidez debe ser 6,000.00 (obtenido ${res.finalProjectedLiquidity})`);
    console.log('  [OK] Evitado el doble descuento de pasivo de tarjeta');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 10: Condiciones de Frontera Temporal (Antes, en y después del horizonte)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 10] Fronteras temporales exactas de horizonte');
  {
    const checking = createAccount({ id: 'chk-1', initialBalance: 1000, type: 'CHECKING' });

    // Vencimiento ayer (debe ser omitido)
    const pastObligation = buildObligation({
      name: 'Gasto Pasado',
      direction: 'EXPENSE',
      amountMinor: 50000,
      nextDueDate: new Date('2026-10-14T00:00:00.000Z'),
      periodicity: 'ONE_TIME',
    });

    // Vencimiento en startDate (debe ser incluido)
    const todayObligation = buildObligation({
      name: 'Gasto Hoy',
      direction: 'EXPENSE',
      amountMinor: 10000,
      nextDueDate: new Date('2026-10-15T00:00:00.000Z'),
      periodicity: 'ONE_TIME',
    });

    // Vencimiento después de 10 días (fuera de horizonte de 5 días)
    const futureObligation = buildObligation({
      name: 'Gasto Lejano',
      direction: 'EXPENSE',
      amountMinor: 80000,
      nextDueDate: new Date('2026-10-25T00:00:00.000Z'),
      periodicity: 'ONE_TIME',
    });

    const res = ProjectedLiquidityCalculator.calculate({
      accounts: [checking],
      obligations: [pastObligation, todayObligation, futureObligation],
      config: { startDate: baseDate, horizonDays: 5 },
    });

    assert(res.committedExpenses === 100, `Solo el evento del día de hoy debe ser incluido ($100.00, obtenido ${res.committedExpenses})`);
    console.log('  [OK] Filtrado estricto en fronteras de startDate y endDate');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 11: Integración Retrocompatible con GetLiquidityUseCase
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 11] Integración retrocompatible con GetLiquidityUseCase (US-016 & US-045)');
  {
    const checking = createAccount({ id: 'chk-1', initialBalance: 5000, type: 'CHECKING' });
    const useCase = new GetLiquidityUseCase();

    // 1. Llamada clásica sin obligaciones (US-016)
    const legacyMetrics = useCase.execute([checking], []);
    assert(legacyMetrics.realLiquidity === 5000, 'Liquidez real legacy correcta');
    assert(legacyMetrics.projectedDetails === undefined, 'Sin detalles proyectados si no hay obligaciones');

    // 2. Llamada extendida con obligaciones (US-045)
    const income = buildObligation({
      direction: 'INCOME',
      amountMinor: 200000,
      nextDueDate: new Date('2026-10-20T00:00:00.000Z'),
      periodicity: 'ONE_TIME',
    });
    const extendedMetrics = useCase.execute([checking], [], [income], 30);
    assert(extendedMetrics.realLiquidity === 5000, 'Liquidez real presente');
    assert(extendedMetrics.projectedLiquidity === 7000, 'Liquidez proyectada actualizada a 7,000.00');
    assert(extendedMetrics.projectedDetails !== undefined, 'Detalles de US-045 adjuntados');
    console.log('  [OK] Retrocompatibilidad e interoperabilidad de casos de uso verificada');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 12: Orquestación de Extremo a Extremo en CalculateProjectedLiquidityUseCase
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 12] Orquestación E2E en CalculateProjectedLiquidityUseCase');
  {
    const checking = createAccount({ id: 'chk-1', initialBalance: 8000, type: 'CHECKING' });
    const obligation1 = buildObligation({
      id: 'ob-repo-1',
      name: 'Nómina Quincenal',
      direction: 'INCOME',
      certainty: 'COMMITTED',
      amountMinor: 1000000,
      nextDueDate: new Date('2026-10-18T00:00:00.000Z'),
      periodicity: 'ONE_TIME',
    });

    const mockRepo: IFutureObligationRepository = {
      save: async () => {},
      saveMany: async () => {},
      findById: async () => null,
      findByUserId: async () => [obligation1],
      findByAccountId: async () => [],
      findByCategoryId: async () => [],
      findUpcoming: async () => [obligation1],
      findAll: async () => [obligation1],
      delete: async () => {},
      clear: async () => {},
    };



    const useCase = new CalculateProjectedLiquidityUseCase(mockRepo);

    const asyncResult = await useCase.execute({
      userId: 'user-us045',
      accounts: [checking],
      config: {
        startDate: baseDate,
        horizonDays: 15,
      },
    });

    assert(asyncResult.finalProjectedLiquidity === 18000, '8,000 + 10,000 = 18,000.00');
    assert(asyncResult.occurrencesCount === 1, '1 ocurrencia cargada desde repositorio');

    // Comprobar también executeSync
    const syncResult = useCase.executeSync({
      accounts: [checking],
      obligations: [obligation1],
      config: {
        startDate: baseDate,
        horizonDays: 15,
      },
    });
    assert(syncResult.finalProjectedLiquidity === 18000, 'executeSync produce el mismo resultado canónico');
    console.log('  [OK] Orquestación asíncrona con repositorio y síncrona en memoria completadas');
  }

  console.log('\n========================================');
  console.log('  [RESULTADO] Todas las pruebas de US-045 pasaron exitosamente (12/12).');
  console.log('========================================\n');
}
