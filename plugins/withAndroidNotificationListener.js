const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin para Android NotificationListenerService (US-020).
 *
 * Configura automáticamente el AndroidManifest.xml para declarar el servicio
 * con el permiso `android.permission.BIND_NOTIFICATION_LISTENER_SERVICE`
 * respetando el flujo de Continuous Native Generation (CNG) de Expo.
 */
function withAndroidNotificationListener(config) {
  // 1. Modificar AndroidManifest.xml
  config = withAndroidManifest(config, async (config) => {
    const mainApplication = config.modResults.manifest.application[0];

    if (!mainApplication.service) {
      mainApplication.service = [];
    }

    const serviceName = '.FinVoltNotificationListenerService';
    const existingService = mainApplication.service.find(
      (s) => s.$ && s.$['android:name'] === serviceName,
    );

    if (!existingService) {
      mainApplication.service.push({
        $: {
          'android:name': serviceName,
          'android:label': 'FinVolt Notification Listener',
          'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name': 'android.service.notification.NotificationListenerService',
                },
              },
            ],
          },
        ],
      });
    }

    return config;
  });

  // 2. Generar el archivo Kotlin del servicio en android/app/src/main/java
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const androidAppDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', 'com', 'finvolt', 'app');

      if (!fs.existsSync(androidAppDir)) {
        return config; // Si aún no se ha generado android/, CNG lo creará en prebuild
      }

      const serviceCode = `package com.finvolt.app

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.content.Intent
import android.os.Bundle
import android.util.Log

/**
 * FinVoltNotificationListenerService (US-020)
 *
 * Captura notificaciones push del sistema Android generadas por aplicaciones financieras.
 * Emite los eventos crudos hacia el módulo React Native de FinVolt sin requerir root.
 */
class FinVoltNotificationListenerService : NotificationListenerService() {
    companion object {
        private const val TAG = "FinVoltNotifService"
        const val NOTIFICATION_EVENT_ACTION = "com.finvolt.app.NOTIFICATION_POSTED"
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return

        try {
            val packageName = sbn.packageName ?: return
            val postTime = sbn.postTime
            val key = sbn.key
            val extras = sbn.notification?.extras ?: Bundle()

            val title = extras.getCharSequence("android.title")?.toString() ?: ""
            val text = extras.getCharSequence("android.text")?.toString() ?: ""
            val bigText = extras.getCharSequence("android.bigText")?.toString() ?: ""
            val subText = extras.getCharSequence("android.subText")?.toString() ?: ""

            // Difundir evento local para consumo en React Native
            val intent = Intent(NOTIFICATION_EVENT_ACTION).apply {
                putExtra("packageName", packageName)
                putExtra("title", title)
                putExtra("text", text)
                putExtra("bigText", bigText)
                putExtra("subText", subText)
                putExtra("postTime", postTime)
                putExtra("key", key)
                setPackage(applicationContext.packageName)
            }
            sendBroadcast(intent)
            Log.d(TAG, "Notificación capturada de: $packageName")
        } catch (e: Exception) {
            Log.e(TAG, "Error procesando notificación", e)
        }
    }
}
`;

      const targetPath = path.join(androidAppDir, 'FinVoltNotificationListenerService.kt');
      fs.writeFileSync(targetPath, serviceCode, 'utf8');
      return config;
    },
  ]);

  return config;
}

module.exports = withAndroidNotificationListener;
