/**
 * US-024: Motor de Normalización de Comercios (Merchant Normalizer)
 *
 * Transforma cadenas crudas y heterogéneas de comercios (raw_merchant)
 * provenientes de notificaciones, estados de cuenta y pasarelas de pago,
 * en nombres canónicos limpios (normalized_merchant) agrupando variantes
 * (como Amazon, Uber, Oxxo, etc.) mediante reglas configurables con prioridades.
 *
 * Criterios de Aceptación (US-024):
 * - Conserva raw_merchant intacto y emite normalized_merchant.
 * - Soporta reglas configurables (del sistema y personalizadas).
 * - Agrupa correctamente variantes de Amazon, Uber, Uber Eats, etc.
 * - Desacoplado del modelo final de transacciones.
 */

import type {
  MerchantRule,
  NormalizedMerchantResult,
  MerchantPatternType,
  CreateMerchantRuleDTO,
} from '../models/MerchantRule';
import type { IMerchantRuleRepository } from '../repositories/IMerchantRuleRepository';
import { InMemoryMerchantRuleRepository } from '../../infrastructure/database/InMemoryMerchantRuleRepository';
import { DEFAULT_MERCHANT_RULES } from '../constants/DefaultMerchantRules';

export interface NormalizerOptions {
  userId?: string | null;
  /** Si es true, omite la consulta al repositorio y usa las reglas precargadas */
  useCacheOnly?: boolean;
}

export class MerchantNormalizer {
  private repository: IMerchantRuleRepository;
  private memoryRulesCache: MerchantRule[] = [];

  constructor(repository?: IMerchantRuleRepository) {
    this.repository = repository || new InMemoryMerchantRuleRepository(true);
    // Cargar caché síncrona inicial con reglas por defecto ordenadas
    this.memoryRulesCache = [...DEFAULT_MERCHANT_RULES].sort((a, b) => b.priority - a.priority);
  }

  /**
   * Normaliza un nombre de comercio de forma asíncrona consultando el repositorio
   * configurado (soporta reglas activas del sistema y del usuario).
   */
  public async normalize(
    rawMerchant: string | null | undefined,
    options?: NormalizerOptions,
  ): Promise<NormalizedMerchantResult> {
    if (!rawMerchant || !rawMerchant.trim()) {
      return {
        rawMerchant: rawMerchant ?? null,
        normalizedMerchant: null,
        canonicalName: null,
        confidence: 0,
      };
    }

    const trimmedRaw = rawMerchant.trim();

    // 1. Obtener reglas activas aplicables
    let rules: MerchantRule[];
    if (options?.useCacheOnly) {
      rules = this.memoryRulesCache;
    } else {
      try {
        rules = await this.repository.findActiveRules(options?.userId);
        if (rules.length === 0) {
          rules = this.memoryRulesCache;
        }
      } catch {
        // Fallback resiliente a memoria ante fallo de red/DB
        rules = this.memoryRulesCache;
      }
    }

    // 2. Pre-limpieza de prefijos comunes y ruido para facilitar matching
    const cleaned = this.preCleanMerchant(trimmedRaw);

    // 3. Evaluar reglas configurables por orden de prioridad
    const match = this.findMatchingRule(trimmedRaw, cleaned, rules);
    if (match) {
      return {
        rawMerchant: trimmedRaw,
        normalizedMerchant: match.rule.merchantName,
        canonicalName: match.rule.merchantName,
        ruleId: match.rule.id,
        confidence: match.confidence,
        categoryHint: match.rule.categoryHint,
        matchedPattern: match.pattern,
      };
    }

    // 4. Fallback determinístico inteligente (Title Case y limpieza de sufijos)
    const fallbackNormalized = this.formatFallbackName(cleaned);

    return {
      rawMerchant: trimmedRaw,
      normalizedMerchant: fallbackNormalized,
      canonicalName: fallbackNormalized,
      confidence: fallbackNormalized !== trimmedRaw ? 75 : 60,
    };
  }

  /**
   * Versión síncrona rápida para su uso inmediato en parsers en memoria
   * o entornos sin acceso async.
   */
  public normalizeSync(rawMerchant: string | null | undefined): NormalizedMerchantResult {
    if (!rawMerchant || !rawMerchant.trim()) {
      return {
        rawMerchant: rawMerchant ?? null,
        normalizedMerchant: null,
        canonicalName: null,
        confidence: 0,
      };
    }

    const trimmedRaw = rawMerchant.trim();
    const cleaned = this.preCleanMerchant(trimmedRaw);

    const match = this.findMatchingRule(trimmedRaw, cleaned, this.memoryRulesCache);
    if (match) {
      return {
        rawMerchant: trimmedRaw,
        normalizedMerchant: match.rule.merchantName,
        canonicalName: match.rule.merchantName,
        ruleId: match.rule.id,
        confidence: match.confidence,
        categoryHint: match.rule.categoryHint,
        matchedPattern: match.pattern,
      };
    }

    const fallbackNormalized = this.formatFallbackName(cleaned);

    return {
      rawMerchant: trimmedRaw,
      normalizedMerchant: fallbackNormalized,
      canonicalName: fallbackNormalized,
      confidence: fallbackNormalized !== trimmedRaw ? 75 : 60,
    };
  }

  /**
   * Permite agregar una nueva regla configurable en tiempo de ejecución.
   */
  public async addRule(dto: CreateMerchantRuleDTO): Promise<MerchantRule> {
    const created = await this.repository.create(dto);
    // Actualizar caché en memoria
    this.memoryRulesCache.push(created);
    this.memoryRulesCache.sort((a, b) => b.priority - a.priority);
    return created;
  }

  /**
   * Evalúa la lista de reglas contra el string crudo y el limpio.
   */
  private findMatchingRule(
    raw: string,
    cleaned: string,
    rules: MerchantRule[],
  ): { rule: MerchantRule; pattern: string; confidence: number } | null {
    const normalizedRawForSearch = this.normalizeSearchString(raw);
    const normalizedCleanedForSearch = this.normalizeSearchString(cleaned);

    for (const rule of rules) {
      if (!rule.isActive) continue;

      for (const pattern of rule.patterns) {
        if (!pattern || !pattern.trim()) continue;

        const patternType: MerchantPatternType = rule.patternType || 'CONTAINS';
        const matches = this.evaluatePattern(
          pattern,
          patternType,
          normalizedRawForSearch,
          normalizedCleanedForSearch,
        );

        if (matches) {
          const confidence = patternType === 'EXACT' ? 100 : patternType === 'REGEX' ? 95 : 90;
          return { rule, pattern, confidence };
        }
      }
    }

    return null;
  }

  /**
   * Evalúa si un patrón individual coincide con el texto.
   */
  private evaluatePattern(
    pattern: string,
    patternType: MerchantPatternType,
    rawSearch: string,
    cleanedSearch: string,
  ): boolean {
    const normalizedPattern = this.normalizeSearchString(pattern);

    switch (patternType) {
      case 'EXACT':
        return rawSearch === normalizedPattern || cleanedSearch === normalizedPattern;

      case 'PREFIX':
        return (
          rawSearch.startsWith(normalizedPattern) || cleanedSearch.startsWith(normalizedPattern)
        );

      case 'REGEX':
        try {
          const regex = new RegExp(pattern, 'i');
          return regex.test(rawSearch) || regex.test(cleanedSearch);
        } catch {
          // Si el regex no es válido, probar como contains
          return rawSearch.includes(normalizedPattern) || cleanedSearch.includes(normalizedPattern);
        }

      case 'CONTAINS':
      default: {
        // Para acrónimos cortos (<= 3 caracteres alfanuméricos como "CFE", "AWS", etc.),
        // requerir coincidencia de palabra completa para evitar falsos positivos
        if (/^[A-Z0-9]{2,3}$/.test(normalizedPattern)) {
          const wordRegex = new RegExp(`\\b${normalizedPattern}\\b`, 'i');
          return wordRegex.test(rawSearch) || wordRegex.test(cleanedSearch);
        }
        return rawSearch.includes(normalizedPattern) || cleanedSearch.includes(normalizedPattern);
      }
    }
  }

  /**
   * Limpieza de prefijos comunes de pasarelas de pago, prefijos bancarios
   * y ruidos obvios en el nombre del comercio.
   */
  public preCleanMerchant(raw: string): string {
    let text = raw.trim();

    // 1. Eliminar prefijos de pasarelas de pago y terminales comunes
    const gatewayPrefixes = [
      /^(?:STRIPE|PAYPAL|CLIP|IZETTLE|SUMUP|STP|TERMINAL|OXXO\s*PAY|BILLPOCKET|SR\s*PAGO|SR\.PAGO|TPV|POS|MERCADO\s*PAGO|MERCADOPAGO|MP)\s*[*:-]\s*/i,
      /^SQ\s*\*\s*/i,
      /^PAGO\s+(?:EN|DE)\s+/i,
      /^COMPRA\s+(?:EN|DE)\s+/i,
      /^CARGO\s+(?:EN|DE)\s+/i,
      /^RETIRO\s+(?:EN|DE)\s+/i,
    ];

    for (const prefix of gatewayPrefixes) {
      text = text.replace(prefix, '');
    }

    // 2. Eliminar referencias numéricas / hashes típicos al final (ej: "*12345", "#987", "POS 402")
    text = text.replace(/[*#]\s*[0-9A-Za-z-]{3,}$/, '');
    text = text.replace(/\s+(?:POS|SUC|SUCURSAL|TDA|NO|NUM|REF)\.?\s*[0-9A-Za-z-]+$/i, '');

    // 3. Eliminar formas societarias y sufijos corporativos
    const corporateSuffixes = [
      /\bS\.?A\.?\s+DE\s+C\.?V\.?\b/i,
      /\bS\.?\s+DE\s+R\.?L\.?\s+DE\s+C\.?V\.?\b/i,
      /\bS\.?A\.?B\.?\s+DE\s+C\.?V\.?\b/i,
      /\bS\.?A\.?P\.?I\.?\s+DE\s+C\.?V\.?\b/i,
      /\bS\.?A\.?\b/i,
      /\bS\.?C\.?\b/i,
      /\bB\.?V\.?\b/i,
      /\bINC\.?\b/i,
      /\bLLC\.?\b/i,
      /\bLTD\.?\b/i,
    ];

    for (const suffix of corporateSuffixes) {
      text = text.replace(suffix, '');
    }

    // 4. Eliminar dominios web comunes al final (ej: .com.mx, .com, .mx)
    text = text.replace(/\.(?:com\.mx|com|com\.ar|org|net|mx|io|app)\b/i, '');

    // 5. Eliminar sufijos geográficos comunes cuando están separados al final
    text = text.replace(/\b(?:CDMX|MEX|MEXICO|EDOMEX|GDL|MTY|PUEBLA|TIJUANA|QRO)\b$/i, '');

    // 6. Eliminar caracteres de puntuación residuales y espacios colapsados
    text = text.replace(/^[\s*#._:,-]+|[\s*#._:,-]+$/g, '');
    text = text.replace(/\s+/g, ' ');

    return text.trim() || raw.trim();
  }

  /**
   * Da formato Title Case limpio a nombres que no coincidieron con reglas del sistema.
   */
  private formatFallbackName(text: string): string {
    const cleaned = text.trim();
    if (!cleaned) return '';

    // Si ya tiene mezcla balanceada de mayúsculas/minúsculas, conservar
    const hasLower = /[a-z]/.test(cleaned);
    const hasUpper = /[A-Z]/.test(cleaned);
    if (hasLower && hasUpper && !/^[A-Z\s0-9]+$/.test(cleaned)) {
      return cleaned;
    }

    // Convertir de ALL CAPS o all lower a Title Case
    const lower = cleaned.toLowerCase();
    const minorWords = new Set([
      'de',
      'del',
      'la',
      'las',
      'el',
      'los',
      'y',
      'en',
      'a',
      'para',
      'por',
    ]);

    return lower
      .split(' ')
      .map((word, index) => {
        if (!word) return '';
        if (index > 0 && minorWords.has(word)) {
          return word;
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ')
      .trim();
  }

  /**
   * Normaliza un string para búsqueda insensible a acentos, diacríticos y mayúsculas.
   */
  private normalizeSearchString(str: string): string {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// Instancia singleton por defecto para uso ágil en toda la app
export const defaultMerchantNormalizer = new MerchantNormalizer();
