import type {
  GmailAuthState,
  GmailCredentials,
  GmailMessageInput,
  GmailSearchOptions,
} from '../../../domain/models/Gmail';
import type { GmailUserProfile, IGmailClient } from '../../../domain/interfaces/IGmailClient';

export interface GoogleGmailClientOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

/**
 * Cliente real para la API REST de Gmail (v1) usando OAuth 2.0 (US-033).
 */
export class GoogleGmailClient implements IGmailClient {
  private authState: GmailAuthState = {
    isAuthorized: false,
    scopes: [],
  };
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: GoogleGmailClientOptions = {}) {
    this.baseUrl = options.baseUrl || 'https://gmail.googleapis.com/gmail/v1/users/me';
    this.fetchFn = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : (undefined as unknown as typeof fetch));
  }

  async authorize(credentials: GmailCredentials): Promise<GmailAuthState> {
    if (!credentials.accessToken || credentials.accessToken.trim() === '') {
      throw new Error('El token de acceso de Google es obligatorio para autorizar.');
    }

    const now = new Date();
    const expiresInSec = credentials.expiresIn || 3600;

    this.authState = {
      isAuthorized: true,
      emailAddress: credentials.emailAddress,
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      expiresAt: new Date(now.getTime() + expiresInSec * 1000),
      scopes: credentials.scopes || ['https://www.googleapis.com/auth/gmail.readonly'],
    };

    return { ...this.authState };
  }

  async disconnect(): Promise<void> {
    this.authState = {
      isAuthorized: false,
      scopes: [],
    };
  }

  async getAuthState(): Promise<GmailAuthState> {
    return { ...this.authState };
  }

  private async ensureAuthorized(): Promise<string> {
    const auth = await this.getAuthState();
    if (!auth.isAuthorized || !auth.accessToken) {
      throw new Error('No autorizado: sesión de Gmail no iniciada.');
    }
    return auth.accessToken;
  }

  async getProfile(): Promise<GmailUserProfile> {
    const token = await this.ensureAuthorized();
    const res = await this.fetchFn(`${this.baseUrl}/profile`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Error de Gmail API (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as {
      emailAddress: string;
      messagesTotal?: number;
      threadsTotal?: number;
      historyId?: string;
    };

    return {
      emailAddress: data.emailAddress,
      messagesTotal: data.messagesTotal,
      threadsTotal: data.threadsTotal,
      historyId: data.historyId,
    };
  }

  async searchMessages(options: GmailSearchOptions = {}): Promise<string[]> {
    const token = await this.ensureAuthorized();
    const params = new URLSearchParams();

    if (options.query) params.append('q', options.query);
    if (options.maxResults) params.append('maxResults', String(options.maxResults));
    if (options.pageToken) params.append('pageToken', options.pageToken);
    if (options.includeSpamTrash) params.append('includeSpamTrash', 'true');
    if (options.labelIds && options.labelIds.length > 0) {
      for (const label of options.labelIds) {
        params.append('labelIds', label);
      }
    }

    const url = `${this.baseUrl}/messages?${params.toString()}`;
    const res = await this.fetchFn(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Error de Gmail API al buscar mensajes (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as { messages?: { id: string }[] };
    return (data.messages || []).map((m) => m.id);
  }

  async getMessage(id: string): Promise<GmailMessageInput | null> {
    const token = await this.ensureAuthorized();
    const url = `${this.baseUrl}/messages/${encodeURIComponent(id)}?format=full`;

    const res = await this.fetchFn(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Error de Gmail API al obtener mensaje ${id} (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as GmailMessageInput;
    data.provider = 'GMAIL';
    return data;
  }

  async fetchMessages(options: GmailSearchOptions = {}): Promise<GmailMessageInput[]> {
    const ids = await this.searchMessages(options);
    const messages: GmailMessageInput[] = [];

    for (const id of ids) {
      const msg = await this.getMessage(id);
      if (msg) messages.push(msg);
    }

    return messages;
  }
}
