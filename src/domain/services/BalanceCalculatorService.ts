import type { Account, AccountType } from '../models/Account';
import type { Transaction } from '../models/Transaction';

export interface AccountBalance {
  accountId: string;
  accountName: string;
  accountType: AccountType;
  currency: string;
  initialBalance: number;
  currentBalance: number;
  totalIncome: number;
  totalExpense: number;
  totalTransfersIn: number;
  totalTransfersOut: number;
  netChange: number;
  transactionCount: number;
}

export interface AggregateBalances {
  /**
   * Patrimonio Neto total: suma de saldos de todas las cuentas
   * (incluyendo deudas negativas de tarjetas de crédito).
   */
  totalNetWorth: number;

  /**
   * Liquidez total disponible: suma de cuentas líquidas positivas
   * (Efectivo, Débito/Cheques, Ahorros, Billeteras Digitales).
   */
  totalLiquidAssets: number;

  /**
   * Deuda total en tarjetas de crédito (monto positivo adeudado).
   */
  totalCreditDebt: number;

  /**
   * Suma total de ingresos brutos registrados.
   */
  totalIncome: number;

  /**
   * Suma total de gastos brutos registrados (excluyendo transferencias).
   */
  totalExpense: number;

  /**
   * Balances detallados por cada cuenta (indexados por accountId).
   */
  balancesByAccount: Record<string, AccountBalance>;

  /**
   * Desglose agrupado por tipo de cuenta.
   */
  breakdownByType: Record<
    AccountType,
    {
      totalBalance: number;
      accountCount: number;
    }
  >;
}

/**
 * Determina si una transacción de tipo TRANSFER representa una salida (outflow)
 * o una entrada (inflow) para la cuenta asignada a dicha transacción.
 */
export function isTransferInflow(tx: Transaction): boolean {
  if (tx.sourceEventId === 'TRANSFER_IN' || tx.merchantRaw === 'TRANSFER_IN') {
    return true;
  }
  if (tx.sourceEventId === 'TRANSFER_OUT' || tx.merchantRaw === 'TRANSFER_OUT') {
    return false;
  }

  const desc = (tx.description || '').toLowerCase();
  // Señales de abono / entrada de dinero
  if (desc.includes('abono a deuda') || desc.includes('transferencia desde') || desc.includes(' a ')) {
    return true;
  }
  // Señales de débito / salida de dinero
  if (desc.includes('hacia') || desc.includes('pago a tarjeta') || desc.includes('desde')) {
    return false;
  }

  // Por defecto, si tiene linkedTransactionId y no tiene descripción clara,
  // asumimos que el destino es el que tiene linkedTransactionId asignado primero
  return false;
}

/**
 * Calcula el impacto neto en centavos (minor units) o decimales de una transacción sobre su cuenta.
 * Retorna el valor decimal a sumar al balance de la cuenta.
 */
export function getTransactionDelta(tx: Transaction): number {
  // Transacciones descartadas o duplicadas no afectan el balance contable
  if (tx.status === 'REJECTED' || tx.status === 'DUPLICATE') {
    return 0;
  }

  const amount = Number(tx.amountMinor) / 100;

  if (tx.type === 'INCOME') {
    return amount;
  }

  if (tx.type === 'EXPENSE') {
    return -amount;
  }

  if (tx.type === 'TRANSFER') {
    return isTransferInflow(tx) ? amount : -amount;
  }

  return 0;
}

/**
 * Calcula el balance actual de una cuenta específica a partir de su balance inicial
 * y la lista de transacciones registradas.
 */
export function calculateAccountBalance(
  account: Account,
  transactions: Transaction[],
): AccountBalance {
  const accountTxs = transactions.filter((t) => t.accountId === account.id);

  let totalIncome = 0;
  let totalExpense = 0;
  let totalTransfersIn = 0;
  let totalTransfersOut = 0;
  let netDelta = 0;

  for (const tx of accountTxs) {
    if (tx.status === 'REJECTED' || tx.status === 'DUPLICATE') continue;

    const amount = Number(tx.amountMinor) / 100;

    if (tx.type === 'INCOME') {
      totalIncome += amount;
      netDelta += amount;
    } else if (tx.type === 'EXPENSE') {
      totalExpense += amount;
      netDelta -= amount;
    } else if (tx.type === 'TRANSFER') {
      if (isTransferInflow(tx)) {
        totalTransfersIn += amount;
        netDelta += amount;
      } else {
        totalTransfersOut += amount;
        netDelta -= amount;
      }
    }
  }

  const initial = Number(account.initialBalance) || 0;
  const current = initial + netDelta;

  return {
    accountId: account.id,
    accountName: account.name,
    accountType: account.type,
    currency: account.currency,
    initialBalance: initial,
    currentBalance: current,
    totalIncome,
    totalExpense,
    totalTransfersIn,
    totalTransfersOut,
    netChange: netDelta,
    transactionCount: accountTxs.length,
  };
}

/**
 * Calcula todos los balances individuales y agregados del usuario (US-015).
 */
export function calculateAggregateBalances(
  accounts: Account[],
  transactions: Transaction[],
): AggregateBalances {
  const balancesByAccount: Record<string, AccountBalance> = {};

  const breakdownByType: Record<
    AccountType,
    {
      totalBalance: number;
      accountCount: number;
    }
  > = {
    CHECKING: { totalBalance: 0, accountCount: 0 },
    SAVINGS: { totalBalance: 0, accountCount: 0 },
    CREDIT_CARD: { totalBalance: 0, accountCount: 0 },
    CASH: { totalBalance: 0, accountCount: 0 },
    DIGITAL_WALLET: { totalBalance: 0, accountCount: 0 },
    OTHER: { totalBalance: 0, accountCount: 0 },
  };

  let totalNetWorth = 0;
  let totalLiquidAssets = 0;
  let totalCreditDebt = 0;
  let totalIncome = 0;
  let totalExpense = 0;

  for (const account of accounts) {
    const accBal = calculateAccountBalance(account, transactions);
    balancesByAccount[account.id] = accBal;

    // Actualizar desglose por tipo
    if (breakdownByType[account.type]) {
      breakdownByType[account.type].totalBalance += accBal.currentBalance;
      breakdownByType[account.type].accountCount += 1;
    }

    // Patrimonio neto incluye todas las cuentas
    totalNetWorth += accBal.currentBalance;

    // Liquidez (CASH, CHECKING, SAVINGS, DIGITAL_WALLET) solo montos disponibles positivos
    const isLiquid =
      account.type === 'CHECKING' ||
      account.type === 'SAVINGS' ||
      account.type === 'CASH' ||
      account.type === 'DIGITAL_WALLET';

    if (isLiquid && accBal.currentBalance > 0) {
      totalLiquidAssets += accBal.currentBalance;
    }

    // Deuda de crédito (si el saldo es negativo, la deuda es su valor absoluto)
    if (account.type === 'CREDIT_CARD' && accBal.currentBalance < 0) {
      totalCreditDebt += Math.abs(accBal.currentBalance);
    }

    totalIncome += accBal.totalIncome;
    totalExpense += accBal.totalExpense;
  }

  return {
    totalNetWorth,
    totalLiquidAssets,
    totalCreditDebt,
    totalIncome,
    totalExpense,
    balancesByAccount,
    breakdownByType,
  };
}
