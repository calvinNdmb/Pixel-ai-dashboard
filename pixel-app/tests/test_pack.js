// The user's animation pack inside Pixel OS, without a browser:  node tests/test_pack.js
// Runs the real web/pack52/*.js, themes.js and screens.js in a VM with a stub canvas and a fake clock, then:
// - every theme draws every animation at several moments, in both face modes (pack and vivant), with transitions;
// - the 15 moods map to the pack's animations, the idle is a weighted draw that never repeats, touch still works.
const fs = require('fs'), path = require('path'), vm = require('vm');
const WEB = path.join(__dirname, '..', 'web');
let fails = 0;
const check = (name, ok, info = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (!ok && info ? `  [${info}]` : '')); if (!ok) fails++; };

const stub = () => new Proxy(function () {}, {
  get: (t, k) => k === 'width' || k === 'height' ? 100 : k === Symbol.toPrimitive ? () => 0 : k === 'measureText' ? s => ({ width: String(s).length * 10 }) : k === 'data' ? new Uint8ClampedArray(96 * 54 * 4) : stub(),
  set: () => true, apply: () => stub(), construct: () => stub(),
});
const canvas = () => ({ width: 0, height: 0, getContext: () => stub(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 480 }), addEventListener() {}, style: {} });
let clock = 1000, pending = null;
const crt = canvas(); crt.width = 1600; crt.height = 960;
// a seeded Math.random, so the random draws (idle, taps) are the same on every run (SEED=n node tests/test_pack.js to try others)
let seed = Number(process.env.SEED) || 52;
const random = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const sb = {
  document: { createElement: canvas, getElementById: () => crt, activeElement: null },
  matchMedia: () => ({ matches: false }), performance: { now: () => clock }, requestAnimationFrame: cb => { pending = cb; },
  addEventListener() {}, devicePixelRatio: 1, DOMMatrix: function () {}, console, Math: Object.create(Math, { random: { value: random } }),
  Date, Uint8Array, Uint8ClampedArray, Object, JSON, Number, String, Array, Set, Map,
};
sb.window = sb; vm.createContext(sb);
for (const f of ['pack52/pixel52.js', 'pack52/pixel52-themes.js', 'themes.js', 'screens.js']) vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), sb, { filename: f });
const { Screens, P52 } = vm.runInContext('({ Screens, P52: window.Pixel52 })', sb);
const L = Screens.local, A = P52.animations, ids = A.map(a => a.id), idles = A.filter(a => a.group === 'Idle').map(a => a.id);
const themes = Object.keys(sb.PixelThemes({ X: stub(), RM: false, now: 0, blinkP: () => -1, txt() {}, wrap: () => [], fit: s => s }));
const moods = sb.PixelMoods.map(m => m.id);
check('the pack: 75 animations (its 52 and the 23 added in Pixel OS), 21 idles, the vector renderer is loaded', ids.length === 75 && idles.length === 21 && typeof sb.Pixel52Themes.draw === 'function');
check('the first 52 are the pack\'s own, in its order; the 23 added come after', ids[0] === 'content' && ids[51] === 'idle-impatient' && ids[52] === 'mange' && ids[74] === 'idle-bulle');
check('every frame says where the head is (what he wears follows it): the pixel engine and the vector one',
  ids.every(id => { const q = P52.frame(id, 0.7).pose; return q && [q.dx, q.dy, q.rot].every(Number.isFinite); })
  && ids.every(id => { sb.Pixel52Themes.draw(canvas(), id, 0.7, { theme: 'modern', transparent: true }); const q = sb.Pixel52Themes.draw.pose; return q && [q.dx, q.dy, q.rot].every(Number.isFinite); }));
check('the pack does not replace our PixelThemes', themes.length >= 6 && themes.includes('retro') && typeof sb.PixelThemes === 'function');

const snap = (o = {}) => ({
  screen: 'visage', mood: { name: 'neutre', until: 0 }, anim: null, toast: null, boot_at: 0, server_now: Date.now(),
  view: { theme: 'retro', face: 'pack', meteo_day: 0, units_f: false, agenda_day: 0, crt_off: false, osk: false },
  lights: { status: 'démo', rooms: [{ id: '0', name: 'Salon', on: true, bri: 80 }], scenes: ['Film'] },
  chat: { phase: 'idle', status: 'prêt', messages: [{ role: 'user', text: 'salut' }, { role: 'assistant', text: 'Salut !' }] },
  codex: { task: '', running: false, status: '', lines: [] }, weather: null, agenda: { status: 'ok', events: [] },
  timer: { mode: 'TRAVAIL', total: 1500, left: 1500, running: false, ends_at: 0, done: 0 },
  sys: { temp: 50, temps: [], cpus: [], ram_used: 1e9, ram_total: 4e9, bright: 1 },
  settings: { sleep_min: 10, qr: [], url: '', ip_url: '', claude: 'prêt', deck: 'Stream Deck MK.2 (15 touches)', demo: true }, ...o,
});
let errs = [];
const tick = (ms = 16) => { clock += ms; const cb = pending; pending = null; try { cb(clock); } catch (e) { errs.push(e.stack.split('\n').slice(0, 2).join(' ')); } };
let S = snap(); const set = o => { S = { ...S, ...o, server_now: Date.now() }; Screens.setState(S); };
Screens.start(); set({}); tick();

// ---- every theme x every animation x several moments x both face modes, with the transitions ----
for (const face of ['pack', 'vivant']) for (const th of themes) {
  errs = [];
  set({ view: { ...S.view, theme: th, face } }); L.scr = 'visage';
  for (const id of ids) { set({ anim: { id, t0: Date.now(), loops: 1, until: Date.now() + 60000 } }); for (const ms of [16, 120, 300, 900, 2600]) tick(ms); }
  set({ anim: null }); tick(); tick(300);
  for (const m of moods) { set({ mood: { name: m, until: 0 } }); tick(16); tick(200); tick(700); }
  set({ mood: { name: 'neutre', until: 0 } });
  for (const scr of ['claude', 'veille', 'reglages']) { L.scr = scr; for (const ph of ['think', 'answer', 'idle']) { set({ chat: { ...S.chat, phase: ph } }); tick(16); tick(400); } }
  L.scr = 'visage'; L.boot = clock; for (let e = 0; e < 3800; e += 250) tick(250);
  check(`${th}, face ${face}: 75 animations, 15 moods, Claude panel, veille, boot draw without an error`, errs.length === 0, errs.slice(0, 2).join(' | '));
}

// ---- pack mode: what the face plays ----
set({ view: { ...S.view, theme: 'moderne', face: 'pack' }, anim: null }); L.scr = 'visage'; L.local = null; L.pack = null; tick();
const MAP = { content: 'content', surpris: 'surpris', amoureux: 'amoureux', clin: 'clin-oeil', endormi: ['sommeil', 'reve'], reflechit: 'reflechit', ecoute: 'ecoute', triste: 'triste',
  fache: 'colere', confus: 'confus', excite: 'etoiles', fier: 'fier', malade: 'batterie-faible', baille: 'baille' };
const wrong = [];
for (const [m, want] of Object.entries(MAP)) { set({ mood: { name: m, until: 0 } }); tick(16); tick(16); if (![].concat(want).includes(L.packNow)) wrong.push(`${m}->${L.packNow}`); }
check('the 15 moods map to the pack (neutre is the idle)', wrong.length === 0, wrong.join(', '));
set({ mood: { name: 'neutre', until: 0 } }); tick();
set({ anim: { id: 'danse', t0: Date.now(), loops: 2, until: Date.now() + 8000 } }); tick(); const a1 = L.packNow;
set({ mood: { name: 'triste', until: 0 } }); tick(); const a2 = L.packNow;
set({ anim: null }); tick(); const a3 = L.packNow;
check('anim.play wins over the mood, then the mood comes back', a1 === 'danse' && a2 === 'danse' && a3 === 'triste', [a1, a2, a3].join(' '));
set({ mood: { name: 'neutre', until: 0 }, anim: { id: 'chante', t0: Date.now() - 9000, loops: 2, until: Date.now() - 1000 } }); tick(); tick();
check('an animation that is over goes back to the idle', idles.includes(L.packNow), L.packNow);

// the idle: a weighted draw over the 21 idles, one loop each, never the same twice in a row (two hours of idle)
const seen = []; let prev = L.packNow;
for (let t = 0; t < 7200000; t += 60) { tick(60); if (L.packNow !== prev) { seen.push(L.packNow); prev = L.packNow; } L.lastInput = clock; }
const counts = {}; for (const id of seen) counts[id] = (counts[id] || 0) + 1;
const repeats = seen.filter((id, i) => i && id === seen[i - 1]).length, onlyIdles = seen.every(id => idles.includes(id));
const heavy = ['content', 'idle-respire', 'idle-cligne', 'idle-regard'].reduce((s, id) => s + (counts[id] || 0), 0) / 4, light = ['baille', 'fatigue', 'zen', 'idle-luciole'].reduce((s, id) => s + (counts[id] || 0), 0) / 4;
check('the idle plays only idles, never the same one twice in a row', seen.length > 500 && onlyIdles && repeats === 0, `${seen.length} changes, ${repeats} repeats`);
check('the idle draw follows the weights (3 for the quiet ones, 1 for the others)', Object.keys(counts).length === 21 && heavy > 1.8 * light, `${heavy.toFixed(1)} vs ${light.toFixed(1)}`);

// touch: a tap makes him happy (or laugh), five taps make him angry, waking up plays the reveil
L.scr = 'visage'; tick(); let laughs = 0, happy = 0;
for (let i = 0; i < 40; i++) { clock += 4000; L.local = null; L.pack = null; tick(); Screens.hit(400, 236); tick(); if (L.packNow === 'rire') laughs++; if (L.packNow === 'content') happy++; }
check('a tap: content, sometimes a laugh', laughs > 3 && happy > 15 && laughs + happy === 40, `${happy} content, ${laughs} rire`);
clock += 5000; L.local = null; L.pack = null;
for (let i = 0; i < 5; i++) { tick(100); Screens.hit(400, 236); }
tick(); check('five quick taps: colere', L.packNow === 'colere', L.packNow);
clock += 4000; L.sleepy = true; tick(); const asleep = L.packNow; Screens.input(); tick();
check('asleep: sommeil (or reve); woken up: reveil', ['sommeil', 'reve'].includes(asleep) && L.packNow === 'reveil', asleep + ' -> ' + L.packNow);
// events: Codex, Claude, notifications
L.pack = null; L.local = null; clock += 6000; tick();
set({ codex: { ...S.codex, running: true } }); tick(); const c1 = L.packNow;
set({ codex: { ...S.codex, running: false, status: 'terminé en 7 s' }, mood: { name: 'content', until: Date.now() + 2500 }, toast: { id: 90, msg: 'CODEX : TERMINÉ', ms: 4000 } }); tick(); const c2 = L.packNow;
clock += 5000; set({ codex: { ...S.codex, running: true }, mood: { name: 'neutre', until: 0 } }); tick();
set({ codex: { ...S.codex, running: false, status: 'erreur (1)' }, toast: { id: 91, msg: 'CODEX : ERREUR (1)', ms: 4000 } }); tick(); const c3 = L.packNow;
clock += 5000; set({ chat: { ...S.chat, phase: 'answer' } }); tick(); const c4 = L.packNow; set({ chat: { ...S.chat, phase: 'idle' } });
clock += 1000; set({ toast: { id: 92, msg: 'Ton colis est arrivé !', ms: 4000 } }); tick(); const c5 = L.packNow;
check('events: Codex code / succes / erreur, Claude parle, notification', [c1, c2, c3, c4, c5].join() === 'code,succes,erreur,parle,notification', [c1, c2, c3, c4, c5].join());
clock += 5000; set({ toast: { id: 93, msg: 'THÈME NÉON', ms: 3000 } }); tick();
check('our own settings do not play the notification', L.packNow !== 'notification', L.packNow);
// vivant: the living face, but anim.play still shows the pack
set({ view: { ...S.view, face: 'vivant' }, anim: null }); L.packNow = null; tick();
const v1 = L.packNow; set({ anim: { id: 'bisou', t0: Date.now(), loops: 2, until: Date.now() + 8000 } }); tick(); const v2 = L.packNow;
check('face vivant: the living face, and anim.play still plays the pack', v1 === null && v2 === 'bisou', `${v1} ${v2}`);
console.log(`\n${fails} failure(s)`);
process.exit(fails ? 1 : 0);
