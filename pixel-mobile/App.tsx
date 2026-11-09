/* Pixel on your phone: Pixel's own page (his screen, his keys, the Pixel / Clavier / Les deux modes) in a full-screen app.
   With no Pi linked, Pixel lives on the phone itself (src/LocalPixel.tsx): no QR code, no network needed. Linking his Pi is
   optional (the menu's "Relier à mon Pixel": scan the QR code Pixel shows when you swipe left on his face). Its address and
   your access code are kept in the phone's secure storage, and mirrored for the native parts (modules/pixel-native) that
   work with the app closed: "Partager > Pixel" from any app, and the phone's notifications (off by default). Linked, the
   app shows the Pi's page, and the phone's own Pixel whenever the Pi does not answer (src/Linked.tsx). On both pages, the
   same native features (src/plugs.ts): the screen kept on in Pixel mode, Pixel de poche held sideways and full screen with
   the phone's senses. The back button goes back in the Pi's page, then opens the app's menu (src/PixelMenu.tsx); once
   more, it leaves. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { NavigationBar } from 'expo-navigation-bar';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import PixelNative from './modules/pixel-native';
import { LAYER, useBack } from './src/back';
import { Linked, type LinkedHandle, type PiLink } from './src/Linked';
import { LocalPixel } from './src/LocalPixel';
import { forgetPi, readHome, saveHome, takeLink, type Home } from './src/localStore';
import { Notifs } from './src/Notifs';
import { PixelMenu } from './src/PixelMenu';
import { showOnPhone } from './src/plugs';
import { usePoche } from './src/poche';
import { C } from './src/theme';
import { parseMessage, sameOrigin, usePlugs, webProps } from './src/webBridge';

const KEY = 'pixel_url';                                       // what Pixel's QR code holds: http://pixel.local:8080/?t=<code>
const LINK_URL = /^pixel:\/\/relier\?at=(\d{1,15})$/;           // the share card's « Relier à mon Pixel » (ShareActivity.kt LINK_URL), and when
const LINK_MS = 120000;                                        // a link older than that is an old intent given again
const isPixelUrl = (u: string) => /^https?:\/\/[^/\s?]+\/?\?t=[\w-]+$/.test(u.trim());
const hostOf = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/?\?.*$/, '');
const mirror = (u: string | null) => { PixelNative?.setPixel(u).catch(() => {}); };   // for the share screen and the notifications
type Panel = 'none' | 'menu' | 'notifs';

export default function App() {
  const [url, setUrl] = useState<string | null | undefined>(undefined);   // undefined: reading it, null: no Pi linked
  const [home, setHome] = useState<Home>('pi');                          // linked: Pixel on the Pi, or on the phone (the menu's choice)
  const [setup, setSetup] = useState(false), [panel, setPanel] = useState<Panel>('none'), [seen, setSeen] = useState<'pi' | 'phone'>('phone');
  const poche = usePoche();                                              // Pixel de poche: no system bars, the edges in his theme's colour
  const linked = useRef<LinkedHandle>(null);                             // "Mon Pixel (Pi)" while the phone's Pixel stands in: try him now
  useEffect(() => {
    Promise.all([SecureStore.getItemAsync(KEY).catch(() => null), readHome()]).then(([u, h]) => { setHome(h); setUrl(u); mirror(u); });
  }, []);
  useEffect(() => {                                                      // opened from the share card, with no Pi linked: the link screen
    let alive = true;
    const ask = async (u?: string | null) => {                           // each link once, and only a fresh one
      const at = Number(LINK_URL.exec(u ?? '')?.[1]);
      if (!at || Math.abs(Date.now() - at) > LINK_MS || !(await takeLink(at)) || !alive) return;
      setPanel('none'); setSetup(true);
    };
    Linking.getInitialURL().then(ask, () => {});
    const sub = Linking.addEventListener('url', e => ask(e.url));
    return () => { alive = false; sub.remove(); };
  }, []);
  const save = useCallback(async (u: string) => {
    await SecureStore.setItemAsync(KEY, u.trim()); mirror(u.trim()); await saveHome('pi'); setHome('pi'); setUrl(u.trim()); setSetup(false);
  }, []);
  const forget = useCallback(async () => { await SecureStore.deleteItemAsync(KEY); mirror(null); forgetPi(); setHome('pi'); setUrl(null); }, []);
  const goHome = useCallback((h: Home) => { setHome(h); saveHome(h); }, []);
  const openMenu = useCallback(() => setPanel('menu'), []);
  const closePanel = useCallback(() => setPanel('none'), []);
  const localTest = useCallback((title: boolean) => {                   // no Pi: the settings close, and the phone's Pixel gets a test
    setPanel('none');
    setTimeout(() => showOnPhone({ app: 'Pixel pour Android', ...(title ? { title: 'Notification de test' } : {}) }), 600);
  }, []);
  const piUrl = url && home === 'pi' ? url : null;                       // linked, and Pixel lives on the Pi
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {poche.on ? <><StatusBar hidden /><NavigationBar hidden /></> : null}
      <SafeAreaView style={[s.fill, poche.on && poche.bg ? { backgroundColor: poche.bg } : null]}>
        {url === undefined ? <ActivityIndicator style={s.fill} color={C.green} />
          : setup ? <Setup onDone={save} onCancel={() => setSetup(false)} />
          : piUrl ? <Linked ref={linked} url={piUrl} Page={PixelPage} hold={panel !== 'none'} onMenu={openMenu} onRelink={() => setSetup(true)} onWhere={setSeen} />
          : <LocalPixel onMenu={openMenu} />}
        {panel === 'menu' && !setup && url !== undefined ? (
          <PixelMenu where={piUrl ? (seen === 'phone' ? 'fallback' : 'pi') : 'phone'} host={url ? hostOf(url) : null} onClose={closePanel}
            onPi={() => (home === 'pi' ? linked.current?.retry() : goHome('pi'))} onPhone={() => goHome('phone')} onLink={() => setSetup(true)} onForget={forget}
            onNotifs={() => setPanel('notifs')} />
        ) : null}
        {panel === 'notifs' && !setup ? <View style={s.cover}><Notifs linked={!!url} onClose={closePanel} onLocalTest={localTest} /></View> : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

/* linking the Pi (the menu's "Relier à mon Pixel"): scan Pixel's QR code, or type his address */
function Setup({ onDone, onCancel }: { onDone: (u: string) => void; onCancel: () => void }) {
  const [perm, ask] = useCameraPermissions();
  const [scan, setScan] = useState(false);
  const [typed, setTyped] = useState('http://pixel.local:8080/?t=');
  const done = useRef(false);
  useBack(LAYER.setup, () => { if (scan) setScan(false); else onCancel(); });
  if (scan && perm?.granted) {
    return (
      <View style={s.fill}>
        <CameraView style={s.fill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={r => { if (!done.current && isPixelUrl(r.data)) { done.current = true; onDone(r.data); } }} />
        <View style={s.scanHint}>
          <Text style={s.text}>Vise le QR code affiché par Pixel</Text>
          <Pressable style={s.btnGhost} onPress={() => setScan(false)}><Text style={s.btnGhostText}>Annuler</Text></Pressable>
        </View>
      </View>
    );
  }
  return (
    <View style={[s.fill, s.center]}>
      <Text style={s.title}>PIXEL</Text>
      <Text style={s.text}>Sur l’écran de ton Pi, glisse vers la gauche sur le visage de Pixel : il affiche un QR code. Scanne-le pour relier ce téléphone à ton Pixel.</Text>
      <Pressable style={s.btn} onPress={async () => { if (perm?.granted || (await ask()).granted) setScan(true); }}>
        <Text style={s.btnText}>Scanner le QR code</Text>
      </Pressable>
      {perm && !perm.granted && !perm.canAskAgain
        ? <Text style={s.small}>L’appareil photo est refusé : autorise-le dans les réglages du téléphone, ou tape l’adresse.</Text> : null}
      <Text style={[s.small, s.gapTop]}>Ou tape son adresse complète, avec le code après ?t= :</Text>
      <TextInput style={s.input} value={typed} onChangeText={setTyped} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
      <Pressable style={[s.btnGhost, !isPixelUrl(typed) && s.off]} disabled={!isPixelUrl(typed)} onPress={() => onDone(typed)}>
        <Text style={s.btnGhostText}>Valider</Text>
      </Pressable>
      <Pressable style={[s.btnGhost, s.gapTop]} onPress={onCancel}><Text style={s.btnGhostText}>Retour à Pixel</Text></Pressable>
    </View>
  );
}

/* the Pi's page, full screen; when it does not answer, Linked.tsx shows the phone's own Pixel instead (never a dead end) */
function PixelPage({ url, link }: { url: string; link: PiLink }) {
  const web = useRef<WebView<object>>(null), canGoBack = useRef(false);   // <object>: its default <undefined> types every prop as never
  const [round, setRound] = useState(0);                          // a new round: the page loads again (its process was gone)
  const plugs = usePlugs('pi', web, round);                       // the native features (src/plugs.ts), the same on both pages
  const poche = usePoche();
  useBack(LAYER.page, () => {
    if (!canGoBack.current) link.onMenu();                        // on Pixel's page: the app's menu
    else web.current?.goBack();
  });
  const onMessage = (e: WebViewMessageEvent) => {                 // the page says which mode is on, the Pixel de poche, whether the Pi answers, or that it has no access
    const m = sameOrigin(e.nativeEvent.url, url) ? parseMessage(e.nativeEvent.data) : null; if (!m) return;   // the Pi's own page only
    link.onMessage(m); plugs.message(m);
  };
  return (
    <WebView<object> key={round} ref={web} source={{ uri: url }} style={[s.web, poche.on && poche.bg ? { backgroundColor: poche.bg } : null]}
      originWhitelist={['*']} {...webProps}
      injectedJavaScriptBeforeContentLoaded={plugs.beforeLoad ? plugs.beforeLoad + '\ntrue;' : undefined}
      onMessage={onMessage} onNavigationStateChange={n => { canGoBack.current = n.canGoBack; }}
      onLoadStart={e => plugs.start(e.nativeEvent.url)}
      onLoad={() => { link.onLoaded(); plugs.ready(); }}
      onError={() => link.onDown('down')}
      onHttpError={e => { const c = e.nativeEvent.statusCode; if (c >= 400) link.onDown(c === 403 ? 'refus' : 'down'); }}   // 403: Pixel only answers the devices at home
      onRenderProcessGone={() => setRound(r => r + 1)} />
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: C.desk },
  web: { flex: 1, backgroundColor: C.desk },
  center: { alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  title: { color: C.plastic, fontSize: 28, fontWeight: '700', letterSpacing: 8, fontFamily: 'monospace' },
  text: { color: C.plastic, fontSize: 16, lineHeight: 23, textAlign: 'center' },
  small: { color: C.ink, fontSize: 13, textAlign: 'center' },
  gapTop: { marginTop: 28 },
  input: { alignSelf: 'stretch', borderWidth: 1, borderColor: C.ink, borderRadius: 10, color: C.green, fontFamily: 'monospace', paddingHorizontal: 12, paddingVertical: 10 },
  btn: { backgroundColor: C.plastic, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 12, marginTop: 6 },
  btnText: { color: C.desk, fontSize: 16, fontWeight: '700' },
  btnGhost: { borderColor: C.ink, borderWidth: 1, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9 },
  btnGhostText: { color: C.plastic, fontSize: 14, fontWeight: '600' },
  off: { opacity: 0.4 },
  scanHint: { position: 'absolute', left: 0, right: 0, bottom: 40, alignItems: 'center', gap: 12 },
  cover: { ...StyleSheet.absoluteFill, backgroundColor: C.desk },
});
