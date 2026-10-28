import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { readUploadRecord } from '@/lib/driveBackup';
import { getAccessToken, listAppFiles } from '@/lib/googleDrive';
import {
  materializeRecentDocuments,
  readRecentDocuments,
  type RecentDocument,
} from '@/lib/recentDocuments';

export function useRecentDocuments() {
  const [documents, setDocuments] = useState<RecentDocument[]>(() => readRecentDocuments());
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setDocuments(readRecentDocuments());
    setRefreshing(true);
    try {
      const token = await getAccessToken();
      const remote = token ? (await listAppFiles(token)).files : [];
      const next = await materializeRecentDocuments({
        token,
        remote,
        record: readUploadRecord(),
      });
      setDocuments(next);
    } catch (_error) {
      setDocuments(readRecentDocuments());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  return { documents, refreshing, refresh };
}
