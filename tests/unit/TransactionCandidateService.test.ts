// Helper de aserciones sin dependencias externas para compatibilidad con tsx
function assert(condition: any, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}
assert.strictEqual = (actual: any, expected: any, msg?: string) => {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${expected} but got ${actual}`);
  }
};
assert.deepStrictEqual = (actual: any, expected: any, msg?: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(msg || `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
};
assert.ok = (condition: any, msg?: string) => {
  if (!condition) throw new Error(msg || 'Expected truthy');
};
assert.rejects = async (fn: () => Promise<any>, errorRegex: RegExp) => {
  try {
    await fn();
    throw new Error('Expected promise to reject');
  } catch (err: any) {
    if (!errorRegex.test(err.message)) {
      throw new Error(`Expected error matching ${errorRegex} but got: ${err.message}`);
    }
  }
};

import { TransactionCandidateService } from '../../src/domain/services/TransactionCandidateService';
import { InMemoryTransactionCandidateRepository } from '../../src/infrastructure/database/InMemoryTransactionCandidateRepository';
import type { CreateCandidateDTO } from '../../src/domain/models/TransactionCandidate';

export async function runTransactionCandidateServiceTests() {
  console.log('[TEST] Iniciando pruebas de US-023: Transaction Candidate...');

  const repository = new InMemoryTransactionCandidateRepository();
  const service = new TransactionCandidateService(repository);

  // --------------------------------------------------------------------------
  // TEST 1: Creación y normalización completa de TransactionCandidate
  // --------------------------------------------------------------------------
  console.log('\n[TEST 1] Creación y normalización completa de TransactionCandidate');
  repository.clear();

  const candidateDto: CreateCandidateDTO = {
    userId: 'user-abc',
    rawEventId: 'raw-evt-12345',
    source: 'ANDROID_NOTIFICATION',
    provider: 'BBVA',
    amount: 349.5,
    currency: 'MXN',
    type: 'EXPENSE',
    merchantRaw: 'WALMART SUPER CDMX',
    merchant: 'Walmart',
    confidenceScore: 92,
    accountHint: {
      last4Digits: '4321',
      accountType: 'DEBIT',
    },
    rawPayload: { title: 'BBVA', text: 'Compra de $349.50' },
    metadata: { appPackage: 'com.bbva.bbvacontigo' },
  };

  const created = await service.createCandidate(candidateDto);

  assert.ok(created.id, 'Debe generar un ID único para el candidato');
  assert.strictEqual(created.rawEventId, 'raw-evt-12345');
  assert.strictEqual(created.source, 'ANDROID_NOTIFICATION');
  assert.strictEqual(created.provider, 'BBVA');
  assert.strictEqual(created.amount, 349.5);
  assert.strictEqual(created.amountMinor, 34950, 'El monto en centavos debe calcularse exactamente (349.50 * 100)');
  assert.strictEqual(created.currency, 'MXN');
  assert.strictEqual(created.type, 'EXPENSE');
  assert.strictEqual(created.merchantRaw, 'WALMART SUPER CDMX');
  assert.strictEqual(created.merchant, 'Walmart');
  assert.strictEqual(created.confidenceScore, 92);
  assert.strictEqual(created.status, 'PENDING_REVIEW', 'El estado inicial debe ser PENDING_REVIEW');
  assert.strictEqual(created.accountHint?.last4Digits, '4321');
  assert.strictEqual(created.accountHint?.accountType, 'DEBIT');
  assert.ok(created.rawPayload.text, 'El payload original debe ser preservado');
  console.log('  [OK] Candidato estructurado creado y normalizado correctamente');

  // --------------------------------------------------------------------------
  // TEST 2: Validaciones de integridad y rechazo de datos inválidos
  // --------------------------------------------------------------------------
  console.log('\n[TEST 2] Validaciones de integridad y rechazo de datos inválidos');

  // Monto menor o igual a 0
  await assert.rejects(
    () =>
      service.createCandidate({
        ...candidateDto,
        amount: -50,
      }),
    /El monto debe ser un número positivo mayor a 0/,
  );

  // ConfidenceScore fuera del rango [0, 100]
  await assert.rejects(
    () =>
      service.createCandidate({
        ...candidateDto,
        confidenceScore: 105,
      }),
    /El score de confianza.*debe estar entre 0 y 100/,
  );

  // rawEventId ausente
  await assert.rejects(
    () =>
      service.createCandidate({
        ...candidateDto,
        rawEventId: '',
      }),
    /El campo rawEventId es obligatorio/,
  );

  // provider ausente
  await assert.rejects(
    () =>
      service.createCandidate({
        ...candidateDto,
        provider: '   ',
      }),
    /El proveedor financiero es requerido/,
  );
  console.log('  [OK] Reglas de validación e integridad forzadas exitosamente');

  // --------------------------------------------------------------------------
  // TEST 3: Auto-confirmación condicional basada en score de confianza
  // --------------------------------------------------------------------------
  console.log('\n[TEST 3] Auto-confirmación condicional por umbral de confianza');
  repository.clear();

  const highConfidenceCand = await service.createCandidate({
    ...candidateDto,
    confidenceScore: 95,
  });
  const lowConfidenceCand = await service.createCandidate({
    ...candidateDto,
    rawEventId: 'raw-evt-low',
    confidenceScore: 75,
  });

  const autoConfirmed = await service.autoConfirmIfEligible(highConfidenceCand.id, 90);
  assert.strictEqual(autoConfirmed.status, 'AUTO_CONFIRMED', 'Candidato con score 95 debe auto-confirmarse');

  const unchanged = await service.autoConfirmIfEligible(lowConfidenceCand.id, 90);
  assert.strictEqual(unchanged.status, 'PENDING_REVIEW', 'Candidato con score 75 debe permanecer en PENDING_REVIEW');
  console.log('  [OK] Reglas de auto-confirmación condicional verificadas');

  // --------------------------------------------------------------------------
  // TEST 4: Ciclo de vida: Rechazo, reactivación y reconciliación
  // --------------------------------------------------------------------------
  console.log('\n[TEST 4] Ciclo de vida: Rechazo, reactivación y reconciliación');
  repository.clear();

  const c1 = await service.createCandidate(candidateDto);
  assert.strictEqual(c1.status, 'PENDING_REVIEW');

  // Rechazo con motivo
  const rejected = await service.rejectCandidate(c1.id, 'Transacción personal no deseada');
  assert.strictEqual(rejected.status, 'REJECTED');
  assert.strictEqual(rejected.metadata.rejectionReason, 'Transacción personal no deseada');
  assert.ok(service.isFinalized(rejected), 'El candidato rechazado se considera finalizado');

  // Reactivación
  const reopened = await service.reopenCandidate(c1.id);
  assert.strictEqual(reopened.status, 'PENDING_REVIEW');
  assert.strictEqual(service.isFinalized(reopened), false);

  // Reconciliación
  const reconciled = await service.reconcileCandidate(c1.id);
  assert.strictEqual(reconciled.status, 'RECONCILED');
  assert.ok(service.isFinalized(reconciled), 'El candidato reconciliado se considera finalizado');
  console.log('  [OK] Transiciones de ciclo de vida ejecutadas correctamente');

  // --------------------------------------------------------------------------
  // TEST 5: Prevención de transiciones inválidas
  // --------------------------------------------------------------------------
  console.log('\n[TEST 5] Prevención de transiciones de estado no permitidas');
  repository.clear();

  const c2 = await service.createCandidate(candidateDto);
  await service.reconcileCandidate(c2.id);

  // No se puede rechazar si ya está reconciliado
  await assert.rejects(
    () => service.rejectCandidate(c2.id),
    /No se puede rechazar un candidato que ya ha sido formalmente reconciliado/,
  );

  const c3 = await service.createCandidate({
    ...candidateDto,
    rawEventId: 'raw-c3',
  });
  await service.rejectCandidate(c3.id);

  // No se puede reconciliar directo si está rechazado
  await assert.rejects(
    () => service.reconcileCandidate(c3.id),
    /No se puede reconciliar un candidato en estado REJECTED/,
  );
  console.log('  [OK] Estado protegido contra transiciones anómalas');

  // --------------------------------------------------------------------------
  // TEST 6: Filtros, búsqueda y conteo de candidatos
  // --------------------------------------------------------------------------
  console.log('\n[TEST 6] Filtros, búsqueda avanzada y conteo');
  repository.clear();

  await service.createCandidate({
    ...candidateDto,
    rawEventId: 'raw-bbva-1',
    provider: 'BBVA',
    confidenceScore: 95,
  });
  await service.createCandidate({
    ...candidateDto,
    rawEventId: 'raw-bbva-2',
    provider: 'BBVA',
    confidenceScore: 80,
  });
  await service.createCandidate({
    ...candidateDto,
    rawEventId: 'raw-nu-1',
    provider: 'NU',
    confidenceScore: 88,
  });

  const total = await service.countCandidates();
  assert.strictEqual(total, 3, 'Debe haber 3 candidatos en total');

  const bbvaOnly = await service.getCandidates({ provider: 'BBVA' });
  assert.strictEqual(bbvaOnly.length, 2, 'Debe haber 2 candidatos de BBVA');

  const highConf = await service.getCandidates({ minConfidence: 90 });
  assert.strictEqual(highConf.length, 1, 'Solo 1 candidato supera o iguala 90 de confianza');

  const pendingList = await service.getPendingReviewCandidates();
  assert.strictEqual(pendingList.length, 3, 'Todos deben figurar como pendientes de revisión');
  console.log('  [OK] Filtros por proveedor, umbral de confianza y conteo verificados');

  // --------------------------------------------------------------------------
  // TEST 7: Invariante Crítica: Desacoplamiento total con tabla `transactions`
  // --------------------------------------------------------------------------
  console.log('\n[TEST 7] Invariante Crítica: Desacoplamiento de transactions');

  // Verificamos que el modelo TransactionCandidate no requiere accountId obligatorio
  // ni claves foráneas de transactions, y que operar sobre el candidato es 100% aislado.
  const cand = await service.createCandidate(candidateDto);
  assert.ok(cand.id);
  assert.strictEqual((cand as any).accountId, undefined, 'El candidato no debe obligar a vincular accountId contable');
  assert.strictEqual((cand as any).transactionId, undefined, 'El candidato no es una transacción final');
  console.log('  [OK] Invariante cumplida: TransactionCandidate es una capa intermedia completamente desacoplada');

  console.log('\n[DONE] ¡Todos los tests de US-023 pasaron exitosamente (7/7)!');
}
