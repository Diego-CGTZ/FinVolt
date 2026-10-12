/**
 * Pruebas unitarias para US-032: Correcciones del Usuario
 *
 * Acceptance Criteria:
 * Corrección guardada; puede crear regla/preferencia reutilizable; no altera el raw event original.
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

import { UserCorrectionService } from '../../src/domain/services/categorization/UserCorrectionService';
import { DeterministicCategorizationService } from '../../src/domain/services/categorization/DeterministicCategorizationService';
import { InMemoryUserCorrectionRepository } from '../../src/infrastructure/database/InMemoryUserCorrectionRepository';
import { InMemoryTransactionCandidateRepository } from '../../src/infrastructure/database/InMemoryTransactionCandidateRepository';
import type { IRawEventRepository, RawEventFilter } from '../../src/domain/repositories/IRawEventRepository';
import type { ITransactionRepository, TransactionFilters, PaginationOptions } from '../../src/domain/repositories/ITransactionRepository';
import type { RawEvent, CreateRawEventDTO, UpdateRawEventStatusDTO } from '../../src/domain/models/RawEvent';
import type { Transaction, CreateTransactionInput, UpdateTransactionInput } from '../../src/domain/models/Transaction';
import type { TransactionCandidate } from '../../src/domain/models/TransactionCandidate';

// Mock de IRawEventRepository para verificar inmutabilidad del RawEvent
class MockRawEventRepository implements IRawEventRepository {
  private events: Map<string, RawEvent> = new Map();

  async save(dto: CreateRawEventDTO): Promise<RawEvent> {
    const now = new Date();
    const event: RawEvent = {
      id: `raw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: 'test-user',
      source: dto.source,
      sourceId: dto.sourceId,
      payload: { ...dto.payload },
      rawText: dto.rawText,
      metadata: { ...(dto.metadata || {}) },
      status: 'PROCESSED',
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
    return ev ? { ...ev, payload: { ...ev.payload }, metadata: { ...ev.metadata } } : null;
  }

  async findBySourceId(source: any, sourceId: string): Promise<RawEvent | null> {
    for (const ev of this.events.values()) {
      if (ev.source === source && ev.sourceId === sourceId) return ev;
    }
    return null;
  }

  async findAll(filter?: RawEventFilter): Promise<RawEvent[]> {
    return Array.from(this.events.values());
  }

  async updateStatus(id: string, dto: UpdateRawEventStatusDTO): Promise<RawEvent> {
    const ev = this.events.get(id);
    if (!ev) throw new Error('Not found');
    ev.status = dto.status;
    return ev;
  }

  async incrementRetry(id: string): Promise<RawEvent> {
    const ev = this.events.get(id);
    if (!ev) throw new Error('Not found');
    ev.retryCount++;
    return ev;
  }

  async getPendingEvents(limit?: number): Promise<RawEvent[]> {
    const list = Array.from(this.events.values()).filter((e) => e.status === 'PENDING');
    return limit ? list.slice(0, limit) : list;
  }

  async getEvents(filter?: RawEventFilter): Promise<RawEvent[]> {
    let list = Array.from(this.events.values());
    if (filter?.status) list = list.filter((e) => e.status === filter.status);
    if (filter?.source) list = list.filter((e) => e.source === filter.source);
    if (filter?.limit) list = list.slice(0, filter.limit);
    return list;
  }

  async markForReprocessing(id: string): Promise<RawEvent> {
    const ev = this.events.get(id);
    if (!ev) throw new Error('Not found');
    ev.status = 'PENDING';
    ev.retryCount++;
    delete ev.errorMessage;
    return ev;
  }

  addDirect(event: RawEvent): void {
    this.events.set(event.id, JSON.parse(JSON.stringify(event)));
  }
}

// Mock de ITransactionRepository
class MockTransactionRepository implements ITransactionRepository {
  private transactions: Map<string, Transaction> = new Map();

  async findByFingerprint(fingerprint: string): Promise<Transaction | null> {
    for (const tx of this.transactions.values()) {
      if (tx.fingerprint === fingerprint) return { ...tx };
    }
    return null;
  }

  async listTransactions(filters?: TransactionFilters, pagination?: PaginationOptions): Promise<Transaction[]> {
    return Array.from(this.transactions.values());
  }

  async getTransaction(id: string): Promise<Transaction> {
    const tx = this.transactions.get(id);
    if (!tx) throw new Error(`Transaction not found: ${id}`);
    return { ...tx, metadata: { ...(tx.metadata || {}) } };
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
      source: input.source || 'NOTIFICATION',
      status: input.status || 'CONFIRMED',
      occurredAt: input.occurredAt,
      postedAt: input.postedAt || null,
      merchantRaw: input.merchantRaw || null,
      merchant: input.merchant || null,
      description: input.description || null,
      categoryId: input.categoryId || null,
      sourceEventId: input.sourceEventId || null,
      confidenceScore: input.confidenceScore || 85,
      fingerprint: null,
      linkedTransactionId: null,
      metadata: input.metadata || {},
      createdAt: now,
      updatedAt: now,
    };
    this.transactions.set(tx.id, tx);
    return tx;
  }

  async updateTransaction(id: string, input: UpdateTransactionInput): Promise<Transaction> {
    const tx = this.transactions.get(id);
    if (!tx) throw new Error(`Transaction not found: ${id}`);
    if (input.categoryId !== undefined) tx.categoryId = input.categoryId;
    if (input.metadata !== undefined) tx.metadata = { ...(tx.metadata || {}), ...input.metadata };
    tx.updatedAt = new Date();
    return { ...tx };
  }

  async deleteTransaction(id: string): Promise<void> {
    this.transactions.delete(id);
  }

  addDirect(tx: Transaction): void {
    this.transactions.set(tx.id, { ...tx });
  }
}

export async function runUserCorrectionServiceTests(): Promise<void> {
  console.log('[TEST] Iniciando pruebas de US-032: Correcciones del Usuario...\n');

  // ── TEST 1: Criterio AC: Corrección guardada (Candidato) ───────────────────
  console.log('[TEST 1] Criterio AC: Corrección guardada en TransactionCandidate');
  {
    const correctionRepo = new InMemoryUserCorrectionRepository();
    const candidateRepo = new InMemoryTransactionCandidateRepository();
    const service = new UserCorrectionService({
      correctionRepository: correctionRepo,
      candidateRepository: candidateRepo,
    });

    const candidate = await candidateRepo.save({
      id: 'cand-oxxo-1',
      userId: 'user-diego',
      rawEventId: 'raw-ev-101',
      source: 'ANDROID_NOTIFICATION',
      provider: 'BBVA',
      amount: 150.0,
      amountMinor: 15000,
      currency: 'MXN',
      type: 'EXPENSE',
      merchant: 'Oxxo',
      merchantRaw: 'CADENA COMERCIAL OXXO SA DE CV',
      occurredAt: new Date(),
      confidenceScore: 85,
      status: 'PENDING_REVIEW',
      rawPayload: {},
      metadata: { categoryName: 'Supermercado' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // El usuario corrige la categoría a 'Servicios' (puntual, sin crear regla)
    const result = await service.applyCorrection({
      userId: 'user-diego',
      entityType: 'CANDIDATE',
      entityId: candidate.id,
      newCategoryName: 'Servicios',
      saveAsReusableRule: false,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.correction.newCategoryName, 'Servicios');
    assert.strictEqual(result.correction.previousCategoryName, 'Supermercado');
    assert.strictEqual(result.correction.merchant, 'Oxxo');
    assert.strictEqual(result.correction.saveAsRule, false);
    assert.strictEqual(result.ruleCreated, false);

    // Verificar persistencia en el repositorio de correcciones
    const stored = await correctionRepo.findCorrectionById(result.correction.id);
    assert.ok(stored !== null);
    assert.strictEqual(stored.newCategoryName, 'Servicios');

    // Verificar que el candidato en su repositorio fue actualizado
    const updatedCandidate = await candidateRepo.findById(candidate.id);
    assert.ok(updatedCandidate !== null);
    assert.strictEqual(updatedCandidate.metadata.categoryName, 'Servicios');
    assert.strictEqual(updatedCandidate.metadata.manuallyCorrected, true);

    console.log('  [OK] Corrección sobre candidato guardada y registrada con auditoría completa');
  }

  // ── TEST 2: Criterio AC: Corrección guardada (Transaction formal) ───────────
  console.log('\n[TEST 2] Criterio AC: Corrección guardada en Transaction');
  {
    const correctionRepo = new InMemoryUserCorrectionRepository();
    const txRepo = new MockTransactionRepository();
    const service = new UserCorrectionService({
      correctionRepository: correctionRepo,
      transactionRepository: txRepo,
    });

    const tx = await txRepo.createTransaction({
      accountId: 'acc-1',
      amountMinor: 28000,
      currency: 'MXN',
      occurredAt: new Date(),
      type: 'EXPENSE',
      merchant: 'Starbucks',
      merchantRaw: 'STARBUCKS COFFEE REFORMA',
      sourceEventId: 'raw-ev-202',
      metadata: { categoryName: 'Cafeterías' },
    });

    // El usuario corrige a 'Reuniones de Trabajo'
    const result = await service.applyCorrection({
      userId: 'user-diego',
      entityType: 'TRANSACTION',
      entityId: tx.id,
      newCategoryName: 'Educación',
      saveAsReusableRule: false,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.correction.newCategoryName, 'Educación');
    assert.strictEqual(result.correction.previousCategoryName, 'Cafeterías');

    const updatedTx = await txRepo.getTransaction(tx.id);
    assert.strictEqual(updatedTx.metadata?.categoryName, 'Educación');
    assert.strictEqual(updatedTx.metadata?.manuallyCorrected, true);

    console.log('  [OK] Corrección sobre transacción guardada y reflejada en repositorio');
  }

  // ── TEST 3: Criterio AC: Puede crear regla/preferencia reutilizable ─────────
  console.log('\n[TEST 3] Criterio AC: Creación de regla/preferencia reutilizable');
  {
    const correctionRepo = new InMemoryUserCorrectionRepository();
    const candidateRepo = new InMemoryTransactionCandidateRepository();
    const categorizationService = new DeterministicCategorizationService();

    const service = new UserCorrectionService({
      correctionRepository: correctionRepo,
      candidateRepository: candidateRepo,
      categorizationService,
    });

    const userId = 'user-auto-learner';

    // Candidato con comercio desconocido que caería en Fallback
    const candidate = await candidateRepo.save({
      id: 'cand-artesanias-1',
      userId,
      rawEventId: 'raw-ev-303',
      source: 'ANDROID_NOTIFICATION',
      provider: 'BBVA',
      amount: 450.0,
      amountMinor: 45000,
      currency: 'MXN',
      type: 'EXPENSE',
      merchant: 'Taller Artesanal Don Lupe',
      merchantRaw: 'TALLER ARTESANAL DON LUPE SA',
      occurredAt: new Date(),
      confidenceScore: 70,
      status: 'PENDING_REVIEW',
      rawPayload: {},
      metadata: { categoryName: 'Otros' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // El usuario corrige y activa `saveAsReusableRule = true`
    const result = await service.applyCorrection({
      userId,
      entityType: 'CANDIDATE',
      entityId: candidate.id,
      newCategoryName: 'Regalos',
      saveAsReusableRule: true,
    });

    assert.strictEqual(result.ruleCreated, true);
    assert.ok(result.createdRule !== null);
    assert.strictEqual(result.createdRule?.categoryName, 'Regalos');
    assert.strictEqual(result.createdRule?.merchantPattern, 'Taller Artesanal Don Lupe');

    // Verificar que la regla quedó guardada en el repositorio de reglas
    const userRules = await service.getUserRules(userId);
    assert.strictEqual(userRules.length, 1);
    assert.strictEqual(userRules[0].categoryName, 'Regalos');

    // ¡VERIFICAR REUTILIZACIÓN AUTOMÁTICA EN FUTURAS OPERACIONES!
    // Una nueva transacción con ese comercio ahora debe clasificarse como 'Regalos' vía USER_CORRECTIONS
    const futureCheck = categorizationService.categorize({
      merchant: 'Taller Artesanal Don Lupe',
      userId,
    });

    assert.strictEqual(futureCheck.method, 'USER_CORRECTIONS');
    assert.strictEqual(futureCheck.categoryName, 'Regalos');
    assert.strictEqual(futureCheck.isUserCorrection, true);

    console.log('  [OK] Regla reutilizable creada y aprendida automáticamente para futuros eventos');
  }

  // ── TEST 4: Criterio AC: No altera el RawEvent original ─────────────────────
  console.log('\n[TEST 4] Criterio AC: Invariante estricta: NO altera el RawEvent original');
  {
    const correctionRepo = new InMemoryUserCorrectionRepository();
    const candidateRepo = new InMemoryTransactionCandidateRepository();
    const rawRepo = new MockRawEventRepository();

    const service = new UserCorrectionService({
      correctionRepository: correctionRepo,
      candidateRepository: candidateRepo,
      rawEventRepository: rawRepo,
    });

    // 1. Crear RawEvent inmutable original
    const rawDate = new Date('2026-10-12T14:00:00Z');
    const originalPayload = {
      title: 'BBVA Bancomer',
      text: 'Compra autorizada por $500.00 en OXXO GAS con tarjeta *4431',
      postTime: 1791823200000,
    };
    const originalMetadata = {
      packageName: 'com.bbva.bancomer',
      hash: 'sha256-original-checksum',
    };

    const rawEvent = await rawRepo.save({
      source: 'ANDROID_NOTIFICATION',
      sourceId: 'notif-key-889',
      payload: originalPayload,
      rawText: 'Compra autorizada por $500.00 en OXXO GAS con tarjeta *4431',
      metadata: originalMetadata,
      receivedAt: rawDate,
    });

    // Copia congelada para contrastar
    const frozenSnapshot = JSON.stringify(rawEvent);

    // 2. Crear candidato derivado
    const candidate = await candidateRepo.save({
      id: 'cand-gas-1',
      userId: 'user-diego',
      rawEventId: rawEvent.id,
      source: 'ANDROID_NOTIFICATION',
      provider: 'BBVA',
      amount: 500.0,
      amountMinor: 50000,
      currency: 'MXN',
      type: 'EXPENSE',
      merchant: 'Oxxo Gas',
      merchantRaw: 'OXXO GAS SUC 120',
      occurredAt: rawDate,
      confidenceScore: 90,
      status: 'PENDING_REVIEW',
      rawPayload: { ...originalPayload },
      metadata: { categoryName: 'Gasolina' },
      createdAt: rawDate,
      updatedAt: rawDate,
    });

    // 3. Aplicar corrección manual agresiva (cambiar a 'Gastos de Viaje' y crear regla)
    const result = await service.applyCorrection({
      userId: 'user-diego',
      entityType: 'CANDIDATE',
      entityId: candidate.id,
      newCategoryName: 'Viajes',
      saveAsReusableRule: true,
    });

    assert.strictEqual(result.rawEventUntouched, true);

    // 4. Inspeccionar el RawEvent original en el repositorio
    const retrievedRaw = await rawRepo.findById(rawEvent.id);
    assert.ok(retrievedRaw !== null);

    // Comparación estricta campo por campo
    assert.strictEqual(retrievedRaw.id, rawEvent.id);
    assert.strictEqual(retrievedRaw.source, 'ANDROID_NOTIFICATION');
    assert.strictEqual(retrievedRaw.status, 'PROCESSED');
    assert.strictEqual(retrievedRaw.rawText, 'Compra autorizada por $500.00 en OXXO GAS con tarjeta *4431');
    assert.deepStrictEqual(retrievedRaw.payload, originalPayload);
    assert.deepStrictEqual(retrievedRaw.metadata, originalMetadata);
    assert.strictEqual(JSON.stringify(retrievedRaw), frozenSnapshot);

    console.log('  [OK] Invariante validada: El RawEvent original se mantuvo 100% inalterado e inmutable');
  }

  // ── TEST 5: Corrección puntual SIN crear regla no altera eventos futuros ────
  console.log('\n[TEST 5] Corrección puntual (saveAsRule=false) no genera efectos secundarios globales');
  {
    const correctionRepo = new InMemoryUserCorrectionRepository();
    const candidateRepo = new InMemoryTransactionCandidateRepository();
    const categorizationService = new DeterministicCategorizationService();

    const service = new UserCorrectionService({
      correctionRepository: correctionRepo,
      candidateRepository: candidateRepo,
      categorizationService,
    });

    const userId = 'user-single-fix';

    const cand = await candidateRepo.save({
      id: 'cand-single-1',
      userId,
      rawEventId: 'raw-1',
      source: 'ANDROID_NOTIFICATION',
      provider: 'BBVA',
      amount: 100.0,
      amountMinor: 10000,
      currency: 'MXN',
      type: 'EXPENSE',
      merchant: 'Costco',
      merchantRaw: 'COSTCO POLANCO',
      occurredAt: new Date(),
      confidenceScore: 90,
      status: 'PENDING_REVIEW',
      rawPayload: {},
      metadata: { categoryName: 'Supermercado' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Corrección puntual a 'Electrónica' porque compró una laptop en Costco
    await service.applyCorrection({
      userId,
      entityType: 'CANDIDATE',
      entityId: cand.id,
      newCategoryName: 'Tecnología',
      saveAsReusableRule: false, // NO crear regla
    });

    // Una compra normal subsecuente en Costco debe seguir siendo 'Supermercado'
    const futureCheck = categorizationService.categorize({
      merchant: 'Costco Wholesale',
      userId,
    });

    assert.strictEqual(futureCheck.categoryName, 'Supermercado');
    assert.strictEqual(futureCheck.method, 'MERCHANT_MAPPING');

    console.log('  [OK] Corrección puntual aislada sin contaminación de reglas generales');
  }

  // ── TEST 6: Corrección con patrón personalizado (customPattern) ─────────────
  console.log('\n[TEST 6] Corrección con patrón personalizado explícito');
  {
    const correctionRepo = new InMemoryUserCorrectionRepository();
    const candidateRepo = new InMemoryTransactionCandidateRepository();
    const categorizationService = new DeterministicCategorizationService();

    const service = new UserCorrectionService({
      correctionRepository: correctionRepo,
      candidateRepository: candidateRepo,
      categorizationService,
    });

    const userId = 'user-custom-pattern';

    const cand = await candidateRepo.save({
      id: 'cand-custom-pat-1',
      userId,
      rawEventId: 'raw-2',
      source: 'ANDROID_NOTIFICATION',
      provider: 'BBVA',
      amount: 75.0,
      amountMinor: 7500,
      currency: 'MXN',
      type: 'EXPENSE',
      merchant: 'Farmacia La Mas Barata Sucursal 12',
      merchantRaw: 'FARM LA MAS BARATA',
      occurredAt: new Date(),
      confidenceScore: 80,
      status: 'PENDING_REVIEW',
      rawPayload: {},
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // El usuario define como patrón genérico 'La Mas Barata'
    const result = await service.applyCorrection({
      userId,
      entityType: 'CANDIDATE',
      entityId: cand.id,
      newCategoryName: 'Farmacia',
      saveAsReusableRule: true,
      customPattern: 'La Mas Barata',
    });

    assert.strictEqual(result.ruleCreated, true);
    assert.strictEqual(result.createdRule?.merchantPattern, 'La Mas Barata');

    // Futura compra en otra sucursal de 'La Mas Barata'
    const futureCheck = categorizationService.categorize({
      merchant: 'La Mas Barata Sucursal Norte',
      userId,
    });

    assert.strictEqual(futureCheck.categoryName, 'Farmacia');
    assert.strictEqual(futureCheck.method, 'USER_CORRECTIONS');

    console.log('  [OK] Patrón personalizado registrado y coincidente en sucursales variantes');
  }

  // ── TEST 7: Retiro y revocación de reglas aprendidas (deleteUserRule) ───────
  console.log('\n[TEST 7] Eliminación de regla aprendida y revocación del conocimiento');
  {
    const correctionRepo = new InMemoryUserCorrectionRepository();
    const categorizationService = new DeterministicCategorizationService();

    const service = new UserCorrectionService({
      correctionRepository: correctionRepo,
      categorizationService,
    });

    const userId = 'user-delete-rule';

    // Crear regla
    const ruleRecord = await correctionRepo.saveRule({
      id: 'rule-to-delete',
      userId,
      merchantPattern: 'Libreria Gandhi',
      categoryName: 'Educación',
      priority: 95,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    categorizationService.registerUserCorrection({
      id: ruleRecord.id,
      userId,
      merchantPattern: 'Libreria Gandhi',
      categoryName: 'Educación',
    });

    assert.strictEqual(
      categorizationService.categorize({ merchant: 'Libreria Gandhi', userId }).categoryName,
      'Educación',
    );

    // Eliminar regla
    const deleted = await service.deleteUserRule(userId, ruleRecord.id);
    assert.strictEqual(deleted, true);

    const rulesAfter = await service.getUserRules(userId);
    assert.strictEqual(rulesAfter.length, 0);

    // Ahora Gandhi no tiene regla de usuario (caerá en la regla sintáctica de libros o fallback)
    const afterCheck = categorizationService.categorize({ merchant: 'Libreria Gandhi Especial', userId });
    assert.strictEqual(afterCheck.method !== 'USER_CORRECTIONS', true);

    console.log('  [OK] Eliminación y desvinculación de reglas aprendidas verificado');
  }

  // ── TEST 8: Aislamiento estricto entre usuarios distintos ──────────────────
  console.log('\n[TEST 8] Aislamiento multi-usuario en correcciones y reglas');
  {
    const correctionRepo = new InMemoryUserCorrectionRepository();
    const categorizationService = new DeterministicCategorizationService();

    const service = new UserCorrectionService({
      correctionRepository: correctionRepo,
      categorizationService,
    });

    const userA = 'user-alice';
    const userB = 'user-bob';

    // Alice clasifica 'Mercado Municipal' como 'Restaurantes'
    await correctionRepo.saveRule({
      id: 'rule-alice',
      userId: userA,
      merchantPattern: 'Mercado Municipal',
      categoryName: 'Restaurantes',
      priority: 95,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    categorizationService.registerUserCorrection({
      id: 'rule-alice',
      userId: userA,
      merchantPattern: 'Mercado Municipal',
      categoryName: 'Restaurantes',
    });

    // Bob consulta ese mismo comercio
    const bobResult = categorizationService.categorize({
      merchant: 'Mercado Municipal',
      userId: userB,
    });

    // Bob no debe recibir la regla de Alice
    assert.strictEqual(bobResult.method !== 'USER_CORRECTIONS', true);

    console.log('  [OK] Aislamiento estricto garantizado entre diferentes usuarios');
  }

  // ── TEST 9: Validación y manejo de errores ─────────────────────────────────
  console.log('\n[TEST 9] Validación robusta de entradas');
  {
    const service = new UserCorrectionService();

    let threw = false;
    try {
      await service.applyCorrection({
        userId: '',
        entityType: 'CANDIDATE',
        entityId: 'cand-1',
        newCategoryName: 'Salud',
      });
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, true, 'Debe fallar si userId está vacío');

    threw = false;
    try {
      await service.applyCorrection({
        userId: 'user-1',
        entityType: 'CANDIDATE',
        entityId: 'cand-1',
        newCategoryName: '   ',
      });
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, true, 'Debe fallar si newCategoryName está vacío');

    console.log('  [OK] Validación y rechazo de parámetros inválidos verificado');
  }

  // ── TEST 10: Consultas de historial por entidad y por usuario ───────────────
  console.log('\n[TEST 10] Historial de correcciones por usuario y entidad');
  {
    const correctionRepo = new InMemoryUserCorrectionRepository();
    const candidateRepo = new InMemoryTransactionCandidateRepository();
    const service = new UserCorrectionService({
      correctionRepository: correctionRepo,
      candidateRepository: candidateRepo,
    });

    const cand = await candidateRepo.save({
      id: 'cand-audit-test',
      userId: 'user-audit',
      rawEventId: 'raw-ev-audit',
      source: 'ANDROID_NOTIFICATION',
      provider: 'NU',
      amount: 200,
      amountMinor: 20000,
      currency: 'MXN',
      type: 'EXPENSE',
      merchant: 'Tienda X',
      merchantRaw: 'TIENDA X',
      occurredAt: new Date(),
      confidenceScore: 80,
      status: 'PENDING_REVIEW',
      rawPayload: {},
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Corrección 1
    await service.applyCorrection({
      userId: 'user-audit',
      entityType: 'CANDIDATE',
      entityId: cand.id,
      newCategoryName: 'Alimentación',
    });

    // Corrección 2 posterior sobre el mismo
    await service.applyCorrection({
      userId: 'user-audit',
      entityType: 'CANDIDATE',
      entityId: cand.id,
      newCategoryName: 'Supermercado',
    });

    const entityHistory = await correctionRepo.findCorrectionsByEntityId(cand.id);
    assert.strictEqual(entityHistory.length, 2);
    assert.strictEqual(entityHistory[0].newCategoryName, 'Supermercado');
    assert.strictEqual(entityHistory[1].newCategoryName, 'Alimentación');

    console.log('  [OK] Historial cronológico de correcciones consultable y ordenado');
  }

  console.log('\n[DONE] ¡Todos los tests de US-032 pasaron exitosamente (10/10)!');
}
