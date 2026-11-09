/* The app's own menu, over Pixel, the same on both pages: the back button opens it (once the Pi's page has no history left
   to go back to), and so does "Pixel sur ce téléphone ⋯" under his screen on the phone's Pixel. Nothing of it lies on his
   screen, so it never gets in the way of his gestures (a tap, a swipe, a long press to pet him, a stroke). Back again,
   while it is open: the app closes. */
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import PixelNative from '../modules/pixel-native';
import { C } from './theme';

type Props = {
  where: 'pi' | 'phone' | 'fallback';                    // which Pixel is shown now (fallback: the phone's, while his Pi does not answer)
  host: string | null;                                   // his Pi's address, when one is linked
  onClose(): void; onPi(): void; onPhone(): void; onLink(): void; onForget(): void; onNotifs(): void;
};
const SAYS = { phone: 'Pixel vit sur ce téléphone.', fallback: 'Ton Pixel (Pi) ne répond pas : en attendant, Pixel vit sur ce téléphone.' };

export function PixelMenu({ where, host, onClose, onPi, onPhone, onLink, onForget, onNotifs }: Props) {
  const [sure, setSure] = useState(false);
  const [notif, setNotif] = useState('');
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { BackHandler.exitApp(); return true; });
    return () => sub.remove();
  }, []);
  useEffect(() => { if (!sure) return; const t = setTimeout(() => setSure(false), 4000); return () => clearTimeout(t); }, [sure]);
  useEffect(() => {
    PixelNative?.getNotif().then(n => {
      const apps = `${n.apps.length} ${n.apps.length > 1 ? 'applis' : 'appli'}`;
      setNotif(!n.on ? 'Désactivées' : !n.access ? 'Activées, mais Android ne les donne pas encore à Pixel'
        : host ? `Activées · ${apps} · vers ton Pi` : `Activées sur ce téléphone · ${apps}`);
    }, () => {});
  }, [host]);
  const go = (f: () => void) => () => { onClose(); f(); };
  return (
    <View style={s.veil}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fermer le menu" />
      <View style={s.sheet}>
        <ScrollView contentContainerStyle={s.list} bounces={false}>
          <View style={s.head}>
            <Text style={s.title}>PIXEL</Text>
            {PixelNative?.version ? <Text style={s.small}>Pixel pour Android {PixelNative.version}</Text> : null}
          </View>
          <Text style={s.text}>{where === 'pi' ? `Tu vois ton Pixel, sur ton Pi${host ? ` (${host})` : ''}.` : SAYS[where]}</Text>
          {host && where !== 'pi' ? <Item label="Mon Pixel (Pi)" hint="Les lampes, Claude, Codex, l’agenda…" onPress={go(onPi)} /> : null}
          {where === 'pi' ? <Item label="Pixel sur ce téléphone" hint="Sans le Pi : son visage, le minuteur, la météo…" onPress={go(onPhone)} /> : null}
          {where === 'fallback' ? <Item label="Rester sur ce téléphone" hint="Pixel ne revient plus tout seul sur ton Pi ; « Mon Pixel (Pi) », ici, pour y retourner." onPress={go(onPhone)} /> : null}
          {host ? <Item label="Scanner un autre QR code" hint="Un autre Pi, ou un nouveau code d’accès." onPress={go(onLink)} />
            : <Item label="Relier à mon Pixel" hint="Scanne le QR code de ton Pi, ou tape son adresse : les lampes, Claude, Codex, l’agenda, le partage." onPress={go(onLink)} />}
          {PixelNative ? <Item label="Notifications du téléphone" hint={notif || '…'} onPress={go(onNotifs)} /> : null}
          {host ? <Item label={sure ? 'Sûr ? Touche encore' : 'Oublier mon Pixel'} hint="Le Pixel du téléphone reste tel qu’il est." warn
            onPress={() => { if (!sure) { setSure(true); return; } onClose(); onForget(); }} /> : null}
          <Item label="Quitter l’appli" onPress={() => BackHandler.exitApp()} />
          <Text style={s.small}>{host ? 'Pour montrer une photo, une vidéo ou un lien sur ton Pi : touche Partager dans n’importe quelle appli, puis Pixel.'
            : 'Partager une photo, une vidéo ou un lien sur Pixel : une fois ton Pi relié, ça s’affiche sur son écran.'}</Text>
          <Pressable style={s.close} onPress={onClose} accessibilityRole="button"><Text style={s.closeText}>Fermer</Text></Pressable>
          <Text style={[s.small, s.center]}>Retour encore une fois : l’appli se ferme.</Text>
        </ScrollView>
      </View>
    </View>
  );
}

function Item({ label, hint, onPress, warn }: { label: string; hint?: string; onPress(): void; warn?: boolean }) {
  return (
    <Pressable style={({ pressed }) => [s.item, pressed && s.pressed]} onPress={onPress} accessibilityRole="button" accessibilityHint={hint}>
      <Text style={[s.itemText, warn && s.warn]}>{label}</Text>
      {hint ? <Text style={s.small}>{hint}</Text> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  veil: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: C.desk, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: C.ink },
  list: { padding: 22, paddingBottom: 28, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  title: { color: C.plastic, fontSize: 20, fontWeight: '700', letterSpacing: 6, fontFamily: 'monospace' },
  text: { color: C.plastic, fontSize: 15, lineHeight: 21, marginBottom: 4 },
  item: { borderWidth: 1, borderColor: C.ink, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
  pressed: { backgroundColor: C.bar },
  itemText: { color: C.green, fontSize: 17, fontWeight: '600' },
  warn: { color: C.amber },
  small: { color: C.ink, fontSize: 13 },
  center: { textAlign: 'center' },
  close: { alignSelf: 'center', borderRadius: 999, backgroundColor: C.plastic, paddingHorizontal: 24, paddingVertical: 10, marginTop: 6 },
  closeText: { color: C.desk, fontSize: 15, fontWeight: '700' },
});
