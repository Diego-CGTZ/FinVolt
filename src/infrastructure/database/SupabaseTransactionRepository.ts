import { supabase } from '../api/supabaseClient';
import type {
  Transaction,
  CreateTransactionInput,
  UpdateTransactionInput,
} from '../../domain/models/Transaction';
import type {
  ITransactionRepository,
  TransactionFilters,
  PaginationOptions,
} from '../../domain/repositories/ITransactionRepository';

/**
 * SupabaseTransactionRepository (US-008)
 *
 * Implementación concreta de ITransactionRepository usando Supabase.
 * RLS en la tabla `transactions` garantiza que:
 *   - Toda operación está acotada automáticamente a auth.uid().
 *   - No se necesitan filtros manuales por user_id en las queries.
 */
export class SupabaseTransactionRepository implements ITransactionRepository {
  // ── Queries ────────────────────────────────────────────────────────────────

  async listTransactions(
    filters: TransactionFilters = {},
    pagination: PaginationOptions = {},
  ): Promise<Transaction[]> {
    const limit  = pagination.limit  ?? 50;
    const offset = pagination.offset ?? 0;

    let query = supabase
      .from('transactions')
      .select('*')
      .order('occurred_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.accountId)  query = query.eq('account_id', filters.accountId);
    if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
    if (filters.type)       query = query.eq('type', filters.type);
    if (filters.status)     query = query.eq('status', filters.status);
    if (filters.from)       query = query.gte('occurred_at', filters.from.toISOString());
    if (filters.to)         query = query.lte('occurred_at', filters.to.toISOString());
    if (filters.search) {
      // Búsqueda de texto libre en merchant o description
      query = query.or(
        `merchant.ilike.%${filters.search}%,description.ilike.%${filters.search}%`,
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(this.mapToDomain);
  }

  async getTransaction(id: string): Promise<Transaction> {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return this.mapToDomain(data);
  }

  // ── Mutaciones ─────────────────────────────────────────────────────────────

  async createTransaction(input: CreateTransactionInput): Promise<Transaction> {
    const row: Record<string, unknown> = {
      account_id:           input.accountId,
      type:                 input.type,
      amount_minor:         input.amountMinor,
      currency:             input.currency,
      occurred_at:          input.occurredAt.toISOString(),
      posted_at:            input.postedAt?.toISOString() ?? null,
      merchant_raw:         input.merchantRaw   ?? null,
      merchant:             input.merchant      ?? null,
      description:          input.description   ?? null,
      category_id:          input.categoryId    ?? null,
      source:               input.source        ?? 'MANUAL',
      source_event_id:      input.sourceEventId ?? null,
      status:               input.status        ?? 'CONFIRMED',
      confidence_score:     input.confidenceScore ?? null,
      fingerprint:          input.fingerprint    ?? null,
      linked_transaction_id: input.linkedTransactionId ?? null,
    };

    const { data, error } = await supabase
      .from('transactions')
      .insert([row])
      .select()
      .single();

    if (error) throw error;
    return this.mapToDomain(data);
  }

  async updateTransaction(id: string, input: UpdateTransactionInput): Promise<Transaction> {
    const patch: Record<string, unknown> = {};

    if (input.type         !== undefined) patch.type              = input.type;
    if (input.amountMinor  !== undefined) patch.amount_minor      = input.amountMinor;
    if (input.currency     !== undefined) patch.currency          = input.currency;
    if (input.occurredAt   !== undefined) patch.occurred_at       = input.occurredAt.toISOString();
    if (input.postedAt     !== undefined) patch.posted_at         = input.postedAt?.toISOString() ?? null;
    if (input.merchantRaw  !== undefined) patch.merchant_raw      = input.merchantRaw;
    if (input.merchant     !== undefined) patch.merchant          = input.merchant;
    if (input.description  !== undefined) patch.description       = input.description;
    if (input.categoryId   !== undefined) patch.category_id       = input.categoryId;
    if (input.status       !== undefined) patch.status            = input.status;
    if (input.confidenceScore !== undefined) patch.confidence_score = input.confidenceScore;
    if (input.fingerprint  !== undefined) patch.fingerprint       = input.fingerprint;
    if (input.linkedTransactionId !== undefined) {
      patch.linked_transaction_id = input.linkedTransactionId;
    }

    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('transactions')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return this.mapToDomain(data);
  }

  async deleteTransaction(id: string): Promise<void> {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  async findByFingerprint(fingerprint: string): Promise<Transaction | null> {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('fingerprint', fingerprint)
      .maybeSingle();

    if (error) throw error;
    return data ? this.mapToDomain(data) : null;
  }

  // ── Mapper ─────────────────────────────────────────────────────────────────

  private mapToDomain(row: any): Transaction {
    return {
      id:                   row.id,
      userId:               row.user_id,
      accountId:            row.account_id,
      type:                 row.type,
      amountMinor:          row.amount_minor,
      currency:             row.currency,
      occurredAt:           new Date(row.occurred_at),
      postedAt:             row.posted_at ? new Date(row.posted_at) : null,
      merchantRaw:          row.merchant_raw ?? null,
      merchant:             row.merchant    ?? null,
      description:          row.description ?? null,
      categoryId:           row.category_id ?? null,
      source:               row.source,
      sourceEventId:        row.source_event_id ?? null,
      status:               row.status,
      confidenceScore:      row.confidence_score ?? null,
      fingerprint:          row.fingerprint ?? null,
      linkedTransactionId:  row.linked_transaction_id ?? null,
      createdAt:            new Date(row.created_at),
      updatedAt:            new Date(row.updated_at),
    };
  }
}
