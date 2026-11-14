import { Directory, File, Paths } from 'expo-file-system';

import { type PreservedAudio } from '@otherside/notification-capture';

import { driveFileIdFor } from './driveBackup';
import { getAccessToken } from './googleDrive';
import { isCompleteCopy, singleFlight } from './mediaCache';

function cacheDir(): Directory {
  const dir = new Directory(Paths.cache, 'otherside-media');
  try {
    dir.create({ intermediates: true, idempotent: true });
  } catch {
    // já existe
  }
  return dir;
}

function extensionOf(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || 'bin';
}

function cachedFileFor(item: PreservedAudio): File {
  return new File(cacheDir(), `${item.id}.${extensionOf(item.fileName)}`);
}

function deleteQuietly(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch {
    // best effort
  }
}

/**
 * Uri local reproduzível/visível para o item, sempre dentro do app:
 * 1. se o arquivo cheio ainda está no celular, usa ele;
 * 2. senão, usa o cache de um download anterior, se estiver inteiro;
 * 3. senão, baixa do Drive sob demanda e guarda no cache.
 * Devolve null se não há cópia local nem no Drive (ou sem conexão).
 */
export async function resolveMediaUri(item: PreservedAudio): Promise<string | null> {
  try {
    const local = new File(item.uri);
    if (local.exists && isCompleteCopy(local.size, 0)) return item.uri;
  } catch {
    // segue para o cache/Drive
  }

  return singleFlight(`media:${item.id}`, () => fromCacheOrDrive(item));
}

async function fromCacheOrDrive(item: PreservedAudio): Promise<string | null> {
  const cached = cachedFileFor(item);
  try {
    if (cached.exists) {
      if (isCompleteCopy(cached.size, item.sizeBytes)) return cached.uri;
      cached.delete();
    }
  } catch {
    // segue para o download
  }

  const driveId = driveFileIdFor(item.id, item.fileName, item.sizeBytes);
  if (!driveId) return null;
  const token = await getAccessToken();
  if (!token) return null;

  // Baixa num arquivo temporário: o nome final só existe quando a cópia está inteira.
  const partial = new File(cacheDir(), `${item.id}.${extensionOf(item.fileName)}.part`);
  try {
    deleteQuietly(partial);
    const task = File.createDownloadTask(
      `https://www.googleapis.com/drive/v3/files/${driveId}?alt=media`,
      partial,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    await task.downloadAsync();
    if (!partial.exists || !isCompleteCopy(partial.size, item.sizeBytes)) {
      deleteQuietly(partial);
      return null;
    }
    deleteQuietly(cached);
    await partial.move(cached);
    return cached.exists ? cached.uri : null;
  } catch {
    deleteQuietly(partial);
    return null;
  }
}

/** Apaga a cópia do cache que não abriu, para a próxima tentativa baixar de novo do Drive. */
export function discardCachedCopy(item: PreservedAudio): void {
  deleteQuietly(cachedFileFor(item));
}
