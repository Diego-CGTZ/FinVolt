/// <reference types="node" />
/**
 * Pruebas unitarias para US-044: Modelo de Obligaciones Futuras
 *
 * Criterios de Aceptación:
 * 1. Modelo para obligaciones futuras.
 * 2. Periodicidad (semanal, quincenal, mensual, bimestral, trimestral, anual, única, personalizada).
 * 3. Monto en minor units (centavos enteros).
 * 4. Fecha próxima (cálculo determinista con anclaje para evitar deriva de fin de mes).
 * 5. Relación con cuenta y categoría cuando aplique.
 */

import assert from 'node:assert/strict';
import type {
  FutureObligation,
  CreateFutureObligationInput,
  ObligationPeriodicity,
} from '../../src/domain/models/FutureObligation';
import type { RecurringTransaction } from '../../src/domain/models/RecurringTransaction';
import { ObligationScheduleCalculator } from '../../src/domain/services/obligations/ObligationScheduleCalculator';
import { AsyncStorageFutureObligationRepository } from '../../src/infrastructure/database/AsyncStorageFutureObligationRepository';
import { ManageFutureObligationsUseCase } from '../../src/application/useCases/ManageFutureObligationsUseCase';

export async function runFutureObligationTests(): Promise<void> {
  console.log('[TEST] Iniciando pruebas de US-044: Modelo de Obligaciones Futuras...\n');

  const baseDate = new Date('2026-10-15T12:00:00Z');

  // ── [TEST 1] Estructura del Modelo y Relación con Cuenta / Categoría ──
  console.log('[TEST 1] Creación y validación del modelo con cuenta y categoría');
  {
    const obligation: FutureObligation = {
      id: 'ob_rent_1',
      userId: 'usr_diego_1',
      accountId: 'acc_bbva_debit',
      categoryId: 'cat_vivienda',
      recurringTransactionId: 'rec_rent_123',
      name: 'Renta Depto',
      description: 'Pago mensual de arrendamiento',
      direction: 'EXPENSE',
      obligationType: 'RENT',
      certainty: 'COMMITTED',
      amountMinor: 1500000, // $15,000.00 MXN
      currency: 'MXN',
      periodicity: 'MONTHLY',
      intervalDays: null,
      nextDueDate: new Date('2026-11-01T12:00:00Z'),
      anchorDay: 1,
      endDate: null,
      lastFulfilledAt: null,
      status: 'ACTIVE',
      metadata: { landlord: 'Inmobiliaria Central' },
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    assert.strictEqual(obligation.id, 'ob_rent_1');
    assert.strictEqual(obligation.accountId, 'acc_bbva_debit');
    assert.strictEqual(obligation.categoryId, 'cat_vivienda');
    assert.strictEqual(obligation.amountMinor, 1500000);
    assert.strictEqual(obligation.direction, 'EXPENSE');
    assert.strictEqual(obligation.certainty, 'COMMITTED');
    assert.strictEqual(obligation.periodicity, 'MONTHLY');
    console.log('  [OK] Modelo estructurado con cuenta, categoría, monto y periodicidad');
  }

  // ── [TEST 2] Relaciones opcionales nulas cuando no aplican ──
  console.log('\n[TEST 2] Obligación sin cuenta ni categoría asignadas inicialmente');
  {
    const obligation: FutureObligation = {
      id: 'ob_cash_gift',
      userId: 'usr_diego_1',
      accountId: null,
      categoryId: null,
      recurringTransactionId: null,
      name: 'Regalo futuro',
      description: null,
      direction: 'INCOME',
      obligationType: 'OTHER',
      certainty: 'EXPECTED',
      amountMinor: 50000, // $500.00 MXN
      currency: 'MXN',
      periodicity: 'ONE_TIME',
      intervalDays: null,
      nextDueDate: new Date('2026-12-25T12:00:00Z'),
      anchorDay: 25,
      endDate: null,
      lastFulfilledAt: null,
      status: 'ACTIVE',
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    assert.strictEqual(obligation.accountId, null);
    assert.strictEqual(obligation.categoryId, null);
    assert.strictEqual(obligation.periodicity, 'ONE_TIME');
    console.log('  [OK] Soporte para campos de relación nulos cuando no aplican');
  }

  // ── [TEST 3] Cálculo determinista de fechas de vencimiento: Semanal y Catorcenal ──
  console.log('\n[TEST 3] Cálculo de periodicidad Semanal y Catorcenal');
  {
    const start = new Date('2026-10-15T12:00:00Z'); // Jueves 15 de Octubre 2026

    const nextWeekly = ObligationScheduleCalculator.calculateNextDueDate(start, 'WEEKLY');
    assert.strictEqual(nextWeekly.toISOString().slice(0, 10), '2026-10-22');

    const nextBiweekly = ObligationScheduleCalculator.calculateNextDueDate(start, 'BIWEEKLY');
    assert.strictEqual(nextBiweekly.toISOString().slice(0, 10), '2026-10-29');

    console.log('  [OK] Proyecciones semanales (+7 días) y catorcenales (+14 días) exactas');
  }

  // ── [TEST 4] Cálculo de periodicidad Quincenal (Semimonthly) ──
  console.log('\n[TEST 4] Cálculo de periodicidad Quincenal (días 15 y fin de mes)');
  {
    // Del día 1 -> día 15
    const day1 = new Date('2026-10-01T12:00:00Z');
    const next1 = ObligationScheduleCalculator.calculateNextDueDate(day1, 'SEMIMONTHLY');
    assert.strictEqual(next1.toISOString().slice(0, 10), '2026-10-15');

    // Del día 15 -> fin de mes (día 31 para octubre)
    const day15 = new Date('2026-10-15T12:00:00Z');
    const next15 = ObligationScheduleCalculator.calculateNextDueDate(day15, 'SEMIMONTHLY');
    assert.strictEqual(next15.toISOString().slice(0, 10), '2026-10-31');

    // Del fin de mes -> día 15 del siguiente mes (noviembre)
    const day31 = new Date('2026-10-31T12:00:00Z');
    const next31 = ObligationScheduleCalculator.calculateNextDueDate(day31, 'SEMIMONTHLY');
    assert.strictEqual(next31.toISOString().slice(0, 10), '2026-11-15');

    console.log('  [OK] Periodicidad quincenal respeta día 15 y último día del mes');
  }

  // ── [TEST 5] Cálculo Mensual con anclaje de fin de mes (sin deriva 31 ene -> 28 feb -> 31 mar) ──
  console.log('\n[TEST 5] Cálculo mensual con anchorDay previniendo deriva de fin de mes');
  {
    const jan31 = new Date('2026-01-31T12:00:00Z');
    const anchorDay = 31;

    // Enero 31 -> Febrero (en año no bisiesto 2026 tiene 28 días)
    const febDue = ObligationScheduleCalculator.calculateNextDueDate(jan31, 'MONTHLY', null, anchorDay);
    assert.strictEqual(febDue.toISOString().slice(0, 10), '2026-02-28');

    // Febrero 28 con anchorDay=31 -> Marzo 31 (recupera el día 31 sin quedarse en 28)
    const marDue = ObligationScheduleCalculator.calculateNextDueDate(febDue, 'MONTHLY', null, anchorDay);
    assert.strictEqual(marDue.toISOString().slice(0, 10), '2026-03-31');

    // Marzo 31 -> Abril 30
    const aprDue = ObligationScheduleCalculator.calculateNextDueDate(marDue, 'MONTHLY', null, anchorDay);
    assert.strictEqual(aprDue.toISOString().slice(0, 10), '2026-04-30');

    console.log('  [OK] Anclaje anchorDay previene deriva de fechas en meses de 28, 30 y 31 días');
  }

  // ── [TEST 6] Cálculo Bimestral, Trimestral y Anual ──
  console.log('\n[TEST 6] Periodicidades Bimestral, Trimestral y Anual');
  {
    const oct15 = new Date('2026-10-15T12:00:00Z');

    const nextBimonthly = ObligationScheduleCalculator.calculateNextDueDate(oct15, 'BIMONTHLY');
    assert.strictEqual(nextBimonthly.toISOString().slice(0, 10), '2026-12-15');

    const nextQuarterly = ObligationScheduleCalculator.calculateNextDueDate(oct15, 'QUARTERLY');
    assert.strictEqual(nextQuarterly.toISOString().slice(0, 10), '2027-01-15');

    const nextAnnual = ObligationScheduleCalculator.calculateNextDueDate(oct15, 'ANNUAL');
    assert.strictEqual(nextAnnual.toISOString().slice(0, 10), '2027-10-15');

    console.log('  [OK] Saltos interanuales y multimensuales calculados correctamente');
  }

  // ── [TEST 7] Generación de Ocurrencias en Ventana Temporal con endDate ──
  console.log('\n[TEST 7] Proyección de ocurrencias en ventana temporal respetando endDate');
  {
    const obligation: FutureObligation = {
      id: 'ob_gym_1',
      userId: 'usr_diego_1',
      accountId: null,
      categoryId: null,
      recurringTransactionId: null,
      name: 'Membresía Gym',
      description: null,
      direction: 'EXPENSE',
      obligationType: 'SUBSCRIPTION',
      certainty: 'COMMITTED',
      amountMinor: 80000, // $800.00 MXN
      currency: 'MXN',
      periodicity: 'MONTHLY',
      intervalDays: null,
      nextDueDate: new Date('2026-10-20T12:00:00Z'),
      anchorDay: 20,
      endDate: new Date('2026-12-31T23:59:59Z'), // Vence fin de año
      lastFulfilledAt: null,
      status: 'ACTIVE',
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    const fromDate = new Date('2026-10-01T00:00:00Z');
    const toDate = new Date('2027-03-31T23:59:59Z');

    const occurrences = ObligationScheduleCalculator.generateOccurrences(
      obligation,
      fromDate,
      toDate,
    );

    // Debe generar 20-Oct, 20-Nov, 20-Dic. En 2027 ya no porque superó endDate.
    assert.strictEqual(occurrences.length, 3);
    assert.strictEqual(occurrences[0].dueDate.toISOString().slice(0, 10), '2026-10-20');
    assert.strictEqual(occurrences[1].dueDate.toISOString().slice(0, 10), '2026-11-20');
    assert.strictEqual(occurrences[2].dueDate.toISOString().slice(0, 10), '2026-12-20');
    assert.strictEqual(occurrences[0].amountMinor, 80000);
    assert.strictEqual(occurrences[0].certainty, 'COMMITTED');

    console.log('  [OK] Ocurrencias generadas en rango y truncadas correctamente por endDate');
  }

  // ── [TEST 8] Derivación Automática desde RecurringTransaction (US-043 -> US-044) ──
  console.log('\n[TEST 8] Derivación automática desde transacción recurrente detectada');
  {
    const recurring: RecurringTransaction = {
      id: 'rec_netflix_99',
      userId: 'usr_diego_1',
      accountId: 'acc_credit_1',
      name: 'Netflix',
      patternType: 'SUBSCRIPTION',
      transactionType: 'EXPENSE',
      merchant: 'Netflix',
      merchantRaw: 'NETFLIX.COM',
      description: 'Suscripción mensual',
      periodicity: 'MONTHLY',
      intervalDays: 30,
      toleranceDays: 3,
      averageAmountMinor: 21900,
      lastAmountMinor: 21900,
      currency: 'MXN',
      isVariableAmount: false,
      confidenceScore: 95,
      firstOccurrence: new Date('2026-07-15T10:00:00Z'),
      lastOccurrence: new Date('2026-09-15T10:00:00Z'),
      nextExpectedOccurrence: new Date('2026-10-15T10:00:00Z'),
      occurrenceCount: 3,
      transactionIds: ['tx_1', 'tx_2', 'tx_3'],
      status: 'CONFIRMED',
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    const obligation = ObligationScheduleCalculator.createFromRecurringTransaction(recurring);

    assert.strictEqual(obligation.name, 'Netflix');
    assert.strictEqual(obligation.direction, 'EXPENSE');
    assert.strictEqual(obligation.obligationType, 'SUBSCRIPTION');
    assert.strictEqual(obligation.certainty, 'COMMITTED');
    assert.strictEqual(obligation.amountMinor, 21900);
    assert.strictEqual(obligation.recurringTransactionId, 'rec_netflix_99');
    assert.strictEqual(obligation.accountId, 'acc_credit_1');
    assert.strictEqual(obligation.periodicity, 'MONTHLY');
    assert.strictEqual(obligation.nextDueDate.toISOString(), recurring.nextExpectedOccurrence.toISOString());

    console.log('  [OK] Patrón recurrente convertido fielmente en obligación futura');
  }

  // ── [TEST 9] Persistencia CRUD en Repositorio AsyncStorage / Memoria ──
  console.log('\n[TEST 9] Operaciones CRUD y filtros en el repositorio');
  {
    const repo = new AsyncStorageFutureObligationRepository();
    await repo.clear();

    const ob1: FutureObligation = {
      id: 'ob_test_1',
      userId: 'user_a',
      accountId: 'acc_1',
      categoryId: 'cat_rent',
      recurringTransactionId: null,
      name: 'Renta',
      description: null,
      direction: 'EXPENSE',
      obligationType: 'RENT',
      certainty: 'COMMITTED',
      amountMinor: 1000000,
      currency: 'MXN',
      periodicity: 'MONTHLY',
      intervalDays: null,
      nextDueDate: new Date('2026-11-01T00:00:00Z'),
      anchorDay: 1,
      endDate: null,
      lastFulfilledAt: null,
      status: 'ACTIVE',
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    const ob2: FutureObligation = {
      id: 'ob_test_2',
      userId: 'user_a',
      accountId: 'acc_1',
      categoryId: 'cat_salary',
      recurringTransactionId: null,
      name: 'Nómina',
      description: null,
      direction: 'INCOME',
      obligationType: 'SALARY',
      certainty: 'EXPECTED',
      amountMinor: 2500000,
      currency: 'MXN',
      periodicity: 'SEMIMONTHLY',
      intervalDays: null,
      nextDueDate: new Date('2026-10-31T00:00:00Z'),
      anchorDay: 31,
      endDate: null,
      lastFulfilledAt: null,
      status: 'ACTIVE',
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    await repo.saveMany([ob1, ob2]);

    const found = await repo.findById('ob_test_1');
    assert.ok(found !== null);
    assert.strictEqual(found?.name, 'Renta');

    const byUser = await repo.findByUserId('user_a');
    assert.strictEqual(byUser.length, 2);

    const byAccount = await repo.findByAccountId('acc_1');
    assert.strictEqual(byAccount.length, 2);

    const byCategory = await repo.findByCategoryId('cat_rent');
    assert.strictEqual(byCategory.length, 1);
    assert.strictEqual(byCategory[0].id, 'ob_test_1');

    const upcoming = await repo.findUpcoming('user_a', new Date('2026-10-31T23:59:59Z'));
    assert.strictEqual(upcoming.length, 1);
    assert.strictEqual(upcoming[0].id, 'ob_test_2');

    await repo.delete('ob_test_1');
    assert.strictEqual(await repo.findById('ob_test_1'), null);

    console.log('  [OK] Repositorio realiza save, saveMany, findById, findByAccount, findUpcoming y delete');
  }

  // ── [TEST 10] Caso de Uso: Creación, Validación y Cumplimiento (Fulfill) ──
  console.log('\n[TEST 10] Caso de uso ManageFutureObligationsUseCase (creación y fulfill)');
  {
    const repo = new AsyncStorageFutureObligationRepository();
    await repo.clear();
    const useCase = new ManageFutureObligationsUseCase(repo);

    // Creación válida
    const created = await useCase.create({
      userId: 'user_x',
      name: 'Internet Fibra',
      amountMinor: 59900,
      currency: 'MXN',
      direction: 'EXPENSE',
      obligationType: 'UTILITY',
      periodicity: 'MONTHLY',
      nextDueDate: new Date('2026-10-25T12:00:00Z'),
    });

    assert.strictEqual(created.name, 'Internet Fibra');
    assert.strictEqual(created.amountMinor, 59900);
    assert.strictEqual(created.status, 'ACTIVE');

    // Fulfill (pago de la mensualidad) -> debe avanzar la fecha un mes
    const fulfilled = await useCase.fulfill(created.id, new Date('2026-10-25T15:00:00Z'));
    assert.strictEqual(fulfilled.completed, false);
    assert.strictEqual(fulfilled.obligation.status, 'ACTIVE');
    assert.strictEqual(fulfilled.obligation.nextDueDate.toISOString().slice(0, 10), '2026-11-25');
    assert.ok(fulfilled.obligation.lastFulfilledAt !== null);

    // Validación de error ante monto <= 0
    await assert.rejects(
      async () => {
        await useCase.create({
          userId: 'user_x',
          name: 'Inválido',
          amountMinor: 0,
          direction: 'EXPENSE',
          periodicity: 'MONTHLY',
          nextDueDate: new Date(),
        });
      },
      /monto de la obligación debe ser mayor a cero/i,
    );

    console.log('  [OK] Caso de uso valida entradas y avanza fecha de vencimiento al cumplir');
  }

  // ── [TEST 11] Caso de Uso: Obligación ONE_TIME se completa al cumplir ──
  console.log('\n[TEST 11] Cumplimiento de obligación única (ONE_TIME) pasa a COMPLETED');
  {
    const repo = new AsyncStorageFutureObligationRepository();
    await repo.clear();
    const useCase = new ManageFutureObligationsUseCase(repo);

    const oneTime = await useCase.create({
      userId: 'user_y',
      name: 'Predial Anual Único',
      amountMinor: 250000,
      direction: 'EXPENSE',
      periodicity: 'ONE_TIME',
      nextDueDate: new Date('2026-11-15T00:00:00Z'),
    });

    const res = await useCase.fulfill(oneTime.id);
    assert.strictEqual(res.completed, true);
    assert.strictEqual(res.obligation.status, 'COMPLETED');

    console.log('  [OK] Obligación ONE_TIME transiciona a COMPLETED al ser cumplida');
  }

  // ── [TEST 12] Resumen de Próximas Obligaciones y Segregación de Certeza ──
  console.log('\n[TEST 12] Consulta getUpcoming con segregación de gastos comprometidos vs esperados');
  {
    const repo = new AsyncStorageFutureObligationRepository();
    await repo.clear();
    const useCase = new ManageFutureObligationsUseCase(repo);

    // Gasto comprometido: Renta $10,000
    await useCase.create({
      userId: 'user_metrics',
      name: 'Renta',
      amountMinor: 1000000,
      direction: 'EXPENSE',
      certainty: 'COMMITTED',
      periodicity: 'MONTHLY',
      nextDueDate: new Date('2026-10-20T12:00:00Z'),
    });

    // Gasto esperado: Estimación de Luz $800
    await useCase.create({
      userId: 'user_metrics',
      name: 'Luz variable',
      amountMinor: 80000,
      direction: 'EXPENSE',
      certainty: 'EXPECTED',
      periodicity: 'MONTHLY',
      nextDueDate: new Date('2026-10-22T12:00:00Z'),
    });

    // Ingreso esperado: Bono $5,000
    await useCase.create({
      userId: 'user_metrics',
      name: 'Bono trimestral',
      amountMinor: 500000,
      direction: 'INCOME',
      certainty: 'EXPECTED',
      periodicity: 'QUARTERLY',
      nextDueDate: new Date('2026-10-30T12:00:00Z'),
    });

    const summary = await useCase.getUpcoming('user_metrics', 30, new Date('2026-10-15T00:00:00Z'));

    assert.strictEqual(summary.occurrences.length, 3);
    assert.strictEqual(summary.totalCommittedExpenseMinor, 1000000);
    assert.strictEqual(summary.totalExpectedExpenseMinor, 80000);
    assert.strictEqual(summary.totalExpectedIncomeMinor, 500000);
    assert.strictEqual(summary.totalCommittedIncomeMinor, 0);

    console.log('  [OK] Métricas de liquidez proyectada y certezas calculadas con precisión');
  }

  console.log('\n========================================');
  console.log('  [RESULTADO] Todas las pruebas de US-044 pasaron exitosamente (12/12).');
  console.log('========================================\n');
}
