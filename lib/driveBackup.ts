import { File, Paths } from 'expo-file-system';

import {
  getAllWhatsAppMedia,
  getCapturedNotifications,
  getGalleryBackupItems,
  getPreservedAudios,
  hasGalleryAccess,
  isCharging,
  isOnWifi,
} from '@otherside/notification-capture';

import { readBackupSettings } from './backupSettings';
import {
  ensureFolder,
  ensureSubFolder,
  getAccessToken,
  listAppFiles,
  moveFileToFolder,
  uploadLocalFile,
  uploadMedia,
  type DriveFileInfo,
} from './googleDrive';
import {
  childCounts,
  chooseFullestFolder,
  findExistingUpload,
  findMessagesFile,
  indexByNameAndSize,
  ledgerKey,
  messagesNeedUpdate,
  shouldMoveIntoMonthFolder,
  type RemoteFile,
} from './uploadIdentity';

// Registro local do que já subiu: id do item -> id do arquivo no Drive.
// Também guarda chaves `ns:nome:tamanho`, estáveis quando o arquivo é regravado.
const RECORD_NAME = 'drive-uploads.json';
const LOCK_NAME = 'drive-sync.lock';
// Mesmo valor da appProperty "otherside" do mensagens.json, para reconciliar certo.
const MESSAGES_KEY = 'mensagens';
const PHOTOS_FOLDER = 'Fotos';
// Uma cópia grande (vídeo) pode levar vários minutos. O cadeado é renovado a cada arquivo.
const LOCK_TTL_MS = 45 * 60 * 1000;
// No sync automático, a galeria entra aos poucos. O backfill inicial não usa este teto.
const DEFAULT_GALLERY_LIMIT = 24;

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
  heif: 'image/heif',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  '3gp': 'video/3gpp',
};

function mimeForFile(fileName: string, explicit?: string): string {
  if (explicit && explicit !== 'application/octet-stream') return explicit;
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

/** Mês no fuso do aparelho. A foto das 22h no Brasil não pode cair no mês seguinte. */
function monthKeyLocal(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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

function lockFile(): File {
  return new File(Paths.document, LOCK_NAME);
}

function acquireLock(): boolean {
  try {
    const file = lockFile();
    if (file.exists) {
      const started = Number(file.textSync());
      if (Number.isFinite(started) && Date.now() - started < LOCK_TTL_MS) return false;
    }
    if (!file.exists) file.create();
    file.write(String(Date.now()));
    return true;
  } catch (_error) {
    return true;
  }
}

function touchLock(): void {
  try {
    const file = lockFile();
    if (!file.exists) file.create();
    file.write(String(Date.now()));
  } catch (_error) {
    // best effort
  }
}

function releaseLock(): void {
  try {
    const file = lockFile();
    if (file.exists) file.delete();
  } catch (_error) {
    // best effort
  }
}

export type GallerySkipReason = 'wifi' | 'charging' | 'permission' | 'disabled' | null;

export type SyncResult = {
  uploaded: number;
  failed: number;
  pending: number;
  messagesSynced: boolean;
  gallerySkipped: GallerySkipReason;
};

export type SyncOptions = {
  /** No automático, limita a galeria. O backfill inicial passa um número bem alto. */
  galleryLimit?: number;
  /** 'gallery' sobe fotos antes do restante, para uma foto nova não esperar a fila toda. */
  focus?: 'default' | 'gallery';
};

type UploadItem = {
  id: string;
  uri: string;
  fileName: string;
  originalModifiedAt: number;
  sizeBytes: number;
  mimeType?: string;
  monthKey: string;
  photos: boolean;
};

let syncing = false;
let lastPending = 0;

function toRemote(file: DriveFileInfo): RemoteFile {
  return {
    id: file.id,
    name: file.name,
    appId: file.appId,
    parents: file.parents,
    isFolder: file.isFolder,
    size: file.size,
    md5: file.md5,
    createdTime: file.createdTime,
  };
}

function rememberUpload(record: Record<string, string>, item: UploadItem, driveId: string): void {
  record[item.id] = driveId;
  if (item.sizeBytes > 0) record[ledgerKey(item.fileName, item.sizeBytes)] = driveId;
}

export async function syncNow(
  onProgress?: (done: number, total: number) => void,
  maxUploads?: number,
  options?: SyncOptions,
): Promise<SyncResult> {
  const empty: SyncResult = {
    uploaded: 0,
    failed: 0,
    pending: lastPending,
    messagesSynced: false,
    gallerySkipped: null,
  };
  if (syncing || !acquireLock()) return empty;
  syncing = true;
  try {
    const token = await getAccessToken();
    if (!token) return empty;

    const listed = await listAppFiles(token);
    const driveFiles = listed.files.map(toRemote);
    const counts = childCounts(driveFiles);
    const roots = driveFiles.filter(
      (file) => file.isFolder && file.name === 'OtherSide',
    );
    let folderId = chooseFullestFolder(roots, counts)?.id ?? null;
    if (!folderId) {
      if (!listed.complete) return empty;
      folderId = await ensureFolder(token);
    }
    if (!folderId) return empty;

    const record = readRecord();
    const byNameSize = indexByNameAndSize(driveFiles);
    const byId = new Set(driveFiles.map((file) => file.id));

    const monthCandidates = new Map<string, RemoteFile[]>();
    for (const file of driveFiles) {
      if (file.isFolder && /^\d{4}-\d{2}$/.test(file.name) && file.parents.includes(folderId)) {
        const list = monthCandidates.get(file.name) ?? [];
        list.push(file);
        monthCandidates.set(file.name, list);
      }
    }
    const monthFolders: Record<string, string> = {};
    const monthFolderIds = new Set<string>();
    for (const [name, candidates] of monthCandidates) {
      const chosen = chooseFullestFolder(candidates, counts);
      if (!chosen) continue;
      monthFolders[name] = chosen.id;
      for (const candidate of candidates) monthFolderIds.add(candidate.id);
    }

    const fotosFolders: Record<string, string> = {};
    const fotosFolderIds = new Set<string>();
    for (const file of driveFiles) {
      if (!file.isFolder || file.name !== PHOTOS_FOLDER) continue;
      fotosFolderIds.add(file.id);
    }
    for (const [month, monthId] of Object.entries(monthFolders)) {
      const candidates = driveFiles.filter(
        (file) => file.isFolder && file.name === PHOTOS_FOLDER && file.parents.includes(monthId),
      );
      const chosen = chooseFullestFolder(candidates, counts);
      if (chosen) fotosFolders[month] = chosen.id;
    }

    const rootFolderId: string = folderId;
    const driveToken: string = token;
    async function monthFolderForKey(key: string): Promise<string | null> {
      const cached = monthFolders[key];
      if (cached) return cached;
      const created = await ensureSubFolder(driveToken, rootFolderId, key);
      if (created) {
        monthFolders[key] = created;
        monthFolderIds.add(created);
      }
      return created;
    }

    async function fotosFolderForKey(key: string): Promise<string | null> {
      const cached = fotosFolders[key];
      if (cached) return cached;
      const monthId = await monthFolderForKey(key);
      if (!monthId) return null;
      const created = await ensureSubFolder(driveToken, monthId, PHOTOS_FOLDER);
      if (created) {
        fotosFolders[key] = created;
        fotosFolderIds.add(created);
      }
      return created;
    }

    // Reconcilia o registro e leva para o mês só o que ainda está na raiz.
    // Cópias repetidas que já existem no Drive ficam lá: não apagamos nada sozinhos.
    const seen = new Set<string>();
    const migrateCap = maxUploads ? 20 : 2000;
    let migrated = 0;
    let recordChanged = false;

    for (const file of driveFiles) {
      if (file.isFolder) continue;
      if (file.size != null && file.size > 0 && !record[ledgerKey(file.name, file.size)]) {
        record[ledgerKey(file.name, file.size)] = file.id;
        recordChanged = true;
      }
      if (!file.appId) continue;
      if (!seen.has(file.appId)) {
        seen.add(file.appId);
        if (record[file.appId] !== file.id) {
          record[file.appId] = file.id;
          recordChanged = true;
        }
      }

      if (migrated >= migrateCap) continue;
      if (!shouldMoveIntoMonthFolder(file, rootFolderId, monthFolderIds, fotosFolderIds)) continue;
      const date = dateFromName(file.name);
      if (!date) continue;
      const targetId = await monthFolderForKey(monthKeyOf(date));
      if (!targetId) continue;
      if (await moveFileToFolder(token, file.id, targetId, rootFolderId, date.toISOString())) {
        migrated += 1;
        file.parents = file.parents.filter((parent) => parent !== rootFolderId);
        if (!file.parents.includes(targetId)) file.parents.push(targetId);
      }
    }
    for (const local of getPreservedAudios()) {
      if (!local.fileName || local.sizeBytes <= 0) continue;
      const existing = findExistingUpload(byNameSize, local.fileName, local.sizeBytes);
      if (!existing) continue;
      if (record[local.id] !== existing.id) {
        record[local.id] = existing.id;
        recordChanged = true;
      }
      const key = ledgerKey(local.fileName, local.sizeBytes);
      if (record[key] !== existing.id) {
        record[key] = existing.id;
        recordChanged = true;
      }
    }
    if (recordChanged) writeRecord(record);

    const mediaItems = collectMediaItems();
    const gallery = await collectGalleryItems();
    const gallerySkipped = gallery.skipped;

    const ordered =
      options?.focus === 'gallery'
        ? [...gallery.items, ...mediaItems]
        : [...mediaItems, ...gallery.items];
    const galleryLimit = options?.galleryLimit ?? (maxUploads ? maxUploads : DEFAULT_GALLERY_LIMIT);

    let uploaded = 0;
    let failed = 0;
    const pendingItems = ordered.filter((item) => !isAlreadyUploaded(record, byNameSize, byId, item, listed.complete));
    let galleryKept = 0;
    const work = pendingItems.filter((item) => {
      if (!item.photos) return true;
      if (gallerySkipped) return false;
      if (galleryKept >= galleryLimit) return false;
      galleryKept += 1;
      return true;
    });

    for (const item of work) {
      touchLock();
      const targetId = item.photos
        ? await fotosFolderForKey(item.monthKey)
        : await monthFolderForKey(item.monthKey);
      const existing = findExistingUpload(byNameSize, item.fileName, item.sizeBytes, targetId ?? undefined);
      if (existing) {
        rememberUpload(record, item, existing.id);
        writeRecord(record);
        continue;
      }

      const date = item.photos
        ? new Date(item.originalModifiedAt || Date.now())
        : (dateFromName(item.fileName) ?? new Date(item.originalModifiedAt || Date.now()));
      const modifiedTime = new Date(item.originalModifiedAt || date.getTime()).toISOString();
      const driveId = await uploadLocalFile(token, {
        fileUri: item.uri,
        name: item.fileName,
        mimeType: mimeForFile(item.fileName, item.mimeType),
        folderId: targetId ?? folderId,
        appId: item.id,
        modifiedTime,
      });
      if (driveId) {
        rememberUpload(record, item, driveId);
        const stored: RemoteFile = {
          id: driveId,
          name: item.fileName,
          appId: item.id,
          parents: [targetId ?? folderId],
          isFolder: false,
          size: item.sizeBytes,
          md5: null,
          createdTime: null,
        };
        const key = ledgerKey(item.fileName, item.sizeBytes);
        const list = byNameSize.get(key);
        if (list) list.push(stored);
        else if (item.sizeBytes > 0) byNameSize.set(key, [stored]);
        byId.add(driveId);
        uploaded += 1;
        writeRecord(record);
        onProgress?.(uploaded, work.length);
        if (maxUploads && uploaded >= maxUploads) break;
      } else {
        failed += 1;
      }
    }

    const messagesSynced = await syncMessages(token, folderId, record, driveFiles);
    writeRecord(record);
    evictOldLocalFiles(record);

    const stillPending = ordered.filter(
      (item) => !isAlreadyUploaded(record, byNameSize, byId, item, listed.complete),
    ).length;
    lastPending = stillPending;
    return { uploaded, failed, pending: stillPending, messagesSynced, gallerySkipped };
  } catch (_error) {
    return empty;
  } finally {
    syncing = false;
    releaseLock();
  }
}

function isAlreadyUploaded(
  record: Record<string, string>,
  byNameSize: Map<string, RemoteFile[]>,
  byId: Set<string>,
  item: UploadItem,
  listComplete: boolean,
): boolean {
  const onDrive = findExistingUpload(byNameSize, item.fileName, item.sizeBytes);
  if (onDrive) return true;
  const known = record[ledgerKey(item.fileName, item.sizeBytes)] || record[item.id];
  if (!known) return false;
  if (!listComplete) return true;
  return byId.has(known);
}

function collectMediaItems(): UploadItem[] {
  const uploadMap = new Map<string, UploadItem>();
  const add = (item: {
    id: string;
    uri: string;
    fileName: string;
    originalModifiedAt: number;
    sizeBytes: number;
  }) => {
    if (!item.fileName || item.sizeBytes <= 0) return;
    const stableId = ledgerKey(item.fileName, item.sizeBytes);
    if (uploadMap.has(stableId)) return;
    const date = dateFromName(item.fileName) ?? new Date(item.originalModifiedAt || Date.now());
    uploadMap.set(stableId, {
      id: item.id,
      uri: item.uri,
      fileName: item.fileName,
      originalModifiedAt: item.originalModifiedAt,
      sizeBytes: item.sizeBytes,
      monthKey: monthKeyOf(date),
      photos: false,
    });
  };
  for (const media of getAllWhatsAppMedia()) add(media);
  for (const local of getPreservedAudios()) add(local);
  return [...uploadMap.values()];
}

async function collectGalleryItems(): Promise<{ items: UploadItem[]; skipped: GallerySkipReason }> {
  const settings = readBackupSettings();
  if (!settings.galleryEnabled) return { items: [], skipped: 'disabled' };
  if (!hasGalleryAccess()) return { items: [], skipped: 'permission' };

  let skipped: GallerySkipReason = null;
  if (settings.wifiOnly && !isOnWifi()) skipped = 'wifi';
  else if (settings.requireCharging && !isCharging()) skipped = 'charging';

  let listed: Awaited<ReturnType<typeof getGalleryBackupItems>> = [];
  try {
    listed = await getGalleryBackupItems(settings.includeWhatsAppImages);
  } catch (_error) {
    return { items: [], skipped: skipped ?? 'permission' };
  }

  const items: UploadItem[] = [];
  const seen = new Set<string>();
  for (const photo of listed) {
    const sizeBytes = Number(photo.sizeBytes);
    const fileName = photo.fileName?.trim();
    if (!fileName || !Number.isFinite(sizeBytes) || sizeBytes <= 0 || !photo.uri) continue;
    const key = ledgerKey(fileName, sizeBytes);
    if (seen.has(key)) continue;
    seen.add(key);
    const takenAt = Number(photo.takenAt) || Date.now();
    items.push({
      id: photo.id || key,
      uri: photo.uri,
      fileName,
      originalModifiedAt: takenAt,
      sizeBytes,
      mimeType: photo.mimeType,
      monthKey: monthKeyLocal(takenAt),
      photos: true,
    });
  }
  return { items, skipped };
}

/** Sobe o backfill da galeria sem o teto do sync automático. */
export async function backfillGallery(
  onProgress?: (done: number, total: number) => void,
): Promise<SyncResult> {
  return syncNow(onProgress, undefined, { galleryLimit: Number.MAX_SAFE_INTEGER, focus: 'gallery' });
}

/** Sobe (ou atualiza) um único JSON com o texto das mensagens preservadas. */
async function syncMessages(
  token: string,
  folderId: string,
  record: Record<string, string>,
  driveFiles: RemoteFile[],
): Promise<boolean> {
  try {
    const notifications = getCapturedNotifications();
    if (notifications.length === 0) return false;

    const tmp = new File(Paths.cache, 'otherside-mensagens.json');
    if (tmp.exists) tmp.delete();
    tmp.create();
    tmp.write(JSON.stringify(notifications, null, 2));
    const local = { size: tmp.size, md5: tmp.md5 };
    const remote = findMessagesFile(driveFiles, folderId, record[MESSAGES_KEY]);

    if (remote) {
      record[MESSAGES_KEY] = remote.id;
      if (!messagesNeedUpdate(local, remote)) return true;
      const ok = await uploadMedia(token, remote.id, tmp.uri, 'application/json');
      // Falha transitória não cria outro mensagens.json.
      return ok;
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
    if (!record[item.id] && !record[ledgerKey(item.fileName, item.sizeBytes)]) continue;
    const when = item.originalModifiedAt || item.preservedAt;
    if (when >= cutoff) continue;
    try {
      const local = new File(item.uri);
      if (local.exists) local.delete();
    } catch (_error) {
      // best effort
    }
  }
}

/** Quantos arquivos ainda faltam subir (do último cálculo de sincronização). */
export function pendingCount(): number {
  return lastPending;
}

/** Quantos arquivos distintos já estão no Drive (sem contar o mensagens.json duas vezes). */
export function uploadedCount(): number {
  const record = readRecord();
  const ids = new Set<string>();
  for (const [key, value] of Object.entries(record)) {
    if (!value || key === MESSAGES_KEY) continue;
    ids.add(value);
  }
  return ids.size;
}
