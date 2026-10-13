/**
 * IRecurringTransactionRepository — Repositorio de Transacciones Recurrentes (US-043)
 *
 * Define el contrato de persistencia para operaciones recurrentes detectadas
 * o confirmadas por el usuario.
 */

import type {
  RecurringPatternType,
  RecurringTransaction,
} from '../models/RecurringTransaction';

export interface RecurringTransactionFilters {
  userId?: string;
  accountId?: string;
  patternType?: RecurringPatternType;
  status?: RecurringTransaction['status'];
}

export interface IRecurringTransactionRepository {
  /** Guarda o actualiza una transacción recurrente */
  save(recurring: RecurringTransaction): Promise<void>;

  /** Guarda múltiples transacciones recurrentes en lote */
  saveMany(recurringList: RecurringTransaction[]): Promise<void>;

  /** Obtiene una transacción recurrente por su identificador único */
  findById(id: string): Promise<RecurringTransaction | null>;

  /** Lista transacciones recurrentes de un usuario */
  findByUserId(userId: string): Promise<RecurringTransaction[]>;

  /** Lista transacciones recurrentes asociadas a una cuenta específica */
  findByAccountId(accountId: string): Promise<RecurringTransaction[]>;

  /** Lista transacciones recurrentes filtradas por tipo de patrón (SALARY, RENT, etc.) */
  findByPatternType(
    userId: string,
    patternType: RecurringPatternType,
  ): Promise<RecurringTransaction[]>;

  /** Lista transacciones recurrentes según filtros aplicados */
  findAll(filters?: RecurringTransactionFilters): Promise<RecurringTransaction[]>;

  /** Elimina una transacción recurrente por ID */
  delete(id: string): Promise<void>;

  /** Limpia o resetea el repositorio (útil en pruebas) */
  clear(): Promise<void>;
}
