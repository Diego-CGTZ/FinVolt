/**
 * Pruebas unitarias para US-043: Detección de Transacciones Recurrentes
 *
 * Criterios de Aceptación:
 * - Detecta salario, renta, suscripciones, préstamos y otros patrones.
 * - Periodicidad y confianza almacenadas.
 */

function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}
assert.strictEqual = (actual: unknown, expected: unknown, msg?: string) => {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${expected} but got ${actual}`);
  }
};
assert.ok = (condition: unknown, msg?: string): asserts condition => {
  if (!condition) throw new Error(msg || 'Expected truthy');
};

import type { Transaction } from '../../src/domain/models/Transaction';
import {
  RecurringTransactionDetector,
  defaultRecurringTransactionDetector,
} from '../../src/domain/services/recurring/RecurringTransactionDetector';
import {
  AsyncStorageRecurringTransactionRepository,
} from '../../src/infrastructure/database/AsyncStorageRecurringTransactionRepository';
import {
  DetectRecurringTransactionsUseCase,
} from '../../src/application/useCases/DetectRecurringTransactionsUseCase';

function createMockTx(params: {
  id: string;
  type: Transaction['type'];
  amountMinor: number;
  occurredAt: Date;
  merchant?: string;
  merchantRaw?: string;
  description?: string;
  currency?: string;
  userId?: string;
  accountId?: string;
}): Transaction {
  return {
    id: params.id,
    userId: params.userId || 'usr_test_1',
    accountId: params.accountId || 'acc_test_1',
    type: params.type,
    amountMinor: params.amountMinor,
    currency: params.currency || 'MXN',
    occurredAt: params.occurredAt,
    postedAt: params.occurredAt,
    merchant: params.merchant || null,
    merchantRaw: params.merchantRaw || params.merchant || null,
    description: params.description || null,
    categoryId: null,
    source: 'STATEMENT_PDF',
    sourceEventId: null,
    status: 'POSTED',
    confidenceScore: 100,
    fingerprint: `fp_${params.id}`,
    linkedTransactionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function runRecurringTransactionTests(): Promise<void> {
  console.log('\n--- Suite 26: US-043 Recurring Transaction Detection ---');
  console.log('[TEST] Iniciando pruebas de US-043: Detección de Transacciones Recurrentes...');

  const detector = new RecurringTransactionDetector();

  // =========================================================================
  // TEST 1: Detección de Salario / Nómina Quincenal (SALARY)
  // =========================================================================
  console.log('\n[TEST 1] Detección de Salario / Nómina Quincenal (SALARY)');
  {
    const txs: Transaction[] = [
      createMockTx({
        id: 'tx_sal_1',
        type: 'INCOME',
        amountMinor: 2500000, // $25,000.00
        occurredAt: new Date('2026-01-15T12:00:00Z'),
        description: 'DISPERSION NOMINA BBVA',
        merchant: 'BBVA Nomina',
      }),
      createMockTx({
        id: 'tx_sal_2',
        type: 'INCOME',
        amountMinor: 2500000,
        occurredAt: new Date('2026-01-30T12:00:00Z'),
        description: 'DISPERSION NOMINA BBVA',
        merchant: 'BBVA Nomina',
      }),
      createMockTx({
        id: 'tx_sal_3',
        type: 'INCOME',
        amountMinor: 2500000,
        occurredAt: new Date('2026-02-14T12:00:00Z'),
        description: 'DISPERSION NOMINA BBVA',
        merchant: 'BBVA Nomina',
      }),
    ];

    const detected = detector.detect(txs);
    assert.strictEqual(detected.length, 1, 'Debe detectar exactamente 1 recurrencia de nómina');
    const sal = detected[0];

    assert.strictEqual(sal.patternType, 'SALARY', 'El patrón debe ser SALARY');
    assert.strictEqual(sal.transactionType, 'INCOME', 'El flujo debe ser INCOME');
    assert.strictEqual(sal.periodicity, 'SEMIMONTHLY', 'La periodicidad debe ser SEMIMONTHLY');
    assert.strictEqual(sal.averageAmountMinor, 2500000, 'El monto promedio debe ser $25,000.00');
    assert.strictEqual(sal.isVariableAmount, false, 'El monto es fijo');
    assert.ok(sal.confidenceScore >= 80, `Confianza debe ser alta (>= 80): ${sal.confidenceScore}`);
    assert.strictEqual(sal.occurrenceCount, 3, 'Debe contar 3 ocurrencias');

    console.log('  [OK] Salario quincenal detectado con periodicidad y alta confianza');
  }

  // =========================================================================
  // TEST 2: Detección de Salario Semanal
  // =========================================================================
  console.log('\n[TEST 2] Detección de Salario Semanal');
  {
    const txs: Transaction[] = [
      createMockTx({
        id: 'tx_week_1',
        type: 'INCOME',
        amountMinor: 600000,
        occurredAt: new Date('2026-01-02T10:00:00Z'),
        description: 'PAGO SEMANAL SUELDO',
      }),
      createMockTx({
        id: 'tx_week_2',
        type: 'INCOME',
        amountMinor: 600000,
        occurredAt: new Date('2026-01-09T10:00:00Z'),
        description: 'PAGO SEMANAL SUELDO',
      }),
      createMockTx({
        id: 'tx_week_3',
        type: 'INCOME',
        amountMinor: 600000,
        occurredAt: new Date('2026-01-16T10:00:00Z'),
        description: 'PAGO SEMANAL SUELDO',
      }),
    ];

    const detected = detector.detect(txs);
    assert.strictEqual(detected.length, 1);
    assert.strictEqual(detected[0].patternType, 'SALARY');
    assert.strictEqual(detected[0].periodicity, 'WEEKLY', 'Periodicidad debe ser WEEKLY');
    assert.strictEqual(detected[0].intervalDays, 7);

    console.log('  [OK] Salario semanal detectado con periodicidad WEEKLY');
  }

  // =========================================================================
  // TEST 3: Detección de Renta / Alquiler Mensual (RENT)
  // =========================================================================
  console.log('\n[TEST 3] Detección de Renta / Alquiler Mensual (RENT)');
  {
    const txs: Transaction[] = [
      createMockTx({
        id: 'tx_rent_1',
        type: 'EXPENSE',
        amountMinor: 1400000, // $14,000.00
        occurredAt: new Date('2026-01-05T09:00:00Z'),
        description: 'TRANSFERENCIA PAGO RENTA DEPTO',
        merchant: 'Inmobiliaria Central',
      }),
      createMockTx({
        id: 'tx_rent_2',
        type: 'EXPENSE',
        amountMinor: 1400000,
        occurredAt: new Date('2026-02-05T09:00:00Z'),
        description: 'TRANSFERENCIA PAGO RENTA DEPTO',
        merchant: 'Inmobiliaria Central',
      }),
      createMockTx({
        id: 'tx_rent_3',
        type: 'EXPENSE',
        amountMinor: 1400000,
        occurredAt: new Date('2026-03-05T09:00:00Z'),
        description: 'TRANSFERENCIA PAGO RENTA DEPTO',
        merchant: 'Inmobiliaria Central',
      }),
    ];

    const detected = detector.detect(txs);
    assert.strictEqual(detected.length, 1);
    const rent = detected[0];

    assert.strictEqual(rent.patternType, 'RENT');
    assert.strictEqual(rent.periodicity, 'MONTHLY');
    assert.strictEqual(rent.averageAmountMinor, 1400000);
    assert.strictEqual(rent.isVariableAmount, false);
    assert.ok(rent.confidenceScore >= 85, `Confianza de renta debe ser >= 85: ${rent.confidenceScore}`);

    console.log('  [OK] Renta mensual clasificada con éxito y alta confianza');
  }

  // =========================================================================
  // TEST 4: Detección de Suscripciones Digitales (SUBSCRIPTION)
  // =========================================================================
  console.log('\n[TEST 4] Detección de Suscripciones Digitales (SUBSCRIPTION)');
  {
    const txs: Transaction[] = [
      // Netflix mensual ($249.00)
      createMockTx({
        id: 'tx_nflx_1',
        type: 'EXPENSE',
        amountMinor: 24900,
        occurredAt: new Date('2026-01-10T08:00:00Z'),
        merchant: 'Netflix',
      }),
      createMockTx({
        id: 'tx_nflx_2',
        type: 'EXPENSE',
        amountMinor: 24900,
        occurredAt: new Date('2026-02-10T08:00:00Z'),
        merchant: 'Netflix',
      }),
      createMockTx({
        id: 'tx_nflx_3',
        type: 'EXPENSE',
        amountMinor: 24900,
        occurredAt: new Date('2026-03-10T08:00:00Z'),
        merchant: 'Netflix',
      }),
      // Spotify mensual ($129.00)
      createMockTx({
        id: 'tx_spt_1',
        type: 'EXPENSE',
        amountMinor: 12900,
        occurredAt: new Date('2026-01-18T10:00:00Z'),
        merchant: 'Spotify',
      }),
      createMockTx({
        id: 'tx_spt_2',
        type: 'EXPENSE',
        amountMinor: 12900,
        occurredAt: new Date('2026-02-18T10:00:00Z'),
        merchant: 'Spotify',
      }),
    ];

    const detected = detector.detect(txs);
    assert.strictEqual(detected.length, 2, 'Debe detectar Netflix y Spotify');

    const netflix = detected.find((d) => d.merchant?.toLowerCase().includes('netflix'));
    assert.ok(netflix, 'Netflix debe estar presente');
    assert.strictEqual(netflix.patternType, 'SUBSCRIPTION');
    assert.strictEqual(netflix.periodicity, 'MONTHLY');
    assert.strictEqual(netflix.averageAmountMinor, 24900);
    assert.ok(netflix.confidenceScore >= 90, 'Confianza de suscripción debe ser >= 90');

    const spotify = detected.find((d) => d.merchant?.toLowerCase().includes('spotify'));
    assert.ok(spotify, 'Spotify debe estar presente');
    assert.strictEqual(spotify.patternType, 'SUBSCRIPTION');
    assert.strictEqual(spotify.periodicity, 'MONTHLY');
    assert.strictEqual(spotify.averageAmountMinor, 12900);

    console.log('  [OK] Suscripciones de Netflix y Spotify identificadas con éxito');
  }

  // =========================================================================
  // TEST 5: Detección de Préstamos / Créditos (LOAN)
  // =========================================================================
  console.log('\n[TEST 5] Detección de Préstamos / Créditos (LOAN)');
  {
    const txs: Transaction[] = [
      createMockTx({
        id: 'tx_loan_1',
        type: 'EXPENSE',
        amountMinor: 485000, // $4,850.00
        occurredAt: new Date('2026-01-20T14:00:00Z'),
        description: 'PAGO MENSUAL CREDITO AUTOMOTRIZ',
        merchant: 'Financiera Auto',
      }),
      createMockTx({
        id: 'tx_loan_2',
        type: 'EXPENSE',
        amountMinor: 485000,
        occurredAt: new Date('2026-02-20T14:00:00Z'),
        description: 'PAGO MENSUAL CREDITO AUTOMOTRIZ',
        merchant: 'Financiera Auto',
      }),
    ];

    const detected = detector.detect(txs);
    assert.strictEqual(detected.length, 1);
    const loan = detected[0];

    assert.strictEqual(loan.patternType, 'LOAN');
    assert.strictEqual(loan.periodicity, 'MONTHLY');
    assert.strictEqual(loan.averageAmountMinor, 485000);

    console.log('  [OK] Préstamo / Crédito automotriz clasificado como LOAN');
  }

  // =========================================================================
  // TEST 6: Detección de Servicios Públicos con Monto Variable (UTILITY)
  // =========================================================================
  console.log('\n[TEST 6] Detección de Servicios Públicos con Monto Variable (UTILITY)');
  {
    const txs: Transaction[] = [
      createMockTx({
        id: 'tx_cfe_1',
        type: 'EXPENSE',
        amountMinor: 46000, // $460.00
        occurredAt: new Date('2026-01-12T11:00:00Z'),
        description: 'CFE SUMINISTRADOR SERVICIOS BASICOS',
        merchant: 'CFE',
      }),
      createMockTx({
        id: 'tx_cfe_2',
        type: 'EXPENSE',
        amountMinor: 53500, // $535.00 (monto variable)
        occurredAt: new Date('2026-03-12T11:00:00Z'), // bimestral (~60 días)
        description: 'CFE SUMINISTRADOR SERVICIOS BASICOS',
        merchant: 'CFE',
      }),
    ];

    const detected = detector.detect(txs);
    assert.strictEqual(detected.length, 1);
    const util = detected[0];

    assert.strictEqual(util.patternType, 'UTILITY');
    assert.strictEqual(util.periodicity, 'BIMONTHLY');
    assert.strictEqual(util.isVariableAmount, true, 'El monto debe marcarse como variable');
    assert.ok(util.averageAmountMinor > 46000 && util.averageAmountMinor < 53500);

    console.log('  [OK] Servicio público CFE detectado como UTILITY bimestral y monto variable');
  }

  // =========================================================================
  // TEST 7: Detección de Otros Patrones Recurrentes Genéricos (OTHER)
  // =========================================================================
  console.log('\n[TEST 7] Detección de Otros Patrones Recurrentes Genéricos (OTHER)');
  {
    const txs: Transaction[] = [
      createMockTx({
        id: 'tx_gym_1',
        type: 'EXPENSE',
        amountMinor: 80000,
        occurredAt: new Date('2026-01-01T12:00:00Z'),
        description: 'CLUB DEPORTIVO LOCAL MENSUAL',
      }),
      createMockTx({
        id: 'tx_gym_2',
        type: 'EXPENSE',
        amountMinor: 80000,
        occurredAt: new Date('2026-02-01T12:00:00Z'),
        description: 'CLUB DEPORTIVO LOCAL MENSUAL',
      }),
      createMockTx({
        id: 'tx_gym_3',
        type: 'EXPENSE',
        amountMinor: 80000,
        occurredAt: new Date('2026-03-01T12:00:00Z'),
        description: 'CLUB DEPORTIVO LOCAL MENSUAL',
      }),
    ];

    const detected = detector.detect(txs);
    assert.strictEqual(detected.length, 1);
    assert.strictEqual(detected[0].periodicity, 'MONTHLY');
    assert.ok(
      detected[0].patternType === 'SUBSCRIPTION' || detected[0].patternType === 'OTHER',
      'Debe categorizarse en suscripción u otro patrón periódico',
    );

    console.log('  [OK] Patrón genérico periódico detectado con éxito');
  }

  // =========================================================================
  // TEST 8: Cálculo y Almacenamiento de Confianza y Periodicidad (AC)
  // =========================================================================
  console.log('\n[TEST 8] Cálculo y Almacenamiento de Confianza y Periodicidad (AC)');
  {
    const highlyRegular: Transaction[] = [
      createMockTx({
        id: 'tx_reg_1',
        type: 'EXPENSE',
        amountMinor: 10000,
        occurredAt: new Date('2026-01-01T10:00:00Z'),
        merchant: 'Servicio Exacto',
      }),
      createMockTx({
        id: 'tx_reg_2',
        type: 'EXPENSE',
        amountMinor: 10000,
        occurredAt: new Date('2026-01-08T10:00:00Z'),
        merchant: 'Servicio Exacto',
      }),
      createMockTx({
        id: 'tx_reg_3',
        type: 'EXPENSE',
        amountMinor: 10000,
        occurredAt: new Date('2026-01-15T10:00:00Z'),
        merchant: 'Servicio Exacto',
      }),
      createMockTx({
        id: 'tx_reg_4',
        type: 'EXPENSE',
        amountMinor: 10000,
        occurredAt: new Date('2026-01-22T10:00:00Z'),
        merchant: 'Servicio Exacto',
      }),
    ];

    const result = detector.detect(highlyRegular);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].periodicity, 'WEEKLY');
    assert.ok(result[0].confidenceScore >= 85, `Confianza debe ser muy alta: ${result[0].confidenceScore}`);
    assert.strictEqual(result[0].isVariableAmount, false);

    console.log('  [OK] Métricas de confianza y periodicidad calculadas y almacenadas');
  }

  // =========================================================================
  // TEST 9: Cálculo de Próxima Ocurrencia Estimada (nextExpectedOccurrence)
  // =========================================================================
  console.log('\n[TEST 9] Cálculo de Próxima Ocurrencia Estimada (nextExpectedOccurrence)');
  {
    const txs: Transaction[] = [
      createMockTx({
        id: 'tx_nxt_1',
        type: 'EXPENSE',
        amountMinor: 50000,
        occurredAt: new Date('2026-01-15T12:00:00Z'),
        merchant: 'Apple Services',
      }),
      createMockTx({
        id: 'tx_nxt_2',
        type: 'EXPENSE',
        amountMinor: 50000,
        occurredAt: new Date('2026-02-15T12:00:00Z'),
        merchant: 'Apple Services',
      }),
    ];

    const detected = detector.detect(txs);
    assert.strictEqual(detected.length, 1);
    const apple = detected[0];

    const nextDate = new Date(apple.nextExpectedOccurrence);
    assert.strictEqual(nextDate.getMonth(), 2, 'El mes próximo debe ser marzo (2)');
    assert.strictEqual(nextDate.getDate(), 15, 'El día debe ser el 15');

    console.log('  [OK] Próxima ocurrencia proyectada con precisión matemática');
  }

  // =========================================================================
  // TEST 10: Tolerancia a Fines de Semana y Días Inhábiles Bancarios
  // =========================================================================
  console.log('\n[TEST 10] Tolerancia a Fines de Semana y Días Inhábiles Bancarios');
  {
    // Supongamos fechas de pago que varían por caer en sábado/domingo:
    // 15 de enero (jueves) -> 13 de febrero (viernes previo a fin de semana)
    const txs: Transaction[] = [
      createMockTx({
        id: 'tx_tol_1',
        type: 'EXPENSE',
        amountMinor: 99900,
        occurredAt: new Date('2026-01-15T12:00:00Z'),
        merchant: 'Membresia Total',
      }),
      createMockTx({
        id: 'tx_tol_2',
        type: 'EXPENSE',
        amountMinor: 99900,
        occurredAt: new Date('2026-02-13T12:00:00Z'), // 29 días en lugar de 30 o 31
        merchant: 'Membresia Total',
      }),
    ];

    const detected = detector.detect(txs, undefined, { toleranceDays: 3 });
    assert.strictEqual(detected.length, 1, 'Debe tolerar la variación de 2 días de fin de semana');
    assert.strictEqual(detected[0].periodicity, 'MONTHLY');

    console.log('  [OK] Tolerancia a desfases de calendario verificada exitosamente');
  }

  // =========================================================================
  // TEST 11: Persistencia y Operaciones CRUD en Repositorio
  // =========================================================================
  console.log('\n[TEST 11] Persistencia y Operaciones CRUD en Repositorio');
  {
    const repo = new AsyncStorageRecurringTransactionRepository();
    await repo.clear();

    const sampleRecurring = detector.detect([
      createMockTx({
        id: 'tx_crud_1',
        type: 'EXPENSE',
        amountMinor: 20000,
        occurredAt: new Date('2026-01-01T10:00:00Z'),
        merchant: 'GitHub Copilot',
      }),
      createMockTx({
        id: 'tx_crud_2',
        type: 'EXPENSE',
        amountMinor: 20000,
        occurredAt: new Date('2026-02-01T10:00:00Z'),
        merchant: 'GitHub Copilot',
      }),
    ])[0];

    assert.ok(sampleRecurring);

    // Guardar
    await repo.save(sampleRecurring);

    // Buscar por ID
    const found = await repo.findById(sampleRecurring.id);
    assert.ok(found);
    assert.strictEqual(found.name, sampleRecurring.name);
    assert.strictEqual(found.periodicity, 'MONTHLY');

    // Buscar por UserId
    const userList = await repo.findByUserId(sampleRecurring.userId);
    assert.strictEqual(userList.length, 1);

    // Buscar por PatternType
    const subs = await repo.findByPatternType(sampleRecurring.userId, 'SUBSCRIPTION');
    assert.strictEqual(subs.length, 1);

    // Eliminar
    await repo.delete(sampleRecurring.id);
    const afterDelete = await repo.findById(sampleRecurring.id);
    assert.strictEqual(afterDelete, null);

    console.log('  [OK] Operaciones CRUD de repositorio AsyncStorage/Memoria validadas');
  }

  // =========================================================================
  // TEST 12: Orquestación de Extremo a Extremo en DetectRecurringTransactionsUseCase
  // =========================================================================
  console.log('\n[TEST 12] Orquestación de Extremo a Extremo en DetectRecurringTransactionsUseCase');
  {
    const repo = new AsyncStorageRecurringTransactionRepository();
    await repo.clear();

    const mixedTxs: Transaction[] = [
      // Nómina
      createMockTx({
        id: 'm_sal_1',
        type: 'INCOME',
        amountMinor: 3000000,
        occurredAt: new Date('2026-01-15T12:00:00Z'),
        description: 'NOMINA EMPRESA',
      }),
      createMockTx({
        id: 'm_sal_2',
        type: 'INCOME',
        amountMinor: 3000000,
        occurredAt: new Date('2026-01-31T12:00:00Z'),
        description: 'NOMINA EMPRESA',
      }),
      // Renta
      createMockTx({
        id: 'm_rnt_1',
        type: 'EXPENSE',
        amountMinor: 1200000,
        occurredAt: new Date('2026-01-02T12:00:00Z'),
        description: 'PAGO RENTA',
      }),
      createMockTx({
        id: 'm_rnt_2',
        type: 'EXPENSE',
        amountMinor: 1200000,
        occurredAt: new Date('2026-02-02T12:00:00Z'),
        description: 'PAGO RENTA',
      }),
      // Transacción aislada (NO periódica)
      createMockTx({
        id: 'm_single_1',
        type: 'EXPENSE',
        amountMinor: 75000,
        occurredAt: new Date('2026-01-20T18:00:00Z'),
        description: 'CENA RESTAURANTE',
      }),
    ];

    const useCase = new DetectRecurringTransactionsUseCase(undefined, repo, detector);
    const result = await useCase.execute({
      userId: 'usr_test_1',
      transactions: mixedTxs,
      persist: true,
    });

    assert.strictEqual(result.recurringTransactions.length, 2, 'Solo debe detectar nómina y renta');
    assert.strictEqual(result.summary.totalDetected, 2);
    assert.strictEqual(result.summary.byPatternType.SALARY, 1);
    assert.strictEqual(result.summary.byPatternType.RENT, 1);
    assert.ok(result.summary.estimatedMonthlyIncomeMinor > 0, 'Debe estimar ingreso mensual');
    assert.ok(result.summary.estimatedMonthlyExpenseMinor > 0, 'Debe estimar egreso mensual');

    // Verificar que se persistió en el repositorio
    const persisted = await repo.findByUserId('usr_test_1');
    assert.strictEqual(persisted.length, 2);

    console.log('  [OK] Caso de uso orquestó detección, filtrado de no recurrentes y resumen');
  }

  console.log('\n[RESULTADO] Todas las pruebas de US-043 pasaron exitosamente (12/12).');
}
