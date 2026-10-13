import type {
  OutlookAuthState,
  OutlookCredentials,
  OutlookMessageInput,
  OutlookSearchOptions,
} from '../../../domain/models/Outlook';
import type { IOutlookClient, OutlookUserProfile } from '../../../domain/interfaces/IOutlookClient';

/**
 * Cliente mock en memoria para Microsoft Graph / Outlook (US-035).
 *
 * Simula flujo de autenticación Microsoft OAuth2, almacén de correos y consultas OData.
 */
export class MockOutlookClient implements IOutlookClient {
  private authState: OutlookAuthState;
  private messages: Map<string, OutlookMessageInput> = new Map();
  public simulateNetworkFailure = false;
  public simulateAuthExpired = false;

  constructor(initialMessages: OutlookMessageInput[] = [], initialAuthorized = false) {
    this.authState = {
      isAuthorized: initialAuthorized,
      userPrincipalName: initialAuthorized ? 'usuario@outlook.com' : undefined,
      accessToken: initialAuthorized ? 'mock-outlook-token-initial' : undefined,
      scopes: ['Mail.Read'],
    };

    for (const msg of initialMessages) {
      this.addMessage(msg);
    }
  }

  async authorize(credentials: OutlookCredentials): Promise<OutlookAuthState> {
    if (this.simulateNetworkFailure) {
      throw new Error('Error de red al conectar con Microsoft Identity Provider.');
    }

    if (!credentials.accessToken || credentials.accessToken.trim() === '') {
      throw new Error('El token de acceso de Microsoft es obligatorio para autorizar.');
    }

    const now = new Date();
    const expiresInSec = credentials.expiresIn || 3600;

    this.authState = {
      isAuthorized: true,
      userPrincipalName: credentials.userPrincipalName || 'usuario.autorizado@outlook.com',
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      expiresAt: new Date(now.getTime() + expiresInSec * 1000),
      scopes: credentials.scopes || ['Mail.Read'],
    };

    this.simulateAuthExpired = false;
    return { ...this.authState };
  }

  async disconnect(): Promise<void> {
    this.authState = {
      isAuthorized: false,
      userPrincipalName: undefined,
      accessToken: undefined,
      refreshToken: undefined,
      expiresAt: undefined,
      scopes: [],
    };
  }

  async getAuthState(): Promise<OutlookAuthState> {
    if (this.simulateAuthExpired && this.authState.isAuthorized) {
      this.authState.isAuthorized = false;
      this.authState.accessToken = undefined;
    }
    return { ...this.authState };
  }

  async refreshToken(): Promise<OutlookAuthState> {
    if (!this.authState.refreshToken) {
      throw new Error('No se cuenta con refresh token de Microsoft para renovar la sesión.');
    }
    this.authState.accessToken = `mock-outlook-refreshed-token-${Date.now()}`;
    this.authState.expiresAt = new Date(Date.now() + 3600 * 1000);
    this.authState.isAuthorized = true;
    this.simulateAuthExpired = false;
    return { ...this.authState };
  }

  async getProfile(): Promise<OutlookUserProfile> {
    const auth = await this.getAuthState();
    if (!auth.isAuthorized) {
      throw new Error('No autorizado: sesión de Outlook no iniciada.');
    }

    return {
      displayName: 'Usuario Outlook',
      mail: auth.userPrincipalName || 'usuario@outlook.com',
      userPrincipalName: auth.userPrincipalName || 'usuario@outlook.com',
    };
  }

  async searchMessages(options: OutlookSearchOptions = {}): Promise<string[]> {
    if (this.simulateNetworkFailure) {
      throw new Error('Fallo de conexión al buscar correos en Microsoft Graph API.');
    }

    const auth = await this.getAuthState();
    if (!auth.isAuthorized) {
      throw new Error('No autorizado: se requiere autorización para consultar correos de Outlook.');
    }

    const all = Array.from(this.messages.values());
    const queryLower = (options.query || '').toLowerCase();
    const sinceDate = options.sinceDate;

    const matched = all.filter((msg) => {
      // Filtro de fecha
      if (sinceDate) {
        let msgDate: Date | undefined;
        if (msg.receivedDateTime) {
          msgDate = new Date(msg.receivedDateTime);
        } else if (msg.sentDateTime) {
          msgDate = new Date(msg.sentDateTime);
        }
        if (msgDate && msgDate.getTime() < sinceDate.getTime()) {
          return false;
        }
      }

      // Filtro de query
      if (queryLower.trim()) {
        const sender = `${msg.from?.emailAddress?.name || ''} ${msg.from?.emailAddress?.address || ''}`.toLowerCase();
        const subject = (msg.subject || '').toLowerCase();
        const bodyPreview = (msg.bodyPreview || '').toLowerCase();
        const bodyContent = (msg.body?.content || '').toLowerCase();

        // Extrae tokens o términos separados por OR o comas
        const terms = queryLower
          .replace(/[()]/g, ' ')
          .split(/\s+or\s+|\s*,\s*/)
          .map((t) => t.trim().replace(/"/g, ''))
          .filter((t) => t.length > 0);

        if (terms.length > 0) {
          const anyMatch = terms.some((term) => {
            return (
              sender.includes(term) ||
              subject.includes(term) ||
              bodyPreview.includes(term) ||
              bodyContent.includes(term)
            );
          });
          if (!anyMatch) return false;
        }
      }

      return true;
    });

    const limit = options.maxResults || 100;
    return matched.slice(0, limit).map((m) => m.id);
  }

  async getMessage(id: string): Promise<OutlookMessageInput | null> {
    if (this.simulateNetworkFailure) {
      throw new Error(`Error de red al obtener mensaje de Outlook "${id}".`);
    }

    const auth = await this.getAuthState();
    if (!auth.isAuthorized) {
      throw new Error('No autorizado: se requiere autorización para leer mensajes.');
    }

    const found = this.messages.get(id);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async fetchMessages(options: OutlookSearchOptions = {}): Promise<OutlookMessageInput[]> {
    const ids = await this.searchMessages(options);
    const results: OutlookMessageInput[] = [];

    for (const id of ids) {
      const msg = await this.getMessage(id);
      if (msg) results.push(msg);
    }

    return results;
  }

  addMessage(msg: OutlookMessageInput): void {
    this.messages.set(msg.id, { ...msg, provider: 'OUTLOOK' });
  }

  clearMessages(): void {
    this.messages.clear();
  }
}
