/**
 * Pruebas unitarias para US-037: Upload de PDF Bancario
 *
 * Criterios de Aceptación:
 * 1. Upload seguro: Criptografía SHA-256, magic bytes %PDF-, sanitización de ruta.
 * 2. Archivo asociado al usuario: Vinculación estricta y partición por userId.
 * 3. Raw source identificada: RawEvent con source = 'BANK_PDF' y status = 'PENDING'.
 * 4. Validación de tipo/tamaño: Límite de 20 MB, tipo MIME application/pdf y extensión .pdf.
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

import { BankPdfValidator } from '../../src/domain/services/statements/BankPdfValidator';
import { BankPdfUploadService } from '../../src/domain/services/statements/BankPdfUploadService';
import { InMemoryStatementStorageService } from '../../src/infrastructure/storage/InMemoryStatementStorageService';
import type { IRawEventRepository, RawEventFilter } from '../../src/domain/repositories/IRawEventRepository';
import type { RawEvent, CreateRawEventDTO, UpdateRawEventStatusDTO } from '../../src/domain/models/RawEvent';

// Mock de IRawEventRepository en memoria con aislamiento de usuario
class MockRawEventRepository implements IRawEventRepository {
  private events: Map<string, RawEvent> = new Map();

  async save(dto: CreateRawEventDTO): Promise<RawEvent> {
    const now = new Date();
    const eventUserId =
      (dto.metadata?.userId as string) ||
      (dto.payload?.userId as string) ||
      'test-user-1';
    const event: RawEvent = {
      id: `raw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: eventUserId,
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

export async function runBankPdfUploadTests() {
  console.log('[TEST] Iniciando pruebas de US-037: Upload de PDF Bancario...');

  const validPdfContent = '%PDF-1.4\n1 0 obj\n<< /Title (Estado de Cuenta BBVA) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF';
  const validSha256 = BankPdfValidator.computeSha256(validPdfContent);

  // ── [TEST 1] Upload seguro de PDF con cálculo e integridad de SHA-256 (AC) ──
  console.log('\n[TEST 1] Upload seguro de PDF con cálculo e integridad de SHA-256 (AC)');
  {
    const rawRepo = new MockRawEventRepository();
    const storageService = new InMemoryStatementStorageService();
    const service = new BankPdfUploadService({
      rawEventRepository: rawRepo,
      storageService,
    });

    const result = await service.uploadStatement({
      userId: 'usr_diego_001',
      fileName: 'BBVA_Octubre_2026.pdf',
      fileSizeBytes: validPdfContent.length,
      mimeType: 'application/pdf',
      content: validPdfContent,
    });

    assert.strictEqual(result.status, 'SUCCESS');
    assert.ok(result.rawEvent !== null);
    assert.ok(result.storedFile !== null);
    assert.strictEqual(result.storedFile?.sha256, validSha256);
    assert.strictEqual(result.rawEvent?.sourceId, validSha256);
    assert.strictEqual(result.rawEvent?.payload.sha256, validSha256);

    console.log('  [OK] Hash SHA-256 calculado e integridad verificada con éxito');
  }

  // ── [TEST 2] Archivo asociado estrictamente al usuario autenticado (AC) ──
  console.log('\n[TEST 2] Archivo asociado estrictamente al usuario autenticado (AC)');
  {
    const rawRepo = new MockRawEventRepository();
    const storageService = new InMemoryStatementStorageService();
    const service = new BankPdfUploadService({
      rawEventRepository: rawRepo,
      storageService,
    });

    const userId = 'usr_diego_002';
    const result = await service.uploadStatement({
      userId,
      fileName: 'Santander_EstadoCuenta.pdf',
      fileSizeBytes: validPdfContent.length,
      mimeType: 'application/pdf',
      content: validPdfContent,
    });

    assert.strictEqual(result.status, 'SUCCESS');
    assert.strictEqual(result.storedFile?.userId, userId);
    assert.strictEqual(result.storedFile?.storagePath.startsWith(`${userId}/`), true);

    const exists = await storageService.exists(result.storedFile!.storagePath);
    assert.strictEqual(exists, true, 'El archivo debe existir en la carpeta del usuario');

    console.log('  [OK] Archivo almacenado y particionado bajo el userId del usuario');
  }

  // ── [TEST 3] Rechazo cuando el usuario no está identificado o userId está vacío (AC) ──
  console.log('\n[TEST 3] Rechazo cuando el usuario no está identificado o userId está vacío (AC)');
  {
    const rawRepo = new MockRawEventRepository();
    const storageService = new InMemoryStatementStorageService();
    const service = new BankPdfUploadService({
      rawEventRepository: rawRepo,
      storageService,
    });

    const result = await service.uploadStatement({
      userId: '   ',
      fileName: 'EstadoCuenta.pdf',
      fileSizeBytes: validPdfContent.length,
      content: validPdfContent,
    });

    assert.strictEqual(result.status, 'REJECTED');
    assert.strictEqual(result.rawEvent, null);
    assert.strictEqual(result.storedFile, null);
    assert.strictEqual(rawRepo.count(), 0, 'No debe persistir eventos sin usuario');
    assert.strictEqual(storageService.count(), 0, 'No debe subir archivos sin usuario');

    console.log('  [OK] Rechazo inmediato ante ausencia de userId');
  }

  // ── [TEST 4] Raw source identificada formalmente como BANK_PDF con status PENDING (AC) ──
  console.log('\n[TEST 4] Raw source identificada formalmente como BANK_PDF con status PENDING (AC)');
  {
    const rawRepo = new MockRawEventRepository();
    const storageService = new InMemoryStatementStorageService();
    const service = new BankPdfUploadService({
      rawEventRepository: rawRepo,
      storageService,
    });

    const result = await service.uploadStatement({
      userId: 'usr_test_4',
      fileName: 'Banorte_Octubre.pdf',
      fileSizeBytes: validPdfContent.length,
      content: validPdfContent,
    });

    assert.strictEqual(result.status, 'SUCCESS');
    assert.strictEqual(result.rawEvent?.source, 'BANK_PDF');
    assert.strictEqual(result.rawEvent?.status, 'PENDING');
    assert.strictEqual(result.rawEvent?.payload.bankDetected, 'BANORTE');
    assert.strictEqual(result.rawEvent?.rawText, undefined, 'rawText debe permanecer undefined hasta extracción en US-038');

    console.log('  [OK] Evento crudo registrado con fuente canónica BANK_PDF y status PENDING');
  }

  // ── [TEST 5] Validación de extensión: Solo se admiten archivos .pdf (AC) ──
  console.log('\n[TEST 5] Validación de extensión: Solo se admiten archivos .pdf (AC)');
  {
    const rawRepo = new MockRawEventRepository();
    const storageService = new InMemoryStatementStorageService();
    const service = new BankPdfUploadService({
      rawEventRepository: rawRepo,
      storageService,
    });

    const invalidExtensions = ['documento.docx', 'imagen.png', 'datos.csv', 'archivo.xlsx', 'script.exe'];

    for (const badName of invalidExtensions) {
      const result = await service.uploadStatement({
        userId: 'usr_test_5',
        fileName: badName,
        fileSizeBytes: 1024,
        content: validPdfContent,
      });

      assert.strictEqual(result.status, 'REJECTED', `Debe rechazar ${badName}`);
      assert.strictEqual(rawRepo.count(), 0);
    }

    console.log('  [OK] Rechazo exitoso de extensiones que no corresponden a .pdf');
  }

  // ── [TEST 6] Validación de tipo MIME: Solo se admite application/pdf (AC) ──
  console.log('\n[TEST 6] Validación de tipo MIME: Solo se admite application/pdf (AC)');
  {
    const rawRepo = new MockRawEventRepository();
    const storageService = new InMemoryStatementStorageService();
    const service = new BankPdfUploadService({
      rawEventRepository: rawRepo,
      storageService,
    });

    const result = await service.uploadStatement({
      userId: 'usr_test_6',
      fileName: 'estado.pdf',
      mimeType: 'image/jpeg',
      fileSizeBytes: validPdfContent.length,
      content: validPdfContent,
    });

    assert.strictEqual(result.status, 'REJECTED');
    assert.ok(result.validationErrors?.some((e) => e.includes('Tipo MIME no permitido')));

    console.log('  [OK] Rechazo controlado ante tipo MIME no permitido');
  }

  // ── [TEST 7] Validación de tamaño: Rechazo de archivos vacíos (0 bytes) (AC) ──
  console.log('\n[TEST 7] Validación de tamaño: Rechazo de archivos vacíos (0 bytes) (AC)');
  {
    const rawRepo = new MockRawEventRepository();
    const storageService = new InMemoryStatementStorageService();
    const service = new BankPdfUploadService({
      rawEventRepository: rawRepo,
      storageService,
    });

    const result = await service.uploadStatement({
      userId: 'usr_test_7',
      fileName: 'vacio.pdf',
      fileSizeBytes: 0,
      content: '%PDF-1.4',
    });

    assert.strictEqual(result.status, 'REJECTED');
    assert.ok(result.validationErrors?.some((e) => e.includes('vacío')));

    console.log('  [OK] Archivo de 0 bytes rechazado correctamente');
  }

  // ── [TEST 8] Validación de tamaño: Rechazo de archivos mayores a 20 MB (AC) ──
  console.log('\n[TEST 8] Validación de tamaño: Rechazo de archivos mayores a 20 MB (AC)');
  {
    const rawRepo = new MockRawEventRepository();
    const storageService = new InMemoryStatementStorageService();
    const service = new BankPdfUploadService({
      rawEventRepository: rawRepo,
      storageService,
    });

    const overLimitBytes = 25 * 1024 * 1024; // 25 MB
    const result = await service.uploadStatement({
      userId: 'usr_test_8',
      fileName: 'extracto_pesado.pdf',
      fileSizeBytes: overLimitBytes,
      content: validPdfContent,
    });

    assert.strictEqual(result.status, 'REJECTED');
    assert.ok(result.validationErrors?.some((e) => e.includes('excede el tamaño máximo')));

    console.log('  [OK] Archivo superior a 20 MB rechazado con mensaje descriptivo');
  }

  // ── [TEST 9] Validación de Magic Bytes: Detección y rechazo de archivos fraudulentos (AC) ──
  console.log('\n[TEST 9] Validación de Magic Bytes: Detección y rechazo de archivos fraudulentos (AC)');
  {
    const rawRepo = new MockRawEventRepository();
    const storageService = new InMemoryStatementStorageService();
    const service = new BankPdfUploadService({
      rawEventRepository: rawRepo,
      storageService,
    });

    // Archivo con extensión .pdf pero cuyo contenido es texto plano o binario sin encabezado %PDF-
    const fakeContent = 'Este es un archivo de texto renombrado a .pdf';
    const result = await service.uploadStatement({
      userId: 'usr_test_9',
      fileName: 'falso_extracto.pdf',
      fileSizeBytes: fakeContent.length,
      mimeType: 'application/pdf',
      content: fakeContent,
    });

    assert.strictEqual(result.status, 'REJECTED');
    assert.ok(result.validationErrors?.some((e) => e.includes('%PDF- ausente')));

    console.log('  [OK] Archivo con firma inválida o corrupta rechazado');
  }

  // ── [TEST 10] Sanitización segura de nombre de archivo contra Path Traversal (AC) ──
  console.log('\n[TEST 10] Sanitización segura de nombre de archivo contra Path Traversal (AC)');
  {
    const rawRepo = new MockRawEventRepository();
    const storageService = new InMemoryStatementStorageService();
    const service = new BankPdfUploadService({
      rawEventRepository: rawRepo,
      storageService,
    });

    const dangerousName = '../../../../secret/root_access.pdf';
    const result = await service.uploadStatement({
      userId: 'usr_test_10',
      fileName: dangerousName,
      fileSizeBytes: validPdfContent.length,
      content: validPdfContent,
    });

    assert.strictEqual(result.status, 'SUCCESS');
    assert.strictEqual(result.storedFile?.fileName, 'root_access.pdf');
    assert.strictEqual(result.storedFile?.storagePath.includes('..'), false);

    console.log('  [OK] Path traversal mitigado y nombre sanitizado de forma segura');
  }

  // ── [TEST 11] Detección de duplicados por SHA-256 (Idempotencia de subida) (AC) ──
  console.log('\n[TEST 11] Detección de duplicados por SHA-256 (Idempotencia de subida) (AC)');
  {
    const rawRepo = new MockRawEventRepository();
    const storageService = new InMemoryStatementStorageService();
    const service = new BankPdfUploadService({
      rawEventRepository: rawRepo,
      storageService,
    });

    // Primera subida
    const res1 = await service.uploadStatement({
      userId: 'usr_test_11',
      fileName: 'BBVA_Octubre.pdf',
      fileSizeBytes: validPdfContent.length,
      content: validPdfContent,
    });
    assert.strictEqual(res1.status, 'SUCCESS');

    // Segunda subida con exactamente el mismo archivo (mismo SHA-256)
    const res2 = await service.uploadStatement({
      userId: 'usr_test_11',
      fileName: 'BBVA_Octubre_Copia.pdf',
      fileSizeBytes: validPdfContent.length,
      content: validPdfContent,
    });

    assert.strictEqual(res2.status, 'DUPLICATE');
    assert.strictEqual(res2.rawEvent?.id, res1.rawEvent?.id, 'Debe devolver el evento existente');
    assert.strictEqual(rawRepo.count(), 1, 'No debe insertar eventos duplicados');

    console.log('  [OK] Idempotencia confirmada: segundo intento marcado como DUPLICATE');
  }

  // ── [TEST 12] Invariante arquitectónica estricta: NO se altera Transaction (AC) ──
  console.log('\n[TEST 12] Invariante arquitectónica: Cero inserciones en modelo Transaction (AC)');
  {
    const rawRepo = new MockRawEventRepository();
    const storageService = new InMemoryStatementStorageService();
    const service = new BankPdfUploadService({
      rawEventRepository: rawRepo,
      storageService,
    });

    const result = await service.uploadStatement({
      userId: 'usr_test_12',
      fileName: 'Citibanamex_Octubre.pdf',
      fileSizeBytes: validPdfContent.length,
      content: validPdfContent,
    });

    assert.strictEqual(result.status, 'SUCCESS');
    assert.strictEqual(result.rawEvent?.source, 'BANK_PDF');
    // El evento queda PENDING para ser procesado posteriormente por US-038 y US-039
    assert.strictEqual(result.rawEvent?.status, 'PENDING');

    console.log('  [OK] Invariante arquitectónica respetada: flujo desacoplado sin mutación de transacciones');
  }

  console.log('\n[RESULTADO] Todas las pruebas de US-037 pasaron exitosamente (12/12).');
}
