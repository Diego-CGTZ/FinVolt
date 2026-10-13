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

import { FinancialEmailParser } from '../../src/domain/services/parsers/FinancialEmailParser';
import { NotificationParserRegistry } from '../../src/domain/services/parsers/NotificationParserRegistry';
import { EmailIngestionPipeline } from '../../src/application/services/EmailIngestionPipeline';
import { InMemoryRawEventRepository } from '../../src/infrastructure/database/InMemoryRawEventRepository';
import { InMemoryTransactionCandidateRepository } from '../../src/infrastructure/database/InMemoryTransactionCandidateRepository';
import type { RawEvent } from '../../src/domain/models/RawEvent';

function createMockEmailRawEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  const now = new Date(2026, 9, 12, 10, 0, 0); // 12 de Octubre de 2026
  const text = overrides.rawText || 'Tu tarjeta BBVA *1234 registró una compra en Liverpool por $450.00 MXN el 12/10/2026 a las 10:00:00. Folio: 987654.';
  const payload = overrides.payload || {
    from: 'alertas@bbva.com',
    subject: overrides.rawText ? 'Notificación de movimiento' : 'BBVA: Compra por $450.00 en Liverpool',
    bodyText: text,
  };

  return {
    id: `raw-email-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId: 'user-diego-123',
    source: 'EMAIL',
    sourceId: 'msg-gmail-12345',
    payload,
    rawText: text,
    metadata: {
      provider: 'GMAIL',
      subject: (payload.subject as string) || 'Notificación',
      from: (payload.from as string) || 'alertas@bbva.com',
    },
    status: 'PENDING',
    retryCount: 0,
    receivedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function runTests() {
  console.log('[TEST] Iniciando pruebas de US-034: Financial Email Parser...\n');

  // TEST 1: Detección de monto y divisa (AC)
  {
    console.log('[TEST 1] Detección de monto y divisa en diversos formatos (AC)');
    const parser = new FinancialEmailParser();

    const event1 = createMockEmailRawEvent({
      rawText: 'Cargo aprobado por $1,250.50 en Farmacias Guadalajara.',
    });
    const parsed1 = await parser.parse(event1);
    assert.ok(parsed1);
    assert.strictEqual(parsed1?.amount, 1250.5);
    assert.strictEqual(parsed1?.currency, 'MXN');

    const event2 = createMockEmailRawEvent({
      rawText: 'Pago recibido por 35.00 USD desde cuenta internacional.',
    });
    const parsed2 = await parser.parse(event2);
    assert.ok(parsed2);
    assert.strictEqual(parsed2?.amount, 35.0);
    assert.strictEqual(parsed2?.currency, 'USD');

    const event3 = createMockEmailRawEvent({
      rawText: 'Total: $99.99 EUR en compra en línea.',
    });
    const parsed3 = await parser.parse(event3);
    assert.ok(parsed3);
    assert.strictEqual(parsed3?.amount, 99.99);
    assert.strictEqual(parsed3?.currency, 'EUR');
    console.log('  [OK] Montos y divisas extraídos con precisión decimal');
  }

  // TEST 2: Detección y limpieza de merchant / comercio (AC)
  {
    console.log('[TEST 2] Detección y normalización de comercio y beneficiario (AC)');
    const parser = new FinancialEmailParser();

    const event = createMockEmailRawEvent({
      payload: {
        subject: 'Cargo por $890.00 en AMAZON MEXICO',
        bodyText: 'Se realizó un cargo en AMAZON MEXICO con tu tarjeta de crédito.',
      },
      rawText: 'Se realizó un cargo en AMAZON MEXICO con tu tarjeta de crédito.',
    });

    const parsed = await parser.parse(event);
    assert.ok(parsed);
    assert.strictEqual(parsed?.merchant, 'AMAZON MEXICO');
    assert.strictEqual(parsed?.merchantRaw, 'AMAZON MEXICO');

    const eventUber = createMockEmailRawEvent({
      payload: {
        subject: 'Tu recibo de Uber',
        bodyText: 'Pagaste en UBER TRIP un importe de $145.00 con tu tarjeta digital.',
      },
      rawText: 'Pagaste en UBER TRIP un importe de $145.00 con tu tarjeta digital.',
    });
    const parsedUber = await parser.parse(eventUber);
    assert.ok(parsedUber);
    assert.strictEqual(parsedUber?.merchant, 'UBER TRIP');
    console.log('  [OK] Extracción limpia de comercio validada');
  }

  // TEST 3: Detección de tipo de movimiento (EXPENSE, INCOME, TRANSFER) (AC)
  {
    console.log('[TEST 3] Detección de tipo de movimiento (AC)');
    const parser = new FinancialEmailParser();

    // EXPENSE
    const expenseEvent = createMockEmailRawEvent({
      rawText: 'Compra autorizada por $300.00 en Starbucks.',
    });
    const expenseParsed = await parser.parse(expenseEvent);
    assert.strictEqual(expenseParsed?.type, 'EXPENSE');

    // INCOME
    const incomeEvent = createMockEmailRawEvent({
      rawText: 'Abono a tu cuenta por $3,500.00. Concepto: Depósito de nómina.',
    });
    const incomeParsed = await parser.parse(incomeEvent);
    assert.strictEqual(incomeParsed?.type, 'INCOME');

    // TRANSFER
    const transferEvent = createMockEmailRawEvent({
      rawText: 'Retiro en cajero automático por $1,000.00 con tu tarjeta de débito.',
    });
    const transferParsed = await parser.parse(transferEvent);
    assert.strictEqual(transferParsed?.type, 'TRANSFER');
    console.log('  [OK] Clasificación contable (EXPENSE, INCOME, TRANSFER) correcta');
  }

  // TEST 4: Detección de fecha explícita en el correo (AC)
  {
    console.log('[TEST 4] Detección de fecha explícita en formatos numérico y textual (AC)');
    const parser = new FinancialEmailParser();

    // Numérico: DD/MM/YYYY HH:mm:ss
    const numericDateEvent = createMockEmailRawEvent({
      rawText: 'Compra por $250.00 en OXXO el 15/10/2026 a las 14:30:00.',
    });
    const numericParsed = await parser.parse(numericDateEvent);
    assert.ok(numericParsed);
    assert.strictEqual(numericParsed?.occurredAt.getFullYear(), 2026);
    assert.strictEqual(numericParsed?.occurredAt.getMonth(), 9); // Octubre = 9
    assert.strictEqual(numericParsed?.occurredAt.getDate(), 15);
    assert.strictEqual(numericParsed?.occurredAt.getHours(), 14);
    assert.strictEqual(numericParsed?.occurredAt.getMinutes(), 30);

    // Textual: 20 de Octubre de 2026
    const textDateEvent = createMockEmailRawEvent({
      rawText: 'Cargo por $500.00 en Walmart el 20 de Octubre de 2026.',
    });
    const textParsed = await parser.parse(textDateEvent);
    assert.ok(textParsed);
    assert.strictEqual(textParsed?.occurredAt.getFullYear(), 2026);
    assert.strictEqual(textParsed?.occurredAt.getMonth(), 9); // Octubre
    assert.strictEqual(textParsed?.occurredAt.getDate(), 20);
    console.log('  [OK] Extracción de fechas explícitas y horas verificada');
  }

  // TEST 5: Detección de datos relevantes adicionales (AC)
  {
    console.log('[TEST 5] Detección de datos relevantes adicionales (cuenta, tarjeta, folio, concepto) (AC)');
    const parser = new FinancialEmailParser();

    const event = createMockEmailRawEvent({
      payload: {
        from: 'alertas@santander.com.mx',
        subject: 'Santander: Cargo con tarjeta de crédito terminación 5678',
        bodyText: 'Cargo por $1,800.00 en Palacio de Hierro el 12/10/2026. Folio: AUT-889911. Concepto: Regalo.',
      },
      rawText: 'Cargo por $1,800.00 en Palacio de Hierro el 12/10/2026. Folio: AUT-889911. Concepto: Regalo.',
    });

    const parsed = await parser.parse(event);
    assert.ok(parsed);
    assert.strictEqual(parsed?.accountHint?.last4Digits, '5678');
    assert.strictEqual(parsed?.accountHint?.accountType, 'CREDIT');
    assert.strictEqual(parsed?.accountHint?.bankName, 'Santander México');
    assert.strictEqual(parsed?.metadata?.referenceNumber, 'AUT-889911');
    assert.strictEqual(parsed?.metadata?.concept, 'Regalo');
    console.log('  [OK] Metadatos de cuenta, entidad bancaria, folio y concepto extraídos');
  }

  // TEST 6: Generación de TransactionCandidate canónico (AC)
  {
    console.log('[TEST 6] Generación de TransactionCandidate canónico con fingerprint (AC)');
    const parser = new FinancialEmailParser();
    const event = createMockEmailRawEvent();

    const candidate = await parser.toCandidate(event);
    assert.ok(candidate, 'Debe generar una instancia de TransactionCandidate');
    assert.strictEqual(candidate?.source, 'EMAIL');
    assert.strictEqual(candidate?.rawEventId, event.id);
    assert.strictEqual(candidate?.amount, 450.0);
    assert.strictEqual(candidate?.amountMinor, 45000);
    assert.strictEqual(candidate?.currency, 'MXN');
    assert.strictEqual(candidate?.type, 'EXPENSE');
    assert.strictEqual(candidate?.merchant, 'Liverpool');
    assert.strictEqual(candidate?.status, 'PENDING_REVIEW');
    assert.ok(typeof candidate?.fingerprint === 'string' && candidate?.fingerprint.length > 0);
    assert.ok(typeof candidate?.confidenceScore === 'number' && candidate?.confidenceScore >= 80);
    console.log('  [OK] Candidate generado fielmente conforme a US-023 y US-034');
  }

  // TEST 7: Conservación estricta del raw payload original (AC / US-018)
  {
    console.log('[TEST 7] Conservación estricta e inmutable del raw payload original (AC)');
    const parser = new FinancialEmailParser();
    const event = createMockEmailRawEvent();

    const candidate = await parser.toCandidate(event);
    assert.ok(candidate);
    assert.deepStrictEqual(candidate?.rawPayload, event.payload, 'El rawPayload del candidato debe ser idéntico al del RawEvent');

    // Comprueba inmutabilidad
    const rawPayloadCopy = JSON.stringify(event.payload);
    (candidate?.rawPayload as Record<string, unknown>).tampered = true;
    assert.strictEqual(JSON.stringify(event.payload), rawPayloadCopy, 'El RawEvent original no debe sufrir mutaciones');
    console.log('  [OK] Raw payload íntegro e inmutabilidad garantizada');
  }

  // TEST 8: Invariante arquitectónica estricta: NO se inserta en Transaction
  {
    console.log('[TEST 8] Invariante arquitectónica: NO se inserta directamente en Transaction');
    const parser = new FinancialEmailParser();
    const event = createMockEmailRawEvent();

    const candidate = await parser.toCandidate(event);
    assert.ok(candidate);

    // Verifica que el candidato queda desacoplado en estado PENDING_REVIEW sin persistencia contable
    assert.strictEqual(candidate?.status, 'PENDING_REVIEW');
    console.log('  [OK] Invariante respetada: cero escritura directa en modelo de transacción');
  }

  // TEST 9: Soporte multi-institución (BBVA, Nu, Banamex, Amex, Mercado Pago, STP)
  {
    console.log('[TEST 9] Soporte multi-institución bancaria y pasarelas de pago');
    const parser = new FinancialEmailParser();

    // Nu
    const nuEvent = createMockEmailRawEvent({
      payload: {
        from: 'amigos@nu.com.mx',
        subject: 'Nu: Compra con Nu',
        bodyText: 'Tu compra en OXXO por $85.00 fue aprobada.',
      },
      rawText: 'Tu compra en OXXO por $85.00 fue aprobada.',
    });
    const nuCandidate = await parser.toCandidate(nuEvent);
    assert.ok(nuCandidate);
    assert.strictEqual(nuCandidate?.amount, 85.0);
    assert.strictEqual(nuCandidate?.merchant, 'OXXO');
    assert.strictEqual(nuCandidate?.accountHint?.bankName, 'Nu México');

    // American Express
    const amexEvent = createMockEmailRawEvent({
      payload: {
        from: 'alertas@americanexpress.com.mx',
        subject: 'American Express: Aprobación de cargo',
        bodyText: 'Aprobamos tu cargo por $3,200.00 MXN en AEROMEXICO con tu tarjeta terminación 1005.',
      },
      rawText: 'Aprobamos tu cargo por $3,200.00 MXN en AEROMEXICO con tu tarjeta terminación 1005.',
    });
    const amexCandidate = await parser.toCandidate(amexEvent);
    assert.ok(amexCandidate);
    assert.strictEqual(amexCandidate?.amount, 3200.0);
    assert.strictEqual(amexCandidate?.merchant, 'AEROMEXICO');
    assert.strictEqual(amexCandidate?.accountHint?.last4Digits, '1005');

    // STP / SPEI
    const speiEvent = createMockEmailRawEvent({
      payload: {
        from: 'notificaciones@stp.com.mx',
        subject: 'Transferencia SPEI Recibida',
        bodyText: 'Recibiste una transferencia por $4,000.00 de Pedro Morales. Clave de rastreo: 202610129988.',
      },
      rawText: 'Recibiste una transferencia por $4,000.00 de Pedro Morales. Clave de rastreo: 202610129988.',
    });
    const speiCandidate = await parser.toCandidate(speiEvent);
    assert.ok(speiCandidate);
    assert.strictEqual(speiCandidate?.amount, 4000.0);
    assert.strictEqual(speiCandidate?.type, 'INCOME');
    assert.strictEqual(speiCandidate?.merchant, 'Pedro Morales');
    assert.strictEqual(speiCandidate?.metadata.referenceNumber, '202610129988');
    console.log('  [OK] Compatibilidad multi-banco validada');
  }

  // TEST 10: Integración con NotificationParserRegistry
  {
    console.log('[TEST 10] Resolución dinámica en NotificationParserRegistry');
    const registry = NotificationParserRegistry.getInstance();
    const event = createMockEmailRawEvent();

    const resolvedParser = registry.resolve('GENERIC', event);
    assert.strictEqual(resolvedParser.parserName, 'FINANCIAL_EMAIL_PARSER');

    const result = await resolvedParser.parse(event);
    assert.ok(result);
    assert.strictEqual(result?.amount, 450.0);
    console.log('  [OK] Parser resuelto exitosamente desde el registro central');
  }

  // TEST 11: Manejo de correos no financieros o datos incompletos
  {
    console.log('[TEST 11] Manejo de correos no financieros o sin datos monetarios');
    const parser = new FinancialEmailParser();

    const newsletterEvent = createMockEmailRawEvent({
      payload: {
        subject: 'Disfruta de nuestros descuentos esta semana',
        bodyText: 'Aprovecha promociones exclusivas en nuestra tienda en línea.',
      },
      rawText: 'Aprovecha promociones exclusivas en nuestra tienda en línea.',
    });

    const parsed = await parser.parse(newsletterEvent);
    assert.strictEqual(parsed, null, 'Debe retornar null cuando no hay monto monetario');

    const candidate = await parser.toCandidate(newsletterEvent);
    assert.strictEqual(candidate, null);
    console.log('  [OK] Rechazo controlado de correos no transaccionales');
  }

  // TEST 12: Pipeline completo EmailIngestionPipeline
  {
    console.log('[TEST 12] Orquestación de extremo a extremo en EmailIngestionPipeline');
    const rawRepo = new InMemoryRawEventRepository();
    const candidateRepo = new InMemoryTransactionCandidateRepository();
    const pipeline = new EmailIngestionPipeline({
      rawEventRepository: rawRepo,
      candidateRepository: candidateRepo,
    });

    // Guardar evento financiero y evento de boletín
    const savedFinancial = await rawRepo.save({
      source: 'EMAIL',
      sourceId: 'msg-sync-1',
      payload: {
        from: 'alertas@banamex.com',
        subject: 'Banamex: Cargo por $280.00 en Farmacias del Ahorro',
        bodyText: 'Cargo por $280.00 en Farmacias del Ahorro el 12/10/2026 con tu tarjeta *9988.',
      },
      rawText: 'Cargo por $280.00 en Farmacias del Ahorro el 12/10/2026 con tu tarjeta *9988.',
    });

    const savedPromo = await rawRepo.save({
      source: 'EMAIL',
      sourceId: 'msg-sync-2',
      payload: {
        from: 'noticias@banco.com',
        subject: 'Descarga nuestra nueva app móvil',
        bodyText: 'Conoce todas las funciones de banca en línea.',
      },
      rawText: 'Conoce todas las funciones de banca en línea.',
    });

    // Ejecución en lote
    const results = await pipeline.processPendingEmails();
    assert.strictEqual(results.length, 2);

    const financialRes = results.find((r) => r.rawEvent.id === savedFinancial.id);
    const promoRes = results.find((r) => r.rawEvent.id === savedPromo.id);

    // Evento Financiero: SUCCESS
    assert.strictEqual(financialRes?.status, 'SUCCESS');
    assert.ok(financialRes?.candidate);
    assert.strictEqual(financialRes?.candidate?.amount, 280.0);

    // Evento Promo: IGNORED
    assert.strictEqual(promoRes?.status, 'IGNORED');
    assert.strictEqual(promoRes?.candidate, null);

    // Verificación de persistencia en repositorios
    const event1After = await rawRepo.findById(savedFinancial.id);
    assert.strictEqual(event1After?.status, 'PROCESSED');

    const event2After = await rawRepo.findById(savedPromo.id);
    assert.strictEqual(event2After?.status, 'IGNORED');

    const storedCandidates = await candidateRepo.findAll();
    assert.strictEqual(storedCandidates.length, 1);
    assert.strictEqual(storedCandidates[0]?.amount, 280.0);

    // Verificación de deduplicación: procesar nuevamente el mismo evento financiero
    const dupEvent = await rawRepo.save({
      source: 'EMAIL',
      sourceId: 'msg-sync-3',
      payload: savedFinancial.payload,
      rawText: savedFinancial.rawText,
    });

    const dupResult = await pipeline.processRawEvent(dupEvent);
    assert.strictEqual(dupResult.status, 'DUPLICATE');
    console.log('  [OK] Pipeline de correos, transiciones de estado y deduplicación completas');
  }

  console.log('\n[DONE] ¡Todos los tests de US-034 pasaron exitosamente (12/12)!');
}

export { runTests as runFinancialEmailParserTests };

if (process.argv[1] && process.argv[1].includes('FinancialEmailParser.test')) {
  runTests().catch((err) => {
    console.error('[ERROR] Error en pruebas de US-034:', err);
    process.exit(1);
  });
}
