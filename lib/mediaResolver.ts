import { Directory, File, Paths } from 'expo-file-system';

import { getOriginalMediaUri, type PreservedAudio } from '@otherside/notification-capture';

import { driveIdCandidatesFor } from './driveBackup';
import { getAccessToken } from './googleDrive';
import { classifyDownloadError, isCompleteCopy, singleFlight, type DriveFailure } from './mediaCache';

export type MediaResolution =
  | { uri: string; source: 'local' | 'whatsapp' | 'cache' | 'drive' }
  | { uri: null; reason: DriveFailure; detail: string };

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

function usableLocal(uri: string, expectedSize: number): boolean {
  if (!uri) return false;
  try {
    const file = new File(uri);
    return file.exists && isCompleteCopy(file.size, expectedSize);
  } catch {
    return false;
  }
}

/**
 * Uri local reproduzível/visível para o item, sempre dentro do app:
 * 1. a cópia cheia no OtherSide;
 * 2. o original ainda na pasta do WhatsApp (cópia do OtherSide cortada ou ausente);
 * 3. o cache de um download anterior, se estiver inteiro;
 * 4. o Drive, sob demanda.
 * `skip` traz uris que já falharam ao abrir (arquivo corrompido), para tentar a próxima fonte.
 */
export async function resolveMedia(item: PreservedAudio, skip: readonly string[] = []): Promise<MediaResolution> {
  if (!skip.includes(item.uri) && usableLocal(item.uri, 0)) return { uri: item.uri, source: 'local' };

  const original = getOriginalMediaUri(item.id);
  if (original && !skip.includes(original) && usableLocal(original, item.sizeBytes)) {
    return { uri: original, source: 'whatsapp' };
  }

  return singleFlight(`media:${item.id}:${skip.join('|')}`, () => fromCacheOrDrive(item, skip));
}

/** Atalho para quem só precisa da uri (aba Áudios). */
export async function resolveMediaUri(item: PreservedAudio): Promise<string | null> {
  return (await resolveMedia(item)).uri;
}

const lastDriveIdByItem = new Map<string, string>();

async function fromCacheOrDrive(item: PreservedAudio, skip: readonly string[]): Promise<MediaResolution> {
  const cached = cachedFileFor(item);
  try {
    if (cached.exists) {
      if (!skip.includes(cached.uri) && isCompleteCopy(cached.size, item.sizeBytes)) {
        return { uri: cached.uri, source: 'cache' };
      }
      cached.delete();
    }
  } catch {
    // segue para o download
  }

  const failedIds = skip.filter((entry) => entry.startsWith('drive:')).map((entry) => entry.slice(6));
  const candidates = driveIdCandidatesFor(item.id, item.fileName, item.sizeBytes).filter(
    (driveId) => !failedIds.includes(driveId),
  );
  if (candidates.length === 0) return { uri: null, reason: 'not_uploaded', detail: '' };
  const token = await getAccessToken();
  if (!token) return { uri: null, reason: 'drive_auth', detail: '' };

  let failure: MediaResolution = { uri: null, reason: 'drive_error', detail: '' };
  for (const driveId of candidates) {
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
        failure = { uri: null, reason: 'drive_error', detail: 'arquivo incompleto no Drive' };
        continue;
      }
      deleteQuietly(cached);
      await partial.move(cached);
      if (cached.exists) {
        lastDriveIdByItem.set(item.id, driveId);
        return { uri: cached.uri, source: 'drive' };
      }
    } catch (error) {
      deleteQuietly(partial);
      const classified = classifyDownloadError(error);
      failure = { uri: null, ...classified };
      if (classified.reason === 'offline' || classified.reason === 'drive_auth') return failure;
    }
  }
  return failure;
}

/**
 * Marca a cópia que não abriu: apaga a do cache e devolve as chaves para `skip`, para a
 * próxima tentativa ir à fonte seguinte (original do WhatsApp ou outro arquivo no Drive).
 */
export function discardFailedCopy(item: PreservedAudio, uri: string): string[] {
  const cached = cachedFileFor(item);
  const keys = [uri];
  if (uri === cached.uri) {
    deleteQuietly(cached);
    const driveId = lastDriveIdByItem.get(item.id);
    if (driveId) keys.push(`drive:${driveId}`);
  }
  return keys;
}
