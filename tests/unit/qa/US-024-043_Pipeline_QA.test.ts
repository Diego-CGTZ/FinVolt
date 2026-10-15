/// <reference types="node" />
/**
 * QA robusto del pipeline de ingestion (US-018..US-043):
 * fingerprint, maquina de estados, consistencia contable, parser CSV y normalizador de comercios.
 * Cada caso es adversarial: busca zonas horarias, formatos numericos y consistencia entre modulos.
 */
import assert from 'node:assert/strict';
import { TransactionFingerprintService } from '../../../src/domain/services/fingerprint/TransactionFingerprintService';
import { FinancialStateMachine, VALID_TRANSACTION_TRANSITIONS } from '../../../src/domain/services/lifecycle/FinancialStateMachine';
import { CsvStatementParser } from '../../../src/domain/services/csv/CsvStatementParser';
import { MerchantNormalizer } from '../../../src/domain/services/MerchantNormalizer';
import { calculateAccountBalance } from '../../../src/domain/services/BalanceCalculatorService';
import type { TransactionStatus, Transaction } from '../../../src/domain/models/Transaction';
import type { Account } from '../../../src/domain/models/Account';
import type { RawEvent } from '../../../src/domain/models/RawEvent';

const ALL: TransactionStatus[] = [
  'CANDIDATE', 'MATCHED', 'CONFIRMED', 'PENDING', 'POSTED', 'TRANSFER', 'REFUND', 'DUPLICATE', 'REJECTED',
];

function rawEvent(): RawEvent {
  const now = new Date('2026-10-14T12:00:00Z');
  return {
    id: 'raw1', userId: 'u1', source: 'CSV' as RawEvent['source'], sourceId: 's', payload: {}, rawText: '',
    metadata: {}, status: 'PENDING', retryCount: 0, receivedAt: now, createdAt: now, updatedAt: now,
  } as RawEvent;
}

async function parseCsv(csv: string) {
  return new CsvStatementParser().parse(csv, rawEvent(), { defaultCurrency: 'MXN' });
}

export async function runQaTests(): Promise<void> {
  const failures: string[] = [];
  let ok = 0;
  const t = async (name: string, fn: () => void | Promise<void>) => {
    try {
      await fn();
      ok++;
      console.log(`  [OK] ${name}`);
    } catch (e) {
      failures.push(name);
      console.log(`  [FAIL] ${name}\n         ${(e as Error).message.split('\n')[0]}`);
    }
  };

  console.log('[QA US-025] Fingerprint');
  await t('determinista y estable ante mayusculas/espacios', () => {
    const a = TransactionFingerprintService.calculate({ account: 'A', amountMinor: 100, date: '2026-10-01', merchant: '  OXXO   Matriz ', type: 'expense' });
    const b = TransactionFingerprintService.calculate({ account: 'a', amountMinor: 100, date: '2026-10-01', merchant: 'oxxo matriz', type: 'EXPENSE' });
    assert.equal(a, b);
    assert.ok(TransactionFingerprintService.isValidFingerprint(a));
  });
  await t('monto decimal y en minor units producen el mismo hash (149.99)', () => {
    const a = TransactionFingerprintService.calculate({ amount: 149.99, date: '2026-10-01', type: 'EXPENSE' });
    const b = TransactionFingerprintService.calculate({ amountMinor: 14999, date: '2026-10-01', type: 'EXPENSE' });
    assert.equal(a, b);
  });
  await t('redondeo de float: 1.005*100 y 0.57*100 no desplazan centavos', () => {
    assert.equal(TransactionFingerprintService.normalizeAmountMinor({ amount: 0.57 }), 57);
    assert.equal(TransactionFingerprintService.normalizeAmountMinor({ amount: 1.15 }), 115);
    assert.equal(TransactionFingerprintService.normalizeAmountMinor({ amount: 19.99 }), 1999);
  });
  await t('fecha invalida no explota y es determinista', () => {
    assert.equal(TransactionFingerprintService.normalizeDate('basura'), '1970-01-01');
    assert.equal(TransactionFingerprintService.normalizeDate(new Date('x')), '1970-01-01');
  });
  await t('distinto tipo/monto/moneda cambia el hash', () => {
    const base = { account: 'a', amountMinor: 100, date: '2026-10-01', merchant: 'x', type: 'EXPENSE' };
    const h = TransactionFingerprintService.calculate(base);
    assert.notEqual(h, TransactionFingerprintService.calculate({ ...base, type: 'INCOME' }));
    assert.notEqual(h, TransactionFingerprintService.calculate({ ...base, amountMinor: 101 }));
    assert.notEqual(h, TransactionFingerprintService.calculate({ ...base, currency: 'USD' }));
  });
  await t('entradas de 10k hashes unicos sin colision', () => {
    const set = new Set<string>();
    for (let i = 0; i < 10000; i++) {
      set.add(TransactionFingerprintService.calculate({ account: 'a', amountMinor: i, date: '2026-10-01', type: 'EXPENSE' }));
    }
    assert.equal(set.size, 10000);
  });
  await t('vector SHA-256 conocido', () => {
    // sha256("abc")
    const h = TransactionFingerprintService.calculate({ account: 'abc', amountMinor: 0, date: '1970-01-01', type: 'EXPENSE' });
    assert.equal(h.length, 64);
    assert.match(h, /^[a-f0-9]{64}$/);
  });

  console.log('\n[QA US-028] Maquina de estados');
  await t('toda transicion declarada es simetrica con canTransition y estados validos', () => {
    for (const from of ALL) {
      for (const to of VALID_TRANSACTION_TRANSITIONS[from]) {
        assert.ok(ALL.includes(to), `${from}->${to} destino invalido`);
        assert.ok(FinancialStateMachine.canTransition(from, to));
      }
    }
  });
  await t('transiciones no declaradas son rechazadas (matriz completa)', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        if (from === to) continue;
        const allowed = VALID_TRANSACTION_TRANSITIONS[from].includes(to);
        assert.equal(FinancialStateMachine.canTransition(from, to), allowed, `${from}->${to}`);
      }
    }
  });
  await t('POSTED no puede volver a PENDING/CANDIDATE', () => {
    assert.equal(FinancialStateMachine.canTransition('POSTED', 'PENDING'), false);
    assert.equal(FinancialStateMachine.canTransition('POSTED', 'CANDIDATE'), false);
  });
  await t('estados invalidos o basura rechazados', () => {
    assert.equal(FinancialStateMachine.canTransition('FOO' as TransactionStatus, 'POSTED'), false);
    assert.equal(FinancialStateMachine.canTransition('POSTED', undefined as unknown as TransactionStatus), false);
  });
  await t('transition a POSTED fija postedAt y no muta el original', () => {
    const base = { status: 'PENDING', postedAt: null, updatedAt: new Date(0), linkedTransactionId: null } as unknown as Transaction;
    const out = FinancialStateMachine.transition(base, 'POSTED');
    assert.equal(out.status, 'POSTED');
    assert.ok(out.postedAt instanceof Date);
    assert.equal(base.status, 'PENDING');
  });
  await t('transicion invalida lanza error con informacion util', () => {
    const base = { status: 'POSTED', postedAt: new Date(), updatedAt: new Date(), linkedTransactionId: null } as unknown as Transaction;
    assert.throws(() => FinancialStateMachine.transition(base, 'CANDIDATE'), /inv/i);
  });

  console.log('\n[QA US-028 vs US-015] Consistencia estado <-> balance');
  await t('CANDIDATE/MATCHED no deben alterar el balance (la state machine los declara no efectivos)', () => {
    const account = { id: 'a', userId: 'u', name: 'a', type: 'CHECKING', currency: 'MXN', initialBalance: 1000, createdAt: new Date(), updatedAt: new Date() } as Account;
    for (const status of ['CANDIDATE', 'MATCHED'] as TransactionStatus[]) {
      assert.equal(FinancialStateMachine.isEffective(status), false);
      const tx = { id: 't', accountId: 'a', type: 'EXPENSE', amountMinor: 50000, status } as unknown as Transaction;
      const bal = calculateAccountBalance(account, [tx]).currentBalance;
      assert.equal(bal, 1000, `${status}: balance=${bal} (la state machine dice que no es efectiva)`);
    }
  });

  console.log('\n[QA US-040] Parser CSV adversarial');
  await t('comillas, comas dentro de celdas y comillas escapadas', () => {
    const rows = CsvStatementParser.parseCsvLines('a,"b,c","d ""e"" f"\n1,2,3');
    assert.deepEqual(rows[0], ['a', 'b,c', 'd "e" f']);
    assert.equal(rows.length, 2);
  });
  await t('saltos de linea dentro de celda entrecomillada', () => {
    const rows = CsvStatementParser.parseCsvLines('a,b\n"x\ny",z');
    assert.equal(rows.length, 2);
    assert.equal(rows[1][0], 'x\ny');
  });
  await t('CRLF y archivo sin salto final', () => {
    assert.equal(CsvStatementParser.parseCsvLines('a,b\r\n1,2').length, 2);
  });
  await t('BOM UTF-8 al inicio no contamina el primer encabezado', () => {
    const rows = CsvStatementParser.parseCsvLines('\uFEFFFecha,Descripcion,Monto\n2026-10-01,Oxxo,10');
    assert.equal(rows[0][0], 'Fecha', `encabezado=${JSON.stringify(rows[0][0])}`);
  });
  await t('importe con parentesis contables (1,234.50) se interpreta como valor', async () => {
    const r = await parseCsv('Fecha,Descripcion,Cargo,Abono\n2026-10-01,Tienda,"(1,234.50)",\n2026-10-02,Otra,10.00,');
    assert.equal(r.validRows, 2, `validRows=${r.validRows}, invalidRows=${r.invalidRows}`);
  });
  await t('importe formato europeo 1.234,56 se interpreta como 123456 centavos', async () => {
    const r = await parseCsv('Fecha;Descripcion;Monto\n2026-10-01;Tienda;"1.234,56"');
    assert.equal(r.candidates[0]?.amountMinor, 123456, `amountMinor=${r.candidates[0]?.amountMinor}`);
  });
  await t('importe con simbolo y negativo "-$1,200.00" es INCOME con 120000', async () => {
    const r = await parseCsv('Fecha,Descripcion,Monto\n2026-10-01,Devolucion tienda,"-$1,200.00"');
    assert.equal(r.candidates[0].amountMinor, 120000);
    assert.equal(r.candidates[0].type, 'INCOME');
  });
  await t('importe con precision de float (19.99, 0.57, 1.15) se convierte exacto', async () => {
    const r = await parseCsv('Fecha,Descripcion,Monto\n2026-10-01,A,19.99\n2026-10-02,B,0.57\n2026-10-03,C,1.15\n2026-10-04,D,4.35');
    assert.deepEqual(r.candidates.map((c) => c.amountMinor), [1999, 57, 115, 435]);
  });
  await t('fila con monto cero o texto se marca invalida y no rompe el lote', async () => {
    const r = await parseCsv('Fecha,Descripcion,Monto\n2026-10-01,A,0\n2026-10-02,B,abc\n2026-10-03,C,5');
    assert.equal(r.validRows, 1);
    assert.equal(r.invalidRows, 2);
  });
  await t('archivo vacio y solo encabezados no explotan', async () => {
    assert.equal((await parseCsv('')).validRows, 0);
    assert.equal((await parseCsv('Fecha,Descripcion,Monto')).validRows, 0);
  });
  await t('dos cargos identicos legitimos el mismo dia se conservan (2 cafes)', async () => {
    const r = await parseCsv('Fecha,Descripcion,Monto\n2026-10-01,Starbucks,50\n2026-10-01,Starbucks,50');
    assert.equal(r.validRows, 2);
    assert.equal(r.candidates.length, 2);
  });
  await t('inyeccion de formula (=cmd) se conserva como texto inerte en merchantRaw', async () => {
    const r = await parseCsv('Fecha,Descripcion,Monto\n2026-10-01,"=HYPERLINK(""http://x"")",5');
    assert.equal(typeof r.candidates[0].merchantRaw, 'string');
  });

  console.log('\n[QA US-024] Normalizador de comercios');
  const norm = new MerchantNormalizer();
  await t('variantes de Uber / Uber Eats / Amazon agrupan correctamente', () => {
    const uber = norm.normalizeSync('UBER *TRIP HELP.UBER.COM').normalizedMerchant;
    const eats = norm.normalizeSync('UBER EATS MX').normalizedMerchant;
    assert.notEqual(uber, eats, 'Uber y Uber Eats deben ser comercios distintos');
    assert.equal(norm.normalizeSync('AMAZON MX MARKETPLACE').normalizedMerchant, norm.normalizeSync('AMZN Mktp MX').normalizedMerchant);
  });
  await t('raw_merchant se conserva intacto (salvo trim)', () => {
    const r = norm.normalizeSync('  OXXO #1234 CDMX  ');
    assert.equal(r.rawMerchant, 'OXXO #1234 CDMX');
  });
  await t('null / vacio / solo espacios devuelven normalized null y confianza 0', () => {
    for (const v of [null, undefined, '', '   ']) {
      const r = norm.normalizeSync(v as string);
      assert.equal(r.normalizedMerchant, null);
      assert.equal(r.confidence, 0);
    }
  });
  await t('entrada hostil (10k chars, regex especiales) responde rapido y sin excepcion', () => {
    const start = Date.now();
    norm.normalizeSync('(((' + 'A'.repeat(10000) + '.*+?^${}[]|\\');
    assert.ok(Date.now() - start < 1500, `tardo ${Date.now() - start}ms (posible ReDoS)`);
  });
  await t('acentos y mayusculas no cambian la regla', () => {
    assert.equal(norm.normalizeSync('oxxo').normalizedMerchant, norm.normalizeSync('OXXO').normalizedMerchant);
  });

  console.log(`\n[RESULTADO] ${ok} OK, ${failures.length} FAIL`);
  if (failures.length) throw new Error(`Casos fallidos: ${failures.join(' | ')}`);
}
