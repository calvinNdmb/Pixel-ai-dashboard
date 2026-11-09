/* Pixel sans Pi: the phone app's own Pixel (pixel-mobile), with no Raspberry Pi at all.
   The app's bundle (tools/build_app_bundle.py) sets window.PIXEL_LOCAL and loads, just before app.js, Pixel Lab's in-page
   stand-in for the server (lab/demo-hub.js: the same state, actions and commands) and this file, which makes it a real Pixel:
   - nothing fake: what needs the Pi (the lights, Claude, Codex, the agenda, casting, power) says so on its screen and when
     asked; Système shows the phone's own measures; the weather is real (Open-Meteo, for the city you type) or not there;
   - app.js talks to it through PixelLocal.socket(), shaped like its WebSocket (the Pi's path stays as it is);
   - what matters survives a restart: his theme, settings, lasting mood, timer, city, and every other part of his state that
     is not the Pi's (a new feature's S[key] comes along by itself; one whose truth is in a closure says how to take it back:
     restorable() in demo-hub.js). It is kept in localStorage and sent to the app ({local_save}, window.ReactNativeWebView),
     which hands it back before the page starts (window.PIXEL_LOCAL_STATE: its copy, and the last snapshot of his Pi, so that
     he is the same Pixel). The newest wins (what you last did here, or his Pi's snapshot); nothing goes back to the Pi;
   - the phone's notifications, when you switched them on in the app: PixelLocal.notif() shows them as his Pi would.
   Every action demo-hub.js has works here with no extra wiring, but those named in PI below: they need the Pi.
   Without window.PIXEL_LOCAL this file does nothing. */
window.PixelLocal = (() => {
if (!window.PIXEL_LOCAL || !window.PixelHub || !window.PixelHub.local) return null;
const hub = window.PixelHub, S = hub.S, H = hub.local, A = H.A, Sc = typeof Screens !== 'undefined' ? Screens : null;
const $ = id => document.getElementById(id);
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const clone = v => JSON.parse(JSON.stringify(v));
const post = m => { try { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch { /* not in the app */ } };

/* ---------- what needs the Pi ---------- */
const PI_SAYS = 'Relie Pixel à ton Pi pour ça';
const OFF = {                       // these screens: their honest message (screens.js drawSolo)
  lumieres: 'Les lampes Hue se règlent par ton Pi.',
  claude: 'Claude te répond depuis ton Pi, avec ta clé API.',
  codex: 'Codex travaille sur ton Pi, dans ton dossier de projet.',
  agenda: 'Tes agendas Google et Samsung arrivent par ton Pi.',
};
/* actions that need the Pi, by prefix, and what Pixel says instead; a new one: add its prefix here */
const PI = [
  [/^lights\./, "c'est lui qui allume les lampes."], [/^chat\./, 'Claude te répond depuis ton Pi.'], [/^codex\./, 'Codex travaille sur ton Pi.'],
  [/^agenda\./, 'ton agenda arrive par ton Pi.'], [/^(cast|ytcast|yt|ecran|airplay)\./, "le partage d'écran et YouTube passent par son écran."],
  [/^sys\.power$/, "Pixel n'éteint pas ton téléphone."], [/^poche\.voyage$/, 'Pixel vit déjà sur ce téléphone.'],
];
const piSays = name => { for (const [re, why] of PI) if (re.test(name)) return `${PI_SAYS} : ${why}`; return null; };
for (const name of Object.keys(A)) { const why = piSays(name); if (why) A[name] = () => H.toast(why, 4500); }
if (!A['theme.step']) A['theme.step'] = ({ d = 1 } = {}) => {        // server.py theme.step (the quick menu's < and >)
  const T = hub.THEMES; if (T.length < 2) return H.toast(`Pour le moment, seul le thème ${T[0].name} est activé.`, 4000);
  const i = Math.max(0, T.findIndex(t => t.id === S.view.theme)); A['theme.set']({ name: T[(i + Math.trunc(Number(d) || 1) + T.length) % T.length].id });
};

/* ---------- nothing fake: the lab's sample data goes, the honest words come ---------- */
Object.assign(S.lights, { status: 'sur ton Pi', rooms: [], scenes: [] });
Object.assign(S.chat, { phase: 'idle', status: 'sur ton Pi', messages: [] });
Object.assign(S.codex, { task: '', running: false, status: '', lines: [] });
S.agenda = { status: 'Relie Pixel à ton Pi pour voir ton agenda.', events: [] };
for (const k of Object.keys(S.sys)) delete S.sys[k];
Object.assign(S.sys, { bright: 1, hw_bright: false });
Object.assign(S.settings, { url: '', ip_url: '', qr: [], ecran: {}, demo: false, claude: 'sur ton Pi', deck: 'sur ton Pi', local: true });
Object.assign(S.timer, { done: 0 });
S.weather = null;
H.themes(hub.ALLT.map(t => t.id));  // every theme: no config.toml here (his Pi's snapshot, when it comes, has the Pi's own list)
const LINK = '«\u00a0Relier\u00a0à\u00a0mon\u00a0Pixel\u00a0»';   // the app menu's item, never cut across two lines
S.solo = {
  pi: PI_SAYS, off: OFF, rows: {}, boot: [],
  hint: 'Sur ce téléphone : son visage, ses humeurs, le minuteur, la météo, les réglages',
  note: {
    reglages: { title: 'PIXEL VIT SUR CE TÉLÉPHONE', head: 'Pas de Pi relié', text: `Pour les lampes, Claude, Codex et l'agenda : appuie sur le bouton retour du téléphone, puis sur ${LINK}.` },
    phone: { head: 'Pixel vit sur ce téléphone', text: `Pour le relier à ton Pi : appuie sur le bouton retour du téléphone, puis sur ${LINK}, et scanne le QR code que montre ton Pi.` },
  },
};

/* ---------- Système: the phone's own measures, only what it really says ---------- */
const t0 = Date.now(), fr = n => String(Math.round(n * 10) / 10).replace('.', ',');
let bat = null;
const dur = ms => { const m = Math.floor(ms / 60000); return m < 1 ? "moins d'une minute" : m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0'); };
function sysRows() {
  const rows = [], c = navigator.connection;
  if (bat) rows.push(['BATTERIE', Math.round(bat.level * 100) + ' %' + (bat.charging ? ' · en charge' : '')]);
  rows.push(['RÉSEAU', navigator.onLine === false ? 'hors ligne' : c && c.type === 'wifi' ? 'Wi-Fi' : c && c.type === 'cellular' ? 'données mobiles' : 'en ligne']);
  rows.push(['ÉCRAN', `${screen.width} × ${screen.height} · ×${fr(devicePixelRatio || 1)}`]);
  if (navigator.hardwareConcurrency) rows.push(['PROCESSEUR', navigator.hardwareConcurrency + ' cœurs']);
  rows.push(['LUMINOSITÉ', Math.round((S.sys.bright || 1) * 100) + ' % (son visage)']);
  rows.push(['OUVERT DEPUIS', dur(Date.now() - t0)]);
  const boot = [['Téléphone', navigator.hardwareConcurrency ? navigator.hardwareConcurrency + ' cœurs' : '', true], ['Écran', `${screen.width}x${screen.height}`, true],   // his boot check (screens.js)
    ...(bat ? [['Batterie', Math.round(bat.level * 100) + ' %', true]] : []), ['Ton Pi', 'pas relié', false]];
  const before = JSON.stringify([S.solo.rows.systeme, S.solo.boot]); S.solo.rows.systeme = rows; S.solo.boot = boot;
  if (JSON.stringify([rows, boot]) !== before) H.mark();
}
if (navigator.getBattery) navigator.getBattery().then(b => { bat = b; b.addEventListener('levelchange', sysRows); b.addEventListener('chargingchange', sysRows); sysRows(); }, () => {});
addEventListener('online', sysRows); addEventListener('offline', sysRows);
setInterval(() => { if (!document.hidden && Sc && Sc.local.scr === 'systeme') sysRows(); }, 5000);
sysRows();

/* ---------- the weather: Open-Meteo (no key), for the city you type; offline, the last one of the day, or a word ---------- */
const DAYS = ['DIM.', 'LUN.', 'MAR.', 'MER.', 'JEU.', 'VEN.', 'SAM.'], FULL = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
function kind(code) {                                     // weather.py kind()
  if (code === 0 || code === 1) return ['soleil', code === 0 ? 'Ensoleillé' : 'Plutôt ensoleillé'];
  if (code === 2 || code === 3) return ['nuage', code === 2 ? 'Éclaircies' : 'Couvert'];
  if (code === 45 || code === 48) return ['nuage', 'Brouillard'];
  if (code >= 51 && code <= 57) return ['pluie', 'Bruine'];
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return ['pluie', code < 80 ? 'Pluie' : 'Averses'];
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['neige', 'Neige'];
  if (code >= 95) return ['orage', 'Orage'];
  return ['nuage', 'Nuageux'];
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
let city = null, wcache = null, wAt = 0, wreq = 0, wlive = false;   // city: {name, lat, lon}; wcache: {date, city, data}; wreq: the newest request
const NO_CITY = 'Tape « météo » et ta ville, par exemple « météo Lyon » : Pixel demande la météo à Open-Meteo.';
async function getJSON(url) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 10000);
  try { const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(t); }
}
function showWeather() {
  if (!city) S.weather = { error: NO_CITY };
  else if (wcache && wcache.date === today() && wcache.city === city.name) S.weather = clone(wcache.data);
  else S.weather = { error: `Météo de ${city.name} : elle arrive dès que le téléphone a du réseau.` };
  H.mark();
}
async function weather(say = false, prev = null) {    // prev: the city before « météo … », kept if the new one is not found
  if (!city) { showWeather(); return; }
  const n = ++wreq, mine = () => n === wreq;             // a newer request (another city, a retry) wins: this answer is dropped
  let c = city; wlive = true;
  try {
    if (c.lat == null) {
      const g = await getJSON('https://geocoding-api.open-meteo.com/v1/search?count=1&language=fr&format=json&name=' + encodeURIComponent(c.name));
      if (!mine()) return;
      const r = (g.results || [])[0];
      if (!r) {                                          // a typo, or not a city: the one he had stays
        if (prev && prev.city) ({ city, wcache, wAt } = prev); else { city = null; wcache = null; }
        showWeather(); if (!city) S.weather = { error: `Ville introuvable : ${c.name}. ${NO_CITY}` };
        H.toast(`VILLE INTROUVABLE : ${c.name.toUpperCase()}`, 4000); H.mark();
        if (city && !(wcache && wcache.date === today())) setTimeout(refresh);
        return;
      }
      c = city = { name: String(r.name), lat: Number(r.latitude), lon: Number(r.longitude) };
    }
    const j = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&timezone=auto&forecast_days=5`
      + '&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,relative_humidity_2m_mean');
    if (!mine()) return;
    const cur = j.current, d = j.daily, hum = d.relative_humidity_2m_mean || [];
    const days = d.time.slice(0, 5).map((day, i) => {
      const [y, m, dd] = day.split('-').map(Number), wd = new Date(y, m - 1, dd).getDay(), [k, label] = kind(d.weather_code[i]);
      return { name: i ? DAYS[wd] : 'AUJ.', full: i ? FULL[wd] : "Aujourd'hui", tmax: Math.round(d.temperature_2m_max[i]), tmin: Math.round(d.temperature_2m_min[i]),
        kind: k, label, wind: Math.round(d.wind_speed_10m_max[i]), hum: Math.round(hum[i] || 0) };
    });
    const [k, label] = kind(cur.weather_code);
    const data = { city: c.name, days, now: { t: Math.round(cur.temperature_2m), kind: k, label, wind: Math.round(cur.wind_speed_10m), hum: Math.round(cur.relative_humidity_2m) } };
    wcache = { date: today(), city: c.name, data }; wAt = Date.now();
    S.weather = clone(data); H.mark();
    if (say) A['weather.say']();
  } catch {
    if (!mine()) return;
    showWeather();                                        // no network (or Open-Meteo away): the last one of the day, or a word
    if (say) H.toast('PAS DE RÉSEAU : LA MÉTÉO REVIENDRA TOUTE SEULE', 4000);
  } finally { if (mine()) wlive = false; }
}
const refresh = () => { if (city && !wlive) weather(); };   // by itself (time, network, back on screen): not while one is on its way
function setCity(name) {
  name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80); if (!name) return;
  const prev = city ? { city, wcache, wAt } : null;
  city = { name }; wcache = null; wAt = 0; S.view.meteo_day = 0; A['screen.show']({ screen: 'meteo' });
  S.weather = { error: `Météo de ${name}…` }; H.mark(); weather(true, prev);
}
const wsay = A['weather.say'];
A['weather.say'] = args => { if (!S.weather || !S.weather.days) return H.toast(city ? 'LA MÉTÉO ARRIVE DÈS QUE LE TÉLÉPHONE A DU RÉSEAU' : 'TAPE « MÉTÉO » ET TA VILLE', 4000); return wsay(args); };
setInterval(() => { if (!document.hidden && Date.now() - wAt > 30 * 60000) refresh(); }, 60000);
addEventListener('online', () => { if (Date.now() - wAt > 10 * 60000) refresh(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - wAt > 30 * 60000) refresh(); });

/* ---------- typed commands: the city, the help; the rest is demo-hub's parser, and what needs Claude says so ---------- */
const HELP = "minuteur 10 · pause · humeur content · anim danse · animations · fais le poisson · scènes · visage vivant · thème … · météo Lyon (ta ville) · le reste (lampes, Claude, Codex, agenda) : relie Pixel à ton Pi";
const cmd0 = A.cmd;                 // any other text goes to Claude (chat.ask): on the Pi, so he says so
A.cmd = ({ text } = {}) => {
  const raw = String(text ?? '').trim(), t = hub.norm(raw); let m;
  if (['aide', 'help', '?', '/aide'].includes(t)) return H.toast(HELP, 9000);
  if ((m = raw.match(/^(?:m[ée]t[ée]o|ville)\s+(?:(?:à|a|de|pour)\s+)?(.+)$/i)) && !/^(demain|aujourd'?hui|semaine)$/.test(hub.norm(m[1]))) return setCity(m[1]);
  return cmd0({ text: raw });
};

/* ---------- his face's brightness: the phone has no backlight to set, so his screen dims (Lumi. −/+, the quick menu) ---------- */
let dim = '';
function brightness() { const b = S.sys.bright || 1, f = b < 1 ? `brightness(${b})` : ''; if (f !== dim && $('screen')) { dim = f; $('screen').style.filter = f; } }

/* ---------- what is kept: his look, his settings and brightness, a lasting mood, the timer, the city, and the rest that is not the Pi's ---------- */
const KEY = 'pixel_local', MAX = 200 * 1024, ITEM = 64 * 1024;
const SKIP = new Set(['screen', 'mood', 'view', 'settings', 'timer', 'weather', 'anim', 'scene', 'toast', 'act', 'boot_at', 'keys', 'server_now', 'kept_at',
  'lights', 'chat', 'codex', 'agenda', 'sys', 'poche', 'cast', 'cast_recent', 'airplay', 'solo', 'yt', 'ytcast']);   // live, or the Pi's
const VIEW = ['theme', 'face', 'units_f', 'crt_off'], TIMER = ['mode', 'total', 'left', 'running', 'ends_at', 'done'];
function pick() {
  const st = { v: 1, at: 0, view: {}, settings: { themes: [...(S.settings.themes || [])], sleep_min: S.settings.sleep_min }, sys: { bright: S.sys.bright }, timer: {}, extra: {} };
  for (const k of VIEW) if (k in S.view) st.view[k] = S.view[k];
  for (const k of TIMER) st.timer[k] = S.timer[k];
  if (S.mood && S.mood.name !== 'neutre' && !S.mood.until) st.mood = { name: S.mood.name };   // a lasting mood (asleep…)
  if (city) st.city = { ...city };
  if (wcache) st.wcache = wcache;
  for (const k of Object.keys(S)) {
    if (SKIP.has(k) || S[k] === undefined || typeof S[k] === 'function') continue;
    const s = JSON.stringify(S[k]); if (s !== undefined && s.length <= ITEM) st.extra[k] = JSON.parse(s);
  }
  return st;
}
function fromPi(p) {                // his Pi's last snapshot (app.js pixel_snap): the same look, settings, city and the rest
  if (!isObj(p) || !isObj(p.view)) return null;
  const st = { v: 1, at: Number(p.kept_at) || 0, pi: true, view: {}, settings: {}, extra: {} };
  for (const k of VIEW) if (k in p.view) st.view[k] = p.view[k];
  if (isObj(p.settings)) { if (Array.isArray(p.settings.themes)) st.settings.themes = p.settings.themes; if (p.settings.sleep_min) st.settings.sleep_min = p.settings.sleep_min; }
  if (isObj(p.weather) && typeof p.weather.city === 'string' && !(p.settings && p.settings.demo)) st.city = { name: p.weather.city };
  for (const k of Object.keys(p)) if (!SKIP.has(k)) st.extra[k] = p[k];
  return st;
}
function merge(o, k, v) {           // in place, so that what demo-hub.js holds on to stays the same object
  const cur = o[k];
  if (isObj(cur) && isObj(v)) { for (const kk of Object.keys(v)) cur[kk] = clone(v[kk]); }
  else if (Array.isArray(cur) && Array.isArray(v)) cur.splice(0, cur.length, ...clone(v));
  else if (cur === null || cur === undefined || typeof cur === typeof v) o[k] = clone(v);
}
const num = (v, lo, hi) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.max(lo, Math.min(hi, Number(v))) : null);
function apply(st) {
  if (Array.isArray(st.settings && st.settings.themes)) H.themes(st.settings.themes.filter(id => typeof id === 'string'));
  const v = isObj(st.view) ? st.view : {};
  if (hub.THEMES.some(t => t.id === v.theme)) S.view.theme = v.theme;
  if (hub.FACES[v.face] && (v.face !== 'pack' || hub.ANIMS.length)) S.view.face = v.face;
  for (const k of ['units_f', 'crt_off']) if (typeof v[k] === 'boolean') S.view[k] = v[k];
  const sl = num(st.settings && st.settings.sleep_min, 1, 240); if (sl) S.settings.sleep_min = sl;
  const br = num(st.sys && st.sys.bright, 0.3, 1); if (br) S.sys.bright = Math.round(br * 10) / 10;   // his face's brightness here (not the Pi's screen)
  if (isObj(st.mood) && typeof st.mood.name === 'string' && hub.MOODS.some(m => m.id === st.mood.name)) S.mood = { name: st.mood.name, until: 0 };
  if (isObj(st.timer)) {
    const t = st.timer, total = num(t.total, 60, 10800), left = num(t.left, 0, 10800), ends = num(t.ends_at, 0, 1e15), done = num(t.done, 0, 1e6);
    if (total) Object.assign(S.timer, { mode: typeof t.mode === 'string' ? t.mode.slice(0, 40) : 'TRAVAIL', total, left: left ?? total, running: !!t.running && !!ends, ends_at: ends || 0, done: done || 0 });
    if (S.timer.running && Date.now() - S.timer.ends_at > 10 * 60000) {                // it rang long ago, while the app was closed
      Object.assign(S.timer, { left: 0, running: false }); if (S.timer.mode === 'TRAVAIL') S.timer.done++;
    }
  }
  if (isObj(st.city) && typeof st.city.name === 'string' && st.city.name.trim()) {
    const c = st.city, same = city && city.name === c.name;
    city = { name: c.name.trim().slice(0, 80), ...(Number.isFinite(c.lat) && Number.isFinite(c.lon) ? { lat: c.lat, lon: c.lon } : same && city.lat != null ? { lat: city.lat, lon: city.lon } : {}) };
  }
  if (isObj(st.wcache) && isObj(st.wcache.data) && Array.isArray(st.wcache.data.days) && city && st.wcache.city === city.name) wcache = st.wcache;
  const own = H.restorers ? H.restorers() : {};   // a feature whose truth is in a closure takes its value back itself (demo-hub.js restorable)
  if (isObj(st.extra)) for (const k of Object.keys(st.extra)) {
    if (SKIP.has(k)) continue;
    if (own[k]) { try { own[k](clone(st.extra[k])); } catch (e) { console.warn('Pixel sans Pi: not restored:', k, e); } }
    else if (k in S) merge(S, k, st.extra[k]);
  }
}
/* stamp: how recent what he has is: the newest source restored, or the last thing you did here. His own life (the timer
   ringing, a feature's clock, the weather of the day) is kept too, but does not make him newer than his Pi's snapshot. */
let stamp = 0, body = '', wbody = '', saveT = 0, ready = false, user = false;
const shape = st => JSON.stringify({ ...st, at: 0, wcache: 0 }), wshape = st => JSON.stringify(st.wcache || null);
const dispatch0 = hub.dispatch;
hub.dispatch = (action, args) => { user = true; return dispatch0(action, args); };   // an action: you (app.js, the keys, the commands)
function restore(given) {           // the app's copy, his Pi's last snapshot, localStorage: the oldest first, the newest last
  const list = [];
  try { const ls = JSON.parse(localStorage.getItem(KEY)); if (isObj(ls) && ls.v === 1) list.push(ls); } catch { /* none, or no storage */ }
  if (isObj(given)) {
    if (isObj(given.state) && given.state.v === 1) list.push(given.state);
    const pi = fromPi(given.seed); if (pi) list.push(pi);
  }
  const at = st => Number(st.at) || 0, fresh = list.filter(st => !stamp || at(st) > stamp).sort((a, b) => at(a) - at(b));
  if (!fresh.length) return false;
  const city0 = city && city.name;
  for (const st of fresh) { try { apply(st); } catch (e) { console.warn('Pixel sans Pi: a state not restored', e); } }
  stamp = Math.max(stamp, ...fresh.map(at));
  const st = pick(), now = shape(st); wbody = wshape(st); if (now !== body) { body = now; later(); }   // kept again: localStorage and the app agree
  if (ready) { showWeather(); if (city && city.name !== city0) weather(); H.mark(); }
  return true;
}
function save() {
  clearTimeout(saveT); saveT = 0;
  const st = pick(); st.at = stamp;
  let json = JSON.stringify(st);
  for (const k of Object.keys(st.extra).sort((a, b) => JSON.stringify(st.extra[b]).length - JSON.stringify(st.extra[a]).length)) {
    if (json.length <= MAX) break; delete st.extra[k]; json = JSON.stringify(st);     // too big: the biggest parts stay out
  }
  try { localStorage.setItem(KEY, json); } catch { /* full, or no storage: the app keeps it */ }
  post({ local_save: st });
}
const later = () => { clearTimeout(saveT); saveT = setTimeout(save, 800); };
restore(window.PIXEL_LOCAL_STATE);   // before anything is drawn (the app's injection may also come later: PixelLocal.restore)
if (!body) { const st = pick(); body = shape(st); wbody = wshape(st); }
ready = true; showWeather(); if (city) weather();
hub.listen(() => {                  // every change of state: kept if what matters changed
  brightness();
  const st = pick(), now = shape(st), w = wshape(st), mine = user; user = false;
  if (now !== body) { body = now; wbody = w; if (mine) stamp = Date.now(); later(); }
  else if (w !== wbody) { wbody = w; later(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && saveT) save(); });
addEventListener('pagehide', () => { if (saveT) save(); });

/* ---------- the socket app.js uses: like its WebSocket to the Pi, but the hub is here ---------- */
const offKey = k => !k || piSays(k.action) ? null : k;
function shapeSnap(p) {             // the keys of the screens that need the Pi stay dark, and so do those of its actions
  for (const id of Object.keys(p.keys.row3)) p.keys.row3[id] = OFF[id] ? [null, null, null, null, null] : p.keys.row3[id].map(offKey);
  return p;
}
function act(action, args) {
  if (typeof action !== 'string') return;
  const why = piSays(action);
  if (why) { H.toast(why, 4500); H.mark(); return; }       // no "last action" for his personality: nothing was done
  hub.dispatch(action, isObj(args) ? args : {});
}
function socket() {
  const ws = new EventTarget(); ws.readyState = 0; ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
  const fire = ev => { const f = ws['on' + ev.type]; if (typeof f === 'function') f.call(ws, ev); ws.dispatchEvent(ev); };
  ws.send = data => { let m = null; try { m = JSON.parse(data); } catch { return; } if (isObj(m)) act(m.action, m.args); };
  ws.close = () => {};
  setTimeout(() => {
    ws.readyState = 1; fire(new Event('open')); chrome();
    hub.listen(p => fire(new MessageEvent('message', { data: JSON.stringify({ type: 'state', data: shapeSnap(p) }) })));
  });
  return ws;
}

/* ---------- the page around him: no Pi links, a word that he lives here (in the app: a touch opens its menu) ---------- */
function chrome() {
  document.body.classList.add('solo');
  for (const el of [$('follow'), $('apk'), $('cast'), document.querySelector('a[href$="reglages.html"]')]) if (el) el.hidden = true;
  const c = $('conn');
  if (c) {
    c.textContent = 'Pixel sur ce téléphone'; c.classList.add('ok');
    if (window.ReactNativeWebView && !c.dataset.menu) {
      c.dataset.menu = '1'; c.setAttribute('role', 'button'); c.tabIndex = 0; c.title = 'Relier à mon Pixel, ou le menu de l’appli';
      c.textContent = 'Pixel sur ce téléphone ⋯';
      const open = () => post({ menu: true });
      c.addEventListener('click', open); c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    }
  }
}
const css = document.createElement('style');
css.textContent = 'body.solo .poche-voyage{display:none!important}body.solo .conn[role="button"]{cursor:pointer;padding:6px 0}';
document.head.append(css);
/* Pixel de poche: he is at home here; a phone without network is no reason to say he is far from his Pi (poche.js link()) */
document.addEventListener('DOMContentLoaded', () => addEventListener('offline', () => { if (window.PixelPoche && PixelPoche.sim) PixelPoche.sim.link(true); }));

/* ---------- the phone's notifications (pixel-mobile, no Pi linked): the app hands them over while it is open, only if you
   switched them on there, for the apps you ticked; never the text. A toast like the Pi's (pixel/telephone.py toast_text),
   and his 'notif' scenes play for it (screens.js). Nothing is kept. ---------- */
const KIND = { msg: 'Nouveau message {}', email: 'Nouvel e-mail {}', call: 'Appel {}', missed_call: 'Appel manqué {}', event: 'Rappel {}', reminder: 'Rappel {}', alarm: 'Alarme {}' };
const line = (v, n) => { if (typeof v !== 'string') return ''; const s = v.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim(); return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…'; };
function notif(n) {
  if (!isObj(n)) return false;
  const app = line(n.app, 40), title = line(n.title, 60), cat = typeof n.category === 'string' && /^[a-z_]{1,24}$/.test(n.category) ? n.category : '';
  if (!app) return false;
  H.toast(title ? `📱 ${app} : ${title}` : '📱 ' + (KIND[cat] || '{}').replace('{}', app), 4000);
  return true;
}

return {
  socket, restore, save, notif,
  get state() { return pick(); },
  get city() { return city ? { ...city } : null; },
  weather: () => weather(true),
  /* the app asks before it goes back to the Pi: how long nobody has touched him, and whether something runs here */
  ping() {
    const idle = Sc ? Math.max(0, performance.now() - Sc.local.lastInput) : 0;
    post({ local_idle: Math.round(idle), busy: !!S.timer.running });
    return { idle, busy: !!S.timer.running };
  },
};
})();
