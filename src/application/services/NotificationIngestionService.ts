import { AndroidNotificationListenerModule } from '../../infrastructure/native/AndroidNotificationListenerModule';
import { AndroidNotificationAdapter } from '../../infrastructure/adapters/AndroidNotificationAdapter';
import type { AndroidNotificationInput } from '../../infrastructure/adapters/AndroidNotificationAdapter';
import { FinancialAppWhitelist } from '../../domain/services/FinancialAppWhitelist';
import type { RawEventService } from '../../domain/services/RawEventService';
import type { RawEvent } from '../../domain/models/RawEvent';

export interface IngestionResult {
  captured: boolean;
  reason?: string;
  rawEvent?: RawEvent;
  isNew?: boolean;
}

/**
 * Servicio de Aplicación para la Ingestión de Notificaciones (US-020).
 *
 * Conecta el listener nativo de Android con el pipeline de eventos crudos:
 * 1. Recibe la notificación.
 * 2. Aplica filtro estricto de whitelist de apps y contenido financiero.
 * 3. Adapta mediante AndroidNotificationAdapter.
 * 4. Guarda como RawEvent (inmutable, con deduplicación por source_id).
 * 5. NUNCA escribe directamente en la tabla de transacciones.
 */
export class NotificationIngestionService {
  private adapter = new AndroidNotificationAdapter();
  private unsubscribeListener?: () => void;
  private onCapturedCallbacks: Set<(event: RawEvent, isNew: boolean) => void> = new Set();

  constructor(private readonly rawEventService: RawEventService) {}

  /**
   * Inicia la escucha automática de notificaciones.
   */
  start(): void {
    if (this.unsubscribeListener) return;

    this.unsubscribeListener = AndroidNotificationListenerModule.addListener(
      async (notification) => {
        try {
          await this.processIncomingNotification(notification);
        } catch (err) {
          console.error('[NotificationIngestionService] Error procesando notificación:', err);
        }
      },
    );
  }

  /**
   * Detiene la escucha automática de notificaciones.
   */
  stop(): void {
    if (this.unsubscribeListener) {
      this.unsubscribeListener();
      this.unsubscribeListener = undefined;
    }
  }

  /**
   * Procesa una notificación individual recibida.
   */
  async processIncomingNotification(
    notification: AndroidNotificationInput,
  ): Promise<IngestionResult> {
    const rawContent = notification.bigText || notification.text || notification.title || '';

    // Paso 1: Filtro de privacidad y relevancia financiera
    const isFinancial = FinancialAppWhitelist.isFinancialNotification(
      notification.packageName,
      rawContent,
    );

    if (!isFinancial) {
      return {
        captured: false,
        reason: 'Descartada: No proviene de una app o contenido financiero reconocido.',
      };
    }

    // Paso 2: Validación estructural del adaptador
    const validation = this.adapter.validate(notification);
    if (!validation.isValid) {
      return {
        captured: false,
        reason: validation.reason || 'Notificación con estructura inválida.',
      };
    }

    // Paso 3: Adaptación a DTO canónico de RawEvent
    const rawEventDTO = await this.adapter.adapt(notification);

    // Paso 4: Persistencia en la capa de Raw Events (sin tocar transactions)
    const { event, isNew } = await this.rawEventService.capture(rawEventDTO);

    // Notificar a escuchas registrados en la UI
    for (const callback of this.onCapturedCallbacks) {
      try {
        callback(event, isNew);
      } catch (err) {
        console.error('[NotificationIngestionService] Error en callback:', err);
      }
    }

    return {
      captured: true,
      rawEvent: event,
      isNew,
    };
  }

  /**
   * Registra un callback que se dispara cuando un nuevo raw event es capturado.
   */
  onEventCaptured(callback: (event: RawEvent, isNew: boolean) => void): () => void {
    this.onCapturedCallbacks.add(callback);
    return () => {
      this.onCapturedCallbacks.delete(callback);
    };
  }

  /**
   * Comprueba si el listener nativo está activo.
   */
  isActive(): boolean {
    return Boolean(this.unsubscribeListener);
  }
}
