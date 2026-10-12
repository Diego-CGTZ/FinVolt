/**
 * Tests Unitarios — US-028: State Machine financiera
 *
 * Criterios de Aceptación:
 * - Soporta formalmente los 9 estados: CANDIDATE, MATCHED, CONFIRMED, PENDING,
 *   POSTED, REFUND, TRANSFER, DUPLICATE y REJECTED.
 * - Transiciones válidas estrictamente definidas.
 * - Validación formal con lanzamiento de InvalidTransactionStateTransitionError ante transiciones ilegales.
 * - Efectos colaterales controlados en transition() (postedAt, linkedTransactionId, updatedAt).
 * - Clasificación semántica de estados (isEffective, isSettled, isPending, isDiscarded).
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
assert.throws = (fn: () => void, validator?: (err: any) => boolean) => {
  let threw = false;
  try {
    fn();
  } catch (err) {
    threw = true;
    if (validator && !validator(err)) {
      throw new Error(`Validator failed for error: ${err}`);
    }
  }
  if (!threw) {
    throw new Error('Expected function to throw, but it did not');
  }
};

import {
  FinancialStateMachine,
  ALL_TRANSACTION_STATUSES,
  VALID_TRANSACTION_TRANSITIONS,
  InvalidTransactionStateTransitionError,
} from '../../src/domain/services/lifecycle/FinancialStateMachine';
import type { Transaction, TransactionStatus } from '../../src/domain/models/Transaction';

function createMockTransaction(overrides?: Partial<Transaction>): Transaction {
  const now = new Date('2026-10-12T12:00:00Z');
  return {
    id: 'tx_sm_test_1',
    userId: 'usr_test_1',
    accountId: 'acc_bbva_1',
    type: 'EXPENSE',
    amountMinor: 35000,
    currency: 'MXN',
    occurredAt: now,
    postedAt: null,
    merchantRaw: 'WALMART SUPERCENTER',
    merchant: 'Walmart',
    description: null,
    categoryId: 'cat_groceries',
    source: 'NOTIFICATION',
    sourceEventId: 'notif_raw_123',
    status: 'CANDIDATE',
    confidenceScore: 85,
    fingerprint: 'fp_abc123',
    linkedTransactionId: null,
    sourcesEvidence: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export async function runFinancialStateMachineTests(): Promise<void> {
  console.log('[TEST] Iniciando pruebas de US-028: State Machine financiera...');

  // ── [TEST 1] Soporte formal de los 9 estados canónicos ──────────────────────
  console.log('\n[TEST 1] Soporte formal de los 9 estados canónicos (AC)');
  {
    const expectedStatuses: TransactionStatus[] = [
      'CANDIDATE',
      'MATCHED',
      'CONFIRMED',
      'PENDING',
      'POSTED',
      'REFUND',
      'TRANSFER',
      'DUPLICATE',
      'REJECTED',
    ];

    assert.strictEqual(
      ALL_TRANSACTION_STATUSES.length,
      9,
      'Deben existir exactamente 9 estados formales definidos',
    );

    for (const status of expectedStatuses) {
      assert.ok(
        ALL_TRANSACTION_STATUSES.includes(status),
        `El estado '${status}' debe estar en ALL_TRANSACTION_STATUSES`,
      );
      assert.strictEqual(
        FinancialStateMachine.isValidStatus(status),
        true,
        `isValidStatus('${status}') debe ser true`,
      );
    }

    // Valores inválidos
    assert.strictEqual(FinancialStateMachine.isValidStatus('UNKNOWN'), false);
    assert.strictEqual(FinancialStateMachine.isValidStatus(''), false);
    assert.strictEqual(FinancialStateMachine.isValidStatus(null), false);
    assert.strictEqual(FinancialStateMachine.isValidStatus(undefined), false);
    assert.strictEqual(FinancialStateMachine.isValidStatus(12345), false);

    console.log('  [OK] Los 9 estados formales están soportados y validados');
  }

  // ── [TEST 2] Transiciones válidas desde CANDIDATE ───────────────────────────
  console.log('\n[TEST 2] Transiciones válidas desde CANDIDATE');
  {
    const from: TransactionStatus = 'CANDIDATE';
    const allowed = FinancialStateMachine.getAllowedTransitions(from);

    assert.ok(allowed.includes('MATCHED'), 'CANDIDATE -> MATCHED debe estar permitido');
    assert.ok(allowed.includes('CONFIRMED'), 'CANDIDATE -> CONFIRMED debe estar permitido');
    assert.ok(allowed.includes('PENDING'), 'CANDIDATE -> PENDING debe estar permitido');
    assert.ok(allowed.includes('POSTED'), 'CANDIDATE -> POSTED debe estar permitido');
    assert.ok(allowed.includes('TRANSFER'), 'CANDIDATE -> TRANSFER debe estar permitido');
    assert.ok(allowed.includes('DUPLICATE'), 'CANDIDATE -> DUPLICATE debe estar permitido');
    assert.ok(allowed.includes('REJECTED'), 'CANDIDATE -> REJECTED debe estar permitido');

    // No puede saltar directamente a REFUND sin confirmación
    assert.strictEqual(
      FinancialStateMachine.canTransition('CANDIDATE', 'REFUND'),
      false,
      'CANDIDATE -> REFUND no debe estar permitido directamente',
    );

    console.log('  [OK] Reglas de transición desde CANDIDATE verificadas');
  }

  // ── [TEST 3] Transiciones válidas desde MATCHED ─────────────────────────────
  console.log('\n[TEST 3] Transiciones válidas desde MATCHED');
  {
    const from: TransactionStatus = 'MATCHED';
    const allowed = FinancialStateMachine.getAllowedTransitions(from);

    assert.ok(allowed.includes('CONFIRMED'), 'MATCHED -> CONFIRMED debe estar permitido');
    assert.ok(allowed.includes('PENDING'), 'MATCHED -> PENDING debe estar permitido');
    assert.ok(allowed.includes('POSTED'), 'MATCHED -> POSTED debe estar permitido');
    assert.ok(allowed.includes('TRANSFER'), 'MATCHED -> TRANSFER debe estar permitido');
    assert.ok(allowed.includes('DUPLICATE'), 'MATCHED -> DUPLICATE debe estar permitido');
    assert.ok(allowed.includes('REJECTED'), 'MATCHED -> REJECTED debe estar permitido');
    assert.ok(allowed.includes('CANDIDATE'), 'MATCHED -> CANDIDATE (desvincular) debe estar permitido');

    // No puede pasar directamente a REFUND
    assert.strictEqual(
      FinancialStateMachine.canTransition('MATCHED', 'REFUND'),
      false,
      'MATCHED -> REFUND no debe estar permitido directamente',
    );

    console.log('  [OK] Transiciones de conciliación desde MATCHED validadas');
  }

  // ── [TEST 4] Transiciones válidas desde PENDING ─────────────────────────────
  console.log('\n[TEST 4] Transiciones válidas desde PENDING');
  {
    const from: TransactionStatus = 'PENDING';
    const allowed = FinancialStateMachine.getAllowedTransitions(from);

    assert.ok(allowed.includes('POSTED'), 'PENDING -> POSTED (liquidación) debe estar permitido');
    assert.ok(allowed.includes('CONFIRMED'), 'PENDING -> CONFIRMED debe estar permitido');
    assert.ok(allowed.includes('REFUND'), 'PENDING -> REFUND (reversión de hold) debe estar permitido');
    assert.ok(allowed.includes('TRANSFER'), 'PENDING -> TRANSFER debe estar permitido');
    assert.ok(allowed.includes('DUPLICATE'), 'PENDING -> DUPLICATE debe estar permitido');
    assert.ok(allowed.includes('REJECTED'), 'PENDING -> REJECTED debe estar permitido');

    // No debe poder retroceder a CANDIDATE ni a MATCHED
    assert.strictEqual(
      FinancialStateMachine.canTransition('PENDING', 'CANDIDATE'),
      false,
      'PENDING -> CANDIDATE debe estar prohibido',
    );
    assert.strictEqual(
      FinancialStateMachine.canTransition('PENDING', 'MATCHED'),
      false,
      'PENDING -> MATCHED debe estar prohibido',
    );

    console.log('  [OK] Transiciones de autorización/hold desde PENDING validadas');
  }

  // ── [TEST 5] Transiciones y restricciones desde POSTED ──────────────────────
  console.log('\n[TEST 5] Transiciones y restricciones desde POSTED');
  {
    const from: TransactionStatus = 'POSTED';
    const allowed = FinancialStateMachine.getAllowedTransitions(from);

    assert.ok(allowed.includes('REFUND'), 'POSTED -> REFUND (reembolso/contracargo) debe estar permitido');
    assert.ok(allowed.includes('TRANSFER'), 'POSTED -> TRANSFER (reclasificación) debe estar permitido');
    assert.ok(allowed.includes('DUPLICATE'), 'POSTED -> DUPLICATE (auditoría) debe estar permitido');
    assert.ok(allowed.includes('REJECTED'), 'POSTED -> REJECTED (anulación bancaria) debe estar permitido');

    // Restricciones críticas: un movimiento asentado no puede volver a estar pendiente o preliminar
    assert.strictEqual(
      FinancialStateMachine.canTransition('POSTED', 'PENDING'),
      false,
      'POSTED no puede retroceder a PENDING',
    );
    assert.strictEqual(
      FinancialStateMachine.canTransition('POSTED', 'CANDIDATE'),
      false,
      'POSTED no puede retroceder a CANDIDATE',
    );
    assert.strictEqual(
      FinancialStateMachine.canTransition('POSTED', 'MATCHED'),
      false,
      'POSTED no puede retroceder a MATCHED',
    );

    console.log('  [OK] Invariantes de estado firme POSTED respetadas');
  }

  // ── [TEST 6] Transiciones válidas desde CONFIRMED ───────────────────────────
  console.log('\n[TEST 6] Transiciones válidas desde CONFIRMED');
  {
    const from: TransactionStatus = 'CONFIRMED';
    const allowed = FinancialStateMachine.getAllowedTransitions(from);

    assert.ok(allowed.includes('POSTED'), 'CONFIRMED -> POSTED debe estar permitido');
    assert.ok(allowed.includes('PENDING'), 'CONFIRMED -> PENDING debe estar permitido');
    assert.ok(allowed.includes('REFUND'), 'CONFIRMED -> REFUND debe estar permitido');
    assert.ok(allowed.includes('TRANSFER'), 'CONFIRMED -> TRANSFER debe estar permitido');
    assert.ok(allowed.includes('DUPLICATE'), 'CONFIRMED -> DUPLICATE debe estar permitido');
    assert.ok(allowed.includes('REJECTED'), 'CONFIRMED -> REJECTED debe estar permitido');

    // No puede retroceder a CANDIDATE ni MATCHED
    assert.strictEqual(FinancialStateMachine.canTransition('CONFIRMED', 'CANDIDATE'), false);
    assert.strictEqual(FinancialStateMachine.canTransition('CONFIRMED', 'MATCHED'), false);

    console.log('  [OK] Transiciones desde CONFIRMED validadas');
  }

  // ── [TEST 7] Ciclo de vida de TRANSFER y REFUND ─────────────────────────────
  console.log('\n[TEST 7] Ciclo de vida de TRANSFER y REFUND');
  {
    // TRANSFER
    const allowedTransfer = FinancialStateMachine.getAllowedTransitions('TRANSFER');
    assert.ok(allowedTransfer.includes('POSTED'));
    assert.ok(allowedTransfer.includes('CONFIRMED'));
    assert.ok(allowedTransfer.includes('REJECTED'));
    assert.ok(allowedTransfer.includes('DUPLICATE'));
    assert.strictEqual(FinancialStateMachine.canTransition('TRANSFER', 'CANDIDATE'), false);

    // REFUND
    const allowedRefund = FinancialStateMachine.getAllowedTransitions('REFUND');
    assert.ok(allowedRefund.includes('POSTED'));
    assert.ok(allowedRefund.includes('CONFIRMED'));
    assert.ok(allowedRefund.includes('REJECTED'));
    assert.ok(allowedRefund.includes('DUPLICATE'));
    assert.strictEqual(FinancialStateMachine.canTransition('REFUND', 'CANDIDATE'), false);
    assert.strictEqual(FinancialStateMachine.canTransition('REFUND', 'TRANSFER'), false);

    console.log('  [OK] Ciclos de TRANSFER y REFUND consistentes');
  }

  // ── [TEST 8] Reactivación controlada desde DUPLICATE y REJECTED ─────────────
  console.log('\n[TEST 8] Reactivación controlada desde DUPLICATE y REJECTED');
  {
    // DUPLICATE: puede reactivarse a CANDIDATE o forzarse a CONFIRMED
    assert.strictEqual(FinancialStateMachine.canTransition('DUPLICATE', 'CANDIDATE'), true);
    assert.strictEqual(FinancialStateMachine.canTransition('DUPLICATE', 'CONFIRMED'), true);
    assert.strictEqual(FinancialStateMachine.canTransition('DUPLICATE', 'REJECTED'), true);
    assert.strictEqual(FinancialStateMachine.canTransition('DUPLICATE', 'POSTED'), false);
    assert.strictEqual(FinancialStateMachine.canTransition('DUPLICATE', 'REFUND'), false);

    // REJECTED: puede reactivarse a CANDIDATE o restaurarse a CONFIRMED
    assert.strictEqual(FinancialStateMachine.canTransition('REJECTED', 'CANDIDATE'), true);
    assert.strictEqual(FinancialStateMachine.canTransition('REJECTED', 'CONFIRMED'), true);
    assert.strictEqual(FinancialStateMachine.canTransition('REJECTED', 'POSTED'), false);
    assert.strictEqual(FinancialStateMachine.canTransition('REJECTED', 'TRANSFER'), false);

    console.log('  [OK] Reactivación controlada sin saltos ilegales verificada');
  }

  // ── [TEST 9] Ejecución de transition() y efectos colaterales ────────────────
  console.log('\n[TEST 9] Ejecución de transition() y efectos colaterales');
  {
    const tx = createMockTransaction({ status: 'CANDIDATE' });

    // 1. Transición a POSTED asigna postedAt
    const postedDate = new Date('2026-10-15T10:00:00Z');
    const postedTx = FinancialStateMachine.transition(tx, 'POSTED', {
      postedAt: postedDate,
    });
    assert.strictEqual(postedTx.status, 'POSTED');
    assert.deepStrictEqual(postedTx.postedAt, postedDate);
    assert.ok(postedTx.updatedAt >= tx.updatedAt);

    // 2. Transición a TRANSFER asigna linkedTransactionId
    const candTx = createMockTransaction({ status: 'CANDIDATE' });
    const transferTx = FinancialStateMachine.transition(candTx, 'TRANSFER', {
      linkedTransactionId: 'tx_contraparte_999',
    });
    assert.strictEqual(transferTx.status, 'TRANSFER');
    assert.strictEqual(transferTx.linkedTransactionId, 'tx_contraparte_999');

    // 3. Idempotencia: transicionar al mismo estado no lanza error
    const sameStateTx = FinancialStateMachine.transition(postedTx, 'POSTED', {
      allowSameState: true,
    });
    assert.strictEqual(sameStateTx.status, 'POSTED');

    // 4. Intento ilegal lanza InvalidTransactionStateTransitionError
    assert.throws(
      () => {
        FinancialStateMachine.transition(postedTx, 'CANDIDATE');
      },
      (err: any) => {
        assert.ok(err instanceof InvalidTransactionStateTransitionError);
        assert.strictEqual(err.fromStatus, 'POSTED');
        assert.strictEqual(err.toStatus, 'CANDIDATE');
        assert.ok(err.message.includes('POSTED'));
        assert.ok(err.message.includes('CANDIDATE'));
        return true;
      },
    );

    console.log('  [OK] transition() y gestión de errores ejecutados con precisión');
  }

  // ── [TEST 10] Clasificación semántica de estados ────────────────────────────
  console.log('\n[TEST 10] Clasificación semántica de estados');
  {
    // isEffective (impacto en saldos)
    assert.strictEqual(FinancialStateMachine.isEffective('CONFIRMED'), true);
    assert.strictEqual(FinancialStateMachine.isEffective('PENDING'), true);
    assert.strictEqual(FinancialStateMachine.isEffective('POSTED'), true);
    assert.strictEqual(FinancialStateMachine.isEffective('TRANSFER'), true);
    assert.strictEqual(FinancialStateMachine.isEffective('REFUND'), true);
    assert.strictEqual(FinancialStateMachine.isEffective('CANDIDATE'), false);
    assert.strictEqual(FinancialStateMachine.isEffective('MATCHED'), false);
    assert.strictEqual(FinancialStateMachine.isEffective('DUPLICATE'), false);
    assert.strictEqual(FinancialStateMachine.isEffective('REJECTED'), false);

    // isSettled
    assert.strictEqual(FinancialStateMachine.isSettled('POSTED'), true);
    assert.strictEqual(FinancialStateMachine.isSettled('PENDING'), false);
    assert.strictEqual(FinancialStateMachine.isSettled('CONFIRMED'), false);

    // isPending
    assert.strictEqual(FinancialStateMachine.isPending('PENDING'), true);
    assert.strictEqual(FinancialStateMachine.isPending('CANDIDATE'), true);
    assert.strictEqual(FinancialStateMachine.isPending('MATCHED'), true);
    assert.strictEqual(FinancialStateMachine.isPending('POSTED'), false);

    // isDiscarded
    assert.strictEqual(FinancialStateMachine.isDiscarded('DUPLICATE'), true);
    assert.strictEqual(FinancialStateMachine.isDiscarded('REJECTED'), true);
    assert.strictEqual(FinancialStateMachine.isDiscarded('CONFIRMED'), false);

    console.log('  [OK] Clasificaciones semánticas verificadas correctamente');
  }

  console.log('\n[DONE] ¡Todos los tests de US-028 pasaron exitosamente (10/10)!');
}
