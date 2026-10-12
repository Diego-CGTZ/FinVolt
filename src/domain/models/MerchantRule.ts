/**
 * US-024: Modelo de Regla de Normalización de Comercios (Merchant Normalization)
 *
 * Define la estructura de las reglas configurables para transformar variantes
 * textuales de comercios (rawMerchant) en nombres canónicos limpios (normalizedMerchant)
 * conservando siempre el texto original intacto.
 */

export type MerchantPatternType = 'CONTAINS' | 'REGEX' | 'EXACT' | 'PREFIX';

export interface MerchantRule {
  id: string;

  /** Nombre canónico y unificado del comercio (ej: "Amazon", "Uber", "Uber Eats") */
  merchantName: string;

  /** Lista de patrones textuales o expresiones regulares que identifican a este comercio */
  patterns: string[];

  /** Tipo de evaluación para los patrones (por defecto CONTAINS) */
  patternType?: MerchantPatternType;

  /**
   * Prioridad numérica para resolución de ambigüedades.
   * Reglas con mayor prioridad se evalúan primero (ej: "Uber Eats" con prioridad 60
   * antes que "Uber" con prioridad 50).
   */
  priority: number;

  /** Sugerencia opcional de categoría para el motor de clasificación (US-031) */
  categoryHint?: string;

  /** Indica si la regla fue creada por el usuario o es parte del catálogo del sistema */
  isUserDefined: boolean;

  /** ID del usuario al que pertenece la regla personalizada (null si es global/sistema) */
  userId?: string | null;

  /** Estado activo de la regla */
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export interface NormalizedMerchantResult {
  /** Nombre original del comercio tal como llegó de la fuente (inmutable) */
  rawMerchant: string | null;

  /** Nombre canónico y limpio generado tras la normalización */
  normalizedMerchant: string | null;

  /** Alias conveniente de normalizedMerchant */
  canonicalName: string | null;

  /** ID de la regla configurable que aplicó (si alguna coincidió) */
  ruleId?: string;

  /** Puntuación de confianza (0 - 100) del proceso de normalización */
  confidence: number;

  /** Sugerencia de categoría si la regla la especificó */
  categoryHint?: string;

  /** Patrón que provocó la coincidencia */
  matchedPattern?: string;
}

export interface CreateMerchantRuleDTO {
  merchantName: string;
  patterns: string[];
  patternType?: MerchantPatternType;
  priority?: number;
  categoryHint?: string;
  isUserDefined?: boolean;
  userId?: string | null;
  isActive?: boolean;
}
