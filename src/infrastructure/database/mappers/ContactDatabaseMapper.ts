/**
 * ContactDatabaseMapper — Mapeador bidireccional entre Contact y base de datos (US-049)
 */

import type { Contact } from '../../../domain/models/Contact';

export interface ContactDatabaseRow {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export class ContactDatabaseMapper {
  public static mapToDomain(row: ContactDatabaseRow): Contact {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      phone: row.phone || null,
      email: row.email || null,
      notes: row.notes || null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  public static mapToDatabase(domain: Contact): ContactDatabaseRow {
    return {
      id: domain.id,
      user_id: domain.userId,
      name: domain.name,
      phone: domain.phone || null,
      email: domain.email || null,
      notes: domain.notes || null,
      created_at: domain.createdAt.toISOString(),
      updated_at: domain.updatedAt.toISOString(),
    };
  }
}
