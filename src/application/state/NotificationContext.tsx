import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { AndroidNotificationListenerModule } from '../../infrastructure/native/AndroidNotificationListenerModule';
import { NotificationIngestionPipeline, type PipelineExecutionResult } from '../services/NotificationIngestionPipeline';
import { RawEventService } from '../../domain/services/RawEventService';
import { SupabaseRawEventRepository } from '../../infrastructure/database/SupabaseRawEventRepository';
import { InMemoryTransactionCandidateRepository } from '../../infrastructure/database/InMemoryTransactionCandidateRepository';
import type { RawEvent } from '../../domain/models/RawEvent';
import type { TransactionCandidate } from '../../domain/models/TransactionCandidate';

interface NotificationContextValue {
  isSupported: boolean;
  isPermissionGranted: boolean;
  isListening: boolean;
  lastCapturedEvent: RawEvent | null;
  lastCandidate: TransactionCandidate | null;
  candidates: TransactionCandidate[];
  checkPermission: () => Promise<boolean>;
  requestPermission: () => Promise<void>;
  simulateNotification: (sample?: { title?: string; text?: string; packageName?: string }) => Promise<PipelineExecutionResult>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isSupported = Platform.OS === 'android';
  const [isPermissionGranted, setIsPermissionGranted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [lastCapturedEvent, setLastCapturedEvent] = useState<RawEvent | null>(null);
  const [lastCandidate, setLastCandidate] = useState<TransactionCandidate | null>(null);
  const [candidates, setCandidates] = useState<TransactionCandidate[]>([]);

  const candidateRepository = useMemo(() => new InMemoryTransactionCandidateRepository(), []);

  const rawEventService = useMemo(() => {
    const repository = new SupabaseRawEventRepository();
    return new RawEventService(repository);
  }, []);

  const pipeline = useMemo(() => {
    return new NotificationIngestionPipeline(rawEventService, candidateRepository);
  }, [rawEventService, candidateRepository]);

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
  }): Promise<PipelineExecutionResult> => {
    const simulated = AndroidNotificationListenerModule.simulate(sample);
    const result = await pipeline.processNotification(simulated);
    setLastCapturedEvent(result.rawEvent);
    if (result.candidate) {
      setLastCandidate(result.candidate);
      setCandidates((prev) => [result.candidate!, ...prev.filter((c) => c.id !== result.candidate!.id)]);
    }
    return result;
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

    const unsubscribeNative = AndroidNotificationListenerModule.addListener(async (notif) => {
      try {
        const result = await pipeline.processNotification(notif);
        if (isMounted) {
          setLastCapturedEvent(result.rawEvent);
          if (result.candidate) {
            setLastCandidate(result.candidate);
            setCandidates((prev) => [result.candidate!, ...prev.filter((c) => c.id !== result.candidate!.id)]);
          }
        }
      } catch (err) {
        console.error('[NotificationContext] Error procesando notificación nativa:', err);
      }
    });

    const unsubscribePipeline = pipeline.onCandidateGenerated((candidate) => {
      if (isMounted) {
        setLastCandidate(candidate);
        setCandidates((prev) => [candidate, ...prev.filter((c) => c.id !== candidate.id)]);
      }
    });

    return () => {
      isMounted = false;
      unsubscribeNative();
      unsubscribePipeline();
      setIsListening(false);
    };
  }, [pipeline, isSupported]);

  return (
    <NotificationContext.Provider
      value={{
        isSupported,
        isPermissionGranted,
        isListening,
        lastCapturedEvent,
        lastCandidate,
        candidates,
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
