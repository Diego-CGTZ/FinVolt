/**
 * US-024: Repositorio de Reglas de Normalización de Comercios
 *
 * Contrato de acceso a datos para gestión de reglas del sistema y reglas
 * personalizadas del usuario.
 */

import type { MerchantRule, CreateMerchantRuleDTO } from '../models/MerchantRule';

export interface MerchantRuleFilter {
  userId?: string | null;
  isActive?: boolean;
  isUserDefined?: boolean;
  merchantName?: string;
  limit?: number;
  offset?: number;
}

export interface IMerchantRuleRepository {
  /**
   * Obtiene todas las reglas activas aplicables, combinando reglas globales del sistema
   * y las reglas personalizadas del usuario (si se provee userId).
   * Ordenadas por prioridad descendente.
   */
  findActiveRules(userId?: string | null): Promise<MerchantRule[]>;

  /**
   * Lista reglas según criterios de filtro.
   */
  findAll(filter?: MerchantRuleFilter): Promise<MerchantRule[]>;

  /**
   * Obtiene una regla por su identificador único.
   */
  findById(id: string): Promise<MerchantRule | null>;

  /**
   * Crea una nueva regla (típicamente configurada por el usuario).
   */
  create(dto: CreateMerchantRuleDTO): Promise<MerchantRule>;

  /**
   * Actualiza una regla existente.
   */
  update(id: string, updates: Partial<CreateMerchantRuleDTO>): Promise<MerchantRule>;

  /**
   * Elimina una regla por su ID.
   */
  delete(id: string): Promise<void>;

  /**
   * Cuenta total de reglas según filtro.
   */
  count(filter?: MerchantRuleFilter): Promise<number>;
}
