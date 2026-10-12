/**
 * US-032: Modelo de Corrección de Usuario y Reglas Reutilizables
 *
 * Representa el registro inmutable de una corrección manual realizada por el usuario
 * sobre la categoría de una transacción o candidato, con la capacidad de convertirla
 * en conocimiento reutilizable sin alterar el RawEvent original.
 */

export type CorrectionEntityType = 'TRANSACTION' | 'CANDIDATE';

export interface UserCategoryCorrectionRecord {
  id: string;
  userId: string;
  entityType: CorrectionEntityType;
  entityId: string;

  /** Referencia inmutable al evento crudo de origen (US-018) */
  rawEventId?: string | null;

  /** Nombre del comercio identificado */
  merchant: string | null;

  /** Nombre original crudo del comercio */
  merchantRaw: string | null;

  /** Categoría previa antes de la corrección */
  previousCategoryName?: string | null;
  previousCategoryId?: string | null;

  /** Nueva categoría asignada por el usuario */
  newCategoryName: string;
  newCategoryId?: string | null;

  /** Si la corrección fue convertida en regla/preferencia reutilizable */
  saveAsRule: boolean;

  /** ID de la regla creada en el motor determinístico (si aplica) */
  createdRuleId?: string | null;

  /** Patrón de texto empleado para la regla reutilizable */
  patternUsed?: string | null;

  /** Fecha y hora de la corrección */
  createdAt: Date;
}

export interface ApplyCategoryCorrectionDTO {
  userId: string;
  entityType: CorrectionEntityType;
  entityId: string;
  newCategoryName: string;
  newCategoryId?: string | null;

  /**
   * Criterio AC: puede crear regla/preferencia reutilizable
   * Si es true, el motor determinístico aprenderá esta asociación para movimientos futuros.
   */
  saveAsReusableRule?: boolean;

  /** Patrón personalizado opcional para la regla (por defecto usa el nombre del comercio) */
  customPattern?: string;
}

export interface UserCategoryRuleRecord {
  id: string;
  userId: string;
  merchantPattern: string;
  categoryName: string;
  categoryId?: string | null;
  priority: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
