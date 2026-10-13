import type { RawEvent } from './RawEvent';

export interface OutlookRecipient {
  emailAddress: {
    name?: string;
    address: string;
  };
}

export interface OutlookItemBody {
  contentType?: 'text' | 'html';
  content: string;
}

/**
 * Representación estructurada de un correo obtenido de Microsoft Graph API / Outlook (US-035).
 */
export interface OutlookMessageInput {
  id: string;
  conversationId?: string;
  subject: string;
  bodyPreview?: string;
  body?: OutlookItemBody;
  from?: OutlookRecipient;
  toRecipients?: OutlookRecipient[];
  receivedDateTime?: string | Date;
  sentDateTime?: string | Date;
  isRead?: boolean;
  categories?: string[];
  internetMessageId?: string;
  provider?: 'OUTLOOK';
}

/**
 * Estado de autorización OAuth 2.0 con Microsoft Graph / Outlook.
 */
export interface OutlookAuthState {
  isAuthorized: boolean;
  userPrincipalName?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes: string[];
}

/**
 * Credenciales y tokens suministrados para conectar con Outlook.
 */
export interface OutlookCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number; // segundos
  tokenType?: string;
  userPrincipalName?: string;
  scopes?: string[];
}

/**
 * Parámetros de búsqueda y detección de correos en Outlook / Microsoft Graph.
 */
export interface OutlookSearchOptions {
  query?: string;
  folderId?: string;
  maxResults?: number;
  skip?: number;
  sinceDate?: Date;
  onlyFinancial?: boolean;
  onlyUnread?: boolean;
}

/**
 * Resultado estructurado de la sincronización / ingesta de correos desde Outlook.
 */
export interface OutlookSyncResult {
  success: boolean;
  totalDetected: number;
  savedCount: number;
  duplicatesCount: number;
  failedCount: number;
  events: RawEvent[];
  errors: { messageId: string; error: string }[];
  syncedAt: Date;
}
