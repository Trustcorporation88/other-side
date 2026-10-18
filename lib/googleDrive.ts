import {
  GoogleSignin,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';
import { File, UploadType } from 'expo-file-system';

// Cliente Web do projeto dedicado "OtherSide" (otherside-511422). Não é segredo.
const WEB_CLIENT_ID = '974275004454-ui0ik865ino52nhn1ehv1lpm1rk81mc1.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = 'OtherSide';

let configured = false;

export function configureGoogleDrive(): void {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    scopes: [DRIVE_SCOPE],
    offlineAccess: false,
  });
  configured = true;
}

export async function connectDrive(): Promise<boolean> {
  configureGoogleDrive();
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  return isSuccessResponse(response);
}

export async function disconnectDrive(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch (_error) {
    // best effort
  }
  cachedFolderId = null;
}

export function isDriveConnected(): boolean {
  try {
    return GoogleSignin.getCurrentUser() != null;
  } catch (_error) {
    return false;
  }
}

export function connectedEmail(): string | null {
  try {
    return GoogleSignin.getCurrentUser()?.user?.email ?? null;
  } catch (_error) {
    return null;
  }
}

/** Token de acesso válido, renovando a sessão silenciosamente quando possível. */
export async function getAccessToken(): Promise<string | null> {
  configureGoogleDrive();
  try {
    if (GoogleSignin.getCurrentUser() == null && GoogleSignin.hasPreviousSignIn()) {
      const silent = await GoogleSignin.signInSilently();
      if (silent.type !== 'success') return null;
    }
    if (GoogleSignin.getCurrentUser() == null) return null;
    const { accessToken } = await GoogleSignin.getTokens();
    return accessToken ?? null;
  } catch (_error) {
    return null;
  }
}

function driveFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
}

let cachedFolderId: string | null = null;

type ListedFolder = { id: string; createdTime: string | null };

/** A mais antiga, para duas pastas com o mesmo nome não alternarem a cada sync. */
function oldestFolder(folders: ListedFolder[]): ListedFolder | null {
  if (folders.length === 0) return null;
  return [...folders].sort((left, right) => {
    const leftTime = left.createdTime ?? '';
    const rightTime = right.createdTime ?? '';
    if (leftTime !== rightTime) return leftTime < rightTime ? -1 : 1;
    return left.id < right.id ? -1 : 1;
  })[0];
}

async function findFolders(token: string, query: string): Promise<ListedFolder[] | null> {
  const fields = 'files(id,createdTime)';
  const ordered = await driveFetch(
    token,
    `files?q=${encodeURIComponent(query)}&orderBy=createdTime&fields=${fields}&spaces=drive&pageSize=100`,
  );
  const response = ordered.ok
    ? ordered
    : await driveFetch(
        token,
        `files?q=${encodeURIComponent(query)}&fields=${fields}&spaces=drive&pageSize=100`,
      );
  if (!response.ok) return null;
  const data = await response.json();
  if (!Array.isArray(data.files)) return [];
  return data.files
    .filter((file: { id?: string }) => Boolean(file.id))
    .map((file: { id: string; createdTime?: string }) => ({
      id: file.id,
      createdTime: typeof file.createdTime === 'string' ? file.createdTime : null,
    }));
}

/** Garante a pasta "OtherSide" no Drive do usuário e devolve o id dela. */
export async function ensureFolder(token: string): Promise<string | null> {
  if (cachedFolderId) return cachedFolderId;
  try {
    const query = `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const existing = await findFolders(token, query);
    const chosen = existing ? oldestFolder(existing) : null;
    if (chosen) {
      cachedFolderId = chosen.id;
      return cachedFolderId;
    }
    if (existing == null) return null;
    const createRes = await driveFetch(token, 'files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    });
    const created = await createRes.json();
    cachedFolderId = created.id ?? null;
    return cachedFolderId;
  } catch (_error) {
    return null;
  }
}

export type DriveFileInfo = {
  id: string;
  name: string;
  appId?: string;
  parents: string[];
  isFolder: boolean;
  size: number | null;
  md5: string | null;
  createdTime: string | null;
};

export type DriveFileList = {
  files: DriveFileInfo[];
  /** false quando a listagem parou no meio (rede, token). Não dá para concluir que um arquivo sumiu. */
  complete: boolean;
};

function asSize(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Lista todos os arquivos que o app criou no Drive (o escopo drive.file só enxerga os dele). */
export async function listAppFiles(token: string): Promise<DriveFileList> {
  const files: DriveFileInfo[] = [];
  let pageToken: string | undefined;
  try {
    do {
      const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
      const res = await driveFetch(
        token,
        `files?q=${encodeURIComponent('trashed=false')}&fields=nextPageToken,files(id,name,appProperties,parents,mimeType,size,md5Checksum,createdTime)&spaces=drive&pageSize=1000${pageParam}`,
      );
      if (!res.ok) return { files, complete: false };
      const data = await res.json();
      for (const file of data.files ?? []) {
        if (!file.id) continue;
        files.push({
          id: file.id,
          name: file.name ?? '',
          appId: file?.appProperties?.otherside,
          parents: file.parents ?? [],
          isFolder: file.mimeType === 'application/vnd.google-apps.folder',
          size: asSize(file.size),
          md5: typeof file.md5Checksum === 'string' ? file.md5Checksum : null,
          createdTime: typeof file.createdTime === 'string' ? file.createdTime : null,
        });
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
    return { files, complete: true };
  } catch (_error) {
    return { files, complete: false };
  }
}

const subFolderCache: Record<string, string> = {};

/** Garante uma subpasta (ex.: "2025-09") dentro de outra pasta e devolve o id. */
export async function ensureSubFolder(
  token: string,
  parentId: string,
  name: string,
): Promise<string | null> {
  const cacheKey = `${parentId}/${name}`;
  if (subFolderCache[cacheKey]) return subFolderCache[cacheKey];
  try {
    const query = `name='${name.replaceAll("'", "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const existing = await findFolders(token, query);
    const chosen = existing ? oldestFolder(existing) : null;
    if (chosen) {
      subFolderCache[cacheKey] = chosen.id;
      return chosen.id;
    }
    if (existing == null) return null;
    const createRes = await driveFetch(token, 'files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      }),
    });
    const created = await createRes.json();
    if (!created.id) return null;
    subFolderCache[cacheKey] = created.id;
    return created.id;
  } catch (_error) {
    return null;
  }
}

/** Move um arquivo para outra pasta e, se informado, carimba a data de modificação. */
export async function moveFileToFolder(
  token: string,
  fileId: string,
  addParent: string,
  removeParent?: string,
  modifiedTime?: string,
): Promise<boolean> {
  try {
    const remove = removeParent ? `&removeParents=${encodeURIComponent(removeParent)}` : '';
    const res = await driveFetch(
      token,
      `files/${fileId}?addParents=${encodeURIComponent(addParent)}${remove}&fields=id`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modifiedTime ? { modifiedTime } : {}),
      },
    );
    return res.ok;
  } catch (_error) {
    return false;
  }
}

/**
 * Manda para a lixeira só um arquivo incompleto que esta tentativa acabou de criar.
 * Cópias que já estavam no Drive não são apagadas daqui.
 */
export async function trashFile(token: string, fileId: string): Promise<void> {
  try {
    await driveFetch(token, `files/${fileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    });
  } catch (_error) {
    // best effort
  }
}

/** Cria o arquivo (metadados) e envia os bytes. Carimba a data original. Devolve o id ou null. */
export async function uploadLocalFile(
  token: string,
  params: {
    fileUri: string;
    name: string;
    mimeType: string;
    folderId: string;
    appId: string;
    modifiedTime?: string;
  },
): Promise<string | null> {
  try {
    const metadata: Record<string, unknown> = {
      name: params.name,
      parents: [params.folderId],
      appProperties: { otherside: params.appId },
    };
    if (params.modifiedTime) metadata.modifiedTime = params.modifiedTime;

    const metaRes = await driveFetch(token, 'files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    });
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();
    if (!meta.id) return null;

    const uploaded = await uploadMedia(token, meta.id, params.fileUri, params.mimeType);
    if (!uploaded) {
      // O metadado vazio já nasceu no Drive. Sem isso, a próxima tentativa cria outro arquivo.
      await trashFile(token, meta.id);
      return null;
    }

    // O envio de mídia pode redefinir a data; carimba de novo para ficar a data original.
    if (params.modifiedTime) {
      await driveFetch(token, `files/${meta.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modifiedTime: params.modifiedTime }),
      });
    }
    return meta.id;
  } catch (_error) {
    return null;
  }
}

/** Substitui o conteúdo de um arquivo já existente no Drive. */
export async function uploadMedia(
  token: string,
  fileId: string,
  fileUri: string,
  mimeType: string,
): Promise<boolean> {
  try {
    const file = new File(fileUri);
    const result = await file.upload(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        httpMethod: 'PATCH',
        uploadType: UploadType.BINARY_CONTENT,
        headers: { Authorization: `Bearer ${token}` },
        mimeType,
      },
    );
    return result.status >= 200 && result.status < 300;
  } catch (_error) {
    return false;
  }
}
