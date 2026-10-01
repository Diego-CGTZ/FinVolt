/**
 * Pruebas unitarias para US-022: Parser BBVA
 *
 * Acceptance Criteria:
 * Detecta BBVA; extrae monto, merchant y fecha; identifica tipo cuando sea posible;
 * conserva payload; genera candidate.
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

import { BBVANotificationParser } from '../../src/domain/services/parsers/BBVANotificationParser';
import { NotificationIngestionPipeline } from '../../src/application/services/NotificationIngestionPipeline';
import { RawEventService } from '../../src/domain/services/RawEventService';
import { InMemoryTransactionCandidateRepository } from '../../src/infrastructure/database/InMemoryTransactionCandidateRepository';
import type { IRawEventRepository, RawEventFilter } from '../../src/domain/repositories/IRawEventRepository';
import type {
  CreateRawEventDTO,
  RawEvent,
  RawEventSource,
  UpdateRawEventStatusDTO,
} from '../../src/domain/models/RawEvent';

// Mock de RawEventRepository para pruebas unitarias
class MockRawEventRepository implements IRawEventRepository {
  private events: Map<string, RawEvent> = new Map();

  async save(dto: CreateRawEventDTO): Promise<RawEvent> {
    const id = `raw_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date();
    const event: RawEvent = {
      id,
      userId: 'test-user-bbva',
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
    const updated: RawEvent = { ...event, status: 'PENDING', updatedAt: new Date() };
    this.events.set(id, updated);
    return { ...updated };
  }
}

function buildMockRawEvent(title: string, text: string, packageName = 'com.bbva.bancomer'): RawEvent {
  const now = new Date();
  return {
    id: `raw-${Math.random().toString(36).substr(2, 8)}`,
    userId: 'user-bbva-test',
    source: 'ANDROID_NOTIFICATION',
    payload: { packageName, title, text },
    rawText: `${title} ${text}`,
    metadata: { packageName },
    status: 'PENDING',
    retryCount: 0,
    receivedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export async function runBBVAParserTests() {
  console.log('\n--- Suite 5: US-022 Parser BBVA ---');
  console.log('[TEST] Iniciando pruebas de US-022: Parser BBVA...');

  const parser = new BBVANotificationParser();

  // ── TEST 1: Detección de BBVA (canParse) ─────────────────────────────────────
  console.log('\n[TEST 1] Detección robusta de BBVA (package, título y firma)');
  {
    const byPkg = buildMockRawEvent('Notificación', 'Movimiento registrado', 'com.bbva.bancomer');
    assert.strictEqual(parser.canParse('BBVA', byPkg), true);
    assert.strictEqual(parser.canParse('GENERIC', byPkg), true);

    const byTitle = buildMockRawEvent('Línea BBVA', 'Movimiento por $100', 'com.other.app');
    assert.strictEqual(parser.canParse('GENERIC', byTitle), true);

    const nonBbva = buildMockRawEvent('WhatsApp', 'Mensaje de mamá', 'com.whatsapp');
    assert.strictEqual(parser.canParse('OTHER', nonBbva), false);

    console.log('  [OK] canParse identifica BBVA y descarta aplicaciones no financieras');
  }

  // ── TEST 2: Compra en Comercio con Tarjeta Débito y Fecha Explícita ─────────
  console.log('\n[TEST 2] Compra con Tarjeta Débito y Fecha Explícita');
  {
    const raw = buildMockRawEvent(
      'BBVA México',
      'Compra por $349.00 en Mercado Pago con tarjeta débito *8821 el 25/09/2026 a las 14:30 hrs',
    );

    const parsed = await parser.parse(raw);
    assert.ok(parsed !== null);
    if (!parsed) throw new Error('Expected parsed to be defined');

    assert.strictEqual(parsed.amount, 349);
    assert.strictEqual(parsed.currency, 'MXN');
    assert.strictEqual(parsed.type, 'EXPENSE');
    assert.strictEqual(parsed.merchant, 'Mercado Pago');
    assert.strictEqual(parsed.accountHint?.last4Digits, '8821');
    assert.strictEqual(parsed.accountHint?.accountType, 'DEBIT');
    assert.strictEqual(parsed.accountHint?.bankName, 'BBVA');

    // Verificar fecha extraída: 25/09/2026 14:30
    assert.strictEqual(parsed.occurredAt.getFullYear(), 2026);
    assert.strictEqual(parsed.occurredAt.getMonth(), 8); // Septiembre = 8 (0-indexed)
    assert.strictEqual(parsed.occurredAt.getDate(), 25);
    assert.strictEqual(parsed.occurredAt.getHours(), 14);
    assert.strictEqual(parsed.occurredAt.getMinutes(), 30);

    console.log('  [OK] Extracción de monto, comercio, tarjeta débito y fecha/hora exitosa');
  }

  // ── TEST 3: Compra con Tarjeta de Crédito ───────────────────────────────────
  console.log('\n[TEST 3] Compra con Tarjeta de Crédito (*1029)');
  {
    const raw = buildMockRawEvent(
      'BBVA',
      'Compra por $1,250.50 en Amazon México con tarjeta crédito *1029',
    );

    const parsed = await parser.parse(raw);
    assert.ok(parsed !== null);
    if (!parsed) throw new Error('Expected parsed to be defined');

    assert.strictEqual(parsed.amount, 1250.5);
    assert.strictEqual(parsed.currency, 'MXN');
    assert.strictEqual(parsed.type, 'EXPENSE');
    assert.strictEqual(parsed.merchant, 'Amazon México');
    assert.strictEqual(parsed.accountHint?.last4Digits, '1029');
    assert.strictEqual(parsed.accountHint?.accountType, 'CREDIT');

    console.log('  [OK] Compra de crédito identificada correctamente');
  }

  // ── TEST 4: Retiro en Cajero Automático y Sin Tarjeta ───────────────────────
  console.log('\n[TEST 4] Retiro en Cajero Automático / Sin Tarjeta');
  {
    const rawAtm = buildMockRawEvent(
      'BBVA',
      'Retiro sin tarjeta por $1,000.00 en Cajero BBVA el 28/09/2026',
    );

    const parsed = await parser.parse(rawAtm);
    assert.ok(parsed !== null);
    if (!parsed) throw new Error('Expected parsed to be defined');

    assert.strictEqual(parsed.amount, 1000);
    assert.strictEqual(parsed.type, 'EXPENSE');
    assert.strictEqual(parsed.merchant, 'Retiro sin Tarjeta BBVA');
    assert.strictEqual(parsed.occurredAt.getDate(), 28);
    assert.strictEqual(parsed.occurredAt.getMonth(), 8);

    console.log('  [OK] Retiro en cajero sin tarjeta interpretado correctamente');
  }

  // ── TEST 5: Transferencia Recibida (INCOME) con Remitente ───────────────────
  console.log('\n[TEST 5] Transferencia Recibida (INCOME)');
  {
    const raw = buildMockRawEvent(
      'BBVA',
      'Transferencia recibida por $5,000.00 de Juan Pérez concepto Renta depa',
    );

    const parsed = await parser.parse(raw);
    assert.ok(parsed !== null);
    if (!parsed) throw new Error('Expected parsed to be defined');

    assert.strictEqual(parsed.amount, 5000);
    assert.strictEqual(parsed.type, 'INCOME');
    assert.strictEqual(parsed.merchant, 'Juan Pérez');

    console.log('  [OK] Transferencia entrante clasificada como INCOME con remitente correcto');
  }

  // ── TEST 6: Transferencia Enviada (EXPENSE) con Destinatario ────────────────
  console.log('\n[TEST 6] Transferencia Enviada (EXPENSE)');
  {
    const raw = buildMockRawEvent(
      'BBVA',
      'Transferencia enviada por $650.00 a María López concepto Cena',
    );

    const parsed = await parser.parse(raw);
    assert.ok(parsed !== null);
    if (!parsed) throw new Error('Expected parsed to be defined');

    assert.strictEqual(parsed.amount, 650);
    assert.strictEqual(parsed.type, 'EXPENSE');
    assert.strictEqual(parsed.merchant, 'María López');

    console.log('  [OK] Transferencia saliente clasificada como EXPENSE con destinatario');
  }

  // ── TEST 7: Traspaso Entre Cuentas Propias (TRANSFER) ───────────────────────
  console.log('\n[TEST 7] Traspaso Entre Cuentas Propias (TRANSFER)');
  {
    const raw = buildMockRawEvent(
      'BBVA',
      'Traspaso entre tus cuentas por $2,000.00 de Libretón a Tarjeta Azul',
    );

    const parsed = await parser.parse(raw);
    assert.ok(parsed !== null);
    if (!parsed) throw new Error('Expected parsed to be defined');

    assert.strictEqual(parsed.amount, 2000);
    assert.strictEqual(parsed.type, 'TRANSFER');

    console.log('  [OK] Traspaso interno clasificado como TRANSFER');
  }

  // ── TEST 8: Generación de TransactionCandidate a través del Pipeline ────────
  console.log('\n[TEST 8] Generación integral de TransactionCandidate conservando payload');
  {
    const rawRepo = new MockRawEventRepository();
    const rawService = new RawEventService(rawRepo);
    const candidateRepo = new InMemoryTransactionCandidateRepository();
    const pipeline = new NotificationIngestionPipeline(rawService, candidateRepo);

    const notif = {
      packageName: 'com.bbva.bancomer',
      title: 'BBVA México',
      text: 'Compra por $420.00 en OXXO con tarjeta débito *1122 el 20/09/2026',
      key: 'bbva_notif_oxxo_01',
    };

    const result = await pipeline.processNotification(notif);

    assert.strictEqual(result.status, 'SUCCESS');
    assert.strictEqual(result.provider.provider, 'BBVA');
    assert.ok(result.candidate !== null);
    if (!result.candidate) throw new Error('Expected candidate to exist');

    // Criterios de Aceptación US-022:
    // 1. Detecta BBVA
    assert.strictEqual(result.candidate.provider, 'BBVA México');
    // 2. Extrae monto
    assert.strictEqual(result.candidate.amount, 420);
    assert.strictEqual(result.candidate.amountMinor, 42000);
    // 3. Extrae merchant
    assert.strictEqual(result.candidate.merchant, 'OXXO');
    // 4. Extrae fecha
    assert.strictEqual(result.candidate.occurredAt.getDate(), 20);
    assert.strictEqual(result.candidate.occurredAt.getMonth(), 8);
    // 5. Identifica tipo
    assert.strictEqual(result.candidate.type, 'EXPENSE');
    // 6. Conserva payload original
    assert.deepStrictEqual(result.candidate.rawPayload, notif);
    // 7. Genera candidate desacoplado
    assert.strictEqual(result.candidate.status, 'PENDING_REVIEW');
    assert.strictEqual(result.candidate.accountHint?.last4Digits, '1122');
    assert.strictEqual(result.candidate.accountHint?.accountType, 'DEBIT');

    console.log('  [OK] Candidato generado con todos los criterios de aceptación de US-022');
  }

  console.log('\n[DONE] ¡Todos los tests de US-022 pasaron exitosamente (8/8)!');
}
