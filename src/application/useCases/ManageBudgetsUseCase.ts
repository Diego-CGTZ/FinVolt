/**
 * ManageBudgetsUseCase — Caso de Uso de Presupuestos (US-046)
 *
 * Orquesta la creación, actualización, consulta mensual y eliminación de presupuestos por categoría.
 * Garantiza la invariante de negocio: suma de porcentajes ≤ 100% por usuario y mes.
 */

import type {
  Budget,
  CreateBudgetInput,
  UpdateBudgetInput,
  BudgetMonthlySummary,
} from '../../domain/models/Budget';
import { BudgetValidationError } from '../../domain/models/Budget';
import { BudgetValidatorService } from '../../domain/services/budgets/BudgetValidatorService';
import type { IBudgetRepository } from '../../domain/repositories/IBudgetRepository';

export class ManageBudgetsUseCase {
  constructor(private readonly budgetRepo: IBudgetRepository) {}

  /**
   * Crea un nuevo presupuesto mensual por categoría validando la regla de suma <= 100%
   */
  public async createBudget(input: CreateBudgetInput): Promise<Budget> {
    const month = input.month?.trim();
    const existing = await this.budgetRepo.findByUserAndMonth(input.userId, month);

    const budget = BudgetValidatorService.createEntity(input, existing);
    await this.budgetRepo.save(budget);
    return budget;
  }

  /**
   * Actualiza el monto, porcentaje o notas de un presupuesto existente
   */
  public async updateBudget(input: UpdateBudgetInput): Promise<Budget> {
    const existing = await this.budgetRepo.findById(input.id);
    if (!existing) {
      throw new BudgetValidationError(`Presupuesto no encontrado: "${input.id}"`);
    }

    const monthBudgets = await this.budgetRepo.findByUserAndMonth(
      existing.userId,
      existing.month
    );

    const updated = BudgetValidatorService.applyUpdate(existing, input, monthBudgets);
    await this.budgetRepo.save(updated);
    return updated;
  }

  /**
   * Obtiene el resumen consolidado de presupuestos de un usuario para un mes dado
   */
  public async getBudgetsByMonth(
    userId: string,
    month: string
  ): Promise<BudgetMonthlySummary> {
    const trimmedMonth = month.trim();
    if (!BudgetValidatorService.isValidMonth(trimmedMonth)) {
      throw new BudgetValidationError(
        `Formato de mes inválido: "${month}". Se espera YYYY-MM (ej. 2026-10).`
      );
    }

    const budgets = await this.budgetRepo.findByUserAndMonth(userId, trimmedMonth);

    let totalBudgetedMinor = 0;
    let totalPercentage = 0;

    for (const b of budgets) {
      if (b.isActive) {
        totalBudgetedMinor += b.amountMinor;
        totalPercentage += Number(b.percentage);
      }
    }

    totalPercentage = Number(totalPercentage.toFixed(2));
    const remainingPercentage = Math.max(0, Number((100 - totalPercentage).toFixed(2)));
    const totalBudgeted = Number((totalBudgetedMinor / 100).toFixed(2));
    const isFullyAllocated = totalPercentage >= 99.99;
    const currency = budgets.length > 0 ? budgets[0].currency : 'MXN';

    return {
      userId,
      month: trimmedMonth,
      budgets,
      totalBudgetedMinor,
      totalBudgeted,
      totalPercentage,
      remainingPercentage,
      isFullyAllocated,
      currency,
    };
  }

  /**
   * Elimina un presupuesto por su ID
   */
  public async deleteBudget(id: string): Promise<void> {
    await this.budgetRepo.delete(id);
  }
}
