import { supabase } from '../api/supabaseClient';
import type { Account } from '../../domain/models/Account';
import type { IAccountRepository } from '../../domain/repositories/IAccountRepository';
import { AccountCreditStorage } from '../storage/AccountCreditStorage';

export class SupabaseAccountRepository implements IAccountRepository {
  async getAccounts(): Promise<Account[]> {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const creditMetadata = await AccountCreditStorage.getAll();

    return (data || []).map((row) => {
      const meta = creditMetadata[row.id] || {};
      return {
        ...this.mapToDomain(row),
        creditLimit: meta.creditLimit ?? (row.credit_limit ? Number(row.credit_limit) : undefined),
        cutoffDay: meta.cutoffDay ?? (row.cutoff_day ? Number(row.cutoff_day) : undefined),
        paymentDueDay: meta.paymentDueDay ?? (row.payment_due_day ? Number(row.payment_due_day) : undefined),
      };
    });
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

    if (
      account.creditLimit !== undefined ||
      account.cutoffDay !== undefined ||
      account.paymentDueDay !== undefined
    ) {
      await AccountCreditStorage.set(data.id, {
        creditLimit: account.creditLimit,
        cutoffDay: account.cutoffDay,
        paymentDueDay: account.paymentDueDay,
      });
    }

    return {
      ...this.mapToDomain(data),
      creditLimit: account.creditLimit,
      cutoffDay: account.cutoffDay,
      paymentDueDay: account.paymentDueDay,
    };
  }

  async updateAccount(
    id: string,
    updates: Partial<Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'userId'>>,
  ): Promise<Account> {
    const dbPayload: Record<string, unknown> = {};
    if (updates.name !== undefined) dbPayload.name = updates.name;
    if (updates.initialBalance !== undefined) dbPayload.initial_balance = updates.initialBalance;
    if (updates.currency !== undefined) dbPayload.currency = updates.currency;
    if (updates.type !== undefined) dbPayload.type = updates.type;

    const { data, error } = await supabase
      .from('accounts')
      .update(dbPayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (
      updates.creditLimit !== undefined ||
      updates.cutoffDay !== undefined ||
      updates.paymentDueDay !== undefined
    ) {
      await AccountCreditStorage.set(id, {
        creditLimit: updates.creditLimit,
        cutoffDay: updates.cutoffDay,
        paymentDueDay: updates.paymentDueDay,
      });
    }

    const savedMeta = await AccountCreditStorage.get(id);

    return {
      ...this.mapToDomain(data),
      creditLimit: updates.creditLimit ?? savedMeta?.creditLimit,
      cutoffDay: updates.cutoffDay ?? savedMeta?.cutoffDay,
      paymentDueDay: updates.paymentDueDay ?? savedMeta?.paymentDueDay,
    };
  }

  async deleteAccount(id: string): Promise<void> {
    const { error } = await supabase.from('accounts').delete().eq('id', id);
    if (error) throw error;
    await AccountCreditStorage.remove(id);
  }

  private mapToDomain(row: any): Account {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      type: row.type,
      currency: row.currency,
      initialBalance: Number(row.initial_balance) || 0,
      creditLimit: row.credit_limit ? Number(row.credit_limit) : undefined,
      cutoffDay: row.cutoff_day ? Number(row.cutoff_day) : undefined,
      paymentDueDay: row.payment_due_day ? Number(row.payment_due_day) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
