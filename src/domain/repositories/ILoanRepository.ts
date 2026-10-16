/**
 * ILoanRepository — Contrato del Repositorio de Préstamos (US-049)
 *
 * Define operaciones de persistencia para préstamos y abonos con aislamiento por usuario.
 */

import type { Loan, LoanPayment, LoanType, LoanStatus } from '../models/Loan';

export interface LoanFilters {
  userId?: string;
  contactId?: string;
  type?: LoanType;
  status?: LoanStatus;
}

export interface ILoanRepository {
  /** Guarda o actualiza un préstamo */
  save(loan: Loan): Promise<void>;

  /** Busca un préstamo por su ID */
  findById(id: string): Promise<Loan | null>;

  /** Obtiene todos los préstamos de un usuario con filtros opcionales */
  findByUserId(userId: string, filters?: LoanFilters): Promise<Loan[]>;

  /** Obtiene los préstamos asociados a un contacto específico */
  findByContactId(userId: string, contactId: string): Promise<Loan[]>;

  /** Registra un abono/pago asociado a un préstamo */
  savePayment(payment: LoanPayment): Promise<void>;

  /** Obtiene todos los pagos de un préstamo */
  findPaymentsByLoanId(loanId: string): Promise<LoanPayment[]>;

  /** Elimina un préstamo y sus abonos asociados */
  delete(id: string): Promise<void>;

  /** Limpia el almacenamiento de préstamos (útil para pruebas) */
  clear(): Promise<void>;
}
