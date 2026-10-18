import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import {
  addGalleryChangedListener,
  isNativeAvailable,
  startGalleryWatch,
} from '@otherside/notification-capture';

import { readBackupSettings } from '@/lib/backupSettings';
import { registerDriveSync } from '@/lib/backgroundSync';
import { syncNow } from '@/lib/driveBackup';
import { configureGoogleDrive, isDriveConnected } from '@/lib/googleDrive';

/**
 * Mantém o backup da galeria vivo fora da tela de Ajustes.
 * Uma foto nova dispara um lote pequeno; o restante segue na tarefa em segundo plano.
 */
export function DriveBackupRuntime() {
  useEffect(() => {
    if (!isNativeAvailable || Platform.OS === 'web') return;
    configureGoogleDrive();

    const boot = () => {
      if (!isDriveConnected() || !readBackupSettings().galleryEnabled) return;
      void registerDriveSync();
      startGalleryWatch();
    };
    boot();

    const gallery = addGalleryChangedListener(() => {
      if (!isDriveConnected() || !readBackupSettings().galleryEnabled) return;
      void syncNow(undefined, 6, { focus: 'gallery', galleryLimit: 6 });
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') boot();
    });

    return () => {
      gallery.remove();
      appState.remove();
    };
  }, []);

  return null;
}
