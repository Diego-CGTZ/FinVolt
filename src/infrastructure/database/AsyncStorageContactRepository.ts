/**
 * AsyncStorageContactRepository — Repositorio Local de Contactos (US-049)
 *
 * Implementa IContactRepository con AsyncStorage y caché en memoria.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { IContactRepository } from '../../domain/repositories/IContactRepository';
import type { Contact } from '../../domain/models/Contact';

interface StoredContact extends Omit<Contact, 'createdAt' | 'updatedAt'> {
  createdAt: string;
  updatedAt: string;
}

export class AsyncStorageContactRepository implements IContactRepository {
  private static readonly STORAGE_KEY = '@finvolt_contacts';
  private inMemoryCache: Map<string, Contact> = new Map();
  private isLoaded: boolean = false;

  constructor() {
    this.loadFromStorage();
  }

  public async save(contact: Contact): Promise<void> {
    await this.ensureLoaded();
    const updated: Contact = {
      ...contact,
      updatedAt: new Date(),
    };
    this.inMemoryCache.set(updated.id, updated);
    await this.persistToStorage();
  }

  public async findById(id: string): Promise<Contact | null> {
    await this.ensureLoaded();
    return this.inMemoryCache.get(id) || null;
  }

  public async findByUserId(userId: string): Promise<Contact[]> {
    await this.ensureLoaded();
    const result: Contact[] = [];
    for (const item of this.inMemoryCache.values()) {
      if (item.userId === userId) {
        result.push(item);
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  public async delete(id: string): Promise<void> {
    await this.ensureLoaded();
    this.inMemoryCache.delete(id);
    await this.persistToStorage();
  }

  public async clear(): Promise<void> {
    this.inMemoryCache.clear();
    this.isLoaded = true;
    try {
      await AsyncStorage.removeItem(AsyncStorageContactRepository.STORAGE_KEY);
    } catch {
      // Ignorar en entornos de test puros
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.isLoaded) {
      await this.loadFromStorage();
    }
  }

  private async loadFromStorage(): Promise<void> {
    try {
      const json = await AsyncStorage.getItem(AsyncStorageContactRepository.STORAGE_KEY);
      if (json) {
        const parsed: StoredContact[] = JSON.parse(json);
        this.inMemoryCache.clear();
        for (const item of parsed) {
          this.inMemoryCache.set(item.id, {
            ...item,
            createdAt: new Date(item.createdAt),
            updatedAt: new Date(item.updatedAt),
          });
        }
      }
    } catch {
      // Fallback a memoria si AsyncStorage falla
    } finally {
      this.isLoaded = true;
    }
  }

  private async persistToStorage(): Promise<void> {
    try {
      const items: StoredContact[] = Array.from(this.inMemoryCache.values()).map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      }));
      await AsyncStorage.setItem(
        AsyncStorageContactRepository.STORAGE_KEY,
        JSON.stringify(items)
      );
    } catch {
      // Ignorar en entornos de test
    }
  }
}
