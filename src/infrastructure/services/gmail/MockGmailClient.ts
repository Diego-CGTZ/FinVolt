import type {
  GmailAuthState,
  GmailCredentials,
  GmailMessageInput,
  GmailSearchOptions,
} from '../../../domain/models/Gmail';
import type { GmailUserProfile, IGmailClient } from '../../../domain/interfaces/IGmailClient';

/**
 * Cliente de prueba en memoria para la API de Gmail (US-033).
 *
 * Permite simular autenticación OAuth, almacén de mensajes entrantes,
 * consultas de búsqueda bancarias y escenarios de fallo.
 */
export class MockGmailClient implements IGmailClient {
  private authState: GmailAuthState;
  private messages: Map<string, GmailMessageInput> = new Map();
  public simulateNetworkFailure = false;
  public simulateAuthExpired = false;

  constructor(initialMessages: GmailMessageInput[] = [], initialAuthorized = false) {
    this.authState = {
      isAuthorized: initialAuthorized,
      emailAddress: initialAuthorized ? 'usuario@finvolt.app' : undefined,
      accessToken: initialAuthorized ? 'mock-access-token-initial' : undefined,
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    };

    for (const msg of initialMessages) {
      this.addMessage(msg);
    }
  }

  async authorize(credentials: GmailCredentials): Promise<GmailAuthState> {
    if (this.simulateNetworkFailure) {
      throw new Error('Error de red al conectar con Google OAuth.');
    }

    if (!credentials.accessToken || credentials.accessToken.trim() === '') {
      throw new Error('El token de acceso de Google es obligatorio para autorizar.');
    }

    const now = new Date();
    const expiresInSec = credentials.expiresIn || 3600;

    this.authState = {
      isAuthorized: true,
      emailAddress: credentials.emailAddress || 'usuario.autorizado@finvolt.app',
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      expiresAt: new Date(now.getTime() + expiresInSec * 1000),
      scopes: credentials.scopes || ['https://www.googleapis.com/auth/gmail.readonly'],
    };

    this.simulateAuthExpired = false;
    return { ...this.authState };
  }

  async disconnect(): Promise<void> {
    this.authState = {
      isAuthorized: false,
      emailAddress: undefined,
      accessToken: undefined,
      refreshToken: undefined,
      expiresAt: undefined,
      scopes: [],
    };
  }

  async getAuthState(): Promise<GmailAuthState> {
    if (this.simulateAuthExpired && this.authState.isAuthorized) {
      this.authState.isAuthorized = false;
      this.authState.accessToken = undefined;
    }
    return { ...this.authState };
  }

  async refreshToken(): Promise<GmailAuthState> {
    if (!this.authState.refreshToken) {
      throw new Error('No se cuenta con refresh token para renovar la sesión.');
    }
    this.authState.accessToken = `mock-refreshed-token-${Date.now()}`;
    this.authState.expiresAt = new Date(Date.now() + 3600 * 1000);
    this.authState.isAuthorized = true;
    this.simulateAuthExpired = false;
    return { ...this.authState };
  }

  async getProfile(): Promise<GmailUserProfile> {
    const auth = await this.getAuthState();
    if (!auth.isAuthorized) {
      throw new Error('No autorizado: sesión de Gmail no iniciada.');
    }

    return {
      emailAddress: auth.emailAddress || 'usuario@finvolt.app',
      messagesTotal: this.messages.size,
      threadsTotal: this.messages.size,
    };
  }

  async searchMessages(options: GmailSearchOptions = {}): Promise<string[]> {
    if (this.simulateNetworkFailure) {
      throw new Error('Fallo de conexión al buscar correos en Gmail API.');
    }

    const auth = await this.getAuthState();
    if (!auth.isAuthorized) {
      throw new Error('No autorizado: se requiere autorización para consultar correos.');
    }

    const all = Array.from(this.messages.values());
    const queryLower = (options.query || '').toLowerCase();
    const sinceDate = options.sinceDate;

    const matched = all.filter((msg) => {
      // Filtro de fecha
      if (sinceDate) {
        let msgDate: Date | undefined;
        if (msg.internalDate) {
          msgDate = new Date(Number(msg.internalDate));
        } else if (msg.date) {
          msgDate = new Date(msg.date);
        }
        if (msgDate && msgDate.getTime() < sinceDate.getTime()) {
          return false;
        }
      }

      // Filtro de query con soporte para from:(...) y subject:(...)
      if (queryLower.trim()) {
        const fromMatches = queryLower.match(/from:\(([^)]+)\)/i);
        const subjectMatches = queryLower.match(/subject:\(([^)]+)\)/i);

        let matchedAnyClause = false;

        if (fromMatches && fromMatches[1]) {
          const fromKeywords = fromMatches[1]
            .split(/\s+or\s+/i)
            .map((k) => k.trim().replace(/"/g, ''))
            .filter(Boolean);
          const sender = (msg.from || '').toLowerCase();
          if (fromKeywords.some((k) => sender.includes(k))) {
            matchedAnyClause = true;
          }
        }

        if (subjectMatches && subjectMatches[1]) {
          const subjectKeywords = subjectMatches[1]
            .split(/\s+or\s+/i)
            .map((k) => k.trim().replace(/"/g, ''))
            .filter(Boolean);
          const subject = (msg.subject || '').toLowerCase();
          if (subjectKeywords.some((k) => subject.includes(k))) {
            matchedAnyClause = true;
          }
        }

        // Si no contenía grupos from:(...) ni subject:(...), evalúa términos sueltos
        if (!fromMatches && !subjectMatches) {
          const textToSearch = [
            msg.from || '',
            msg.subject || '',
            msg.snippet || '',
            msg.bodyText || '',
          ]
            .join(' ')
            .toLowerCase();

          const terms = queryLower
            .split(/\s+or\s+/i)
            .map((t) => t.trim().replace(/"/g, ''))
            .filter(Boolean);

          matchedAnyClause = terms.some((term) => textToSearch.includes(term));
        }

        if (!matchedAnyClause) return false;
      }

      return true;
    });

    const limit = options.maxResults || 100;
    return matched.slice(0, limit).map((m) => m.id);
  }

  async getMessage(id: string): Promise<GmailMessageInput | null> {
    if (this.simulateNetworkFailure) {
      throw new Error(`Error de red al obtener mensaje "${id}".`);
    }

    const auth = await this.getAuthState();
    if (!auth.isAuthorized) {
      throw new Error('No autorizado: se requiere autorización para leer mensajes.');
    }

    const found = this.messages.get(id);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async fetchMessages(options: GmailSearchOptions = {}): Promise<GmailMessageInput[]> {
    const ids = await this.searchMessages(options);
    const results: GmailMessageInput[] = [];

    for (const id of ids) {
      const msg = await this.getMessage(id);
      if (msg) results.push(msg);
    }

    return results;
  }

  /**
   * Métodos auxiliares para inyección de mensajes en pruebas
   */
  addMessage(msg: GmailMessageInput): void {
    this.messages.set(msg.id, { ...msg, provider: 'GMAIL' });
  }

  clearMessages(): void {
    this.messages.clear();
  }
}
