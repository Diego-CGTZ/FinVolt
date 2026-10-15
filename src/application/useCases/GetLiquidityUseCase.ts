import type { Account } from '../../domain/models/Account';
import type { Transaction } from '../../domain/models/Transaction';
import type { FutureObligation } from '../../domain/models/FutureObligation';
import type { ProjectedLiquidityResult } from '../../domain/models/ProjectedLiquidity';
import {
  calculateLiquidityMetrics,
  type LiquidityMetrics,
} from '../../domain/services/BalanceCalculatorService';
import { ProjectedLiquidityCalculator } from '../../domain/services/liquidity/ProjectedLiquidityCalculator';

export interface ExtendedLiquidityMetrics extends LiquidityMetrics {
  projectedDetails?: ProjectedLiquidityResult;
}

/**
 * GetLiquidityUseCase (US-016 & US-045)
 *
 * Separa el balance contable de la liquidez real disponible y proyectada,
 * asegurando que las líneas de crédito no se traten como liquidez positiva
 * y que las transferencias no se contabilicen como gastos.
 *
 * En US-045, si se proporcionan obligaciones futuras, calcula la liquidez
 * proyectada canónica considerando:
 * Liquid Assets + Expected Income - Credit Obligations - Committed Expenses
 */
export class GetLiquidityUseCase {
  execute(
    accounts: Account[],
    transactions: Transaction[],
    obligations?: FutureObligation[],
    horizonDays = 30,
  ): ExtendedLiquidityMetrics {
    const baseMetrics = calculateLiquidityMetrics(accounts, transactions);

    if (!obligations || obligations.length === 0) {
      return baseMetrics;
    }

    const projectedResult = ProjectedLiquidityCalculator.calculate({
      accounts,
      transactions,
      obligations,
      config: { horizonDays },
    });

    return {
      ...baseMetrics,
      projectedLiquidity: projectedResult.finalProjectedLiquidity,
      projectedDetails: projectedResult,
    };
  }
}
