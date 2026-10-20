import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  hasGalleryAccess,
  isNativeAvailable,
  requestGalleryAccess,
  startGalleryWatch,
  stopGalleryWatch,
} from '@otherside/notification-capture';
import {
  configureGoogleDrive,
  connectDrive,
  connectedEmail,
  disconnectDrive,
  isDriveConnected,
} from '@/lib/googleDrive';
import {
  backfillGallery,
  pendingCount,
  syncNow,
  uploadedCount,
  type GallerySkipReason,
} from '@/lib/driveBackup';
import { readBackupSettings, writeBackupSettings, type BackupSettings } from '@/lib/backupSettings';
import { registerDriveSync, unregisterDriveSync } from '@/lib/backgroundSync';

export function useDriveBackup() {
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(0);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [settings, setSettings] = useState<BackupSettings>(() => readBackupSettings());
  const [galleryAccess, setGalleryAccess] = useState(false);
  const [gallerySkipped, setGallerySkipped] = useState<GallerySkipReason>(null);
  const syncingRef = useRef(false);

  const refresh = useCallback(() => {
    if (!isNativeAvailable) return;
    const isConnected = isDriveConnected();
    setConnected(isConnected);
    setEmail(isConnected ? connectedEmail() : null);
    setUploaded(uploadedCount());
    setPending(pendingCount());
    setGalleryAccess(hasGalleryAccess());
    setSettings(readBackupSettings());
  }, []);

  const applySettings = useCallback(
    (next: BackupSettings) => {
      writeBackupSettings(next);
      setSettings(next);
      if (next.galleryEnabled && isDriveConnected()) startGalleryWatch();
      else stopGalleryWatch();
    },
    [],
  );

  const sync = useCallback(async () => {
    if (!isNativeAvailable || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const result = await syncNow((done, total) => setProgress({ done, total }));
      setGallerySkipped(result.gallerySkipped);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      setProgress(null);
      refresh();
    }
  }, [refresh]);

  const backfill = useCallback(async () => {
    if (!isNativeAvailable || syncingRef.current) return null;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const result = await backfillGallery((done, total) => setProgress({ done, total }));
      setGallerySkipped(result.gallerySkipped);
      return result;
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      setProgress(null);
      refresh();
    }
  }, [refresh]);

  const requestGalleryPermission = useCallback(async () => {
    const granted = await requestGalleryAccess();
    setGalleryAccess(granted);
    if (granted && readBackupSettings().galleryEnabled) startGalleryWatch();
    return granted;
  }, []);

  const connect = useCallback(async (): Promise<boolean> => {
    if (!isNativeAvailable) return false;
    setBusy(true);
    try {
      const ok = await connectDrive();
      refresh();
      if (ok) {
        void registerDriveSync();
        if (readBackupSettings().galleryEnabled) startGalleryWatch();
        await sync();
      }
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
      stopGalleryWatch();
      await disconnectDrive();
      void unregisterDriveSync();
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
      void registerDriveSync();
      if (readBackupSettings().galleryEnabled) startGalleryWatch();
      void sync();
    }

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refresh();
        if (isDriveConnected()) void sync();
      }
    });
    return () => subscription.remove();
  }, [refresh, sync]);

  return {
    available: isNativeAvailable,
    connected,
    email,
    uploaded,
    pending,
    syncing,
    progress,
    busy,
    settings,
    galleryAccess,
    gallerySkipped,
    connect,
    disconnect,
    sync,
    backfill,
    requestGalleryPermission,
    setGalleryEnabled: (enabled: boolean) => applySettings({ ...readBackupSettings(), galleryEnabled: enabled }),
    setIncludeWhatsAppImages: (enabled: boolean) =>
      applySettings({ ...readBackupSettings(), includeWhatsAppImages: enabled }),
    setWifiOnly: (enabled: boolean) => applySettings({ ...readBackupSettings(), wifiOnly: enabled }),
    setRequireCharging: (enabled: boolean) =>
      applySettings({ ...readBackupSettings(), requireCharging: enabled }),
    setOffloadCamera: (enabled: boolean) =>
      applySettings({ ...readBackupSettings(), offloadCameraEnabled: enabled }),
  };
}
