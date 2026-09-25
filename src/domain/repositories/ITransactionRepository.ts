import type {
  Transaction,
  CreateTransactionInput,
  UpdateTransactionInput,
} from '../models/Transaction';

/**
 * ITransactionRepository — Interfaz del repositorio de transacciones (US-008)
 *
 * Define las operaciones de datos disponibles para transacciones.
 * Las implementaciones concretas viven en src/infrastructure/database/.
 *
 * RLS en Supabase garantiza que todas las operaciones están acotadas
 * automáticamente al usuario autenticado (user_id = auth.uid()).
 *
 * Nota sobre paginación: las transacciones pueden ser muchas, por eso
 * `listTransactions` acepta un objeto de filtros y opciones de paginación.
 */

export interface TransactionFilters {
  accountId?: string;
  categoryId?: string;
  type?: Transaction['type'];
  status?: Transaction['status'];
  /** Rango de fechas (inclusive). Filtra por `occurred_at`. */
  from?: Date;
  to?: Date;
  /** Texto libre para buscar en merchant o description. */
  search?: string;
}

export interface PaginationOptions {
  limit?: number;   // default: 50
  offset?: number;  // default: 0
}

export interface ITransactionRepository {
  /**
   * Lista transacciones del usuario con filtros y paginación opcionales.
   * Ordena por occurred_at DESC por defecto.
   */
  listTransactions(
    filters?: TransactionFilters,
    pagination?: PaginationOptions,
  ): Promise<Transaction[]>;

  /**
   * Obtiene una transacción por ID.
   * Lanza error si no existe o no pertenece al usuario.
   */
  getTransaction(id: string): Promise<Transaction>;

  /**
   * Crea una nueva transacción.
   * El repositorio calcula el fingerprint si no se provee.
   */
  createTransaction(input: CreateTransactionInput): Promise<Transaction>;

  /**
   * Actualiza campos de una transacción existente.
   * Lanza error si no pertenece al usuario.
   */
  updateTransaction(id: string, input: UpdateTransactionInput): Promise<Transaction>;

  /**
   * Elimina una transacción.
   * Nota: eliminar una parte de una transferencia no elimina la contraria.
   */
  deleteTransaction(id: string): Promise<void>;

  /**
   * Busca una transacción por su fingerprint determinístico.
   * Utilizado por el pipeline de deduplicación (US-026).
   * Retorna null si no existe.
   */
  findByFingerprint(fingerprint: string): Promise<Transaction | null>;
}
