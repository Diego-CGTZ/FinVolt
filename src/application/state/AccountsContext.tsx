import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Account } from '../../domain/models/Account';
import { SupabaseAccountRepository } from '../../infrastructure/database/SupabaseAccountRepository';
import { useAuth } from './AuthContext';

type AccountsState = {
  accounts: Account[];
  isLoading: boolean;
  error: string | null;
  loadAccounts: () => Promise<void>;
  createAccount: (
    account: Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'userId'>,
  ) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
};

const AccountsContext = createContext<AccountsState | null>(null);

export const AccountsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // We instantiate the repository directly here for simplicity,
  // though it could be injected via a DI container.
  const repository = new SupabaseAccountRepository();

  const loadAccounts = useCallback(async () => {
    if (session.status !== 'authenticated') return;

    setIsLoading(true);
    setError(null);
    try {
      const data = await repository.getAccounts();
      setAccounts(data);
    } catch (err: any) {
      setError(err.message || 'Error loading accounts');
    } finally {
      setIsLoading(false);
    }
  }, [session.status]);

  const createAccount = async (
    accountData: Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'userId'>,
  ) => {
    try {
      const newAccount = await repository.createAccount(accountData);
      setAccounts((prev) => [newAccount, ...prev]);
    } catch (err: any) {
      setError(err.message || 'Error creating account');
      throw err;
    }
  };

  const deleteAccount = async (id: string) => {
    try {
      await repository.deleteAccount(id);
      setAccounts((prev) => prev.filter((acc) => acc.id !== id));
    } catch (err: any) {
      setError(err.message || 'Error deleting account');
      throw err;
    }
  };

  // Load accounts automatically when authenticated
  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  return (
    <AccountsContext.Provider
      value={{ accounts, isLoading, error, loadAccounts, createAccount, deleteAccount }}
    >
      {children}
    </AccountsContext.Provider>
  );
};

export const useAccounts = () => {
  const context = useContext(AccountsContext);
  if (!context) {
    throw new Error('useAccounts must be used within an AccountsProvider');
  }
  return context;
};
