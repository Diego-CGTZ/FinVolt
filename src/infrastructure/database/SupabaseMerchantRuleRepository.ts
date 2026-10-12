/**
 * US-024: Repositorio Supabase para MerchantRule
 *
 * Implementación de IMerchantRuleRepository utilizando Supabase PostgreSQL.
 * Respeta Row Level Security (RLS):
 * - Las reglas globales del sistema tienen user_id IS NULL.
 * - Las reglas creadas por usuarios tienen user_id = auth.uid().
 */

import { supabase } from '../api/supabaseClient';
import type {
  IMerchantRuleRepository,
  MerchantRuleFilter,
} from '../../domain/repositories/IMerchantRuleRepository';
import type { MerchantRule, CreateMerchantRuleDTO } from '../../domain/models/MerchantRule';

export class SupabaseMerchantRuleRepository implements IMerchantRuleRepository {
  public async findActiveRules(userId?: string | null): Promise<MerchantRule[]> {
    let query = supabase
      .from('merchant_rules')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (userId) {
      // Reglas globales del sistema (user_id is null) o pertenecientes a este usuario
      query = query.or(`user_id.is.null,user_id.eq.${userId}`);
    } else {
      query = query.is('user_id', null);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map(this.mapToDomain);
  }

  public async findAll(filter?: MerchantRuleFilter): Promise<MerchantRule[]> {
    let query = supabase.from('merchant_rules').select('*').order('priority', { ascending: false });

    if (filter?.isActive !== undefined) {
      query = query.eq('is_active', filter.isActive);
    }
    if (filter?.isUserDefined !== undefined) {
      query = query.eq('is_user_defined', filter.isUserDefined);
    }
    if (filter?.userId !== undefined) {
      if (filter.userId === null) {
        query = query.is('user_id', null);
      } else {
        query = query.eq('user_id', filter.userId);
      }
    }
    if (filter?.merchantName) {
      query = query.ilike('merchant_name', `%${filter.merchantName}%`);
    }
    if (filter?.offset && filter.offset > 0) {
      query = query.range(filter.offset, filter.offset + (filter.limit || 50) - 1);
    } else if (filter?.limit && filter.limit > 0) {
      query = query.limit(filter.limit);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map(this.mapToDomain);
  }

  public async findById(id: string): Promise<MerchantRule | null> {
    const { data, error } = await supabase
      .from('merchant_rules')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return this.mapToDomain(data);
  }

  public async create(dto: CreateMerchantRuleDTO): Promise<MerchantRule> {
    const insertPayload: Record<string, unknown> = {
      merchant_name: dto.merchantName.trim(),
      patterns: dto.patterns.map((p) => p.trim()).filter((p) => p.length > 0),
      pattern_type: dto.patternType || 'CONTAINS',
      priority: dto.priority !== undefined ? dto.priority : 50,
      category_hint: dto.categoryHint || null,
      is_user_defined: dto.isUserDefined !== undefined ? dto.isUserDefined : true,
      is_active: dto.isActive !== undefined ? dto.isActive : true,
    };

    if (dto.userId) {
      insertPayload.user_id = dto.userId;
    }

    const { data, error } = await supabase
      .from('merchant_rules')
      .insert([insertPayload])
      .select()
      .single();

    if (error) throw error;
    return this.mapToDomain(data);
  }

  public async update(id: string, updates: Partial<CreateMerchantRuleDTO>): Promise<MerchantRule> {
    const patchPayload: Record<string, unknown> = {};

    if (updates.merchantName !== undefined) {
      patchPayload.merchant_name = updates.merchantName.trim();
    }
    if (updates.patterns !== undefined) {
      patchPayload.patterns = updates.patterns.map((p) => p.trim()).filter((p) => p.length > 0);
    }
    if (updates.patternType !== undefined) {
      patchPayload.pattern_type = updates.patternType;
    }
    if (updates.priority !== undefined) {
      patchPayload.priority = updates.priority;
    }
    if (updates.categoryHint !== undefined) {
      patchPayload.category_hint = updates.categoryHint;
    }
    if (updates.isActive !== undefined) {
      patchPayload.is_active = updates.isActive;
    }

    const { data, error } = await supabase
      .from('merchant_rules')
      .update(patchPayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return this.mapToDomain(data);
  }

  public async delete(id: string): Promise<void> {
    const { error } = await supabase.from('merchant_rules').delete().eq('id', id);
    if (error) throw error;
  }

  public async count(filter?: MerchantRuleFilter): Promise<number> {
    let query = supabase.from('merchant_rules').select('*', { count: 'exact', head: true });

    if (filter?.isActive !== undefined) {
      query = query.eq('is_active', filter.isActive);
    }
    if (filter?.isUserDefined !== undefined) {
      query = query.eq('is_user_defined', filter.isUserDefined);
    }
    if (filter?.userId !== undefined) {
      if (filter.userId === null) {
        query = query.is('user_id', null);
      } else {
        query = query.eq('user_id', filter.userId);
      }
    }

    const { count, error } = await query;
    if (error) throw error;

    return count || 0;
  }

  private mapToDomain(row: any): MerchantRule {
    return {
      id: row.id,
      merchantName: row.merchant_name,
      patterns: Array.isArray(row.patterns) ? row.patterns : [],
      patternType: row.pattern_type || 'CONTAINS',
      priority: row.priority || 50,
      categoryHint: row.category_hint || undefined,
      isUserDefined: row.is_user_defined ?? false,
      userId: row.user_id || null,
      isActive: row.is_active ?? true,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
