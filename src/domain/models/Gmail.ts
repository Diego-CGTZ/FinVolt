import type { RawEvent } from './RawEvent';

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: {
    size?: number;
    data?: string; // base64 o base64url encoded
  };
  parts?: GmailMessagePart[];
}

/**
 * Representación estructurada de un correo electrónico obtenido de Gmail API (US-033).
 */
export interface GmailMessageInput {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string | number;
  payload?: GmailMessagePart;
  from?: string;
  to?: string;
  subject?: string;
  date?: Date | string | number;
  bodyText?: string;
  bodyHtml?: string;
  raw?: string;
  provider?: 'GMAIL';
}

/**
 * Estado de autorización con la API de Google / Gmail (OAuth2).
 */
export interface GmailAuthState {
  isAuthorized: boolean;
  emailAddress?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes: string[];
}

/**
 * Credenciales y tokens suministrados para conectar con Gmail.
 */
export interface GmailCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number; // tiempo de validez en segundos
  tokenType?: string;
  idToken?: string;
  emailAddress?: string;
  scopes?: string[];
}

/**
 * Parámetros de búsqueda y detección de correos en Gmail.
 */
export interface GmailSearchOptions {
  query?: string;
  labelIds?: string[];
  maxResults?: number;
  pageToken?: string;
  includeSpamTrash?: boolean;
  sinceDate?: Date;
  onlyFinancial?: boolean;
}

/**
 * Resultado estructurado de la sincronización / ingesta de correos desde Gmail.
 */
export interface GmailSyncResult {
  success: boolean;
  totalDetected: number;
  savedCount: number;
  duplicatesCount: number;
  failedCount: number;
  events: RawEvent[];
  errors: { messageId: string; error: string }[];
  syncedAt: Date;
}
