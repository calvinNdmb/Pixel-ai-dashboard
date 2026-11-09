/* The phone's notifications for Pixel (off by default): Android's permission, the apps to follow, the title or not, a test.
   The listener itself is native (modules/pixel-native, NotificationRelay) and works with the app closed. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, FlatList, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import PixelNative, { type NotifSettings, type PhoneApp } from '../modules/pixel-native';
import { C } from './theme';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Notifs({ onClose }: { onClose: () => void }) {
  const [st, setSt] = useState<NotifSettings | null>(null);
  const [apps, setApps] = useState<PhoneApp[] | null>(null);
  const [find, setFind] = useState('');
  const [test, setTest] = useState<{ busy?: boolean; ok?: boolean; message?: string }>({});
  const refresh = useCallback(() => { PixelNative?.getNotif().then(setSt, () => {}); }, []);
  useEffect(() => {
    if (!PixelNative) return;
    PixelNative.getNotif().then(n => {
      setSt(n);
      const picked = new Set(n.apps.map(a => a.pkg));
      PixelNative?.listApps().then(list => setApps([...list.filter(a => picked.has(a.pkg)), ...list.filter(a => !picked.has(a.pkg))]), () => setApps([]));
    }, () => {});
    const sub = AppState.addEventListener('change', a => { if (a === 'active') refresh(); });   // back from Android's settings
    return () => sub.remove();
  }, [refresh]);
  const shown = useMemo(() => (apps || []).filter(a => !find.trim() || norm(a.label).includes(norm(find.trim()))), [apps, find]);

  if (!PixelNative) {
    return (
      <View style={[s.fill, s.pad]}>
        <Text style={s.text}>Cette version de l’appli ne sait pas lire les notifications.</Text>
        <Pressable style={s.ghost} onPress={onClose}><Text style={s.ghostText}>Retour</Text></Pressable>
      </View>
    );
  }
  const N = PixelNative;
  const picked = new Map((st?.apps || []).map(a => [a.pkg, a.label]));
  const setOn = (on: boolean) => {
    if (!st) return;
    setSt({ ...st, on }); N.setNotifOn(on).catch(() => {});
    if (on && !st.access) N.openNotifAccess().catch(() => {});
  };
  const setTitle = (title: boolean) => { if (st) { setSt({ ...st, title }); N.setNotifTitle(title).catch(() => {}); } };
  const toggle = (a: PhoneApp) => {
    if (!st) return;
    const next = new Map(picked);
    if (next.has(a.pkg)) next.delete(a.pkg); else next.set(a.pkg, a.label);
    setSt({ ...st, apps: [...next].map(([pkg, label]) => ({ pkg, label })) });
    N.setNotifApps(Object.fromEntries(next)).catch(() => {});
  };
  const sendTest = () => {
    setTest({ busy: true });
    N.sendTest().then(r => setTest(r), () => setTest({ ok: false, message: 'Ça n’a pas marché.' }));
  };

  const header = (
    <View style={s.head}>
      <View style={s.bar}>
        <Pressable style={s.ghost} onPress={onClose} accessibilityRole="button"><Text style={s.ghostText}>‹ Retour</Text></Pressable>
        <Text style={s.title}>NOTIFICATIONS</Text>
      </View>
      <Text style={s.text}>Quand ton téléphone reçoit une notification d’une appli que tu as cochée, Pixel la voit passer et réagit : « Un message ! », « Ça sonne ! ».</Text>

      <Line label="Envoyer les notifications à Pixel" value={!!st?.on} onChange={setOn}
        sub={st?.on ? 'Activé : celles des applis cochées partent vers Pixel, même quand l’appli est fermée.' : 'Désactivé : rien ne part du téléphone.'} />

      {st && !st.access ? (
        <View style={s.box}>
          <Text style={s.text}>Android doit d’abord autoriser Pixel à lire les notifications.</Text>
          <Pressable style={s.btn} onPress={() => N.openNotifAccess().catch(() => {})} accessibilityRole="button"><Text style={s.btnText}>Autoriser dans les réglages</Text></Pressable>
          <Text style={s.small}>Si Android dit « Paramètre restreint » : ouvre les infos de l’appli, touche le menu ⋮ en haut à droite, puis « Autoriser les paramètres restreints », et réessaie.</Text>
          <Pressable style={s.ghost} onPress={() => N.openAppInfo().catch(() => {})} accessibilityRole="button"><Text style={s.ghostText}>Infos de l’appli</Text></Pressable>
        </View>
      ) : st ? <Text style={[s.small, s.ok]}>✓ Android donne les notifications à Pixel.</Text> : null}

      <Line label="Envoyer aussi le titre" value={!!st?.title} onChange={setTitle}
        sub="Souvent l’expéditeur : Pixel affiche « WhatsApp : Maman ». Sinon, seulement le nom de l’appli : « Nouveau message WhatsApp »." />

      <Text style={s.small}>Jamais envoyés : le texte des messages, les notifications silencieuses ou permanentes (musique, GPS, téléchargements), les mises à jour d’une notification déjà vue, ni rien des applis non cochées. Au plus une par appli toutes les 20 secondes.</Text>

      <Pressable style={[s.btn, test.busy && s.off]} disabled={test.busy} onPress={sendTest} accessibilityRole="button">
        <Text style={s.btnText}>{test.busy ? 'Envoi…' : 'Envoyer une notification de test'}</Text>
      </Pressable>
      {test.message ? <Text style={[s.small, test.ok && s.ok]} accessibilityLiveRegion="polite">{test.message}</Text> : null}

      <Text style={s.section}>LES APPLIS · {picked.size} {picked.size > 1 ? 'cochées' : 'cochée'}</Text>
      <TextInput style={s.input} value={find} onChangeText={setFind} placeholder="Chercher une appli" placeholderTextColor={C.ink} autoCorrect={false} />
      {apps === null ? <Text style={s.small}>Lecture des applis…</Text> : null}
    </View>
  );
  return (
    <FlatList style={s.fill} contentContainerStyle={s.list} data={shown} keyExtractor={a => a.pkg} ListHeaderComponent={header}
      keyboardShouldPersistTaps="handled" initialNumToRender={24}
      renderItem={({ item }) => {
        const on = picked.has(item.pkg);
        return (
          <Pressable style={s.row} onPress={() => toggle(item)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
            <View style={[s.check, on && s.checkOn]}>{on ? <Text style={s.checkMark}>✓</Text> : null}</View>
            <Text style={s.rowText} numberOfLines={1}>{item.label}</Text>
          </Pressable>
        );
      }} />
  );
}

function Line({ label, sub, value, onChange }: { label: string; sub: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable style={s.line} onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <View style={s.lineText}>
        <Text style={s.lineLabel}>{label}</Text>
        <Text style={s.small}>{sub}</Text>
      </View>
      <View style={s.noTouch} importantForAccessibility="no-hide-descendants">
        <Switch value={value} trackColor={{ false: C.edge, true: '#2f8f55' }} thumbColor={value ? C.green : C.plastic} />
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: C.desk },
  pad: { padding: 24, gap: 14, justifyContent: 'center' },
  list: { paddingHorizontal: 20, paddingBottom: 32 },
  head: { gap: 14, paddingTop: 8, paddingBottom: 6 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { color: C.plastic, fontSize: 18, fontWeight: '700', letterSpacing: 5, fontFamily: 'monospace' },
  text: { color: C.plastic, fontSize: 15, lineHeight: 21 },
  small: { color: C.soft, fontSize: 13, lineHeight: 18 },
  ok: { color: C.green },
  section: { color: C.ink, fontSize: 12, fontWeight: '700', letterSpacing: 2, marginTop: 10 },
  box: { borderColor: C.edge, borderWidth: 1, borderRadius: 14, padding: 14, gap: 10, alignItems: 'flex-start' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lineText: { flex: 1, gap: 3 },
  lineLabel: { color: C.plastic, fontSize: 16, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: C.ink, borderRadius: 10, color: C.plastic, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 11 },
  rowText: { color: C.plastic, fontSize: 16, flex: 1 },
  check: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: C.green, borderColor: C.green },
  checkMark: { color: C.desk, fontSize: 15, fontWeight: '800', lineHeight: 18 },
  btn: { backgroundColor: C.plastic, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 11, alignSelf: 'flex-start' },
  btnText: { color: C.desk, fontSize: 15, fontWeight: '700' },
  ghost: { borderColor: C.ink, borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, alignSelf: 'flex-start' },
  ghostText: { color: C.plastic, fontSize: 14, fontWeight: '600' },
  off: { opacity: 0.5 },
  noTouch: { pointerEvents: 'none' },                             // the whole line is the switch
});
