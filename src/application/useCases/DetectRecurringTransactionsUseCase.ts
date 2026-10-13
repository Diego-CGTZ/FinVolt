/**
 * DetectRecurringTransactionsUseCase — Caso de Uso para Detección de Recurrencias (US-043)
 *
 * Orquesta la detección automática de transacciones periódicas para un usuario
 * o cuenta, calculando periodicidad, confianza y proyectando próximas fechas.
 */

import type { ITransactionRepository } from '../../domain/repositories/ITransactionRepository';
import type { IRecurringTransactionRepository } from '../../domain/repositories/IRecurringTransactionRepository';
import type {
  RecurringTransaction,
  RecurringPatternType,
} from '../../domain/models/RecurringTransaction';
import type { Transaction } from '../../domain/models/Transaction';
import {
  RecurringTransactionDetector,
  defaultRecurringTransactionDetector,
  type RecurringDetectorOptions,
} from '../../domain/services/recurring/RecurringTransactionDetector';
import { defaultRecurringTransactionRepository } from '../../infrastructure/database/AsyncStorageRecurringTransactionRepository';

export interface DetectRecurringRequest {
  userId: string;
  accountId?: string;
  transactions?: Transaction[];
  options?: RecurringDetectorOptions;
  persist?: boolean;
}

export interface RecurringSummary {
  totalDetected: number;
  byPatternType: Record<RecurringPatternType, number>;
  estimatedMonthlyIncomeMinor: number;
  estimatedMonthlyExpenseMinor: number;
}

export interface DetectRecurringResponse {
  recurringTransactions: RecurringTransaction[];
  summary: RecurringSummary;
}

export class DetectRecurringTransactionsUseCase {
  constructor(
    private readonly transactionRepository?: ITransactionRepository,
    private readonly recurringRepository: IRecurringTransactionRepository = defaultRecurringTransactionRepository,
    private readonly detector: RecurringTransactionDetector = defaultRecurringTransactionDetector,
  ) {}

  public async execute(request: DetectRecurringRequest): Promise<DetectRecurringResponse> {
    const { userId, accountId, options, persist = true } = request;

    let transactions = request.transactions;

    // Si no se pasaron transacciones explícitas, obtener del repositorio
    if (!transactions && this.transactionRepository) {
      transactions = await this.transactionRepository.listTransactions(
        accountId ? { accountId } : undefined,
        { limit: 500 },
      );
    }

    if (!transactions || transactions.length === 0) {
      return {
        recurringTransactions: [],
        summary: this.buildEmptySummary(),
      };
    }

    // Filtrar transacciones por cuenta si se especificó
    const targetTransactions = accountId
      ? transactions.filter((t) => t.accountId === accountId)
      : transactions;

    // Ejecutar detección matemática y semántica
    const detected = this.detector.detect(targetTransactions, userId, options);

    // Persistir si se solicitó
    if (persist && detected.length > 0) {
      await this.recurringRepository.saveMany(detected);
    }

    const summary = this.buildSummary(detected);

    return {
      recurringTransactions: detected,
      summary,
    };
  }

  private buildSummary(items: RecurringTransaction[]): RecurringSummary {
    const byPatternType: Record<RecurringPatternType, number> = {
      SALARY: 0,
      RENT: 0,
      SUBSCRIPTION: 0,
      LOAN: 0,
      UTILITY: 0,
      OTHER: 0,
    };

    let estimatedMonthlyIncomeMinor = 0;
    let estimatedMonthlyExpenseMinor = 0;

    for (const item of items) {
      byPatternType[item.patternType] = (byPatternType[item.patternType] || 0) + 1;

      // Normalizar monto a impacto mensual aproximado
      const monthlyEquivalent = this.calculateMonthlyEquivalent(
        item.averageAmountMinor,
        item.periodicity,
      );

      if (item.transactionType === 'INCOME') {
        estimatedMonthlyIncomeMinor += monthlyEquivalent;
      } else if (item.transactionType === 'EXPENSE') {
        estimatedMonthlyExpenseMinor += monthlyEquivalent;
      }
    }

    return {
      totalDetected: items.length,
      byPatternType,
      estimatedMonthlyIncomeMinor,
      estimatedMonthlyExpenseMinor,
    };
  }

  private calculateMonthlyEquivalent(amountMinor: number, periodicity: string): number {
    switch (periodicity) {
      case 'WEEKLY':
        return Math.round(amountMinor * 4.33);
      case 'BIWEEKLY':
        return Math.round(amountMinor * 2.16);
      case 'SEMIMONTHLY':
        return Math.round(amountMinor * 2);
      case 'MONTHLY':
        return amountMinor;
      case 'BIMONTHLY':
        return Math.round(amountMinor / 2);
      case 'QUARTERLY':
        return Math.round(amountMinor / 3);
      case 'ANNUAL':
        return Math.round(amountMinor / 12);
      default:
        return amountMinor;
    }
  }

  private buildEmptySummary(): RecurringSummary {
    return {
      totalDetected: 0,
      byPatternType: {
        SALARY: 0,
        RENT: 0,
        SUBSCRIPTION: 0,
        LOAN: 0,
        UTILITY: 0,
        OTHER: 0,
      },
      estimatedMonthlyIncomeMinor: 0,
      estimatedMonthlyExpenseMinor: 0,
    };
  }
}
