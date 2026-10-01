/**
 * US-021: Pipeline de Ingestión de Notificaciones
 *
 * Acceptance Criteria:
 * Notification -> Raw Event -> Provider Detection -> Financial Detection -> Parser -> Candidate
 *
 * Orquesta de extremo a extremo la captura y procesamiento de notificaciones financieras:
 * 1. Notification: Captura la entrada nativa del dispositivo.
 * 2. Raw Event: Preserva inmutablemente el payload crudo en `raw_events` (US-018).
 * 3. Provider Detection: Detecta la institución financiera emisora (BBVA, Nu, Banorte, etc.).
 * 4. Financial Detection: Verifica si es un evento monetario real o aviso/OTP/publicidad.
 * 5. Parser: Delega al parser especializado correspondiente (BBVA, etc.) o genérico.
 * 6. Candidate: Construye y persiste un `TransactionCandidate` desacoplado (US-023).
 *
 * INVARIANTE ESTRICTA:
 * NUNCA inserta directamente en la tabla `transactions`.
 */

import type { RawEvent } from '../../domain/models/RawEvent';
import type { TransactionCandidate } from '../../domain/models/TransactionCandidate';
import type { RawEventService } from '../../domain/services/RawEventService';
import type { ITransactionCandidateRepository } from '../../domain/repositories/ITransactionCandidateRepository';
import type { AndroidNotificationInput } from '../../infrastructure/adapters/AndroidNotificationAdapter';
import { ProviderDetector, type DetectedProvider } from '../../domain/services/detection/ProviderDetector';
import {
  FinancialContentDetector,
  type FinancialDetectionResult,
} from '../../domain/services/detection/FinancialContentDetector';
import { NotificationParserRegistry } from '../../domain/services/parsers/NotificationParserRegistry';
import { CandidateFactory } from '../../domain/services/CandidateFactory';
import { InMemoryTransactionCandidateRepository } from '../../infrastructure/database/InMemoryTransactionCandidateRepository';

export type NotificationInput =
  | AndroidNotificationInput
  | {
      packageName?: string;
      title?: string;
      text?: string;
      bigText?: string;
      subText?: string;
      postTime?: number;
      key?: string;
      extras?: Record<string, unknown>;
      [key: string]: unknown;
    };

export interface PipelineExecutionResult {
  rawEvent: RawEvent;
  candidate: TransactionCandidate | null;
  provider: DetectedProvider;
  financialDetection: FinancialDetectionResult;
  status: 'SUCCESS' | 'IGNORED' | 'FAILED';
  message: string;
}

export type CandidateListener = (candidate: TransactionCandidate) => void;

export class NotificationIngestionPipeline {
  private rawEventService: RawEventService;
  private candidateRepository: ITransactionCandidateRepository;
  private parserRegistry: NotificationParserRegistry;
  private listeners: Set<CandidateListener> = new Set();

  constructor(
    rawEventService: RawEventService,
    candidateRepository?: ITransactionCandidateRepository,
    parserRegistry?: NotificationParserRegistry,
  ) {
    this.rawEventService = rawEventService;
    this.candidateRepository =
      candidateRepository || new InMemoryTransactionCandidateRepository();
    this.parserRegistry = parserRegistry || NotificationParserRegistry.getInstance();
  }

  /**
   * Suscribe un listener para ser notificado cuando se genere un nuevo candidato.
   */
  public onCandidateGenerated(listener: CandidateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Ejecuta el pipeline completo a partir de una notificación entrante o un RawEvent existente.
   *
   * Flujo:
   * Notification -> Raw Event -> Provider Detection -> Financial Detection -> Parser -> Candidate
   */
  public async processNotification(
    input: NotificationInput | RawEvent,
  ): Promise<PipelineExecutionResult> {
    // ── Paso 1: Raw Event ──────────────────────────────────────────────────────────
    let rawEvent: RawEvent;

    if ('status' in input && 'source' in input) {
      // Ya es una instancia de RawEvent
      rawEvent = input as RawEvent;
    } else {
      // Es una notificación cruda entrante: capturar como RawEvent inmutable (US-018)
      const notif = input as NotificationInput;
      const combinedText = `${notif.title || ''} ${notif.text || ''}`.trim();

      const { event } = await this.rawEventService.capture({
        source: 'ANDROID_NOTIFICATION',
        sourceId: notif.key,
        payload: { ...notif } as Record<string, unknown>,
        rawText: combinedText,
        metadata: {
          packageName: notif.packageName,
          postTime: notif.postTime,
        },
      });
      rawEvent = event;
    }

    const payload = (rawEvent.payload || {}) as Record<string, unknown>;
    const title = typeof payload.title === 'string' ? payload.title : '';
    const text = typeof payload.text === 'string' ? payload.text : rawEvent.rawText || '';
    const packageName = typeof payload.packageName === 'string' ? payload.packageName : undefined;

    // ── Paso 2: Provider Detection ────────────────────────────────────────────────
    const provider = ProviderDetector.detect({
      packageName,
      title,
      text,
    });

    // ── Paso 3: Financial Detection ───────────────────────────────────────────────
    const financialDetection = FinancialContentDetector.detect({ title, text });

    // Si no es financiero o es un aviso no-transaccional (OTP, promo, info)
    if (!financialDetection.isFinancial || !financialDetection.isTransactional) {
      const reason = financialDetection.reason || 'Notificación no financiera o no transaccional';
      await this.rawEventService.markAsIgnored(rawEvent.id);

      return {
        rawEvent,
        candidate: null,
        provider,
        financialDetection,
        status: 'IGNORED',
        message: reason,
      };
    }

    // ── Paso 4: Parser Resolution & Extraction ────────────────────────────────────
    const parser = this.parserRegistry.resolve(provider.provider, rawEvent);
    const parsedResult = await parser.parse(rawEvent);

    if (!parsedResult || !parsedResult.amount || parsedResult.amount <= 0) {
      const errorMessage = `El parser [${parser.parserName}] no pudo extraer un monto válido para el proveedor ${provider.displayName}`;
      await this.rawEventService.markAsFailed(rawEvent.id, errorMessage);

      return {
        rawEvent,
        candidate: null,
        provider,
        financialDetection,
        status: 'FAILED',
        message: errorMessage,
      };
    }

    // ── Paso 5: Candidate Generation (US-023) ─────────────────────────────────────
    const candidate = CandidateFactory.create(
      parsedResult,
      rawEvent,
      provider.displayName,
      rawEvent.userId,
    );

    // Persistir candidato en repositorio desacoplado
    await this.candidateRepository.save(candidate);

    // Actualizar estado del RawEvent a PROCESSED (con enlace en metadata)
    await this.rawEventService.markAsProcessed(rawEvent.id);

    // Notificar a listeners reactivos
    this.notifyCandidateGenerated(candidate);

    return {
      rawEvent,
      candidate,
      provider,
      financialDetection,
      status: 'SUCCESS',
      message: `Candidato generado exitosamente por ${parser.parserName}`,
    };
  }

  /**
   * Obtiene todos los candidatos registrados hasta el momento.
   */
  public async getCandidates(): Promise<TransactionCandidate[]> {
    return this.candidateRepository.findAll();
  }

  private notifyCandidateGenerated(candidate: TransactionCandidate): void {
    for (const listener of this.listeners) {
      try {
        listener(candidate);
      } catch (err) {
        console.warn('[NotificationIngestionPipeline] Error en listener de candidato:', err);
      }
    }
  }
}
