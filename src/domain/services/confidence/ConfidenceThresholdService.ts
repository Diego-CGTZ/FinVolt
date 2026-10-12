/**
 * US-030: ConfidenceThresholdService — Motor de Umbrales de Confianza y Automatización de Decisiones
 *
 * Criterios de Aceptación:
 * - ≥90: Auto confirm (confirmación automática sin intervención humana).
 * - 70-89: Register + review (registrar el movimiento y marcarlo para revisión posterior).
 * - <70: Require user (requerir confirmación o interacción explícita del usuario).
 * - Thresholds configurables (a nivel de instancia, global por usuario/entorno o por evaluación).
 */

import type { Transaction, TransactionStatus } from '../../models/Transaction';
import type { TransactionCandidate, CandidateStatus } from '../../models/TransactionCandidate';

/**
 * Acciones canónicas determinadas por los umbrales de confianza (US-030).
 */
export type ConfidenceAction =
  | 'AUTO_CONFIRM'        // ≥90: auto confirm sin intervención del usuario
  | 'REGISTER_AND_REVIEW' // 70-89: registrar el movimiento y marcarlo para revisión
  | 'REQUIRE_USER';       // <70: requerir interacción / aprobación explícita del usuario

/**
 * Configuración formal de umbrales de confianza.
 */
export interface ConfidenceThresholds {
  /**
   * Puntuación mínima para confirmación automática sin intervención humana.
   * Default: 90 (>= 90).
   */
  autoConfirm: number;

  /**
   * Puntuación mínima para registrar y marcar para revisión posterior.
   * Rango operativo: [review, autoConfirm - 1] (Default: 70 a 89).
   * Cualquier puntuación estrictamente menor que `review` requerirá al usuario.
   */
  review: number;
}

/**
 * Valores por defecto definidos en los Criterios de Aceptación de US-030.
 */
export const DEFAULT_CONFIDENCE_THRESHOLDS: Readonly<ConfidenceThresholds> = Object.freeze({
  autoConfirm: 90,
  review: 70,
});

/**
 * Resultado de validación de una configuración de umbrales.
 */
export interface ThresholdValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Dictamen y decisión emitido tras la evaluación contra los umbrales de confianza.
 */
export interface ConfidenceThresholdDecision {
  /** Acción dictaminada según el score y los umbrales */
  action: ConfidenceAction;

  /** Puntuación de confianza evaluada (acotada entre 0 y 100) */
  score: number;

  /** Configuración efectiva de umbrales empleada en la evaluación */
  thresholds: ConfidenceThresholds;

  /** Indicador booleano: ¿Aprobación y confirmación automática sin intervención? */
  isAutoConfirm: boolean;

  /** Indicador booleano: ¿Registrado pero encolado para revisión posterior? */
  isRegisterAndReview: boolean;

  /** Indicador booleano: ¿Requiere confirmación / interacción explícita del usuario? */
  isRequireUser: boolean;

  /** Estado contable recomendado para TransactionCandidate */
  recommendedCandidateStatus: CandidateStatus;

  /** Estado contable recomendado para Transaction (US-028) */
  recommendedTransactionStatus: TransactionStatus;

  /** Flag para marcar si el movimiento necesita atención o revisión */
  requiresReview: boolean;

  /** Flag para marcar si el movimiento requiere autorización directa del usuario */
  requiresUserApproval: boolean;

  /** Justificación textual explicativa del dictamen */
  reason: string;

  /** Fecha y hora de emisión del dictamen */
  evaluatedAt: Date;
}

export class ConfidenceThresholdService {
  /**
   * Umbrales globales compartidos por defecto (pueden ser modificados en runtime).
   */
  private static globalThresholds: ConfidenceThresholds = { ...DEFAULT_CONFIDENCE_THRESHOLDS };

  /**
   * Umbrales específicos de esta instancia de servicio.
   */
  private instanceThresholds: ConfidenceThresholds;

  constructor(customThresholds?: Partial<ConfidenceThresholds>) {
    if (customThresholds) {
      this.instanceThresholds = ConfidenceThresholdService.resolveThresholds(
        customThresholds,
        ConfidenceThresholdService.globalThresholds,
      );
    } else {
      this.instanceThresholds = { ...ConfidenceThresholdService.globalThresholds };
    }
  }

  // ── 1. GESTIÓN Y VALIDACIÓN DE CONFIGURACIÓN ──────────────────────────────

  /**
   * Valida rigurosamente la coherencia de una configuración de umbrales.
   * Reglas:
   * - autoConfirm y review deben ser números válidos y finitos.
   * - Deben ubicarse en el intervalo cerrado [0, 100].
   * - review no puede ser estrictamente mayor que autoConfirm.
   */
  public static validateThresholds(thresholds: unknown): ThresholdValidationResult {
    const errors: string[] = [];

    if (!thresholds || typeof thresholds !== 'object') {
      return { isValid: false, errors: ['La configuración de umbrales debe ser un objeto válido.'] };
    }

    const t = thresholds as Partial<ConfidenceThresholds>;

    if (t.autoConfirm === undefined || t.autoConfirm === null || typeof t.autoConfirm !== 'number' || isNaN(t.autoConfirm)) {
      errors.push('autoConfirm debe ser un número numérico válido.');
    } else if (t.autoConfirm < 0 || t.autoConfirm > 100) {
      errors.push(`autoConfirm (${t.autoConfirm}) debe estar en el rango [0, 100].`);
    }

    if (t.review === undefined || t.review === null || typeof t.review !== 'number' || isNaN(t.review)) {
      errors.push('review debe ser un número numérico válido.');
    } else if (t.review < 0 || t.review > 100) {
      errors.push(`review (${t.review}) debe estar en el rango [0, 100].`);
    }

    if (
      typeof t.autoConfirm === 'number' &&
      !isNaN(t.autoConfirm) &&
      typeof t.review === 'number' &&
      !isNaN(t.review)
    ) {
      if (t.review > t.autoConfirm) {
        errors.push(
          `El umbral de revisión (${t.review}) no puede ser mayor que el umbral de auto-confirmación (${t.autoConfirm}).`,
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Lanza un error de validación si los umbrales no cumplen con los invariantes de dominio.
   */
  public static assertValidThresholds(thresholds: unknown): asserts thresholds is ConfidenceThresholds {
    const validation = this.validateThresholds(thresholds);
    if (!validation.isValid) {
      throw new Error(`Configuración de umbrales inválida: ${validation.errors.join('; ')}`);
    }
  }

  /**
   * Modifica los umbrales globales en tiempo de ejecución.
   */
  public static setGlobalThresholds(newThresholds: Partial<ConfidenceThresholds>): void {
    const resolved = this.resolveThresholds(newThresholds, this.globalThresholds);
    this.assertValidThresholds(resolved);
    this.globalThresholds = resolved;
  }

  /**
   * Restablece los umbrales globales a los valores por defecto del sistema (90 y 70).
   */
  public static resetGlobalThresholds(): void {
    this.globalThresholds = { ...DEFAULT_CONFIDENCE_THRESHOLDS };
  }

  /**
   * Obtiene una copia inmutable de los umbrales globales actuales.
   */
  public static getGlobalThresholds(): Readonly<ConfidenceThresholds> {
    return { ...this.globalThresholds };
  }

  /**
   * Actualiza los umbrales de esta instancia.
   */
  public setThresholds(newThresholds: Partial<ConfidenceThresholds>): void {
    const resolved = ConfidenceThresholdService.resolveThresholds(
      newThresholds,
      this.instanceThresholds,
    );
    ConfidenceThresholdService.assertValidThresholds(resolved);
    this.instanceThresholds = resolved;
  }

  /**
   * Obtiene los umbrales configurados para esta instancia.
   */
  public getThresholds(): Readonly<ConfidenceThresholds> {
    return { ...this.instanceThresholds };
  }

  // ── 2. EVALUACIÓN Y TOMA DE DECISIONES ─────────────────────────────────────

  /**
   * Evalúa estáticamente una puntuación numérica de confianza contra umbrales dados.
   *
   * Reglas de Decisión (AC US-030):
   * - score >= autoConfirm (Default: ≥90): AUTO_CONFIRM
   * - score >= review && score < autoConfirm (Default: 70-89): REGISTER_AND_REVIEW
   * - score < review (Default: <70): REQUIRE_USER
   */
  public static evaluate(
    score: number,
    customThresholds?: Partial<ConfidenceThresholds>,
  ): ConfidenceThresholdDecision {
    const effectiveThresholds = this.resolveThresholds(customThresholds, this.globalThresholds);
    this.assertValidThresholds(effectiveThresholds);

    const normalizedScore = this.normalizeScore(score);
    const now = new Date();

    if (normalizedScore >= effectiveThresholds.autoConfirm) {
      return {
        action: 'AUTO_CONFIRM',
        score: normalizedScore,
        thresholds: effectiveThresholds,
        isAutoConfirm: true,
        isRegisterAndReview: false,
        isRequireUser: false,
        recommendedCandidateStatus: 'AUTO_CONFIRMED',
        recommendedTransactionStatus: 'CONFIRMED',
        requiresReview: false,
        requiresUserApproval: false,
        reason: `Puntuación de confianza (${normalizedScore}/100) alcanza o supera el umbral de auto-confirmación (${effectiveThresholds.autoConfirm}). Operación confirmada automáticamente sin requerir intervención humana.`,
        evaluatedAt: now,
      };
    }

    if (normalizedScore >= effectiveThresholds.review) {
      return {
        action: 'REGISTER_AND_REVIEW',
        score: normalizedScore,
        thresholds: effectiveThresholds,
        isAutoConfirm: false,
        isRegisterAndReview: true,
        isRequireUser: false,
        recommendedCandidateStatus: 'PENDING_REVIEW',
        recommendedTransactionStatus: 'PENDING',
        requiresReview: true,
        requiresUserApproval: false,
        reason: `Puntuación de confianza (${normalizedScore}/100) en rango intermedio [${effectiveThresholds.review}, ${effectiveThresholds.autoConfirm - 1}]. El movimiento es registrado en el sistema pero encolado para revisión y corroboración posterior.`,
        evaluatedAt: now,
      };
    }

    return {
      action: 'REQUIRE_USER',
      score: normalizedScore,
      thresholds: effectiveThresholds,
      isAutoConfirm: false,
      isRegisterAndReview: false,
      isRequireUser: true,
      recommendedCandidateStatus: 'PENDING_REVIEW',
      recommendedTransactionStatus: 'CANDIDATE',
      requiresReview: true,
      requiresUserApproval: true,
      reason: `Puntuación de confianza (${normalizedScore}/100) inferior al umbral de revisión (${effectiveThresholds.review}). Requiere categorización, asignación de cuenta o aprobación explícita por parte del usuario.`,
      evaluatedAt: now,
    };
  }

  /**
   * Evalúa la puntuación usando los umbrales de esta instancia de servicio.
   */
  public evaluate(
    score: number,
    customThresholds?: Partial<ConfidenceThresholds>,
  ): ConfidenceThresholdDecision {
    const effectiveThresholds = ConfidenceThresholdService.resolveThresholds(
      customThresholds,
      this.instanceThresholds,
    );
    return ConfidenceThresholdService.evaluate(score, effectiveThresholds);
  }

  /**
   * Evalúa un TransactionCandidate extrayendo su confidenceScore.
   */
  public static evaluateCandidate(
    candidate: Pick<TransactionCandidate, 'confidenceScore'>,
    customThresholds?: Partial<ConfidenceThresholds>,
  ): ConfidenceThresholdDecision {
    const score = typeof candidate.confidenceScore === 'number' ? candidate.confidenceScore : 0;
    return this.evaluate(score, customThresholds);
  }

  /**
   * Evalúa un TransactionCandidate con los umbrales de la instancia.
   */
  public evaluateCandidate(
    candidate: Pick<TransactionCandidate, 'confidenceScore'>,
    customThresholds?: Partial<ConfidenceThresholds>,
  ): ConfidenceThresholdDecision {
    return this.evaluate(candidate.confidenceScore, customThresholds);
  }

  /**
   * Evalúa una Transaction canónica extrayendo su confidenceScore si está disponible.
   */
  public static evaluateTransaction(
    transaction: Pick<Transaction, 'confidenceScore'>,
    customThresholds?: Partial<ConfidenceThresholds>,
  ): ConfidenceThresholdDecision {
    const score = typeof transaction.confidenceScore === 'number' ? transaction.confidenceScore : 0;
    return this.evaluate(score, customThresholds);
  }

  /**
   * Evalúa una Transaction canónica con los umbrales de la instancia.
   */
  public evaluateTransaction(
    transaction: Pick<Transaction, 'confidenceScore'>,
    customThresholds?: Partial<ConfidenceThresholds>,
  ): ConfidenceThresholdDecision {
    return this.evaluate(transaction.confidenceScore || 0, customThresholds);
  }

  // ── 3. APLICACIÓN Y MUTACIÓN CONTROLADA DE ENTIDADES ──────────────────────

  /**
   * Aplica la decisión de umbrales sobre un TransactionCandidate:
   * - Si es AUTO_CONFIRM: actualiza su status a 'AUTO_CONFIRMED'.
   * - Si es REGISTER_AND_REVIEW o REQUIRE_USER: conserva o establece status 'PENDING_REVIEW'.
   * - Registra en metadata el dictamen emitido, flags y fecha de evaluación.
   */
  public static applyToCandidate(
    candidate: TransactionCandidate,
    customThresholds?: Partial<ConfidenceThresholds>,
  ): TransactionCandidate {
    const decision = this.evaluateCandidate(candidate, customThresholds);

    const updated: TransactionCandidate = {
      ...candidate,
      status: decision.recommendedCandidateStatus,
      metadata: {
        ...(candidate.metadata || {}),
        confidenceAction: decision.action,
        requiresReview: decision.requiresReview,
        requiresUserApproval: decision.requiresUserApproval,
        thresholdDecision: {
          action: decision.action,
          score: decision.score,
          thresholds: decision.thresholds,
          reason: decision.reason,
          evaluatedAt: decision.evaluatedAt.toISOString(),
        },
      },
      updatedAt: new Date(),
    };

    return updated;
  }

  /**
   * Aplica la decisión de umbrales sobre una Transaction canónica:
   * - Si es AUTO_CONFIRM y está en CANDIDATE: promueve a CONFIRMED.
   * - Si es REGISTER_AND_REVIEW y está en CANDIDATE: ajusta a PENDING con flag de revisión.
   * - Registra en metadata el dictamen formal.
   */
  public static applyToTransaction(
    transaction: Transaction,
    customThresholds?: Partial<ConfidenceThresholds>,
  ): Transaction {
    const score = transaction.confidenceScore ?? 0;
    const decision = this.evaluate(score, customThresholds);

    let nextStatus = transaction.status;
    if (transaction.status === 'CANDIDATE') {
      nextStatus = decision.recommendedTransactionStatus;
    }

    const updated: Transaction = {
      ...transaction,
      status: nextStatus,
      metadata: {
        ...(transaction.metadata || {}),
        confidenceAction: decision.action,
        requiresReview: decision.requiresReview,
        requiresUserApproval: decision.requiresUserApproval,
        thresholdDecision: {
          action: decision.action,
          score: decision.score,
          thresholds: decision.thresholds,
          reason: decision.reason,
          evaluatedAt: decision.evaluatedAt.toISOString(),
        },
      },
      updatedAt: new Date(),
    };

    return updated;
  }

  // ── 4. MÉTODOS AUXILIARES PRIVADOS ────────────────────────────────────────

  /**
   * Resuelve y combina umbrales parciales sobre una base garantizada.
   */
  private static resolveThresholds(
    overrides?: Partial<ConfidenceThresholds>,
    fallback: ConfidenceThresholds = DEFAULT_CONFIDENCE_THRESHOLDS,
  ): ConfidenceThresholds {
    if (!overrides) {
      return { ...fallback };
    }

    return {
      autoConfirm:
        typeof overrides.autoConfirm === 'number' ? overrides.autoConfirm : fallback.autoConfirm,
      review: typeof overrides.review === 'number' ? overrides.review : fallback.review,
    };
  }

  /**
   * Normaliza y acota el score al rango cerrado entero [0, 100].
   */
  private static normalizeScore(rawScore: unknown): number {
    if (typeof rawScore !== 'number' || isNaN(rawScore)) {
      return 0;
    }
    const rounded = Math.round(rawScore);
    return Math.max(0, Math.min(100, rounded));
  }
}
