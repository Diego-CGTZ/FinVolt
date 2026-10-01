/**
 * US-021 / US-023: Candidate Factory
 *
 * Crea instancias completas e inmutables de TransactionCandidate a partir
 * del resultado del parser y del RawEvent de origen.
 */

import type { RawEvent } from '../models/RawEvent';
import type { ParsedCandidateResult } from './parsers/INotificationParser';
import type { TransactionCandidate } from '../models/TransactionCandidate';

export class CandidateFactory {
  public static create(
    parsed: ParsedCandidateResult,
    rawEvent: RawEvent,
    provider: string,
    userId?: string,
  ): TransactionCandidate {
    const id = this.generateId();
    const now = new Date();
    const amountMinor = Math.round(parsed.amount * 100);

    return {
      id,
      userId: userId || rawEvent.userId,
      rawEventId: rawEvent.id,
      source: rawEvent.source,
      provider,
      amountMinor,
      amount: parsed.amount,
      currency: parsed.currency || 'MXN',
      type: parsed.type,
      merchantRaw: parsed.merchantRaw,
      merchant: parsed.merchant,
      occurredAt: parsed.occurredAt || rawEvent.receivedAt || now,
      confidenceScore: Math.min(100, Math.max(0, parsed.confidence)),
      accountHint: parsed.accountHint,
      status: 'PENDING_REVIEW',
      rawPayload: rawEvent.payload,
      metadata: {
        parserName: parsed.parserName,
        capturedAt: rawEvent.receivedAt.toISOString(),
        ...(parsed.metadata || {}),
      },
      createdAt: now,
      updatedAt: now,
    };
  }

  private static generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback simple para entornos sin crypto.randomUUID
    return 'cand_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  }
}
