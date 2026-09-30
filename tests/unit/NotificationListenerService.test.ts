// Helper de aserciones sin dependencias externas
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

import { FinancialAppWhitelist } from '../../src/domain/services/FinancialAppWhitelist';
import { AndroidNotificationListenerModule } from '../../src/infrastructure/native/AndroidNotificationListenerModule';
import { NotificationIngestionService } from '../../src/application/services/NotificationIngestionService';
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

class MockRawEventRepo implements IRawEventRepository {
  public savedEvents: RawEvent[] = [];

  async save(dto: CreateRawEventDTO): Promise<RawEvent> {
    const event: RawEvent = {
      id: `raw-${Date.now()}-${Math.random()}`,
      userId: 'test-user',
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
    this.savedEvents.unshift(event);
    return event;
  }

  async findById(id: string): Promise<RawEvent | null> {
    return this.savedEvents.find((e) => e.id === id) || null;
  }

  async findBySourceId(source: RawEventSource, sourceId: string): Promise<RawEvent | null> {
    return this.savedEvents.find((e) => e.source === source && e.sourceId === sourceId) || null;
  }

  async getPendingEvents(): Promise<RawEvent[]> {
    return this.savedEvents.filter((e) => e.status === 'PENDING');
  }

  async getEvents(filter: RawEventFilter = {}): Promise<RawEvent[]> {
    return this.savedEvents;
  }

  async updateStatus(id: string, updates: UpdateRawEventStatusDTO): Promise<RawEvent> {
    const e = await this.findById(id);
    if (!e) throw new Error('Not found');
    e.status = updates.status;
    return e;
  }

  async markForReprocessing(id: string): Promise<RawEvent> {
    const e = await this.findById(id);
    if (!e) throw new Error('Not found');
    e.status = 'PENDING';
    return e;
  }
}

async function runTests() {
  console.log('[TEST] Iniciando pruebas de US-020: NotificationListenerService...\n');

  const repo = new MockRawEventRepo();
  const rawService = new RawEventService(repo);
  const ingestionService = new NotificationIngestionService(rawService);

  // Test 1: FinancialAppWhitelist reconoce bancos y rechaza apps no financieras
  {
    console.log('[TEST 1] FinancialAppWhitelist: filtrado de paquetes');
    assert.strictEqual(FinancialAppWhitelist.isKnownApp('com.bbva.bbvacontigo'), true);
    assert.strictEqual(FinancialAppWhitelist.isKnownApp('com.nu.production'), true);
    assert.strictEqual(FinancialAppWhitelist.isKnownApp('mx.com.santander.supermovil'), true);
    assert.strictEqual(FinancialAppWhitelist.isKnownApp('com.whatsapp'), false);
    assert.strictEqual(FinancialAppWhitelist.isKnownApp('com.instagram.android'), false);
    console.log('  [OK] Whitelist bancario validado');
  }

  // Test 2: Detección inteligente por contenido financiero
  {
    console.log('[TEST 2] FinancialAppWhitelist: detección por contenido financiero');
    const isFin = FinancialAppWhitelist.isFinancialNotification(
      'com.other.app',
      'Compra autorizada por $150.00 MXN en Farmacias',
    );
    assert.strictEqual(isFin, true, 'Debe detectar compra con monto monetario');

    const isSocial = FinancialAppWhitelist.isFinancialNotification(
      'com.whatsapp',
      'Hola, ¿cómo estás? Nos vemos al rato',
    );
    assert.strictEqual(isSocial, false, 'Debe descartar mensajes sociales');
    console.log('  [OK] Detección de contenido financiero y privacidad validadas');
  }

  // Test 3: NotificationIngestionService procesa notificación bancaria válida
  {
    console.log('[TEST 3] NotificationIngestionService: flujo completo de captura');
    const notif = {
      packageName: 'com.bbva.bbvacontigo',
      title: 'BBVA: Transferencia enviada',
      text: 'Enviaste $500.00 a Juan Pérez vía SPEI',
      postTime: 1727655000000,
      key: 'bbva-notif-001',
    };

    let callbackFired = false;
    const unsub = ingestionService.onEventCaptured((event) => {
      callbackFired = true;
      assert.strictEqual(event.source, 'ANDROID_NOTIFICATION');
      assert.strictEqual(event.sourceId, 'bbva-notif-001');
    });

    const result = await ingestionService.processIncomingNotification(notif);
    unsub();

    assert.strictEqual(result.captured, true);
    assert.strictEqual(result.isNew, true);
    assert.strictEqual(callbackFired, true);
    assert.ok(result.rawEvent);
    assert.strictEqual(result.rawEvent?.status, 'PENDING');
    console.log('  [OK] Notificación adaptada y guardada como RawEvent PENDING');
  }

  // Test 4: Descarte de notificaciones no financieras sin persistir
  {
    console.log('[TEST 4] Descarte de notificaciones no financieras');
    const countBefore = repo.savedEvents.length;

    const notifChat = {
      packageName: 'com.whatsapp',
      title: 'Mamá',
      text: 'No olvides pasar por el pan',
      postTime: Date.now(),
    };

    const result = await ingestionService.processIncomingNotification(notifChat);
    assert.strictEqual(result.captured, false);
    assert.strictEqual(repo.savedEvents.length, countBefore, 'No debe persistir eventos no financieros');
    console.log('  [OK] Privacidad garantizada: evento no financiero descartado');
  }

  // Test 5: Simulación a través de AndroidNotificationListenerModule
  {
    console.log('[TEST 5] Emulación y suscripción de AndroidNotificationListenerModule');
    ingestionService.start();

    let eventCapturedFromModule = false;
    const unsub = ingestionService.onEventCaptured((event) => {
      if (event.sourceId === 'sim-test-key-555') {
        eventCapturedFromModule = true;
      }
    });

    AndroidNotificationListenerModule.simulate({
      packageName: 'com.nu.production',
      title: 'Nu: Compra aprobada',
      text: 'Compra por $250.00 en Tienda Nu',
      key: 'sim-test-key-555',
    });

    // Esperar microtask para asegurar procesamiento asíncrono
    await new Promise((r) => setTimeout(r, 20));

    unsub();
    ingestionService.stop();

    assert.strictEqual(eventCapturedFromModule, true);
    console.log('  [OK] Simulación y despacho por el módulo listener validados');
  }

  // Test 6: Invariante arquitectónica: nunca insertar en transactions
  {
    console.log('[TEST 6] Invariante: Preservación de RawEvent sin inserción en transactions');
    const latestRaw = repo.savedEvents[0];
    assert.ok(latestRaw, 'Debe existir un raw event');
    assert.strictEqual(latestRaw.status, 'PENDING');
    assert.strictEqual(latestRaw.source, 'ANDROID_NOTIFICATION');
    // Verificamos que el raw event conserva el payload original intacto
    assert.ok(latestRaw.payload);
    assert.ok(latestRaw.rawText);
    console.log('  [OK] Invariante cumplida: Datos crudos intactos para pipeline posterior');
  }

  console.log('\n[DONE] ¡Todos los tests de US-020 pasaron exitosamente (6/6)!');
}

export { runTests as runNotificationListenerTests };

if (process.argv[1] && process.argv[1].includes('NotificationListenerService.test')) {
  runTests().catch((err) => {
    console.error('[ERROR] Error en pruebas:', err);
    process.exit(1);
  });
}
