/**
 * AsyncStorageBudgetRepository — Repositorio Local de Presupuestos (US-046)
 *
 * Implementa IBudgetRepository utilizando AsyncStorage con respaldo
 * en memoria para operaciones reactivas rápidas y entornos de pruebas sin dependencias nativas.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  IBudgetRepository,
  BudgetFilters,
} from '../../domain/repositories/IBudgetRepository';
import type { Budget } from '../../domain/models/Budget';

interface StoredBudget extends Omit<Budget, 'createdAt' | 'updatedAt'> {
  createdAt: string;
  updatedAt: string;
}

export class AsyncStorageBudgetRepository implements IBudgetRepository {
  private static readonly STORAGE_KEY = '@finvolt_budgets';
  private inMemoryCache: Map<string, Budget> = new Map();
  private isLoaded: boolean = false;

  constructor() {
    this.loadFromStorage();
  }

  public async save(budget: Budget): Promise<void> {
    await this.ensureLoaded();
    const updated: Budget = {
      ...budget,
      updatedAt: new Date(),
    };
    this.inMemoryCache.set(updated.id, updated);
    await this.persistToStorage();
  }

  public async saveMany(budgets: Budget[]): Promise<void> {
    await this.ensureLoaded();
    const now = new Date();
    for (const item of budgets) {
      this.inMemoryCache.set(item.id, {
        ...item,
        updatedAt: now,
      });
    }
    await this.persistToStorage();
  }

  public async findById(id: string): Promise<Budget | null> {
    await this.ensureLoaded();
    return this.inMemoryCache.get(id) || null;
  }

  public async findByUserAndMonth(userId: string, month: string): Promise<Budget[]> {
    await this.ensureLoaded();
    const result: Budget[] = [];
    for (const item of this.inMemoryCache.values()) {
      if (item.userId === userId && item.month === month && item.isActive) {
        result.push(item);
      }
    }
    return result.sort((a, b) => b.percentage - a.percentage);
  }

  public async findByCategoryAndMonth(
    userId: string,
    categoryId: string,
    month: string
  ): Promise<Budget | null> {
    await this.ensureLoaded();
    for (const item of this.inMemoryCache.values()) {
      if (
        item.userId === userId &&
        item.categoryId === categoryId &&
        item.month === month &&
        item.isActive
      ) {
        return item;
      }
    }
    return null;
  }

  public async findAll(filters: BudgetFilters = {}): Promise<Budget[]> {
    await this.ensureLoaded();
    let result = Array.from(this.inMemoryCache.values());

    if (filters.userId) {
      result = result.filter((item) => item.userId === filters.userId);
    }
    if (filters.month) {
      result = result.filter((item) => item.month === filters.month);
    }
    if (filters.categoryId) {
      result = result.filter((item) => item.categoryId === filters.categoryId);
    }
    if (filters.isActive !== undefined) {
      result = result.filter((item) => item.isActive === filters.isActive);
    }

    return result.sort((a, b) => b.percentage - a.percentage);
  }

  public async delete(id: string): Promise<void> {
    await this.ensureLoaded();
    this.inMemoryCache.delete(id);
    await this.persistToStorage();
  }

  public async clear(): Promise<void> {
    this.inMemoryCache.clear();
    try {
      await AsyncStorage.removeItem(AsyncStorageBudgetRepository.STORAGE_KEY);
    } catch {
      // Ignorar errores de borrado de storage en tests
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.isLoaded) {
      await this.loadFromStorage();
    }
  }

  private async loadFromStorage(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(AsyncStorageBudgetRepository.STORAGE_KEY);
      if (raw) {
        const parsed: StoredBudget[] = JSON.parse(raw);
        for (const item of parsed) {
          this.inMemoryCache.set(item.id, {
            ...item,
            createdAt: new Date(item.createdAt),
            updatedAt: new Date(item.updatedAt),
          });
        }
      }
    } catch {
      // Si falla AsyncStorage en entorno sin polyfills, se continúa en memoria
    } finally {
      this.isLoaded = true;
    }
  }

  private async persistToStorage(): Promise<void> {
    try {
      const items = Array.from(this.inMemoryCache.values()).map((item): StoredBudget => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      }));
      await AsyncStorage.setItem(
        AsyncStorageBudgetRepository.STORAGE_KEY,
        JSON.stringify(items)
      );
    } catch {
      // Fallback silencioso si AsyncStorage no está disponible
    }
  }
}
