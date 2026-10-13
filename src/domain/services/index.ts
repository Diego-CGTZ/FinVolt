/**
 * DOMAIN — Services barrel
 *
 * Exports interfaces for external service contracts (adapters, parsers, etc.).
 * Concrete implementations live in src/infrastructure/adapters/.
 *
 * Future interfaces: IFinancialSourceAdapter, INotificationParser,
 * IEmailAdapter — added in US-019, US-021, US-033, etc.
 */
export * from './BalanceCalculatorService';
export * from './RawEventService';
export * from './TransactionCandidateService';
export * from './CandidateFactory';
export * from './MerchantNormalizer';
export * from './fingerprint';
export * from './duplication';
export * from './reconciliation';
export * from './lifecycle';
export * from './confidence';
export * from './categorization';
export * from './ingestion';
export * from './parsers';
export * from './statements';
export * from './csv';
export * from './xlsx';
