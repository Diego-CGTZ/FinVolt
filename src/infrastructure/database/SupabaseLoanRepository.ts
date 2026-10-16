/**
 * SupabaseLoanRepository — Repositorio Supabase de Préstamos y Pagos (US-049)
 *
 * Implementa ILoanRepository interactuando con las tablas `loans` y `loan_payments`
 * en Supabase bajo Row Level Security (RLS) por user_id.
 */

import { supabase } from '../api/supabaseClient';
import type { ILoanRepository, LoanFilters } from '../../domain/repositories/ILoanRepository';
import type { Loan, LoanPayment } from '../../domain/models/Loan';
import {
  LoanDatabaseMapper,
  type LoanDatabaseRow,
  type LoanPaymentDatabaseRow,
} from './mappers/LoanDatabaseMapper';

export { LoanDatabaseMapper, type LoanDatabaseRow, type LoanPaymentDatabaseRow };

export class SupabaseLoanRepository implements ILoanRepository {
  public async save(loan: Loan): Promise<void> {
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id || loan.userId;

    const row = LoanDatabaseMapper.mapLoanToDatabase({
      ...loan,
      userId: currentUserId,
      updatedAt: new Date(),
    });

    const { error } = await supabase
      .from('loans')
      .upsert(row, { onConflict: 'id' });

    if (error) throw error;
  }

  public async findById(id: string): Promise<Loan | null> {
    const { data: loanRow, error } = await supabase
      .from('loans')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!loanRow) return null;

    const payments = await this.findPaymentsByLoanId(id);
    return LoanDatabaseMapper.mapLoanToDomain(loanRow as LoanDatabaseRow, payments);
  }

  public async findByUserId(userId: string, filters?: LoanFilters): Promise<Loan[]> {
    let query = supabase
      .from('loans')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (filters?.contactId) {
      query = query.eq('contact_id', filters.contactId);
    }
    if (filters?.type) {
      query = query.eq('type', filters.type);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const { data: rows, error } = await query;
    if (error) throw error;
    if (!rows || rows.length === 0) return [];

    const loanIds = rows.map((r: LoanDatabaseRow) => r.id);
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('loan_payments')
      .select('*')
      .in('loan_id', loanIds)
      .order('payment_date', { ascending: true });

    if (paymentsError) throw paymentsError;

    const paymentsByLoan = new Map<string, LoanPayment[]>();
    for (const p of (paymentsData || []) as LoanPaymentDatabaseRow[]) {
      const payment = LoanDatabaseMapper.mapPaymentToDomain(p);
      const list = paymentsByLoan.get(payment.loanId) || [];
      list.push(payment);
      paymentsByLoan.set(payment.loanId, list);
    }

    return rows.map((r: LoanDatabaseRow) =>
      LoanDatabaseMapper.mapLoanToDomain(r, paymentsByLoan.get(r.id) || [])
    );
  }

  public async findByContactId(userId: string, contactId: string): Promise<Loan[]> {
    return this.findByUserId(userId, { contactId });
  }

  public async savePayment(payment: LoanPayment): Promise<void> {
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id || payment.userId;

    const row = LoanDatabaseMapper.mapPaymentToDatabase({
      ...payment,
      userId: currentUserId,
    });

    const { error } = await supabase
      .from('loan_payments')
      .upsert(row, { onConflict: 'id' });

    if (error) throw error;
  }

  public async findPaymentsByLoanId(loanId: string): Promise<LoanPayment[]> {
    const { data, error } = await supabase
      .from('loan_payments')
      .select('*')
      .eq('loan_id', loanId)
      .order('payment_date', { ascending: true });

    if (error) throw error;
    return (data || []).map((row: LoanPaymentDatabaseRow) =>
      LoanDatabaseMapper.mapPaymentToDomain(row)
    );
  }

  public async delete(id: string): Promise<void> {
    const { error } = await supabase.from('loans').delete().eq('id', id);
    if (error) throw error;
  }

  public async clear(): Promise<void> {
    const { error } = await supabase.from('loans').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
  }
}
