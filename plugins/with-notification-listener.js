const { withAndroidManifest } = require('@expo/config-plugins');

const SERVICE_NAME = 'br.com.otherside.notificationcapture.OtherSideNotificationCaptureService';
const LISTENER_ACTION = 'android.service.notification.NotificationListenerService';

// Permissões necessárias para ler a pasta de mídia do WhatsApp e preservar as notas de voz.
const PERMISSIONS = [
  { name: 'android.permission.MANAGE_EXTERNAL_STORAGE' },
  { name: 'android.permission.READ_MEDIA_AUDIO' },
  { name: 'android.permission.READ_EXTERNAL_STORAGE', maxSdkVersion: '32' },
];

function addUsesPermission(manifest, { name, maxSdkVersion }) {
  manifest['uses-permission'] = manifest['uses-permission'] ?? [];
  const existing = manifest['uses-permission'].find(
    (permission) => permission.$?.['android:name'] === name
  );
  const attributes = { 'android:name': name };
  if (maxSdkVersion) attributes['android:maxSdkVersion'] = maxSdkVersion;

  if (existing) {
    existing.$ = { ...existing.$, ...attributes };
  } else {
    manifest['uses-permission'].push({ $: attributes });
  }
}

module.exports = function withNotificationListener(config) {
  return withAndroidManifest(config, (configWithManifest) => {
    const manifest = configWithManifest.modResults.manifest;
    const application = manifest.application?.[0];

    if (!application) {
      throw new Error('OtherSide precisa de uma aplicação Android no manifesto.');
    }

    PERMISSIONS.forEach((permission) => addUsesPermission(manifest, permission));

    application.service = application.service ?? [];
    const hasService = application.service.some(
      (service) => service.$?.['android:name'] === SERVICE_NAME
    );

    if (!hasService) {
      application.service.push({
        $: {
          'android:name': SERVICE_NAME,
          'android:exported': 'true',
          'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': LISTENER_ACTION } }],
          },
        ],
      });
    }

    return configWithManifest;
  });
};
