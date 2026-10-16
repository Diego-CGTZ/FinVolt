/**
 * LoanCalculatorService — Servicio de Dominio para Préstamos y Saldos (US-049)
 *
 * Responsabilidades:
 * - Creación determinista de entidades Loan y LoanPayment con cálculo en minor units (centavos).
 * - Garantizar la integridad estricta de saldos (outstandingBalanceMinor = amountMinor - sum(payments)).
 * - Detección y rechazo de sobrepagos (LoanOverpaymentError).
 * - Transición de estado automática (ACTIVE -> PAID al saldarse a 0, y viceversa).
 * - Cálculo consolidado de métricas y resúmenes de préstamos otorgados y recibidos.
 */

import {
  type Loan,
  type LoanPayment,
  type CreateLoanInput,
  type RecordLoanPaymentInput,
  type LoansSummary,
  LoanValidationError,
  LoanOverpaymentError,
} from '../../models/Loan';

export class LoanCalculatorService {
  /**
   * Valida que el monto sea un entero positivo mayor a cero (en centavos)
   */
  public static isValidAmountMinor(amountMinor: number): boolean {
    return Number.isInteger(amountMinor) && amountMinor > 0;
  }

  /**
   * Crea una nueva entidad de Préstamo con invariantes iniciales
   */
  public static createEntity(input: CreateLoanInput): Loan {
    if (!input.userId || typeof input.userId !== 'string' || input.userId.trim() === '') {
      throw new LoanValidationError('El préstamo requiere un userId válido.');
    }

    if (!input.contactId || typeof input.contactId !== 'string' || input.contactId.trim() === '') {
      throw new LoanValidationError('El préstamo requiere un contactId válido.');
    }

    if (!input.description || typeof input.description !== 'string' || input.description.trim() === '') {
      throw new LoanValidationError('La descripción del préstamo es obligatoria.');
    }

    if (!input.type || (input.type !== 'LENT' && input.type !== 'BORROWED')) {
      throw new LoanValidationError(`Tipo de préstamo inválido: "${input.type}". Debe ser LENT o BORROWED.`);
    }

    if (!this.isValidAmountMinor(input.amountMinor)) {
      throw new LoanValidationError(
        `El monto del préstamo debe ser un entero positivo en centavos. Recibido: ${input.amountMinor}`
      );
    }

    const now = new Date();
    const amountMinor = Math.round(input.amountMinor);
    const amount = Number((amountMinor / 100).toFixed(2));
    const currency = input.currency ? input.currency.trim().toUpperCase() : 'MXN';

    return {
      id: input.id ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `loan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`),
      userId: input.userId.trim(),
      contactId: input.contactId.trim(),
      type: input.type,
      amountMinor,
      amount,
      paidAmountMinor: 0,
      paidAmount: 0,
      outstandingBalanceMinor: amountMinor,
      outstandingBalance: amount,
      currency,
      description: input.description.trim(),
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      status: 'ACTIVE',
      accountId: input.accountId ? input.accountId.trim() : null,
      transactionId: input.transactionId ? input.transactionId.trim() : null,
      payments: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Registra un pago/abono garantizando la integridad de saldos y evitando sobrepagos
   */
  public static addPayment(
    loan: Loan,
    input: RecordLoanPaymentInput
  ): { updatedLoan: Loan; payment: LoanPayment } {
    if (!this.isValidAmountMinor(input.amountMinor)) {
      throw new LoanValidationError(
        `El monto del abono debe ser un entero positivo en centavos. Recibido: ${input.amountMinor}`
      );
    }

    if (loan.status === 'CANCELLED') {
      throw new LoanValidationError('No se pueden registrar pagos en un préstamo cancelado.');
    }

    const paymentAmountMinor = Math.round(input.amountMinor);

    // Validación de sobrepago estricta
    if (paymentAmountMinor > loan.outstandingBalanceMinor) {
      throw new LoanOverpaymentError(loan.outstandingBalanceMinor, paymentAmountMinor);
    }

    const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();
    const paymentAmount = Number((paymentAmountMinor / 100).toFixed(2));

    const payment: LoanPayment = {
      id: input.id ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `pay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`),
      loanId: loan.id,
      userId: input.userId || loan.userId,
      amountMinor: paymentAmountMinor,
      amount: paymentAmount,
      paymentDate,
      notes: input.notes ? input.notes.trim() : null,
      transactionId: input.transactionId ? input.transactionId.trim() : null,
      createdAt: new Date(),
    };

    const newPaidAmountMinor = loan.paidAmountMinor + paymentAmountMinor;
    const newOutstandingBalanceMinor = loan.amountMinor - newPaidAmountMinor;

    const newStatus = newOutstandingBalanceMinor === 0 ? 'PAID' : 'ACTIVE';

    const updatedLoan: Loan = {
      ...loan,
      paidAmountMinor: newPaidAmountMinor,
      paidAmount: Number((newPaidAmountMinor / 100).toFixed(2)),
      outstandingBalanceMinor: newOutstandingBalanceMinor,
      outstandingBalance: Number((newOutstandingBalanceMinor / 100).toFixed(2)),
      status: newStatus,
      payments: [...loan.payments, payment],
      updatedAt: new Date(),
    };

    return { updatedLoan, payment };
  }

  /**
   * Recalcula íntegramente los saldos a partir del historial de pagos
   */
  public static recalculateFromPayments(loan: Loan, payments: LoanPayment[]): Loan {
    let paidAmountMinor = 0;

    for (const p of payments) {
      if (!this.isValidAmountMinor(p.amountMinor)) {
        throw new LoanValidationError(`Abono con monto inválido detectado: ${p.amountMinor}`);
      }
      paidAmountMinor += p.amountMinor;
    }

    if (paidAmountMinor > loan.amountMinor) {
      throw new LoanOverpaymentError(loan.amountMinor, paidAmountMinor);
    }

    const outstandingBalanceMinor = loan.amountMinor - paidAmountMinor;
    const status = loan.status === 'CANCELLED' ? 'CANCELLED' : (outstandingBalanceMinor === 0 ? 'PAID' : 'ACTIVE');

    return {
      ...loan,
      paidAmountMinor,
      paidAmount: Number((paidAmountMinor / 100).toFixed(2)),
      outstandingBalanceMinor,
      outstandingBalance: Number((outstandingBalanceMinor / 100).toFixed(2)),
      status,
      payments: [...payments].sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime()),
      updatedAt: new Date(),
    };
  }

  /**
   * Genera el resumen financiero consolidado de préstamos otorgados y recibidos
   */
  public static calculateSummary(userId: string, loans: Loan[]): LoansSummary {
    let totalLentMinor = 0;
    let outstandingLentMinor = 0;
    let totalBorrowedMinor = 0;
    let outstandingBorrowedMinor = 0;
    let activeLentCount = 0;
    let activeBorrowedCount = 0;
    let paidLoansCount = 0;
    const currency = loans.length > 0 ? loans[0].currency : 'MXN';

    for (const loan of loans) {
      if (loan.userId !== userId) continue;

      if (loan.status === 'PAID') {
        paidLoansCount++;
      }

      if (loan.type === 'LENT') {
        totalLentMinor += loan.amountMinor;
        if (loan.status === 'ACTIVE') {
          outstandingLentMinor += loan.outstandingBalanceMinor;
          activeLentCount++;
        }
      } else if (loan.type === 'BORROWED') {
        totalBorrowedMinor += loan.amountMinor;
        if (loan.status === 'ACTIVE') {
          outstandingBorrowedMinor += loan.outstandingBalanceMinor;
          activeBorrowedCount++;
        }
      }
    }

    return {
      userId,
      totalLentMinor,
      totalLent: Number((totalLentMinor / 100).toFixed(2)),
      outstandingLentMinor,
      outstandingLent: Number((outstandingLentMinor / 100).toFixed(2)),
      totalBorrowedMinor,
      totalBorrowed: Number((totalBorrowedMinor / 100).toFixed(2)),
      outstandingBorrowedMinor,
      outstandingBorrowed: Number((outstandingBorrowedMinor / 100).toFixed(2)),
      activeLentCount,
      activeBorrowedCount,
      paidLoansCount,
      currency,
    };
  }
}
