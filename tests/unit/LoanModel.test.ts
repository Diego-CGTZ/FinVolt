/**
 * LoanModel.test.ts — Suite de pruebas para US-049: Modelo de Préstamos
 *
 * Criterios de Aceptación (AC):
 * - User, Contact, Loan, Amount, Payments y Outstanding Balance.
 * - Integridad de saldos estricta y prevención de sobrepagos.
 *
 * Dependencias: US-008
 */

import assert from 'node:assert/strict';
import type { Contact, CreateContactInput } from '../../src/domain/models/Contact';
import { ContactValidationError } from '../../src/domain/models/Contact';
import type {
  Loan,
  CreateLoanInput,
  RecordLoanPaymentInput,
} from '../../src/domain/models/Loan';
import {
  LoanValidationError,
  LoanOverpaymentError,
  LoanNotFoundError,
} from '../../src/domain/models/Loan';
import { LoanCalculatorService } from '../../src/domain/services/loans/LoanCalculatorService';
import { AsyncStorageContactRepository } from '../../src/infrastructure/database/AsyncStorageContactRepository';
import { AsyncStorageLoanRepository } from '../../src/infrastructure/database/AsyncStorageLoanRepository';
import {
  ContactDatabaseMapper,
  type ContactDatabaseRow,
} from '../../src/infrastructure/database/mappers/ContactDatabaseMapper';
import {
  LoanDatabaseMapper,
  type LoanDatabaseRow,
  type LoanPaymentDatabaseRow,
} from '../../src/infrastructure/database/mappers/LoanDatabaseMapper';
import { ManageLoansUseCase } from '../../src/application/useCases/ManageLoansUseCase';

export async function runLoanModelTests(): Promise<void> {
  console.log('[TEST] Iniciando pruebas de US-049: Modelo de Préstamos...\n');

  const userId = 'user-us049-test';
  const otherUserId = 'user-us049-other';

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Creación y Validación de Contactos
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[TEST 1] Creación y validación del modelo Contact');
  {
    const contactInput: CreateContactInput = {
      userId,
      name: 'Carlos Mendoza',
      phone: '+52 55 1234 5678',
      email: 'carlos@example.com',
      notes: 'Compañero de trabajo',
    };

    const contactRepo = new AsyncStorageContactRepository();
    await contactRepo.clear();
    const loanRepo = new AsyncStorageLoanRepository();
    await loanRepo.clear();
    const useCase = new ManageLoansUseCase(loanRepo, contactRepo);

    const contact = await useCase.createContact(contactInput);

    assert.equal(contact.userId, userId);
    assert.equal(contact.name, 'Carlos Mendoza');
    assert.equal(contact.phone, '+52 55 1234 5678');
    assert.equal(contact.email, 'carlos@example.com');
    assert.equal(contact.notes, 'Compañero de trabajo');
    assert.ok(contact.id);
    assert.ok(contact.createdAt instanceof Date);

    // Validación de nombre vacío
    await assert.rejects(
      async () => useCase.createContact({ userId, name: '   ' }),
      ContactValidationError
    );

    // Validación de userId vacío
    await assert.rejects(
      async () => useCase.createContact({ userId: '', name: 'Valeria' }),
      ContactValidationError
    );

    console.log('  [OK] Entidad Contact creada y validaciones de atributos superadas');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Creación de Préstamo con Invariantes Iniciales (LENT y BORROWED)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 2] Creación de Préstamos LENT y BORROWED con cálculo inicial');
  {
    const lentInput: CreateLoanInput = {
      userId,
      contactId: 'contact-001',
      type: 'LENT',
      amountMinor: 150000, // $1,500.00
      currency: 'MXN',
      description: 'Préstamo para reparación de laptop',
      dueDate: new Date('2026-11-15'),
    };

    const loanLent = LoanCalculatorService.createEntity(lentInput);

    assert.equal(loanLent.userId, userId);
    assert.equal(loanLent.contactId, 'contact-001');
    assert.equal(loanLent.type, 'LENT');
    assert.equal(loanLent.amountMinor, 150000);
    assert.equal(loanLent.amount, 1500.0);
    assert.equal(loanLent.paidAmountMinor, 0);
    assert.equal(loanLent.paidAmount, 0.0);
    assert.equal(loanLent.outstandingBalanceMinor, 150000);
    assert.equal(loanLent.outstandingBalance, 1500.0);
    assert.equal(loanLent.status, 'ACTIVE');
    assert.equal(loanLent.currency, 'MXN');
    assert.equal(loanLent.payments.length, 0);

    const borrowedInput: CreateLoanInput = {
      userId,
      contactId: 'contact-002',
      type: 'BORROWED',
      amountMinor: 80000, // $800.00
      description: 'Deuda por cena compartida',
    };

    const loanBorrowed = LoanCalculatorService.createEntity(borrowedInput);

    assert.equal(loanBorrowed.type, 'BORROWED');
    assert.equal(loanBorrowed.amountMinor, 80000);
    assert.equal(loanBorrowed.amount, 800.0);
    assert.equal(loanBorrowed.outstandingBalanceMinor, 80000);
    assert.equal(loanBorrowed.status, 'ACTIVE');

    console.log('  [OK] Préstamos LENT y BORROWED creados con saldos e invariantes intactos');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Validación de Montos en Unidades Menores (Centavos Enteros Positivos)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 3] Restricción de montos en centavos enteros y positivos');
  {
    const baseInput: CreateLoanInput = {
      userId,
      contactId: 'contact-001',
      type: 'LENT',
      amountMinor: 0,
      description: 'Test monto cero',
    };

    // Monto cero
    assert.throws(
      () => LoanCalculatorService.createEntity(baseInput),
      /El monto del préstamo debe ser un entero positivo/
    );

    // Monto negativo
    assert.throws(
      () => LoanCalculatorService.createEntity({ ...baseInput, amountMinor: -5000 }),
      /El monto del préstamo debe ser un entero positivo/
    );

    // Monto con decimales no admitidos en minor units
    assert.throws(
      () => LoanCalculatorService.createEntity({ ...baseInput, amountMinor: 100.5 }),
      /El monto del préstamo debe ser un entero positivo/
    );

    console.log('  [OK] Validaciones de montos en minor units aplicadas con rigor');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Validación de Tipo y Descripción
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 4] Validación de tipo de préstamo y descripción obligatoria');
  {
    assert.throws(
      () =>
        LoanCalculatorService.createEntity({
          userId,
          contactId: 'contact-001',
          type: 'INVALID_TYPE' as any,
          amountMinor: 10000,
          description: 'Test',
        }),
      /Tipo de préstamo inválido/
    );

    assert.throws(
      () =>
        LoanCalculatorService.createEntity({
          userId,
          contactId: 'contact-001',
          type: 'LENT',
          amountMinor: 10000,
          description: '   ',
        }),
      /La descripción del préstamo es obligatoria/
    );

    console.log('  [OK] Validaciones de tipos y descripciones garantizadas');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Registro de Abono Parcial (Disminución de Saldo e Integridad)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 5] Registro de abono parcial y disminución de saldo pendiente');
  {
    const initialLoan = LoanCalculatorService.createEntity({
      userId,
      contactId: 'contact-001',
      type: 'LENT',
      amountMinor: 100000, // $1,000.00
      description: 'Préstamo $1000',
    });

    const paymentInput: RecordLoanPaymentInput = {
      loanId: initialLoan.id,
      userId,
      amountMinor: 40000, // $400.00
      notes: 'Primer abono en efectivo',
    };

    const { updatedLoan, payment } = LoanCalculatorService.addPayment(initialLoan, paymentInput);

    assert.equal(payment.amountMinor, 40000);
    assert.equal(payment.amount, 400.0);
    assert.equal(payment.loanId, initialLoan.id);
    assert.equal(payment.notes, 'Primer abono en efectivo');

    assert.equal(updatedLoan.paidAmountMinor, 40000);
    assert.equal(updatedLoan.paidAmount, 400.0);
    assert.equal(updatedLoan.outstandingBalanceMinor, 60000);
    assert.equal(updatedLoan.outstandingBalance, 600.0);
    assert.equal(updatedLoan.status, 'ACTIVE');
    assert.equal(updatedLoan.payments.length, 1);

    console.log('  [OK] Saldo disminuyó exactamente a $600.00 y estado se mantuvo ACTIVE');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Liquidación Total de Préstamo (Transición a PAID al Saldo 0)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 6] Liquidación total y transición automática a PAID');
  {
    const initialLoan = LoanCalculatorService.createEntity({
      userId,
      contactId: 'contact-001',
      type: 'BORROWED',
      amountMinor: 50000, // $500.00
      description: 'Deuda $500',
    });

    // Abono 1: $300.00
    const step1 = LoanCalculatorService.addPayment(initialLoan, {
      loanId: initialLoan.id,
      userId,
      amountMinor: 30000,
    });
    assert.equal(step1.updatedLoan.outstandingBalanceMinor, 20000);
    assert.equal(step1.updatedLoan.status, 'ACTIVE');

    // Abono 2: $200.00 (Liquidación completa)
    const step2 = LoanCalculatorService.addPayment(step1.updatedLoan, {
      loanId: initialLoan.id,
      userId,
      amountMinor: 20000,
    });

    assert.equal(step2.updatedLoan.paidAmountMinor, 50000);
    assert.equal(step2.updatedLoan.paidAmount, 500.0);
    assert.equal(step2.updatedLoan.outstandingBalanceMinor, 0);
    assert.equal(step2.updatedLoan.outstandingBalance, 0.0);
    assert.equal(step2.updatedLoan.status, 'PAID');
    assert.equal(step2.updatedLoan.payments.length, 2);

    console.log('  [OK] Préstamo transicionó de ACTIVE a PAID al completarse el saldo a $0.00');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 7: Prevención de Sobrepagos (LoanOverpaymentError)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 7] Prevención de sobrepagos e intercepción con LoanOverpaymentError');
  {
    const initialLoan = LoanCalculatorService.createEntity({
      userId,
      contactId: 'contact-001',
      type: 'LENT',
      amountMinor: 30000, // $300.00 saldo pendiente
      description: 'Préstamo $300',
    });

    // Intento de abonar $350.00 cuando solo restan $300.00
    assert.throws(
      () =>
        LoanCalculatorService.addPayment(initialLoan, {
          loanId: initialLoan.id,
          userId,
          amountMinor: 35000,
        }),
      (err: any) => {
        assert.ok(err instanceof LoanOverpaymentError);
        assert.equal(err.remainingMinor, 30000);
        assert.equal(err.attemptedMinor, 35000);
        return true;
      }
    );

    // Verificar que el préstamo original no sufrió mutaciones indeseadas
    assert.equal(initialLoan.paidAmountMinor, 0);
    assert.equal(initialLoan.outstandingBalanceMinor, 30000);

    console.log('  [OK] Sobrepago interceptado con LoanOverpaymentError y estado preservado');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 8: Rechazo de Pagos en Préstamos Cancelados
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 8] Rechazo de pagos en préstamos con estado CANCELLED');
  {
    const cancelledLoan: Loan = {
      ...LoanCalculatorService.createEntity({
        userId,
        contactId: 'contact-001',
        type: 'LENT',
        amountMinor: 20000,
        description: 'Préstamo cancelado',
      }),
      status: 'CANCELLED',
    };

    assert.throws(
      () =>
        LoanCalculatorService.addPayment(cancelledLoan, {
          loanId: cancelledLoan.id,
          userId,
          amountMinor: 5000,
        }),
      LoanValidationError
    );

    console.log('  [OK] Pagos a préstamos cancelados rechazados');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 9: Recalculación Íntegra desde Historial de Pagos
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 9] Recalculación integral a partir de lista de abonos');
  {
    const baseLoan = LoanCalculatorService.createEntity({
      userId,
      contactId: 'contact-001',
      type: 'LENT',
      amountMinor: 100000, // $1,000.00
      description: 'Préstamo para reconstruir',
    });

    const payment1 = {
      id: 'pay-1',
      loanId: baseLoan.id,
      userId,
      amountMinor: 30000,
      amount: 300.0,
      paymentDate: new Date('2026-10-01'),
      createdAt: new Date(),
    };

    const payment2 = {
      id: 'pay-2',
      loanId: baseLoan.id,
      userId,
      amountMinor: 70000,
      amount: 700.0,
      paymentDate: new Date('2026-10-05'),
      createdAt: new Date(),
    };

    const recalculated = LoanCalculatorService.recalculateFromPayments(baseLoan, [payment2, payment1]);

    assert.equal(recalculated.paidAmountMinor, 100000);
    assert.equal(recalculated.outstandingBalanceMinor, 0);
    assert.equal(recalculated.status, 'PAID');
    // Orden cronológico verificado
    assert.equal(recalculated.payments[0].id, 'pay-1');
    assert.equal(recalculated.payments[1].id, 'pay-2');

    console.log('  [OK] Recalculación y ordenamiento cronológico validados');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 10: Precisión Aritmética en Centavos sin Drift Flotante
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 10] Precisión aritmética en minor units sin residuos de coma flotante');
  {
    const loan = LoanCalculatorService.createEntity({
      userId,
      contactId: 'contact-001',
      type: 'LENT',
      amountMinor: 10010, // $100.10
      description: 'Test centavos',
    });

    const step1 = LoanCalculatorService.addPayment(loan, {
      loanId: loan.id,
      userId,
      amountMinor: 3333, // $33.33
    });
    assert.equal(step1.updatedLoan.outstandingBalanceMinor, 6677);
    assert.equal(step1.updatedLoan.outstandingBalance, 66.77);

    const step2 = LoanCalculatorService.addPayment(step1.updatedLoan, {
      loanId: loan.id,
      userId,
      amountMinor: 3333, // $33.33
    });
    assert.equal(step2.updatedLoan.outstandingBalanceMinor, 3344);
    assert.equal(step2.updatedLoan.outstandingBalance, 33.44);

    const step3 = LoanCalculatorService.addPayment(step2.updatedLoan, {
      loanId: loan.id,
      userId,
      amountMinor: 3344, // $33.44
    });
    assert.equal(step3.updatedLoan.outstandingBalanceMinor, 0);
    assert.equal(step3.updatedLoan.outstandingBalance, 0.0);
    assert.equal(step3.updatedLoan.status, 'PAID');

    console.log('  [OK] Sumas fraccionarias repetidas completaron a exactamente 0 centavos');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 11: Resumen Financiero Consolidado (calculateSummary)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 11] Resumen financiero consolidado con métricas de endeudamiento y cobranza');
  {
    const loan1: Loan = {
      ...LoanCalculatorService.createEntity({
        userId,
        contactId: 'c1',
        type: 'LENT',
        amountMinor: 50000, // $500.00
        description: 'Lent activo',
      }),
      paidAmountMinor: 10000,
      paidAmount: 100.0,
      outstandingBalanceMinor: 40000,
      outstandingBalance: 400.0,
      status: 'ACTIVE',
    };

    const loan2: Loan = {
      ...LoanCalculatorService.createEntity({
        userId,
        contactId: 'c2',
        type: 'LENT',
        amountMinor: 20000, // $200.00
        description: 'Lent pagado',
      }),
      paidAmountMinor: 20000,
      paidAmount: 200.0,
      outstandingBalanceMinor: 0,
      outstandingBalance: 0.0,
      status: 'PAID',
    };

    const loan3: Loan = {
      ...LoanCalculatorService.createEntity({
        userId,
        contactId: 'c3',
        type: 'BORROWED',
        amountMinor: 30000, // $300.00
        description: 'Borrowed activo',
      }),
      paidAmountMinor: 5000,
      paidAmount: 50.0,
      outstandingBalanceMinor: 25000,
      outstandingBalance: 250.0,
      status: 'ACTIVE',
    };

    const summary = LoanCalculatorService.calculateSummary(userId, [loan1, loan2, loan3]);

    assert.equal(summary.userId, userId);
    assert.equal(summary.totalLentMinor, 70000);
    assert.equal(summary.totalLent, 700.0);
    assert.equal(summary.outstandingLentMinor, 40000);
    assert.equal(summary.outstandingLent, 400.0);

    assert.equal(summary.totalBorrowedMinor, 30000);
    assert.equal(summary.totalBorrowed, 300.0);
    assert.equal(summary.outstandingBorrowedMinor, 25000);
    assert.equal(summary.outstandingBorrowed, 250.0);

    assert.equal(summary.activeLentCount, 1);
    assert.equal(summary.activeBorrowedCount, 1);
    assert.equal(summary.paidLoansCount, 1);

    console.log('  [OK] Métricas consolidadas calculadas con absoluta precisión');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 12: Mapeadores Bidireccionales de Base de Datos
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 12] Mapeadores bidireccionales ContactDatabaseMapper y LoanDatabaseMapper');
  {
    const contact: Contact = {
      id: 'contact-uuid-1',
      userId,
      name: 'Elena Ramos',
      phone: '555-0199',
      email: 'elena@test.com',
      notes: 'Notas de contacto',
      createdAt: new Date('2026-10-01T10:00:00Z'),
      updatedAt: new Date('2026-10-02T10:00:00Z'),
    };

    const contactRow = ContactDatabaseMapper.mapToDatabase(contact);
    assert.equal(contactRow.name, 'Elena Ramos');
    assert.equal(contactRow.user_id, userId);

    const mappedContact = ContactDatabaseMapper.mapToDomain(contactRow);
    assert.equal(mappedContact.id, contact.id);
    assert.equal(mappedContact.name, contact.name);
    assert.equal(mappedContact.createdAt.getTime(), contact.createdAt.getTime());

    const loan = LoanCalculatorService.createEntity({
      userId,
      contactId: contact.id,
      type: 'LENT',
      amountMinor: 45000,
      description: 'Mapeo DB test',
    });

    const payment = {
      id: 'pay-uuid-1',
      loanId: loan.id,
      userId,
      amountMinor: 15000,
      amount: 150.0,
      paymentDate: new Date('2026-10-05T12:00:00Z'),
      notes: 'Abono mapper',
      transactionId: 'tx-001',
      createdAt: new Date('2026-10-05T12:00:00Z'),
    };

    const payRow = LoanDatabaseMapper.mapPaymentToDatabase(payment);
    assert.equal(payRow.amount_minor, 15000);
    assert.equal(payRow.notes, 'Abono mapper');

    const mappedPayment = LoanDatabaseMapper.mapPaymentToDomain(payRow);
    assert.equal(mappedPayment.id, payment.id);
    assert.equal(mappedPayment.amountMinor, 15000);
    assert.equal(mappedPayment.amount, 150.0);

    const loanRow = LoanDatabaseMapper.mapLoanToDatabase(loan);
    assert.equal(loanRow.amount_minor, 45000);
    assert.equal(loanRow.status, 'ACTIVE');

    const mappedLoan = LoanDatabaseMapper.mapLoanToDomain(loanRow, [mappedPayment]);
    assert.equal(mappedLoan.id, loan.id);
    assert.equal(mappedLoan.amountMinor, 45000);
    assert.equal(mappedLoan.payments.length, 1);
    assert.equal(mappedLoan.payments[0].id, payment.id);

    console.log('  [OK] Mapeadores bidireccionales validados al 100%');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 13: Repositorios Locales (AsyncStorageLoanRepository y AsyncStorageContactRepository)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 13] Operaciones CRUD y filtros en Repositorios Locales');
  {
    const contactRepo = new AsyncStorageContactRepository();
    await contactRepo.clear();

    const loanRepo = new AsyncStorageLoanRepository();
    await loanRepo.clear();

    const contact: Contact = {
      id: 'contact-repo-1',
      userId,
      name: 'Roberto Gómez',
      phone: null,
      email: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await contactRepo.save(contact);

    const foundContact = await contactRepo.findById(contact.id);
    assert.ok(foundContact);
    assert.equal(foundContact.name, 'Roberto Gómez');

    const loan1 = LoanCalculatorService.createEntity({
      userId,
      contactId: contact.id,
      type: 'LENT',
      amountMinor: 80000,
      description: 'Préstamo repo 1',
    });
    const loan2 = LoanCalculatorService.createEntity({
      userId,
      contactId: contact.id,
      type: 'BORROWED',
      amountMinor: 25000,
      description: 'Deuda repo 2',
    });
    const otherUserLoan = LoanCalculatorService.createEntity({
      userId: otherUserId,
      contactId: 'contact-other',
      type: 'LENT',
      amountMinor: 10000,
      description: 'Aislamiento otro usuario',
    });

    await loanRepo.save(loan1);
    await loanRepo.save(loan2);
    await loanRepo.save(otherUserLoan);

    // Filtro por usuario (aislamiento)
    const userLoans = await loanRepo.findByUserId(userId);
    assert.equal(userLoans.length, 2);

    // Filtro por tipo
    const lentLoans = await loanRepo.findByUserId(userId, { type: 'LENT' });
    assert.equal(lentLoans.length, 1);
    assert.equal(lentLoans[0].id, loan1.id);

    // Abono y persistencia de pago
    const { updatedLoan, payment } = LoanCalculatorService.addPayment(loan1, {
      loanId: loan1.id,
      userId,
      amountMinor: 30000,
      notes: 'Pago repo',
    });
    await loanRepo.savePayment(payment);
    await loanRepo.save(updatedLoan);

    const reloaded = await loanRepo.findById(loan1.id);
    assert.ok(reloaded);
    assert.equal(reloaded.paidAmountMinor, 30000);
    assert.equal(reloaded.outstandingBalanceMinor, 50000);
    assert.equal(reloaded.payments.length, 1);

    // Borrado
    await loanRepo.delete(loan2.id);
    const afterDelete = await loanRepo.findById(loan2.id);
    assert.equal(afterDelete, null);

    console.log('  [OK] Repositorios locales con aislamiento y CRUD verificados con éxito');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 14: Orquestación Integral E2E en ManageLoansUseCase
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[TEST 14] Orquestación Integral E2E en ManageLoansUseCase');
  {
    const contactRepo = new AsyncStorageContactRepository();
    await contactRepo.clear();
    const loanRepo = new AsyncStorageLoanRepository();
    await loanRepo.clear();

    const useCase = new ManageLoansUseCase(loanRepo, contactRepo);

    // 1. Crear Contacto
    const contact = await useCase.createContact({
      userId,
      name: 'Mariana Silva',
      phone: '+52 81 9988 7766',
    });

    // 2. Intentar crear préstamo con contacto inexistente
    await assert.rejects(
      async () =>
        useCase.createLoan({
          userId,
          contactId: 'non-existent-contact',
          type: 'LENT',
          amountMinor: 50000,
          description: 'Fallo esperado',
        }),
      LoanValidationError
    );

    // 3. Crear Préstamo válido
    const loan = await useCase.createLoan({
      userId,
      contactId: contact.id,
      type: 'LENT',
      amountMinor: 100000, // $1,000.00
      description: 'Préstamo viaje',
    });
    assert.equal(loan.outstandingBalanceMinor, 100000);

    // 4. Registrar Abono Parcial 1: $600.00
    const step1 = await useCase.recordPayment({
      loanId: loan.id,
      userId,
      amountMinor: 60000,
      notes: 'Transferencia bancaria SPEI',
    });
    assert.equal(step1.loan.outstandingBalanceMinor, 40000);
    assert.equal(step1.loan.status, 'ACTIVE');

    // 5. Registrar Abono Final 2: $400.00
    const step2 = await useCase.recordPayment({
      loanId: loan.id,
      userId,
      amountMinor: 40000,
      notes: 'Efectivo',
    });
    assert.equal(step2.loan.outstandingBalanceMinor, 0);
    assert.equal(step2.loan.status, 'PAID');

    // 6. Resumen financiero actualizado
    const summary = await useCase.getLoansSummary(userId);
    assert.equal(summary.totalLentMinor, 100000);
    assert.equal(summary.outstandingLentMinor, 0);
    assert.equal(summary.activeLentCount, 0);
    assert.equal(summary.paidLoansCount, 1);

    console.log('  [OK] Flujo E2E completo ejecutado y validado sin fisuras');
  }

  console.log('\n========================================');
  console.log('  [RESULTADO] Todas las pruebas de US-049 pasaron exitosamente (14/14).');
  console.log('========================================\n');
}
