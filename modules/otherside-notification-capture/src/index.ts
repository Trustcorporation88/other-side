import { EventEmitter, requireOptionalNativeModule } from 'expo-modules-core';

export type CapturedNotification = {
  id: string;
  conversation: string;
  sender: string;
  message: string;
  receivedAt: number;
  packageName: string;
  isDemo: boolean;
};

type NativeEvents = {
  onNotificationCaptured: (event: CapturedNotification) => void;
};

type NativeModule = {
  isListenerEnabled: () => boolean;
  openNotificationSettings: () => void;
  getCapturedNotifications: () => CapturedNotification[];
  deleteCapturedNotification: (id: string) => void;
  clearCapturedNotifications: () => void;
};

const nativeModule = requireOptionalNativeModule<NativeModule>('OtherSideNotificationCapture');
const emitter = nativeModule ? new EventEmitter<NativeEvents>(nativeModule as never) : null;

export const isNativeAvailable = nativeModule !== null;

export function isListenerEnabled(): boolean {
  return nativeModule?.isListenerEnabled() ?? false;
}

export function openNotificationSettings(): void {
  nativeModule?.openNotificationSettings();
}

export function getCapturedNotifications(): CapturedNotification[] {
  return nativeModule?.getCapturedNotifications() ?? [];
}

export function deleteCapturedNotification(id: string): void {
  nativeModule?.deleteCapturedNotification(id);
}

export function clearCapturedNotifications(): void {
  nativeModule?.clearCapturedNotifications();
}

export function addNotificationListener(
  listener: (notification: CapturedNotification) => void
) {
  return emitter?.addListener('onNotificationCaptured', listener) ?? { remove: () => undefined };
}
