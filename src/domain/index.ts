/**
 * DOMAIN LAYER — index
 *
 * Re-exports all domain contracts (interfaces) and value objects.
 * Nothing here must import from infrastructure, application, or presentation.
 *
 * Barrel exports are added here as each sub-module exposes real types.
 */
export * from './models/RawEvent';
export * from './interfaces/FinancialSourceAdapter';
export * from './services/FinancialSourceAdapterRegistry';
export * from './services/RawEventService';
