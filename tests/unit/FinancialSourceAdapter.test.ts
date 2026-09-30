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

import {
  AndroidNotificationAdapter,
  CsvStatementAdapter,
  EmailFinancialAdapter,
  PdfStatementAdapter,
  XlsxStatementAdapter,
  createDefaultAdapterRegistry,
} from '../../src/infrastructure/adapters';

async function runTests() {
  console.log('[TEST] Iniciando pruebas de US-019: FinancialSourceAdapter...\n');

  const registry = createDefaultAdapterRegistry();

  // Test 1: AndroidNotificationAdapter
  {
    console.log('[TEST 1] AndroidNotificationAdapter: canHandle, validate y adapt');
    const adapter = new AndroidNotificationAdapter();
    const validNotif = {
      packageName: 'com.bbva.bbvacontigo',
      title: 'BBVA: Retiro de efectivo',
      text: 'Retiraste $1,000.00 en Cajero Automático',
      postTime: 1727654400000,
      key: 'notif-bbva-999',
    };

    assert.strictEqual(adapter.canHandle(validNotif), true);
    assert.strictEqual(adapter.canHandle({ foo: 'bar' }), false);

    const validation = adapter.validate(validNotif);
    assert.strictEqual(validation.isValid, true);

    const invalid = adapter.validate({ ...validNotif, packageName: '' });
    assert.strictEqual(invalid.isValid, false);

    const adapted = await adapter.adapt(validNotif);
    assert.strictEqual(adapted.source, 'ANDROID_NOTIFICATION');
    assert.strictEqual(adapted.sourceId, 'notif-bbva-999');
    assert.strictEqual(adapted.rawText, validNotif.text);
    assert.strictEqual(adapted.payload.packageName, 'com.bbva.bbvacontigo');
    console.log('  [OK] AndroidNotificationAdapter funcionando correctamente');
  }

  // Test 2: EmailFinancialAdapter
  {
    console.log('[TEST 2] EmailFinancialAdapter: canHandle, validate y adapt');
    const adapter = new EmailFinancialAdapter();
    const validEmail = {
      messageId: '<2026NuAlert@nu.com.mx>',
      from: 'alertas@nu.com.mx',
      subject: 'Compra autorizada en Mercado Libre por $350.00 MXN',
      bodyText: 'Tu tarjeta física Nu fue utilizada para una compra.',
      date: '2026-09-29T10:00:00Z',
    };

    assert.strictEqual(adapter.canHandle(validEmail), true);
    assert.strictEqual(adapter.canHandle('cadena plana'), false);

    const validation = adapter.validate(validEmail);
    assert.strictEqual(validation.isValid, true);

    const invalid = adapter.validate({ ...validEmail, messageId: '' });
    assert.strictEqual(invalid.isValid, false);

    const adapted = await adapter.adapt(validEmail);
    assert.strictEqual(adapted.source, 'EMAIL');
    assert.strictEqual(adapted.sourceId, validEmail.messageId);
    assert.strictEqual(adapted.rawText, validEmail.bodyText);
    console.log('  [OK] EmailFinancialAdapter funcionando correctamente');
  }

  // Test 3: PdfStatementAdapter
  {
    console.log('[TEST 3] PdfStatementAdapter: canHandle, validate y adapt');
    const adapter = new PdfStatementAdapter();
    const validPdf = {
      fileName: 'estado_cuenta_santander_sep.pdf',
      fileSizeBytes: 245000,
      sha256: 'a1b2c3d4e5f67890123456789abcdef0',
      extractedText: 'BANCO SANTANDER MEXICO S.A. ESTADO DE CUENTA SALDO ANTERIOR $5,400.00',
      pagesCount: 3,
      bankDetected: 'SANTANDER',
    };

    assert.strictEqual(adapter.canHandle(validPdf), true);
    assert.strictEqual(adapter.canHandle({ fileName: 'foto.jpg' }), false);

    const validation = adapter.validate(validPdf);
    assert.strictEqual(validation.isValid, true);

    const adapted = await adapter.adapt(validPdf);
    assert.strictEqual(adapted.source, 'BANK_PDF');
    assert.strictEqual(adapted.sourceId, validPdf.sha256);
    assert.strictEqual(adapted.rawText, validPdf.extractedText);
    console.log('  [OK] PdfStatementAdapter funcionando correctamente');
  }

  // Test 4: CsvStatementAdapter
  {
    console.log('[TEST 4] CsvStatementAdapter: canHandle, validate y adapt');
    const adapter = new CsvStatementAdapter();
    const validCsv = {
      fileName: 'movimientos_banamex.csv',
      rawContent: 'Fecha,Concepto,Cargo,Abono\n2026-09-01,SUPERMERCADO,520.00,\n',
      headers: ['Fecha', 'Concepto', 'Cargo', 'Abono'],
      sha256: 'csv-hash-789',
    };

    assert.strictEqual(adapter.canHandle(validCsv), true);
    assert.strictEqual(adapter.canHandle({ fileName: 'file.txt', rawContent: 'hi' }), false);

    const validation = adapter.validate(validCsv);
    assert.strictEqual(validation.isValid, true);

    const adapted = await adapter.adapt(validCsv);
    assert.strictEqual(adapted.source, 'BANK_CSV');
    assert.strictEqual(adapted.sourceId, 'csv-hash-789');
    assert.strictEqual(adapted.rawText, validCsv.rawContent);
    console.log('  [OK] CsvStatementAdapter funcionando correctamente');
  }

  // Test 5: XlsxStatementAdapter
  {
    console.log('[TEST 5] XlsxStatementAdapter: canHandle, validate y adapt');
    const adapter = new XlsxStatementAdapter();
    const validXlsx = {
      fileName: 'ReporteFinanciero.xlsx',
      sheets: [
        { name: 'Cheques', rowCount: 15 },
        { name: 'Inversiones', rowCount: 4 },
      ],
      sha256: 'xlsx-hash-321',
    };

    assert.strictEqual(adapter.canHandle(validXlsx), true);
    assert.strictEqual(adapter.canHandle({ fileName: 'documento.docx', sheets: [] }), false);

    const validation = adapter.validate(validXlsx);
    assert.strictEqual(validation.isValid, true);

    const adapted = await adapter.adapt(validXlsx);
    assert.strictEqual(adapted.source, 'BANK_XLSX');
    assert.strictEqual(adapted.sourceId, 'xlsx-hash-321');
    assert.strictEqual(adapted.payload.totalSheets, 2);
    assert.strictEqual(adapted.payload.totalRows, 19);
    console.log('  [OK] XlsxStatementAdapter funcionando correctamente');
  }

  // Test 6: FinancialSourceAdapterRegistry: resolución automática y despacho
  {
    console.log('[TEST 6] FinancialSourceAdapterRegistry: auto-detección y despacho');
    assert.strictEqual(registry.getAll().length, 5, 'Debe haber 5 adaptadores registrados');

    assert.ok(registry.get('ANDROID_NOTIFICATION') instanceof AndroidNotificationAdapter);
    assert.ok(registry.get('EMAIL') instanceof EmailFinancialAdapter);
    assert.ok(registry.get('BANK_PDF') instanceof PdfStatementAdapter);
    assert.ok(registry.get('BANK_CSV') instanceof CsvStatementAdapter);
    assert.ok(registry.get('BANK_XLSX') instanceof XlsxStatementAdapter);

    // Auto-detección y adaptación por firma
    const incomingNotification = {
      packageName: 'com.nu.production',
      title: 'Nu: Compra con Nu',
      text: 'Tu compra en OXXO por $120.00 fue aprobada',
      postTime: Date.now(),
    };

    const autoAdapted = await registry.adapt(incomingNotification);
    assert.strictEqual(autoAdapted.source, 'ANDROID_NOTIFICATION');
    assert.strictEqual(autoAdapted.payload.packageName, 'com.nu.production');

    // Rechazo de entrada desconocida
    await assert.rejects(
      async () => {
        await registry.adapt({ unknownFormat: true, randomField: 123 });
      },
      /No se encontró ningún FinancialSourceAdapter registrado/,
    );
    console.log('  [OK] Registro y resolución dinámica de adapters funcionando');
  }

  console.log('\n[DONE] ¡Todos los tests de US-019 pasaron exitosamente (6/6)!');
}

export { runTests as runFinancialSourceAdapterTests };

if (process.argv[1] && process.argv[1].includes('FinancialSourceAdapter.test')) {
  runTests().catch((err) => {
    console.error('[ERROR] Error en pruebas:', err);
    process.exit(1);
  });
}
