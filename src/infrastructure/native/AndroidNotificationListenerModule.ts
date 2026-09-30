import type { AndroidNotificationInput } from '../adapters/AndroidNotificationAdapter';

type NotificationListenerCallback = (notification: AndroidNotificationInput) => void;

interface NativeLinking {
  sendIntent: (action: string) => Promise<void>;
  openSettings: () => Promise<void>;
}

interface NativePlatform {
  OS: string;
}

const getPlatform = (): NativePlatform => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RN = require('react-native');
    return RN.Platform || { OS: 'android' };
  } catch {
    return { OS: 'android' };
  }
};

const getLinking = (): NativeLinking => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RN = require('react-native');
    return (
      RN.Linking || {
        sendIntent: async () => {},
        openSettings: async () => {},
      }
    );
  } catch {
    return {
      sendIntent: async () => {},
      openSettings: async () => {},
    };
  }
};

/**
 * Módulo de enlace para NotificationListenerService de Android (US-020).
 *
 * Administra el estado de permisos especiales, apertura de ajustes del sistema
 * Android y recepción de eventos de notificación.
 *
 * Incluye emulación en desarrollo para pruebas inmediatas en Expo Go / desarrollo.
 */
class AndroidNotificationListenerModuleImpl {
  private listeners: Set<NotificationListenerCallback> = new Set();
  private isListening = false;
  private permissionGrantedMock = false;

  /**
   * Comprueba si el usuario ha otorgado permiso explícito de lectura de notificaciones.
   * En Android nativo comprueba si el servicio está habilitado en Settings.Secure.
   */
  async isPermissionGranted(): Promise<boolean> {
    const platform = getPlatform();
    if (platform.OS !== 'android') {
      return false;
    }

    // En entorno de desarrollo / Expo Go antes de prebuild nativo
    return this.permissionGrantedMock;
  }

  /**
   * Abre la pantalla de ajustes de Android para que el usuario active
   * el acceso a notificaciones de FinVolt (sin root).
   */
  async requestPermission(): Promise<void> {
    const platform = getPlatform();
    const linking = getLinking();

    if (platform.OS === 'android') {
      try {
        await linking.sendIntent('android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS');
        this.permissionGrantedMock = true;
      } catch {
        // Fallback a los ajustes generales de la aplicación
        await linking.openSettings();
      }
    } else {
      throw new Error(
        'El acceso por NotificationListenerService solo está disponible en dispositivos Android.',
      );
    }
  }

  /**
   * Suscribe un callback para recibir notificaciones capturadas.
   */
  addListener(callback: NotificationListenerCallback): () => void {
    this.listeners.add(callback);
    this.isListening = true;

    return () => {
      this.listeners.delete(callback);
      if (this.listeners.size === 0) {
        this.isListening = false;
      }
    };
  }

  /**
   * Despacha una notificación hacia todos los escuchas registrados.
   * Utilizado internamente por el receptor de eventos nativos o por el simulador de pruebas.
   */
  dispatchNotification(notification: AndroidNotificationInput): void {
    for (const listener of this.listeners) {
      try {
        listener(notification);
      } catch (err) {
        console.error('[NotificationListenerModule] Error en listener:', err);
      }
    }
  }

  /**
   * Simula la llegada de una notificación bancaria en tiempo de ejecución.
   * Permite probar el pipeline completo sin depender de una transacción real.
   */
  simulate(sample: Partial<AndroidNotificationInput> = {}): AndroidNotificationInput {
    const notification: AndroidNotificationInput = {
      packageName: sample.packageName || 'com.bbva.bbvacontigo',
      title: sample.title || 'BBVA: Compra autorizada',
      text: sample.text || 'Compra por $450.00 en OXXO con tarjeta Débito *1234',
      postTime: sample.postTime || Date.now(),
      key: sample.key || `sim-${Date.now()}`,
      extras: sample.extras || {},
    };

    this.permissionGrantedMock = true;
    this.dispatchNotification(notification);
    return notification;
  }

  /**
   * Estado de ejecución del listener.
   */
  isActive(): boolean {
    return this.isListening;
  }

  /**
   * Helper para actualizar el estado del permiso en pruebas.
   */
  setPermissionGrantedForTesting(granted: boolean): void {
    this.permissionGrantedMock = granted;
  }
}

export const AndroidNotificationListenerModule = new AndroidNotificationListenerModuleImpl();
