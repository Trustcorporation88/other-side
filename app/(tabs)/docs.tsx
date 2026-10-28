import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { openRecentDocument, type RecentDocument } from '@/lib/recentDocuments';
import { useRecentDocuments } from '@/hooks/useRecentDocuments';

const colors = {
  navy: '#071527',
  navySoft: '#0D2038',
  surface: '#102944',
  surfaceRaised: '#163453',
  blue: '#4F8CFF',
  blueSoft: '#9BBEFF',
  white: '#F4F7FB',
  muted: '#A8B8CA',
};

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
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DocsScreen() {
  const { documents, refreshing } = useRecentDocuments();
  const [openingId, setOpeningId] = useState<string | null>(null);

  async function openDocument(document: RecentDocument) {
    setOpeningId(document.id);
    try {
      const result = await openRecentDocument(document);
      if (result === 'opened') return;
      Alert.alert(
        result === 'missing' ? 'Arquivo indisponível' : 'Não há app para abrir',
        result === 'missing'
          ? 'Este documento ainda não está no aparelho. Conecte o Drive e abra de novo.'
          : 'O Android não encontrou um aplicativo para abrir este tipo de arquivo.',
      );
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>OTHERSIDE</Text>
        <Text style={styles.title}>Documentos</Text>
        <Text style={styles.intro}>
          Os documentos do WhatsApp são copiados na hora, como os áudios. Os 10 mais recentes
          ficam neste aparelho para abrir mesmo depois de apagados na conversa.
        </Text>

        {refreshing && documents.length === 0 ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color={colors.blueSoft} />
            <Text style={styles.emptyDescription}>Buscando os documentos mais recentes…</Text>
          </View>
        ) : documents.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconGlyph}>▣</Text>
            </View>
            <Text style={styles.emptyTitle}>Nenhum documento por aqui</Text>
            <Text style={styles.emptyDescription}>
              Quando um PDF ou outro documento for baixado no WhatsApp, a cópia dos 10 mais
              recentes aparece nesta lista — mesmo se a mensagem for apagada depois.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {documents.map((document) => {
              const opening = openingId === document.id;
              return (
                <Pressable
                  key={document.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Abrir ${document.fileName}`}
                  disabled={opening}
                  onPress={() => void openDocument(document)}
                  style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
                  <View style={styles.cardIcon}>
                    <Text style={styles.cardIconGlyph}>{opening ? '…' : '▣'}</Text>
                  </View>
                  <View style={styles.cardCopy}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {document.fileName}
                    </Text>
                    <Text style={styles.cardMeta}>
                      {formatMoment(document.moment)}
                      {document.moment ? ' · ' : ''}
                      {formatSize(document.sizeBytes)}
                    </Text>
                  </View>
                  <Text style={styles.openGlyph}>↗</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.navy, flex: 1 },
  content: { paddingBottom: 38, paddingHorizontal: 22, paddingTop: 22 },
  eyebrow: {
    color: colors.blueSoft,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.4,
    marginBottom: 7,
  },
  title: { color: colors.white, fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  intro: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 24, marginTop: 12, maxWidth: 340 },
  emptyState: {
    alignItems: 'center',
    backgroundColor: colors.navySoft,
    borderColor: '#173555',
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
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
    marginBottom: 6,
    width: 60,
  },
  emptyIconGlyph: { color: colors.blueSoft, fontSize: 24, fontWeight: '700' },
  emptyTitle: { color: colors.white, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptyDescription: { color: colors.muted, fontSize: 13, lineHeight: 20, maxWidth: 290, textAlign: 'center' },
  list: { gap: 10 },
  card: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: '#1C3E63',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 14,
  },
  cardIcon: {
    alignItems: 'center',
    backgroundColor: '#1B3A60',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    marginRight: 12,
    width: 42,
  },
  cardIconGlyph: { color: colors.blueSoft, fontSize: 18, fontWeight: '700' },
  cardCopy: { flex: 1 },
  cardTitle: { color: colors.white, fontSize: 15, fontWeight: '700' },
  cardMeta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  openGlyph: { color: colors.blue, fontSize: 20, marginLeft: 10 },
  pressed: { opacity: 0.74 },
});
