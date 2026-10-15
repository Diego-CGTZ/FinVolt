/**
 * BudgetValidatorService — Servicio de Dominio para Validación e Invariantes de Presupuesto (US-046)
 *
 * Aplica los Criterios de Aceptación (AC):
 * - Formato de mes válido (YYYY-MM).
 * - Monto positivo en unidades menores (centavos enteros).
 * - Rango de porcentaje individual [0, 100].
 * - Invariante estricta: Suma de porcentajes ≤ 100% por usuario y mes.
 * - Validación de duplicados (una categoría por mes por usuario).
 */

import {
  type Budget,
  type CreateBudgetInput,
  type UpdateBudgetInput,
  BudgetValidationError,
  BudgetPercentageOverflowError,
} from '../../models/Budget';

export class BudgetValidatorService {
  private static readonly MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
  private static readonly MAX_PERCENTAGE = 100.0;
  private static readonly TOLERANCE = 0.001;

  /**
   * Valida que el mes tenga formato estricto YYYY-MM
   */
  public static isValidMonth(month: string): boolean {
    if (!month || typeof month !== 'string') return false;
    return this.MONTH_REGEX.test(month.trim());
  }

  /**
   * Valida que el monto sea un entero positivo (centavos)
   */
  public static isValidAmountMinor(amountMinor: number): boolean {
    return Number.isInteger(amountMinor) && amountMinor > 0;
  }

  /**
   * Valida que el porcentaje esté entre 0 y 100
   */
  public static isValidPercentage(percentage: number): boolean {
    return typeof percentage === 'number' && !isNaN(percentage) && percentage >= 0 && percentage <= 100;
  }

  /**
   * Valida la invariante de suma de porcentajes acumulada para un mes.
   * Si candidate tiene un id existente, se omite su porcentaje anterior para el cálculo.
   */
  public static validateTotalPercentage(
    existingBudgets: Budget[],
    candidate: { id?: string; percentage: number },
    maxAllowed = BudgetValidatorService.MAX_PERCENTAGE,
  ): { valid: boolean; total: number; remaining: number } {
    if (!this.isValidPercentage(candidate.percentage)) {
      throw new BudgetValidationError(
        `Porcentaje inválido: ${candidate.percentage}. Debe ser un número entre 0 y 100.`
      );
    }

    // Sumar porcentajes de presupuestos activos en el mes, excluyendo el que se está actualizando
    const currentSum = existingBudgets
      .filter((b) => b.isActive && b.id !== candidate.id)
      .reduce((acc, b) => acc + Number(b.percentage), 0);

    const total = Number((currentSum + candidate.percentage).toFixed(2));
    const valid = total <= maxAllowed + this.TOLERANCE;
    const remaining = Math.max(0, Number((maxAllowed - total).toFixed(2)));

    if (!valid) {
      throw new BudgetPercentageOverflowError(total, maxAllowed);
    }

    return { valid, total, remaining };
  }

  /**
   * Construye y valida una nueva entidad de presupuesto
   */
  public static createEntity(
    input: CreateBudgetInput,
    existingMonthBudgets: Budget[] = [],
  ): Budget {
    const month = input.month?.trim();
    if (!this.isValidMonth(month)) {
      throw new BudgetValidationError(
        `Formato de mes inválido: "${input.month}". Se espera YYYY-MM (ej. 2026-10).`
      );
    }

    if (!input.categoryId || typeof input.categoryId !== 'string' || input.categoryId.trim() === '') {
      throw new BudgetValidationError('La categoría del presupuesto es requerida.');
    }

    if (!input.userId || typeof input.userId !== 'string' || input.userId.trim() === '') {
      throw new BudgetValidationError('El usuario del presupuesto es requerido.');
    }

    if (!this.isValidAmountMinor(input.amountMinor)) {
      throw new BudgetValidationError(
        `El monto en minor units debe ser un entero positivo. Recibido: ${input.amountMinor}`
      );
    }

    // Verificar si ya existe un presupuesto para esta categoría en este mes
    const duplicate = existingMonthBudgets.find(
      (b) => b.isActive && b.categoryId === input.categoryId && b.month === month && b.id !== input.id
    );
    if (duplicate) {
      throw new BudgetValidationError(
        `Ya existe un presupuesto activo para la categoría "${input.categoryId}" en el periodo ${month}.`
      );
    }

    // Validar invariante de suma de porcentajes ≤ 100%
    this.validateTotalPercentage(existingMonthBudgets, {
      id: input.id,
      percentage: input.percentage,
    });

    const now = new Date();
    return {
      id: input.id || `budget-${Math.random().toString(36).substring(2, 11)}`,
      userId: input.userId,
      categoryId: input.categoryId,
      month,
      amountMinor: input.amountMinor,
      amount: Number((input.amountMinor / 100).toFixed(2)),
      percentage: Number(input.percentage.toFixed(2)),
      currency: input.currency?.toUpperCase() || 'MXN',
      notes: input.notes?.trim() || null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Aplica actualización validando invariantes sobre un presupuesto existente
   */
  public static applyUpdate(
    current: Budget,
    update: UpdateBudgetInput,
    existingMonthBudgets: Budget[] = [],
  ): Budget {
    let newAmountMinor = current.amountMinor;
    if (update.amountMinor !== undefined) {
      if (!this.isValidAmountMinor(update.amountMinor)) {
        throw new BudgetValidationError(
          `El monto en minor units debe ser un entero positivo. Recibido: ${update.amountMinor}`
        );
      }
      newAmountMinor = update.amountMinor;
    }

    let newPercentage = current.percentage;
    if (update.percentage !== undefined) {
      this.validateTotalPercentage(existingMonthBudgets, {
        id: current.id,
        percentage: update.percentage,
      });
      newPercentage = Number(update.percentage.toFixed(2));
    }

    return {
      ...current,
      amountMinor: newAmountMinor,
      amount: Number((newAmountMinor / 100).toFixed(2)),
      percentage: newPercentage,
      notes: update.notes !== undefined ? (update.notes?.trim() || null) : current.notes,
      isActive: update.isActive !== undefined ? update.isActive : current.isActive,
      updatedAt: new Date(),
    };
  }
}
