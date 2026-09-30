import type { FinancialSourceAdapter } from '../interfaces/FinancialSourceAdapter';
import type { CreateRawEventDTO, RawEventSource } from '../models/RawEvent';

/**
 * Registro y despachador central de adaptadores de fuentes financieras (US-019).
 *
 * Mantiene la lista de adaptadores registrados y resuelve cuál adaptador
 * debe procesar una entrada externa entrante.
 */
export class FinancialSourceAdapterRegistry {
  private adapters = new Map<RawEventSource, FinancialSourceAdapter>();

  constructor(initialAdapters: FinancialSourceAdapter[] = []) {
    for (const adapter of initialAdapters) {
      this.register(adapter);
    }
  }

  /**
   * Registra un nuevo adaptador de fuente financiera.
   */
  register(adapter: FinancialSourceAdapter): void {
    this.adapters.set(adapter.source, adapter);
  }

  /**
   * Obtiene un adaptador por su identificador de fuente (RawEventSource).
   */
  get(source: RawEventSource): FinancialSourceAdapter | undefined {
    return this.adapters.get(source);
  }

  /**
   * Devuelve todos los adaptadores registrados.
   */
  getAll(): FinancialSourceAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Encuentra el adaptador adecuado inspeccionando la entrada con `canHandle`.
   */
  findAdapterForInput(input: unknown): FinancialSourceAdapter | undefined {
    for (const adapter of this.adapters.values()) {
      if (adapter.canHandle(input)) {
        return adapter;
      }
    }
    return undefined;
  }

  /**
   * Adapta una entrada externa genérica resolviendo automáticamente el adaptador correspondiente.
   */
  async adapt(input: unknown): Promise<CreateRawEventDTO> {
    const adapter = this.findAdapterForInput(input);
    if (!adapter) {
      throw new Error(
        'No se encontró ningún FinancialSourceAdapter registrado capaz de manejar esta entrada.',
      );
    }

    const validation = adapter.validate(input);
    if (!validation.isValid) {
      throw new Error(
        `Validación fallida en adaptador "${adapter.name}": ${validation.reason || 'Entrada inválida'}`,
      );
    }

    return adapter.adapt(input);
  }
}
