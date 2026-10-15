/**
 * ManageFutureObligationsUseCase — Caso de Uso para Gestión de Obligaciones Futuras (US-044)
 *
 * Orquesta la creación, actualización, proyección de vencimientos y cumplimiento
 * de obligaciones financieras futuras, así como la sincronización automática
 * a partir de transacciones recurrentes detectadas (US-043).
 */

import type { IFutureObligationRepository } from '../../domain/repositories/IFutureObligationRepository';
import type { IRecurringTransactionRepository } from '../../domain/repositories/IRecurringTransactionRepository';
import type {
  FutureObligation,
  CreateFutureObligationInput,
  UpdateFutureObligationInput,
  ObligationOccurrence,
} from '../../domain/models/FutureObligation';
import { ObligationScheduleCalculator } from '../../domain/services/obligations/ObligationScheduleCalculator';
import { defaultFutureObligationRepository } from '../../infrastructure/database/AsyncStorageFutureObligationRepository';
import { defaultRecurringTransactionRepository } from '../../infrastructure/database/AsyncStorageRecurringTransactionRepository';

export interface UpcomingObligationsResult {
  obligations: FutureObligation[];
  occurrences: ObligationOccurrence[];
  totalCommittedExpenseMinor: number;
  totalCommittedIncomeMinor: number;
  totalExpectedExpenseMinor: number;
  totalExpectedIncomeMinor: number;
}

export class ManageFutureObligationsUseCase {
  constructor(
    private readonly obligationRepository: IFutureObligationRepository = defaultFutureObligationRepository,
    private readonly recurringRepository: IRecurringTransactionRepository = defaultRecurringTransactionRepository,
  ) {}

  /**
   * Crea y persiste una nueva obligación futura.
   */
  public async create(input: CreateFutureObligationInput): Promise<FutureObligation> {
    if (!input.name || !input.name.trim()) {
      throw new Error('El nombre de la obligación es requerido.');
    }
    if (input.amountMinor <= 0) {
      throw new Error('El monto de la obligación debe ser mayor a cero.');
    }
    if (!input.nextDueDate || isNaN(input.nextDueDate.getTime())) {
      throw new Error('La fecha de próximo vencimiento es inválida.');
    }

    const anchorDay = input.nextDueDate.getUTCDate();
    const now = new Date();
    const id = input.id || `ob_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const obligation: FutureObligation = {
      id,
      userId: input.userId,
      accountId: input.accountId ?? null,
      categoryId: input.categoryId ?? null,
      recurringTransactionId: input.recurringTransactionId ?? null,
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      direction: input.direction,
      obligationType: input.obligationType ?? 'OTHER',
      certainty: input.certainty ?? 'COMMITTED',
      amountMinor: Math.round(input.amountMinor),
      currency: (input.currency || 'MXN').trim().toUpperCase(),
      periodicity: input.periodicity,
      intervalDays: input.intervalDays ?? null,
      nextDueDate: new Date(input.nextDueDate),
      anchorDay,
      endDate: input.endDate ? new Date(input.endDate) : null,
      lastFulfilledAt: null,
      status: input.status ?? 'ACTIVE',
      metadata: input.metadata || {},
      createdAt: now,
      updatedAt: now,
    };

    await this.obligationRepository.save(obligation);
    return obligation;
  }

  /**
   * Actualiza una obligación existente.
   */
  public async update(
    id: string,
    patch: UpdateFutureObligationInput,
  ): Promise<FutureObligation> {
    const existing = await this.obligationRepository.findById(id);
    if (!existing) {
      throw new Error(`Obligación con ID ${id} no encontrada.`);
    }

    const updated: FutureObligation = {
      ...existing,
      ...patch,
      anchorDay: patch.nextDueDate ? patch.nextDueDate.getUTCDate() : existing.anchorDay,
      updatedAt: new Date(),
    };

    await this.obligationRepository.save(updated);
    return updated;
  }

  /**
   * Marca la obligación como cumplida o pagada para el vencimiento actual.
   * Avanza nextDueDate a la siguiente ocurrencia si es periódica, o a COMPLETED si era ONE_TIME
   * o si la siguiente fecha supera endDate.
   */
  public async fulfill(
    id: string,
    fulfilledAt: Date = new Date(),
  ): Promise<{ obligation: FutureObligation; completed: boolean }> {
    const existing = await this.obligationRepository.findById(id);
    if (!existing) {
      throw new Error(`Obligación con ID ${id} no encontrada.`);
    }

    let completed = false;
    let nextDueDate = existing.nextDueDate;
    let nextStatus = existing.status;

    if (existing.periodicity === 'ONE_TIME') {
      completed = true;
      nextStatus = 'COMPLETED';
    } else {
      nextDueDate = ObligationScheduleCalculator.calculateNextDueDate(
        existing.nextDueDate,
        existing.periodicity,
        existing.intervalDays,
        existing.anchorDay,
      );

      if (existing.endDate && nextDueDate.getTime() > existing.endDate.getTime()) {
        completed = true;
        nextStatus = 'COMPLETED';
      }
    }

    const updated: FutureObligation = {
      ...existing,
      nextDueDate,
      status: nextStatus,
      lastFulfilledAt: fulfilledAt,
      updatedAt: new Date(),
    };

    await this.obligationRepository.save(updated);
    return { obligation: updated, completed };
  }

  /**
   * Obtiene las obligaciones activas y sus ocurrencias proyectadas en un horizonte temporal.
   */
  public async getUpcoming(
    userId: string,
    horizonDays = 30,
    fromDate: Date = new Date(),
  ): Promise<UpcomingObligationsResult> {
    const toDate = new Date(fromDate);
    toDate.setUTCDate(toDate.getUTCDate() + horizonDays);

    const obligations = await this.obligationRepository.findByUserId(userId);
    const activeObligations = obligations.filter((o) => o.status === 'ACTIVE');

    const allOccurrences: ObligationOccurrence[] = [];

    let totalCommittedExpenseMinor = 0;
    let totalCommittedIncomeMinor = 0;
    let totalExpectedExpenseMinor = 0;
    let totalExpectedIncomeMinor = 0;

    for (const ob of activeObligations) {
      const occs = ObligationScheduleCalculator.generateOccurrences(ob, fromDate, toDate);
      for (const occ of occs) {
        allOccurrences.push(occ);

        if (occ.direction === 'EXPENSE') {
          if (occ.certainty === 'COMMITTED') {
            totalCommittedExpenseMinor += occ.amountMinor;
          } else {
            totalExpectedExpenseMinor += occ.amountMinor;
          }
        } else {
          if (occ.certainty === 'COMMITTED') {
            totalCommittedIncomeMinor += occ.amountMinor;
          } else {
            totalExpectedIncomeMinor += occ.amountMinor;
          }
        }
      }
    }

    allOccurrences.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    return {
      obligations: activeObligations,
      occurrences: allOccurrences,
      totalCommittedExpenseMinor,
      totalCommittedIncomeMinor,
      totalExpectedExpenseMinor,
      totalExpectedIncomeMinor,
    };
  }

  /**
   * Sincroniza y deriva obligaciones futuras automáticamente desde transacciones recurrentes (US-043).
   */
  public async syncFromRecurring(userId: string): Promise<FutureObligation[]> {
    const recurringList = await this.recurringRepository.findByUserId(userId);
    const existingObligations = await this.obligationRepository.findByUserId(userId);

    const existingRecurringIds = new Set(
      existingObligations
        .map((o) => o.recurringTransactionId)
        .filter((id): id is string => Boolean(id)),
    );

    const createdObligations: FutureObligation[] = [];

    for (const rec of recurringList) {
      // Solo consideramos patrones confirmados o detectados que no hayan sido descartados
      if (rec.status === 'DISMISSED') continue;
      if (existingRecurringIds.has(rec.id)) continue;

      const newObligation = ObligationScheduleCalculator.createFromRecurringTransaction(rec);
      await this.obligationRepository.save(newObligation);
      createdObligations.push(newObligation);
      existingRecurringIds.add(rec.id);
    }

    return createdObligations;
  }
}
