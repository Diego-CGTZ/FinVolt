/**
 * LoanDatabaseMapper — Mapeador bidireccional entre Loan, LoanPayment y filas de base de datos (US-049)
 */

import type { Loan, LoanPayment, LoanType, LoanStatus } from '../../../domain/models/Loan';

export interface LoanDatabaseRow {
  id: string;
  user_id: string;
  contact_id: string;
  type: LoanType;
  amount_minor: number;
  paid_amount_minor: number;
  outstanding_balance_minor: number;
  currency: string;
  description: string;
  due_date: string | null;
  status: LoanStatus;
  account_id: string | null;
  transaction_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoanPaymentDatabaseRow {
  id: string;
  loan_id: string;
  user_id: string;
  amount_minor: number;
  payment_date: string;
  notes: string | null;
  transaction_id: string | null;
  created_at: string;
}

export class LoanDatabaseMapper {
  public static mapPaymentToDomain(row: LoanPaymentDatabaseRow): LoanPayment {
    const amountMinor = Number(row.amount_minor);
    return {
      id: row.id,
      loanId: row.loan_id,
      userId: row.user_id,
      amountMinor,
      amount: Number((amountMinor / 100).toFixed(2)),
      paymentDate: new Date(row.payment_date),
      notes: row.notes || null,
      transactionId: row.transaction_id || null,
      createdAt: new Date(row.created_at),
    };
  }

  public static mapPaymentToDatabase(domain: LoanPayment): LoanPaymentDatabaseRow {
    return {
      id: domain.id,
      loan_id: domain.loanId,
      user_id: domain.userId,
      amount_minor: domain.amountMinor,
      payment_date: domain.paymentDate.toISOString(),
      notes: domain.notes || null,
      transaction_id: domain.transactionId || null,
      created_at: domain.createdAt.toISOString(),
    };
  }

  public static mapLoanToDomain(row: LoanDatabaseRow, payments: LoanPayment[] = []): Loan {
    const amountMinor = Number(row.amount_minor);
    const paidAmountMinor = Number(row.paid_amount_minor);
    const outstandingBalanceMinor = Number(row.outstanding_balance_minor);

    return {
      id: row.id,
      userId: row.user_id,
      contactId: row.contact_id,
      type: row.type,
      amountMinor,
      amount: Number((amountMinor / 100).toFixed(2)),
      paidAmountMinor,
      paidAmount: Number((paidAmountMinor / 100).toFixed(2)),
      outstandingBalanceMinor,
      outstandingBalance: Number((outstandingBalanceMinor / 100).toFixed(2)),
      currency: row.currency || 'MXN',
      description: row.description,
      dueDate: row.due_date ? new Date(row.due_date) : null,
      status: row.status,
      accountId: row.account_id || null,
      transactionId: row.transaction_id || null,
      payments: [...payments].sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime()),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  public static mapLoanToDatabase(domain: Loan): LoanDatabaseRow {
    return {
      id: domain.id,
      user_id: domain.userId,
      contact_id: domain.contactId,
      type: domain.type,
      amount_minor: domain.amountMinor,
      paid_amount_minor: domain.paidAmountMinor,
      outstanding_balance_minor: domain.outstandingBalanceMinor,
      currency: domain.currency,
      description: domain.description,
      due_date: domain.dueDate ? domain.dueDate.toISOString() : null,
      status: domain.status,
      account_id: domain.accountId || null,
      transaction_id: domain.transactionId || null,
      created_at: domain.createdAt.toISOString(),
      updated_at: domain.updatedAt.toISOString(),
    };
  }
}
