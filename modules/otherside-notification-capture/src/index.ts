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

type NativeEvents = {
  onNotificationCaptured: (event: CapturedNotification) => void;
};

type NativeModule = {
  addListener: (
    eventName: 'onNotificationCaptured',
    listener: NativeEvents['onNotificationCaptured']
  ) => { remove: () => void };
  isListenerEnabled: () => boolean;
  openNotificationSettings: () => void;
  getCapturedNotifications: () => CapturedNotification[];
  deleteCapturedNotification: (id: string) => void;
  clearCapturedNotifications: () => void;
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
