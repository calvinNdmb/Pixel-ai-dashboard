/* Pixel on your phone: Pixel's own page (his screen, his keys, the Pixel / Clavier / Les deux modes) in a full-screen app.
   The first time, scan the QR code Pixel shows (swipe left on his face): it holds his address and your access code, kept
   in the phone's secure storage. In Pixel mode the phone's screen stays on. When the Pi does not answer, the app says so. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

const KEY = 'pixel_url';                                       // what Pixel's QR code holds: http://pixel.local:8080/?t=<code>
const C = { desk: '#141713', plastic: '#d9d2bd', ink: '#7c745c', green: '#46ff82' };
const isPixelUrl = (u: string) => /^https?:\/\/[^/\s?]+\/?\?t=[\w-]+$/.test(u.trim());
const NO_ANSWER = "Pixel ne répond pas. Vérifie qu'il est allumé et que ton téléphone est sur le même Wi-Fi.";

export default function App() {
  const [url, setUrl] = useState<string | null | undefined>(undefined);   // undefined: reading it, null: not set up yet
  useEffect(() => { SecureStore.getItemAsync(KEY).then(setUrl, () => setUrl(null)); }, []);
  const save = useCallback(async (u: string) => { await SecureStore.setItemAsync(KEY, u.trim()); setUrl(u.trim()); }, []);
  const forget = useCallback(async () => { await SecureStore.deleteItemAsync(KEY); setUrl(null); }, []);
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={s.fill}>
        {url === undefined ? <ActivityIndicator style={s.fill} color={C.green} />
          : url ? <PixelPage url={url} onForget={forget} /> : <Setup onDone={save} />}
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

/* Pixel's page, full screen */
function PixelPage({ url, onForget }: { url: string; onForget: () => void }) {
  const web = useRef<WebView<object>>(null), canGoBack = useRef(false);   // <object>: its default <undefined> types every prop as never
  const [down, setDown] = useState<string | null>(null);         // why Pixel does not answer
  const [round, setRound] = useState(0);                          // a new round: the page loads again
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack.current) return false;                       // on Pixel's page: the back button leaves the app
      web.current?.goBack(); return true;
    });
    return () => { sub.remove(); deactivateKeepAwake('pixel'); };
  }, []);
  const onMessage = (e: WebViewMessageEvent) => {                 // the page says which mode is on, or that it has no access
    try {
      const m = JSON.parse(e.nativeEvent.data);
      if (m.mode === 'pixel') activateKeepAwakeAsync('pixel'); else if (m.mode) deactivateKeepAwake('pixel');
      if (m.access === false) setDown("Pixel ne reconnaît pas ce téléphone : scanne à nouveau son QR code.");
    } catch { /* not a message for the app */ }
  };
  if (down) {
    return (
      <View style={[s.fill, s.center]}>
        <Text style={s.face}>:(</Text>
        <Text style={s.text}>{down}</Text>
        <Pressable style={s.btn} onPress={() => { setDown(null); setRound(r => r + 1); }}><Text style={s.btnText}>Réessayer</Text></Pressable>
        <Pressable style={s.btnGhost} onPress={onForget}><Text style={s.btnGhostText}>Scanner un autre QR code</Text></Pressable>
      </View>
    );
  }
  return (
    <WebView<object> key={round} ref={web} source={{ uri: url }} style={s.web} originWhitelist={['*']}
      javaScriptEnabled domStorageEnabled setSupportMultipleWindows={false} overScrollMode="never" textZoom={100}
      onMessage={onMessage} onNavigationStateChange={n => { canGoBack.current = n.canGoBack; }}
      onError={() => setDown(NO_ANSWER)}
      onHttpError={e => { if (e.nativeEvent.statusCode === 403) setDown("Pixel refuse ce téléphone : il ne répond qu'aux appareils de la maison."); }}
      onRenderProcessGone={() => setRound(r => r + 1)} />
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
  gapTop: { marginTop: 28 },
  input: { alignSelf: 'stretch', borderWidth: 1, borderColor: C.ink, borderRadius: 10, color: C.green, fontFamily: 'monospace', paddingHorizontal: 12, paddingVertical: 10 },
  btn: { backgroundColor: C.plastic, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 12, marginTop: 6 },
  btnText: { color: C.desk, fontSize: 16, fontWeight: '700' },
  btnGhost: { borderColor: C.ink, borderWidth: 1, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9 },
  btnGhostText: { color: C.plastic, fontSize: 14, fontWeight: '600' },
  off: { opacity: 0.4 },
  scanHint: { position: 'absolute', left: 0, right: 0, bottom: 40, alignItems: 'center', gap: 12 },
});
