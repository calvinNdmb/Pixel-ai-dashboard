// Pixel's personality (web/persona.js) inside the real screens, without a browser:  node tests/test_persona.js
// Runs the pack, themes.js, persona.js and screens.js in a VM with a stub canvas, a fake frame clock and a fake wall clock, then:
// - the scene list matches pixel/scenes.py; every scene draws in every theme with both faces and ends back in place;
// - taps: calm, then annoyed, angry, sulking (taps keep him sulking), forgiving; petting calms him; zones of the face;
// - coming back: "te revoilà", "tu m'as manqué", "bonjour" / "bonsoir" by the hour, waking from his nap;
// - alone: moments of life only when nothing else needs his face, never the same twice in a row, rain only when it rains,
//   quiet ones at night; the lights going off and on; a scene asked by the server; the frame rate while he moves;
// - the agenda (10 min before, then after), the Pi too hot, the Wi-Fi gone and back; Christmas (the snow in December only,
//   the countdown, the hat in every theme, the greetings once a day), New Year; his voice (son.js, with a fake WebAudio).
const fs = require('fs'), path = require('path'), vm = require('vm');
const WEB = path.join(__dirname, '..', 'web');
let fails = 0;
const check = (name, ok, info = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (!ok && info ? `  [${info}]` : '')); if (!ok) fails++; };

const stub = () => new Proxy(function () {}, {
  get: (t, k) => k === 'width' || k === 'height' ? 100 : k === Symbol.toPrimitive ? () => 0 : k === 'measureText' ? s => ({ width: String(s).length * 10 }) : k === 'data' ? new Uint8ClampedArray(400 * 4) : stub(),
  set: () => true, apply: () => stub(), construct: () => stub(),
});
const canvas = () => ({ width: 0, height: 0, getContext: () => stub(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 480 }), addEventListener() {}, style: {} });
let clock = 1000, pending = null, wall = new Date('2026-11-08T14:00:00').getTime();
class FDate extends Date { constructor(...a) { super(...(a.length ? a : [wall])); } static now() { return wall; } }
const at = s => { wall = new Date(s).getTime(); };
const crt = canvas(); crt.width = 800; crt.height = 480;
let seed = Number(process.env.SEED) || 7;
const random = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const sb = {
  document: { createElement: canvas, getElementById: () => crt, activeElement: null },
  matchMedia: () => ({ matches: false }), performance: { now: () => clock }, requestAnimationFrame: cb => { pending = cb; },
  addEventListener() {}, devicePixelRatio: 1, DOMMatrix: function () {}, console, Math: Object.create(Math, { random: { value: random } }),
  Date: FDate, Uint8Array, Uint8ClampedArray, Object, JSON, Number, String, Array, Set, Map,
};
const sounds = [];                                  // his voice (son.js), as screens.js calls it
sb.PixelSon = { on: true, volume: 0.6, scene: id => sounds.push('scene:' + id), say: t => sounds.push('say:' + t), play: n => sounds.push('play:' + n), setVolume() {} };
sb.window = sb; vm.createContext(sb);
const PACKS = fs.readdirSync(path.join(WEB, 'scenes')).filter(f => f.endsWith('.js')).sort().map(f => 'scenes/' + f);   // the scene packs
for (const f of ['pack52/pixel52.js', 'pack52/pixel52-themes.js', 'themes.js', 'persona.js', ...PACKS, 'screens.js']) vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), sb, { filename: f });
const Screens = vm.runInContext('Screens', sb), L = Screens.local, PER = Screens.persona;
check('screens.js has a personality', !!PER && typeof PER.tap === 'function');

const snap = (o = {}) => ({
  screen: 'visage', mood: { name: 'neutre', until: 0 }, anim: null, scene: null, toast: null, boot_at: 0, server_now: wall,
  view: { theme: 'retro', face: 'pack', meteo_day: 0, units_f: false, agenda_day: 0, crt_off: false, osk: false },
  lights: { status: 'démo', rooms: [{ id: '0', name: 'Salon', on: true, bri: 80 }], scenes: ['Film'] },
  chat: { phase: 'idle', status: 'prêt', messages: [] }, codex: { task: '', running: false, status: '', lines: [] },
  weather: { city: 'Paris', now: { t: 11, kind: 'nuage', label: 'Nuageux' }, days: [] }, agenda: { status: 'ok', events: [] },
  timer: { mode: 'TRAVAIL', total: 1500, left: 1500, running: false, ends_at: 0, done: 0 },
  sys: { temp: 50, temps: [], cpus: [], ram_used: 1e9, ram_total: 4e9, bright: 1 },
  settings: { sleep_min: 10, qr: [], url: '', ip_url: '', claude: 'prêt', deck: '', demo: true }, ...o,
});
let errs = [];
const tick = (ms = 16) => { clock += ms; wall += ms; const cb = pending; pending = null; try { cb(clock); } catch (e) { errs.push(e.stack.split('\n').slice(0, 2).join(' ')); } };
const run = (ms, step = 50) => { for (let e = 0; e < ms; e += step) tick(step); };
let S = snap(); const set = o => { S = { ...S, ...o, server_now: wall }; Screens.setState(S); };
Screens.start(); set({}); tick(); tick();
const cur = () => PER.state.cur, group = id => (PER.scenes.find(s => s.id === id) || {}).group;
const tapAt = (x, y) => { if (!Screens.input()) Screens.hit(x, y); tick(16); };
const fresh = () => { PER.reset(); L.sleepy = false; L.lastInput = clock; tick(16); };

// ---- the list matches pixel/scenes.py ----
const { execFileSync } = require('child_process');   // pixel/scenes.py reads the scenes from the JS files: the same list?
const pyList = JSON.parse(execFileSync('python3', ['-c', 'import json,sys; sys.path.insert(0, "."); from pixel import scenes; print(json.dumps(scenes.SCENES))'],
  { cwd: path.join(__dirname, '..') }).toString()).map(x => x.join('|')).sort();
const jsList = PER.scenes.map(s => [s.id, s.label, s.group].join('|')).sort();
check(`persona.js + scene packs and pixel/scenes.py list the same ${jsList.length} scenes (id, label, group)`, JSON.stringify(pyList) === JSON.stringify(jsList),
  jsList.filter(x => !pyList.includes(x)).concat(pyList.filter(x => !jsList.includes(x))).slice(0, 4).join(' / '));
check('at least 20 moments of life and 30 reactions', PER.scenes.filter(s => s.group === 'vie').length >= 20 && PER.scenes.filter(s => s.group !== 'vie').length >= 30);

// ---- every scene, every theme, both faces: draws, and he is back in place at the end ----
const themes = Object.keys(sb.PixelThemes({ X: stub(), RM: false, now: 0, blinkP: () => -1, txt() {}, wrap: () => [], fit: s => s }));
let offEnd = [];
for (const face of ['pack', 'vivant']) for (const th of themes) {
  errs = []; set({ view: { ...S.view, theme: th, face } }); L.scr = 'visage';
  for (const s of PER.scenes) {
    fresh(); PER.play(s.id);
    for (let e = 0; e < s.dur - 60; e += Math.max(90, Math.round(s.dur / 23))) tick(Math.max(90, Math.round(s.dur / 23)));
    const m = PER.current().m, r = ((m.r % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    if (face === 'pack' && th === 'retro' && (Math.abs(m.x) > 20 || Math.abs(m.y) > 20 || Math.abs(m.s - 1) > 0.08 || Math.abs(r) > 0.12)) offEnd.push(`${s.id} ${JSON.stringify(m)}`);
    run(400, 100);
  }
  check(`${th}, face ${face}: the ${PER.scenes.length} scenes draw without an error`, errs.length === 0, errs.slice(0, 2).join(' | '));
}
check('every scene ends with Pixel back in his place', offEnd.length === 0, offEnd.slice(0, 3).join(' | '));
set({ view: { ...S.view, theme: 'retro', face: 'pack' } });
at('2026-11-08T14:00:00');                          // the sweep above moved the wall clock by hours (more packs, more hours): the day again

// ---- the zones of his face ----
const B = { x: 64, y: 50, w: 672, h: 378 }, M = { x: 0, y: 0, s: 1, r: 0, f: false, sx: 1, sy: 1 }, P2 = (u, v) => PER.project(B, M, u, v);
const z = (u, v) => PER.zoneOf(PER.unproject(B, M, P2(u, v)));
check('zones: eyes, top of the head, mouth, sides, next to him', z(34, 23) === 'oeil' && z(66, 23) === 'oeil' && z(48, 8) === 'tete' && z(48, 38) === 'bouche' && z(14, 30) === 'cote' && z(82, 30) === 'cote' && z(2, 30) === 'ailleurs' && z(48, 27) === 'visage',
  [z(34, 23), z(48, 8), z(48, 38), z(14, 30), z(2, 30), z(48, 27)].join());
const moved = { x: 120, y: -40, s: 0.5, r: 0.4, f: true, sx: 1, sy: 1 }, back = PER.unproject(B, moved, PER.project(B, moved, 30, 20));
check('project and unproject agree when he has moved, shrunk, turned and flipped', Math.abs(back.u - 30) < 0.01 && Math.abs(back.v - 20) < 0.01, JSON.stringify(back));

// ---- taps: calm, annoyed, angry, sulking, forgiving ----
L.scr = 'visage'; fresh();
tapAt(400, 240);
check('one tap: a calm reaction', group(cur()) === 'tap', cur());
run(4000);
const seenGroups = []; for (let i = 0; i < 4; i++) { tapAt(400 + i * 7, 240); seenGroups.push(group(cur())); run(300); }
check('a few taps in a row: he gets annoyed', seenGroups.includes('fache'), seenGroups.join());
for (let i = 0; i < 8; i++) { tapAt(400, 240); run(300); }
check('ten taps in a row: he sulks', cur() === 'boude', cur());
tapAt(400, 240); run(300);
check('a tap while he sulks: still sulking (he answers without looking)', cur() === 'boude', cur());
run(32000, 250);
check('the sulk ends: he forgives', cur() === 'pardon' || (PER.state.annoy < 1 && group(cur()) !== 'fache'), cur());
run(6000); run(60000, 500);
check('after a minute without taps he is calm again', PER.state.annoy < 1.2, PER.state.annoy.toFixed(2));
tapAt(400, 240);
check('…and the next tap is a calm one again', group(cur()) === 'tap', cur());

// ---- petting ----
fresh(); PER.pet(); check('petting: a cuddle', [...PER.pools.pet, 'ronron'].includes(cur()), cur());
fresh(); for (let i = 0; i < 4; i++) { tapAt(400, 240); run(250); } PER.pet();
check('petting him when he is annoyed calms him down', cur() === 'calme', cur());
fresh(); for (let i = 0; i < 11; i++) { tapAt(400, 240); run(250); }
const sulking = cur(); PER.pet(); PER.pet();
check('two cuddles end a sulk', sulking === 'boude' && cur() === 'pardon', `${sulking} -> ${cur()}`);

// ---- zones through the screen ----
fresh(); run(3000); const zoneHits = {};
for (const [name, u, v] of [['oeil', 34, 23], ['bouche', 48, 38], ['tete', 48, 8], ['cote', 14, 30]]) {
  let got = 0; for (let i = 0; i < 6; i++) { fresh(); run(1500); const p = P2(u, v); tapAt(p.x, p.y); if (PER.pools.zones[name].includes(cur())) got++; }
  zoneHits[name] = got;
}
check('a tap on an eye, the mouth, the head, a side gets its own reaction (most of the time)', Object.values(zoneHits).every(n => n >= 3), JSON.stringify(zoneHits));

// ---- coming back ----
const back2 = (when, ms, wake) => { fresh(); at(when); PER.away(ms); if (wake) { L.sleepy = true; Screens.input(); } else Screens.input(); tick(16); return cur(); };
check('back after 30 min: "te revoilà"', back2('2026-11-08T14:00:00', 30 * 60e3) === 'retour');
check('back after 2 h 30 in the afternoon: "tu m\'as manqué"', back2('2026-11-08T14:00:00', 2.5 * 3600e3) === 'manque');
check('back in the morning after the night: "bonjour"', back2('2026-11-08T08:30:00', 9 * 3600e3) === 'bonjour');
check('back in the evening after the day: "bonsoir"', back2('2026-11-08T19:00:00', 7 * 3600e3) === 'bonsoir');
check('woken from his nap after 12 min: "je dormais pas !"', back2('2026-11-08T14:00:00', 12 * 60e3, true) === 'reveille');
check('back after 5 min: nothing special', back2('2026-11-08T14:00:00', 5 * 60e3) === '');
fresh(); at('2026-11-08T14:00:00'); PER.away(3 * 3600e3); tapAt(400, 240); const first = cur(); tapAt(400, 240);
check('the tap that brings you back does not cut his hello short', first === 'manque' && cur() === 'manque', `${first} ${cur()}`);

// ---- alone: moments of life ----
const life = (o = {}, n = 40) => {
  fresh(); PER.setEvery(1000, 2000); set(o.state || {}); at(o.at || '2026-11-08T15:10:00'); L.lastInput = clock - 200000; L.sleepy = false;
  const out = []; let last = '';
  for (let i = 0; i < n * 70 && out.length < n; i++) { tick(250); L.lastInput = Math.min(L.lastInput, clock - 100000); const c = cur(); if (c && c !== last) out.push(c); last = c || ''; if (i % 40 === 39) at(o.at || '2026-11-08T15:10:00'); }
  PER.setEvery(45000, 150000); set({ weather: snap().weather, mood: { name: 'neutre', until: 0 } });
  return out;
};
const day = life({ state: { weather: { city: 'Paris', now: { t: 11, kind: 'nuage' }, days: [] } } });
const rep5 = day.some((id, i) => day.slice(Math.max(0, i - 5), i).includes(id));
check(`left alone he lives his life (${new Set(day).size} different moments in ${day.length})`, day.length >= 30 && day.every(id => group(id) === 'vie') && new Set(day).size >= 15, day.slice(0, 8).join());
check('never the same moment within five', !rep5, day.join());
check('no rain scene when it does not rain, no meal scene outside meal times', !day.includes('pluie') && !day.includes('faim'));
const wet = life({ state: { weather: { city: 'Paris', now: { t: 9, kind: 'pluie' }, days: [] } } }, 25);
check('when it rains, he can be sad under his cloud', wet.includes('pluie'), wet.join());
const night = life({ at: '2026-11-08T23:40:00' }, 20);
check('at night only the quiet moments', night.length > 0 && night.every(id => PER.quiet.includes(id)), night.join());
const busy = life({ state: { mood: { name: 'triste', until: 0 } } }, 5);
check('no moment of life while he shows a mood', busy.length === 0, busy.join());
fresh(); PER.setEvery(1000, 2000); L.scr = 'meteo'; L.lastInput = clock - 200000; run(8000, 250); const other = cur(); L.scr = 'visage'; PER.setEvery(45000, 150000);
check('no moment of life on another screen', !other, other);
fresh(); PER.setEvery(1000, 2000); L.lastInput = clock - 200000; for (let i = 0; i < 120 && !cur(); i++) tick(250); const going = cur();   // wait for one to start
PER.setLife(false); tick(16); const stopped = cur(); PER.setLife(true); PER.setEvery(45000, 150000);
check('"Moments de vie" off: they stop', !!going && !stopped, `${going} ${stopped}`);

// ---- the lights, the server, the frame rate ----
fresh(); set({ lights: { ...S.lights, rooms: [{ id: '0', name: 'Salon', on: true, bri: 80 }] } }); tick(16); tick(16);
set({ lights: { ...S.lights, rooms: [{ id: '0', name: 'Salon', on: false, bri: 80 }] } }); tick(16); tick(16);
const dark = cur(); run(6000);
set({ lights: { ...S.lights, rooms: [{ id: '0', name: 'Salon', on: true, bri: 80 }] } }); tick(16); tick(16);
check('the lights go off: "il fait tout noir !"; they come back: "ah, la lumière !"', dark === 'noir' && cur() === 'lumiere', `${dark} ${cur()}`);
fresh(); set({ scene: { id: 'toupie', t0: wall } }); tick(16);
check('a scene asked by the server ("fais la toupie") plays on the face', cur() === 'toupie', cur());
run(300); check('while he moves the screen draws at 60 frames a second', L.fpsWant === 60, L.fpsWant);
PER.stop(); L.lastInput = clock - 10000; L.inputAt = -1e9; tick(16); run(300); const calm = L.fpsWant;
check('when he is still again the frame rate goes back down', calm < 60, calm);

// ---- the agenda ----
const ev = (s, e, title) => ({ day: 0, start: s, end: e, title, allday: false, cal: 'x', color: '#fff' });
at('2026-11-08T13:50:10'); fresh(); set({ agenda: { status: 'ok', events: [ev(14, 15, 'Réunion d’équipe')] } }); tick(16); tick(16);
const rdv = cur(); run(1200); const rdv1 = PER.state.say; run(2400); const rdv2 = PER.state.say;
check('10 min before a meeting he taps his watch: "Hé ! Dans 10 min…", "…Réunion d’équipe !"', rdv === 'rdv' && rdv1 === 'Hé ! Dans 10 min…' && rdv2 === '…Réunion d’équipe !', `${rdv} ${rdv1} ${rdv2}`);
PER.stop(); run(2000);
check('…only once for that meeting', cur() !== 'rdv', cur());
at('2026-11-08T15:05:00'); fresh(); run(200);                 // no new state: the still screen draws only every ~50 ms
check('a few minutes after it, he asks how it went', cur() === 'rdv-fin', cur());
set({ agenda: { status: 'ok', events: [] } }); at('2026-11-08T14:20:00');   // not on the hour: no cuckoo

// ---- the Pi: too hot, the Wi-Fi ----
fresh(); set({ sys: { ...S.sys, temp: 72 } }); tick(16); tick(16);
const hot = cur(); run(1500); const hotSaid = PER.state.say;
check('the Pi at 72 °C: "Pfiou, 72 °C… j’ai chaud !"', hot === 'chaud' && hotSaid === 'Pfiou, 72 °C… j’ai chaud !', `${hot} ${hotSaid}`);
PER.stop(); run(2000);
check('…not again a moment later', cur() !== 'chaud', cur());
set({ sys: { ...S.sys, temp: 60 } }); tick(16); set({ sys: { ...S.sys, temp: 71 } }); tick(16); tick(16);
check('…but again once the Pi has cooled down and heats up again', cur() === 'chaud', cur());
PER.stop(); set({ sys: { ...S.sys, temp: 50 } });
fresh(); set({ sys: { ...S.sys, wifi: null } }); tick(16); tick(16); set({ sys: { ...S.sys, wifi: -55 } }); tick(16); tick(16);
check('the Wi-Fi seen for the first time: nothing to say', !cur(), cur());
set({ sys: { ...S.sys, wifi: null } }); tick(16); tick(16); const lost = cur(); run(6000);
set({ sys: { ...S.sys, wifi: -52 } }); tick(16); tick(16);
check('the Wi-Fi drops: "le Wi-Fi est parti !"; it comes back: "il est revenu !"', lost === 'wifi' && cur() === 'wifi-ok', `${lost} ${cur()}`);
{ const { wifi, ...sys0 } = S.sys; set({ sys: sys0 }); } PER.stop();

// ---- Christmas, New Year ----
const dec = life({ at: '2026-12-10T15:10:00' }, 30);
check('in December he can watch the snow fall', dec.includes('neige'), dec.join());
check('no snow in November', !day.includes('neige'), day.join());
at('2026-12-08T10:00:00'); fresh(); PER.play('neige'); run(3200);
check('"Plus que 17 dodos avant Noël !" on 8 December', PER.state.say === 'Plus que 17 dodos avant Noël !', PER.state.say);
PER.stop(); at('2026-12-10T15:00:00'); fresh();
check('his Santa hat all December', PER.state.hat === true);
errs = [];
for (const th of themes) for (const face of ['pack', 'vivant']) { set({ view: { ...S.view, theme: th, face } }); run(300, 100); PER.play('neige'); run(600, 100); PER.stop(); }
check('the hat and the snow draw in every theme, with both faces', errs.length === 0, errs.slice(0, 2).join(' | '));
set({ view: { ...S.view, theme: 'retro', face: 'pack' } }); at('2026-11-08T14:20:00'); tick(16);
check('…and no hat in November', PER.state.hat === false);
fresh(); at('2026-12-25T09:00:00'); PER.away(9 * 3600e3); Screens.input(); tick(16); const x1 = cur(); run(6000);
at('2026-12-25T11:00:00'); PER.away(40 * 60e3); Screens.input(); tick(16); const x2 = cur();
check('back on Christmas morning: "Joyeux Noël !", only for the first hello of the day', x1 === 'joyeux-noel' && x2 === 'retour', `${x1} ${x2}`);
check('back on New Year’s Day: "Bonne année !"', back2('2027-01-01T10:00:00', 10 * 3600e3) === 'bonne-annee');
at('2026-11-08T14:20:00');

// ---- the little Pixel of the Minuteur screen ----
errs = []; L.scr = 'minuteur'; const acts = new Set(), xs = new Set();
for (const th of themes) { set({ view: { ...S.view, theme: th } }); for (let i = 0; i < 50; i++) { run(500, 100); acts.add(Screens.buddy.act); xs.add(Math.round(Screens.buddy.x)); } }
check(`Minuteur: the little Pixel draws in every theme and lives his life (${[...acts].join(', ')})`, errs.length === 0 && acts.has('walk') && acts.has('idle') && xs.size > 5, errs.slice(0, 2).join(' | '));
set({ view: { ...S.view, theme: 'retro' } });
for (let i = 0; i < 200 && (Screens.buddy.act === 'away' || Screens.buddy.x > 755); i++) run(100, 100);   // wait until he is in view
const bx = Screens.buddy.x; run(100, 100); Screens.hit(Screens.buddy.x, 440); run(100, 100);
check('touch him: he jumps, surprised', Screens.buddy.act === 'surpris', `${bx} ${Screens.buddy.act}`);
set({ timer: { ...S.timer, running: false, left: 0, ends_at: 0 } }); run(300, 100);
check('time is up: he jumps for joy', Screens.buddy.act === 'cheer', Screens.buddy.act);
set({ timer: snap().timer }); L.scr = 'visage'; run(200, 100);

// ---- his voice (son.js) ----
check('screens.js gives his voice the scenes and the lines he says', sounds.includes('scene:joyeux-noel') && sounds.includes('scene:rdv') && sounds.some(s => s.startsWith('say:Hé ! Dans')), sounds.slice(-3).join());
const made = [], param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
class FakeAC {
  constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; }
  createGain() { return { gain: param(), connect: x => x }; }
  createOscillator() { const o = { type: '', frequency: param(), connect: x => x, start() { made.push(o.type); }, stop() {} }; return o; }
  createBuffer(c, len) { return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { return { connect: x => x, start() { made.push('noise'); } }; }
}
const sv = { location: { search: '?kiosk=1' }, AudioContext: FakeAC, addEventListener() {}, localStorage: { getItem: () => null, setItem() {} }, Math, Float32Array, Object, String, Number, Array };
sv.window = sv; vm.createContext(sv); vm.runInContext(fs.readFileSync(path.join(WEB, 'son.js'), 'utf8'), sv, { filename: 'son.js' });
const Son = vm.runInContext('PixelSon', sv);
made.length = 0; Son.scene('neige'); const bells = made.length;
const mute = ['coucou', 'chatouilles', 'colere', 'boude', 'caresse', 'poisson', 'atchoum', 'heure', 'rdv', 'chaud', 'wifi', 'joyeux-noel'].filter(id => { made.length = 0; Son.scene(id); return !made.length; });
made.length = 0; Son.say('Coucou, ça va ?'); const babble = made.length;
Son.setVolume(0); made.length = 0; Son.scene('poisson'); const off = made.length;
check(`his voice: Jingle Bells for the snow (${bells} notes), a sound for each kind of scene, a babble when he speaks, silence at 0 %`,
  bells === 11 && mute.length === 0 && babble >= 2 && off === 0, `${bells} [${mute}] ${babble} ${off}`);
const sp = { location: { search: '' }, AudioContext: FakeAC, addEventListener() {}, localStorage: { getItem: () => null, setItem() {} }, Math, Float32Array, Object, String, Number, Array };
sp.window = sp; vm.createContext(sp); vm.runInContext(fs.readFileSync(path.join(WEB, 'son.js'), 'utf8'), sp, { filename: 'son.js' });
made.length = 0; vm.runInContext('PixelSon', sp).scene('poisson');
check('no sound on a phone (only the Pi’s own screen plays it)', made.length === 0 && !vm.runInContext('PixelSon', sp).on);

// ---- scene packs and events ----
const EV = PER.events.map(e => e.id), groups = ['tap', 'fache', 'calin', 'retour', 'vie', 'evt'];
const badOn = PER.scenes.filter(s => (s.on || []).some(e => !EV.includes(e)));
check('every scene\'s "on" names a known event', badOn.length === 0, badOn.map(s => s.id).join());
check('every scene is in a known group', PER.scenes.every(s => groups.includes(s.group)), PER.scenes.filter(s => !groups.includes(s.group)).map(s => s.id).join());
check('scene ids are unique', new Set(PER.scenes.map(s => s.id)).size === PER.scenes.length);
for (const e of PER.events.filter(e => e.scenes.length)) {
  fresh(); L.scr = 'visage'; tick(16);
  const id = Screens.event(e.id, { msg: 'Nouveau message de Léa', name: 'lights.set', kind: 'pluie' });
  check(`event ${e.id}: a scene answers it (${e.scenes.length} can)`, !!id && e.scenes.includes(id), String(id));
}
fresh(); L.scr = 'meteo'; const later = PER.events.find(e => e.scenes.length);
if (later) { Screens.event(later.id, { msg: 'x', name: 'lights.set', kind: 'pluie' }); const none = cur(); L.scr = 'visage'; run(300); check('an event on another screen waits, and plays when you come back to his face', !none && !!cur(), `${none} ${cur()}`); }

console.log(`\n${fails} failure(s)`);
process.exit(fails ? 1 : 0);
