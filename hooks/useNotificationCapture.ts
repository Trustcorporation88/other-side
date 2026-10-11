import { AppState } from 'react-native';
import { useCallback, useEffect, useState } from 'react';

import {
  addNotificationListener,
  getCapturedNotifications,
  isListenerEnabled,
  isNativeAvailable,
  type CapturedNotification,
} from '@otherside/notification-capture';

export function useNotificationCapture() {
  const [notifications, setNotifications] = useState<CapturedNotification[]>([]);
  const [listenerEnabled, setListenerEnabled] = useState(false);

  const refresh = useCallback(() => {
    if (!isNativeAvailable) {
      setNotifications([]);
      setListenerEnabled(false);
      return;
    }

    setNotifications(getCapturedNotifications());
    setListenerEnabled(isListenerEnabled());
  }, []);

  useEffect(() => {
    refresh();
    const eventSubscription = addNotificationListener(refresh);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });

    return () => {
      eventSubscription.remove();
      appStateSubscription.remove();
    };
  }, [refresh]);

  return {
    notifications,
    listenerEnabled,
    nativeAvailable: isNativeAvailable,
    refresh,
  };
}
