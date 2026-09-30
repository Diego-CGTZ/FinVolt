import type {
  CreateRawEventDTO,
  RawEvent,
} from '../models/RawEvent';
import type { IRawEventRepository, RawEventFilter } from '../repositories/IRawEventRepository';

/**
 * Servicio de Dominio para la Gestión de Eventos Crudos (US-018).
 *
 * Aplica las reglas del negocio de ingestión:
 * - Toda entrada externa se preserva íntegra antes de ser procesada.
 * - NUNCA se inserta directamente en la tabla de transacciones canónicas.
 * - Soporte para deduplicación temprana por source_id.
 * - Reprocesamiento controlado de eventos fallidos o actualizados.
 */
export class RawEventService {
  constructor(private readonly repository: IRawEventRepository) {}

  /**
   * Captura y almacena una entrada externa como evento crudo.
   * Si la entrada ya fue capturada previamente (mismo source y sourceId), devuelve el existente.
   */
  async capture(dto: CreateRawEventDTO): Promise<{ event: RawEvent; isNew: boolean }> {
    if (!dto.source) {
      throw new Error('La fuente (source) del raw event es obligatoria.');
    }

    if (!dto.payload || typeof dto.payload !== 'object') {
      throw new Error('El payload del raw event debe ser un objeto válido.');
    }

    // Deduplicación por source_id si está presente
    if (dto.sourceId) {
      const existing = await this.repository.findBySourceId(dto.source, dto.sourceId);
      if (existing) {
        return { event: existing, isNew: false };
      }
    }

    const saved = await this.repository.save(dto);
    return { event: saved, isNew: true };
  }

  /**
   * Marca un evento como procesado satisfactoriamente por un parser/adapter.
   */
  async markAsProcessed(id: string): Promise<RawEvent> {
    return this.repository.updateStatus(id, {
      status: 'PROCESSED',
      errorMessage: null,
      processedAt: new Date(),
    });
  }

  /**
   * Marca un evento como fallido ante errores de parseo o extracción.
   */
  async markAsFailed(id: string, errorMessage: string): Promise<RawEvent> {
    return this.repository.updateStatus(id, {
      status: 'FAILED',
      errorMessage,
      processedAt: new Date(),
    });
  }

  /**
   * Marca un evento como ignorado (no financiero, informativo o descartado por reglas).
   */
  async markAsIgnored(id: string, reason?: string): Promise<RawEvent> {
    return this.repository.updateStatus(id, {
      status: 'IGNORED',
      errorMessage: reason || null,
      processedAt: new Date(),
    });
  }

  /**
   * Marca un evento para reprocesamiento. Restablece su estado a PENDING,
   * permitiendo que los parsers lo tomen nuevamente.
   */
  async reprocess(id: string): Promise<RawEvent> {
    return this.repository.markForReprocessing(id);
  }

  /**
   * Consulta eventos pendientes listos para ser consumidos por el pipeline de ingestión.
   */
  async getPendingEvents(limit = 50): Promise<RawEvent[]> {
    return this.repository.getPendingEvents(limit);
  }

  /**
   * Consulta el historial de eventos con filtros.
   */
  async getHistory(filter?: RawEventFilter): Promise<RawEvent[]> {
    return this.repository.getEvents(filter);
  }
}
