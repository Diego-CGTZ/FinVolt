import type { FinancialSourceAdapter } from '../../interfaces/FinancialSourceAdapter';
import type { IOutlookClient } from '../../interfaces/IOutlookClient';
import type {
  OutlookAuthState,
  OutlookCredentials,
  OutlookMessageInput,
  OutlookSearchOptions,
  OutlookSyncResult,
} from '../../models/Outlook';
import type { RawEvent } from '../../models/RawEvent';
import type { IRawEventRepository } from '../../repositories/IRawEventRepository';
import { OutlookFinancialAdapter } from '../../../infrastructure/adapters/OutlookFinancialAdapter';

export interface OutlookIngestionOptions {
  client: IOutlookClient;
  repository: IRawEventRepository;
  adapter?: FinancialSourceAdapter<OutlookMessageInput>;
}

/**
 * Consulta de búsqueda financiera por defecto para Outlook / Microsoft Graph.
 */
export const DEFAULT_FINANCIAL_OUTLOOK_QUERY =
  'bbva OR santander OR banamex OR banorte OR nu OR mercadopago OR paypal OR stp OR amex OR ' +
  'transferencia OR cargo OR compra OR retiro OR pago OR abono OR recibo OR comprobante OR spei';

/**
 * Servicio de Ingesta y Sincronización de Outlook (US-035).
 *
 * Conecta con la cuenta de Outlook/Microsoft del usuario, detecta correos transaccionales bancarios,
 * transforma los mensajes mediante un FinancialSourceAdapter desacoplado y persiste
 * eventos crudos (RawEvent) inmutables para el pipeline de conciliación.
 *
 * REGLA ARQUITECTÓNICA ESTRICTA:
 * No interactúa ni inserta directamente en el modelo Transaction.
 */
export class OutlookIngestionService {
  private readonly client: IOutlookClient;
  private readonly repository: IRawEventRepository;
  private readonly adapter: FinancialSourceAdapter<OutlookMessageInput>;

  constructor(options: OutlookIngestionOptions) {
    this.client = options.client;
    this.repository = options.repository;
    this.adapter = options.adapter || new OutlookFinancialAdapter();
  }

  /**
   * Conecta y autoriza la sesión con Outlook mediante credenciales OAuth2.
   */
  async authorize(credentials: OutlookCredentials): Promise<OutlookAuthState> {
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
  async getAuthState(): Promise<OutlookAuthState> {
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
   * Construye la consulta de búsqueda de correos financieros para Microsoft Graph.
   */
  buildFinancialQuery(options: OutlookSearchOptions = {}): string {
    if (options.onlyFinancial === false) {
      return options.query || '';
    }

    if (options.query) {
      return `(${options.query}) AND (${DEFAULT_FINANCIAL_OUTLOOK_QUERY})`;
    }

    return DEFAULT_FINANCIAL_OUTLOOK_QUERY;
  }

  /**
   * Detecta correos financieros en la bandeja de entrada según los filtros proporcionados.
   */
  async detectFinancialEmails(options: OutlookSearchOptions = {}): Promise<OutlookMessageInput[]> {
    const auth = await this.client.getAuthState();
    if (!auth.isAuthorized) {
      throw new Error('No autorizado: se requiere conectar la cuenta de Outlook antes de detectar correos.');
    }

    const searchQuery = this.buildFinancialQuery(options);
    const searchOptions: OutlookSearchOptions = {
      ...options,
      query: searchQuery,
    };

    return this.client.fetchMessages(searchOptions);
  }

  /**
   * Sincroniza e ingiere correos desde Outlook convirtiéndolos en RawEvents (US-035).
   *
   * Cumple con los 4 Acceptance Criteria de US-035:
   * 1. Conexión/autorización verificada.
   * 2. Detección inteligente de correos financieros.
   * 3. Creación de RawEvent garantizando deduplicación e inmutabilidad.
   * 4. Desacople de adapter compatible con la arquitectura común (FinancialSourceAdapter).
   */
  async syncFinancialEmails(options: OutlookSearchOptions = {}): Promise<OutlookSyncResult> {
    const auth = await this.client.getAuthState();
    if (!auth.isAuthorized) {
      return {
        success: false,
        totalDetected: 0,
        savedCount: 0,
        duplicatesCount: 0,
        failedCount: 0,
        events: [],
        errors: [{ messageId: 'AUTH', error: 'Sesión de Outlook no autorizada o expirada.' }],
        syncedAt: new Date(),
      };
    }

    let detectedMessages: OutlookMessageInput[] = [];
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
        errors: [{ messageId: 'FETCH', error: `Fallo al detectar correos de Outlook: ${errMsg}` }],
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
            error: `El adaptador "${this.adapter.name}" no puede manejar el formato del mensaje de Outlook.`,
          });
          continue;
        }

        // 2. Validación de la entrada
        const validation = this.adapter.validate(message);
        if (!validation.isValid) {
          failedCount++;
          errors.push({
            messageId,
            error: validation.reason || 'Mensaje de Outlook inválido según las reglas del adaptador.',
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
          messageId,
          error: `Error al procesar mensaje de Outlook ${message.id}: ${errMsg}`,
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
