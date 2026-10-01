/**
 * US-021: Repositorio en memoria de TransactionCandidate
 *
 * Empleado para almacenamiento local reactivo, pruebas unitarias y entornos
 * donde aún no se realiza la sincronización con base de datos remota.
 */

import type {
  CandidateFilter,
  ITransactionCandidateRepository,
} from '../../domain/repositories/ITransactionCandidateRepository';
import type { CandidateStatus, TransactionCandidate } from '../../domain/models/TransactionCandidate';

export class InMemoryTransactionCandidateRepository implements ITransactionCandidateRepository {
  private candidates: Map<string, TransactionCandidate> = new Map();

  public async save(candidate: TransactionCandidate): Promise<TransactionCandidate> {
    this.candidates.set(candidate.id, { ...candidate });
    return { ...candidate };
  }

  public async findById(id: string): Promise<TransactionCandidate | null> {
    const found = this.candidates.get(id);
    return found ? { ...found } : null;
  }

  public async findByRawEventId(rawEventId: string): Promise<TransactionCandidate | null> {
    for (const cand of this.candidates.values()) {
      if (cand.rawEventId === rawEventId) {
        return { ...cand };
      }
    }
    return null;
  }

  public async findAll(filter?: CandidateFilter): Promise<TransactionCandidate[]> {
    let result = Array.from(this.candidates.values());

    if (filter?.status) {
      result = result.filter((c) => c.status === filter.status);
    }
    if (filter?.provider) {
      result = result.filter(
        (c) => c.provider.toUpperCase() === filter.provider?.toUpperCase(),
      );
    }

    result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (filter?.limit && filter.limit > 0) {
      result = result.slice(0, filter.limit);
    }

    return result.map((c) => ({ ...c }));
  }

  public async updateStatus(id: string, status: CandidateStatus): Promise<TransactionCandidate> {
    const existing = this.candidates.get(id);
    if (!existing) {
      throw new Error(`Candidato no encontrado: ${id}`);
    }
    const updated: TransactionCandidate = {
      ...existing,
      status,
      updatedAt: new Date(),
    };
    this.candidates.set(id, updated);
    return { ...updated };
  }

  public clear(): void {
    this.candidates.clear();
  }
}
