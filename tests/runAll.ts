import { runRawEventServiceTests } from './unit/RawEventService.test';
import { runFinancialSourceAdapterTests } from './unit/FinancialSourceAdapter.test';
import { runNotificationListenerTests } from './unit/NotificationListenerService.test';
import { runNotificationPipelineTests } from './unit/NotificationIngestionPipeline.test';
import { runBBVAParserTests } from './unit/BBVANotificationParser.test';

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

  console.log('--- Suite 3: US-020 NotificationListenerService ---');
  await runNotificationListenerTests();
  console.log('');

  console.log('--- Suite 4: US-021 Notification Ingestion Pipeline ---');
  await runNotificationPipelineTests();
  console.log('');

  console.log('--- Suite 5: US-022 Parser BBVA ---');
  await runBBVAParserTests();
  console.log('');

  console.log('========================================');
  console.log('  [PASS] ¡Todas las suites pasaron exitosamente (33/33 tests)!');
  console.log('========================================');
}

main().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
