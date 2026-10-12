import { AppState } from 'react-native';
import { useCallback, useEffect, useState } from 'react';

import {
  addAudioPreservedListener,
  clearPreservedAudios,
  deletePreservedAudio,
  getPreservedAudios,
  hasAllFilesAccess,
  isAudioPreservationSupported,
  isNativeAvailable,
  requestAllFilesAccess,
  startAudioPreservation,
  type PreservedAudio,
} from '@otherside/notification-capture';

export function usePreservedAudio() {
  const [audios, setAudios] = useState<PreservedAudio[]>([]);
  const [hasAccess, setHasAccess] = useState(false);
  const supported = isNativeAvailable && isAudioPreservationSupported();

  const refresh = useCallback(() => {
    if (!isNativeAvailable) {
      setAudios([]);
      setHasAccess(false);
      return;
    }

    const granted = hasAllFilesAccess();
    setHasAccess(granted);
    setAudios(granted ? getPreservedAudios() : []);
  }, []);

  const requestAccess = useCallback(() => {
    requestAllFilesAccess();
  }, []);

  const removeAudio = useCallback((id: string) => {
    deletePreservedAudio(id);
    setAudios((current) => current.filter((audio) => audio.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    clearPreservedAudios();
    setAudios([]);
  }, []);

  useEffect(() => {
    if (isNativeAvailable) startAudioPreservation();
    refresh();

    const audioSubscription = addAudioPreservedListener(refresh);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (isNativeAvailable) startAudioPreservation();
        refresh();
      }
    });

    return () => {
      audioSubscription.remove();
      appStateSubscription.remove();
    };
  }, [refresh]);

  return {
    audios,
    supported,
    hasAccess,
    nativeAvailable: isNativeAvailable,
    refresh,
    requestAccess,
    removeAudio,
    clearAll,
  };
}
