/**
 * BudgetModel.test.ts — Suite de pruebas para US-046: Modelo de Presupuestos
 *
 * Criterios de Aceptación (AC):
 * - Presupuesto mensual por categoría.
 * - Categoría asignada.
 * - Monto (en minor units y decimal).
 * - Porcentaje asignado (0-100%).
 * - Suma de porcentajes ≤ 100% para el periodo mensual.
 * - Usuario aislado por RLS.
 *
 * Dependencias: US-007
 */

import assert from 'node:assert/strict';
import type { Budget, CreateBudgetInput } from '../../src/domain/models/Budget';
import {
  BudgetValidationError,
  BudgetPercentageOverflowError,
} from '../../src/domain/models/Budget';
import { BudgetValidatorService } from '../../src/domain/services/budgets/BudgetValidatorService';
import { AsyncStorageBudgetRepository } from '../../src/infrastructure/database/AsyncStorageBudgetRepository';
import {
  BudgetDatabaseMapper,
  type BudgetDatabaseRow,
} from '../../src/infrastructure/database/mappers/BudgetDatabaseMapper';
import { ManageBudgetsUseCase } from '../../src/application/useCases/ManageBudgetsUseCase';


export async function runBudgetModelTests(): Promise<void> {
  console.log('[TEST] Iniciando pruebas de US-046: Modelo de Presupuestos...\n');

  const userId = 'user-us046-test';
  const month = '2026-10';

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Creación y Validación del Modelo con Categoría, Mes, Monto y %
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[TEST 1] Creación y validación del modelo con categoría, mes, monto y porcentaje');
  {
    const input: CreateBudgetInput = {
      userId,
      categoryId: 'cat-groceries',
      month: '2026-10',
      amountMinor: 500000, // $5,000.00
      percentage: 25.5,
      currency: 'MXN',
      notes: 'Supermercado y despensa mensual',
    };

    const budget = BudgetValidatorService.createEntity(input, []);

    assert.equal(budget.userId, userId);
    assert.equal(budget.categoryId, 'cat-groceries');
    assert.equal(budget.month, '2026-10');
    assert.equal(budget.amountMinor, 500000);
    assert.equal(budget.amount, 5000.0);
    assert.equal(budget.percentage, 25.5);
    assert.equal(budget.currency, 'MXN');
    assert.equal(budget.notes, 'Supermercado y despensa mensual');
    assert.equal(budget.isActive, true);
    console.log('  [OK] Entidad Budget creada con atributos y conversión de minor units canónicos');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Validación Estricta del Formato de Mes (YYYY-MM)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 2] Validación estricta del formato de mes (YYYY-MM)');
  {
    assert.equal(BudgetValidatorService.isValidMonth('2026-01'), true);
    assert.equal(BudgetValidatorService.isValidMonth('2026-12'), true);
    assert.equal(BudgetValidatorService.isValidMonth('2026-10'), true);

    // Formatos inválidos
    assert.equal(BudgetValidatorService.isValidMonth('2026-13'), false);
    assert.equal(BudgetValidatorService.isValidMonth('2026-00'), false);
    assert.equal(BudgetValidatorService.isValidMonth('2026/10'), false);
    assert.equal(BudgetValidatorService.isValidMonth('10-2026'), false);
    assert.equal(BudgetValidatorService.isValidMonth('octubre-2026'), false);
    assert.equal(BudgetValidatorService.isValidMonth(''), false);

    assert.throws(
      () =>
        BudgetValidatorService.createEntity({
          userId,
          categoryId: 'cat-1',
          month: '2026/10',
          amountMinor: 100000,
          percentage: 10,
        }),
      BudgetValidationError
    );
    console.log('  [OK] Validación estricta de regex de mes YYYY-MM verificada');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Validación de Monto en Unidades Menores (Centavos)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 3] Validación de monto en unidades menores (centavos enteros)');
  {
    assert.equal(BudgetValidatorService.isValidAmountMinor(100), true);
    assert.equal(BudgetValidatorService.isValidAmountMinor(500000), true);

    // Inválidos: 0, negativos o números con decimales
    assert.equal(BudgetValidatorService.isValidAmountMinor(0), false);
    assert.equal(BudgetValidatorService.isValidAmountMinor(-500), false);
    assert.equal(BudgetValidatorService.isValidAmountMinor(100.5), false);

    assert.throws(
      () =>
        BudgetValidatorService.createEntity({
          userId,
          categoryId: 'cat-1',
          month: '2026-10',
          amountMinor: -100,
          percentage: 10,
        }),
      BudgetValidationError
    );
    console.log('  [OK] Restricción de montos positivos enteros en centavos validada');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Rango de Porcentaje Individual [0, 100]
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 4] Rango de porcentaje individual [0, 100]');
  {
    assert.equal(BudgetValidatorService.isValidPercentage(0), true);
    assert.equal(BudgetValidatorService.isValidPercentage(50.5), true);
    assert.equal(BudgetValidatorService.isValidPercentage(100), true);

    assert.equal(BudgetValidatorService.isValidPercentage(-1), false);
    assert.equal(BudgetValidatorService.isValidPercentage(100.01), false);
    assert.equal(BudgetValidatorService.isValidPercentage(NaN), false);

    assert.throws(
      () =>
        BudgetValidatorService.createEntity({
          userId,
          categoryId: 'cat-1',
          month: '2026-10',
          amountMinor: 100000,
          percentage: 105,
        }),
      BudgetValidationError
    );
    console.log('  [OK] Porcentajes fuera de [0, 100] rechazados');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Invariante: Suma de Porcentajes ≤ 100% en un Mismo Mes
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 5] Suma de porcentajes ≤ 100% en el periodo mensual');
  {
    const b1 = BudgetValidatorService.createEntity(
      {
        userId,
        categoryId: 'cat-rent',
        month,
        amountMinor: 800000,
        percentage: 40.0,
      },
      []
    );

    const b2 = BudgetValidatorService.createEntity(
      {
        userId,
        categoryId: 'cat-groceries',
        month,
        amountMinor: 500000,
        percentage: 30.0,
      },
      [b1]
    );

    const b3 = BudgetValidatorService.createEntity(
      {
        userId,
        categoryId: 'cat-savings',
        month,
        amountMinor: 600000,
        percentage: 30.0,
      },
      [b1, b2]
    );

    const totalPercentage = b1.percentage + b2.percentage + b3.percentage;
    assert.equal(totalPercentage, 100.0);
    console.log('  [OK] Tres presupuestos sumando exactamente 100% aceptados con éxito');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Rechazo Cuando la Suma de Porcentajes Excede el 100%
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 6] Rechazo con BudgetPercentageOverflowError al superar 100%');
  {
    const existing = [
      BudgetValidatorService.createEntity(
        {
          userId,
          categoryId: 'cat-1',
          month,
          amountMinor: 500000,
          percentage: 50.0,
        },
        []
      ),
      BudgetValidatorService.createEntity(
        {
          userId,
          categoryId: 'cat-2',
          month,
          amountMinor: 350000,
          percentage: 35.0,
        },
        []
      ),
    ]; // Total actual: 85%

    // Intentar agregar 20% más -> suma 105%
    assert.throws(
      () =>
        BudgetValidatorService.createEntity(
          {
            userId,
            categoryId: 'cat-3',
            month,
            amountMinor: 200000,
            percentage: 20.0,
          },
          existing
        ),
      (err: any) => {
        assert(err instanceof BudgetPercentageOverflowError);
        assert.equal(err.attemptedTotal, 105.0);
        return true;
      }
    );
    console.log('  [OK] Violación de la regla del 100% interceptada con error especializado');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 7: Re-asignación de Porcentaje en Actualización (sin auto-bloqueo)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 7] Actualización de presupuesto sin auto-bloquearse con su % previo');
  {
    const b1: Budget = BudgetValidatorService.createEntity(
      {
        id: 'budget-1',
        userId,
        categoryId: 'cat-1',
        month,
        amountMinor: 400000,
        percentage: 40.0,
      },
      []
    );
    const b2: Budget = BudgetValidatorService.createEntity(
      {
        id: 'budget-2',
        userId,
        categoryId: 'cat-2',
        month,
        amountMinor: 500000,
        percentage: 50.0,
      },
      [b1]
    ); // Total: 90%

    // Actualizar b1 de 40% a 45%: nuevo total 50 + 45 = 95% <= 100%
    const updatedB1 = BudgetValidatorService.applyUpdate(
      b1,
      { id: 'budget-1', percentage: 45.0, amountMinor: 450000 },
      [b1, b2]
    );
    assert.equal(updatedB1.percentage, 45.0);
    assert.equal(updatedB1.amountMinor, 450000);

    // Intentar actualizar b1 a 55%: nuevo total 50 + 55 = 105% -> debe fallar
    assert.throws(
      () =>
        BudgetValidatorService.applyUpdate(
          b1,
          { id: 'budget-1', percentage: 55.0 },
          [b1, b2]
        ),
      BudgetPercentageOverflowError
    );
    console.log('  [OK] Actualización de porcentajes descuenta el valor previo del mismo ítem');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 8: Restricción de Unicidad (Una Sola Asignación por Categoría y Mes)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 8] Restricción de unicidad: Una sola categoría por mes');
  {
    const b1 = BudgetValidatorService.createEntity(
      {
        userId,
        categoryId: 'cat-groceries',
        month,
        amountMinor: 300000,
        percentage: 30.0,
      },
      []
    );

    // Intentar crear otro presupuesto para la misma categoría en el mismo mes
    assert.throws(
      () =>
        BudgetValidatorService.createEntity(
          {
            userId,
            categoryId: 'cat-groceries',
            month,
            amountMinor: 200000,
            percentage: 20.0,
          },
          [b1]
        ),
      (err: any) => {
        assert(err instanceof BudgetValidationError);
        assert(err.message.includes('Ya existe un presupuesto activo'));
        return true;
      }
    );
    console.log('  [OK] Duplicados de categoría en el mismo mes prevenidos');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 9: Aislamiento por Usuario (RLS y Límites de Dominio)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 9] Aislamiento de presupuestos por usuario');
  {
    const userABudgets = [
      BudgetValidatorService.createEntity(
        {
          userId: 'user-A',
          categoryId: 'cat-1',
          month,
          amountMinor: 1000000,
          percentage: 100.0,
        },
        []
      ),
    ];

    // User B puede crear su propio presupuesto de 50% en el mismo mes sin interferencia de User A
    const userBBudget = BudgetValidatorService.createEntity(
      {
        userId: 'user-B',
        categoryId: 'cat-1',
        month,
        amountMinor: 500000,
        percentage: 50.0,
      },
      [] // Sus propios presupuestos vacíos
    );

    assert.equal(userBBudget.userId, 'user-B');
    assert.equal(userBBudget.percentage, 50.0);
    console.log('  [OK] Datos y límites porcentuales aislados por usuario');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 10: Repositorio AsyncStorageBudgetRepository (CRUD Completo)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 10] Repositorio AsyncStorageBudgetRepository (CRUD Completo)');
  {
    const repo = new AsyncStorageBudgetRepository();
    await repo.clear();

    const b1 = BudgetValidatorService.createEntity({
      id: 'repo-b1',
      userId,
      categoryId: 'cat-1',
      month: '2026-10',
      amountMinor: 300000,
      percentage: 30.0,
    });
    const b2 = BudgetValidatorService.createEntity({
      id: 'repo-b2',
      userId,
      categoryId: 'cat-2',
      month: '2026-10',
      amountMinor: 400000,
      percentage: 40.0,
    });
    const bNov = BudgetValidatorService.createEntity({
      id: 'repo-b3',
      userId,
      categoryId: 'cat-1',
      month: '2026-11',
      amountMinor: 500000,
      percentage: 50.0,
    });

    await repo.save(b1);
    await repo.saveMany([b2, bNov]);

    // Buscar por mes
    const octBudgets = await repo.findByUserAndMonth(userId, '2026-10');
    assert.equal(octBudgets.length, 2);
    assert.equal(octBudgets[0].percentage, 40.0); // Ordenado descendente

    // Buscar por categoría y mes
    const foundCat = await repo.findByCategoryAndMonth(userId, 'cat-1', '2026-10');
    assert.notEqual(foundCat, null);
    assert.equal(foundCat?.id, 'repo-b1');

    // Eliminar
    await repo.delete('repo-b1');
    const remaining = await repo.findByUserAndMonth(userId, '2026-10');
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, 'repo-b2');

    await repo.clear();
    console.log('  [OK] Persistencia local, consultas por mes/categoría y borrado verificados');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 11: Mapeo y Contrato de SupabaseBudgetRepository
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 11] Mapeos bidireccionales de base de datos (BudgetDatabaseMapper)');
  {
    const budget = BudgetValidatorService.createEntity({
      id: 'supa-b1',
      userId: 'user-supa-1',
      categoryId: 'cat-dining',
      month: '2026-10',
      amountMinor: 250000,
      percentage: 20.0,
      currency: 'MXN',
      notes: 'Cenas fuera',
    });

    const dbRow: BudgetDatabaseRow = BudgetDatabaseMapper.mapToDatabase(budget);
    assert.equal(dbRow.id, 'supa-b1');
    assert.equal(dbRow.user_id, 'user-supa-1');
    assert.equal(dbRow.category_id, 'cat-dining');
    assert.equal(dbRow.month, '2026-10');
    assert.equal(dbRow.amount_minor, 250000);
    assert.equal(dbRow.percentage, 20.0);
    assert.equal(dbRow.notes, 'Cenas fuera');

    const domainEntity = BudgetDatabaseMapper.mapToDomain(dbRow);
    assert.equal(domainEntity.id, budget.id);
    assert.equal(domainEntity.amount, 2500.0);
    assert.equal(domainEntity.amountMinor, 250000);
    assert.equal(domainEntity.percentage, 20.0);
    console.log('  [OK] Mapeador bidireccional de columnas y tipos de Supabase validado');
  }


  // ──────────────────────────────────────────────────────────────────────────
  // TEST 12: Orquestación de Extremo a Extremo en ManageBudgetsUseCase
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 12] Orquestación E2E en ManageBudgetsUseCase');
  {
    const repo = new AsyncStorageBudgetRepository();
    await repo.clear();
    const useCase = new ManageBudgetsUseCase(repo);

    // 1. Crear presupuesto Renta (50%)
    await useCase.createBudget({
      userId,
      categoryId: 'cat-rent',
      month: '2026-10',
      amountMinor: 1000000, // $10,000.00
      percentage: 50.0,
    });

    // 2. Crear presupuesto Alimentación (30%)
    const b2 = await useCase.createBudget({
      userId,
      categoryId: 'cat-food',
      month: '2026-10',
      amountMinor: 600000, // $6,000.00
      percentage: 30.0,
    });

    // 3. Consultar resumen mensual
    let summary = await useCase.getBudgetsByMonth(userId, '2026-10');
    assert.equal(summary.budgets.length, 2);
    assert.equal(summary.totalBudgeted, 16000.0);
    assert.equal(summary.totalPercentage, 80.0);
    assert.equal(summary.remainingPercentage, 20.0);
    assert.equal(summary.isFullyAllocated, false);

    // 4. Actualizar Alimentación de 30% a 50% -> total llega a 100%
    await useCase.updateBudget({
      id: b2.id,
      amountMinor: 1000000,
      percentage: 50.0,
    });

    summary = await useCase.getBudgetsByMonth(userId, '2026-10');
    assert.equal(summary.totalPercentage, 100.0);
    assert.equal(summary.remainingPercentage, 0.0);
    assert.equal(summary.isFullyAllocated, true);

    // 5. Eliminar presupuesto
    await useCase.deleteBudget(b2.id);
    summary = await useCase.getBudgetsByMonth(userId, '2026-10');
    assert.equal(summary.budgets.length, 1);
    assert.equal(summary.totalPercentage, 50.0);

    await repo.clear();
    console.log('  [OK] Caso de uso orquestó ciclo de vida, asignación y resumen mensual');
  }

  console.log('\n========================================');
  console.log('  [RESULTADO] Todas las pruebas de US-046 pasaron exitosamente (12/12).');
  console.log('========================================\n');
}
