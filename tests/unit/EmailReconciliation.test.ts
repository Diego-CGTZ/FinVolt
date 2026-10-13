/**
 * Pruebas unitarias para US-036: Integrar Email con Cross-Source Reconciliation
 *
 * Criterios de Aceptación:
 * 1. Email candidates entran al mismo pipeline.
 * 2. Se relacionan con notification y/o statement.
 * 3. No crean duplicados.
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
import { EmailIngestionPipeline } from '../../src/application/services/EmailIngestionPipeline';
import { InMemoryTransactionCandidateRepository } from '../../src/infrastructure/database/InMemoryTransactionCandidateRepository';
import type { IRawEventRepository, RawEventFilter } from '../../src/domain/repositories/IRawEventRepository';
import type { ITransactionRepository, TransactionFilters, PaginationOptions } from '../../src/domain/repositories/ITransactionRepository';
import type { RawEvent, CreateRawEventDTO, UpdateRawEventStatusDTO } from '../../src/domain/models/RawEvent';
import type { Transaction, CreateTransactionInput, UpdateTransactionInput } from '../../src/domain/models/Transaction';
import type { TransactionCandidate } from '../../src/domain/models/TransactionCandidate';

// Mock de IRawEventRepository en memoria
class MockRawEventRepository implements IRawEventRepository {
  private events: Map<string, RawEvent> = new Map();

  async save(dto: CreateRawEventDTO): Promise<RawEvent> {
    const now = new Date();
    const event: RawEvent = {
      id: `raw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: 'test-user',
      source: dto.source,
      sourceId: dto.sourceId,
      payload: JSON.parse(JSON.stringify(dto.payload || {})),
      rawText: dto.rawText,
      metadata: { ...(dto.metadata || {}) },
      status: 'PENDING',
      retryCount: 0,
      receivedAt: dto.receivedAt || now,
      createdAt: now,
      updatedAt: now,
    };
    this.events.set(event.id, event);
    return event;
  }

  async findById(id: string): Promise<RawEvent | null> {
    const ev = this.events.get(id);
    return ev ? JSON.parse(JSON.stringify(ev)) : null;
  }

  async findBySourceId(source: any, sourceId: string): Promise<RawEvent | null> {
    for (const ev of this.events.values()) {
      if (ev.source === source && ev.sourceId === sourceId) return JSON.parse(JSON.stringify(ev));
    }
    return null;
  }

  async findAll(filter?: RawEventFilter): Promise<RawEvent[]> {
    return Array.from(this.events.values()).map((e) => JSON.parse(JSON.stringify(e)));
  }

  async updateStatus(id: string, dto: UpdateRawEventStatusDTO): Promise<RawEvent> {
    const ev = this.events.get(id);
    if (!ev) throw new Error('Not found');
    ev.status = dto.status;
    if (dto.errorMessage) ev.errorMessage = dto.errorMessage;
    if (dto.processedAt) ev.updatedAt = dto.processedAt;
    return JSON.parse(JSON.stringify(ev));
  }

  async incrementRetry(id: string): Promise<RawEvent> {
    const ev = this.events.get(id);
    if (!ev) throw new Error('Not found');
    ev.retryCount++;
    return JSON.parse(JSON.stringify(ev));
  }

  async getPendingEvents(limit?: number): Promise<RawEvent[]> {
    const list = Array.from(this.events.values()).filter((e) => e.status === 'PENDING');
    return (limit ? list.slice(0, limit) : list).map((e) => JSON.parse(JSON.stringify(e)));
  }

  async getEvents(filter?: RawEventFilter): Promise<RawEvent[]> {
    let list = Array.from(this.events.values());
    if (filter?.status) list = list.filter((e) => e.status === filter.status);
    if (filter?.source) list = list.filter((e) => e.source === filter.source);
    if (filter?.limit) list = list.slice(0, filter.limit);
    return list.map((e) => JSON.parse(JSON.stringify(e)));
  }

  async markForReprocessing(id: string): Promise<RawEvent> {
    const ev = this.events.get(id);
    if (!ev) throw new Error('Not found');
    ev.status = 'PENDING';
    ev.retryCount++;
    delete ev.errorMessage;
    return JSON.parse(JSON.stringify(ev));
  }

  addDirect(event: RawEvent): void {
    this.events.set(event.id, JSON.parse(JSON.stringify(event)));
  }
}

// Mock de ITransactionRepository en memoria
class MockTransactionRepository implements ITransactionRepository {
  private transactions: Map<string, Transaction> = new Map();

  async findByFingerprint(fingerprint: string): Promise<Transaction | null> {
    for (const tx of this.transactions.values()) {
      if (tx.fingerprint === fingerprint) return JSON.parse(JSON.stringify(tx));
    }
    return null;
  }

  async listTransactions(filters?: TransactionFilters, pagination?: PaginationOptions): Promise<Transaction[]> {
    return Array.from(this.transactions.values()).map((tx) => JSON.parse(JSON.stringify(tx)));
  }

  async getTransaction(id: string): Promise<Transaction> {
    const tx = this.transactions.get(id);
    if (!tx) throw new Error(`Transaction not found: ${id}`);
    return JSON.parse(JSON.stringify(tx));
  }

  async createTransaction(input: CreateTransactionInput): Promise<Transaction> {
    const now = new Date();
    const tx: Transaction = {
      id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: 'test-user',
      accountId: input.accountId,
      type: input.type,
      amountMinor: input.amountMinor,
      currency: input.currency || 'MXN',
      source: input.source || 'MANUAL',
      status: input.status || 'CONFIRMED',
      occurredAt: input.occurredAt,
      postedAt: input.postedAt || null,
      merchantRaw: input.merchantRaw || null,
      merchant: input.merchant || null,
      description: input.description || null,
      categoryId: input.categoryId || null,
      sourceEventId: input.sourceEventId || null,
      confidenceScore: input.confidenceScore || 85,
      fingerprint: input.fingerprint || null,
      linkedTransactionId: input.linkedTransactionId || null,
      sourcesEvidence: input.sourcesEvidence ? [...input.sourcesEvidence] : [],
      metadata: input.metadata ? { ...input.metadata } : {},
      createdAt: now,
      updatedAt: now,
    };
    this.transactions.set(tx.id, tx);
    return JSON.parse(JSON.stringify(tx));
  }

  async updateTransaction(id: string, input: UpdateTransactionInput): Promise<Transaction> {
    const tx = this.transactions.get(id);
    if (!tx) throw new Error(`Transaction not found: ${id}`);
    if (input.postedAt !== undefined) tx.postedAt = input.postedAt;
    if (input.merchant !== undefined) tx.merchant = input.merchant;
    if (input.description !== undefined) tx.description = input.description;
    if (input.status !== undefined) tx.status = input.status;
    if (input.confidenceScore !== undefined) tx.confidenceScore = input.confidenceScore;
    if (input.sourcesEvidence !== undefined) tx.sourcesEvidence = [...input.sourcesEvidence];
    if (input.metadata !== undefined) tx.metadata = { ...(tx.metadata || {}), ...input.metadata };
    tx.updatedAt = new Date();
    return JSON.parse(JSON.stringify(tx));
  }

  async deleteTransaction(id: string): Promise<void> {
    this.transactions.delete(id);
  }

  addDirect(tx: Transaction): void {
    this.transactions.set(tx.id, JSON.parse(JSON.stringify(tx)));
  }

  count(): number {
    return this.transactions.size;
  }
}

export async function runEmailReconciliationTests() {
  console.log('[TEST] Iniciando pruebas de US-036: Integrar Email con Cross-Source Reconciliation...');

  const baseDate = new Date('2026-10-12T10:00:00Z');

  // ── [TEST 1] Reconciliación directa Email + Notificación (Push previo + Email confirmatorio) ──
  console.log('\n[TEST 1] Reconciliación directa Email + Notificación Push previa');
  {
    const notifTx: Transaction = {
      id: 'tx_starbucks_001',
      userId: 'usr_test',
      accountId: 'acc_debito_bbva',
      type: 'EXPENSE',
      amountMinor: 35000, // $350.00
      currency: 'MXN',
      occurredAt: baseDate,
      postedAt: null,
      merchantRaw: 'STARBUCKS COFFEE',
      merchant: 'Starbucks',
      description: null,
      categoryId: null,
      source: 'NOTIFICATION',
      sourceEventId: 'notif_ev_101',
      status: 'PENDING',
      confidenceScore: 85,
      fingerprint: null,
      linkedTransactionId: null,
      sourcesEvidence: [
        {
          source: 'NOTIFICATION',
          sourceEventId: 'notif_ev_101',
          candidateId: 'cand_notif_101',
          provider: 'BBVA',
          occurredAt: baseDate,
          capturedAt: baseDate,
          merchantRaw: 'STARBUCKS COFFEE',
          amountMinor: 35000,
          confidenceScore: 85,
        },
      ],
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    // Correo confirmatorio que llega 15 minutos después
    const emailCandidateDate = new Date('2026-10-12T10:15:00Z');
    const emailCandidate: TransactionCandidate = {
      id: 'cand_email_202',
      userId: 'usr_test',
      rawEventId: 'email_ev_202',
      source: 'EMAIL',
      provider: 'BBVA',
      amountMinor: 35000,
      amount: 350.0,
      currency: 'MXN',
      type: 'EXPENSE',
      merchantRaw: 'Starbucks Coffee Mexico',
      merchant: 'Starbucks',
      occurredAt: emailCandidateDate,
      confidenceScore: 92,
      accountHint: { last4Digits: '4321', bankName: 'BBVA' },
      status: 'PENDING_REVIEW',
      rawPayload: { subject: 'Compra autorizada en Starbucks', from: 'notificaciones@bbva.com' },
      metadata: { concept: 'Consumo en tienda Starbucks', referenceNumber: 'FOL-7788' },
      createdAt: emailCandidateDate,
      updatedAt: emailCandidateDate,
    };

    const result = CrossSourceReconciliationService.reconcileEmailCandidate(
      emailCandidate,
      [notifTx],
    );

    assert.strictEqual(result.action, 'MERGED', 'El email debe fusionarse con la notificación previa');
    assert.strictEqual(result.isReconciled, true);
    assert.ok(result.transaction !== null);
    assert.strictEqual(result.transaction?.id, 'tx_starbucks_001', 'Debe conservar el ID original');

    const evidences = result.transaction?.sourcesEvidence || [];
    assert.strictEqual(evidences.length, 2, 'Debe contener 2 evidencias (NOTIFICATION + EMAIL)');
    assert.strictEqual(evidences[0].source, 'NOTIFICATION');
    assert.strictEqual(evidences[1].source, 'EMAIL');
    assert.strictEqual(CrossSourceReconciliationService.hasEmailCorroboration(result.transaction!), true);
    // Con 2 fuentes concordantes y score >= 90 se promueve a CONFIRMED
    assert.strictEqual(result.transaction?.status, 'CONFIRMED');

    console.log('  [OK] Email confirmatorio unificado exitosamente con Notificación push previa');
  }

  // ── [TEST 2] Reconciliación Email + Statement (Email de compra + Extracto bancario PDF/CSV) ──
  console.log('\n[TEST 2] Reconciliación Email previo + Estado de cuenta posterior');
  {
    // Transacción originada por un correo electrónico
    const emailTx: Transaction = {
      id: 'tx_aeromexico_002',
      userId: 'usr_test',
      accountId: 'acc_credito_amex',
      type: 'EXPENSE',
      amountMinor: 450000, // $4,500.00
      currency: 'MXN',
      occurredAt: baseDate,
      postedAt: null,
      merchantRaw: 'AEROMEXICO BOLETOS',
      merchant: 'Aeromexico',
      description: 'Vuelo CDMX - MTY',
      categoryId: null,
      source: 'EMAIL',
      sourceEventId: 'email_ev_303',
      status: 'PENDING',
      confidenceScore: 88,
      fingerprint: null,
      linkedTransactionId: null,
      sourcesEvidence: [
        {
          source: 'EMAIL',
          sourceEventId: 'email_ev_303',
          candidateId: 'cand_email_303',
          provider: 'AMEX',
          occurredAt: baseDate,
          capturedAt: baseDate,
          amountMinor: 450000,
          confidenceScore: 88,
        },
      ],
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    // Extracto bancario importado 2 días después
    const statementDate = new Date('2026-10-14T00:00:00Z');
    const statementCandidate: TransactionCandidate = {
      id: 'cand_stmt_404',
      userId: 'usr_test',
      rawEventId: 'stmt_ev_404',
      source: 'BANK_PDF',
      provider: 'AMEX',
      amountMinor: 450000,
      amount: 4500.0,
      currency: 'MXN',
      type: 'EXPENSE',
      merchantRaw: 'AEROVIAS DE MEXICO SA',
      merchant: 'Aeromexico',
      occurredAt: statementDate,
      confidenceScore: 99,
      status: 'PENDING_REVIEW',
      rawPayload: { rowNum: 15 },
      metadata: {},
      createdAt: statementDate,
      updatedAt: statementDate,
    };

    const result = CrossSourceReconciliationService.reconcile(
      statementCandidate,
      [emailTx],
    );

    assert.strictEqual(result.action, 'MERGED');
    assert.strictEqual(result.isReconciled, true);
    assert.strictEqual(result.transaction?.id, 'tx_aeromexico_002');
    assert.strictEqual(result.transaction?.status, 'POSTED', 'El estado de cuenta promueve a POSTED');
    assert.ok(result.transaction?.postedAt !== null, 'postedAt debe tomar la fecha de liquidación del extracto');
    assert.strictEqual(result.transaction?.postedAt?.toISOString(), statementDate.toISOString());

    const sources = CrossSourceReconciliationService.getDistinctSources(result.transaction!);
    assert.strictEqual(sources.includes('EMAIL'), true);
    assert.strictEqual(sources.includes('STATEMENT_PDF'), true);

    console.log('  [OK] Estado de cuenta liquidó y reconcilió transacción originada por correo');
  }

  // ── [TEST 3] Triple corroboración: Notificación + Email + Statement ──
  console.log('\n[TEST 3] Triple corroboración: Notificación + Email + Statement');
  {
    const t0 = new Date('2026-10-10T12:00:00Z');
    const t1 = new Date('2026-10-10T12:05:00Z');
    const t2 = new Date('2026-10-12T00:00:00Z');

    // 1. Inicia con Notificación
    let currentTx: Transaction = {
      id: 'tx_apple_003',
      userId: 'usr_test',
      accountId: 'acc_debito_nu',
      type: 'EXPENSE',
      amountMinor: 12900, // $129.00
      currency: 'MXN',
      occurredAt: t0,
      postedAt: null,
      merchantRaw: 'APPLE COM BILL',
      merchant: 'Apple',
      description: null,
      categoryId: null,
      source: 'NOTIFICATION',
      sourceEventId: 'ev_notif_1',
      status: 'PENDING',
      confidenceScore: 82,
      fingerprint: null,
      linkedTransactionId: null,
      sourcesEvidence: [
        {
          source: 'NOTIFICATION',
          sourceEventId: 'ev_notif_1',
          occurredAt: t0,
          capturedAt: t0,
          amountMinor: 12900,
        },
      ],
      createdAt: t0,
      updatedAt: t0,
    };

    // 2. Correo de Apple Services
    const emailCand: TransactionCandidate = {
      id: 'cand_email_apple',
      userId: 'usr_test',
      rawEventId: 'ev_email_2',
      source: 'EMAIL',
      provider: 'NU',
      amountMinor: 12900,
      amount: 129.0,
      currency: 'MXN',
      type: 'EXPENSE',
      merchantRaw: 'Apple Services',
      merchant: 'Apple',
      occurredAt: t1,
      confidenceScore: 90,
      status: 'PENDING_REVIEW',
      rawPayload: { subject: 'Tu recibo de Apple' },
      metadata: {},
      createdAt: t1,
      updatedAt: t1,
    };

    const res1 = CrossSourceReconciliationService.reconcileEmailCandidate(emailCand, [currentTx]);
    assert.strictEqual(res1.action, 'MERGED');
    currentTx = res1.transaction!;

    // 3. Extracto bancario CSV
    const csvCand: TransactionCandidate = {
      id: 'cand_csv_apple',
      userId: 'usr_test',
      rawEventId: 'ev_csv_3',
      source: 'BANK_CSV',
      provider: 'NU',
      amountMinor: 12900,
      amount: 129.0,
      currency: 'MXN',
      type: 'EXPENSE',
      merchantRaw: 'APPLE.COM/BILL',
      merchant: 'Apple',
      occurredAt: t2,
      confidenceScore: 99,
      status: 'PENDING_REVIEW',
      rawPayload: { row: 8 },
      metadata: {},
      createdAt: t2,
      updatedAt: t2,
    };

    const res2 = CrossSourceReconciliationService.reconcile(csvCand, [currentTx]);
    assert.strictEqual(res2.action, 'MERGED');
    const finalTx = res2.transaction!;

    assert.strictEqual(finalTx.sourcesEvidence?.length, 3, 'Deben existir 3 evidencias registradas');
    assert.strictEqual(finalTx.status, 'POSTED');
    assert.strictEqual(CrossSourceReconciliationService.hasMultipleSources(finalTx), true);
    assert.strictEqual(CrossSourceReconciliationService.hasEmailCorroboration(finalTx), true);
    assert.strictEqual(finalTx.id, 'tx_apple_003', 'No crea transacciones adicionales');

    console.log('  [OK] Triple corroboración ejecutada: 1 transacción unificada con 3 fuentes');
  }

  // ── [TEST 4] Enriquecimiento de comercio y descripción desde el correo ──
  console.log('\n[TEST 4] Enriquecimiento de comercio truncado y descripción desde correo');
  {
    const tx: Transaction = {
      id: 'tx_amzn_004',
      userId: 'usr_test',
      accountId: 'acc_1',
      type: 'EXPENSE',
      amountMinor: 89900,
      currency: 'MXN',
      occurredAt: baseDate,
      postedAt: null,
      merchantRaw: 'AMZN MKTP',
      merchant: null, // No normalizado originalmente
      description: null,
      categoryId: null,
      source: 'NOTIFICATION',
      sourceEventId: 'ev_notif_amz',
      status: 'PENDING',
      confidenceScore: 80,
      fingerprint: null,
      linkedTransactionId: null,
      sourcesEvidence: [],
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    const emailCand: TransactionCandidate = {
      id: 'cand_email_amz',
      userId: 'usr_test',
      rawEventId: 'ev_email_amz',
      source: 'EMAIL',
      provider: 'AMAZON',
      amountMinor: 89900,
      amount: 899.0,
      currency: 'MXN',
      type: 'EXPENSE',
      merchantRaw: 'Amazon Mexico',
      merchant: 'Amazon',
      occurredAt: baseDate,
      confidenceScore: 95,
      status: 'PENDING_REVIEW',
      rawPayload: {},
      metadata: { concept: 'Kindle Paperwhite Case', subject: 'Confirmación de pedido Amazon' },
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    const result = CrossSourceReconciliationService.reconcileEmailCandidate(emailCand, [tx]);
    assert.strictEqual(result.action, 'MERGED');
    assert.strictEqual(result.transaction?.merchant, 'Amazon', 'Debe enriquecer el merchant');
    assert.strictEqual(result.transaction?.description, 'Kindle Paperwhite Case', 'Debe enriquecer el concepto');

    console.log('  [OK] Datos enriquecidos: merchant y descripción incorporados');
  }

  // ── [TEST 5] Enriquecimiento de referencia bancaria / folio de autorización de correo ──
  console.log('\n[TEST 5] Enriquecimiento de referencia bancaria / folio desde correo');
  {
    const tx: Transaction = {
      id: 'tx_cfe_005',
      userId: 'usr_test',
      accountId: 'acc_1',
      type: 'EXPENSE',
      amountMinor: 64000,
      currency: 'MXN',
      occurredAt: baseDate,
      postedAt: null,
      merchantRaw: 'CFE SUMINISTRADOR',
      merchant: 'CFE',
      description: null,
      categoryId: null,
      source: 'NOTIFICATION',
      sourceEventId: 'ev_notif_cfe',
      status: 'PENDING',
      confidenceScore: 85,
      fingerprint: null,
      linkedTransactionId: null,
      metadata: {},
      sourcesEvidence: [],
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    const emailCand: TransactionCandidate = {
      id: 'cand_email_cfe',
      userId: 'usr_test',
      rawEventId: 'ev_email_cfe',
      source: 'EMAIL',
      provider: 'BANORTE',
      amountMinor: 64000,
      amount: 640.0,
      currency: 'MXN',
      type: 'EXPENSE',
      merchantRaw: 'CFE',
      merchant: 'CFE',
      occurredAt: baseDate,
      confidenceScore: 94,
      status: 'PENDING_REVIEW',
      rawPayload: {},
      metadata: { referenceNumber: 'AUT-88990011' },
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    const result = CrossSourceReconciliationService.reconcileEmailCandidate(emailCand, [tx]);
    assert.strictEqual(result.action, 'MERGED');
    assert.strictEqual(result.transaction?.metadata?.referenceNumber, 'AUT-88990011');

    console.log('  [OK] Referencia bancaria transferida exitosamente a metadata');
  }

  // ── [TEST 6] Correo no coincidente genera acción NEW ──
  console.log('\n[TEST 6] Correo financiero no coincidente no altera transacciones');
  {
    const existingTx: Transaction = {
      id: 'tx_liverpool_006',
      userId: 'usr_test',
      accountId: 'acc_1',
      type: 'EXPENSE',
      amountMinor: 150000,
      currency: 'MXN',
      occurredAt: baseDate,
      postedAt: null,
      merchantRaw: 'LIVERPOOL',
      merchant: 'Liverpool',
      description: null,
      categoryId: null,
      source: 'NOTIFICATION',
      sourceEventId: 'ev_1',
      status: 'CONFIRMED',
      confidenceScore: 90,
      fingerprint: null,
      linkedTransactionId: null,
      sourcesEvidence: [],
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    // Correo de Uber por $120.00 (monto y comercio distintos)
    const emailCand: TransactionCandidate = {
      id: 'cand_email_uber',
      userId: 'usr_test',
      rawEventId: 'ev_2',
      source: 'EMAIL',
      provider: 'UBER',
      amountMinor: 12000,
      amount: 120.0,
      currency: 'MXN',
      type: 'EXPENSE',
      merchantRaw: 'Uber Trip',
      merchant: 'Uber',
      occurredAt: baseDate,
      confidenceScore: 90,
      status: 'PENDING_REVIEW',
      rawPayload: {},
      metadata: {},
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    const result = CrossSourceReconciliationService.reconcileEmailCandidate(emailCand, [existingTx]);
    assert.strictEqual(result.action, 'UNMATCHED');
    assert.strictEqual(result.isReconciled, false);
    assert.strictEqual(result.transaction, null);

    console.log('  [OK] Correo divergente no fusiona transacciones no relacionadas');
  }

  // ── [TEST 7] Pipeline completo EmailIngestionPipeline con reconciliación activa ──
  console.log('\n[TEST 7] Pipeline completo EmailIngestionPipeline con reconciliación automática');
  {
    const rawRepo = new MockRawEventRepository();
    const candRepo = new InMemoryTransactionCandidateRepository();
    const txRepo = new MockTransactionRepository();

    // 1. Insertamos transacción previa en el repositorio de transacciones
    const initialTx = await txRepo.createTransaction({
      accountId: 'acc_bbva_1',
      type: 'EXPENSE',
      amountMinor: 25000, // $250.00
      currency: 'MXN',
      occurredAt: baseDate,
      merchantRaw: 'OXXO MATRIZ',
      merchant: 'Oxxo',
      source: 'NOTIFICATION',
      sourceEventId: 'ev_push_oxxo',
      confidenceScore: 85,
      sourcesEvidence: [
        {
          source: 'NOTIFICATION',
          sourceEventId: 'ev_push_oxxo',
          occurredAt: baseDate,
          capturedAt: baseDate,
          amountMinor: 25000,
        },
      ],
    });

    const pipeline = new EmailIngestionPipeline({
      rawEventRepository: rawRepo,
      candidateRepository: candRepo,
      transactionRepository: txRepo,
    });

    // 2. Simulamos la llegada de un RawEvent de correo para Oxxo por $250.00
    const rawEmail = await rawRepo.save({
      source: 'EMAIL',
      sourceId: 'msg_gmail_oxxo_1',
      rawText: 'BBVA informa: Compra por $250.00 en OXXO realizada con éxito.',
      payload: {
        from: 'notificaciones@bbva.com',
        subject: 'Compra autorizada BBVA',
        bodyText: 'Se autorizó compra por $250.00 en OXXO con tarjeta *1234.',
      },
    });

    const result = await pipeline.processRawEvent(rawEmail);

    assert.strictEqual(result.status, 'RECONCILED');
    assert.ok(result.reconciledTransaction !== null);
    assert.strictEqual(result.reconciledTransaction?.id, initialTx.id);
    assert.strictEqual(txRepo.count(), 1, 'No debe crear transacciones duplicadas en el repositorio');

    // Verificar evidencia en la transacción
    const updatedTx = await txRepo.getTransaction(initialTx.id);
    assert.strictEqual(updatedTx.sourcesEvidence?.length, 2);
    assert.strictEqual(CrossSourceReconciliationService.hasEmailCorroboration(updatedTx), true);

    // Verificar estado del RawEvent y Candidato
    const updatedRaw = await rawRepo.findById(rawEmail.id);
    assert.strictEqual(updatedRaw?.status, 'PROCESSED');

    const savedCand = await candRepo.findById(result.candidate!.id);
    assert.strictEqual(savedCand?.status, 'RECONCILED');

    console.log('  [OK] EmailIngestionPipeline reconcilió sin duplicar en ITransactionRepository');
  }

  // ── [TEST 8] Pipeline con reconciliación deshabilitada omite fusión ──
  console.log('\n[TEST 8] Pipeline con enableReconciliation = false omite fusión');
  {
    const rawRepo = new MockRawEventRepository();
    const candRepo = new InMemoryTransactionCandidateRepository();
    const txRepo = new MockTransactionRepository();

    await txRepo.createTransaction({
      accountId: 'acc_1',
      type: 'EXPENSE',
      amountMinor: 50000,
      currency: 'MXN',
      occurredAt: baseDate,
      merchantRaw: 'Superama',
      merchant: 'Superama',
    });

    const pipeline = new EmailIngestionPipeline({
      rawEventRepository: rawRepo,
      candidateRepository: candRepo,
      transactionRepository: txRepo,
      enableReconciliation: false,
    });

    const rawEmail = await rawRepo.save({
      source: 'EMAIL',
      sourceId: 'msg_superama_1',
      rawText: 'BBVA: Compra de $500.00 en Superama.',
      payload: {
        from: 'notificaciones@bbva.com',
        subject: 'Compra por $500.00 Superama',
        bodyText: 'Compra autorizada $500.00 en Superama',
      },
    });

    const result = await pipeline.processRawEvent(rawEmail);
    assert.strictEqual(result.status, 'SUCCESS');
    assert.strictEqual(result.candidate?.status, 'PENDING_REVIEW');
    assert.strictEqual(txRepo.count(), 1, 'No altera transacciones existentes');

    console.log('  [OK] Reconciliación omitida cuando el flag está en false');
  }

  // ── [TEST 9] Detección de duplicado por reenvío del mismo correo ──
  console.log('\n[TEST 9] No duplicación ante correo repetido (Detección de duplicado)');
  {
    const rawRepo = new MockRawEventRepository();
    const candRepo = new InMemoryTransactionCandidateRepository();

    const pipeline = new EmailIngestionPipeline({
      rawEventRepository: rawRepo,
      candidateRepository: candRepo,
    });

    const rawEmail1 = await rawRepo.save({
      source: 'EMAIL',
      sourceId: 'msg_duplicate_1',
      rawText: 'Cargo por $100.00 en OXXO',
      payload: {
        from: 'banco@test.com',
        subject: 'Cargo OXXO',
        bodyText: 'Cargo $100.00 OXXO tarjeta *9999',
      },
    });

    const res1 = await pipeline.processRawEvent(rawEmail1);
    assert.strictEqual(res1.status, 'SUCCESS');

    // Mismo correo procesado nuevamente
    const rawEmail2 = await rawRepo.save({
      source: 'EMAIL',
      sourceId: 'msg_duplicate_2',
      rawText: 'Cargo por $100.00 en OXXO',
      payload: {
        from: 'banco@test.com',
        subject: 'Cargo OXXO',
        bodyText: 'Cargo $100.00 OXXO tarjeta *9999',
      },
    });

    const res2 = await pipeline.processRawEvent(rawEmail2);
    assert.strictEqual(res2.status, 'DUPLICATE');

    const raw2Updated = await rawRepo.findById(rawEmail2.id);
    assert.strictEqual(raw2Updated?.status, 'DUPLICATE');

    console.log('  [OK] Segundo correo idéntico detectado y marcado como DUPLICATE');
  }

  // ── [TEST 10] Inmutabilidad estricta de rawPayload del correo ──
  console.log('\n[TEST 10] Inmutabilidad estricta de rawPayload del RawEvent');
  {
    const originalPayload = {
      from: 'alertas@banco.com',
      subject: 'Compra aprobada',
      bodyText: 'Se realizó un cargo de $300.00 en Sanborns',
      headers: { messageId: '<abc-123@banco.com>' },
    };

    const rawRepo = new MockRawEventRepository();
    const candRepo = new InMemoryTransactionCandidateRepository();
    const txRepo = new MockTransactionRepository();

    await txRepo.createTransaction({
      accountId: 'acc_1',
      type: 'EXPENSE',
      amountMinor: 30000,
      currency: 'MXN',
      occurredAt: baseDate,
      merchant: 'Sanborns',
      merchantRaw: 'Sanborns',
    });

    const pipeline = new EmailIngestionPipeline({
      rawEventRepository: rawRepo,
      candidateRepository: candRepo,
      transactionRepository: txRepo,
    });

    const rawEvent = await rawRepo.save({
      source: 'EMAIL',
      sourceId: 'raw_imm_check',
      payload: originalPayload,
      rawText: originalPayload.bodyText,
    });

    await pipeline.processRawEvent(rawEvent);

    const reloaded = await rawRepo.findById(rawEvent.id);
    assert.deepStrictEqual(
      reloaded?.payload,
      originalPayload,
      'El payload original del RawEvent debe mantenerse 100% inalterado',
    );

    console.log('  [OK] Inmutabilidad de rawPayload verificada');
  }

  // ── [TEST 11] hasEmailCorroboration y getDistinctSources ──
  console.log('\n[TEST 11] Verificación de helpers hasEmailCorroboration y getDistinctSources');
  {
    const txWithoutEmail: Transaction = {
      id: 'tx_no_email',
      userId: 'usr_test',
      accountId: 'acc_1',
      type: 'EXPENSE',
      amountMinor: 1000,
      currency: 'MXN',
      occurredAt: baseDate,
      postedAt: null,
      merchantRaw: 'Test',
      merchant: 'Test',
      description: null,
      categoryId: null,
      source: 'NOTIFICATION',
      sourceEventId: 'ev_1',
      status: 'CONFIRMED',
      confidenceScore: 80,
      fingerprint: null,
      linkedTransactionId: null,
      sourcesEvidence: [
        {
          source: 'NOTIFICATION',
          sourceEventId: 'ev_1',
          occurredAt: baseDate,
          capturedAt: baseDate,
        },
      ],
      createdAt: baseDate,
      updatedAt: baseDate,
    };

    assert.strictEqual(CrossSourceReconciliationService.hasEmailCorroboration(txWithoutEmail), false);
    assert.deepStrictEqual(CrossSourceReconciliationService.getDistinctSources(txWithoutEmail), ['NOTIFICATION']);

    const txWithEmail: Transaction = {
      ...txWithoutEmail,
      sourcesEvidence: [
        ...txWithoutEmail.sourcesEvidence!,
        {
          source: 'EMAIL',
          sourceEventId: 'ev_email',
          occurredAt: baseDate,
          capturedAt: baseDate,
        },
      ],
    };

    assert.strictEqual(CrossSourceReconciliationService.hasEmailCorroboration(txWithEmail), true);
    assert.strictEqual(CrossSourceReconciliationService.getDistinctSources(txWithEmail).length, 2);

    console.log('  [OK] Helpers de corroboración de correo validados con exactitud');
  }

  // ── [TEST 12] Tolerancia de ventana temporal y montos en discrepancia ──
  console.log('\n[TEST 12] Tolerancia temporal y rechazo por discrepancia');
  {
    const tx: Transaction = {
      id: 'tx_time_window',
      userId: 'usr_test',
      accountId: 'acc_1',
      type: 'EXPENSE',
      amountMinor: 50000, // $500.00
      currency: 'MXN',
      occurredAt: new Date('2026-10-01T10:00:00Z'), // 1 de octubre
      postedAt: null,
      merchantRaw: 'SAMS CLUB',
      merchant: 'Sams Club',
      description: null,
      categoryId: null,
      source: 'NOTIFICATION',
      sourceEventId: 'ev_old',
      status: 'CONFIRMED',
      confidenceScore: 85,
      fingerprint: null,
      linkedTransactionId: null,
      sourcesEvidence: [],
      createdAt: new Date('2026-10-01T10:00:00Z'),
      updatedAt: new Date('2026-10-01T10:00:00Z'),
    };

    // Candidato con misma tienda y monto, pero 15 días después (fuera de la ventana permitida de 3 días)
    const emailLateCand: TransactionCandidate = {
      id: 'cand_late',
      userId: 'usr_test',
      rawEventId: 'ev_late',
      source: 'EMAIL',
      provider: 'SAMS',
      amountMinor: 50000,
      amount: 500.0,
      currency: 'MXN',
      type: 'EXPENSE',
      merchantRaw: 'SAMS CLUB',
      merchant: 'Sams Club',
      occurredAt: new Date('2026-10-16T10:00:00Z'),
      confidenceScore: 90,
      status: 'PENDING_REVIEW',
      rawPayload: {},
      metadata: {},
      createdAt: new Date('2026-10-16T10:00:00Z'),
      updatedAt: new Date('2026-10-16T10:00:00Z'),
    };

    const resTime = CrossSourceReconciliationService.reconcileEmailCandidate(emailLateCand, [tx]);
    assert.strictEqual(resTime.action, 'UNMATCHED', 'Fuera de ventana temporal no debe reconciliarse');

    // Candidato en misma fecha pero con monto diferente ($550 vs $500)
    const emailDiffAmount: TransactionCandidate = {
      ...emailLateCand,
      occurredAt: new Date('2026-10-01T10:30:00Z'),
      amountMinor: 55000,
      amount: 550.0,
    };

    const resAmount = CrossSourceReconciliationService.reconcileEmailCandidate(emailDiffAmount, [tx]);
    assert.strictEqual(resAmount.action, 'UNMATCHED', 'Montos diferentes no deben reconciliarse');

    console.log('  [OK] Reglas estrictas de ventana de tiempo y monto verificadas');
  }

  console.log('\n[RESULTADO] Todas las pruebas de US-036 pasaron exitosamente (12/12).');
}
