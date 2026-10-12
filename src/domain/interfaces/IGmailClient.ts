import type {
  GmailAuthState,
  GmailCredentials,
  GmailMessageInput,
  GmailSearchOptions,
} from '../models/Gmail';

export interface GmailUserProfile {
  emailAddress: string;
  messagesTotal?: number;
  threadsTotal?: number;
  historyId?: string;
}

/**
 * Contrato de cliente desacoplado para interacción con la API de Gmail (US-033).
 */
export interface IGmailClient {
  /**
   * Conecta y autoriza la sesión con las credenciales dadas.
   */
  authorize(credentials: GmailCredentials): Promise<GmailAuthState>;

  /**
   * Desconecta la sesión y revoca/limpia las credenciales activas.
   */
  disconnect(): Promise<void>;

  /**
   * Obtiene el estado actual de autorización.
   */
  getAuthState(): Promise<GmailAuthState>;

  /**
   * Refresca los tokens de acceso si expiran y se cuenta con refresh token.
   */
  refreshToken?(): Promise<GmailAuthState>;

  /**
   * Obtiene el perfil del usuario autenticado.
   */
  getProfile(): Promise<GmailUserProfile>;

  /**
   * Busca identificadores de mensajes según los criterios o consulta especificados.
   */
  searchMessages(options?: GmailSearchOptions): Promise<string[]>;

  /**
   * Obtiene el detalle completo de un mensaje por su ID.
   */
  getMessage(id: string): Promise<GmailMessageInput | null>;

  /**
   * Detecta y descarga los mensajes completos que cumplen los criterios de búsqueda.
   */
  fetchMessages(options?: GmailSearchOptions): Promise<GmailMessageInput[]>;
}
