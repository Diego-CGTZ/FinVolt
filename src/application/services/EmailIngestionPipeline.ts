/**
 * US-034: Email Ingestion Pipeline
 *
 * Pipeline de procesamiento e ingesta de correos electrónicos financieros:
 * 1. Toma un RawEvent de origen EMAIL (US-018 / US-033).
 * 2. Extrae información financiera mediante FinancialEmailParser (US-034).
 * 3. Construye un TransactionCandidate desacoplado preservando el payload original (US-023).
 * 4. Persiste el candidato en ITransactionCandidateRepository.
 * 5. Actualiza el estado del RawEvent a PROCESSED o IGNORED.
 *
 * INVARIANTE ESTRICTA:
 * NUNCA inserta ni modifica directamente la tabla/modelo Transaction.
 */

import type { RawEvent } from '../../domain/models/RawEvent';
import type { TransactionCandidate } from '../../domain/models/TransactionCandidate';
import type { Transaction } from '../../domain/models/Transaction';
import type { IRawEventRepository } from '../../domain/repositories/IRawEventRepository';
import type { ITransactionCandidateRepository } from '../../domain/repositories/ITransactionCandidateRepository';
import type { ITransactionRepository } from '../../domain/repositories/ITransactionRepository';
import { FinancialEmailParser } from '../../domain/services/parsers/FinancialEmailParser';
import { ProviderDetector, type DetectedProvider } from '../../domain/services/detection/ProviderDetector';
import { CandidateFactory } from '../../domain/services/CandidateFactory';
import { DuplicateDetectorService } from '../../domain/services/duplication/DuplicateDetectorService';
import { CrossSourceReconciliationService } from '../../domain/services/reconciliation/CrossSourceReconciliationService';

export interface EmailPipelineResult {
  rawEvent: RawEvent;
  candidate: TransactionCandidate | null;
  provider: DetectedProvider;
  status: 'SUCCESS' | 'IGNORED' | 'FAILED' | 'DUPLICATE' | 'RECONCILED';
  reconciledTransaction?: Transaction | null;
  message: string;
}

export interface EmailIngestionPipelineOptions {
  rawEventRepository: IRawEventRepository;
  candidateRepository: ITransactionCandidateRepository;
  transactionRepository?: ITransactionRepository;
  parser?: FinancialEmailParser;
  enableReconciliation?: boolean;
}

export class EmailIngestionPipeline {
  private readonly rawEventRepository: IRawEventRepository;
  private readonly candidateRepository: ITransactionCandidateRepository;
  private readonly transactionRepository?: ITransactionRepository;
  private readonly parser: FinancialEmailParser;
  private enableReconciliation: boolean;

  constructor(options: EmailIngestionPipelineOptions) {
    this.rawEventRepository = options.rawEventRepository;
    this.candidateRepository = options.candidateRepository;
    this.transactionRepository = options.transactionRepository;
    this.parser = options.parser || new FinancialEmailParser();
    this.enableReconciliation = options.enableReconciliation ?? Boolean(options.transactionRepository);
  }

  /**
   * Habilita o deshabilita la reconciliación cross-source en tiempo de ejecución.
   */
  public setReconciliationEnabled(enabled: boolean): void {
    this.enableReconciliation = enabled;
  }

  /**
   * Procesa un evento crudo de correo individual.
   */
  public async processRawEvent(rawEvent: RawEvent, userId?: string): Promise<EmailPipelineResult> {
    const subject = (rawEvent.payload?.subject as string) || (rawEvent.metadata?.subject as string) || '';
    const text = `${(rawEvent.payload?.from as string) || ''} ${(rawEvent.payload?.bodyText as string) || ''} ${rawEvent.rawText || ''}`;
    const provider = ProviderDetector.detect({ title: subject, text });

    try {
      // 1. Extraer datos financieros con el parser
      const parsed = await this.parser.parse(rawEvent);

      if (!parsed) {
        // No contiene información monetaria suficiente -> Marcar como IGNORED
        const updated = await this.rawEventRepository.updateStatus(rawEvent.id, {
          status: 'IGNORED',
          errorMessage: 'No se detectó información financiera válida en el correo.',
          processedAt: new Date(),
        });

        return {
          rawEvent: updated,
          candidate: null,
          provider,
          status: 'IGNORED',
          message: 'Correo ignorado por no contener información financiera transaccional.',
        };
      }

      // 2. Construir TransactionCandidate inmutable mediante CandidateFactory
      const providerName = provider.displayName || provider.provider;
      const candidate = CandidateFactory.create(parsed, rawEvent, providerName, userId);

      // 3. Reconciliación cross-source con transacciones existentes (US-036)
      if (this.transactionRepository && this.enableReconciliation) {
        const existingTransactions = await this.transactionRepository.listTransactions();
        const reconResult = CrossSourceReconciliationService.reconcileEmailCandidate(
          candidate,
          existingTransactions,
        );

        if (reconResult.isReconciled && reconResult.action === 'MERGED' && reconResult.transaction) {
          const updatedTx = await this.transactionRepository.updateTransaction(
            reconResult.transaction.id,
            {
              postedAt: reconResult.transaction.postedAt,
              merchant: reconResult.transaction.merchant,
              description: reconResult.transaction.description,
              status: reconResult.transaction.status,
              confidenceScore: reconResult.transaction.confidenceScore,
              sourcesEvidence: reconResult.transaction.sourcesEvidence,
              metadata: reconResult.transaction.metadata,
            },
          );

          candidate.status = 'RECONCILED';
          const savedCandidate = await this.candidateRepository.save(candidate);

          const updatedEvent = await this.rawEventRepository.updateStatus(rawEvent.id, {
            status: 'PROCESSED',
            processedAt: new Date(),
          });

          return {
            rawEvent: updatedEvent,
            candidate: savedCandidate,
            reconciledTransaction: updatedTx,
            provider,
            status: 'RECONCILED',
            message: 'Candidato de correo reconciliado y unificado con transacción existente sin duplicar.',
          };
        }
      }

      // 4. Verificación de duplicados a nivel candidato
      const existingCandidates = await this.candidateRepository.findAll();
      const duplicateMatch = DuplicateDetectorService.detectDuplicate(candidate, {
        candidates: existingCandidates,
      });

      if (duplicateMatch.isDuplicate) {
        candidate.status = 'DUPLICATE';
        await this.candidateRepository.save(candidate);
        const updated = await this.rawEventRepository.updateStatus(rawEvent.id, {
          status: 'DUPLICATE',
          processedAt: new Date(),
        });

        return {
          rawEvent: updated,
          candidate,
          provider,
          status: 'DUPLICATE',
          message: 'Candidato descartado por huella digital o datos duplicados.',
        };
      }

      // 5. Guardar candidato en el repositorio de candidatos
      const savedCandidate = await this.candidateRepository.save(candidate);

      // 6. Marcar evento crudo como PROCESSED
      const updatedEvent = await this.rawEventRepository.updateStatus(rawEvent.id, {
        status: 'PROCESSED',
        processedAt: new Date(),
      });

      return {
        rawEvent: updatedEvent,
        candidate: savedCandidate,
        provider,
        status: 'SUCCESS',
        message: 'Candidato generado y persistido satisfactoriamente desde correo.',
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const updatedEvent = await this.rawEventRepository.updateStatus(rawEvent.id, {
        status: 'FAILED',
        errorMessage: errMsg,
        processedAt: new Date(),
      });

      return {
        rawEvent: updatedEvent,
        candidate: null,
        provider,
        status: 'FAILED',
        message: `Fallo durante el procesamiento del correo: ${errMsg}`,
      };
    }
  }

  /**
   * Procesa en lote todos los eventos crudos de tipo EMAIL pendientes de procesamiento.
   */
  public async processPendingEmails(limit = 50, userId?: string): Promise<EmailPipelineResult[]> {
    const pendingEvents = await this.rawEventRepository.getEvents({
      source: 'EMAIL',
      status: 'PENDING',
      limit,
    });

    const results: EmailPipelineResult[] = [];
    for (const event of pendingEvents) {
      const res = await this.processRawEvent(event, userId);
      results.push(res);
    }

    return results;
  }
}
