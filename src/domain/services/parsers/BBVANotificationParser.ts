/**
 * US-021 / US-022: BBVA Notification Parser
 *
 * Especializado en extraer transacciones a partir de notificaciones push de BBVA México.
 */

import type { INotificationParser, ParsedCandidateResult } from './INotificationParser';
import type { RawEvent } from '../../models/RawEvent';
import type { TransactionType } from '../../models/Transaction';
import type { AccountHint } from '../../models/TransactionCandidate';

export class BBVANotificationParser implements INotificationParser {
  public readonly parserName = 'BBVA_NOTIFICATION_PARSER';

  public canParse(provider: string, rawEvent: RawEvent): boolean {
    if (provider.toUpperCase() === 'BBVA') return true;

    const payload = rawEvent.payload as { packageName?: string; title?: string };
    const pkg = (payload?.packageName || '').toLowerCase();
    const title = (payload?.title || '').toLowerCase();

    return pkg.includes('bbva') || title.includes('bbva') || title.includes('bancomer');
  }

  public async parse(rawEvent: RawEvent): Promise<ParsedCandidateResult | null> {
    const payload = rawEvent.payload as { title?: string; text?: string };
    const title = payload?.title || '';
    const text = payload?.text || rawEvent.rawText || '';
    const fullText = `${title} ${text}`.trim();

    if (!fullText) return null;

    // 1. Extraer monto
    const amount = this.extractAmount(fullText);
    if (!amount) return null;

    // 2. Extraer tipo de movimiento
    const type = this.detectType(fullText);

    // 3. Extraer comercio o contraparte
    const { merchantRaw, merchant } = this.extractMerchant(fullText, type);

    // 4. Extraer indicios de cuenta (últimos 4 dígitos)
    const accountHint = this.extractAccountHint(fullText);

    // 5. Determinar confianza
    let confidence = 85;
    if (merchant) confidence += 5;
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
    if (/dep[oó]sito|abono|n[oó]mina|transferencia recibida|recibiste/i.test(text)) {
      return 'INCOME';
    }
    if (/traspaso entre cuentas|a cuenta propia/i.test(text)) {
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
      const matchIncome = text.match(/(?:de|desde)\s+([A-Za-z0-9\s._-]+?)(?:\s+concepto|\s+el|\s+por|\s*\.|$)/i);
      if (matchIncome && matchIncome[1]) {
        merchant = matchIncome[1].trim();
      }
    } else {
      const matchExpense = text.match(/(?:en)\s+([A-Za-z0-9\s._-]+?)(?:\s+con|\s+el|\s+por|\s+a\s+las|\s*\.|$)/i);
      if (matchExpense && matchExpense[1]) {
        merchant = matchExpense[1].trim();
      }
    }

    if (!merchant && /retiro/i.test(text)) {
      merchant = 'Cajero Automático BBVA';
    }

    const merchantRaw = merchant;
    const cleanedMerchant = merchant ? merchant.replace(/\s+/g, ' ').trim() : null;

    return {
      merchantRaw,
      merchant: cleanedMerchant,
    };
  }

  private extractAccountHint(text: string): AccountHint | undefined {
    let last4Digits: string | undefined;
    let accountType: AccountHint['accountType'] = undefined;

    const cardMatch = text.match(/(?:tarjeta|cta|cuenta)?\s*(?:d[eé]bito|cr[eé]dito)?\s*\*?([0-9]{4})/i);
    if (cardMatch && cardMatch[1]) {
      last4Digits = cardMatch[1];
    }

    if (/cr[eé]dito/i.test(text)) {
      accountType = 'CREDIT';
    } else if (/d[eé]bito|ahorro/i.test(text)) {
      accountType = 'DEBIT';
    }

    if (!last4Digits && !accountType) return undefined;

    return {
      last4Digits,
      accountType,
      bankName: 'BBVA',
    };
  }
}
