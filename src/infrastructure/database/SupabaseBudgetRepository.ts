/**
 * SupabaseBudgetRepository — Repositorio Supabase de Presupuestos (US-046)
 *
 * Implementa IBudgetRepository interactuando directamente con la tabla
 * `budgets` en Supabase bajo RLS automático por user_id.
 */

import { supabase } from '../api/supabaseClient';
import type {
  IBudgetRepository,
  BudgetFilters,
} from '../../domain/repositories/IBudgetRepository';
import type { Budget } from '../../domain/models/Budget';

import {
  BudgetDatabaseMapper,
  type BudgetDatabaseRow,
} from './mappers/BudgetDatabaseMapper';

export { BudgetDatabaseMapper, type BudgetDatabaseRow };


export class SupabaseBudgetRepository implements IBudgetRepository {
  public async save(budget: Budget): Promise<void> {
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id || budget.userId;

    const row = this.mapToDatabase({
      ...budget,
      userId: currentUserId,
      updatedAt: new Date(),
    });

    const { error } = await supabase
      .from('budgets')
      .upsert(row, { onConflict: 'id' });

    if (error) throw error;
  }

  public async saveMany(budgets: Budget[]): Promise<void> {
    if (budgets.length === 0) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id;
    const now = new Date();

    const rows = budgets.map((b) =>
      this.mapToDatabase({
        ...b,
        userId: currentUserId || b.userId,
        updatedAt: now,
      })
    );

    const { error } = await supabase
      .from('budgets')
      .upsert(rows, { onConflict: 'id' });

    if (error) throw error;
  }

  public async findById(id: string): Promise<Budget | null> {
    const { data, error } = await supabase
      .from('budgets')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return this.mapToDomain(data as BudgetDatabaseRow);
  }

  public async findByUserAndMonth(userId: string, month: string): Promise<Budget[]> {
    const { data, error } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId)
      .eq('month', month)
      .eq('is_active', true)
      .order('percentage', { ascending: false });

    if (error) throw error;
    return (data || []).map((row) => this.mapToDomain(row as BudgetDatabaseRow));
  }

  public async findByCategoryAndMonth(
    userId: string,
    categoryId: string,
    month: string
  ): Promise<Budget | null> {
    const { data, error } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId)
      .eq('category_id', categoryId)
      .eq('month', month)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return this.mapToDomain(data as BudgetDatabaseRow);
  }

  public async findAll(filters: BudgetFilters = {}): Promise<Budget[]> {
    let query = supabase.from('budgets').select('*');

    if (filters.userId) {
      query = query.eq('user_id', filters.userId);
    }
    if (filters.month) {
      query = query.eq('month', filters.month);
    }
    if (filters.categoryId) {
      query = query.eq('category_id', filters.categoryId);
    }
    if (filters.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive);
    }

    const { data, error } = await query.order('percentage', { ascending: false });
    if (error) throw error;

    return (data || []).map((row) => this.mapToDomain(row as BudgetDatabaseRow));
  }

  public async delete(id: string): Promise<void> {
    const { error } = await supabase.from('budgets').delete().eq('id', id);
    if (error) throw error;
  }

  public async clear(): Promise<void> {
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id;
    if (!currentUserId) return;

    const { error } = await supabase
      .from('budgets')
      .delete()
      .eq('user_id', currentUserId);

    if (error) throw error;
  }

  public mapToDomain(row: BudgetDatabaseRow): Budget {
    return BudgetDatabaseMapper.mapToDomain(row);
  }

  public mapToDatabase(domain: Budget): BudgetDatabaseRow {
    return BudgetDatabaseMapper.mapToDatabase(domain);
  }

}
