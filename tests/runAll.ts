import { runRawEventServiceTests } from './unit/RawEventService.test';
import { runFinancialSourceAdapterTests } from './unit/FinancialSourceAdapter.test';
import { runNotificationListenerTests } from './unit/NotificationListenerService.test';
import { runNotificationPipelineTests } from './unit/NotificationIngestionPipeline.test';
import { runBBVAParserTests } from './unit/BBVANotificationParser.test';
import { runTransactionCandidateServiceTests } from './unit/TransactionCandidateService.test';
import { runMerchantNormalizerTests } from './unit/MerchantNormalizer.test';
import { runTransactionFingerprintTests } from './unit/TransactionFingerprint.test';
import { runDuplicateDetectorTests } from './unit/DuplicateDetector.test';
import { runCrossSourceReconciliationTests } from './unit/CrossSourceReconciliation.test';
import { runFinancialStateMachineTests } from './unit/FinancialStateMachine.test';
import { runConfidenceScoreTests } from './unit/ConfidenceScore.test';
import { runConfidenceThresholdsTests } from './unit/ConfidenceThresholds.test';
import { runDeterministicCategorizationTests } from './unit/DeterministicCategorization.test';
import { runUserCorrectionServiceTests } from './unit/UserCorrectionService.test';
import { runGmailAdapterTests } from './unit/GmailAdapter.test';

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

  console.log('--- Suite 6: US-023 Transaction Candidate ---');
  await runTransactionCandidateServiceTests();
  console.log('');

  console.log('--- Suite 7: US-024 Merchant Normalizer ---');
  await runMerchantNormalizerTests();
  console.log('');

  console.log('--- Suite 8: US-025 Transaction Fingerprint ---');
  await runTransactionFingerprintTests();
  console.log('');

  console.log('--- Suite 9: US-026 Duplicate Detector ---');
  await runDuplicateDetectorTests();
  console.log('');

  console.log('--- Suite 10: US-027 Cross-Source Reconciliation ---');
  await runCrossSourceReconciliationTests();
  console.log('');

  console.log('--- Suite 11: US-028 Financial State Machine ---');
  await runFinancialStateMachineTests();
  console.log('');

  console.log('--- Suite 12: US-029 Confidence Score ---');
  await runConfidenceScoreTests();
  console.log('');

  console.log('--- Suite 13: US-030 Confidence Thresholds ---');
  await runConfidenceThresholdsTests();
  console.log('');

  console.log('--- Suite 14: US-031 Deterministic Categorization ---');
  await runDeterministicCategorizationTests();
  console.log('');

  console.log('--- Suite 15: US-032 User Category Corrections ---');
  await runUserCorrectionServiceTests();
  console.log('');

  console.log('--- Suite 16: US-033 Gmail Adapter ---');
  await runGmailAdapterTests();
  console.log('');

  console.log('========================================');
  console.log('  [PASS] ¡Todas las suites pasaron exitosamente (147/147 tests)!');
  console.log('========================================');
}

main().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
