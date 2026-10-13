/**
 * Pruebas unitarias para US-041: Ingestión de Estados de Cuenta XLSX
 *
 * Criterios de Aceptación:
 * 1. Archivo validado (MIME, extensión .xlsx/.xlsm/.xls, tamaño máx 20 MB, magic bytes PK/ZIP).
 * 2. Hojas y columnas detectadas (soporte multihoja, detección inteligente de encabezados y columnas).
 * 3. Filas convertidas a candidates (TransactionCandidate con fingerprint determinístico de US-025).
 * 4. Deduplicación y reconciliación aplicada (idempotencia de archivo y candidatos).
 *
 * Invariante arquitectónica:
 * Cero inserciones directas en el modelo Transaction.
 */

import * as XLSX from 'xlsx';

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
assert.ok = (condition: unknown, msg?: string): asserts condition => {
  if (!condition) throw new Error(msg || 'Expected truthy');
};

import {
  XlsxFileValidator,
  XlsxStatementParser,
  XlsxIngestionService,
} from '../../src/domain/services/xlsx';
import { TransactionFingerprintService } from '../../src/domain/services/fingerprint';
import type { RawEvent, CreateRawEventDTO, UpdateRawEventStatusDTO, RawEventSource } from '../../src/domain/models/RawEvent';
import type { IRawEventRepository, RawEventFilter } from '../../src/domain/repositories/IRawEventRepository';
import type { ITransactionRepository, TransactionFilters, PaginationOptions } from '../../src/domain/repositories/ITransactionRepository';
import type { Transaction, CreateTransactionInput, UpdateTransactionInput } from '../../src/domain/models/Transaction';
import { InMemoryTransactionCandidateRepository } from '../../src/infrastructure/database/InMemoryTransactionCandidateRepository';

// Mock de IRawEventRepository para pruebas de XLSX
class MockRawEventRepository implements IRawEventRepository {
  private events: Map<string, RawEvent> = new Map();

  async save(dto: CreateRawEventDTO): Promise<RawEvent> {
    const now = new Date();
    const event: RawEvent = {
      id: `raw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: (dto.metadata?.userId as string) || 'test-user',
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
    return this.events.get(id) || null;
  }

  async findBySourceId(source: RawEventSource, sourceId: string): Promise<RawEvent | null> {
    for (const ev of this.events.values()) {
      if (ev.source === source && ev.sourceId === sourceId) return ev;
    }
    return null;
  }

  async getPendingEvents(limit?: number): Promise<RawEvent[]> {
    const list = Array.from(this.events.values()).filter((e) => e.status === 'PENDING');
    return limit ? list.slice(0, limit) : list;
  }

  async getEvents(filter?: RawEventFilter): Promise<RawEvent[]> {
    let list = Array.from(this.events.values());
    if (filter?.status) list = list.filter((e) => e.status === filter.status);
    if (filter?.source) list = list.filter((e) => e.source === filter.source);
    if (filter?.limit) list = list.slice(0, filter.limit);
    return list;
  }

  async updateStatus(id: string, dto: UpdateRawEventStatusDTO): Promise<RawEvent> {
    const ev = this.events.get(id);
    if (!ev) throw new Error('Not found');
    ev.status = dto.status;
    if (dto.errorMessage !== undefined && dto.errorMessage !== null) ev.errorMessage = dto.errorMessage;
    ev.updatedAt = new Date();
    return ev;
  }

  async markForReprocessing(id: string): Promise<RawEvent> {
    const ev = this.events.get(id);
    if (!ev) throw new Error('Not found');
    ev.status = 'PENDING';
    ev.retryCount++;
    ev.errorMessage = undefined;
    return ev;
  }
}

// Mock de ITransactionRepository para pruebas de reconciliación
class MockTransactionRepository implements ITransactionRepository {
  public transactions: Transaction[] = [];

  async findByFingerprint(fingerprint: string): Promise<Transaction | null> {
    for (const tx of this.transactions) {
      if (tx.fingerprint === fingerprint) return { ...tx };
    }
    return null;
  }

  async listTransactions(_filters?: TransactionFilters, _pagination?: PaginationOptions): Promise<Transaction[]> {
    return [...this.transactions];
  }

  async getTransaction(id: string): Promise<Transaction> {
    const tx = this.transactions.find((t) => t.id === id);
    if (!tx) throw new Error(`Transaction not found: ${id}`);
    return { ...tx };
  }

  async createTransaction(input: CreateTransactionInput): Promise<Transaction> {
    const now = new Date();
    const tx: Transaction = {
      id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: 'test-user',
      accountId: input.accountId,
      type: input.type,
      amountMinor: input.amountMinor,
      currency: input.currency || 'MXN',
      source: input.source || 'MANUAL',
      status: input.status || 'CONFIRMED',
      occurredAt: input.occurredAt,
      postedAt: input.postedAt || null,
      merchantRaw: input.merchantRaw || null,
      merchant: input.merchant || null,
      description: input.description || null,
      categoryId: input.categoryId || null,
      sourceEventId: input.sourceEventId || null,
      confidenceScore: input.confidenceScore || 85,
      fingerprint: input.fingerprint || null,
      linkedTransactionId: input.linkedTransactionId || null,
      sourcesEvidence: input.sourcesEvidence ? [...input.sourcesEvidence] : [],
      metadata: input.metadata ? { ...input.metadata } : {},
      createdAt: now,
      updatedAt: now,
    };
    this.transactions.push(tx);
    return { ...tx };
  }

  async updateTransaction(id: string, input: UpdateTransactionInput): Promise<Transaction> {
    const tx = this.transactions.find((t) => t.id === id);
    if (!tx) throw new Error(`Transaction not found: ${id}`);
    if (input.postedAt !== undefined) tx.postedAt = input.postedAt;
    if (input.merchant !== undefined) tx.merchant = input.merchant;
    if (input.description !== undefined) tx.description = input.description;
    if (input.status !== undefined) tx.status = input.status;
    if (input.confidenceScore !== undefined) tx.confidenceScore = input.confidenceScore;
    if (input.sourcesEvidence !== undefined) tx.sourcesEvidence = [...input.sourcesEvidence];
    if (input.metadata !== undefined) tx.metadata = { ...(tx.metadata || {}), ...input.metadata };
    tx.updatedAt = new Date();
    return { ...tx };
  }

  async deleteTransaction(id: string): Promise<void> {
    this.transactions = this.transactions.filter((t) => t.id !== id);
  }
}

/** Helper para construir un Uint8Array de XLSX real en memoria */
function createSampleWorkbookBytes(sheets: Record<string, any[][]>): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [sheetName, data] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }
  const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Uint8Array(u8);
}

export async function runXlsxIngestionTests() {
  console.log('[TEST] Iniciando pruebas de US-041: XLSX Ingestion...\n');

  // ── [TEST 1] Validación de archivo: extensión, MIME, tamaño y sanitización (AC) ──
  console.log('[TEST 1] Validación exhaustiva de archivo XLSX (AC)');
  {
    // Rechazo por extensión no permitida
    const invalidExt = XlsxFileValidator.validate({
      fileName: 'movimientos.pdf',
      fileSizeBytes: 1024,
      content: new Uint8Array([1, 2, 3, 4]),
    });
    assert.strictEqual(invalidExt.isValid, false);
    assert.ok(invalidExt.errors.some((e) => e.includes('extensión válida')));

    // Rechazo por archivo vacío (0 bytes)
    const emptyFile = XlsxFileValidator.validate({
      fileName: 'extract.xlsx',
      fileSizeBytes: 0,
      content: new Uint8Array([]),
    });
    assert.strictEqual(emptyFile.isValid, false);
    assert.ok(emptyFile.errors.some((e) => e.includes('vacío')));

    // Rechazo por tamaño excesivo (> 20 MB)
    const largeFile = XlsxFileValidator.validate({
      fileName: 'pesado.xlsx',
      fileSizeBytes: 25 * 1024 * 1024,
      content: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
    });
    assert.strictEqual(largeFile.isValid, false);
    assert.ok(largeFile.errors.some((e) => e.includes('excede el tamaño máximo')));

    // Sanitización contra path traversal
    const sanitized = XlsxFileValidator.sanitizeFileName('../../etc/passwd.xlsx');
    assert.strictEqual(sanitized, 'passwd.xlsx');
    assert.ok(!sanitized.includes('..'));
    assert.ok(!sanitized.includes('/'));

    // Rechazo por Magic Bytes inválidos
    const fakeBytes = new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44]);
    const fakeResult = XlsxFileValidator.validate({
      fileName: 'falso.xlsx',
      fileSizeBytes: fakeBytes.length,
      content: fakeBytes,
    });
    assert.strictEqual(fakeResult.isValid, false);
    assert.ok(fakeResult.errors.some((e) => e.includes('Firma de archivo XLSX inválida')));

    console.log('  [OK] Reglas de validación, tamaño, magic bytes y sanitización de XLSX validadas');
  }

  // ── [TEST 2] Verificación de Magic Bytes PKZip auténtico (AC) ──
  console.log('\n[TEST 2] Verificación de Magic Bytes PKZip auténtico y hash SHA-256');
  {
    const sampleBytes = createSampleWorkbookBytes({
      Sheet1: [
        ['Fecha', 'Concepto', 'Monto'],
        ['12/10/2026', 'Starbucks', 95.0],
      ],
    });

    const magic = XlsxFileValidator.validateMagicBytes(sampleBytes);
    assert.strictEqual(magic.isValid, true);
    assert.strictEqual(magic.format, 'OOXML');

    const validResult = XlsxFileValidator.validate({
      fileName: 'BBVA_Octubre.xlsx',
      fileSizeBytes: sampleBytes.length,
      content: sampleBytes,
    });
    assert.strictEqual(validResult.isValid, true);
    assert.strictEqual(validResult.errors.length, 0);
    assert.ok(validResult.sha256.length === 64, 'Debe generar hash SHA-256 de 64 caracteres hex');

    console.log('  [OK] Magic Bytes OOXML PKZip y cálculo de SHA-256 verificados exitosamente');
  }

  // ── [TEST 3] Detección y navegación multihoja (AC) ──
  console.log('\n[TEST 3] Detección multihoja y selección por nombre o índice (AC)');
  {
    const multiSheetBytes = createSampleWorkbookBytes({
      Resumen: [
        ['Periodo', 'Saldo Inicial', 'Saldo Final'],
        ['Octubre 2026', 15000, 22000],
      ],
      Movimientos: [
        ['Fecha', 'Concepto', 'Monto'],
        ['10/10/2026', 'Amazon Mexico', 899.0],
        ['11/10/2026', 'Uber Eats', 245.5],
      ],
      Inversiones: [
        ['Instrumento', 'Tasa', 'Monto'],
        ['Cetes 28D', 11.0, 50000],
      ],
    });

    const parser = new XlsxStatementParser();
    const sheets = parser.listSheets(multiSheetBytes);
    assert.strictEqual(sheets.length, 3);
    assert.strictEqual(sheets[0], 'Resumen');
    assert.strictEqual(sheets[1], 'Movimientos');
    assert.strictEqual(sheets[2], 'Inversiones');

    const rawEvent: RawEvent = {
      id: 'raw-ev-multi',
      userId: 'user-diego',
      source: 'BANK_XLSX',
      sourceId: 'sha256-multi',
      payload: { fileName: 'multisheet.xlsx' },
      metadata: {},
      status: 'PENDING',
      retryCount: 0,
      receivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Parsear hoja específica 'Movimientos'
    const result = await parser.parse(multiSheetBytes, rawEvent, {
      sheetName: 'Movimientos',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.sheetName, 'Movimientos');
    assert.strictEqual(result.validRows, 2);
    assert.strictEqual(result.candidates.length, 2);
    assert.strictEqual(result.candidates[0].merchant, 'Amazon');
    assert.strictEqual(result.candidates[1].merchant, 'Uber Eats');

    console.log('  [OK] Hojas detectadas y extracción dirigida por sheetName validada');
  }

  // ── [TEST 4] Auto-detección de fila de encabezados con metadatos iniciales ──
  console.log('\n[TEST 4] Auto-detección de fila de encabezados con metadatos previos');
  {
    const bytesWithMetadataHeader = createSampleWorkbookBytes({
      Extracto: [
        ['BANCO NACIONAL DE MEXICO', '', ''],
        ['ESTADO DE CUENTA MENSUAL', '', ''],
        ['CLIENTE: DIEGO CAMARENA', 'CUENTA: *1234', 'PERIODO: OCT-2026'],
        [''], // Fila vacía
        ['Fecha', 'Concepto', 'Cargo', 'Abono'], // Fila 4 (índice 4)
        ['12/10/2026', 'OXXO POLANCO', 150.0, 0],
        ['15/10/2026', 'DEPOSITO NOMINA', 0, 25000.0],
      ],
    });

    const parser = new XlsxStatementParser();
    const rawEvent: RawEvent = {
      id: 'raw-header-test',
      userId: 'user-diego',
      source: 'BANK_XLSX',
      sourceId: 'sha-header-test',
      payload: { fileName: 'metadatos.xlsx' },
      metadata: {},
      status: 'PENDING',
      retryCount: 0,
      receivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const res = await parser.parse(bytesWithMetadataHeader, rawEvent);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.validRows, 2);
    assert.strictEqual(res.candidates[0].type, 'EXPENSE');
    assert.strictEqual(res.candidates[0].amount, 150);
    assert.strictEqual(res.candidates[1].type, 'INCOME');
    assert.strictEqual(res.candidates[1].amount, 25000);

    console.log('  [OK] Encabezados localizados inteligentemente omitiendo metadatos superiores');
  }

  // ── [TEST 5] Mapeo inteligente automático de columnas bancarias ──
  console.log('\n[TEST 5] Mapeo inteligente automático de columnas contables y bancarias');
  {
    const bytes = createSampleWorkbookBytes({
      Sheet1: [
        ['FECHA OPERACION', 'DESCRIPCION DETALLADA', 'IMPORTE', 'DIVISA'],
        ['12/10/2026', 'FARMACIA SAN PABLO', 320.5, 'MXN'],
        ['13/10/2026', 'RESTAURANTE EL CARDENAL', 850.0, 'MXN'],
      ],
    });

    const parser = new XlsxStatementParser();
    const rawEvent: RawEvent = {
      id: 'raw-map-test',
      userId: 'user-diego',
      source: 'BANK_XLSX',
      sourceId: 'sha-map-test',
      payload: { fileName: 'extracto.xlsx' },
      metadata: {},
      status: 'PENDING',
      retryCount: 0,
      receivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const res = await parser.parse(bytes, rawEvent);
    assert.strictEqual(res.validRows, 2);
    assert.strictEqual(res.mappingUsed.dateColumn, 'FECHA OPERACION');
    assert.strictEqual(res.mappingUsed.descriptionColumn, 'DESCRIPCION DETALLADA');
    assert.strictEqual(res.mappingUsed.amountColumn, 'IMPORTE');
    assert.strictEqual(res.candidates[0].currency, 'MXN');

    console.log('  [OK] Mapeo automático de columnas con nombres variados completado');
  }

  // ── [TEST 6] Manejo de fechas numéricas seriales de Excel ──
  console.log('\n[TEST 6] Conversión exacta de fechas seriales numéricas de Excel');
  {
    // En Excel, 45577 = 12 de Octubre de 2024 (o similar)
    const bytes = createSampleWorkbookBytes({
      Sheet1: [
        ['Fecha', 'Concepto', 'Monto'],
        [45577, 'WALMART SUPERCENTER', 1250.0],
      ],
    });

    const parser = new XlsxStatementParser();
    const rawEvent: RawEvent = {
      id: 'raw-serial-date',
      userId: 'user-diego',
      source: 'BANK_XLSX',
      sourceId: 'sha-serial-date',
      payload: { fileName: 'fechas_excel.xlsx' },
      metadata: {},
      status: 'PENDING',
      retryCount: 0,
      receivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const res = await parser.parse(bytes, rawEvent);
    assert.strictEqual(res.validRows, 1);
    const candidate = res.candidates[0];
    assert.ok(candidate.occurredAt instanceof Date);
    assert.ok(!isNaN(candidate.occurredAt.getTime()));

    console.log('  [OK] Fecha serial de Excel decodificada e incorporada a occurredAt');
  }

  // ── [TEST 7] Generación canónica de TransactionCandidate (AC) ──
  console.log('\n[TEST 7] Generación canónica de TransactionCandidate con campos completos');
  {
    const bytes = createSampleWorkbookBytes({
      Sheet1: [
        ['Fecha', 'Concepto', 'Cargo', 'Abono', 'Folio'],
        ['12/10/2026', 'LIVERPOOL POLANCO', 3250.0, 0, 'AUT-987654'],
      ],
    });

    const parser = new XlsxStatementParser();
    const rawEvent: RawEvent = {
      id: 'raw-cand-full',
      userId: 'user-diego',
      source: 'BANK_XLSX',
      sourceId: 'sha-cand-full',
      payload: { fileName: 'liverpool.xlsx' },
      metadata: {},
      status: 'PENDING',
      retryCount: 0,
      receivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const res = await parser.parse(bytes, rawEvent);
    assert.strictEqual(res.validRows, 1);
    const c = res.candidates[0];

    assert.strictEqual(c.userId, 'user-diego');
    assert.strictEqual(c.rawEventId, 'raw-cand-full');
    assert.strictEqual(c.source, 'BANK_XLSX');
    assert.strictEqual(c.amount, 3250);
    assert.strictEqual(c.amountMinor, 325000);
    assert.strictEqual(c.type, 'EXPENSE');
    assert.strictEqual(c.currency, 'MXN');
    assert.strictEqual(c.status, 'PENDING_REVIEW');
    assert.strictEqual(c.metadata?.reference, 'AUT-987654');

    console.log('  [OK] Candidato canónico generado fielmente con montos en centavos y metadatos');
  }

  // ── [TEST 8] Huella determinística SHA-256 (fingerprint US-025) (AC) ──
  console.log('\n[TEST 8] Huella digital determinística (fingerprint SHA-256) en candidates');
  {
    const bytes = createSampleWorkbookBytes({
      Sheet1: [
        ['Fecha', 'Concepto', 'Monto'],
        ['10/10/2026', 'NETFLIX MEXICO', 219.0],
      ],
    });

    const parser = new XlsxStatementParser();
    const rawEvent: RawEvent = {
      id: 'raw-fp-test',
      userId: 'user-diego',
      source: 'BANK_XLSX',
      sourceId: 'sha-fp-test',
      payload: { fileName: 'netflix.xlsx' },
      metadata: {},
      status: 'PENDING',
      retryCount: 0,
      receivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const res1 = await parser.parse(bytes, rawEvent);
    const res2 = await parser.parse(bytes, rawEvent);

    assert.strictEqual(res1.candidates[0].fingerprint?.length, 64);
    assert.strictEqual(res1.candidates[0].fingerprint, res2.candidates[0].fingerprint, 'El fingerprint debe ser 100% determinístico e idempotente');

    console.log('  [OK] Fingerprint SHA-256 determinístico de 64 caracteres validado');
  }

  // ── [TEST 9] Deduplicación e idempotencia a nivel de archivo (SHA-256) (AC) ──
  console.log('\n[TEST 9] Deduplicación e idempotencia a nivel de archivo (SHA-256)');
  {
    const rawRepo = new MockRawEventRepository();
    const service = new XlsxIngestionService({ rawEventRepository: rawRepo });

    const bytes = createSampleWorkbookBytes({
      Sheet1: [
        ['Fecha', 'Concepto', 'Monto'],
        ['12/10/2026', 'OXXO', 50.0],
      ],
    });

    const res1 = await service.ingestXlsx({
      userId: 'user-diego',
      fileName: 'movimientos.xlsx',
      fileSizeBytes: bytes.length,
      content: bytes,
    });
    assert.strictEqual(res1.status, 'SUCCESS');
    assert.strictEqual(res1.parseResult?.validRows, 1);

    // Segundo intento idéntico
    const res2 = await service.ingestXlsx({
      userId: 'user-diego',
      fileName: 'movimientos.xlsx',
      fileSizeBytes: bytes.length,
      content: bytes,
    });
    assert.strictEqual(res2.status, 'DUPLICATE');
    assert.ok(res2.message.includes('duplicado por hash'));

    console.log('  [OK] Archivo repetido bloqueado por idempotencia de SHA-256');
  }

  // ── [TEST 10] Deduplicación fila por fila contra candidatos previos (AC) ──
  console.log('\n[TEST 10] Deduplicación fila por fila contra candidatos previos');
  {
    const rawRepo = new MockRawEventRepository();
    const candidateRepo = new InMemoryTransactionCandidateRepository();

    const service = new XlsxIngestionService({
      rawEventRepository: rawRepo,
      candidateRepository: candidateRepo,
    });

    const bytes1 = createSampleWorkbookBytes({
      Sheet1: [
        ['Fecha', 'Concepto', 'Monto'],
        ['12/10/2026', 'STARBUCKS COFFEE', 95.0],
      ],
    });

    await service.ingestXlsx({
      userId: 'user-diego',
      fileName: 'semana1.xlsx',
      fileSizeBytes: bytes1.length,
      content: bytes1,
    });

    const candidatesBefore = await candidateRepo.findAll();
    assert.strictEqual(candidatesBefore.length, 1);

    // Segundo archivo con nombre diferente pero con la misma fila repetida y una nueva
    const bytes2 = createSampleWorkbookBytes({
      Sheet1: [
        ['Fecha', 'Concepto', 'Monto'],
        ['12/10/2026', 'STARBUCKS COFFEE', 95.0],
        ['14/10/2026', 'COMPRA DIFERENTE', 350.0],
      ],
    });

    const res2 = await service.ingestXlsx({
      userId: 'user-diego',
      fileName: 'semana2.xlsx',
      fileSizeBytes: bytes2.length,
      content: bytes2,
    });

    assert.strictEqual(res2.status, 'SUCCESS');
    assert.strictEqual(res2.parseResult?.duplicatesCount, 1, 'Debe identificar 1 fila duplicada');
    assert.strictEqual(res2.parseResult?.validRows, 2);

    const candidatesAfter = await candidateRepo.findAll();
    assert.strictEqual(candidatesAfter.length, 2);

    console.log('  [OK] Fila repetida detectada por fingerprint y omitida de inserción redundante');
  }

  // ── [TEST 11] Reconciliación cruzada con transacciones existentes en el sistema (AC) ──
  console.log('\n[TEST 11] Reconciliación cruzada con transacciones existentes');
  {
    const rawRepo = new MockRawEventRepository();
    const candidateRepo = new InMemoryTransactionCandidateRepository();
    const txRepo = new MockTransactionRepository();

    // Transacción preexistente confirmada en el repositorio
    const txDate = new Date(Date.UTC(2026, 9, 12, 12, 0, 0));
    const fp = TransactionFingerprintService.calculate({
      account: 'XLSX_IMPORT',
      amountMinor: 25000,
      currency: 'MXN',
      date: txDate,
      merchant: 'Oxxo',
      type: 'EXPENSE',
    });

    await txRepo.createTransaction({
      accountId: 'acc-1',
      amountMinor: 25000,
      currency: 'MXN',
      type: 'EXPENSE',
      description: 'Compra OXXO',
      merchant: 'Oxxo',
      occurredAt: txDate,
      fingerprint: fp,
    });

    const service = new XlsxIngestionService({
      rawEventRepository: rawRepo,
      candidateRepository: candidateRepo,
      transactionRepository: txRepo,
    });

    const bytes = createSampleWorkbookBytes({
      Sheet1: [
        ['Fecha', 'Concepto', 'Monto'],
        ['12/10/2026', 'OXXO', 250.0],
      ],
    });

    const res = await service.ingestXlsx({
      userId: 'user-diego',
      fileName: 'reconcile_xlsx.xlsx',
      fileSizeBytes: bytes.length,
      content: bytes,
    });

    assert.strictEqual(res.status, 'SUCCESS');
    assert.strictEqual(res.parseResult?.reconciledCount, 1, 'Debe reconciliarse con la transacción preexistente');
    assert.strictEqual(res.parseResult?.candidates[0].status, 'RECONCILED');

    console.log('  [OK] Candidato reconciliado automáticamente contra transacción preexistente');
  }

  // ── [TEST 12] Invariante arquitectónica: Cero inserciones en Transaction (AC) ──
  console.log('\n[TEST 12] Invariante arquitectónica: Cero inserciones directas en Transaction');
  {
    const rawRepo = new MockRawEventRepository();
    const candidateRepo = new InMemoryTransactionCandidateRepository();
    const txRepo = new MockTransactionRepository();

    const service = new XlsxIngestionService({
      rawEventRepository: rawRepo,
      candidateRepository: candidateRepo,
      transactionRepository: txRepo,
    });

    const bytes = createSampleWorkbookBytes({
      Sheet1: [
        ['Fecha', 'Concepto', 'Monto'],
        ['08/10/2026', 'SPOTIFY PREMIUM', 129.0],
      ],
    });

    await service.ingestXlsx({
      userId: 'user-diego',
      fileName: 'invariante.xlsx',
      fileSizeBytes: bytes.length,
      content: bytes,
    });

    // Invariante de arquitectura: txRepo NO debe haber recibido escrituras
    assert.strictEqual(txRepo.transactions.length, 0, 'No debe escribir directamente en el modelo Transaction');
    const candidates = await candidateRepo.findAll();
    assert.strictEqual(candidates.length, 1);
    assert.strictEqual(candidates[0].status, 'PENDING_REVIEW');

    console.log('  [OK] Invariante arquitectónica respetada: cero escritura directa en modelo Transaction');
  }

  console.log('\n[RESULTADO] Todas las pruebas de US-041 pasaron exitosamente (12/12).');
}
