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
assert.rejects = async (fn: () => Promise<unknown>, errorRegex: RegExp, msg?: string) => {
  try {
    await fn();
    throw new Error(msg || 'Expected promise to reject');
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (!errorRegex.test(errorMsg)) {
      throw new Error(`Expected error matching ${errorRegex} but got: ${errorMsg}`);
    }
  }
};

import { GmailFinancialAdapter, decodeBase64Url } from '../../src/infrastructure/adapters/GmailFinancialAdapter';
import { FinancialSourceAdapterRegistry } from '../../src/domain/services/FinancialSourceAdapterRegistry';
import { MockGmailClient } from '../../src/infrastructure/services/gmail/MockGmailClient';
import { GmailIngestionService } from '../../src/domain/services/ingestion/GmailIngestionService';
import { InMemoryRawEventRepository } from '../../src/infrastructure/database/InMemoryRawEventRepository';
import type { GmailMessageInput } from '../../src/domain/models/Gmail';

function encodeBase64Url(str: string): string {
  const maybeBuffer = (globalThis as unknown as {
    Buffer?: { from(data: string, enc: string): { toString(enc: string): string } };
  }).Buffer;

  if (maybeBuffer && typeof maybeBuffer.from === 'function') {
    return maybeBuffer.from(str, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function runTests() {
  console.log('[TEST] Iniciando pruebas de US-033: Gmail Adapter...\n');

  // TEST 1: Conexión y autorización válida de Gmail
  {
    console.log('[TEST 1] Conexión y autorización válida con GmailCredentials (AC)');
    const client = new MockGmailClient();
    const repo = new InMemoryRawEventRepository();
    const service = new GmailIngestionService({ client, repository: repo });

    const authState = await service.authorize({
      accessToken: 'ya29.mock-google-access-token-12345',
      refreshToken: '1//mock-refresh-token',
      emailAddress: 'diego@finvolt.app',
      expiresIn: 3600,
    });

    assert.strictEqual(authState.isAuthorized, true, 'Debe marcar sesión como autorizada');
    assert.strictEqual(authState.emailAddress, 'diego@finvolt.app');
    assert.ok(authState.expiresAt instanceof Date, 'Debe contener fecha de expiración');
    assert.strictEqual(await service.isAuthenticated(), true, 'service.isAuthenticated() debe retornar true');

    const profile = await client.getProfile();
    assert.strictEqual(profile.emailAddress, 'diego@finvolt.app');
    console.log('  [OK] Conexión y autorización OAuth validadas');
  }

  // TEST 2: Rechazo ante credenciales vacías o sesión no autorizada
  {
    console.log('[TEST 2] Rechazo ante credenciales inválidas o no autorizadas (AC)');
    const client = new MockGmailClient([], false);
    const repo = new InMemoryRawEventRepository();
    const service = new GmailIngestionService({ client, repository: repo });

    await assert.rejects(
      async () => {
        await service.authorize({ accessToken: '   ' });
      },
      /El token de acceso de Google es obligatorio/,
      'Debe rechazar token vacío',
    );

    assert.strictEqual(await service.isAuthenticated(), false);

    // Sincronización sin autorización no debe lanzar error no controlado, sino retornar error estructurado
    const syncResult = await service.syncFinancialEmails();
    assert.strictEqual(syncResult.success, false);
    assert.strictEqual(syncResult.savedCount, 0);
    assert.strictEqual(syncResult.errors[0]?.messageId, 'AUTH');
    console.log('  [OK] Rechazo y validación de seguridad de autorización verificados');
  }

  // TEST 3: Desconexión y revocación de sesión
  {
    console.log('[TEST 3] Desconexión y revocación de sesión activa');
    const client = new MockGmailClient([], true);
    const repo = new InMemoryRawEventRepository();
    const service = new GmailIngestionService({ client, repository: repo });

    assert.strictEqual(await service.isAuthenticated(), true);
    await service.disconnect();
    assert.strictEqual(await service.isAuthenticated(), false);

    await assert.rejects(
      async () => {
        await service.detectFinancialEmails();
      },
      /No autorizado: se requiere conectar la cuenta de Gmail/,
    );
    console.log('  [OK] Desconexión y limpieza de tokens completada');
  }

  // TEST 4: Detección inteligente de correos financieros mediante consultas bancarias
  {
    console.log('[TEST 4] Detección de correos financieros con consultas inteligentes (AC)');
    const client = new MockGmailClient([], true);
    const repo = new InMemoryRawEventRepository();
    const service = new GmailIngestionService({ client, repository: repo });

    client.addMessage({
      id: 'msg-bbva-01',
      from: 'alertas@bbva.com.mx',
      subject: 'BBVA: Compra autorizada por $450.00 en Liverpool',
      snippet: 'Tu tarjeta BBVA *1234 registró una compra autorizada.',
      internalDate: String(Date.now()),
    });

    client.addMessage({
      id: 'msg-santander-02',
      from: 'notificaciones@santander.com.mx',
      subject: 'Santander: Transferencia SPEI recibida por $1,200.00',
      snippet: 'Has recibido un abono vía SPEI de Juan Pérez.',
      internalDate: String(Date.now()),
    });

    client.addMessage({
      id: 'msg-mercadopago-03',
      from: 'info@mercadopago.com',
      subject: 'Mercado Pago: Pago realizado con éxito',
      snippet: 'Pagaste $89.00 en Uber con tu saldo de Mercado Pago.',
      internalDate: String(Date.now()),
    });

    client.addMessage({
      id: 'msg-newsletter-04',
      from: 'noticias@cinepolis.com',
      subject: 'Estrenos imperdibles de este fin de semana',
      snippet: 'Ven a ver la nueva cartelera y disfruta de tus palomitas.',
      internalDate: String(Date.now()),
    });

    const detected = await service.detectFinancialEmails();
    assert.strictEqual(detected.length, 3, 'Debe detectar exactamente los 3 correos financieros');
    const detectedIds = detected.map((m) => m.id);
    assert.ok(detectedIds.includes('msg-bbva-01'));
    assert.ok(detectedIds.includes('msg-santander-02'));
    assert.ok(detectedIds.includes('msg-mercadopago-03'));
    assert.ok(!detectedIds.includes('msg-newsletter-04'), 'No debe incluir boletines de cine');
    console.log('  [OK] Detección de correos bancarios y exclusión de no-financieros validada');
  }

  // TEST 5: Filtrado temporal por fecha (sinceDate)
  {
    console.log('[TEST 5] Filtrado temporal con sinceDate');
    const client = new MockGmailClient([], true);
    const repo = new InMemoryRawEventRepository();
    const service = new GmailIngestionService({ client, repository: repo });

    const now = Date.now();
    const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(now - 5 * 24 * 60 * 60 * 1000);

    client.addMessage({
      id: 'msg-old-banorte',
      from: 'notificaciones@banorte.com',
      subject: 'Cargo por $300.00',
      internalDate: String(fiveDaysAgo.getTime()),
    });

    client.addMessage({
      id: 'msg-recent-banorte',
      from: 'notificaciones@banorte.com',
      subject: 'Cargo por $550.00',
      internalDate: String(now),
    });

    const detected = await service.detectFinancialEmails({ sinceDate: twoDaysAgo });
    assert.strictEqual(detected.length, 1);
    assert.strictEqual(detected[0]?.id, 'msg-recent-banorte');
    console.log('  [OK] Filtrado cronológico incremental verificado');
  }

  // TEST 6: Adaptador desacoplado mediante FinancialSourceAdapter
  {
    console.log('[TEST 6] Adaptador desacoplado mediante FinancialSourceAdapter (AC)');
    const adapter = new GmailFinancialAdapter();

    assert.strictEqual(adapter.source, 'EMAIL');
    assert.strictEqual(adapter.name, 'Gmail Financial Adapter');

    const validGmailMsg: GmailMessageInput = {
      id: 'msg-gmail-abc-999',
      threadId: 'thread-123',
      labelIds: ['INBOX', 'UNREAD'],
      from: 'banco@nu.com.mx',
      subject: 'Compra con Nu por $210.00',
      snippet: 'Compra aprobada en Farmacias Guadalajara',
      internalDate: '1697000000000',
    };

    assert.strictEqual(adapter.canHandle(validGmailMsg), true);
    assert.strictEqual(adapter.canHandle({ notAGmailMsg: true }), false);
    assert.strictEqual(adapter.canHandle(null), false);

    const validation = adapter.validate(validGmailMsg);
    assert.strictEqual(validation.isValid, true);

    const adapted = await adapter.adapt(validGmailMsg);
    assert.strictEqual(adapted.source, 'EMAIL');
    assert.strictEqual(adapted.sourceId, 'msg-gmail-abc-999');
    assert.strictEqual(adapted.metadata?.provider, 'GMAIL');
    assert.strictEqual(adapted.metadata?.from, 'banco@nu.com.mx');
    assert.strictEqual(adapted.payload.threadId, 'thread-123');
    assert.strictEqual(adapted.receivedAt?.getTime(), 1697000000000);
    console.log('  [OK] Contrato FinancialSourceAdapter respetado rigurosamente');
  }

  // TEST 7: Decodificación de mensajes multipart y base64url de Gmail API
  {
    console.log('[TEST 7] Decodificación de mensajes multipart y base64url de Gmail API');
    const adapter = new GmailFinancialAdapter();

    const plainTextBody = 'Hola Diego, tu transferencia por $3,500.00 a BBVA fue completada exitosamente.';
    const htmlBody = '<div><p>Hola Diego,</p><p>Transferencia por <b>$3,500.00</b> completada.</p></div>';

    const rawGmailApiMessage: GmailMessageInput = {
      id: 'msg-raw-api-multipart-01',
      threadId: 'th-multipart-01',
      snippet: 'Transferencia por $3,500.00 completada.',
      internalDate: String(Date.now()),
      payload: {
        mimeType: 'multipart/alternative',
        headers: [
          { name: 'From', value: 'SPEI Notificaciones <spei@stp.com.mx>' },
          { name: 'To', value: 'diego@finvolt.app' },
          { name: 'Subject', value: 'Comprobante de Transferencia SPEI' },
          { name: 'Date', value: 'Mon, 12 Oct 2026 15:30:00 -0600' },
        ],
        parts: [
          {
            mimeType: 'text/plain; charset=UTF-8',
            body: {
              data: encodeBase64Url(plainTextBody),
            },
          },
          {
            mimeType: 'text/html; charset=UTF-8',
            body: {
              data: encodeBase64Url(htmlBody),
            },
          },
        ],
      },
    };

    const adapted = await adapter.adapt(rawGmailApiMessage);
    assert.strictEqual(adapted.sourceId, 'msg-raw-api-multipart-01');
    assert.strictEqual(adapted.metadata?.from, 'SPEI Notificaciones <spei@stp.com.mx>');
    assert.strictEqual(adapted.metadata?.subject, 'Comprobante de Transferencia SPEI');
    assert.strictEqual(adapted.payload.bodyText, plainTextBody);
    assert.strictEqual(adapted.payload.bodyHtml, htmlBody);
    assert.strictEqual(adapted.rawText, plainTextBody);
    assert.strictEqual(adapted.metadata?.hasHtml, true);

    // Comprueba decodificación de caracteres especiales
    assert.strictEqual(decodeBase64Url(encodeBase64Url('FinVolt $1,250.00 MXN')), 'FinVolt $1,250.00 MXN');
    console.log('  [OK] Deserialización de payloads multipart y decodificación base64url verificada');
  }

  // TEST 8: Creación de RawEvent en persistencia (AC)
  {
    console.log('[TEST 8] Creación exitosa de RawEvent con payload intacto e inmutable (AC)');
    const repo = new InMemoryRawEventRepository();
    const client = new MockGmailClient([], true);
    const service = new GmailIngestionService({ client, repository: repo });

    client.addMessage({
      id: 'msg-amex-card-01',
      from: 'alertas@americanexpress.com.mx',
      subject: 'American Express: Aprobación de cargo por $890.00',
      snippet: 'Aprobamos tu cargo en Amazon México.',
      internalDate: String(Date.now()),
      labelIds: ['INBOX', 'FINANCIAL'],
    });

    const result = await service.syncFinancialEmails();
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.savedCount, 1);
    assert.strictEqual(result.duplicatesCount, 0);
    assert.strictEqual(result.failedCount, 0);

    const savedEvent = result.events[0];
    assert.ok(savedEvent, 'Debe existir un evento crudo generado');
    assert.strictEqual(savedEvent?.source, 'EMAIL');
    assert.strictEqual(savedEvent?.sourceId, 'msg-amex-card-01');
    assert.strictEqual(savedEvent?.status, 'PENDING');
    assert.strictEqual(savedEvent?.metadata.provider, 'GMAIL');
    assert.strictEqual(savedEvent?.payload.id, 'msg-amex-card-01');

    // Comprueba que está accesible desde el repositorio
    const retrieved = await repo.findBySourceId('EMAIL', 'msg-amex-card-01');
    assert.ok(retrieved);
    assert.strictEqual(retrieved?.id, savedEvent?.id);
    console.log('  [OK] RawEvent creado y persistido con status PENDING');
  }

  // TEST 9: Invariante arquitectónica estricta: NO crea transacciones directas
  {
    console.log('[TEST 9] Invariante arquitectónica estricta: NO se alteran ni crean Transactions (AC)');
    const repo = new InMemoryRawEventRepository();
    const client = new MockGmailClient([], true);
    const service = new GmailIngestionService({ client, repository: repo });

    client.addMessage({
      id: 'msg-strict-arch-01',
      from: 'alertas@banamex.com',
      subject: 'Banamex: Retiro de cajero automático por $2,000.00',
      internalDate: String(Date.now()),
    });

    const result = await service.syncFinancialEmails();
    assert.strictEqual(result.savedCount, 1);

    // Solo se generan RawEvents; ningún modelo Transaction fue llamado o inyectado
    const events = await repo.getPendingEvents();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0]?.source, 'EMAIL');
    console.log('  [OK] Invariante respetada: cero escritura directa en modelo de transacción');
  }

  // TEST 10: Deduplicación automática por sourceId
  {
    console.log('[TEST 10] Deduplicación automática ante re-ejecución de sincronización');
    const repo = new InMemoryRawEventRepository();
    const client = new MockGmailClient([], true);
    const service = new GmailIngestionService({ client, repository: repo });

    client.addMessage({
      id: 'msg-recurrent-01',
      from: 'alertas@bbva.com',
      subject: 'Pago de servicio por $500.00',
      internalDate: String(Date.now()),
    });

    // Primera sincronización
    const firstSync = await service.syncFinancialEmails();
    assert.strictEqual(firstSync.savedCount, 1);
    assert.strictEqual(firstSync.duplicatesCount, 0);

    // Segunda sincronización con los mismos correos
    const secondSync = await service.syncFinancialEmails();
    assert.strictEqual(secondSync.savedCount, 0);
    assert.strictEqual(secondSync.duplicatesCount, 1);
    assert.strictEqual(secondSync.totalDetected, 1);

    // El repositorio solo debe tener 1 único evento
    const allEvents = repo.getAllEvents();
    assert.strictEqual(allEvents.length, 1);
    console.log('  [OK] Deduplicación idempotente confirmada');
  }

  // TEST 11: Manejo robusto de errores individuales en lote
  {
    console.log('[TEST 11] Manejo robusto de errores individuales en lote');
    const repo = new InMemoryRawEventRepository();
    const client = new MockGmailClient([], true);
    const service = new GmailIngestionService({ client, repository: repo });

    // Mensaje 1: Válido
    client.addMessage({
      id: 'msg-valid-01',
      from: 'alertas@hey.banco',
      subject: 'Hey: Compra por $100.00',
      internalDate: String(Date.now()),
    });

    // Mensaje 2: Inválido (sin remitente, sin asunto, sin contenido)
    client.addMessage({
      id: 'msg-invalid-corrupt',
      from: '',
      subject: '',
      snippet: '',
      internalDate: String(Date.now()),
    });

    const result = await service.syncFinancialEmails({ onlyFinancial: false });
    assert.strictEqual(result.savedCount, 1, 'Debe guardar el mensaje válido');
    assert.strictEqual(result.failedCount, 1, 'Debe registrar 1 fallo para el mensaje corrupto');
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0]?.messageId, 'msg-invalid-corrupt');
    console.log('  [OK] Tolerancia a fallos parciales validada');
  }

  // TEST 12: Integración con FinancialSourceAdapterRegistry
  {
    console.log('[TEST 12] Integración con FinancialSourceAdapterRegistry');
    const registry = new FinancialSourceAdapterRegistry();
    const gmailAdapter = new GmailFinancialAdapter();

    registry.register(gmailAdapter);
    assert.strictEqual(registry.get('EMAIL'), gmailAdapter);

    const rawGmailInput = {
      id: 'registry-gmail-test-1',
      provider: 'GMAIL',
      from: 'spei@banco.com',
      subject: 'SPEI Recibido',
      snippet: 'Has recibido $700.00',
    };

    const resolved = registry.findAdapterForInput(rawGmailInput);
    assert.strictEqual(resolved, gmailAdapter);

    const adapted = await registry.adapt(rawGmailInput);
    assert.strictEqual(adapted.source, 'EMAIL');
    assert.strictEqual(adapted.sourceId, 'registry-gmail-test-1');
    console.log('  [OK] Integración dinámica con FinancialSourceAdapterRegistry validada');
  }

  console.log('\n[DONE] ¡Todos los tests de US-033 pasaron exitosamente (12/12)!');
}

export { runTests as runGmailAdapterTests };

if (process.argv[1] && process.argv[1].includes('GmailAdapter.test')) {
  runTests().catch((err) => {
    console.error('[ERROR] Error en pruebas de US-033:', err);
    process.exit(1);
  });
}
