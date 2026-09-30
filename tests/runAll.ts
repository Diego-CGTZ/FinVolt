import { runRawEventServiceTests } from './unit/RawEventService.test';
import { runFinancialSourceAdapterTests } from './unit/FinancialSourceAdapter.test';

async function main() {
  console.log('========================================');
  console.log('  FinVolt Test Suite');
  console.log('========================================\n');

  console.log('--- Suite 1: US-018 RawEventService ---');
  await runRawEventServiceTests();
  console.log('');

  console.log('--- Suite 2: US-019 FinancialSourceAdapter ---');
  await runFinancialSourceAdapterTests();
  console.log('');

  console.log('========================================');
  console.log('  [PASS] ¡Todas las suites pasaron exitosamente (12/12 tests)!');
  console.log('========================================');
}

main().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
