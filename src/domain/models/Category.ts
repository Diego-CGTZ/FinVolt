/**
 * Category — Entidad de dominio (US-007)
 *
 * Representa una categoría financiera. Puede ser:
 *   - Predefinida del sistema: `userId === null`, no editable por el usuario.
 *   - Propia del usuario: `userId` es el uid del usuario autenticado.
 *
 * Las categorías son reutilizadas por las transacciones (US-008).
 */
export interface Category {
  id: string;
  /** null → categoría del sistema (predefinida). */
  userId: string | null;
  name: string;
  /** Nombre del icono de la librería Ionicons, compatible con Expo. */
  icon: string | null;
  /** Color hexadecimal (ej: "#FF6B6B"). */
  color: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Payload para crear una categoría de usuario. */
export type CreateCategoryInput = Pick<Category, 'name' | 'icon' | 'color'>;

/** Payload para actualizar una categoría de usuario. */
export type UpdateCategoryInput = Partial<Pick<Category, 'name' | 'icon' | 'color' | 'isActive'>>;
