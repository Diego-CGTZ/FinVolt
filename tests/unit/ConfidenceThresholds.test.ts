/**
 * Pruebas unitarias para US-030: Thresholds de Confianza
 *
 * Acceptance Criteria:
 * - ≥90: auto confirm
 * - 70-89: register + review
 * - <70: require user
 * - thresholds configurables
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
assert.deepStrictEqual = (actual: unknown, expected: unknown, msg?: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(msg || `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
};
assert.ok = (condition: unknown, msg?: string): asserts condition => {
  if (!condition) throw new Error(msg || 'Expected truthy');
};

import {
  ConfidenceThresholdService,
  DEFAULT_CONFIDENCE_THRESHOLDS,
  type ConfidenceThresholds,
} from '../../src/domain/services/confidence/ConfidenceThresholdService';
import { ConfidenceScoringService } from '../../src/domain/services/confidence/ConfidenceScoringService';
import { TransactionCandidateService } from '../../src/domain/services/TransactionCandidateService';
import { InMemoryTransactionCandidateRepository } from '../../src/infrastructure/database/InMemoryTransactionCandidateRepository';
import type { TransactionCandidate } from '../../src/domain/models/TransactionCandidate';
import type { Transaction } from '../../src/domain/models/Transaction';

function createMockCandidate(overrides: Partial<TransactionCandidate> = {}): TransactionCandidate {
  const now = new Date();
  return {
    id: overrides.id || `cand-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId: overrides.userId || 'user-test-123',
    rawEventId: overrides.rawEventId || 'raw-123',
    source: overrides.source || 'ANDROID_NOTIFICATION',
    provider: overrides.provider || 'BBVA',
    amountMinor: overrides.amountMinor || 25000,
    amount: overrides.amount || 250.0,
    currency: overrides.currency || 'MXN',
    type: overrides.type || 'EXPENSE',
    merchantRaw: overrides.merchantRaw || 'OXXO PEDREGAL',
    merchant: overrides.merchant || 'Oxxo',
    occurredAt: overrides.occurredAt || now,
    confidenceScore: overrides.confidenceScore ?? 80,
    status: overrides.status || 'PENDING_REVIEW',
    rawPayload: overrides.rawPayload || {},
    metadata: overrides.metadata || {},
    createdAt: now,
    updatedAt: now,
  };
}

function createMockTransaction(overrides: Partial<Transaction> = {}): Transaction {
  const now = new Date();
  return {
    id: overrides.id || `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId: overrides.userId || 'user-test-123',
    accountId: overrides.accountId || 'acc-123',
    type: overrides.type || 'EXPENSE',
    amountMinor: overrides.amountMinor || 25000,
    currency: overrides.currency || 'MXN',
    source: overrides.source || 'NOTIFICATION',
    status: overrides.status || 'CANDIDATE',
    occurredAt: overrides.occurredAt || now,
    postedAt: overrides.postedAt !== undefined ? overrides.postedAt : null,
    merchantRaw: overrides.merchantRaw !== undefined ? overrides.merchantRaw : 'OXXO',
    merchant: overrides.merchant !== undefined ? overrides.merchant : 'Oxxo',
    description: overrides.description !== undefined ? overrides.description : null,
    categoryId: overrides.categoryId !== undefined ? overrides.categoryId : null,
    sourceEventId: overrides.sourceEventId !== undefined ? overrides.sourceEventId : null,
    confidenceScore: overrides.confidenceScore ?? 80,
    fingerprint: overrides.fingerprint !== undefined ? overrides.fingerprint : null,
    linkedTransactionId: overrides.linkedTransactionId !== undefined ? overrides.linkedTransactionId : null,
    metadata: overrides.metadata || {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export async function runConfidenceThresholdsTests(): Promise<void> {
  console.log('[TEST] Iniciando pruebas de US-030: Thresholds de Confianza...\n');

  // Asegurar estado inicial limpio
  ConfidenceThresholdService.resetGlobalThresholds();

  // ── TEST 1: Criterio AC: ≥90 auto confirm ──────────────────────────────────
  console.log('[TEST 1] Criterio AC: ≥90 auto confirm');
  {
    const scores = [90, 91, 95, 99, 100];
    for (const score of scores) {
      const decision = ConfidenceThresholdService.evaluate(score);

      assert.strictEqual(decision.action, 'AUTO_CONFIRM', `Score ${score} debe ser AUTO_CONFIRM`);
      assert.strictEqual(decision.isAutoConfirm, true);
      assert.strictEqual(decision.isRegisterAndReview, false);
      assert.strictEqual(decision.isRequireUser, false);
      assert.strictEqual(decision.recommendedCandidateStatus, 'AUTO_CONFIRMED');
      assert.strictEqual(decision.recommendedTransactionStatus, 'CONFIRMED');
      assert.strictEqual(decision.requiresReview, false);
      assert.strictEqual(decision.requiresUserApproval, false);
      assert.ok(decision.reason.includes('auto-confirmación'));
    }

    console.log('  [OK] Scores ≥90 dictaminan AUTO_CONFIRM sin requerir intervención del usuario');
  }

  // ── TEST 2: Criterio AC: 70-89 register + review ───────────────────────────
  console.log('\n[TEST 2] Criterio AC: 70-89 register + review');
  {
    const scores = [70, 71, 75, 80, 85, 88, 89];
    for (const score of scores) {
      const decision = ConfidenceThresholdService.evaluate(score);

      assert.strictEqual(
        decision.action,
        'REGISTER_AND_REVIEW',
        `Score ${score} debe ser REGISTER_AND_REVIEW`,
      );
      assert.strictEqual(decision.isAutoConfirm, false);
      assert.strictEqual(decision.isRegisterAndReview, true);
      assert.strictEqual(decision.isRequireUser, false);
      assert.strictEqual(decision.recommendedCandidateStatus, 'PENDING_REVIEW');
      assert.strictEqual(decision.recommendedTransactionStatus, 'PENDING');
      assert.strictEqual(decision.requiresReview, true);
      assert.strictEqual(decision.requiresUserApproval, false);
      assert.ok(decision.reason.includes('revisión'));
    }

    console.log('  [OK] Scores en 70-89 dictaminan REGISTER_AND_REVIEW correctamente');
  }

  // ── TEST 3: Criterio AC: <70 require user ──────────────────────────────────
  console.log('\n[TEST 3] Criterio AC: <70 require user');
  {
    const scores = [0, 15, 30, 50, 65, 68, 69];
    for (const score of scores) {
      const decision = ConfidenceThresholdService.evaluate(score);

      assert.strictEqual(decision.action, 'REQUIRE_USER', `Score ${score} debe ser REQUIRE_USER`);
      assert.strictEqual(decision.isAutoConfirm, false);
      assert.strictEqual(decision.isRegisterAndReview, false);
      assert.strictEqual(decision.isRequireUser, true);
      assert.strictEqual(decision.recommendedCandidateStatus, 'PENDING_REVIEW');
      assert.strictEqual(decision.recommendedTransactionStatus, 'CANDIDATE');
      assert.strictEqual(decision.requiresReview, true);
      assert.strictEqual(decision.requiresUserApproval, true);
      assert.ok(decision.reason.includes('usuario'));
    }

    console.log('  [OK] Scores <70 dictaminan REQUIRE_USER exigiendo aprobación explícita');
  }

  // ── TEST 4: Límites exactos y tolerancia en fronteras (Boundary Tests) ──────
  console.log('\n[TEST 4] Límites exactos y fronteras (69.9, 70, 89.9, 90, 0, 100)');
  {
    // Frontera 70
    const below70 = ConfidenceThresholdService.evaluate(69);
    assert.strictEqual(below70.action, 'REQUIRE_USER');

    const exact70 = ConfidenceThresholdService.evaluate(70);
    assert.strictEqual(exact70.action, 'REGISTER_AND_REVIEW');

    // Frontera 90
    const below90 = ConfidenceThresholdService.evaluate(89);
    assert.strictEqual(below90.action, 'REGISTER_AND_REVIEW');

    const exact90 = ConfidenceThresholdService.evaluate(90);
    assert.strictEqual(exact90.action, 'AUTO_CONFIRM');

    // Redondeo de decimales
    const float69_4 = ConfidenceThresholdService.evaluate(69.4); // Redondea a 69
    assert.strictEqual(float69_4.action, 'REQUIRE_USER');

    const float69_6 = ConfidenceThresholdService.evaluate(69.6); // Redondea a 70
    assert.strictEqual(float69_6.action, 'REGISTER_AND_REVIEW');

    const float89_6 = ConfidenceThresholdService.evaluate(89.6); // Redondea a 90
    assert.strictEqual(float89_6.action, 'AUTO_CONFIRM');

    // Extremos acotados
    const negativeScore = ConfidenceThresholdService.evaluate(-25);
    assert.strictEqual(negativeScore.score, 0);
    assert.strictEqual(negativeScore.action, 'REQUIRE_USER');

    const overflowScore = ConfidenceThresholdService.evaluate(150);
    assert.strictEqual(overflowScore.score, 100);
    assert.strictEqual(overflowScore.action, 'AUTO_CONFIRM');

    console.log('  [OK] Límites exactos y fronteras respetados rigurosamente');
  }

  // ── TEST 5: Umbrales configurables ad-hoc por evaluación ───────────────────
  console.log('\n[TEST 5] Umbrales configurables por evaluación (Ad-hoc overrides)');
  {
    // Configuración permisiva: autoConfirm = 80, review = 50
    const permissiveThresholds: ConfidenceThresholds = { autoConfirm: 80, review: 50 };

    const score82 = ConfidenceThresholdService.evaluate(82, permissiveThresholds);
    assert.strictEqual(score82.action, 'AUTO_CONFIRM');

    const score65 = ConfidenceThresholdService.evaluate(65, permissiveThresholds);
    assert.strictEqual(score65.action, 'REGISTER_AND_REVIEW');

    const score45 = ConfidenceThresholdService.evaluate(45, permissiveThresholds);
    assert.strictEqual(score45.action, 'REQUIRE_USER');

    // Configuración estricta: autoConfirm = 98, review = 85
    const strictThresholds: ConfidenceThresholds = { autoConfirm: 98, review: 85 };

    const score92 = ConfidenceThresholdService.evaluate(92, strictThresholds);
    assert.strictEqual(score92.action, 'REGISTER_AND_REVIEW'); // Con default sería AUTO_CONFIRM

    const score80 = ConfidenceThresholdService.evaluate(80, strictThresholds);
    assert.strictEqual(score80.action, 'REQUIRE_USER'); // Con default sería REGISTER_AND_REVIEW

    console.log('  [OK] Sobrescritura ad-hoc de umbrales en evaluate() verificada');
  }

  // ── TEST 6: Umbrales configurables a nivel de instancia ────────────────────
  console.log('\n[TEST 6] Umbrales configurables a nivel de instancia');
  {
    const instanceService = new ConfidenceThresholdService({
      autoConfirm: 85,
      review: 60,
    });

    const current = instanceService.getThresholds();
    assert.strictEqual(current.autoConfirm, 85);
    assert.strictEqual(current.review, 60);

    const decision86 = instanceService.evaluate(86);
    assert.strictEqual(decision86.action, 'AUTO_CONFIRM');

    const decision70 = instanceService.evaluate(70);
    assert.strictEqual(decision70.action, 'REGISTER_AND_REVIEW');

    const decision55 = instanceService.evaluate(55);
    assert.strictEqual(decision55.action, 'REQUIRE_USER');

    // Actualización dinámica de la instancia
    instanceService.setThresholds({ autoConfirm: 95 });
    assert.strictEqual(instanceService.getThresholds().autoConfirm, 95);
    assert.strictEqual(instanceService.getThresholds().review, 60);

    const decision90 = instanceService.evaluate(90);
    assert.strictEqual(decision90.action, 'REGISTER_AND_REVIEW');

    // Verificar que los umbrales globales no fueron alterados
    const globalT = ConfidenceThresholdService.getGlobalThresholds();
    assert.strictEqual(globalT.autoConfirm, DEFAULT_CONFIDENCE_THRESHOLDS.autoConfirm);
    assert.strictEqual(globalT.review, DEFAULT_CONFIDENCE_THRESHOLDS.review);

    console.log('  [OK] Instancias con umbrales independientes funcionan aisladas');
  }

  // ── TEST 7: Umbrales configurables globalmente en runtime ───────────────────
  console.log('\n[TEST 7] Umbrales configurables globalmente en runtime');
  {
    ConfidenceThresholdService.setGlobalThresholds({
      autoConfirm: 92,
      review: 75,
    });

    const updated = ConfidenceThresholdService.getGlobalThresholds();
    assert.strictEqual(updated.autoConfirm, 92);
    assert.strictEqual(updated.review, 75);

    // Score 90 ahora debe ser REGISTER_AND_REVIEW porque el umbral global subió a 92
    const decision90 = ConfidenceThresholdService.evaluate(90);
    assert.strictEqual(decision90.action, 'REGISTER_AND_REVIEW');

    // Score 72 ahora debe ser REQUIRE_USER porque el umbral global de revisión subió a 75
    const decision72 = ConfidenceThresholdService.evaluate(72);
    assert.strictEqual(decision72.action, 'REQUIRE_USER');

    // Restablecer valores originales
    ConfidenceThresholdService.resetGlobalThresholds();
    const restored = ConfidenceThresholdService.getGlobalThresholds();
    assert.strictEqual(restored.autoConfirm, 90);
    assert.strictEqual(restored.review, 70);

    // Tras el reset, 90 vuelve a ser AUTO_CONFIRM
    assert.strictEqual(ConfidenceThresholdService.evaluate(90).action, 'AUTO_CONFIRM');

    console.log('  [OK] Modificación y restablecimiento global de umbrales verificado');
  }

  // ── TEST 8: Validación rigurosa de umbrales inválidos ───────────────────────
  console.log('\n[TEST 8] Validación de umbrales incoherentes o fuera de rango');
  {
    // Inversión: review > autoConfirm
    const inverted = ConfidenceThresholdService.validateThresholds({ autoConfirm: 70, review: 85 });
    assert.strictEqual(inverted.isValid, false);
    assert.ok(inverted.errors.some((e) => e.includes('no puede ser mayor')));

    // Valores mayores a 100
    const outOfBoundsHigh = ConfidenceThresholdService.validateThresholds({ autoConfirm: 120, review: 70 });
    assert.strictEqual(outOfBoundsHigh.isValid, false);

    // Valores menores a 0
    const outOfBoundsLow = ConfidenceThresholdService.validateThresholds({ autoConfirm: 90, review: -5 });
    assert.strictEqual(outOfBoundsLow.isValid, false);

    // Tipos no numéricos
    const notANumber = ConfidenceThresholdService.validateThresholds({ autoConfirm: NaN, review: 70 });
    assert.strictEqual(notANumber.isValid, false);

    // Lanzamiento de excepción ante configuración inválida
    let threw = false;
    try {
      ConfidenceThresholdService.setGlobalThresholds({ autoConfirm: 50, review: 80 });
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, true, 'Debe lanzar excepción si los umbrales son inconsistentes');

    console.log('  [OK] Rechazo riguroso de umbrales inválidos o invertidos validado');
  }

  // ── TEST 9: Evaluación y mutación sobre TransactionCandidate ────────────────
  console.log('\n[TEST 9] Evaluación y mutación controlada sobre TransactionCandidate');
  {
    // Caso 1: Candidato con alta confianza (95)
    const highCand = createMockCandidate({ confidenceScore: 95, status: 'PENDING_REVIEW' });
    const appliedHigh = ConfidenceThresholdService.applyToCandidate(highCand);
    assert.strictEqual(appliedHigh.status, 'AUTO_CONFIRMED');
    assert.strictEqual(appliedHigh.metadata.confidenceAction, 'AUTO_CONFIRM');
    assert.strictEqual(appliedHigh.metadata.requiresReview, false);

    // Caso 2: Candidato con confianza media (78)
    const medCand = createMockCandidate({ confidenceScore: 78, status: 'PENDING_REVIEW' });
    const appliedMed = ConfidenceThresholdService.applyToCandidate(medCand);
    assert.strictEqual(appliedMed.status, 'PENDING_REVIEW');
    assert.strictEqual(appliedMed.metadata.confidenceAction, 'REGISTER_AND_REVIEW');
    assert.strictEqual(appliedMed.metadata.requiresReview, true);
    assert.strictEqual(appliedMed.metadata.requiresUserApproval, false);

    // Caso 3: Candidato con baja confianza (45)
    const lowCand = createMockCandidate({ confidenceScore: 45, status: 'PENDING_REVIEW' });
    const appliedLow = ConfidenceThresholdService.applyToCandidate(lowCand);
    assert.strictEqual(appliedLow.status, 'PENDING_REVIEW');
    assert.strictEqual(appliedLow.metadata.confidenceAction, 'REQUIRE_USER');
    assert.strictEqual(appliedLow.metadata.requiresUserApproval, true);

    console.log('  [OK] applyToCandidate transforma estados y enriquece metadata fielmente');
  }

  // ── TEST 10: Evaluación y mutación sobre Transaction Canónica ───────────────
  console.log('\n[TEST 10] Evaluación y mutación controlada sobre Transaction');
  {
    // Transacción en CANDIDATE con alta confianza (92) -> Promoción a CONFIRMED
    const highTx = createMockTransaction({ confidenceScore: 92, status: 'CANDIDATE' });
    const appliedTxHigh = ConfidenceThresholdService.applyToTransaction(highTx);
    assert.strictEqual(appliedTxHigh.status, 'CONFIRMED');
    assert.strictEqual(appliedTxHigh.metadata?.confidenceAction, 'AUTO_CONFIRM');

    // Transacción en CANDIDATE con confianza media (75) -> Transición a PENDING con flag de revisión
    const medTx = createMockTransaction({ confidenceScore: 75, status: 'CANDIDATE' });
    const appliedTxMed = ConfidenceThresholdService.applyToTransaction(medTx);
    assert.strictEqual(appliedTxMed.status, 'PENDING');
    assert.strictEqual(appliedTxMed.metadata?.requiresReview, true);

    // Transacción en CANDIDATE con baja confianza (50) -> Permanece en CANDIDATE
    const lowTx = createMockTransaction({ confidenceScore: 50, status: 'CANDIDATE' });
    const appliedTxLow = ConfidenceThresholdService.applyToTransaction(lowTx);
    assert.strictEqual(appliedTxLow.status, 'CANDIDATE');
    assert.strictEqual(appliedTxLow.metadata?.requiresUserApproval, true);

    console.log('  [OK] applyToTransaction promueve estados contables según reglas');
  }

  // ── TEST 11: Integración con TransactionCandidateService ───────────────────
  console.log('\n[TEST 11] Integración con TransactionCandidateService');
  {
    const repo = new InMemoryTransactionCandidateRepository();
    const service = new TransactionCandidateService(repo);

    // Crear candidato con score 94
    const cand1 = await service.createCandidate({
      rawEventId: 'raw-1',
      source: 'ANDROID_NOTIFICATION',
      provider: 'BBVA',
      amount: 120.0,
      type: 'EXPENSE',
      confidenceScore: 94,
    });

    // Auto-confirmar vía autoConfirmIfEligible (integra con US-030)
    const confirmed = await service.autoConfirmIfEligible(cand1.id);
    assert.strictEqual(confirmed.status, 'AUTO_CONFIRMED');
    assert.strictEqual(confirmed.metadata.confidenceAction, 'AUTO_CONFIRM');

    // Crear candidato con score 78 y procesar vía processThresholdDecision
    const cand2 = await service.createCandidate({
      rawEventId: 'raw-2',
      source: 'ANDROID_NOTIFICATION',
      provider: 'NU',
      amount: 450.0,
      type: 'EXPENSE',
      confidenceScore: 78,
    });

    const { candidate: processed2, decision: dec2 } = await service.processThresholdDecision(cand2.id);
    assert.strictEqual(processed2.status, 'PENDING_REVIEW');
    assert.strictEqual(dec2.action, 'REGISTER_AND_REVIEW');
    assert.strictEqual(processed2.metadata.requiresReview, true);

    // Crear candidato con score 30
    const cand3 = await service.createCandidate({
      rawEventId: 'raw-3',
      source: 'ANDROID_NOTIFICATION',
      provider: 'GENERIC',
      amount: 300.0,
      type: 'EXPENSE',
      confidenceScore: 30,
    });

    const { candidate: processed3, decision: dec3 } = await service.processThresholdDecision(cand3.id);
    assert.strictEqual(processed3.status, 'PENDING_REVIEW');
    assert.strictEqual(dec3.action, 'REQUIRE_USER');
    assert.strictEqual(processed3.metadata.requiresUserApproval, true);

    console.log('  [OK] Integración completa con TransactionCandidateService verificada');
  }

  // ── TEST 12: Integración con ConfidenceScoringService ──────────────────────
  console.log('\n[TEST 12] Integración con ConfidenceScoringService.evaluateDecision()');
  {
    // Evaluación fluida a partir del input
    const decision = ConfidenceScoringService.evaluateDecision({
      source: 'BANK_PDF',
      amount: 1500,
      currency: 'MXN',
      merchant: 'CFE SUMINISTRADOR',
      accountHint: '1234',
      occurredAt: new Date(),
    });

    // Statement completo genera 100 de confianza -> AUTO_CONFIRM
    assert.strictEqual(decision.score, 100);
    assert.strictEqual(decision.action, 'AUTO_CONFIRM');
    assert.strictEqual(decision.isAutoConfirm, true);

    // Evaluación con entrada ruidosa de OCR
    const ocrDecision = ConfidenceScoringService.evaluateDecision({
      source: 'OCR',
      amount: 80,
      ocrDetails: {
        isBlurredOrNoisy: true,
        hasTotalField: false,
      },
    });

    assert.ok(ocrDecision.score < 70, `Score esperado < 70 pero fue ${ocrDecision.score}`);
    assert.strictEqual(ocrDecision.action, 'REQUIRE_USER');
    assert.strictEqual(ocrDecision.isRequireUser, true);

    console.log('  [OK] Enlace entre cálculo de confianza y dictamen de umbrales verificado');
  }

  console.log('\n[DONE] ¡Todos los tests de US-030 pasaron exitosamente (12/12)!');
}
