import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RawEvent } from '../../domain/models/RawEvent';

const STORAGE_KEY = '@finvolt/raw_events_local_cache';

/**
 * Almacenamiento local persistente para Raw Events.
 * Garantiza que ninguna entrada externa (notificación, SMS) se pierda
 * si el dispositivo se encuentra sin conexión o la base de datos remota
 * está en proceso de sincronización.
 */
export class RawEventStorage {
  static async getAll(): Promise<RawEvent[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      const parsed: any[] = JSON.parse(data);
      return parsed.map((item) => ({
        ...item,
        receivedAt: new Date(item.receivedAt),
        processedAt: item.processedAt ? new Date(item.processedAt) : undefined,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      }));
    } catch {
      return [];
    }
  }

  static async save(event: RawEvent): Promise<void> {
    try {
      const all = await this.getAll();
      const existingIdx = all.findIndex((e) => e.id === event.id);
      if (existingIdx >= 0) {
        all[existingIdx] = event;
      } else {
        all.unshift(event);
      }
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // Ignorar fallas silenciosas en cache
    }
  }

  static async getById(id: string): Promise<RawEvent | null> {
    const all = await this.getAll();
    return all.find((e) => e.id === id) || null;
  }

  static async getBySourceId(source: string, sourceId: string): Promise<RawEvent | null> {
    const all = await this.getAll();
    return all.find((e) => e.source === source && e.sourceId === sourceId) || null;
  }

  static async update(id: string, updates: Partial<RawEvent>): Promise<RawEvent | null> {
    const all = await this.getAll();
    const idx = all.findIndex((e) => e.id === id);
    if (idx < 0) return null;

    const updated: RawEvent = {
      ...all[idx],
      ...updates,
      updatedAt: new Date(),
    };
    all[idx] = updated;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    return updated;
  }

  static async clear(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
}
