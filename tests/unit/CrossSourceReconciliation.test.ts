/**
 * Pruebas unitarias para US-027: Reconciliación Cross-Source
 *
 * Criterios de Aceptación:
 * - Múltiples fuentes pueden asociarse a una transacción.
 * - Una operación no se duplica.
 * - Evidencia de fuentes conservada.
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

import { CrossSourceReconciliationService } from '../../src/domain/services/reconciliation/CrossSourceReconciliationService';
import type { Transaction } from '../../src/domain/models/Transaction';
import type { TransactionCandidate } from '../../src/domain/models/TransactionCandidate';

export async function runCrossSourceReconciliationTests() {
  console.log('[TEST] Iniciando pruebas de US-027: Reconciliación Cross-Source...');

  // ── [TEST 1] Unificación de fuentes heterogéneas (Notification + Statement) ─
  console.log('\n[TEST 1] Unificación de fuentes heterogéneas (Notification + Statement PDF)');
  {
    const purchaseDate = new Date('2026-10-12T14:30:00Z');
    const statementDate = new Date('2026-10-13T08:00:00Z');

    // Transacción originada previamente por notificación push en tiempo real
    const initialTx: Transaction = {
      id: 'tx_oxxo_1',
      userId: 'usr_1',
      accountId: 'acc_debito_bbva',
      type: 'EXPENSE',
      amountMinor: 23000, // $230.00
      currency: 'MXN',
      occurredAt: purchaseDate,
      postedAt: null,
      merchantRaw: 'OXXO MATRIZ',
      merchant: 'Oxxo',
      description: null,
      categoryId: null,
      source: 'NOTIFICATION',
      sourceEventId: 'notif_ev_001',
      status: 'PENDING',
      confidenceScore: 85,
      fingerprint: null,
      linkedTransactionId: null,
      sourcesEvidence: [
        {
          source: 'NOTIFICATION',
          sourceEventId: 'notif_ev_001',
          candidateId: 'cand_notif_001',
          provider: 'BBVA',
          occurredAt: purchaseDate,
          capturedAt: purchaseDate,
          merchantRaw: 'OXXO MATRIZ',
          amountMinor: 23000,
          confidenceScore: 85,
          rawPayloadExcerpt: { pushId: 'p-1' },
        },
      ],
      createdAt: purchaseDate,
      updatedAt: purchaseDate,
    };

    // Candidato ingresado días después a través de la importación de estado de cuenta PDF
    const statementCandidate: TransactionCandidate = {
      id: 'cand_stmt_002',
      userId: 'usr_1',
      rawEventId: 'stmt_ev_002',
      source: 'BANK_PDF',
      provider: 'BBVA',
      amountMinor: 23000,
      amount: 230.00,
      currency: 'MXN',
      type: 'EXPENSE',
      merchantRaw: 'CADENA COMERCIAL OXXO S.A.',
      merchant: 'Oxxo',
      occurredAt: statementDate,
      confidenceScore: 98,
      accountHint: { last4Digits: '1029', bankName: 'BBVA' },
      status: 'PENDING_REVIEW',
      rawPayload: { rowNum: 42, statementFile: 'octubre.pdf' },
      metadata: {},
      createdAt: statementDate,
      updatedAt: statementDate,
    };

    const result = CrossSourceReconciliationService.reconcile(
      statementCandidate,
      [initialTx],
    );

    assert.strictEqual(result.action, 'MERGED', 'La acción debe ser MERGED');
    assert.strictEqual(result.isReconciled, true);
    assert.ok(result.transaction !== null);
    assert.strictEqual(result.transaction?.id, 'tx_oxxo_1', 'Debe reconciliar sobre la misma transacción');

    // Verificar que contiene 2 evidencias
    const evidences = result.transaction?.sourcesEvidence || [];
    assert.strictEqual(evidences.length, 2, 'Deben existir 2 fuentes de evidencia asociadas');
    assert.strictEqual(evidences[0].source, 'NOTIFICATION');
    assert.strictEqual(evidences[1].source, 'STATEMENT_PDF');
    assert.strictEqual(CrossSourceReconciliationService.hasMultipleSources(result.transaction!), true);

    console.log('  [OK] Notificación y estado de cuenta unificados en una sola transacción');
  }

  // ── [TEST 2] Conservación íntegra de evidencia ──────────────────────────────
  console.log('\n[TEST 2] Conservación íntegra de evidencia (payloads, sourceEventIds, timestamps)');
  {
    const purchaseDate = new Date('2026-10-12T14:30:00Z');
    const statementDate = new Date('2026-10-13T08:00:00Z');

    const tx: Transaction = {
      id: 'tx_check_evidence',
      userId: 'usr_1',
      accountId: 'acc_1',
      type: 'EXPENSE',
      amountMinor: 50000,
      currency: 'MXN',
      occurredAt: purchaseDate,
      postedAt: null,
      merchantRaw: 'Amazon',
      merchant: 'Amazon',
      description: null,
      categoryId: null,
      source: 'NOTIFICATION',
      sourceEventId: 'src_notif',
      status: 'CONFIRMED',
      confidenceScore: 90,
      fingerprint: null,
      linkedTransactionId: null,
      sourcesEvidence: [
        {
          source: 'NOTIFICATION',
          sourceEventId: 'src_notif',
          candidateId: 'cand_notif',
          provider: 'BBVA',
          occurredAt: purchaseDate,
          capturedAt: purchaseDate,
          rawPayloadExcerpt: { notifText: 'Cargo por $500 en Amazon' },
        },
      ],
      createdAt: purchaseDate,
      updatedAt: purchaseDate,
    };

    const cand: TransactionCandidate = {
      id: 'cand_email',
      userId: 'usr_1',
      rawEventId: 'src_email_ev',
      source: 'EMAIL',
      provider: 'AMAZON_ORDER',
      amountMinor: 50000,
      amount: 500.00,
      currency: 'MXN',
      type: 'EXPENSE',
      merchantRaw: 'Amazon México Services',
      merchant: 'Amazon',
      occurredAt: statementDate,
      confidenceScore: 95,
      status: 'PENDING_REVIEW',
      rawPayload: { orderId: 'ORDER-777', tracking: 'TRK-999' },
      metadata: {},
      createdAt: statementDate,
      updatedAt: statementDate,
    };

    const result = CrossSourceReconciliationService.reconcile(cand, [tx]);
    const evidenceList = result.transaction?.sourcesEvidence || [];

    assert.strictEqual(evidenceList.length, 2);
    // Primera evidencia intacta
    assert.strictEqual(evidenceList[0].source, 'NOTIFICATION');
    assert.strictEqual(evidenceList[0].sourceEventId, 'src_notif');
    assert.strictEqual(evidenceList[0].rawPayloadExcerpt?.notifText, 'Cargo por $500 en Amazon');

    // Segunda evidencia agregada íntegramente
    assert.strictEqual(evidenceList[1].source, 'EMAIL');
    assert.strictEqual(evidenceList[1].sourceEventId, 'src_email_ev');
    assert.strictEqual(evidenceList[1].candidateId, 'cand_email');
    assert.strictEqual(evidenceList[1].provider, 'AMAZON_ORDER');
    assert.strictEqual(evidenceList[1].rawPayloadExcerpt?.orderId, 'ORDER-777');

    console.log('  [OK] Evidencias de ambas fuentes preservadas con sus metadatos intactos');
  }

  // ── [TEST 3] Una operación real NO se duplica ────────────────────────────────
  console.log('\n[TEST 3] Una operación real NO se duplica (candidato marcado RECONCILED)');
  {
    const date = new Date('2026-10-12T10:00:00Z');
    const existingTx: Transaction = {
      id: 'tx_single_1',
      userId: 'usr_1',
      accountId: 'acc_1',
      type: 'EXPENSE',
      amountMinor: 12000,
      currency: 'MXN',
      occurredAt: date,
      postedAt: null,
      merchantRaw: 'Spotify',
      merchant: 'Spotify',
      description: null,
      categoryId: null,
      source: 'NOTIFICATION',
      sourceEventId: 'ev_spoti_1',
      status: 'CONFIRMED',
      confidenceScore: 90,
      fingerprint: null,
      linkedTransactionId: null,
      sourcesEvidence: [],
      createdAt: date,
      updatedAt: date,
    };

    const duplicateCandidate: TransactionCandidate = {
      id: 'cand_spoti_2',
      userId: 'usr_1',
      rawEventId: 'ev_spoti_2',
      source: 'EMAIL',
      provider: 'SPOTIFY_RECEIPT',
      amountMinor: 12000,
      amount: 120.00,
      currency: 'MXN',
      type: 'EXPENSE',
      merchantRaw: 'Spotify AB',
      merchant: 'Spotify',
      occurredAt: date,
      confidenceScore: 95,
      status: 'PENDING_REVIEW',
      rawPayload: {},
      metadata: {},
      createdAt: date,
      updatedAt: date,
    };

    const transactionsList = [existingTx];
    const result = CrossSourceReconciliationService.reconcile(duplicateCandidate, transactionsList);

    // Verificaciones de no duplicación
    assert.strictEqual(result.action, 'MERGED');
    assert.strictEqual(duplicateCandidate.status, 'RECONCILED', 'El candidato debe quedar RECONCILED');
    assert.strictEqual(duplicateCandidate.metadata.reconciledWithTransactionId, 'tx_single_1');
    assert.strictEqual(transactionsList.length, 1, 'La lista no debe crear una nueva transacción');

    console.log('  [OK] No se creó transacción duplicada; candidato marcado RECONCILED');
  }

  // ── [TEST 4] Fusión de 3 fuentes distintas (Notification + Email + Statement) ─
  console.log('\n[TEST 4] Fusión de 3 fuentes distintas (Notification + Email + Statement)');
  {
    const d1 = new Date('2026-10-12T15:00:00Z');
    const d2 = new Date('2026-10-12T15:05:00Z');
    const d3 = new Date('2026-10-13T09:00:00Z');

    // 1. Inicia con Notificación
    const tx: Transaction = {
      id: 'tx_multi_source',
      userId: 'usr_1',
      accountId: 'acc_nu',
      type: 'EXPENSE',
      amountMinor: 48000,
      currency: 'MXN',
      occurredAt: d1,
      postedAt: null,
      merchantRaw: 'Uber',
      merchant: 'Uber',
      description: null,
      categoryId: null,
      source: 'NOTIFICATION',
      sourceEventId: 'ev_notif',
      status: 'PENDING',
      confidenceScore: 80,
      fingerprint: null,
      linkedTransactionId: null,
      sourcesEvidence: [
        {
          source: 'NOTIFICATION',
          sourceEventId: 'ev_notif',
          candidateId: 'cand_1',
          provider: 'NU',
          occurredAt: d1,
          capturedAt: d1,
        },
      ],
      createdAt: d1,
      updatedAt: d1,
    };

    // 2. Llega recibo por Email
    const emailCandidate: TransactionCandidate = {
      id: 'cand_email_uber',
      userId: 'usr_1',
      rawEventId: 'ev_email',
      source: 'EMAIL',
      provider: 'UBER_RECEIPT',
      amountMinor: 48000,
      amount: 480.00,
      currency: 'MXN',
      type: 'EXPENSE',
      merchantRaw: 'Uber B.V.',
      merchant: 'Uber',
      occurredAt: d2,
      confidenceScore: 90,
      status: 'PENDING_REVIEW',
      rawPayload: {},
      metadata: {},
      createdAt: d2,
      updatedAt: d2,
    };

    const res1 = CrossSourceReconciliationService.reconcile(emailCandidate, [tx]);
    assert.strictEqual(res1.action, 'MERGED');
    const txAfterEmail = res1.transaction!;
    assert.strictEqual(txAfterEmail.sourcesEvidence?.length, 2);

    // 3. Llega Estado de Cuenta Bancario
    const stmtCandidate: TransactionCandidate = {
      id: 'cand_stmt_uber',
      userId: 'usr_1',
      rawEventId: 'ev_stmt',
      source: 'BANK_PDF',
      provider: 'NU',
      amountMinor: 48000,
      amount: 480.00,
      currency: 'MXN',
      type: 'EXPENSE',
      merchantRaw: 'UBER *TRIP AY6Z8',
      merchant: 'Uber',
      occurredAt: d3,
      confidenceScore: 98,
      status: 'PENDING_REVIEW',
      rawPayload: {},
      metadata: {},
      createdAt: d3,
      updatedAt: d3,
    };

    const res2 = CrossSourceReconciliationService.reconcile(stmtCandidate, [txAfterEmail]);
    assert.strictEqual(res2.action, 'MERGED');
    const txAfterStmt = res2.transaction!;
    assert.strictEqual(txAfterStmt.sourcesEvidence?.length, 3, 'Deben existir 3 fuentes unificadas');
    assert.ok(txAfterStmt.confidenceScore! >= 95, 'La confianza debe ser muy alta al tener 3 fuentes concordantes');

    console.log('  [OK] 3 fuentes unificadas en la misma transacción con alta confianza');
  }

  // ── [TEST 5] Enriquecimiento de fecha de liquidación (postedAt y status) ─────
  console.log('\n[TEST 5] Enriquecimiento de fecha de liquidación (postedAt y status POSTED)');
  {
    const purchaseDate = new Date('2026-10-12T16:00:00Z');
    const postedDate = new Date('2026-10-14T02:00:00Z');

    const pendingTx: Transaction = {
      id: 'tx_pending',
      userId: 'usr_1',
      accountId: 'acc_1',
      type: 'EXPENSE',
      amountMinor: 150000,
      currency: 'MXN',
      occurredAt: purchaseDate,
      postedAt: null, // Pendiente de liquidar por el banco
      merchantRaw: 'Hotel Fiesta Americana',
      merchant: 'Fiesta Americana',
      description: null,
      categoryId: null,
      source: 'NOTIFICATION',
      sourceEventId: 'notif_h',
      status: 'PENDING',
      confidenceScore: 85,
      fingerprint: null,
      linkedTransactionId: null,
      sourcesEvidence: [],
      createdAt: purchaseDate,
      updatedAt: purchaseDate,
    };

    const stmtCandidate: TransactionCandidate = {
      id: 'cand_stmt_hotel',
      userId: 'usr_1',
      rawEventId: 'stmt_h',
      source: 'BANK_PDF',
      provider: 'SANTANDER',
      amountMinor: 150000,
      amount: 1500.00,
      currency: 'MXN',
      type: 'EXPENSE',
      merchantRaw: 'POS FIESTA AMERICANA',
      merchant: 'Fiesta Americana',
      occurredAt: postedDate, // Fecha del corte/asentamiento
      confidenceScore: 99,
      status: 'PENDING_REVIEW',
      rawPayload: {},
      metadata: {},
      createdAt: postedDate,
      updatedAt: postedDate,
    };

    const result = CrossSourceReconciliationService.reconcile(stmtCandidate, [pendingTx]);
    assert.strictEqual(result.action, 'MERGED');
    assert.strictEqual(result.transaction?.status, 'POSTED', 'Estado debe actualizarse a POSTED');
    assert.deepStrictEqual(result.transaction?.postedAt, postedDate, 'postedAt debe enriquecerse con la fecha del estado de cuenta');

    console.log('  [OK] postedAt y status enriquecidos automáticamente');
  }

  // ── [TEST 6] Enriquecimiento de comercio normalizado ─────────────────────────
  console.log('\n[TEST 6] Enriquecimiento de comercio normalizado');
  {
    const date = new Date('2026-10-12T11:00:00Z');

    const txWithoutNormalizedMerchant: Transaction = {
      id: 'tx_clean_merchant',
      userId: 'usr_1',
      accountId: 'acc_1',
      type: 'EXPENSE',
      amountMinor: 25000,
      currency: 'MXN',
      occurredAt: date,
      postedAt: null,
      merchantRaw: 'COMPRA POS 987654321',
      merchant: null, // Sin normalizar aún
      description: null,
      categoryId: null,
      source: 'SMS',
      sourceEventId: 'sms_1',
      status: 'CONFIRMED',
      confidenceScore: 80,
      fingerprint: null,
      linkedTransactionId: null,
      sourcesEvidence: [],
      createdAt: date,
      updatedAt: date,
    };

    const candidateWithNormalized: TransactionCandidate = {
      id: 'cand_clean',
      userId: 'usr_1',
      rawEventId: 'ev_clean',
      source: 'EMAIL',
      provider: 'GMAIL',
      amountMinor: 25000,
      amount: 250.00,
      currency: 'MXN',
      type: 'EXPENSE',
      merchantRaw: 'COMPRA POS 987654321',
      merchant: 'Farmacias Benavides',
      occurredAt: date,
      confidenceScore: 92,
      status: 'PENDING_REVIEW',
      rawPayload: {},
      metadata: {},
      createdAt: date,
      updatedAt: date,
    };

    const result = CrossSourceReconciliationService.reconcile(
      candidateWithNormalized,
      [txWithoutNormalizedMerchant],
    );

    assert.strictEqual(result.action, 'MERGED');
    assert.strictEqual(result.transaction?.merchant, 'Farmacias Benavides', 'El merchant debe enriquecerse con el nombre limpio');

    console.log('  [OK] Nombre de comercio enriquecido exitosamente');
  }

  // ── [TEST 7] No mezcla operaciones distintas (Rechazo de falso match) ───────
  console.log('\n[TEST 7] No mezcla operaciones distintas (Rechazo de falso match)');
  {
    const date = new Date('2026-10-12T10:00:00Z');

    const tx: Transaction = {
      id: 'tx_existing',
      userId: 'usr_1',
      accountId: 'acc_1',
      type: 'EXPENSE',
      amountMinor: 10000,
      currency: 'MXN',
      occurredAt: date,
      postedAt: null,
      merchantRaw: 'Oxxo',
      merchant: 'Oxxo',
      description: null,
      categoryId: null,
      source: 'NOTIFICATION',
      sourceEventId: 'e1',
      status: 'CONFIRMED',
      confidenceScore: 90,
      fingerprint: null,
      linkedTransactionId: null,
      sourcesEvidence: [],
      createdAt: date,
      updatedAt: date,
    };

    // Candidato con distinto monto
    const diffCandidate: TransactionCandidate = {
      id: 'cand_diff',
      userId: 'usr_1',
      rawEventId: 'e2',
      source: 'EMAIL',
      provider: 'EMAIL',
      amountMinor: 99900,
      amount: 999.00,
      currency: 'MXN',
      type: 'EXPENSE',
      merchantRaw: 'Oxxo',
      merchant: 'Oxxo',
      occurredAt: date,
      confidenceScore: 85,
      status: 'PENDING_REVIEW',
      rawPayload: {},
      metadata: {},
      createdAt: date,
      updatedAt: date,
    };

    const result = CrossSourceReconciliationService.reconcile(diffCandidate, [tx]);
    assert.strictEqual(result.action, 'UNMATCHED');
    assert.strictEqual(result.isReconciled, false);
    assert.strictEqual(result.transaction, null);
    assert.strictEqual(diffCandidate.status, 'PENDING_REVIEW', 'Candidato no debe ser alterado');

    console.log('  [OK] Operaciones dispares no se mezclan');
  }

  // ── [TEST 8] Promoción controlada de candidato huérfano ───────────────────────
  console.log('\n[TEST 8] Promoción controlada de candidato huérfano a Transaction');
  {
    const cand: TransactionCandidate = {
      id: 'cand_promote',
      userId: 'usr_1',
      rawEventId: 'ev_p',
      source: 'ANDROID_NOTIFICATION',
      provider: 'BBVA',
      amountMinor: 32000,
      amount: 320.00,
      currency: 'MXN',
      type: 'EXPENSE',
      merchantRaw: 'Cinépolis',
      merchant: 'Cinépolis',
      occurredAt: new Date('2026-10-12T20:00:00Z'),
      confidenceScore: 95,
      accountHint: { last4Digits: '1029', bankName: 'BBVA' },
      status: 'PENDING_REVIEW',
      rawPayload: {},
      metadata: {},
      createdAt: new Date('2026-10-12T20:00:00Z'),
      updatedAt: new Date('2026-10-12T20:00:00Z'),
    };

    const newTx = CrossSourceReconciliationService.promoteCandidateToTransaction(cand, 'acc_bbva_main');
    assert.ok(newTx.id.startsWith('tx_'));
    assert.strictEqual(newTx.accountId, 'acc_bbva_main');
    assert.strictEqual(newTx.amountMinor, 32000);
    assert.strictEqual(newTx.sourcesEvidence?.length, 1);
    assert.strictEqual(newTx.sourcesEvidence?.[0].source, 'NOTIFICATION');
    assert.strictEqual(newTx.sourcesEvidence?.[0].candidateId, 'cand_promote');

    console.log('  [OK] Promoción de candidato con evidencia inicial verificada');
  }

  // ── [TEST 9] Idempotencia en la adición de evidencia ────────────────────────
  console.log('\n[TEST 9] Idempotencia en la adición de evidencia (mismo evento no duplica evidencia)');
  {
    const date = new Date('2026-10-12T10:00:00Z');
    const initialTx: Transaction = {
      id: 'tx_idem',
      userId: 'usr_1',
      accountId: 'acc_1',
      type: 'EXPENSE',
      amountMinor: 10000,
      currency: 'MXN',
      occurredAt: date,
      postedAt: null,
      merchantRaw: 'Oxxo',
      merchant: 'Oxxo',
      description: null,
      categoryId: null,
      source: 'NOTIFICATION',
      sourceEventId: 'event_identical',
      status: 'CONFIRMED',
      confidenceScore: 90,
      fingerprint: null,
      linkedTransactionId: null,
      sourcesEvidence: [
        {
          source: 'NOTIFICATION',
          sourceEventId: 'event_identical',
          candidateId: 'cand_same',
          provider: 'BBVA',
          occurredAt: date,
          capturedAt: date,
        },
      ],
      createdAt: date,
      updatedAt: date,
    };

    const candidateSame: TransactionCandidate = {
      id: 'cand_same_repeat',
      userId: 'usr_1',
      rawEventId: 'event_identical',
      source: 'ANDROID_NOTIFICATION',
      provider: 'BBVA',
      amountMinor: 10000,
      amount: 100.00,
      currency: 'MXN',
      type: 'EXPENSE',
      merchantRaw: 'Oxxo',
      merchant: 'Oxxo',
      occurredAt: date,
      confidenceScore: 90,
      status: 'PENDING_REVIEW',
      rawPayload: {},
      metadata: {},
      createdAt: date,
      updatedAt: date,
    };

    const result = CrossSourceReconciliationService.reconcile(candidateSame, [initialTx]);
    assert.strictEqual(result.transaction?.sourcesEvidence?.length, 1, 'No debe duplicar evidencia del mismo evento de origen');

    console.log('  [OK] Idempotencia de evidencias validada');
  }

  // ── [TEST 10] Utilidades de consulta e inspección ─────────────────────────────
  console.log('\n[TEST 10] Utilidades de consulta e inspección (getEvidenceList, hasMultipleSources)');
  {
    const date = new Date('2026-10-12T10:00:00Z');
    const singleSourceTx: Transaction = {
      id: 'tx_single',
      userId: 'usr_1',
      accountId: 'acc_1',
      type: 'EXPENSE',
      amountMinor: 1000,
      currency: 'MXN',
      occurredAt: date,
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
      sourcesEvidence: [
        {
          source: 'MANUAL',
          sourceEventId: 'man_1',
          occurredAt: date,
          capturedAt: date,
        },
      ],
      createdAt: date,
      updatedAt: date,
    };

    assert.strictEqual(CrossSourceReconciliationService.hasMultipleSources(singleSourceTx), false);
    assert.strictEqual(CrossSourceReconciliationService.getEvidenceList(singleSourceTx).length, 1);

    const multiSourceTx: Transaction = {
      ...singleSourceTx,
      sourcesEvidence: [
        { source: 'NOTIFICATION', sourceEventId: 'e1', occurredAt: date, capturedAt: date },
        { source: 'STATEMENT_PDF', sourceEventId: 'e2', occurredAt: date, capturedAt: date },
      ],
    };

    assert.strictEqual(CrossSourceReconciliationService.hasMultipleSources(multiSourceTx), true);
    assert.strictEqual(CrossSourceReconciliationService.getEvidenceList(multiSourceTx).length, 2);

    console.log('  [OK] Métodos auxiliares de consulta verificados');
  }

  console.log('\n[DONE] ¡Todos los tests de US-027 pasaron exitosamente (10/10)!');
}
