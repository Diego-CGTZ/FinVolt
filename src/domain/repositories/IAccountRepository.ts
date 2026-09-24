import type { Account } from '../models/Account';

export interface IAccountRepository {
  /**
   * Obtiene todas las cuentas del usuario autenticado actual.
   * Supabase RLS asegura que no se traigan cuentas de otros.
   */
  getAccounts(): Promise<Account[]>;

  /**
   * Crea una nueva cuenta financiera.
   */
  createAccount(
    account: Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'userId'>,
  ): Promise<Account>;

  /**
   * Elimina una cuenta financiera.
   */
  deleteAccount(id: string): Promise<void>;
}
