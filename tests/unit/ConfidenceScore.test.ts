/**
 * Tests Unitarios — US-029: Confidence Score
 *
 * Criterios de Aceptación:
 * - Score reproducible; función pura y determinística ante idénticas entradas.
 * - Reglas iniciales para: múltiples fuentes, statement, notification, email y OCR.
 * - Score almacenado en el candidato/transacción acotado entre 0 y 100.
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
assert.notStrictEqual = (actual: unknown, expected: unknown, msg?: string) => {
  if (actual === expected) {
    throw new Error(msg || `Expected values to be different, but both were ${actual}`);
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
  ConfidenceScoringService,
  ConfidenceEvaluationResult,
  ConfidenceScoreInput,
} from '../../src/domain/services/confidence/ConfidenceScoringService';
import type { TransactionCandidate } from '../../src/domain/models/TransactionCandidate';
import type { Transaction } from '../../src/domain/models/Transaction';

export async function runConfidenceScoreTests(): Promise<void> {
  console.log('[TEST] Iniciando pruebas de US-029: Confidence Score...');

  // ── [TEST 1] Reproducibilidad estricta (Función pura) ───────────────────────
  console.log('\n[TEST 1] Reproducibilidad estricta ante idénticas entradas');
  {
    const input: ConfidenceScoreInput = {
      source: 'ANDROID_NOTIFICATION',
      amount: 450.00,
      amountMinor: 45000,
      currency: 'MXN',
      occurredAt: new Date('2026-10-12T15:30:00Z'),
      merchant: 'Oxxo',
      merchantRaw: 'CADENA COMERCIAL OXXO SA DE CV',
      accountHint: { last4Digits: '1029', bankName: 'BBVA' },
      provider: 'BBVA',
    };

    const firstResult = ConfidenceScoringService.evaluate(input);

    for (let i = 0; i < 50; i++) {
      const current = ConfidenceScoringService.evaluate(input);
      assert.strictEqual(current.score, firstResult.score, 'El score debe ser 100% reproducible');
      assert.deepStrictEqual(current.breakdown, firstResult.breakdown, 'El breakdown debe ser idéntico');
    }

    console.log(`  [OK] Score reproducible consistente (${firstResult.score} pts) validado en 50 ejecuciones`);
  }

  // ── [TEST 2] Reglas para Statement (Extractos Bancarios PDF/CSV) ────────────
  console.log('\n[TEST 2] Reglas para Statement (Extractos Bancarios)');
  {
    const statementInput: ConfidenceScoreInput = {
      source: 'BANK_PDF',
      amountMinor: 120000,
      currency: 'MXN',
      occurredAt: new Date('2026-10-10T00:00:00Z'),
      merchant: 'Liverpool',
      merchantRaw: 'LIVERPOOL INSURGENTES',
      accountHint: { last4Digits: '4455', bankName: 'SANTANDER' },
      provider: 'SANTANDER',
    };

    const result = ConfidenceScoringService.evaluate(statementInput);
    assert.strictEqual(result.category, 'STATEMENT');
    assert.strictEqual(result.breakdown.baseScore, 92, 'Base score de statement debe ser 92');
    assert.strictEqual(result.tier, 'HIGH');
    assert.ok(result.score >= 95, `El score debe ser >= 95 para extractos completos (obtenido: ${result.score})`);

    console.log(`  [OK] Statement evaluado con máxima autoridad (${result.score} pts, Tier: ${result.tier})`);
  }

  // ── [TEST 3] Reglas para Notification (Push en Tiempo Real) ─────────────────
  console.log('\n[TEST 3] Reglas para Notification (Push en Tiempo Real)');
  {
    const notifInput: ConfidenceScoreInput = {
      source: 'ANDROID_NOTIFICATION',
      amount: 85.50,
      currency: 'MXN',
      occurredAt: new Date('2026-10-12T18:00:00Z'),
      merchant: 'Farmacias Guadalajara',
      accountHint: { last4Digits: '9012', bankName: 'NU' },
      provider: 'NU',
    };

    const result = ConfidenceScoringService.evaluate(notifInput);
    assert.strictEqual(result.category, 'NOTIFICATION');
    assert.strictEqual(result.breakdown.baseScore, 85, 'Base score de notificación debe ser 85');
    assert.strictEqual(result.tier, 'HIGH');
    assert.ok(result.score >= 88 && result.score <= 100, `Score esperado entre 88 y 100 (obtenido: ${result.score})`);

    console.log(`  [OK] Notificación push validada (${result.score} pts, Tier: ${result.tier})`);
  }

  // ── [TEST 4] Reglas para Email (Comprobantes Digitales) ──────────────────────
  console.log('\n[TEST 4] Reglas para Email (Comprobantes Digitales)');
  {
    const emailInput: ConfidenceScoreInput = {
      source: 'EMAIL',
      amount: 199.00,
      currency: 'MXN',
      occurredAt: new Date('2026-10-11T20:15:00Z'),
      merchant: 'Spotify',
      provider: 'SPOTIFY_RECEIPT',
    };

    const result = ConfidenceScoringService.evaluate(emailInput);
    assert.strictEqual(result.category, 'EMAIL');
    assert.strictEqual(result.breakdown.baseScore, 78, 'Base score de email debe ser 78');
    assert.ok(result.score >= 70, `Score de email debe estar en tier MEDIUM o HIGH (obtenido: ${result.score})`);

    console.log(`  [OK] Email validado (${result.score} pts, Tier: ${result.tier})`);
  }

  // ── [TEST 5] Reglas para OCR (Tickets Físicos con/sin ruido) ─────────────────
  console.log('\n[TEST 5] Reglas para OCR (Tickets Físicos: Nítido vs Borroso)');
  {
    // Caso A: Ticket nítido con TOTAL, Folio Fiscal y desglose
    const cleanOcrInput: ConfidenceScoreInput = {
      source: 'OCR',
      amount: 520.00,
      currency: 'MXN',
      occurredAt: new Date('2026-10-12T14:00:00Z'),
      merchant: 'Costco',
      merchantRaw: 'COSTCO WHOLESALE MEXICO',
      ocrDetails: {
        hasTotalField: true,
        hasFiscalId: true,
        hasItemizedDetails: true,
        isBlurredOrNoisy: false,
        confidenceReportedByEngine: 95,
      },
    };

    const cleanResult = ConfidenceScoringService.evaluate(cleanOcrInput);
    assert.strictEqual(cleanResult.category, 'OCR');
    assert.strictEqual(cleanResult.breakdown.baseScore, 65, 'Base score de OCR debe ser 65');
    assert.ok(cleanResult.breakdown.ocrModifier >= 15, 'Modificadores de OCR nítido deben ser >= 15');
    assert.ok(cleanResult.score >= 80, `Ticket nítido debe alcanzar buen puntaje (obtenido: ${cleanResult.score})`);

    // Caso B: Ticket borroso con ruido visual
    const noisyOcrInput: ConfidenceScoreInput = {
      source: 'OCR',
      amount: 520.00,
      currency: 'MXN',
      occurredAt: new Date('2026-10-12T14:00:00Z'),
      merchantRaw: 'COSTC?? ???LESALE',
      ocrDetails: {
        hasTotalField: false,
        hasFiscalId: false,
        isBlurredOrNoisy: true,
        confidenceReportedByEngine: 45,
      },
    };

    const noisyResult = ConfidenceScoringService.evaluate(noisyOcrInput);
    assert.ok(noisyResult.score < cleanResult.score, 'El ticket ruidoso debe tener score menor al nítido');
    assert.strictEqual(noisyResult.tier, 'LOW', 'Ticket ruidoso debe quedar en tier LOW');

    console.log(`  [OK] OCR nítido (${cleanResult.score} pts) vs OCR borroso (${noisyResult.score} pts) contrastados`);
  }

  // ── [TEST 6] Reglas para Múltiples Fuentes (Corroboración Cruzada) ───────────
  console.log('\n[TEST 6] Reglas para Múltiples Fuentes (Corroboración Cruzada)');
  {
    const singleSourceInput: ConfidenceScoreInput = {
      source: 'ANDROID_NOTIFICATION',
      amount: 350.00,
      currency: 'MXN',
      occurredAt: new Date('2026-10-12T12:00:00Z'),
      merchant: 'Uber',
      sourcesCount: 1,
    };
    const singleResult = ConfidenceScoringService.evaluate(singleSourceInput);

    // Doble fuente (Notificación + Email)
    const doubleSourceInput: ConfidenceScoreInput = {
      ...singleSourceInput,
      sourcesCount: 2,
    };
    const doubleResult = ConfidenceScoringService.evaluate(doubleSourceInput);
    assert.strictEqual(doubleResult.breakdown.multiSourceModifier, 10, 'Doble fuente debe aportar +10');
    assert.ok(doubleResult.score > singleResult.score);

    // Triple fuente con Statement bancario
    const tripleSourceWithStmt: ConfidenceScoreInput = {
      ...singleSourceInput,
      sourcesCount: 3,
      hasStatementSource: true,
    };
    const tripleResult = ConfidenceScoringService.evaluate(tripleSourceWithStmt);
    assert.strictEqual(tripleResult.breakdown.multiSourceModifier, 20, 'Triple fuente con extracto debe aportar 15 + 5 = +20');
    assert.ok(tripleResult.score >= 95);

    console.log(`  [OK] Multi-fuente 1 fuente (${singleResult.score}) -> 2 fuentes (${doubleResult.score}) -> 3 fuentes + Stmt (${tripleResult.score})`);
  }

  // ── [TEST 7] Penalizaciones por datos ausentes o anómalos ────────────────────
  console.log('\n[TEST 7] Penalizaciones por datos ausentes o anómalos');
  {
    // A: Sin comercio
    const noMerchantInput: ConfidenceScoreInput = {
      source: 'ANDROID_NOTIFICATION',
      amount: 100.00,
      currency: 'MXN',
      occurredAt: new Date('2026-10-12T10:00:00Z'),
      merchant: null,
      merchantRaw: null,
    };
    const noMerchantResult = ConfidenceScoringService.evaluate(noMerchantInput);
    assert.ok(noMerchantResult.breakdown.merchantModifier <= -10, 'Debe penalizar por falta de comercio');

    // B: Monto cero o negativo
    const invalidAmountInput: ConfidenceScoreInput = {
      source: 'ANDROID_NOTIFICATION',
      amount: 0,
      currency: 'MXN',
      occurredAt: new Date('2026-10-12T10:00:00Z'),
      merchant: 'Oxxo',
    };
    const invalidAmountResult = ConfidenceScoringService.evaluate(invalidAmountInput);
    assert.ok(invalidAmountResult.breakdown.penalties >= 35, 'Debe penalizar severamente por monto cero');
    assert.strictEqual(invalidAmountResult.tier, 'LOW');

    // C: Fecha futura imposible (> 2 días)
    const farFutureDate = new Date();
    farFutureDate.setDate(farFutureDate.getDate() + 30);
    const futureDateInput: ConfidenceScoreInput = {
      source: 'ANDROID_NOTIFICATION',
      amount: 100.00,
      currency: 'MXN',
      occurredAt: farFutureDate,
      merchant: 'Oxxo',
    };
    const futureResult = ConfidenceScoringService.evaluate(futureDateInput);
    assert.ok(futureResult.breakdown.penalties >= 20, 'Debe penalizar por fecha futura');

    console.log('  [OK] Penalizaciones de robustez aplicadas correctamente');
  }

  // ── [TEST 8] Acotamiento estricto [0, 100] y Tiers de Confianza ──────────────
  console.log('\n[TEST 8] Acotamiento estricto [0, 100] y Tiers');
  {
    // Input con múltiples penalizaciones
    const worstCase: ConfidenceScoreInput = {
      source: 'OCR',
      amount: -100,
      occurredAt: new Date('2099-01-01'),
      currency: 'INVALID_CURRENCY',
      merchant: null,
      merchantRaw: null,
    };
    const worstResult = ConfidenceScoringService.evaluate(worstCase);
    assert.strictEqual(worstResult.score, 0, 'El score nunca debe ser menor a 0');
    assert.strictEqual(worstResult.tier, 'LOW');

    // Input con máximos bonos
    const bestCase: ConfidenceScoreInput = {
      source: 'STATEMENT_PDF',
      amount: 5000.00,
      amountMinor: 500000,
      currency: 'MXN',
      occurredAt: new Date('2026-10-10T12:00:00Z'),
      merchant: 'Walmart',
      accountHint: { last4Digits: '9999', bankName: 'BBVA' },
      provider: 'BBVA',
      sourcesCount: 4,
      hasStatementSource: true,
    };
    const bestResult = ConfidenceScoringService.evaluate(bestCase);
    assert.strictEqual(bestResult.score, 100, 'El score nunca debe ser mayor a 100');
    assert.strictEqual(bestResult.tier, 'HIGH');

    console.log('  [OK] Límites [0, 100] respetados rigurosamente');
  }

  // ── [TEST 9] Evaluación directa de TransactionCandidate y score almacenado ──
  console.log('\n[TEST 9] Evaluación de TransactionCandidate y almacenamiento');
  {
    const cand: TransactionCandidate = {
      id: 'cand_score_test',
      userId: 'usr_1',
      rawEventId: 'ev_123',
      source: 'ANDROID_NOTIFICATION',
      provider: 'BBVA',
      amountMinor: 25000,
      amount: 250.00,
      currency: 'MXN',
      type: 'EXPENSE',
      merchantRaw: 'CADENA COMERCIAL OXXO',
      merchant: 'Oxxo',
      occurredAt: new Date('2026-10-12T16:00:00Z'),
      confidenceScore: 0, // A calcular
      accountHint: { last4Digits: '1029', bankName: 'BBVA' },
      status: 'PENDING_REVIEW',
      rawPayload: {},
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const evaluation = ConfidenceScoringService.evaluateCandidate(cand);
    assert.ok(evaluation.score >= 85);
    cand.confidenceScore = evaluation.score;

    assert.strictEqual(cand.confidenceScore, evaluation.score);
    assert.strictEqual(typeof cand.confidenceScore, 'number');

    console.log(`  [OK] Candidato evaluado y score almacenado (${cand.confidenceScore} pts)`);
  }

  // ── [TEST 10] Evaluación de Transaction con evidencias reconciliadas ─────────
  console.log('\n[TEST 10] Evaluación de Transaction con múltiples evidencias');
  {
    const date = new Date('2026-10-12T10:00:00Z');
    const tx: Transaction = {
      id: 'tx_with_evidence',
      userId: 'usr_1',
      accountId: 'acc_bbva',
      type: 'EXPENSE',
      amountMinor: 55000,
      currency: 'MXN',
      occurredAt: date,
      postedAt: date,
      merchantRaw: 'Amazon Mexico',
      merchant: 'Amazon',
      description: null,
      categoryId: null,
      source: 'NOTIFICATION',
      sourceEventId: 'notif_1',
      status: 'POSTED',
      confidenceScore: 85,
      fingerprint: null,
      linkedTransactionId: null,
      sourcesEvidence: [
        {
          source: 'NOTIFICATION',
          sourceEventId: 'notif_1',
          occurredAt: date,
          capturedAt: date,
        },
        {
          source: 'STATEMENT_PDF',
          sourceEventId: 'stmt_1',
          occurredAt: date,
          capturedAt: date,
        },
      ],
      createdAt: date,
      updatedAt: date,
    };

    const evaluation = ConfidenceScoringService.evaluateTransaction(tx);
    assert.ok(evaluation.score >= 95, 'Transacción reconciliada con Statement debe superar 95 de confianza');
    assert.strictEqual(evaluation.tier, 'HIGH');

    console.log(`  [OK] Transacción reconciliada evaluada con éxito (${evaluation.score} pts, Tier: ${evaluation.tier})`);
  }

  console.log('\n[DONE] ¡Todos los tests de US-029 pasaron exitosamente (10/10)!');
}
