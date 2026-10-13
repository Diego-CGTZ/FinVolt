/**
 * US-034: Financial Email Parser
 *
 * Extrae información financiera estructurada de correos electrónicos transaccionales:
 * - Detecta monto y divisa
 * - Extrae comercio (merchant) y beneficiario
 * - Extrae fecha de la operación
 * - Detecta tipo de movimiento (EXPENSE, INCOME, TRANSFER)
 * - Extrae datos relevantes (últimos 4 dígitos, tipo de cuenta, banco, folio, concepto)
 * - Genera TransactionCandidate desacoplado conservando íntegro el raw payload original (US-018)
 */

import type { INotificationParser, ParsedCandidateResult } from './INotificationParser';
import type { RawEvent } from '../../models/RawEvent';
import type { TransactionType } from '../../models/Transaction';
import type { AccountHint, TransactionCandidate } from '../../models/TransactionCandidate';
import { CandidateFactory } from '../CandidateFactory';
import { ProviderDetector, type DetectedProvider } from '../detection/ProviderDetector';

export interface ExtractedEmailData {
  amount: number;
  currency: string;
  type: TransactionType;
  merchantRaw: string | null;
  merchant: string | null;
  occurredAt: Date;
  accountHint?: AccountHint;
  referenceNumber?: string;
  concept?: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export class FinancialEmailParser implements INotificationParser {
  public readonly parserName = 'FINANCIAL_EMAIL_PARSER';

  /**
   * Determina si este parser puede procesar el evento.
   * Acepta cualquier evento con fuente 'EMAIL' o cuyo payload contenga campos de correo.
   */
  public canParse(_provider: string, rawEvent: RawEvent): boolean {
    if (rawEvent.source === 'EMAIL') return true;

    const payload = rawEvent.payload as Record<string, unknown> | undefined;
    if (payload) {
      if (typeof payload.subject === 'string' || typeof payload.messageId === 'string') {
        return true;
      }
      if (rawEvent.metadata && rawEvent.metadata.provider === 'GMAIL') {
        return true;
      }
    }

    return false;
  }

  /**
   * Parsea el evento crudo y extrae los campos estructurados del candidato.
   */
  public async parse(rawEvent: RawEvent): Promise<ParsedCandidateResult | null> {
    const extracted = this.extractFinancialData(rawEvent);
    if (!extracted) return null;

    return {
      amount: extracted.amount,
      currency: extracted.currency,
      type: extracted.type,
      merchantRaw: extracted.merchantRaw,
      merchant: extracted.merchant,
      occurredAt: extracted.occurredAt,
      accountHint: extracted.accountHint,
      confidence: extracted.confidence,
      parserName: this.parserName,
      metadata: {
        ...(extracted.metadata || {}),
        referenceNumber: extracted.referenceNumber,
        concept: extracted.concept,
      },
    };
  }

  /**
   * Genera una instancia canónica de TransactionCandidate a partir del evento crudo.
   * Cumple con los criterios de US-034:
   * 1. Detecta monto, merchant, fecha, tipo y datos relevantes.
   * 2. Genera candidate con fingerprint y confidence score.
   * 3. Conserva raw payload íntegro e inalterado.
   */
  public async toCandidate(rawEvent: RawEvent, userId?: string): Promise<TransactionCandidate | null> {
    const parsed = await this.parse(rawEvent);
    if (!parsed) return null;

    const providerResult = this.detectProvider(rawEvent);
    const providerName = providerResult.displayName || providerResult.provider;

    return CandidateFactory.create(parsed, rawEvent, providerName, userId);
  }

  private detectProvider(rawEvent: RawEvent): DetectedProvider {
    const payload = rawEvent.payload as Record<string, unknown> | undefined;
    const subject = (payload?.subject as string) || (rawEvent.metadata?.subject as string) || '';
    const text = `${(payload?.from as string) || ''} ${(payload?.bodyText as string) || ''} ${rawEvent.rawText || ''}`;
    return ProviderDetector.detect({ title: subject, text });
  }

  /**
   * Núcleo extractor de información financiera a partir del contenido del correo.
   */
  public extractFinancialData(rawEvent: RawEvent): ExtractedEmailData | null {
    const payload = rawEvent.payload as Record<string, unknown> | undefined;
    const subject = (payload?.subject as string) || (rawEvent.metadata?.subject as string) || '';
    const bodyText = (payload?.bodyText as string) || (payload?.snippet as string) || rawEvent.rawText || '';
    const fullText = `${subject} \n ${bodyText}`.trim();

    if (!fullText) return null;

    // 1. Detección de Monto y Moneda
    const amountData = this.extractAmountAndCurrency(fullText);
    if (!amountData) return null;

    // 2. Detección de Tipo de Movimiento
    const type = this.detectTransactionType(fullText);

    // 3. Extracción de Comercio (Merchant) o Beneficiario
    const merchantData = this.extractMerchant(fullText, subject, type);

    // 4. Extracción de Fecha
    const occurredAt = this.extractOccurredAt(fullText, rawEvent);

    // 5. Extracción de Indicios de Cuenta y Tarjeta
    const accountHint = this.extractAccountHint(fullText, rawEvent);

    // 6. Extracción de Folio, Referencia y Concepto
    const referenceNumber = this.extractReference(fullText);
    const concept = this.extractConcept(fullText);

    // 7. Cálculo de Confianza del Parser
    let confidence = 80;
    if (merchantData.merchant) confidence += 10;
    if (accountHint?.last4Digits) confidence += 5;
    if (referenceNumber) confidence += 5;

    return {
      amount: amountData.amount,
      currency: amountData.currency,
      type,
      merchantRaw: merchantData.merchantRaw,
      merchant: merchantData.merchant,
      occurredAt,
      accountHint,
      referenceNumber,
      concept,
      confidence: Math.min(100, confidence),
      metadata: {
        subject,
        from: (payload?.from as string) || (rawEvent.metadata?.from as string),
        origin: 'FinancialEmailParser',
      },
    };
  }

  /**
   * Extrae el monto numérico y la divisa (MXN, USD, EUR, etc.).
   */
  private extractAmountAndCurrency(text: string): { amount: number; currency: string } | null {
    // Patrones típicos de montos bancarios en correos:
    // $1,250.00 | $ 450.50 MXN | por $500 | 1,200.00 USD | Total: $99.99
    const regex = /(?:\$|monto:|importe:|total:|por\s+\$|de\s+\$)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\s*(MXN|USD|EUR|CAD)?/i;
    const match = text.match(regex);

    if (match && match[1]) {
      const cleanVal = match[1].replace(/,/g, '');
      const parsedAmount = parseFloat(cleanVal);
      if (!isNaN(parsedAmount) && parsedAmount > 0) {
        const currency = (match[2] || 'MXN').toUpperCase();
        return {
          amount: Math.round(parsedAmount * 100) / 100,
          currency,
        };
      }
    }

    // Patrón secundario: número seguido de divisa explícita (ej. "1500.00 MXN")
    const fallbackRegex = /([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)\s*(MXN|USD|EUR)/i;
    const fallbackMatch = text.match(fallbackRegex);
    if (fallbackMatch && fallbackMatch[1]) {
      const cleanVal = fallbackMatch[1].replace(/,/g, '');
      const parsedAmount = parseFloat(cleanVal);
      if (!isNaN(parsedAmount) && parsedAmount > 0) {
        return {
          amount: Math.round(parsedAmount * 100) / 100,
          currency: (fallbackMatch[2] || 'MXN').toUpperCase(),
        };
      }
    }

    return null;
  }

  /**
   * Detecta el tipo de movimiento contable a partir de palabras clave y contexto.
   */
  private detectTransactionType(text: string): TransactionType {
    const lower = text.toLowerCase();

    // Ingresos (Abonos, depósitos, transferencias recibidas, nómina)
    if (
      /abono|dep[oó]sito|recibiste|te enviaron|te transfirieron|transferencia recibida|n[oó]mina|cashback|devoluci[oó]n|reembolso/i.test(
        lower,
      )
    ) {
      return 'INCOME';
    }

    // Traspasos / transferencias entre cuentas
    if (/traspaso|transferencia entre cuentas|retiro en cajero|disposici[oó]n/i.test(lower)) {
      return 'TRANSFER';
    }

    // Por defecto en compras, cargos, autorizaciones y pagos
    return 'EXPENSE';
  }

  /**
   * Extrae el comercio o establecimiento en compras, o el beneficiario en transferencias.
   */
  private extractMerchant(
    text: string,
    subject: string,
    type: TransactionType,
  ): { merchantRaw: string | null; merchant: string | null } {
    let merchant: string | null = null;

    if (type === 'INCOME') {
      // Ingresos: "recibiste de JUAN PEREZ", "transferencia de PEDRO", "origen: CARLOS", "por $X de PEDRO"
      const incomePatterns = [
        /(?:recibiste\s+(?:una\s+)?(?:transferencia\s+)?(?:por\s+[^\s]+\s+)?de|recibida\s+de|transferencia\s+de|abono\s+de|desde|ordenante:?)\s+([A-Za-z0-9áéíóúÁÉÍÓÚñÑüÜ\s._&'’"-]+?)(?:\s+(?:por|concepto|el|a\s+las|clave|folio)|\.|\n|$)/i,
        /(?:\bde)\s+([A-Za-z0-9áéíóúÁÉÍÓÚñÑüÜ\s._&'’"-]+?)(?:\s+(?:por|concepto|el|a\s+las|clave|folio)|\.|\n|$)/i,
      ];

      for (const pattern of incomePatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          const candidate = match[1].trim();
          if (
            candidate.length > 1 &&
            !/^(\$|[0-9]|tu\s+|su\s+|una\s+|la\s+|el\s+)/i.test(candidate) &&
            !/^(cuenta|tarjeta|banco)$/i.test(candidate)
          ) {
            merchant = candidate;
            break;
          }
        }
      }
    } else {
      // Gastos: "compra en LIVERPOOL", "cargo en AMAZON", "pagaste en UBER", "establecimiento: WALMART", "a favor de CFE"
      const expensePatterns = [
        /(?:en|establecimiento:?|comercio:?|a\s+favor\s+de:?|pagaste\s+(?:en|a))\s+([A-Za-z0-9áéíóúÁÉÍÓÚñÑüÜ\s._&'’"-]+?)(?:\s+(?:un|una|importe|monto|con|el|por|de\s+\$|a\s+las|folio|tarjeta|\*|\$|\d{2}\/|\.|\n|$))/i,
        /(?:compra|cargo|pago)\s+en\s+([A-Za-z0-9áéíóúÁÉÍÓÚñÑüÜ\s._&'’"-]+?)(?:\s+(?:un|una|importe|monto|con|el|por|a\s+las|folio|tarjeta|\*|\$|\d{2}\/|\.|\n|$))/i,
      ];

      for (const pattern of expensePatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          const candidate = match[1].trim();
          if (candidate.length > 1 && !/^(tu|su|un|una|la|el|los|las|tarjeta)$/i.test(candidate)) {
            merchant = candidate;
            break;
          }
        }
      }
    }

    // Si aún no se encontró, intenta extraer del asunto
    if (!merchant && subject) {
      const subjectMatch = subject.match(/(?:en|de)\s+([A-Za-z0-9áéíóúÁÉÍÓÚñÑüÜ\s._&'’"-]+?)(?:\s+por|\s*\.|$)/i);
      if (subjectMatch && subjectMatch[1]) {
        merchant = subjectMatch[1].trim();
      }
    }

    const merchantRaw = merchant;
    const cleanedMerchant = merchant ? this.cleanMerchantName(merchant) : null;

    return {
      merchantRaw,
      merchant: cleanedMerchant,
    };
  }

  /**
   * Limpia el nombre del comercio eliminando preposiciones, coletillas o palabras vacías residuales.
   */
  private cleanMerchantName(raw: string): string {
    return raw
      .replace(/\s+(el|con|por|a\s+las|en)\s*$/i, '')
      .replace(/\s+(tu|su)\s+tarjeta.*$/i, '')
      .replace(/[*#]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extrae la fecha de operación a partir del texto o recurre a los metadatos del correo.
   */
  private extractOccurredAt(text: string, rawEvent: RawEvent): Date {
    // 1. Formato numérico: DD/MM/YYYY o DD-MM-YYYY con hora opcional HH:mm(:ss)
    const dateNumMatch = text.match(
      /(?:el\s+|fecha:?\s*)([0-9]{1,2})[\/\-]([0-9]{1,2})[\/\-]([0-9]{4})(?:\s+(?:a\s+las\s+)?([0-9]{1,2}):([0-9]{2})(?::([0-9]{2}))?)?/i,
    );
    if (dateNumMatch && dateNumMatch[1] && dateNumMatch[2] && dateNumMatch[3]) {
      const day = parseInt(dateNumMatch[1], 10);
      const month = parseInt(dateNumMatch[2], 10) - 1;
      const year = parseInt(dateNumMatch[3], 10);
      const hours = dateNumMatch[4] ? parseInt(dateNumMatch[4], 10) : 12;
      const minutes = dateNumMatch[5] ? parseInt(dateNumMatch[5], 10) : 0;
      const seconds = dateNumMatch[6] ? parseInt(dateNumMatch[6], 10) : 0;

      const parsed = new Date(year, month, day, hours, minutes, seconds);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    // 2. Formato textual en español: "12 de Octubre de 2026"
    const monthNames: Record<string, number> = {
      ene: 0, enero: 0,
      feb: 1, febrero: 1,
      mar: 2, marzo: 2,
      abr: 3, abril: 3,
      may: 4, mayo: 4,
      jun: 5, junio: 5,
      jul: 6, julio: 6,
      ago: 7, agosto: 7,
      sep: 8, sept: 8, septiembre: 8,
      oct: 9, octubre: 9,
      nov: 10, noviembre: 10,
      dic: 11, diciembre: 11,
    };

    const textDateMatch = text.match(
      /([0-9]{1,2})\s+(?:de\s+)?([A-Za-z]{3,10})(?:\s+de\s+|\s*[\-\/]\s*)([0-9]{4})/i,
    );
    if (textDateMatch && textDateMatch[1] && textDateMatch[2] && textDateMatch[3]) {
      const day = parseInt(textDateMatch[1], 10);
      const monthStr = textDateMatch[2].toLowerCase();
      const year = parseInt(textDateMatch[3], 10);

      const monthIndex = monthNames[monthStr];
      if (monthIndex !== undefined) {
        const parsed = new Date(year, monthIndex, day, 12, 0, 0);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    }

    // 3. Fallback: fecha de recepción del evento crudo
    return rawEvent.receivedAt || new Date();
  }

  /**
   * Extrae indicios de cuenta bancaria o tarjeta (últimos 4 dígitos, tipo de cuenta, banco).
   */
  private extractAccountHint(text: string, rawEvent: RawEvent): AccountHint | undefined {
    let last4Digits: string | undefined;
    let accountType: AccountHint['accountType'] = undefined;

    // Búsqueda de últimos 4 dígitos: *1234, terminación 1234, cuenta 1234, tarjeta 1234
    const cardMatch = text.match(/(?:tarjeta|cta|cuenta|terminaci[oó]n|\*)\s*\*?([0-9]{4})\b/i);
    if (cardMatch && cardMatch[1]) {
      last4Digits = cardMatch[1];
    }

    // Tipo de cuenta
    if (/cr[eé]dito/i.test(text)) {
      accountType = 'CREDIT';
    } else if (/d[eé]bito/i.test(text)) {
      accountType = 'DEBIT';
    }

    // Detección del banco emisor
    const providerResult = this.detectProvider(rawEvent);
    const bankName = providerResult.displayName || providerResult.provider;

    if (!last4Digits && !accountType && providerResult.provider === 'GENERIC') {
      return undefined;
    }

    return {
      last4Digits,
      accountType,
      bankName: bankName !== 'GENERIC' ? bankName : undefined,
    };
  }

  /**
   * Extrae folio o número de autorización bancaria si está presente.
   */
  private extractReference(text: string): string | undefined {
    const match = text.match(/(?:folio|autorizaci[oó]n|referencia|clave\s+de\s+rastreo):?\s*([A-Za-z0-9\-]+)/i);
    return match && match[1] ? match[1].trim() : undefined;
  }

  /**
   * Extrae el concepto de la operación si está explícito.
   */
  private extractConcept(text: string): string | undefined {
    const match = text.match(/(?:concepto|motivo):?\s*([A-Za-z0-9áéíóúÁÉÍÓÚñÑüÜ\s&'’"-]+?)(?:\s+(?:folio|fecha|por|clave)|[\.\n\r]|$)/i);
    return match && match[1] ? match[1].trim() : undefined;
  }
}
