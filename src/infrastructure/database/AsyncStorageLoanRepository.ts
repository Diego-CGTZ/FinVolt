/**
 * AsyncStorageLoanRepository — Repositorio Local de Préstamos (US-049)
 *
 * Implementa ILoanRepository utilizando AsyncStorage con respaldo en memoria
 * para operaciones atómicas, rápidas y persistentes de préstamos y abonos.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ILoanRepository, LoanFilters } from '../../domain/repositories/ILoanRepository';
import type { Loan, LoanPayment } from '../../domain/models/Loan';

interface StoredPayment extends Omit<LoanPayment, 'paymentDate' | 'createdAt'> {
  paymentDate: string;
  createdAt: string;
}

interface StoredLoan extends Omit<Loan, 'dueDate' | 'createdAt' | 'updatedAt' | 'payments'> {
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  payments: StoredPayment[];
}

export class AsyncStorageLoanRepository implements ILoanRepository {
  private static readonly STORAGE_KEY = '@finvolt_loans';
  private inMemoryCache: Map<string, Loan> = new Map();
  private isLoaded: boolean = false;

  constructor() {
    this.loadFromStorage();
  }

  public async save(loan: Loan): Promise<void> {
    await this.ensureLoaded();
    const updated: Loan = {
      ...loan,
      updatedAt: new Date(),
    };
    this.inMemoryCache.set(updated.id, updated);
    await this.persistToStorage();
  }

  public async findById(id: string): Promise<Loan | null> {
    await this.ensureLoaded();
    return this.inMemoryCache.get(id) || null;
  }

  public async findByUserId(userId: string, filters?: LoanFilters): Promise<Loan[]> {
    await this.ensureLoaded();
    const result: Loan[] = [];

    for (const loan of this.inMemoryCache.values()) {
      if (loan.userId !== userId) continue;

      if (filters?.contactId && loan.contactId !== filters.contactId) continue;
      if (filters?.type && loan.type !== filters.type) continue;
      if (filters?.status && loan.status !== filters.status) continue;

      result.push(loan);
    }

    return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  public async findByContactId(userId: string, contactId: string): Promise<Loan[]> {
    return this.findByUserId(userId, { contactId });
  }

  public async savePayment(payment: LoanPayment): Promise<void> {
    await this.ensureLoaded();
    const loan = this.inMemoryCache.get(payment.loanId);
    if (!loan) return;

    // Agregar el pago al préstamo si aún no está presente
    const exists = loan.payments.some((p) => p.id === payment.id);
    const updatedPayments = exists
      ? loan.payments.map((p) => (p.id === payment.id ? payment : p))
      : [...loan.payments, payment];

    loan.payments = updatedPayments.sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime());
    loan.updatedAt = new Date();
    this.inMemoryCache.set(loan.id, loan);
    await this.persistToStorage();
  }

  public async findPaymentsByLoanId(loanId: string): Promise<LoanPayment[]> {
    await this.ensureLoaded();
    const loan = this.inMemoryCache.get(loanId);
    return loan ? [...loan.payments] : [];
  }

  public async delete(id: string): Promise<void> {
    await this.ensureLoaded();
    this.inMemoryCache.delete(id);
    await this.persistToStorage();
  }

  public async clear(): Promise<void> {
    this.inMemoryCache.clear();
    this.isLoaded = true;
    try {
      await AsyncStorage.removeItem(AsyncStorageLoanRepository.STORAGE_KEY);
    } catch {
      // Ignorar en pruebas sin AsyncStorage
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.isLoaded) {
      await this.loadFromStorage();
    }
  }

  private async loadFromStorage(): Promise<void> {
    try {
      const json = await AsyncStorage.getItem(AsyncStorageLoanRepository.STORAGE_KEY);
      if (json) {
        const parsed: StoredLoan[] = JSON.parse(json);
        this.inMemoryCache.clear();
        for (const item of parsed) {
          const payments: LoanPayment[] = (item.payments || []).map((p) => ({
            ...p,
            paymentDate: new Date(p.paymentDate),
            createdAt: new Date(p.createdAt),
          }));

          this.inMemoryCache.set(item.id, {
            ...item,
            dueDate: item.dueDate ? new Date(item.dueDate) : null,
            createdAt: new Date(item.createdAt),
            updatedAt: new Date(item.updatedAt),
            payments,
          });
        }
      }
    } catch {
      // Fallback a memoria pura
    } finally {
      this.isLoaded = true;
    }
  }

  private async persistToStorage(): Promise<void> {
    try {
      const items: StoredLoan[] = Array.from(this.inMemoryCache.values()).map((l) => ({
        ...l,
        dueDate: l.dueDate ? l.dueDate.toISOString() : null,
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString(),
        payments: l.payments.map((p) => ({
          ...p,
          paymentDate: p.paymentDate.toISOString(),
          createdAt: p.createdAt.toISOString(),
        })),
      }));

      await AsyncStorage.setItem(
        AsyncStorageLoanRepository.STORAGE_KEY,
        JSON.stringify(items)
      );
    } catch {
      // Ignorar en entorno de prueba
    }
  }
}
