/**
 * AsyncStorageRecurringTransactionRepository — Repositorio Local de Transacciones Recurrentes (US-043)
 *
 * Implementa IRecurringTransactionRepository utilizando AsyncStorage con respaldo
 * en memoria para pruebas y entornos sin almacenamiento nativo.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  IRecurringTransactionRepository,
  RecurringTransactionFilters,
} from '../../domain/repositories/IRecurringTransactionRepository';
import type {
  RecurringPatternType,
  RecurringTransaction,
} from '../../domain/models/RecurringTransaction';

interface StoredRecurringTransaction extends Omit<
  RecurringTransaction,
  'firstOccurrence' | 'lastOccurrence' | 'nextExpectedOccurrence' | 'createdAt' | 'updatedAt'
> {
  firstOccurrence: string;
  lastOccurrence: string;
  nextExpectedOccurrence: string;
  createdAt: string;
  updatedAt: string;
}

export class AsyncStorageRecurringTransactionRepository
  implements IRecurringTransactionRepository
{
  private static readonly STORAGE_KEY = '@finvolt_recurring_transactions';
  private inMemoryCache: Map<string, RecurringTransaction> = new Map();
  private isLoaded: boolean = false;

  constructor() {
    this.loadFromStorage();
  }

  public async save(recurring: RecurringTransaction): Promise<void> {
    await this.ensureLoaded();
    const updated: RecurringTransaction = {
      ...recurring,
      updatedAt: new Date(),
    };
    this.inMemoryCache.set(updated.id, updated);
    await this.persistToStorage();
  }

  public async saveMany(recurringList: RecurringTransaction[]): Promise<void> {
    await this.ensureLoaded();
    const now = new Date();
    for (const item of recurringList) {
      this.inMemoryCache.set(item.id, {
        ...item,
        updatedAt: now,
      });
    }
    await this.persistToStorage();
  }

  public async findById(id: string): Promise<RecurringTransaction | null> {
    await this.ensureLoaded();
    const item = this.inMemoryCache.get(id);
    return item ? this.clone(item) : null;
  }

  public async findByUserId(userId: string): Promise<RecurringTransaction[]> {
    await this.ensureLoaded();
    return Array.from(this.inMemoryCache.values())
      .filter((item) => item.userId === userId)
      .map((item) => this.clone(item));
  }

  public async findByAccountId(accountId: string): Promise<RecurringTransaction[]> {
    await this.ensureLoaded();
    return Array.from(this.inMemoryCache.values())
      .filter((item) => item.accountId === accountId)
      .map((item) => this.clone(item));
  }

  public async findByPatternType(
    userId: string,
    patternType: RecurringPatternType,
  ): Promise<RecurringTransaction[]> {
    await this.ensureLoaded();
    return Array.from(this.inMemoryCache.values())
      .filter((item) => item.userId === userId && item.patternType === patternType)
      .map((item) => this.clone(item));
  }

  public async findAll(filters?: RecurringTransactionFilters): Promise<RecurringTransaction[]> {
    await this.ensureLoaded();
    let results = Array.from(this.inMemoryCache.values());

    if (filters) {
      if (filters.userId) {
        results = results.filter((item) => item.userId === filters.userId);
      }
      if (filters.accountId) {
        results = results.filter((item) => item.accountId === filters.accountId);
      }
      if (filters.patternType) {
        results = results.filter((item) => item.patternType === filters.patternType);
      }
      if (filters.status) {
        results = results.filter((item) => item.status === filters.status);
      }
    }

    return results.map((item) => this.clone(item));
  }

  public async delete(id: string): Promise<void> {
    await this.ensureLoaded();
    const existed = this.inMemoryCache.delete(id);
    if (existed) {
      await this.persistToStorage();
    }
  }

  public async clear(): Promise<void> {
    this.inMemoryCache.clear();
    try {
      if (AsyncStorage?.removeItem) {
        await AsyncStorage.removeItem(AsyncStorageRecurringTransactionRepository.STORAGE_KEY);
      }
    } catch {
      // Ignorar en entornos de prueba sin mock de AsyncStorage
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.isLoaded) {
      await this.loadFromStorage();
    }
  }

  private async loadFromStorage(): Promise<void> {
    try {
      if (!AsyncStorage?.getItem) {
        this.isLoaded = true;
        return;
      }
      const raw = await AsyncStorage.getItem(
        AsyncStorageRecurringTransactionRepository.STORAGE_KEY,
      );
      if (raw) {
        const parsed: StoredRecurringTransaction[] = JSON.parse(raw);
        for (const item of parsed) {
          this.inMemoryCache.set(item.id, this.deserialize(item));
        }
      }
    } catch {
      // Continuar con caché en memoria
    } finally {
      this.isLoaded = true;
    }
  }

  private async persistToStorage(): Promise<void> {
    try {
      if (!AsyncStorage?.setItem) return;
      const serializable: StoredRecurringTransaction[] = Array.from(
        this.inMemoryCache.values(),
      ).map((item) => this.serialize(item));

      await AsyncStorage.setItem(
        AsyncStorageRecurringTransactionRepository.STORAGE_KEY,
        JSON.stringify(serializable),
      );
    } catch {
      // Fallback silencioso en memoria
    }
  }

  private serialize(item: RecurringTransaction): StoredRecurringTransaction {
    return {
      ...item,
      firstOccurrence: item.firstOccurrence.toISOString(),
      lastOccurrence: item.lastOccurrence.toISOString(),
      nextExpectedOccurrence: item.nextExpectedOccurrence.toISOString(),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private deserialize(item: StoredRecurringTransaction): RecurringTransaction {
    return {
      ...item,
      firstOccurrence: new Date(item.firstOccurrence),
      lastOccurrence: new Date(item.lastOccurrence),
      nextExpectedOccurrence: new Date(item.nextExpectedOccurrence),
      createdAt: new Date(item.createdAt),
      updatedAt: new Date(item.updatedAt),
    };
  }

  private clone(item: RecurringTransaction): RecurringTransaction {
    return {
      ...item,
      firstOccurrence: new Date(item.firstOccurrence),
      lastOccurrence: new Date(item.lastOccurrence),
      nextExpectedOccurrence: new Date(item.nextExpectedOccurrence),
      createdAt: new Date(item.createdAt),
      updatedAt: new Date(item.updatedAt),
      transactionIds: [...item.transactionIds],
    };
  }
}

export const defaultRecurringTransactionRepository =
  new AsyncStorageRecurringTransactionRepository();
