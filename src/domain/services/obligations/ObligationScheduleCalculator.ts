/**
 * ObligationScheduleCalculator — Servicio de Dominio para Obligaciones Futuras (US-044)
 *
 * Provee cálculo matemático y determinista de vencimientos, generación de ocurrencias
 * proyectadas y derivación de obligaciones a partir de transacciones recurrentes (US-043).
 */

import type {
  FutureObligation,
  ObligationOccurrence,
  ObligationPeriodicity,
  ObligationType,
  ObligationDirection,
  ObligationCertainty,
  CreateFutureObligationInput,
} from '../../models/FutureObligation';
import type { RecurringTransaction, RecurringPatternType } from '../../models/RecurringTransaction';

export class ObligationScheduleCalculator {
  /**
   * Determina los días de un mes específico en un año dado (considera años bisiestos).
   */
  public static getDaysInMonth(year: number, monthIndex: number): number {
    return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  }

  /**
   * Calcula la fecha de la siguiente ocurrencia a partir de una fecha base,
   * respetando la periodicidad y evitando deriva de fin de mes (usando anchorDay).
   */
  public static calculateNextDueDate(
    currentDueDate: Date,
    periodicity: ObligationPeriodicity,
    intervalDays?: number | null,
    anchorDay?: number,
  ): Date {
    const base = new Date(currentDueDate);
    const year = base.getUTCFullYear();
    const month = base.getUTCMonth();
    const day = base.getUTCDate();
    const anchor = anchorDay && anchorDay >= 1 && anchorDay <= 31 ? anchorDay : day;

    switch (periodicity) {
      case 'ONE_TIME':
        return new Date(base);

      case 'WEEKLY': {
        const next = new Date(base);
        next.setUTCDate(day + 7);
        return next;
      }

      case 'BIWEEKLY': {
        const next = new Date(base);
        next.setUTCDate(day + 14);
        return next;
      }

      case 'SEMIMONTHLY': {
        // Quincenal estándar: día 15 y fin de mes, o intervalo quincenal
        if (day < 15) {
          const daysInCurrentMonth = this.getDaysInMonth(year, month);
          const nextDay = Math.min(15, daysInCurrentMonth);
          return new Date(Date.UTC(year, month, nextDay, base.getUTCHours(), base.getUTCMinutes()));
        } else if (day >= 15 && day < 28) {
          const daysInCurrentMonth = this.getDaysInMonth(year, month);
          return new Date(Date.UTC(year, month, daysInCurrentMonth, base.getUTCHours(), base.getUTCMinutes()));
        } else {
          // Fin de mes -> pasa al 15 del siguiente mes
          const nextMonthYear = month === 11 ? year + 1 : year;
          const nextMonth = (month + 1) % 12;
          return new Date(Date.UTC(nextMonthYear, nextMonth, 15, base.getUTCHours(), base.getUTCMinutes()));
        }
      }

      case 'MONTHLY': {
        const nextMonthYear = month === 11 ? year + 1 : year;
        const nextMonth = (month + 1) % 12;
        const daysInNextMonth = this.getDaysInMonth(nextMonthYear, nextMonth);
        const resolvedDay = Math.min(anchor, daysInNextMonth);
        return new Date(Date.UTC(nextMonthYear, nextMonth, resolvedDay, base.getUTCHours(), base.getUTCMinutes()));
      }

      case 'BIMONTHLY': {
        const totalMonths = month + 2;
        const targetYear = year + Math.floor(totalMonths / 12);
        const targetMonth = totalMonths % 12;
        const daysInTargetMonth = this.getDaysInMonth(targetYear, targetMonth);
        const resolvedDay = Math.min(anchor, daysInTargetMonth);
        return new Date(Date.UTC(targetYear, targetMonth, resolvedDay, base.getUTCHours(), base.getUTCMinutes()));
      }

      case 'QUARTERLY': {
        const totalMonths = month + 3;
        const targetYear = year + Math.floor(totalMonths / 12);
        const targetMonth = totalMonths % 12;
        const daysInTargetMonth = this.getDaysInMonth(targetYear, targetMonth);
        const resolvedDay = Math.min(anchor, daysInTargetMonth);
        return new Date(Date.UTC(targetYear, targetMonth, resolvedDay, base.getUTCHours(), base.getUTCMinutes()));
      }

      case 'ANNUAL': {
        const targetYear = year + 1;
        const daysInTargetMonth = this.getDaysInMonth(targetYear, month);
        const resolvedDay = Math.min(anchor, daysInTargetMonth);
        return new Date(Date.UTC(targetYear, month, resolvedDay, base.getUTCHours(), base.getUTCMinutes()));
      }

      case 'CUSTOM': {
        const validInterval = intervalDays && intervalDays > 0 ? intervalDays : 30;
        const next = new Date(base);
        next.setUTCDate(day + validInterval);
        return next;
      }

      default: {
        const next = new Date(base);
        next.setUTCDate(day + 30);
        return next;
      }
    }
  }

  /**
   * Genera la lista de todas las ocurrencias proyectadas que vencen en el rango [fromDate, toDate].
   */
  public static generateOccurrences(
    obligation: FutureObligation,
    fromDate: Date,
    toDate: Date,
    maxOccurrences = 365,
  ): ObligationOccurrence[] {
    if (obligation.status !== 'ACTIVE') {
      return [];
    }

    const occurrences: ObligationOccurrence[] = [];
    const fromTime = fromDate.getTime();
    const toTime = toDate.getTime();
    const endTime = obligation.endDate ? obligation.endDate.getTime() : Infinity;

    let cursor = new Date(obligation.nextDueDate);
    let count = 0;

    // Si la periodicidad es ONE_TIME, solo evaluamos esa fecha única
    if (obligation.periodicity === 'ONE_TIME') {
      const curTime = cursor.getTime();
      if (curTime >= fromTime && curTime <= toTime && curTime <= endTime) {
        occurrences.push({
          obligationId: obligation.id,
          dueDate: new Date(cursor),
          direction: obligation.direction,
          amountMinor: obligation.amountMinor,
          currency: obligation.currency,
          certainty: obligation.certainty,
          accountId: obligation.accountId,
          categoryId: obligation.categoryId,
        });
      }
      return occurrences;
    }

    // Avanzar cursor si nextDueDate es anterior a fromDate (para encontrar las que caen en rango)
    while (cursor.getTime() < fromTime && count < maxOccurrences) {
      const next = this.calculateNextDueDate(
        cursor,
        obligation.periodicity,
        obligation.intervalDays,
        obligation.anchorDay,
      );
      if (next.getTime() <= cursor.getTime()) break;
      cursor = next;
      count++;
    }

    // Recolectar ocurrencias dentro de la ventana
    count = 0;
    while (cursor.getTime() <= toTime && cursor.getTime() <= endTime && count < maxOccurrences) {
      if (cursor.getTime() >= fromTime) {
        occurrences.push({
          obligationId: obligation.id,
          dueDate: new Date(cursor),
          direction: obligation.direction,
          amountMinor: obligation.amountMinor,
          currency: obligation.currency,
          certainty: obligation.certainty,
          accountId: obligation.accountId,
          categoryId: obligation.categoryId,
        });
      }

      const next = this.calculateNextDueDate(
        cursor,
        obligation.periodicity,
        obligation.intervalDays,
        obligation.anchorDay,
      );
      if (next.getTime() <= cursor.getTime()) break;
      cursor = next;
      count++;
    }

    return occurrences;
  }

  /**
   * Mapea el tipo de patrón recurrente de US-043 al tipo de obligación de US-044.
   */
  public static mapPatternToObligationType(pattern: RecurringPatternType): ObligationType {
    switch (pattern) {
      case 'SALARY':
        return 'SALARY';
      case 'RENT':
        return 'RENT';
      case 'SUBSCRIPTION':
        return 'SUBSCRIPTION';
      case 'LOAN':
        return 'LOAN';
      case 'UTILITY':
        return 'UTILITY';
      default:
        return 'OTHER';
    }
  }

  /**
   * Transforma una transacción recurrente detectada (US-043) en una obligación futura (US-044).
   */
  public static createFromRecurringTransaction(
    recurring: RecurringTransaction,
    overrides?: Partial<CreateFutureObligationInput>,
  ): FutureObligation {
    const direction: ObligationDirection =
      recurring.transactionType === 'INCOME' ? 'INCOME' : 'EXPENSE';

    const obligationType = this.mapPatternToObligationType(recurring.patternType);

    // Por defecto, compromisos legales/firmes son COMMITTED, mientras que salarios o consumos variables son EXPECTED
    let defaultCertainty: ObligationCertainty = 'COMMITTED';
    if (obligationType === 'SALARY' || recurring.isVariableAmount) {
      defaultCertainty = 'EXPECTED';
    }

    const nextDueDate = overrides?.nextDueDate ?? recurring.nextExpectedOccurrence;
    const anchorDay = nextDueDate.getUTCDate();
    const now = new Date();

    return {
      id: overrides?.id ?? `ob_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId: recurring.userId,
      accountId: overrides?.accountId !== undefined ? overrides.accountId : (recurring.accountId ?? null),
      categoryId: overrides?.categoryId !== undefined ? overrides.categoryId : null,
      recurringTransactionId: recurring.id,
      name: overrides?.name ?? recurring.name,
      description: overrides?.description !== undefined ? overrides.description : recurring.description,
      direction: overrides?.direction ?? direction,
      obligationType: overrides?.obligationType ?? obligationType,
      certainty: overrides?.certainty ?? defaultCertainty,
      amountMinor: overrides?.amountMinor ?? (recurring.lastAmountMinor || recurring.averageAmountMinor),
      currency: overrides?.currency ?? recurring.currency,
      periodicity: overrides?.periodicity ?? recurring.periodicity,
      intervalDays: overrides?.intervalDays !== undefined ? overrides.intervalDays : recurring.intervalDays,
      nextDueDate,
      anchorDay,
      endDate: overrides?.endDate ?? null,
      lastFulfilledAt: null,
      status: overrides?.status ?? 'ACTIVE',
      metadata: {
        ...(recurring.metadata || {}),
        derivedFromRecurring: true,
        detectedConfidence: recurring.confidenceScore,
        ...(overrides?.metadata || {}),
      },
      createdAt: now,
      updatedAt: now,
    };
  }
}
