/* Pixel sans Pi: Pixel on the phone itself, with no Raspberry Pi and no network. The page is pixel-app's own phone page
   in local mode, built into one offline file at build time (npm run bundle:web: assets/pixel-local.html, see
   pixel-app/tools/build_app_bundle.py). expo-asset copies it from the APK into the app's cache directory and the WebView
   opens it there, as a file:// page (allowFileAccess). Its localStorage is kept by the WebView between launches; the app
   also keeps his state in its own files (localStore.ts) and gives it back before the page starts, with the last snapshot
   of his Pi: window.PIXEL_LOCAL_STATE, read by pixel-app/web/local.js. The native features (plugs.ts) work here as on the
   Pi's page: Pixel de poche with the phone's senses, the screen kept on, and the phone's notifications when no Pi is linked. */
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { Asset } from 'expo-asset';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { readLocal, saveState } from './localStore';
import { usePoche } from './poche';
import { C } from './theme';
import { parseMessage, sameOrigin, usePlugs, webProps } from './webBridge';

const BUNDLE: number = require('../assets/pixel-local.html');   // metro.config.js: a page that says how to build it when it is missing

export type LocalHandle = { ping(): void };
type Props = {
  ref?: Ref<LocalHandle>;
  onMenu(): void;                                       // the back button (or "Pixel sur ce téléphone ⋯" on the page): the app's menu
  onIdle?(idle: number, busy: boolean): void;           // the answer to ping(): how long nobody has touched him, a timer running here
};

/* given back to the page before it starts, and again once it has loaded (the first may come too late, on Android:
   react-native-webview's docs say so); local.js keeps the newest of what it has */
const restoreScript = (given: object) =>
  `window.PIXEL_LOCAL_STATE = ${JSON.stringify(given)}; if (window.PixelLocal) window.PixelLocal.restore(window.PIXEL_LOCAL_STATE);`;

export function LocalPixel({ ref, onMenu, onIdle }: Props) {
  const web = useRef<WebView<object>>(null);
  const plugs = usePlugs('phone', web);
  const poche = usePoche();
  const [page, setPage] = useState<{ uri: string; boot: string } | null>(null);
  const [broken, setBroken] = useState(false);
  const [round, setRound] = useState(0);                // a new round: the page loads again (its process was killed)
  useEffect(() => {
    let alive = true;
    (async () => {
      const [[asset], given] = await Promise.all([Asset.loadAsync(BUNDLE), readLocal()]);
      if (!asset.localUri) throw new Error('no local copy of the page');
      if (alive) setPage({ uri: asset.localUri, boot: restoreScript(given) });
    })().catch(() => { if (alive) setBroken(true); });
    return () => { alive = false; };
  }, [round]);
  useImperativeHandle(ref, () => ({ ping: () => plugs.page.inject('window.PixelLocal && window.PixelLocal.ping();') }), [plugs]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onMenu(); return true; });   // no history here: the menu
    return () => sub.remove();
  }, [onMenu]);
  const onMessage = (e: WebViewMessageEvent) => {
    const m = page && sameOrigin(e.nativeEvent.url, page.uri) ? parseMessage(e.nativeEvent.data) : null; if (!m) return;   // his own page only
    if (m.local_save !== undefined) saveState(m.local_save);
    if (m.menu === true) onMenu();
    if (typeof m.local_idle === 'number') onIdle?.(m.local_idle, m.busy === true);
    plugs.message(m);
  };
  if (broken) {                                         // his page could not be copied out of the app (a phone full…): try again, or the menu
    return (
      <View style={[s.fill, s.center]}>
        <Text style={s.face}>:(</Text>
        <Text style={s.text}>Pixel n’a pas pu s’installer sur ce téléphone. Libère un peu de place, puis réessaie.</Text>
        <Pressable style={s.btn} onPress={() => { setBroken(false); setRound(r => r + 1); }} accessibilityRole="button"><Text style={s.btnText}>Réessayer</Text></Pressable>
        <Pressable style={s.btnGhost} onPress={onMenu} accessibilityRole="button"><Text style={s.btnGhostText}>Menu</Text></Pressable>
        {__DEV__ ? <Text style={s.small}>Développement : npm run bundle:web, dans pixel-mobile, puis relance Metro.</Text> : null}
      </View>
    );
  }
  if (!page) return <ActivityIndicator style={s.fill} color={C.green} />;
  return (
    <WebView<object> key={round} ref={web} source={{ uri: page.uri }} style={[s.fill, poche.on && poche.bg ? { backgroundColor: poche.bg } : null]} {...webProps}
      originWhitelist={['file://*']} allowFileAccess
      injectedJavaScriptBeforeContentLoaded={page.boot + '\n' + plugs.beforeLoad + '\ntrue;'}
      onMessage={onMessage} onLoadStart={plugs.start}
      onLoadEnd={() => { plugs.page.inject(page.boot); plugs.ready(); }}
      onRenderProcessGone={() => setRound(r => r + 1)} />
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: C.desk },
  center: { alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  face: { color: C.green, fontSize: 44, fontFamily: 'monospace' },
  text: { color: C.plastic, fontSize: 16, lineHeight: 23, textAlign: 'center' },
  small: { color: C.ink, fontSize: 13, textAlign: 'center' },
  btn: { backgroundColor: C.plastic, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 12 },
  btnText: { color: C.desk, fontSize: 16, fontWeight: '700' },
  btnGhost: { borderColor: C.ink, borderWidth: 1, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9 },
  btnGhostText: { color: C.plastic, fontSize: 14, fontWeight: '600' },
});
