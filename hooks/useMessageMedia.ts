import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

import {
  addAudioPreservedListener,
  addNotificationListener,
  getCapturedNotifications,
  getPreservedAudios,
  hasAllFilesAccess,
  isNativeAvailable,
  type PreservedAudio,
} from '@otherside/notification-capture';
import {
  mergeLinks,
  type LinkMedia,
  type MediaSender,
  type StoredLinks,
} from '@/lib/messageMedia';

const LINKS_FILE = 'message-media-links.json';

export type MessageMediaSnapshot = {
  /** Falso até o primeiro cálculo terminar */
  loaded: boolean;
  /** id da mensagem → id da mídia */
  mediaByMessage: Map<string, string>;
  /** id da mídia → quem mandou */
  senderByMedia: Map<string, MediaSender>;
  /** "nome|tamanho" do documento → quem mandou (a aba Docs não usa o id do índice) */
  senderByDocument: Map<string, MediaSender>;
  /** Mídia ainda no índice do aparelho */
  preservedById: Map<string, PreservedAudio>;
  /** Mídia ligada a uma mensagem, mesmo que já tenha saído do índice (abre pelo Drive) */
  mediaById: Map<string, LinkMedia>;
};

const EMPTY: MessageMediaSnapshot = {
  loaded: false,
  mediaByMessage: new Map(),
  senderByMedia: new Map(),
  senderByDocument: new Map(),
  preservedById: new Map(),
  mediaById: new Map(),
};

let snapshot = EMPTY;
let lastSaved = '';
let storedCache: StoredLinks | null = null;
let refreshQueued = false;
const listeners = new Set<() => void>();
let teardown: (() => void) | null = null;

export function documentLinkKey(fileName: string, sizeBytes: number): string {
  return `${fileName}|${sizeBytes}`;
}

function linksFile(): File {
  return new File(Paths.document, LINKS_FILE);
}

function readStored(): StoredLinks {
  if (storedCache) return storedCache;
  try {
    const file = linksFile();
    if (!file.exists) return { mediaByMessage: {}, media: {} };
    const raw = file.textSync();
    lastSaved = raw;
    const parsed = JSON.parse(raw) as Partial<StoredLinks>;
    storedCache = {
      mediaByMessage: parsed.mediaByMessage ?? {},
      media: parsed.media ?? {},
    };
    return storedCache;
  } catch {
    return { mediaByMessage: {}, media: {} };
  }
}

function writeStored(stored: StoredLinks): void {
  storedCache = stored;
  try {
    const raw = JSON.stringify(stored);
    if (raw === lastSaved) return;
    const file = linksFile();
    if (!file.exists) file.create();
    file.write(raw);
    lastSaved = raw;
  } catch {
    // guardar as ligações é best effort; elas são recalculadas na próxima abertura
  }
}

function toLinkMedia(item: PreservedAudio): LinkMedia {
  return {
    id: item.id,
    fileName: item.fileName,
    kind: item.kind,
    moment: item.originalModifiedAt || item.preservedAt,
    sizeBytes: item.sizeBytes,
    sourcePackage: item.sourcePackage,
    origin: item.origin,
  };
}

function recompute(): void {
  if (!isNativeAvailable || Platform.OS === 'web') {
    if (!snapshot.loaded) {
      snapshot = { ...EMPTY, loaded: true };
      listeners.forEach((listener) => listener());
    }
    return;
  }
  const messages = getCapturedNotifications();
  const preserved = hasAllFilesAccess() ? getPreservedAudios() : [];
  const merged = mergeLinks(messages, preserved.map(toLinkMedia), readStored());
  writeStored(merged.stored);

  const senderByDocument = new Map<string, MediaSender>();
  for (const [id, sender] of merged.senderByMedia) {
    const media = merged.mediaById.get(id);
    if (media?.kind === 'document') senderByDocument.set(documentLinkKey(media.fileName, media.sizeBytes), sender);
  }

  snapshot = {
    loaded: true,
    mediaByMessage: merged.mediaByMessage,
    senderByMedia: merged.senderByMedia,
    senderByDocument,
    preservedById: new Map(preserved.map((item) => [item.id, item])),
    mediaById: merged.mediaById,
  };
  listeners.forEach((listener) => listener());
}

/** Junta vários avisos seguidos (mensagem + arquivo) num só recálculo. */
export function refreshMessageMedia(): void {
  if (refreshQueued) return;
  refreshQueued = true;
  setTimeout(() => {
    refreshQueued = false;
    try {
      recompute();
    } catch {
      // a ligação é um extra: nunca derruba a tela
    }
  }, 250);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!teardown && isNativeAvailable) {
    const notificationSubscription = addNotificationListener(refreshMessageMedia);
    const mediaSubscription = addAudioPreservedListener(refreshMessageMedia);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshMessageMedia();
    });
    teardown = () => {
      notificationSubscription.remove();
      mediaSubscription.remove();
      appStateSubscription.remove();
    };
    refreshMessageMedia();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && teardown) {
      teardown();
      teardown = null;
    }
  };
}

function getSnapshot(): MessageMediaSnapshot {
  return snapshot;
}

/** Ligações mensagem ↔ foto/áudio/documento, compartilhadas entre as abas. */
export function useMessageMedia(): MessageMediaSnapshot {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    refreshMessageMedia();
  }, []);
  return value;
}
