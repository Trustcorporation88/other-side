/** Arquivo já criado pelo app no Drive. Campos usados para não enviar de novo. */
export type RemoteFile = {
  id: string;
  name: string;
  appId?: string;
  parents: string[];
  isFolder: boolean;
  size: number | null;
  md5: string | null;
  createdTime: string | null;
};

export type FolderCandidate = {
  id: string;
  createdTime: string | null;
};

/**
 * Chave estável de um arquivo já enviado: nome + tamanho.
 * A data de modificação fica de fora. O WhatsApp regrava o mesmo
 * áudio (mesmo nome e mesmo tamanho) e o lastModified muda.
 */
export function ledgerKey(name: string, size: number): string {
  return `ns:${name}:${size}`;
}

export function indexByNameAndSize(files: readonly RemoteFile[]): Map<string, RemoteFile[]> {
  const index = new Map<string, RemoteFile[]>();
  for (const file of files) {
    if (file.isFolder || file.size == null || !Number.isFinite(file.size) || file.size <= 0) continue;
    const key = ledgerKey(file.name, file.size);
    const list = index.get(key);
    if (list) list.push(file);
    else index.set(key, [file]);
  }
  return index;
}

/** Procura uma cópia já existente (mesmo nome e tamanho). Prefere a pasta de destino. */
export function findExistingUpload(
  index: ReadonlyMap<string, readonly RemoteFile[]>,
  name: string,
  size: number,
  preferredFolderId?: string,
): RemoteFile | null {
  if (!name || !Number.isFinite(size) || size <= 0) return null;
  const matches = index.get(ledgerKey(name, size));
  if (!matches || matches.length === 0) return null;
  if (preferredFolderId) {
    const preferred = matches.find((file) => file.parents.includes(preferredFolderId));
    if (preferred) return preferred;
  }
  return matches[0] ?? null;
}

/**
 * Entre pastas com o mesmo nome, fica com a que já tem mais arquivos.
 * Empate: a mais antiga, para a escolha não mudar a cada sincronização.
 */
export function chooseFullestFolder(
  candidates: readonly FolderCandidate[],
  childCounts: ReadonlyMap<string, number>,
): FolderCandidate | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((left, right) => {
    const byCount = (childCounts.get(right.id) ?? 0) - (childCounts.get(left.id) ?? 0);
    if (byCount !== 0) return byCount;
    const leftTime = left.createdTime ?? '';
    const rightTime = right.createdTime ?? '';
    if (leftTime !== rightTime) return leftTime < rightTime ? -1 : 1;
    return left.id < right.id ? -1 : 1;
  })[0];
}

export function childCounts(files: readonly RemoteFile[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const file of files) {
    for (const parent of file.parents) {
      counts.set(parent, (counts.get(parent) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Só move para a pasta do mês o que ainda está solto na raiz do OtherSide.
 * Arquivo que já está numa pasta AAAA-MM, ou em Fotos, não é mexido —
 * senão a pasta do mês muda de data a cada sincronização.
 */
export function shouldMoveIntoMonthFolder(
  file: { isFolder: boolean; parents: readonly string[] },
  rootFolderId: string,
  monthFolderIds: ReadonlySet<string>,
  fotosFolderIds: ReadonlySet<string>,
): boolean {
  if (file.isFolder || !rootFolderId) return false;
  if (file.parents.length === 0) return false;
  if (file.parents.some((parent) => monthFolderIds.has(parent))) return false;
  if (file.parents.some((parent) => fotosFolderIds.has(parent))) return false;
  return file.parents.includes(rootFolderId);
}

/**
 * mensagens.json só é reescrito quando o conteúdo mudou.
 * Com MD5 dos dois lados, compara o hash. Sem hash, o tamanho igual
 * evita regravar o arquivo (e a pasta) em toda sincronização.
 */
export function messagesNeedUpdate(
  local: { size: number; md5: string | null },
  remote: { size: number | null; md5: string | null } | null,
): boolean {
  if (!remote) return true;
  if (local.md5 && remote.md5) return local.md5.toLowerCase() !== remote.md5.toLowerCase();
  if (remote.size != null && remote.size === local.size) return false;
  return true;
}

/** Fica no arquivo já registrado. Se ele sumiu, usa o mais antigo que ainda existe. */
export function findMessagesFile(
  files: readonly RemoteFile[],
  rootFolderId: string,
  recordedId?: string,
): RemoteFile | null {
  if (recordedId) {
    const recorded = files.find((file) => file.id === recordedId && !file.isFolder);
    if (recorded) return recorded;
  }
  const matches = files.filter((file) => !file.isFolder && file.name === 'mensagens.json');
  const inRoot = matches.filter((file) => file.parents.includes(rootFolderId));
  const pool = inRoot.length > 0 ? inRoot : matches;
  const chosen = chooseFullestFolder(
    pool.map((file) => ({ id: file.id, createdTime: file.createdTime })),
    new Map(),
  );
  if (!chosen) return null;
  return pool.find((file) => file.id === chosen.id) ?? null;
}
