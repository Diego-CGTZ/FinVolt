/**
 * APPLICATION — Dependency Injection container
 *
 * A lightweight DI approach using React Context to provide concrete
 * infrastructure implementations to use cases without hardcoding them.
 * No external DI library is used to avoid overengineering.
 *
 * Pattern:
 *   1. Domain defines interfaces (IAccountRepository, etc.)
 *   2. Infrastructure provides concrete classes (SupabaseAccountRepository)
 *   3. This container wires them together and exposes via Context
 *   4. Presentation layer consumes via custom hooks (useAccounts, etc.)
 *
 * Future: ServiceContainer (US-003 onwards).
 */
export {};
