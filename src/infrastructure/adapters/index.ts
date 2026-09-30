import { FinancialSourceAdapterRegistry } from '../../domain/services/FinancialSourceAdapterRegistry';
import { AndroidNotificationAdapter } from './AndroidNotificationAdapter';
import { EmailFinancialAdapter } from './EmailFinancialAdapter';
import { PdfStatementAdapter } from './PdfStatementAdapter';
import { CsvStatementAdapter } from './CsvStatementAdapter';
import { XlsxStatementAdapter } from './XlsxStatementAdapter';

export * from './AndroidNotificationAdapter';
export * from './EmailFinancialAdapter';
export * from './PdfStatementAdapter';
export * from './CsvStatementAdapter';
export * from './XlsxStatementAdapter';

/**
 * Crea e inicializa el registro con todos los adaptadores de fuentes financieras soportados (US-019).
 */
export function createDefaultAdapterRegistry(): FinancialSourceAdapterRegistry {
  return new FinancialSourceAdapterRegistry([
    new AndroidNotificationAdapter(),
    new EmailFinancialAdapter(),
    new PdfStatementAdapter(),
    new CsvStatementAdapter(),
    new XlsxStatementAdapter(),
  ]);
}
