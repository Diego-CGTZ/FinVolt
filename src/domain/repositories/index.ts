/**
 * DOMAIN — Repositories barrel
 *
 * Exports repository interfaces. Repositories define *what* data operations
 * are available, without specifying *how* they are implemented.
 * Concrete implementations live in src/infrastructure/database/.
 *
 * Future interfaces: ITransactionRepository,
 * IBudgetRepository, ILoanRepository — added per their Issues.
 */
export type { AuthUser, AuthState, IAuthRepository } from './IAuthRepository';
export type { IAccountRepository } from './IAccountRepository';
// US-007 — Repositorio de categorías
export type { ICategoryRepository } from './ICategoryRepository';
