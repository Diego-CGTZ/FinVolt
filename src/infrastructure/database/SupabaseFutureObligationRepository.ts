/**
 * SupabaseFutureObligationRepository — Repositorio Supabase de Obligaciones Futuras (US-044)
 *
 * Implementa IFutureObligationRepository interactuando directamente con la tabla
 * `future_obligations` en Supabase bajo RLS automático por user_id.
 */

import { supabase } from '../api/supabaseClient';
import type {
  IFutureObligationRepository,
  FutureObligationFilters,
} from '../../domain/repositories/IFutureObligationRepository';
import type { FutureObligation } from '../../domain/models/FutureObligation';

export class SupabaseFutureObligationRepository implements IFutureObligationRepository {
  public async save(obligation: FutureObligation): Promise<void> {
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id || obligation.userId;

    const row = this.mapToDatabase({
      ...obligation,
      userId: currentUserId,
      updatedAt: new Date(),
    });

    const { error } = await supabase
      .from('future_obligations')
      .upsert(row, { onConflict: 'id' });

    if (error) throw error;
  }

  public async saveMany(obligations: FutureObligation[]): Promise<void> {
    if (obligations.length === 0) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id;
    const now = new Date();

    const rows = obligations.map((ob) =>
      this.mapToDatabase({
        ...ob,
        userId: currentUserId || ob.userId,
        updatedAt: now,
      }),
    );

    const { error } = await supabase
      .from('future_obligations')
      .upsert(rows, { onConflict: 'id' });

    if (error) throw error;
  }

  public async findById(id: string): Promise<FutureObligation | null> {
    const { data, error } = await supabase
      .from('future_obligations')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data ? this.mapToDomain(data) : null;
  }

  public async findByUserId(userId: string): Promise<FutureObligation[]> {
    const { data, error } = await supabase
      .from('future_obligations')
      .select('*')
      .eq('user_id', userId)
      .order('next_due_date', { ascending: true });

    if (error) throw error;
    return (data || []).map((row) => this.mapToDomain(row));
  }

  public async findByAccountId(accountId: string): Promise<FutureObligation[]> {
    const { data, error } = await supabase
      .from('future_obligations')
      .select('*')
      .eq('account_id', accountId)
      .order('next_due_date', { ascending: true });

    if (error) throw error;
    return (data || []).map((row) => this.mapToDomain(row));
  }

  public async findByCategoryId(categoryId: string): Promise<FutureObligation[]> {
    const { data, error } = await supabase
      .from('future_obligations')
      .select('*')
      .eq('category_id', categoryId)
      .order('next_due_date', { ascending: true });

    if (error) throw error;
    return (data || []).map((row) => this.mapToDomain(row));
  }

  public async findUpcoming(userId: string, untilDate: Date): Promise<FutureObligation[]> {
    const { data, error } = await supabase
      .from('future_obligations')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE')
      .lte('next_due_date', untilDate.toISOString())
      .order('next_due_date', { ascending: true });

    if (error) throw error;
    return (data || []).map((row) => this.mapToDomain(row));
  }

  public async findAll(filters?: FutureObligationFilters): Promise<FutureObligation[]> {
    let query = supabase.from('future_obligations').select('*');

    if (filters) {
      if (filters.userId) query = query.eq('user_id', filters.userId);
      if (filters.accountId) query = query.eq('account_id', filters.accountId);
      if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
      if (filters.direction) query = query.eq('direction', filters.direction);
      if (filters.obligationType) query = query.eq('obligation_type', filters.obligationType);
      if (filters.certainty) query = query.eq('certainty', filters.certainty);
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.dueBefore) query = query.lte('next_due_date', filters.dueBefore.toISOString());
      if (filters.dueAfter) query = query.gte('next_due_date', filters.dueAfter.toISOString());
    }

    query = query.order('next_due_date', { ascending: true });

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((row) => this.mapToDomain(row));
  }

  public async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('future_obligations')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  public async clear(): Promise<void> {
    // Para pruebas
    const { error } = await supabase
      .from('future_obligations')
      .delete()
      .not('id', 'is', null);

    if (error) throw error;
  }

  private mapToDomain(row: any): FutureObligation {
    return {
      id: row.id,
      userId: row.user_id,
      accountId: row.account_id ?? null,
      categoryId: row.category_id ?? null,
      recurringTransactionId: row.recurring_transaction_id ?? null,
      name: row.name,
      description: row.description ?? null,
      direction: row.direction,
      obligationType: row.obligation_type,
      certainty: row.certainty,
      amountMinor: Number(row.amount_minor),
      currency: row.currency,
      periodicity: row.periodicity,
      intervalDays: row.interval_days ? Number(row.interval_days) : null,
      nextDueDate: new Date(row.next_due_date),
      anchorDay: Number(row.anchor_day || 1),
      endDate: row.end_date ? new Date(row.end_date) : null,
      lastFulfilledAt: row.last_fulfilled_at ? new Date(row.last_fulfilled_at) : null,
      status: row.status,
      metadata: row.metadata || {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapToDatabase(ob: FutureObligation): Record<string, unknown> {
    return {
      id: ob.id,
      user_id: ob.userId,
      account_id: ob.accountId,
      category_id: ob.categoryId,
      recurring_transaction_id: ob.recurringTransactionId,
      name: ob.name,
      description: ob.description,
      direction: ob.direction,
      obligation_type: ob.obligationType,
      certainty: ob.certainty,
      amount_minor: ob.amountMinor,
      currency: ob.currency,
      periodicity: ob.periodicity,
      interval_days: ob.intervalDays,
      next_due_date: ob.nextDueDate.toISOString(),
      anchor_day: ob.anchorDay,
      end_date: ob.endDate ? ob.endDate.toISOString() : null,
      last_fulfilled_at: ob.lastFulfilledAt ? ob.lastFulfilledAt.toISOString() : null,
      status: ob.status,
      metadata: ob.metadata || {},
      created_at: ob.createdAt.toISOString(),
      updated_at: ob.updatedAt.toISOString(),
    };
  }
}
