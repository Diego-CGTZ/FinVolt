/**
 * DOMAIN — Models barrel
 *
 * Exports core domain entities. Models are plain TypeScript types/interfaces —
 * no framework dependencies. Future entities (Transaction, Budget, Loan)
 * will be added here as their respective Issues are implemented.
 */

export type { Account, AccountType } from './Account';
// US-007 — Modelo de categorías
export type { Category, CreateCategoryInput, UpdateCategoryInput } from './Category';
// US-008 — Modelo canónico de transacción
export type {
  Transaction,
  TransactionType,
  TransactionStatus,
  TransactionSource,
  CreateTransactionInput,
  UpdateTransactionInput,
} from './Transaction';
export { toDecimal, toMinorUnits } from './Transaction';
// US-018 — Modelo de eventos crudos
export type {
  RawEvent,
  RawEventSource,
  RawEventStatus,
  CreateRawEventDTO,
  UpdateRawEventStatusDTO,
} from './RawEvent';
// US-021 / US-023 — Modelo de candidatos de transacción
export type {
  TransactionCandidate,
  CandidateStatus,
  AccountHint,
  CreateCandidateDTO,
} from './TransactionCandidate';
// US-024 — Modelo de normalización de comercios
export type {
  MerchantRule,
  MerchantPatternType,
  NormalizedMerchantResult,
  CreateMerchantRuleDTO,
} from './MerchantRule';
// US-032 — Modelo de correcciones de usuario y reglas reutilizables
export * from './UserCorrection';
// US-033 — Modelo de integración y sincronización de Gmail
export * from './Gmail';
// US-035 — Modelo de integración y sincronización de Outlook
export * from './Outlook';
// US-043 — Modelo de transacciones recurrentes
export * from './RecurringTransaction';
// US-044 — Modelo de obligaciones futuras
export * from './FutureObligation';
// US-045 — Modelo de liquidez proyectada
export * from './ProjectedLiquidity';
// US-046 — Modelo de presupuestos
export * from './Budget';
// US-047 — Consumo de presupuestos
export * from './BudgetConsumption';



