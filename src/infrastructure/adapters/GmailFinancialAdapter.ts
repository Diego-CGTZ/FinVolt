import type {
  AdapterValidationResult,
  FinancialSourceAdapter,
} from '../../domain/interfaces/FinancialSourceAdapter';
import type {
  GmailHeader,
  GmailMessageInput,
  GmailMessagePart,
} from '../../domain/models/Gmail';
import type { CreateRawEventDTO, RawEventSource } from '../../domain/models/RawEvent';

/**
 * Decodifica una cadena en base64url (formato estándar de Gmail API) a texto UTF-8.
 */
export function decodeBase64Url(base64UrlStr: string): string {
  if (!base64UrlStr) return '';
  try {
    // Reemplaza caracteres URL-safe por base64 estándar
    let base64 = base64UrlStr.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    // Decodificación segura en Node.js y React Native
    const maybeBuffer = (globalThis as unknown as {
      Buffer?: { from(data: string, enc: string): { toString(enc: string): string } };
    }).Buffer;

    if (maybeBuffer && typeof maybeBuffer.from === 'function') {
      return maybeBuffer.from(base64, 'base64').toString('utf-8');
    }
    // Fallback estándar si Buffer no estuviera disponible globalmente
    if (typeof atob === 'function') {
      return decodeURIComponent(
        Array.prototype.map
          .call(atob(base64), (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      );
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Busca recursivamente en la estructura de partes de un mensaje de Gmail
 * y extrae el cuerpo en texto plano y/o HTML.
 */
export function extractGmailBodies(part?: GmailMessagePart): {
  bodyText?: string;
  bodyHtml?: string;
} {
  if (!part) return {};

  let bodyText: string | undefined;
  let bodyHtml: string | undefined;

  const mime = (part.mimeType || '').toLowerCase();

  if (part.body?.data) {
    const decoded = decodeBase64Url(part.body.data);
    if (mime.includes('text/plain')) {
      bodyText = decoded;
    } else if (mime.includes('text/html')) {
      bodyHtml = decoded;
    }
  }

  if (part.parts && Array.isArray(part.parts)) {
    for (const subPart of part.parts) {
      const sub = extractGmailBodies(subPart);
      if (sub.bodyText && !bodyText) bodyText = sub.bodyText;
      if (sub.bodyHtml && !bodyHtml) bodyHtml = sub.bodyHtml;
    }
  }

  return { bodyText, bodyHtml };
}

/**
 * Obtiene el valor de una cabecera de correo de forma insensible a mayúsculas/minúsculas.
 */
export function getHeaderValue(
  headers: GmailHeader[] | undefined,
  headerName: string,
): string | undefined {
  if (!headers || !Array.isArray(headers)) return undefined;
  const target = headerName.toLowerCase();
  const found = headers.find((h) => h.name.toLowerCase() === target);
  return found ? found.value : undefined;
}

/**
 * Adaptador de fuentes financieras para Gmail (US-033).
 *
 * Desacoplado mediante la interfaz común FinancialSourceAdapter.
 * Transforma correos extraídos de la API de Gmail en CreateRawEventDTO canónicos
 * preservando la inmutabilidad y completitud del payload original (US-018).
 */
export class GmailFinancialAdapter implements FinancialSourceAdapter<GmailMessageInput> {
  readonly source: RawEventSource = 'EMAIL';
  readonly name = 'Gmail Financial Adapter';
  readonly description = 'Adapta correos electrónicos de Gmail API a eventos crudos (US-033)';

  /**
   * Determina si la entrada corresponde a un mensaje de Gmail.
   */
  canHandle(input: unknown): input is GmailMessageInput {
    if (!input || typeof input !== 'object') return false;
    const item = input as Record<string, unknown>;

    // Debe contar con ID de mensaje de Gmail
    if (typeof item.id !== 'string' || item.id.trim() === '') return false;

    // Distingue correo de Gmail por presencia de propiedades típicas de Gmail API
    return (
      item.provider === 'GMAIL' ||
      typeof item.threadId === 'string' ||
      Array.isArray(item.labelIds) ||
      (typeof item.payload === 'object' && item.payload !== null) ||
      typeof item.historyId === 'string' ||
      (typeof item.internalDate !== 'undefined' && item.internalDate !== null) ||
      typeof item.snippet === 'string'
    );
  }

  /**
   * Valida la estructura mínima requerida para procesar el mensaje.
   */
  validate(input: GmailMessageInput): AdapterValidationResult {
    if (!input.id || input.id.trim() === '') {
      return { isValid: false, reason: 'El ID de mensaje de Gmail es obligatorio.' };
    }

    const headers = input.payload?.headers;
    const hasSender = Boolean(
      input.from || getHeaderValue(headers, 'from') || getHeaderValue(headers, 'return-path'),
    );
    const hasSubject = Boolean(
      input.subject || getHeaderValue(headers, 'subject') || input.snippet,
    );
    const hasContent = Boolean(
      input.bodyText || input.bodyHtml || input.snippet || input.payload?.body?.data || input.payload?.parts,
    );

    if (!hasSender && !hasSubject && !hasContent) {
      return {
        isValid: false,
        reason: 'El mensaje de Gmail carece de remitente, asunto y contenido procesable.',
      };
    }

    return { isValid: true };
  }

  /**
   * Transforma el mensaje de Gmail en un DTO canónico de RawEvent.
   */
  async adapt(input: GmailMessageInput): Promise<CreateRawEventDTO> {
    const headers = input.payload?.headers;

    // Extracción de metadatos de cabeceras o campos directos
    const from =
      input.from ||
      getHeaderValue(headers, 'from') ||
      getHeaderValue(headers, 'return-path') ||
      'Desconocido';

    const to = input.to || getHeaderValue(headers, 'to');
    const subject = input.subject || getHeaderValue(headers, 'subject') || input.snippet || 'Sin asunto';

    // Extracción de cuerpos de mensaje
    const extracted = extractGmailBodies(input.payload);
    const bodyText = input.bodyText || extracted.bodyText || input.snippet || '';
    const bodyHtml = input.bodyHtml || extracted.bodyHtml;

    // Texto crudo para motores de parseo de texto
    const rawText = (bodyText && bodyText.trim().length > 0) ? bodyText : subject;

    // Determinación de fecha de recepción
    let receivedAt: Date;
    if (input.internalDate) {
      const ms = typeof input.internalDate === 'string' ? Number(input.internalDate) : input.internalDate;
      receivedAt = !isNaN(ms) ? new Date(ms) : new Date();
    } else if (input.date) {
      receivedAt = new Date(input.date);
    } else {
      const headerDate = getHeaderValue(headers, 'date');
      receivedAt = headerDate ? new Date(headerDate) : new Date();
    }

    if (isNaN(receivedAt.getTime())) {
      receivedAt = new Date();
    }

    return {
      source: this.source,
      sourceId: input.id,
      payload: {
        id: input.id,
        threadId: input.threadId,
        labelIds: input.labelIds || [],
        snippet: input.snippet,
        from,
        to,
        subject,
        bodyText,
        bodyHtml,
        internalDate: input.internalDate,
        rawPayload: input.payload,
      },
      rawText,
      metadata: {
        provider: 'GMAIL',
        messageId: input.id,
        threadId: input.threadId,
        labelIds: input.labelIds || [],
        from,
        to,
        subject,
        snippet: input.snippet,
        hasHtml: Boolean(bodyHtml),
        origin: 'GmailFinancialAdapter',
      },
      receivedAt,
    };
  }
}
