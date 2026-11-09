/* The app's own little menu, over Pixel: the back button opens it (Pixel's page has no history to go back to), and so does
   "Pixel sur ce téléphone ⋯" under his screen on the phone's Pixel. Nothing of it lies on his screen, so it never gets in the
   way of his gestures (a tap, a swipe, a long press to pet him, a stroke). Back again, while it is open: the app closes. */
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text } from 'react-native';

const C = { desk: '#141713', plastic: '#d9d2bd', ink: '#7c745c', green: '#46ff82', amber: '#ffb347' };
type Props = {
  where: 'pi' | 'phone';                                 // which Pixel is shown now
  host: string | null;                                   // his Pi's address, when one is linked
  onClose(): void; onPi(): void; onPhone(): void; onLink(): void; onForget(): void;
};

export function PixelMenu({ where, host, onClose, onPi, onPhone, onLink, onForget }: Props) {
  const [sure, setSure] = useState(false);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { BackHandler.exitApp(); return true; });
    return () => sub.remove();
  }, []);
  useEffect(() => { if (!sure) return; const t = setTimeout(() => setSure(false), 4000); return () => clearTimeout(t); }, [sure]);
  const go = (f: () => void) => () => { onClose(); f(); };
  return (
    <Pressable style={s.veil} onPress={onClose} accessibilityLabel="Fermer le menu">
      <Pressable style={s.sheet} onPress={() => {}}>
        <Text style={s.title}>PIXEL</Text>
        <Text style={s.text}>{where === 'phone' ? 'Pixel vit sur ce téléphone.' : `Tu vois ton Pixel, sur ton Pi${host ? ` (${host})` : ''}.`}</Text>
        {host && where === 'phone' ? <Item label="Mon Pixel (Pi)" hint="Les lampes, Claude, Codex, l’agenda…" onPress={go(onPi)} /> : null}
        {where === 'pi' ? <Item label="Pixel sur ce téléphone" hint="Sans le Pi : son visage, le minuteur, la météo…" onPress={go(onPhone)} /> : null}
        <Item label="Relier à mon Pixel" hint="Scanne le QR code de ton Pi, ou tape son adresse." onPress={go(onLink)} />
        {host ? <Item label={sure ? 'Sûr ? Touche encore' : 'Oublier mon Pixel'} hint="Le Pixel du téléphone reste tel qu’il est." warn
          onPress={() => { if (!sure) { setSure(true); return; } onClose(); onForget(); }} /> : null}
        <Pressable style={s.close} onPress={onClose} accessibilityRole="button"><Text style={s.closeText}>Fermer</Text></Pressable>
        <Text style={s.small}>Retour encore une fois : l’appli se ferme.</Text>
      </Pressable>
    </Pressable>
  );
}

function Item({ label, hint, onPress, warn }: { label: string; hint: string; onPress(): void; warn?: boolean }) {
  return (
    <Pressable style={({ pressed }) => [s.item, pressed && s.pressed]} onPress={onPress} accessibilityRole="button" accessibilityHint={hint}>
      <Text style={[s.itemText, warn && s.warn]}>{label}</Text>
      <Text style={s.small}>{hint}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  veil: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.desk, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: C.ink, padding: 22, paddingBottom: 28, gap: 10 },
  title: { color: C.plastic, fontSize: 20, fontWeight: '700', letterSpacing: 6, fontFamily: 'monospace' },
  text: { color: C.plastic, fontSize: 15, lineHeight: 21, marginBottom: 4 },
  item: { borderWidth: 1, borderColor: C.ink, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
  pressed: { backgroundColor: '#22231f' },
  itemText: { color: C.green, fontSize: 17, fontWeight: '600' },
  warn: { color: C.amber },
  small: { color: C.ink, fontSize: 13 },
  close: { alignSelf: 'center', borderRadius: 999, backgroundColor: C.plastic, paddingHorizontal: 24, paddingVertical: 10, marginTop: 6 },
  closeText: { color: C.desk, fontSize: 15, fontWeight: '700' },
});
