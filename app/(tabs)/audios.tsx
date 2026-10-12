import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { getPreservedAudioUri, type PreservedAudio } from '@otherside/notification-capture';
import { usePreservedAudio } from '@/hooks/usePreservedAudio';

const colors = {
  navy: '#071527',
  navySoft: '#0D2038',
  surface: '#102944',
  surfaceRaised: '#163453',
  blue: '#4F8CFF',
  blueSoft: '#9BBEFF',
  white: '#F4F7FB',
  muted: '#A8B8CA',
  amber: '#F1B65B',
  green: '#67E3A3',
};

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatMoment(timestamp: number): string {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function originLabel(origin: PreservedAudio['origin']): string {
  if (origin === 'sent') return 'Áudio enviado';
  if (origin === 'received') return 'Áudio recebido';
  return 'Áudio';
}

export default function AudiosScreen() {
  const { audios, supported, hasAccess, nativeAvailable, requestAccess, removeAudio, clearAll } =
    usePreservedAudio();

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (status.didJustFinish) {
      player.seekTo(0);
      player.pause();
    }
  }, [status.didJustFinish, player]);

  function togglePlay(audio: PreservedAudio) {
    if (activeId === audio.id) {
      if (status.playing) {
        player.pause();
      } else {
        if (status.currentTime > 0 && status.duration > 0 && status.currentTime >= status.duration) {
          player.seekTo(0);
        }
        player.play();
      }
      return;
    }

    const uri = getPreservedAudioUri(audio.id) ?? audio.uri;
    if (!uri) {
      Alert.alert('Áudio indisponível', 'A cópia local deste áudio não foi encontrada.');
      return;
    }

    player.replace({ uri });
    setActiveId(audio.id);
    player.play();
  }

  function confirmDelete(audio: PreservedAudio) {
    Alert.alert(
      'Apagar áudio',
      'A cópia local será apagada deste aparelho. Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: () => {
            if (activeId === audio.id) {
              player.pause();
              setActiveId(null);
            }
            removeAudio(audio.id);
          },
        },
      ],
    );
  }

  function confirmClear() {
    Alert.alert('Apagar todos os áudios', 'Todas as cópias locais serão removidas deste aparelho.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar tudo',
        style: 'destructive',
        onPress: () => {
          player.pause();
          setActiveId(null);
          clearAll();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>OTHERSIDE</Text>
            <Text style={styles.title}>Áudios</Text>
          </View>
          {hasAccess && audios.length > 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={confirmClear}
              style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}>
              <Text style={styles.clearButtonText}>Limpar</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.intro}>
          Notas de voz e áudios do WhatsApp são copiados para cá assim que chegam ao aparelho — mesmo
          que sejam apagados depois na conversa.
        </Text>

        {!nativeAvailable ? (
          <GateCard
            tone="amber"
            label="APK ANDROID NECESSÁRIO"
            title="Recurso disponível apenas no APK."
            description="A preservação de áudio usa um módulo nativo que o Expo Go não incorpora. Instale o APK do OtherSide para ativá-la."
          />
        ) : !supported ? (
          <GateCard
            tone="amber"
            label="ANDROID 11+ NECESSÁRIO"
            title="Seu Android ainda não é compatível."
            description="A leitura da pasta de mídia do WhatsApp exige Android 11 ou superior. Em versões anteriores, o OtherSide não consegue acessar os arquivos de áudio."
          />
        ) : !hasAccess ? (
          <GateCard
            tone="blue"
            label="ACESSO AOS ARQUIVOS"
            title="Autorize o acesso a todos os arquivos."
            description="O Android guarda os áudios do WhatsApp numa pasta protegida. Para copiá-los antes que sumam, o OtherSide precisa da permissão “Acesso a todos os arquivos”. Nada é enviado para fora do aparelho."
            actionLabel="Conceder acesso"
            onPress={requestAccess}
          />
        ) : audios.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconGlyph}>♪</Text>
            </View>
            <Text style={styles.emptyTitle}>Nenhum áudio preservado ainda</Text>
            <Text style={styles.emptyDescription}>
              Quando uma nota de voz chegar no WhatsApp e for baixada, a cópia aparecerá aqui,
              pronta para ouvir mesmo depois de apagada.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {audios.map((audio) => {
              const isActive = activeId === audio.id;
              const isPlaying = isActive && status.playing;
              return (
                <View key={audio.id} style={[styles.card, isActive && styles.cardActive]}>
                  <View style={styles.cardRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={isPlaying ? 'Pausar áudio' : 'Reproduzir áudio'}
                      onPress={() => togglePlay(audio)}
                      style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}>
                      <Text style={styles.playGlyph}>{isPlaying ? '❚❚' : '▶'}</Text>
                    </Pressable>
                    <View style={styles.cardCopy}>
                      <Text style={styles.cardTitle}>{originLabel(audio.origin)}</Text>
                      <Text style={styles.cardMeta}>
                        {formatMoment(audio.originalModifiedAt || audio.preservedAt)} ·{' '}
                        {formatSize(audio.sizeBytes)}
                      </Text>
                      {isActive && (
                        <Text style={styles.cardProgress}>
                          {formatDuration(status.currentTime)}
                          {status.duration > 0 ? ` / ${formatDuration(status.duration)}` : ''}
                        </Text>
                      )}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Apagar áudio"
                      onPress={() => confirmDelete(audio)}
                      style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
                      <Text style={styles.deleteGlyph}>✕</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.cardFile} numberOfLines={1}>
                    {audio.fileName}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.privacyNote}>
          <Text style={styles.privacyLock}>◆</Text>
          <View style={styles.privacyCopy}>
            <Text style={styles.privacyTitle}>Somente neste aparelho</Text>
            <Text style={styles.privacyDescription}>
              As cópias ficam no armazenamento privado do OtherSide. Não há conta, servidor nem envio
              automático para qualquer lugar.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function GateCard({
  tone,
  label,
  title,
  description,
  actionLabel,
  onPress,
}: {
  tone: 'amber' | 'blue';
  label: string;
  title: string;
  description: string;
  actionLabel?: string;
  onPress?: () => void;
}) {
  return (
    <View style={styles.gateCard}>
      <View style={styles.gateRow}>
        <View style={[styles.gateDot, tone === 'blue' ? styles.gateDotBlue : styles.gateDotAmber]} />
        <Text style={[styles.gateLabel, tone === 'blue' ? styles.gateLabelBlue : styles.gateLabelAmber]}>
          {label}
        </Text>
      </View>
      <Text style={styles.gateTitle}>{title}</Text>
      <Text style={styles.gateDescription}>{description}</Text>
      {actionLabel && onPress && (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonText}>{actionLabel}</Text>
          <Text style={styles.primaryButtonArrow}>↗</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.navy,
    flex: 1,
  },
  content: {
    paddingBottom: 38,
    paddingHorizontal: 22,
    paddingTop: 22,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  eyebrow: {
    color: colors.blueSoft,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.4,
    marginBottom: 7,
  },
  title: {
    color: colors.white,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
  },
  clearButton: {
    borderColor: '#2A5078',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  clearButtonText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  intro: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 24,
    maxWidth: 340,
  },
  gateCard: {
    backgroundColor: colors.surface,
    borderColor: '#1C3E63',
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  gateRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    marginBottom: 14,
  },
  gateDot: {
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  gateDotAmber: {
    backgroundColor: colors.amber,
  },
  gateDotBlue: {
    backgroundColor: colors.blue,
  },
  gateLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  gateLabelAmber: {
    color: colors.amber,
  },
  gateLabelBlue: {
    color: colors.blueSoft,
  },
  gateTitle: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 26,
    maxWidth: 315,
  },
  gateDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 9,
    maxWidth: 320,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.blue,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    minHeight: 52,
    paddingHorizontal: 17,
  },
  primaryButtonText: {
    color: '#061329',
    fontSize: 15,
    fontWeight: '800',
  },
  primaryButtonArrow: {
    color: '#061329',
    fontSize: 22,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.74,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: colors.navySoft,
    borderColor: '#173555',
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 230,
    padding: 26,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: '#2A5078',
    borderRadius: 16,
    borderWidth: 1,
    height: 60,
    justifyContent: 'center',
    marginBottom: 18,
    width: 60,
  },
  emptyIconGlyph: {
    color: colors.blueSoft,
    fontSize: 26,
    fontWeight: '700',
  },
  emptyTitle: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDescription: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    maxWidth: 290,
    textAlign: 'center',
  },
  list: {
    gap: 12,
  },
  card: {
    backgroundColor: colors.navySoft,
    borderColor: '#1D4166',
    borderRadius: 17,
    borderWidth: 1,
    padding: 15,
  },
  cardActive: {
    borderColor: colors.blue,
  },
  cardRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  playButton: {
    alignItems: 'center',
    backgroundColor: colors.blue,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    marginRight: 14,
    width: 48,
  },
  playGlyph: {
    color: '#061329',
    fontSize: 16,
    fontWeight: '800',
  },
  cardCopy: {
    flex: 1,
  },
  cardTitle: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  cardMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  cardProgress: {
    color: colors.green,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  deleteButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    marginLeft: 8,
    width: 36,
  },
  deleteGlyph: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: '700',
  },
  cardFile: {
    color: '#6F849C',
    fontSize: 11,
    marginTop: 12,
  },
  privacyNote: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    marginTop: 26,
    paddingHorizontal: 4,
  },
  privacyLock: {
    color: colors.blue,
    fontSize: 14,
    marginRight: 11,
    marginTop: 2,
  },
  privacyCopy: {
    flex: 1,
  },
  privacyTitle: {
    color: colors.blueSoft,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  privacyDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
});
