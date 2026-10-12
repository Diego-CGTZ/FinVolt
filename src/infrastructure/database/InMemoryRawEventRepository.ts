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

/**
 * Implementación en memoria de IRawEventRepository (US-018 / US-033).
 *
 * Útil para pruebas automatizadas, desarrollo desacoplado y ejecución local.
 */
export class InMemoryRawEventRepository implements IRawEventRepository {
  private events: RawEvent[] = [];
  private sequence = 1;

  constructor(initialEvents: RawEvent[] = []) {
    this.events = [...initialEvents];
  }

  async save(dto: CreateRawEventDTO): Promise<RawEvent> {
    const now = new Date();
    const event: RawEvent = {
      id: `raw-${Date.now()}-${this.sequence++}`,
      userId: 'user-default',
      source: dto.source,
      sourceId: dto.sourceId,
      // Clonado profundo para preservar inmutabilidad absoluta de la entrada
      payload: JSON.parse(JSON.stringify(dto.payload || {})),
      rawText: dto.rawText,
      metadata: JSON.parse(JSON.stringify(dto.metadata || {})),
      status: 'PENDING',
      retryCount: 0,
      receivedAt: dto.receivedAt || now,
      createdAt: now,
      updatedAt: now,
    };

    this.events.unshift(event);
    return { ...event };
  }

  async findById(id: string): Promise<RawEvent | null> {
    const found = this.events.find((e) => e.id === id);
    return found ? { ...found } : null;
  }

  async findBySourceId(source: RawEventSource, sourceId: string): Promise<RawEvent | null> {
    const found = this.events.find((e) => e.source === source && e.sourceId === sourceId);
    return found ? { ...found } : null;
  }

  async getPendingEvents(limit = 50): Promise<RawEvent[]> {
    return this.events
      .filter((e) => e.status === 'PENDING')
      .slice(0, limit)
      .map((e) => ({ ...e }));
  }

  async getEvents(filter: RawEventFilter = {}): Promise<RawEvent[]> {
    return this.events
      .filter((e) => !filter.status || e.status === filter.status)
      .filter((e) => !filter.source || e.source === filter.source)
      .slice(0, filter.limit || 50)
      .map((e) => ({ ...e }));
  }

  async updateStatus(id: string, updates: UpdateRawEventStatusDTO): Promise<RawEvent> {
    const event = this.events.find((e) => e.id === id);
    if (!event) {
      throw new Error(`RawEvent con ID "${id}" no encontrado.`);
    }

    event.status = updates.status;
    if (updates.errorMessage !== undefined) {
      event.errorMessage = updates.errorMessage ?? undefined;
    }
    if (updates.processedAt !== undefined) {
      event.processedAt = updates.processedAt ?? undefined;
    }
    event.updatedAt = new Date();

    return { ...event };
  }

  async markForReprocessing(id: string): Promise<RawEvent> {
    const event = this.events.find((e) => e.id === id);
    if (!event) {
      throw new Error(`RawEvent con ID "${id}" no encontrado.`);
    }

    event.status = 'PENDING';
    event.errorMessage = undefined;
    event.retryCount += 1;
    event.updatedAt = new Date();

    return { ...event };
  }

  /**
   * Método auxiliar para reiniciar o inspeccionar el almacén en pruebas.
   */
  clear(): void {
    this.events = [];
    this.sequence = 1;
  }

  getAllEvents(): RawEvent[] {
    return this.events.map((e) => ({ ...e }));
  }
}
