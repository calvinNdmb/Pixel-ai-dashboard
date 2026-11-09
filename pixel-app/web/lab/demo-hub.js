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
  settings: { url: 'http://pixel.local:8080/?t=demo', ip_url: 'http://192.168.1.42:8080/?t=demo', qr: QR, demo: true, sleep_min: 10, claude: 'démo (pas de clé API)', deck: 'Stream Deck MK.2 (15 touches)', themes: THEMES.map(t => t.id) },
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

/* ---------- actions: same names and arguments as the real server ---------- */
const A = {
  'theme.set': ({ name }) => {
    if (!TNAME[name]) { if (ALLNAME[name]) toast(THEMES.length < 2 ? `Pour le moment, seul le thème ${THEMES[0].name} est activé.` : `Ce thème n'est pas activé. Les thèmes : ${THEMES.map(t => t.name).join(', ')}.`, 5000); return; }
    S.view.theme = name; toast('THÈME ' + TNAME[name].toUpperCase());
  },
  'screen.show': ({ screen }) => { if (!NAV.includes(screen)) return; if (S.screen === 'veille' && screen !== 'veille') mood('surpris', 900); S.screen = screen; },
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

  /* lab-only actions */
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
const HELP = "salon 40 · allume bureau · éteins tout · scène film · minuteur 10 · pause · thème manga · codex <tâche> · météo, agenda… (nom d'un écran) · humeur content · anim danse · animations · fais le poisson · scènes · visage vivant · caractère câlin · sinon : Claude";
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
  A['chat.ask']({ text: raw });
}

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
  if (T.running && tleft() <= 0) { Object.assign(T, { left: 0, running: false }); if (T.mode === 'TRAVAIL') T.done++; toast('MINUTEUR : TERMINÉ !', 5000); mood('surpris', 2500); }
}, 250);
setInterval(() => {
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
  const trait = k => { const t = S.caractere && S.caractere.traits, v = t && t[k]; return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 50; };
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
  /* the commands (pixel/nourrir.py command()), before the rest of command() */
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
  const cmd0 = A.cmd; A.cmd = a => { if (!command(String((a && a.text) || '').slice(0, 2000))) cmd0(a); };
  setInterval(() => { const v = Math.round(N.ventre), f = level(N.ventre); tick(); if (Math.round(N.ventre) !== v || level(N.ventre) !== f) { publish(); mark(); } }, 60000);
  publish();
  return { N, tick, publish, find, roll };
})();

return {
  NAV, NAMES, THEMES, ALLT, MOODS, KINDS, ANIMS, AGROUPS, FACES, PSCENES, S, norm, row3, snapshot, findScene,
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
};
})();
