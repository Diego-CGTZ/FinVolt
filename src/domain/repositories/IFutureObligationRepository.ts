/**
 * IFutureObligationRepository — Repositorio de Obligaciones Futuras (US-044)
 *
 * Define el contrato de persistencia para representar ingresos y gastos futuros
 * comprometidos o esperados (renta, nómina, préstamos, suscripciones, etc.).
 */

import type {
  FutureObligation,
  ObligationDirection,
  ObligationType,
  ObligationCertainty,
  ObligationStatus,
} from '../models/FutureObligation';

export interface FutureObligationFilters {
  userId?: string;
  accountId?: string | null;
  categoryId?: string | null;
  direction?: ObligationDirection;
  obligationType?: ObligationType;
  certainty?: ObligationCertainty;
  status?: ObligationStatus;
  dueBefore?: Date;
  dueAfter?: Date;
}

export interface IFutureObligationRepository {
  /** Guarda o actualiza una obligación futura */
  save(obligation: FutureObligation): Promise<void>;

  /** Guarda múltiples obligaciones futuras en lote */
  saveMany(obligations: FutureObligation[]): Promise<void>;

  /** Obtiene una obligación futura por su ID */
  findById(id: string): Promise<FutureObligation | null>;

  /** Lista obligaciones futuras pertenecientes a un usuario */
  findByUserId(userId: string): Promise<FutureObligation[]>;

  /** Lista obligaciones asociadas a una cuenta financiera específica */
  findByAccountId(accountId: string): Promise<FutureObligation[]>;

  /** Lista obligaciones asociadas a una categoría específica */
  findByCategoryId(categoryId: string): Promise<FutureObligation[]>;

  /** Lista obligaciones activas próximas a vencer hasta una fecha límite */
  findUpcoming(userId: string, untilDate: Date): Promise<FutureObligation[]>;

  /** Lista obligaciones aplicando filtros */
  findAll(filters?: FutureObligationFilters): Promise<FutureObligation[]>;

  /** Elimina una obligación por ID */
  delete(id: string): Promise<void>;

  /** Limpia todas las obligaciones en el almacenamiento (útil en pruebas) */
  clear(): Promise<void>;
}
