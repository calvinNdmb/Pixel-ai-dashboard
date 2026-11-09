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
const HELP = "salon 40 · allume bureau · éteins tout · scène film · minuteur 10 · pause · thème manga · codex <tâche> · météo, agenda… (nom d'un écran) · humeur content · anim danse · animations · fais le poisson · scènes · visage vivant · caste <lien ou texte> · stop cast · code tv · caractère câlin · mange une pomme · exo · table de 7 · sinon : Claude";
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
  if (carCommand(raw)) return;                           // « sois grognon », « plus câlin »… (caractère, below), last before Claude as in commands.py
  if (NOUR && NOUR.command(raw)) return;                 // « mange une pomme », « à table ! » (Nourrir, below): after him, as in commands.py
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

/* ---------- caractère (pixel/caractere.py; its rules come from ../caractere.js): presets, traits, his name and yours ---------- */
const CAR = window.PixelCaractere;
function carCommand(raw) {                               // caractere.py command(): true when it was one of his
  const r = CAR && S.caractere ? CAR.command(String(raw || '').slice(0, 2000), S.caractere) : null;
  if (!r) return false;
  if (r.toast) { toast(r.toast, r.ms || 8000); if (r.mood) mood(r.mood, 2500); return true; }
  A[r.action](r.args || {}); return true;
}
if (CAR) {
  let kept = null; try { kept = JSON.parse(localStorage.getItem('pixel_lab_caractere')); } catch {}   // the lab remembers him, like caractere.json
  S.caractere = { ...CAR.clean(kept || {}), change: null, essai: 0 };
  const commit = (n, ch) => {
    if (!ch) return;
    Object.assign(S.caractere, CAR.saved(n)); S.caractere.change = { t0: Date.now(), ...ch }; S.anim = null; S.screen = 'visage';
    try { localStorage.setItem('pixel_lab_caractere', JSON.stringify(CAR.saved(S.caractere))); } catch {}
    if (CAR.notice(S.caractere, ch)) setTimeout(() => { if (CAR.notice(S.caractere, ch)) toast(CAR.notice(S.caractere, ch), 7000); }, CAR.NOTICE_AFTER);
  };
  Object.assign(A, {
    'caractere.set': (a = {}) => commit(...CAR.apply(S.caractere, a)),
    'caractere.ajuste': ({ trait, d = 20 } = {}) => commit(...CAR.ajuste(S.caractere, trait, d)),
    'caractere.reset': () => commit(CAR.clean({}), { quoi: 'reset', kind: 'pixel', adj: CAR.ADJ.pixel }),
    'caractere.essai': () => { S.caractere.essai = Date.now(); S.anim = null; S.screen = 'visage'; },
  });
}

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

/* ---------- Nourrir (pixel/nourrir.py): his belly, his tastes, his meals. The menu is web/scenes/nourrir.js's (PixelFoods). ----------
   Same rules as the server: the belly empties in the day only, the third sweet in a row is a sugar rush, full he refuses...
   His tastes are kept in this browser (pixel_lab_nourrir), so they stay across reloads like the server's nourrir.json.
   lab.nourrir { ventre, reaction, plat }: the lab's buttons (set his belly; play a reaction without the rules). */
const NF = window.PixelFoods;
const NOUR = (() => {
  if (!NF) return null;
  const SPEED = { lente: 3, normale: 6, rapide: 12 }, W_FAV = { plat: 3, sucre: 2, fruit: 1, legume: 0.3, boisson: 0.6, robot: 1.2 },
    W_LIKE = { plat: 2, sucre: 2, fruit: 1.2, legume: 0.6, boisson: 1, robot: 1 }, W_HATE = { legume: 3, fruit: 1.4, boisson: 1, plat: 1, sucre: 0.4, robot: 0.6 };
  const OFF = 'Les repas de Pixel sont en pause : réactive-les dans Nourrir, sur ton téléphone.', GAP = 6000;
  const trait = k => {                  // his traits of today (with « Humeur du jour », pixel/nourrir.py _traits)
    const c = S.caractere; let t = c && c.traits;
    if (t && c.humeur_jour === true && window.PixelCaractere) try { t = window.PixelCaractere.today(c); } catch { /* the plain traits */ }
    const v = t && t[k]; return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 50;
  };
  const level = v => (v >= 55 ? 0 : v >= 25 ? 1 : 2), night = t => { const h = new Date(t).getHours(); return h >= 23 || h < 6; };
  function roll() {
    const draw = (pool, w, n) => { pool = [...pool]; const out = []; while (pool.length && out.length < n) { let x = Math.random() * pool.reduce((s, f) => s + w[f.cat], 0), i = 0; for (; i < pool.length - 1; i++) { x -= w[pool[i].cat]; if (x < 0) break; } out.push(pool[i].id); pool.splice(i, 1); } return out; };
    const prefere = draw(NF.FOODS, W_FAV, 1)[0], aime = draw(NF.FOODS.filter(f => f.id !== prefere), W_LIKE, 5);
    return { aime, deteste: draw(NF.FOODS.filter(f => f.id !== prefere && !aime.includes(f.id)), W_HATE, 3), prefere };
  }
  let saved = {}; try { saved = JSON.parse(localStorage.getItem('pixel_lab_nourrir')) || {}; } catch { saved = {}; }
  const good = g => g && NF.BY[g.prefere] && Array.isArray(g.aime) && Array.isArray(g.deteste) && [...g.aime, ...g.deteste].every(i => NF.BY[i]);
  const N = { on: saved.on !== false, vitesse: SPEED[saved.vitesse] ? saved.vitesse : 'normale', ventre: 70, t: Date.now(), gouts: good(saved.gouts) ? saved.gouts : roll(),
    journal: [], dernier: null, sucres: 0, sucreT: 0, last: -1e9 };
  const keep = () => { try { localStorage.setItem('pixel_lab_nourrir', JSON.stringify({ on: N.on, vitesse: N.vitesse, gouts: N.gouts })); } catch {} };
  const rate = () => SPEED[N.vitesse] * (0.6 + 0.8 * trait('gourmand') / 100);
  function tick(t = Date.now()) {         // minute by minute: the night does not count; a gap past 5 min (the clock moved, the tab slept)
    if (N.on && t > N.t) {                //   counts like the server down: 6 awake hours at most, never below 25
      const down = t - N.t > 300000; let h = 0;
      for (let a = N.t; a < t && !(down && h >= 6); a += 60000) if (!night(a)) h += Math.min(60000, t - a) / 3.6e6;
      N.ventre = !down ? Math.max(0, N.ventre - h * rate()) : N.ventre > 25 ? Math.max(25, N.ventre - Math.min(6, h) * rate()) : N.ventre;
    }
    N.t = t < N.t - 300000 ? t : Math.max(N.t, t);   // a clock set back: count from its new time
  }
  function publish() {
    S.nourrir = { on: N.on, ventre: Math.round(N.ventre), faim: level(N.ventre), dernier: N.dernier, gouts: { ...N.gouts, aime: [...N.gouts.aime], deteste: [...N.gouts.deteste] },
      journal: N.journal.map(j => ({ ...j })), reglages: { on: N.on, vitesse: N.vitesse } };
  }
  function react(f, t) {
    const g = N.gouts, v = N.ventre;
    if (v >= 92 + (trait('gourmand') - 50) / 10) return ['plein', false, N.sucres];
    if (g.deteste.includes(f.id) && trait('grognon') >= 70) return ['refuse', false, N.sucres];
    let run = f.cat === 'sucre' ? (t >= N.sucreT && t - N.sucreT < 45 * 60000 ? N.sucres + 1 : 1) : 0, r;
    if (f.id === g.prefere) r = 'prefere';
    else if (g.deteste.includes(f.id)) r = 'beurk';
    else if (run >= 3) { r = 'sucre'; run = 0; }
    else if (v + f.valeur > 104) r = 'eclate';
    else if (f.cat === 'robot') r = 'robot';
    else if (f.cat === 'legume') r = 'legume';
    else r = g.aime.includes(f.id) ? 'aime' : 'miam';
    return [r, true, run];
  }
  function meal(id, r, rot, choisi) {
    const t = Date.now();
    N.last = t; N.dernier = { id: ((N.dernier && N.dernier.id) || 0) + 1, plat: id, t, reaction: r, rot: !!rot, choisi: !!choisi };
    N.journal = [{ plat: id, t, reaction: r }, ...N.journal].slice(0, 10);
    S.anim = null; S.screen = 'visage'; publish();
  }
  function donner(id, choisi) {
    const f = NF.BY[id]; if (!f) return null;
    if (!N.on) { toast(OFF, 5000); return null; }
    const t = Date.now(); if (t >= N.last && t - N.last < GAP) return null;
    tick(t);
    const [r, eaten, run] = react(f, t);
    if (eaten) { N.ventre = Math.min(100, N.ventre + f.valeur * (r === 'beurk' ? 0.7 : 1)); N.sucres = run; if (f.cat === 'sucre') N.sucreT = t; }
    meal(id, r, r === 'eclate' || (['miam', 'aime', 'prefere', 'legume'].includes(r) && Math.random() < 0.04 + 0.26 * trait('farceur') / 100), choisi);
    return r;
  }
  function choisir() {
    const g = N.gouts, x = Math.random(), any = NF.FOODS.filter(f => !g.deteste.includes(f.id) && f.cat !== 'robot');
    return x < 0.35 ? g.prefere : x < 0.8 && g.aime.length ? g.aime[Math.floor(Math.random() * g.aime.length)] : (any[Math.floor(Math.random() * any.length)] || NF.FOODS[0]).id;
  }
  Object.assign(A, {
    'nourrir.donner': ({ plat, choisi = false } = {}) => { donner(String(plat), choisi); },
    'nourrir.reglages': ({ on = null, vitesse = null } = {}) => {
      tick(); if (on != null && !!on !== N.on) { N.on = !!on; N.t = Date.now(); }
      if (SPEED[vitesse]) N.vitesse = vitesse; keep(); publish();
    },
    'nourrir.gouts': () => { N.gouts = roll(); keep(); publish(); },
    'lab.nourrir': ({ ventre = null, reaction = null, plat = null } = {}) => {
      if (ventre != null && Number.isFinite(Number(ventre))) { N.ventre = Math.max(0, Math.min(100, Number(ventre))); N.t = Date.now(); }
      if (reaction && NF.REACTIONS[reaction]) { const id = NF.BY[plat] ? plat : choisir(); N.last = -1e9; meal(id, reaction, reaction === 'eclate', false); }
      publish();
    },
  });
  /* the commands (pixel/nourrir.py command()): command() asks them after the character's, just before Claude, as commands.py does */
  const ART = ['un peu de ', 'un bout de ', 'une part de ', 'un morceau de ', 'un verre de ', 'une tasse de ', 'un bol de ', 'une tranche de ', 'une assiette de ', 'un ', 'une ', 'des ', 'du ', 'de la ', "de l'", 'de ', "d'", 'le ', 'la ', 'les ', "l'", 'ce ', 'cette ', 'ces ', 'ton ', 'ta ', 'tes ', 'mon ', 'ma ', 'mes ', 'son ', 'sa ', 'ses '];
  const key = s => norm(s).replace(/’/g, "'").replace(/œ/g, 'oe').replace(/[^a-z0-9' -]+/g, ' ').replace(/\s+/g, ' ').trim();
  const strip = k => { for (let n = 0; n < 2; n++) { const a = ART.find(x => k.startsWith(x)); if (a) k = k.slice(a.length).trim(); } return k; };
  const WORDS = {};
  for (const f of NF.FOODS) for (const w of [f.id, f.id.replace(/-/g, ' '), f.label, f.nom]) { const k = strip(key(w)); for (const v of [k, k + 's', key(w)]) WORDS[v] ??= f.id; }
  for (const [w, id] of Object.entries({ spaghetti: 'pates', spaghettis: 'pates', pate: 'pates', nouilles: 'pates', hamburger: 'burger', cheeseburger: 'burger', chocolat: 'chocolat', lait: 'lait',
    batterie: 'pile', byte: 'octet', electricite: 'prise', courant: 'prise', jus: 'prise', 'cookies web': 'cookie-web', 'cookie web': 'cookie-web', friandise: 'bonbon', pain: 'baguette', sucette: 'bonbon' })) WORDS[w] ??= id;
  const find = s => { const k = strip(key(s).replace(/\s+(?:a|pour)\s+(?:pixel|toi|lui)$/, '')); return WORDS[k] || WORDS[/[sx]$/.test(k) ? k.slice(0, -1) : k] || null; };
  const BELLY = /^(?:pixel[, ]+)?(?:est-ce que )?(?:tu as|t'as|t as|as-tu|as tu|tu n'as pas|t'as pas) (?:faim|un petit creux|un creux)(?: pixel)?$/;
  const TABLE = /^(?:a table|a la soupe|a manger|on mange|c'est l'heure de manger|nourris(?:-le| le| pixel|-toi| toi)?|nourrir pixel|donne(?:-lui| lui)? a manger(?: a pixel)?|fais(?:-le| le)? manger|mange quelque chose|mange un truc)(?: pixel)?$/;
  const EAT = /^(?:pixel[, ]+)?(?:mange donc|manges|mange|goute|bois|avale|croque|grignote|tiens,? (?:voila|voici))\s+(.+)$/, GIVE = /^(?:donne-lui|donne lui|donne|file-lui|file lui|offre-lui|offre lui|offre|sers-lui|sers lui|apporte-lui|apporte lui)\s+(.+)$/;
  function command(text) {
    const t = key(text).replace(/\s+(?:s'il te plait|s il te plait|stp|svp)$/, '');
    const busy = () => { if (!N.on) toast(OFF, 5000); else if (Date.now() >= N.last && Date.now() - N.last < GAP) toast('Doucement, il mâche encore !', 3000); else return false; return true; };
    if (BELLY.test(t)) { tick(); publish(); A['scene.play']({ id: 'nourrir-ventre' }); return true; }
    if (TABLE.test(t)) { if (!busy()) donner(choisir(), true); return true; }
    const m = t.match(EAT) || t.match(GIVE), id = m && find(m[1]);
    if (!id) return false;
    if (!busy()) donner(id, false);
    return true;
  }
  setInterval(() => { const v = Math.round(N.ventre), f = level(N.ventre); tick(); if (Math.round(N.ventre) !== v || level(N.ventre) !== f) { publish(); mark(); } }, 60000);
  publish();
  return { N, tick, publish, find, roll, command };
})();

/* ---------- the math exercises (pixel/exos.py): a smaller port for the lab ----------
   The same 15 kinds (pixel/exos.py KINDS), 5 levels, modes (exo, serie, table, chrono), flow (a hint and a second try, then the
   correction; no second try in the challenge), levels that adapt, daily goal, trophies, snapshot "exos" and typed commands.
   What differs: fewer templates and simpler mistakes per kind, 6 riddles, and the stats live in this page only (no file).
   Lab-only: lab.exos { juste } answers right or wrong for you. */
const EXK = [['addition', 'Additions'], ['soustraction', 'Soustractions'], ['table', 'Tables de multiplication'], ['division', 'Divisions'], ['complement', 'Compléments'],
  ['double', 'Doubles et moitiés'], ['mental', 'Calcul mental'], ['comparaison', 'Comparaisons'], ['suite', 'Suites logiques'], ['probleme', 'Petits problèmes'],
  ['heure', 'Heures et durées'], ['fraction', 'Fractions'], ['pourcentage', 'Pourcentages'], ['carre', 'Carrés'], ['enigme', 'Énigmes']];
const EXL = Object.fromEntries(EXK), EXI = EXK.map(x => x[0]), EXMIN = { division: 2, carre: 2, pourcentage: 3, fraction: 2 };
const EXCALC = ['addition', 'soustraction', 'table', 'division', 'complement', 'double', 'mental'];
const EXTR = [['premier', 'Premier exo', s => s.total >= 1], ['serie5', '5 d\'affilée', s => s.serie_max >= 5], ['serie10', '10 d\'affilée', s => s.serie_max >= 10],
  ['serie20', '20 d\'affilée', s => s.serie_max >= 20], ['objectif', 'Objectif du jour', s => s.coupes >= 1], ['semaine', '7 objectifs', s => s.coupes >= 7],
  ['chrono10', '10 en 1 minute', s => s.record_chrono >= 10], ['cent', '100 exos', s => s.total >= 100], ['niveau5', 'Niveau 5', s => Object.values(s.niveaux).includes(5)],
  ['enigmes', '5 énigmes', s => ((s.par_type.enigme || {}).ok || 0) >= 5], ['tables', 'As des tables', s => ((s.par_type.table || {}).ok || 0) >= 50]];
const EXNB = String.fromCharCode(160), exRi = (a, b) => a + Math.floor(Math.random() * (b - a + 1)), exPk = a => a[Math.floor(Math.random() * a.length)];
const exFmt = v => {
  if (typeof v === 'string') return v;
  const x = Math.round(v * 1000) / 1000, a = Math.abs(x), w = Math.floor(a), f = String(Math.round((a - w) * 1000) / 1000).slice(2);
  return (x < 0 ? '−' : '') + (w >= 1000 ? String(w).replace(/\B(?=(\d{3})+(?!\d))/g, EXNB) : String(w)) + (f ? ',' + f : '');
};
const exHm = m => { const h = Math.floor(m / 60) % 24, mn = m % 60; return `${h}${EXNB}h` + (mn ? `${EXNB}${String(mn).padStart(2, '0')}` : ''); };
const exCanon = s => {
  let t = norm(s).replace(/−/g, '-').replace(/[\s'’]+/g, '').replace(/[!.?]+$/, '').replace(/^(?:=|lareponseest|lareponse|reponse|cest)/, '');
  let m = /^(\d{1,2})(?:h|:)(\d{0,2})$/.exec(t); if (m) return `${+m[1]}h${String(+(m[2] || 0)).padStart(2, '0')}`;
  m = /^(-?\d+(?:[.,]\d+)?)(?:minutes?|mn|min|euros?|€|%|kg|jours?|pattes?|roues?|ans?)?$/.exec(t); if (m) return String(Number(m[1].replace(',', '.')));
  return t;
};
const exSame = (v, a) => { const x = exCanon(v), y = exCanon(a); return x === y || (/^\d{1,2}h00$/.test(y) && x === y.slice(0, -3)); };
function exChoices(ans, wrong) {
  const seen = new Set([exCanon(exFmt(ans))]), out = [];
  for (const w of [...wrong, ...(typeof ans === 'number' ? [1, -1, 10, -10, 2, -2, 5, -5, 3, -3].map(d => ans + d) : [])]) {
    if (w == null || (typeof ans === 'number' && (typeof w !== 'number' || (w < 0 && ans >= 0)))) continue;
    const k = exCanon(exFmt(w)); if (seen.has(k)) continue; seen.add(k); out.push(exFmt(w)); if (out.length === 3) break;
  }
  const ch = [exFmt(ans), ...out]; for (let i = ch.length - 1; i > 0; i--) { const j = exRi(0, i); [ch[i], ch[j]] = [ch[j], ch[i]]; }
  return [exFmt(ans), ch];
}
const EXRID = [[1, 'Dans le jardin, 3 poules et 2 lapins. Combien de pattes en tout ?', '14', ['10', '20', '5'], 'Une poule a 2 pattes, un lapin 4.', '3 × 2 + 2 × 4 = 14 pattes.'],
  [2, 'Hier, c\'était lundi. Quel jour serons-nous demain ?', 'Mercredi', ['Mardi', 'Jeudi', 'Dimanche'], 'Si hier était lundi, aujourd\'hui, c\'est…', 'Aujourd\'hui mardi, donc demain mercredi.'],
  [3, 'Le père de Léa a 5 filles : Lala, Lélé, Lili, Lolo… et la cinquième ?', 'Léa', ['Lulu', 'Lyly', 'Lala'], 'Relis bien le début de la phrase !', 'C\'est le père de Léa : la cinquième, c\'est Léa.'],
  [3, 'Un kilo de plumes ou un kilo de plomb : lequel est le plus lourd ?', 'Pareil', ['Le plomb', 'Les plumes', 'On ne sait pas'], 'Regarde bien les quantités.', 'Un kilo, c\'est un kilo : ils pèsent pareil.'],
  [4, 'Dans une course, tu doubles le deuxième. Quelle est ta place ?', 'Deuxième', ['Premier', 'Troisième', 'Dernier'], 'Tu prends la place de celui que tu doubles.', 'Tu passes devant le deuxième : tu es deuxième.'],
  [5, '5 amis se serrent tous la main une fois. Combien de poignées de main ?', '10', ['25', '20', '5'], 'Le premier en serre 4, le deuxième 3 de plus…', '4 + 3 + 2 + 1 = 10 poignées de main.']];
function exTimes(n, m) {                                   // pixel/exos.py _times_help, shorter
  const p = n * m;
  if (m === 10) return ['Ajoute un zéro à droite.', `${n} × 10 = ${p}.`];
  if (m === 9) return [`Fais ${n} × 10, puis enlève ${n}.`, `${n} × 9 = ${p} : ${n * 10} − ${n} = ${p}.`];
  if (m % 2 === 0 && m > 2) return [`Calcule ${n} × ${m / 2}, puis double.`, `${n} × ${m} = ${p} : ${n} × ${m / 2} = ${n * m / 2}, et ${n * m / 2} × 2 = ${p}.`];
  return [`Calcule ${n} × ${m - 1}, puis ajoute ${n}.`, `${n} × ${m} = ${p} : ${n * (m - 1)} + ${n} = ${p}.`];
}
function exGen(kind, lv, table, k) {
  const R = (q, ans, wrong, hint, ex) => ({ q, ans, wrong, hint, ex });
  let o;
  switch (kind) {
    case 'addition': { const [a, b] = [[exRi(1, 5), exRi(1, 5)], [exRi(11, 79), exRi(2, 9)], [exRi(15, 69), exRi(12, 29)], [exRi(120, 699), exRi(45, 299)], [exRi(1200, 4800), exRi(350, 2900)]][lv - 1];
      o = R(`${exFmt(a)} + ${exFmt(b)} = ?`, a + b, [a + b - 10, a + b + 10, a + b + 1, a + b - 1], 'Ajoute d\'abord les dizaines, puis les unités.', `${exFmt(a)} + ${exFmt(b)} = ${exFmt(a + b)}.`); break; }
    case 'soustraction': { const a = [exRi(3, 10), exRi(11, 20), exRi(31, 98), exRi(300, 999), exRi(2000, 9000)][lv - 1], b = exRi(1, Math.max(1, Math.floor(a * 0.8)));
      o = R(`${exFmt(a)} − ${exFmt(b)} = ?`, a - b, [a - b + 10, a - b - 10, a - b + 1, a + b], 'Enlève d\'abord les dizaines, puis les unités.', `${exFmt(a)} − ${exFmt(b)} = ${exFmt(a - b)} : car ${exFmt(a - b)} + ${exFmt(b)} = ${exFmt(a)}.`); break; }
    case 'table': { const n = table || [exPk([2, 5, 10]), exPk([2, 3, 4, 5, 10]), exRi(2, 9), exRi(6, 9), exRi(12, 25)][lv - 1], m = k || exRi(2, 10), [h, ex] = exTimes(n, m);
      o = R(`${n} × ${m} = ?`, n * m, [n * (m + 1), n * (m - 1), (n + 1) * m, n + m], h, ex); break; }
    case 'division': { const d = [2, exPk([2, 5, 10]), exRi(3, 9), exRi(3, 9), exPk([4, 6, 7, 8, 9])][lv - 1], q = [exRi(1, 10), exRi(2, 10), exRi(2, 10), exRi(11, 25), exRi(12, 40)][lv - 1];
      o = R(`${exFmt(d * q)} ÷ ${d} = ?`, q, [q + 1, q - 1, d * q - d], `Cherche dans la table de ${d} : ${d} × ? = ${d * q}.`, `${d * q} ÷ ${d} = ${q} : car ${d} × ${q} = ${d * q}.`); break; }
    case 'complement': { const t = [10, 20, 100, 1000, 1000][lv - 1], a = t === 10 ? exRi(1, 9) : t === 20 ? exRi(11, 19) : t === 100 ? 10 * exRi(1, 8) + exRi(1, 9) : 5 * exRi(21, 179), c = t - a;
      o = R(`${exFmt(a)} + ? = ${exFmt(t)}`, c, [t === 100 ? c + 10 : c + 100, c - 10, c + 1, c - 1], `Va d'abord jusqu'à la dizaine suivante, puis jusqu'à ${exFmt(t)}.`, `${exFmt(a)} + ${exFmt(c)} = ${exFmt(t)}.`); break; }
    case 'double': { const x = [exRi(1, 10), exRi(11, 30), exRi(26, 99), exRi(105, 499), exRi(500, 2500)][lv - 1];
      o = Math.random() < 0.5 ? R(`Le double de ${exFmt(x)} ?`, 2 * x, [x % 2 ? null : x / 2, 2 * x + 10, 2 * x + 1, x + 2], `Le double, c'est ${exFmt(x)} + ${exFmt(x)}.`, `Le double de ${exFmt(x)} = ${exFmt(2 * x)} : ${exFmt(x)} + ${exFmt(x)}.`)
        : R(`La moitié de ${exFmt(2 * x)} ?`, x, [4 * x, x + 10, x + 1, x - 1], `Cherche le nombre qui, ajouté à lui-même, fait ${exFmt(2 * x)}.`, `La moitié de ${exFmt(2 * x)} = ${exFmt(x)} : ${exFmt(x)} + ${exFmt(x)} = ${exFmt(2 * x)}.`); break; }
    case 'mental': { const a = exRi(2, 9), b = exRi(2, 6), c = exRi(2, 6), d = exRi(1, 9);
      o = [R(`${a} + ${b} + ${c} = ?`, a + b + c, [a + b, a + b + c + 1, a + b + c + 10], 'Ajoute deux nombres, puis le troisième.', `${a} + ${b} = ${a + b}, puis + ${c} = ${a + b + c}.`),
        R(`${a + 10} − ${b} + ${c} = ?`, a + 10 - b + c, [a + 10 - b - c, a + 10 + b + c, a + 10 - b + c + 1], 'Calcule de gauche à droite.', `${a + 10} − ${b} = ${a + 10 - b}, puis + ${c} = ${a + 10 - b + c}.`),
        R(`${a} + ${b} × ${c} = ?`, a + b * c, [(a + b) * c, a + b + c, a + b * c + 1], 'D\'abord les ×, ensuite les +.', `d'abord ${b} × ${c} = ${b * c}, puis ${a} + ${b * c} = ${a + b * c}.`),
        R(`${40 + a} − ${b} × ${c} = ?`, 40 + a - b * c, [(40 + a - b) * c, 40 + a - b - c, 40 + a - b * c + 1], 'D\'abord les ×, ensuite les −.', `d'abord ${b} × ${c} = ${b * c}, puis ${40 + a} − ${b * c} = ${40 + a - b * c}.`),
        R(`(${a + 6} − ${b}) × ${c} + ${d} = ?`, (a + 6 - b) * c + d, [a + 6 - b * c + d, (a + 6 - b) * (c + d), (a + 6 - b) * c + d + 1], 'D\'abord les parenthèses, puis ×, enfin +.', `(${a + 6} − ${b}) = ${a + 6 - b}, × ${c} = ${(a + 6 - b) * c}, + ${d} = ${(a + 6 - b) * c + d}.`)][lv - 1]; break; }
    case 'comparaison': { const big = Math.random() < 0.5; let xs;
      do {
        if (lv === 4) { const i = exRi(0, 3), a = exRi(3, 8), b = exRi(1, 9), c = exRi(1, 9); xs = [i + a / 10, i + (a - 1) / 10 + b / 100, i + a / 10 + c / 1000, i + (a - 1) / 10 + b / 100 + c / 1000]; }
        else if (lv === 5) xs = [-exRi(1, 9), -exRi(1, 9), exRi(1, 9), -exRi(1, 8) - 0.5];
        else xs = [0, 0, 0, 0].map(() => lv === 1 ? exRi(1, 20) : lv === 2 ? exRi(10, 99) : exRi(100, 999));
      } while (new Set(xs.map(x => exFmt(x))).size < 4);
      const ans = big ? Math.max(...xs) : Math.min(...xs), ord = [...xs].sort((p, q) => big ? q - p : p - q);
      o = R(`Le plus ${big ? 'grand' : 'petit'} ?`, exFmt(ans), xs.filter(x => x !== ans).map(exFmt), lv === 4 ? 'Écris-les avec autant de chiffres après la virgule.' : lv === 5 ? 'Avec les nombres négatifs, plus on est loin de zéro, plus on est petit.' : 'Compare d\'abord le nombre de chiffres.',
        `Le plus ${big ? 'grand' : 'petit'}, c'est ${exFmt(ans)} : ${ord.map(exFmt).join(big ? ' > ' : ' < ')}.`); break; }
    case 'suite': { const s0 = exRi(1, 9), st = [exPk([1, 2, 10]), exPk([3, 4, 5]), 2, 0, 0][lv - 1];
      const ts = lv <= 2 ? [0, 1, 2, 3, 4].map(i => s0 + st * i) : lv === 3 ? [0, 1, 2, 3, 4].map(i => s0 * 2 ** i) : lv === 4 ? [0, 1, 2, 3, 4].map(i => (s0 + i) ** 2) : [1, s0, 1 + s0, 1 + 2 * s0, 2 + 3 * s0];
      const last = ts[4], prev = ts[3];
      o = R(ts.slice(0, 4).map(exFmt).join(', ') + ', ?', last, [prev + (prev - ts[2]), last + 1, last - 1], lv <= 2 ? 'On ajoute toujours le même nombre.' : lv === 3 ? 'On ajoute, ou on multiplie ?' : lv === 4 ? 'Pense à 1 × 1, 2 × 2, 3 × 3…' : 'Chaque nombre vient des deux d\'avant.',
        lv <= 2 ? `On ajoute ${st} à chaque fois : ${prev} + ${st} = ${last}.` : lv === 3 ? `On double à chaque fois : ${prev} × 2 = ${last}.` : lv === 4 ? `Ce sont des carrés : ${s0 + 4} × ${s0 + 4} = ${last}.` : `La somme des deux d'avant : ${ts[2]} + ${prev} = ${last}.`); break; }
    case 'probleme': { const a = exRi(6, 10 + lv * 8), b = exRi(2, a - 2), n = exRi(2, 6), m = exPk([2, 4, 5, 10]);
      const tpl = exPk(lv < 3 ? [0, 1] : lv < 5 ? [0, 1, 2, 3] : [2, 3]);
      o = [R(`Pixel a ${a} piles. Il en mange ${b}. Combien lui en reste-t-il ?`, a - b, [a + b, a - b + 1, a - b - 1], 'Il en enlève : c\'est une soustraction.', `${a} − ${b} = ${a - b}.`),
        R(`Pixel a ${a} autocollants. On lui en donne ${b}. Combien en a-t-il ?`, a + b, [a - b, a + b + 1, a + b - 1], 'Il en ajoute : c\'est une addition.', `${a} + ${b} = ${a + b}.`),
        R(`Pixel achète ${n} paquets de ${m} piles. Combien de piles en tout ?`, n * m, [n + m, n * m + m, n * m - m], 'La même quantité plusieurs fois : c\'est une multiplication.', `${n} × ${m} = ${n * m}.`),
        R(`Pixel partage ${n * m} bonbons entre ${n} amis. Combien chacun en reçoit-il ?`, m, [n * m - n, m + 1, m - 1], 'Partager en parts égales : c\'est une division.', `${n * m} ÷ ${n} = ${m}.`)][tpl]; break; }
    case 'heure': { const h = exRi(7, 19), mn = exPk([35, 40, 45, 50]), d = exPk([20, 25, 30]), t = h * 60 + (lv < 3 ? 0 : mn), dd = lv < 3 ? exPk([15, 30, 45]) : d + (mn + d < 60 ? 60 : 0);
      o = lv === 5 ? R('1,5 heure, c\'est combien de minutes ?', `90${EXNB}min`, [`110${EXNB}min`, `150${EXNB}min`, `60${EXNB}min`], '0,5 h, c\'est une demi-heure.', '1 h = 60 min, et 0,5 h = 30 min : 90 min.')
        : R(`Il est ${exHm(t)}. Dans ${dd} minutes, quelle heure est-il ?`, exHm(t + dd), [exHm(t + dd + 60), exHm(t + dd - 60), exHm(t + dd + 5), exHm(t + dd - 5)], 'Une heure = 60 minutes (pas 100 !).', `${exHm(t)} + ${dd} min = ${exHm(t + dd)}.`); break; }
    case 'fraction': { const den = [2, 4, 3, 4, 8][lv - 1], num = lv >= 4 ? (den === 4 ? 3 : 5) : 1, x = den * exRi(2, 12), r = x / den * num;
      o = R(num > 1 ? `Les ${num}/${den} de ${x} ?` : `${{ 2: 'La moitié', 3: 'Le tiers', 4: 'Le quart' }[den]} de ${x} ?`, r, [x / den, x - x / den, r + 1, x / 2], `Partage ${x} en ${den} parts égales${num > 1 ? `, puis prends-en ${num}` : ''}.`, `${x} ÷ ${den} = ${x / den}${num > 1 ? `, et ${num} × ${x / den} = ${r}` : ''}.`); break; }
    case 'pourcentage': { const r = [50, exPk([50, 10]), exPk([25, 10, 20]), exPk([75, 20, 5]), exPk([15, 30, 40])][lv - 1], u = { 50: 2, 10: 10, 25: 4, 20: 5, 75: 4, 5: 20, 15: 20, 30: 10, 40: 5 }[r], x = u * exRi(2, 10), a = x * r / 100;
      o = R(`${r} % de ${x} ?`, a, [r, x - r, x - a, a * 10], { 50: '50 %, c\'est la moitié.', 10: '10 %, c\'est diviser par 10.', 25: '25 %, c\'est le quart.' }[r] || '10 %, c\'est diviser par 10 : pars de là.',
        `${r} % de ${x} = ${a} : ${x} × ${r} ÷ 100 = ${a}.`); break; }
    case 'carre': { const n = [exRi(1, 5), exRi(2, 10), exRi(2, 12), exRi(11, 20), exPk([15, 25, 30, 13, 14])][lv - 1];
      o = R(lv <= 2 ? `${n} × ${n} = ?` : `${n}² = ?`, n * n, [2 * n, n * n + n, n * n - n, (n + 1) ** 2], `${n}², c'est ${n} × ${n} (pas ${n} × 2 !).`, `${n} × ${n} = ${n * n}.`); break; }
    default: { const pool = EXRID.filter(e => e[0] === lv), e = exPk(pool.length ? pool : EXRID); o = R(e[1], e[2], e[3], e[4], e[5]); }
  }
  const [answer, choices] = exChoices(o.ans, o.wrong), num = choices.every(c => /^−?[\d\s]+(?:,\d+)?(?:\smin)?$/.test(c)), hour = choices.every(c => /^\d{1,2}\sh(?:\s\d\d)?$/.test(c));
  return { kind, niveau: lv, q: o.q, answer, choices, hint: o.hint, explication: o.ex, num, clavier: num ? 'num' : hour ? 'heure' : '' };
}
const EXS = { total: 0, justes: 0, serie: 0, serie_max: 0, jour: '', aujourdhui: 0, justes_jour: 0, coupes: 0, coupe_jour: '', record_chrono: 0, trophees: [], par_type: {}, niveaux: {}, niveau: 2, montee: {} };
const EXR = { niveau: 2, auto: true, types: EXI.slice(), objectif: 5, propose: false };
const EX = { cur: null, run: null, last: null, ev: null, again: null, ended: -1e15, id: 100, recent: [] };
const exStop = user => { if (EX.cur) EX.ended = Date.now(); EX.cur = null; EX.run = null; if (user) EX.again = null; };   // user: « encore » is Claude's again
const exWantsAgain = () => !!EX.cur || (!!EX.again && Date.now() - EX.ended < 120000);
const exDay = () => { const d = new Date().toDateString(); if (EXS.jour !== d) Object.assign(EXS, { jour: d, aujourdhui: 0, justes_jour: 0 }); };
const exLevel = k => (EXR.auto ? EXS.niveaux[k] || EXS.niveau || EXR.niveau : EXR.niveau), exG = () => (EXR.auto ? EXS.niveau || EXR.niveau : EXR.niveau);
const exEvent = (kind, data = {}) => { EX.ev = { id: ((EX.ev && EX.ev.id) || 0) + 1, kind, t0: Date.now(), ...data }; };
function exNext() {
  const r = EX.run, ok = (r.pool || EXR.types).filter(k => EXL[k] && (EXMIN[k] || 1) <= exG()), last = (EX.cur || EX.last || {}).kind;
  const kind = r.kind || exPk(ok.length > 1 ? ok.filter(k => k !== last) : ok.length ? ok : EXI), lv = r.niveau || exLevel(kind);
  let ex; for (let i = 0; i < 8; i++) { ex = exGen(kind, lv, kind === 'table' ? r.table : null, r.ks ? r.ks[r.i % r.ks.length] : null); if (!EX.recent.includes(ex.q)) break; }
  EX.recent = [...EX.recent, ex.q].slice(-14);
  EX.cur = { ...ex, id: ++EX.id, mode: r.mode, t0: Date.now(), tries: 0, faux: [], hint_on: false, etat: 'question', i: r.i + 1, n: r.total, force: !!r.niveau, table: kind === 'table' ? r.table : null };
}
function exNouveau({ kind = null, niveau = null, mode = 'exo', n = null, table = null, source = null, pool = null } = {}) {
  mode = ['exo', 'serie', 'table', 'chrono'].includes(mode) ? mode : 'exo'; kind = EXL[kind] ? kind : null;
  table = table == null ? null : Math.max(2, Math.min(12, Math.trunc(num(table, 7))));
  if (mode === 'table') { kind = 'table'; table = table || exRi(2, 9); } else if (kind !== 'table') table = null;
  const lv = niveau == null ? null : Math.max(1, Math.min(5, Math.trunc(num(niveau, 2)))), total = mode === 'chrono' ? 0 : n ? Math.max(1, Math.min(20, Math.trunc(num(n, 5)))) : { exo: 1, serie: 5, table: 10 }[mode];
  EX.run = { mode, kind, pool: Array.isArray(pool) ? pool : null, table, niveau: lv, total, i: 0, bons: 0, ends_at: mode === 'chrono' ? Date.now() + 60000 : 0 };
  if (mode === 'table') EX.run.ks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].sort(() => Math.random() - 0.5);
  EX.again = { kind, niveau: lv, mode, n, table, pool: EX.run.pool };
  exDay(); exNext(); exEvent('propose', { mode, source: source || '' });
  S.anim = null; S.screen = 'visage';
}
function exAdapt(kind, ok, clean) {
  if (!EXR.auto || EX.cur.force) return false; let up = false;
  for (const key of [kind, '*']) {
    let lv = key === '*' ? exG() : exLevel(kind), n = EXS.montee[key] || 0;
    if (ok && clean) { if (++n >= 3) { if (lv < 5) { lv++; up = up || key === kind; } n = 0; } } else if (ok) n = 0; else { lv = Math.max(1, lv - 1); n = 0; }
    EXS.montee[key] = n; if (key === '*') EXS.niveau = lv; else EXS.niveaux[kind] = lv;
  }
  return up;
}
function exResolve(ok, value, first, passe = false) {
  const c = EX.cur, r = EX.run; exDay(); let up = false, ev = null;
  if (!passe) {
    EXS.total++; EXS.aujourdhui++; const pt = EXS.par_type[c.kind] || (EXS.par_type[c.kind] = { n: 0, ok: 0 }); pt.n++;
    if (ok) { EXS.justes++; EXS.justes_jour++; pt.ok++; }
    if (ok && first) { EXS.serie++; EXS.serie_max = Math.max(EXS.serie_max, EXS.serie); if ([5, 10, 15, 20, 30, 40, 50, 75, 100].includes(EXS.serie)) ev = ['serie', { n: EXS.serie }]; } else EXS.serie = 0;
    up = exAdapt(c.kind, ok, ok && first && !c.hint_on);
    if (EXS.aujourdhui >= EXR.objectif && EXS.coupe_jour !== EXS.jour) { EXS.coupe_jour = EXS.jour; EXS.coupes++; ev = ['objectif', { objectif: EXR.objectif }]; toast(`Objectif du jour atteint : ${EXR.objectif} exos !`, 5000); }
  } else EXS.serie = 0;
  if (ok && r) r.bons++;
  Object.assign(c, { etat: 'resultat', ok: !!ok, valeur: value, passe, monte: up });
  EX.last = { id: c.id, ok: !!ok, answer: c.answer, explication: c.explication, value, kind: c.kind, q: c.q, passe, t: Date.now(), monte: up };
  if (ev) exEvent(...ev); else if (c.mode !== 'chrono' && !passe) exEvent(ok ? 'juste' : 'faux', { essai: first ? 1 : 2, serie: EXS.serie });
  for (const [id, lab, cond] of EXTR) if (!EXS.trophees.includes(id) && cond(EXS)) { EXS.trophees.push(id); toast(`Trophée : ${lab} !`, 5000); }
  let wait = (c.mode === 'serie' || c.mode === 'table') && c.n > 1 ? (ok ? 2000 : 5000) : (ok ? 6000 : 11000);
  if ((c.mode === 'serie' || c.mode === 'table') && c.i >= c.n) wait = Math.max(wait, 3000);   // the last one: his cheer ends before the summary
  if (ev) wait = Math.max(wait, 5000);                                                           // a milestone: his celebration is not cut
  if (c.mode === 'chrono') exAdvance(); else c.next_at = Date.now() + wait;
}
function exAdvance() {
  const r = EX.run; if (!r) { exStop(); return; }
  r.i++;
  if (r.mode === 'chrono') return Date.now() >= r.ends_at ? exBilan() : exNext();
  if (r.i >= r.total) { if (r.total > 1) exBilan(); else exStop(); return; }
  exNext();
}
function exBilan() {
  const r = EX.run, chrono = r.mode === 'chrono', total = chrono ? r.i : r.total, rec = EXS.record_chrono, nw = chrono && r.bons > rec;
  if (nw) EXS.record_chrono = r.bons;
  EX.cur = { id: ++EX.id, mode: r.mode, kind: r.kind || '', type: r.mode === 'table' ? `Table de ${r.table}` : EXL[r.kind] || 'Mélange', etat: 'bilan', bons: r.bons, total, record: chrono ? Math.max(rec, r.bons) : 0, nouveau_record: !!nw, t0: Date.now(), next_at: Date.now() + 14000 };
  EX.run = null; exEvent('serie', { fin: true, bons: r.bons, total, chrono, record: !!nw });
}
function exPub() {
  const c = EX.cur; let cur = null;
  if (c && c.etat === 'bilan') cur = { ...c }, delete cur.next_at;
  else if (c) {
    cur = { id: c.id, kind: c.kind, mode: c.mode, q: c.q, choices: c.choices, num: c.num, clavier: c.clavier, t0: c.t0, tries: c.tries, faux: c.faux, niveau: c.niveau, i: c.i, n: c.n, etat: c.etat, table: c.table,
      type: c.table ? `Table de ${c.table}` : EXL[c.kind] };
    if (c.hint_on) cur.hint = c.hint;
    if (c.etat === 'resultat') Object.assign(cur, { ok: c.ok, answer: c.answer, explication: c.explication, valeur: c.valeur, passe: c.passe, monte: c.monte });
    if (EX.run && EX.run.mode === 'chrono') Object.assign(cur, { ends_at: EX.run.ends_at, left: Math.max(0, Math.ceil((EX.run.ends_at - Date.now()) / 1000)), bons: EX.run.bons });
  }
  const exPt = Object.fromEntries(Object.entries(EXS.par_type).map(([k, v]) => [k, [v.n, v.ok, exLevel(k)]]));
  S.exos = { cur, last: EX.last, ev: EX.ev, niveau: exG(), reglages: { ...EXR, types: EXR.types.slice() },
    stats: { total: EXS.total, justes: EXS.justes, serie: EXS.serie, serie_max: EXS.serie_max, aujourdhui: EXS.aujourdhui, justes_jour: EXS.justes_jour, objectif: EXR.objectif,
      coupes: EXS.coupes, fait: EXS.coupe_jour === EXS.jour, record_chrono: EXS.record_chrono, trophees: EXS.trophees.slice(), par_type: exPt },
    kinds: EXK.map(([id, label]) => ({ id, label })), trophees: EXTR.map(([id, label]) => ({ id, label })) };
}
function exAnswer(value, id = null) {                     // id: the exercise it answers; another one's (a double tap) is ignored
  const c = EX.cur, v = String(value ?? '').trim().slice(0, 40); if (!c || c.etat !== 'question' || !v || (id != null && String(id) !== String(c.id))) return;
  const ok = exSame(v, c.answer), pickd = c.choices.find(x => exSame(v, x)) || v;
  if (!ok && c.faux.some(f => exSame(v, f))) return;     // a wrong answer already given
  if (!ok && c.tries === 0 && c.mode !== 'chrono') { c.tries = 1; c.hint_on = true; c.faux.push(pickd); exEvent('faux', { essai: 1 }); return; }
  const first = c.tries === 0; if (!ok) c.faux.push(pickd); c.tries++;
  exResolve(ok, v, first);
}
function exSummary() {
  const pct = EXS.total ? Math.round(100 * EXS.justes / EXS.total) : 0;
  return `Aujourd'hui : ${EXS.aujourdhui} exo${EXS.aujourdhui > 1 ? 's' : ''} sur ${EXR.objectif} (${EXS.justes_jour} juste${EXS.justes_jour > 1 ? 's' : ''}). En tout : ${EXS.total}, ${pct} % de justes. Meilleure série : ${EXS.serie_max}. Record du défi chrono : ${EXS.record_chrono}.`;
}
Object.assign(A, {
  'exos.nouveau': a => { exNouveau(a); exPub(); },
  'exos.encore': () => { exNouveau(EX.again || {}); exPub(); },
  'exos.repondre': ({ value = '', id = null } = {}) => { exAnswer(value, id); exPub(); },
  'exos.indice': () => { if (EX.cur && EX.cur.etat === 'question') EX.cur.hint_on = true; exPub(); },
  'exos.passer': ({ id = null, etat = null } = {}) => {
    const c = EX.cur; if (!c || (id != null && String(id) !== String(c.id)) || (etat && etat !== c.etat)) return;   // a double tap does not skip the correction too
    if (c.etat === 'question') exResolve(false, '', false, true); else if (c.etat === 'resultat') exAdvance(); else exStop(); exPub();
  },
  'exos.stop': () => { exStop(true); exPub(); },
  'exos.reglages': ({ niveau = null, auto = null, types = null, objectif = null, propose = null } = {}) => {
    const lv = niveau == null ? 0 : Math.max(1, Math.min(5, Math.trunc(num(niveau, 2)))); if (lv && lv !== EXR.niveau) { EXR.niveau = lv; Object.assign(EXS, { niveau: lv, niveaux: {}, montee: {} }); }
    if (typeof auto === 'boolean') EXR.auto = auto; if (Array.isArray(types)) EXR.types = EXI.filter(k => types.includes(k)).length ? EXI.filter(k => types.includes(k)) : EXI.slice();
    if (objectif != null) EXR.objectif = Math.max(1, Math.min(50, Math.trunc(num(objectif, 5)))); if (typeof propose === 'boolean') EXR.propose = propose; exPub();
  },
  'lab.exos': ({ juste = true } = {}) => { const c = EX.cur; if (!c || c.etat !== 'question') return; exAnswer(juste ? c.answer : c.choices.find(x => !exSame(x, c.answer) && !c.faux.includes(x)) || 'x'); exPub(); },
});
const exCmd0 = A.cmd;                                      // the typed commands: pixel/exos.py command(), first (after the cast's « stop », as in commands.py)
A.cmd = ({ text }) => {
  const raw = String(text).slice(0, 2000).trim(), t = kw(raw).replace(/\s+/g, ' ').replace(/[ !?.]+$/, ''), c = EX.cur;
  if (S.cast && ['stop', 'arrete', 'arreter'].includes(t)) return exCmd0({ text });   // a cast over an exercise: « stop » ends the cast first
  const go = a => { A['exos.nouveau'](a); return true; };
  const done = (() => {
    let m;
    const num = /^(?:(?:la )?reponse(?: est)?|rep|=|c'est|c est)?\s*(−?-?(?:\d{1,3}(?: \d{3})+|\d+)(?:[.,]\d+)?(?:\s*h\s*\d{0,2})?)\s*(?:min|minutes|€|euros?|%|h)?$/.exec(t);
    if (c && c.etat !== 'question' && (num || /^(?:la )?reponse\b/.test(t))) {   // open, but waiting for no answer: not Claude's either
      toast(c.etat === 'resultat' && EX.run && c.i < c.n ? 'La question suivante arrive !' : 'Cet exo est fini. Tape « encore » pour un autre !', 3000); return true;
    }
    if (c && c.etat === 'question') {
      if ((m = num)) { A['exos.repondre']({ value: m[1], id: c.id }); return true; }
      if ((m = /^(?:la )?reponse(?: est)?\s*:?\s*(.+)$/.exec(t))) { A['exos.repondre']({ value: m[1], id: c.id }); return true; }
      if (c.choices.some(x => exSame(t, x)) && !/^[a-z]{1,2}$/.test(t)) { A['exos.repondre']({ value: t, id: c.id }); return true; }
      if (['indice', 'un indice', 'aide moi', 'je sais pas', 'je ne sais pas'].includes(t)) { A['exos.indice'](); return true; }
    }
    if (c && (['passe', 'je passe', 'passer', 'joker'].includes(t) || (c.etat !== 'question' && ['suivant', 'ok', 'la suite', 'continue'].includes(t)))) { A['exos.passer'](); return true; }
    if (c && ['stop', 'fini', 'arrete', 'on arrete'].includes(t) && !T.running) { A['exos.stop'](); return true; }
    if (/^(?:stop|arrete|arreter|fini|finis|termine)(?: les| l'| le)? ?(?:exo|exos|exercice|exercices|maths?)$/.test(t)) { A['exos.stop'](); return true; }
    if (['mes scores', 'scores', 'mon score', 'mes stats', 'mes resultats', 'mes trophees'].includes(t)) { exPub(); toast(exSummary(), 9000); return true; }
    if (['encore', 'encore un', 'encore une', 'un autre', 'une autre', 'on continue', 'on recommence'].includes(t) && exWantsAgain()) { A['exos.encore'](); return true; }
    if ((m = /^(?:revise |la |les )?tables? (?:de |du |des )?(\d{1,2})$/.exec(t)) && +m[1] >= 2 && +m[1] <= 12) return go({ mode: 'table', table: +m[1] });
    if (/^(?:un |le )?(?:defi chrono|defi|defi maths?|chrono maths?)$/.test(t)) return go({ mode: 'chrono' });
    if ((m = /^(?:une |la )?serie(?: de (\d{1,2}))?(?: (?:exos|exercices|questions|calculs))?$/.exec(t))) return go({ mode: 'serie', n: +(m[1] || 5) });
    if (/^(?:une |une petite )?question (?:de )?(?:maths?|calcul)$/.test(t)) return go({});
    if (/^(?:une |des )?(?:enigme|enigmes|devinette|devinettes)$/.test(t)) return go({ kind: 'enigme' });
    if (/^(?:un |des )?(?:petit )?calculs?$/.test(t)) return go({ pool: EXCALC });
    if ((m = /^(?:un |une |des |mon |un petit |une petite )?(?:exo|exos|exercice|exercices)(?: de maths?| maths?| de calcul)?(?: (facile|difficile|dur))?$/.exec(t))) {
      const lv = exG(); return go({ niveau: !m[1] ? null : m[1] === 'facile' ? Math.max(1, lv - 2) : Math.min(5, lv + 2) });
    }
    if ((m = /^(?:un |une |des )?(?:exo|exos|exercice|exercices) (?:de |d'|sur les |sur )?(.+?)$/.exec(t))) {
      const w = { additions: 'addition', soustractions: 'soustraction', multiplications: 'table', tables: 'table', divisions: 'division', fractions: 'fraction', pourcentages: 'pourcentage',
        carres: 'carre', enigmes: 'enigme', heures: 'heure', durees: 'heure', problemes: 'probleme', suites: 'suite', comparaisons: 'comparaison', doubles: 'double', moities: 'double',
        complements: 'complement', 'calcul mental': 'mental' }[m[1]] || (EXL[m[1]] ? m[1] : null);
      if (w) return go({ kind: w });
    }
    return false;
  })();
  if (!done) exCmd0({ text });
};
setInterval(() => {                                        // pixel/exos.py tick(): the result shown long enough, the challenge over, left alone
  const c = EX.cur, t = Date.now(); if (!c) return;
  if (S.cast && c.etat === 'question') c.hidden_at = t;   // under a cast (exos.py tick hidden): not left alone
  if (c.mode === 'chrono' && EX.run && t >= EX.run.ends_at && c.etat !== 'bilan') exBilan();
  else if (c.etat === 'resultat' && t >= c.next_at) exAdvance();
  else if (c.etat === 'bilan' && t >= c.next_at) exStop();
  else if (c.etat === 'question' && t - Math.max(c.t0, c.hidden_at || 0) > 8 * 60000) exStop();
  else return;
  exPub(); mark();
}, 250);
exPub();
/* ---------- end of the math exercises ---------- */

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
