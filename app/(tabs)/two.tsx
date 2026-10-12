import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { openNotificationSettings } from '@otherside/notification-capture';
import { useNotificationCapture } from '@/hooks/useNotificationCapture';

const colors = {
  navy: '#071527',
  navySoft: '#0D2038',
  surface: '#102944',
  blue: '#4F8CFF',
  blueSoft: '#9BBEFF',
  white: '#F4F7FB',
  muted: '#A8B8CA',
  amber: '#F1B65B',
};

export default function SettingsScreen() {
  const { listenerEnabled, nativeAvailable, refresh } = useNotificationCapture();

  function explainNativeAccess() {
    if (!nativeAvailable) {
      Alert.alert(
        'Build Android necessário',
        'A captura não funciona no Expo Go. Instale o APK de teste do OtherSide para ativar o acesso às notificações.'
      );
      return;
    }

    openNotificationSettings();
    setTimeout(refresh, 700);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>OTHERSIDE</Text>
        <Text style={styles.title}>Ajustes</Text>
        <Text style={styles.intro}>
          Transparência antes de conveniência. Você controla quando a captura começa e quando os dados deixam de existir.
        </Text>

        <Text style={styles.sectionLabel}>CAPTURA</Text>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIcon}>
              <View style={styles.cardIconDot} />
            </View>
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.cardTitle}>Acesso às notificações</Text>
              <Text style={[styles.cardSubtitle, listenerEnabled && styles.cardSubtitleActive]}>
                {!nativeAvailable ? 'APK Android necessário' : listenerEnabled ? 'Captura ativa' : 'Ainda não autorizado'}
              </Text>
            </View>
            <View style={[styles.warningDot, listenerEnabled && styles.activeDot]} />
          </View>
          <Text style={styles.cardDescription}>
            {!nativeAvailable
              ? 'O Expo Go não incorpora o serviço nativo. O APK próprio ativará esta integração no aparelho.'
              : listenerEnabled
                ? 'O OtherSide está observando notificações do WhatsApp e salvando os registros localmente.'
                : 'O Android precisa autorizar a captura antes do primeiro registro. O OtherSide observa apenas os pacotes do WhatsApp definidos no app.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={explainNativeAccess}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryButtonText}>
              {nativeAvailable ? 'Abrir ajustes do Android' : 'Como instalar o APK'}
            </Text>
            <Text style={styles.secondaryButtonArrow}>↗</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>PRIVACIDADE</Text>
        <View style={styles.privacyCard}>
          <Text style={styles.privacyTitle}>Um cofre local, sem conta</Text>
          <Text style={styles.privacyDescription}>
            As mensagens serão gravadas no armazenamento privado do aparelho. Não haverá servidor, sincronização, backup automático ou leitura do banco interno do WhatsApp.
          </Text>
          <View style={styles.localOnlyRow}>
            <View style={styles.localOnlyDot} />
            <Text style={styles.localOnlyText}>Somente neste aparelho</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>SOBRE A CAPTURA</Text>
        <View style={styles.limitList}>
          <LimitItem text="Só registra notificações que chegarem depois da autorização." />
          <LimitItem text="Não recupera mensagens anteriores à instalação." />
          <LimitItem text="Pode não receber conteúdo com prévia oculta ou conversa silenciada." />
          <LimitItem text="Apagar no WhatsApp não apaga automaticamente a cópia local." />
        </View>

        <Text style={styles.version}>
          OtherSide 1.0.0 · {nativeAvailable ? 'módulo nativo conectado' : 'aguardando APK Android'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function LimitItem({ text }: { text: string }) {
  return (
    <View style={styles.limitItem}>
      <Text style={styles.limitBullet}>•</Text>
      <Text style={styles.limitText}>{text}</Text>
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
    paddingTop: 26,
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
  intro: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
    maxWidth: 330,
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 11,
    marginTop: 30,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: '#1C3E63',
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
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
  cardIconDot: {
    backgroundColor: colors.blue,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  cardHeaderCopy: {
    flex: 1,
  },
  cardTitle: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardSubtitle: {
    color: colors.amber,
    fontSize: 12,
    fontWeight: '700',
  },
  cardSubtitleActive: {
    color: '#67E3A3',
  },
  warningDot: {
    backgroundColor: colors.amber,
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  activeDot: {
    backgroundColor: '#67E3A3',
  },
  cardDescription: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 16,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: colors.blue,
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 17,
    minHeight: 49,
    paddingHorizontal: 15,
  },
  secondaryButtonText: {
    color: colors.blueSoft,
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButtonArrow: {
    color: colors.blue,
    fontSize: 20,
  },
  pressed: {
    opacity: 0.72,
  },
  privacyCard: {
    backgroundColor: colors.navySoft,
    borderColor: '#173555',
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
  },
  privacyTitle: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 9,
  },
  privacyDescription: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  localOnlyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 16,
  },
  localOnlyDot: {
    backgroundColor: colors.blue,
    borderRadius: 4,
    height: 8,
    marginRight: 8,
    width: 8,
  },
  localOnlyText: {
    color: colors.blueSoft,
    fontSize: 12,
    fontWeight: '700',
  },
  limitList: {
    gap: 12,
  },
  limitItem: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    paddingRight: 8,
  },
  limitBullet: {
    color: colors.blue,
    fontSize: 18,
    lineHeight: 19,
    marginRight: 9,
  },
  limitText: {
    color: colors.muted,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  version: {
    color: '#6F849C',
    fontSize: 11,
    marginTop: 34,
    textAlign: 'center',
  },
});
