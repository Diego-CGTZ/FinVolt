/**
 * US-021 / US-023: Contrato del repositorio de TransactionCandidate
 */

import type { CandidateStatus, TransactionCandidate } from '../models/TransactionCandidate';

export interface CandidateFilter {
  status?: CandidateStatus;
  provider?: string;
  limit?: number;
}

export interface ITransactionCandidateRepository {
  /**
   * Guarda un candidato generado por el pipeline de ingestión.
   */
  save(candidate: TransactionCandidate): Promise<TransactionCandidate>;

  /**
   * Obtiene un candidato por su ID.
   */
  findById(id: string): Promise<TransactionCandidate | null>;

  /**
   * Obtiene el candidato asociado a un RawEvent específico.
   */
  findByRawEventId(rawEventId: string): Promise<TransactionCandidate | null>;

  /**
   * Lista candidatos según filtros opcionales.
   */
  findAll(filter?: CandidateFilter): Promise<TransactionCandidate[]>;

  /**
   * Actualiza el estado de un candidato (PENDING_REVIEW, AUTO_CONFIRMED, REJECTED, RECONCILED).
   */
  updateStatus(id: string, status: CandidateStatus): Promise<TransactionCandidate>;
}
