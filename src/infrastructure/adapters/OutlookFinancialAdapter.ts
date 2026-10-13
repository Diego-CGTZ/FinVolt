import type {
  AdapterValidationResult,
  FinancialSourceAdapter,
} from '../../domain/interfaces/FinancialSourceAdapter';
import type { OutlookMessageInput } from '../../domain/models/Outlook';
import type { CreateRawEventDTO, RawEventSource } from '../../domain/models/RawEvent';

/**
 * Adaptador de fuentes financieras para correos de Outlook / Microsoft Graph (US-035).
 *
 * Desacoplado mediante la interfaz común FinancialSourceAdapter (US-019).
 * Transforma mensajes de Microsoft Graph en CreateRawEventDTO canónicos
 * preservando la inmutabilidad y completitud del payload original (US-018).
 */
export class OutlookFinancialAdapter implements FinancialSourceAdapter<OutlookMessageInput> {
  readonly source: RawEventSource = 'EMAIL';
  readonly name = 'Outlook Financial Adapter';
  readonly description = 'Adapta correos electrónicos de Microsoft Graph / Outlook a eventos crudos (US-035)';

  /**
   * Determina si la entrada corresponde a un mensaje de Outlook / Microsoft Graph.
   */
  canHandle(input: unknown): input is OutlookMessageInput {
    if (!input || typeof input !== 'object') return false;
    const item = input as Record<string, unknown>;

    // Debe contar con ID de mensaje
    if (typeof item.id !== 'string' || item.id.trim() === '') return false;

    // Distingue correo de Outlook por presencia de propiedades típicas de Microsoft Graph API
    return (
      item.provider === 'OUTLOOK' ||
      typeof item.conversationId === 'string' ||
      typeof item.bodyPreview === 'string' ||
      typeof item.internetMessageId === 'string' ||
      (typeof item.receivedDateTime !== 'undefined' && item.receivedDateTime !== null) ||
      (typeof item.body === 'object' && item.body !== null && 'content' in (item.body as Record<string, unknown>))
    );
  }

  /**
   * Valida la estructura mínima requerida para procesar el mensaje.
   */
  validate(input: OutlookMessageInput): AdapterValidationResult {
    if (!input.id || input.id.trim() === '') {
      return { isValid: false, reason: 'El ID de mensaje de Outlook es obligatorio.' };
    }

    const hasSender = Boolean(input.from?.emailAddress?.address);
    const hasSubject = Boolean(input.subject && input.subject.trim().length > 0);
    const hasContent = Boolean(
      (input.bodyPreview && input.bodyPreview.trim().length > 0) ||
      (input.body?.content && input.body.content.trim().length > 0),
    );

    if (!hasSender && !hasSubject && !hasContent) {
      return {
        isValid: false,
        reason: 'El mensaje de Outlook carece de remitente, asunto y contenido procesable.',
      };
    }

    return { isValid: true };
  }

  /**
   * Transforma el mensaje de Outlook en un DTO canónico de RawEvent.
   */
  async adapt(input: OutlookMessageInput): Promise<CreateRawEventDTO> {
    const fromAddress = input.from?.emailAddress?.address || 'Desconocido';
    const fromName = input.from?.emailAddress?.name;
    const fromDisplay = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

    const toAddresses = (input.toRecipients || [])
      .map((r) => r.emailAddress.address)
      .join(', ');

    const subject = input.subject || 'Sin asunto';
    const bodyContent = input.body?.content || '';
    const bodyPreview = input.bodyPreview || '';

    // Preferir texto plano para rawText
    const isHtml = input.body?.contentType === 'html';
    let plainText = bodyPreview;
    if (!plainText && !isHtml) {
      plainText = bodyContent;
    }
    const rawText = plainText && plainText.trim().length > 0 ? plainText : subject;

    // Determinación de fecha de recepción
    let receivedAt: Date;
    if (input.receivedDateTime) {
      receivedAt = new Date(input.receivedDateTime);
    } else if (input.sentDateTime) {
      receivedAt = new Date(input.sentDateTime);
    } else {
      receivedAt = new Date();
    }

    if (isNaN(receivedAt.getTime())) {
      receivedAt = new Date();
    }

    return {
      source: this.source,
      sourceId: input.id,
      payload: {
        id: input.id,
        conversationId: input.conversationId,
        subject: input.subject,
        from: fromDisplay,
        fromAddress,
        to: toAddresses,
        bodyPreview,
        bodyText: plainText,
        bodyHtml: isHtml ? bodyContent : undefined,
        receivedDateTime: input.receivedDateTime,
        sentDateTime: input.sentDateTime,
        internetMessageId: input.internetMessageId,
        isRead: input.isRead,
        categories: input.categories || [],
      },
      rawText,
      metadata: {
        provider: 'OUTLOOK',
        messageId: input.id,
        conversationId: input.conversationId,
        from: fromDisplay,
        fromAddress,
        to: toAddresses,
        subject,
        hasHtml: isHtml,
        origin: 'OutlookFinancialAdapter',
      },
      receivedAt,
    };
  }
}
