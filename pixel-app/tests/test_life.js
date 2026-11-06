// Unit checks for web/themes.js, without a browser:  node tests/test_life.js
// - PixelLife over simulated time: blinks (some double), saccades, idle actions (hop, fidget, stretch, yawn),
//   mood transitions, touch (squash, bounce), rapid taps, petting.
// - every theme draws every mood, every transition between two moods, every screen element, at 1x and 2x,
//   on a stub canvas that records nothing: it only has to run without an error.
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'themes.js'), 'utf8');
let fails = 0;
const check = (name, ok, info = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (!ok && info ? `  [${info}]` : '')); if (!ok) fails++; };

// a 2D context that accepts everything
const stub = () => new Proxy(function () {}, {
  get: (t, k) => k === 'width' || k === 'height' ? 100 : k === Symbol.toPrimitive ? () => 0 : k === 'measureText' ? s => ({ width: String(s).length * 10 }) : stub(),
  set: () => true, apply: () => stub(), construct: () => stub(),
});
const canvas = () => ({ width: 0, height: 0, getContext: () => stub() });
const sandbox = { window: {}, document: { createElement: canvas }, DOMMatrix: function () {}, Math, console };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const { PixelMoods, PixelLife, PixelThemes } = sandbox.window;
const moods = PixelMoods.map(m => m.id);
check('PixelMoods has at least 12 moods with a French name and a description', moods.length >= 12 && PixelMoods.every(m => /^[a-z]+$/.test(m.id) && m.name && m.desc));

// ---- life over simulated time ----
let now = 0;
const life = PixelLife(), seen = new Set(), states = [];
let blinks = 0, doubles = 0, wasClosed = false, lastBlink = -1e9, lookJumps = 0, lastLx = 0;
for (now = 0; now < 240000; now += 16) {
  const a = life.update(now, 'neutre', { idle: now, sleepIn: 600000 - now });
  if (a.act) seen.add(a.act);
  if (a.mood === 'baille') seen.add('yawn-mood');
  const closed = a.blink > 0.8; if (closed && !wasClosed) { if (now - lastBlink < 500) doubles++; blinks++; lastBlink = now; } wasClosed = closed;
  if (Math.abs(a.lx - lastLx) > 0.04) lookJumps++; lastLx = a.lx;
}
check('blinks every few seconds', blinks > 240 / 7 && blinks < 240 / 1.5, String(blinks));
check('some blinks are double', doubles >= 2, String(doubles));
check('the eyes look around (saccades)', lookJumps > 30, String(lookJumps));
for (const act of ['saut', 'bof', 'etire', 'baille']) check(`idle action '${act}' happens when nobody touches him`, seen.has(act), [...seen].join(','));
check('a yawn shows the baille mood', seen.has('yawn-mood'));

const l2 = PixelLife(); now = 0;
l2.update(now, 'neutre'); for (now = 0; now < 1000; now += 16) l2.update(now, 'neutre', { calm: true });
let a = l2.update(now += 16, 'content', { calm: true });
check('a new mood starts a transition (from, k < 1)', a.from === 'neutre' && a.mood === 'content' && a.k < 0.2, `${a.from} ${a.k}`);
for (let i = 0; i < 9; i++) a = l2.update(now += 16, 'content', { calm: true });
check('the transition is halfway after about 150 ms', a.k > 0.3 && a.k < 0.95, String(a.k));
for (let i = 0; i < 10; i++) a = l2.update(now += 16, 'content', { calm: true });
check('the transition ends after about 220 ms', a.k === 1, String(a.k));
const l3 = PixelLife(); now = 0;
for (now = 0; now < 500; now += 16) l3.update(now, 'neutre', { calm: true });
l3.press(true); let maxSq = 0; for (let i = 0; i < 20; i++) maxSq = Math.max(maxSq, l3.update(now += 16, 'neutre', { calm: true }).sq);
check('a finger on the face squashes it', maxSq > 0.1, String(maxSq));
l3.press(false); let maxHop = 0; for (let i = 0; i < 30; i++) maxHop = Math.max(maxHop, l3.update(now += 16, 'neutre', { calm: true }).hop);
check('releasing makes it bounce', maxHop > 0.3, String(maxHop));
let r = ''; for (let i = 0; i < 5; i++) r = l3.tap(now += 100);
check('five quick taps make him angry', r === 'fache', r);
check('a single tap does not', l3.tap(now += 5000) === '');
l3.press(true); r = ''; for (let i = 0; i < 40 && !r; i++) r = l3.rub(i % 8 < 4 ? 30 : -30, 2, now += 30);
check('petting makes him fall in love', r === 'amoureux', r);
l3.press(false);
const l4 = PixelLife(); now = 0; let hasTilt = 0;
for (now = 0; now < 3000; now += 16) hasTilt = Math.max(hasTilt, Math.abs(l4.update(now, 'confus', { calm: true }).tilt));
check('a confused face tilts its head', hasTilt > 0.08, String(hasTilt));

// ---- every theme, every mood, every transition ----
for (const S of [1, 2]) {
  let t = 1000;
  const H = { X: stub(), RM: false, get now() { return t; }, S, scr: 'visage', blinkP: () => -1, txt() {}, wrap: s => [String(s)], fit: s => s };
  let themes;
  try { themes = PixelThemes(H); } catch (e) { check(`PixelThemes builds at ${S}x`, false, e.stack); continue; }
  const ids = Object.keys(themes);
  if (S === 1) check('at least 6 themes, with the 3 original ones', ids.length >= 6 && ['retro', 'moderne', 'manga'].every(i => ids.includes(i)), ids.join(','));
  for (const id of ids) {
    const T = themes[id], errs = [];
    const run = (what, f) => { try { f(); } catch (e) { errs.push(`${what}: ${e.message}`); } };
    const fields = ['id', 'name', 'c', 'glow', 'bubbles', 'qr', 'font', 'bg', 'header', 'box', 'bar', 'bubble', 'bulb', 'weather', 'digits', 'star', 'face'];
    if (S === 1) check(`${id}: has every field of the theme contract`, fields.every(f => T[f] !== undefined) && ['fg', 'dim', 'faint', 'bg', 'accent', 'pink', 'hi'].every(k => /^#[0-9a-f]{6}$/i.test(T.c[k])), fields.filter(f => T[f] === undefined).join(','));
    for (const scr of ['visage', 'veille', 'boot', 'meteo']) { H.scr = scr; run('bg ' + scr, () => T.bg(16)); }
    run('header', () => T.header('Lumières', '12:34'));
    for (const c of Object.values(T.c)) for (const fill of [undefined, T.c.bg, T.c.faint, T.c.fg]) run('box', () => T.box(10, 10, 100, 40, c, fill));
    run('bar', () => { T.bar(0, 0, 10, 4.5, 30, 28, 6); T.bar(0, 0, 25, 25, 24, 20, 6, T.c.accent); T.bar(0, 0, 1, 1, 14, 9, 0, T.c.dim); });
    run('bubble', () => { T.bubble(10, 10, 200, 60, true); T.bubble(10, 10, 200, 60, false); });
    run('bulb', () => { T.bulb(48, 80, true, 0); T.bulb(48, 80, false, 1); });
    for (const k of ['soleil', 'nuage', 'pluie', 'neige', 'orage']) for (const sz of ['big', 'mini']) run(`weather ${k} ${sz}`, () => { T.weather(k, 180, 200, sz, true); T.weather(k, 96, 368, sz, false); });
    run('digits', () => { T.digits('24:59', 400, 116, T.c.hi); T.digits('105:00', 400, 116, T.c.accent); });
    run('star', () => { T.star(10, 10, 4, true); T.star(10, 10, 2, false); });
    if (T.boot) for (const e of [0, 400, 1200, 2000, 2600, 3400]) run('boot ' + e, () => T.boot(e, { rows: [['Claude', 'prêt', true], ['Pont Hue', '0 pièces', false]], face: (x, y, u, md) => T.face(x, y, u, md) }));
    if (T.fg) run('fg', () => T.fg(16));
    if (T.top) run('top', () => T.top('12:34'));
    if (T.rule) run('rule', () => T.rule(612, 60, 2, 360));
    const lf = PixelLife();
    for (const m of moods) for (const u of [16, 6]) for (const dt of [0, 400, 1700, 2900]) { t += dt; run(`face ${m} u=${u}`, () => T.face(400, 236, u, m, 0.5, -0.3)); }
    for (const m1 of moods) for (const m2 of moods) {               // every transition, caught at a few moments
      let tt = t; lf.update(tt, m1, { calm: true }); for (let i = 0; i < 20; i++) lf.update(tt += 16, m1, { calm: true });
      for (const step of [16, 60, 60, 120]) { tt += step; const st = lf.update(tt, m2, {}); t = tt; run(`transition ${m1}>${m2}`, () => T.face(400, 236, 16, st.mood, st.lx, st.ly, st)); }
    }
    check(`${id} at ${S}x: every element, mood and transition draws without an error`, errs.length === 0, errs.slice(0, 3).join(' | '));
  }
}
console.log(`\n${fails} failure(s)`);
process.exit(fails ? 1 : 0);
