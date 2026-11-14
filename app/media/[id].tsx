import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { File } from 'expo-file-system';

import {
  deletePreservedAudio,
  getPreservedAudios,
  openContentUri,
  type PreservedAudio,
} from '@otherside/notification-capture';
import { refreshMessageMedia, useMessageMedia } from '@/hooks/useMessageMedia';
import { type DriveFailure } from '@/lib/mediaCache';
import { senderLabel } from '@/lib/messageMedia';
import { discardFailedCopy, resolveMedia, type MediaResolution } from '@/lib/mediaResolver';
import { documentMimeType } from '@/lib/recentDocuments';
import { whatsappAccountLabel } from '@/lib/whatsappAccount';

const colors = {
  navy: '#071527',
  navySoft: '#0D2038',
  surface: '#102944',
  blue: '#4F8CFF',
  blueSoft: '#9BBEFF',
  white: '#F4F7FB',
  muted: '#A8B8CA',
  amber: '#F1B65B',
  green: '#67E3A3',
};

const TITLES: Record<string, string> = {
  image: 'Foto',
  audio: 'Áudio',
  document: 'Documento',
};

function formatMoment(timestamp: number): string {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

type LoadState = 'loading' | 'ready' | 'missing';

const KIND_NOUN: Record<string, string> = { image: 'A foto', audio: 'O áudio', document: 'O documento' };

function failureMessage(reason: DriveFailure, detail: string, kind: string, localBroken: boolean): string {
  const noun = KIND_NOUN[kind] ?? 'O arquivo';
  const lead = localBroken
    ? `A cópia neste aparelho está danificada.`
    : `${noun} inteir${kind === 'image' ? 'a' : 'o'} não está mais neste aparelho.`;
  if (reason === 'not_uploaded') return `${lead} Ainda não foi enviad${kind === 'image' ? 'a' : 'o'} ao Google Drive.`;
  if (reason === 'drive_auth') return `${lead} Não foi possível entrar no Google Drive — confira a conta em Ajustes.`;
  if (reason === 'offline') return `${lead} Sem conexão para baixar do Google Drive.`;
  return `${lead} O Google Drive respondeu com erro${detail ? ` (${detail})` : ''}.`;
}

function openDocument(uri: string, fileName: string): boolean {
  try {
    return openContentUri(new File(uri).contentUri, documentMimeType(fileName));
  } catch {
    return false;
  }
}

export default function MediaScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { loaded, preservedById, mediaById, senderByMedia } = useMessageMedia();

  const item = useMemo<PreservedAudio | null>(() => {
    if (!id) return null;
    // Foto que acabou de chegar pode abrir pela aba Fotos antes do recálculo das ligações.
    const preserved = preservedById.get(id) ?? getPreservedAudios().find((entry) => entry.id === id);
    if (preserved) return preserved;
    const linked = mediaById.get(id);
    if (!linked) return null;
    // Já saiu do índice do aparelho: o resolvedor procura no cache e no Drive.
    return {
      id: linked.id,
      fileName: linked.fileName,
      localPath: '',
      uri: '',
      thumbUri: '',
      sizeBytes: linked.sizeBytes,
      sourcePackage: linked.sourcePackage ?? '',
      origin: linked.origin === 'sent' ? 'sent' : 'received',
      originalModifiedAt: linked.moment,
      preservedAt: linked.moment,
      kind: linked.kind === 'image' || linked.kind === 'document' ? linked.kind : 'audio',
    };
  }, [id, preservedById, mediaById]);
  const sender = id ? senderByMedia.get(id) : undefined;

  const itemKey = item ? `${item.id}|${item.uri}` : '';
  const [skip, setSkip] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const loadKey = `${itemKey}#${attempt}#${skip.join('|')}`;
  const [result, setResult] = useState<{ key: string; resolution: MediaResolution; openFailed: boolean } | null>(
    null,
  );
  const current = result?.key === loadKey ? result : null;
  const state: LoadState = !current ? 'loading' : current.resolution.uri ? 'ready' : 'missing';
  const uri = current?.resolution.uri ?? null;

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    const key = loadKey;
    void resolveMedia(item, skip).then((resolution) => {
      if (cancelled) return;
      // Documento abre no app do Android assim que chega; depois, pelo botão.
      const openFailed =
        item.kind === 'document' && resolution.uri ? !openDocument(resolution.uri, item.fileName) : false;
      setResult({ key, resolution, openFailed });
    });
    return () => {
      cancelled = true;
    };
    // Recarrega só quando muda o arquivo ou a tentativa, não a cada recálculo das ligações.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey]);

  function onImageError() {
    if (!item || !uri) return;
    // A cópia que não abre sai da lista; a próxima tentativa vai à fonte seguinte.
    const failed = discardFailedCopy(item, uri);
    setSkip((previous) => [...previous, ...failed]);
  }

  function retry() {
    setSkip([]);
    setAttempt((value) => value + 1);
  }

  const resolution = current?.resolution;
  const failureText =
    resolution && resolution.uri === null && item
      ? failureMessage(resolution.reason, resolution.detail, item.kind, skip.length > 0)
      : '';

  const canDelete = item != null && item.kind === 'image' && item.localPath !== '';

  function confirmDelete() {
    if (!item) return;
    Alert.alert('Apagar foto', 'A cópia local será removida deste aparelho.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: () => {
          deletePreservedAudio(item.id);
          refreshMessageMedia();
          router.back();
        },
      },
    ]);
  }

  const title = item ? TITLES[item.kind] ?? 'Mídia' : 'Mídia';

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <StatusBar style="light" />
      <Stack.Screen
        options={{
          title,
          headerRight: canDelete
            ? () => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Apagar foto"
                  onPress={confirmDelete}
                  style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
                  <Text style={styles.headerButtonText}>🗑</Text>
                </Pressable>
              )
            : undefined,
        }}
      />

      <View style={styles.senderCard}>
        <Text style={styles.senderEyebrow}>
          {item?.origin === 'sent' ? 'ENVIADO' : 'RECEBIDO DE'}
          {sender ? ` · ${whatsappAccountLabel(sender.packageName).toUpperCase()}` : ''}
        </Text>
        <Text style={styles.senderName} numberOfLines={2}>
          {sender ? senderLabel(sender) : 'Remetente desconhecido'}
        </Text>
        <Text style={styles.senderMeta} numberOfLines={1}>
          {formatMoment(sender?.receivedAt || item?.originalModifiedAt || 0)}
          {item ? ` · ${item.fileName}` : ''}
        </Text>
      </View>

      <View style={styles.body}>
        {!item && !loaded ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.blueSoft} />
          </View>
        ) : !item ? (
          <Centered text="Esta mídia não está mais no aparelho nem ligada a uma cópia no Drive." />
        ) : state === 'loading' ? (
          <View style={styles.center}>
            {item.kind === 'image' && item.thumbUri ? (
              <Image source={{ uri: item.thumbUri }} style={styles.preview} resizeMode="contain" blurRadius={2} />
            ) : null}
            <ActivityIndicator color={colors.blueSoft} />
            <Text style={styles.hint}>Abrindo… (pode baixar do Drive)</Text>
          </View>
        ) : state === 'missing' || !uri ? (
          <View style={styles.center}>
            {item.kind === 'image' && item.thumbUri ? (
              <Image source={{ uri: item.thumbUri }} style={styles.thumbFallback} resizeMode="contain" />
            ) : null}
            <Text style={styles.hint}>{failureText}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={retry}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              <Text style={styles.primaryButtonText}>Tentar de novo</Text>
              <Text style={styles.primaryButtonText}>↻</Text>
            </Pressable>
          </View>
        ) : item.kind === 'image' ? (
          <Image
            key={uri}
            source={{ uri }}
            style={styles.image}
            resizeMode="contain"
            onError={onImageError}
          />
        ) : item.kind === 'audio' ? (
          <AudioPanel uri={uri} />
        ) : (
          <DocumentPanel uri={uri} fileName={item.fileName} initialFailed={current?.openFailed ?? false} />
        )}
      </View>
    </SafeAreaView>
  );
}

function Centered({ text }: { text: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.hint}>{text}</Text>
    </View>
  );
}

function AudioPanel({ uri }: { uri: string }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    player.play();
  }, [player]);

  useEffect(() => {
    if (status.didJustFinish) {
      player.seekTo(0);
      player.pause();
    }
  }, [status.didJustFinish, player]);

  function toggle() {
    if (status.playing) {
      player.pause();
      return;
    }
    if (status.duration > 0 && status.currentTime >= status.duration) player.seekTo(0);
    player.play();
  }

  return (
    <View style={styles.center}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pausar áudio' : 'Reproduzir áudio'}
        onPress={toggle}
        style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}>
        <Text style={styles.playGlyph}>{status.playing ? '❚❚' : '▶'}</Text>
      </Pressable>
      <Text style={styles.progress}>
        {formatDuration(status.currentTime)}
        {status.duration > 0 ? ` / ${formatDuration(status.duration)}` : ''}
      </Text>
    </View>
  );
}

function DocumentPanel({ uri, fileName, initialFailed }: { uri: string; fileName: string; initialFailed: boolean }) {
  const [failed, setFailed] = useState(initialFailed);

  return (
    <View style={styles.center}>
      <Text style={styles.docName} numberOfLines={3}>
        {fileName}
      </Text>
      {failed && (
        <Text style={styles.hint}>O Android não encontrou um aplicativo para abrir este tipo de arquivo.</Text>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={() => setFailed(!openDocument(uri, fileName))}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
        <Text style={styles.primaryButtonText}>Abrir documento</Text>
        <Text style={styles.primaryButtonText}>↗</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.navy, flex: 1 },
  senderCard: {
    backgroundColor: colors.surface,
    borderColor: '#1C3E63',
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 18,
    marginTop: 12,
    padding: 16,
  },
  senderEyebrow: { color: colors.blueSoft, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  senderName: { color: colors.white, fontSize: 19, fontWeight: '700', marginTop: 6 },
  senderMeta: { color: colors.muted, fontSize: 12, marginTop: 6 },
  body: { flex: 1, paddingBottom: 12, paddingTop: 12 },
  center: { alignItems: 'center', flex: 1, gap: 16, justifyContent: 'center', paddingHorizontal: 32 },
  hint: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  preview: { height: 220, opacity: 0.5, width: '100%' },
  thumbFallback: { height: 260, width: '100%' },
  image: { flex: 1, width: '100%' },
  playButton: {
    alignItems: 'center',
    backgroundColor: colors.blue,
    borderRadius: 44,
    height: 88,
    justifyContent: 'center',
    width: 88,
  },
  playGlyph: { color: '#061329', fontSize: 28, fontWeight: '800' },
  progress: { color: colors.green, fontSize: 16, fontWeight: '700' },
  docName: { color: colors.white, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  primaryButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.blue,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 17,
  },
  primaryButtonText: { color: '#061329', fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.74 },
  headerButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  headerButtonText: { color: colors.white, fontSize: 18 },
});
