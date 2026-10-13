import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { isNativeAvailable } from '@otherside/notification-capture';
import {
  configureGoogleDrive,
  connectDrive,
  connectedEmail,
  disconnectDrive,
  isDriveConnected,
} from '@/lib/googleDrive';
import { pendingCount, syncNow, uploadedCount } from '@/lib/driveBackup';

export function useDriveBackup() {
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(0);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (!isNativeAvailable) return;
    const isConnected = isDriveConnected();
    setConnected(isConnected);
    setEmail(isConnected ? connectedEmail() : null);
    setUploaded(uploadedCount());
    setPending(pendingCount());
  }, []);

  const sync = useCallback(async () => {
    if (!isNativeAvailable) return;
    setSyncing(true);
    try {
      await syncNow();
    } finally {
      setSyncing(false);
      refresh();
    }
  }, [refresh]);

  const connect = useCallback(async (): Promise<boolean> => {
    if (!isNativeAvailable) return false;
    setBusy(true);
    try {
      const ok = await connectDrive();
      refresh();
      if (ok) await sync();
      return ok;
    } catch (_error) {
      return false;
    } finally {
      setBusy(false);
    }
  }, [refresh, sync]);

  const disconnect = useCallback(async () => {
    if (!isNativeAvailable) return;
    setBusy(true);
    try {
      await disconnectDrive();
    } finally {
      setBusy(false);
      refresh();
    }
  }, [refresh]);

  useEffect(() => {
    if (!isNativeAvailable) return;
    configureGoogleDrive();
    refresh();
    if (isDriveConnected()) {
      void syncNow().finally(refresh);
    }

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refresh();
        if (isDriveConnected()) void syncNow().finally(refresh);
      }
    });
    return () => subscription.remove();
  }, [refresh]);

  return {
    available: isNativeAvailable,
    connected,
    email,
    uploaded,
    pending,
    syncing,
    busy,
    connect,
    disconnect,
    sync,
  };
}
