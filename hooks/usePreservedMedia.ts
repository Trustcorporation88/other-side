import { AppState } from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  addAudioPreservedListener,
  deletePreservedAudio,
  getPreservedAudios,
  hasAllFilesAccess,
  isAudioPreservationSupported,
  isNativeAvailable,
  requestAllFilesAccess,
  startAudioPreservation,
  type PreservedAudio,
} from '@otherside/notification-capture';

type MediaKind = 'audio' | 'image';

export function usePreservedMedia(kind: MediaKind) {
  const [allItems, setAllItems] = useState<PreservedAudio[]>([]);
  const [hasAccess, setHasAccess] = useState(false);
  const supported = isNativeAvailable && isAudioPreservationSupported();

  const refresh = useCallback(() => {
    if (!isNativeAvailable) {
      setAllItems([]);
      setHasAccess(false);
      return;
    }
    const granted = hasAllFilesAccess();
    setHasAccess(granted);
    setAllItems(granted ? getPreservedAudios() : []);
  }, []);

  const items = useMemo(() => allItems.filter((item) => item.kind === kind), [allItems, kind]);

  const requestAccess = useCallback(() => {
    requestAllFilesAccess();
  }, []);

  const remove = useCallback((id: string) => {
    deletePreservedAudio(id);
    setAllItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    const toDelete = allItems.filter((item) => item.kind === kind);
    toDelete.forEach((item) => deletePreservedAudio(item.id));
    setAllItems((current) => current.filter((item) => item.kind !== kind));
  }, [allItems, kind]);

  useEffect(() => {
    if (isNativeAvailable) startAudioPreservation();
    refresh();

    const mediaSubscription = addAudioPreservedListener(refresh);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (isNativeAvailable) startAudioPreservation();
        refresh();
      }
    });

    return () => {
      mediaSubscription.remove();
      appStateSubscription.remove();
    };
  }, [refresh]);

  return {
    items,
    supported,
    hasAccess,
    nativeAvailable: isNativeAvailable,
    refresh,
    requestAccess,
    remove,
    clearAll,
  };
}
