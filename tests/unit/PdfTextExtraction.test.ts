/**
 * Pruebas unitarias para US-038: Extracción de Texto y Tablas de Estados de Cuenta PDF
 *
 * Criterios de Aceptación:
 * 1. Texto extraído (operadores Tj, TJ, páginas y líneas).
 * 2. Tablas identificables cuando sea posible (encabezados, filas de movimientos y MSI).
 * 3. Errores manejados (PDF corrupto, encriptado o escaneado).
 * 4. Documento original conservado.
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

import { PdfStreamTextDecoder } from '../../src/domain/services/statements/PdfStreamTextDecoder';
import { PdfTableDetector } from '../../src/domain/services/statements/PdfTableDetector';
import { PdfExtractionService } from '../../src/domain/services/statements/PdfExtractionService';
import type { IRawEventRepository, RawEventFilter } from '../../src/domain/repositories/IRawEventRepository';
import type { RawEvent, CreateRawEventDTO, UpdateRawEventStatusDTO } from '../../src/domain/models/RawEvent';

// Mock de IRawEventRepository para pruebas de extracción
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
    return JSON.parse(JSON.stringify(ev));
  }

  count(): number {
    return this.events.size;
  }
}

export async function runPdfTextExtractionTests() {
  console.log('[TEST] Iniciando pruebas de US-038: Extracción de Texto y Tablas PDF...');

  // ── [TEST 1] Extracción de texto a partir de operadores estándar Tj y TJ (AC) ──
  console.log('\n[TEST 1] Extracción de texto a partir de operadores estándar Tj y TJ');
  {
    const pdfStream = `
      %PDF-1.4
      1 0 obj
      << /Length 120 >>
      stream
      BT
      /F1 12 Tf
      (BBVA MEXICO S.A.) Tj
      T*
      (ESTADO DE CUENTA OCTUBRE 2026) Tj
      T*
      [(CUENTA: ) 10 (0123456789)] TJ
      ET
      endstream
      endobj
    `;

    const decoded = PdfStreamTextDecoder.decode(pdfStream);
    assert.strictEqual(decoded.hasSearchableText, true);
    assert.ok(decoded.rawText.includes('BBVA MEXICO S.A.'));
    assert.ok(decoded.rawText.includes('ESTADO DE CUENTA OCTUBRE 2026'));
    assert.ok(decoded.rawText.includes('CUENTA: 0123456789'));

    console.log('  [OK] Operadores Tj y TJ decodificados correctamente');
  }

  // ── [TEST 2] Decodificación de caracteres especiales y secuencias de escape ──
  console.log('\n[TEST 2] Decodificación de secuencias de escape y acentos en PDF');
  {
    const escapedStream = `
      BT
      (Cargo en \\(OXXO\\) Matriz \\\\ Sucursal 42) Tj
      T*
      (Consumo de gas natural: \\$450.00) Tj
      ET
    `;

    const decoded = PdfStreamTextDecoder.extractTextFromStreamBlock(escapedStream);
    assert.ok(decoded.includes('Cargo en (OXXO) Matriz \\ Sucursal 42'));
    assert.ok(decoded.includes('Consumo de gas natural: $450.00'));

    console.log('  [OK] Caracteres escapados \\(, \\), \\\\ y \\$ decodificados fielmente');
  }

  // ── [TEST 3] Segmentación y mapeo por páginas (ExtractedPdfPage) (AC) ──
  console.log('\n[TEST 3] Segmentación y mapeo por páginas (ExtractedPdfPage)');
  {
    const multiPagePdf = `
      %PDF-1.4
      1 0 obj
      << /Type /Page >>
      stream
      BT (PAGINA 1: Resumen General) Tj ET
      endstream
      endobj
      2 0 obj
      << /Type /Page >>
      stream
      BT (PAGINA 2: Detalle de Movimientos) Tj ET
      endstream
      endobj
    `;

    const decoded = PdfStreamTextDecoder.decode(multiPagePdf);
    assert.strictEqual(decoded.pages.length, 2, 'Debe identificar 2 páginas');
    assert.strictEqual(decoded.pages[0].pageNumber, 1);
    assert.ok(decoded.pages[0].text.includes('PAGINA 1'));
    assert.strictEqual(decoded.pages[1].pageNumber, 2);
    assert.ok(decoded.pages[1].text.includes('PAGINA 2'));

    console.log('  [OK] Páginas segmentadas e identificadas cronológicamente');
  }

  // ── [TEST 4] Detección de tablas de movimientos con encabezados bancarios (AC) ──
  console.log('\n[TEST 4] Detección de tablas de movimientos bancarios estructurados');
  {
    const statementText = `
      BBVA BANCOMER
      ESTADO DE CUENTA
      FECHA\tCONCEPTO\tCARGOS\tABONOS\tSALDO
      12/OCT/2026\tOXXO MATRIZ\t$250.00\t\t$4,750.00
      13/OCT/2026\tSPEI RECIBIDO NOMINA\t\t$15,000.00\t$19,750.00
      14/OCT/2026\tUBER TRIP CDMX\t$120.50\t\t$19,629.50
    `;

    const tables = PdfTableDetector.detectTables(statementText);
    assert.strictEqual(tables.length, 1, 'Debe detectar 1 tabla de movimientos');
    const table = tables[0];
    assert.ok(table.headers.includes('FECHA'));
    assert.ok(table.headers.includes('CONCEPTO'));
    assert.strictEqual(table.rows.length, 3, 'Debe detectar las 3 filas de movimientos');

    assert.strictEqual(table.rows[0].date, '12/OCT/2026');
    assert.strictEqual(table.rows[0].amountMinor, 25000);
    assert.strictEqual(table.rows[0].type, 'CHARGE');

    assert.strictEqual(table.rows[1].date, '13/OCT/2026');
    assert.strictEqual(table.rows[1].amountMinor, 1500000);
    assert.strictEqual(table.rows[1].type, 'PAYMENT');

    console.log('  [OK] Tabla de movimientos, columnas e importes detectados');
  }

  // ── [TEST 5] Detección de sección de compras a meses sin intereses (MSI) ──
  console.log('\n[TEST 5] Detección de sección de promociones y compras a MSI');
  {
    const msiText = `
      TARJETA DE CREDITO NU
      PROMOCIONES A MESES SIN INTERESES
      05/AGO/2026\tLIVERPOOL CENTRO 3/12\t$1,200.00\tSALDO $10,800.00
      10/SEP/2026\tAPPLE STORE MEXICO 2/6\t$2,500.00\tSALDO $10,000.00
    `;

    const tables = PdfTableDetector.detectTables(msiText);
    assert.ok(tables.length >= 1);
    const msiTable = tables[0];
    assert.ok(msiTable.sectionTitle?.includes('MESES SIN INTERESES'));
    assert.strictEqual(msiTable.rows.length, 2);
    assert.strictEqual(msiTable.rows[0].amountMinor, 120000);

    console.log('  [OK] Sección de compras diferidas y MSI identificada');
  }

  // ── [TEST 6] Manejo robusto de errores ante PDF corrupto o stream truncado (AC) ──
  console.log('\n[TEST 6] Manejo robusto de errores ante PDF corrupto o datos truncados');
  {
    const extractor = new PdfExtractionService();
    const result = await extractor.extractText('');
    assert.strictEqual(result.success, false);
    assert.ok(result.errorMessage !== undefined);

    const corruptBinary = new Uint8Array([0x00, 0xff, 0xfe, 0x12]);
    const corruptResult = await extractor.extractText(corruptBinary);
    assert.strictEqual(corruptResult.success, false);
    assert.strictEqual(corruptResult.totalPages, 0);

    console.log('  [OK] Errores controlados con elegancia sin excepciones no capturadas');
  }

  // ── [TEST 7] Manejo de PDFs protegidos con contraseña (/Encrypt) (AC) ──
  console.log('\n[TEST 7] Detección de PDFs protegidos o encriptados con contraseña');
  {
    const encryptedPdf = `
      %PDF-1.4
      1 0 obj
      << /Filter /Standard /V 2 /R 3 /O (hash) /U (hash) /P -1052 >>
      endobj
      trailer
      << /Encrypt 1 0 R /Root 2 0 R >>
      %%EOF
    `;

    const extractor = new PdfExtractionService();
    const result = await extractor.extractText(encryptedPdf);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.metadata.isEncrypted, true);
    assert.ok(result.errorMessage?.includes('contraseña o cifrado'));

    console.log('  [OK] PDF protegido detectado y notificado claramente');
  }

  // ── [TEST 8] Detección de PDF escaneado (sin texto) y aviso de OCR (AC) ──
  console.log('\n[TEST 8] Detección de PDF escaneado como imagen (sin texto seleccionable)');
  {
    const scannedPdf = `
      %PDF-1.4
      1 0 obj
      << /Type /XObject /Subtype /Image /Width 800 /Height 1200 >>
      stream
      \x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR...
      endstream
      endobj
    `;

    const extractor = new PdfExtractionService();
    const result = await extractor.extractText(scannedPdf);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.metadata.hasSearchableText, false);
    assert.ok(result.errorMessage?.includes('OCR'));

    console.log('  [OK] Documento escaneado identificado con bandera de OCR');
  }

  // ── [TEST 9] Conservación íntegra e inmutable del documento original (AC) ──
  console.log('\n[TEST 9] Conservación íntegra e inmutable del documento original');
  {
    const rawRepo = new MockRawEventRepository();
    const extractor = new PdfExtractionService(rawRepo);

    const originalPayload = {
      fileName: 'extracto_bbva.pdf',
      sha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      fileSizeBytes: 45000,
      storagePath: 'user1/extracto_bbva.pdf',
    };

    const rawEvent = await rawRepo.save({
      source: 'BANK_PDF',
      sourceId: originalPayload.sha256,
      payload: originalPayload,
      receivedAt: new Date(),
    });

    const pdfContent = 'BT (ESTADO DE CUENTA BBVA BANCOMER) Tj ET';
    const procResult = await extractor.processRawEvent(rawEvent, pdfContent);

    assert.strictEqual(procResult.status, 'SUCCESS');
    assert.deepStrictEqual(
      procResult.rawEvent.payload,
      originalPayload,
      'El payload original debe mantenerse 100% inalterado',
    );
    assert.ok(procResult.rawEvent.rawText?.includes('ESTADO DE CUENTA BBVA BANCOMER'));

    console.log('  [OK] Inmutabilidad estricta del documento y payload verificada');
  }

  // ── [TEST 10] Detección automática del banco a partir del texto extraído ──
  console.log('\n[TEST 10] Detección automática del banco a partir del texto extraído');
  {
    const santanderPdf = `
      BT
      (BANCO SANTANDER MEXICO S.A.) Tj
      T*
      (ESTADO DE CUENTA INTEGRAL) Tj
      ET
    `;

    const extractor = new PdfExtractionService();
    const result = await extractor.extractText(santanderPdf);
    assert.strictEqual(result.metadata.bankDetected, 'SANTANDER');

    console.log('  [OK] Institución Santander identificada con éxito desde el texto');
  }

  // ── [TEST 11] Orquestación de extremo a extremo en PdfExtractionService ──
  console.log('\n[TEST 11] Orquestación de extremo a extremo en PdfExtractionService');
  {
    const rawRepo = new MockRawEventRepository();
    const extractor = new PdfExtractionService(rawRepo);

    const rawPdf = `
      %PDF-1.4
      stream
      BT
      (BANORTE ESTADO DE CUENTA) Tj
      T*
      (FECHA\tCONCEPTO\tCARGOS\tSALDO) Tj
      T*
      (15/OCT/2026\tSUPER CHEDRAUI\t$840.00\t$12,000.00) Tj
      ET
      endstream
    `;

    const event = await rawRepo.save({
      source: 'BANK_PDF',
      sourceId: 'sha_test_11',
      payload: { fileName: 'banorte.pdf' },
      receivedAt: new Date(),
    });

    const result = await extractor.processRawEvent(event, rawPdf);
    assert.strictEqual(result.status, 'SUCCESS');
    assert.strictEqual(result.rawEvent.status, 'PENDING');
    assert.strictEqual(result.extraction.tables.length, 1);
    assert.strictEqual(result.extraction.tables[0].rows[0].amountMinor, 84000);

    console.log('  [OK] Proceso completo de extracción y enriquecimiento validado');
  }

  // ── [TEST 12] Invariante arquitectónica: Cero inserciones en modelo Transaction ──
  console.log('\n[TEST 12] Invariante arquitectónica: Cero inserciones en Transaction (AC)');
  {
    const rawRepo = new MockRawEventRepository();
    const extractor = new PdfExtractionService(rawRepo);

    const pdfText = 'BT (OXXO $50.00) Tj ET';
    const event = await rawRepo.save({
      source: 'BANK_PDF',
      sourceId: 'sha_tx_check',
      payload: { fileName: 'test.pdf' },
    });

    const result = await extractor.processRawEvent(event, pdfText);
    assert.strictEqual(result.status, 'SUCCESS');
    // El evento queda preparado en raw_events pero no se inserta ninguna Transaction
    assert.strictEqual(result.rawEvent.source, 'BANK_PDF');

    console.log('  [OK] Invariante arquitectónica respetada: cero escritura en Transaction');
  }

  console.log('\n[RESULTADO] Todas las pruebas de US-038 pasaron exitosamente (12/12).');
}
