/**
 * IBudgetRepository — Contrato del Repositorio de Presupuestos (US-046)
 *
 * Define las operaciones de persistencia para presupuestos mensuales por categoría.
 */

import type { Budget } from '../models/Budget';

export interface BudgetFilters {
  userId?: string;
  month?: string;
  categoryId?: string;
  isActive?: boolean;
}

export interface IBudgetRepository {
  /** Guarda o actualiza un presupuesto mensual */
  save(budget: Budget): Promise<void>;

  /** Guarda múltiples presupuestos en lote */
  saveMany(budgets: Budget[]): Promise<void>;

  /** Busca un presupuesto por su ID */
  findById(id: string): Promise<Budget | null>;

  /** Obtiene todos los presupuestos de un usuario para un mes dado (YYYY-MM) */
  findByUserAndMonth(userId: string, month: string): Promise<Budget[]>;

  /** Obtiene el presupuesto de una categoría específica en un mes */
  findByCategoryAndMonth(
    userId: string,
    categoryId: string,
    month: string
  ): Promise<Budget | null>;

  /** Lista presupuestos aplicando filtros generales */
  findAll(filters?: BudgetFilters): Promise<Budget[]>;

  /** Elimina un presupuesto por su ID */
  delete(id: string): Promise<void>;

  /** Limpia el almacenamiento de presupuestos (útil para pruebas) */
  clear(): Promise<void>;
}
