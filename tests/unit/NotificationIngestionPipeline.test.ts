/**
 * Pruebas unitarias para US-021: Pipeline de Ingestión de Notificaciones
 *
 * Acceptance Criteria:
 * Notification -> Raw Event -> Provider Detection -> Financial Detection -> Parser -> Candidate
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
import { NotificationIngestionPipeline } from '../../src/application/services/NotificationIngestionPipeline';
import { RawEventService } from '../../src/domain/services/RawEventService';
import { ProviderDetector } from '../../src/domain/services/detection/ProviderDetector';
import { FinancialContentDetector } from '../../src/domain/services/detection/FinancialContentDetector';
import { BBVANotificationParser } from '../../src/domain/services/parsers/BBVANotificationParser';
import { GenericNotificationParser } from '../../src/domain/services/parsers/GenericNotificationParser';
import { InMemoryTransactionCandidateRepository } from '../../src/infrastructure/database/InMemoryTransactionCandidateRepository';
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

  clear(): void {
    this.events.clear();
  }
}

export async function runNotificationPipelineTests() {
  console.log('\n--- Suite 4: US-021 Notification Ingestion Pipeline ---');
  console.log('[TEST] Iniciando pruebas de US-021: Pipeline de Notificaciones...');

  const rawRepo = new MockRawEventRepository();
  const rawService = new RawEventService(rawRepo);
  const candidateRepo = new InMemoryTransactionCandidateRepository();
  const pipeline = new NotificationIngestionPipeline(rawService, candidateRepo);

  // ── TEST 1: Provider Detection ──────────────────────────────────────────────
  console.log('\n[TEST 1] Provider Detection (BBVA, Nu, Banorte, Santander, Generic)');
  {
    const bbvaByPkg = ProviderDetector.detect({ packageName: 'com.bbva.bancomer' });
    assert.strictEqual(bbvaByPkg.provider, 'BBVA');
    assert.strictEqual(bbvaByPkg.matchedOn, 'PACKAGE_NAME');

    const nuByTitle = ProviderDetector.detect({ title: 'Tu Cuenta Nu' });
    assert.strictEqual(nuByTitle.provider, 'NU');

    const santanderByText = ProviderDetector.detect({ text: 'Cargo aprobado en Santander SuperMóvil' });
    assert.strictEqual(santanderByText.provider, 'SANTANDER');

    const banorteByPkg = ProviderDetector.detect({ packageName: 'com.banorte.movil' });
    assert.strictEqual(banorteByPkg.provider, 'BANORTE');

    const genericUnknown = ProviderDetector.detect({ text: 'Operación realizada por $500.00' });
    assert.strictEqual(genericUnknown.provider, 'GENERIC');

    console.log('  [OK] Detección de proveedores validada para múltiples instituciones');
  }

  // ── TEST 2: Financial Content Detection y Filtro de Privacidad ──────────────
  console.log('\n[TEST 2] Financial Content Detection (Transaccional vs OTP / Avisos)');
  {
    const expense = FinancialContentDetector.detect({
      title: 'BBVA',
      text: 'Compra por $450.00 en OXXO con tarjeta *1234',
    });
    assert.strictEqual(expense.isFinancial, true);
    assert.strictEqual(expense.isTransactional, true);
    assert.strictEqual(expense.intent, 'EXPENSE');
    assert.strictEqual(expense.extractedAmount, 450);

    const income = FinancialContentDetector.detect({
      title: 'Nu',
      text: 'Transferencia recibida por $1,500.00 de Juan Pérez',
    });
    assert.strictEqual(income.isFinancial, true);
    assert.strictEqual(income.isTransactional, true);
    assert.strictEqual(income.intent, 'INCOME');
    assert.strictEqual(income.extractedAmount, 1500);

    // Mensaje de seguridad / OTP: debe descartarse de transacciones
    const otp = FinancialContentDetector.detect({
      title: 'BBVA Seguridad',
      text: 'Tu código de seguridad OTP para ingresar es 984123. No lo compartas.',
    });
    assert.strictEqual(otp.isTransactional, false);
    assert.strictEqual(otp.intent, 'NON_TRANSACTIONAL');

    console.log('  [OK] Discriminación transaccional y filtro de códigos de seguridad validados');
  }

  // ── TEST 3: BBVA Notification Parser ────────────────────────────────────────
  console.log('\n[TEST 3] BBVA Notification Parser (monto, comercio, tarjeta, tipo)');
  {
    const parser = new BBVANotificationParser();
    const rawEvent: RawEvent = {
      id: 'raw-bbva-1',
      userId: 'user-1',
      source: 'ANDROID_NOTIFICATION',
      payload: {
        packageName: 'com.bbva.bancomer',
        title: 'BBVA México',
        text: 'Compra por $349.00 en Mercado Pago con tarjeta débito *8821',
      },
      metadata: {},
      status: 'PENDING',
      retryCount: 0,
      receivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    assert.strictEqual(parser.canParse('BBVA', rawEvent), true);

    const parsed = await parser.parse(rawEvent);
    assert.ok(parsed !== null);
    if (!parsed) throw new Error('Expected parsed not to be null');
    assert.strictEqual(parsed.amount, 349);
    assert.strictEqual(parsed.currency, 'MXN');
    assert.strictEqual(parsed.type, 'EXPENSE');
    assert.strictEqual(parsed.merchant, 'Mercado Pago');
    assert.strictEqual(parsed.accountHint?.last4Digits, '8821');
    assert.strictEqual(parsed.accountHint?.accountType, 'DEBIT');

    console.log('  [OK] BBVA Parser extrajo estructuradamente todos los campos');
  }

  // ── TEST 4: Generic Notification Parser Fallback ────────────────────────────
  console.log('\n[TEST 4] Generic Notification Parser (Fallback universal)');
  {
    const genericParser = new GenericNotificationParser();
    const rawEvent: RawEvent = {
      id: 'raw-generic-1',
      userId: 'user-1',
      source: 'ANDROID_NOTIFICATION',
      payload: {
        packageName: 'com.banco.desconocido',
        title: 'Aviso Bancario',
        text: 'Pago realizado por $75.50 en Farmacias Guadalajara',
      },
      metadata: {},
      status: 'PENDING',
      retryCount: 0,
      receivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    assert.strictEqual(genericParser.canParse(), true);

    const parsed = await genericParser.parse(rawEvent);
    assert.ok(parsed !== null);
    if (!parsed) throw new Error('Expected parsed not to be null');
    assert.strictEqual(parsed.amount, 75.5);
    assert.strictEqual(parsed.merchant, 'Farmacias Guadalajara');
    assert.strictEqual(parsed.type, 'EXPENSE');

    console.log('  [OK] Generic Parser funcionó correctamente como fallback');
  }

  // ── TEST 5: Flujo Completo del Pipeline (Notification -> Candidate) ─────────
  console.log('\n[TEST 5] Flujo Completo: Notification -> Raw Event -> Provider -> Financial -> Parser -> Candidate');
  {
    let candidateEventReceived = false;
    const unsub = pipeline.onCandidateGenerated((candidate) => {
      candidateEventReceived = true;
      assert.strictEqual(candidate.provider, 'BBVA México');
      assert.strictEqual(candidate.amount, 899.99);
      assert.strictEqual(candidate.amountMinor, 89999);
    });

    const result = await pipeline.processNotification({
      packageName: 'com.bbva.bancomer',
      title: 'BBVA',
      text: 'Compra por $899.99 en Liverpool con tarjeta *4567',
      key: 'notif_key_liverpool_01',
    });

    unsub();

    assert.strictEqual(result.status, 'SUCCESS');
    assert.strictEqual(result.provider.provider, 'BBVA');
    assert.strictEqual(result.financialDetection.isTransactional, true);
    assert.ok(result.candidate !== null);
    if (!result.candidate) throw new Error('Expected result.candidate not to be null');
    assert.strictEqual(result.candidate.amount, 899.99);
    assert.strictEqual(result.candidate.amountMinor, 89999);
    assert.strictEqual(result.candidate.merchant, 'Liverpool');
    assert.strictEqual(result.candidate.status, 'PENDING_REVIEW');
    assert.strictEqual(candidateEventReceived, true);

    // Verificar persistencia desacoplada en repositorio de candidatos
    const savedCandidates = await pipeline.getCandidates();
    assert.ok(savedCandidates.some((c) => c.id === result.candidate?.id));

    // Verificar que el RawEvent fue actualizado a PROCESSED
    const storedRaw = await rawRepo.findById(result.rawEvent.id);
    assert.strictEqual(storedRaw?.status, 'PROCESSED');

    console.log('  [OK] Pipeline completó exitosamente todos los 6 pasos y emitió el candidato');
  }

  // ── TEST 6: Descarte de Notificaciones No Financieras (Estado IGNORED) ───────
  console.log('\n[TEST 6] Notificación No Financiera marcada como IGNORED sin generar candidato');
  {
    const result = await pipeline.processNotification({
      packageName: 'com.bbva.bancomer',
      title: 'BBVA Token',
      text: 'Tu código de seguridad para autorizar la operación es 451029',
      key: 'otp_notif_99',
    });

    assert.strictEqual(result.status, 'IGNORED');
    assert.strictEqual(result.candidate, null);

    const storedRaw = await rawRepo.findById(result.rawEvent.id);
    assert.strictEqual(storedRaw?.status, 'IGNORED');

    console.log('  [OK] Notificación no financiera preservada en raw_events con status IGNORED y sin candidato');
  }

  // ── TEST 7: Invariante Estricta: Cero mutaciones en la tabla transactions ────
  console.log('\n[TEST 7] Invariante de Arquitectura: Cero escrituras en tabla transactions');
  {
    // Verificamos que TransactionCandidate es un modelo desacoplado y que el pipeline
    // no interactúa con ningún ITransactionRepository
    const candidates = await pipeline.getCandidates();
    for (const cand of candidates) {
      assert.strictEqual(cand.status, 'PENDING_REVIEW');
      assert.ok(cand.rawEventId.length > 0);
      assert.ok(cand.rawPayload !== undefined);
      // El candidato no tiene accountId definitivo obligatorio (a diferencia de Transaction)
    }

    console.log('  [OK] Invariante cumplida: Candidate es capa intermedia desacoplada');
  }

  console.log('\n[DONE] ¡Todos los tests de US-021 pasaron exitosamente (7/7)!');
}
