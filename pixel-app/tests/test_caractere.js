// Pixel's character on the screens:  node tests/test_caractere.js [--shots DIR]
//   CARACTERE_PORT=8164 (the demo server), CARACTERE_STRICT=1 (the comparison with the Pixel before him counts, see below),
//   CARACTERE_BASE=<commit> (that Pixel: by default 36422fd, main just before Pixel OS perso was merged in)
// 1. In a VM, the real screens.js + persona.js + every scene pack + caractere.js (a stub canvas, seeded random, fake clocks):
//    - at 50 everywhere the Pixel of every day, byte for byte: the same scenes and lines, for the same random seed, as the same
//      code with no "caractere" in the snapshot, and as the same code without caractere.js and its pack at all; every affinity
//      exactly 1, every knob exactly its old value. Also compared with persona.js and screens.js before the feature (git 36422fd,
//      with that commit's packs; the feature was written on d1451d5, but main had moved on when it came in): a note only, unless CARACTERE_STRICT=1, since later features may change his default behaviour;
//    - statistically, over many seeded trials: a grumpy Pixel gets angry and sulks more (and longer), a patient one less;
//      a cuddly one answers cuddles warmly, an independent one shrugs them off; a chatterbox speaks more, a quiet one less, and
//      « Il parle » off: no chit-chat, but reminders and news still show; a lively one lives more often (and faster), a lazy one
//      less; a blasé one lets the world's news go by, but whatever you do to him or for him (the timer, his twin, feeding him,
//      an exercise...) always gets an answer, whatever his character;
//      the quiet hours, « Il peut bouder » off, his name and your nickname in his lines, the mood of the day;
//    - his reaction to each change (event 'caractere'), « Essayer » (a scene typical of him), the scenes only a character brings.
// 2. In Chromium (Playwright), a demo server (port 8164, a temporary data folder, every theme on): the phone's « Caractère » panel
//    (presets, sliders, names, switches, quiet hours, « Essayer », « Réinitialiser » in two touches), the Pi's screen (?kiosk=1)
//    taking the new character at once, the Pixel de poche with the same traits, and Pixel Lab's « Caractère » panel.
// --shots DIR: screenshots of the panel and of his reactions, in several themes.
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), net = require('net');
const { execFileSync, spawn } = require('child_process');
const APP = path.join(__dirname, '..'), WEB = path.join(APP, 'web');
const SHOTS = (i => (i >= 0 ? process.argv[i + 1] : null))(process.argv.indexOf('--shots'));
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (name, ok, info = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (!ok && info ? `  [${info}]` : '')); if (!ok) fails++; };
const read = f => fs.readFileSync(path.join(WEB, f), 'utf8');

/* ---------- a Pixel in a VM (as tests/test_persona.js does) ---------- */
const stub = () => new Proxy(function () {}, {
  get: (t, k) => k === 'width' || k === 'height' ? 100 : k === Symbol.toPrimitive ? () => 0 : k === 'measureText' ? s => ({ width: String(s).length * 10 }) : k === 'data' ? new Uint8ClampedArray(400 * 4) : stub(),
  set: () => true, apply: () => stub(), construct: () => stub(),
});
const canvas = () => ({ width: 0, height: 0, getContext: () => stub(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 480 }), addEventListener() {}, style: {} });
const OWN_PACK = 'scenes/caractere.js';
const PACKS = fs.readdirSync(path.join(WEB, 'scenes')).filter(f => f.endsWith('.js')).sort().map(f => 'scenes/' + f);
function world(files, seed = 7, at = '2026-11-08T14:00:00') {
  let clock = 1000, pending = null, wall = new Date(at).getTime(), s = seed;
  class FDate extends Date { constructor(...a) { super(...(a.length ? a : [wall])); } static now() { return wall; } }
  const random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const crt = canvas(); crt.width = 800; crt.height = 480;
  const said = [], warned = [];
  const sb = {
    document: { createElement: canvas, getElementById: () => crt, activeElement: null }, matchMedia: () => ({ matches: false }), performance: { now: () => clock },
    requestAnimationFrame: cb => { pending = cb; }, addEventListener() {}, devicePixelRatio: 1, DOMMatrix: function () {},
    console: { ...console, warn: (...a) => warned.push(a.join(' ')) }, Math: Object.create(Math, { random: { value: random } }), Date: FDate,
    Uint8Array, Uint8ClampedArray, Object, JSON, Number, String, Array, Set, Map,
  };
  sb.PixelSon = { on: true, volume: 0.6, scene() {}, say: t => said.push(t), play() {}, setVolume() {} };
  sb.window = sb; vm.createContext(sb);
  for (const [f, code] of files) vm.runInContext(code, sb, { filename: f });
  const Screens = vm.runInContext('Screens', sb), L = Screens.local, PER = Screens.persona, errs = [];
  const snap0 = {
    screen: 'visage', mood: { name: 'neutre', until: 0 }, anim: null, scene: null, toast: null, boot_at: 0, server_now: wall,
    view: { theme: 'retro', face: 'pack', meteo_day: 0, units_f: false, agenda_day: 0, crt_off: false, osk: false },
    lights: { status: 'démo', rooms: [{ id: '0', name: 'Salon', on: true, bri: 80 }], scenes: ['Film'] },
    chat: { phase: 'idle', status: 'prêt', messages: [] }, codex: { task: '', running: false, status: '', lines: [] },
    weather: { city: 'Paris', now: { t: 11, kind: 'nuage', label: 'Nuageux' }, days: [] }, agenda: { status: 'ok', events: [] },
    timer: { mode: 'TRAVAIL', total: 1500, left: 1500, running: false, ends_at: 0, done: 0 },
    sys: { temp: 50, temps: [], cpus: [], ram_used: 1e9, ram_total: 4e9, bright: 1 },
    settings: { sleep_min: 10, qr: [], url: '', ip_url: '', claude: 'prêt', deck: '', demo: true },
  };
  let S = { ...snap0 };
  const W = {
    sb, Screens, L, PER, said, warned, errs, CAR: sb.PixelCaractere,
    clock: () => clock, wall: () => wall, at: t => { wall = new Date(t).getTime(); },
    tick(ms = 16) { clock += ms; wall += ms; const cb = pending; pending = null; try { cb(clock); } catch (e) { errs.push(e.stack.split('\n').slice(0, 2).join(' ')); } },
    run(ms, step = 50) { for (let e = 0; e < ms; e += step) W.tick(step); },
    set(o) { S = { ...S, ...o, server_now: wall }; Screens.setState(S); },
    get snap() { return S; },
    tapAt(x, y) { if (!Screens.input()) Screens.hit(x, y); W.tick(16); },
    fresh() { PER.reset(); L.sleepy = false; L.lastInput = clock; W.tick(16); },
    cur: () => PER.state.cur, group: id => (PER.scenes.find(x => x.id === id) || {}).group,
  };
  Screens.start(); W.set({}); W.tick(); W.tick();
  return W;
}
const base = ['pack52/pixel52.js', 'pack52/pixel52-themes.js', 'themes.js'].map(f => [f, read(f)]);
const NEW = (extra = []) => world([...base, ['persona.js', read('persona.js')], ...PACKS.map(f => [f, read(f)]), ['caractere.js', read('caractere.js')], ['screens.js', read('screens.js')], ...extra]);
const T50 = { calin: 50, grognon: 50, bavard: 50, farceur: 50, energique: 50, curieux: 50, gourmand: 50, studieux: 50 };
const car = (o = {}) => ({ preset: 'perso', nom: 'Pixel', surnom: '', humeur_jour: false, calme: { de: 23, a: 6 }, boude: true, parle: true, change: null, essai: 0, ...o, traits: { ...T50, ...(o.traits || {}) } });

/* ---------- 1. at 50: the old Pixel, byte for byte ---------- */
function scenario(W) {                                // taps, cuddles, a long time alone, the world's events, coming back
  const log = [], rec = tag => log.push(`${tag} ${W.cur()} « ${W.PER.state.say} »`);
  for (let i = 0; i < 36; i++) { W.tapAt(170 + (i * 67) % 460, 110 + (i * 53) % 270); W.run(120 + (i * 137) % 1100, 40); rec('tap'); }
  W.run(40000, 250); rec('calm');
  for (let i = 0; i < 10; i++) { W.PER.pet(); W.run(500, 50); rec('pet'); }
  W.fresh(); W.PER.setEvery(1000, 3000); W.L.lastInput = W.clock() - 200000;
  for (let i = 0; i < 700; i++) { W.tick(250); W.L.lastInput = Math.min(W.L.lastInput, W.clock() - 100000); if (i % 6 === 0) rec('life'); }
  W.PER.setEvery(45000, 150000);
  for (const e of ['notif', 'timer-done', 'codex-ok', 'codex-fail', 'weather', 'lights-change', 'action', 'typing']) { W.fresh(); W.Screens.event(e, { msg: 'Colis', kind: 'pluie', name: 'lights.set' }); W.run(900, 50); rec(e); }
  W.fresh(); W.PER.away(30 * 60e3); W.Screens.input(); W.run(600); rec('back');
  W.fresh(); W.PER.away(3 * 3600e3); W.Screens.input(); W.run(2600); rec('missed');
  return log;
}
const STRICT = process.env.CARACTERE_STRICT === '1', BEFORE = process.env.CARACTERE_BASE || '36422fd';
let oldFiles = null;
try {
  const git = (...a) => execFileSync('git', a, { cwd: APP, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  const packs = git('ls-tree', '--name-only', BEFORE, 'web/scenes/').split('\n').filter(f => f.endsWith('.js')).sort();
  oldFiles = { persona: git('show', `${BEFORE}:pixel-app/web/persona.js`), screens: git('show', `${BEFORE}:pixel-app/web/screens.js`),
    packs: packs.map(f => [`${f} (${BEFORE})`, git('show', `${BEFORE}:pixel-app/${f}`)]) };
} catch { oldFiles = null; }
{
  const W1 = NEW();
  W1.set({ caractere: car({ preset: 'pixel' }) });
  const ck = W1.PER.caractere, ids = W1.PER.scenes.map(s => s.id), gated = ids.filter(id => W1.PER.weight(id) === 0);
  check('at 50 everywhere: every affinity is exactly 1 (so every weight is the old one), and the scenes only a character brings weigh 0',
    ids.filter(id => !id.startsWith('caractere-') || !gated.includes(id)).every(id => W1.PER.affinity(id) === 1) && gated.length >= 10 && gated.every(id => id.startsWith('caractere-')),
    ids.filter(id => W1.PER.affinity(id) !== 1 && W1.PER.affinity(id) !== 0).slice(0, 4).join());
  check('at 50 everywhere: every knob is exactly its old value', Object.values(ck.k).every(v => v === 1 || v === 0) && ck.k.sulk === 0 && ck.k.deaf === 0 && !ck.on && ck.parle && ck.boude && !ck.jour);
  const others = PACKS.filter(f => f !== OWN_PACK).map(f => [f, read(f)]);
  const nowWorld = (withCar, seed = 11) => world([...base, ['persona.js', read('persona.js')], ...others, ...(withCar ? [[OWN_PACK, read(OWN_PACK)], ['caractere.js', read('caractere.js')]] : []), ['screens.js', read('screens.js')]], seed);
  const AT50 = nowWorld(true); AT50.set({ caractere: car({ preset: 'pixel' }) });
  const a50 = scenario(AT50), bare = scenario(nowWorld(true)), none = nowWorld(false), aNone = scenario(none), diff = (x, y) => x.findIndex((v, i) => v !== y[i]);
  check(`at 50 everywhere: the very same ${a50.length} moments and lines as with no "caractere" in the snapshot (an old server), same seed`,
    a50.length === bare.length && diff(a50, bare) < 0 && AT50.errs.length === 0, diff(a50, bare) >= 0 ? `${a50[diff(a50, bare)]}  !=  ${bare[diff(a50, bare)]}` : AT50.errs.slice(0, 2).join(' | '));
  check('…and as without caractere.js and its scene pack at all', a50.length === aNone.length && diff(a50, aNone) < 0 && none.errs.length === 0,
    diff(a50, aNone) >= 0 ? `${a50[diff(a50, aNone)]}  !=  ${aNone[diff(a50, aNone)]}` : none.errs.slice(0, 2).join(' | '));
  check('…and none of the scenes only a character brings', !a50.some(x => /caractere-/.test(x)), a50.filter(x => /caractere-/.test(x)).slice(0, 3).join());
  if (oldFiles) {                                   // the Pixel before his character: BEFORE's persona.js, screens.js and packs
    let a = null, b = null, errs = [];
    try {
      const OLD = world([...base, [`persona.js (${BEFORE})`, oldFiles.persona], ...oldFiles.packs, [`screens.js (${BEFORE})`, oldFiles.screens]], 11);
      const NOW = world([...base, ['persona.js', read('persona.js')], ...oldFiles.packs, [OWN_PACK, read(OWN_PACK)], ['caractere.js', read('caractere.js')], ['screens.js', read('screens.js')]], 11);
      NOW.set({ caractere: car({ preset: 'pixel' }) });
      a = scenario(OLD); b = scenario(NOW); errs = OLD.errs.concat(NOW.errs);
    } catch (e) { errs.push(String(e && e.message || e)); }
    const same = a && b && a.length === b.length && diff(a, b) < 0 && !errs.length;
    const what = `at 50 everywhere: the same ${a ? a.length : '?'} moments and lines as the Pixel before his character (git ${BEFORE} and its packs)`;
    const why = !a || !b ? errs.slice(0, 2).join(' | ') : diff(a, b) >= 0 ? `${a[diff(a, b)]}  !=  ${b[diff(a, b)]}` : errs.slice(0, 2).join(' | ');
    if (STRICT || same) check(what, same, why);
    else console.log(`NOTE ${what}: differs (${why}). Expected if a later feature changed his default behaviour; CARACTERE_STRICT=1 makes it count.`);
  } else console.log(`SKIP the comparison with git ${BEFORE} (git or that commit is not here)`);
}

/* ---------- 2. statistics: each trait does what it says ---------- */
const W = NEW();
const setT = (traits, o = {}) => { W.PER.setTraits(car({ traits, ...o })); };
const prof = (id, t) => (W.PER.profile(id)[t] || 0);
const pickR = (() => { let s = 99; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; })();
function pester(traits, trials = 50) {             // bouts of taps on his face, at random places and paces
  setT(traits); let fache = 0, taps = 0, sulks = 0;
  for (let t = 0; t < trials; t++) {
    W.fresh(); W.run(3000, 250); let sulked = false;
    for (let i = 0; i < 6; i++) { W.tapAt(300 + pickR() * 200, 170 + pickR() * 140); taps++; const c = W.cur(); if (W.group(c) === 'fache') fache++; if (c === 'boude') sulked = true; W.run(300 + pickR() * 1000, 50); }
    if (sulked) sulks++;
    W.PER.stop();
  }
  return { fache: fache / taps, sulks: sulks / trials };
}
function sulkLength(traits) {                       // ten quick taps: how long does he sulk?
  setT(traits); W.fresh(); W.run(2000, 250);
  for (let i = 0; i < 12 && W.cur() !== 'boude'; i++) { W.tapAt(400, 240); W.run(200, 50); }
  const t0 = W.clock(); while (W.cur() === 'boude' && W.clock() - t0 < 90000) W.run(500, 250);
  return W.clock() - t0;
}
{
  const zen = pester({ grognon: 5 }), mid = pester({}), grr = pester({ grognon: 92 });
  check(`a grumpy Pixel gets angry more: ${Math.round(grr.fache * 100)} % of the taps vs ${Math.round(mid.fache * 100)} % (and a patient one ${Math.round(zen.fache * 100)} %)`,
    grr.fache > mid.fache + 0.08 && mid.fache > zen.fache + 0.08, JSON.stringify({ zen, mid, grr }));
  check(`…and sulks more often: ${Math.round(grr.sulks * 100)} % of the bouts of six taps vs ${Math.round(mid.sulks * 100)} % (patient: ${Math.round(zen.sulks * 100)} %)`, grr.sulks > mid.sulks + 0.2 && mid.sulks >= zen.sulks && grr.sulks > 0.6, JSON.stringify({ zen, mid, grr }));
  const lz = sulkLength({ grognon: 5 }), lm = sulkLength({}), lg = sulkLength({ grognon: 92 });
  check(`…and longer: a sulk of ${Math.round(lg / 1000)} s vs ${Math.round(lm / 1000)} s (patient: ${Math.round(lz / 1000)} s)`, lg > lm + 8000 && lm > lz + 6000 && Math.abs(lm - 26000) < 2000, `${lz} ${lm} ${lg}`);
  setT({}, { boude: false }); W.fresh(); const seen = new Set();
  for (let i = 0; i < 16; i++) { W.tapAt(400, 240); seen.add(W.cur()); W.run(200, 50); }
  check('« Il peut bouder » off: pestered, he gets angry but never sulks', !seen.has('boude') && [...seen].some(id => W.group(id) === 'fache'), [...seen].join());
}
function cuddles(traits, trials = 80) {            // two cuddles, then a tap: is it a loving answer (calin > 0)? and the cuddles: shrugged off?
  setT(traits); let warm = 0, shrug = 0, pets = 0;
  for (let t = 0; t < trials; t++) {
    W.fresh(); W.run(2500, 250);
    for (let i = 0; i < 2; i++) { W.PER.pet(); pets++; if (W.cur() === 'caractere-pas-trop') shrug++; W.run(1200, 100); }
    W.run(3000, 250); W.tapAt(400, 240); if (prof(W.cur(), 'calin') > 0) warm++;
    W.PER.stop();
  }
  return { warm: warm / trials, shrug: shrug / pets };
}
{
  const ind = cuddles({ calin: 10 }), mid = cuddles({}), cal = cuddles({ calin: 92 });
  check(`a cuddly Pixel gets loving faster: after two cuddles, a tap gets a loving answer ${Math.round(cal.warm * 100)} % of the time vs ${Math.round(mid.warm * 100)} % (independent: ${Math.round(ind.warm * 100)} %)`,
    cal.warm > mid.warm + 0.25 && mid.warm > ind.warm, JSON.stringify({ ind, mid, cal }));
  check(`an independent one shrugs a cuddle off (« Ça va, ça va… ») ${Math.round(ind.shrug * 100)} % of the time, the others never`, ind.shrug > 0.15 && mid.shrug === 0 && cal.shrug === 0, JSON.stringify({ ind, mid, cal }));
  setT({ calin: 92 }); W.fresh(); const seen = new Set(); for (let i = 0; i < 60; i++) { W.PER.pet(); seen.add(W.cur()); W.run(1500, 250); }
  check('…and a cuddly one sometimes gives a big hug (« Gros câlin ! »)', seen.has('caractere-gros-calin'), [...seen].join());
}
function bubbles(traits, o = {}) {                  // how many lines he says through his moments of life
  setT(traits, o); W.said.length = 0; const life = W.PER.scenes.filter(s => s.group === 'vie' && !s.id.startsWith('caractere-'));
  for (let r = 0; r < 3; r++) for (const s of life) { W.fresh(); W.PER.play(s.id); W.run(s.dur + 120, 120); }
  return W.said.length;
}
{
  const quiet = bubbles({ bavard: 5 }), mid = bubbles({}), chatty = bubbles({ bavard: 95 }), mute = bubbles({}, { parle: false });
  check(`a chatterbox says more (${chatty} lines), a quiet one much less (${quiet}), than the usual Pixel (${mid})`, chatty > mid * 1.05 && quiet < mid * 0.5, `${quiet} ${mid} ${chatty}`);
  check('« Il parle » off: not a single bubble of chit-chat', mute === 0, String(mute));
  const heard = [];
  W.said.length = 0; W.fresh(); W.PER.event('caractere', { kind: 'reglage', quoi: 'reglage', what: 'parle', value: false }, { visage: true, force: true }); W.run(1500, 100); heard.push(W.PER.state.say);
  W.fresh(); W.PER.play('rdv'); W.run(3200, 100); heard.push(W.PER.state.say);
  W.fresh(); W.Screens.event('notif', { msg: 'Un colis' }); W.run(2600, 100); const nsay = W.PER.state.say; heard.push(nsay);
  check(`…but he still says what you need: « ${heard[0]} », the reminder « ${heard[1]} », the news « ${heard[2]} »`,
    heard[0] === 'Chut… je me tais.' && /Dentiste|rendez-vous/.test(heard[1]) && !!nsay && W.said.length >= 3, JSON.stringify(heard));
  setT({});
}
function lives(traits, minutes = 24) {               // left alone: how many moments of life?
  setT(traits); W.fresh(); W.PER.setEvery(45000, 150000); W.L.lastInput = W.clock() - 200000; let n = 0, last = '';
  for (let i = 0; i < minutes * 60 * 2; i++) { W.tick(500); W.L.lastInput = Math.min(W.L.lastInput, W.clock() - 100000); const c = W.cur(); if (c && c !== last && W.group(c) === 'vie') n++; last = c || ''; }
  return n;
}
{
  W.at('2026-11-08T15:00:00');
  const lazy = lives({ energique: 8 }), mid = lives({}), pile = lives({ energique: 95 });
  check(`a lively Pixel lives his life more often (${pile} moments in 24 min) than the usual one (${mid}), a lazy one less (${lazy})`, pile > mid && mid > lazy, `${lazy} ${mid} ${pile}`);
  setT({ energique: 8 }); W.fresh(); W.PER.setEvery(1000, 2000); W.L.lastInput = W.clock() - 200000; const lifeSeen = new Set();
  for (let i = 0; i < 2400; i++) { W.tick(250); W.L.lastInput = Math.min(W.L.lastInput, W.clock() - 100000); if (W.cur()) lifeSeen.add(W.cur()); }
  check('…and a lazy one sometimes just lies down (« Trop la flemme »)', lifeSeen.has('caractere-flemme'), [...lifeSeen].join());
  setT({ energique: 95 }); W.fresh(); W.PER.setEvery(1000, 2000); W.L.lastInput = W.clock() - 200000; let t0 = 0, id = '', took = 0;
  for (let i = 0; i < 4000 && !took; i++) { W.tick(50); W.L.lastInput = Math.min(W.L.lastInput, W.clock() - 100000); const c = W.cur(); if (c && !id && W.group(c) === 'vie') { id = c; t0 = W.clock(); } else if (id && c !== id) took = W.clock() - t0; }
  const dur = (W.PER.scenes.find(s => s.id === id) || {}).dur;
  check(`…and moves faster: ${id} played in ${took} ms instead of ${dur}`, took > 0 && took < dur * 0.92 && took > dur * 0.8, `${id} ${took} ${dur}`);
  W.PER.setEvery(45000, 150000);
}
function reacts(traits, n = 30) {                   // the world's events: how many does he answer?
  setT(traits); W.fresh(); let k = 0;
  for (let i = 0; i < n; i++) { W.run(6000, 250); if (W.Screens.event('notif', { msg: 'Un colis' })) k++; }
  W.PER.stop(); return k / n;
}
{
  const blase = reacts({ curieux: 5 }), mid = reacts({}), cur = reacts({ curieux: 95 });
  check(`a blasé Pixel lets the world go by: he answers ${Math.round(blase * 100)} % of the notifications, the usual one ${Math.round(mid * 100)} %, a curious one ${Math.round(cur * 100)} %`,
    mid === 1 && cur === 1 && blase < 0.6 && blase > 0.15, `${blase} ${mid} ${cur}`);
}
{                                                   // what you do to him or for him: always answered, whatever his character
  const STANDIN = `(window.PixelScenePacks ||= []).push(({ S, L }) => {   // stand-ins for the feeding and exercises packs
    S('nourrir-test-miam', 'Test miam', 'evt', { dur: 3000, on: ['nourrir-mange'], anim: [[0, 'content']], mood: 'content', say: [[100, 2000, L('Miam !')]] });
    S('exo-test-bravo', 'Test bravo', 'evt', { dur: 3000, on: ['exo-juste'], anim: [[0, 'fier']], mood: 'fier', say: [[100, 2000, L('Bravo !')]] });
  });`;
  const U = world([...base, ['persona.js', read('persona.js')], ...PACKS.map(f => [f, read(f)]), ['stand-in packs', STANDIN], ['caractere.js', read('caractere.js')], ['screens.js', read('screens.js')]], 5);
  const USER = [['timer-done', {}], ['timer-start', {}], ['jumeau-tape', { ici: 'pi' }], ['jumeau-caresse', { ici: 'pi' }], ['poche-allume', {}], ['nourrir-mange', {}], ['exo-juste', {}]];
  const live = USER.filter(([e, d]) => { U.fresh(); return U.PER.event(e, d, { visage: true }); });
  const chars = [...U.CAR.PRESETS.filter(p => p.traits).map(p => [p.name, p.traits]), ...[1, 2, 3, 4, 5, 6].map(i => [`Surprise ${i}`, U.CAR.roll(() => ((i * 7919 + 13) % 1000) / 1000)]),
    ['curieux 0', { curieux: 0 }], ['curieux 0, énergique 0, grognon 100', { curieux: 0, energique: 0, grognon: 100 }]];
  const missed = [];
  for (const [name, traits] of chars) {
    U.PER.setTraits(car({ traits }));
    for (const [e, d] of live) for (let r = 0; r < 4; r++) {
      U.fresh(); const first = U.PER.event(e, d, { visage: true }); U.run(5000, 250); const again = U.PER.event(e, d, { visage: true });   // and again 5 s later
      if (!first || !again) missed.push(`${name}: ${e}${first ? ' (the second)' : ''}`);
      U.PER.stop();
    }
  }
  check(`what you do to him (${live.map(x => x[0]).join(', ')}) gets an answer every time, for all ${chars.length} characters, the second one 5 s later too`,
    live.length === USER.length && missed.length === 0 && U.errs.length === 0, `${live.length}/${USER.length} ` + missed.slice(0, 4).join(' | ') + U.errs.slice(0, 1).join());
}
{
  const nightLife = (calme, at) => { setT({}, { calme }); W.fresh(); W.PER.setEvery(1000, 2000); W.at(at); W.L.lastInput = W.clock() - 200000; const out = [];
    for (let i = 0; i < 1600 && out.length < 12; i++) { W.tick(250); W.L.lastInput = Math.min(W.L.lastInput, W.clock() - 100000); const c = W.cur(); if (c && out[out.length - 1] !== c) out.push(c); if (i % 40 === 39) W.at(at); }
    W.PER.setEvery(45000, 150000); return out; };
  const usual = nightLife({ de: 23, a: 6 }, '2026-11-08T22:00:00'), early = nightLife({ de: 21, a: 8 }, '2026-11-08T22:00:00'), morning = nightLife({ de: 21, a: 8 }, '2026-11-09T07:00:00');
  check('quiet hours from 21 h to 8 h: at 22 h and at 7 h only the quiet moments; with the usual 23 h–6 h, 22 h is still the day',
    early.length > 3 && early.every(id => W.PER.quiet.includes(id)) && morning.every(id => W.PER.quiet.includes(id)) && usual.some(id => !W.PER.quiet.includes(id)), `${early.join()} | ${usual.join()}`);
  W.at('2026-11-08T14:00:00');
}
{
  setT({}, { nom: 'Bip', surnom: 'Max' }); W.fresh(); W.PER.away(30 * 60e3); W.Screens.input(); W.run(1200);
  const hello = W.PER.state.say;
  check(`your nickname in his greetings: « ${hello} »`, W.cur() === 'retour' && /, Max [!?]|, Max$/.test(hello), hello);
  const lines = new Set(); for (let i = 0; i < 30; i++) { W.fresh(); W.PER.play('caractere-pixel'); W.run(2000, 100); lines.add(W.PER.state.say); }
  check('his name where he says « Pixel »: « Le bon vieux Bip ! »', lines.has('Le bon vieux Bip !') && ![...lines].some(l => /Pixel/.test(l)), [...lines].join(' / '));
  W.fresh(); W.PER.play('poche-salue'); const tw = new Set(); for (let i = 0; i < 20; i++) { W.fresh(); W.PER.play('poche-salue'); W.run(1500, 100); tw.add(W.PER.state.say); }
  check('…in the other packs\' lines too', ![...tw].some(l => /Pixel/.test(l)) && [...tw].some(l => /Bip/.test(l)), [...tw].join(' / '));
  setT({}, { humeur_jour: true }); const t = W.PER.traits, exp = W.CAR.today({ traits: T50, humeur_jour: true }, new W.sb.Date());
  check('the mood of the day: his traits drift a little, the same as caractere.js and caractere.py compute', JSON.stringify(t) === JSON.stringify(exp) && Object.values(t).some(v => v !== 50) && Object.values(t).every(v => Math.abs(v - 50) <= 10), JSON.stringify(t));
}
{
  const typ = (traits, n = 300) => { setT(traits); let g = 0; for (let i = 0; i < n; i++) if (prof(W.PER.typical(), 'grognon') > 0) g++; return g / n; };
  const mid = typ({}), grr = typ({ grognon: 92 });
  check(`« Essayer »: a typical scene of his character (grumpy ones ${Math.round(grr * 100)} % of the time when grumpy, ${Math.round(mid * 100)} % at 50)`, grr > 0.55 && mid < 0.4, `${mid} ${grr}`);
  setT({ grognon: 92 }); W.fresh(); const calm = new Set(); for (let i = 0; i < 80; i++) { W.fresh(); W.run(3000, 250); W.tapAt(400, 240); calm.add(W.cur()); }
  check('a grumpy one sometimes grumbles at a single tap (« Mmh. Quoi ? »)', calm.has('caractere-ronchon'), [...calm].join());
}

/* ---------- 3. his reaction to a change, through the snapshot (screens.js -> caractere.js -> persona.js) ---------- */
{
  const V = NEW();
  V.set({ caractere: car({ preset: 'pixel' }) });
  const change = (o, ch) => { V.tick(16); V.set({ caractere: car({ ...o, change: { t0: V.wall(), ...ch } }) }); V.tick(16); return V.cur(); };   // the server's stamp: now
  check('the first snapshot: his traits, no reaction (old news)', !V.cur());
  const g = change({ preset: 'grognon', traits: { calin: 30, grognon: 92, farceur: 30, curieux: 40 } }, { quoi: 'preset', kind: 'grognon', adj: 'grognon' });
  V.run(2600); const said = V.PER.state.say;
  check(`a new character: he takes it at once and shows it (${g}, « ${said} »)`, g === 'caractere-grognon' && V.PER.traits.grognon === 92 && /chef/.test(said), `${g} ${said}`);
  V.PER.stop();
  const KINDS = ['pixel', 'calin', 'independant', 'grognon', 'zen', 'bavard', 'timide', 'farceur', 'serieux', 'pile', 'paresseux', 'curieux', 'gourmand', 'prof', 'reveur', 'surprise', 'nom', 'surnom', 'reglage'];
  const bad = KINDS.filter(k => { V.fresh(); return V.PER.event('caractere', { kind: k, adj: 'grognon', nom: 'Bip' }, { force: true }) !== 'caractere-' + k; })
    .concat(['blase', 'petit-appetit', 'cancre'].filter(k => { V.fresh(); return V.PER.event('caractere', { kind: k }, { force: true }) !== 'caractere-bof'; }));
  check(`each of his ${KINDS.length + 3} kinds of change has its own reaction`, bad.length === 0, bad.join());
  V.fresh(); const s1 = change({ traits: { calin: 70 } }, { quoi: 'traits', kind: 'calin' }); V.run(1200); const e1 = V.PER.state.cur;
  const s2 = change({ traits: { calin: 80 } }, { quoi: 'traits', kind: 'calin' }); V.run(16);
  check('a slider moved again the same way while he shows it: he finishes, no restart', s1 === 'caractere-calin' && s2 === 'caractere-calin' && e1 === s2 && V.PER.state.say !== '' , `${s1} ${s2}`);
  V.PER.stop(); V.L.scr = 'systeme';
  const away = change({ traits: { calin: 80 }, nom: 'Bip' }, { quoi: 'nom', kind: 'nom' });
  check('on another screen too (the server brings his face up)', away === 'caractere-nom', away);
  V.L.scr = 'visage'; V.PER.stop(); V.fresh();
  V.set({ caractere: { ...V.snap.caractere, essai: V.snap.server_now } }); V.tick(16);
  check(`« Essayer »: a scene of his plays (${V.cur()})`, !!V.cur() && V.PER.state.cur && ['tap', 'fache', 'calin', 'vie'].includes(V.group(V.cur())), V.cur());
  const before = V.cur(); V.set({ caractere: { ...V.snap.caractere } }); V.tick(16);
  check('…only once per press', V.cur() === before);
  check('no error on the way', V.errs.length === 0 && W.errs.length === 0, V.errs.concat(W.errs).slice(0, 2).join(' | '));
}

/* ---------- 4. in a browser: the phone's panel, the Pi's screen, Pixel Lab ---------- */
const PORT = Number(process.env.CARACTERE_PORT) || 8164, BASE = `http://127.0.0.1:${PORT}`;
const wait = ms => new Promise(r => setTimeout(r, ms));
const portOpen = () => new Promise(r => { const s = net.connect(PORT, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
const until = async (fn, ms = 6000, step = 100) => { const end = Date.now() + ms; let v; while (Date.now() < end) { if ((v = await fn())) return v; await wait(step); } return v; };
(async () => {
  let pw = null; try { pw = process.env.CARACTERE_NO_BROWSER ? null : require('playwright'); } catch { console.log('SKIP the browser part (no Playwright)'); }
  if (!pw) return finish();
  if (await portOpen()) { check(`port ${PORT} is free for the demo server`, false); return finish(); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-caractere-')), cfg = path.join(tmp, 'config.toml');
  fs.writeFileSync(cfg, `data_dir = "${tmp}"\n[ui]\nthemes = ["retro", "moderne", "manga", "neon", "croquis", "lcd"]\n`);
  const srv = spawn('python3', [path.join(APP, 'server.py'), '--demo', '--port', String(PORT), '--host', '127.0.0.1', '--config', cfg], { cwd: APP, stdio: 'ignore' });
  let browser = null, hub = null, st = null;
  try {
    if (!(await until(portOpen, 15000))) throw new Error('le serveur de démo ne démarre pas');
    hub = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); hub.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'state') st = m.data; };
    await until(() => hub.readyState === 1 && st, 5000);
    const act = (action, args = {}) => hub.send(JSON.stringify({ action, args }));
    browser = await pw.chromium.launch();
    const errors = page => { const e = []; page.on('pageerror', x => e.push(x.message)); page.on('console', m => { if (m.type() === 'error' && !/pixel\.apk/.test(m.location().url || '')) e.push(m.text()); }); return e; };
    const kctx = await browser.newContext({ viewport: { width: 800, height: 480 } }), kiosk = await kctx.newPage(), kerr = errors(kiosk);
    await kiosk.goto(`${BASE}/?kiosk=1`); await wait(4200);
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }), phone = await pctx.newPage(), perr = errors(phone);
    await phone.goto(`${BASE}/?mode=both`); await wait(1200);
    const go = await phone.$('.car-go');
    check('the phone: a « Caractère » button under the keys', !!go && await go.isVisible() && (await go.textContent()) === 'Caractère');
    await phone.tap('.car-go'); await wait(300);
    const dom = await phone.evaluate(() => ({ open: !document.querySelector('.car-sheet').hidden, presets: [...document.querySelectorAll('.car-preset')].map(b => b.querySelector('b').textContent),
      sliders: [...document.querySelectorAll('.car-trait')].map(r => [...r.querySelectorAll('.car-ends span')].map(s => s.textContent).join(' ↔ ')),
      sw: document.querySelectorAll('.car-sw').length, sel: document.querySelectorAll('.car-hour select').length, fields: document.querySelectorAll('.car-field input').length,
      hab: !!window.PixelHabitudes && !!document.querySelector('.car-calme .car-hab'),   // his habits (habitudes.js): his quiet hours are his night, a button to his schedule
      sw0: document.documentElement.scrollWidth, title: document.querySelector('.car-title').textContent }));
    check(`the panel: ${dom.presets.length} presets, ${dom.sliders.length} sliders with French ends (${dom.sliders[0]}…), names, switches, quiet hours`,
      dom.open && dom.presets.length >= 15 && dom.presets.includes('Pile électrique') && dom.sliders.length === 8 && dom.sliders.includes('Patient ↔ Grognon') && dom.sw === 3 && (dom.sel === 2 || (dom.sel === 0 && dom.hab)) && dom.fields === 2 && dom.sw0 <= 390, JSON.stringify(dom));
    const small = await phone.evaluate(() => [...document.querySelectorAll('.car-sheet button, .car-sheet input, .car-sheet select')].map(e => { const r = e.getBoundingClientRect(); return [e.className || e.type, Math.round(r.width), Math.round(r.height)]; })
      .filter(([c, w, h]) => h < (c === 'range' ? 44 : 56) || w < 56));
    check('touch targets: 56 px and more (sliders 48 px tall, full width)', small.length === 0, JSON.stringify(small.slice(0, 6)));
    if (SHOTS) await phone.screenshot({ path: path.join(SHOTS, 'panneau-retro.png') });
    await phone.tap('.car-preset[data-id="grognon"]');
    await until(() => st.caractere.preset === 'grognon');
    const pk = await until(() => kiosk.evaluate(() => Screens.persona.state.cur === 'caractere-grognon' && Screens.persona.traits.grognon));
    check('a preset on the phone: the server takes it, the Pi\'s screen shows it at once', st.caractere.preset === 'grognon' && st.caractere.traits.grognon === 92 && pk === 92 && st.screen === 'visage', JSON.stringify(st.caractere.change));
    const pp = await phone.evaluate(() => [Screens.persona.traits.grognon, document.querySelector('.car-preset[data-id="grognon"]').getAttribute('aria-pressed'), document.querySelector('.car-now-name').textContent]);
    check('…the phone\'s own Pixel too, and the panel says so', pp[0] === 92 && pp[1] === 'true' && pp[2] === 'Grognon', JSON.stringify(pp));
    await phone.$eval('.car-trait input[data-k="calin"]', r => { r.value = '80'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); });
    await until(() => st.caractere.traits.calin === 80);
    const sur = await until(() => phone.evaluate(() => document.querySelector('.car-now-name').textContent === 'Sur mesure' && document.querySelector('.car-now-desc').textContent));   // the phone's own snapshot may come a bit later
    check(`a slider: that trait moves, « Sur mesure » (« ${sur} »)`, st.caractere.traits.calin === 80 && st.caractere.preset === 'perso' && /^Un caractère à toi, plutôt/.test(sur || ''), String(sur));
    await phone.fill('.car-field input[data-k="nom"]', 'Bip'); await phone.press('.car-field input[data-k="nom"]', 'Enter');
    await until(() => st.caractere.nom === 'Bip');
    const typed = await phone.evaluate(() => [document.activeElement && document.activeElement.id, document.getElementById('cmd').value, document.querySelector('.car-title').textContent]);
    check('his name: typed in the panel (the command bar does not steal the keys), « Caractère de Bip »', st.caractere.nom === 'Bip' && typed[0] !== 'cmd' && typed[1] === '' && typed[2] === 'Caractère de Bip', JSON.stringify(typed));
    await phone.fill('.car-field input[data-k="surnom"]', 'Max'); await phone.$eval('.car-field input[data-k="surnom"]', i => i.blur());
    await until(() => st.caractere.surnom === 'Max');
    check('what he calls you', st.caractere.surnom === 'Max');
    await phone.tap('.car-sw[data-k="parle"]'); await until(() => st.caractere.parle === false);
    if (await phone.$('.car-hour select')) await phone.selectOption('.car-hour select >> nth=0', '21');
    else act('caractere.set', { calme: { de: 21 } });                // his habits (habitudes.js): the panel leads to his schedule, the setting is still his
    await until(() => st.caractere.calme.de === 21);
    const kk = await until(() => kiosk.evaluate(() => { const c = Screens.persona.caractere; return !c.parle && c.calme[0] === 21 && c.nom === 'Bip' && c; }));
    check('« Il parle » off and quiet hours from 21 h: the Pi\'s screen knows', st.caractere.parle === false && !!kk, JSON.stringify(kk));
    await phone.tap('.car-sw[data-k="parle"]'); await until(() => st.caractere.parle === true);
    const e0 = st.caractere.essai; await kiosk.evaluate(() => Screens.persona.stop());
    await phone.tap('.car-try'); await until(() => st.caractere.essai > e0);
    const tried = await until(() => kiosk.evaluate(() => Screens.persona.state.cur));
    check(`« Essayer »: a scene typical of him on the Pi (${tried})`, !!tried);
    if (SHOTS) { await phone.evaluate(() => document.querySelector('.car-box').scrollTo(0, 99999)); await wait(200); await phone.screenshot({ path: path.join(SHOTS, 'panneau-retro-bas.png') }); }
    await phone.tap('.car-reset'); await wait(300);
    const once = st.caractere.preset;
    check('« Réinitialiser » asks a second touch', once !== 'pixel' && await phone.evaluate(() => document.querySelector('.car-reset').textContent.startsWith('Sûr')));
    await phone.tap('.car-reset'); await until(() => st.caractere.preset === 'pixel');
    check('…then everything is back: traits, names, habits', st.caractere.preset === 'pixel' && st.caractere.nom === 'Pixel' && st.caractere.surnom === '' && Object.values(st.caractere.traits).every(v => v === 50) && st.caractere.parle && st.caractere.calme.de === 23);
    await phone.keyboard.press('Escape'); await wait(200);
    check('Escape closes the panel', await phone.evaluate(() => document.querySelector('.car-sheet').hidden && !document.body.classList.contains('car-open')));
    // the Pixel de poche: the phone sideways, the same traits
    act('caractere.set', { preset: 'paresseux' }); await until(() => st.caractere.preset === 'paresseux');
    await phone.tap('.car-go'); await wait(300);                 // the sheet open when the phone turns sideways: Pixel de poche comes
    await phone.setViewportSize({ width: 844, height: 390 }); await wait(300);
    await phone.evaluate(() => window.PixelPoche && !PixelPoche.on && PixelPoche.enter('fixe')); await wait(500);
    const poche = await phone.evaluate(() => [window.PixelPoche && PixelPoche.on, Screens.persona.traits.energique, document.querySelector('.car-sheet').hidden,
      document.body.classList.contains('car-open'), (() => { const r = document.querySelector('.screen').getBoundingClientRect(), e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!e && !e.closest('.car-sheet'); })()]);
    if (SHOTS) await phone.screenshot({ path: path.join(SHOTS, 'poche-apres-panneau.png') });
    check('the Pixel de poche has the same character', poche[0] === true && poche[1] === 8, JSON.stringify(poche));
    check('…and the « Caractère » sheet goes away when he comes (nothing over him)', poche[2] === true && poche[3] === false && poche[4] === true, JSON.stringify(poche));
    await phone.evaluate(() => PixelPoche.leave()); await phone.setViewportSize({ width: 390, height: 844 });
    // his reactions, in several themes, for the eyes
    if (SHOTS) for (const [th, id, ms] of [['retro', 'caractere-grognon', 4600], ['lcd', 'caractere-prof', 3000], ['manga', 'caractere-farceur', 4200], ['neon', 'caractere-calin', 1500], ['croquis', 'caractere-nom', 2500], ['moderne', 'caractere-surprise', 1300], ['retro', 'caractere-lecon', 3600], ['lcd', 'caractere-zen', 2500]]) {
      act('theme.set', { name: th }); await wait(800);
      await kiosk.evaluate(id => { const L = Screens.local; L.sleepy = false; L.local = null; L.pack = null; L.banner = null; Screens.persona.play(id); }, id); await wait(ms);
      await kiosk.screenshot({ path: path.join(SHOTS, `${th}-${id.replace('caractere-', '')}.png`) });
    }
    if (SHOTS) for (const th of ['lcd', 'manga', 'neon']) { act('theme.set', { name: th }); await wait(500); await phone.tap('.car-go'); await wait(300); await phone.screenshot({ path: path.join(SHOTS, `panneau-${th}.png`) }); await phone.tap('.car-x'); }
    act('caractere.reset');
    check('the phone and the Pi: no error', perr.length === 0 && kerr.length === 0, perr.concat(kerr).slice(0, 3).join(' | '));
    // a short window (a phone on its side without Pixel de poche, a small browser window): the sheet still scrolls
    const sctx = await browser.newContext({ viewport: { width: 844, height: 390 } }), short = await sctx.newPage(), serr = errors(short);
    await short.goto(`${BASE}/?mode=both`); await wait(1000); await short.click('.car-go'); await wait(300);
    const land = await short.evaluate(() => { const b = document.querySelector('.car-box'), a = document.querySelector('.car-actions'), t = document.querySelector('.car-top');
      return [b.scrollHeight > b.clientHeight + 200, getComputedStyle(a).position, Math.round(t.getBoundingClientRect().height)]; });
    if (SHOTS) await short.screenshot({ path: path.join(SHOTS, 'panneau-paysage.png') });
    check(`a short window: the sheet scrolls, the buttons are not stuck over it, a slim header (${land[2]} px)`, land[0] && land[1] === 'static' && land[2] <= 72 && serr.length === 0, JSON.stringify(land) + serr.join());
    await sctx.close();
    // Pixel Lab: its « Caractère » panel and the fake server
    const lctx = await browser.newContext({ viewport: { width: 1280, height: 860 } }), lab = await lctx.newPage(), lerr = errors(lab);
    await lab.goto(`${BASE}/app/lab/index.html?themes=all`); await wait(1500);
    await lab.evaluate(() => { try { localStorage.removeItem('pixel_lab_caractere'); } catch {} PixelHub.dispatch('caractere.reset'); });
    const lp = await lab.evaluate(() => [!!document.getElementById('caractere'), document.querySelectorAll('#caractere .car-preset').length, document.querySelectorAll('#caractere input[type=range]').length]);
    check('Pixel Lab: a « Caractère » panel (presets, sliders)', lp[0] && lp[1] >= 15 && lp[2] === 8, JSON.stringify(lp));
    await lab.click('#caractere .car-preset[data-id="calin"]'); await wait(400);
    const lc = await lab.evaluate(() => [PixelHub.S.caractere.preset, Screens.persona.traits.calin, Screens.persona.state.cur]);
    check('…a preset there changes his character, he shows it', lc[0] === 'calin' && lc[1] === 92 && lc[2] === 'caractere-calin', JSON.stringify(lc));
    await lab.fill('#cmd', 'sois grognon'); await lab.press('#cmd', 'Enter'); await wait(300);
    await lab.fill('#cmd', 'appelle-toi Bip'); await lab.press('#cmd', 'Enter'); await wait(300);
    const lk = await lab.evaluate(() => [PixelHub.S.caractere.preset, PixelHub.S.caractere.nom, document.querySelector('#caractere .car-field input[data-k="nom"]').value]);
    check('…and the typed commands work there too (« sois grognon », « appelle-toi Bip »)', lk[0] === 'grognon' && lk[1] === 'Bip' && lk[2] === 'Bip', JSON.stringify(lk));
    await lab.fill('#cmd', 'aide'); await lab.press('#cmd', 'Enter'); await wait(200);
    const help = await lab.evaluate(() => PixelHub.S.toast && PixelHub.S.toast.msg);
    await lab.fill('#cmd', 'parle-moi'); await lab.press('#cmd', 'Enter'); await wait(300);
    const chat = await lab.evaluate(() => [PixelHub.S.screen, PixelHub.S.caractere.parle, (PixelHub.S.chat.messages.find(m => m.role === 'user' && m.text === 'parle-moi') || {}).text]);
    check('…« aide » names « caractère câlin », and « parle-moi » goes to Claude, as on the server', /caractère câlin/.test(help || '') && chat[0] === 'claude' && chat[1] === true && chat[2] === 'parle-moi', JSON.stringify([help, chat]));
    await lab.evaluate(() => PixelHub.dispatch('caractere.reset'));
    check('Pixel Lab: no error', lerr.length === 0, lerr.slice(0, 3).join(' | '));
  } catch (e) { check('the browser part ran to the end', false, e.stack.split('\n').slice(0, 3).join(' ')); }
  finally { if (browser) await browser.close(); if (hub) hub.close(); srv.kill('SIGTERM'); }
  finish();
})();
function finish() { console.log(`\n${fails} failure(s)`); process.exit(fails ? 1 : 0); }
