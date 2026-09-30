import { supabase } from '../api/supabaseClient';
import type {
  CreateRawEventDTO,
  RawEvent,
  RawEventSource,
  UpdateRawEventStatusDTO,
} from '../../domain/models/RawEvent';
import type {
  IRawEventRepository,
  RawEventFilter,
} from '../../domain/repositories/IRawEventRepository';
import { RawEventStorage } from '../storage/RawEventStorage';

/**
 * Implementación de IRawEventRepository sobre Supabase (US-018).
 * Incorpora fallback automático sobre RawEventStorage (AsyncStorage)
 * para garantizar operatividad offline y tolerancia a fallos.
 */
export class SupabaseRawEventRepository implements IRawEventRepository {
  async save(dto: CreateRawEventDTO): Promise<RawEvent> {
    const receivedAt = dto.receivedAt || new Date();

    const insertPayload = {
      source: dto.source,
      source_id: dto.sourceId || null,
      payload: dto.payload || {},
      raw_text: dto.rawText || null,
      metadata: dto.metadata || {},
      status: 'PENDING',
      received_at: receivedAt.toISOString(),
    };

    try {
      const { data, error } = await supabase
        .from('raw_events')
        .insert([insertPayload])
        .select()
        .single();

      if (error) throw error;
      const domainEvent = this.mapToDomain(data);
      await RawEventStorage.save(domainEvent);
      return domainEvent;
    } catch {
      // Fallback local ante falta de red o esquema no sincronizado
      const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const localEvent: RawEvent = {
        id: localId,
        userId: 'local-user',
        source: dto.source,
        sourceId: dto.sourceId,
        payload: dto.payload || {},
        rawText: dto.rawText,
        metadata: dto.metadata || {},
        status: 'PENDING',
        retryCount: 0,
        receivedAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await RawEventStorage.save(localEvent);
      return localEvent;
    }
  }

  async findById(id: string): Promise<RawEvent | null> {
    try {
      const { data, error } = await supabase
        .from('raw_events')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        return RawEventStorage.getById(id);
      }
      return this.mapToDomain(data);
    } catch {
      return RawEventStorage.getById(id);
    }
  }

  async findBySourceId(source: RawEventSource, sourceId: string): Promise<RawEvent | null> {
    try {
      const { data, error } = await supabase
        .from('raw_events')
        .select('*')
        .eq('source', source)
        .eq('source_id', sourceId)
        .maybeSingle();

      if (error || !data) {
        return RawEventStorage.getBySourceId(source, sourceId);
      }
      return this.mapToDomain(data);
    } catch {
      return RawEventStorage.getBySourceId(source, sourceId);
    }
  }

  async getPendingEvents(limit = 50): Promise<RawEvent[]> {
    return this.getEvents({ status: 'PENDING', limit });
  }

  async getEvents(filter: RawEventFilter = {}): Promise<RawEvent[]> {
    const limit = filter.limit ?? 50;

    try {
      let query = supabase
        .from('raw_events')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(limit);

      if (filter.status) query = query.eq('status', filter.status);
      if (filter.source) query = query.eq('source', filter.source);

      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) {
        // Combinar con almacenamiento local si no hay datos remotos
        const local = await RawEventStorage.getAll();
        return local
          .filter((e) => !filter.status || e.status === filter.status)
          .filter((e) => !filter.source || e.source === filter.source)
          .slice(0, limit);
      }

      return data.map(this.mapToDomain);
    } catch {
      const local = await RawEventStorage.getAll();
      return local
        .filter((e) => !filter.status || e.status === filter.status)
        .filter((e) => !filter.source || e.source === filter.source)
        .slice(0, limit);
    }
  }

  async updateStatus(id: string, updates: UpdateRawEventStatusDTO): Promise<RawEvent> {
    const processedAt = updates.processedAt ? updates.processedAt.toISOString() : null;

    try {
      const { data, error } = await supabase
        .from('raw_events')
        .update({
          status: updates.status,
          error_message: updates.errorMessage ?? null,
          processed_at: processedAt,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      const domain = this.mapToDomain(data);
      await RawEventStorage.save(domain);
      return domain;
    } catch {
      const local = await RawEventStorage.update(id, {
        status: updates.status,
        errorMessage: updates.errorMessage ?? undefined,
        processedAt: updates.processedAt ?? undefined,
      });
      if (!local) throw new Error(`RawEvent con ID ${id} no encontrado.`);
      return local;
    }
  }

  async markForReprocessing(id: string): Promise<RawEvent> {
    try {
      // Obtener retry_count actual para incrementarlo
      const current = await this.findById(id);
      const nextRetryCount = (current?.retryCount || 0) + 1;

      const { data, error } = await supabase
        .from('raw_events')
        .update({
          status: 'PENDING',
          error_message: null,
          retry_count: nextRetryCount,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      const domain = this.mapToDomain(data);
      await RawEventStorage.save(domain);
      return domain;
    } catch {
      const current = await RawEventStorage.getById(id);
      const nextRetryCount = (current?.retryCount || 0) + 1;
      const local = await RawEventStorage.update(id, {
        status: 'PENDING',
        errorMessage: undefined,
        retryCount: nextRetryCount,
      });
      if (!local) throw new Error(`RawEvent con ID ${id} no encontrado.`);
      return local;
    }
  }

  private mapToDomain(row: any): RawEvent {
    return {
      id: row.id,
      userId: row.user_id,
      source: row.source,
      sourceId: row.source_id ?? undefined,
      payload: row.payload ?? {},
      rawText: row.raw_text ?? undefined,
      metadata: row.metadata ?? {},
      status: row.status,
      errorMessage: row.error_message ?? undefined,
      retryCount: Number(row.retry_count) || 0,
      receivedAt: new Date(row.received_at),
      processedAt: row.processed_at ? new Date(row.processed_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
