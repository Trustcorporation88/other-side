import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { File } from 'expo-file-system';

import { openContentUri, type PreservedAudio } from '@otherside/notification-capture';
import { useMessageMedia } from '@/hooks/useMessageMedia';
import { senderLabel } from '@/lib/messageMedia';
import { resolveMediaUri } from '@/lib/mediaResolver';
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

function openDocument(uri: string, fileName: string): boolean {
  try {
    return openContentUri(new File(uri).contentUri, documentMimeType(fileName));
  } catch {
    return false;
  }
}

export default function MediaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { loaded, preservedById, mediaById, senderByMedia } = useMessageMedia();

  const item = useMemo<PreservedAudio | null>(() => {
    if (!id) return null;
    const preserved = preservedById.get(id);
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
  const [result, setResult] = useState<{ key: string; uri: string | null; openFailed: boolean } | null>(null);
  const current = result?.key === itemKey ? result : null;
  const state: LoadState = !current ? 'loading' : current.uri ? 'ready' : 'missing';
  const uri = current?.uri ?? null;

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    const key = itemKey;
    void resolveMediaUri(item).then((resolved) => {
      if (cancelled) return;
      // Documento abre no app do Android assim que chega; depois, pelo botão.
      const openFailed = item.kind === 'document' && resolved ? !openDocument(resolved, item.fileName) : false;
      setResult({ key, uri: resolved, openFailed });
    });
    return () => {
      cancelled = true;
    };
    // Recarrega só quando muda o arquivo, não a cada recálculo das ligações.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey]);

  const title = item ? TITLES[item.kind] ?? 'Mídia' : 'Mídia';

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <StatusBar style="light" />
      <Stack.Screen options={{ title }} />

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
          <Centered text="Não foi possível abrir — sem cópia no aparelho nem no Drive, ou sem conexão." />
        ) : item.kind === 'image' ? (
          <Image source={{ uri }} style={styles.image} resizeMode="contain" />
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
});
