/**
 * Pruebas unitarias para US-042: Manual Column Mapping
 *
 * Criterios de Aceptación:
 * 1. Mapeo de Date, Amount, Description, Merchant y Type.
 * 2. Preview en tiempo real con validación y formateo.
 * 3. Guardar y aplicar mapping (plantillas reutilizables y conversión a parsers).
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

import { ColumnMappingService } from '../../src/domain/services/mapping/ColumnMappingService';
import { AsyncStorageMappingTemplateRepository } from '../../src/infrastructure/database/AsyncStorageMappingTemplateRepository';
import { CsvIngestionService } from '../../src/domain/services/csv/CsvIngestionService';
import { XlsxIngestionService } from '../../src/domain/services/xlsx/XlsxIngestionService';
import type { RawEvent, CreateRawEventDTO, UpdateRawEventStatusDTO, RawEventSource } from '../../src/domain/models/RawEvent';
import type { IRawEventRepository, RawEventFilter } from '../../src/domain/repositories/IRawEventRepository';
import type { ITransactionCandidateRepository, CandidateFilter } from '../../src/domain/repositories/ITransactionCandidateRepository';
import type { TransactionCandidate } from '../../src/domain/models/TransactionCandidate';

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

class MockCandidateRepository implements ITransactionCandidateRepository {
  public candidates: TransactionCandidate[] = [];

  async save(candidate: TransactionCandidate): Promise<TransactionCandidate> {
    this.candidates.push({ ...candidate });
    return candidate;
  }

  async findById(id: string): Promise<TransactionCandidate | null> {
    return this.candidates.find((c) => c.id === id) || null;
  }

  async findByRawEventId(rawEventId: string): Promise<TransactionCandidate | null> {
    return this.candidates.find((c) => c.rawEventId === rawEventId) || null;
  }

  async findByFingerprint(fingerprint: string): Promise<TransactionCandidate | null> {
    return this.candidates.find((c) => c.fingerprint === fingerprint) || null;
  }

  async findAll(_filter?: CandidateFilter): Promise<TransactionCandidate[]> {
    return [...this.candidates];
  }

  async updateStatus(id: string, status: any): Promise<TransactionCandidate> {
    const c = this.candidates.find((item) => item.id === id);
    if (!c) throw new Error('Not found');
    c.status = status;
    return c;
  }

  async count(_filter?: CandidateFilter): Promise<number> {
    return this.candidates.length;
  }

  async delete(id: string): Promise<void> {
    this.candidates = this.candidates.filter((c) => c.id !== id);
  }
}

export async function runManualColumnMappingTests() {
  console.log('[TEST] Iniciando pruebas de US-042: Manual Column Mapping...\n');

  const mappingService = new ColumnMappingService();

  // ── [TEST 1] Validación de configuración incompleta (campos obligatorios) ──
  console.log('[TEST 1] Detección estricta de campos obligatorios faltantes');
  {
    // Falta fecha, monto y descripción
    const emptyResult = mappingService.validateMapping({
      amountMode: 'SINGLE',
    });
    assert.strictEqual(emptyResult.isValid, false);
    assert.ok(emptyResult.missingFields.includes('dateColumn'));
    assert.ok(emptyResult.missingFields.includes('amountColumn'));
    assert.ok(emptyResult.missingFields.includes('descriptionColumn'));

    // Falta monto en modo SINGLE
    const missingAmount = mappingService.validateMapping({
      amountMode: 'SINGLE',
      dateColumn: 'Fecha',
      descriptionColumn: 'Concepto',
    });
    assert.strictEqual(missingAmount.isValid, false);
    assert.ok(missingAmount.missingFields.includes('amountColumn'));

    // Falta cargo y abono en modo SPLIT
    const missingSplit = mappingService.validateMapping({
      amountMode: 'SPLIT',
      dateColumn: 'Fecha',
      descriptionColumn: 'Concepto',
    });
    assert.strictEqual(missingSplit.isValid, false);
    assert.ok(missingSplit.missingFields.includes('chargeColumn'));

    console.log('  [OK] Validaciones de campos obligatorios verificadas');
  }

  // ── [TEST 2] Validación exitosa de configuración en Modo SINGLE ──
  console.log('\n[TEST 2] Validación exitosa de configuración en Modo SINGLE (Monto Único)');
  {
    const validSingle = mappingService.validateMapping({
      amountMode: 'SINGLE',
      dateColumn: 'F_OPERACION',
      descriptionColumn: 'DETALLE',
      amountColumn: 'IMPORTE_NETO',
    });
    assert.strictEqual(validSingle.isValid, true);
    assert.strictEqual(validSingle.errors.length, 0);

    console.log('  [OK] Modo SINGLE validado exitosamente');
  }

  // ── [TEST 3] Validación exitosa de configuración en Modo SPLIT (Cargos y Abonos) ──
  console.log('\n[TEST 3] Validación exitosa de configuración en Modo SPLIT (Cargos y Abonos)');
  {
    const validSplit = mappingService.validateMapping({
      amountMode: 'SPLIT',
      dateColumn: 'FECHA',
      descriptionColumn: 'DESCRIPCION',
      chargeColumn: 'RETIROS',
      creditColumn: 'DEPOSITOS',
    });
    assert.strictEqual(validSplit.isValid, true);
    assert.strictEqual(validSplit.errors.length, 0);

    console.log('  [OK] Modo SPLIT validado exitosamente');
  }

  // ── [TEST 4] Generación de Previsualización (Preview) en tiempo real ──
  console.log('\n[TEST 4] Generación de previsualización en tiempo real con filas procesadas');
  {
    const headers = ['TxDate', 'Concept', 'Value'];
    const sampleRows = [
      ['12/10/2026', 'Starbucks Coffee', '95.50'],
      ['13/10/2026', 'Uber Trip Polanco', '180.00'],
      ['14/10/2026', 'Deposito Nomina', '-15000.00'],
    ];

    const preview = mappingService.generatePreview(headers, sampleRows, {
      amountMode: 'SINGLE',
      dateColumn: 'TxDate',
      descriptionColumn: 'Concept',
      amountColumn: 'Value',
      defaultCurrency: 'MXN',
    });

    assert.strictEqual(preview.isValid, true);
    assert.strictEqual(preview.totalPreviewRows, 3);
    assert.strictEqual(preview.validRowsCount, 3);
    assert.strictEqual(preview.invalidRowsCount, 0);

    // Verificación de fila 1
    assert.strictEqual(preview.previewRows[0].formattedDate, '2026-10-12');
    assert.strictEqual(preview.previewRows[0].amount, 95.5);
    assert.strictEqual(preview.previewRows[0].type, 'EXPENSE');
    assert.strictEqual(preview.previewRows[0].merchant, 'Starbucks');

    // Verificación de fila 3 (depósito nómina)
    assert.strictEqual(preview.previewRows[2].amount, 15000);
    assert.strictEqual(preview.previewRows[2].type, 'INCOME');

    console.log('  [OK] Preview en tiempo real generado y tipos/montos interpretados');
  }

  // ── [TEST 5] Detección de errores y filas corruptas en la previsualización ──
  console.log('\n[TEST 5] Detección de filas corruptas o importes no numéricos en preview');
  {
    const headers = ['Fecha', 'Concepto', 'Monto'];
    const sampleRows = [
      ['12/10/2026', 'Compra Válida', '250.00'],
      ['FECHA_INVALIDA', 'Compra Sin Fecha', '100.00'],
      ['14/10/2026', 'Compra Monto Nulo', 'TEXTO_NO_NUMERICO'],
    ];

    const preview = mappingService.generatePreview(headers, sampleRows, {
      amountMode: 'SINGLE',
      dateColumn: 'Fecha',
      descriptionColumn: 'Concepto',
      amountColumn: 'Monto',
    });

    assert.strictEqual(preview.isValid, false);
    assert.strictEqual(preview.validRowsCount, 1);
    assert.strictEqual(preview.invalidRowsCount, 2);

    assert.strictEqual(preview.previewRows[0].isValid, true);
    assert.strictEqual(preview.previewRows[1].isValid, false);
    assert.ok(preview.previewRows[1].validationError?.includes('fecha'));
    assert.strictEqual(preview.previewRows[2].isValid, false);
    assert.ok(preview.previewRows[2].validationError?.includes('Importe'));

    console.log('  [OK] Errores en filas de muestra identificados y notificados');
  }

  // ── [TEST 6] Asignación explícita de columna de Comercio (Merchant) ──
  console.log('\n[TEST 6] Mapeo explícito de Comercio vs derivación de Descripción');
  {
    const headers = ['Fecha', 'DescripcionExtensa', 'NombreComercio', 'Monto'];
    const sampleRows = [
      ['12/10/2026', 'COMPRA EN LINEA AUT 12344 REF 990', 'Amazon Mexico', '599.00'],
    ];

    const preview = mappingService.generatePreview(headers, sampleRows, {
      amountMode: 'SINGLE',
      dateColumn: 'Fecha',
      descriptionColumn: 'DescripcionExtensa',
      merchantColumn: 'NombreComercio',
      amountColumn: 'Monto',
    });

    assert.strictEqual(preview.previewRows[0].description, 'COMPRA EN LINEA AUT 12344 REF 990');
    assert.strictEqual(preview.previewRows[0].merchant, 'Amazon');

    console.log('  [OK] Comercio separado de descripción mapeado y normalizado');
  }

  // ── [TEST 7] Asignación de columna de Tipo (Type) y Referencia ──
  console.log('\n[TEST 7] Mapeo de columna de Tipo (Cargo/Abono) y Folio de Referencia');
  {
    const headers = ['Fecha', 'Concepto', 'Importe', 'Naturaleza', 'Folio'];
    const sampleRows = [
      ['12/10/2026', 'Transferencia Interbancaria', '1200.00', 'TRASPASO', 'SPEI-87654'],
    ];

    const preview = mappingService.generatePreview(headers, sampleRows, {
      amountMode: 'SINGLE',
      dateColumn: 'Fecha',
      descriptionColumn: 'Concepto',
      amountColumn: 'Importe',
      typeColumn: 'Naturaleza',
      referenceColumn: 'Folio',
    });

    assert.strictEqual(preview.previewRows[0].type, 'TRANSFER');
    assert.strictEqual(preview.previewRows[0].reference, 'SPEI-87654');

    console.log('  [OK] Columna de tipo y folio incorporados en preview');
  }

  // ── [TEST 8] Conversión directa a CsvColumnMapping y XlsxColumnMapping ──
  console.log('\n[TEST 8] Transformación a contratos de CsvColumnMapping y XlsxColumnMapping');
  {
    const config = {
      amountMode: 'SPLIT' as const,
      dateColumn: 'Fecha_Tx',
      descriptionColumn: 'Desc_Tx',
      chargeColumn: 'Cargos',
      creditColumn: 'Abonos',
      currencyColumn: 'Moneda',
      referenceColumn: 'Folio_Autorizacion',
    };

    const csvMapping = mappingService.toCsvMapping(config);
    assert.strictEqual(csvMapping.dateColumn, 'Fecha_Tx');
    assert.strictEqual(csvMapping.descriptionColumn, 'Desc_Tx');
    assert.strictEqual(csvMapping.chargeColumn, 'Cargos');
    assert.strictEqual(csvMapping.creditColumn, 'Abonos');
    assert.strictEqual(csvMapping.currencyColumn, 'Moneda');
    assert.strictEqual(csvMapping.referenceColumn, 'Folio_Autorizacion');

    const xlsxMapping = mappingService.toXlsxMapping(config);
    assert.strictEqual(xlsxMapping.dateColumn, 'Fecha_Tx');
    assert.strictEqual(xlsxMapping.chargeColumn, 'Cargos');
    assert.strictEqual(xlsxMapping.creditColumn, 'Abonos');

    console.log('  [OK] Conversión bidireccional a contratos de parser completada');
  }

  // ── [TEST 9] Guardado, recuperación y eliminación de plantillas (Templates) ──
  console.log('\n[TEST 9] Persistencia de plantillas reutilizables en repositorio');
  {
    const repo = new AsyncStorageMappingTemplateRepository();

    const templateSaved = await repo.save({
      userId: 'user-diego',
      name: 'Santander Tarjeta Nómina',
      headers: ['FECHA', 'CONCEPTO', 'CARGOS', 'ABONOS'],
      mapping: {
        amountMode: 'SPLIT',
        dateColumn: 'FECHA',
        descriptionColumn: 'CONCEPTO',
        chargeColumn: 'CARGOS',
        creditColumn: 'ABONOS',
      },
    });

    assert.ok(templateSaved.id.length > 0);
    assert.strictEqual(templateSaved.name, 'Santander Tarjeta Nómina');

    const found = await repo.findById(templateSaved.id);
    assert.ok(found !== null);
    assert.strictEqual(found?.name, 'Santander Tarjeta Nómina');

    const all = await repo.findAll('user-diego');
    assert.ok(all.length >= 1);

    const deleted = await repo.delete(templateSaved.id);
    assert.strictEqual(deleted, true);

    const afterDelete = await repo.findById(templateSaved.id);
    assert.strictEqual(afterDelete, null);

    console.log('  [OK] Operaciones CRUD de plantillas de mapeo verificadas');
  }

  // ── [TEST 10] Búsqueda inteligente y sugerencia de la mejor plantilla ──
  console.log('\n[TEST 10] Sugerencia automática de plantilla guardada por coincidencia de headers');
  {
    const templates = [
      {
        id: 'tpl-1',
        name: 'BBVA Movimientos',
        headers: ['FECHA', 'CONCEPTO', 'CARGO', 'ABONO', 'SALDO'],
        mapping: {
          amountMode: 'SPLIT' as const,
          dateColumn: 'FECHA',
          descriptionColumn: 'CONCEPTO',
          chargeColumn: 'CARGO',
          creditColumn: 'ABONO',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'tpl-2',
        name: 'Banorte Extracto',
        headers: ['Fecha Operación', 'Descripción Detallada', 'Importe'],
        mapping: {
          amountMode: 'SINGLE' as const,
          dateColumn: 'Fecha Operación',
          descriptionColumn: 'Descripción Detallada',
          amountColumn: 'Importe',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    // Archivo recibido con headers de BBVA
    const currentHeaders = ['FECHA', 'CONCEPTO', 'CARGO', 'ABONO', 'SALDO', 'FOLIO'];
    const best = mappingService.findBestTemplate(currentHeaders, templates);

    assert.ok(best !== null);
    assert.strictEqual(best?.id, 'tpl-1');
    assert.strictEqual(best?.name, 'BBVA Movimientos');

    console.log('  [OK] Plantilla BBVA sugerida automáticamente con 80%+ de similitud');
  }

  // ── [TEST 11] Integración de extremo a extremo con CsvIngestionService ──
  console.log('\n[TEST 11] Ingestión de CSV con aplicación de mapeo manual');
  {
    const rawRepo = new MockRawEventRepository();
    const candidateRepo = new MockCandidateRepository();
    const service = new CsvIngestionService({
      rawEventRepository: rawRepo,
      candidateRepository: candidateRepo,
    });

    // CSV con nombres de columnas no convencionales
    const customCsv = `D_Operacion;Beneficiario_Pago;Gasto_Efectuado;Ingreso_Efectuado
2026-10-12;LIVERPOOL POLANCO;3200.00;
2026-10-15;DEPOSITO NOMINA;;18000.00`;

    const manualConfig = {
      amountMode: 'SPLIT' as const,
      dateColumn: 'D_Operacion',
      descriptionColumn: 'Beneficiario_Pago',
      chargeColumn: 'Gasto_Efectuado',
      creditColumn: 'Ingreso_Efectuado',
    };

    const res = await service.ingestCsv({
      userId: 'user-diego',
      fileName: 'extracto_personalizado.csv',
      fileSizeBytes: customCsv.length,
      content: customCsv,
      options: {
        mapping: mappingService.toCsvMapping(manualConfig),
      },
    });

    assert.strictEqual(res.status, 'SUCCESS');
    assert.strictEqual(res.parseResult?.validRows, 2);

    const candidates = await candidateRepo.findAll();
    assert.strictEqual(candidates.length, 2);
    assert.strictEqual(candidates[0].amount, 3200);
    assert.strictEqual(candidates[0].type, 'EXPENSE');
    assert.strictEqual(candidates[1].amount, 18000);
    assert.strictEqual(candidates[1].type, 'INCOME');

    console.log('  [OK] Ingestión CSV exitosa aplicando CsvColumnMapping manual');
  }

  // ── [TEST 12] Integración de extremo a extremo con XlsxIngestionService ──
  console.log('\n[TEST 12] Ingestión de XLSX con aplicación de mapeo manual');
  {
    const rawRepo = new MockRawEventRepository();
    const candidateRepo = new MockCandidateRepository();
    const service = new XlsxIngestionService({
      rawEventRepository: rawRepo,
      candidateRepository: candidateRepo,
    });

    // Crear libro XLSX con nombres de columnas arbitrarios
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['Dia_Tx', 'Destinatario', 'Debito', 'Credito'],
      ['12/10/2026', 'OXXO CONDESA', 150.0, 0],
      ['13/10/2026', 'DEVOLUCION COMPRA', 0, 500.0],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Datos');
    const u8 = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));

    const manualConfig = {
      amountMode: 'SPLIT' as const,
      dateColumn: 'Dia_Tx',
      descriptionColumn: 'Destinatario',
      chargeColumn: 'Debito',
      creditColumn: 'Credito',
    };

    const res = await service.ingestXlsx({
      userId: 'user-diego',
      fileName: 'libro_manual.xlsx',
      fileSizeBytes: u8.length,
      content: u8,
      options: {
        mapping: mappingService.toXlsxMapping(manualConfig),
      },
    });

    assert.strictEqual(res.status, 'SUCCESS');
    assert.strictEqual(res.parseResult?.validRows, 2);

    const candidates = await candidateRepo.findAll();
    assert.strictEqual(candidates.length, 2);
    assert.strictEqual(candidates[0].merchant, 'Oxxo');
    assert.strictEqual(candidates[0].type, 'EXPENSE');
    assert.strictEqual(candidates[1].type, 'INCOME');

    console.log('  [OK] Ingestión XLSX exitosa aplicando XlsxColumnMapping manual');
  }

  console.log('\n[RESULTADO] Todas las pruebas de US-042 pasaron exitosamente (12/12).');
}
