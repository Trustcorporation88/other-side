import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { openNotificationSettings } from '@otherside/notification-capture';
import { useNotificationCapture } from '@/hooks/useNotificationCapture';
import { useDriveBackup } from '@/hooks/useDriveBackup';

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
  const drive = useDriveBackup();

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

        <Text style={styles.sectionLabel}>BACKUP</Text>
        <DriveBackupCard drive={drive} />
        <GalleryBackupCard drive={drive} />

        <Text style={styles.sectionLabel}>PRIVACIDADE</Text>
        <View style={styles.privacyCard}>
          <Text style={styles.privacyTitle}>Seus dados, sua conta</Text>
          <Text style={styles.privacyDescription}>
            As mensagens e áudios ficam no armazenamento privado do aparelho. O backup é opcional e vai para o SEU Google Drive, só depois que você conectar sua conta. Não há servidor nosso nem leitura do banco interno do WhatsApp.
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
          OtherSide {Constants.expoConfig?.version ?? '1.0.16'} · {nativeAvailable ? 'módulo nativo conectado' : 'aguardando APK Android'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function DriveBackupCard({ drive }: { drive: ReturnType<typeof useDriveBackup> }) {
  const {
    available,
    connected,
    email,
    uploaded,
    pending,
    syncing,
    progress,
    busy,
    connect,
    disconnect,
    sync,
  } = drive;

  async function handleConnect() {
    if (!available) {
      Alert.alert(
        'Build Android necessário',
        'O backup no Google Drive funciona apenas no APK do OtherSide, não no Expo Go.',
      );
      return;
    }
    const ok = await connect();
    if (!ok) {
      Alert.alert('Não conectado', 'O login do Google não foi concluído. Tente de novo.');
    }
  }

  function handleDisconnect() {
    Alert.alert(
      'Desconectar o Google Drive',
      'O OtherSide para de enviar novos arquivos. O que já subiu continua no seu Drive.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Desconectar', style: 'destructive', onPress: () => void disconnect() },
      ],
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIcon}>
          <View style={styles.cardIconDot} />
        </View>
        <View style={styles.cardHeaderCopy}>
          <Text style={styles.cardTitle}>Backup no Google Drive</Text>
          <Text style={[styles.cardSubtitle, connected && styles.cardSubtitleActive]}>
            {!available ? 'APK Android necessário' : connected ? (email ?? 'Conectado') : 'Não conectado'}
          </Text>
        </View>
        <View style={[styles.warningDot, connected && styles.activeDot]} />
      </View>
      <Text style={styles.cardDescription}>
        {!available
          ? 'Disponível no APK do OtherSide. Conecte sua conta para enviar áudios, fotos e mensagens ao seu Google Drive.'
          : connected
            ? syncing && progress
              ? `Enviando para o seu Drive… ${progress.done} de ${progress.total}.`
              : `Áudios, fotos e mensagens vão para a pasta "OtherSide" no seu Drive, um arquivo por nome e tamanho. ${uploaded} no Drive · ${pending} pendente${pending === 1 ? '' : 's'}.`
            : 'Conecte sua conta do Google para guardar os áudios, fotos e mensagens no seu próprio Drive (pasta "OtherSide"). Só o app acessa esses arquivos.'}
      </Text>

      {connected ? (
        <>
          <Pressable
            accessibilityRole="button"
            disabled={syncing}
            onPress={() => void sync()}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryButtonText}>
              {syncing
                ? progress
                  ? `Enviando ${progress.done}/${progress.total}…`
                  : 'Enviando…'
                : 'Sincronizar agora'}
            </Text>
            <Text style={styles.secondaryButtonArrow}>↑</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={handleDisconnect}
            style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}>
            <Text style={styles.linkButtonText}>Desconectar</Text>
          </Pressable>
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={handleConnect}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Text style={styles.secondaryButtonText}>
            {busy ? 'Conectando…' : available ? 'Conectar Google Drive' : 'Como instalar o APK'}
          </Text>
          <Text style={styles.secondaryButtonArrow}>↗</Text>
        </Pressable>
      )}
    </View>
  );
}

function GalleryBackupCard({ drive }: { drive: ReturnType<typeof useDriveBackup> }) {
  const {
    available,
    connected,
    syncing,
    progress,
    settings,
    galleryAccess,
    gallerySkipped,
    backfill,
    requestGalleryPermission,
    setGalleryEnabled,
    setIncludeWhatsAppImages,
    setWifiOnly,
    setRequireCharging,
  } = drive;

  async function handleBackfill() {
    if (!available || !connected) {
      Alert.alert('Conecte o Drive', 'O backup da galeria usa a mesma pasta OtherSide do Google Drive.');
      return;
    }
    if (!settings.galleryEnabled) {
      Alert.alert('Backup da galeria desligado', 'Ligue “Câmera (DCIM/Camera)” para enviar as fotos.');
      return;
    }
    if (!galleryAccess) {
      const granted = await requestGalleryPermission();
      if (!granted) {
        Alert.alert(
          'Sem acesso às fotos',
          'O Android precisa da permissão de fotos e vídeos. No Android 14 dá para escolher só algumas; o app envia só essas.',
        );
        return;
      }
    }
    const result = await backfill();
    if (!result) return;
    if (result.gallerySkipped === 'wifi') {
      Alert.alert('Aguardando Wi-Fi', 'O backup da galeria está em “somente Wi-Fi”. Conecte uma rede Wi-Fi ou desligue essa opção.');
      return;
    }
    if (result.gallerySkipped === 'charging') {
      Alert.alert('Aguardando carregador', 'O backup da galeria está marcado para rodar só carregando.');
    }
  }

  const status = !available
    ? 'APK Android necessário'
    : !connected
      ? 'Conecte o Drive acima'
      : !settings.galleryEnabled
        ? 'Desligado'
        : !galleryAccess
          ? 'Permissão de fotos pendente'
          : gallerySkipped === 'wifi'
            ? 'Aguardando Wi-Fi'
            : gallerySkipped === 'charging'
              ? 'Aguardando carregador'
              : 'Ativo';

  return (
    <View style={[styles.card, styles.galleryCard]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIcon}>
          <View style={styles.cardIconDot} />
        </View>
        <View style={styles.cardHeaderCopy}>
          <Text style={styles.cardTitle}>Backup da galeria</Text>
          <Text style={[styles.cardSubtitle, connected && settings.galleryEnabled && galleryAccess && styles.cardSubtitleActive]}>
            {status}
          </Text>
        </View>
      </View>
      <Text style={styles.cardDescription}>
        Fotos e vídeos de DCIM/Camera vão para OtherSide/AAAA-MM/Fotos, no mês em que foram feitos. Fotos novas sobem sozinhas. O que já está no Drive, com o mesmo nome e tamanho, não é enviado de novo.
      </Text>

      <SettingToggle
        label="Câmera (DCIM/Camera)"
        value={settings.galleryEnabled}
        disabled={!available}
        onChange={(value) => {
          setGalleryEnabled(value);
          if (value && !galleryAccess) void requestGalleryPermission();
        }}
      />
      <SettingToggle
        label="Imagens do WhatsApp na pasta Fotos"
        value={settings.includeWhatsAppImages}
        disabled={!available || !settings.galleryEnabled}
        onChange={setIncludeWhatsAppImages}
      />
      <SettingToggle
        label="Galeria só no Wi-Fi"
        value={settings.wifiOnly}
        disabled={!available || !settings.galleryEnabled}
        onChange={setWifiOnly}
      />
      <SettingToggle
        label="Galeria só carregando"
        value={settings.requireCharging}
        disabled={!available || !settings.galleryEnabled}
        onChange={setRequireCharging}
      />

      {connected && settings.galleryEnabled && !galleryAccess && (
        <Pressable
          accessibilityRole="button"
          onPress={() => void requestGalleryPermission()}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Text style={styles.secondaryButtonText}>Permitir fotos e vídeos</Text>
          <Text style={styles.secondaryButtonArrow}>↗</Text>
        </Pressable>
      )}

      <Pressable
        accessibilityRole="button"
        disabled={!available || !connected || syncing || !settings.galleryEnabled}
        onPress={() => void handleBackfill()}
        style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
        <Text style={styles.secondaryButtonText}>
          {syncing && progress ? `Enviando fotos ${progress.done}/${progress.total}…` : 'Enviar fotos existentes agora'}
        </Text>
        <Text style={styles.secondaryButtonArrow}>↑</Text>
      </Pressable>
    </View>
  );
}

function SettingToggle({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.toggleLabel, disabled && styles.toggleLabelDisabled]}>{label}</Text>
      <Switch
        accessibilityRole="switch"
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: '#1C3E63', true: '#2F6FE0' }}
        thumbColor={value ? '#F4F7FB' : '#A8B8CA'}
      />
    </View>
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
  galleryCard: {
    marginTop: 14,
  },
  toggleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 12,
  },
  toggleLabel: {
    color: colors.white,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  toggleLabelDisabled: {
    color: '#6F849C',
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
  linkButton: {
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 8,
  },
  linkButtonText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
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
