/**
 * US-024: Pruebas unitarias para Normalización de Merchants
 *
 * Acceptance Criteria:
 * - raw_merchant y normalized_merchant: conservar el valor original y generar el nombre canónico.
 * - Reglas configurables: motor de reglas extensibles/personalizables con prioridades.
 * - Variantes como Amazon/Uber se agrupan correctamente.
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
assert.deepStrictEqual = (actual: unknown, expected: unknown, msg?: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      msg || `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
    );
  }
};
assert.ok = (condition: unknown, msg?: string): asserts condition => {
  if (!condition) throw new Error(msg || 'Expected truthy');
};
assert.rejects = async (fn: () => Promise<unknown>, errorRegex: RegExp) => {
  try {
    await fn();
    throw new Error('Expected promise to reject');
  } catch (err: any) {
    if (!errorRegex.test(err.message)) {
      throw new Error(`Expected error matching ${errorRegex} but got: ${err.message}`);
    }
  }
};

import { MerchantNormalizer } from '../../src/domain/services/MerchantNormalizer';
import { InMemoryMerchantRuleRepository } from '../../src/infrastructure/database/InMemoryMerchantRuleRepository';
import type { CreateMerchantRuleDTO } from '../../src/domain/models/MerchantRule';

export async function runMerchantNormalizerTests() {
  console.log('[TEST] Iniciando pruebas de US-024: Normalización de Merchants...');

  const repository = new InMemoryMerchantRuleRepository(true);
  const normalizer = new MerchantNormalizer(repository);

  // --------------------------------------------------------------------------
  // TEST 1: Conservación de raw_merchant e integridad de normalized_merchant
  // --------------------------------------------------------------------------
  console.log('\n[TEST 1] Conservación de raw_merchant e integridad de normalized_merchant');
  {
    const raw = '  AMZN Mktp US*123  ';
    const result = await normalizer.normalize(raw);

    assert.strictEqual(
      result.rawMerchant,
      'AMZN Mktp US*123',
      'rawMerchant debe conservarse fielmente',
    );
    assert.strictEqual(
      result.normalizedMerchant,
      'Amazon',
      'normalizedMerchant debe ser el canónico Amazon',
    );
    assert.strictEqual(
      result.canonicalName,
      'Amazon',
      'canonicalName debe ser igual a normalizedMerchant',
    );
    assert.ok(result.confidence >= 90, 'Confianza debe ser alta para regla coincidente');
    console.log(
      '  [OK] raw_merchant preservado intacto y normalized_merchant generado correctamente',
    );
  }

  // --------------------------------------------------------------------------
  // TEST 2: Agrupación correcta de variantes de Amazon
  // --------------------------------------------------------------------------
  console.log('\n[TEST 2] Agrupación correcta de variantes de Amazon');
  {
    const amazonVariants = [
      'AMZN Mktp US*9841',
      'AMAZON.COM.MX',
      'AMAZON MX',
      'Amazon MX Marketplace',
      'AMZN DIGITAL*999',
      'AMAZON MEXICO S.A. DE C.V.',
      'AMZN MKTP US',
      'AMAZON',
    ];

    for (const variant of amazonVariants) {
      const res = await normalizer.normalize(variant);
      assert.strictEqual(
        res.normalizedMerchant,
        'Amazon',
        `Variante "${variant}" debió agruparse como "Amazon", pero fue "${res.normalizedMerchant}"`,
      );
    }
    console.log('  [OK] Todas las 8 variantes de Amazon se agruparon correctamente en "Amazon"');
  }

  // --------------------------------------------------------------------------
  // TEST 3: Agrupación diferenciada con prioridades: Amazon vs Amazon Prime vs AWS
  // --------------------------------------------------------------------------
  console.log('\n[TEST 3] Agrupación diferenciada con prioridades: Amazon vs Amazon Prime vs AWS');
  {
    const primeRes = await normalizer.normalize('AMAZON PRIME VIDEO SUBSCRIPTION');
    assert.strictEqual(
      primeRes.normalizedMerchant,
      'Amazon Prime',
      'Debe ganar Amazon Prime por mayor prioridad',
    );

    const awsRes = await normalizer.normalize('AMAZON WEB SERVICES CLOUD');
    assert.strictEqual(
      awsRes.normalizedMerchant,
      'Amazon Web Services',
      'Debe ganar AWS por mayor prioridad',
    );

    const standardRes = await normalizer.normalize('COMPRA AMAZON MEXICO');
    assert.strictEqual(
      standardRes.normalizedMerchant,
      'Amazon',
      'Debe normalizarse como Amazon estándar',
    );

    console.log('  [OK] Resolución de prioridades correcta para sub-marcas de Amazon');
  }

  // --------------------------------------------------------------------------
  // TEST 4: Agrupación correcta de variantes de Uber vs Uber Eats
  // --------------------------------------------------------------------------
  console.log('\n[TEST 4] Agrupación correcta de variantes de Uber vs Uber Eats');
  {
    const uberVariants = [
      'UBER *TRIP HELP.UBER',
      'UBER BV PENDING',
      'UBER TRIP 12345',
      'UBER TECHNOLOGIES',
      'UBER MX RIDES',
    ];

    for (const variant of uberVariants) {
      const res = await normalizer.normalize(variant);
      assert.strictEqual(
        res.normalizedMerchant,
        'Uber',
        `Variante de transporte "${variant}" debió agruparse como "Uber"`,
      );
    }

    const uberEatsVariants = [
      'UBER *EATS PENDING',
      'UBEREATS',
      'UBER EATS RESTAURANT CDMX',
      'UBER * EATS 9948',
    ];

    for (const variant of uberEatsVariants) {
      const res = await normalizer.normalize(variant);
      assert.strictEqual(
        res.normalizedMerchant,
        'Uber Eats',
        `Variante de delivery "${variant}" debió agruparse como "Uber Eats" por mayor prioridad`,
      );
    }

    console.log(
      '  [OK] Uber (transporte) y Uber Eats (delivery) agrupados y discriminados correctamente',
    );
  }

  // --------------------------------------------------------------------------
  // TEST 5: Agrupación de comercios cotidianos populares (Oxxo, Walmart, Starbucks, etc.)
  // --------------------------------------------------------------------------
  console.log('\n[TEST 5] Agrupación de comercios cotidianos populares');
  {
    const cases: Array<{ raw: string; expected: string }> = [
      { raw: 'CADENA COMERCIAL OXXO SUC 124', expected: 'Oxxo' },
      { raw: 'NUEVA WAL MART DE MEXICO S. DE R.L. DE C.V.', expected: 'Walmart' },
      { raw: 'WALMART SUPER CDMX', expected: 'Walmart' },
      { raw: 'ALSEA STARBUCKS COFFEE POLANCO', expected: 'Starbucks' },
      { raw: 'NETFLIX.COM INTERNET', expected: 'Netflix' },
      { raw: 'SPOTIFY MEXICO S DE RL', expected: 'Spotify' },
      { raw: 'APPLE.COM/BILL ITUNES', expected: 'Apple' },
      { raw: 'GOOGLE *SERVICES YOUTUBE', expected: 'Google' },
      { raw: 'MERCADO LIBRE MEXICO', expected: 'Mercado Libre' },
      { raw: 'MERCADO PAGO TIENDA VIRTUAL', expected: 'Mercado Pago' },
      { raw: 'DIDI *FOOD RESTAURANTE', expected: 'DiDi Food' },
      { raw: 'DIDI MOBILITY MEXICO', expected: 'DiDi' },
      { raw: 'DISTRIBUIDORA LIVERPOOL INSURGENTES', expected: 'Liverpool' },
      { raw: 'COSTCO WHOLESALE POLANCO', expected: 'Costco' },
      { raw: 'FARMACIAS GUADALAJARA SUC 09', expected: 'Farmacias Guadalajara' },
    ];

    for (const item of cases) {
      const res = await normalizer.normalize(item.raw);
      assert.strictEqual(
        res.normalizedMerchant,
        item.expected,
        `"${item.raw}" debió normalizarse como "${item.expected}" pero fue "${res.normalizedMerchant}"`,
      );
    }
    console.log('  [OK] Catálogo de comercios cotidianos verificado exitosamente');
  }

  // --------------------------------------------------------------------------
  // TEST 6: Pre-limpieza de pasarelas de pago y prefijos financieros
  // --------------------------------------------------------------------------
  console.log('\n[TEST 6] Pre-limpieza de pasarelas de pago y prefijos');
  {
    const cleanedStripe = normalizer.preCleanMerchant('STRIPE *NOTION LABS');
    assert.strictEqual(cleanedStripe, 'NOTION LABS');

    const cleanedPaypal = normalizer.preCleanMerchant('PAYPAL *GITHUB');
    assert.strictEqual(cleanedPaypal, 'GITHUB');

    const cleanedClip = normalizer.preCleanMerchant('CLIP *TAQUERIA EL GUERO');
    assert.strictEqual(cleanedClip, 'TAQUERIA EL GUERO');

    const cleanedPagoEn = normalizer.preCleanMerchant('PAGO EN FARMACIA SAN PABLO');
    assert.strictEqual(cleanedPagoEn, 'FARMACIA SAN PABLO');

    console.log('  [OK] Prefijos de pasarelas y terminales removidos limpiamente');
  }

  // --------------------------------------------------------------------------
  // TEST 7: Limpieza de formas societarias, sufijos geográficos y hashes
  // --------------------------------------------------------------------------
  console.log('\n[TEST 7] Limpieza de formas societarias, sufijos geográficos y hashes');
  {
    const cleanedCorp = normalizer.preCleanMerchant('TIENDAS COMERCIALES S.A. DE C.V.');
    assert.strictEqual(cleanedCorp, 'TIENDAS COMERCIALES');

    const cleanedLocation = normalizer.preCleanMerchant('RESTAURANTE EL PORTON CDMX');
    assert.strictEqual(cleanedLocation, 'RESTAURANTE EL PORTON');

    const cleanedHash = normalizer.preCleanMerchant('SUPERMERCADO CENTRAL *89211');
    assert.strictEqual(cleanedHash, 'SUPERMERCADO CENTRAL');

    console.log('  [OK] Sufijos corporativos, ubicaciones y hashes filtrados exitosamente');
  }

  // --------------------------------------------------------------------------
  // TEST 8: Reglas configurables dinámicas en runtime (gestión de reglas)
  // --------------------------------------------------------------------------
  console.log('\n[TEST 8] Reglas configurables dinámicas en runtime');
  {
    const customRepo = new InMemoryMerchantRuleRepository(true);
    const customNormalizer = new MerchantNormalizer(customRepo);

    // 1. Antes de agregar la regla personalizada
    const beforeResult = await customNormalizer.normalize('TACOS LOS PARADOS SUC POLANCO');
    assert.strictEqual(beforeResult.normalizedMerchant, 'Tacos los Parados');

    // 2. Agregar regla personalizada del usuario
    const newRule: CreateMerchantRuleDTO = {
      merchantName: 'Taquería Los Parados',
      patterns: ['LOS PARADOS', 'TACOS LOS PARADOS'],
      patternType: 'CONTAINS',
      priority: 80,
      categoryHint: 'Comida y Restaurantes',
      isUserDefined: true,
      userId: 'user-diego',
    };

    const created = await customNormalizer.addRule(newRule);
    assert.ok(created.id, 'La regla debe tener ID generado');

    // 3. Normalizar con la nueva regla activa
    const afterResult = await customNormalizer.normalize('TACOS LOS PARADOS SUC POLANCO', {
      userId: 'user-diego',
    });
    assert.strictEqual(afterResult.normalizedMerchant, 'Taquería Los Parados');
    assert.strictEqual(afterResult.ruleId, created.id);
    assert.strictEqual(afterResult.categoryHint, 'Comida y Restaurantes');

    // 4. Desactivar la regla y verificar que vuelva a fallback
    await customRepo.update(created.id, { isActive: false });
    const deactivatedResult = await customNormalizer.normalize('TACOS LOS PARADOS SUC POLANCO', {
      userId: 'user-diego',
    });
    assert.strictEqual(deactivatedResult.normalizedMerchant, 'Tacos los Parados');

    console.log('  [OK] Creación, activación y desactivación de reglas configurables verificado');
  }

  // --------------------------------------------------------------------------
  // TEST 9: Fallback inteligente en Title Case cuando no hay regla conocida
  // --------------------------------------------------------------------------
  console.log('\n[TEST 9] Fallback inteligente en Title Case');
  {
    const fallbackRes = await normalizer.normalize('PANADERIA LA ESPERANZA SUC 04');
    assert.strictEqual(fallbackRes.normalizedMerchant, 'Panaderia la Esperanza');
    assert.strictEqual(fallbackRes.rawMerchant, 'PANADERIA LA ESPERANZA SUC 04');
    assert.ok(fallbackRes.confidence > 0 && fallbackRes.confidence < 90);

    console.log(
      '  [OK] Fallback determinístico a Title Case funcionando sin dependencias externas',
    );
  }

  // --------------------------------------------------------------------------
  // TEST 10: Manejo robusto de casos límite (null, vacío, solo símbolos)
  // --------------------------------------------------------------------------
  console.log('\n[TEST 10] Manejo robusto de casos límite');
  {
    const nullRes = await normalizer.normalize(null);
    assert.strictEqual(nullRes.rawMerchant, null);
    assert.strictEqual(nullRes.normalizedMerchant, null);
    assert.strictEqual(nullRes.confidence, 0);

    const emptyRes = await normalizer.normalize('   ');
    assert.strictEqual(emptyRes.normalizedMerchant, null);
    assert.strictEqual(emptyRes.confidence, 0);

    const symbolsRes = await normalizer.normalize('***---###');
    assert.ok(symbolsRes !== null);

    console.log('  [OK] Manejo seguro y tolerante ante valores vacíos o anómalos');
  }

  // --------------------------------------------------------------------------
  // TEST 11: Normalización síncrona (normalizeSync) para parsers
  // --------------------------------------------------------------------------
  console.log('\n[TEST 11] Normalización síncrona (normalizeSync)');
  {
    const syncRes = normalizer.normalizeSync('AMZN Mktp US*9841');
    assert.strictEqual(syncRes.normalizedMerchant, 'Amazon');
    assert.strictEqual(syncRes.rawMerchant, 'AMZN Mktp US*9841');

    const syncUber = normalizer.normalizeSync('UBER *EATS 123');
    assert.strictEqual(syncUber.normalizedMerchant, 'Uber Eats');

    console.log('  [OK] Método síncrono normalizeSync verificado exitosamente');
  }

  console.log('\n[DONE] ¡Todos los tests de US-024 pasaron exitosamente (11/11)!');
}
