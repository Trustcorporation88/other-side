import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { getAllWhatsAppMedia, openContentUri } from '@otherside/notification-capture';

import {
  dateFromDocumentName,
  documentKey,
  isDocumentName,
  pickRecentDocuments,
  RECENT_DOCUMENT_LIMIT,
  type DocumentCandidate,
} from './recentDocumentSelection';
import { ledgerKey } from './uploadIdentity';

const INDEX_NAME = 'recent-documents.json';
const DIRECTORY_NAME = 'recent-documents';

export type RecentDocument = {
  id: string;
  fileName: string;
  sizeBytes: number;
  moment: number;
  driveId: string | null;
  storedName: string;
  localUri: string | null;
};

type RemoteDocument = {
  id: string;
  name: string;
  size: number | null;
  createdTime: string | null;
  isFolder: boolean;
};

type MaterializeInput = {
  token: string | null;
  remote: readonly RemoteDocument[];
  record: Record<string, string>;
};

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  rtf: 'application/rtf',
  odt: 'application/vnd.oasis.opendocument.text',
  zip: 'application/zip',
};

let chain: Promise<unknown> = Promise.resolve();

function indexFile(): File {
  return new File(Paths.document, INDEX_NAME);
}

function documentsDir(): Directory {
  const dir = new Directory(Paths.document, DIRECTORY_NAME);
  try {
    dir.create({ intermediates: true, idempotent: true });
  } catch (_error) {
    // já existe
  }
  return dir;
}

function storedName(fileName: string, sizeBytes: number): string {
  const cleaned = fileName.replace(/[^\w.\-() ]+/g, '_').replace(/^\.+/, '').slice(0, 100);
  return `${sizeBytes}-${cleaned || 'documento'}`;
}

function mimeFor(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream';
}

function readIndex(): RecentDocument[] {
  try {
    const file = indexFile();
    if (!file.exists) return [];
    const parsed = JSON.parse(file.textSync()) as RecentDocument[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function writeIndex(documents: RecentDocument[]): void {
  const file = indexFile();
  if (!file.exists) file.create();
  file.write(JSON.stringify(documents));
}

function withLocalUri(documents: RecentDocument[]): RecentDocument[] {
  const dir = documentsDir();
  return documents.map((document) => {
    const local = new File(dir, document.storedName);
    return { ...document, localUri: local.exists ? local.uri : null };
  });
}

export function readRecentDocuments(): RecentDocument[] {
  if (Platform.OS === 'web') return [];
  return withLocalUri(readIndex());
}

function candidatesFrom(input: MaterializeInput): DocumentCandidate[] {
  const candidates: DocumentCandidate[] = [];

  for (const saved of readIndex()) {
    if (!saved.fileName || saved.sizeBytes <= 0) continue;
    candidates.push({
      key: documentKey(saved.fileName, saved.sizeBytes),
      fileName: saved.fileName,
      sizeBytes: saved.sizeBytes,
      moment: saved.moment || dateFromDocumentName(saved.fileName),
      driveId: saved.driveId ?? undefined,
    });
  }

  try {
    for (const media of getAllWhatsAppMedia()) {
      if (media.kind !== 'document' || !isDocumentName(media.fileName) || media.sizeBytes <= 0) continue;
      const moment = media.originalModifiedAt || dateFromDocumentName(media.fileName);
      candidates.push({
        key: documentKey(media.fileName, media.sizeBytes),
        fileName: media.fileName,
        sizeBytes: media.sizeBytes,
        moment,
        sourceUri: media.uri,
        driveId: input.record[media.id] || input.record[ledgerKey(media.fileName, media.sizeBytes)],
      });
    }
  } catch (_error) {
    // a lista local é best effort
  }

  for (const file of input.remote) {
    if (file.isFolder || !isDocumentName(file.name) || file.size == null || file.size <= 0) continue;
    const created = file.createdTime ? Date.parse(file.createdTime) : 0;
    candidates.push({
      key: documentKey(file.name, file.size),
      fileName: file.name,
      sizeBytes: file.size,
      moment: Number.isFinite(created) && created > 0 ? created : dateFromDocumentName(file.name),
      driveId: file.id,
    });
  }

  return candidates;
}

async function ensureLocal(item: DocumentCandidate, token: string | null): Promise<string | null> {
  const name = storedName(item.fileName, item.sizeBytes);
  const dest = new File(documentsDir(), name);
  if (dest.exists && dest.size === item.sizeBytes) return dest.uri;

  if (item.sourceUri) {
    try {
      const source = new File(item.sourceUri);
      if (source.exists) {
        if (dest.exists) dest.delete();
        await source.copy(dest);
        if (dest.exists) return dest.uri;
      }
    } catch (_error) {
      // tenta o Drive
    }
  }

  if (!token || !item.driveId) return dest.exists ? dest.uri : null;

  const partial = new File(documentsDir(), `${name}.part`);
  try {
    if (partial.exists) partial.delete();
    const task = File.createDownloadTask(
      `https://www.googleapis.com/drive/v3/files/${item.driveId}?alt=media`,
      partial,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    await task.downloadAsync();
    if (!partial.exists || partial.size <= 0) return dest.exists ? dest.uri : null;
    if (dest.exists) dest.delete();
    await partial.move(dest);
    return dest.exists ? dest.uri : null;
  } catch (_error) {
    try {
      if (partial.exists) partial.delete();
    } catch (_cleanup) {
      // best effort
    }
    return dest.exists ? dest.uri : null;
  }
}

async function doMaterialize(input: MaterializeInput): Promise<RecentDocument[]> {
  const ranked = pickRecentDocuments(candidatesFrom(input), 40);
  const kept: RecentDocument[] = [];
  for (const item of ranked) {
    if (kept.length >= RECENT_DOCUMENT_LIMIT) break;
    const name = storedName(item.fileName, item.sizeBytes);
    const localUri = await ensureLocal(item, input.token);
    if (!localUri) continue;
    kept.push({
      id: item.key,
      fileName: item.fileName,
      sizeBytes: item.sizeBytes,
      moment: item.moment,
      driveId: item.driveId ?? null,
      storedName: name,
      localUri,
    });
  }

  const keepNames = new Set(kept.map((item) => item.storedName));
  try {
    for (const entry of documentsDir().list()) {
      if (!(entry instanceof File)) continue;
      const name = decodeURIComponent(entry.uri.split('/').pop() ?? '');
      if (name.endsWith('.part') || !keepNames.has(name)) entry.delete();
    }
  } catch (_error) {
    // limpar cópias antigas é best effort
  }

  writeIndex(kept);
  return kept;
}

/** Copia ou baixa os 10 documentos mais recentes para o armazenamento do app. */
export function materializeRecentDocuments(input: MaterializeInput): Promise<RecentDocument[]> {
  if (Platform.OS === 'web') return Promise.resolve([]);
  const run = chain.then(() => doMaterialize(input));
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function openRecentDocument(document: RecentDocument): Promise<'opened' | 'missing' | 'unavailable'> {
  const dir = documentsDir();
  const file = new File(dir, document.storedName);
  if (!file.exists) return 'missing';
  try {
    const opened = openContentUri(file.contentUri, mimeFor(document.fileName));
    return opened ? 'opened' : 'unavailable';
  } catch (_error) {
    return 'unavailable';
  }
}
