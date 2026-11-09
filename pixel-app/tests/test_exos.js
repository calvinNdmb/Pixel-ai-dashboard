// Pixel's math exercises in a real browser:  node tests/test_exos.js [--shots DIR]
// Starts a demo server (port 8185, or EXOS_PORT; a temporary data folder, every theme on), then in Chromium (Playwright):
// - the Pi's screen (800x480, ?kiosk=1), in each of the 6 themes: an exercise opened by the server shows on his face screen
//   (the question, 4 big choices, his small face); a double tap on a wrong choice gives the hint and a second try (never the
//   correction), a touch on the right one the result; he reacts with his scenes (exo-presque…, then exo-ouf); then his face;
// - on the Pi again: each choice answers wherever it is touched, its right end included (where Nourrir's plate sits, on a
//   branch that has him); the keyboard (digits and Entrée; 1 to 4 for a riddle), a touch on his face for the hint, the gentle
//   nudge, a quick series where every answer gets his scene and the 5-streak's one plays to its end before the summary's,
//   the challenge's frame rate and a calm one otherwise, no moment of life while an exercise is open, his offer
//   « Une petite question ? » (only when the setting is on) and its « Oui ! » button;
// - a phone (390x844): the « Exos » panel, starting one, a quick double tap on a wrong choice and its hint, the keypad (its
//   − key for negative answers), the correction, the settings, the scores, the challenge's clock stopped with the panel,
//   the command bar (« table de 8 », then the number), touch targets of 56 px;
// - Pixel Lab (demo-hub.js mirrors the server): a double answer, « une autre » after « stop exo », a number during the
//   correction, « 4 025 »;
// - no page error anywhere.  --shots DIR: screenshots of all that.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const APP = path.join(__dirname, '..'), PORT = Number(process.env.EXOS_PORT) || 8185, BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = (i => (i >= 0 ? process.argv[i + 1] : null))(process.argv.indexOf('--shots'));
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (name, ok, info = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (!ok && info ? `  [${info}]` : '')); if (!ok) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 6000, step = 80) => { const end = Date.now() + ms; let v; while (Date.now() < end) { if ((v = await fn())) return v; await wait(step); } return v; };
const portOpen = () => new Promise(r => { const s = net.connect(PORT, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
const THEMES = ['retro', 'moderne', 'manga', 'neon', 'croquis', 'lcd'];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-exos-')), cfg = path.join(tmp, 'config.toml');
fs.writeFileSync(cfg, `data_dir = "${tmp}"\n[ui]\nthemes = ${JSON.stringify(THEMES)}\n`);
let srv = null, hub = null, S = null;
const act = (action, args = {}) => hub.send(JSON.stringify({ action, args }));
const cur = () => S && S.exos && S.exos.cur;
const prod = q => { const m = /(\d+) × (\d+) = \?/.exec(q || ''); return m ? String(+m[1] * +m[2]) : null; };
const errors = page => {
  const e = [];
  page.on('pageerror', x => e.push('pageerror: ' + x.message));
  page.on('console', m => { if (m.type() === 'error' && !/\/pixel\.apk$/.test(m.location().url || '')) e.push('console.error: ' + m.text()); });
  return e;
};
async function at(page, x, y) {                                    // a point of the 800x480 canvas, on the page
  const r = await page.locator('#crt').boundingBox();
  return { x: r.x + x / 800 * r.width, y: r.y + y / 480 * r.height };
}
async function tap(page, x, y) { const p = await at(page, x, y); await page.mouse.click(p.x, p.y); }
const shot = async (page, name, el) => { if (SHOTS) await (el ? page.locator(el) : page).screenshot({ path: path.join(SHOTS, name + '.png') }); };
const scene = page => page.evaluate(() => Screens.persona.state.cur);
const drawn = page => page.evaluate(() => {                         // how many colours the canvas shows
  const c = document.getElementById('crt'), t = document.createElement('canvas'); t.width = 160; t.height = 96;
  const g = t.getContext('2d'); g.drawImage(c, 0, 0, 160, 96); const d = g.getImageData(0, 0, 160, 96).data, seen = new Set();
  for (let i = 0; i < d.length; i += 8) seen.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
  return seen.size;
});
let PAGE = null;                                                  // the page that must have seen it too
async function open(args, test = c => c && c.etat === 'question') {
  const before = cur() ? cur().id : -1;
  act('exos.nouveau', args);
  const c = await until(() => { const x = cur(); return x && x.id !== before && test(x) ? x : null; });
  if (c && PAGE) await until(() => PAGE.evaluate(id => !!PixelExos.state && !!PixelExos.state.cur && PixelExos.state.cur.id === id, c.id));
  return c;
}

async function kiosk(browser) {
  const page = await browser.newPage({ viewport: { width: 800, height: 480 } }), errs = errors(page);
  PAGE = page;
  await page.goto(BASE + '/?kiosk=1');
  // the first snapshot starts his boot screen: wait for it, then for its end (else the first taps land on the boot screen)
  await until(() => page.evaluate(() => !!window.PixelExos && !!PixelExos.state && Screens.local.lastBootAt > 0 && Screens.local.boot < 0), 15000);
  const lay = await page.evaluate(() => PixelExos.layout), mid = b => [b.x + b.w / 2, b.y + b.h / 2];
  check('the exercises are loaded on the Pi’s screen (screens.js add-on, scene pack)', !!lay && lay.choices.length === 4
    && await page.evaluate(() => Screens.persona.scenes.filter(s => s.id.startsWith('exo-')).length >= 14));

  for (const th of THEMES) {
    act('theme.set', { name: th });
    await until(() => page.evaluate(t => Screens.local.theme === t, th));
    await page.evaluate(() => { Screens.persona.reset(); Screens.local.sleepy = false; });
    const c = await open({ kind: 'table', niveau: 3 });
    const shown = await until(() => page.evaluate(() => PixelExos.open && Screens.local.scr === 'visage'));
    await wait(300);
    check(`${th}: the exercise shows on his face screen, drawn on the canvas`, !!c && shown && (await drawn(page)) > 3, String(c && c.q));
    await shot(page, `kiosk-${th}-question`);
    const right = prod(c.q), wi = c.choices.findIndex(x => x !== right), ri = c.choices.indexOf(right);
    const pw = await at(page, ...mid(lay.choices[wi]));
    await page.mouse.dblclick(pw.x, pw.y);                       // a double tap: the second one must not use up the second try
    const h = await until(() => { const x = cur(); return x && x.tries === 1 && x.hint ? x : null; });
    const sc1 = await until(async () => { const s = await scene(page); return ['exo-presque', 'exo-reessaie'].includes(s) ? s : null; }, 3000);
    await wait(250);
    const still = cur();
    check(`${th}: a double tap on a wrong choice: the hint and a second try (not the correction), and Pixel encourages (${sc1})`,
      !!h && h.faux[0] === c.choices[wi] && !!sc1 && still.etat === 'question' && still.faux.length === 1, JSON.stringify(still));
    await wait(500);
    await shot(page, `kiosk-${th}-hint`);
    await tap(page, ...mid(lay.choices[ri]));
    const r = await until(() => { const x = cur(); return x && x.etat === 'resultat' ? x : null; });
    const sc2 = await until(async () => { const s = await scene(page); return ['exo-ouf', 'exo-objectif', 'exo-serie'].includes(s) ? s : null; }, 3000);   // the 5th: the daily goal
    check(`${th}: a touch on the right one: right on the second try, with the correction, and Pixel is pleased (${sc2})`, r && r.ok && r.answer === right && !!r.explication && !!sc2, JSON.stringify(r));
    await wait(700);
    await shot(page, `kiosk-${th}-result`);
    act('exos.stop');
    const back = await until(() => page.evaluate(() => !PixelExos.open));
    check(`${th}: « Fini »: back to his face`, back && (await drawn(page)) > 2);
  }
  act('theme.set', { name: 'retro' });
  await until(() => page.evaluate(() => Screens.local.theme === 'retro'));
  await page.evaluate(() => Screens.persona.reset());

  // each choice answers wherever it is touched, its right end included (Nourrir's plate sits there, on a branch that has him)
  const nour = await page.evaluate(() => !!window.PixelNourrir);
  const missed = [];
  for (let i = 0; i < 4; i++) for (const dy of [8, lay.choices[i].h - 8]) {
    const c = await open({ kind: 'table', niveau: 1 }), b = lay.choices[i];
    await tap(page, b.x + b.w - 8, b.y + dy);
    const r = await until(() => { const x = cur(); return x && x.id === c.id && (x.tries === 1 || x.etat === 'resultat') ? x : null; }, 2500);
    if (!(r && (r.faux[0] === c.choices[i] || r.valeur === c.choices[i]))) missed.push(`${i + 1}:${dy}`);
  }
  check(`each of the 4 choices answers wherever it is touched, its right end included${nour ? ' (Nourrir’s plate on)' : ''}`, missed.length === 0, missed.join(' '));
  act('exos.stop'); await until(() => page.evaluate(() => !PixelExos.open));
  if (nour) {
    const N = await page.evaluate(() => ({ shown: PixelNourrir.shown, H: PixelNourrir.HANDLE }));
    if (N.shown) {
      await wait(300);
      await tap(page, N.H.x + N.H.w / 2, N.H.y + N.H.h / 2);
      check('…and once the exercise is put away, Nourrir’s plate opens his tray again', !!(await until(() => page.evaluate(() => PixelNourrir.trayOpen), 2000)));
      await page.evaluate(() => PixelNourrir.close());
    } else console.log('--   Nourrir is off: his plate is not on the screen');
  } else console.log('--   no Nourrir here (web/nourrir.js): his plate over the choices is checked on a branch that has both');

  // the keyboard: digits then Entrée
  let c = await open({ mode: 'table', table: 6 });
  await page.keyboard.type(prod(c.q));
  const buf = await page.evaluate(() => PixelExos.buffer);
  await page.keyboard.press('Enter');
  let r = await until(() => { const x = cur(); return x && x.etat === 'resultat' ? x : null; });
  check('the Pi’s keyboard: the digits show, Entrée answers (« table de 6 »)', buf === prod(c.q) && r && r.ok, `${buf} ${JSON.stringify(r)}`);
  await page.keyboard.press('Enter');
  check('…Entrée again: the next question', !!(await until(() => { const x = cur(); return x && x.etat === 'question' && x.i === 2 ? x : null; })));
  for (let i = 0; i < 12; i++) { c = await open({ kind: 'enigme', niveau: 3 }); if (c && c.clavier === '') break; }   // a riddle whose answers are words
  await page.keyboard.press('3');
  r = await until(() => { const x = cur(); return x && (x.tries === 1 || x.etat === 'resultat') ? x : null; });
  check('a riddle: the key 3 answers with the 3rd choice', r && (r.faux.includes(c.choices[2]) || (r.etat === 'resultat' && r.answer === c.choices[2])), JSON.stringify(r));
  await page.keyboard.press('Escape');
  check('Échap: the exercise is put away', !!(await until(() => !cur())));

  // a touch on his face: the hint; the nudge
  c = await open({ kind: 'addition', niveau: 2 });
  await wait(2800);
  await tap(page, lay.face.x + lay.face.w / 2, lay.face.y + lay.face.h / 2);
  check('a touch on his small face gives the hint', !!(await until(() => { const x = cur(); return x && x.hint && x.tries === 0 ? x : null; })));
  await page.evaluate(() => Screens.persona.stop());
  await wait(200);
  await page.evaluate(() => { PixelExos.state.cur.t0 -= 41000; Screens.local.dirty = true; });
  const nudge = await until(async () => ((await scene(page)) === 'exo-attente' ? 1 : 0), 1500, 40);
  check('after 40 s on a question, a gentle nudge (« Tu réfléchis ? »)', !!nudge);
  await shot(page, 'kiosk-retro-attente');

  // no moment of life while an exercise is open; a calm frame rate
  await page.evaluate(() => { Screens.persona.stop(); Screens.persona.setEvery(300, 600); Screens.local.lastInput -= 600000; });
  await wait(2600);
  const life = await page.evaluate(() => { const id = Screens.persona.state.cur, s = Screens.persona.scenes.find(x => x.id === id); return s ? s.group : ''; });
  await page.evaluate(() => { Screens.persona.setEvery(45000, 150000); Screens.local.lastInput = performance.now(); Screens.local.sleepy = false; });
  check('no moment of life while an exercise is open', life !== 'vie', life);
  await page.evaluate(() => Screens.persona.stop());
  await wait(2900);
  const calm = await page.evaluate(() => Screens.local.fpsWant);
  check(`a still exercise: a calm frame rate (${calm} im/s)`, calm <= 20, String(calm));
  c = await open({ mode: 'chrono', kind: 'addition', niveau: 1 });
  await wait(3200);
  await page.evaluate(() => Screens.persona.stop());
  await wait(400);
  const fc = await page.evaluate(() => Screens.local.fpsWant);
  check(`the challenge: its bar moves at ${fc} im/s, no more`, fc > 10 && fc <= 30, String(fc));
  await shot(page, 'kiosk-retro-chrono');
  act('exos.stop'); await until(() => !cur());

  // a quick series: each right answer gets his scene; the 5th, a 5-streak, plays to its end before the summary's
  await page.evaluate(() => {
    const PER = Screens.persona; window.__sc = []; let last = null;
    clearInterval(window.__scT); window.__scT = setInterval(() => { const id = PER.state.cur; if (id !== last) { last = id; if (id) __sc.push([id, performance.now()]); } }, 20);
  });
  await open({ kind: 'addition', niveau: 1 });
  act('exos.passer', {});                                        // a skipped one: the streak starts again from 0
  await until(() => cur() && cur().etat === 'resultat');
  c = await open({ mode: 'serie', n: 5, kind: 'table', niveau: 1 });
  const answered = [];
  for (let i = 1; i <= 5; i++) {
    const q = await until(() => { const x = cur(); return x && x.i === i && x.etat === 'question' ? x : null; }, 8000);
    if (!q) break;
    await until(() => page.evaluate(id => !!PixelExos.state.cur && PixelExos.state.cur.id === id, q.id));
    answered.push(await page.evaluate(() => performance.now()));
    act('exos.repondre', { value: prod(q.q), id: q.id });
    await until(() => { const x = cur(); return x && x.id === q.id && x.etat === 'resultat' ? x : null; });
  }
  await until(() => { const x = cur(); return x && x.etat === 'bilan' ? x : null; }, 9000);
  await wait(600);
  const log = await page.evaluate(() => { clearInterval(window.__scT); return window.__sc; });
  const cheer = /^exo-(bravo|fier|feu)$/, after = (t0, re, ms) => log.find(([id, t]) => re.test(id) && t >= t0 - 30 && t < t0 + ms);
  const reacted = answered.slice(0, 4).map(t0 => !!after(t0, cheer, 1500));
  const sv = after(answered[4] || 0, /^exo-serie$/, 1500), bl = log.find(([id]) => id === 'exo-bilan');
  check(`a quick series: each of the first 4 right answers gets his scene (${reacted.map(Number).join('')})`, answered.length === 5 && reacted.every(Boolean), JSON.stringify(log));
  check(`…the 5th, 5 in a row: « 5 d’affilée ! », played to its end before the summary’s scene (${sv && bl ? Math.round(bl[1] - sv[1]) : '?'} ms)`, !!sv && !!bl && bl[1] - sv[1] >= 4000, JSON.stringify(log));
  act('exos.stop'); await until(() => !cur());

  // a series of 2: its summary
  c = await open({ mode: 'serie', n: 2, kind: 'table', niveau: 1 });
  act('exos.repondre', { value: prod(c.q) });
  c = await until(() => { const x = cur(); return x && x.i === 2 && x.etat === 'question' ? x : null; }, 5000);
  act('exos.repondre', { value: prod(c && c.q) });
  const bil = await until(() => { const x = cur(); return x && x.etat === 'bilan' ? x : null; }, 5000);
  const sb = await until(async () => ((await scene(page)) === 'exo-bilan' ? 1 : 0), 3000);
  check('a series of 2: the summary 2/2, and Pixel is proud', bil && bil.bons === 2 && bil.total === 2 && !!sb, JSON.stringify(bil));
  await wait(900);
  await shot(page, 'kiosk-retro-bilan');
  act('exos.stop'); await until(() => !cur());

  // his offer
  const off = await page.evaluate(() => PixelExos.canPropose({ day: true }));
  check('« Une petite question ? » never comes while the setting is off (default)', off === false && S.exos.reglages.propose === false);
  act('exos.reglages', { propose: true }); await until(() => S.exos.reglages.propose);
  check('…nor just after an exercise', (await page.evaluate(() => PixelExos.canPropose({ day: true }))) === false);
  await page.evaluate(() => { Screens.local.sleepy = false; Screens.persona.play('exo-envie'); });
  await wait(2200);
  await shot(page, 'kiosk-retro-envie');
  await tap(page, 506, 440);
  const yes = await until(() => { const x = cur(); return x && S.exos.ev && S.exos.ev.source === 'envie' ? x : null; });
  check('his offer « Une petite question ? »: « Oui ! » opens one', !!yes);
  act('exos.stop'); await until(() => !cur());
  act('exos.reglages', { propose: false });
  check('the Pi’s screen: no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
  await page.close();
}

async function phone(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(), errs = errors(page);
  PAGE = null;
  await page.goto(BASE + '/');
  await until(() => page.evaluate(() => !!document.querySelector('.exos-go')));
  await page.click('.exos-go');
  check('the phone: an « Exos » button under the keys opens the panel', await page.isVisible('#exos .ex-big'));
  await shot(page, 'phone-start', '#exos');
  await page.click('.ex-big button:nth-child(1)');
  let c = await until(() => cur());
  check('« Un exo » from the panel: the question in the panel', !!c && (await until(() => page.evaluate(q => (document.querySelector('.ex-question') || {}).textContent === q, c.q))), String(c && c.q));
  act('exos.nouveau', { mode: 'table', table: 7 });
  c = await until(() => { const x = cur(); return x && x.mode === 'table' ? x : null; });
  await until(() => page.evaluate(q => (document.querySelector('.ex-question') || {}).textContent === q, c.q));
  const right = prod(c.q), wrong = c.choices.find(x => x !== right);
  await page.evaluate(w => { const b = [...document.querySelectorAll('.ex-choices button')].find(x => x.textContent === w); b.click(); b.click(); }, wrong);   // two quick taps
  const hint = await until(() => page.evaluate(() => { const h = document.querySelector('.ex-hint'), w = document.querySelector('.ex-choices button.wrong'); return h && w && w.disabled ? h.textContent : ''; }));
  await wait(300);
  check('two quick taps on a wrong choice: crossed out, and the hint (not the correction)', !!hint && hint.startsWith('Indice : ') && cur().etat === 'question' && cur().faux.length === 1, hint);
  await shot(page, 'phone-hint', '#exos');
  for (const d of right) await page.locator('.ex-pad button', { hasText: new RegExp(`^${d}$`) }).click();
  const typed = await page.textContent('#exTyped');
  await page.click('.ex-pad button.ok');
  const ok = await until(() => page.evaluate(() => !!document.querySelector('.ex-result.ok')));
  check('the keypad: the number typed, OK: right, with the correction', typed === right && ok && cur().ok, typed);
  await shot(page, 'phone-right', '#exos');
  const small = await page.evaluate(() => [...document.querySelectorAll('#exos button')].filter(b => b.offsetParent).map(b => [b.textContent, Math.round(b.getBoundingClientRect().height)]).filter(([, h]) => h < 56));
  check('touch targets of 56 px at least in the panel', small.length === 0, JSON.stringify(small.slice(0, 4)));
  act('exos.stop'); await until(() => !cur());
  // a negative answer: the keypad's − key
  for (let i = 0; i < 30; i++) { c = await open({ kind: 'comparaison', niveau: 5 }); if (c && c.choices.some(x => /^−\d+$/.test(x))) break; }
  const neg = c.choices.find(x => /^−\d+$/.test(x));
  await until(() => page.evaluate(id => !!document.querySelector('.ex-pad button.neg'), c.id));
  await page.click('.ex-pad button.neg');
  for (const d of neg.slice(1)) await page.locator('.ex-pad button', { hasText: new RegExp(`^${d}$`) }).click();
  const typedNeg = await page.textContent('#exTyped');
  await page.click('.ex-pad button.ok');
  const rn = await until(() => { const x = cur(); return x && x.id === c.id && (x.tries === 1 || x.etat === 'resultat') ? x : null; });
  check(`a negative answer on the keypad: − then the digits (« ${typedNeg} »)`, typedNeg === neg && !!rn && (rn.faux[0] === neg || rn.valeur === neg), JSON.stringify(rn));
  await shot(page, 'phone-negatif', '#exos');
  // the challenge's clock stops with the panel
  c = await open({ mode: 'chrono', kind: 'addition', niveau: 1 });
  await until(() => page.evaluate(() => !!document.querySelector('.ex-left') && /\d+ s/.test(document.querySelector('.ex-left').textContent)));
  await page.click('#exos .ex-x');
  const l0 = await page.textContent('.ex-left');
  await wait(1600);
  const l1 = await page.textContent('.ex-left');
  check('the panel closed: the challenge’s clock stops there (it starts again when it opens)', l0 === l1, `${l0} → ${l1}`);
  await page.click('.exos-go');
  await until(() => page.isVisible('#exos .ex-left'));
  act('exos.stop'); await until(() => !cur());
  await until(() => page.isVisible('.ex-set summary'));
  await page.click('.ex-scores summary'); await page.click('.ex-set summary');
  await page.locator('.ex-set .ex-seg button', { hasText: /^4$/ }).click();
  await until(() => S.exos.reglages.niveau === 4);
  await page.locator('.ex-set .ex-row', { hasText: 'propose' }).locator('button').click();
  const g = await until(() => (S.exos.reglages.propose ? S.exos.reglages : null));
  check('settings from the panel: the start level, his offers switched on', g && g.niveau === 4 && g.propose === true, JSON.stringify(S.exos.reglages));
  check('the scores in the panel', /En tout/.test(await page.textContent('.ex-scores')) && (await page.$$('.ex-troph li.got')).length >= 1);
  await shot(page, 'phone-scores', '#exos');
  await page.fill('#cmd', 'table de 8'); await page.press('#cmd', 'Enter');
  c = await until(() => { const x = cur(); return x && x.table === 8 ? x : null; });
  await page.fill('#cmd', prod(c && c.q) || '0'); await page.press('#cmd', 'Enter');
  const viaCmd = await until(() => { const x = cur(); return x && x.etat === 'resultat' ? x : null; });
  check('the command bar: « table de 8 », then the number typed answers it', !!viaCmd && viaCmd.ok && S.chat.messages.every(m => m.text !== prod(c.q)));
  act('exos.stop'); act('exos.reglages', { propose: false, niveau: 2 });
  check('the phone: no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
  PAGE = null;
}

async function lab(browser) {                                       // Pixel Lab: demo-hub.js mirrors pixel/exos.py
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }), errs = errors(page);
  await page.goto(BASE + '/app/lab/index.html');
  await until(() => page.evaluate(() => !!window.PixelHub && !!PixelHub.S.exos && !!window.PixelExos), 9000);
  const r = await page.evaluate(() => {
    const H = PixelHub, E = () => H.S.exos, C = () => E().cur, out = {}, mul = q => { const m = /(\d+) × (\d+)/.exec(q); return String(+m[1] * +m[2]); };
    H.dispatch('exos.nouveau', { kind: 'table', niveau: 2 });
    let c = C(); const w = c.choices.find(x => x !== mul(c.q));
    H.dispatch('exos.repondre', { value: w, id: c.id }); H.dispatch('exos.repondre', { value: w, id: c.id });
    out.double = C().etat === 'question' && C().tries === 1;
    H.dispatch('exos.repondre', { value: mul(c.q), id: c.id - 1 });
    out.stale = C().etat === 'question';
    H.dispatch('exos.repondre', { value: mul(c.q), id: c.id });
    H.dispatch('cmd', { text: '12' });
    out.during = C().etat === 'resultat' && H.S.screen === 'visage' && /fini/.test(H.S.toast.msg);
    H.dispatch('cmd', { text: 'stop exo' });
    H.dispatch('cmd', { text: 'une autre' });
    out.autre = C() === null;
    H.dispatch('exos.nouveau', { kind: 'addition', niveau: 5 });
    c = C(); const m = /^([\d\s]+) \+ ([\d\s]+) =/.exec(c.q), v = +m[1].replace(/\s/g, '') + +m[2].replace(/\s/g, '') + 100;
    const typed = `${Math.floor(v / 1000)} ${String(v % 1000).padStart(3, '0')}`;
    H.dispatch('cmd', { text: typed });
    out.mille = C() && C().tries === 1 && C().faux.length === 1;
    H.dispatch('exos.stop');
    return out;
  });
  check('Pixel Lab: a double answer gives the hint only; an answer naming another exercise is ignored', r.double && r.stale, JSON.stringify(r));
  check('Pixel Lab: a number during the correction stays with the exercise; « une autre » after « stop exo » is not an exercise', r.during && r.autre, JSON.stringify(r));
  check('Pixel Lab: « 4 025 » the French way answers the exercise', r.mille, JSON.stringify(r));
  check('Pixel Lab: no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
  await page.close();
}

(async () => {
  if (await portOpen()) throw new Error(`le port ${PORT} est déjà pris (EXOS_PORT=… pour un autre)`);
  srv = spawn('python3', [path.join(APP, 'server.py'), '--demo', '--port', String(PORT), '--host', '127.0.0.1', '--config', cfg], { cwd: APP, stdio: 'ignore' });
  if (!(await until(portOpen, 15000))) throw new Error('le serveur de démo ne démarre pas');
  hub = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  hub.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'state') S = m.data; };
  await until(() => hub.readyState === 1 && S, 5000);
  const browser = await chromium.launch();
  try {
    await kiosk(browser);
    await phone(browser);
    await lab(browser);
  } finally {
    await browser.close(); hub.close(); srv.kill('SIGTERM');
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`\n${fails} failure(s)`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); if (srv) srv.kill('SIGTERM'); process.exit(1); });
