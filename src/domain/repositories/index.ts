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
// US-008 — Repositorio de transacciones
export type {
  ITransactionRepository,
  TransactionFilters,
  PaginationOptions,
} from './ITransactionRepository';
// US-018 — Repositorio de raw events
export type { IRawEventRepository, RawEventFilter } from './IRawEventRepository';
// US-023 — Repositorio de transaction candidates
export type {
  ITransactionCandidateRepository,
  CandidateFilter,
} from './ITransactionCandidateRepository';
// US-024 — Repositorio de reglas de normalización de comercios
export type { IMerchantRuleRepository, MerchantRuleFilter } from './IMerchantRuleRepository';
// US-032 — Repositorio de correcciones de usuario
export type { IUserCorrectionRepository } from './IUserCorrectionRepository';
// US-043 — Repositorio de transacciones recurrentes
export type {
  IRecurringTransactionRepository,
  RecurringTransactionFilters,
} from './IRecurringTransactionRepository';
