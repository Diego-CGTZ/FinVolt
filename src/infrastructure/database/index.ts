/**
 * INFRASTRUCTURE — Database barrel
 *
 * Concrete repository implementations backed by Supabase (US-003).
 * Future: SupabaseTransactionRepository, etc.
 */
export { SupabaseAuthRepository } from './SupabaseAuthRepository';
export { SupabaseAccountRepository } from './SupabaseAccountRepository';
// US-007
export { SupabaseCategoryRepository } from './SupabaseCategoryRepository';
