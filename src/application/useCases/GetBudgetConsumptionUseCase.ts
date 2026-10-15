/**
 * GetBudgetConsumptionUseCase — Caso de Uso de Consumo de Presupuesto (US-047)
 *
 * Orquesta el cálculo de consumo de presupuestos por categoría en un periodo mensual,
 * excluyendo transferencias y movimientos no aplicables.
 */

import type { Budget } from '../../domain/models/Budget';
import type { Transaction } from '../../domain/models/Transaction';
import type { Category } from '../../domain/models/Category';
import type { MonthlyBudgetConsumptionSummary } from '../../domain/models/BudgetConsumption';
import { BudgetConsumptionCalculator } from '../../domain/services/budgets/BudgetConsumptionCalculator';
import type { IBudgetRepository } from '../../domain/repositories/IBudgetRepository';
import type { ITransactionRepository } from '../../domain/repositories/ITransactionRepository';
import type { ICategoryRepository } from '../../domain/repositories/ICategoryRepository';

export interface GetBudgetConsumptionInput {
  userId: string;
  month: string;
  budgets?: Budget[];
  transactions?: Transaction[];
  categories?: Record<string, Category>;
}

export interface GetBudgetConsumptionSyncInput {
  userId: string;
  month: string;
  budgets: Budget[];
  transactions: Transaction[];
  categories?: Record<string, Category>;
}

export class GetBudgetConsumptionUseCase {
  constructor(
    private readonly budgetRepo?: IBudgetRepository,
    private readonly transactionRepo?: ITransactionRepository,
    private readonly categoryRepo?: ICategoryRepository,
  ) {}

  /**
   * Ejecuta el cálculo asíncrono con resolución automática mediante repositorios si aplica
   */
  public async execute(
    input: GetBudgetConsumptionInput
  ): Promise<MonthlyBudgetConsumptionSummary> {
    const { userId, month } = input;

    // 1. Cargar presupuestos
    let budgets = input.budgets;
    if (!budgets && this.budgetRepo) {
      budgets = await this.budgetRepo.findByUserAndMonth(userId, month);
    } else if (!budgets) {
      budgets = [];
    }

    // 2. Cargar transacciones
    let transactions = input.transactions;
    if (!transactions && this.transactionRepo) {
      transactions = await this.transactionRepo.listTransactions({}, {
        limit: 1000,
      });
    } else if (!transactions) {
      transactions = [];
    }

    // 3. Cargar categorías si no se pasaron en el input
    let categories = input.categories;
    if (!categories && this.categoryRepo) {
      const list = await this.categoryRepo.getCategories();
      categories = {};
      for (const c of list) {
        categories[c.id] = c;
      }
    }


    return BudgetConsumptionCalculator.calculate({
      budgets,
      transactions,
      month,
      userId,
      categories,
    });
  }

  /**
   * Ejecuta el cálculo sincrónico cuando todos los datos ya se encuentran en memoria (UI/Hooks)
   */
  public executeSync(
    input: GetBudgetConsumptionSyncInput
  ): MonthlyBudgetConsumptionSummary {
    return BudgetConsumptionCalculator.calculate({
      budgets: input.budgets,
      transactions: input.transactions,
      month: input.month,
      userId: input.userId,
      categories: input.categories,
    });
  }
}
