/* A Pi is linked: his page (App.tsx PixelPage), as before. When the Pi does not answer (the page does not load, or not in
   time, or with an HTTP error, or it is not Pixel's page at all, or it says it lost the Pi for a while, the phone offline…),
   Pixel goes on living on the phone (LocalPixel.tsx), with a small banner, never a dead end. Meanwhile the app quietly asks
   the Pi again, less and less often (5 s, 10 s… then every 2 minutes; never while the app is in the background), and when
   Pixel's own server answers:
   - nobody is using the phone's Pixel (untouched for a minute, no timer running there): back to the Pi by itself, so that a
     phone left on its stand finds the real Pixel again;
   - otherwise one tap on the banner ("Revenir"): a cuddle, a command being typed or a timer is never cut short.
   While the Pi's page is shown, the app reads its last snapshot (seedPlug) so that the phone's Pixel looks like him. */
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ComponentType, type Ref } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { LocalPixel, type LocalHandle } from './LocalPixel';
import { saveSeed } from './localStore';
import { PLUGS, type PageMessage, type Plug } from './webBridge';

const C = { desk: '#141713', plastic: '#d9d2bd', ink: '#7c745c', green: '#46ff82', amber: '#ffb347', bar: '#22231f' };
const LOAD_MS = 15000, QUIET_MS = 15000, LOST_MS = 10000, IDLE_MS = 60000, FIRST_MS = 5000, MAX_MS = 120000, BACK_MS = 20000;
export type Why = 'down' | 'refus';
export type PiLink = {
  onLoaded(): void;                                      // the page loaded
  onDown(why: Why): void;                                // it did not load (an HTTP error too), or the Pi refuses this phone
  onMessage(m: PageMessage): void;                       // its messages (from the Pi's own address only): {pi}, {mode}, {access}
  onMenu(): void;
};
type Timer = { current: ReturnType<typeof setTimeout> | undefined };
const stop = (...ts: Timer[]) => { for (const t of ts) { clearTimeout(t.current); t.current = undefined; } };
export type LinkedHandle = { retry(): void };       // the menu's "Mon Pixel (Pi)" while the phone's Pixel stands in: try him now
type Props = {
  url: string; Page: ComponentType<{ url: string; link: PiLink }>;
  ref?: Ref<LinkedHandle>;
  onMenu(): void; onRelink(): void; onWhere?(where: 'pi' | 'phone'): void;
};

/* the seed: app.js keeps the last snapshot in the Pi page's localStorage (pixel_snap); read it once loaded, then every minute */
const READ_SNAP = "(function(){try{var s=localStorage.getItem('pixel_snap');if(s&&s.length<500000&&window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({pi_snap:s}));}catch(e){}})();";
const seedTimers = new WeakMap<object, ReturnType<typeof setInterval>>();
let lastSeed = '';
const seedPlug: Plug = {
  ready(page) {
    if (page.kind !== 'pi') return;
    clearInterval(seedTimers.get(page)); page.inject(READ_SNAP);
    seedTimers.set(page, setInterval(() => page.inject(READ_SNAP), 60000));
  },
  gone(page) { clearInterval(seedTimers.get(page)); seedTimers.delete(page); },
  message(m, page) {
    if (page.kind !== 'pi' || typeof m.pi_snap !== 'string' || m.pi_snap === lastSeed) return;
    lastSeed = m.pi_snap; saveSeed(m.pi_snap);
  },
};
PLUGS.push(seedPlug);

/* does Pixel answer? His WebSocket address asked without the upgrade: his server (aiohttp) says 400, or 403 with his own words
   if it refuses this phone. Anything else answering there (an error, a captive portal, another device) is not Pixel. */
async function probe(url: string): Promise<'up' | Why> {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await fetch(url.replace(/\/?\?t=/, '/ws?t='), { signal: ctl.signal, cache: 'no-store' });
    if (r.status === 400 || r.status === 426) return 'up';
    if (r.status === 403 && /pixel/i.test((await r.text()).slice(0, 500))) return 'refus';
    return 'down';
  } catch { return 'down'; } finally { clearTimeout(t); }
}

export function Linked({ ref, url, Page, onMenu, onRelink, onWhere }: Props) {
  const [on, setOn] = useState<'pi' | 'phone'>('pi');
  const [why, setWhy] = useState<Why | null>(null);
  const [back, setBack] = useState(false);              // the Pi answers again
  const [hidden, setHidden] = useState(false);          // the banner closed (until something changes)
  const [round, setRound] = useState(0);                // each visit to the Pi: a new page
  const local = useRef<LocalHandle>(null), fails = useRef(0), upSince = useRef(0), backRef = useRef(false);
  useEffect(() => { backRef.current = back; }, [back]);
  useEffect(() => { onWhere?.(on); }, [on, onWhere]);
  const down = useCallback((w: Why) => {
    if (w === 'down' && upSince.current && Date.now() - upSince.current > MAX_MS) fails.current = 0;   // he had been up a good while
    fails.current++; upSince.current = 0;
    setWhy(w); setBack(false); setHidden(false); setOn('phone');
  }, []);
  const goPi = useCallback(() => { setOn('pi'); setWhy(null); setBack(false); setRound(r => r + 1); }, []);
  useImperativeHandle(ref, () => ({ retry: goPi }), [goPi]);

  /* the Pi's page: loaded in time, Pixel's own page, and the Pi it talks to still there */
  const loadT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), lostT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const quietT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), heard = useRef(false);
  useEffect(() => {
    if (on !== 'pi') return;
    heard.current = false;
    loadT.current = setTimeout(() => down('down'), LOAD_MS);
    return () => stop(loadT, lostT, quietT);
  }, [on, round, down]);
  const link = useMemo<PiLink>(() => ({
    onLoaded() {                                         // loaded, but a page that never speaks like Pixel's (an error page…): the phone's Pixel
      stop(loadT);
      if (!heard.current && !quietT.current) quietT.current = setTimeout(() => { quietT.current = undefined; down('down'); }, QUIET_MS);
    },
    onDown: down,
    onMessage(m) {
      if (m.pi === true || typeof m.mode === 'string') { heard.current = true; stop(quietT); }   // Pixel's page (an older Pi's page never says {pi}: its {mode} will do)
      if (m.pi === true) { stop(lostT, loadT); if (!upSince.current) upSince.current = Date.now(); }
      if (m.pi === false && !lostT.current) lostT.current = setTimeout(() => { lostT.current = undefined; down('down'); }, LOST_MS);   // app.js retries meanwhile
      if (m.access === false) down('refus');
    },
    onMenu,
  }), [down, onMenu]);

  /* the phone's Pixel: ask the Pi again, less and less often; never in the background */
  useEffect(() => {
    if (on !== 'phone' || why === 'refus') return;
    let alive = true, delay = Math.min(MAX_MS, FIRST_MS * 2 ** Math.min(5, fails.current - 1)), t: ReturnType<typeof setTimeout> | undefined;
    const next = (ms: number) => { clearTimeout(t); t = setTimeout(tick, ms); };
    async function tick() {
      if (!alive || AppState.currentState !== 'active') return;          // back in the foreground: the AppState listener asks again
      const r = await probe(url);
      if (!alive) return;
      if (r === 'up') { if (!backRef.current) setHidden(false); setBack(true); local.current?.ping(); next(BACK_MS); return; }   // the answer: onIdle; a closed banner stays closed
      setBack(false); if (r === 'refus') { setWhy('refus'); return; }
      next(delay); delay = Math.min(MAX_MS, delay * 2);
    }
    next(delay);
    const sub = AppState.addEventListener('change', st => { if (st === 'active') { delay = FIRST_MS; next(800); } else clearTimeout(t); });
    return () => { alive = false; clearTimeout(t); sub.remove(); };
  }, [on, why, url]);
  const onIdle = useCallback((idle: number, busy: boolean) => { if (backRef.current && idle >= IDLE_MS && !busy) goPi(); }, [goPi]);

  if (on === 'pi') return <Page key={round} url={url} link={link} />;
  const text = back ? 'Ton Pixel (Pi) répond à nouveau' : why === 'refus' ? 'Ton Pixel (Pi) ne reconnaît pas ce téléphone : Pixel vit sur ton téléphone'
    : 'Ton Pixel (Pi) ne répond pas : Pixel vit sur ton téléphone';
  return (
    <View style={s.fill}>
      {hidden ? null : (
        <View style={s.banner} accessibilityRole="alert">
          <Text style={s.text} numberOfLines={2}>{text}</Text>
          {back ? <Btn label="Revenir" onPress={goPi} /> : why === 'refus' ? <Btn label="Relier" onPress={onRelink} /> : null}
          <Pressable onPress={() => setHidden(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cacher ce message"><Text style={s.x}>×</Text></Pressable>
        </View>
      )}
      <LocalPixel ref={local} onMenu={onMenu} onIdle={onIdle} />
    </View>
  );
}

function Btn({ label, onPress }: { label: string; onPress(): void }) {
  return <Pressable style={s.btn} onPress={onPress} accessibilityRole="button"><Text style={s.btnText}>{label}</Text></Pressable>;
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: C.desk },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.bar, borderBottomWidth: 1, borderColor: C.ink },
  text: { flex: 1, color: C.plastic, fontSize: 13, lineHeight: 17 },
  btn: { backgroundColor: C.plastic, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  btnText: { color: C.desk, fontSize: 13, fontWeight: '700' },
  x: { color: C.ink, fontSize: 22, lineHeight: 22, paddingHorizontal: 4 },
});
