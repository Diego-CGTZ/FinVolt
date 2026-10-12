/**
 * US-027: Servicio de Reconciliación Cross-Source
 *
 * Unifica entradas procedentes de múltiples fuentes heterogéneas (notificaciones push,
 * correos electrónicos y estados de cuenta PDF/CSV/XLSX) que representan la misma
 * operación financiera en la vida real.
 *
 * Criterios de Aceptación (US-027):
 * - Múltiples fuentes pueden asociarse a una transacción (acumula evidencia en sourcesEvidence).
 * - Una operación no se duplica (se enriquece y fusiona en lugar de duplicarse).
 * - Evidencia de fuentes conservada íntegramente (trazabilidad de origen, proveedor y timestamps).
 */

import type { Transaction, SourceEvidence, TransactionSource } from '../../models/Transaction';
import type { TransactionCandidate } from '../../models/TransactionCandidate';
import type { RawEventSource } from '../../models/RawEvent';
import {
  DuplicateDetectorService,
  type DuplicateDetectorConfig,
  type DuplicateDetectionResult,
} from '../duplication/DuplicateDetectorService';
import { TransactionFingerprintService } from '../fingerprint/TransactionFingerprintService';

export type ReconciliationAction = 'MERGED' | 'CREATED' | 'UNMATCHED';

export interface ReconciliationResult {
  action: ReconciliationAction;
  isReconciled: boolean;
  transaction: Transaction | null;
  candidate: TransactionCandidate;
  evidenceAdded: SourceEvidence | null;
  matchDetails: DuplicateDetectionResult | null;
  message: string;
}

export interface ReconciliationOptions {
  /** Configuración personalizada de tolerancia para detección de duplicados/coincidencias */
  detectorConfig?: DuplicateDetectorConfig;

  /** Si es true y no se encuentra match, crea una nueva transacción en lugar de dejar el candidato huérfano */
  autoPromoteIfUnmatched?: boolean;

  /** ID de cuenta predeterminado a usar si se crea una nueva transacción desde un candidato */
  defaultAccountId?: string;
}

export class CrossSourceReconciliationService {
  /**
   * Reconcilia un TransactionCandidate entrante frente a la lista de transacciones existentes.
   * Si detecta coincidencia (exacta o aproximada), asocia la evidencia a la transacción
   * existente y evita la duplicación.
   */
  public static reconcile(
    candidate: TransactionCandidate,
    existingTransactions: Transaction[],
    options?: ReconciliationOptions,
  ): ReconciliationResult {
    // 1. Evaluar si coincide con alguna transacción existente usando el motor de duplicados
    const match = DuplicateDetectorService.detectDuplicate(
      candidate,
      { transactions: existingTransactions },
      options?.detectorConfig,
    );

    // ── CASO A: Coincidencia encontrada (MERGED) ─────────────────────────────
    if (match.isDuplicate && match.matchedEntity?.id) {
      const targetTx = existingTransactions.find((tx) => tx.id === match.matchedEntity!.id);

      if (targetTx) {
        const evidence = this.createEvidenceFromCandidate(candidate);
        const updatedTx = this.mergeEvidenceIntoTransaction(targetTx, candidate, evidence);

        // Actualizar el estado del candidato a RECONCILED
        candidate.status = 'RECONCILED';
        candidate.metadata = {
          ...candidate.metadata,
          reconciledWithTransactionId: targetTx.id,
          reconciledAt: new Date().toISOString(),
          matchType: match.matchType,
          matchConfidence: match.confidence,
        };

        return {
          action: 'MERGED',
          isReconciled: true,
          transaction: updatedTx,
          candidate,
          evidenceAdded: evidence,
          matchDetails: match,
          message: `Operación reconciliada exitosamente con transacción existente (${targetTx.id}) mediante ${match.matchType} match`,
        };
      }
    }

    // ── CASO B: No se encontró coincidencia (UNMATCHED o CREATED) ─────────────
    if (options?.autoPromoteIfUnmatched && (candidate.accountHint?.bankName || options.defaultAccountId)) {
      const accountId = options.defaultAccountId || 'acc_default';
      const newTx = this.promoteCandidateToTransaction(candidate, accountId);
      candidate.status = 'RECONCILED';
      candidate.metadata = {
        ...candidate.metadata,
        reconciledWithTransactionId: newTx.id,
        promotedAt: new Date().toISOString(),
      };

      return {
        action: 'CREATED',
        isReconciled: true,
        transaction: newTx,
        candidate,
        evidenceAdded: newTx.sourcesEvidence?.[0] || null,
        matchDetails: match,
        message: `Nueva transacción creada e inicializada con evidencia de fuente`,
      };
    }

    return {
      action: 'UNMATCHED',
      isReconciled: false,
      transaction: null,
      candidate,
      evidenceAdded: null,
      matchDetails: match,
      message: 'No se encontró transacción previa coincidente para reconciliación',
    };
  }

  /**
   * Promociona un TransactionCandidate a una Transaction inicial,
   * preservando su procedencia en sourcesEvidence.
   */
  public static promoteCandidateToTransaction(
    candidate: TransactionCandidate,
    accountId: string,
  ): Transaction {
    const now = new Date();
    const evidence = this.createEvidenceFromCandidate(candidate);

    // Mapear fuente a TransactionSource
    const source = this.mapRawSourceToTransactionSource(candidate.source);

    const transaction: Transaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId: candidate.userId,
      accountId,
      type: candidate.type,
      amountMinor: candidate.amountMinor,
      currency: candidate.currency,
      occurredAt: candidate.occurredAt,
      postedAt: candidate.source.includes('STATEMENT') ? candidate.occurredAt : null,
      merchantRaw: candidate.merchantRaw,
      merchant: candidate.merchant || candidate.merchantRaw || null,
      description: null,
      categoryId: null,
      source,
      sourceEventId: candidate.rawEventId,
      status: candidate.confidenceScore >= 90 ? 'CONFIRMED' : 'CANDIDATE',
      confidenceScore: candidate.confidenceScore,
      fingerprint: candidate.fingerprint || null,
      linkedTransactionId: null,
      sourcesEvidence: [evidence],
      createdAt: now,
      updatedAt: now,
    };

    if (!transaction.fingerprint) {
      transaction.fingerprint = TransactionFingerprintService.fromTransaction(transaction);
    }

    return transaction;
  }

  /**
   * Fusiona la nueva evidencia de fuente en la transacción existente sin crear duplicados.
   * Enriquece los datos de la transacción (postedAt, merchant, confidenceScore).
   */
  public static mergeEvidenceIntoTransaction(
    transaction: Transaction,
    candidate: TransactionCandidate,
    evidence: SourceEvidence,
  ): Transaction {
    const existingEvidence = transaction.sourcesEvidence || [];

    // Prevenir duplicación exacta de la misma evidencia si ya fue añadida
    const alreadyExists = existingEvidence.some(
      (e) => e.sourceEventId === evidence.sourceEventId && e.source === evidence.source,
    );

    const updatedEvidence = alreadyExists
      ? existingEvidence
      : [...existingEvidence, evidence];

    // Enriquecimiento de campos:
    // 1. Si la nueva fuente aporta fecha de liquidación (ej. estado de cuenta bancario)
    let postedAt = transaction.postedAt;
    let status = transaction.status;
    const isStatementSource =
      candidate.source === 'BANK_PDF' ||
      candidate.source === 'BANK_CSV' ||
      candidate.source === 'BANK_XLSX' ||
      candidate.source.includes('STATEMENT') ||
      candidate.source.includes('BANK_');

    if (!postedAt && isStatementSource) {
      postedAt = candidate.occurredAt;
      if (status === 'PENDING' || status === 'CANDIDATE') {
        status = 'POSTED';
      }
    }

    // 2. Si la nueva fuente provee un comercio normalizado más específico
    let merchant = transaction.merchant;
    if ((!merchant || merchant.trim() === '') && candidate.merchant) {
      merchant = candidate.merchant;
    }

    // 3. Aumento del score de confianza por validación multi-fuente
    const baseConfidence = transaction.confidenceScore ?? 80;
    // Cada fuente adicional concordante añade puntos de confianza
    const multiSourceBonus = Math.min(10, updatedEvidence.length * 3);
    const enrichedConfidence = Math.min(100, Math.max(baseConfidence, candidate.confidenceScore + multiSourceBonus));

    return {
      ...transaction,
      postedAt,
      merchant,
      status,
      confidenceScore: enrichedConfidence,
      sourcesEvidence: updatedEvidence,
      updatedAt: new Date(),
    };
  }

  /**
   * Construye un registro SourceEvidence estructurado a partir de un candidato.
   */
  public static createEvidenceFromCandidate(candidate: TransactionCandidate): SourceEvidence {
    return {
      source: this.mapRawSourceToTransactionSource(candidate.source),
      sourceEventId: candidate.rawEventId,
      candidateId: candidate.id,
      provider: candidate.provider,
      occurredAt: candidate.occurredAt,
      capturedAt: candidate.createdAt,
      merchantRaw: candidate.merchantRaw,
      amountMinor: candidate.amountMinor,
      confidenceScore: candidate.confidenceScore,
      rawPayloadExcerpt: candidate.rawPayload ? { ...candidate.rawPayload } : undefined,
    };
  }

  /**
   * Mapea el tipo de fuente de evento crudo a la fuente canónica de la transacción.
   */
  public static mapRawSourceToTransactionSource(source: RawEventSource): TransactionSource {
    switch (source) {
      case 'ANDROID_NOTIFICATION':
        return 'NOTIFICATION';
      case 'EMAIL':
        return 'EMAIL';
      case 'SMS':
        return 'SMS';
      case 'BANK_PDF':
        return 'STATEMENT_PDF';
      case 'BANK_CSV':
        return 'STATEMENT_CSV';
      case 'BANK_XLSX':
        return 'STATEMENT_XLSX';
      case 'MANUAL_IMPORT':
      default:
        return 'MANUAL';
    }
  }

  /**
   * Retorna todas las evidencias asociadas a una transacción.
   */
  public static getEvidenceList(transaction: Transaction): SourceEvidence[] {
    return transaction.sourcesEvidence || [];
  }

  /**
   * Determina si una transacción cuenta con confirmación de múltiples fuentes distintas.
   */
  public static hasMultipleSources(transaction: Transaction): boolean {
    const list = transaction.sourcesEvidence || [];
    if (list.length <= 1) return false;
    const uniqueSources = new Set(list.map((e) => e.source));
    return uniqueSources.size > 1;
  }
}
