import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type {
  Transaction,
  CreateTransactionInput,
  UpdateTransactionInput,
} from '../../domain/models/Transaction';
import type { TransactionFilters, PaginationOptions } from '../../domain/repositories/ITransactionRepository';
import { SupabaseTransactionRepository } from '../../infrastructure/database/SupabaseTransactionRepository';
import { useAuth } from './AuthContext';

type TransactionsState = {
  /** Transacciones cargadas según los filtros activos. */
  transactions: Transaction[];
  isLoading: boolean;
  error: string | null;
  /** Carga (o recarga) transacciones con filtros y paginación opcionales. */
  loadTransactions: (filters?: TransactionFilters, pagination?: PaginationOptions) => Promise<void>;
  createTransaction: (input: CreateTransactionInput) => Promise<Transaction>;
  updateTransaction: (id: string, input: UpdateTransactionInput) => Promise<Transaction>;
  deleteTransaction: (id: string) => Promise<void>;
};

const TransactionsContext = createContext<TransactionsState | null>(null);

const repository = new SupabaseTransactionRepository();

/**
 * TransactionsProvider (US-008)
 *
 * Provee acceso a las transacciones del usuario autenticado.
 * No carga automáticamente en el arranque porque la cantidad de transacciones
 * puede ser grande — la carga es explícita vía `loadTransactions()`.
 *
 * Los contextos de nivel superior (Dashboard, TransactionList, etc.) son
 * responsables de llamar a `loadTransactions` con los filtros adecuados.
 */
export const TransactionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authState } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading]       = useState(false);
  const [error, setError]               = useState<string | null>(null);

  // ── Carga explícita ────────────────────────────────────────────────────────
  const loadTransactions = useCallback(
    async (filters?: TransactionFilters, pagination?: PaginationOptions) => {
      if (authState.status !== 'authenticated') return;

      setIsLoading(true);
      setError(null);
      try {
        const data = await repository.listTransactions(filters, pagination);
        setTransactions(data);
      } catch (err: any) {
        setError(err.message || 'Error loading transactions');
      } finally {
        setIsLoading(false);
      }
    },
    [authState.status],
  );

  // ── Mutaciones ────────────────────────────────────────────────────────────
  const createTransaction = async (input: CreateTransactionInput): Promise<Transaction> => {
    try {
      const created = await repository.createTransaction(input);
      // Inserta al inicio de la lista (más reciente primero)
      setTransactions((prev) => [created, ...prev]);
      return created;
    } catch (err: any) {
      setError(err.message || 'Error creating transaction');
      throw err;
    }
  };

  const updateTransaction = async (
    id: string,
    input: UpdateTransactionInput,
  ): Promise<Transaction> => {
    try {
      const updated = await repository.updateTransaction(id, input);
      setTransactions((prev) => prev.map((t) => (t.id === id ? updated : t)));
      return updated;
    } catch (err: any) {
      setError(err.message || 'Error updating transaction');
      throw err;
    }
  };

  const deleteTransaction = async (id: string): Promise<void> => {
    try {
      await repository.deleteTransaction(id);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
    } catch (err: any) {
      setError(err.message || 'Error deleting transaction');
      throw err;
    }
  };

  // ── Limpiar al cerrar sesión ───────────────────────────────────────────────
  useEffect(() => {
    if (authState.status === 'authenticated') return;
    // Defer setState to avoid calling it synchronously inside an effect body
    const timeout = setTimeout(() => {
      setTransactions([]);
      setError(null);
    }, 0);
    return () => clearTimeout(timeout);
  }, [authState.status]);

  return (
    <TransactionsContext.Provider
      value={{
        transactions,
        isLoading,
        error,
        loadTransactions,
        createTransaction,
        updateTransaction,
        deleteTransaction,
      }}
    >
      {children}
    </TransactionsContext.Provider>
  );
};

export const useTransactions = () => {
  const context = useContext(TransactionsContext);
  if (!context) {
    throw new Error('useTransactions must be used within a TransactionsProvider');
  }
  return context;
};
