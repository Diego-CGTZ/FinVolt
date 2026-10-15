/**
 * AsyncStorageFutureObligationRepository — Repositorio Local de Obligaciones Futuras (US-044)
 *
 * Implementa IFutureObligationRepository utilizando AsyncStorage con respaldo
 * en memoria para operaciones reactivas rápidas y entornos de pruebas sin dependencias nativas.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  IFutureObligationRepository,
  FutureObligationFilters,
} from '../../domain/repositories/IFutureObligationRepository';
import type { FutureObligation } from '../../domain/models/FutureObligation';

interface StoredFutureObligation extends Omit<
  FutureObligation,
  'nextDueDate' | 'endDate' | 'lastFulfilledAt' | 'createdAt' | 'updatedAt'
> {
  nextDueDate: string;
  endDate: string | null;
  lastFulfilledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export class AsyncStorageFutureObligationRepository
  implements IFutureObligationRepository
{
  private static readonly STORAGE_KEY = '@finvolt_future_obligations';
  private inMemoryCache: Map<string, FutureObligation> = new Map();
  private isLoaded: boolean = false;

  constructor() {
    this.loadFromStorage();
  }

  public async save(obligation: FutureObligation): Promise<void> {
    await this.ensureLoaded();
    const updated: FutureObligation = {
      ...obligation,
      updatedAt: new Date(),
    };
    this.inMemoryCache.set(updated.id, updated);
    await this.persistToStorage();
  }

  public async saveMany(obligations: FutureObligation[]): Promise<void> {
    await this.ensureLoaded();
    const now = new Date();
    for (const item of obligations) {
      this.inMemoryCache.set(item.id, {
        ...item,
        updatedAt: now,
      });
    }
    await this.persistToStorage();
  }

  public async findById(id: string): Promise<FutureObligation | null> {
    await this.ensureLoaded();
    const item = this.inMemoryCache.get(id);
    return item ? this.clone(item) : null;
  }

  public async findByUserId(userId: string): Promise<FutureObligation[]> {
    await this.ensureLoaded();
    return Array.from(this.inMemoryCache.values())
      .filter((item) => item.userId === userId)
      .map((item) => this.clone(item));
  }

  public async findByAccountId(accountId: string): Promise<FutureObligation[]> {
    await this.ensureLoaded();
    return Array.from(this.inMemoryCache.values())
      .filter((item) => item.accountId === accountId)
      .map((item) => this.clone(item));
  }

  public async findByCategoryId(categoryId: string): Promise<FutureObligation[]> {
    await this.ensureLoaded();
    return Array.from(this.inMemoryCache.values())
      .filter((item) => item.categoryId === categoryId)
      .map((item) => this.clone(item));
  }

  public async findUpcoming(userId: string, untilDate: Date): Promise<FutureObligation[]> {
    await this.ensureLoaded();
    const untilTime = untilDate.getTime();
    return Array.from(this.inMemoryCache.values())
      .filter(
        (item) =>
          item.userId === userId &&
          item.status === 'ACTIVE' &&
          item.nextDueDate.getTime() <= untilTime,
      )
      .sort((a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime())
      .map((item) => this.clone(item));
  }

  public async findAll(filters?: FutureObligationFilters): Promise<FutureObligation[]> {
    await this.ensureLoaded();
    let results = Array.from(this.inMemoryCache.values());

    if (filters) {
      if (filters.userId) {
        results = results.filter((item) => item.userId === filters.userId);
      }
      if (filters.accountId !== undefined) {
        results = results.filter((item) => item.accountId === filters.accountId);
      }
      if (filters.categoryId !== undefined) {
        results = results.filter((item) => item.categoryId === filters.categoryId);
      }
      if (filters.direction) {
        results = results.filter((item) => item.direction === filters.direction);
      }
      if (filters.obligationType) {
        results = results.filter((item) => item.obligationType === filters.obligationType);
      }
      if (filters.certainty) {
        results = results.filter((item) => item.certainty === filters.certainty);
      }
      if (filters.status) {
        results = results.filter((item) => item.status === filters.status);
      }
      if (filters.dueBefore) {
        const time = filters.dueBefore.getTime();
        results = results.filter((item) => item.nextDueDate.getTime() <= time);
      }
      if (filters.dueAfter) {
        const time = filters.dueAfter.getTime();
        results = results.filter((item) => item.nextDueDate.getTime() >= time);
      }
    }

    return results
      .sort((a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime())
      .map((item) => this.clone(item));
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
        await AsyncStorage.removeItem(AsyncStorageFutureObligationRepository.STORAGE_KEY);
      }
    } catch {
      // Ignorar en pruebas sin mock de AsyncStorage
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
        AsyncStorageFutureObligationRepository.STORAGE_KEY,
      );
      if (raw) {
        const parsed: StoredFutureObligation[] = JSON.parse(raw);
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
      const serializable: StoredFutureObligation[] = Array.from(
        this.inMemoryCache.values(),
      ).map((item) => this.serialize(item));

      await AsyncStorage.setItem(
        AsyncStorageFutureObligationRepository.STORAGE_KEY,
        JSON.stringify(serializable),
      );
    } catch {
      // Fallback silencioso en memoria
    }
  }

  private serialize(item: FutureObligation): StoredFutureObligation {
    return {
      ...item,
      nextDueDate: item.nextDueDate.toISOString(),
      endDate: item.endDate ? item.endDate.toISOString() : null,
      lastFulfilledAt: item.lastFulfilledAt ? item.lastFulfilledAt.toISOString() : null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private deserialize(item: StoredFutureObligation): FutureObligation {
    return {
      ...item,
      nextDueDate: new Date(item.nextDueDate),
      endDate: item.endDate ? new Date(item.endDate) : null,
      lastFulfilledAt: item.lastFulfilledAt ? new Date(item.lastFulfilledAt) : null,
      createdAt: new Date(item.createdAt),
      updatedAt: new Date(item.updatedAt),
    };
  }

  private clone(item: FutureObligation): FutureObligation {
    return {
      ...item,
      nextDueDate: new Date(item.nextDueDate),
      endDate: item.endDate ? new Date(item.endDate) : null,
      lastFulfilledAt: item.lastFulfilledAt ? new Date(item.lastFulfilledAt) : null,
      createdAt: new Date(item.createdAt),
      updatedAt: new Date(item.updatedAt),
      metadata: item.metadata ? { ...item.metadata } : undefined,
    };
  }
}

export const defaultFutureObligationRepository =
  new AsyncStorageFutureObligationRepository();
