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
