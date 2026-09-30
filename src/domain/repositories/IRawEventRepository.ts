import type {
  CreateRawEventDTO,
  RawEvent,
  RawEventSource,
  RawEventStatus,
  UpdateRawEventStatusDTO,
} from '../models/RawEvent';

export interface RawEventFilter {
  status?: RawEventStatus;
  source?: RawEventSource;
  limit?: number;
}

/**
 * Contrato del repositorio para la persistencia de eventos crudos (US-018).
 */
export interface IRawEventRepository {
  /**
   * Guarda un evento crudo garantizando la inmutabilidad de la entrada original.
   */
  save(dto: CreateRawEventDTO): Promise<RawEvent>;

  /**
   * Obtiene un evento crudo por su identificador UUID.
   */
  findById(id: string): Promise<RawEvent | null>;

  /**
   * Busca un evento por su fuente e identificador externo (ej. key de notificación de Android).
   */
  findBySourceId(source: RawEventSource, sourceId: string): Promise<RawEvent | null>;

  /**
   * Obtiene eventos que se encuentran pendientes de procesamiento.
   */
  getPendingEvents(limit?: number): Promise<RawEvent[]>;

  /**
   * Lista eventos con filtros opcionales de estado, fuente y límite.
   */
  getEvents(filter?: RawEventFilter): Promise<RawEvent[]>;

  /**
   * Actualiza el estado de procesamiento del evento (PROCESSED, FAILED, IGNORED).
   */
  updateStatus(id: string, updates: UpdateRawEventStatusDTO): Promise<RawEvent>;

  /**
   * Prepara un evento fallido o previamente procesado para su reprocesamiento:
   * restablece status a 'PENDING', incrementa el contador de reintentos y limpia el error.
   */
  markForReprocessing(id: string): Promise<RawEvent>;
}
