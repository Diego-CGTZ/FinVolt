import type { Account } from '../../domain/models/Account';
import type { Transaction } from '../../domain/models/Transaction';
import {
  calculateLiquidityMetrics,
  type LiquidityMetrics,
} from '../../domain/services/BalanceCalculatorService';

/**
 * GetLiquidityUseCase (US-016)
 *
 * Separa el balance contable de la liquidez real disponible y proyectada,
 * asegurando que las líneas de crédito no se traten como liquidez positiva
 * y que las transferencias no se contabilicen como gastos.
 */
export class GetLiquidityUseCase {
  execute(accounts: Account[], transactions: Transaction[]): LiquidityMetrics {
    return calculateLiquidityMetrics(accounts, transactions);
  }
}
