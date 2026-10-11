const { withAndroidManifest } = require('@expo/config-plugins');

const SERVICE_NAME = 'br.com.otherside.notificationcapture.OtherSideNotificationCaptureService';
const LISTENER_ACTION = 'android.service.notification.NotificationListenerService';

module.exports = function withNotificationListener(config) {
  return withAndroidManifest(config, (configWithManifest) => {
    const manifest = configWithManifest.modResults.manifest;
    const application = manifest.application?.[0];

    if (!application) {
      throw new Error('OtherSide precisa de uma aplicação Android no manifesto.');
    }

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
