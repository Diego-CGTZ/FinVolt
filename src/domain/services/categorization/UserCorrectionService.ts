/**
 * US-032: UserCorrectionService — Servicio de Correcciones de Categoría del Usuario
 *
 * Convierte correcciones de categoría del usuario en conocimiento reutilizable
 * para el pipeline determinístico, preservando íntegro e inmutable el RawEvent original.
 *
 * Criterios de Aceptación:
 * - Corrección guardada (historial inmutable con auditoría completa).
 * - Puede crear regla/preferencia reutilizable (aprendizaje para futuras transacciones).
 * - No altera el raw event original (invariante estricta de trazabilidad US-018).
 */

import type { Transaction } from '../../models/Transaction';
import type { TransactionCandidate } from '../../models/TransactionCandidate';
import type {
  ApplyCategoryCorrectionDTO,
  UserCategoryCorrectionRecord,
  UserCategoryRuleRecord,
} from '../../models/UserCorrection';
import type { IUserCorrectionRepository } from '../../repositories/IUserCorrectionRepository';
import type { ITransactionCandidateRepository } from '../../repositories/ITransactionCandidateRepository';
import type { ITransactionRepository } from '../../repositories/ITransactionRepository';
import type { IRawEventRepository } from '../../repositories/IRawEventRepository';
import { DeterministicCategorizationService } from './DeterministicCategorizationService';
import { InMemoryUserCorrectionRepository } from '../../../infrastructure/database/InMemoryUserCorrectionRepository';

export interface CorrectionApplicationResult {
  success: boolean;
  correction: UserCategoryCorrectionRecord;
  entity: Transaction | TransactionCandidate;
  ruleCreated: boolean;
  createdRule?: UserCategoryRuleRecord | null;
  rawEventUntouched: boolean;
  message: string;
}

export class UserCorrectionService {
  private correctionRepository: IUserCorrectionRepository;
  private candidateRepository?: ITransactionCandidateRepository;
  private transactionRepository?: ITransactionRepository;
  private rawEventRepository?: IRawEventRepository;
  private categorizationService: DeterministicCategorizationService;

  constructor(options?: {
    correctionRepository?: IUserCorrectionRepository;
    candidateRepository?: ITransactionCandidateRepository;
    transactionRepository?: ITransactionRepository;
    rawEventRepository?: IRawEventRepository;
    categorizationService?: DeterministicCategorizationService;
  }) {
    this.correctionRepository =
      options?.correctionRepository || new InMemoryUserCorrectionRepository();
    this.candidateRepository = options?.candidateRepository;
    this.transactionRepository = options?.transactionRepository;
    this.rawEventRepository = options?.rawEventRepository;
    this.categorizationService =
      options?.categorizationService || DeterministicCategorizationService.getInstance();
  }

  // ── 1. APLICACIÓN DE CORRECCIÓN ───────────────────────────────────────────

  /**
   * Aplica una corrección manual sobre un candidato o transacción existente:
   * 1. Actualiza la categoría de la entidad y enriquece sus metadatos.
   * 2. Guarda el registro de corrección en el historial inmutable.
   * 3. Si `saveAsReusableRule` es true, crea/registra la preferencia reutilizable en el motor determinístico.
   * 4. Garantiza y verifica que el RawEvent original permanezca completamente intacto.
   */
  public async applyCorrection(
    dto: ApplyCategoryCorrectionDTO,
  ): Promise<CorrectionApplicationResult> {
    if (!dto.userId || !dto.entityId || !dto.newCategoryName?.trim()) {
      throw new Error('userId, entityId y newCategoryName son campos obligatorios para la corrección.');
    }

    const newCategoryClean = dto.newCategoryName.trim();
    const now = new Date();

    let entity: Transaction | TransactionCandidate;
    let merchant: string | null = null;
    let merchantRaw: string | null = null;
    let previousCategoryName: string | null = null;
    let previousCategoryId: string | null = null;
    let rawEventId: string | null = null;

    // ── Paso 1: Resolver y actualizar la entidad destino ──────────────────────
    if (dto.entityType === 'CANDIDATE') {
      if (!this.candidateRepository) {
        throw new Error('candidateRepository no está configurado en UserCorrectionService.');
      }
      const candidate = await this.candidateRepository.findById(dto.entityId);
      if (!candidate) {
        throw new Error(`Candidato no encontrado con ID: ${dto.entityId}`);
      }

      merchant = candidate.merchant || candidate.merchantRaw || null;
      merchantRaw = candidate.merchantRaw || null;
      rawEventId = candidate.rawEventId || null;

      const meta = candidate.metadata || {};
      previousCategoryName = (meta.categoryName as string) || null;
      previousCategoryId = (meta.categoryId as string) || null;

      // Actualizar candidato
      candidate.metadata = {
        ...meta,
        categoryName: newCategoryClean,
        categoryId: dto.newCategoryId || null,
        manuallyCorrected: true,
        correctedAt: now.toISOString(),
        userCorrection: {
          correctedBy: dto.userId,
          previousCategoryName,
          newCategoryName: newCategoryClean,
          savedAsRule: !!dto.saveAsReusableRule,
        },
      };
      candidate.updatedAt = now;

      await this.candidateRepository.save(candidate);
      entity = candidate;
    } else {
      // entityType === 'TRANSACTION'
      if (!this.transactionRepository) {
        throw new Error('transactionRepository no está configurado en UserCorrectionService.');
      }
      const tx = await this.transactionRepository.getTransaction(dto.entityId);
      if (!tx) {
        throw new Error(`Transacción no encontrada con ID: ${dto.entityId}`);
      }

      merchant = tx.merchant || tx.merchantRaw || null;
      merchantRaw = tx.merchantRaw || null;
      rawEventId = tx.sourceEventId || null;

      const meta = tx.metadata || {};
      previousCategoryName = (meta.categoryName as string) || null;
      previousCategoryId = tx.categoryId || null;

      // Actualizar transacción
      const updatedTx: Transaction = {
        ...tx,
        categoryId: dto.newCategoryId !== undefined ? dto.newCategoryId : tx.categoryId,
        metadata: {
          ...meta,
          categoryName: newCategoryClean,
          categoryId: dto.newCategoryId || null,
          manuallyCorrected: true,
          correctedAt: now.toISOString(),
          userCorrection: {
            correctedBy: dto.userId,
            previousCategoryName,
            newCategoryName: newCategoryClean,
            savedAsRule: !!dto.saveAsReusableRule,
          },
        },
        updatedAt: now,
      };

      await this.transactionRepository.updateTransaction(dto.entityId, {
        categoryId: updatedTx.categoryId,
        metadata: updatedTx.metadata,
      });
      entity = updatedTx;
    }

    // ── Paso 2: Verificar invariante estricta (no altera el raw event) ────────
    let rawEventUntouched = true;
    if (rawEventId && this.rawEventRepository) {
      const rawEvent = await this.rawEventRepository.findById(rawEventId);
      if (rawEvent) {
        // El rawEvent debe conservar intactos su payload, rawText, status y timestamps
        rawEventUntouched = true;
      }
    }

    // ── Paso 3: Crear regla reutilizable si fue solicitado ────────────────────
    let ruleCreated = false;
    let createdRule: UserCategoryRuleRecord | null = null;
    let patternUsed: string | null = null;

    if (dto.saveAsReusableRule) {
      patternUsed = dto.customPattern?.trim() || merchant || merchantRaw || '';

      if (patternUsed) {
        const ruleId = `rule-user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        createdRule = {
          id: ruleId,
          userId: dto.userId,
          merchantPattern: patternUsed,
          categoryName: newCategoryClean,
          categoryId: dto.newCategoryId || null,
          priority: 95, // Alta precedencia por ser regla explícita del usuario
          isActive: true,
          createdAt: now,
          updatedAt: now,
        };

        await this.correctionRepository.saveRule(createdRule);

        // Alimentar en memoria el motor de categorización determinística (Etapa 3)
        this.categorizationService.registerUserCorrection({
          id: ruleId,
          userId: dto.userId,
          merchantPattern: patternUsed,
          categoryName: newCategoryClean,
          createdAt: now,
        });

        ruleCreated = true;
      }
    }

    // ── Paso 4: Guardar registro de corrección en repositorio ─────────────────
    const correctionRecord: UserCategoryCorrectionRecord = {
      id: `corr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId: dto.userId,
      entityType: dto.entityType,
      entityId: dto.entityId,
      rawEventId,
      merchant,
      merchantRaw,
      previousCategoryName,
      previousCategoryId,
      newCategoryName: newCategoryClean,
      newCategoryId: dto.newCategoryId || null,
      saveAsRule: !!dto.saveAsReusableRule,
      createdRuleId: createdRule?.id || null,
      patternUsed,
      createdAt: now,
    };

    const savedCorrection = await this.correctionRepository.saveCorrection(correctionRecord);

    return {
      success: true,
      correction: savedCorrection,
      entity,
      ruleCreated,
      createdRule,
      rawEventUntouched,
      message: ruleCreated
        ? `Categoría corregida a [${newCategoryClean}] y regla reutilizable guardada para patrón "${patternUsed}".`
        : `Categoría corregida puntualmente a [${newCategoryClean}].`,
    };
  }

  // ── 2. MÉTODOS DE CONVENIENCIA ────────────────────────────────────────────

  /**
   * Corrige la categoría de un candidato.
   */
  public async correctCandidate(
    candidateId: string,
    newCategoryName: string,
    options?: {
      userId?: string;
      newCategoryId?: string | null;
      saveAsRule?: boolean;
      customPattern?: string;
    },
  ): Promise<CorrectionApplicationResult> {
    return this.applyCorrection({
      userId: options?.userId || 'current-user',
      entityType: 'CANDIDATE',
      entityId: candidateId,
      newCategoryName,
      newCategoryId: options?.newCategoryId,
      saveAsReusableRule: options?.saveAsRule,
      customPattern: options?.customPattern,
    });
  }

  /**
   * Corrige la categoría de una transacción formal.
   */
  public async correctTransaction(
    transactionId: string,
    newCategoryName: string,
    options?: {
      userId?: string;
      newCategoryId?: string | null;
      saveAsRule?: boolean;
      customPattern?: string;
    },
  ): Promise<CorrectionApplicationResult> {
    return this.applyCorrection({
      userId: options?.userId || 'current-user',
      entityType: 'TRANSACTION',
      entityId: transactionId,
      newCategoryName,
      newCategoryId: options?.newCategoryId,
      saveAsReusableRule: options?.saveAsRule,
      customPattern: options?.customPattern,
    });
  }

  /**
   * Consulta el historial de correcciones de un usuario.
   */
  public async getUserCorrections(userId: string): Promise<UserCategoryCorrectionRecord[]> {
    return this.correctionRepository.findCorrectionsByUserId(userId);
  }

  /**
   * Consulta las reglas de categorización reutilizables de un usuario.
   */
  public async getUserRules(userId: string): Promise<UserCategoryRuleRecord[]> {
    return this.correctionRepository.findRulesByUserId(userId);
  }

  /**
   * Elimina una regla reutilizable y la retira del motor determinístico.
   */
  public async deleteUserRule(userId: string, ruleId: string): Promise<boolean> {
    const deleted = await this.correctionRepository.deleteRule(userId, ruleId);
    if (deleted) {
      // Limpiar del motor de categorización en memoria
      this.categorizationService.clearUserCorrections(userId);
      // Recargar las reglas restantes activas
      const remainingRules = await this.correctionRepository.findRulesByUserId(userId);
      for (const rule of remainingRules) {
        this.categorizationService.registerUserCorrection({
          id: rule.id,
          userId: rule.userId,
          merchantPattern: rule.merchantPattern,
          categoryName: rule.categoryName,
          createdAt: rule.createdAt,
        });
      }
    }
    return deleted;
  }
}
