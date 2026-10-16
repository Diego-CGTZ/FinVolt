/**
 * ManageLoansUseCase — Caso de Uso de Administración de Préstamos y Saldos (US-049)
 *
 * Orquesta la creación de contactos, préstamos (otorgados y recibidos), registro de abonos/pagos,
 * cálculo de saldos pendientes y consolidación de resúmenes de endeudamiento y cobranza.
 */

import type {
  Loan,
  LoanPayment,
  CreateLoanInput,
  RecordLoanPaymentInput,
  LoansSummary,
} from '../../domain/models/Loan';
import { LoanNotFoundError, LoanValidationError } from '../../domain/models/Loan';
import type { Contact, CreateContactInput } from '../../domain/models/Contact';
import { ContactValidationError } from '../../domain/models/Contact';
import { LoanCalculatorService } from '../../domain/services/loans/LoanCalculatorService';
import type { ILoanRepository, LoanFilters } from '../../domain/repositories/ILoanRepository';
import type { IContactRepository } from '../../domain/repositories/IContactRepository';

export class ManageLoansUseCase {
  constructor(
    private readonly loanRepo: ILoanRepository,
    private readonly contactRepo: IContactRepository
  ) {}

  /**
   * Crea un nuevo contacto (contraparte) para préstamos y gastos compartidos
   */
  public async createContact(input: CreateContactInput): Promise<Contact> {
    if (!input.userId || typeof input.userId !== 'string' || input.userId.trim() === '') {
      throw new ContactValidationError('El contacto requiere un userId válido.');
    }

    if (!input.name || typeof input.name !== 'string' || input.name.trim() === '') {
      throw new ContactValidationError('El nombre del contacto es obligatorio.');
    }

    const now = new Date();
    const contact: Contact = {
      id: input.id ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `contact_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`),
      userId: input.userId.trim(),
      name: input.name.trim(),
      phone: input.phone ? input.phone.trim() : null,
      email: input.email ? input.email.trim() : null,
      notes: input.notes ? input.notes.trim() : null,
      createdAt: now,
      updatedAt: now,
    };

    await this.contactRepo.save(contact);
    return contact;
  }

  /**
   * Obtiene la lista de contactos de un usuario
   */
  public async getContacts(userId: string): Promise<Contact[]> {
    return this.contactRepo.findByUserId(userId.trim());
  }

  /**
   * Obtiene un contacto por su ID
   */
  public async getContactById(id: string): Promise<Contact | null> {
    return this.contactRepo.findById(id);
  }

  /**
   * Crea un nuevo préstamo validando la existencia del contacto y los invariantes de saldo
   */
  public async createLoan(input: CreateLoanInput): Promise<Loan> {
    const contact = await this.contactRepo.findById(input.contactId);
    if (!contact) {
      throw new LoanValidationError(`El contacto especificado ("${input.contactId}") no existe.`);
    }

    if (contact.userId !== input.userId) {
      throw new LoanValidationError('El contacto no pertenece al usuario especificado.');
    }

    const loan = LoanCalculatorService.createEntity(input);
    await this.loanRepo.save(loan);
    return loan;
  }

  /**
   * Obtiene un préstamo por su ID
   */
  public async getLoanById(id: string): Promise<Loan | null> {
    return this.loanRepo.findById(id);
  }

  /**
   * Obtiene todos los préstamos de un usuario aplicando filtros opcionales
   */
  public async getLoans(userId: string, filters?: LoanFilters): Promise<Loan[]> {
    return this.loanRepo.findByUserId(userId.trim(), filters);
  }

  /**
   * Registra un pago/abono a un préstamo asegurando la integridad de saldos y evitando sobrepagos
   */
  public async recordPayment(
    input: RecordLoanPaymentInput
  ): Promise<{ loan: Loan; payment: LoanPayment }> {
    const loan = await this.loanRepo.findById(input.loanId);
    if (!loan) {
      throw new LoanNotFoundError(input.loanId);
    }

    if (loan.userId !== input.userId) {
      throw new LoanValidationError('No está autorizado para registrar pagos en este préstamo.');
    }

    const { updatedLoan, payment } = LoanCalculatorService.addPayment(loan, input);

    await this.loanRepo.savePayment(payment);
    await this.loanRepo.save(updatedLoan);

    return { loan: updatedLoan, payment };
  }

  /**
   * Genera el resumen consolidado de préstamos y deudas activas/liquidadas
   */
  public async getLoansSummary(userId: string): Promise<LoansSummary> {
    const loans = await this.loanRepo.findByUserId(userId.trim());
    return LoanCalculatorService.calculateSummary(userId.trim(), loans);
  }

  /**
   * Elimina un préstamo
   */
  public async deleteLoan(id: string): Promise<void> {
    await this.loanRepo.delete(id);
  }
}
