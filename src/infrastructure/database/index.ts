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
// US-008
export { SupabaseTransactionRepository } from './SupabaseTransactionRepository';
// US-018
export { SupabaseRawEventRepository } from './SupabaseRawEventRepository';
// US-021 / US-023
export { InMemoryTransactionCandidateRepository } from './InMemoryTransactionCandidateRepository';
export { SupabaseTransactionCandidateRepository } from './SupabaseTransactionCandidateRepository';
// US-024
export { InMemoryMerchantRuleRepository } from './InMemoryMerchantRuleRepository';
export { SupabaseMerchantRuleRepository } from './SupabaseMerchantRuleRepository';
// US-032
export { InMemoryUserCorrectionRepository } from './InMemoryUserCorrectionRepository';
