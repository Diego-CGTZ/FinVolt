/**
 * US-042: Repositorio de Plantillas de Mapeo de Columnas
 *
 * Permite guardar, listar y eliminar plantillas de mapeo persistidas
 * en AsyncStorage con fallback en memoria para entornos de test.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  IMappingTemplateRepository,
  MappingTemplate,
} from '../../domain/interfaces/IColumnMappingService';

export class AsyncStorageMappingTemplateRepository implements IMappingTemplateRepository {
  private static readonly STORAGE_KEY = '@finvolt_column_mapping_templates';
  private inMemoryCache: Map<string, MappingTemplate> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  public async save(
    template: Omit<MappingTemplate, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<MappingTemplate> {
    const now = new Date().toISOString();
    const id = template.id || `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const saved: MappingTemplate = {
      ...template,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.inMemoryCache.set(id, saved);
    await this.persistToStorage();
    return saved;
  }

  public async findById(id: string): Promise<MappingTemplate | null> {
    await this.loadFromStorage();
    const item = this.inMemoryCache.get(id);
    return item ? { ...item } : null;
  }

  public async findAll(userId?: string): Promise<MappingTemplate[]> {
    await this.loadFromStorage();
    let list = Array.from(this.inMemoryCache.values());
    if (userId) {
      list = list.filter((t) => !t.userId || t.userId === userId);
    }
    return list.map((t) => ({ ...t }));
  }

  public async delete(id: string): Promise<boolean> {
    await this.loadFromStorage();
    const existed = this.inMemoryCache.delete(id);
    if (existed) {
      await this.persistToStorage();
    }
    return existed;
  }

  private async loadFromStorage(): Promise<void> {
    try {
      if (typeof AsyncStorage !== 'undefined' && AsyncStorage.getItem) {
        const raw = await AsyncStorage.getItem(AsyncStorageMappingTemplateRepository.STORAGE_KEY);
        if (raw) {
          const list: MappingTemplate[] = JSON.parse(raw);
          for (const item of list) {
            this.inMemoryCache.set(item.id, item);
          }
        }
      }
    } catch {
      // Ignorar en entornos sin AsyncStorage (tests unitarios tsx)
    }
  }

  private async persistToStorage(): Promise<void> {
    try {
      if (typeof AsyncStorage !== 'undefined' && AsyncStorage.setItem) {
        const list = Array.from(this.inMemoryCache.values());
        await AsyncStorage.setItem(
          AsyncStorageMappingTemplateRepository.STORAGE_KEY,
          JSON.stringify(list),
        );
      }
    } catch {
      // Fallback a memoria pura
    }
  }
}

export const defaultMappingTemplateRepository = new AsyncStorageMappingTemplateRepository();
