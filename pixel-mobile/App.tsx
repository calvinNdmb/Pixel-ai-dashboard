/* Pixel on your phone: Pixel's own page (his screen, his keys, the Pixel / Clavier / Les deux modes) in a full-screen app.
   Pixel sans Pi: with no Pi linked, Pixel lives on the phone itself (LocalPixel.tsx). To link the Pi, scan the QR code
   Pixel shows (swipe left on his face): it holds his address and your access code, kept in the phone's secure storage.
   Linked, the app shows the Pi's page; when the Pi does not answer, the phone's own Pixel (Linked.tsx). The back button
   opens the app's menu (PixelMenu.tsx). In Pixel mode the phone's screen stays on (webBridge.ts). */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Linked, type LinkedHandle, type PiLink } from './Linked';
import { LocalPixel } from './LocalPixel';
import { forgetPi, readHome, saveHome, type Home } from './localStore';
import { PixelMenu } from './PixelMenu';
import { parseMessage, sameOrigin, usePlugs, webProps } from './webBridge';

const KEY = 'pixel_url';                                       // what Pixel's QR code holds: http://pixel.local:8080/?t=<code>
const C = { desk: '#141713', plastic: '#d9d2bd', ink: '#7c745c', green: '#46ff82' };
const isPixelUrl = (u: string) => /^https?:\/\/[^/\s?]+\/?\?t=[\w-]+$/.test(u.trim());
const hostOf = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/?\?.*$/, '');

export default function App() {
  const [url, setUrl] = useState<string | null | undefined>(undefined);   // undefined: reading it, null: no Pi linked
  const [home, setHome] = useState<Home>('pi');                          // linked: Pixel on the Pi, or on the phone (the menu's choice)
  const [setup, setSetup] = useState(false), [menu, setMenu] = useState(false), [seen, setSeen] = useState<'pi' | 'phone'>('phone');
  const linked = useRef<LinkedHandle>(null);                             // "Mon Pixel (Pi)" while the phone's Pixel stands in: try him now
  useEffect(() => {
    Promise.all([SecureStore.getItemAsync(KEY).catch(() => null), readHome()]).then(([u, h]) => { setHome(h); setUrl(u); });
  }, []);
  const save = useCallback(async (u: string) => {
    await SecureStore.setItemAsync(KEY, u.trim()); await saveHome('pi'); setHome('pi'); setUrl(u.trim()); setSetup(false);
  }, []);
  const forget = useCallback(async () => { await SecureStore.deleteItemAsync(KEY); forgetPi(); setHome('pi'); setUrl(null); }, []);
  const goHome = useCallback((h: Home) => { setHome(h); saveHome(h); }, []);
  const openMenu = useCallback(() => setMenu(true), []);
  const piUrl = url && home === 'pi' ? url : null;           // linked, and Pixel lives on the Pi
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={s.fill}>
        {url === undefined ? <ActivityIndicator style={s.fill} color={C.green} />
          : setup ? <Setup onDone={save} onCancel={() => setSetup(false)} />
          : piUrl ? <Linked ref={linked} url={piUrl} Page={PixelPage} onMenu={openMenu} onRelink={() => setSetup(true)} onWhere={setSeen} />
          : <LocalPixel onMenu={openMenu} />}
        {menu && !setup && url !== undefined ? (
          <PixelMenu where={piUrl ? (seen === 'phone' ? 'fallback' : 'pi') : 'phone'} host={url ? hostOf(url) : null} onClose={() => setMenu(false)}
            onPi={() => (home === 'pi' ? linked.current?.retry() : goHome('pi'))} onPhone={() => goHome('phone')} onLink={() => setSetup(true)} onForget={forget} />
        ) : null}
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
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (scan) setScan(false); else onCancel(); return true; });
    return () => sub.remove();
  }, [scan, onCancel]);
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
      <Pressable style={[s.btnGhost, s.gapTop]} onPress={onCancel}><Text style={s.btnGhostText}>Retour à Pixel</Text></Pressable>
    </View>
  );
}

/* the Pi's page, full screen; when it does not answer, Linked.tsx shows the phone's own Pixel instead (never a dead end) */
function PixelPage({ url, link }: { url: string; link: PiLink }) {
  const web = useRef<WebView<object>>(null), canGoBack = useRef(false);   // <object>: its default <undefined> types every prop as never
  const plugs = usePlugs('pi', web);                              // the native features (webBridge.ts), the same on both pages
  const [round, setRound] = useState(0);                          // a new round: the page loads again
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack.current) { link.onMenu(); return true; }     // on Pixel's page: the app's menu
      web.current?.goBack(); return true;
    });
    return () => sub.remove();
  }, [link]);
  const onMessage = (e: WebViewMessageEvent) => {                 // the page says which mode is on, whether the Pi answers, or that it has no access
    const m = sameOrigin(e.nativeEvent.url, url) ? parseMessage(e.nativeEvent.data) : null; if (!m) return;   // the Pi's own page only
    link.onMessage(m); plugs.message(m);
  };
  return (
    <WebView<object> key={round} ref={web} source={{ uri: url }} style={s.web} originWhitelist={['*']} {...webProps}
      injectedJavaScriptBeforeContentLoaded={plugs.beforeLoad ? plugs.beforeLoad + '\ntrue;' : undefined}
      onMessage={onMessage} onNavigationStateChange={n => { canGoBack.current = n.canGoBack; }}
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
});
