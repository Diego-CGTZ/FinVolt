/**
 * US-024: Repositorio en Memoria de Reglas de Normalización de Comercios
 *
 * Soporta almacenamiento en memoria para pruebas unitarias, modo offline
 * y ejecución local en React Native/Expo.
 */

import type {
  IMerchantRuleRepository,
  MerchantRuleFilter,
} from '../../domain/repositories/IMerchantRuleRepository';
import type { MerchantRule, CreateMerchantRuleDTO } from '../../domain/models/MerchantRule';
import { DEFAULT_MERCHANT_RULES } from '../../domain/constants/DefaultMerchantRules';

export class InMemoryMerchantRuleRepository implements IMerchantRuleRepository {
  private rules: Map<string, MerchantRule> = new Map();

  constructor(loadDefaults: boolean = true) {
    if (loadDefaults) {
      this.loadDefaultRules();
    }
  }

  public loadDefaultRules(): void {
    for (const rule of DEFAULT_MERCHANT_RULES) {
      this.rules.set(rule.id, { ...rule });
    }
  }

  public async findActiveRules(userId?: string | null): Promise<MerchantRule[]> {
    const list = Array.from(this.rules.values()).filter((r) => {
      if (!r.isActive) return false;
      // Una regla aplica si es global (sin userId) o si pertenece al usuario actual
      if (!r.userId) return true;
      if (userId && r.userId === userId) return true;
      return false;
    });

    // Ordenar por prioridad descendente (mayor prioridad primero)
    list.sort((a, b) => b.priority - a.priority);

    return list.map((r) => ({ ...r }));
  }

  public async findAll(filter?: MerchantRuleFilter): Promise<MerchantRule[]> {
    let result = Array.from(this.rules.values());

    if (filter?.userId !== undefined) {
      result = result.filter((r) => r.userId === filter.userId);
    }
    if (filter?.isActive !== undefined) {
      result = result.filter((r) => r.isActive === filter.isActive);
    }
    if (filter?.isUserDefined !== undefined) {
      result = result.filter((r) => r.isUserDefined === filter.isUserDefined);
    }
    if (filter?.merchantName) {
      const q = filter.merchantName.toLowerCase();
      result = result.filter((r) => r.merchantName.toLowerCase().includes(q));
    }

    result.sort((a, b) => b.priority - a.priority);

    if (filter?.offset && filter.offset > 0) {
      result = result.slice(filter.offset);
    }
    if (filter?.limit && filter.limit > 0) {
      result = result.slice(0, filter.limit);
    }

    return result.map((r) => ({ ...r }));
  }

  public async findById(id: string): Promise<MerchantRule | null> {
    const rule = this.rules.get(id);
    return rule ? { ...rule } : null;
  }

  public async create(dto: CreateMerchantRuleDTO): Promise<MerchantRule> {
    const id = this.generateId();
    const now = new Date();

    const rule: MerchantRule = {
      id,
      merchantName: dto.merchantName.trim(),
      patterns: dto.patterns.map((p) => p.trim()).filter((p) => p.length > 0),
      patternType: dto.patternType || 'CONTAINS',
      priority: dto.priority !== undefined ? dto.priority : 50,
      categoryHint: dto.categoryHint,
      isUserDefined: dto.isUserDefined !== undefined ? dto.isUserDefined : true,
      userId: dto.userId || null,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
      createdAt: now,
      updatedAt: now,
    };

    this.rules.set(id, rule);
    return { ...rule };
  }

  public async update(id: string, updates: Partial<CreateMerchantRuleDTO>): Promise<MerchantRule> {
    const existing = this.rules.get(id);
    if (!existing) {
      throw new Error(`Regla de comercio no encontrada: ${id}`);
    }

    const updated: MerchantRule = {
      ...existing,
      merchantName:
        updates.merchantName !== undefined ? updates.merchantName.trim() : existing.merchantName,
      patterns:
        updates.patterns !== undefined
          ? updates.patterns.map((p) => p.trim()).filter((p) => p.length > 0)
          : existing.patterns,
      patternType: updates.patternType !== undefined ? updates.patternType : existing.patternType,
      priority: updates.priority !== undefined ? updates.priority : existing.priority,
      categoryHint:
        updates.categoryHint !== undefined ? updates.categoryHint : existing.categoryHint,
      isUserDefined:
        updates.isUserDefined !== undefined ? updates.isUserDefined : existing.isUserDefined,
      userId: updates.userId !== undefined ? updates.userId : existing.userId,
      isActive: updates.isActive !== undefined ? updates.isActive : existing.isActive,
      updatedAt: new Date(),
    };

    this.rules.set(id, updated);
    return { ...updated };
  }

  public async delete(id: string): Promise<void> {
    this.rules.delete(id);
  }

  public async count(filter?: MerchantRuleFilter): Promise<number> {
    const list = await this.findAll({
      ...filter,
      limit: undefined,
      offset: undefined,
    });
    return list.length;
  }

  public clear(): void {
    this.rules.clear();
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'rule_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
  }
}
