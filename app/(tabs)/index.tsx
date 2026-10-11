import { useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

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

export default function MessagesScreen() {
  const [query, setQuery] = useState('');

  function explainNativeAccess() {
    Alert.alert(
      'Integração em preparação',
      'O módulo nativo que abrirá o acesso às notificações será conectado na próxima etapa. Nenhuma mensagem é capturada nesta versão.'
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>OTHERSIDE</Text>
            <Text style={styles.title}>Mensagens</Text>
          </View>
          <View style={styles.brandMark}>
            <View style={styles.markLineShort} />
            <View style={styles.markLineLong} />
          </View>
        </View>

        <View style={styles.statusPanel}>
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.statusLabel}>CAPTURA INATIVA</Text>
          </View>
          <Text style={styles.statusTitle}>O Android ainda não autorizou o acesso.</Text>
          <Text style={styles.statusDescription}>
            A captura será local e começará somente depois da sua autorização explícita.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={explainNativeAccess}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>Configurar acesso</Text>
            <Text style={styles.primaryButtonArrow}>↗</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>HISTÓRICO LOCAL</Text>
            <Text style={styles.sectionTitle}>Mensagens preservadas</Text>
          </View>
          <Text style={styles.count}>0</Text>
        </View>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar mensagens"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            returnKeyType="search"
            accessibilityLabel="Buscar mensagens"
          />
        </View>

        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <View style={styles.emptyIconLine} />
            <View style={[styles.emptyIconLine, styles.emptyIconLineShort]} />
          </View>
          <Text style={styles.emptyTitle}>Ainda não há mensagens</Text>
          <Text style={styles.emptyDescription}>
            Quando uma mensagem aparecer em uma notificação autorizada, ela ficará disponível aqui, somente neste aparelho.
          </Text>
          {query.length > 0 && <Text style={styles.emptyHint}>Nenhum resultado para “{query}”.</Text>}
        </View>

        <View style={styles.privacyNote}>
          <Text style={styles.privacyLock}>◆</Text>
          <View style={styles.privacyCopy}>
            <Text style={styles.privacyTitle}>Somente neste aparelho</Text>
            <Text style={styles.privacyDescription}>
              O OtherSide não possui conta, sincronização ou acesso ao banco privado do WhatsApp.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 36,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 26,
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
  brandMark: {
    alignItems: 'flex-end',
    gap: 5,
    justifyContent: 'center',
    paddingRight: 4,
  },
  markLineShort: {
    backgroundColor: colors.blue,
    borderRadius: 8,
    height: 6,
    width: 23,
  },
  markLineLong: {
    backgroundColor: colors.blueSoft,
    borderRadius: 8,
    height: 6,
    width: 35,
  },
  statusPanel: {
    backgroundColor: colors.surface,
    borderColor: '#1C3E63',
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 30,
    padding: 20,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    marginBottom: 14,
  },
  statusDot: {
    backgroundColor: colors.amber,
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  statusLabel: {
    color: colors.amber,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  statusTitle: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 26,
    maxWidth: 310,
  },
  statusDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 9,
    maxWidth: 315,
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
    opacity: 0.78,
  },
  sectionHeader: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionEyebrow: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 6,
  },
  sectionTitle: {
    color: colors.white,
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  count: {
    color: colors.blueSoft,
    fontSize: 28,
    fontWeight: '700',
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: colors.navySoft,
    borderColor: '#173555',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    height: 50,
    marginBottom: 14,
    paddingHorizontal: 14,
  },
  searchIcon: {
    color: colors.blueSoft,
    fontSize: 25,
    lineHeight: 25,
    marginRight: 10,
  },
  searchInput: {
    color: colors.white,
    flex: 1,
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: colors.navySoft,
    borderColor: '#173555',
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 245,
    justifyContent: 'center',
    padding: 25,
  },
  emptyIcon: {
    alignItems: 'flex-end',
    backgroundColor: colors.surfaceRaised,
    borderColor: '#2A5078',
    borderRadius: 16,
    borderWidth: 1,
    gap: 5,
    justifyContent: 'center',
    marginBottom: 18,
    paddingHorizontal: 15,
    width: 66,
  },
  emptyIconLine: {
    backgroundColor: colors.blue,
    borderRadius: 4,
    height: 5,
    width: 29,
  },
  emptyIconLineShort: {
    backgroundColor: colors.blueSoft,
    width: 19,
  },
  emptyTitle: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyDescription: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    maxWidth: 285,
    textAlign: 'center',
  },
  emptyHint: {
    color: colors.blueSoft,
    fontSize: 12,
    marginTop: 13,
  },
  privacyNote: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    marginTop: 22,
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
