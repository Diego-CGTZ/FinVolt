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
