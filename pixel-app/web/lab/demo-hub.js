/* Pixel Lab: an in-browser stand-in for Pixel's server (pixel-app/server.py and pixel/*.py), with fake data.
   Same state shape (state.py Hub.snapshot + keys.py all_keys) and the same action names, so the real
   renderer (../screens.js) cannot tell the difference. Lab-only actions start with "lab.".
   Themes and moods are read from ../themes.js at runtime, never listed here. */
window.PixelHub = (() => {
const NAV = ['visage', 'lumieres', 'claude', 'codex', 'meteo', 'minuteur', 'agenda', 'systeme', 'reglages', 'veille'];
const NAMES = { visage: 'Visage', lumieres: 'Lumières', claude: 'Claude', codex: 'Codex', meteo: 'Météo', minuteur: 'Minuteur', agenda: 'Agenda', systeme: 'Système', reglages: 'Réglages', veille: 'Veille' };
const norm = s => String(s ?? '').toLowerCase().trim().normalize('NFD').replace(/\p{Mn}/gu, '');   // commands.py norm()
const kw = s => norm(s).replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[’`]/g, "'");          // lookup key for names
const pad = n => String(Math.floor(n)).padStart(2, '0');
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- themes and moods, discovered from themes.js ---------- */
function discoverThemes() {
  try {
    const X = document.createElement('canvas').getContext('2d');
    const all = window.PixelThemes({ X, RM: true, get now() { return 0; }, blinkP: () => 9, txt() {}, wrap: () => [], fit: s => s });
    const list = Object.values(all || {}).filter(t => t && typeof t.id === 'string');
    if (list.length) return list;
  } catch (e) { console.warn('Pixel Lab: PixelThemes() failed', e); }
  return [{ id: 'retro', name: 'Rétro' }];
}
const ALLT = discoverThemes().map(t => ({ id: t.id, name: String(t.name || t.id), c: t.c && typeof t.c === 'object' ? t.c : null, font: typeof t.font === 'function' ? t.font : null, crt: typeof t.crt === 'boolean' ? t.crt : undefined }));
/* the themes switched on, like [ui] themes in config.toml: only Rétro for now. ?themes=all (or ?themes=retro,neon) or the lab's
   "Voir les 6 thèmes" button (saved in pixel_lab.allThemes) brings the others back. */
const WANT = (() => {
  let q = null; try { q = new URLSearchParams(location.search).get('themes'); } catch {}
  if (q === 'all') return ALLT.map(t => t.id);
  if (q) return q.split(',');
  try { if ((JSON.parse(localStorage.getItem('pixel_lab')) || {}).allThemes) return ALLT.map(t => t.id); } catch {}
  return ['retro'];
})();
const THEMES = ALLT.filter(t => WANT.includes(t.id)).length ? ALLT.filter(t => WANT.includes(t.id)) : ALLT.slice(0, 1);
const TNAME = Object.fromEntries(THEMES.map(t => [t.id, t.name])), ALLNAME = Object.fromEntries(ALLT.map(t => [t.id, t.name]));
const MOODS = (Array.isArray(window.PixelMoods) ? window.PixelMoods : []).filter(m => m && typeof m.id === 'string')
  .map(m => ({ id: m.id, name: String(m.name || m.id), desc: String(m.desc || '') }));
if (!MOODS.some(m => m.id === 'neutre')) MOODS.unshift({ id: 'neutre', name: 'Neutre', desc: '' });
const MNAME = Object.fromEntries(MOODS.map(m => [m.id, m.name]));
const ANIMS = (window.Pixel52 && Array.isArray(window.Pixel52.animations) ? window.Pixel52.animations : []).map(a => ({ id: a.id, label: a.label, group: a.group, duration: a.duration }));
const ABY = Object.fromEntries(ANIMS.map(a => [a.id, a])), SHOW = ANIMS.filter(a => a.group !== 'Idle').map(a => a.id);
const AGROUPS = ['Humeurs', 'Émotions', 'Activités', 'Système', 'Repos', 'Idle'];
const FACES = { pack: 'Pack 52', vivant: 'Vivant' };

/* ---------- fake data (same as the server's --demo mode) ---------- */
const QR = ["1111111000100010001111111","1000001010100010101000001","1011101010010001001011101","1011101010011110101011101","1011101000100110101011101","1000001000001100101000001","1111111010101010101111111","0000000011100001000000000","1000001011100101011001110","1111000101110101010111110","0100011101101001100101011","1111000110001001101011001","1100011011000010101100001","1000110000101011100100010","1011001011100001011001011","1000110011101010011010101","1001001011001100111110100","0000000010100110100010100","1111111001001110101011001","1000001001110001100010010","1011101001011101111111111","1011101000001000011101011","1011101001101000100100101","1000001001001000110110001","1111111010011111111001001"];
const WD = ['DIM.', 'LUN.', 'MAR.', 'MER.', 'JEU.', 'VEN.', 'SAM.'], WF = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
function wkind(code) {                                    // weather.py kind(): WMO code -> icon, French label
  if (code === 0 || code === 1) return ['soleil', code === 0 ? 'Ensoleillé' : 'Plutôt ensoleillé'];
  if (code === 2 || code === 3) return ['nuage', code === 2 ? 'Éclaircies' : 'Couvert'];
  if (code === 45 || code === 48) return ['nuage', 'Brouillard'];
  if (code >= 51 && code <= 57) return ['pluie', 'Bruine'];
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return ['pluie', code < 80 ? 'Pluie' : 'Averses'];
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['neige', 'Neige'];
  if (code >= 95) return ['orage', 'Orage'];
  return ['nuage', 'Nuageux'];
}
const day = (i, hi, lo, code, wind, hum) => { const d = new Date(Date.now() + i * 864e5), [kind, label] = wkind(code);
  return { name: i ? WD[d.getDay()] : 'AUJ.', full: i ? WF[d.getDay()] : "Aujourd'hui", tmax: hi, tmin: lo, kind, label, wind, hum }; };
function demoWeather() {
  const days = [[12, 6, 0, 9, 54], [9, 4, 3, 18, 66], [8, 5, 63, 26, 88], [10, 3, 2, 14, 70], [13, 5, 1, 8, 52]].map((r, i) => day(i, ...r));
  return { city: 'Paris (démo)', now: { t: 11, kind: days[0].kind, label: days[0].label, wind: days[0].wind, hum: days[0].hum }, days };
}
const KINDS = [{ id: 'soleil', name: 'Soleil' }, { id: 'nuage', name: 'Nuages' }, { id: 'pluie', name: 'Pluie' }, { id: 'neige', name: 'Neige' }, { id: 'orage', name: 'Orage' }];
const FORCE = { soleil: [0, 17, 8, 8, 45], nuage: [3, 11, 6, 15, 72], pluie: [63, 9, 5, 26, 90], neige: [71, 1, -3, 12, 86], orage: [95, 19, 12, 38, 80] };   // code, max, min, wind, hum
const EVENTS = [[0, 10, 10.5, 'Stand-up'], [0, 14, 15, "Réunion d'équipe"], [0, 17.5, 18.25, 'Dentiste'], [1, 9.5, 11, 'Atelier impression 3D'], [1, 12.5, 13.5, 'Déjeuner avec Léa'], [1, 16, 17, 'Relire la PR de Codex']];
const demoAgenda = () => ({ status: 'démo', events: EVENTS.map(([d, s, e, t]) => ({ day: d, start: s, end: e, title: t, allday: false })) });
const sortEvents = ev => ev.sort((a, b) => a.day - b.day || Number(!a.allday) - Number(!b.allday) || a.start - b.start);
const ROOMS = [['Salon', true, 80], ['Bureau', true, 100], ['Chambre', false, 30], ['Cuisine', true, 40]];
const SCENES = { Lecture: [[1, 90], [1, 100], [0, 30], [1, 60]], Film: [[1, 15], [0, 0], [0, 0], [1, 10]], 'Détente': [[1, 45], [1, 30], [1, 25], [0, 40]], Focus: [[1, 70], [1, 100], [0, 0], [1, 50]] };

const S = {
  screen: 'visage',
  mood: { name: 'neutre', until: 0 },
  view: { meteo_day: 0, units_f: false, agenda_day: 0, crt_off: false, osk: false, theme: TNAME.retro ? 'retro' : THEMES[0].id, face: ANIMS.length ? 'pack' : 'vivant' },
  anim: null,
  scene: null,
  lights: { status: 'démo', rooms: ROOMS.map(([name, on, bri], i) => ({ id: String(i), name, on, bri })), scenes: Object.keys(SCENES) },
  chat: { phase: 'idle', status: 'démo (pas de clé API)', messages: [] },
  codex: { task: '', running: false, status: 'Tape : codex <ta tâche>', lines: [] },
  weather: demoWeather(),
  agenda: demoAgenda(),
  timer: { mode: 'TRAVAIL', total: 1500, left: 1500, running: false, ends_at: 0, done: 2 },
  sys: { temps: [], cpus: [], bright: 1, hw_bright: false, host: 'pixel', temp: 46, cpu: 8, ram_used: 1.2e9, ram_total: 4.1e9, wifi: -52, uptime: 3 * 86400 + 4 * 3600, disk: 24, ip: '192.168.1.42' },
  settings: { url: 'http://pixel.local:8080/?t=demo', ip_url: 'http://192.168.1.42:8080/?t=demo', qr: QR, demo: true, sleep_min: 10, claude: 'démo (pas de clé API)', deck: 'Stream Deck MK.2 (15 touches)', themes: THEMES.map(t => t.id),
    cast: { max_mb: 40, seconds: 120 }, ecran: { page: 'http://pixel.local:8080/ecran', ip_page: 'http://192.168.1.42:8080/ecran', https: '', launcher: '/ecran/lanceur.html' } },
  cast: null,                     // pixel/cast.py: what a phone shows on Pixel's screen, and the last ones
  airplay: { on: false, status: 'off', client: '', name: 'Pixel', error: '' },     // pixel/airplay.py: off unless [airplay] enabled
  cast_recent: [],
  toast: null,
  boot_at: 0,
};
for (let i = 0; i < 40; i++) { S.sys.temps.push(45 + Math.sin(i / 6) * 1.2 + Math.random()); S.sys.cpus.push(5 + Math.random() * 8); }

/* ---------- state changes and broadcast (state.py) ---------- */
const listeners = []; let tid = 0, queued = false;
function mark() { if (queued) return; queued = true; queueMicrotask(() => { queued = false; const snap = snapshot(); for (const f of listeners) f(snap); }); }
const toast = (msg, ms = 3000) => { S.toast = { id: ++tid, msg: String(msg), ms }; mark(); };
const mood = (name, ms = 0) => { S.mood = { name, until: ms ? Date.now() + ms : 0 }; mark(); };
const snapshot = () => JSON.parse(JSON.stringify({ ...S, keys: allKeys(), server_now: Date.now() }));   // a fresh copy, like the JSON the server sends

/* ---------- Stream Deck layout (keys.py), built from the live theme and mood lists ---------- */
const K = (label, action, args = {}) => ({ label, action, args });
const keyLabel = s => s.length > 8 && s.includes(' ') ? s.replace(' ', '\n') : s;
const MOOD_MS = { content: 2500, surpris: 1800, amoureux: 3000, clin: 1600, endormi: 0 };   // keys.py durations; other moods: 3 s
const fill5 = a => [...a, null, null, null, null, null].slice(0, 5);
function row3(scr) {
  const t = S.timer;
  switch (scr) {
    case 'visage': {
      const ids = MOODS.map(m => m.id), i = ids.indexOf(S.mood.name), next = i >= 0 ? ids[(i + 1) % ids.length] : 'content';
      const last = S.anim && S.anim.id, anim = SHOW.length ? SHOW[(SHOW.indexOf(last) + 1) % SHOW.length] : null;
      const row = MOODS.filter(m => ['content', 'surpris', 'amoureux'].includes(m.id)).map(m => K(keyLabel(m.name), 'mood.set', { name: m.id, ms: MOOD_MS[m.id] ?? 3000 }));
      return fill5([...row, anim ? K('Anim +', 'anim.play', { id: anim }) : null, K('Humeur +', 'mood.set', next === 'endormi' ? { name: next } : { name: next, ms: 4000 })]);
    }
    case 'lumieres': return fill5([K('Tout\nallumer', 'lights.set', { room: '*', on: true }), K('Tout\néteindre', 'lights.set', { room: '*', on: false }), ...S.lights.scenes.slice(0, 3).map(n => K(n.slice(0, 9), 'lights.scene', { name: n }))]);
    case 'claude': return [K('Clavier', 'view.toggle', { key: 'osk' }), K('Météo ?', 'chat.send', { text: "Quel temps fait-il aujourd'hui ?" }), K('Agenda ?', 'chat.send', { text: "Qu'est-ce que j'ai aujourd'hui ?" }), K('Blague', 'chat.send', { text: 'Raconte-moi une blague courte.' }), K('Effacer', 'chat.clear')];
    case 'codex': return [K('Clavier', 'view.toggle', { key: 'osk' }), K('Relancer', 'codex.run'), K('Stop', 'codex.stop'), K('Effacer', 'codex.clear'), null];
    case 'meteo': return [K("Aujour-\nd'hui", 'view.set', { key: 'meteo_day', value: 0 }), K('Jour −', 'view.step', { key: 'meteo_day', d: -1, hi: 4 }), K('Jour +', 'view.step', { key: 'meteo_day', d: 1, hi: 4 }), K('°C / °F', 'view.toggle', { key: 'units_f' }), K('Annoncer', 'weather.say')];
    case 'minuteur': return [K(t.running ? 'Pause' : 'Démarrer', 'timer.toggle'), K('+5 min', 'timer.add', { minutes: 5 }), K('Remettre\nà zéro', 'timer.reset'), K('Pause\ncafé', 'timer.start', { minutes: 5, mode: 'PAUSE CAFÉ' }), K('25 min', 'timer.start', { minutes: 25 })];
    case 'agenda': return [K("Aujour-\nd'hui", 'view.set', { key: 'agenda_day', value: 0 }), K('Demain', 'view.set', { key: 'agenda_day', value: 1 }), K('Actua-\nliser', 'agenda.refresh'), null, K('Demander\nà Claude', 'chat.ask', { text: "Qu'est-ce que j'ai aujourd'hui et demain ?" })];
    case 'systeme': return [K('Lumi. −', 'sys.bright', { d: -0.1 }), K('Lumi. +', 'sys.bright', { d: 0.1 }), K('Effet\nCRT', 'view.toggle', { key: 'crt_off' }), K('Démar-\nrage', 'sys.boot'), K('Veille', 'screen.show', { screen: 'veille' })];
    case 'reglages': {
      const head = [K('Associer\nHue', 'lights.pair'), K('Clavier', 'view.toggle', { key: 'osk' })];
      if (THEMES.length < 2) return [...head, K('Effet\nCRT', 'view.toggle', { key: 'crt_off' }), K('Visage\nPack 52', 'face.set', { name: 'pack' }), K('Visage\nVivant', 'face.set', { name: 'vivant' })];   // keys.py, one theme
      if (THEMES.length <= 3) return fill5([...head, ...THEMES.map(x => K(x.name, 'theme.set', { name: x.id }))]);
      const n = THEMES.length, i = Math.max(0, THEMES.findIndex(x => x.id === S.view.theme));   // too many themes for one key each
      return [...head, K('Thème −', 'theme.set', { name: THEMES[(i + n - 1) % n].id }), K('Thème +', 'theme.set', { name: THEMES[(i + 1) % n].id }), K('Effet\nCRT', 'view.toggle', { key: 'crt_off' })];
    }
    case 'veille': return [K('Réveiller', 'screen.show', { screen: 'visage' }), null, null, null, null];
  }
  return [null, null, null, null, null];
}
const allKeys = () => ({ nav: NAV.map(id => ({ id, label: NAMES[id] })), row3: Object.fromEntries(NAV.map(id => [id, row3(id)])) });

/* ---------- Claude (claude.py demo replies) ---------- */
let chatBusy = false, scriptRun = 0;
function say(text) { const m = S.chat.messages[S.chat.messages.length - 1]; if (m) m.text += text; S.chat.phase = 'answer'; mark(); }
const themeIn = t => { for (const x of THEMES) if (t.includes(kw(x.id)) || t.includes(kw(x.name))) return x.id; return t.includes('anime') && TNAME.manga ? 'manga' : null; };
async function chatSend(text) {
  const C = S.chat;
  if (chatBusy) return toast('CLAUDE RÉPOND DÉJÀ');
  chatBusy = true;
  C.messages = [...C.messages, { role: 'user', text }, { role: 'assistant', text: '' }].slice(-30);
  C.phase = 'think'; mood('reflechit', 60000);
  let after = null;
  try { after = await demoReply(text); }
  finally {
    chatBusy = false; C.phase = 'idle';
    const last = C.messages[C.messages.length - 1]; if (last && !last.text) last.text = '…';
    mood('content', 2000);
    if (after) after();          // the wink after a joke: claude.py sets it before content, so it never shows there
  }
}
async function demoReply(text) {
  const t = kw(text); let reply, after = null;
  await sleep(1000);
  const m = t.match(/(salon|bureau|chambre|cuisine)\D*(\d{1,3})/), th = themeIn(t);
  if (t.includes('blague')) { reply = 'Tu sais pourquoi je ne bouge jamais la tête ? Pas de servos, pas de soucis.'; after = () => mood('clin', 2200); }
  else if (th && /theme|style|mets|passe/.test(t)) { A['theme.set']({ name: th }); reply = `Voilà, je passe en thème ${TNAME[th]} !`; }
  else if (m) { A['lights.set']({ room: m[1], bri: +m[2] }); reply = `C'est fait : ${m[1]} à ${m[2]} %.`; }
  else if (/meteo|temps|pluie/.test(t) && S.weather && S.weather.days) { const d = S.weather.days[0]; reply = `Aujourd'hui : ${d.label.toLowerCase()}, entre ${d.tmin} et ${d.tmax} °C.`; }
  else if (/agenda|aujourd|rendez|demain/.test(t)) { const ev = S.agenda.events.filter(e => e.day === 0 && !e.allday); reply = ev.length ? "Aujourd'hui : " + ev.map(e => `${e.title} à ${Math.floor(e.start)} h ${pad(Math.round(e.start % 1 * 60))}`).join(', ') + '.' : "Rien de prévu aujourd'hui."; }
  else if (t.includes('merci')) { reply = 'Avec plaisir ! Tu me fais rougir.'; after = () => mood('amoureux', 3000); }
  else if (/^(salut|bonjour|coucou|hello)/.test(t)) reply = 'Salut ! Ici Pixel. Je cligne des yeux, je surveille tes lampes et je connais des blagues.';
  else reply = 'Je suis en mode démo. Sur Pixel, avec une clé API, Claude répond vraiment. Essaie « blague », « météo » ou « salon 40 ».';
  for (const ch of reply) { say(ch); await sleep(25); }
  return after;
}
async function chatScript() {                          // lab: a short scripted conversation
  const run = ++scriptRun;
  if (!chatBusy) S.chat.messages = [];
  S.screen = 'claude'; mark();
  for (const q of ['Salut Pixel, ça va ?', 'Raconte-moi une blague courte.', 'Merci, tu es génial !']) {
    while (chatBusy) { await sleep(150); if (run !== scriptRun) return; }
    await sleep(900); if (run !== scriptRun) return;
    await chatSend(q);
  }
}

/* ---------- Codex (codex.py demo log) ---------- */
const CODEX_OK = [['Lecture du projet (12 fichiers)', 800], ['Tests : 41 OK, 1 échec', 1100], ["Échec : test_minuteur, la pause ne s'arrête pas à 0", 1000], ['Correction de minuteur.py, ligne 48', 1300], ['Relance des tests', 1600], ['42/42 OK', 700], ['Branche prête : fix-minuteur', 500]];
const CODEX_FAIL = [['Lecture du projet (12 fichiers)', 800], ['Tests : 41 OK, 1 échec', 1100], ['Correction de minuteur.py, ligne 48', 1300], ['Relance des tests', 1600], ['Erreur : test_minuteur échoue encore', 900]];
let codexRun = 0;
async function codex(task, fail) {
  const X = S.codex, run = ++codexRun;
  Object.assign(X, { task, running: true, lines: [], status: 'en cours', started: Date.now() / 1000 }); mark();
  for (const [line, wait] of fail ? CODEX_FAIL : CODEX_OK) { await sleep(wait); if (run !== codexRun) return; X.lines = [...X.lines, line].slice(-300); mark(); }
  codexEnd(fail ? 1 : 0);
}
function codexEnd(rc) {
  const X = S.codex, ok = rc === 0, secs = Math.round(Date.now() / 1000 - X.started);
  Object.assign(X, { running: false, status: ok ? `terminé en ${secs} s` : rc === -1 ? 'arrêté' : `erreur (${rc})` });
  toast(ok ? 'CODEX : TERMINÉ' : 'CODEX : ' + X.status.toUpperCase(), 4000);
  mood(ok ? 'content' : 'surpris', 2500);
}
function codexStart(task, fail = false) {
  task = String(task || S.codex.task || '').trim();
  if (!task) return toast('TAPE : codex <ta tâche>');
  if (S.codex.running) return toast('CODEX TRAVAILLE DÉJÀ');
  codex(task, fail);
}

/* ---------- lights (hue.py demo) ---------- */
function targets(room) {
  const R = S.lights.rooms; if (room == null || room === '*') return R;
  const n = norm(room), exact = R.filter(r => r.id === room || norm(r.name) === n);
  return exact.length ? exact : R.filter(r => norm(r.name).startsWith(n)).slice(0, 1);
}

/* ---------- timer (timer.py) ---------- */
const T = S.timer, tleft = () => T.running ? Math.max(0, (T.ends_at - Date.now()) / 1000) : T.left;
const num = (v, d) => Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d;

/* ---------- casting (pixel/cast.py): the files stay in this page, as object URLs; nothing is sent anywhere ---------- */
const CAST_MAX = 40 * 1048576, CAST_SECS = 120, CAST_KEEP = 8, CAST_LIVE = 4 * 3600e3;
const CAST_MIME = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm' };
const CAST_ITEM = ['kind', 'src', 'text', 'url', 'title', 'embed', 'site', 'yt'];
const CAST_BAD = 'Format non pris en charge. Photos : JPEG, PNG, GIF, WebP. Vidéos : MP4, WebM.';
const MP4_BRANDS = ['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'M4VH', 'M4VP', 'dash', 'mmp4', 'MSNV', '3gp4', '3gp5', '3gp6', '3g2a', 'qt  '];
/* the lab's sample link, and its QR code made by segno like server.qr_rows (the lab has no QR encoder: other links get none) */
const CAST_SAMPLE = 'https://fr.wikipedia.org/wiki/Pixel_art', CAST_SAMPLE_QR = ['11111110011101100100001111111', '10000010100010001110101000001', '10111010110000101011101011101', '10111010100011010101101011101', '10111010011000111011101011101', '10000010000101000100001000001', '11111110101010101010101111111', '00000000101000001001100000000', '10000010111101100111011001110', '00011000011100010111100110110', '01010110111010111100111100000', '11010001000100001000010111000', '00100010100101111001101000001', '11110101111010011001101110011', '10011010001000010100111001100', '00100100000100101000110100101', '01000011100110001101000001100', '11011000100101011111101010111', '11011110111010010111110101001', '10100001111111000000110010000', '10011110000100100100111110111', '00000000111110110110100011000', '11111110001110010111101011100', '10000010011010100001100010011', '10111010001011110001111111001', '10111010010010101111010101101', '10111010001101111011001111110', '10000010000111010000001001101', '11111110100101000111010110100'];
const castBlobs = [];                                     // the object URLs, the oldest first: only the last few stay
const castKey = e => e.src || e.url || 't:' + (e.text || '');
function castSniff(b) {                                   // cast.py sniff(): the first bytes, never the name
  const str = (i, n) => String.fromCharCode(...b.slice(i, i + n)), has = (i, a) => a.every((v, k) => b[i + k] === v);
  if (has(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return ['png', 'image'];
  if (has(0, [0xff, 0xd8, 0xff])) return ['jpg', 'image'];
  if (['GIF87a', 'GIF89a'].includes(str(0, 6))) return ['gif', 'gif'];
  if (str(0, 4) === 'RIFF' && str(8, 4) === 'WEBP') return ['webp', str(12, 4) === 'VP8X' && b.length > 20 && b[20] & 2 ? 'gif' : 'image'];
  if (has(0, [0x1a, 0x45, 0xdf, 0xa3]) && str(0, 64).includes('webm')) return ['webm', 'video'];
  if (str(4, 4) === 'ftyp' && MP4_BRANDS.includes(str(8, 4))) return ['mp4', 'video'];
  return null;
}
function castUrl(s) {                                     // cast.py clean_url()
  s = String(s ?? '').trim(); if (!s || s.length > 2000 || /[\s"'<>\\]/.test(s)) return null;
  try { const u = new URL(s); return ['http:', 'https:'].includes(u.protocol) && u.hostname && !u.username && !u.password ? s : null; } catch { return null; }
}
function castClassify(url) {                              // cast.py classify(): from the address alone
  const u = new URL(url), host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, ''), last = u.pathname.split('/').pop(), ext = last.includes('.') ? last.split('.').pop().toLowerCase() : '';
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return { kind: 'image' };
  if (ext === 'gif') return { kind: 'gif' };
  if (['mp4', 'm4v', 'mov', 'webm'].includes(ext)) return { kind: 'video' };
  const yt = window.PixelYT && PixelYT.parse(url);       // youtube.py parse() (../ytplayer.js)
  if (yt) { const it = PixelYT.item(yt); return { kind: 'link', site: it.site, embed: it.embed, yt }; }
  const v = ['vimeo.com', 'player.vimeo.com'].includes(host) && u.pathname.match(/^\/(?:video\/)?(\d{5,12})(?:\/([0-9a-f]{6,20}))?\/?$/);
  if (v) { const h = v[2] || u.searchParams.get('h') || ''; return { kind: 'link', site: 'Vimeo', embed: `https://player.vimeo.com/video/${v[1]}?autoplay=1${/^[0-9a-f]{6,20}$/.test(h) ? '&h=' + h : ''}` }; }
  return { kind: 'link' };
}
function castStart(item, { seconds = null, raw = false } = {}) {     // cast.py _start(): over whatever screen is open
  const now = Date.now(), n = Number(seconds), secs = seconds == null || seconds === '' || !Number.isFinite(n) ? CAST_SECS : Math.max(0, Math.min(3600, Math.trunc(n)));
  const timed = ['image', 'gif', 'text', 'ytcode'].includes(item.kind) || (item.kind === 'link' && !item.embed);
  S.cast = { ...item, id: Math.random().toString(36).slice(2, 10), t0: now, until: timed && secs ? now + secs * 1000 : 0, raw: !!raw };
  if (S.cast.kind === 'link' && !S.cast.embed) S.cast.qr = item.url === CAST_SAMPLE ? CAST_SAMPLE_QR : null;
  if (item.kind === 'ytcode') { mark(); return S.cast; }           // the TV code is not one to show again
  const old = S.cast_recent.find(e => castKey(e) === castKey(item)), entry = { ...Object.fromEntries(CAST_ITEM.filter(k => k in item).map(k => [k, item[k]])), id: old ? old.id : Math.random().toString(36).slice(2, 10), at: now };
  S.cast_recent = [entry, ...S.cast_recent.filter(e => e !== old)].slice(0, CAST_KEEP);
  mark(); return S.cast;
}
function castText(text, opts) {
  let t = String(text ?? '').replace(/\r/g, '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, 400).trim();
  if (!t) throw new Error("Écris d'abord quelque chose.");
  if (t.length > 280) t = t.slice(0, 279).trimEnd() + '…';
  return castStart({ kind: 'text', text: t, title: 'Message' }, opts);
}
function castLink(url, title = '', opts = {}) {
  const u = castUrl(url); if (!u) throw new Error("Ce lien n'est pas une adresse web (http:// ou https://).");
  const w = castClassify(u), p = new URL(u), site = w.site || p.hostname.replace(/^www\./, ''), tail = p.pathname.split('/').filter(Boolean);
  const def = w.yt ? PixelYT.item(w.yt).title : w.embed ? `Vidéo ${site}` : tail.length && w.kind !== 'link' ? tail[tail.length - 1] : site + (tail.length ? '/' + tail[tail.length - 1] : '');
  const item = { kind: w.kind, url: u, site, title: String(title || '').trim().slice(0, 200) || def.slice(0, 200) };
  if (w.kind !== 'link') item.src = u;
  if (w.embed) item.embed = w.embed;
  if (w.yt) item.yt = w.yt;
  return castStart(item, opts);
}
async function castFile(blob, { title = '', ...opts } = {}) {    // a file of this computer or phone (the server's POST /api/cast): '' or the error
  try {
    if (!blob || !blob.size) throw new Error('Rien à afficher : choisis une photo, une vidéo, un lien ou un texte.');
    if (blob.size > CAST_MAX) throw new Error('Fichier trop gros : 40 Mo au plus.');
    const t = castSniff(new Uint8Array(await blob.slice(0, 64).arrayBuffer())); if (!t) throw new Error(CAST_BAD);
    const src = URL.createObjectURL(new Blob([blob], { type: CAST_MIME[t[0]] }));       // its real type, for the GIF decoder
    castBlobs.push(src);
    while (castBlobs.length > CAST_KEEP) { const gone = castBlobs.shift(); S.cast_recent = S.cast_recent.filter(e => e.src !== gone); if (!(S.cast && S.cast.src === gone)) URL.revokeObjectURL(gone); }
    castStart({ kind: t[1], src, title: String(title || '').slice(0, 200) || { image: 'Photo', gif: 'Animation', video: 'Vidéo' }[t[1]] }, opts);
    return '';
  } catch (e) { toast(e.message, 4000); mark(); return e.message; }
}
function castTry(fn) { try { fn(); return ''; } catch (e) { toast(e.message, 4000); return e.message; } }
/* the lab's samples: a postcard drawn on a canvas, a short video recorded from a canvas, a text, a link */
function castPostcard() {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 800; const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 560); sky.addColorStop(0, '#2b1b5a'); sky.addColorStop(0.55, '#e0507a'); sky.addColorStop(1, '#ffb347'); g.fillStyle = sky; g.fillRect(0, 0, 1200, 800);
  g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(760, 470, 120, 0, 7); g.fill();
  g.globalAlpha = 0.6; g.fillStyle = '#fff'; for (let i = 0; i < 40; i++) g.fillRect((i * 263) % 1200, (i * 97) % 260, 3, 3); g.globalAlpha = 1;
  g.fillStyle = '#3b1f4a'; g.beginPath(); g.moveTo(0, 560); [[160, 380], [330, 520], [520, 330], [720, 560], [900, 410], [1060, 520], [1200, 440], [1200, 800], [0, 800]].forEach(([x, y]) => g.lineTo(x, y)); g.fill();
  g.fillStyle = '#1d1030'; g.fillRect(0, 600, 1200, 200);
  for (let y = 615; y < 800; y += 22) { g.globalAlpha = 0.35 * (1 - (y - 600) / 200); g.fillStyle = '#ffd58a'; g.fillRect(640 + Math.sin(y) * 30, y, 240 - (y - 600) / 2, 5); } g.globalAlpha = 1;
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.font = 'bold 92px sans-serif'; g.fillText('Coucou Pixel !', 600, 190);
  g.font = '40px sans-serif'; g.fillText('Une carte postale du labo', 600, 260);
  return new Promise(res => c.toBlob(res, 'image/png'));
}
async function castClip(ms = 4000) {                      // a little video made by the browser itself (MediaRecorder)
  if (typeof MediaRecorder !== 'function') throw new Error('Ce navigateur ne sait pas enregistrer de vidéo : essaie avec ta propre vidéo.');
  const c = document.createElement('canvas'); c.width = 640; c.height = 360; const g = c.getContext('2d'), stream = c.captureStream(30);
  const type = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(stream, type ? { mimeType: type } : {}), parts = [], t0 = Date.now();
  rec.ondataavailable = e => { if (e.data && e.data.size) parts.push(e.data); };
  const cols = ['#ffffff', '#ffe600', '#00e5ff', '#00e04b', '#ff3fd1', '#ff2a2a', '#2a3cff'];
  const draw = () => {                                    // colour bars, a ball that bounces, a count down
    const t = (Date.now() - t0) / 1000;
    cols.forEach((col, i) => { g.fillStyle = col; g.fillRect(i * 640 / 7, 0, 640 / 7 + 1, 240); });
    g.fillStyle = '#101018'; g.fillRect(0, 240, 640, 120);
    const x = 40 + Math.abs(((t * 260) % 1120) - 560), y = 300 - Math.abs(Math.sin(t * 5)) * 50;
    g.fillStyle = '#ffb347'; g.beginPath(); g.arc(x, y, 24, 0, 7); g.fill();
    g.fillStyle = '#101018'; g.textAlign = 'center'; g.font = 'bold 96px sans-serif'; g.fillText(String(Math.max(1, Math.ceil(ms / 1000 - t))), 320, 160);
  };
  draw(); rec.start(250); const iv = setInterval(draw, 33);   // setInterval: the lab's slow motion must not slow the recording down
  await sleep(ms); clearInterval(iv); const done = new Promise(r => { rec.onstop = r; }); rec.stop(); await done; stream.getTracks().forEach(t => t.stop());
  return new Blob(parts, { type: (rec.mimeType || 'video/webm').split(';')[0] });
}
async function castSample(what, opts = {}) {
  if (what === 'photo') return castFile(await castPostcard(), { ...opts, title: 'Carte postale' });
  if (what === 'video') { let clip; try { clip = await castClip(); } catch (e) { toast(e.message, 4000); mark(); return e.message; } return castFile(clip, { ...opts, title: 'Mire du labo' }); }
  if (what === 'text') return castTry(() => castText('À table ! Le dîner est prêt dans 5 minutes.', opts));
  if (what === 'link') return castTry(() => castLink(CAST_SAMPLE, 'Pixel art — Wikipédia', opts));
  if (what === 'youtube') return castTry(() => castLink('https://youtu.be/aqz-KE-bpKQ?t=30', '', opts));
  return '';
}

/* ---------- a shared screen (pixel/ecran.py, pixel/airplay.py): its cards, and a fake desktop as its picture (../ecran.js) ---------- */
const ECRAN_WHY = { mjpeg: 'Pixel ne trouve pas ScreenStream sur ton téléphone. Lance-le en mode Local, sans code PIN, sur le même Wi-Fi.',
  webrtc: 'Le navigateur de Pixel ne sait pas recevoir un écran partagé (WebRTC).', reseau: "La connexion avec l'écran partagé s'est perdue.", signal: "Pixel a perdu le contact avec l'ordinateur." };
function ecranCard(phase, title, note, extra = {}) {      // ecran.py _show(): over whatever screen is open, like the other casts
  S.cast = { kind: 'screen', via: 'webrtc', phase, title, note, id: Math.random().toString(36).slice(2, 10), t0: Date.now(), until: 0, raw: false, ...extra };
  return S.cast;
}
const ECRAN_LAB = {                                       // the lab's buttons: what a computer, a phone, an iPhone would show
  pc: () => ecranCard('live', 'Écran : PC du labo', "L'écran de l'ordinateur est sur Pixel, en direct.", { via: 'demo' }),
  phone: () => ecranCard('live', 'Écran du téléphone', 'ScreenStream, en direct.', { via: 'demo', shape: 'portrait' }),
  pin: () => ecranCard('pin', 'AirPlay', "Sur l'iPhone, tape ce code pour recopier ton écran sur Pixel.", { via: 'airplay', code: '4821', until: Date.now() + 90e3 }),
  airplay: () => ecranCard('live', 'AirPlay : iPhone du labo', "Sur le vrai Pixel, l'écran de l'iPhone s'affiche par-dessus (la fenêtre d'UxPlay). Pour arrêter : « Arrêter la recopie » sur l'iPhone.", { via: 'airplay' }),
};

/* ---------- actions: same names and arguments as the real server ---------- */
const A = {
  'theme.set': ({ name }) => {
    if (!TNAME[name]) { if (ALLNAME[name]) toast(THEMES.length < 2 ? `Pour le moment, seul le thème ${THEMES[0].name} est activé.` : `Ce thème n'est pas activé. Les thèmes : ${THEMES.map(t => t.name).join(', ')}.`, 5000); return; }
    S.view.theme = name; toast('THÈME ' + TNAME[name].toUpperCase());
  },
  'screen.show': ({ screen }) => { if (!NAV.includes(screen)) return; S.cast = null; if (S.screen === 'veille' && screen !== 'veille') mood('surpris', 900); S.screen = screen; },
  'mood.set': ({ name, ms = 0 }) => mood(String(name), Math.trunc(num(ms, 0))),
  'face.set': ({ name }) => { if (!FACES[name]) return; S.view.face = name; toast('VISAGE : ' + FACES[name].toUpperCase()); },
  'anim.play': ({ id, loops = null }) => {               // once or twice (loops = 0: until another one), then back to the mood or the idle
    const a = ABY[id]; if (!a) return;
    const n = loops == null ? (a.duration <= 4 ? 2 : 1) : Math.max(0, Math.min(20, Math.trunc(num(loops, 1)))), t0 = Date.now();
    S.anim = { id, t0, loops: n, until: n ? t0 + n * a.duration * 1000 : 0 };
  },
  'anim.stop': () => { S.anim = null; },
  'scene.play': ({ id }) => { if (!SBY[id]) return; S.anim = null; S.scene = { id, t0: Date.now() }; S.screen = 'visage'; },   // server.py scene.play
  'view.set': ({ key, value }) => { if (key in S.view) S.view[key] = value; },
  'view.toggle': ({ key }) => { if (key in S.view) S.view[key] = !S.view[key]; },
  'view.step': ({ key, d = 1, lo = 0, hi = 4 }) => { if (key in S.view) S.view[key] = Math.max(lo, Math.min(hi, Math.trunc(S.view[key]) + Math.trunc(d))); },
  'lights.set': ({ room = '*', on = null, bri = null } = {}) => {
    const rs = targets(room); if (!rs.length) return toast(`PIÈCE INCONNUE : ${room}`);
    for (const r of rs) { if (bri != null) { const b = Math.max(0, Math.min(100, Math.trunc(Number(bri)))); r.on = b > 0; if (b > 0) r.bri = b; } if (on != null) r.on = !!on; }
  },
  'lights.scene': ({ name }) => {
    const n = norm(name), L = S.lights.scenes, match = L.find(s => norm(s) === n) || L.find(s => norm(s).startsWith(n));
    if (!match) return toast(`SCÈNE INCONNUE : ${name}`);
    S.lights.rooms.forEach((r, i) => { const v = SCENES[match][i]; if (v) { r.on = !!v[0]; r.bri = v[1] || r.bri; } });
    toast('SCÈNE : ' + match.toUpperCase());
  },
  'lights.pair': () => toast('MODE DÉMO : PAS DE PONT HUE'),
  'chat.send': ({ text }) => { chatSend(String(text).slice(0, 2000)); },
  'chat.ask': ({ text }) => { S.screen = 'claude'; chatSend(String(text).slice(0, 2000)); },
  'chat.clear': () => { if (!chatBusy) { scriptRun++; S.chat.messages = []; } },
  'codex.run': ({ task = null } = {}) => codexStart(task),
  'codex.stop': () => { if (S.codex.running) { codexRun++; codexEnd(-1); } },
  'codex.clear': () => { if (!S.codex.running) Object.assign(S.codex, { task: '', lines: [], status: 'Tape : codex <ta tâche>' }); },
  'timer.start': ({ minutes = 25, mode = 'TRAVAIL' } = {}) => { const m = Math.max(1, Math.min(180, num(minutes, 25))); Object.assign(T, { mode, total: m * 60, left: m * 60, running: true, ends_at: Date.now() + m * 60000 }); },
  'timer.toggle': () => { if (T.running) Object.assign(T, { left: tleft(), running: false }); else { if (T.left <= 0) T.left = T.total; Object.assign(T, { running: true, ends_at: Date.now() + T.left * 1000 }); } },
  'timer.add': ({ minutes = 5 } = {}) => { const s = num(minutes, 5) * 60; T.total = Math.min(10800, T.total + s); if (T.running) T.ends_at += s * 1000; else T.left = Math.min(T.total, T.left + s); },
  'timer.reset': () => { Object.assign(T, { mode: 'TRAVAIL', total: 1500, left: 1500, running: false, ends_at: 0 }); },
  'weather.say': () => {
    const w = S.weather; if (!w || !w.days) return toast('MÉTÉO PAS ENCORE CHARGÉE');
    const d = w.days[Math.max(0, Math.min(w.days.length - 1, S.view.meteo_day))];
    const tip = { pluie: 'Prends ton parapluie !', orage: 'Reste au chaud.', neige: 'Couvre-toi bien.' }[d.kind] || 'Pas besoin de parapluie.';
    toast(`${d.full} : ${d.label.toLowerCase()}, ${d.tmin} à ${d.tmax} °C. ${tip}`, 7000);
  },
  'agenda.refresh': () => toast('AGENDA À JOUR'),
  'sys.bright': ({ d = 0.1 } = {}) => { S.sys.bright = Math.round(Math.min(1, Math.max(0.3, S.sys.bright + num(d, 0))) * 10) / 10; S.sys.hw_bright = false; },
  'sys.boot': () => { S.boot_at = Date.now(); },
  'sys.power': ({ what = 'poweroff' } = {}) => { toast(what === 'reboot' ? 'REDÉMARRAGE… (démo : rien ne se passe)' : 'EXTINCTION… (démo : rien ne s\'éteint)', 4000); },
  cmd: ({ text }) => command(String(text).slice(0, 2000)),
  'cast.stop': () => { S.cast = null; },
  'cast.text': ({ text, seconds = null }) => castTry(() => castText(text, { seconds })),
  'cast.link': ({ url, title = '', seconds = null, raw = false }) => castTry(() => castLink(url, title, { seconds, raw })),
  'cast.again': ({ id, raw = false }) => {
    const e = S.cast_recent.find(x => x.id === id); if (!e) return toast("Ce cast n'est plus sur Pixel.", 3000);
    castStart(Object.fromEntries(CAST_ITEM.filter(k => k in e).map(k => [k, e[k]])), { raw });
  },
  'cast.end': ({ id, error = '' }) => {                   // Pixel's screen: the video is over, or it could not read it
    if (!S.cast || S.cast.id !== id) return; S.cast = null;
    if (error) toast({ video: "Pixel n'arrive pas à lire cette vidéo (format ?).", image: "Pixel n'arrive pas à afficher cette image." }[error] || "Pixel n'arrive pas à l'afficher.", 4000);
  },
  'cast.colors': ({ raw = null } = {}) => { if (S.cast) S.cast.raw = raw == null ? !S.cast.raw : !!raw; },
  'ecran.code': () => {                                   // ecran.py: a one-time code on Pixel's screen (the phone app shows it too)
    if (S.cast && S.cast.kind === 'screen' && S.cast.phase === 'code' && Date.now() < S.cast.until) return;
    ecranCard('code', "Partage d'écran", "Sur l'ordinateur, tape ce code dans la page « Partager mon écran » (pixel.local:8080/ecran).", { code: String(Math.floor(Math.random() * 1e6)).padStart(6, '0'), until: Date.now() + 180e3 });
  },
  'ecran.fail': ({ id, why = '' }) => { if (!S.cast || S.cast.id !== id || S.cast.kind !== 'screen') return; S.cast = null; toast(ECRAN_WHY[why] || "Pixel n'arrive pas à afficher cet écran.", 6000); },
  'airplay.stop': () => { if (S.cast && S.cast.via === 'airplay') S.cast = null; },

  /* lab-only actions */
  'lab.ecran': ({ what = 'pc' } = {}) => { if (ECRAN_LAB[what]) ECRAN_LAB[what](); },
  'lab.toast': ({ msg, ms = 4000, mood: m = null }) => { toast(String(msg || '').slice(0, 300) || 'NOTIFICATION', ms); if (m) mood(m, 1800); },
  'lab.chat': () => { chatScript(); },
  'lab.codex': ({ fail = false, task = 'corrige le test qui échoue' } = {}) => codexStart(task, !!fail),
  'lab.timer_end': () => { if (!T.running) { if (T.left <= 0) T.left = T.total; T.running = true; } T.ends_at = Date.now(); },
  'lab.weather': ({ kind = 'exemple' } = {}) => {
    const w = demoWeather(), order = KINDS.map(k => k.id);
    const force = (d, k, i) => { const [code, hi, lo, wind, hum] = FORCE[k]; Object.assign(d, { kind: k, label: wkind(code)[1], tmax: hi + [0, -1, 1, 0, 2][i], tmin: lo + [0, 1, -1, 0, 1][i], wind: wind + i, hum }); };
    if (kind === 'melange') w.days.forEach((d, i) => force(d, order[i % order.length], i));
    else if (FORCE[kind]) w.days.forEach((d, i) => force(d, kind, i));
    if (kind !== 'exemple') { const d = w.days[0]; w.now = { t: d.tmax - 2, kind: d.kind, label: d.label, wind: d.wind, hum: d.hum }; }
    S.weather = w;
  },
  'lab.agenda': ({ preset = 'exemple' } = {}) => {
    const a = demoAgenda(), d = new Date(), h = d.getHours() + d.getMinutes() / 60;
    if (preset === 'vide') { a.status = 'ok'; a.events = []; }
    if (preset === 'bientot') a.events.push({ day: 0, start: h + 10 / 60, end: h + 40 / 60, title: 'Appel avec Sam', allday: false });
    if (preset === 'journee') a.events.push({ day: 0, start: 0, end: 0, title: 'Anniversaire de Léa', allday: true }, { day: 1, start: 0, end: 0, title: 'Jour férié', allday: true });
    sortEvents(a.events); S.agenda = a;
  },
  'lab.theme': ({ name }) => { if (TNAME[name]) S.view.theme = name; },          // no toast: used by the theme benchmark
  'lab.settings': ({ sleep_min }) => { if (sleep_min != null && Number(sleep_min) > 0) S.settings.sleep_min = Number(sleep_min); },
};
if (window.PixelHubYT) Object.assign(A, PixelHubYT({ S, mark, toast, start: castStart, stop: () => { S.cast = null; } }));   // YouTube (demo-yt.js)

/* ---------- Pixel de poche (pixel/poche.py): the two Pixels pass news, and the voyage ---------- */
S.poche = { ev: null, voyage: null, here: 0 };
const POCHE_KINDS = ['bonjour', 'tape', 'caresse', 'secoue', 'la', 'au-revoir'], POCHE_GAP = 2500, POCHE_VOYAGE = 60000, pocheLast = {};
const pocheVisiting = () => { const v = S.poche.voyage; return !!v && v.to === 'poche' && Date.now() < v.until; };
Object.assign(A, {
  'poche.touch': ({ kind, by = 'poche' } = {}) => {
    if (!POCHE_KINDS.includes(kind) || !['poche', 'pi'].includes(by)) return;
    const t = Date.now(), k = by + ' ' + kind; if (t - (pocheLast[k] ?? -1e15) < POCHE_GAP) return; pocheLast[k] = t;
    if (by === 'poche') S.poche.here = kind === 'au-revoir' ? 0 : t;
    if (kind === 'la' || kind === 'au-revoir') return;
    S.poche.ev = { id: ((S.poche.ev && S.poche.ev.id) || 0) + 1, by, kind, t0: t };
  },
  'poche.voyage': ({ to = 'poche' } = {}) => {
    const t = Date.now();
    if (to === 'poche' && !pocheVisiting()) S.poche.voyage = { to: 'poche', t0: t, until: t + POCHE_VOYAGE };
    else if (to === 'pi' && pocheVisiting()) S.poche.voyage = { to: 'pi', t0: t, until: t };
    else return;
    S.anim = null; S.screen = 'visage';
  },
});

/* ---------- typed commands (port of pixel/commands.py; themes and moods come from the live lists) ---------- */
const HELP = "salon 40 · allume bureau · éteins tout · scène film · minuteur 10 · pause · thème manga · codex <tâche> · météo, agenda… (nom d'un écran) · humeur content · anim danse · animations · fais le poisson · scènes · visage vivant · caste <lien ou texte> · stop cast · code tv · sinon : Claude";
const SCREEN_WORDS = { ...Object.fromEntries(NAV.map(i => [norm(NAMES[i]), i])), lumiere: 'lumieres', lampes: 'lumieres', timer: 'minuteur', meteo: 'meteo', systeme: 'systeme', visage: 'visage' };
const THEME_WORDS = {}, MOOD_WORDS = {};
ALLT.forEach(t => { THEME_WORDS[kw(t.id)] = t.id; THEME_WORDS[kw(t.name)] ??= t.id; });   // every theme: a disabled one gets the "not on" message
for (const [w, id] of [['actuel', 'moderne'], ['anime', 'manga']]) if (ALLNAME[id]) THEME_WORDS[w] ??= id;     // commands.py extras
MOODS.forEach(m => { MOOD_WORDS[kw(m.id)] = m.id; MOOD_WORDS[kw(m.name)] ??= m.id; });
const akey = s => kw(s).replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();      // anims.py key()
const ANIM_WORDS = {};
for (const a of ANIMS) for (const w of [a.id, a.id.replace(/-/g, ' '), a.label]) ANIM_WORDS[akey(w)] ??= a.id;
const BARE = { danse: 'danse', chante: 'chante', coucou: 'salut', bisou: 'bisou' };
/* Pixel's personality scenes (persona.js, through screens.js), and the words that name them (pixel/scenes.py) */
const PSCENES = typeof Screens !== 'undefined' && Screens.persona ? Screens.persona.scenes : [];
const SBY = Object.fromEntries(PSCENES.map(s => [s.id, s]));
const bare = k => { for (const a of ['le ', 'la ', 'les ', "l'", 'un ', 'une ', 'des ', 'du ', 'ton ', 'ta ', 'il ']) if (k.startsWith(a)) return k.slice(a.length).trim(); return k; };
const SCENE_WORDS = {};
for (const s of PSCENES) for (const w of [s.id, s.id.replace(/-/g, ' '), s.label]) { const k = akey(w); SCENE_WORDS[k] ??= s.id; SCENE_WORDS[bare(k)] ??= s.id; }
for (const [w, id] of Object.entries({ poissons: 'poisson', promenade: 'balade', 'cache cache': 'cache', economiseur: 'dvd', eternuer: 'atchoum', siffler: 'sifflote',
  'danse secrete': 'danse', dodo: 'sieste', meditation: 'zen', bouder: 'boude', sport: 'gym', reve: 'reverie', 'coucou cache': 'cache' })) if (SBY[id]) SCENE_WORDS[w] ??= id;
const findScene = s => { const k = akey(s); return SCENE_WORDS[k] || SCENE_WORDS[bare(k)] || null; };
const FACE_WORDS = { pack: 'pack', 'pack 52': 'pack', 52: 'pack', animations: 'pack', vivant: 'vivant', anime: 'vivant' };
function findRoom(word) {
  const w = norm(word).replace(/^(le|la|les|l')\s*/, '');
  if (['tout', 'toutes', 'tous', 'partout', 'lumieres', 'lampes', '*'].includes(w)) return '*';
  const r = S.lights.rooms.find(x => norm(x.name) === w || norm(x.name).startsWith(w));
  return r ? r.name : null;
}
function command(raw) {
  raw = raw.trim(); const t = norm(raw); let m;
  if (!t) return;
  if (['aide', 'help', '?', '/aide'].includes(t)) return toast(HELP, 9000);
  if (['/effacer', '/clear', 'effacer'].includes(t)) return A['chat.clear']();
  if (['stop cast', 'arrete le cast', 'arrete de caster', 'fin du cast'].includes(t) || (['stop', 'arrete', 'arreter'].includes(t) && S.cast)) return A['cast.stop']();   // commands.py: casting
  if (['code tv', 'code tele', 'code youtube', 'code tv youtube'].includes(t)) return A['ytcast.code']?.();
  if (/^(?:cast|caste|caster)\s+\S/.test(t)) { const rest = raw.replace(/^\S+\s+/, '').trim(); return /^https?:\/\//i.test(rest) ? A['cast.link']({ url: rest }) : A['cast.text']({ text: rest }); }
  if (t.startsWith('codex ') && raw.length > 6) { A['screen.show']({ screen: 'codex' }); return A['codex.run']({ task: raw.slice(6).trim() }); }
  if ((m = t.match(/^(minuteur|timer|chrono)(?:\s+(\d+(?:[.,]\d+)?))?\s*(?:min|minutes?)?$/))) { A['screen.show']({ screen: 'minuteur' }); if (m[2]) A['timer.start']({ minutes: parseFloat(m[2].replace(',', '.')) }); return; }
  if (['pause', 'reprendre', 'stop'].includes(t) && (T.running || t === 'reprendre')) return A['timer.toggle']();
  if ((m = t.match(/^(?:scene|ambiance)\s+(.+)$/))) return A['lights.scene']({ name: m[1] });
  if ((m = t.match(/^(allume|allumer|eteins|eteindre|eteint)\s+(.+)$/)) && findRoom(m[2])) return A['lights.set']({ room: findRoom(m[2]), on: m[1].startsWith('allum') });
  if ((m = t.match(/^(?:(allume|eteins)\s+)?(tout|toutes les lumieres|les lumieres)(?:\s+(on|off))?$/))) return A['lights.set']({ room: '*', on: (m[1] || 'allume') === 'allume' && m[3] !== 'off' });
  if ((m = t.match(/^(.+?)\s+(on|off|\d{1,3})\s*%?$/)) && findRoom(m[1])) {
    const room = findRoom(m[1]), v = m[2];
    return v === 'on' || v === 'off' ? A['lights.set']({ room, on: v === 'on' }) : A['lights.set']({ room, bri: Math.max(0, Math.min(100, parseInt(v, 10))) });
  }
  if ((m = kw(raw).match(/^(?:theme|style)\s+(suivant|precedent|\+|-|plus|moins)$/))) {   // commands.py: theme.step
    if (THEMES.length < 2) return toast(`Pour le moment, seul le thème ${THEMES[0].name} est activé.`, 4000);
    const i = Math.max(0, THEMES.findIndex(t => t.id === S.view.theme)), d = /suivant|\+|plus/.test(m[1]) ? 1 : -1;
    return A['theme.set']({ name: THEMES[(i + d + THEMES.length) % THEMES.length].id });
  }
  if ((m = kw(raw).match(/^(?:theme|style)\s+(.+)$/)) && THEME_WORDS[m[1]]) return A['theme.set']({ name: THEME_WORDS[m[1]] });
  if ((m = kw(raw).match(/^humeur\s+(.+)$/)) && MOOD_WORDS[m[1]]) { const id = MOOD_WORDS[m[1]]; A['screen.show']({ screen: 'visage' }); return A['mood.set']({ name: id, ms: id === 'endormi' ? 0 : 3000 }); }
  if ((m = t.match(/^visage\s+(.+)$/)) && FACE_WORDS[m[1]]) { A['face.set']({ name: FACE_WORDS[m[1]] }); return A['screen.show']({ screen: 'visage' }); }
  if (['scenes', 'les scenes', 'liste des scenes'].includes(t))
    return toast('Ses moments de vie : ' + PSCENES.filter(s => s.group === 'vie').map(s => s.label).join(', ') + '. Tape « fais le poisson », « fais la sieste »…', 15000);
  if ((m = t.match(/^(?:fais|fait|faire|joue)\s+(.+)$/)) && findScene(m[1])) return A['scene.play']({ id: findScene(m[1]) });
  if (['animations', 'les animations', 'liste des animations'].includes(t))
    return toast('Les 52 animations. ' + AGROUPS.map(g => g + ' : ' + ANIMS.filter(a => a.group === g).map(a => a.label).join(', ')).join(' · ') + '. Tape « anim » et son nom.', 15000);
  if ((m = t.match(/^(?:anim|animation)\s+(.+)$/)) || BARE[t]) {
    const id = BARE[t] || ANIM_WORDS[akey(m[1])];
    if (!id) { mood('confus', 2500); return toast('Je ne connais pas cette animation. Tape « animations » pour la liste.', 5000); }
    A['screen.show']({ screen: 'visage' }); return A['anim.play']({ id });
  }
  if (SCREEN_WORDS[t]) return A['screen.show']({ screen: SCREEN_WORDS[t] });
  A['chat.ask']({ text: raw });
}

/* ---------- Pixel sans Pi (../local.js: the phone app's own Pixel, window.PIXEL_LOCAL): no fake system graphs, and the
   parts local.js works with: the actions, the broadcast, the themes his Pi offers ---------- */
const LOCAL = !!window.PIXEL_LOCAL;
/* A feature's state is kept on the phone, and seeded from his Pi's snapshot, as S[key] (its snapshot shape). When S[key] is
   its truth (changed in place, like S.timer or S.caractere), there is nothing to do. When its truth is elsewhere (a closure
   that publish() copies into S[key]), it says how to take a kept value back, from anywhere in this file (hoisted):
     restorable('nourrir', v => { ...keep what is valid in v...; publish(); });
   local.js calls it at start and whenever a newer copy comes (the app's, his Pi's), instead of writing S[key]. */
function restorable(key, fn) { if (typeof fn === 'function') (restorable.fns ||= {})[key] = fn; }
const local = {
  A, mark, toast, mood, restorable,
  restorers: () => restorable.fns || {},
  themes(ids) {                     // in place: row3(), theme.set and the commands read THEMES and TNAME
    const on = ALLT.filter(t => Array.isArray(ids) && ids.includes(t.id)); if (!on.length) return;
    THEMES.splice(0, THEMES.length, ...on);
    for (const k of Object.keys(TNAME)) delete TNAME[k];
    for (const t of on) TNAME[t.id] = t.name;
    S.settings.themes = on.map(t => t.id);
    if (!TNAME[S.view.theme]) S.view.theme = on[0].id;
  },
};

/* ---------- background jobs: timer tick (0.25 s), system graphs (1 s) ---------- */
setInterval(() => {
  if (S.cast && ((S.cast.until && Date.now() >= S.cast.until) || Date.now() - S.cast.t0 > CAST_LIVE)) { S.cast = null; mark(); }   // cast.py tick()
  if (T.running && tleft() <= 0) { Object.assign(T, { left: 0, running: false }); if (T.mode === 'TRAVAIL') T.done++; toast('MINUTEUR : TERMINÉ !', 5000); mood('surpris', 2500); }
}, 250);
setInterval(() => {
  if (LOCAL) return;                // Pixel sans Pi: Système shows the phone's own measures (local.js)
  const s = S.sys, load = (S.codex.running ? 38 : 0) + (S.chat.phase !== 'idle' ? 22 : 0);
  s.cpu = Math.min(100, 4 + Math.random() * 8 + load); s.temp = 45 + load / 7 + Math.sin(Date.now() / 5000) * 1.2 + Math.random() * 0.8;
  s.ram_used = 1.2e9 + load * 9e6 + Math.random() * 2e7; s.uptime += 1;
  s.temps = [...s.temps, s.temp].slice(-60); s.cpus = [...s.cpus, s.cpu].slice(-60); mark();
}, 1000);

return {
  NAV, NAMES, THEMES, ALLT, MOODS, KINDS, ANIMS, AGROUPS, FACES, PSCENES, S, norm, row3, snapshot, findScene,
  cast: { file: castFile, sample: castSample, sniff: castSniff, classify: castClassify },   // the lab's Caster panel (and tests)
  themeName: id => TNAME[id] || id, moodName: id => MNAME[id] || id,
  busy: () => ({ chat: chatBusy, codex: S.codex.running }),
  /* Initial values, before the first listener (no toast): the lab restores the last theme and screen. */
  configure({ theme, screen, sleep_min, face } = {}) { if (TNAME[theme]) S.view.theme = theme; if (NAV.includes(screen)) S.screen = screen; if (Number(sleep_min) > 0) S.settings.sleep_min = Number(sleep_min); if (FACES[face] && ANIMS.length) S.view.face = face; },
  dispatch(action, args = {}) {
    const f = A[action];
    if (!f) { console.warn('Pixel Lab: unknown action', action); return; }
    if (!String(action).startsWith('lab.')) S.act = { name: action, t0: Date.now() };   // state.py: the last action
    try { f(args && typeof args === 'object' ? args : {}); } catch (e) { console.warn('Pixel Lab: action failed', action, e); toast('ERREUR : ' + action); }
    mark();
  },
  listen(fn) { listeners.push(fn); fn(snapshot()); },
  local,                            // Pixel sans Pi (../local.js)
};
})();
