/**
 * APPLICATION — State barrel
 *
 * React Context providers and global state management.
 * We use Context + custom hooks as the primary state mechanism.
 *
 * Future: BudgetContext (US-046).
 */
export { AuthProvider, useAuth } from './AuthContext';
export { AccountsProvider, useAccounts } from './AccountsContext';
// US-007
export { CategoriesProvider, useCategories } from './CategoriesContext';
// US-008
export { TransactionsProvider, useTransactions } from './TransactionsContext';
