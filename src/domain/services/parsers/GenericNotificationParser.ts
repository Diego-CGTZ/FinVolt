/**
 * US-021: Generic Notification Parser
 *
 * Parser de respaldo universal para cualquier notificación bancaria/financiera.
 * Emplea expresiones regulares heurísticas y análisis de lenguaje natural ligero.
 */

import type { INotificationParser, ParsedCandidateResult } from './INotificationParser';
import type { RawEvent } from '../../models/RawEvent';
import type { TransactionType } from '../../models/Transaction';
import type { AccountHint } from '../../models/TransactionCandidate';

export class GenericNotificationParser implements INotificationParser {
  public readonly parserName = 'GENERIC_NOTIFICATION_PARSER';

  public canParse(): boolean {
    return true; // Puede procesar cualquier evento como fallback
  }

  public async parse(rawEvent: RawEvent): Promise<ParsedCandidateResult | null> {
    const payload = rawEvent.payload as { title?: string; text?: string; packageName?: string };
    const title = payload?.title || '';
    const text = payload?.text || rawEvent.rawText || '';
    const fullText = `${title} ${text}`.trim();

    if (!fullText) return null;

    // 1. Extraer monto
    const amount = this.extractAmount(fullText);
    if (!amount) return null;

    // 2. Extraer tipo de movimiento
    const type = this.detectType(fullText);

    // 3. Extraer comercio
    const { merchantRaw, merchant } = this.extractMerchant(fullText, type);

    // 4. Extraer indicios de cuenta
    const accountHint = this.extractAccountHint(fullText, payload?.packageName);

    // 5. Confianza moderada para parser genérico
    let confidence = 70;
    if (merchant) confidence += 10;
    if (accountHint?.last4Digits) confidence += 5;

    return {
      amount,
      currency: 'MXN',
      type,
      merchantRaw,
      merchant,
      occurredAt: rawEvent.receivedAt || new Date(),
      accountHint,
      confidence,
      parserName: this.parserName,
    };
  }

  private extractAmount(text: string): number | null {
    const match = text.match(/\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/);
    if (match && match[1]) {
      const val = parseFloat(match[1].replace(/,/g, ''));
      return isNaN(val) ? null : Math.round(val * 100) / 100;
    }
    return null;
  }

  private detectType(text: string): TransactionType {
    if (/dep[oó]sito|abono|n[oó]mina|transferencia recibida|recibiste|te envi[oó]/i.test(text)) {
      return 'INCOME';
    }
    if (/traspaso|transferencia entre/i.test(text)) {
      return 'TRANSFER';
    }
    return 'EXPENSE';
  }

  private extractMerchant(
    text: string,
    type: TransactionType,
  ): { merchantRaw: string | null; merchant: string | null } {
    let merchant: string | null = null;

    if (type === 'INCOME') {
      const match = text.match(/(?:de|desde)\s+([A-Za-z0-9\s._-]+?)(?:\s+concepto|\s+el|\s+por|\s*\.|$)/i);
      if (match && match[1]) merchant = match[1].trim();
    } else {
      const match = text.match(/(?:en)\s+([A-Za-z0-9\s._-]+?)(?:\s+con|\s+el|\s+por|\s+a\s+las|\s*\.|$)/i);
      if (match && match[1]) merchant = match[1].trim();
    }

    const merchantRaw = merchant;
    const cleanedMerchant = merchant ? merchant.replace(/\s+/g, ' ').trim() : null;

    return {
      merchantRaw,
      merchant: cleanedMerchant,
    };
  }

  private extractAccountHint(text: string, packageName?: string): AccountHint | undefined {
    let last4Digits: string | undefined;
    let accountType: AccountHint['accountType'] = undefined;

    const cardMatch = text.match(/(?:tarjeta|cta|cuenta|\*)\s*\*?([0-9]{4})/i);
    if (cardMatch && cardMatch[1]) {
      last4Digits = cardMatch[1];
    }

    if (/cr[eé]dito/i.test(text)) {
      accountType = 'CREDIT';
    } else if (/d[eé]bito/i.test(text)) {
      accountType = 'DEBIT';
    }

    if (!last4Digits && !accountType) return undefined;

    return {
      last4Digits,
      accountType,
      bankName: packageName,
    };
  }
}
