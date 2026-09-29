import type { Account } from '../../domain/models/Account';
import type { Transaction } from '../../domain/models/Transaction';
import {
  calculateAggregateBalances,
  type AccountBalance,
  type AggregateBalances,
} from '../../domain/services/BalanceCalculatorService';

/**
 * GetBalancesUseCase (US-015)
 *
 * Encapsula la obtención y cómputo de balances actuales por cuenta y
 * agregados del usuario, integrando cuentas y transacciones.
 */
export class GetBalancesUseCase {
  execute(
    accounts: Account[],
    transactions: Transaction[],
  ): {
    aggregates: AggregateBalances;
    getAccountBalance: (accountId: string) => AccountBalance | undefined;
  } {
    const aggregates = calculateAggregateBalances(accounts, transactions);

    return {
      aggregates,
      getAccountBalance: (accountId: string) => aggregates.balancesByAccount[accountId],
    };
  }
}
