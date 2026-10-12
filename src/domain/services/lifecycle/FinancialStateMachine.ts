/**
 * FinancialStateMachine — Máquina de Estados Financiara Formal (US-028)
 *
 * Define y gobierna el ciclo de vida contable formal de una transacción en FinVolt.
 *
 * Estados soportados (9 estados canónicos):
 *   - CANDIDATE: Ingestada / auto-detectada, pendiente de revisión inicial.
 *   - MATCHED: Emparejada / conciliada con otra fuente o registro previo pendiente de confirmación.
 *   - CONFIRMED: Confirmada por el usuario o auto-confirmada con alta confianza contable.
 *   - PENDING: Autorización bancaria retenida (hold), no liquidada contablemente aún.
 *   - POSTED: Liquidada / asentada formalmente en el banco (balance firme).
 *   - REFUND: Devolución, cancelación de cobro o contracargo.
 *   - TRANSFER: Movimiento interno bidireccional entre cuentas propias del usuario.
 *   - DUPLICATE: Desactivada por coincidencia duplicada (exacta o aproximada).
 *   - REJECTED: Descartada (falso positivo, ignorada o eliminada).
 */

import type { Transaction, TransactionStatus } from '../../models/Transaction';

export const ALL_TRANSACTION_STATUSES: readonly TransactionStatus[] = [
  'CANDIDATE',
  'MATCHED',
  'CONFIRMED',
  'PENDING',
  'POSTED',
  'REFUND',
  'TRANSFER',
  'DUPLICATE',
  'REJECTED',
] as const;

/**
 * Matriz estricta de transiciones de estado permitidas en el ciclo de vida contable.
 */
export const VALID_TRANSACTION_TRANSITIONS: Record<TransactionStatus, readonly TransactionStatus[]> = {
  // CANDIDATE: Estado inicial de un movimiento recién detectado
  CANDIDATE: [
    'MATCHED',    // Emparejado con otra fuente / transacción previa
    'CONFIRMED',  // Aprobado manualmente o por umbral de confianza
    'PENDING',    // Movimiento clasificado como retención/cargo pendiente
    'POSTED',     // Asentado directamente (ej. desde estado de cuenta bancario)
    'TRANSFER',   // Clasificado como transferencia entre cuentas
    'DUPLICATE',  // Marcado como duplicado de otro registro
    'REJECTED',   // Descartado por el usuario o regla de filtrado
  ],

  // MATCHED: Enlazado con evidencia o candidato complementario
  MATCHED: [
    'CONFIRMED',  // Conciliación aprobada y consolidada
    'PENDING',    // Confirmada la coincidencia pero retenida sin asentar
    'POSTED',     // Confirmada y liquidada directamente por extracto bancario
    'TRANSFER',   // Consolidada como transferencia entre cuentas
    'DUPLICATE',  // Determinado como redundancia no complementaria
    'REJECTED',   // Descartado el emparejamiento
    'CANDIDATE',  // Desvinculado / desemparejado, devuelto a revisión
  ],

  // PENDING: Cargo autorizado/retenido por la institución
  PENDING: [
    'POSTED',     // Liquidado/asentado formalmente por el corte bancario
    'CONFIRMED',  // Confirmado por el usuario aunque siga sin liquidar
    'REFUND',     // Autorización cancelada o reversión de retención
    'TRANSFER',   // Reclasificado a transferencia pendiente
    'DUPLICATE',  // Identificado como duplicado
    'REJECTED',   // Retención expirada o descartada
  ],

  // POSTED: Asentado firmemente en el banco
  POSTED: [
    'REFUND',     // Reembolso o contracargo posterior sobre la compra liquidada
    'TRANSFER',   // Reclasificación contable a transferencia
    'DUPLICATE',  // Detectado como duplicado tras auditoría o conciliación posterior
    'REJECTED',   // Anulado por el banco o desconocido por contracargo ganado
  ],

  // CONFIRMED: Aprobado contablemente en la app
  CONFIRMED: [
    'POSTED',     // Asentado formalmente por estado de cuenta bancario
    'PENDING',    // Actualizado a pendiente si la autorización aún no concluye
    'REFUND',     // Reembolso emitido por el comercio
    'TRANSFER',   // Reclasificado a transferencia
    'DUPLICATE',  // Marcado como duplicado
    'REJECTED',   // Descartado retrospectivamente
  ],

  // TRANSFER: Movimiento entre cuentas propias
  TRANSFER: [
    'POSTED',     // Liquidado formalmente en ambas cuentas
    'CONFIRMED',  // Desvinculada la transferencia a movimiento ordinario
    'REJECTED',   // Cancelada o descartada
    'DUPLICATE',  // Identificada como duplicada
  ],

  // REFUND: Reembolso o devolución
  REFUND: [
    'POSTED',     // Liquidado formalmente en extracto
    'CONFIRMED',  // Confirmado como ajuste manual definitivo
    'REJECTED',   // Revertido por error
    'DUPLICATE',  // Marcado como duplicado
  ],

  // DUPLICATE: Estado de descarte por duplicación
  DUPLICATE: [
    'CANDIDATE',  // Reactivado para reevaluación si el usuario desmiente duplicado
    'CONFIRMED',  // Restaurado forzosamente por el usuario como válido
    'REJECTED',   // Descarte definitivo
  ],

  // REJECTED: Estado de descarte
  REJECTED: [
    'CANDIDATE',  // Reactivado a candidato para reevaluación
    'CONFIRMED',  // Restaurado manualmente por el usuario
  ],
};

/**
 * Error lanzado ante un intento de transición inválida en la State Machine.
 */
export class InvalidTransactionStateTransitionError extends Error {
  public readonly fromStatus: TransactionStatus;
  public readonly toStatus: TransactionStatus;
  public readonly allowedTransitions: readonly TransactionStatus[];

  constructor(fromStatus: TransactionStatus, toStatus: TransactionStatus) {
    const allowed = VALID_TRANSACTION_TRANSITIONS[fromStatus] || [];
    const allowedStr = allowed.length > 0 ? allowed.join(', ') : 'ninguna (estado terminal)';
    super(
      `Transición de estado de transacción inválida: '${fromStatus}' -> '${toStatus}'. ` +
      `Transiciones permitidas desde '${fromStatus}': [${allowedStr}].`
    );
    this.name = 'InvalidTransactionStateTransitionError';
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
    this.allowedTransitions = allowed;
    Object.setPrototypeOf(this, InvalidTransactionStateTransitionError.prototype);
  }
}

export interface TransitionOptions {
  /** Razón o justificación del cambio de estado */
  reason?: string;

  /** Fecha de liquidación en el banco (obligatoria o recomendada al pasar a POSTED) */
  postedAt?: Date | null;

  /** ID de transacción contraria al pasar a TRANSFER */
  linkedTransactionId?: string | null;

  /** Timestamp en que ocurre la transición (por defecto now()) */
  timestamp?: Date;

  /** Si true, permite transicionar al mismo estado sin error como operación idempotente */
  allowSameState?: boolean;
}

/**
 * Servicio canónico de la Máquina de Estados Financiera.
 */
export class FinancialStateMachine {
  /**
   * Comprueba si una cadena es un estado formal válido de la State Machine.
   */
  public static isValidStatus(status: unknown): status is TransactionStatus {
    return typeof status === 'string' && (ALL_TRANSACTION_STATUSES as readonly string[]).includes(status);
  }

  /**
   * Determina si una transición de `from` a `to` es válida según las reglas contables.
   */
  public static canTransition(
    from: TransactionStatus,
    to: TransactionStatus,
    options?: { allowSameState?: boolean },
  ): boolean {
    if (!this.isValidStatus(from) || !this.isValidStatus(to)) {
      return false;
    }

    if (from === to) {
      return options?.allowSameState ?? true;
    }

    const allowed = VALID_TRANSACTION_TRANSITIONS[from];
    if (!allowed) {
      return false;
    }

    return allowed.includes(to);
  }

  /**
   * Obtiene la lista inmutable de transiciones permitidas desde el estado dado.
   */
  public static getAllowedTransitions(from: TransactionStatus): readonly TransactionStatus[] {
    if (!this.isValidStatus(from)) {
      return [];
    }
    return VALID_TRANSACTION_TRANSITIONS[from] || [];
  }

  /**
   * Valida la transición lanzando `InvalidTransactionStateTransitionError` si no está permitida.
   */
  public static assertValidTransition(
    from: TransactionStatus,
    to: TransactionStatus,
    options?: { allowSameState?: boolean },
  ): void {
    if (!this.canTransition(from, to, options)) {
      throw new InvalidTransactionStateTransitionError(from, to);
    }
  }

  /**
   * Ejecuta la transición de estado sobre una entidad `Transaction`, aplicando
   * las validaciones y los efectos colaterales de dominio correspondientes.
   */
  public static transition(
    transaction: Transaction,
    to: TransactionStatus,
    options?: TransitionOptions,
  ): Transaction {
    const from = transaction.status;
    const now = options?.timestamp ?? new Date();

    // 1. Validar transición
    this.assertValidTransition(from, to, {
      allowSameState: options?.allowSameState ?? true,
    });

    // 2. Transición idempotente sin cambio efectivo
    if (from === to) {
      return {
        ...transaction,
        updatedAt: now,
      };
    }

    // 3. Efectos colaterales según estado destino
    let postedAt = transaction.postedAt;
    if (to === 'POSTED') {
      postedAt = options?.postedAt !== undefined ? options.postedAt : (transaction.postedAt ?? now);
    }

    let linkedTransactionId = transaction.linkedTransactionId;
    if (to === 'TRANSFER' && options?.linkedTransactionId !== undefined) {
      linkedTransactionId = options.linkedTransactionId;
    }

    return {
      ...transaction,
      status: to,
      postedAt,
      linkedTransactionId,
      updatedAt: now,
    };
  }

  // ── Clasificación semántica de estados ────────────────────────────────────

  /**
   * Estados que tienen impacto contable efectivo en saldos y balances.
   * (CONFIRMED, PENDING, POSTED, TRANSFER, REFUND).
   * CANDIDATE, MATCHED, DUPLICATE y REJECTED no alteran el patrimonio neto.
   */
  public static isEffective(status: TransactionStatus): boolean {
    return (
      status === 'CONFIRMED' ||
      status === 'PENDING' ||
      status === 'POSTED' ||
      status === 'TRANSFER' ||
      status === 'REFUND'
    );
  }

  /**
   * Estados que representan operaciones asentadas y firmes (POSTED).
   */
  public static isSettled(status: TransactionStatus): boolean {
    return status === 'POSTED';
  }

  /**
   * Estados que representan operaciones no resueltas o pendientes de liquidación.
   */
  public static isPending(status: TransactionStatus): boolean {
    return status === 'PENDING' || status === 'CANDIDATE' || status === 'MATCHED';
  }

  /**
   * Estados inactivos / descartados que no forman parte del flujo normal.
   */
  public static isDiscarded(status: TransactionStatus): boolean {
    return status === 'DUPLICATE' || status === 'REJECTED';
  }
}
