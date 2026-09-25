import { supabase } from '../api/supabaseClient';
import type { Category, CreateCategoryInput, UpdateCategoryInput } from '../../domain/models/Category';
import type { ICategoryRepository } from '../../domain/repositories/ICategoryRepository';

/**
 * SupabaseCategoryRepository (US-007)
 *
 * Implementación concreta de ICategoryRepository usando Supabase.
 * RLS en la tabla `categories` garantiza que:
 *   - SELECT: el usuario ve las del sistema (user_id IS NULL) + las suyas.
 *   - INSERT/UPDATE/DELETE: solo opera sobre las categorías propias.
 */
export class SupabaseCategoryRepository implements ICategoryRepository {
  // ── Queries ────────────────────────────────────────────────────────────────

  async getCategories(): Promise<Category[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return (data ?? []).map(this.mapToDomain);
  }

  async getActiveCategories(): Promise<Category[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw error;
    return (data ?? []).map(this.mapToDomain);
  }

  // ── Mutaciones ─────────────────────────────────────────────────────────────

  async createCategory(input: CreateCategoryInput): Promise<Category> {
    const { data, error } = await supabase
      .from('categories')
      .insert([
        {
          name: input.name,
          icon: input.icon ?? null,
          color: input.color ?? null,
          // user_id es seteado automáticamente por Supabase a través de auth.uid()
          // gracias al DEFAULT en la columna; RLS rechaza user_id != auth.uid()
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return this.mapToDomain(data);
  }

  async updateCategory(id: string, input: UpdateCategoryInput): Promise<Category> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined)     patch.name      = input.name;
    if (input.icon !== undefined)     patch.icon      = input.icon;
    if (input.color !== undefined)    patch.color     = input.color;
    if (input.isActive !== undefined) patch.is_active = input.isActive;
    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('categories')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return this.mapToDomain(data);
  }

  async deleteCategory(id: string): Promise<void> {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // ── Mapper ─────────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapToDomain(row: any): Category {
    return {
      id:        row.id,
      userId:    row.user_id ?? null,
      name:      row.name,
      icon:      row.icon ?? null,
      color:     row.color ?? null,
      isActive:  row.is_active,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
