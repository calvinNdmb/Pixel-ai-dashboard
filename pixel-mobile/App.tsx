/* Pixel on your phone: Pixel's own page (his screen, his keys, the Pixel / Clavier / Les deux modes) in a full-screen app.
   The first time, scan the QR code Pixel shows (swipe left on his face): it holds his address and your access code, kept
   in the phone's secure storage, and mirrored for the native parts (modules/pixel-native) that work with the app closed:
   "Partager > Pixel" from any app, and the phone's notifications (off by default). In Pixel mode the phone's screen stays
   on; in Pixel de poche, the phone is held sideways, full screen, and lends him its senses (src/poche.ts). The back button
   goes back in the page, then opens the app's menu; once more, it leaves. When the Pi does not answer, the app says so. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { NavigationBar } from 'expo-navigation-bar';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import PixelNative from './modules/pixel-native';
import { Notifs } from './src/Notifs';
import { SENSES, usePocheSenses } from './src/poche';
import { C } from './src/theme';

const KEY = 'pixel_url';                                       // what Pixel's QR code holds: http://pixel.local:8080/?t=<code>
const isPixelUrl = (u: string) => /^https?:\/\/[^/\s?]+\/?\?t=[\w-]+$/.test(u.trim());
const NO_ANSWER = "Pixel ne répond pas. Vérifie qu'il est allumé et que ton téléphone est sur le même Wi-Fi.";
const mirror = (u: string | null) => { PixelNative?.setPixel(u).catch(() => {}); };   // for the share screen and the notifications

export default function App() {
  const [url, setUrl] = useState<string | null | undefined>(undefined);   // undefined: reading it, null: not set up yet
  const [bg, setBg] = useState<string | null>(null);                      // Pixel de poche: the sides take his theme's background
  useEffect(() => { SecureStore.getItemAsync(KEY).then(u => { setUrl(u); mirror(u); }, () => setUrl(null)); }, []);
  const save = useCallback(async (u: string) => { await SecureStore.setItemAsync(KEY, u.trim()); mirror(u.trim()); setUrl(u.trim()); }, []);
  const forget = useCallback(async () => { await SecureStore.deleteItemAsync(KEY); mirror(null); setUrl(null); }, []);
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={[s.fill, bg ? { backgroundColor: bg } : null]}>
        {url === undefined ? <ActivityIndicator style={s.fill} color={C.green} />
          : url ? <PixelPage url={url} onForget={forget} onPocheBg={setBg} /> : <Setup onDone={save} />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

/* the first time: scan Pixel's QR code, or type his address */
function Setup({ onDone }: { onDone: (u: string) => void }) {
  const [perm, ask] = useCameraPermissions();
  const [scan, setScan] = useState(false);
  const [typed, setTyped] = useState('http://pixel.local:8080/?t=');
  const done = useRef(false);
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
      <Text style={s.text}>Sur l’écran de Pixel, glisse vers la gauche sur son visage : il affiche un QR code. Scanne-le pour relier ce téléphone à Pixel.</Text>
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
    </View>
  );
}

type Panel = 'none' | 'menu' | 'notifs';

/* Pixel's page, full screen; the app's menu and its notification settings over it (the page stays loaded) */
function PixelPage({ url, onForget, onPocheBg }: { url: string; onForget: () => void; onPocheBg: (bg: string | null) => void }) {
  const web = useRef<WebView<object>>(null), canGoBack = useRef(false);   // <object>: its default <undefined> types every prop as never
  const [down, setDown] = useState<string | null>(null);         // why Pixel does not answer
  const [round, setRound] = useState(0);                          // a new round: the page loads again
  const [panel, setPanel] = useState<Panel>('none');
  const [poche, setPoche] = useState<{ on: boolean; bg: string | null }>({ on: false, bg: null });
  const pocheOn = poche.on && !down;
  usePocheSenses(web, pocheOn);
  useEffect(() => { onPocheBg(pocheOn ? poche.bg : null); }, [pocheOn, poche.bg, onPocheBg]);
  useEffect(() => () => { deactivateKeepAwake('pixel'); onPocheBg(null); }, [onPocheBg]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (panel === 'notifs') { setPanel('none'); return true; }
      if (panel === 'menu') return false;                         // back again on the menu: the app leaves
      if (canGoBack.current && !down) { web.current?.goBack(); return true; }
      setPanel('menu'); return true;
    });
    return () => sub.remove();
  }, [panel, down]);
  const fail = (why: string) => { setPoche({ on: false, bg: null }); setDown(why); };
  const onMessage = (e: WebViewMessageEvent) => {                 // the page says which mode is on, the Pixel de poche, or that it has no access
    try {
      const m = JSON.parse(e.nativeEvent.data);
      if (m.mode === 'pixel') activateKeepAwakeAsync('pixel'); else if (m.mode) deactivateKeepAwake('pixel');
      if (typeof m.poche === 'boolean') setPoche(p => ({ on: m.poche, bg: typeof m.bg === 'string' && /^#[0-9a-f]{3,8}$/i.test(m.bg) ? m.bg : p.bg }));
      if (m.access === false) fail("Pixel ne reconnaît pas ce téléphone : scanne à nouveau son QR code.");
    } catch { /* not a message for the app */ }
  };
  return (
    <View style={s.fill}>
      {pocheOn ? <><StatusBar hidden /><NavigationBar hidden /></> : null}
      {down ? (
        <View style={[s.fill, s.center]}>
          <Text style={s.face}>:(</Text>
          <Text style={s.text}>{down}</Text>
          <Pressable style={s.btn} onPress={() => { setDown(null); setRound(r => r + 1); }}><Text style={s.btnText}>Réessayer</Text></Pressable>
          <Pressable style={s.btnGhost} onPress={onForget}><Text style={s.btnGhostText}>Scanner un autre QR code</Text></Pressable>
        </View>
      ) : (
        <WebView<object> key={round} ref={web} source={{ uri: url }} style={[s.web, pocheOn && poche.bg ? { backgroundColor: poche.bg } : null]}
          originWhitelist={['*']} javaScriptEnabled domStorageEnabled setSupportMultipleWindows={false} overScrollMode="never" textZoom={100}
          injectedJavaScriptBeforeContentLoaded={SENSES} injectedJavaScript={SENSES}
          onMessage={onMessage} onNavigationStateChange={n => { canGoBack.current = n.canGoBack; }}
          onLoadStart={() => setPoche(p => (p.on ? { on: false, bg: p.bg } : p))}
          onError={() => fail(NO_ANSWER)}
          onHttpError={e => { if (e.nativeEvent.statusCode === 403) fail("Pixel refuse ce téléphone : il ne répond qu'aux appareils de la maison."); }}
          onRenderProcessGone={() => { setPoche({ on: false, bg: null }); setRound(r => r + 1); }} />
      )}
      {panel === 'menu' ? <Menu onClose={() => setPanel('none')} onNotifs={() => setPanel('notifs')} onRescan={() => { setPanel('none'); onForget(); }} /> : null}
      {panel === 'notifs' ? <View style={s.cover}><Notifs onClose={() => setPanel('none')} /></View> : null}
    </View>
  );
}

/* the app's menu (the back button on Pixel's page): its notifications, another QR code, leave */
function Menu({ onClose, onNotifs, onRescan }: { onClose: () => void; onNotifs: () => void; onRescan: () => void }) {
  const [notif, setNotif] = useState('');
  useEffect(() => {
    PixelNative?.getNotif().then(n => setNotif(!n.on ? 'Désactivées' : !n.access ? 'Activées, mais Android ne les donne pas encore à Pixel'
      : `Activées · ${n.apps.length} ${n.apps.length > 1 ? 'applis' : 'appli'}`), () => {});
  }, []);
  return (
    <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Fermer le menu">
      <Pressable style={s.sheet} onPress={() => {}} accessible={false}>
        <Text style={s.sheetTitle}>PIXEL POUR ANDROID{PixelNative?.version ? ' ' + PixelNative.version : ''}</Text>
        {PixelNative ? <Item label="Notifications du téléphone" sub={notif} onPress={onNotifs} /> : null}
        <Item label="Scanner un autre QR code" sub="Un autre Pixel, ou un nouveau code d’accès." onPress={onRescan} />
        <Item label="Quitter l’appli" onPress={() => BackHandler.exitApp()} />
        <Text style={[s.small, s.left]}>Pour montrer une photo, une vidéo ou un lien sur Pixel : touche Partager dans n’importe quelle appli, puis Pixel.</Text>
        <Text style={[s.small, s.left]}>Retour encore une fois : tu quittes l’appli.</Text>
      </Pressable>
    </Pressable>
  );
}

function Item({ label, sub, onPress }: { label: string; sub?: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [s.item, pressed && s.itemPressed]} onPress={onPress} accessibilityRole="button">
      <Text style={s.itemText}>{label}</Text>
      {sub ? <Text style={[s.small, s.left]}>{sub}</Text> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: C.desk },
  web: { flex: 1, backgroundColor: C.desk },
  center: { alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  title: { color: C.plastic, fontSize: 28, fontWeight: '700', letterSpacing: 8, fontFamily: 'monospace' },
  face: { color: C.green, fontSize: 48, fontFamily: 'monospace' },
  text: { color: C.plastic, fontSize: 16, lineHeight: 23, textAlign: 'center' },
  small: { color: C.ink, fontSize: 13, textAlign: 'center' },
  left: { textAlign: 'left' },
  gapTop: { marginTop: 28 },
  input: { alignSelf: 'stretch', borderWidth: 1, borderColor: C.ink, borderRadius: 10, color: C.green, fontFamily: 'monospace', paddingHorizontal: 12, paddingVertical: 10 },
  btn: { backgroundColor: C.plastic, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 12, marginTop: 6 },
  btnText: { color: C.desk, fontSize: 16, fontWeight: '700' },
  btnGhost: { borderColor: C.ink, borderWidth: 1, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9 },
  btnGhostText: { color: C.plastic, fontSize: 14, fontWeight: '600' },
  off: { opacity: 0.4 },
  scanHint: { position: 'absolute', left: 0, right: 0, bottom: 40, alignItems: 'center', gap: 12 },
  cover: { ...StyleSheet.absoluteFill, backgroundColor: C.desk },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.desk, borderColor: C.edge, borderWidth: 1, borderRadius: 24, margin: 12, padding: 18, gap: 10, maxWidth: 520, width: '94%', alignSelf: 'center' },
  sheetTitle: { color: C.ink, fontSize: 12, fontWeight: '700', letterSpacing: 2, fontFamily: 'monospace', marginBottom: 2 },
  item: { borderColor: C.edge, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 3, alignItems: 'flex-start' },
  itemPressed: { backgroundColor: C.edge },
  itemText: { color: C.plastic, fontSize: 16, fontWeight: '600' },
});
