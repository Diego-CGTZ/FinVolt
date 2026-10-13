/**
 * Pruebas unitarias para US-039: Parser de Estados de Cuenta Bancarios en PDF
 *
 * Criterios de Aceptación:
 * 1. Parser específico por banco (BBVA, Santander, Banorte, Nu, AMEX, Genérico).
 * 2. Extrae fecha, monto, descripción y tipo contable.
 * 3. Genera candidates (TransactionCandidate con fingerprint y confianza).
 * 4. Conserva fuente (RawEvent y source = 'BANK_PDF').
 *
 * Invariante arquitectónica:
 * Cero inserción o mutación directa en el modelo Transaction.
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
  BankStatementParserService,
  BBVAStatementParser,
  SantanderStatementParser,
  BanorteStatementParser,
  NuStatementParser,
  AmexStatementParser,
  GenericStatementParser,
  StatementDateHelper,
} from '../../src/domain/services/statements';
import { TransactionFingerprintService } from '../../src/domain/services/fingerprint';
import type { RawEvent, CreateRawEventDTO, UpdateRawEventStatusDTO, RawEventSource } from '../../src/domain/models/RawEvent';
import type { IRawEventRepository, RawEventFilter } from '../../src/domain/repositories/IRawEventRepository';
import type { TransactionCandidate } from '../../src/domain/models/TransactionCandidate';
import { InMemoryTransactionCandidateRepository } from '../../src/infrastructure/database/InMemoryTransactionCandidateRepository';

// Mock de IRawEventRepository
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

export async function runBankStatementParserTests() {
  console.log('[TEST] Iniciando pruebas de US-039: Parser PDF Bancario...\n');

  // ── [TEST 1] Helper de fechas: normalización de fechas bancarias en español ──
  console.log('[TEST 1] Normalización de fechas bancarias en diversos formatos (AC)');
  {
    const d1 = StatementDateHelper.parseBankDate('12/OCT/2026');
    assert.ok(d1 !== null);
    assert.strictEqual(d1.getUTCFullYear(), 2026);
    assert.strictEqual(d1.getUTCMonth(), 9); // Octubre (0-indexed)
    assert.strictEqual(d1.getUTCDate(), 12);

    const d2 = StatementDateHelper.parseBankDate('15-MAR-2026');
    assert.ok(d2 !== null);
    assert.strictEqual(d2.getUTCMonth(), 2); // Marzo
    assert.strictEqual(d2.getUTCDate(), 15);

    const d3 = StatementDateHelper.parseBankDate('20/10/2026');
    assert.ok(d3 !== null);
    assert.strictEqual(d3.getUTCDate(), 20);

    const d4 = StatementDateHelper.parseBankDate('05/DIC', 2026);
    assert.ok(d4 !== null);
    assert.strictEqual(d4.getUTCFullYear(), 2026);
    assert.strictEqual(d4.getUTCMonth(), 11); // Diciembre
    assert.strictEqual(d4.getUTCDate(), 5);

    console.log('  [OK] Fechas bancarias alfanuméricas y numéricas normalizadas');
  }

  // ── [TEST 2] Parser específico BBVA: cheques, libretón y tarjeta de crédito (AC) ──
  console.log('\n[TEST 2] Parser específico BBVA: extracción de movimientos y tipos');
  {
    const bbvaPdf = `
      %PDF-1.4
      stream
      BT
      (BBVA MEXICO, S.A. INSTITUCION DE BANCA MULTIPLE) Tj
      (ESTADO DE CUENTA INTEGRAL CUENTA LIBRETON) Tj
      (NUMERO DE CUENTA: ****4321 CLABE: 012180004321) Tj
      (PERIODO: 01/OCT/2026 AL 31/OCT/2026) Tj
      (FECHA\tCONCEPTO\tCARGOS\tABONOS\tSALDO) Tj
      (05/OCT/2026\tOXXO REFORMA CDMX\t$154.50\t\t$12,450.00) Tj
      (15/OCT/2026\tSPEI RECIBIDO NOMINA EMPRESA\t\t$25,000.00\t$37,450.00) Tj
      (20/OCT/2026\tPAGO DE MI TARJETA BBVA\t$5,000.00\t\t$32,450.00) Tj
      ET
      endstream
    `;

    const rawEvent: RawEvent = {
      id: 'raw-bbva-1',
      userId: 'user-diego',
      source: 'BANK_PDF',
      sourceId: 'sha256-bbva',
      payload: { fileName: 'Estado_Cuenta_BBVA_Octubre.pdf' },
      metadata: {},
      status: 'PENDING',
      retryCount: 0,
      receivedAt: new Date('2026-10-12T12:00:00Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const service = new BankStatementParserService();
    const result = await service.parseStatementEvent(rawEvent, bbvaPdf);

    assert.strictEqual(result.bankDetected, 'BBVA');
    assert.strictEqual(result.accountHint?.last4Digits, '4321');
    assert.strictEqual(result.accountHint?.bankName, 'BBVA México');
    assert.strictEqual(result.candidates.length, 3, 'Debe generar 3 candidatos');

    // Movimiento 1: Gasto en OXXO
    const cand1 = result.candidates[0];
    assert.strictEqual(cand1.provider, 'BBVA');
    assert.strictEqual(cand1.amount, 154.5);
    assert.strictEqual(cand1.amountMinor, 15450);
    assert.strictEqual(cand1.type, 'EXPENSE');
    assert.ok(cand1.merchant?.toUpperCase().includes('OXXO'));
    assert.strictEqual(cand1.source, 'BANK_PDF');

    // Movimiento 2: Ingreso de Nómina
    const cand2 = result.candidates[1];
    assert.strictEqual(cand2.amount, 25000);
    assert.strictEqual(cand2.amountMinor, 2500000);
    assert.strictEqual(cand2.type, 'INCOME');

    // Movimiento 3: Transferencia / Pago propio
    const cand3 = result.candidates[2];
    assert.strictEqual(cand3.amount, 5000);
    assert.strictEqual(cand3.type, 'TRANSFER');

    console.log('  [OK] Estado de cuenta BBVA parseado con cargos, nómina y transferencias');
  }

  // ── [TEST 3] Parser específico Santander México (AC) ──
  console.log('\n[TEST 3] Parser específico Santander: extracción de movimientos y saldo');
  {
    const santanderPdf = `
      %PDF-1.4
      stream
      BT
      (BANCO SANTANDER MEXICO S.A.) Tj
      (ESTADO DE CUENTA SUPER CUENTA CHEQUES) Tj
      (CUENTA: *******8899) Tj
      (FECHA\tDESCRIPCION\tRETIROS\tDEPOSITOS\tSALDO) Tj
      (10/OCT/2026\tFARMACIAS GUADALAJARA\t$340.00\t\t$8,900.00) Tj
      (18/OCT/2026\tDEPOSITO EN EFECTIVO VENTANILLA\t\t$1,200.00\t$10,100.00) Tj
      ET
      endstream
    `;

    const rawEvent: RawEvent = {
      id: 'raw-san-1',
      userId: 'user-diego',
      source: 'BANK_PDF',
      sourceId: 'sha256-san',
      payload: { fileName: 'Santander_SuperCuenta_102026.pdf' },
      metadata: {},
      status: 'PENDING',
      retryCount: 0,
      receivedAt: new Date('2026-10-12T12:00:00Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const service = new BankStatementParserService();
    const result = await service.parseStatementEvent(rawEvent, santanderPdf);

    assert.strictEqual(result.bankDetected, 'SANTANDER');
    assert.strictEqual(result.accountHint?.last4Digits, '8899');
    assert.strictEqual(result.candidates.length, 2);
    assert.strictEqual(result.candidates[0].type, 'EXPENSE');
    assert.strictEqual(result.candidates[1].type, 'INCOME');

    console.log('  [OK] Parser Santander reconoció entidad, cuenta y transacciones');
  }

  // ── [TEST 4] Parser específico Banorte / IXE (AC) ──
  console.log('\n[TEST 4] Parser específico Banorte / IXE');
  {
    const banortePdf = `
      %PDF-1.4
      stream
      BT
      (GRUPO FINANCIERO BANORTE) Tj
      (ESTADO DE CUENTA BANORTE FACIL) Tj
      (CONTRATO NO. 9988771122) Tj
      (FECHA\tDETALLE\tCARGOS\tABONOS\tSALDO) Tj
      (08/OCT/2026\tRESTAURANTE EL PORTON\t$890.00\t\t$14,200.00) Tj
      ET
      endstream
    `;

    const rawEvent: RawEvent = {
      id: 'raw-banorte-1',
      userId: 'user-diego',
      source: 'BANK_PDF',
      sourceId: 'sha256-banorte',
      payload: { fileName: 'Banorte_Octubre_2026.pdf' },
      metadata: {},
      status: 'PENDING',
      retryCount: 0,
      receivedAt: new Date('2026-10-12T12:00:00Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const service = new BankStatementParserService();
    const result = await service.parseStatementEvent(rawEvent, banortePdf);

    assert.strictEqual(result.bankDetected, 'BANORTE');
    assert.strictEqual(result.candidates.length, 1);
    assert.strictEqual(result.candidates[0].amount, 890);
    assert.strictEqual(result.candidates[0].provider, 'BANORTE');

    console.log('  [OK] Parser Banorte procesó movimiento de tarjeta/cuenta');
  }

  // ── [TEST 5] Parser específico Nu México (AC) ──
  console.log('\n[TEST 5] Parser específico Nu México');
  {
    const nuPdf = `
      %PDF-1.4
      stream
      BT
      (NU MEXICO FINANCIERA S.A. DE C.V.) Tj
      (ESTADO DE CUENTA TARJETA DE CREDITO NU) Tj
      (TARJETA TERMINACION 1234) Tj
      (FECHA\tCONCEPTO\tCARGOS\tABONOS\tSALDO) Tj
      (02/OCT/2026\tNETFLIX SUBSCRIPTION\t$219.00\t\t$219.00) Tj
      (04/OCT/2026\tSPOTIFY MEXICO\t$129.00\t\t$348.00) Tj
      ET
      endstream
    `;

    const rawEvent: RawEvent = {
      id: 'raw-nu-1',
      userId: 'user-diego',
      source: 'BANK_PDF',
      sourceId: 'sha256-nu',
      payload: { fileName: 'Nu_Statement_2026-10.pdf' },
      metadata: {},
      status: 'PENDING',
      retryCount: 0,
      receivedAt: new Date('2026-10-12T12:00:00Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const service = new BankStatementParserService();
    const result = await service.parseStatementEvent(rawEvent, nuPdf);

    assert.strictEqual(result.bankDetected, 'NU');
    assert.strictEqual(result.accountHint?.last4Digits, '1234');
    assert.strictEqual(result.accountHint?.accountType, 'CREDIT');
    assert.strictEqual(result.candidates.length, 2);

    console.log('  [OK] Parser Nu procesó cargos recurrentes de tarjeta de crédito');
  }

  // ── [TEST 6] Parser específico American Express (AMEX) (AC) ──
  console.log('\n[TEST 6] Parser específico American Express México');
  {
    const amexPdf = `
      %PDF-1.4
      stream
      BT
      (AMERICAN EXPRESS COMPANY MEXICO S.A. DE C.V.) Tj
      (ESTADO DE CUENTA MENSUAL) Tj
      (CUENTA: 3717-******-91001) Tj
      (FECHA\tDESCRIPCION\tCARGOS\tABONOS\tSALDO) Tj
      (09/OCT/2026\tAEROMEXICO BOLETOS\t$4,520.00\t\t$4,520.00) Tj
      ET
      endstream
    `;

    const rawEvent: RawEvent = {
      id: 'raw-amex-1',
      userId: 'user-diego',
      source: 'BANK_PDF',
      sourceId: 'sha256-amex',
      payload: { fileName: 'Amex_Gold_Statement.pdf' },
      metadata: {},
      status: 'PENDING',
      retryCount: 0,
      receivedAt: new Date('2026-10-12T12:00:00Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const service = new BankStatementParserService();
    const result = await service.parseStatementEvent(rawEvent, amexPdf);

    assert.strictEqual(result.bankDetected, 'AMEX');
    assert.strictEqual(result.candidates.length, 1);
    assert.strictEqual(result.candidates[0].amount, 4520);
    assert.strictEqual(result.candidates[0].provider, 'AMEX');

    console.log('  [OK] Parser AMEX detectó entidad y cargo de viaje');
  }

  // ── [TEST 7] Parser Fallback Genérico para instituciones no catalogadas (AC) ──
  console.log('\n[TEST 7] Parser Fallback Genérico para instituciones no catalogadas');
  {
    const unknownPdf = `
      %PDF-1.4
      stream
      BT
      (BANCO COOPERATIVO REGIONAL DEL CENTRO) Tj
      (ESTADO DE CUENTA MENSUAL DEPOSITOS) Tj
      (CUENTA: 77889966) Tj
      (FECHA\tMOVIMIENTO\tRETIRO\tDEPOSITO\tSALDO) Tj
      (11/OCT/2026\tTIENDA LOCAL SAN ANGEL\t$450.00\t\t$3,200.00) Tj
      ET
      endstream
    `;

    const rawEvent: RawEvent = {
      id: 'raw-gen-1',
      userId: 'user-diego',
      source: 'BANK_PDF',
      sourceId: 'sha256-gen',
      payload: { fileName: 'Banco_Regional_Octubre.pdf' },
      metadata: {},
      status: 'PENDING',
      retryCount: 0,
      receivedAt: new Date('2026-10-12T12:00:00Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const service = new BankStatementParserService();
    const result = await service.parseStatementEvent(rawEvent, unknownPdf);

    assert.strictEqual(result.bankDetected, 'GENERIC');
    assert.strictEqual(result.candidates.length, 1);
    assert.strictEqual(result.candidates[0].amount, 450);

    console.log('  [OK] Fallback genérico procesó exitosamente banco no estándar');
  }

  // ── [TEST 8] Cálculo determinístico de Fingerprint (US-025) (AC) ──
  console.log('\n[TEST 8] Huella digital determinística (fingerprint SHA-256) en candidates');
  {
    const testPdf = `
      %PDF-1.4
      stream
      BT
      (BBVA BANCOMER ESTADO DE CUENTA) Tj
      (FECHA\tCONCEPTO\tCARGOS\tABONOS\tSALDO) Tj
      (14/OCT/2026\tWALMART SUPERCENTER\t$1,250.00\t\t$10,000.00) Tj
      ET
      endstream
    `;

    const rawEvent: RawEvent = {
      id: 'raw-fp-1',
      userId: 'user-diego',
      source: 'BANK_PDF',
      sourceId: 'sha256-fp',
      payload: { fileName: 'BBVA.pdf' },
      metadata: {},
      status: 'PENDING',
      retryCount: 0,
      receivedAt: new Date('2026-10-12T12:00:00Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const service = new BankStatementParserService();
    const res1 = await service.parseStatementEvent(rawEvent, testPdf);
    const cand1 = res1.candidates[0];

    assert.ok(cand1.fingerprint !== null && cand1.fingerprint !== undefined);
    assert.ok(TransactionFingerprintService.isValidFingerprint(cand1.fingerprint));

    // Reprocesar el mismo evento debe generar exactamente el mismo fingerprint
    const res2 = await service.parseStatementEvent(rawEvent, testPdf);
    const cand2 = res2.candidates[0];

    assert.strictEqual(cand1.fingerprint, cand2.fingerprint, 'El fingerprint debe ser idéntico y determinístico');
    console.log('  [OK] Fingerprint determinístico de 64 caracteres validado');
  }

  // ── [TEST 9] Conservación íntegra de la fuente de origen (RawEvent) (AC) ──
  console.log('\n[TEST 9] Conservación de la fuente de origen y trazabilidad inmutable');
  {
    const rawPayloadOriginal = {
      fileName: 'BBVA_Octubre.pdf',
      customSecurityHeader: 'sec_9948',
      nested: { token: 'xyz123' },
    };

    const rawEvent: RawEvent = {
      id: 'raw-src-1',
      userId: 'user-diego',
      source: 'BANK_PDF',
      sourceId: 'sha256-src',
      payload: JSON.parse(JSON.stringify(rawPayloadOriginal)),
      metadata: {},
      status: 'PENDING',
      retryCount: 0,
      receivedAt: new Date('2026-10-12T12:00:00Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const service = new BankStatementParserService();
    const pdf = `
      %PDF-1.4
      stream
      BT
      (BBVA ESTADO DE CUENTA) Tj
      (FECHA\tCONCEPTO\tCARGOS\tABONOS\tSALDO) Tj
      (01/OCT/2026\tSTARBUCKS COFFEE\t$95.00\t\t$5,000.00) Tj
      ET
      endstream
    `;

    const result = await service.parseStatementEvent(rawEvent, pdf);
    const cand = result.candidates[0];

    // Verificar trazabilidad hacia el evento original
    assert.strictEqual(cand.rawEventId, 'raw-src-1');
    assert.strictEqual(cand.source, 'BANK_PDF');

    // Verificar que el payload del RawEvent no fue mutado ni alterado
    assert.strictEqual(rawEvent.payload.customSecurityHeader, 'sec_9948');
    assert.strictEqual((cand.rawPayload as typeof rawPayloadOriginal).customSecurityHeader, 'sec_9948');

    console.log('  [OK] Inmutabilidad de la fuente y trazabilidad estricta verificadas');
  }

  // ── [TEST 10] Invariante arquitectónica: Cero inserciones en Transaction (AC) ──
  console.log('\n[TEST 10] Invariante arquitectónica: Cero inserciones directas en Transaction');
  {
    const parser = new BBVAStatementParser();
    const rawEvent: RawEvent = {
      id: 'raw-inv-1',
      userId: 'user-diego',
      source: 'BANK_PDF',
      sourceId: 'sha256-inv',
      payload: {},
      metadata: {},
      status: 'PENDING',
      retryCount: 0,
      receivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const dummyExtraction = {
      success: true,
      rawText: 'BBVA ESTADO DE CUENTA',
      totalPages: 1,
      pages: [],
      tables: [
        {
          sectionTitle: 'Movimientos',
          headers: ['FECHA', 'CONCEPTO', 'IMPORTE'],
          rows: [
            {
              rowNumber: 1,
              rawLine: '01/OCT/2026 COMPRA EN LINEA $100.00',
              cells: ['01/OCT/2026', 'COMPRA EN LINEA', '$100.00'],
              amount: 100,
              amountMinor: 10000,
              date: '01/OCT/2026',
              description: 'COMPRA EN LINEA',
              type: 'CHARGE' as const,
            },
          ],
        },
      ],
      metadata: {
        isEncrypted: false,
        hasSearchableText: true,
        pagesCount: 1,
        tablesCount: 1,
        totalRowsDetected: 1,
      },
    };

    const res = await parser.parse(rawEvent, dummyExtraction);
    assert.strictEqual(res.candidates.length, 1);
    const candidate = res.candidates[0];

    // Los candidatos tienen estado PENDING_REVIEW y nunca se tratan como transacciones finales
    assert.strictEqual(candidate.status, 'PENDING_REVIEW');
    assert.ok(!('accountId' in candidate), 'El candidato no debe forzar accountId final');

    console.log('  [OK] Invariante respetada: produce candidatos desacoplados de transacciones');
  }

  // ── [TEST 11] Persistencia automática en ITransactionCandidateRepository ──
  console.log('\n[TEST 11] Persistencia automática en ITransactionCandidateRepository');
  {
    const candidateRepo = new InMemoryTransactionCandidateRepository();
    const rawRepo = new MockRawEventRepository();

    const rawEvent = await rawRepo.save({
      source: 'BANK_PDF',
      sourceId: 'sha256-repo-1',
      payload: { fileName: 'BBVA_Statement.pdf' },
      metadata: { userId: 'user-diego' },
    });

    const pdf = `
      %PDF-1.4
      stream
      BT
      (BBVA ESTADO DE CUENTA) Tj
      (FECHA\tCONCEPTO\tCARGOS\tABONOS\tSALDO) Tj
      (12/OCT/2026\tLIVERPOOL POLANCO\t$3,400.00\t\t$20,000.00) Tj
      (13/OCT/2026\tAMAZON MEXICO\t$850.00\t\t$19,150.00) Tj
      ET
      endstream
    `;

    const service = new BankStatementParserService({
      candidateRepository: candidateRepo,
      rawEventRepository: rawRepo,
    });

    const result = await service.parseStatementEvent(rawEvent, pdf);
    assert.strictEqual(result.candidates.length, 2);
    const savedCandidates = await candidateRepo.findAll();
    assert.strictEqual(savedCandidates.length, 2, 'Los 2 candidatos deben guardarse en el repo');

    const updatedRaw = await rawRepo.findById(rawEvent.id);
    assert.strictEqual(updatedRaw?.status, 'PROCESSED');
    assert.strictEqual(updatedRaw?.metadata?.candidatesGenerated, 2);

    console.log('  [OK] Candidatos persistidos en repositorio y evento marcado como PROCESSED');
  }

  // ── [TEST 12] Detección de secciones de Meses Sin Intereses (MSI) en metadatos ──
  console.log('\n[TEST 12] Metadatos de compras a Meses Sin Intereses (MSI)');
  {
    const msiPdf = `
      %PDF-1.4
      stream
      BT
      (TARJETA DE CREDITO NU ESTADO DE CUENTA) Tj
      (PLAN DE PAGOS FIJOS Y COMPRAS A MESES SIN INTERESES) Tj
      (FECHA\tCONCEPTO\tCARGOS\tABONOS\tSALDO) Tj
      (15/OCT/2026\tAPPLE STORE MACBOOK 3 DE 12\t$2,500.00\t\t$2,500.00) Tj
      ET
      endstream
    `;

    const rawEvent: RawEvent = {
      id: 'raw-msi-1',
      userId: 'user-diego',
      source: 'BANK_PDF',
      sourceId: 'sha256-msi',
      payload: { fileName: 'Nu_MSI.pdf' },
      metadata: {},
      status: 'PENDING',
      retryCount: 0,
      receivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const service = new BankStatementParserService();
    const result = await service.parseStatementEvent(rawEvent, msiPdf);
    assert.strictEqual(result.candidates.length, 1);

    const cand = result.candidates[0];
    assert.strictEqual(cand.metadata.isMsiSection, true);
    assert.ok((cand.metadata.tableSection as string).includes('MESES SIN INTERESES'));

    console.log('  [OK] Sección de compras diferidas y MSI reflejada en metadatos del candidato');
  }

  console.log('\n[RESULTADO] Todas las pruebas de US-039 pasaron exitosamente (12/12).');
}
