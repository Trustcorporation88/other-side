/**
 * Liga cada mensagem do WhatsApp (aviso capturado) ao arquivo de mídia copiado no aparelho.
 *
 * O aviso não traz o arquivo: só o texto ("📷 Foto", "🎤 Mensagem de voz (0:12)",
 * "📄 Contrato.pdf"), a conversa, o remetente e o horário. O arquivo (IMG-/PTT-/AUD-/DOC-
 * AAAAMMDD-WAxxxx) só traz a data e o horário em que o WhatsApp o gravou. Por isso:
 * - documento: o nome do arquivo aparece no aviso e vira ligação exata;
 * - foto e áudio: o arquivo do mesmo tipo e da mesma conta (WhatsApp ou Business) gravado
 *   mais perto do aviso, dentro de uma janela, um arquivo por mensagem e na mesma ordem.
 *
 * Sem dependências do Expo para rodar nos testes do Node.
 */

export type LinkableKind = 'image' | 'audio' | 'document';

export type LinkMessage = {
  id: string;
  conversation: string;
  sender: string;
  message: string;
  receivedAt: number;
  packageName: string;
};

export type LinkMedia = {
  id: string;
  fileName: string;
  kind: string;
  moment: number;
  sizeBytes: number;
  sourcePackage?: string;
  origin?: string;
};

/** Quem mandou a mídia. `exact` é falso quando veio de uma sequência do mesmo remetente. */
export type MediaSender = {
  messageId: string;
  sender: string;
  conversation: string;
  packageName: string;
  receivedAt: number;
  exact: boolean;
};

export type MessageMediaLinks = {
  mediaByMessage: Map<string, string>;
  senderByMedia: Map<string, MediaSender>;
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** O WhatsApp às vezes grava o arquivo segundos antes de mostrar o aviso. */
export const MEDIA_BEFORE_MS = 2 * MINUTE;
/** Download automático lento (rede móvel, arquivo grande) ainda conta como a mesma mensagem. */
export const MEDIA_AFTER_MS = 30 * MINUTE;
/** Documento com o nome no aviso pode ser baixado bem depois, ao abrir a conversa. */
export const DOCUMENT_AFTER_MS = 7 * DAY;
/** Fotos e áudios seguidos (o aviso repetido vira uma só mensagem) ficam com o mesmo remetente. */
export const BURST_MS = 3 * MINUTE;

const IMAGE_EMOJI = /\u{1F4F7}|\u{1F5BC}/u;
const AUDIO_EMOJI = /\u{1F3A4}|\u{1F3B5}|\u{1F3A7}/u;
const DOCUMENT_EMOJI = /\u{1F4C4}|\u{1F4CE}|\u{1F4D1}/u;
const VIEW_ONCE = /visualiza[çc][aã]o [úu]nica|view once/i;

const IMAGE_WORDS = /^(?:foto|imagem|photo|image|gif)$/i;
const AUDIO_WORDS = /^(?:mensagem de voz|nota de voz|[áa]udio|voice message|voice note)(?:\s*\(\d{1,2}:\d{2}\))?$/i;
const DOCUMENT_WORDS = /^(?:documento|document)$/i;

/** Texto sem o "Fulano: " que o WhatsApp põe na frente nas mensagens de grupo. */
function bodyOf(message: string): string {
  const latest = message.split('\n').pop()?.trim() ?? '';
  const colon = latest.indexOf(': ');
  if (colon > 0 && colon < 60 && /[\u{1F300}-\u{1FAFF}]/u.test(latest.slice(colon))) {
    return latest.slice(colon + 2).trim();
  }
  return latest;
}

export function mediaKindOfMessage(message: string): LinkableKind | null {
  const body = bodyOf(message);
  if (!body || VIEW_ONCE.test(body)) return null;
  if (DOCUMENT_EMOJI.test(body)) return 'document';
  if (AUDIO_EMOJI.test(body)) return 'audio';
  if (IMAGE_EMOJI.test(body)) return 'image';
  if (DOCUMENT_WORDS.test(body)) return 'document';
  if (AUDIO_WORDS.test(body)) return 'audio';
  if (IMAGE_WORDS.test(body)) return 'image';
  return null;
}

/** Nome do documento mostrado no aviso ("📄 Contrato.pdf"), se houver. */
export function documentNameFromMessage(message: string): string | null {
  const body = bodyOf(message);
  const match = body.match(DOCUMENT_EMOJI);
  if (!match || match.index == null) return null;
  const name = body
    .slice(match.index + match[0].length)
    .replace(/\s*[(•·]\s*\d+\s*(?:p[áa]ginas?|pages?)\)?\s*$/i, '')
    .trim();
  if (!name || DOCUMENT_WORDS.test(name)) return null;
  return name;
}

/** Nome comparável: sem extensão, sem o "(1)"/"-1" de cópia repetida, minúsculo. */
export function normalizeDocumentName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,5}$/, '')
    .replace(/\s*(?:\(\d+\)|-\d)$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function accountOf(packageName?: string): string {
  return packageName === 'com.whatsapp.w4b' ? 'com.whatsapp.w4b' : 'com.whatsapp';
}

/** Data AAAAMMDD do nome do WhatsApp, em dias desde 1970 (UTC), ou null. */
function dayFromName(fileName: string): number | null {
  const match = fileName.match(/(?:^|[-_])(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:[-_.]|$)/);
  if (!match) return null;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY);
}

function localDay(timestamp: number): number {
  const date = new Date(timestamp);
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY);
}

/** A data no nome do arquivo não pode estar longe do dia do aviso. */
function sameDayByName(media: LinkMedia, receivedAt: number): boolean {
  const day = dayFromName(media.fileName);
  if (day == null) return true;
  return Math.abs(day - localDay(receivedAt)) <= 1;
}

type Pair = { message: LinkMessage; media: LinkMedia; cost: number; exact: boolean };

function pairCost(message: LinkMessage, media: LinkMedia, kind: LinkableKind, docName: string | null): Pair | null {
  if (media.kind !== kind) return null;
  if (media.origin === 'sent') return null;
  if (accountOf(media.sourcePackage) !== accountOf(message.packageName)) return null;
  const delta = media.moment - message.receivedAt;

  if (kind === 'document' && docName) {
    if (normalizeDocumentName(media.fileName) === normalizeDocumentName(docName)) {
      if (delta < -HOUR || delta > DOCUMENT_AFTER_MS) return null;
      // Nome igual vence qualquer ligação só por horário.
      return { message, media, cost: Math.abs(delta) - DOCUMENT_AFTER_MS * 2, exact: true };
    }
  }

  if (delta < -MEDIA_BEFORE_MS || delta > MEDIA_AFTER_MS) return null;
  if (!sameDayByName(media, message.receivedAt)) return null;
  // Arquivo antes do aviso é menos provável que depois.
  return { message, media, cost: delta >= 0 ? delta : -delta * 2, exact: false };
}

export function linkMessagesToMedia(
  messages: readonly LinkMessage[],
  media: readonly LinkMedia[],
): MessageMediaLinks {
  const byKind = new Map<string, LinkMedia[]>();
  for (const item of media) {
    const list = byKind.get(item.kind);
    if (list) list.push(item);
    else byKind.set(item.kind, [item]);
  }
  for (const list of byKind.values()) list.sort((a, b) => a.moment - b.moment);

  const pairs: Pair[] = [];
  for (const message of messages) {
    const kind = mediaKindOfMessage(message.message);
    if (!kind) continue;
    const docName = kind === 'document' ? documentNameFromMessage(message.message) : null;
    const candidates = byKind.get(kind) ?? [];
    const start = docName ? 0 : firstAtOrAfter(candidates, message.receivedAt - MEDIA_BEFORE_MS);
    for (let index = start; index < candidates.length; index += 1) {
      const item = candidates[index];
      if (!docName && item.moment > message.receivedAt + MEDIA_AFTER_MS) break;
      const pair = pairCost(message, item, kind, docName);
      if (pair) pairs.push(pair);
    }
  }

  pairs.sort((a, b) => a.cost - b.cost || a.media.id.localeCompare(b.media.id));
  const chosen = new Map<string, Pair>();
  const usedMedia = new Set<string>();
  for (const pair of pairs) {
    if (chosen.has(pair.message.id) || usedMedia.has(pair.media.id)) continue;
    chosen.set(pair.message.id, pair);
    usedMedia.add(pair.media.id);
  }

  keepChronologicalOrder(chosen);

  const mediaByMessage = new Map<string, string>();
  const senderByMedia = new Map<string, MediaSender>();
  for (const pair of chosen.values()) {
    mediaByMessage.set(pair.message.id, pair.media.id);
    senderByMedia.set(pair.media.id, senderOf(pair.message, true));
  }

  attributeBursts(media, chosen, senderByMedia);
  return { mediaByMessage, senderByMedia };
}

function firstAtOrAfter(sorted: readonly LinkMedia[], moment: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sorted[mid].moment < moment) low = mid + 1;
    else high = mid;
  }
  return low;
}

function senderOf(message: LinkMessage, exact: boolean): MediaSender {
  return {
    messageId: message.id,
    sender: message.sender,
    conversation: message.conversation,
    packageName: message.packageName,
    receivedAt: message.receivedAt,
    exact,
  };
}

/**
 * Duas fotos seguidas não podem trocar de mensagem: dentro de cada conta e tipo, as ligações
 * por horário seguem a ordem de chegada (a primeira mensagem fica com o primeiro arquivo).
 */
function keepChronologicalOrder(chosen: Map<string, Pair>): void {
  const groups = new Map<string, Pair[]>();
  for (const pair of chosen.values()) {
    if (pair.exact) continue;
    const key = `${accountOf(pair.message.packageName)}|${pair.media.kind}`;
    const group = groups.get(key);
    if (group) group.push(pair);
    else groups.set(key, [pair]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const byMessage = [...group].sort((a, b) => a.message.receivedAt - b.message.receivedAt);
    const byMedia = [...group].sort((a, b) => a.media.moment - b.media.moment);
    const fits = byMessage.every((pair, index) => {
      const delta = byMedia[index].media.moment - pair.message.receivedAt;
      return delta >= -MEDIA_BEFORE_MS && delta <= MEDIA_AFTER_MS;
    });
    if (!fits) continue;
    byMessage.forEach((pair, index) => {
      chosen.set(pair.message.id, { ...pair, media: byMedia[index].media });
    });
  }
}

/**
 * O WhatsApp junta mensagens iguais do mesmo contato ("📷 Foto" três vezes) num só aviso, e o
 * OtherSide guarda uma só mensagem. As outras fotos da sequência ficam com o mesmo remetente.
 */
function attributeBursts(
  media: readonly LinkMedia[],
  chosen: Map<string, Pair>,
  senderByMedia: Map<string, MediaSender>,
): void {
  const anchors = [...chosen.values()].filter((pair) => pair.media.kind !== 'document');
  if (anchors.length === 0) return;
  for (const item of media) {
    if (senderByMedia.has(item.id) || item.origin === 'sent' || item.kind === 'document') continue;
    let best: Pair | null = null;
    let bestGap = Infinity;
    for (const anchor of anchors) {
      if (anchor.media.kind !== item.kind) continue;
      if (accountOf(anchor.media.sourcePackage) !== accountOf(item.sourcePackage)) continue;
      if (item.moment < anchor.message.receivedAt - MEDIA_BEFORE_MS) continue;
      const gap = Math.abs(item.moment - anchor.media.moment);
      if (gap <= BURST_MS && gap < bestGap) {
        best = anchor;
        bestGap = gap;
      }
    }
    if (best) senderByMedia.set(item.id, senderOf(best.message, false));
  }
}

/** Cópia mínima da mídia ligada, para achar no Drive depois que sair do índice do aparelho. */
export type StoredMedia = LinkMedia & { sender: MediaSender | null };

export type StoredLinks = {
  mediaByMessage: Record<string, string>;
  media: Record<string, StoredMedia>;
};

export const STORED_MEDIA_LIMIT = 4000;

export type MergedLinks = MessageMediaLinks & {
  mediaById: Map<string, LinkMedia>;
  stored: StoredLinks;
};

/**
 * Recalcula as ligações com o que está no aparelho agora e completa com as já guardadas:
 * mensagem que saiu do histórico (teto de 200 por conta) ou mídia que saiu do índice
 * continuam ligadas, e a mídia ainda abre pelo Drive.
 */
export function mergeLinks(
  messages: readonly LinkMessage[],
  currentMedia: readonly LinkMedia[],
  stored: StoredLinks,
): MergedLinks {
  const mediaById = new Map<string, LinkMedia>();
  const currentBySource = new Map<string, string>();
  for (const item of currentMedia) {
    mediaById.set(item.id, item);
    currentBySource.set(sourceIdentity(item), item.id);
  }
  // Uma cópia cortada trocada pela inteira some do índice; a ligação passa para a inteira.
  const replacedBy = new Map<string, string>();
  for (const [id, item] of Object.entries(stored.media)) {
    if (mediaById.has(id)) continue;
    const replacement = currentBySource.get(sourceIdentity(item));
    if (replacement) {
      replacedBy.set(id, replacement);
      continue;
    }
    const { sender: _sender, ...media } = item;
    mediaById.set(id, media);
  }

  const computed = linkMessagesToMedia(messages, [...mediaById.values()]);
  const mediaByMessage = new Map(computed.mediaByMessage);
  const senderByMedia = new Map(computed.senderByMedia);

  const usedMedia = new Set(mediaByMessage.values());
  for (const [messageId, storedId] of Object.entries(stored.mediaByMessage)) {
    const mediaId = replacedBy.get(storedId) ?? storedId;
    if (mediaByMessage.has(messageId) || usedMedia.has(mediaId) || !mediaById.has(mediaId)) continue;
    mediaByMessage.set(messageId, mediaId);
    usedMedia.add(mediaId);
  }
  for (const [storedId, item] of Object.entries(stored.media)) {
    const id = replacedBy.get(storedId) ?? storedId;
    if (!senderByMedia.has(id) && item.sender) senderByMedia.set(id, item.sender);
  }

  const keep = [...new Set([...senderByMedia.keys(), ...mediaByMessage.values()])]
    .map((id) => mediaById.get(id))
    .filter((item): item is LinkMedia => item != null)
    .sort((a, b) => b.moment - a.moment)
    .slice(0, STORED_MEDIA_LIMIT);
  const keptIds = new Set(keep.map((item) => item.id));

  const next: StoredLinks = { mediaByMessage: {}, media: {} };
  for (const item of keep) {
    next.media[item.id] = {
      id: item.id,
      fileName: item.fileName,
      kind: item.kind,
      moment: item.moment,
      sizeBytes: item.sizeBytes,
      sourcePackage: item.sourcePackage,
      origin: item.origin,
      sender: senderByMedia.get(item.id) ?? null,
    };
  }
  for (const [messageId, mediaId] of mediaByMessage) {
    if (keptIds.has(mediaId)) next.mediaByMessage[messageId] = mediaId;
  }

  return { mediaByMessage, senderByMedia, mediaById, stored: next };
}

function sourceIdentity(item: Pick<LinkMedia, 'kind' | 'fileName' | 'sourcePackage'>): string {
  return `${item.kind}|${accountOf(item.sourcePackage)}|${item.fileName}`;
}

/** "Ana" ou "Ana · Família" quando a mensagem veio de um grupo. */
export function senderLabel(sender: Pick<MediaSender, 'sender' | 'conversation'>): string {
  const who = sender.sender.trim();
  const chat = sender.conversation.trim();
  if (!chat || chat.toLowerCase() === who.toLowerCase()) return who || chat;
  if (!who) return chat;
  return `${who} · ${chat}`;
}
