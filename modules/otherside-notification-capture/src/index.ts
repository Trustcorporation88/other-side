import { requireOptionalNativeModule } from 'expo-modules-core';

export type CapturedNotification = {
  id: string;
  conversation: string;
  sender: string;
  message: string;
  receivedAt: number;
  packageName: string;
  isDemo: boolean;
  audioStatus: 'not_applicable' | 'not_provided' | 'not_accessible' | 'accessible';
};

export type PreservedAudio = {
  id: string;
  fileName: string;
  localPath: string;
  uri: string;
  sizeBytes: number;
  sourcePackage: string;
  origin: 'received' | 'sent' | 'unknown';
  originalModifiedAt: number;
  preservedAt: number;
  kind: 'audio' | 'image';
};

type NativeEvents = {
  onNotificationCaptured: (event: CapturedNotification) => void;
  onAudioPreserved: (event: PreservedAudio) => void;
};

type NativeModule = {
  addListener: <EventName extends keyof NativeEvents>(
    eventName: EventName,
    listener: NativeEvents[EventName]
  ) => { remove: () => void };
  isListenerEnabled: () => boolean;
  openNotificationSettings: () => void;
  getCapturedNotifications: () => CapturedNotification[];
  deleteCapturedNotification: (id: string) => void;
  clearCapturedNotifications: () => void;
  isAudioPreservationSupported: () => boolean;
  hasAllFilesAccess: () => boolean;
  requestAllFilesAccess: () => void;
  startAudioPreservation: () => void;
  getPreservedAudios: () => PreservedAudio[];
  getPreservedAudioUri: (id: string) => string | null;
  deletePreservedAudio: (id: string) => void;
  clearPreservedAudios: () => void;
};

const nativeModule = (() => {
  try {
    return requireOptionalNativeModule<NativeModule>('OtherSideNotificationCapture');
  } catch (_error) {
    return null;
  }
})();

export const isNativeAvailable = nativeModule !== null;

export function isListenerEnabled(): boolean {
  try {
    return nativeModule?.isListenerEnabled() ?? false;
  } catch (_error) {
    return false;
  }
}

export function openNotificationSettings(): void {
  try {
    nativeModule?.openNotificationSettings();
  } catch (_error) {
    // A missing native activity must not block the application shell.
  }
}

export function getCapturedNotifications(): CapturedNotification[] {
  try {
    return nativeModule?.getCapturedNotifications() ?? [];
  } catch (_error) {
    return [];
  }
}

export function deleteCapturedNotification(id: string): void {
  try {
    nativeModule?.deleteCapturedNotification(id);
  } catch (_error) {
    // Deletion is best effort and never blocks the application shell.
  }
}

export function clearCapturedNotifications(): void {
  try {
    nativeModule?.clearCapturedNotifications();
  } catch (_error) {
    // Clearing is best effort and never blocks the application shell.
  }
}

export function addNotificationListener(
  listener: (notification: CapturedNotification) => void
) {
  try {
    return nativeModule?.addListener('onNotificationCaptured', listener) ?? { remove: () => undefined };
  } catch (_error) {
    return { remove: () => undefined };
  }
}

export function isAudioPreservationSupported(): boolean {
  try {
    return nativeModule?.isAudioPreservationSupported() ?? false;
  } catch (_error) {
    return false;
  }
}

export function hasAllFilesAccess(): boolean {
  try {
    return nativeModule?.hasAllFilesAccess() ?? false;
  } catch (_error) {
    return false;
  }
}

export function requestAllFilesAccess(): void {
  try {
    nativeModule?.requestAllFilesAccess();
  } catch (_error) {
    // Opening the system settings screen is best effort.
  }
}

export function startAudioPreservation(): void {
  try {
    nativeModule?.startAudioPreservation();
  } catch (_error) {
    // Starting the observer is best effort and never blocks the application shell.
  }
}

export function getPreservedAudios(): PreservedAudio[] {
  try {
    return nativeModule?.getPreservedAudios() ?? [];
  } catch (_error) {
    return [];
  }
}

export function getPreservedAudioUri(id: string): string | null {
  try {
    return nativeModule?.getPreservedAudioUri(id) ?? null;
  } catch (_error) {
    return null;
  }
}

export function deletePreservedAudio(id: string): void {
  try {
    nativeModule?.deletePreservedAudio(id);
  } catch (_error) {
    // Deletion is best effort and never blocks the application shell.
  }
}

export function clearPreservedAudios(): void {
  try {
    nativeModule?.clearPreservedAudios();
  } catch (_error) {
    // Clearing is best effort and never blocks the application shell.
  }
}

export function addAudioPreservedListener(listener: (audio: PreservedAudio) => void) {
  try {
    return nativeModule?.addListener('onAudioPreserved', listener) ?? { remove: () => undefined };
  } catch (_error) {
    return { remove: () => undefined };
  }
}
