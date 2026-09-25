import type { Category, CreateCategoryInput, UpdateCategoryInput } from '../models/Category';

/**
 * ICategoryRepository — Interfaz del repositorio de categorías (US-007)
 *
 * Define las operaciones de datos disponibles para categorías.
 * Las implementaciones concretas viven en src/infrastructure/database/.
 *
 * RLS en Supabase garantiza que:
 *   - El SELECT retorna las categorías del sistema (user_id = NULL) +
 *     las propias del usuario autenticado.
 *   - INSERT / UPDATE / DELETE solo operan sobre categorías del usuario.
 */
export interface ICategoryRepository {
  /**
   * Retorna todas las categorías visibles para el usuario actual:
   * categorías del sistema (predefinidas) + categorías propias activas e inactivas.
   */
  getCategories(): Promise<Category[]>;

  /**
   * Retorna solo las categorías activas visibles para el usuario.
   * Útil para poblar selectores en formularios de transacción.
   */
  getActiveCategories(): Promise<Category[]>;

  /**
   * Crea una nueva categoría de usuario.
   * No se puede crear con user_id = null (eso es exclusivo del sistema).
   */
  createCategory(input: CreateCategoryInput): Promise<Category>;

  /**
   * Actualiza una categoría de usuario.
   * Lanza error si se intenta editar una categoría del sistema.
   */
  updateCategory(id: string, input: UpdateCategoryInput): Promise<Category>;

  /**
   * Elimina (borra físicamente) una categoría de usuario.
   * No aplica a categorías del sistema.
   */
  deleteCategory(id: string): Promise<void>;
}
