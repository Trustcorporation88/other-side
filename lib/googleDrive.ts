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

/** Garante a pasta "OtherSide" no Drive do usuário e devolve o id dela. */
export async function ensureFolder(token: string): Promise<string | null> {
  if (cachedFolderId) return cachedFolderId;
  try {
    const query = `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const listRes = await driveFetch(
      token,
      `files?q=${encodeURIComponent(query)}&fields=files(id)&spaces=drive`,
    );
    const listData = await listRes.json();
    if (Array.isArray(listData.files) && listData.files.length > 0) {
      cachedFolderId = listData.files[0].id;
      return cachedFolderId;
    }
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

/** Cria o arquivo (metadados) e envia os bytes. Devolve o id no Drive ou null. */
export async function uploadLocalFile(
  token: string,
  params: { fileUri: string; name: string; mimeType: string; folderId: string; appId: string },
): Promise<string | null> {
  try {
    const metaRes = await driveFetch(token, 'files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: params.name,
        parents: [params.folderId],
        appProperties: { otherside: params.appId },
      }),
    });
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();
    if (!meta.id) return null;

    const uploaded = await uploadMedia(token, meta.id, params.fileUri, params.mimeType);
    return uploaded ? meta.id : null;
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
