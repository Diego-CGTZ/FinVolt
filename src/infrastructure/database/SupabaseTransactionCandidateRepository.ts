import { supabase } from '../api/supabaseClient';
import type {
  CandidateFilter,
  ITransactionCandidateRepository,
} from '../../domain/repositories/ITransactionCandidateRepository';
import type {
  CandidateStatus,
  TransactionCandidate,
} from '../../domain/models/TransactionCandidate';

interface DatabaseCandidateRow {
  id: string;
  user_id: string;
  raw_event_id: string;
  source: string;
  provider: string;
  amount_minor: number | string;
  currency: string;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  merchant_raw: string | null;
  merchant: string | null;
  occurred_at: string;
  confidence_score: number;
  account_hint: Record<string, unknown> | null;
  status: CandidateStatus;
  fingerprint?: string | null;
  raw_payload: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/**
 * Implementación de ITransactionCandidateRepository para persistencia en Supabase (US-023).
 */
export class SupabaseTransactionCandidateRepository implements ITransactionCandidateRepository {
  async save(candidate: TransactionCandidate): Promise<TransactionCandidate> {
    const payload = {
      id: candidate.id.startsWith('cand-') || candidate.id.startsWith('local-') ? undefined : candidate.id,
      user_id: candidate.userId,
      raw_event_id: candidate.rawEventId,
      source: candidate.source,
      provider: candidate.provider,
      amount_minor: candidate.amountMinor,
      currency: candidate.currency,
      type: candidate.type,
      merchant_raw: candidate.merchantRaw,
      merchant: candidate.merchant,
      occurred_at: candidate.occurredAt.toISOString(),
      confidence_score: candidate.confidenceScore,
      account_hint: candidate.accountHint || {},
      status: candidate.status,
      fingerprint: candidate.fingerprint ?? null,
      raw_payload: candidate.rawPayload || {},
      metadata: candidate.metadata || {},
    };

    const { data, error } = await supabase
      .from('transaction_candidates')
      .upsert(payload)
      .select()
      .single();

    if (error) {
      throw new Error(`Error al persistir TransactionCandidate en Supabase: ${error.message}`);
    }

    return this.mapToDomain(data as DatabaseCandidateRow);
  }

  async findById(id: string): Promise<TransactionCandidate | null> {
    const { data, error } = await supabase
      .from('transaction_candidates')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(`Error al consultar TransactionCandidate por ID: ${error.message}`);
    }

    return data ? this.mapToDomain(data as DatabaseCandidateRow) : null;
  }

  async findByRawEventId(rawEventId: string): Promise<TransactionCandidate | null> {
    const { data, error } = await supabase
      .from('transaction_candidates')
      .select('*')
      .eq('raw_event_id', rawEventId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Error al consultar TransactionCandidate por rawEventId: ${error.message}`);
    }

    return data ? this.mapToDomain(data as DatabaseCandidateRow) : null;
  }

  async findByFingerprint(fingerprint: string): Promise<TransactionCandidate | null> {
    const { data, error } = await supabase
      .from('transaction_candidates')
      .select('*')
      .eq('fingerprint', fingerprint)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Error al consultar TransactionCandidate por fingerprint: ${error.message}`);
    }

    return data ? this.mapToDomain(data as DatabaseCandidateRow) : null;
  }

  async findAll(filter?: CandidateFilter): Promise<TransactionCandidate[]> {
    let query = supabase
      .from('transaction_candidates')
      .select('*')
      .order('occurred_at', { ascending: false });

    if (filter?.userId) {
      query = query.eq('user_id', filter.userId);
    }
    if (filter?.status) {
      query = query.eq('status', filter.status);
    }
    if (filter?.fingerprint) {
      query = query.eq('fingerprint', filter.fingerprint);
    }
    if (filter?.provider) {
      query = query.ilike('provider', filter.provider);
    }
    if (filter?.source) {
      query = query.eq('source', filter.source);
    }
    if (filter?.minConfidence !== undefined) {
      query = query.gte('confidence_score', filter.minConfidence);
    }
    if (filter?.fromDate) {
      query = query.gte('occurred_at', filter.fromDate.toISOString());
    }
    if (filter?.toDate) {
      query = query.lte('occurred_at', filter.toDate.toISOString());
    }
    if (filter?.offset && filter.offset > 0) {
      query = query.range(filter.offset, filter.offset + (filter.limit || 20) - 1);
    } else if (filter?.limit && filter.limit > 0) {
      query = query.limit(filter.limit);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Error al consultar TransactionCandidates: ${error.message}`);
    }

    return (data || []).map((row) => this.mapToDomain(row as DatabaseCandidateRow));
  }

  async count(filter?: CandidateFilter): Promise<number> {
    let query = supabase
      .from('transaction_candidates')
      .select('id', { count: 'exact', head: true });

    if (filter?.userId) {
      query = query.eq('user_id', filter.userId);
    }
    if (filter?.status) {
      query = query.eq('status', filter.status);
    }
    if (filter?.provider) {
      query = query.ilike('provider', filter.provider);
    }
    if (filter?.source) {
      query = query.eq('source', filter.source);
    }
    if (filter?.minConfidence !== undefined) {
      query = query.gte('confidence_score', filter.minConfidence);
    }

    const { count, error } = await query;
    if (error) {
      throw new Error(`Error al contar TransactionCandidates: ${error.message}`);
    }

    return count ?? 0;
  }

  async updateStatus(id: string, status: CandidateStatus): Promise<TransactionCandidate> {
    const { data, error } = await supabase
      .from('transaction_candidates')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Error al actualizar estado del candidato: ${error.message}`);
    }

    return this.mapToDomain(data as DatabaseCandidateRow);
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('transaction_candidates')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Error al eliminar TransactionCandidate: ${error.message}`);
    }
  }

  private mapToDomain(row: DatabaseCandidateRow): TransactionCandidate {
    const amountMinor = Number(row.amount_minor);
    return {
      id: row.id,
      userId: row.user_id,
      rawEventId: row.raw_event_id,
      source: row.source as TransactionCandidate['source'],
      provider: row.provider,
      amountMinor,
      amount: amountMinor / 100,
      currency: row.currency || 'MXN',
      type: row.type,
      merchantRaw: row.merchant_raw,
      merchant: row.merchant,
      occurredAt: new Date(row.occurred_at),
      confidenceScore: row.confidence_score,
      accountHint: row.account_hint ? (row.account_hint as TransactionCandidate['accountHint']) : undefined,
      status: row.status,
      fingerprint: row.fingerprint ?? null,
      rawPayload: row.raw_payload || {},
      metadata: row.metadata || {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
