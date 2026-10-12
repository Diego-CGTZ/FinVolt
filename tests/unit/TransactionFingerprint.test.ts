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
assert.ok = (condition: unknown, msg?: string): asserts condition => {
  if (!condition) throw new Error(msg || 'Expected truthy');
};

import {
  TransactionFingerprintService,
  type FingerprintInput,
} from '../../src/domain/services/fingerprint/TransactionFingerprintService';
import { sha256Hex } from '../../src/domain/services/fingerprint/Sha256';
import type { Transaction } from '../../src/domain/models/Transaction';
import type { TransactionCandidate } from '../../src/domain/models/TransactionCandidate';

export async function runTransactionFingerprintTests() {
  console.log('[TEST] Iniciando pruebas de US-025: Fingerprint determinístico...');

  // ── [TEST 1] Estabilidad determinística ─────────────────────────────────────
  console.log('\n[TEST 1] Estabilidad determinística (mismo evento produce fingerprint idéntico)');
  {
    const baseInput: FingerprintInput = {
      account: 'acc_bbva_main',
      amount: 450.00,
      currency: 'MXN',
      date: new Date('2026-10-12T10:30:00Z'),
      merchant: 'OXXO',
      type: 'EXPENSE',
    };

    const fp1 = TransactionFingerprintService.calculate(baseInput);
    const fp2 = TransactionFingerprintService.calculate(baseInput);
    const fp3 = TransactionFingerprintService.calculate({ ...baseInput });

    assert.strictEqual(fp1, fp2, 'Dos cálculos consecutivos con el mismo objeto deben ser idénticos');
    assert.strictEqual(fp1, fp3, 'Cálculo con copia de los datos debe ser idéntico');
    assert.strictEqual(fp1.length, 64, 'El fingerprint debe ser un hash SHA-256 de 64 caracteres hexadecimales');
    assert.ok(TransactionFingerprintService.isValidFingerprint(fp1), 'El fingerprint generado debe ser válido');

    // Validar concordancia con la cadena canónica
    const canonical = TransactionFingerprintService.buildCanonicalString(baseInput);
    assert.strictEqual(canonical, 'acc_bbva_main|45000|MXN|2026-10-12|oxxo|EXPENSE');
    assert.strictEqual(fp1, sha256Hex(canonical), 'El fingerprint debe coincidir exactamente con sha256(canonical)');

    console.log('  [OK] Estabilidad determinística y hash canónico validados');
  }

  // ── [TEST 2] Sensibilidad a variación en cada uno de los 6 campos requeridos ───
  console.log('\n[TEST 2] Sensibilidad a variaciones en los 6 campos requeridos (AC)');
  {
    const base: FingerprintInput = {
      account: 'acc_123',
      amountMinor: 50000, // 500.00
      currency: 'MXN',
      date: '2026-10-12',
      merchant: 'Starbucks',
      type: 'EXPENSE',
    };
    const baseFp = TransactionFingerprintService.calculate(base);

    // 1. Variación en account
    const diffAccount = TransactionFingerprintService.calculate({ ...base, account: 'acc_999' });
    assert.notStrictEqual(diffAccount, baseFp, 'Cambio de account debe alterar el fingerprint');

    // 2. Variación en amount
    const diffAmount = TransactionFingerprintService.calculate({ ...base, amountMinor: 50001 });
    assert.notStrictEqual(diffAmount, baseFp, 'Cambio de amount debe alterar el fingerprint');

    // 3. Variación en currency
    const diffCurrency = TransactionFingerprintService.calculate({ ...base, currency: 'USD' });
    assert.notStrictEqual(diffCurrency, baseFp, 'Cambio de currency debe alterar el fingerprint');

    // 4. Variación en date
    const diffDate = TransactionFingerprintService.calculate({ ...base, date: '2026-10-13' });
    assert.notStrictEqual(diffDate, baseFp, 'Cambio de date debe alterar el fingerprint');

    // 5. Variación en merchant
    const diffMerchant = TransactionFingerprintService.calculate({ ...base, merchant: 'Cielito Querido' });
    assert.notStrictEqual(diffMerchant, baseFp, 'Cambio de merchant debe alterar el fingerprint');

    // 6. Variación en type
    const diffType = TransactionFingerprintService.calculate({ ...base, type: 'INCOME' });
    assert.notStrictEqual(diffType, baseFp, 'Cambio de type debe alterar el fingerprint');

    console.log('  [OK] Los 6 campos son determinantes para la unicidad del fingerprint');
  }

  // ── [TEST 3] Normalización de formatos de fecha ─────────────────────────────
  console.log('\n[TEST 3] Normalización de formatos de fecha (Date vs ISO vs YYYY-MM-DD)');
  {
    const dateObj = new Date('2026-10-12T18:45:00.000Z');
    const isoString = '2026-10-12T18:45:00.000Z';
    const plainDate = '2026-10-12';

    const fpFromDateObj = TransactionFingerprintService.calculate({
      account: 'acc_test',
      amount: 100,
      currency: 'MXN',
      date: dateObj,
      merchant: 'Uber',
      type: 'EXPENSE',
    });

    const fpFromIsoString = TransactionFingerprintService.calculate({
      account: 'acc_test',
      amount: 100,
      currency: 'MXN',
      date: isoString,
      merchant: 'Uber',
      type: 'EXPENSE',
    });

    const fpFromPlainDate = TransactionFingerprintService.calculate({
      account: 'acc_test',
      amount: 100,
      currency: 'MXN',
      date: plainDate,
      merchant: 'Uber',
      type: 'EXPENSE',
    });

    assert.strictEqual(fpFromDateObj, fpFromIsoString, 'Date object e ISO string deben converger al mismo fingerprint');
    assert.strictEqual(fpFromIsoString, fpFromPlainDate, 'ISO string y plain date YYYY-MM-DD deben converger al mismo fingerprint');

    console.log('  [OK] Fechas normalizadas convergentemente a YYYY-MM-DD');
  }

  // ── [TEST 4] Normalización de divisa y tipo (Case insensitivity & trim) ───────
  console.log('\n[TEST 4] Normalización de divisa y tipo (Case insensitivity & trim)');
  {
    const fp1 = TransactionFingerprintService.calculate({
      account: 'acc_1',
      amountMinor: 25000,
      currency: 'mxn',
      date: '2026-10-12',
      merchant: 'Amazon',
      type: 'expense',
    });

    const fp2 = TransactionFingerprintService.calculate({
      account: 'acc_1',
      amountMinor: 25000,
      currency: '  MXN  ',
      date: '2026-10-12',
      merchant: 'Amazon',
      type: '  EXPENSE  ',
    });

    assert.strictEqual(fp1, fp2, 'Mayúsculas/minúsculas y espacios en currency y type deben normalizarse');

    console.log('  [OK] Currency y type normalizados correctamente');
  }

  // ── [TEST 5] Normalización de comercio ──────────────────────────────────────
  console.log('\n[TEST 5] Normalización de comercio (Espacios, mayúsculas y limpieza)');
  {
    const fpLower = TransactionFingerprintService.calculate({
      account: 'acc_1',
      amount: 300,
      currency: 'MXN',
      date: '2026-10-12',
      merchant: 'walmart supercenter',
      type: 'EXPENSE',
    });

    const fpUpperSpaces = TransactionFingerprintService.calculate({
      account: 'acc_1',
      amount: 300,
      currency: 'MXN',
      date: '2026-10-12',
      merchant: '  WALMART   SUPERCENTER  ',
      type: 'EXPENSE',
    });

    assert.strictEqual(fpLower, fpUpperSpaces, 'Variaciones en espacios y mayúsculas de comercio deben converger');

    console.log('  [OK] Comercio normalizado robustamente');
  }

  // ── [TEST 6] Normalización de cuentas e indicios (AccountHint) ───────────────
  console.log('\n[TEST 6] Normalización de cuentas e indicios (AccountHint vs accountId)');
  {
    const fromHint = TransactionFingerprintService.calculate({
      account: { bankName: 'BBVA', last4Digits: '1029' },
      amount: 85.50,
      currency: 'MXN',
      date: '2026-10-12',
      merchant: 'Oxxo',
      type: 'EXPENSE',
    });

    const fromExplicitString = TransactionFingerprintService.calculate({
      account: 'bbva_1029',
      amount: 85.50,
      currency: 'MXN',
      date: '2026-10-12',
      merchant: 'Oxxo',
      type: 'EXPENSE',
    });

    assert.strictEqual(fromHint, fromExplicitString, 'AccountHint debe normalizarse congruentemente');

    const fromUnassigned = TransactionFingerprintService.calculate({
      account: null,
      amount: 85.50,
      currency: 'MXN',
      date: '2026-10-12',
      merchant: 'Oxxo',
      type: 'EXPENSE',
    });

    const canonicalUnassigned = TransactionFingerprintService.buildCanonicalString({
      account: null,
      amount: 85.50,
      currency: 'MXN',
      date: '2026-10-12',
      merchant: 'Oxxo',
      type: 'EXPENSE',
    });

    assert.ok(canonicalUnassigned.startsWith('unassigned|'), 'Cuenta nula debe fallback a "unassigned"');
    assert.notStrictEqual(fromUnassigned, fromHint);

    console.log('  [OK] Normalización de cuentas e indicios verificada');
  }

  // ── [TEST 7] Equivalencia de montos decimales y centavos ────────────────────
  console.log('\n[TEST 7] Equivalencia de montos decimales y centavos (amount vs amountMinor)');
  {
    const fromDecimal = TransactionFingerprintService.calculate({
      account: 'acc_main',
      amount: 129.99,
      currency: 'MXN',
      date: '2026-10-12',
      merchant: 'Netflix',
      type: 'EXPENSE',
    });

    const fromMinor = TransactionFingerprintService.calculate({
      account: 'acc_main',
      amountMinor: 12999,
      currency: 'MXN',
      date: '2026-10-12',
      merchant: 'Netflix',
      type: 'EXPENSE',
    });

    assert.strictEqual(fromDecimal, fromMinor, '129.99 decimal y 12999 centavos deben producir el mismo fingerprint');

    console.log('  [OK] Equivalencia exacta entre amount y amountMinor');
  }

  // ── [TEST 8] Generación desde Transaction y TransactionCandidate ─────────────
  console.log('\n[TEST 8] Generación desde Transaction y TransactionCandidate');
  {
    const occurredAt = new Date('2026-10-12T14:00:00Z');

    const transaction: Transaction = {
      id: 'tx_123',
      userId: 'usr_abc',
      accountId: 'acc_banorte',
      type: 'EXPENSE',
      amountMinor: 67000,
      currency: 'MXN',
      occurredAt,
      postedAt: null,
      merchantRaw: 'LIVERPOOL POLANCO',
      merchant: 'Liverpool',
      description: null,
      categoryId: null,
      source: 'NOTIFICATION',
      sourceEventId: 'ev_1',
      status: 'CONFIRMED',
      confidenceScore: 95,
      fingerprint: null,
      linkedTransactionId: null,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };

    const candidate: TransactionCandidate = {
      id: 'cand_456',
      userId: 'usr_abc',
      rawEventId: 'ev_1',
      source: 'ANDROID_NOTIFICATION',
      provider: 'BANORTE',
      amountMinor: 67000,
      amount: 670.00,
      currency: 'MXN',
      type: 'EXPENSE',
      merchantRaw: 'LIVERPOOL POLANCO',
      merchant: 'Liverpool',
      occurredAt,
      confidenceScore: 95,
      accountHint: { last4Digits: '5566', bankName: 'Banorte' },
      status: 'PENDING_REVIEW',
      rawPayload: {},
      metadata: {},
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };

    const txFp = TransactionFingerprintService.fromTransaction(transaction);
    assert.ok(TransactionFingerprintService.isValidFingerprint(txFp));

    // Al asignar la misma cuenta bancaria de destino al candidato, el fingerprint converge
    const candFp = TransactionFingerprintService.fromCandidate(candidate, 'acc_banorte');
    assert.strictEqual(candFp, txFp, 'El candidato con cuenta asignada debe generar el mismo fingerprint que la transacción');

    console.log('  [OK] fromTransaction y fromCandidate validados exitosamente');
  }

  // ── [TEST 9] Detección y coincidencia cross-source con matches() ────────────
  console.log('\n[TEST 9] Detección y coincidencia cross-source con matches()');
  {
    const notificationEvent: FingerprintInput = {
      account: 'acc_debito',
      amount: 350.00,
      currency: 'MXN',
      date: '2026-10-12',
      merchant: 'Uber',
      type: 'EXPENSE',
    };

    const statementEvent: FingerprintInput = {
      account: 'acc_debito',
      amountMinor: 35000,
      currency: 'MXN',
      date: new Date('2026-10-12T23:59:59Z'),
      merchant: 'UBER TRIP',
      type: 'EXPENSE',
    };

    // Si el comercio de ambas fue normalizado a 'uber', coinciden
    const isMatching = TransactionFingerprintService.matches(
      notificationEvent,
      { ...statementEvent, merchant: 'uber' },
    );
    assert.strictEqual(isMatching, true, 'Eventos equivalentes deben coincidir vía matches()');

    const differentEvent: FingerprintInput = {
      ...notificationEvent,
      amount: 351.00,
    };
    assert.strictEqual(TransactionFingerprintService.matches(notificationEvent, differentEvent), false);

    console.log('  [OK] matches() discrimina duplicados correctamente');
  }

  // ── [TEST 10] Validación de formato SHA-256 (isValidFingerprint) ─────────────
  console.log('\n[TEST 10] Validación de formato SHA-256 (isValidFingerprint)');
  {
    const valid = 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0';
    assert.strictEqual(TransactionFingerprintService.isValidFingerprint(valid), true);

    // Inválidos
    assert.strictEqual(TransactionFingerprintService.isValidFingerprint(''), false);
    assert.strictEqual(TransactionFingerprintService.isValidFingerprint(null), false);
    assert.strictEqual(TransactionFingerprintService.isValidFingerprint(undefined), false);
    assert.strictEqual(TransactionFingerprintService.isValidFingerprint('abc123'), false); // muy corto
    assert.strictEqual(TransactionFingerprintService.isValidFingerprint(valid + '0'), false); // 65 caracteres
    assert.strictEqual(TransactionFingerprintService.isValidFingerprint('z'.repeat(64)), false); // no hex

    console.log('  [OK] isValidFingerprint valida correctamente');
  }

  console.log('\n[DONE] ¡Todos los tests de US-025 pasaron exitosamente (10/10)!');
}
