/**
 * US-026: Motor de Detección de Duplicados (Duplicate Detector Service)
 *
 * Previene la duplicación de transacciones y candidatos originados desde múltiples
 * fuentes heterogéneas (notificaciones push, estados de cuenta bancarios, correos y registros manuales).
 *
 * Criterios de Aceptación (US-026):
 * - Coincidencias exactas (Exact match) basadas en el fingerprint determinístico (US-025).
 * - Coincidencias aproximadas (Fuzzy/Approximate match) basadas en ventanas temporales (±48h),
 *   equivalencia de montos/divisas y similitud semántica de comercio (US-024).
 * - No crea duplicados: previene la duplicación en el pipeline.
 * - Marca eventos/candidatos como DUPLICATE cuando corresponda.
 */

import type { Transaction } from '../../models/Transaction';
import type { TransactionCandidate } from '../../models/TransactionCandidate';
import {
  TransactionFingerprintService,
  type FingerprintInput,
} from '../fingerprint/TransactionFingerprintService';
import { MerchantNormalizer } from '../MerchantNormalizer';

export type DuplicateMatchType = 'EXACT' | 'APPROXIMATE' | 'NONE';

export interface DuplicateDetectionResult {
  /** Indica si se detectó un duplicado de acuerdo a los umbrales configurados */
  isDuplicate: boolean;

  /** Tipo de coincidencia detectada */
  matchType: DuplicateMatchType;

  /** Grado de confianza en la duplicidad (0 - 100) */
  confidence: number;

  /** Motivo legible de la decisión */
  reason: string;

  /** Entidad existente con la cual se generó el match */
  matchedEntity?: {
    type: 'TRANSACTION' | 'CANDIDATE';
    id: string;
    fingerprint?: string | null;
  };

  /** Huella determinística de la coincidencia si aplica */
  matchedFingerprint?: string;

  /** Desglose de factores que sustentan el resultado */
  details?: {
    amountDifferenceMinor: number;
    hoursDifference: number;
    merchantSimilarity: number;
    accountCompatible: boolean;
    fingerprintMatch: boolean;
  };
}

export interface DuplicateDetectorConfig {
  /** Ventana máxima de tolerancia temporal en horas (por defecto 48h / 2 días) */
  maxHoursDifference?: number;

  /** Umbral mínimo de similitud de comercio para coincidencia aproximada (0.0 a 1.0, por defecto 0.70) */
  minMerchantSimilarity?: number;

  /** Umbral mínimo de confianza global para clasificar como duplicado (0 a 100, por defecto 75) */
  minConfidenceThreshold?: number;

  /** Si es false, solo ejecuta coincidencias exactas por fingerprint (por defecto true) */
  enableApproximateMatching?: boolean;
}

export class DuplicateDetectorService {
  private static merchantNormalizer = new MerchantNormalizer();

  /**
   * Evalúa un evento objetivo frente a un catálogo existente de transacciones y candidatos.
   */
  public static detectDuplicate(
    target: FingerprintInput | TransactionCandidate,
    existing: {
      transactions?: Transaction[];
      candidates?: TransactionCandidate[];
    },
    config?: DuplicateDetectorConfig,
  ): DuplicateDetectionResult {
    const transactions = existing.transactions || [];
    const candidates = existing.candidates || [];

    const targetInput = this.toFingerprintInput(target);
    const targetFp = TransactionFingerprintService.calculate(targetInput);

    // ── 1. Búsqueda de Coincidencias Exactas por Fingerprint ─────────────────
    // Primero contrastamos contra transacciones confirmadas/asentadas (mayor autoridad)
    for (const tx of transactions) {
      if (tx.status === 'DUPLICATE' || tx.status === 'REJECTED') continue;

      const txFp = tx.fingerprint || TransactionFingerprintService.fromTransaction(tx);
      if (txFp === targetFp) {
        return {
          isDuplicate: true,
          matchType: 'EXACT',
          confidence: 100,
          reason: `Coincidencia exacta por huella determinística contra transacción existente (${tx.id})`,
          matchedEntity: {
            type: 'TRANSACTION',
            id: tx.id,
            fingerprint: txFp,
          },
          matchedFingerprint: txFp,
          details: {
            amountDifferenceMinor: 0,
            hoursDifference: 0,
            merchantSimilarity: 1.0,
            accountCompatible: true,
            fingerprintMatch: true,
          },
        };
      }
    }

    // Luego contrastamos contra otros candidatos existentes
    for (const cand of candidates) {
      // Ignorar si se compara contra sí mismo o si ya estaba rechazado
      if ('id' in target && cand.id === target.id) continue;
      if (cand.status === 'REJECTED') continue;

      const candFp = cand.fingerprint || TransactionFingerprintService.fromCandidate(cand);
      if (candFp === targetFp) {
        return {
          isDuplicate: true,
          matchType: 'EXACT',
          confidence: 100,
          reason: `Coincidencia exacta por huella determinística contra candidato existente (${cand.id})`,
          matchedEntity: {
            type: 'CANDIDATE',
            id: cand.id,
            fingerprint: candFp,
          },
          matchedFingerprint: candFp,
          details: {
            amountDifferenceMinor: 0,
            hoursDifference: 0,
            merchantSimilarity: 1.0,
            accountCompatible: true,
            fingerprintMatch: true,
          },
        };
      }
    }

    // Si la coincidencia aproximada está deshabilitada, retornamos sin duplicado
    if (config?.enableApproximateMatching === false) {
      return this.noneResult();
    }

    // ── 2. Búsqueda de Coincidencias Aproximadas (Fuzzy Matching) ────────────
    let bestMatch: DuplicateDetectionResult | null = null;

    // Comparar contra transacciones
    for (const tx of transactions) {
      if (tx.status === 'DUPLICATE' || tx.status === 'REJECTED') continue;

      const approx = this.evaluateApproximate(targetInput, {
        id: tx.id,
        entityType: 'TRANSACTION',
        account: tx.accountId,
        amountMinor: tx.amountMinor,
        currency: tx.currency,
        date: tx.occurredAt,
        merchant: tx.merchant || tx.merchantRaw || '',
        type: tx.type,
      }, config);

      if (approx.isDuplicate && (!bestMatch || approx.confidence > bestMatch.confidence)) {
        bestMatch = approx;
      }
    }

    // Comparar contra candidatos
    for (const cand of candidates) {
      if ('id' in target && cand.id === target.id) continue;
      if (cand.status === 'REJECTED') continue;

      const approx = this.evaluateApproximate(targetInput, {
        id: cand.id,
        entityType: 'CANDIDATE',
        account: cand.accountHint ? TransactionFingerprintService.normalizeAccount(cand.accountHint) : 'unassigned',
        amountMinor: cand.amountMinor,
        currency: cand.currency,
        date: cand.occurredAt,
        merchant: cand.merchant || cand.merchantRaw || '',
        type: cand.type,
      }, config);

      if (approx.isDuplicate && (!bestMatch || approx.confidence > bestMatch.confidence)) {
        bestMatch = approx;
      }
    }

    return bestMatch || this.noneResult();
  }

  /**
   * Evalúa la coincidencia aproximada entre el evento objetivo y un registro candidato.
   */
  private static evaluateApproximate(
    target: FingerprintInput,
    existing: {
      id: string;
      entityType: 'TRANSACTION' | 'CANDIDATE';
      account: string;
      amountMinor: number;
      currency: string;
      date: Date | string;
      merchant: string;
      type: string;
    },
    config?: DuplicateDetectorConfig,
  ): DuplicateDetectionResult {
    const maxHours = config?.maxHoursDifference ?? 48; // ± 48 horas de tolerancia
    const minMerchantSim = config?.minMerchantSimilarity ?? 0.70;
    const minConfidence = config?.minConfidenceThreshold ?? 75;

    // Regla 1: El tipo y la moneda deben coincidir estrictamente
    const targetType = TransactionFingerprintService.normalizeType(target.type);
    const existingType = TransactionFingerprintService.normalizeType(existing.type);
    if (targetType !== existingType) {
      return this.noneResult();
    }

    const targetCurrency = TransactionFingerprintService.normalizeCurrency(target.currency);
    const existingCurrency = TransactionFingerprintService.normalizeCurrency(existing.currency);
    if (targetCurrency !== existingCurrency) {
      return this.noneResult();
    }

    // Regla 2: El monto debe ser idéntico
    const targetAmountMinor = TransactionFingerprintService.normalizeAmountMinor({
      amount: target.amount,
      amountMinor: target.amountMinor,
    });
    const amountDiff = Math.abs(targetAmountMinor - existing.amountMinor);
    if (amountDiff !== 0) {
      return this.noneResult();
    }

    // Regla 3: Ventana temporal dentro de maxHours
    const targetDate = new Date(target.date);
    const existingDate = new Date(existing.date);
    const hoursDiff = Math.abs(targetDate.getTime() - existingDate.getTime()) / (1000 * 60 * 60);
    if (hoursDiff > maxHours) {
      return this.noneResult();
    }

    // Regla 4: Compatibilidad de cuentas
    const targetAccount = TransactionFingerprintService.normalizeAccount(target.account);
    const existingAccount = existing.account.toLowerCase();
    const accountCompatible =
      targetAccount === 'unassigned' ||
      existingAccount === 'unassigned' ||
      targetAccount === existingAccount ||
      this.areAccountHintsCompatible(targetAccount, existingAccount);

    if (!accountCompatible) {
      return this.noneResult();
    }

    // Regla 5: Similitud semántica de comercio
    const merchantSimilarity = this.calculateMerchantSimilarity(
      target.merchant || '',
      existing.merchant,
    );
    if (merchantSimilarity < minMerchantSim) {
      return this.noneResult();
    }

    // ── Cálculo del Score de Confianza (75 - 95) ──
    let score = 95;

    // Penalización por desfase temporal (hasta -10 pts)
    const timePenalty = (hoursDiff / maxHours) * 10;
    score -= timePenalty;

    // Penalización por variación tipográfica de comercio (hasta -10 pts)
    const merchantPenalty = (1.0 - merchantSimilarity) * 10;
    score -= merchantPenalty;

    // Leve penalización si una de las cuentas está sin asignar
    if (targetAccount === 'unassigned' || existingAccount === 'unassigned') {
      score -= 3;
    }

    const finalConfidence = Math.max(0, Math.min(99, Math.round(score)));

    if (finalConfidence >= minConfidence) {
      return {
        isDuplicate: true,
        matchType: 'APPROXIMATE',
        confidence: finalConfidence,
        reason: `Coincidencia aproximada detectada con ${existing.entityType.toLowerCase()} (${existing.id}) por monto idéntico (${targetAmountMinor / 100} ${targetCurrency}), fechas cercanas (${hoursDiff.toFixed(1)}h de diferencia) y comercio similar (${Math.round(merchantSimilarity * 100)}%)`,
        matchedEntity: {
          type: existing.entityType,
          id: existing.id,
        },
        details: {
          amountDifferenceMinor: amountDiff,
          hoursDifference: Math.round(hoursDiff * 10) / 10,
          merchantSimilarity: Math.round(merchantSimilarity * 100) / 100,
          accountCompatible,
          fingerprintMatch: false,
        },
      };
    }

    return this.noneResult();
  }

  /**
   * Calcula la similitud semántica y léxica entre dos nombres de comercios (0.0 a 1.0).
   * Integra la normalización canónica de US-024.
   */
  public static calculateMerchantSimilarity(merchantA: string, merchantB: string): number {
    const rawA = (merchantA || '').trim().toLowerCase();
    const rawB = (merchantB || '').trim().toLowerCase();

    if (!rawA && !rawB) return 1.0;
    if (!rawA || !rawB) return 0.0;
    if (rawA === rawB) return 1.0;

    // 1. Si ambos normalizan al mismo comercio canónico (US-024), coincidencia completa
    const normA = this.merchantNormalizer.normalizeSync(rawA);
    const normB = this.merchantNormalizer.normalizeSync(rawB);

    if (
      normA.canonicalName &&
      normB.canonicalName &&
      normA.canonicalName.toLowerCase() === normB.canonicalName.toLowerCase()
    ) {
      return 1.0;
    }

    // 2. Si uno contiene al otro como subcadena limpia
    const cleanA = rawA.replace(/[^a-z0-9]/g, '');
    const cleanB = rawB.replace(/[^a-z0-9]/g, '');
    if (cleanA && cleanB) {
      if (cleanA === cleanB) return 1.0;
      if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) {
        const shorter = Math.min(cleanA.length, cleanB.length);
        const longer = Math.max(cleanA.length, cleanB.length);
        return Math.max(0.85, shorter / longer);
      }
    }

    // 3. Similitud por tokens/palabras compartidas (Jaccard)
    const tokensA = new Set(rawA.split(/\s+/).filter((t) => t.length > 2));
    const tokensB = new Set(rawB.split(/\s+/).filter((t) => t.length > 2));

    let intersection = 0;
    for (const t of tokensA) {
      if (tokensB.has(t)) intersection++;
    }
    const union = new Set([...tokensA, ...tokensB]).size;
    if (union > 0) {
      const tokenScore = intersection / union;
      if (tokenScore >= 0.5) return tokenScore;
    }

    // 4. Distancia de Levenshtein normalizada
    const dist = this.levenshteinDistance(rawA, rawB);
    const maxLen = Math.max(rawA.length, rawB.length);
    if (maxLen === 0) return 1.0;

    return Math.max(0, 1.0 - dist / maxLen);
  }

  /**
   * Distancia de Levenshtein entre dos cadenas.
   */
  private static levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // sustitución
            matrix[i][j - 1] + 1,     // inserción
            matrix[i - 1][j] + 1,     // eliminación
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Comprueba si dos cuentas o indicios de cuenta comparten los mismos últimos 4 dígitos o bancos compatibles.
   */
  private static areAccountHintsCompatible(accountA: string, accountB: string): boolean {
    const digitsA = accountA.replace(/\D/g, '');
    const digitsB = accountB.replace(/\D/g, '');

    if (digitsA.length >= 4 && digitsB.length >= 4) {
      const last4A = digitsA.slice(-4);
      const last4B = digitsB.slice(-4);
      if (last4A !== last4B) {
        return false;
      }
      return true;
    }

    return this.areBanksCompatible(accountA, accountB);
  }

  /**
   * Comprueba si dos identificadores de cuenta hacen referencia al mismo banco sin contradicción.
   */
  private static areBanksCompatible(accountA: string, accountB: string): boolean {
    const knownBanks = [
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
    let bankA: string | null = null;
    let bankB: string | null = null;

    for (const bank of knownBanks) {
      if (!bankA && accountA.includes(bank)) bankA = bank;
      if (!bankB && accountB.includes(bank)) bankB = bank;
    }

    // Si ambos especifican un banco conocido, deben coincidir
    if (bankA && bankB) {
      return bankA === bankB;
    }

    return true;
  }

  /**
   * Transforma una entrada polimórfica a FingerprintInput.
   */
  private static toFingerprintInput(target: FingerprintInput | TransactionCandidate): FingerprintInput {
    if ('rawEventId' in target) {
      return {
        account: target.accountHint ? TransactionFingerprintService.normalizeAccount(target.accountHint) : 'unassigned',
        amountMinor: target.amountMinor,
        currency: target.currency,
        date: target.occurredAt,
        merchant: target.merchant || target.merchantRaw || '',
        type: target.type,
      };
    }
    return target;
  }

  private static noneResult(): DuplicateDetectionResult {
    return {
      isDuplicate: false,
      matchType: 'NONE',
      confidence: 0,
      reason: 'No se encontraron coincidencias de duplicados',
    };
  }
}
