/**
 * Contact — Modelo de Contacto (US-049 / US-050)
 *
 * Representa a una contraparte (persona, familiar, amigo, institución)
 * involucrada en préstamos, deudas o gastos compartidos.
 */

export interface Contact {
  id: string;
  userId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateContactInput {
  id?: string;
  userId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

export interface UpdateContactInput {
  id: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

export class ContactValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContactValidationError';
  }
}
