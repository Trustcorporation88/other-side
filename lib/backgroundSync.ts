import { Platform } from 'react-native';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { isNativeAvailable } from '@otherside/notification-capture';

import { syncNow } from './driveBackup';
import { configureGoogleDrive, isDriveConnected } from './googleDrive';

export const DRIVE_SYNC_TASK = 'otherside-drive-sync';

// Quantos itens tentar por acordada em background (cabe na janela curta do Android; retoma depois).
const BACKGROUND_BATCH = 12;

// Definida no escopo global para o Android registrar a tarefa headless.
// Evitamos rodar isto no render estático da web (CI faz `expo export --platform web`).
if (Platform.OS !== 'web') {
  TaskManager.defineTask(DRIVE_SYNC_TASK, async () => {
    try {
      configureGoogleDrive();
      if (!isDriveConnected()) return BackgroundTask.BackgroundTaskResult.Success;
      await syncNow(undefined, BACKGROUND_BATCH);
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (_error) {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

/** Liga o envio periódico em background (melhor-esforço; o Android decide quando roda). */
export async function registerDriveSync(): Promise<void> {
  if (!isNativeAvailable || Platform.OS === 'web') return;
  try {
    await BackgroundTask.registerTaskAsync(DRIVE_SYNC_TASK, { minimumInterval: 15 });
  } catch (_error) {
    // best effort
  }
}

export async function unregisterDriveSync(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await BackgroundTask.unregisterTaskAsync(DRIVE_SYNC_TASK);
  } catch (_error) {
    // best effort
  }
}
