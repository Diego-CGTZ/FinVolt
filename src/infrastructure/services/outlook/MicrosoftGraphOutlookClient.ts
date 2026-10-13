import type {
  OutlookAuthState,
  OutlookCredentials,
  OutlookMessageInput,
  OutlookSearchOptions,
} from '../../../domain/models/Outlook';
import type { IOutlookClient, OutlookUserProfile } from '../../../domain/interfaces/IOutlookClient';

export interface MicrosoftGraphClientOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

/**
 * Cliente para la API REST de Microsoft Graph (v1.0) usando OAuth 2.0 (US-035).
 */
export class MicrosoftGraphOutlookClient implements IOutlookClient {
  private authState: OutlookAuthState = {
    isAuthorized: false,
    scopes: [],
  };
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: MicrosoftGraphClientOptions = {}) {
    this.baseUrl = options.baseUrl || 'https://graph.microsoft.com/v1.0/me';
    this.fetchFn = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : (undefined as unknown as typeof fetch));
  }

  async authorize(credentials: OutlookCredentials): Promise<OutlookAuthState> {
    if (!credentials.accessToken || credentials.accessToken.trim() === '') {
      throw new Error('El token de acceso de Microsoft es obligatorio para autorizar.');
    }

    const now = new Date();
    const expiresInSec = credentials.expiresIn || 3600;

    this.authState = {
      isAuthorized: true,
      userPrincipalName: credentials.userPrincipalName,
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      expiresAt: new Date(now.getTime() + expiresInSec * 1000),
      scopes: credentials.scopes || ['Mail.Read'],
    };

    return { ...this.authState };
  }

  async disconnect(): Promise<void> {
    this.authState = {
      isAuthorized: false,
      scopes: [],
    };
  }

  async getAuthState(): Promise<OutlookAuthState> {
    return { ...this.authState };
  }

  private async ensureAuthorized(): Promise<string> {
    const auth = await this.getAuthState();
    if (!auth.isAuthorized || !auth.accessToken) {
      throw new Error('No autorizado: sesión de Outlook no iniciada.');
    }
    return auth.accessToken;
  }

  async getProfile(): Promise<OutlookUserProfile> {
    const token = await this.ensureAuthorized();
    const res = await this.fetchFn(this.baseUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Error de Microsoft Graph API (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as {
      displayName?: string;
      mail?: string;
      userPrincipalName: string;
    };

    return {
      displayName: data.displayName,
      mail: data.mail || data.userPrincipalName,
      userPrincipalName: data.userPrincipalName,
    };
  }

  async searchMessages(options: OutlookSearchOptions = {}): Promise<string[]> {
    const token = await this.ensureAuthorized();
    const params = new URLSearchParams();

    params.append('$select', 'id,subject,from,receivedDateTime');

    if (options.maxResults) {
      params.append('$top', String(options.maxResults));
    }
    if (options.skip) {
      params.append('$skip', String(options.skip));
    }

    const filters: string[] = [];
    if (options.onlyUnread) {
      filters.push('isRead eq false');
    }
    if (options.sinceDate) {
      filters.push(`receivedDateTime ge ${options.sinceDate.toISOString()}`);
    }
    if (filters.length > 0) {
      params.append('$filter', filters.join(' and '));
    }

    if (options.query) {
      params.append('$search', `"${options.query}"`);
    }

    const folderPath = options.folderId ? `/mailFolders/${options.folderId}/messages` : '/messages';
    const url = `${this.baseUrl}${folderPath}?${params.toString()}`;

    const res = await this.fetchFn(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Error de Microsoft Graph al buscar correos (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as { value?: { id: string }[] };
    return (data.value || []).map((m) => m.id);
  }

  async getMessage(id: string): Promise<OutlookMessageInput | null> {
    const token = await this.ensureAuthorized();
    const url = `${this.baseUrl}/messages/${encodeURIComponent(id)}`;

    const res = await this.fetchFn(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Error de Microsoft Graph al obtener mensaje ${id} (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as OutlookMessageInput;
    data.provider = 'OUTLOOK';
    return data;
  }

  async fetchMessages(options: OutlookSearchOptions = {}): Promise<OutlookMessageInput[]> {
    const ids = await this.searchMessages(options);
    const messages: OutlookMessageInput[] = [];

    for (const id of ids) {
      const msg = await this.getMessage(id);
      if (msg) messages.push(msg);
    }

    return messages;
  }
}
