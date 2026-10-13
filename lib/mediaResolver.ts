import { Directory, File, Paths } from 'expo-file-system';

import { type PreservedAudio } from '@otherside/notification-capture';

import { driveFileIdFor } from './driveBackup';
import { getAccessToken } from './googleDrive';

function cacheDir(): Directory {
  const dir = new Directory(Paths.cache, 'otherside-media');
  try {
    dir.create({ intermediates: true, idempotent: true });
  } catch (_error) {
    // já existe
  }
  return dir;
}

function extensionOf(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || 'bin';
}

/**
 * Uri local reproduzível/visível para o item, sempre dentro do app:
 * 1. se o arquivo cheio ainda está no celular, usa ele;
 * 2. senão, usa o cache de um download anterior;
 * 3. senão, baixa do Drive sob demanda e guarda no cache.
 * Devolve null se não há cópia local nem no Drive (ou sem conexão).
 */
export async function resolveMediaUri(item: PreservedAudio): Promise<string | null> {
  try {
    const local = new File(item.uri);
    if (local.exists) return item.uri;
  } catch (_error) {
    // segue para o cache/Drive
  }

  const cached = new File(cacheDir(), `${item.id}.${extensionOf(item.fileName)}`);
  try {
    if (cached.exists) return cached.uri;
  } catch (_error) {
    // segue para o download
  }

  const driveId = driveFileIdFor(item.id);
  if (!driveId) return null;
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const task = File.createDownloadTask(
      `https://www.googleapis.com/drive/v3/files/${driveId}?alt=media`,
      cached,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    await task.downloadAsync();
    return cached.exists ? cached.uri : null;
  } catch (_error) {
    return null;
  }
}
