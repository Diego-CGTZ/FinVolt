/**
 * ProjectedLiquidityCalculator — Motor determinístico de Liquidez Proyectada (US-045)
 *
 * Implementa estrictamente los Criterios de Aceptación (AC):
 *   Final Projected Liquidity = Liquid Assets + Expected Income - Credit Obligations - Committed Expenses
 *
 * Reglas de diseño y precisión:
 * 1. Aritmética determinista de enteros en minor units (centavos) para prevenir drift de redondeo.
 * 2. Las tarjetas de crédito NUNCA se consideran activos líquidos (Regla US-016).
 * 3. Horizonte temporal configurable (en días o fechas inicio/fin).
 * 4. Generación de trayectoria diaria con detección matemática de puntos mínimos y alerta de déficit.
 * 5. Prevención de doble conteo de obligaciones de tarjeta de crédito contra deuda corriente.
 */

import type { Account } from '../../models/Account';
import type { Transaction } from '../../models/Transaction';
import type { FutureObligation } from '../../models/FutureObligation';
import type {
  ProjectedLiquidityConfig,
  ProjectedLiquidityResult,
  ProjectedLiquidityPoint,
  ProjectedLiquidityEvent,
  LiquidAssetsBreakdown,
} from '../../models/ProjectedLiquidity';
import { calculateAggregateBalances } from '../BalanceCalculatorService';
import { ObligationScheduleCalculator } from '../obligations/ObligationScheduleCalculator';

export interface CalculateProjectedLiquidityParams {
  accounts: Account[];
  transactions?: Transaction[];
  obligations: FutureObligation[];
  config: ProjectedLiquidityConfig;
}

export class ProjectedLiquidityCalculator {
  /**
   * Helper para formatear fecha a string ISO local YYYY-MM-DD en UTC
   */
  public static formatDateKey(d: Date): string {
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Normaliza una fecha a las 00:00:00.000 UTC
   */
  public static normalizeToUtcDay(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  }

  /**
   * Agrega días a una fecha UTC
   */
  public static addDaysUtc(d: Date, days: number): Date {
    const res = new Date(d);
    res.setUTCDate(res.getUTCDate() + days);
    return res;
  }

  /**
   * Calcula la liquidez proyectada determinista para un conjunto de cuentas,
   * transacciones y obligaciones futuras en un horizonte dado.
   */
  public static calculate(params: CalculateProjectedLiquidityParams): ProjectedLiquidityResult {
    const { accounts, transactions = [], obligations, config } = params;

    const horizonDays = Math.max(1, Math.floor(config.horizonDays || 30));
    const rawStart = config.startDate ? new Date(config.startDate) : new Date();
    const startDate = this.normalizeToUtcDay(rawStart);
    // End date inclusiva a las 23:59:59.999 del día final
    const endDayStart = this.addDaysUtc(startDate, horizonDays);
    const endDate = new Date(Date.UTC(
      endDayStart.getUTCFullYear(),
      endDayStart.getUTCMonth(),
      endDayStart.getUTCDate() - 1,
      23, 59, 59, 999
    ));

    const currency = config.currency || 'MXN';

    // ── 1. CÁLCULO DE ACTIVOS LÍQUIDOS (US-016) ─────────────────────────────
    const aggregate = calculateAggregateBalances(accounts, transactions);

    let cashMinor = 0;
    let checkingMinor = 0;
    let savingsMinor = 0;
    let digitalWalletsMinor = 0;

    for (const acc of accounts) {
      // Regla US-016: Las tarjetas de crédito NUNCA son activos líquidos positivos
      if (acc.type === 'CREDIT_CARD') continue;

      const currentBal = aggregate.balancesByAccount[acc.id]?.currentBalance ?? acc.initialBalance;
      const balMinor = Math.round(currentBal * 100);

      // Solo sumamos balances positivos disponibles
      if (balMinor > 0) {
        if (acc.type === 'CASH') cashMinor += balMinor;
        else if (acc.type === 'CHECKING') checkingMinor += balMinor;
        else if (acc.type === 'SAVINGS') savingsMinor += balMinor;
        else if (acc.type === 'DIGITAL_WALLET') digitalWalletsMinor += balMinor;
      }
    }

    const liquidAssetsMinor = cashMinor + checkingMinor + savingsMinor + digitalWalletsMinor;
    const liquidAssetsBreakdown: LiquidAssetsBreakdown = {
      cash: Number((cashMinor / 100).toFixed(2)),
      checking: Number((checkingMinor / 100).toFixed(2)),
      savings: Number((savingsMinor / 100).toFixed(2)),
      digitalWallets: Number((digitalWalletsMinor / 100).toFixed(2)),
    };

    // ── 2. CÁLCULO DE OBLIGACIONES DE CRÉDITO ────────────────────────────────
    // Deuda corriente en tarjetas de crédito en minor units
    const currentCreditDebtMinor = Math.round((aggregate.totalCreditDebt || 0) * 100);

    // ── 3. GENERACIÓN DE OCURRENCIAS DE OBLIGACIONES EN EL HORIZONTE ─────────
    const occurrencesByDay: Record<string, ProjectedLiquidityEvent[]> = {};
    let expectedIncomeCommittedMinor = 0;
    let expectedIncomeEstimatedMinor = 0;
    let committedExpensesMinor = 0;
    let estimatedExpensesMinor = 0;
    let explicitCreditCardPaymentsMinor = 0;
    let totalOccurrencesCount = 0;

    for (const ob of obligations) {
      if (ob.status !== 'ACTIVE') continue;

      const occurrences = ObligationScheduleCalculator.generateOccurrences(
        ob,
        startDate,
        endDate,
      );

      for (const occ of occurrences) {
        totalOccurrencesCount++;
        const dayKey = this.formatDateKey(occ.dueDate);

        if (!occurrencesByDay[dayKey]) {
          occurrencesByDay[dayKey] = [];
        }

        const evt: ProjectedLiquidityEvent = {
          obligationId: ob.id,
          name: ob.name,
          dueDate: occ.dueDate,
          direction: occ.direction,
          certainty: occ.certainty,
          amountMinor: occ.amountMinor,
          amount: Number((occ.amountMinor / 100).toFixed(2)),
          currency: occ.currency,
          accountId: occ.accountId,
          categoryId: occ.categoryId,
        };

        occurrencesByDay[dayKey].push(evt);

        if (occ.direction === 'INCOME') {
          if (occ.certainty === 'COMMITTED') {
            expectedIncomeCommittedMinor += occ.amountMinor;
          } else {
            expectedIncomeEstimatedMinor += occ.amountMinor;
          }
        } else if (occ.direction === 'EXPENSE') {
          if (ob.obligationType === 'CREDIT_CARD_PAYMENT') {
            explicitCreditCardPaymentsMinor += occ.amountMinor;
          }

          if (occ.certainty === 'COMMITTED') {
            committedExpensesMinor += occ.amountMinor;
          } else {
            estimatedExpensesMinor += occ.amountMinor;
          }
        }
      }
    }

    const expectedIncomeMinor = expectedIncomeCommittedMinor + expectedIncomeEstimatedMinor;
    const totalExpensesMinor = committedExpensesMinor + estimatedExpensesMinor;

    // Regla de consistencia de crédito:
    // Las obligaciones de crédito incluyen la deuda actual en tarjetas.
    // Si además el usuario especificó pagos programados de tarjeta (CREDIT_CARD_PAYMENT)
    // dentro de sus obligaciones comprometidas, evitamos duplicar deduciendo el pago explícito
    // de la deuda base, garantizando que el pasivo de crédito no se reste dos veces.
    const creditObligationsMinor = Math.max(
      currentCreditDebtMinor,
      explicitCreditCardPaymentsMinor,
    );

    // Ajuste para la fórmula canónica de AC:
    // Si explicitCreditCardPaymentsMinor ya está sumado en committedExpensesMinor,
    // usamos la porción no solapada para creditObligations en la fórmula:
    const netCreditObligationsMinor = Math.max(
      0,
      creditObligationsMinor - explicitCreditCardPaymentsMinor,
    );

    // ── 4. APLICACIÓN DE LA FÓRMULA CANÓNICA DE AC ──────────────────────────
    // Formula: Liquid Assets + Expected Income - Credit Obligations - Committed Expenses
    const finalProjectedLiquidityMinor =
      liquidAssetsMinor +
      expectedIncomeMinor -
      netCreditObligationsMinor -
      committedExpensesMinor;

    const conservativeProjectedLiquidityMinor =
      finalProjectedLiquidityMinor - estimatedExpensesMinor;

    // ── 5. GENERACIÓN DE LA TRAYECTORIA DIARIA Y ANÁLISIS DE RIESGO ──────────
    const timeline: ProjectedLiquidityPoint[] = [];
    let rollingLiquidityMinor = liquidAssetsMinor;

    // El primer día absorbe el pasivo de crédito exigible si aplica
    let minimumLiquidityMinor = liquidAssetsMinor;
    let minimumLiquidityDate: Date | null = null;
    let isDeficitProjected = false;
    let daysUntilDeficit: number | null = null;

    for (let day = 0; day < horizonDays; day++) {
      const currentDayDate = this.addDaysUtc(startDate, day);
      const dayKey = this.formatDateKey(currentDayDate);
      const dayEvents = occurrencesByDay[dayKey] || [];

      const startingDayLiquidityMinor = rollingLiquidityMinor;

      let dayIncomesMinor = 0;
      let dayCommittedExpensesMinor = 0;
      let dayEstimatedExpensesMinor = 0;
      let dayCreditObligationsMinor = 0;

      // El día 0 absorbe la deuda de tarjeta exigible no vinculada a eventos futuros puntuales
      if (day === 0 && netCreditObligationsMinor > 0) {
        dayCreditObligationsMinor += netCreditObligationsMinor;
      }

      for (const evt of dayEvents) {
        if (evt.direction === 'INCOME') {
          dayIncomesMinor += evt.amountMinor;
        } else if (evt.direction === 'EXPENSE') {
          if (evt.certainty === 'COMMITTED') {
            dayCommittedExpensesMinor += evt.amountMinor;
          } else {
            dayEstimatedExpensesMinor += evt.amountMinor;
          }
        }
      }

      // Proyección determinista de cierre de día
      const dayExpensesMinor = config.includeEstimatedExpenses === false
        ? dayCommittedExpensesMinor
        : dayCommittedExpensesMinor + dayEstimatedExpensesMinor;

      rollingLiquidityMinor =
        startingDayLiquidityMinor +
        dayIncomesMinor -
        dayCreditObligationsMinor -
        dayExpensesMinor;

      if (rollingLiquidityMinor < minimumLiquidityMinor) {
        minimumLiquidityMinor = rollingLiquidityMinor;
        minimumLiquidityDate = currentDayDate;
      }

      if (rollingLiquidityMinor < 0 && !isDeficitProjected) {
        isDeficitProjected = true;
        daysUntilDeficit = day;
      }

      timeline.push({
        date: dayKey,
        timestamp: currentDayDate.getTime(),
        dayIndex: day,
        startingLiquidityMinor: startingDayLiquidityMinor,
        incomesMinor: dayIncomesMinor,
        creditObligationsMinor: dayCreditObligationsMinor,
        committedExpensesMinor: dayCommittedExpensesMinor,
        estimatedExpensesMinor: dayEstimatedExpensesMinor,
        projectedLiquidityMinor: rollingLiquidityMinor,
        projectedLiquidity: Number((rollingLiquidityMinor / 100).toFixed(2)),
        incomes: Number((dayIncomesMinor / 100).toFixed(2)),
        creditObligations: Number((dayCreditObligationsMinor / 100).toFixed(2)),
        committedExpenses: Number((dayCommittedExpensesMinor / 100).toFixed(2)),
        estimatedExpenses: Number((dayEstimatedExpensesMinor / 100).toFixed(2)),
        events: dayEvents,
      });
    }

    return {
      startDate,
      endDate,
      horizonDays,
      currency,
      liquidAssetsMinor,
      expectedIncomeMinor,
      expectedIncomeCommittedMinor,
      expectedIncomeEstimatedMinor,
      creditObligationsMinor: creditObligationsMinor,
      committedExpensesMinor,
      estimatedExpensesMinor,
      totalExpensesMinor,
      finalProjectedLiquidityMinor,
      finalProjectedLiquidity: Number((finalProjectedLiquidityMinor / 100).toFixed(2)),
      conservativeProjectedLiquidityMinor,
      conservativeProjectedLiquidity: Number((conservativeProjectedLiquidityMinor / 100).toFixed(2)),
      liquidAssets: Number((liquidAssetsMinor / 100).toFixed(2)),
      expectedIncome: Number((expectedIncomeMinor / 100).toFixed(2)),
      creditObligations: Number((creditObligationsMinor / 100).toFixed(2)),
      committedExpenses: Number((committedExpensesMinor / 100).toFixed(2)),
      estimatedExpenses: Number((estimatedExpensesMinor / 100).toFixed(2)),
      totalExpenses: Number((totalExpensesMinor / 100).toFixed(2)),
      liquidAssetsBreakdown,
      minimumLiquidityMinor,
      minimumLiquidity: Number((minimumLiquidityMinor / 100).toFixed(2)),
      minimumLiquidityDate,
      isDeficitProjected,
      daysUntilDeficit,
      occurrencesCount: totalOccurrencesCount,
      timeline,
    };
  }
}
