/**
 * BudgetDatabaseMapper — Mapeador bidireccional de entidad Budget y base de datos (US-046)
 */

import type { Budget } from '../../../domain/models/Budget';

export interface BudgetDatabaseRow {
  id: string;
  user_id: string;
  category_id: string;
  month: string;
  amount_minor: number;
  percentage: number;
  currency: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export class BudgetDatabaseMapper {
  public static mapToDomain(row: BudgetDatabaseRow): Budget {
    return {
      id: row.id,
      userId: row.user_id,
      categoryId: row.category_id,
      month: row.month,
      amountMinor: Number(row.amount_minor),
      amount: Number((Number(row.amount_minor) / 100).toFixed(2)),
      percentage: Number(row.percentage),
      currency: row.currency || 'MXN',
      notes: row.notes || null,
      isActive: Boolean(row.is_active),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  public static mapToDatabase(domain: Budget): BudgetDatabaseRow {
    return {
      id: domain.id,
      user_id: domain.userId,
      category_id: domain.categoryId,
      month: domain.month,
      amount_minor: domain.amountMinor,
      percentage: domain.percentage,
      currency: domain.currency,
      notes: domain.notes,
      is_active: domain.isActive,
      created_at: domain.createdAt.toISOString(),
      updated_at: domain.updatedAt.toISOString(),
    };
  }
}
