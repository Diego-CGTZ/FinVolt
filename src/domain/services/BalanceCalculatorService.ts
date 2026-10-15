import type { Account, AccountType } from '../models/Account';
import type { Transaction } from '../models/Transaction';
import { FinancialStateMachine } from './lifecycle/FinancialStateMachine';

/** Redondea a 2 decimales eliminando residuos de punto flotante (0.1 + 0.2). */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Una transaccion solo impacta saldos si su estado es efectivo segun la state machine
 * (CONFIRMED, PENDING, POSTED, TRANSFER, REFUND). CANDIDATE, MATCHED, DUPLICATE y REJECTED no.
 */
function affectsBalance(tx: Transaction): boolean {
  return FinancialStateMachine.isEffective(tx.status);
}

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
  // Señales explícitas de abono / entrada de dinero
  if (desc.includes('abono a deuda') || desc.includes('transferencia desde')) {
    return true;
  }
  // Señales explícitas de débito / salida de dinero (antes del patrón genérico ' a ',
  // para que 'Transferencia a Ahorros' o 'Pago a tarjeta' no se lean como entradas)
  if (
    desc.includes('hacia') ||
    desc.includes('pago a tarjeta') ||
    desc.includes('transferencia a ') ||
    desc.includes('desde')
  ) {
    return false;
  }
  // Patrón genérico heredado
  if (desc.includes(' a ')) {
    return true;
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
  // Solo los estados efectivos afectan el balance contable
  if (!affectsBalance(tx)) {
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

  // Aritmética en minor units (enteros) para evitar errores de punto flotante
  let totalIncomeMinor = 0;
  let totalExpenseMinor = 0;
  let totalTransfersInMinor = 0;
  let totalTransfersOutMinor = 0;
  let netDeltaMinor = 0;

  for (const tx of accountTxs) {
    if (!affectsBalance(tx)) continue;

    const amount = Math.round(Number(tx.amountMinor));

    if (tx.type === 'INCOME') {
      totalIncomeMinor += amount;
      netDeltaMinor += amount;
    } else if (tx.type === 'EXPENSE') {
      totalExpenseMinor += amount;
      netDeltaMinor -= amount;
    } else if (tx.type === 'TRANSFER') {
      if (isTransferInflow(tx)) {
        totalTransfersInMinor += amount;
        netDeltaMinor += amount;
      } else {
        totalTransfersOutMinor += amount;
        netDeltaMinor -= amount;
      }
    }
  }

  const totalIncome = totalIncomeMinor / 100;
  const totalExpense = totalExpenseMinor / 100;
  const totalTransfersIn = totalTransfersInMinor / 100;
  const totalTransfersOut = totalTransfersOutMinor / 100;
  const netDelta = netDeltaMinor / 100;

  const initial = Number(account.initialBalance) || 0;
  const current = (Math.round(initial * 100) + netDeltaMinor) / 100;

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

  for (const key of Object.keys(breakdownByType) as AccountType[]) {
    breakdownByType[key].totalBalance = round2(breakdownByType[key].totalBalance);
  }

  return {
    totalNetWorth: round2(totalNetWorth),
    totalLiquidAssets: round2(totalLiquidAssets),
    totalCreditDebt: round2(totalCreditDebt),
    totalIncome: round2(totalIncome),
    totalExpense: round2(totalExpense),
    balancesByAccount,
    breakdownByType,
  };
}

/**
 * Métricas especializadas de Liquidez Real y Proyectada (US-016).
 *
 * Separa de manera estricta:
 * 1. Balance Contable (Patrimonio Neto)
 * 2. Liquidez Real Disponible (Efectivo, Débito, Ahorros, Billeteras)
 * 3. Liquidez Proyectada (Liquidez real menos deudas de tarjeta y cargos pendientes)
 * 4. Gastos e ingresos reales (las transferencias NO son gastos ni ingresos)
 */
export interface LiquidityMetrics {
  /**
   * Balance contable total: suma algebraica de saldos de todas las cuentas.
   */
  accountingBalance: number;

  /**
   * Liquidez real disponible: efectivo + cheques/débito + ahorros + billeteras.
   * Las líneas de crédito NO se consideran liquidez positiva bajo ninguna circunstancia.
   */
  realLiquidity: number;

  /**
   * Liquidez proyectada: liquidez real disponible deduciendo las obligaciones inmediatas
   * (deuda acumulada en tarjetas de crédito y cargos pendientes).
   */
  projectedLiquidity: number;

  /**
   * Deuda acumulada en tarjetas de crédito (monto adeudado).
   */
  creditCardDebt: number;

  /**
   * Compromisos pendientes (gastos en estado PENDING o CANDIDATE no liquidados).
   */
  pendingCommitments: number;

  /**
   * Desglose por canasta de liquidez.
   */
  liquidAccountsBreakdown: {
    cash: number;
    checking: number;
    savings: number;
    digitalWallets: number;
  };

  /**
   * Gastos reales del periodo (excluye estrictamente transferencias entre cuentas propias).
   */
  actualExpenses: number;

  /**
   * Ingresos reales del periodo (excluye transferencias entre cuentas propias).
   */
  actualIncomes: number;
}

/**
 * Calcula la liquidez real y proyectada distinguiéndola del balance contable (US-016).
 */
export function calculateLiquidityMetrics(
  accounts: Account[],
  transactions: Transaction[],
): LiquidityMetrics {
  const aggregate = calculateAggregateBalances(accounts, transactions);

  let cash = 0;
  let checking = 0;
  let savings = 0;
  let digitalWallets = 0;

  for (const acc of accounts) {
    const bal = aggregate.balancesByAccount[acc.id]?.currentBalance ?? acc.initialBalance;

    // Regla US-016: Las tarjetas de crédito NUNCA se tratan como liquidez positiva
    if (acc.type === 'CREDIT_CARD') continue;

    // Solo sumamos saldos positivos disponibles
    if (bal > 0) {
      if (acc.type === 'CASH') cash += bal;
      else if (acc.type === 'CHECKING') checking += bal;
      else if (acc.type === 'SAVINGS') savings += bal;
      else if (acc.type === 'DIGITAL_WALLET') digitalWallets += bal;
    }
  }

  const realLiquidity = round2(cash + checking + savings + digitalWallets);
  const creditCardDebt = aggregate.totalCreditDebt;

  // Compromisos pendientes que deducen liquidez futura: gastos aun NO reflejados en el balance.
  // Los PENDING ya estan descontados del saldo (son estado efectivo), por lo que restarlos
  // de nuevo seria un doble descuento. Solo cuentan CANDIDATE/MATCHED (no efectivos).
  let pendingCommitmentsMinor = 0;
  for (const tx of transactions) {
    if (tx.status === 'CANDIDATE' || tx.status === 'MATCHED') {
      const acc = accounts.find((a) => a.id === tx.accountId);
      if (acc && acc.type !== 'CREDIT_CARD' && tx.type === 'EXPENSE') {
        pendingCommitmentsMinor += Math.round(Number(tx.amountMinor));
      }
    }
  }
  const pendingCommitments = pendingCommitmentsMinor / 100;

  // Liquidez Proyectada = Liquidez Real - Deuda en Tarjetas - Compromisos Pendientes
  const projectedLiquidity = round2(realLiquidity - creditCardDebt - pendingCommitments);

  // Regla US-016: Transfers NO son gastos ni ingresos
  let actualExpenses = 0;
  let actualIncomes = 0;
  for (const tx of transactions) {
    if (!affectsBalance(tx)) continue;
    if (tx.type === 'EXPENSE') {
      actualExpenses += Number(tx.amountMinor) / 100;
    } else if (tx.type === 'INCOME') {
      actualIncomes += Number(tx.amountMinor) / 100;
    }
  }

  return {
    accountingBalance: aggregate.totalNetWorth,
    realLiquidity,
    projectedLiquidity,
    creditCardDebt,
    pendingCommitments,
    liquidAccountsBreakdown: {
      cash,
      checking,
      savings,
      digitalWallets,
    },
    actualExpenses: round2(actualExpenses),
    actualIncomes: round2(actualIncomes),
  };
}

/**
 * Resumen de gastos e ingresos del mes calendario actual (US-017).
 */
export interface MonthlyFinancialSummary {
  currentMonthName: string;
  monthlyIncome: number;
  monthlyExpense: number;
  monthlyNetSavings: number;
  monthlySavingsRate: number;
  monthlyTransactionsCount: number;
}

export function calculateMonthlyFinancialSummary(
  transactions: Transaction[],
  referenceDate = new Date(),
): MonthlyFinancialSummary {
  const currentYear = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth();

  let monthlyIncome = 0;
  let monthlyExpense = 0;
  let monthlyTransactionsCount = 0;

  for (const tx of transactions) {
    if (!affectsBalance(tx)) continue;

    const txDate = new Date(tx.occurredAt);
    if (txDate.getFullYear() === currentYear && txDate.getMonth() === currentMonth) {
      const amount = Number(tx.amountMinor) / 100;
      if (tx.type === 'INCOME') {
        monthlyIncome += amount;
        monthlyTransactionsCount++;
      } else if (tx.type === 'EXPENSE') {
        monthlyExpense += amount;
        monthlyTransactionsCount++;
      }
      // Las transferencias entre cuentas propias quedan excluidas de gastos e ingresos
    }
  }

  monthlyIncome = round2(monthlyIncome);
  monthlyExpense = round2(monthlyExpense);
  const monthlyNetSavings = round2(monthlyIncome - monthlyExpense);
  const monthlySavingsRate =
    monthlyIncome > 0
      ? Math.max(0, Math.round((monthlyNetSavings / monthlyIncome) * 100))
      : 0;

  const monthFormatter = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });
  const rawMonthName = monthFormatter.format(referenceDate);
  const currentMonthName = rawMonthName.charAt(0).toUpperCase() + rawMonthName.slice(1);

  return {
    currentMonthName,
    monthlyIncome,
    monthlyExpense,
    monthlyNetSavings,
    monthlySavingsRate,
    monthlyTransactionsCount,
  };
}

/**
 * Resumen de obligaciones de crédito por tarjeta (US-017).
 */
export interface CreditObligation {
  accountId: string;
  accountName: string;
  currency: string;
  debtAmount: number;
  hasDebt: boolean;
  creditLimit?: number;
  cutoffDay?: number;
  paymentDueDay?: number;
}

export interface CreditObligationsSummary {
  totalCreditDebt: number;
  cardsWithDebtCount: number;
  totalCardsCount: number;
  obligations: CreditObligation[];
}

export function calculateCreditObligations(
  accounts: Account[],
  transactions: Transaction[],
): CreditObligationsSummary {
  const creditAccounts = accounts.filter((a) => a.type === 'CREDIT_CARD');
  const aggregate = calculateAggregateBalances(accounts, transactions);

  let totalCreditDebt = 0;
  let cardsWithDebtCount = 0;

  const obligations: CreditObligation[] = creditAccounts.map((card) => {
    const accBal = aggregate.balancesByAccount[card.id];
    const currentBal = accBal ? accBal.currentBalance : card.initialBalance;
    const debtAmount = currentBal < 0 ? Math.abs(currentBal) : 0;
    const hasDebt = debtAmount > 0;

    if (hasDebt) {
      totalCreditDebt += debtAmount;
      cardsWithDebtCount++;
    }

    return {
      accountId: card.id,
      accountName: card.name,
      currency: card.currency,
      debtAmount,
      hasDebt,
      creditLimit: card.creditLimit,
      cutoffDay: card.cutoffDay,
      paymentDueDay: card.paymentDueDay,
    };
  });

  return {
    totalCreditDebt,
    cardsWithDebtCount,
    totalCardsCount: creditAccounts.length,
    obligations,
  };
}
