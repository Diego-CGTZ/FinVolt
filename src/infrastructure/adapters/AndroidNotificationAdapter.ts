import type {
  AdapterValidationResult,
  FinancialSourceAdapter,
} from '../../domain/interfaces/FinancialSourceAdapter';
import type { CreateRawEventDTO, RawEventSource } from '../../domain/models/RawEvent';

export interface AndroidNotificationInput {
  packageName: string;
  title?: string;
  text?: string;
  subText?: string;
  bigText?: string;
  postTime: number; // Timestamp en milisegundos
  key?: string; // Clave única de la notificación en el sistema Android
  extras?: Record<string, unknown>;
}

/**
 * Adaptador para Notificaciones Push de Android (US-019).
 *
 * Transforma el payload crudo recibido desde el NotificationListenerService
 * de Android en un CreateRawEventDTO canónico.
 */
export class AndroidNotificationAdapter implements FinancialSourceAdapter<AndroidNotificationInput> {
  readonly source: RawEventSource = 'ANDROID_NOTIFICATION';
  readonly name = 'Android Bank Notification Adapter';
  readonly description =
    'Adapta notificaciones capturadas por el servicio en segundo plano de Android';

  canHandle(input: unknown): input is AndroidNotificationInput {
    if (!input || typeof input !== 'object') return false;
    const item = input as Record<string, unknown>;
    return (
      typeof item.packageName === 'string' &&
      typeof item.postTime === 'number' &&
      (typeof item.text === 'string' || typeof item.title === 'string' || typeof item.bigText === 'string')
    );
  }

  validate(input: AndroidNotificationInput): AdapterValidationResult {
    if (!input.packageName || input.packageName.trim() === '') {
      return { isValid: false, reason: 'El packageName es obligatorio para notificaciones de Android.' };
    }
    if (!input.postTime || isNaN(input.postTime)) {
      return { isValid: false, reason: 'El postTime debe ser una marca de tiempo numérica válida.' };
    }
    const hasContent = Boolean(input.text || input.title || input.bigText);
    if (!hasContent) {
      return { isValid: false, reason: 'La notificación debe contener texto o título.' };
    }
    return { isValid: true };
  }

  async adapt(input: AndroidNotificationInput): Promise<CreateRawEventDTO> {
    const rawText = input.bigText || input.text || input.title || '';
    const receivedAt = new Date(input.postTime);

    return {
      source: this.source,
      sourceId: input.key || `${input.packageName}-${input.postTime}`,
      payload: {
        packageName: input.packageName,
        title: input.title,
        text: input.text,
        subText: input.subText,
        bigText: input.bigText,
        postTime: input.postTime,
        extras: input.extras || {},
      },
      rawText,
      metadata: {
        packageName: input.packageName,
        capturedAt: new Date().toISOString(),
        origin: 'AndroidNotificationListener',
      },
      receivedAt,
    };
  }
}
