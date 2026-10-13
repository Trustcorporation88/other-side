import { File, Paths } from 'expo-file-system';

import { getCapturedNotifications, getPreservedAudios } from '@otherside/notification-capture';

import {
  ensureFolder,
  ensureSubFolder,
  getAccessToken,
  listAppFiles,
  moveFileToFolder,
  trashFile,
  uploadLocalFile,
  uploadMedia,
} from './googleDrive';

// Registro local do que já subiu: id do item -> id do arquivo no Drive.
const RECORD_NAME = 'drive-uploads.json';
// Mesmo valor da appProperty "otherside" do mensagens.json, para reconciliar certo.
const MESSAGES_KEY = 'mensagens';

const FILE_MIME: Record<string, string> = {
  opus: 'audio/ogg',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  mp3: 'audio/mpeg',
  amr: 'audio/amr',
  wav: 'audio/wav',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  heic: 'image/heic',
};

function mimeForFile(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return FILE_MIME[ext] ?? 'application/octet-stream';
}

/** Extrai a data (UTC) do nome do arquivo do WhatsApp (ex.: IMG-20250915-WA0012.jpg). */
function dateFromName(fileName: string): Date | null {
  const match = fileName.match(/(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function monthKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function recordFile(): File {
  return new File(Paths.document, RECORD_NAME);
}

function readRecord(): Record<string, string> {
  try {
    const file = recordFile();
    if (!file.exists) return {};
    const raw = file.textSync();
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch (_error) {
    return {};
  }
}

function writeRecord(record: Record<string, string>): void {
  try {
    const file = recordFile();
    if (!file.exists) file.create();
    file.write(JSON.stringify(record));
  } catch (_error) {
    // best effort
  }
}

export type SyncResult = {
  uploaded: number;
  failed: number;
  pending: number;
  messagesSynced: boolean;
};

let syncing = false;

export async function syncNow(
  onProgress?: (done: number, total: number) => void,
  maxUploads?: number,
): Promise<SyncResult> {
  const empty: SyncResult = { uploaded: 0, failed: 0, pending: 0, messagesSynced: false };
  if (syncing) return empty;
  syncing = true;
  try {
    const token = await getAccessToken();
    if (!token) return empty;
    const folderId = await ensureFolder(token);
    if (!folderId) return empty;

    const record = readRecord();

    // 1. Lê o que o app já tem no Drive (arquivos + subpastas de mês).
    const driveFiles = await listAppFiles(token);
    const monthFolders: Record<string, string> = {};
    for (const file of driveFiles) {
      if (file.isFolder && /^\d{4}-\d{2}$/.test(file.name) && file.parents.includes(folderId)) {
        monthFolders[file.name] = file.id;
      }
    }

    const rootFolderId: string = folderId;
    const driveToken: string = token;
    async function monthFolderFor(date: Date): Promise<string | null> {
      const key = monthKeyOf(date);
      const cached = monthFolders[key];
      if (cached) return cached;
      const created = await ensureSubFolder(driveToken, rootFolderId, key);
      if (created) monthFolders[key] = created;
      return created;
    }

    // 2. Reconcilia o registro, limpa duplicatas e migra para a subpasta do mês + carimba a data.
    const seen = new Set<string>();
    const migrateCap = maxUploads ? 20 : 2000;
    let migrated = 0;
    let recordChanged = false;

    for (const file of driveFiles) {
      if (file.isFolder || !file.appId) continue;
      if (seen.has(file.appId)) {
        await trashFile(token, file.id); // duplicata: mantém uma, manda a extra pra lixeira
        continue;
      }
      seen.add(file.appId);
      if (record[file.appId] !== file.id) {
        record[file.appId] = file.id;
        recordChanged = true;
      }

      if (migrated >= migrateCap) continue;
      const date = dateFromName(file.name);
      if (!date) continue; // sem data no nome (ex.: mensagens.json) fica na raiz
      const targetId = await monthFolderFor(date);
      if (targetId && !file.parents.includes(targetId)) {
        const removeParent = file.parents.find((parent) => parent !== targetId);
        if (await moveFileToFolder(token, file.id, targetId, removeParent, date.toISOString())) {
          migrated += 1;
        }
      }
    }
    if (recordChanged) writeRecord(record);

    // 3. Envia os itens que ainda não estão no Drive, direto na subpasta do mês.
    const toUpload = getPreservedAudios().filter((item) => !record[item.id]);
    let uploaded = 0;
    let failed = 0;

    for (const item of toUpload) {
      const date = dateFromName(item.fileName) ?? new Date(item.originalModifiedAt || item.preservedAt);
      const targetId = await monthFolderFor(date);
      const modifiedTime = new Date(item.originalModifiedAt || date.getTime()).toISOString();
      const driveId = await uploadLocalFile(token, {
        fileUri: item.uri,
        name: item.fileName,
        mimeType: mimeForFile(item.fileName),
        folderId: targetId ?? folderId,
        appId: item.id,
        modifiedTime,
      });
      if (driveId) {
        record[item.id] = driveId;
        uploaded += 1;
        // Salva a cada item: se o app fechar no meio, retoma de onde parou.
        writeRecord(record);
        onProgress?.(uploaded, toUpload.length);
        if (maxUploads && uploaded >= maxUploads) break;
      } else {
        failed += 1;
      }
    }

    const messagesSynced = await syncMessages(token, folderId, record);
    writeRecord(record);
    evictOldLocalFiles(record);

    const pending = getPreservedAudios().filter((item) => !record[item.id]).length;
    return { uploaded, failed, pending, messagesSynced };
  } catch (_error) {
    return empty;
  } finally {
    syncing = false;
  }
}

/** Sobe (ou atualiza) um único JSON com o texto das mensagens preservadas. */
async function syncMessages(
  token: string,
  folderId: string,
  record: Record<string, string>,
): Promise<boolean> {
  try {
    const notifications = getCapturedNotifications();
    if (notifications.length === 0) return false;

    const tmp = new File(Paths.cache, 'otherside-mensagens.json');
    if (tmp.exists) tmp.delete();
    tmp.create();
    tmp.write(JSON.stringify(notifications, null, 2));

    const existingId = record[MESSAGES_KEY];
    if (existingId) {
      const ok = await uploadMedia(token, existingId, tmp.uri, 'application/json');
      if (ok) return true;
      // Arquivo pode ter sido apagado no Drive; recria abaixo.
    }

    const driveId = await uploadLocalFile(token, {
      fileUri: tmp.uri,
      name: 'mensagens.json',
      mimeType: 'application/json',
      folderId,
      appId: 'mensagens',
    });
    if (driveId) {
      record[MESSAGES_KEY] = driveId;
      return true;
    }
    return false;
  } catch (_error) {
    return false;
  }
}

// Itens mais antigos que isto, já enviados ao Drive, têm a cópia local apagada (fica no Drive).
const EVICTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Id do arquivo no Drive para um item preservado, ou null se ainda não subiu. */
export function driveFileIdFor(id: string): string | null {
  const record = readRecord();
  return record[id] ?? null;
}

/** Apaga a cópia local (arquivo cheio) dos itens antigos já no Drive, mantendo índice e miniatura. */
function evictOldLocalFiles(record: Record<string, string>): void {
  const cutoff = Date.now() - EVICTION_WINDOW_MS;
  for (const item of getPreservedAudios()) {
    if (!record[item.id]) continue; // só apaga o que já está no Drive
    const when = item.originalModifiedAt || item.preservedAt;
    if (when >= cutoff) continue; // recentes ficam no celular
    try {
      const local = new File(item.uri);
      if (local.exists) local.delete();
    } catch (_error) {
      // best effort
    }
  }
}

/** Quantos arquivos (áudios + fotos) ainda faltam subir. */
export function pendingCount(): number {
  const record = readRecord();
  return getPreservedAudios().filter((item) => !record[item.id]).length;
}

/** Quantos arquivos já foram enviados ao Drive (presentes hoje no aparelho). */
export function uploadedCount(): number {
  const record = readRecord();
  const presentIds = new Set(getPreservedAudios().map((item) => item.id));
  return Object.keys(record).filter((id) => presentIds.has(id)).length;
}
