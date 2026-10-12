/**
 * Pruebas unitarias para US-026: Detección de Duplicados
 *
 * Criterios de Aceptación:
 * - Coincidencias exactas y aproximadas.
 * - No crea duplicados.
 * - Marca eventos como DUPLICATE cuando corresponda.
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
assert.ok = (condition: unknown, msg?: string): asserts condition => {
  if (!condition) throw new Error(msg || 'Expected truthy');
};
assert.rejects = async (fn: () => Promise<unknown>, errorRegex: RegExp) => {
  try {
    await fn();
    throw new Error('Expected function to throw, but it succeeded');
  } catch (err: unknown) {
    if (err instanceof Error && errorRegex.test(err.message)) {
      return;
    }
    throw err;
  }
};

import { DuplicateDetectorService } from '../../src/domain/services/duplication/DuplicateDetectorService';
import { TransactionFingerprintService } from '../../src/domain/services/fingerprint/TransactionFingerprintService';
import { TransactionCandidateService } from '../../src/domain/services/TransactionCandidateService';
import { RawEventService } from '../../src/domain/services/RawEventService';
import { NotificationIngestionPipeline } from '../../src/application/services/NotificationIngestionPipeline';
import { InMemoryTransactionCandidateRepository } from '../../src/infrastructure/database/InMemoryTransactionCandidateRepository';
import type { Transaction } from '../../src/domain/models/Transaction';
import type { TransactionCandidate } from '../../src/domain/models/TransactionCandidate';
import type { IRawEventRepository, RawEventFilter } from '../../src/domain/repositories/IRawEventRepository';
import type {
  CreateRawEventDTO,
  RawEvent,
  RawEventSource,
  UpdateRawEventStatusDTO,
} from '../../src/domain/models/RawEvent';

// Mock en memoria para IRawEventRepository
class MockRawEventRepository implements IRawEventRepository {
  private events: Map<string, RawEvent> = new Map();

  async save(dto: CreateRawEventDTO): Promise<RawEvent> {
    const id = `raw_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date();
    const event: RawEvent = {
      id,
      userId: 'test-user-123',
      source: dto.source,
      sourceId: dto.sourceId,
      payload: dto.payload,
      rawText: dto.rawText,
      metadata: dto.metadata || {},
      status: 'PENDING',
      retryCount: 0,
      receivedAt: dto.receivedAt || now,
      createdAt: now,
      updatedAt: now,
    };
    this.events.set(id, event);
    return { ...event };
  }

  async findById(id: string): Promise<RawEvent | null> {
    const event = this.events.get(id);
    return event ? { ...event } : null;
  }

  async findBySourceId(source: RawEventSource, sourceId: string): Promise<RawEvent | null> {
    for (const e of this.events.values()) {
      if (e.source === source && e.sourceId === sourceId) return { ...e };
    }
    return null;
  }

  async getPendingEvents(): Promise<RawEvent[]> {
    return Array.from(this.events.values()).filter((e) => e.status === 'PENDING');
  }

  async getEvents(filter?: RawEventFilter): Promise<RawEvent[]> {
    let list = Array.from(this.events.values());
    if (filter?.status) list = list.filter((e) => e.status === filter.status);
    if (filter?.source) list = list.filter((e) => e.source === filter.source);
    return list;
  }

  async updateStatus(id: string, updates: UpdateRawEventStatusDTO): Promise<RawEvent> {
    const event = this.events.get(id);
    if (!event) throw new Error(`Not found: ${id}`);
    const updated: RawEvent = {
      ...event,
      status: updates.status,
      errorMessage: updates.errorMessage !== undefined ? (updates.errorMessage ?? undefined) : event.errorMessage,
      processedAt: updates.processedAt !== undefined ? (updates.processedAt ?? undefined) : event.processedAt,
      updatedAt: new Date(),
    };
    this.events.set(id, updated);
    return { ...updated };
  }

  async markForReprocessing(id: string): Promise<RawEvent> {
    const event = this.events.get(id);
    if (!event) throw new Error(`Not found: ${id}`);
    const updated: RawEvent = {
      ...event,
      status: 'PENDING',
      retryCount: event.retryCount + 1,
      errorMessage: undefined,
      updatedAt: new Date(),
    };
    this.events.set(id, updated);
    return { ...updated };
  }
}

export async function runDuplicateDetectorTests() {
  console.log('[TEST] Iniciando pruebas de US-026: Detección de Duplicados...');

  // ── [TEST 1] Coincidencia Exacta por Fingerprint ───────────────────────────
  console.log('\n[TEST 1] Coincidencia Exacta por Fingerprint determinístico (100% confianza)');
  {
    const occurredAt = new Date('2026-10-12T10:00:00Z');
    const existingTx: Transaction = {
      id: 'tx_exact_1',
      userId: 'usr_1',
      accountId: 'acc_bbva_1',
      type: 'EXPENSE',
      amountMinor: 35000,
      currency: 'MXN',
      occurredAt,
      postedAt: null,
      merchantRaw: 'OXXO PLAZA',
      merchant: 'Oxxo',
      description: null,
      categoryId: null,
      source: 'MANUAL',
      sourceEventId: null,
      status: 'CONFIRMED',
      confidenceScore: 100,
      fingerprint: null,
      linkedTransactionId: null,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
    existingTx.fingerprint = TransactionFingerprintService.fromTransaction(existingTx);

    const incomingCandidate: Partial<TransactionCandidate> = {
      id: 'cand_new_1',
      userId: 'usr_1',
      rawEventId: 'ev_1',
      amountMinor: 35000,
      amount: 350.00,
      currency: 'MXN',
      type: 'EXPENSE',
      merchantRaw: 'OXXO PLAZA',
      merchant: 'Oxxo',
      occurredAt,
      accountHint: { last4Digits: '1', bankName: 'acc_bbva' },
    };

    const result = DuplicateDetectorService.detectDuplicate(
      incomingCandidate as TransactionCandidate,
      { transactions: [existingTx] },
    );

    assert.strictEqual(result.isDuplicate, true, 'Debe detectar duplicado exacto');
    assert.strictEqual(result.matchType, 'EXACT');
    assert.strictEqual(result.confidence, 100);
    assert.strictEqual(result.matchedEntity?.id, 'tx_exact_1');
    assert.strictEqual(result.matchedEntity?.type, 'TRANSACTION');

    console.log('  [OK] Coincidencia exacta validada con 100% de confianza');
  }

  // ── [TEST 2] Coincidencia Aproximada por Desfase Temporal ────────────────────
  console.log('\n[TEST 2] Coincidencia Aproximada por Desfase Temporal (±48 horas)');
  {
    const notifDate = new Date('2026-10-12T14:30:00Z');
    const statementDate = new Date('2026-10-13T09:15:00Z'); // 18.75 horas después

    const existingTx: Transaction = {
      id: 'tx_statement_1',
      userId: 'usr_1',
      accountId: 'acc_banorte',
      type: 'EXPENSE',
      amountMinor: 89900, // 899.00
      currency: 'MXN',
      occurredAt: statementDate,
      postedAt: statementDate,
      merchantRaw: 'LIVERPOOL POLANCO CDMX',
      merchant: 'Liverpool',
      description: null,
      categoryId: null,
      source: 'STATEMENT_PDF',
      sourceEventId: 'ev_pdf',
      status: 'CONFIRMED',
      confidenceScore: 95,
      fingerprint: null,
      linkedTransactionId: null,
      createdAt: statementDate,
      updatedAt: statementDate,
    };

    // Candidato entrante desde notificación con fecha previa del día de la compra
    const incomingNotification: Partial<TransactionCandidate> = {
      id: 'cand_notif_1',
      userId: 'usr_1',
      rawEventId: 'ev_notif',
      amountMinor: 89900,
      amount: 899.00,
      currency: 'MXN',
      type: 'EXPENSE',
      merchantRaw: 'LIVERPOOL',
      merchant: 'Liverpool',
      occurredAt: notifDate,
      accountHint: { last4Digits: '9988', bankName: 'Banorte' },
    };

    const result = DuplicateDetectorService.detectDuplicate(
      incomingNotification as TransactionCandidate,
      { transactions: [existingTx] },
    );

    assert.strictEqual(result.isDuplicate, true, 'Debe detectar duplicado aproximado por ventana temporal');
    assert.strictEqual(result.matchType, 'APPROXIMATE');
    assert.ok(result.confidence >= 75 && result.confidence <= 99, 'Confianza en rango 75..99');
    assert.strictEqual(result.matchedEntity?.id, 'tx_statement_1');

    console.log(`  [OK] Coincidencia aproximada detectada con confianza ${result.confidence}%`);
  }

  // ── [TEST 3] Coincidencia Aproximada por Similitud de Comercio ───────────────
  console.log('\n[TEST 3] Coincidencia Aproximada por Similitud de Comercio (US-024)');
  {
    const sameDate = new Date('2026-10-12T12:00:00Z');

    const existingCandidate: TransactionCandidate = {
      id: 'cand_existing_uber',
      userId: 'usr_1',
      rawEventId: 'ev_1',
      source: 'ANDROID_NOTIFICATION',
      provider: 'BBVA',
      amountMinor: 15400,
      amount: 154.00,
      currency: 'MXN',
      type: 'EXPENSE',
      merchantRaw: 'UBER *TRIP AY6Z8 HELP.UBER',
      merchant: 'Uber',
      occurredAt: sameDate,
      confidenceScore: 90,
      status: 'PENDING_REVIEW',
      rawPayload: {},
      metadata: {},
      createdAt: sameDate,
      updatedAt: sameDate,
    };

    const incomingFromEmail: Partial<TransactionCandidate> = {
      id: 'cand_incoming_email',
      userId: 'usr_1',
      rawEventId: 'ev_2',
      amountMinor: 15400,
      amount: 154.00,
      currency: 'MXN',
      type: 'EXPENSE',
      merchantRaw: 'Uber Technologies Inc',
      merchant: 'Uber',
      occurredAt: sameDate,
    };

    const result = DuplicateDetectorService.detectDuplicate(
      incomingFromEmail as TransactionCandidate,
      { candidates: [existingCandidate] },
    );

    assert.strictEqual(result.isDuplicate, true, 'Variantes de Uber deben coincidir por similitud canónica');
    assert.ok(result.matchType === 'APPROXIMATE' || result.matchType === 'EXACT');
    assert.strictEqual(result.matchedEntity?.id, 'cand_existing_uber');

    console.log('  [OK] Similitud canónica de comercios agrupó los movimientos');
  }

  // ── [TEST 4] Rechazo de No-Duplicados por Diferencias Críticas ───────────────
  console.log('\n[TEST 4] Rechazo de No-Duplicados ante diferencias en monto, moneda, tipo o comercio');
  {
    const baseDate = new Date('2026-10-12T12:00:00Z');
    const existingTx: Transaction = {
      id: 'tx_base',
      userId: 'usr_1',
      accountId: 'acc_1',
      type: 'EXPENSE',
      amountMinor: 50000, // 500.00
      currency: 'MXN',
      occurredAt: baseDate,
      postedAt: null,
      merchantRaw: 'Starbucks',
      merchant: 'Starbucks',
      description: null,
      categoryId: null,
      source: 'MANUAL',
      sourceEventId: null,
      status: 'CONFIRMED',
      confidenceScore: 100,
      fingerprint: null,
      linkedTransactionId: null,
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    // 1. Distinto monto
    const diffAmount = DuplicateDetectorService.detectDuplicate(
      { account: 'acc_1', amountMinor: 60000, currency: 'MXN', date: baseDate, merchant: 'Starbucks', type: 'EXPENSE' },
      { transactions: [existingTx] },
    );
    assert.strictEqual(diffAmount.isDuplicate, false, 'Distinto monto no debe ser duplicado');

    // 2. Distinta divisa
    const diffCurrency = DuplicateDetectorService.detectDuplicate(
      { account: 'acc_1', amountMinor: 50000, currency: 'USD', date: baseDate, merchant: 'Starbucks', type: 'EXPENSE' },
      { transactions: [existingTx] },
    );
    assert.strictEqual(diffCurrency.isDuplicate, false, 'Distinta moneda no debe ser duplicado');

    // 3. Distinto tipo (EXPENSE vs INCOME)
    const diffType = DuplicateDetectorService.detectDuplicate(
      { account: 'acc_1', amountMinor: 50000, currency: 'MXN', date: baseDate, merchant: 'Starbucks', type: 'INCOME' },
      { transactions: [existingTx] },
    );
    assert.strictEqual(diffType.isDuplicate, false, 'Distinto tipo no debe ser duplicado');

    // 4. Distinto comercio no relacionado
    const diffMerchant = DuplicateDetectorService.detectDuplicate(
      { account: 'acc_1', amountMinor: 50000, currency: 'MXN', date: baseDate, merchant: 'Gasolinera Pemex', type: 'EXPENSE' },
      { transactions: [existingTx] },
    );
    assert.strictEqual(diffMerchant.isDuplicate, false, 'Comercio totalmente disímil no debe ser duplicado');

    // 5. Fecha más allá de la ventana permitida (>48h)
    const fiveDaysLater = new Date('2026-10-17T12:00:00Z');
    const diffDate = DuplicateDetectorService.detectDuplicate(
      { account: 'acc_1', amountMinor: 50000, currency: 'MXN', date: fiveDaysLater, merchant: 'Starbucks', type: 'EXPENSE' },
      { transactions: [existingTx] },
    );
    assert.strictEqual(diffDate.isDuplicate, false, 'Fecha fuera de ventana (>48h) no debe ser duplicado');

    console.log('  [OK] Rechazo riguroso de falsos positivos validado');
  }

  // ── [TEST 5] Compatibilidad de Cuentas (unassigned vs asignadas) ─────────────
  console.log('\n[TEST 5] Compatibilidad de Cuentas (unassigned vs explícitas y hints)');
  {
    const date = new Date('2026-10-12T12:00:00Z');
    const existingTx: Transaction = {
      id: 'tx_account_test',
      userId: 'usr_1',
      accountId: 'bbva_1029',
      type: 'EXPENSE',
      amountMinor: 20000,
      currency: 'MXN',
      occurredAt: date,
      postedAt: null,
      merchantRaw: 'Oxxo',
      merchant: 'Oxxo',
      description: null,
      categoryId: null,
      source: 'MANUAL',
      sourceEventId: null,
      status: 'CONFIRMED',
      confidenceScore: 100,
      fingerprint: null,
      linkedTransactionId: null,
      createdAt: date,
      updatedAt: date,
    };

    // Caso A: cuenta unassigned (común en notificaciones donde aún no se conoce la cuenta) -> Permite match
    const withUnassigned = DuplicateDetectorService.detectDuplicate(
      { account: null, amountMinor: 20000, currency: 'MXN', date, merchant: 'Oxxo', type: 'EXPENSE' },
      { transactions: [existingTx] },
    );
    assert.strictEqual(withUnassigned.isDuplicate, true, 'Cuenta unassigned debe permitir match si monto/fecha/comercio coinciden');

    // Caso B: dos cuentas explícitamente distintas -> NO debe coincidir
    const withDifferentAccount = DuplicateDetectorService.detectDuplicate(
      { account: 'santander_5566', amountMinor: 20000, currency: 'MXN', date, merchant: 'Oxxo', type: 'EXPENSE' },
      { transactions: [existingTx] },
    );
    assert.strictEqual(withDifferentAccount.isDuplicate, false, 'Dos cuentas explícitamente distintas no deben considerarse duplicadas');

    console.log('  [OK] Reglas de compatibilidad de cuentas validadas');
  }

  // ── [TEST 6] Marcar Candidato como DUPLICATE en TransactionCandidateService ──
  console.log('\n[TEST 6] Marcar Candidato como DUPLICATE en TransactionCandidateService');
  {
    const candidateRepo = new InMemoryTransactionCandidateRepository();
    const service = new TransactionCandidateService(candidateRepo);

    const cand = await service.createCandidate({
      rawEventId: 'ev_123',
      source: 'ANDROID_NOTIFICATION',
      provider: 'BBVA',
      amount: 450.00,
      currency: 'MXN',
      type: 'EXPENSE',
      merchant: 'Oxxo',
      confidenceScore: 85,
    });
    assert.strictEqual(cand.status, 'PENDING_REVIEW');
    assert.strictEqual(service.isFinalized(cand), false);

    const duplicateMarked = await service.markAsDuplicate(cand.id, 'Duplicado de tx_123', {
      matchedTxId: 'tx_123',
    });
    assert.strictEqual(duplicateMarked.status, 'DUPLICATE');
    assert.strictEqual(duplicateMarked.metadata.duplicateReason, 'Duplicado de tx_123');
    assert.strictEqual(service.isFinalized(duplicateMarked), true);

    // Salvaguarda: no se puede duplicar un candidato ya formalmente reconciliado
    const cand2 = await service.createCandidate({
      rawEventId: 'ev_456',
      source: 'ANDROID_NOTIFICATION',
      provider: 'BBVA',
      amount: 100,
      type: 'EXPENSE',
      confidenceScore: 90,
    });
    await service.reconcileCandidate(cand2.id);
    await assert.rejects(
      async () => service.markAsDuplicate(cand2.id),
      /reconciliado/i,
    );

    console.log('  [OK] Estado DUPLICATE gestionado en el ciclo de vida del candidato');
  }

  // ── [TEST 7] Marcar Evento como DUPLICATE en RawEventService ─────────────────
  console.log('\n[TEST 7] Marcar Evento como DUPLICATE en RawEventService');
  {
    const rawRepo = new MockRawEventRepository();
    const rawService = new RawEventService(rawRepo);

    const { event } = await rawService.capture({
      source: 'ANDROID_NOTIFICATION',
      payload: { text: 'Compra por $250' },
    });
    assert.strictEqual(event.status, 'PENDING');

    const marked = await rawService.markAsDuplicate(event.id, 'Evento idéntico capturado previamente');
    assert.strictEqual(marked.status, 'DUPLICATE');
    assert.strictEqual(marked.errorMessage, 'Evento idéntico capturado previamente');

    console.log('  [OK] RawEvent marcado exitosamente con estado DUPLICATE');
  }

  // ── [TEST 8] Prevención de Duplicados en NotificationIngestionPipeline ────────
  console.log('\n[TEST 8] Prevención de Duplicados en NotificationIngestionPipeline');
  {
    const rawRepo = new MockRawEventRepository();
    const rawService = new RawEventService(rawRepo);
    const candidateRepo = new InMemoryTransactionCandidateRepository();

    const pipeline = new NotificationIngestionPipeline(rawService, candidateRepo, undefined, {
      enableDeduplication: true,
    });

    const notifSample = {
      packageName: 'com.bbva.bbvacontigo',
      title: 'BBVA: Compra autorizada',
      text: 'Compra por $750.00 en OXXO con tarjeta Débito *1029 el 12/10/2026 14:00',
      postTime: Date.now(),
      key: 'notif_1',
    };

    // Primera ejecución: debe ingresar como SUCCESS y registrar candidato
    const result1 = await pipeline.processNotification(notifSample);
    assert.strictEqual(result1.status, 'SUCCESS');
    assert.ok(result1.candidate !== null);
    assert.strictEqual(result1.candidate?.status, 'PENDING_REVIEW');

    // Segunda ejecución (misma notificación): con deduplicación habilitada
    const duplicateNotif = {
      ...notifSample,
      key: 'notif_2', // diferente sourceId para evaluar la lógica del pipeline
    };
    const result2 = await pipeline.processNotification(duplicateNotif);
    assert.strictEqual(result2.status, 'DUPLICATE', 'La segunda notificación debe marcarse como DUPLICATE');
    assert.ok(result2.candidate !== null);
    assert.strictEqual(result2.candidate?.status, 'DUPLICATE');
    assert.strictEqual(result2.rawEvent.status, 'DUPLICATE');

    // Verificar candidatos almacenados: el segundo está registrado como DUPLICATE, no activo
    const allCandidates = await candidateRepo.findAll();
    assert.strictEqual(allCandidates.length, 2);
    const duplicates = allCandidates.filter((c) => c.status === 'DUPLICATE');
    assert.strictEqual(duplicates.length, 1);

    console.log('  [OK] Pipeline detectó y marcó duplicado sin alterar candidatos activos');
  }

  // ── [TEST 9] Tolerancia temporal y umbrales configurables ───────────────────
  console.log('\n[TEST 9] Tolerancia temporal y umbrales configurables');
  {
    const date1 = new Date('2026-10-12T10:00:00Z');
    const date2 = new Date('2026-10-12T20:00:00Z'); // 10 horas de diferencia

    const target = {
      account: 'acc_1',
      amountMinor: 10000,
      currency: 'MXN',
      date: date1,
      merchant: 'Oxxo',
      type: 'EXPENSE',
    };
    const existing = {
      account: 'acc_1',
      amountMinor: 10000,
      currency: 'MXN',
      date: date2,
      merchant: 'Oxxo',
      type: 'EXPENSE',
    };

    // Con maxHoursDifference = 12h: es duplicado
    const match12h = DuplicateDetectorService.detectDuplicate(target, {
      candidates: [{
        id: 'c1',
        userId: 'u1',
        rawEventId: 'e1',
        source: 'ANDROID_NOTIFICATION',
        provider: 'BBVA',
        amountMinor: 10000,
        amount: 100,
        currency: 'MXN',
        type: 'EXPENSE',
        merchantRaw: 'Oxxo',
        merchant: 'Oxxo',
        occurredAt: date2,
        confidenceScore: 80,
        status: 'PENDING_REVIEW',
        rawPayload: {},
        metadata: {},
        createdAt: date2,
        updatedAt: date2,
      }],
    }, { maxHoursDifference: 12 });
    assert.strictEqual(match12h.isDuplicate, true);

    // Con maxHoursDifference = 5h: no es duplicado por superar la ventana
    const match5h = DuplicateDetectorService.detectDuplicate(target, {
      candidates: [{
        id: 'c1',
        userId: 'u1',
        rawEventId: 'e1',
        source: 'ANDROID_NOTIFICATION',
        provider: 'BBVA',
        amountMinor: 10000,
        amount: 100,
        currency: 'MXN',
        type: 'EXPENSE',
        merchantRaw: 'Oxxo',
        merchant: 'Oxxo',
        occurredAt: date2,
        confidenceScore: 80,
        status: 'PENDING_REVIEW',
        rawPayload: {},
        metadata: {},
        createdAt: date2,
        updatedAt: date2,
      }],
    }, { maxHoursDifference: 5 });
    assert.strictEqual(match5h.isDuplicate, false);

    console.log('  [OK] Parámetros configurables respetados');
  }

  // ── [TEST 10] Cálculo de Similitud de Comercios ───────────────────────────────
  console.log('\n[TEST 10] Cálculo de Similitud de Comercios (calculateMerchantSimilarity)');
  {
    // Idénticos
    assert.strictEqual(DuplicateDetectorService.calculateMerchantSimilarity('Starbucks', 'Starbucks'), 1.0);
    assert.strictEqual(DuplicateDetectorService.calculateMerchantSimilarity('starbucks', 'STARBUCKS'), 1.0);

    // Variantes normalizadas a canónico (US-024)
    const amznSim = DuplicateDetectorService.calculateMerchantSimilarity('AMZN Mktp US*123', 'Amazon');
    assert.strictEqual(amznSim, 1.0, 'Ambas normalizan a Amazon canónico');

    // Subcadenas
    const subcadenaSim = DuplicateDetectorService.calculateMerchantSimilarity('Starbucks Polanco', 'Starbucks');
    assert.ok(subcadenaSim >= 0.85);

    // Totalmente disímiles
    const disimilSim = DuplicateDetectorService.calculateMerchantSimilarity('Farmacia Guadalajara', 'Cinépolis VIP');
    assert.ok(disimilSim < 0.40);

    console.log('  [OK] Métricas de similitud de comercios verificadas');
  }

  console.log('\n[DONE] ¡Todos los tests de US-026 pasaron exitosamente (10/10)!');
}
