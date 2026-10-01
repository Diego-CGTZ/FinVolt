/**
 * US-021 / US-023: Modelo Transaction Candidate
 *
 * Representa una transacción detectada preliminarmente a partir de una fuente
 * cruda (notificación push, email, etc.) antes de ser conciliada, vinculada a una
 * cuenta del usuario o confirmada formalmente.
 *
 * INVARIANTE ESTRICTA DE DOMINIO:
 * Un TransactionCandidate NO es una Transaction final.
 * Nunca se inserta directamente en `transactions` sin pasar por la conciliación
 * o confirmación del usuario.
 */

import type { TransactionType } from './Transaction';
import type { RawEventSource } from './RawEvent';

export type CandidateStatus =
  | 'PENDING_REVIEW'   // Detectado, pendiente de revisión/confirmación
  | 'AUTO_CONFIRMED'   // Confirmado automáticamente por reglas de alta confianza
  | 'REJECTED'         // Descartado por el usuario o por regla de exclusión
  | 'RECONCILED';      // Vinculado y reconciliado con una transacción existente

export interface AccountHint {
  last4Digits?: string;
  accountType?: 'CREDIT' | 'DEBIT' | 'CHECKING' | 'WALLET' | 'SAVINGS' | 'OTHER';
  bankName?: string;
}

export interface TransactionCandidate {
  id: string;
  userId: string;

  /** Referencia al evento crudo inmutable de origen (US-018) */
  rawEventId: string;

  /** Fuente de procedencia (notificación Android, email, etc.) */
  source: RawEventSource;

  /** Proveedor detectado (ej: 'BBVA', 'NU', 'SANTANDER', 'GENERIC') */
  provider: string;

  /**
   * Monto en unidades menores (centavos) para consistencia de dominio.
   * Ej: MXN 349.00 -> 34900
   */
  amountMinor: number;

  /** Monto en formato decimal estándar para visualización (ej: 349.00) */
  amount: number;

  /** Código de moneda ISO 4217 (ej: 'MXN') */
  currency: string;

  /** Tipo de movimiento detectado */
  type: TransactionType;

  /** Comercio original extraído tal como llegó de la fuente */
  merchantRaw: string | null;

  /** Comercio limpio o sugerido */
  merchant: string | null;

  /** Fecha y hora en que ocurrió el movimiento según la fuente */
  occurredAt: Date;

  /**
   * Puntuación de confianza (0 - 100) generada por el parser y detector.
   * Determina si requiere revisión manual o puede auto-aprobarse en el futuro.
   */
  confidenceScore: number;

  /** Pistas sobre la cuenta bancaria utilizada (últimos 4 dígitos, tipo) */
  accountHint?: AccountHint;

  /** Estado actual del candidato */
  status: CandidateStatus;

  /** Copia del payload original para máxima trazabilidad */
  rawPayload: Record<string, unknown>;

  /** Metadatos adicionales de la extracción */
  metadata: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCandidateDTO {
  userId?: string;
  rawEventId: string;
  source: RawEventSource;
  provider: string;
  amount: number;
  currency?: string;
  type: TransactionType;
  merchantRaw?: string | null;
  merchant?: string | null;
  occurredAt?: Date;
  confidenceScore: number;
  accountHint?: AccountHint;
  rawPayload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
