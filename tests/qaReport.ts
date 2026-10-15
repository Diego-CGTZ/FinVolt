/// <reference types="node" />
/**
 * QA Report: ejecuta cada suite de forma aislada (historia por historia) sin detenerse
 * en el primer fallo, y reporta un resumen PASS/FAIL por historia.
 *
 * Uso: npx tsx tests/qaReport.ts
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

interface SuiteDef {
  story: string;
  file: string;
  fn: string;
}

const SUITES: SuiteDef[] = [
  { story: 'US-018', file: 'RawEventService', fn: 'runRawEventServiceTests' },
  { story: 'US-019', file: 'FinancialSourceAdapter', fn: 'runFinancialSourceAdapterTests' },
  { story: 'US-020', file: 'NotificationListenerService', fn: 'runNotificationListenerTests' },
  { story: 'US-021', file: 'NotificationIngestionPipeline', fn: 'runNotificationPipelineTests' },
  { story: 'US-022', file: 'BBVANotificationParser', fn: 'runBBVAParserTests' },
  { story: 'US-023', file: 'TransactionCandidateService', fn: 'runTransactionCandidateServiceTests' },
  { story: 'US-024', file: 'MerchantNormalizer', fn: 'runMerchantNormalizerTests' },
  { story: 'US-025', file: 'TransactionFingerprint', fn: 'runTransactionFingerprintTests' },
  { story: 'US-026', file: 'DuplicateDetector', fn: 'runDuplicateDetectorTests' },
  { story: 'US-027', file: 'CrossSourceReconciliation', fn: 'runCrossSourceReconciliationTests' },
  { story: 'US-028', file: 'FinancialStateMachine', fn: 'runFinancialStateMachineTests' },
  { story: 'US-029', file: 'ConfidenceScore', fn: 'runConfidenceScoreTests' },
  { story: 'US-030', file: 'ConfidenceThresholds', fn: 'runConfidenceThresholdsTests' },
  { story: 'US-031', file: 'DeterministicCategorization', fn: 'runDeterministicCategorizationTests' },
  { story: 'US-032', file: 'UserCorrectionService', fn: 'runUserCorrectionServiceTests' },
  { story: 'US-033', file: 'GmailAdapter', fn: 'runGmailAdapterTests' },
  { story: 'US-034', file: 'FinancialEmailParser', fn: 'runFinancialEmailParserTests' },
  { story: 'US-035', file: 'OutlookAdapter', fn: 'runOutlookAdapterTests' },
  { story: 'US-036', file: 'EmailReconciliation', fn: 'runEmailReconciliationTests' },
  { story: 'US-037', file: 'BankPdfUpload', fn: 'runBankPdfUploadTests' },
  { story: 'US-038', file: 'PdfTextExtraction', fn: 'runPdfTextExtractionTests' },
  { story: 'US-039', file: 'BankStatementParser', fn: 'runBankStatementParserTests' },
  { story: 'US-040', file: 'CsvIngestion', fn: 'runCsvIngestionTests' },
  { story: 'US-041', file: 'XlsxIngestion', fn: 'runXlsxIngestionTests' },
  { story: 'US-042', file: 'ManualColumnMapping', fn: 'runManualColumnMappingTests' },
  { story: 'US-043', file: 'RecurringTransactionDetection', fn: 'runRecurringTransactionTests' },
  { story: 'US-044', file: 'FutureObligation', fn: 'runFutureObligationTests' },
  { story: 'US-045', file: 'ProjectedLiquidity', fn: 'runProjectedLiquidityTests' },
  { story: 'US-046', file: 'BudgetModel', fn: 'runBudgetModelTests' },
  { story: 'US-047', file: 'BudgetConsumption', fn: 'runBudgetConsumptionTests' },
  { story: 'US-048', file: 'BudgetDashboard', fn: 'runBudgetDashboardTests' },
];




// Suites QA adicionales descubiertas automaticamente: tests/unit/qa/<Story>_*.test.ts exportan runQaTests
const qaDir = join(__dirname, 'unit', 'qa');
let qaFiles: string[] = [];
try {
  qaFiles = readdirSync(qaDir).filter((f) => f.endsWith('.test.ts'));
} catch {
  qaFiles = [];
}
for (const f of qaFiles) {
  const story = f.split('_')[0];
  SUITES.push({ story, file: `qa/${f.replace('.test.ts', '')}`, fn: 'runQaTests' });
}

const results: { story: string; file: string; ok: boolean; detail: string }[] = [];

for (const s of SUITES) {
  const r = spawnSync('npx', ['tsx', 'tests/qaChild.ts', s.file, s.fn], {
    cwd: join(__dirname, '..'),
    encoding: 'utf8',
    shell: true,
    timeout: 120000,
  });
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  const ok = r.status === 0;
  const failLines = out
    .split('\n')
    .filter((l) => /\[FAIL\]|Error|Assertion/.test(l))
    .slice(0, 3)
    .join(' | ')
    .trim();
  results.push({ story: s.story, file: s.file, ok, detail: ok ? '' : failLines || `exit ${r.status}` });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${s.story}  ${s.file}${ok ? '' : '  ->  ' + failLines}`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\nTotal: ${results.length}  PASS: ${results.length - failed.length}  FAIL: ${failed.length}`);
process.exit(failed.length ? 1 : 0);
