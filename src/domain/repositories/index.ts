/**
 * DOMAIN — Repositories barrel
 *
 * Exports repository interfaces. Repositories define *what* data operations
 * are available, without specifying *how* they are implemented.
 * Concrete implementations live in src/infrastructure/database/.
 *
 * Future interfaces: IAccountRepository, ITransactionRepository,
 * IBudgetRepository, ILoanRepository — added per their Issues.
 */
export type { AuthUser, AuthState, IAuthRepository } from './IAuthRepository';
