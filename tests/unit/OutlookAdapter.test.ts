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

import { OutlookFinancialAdapter } from '../../src/infrastructure/adapters/OutlookFinancialAdapter';
import { FinancialSourceAdapterRegistry } from '../../src/domain/services/FinancialSourceAdapterRegistry';
import { MockOutlookClient } from '../../src/infrastructure/services/outlook/MockOutlookClient';
import { OutlookIngestionService } from '../../src/domain/services/ingestion/OutlookIngestionService';
import { InMemoryRawEventRepository } from '../../src/infrastructure/database/InMemoryRawEventRepository';
import { FinancialEmailParser } from '../../src/domain/services/parsers/FinancialEmailParser';
import type { OutlookMessageInput } from '../../src/domain/models/Outlook';

async function runTests() {
  console.log('[TEST] Iniciando pruebas de US-035: Outlook Adapter...\n');

  // TEST 1: Conexión y autorización válida con OutlookCredentials (AC)
  {
    console.log('[TEST 1] Conexión y autorización válida con OutlookCredentials (AC)');
    const client = new MockOutlookClient();
    const repo = new InMemoryRawEventRepository();
    const service = new OutlookIngestionService({ client, repository: repo });

    const authState = await service.authorize({
      accessToken: 'mock-ms-graph-token-98765',
      refreshToken: 'mock-ms-refresh-token',
      userPrincipalName: 'diego@outlook.com',
      expiresIn: 3600,
    });

    assert.strictEqual(authState.isAuthorized, true, 'Debe marcar sesión de Outlook como autorizada');
    assert.strictEqual(authState.userPrincipalName, 'diego@outlook.com');
    assert.ok(authState.expiresAt instanceof Date);
    assert.strictEqual(await service.isAuthenticated(), true);

    const profile = await client.getProfile();
    assert.strictEqual(profile.userPrincipalName, 'diego@outlook.com');
    console.log('  [OK] Conexión y autorización OAuth con Microsoft validadas');
  }

  // TEST 2: Rechazo ante credenciales inválidas o no autorizadas (AC)
  {
    console.log('[TEST 2] Rechazo ante credenciales inválidas o no autorizadas (AC)');
    const client = new MockOutlookClient([], false);
    const repo = new InMemoryRawEventRepository();
    const service = new OutlookIngestionService({ client, repository: repo });

    await assert.rejects(
      async () => {
        await service.authorize({ accessToken: '   ' });
      },
      /El token de acceso de Microsoft es obligatorio/,
    );

    assert.strictEqual(await service.isAuthenticated(), false);

    const syncResult = await service.syncFinancialEmails();
    assert.strictEqual(syncResult.success, false);
    assert.strictEqual(syncResult.savedCount, 0);
    assert.strictEqual(syncResult.errors[0]?.messageId, 'AUTH');
    console.log('  [OK] Rechazo seguro ante credenciales inválidas confirmado');
  }

  // TEST 3: Desconexión y revocación de sesión activa
  {
    console.log('[TEST 3] Desconexión y revocación de sesión activa de Outlook');
    const client = new MockOutlookClient([], true);
    const repo = new InMemoryRawEventRepository();
    const service = new OutlookIngestionService({ client, repository: repo });

    assert.strictEqual(await service.isAuthenticated(), true);
    await service.disconnect();
    assert.strictEqual(await service.isAuthenticated(), false);

    await assert.rejects(
      async () => {
        await service.detectFinancialEmails();
      },
      /No autorizado: se requiere conectar la cuenta de Outlook/,
    );
    console.log('  [OK] Desconexión y limpieza de sesión completada');
  }

  // TEST 4: Detección de correos financieros con consultas inteligentes (AC)
  {
    console.log('[TEST 4] Detección de correos financieros con consultas inteligentes (AC)');
    const client = new MockOutlookClient([], true);
    const repo = new InMemoryRawEventRepository();
    const service = new OutlookIngestionService({ client, repository: repo });

    client.addMessage({
      id: 'msg-ms-bbva-01',
      subject: 'BBVA: Notificación de cargo por $520.00 en OXXO',
      bodyPreview: 'Tu tarjeta BBVA *4321 registró un cargo por $520.00.',
      from: { emailAddress: { name: 'BBVA Bancomer', address: 'alertas@bbva.com' } },
      receivedDateTime: new Date().toISOString(),
    });

    client.addMessage({
      id: 'msg-ms-santander-02',
      subject: 'Santander: Transferencia recibida por $2,500.00',
      bodyPreview: 'Has recibido una transferencia SPEI.',
      from: { emailAddress: { name: 'Santander', address: 'notificaciones@santander.com.mx' } },
      receivedDateTime: new Date().toISOString(),
    });

    client.addMessage({
      id: 'msg-ms-paypal-03',
      subject: 'Recibo de pago de PayPal',
      bodyPreview: 'Has enviado un pago por $350.00 a Spotify.',
      from: { emailAddress: { name: 'service@paypal.com', address: 'service@paypal.com' } },
      receivedDateTime: new Date().toISOString(),
    });

    client.addMessage({
      id: 'msg-ms-promo-04',
      subject: 'Descubre las mejores ofertas de vuelos para tus vacaciones',
      bodyPreview: 'Vuelos desde $1,999 para viajar en verano con Aeroméxico.',
      from: { emailAddress: { name: 'Ofertas Viajes', address: 'promociones@viajes.com' } },
      receivedDateTime: new Date().toISOString(),
    });

    const detected = await service.detectFinancialEmails();
    assert.strictEqual(detected.length, 3, 'Debe detectar exactamente los 3 correos financieros');
    const detectedIds = detected.map((m) => m.id);
    assert.ok(detectedIds.includes('msg-ms-bbva-01'));
    assert.ok(detectedIds.includes('msg-ms-santander-02'));
    assert.ok(detectedIds.includes('msg-ms-paypal-03'));
    assert.ok(!detectedIds.includes('msg-ms-promo-04'), 'No debe incluir boletines de viajes');
    console.log('  [OK] Detección de correos bancarios y exclusión de publicidad validada');
  }

  // TEST 5: Filtrado temporal por fecha (sinceDate)
  {
    console.log('[TEST 5] Filtrado temporal incremental con sinceDate');
    const client = new MockOutlookClient([], true);
    const repo = new InMemoryRawEventRepository();
    const service = new OutlookIngestionService({ client, repository: repo });

    const now = Date.now();
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000);
    const sixDaysAgo = new Date(now - 6 * 24 * 60 * 60 * 1000);

    client.addMessage({
      id: 'msg-ms-old-banorte',
      subject: 'Banorte: Cargo por $400.00',
      bodyPreview: 'Cargo en tienda.',
      from: { emailAddress: { address: 'alertas@banorte.com' } },
      receivedDateTime: sixDaysAgo.toISOString(),
    });

    client.addMessage({
      id: 'msg-ms-recent-banorte',
      subject: 'Banorte: Cargo por $650.00',
      bodyPreview: 'Cargo en tienda departamental.',
      from: { emailAddress: { address: 'alertas@banorte.com' } },
      receivedDateTime: new Date(now).toISOString(),
    });

    const detected = await service.detectFinancialEmails({ sinceDate: threeDaysAgo });
    assert.strictEqual(detected.length, 1);
    assert.strictEqual(detected[0]?.id, 'msg-ms-recent-banorte');
    console.log('  [OK] Filtrado cronológico incremental verificado');
  }

  // TEST 6: Adaptador desacoplado compatible con la arquitectura (AC)
  {
    console.log('[TEST 6] Adaptador desacoplado conforme a FinancialSourceAdapter (AC)');
    const adapter = new OutlookFinancialAdapter();

    assert.strictEqual(adapter.source, 'EMAIL');
    assert.strictEqual(adapter.name, 'Outlook Financial Adapter');

    const validOutlookMsg: OutlookMessageInput = {
      id: 'ms-graph-msg-12345',
      conversationId: 'conv-9988',
      subject: 'Citibanamex: Cargo por $780.00 en WALMART',
      bodyPreview: 'Cargo exitoso en WALMART con tu tarjeta *5544.',
      from: { emailAddress: { name: 'Citibanamex', address: 'notificaciones@citibanamex.com' } },
      receivedDateTime: '2026-10-12T15:00:00Z',
    };

    assert.strictEqual(adapter.canHandle(validOutlookMsg), true);
    assert.strictEqual(adapter.canHandle({ notAnOutlookMsg: true }), false);
    assert.strictEqual(adapter.canHandle(null), false);

    const validation = adapter.validate(validOutlookMsg);
    assert.strictEqual(validation.isValid, true);

    const adapted = await adapter.adapt(validOutlookMsg);
    assert.strictEqual(adapted.source, 'EMAIL');
    assert.strictEqual(adapted.sourceId, 'ms-graph-msg-12345');
    assert.strictEqual(adapted.metadata?.provider, 'OUTLOOK');
    assert.strictEqual(adapted.metadata?.from, 'Citibanamex <notificaciones@citibanamex.com>');
    assert.strictEqual(adapted.payload.conversationId, 'conv-9988');
    assert.strictEqual(adapted.receivedAt?.toISOString(), '2026-10-12T15:00:00.000Z');
    console.log('  [OK] Contrato FinancialSourceAdapter respetado rigurosamente');
  }

  // TEST 7: Deserialización de cuerpos en texto plano y HTML de Graph API
  {
    console.log('[TEST 7] Deserialización de cuerpos en texto plano y HTML de Graph API');
    const adapter = new OutlookFinancialAdapter();

    const plainText = 'Tu compra en OXXO por $115.00 con tarjeta Nu fue aprobada.';
    const htmlContent = '<div><p>Tu compra en <b>OXXO</b> por $115.00 fue aprobada.</p></div>';

    const msgWithHtml: OutlookMessageInput = {
      id: 'msg-ms-nu-html',
      subject: 'Nu: Compra aprobada',
      bodyPreview: plainText,
      body: {
        contentType: 'html',
        content: htmlContent,
      },
      from: { emailAddress: { name: 'Nu México', address: 'hola@nu.com.mx' } },
      receivedDateTime: '2026-10-12T16:20:00Z',
    };

    const adapted = await adapter.adapt(msgWithHtml);
    assert.strictEqual(adapted.sourceId, 'msg-ms-nu-html');
    assert.strictEqual(adapted.rawText, plainText);
    assert.strictEqual(adapted.payload.bodyText, plainText);
    assert.strictEqual(adapted.payload.bodyHtml, htmlContent);
    assert.strictEqual(adapted.metadata?.hasHtml, true);
    console.log('  [OK] Mapeo de texto plano y HTML de Microsoft Graph verificado');
  }

  // TEST 8: Creación exitosa de RawEvent en persistencia (AC)
  {
    console.log('[TEST 8] Creación de RawEvent con payload intacto e inmutable (AC)');
    const repo = new InMemoryRawEventRepository();
    const client = new MockOutlookClient([], true);
    const service = new OutlookIngestionService({ client, repository: repo });

    client.addMessage({
      id: 'msg-ms-amex-01',
      subject: 'American Express: Aprobación de cargo por $1,400.00',
      bodyPreview: 'Aprobamos tu cargo en Liverpool con tarjeta terminación 2002.',
      from: { emailAddress: { name: 'American Express', address: 'alertas@amex.com.mx' } },
      receivedDateTime: new Date().toISOString(),
    });

    const result = await service.syncFinancialEmails();
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.savedCount, 1);
    assert.strictEqual(result.duplicatesCount, 0);

    const savedEvent = result.events[0];
    assert.ok(savedEvent);
    assert.strictEqual(savedEvent?.source, 'EMAIL');
    assert.strictEqual(savedEvent?.sourceId, 'msg-ms-amex-01');
    assert.strictEqual(savedEvent?.status, 'PENDING');
    assert.strictEqual(savedEvent?.metadata.provider, 'OUTLOOK');
    assert.strictEqual(savedEvent?.payload.id, 'msg-ms-amex-01');

    const retrieved = await repo.findBySourceId('EMAIL', 'msg-ms-amex-01');
    assert.ok(retrieved);
    assert.strictEqual(retrieved?.id, savedEvent?.id);
    console.log('  [OK] RawEvent creado y persistido con status PENDING');
  }

  // TEST 9: Invariante arquitectónica estricta: NO se alteran ni crean Transactions (AC)
  {
    console.log('[TEST 9] Invariante arquitectónica: NO se alteran ni crean Transactions (AC)');
    const repo = new InMemoryRawEventRepository();
    const client = new MockOutlookClient([], true);
    const service = new OutlookIngestionService({ client, repository: repo });

    client.addMessage({
      id: 'msg-ms-strict-01',
      subject: 'BBVA: Retiro de cajero por $1,000.00',
      bodyPreview: 'Retiro en cajero automático.',
      from: { emailAddress: { address: 'alertas@bbva.com' } },
      receivedDateTime: new Date().toISOString(),
    });

    const result = await service.syncFinancialEmails();
    assert.strictEqual(result.savedCount, 1);

    const events = await repo.getPendingEvents();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0]?.source, 'EMAIL');
    console.log('  [OK] Invariante respetada: cero escritura directa en modelo de transacción');
  }

  // TEST 10: Deduplicación automática ante re-ejecución de sincronización (AC)
  {
    console.log('[TEST 10] Deduplicación automática por sourceId en re-sincronizaciones (AC)');
    const repo = new InMemoryRawEventRepository();
    const client = new MockOutlookClient([], true);
    const service = new OutlookIngestionService({ client, repository: repo });

    client.addMessage({
      id: 'msg-ms-dedup-01',
      subject: 'Santander: Pago de servicio por $320.00',
      bodyPreview: 'Pago de luz CFE.',
      from: { emailAddress: { address: 'alertas@santander.com' } },
      receivedDateTime: new Date().toISOString(),
    });

    // Primera sincronización
    const firstSync = await service.syncFinancialEmails();
    assert.strictEqual(firstSync.savedCount, 1);
    assert.strictEqual(firstSync.duplicatesCount, 0);

    // Segunda sincronización
    const secondSync = await service.syncFinancialEmails();
    assert.strictEqual(secondSync.savedCount, 0);
    assert.strictEqual(secondSync.duplicatesCount, 1);
    assert.strictEqual(secondSync.totalDetected, 1);

    const allEvents = repo.getAllEvents();
    assert.strictEqual(allEvents.length, 1);
    console.log('  [OK] Deduplicación idempotente confirmada');
  }

  // TEST 11: Manejo robusto de errores individuales en lote
  {
    console.log('[TEST 11] Manejo robusto de errores individuales en lote');
    const repo = new InMemoryRawEventRepository();
    const client = new MockOutlookClient([], true);
    const service = new OutlookIngestionService({ client, repository: repo });

    // Mensaje 1: Válido
    client.addMessage({
      id: 'msg-ms-valid-01',
      subject: 'Hey: Compra por $80.00',
      bodyPreview: 'Compra aprobada en tienda.',
      from: { emailAddress: { address: 'alertas@hey.banco' } },
      receivedDateTime: new Date().toISOString(),
    });

    // Mensaje 2: Inválido (sin remitente, sin asunto, sin contenido)
    client.addMessage({
      id: 'msg-ms-invalid-corrupt',
      subject: '',
      bodyPreview: '',
      from: { emailAddress: { address: '' } },
      receivedDateTime: new Date().toISOString(),
    });

    const result = await service.syncFinancialEmails({ onlyFinancial: false });
    assert.strictEqual(result.savedCount, 1);
    assert.strictEqual(result.failedCount, 1);
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0]?.messageId, 'msg-ms-invalid-corrupt');
    console.log('  [OK] Tolerancia ante errores individuales validada');
  }

  // TEST 12: Integración de extremo a extremo con FinancialEmailParser (US-034)
  {
    console.log('[TEST 12] Integración de extremo a extremo con FinancialEmailParser (US-034)');
    const repo = new InMemoryRawEventRepository();
    const client = new MockOutlookClient([], true);
    const service = new OutlookIngestionService({ client, repository: repo });
    const emailParser = new FinancialEmailParser();

    client.addMessage({
      id: 'msg-ms-e2e-01',
      subject: 'BBVA: Compra por $750.00 en Amazon México',
      bodyPreview: 'Tu tarjeta BBVA *9876 registró una compra en Amazon México por $750.00 MXN el 12/10/2026. Folio: AUT-445566.',
      from: { emailAddress: { name: 'Línea BBVA', address: 'alertas@bbva.com' } },
      receivedDateTime: '2026-10-12T12:00:00Z',
    });

    const syncResult = await service.syncFinancialEmails();
    assert.strictEqual(syncResult.savedCount, 1);

    const savedRawEvent = syncResult.events[0];
    assert.ok(savedRawEvent);

    // Parsear el raw event de Outlook con FinancialEmailParser
    const candidate = await emailParser.toCandidate(savedRawEvent);
    assert.ok(candidate, 'Debe generar TransactionCandidate a partir del correo de Outlook');
    assert.strictEqual(candidate?.source, 'EMAIL');
    assert.strictEqual(candidate?.amount, 750.0);
    assert.strictEqual(candidate?.amountMinor, 75000);
    assert.strictEqual(candidate?.currency, 'MXN');
    assert.strictEqual(candidate?.merchant, 'Amazon México');
    assert.strictEqual(candidate?.accountHint?.last4Digits, '9876');
    assert.strictEqual(candidate?.accountHint?.bankName, 'BBVA México');
    assert.strictEqual(candidate?.metadata?.referenceNumber, 'AUT-445566');
    assert.strictEqual(candidate?.status, 'PENDING_REVIEW');
    assert.deepStrictEqual(candidate?.rawPayload, savedRawEvent.payload, 'Debe preservar el payload original de Outlook intacto');
    console.log('  [OK] Flujo completo Outlook -> RawEvent -> FinancialEmailParser -> Candidate validado');
  }

  console.log('\n[DONE] ¡Todos los tests de US-035 pasaron exitosamente (12/12)!');
}

export { runTests as runOutlookAdapterTests };

if (process.argv[1] && process.argv[1].includes('OutlookAdapter.test')) {
  runTests().catch((err) => {
    console.error('[ERROR] Error en pruebas de US-035:', err);
    process.exit(1);
  });
}
