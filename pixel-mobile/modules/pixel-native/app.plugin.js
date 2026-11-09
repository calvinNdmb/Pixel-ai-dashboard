// Pixel's native parts in the app's AndroidManifest.xml (expo prebuild):
// - ShareActivity in Android's share sheet: a text or a link, one or several photos, GIFs or videos;
// - NotificationRelay, the notification listener (Android asks the user before it runs), never fed silent or ongoing ones;
// - <queries> for the launcher's apps, the list the user picks from (no QUERY_ALL_PACKAGES).
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const PKG = 'com.mopi.pixelnative';
const name = n => ({ $: { 'android:name': n } });
const send = (action, types) => ({
  action: [name(action)],
  category: [name('android.intent.category.DEFAULT')],
  data: types.map(t => ({ $: { 'android:mimeType': t } })),
});

module.exports = function withPixelNative(config) {
  return withAndroidManifest(config, c => {
    const manifest = c.modResults.manifest;
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    const mine = e => String(e.$['android:name']).startsWith(PKG + '.');

    app.activity = (app.activity || []).filter(a => !mine(a));
    app.activity.push({
      $: {
        'android:name': `${PKG}.ShareActivity`,
        'android:label': '@string/app_name',
        'android:theme': '@style/PixelShare',
        'android:exported': 'true',
        'android:excludeFromRecents': 'true',
        'android:taskAffinity': '',
        'android:configChanges': 'orientation|screenSize|screenLayout|smallestScreenSize|keyboard|keyboardHidden|uiMode',
      },
      'intent-filter': [
        send('android.intent.action.SEND', ['text/plain', 'image/*', 'video/*']),
        send('android.intent.action.SEND_MULTIPLE', ['image/*', 'video/*']),
      ],
    });

    app.service = (app.service || []).filter(s => !mine(s));
    app.service.push({
      $: {
        'android:name': `${PKG}.NotificationRelay`,
        'android:label': '@string/app_name',
        'android:exported': 'true',
        'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
      },
      'intent-filter': [{ action: [name('android.service.notification.NotificationListenerService')] }],
      'meta-data': [
        { $: { 'android:name': 'android.service.notification.default_filter_types', 'android:value': 'conversations|alerting' } },
        { $: { 'android:name': 'android.service.notification.disabled_filter_types', 'android:value': 'ongoing|silent' } },
      ],
    });

    const launcher = { action: [name('android.intent.action.MAIN')], category: [name('android.intent.category.LAUNCHER')] };
    manifest.queries = manifest.queries && manifest.queries.length ? manifest.queries : [{}];
    if (!manifest.queries.some(q => JSON.stringify(q.intent || []).includes('android.intent.category.LAUNCHER'))) {
      manifest.queries[0].intent = [...(manifest.queries[0].intent || []), launcher];
    }
    return c;
  });
};
