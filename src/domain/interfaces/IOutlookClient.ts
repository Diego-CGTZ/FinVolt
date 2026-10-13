import type {
  OutlookAuthState,
  OutlookCredentials,
  OutlookMessageInput,
  OutlookSearchOptions,
} from '../models/Outlook';

export interface OutlookUserProfile {
  displayName?: string;
  mail?: string;
  userPrincipalName: string;
}

/**
 * Contrato de cliente desacoplado para la interacción con Microsoft Graph / Outlook (US-035).
 */
export interface IOutlookClient {
  /**
   * Conecta y autoriza la sesión con las credenciales de Microsoft.
   */
  authorize(credentials: OutlookCredentials): Promise<OutlookAuthState>;

  /**
   * Desconecta la sesión y limpia los tokens activos.
   */
  disconnect(): Promise<void>;

  /**
   * Obtiene el estado actual de autorización.
   */
  getAuthState(): Promise<OutlookAuthState>;

  /**
   * Renueva los tokens de acceso mediante el refresh token.
   */
  refreshToken?(): Promise<OutlookAuthState>;

  /**
   * Obtiene el perfil del usuario autenticado.
   */
  getProfile(): Promise<OutlookUserProfile>;

  /**
   * Busca identificadores de mensajes según los criterios o consulta especificados.
   */
  searchMessages(options?: OutlookSearchOptions): Promise<string[]>;

  /**
   * Obtiene el detalle completo de un mensaje por su ID.
   */
  getMessage(id: string): Promise<OutlookMessageInput | null>;

  /**
   * Detecta y descarga los mensajes completos que cumplen los criterios de búsqueda.
   */
  fetchMessages(options?: OutlookSearchOptions): Promise<OutlookMessageInput[]>;
}
