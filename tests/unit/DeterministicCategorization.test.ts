/**
 * Pruebas unitarias para US-031: Categorización Determinística
 *
 * Acceptance Criteria:
 * Merchant mapping → rules → user corrections → fallback; sin ML/LLM como dependencia inicial.
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
  DeterministicCategorizationService,
  type CategorizationInput,
} from '../../src/domain/services/categorization/DeterministicCategorizationService';
import type { TransactionCandidate } from '../../src/domain/models/TransactionCandidate';
import type { Transaction } from '../../src/domain/models/Transaction';

function createMockCandidate(overrides: Partial<TransactionCandidate> = {}): TransactionCandidate {
  const now = new Date();
  return {
    id: overrides.id || `cand-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId: overrides.userId || 'user-test-123',
    rawEventId: overrides.rawEventId || 'raw-123',
    source: overrides.source || 'ANDROID_NOTIFICATION',
    provider: overrides.provider || 'BBVA',
    amountMinor: overrides.amountMinor || 25000,
    amount: overrides.amount || 250.0,
    currency: overrides.currency || 'MXN',
    type: overrides.type || 'EXPENSE',
    merchantRaw: overrides.merchantRaw !== undefined ? overrides.merchantRaw : 'OXXO PEDREGAL',
    merchant: overrides.merchant !== undefined ? overrides.merchant : 'Oxxo',
    occurredAt: overrides.occurredAt || now,
    confidenceScore: overrides.confidenceScore ?? 85,
    status: overrides.status || 'PENDING_REVIEW',
    rawPayload: overrides.rawPayload || {},
    metadata: overrides.metadata || {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createMockTransaction(overrides: Partial<Transaction> = {}): Transaction {
  const now = new Date();
  return {
    id: overrides.id || `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId: overrides.userId || 'user-test-123',
    accountId: overrides.accountId || 'acc-123',
    type: overrides.type || 'EXPENSE',
    amountMinor: overrides.amountMinor || 25000,
    currency: overrides.currency || 'MXN',
    source: overrides.source || 'NOTIFICATION',
    status: overrides.status || 'CANDIDATE',
    occurredAt: overrides.occurredAt || now,
    postedAt: overrides.postedAt !== undefined ? overrides.postedAt : null,
    merchantRaw: overrides.merchantRaw !== undefined ? overrides.merchantRaw : 'STARBUCKS COFFEE',
    merchant: overrides.merchant !== undefined ? overrides.merchant : 'Starbucks',
    description: overrides.description !== undefined ? overrides.description : null,
    categoryId: overrides.categoryId !== undefined ? overrides.categoryId : null,
    sourceEventId: overrides.sourceEventId !== undefined ? overrides.sourceEventId : null,
    confidenceScore: overrides.confidenceScore ?? 85,
    fingerprint: overrides.fingerprint !== undefined ? overrides.fingerprint : null,
    linkedTransactionId: overrides.linkedTransactionId !== undefined ? overrides.linkedTransactionId : null,
    metadata: overrides.metadata || {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export async function runDeterministicCategorizationTests(): Promise<void> {
  console.log('[TEST] Iniciando pruebas de US-031: Categorización Determinística...\n');

  const service = new DeterministicCategorizationService();

  // ── TEST 1: Etapa 1 - Merchant Mapping Directo ─────────────────────────────
  console.log('[TEST 1] Etapa 1: Merchant Mapping directo de comercios conocidos');
  {
    const cases = [
      { input: { merchant: 'Walmart' }, expectedCategory: 'Supermercado' },
      { input: { merchant: 'Oxxo' }, expectedCategory: 'Supermercado' },
      { input: { merchant: 'Costco Wholesale' }, expectedCategory: 'Supermercado' },
      { input: { merchant: 'Starbucks' }, expectedCategory: 'Cafeterías' },
      { input: { merchant: 'Uber Eats' }, expectedCategory: 'Restaurantes' },
      { input: { merchant: 'Uber' }, expectedCategory: 'Transporte' },
      { input: { merchant: 'Shell' }, expectedCategory: 'Gasolina' },
      { input: { merchant: 'Pemex' }, expectedCategory: 'Gasolina' },
      { input: { merchant: 'Netflix' }, expectedCategory: 'Suscripciones' },
      { input: { merchant: 'Spotify' }, expectedCategory: 'Suscripciones' },
      { input: { merchant: 'Cinépolis' }, expectedCategory: 'Entretenimiento' },
      { input: { merchant: 'CFE' }, expectedCategory: 'Servicios' },
      { input: { merchant: 'Farmacias del Ahorro' }, expectedCategory: 'Farmacia' },
      { input: { merchant: 'Liverpool' }, expectedCategory: 'Ropa' },
      { input: { merchant: 'Aeromexico' }, expectedCategory: 'Viajes' },
    ];

    for (const testCase of cases) {
      const result = service.categorize(testCase.input);
      assert.strictEqual(
        result.categoryName,
        testCase.expectedCategory,
        `Comercio ${testCase.input.merchant} debe ser ${testCase.expectedCategory}`,
      );
      assert.strictEqual(result.method, 'MERCHANT_MAPPING');
      assert.strictEqual(result.isUserCorrection, false);
      assert.strictEqual(result.isFallback, false);
      assert.ok(result.confidence >= 90);
    }

    console.log('  [OK] Comercios reconocidos categorizados exitosamente en Etapa 1 (Merchant Mapping)');
  }

  // ── TEST 2: Etapa 2 - Reglas Sintácticas Determinísticas (Patrones y Keywords) ──
  console.log('\n[TEST 2] Etapa 2: Reglas sintácticas determinísticas por patrones y keywords');
  {
    const cases = [
      {
        input: { merchant: 'Taquería Don Pancho', description: 'Consumo alimentos' },
        expectedCategory: 'Restaurantes',
      },
      {
        input: { merchant: 'Pizzería Napolitana', description: 'Cena' },
        expectedCategory: 'Restaurantes',
      },
      {
        input: { merchant: 'Hospital San José', description: 'Consulta medicina general' },
        expectedCategory: 'Salud',
      },
      {
        input: { merchant: 'Estación de Servicio 4821', description: 'Carga de diesel' },
        expectedCategory: 'Gasolina',
      },
      {
        input: { merchant: 'Caseta Cuernavaca', description: 'Cobro de caseta peaje' },
        expectedCategory: 'Transporte',
      },
      {
        input: { merchant: 'Colegio Cervantes', description: 'Pago colegiatura mensual' },
        expectedCategory: 'Educación',
      },
      {
        input: { merchant: 'Hotel Boutique Oaxaca', description: 'Reserva fin de semana' },
        expectedCategory: 'Viajes',
      },
      {
        input: { merchant: 'Clínica Veterinaria PetCare', description: 'Vacunas perro' },
        expectedCategory: 'Mascota',
      },
      {
        input: { merchant: 'Dispersión Nómina Quincenal', type: 'INCOME' as const },
        expectedCategory: 'Salado', // Not exact match, rule sets 'Salario'
        expectedReal: 'Salario',
      },
      {
        input: { merchant: 'Traspaso SPEI', description: 'Transferencia interbancaria', type: 'TRANSFER' as const },
        expectedCategory: 'Transferencia',
      },
    ];

    for (const testCase of cases) {
      const result = service.categorize(testCase.input);
      const expected = testCase.expectedReal || testCase.expectedCategory;
      // console.log(`[DEBUG TEST 2] ${testCase.input.merchant} -> ${result.method} (${result.categoryName}, matched: ${result.matchedPattern})`);
      assert.strictEqual(
        result.categoryName,
        expected,
        `Patrón ${testCase.input.merchant} debe clasificarse como ${expected}`,
      );
      assert.strictEqual(
        result.method,
        'RULES',
        `Esperado RULES para ${testCase.input.merchant} pero obtuvo ${result.method} (matched: ${result.matchedPattern})`,
      );
      assert.strictEqual(result.isUserCorrection, false);
      assert.strictEqual(result.isFallback, false);
      assert.ok(result.confidence >= 80);
    }

    console.log('  [OK] Expresiones regulares y palabras clave categorizadas exitosamente en Etapa 2 (Rules)');
  }

  // ── TEST 3: Etapa 3 - Correcciones del Usuario (User Corrections) ───────────
  console.log('\n[TEST 3] Etapa 3: Correcciones del usuario (User Corrections)');
  {
    const userId = 'user-custom-456';

    // Comercio sin regla preexistente
    const unknownInput: CategorizationInput = {
      merchant: 'Tienda Artesanal Don Pepe',
      userId,
    };

    // Antes de la corrección, cae en Fallback
    const beforeResult = service.categorize(unknownInput);
    assert.strictEqual(beforeResult.method, 'FALLBACK');
    assert.strictEqual(beforeResult.categoryName, 'Otros');

    // Registrar corrección explícita del usuario
    service.registerUserCorrection({
      userId,
      merchantPattern: 'Tienda Artesanal Don Pepe',
      categoryName: 'Regalos',
    });

    // Ahora se resuelve en Etapa 3 (User Corrections)
    const afterResult = service.categorize(unknownInput);
    assert.strictEqual(afterResult.method, 'USER_CORRECTIONS');
    assert.strictEqual(afterResult.categoryName, 'Regalos');
    assert.strictEqual(afterResult.isUserCorrection, true);
    assert.strictEqual(afterResult.isFallback, false);
    assert.ok(afterResult.confidence >= 95);

    // Verificar aislamiento: otro usuario no ve esa corrección
    const otherUserResult = service.categorize({
      merchant: 'Tienda Artesanal Don Pepe',
      userId: 'other-user-999',
    });
    assert.strictEqual(otherUserResult.method, 'FALLBACK');

    console.log('  [OK] Correcciones de usuario registradas y aplicadas fielmente en Etapa 3');
  }

  // ── TEST 4: Etapa 4 - Fallback Determinístico ───────────────────────────────
  console.log('\n[TEST 4] Etapa 4: Fallback determinístico para comercios no reconocidos');
  {
    // Gasto totalmente desconocido
    const unknownExpense = service.categorize({
      merchant: 'XYZ987 OMEGA CORP',
      type: 'EXPENSE',
    });
    assert.strictEqual(unknownExpense.method, 'FALLBACK');
    assert.strictEqual(unknownExpense.categoryName, 'Otros');
    assert.strictEqual(unknownExpense.isFallback, true);
    assert.strictEqual(unknownExpense.confidence, 30);

    // Transferencia no reconocida
    const unknownTransfer = service.categorize({
      merchant: 'UNIDENTIFIED MOVEMENT',
      type: 'TRANSFER',
    });
    assert.strictEqual(unknownTransfer.method, 'FALLBACK');
    assert.strictEqual(unknownTransfer.categoryName, 'Transferencia');
    assert.strictEqual(unknownTransfer.isFallback, true);

    console.log('  [OK] Fallback determinístico asignado limpiamente ante ausencia de reglas');
  }

  // ── TEST 5: Cumplimiento Estricto de la Cascada (AC) ────────────────────────
  console.log('\n[TEST 5] Jerarquía estricta de la cascada: Merchant mapping → Rules → User corrections → Fallback');
  {
    const userId = 'user-cascade-test';

    // Oxxo coincide en Merchant Mapping (Etapa 1: Supermercado).
    // Si agregamos una regla sintáctica con "oxxo" para "Servicios", debe ganar Merchant Mapping (Etapa 1).
    service.addRule({
      id: 'test-rule-oxxo',
      categoryName: 'Servicios',
      patterns: [/oxxo/i],
      priority: 99,
    });

    const oxxoResult = service.categorize({ merchant: 'Oxxo', userId });
    assert.strictEqual(
      oxxoResult.method,
      'MERCHANT_MAPPING',
      'Merchant mapping debe preceder a Rules en la cascada',
    );
    assert.strictEqual(oxxoResult.categoryName, 'Supermercado');

    // Ahora probamos USER_FIRST: si el usuario solicita explícitamente priorizar correcciones personales
    service.registerUserCorrection({
      userId,
      merchantPattern: 'Oxxo',
      categoryName: 'Servicios',
    });

    const userFirstResult = service.categorize(
      { merchant: 'Oxxo', userId },
      { userCorrectionsPriority: 'USER_FIRST' },
    );
    assert.strictEqual(userFirstResult.method, 'USER_CORRECTIONS');
    assert.strictEqual(userFirstResult.categoryName, 'Servicios');

    // Limpiar regla de prueba
    service.removeRule('test-rule-oxxo');
    service.clearUserCorrections(userId);

    console.log('  [OK] Prioridad y secuencia de la cascada validada rigurosamente');
  }

  // ── TEST 6: Sin Dependencias de ML/LLM & Rendimiento Extremo ───────────────
  console.log('\n[TEST 6] Independencia de ML/LLM & Rendimiento instantáneo determinístico');
  {
    const start = Date.now();
    const iterations = 500;

    for (let i = 0; i < iterations; i++) {
      const res = service.categorize({
        merchant: i % 2 === 0 ? 'Starbucks' : 'Walmart Supercenter',
        type: 'EXPENSE',
      });
      assert.ok(res.categoryName.length > 0);
    }

    const elapsed = Date.now() - start;
    console.log(`  [OK] ${iterations} categorizaciones síncronas completadas en ${elapsed}ms (0 llamadas a ML/LLM)`);
    assert.ok(elapsed < 200, `Debe completarse en < 200ms (tomó ${elapsed}ms)`);
  }

  // ── TEST 7: Mapeos Dinámicos de Comercios en Runtime ─────────────────────────
  console.log('\n[TEST 7] Registro dinámico de mapeos de comercio en runtime');
  {
    service.setMerchantMapping('Abarrotes El Güero', 'Supermercado');

    const result = service.categorize({ merchant: 'Abarrotes El Güero' });
    assert.strictEqual(result.method, 'MERCHANT_MAPPING');
    assert.strictEqual(result.categoryName, 'Supermercado');

    console.log('  [OK] Mapeo dinámico registrado y evaluado en tiempo de ejecución');
  }

  // ── TEST 8: Reglas Sintácticas Dinámicas en Runtime ─────────────────────────
  console.log('\n[TEST 8] Reglas sintácticas dinámicas añadidas en runtime');
  {
    service.addRule({
      id: 'rule-custom-gym',
      categoryName: 'Salud',
      patterns: [/\b(gym|smart fit|gimnasio|crossfit)\b/i],
      priority: 92,
      description: 'Gimnasios y entrenamiento físico',
    });

    const gymResult = service.categorize({ merchant: 'Smart Fit Sucursal Insurgentes' });
    assert.strictEqual(gymResult.method, 'RULES');
    assert.strictEqual(gymResult.categoryName, 'Salud');

    service.removeRule('rule-custom-gym');
    console.log('  [OK] Reglas sintácticas en runtime añadidas y retiradas exitosamente');
  }

  // ── TEST 9: Integración y Mutación sobre TransactionCandidate ───────────────
  console.log('\n[TEST 9] Integración con TransactionCandidate (categorizeCandidate)');
  {
    const candidate = createMockCandidate({
      merchant: 'Uber',
      merchantRaw: 'UBER TRIP HELP.UBER.COM',
      type: 'EXPENSE',
    });

    const { candidate: updatedCand, result } = service.categorizeCandidate(candidate);

    assert.strictEqual(result.categoryName, 'Transporte');
    assert.strictEqual(updatedCand.metadata.categoryName, 'Transporte');
    assert.ok(updatedCand.metadata.categorization !== undefined);
    const catMeta = updatedCand.metadata.categorization as Record<string, unknown>;
    assert.strictEqual(catMeta.categoryName, 'Transporte');
    assert.strictEqual(catMeta.method, 'MERCHANT_MAPPING');

    console.log('  [OK] TransactionCandidate categorizado y metadata enriquecida');
  }

  // ── TEST 10: Integración y Mutación sobre Transaction Canónica ──────────────
  console.log('\n[TEST 10] Integración con Transaction (categorizeTransaction)');
  {
    const tx = createMockTransaction({
      merchant: 'Farmacias Guadalajara',
      merchantRaw: 'FARMACIAS GUADALAJARA SA DE CV',
    });

    const { transaction: updatedTx, result } = service.categorizeTransaction(tx);

    assert.strictEqual(result.categoryName, 'Farmacia');
    assert.strictEqual(updatedTx.metadata?.categoryName, 'Farmacia');
    const catMeta = updatedTx.metadata?.categorization as Record<string, unknown>;
    assert.strictEqual(catMeta.method, 'MERCHANT_MAPPING');

    console.log('  [OK] Transaction categorizada y metadata enriquecida');
  }

  // ── TEST 11: Manejo de Acentos, Diacríticos y Mayúsculas/Minúsculas ──────────
  console.log('\n[TEST 11] Normalización insensible a mayúsculas y diacríticos');
  {
    const variants = ['CAFÉ PUNTA DEL CIELO', 'café punta del cielo', 'Cafe Punta Del Cielo', 'CAFE PUNTA DEL CIELO'];
    for (const variant of variants) {
      const res = service.categorize({ merchant: variant });
      assert.strictEqual(res.categoryName, 'Cafeterías');
    }

    console.log('  [OK] Insensibilidad robusta a mayúsculas, minúsculas y acentos verificada');
  }

  // ── TEST 12: Casos Límite y Tolerancia ante Valores Vacíos ───────────────────
  console.log('\n[TEST 12] Tolerancia ante casos límite y valores vacíos');
  {
    const emptyResult = service.categorize({
      merchant: '',
      merchantRaw: null,
      description: undefined,
      type: 'EXPENSE',
    });
    assert.strictEqual(emptyResult.method, 'FALLBACK');
    assert.strictEqual(emptyResult.categoryName, 'Otros');

    const spacesResult = service.categorize({
      merchant: '     ',
      merchantRaw: '   ',
    });
    assert.strictEqual(spacesResult.method, 'FALLBACK');

    console.log('  [OK] Manejo seguro ante entradas nulas o vacías verificado');
  }

  console.log('\n[DONE] ¡Todos los tests de US-031 pasaron exitosamente (12/12)!');
}
