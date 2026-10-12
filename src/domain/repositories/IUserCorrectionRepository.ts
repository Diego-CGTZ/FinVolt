/**
 * US-032: Repositorio de Correcciones de Categoría del Usuario
 *
 * Define las operaciones de persistencia y consulta del historial de correcciones
 * y trazabilidad de aprendizaje de reglas.
 */

import type { UserCategoryCorrectionRecord, UserCategoryRuleRecord } from '../models/UserCorrection';

export interface IUserCorrectionRepository {
  /**
   * Guarda un nuevo registro inmutable de corrección manual.
   */
  saveCorrection(record: UserCategoryCorrectionRecord): Promise<UserCategoryCorrectionRecord>;

  /**
   * Obtiene una corrección por su ID.
   */
  findCorrectionById(id: string): Promise<UserCategoryCorrectionRecord | null>;

  /**
   * Obtiene todas las correcciones realizadas por un usuario (ordenadas por fecha DESC).
   */
  findCorrectionsByUserId(userId: string): Promise<UserCategoryCorrectionRecord[]>;

  /**
   * Obtiene las correcciones aplicadas a una entidad específica (transacción o candidato).
   */
  findCorrectionsByEntityId(entityId: string): Promise<UserCategoryCorrectionRecord[]>;

  /**
   * Guarda o actualiza una regla de categorización reutilizable del usuario.
   */
  saveRule(rule: UserCategoryRuleRecord): Promise<UserCategoryRuleRecord>;

  /**
   * Obtiene todas las reglas de categorización activas de un usuario.
   */
  findRulesByUserId(userId: string): Promise<UserCategoryRuleRecord[]>;

  /**
   * Elimina o desactiva una regla reutilizable por su ID.
   */
  deleteRule(userId: string, ruleId: string): Promise<boolean>;

  /**
   * Cuenta total de correcciones registradas para un usuario.
   */
  countCorrections(userId: string): Promise<number>;
}
