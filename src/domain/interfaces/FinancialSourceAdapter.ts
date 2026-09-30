import type { CreateRawEventDTO, RawEventSource } from '../models/RawEvent';

export interface AdapterValidationResult {
  isValid: boolean;
  reason?: string;
}

/**
 * US-019: Interfaz común para todas las fuentes financieras externas.
 *
 * Desacopla por completo los proveedores específicos (Android NotificationListenerService,
 * Gmail API, IMAP, parsers de PDF/CSV/XLSX) del núcleo del dominio.
 *
 * Cada adaptador es responsable de:
 * 1. Identificar si una entrada le corresponde (`canHandle`).
 * 2. Validar que la estructura mínima esté presente (`validate`).
 * 3. Normalizar la entrada externa en un `CreateRawEventDTO` canónico (`adapt`),
 *    preservando el payload íntegro para cumplir con US-018.
 */
export interface FinancialSourceAdapter<
  TInput = unknown,
  TPayload extends Record<string, unknown> = Record<string, unknown>,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly source: RawEventSource;
  readonly name: string;
  readonly description: string;

  /**
   * Comprueba si la estructura o firma del objeto recibido corresponde a este adaptador.
   */
  canHandle(input: unknown): input is TInput;

  /**
   * Valida que la entrada contenga los campos requeridos para ser procesada.
   */
  validate(input: TInput): AdapterValidationResult;

  /**
   * Transforma la entrada del proveedor en un DTO canónico de RawEvent.
   */
  adapt(input: TInput): Promise<CreateRawEventDTO<TPayload, TMeta>>;
}
