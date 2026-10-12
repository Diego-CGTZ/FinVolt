/**
 * US-031: DeterministicCategorizationService — Motor Determinístico de Categorización
 *
 * Criterios de Aceptación:
 * - Cascada estricta de evaluación:
 *     1. Merchant mapping (mapeo directo de comercios conocidos a categorías)
 *     2. Rules (reglas determinísticas sintácticas por patrones, regex y palabras clave)
 *     3. User corrections (correcciones manuales y reglas personalizadas del usuario)
 *     4. Fallback (categoría de respaldo determinística según tipo o 'Otros')
 * - Sin dependencias de modelos de ML ni llamadas a APIs de LLM.
 * - Totalmente reproducible, síncrono/asíncrono y desacoplado.
 */

import type { Transaction, TransactionType } from '../../models/Transaction';
import type { TransactionCandidate } from '../../models/TransactionCandidate';
import { MerchantNormalizer } from '../MerchantNormalizer';
import {
  DEFAULT_MERCHANT_TO_CATEGORY,
  DEFAULT_SYNTACTIC_RULES,
  type CategoryRuleDefinition,
} from './CategoryMappings';

export type CategorizationMethod =
  | 'MERCHANT_MAPPING'
  | 'RULES'
  | 'USER_CORRECTIONS'
  | 'FALLBACK';

export interface CategorizationInput {
  /** Nombre del comercio limpio o propuesto */
  merchant?: string | null;

  /** Nombre del comercio tal como llegó de la fuente de origen */
  merchantRaw?: string | null;

  /** Descripción, nota o concepto del movimiento */
  description?: string | null;

  /** Tipo de movimiento (EXPENSE, INCOME, TRANSFER) */
  type?: TransactionType;

  /** Monto en unidades decimales o centavos */
  amount?: number;
  amountMinor?: number;

  /** Proveedor detectado (ej: BBVA, NU, SANTANDER) */
  provider?: string | null;

  /** ID del usuario para aplicar correcciones y reglas privadas */
  userId?: string | null;
}

export interface UserCategoryCorrection {
  id?: string;
  userId: string;
  merchantPattern: string; // Puede ser nombre exacto o patrón de comercio
  categoryName: string;
  createdAt?: Date;
}

export interface CategorizationResult {
  /** Nombre canónico de la categoría asignada */
  categoryName: string;

  /** ID de la categoría si coincide con una del catálogo formal */
  categoryId?: string | null;

  /** Método determinante que asignó la categoría */
  method: CategorizationMethod;

  /** Puntuación de confianza de la categorización (0 a 100) */
  confidence: number;

  /** Regla, comercio o patrón específico que produjo la coincidencia */
  matchedPattern?: string;

  /** Indica si la categoría fue definida por corrección directa del usuario */
  isUserCorrection: boolean;

  /** Indica si se recurrió al fallback por ausencia de reglas */
  isFallback: boolean;

  /** Registro secuencial de las etapas evaluadas en la cascada */
  evaluationPath: string[];
}

export interface CategorizationOptions {
  /**
   * Orden de prioridad de las correcciones de usuario:
   * - 'CASCADE' (Default por AC): Merchant mapping -> Rules -> User corrections -> Fallback
   * - 'USER_FIRST': User corrections se evalúan en primer lugar para anular reglas genéricas
   */
  userCorrectionsPriority?: 'CASCADE' | 'USER_FIRST';
}

export class DeterministicCategorizationService {
  private static merchantNormalizer = new MerchantNormalizer();

  /** Mapeos de comercios en memoria (copia extensible del catálogo base) */
  private merchantMappings: Map<string, string> = new Map();

  /** Reglas sintácticas determinísticas ordenadas por prioridad descendente */
  private rules: CategoryRuleDefinition[] = [];

  /** Correcciones manuales registradas por usuario */
  private userCorrections: UserCategoryCorrection[] = [];

  /** Instancia singleton compartida */
  private static defaultInstance: DeterministicCategorizationService | null = null;

  constructor() {
    this.resetToDefaults();
  }

  /**
   * Obtiene la instancia singleton compartida por defecto del sistema.
   */
  public static getInstance(): DeterministicCategorizationService {
    if (!this.defaultInstance) {
      this.defaultInstance = new DeterministicCategorizationService();
    }
    return this.defaultInstance;
  }

  /**
   * Restablece los catálogos en memoria a los valores predefinidos de fábrica.
   */
  public resetToDefaults(): void {
    this.merchantMappings.clear();
    for (const [merchant, category] of Object.entries(DEFAULT_MERCHANT_TO_CATEGORY)) {
      this.merchantMappings.set(this.normalizeKey(merchant), category);
    }

    this.rules = [...DEFAULT_SYNTACTIC_RULES].sort((a, b) => b.priority - a.priority);
    this.userCorrections = [];
  }

  // ── 1. CASCADA DE CATEGORIZACIÓN (AC: Merchant mapping -> Rules -> User corrections -> Fallback) ──

  /**
   * Categoriza determinísticamente un input ejecutando la cascada estricta.
   */
  public categorize(
    input: CategorizationInput,
    options?: CategorizationOptions,
  ): CategorizationResult {
    const evaluationPath: string[] = [];
    const priority = options?.userCorrectionsPriority ?? 'CASCADE';

    const merchantRaw = (input.merchantRaw || '').trim();
    const merchant = (input.merchant || '').trim();
    const description = (input.description || '').trim();
    const type = input.type || 'EXPENSE';
    const userId = input.userId;

    // Normalizar comercio si no viene limpio
    let normalizedMerchantName = merchant;
    if (!normalizedMerchantName && merchantRaw) {
      const normResult = DeterministicCategorizationService.merchantNormalizer.normalizeSync(merchantRaw);
      normalizedMerchantName = normResult.normalizedMerchant || merchantRaw;
    }

    // Si la opción 'USER_FIRST' está habilitada, evaluar correcciones primero
    if (priority === 'USER_FIRST' && userId) {
      const userMatch = this.evaluateUserCorrections(
        userId,
        normalizedMerchantName,
        merchantRaw,
        description,
      );
      if (userMatch) {
        evaluationPath.push('USER_CORRECTIONS (Prioridad Alta)');
        return {
          categoryName: userMatch.categoryName,
          method: 'USER_CORRECTIONS',
          confidence: 100,
          matchedPattern: userMatch.matchedPattern,
          isUserCorrection: true,
          isFallback: false,
          evaluationPath,
        };
      }
      evaluationPath.push('USER_CORRECTIONS: Sin coincidencia');
    }

    // ── Etapa 1: Merchant Mapping ─────────────────────────────────────────────
    evaluationPath.push('Paso 1: Merchant Mapping');
    const merchantMatch = this.evaluateMerchantMapping(normalizedMerchantName, merchantRaw);
    if (merchantMatch) {
      evaluationPath.push(`Paso 1: Coincidencia con comercio [${merchantMatch.matchedPattern}] -> ${merchantMatch.categoryName}`);
      return {
        categoryName: merchantMatch.categoryName,
        method: 'MERCHANT_MAPPING',
        confidence: 95,
        matchedPattern: merchantMatch.matchedPattern,
        isUserCorrection: false,
        isFallback: false,
        evaluationPath,
      };
    }
    evaluationPath.push('Paso 1: Sin coincidencia en Merchant Mapping');

    // ── Etapa 2: Rules (Reglas sintácticas y patrones determinísticos) ────────
    evaluationPath.push('Paso 2: Reglas determinísticas');
    const ruleMatch = this.evaluateSyntacticRules(
      normalizedMerchantName,
      merchantRaw,
      description,
      type,
    );
    if (ruleMatch) {
      evaluationPath.push(`Paso 2: Coincidencia de regla [${ruleMatch.ruleId}] -> ${ruleMatch.categoryName}`);
      return {
        categoryName: ruleMatch.categoryName,
        method: 'RULES',
        confidence: 85,
        matchedPattern: ruleMatch.matchedPattern,
        isUserCorrection: false,
        isFallback: false,
        evaluationPath,
      };
    }
    evaluationPath.push('Paso 2: Sin coincidencia en Reglas');

    // ── Etapa 3: User Corrections (Correcciones del usuario en cascada) ──────
    evaluationPath.push('Paso 3: User Corrections');
    if (userId) {
      const userMatch = this.evaluateUserCorrections(
        userId,
        normalizedMerchantName,
        merchantRaw,
        description,
      );
      if (userMatch) {
        evaluationPath.push(`Paso 3: Coincidencia con corrección del usuario -> ${userMatch.categoryName}`);
        return {
          categoryName: userMatch.categoryName,
          method: 'USER_CORRECTIONS',
          confidence: 95,
          matchedPattern: userMatch.matchedPattern,
          isUserCorrection: true,
          isFallback: false,
          evaluationPath,
        };
      }
    }
    evaluationPath.push('Paso 3: Sin coincidencia en User Corrections');

    // ── Etapa 4: Fallback (Categoría de respaldo determinística) ───────────────
    evaluationPath.push('Paso 4: Fallback determinístico');
    const fallbackCategory = this.resolveFallbackCategory(type);
    evaluationPath.push(`Paso 4: Fallback asignado -> ${fallbackCategory}`);

    return {
      categoryName: fallbackCategory,
      method: 'FALLBACK',
      confidence: 30,
      matchedPattern: `FALLBACK_${type}`,
      isUserCorrection: false,
      isFallback: true,
      evaluationPath,
    };
  }

  // ── 2. EVALUACIÓN DE CADA ETAPA ───────────────────────────────────────────

  /**
   * Etapa 1: Evaluación de Merchant Mapping directo.
   */
  private evaluateMerchantMapping(
    merchant: string,
    merchantRaw: string,
  ): { categoryName: string; matchedPattern: string } | null {
    const candidates = [merchant, merchantRaw].filter(Boolean);

    for (const name of candidates) {
      const key = this.normalizeKey(name);
      if (!key) continue;

      if (this.merchantMappings.has(key)) {
        return {
          categoryName: this.merchantMappings.get(key)!,
          matchedPattern: key,
        };
      }

      // Probar si el comercio entrante contiene la marca conocida como palabra o frase completa
      // Se ordenan por longitud descendente para preferir marcas más específicas (ej: 'walmart express' antes de 'walmart')
      for (const [mappedKey, category] of this.merchantMappings.entries()) {
        if (mappedKey.length >= 3) {
          const escaped = mappedKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(^|\\s)${escaped}(\\s|$)`, 'i');
          if (regex.test(key)) {
            return {
              categoryName: category,
              matchedPattern: mappedKey,
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Etapa 2: Evaluación de reglas sintácticas y expresiones regulares.
   */
  private evaluateSyntacticRules(
    merchant: string,
    merchantRaw: string,
    description: string,
    type: TransactionType,
  ): { categoryName: string; matchedPattern: string; ruleId: string } | null {
    const textCorpus = `${merchant} ${merchantRaw} ${description}`.trim();
    if (!textCorpus) return null;
    const normCorpus = this.normalizeKey(textCorpus);

    for (const rule of this.rules) {
      // Si la regla es específica de nómina o transferencias, comprobar coherencia de tipo
      if (rule.categoryName === 'Salario' && type !== 'INCOME' && !normCorpus.includes('nomina')) {
        continue;
      }

      for (const pattern of rule.patterns) {
        if (pattern instanceof RegExp) {
          if (pattern.test(textCorpus) || pattern.test(normCorpus)) {
            return {
              categoryName: rule.categoryName,
              matchedPattern: pattern.source,
              ruleId: rule.id,
            };
          }
        } else if (typeof pattern === 'string') {
          const normPattern = this.normalizeKey(pattern);
          if (normCorpus.includes(normPattern) || textCorpus.toLowerCase().includes(pattern.toLowerCase())) {
            return {
              categoryName: rule.categoryName,
              matchedPattern: pattern,
              ruleId: rule.id,
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Etapa 3: Evaluación de correcciones manuales del usuario.
   */
  private evaluateUserCorrections(
    userId: string,
    merchant: string,
    merchantRaw: string,
    description: string,
  ): { categoryName: string; matchedPattern: string } | null {
    const userCorrs = this.userCorrections.filter((c) => c.userId === userId);
    if (userCorrs.length === 0) return null;

    const targets = [merchant, merchantRaw, description].filter(Boolean).map((t) => this.normalizeKey(t));

    for (const corr of userCorrs) {
      const normPattern = this.normalizeKey(corr.merchantPattern);
      for (const target of targets) {
        if (target === normPattern || target.includes(normPattern)) {
          return {
            categoryName: corr.categoryName,
            matchedPattern: corr.merchantPattern,
          };
        }
      }
    }

    return null;
  }

  /**
   * Etapa 4: Resolución determinística de categoría de respaldo.
   */
  private resolveFallbackCategory(type: TransactionType): string {
    switch (type) {
      case 'INCOME':
        return 'Otros'; // O 'Ingresos' si existe, en el seed es 'Otros' / 'Salario'
      case 'TRANSFER':
        return 'Transferencia';
      case 'EXPENSE':
      default:
        return 'Otros';
    }
  }

  // ── 3. GESTIÓN DE REGLAS, MAPEOS Y CORRECCIONES EN RUNTIME ─────────────────

  /**
   * Registra o sobreescribe un mapeo directo de comercio a categoría.
   */
  public setMerchantMapping(merchant: string, categoryName: string): void {
    if (!merchant || !categoryName) return;
    this.merchantMappings.set(this.normalizeKey(merchant), categoryName.trim());
  }

  /**
   * Agrega una regla sintáctica determinística al catálogo en runtime.
   */
  public addRule(rule: CategoryRuleDefinition): void {
    this.rules = [rule, ...this.rules.filter((r) => r.id !== rule.id)].sort(
      (a, b) => b.priority - a.priority,
    );
  }

  /**
   * Remueve una regla sintáctica por su ID.
   */
  public removeRule(ruleId: string): void {
    this.rules = this.rules.filter((r) => r.id !== ruleId);
  }

  /**
   * Registra una corrección manual de categoría del usuario (Etapa 3).
   */
  public registerUserCorrection(correction: UserCategoryCorrection): void {
    if (!correction.userId || !correction.merchantPattern || !correction.categoryName) return;

    // Remover corrección previa para el mismo usuario y patrón si existía
    this.userCorrections = this.userCorrections.filter(
      (c) =>
        !(
          c.userId === correction.userId &&
          this.normalizeKey(c.merchantPattern) === this.normalizeKey(correction.merchantPattern)
        ),
    );

    this.userCorrections.push({
      ...correction,
      id: correction.id || `corr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: correction.createdAt || new Date(),
    });
  }

  /**
   * Elimina todas las correcciones de usuario registradas (o las de un usuario en específico).
   */
  public clearUserCorrections(userId?: string): void {
    if (userId) {
      this.userCorrections = this.userCorrections.filter((c) => c.userId !== userId);
    } else {
      this.userCorrections = [];
    }
  }

  // ── 4. APLICACIÓN SOBRE CANDIDATOS Y TRANSACCIONES ────────────────────────

  /**
   * Categoriza un TransactionCandidate y enriquece sus metadatos con el resultado.
   */
  public categorizeCandidate(
    candidate: TransactionCandidate,
    options?: CategorizationOptions,
  ): { candidate: TransactionCandidate; result: CategorizationResult } {
    const result = this.categorize(
      {
        merchant: candidate.merchant,
        merchantRaw: candidate.merchantRaw,
        type: candidate.type,
        amount: candidate.amount,
        amountMinor: candidate.amountMinor,
        provider: candidate.provider,
        userId: candidate.userId,
      },
      options,
    );

    const updated: TransactionCandidate = {
      ...candidate,
      metadata: {
        ...(candidate.metadata || {}),
        categoryName: result.categoryName,
        categorization: {
          categoryName: result.categoryName,
          method: result.method,
          confidence: result.confidence,
          matchedPattern: result.matchedPattern,
          isUserCorrection: result.isUserCorrection,
          isFallback: result.isFallback,
        },
      },
      updatedAt: new Date(),
    };

    return { candidate: updated, result };
  }

  /**
   * Categoriza una Transaction canónica y actualiza sus metadatos con el resultado.
   */
  public categorizeTransaction(
    transaction: Transaction,
    options?: CategorizationOptions,
  ): { transaction: Transaction; result: CategorizationResult } {
    const result = this.categorize(
      {
        merchant: transaction.merchant,
        merchantRaw: transaction.merchantRaw,
        description: transaction.description,
        type: transaction.type,
        amountMinor: transaction.amountMinor,
        userId: transaction.userId,
      },
      options,
    );

    const updated: Transaction = {
      ...transaction,
      metadata: {
        ...(transaction.metadata || {}),
        categoryName: result.categoryName,
        categorization: {
          categoryName: result.categoryName,
          method: result.method,
          confidence: result.confidence,
          matchedPattern: result.matchedPattern,
          isUserCorrection: result.isUserCorrection,
          isFallback: result.isFallback,
        },
      },
      updatedAt: new Date(),
    };

    return { transaction: updated, result };
  }

  // ── 5. MÉTODOS ESTÁTICOS DE CONVENIENCIA ───────────────────────────────────

  /**
   * Método estático para categorizar rápidamente utilizando la instancia global.
   */
  public static categorize(
    input: CategorizationInput,
    options?: CategorizationOptions,
  ): CategorizationResult {
    return this.getInstance().categorize(input, options);
  }

  /**
   * Normaliza claves textuales para coincidencia insensible a mayúsculas y diacríticos.
   */
  private normalizeKey(text: string): string {
    return (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
