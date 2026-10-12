/**
 * US-023: Servicio de Dominio de Transaction Candidates
 *
 * Administra el ciclo de vida, validaciones de integridad y transiciones de estado
 * de los candidatos de transacción generados por fuentes de ingestión externas.
 *
 * INVARIANTE ESTRICTA DE DOMINIO:
 * Un TransactionCandidate representa una intención o movimiento detectado de forma
 * preliminar. NO es una Transaction confirmada y NO se inserta automáticamente
 * en la tabla `transactions`.
 */

import type {
  CandidateStatus,
  CreateCandidateDTO,
  TransactionCandidate,
} from '../models/TransactionCandidate';
import type {
  CandidateFilter,
  ITransactionCandidateRepository,
} from '../repositories/ITransactionCandidateRepository';
import {
  ConfidenceThresholdService,
  type ConfidenceThresholds,
  type ConfidenceThresholdDecision,
} from './confidence/ConfidenceThresholdService';

export interface CandidateValidationResult {
  isValid: boolean;
  errors: string[];
}

export class TransactionCandidateService {
  constructor(private candidateRepository: ITransactionCandidateRepository) {}

  /**
   * Valida las reglas de integridad de un candidato.
   */
  public validateCandidateInput(dto: CreateCandidateDTO): CandidateValidationResult {
    const errors: string[] = [];

    if (!dto.rawEventId || dto.rawEventId.trim().length === 0) {
      errors.push('El campo rawEventId es obligatorio para garantizar trazabilidad.');
    }

    if (dto.amount === undefined || dto.amount === null || isNaN(dto.amount) || dto.amount <= 0) {
      errors.push('El monto debe ser un número positivo mayor a 0.');
    }

    if (
      dto.confidenceScore === undefined ||
      dto.confidenceScore === null ||
      isNaN(dto.confidenceScore) ||
      dto.confidenceScore < 0 ||
      dto.confidenceScore > 100
    ) {
      errors.push('El score de confianza (confidenceScore) debe estar entre 0 y 100.');
    }

    if (!dto.provider || dto.provider.trim().length === 0) {
      errors.push('El proveedor financiero es requerido.');
    }

    if (!dto.source) {
      errors.push('La fuente de procedencia (source) es requerida.');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Crea un nuevo candidato a partir de un DTO validado y lo persiste.
   */
  public async createCandidate(dto: CreateCandidateDTO): Promise<TransactionCandidate> {
    const validation = this.validateCandidateInput(dto);
    if (!validation.isValid) {
      throw new Error(`Datos inválidos para TransactionCandidate: ${validation.errors.join('; ')}`);
    }

    const amountMinor = Math.round(dto.amount * 100);
    const initialStatus: CandidateStatus = 'PENDING_REVIEW';
    const now = new Date();

    const candidate: TransactionCandidate = {
      id: `cand-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      userId: dto.userId || 'system',
      rawEventId: dto.rawEventId,
      source: dto.source,
      provider: dto.provider.trim().toUpperCase(),
      amountMinor,
      amount: dto.amount,
      currency: (dto.currency || 'MXN').toUpperCase(),
      type: dto.type,
      merchantRaw: dto.merchantRaw || null,
      merchant: dto.merchant || dto.merchantRaw || null,
      occurredAt: dto.occurredAt || now,
      confidenceScore: dto.confidenceScore,
      accountHint: dto.accountHint,
      status: initialStatus,
      rawPayload: dto.rawPayload || {},
      metadata: dto.metadata || {},
      createdAt: now,
      updatedAt: now,
    };

    return this.candidateRepository.save(candidate);
  }

  /**
   * Confirma automáticamente un candidato si cumple con reglas de alta confianza (>= 90).
   * Soporta umbrales configurables (US-030).
   */
  public async autoConfirmIfEligible(
    candidateId: string,
    minConfidenceThreshold = 90,
  ): Promise<TransactionCandidate> {
    const candidate = await this.candidateRepository.findById(candidateId);
    if (!candidate) {
      throw new Error(`Candidato no encontrado: ${candidateId}`);
    }

    const decision = ConfidenceThresholdService.evaluateCandidate(candidate, {
      autoConfirm: minConfidenceThreshold,
    });

    if (decision.isAutoConfirm && candidate.status === 'PENDING_REVIEW') {
      const updated = await this.candidateRepository.updateStatus(candidateId, 'AUTO_CONFIRMED');
      updated.metadata = {
        ...(updated.metadata || {}),
        confidenceAction: decision.action,
        thresholdDecision: {
          action: decision.action,
          score: decision.score,
          thresholds: decision.thresholds,
          reason: decision.reason,
          evaluatedAt: decision.evaluatedAt.toISOString(),
        },
      };
      await this.candidateRepository.save(updated);
      return updated;
    }

    return candidate;
  }

  /**
   * Evalúa un candidato contra los umbrales de confianza sin mutar su estado (US-030).
   */
  public async evaluateThresholds(
    candidateId: string,
    customThresholds?: Partial<ConfidenceThresholds>,
  ): Promise<{ candidate: TransactionCandidate; decision: ConfidenceThresholdDecision }> {
    const candidate = await this.candidateRepository.findById(candidateId);
    if (!candidate) {
      throw new Error(`Candidato no encontrado: ${candidateId}`);
    }

    const decision = ConfidenceThresholdService.evaluateCandidate(candidate, customThresholds);
    return { candidate, decision };
  }

  /**
   * Procesa y aplica formalmente el dictamen de umbrales sobre el candidato (US-030):
   * - AUTO_CONFIRM (≥90): Transiciona a AUTO_CONFIRMED.
   * - REGISTER_AND_REVIEW (70-89): Permanece PENDING_REVIEW con flag requiresReview = true.
   * - REQUIRE_USER (<70): Permanece PENDING_REVIEW con flag requiresUserApproval = true.
   */
  public async processThresholdDecision(
    candidateId: string,
    customThresholds?: Partial<ConfidenceThresholds>,
  ): Promise<{ candidate: TransactionCandidate; decision: ConfidenceThresholdDecision }> {
    const candidate = await this.candidateRepository.findById(candidateId);
    if (!candidate) {
      throw new Error(`Candidato no encontrado: ${candidateId}`);
    }

    const updated = ConfidenceThresholdService.applyToCandidate(candidate, customThresholds);
    const decision = ConfidenceThresholdService.evaluateCandidate(candidate, customThresholds);

    if (updated.status !== candidate.status) {
      await this.candidateRepository.updateStatus(candidateId, updated.status);
    }
    const saved = await this.candidateRepository.save(updated);

    return { candidate: saved, decision };
  }

  /**
   * Marca un candidato como RECHAZADO por el usuario o regla de exclusión.
   */
  public async rejectCandidate(
    candidateId: string,
    reason?: string,
  ): Promise<TransactionCandidate> {
    const candidate = await this.candidateRepository.findById(candidateId);
    if (!candidate) {
      throw new Error(`Candidato no encontrado: ${candidateId}`);
    }

    if (candidate.status === 'RECONCILED') {
      throw new Error('No se puede rechazar un candidato que ya ha sido formalmente reconciliado.');
    }

    const updated = await this.candidateRepository.updateStatus(candidateId, 'REJECTED');
    if (reason) {
      updated.metadata = {
        ...updated.metadata,
        rejectionReason: reason,
        rejectedAt: new Date().toISOString(),
      };
      await this.candidateRepository.save(updated);
    }
    return updated;
  }

  /**
   * Marca un candidato como RECONCILIADO al vincularse con una transacción confirmada.
   */
  public async reconcileCandidate(candidateId: string): Promise<TransactionCandidate> {
    const candidate = await this.candidateRepository.findById(candidateId);
    if (!candidate) {
      throw new Error(`Candidato no encontrado: ${candidateId}`);
    }

    if (candidate.status === 'REJECTED') {
      throw new Error('No se puede reconciliar un candidato en estado REJECTED sin reactivarlo previamente.');
    }

    return this.candidateRepository.updateStatus(candidateId, 'RECONCILED');
  }

  /**
   * Reactiva un candidato previamente rechazado para nueva evaluación.
   */
  public async reopenCandidate(candidateId: string): Promise<TransactionCandidate> {
    const candidate = await this.candidateRepository.findById(candidateId);
    if (!candidate) {
      throw new Error(`Candidato no encontrado: ${candidateId}`);
    }

    return this.candidateRepository.updateStatus(candidateId, 'PENDING_REVIEW');
  }

  /**
   * Obtiene todos los candidatos pendientes de revisión.
   */
  public async getPendingReviewCandidates(): Promise<TransactionCandidate[]> {
    return this.candidateRepository.findAll({ status: 'PENDING_REVIEW' });
  }

  /**
   * Lista candidatos con filtros opcionales.
   */
  public async getCandidates(filter?: CandidateFilter): Promise<TransactionCandidate[]> {
    return this.candidateRepository.findAll(filter);
  }

  /**
   * Cuenta total de candidatos según filtro.
   */
  public async countCandidates(filter?: CandidateFilter): Promise<number> {
    return this.candidateRepository.count(filter);
  }

  /**
   * Marca un candidato como DUPLICATE cuando se detecta coincidencia con otra transacción o candidato (US-026).
   */
  public async markAsDuplicate(
    candidateId: string,
    reason?: string,
    duplicateInfo?: Record<string, unknown>,
  ): Promise<TransactionCandidate> {
    const candidate = await this.candidateRepository.findById(candidateId);
    if (!candidate) {
      throw new Error(`Candidato no encontrado: ${candidateId}`);
    }

    if (candidate.status === 'RECONCILED') {
      throw new Error('No se puede marcar como duplicado un candidato que ya ha sido formalmente reconciliado.');
    }

    const updated = await this.candidateRepository.updateStatus(candidateId, 'DUPLICATE');
    updated.metadata = {
      ...updated.metadata,
      duplicateReason: reason || 'Detectado como duplicado',
      duplicateDetectedAt: new Date().toISOString(),
      ...(duplicateInfo || {}),
    };
    await this.candidateRepository.save(updated);
    return updated;
  }

  /**
   * Determina si el candidato se encuentra en un estado terminal o cerrado.
   */
  public isFinalized(candidate: TransactionCandidate): boolean {
    return candidate.status === 'RECONCILED' || candidate.status === 'REJECTED' || candidate.status === 'DUPLICATE';
  }
}
