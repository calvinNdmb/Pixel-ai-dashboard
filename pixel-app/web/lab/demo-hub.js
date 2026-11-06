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
const THEMES = discoverThemes().map(t => ({ id: t.id, name: String(t.name || t.id), c: t.c && typeof t.c === 'object' ? t.c : null, font: typeof t.font === 'function' ? t.font : null, crt: typeof t.crt === 'boolean' ? t.crt : undefined }));
const TNAME = Object.fromEntries(THEMES.map(t => [t.id, t.name]));
const MOODS = (Array.isArray(window.PixelMoods) ? window.PixelMoods : []).filter(m => m && typeof m.id === 'string')
  .map(m => ({ id: m.id, name: String(m.name || m.id), desc: String(m.desc || '') }));
if (!MOODS.some(m => m.id === 'neutre')) MOODS.unshift({ id: 'neutre', name: 'Neutre', desc: '' });
const MNAME = Object.fromEntries(MOODS.map(m => [m.id, m.name]));

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
  view: { meteo_day: 0, units_f: false, agenda_day: 0, crt_off: false, osk: false, theme: TNAME.retro ? 'retro' : THEMES[0].id },
  lights: { status: 'démo', rooms: ROOMS.map(([name, on, bri], i) => ({ id: String(i), name, on, bri })), scenes: Object.keys(SCENES) },
  chat: { phase: 'idle', status: 'démo (pas de clé API)', messages: [] },
  codex: { task: '', running: false, status: 'Tape : codex <ta tâche>', lines: [] },
  weather: demoWeather(),
  agenda: demoAgenda(),
  timer: { mode: 'TRAVAIL', total: 1500, left: 1500, running: false, ends_at: 0, done: 2 },
  sys: { temps: [], cpus: [], bright: 1, hw_bright: false, host: 'pixel', temp: 46, cpu: 8, ram_used: 1.2e9, ram_total: 4.1e9, wifi: -52, uptime: 3 * 86400 + 4 * 3600, disk: 24, ip: '192.168.1.42' },
  settings: { url: 'http://pixel.local:8080/?t=demo', ip_url: 'http://192.168.1.42:8080/?t=demo', qr: QR, demo: true, sleep_min: 10, claude: 'démo (pas de clé API)', deck: 'Stream Deck MK.2 (15 touches)' },
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
    case 'visage': return fill5(MOODS.filter(m => m.id !== 'neutre').slice(0, 5).map(m => { const ms = MOOD_MS[m.id] ?? 3000; return K(keyLabel(m.name), 'mood.set', ms ? { name: m.id, ms } : { name: m.id }); }));
    case 'lumieres': return fill5([K('Tout\nallumer', 'lights.set', { room: '*', on: true }), K('Tout\néteindre', 'lights.set', { room: '*', on: false }), ...S.lights.scenes.slice(0, 3).map(n => K(n.slice(0, 9), 'lights.scene', { name: n }))]);
    case 'claude': return [K('Clavier', 'view.toggle', { key: 'osk' }), K('Météo ?', 'chat.send', { text: "Quel temps fait-il aujourd'hui ?" }), K('Agenda ?', 'chat.send', { text: "Qu'est-ce que j'ai aujourd'hui ?" }), K('Blague', 'chat.send', { text: 'Raconte-moi une blague courte.' }), K('Effacer', 'chat.clear')];
    case 'codex': return [K('Clavier', 'view.toggle', { key: 'osk' }), K('Relancer', 'codex.run'), K('Stop', 'codex.stop'), K('Effacer', 'codex.clear'), null];
    case 'meteo': return [K("Aujour-\nd'hui", 'view.set', { key: 'meteo_day', value: 0 }), K('Jour −', 'view.step', { key: 'meteo_day', d: -1, hi: 4 }), K('Jour +', 'view.step', { key: 'meteo_day', d: 1, hi: 4 }), K('°C / °F', 'view.toggle', { key: 'units_f' }), K('Annoncer', 'weather.say')];
    case 'minuteur': return [K(t.running ? 'Pause' : 'Démarrer', 'timer.toggle'), K('+5 min', 'timer.add', { minutes: 5 }), K('Remettre\nà zéro', 'timer.reset'), K('Pause\ncafé', 'timer.start', { minutes: 5, mode: 'PAUSE CAFÉ' }), K('25 min', 'timer.start', { minutes: 25 })];
    case 'agenda': return [K("Aujour-\nd'hui", 'view.set', { key: 'agenda_day', value: 0 }), K('Demain', 'view.set', { key: 'agenda_day', value: 1 }), K('Actua-\nliser', 'agenda.refresh'), null, K('Demander\nà Claude', 'chat.ask', { text: "Qu'est-ce que j'ai aujourd'hui et demain ?" })];
    case 'systeme': return [K('Lumi. −', 'sys.bright', { d: -0.1 }), K('Lumi. +', 'sys.bright', { d: 0.1 }), K('Effet\nCRT', 'view.toggle', { key: 'crt_off' }), K('Démar-\nrage', 'sys.boot'), K('Veille', 'screen.show', { screen: 'veille' })];
    case 'reglages': {
      const head = [K('Associer\nHue', 'lights.pair'), K('Clavier', 'view.toggle', { key: 'osk' })];
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
  'theme.set': ({ name }) => { if (!TNAME[name]) return; S.view.theme = name; toast('THÈME ' + TNAME[name].toUpperCase()); },
  'screen.show': ({ screen }) => { if (!NAV.includes(screen)) return; if (S.screen === 'veille' && screen !== 'veille') mood('surpris', 900); S.screen = screen; },
  'mood.set': ({ name, ms = 0 }) => mood(String(name), Math.trunc(num(ms, 0))),
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

/* ---------- typed commands (port of pixel/commands.py; themes and moods come from the live lists) ---------- */
const HELP = "salon 40 · allume bureau · éteins tout · scène film · minuteur 10 · pause · thème manga · codex <tâche> · météo, agenda… (nom d'un écran) · humeur content · sinon : Claude";
const SCREEN_WORDS = { ...Object.fromEntries(NAV.map(i => [norm(NAMES[i]), i])), lumiere: 'lumieres', lampes: 'lumieres', timer: 'minuteur', meteo: 'meteo', systeme: 'systeme', visage: 'visage' };
const THEME_WORDS = {}, MOOD_WORDS = {};
THEMES.forEach(t => { THEME_WORDS[kw(t.id)] = t.id; THEME_WORDS[kw(t.name)] ??= t.id; });
for (const [w, id] of [['actuel', 'moderne'], ['anime', 'manga']]) if (TNAME[id]) THEME_WORDS[w] ??= id;     // commands.py extras
MOODS.forEach(m => { MOOD_WORDS[kw(m.id)] = m.id; MOOD_WORDS[kw(m.name)] ??= m.id; });
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
  if ((m = kw(raw).match(/^(?:theme|style)\s+(.+)$/)) && THEME_WORDS[m[1]]) return A['theme.set']({ name: THEME_WORDS[m[1]] });
  if ((m = kw(raw).match(/^humeur\s+(.+)$/)) && MOOD_WORDS[m[1]]) { const id = MOOD_WORDS[m[1]]; A['screen.show']({ screen: 'visage' }); return A['mood.set']({ name: id, ms: id === 'endormi' ? 0 : 3000 }); }
  if (SCREEN_WORDS[t]) return A['screen.show']({ screen: SCREEN_WORDS[t] });
  A['chat.ask']({ text: raw });
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

return {
  NAV, NAMES, THEMES, MOODS, KINDS, S, norm, row3, snapshot,
  themeName: id => TNAME[id] || id, moodName: id => MNAME[id] || id,
  busy: () => ({ chat: chatBusy, codex: S.codex.running }),
  /* Initial values, before the first listener (no toast): the lab restores the last theme and screen. */
  configure({ theme, screen, sleep_min } = {}) { if (TNAME[theme]) S.view.theme = theme; if (NAV.includes(screen)) S.screen = screen; if (Number(sleep_min) > 0) S.settings.sleep_min = Number(sleep_min); },
  dispatch(action, args = {}) {
    const f = A[action];
    if (!f) { console.warn('Pixel Lab: unknown action', action); return; }
    try { f(args && typeof args === 'object' ? args : {}); } catch (e) { console.warn('Pixel Lab: action failed', action, e); toast('ERREUR : ' + action); }
    mark();
  },
  listen(fn) { listeners.push(fn); fn(snapshot()); },
};
})();
