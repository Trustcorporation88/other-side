import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { type PreservedAudio } from '@otherside/notification-capture';
import { usePreservedMedia } from '@/hooks/usePreservedMedia';
import { resolveMediaUri } from '@/lib/mediaResolver';

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

export default function FotosScreen() {
  const { items, supported, hasAccess, nativeAvailable, requestAccess, remove, clearAll } =
    usePreservedMedia('image');
  const [selected, setSelected] = useState<PreservedAudio | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);

  async function openPhoto(photo: PreservedAudio) {
    setSelected(photo);
    setViewerUri(null);
    setViewerLoading(true);
    const uri = await resolveMediaUri(photo);
    setViewerLoading(false);
    setViewerUri(uri);
  }

  function closeViewer() {
    setSelected(null);
    setViewerUri(null);
    setViewerLoading(false);
  }

  const groups = useMemo(() => {
    const startOfDay = (ts: number) => {
      const date = new Date(ts);
      date.setHours(0, 0, 0, 0);
      return date.getTime();
    };
    const momentOf = (item: PreservedAudio) => item.originalModifiedAt || item.preservedAt;
    const today = startOfDay(Date.now());
    const oneDay = 24 * 60 * 60 * 1000;
    const labelFor = (dayStart: number) => {
      if (dayStart === today) return 'Hoje';
      if (dayStart === today - oneDay) return 'Ontem';
      const date = new Date(dayStart);
      const sameYear = date.getFullYear() === new Date().getFullYear();
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        ...(sameYear ? {} : { year: 'numeric' }),
      });
    };

    const byDay = new Map<number, PreservedAudio[]>();
    for (const item of items) {
      const key = startOfDay(momentOf(item));
      const bucket = byDay.get(key);
      if (bucket) bucket.push(item);
      else byDay.set(key, [item]);
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([dayStart, dayItems]) => ({
        key: dayStart,
        label: labelFor(dayStart),
        items: dayItems.sort((a, b) => momentOf(b) - momentOf(a)),
      }));
  }, [items]);

  function confirmDelete(photo: PreservedAudio) {
    Alert.alert('Apagar foto', 'A cópia local será removida deste aparelho.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: () => {
          closeViewer();
          remove(photo.id);
        },
      },
    ]);
  }

  function confirmClear() {
    Alert.alert('Apagar todas as fotos', 'Todas as cópias locais de fotos serão removidas.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar tudo', style: 'destructive', onPress: () => clearAll() },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>OTHERSIDE</Text>
            <Text style={styles.title}>Fotos</Text>
          </View>
          {hasAccess && items.length > 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={confirmClear}
              style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}>
              <Text style={styles.clearButtonText}>Limpar</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.intro}>
          Fotos recebidas no WhatsApp são copiadas para cá assim que chegam ao aparelho — mesmo que
          sejam apagadas depois na conversa.
        </Text>

        {!nativeAvailable ? (
          <GateCard
            tone="amber"
            label="APK ANDROID NECESSÁRIO"
            title="Recurso disponível apenas no APK."
            description="A preservação de fotos usa um módulo nativo que o Expo Go não incorpora. Instale o APK do OtherSide."
          />
        ) : !supported ? (
          <GateCard
            tone="amber"
            label="ANDROID 11+ NECESSÁRIO"
            title="Seu Android ainda não é compatível."
            description="A leitura da pasta de mídia do WhatsApp exige Android 11 ou superior."
          />
        ) : !hasAccess ? (
          <GateCard
            tone="blue"
            label="ACESSO AOS ARQUIVOS"
            title="Autorize o acesso a todos os arquivos."
            description="As fotos do WhatsApp ficam numa pasta protegida. Para copiá-las antes que sumam, o OtherSide precisa da permissão “Acesso a todos os arquivos”. Nada é enviado para fora do aparelho sem você conectar um backup."
            actionLabel="Conceder acesso"
            onPress={requestAccess}
          />
        ) : items.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconGlyph}>▢</Text>
            </View>
            <Text style={styles.emptyTitle}>Nenhuma foto preservada ainda</Text>
            <Text style={styles.emptyDescription}>
              Quando uma foto chegar no WhatsApp e for baixada, a cópia aparecerá aqui, pronta para
              ver mesmo depois de apagada.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {groups.map((group) => (
              <View key={group.key} style={styles.dayGroup}>
                <Text style={styles.dayHeader}>{group.label}</Text>
                <View style={styles.grid}>
                  {group.items.map((photo) => (
                    <Pressable
                      key={photo.id}
                      accessibilityRole="imagebutton"
                      accessibilityLabel="Abrir foto"
                      onPress={() => void openPhoto(photo)}
                      style={({ pressed }) => [styles.thumb, pressed && styles.pressed]}>
                      <Image
                        source={{ uri: photo.thumbUri || photo.uri }}
                        style={styles.thumbImage}
                        resizeMode="cover"
                      />
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.privacyNote}>
          <Text style={styles.privacyLock}>◆</Text>
          <View style={styles.privacyCopy}>
            <Text style={styles.privacyTitle}>Somente neste aparelho</Text>
            <Text style={styles.privacyDescription}>
              As cópias ficam no armazenamento privado do OtherSide. O envio ao Google Drive só
              acontece se você conectar sua conta nos Ajustes.
            </Text>
          </View>
        </View>
      </ScrollView>

      <Modal visible={selected != null} transparent animationType="fade" onRequestClose={closeViewer}>
        <View style={styles.viewer}>
          <View style={styles.viewerBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar"
              onPress={closeViewer}
              style={({ pressed }) => [styles.viewerButton, pressed && styles.pressed]}>
              <Text style={styles.viewerButtonText}>✕</Text>
            </Pressable>
            {selected && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Apagar foto"
                onPress={() => confirmDelete(selected)}
                style={({ pressed }) => [styles.viewerButton, pressed && styles.pressed]}>
                <Text style={styles.viewerButtonText}>🗑</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.viewerBody}>
            {viewerLoading ? (
              <View style={styles.viewerCenter}>
                <ActivityIndicator color={colors.blueSoft} />
                <Text style={styles.viewerHint}>Baixando do Drive…</Text>
              </View>
            ) : viewerUri ? (
              <Image source={{ uri: viewerUri }} style={styles.viewerImage} resizeMode="contain" />
            ) : (
              <View style={styles.viewerCenter}>
                <Text style={styles.viewerHint}>
                  Não foi possível abrir a foto — sem cópia no aparelho nem no Drive, ou sem conexão.
                </Text>
              </View>
            )}
          </View>
          {selected && (
            <Text style={styles.viewerMeta}>
              {formatMoment(selected.originalModifiedAt || selected.preservedAt)}
            </Text>
          )}
        </View>
      </Modal>
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
  safeArea: { backgroundColor: colors.navy, flex: 1 },
  content: { paddingBottom: 38, paddingHorizontal: 22, paddingTop: 22 },
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
  title: { color: colors.white, fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  clearButton: {
    borderColor: '#2A5078',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  clearButtonText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  intro: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 24, maxWidth: 340 },
  gateCard: {
    backgroundColor: colors.surface,
    borderColor: '#1C3E63',
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  gateRow: { alignItems: 'center', flexDirection: 'row', gap: 9, marginBottom: 14 },
  gateDot: { borderRadius: 5, height: 9, width: 9 },
  gateDotAmber: { backgroundColor: colors.amber },
  gateDotBlue: { backgroundColor: colors.blue },
  gateLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  gateLabelAmber: { color: colors.amber },
  gateLabelBlue: { color: colors.blueSoft },
  gateTitle: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 26,
    maxWidth: 315,
  },
  gateDescription: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 9, maxWidth: 320 },
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
  primaryButtonText: { color: '#061329', fontSize: 15, fontWeight: '800' },
  primaryButtonArrow: { color: '#061329', fontSize: 22, fontWeight: '700' },
  pressed: { opacity: 0.74 },
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
  emptyIconGlyph: { color: colors.blueSoft, fontSize: 24, fontWeight: '700' },
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
  list: { gap: 24 },
  dayGroup: { gap: 10 },
  dayHeader: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  thumb: {
    aspectRatio: 1,
    backgroundColor: colors.navySoft,
    borderRadius: 10,
    flexBasis: '31.8%',
    overflow: 'hidden',
  },
  thumbImage: { height: '100%', width: '100%' },
  privacyNote: { alignItems: 'flex-start', flexDirection: 'row', marginTop: 26, paddingHorizontal: 4 },
  privacyLock: { color: colors.blue, fontSize: 14, marginRight: 11, marginTop: 2 },
  privacyCopy: { flex: 1 },
  privacyTitle: { color: colors.blueSoft, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  privacyDescription: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  viewer: { backgroundColor: 'rgba(3, 9, 18, 0.97)', flex: 1 },
  viewerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 10,
    paddingHorizontal: 18,
    paddingTop: 48,
  },
  viewerButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  viewerButtonText: { color: colors.white, fontSize: 20, fontWeight: '700' },
  viewerBody: { flex: 1 },
  viewerCenter: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', paddingHorizontal: 32 },
  viewerHint: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  viewerImage: { flex: 1, width: '100%' },
  viewerMeta: {
    color: colors.muted,
    fontSize: 13,
    paddingVertical: 16,
    textAlign: 'center',
  },
});
