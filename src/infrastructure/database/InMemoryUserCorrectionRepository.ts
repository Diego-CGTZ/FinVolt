/**
 * Repositorio en memoria para IUserCorrectionRepository (US-032)
 */

import type { IUserCorrectionRepository } from '../../domain/repositories/IUserCorrectionRepository';
import type { UserCategoryCorrectionRecord, UserCategoryRuleRecord } from '../../domain/models/UserCorrection';

export class InMemoryUserCorrectionRepository implements IUserCorrectionRepository {
  private corrections: Map<string, UserCategoryCorrectionRecord> = new Map();
  private rules: Map<string, UserCategoryRuleRecord> = new Map();

  public async saveCorrection(
    record: UserCategoryCorrectionRecord,
  ): Promise<UserCategoryCorrectionRecord> {
    const copy = { ...record };
    this.corrections.set(copy.id, copy);
    return copy;
  }

  public async findCorrectionById(id: string): Promise<UserCategoryCorrectionRecord | null> {
    const item = this.corrections.get(id);
    return item ? { ...item } : null;
  }

  public async findCorrectionsByUserId(userId: string): Promise<UserCategoryCorrectionRecord[]> {
    return Array.from(this.corrections.values())
      .filter((c) => c.userId === userId)
      .reverse();
  }

  public async findCorrectionsByEntityId(entityId: string): Promise<UserCategoryCorrectionRecord[]> {
    return Array.from(this.corrections.values())
      .filter((c) => c.entityId === entityId)
      .reverse();
  }

  public async saveRule(rule: UserCategoryRuleRecord): Promise<UserCategoryRuleRecord> {
    const copy = { ...rule };
    this.rules.set(copy.id, copy);
    return copy;
  }

  public async findRulesByUserId(userId: string): Promise<UserCategoryRuleRecord[]> {
    return Array.from(this.rules.values())
      .filter((r) => r.userId === userId && r.isActive)
      .sort((a, b) => b.priority - a.priority);
  }

  public async deleteRule(userId: string, ruleId: string): Promise<boolean> {
    const rule = this.rules.get(ruleId);
    if (!rule || rule.userId !== userId) {
      return false;
    }
    this.rules.delete(ruleId);
    return true;
  }

  public async countCorrections(userId: string): Promise<number> {
    return Array.from(this.corrections.values()).filter((c) => c.userId === userId).length;
  }

  public clear(): void {
    this.corrections.clear();
    this.rules.clear();
  }
}
