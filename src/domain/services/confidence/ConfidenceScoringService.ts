/**
 * US-029: ConfidenceScoringService — Motor Determinístico y Reproducible de Confianza
 *
 * Criterios de Aceptación:
 * - Score reproducible ante idénticas entradas (función pura).
 * - Reglas iniciales formalizadas para:
 *   1. Múltiples fuentes (corroboración cruzada acumulativa).
 *   2. Extractos bancarios (Statements: PDF, CSV, XLSX - máxima autoridad contable).
 *   3. Notificaciones push (Notifications - alta inmediatez).
 *   4. Correos electrónicos (Emails - comprobantes digitales estructurados).
 *   5. OCR (tickets y recibos físicos fotografiados - calidad visual e indicadores fiscales).
 * - Puntuación acotada entre 0 y 100 y almacenada en TransactionCandidate / Transaction.
 */

import type { RawEventSource } from '../../models/RawEvent';
import type { Transaction, TransactionSource } from '../../models/Transaction';
import type { TransactionCandidate, AccountHint } from '../../models/TransactionCandidate';
import { MerchantNormalizer } from '../MerchantNormalizer';
import {
  ConfidenceThresholdService,
  type ConfidenceThresholds,
  type ConfidenceThresholdDecision,
} from './ConfidenceThresholdService';

export type ConfidenceSourceCategory =
  | 'STATEMENT'     // BANK_PDF, BANK_CSV, BANK_XLSX, STATEMENT_PDF, etc.
  | 'NOTIFICATION'  // ANDROID_NOTIFICATION, NOTIFICATION
  | 'EMAIL'         // EMAIL
  | 'OCR'           // OCR / Tickets escaneados
  | 'SMS'           // SMS bancario
  | 'MANUAL';       // MANUAL, MANUAL_IMPORT

export interface OCRMetadata {
  /** Si el motor de OCR reconoció la etiqueta explícita de "TOTAL" o "IMPORTE" */
  hasTotalField?: boolean;

  /** Si detectó identificador fiscal formal (ej: RFC en México, CIF, Folio fiscal) */
  hasFiscalId?: boolean;

  /** Si contiene desglose de conceptos o ítems */
  hasItemizedDetails?: boolean;

  /** Si la imagen o el texto presenta ruido visual o artefactos */
  isBlurredOrNoisy?: boolean;

  /** Puntuación de confianza nativa del motor de OCR (0 - 100) */
  confidenceReportedByEngine?: number;
}

export interface ConfidenceScoreInput {
  /** Fuente del evento o transacción */
  source: RawEventSource | TransactionSource | string;

  /** Monto en formato decimal estándar (ej: 149.50) */
  amount?: number;

  /** Monto en unidades menores (centavos) */
  amountMinor?: number;

  /** Divisa ISO 4217 (ej: 'MXN') */
  currency?: string | null;

  /** Fecha y hora del movimiento */
  occurredAt?: Date | string | null;

  /** Nombre del comercio limpio o normalizado */
  merchant?: string | null;

  /** Nombre crudo del comercio capturado en el texto de origen */
  merchantRaw?: string | null;

  /** Indicios de cuenta financiera (últimos 4 dígitos, banco) */
  accountHint?: AccountHint | string | null;

  /** Proveedor detectado (ej: 'BBVA', 'NU', 'SANTANDER', 'GENERIC') */
  provider?: string | null;

  /** Cantidad de fuentes independientes que corroboran la operación */
  sourcesCount?: number;

  /** Si al menos una de las fuentes corroborantes es un estado de cuenta bancario */
  hasStatementSource?: boolean;

  /** Metadatos específicos de captura visual OCR si aplica */
  ocrDetails?: OCRMetadata;

  /** Payload o metadatos adicionales del evento crudo */
  rawPayload?: Record<string, unknown> | null;
}

export interface ConfidenceScoreBreakdown {
  baseScore: number;
  accountModifier: number;
  merchantModifier: number;
  amountModifier: number;
  dateModifier: number;
  providerModifier: number;
  multiSourceModifier: number;
  ocrModifier: number;
  penalties: number;
}

export interface ConfidenceEvaluationResult {
  /** Puntuación entera reproducible entre 0 y 100 */
  score: number;

  /** Categoría canónica de la fuente */
  category: ConfidenceSourceCategory;

  /** Nivel de confianza ('HIGH' >= 85, 'MEDIUM' 70-84, 'LOW' < 70) */
  tier: 'HIGH' | 'MEDIUM' | 'LOW';

  /** Desglose aditivo de modificadores aplicados */
  breakdown: ConfidenceScoreBreakdown;

  /** Factores explicativos en lenguaje natural */
  factors: string[];
}

export class ConfidenceScoringService {
  private static merchantNormalizer = new MerchantNormalizer();

  private static readonly KNOWN_BANKS = [
    'bbva',
    'banorte',
    'santander',
    'citibanamex',
    'banamex',
    'nu',
    'hsbc',
    'scotiabank',
    'azteca',
    'inbursa',
    'mercadopago',
    'rappi',
  ];

  /**
   * Clasifica una fuente en su categoría canónica de confianza.
   */
  public static getCategory(source: string): ConfidenceSourceCategory {
    const s = (source || '').toUpperCase();

    if (
      s.includes('STATEMENT') ||
      s.includes('BANK_PDF') ||
      s.includes('BANK_CSV') ||
      s.includes('BANK_XLSX') ||
      s.includes('PDF') ||
      s.includes('CSV') ||
      s.includes('XLSX')
    ) {
      return 'STATEMENT';
    }

    if (s.includes('NOTIFICATION') || s.includes('PUSH') || s.includes('ANDROID')) {
      return 'NOTIFICATION';
    }

    if (s.includes('EMAIL') || s.includes('GMAIL') || s.includes('OUTLOOK')) {
      return 'EMAIL';
    }

    if (s.includes('OCR') || s.includes('RECEIPT') || s.includes('TICKET') || s.includes('SCAN')) {
      return 'OCR';
    }

    if (s.includes('SMS')) {
      return 'SMS';
    }

    if (s.includes('MANUAL')) {
      return 'MANUAL';
    }

    return 'NOTIFICATION';
  }

  /**
   * Determina el nivel de confianza (tier) a partir del score numérico.
   */
  public static getTier(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (score >= 85) return 'HIGH';
    if (score >= 70) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Evalúa y calcula la puntuación determinística de confianza con desglose completo.
   */
  public static evaluate(input: ConfidenceScoreInput): ConfidenceEvaluationResult {
    const category = this.getCategory(input.source);
    const factors: string[] = [];

    // ── 1. Puntuación Base por Categoría de Fuente ───────────────────────────
    let baseScore = 80;
    switch (category) {
      case 'STATEMENT':
        baseScore = 92;
        factors.push('Base alta por estado de cuenta bancario oficial (+92)');
        break;
      case 'NOTIFICATION':
        baseScore = 85;
        factors.push('Base por notificación push bancaria en tiempo real (+85)');
        break;
      case 'EMAIL':
        baseScore = 78;
        factors.push('Base por comprobante digital estructurado vía email (+78)');
        break;
      case 'OCR':
        baseScore = 65;
        factors.push('Base por captura visual física OCR (+65)');
        break;
      case 'SMS':
        baseScore = 75;
        factors.push('Base por mensaje SMS bancario (+75)');
        break;
      case 'MANUAL':
        baseScore = 95;
        factors.push('Base por registro manual explícito del usuario (+95)');
        break;
    }

    // ── 2. Modificador por Cuenta / Tarjeta ──────────────────────────────────
    let accountModifier = 0;
    const accountHint = input.accountHint;
    const accountStr =
      typeof accountHint === 'string'
        ? accountHint
        : accountHint
        ? `${accountHint.bankName || ''} ${accountHint.last4Digits || ''}`
        : '';

    const digits = accountStr.replace(/\D/g, '');
    const has4Digits = digits.length >= 4;
    const hasBank = this.KNOWN_BANKS.some((b) => accountStr.toLowerCase().includes(b));

    if (has4Digits && hasBank) {
      accountModifier += 5;
      factors.push('Cuenta con banco reconocido y últimos 4 dígitos (+5)');
    } else if (has4Digits) {
      accountModifier += 3;
      factors.push('Cuenta con últimos 4 dígitos (+3)');
    } else if (hasBank) {
      accountModifier += 2;
      factors.push('Banco emisor identificado (+2)');
    } else if (category !== 'OCR' && (!accountStr || accountStr.toLowerCase() === 'unassigned')) {
      accountModifier -= 4;
      factors.push('Sin indicio de cuenta financiera asociada (-4)');
    }

    // ── 3. Modificador por Comercio ─────────────────────────────────────────
    let merchantModifier = 0;
    const merchantName = (input.merchant || '').trim();
    const merchantRaw = (input.merchantRaw || '').trim();

    if (merchantName) {
      const normalized = this.merchantNormalizer.normalizeSync(merchantName);
      if (Boolean(normalized.ruleId)) {
        merchantModifier += 6;
        factors.push(`Comercio canónico normalizado exitosamente (${normalized.canonicalName}) (+6)`);
      } else {
        merchantModifier += 4;
        factors.push(`Nombre de comercio identificado (${merchantName}) (+4)`);
      }
    } else if (merchantRaw && merchantRaw.length >= 3) {
      merchantModifier += 2;
      factors.push('Nombre crudo de comercio presente (+2)');
    } else {
      merchantModifier -= 10;
      factors.push('Sin identificación de comercio contraparte (-10)');
    }

    // ── 4. Modificador por Monto y Moneda ───────────────────────────────────
    let amountModifier = 0;
    let penalties = 0;

    const amountMinor =
      input.amountMinor !== undefined
        ? input.amountMinor
        : input.amount !== undefined
        ? Math.round(input.amount * 100)
        : null;

    if (amountMinor === null || isNaN(amountMinor) || amountMinor <= 0) {
      penalties += 35;
      factors.push('Monto inválido, ausente o menor o igual a cero (-35)');
    } else {
      amountModifier += 3;
      factors.push('Monto monetario exacto y válido (+3)');
    }

    const currency = (input.currency || '').toUpperCase();
    if (['MXN', 'USD', 'EUR', 'CAD', 'GBP'].includes(currency)) {
      amountModifier += 2;
      factors.push(`Moneda estándar reconocida (${currency}) (+2)`);
    } else if (currency) {
      amountModifier -= 3;
      factors.push(`Moneda no habitual (${currency}) (-3)`);
    } else {
      penalties += 5;
      factors.push('Moneda no especificada (-5)');
    }

    // ── 5. Modificador por Precisión Temporal (Fecha) ────────────────────────
    let dateModifier = 0;
    if (input.occurredAt) {
      const d = new Date(input.occurredAt);
      if (isNaN(d.getTime())) {
        penalties += 15;
        factors.push('Fecha inválida o no parseable (-15)');
      } else {
        const now = new Date();
        const diffDays = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays > 2) {
          penalties += 20;
          factors.push('Fecha en el futuro anómala (> 2 días) (-20)');
        } else {
          dateModifier += 3;
          factors.push('Fecha de ocurrencia temporalmente consistente (+3)');
        }
      }
    } else {
      penalties += 10;
      factors.push('Fecha de ocurrencia ausente (-10)');
    }

    // ── 6. Modificador por Fiabilidad del Proveedor ──────────────────────────
    let providerModifier = 0;
    const provider = (input.provider || '').toLowerCase();
    if (provider && provider !== 'generic' && provider !== 'unknown') {
      providerModifier += 4;
      factors.push(`Proveedor financiero validado (${input.provider}) (+4)`);
    }

    // ── 7. Modificador Específico para OCR ───────────────────────────────────
    let ocrModifier = 0;
    if (category === 'OCR' && input.ocrDetails) {
      const ocr = input.ocrDetails;

      if (ocr.hasTotalField) {
        ocrModifier += 8;
        factors.push('Etiqueta explícita de TOTAL/IMPORTE localizada en OCR (+8)');
      }

      if (ocr.hasFiscalId) {
        ocrModifier += 7;
        factors.push('Identificador fiscal (RFC/Folio) detectado en el ticket (+7)');
      }

      if (ocr.hasItemizedDetails) {
        ocrModifier += 4;
        factors.push('Desglose de conceptos/ítems presente en OCR (+4)');
      }

      if (ocr.isBlurredOrNoisy) {
        penalties += 15;
        factors.push('Imagen o texto con ruido visual/desenfoque (-15)');
      }

      if (ocr.confidenceReportedByEngine !== undefined) {
        if (ocr.confidenceReportedByEngine >= 85) {
          ocrModifier += 4;
          factors.push(`Alta confianza nativa del motor OCR (${ocr.confidenceReportedByEngine}%) (+4)`);
        } else if (ocr.confidenceReportedByEngine < 60) {
          penalties += 8;
          factors.push(`Baja confianza del motor OCR (${ocr.confidenceReportedByEngine}%) (-8)`);
        }
      }
    }

    // ── 8. Regla de Múltiples Fuentes (Corroboración Cruzada) ────────────────
    let multiSourceModifier = 0;
    const sourcesCount = Math.max(1, input.sourcesCount ?? 1);

    if (sourcesCount >= 3) {
      multiSourceModifier += 15;
      factors.push(`Triple corroboración de fuentes independientes (${sourcesCount} fuentes) (+15)`);
    } else if (sourcesCount === 2) {
      multiSourceModifier += 10;
      factors.push('Doble corroboración de fuentes independientes (+10)');
    }

    if (sourcesCount > 1 && input.hasStatementSource) {
      multiSourceModifier += 5;
      factors.push('Corroboración respaldada con extracto bancario oficial (+5)');
    }

    // ── 9. Cálculo Acumulado y Delimitación Exacta [0, 100] ──────────────────
    const rawTotal =
      baseScore +
      accountModifier +
      merchantModifier +
      amountModifier +
      dateModifier +
      providerModifier +
      ocrModifier +
      multiSourceModifier -
      penalties;

    const finalScore = Math.max(0, Math.min(100, Math.round(rawTotal)));
    const tier = this.getTier(finalScore);

    return {
      score: finalScore,
      category,
      tier,
      breakdown: {
        baseScore,
        accountModifier,
        merchantModifier,
        amountModifier,
        dateModifier,
        providerModifier,
        ocrModifier,
        multiSourceModifier,
        penalties,
      },
      factors,
    };
  }

  /**
   * Calcula directamente el número entero de confianza [0 - 100] para un input.
   */
  public static calculate(input: ConfidenceScoreInput): number {
    return this.evaluate(input).score;
  }

  /**
   * Evalúa la confianza de un TransactionCandidate existente.
   */
  public static evaluateCandidate(
    candidate: TransactionCandidate,
    options?: {
      additionalSourcesCount?: number;
      hasStatementSource?: boolean;
    },
  ): ConfidenceEvaluationResult {
    const ocrDetails: OCRMetadata | undefined =
      candidate.source === 'OCR'
        ? {
            hasTotalField: candidate.metadata?.hasTotalField === true,
            hasFiscalId: Boolean(candidate.metadata?.hasFiscalId || candidate.metadata?.rfc),
            hasItemizedDetails: Boolean(candidate.metadata?.hasItemizedDetails),
            isBlurredOrNoisy: candidate.metadata?.isBlurredOrNoisy === true,
            confidenceReportedByEngine: typeof candidate.metadata?.ocrConfidence === 'number'
              ? candidate.metadata.ocrConfidence
              : undefined,
          }
        : undefined;

    return this.evaluate({
      source: candidate.source,
      amount: candidate.amount,
      amountMinor: candidate.amountMinor,
      currency: candidate.currency,
      occurredAt: candidate.occurredAt,
      merchant: candidate.merchant,
      merchantRaw: candidate.merchantRaw,
      accountHint: candidate.accountHint,
      provider: candidate.provider,
      sourcesCount: options?.additionalSourcesCount ? options.additionalSourcesCount + 1 : 1,
      hasStatementSource: options?.hasStatementSource,
      ocrDetails,
      rawPayload: candidate.rawPayload,
    });
  }

  /**
   * Evalúa la confianza de una Transaction canónica existente.
   */
  public static evaluateTransaction(
    transaction: Transaction,
    options?: {
      sourcesCount?: number;
      hasStatementSource?: boolean;
    },
  ): ConfidenceEvaluationResult {
    const sourcesEvidence = transaction.sourcesEvidence || [];
    const count = options?.sourcesCount ?? (sourcesEvidence.length > 0 ? sourcesEvidence.length : 1);
    const hasStatement =
      options?.hasStatementSource ??
      sourcesEvidence.some((s) => this.getCategory(s.source) === 'STATEMENT');

    return this.evaluate({
      source: transaction.source,
      amountMinor: transaction.amountMinor,
      currency: transaction.currency,
      occurredAt: transaction.occurredAt,
      merchant: transaction.merchant,
      merchantRaw: transaction.merchantRaw,
      accountHint: transaction.accountId,
      sourcesCount: count,
      hasStatementSource: hasStatement,
    });
  }

  /**
   * Determina automáticamente el dictamen de umbrales contables (US-030):
   * - ≥90: AUTO_CONFIRM
   * - 70-89: REGISTER_AND_REVIEW
   * - <70: REQUIRE_USER
   */
  public static evaluateDecision(
    inputOrScore: ConfidenceScoreInput | number,
    thresholds?: Partial<ConfidenceThresholds>,
  ): ConfidenceThresholdDecision {
    const score = typeof inputOrScore === 'number' ? inputOrScore : this.calculate(inputOrScore);
    return ConfidenceThresholdService.evaluate(score, thresholds);
  }
}
