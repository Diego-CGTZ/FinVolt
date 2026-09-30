// Helper de aserciones sin dependencias externas para compatibilidad con tsc
function assert(condition: any, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}
assert.strictEqual = (actual: any, expected: any, msg?: string) => {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${expected} but got ${actual}`);
  }
};
assert.deepStrictEqual = (actual: any, expected: any, msg?: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(msg || `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
};
assert.ok = (condition: any, msg?: string) => {
  if (!condition) throw new Error(msg || 'Expected truthy');
};
assert.rejects = async (fn: () => Promise<any>, errorRegex: RegExp) => {
  try {
    await fn();
    throw new Error('Expected promise to reject');
  } catch (err: any) {
    if (!errorRegex.test(err.message)) {
      throw new Error(`Expected error matching ${errorRegex} but got: ${err.message}`);
    }
  }
};
import { RawEventService } from '../../src/domain/services/RawEventService';
import type {
  CreateRawEventDTO,
  RawEvent,
  RawEventSource,
  RawEventStatus,
  UpdateRawEventStatusDTO,
} from '../../src/domain/models/RawEvent';
import type {
  IRawEventRepository,
  RawEventFilter,
} from '../../src/domain/repositories/IRawEventRepository';

/**
 * Mock en memoria de IRawEventRepository para pruebas unitarias.
 */
class InMemoryRawEventRepository implements IRawEventRepository {
  private events: RawEvent[] = [];

  async save(dto: CreateRawEventDTO): Promise<RawEvent> {
    const event: RawEvent = {
      id: `evt-${Date.now()}-${Math.random()}`,
      userId: 'test-user-id',
      source: dto.source,
      sourceId: dto.sourceId,
      payload: dto.payload,
      rawText: dto.rawText,
      metadata: dto.metadata || {},
      status: 'PENDING',
      retryCount: 0,
      receivedAt: dto.receivedAt || new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.events.unshift(event);
    return event;
  }

  async findById(id: string): Promise<RawEvent | null> {
    return this.events.find((e) => e.id === id) || null;
  }

  async findBySourceId(source: RawEventSource, sourceId: string): Promise<RawEvent | null> {
    return (
      this.events.find((e) => e.source === source && e.sourceId === sourceId) || null
    );
  }

  async getPendingEvents(limit = 50): Promise<RawEvent[]> {
    return this.events.filter((e) => e.status === 'PENDING').slice(0, limit);
  }

  async getEvents(filter: RawEventFilter = {}): Promise<RawEvent[]> {
    return this.events
      .filter((e) => !filter.status || e.status === filter.status)
      .filter((e) => !filter.source || e.source === filter.source)
      .slice(0, filter.limit || 50);
  }

  async updateStatus(id: string, updates: UpdateRawEventStatusDTO): Promise<RawEvent> {
    const event = await this.findById(id);
    if (!event) throw new Error('Not found');

    event.status = updates.status;
    if (updates.errorMessage !== undefined) {
      event.errorMessage = updates.errorMessage ?? undefined;
    }
    if (updates.processedAt !== undefined) {
      event.processedAt = updates.processedAt ?? undefined;
    }
    event.updatedAt = new Date();
    return event;
  }

  async markForReprocessing(id: string): Promise<RawEvent> {
    const event = await this.findById(id);
    if (!event) throw new Error('Not found');

    event.status = 'PENDING';
    event.errorMessage = undefined;
    event.retryCount += 1;
    event.updatedAt = new Date();
    return event;
  }
}

async function runTests() {
  console.log('[TEST] Iniciando pruebas de US-018: RawEventService...\n');

  const repo = new InMemoryRawEventRepository();
  const service = new RawEventService(repo);

  // Test 1: Captura de evento preserva payload y metadata original
  {
    console.log('[TEST 1] Preservación de payload y metadata original');
    const payload = {
      title: 'BBVA: Compra autorizada',
      body: 'Compra por $450.00 en OXXO con tarjeta *1234',
      packageName: 'com.bbva.bbvacontigo',
    };
    const metadata = {
      deviceModel: 'Pixel 8',
      capturedVia: 'NotificationListenerService',
    };

    const result = await service.capture({
      source: 'ANDROID_NOTIFICATION',
      sourceId: 'notif-key-101',
      payload,
      rawText: payload.body,
      metadata,
    });

    assert.strictEqual(result.isNew, true, 'Debe marcarse como nuevo');
    assert.strictEqual(result.event.status, 'PENDING', 'Debe crearse con status PENDING');
    assert.strictEqual(result.event.source, 'ANDROID_NOTIFICATION');
    assert.deepStrictEqual(result.event.payload, payload, 'Payload debe preservarse idéntico');
    assert.deepStrictEqual(result.event.metadata, metadata, 'Metadata debe preservarse idéntica');
    assert.strictEqual(result.event.rawText, payload.body);
    console.log('  [OK] Datos crudos preservados íntegros');
  }

  // Test 2: Deduplicación por source y sourceId
  {
    console.log('[TEST 2] Deduplicación por source_id');
    const result2 = await service.capture({
      source: 'ANDROID_NOTIFICATION',
      sourceId: 'notif-key-101', // Mismo ID del test 1
      payload: { title: 'Repetida' },
    });

    assert.strictEqual(result2.isNew, false, 'No debe duplicar un source_id ya existente');
    assert.strictEqual(result2.event.sourceId, 'notif-key-101');
    console.log('  [OK] Deduplicación temprana correcta');
  }

  // Test 3: Transición de ciclo de vida: PENDING -> PROCESSED
  {
    console.log('[TEST 3] Marcar evento como procesado');
    const result = await service.capture({
      source: 'EMAIL',
      sourceId: 'msg-id-202',
      payload: { subject: 'Cargo a tu cuenta Nu' },
    });

    const processed = await service.markAsProcessed(result.event.id);
    assert.strictEqual(processed.status, 'PROCESSED');
    assert.ok(processed.processedAt instanceof Date, 'Debe registrar processedAt');
    assert.strictEqual(processed.errorMessage, undefined);
    console.log('  [OK] Estado actualizado a PROCESSED');
  }

  // Test 4: Transición de fallo: PENDING -> FAILED
  {
    console.log('[TEST 4] Marcar evento como fallido');
    const result = await service.capture({
      source: 'SMS',
      sourceId: 'sms-303',
      payload: { text: 'Texto ilegible' },
    });

    const failed = await service.markAsFailed(result.event.id, 'No se pudo parsear el monto');
    assert.strictEqual(failed.status, 'FAILED');
    assert.strictEqual(failed.errorMessage, 'No se pudo parsear el monto');
    console.log('  [OK] Estado FAILED y error_message registrados');
  }

  // Test 5: Reprocesamiento de evento fallido
  {
    console.log('[TEST 5] Reprocesamiento (reprocess)');
    const result = await service.capture({
      source: 'BANK_PDF',
      sourceId: 'pdf-hash-404',
      payload: { filename: 'estado_cuenta.pdf' },
    });

    await service.markAsFailed(result.event.id, 'Formato desconocido');
    const reprocessed = await service.reprocess(result.event.id);

    assert.strictEqual(reprocessed.status, 'PENDING', 'Debe regresar a PENDING');
    assert.strictEqual(reprocessed.errorMessage, undefined, 'Debe limpiar error_message');
    assert.strictEqual(reprocessed.retryCount, 1, 'Debe incrementar retryCount a 1');

    const pendingListAfter = await service.getPendingEvents();
    assert.ok(
      pendingListAfter.some((e) => e.id === result.event.id),
      'El evento debe volver a estar en la lista de pendientes',
    );
    console.log('  [OK] Reprocesamiento exitoso con incremento de reintentos');
  }

  // Test 6: Validación de campos obligatorios
  {
    console.log('[TEST 6] Validaciones de integridad');
    await assert.rejects(
      async () => {
        await service.capture({ source: '' as any, payload: {} });
      },
      /La fuente \(source\) del raw event es obligatoria/,
    );

    await assert.rejects(
      async () => {
        await service.capture({ source: 'SMS', payload: null as any });
      },
      /El payload del raw event debe ser un objeto válido/,
    );
    console.log('  [OK] Rechazo de entradas inválidas');
  }

  console.log('\n[DONE] ¡Todos los tests de US-018 pasaron exitosamente (6/6)!');
}

runTests().catch((err) => {
  console.error('[ERROR] Error en pruebas:', err);
  process.exit(1);
});
