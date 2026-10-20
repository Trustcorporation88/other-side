import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const FILE_NAME = 'backup-settings.json';

export type BackupSettings = {
  /** Fotos e vídeos de DCIM/Camera sobem para OtherSide/Galeria/AAAA-MM. */
  galleryEnabled: boolean;
  /** Inclui também as imagens/vídeos visíveis do WhatsApp no backup da galeria. */
  includeWhatsAppImages: boolean;
  /** O backup da galeria espera Wi-Fi. Áudios e mensagens não usam esta trava. */
  wifiOnly: boolean;
  /** O backup da galeria espera o aparelho carregando. */
  requireCharging: boolean;
  /**
   * Liberar espaço: mantém só as 100 fotos mais recentes da câmera no celular e apaga do
   * aparelho as mais antigas JÁ confirmadas no Drive. Desligado por padrão (é destrutivo).
   */
  offloadCameraEnabled: boolean;
};

export const defaultBackupSettings: BackupSettings = {
  galleryEnabled: true,
  includeWhatsAppImages: false,
  wifiOnly: true,
  requireCharging: false,
  offloadCameraEnabled: false,
};

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function readBackupSettings(): BackupSettings {
  if (Platform.OS === 'web') return { ...defaultBackupSettings };
  try {
    const file = new File(Paths.document, FILE_NAME);
    if (!file.exists) return { ...defaultBackupSettings };
    const parsed = JSON.parse(file.textSync()) as Partial<BackupSettings>;
    return {
      galleryEnabled: asBoolean(parsed.galleryEnabled, defaultBackupSettings.galleryEnabled),
      includeWhatsAppImages: asBoolean(
        parsed.includeWhatsAppImages,
        defaultBackupSettings.includeWhatsAppImages,
      ),
      wifiOnly: asBoolean(parsed.wifiOnly, defaultBackupSettings.wifiOnly),
      requireCharging: asBoolean(parsed.requireCharging, defaultBackupSettings.requireCharging),
      offloadCameraEnabled: asBoolean(
        parsed.offloadCameraEnabled,
        defaultBackupSettings.offloadCameraEnabled,
      ),
    };
  } catch (_error) {
    return { ...defaultBackupSettings };
  }
}

export function writeBackupSettings(settings: BackupSettings): void {
  if (Platform.OS === 'web') return;
  try {
    const file = new File(Paths.document, FILE_NAME);
    if (!file.exists) file.create();
    file.write(JSON.stringify(settings));
  } catch (_error) {
    // best effort
  }
}
