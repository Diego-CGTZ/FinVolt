/**
 * Loan — Modelo Canónico de Préstamos y Pagos (US-049)
 *
 * Criterios de Aceptación (AC):
 * - User, Contact, Loan, Amount, Payments y Outstanding Balance.
 * - Integridad de saldos estricta (minor units, validación contra sobrepagos, transiciones automáticas).
 *
 * Dependencias: US-008 (Modelo canónico de transacción).
 */

export type LoanType = 'LENT' | 'BORROWED';

export type LoanStatus = 'ACTIVE' | 'PAID' | 'CANCELLED';

export interface LoanPayment {
  id: string;
  loanId: string;
  userId: string;
  /** Monto del abono/pago en unidades menores (centavos) */
  amountMinor: number;
  /** Monto en unidades mayores (decimal) */
  amount: number;
  /** Fecha en que se realizó el abono */
  paymentDate: Date;
  /** Notas u observaciones del pago */
  notes?: string | null;
  /** ID de la transacción canónica vinculada (US-008) cuando aplique */
  transactionId?: string | null;
  createdAt: Date;
}

export interface Loan {
  id: string;
  userId: string;
  /** Contacto contraparte de la deuda/préstamo */
  contactId: string;
  /**
   * LENT: Dinero prestado por el usuario al contacto (cuenta por cobrar / activo).
   * BORROWED: Dinero pedido prestado por el usuario al contacto (cuenta por pagar / pasivo).
   */
  type: LoanType;
  /** Monto principal original en unidades menores (centavos) */
  amountMinor: number;
  /** Monto principal original en unidades mayores (decimal) */
  amount: number;
  /** Suma acumulada de pagos en unidades menores */
  paidAmountMinor: number;
  /** Suma acumulada de pagos en decimal */
  paidAmount: number;
  /** Saldo pendiente por liquidar en unidades menores (amountMinor - paidAmountMinor) */
  outstandingBalanceMinor: number;
  /** Saldo pendiente en decimal */
  outstandingBalance: number;
  /** Moneda en formato ISO 4217 (default 'MXN') */
  currency: string;
  /** Descripción o motivo del préstamo */
  description: string;
  /** Fecha límite o estimada de pago */
  dueDate?: Date | null;
  /** Estado del préstamo: ACTIVE (saldo > 0), PAID (saldo = 0), CANCELLED */
  status: LoanStatus;
  /** Cuenta financiera de origen/destino (US-006) opcional */
  accountId?: string | null;
  /** Transacción original de desembolso (US-008) opcional */
  transactionId?: string | null;
  /** Historial ordenado de pagos y abonos */
  payments: LoanPayment[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLoanInput {
  id?: string;
  userId: string;
  contactId: string;
  type: LoanType;
  amountMinor: number;
  currency?: string;
  description: string;
  dueDate?: Date | null;
  accountId?: string | null;
  transactionId?: string | null;
}

export interface UpdateLoanInput {
  id: string;
  description?: string;
  dueDate?: Date | null;
  status?: LoanStatus;
  accountId?: string | null;
}

export interface RecordLoanPaymentInput {
  id?: string;
  loanId: string;
  userId: string;
  amountMinor: number;
  paymentDate?: Date;
  notes?: string | null;
  transactionId?: string | null;
}

export interface LoansSummary {
  userId: string;
  totalLentMinor: number;
  totalLent: number;
  outstandingLentMinor: number;
  outstandingLent: number;
  totalBorrowedMinor: number;
  totalBorrowed: number;
  outstandingBorrowedMinor: number;
  outstandingBorrowed: number;
  activeLentCount: number;
  activeBorrowedCount: number;
  paidLoansCount: number;
  currency: string;
}

export class LoanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoanValidationError';
  }
}

export class LoanOverpaymentError extends LoanValidationError {
  public readonly remainingMinor: number;
  public readonly attemptedMinor: number;

  constructor(remainingMinor: number, attemptedMinor: number) {
    super(
      `El pago de $${(attemptedMinor / 100).toFixed(2)} excede el saldo pendiente de $${(
        remainingMinor / 100
      ).toFixed(2)}.`
    );
    this.name = 'LoanOverpaymentError';
    this.remainingMinor = remainingMinor;
    this.attemptedMinor = attemptedMinor;
  }
}

export class LoanNotFoundError extends LoanValidationError {
  constructor(id: string) {
    super(`Préstamo con ID "${id}" no encontrado.`);
    this.name = 'LoanNotFoundError';
  }
}
