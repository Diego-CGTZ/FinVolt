/**
 * US-018: Modelo de Evento Crudo (Raw Event)
 *
 * Representa cualquier dato financiero capturado desde fuentes externas
 * (notificaciones push de Android, correos bancarios, archivos PDF, CSV, etc.)
 * en su formato original inmutable antes de ser sometido al pipeline de parseo.
 *
 * REGLA ARQUITECTÓNICA ESTRICTA:
 * Ningún raw event debe insertarse directamente en `transactions`.
 * Toda transformación hacia transacciones o candidatos debe pasar por los
 * adapters y parsers correspondientes.
 */

export type RawEventSource =
  | 'ANDROID_NOTIFICATION'
  | 'EMAIL'
  | 'SMS'
  | 'BANK_PDF'
  | 'BANK_CSV'
  | 'BANK_XLSX'
  | 'MANUAL_IMPORT';

export type RawEventStatus =
  | 'PENDING'    // Capturado, en cola para parseo
  | 'PROCESSED'  // Procesado satisfactoriamente
  | 'FAILED'     // Fallo durante el parseo o extracción
  | 'IGNORED';   // Descartado por no ser financiero o no relevante

export interface RawEvent<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  userId: string;
  source: RawEventSource;
  sourceId?: string;
  payload: TPayload;
  rawText?: string;
  metadata: TMeta;
  status: RawEventStatus;
  errorMessage?: string;
  retryCount: number;
  receivedAt: Date;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRawEventDTO<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  source: RawEventSource;
  sourceId?: string;
  payload: TPayload;
  rawText?: string;
  metadata?: TMeta;
  receivedAt?: Date;
}

export interface UpdateRawEventStatusDTO {
  status: RawEventStatus;
  errorMessage?: string | null;
  processedAt?: Date | null;
}
