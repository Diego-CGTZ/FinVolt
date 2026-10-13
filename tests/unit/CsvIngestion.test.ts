/**
 * Pruebas unitarias para US-040: Ingestión de Movimientos Financieros desde CSV
 *
 * Criterios de Aceptación:
 * 1. Archivo validado (MIME, extensión, tamaño, delimitador, encoding/BOM).
 * 2. Columnas detectadas (mapeo inteligente automático y manual).
 * 3. Filas convertidas a candidates (TransactionCandidate con fingerprint determinístico).
 * 4. Deduplicación y reconciliación aplicadas (idempotencia de archivo y huellas).
 *
 * Invariante arquitectónica:
 * Cero inserción directa en el modelo Transaction.
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
assert.ok = (condition: unknown, msg?: string): asserts condition => {
  if (!condition) throw new Error(msg || 'Expected truthy');
};

import {
  CsvFileValidator,
  CsvColumnDetector,
  CsvStatementParser,
  CsvIngestionService,
} from '../../src/domain/services/csv';
import { TransactionFingerprintService } from '../../src/domain/services/fingerprint';
import type { RawEvent, CreateRawEventDTO, UpdateRawEventStatusDTO, RawEventSource } from '../../src/domain/models/RawEvent';
import type { IRawEventRepository, RawEventFilter } from '../../src/domain/repositories/IRawEventRepository';
import type { ITransactionRepository, TransactionFilters, PaginationOptions } from '../../src/domain/repositories/ITransactionRepository';
import type { Transaction, CreateTransactionInput, UpdateTransactionInput } from '../../src/domain/models/Transaction';
import { InMemoryTransactionCandidateRepository } from '../../src/infrastructure/database/InMemoryTransactionCandidateRepository';

// Mock de IRawEventRepository para pruebas de CSV
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

export async function runCsvIngestionTests() {
  console.log('[TEST] Iniciando pruebas de US-040: CSV Ingestion...\n');

  // ── [TEST 1] Validación de archivo: extensión, MIME, tamaño y sanitización (AC) ──
  console.log('[TEST 1] Validación exhaustiva de archivo CSV (AC)');
  {
    // Rechazo por extensión inválida
    const invalidExt = CsvFileValidator.validate({
      fileName: 'movimientos.xlsx',
      fileSizeBytes: 1024,
      content: 'Fecha,Monto,Concepto\n2026-10-12,100,OXXO',
    });
    assert.strictEqual(invalidExt.isValid, false);
    assert.ok(invalidExt.errors.some((e) => e.includes('extensión .csv')));

    // Rechazo por archivo vacío (0 bytes)
    const emptyFile = CsvFileValidator.validate({
      fileName: 'extract.csv',
      fileSizeBytes: 0,
      content: '',
    });
    assert.strictEqual(emptyFile.isValid, false);
    assert.ok(emptyFile.errors.some((e) => e.includes('vacío')));

    // Rechazo por tamaño excesivo (> 10 MB)
    const largeFile = CsvFileValidator.validate({
      fileName: 'pesado.csv',
      fileSizeBytes: 15 * 1024 * 1024,
      content: 'col1,col2\nval1,val2',
    });
    assert.strictEqual(largeFile.isValid, false);
    assert.ok(largeFile.errors.some((e) => e.includes('excede el tamaño máximo')));

    // Sanitización de path traversal
    const sanitized = CsvFileValidator.sanitizeFileName('../../etc/passwd.csv');
    assert.strictEqual(sanitized, 'passwd.csv');
    assert.ok(!sanitized.includes('/'));
    assert.ok(!sanitized.includes('..'));

    console.log('  [OK] Reglas de validación, tamaño y sanitización de CSV validadas');
  }

  // ── [TEST 2] Detección de delimitadores y manejo de BOM UTF-8 (AC) ──
  console.log('\n[TEST 2] Detección automática de delimitadores (, ; \\t |) y remoción de BOM');
  {
    const csvComma = 'Fecha,Concepto,Monto\n12/10/2026,OXXO,$150.00';
    const csvSemicolon = 'Fecha;Concepto;Monto\n12/10/2026;OXXO;$150.00';
    const csvTab = 'Fecha\tConcepto\tMonto\n12/10/2026\tOXXO\t$150.00';
    const csvPipe = 'Fecha|Concepto|Monto\n12/10/2026|OXXO|$150.00';

    assert.strictEqual(CsvFileValidator.detectDelimiter(csvComma), ',');
    assert.strictEqual(CsvFileValidator.detectDelimiter(csvSemicolon), ';');
    assert.strictEqual(CsvFileValidator.detectDelimiter(csvTab), '\t');
    assert.strictEqual(CsvFileValidator.detectDelimiter(csvPipe), '|');

    // Manejo de Byte Order Mark (\uFEFF)
    const bomCsv = '\uFEFFFecha,Concepto,Monto\n12/10/2026,OXXO,100';
    const normalized = CsvFileValidator.normalizeContentToText(bomCsv);
    assert.strictEqual(normalized.charCodeAt(0), 'F'.charCodeAt(0));
    assert.ok(!normalized.startsWith('\uFEFF'));

    console.log('  [OK] Delimitadores identificados y BOM UTF-8 eliminado con éxito');
  }

  // ── [TEST 3] Detección automática de columnas (Fecha, Concepto, Monto) (AC) ──
  console.log('\n[TEST 3] Mapeo inteligente de columnas con nombres variados (AC)');
  {
    const headers1 = ['FECHA DE OPERACIÓN', 'DETALLE DEL MOVIMIENTO', 'IMPORTE MXN', 'FOLIO'];
    const mapping1 = CsvColumnDetector.detectMapping(headers1);
    assert.strictEqual(mapping1.dateColumn, 'FECHA DE OPERACIÓN');
    assert.strictEqual(mapping1.descriptionColumn, 'DETALLE DEL MOVIMIENTO');
    assert.strictEqual(mapping1.amountColumn, 'IMPORTE MXN');
    assert.strictEqual(mapping1.referenceColumn, 'FOLIO');

    // Detección de columnas separadas de Cargo y Abono (Debe / Haber)
    const headers2 = ['Date', 'Description', 'Retiros', 'Depositos', 'Saldo'];
    const mapping2 = CsvColumnDetector.detectMapping(headers2);
    assert.strictEqual(mapping2.dateColumn, 'Date');
    assert.strictEqual(mapping2.descriptionColumn, 'Description');
    assert.strictEqual(mapping2.chargeColumn, 'Retiros');
    assert.strictEqual(mapping2.creditColumn, 'Depositos');

    console.log('  [OK] Mapeo automático de columnas contables y bancarias validado');
  }

  // ── [TEST 4] Parser RFC 4180 con comillas dobles y comas internas ──
  console.log('\n[TEST 4] Parser RFC 4180: manejo de comas y comillas escapadas');
  {
    const complexCsv = `Fecha,Concepto,Monto
12/10/2026,"OXXO, S.A. DE C.V.",150.00
13/10/2026,"TIENDA ""LA ESPECIAL""",350.50
14/10/2026,UBER TRIP,120.00`;

    const rawEvent: RawEvent = {
      id: 'raw-csv-rfc',
      userId: 'test-user',
      source: 'BANK_CSV',
      sourceId: 'sha256-rfc',
      payload: {},
      metadata: {},
      status: 'PENDING',
      retryCount: 0,
      receivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const parser = new CsvStatementParser();
    const result = await parser.parse(complexCsv, rawEvent);

    assert.strictEqual(result.candidates.length, 3);
    assert.ok(result.candidates[0].merchantRaw?.includes('OXXO, S.A. DE C.V.'));
    assert.ok(result.candidates[1].merchantRaw?.includes('TIENDA "LA ESPECIAL"'));
    assert.strictEqual(result.candidates[0].amount, 150);

    console.log('  [OK] Celdas con comas y comillas dobles RFC 4180 preservadas');
  }

  // ── [TEST 5] Generación canónica de TransactionCandidate (AC) ──
  console.log('\n[TEST 5] Generación canónica de TransactionCandidate con campos completos');
  {
    const csv = `Fecha,Concepto,Monto,Tipo
12/10/2026,LIVERPOOL POLANCO,"$3,250.00",CARGO
15/10/2026,SPEI RECIBIDO NOMINA,"$18,000.00",ABONO`;

    const rawEvent: RawEvent = {
      id: 'raw-csv-cand',
      userId: 'user-diego',
      source: 'BANK_CSV',
      sourceId: 'sha256-cand',
      payload: { fileName: 'extract.csv' },
      metadata: {},
      status: 'PENDING',
      retryCount: 0,
      receivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const parser = new CsvStatementParser();
    const result = await parser.parse(csv, rawEvent);

    assert.strictEqual(result.candidates.length, 2);

    const c1 = result.candidates[0];
    assert.strictEqual(c1.userId, 'user-diego');
    assert.strictEqual(c1.rawEventId, 'raw-csv-cand');
    assert.strictEqual(c1.source, 'BANK_CSV');
    assert.strictEqual(c1.amount, 3250);
    assert.strictEqual(c1.amountMinor, 325000);
    assert.strictEqual(c1.type, 'EXPENSE');
    assert.strictEqual(c1.currency, 'MXN');
    assert.strictEqual(c1.status, 'PENDING_REVIEW');
    assert.ok(c1.merchant !== null);

    const c2 = result.candidates[1];
    assert.strictEqual(c2.amount, 18000);
    assert.strictEqual(c2.amountMinor, 1800000);
    assert.strictEqual(c2.type, 'INCOME');

    console.log('  [OK] Candidatos generados fielmente con importes en centavos y tipos contables');
  }

  // ── [TEST 6] Huella determinística SHA-256 (fingerprint) (US-025) (AC) ──
  console.log('\n[TEST 6] Huella digital determinística (fingerprint SHA-256) en candidates');
  {
    const csv = `Fecha,Concepto,Monto\n10/10/2026,AMAZON MEXICO,599.00`;

    const rawEvent: RawEvent = {
      id: 'raw-csv-fp',
      userId: 'user-diego',
      source: 'BANK_CSV',
      sourceId: 'sha256-fp',
      payload: {},
      metadata: {},
      status: 'PENDING',
      retryCount: 0,
      receivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const parser = new CsvStatementParser();
    const res1 = await parser.parse(csv, rawEvent);
    const cand1 = res1.candidates[0];

    assert.ok(cand1.fingerprint !== null && cand1.fingerprint !== undefined);
    assert.ok(TransactionFingerprintService.isValidFingerprint(cand1.fingerprint));

    // Reprocesar el mismo evento debe generar exactamente el mismo fingerprint
    const res2 = await parser.parse(csv, rawEvent);
    const cand2 = res2.candidates[0];

    assert.strictEqual(cand1.fingerprint, cand2.fingerprint);
    console.log('  [OK] Fingerprint determinístico de 64 caracteres validado');
  }

  // ── [TEST 7] Idempotencia de archivo por hash SHA-256 (AC) ──
  console.log('\n[TEST 7] Deduplicación e idempotencia a nivel de archivo (SHA-256)');
  {
    const rawRepo = new MockRawEventRepository();
    const service = new CsvIngestionService({ rawEventRepository: rawRepo });

    const csvContent = 'Fecha,Concepto,Monto\n12/10/2026,FARMACIA DEL AHORRO,230.00';

    // Primer intento
    const res1 = await service.ingestCsv({
      userId: 'user-diego',
      fileName: 'movimientos_octubre.csv',
      fileSizeBytes: csvContent.length,
      content: csvContent,
    });
    assert.strictEqual(res1.status, 'SUCCESS');
    assert.strictEqual(res1.parseResult?.validRows, 1);

    // Segundo intento con exactamente el mismo archivo
    const res2 = await service.ingestCsv({
      userId: 'user-diego',
      fileName: 'movimientos_octubre.csv',
      fileSizeBytes: csvContent.length,
      content: csvContent,
    });
    assert.strictEqual(res2.status, 'DUPLICATE');
    assert.ok(res2.message.includes('duplicado por hash'));

    console.log('  [OK] Archivo repetido bloqueado por idempotencia de SHA-256');
  }

  // ── [TEST 8] Deduplicación fila por fila contra candidatos existentes (AC) ──
  console.log('\n[TEST 8] Deduplicación fila por fila contra candidatos previos');
  {
    const rawRepo = new MockRawEventRepository();
    const candidateRepo = new InMemoryTransactionCandidateRepository();

    const service = new CsvIngestionService({
      rawEventRepository: rawRepo,
      candidateRepository: candidateRepo,
    });

    const csv1 = `Fecha,Concepto,Monto\n12/10/2026,STARBUCKS COFFEE,95.00`;
    await service.ingestCsv({
      userId: 'user-diego',
      fileName: 'semana1.csv',
      fileSizeBytes: csv1.length,
      content: csv1,
    });

    const candidatesBefore = await candidateRepo.findAll();
    assert.strictEqual(candidatesBefore.length, 1);

    // Segundo archivo diferente pero con la misma transacción repetida
    const csv2 = `Fecha,Concepto,Monto\n12/10/2026,STARBUCKS COFFEE,95.00\n13/10/2026,NUEVA COMPRA,120.00`;
    const res2 = await service.ingestCsv({
      userId: 'user-diego',
      fileName: 'semana2.csv',
      fileSizeBytes: csv2.length,
      content: csv2,
    });

    assert.strictEqual(res2.status, 'SUCCESS');
    assert.strictEqual(res2.parseResult?.duplicatesCount, 1, 'Debe identificar 1 fila duplicada');
    assert.strictEqual(res2.parseResult?.validRows, 2);

    const candidatesAfter = await candidateRepo.findAll();
    // Solo la nueva compra debe haberse insertado como candidato activo en el repositorio
    assert.strictEqual(candidatesAfter.length, 2);

    console.log('  [OK] Fila repetida detectada por fingerprint y omitida de inserción redundante');
  }

  // ── [TEST 9] Reconciliación con transacciones existentes en el sistema (AC) ──
  console.log('\n[TEST 9] Reconciliación cruzada con transacciones existentes');
  {
    const rawRepo = new MockRawEventRepository();
    const candidateRepo = new InMemoryTransactionCandidateRepository();
    const txRepo = new MockTransactionRepository();

    // Transacción preexistente (ej: cargada por push notification previamente)
    const txDate = new Date(Date.UTC(2026, 9, 12, 12, 0, 0));
    const fp = TransactionFingerprintService.calculate({
      account: 'CSV_IMPORT',
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

    const service = new CsvIngestionService({
      rawEventRepository: rawRepo,
      candidateRepository: candidateRepo,
      transactionRepository: txRepo,
    });

    const csv = `Fecha,Concepto,Monto\n12/10/2026,OXXO,250.00`;
    const res = await service.ingestCsv({
      userId: 'user-diego',
      fileName: 'reconcile_test.csv',
      fileSizeBytes: csv.length,
      content: csv,
    });

    assert.strictEqual(res.status, 'SUCCESS');
    assert.strictEqual(res.parseResult?.reconciledCount, 1, 'Debe reconciliarse con la transacción existente');
    assert.strictEqual(res.parseResult?.candidates[0].status, 'RECONCILED');

    console.log('  [OK] Candidato reconciliado automáticamente contra transacción preexistente');
  }

  // ── [TEST 10] Conservación estricta de la fuente y RawEvent inmutable (AC) ──
  console.log('\n[TEST 10] Conservación íntegra de la fuente de origen (RawEvent)');
  {
    const rawRepo = new MockRawEventRepository();
    const service = new CsvIngestionService({ rawEventRepository: rawRepo });

    const csvContent = 'Fecha,Concepto,Monto\n05/10/2026,UBER EATS,189.00';
    const res = await service.ingestCsv({
      userId: 'user-diego',
      fileName: 'fuente_inmutable.csv',
      fileSizeBytes: csvContent.length,
      content: csvContent,
    });

    assert.strictEqual(res.status, 'SUCCESS');
    assert.ok(res.rawEvent !== null);
    assert.strictEqual(res.rawEvent.source, 'BANK_CSV');
    assert.strictEqual(res.rawEvent.rawText, csvContent);
    assert.strictEqual((res.rawEvent.payload as any).fileName, 'fuente_inmutable.csv');

    console.log('  [OK] Evento crudo preservado con payload y texto intactos');
  }

  // ── [TEST 11] Invariante arquitectónica: Cero inserciones en Transaction (AC) ──
  console.log('\n[TEST 11] Invariante arquitectónica: Cero inserciones directas en Transaction');
  {
    const rawRepo = new MockRawEventRepository();
    const candidateRepo = new InMemoryTransactionCandidateRepository();
    const txRepo = new MockTransactionRepository();

    const service = new CsvIngestionService({
      rawEventRepository: rawRepo,
      candidateRepository: candidateRepo,
      transactionRepository: txRepo,
    });

    const csvContent = 'Fecha,Concepto,Monto\n08/10/2026,NETFLIX,219.00';
    await service.ingestCsv({
      userId: 'user-diego',
      fileName: 'cero_tx.csv',
      fileSizeBytes: csvContent.length,
      content: csvContent,
    });

    // Invariante de arquitectura: txRepo NO debe haber recibido inserciones
    assert.strictEqual(txRepo.transactions.length, 0, 'No debe escribir en el modelo Transaction');
    // En cambio, debe haber generado un TransactionCandidate
    const candidates = await candidateRepo.findAll();
    assert.strictEqual(candidates.length, 1);
    assert.strictEqual(candidates[0].status, 'PENDING_REVIEW');

    console.log('  [OK] Invariante respetada: cero escritura directa en modelo Transaction');
  }

  // ── [TEST 12] Orquestación de extremo a extremo con mapeo manual sobrescrito ──
  console.log('\n[TEST 12] Orquestación de extremo a extremo con mapeo manual');
  {
    const rawRepo = new MockRawEventRepository();
    const candidateRepo = new InMemoryTransactionCandidateRepository();
    const service = new CsvIngestionService({
      rawEventRepository: rawRepo,
      candidateRepository: candidateRepo,
    });

    // CSV con columnas en orden atípico o nombres extranjeros
    const customCsv = `TransactionDay;Beneficiary;Outgoing;Incoming
2026-10-14;Spotify Mexico;129.00;
2026-10-15;Transferencia Externa;;5000.00`;

    const res = await service.ingestCsv({
      userId: 'user-diego',
      fileName: 'custom_export.csv',
      fileSizeBytes: customCsv.length,
      content: customCsv,
      options: {
        mapping: {
          dateColumn: 'TransactionDay',
          descriptionColumn: 'Beneficiary',
          chargeColumn: 'Outgoing',
          creditColumn: 'Incoming',
        },
      },
    });

    assert.strictEqual(res.status, 'SUCCESS');
    assert.strictEqual(res.parseResult?.validRows, 2);

    const candidates = res.parseResult!.candidates;
    assert.strictEqual(candidates[0].type, 'EXPENSE');
    assert.strictEqual(candidates[0].amount, 129);
    assert.strictEqual(candidates[1].type, 'INCOME');
    assert.strictEqual(candidates[1].amount, 5000);

    console.log('  [OK] Ingestión de extremo a extremo con columnas mapeadas exitosa');
  }

  console.log('\n[RESULTADO] Todas las pruebas de US-040 pasaron exitosamente (12/12).');
}
