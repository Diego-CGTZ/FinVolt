import { supabase } from '../api/supabaseClient';
import type { Account } from '../../domain/models/Account';
import type { IAccountRepository } from '../../domain/repositories/IAccountRepository';

export class SupabaseAccountRepository implements IAccountRepository {
  async getAccounts(): Promise<Account[]> {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(this.mapToDomain);
  }

  async createAccount(
    account: Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'userId'>,
  ): Promise<Account> {
    const { data, error } = await supabase
      .from('accounts')
      .insert([
        {
          name: account.name,
          type: account.type,
          currency: account.currency,
          initial_balance: account.initialBalance,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return this.mapToDomain(data);
  }

  async deleteAccount(id: string): Promise<void> {
    const { error } = await supabase.from('accounts').delete().eq('id', id);
    if (error) throw error;
  }

  private mapToDomain(row: any): Account {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      type: row.type,
      currency: row.currency,
      initialBalance: row.initial_balance,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
