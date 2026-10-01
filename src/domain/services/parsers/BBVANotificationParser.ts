/**
 * US-022: BBVA Notification Parser
 *
 * Parser especializado de alta precisión para interpretar notificaciones push
 * de BBVA México y generar candidatos estructurados (TransactionCandidate).
 *
 * Criterios de Aceptación (US-022):
 * - Detecta BBVA de forma robusta (package name, headers, firma).
 * - Extrae monto exacto y moneda.
 * - Extrae comercio (merchant) o contraparte normalizado.
 * - Extrae fecha y hora del texto cuando esté disponible (fallback a timestamp de captura).
 * - Identifica el tipo de transacción (EXPENSE, INCOME, TRANSFER).
 * - Extrae indicios de cuenta (últimos 4 dígitos y tipo de tarjeta: débito o crédito).
 * - Conserva payload inmutable y metadatos relevantes.
 */

import type { INotificationParser, ParsedCandidateResult } from './INotificationParser';
import type { RawEvent } from '../../models/RawEvent';
import type { TransactionType } from '../../models/Transaction';
import type { AccountHint } from '../../models/TransactionCandidate';

export interface BBVAParsedMetadata {
  concept?: string;
  isAtm?: boolean;
  isWithoutCard?: boolean;
  isSpei?: boolean;
  rawDateString?: string;
  sourcePattern?: string;
}

export class BBVANotificationParser implements INotificationParser {
  public readonly parserName = 'BBVA_NOTIFICATION_PARSER';

  /**
   * Determina si la notificación proviene de BBVA México mediante
   * nombre de paquete, título o firma en el contenido.
   */
  public canParse(provider: string, rawEvent: RawEvent): boolean {
    if (provider.toUpperCase() === 'BBVA') return true;

    const payload = rawEvent.payload as { packageName?: string; title?: string };
    const pkg = (payload?.packageName || '').toLowerCase();
    const title = (payload?.title || '').toLowerCase();
    const rawText = (rawEvent.rawText || '').toLowerCase();

    return (
      pkg.includes('bbva') ||
      pkg.includes('bancomer') ||
      title.includes('bbva') ||
      title.includes('bancomer') ||
      /\bl[ií]nea bbva\b/i.test(rawText) ||
      /\bcajero bbva\b/i.test(rawText) ||
      /\bpracticaja bbva\b/i.test(rawText)
    );
  }

  /**
   * Interpreta la notificación de BBVA y produce un candidato estructurado.
   */
  public async parse(rawEvent: RawEvent): Promise<ParsedCandidateResult | null> {
    const payload = rawEvent.payload as { title?: string; text?: string; bigText?: string; postTime?: number };
    const title = payload?.title || '';
    const text = payload?.bigText || payload?.text || rawEvent.rawText || '';
    const fullText = `${title} ${text}`.trim();

    if (!fullText) return null;

    // 1. Extraer Monto y Moneda
    const amount = this.extractAmount(fullText);
    if (!amount || amount <= 0) return null;

    const currency = /USD|d[oó]lares/i.test(fullText) ? 'USD' : 'MXN';

    // 2. Extraer Tipo de Transacción
    const type = this.detectType(fullText);

    // 3. Extraer Comercio, Contraparte y Concepto
    const { merchantRaw, merchant, concept, isAtm, isWithoutCard, isSpei, pattern } =
      this.extractMerchantAndDetails(fullText, type);

    // 4. Extraer Fecha (del texto o del evento)
    const { date: occurredAt, rawDateString } = this.extractOccurredAt(fullText, rawEvent);

    // 5. Extraer Indicio de Cuenta (últimos 4 dígitos y tipo)
    const accountHint = this.extractAccountHint(fullText);

    // 6. Calcular Puntuación de Confianza
    let confidence = 80;
    if (merchant) confidence += 10;
    if (accountHint?.last4Digits) confidence += 5;
    if (rawDateString) confidence += 3;

    return {
      amount,
      currency,
      type,
      merchantRaw,
      merchant,
      occurredAt,
      accountHint,
      confidence: Math.min(100, confidence),
      parserName: this.parserName,
      metadata: {
        concept,
        isAtm,
        isWithoutCard,
        isSpei,
        pattern,
        rawDateString,
      },
    };
  }

  /**
   * Extrae el monto numérico en formato decimal (ej: 349.00)
   */
  private extractAmount(text: string): number | null {
    const patterns = [
      /\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/,
      /(?:por|monto|de)\s*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2}))/i,
      /([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2}))\s*(?:MXN|pesos)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const cleaned = match[1].replace(/,/g, '');
        const val = parseFloat(cleaned);
        if (!isNaN(val) && val > 0) {
          return Math.round(val * 100) / 100;
        }
      }
    }

    return null;
  }

  /**
   * Determina la dirección del flujo de dinero (Gasto, Ingreso o Transferencia).
   */
  private detectType(text: string): TransactionType {
    // Ingresos: depósitos, abonos, nómina, transferencias recibidas
    if (
      /dep[oó]sito\b/i.test(text) ||
      /abono\b/i.test(text) ||
      /n[oó]mina\b/i.test(text) ||
      /transferencia recibida\b/i.test(text) ||
      /recibiste\b/i.test(text) ||
      /te transfiri[oó]\b/i.test(text)
    ) {
      return 'INCOME';
    }

    // Transferencias entre cuentas propias
    if (
      /traspaso entre (?:tus |mis )?cuentas\b/i.test(text) ||
      /transferencia a cuenta propia\b/i.test(text)
    ) {
      return 'TRANSFER';
    }

    // Por defecto en BBVA las notificaciones de compra, cargo, retiro y pago son gastos
    return 'EXPENSE';
  }

  /**
   * Extrae el nombre del comercio, contraparte, concepto y detalles operativos.
   */
  private extractMerchantAndDetails(
    text: string,
    type: TransactionType,
  ): {
    merchantRaw: string | null;
    merchant: string | null;
    concept?: string;
    isAtm?: boolean;
    isWithoutCard?: boolean;
    isSpei?: boolean;
    pattern?: string;
  } {
    let merchantRaw: string | null = null;
    let concept: string | undefined;
    let isAtm = false;
    let isWithoutCard = false;
    let isSpei = /spei\b/i.test(text);
    let pattern = 'UNKNOWN';

    // ── Caso A: Retiros en Cajero / Sin Tarjeta ──────────────────────────────
    if (/retiro/i.test(text)) {
      isAtm = true;
      isWithoutCard = /sin tarjeta/i.test(text);
      merchantRaw = isWithoutCard ? 'Retiro sin Tarjeta BBVA' : 'Cajero Automático BBVA';
      pattern = 'ATM_WITHDRAWAL';
      return {
        merchantRaw,
        merchant: merchantRaw,
        isAtm,
        isWithoutCard,
        isSpei,
        pattern,
      };
    }

    // ── Caso B: Transferencias Recibidas (Ingreso) ───────────────────────────
    if (type === 'INCOME') {
      const matchSender = text.match(
        /\b(?:de|desde)\b\s+([A-Za-z0-9áéíóúÁÉÍÓÚñÑüÜ\s._&'’"-]+?)(?:\s+\b(?:concepto|el|por|a\s+las)\b|\s*\.|$)/i,
      );
      if (matchSender && matchSender[1]) {
        merchantRaw = matchSender[1].trim();
        pattern = 'TRANSFER_INCOME';
      }

      const matchConcept = text.match(/\b(?:concepto)\b\s+([A-Za-z0-9áéíóúÁÉÍÓÚñÑüÜ\s._&'’"-]+?)(?:\s+\b(?:el|por)\b|\s*\.|$)/i);
      if (matchConcept && matchConcept[1]) {
        concept = matchConcept[1].trim();
      }

      if (!merchantRaw && /n[oó]mina/i.test(text)) {
        merchantRaw = 'Depósito de Nómina';
      } else if (!merchantRaw && /practicaja/i.test(text)) {
        merchantRaw = 'Depósito en Practicaja BBVA';
      }
    }

    // ── Caso C: Transferencias Enviadas (Gasto) ──────────────────────────────
    if (type === 'EXPENSE' && /transferencia enviada|enviaste/i.test(text)) {
      const matchRecipient = text.match(
        /\b(?:a|para)\b\s+([A-Za-z0-9áéíóúÁÉÍÓÚñÑüÜ\s._&'’"-]+?)(?:\s+\b(?:concepto|el|por|a\s+las)\b|\s*\.|$)/i,
      );
      if (matchRecipient && matchRecipient[1]) {
        merchantRaw = matchRecipient[1].trim();
        pattern = 'TRANSFER_EXPENSE';
      }

      const matchConcept = text.match(/\b(?:concepto)\b\s+([A-Za-z0-9áéíóúÁÉÍÓÚñÑüÜ\s._&'’"-]+?)(?:\s+\b(?:el|por)\b|\s*\.|$)/i);
      if (matchConcept && matchConcept[1]) {
        concept = matchConcept[1].trim();
      }
    }

    // ── Caso D: Compras y Cargos en Comercios ────────────────────────────────
    if (!merchantRaw) {
      // Patrón 1: "Compra por $X en [Comercio] con tarjeta..."
      const matchIn = text.match(
        /\b(?:en)\b\s+([A-Za-z0-9áéíóúÁÉÍÓÚñÑüÜ\s._&'’"-]+?)(?:\s+\b(?:con|el|por|a\s+las)\b|\s*,\s*el|\s*\.|$)/i,
      );
      if (matchIn && matchIn[1]) {
        merchantRaw = matchIn[1].trim();
        pattern = 'MERCHANT_IN';
      }
    }

    // ── Caso E: Pago de Servicios ───────────────────────────────────────────
    if (!merchantRaw && /pago de servicio/i.test(text)) {
      const matchService = text.match(/(?:pago de servicio(?:\s+por\s+\$?[0-9,.]+)?\s*(?:en)?)\s+([A-Za-z0-9áéíóúÁÉÍÓÚñÑüÜ\s._&'’"-]+?)(?:\s+\b(?:el)\b|\s*\.|$)/i);
      if (matchService && matchService[1]) {
        merchantRaw = matchService[1].trim();
        pattern = 'SERVICE_PAYMENT';
      }
    }

    // ── Caso F: Traspasos entre cuentas ─────────────────────────────────────
    if (type === 'TRANSFER') {
      merchantRaw = 'Traspaso entre cuentas propias';
      pattern = 'INTERNAL_TRANSFER';
    }

    // Normalizar merchant si existe
    const merchant = merchantRaw ? this.normalizeMerchant(merchantRaw) : null;

    return {
      merchantRaw,
      merchant,
      concept,
      isAtm,
      isWithoutCard,
      isSpei,
      pattern,
    };
  }

  /**
   * Extrae la fecha y hora si viene en el texto de la notificación BBVA.
   * Ej: "el 25/09/2026 a las 14:30 hrs" o "el 25-09-2026"
   */
  private extractOccurredAt(
    text: string,
    rawEvent: RawEvent,
  ): { date: Date; rawDateString?: string } {
    // Patrón: "el DD/MM/YYYY" opcionalmente "a las HH:MM"
    const dateMatch = text.match(
      /(?:el)\s+([0-9]{1,2}[\/-][0-9]{1,2}[\/-][0-9]{2,4})(?:\s+a\s+las\s+([0-9]{1,2}:[0-9]{2}))?/i,
    );

    if (dateMatch && dateMatch[1]) {
      const datePart = dateMatch[1].replace(/-/g, '/');
      const timePart = dateMatch[2] || '12:00';
      const parts = datePart.split('/');

      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // 0-indexed
        let year = parseInt(parts[2], 10);
        if (year < 100) year += 2000;

        const timeParts = timePart.split(':');
        const hours = parseInt(timeParts[0], 10);
        const minutes = parseInt(timeParts[1], 10);

        const parsedDate = new Date(year, month, day, hours, minutes);
        if (!isNaN(parsedDate.getTime())) {
          return { date: parsedDate, rawDateString: dateMatch[0] };
        }
      }
    }

    // Fallback al timestamp recibido del evento o fecha actual
    const fallbackDate = rawEvent.receivedAt || new Date();
    return { date: fallbackDate };
  }

  /**
   * Extrae indicios de cuenta: últimos 4 dígitos y tipo de tarjeta/cuenta.
   */
  private extractAccountHint(text: string): AccountHint | undefined {
    let last4Digits: string | undefined;
    let accountType: AccountHint['accountType'] = undefined;

    // Buscar últimos 4 dígitos: "*1234", "tarjeta 1234", "cuenta 1234", "terminación 1234"
    const cardMatch = text.match(
      /(?:tarjeta|cta|cuenta|terminaci[oó]n|\*)\s*(?:d[eé]bito|cr[eé]dito)?\s*\*?([0-9]{4})/i,
    );
    if (cardMatch && cardMatch[1]) {
      last4Digits = cardMatch[1];
    }

    // Determinar tipo de cuenta/tarjeta
    if (/cr[eé]dito|azul|oro|platinum|infinita/i.test(text)) {
      accountType = 'CREDIT';
    } else if (/d[eé]bito|libret[oó]n|ahorro/i.test(text)) {
      accountType = 'DEBIT';
    } else if (/cheques/i.test(text)) {
      accountType = 'CHECKING';
    }

    if (!last4Digits && !accountType) return undefined;

    return {
      last4Digits,
      accountType,
      bankName: 'BBVA',
    };
  }

  /**
   * Limpia y normaliza el nombre del comercio (elimina espacios redundantes y sufijos comunes).
   */
  private normalizeMerchant(raw: string): string {
    return raw
      .replace(/\s+/g, ' ')
      .replace(/[\s.,;:]+$/, '')
      .trim();
  }
}
