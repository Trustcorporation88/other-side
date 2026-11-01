import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import {
  addGalleryChangedListener,
  addWhatsAppVideoReadyListener,
  isNativeAvailable,
  isOnWifi,
  startAudioPreservation,
  startGalleryWatch,
} from '@otherside/notification-capture';

import { readBackupSettings } from '@/lib/backupSettings';
import { registerDriveSync } from '@/lib/backgroundSync';
import { syncNow } from '@/lib/driveBackup';
import { configureGoogleDrive, isDriveConnected } from '@/lib/googleDrive';

/**
 * Mantém o backup vivo fora da tela de Ajustes.
 * Foto nova dispara um lote da galeria; vídeo do WhatsApp dispara um lote direto ao Drive.
 */
export function DriveBackupRuntime() {
  useEffect(() => {
    if (!isNativeAvailable || Platform.OS === 'web') return;
    configureGoogleDrive();

    const boot = () => {
      if (!isDriveConnected()) return;
      void registerDriveSync();
      startAudioPreservation();
      if (readBackupSettings().galleryEnabled) startGalleryWatch();
      void syncNow();
    };
    boot();

    const gallery = addGalleryChangedListener(() => {
      if (!isDriveConnected() || !readBackupSettings().galleryEnabled) return;
      void syncNow(undefined, 6, { focus: 'gallery', galleryLimit: 6 });
    });
    const videos = addWhatsAppVideoReadyListener(() => {
      if (!isDriveConnected()) return;
      if (readBackupSettings().wifiOnly && !isOnWifi()) return;
      void syncNow(undefined, 4, { focus: 'whatsapp-video' });
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') boot();
    });

    return () => {
      gallery.remove();
      videos.remove();
      appState.remove();
    };
  }, []);

  return null;
}
