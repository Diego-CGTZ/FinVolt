import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { AndroidNotificationListenerModule } from '../../infrastructure/native/AndroidNotificationListenerModule';
import { NotificationIngestionService } from '../services/NotificationIngestionService';
import { RawEventService } from '../../domain/services/RawEventService';
import { SupabaseRawEventRepository } from '../../infrastructure/database/SupabaseRawEventRepository';
import type { RawEvent } from '../../domain/models/RawEvent';

interface NotificationContextValue {
  isSupported: boolean;
  isPermissionGranted: boolean;
  isListening: boolean;
  lastCapturedEvent: RawEvent | null;
  checkPermission: () => Promise<boolean>;
  requestPermission: () => Promise<void>;
  simulateNotification: (sample?: { title?: string; text?: string; packageName?: string }) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isSupported = Platform.OS === 'android';
  const [isPermissionGranted, setIsPermissionGranted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [lastCapturedEvent, setLastCapturedEvent] = useState<RawEvent | null>(null);

  const rawEventService = useMemo(() => {
    const repository = new SupabaseRawEventRepository();
    return new RawEventService(repository);
  }, []);

  const ingestionService = useMemo(() => {
    return new NotificationIngestionService(rawEventService);
  }, [rawEventService]);

  const checkPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    const granted = await AndroidNotificationListenerModule.isPermissionGranted();
    setIsPermissionGranted(granted);
    return granted;
  }, [isSupported]);

  const requestPermission = async (): Promise<void> => {
    if (!isSupported) return;
    await AndroidNotificationListenerModule.requestPermission();
    setIsPermissionGranted(true);
  };

  const simulateNotification = async (sample?: {
    title?: string;
    text?: string;
    packageName?: string;
  }): Promise<void> => {
    const simulated = AndroidNotificationListenerModule.simulate(sample);
    await ingestionService.processIncomingNotification(simulated);
  };

  useEffect(() => {
    if (!isSupported) return;

    let isMounted = true;

    void AndroidNotificationListenerModule.isPermissionGranted().then((granted) => {
      if (isMounted) {
        setIsPermissionGranted(granted);
        setIsListening(true);
      }
    });

    ingestionService.start();

    const unsubscribe = ingestionService.onEventCaptured((event) => {
      if (isMounted) {
        setLastCapturedEvent(event);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
      ingestionService.stop();
      setIsListening(false);
    };
  }, [ingestionService, isSupported]);

  return (
    <NotificationContext.Provider
      value={{
        isSupported,
        isPermissionGranted,
        isListening,
        lastCapturedEvent,
        checkPermission,
        requestPermission,
        simulateNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotificationIngestion = (): NotificationContextValue => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotificationIngestion must be used within a NotificationProvider');
  }
  return context;
};
