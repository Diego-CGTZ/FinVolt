import type { FinancialSourceAdapter } from '../../interfaces/FinancialSourceAdapter';
import type { IGmailClient } from '../../interfaces/IGmailClient';
import type {
  GmailAuthState,
  GmailCredentials,
  GmailMessageInput,
  GmailSearchOptions,
  GmailSyncResult,
} from '../../models/Gmail';
import type { RawEvent } from '../../models/RawEvent';
import type { IRawEventRepository } from '../../repositories/IRawEventRepository';
import { GmailFinancialAdapter } from '../../../infrastructure/adapters/GmailFinancialAdapter';

export interface GmailIngestionOptions {
  client: IGmailClient;
  repository: IRawEventRepository;
  adapter?: FinancialSourceAdapter<GmailMessageInput>;
}

/**
 * Consulta de búsqueda financiera por defecto para detectar correos bancarios y pasarelas de pago.
 */
export const DEFAULT_FINANCIAL_GMAIL_QUERY =
  'from:(bbva OR santander OR banamex OR banorte OR nu OR mercadopago OR paypal OR stp OR amex OR scotiabank OR hsbc OR hey OR bofa OR chase) ' +
  'OR subject:(transferencia OR cargo OR compra OR retiro OR pago OR abono OR "estado de cuenta" OR recibo OR comprobante OR movimiento OR spei)';

/**
 * Servicio de Ingesta y Sincronización de Gmail (US-033).
 *
 * Conecta con la cuenta de Gmail del usuario, detecta correos transaccionales bancarios,
 * transforma los mensajes mediante un FinancialSourceAdapter desacoplado y persiste
 * eventos crudos (RawEvent) inmutables para el pipeline de conciliación.
 *
 * REGLA ARQUITECTÓNICA ESTRICTA:
 * No interactúa ni inserta directamente en el modelo Transaction.
 */
export class GmailIngestionService {
  private readonly client: IGmailClient;
  private readonly repository: IRawEventRepository;
  private readonly adapter: FinancialSourceAdapter<GmailMessageInput>;

  constructor(options: GmailIngestionOptions) {
    this.client = options.client;
    this.repository = options.repository;
    this.adapter = options.adapter || new GmailFinancialAdapter();
  }

  /**
   * Conecta y autoriza la sesión con Gmail mediante credenciales OAuth.
   */
  async authorize(credentials: GmailCredentials): Promise<GmailAuthState> {
    return this.client.authorize(credentials);
  }

  /**
   * Desconecta la sesión y revoca/limpia los tokens activos.
   */
  async disconnect(): Promise<void> {
    return this.client.disconnect();
  }

  /**
   * Consulta el estado actual de autorización.
   */
  async getAuthState(): Promise<GmailAuthState> {
    return this.client.getAuthState();
  }

  /**
   * Comprueba de forma booleana si la sesión se encuentra activa y autorizada.
   */
  async isAuthenticated(): Promise<boolean> {
    const state = await this.client.getAuthState();
    return state.isAuthorized;
  }

  /**
   * Construye la consulta de búsqueda de correos financieros para la API de Gmail.
   */
  buildFinancialQuery(options: GmailSearchOptions = {}): string {
    const parts: string[] = [];

    if (options.onlyFinancial !== false) {
      if (options.query) {
        parts.push(`(${options.query})`);
      } else {
        parts.push(`(${DEFAULT_FINANCIAL_GMAIL_QUERY})`);
      }
    } else if (options.query) {
      parts.push(options.query);
    }

    if (options.sinceDate) {
      const year = options.sinceDate.getFullYear();
      const month = String(options.sinceDate.getMonth() + 1).padStart(2, '0');
      const day = String(options.sinceDate.getDate()).padStart(2, '0');
      parts.push(`after:${year}/${month}/${day}`);
    }

    return parts.join(' ').trim();
  }

  /**
   * Detecta correos financieros en la bandeja de entrada según los filtros proporcionados.
   */
  async detectFinancialEmails(options: GmailSearchOptions = {}): Promise<GmailMessageInput[]> {
    const auth = await this.client.getAuthState();
    if (!auth.isAuthorized) {
      throw new Error('No autorizado: se requiere conectar la cuenta de Gmail antes de detectar correos.');
    }

    const searchQuery = this.buildFinancialQuery(options);
    const searchOptions: GmailSearchOptions = {
      ...options,
      query: searchQuery,
    };

    return this.client.fetchMessages(searchOptions);
  }

  /**
   * Sincroniza e ingiere correos desde Gmail convirtiéndolos en RawEvents (US-033).
   *
   * Cumple con los 4 Acceptance Criteria de US-033:
   * 1. Conexión/autorización verificada.
   * 2. Detección inteligente de correos financieros.
   * 3. Desacople mediante FinancialSourceAdapter.
   * 4. Creación de RawEvent garantizando deduplicación e inmutabilidad.
   */
  async syncFinancialEmails(options: GmailSearchOptions = {}): Promise<GmailSyncResult> {
    const auth = await this.client.getAuthState();
    if (!auth.isAuthorized) {
      return {
        success: false,
        totalDetected: 0,
        savedCount: 0,
        duplicatesCount: 0,
        failedCount: 0,
        events: [],
        errors: [{ messageId: 'AUTH', error: 'Sesión de Gmail no autorizada o expirada.' }],
        syncedAt: new Date(),
      };
    }

    let detectedMessages: GmailMessageInput[] = [];
    try {
      detectedMessages = await this.detectFinancialEmails(options);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        totalDetected: 0,
        savedCount: 0,
        duplicatesCount: 0,
        failedCount: 0,
        events: [],
        errors: [{ messageId: 'FETCH', error: `Fallo al detectar correos de Gmail: ${errMsg}` }],
        syncedAt: new Date(),
      };
    }

    const savedEvents: RawEvent[] = [];
    const errors: { messageId: string; error: string }[] = [];
    let duplicatesCount = 0;
    let failedCount = 0;

    for (const message of detectedMessages) {
      const messageId = (message as { id?: string })?.id || 'unknown';
      try {
        // 1. Verificación del adaptador
        if (!this.adapter.canHandle(message)) {
          failedCount++;
          errors.push({
            messageId,
            error: `El adaptador "${this.adapter.name}" no puede manejar el formato del mensaje.`,
          });
          continue;
        }

        // 2. Validación de la entrada
        const validation = this.adapter.validate(message);
        if (!validation.isValid) {
          failedCount++;
          errors.push({
            messageId: message.id,
            error: validation.reason || 'Mensaje inválido según las reglas del adaptador.',
          });
          continue;
        }

        // 3. Deduplicación por sourceId de evento crudo
        const existing = await this.repository.findBySourceId(this.adapter.source, message.id);
        if (existing) {
          duplicatesCount++;
          continue;
        }

        // 4. Adaptación desacoplada
        const rawEventDto = await this.adapter.adapt(message);

        // 5. Creación del RawEvent en persistencia
        const saved = await this.repository.save(rawEventDto);
        savedEvents.push(saved);
      } catch (err: unknown) {
        failedCount++;
        const errMsg = err instanceof Error ? err.message : String(err);
        errors.push({
          messageId: message.id,
          error: `Error al procesar mensaje ${message.id}: ${errMsg}`,
        });
      }
    }

    return {
      success: errors.length === 0 || savedEvents.length > 0,
      totalDetected: detectedMessages.length,
      savedCount: savedEvents.length,
      duplicatesCount,
      failedCount,
      events: savedEvents,
      errors,
      syncedAt: new Date(),
    };
  }
}
