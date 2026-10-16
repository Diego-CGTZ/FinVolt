/**
 * IContactRepository — Contrato del Repositorio de Contactos (US-049 / US-050)
 *
 * Define operaciones de persistencia para personas y entidades contrapartes.
 */

import type { Contact } from '../models/Contact';

export interface IContactRepository {
  /** Guarda o actualiza un contacto */
  save(contact: Contact): Promise<void>;

  /** Busca un contacto por su ID */
  findById(id: string): Promise<Contact | null>;

  /** Obtiene todos los contactos pertenecientes a un usuario */
  findByUserId(userId: string): Promise<Contact[]>;

  /** Elimina un contacto por su ID */
  delete(id: string): Promise<void>;

  /** Limpia el almacenamiento de contactos (útil para pruebas) */
  clear(): Promise<void>;
}
