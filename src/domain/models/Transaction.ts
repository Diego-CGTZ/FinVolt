/**
 * Transaction — Entidad de dominio canónica (US-008)
 *
 * Representa cualquier operación financiera del usuario, independientemente
 * de su origen (manual, notificación, email, importación).
 *
 * Decisiones de diseño:
 *   - `amountMinor`: el monto se guarda en minor units (centavos) como entero
 *     para evitar errores de punto flotante en operaciones financieras.
 *     Ej: MXN 123.45 → amountMinor = 12345.
 *   - `currency`: ISO 4217, 3 caracteres (ej: 'MXN', 'USD').
 *   - `merchantRaw` / `merchant`: el nombre original de la fuente vs el normalizado.
 *   - `fingerprint`: hash determinístico para detección de duplicados (US-025).
 *   - `linkedTransactionId`: enlace a la transacción contraria en transferencias (US-011).
 *   - `status`: ciclo de vida formal manejado por la state machine (US-028).
 */

/** Tipo de movimiento financiero. */
export type TransactionType = 'EXPENSE' | 'INCOME' | 'TRANSFER';

/**
 * Estado del ciclo de vida de la transacción.
 * La state machine completa se implementa en US-028.
 */
export type TransactionStatus =
  | 'CANDIDATE'   // Auto-detectada, pendiente de revisión
  | 'CONFIRMED'   // Confirmada (por usuario o alta confianza)
  | 'PENDING'     // Autorizada, no liquidada
  | 'POSTED'      // Liquidada/asentada
  | 'TRANSFER'    // Parte de una transferencia
  | 'REFUND'      // Devolución
  | 'DUPLICATE'   // Detectada como duplicado
  | 'REJECTED';   // Descartada

/** Fuente de origen de la transacción. */
export type TransactionSource =
  | 'MANUAL'
  | 'NOTIFICATION'
  | 'EMAIL'
  | 'SMS'
  | 'STATEMENT_PDF'
  | 'STATEMENT_CSV'
  | 'STATEMENT_XLSX';

export interface Transaction {
  id: string;
  userId: string;

  /** ID de la cuenta financiera a la que pertenece. */
  accountId: string;

  type: TransactionType;

  /**
   * Monto en minor units (centavos) de la moneda indicada en `currency`.
   * Siempre positivo. El `type` indica la dirección del flujo.
   * Ej: MXN 123.45 → amountMinor = 12345
   */
  amountMinor: number;

  /** ISO 4217 — 3 caracteres. Ej: 'MXN', 'USD'. */
  currency: string;

  /** Cuándo ocurrió el evento (fecha del usuario o de la fuente). */
  occurredAt: Date;

  /** Cuándo fue liquidada por el banco. Null si aún no está asentada. */
  postedAt: Date | null;

  /** Nombre del comercio/contraparte tal como llegó de la fuente. */
  merchantRaw: string | null;

  /** Nombre del comercio normalizado (ver US-024). */
  merchant: string | null;

  /** Nota o descripción libre del usuario. */
  description: string | null;

  /** Categoría asignada a la transacción. */
  categoryId: string | null;

  source: TransactionSource;

  /** ID del raw_event de origen (ver US-018). Null si es manual. */
  sourceEventId: string | null;

  status: TransactionStatus;

  /**
   * Puntuación de confianza 0-100 asignada por el pipeline de ingestión.
   * Null si es una transacción manual (confianza implícita = 100).
   */
  confidenceScore: number | null;

  /**
   * Hash determinístico para detección de duplicados (US-025).
   * sha256(account_id | amount_minor | currency | date(occurred_at) | merchant_raw | type)
   */
  fingerprint: string | null;

  /**
   * Para transferencias: ID de la transacción contraria en la cuenta destino.
   * Null para gastos/ingresos regulares.
   */
  linkedTransactionId: string | null;

  createdAt: Date;
  updatedAt: Date;
}

// ── Input types ───────────────────────────────────────────────────────────────

/**
 * Payload para registrar una transacción manual (US-009, US-010).
 * El sistema asigna: id, userId, source='MANUAL', status='CONFIRMED',
 * fingerprint, confidenceScore=null, createdAt, updatedAt.
 */
export interface CreateTransactionInput {
  accountId: string;
  type: TransactionType;
  /** Monto en minor units. Ej: MXN 50.00 → amountMinor = 5000. */
  amountMinor: number;
  currency: string;
  occurredAt: Date;
  postedAt?: Date;
  merchantRaw?: string;
  merchant?: string;
  description?: string;
  categoryId?: string;
  source?: TransactionSource;
  sourceEventId?: string;
  status?: TransactionStatus;
  confidenceScore?: number;
  fingerprint?: string;
  linkedTransactionId?: string;
}

/** Campos actualizables por el usuario en una transacción existente. */
export interface UpdateTransactionInput {
  type?: TransactionType;
  amountMinor?: number;
  currency?: string;
  occurredAt?: Date;
  postedAt?: Date | null;
  merchantRaw?: string | null;
  merchant?: string | null;
  description?: string | null;
  categoryId?: string | null;
  status?: TransactionStatus;
  confidenceScore?: number | null;
  fingerprint?: string | null;
  linkedTransactionId?: string | null;
}

// ── Utilidades de dominio ──────────────────────────────────────────────────────

/**
 * Convierte minor units a un número decimal legible.
 * Ej: toDecimal(12345, 2) → 123.45
 */
export function toDecimal(amountMinor: number, decimals = 2): number {
  return amountMinor / Math.pow(10, decimals);
}

/**
 * Convierte un número decimal a minor units.
 * Ej: toMinorUnits(123.45, 2) → 12345
 */
export function toMinorUnits(amount: number, decimals = 2): number {
  return Math.round(amount * Math.pow(10, decimals));
}
