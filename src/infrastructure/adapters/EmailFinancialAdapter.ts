import type {
  AdapterValidationResult,
  FinancialSourceAdapter,
} from '../../domain/interfaces/FinancialSourceAdapter';
import type { CreateRawEventDTO, RawEventSource } from '../../domain/models/RawEvent';

export interface EmailFinancialInput {
  messageId: string;
  from: string;
  to?: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  date?: Date | string | number;
  headers?: Record<string, string>;
}

/**
 * Adaptador para Correos Electrónicos Financieros (US-019).
 *
 * Transforma correos entrantes de bancos y pasarelas de pago
 * en un CreateRawEventDTO canónico.
 */
export class EmailFinancialAdapter implements FinancialSourceAdapter<EmailFinancialInput> {
  readonly source: RawEventSource = 'EMAIL';
  readonly name = 'Email Financial Adapter';
  readonly description = 'Adapta correos electrónicos transaccionales bancarios';

  canHandle(input: unknown): input is EmailFinancialInput {
    if (!input || typeof input !== 'object') return false;
    const item = input as Record<string, unknown>;
    return (
      typeof item.messageId === 'string' &&
      typeof item.from === 'string' &&
      typeof item.subject === 'string'
    );
  }

  validate(input: EmailFinancialInput): AdapterValidationResult {
    if (!input.messageId || input.messageId.trim() === '') {
      return { isValid: false, reason: 'El messageId del correo es obligatorio.' };
    }
    if (!input.from || input.from.trim() === '') {
      return { isValid: false, reason: 'El remitente (from) es obligatorio.' };
    }
    if (!input.subject) {
      return { isValid: false, reason: 'El asunto (subject) es obligatorio.' };
    }
    return { isValid: true };
  }

  async adapt(input: EmailFinancialInput): Promise<CreateRawEventDTO> {
    const rawText = input.bodyText || input.subject;
    const receivedAt = input.date ? new Date(input.date) : new Date();

    return {
      source: this.source,
      sourceId: input.messageId,
      payload: {
        messageId: input.messageId,
        from: input.from,
        to: input.to,
        subject: input.subject,
        bodyText: input.bodyText,
        bodyHtml: input.bodyHtml,
        headers: input.headers || {},
      },
      rawText,
      metadata: {
        from: input.from,
        subject: input.subject,
        origin: 'EmailAdapter',
      },
      receivedAt,
    };
  }
}
