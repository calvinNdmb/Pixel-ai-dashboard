/* The menu's « Clé Claude »: the API key the phone's own Pixel writes his made-to-measure quizzes with (claude.ts), when no
   Pi does it for him. Typed or pasted once, kept in the phone's secure storage, shown again only by its last 4 characters. */
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { LAYER, useBack } from './back';
import { forgetKey, looksLikeKey, readKey, saveKey } from './claude';
import { C } from './theme';

export function ClaudeKey({ onClose }: { onClose(): void }) {
  const [kept, setKept] = useState<string | null | undefined>(undefined);   // undefined: reading it
  const [typed, setTyped] = useState('');
  const [said, setSaid] = useState('');
  useEffect(() => { readKey().then(setKept); }, []);
  useBack(LAYER.notifs, onClose);
  const good = looksLikeKey(typed);
  const save = async () => {
    try { await saveKey(typed); setKept(typed.trim()); setTyped(''); setSaid('Clé enregistrée. Tape « quiz sur les volcans » à Pixel !'); }
    catch { setSaid('Ce téléphone n’a pas pu garder la clé.'); }
  };
  const forget = async () => { await forgetKey(); setKept(null); setSaid('Clé supprimée de ce téléphone.'); };
  return (
    <ScrollView style={s.fill} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>CLÉ CLAUDE</Text>
      <Text style={s.text}>Avec une clé API Claude, Pixel écrit des quiz sur mesure sur ce téléphone, sans Pi : « quiz sur les volcans », « interroge-moi sur les capitales ».</Text>
      <Text style={s.small}>Crée la clé sur console.anthropic.com. Chaque quiz coûte quelques centimes, facturés sur ton compte. Pixel compte la dépense du mois : tape « budget » pour la voir, « budget 10 » pour changer le plafond (30 € au départ). Règle aussi une limite de dépense dans la console : c’est elle qui ne peut pas être dépassée.</Text>
      <Text style={s.small}>La clé reste dans le coffre de ce téléphone et ne part que vers api.anthropic.com.</Text>
      <Text style={s.state}>{kept === undefined ? '…' : kept ? `Une clé est enregistrée (…${kept.slice(-4)}).` : 'Pas de clé pour le moment.'}</Text>
      <TextInput style={s.input} value={typed} onChangeText={t => { setTyped(t); setSaid(''); }} placeholder="sk-ant-…" placeholderTextColor={C.ink}
        autoCapitalize="none" autoCorrect={false} secureTextEntry accessibilityLabel="Clé API Claude" />
      {typed && !good ? <Text style={s.small}>Une clé Claude commence par sk-ant-.</Text> : null}
      <Pressable style={[s.btn, !good && s.off]} disabled={!good} onPress={save} accessibilityRole="button"><Text style={s.btnText}>Enregistrer</Text></Pressable>
      {kept ? <Pressable style={s.ghost} onPress={forget} accessibilityRole="button"><Text style={s.warn}>Supprimer la clé</Text></Pressable> : null}
      {said ? <Text style={s.text}>{said}</Text> : null}
      <Pressable style={s.ghost} onPress={onClose} accessibilityRole="button"><Text style={s.ghostText}>Retour à Pixel</Text></Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: C.desk },
  pad: { padding: 24, gap: 14, alignItems: 'stretch' },
  title: { color: C.plastic, fontSize: 20, fontWeight: '700', letterSpacing: 6, fontFamily: 'monospace' },
  text: { color: C.plastic, fontSize: 16, lineHeight: 23 },
  small: { color: C.ink, fontSize: 13, lineHeight: 19 },
  state: { color: C.green, fontSize: 15, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: C.ink, borderRadius: 10, color: C.green, fontFamily: 'monospace', paddingHorizontal: 12, paddingVertical: 12, fontSize: 16 },
  btn: { alignSelf: 'center', backgroundColor: C.plastic, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 12 },
  btnText: { color: C.desk, fontSize: 16, fontWeight: '700' },
  ghost: { alignSelf: 'center', borderColor: C.ink, borderWidth: 1, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  ghostText: { color: C.plastic, fontSize: 14, fontWeight: '600' },
  warn: { color: C.amber, fontSize: 14, fontWeight: '600' },
  off: { opacity: 0.4 },
});
