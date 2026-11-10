// The three customisations together, in Chromium: his character (web/caractere.js), feeding him (web/nourrir.js) and the math
// exercises (web/exos.js), on a demo server (port 8192, or PERSO_PORT; a temporary data folder, every theme on).
//   node tests/test_perso.js [--shots DIR]
// - the Pi's screen (800x480): who comes first over his face (the quick menu, over everything, a cast too > a cast > an open
//   exercise > its offer « Une petite question ? » > the food tray and its plate), each giving way and coming back; the nudge
//   « Tu réfléchis ? » counts only the time the question shows; studieux and his offers and cheers;
//   gourmand and the weights of the food scenes, his words after a meal; the character's weights on the nourrir-, exo- and
//   poche- scenes, exactly 1 at 50;
// - the Pixel de poche (a phone held sideways): the same character, the plate, and the plate gone under an exercise;
// - the phone (390x844): Caractère, Nourrir and Exos side by side under the keys, each opens its own panel, none in « Pixel »;
// - Pixel Lab: the three panels, the same commands as the server in the same order (one list of phrases for the exercises
//   through both: Pixel sans Pi runs the lab's), grognon refusing, no errors.
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');

const APP = path.join(__dirname, '..'), PORT = Number(process.env.PERSO_PORT) || 8192, BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = (i => (i >= 0 ? process.argv[i + 1] : null))(process.argv.indexOf('--shots'));
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (name, ok, info = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (!ok && info ? `  [${info}]` : '')); if (!ok) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 6000, step = 80) => { const end = Date.now() + ms; let v; while (Date.now() < end) { if ((v = await fn())) return v; await wait(step); } return v; };
const portOpen = () => new Promise(r => { const s = net.connect(PORT, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
const THEMES = ['retro', 'moderne', 'manga', 'neon', 'croquis', 'lcd'];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-perso-')), cfg = path.join(tmp, 'config.toml');
fs.writeFileSync(cfg, `data_dir = "${tmp}"\n[ui]\nthemes = ${JSON.stringify(THEMES)}\n`);
let srv = null, hub = null, S = null;
const act = (action, args = {}) => hub.send(JSON.stringify({ action, args }));
const errors = page => {
  const e = [];
  page.on('pageerror', x => e.push('pageerror: ' + x.message));
  page.on('console', m => { if (m.type() === 'error' && !/\/pixel\.apk$/.test(m.location().url || '')) e.push('console.error: ' + m.text()); });
  return e;
};
async function tap(page, x, y) { const r = await page.locator('#crt').boundingBox(); await page.mouse.click(r.x + x / 800 * r.width, r.y + y / 480 * r.height); }
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
const free = page => page.evaluate(() => { Screens.persona.stop(); Screens.local.local = null; Screens.local.pack = null; Screens.local.lastInput = performance.now(); Screens.local.sleepy = false; });
async function character(page, args, want) {                     // the server changes him; the page lives by it
  act('caractere.set', args);
  return until(() => page.evaluate(w => Object.entries(w).every(([k, v]) => Screens.persona.traits[k] === v), want), 5000);
}
async function exercise(page, args = { mode: 'exo', kind: 'addition', niveau: 1 }) {
  const before = S.exos && S.exos.cur ? S.exos.cur.id : -1;
  act('exos.nouveau', args);
  return until(() => page.evaluate(b => !!PixelExos.state && !!PixelExos.state.cur && PixelExos.state.cur.id !== b && PixelExos.state.cur.etat === 'question', before), 5000);
}
async function noExercise(page) { act('exos.stop'); return until(() => page.evaluate(() => !PixelExos.open), 5000); }
const GOURMAND = { plus: ['Encore ! Il en reste ?', 'Déjà fini ? Encore !', 'Miam ! Et le dessert ?'], moins: ['Merci, ça me suffit.', 'Juste ce qu’il faut.', 'Une bouchée, c’est assez.'],
  base: ['Miam ! Merci !', 'C’était bon !', 'Merci !'] };

async function kiosk(browser) {
  const kc = await browser.newContext({ viewport: { width: 800, height: 480 }, deviceScaleFactor: 1, hasTouch: true });
  const k = await kc.newPage(), kErr = errors(k);
  await k.goto(BASE + '/?kiosk=1');
  await until(() => k.evaluate(() => !!window.PixelExos && !!window.PixelNourrir && !!window.PixelCaractere && Screens.local.lastBootAt > 0 && Screens.local.boot < 0), 15000);
  await free(k);

  /* ---- studieux: his offers « Une petite question ? » and his cheers (web/exos.js canPropose, web/scenes/exos.js exo-feu) ---- */
  act('exos.reglages', { propose: true });
  await until(() => S.exos && S.exos.reglages.propose);
  await until(() => k.evaluate(() => PixelExos.state && PixelExos.state.reglages.propose));
  const offers = () => k.evaluate(() => { let n = 0; for (let i = 0; i < 4000; i++) n += PixelExos.canPropose({ day: true }) ? 1 : 0; return n / 4000; });
  const cheers = () => k.evaluate(() => {
    const P = Screens.persona; let n = 0;
    for (let i = 0; i < 300; i++) { P.stop(); if (P.event('exo-juste', { essai: 1 }, { force: true }) === 'exo-feu') n++; }
    P.stop(); return n / 300;
  });
  await character(k, { traits: { studieux: 95 } }, { studieux: 95 }); const oHi = await offers(), cHi = await cheers();
  await character(k, { preset: 'pixel' }, { studieux: 50 }); const oMid = await offers(), cMid = await cheers();
  await character(k, { traits: { studieux: 5 } }, { studieux: 5 }); const oLo = await offers(), cLo = await cheers();
  check('studieux: he offers a question more often (at 95, at 50, at 5)', oHi > 0.9 && oMid > 0.55 && oMid < 0.7 && oLo < 0.36 && oHi > oMid && oMid > oLo, `${oHi} ${oMid} ${oLo}`);
  check('…and cheers bigger when you are right (the fireworks)', cHi > cMid && cMid > cLo && cHi > 0.2, `${cHi} ${cMid} ${cLo}`);

  /* ---- his character's weights on the three features' scenes, and on the Pixel de poche's ---- */
  await character(k, { preset: 'pixel' }, { gourmand: 50, studieux: 50 });
  const ids = await k.evaluate(() => Screens.persona.scenes.map(s => s.id).filter(i => /^(nourrir|exo|poche|caractere)-/.test(i)));
  const at50 = await k.evaluate(list => list.filter(i => Math.abs(Screens.persona.affinity(i) - 1) > 1e-9), ids);
  const carOnly = await k.evaluate(() => Screens.persona.scenes.filter(s => s.id.startsWith('caractere-')).map(s => s.id));
  check(`at 50 everywhere every scene of the three features and of the Pixel de poche weighs as before (${ids.length} scenes)`,
    ids.length > 40 && at50.every(i => carOnly.includes(i)), at50.filter(i => !carOnly.includes(i)).join(', '));
  const prof = await k.evaluate(() => ({ creux: Screens.persona.profile('nourrir-creux'), envie: Screens.persona.profile('exo-envie'), poche: Screens.persona.scenes.filter(s => s.id.startsWith('poche-')).map(s => [s.id, Screens.persona.profile(s.id)]).filter(([, p]) => Object.keys(p).length).length }));
  check('his profiles: a hungry moment is gourmand, his offer of a question studieux, the Pixel de poche\'s scenes have theirs', prof.creux.gourmand > 0 && prof.envie.studieux > 0 && prof.poche >= 3, JSON.stringify(prof));
  const w = async () => k.evaluate(() => ({ creux: Screens.persona.weight('nourrir-creux'), affame: Screens.persona.weight('nourrir-affame'), envie: Screens.persona.weight('exo-envie') }));
  const w50 = await w();
  await character(k, { preset: 'gourmand' }, { gourmand: 95 }); const wG = await w();
  await character(k, { traits: { gourmand: 5, studieux: 95 } }, { gourmand: 5, studieux: 95 }); const wP = await w();
  check('gourmand: he thinks of food more often (his hungry moments weigh more), a small eater less; studieux: more offers',
    wG.creux > w50.creux * 2 && wP.creux < w50.creux / 2 && wG.affame > w50.affame && wP.envie > w50.envie * 2, JSON.stringify({ w50, wG, wP }));
  const pocheW = await k.evaluate(() => {
    const P = Screens.persona, list = P.scenes.filter(s => s.id.startsWith('poche-')).map(s => s.id); return list.filter(i => Math.abs(P.affinity(i) - 1) > 0.05).length;
  });
  check('…and a character moves the Pixel de poche\'s scenes too', pocheW >= 1, String(pocheW));

  /* ---- after a meal, his words follow his appetite (web/scenes/nourrir.js); web/nourrir.js gives him the trait ---- */
  const said = async g => {
    await free(k);
    await k.evaluate(gg => Screens.persona.event('nourrir-repas', { plat: 'pomme', reaction: 'miam', rot: false, gourmand: gg }, { force: true }), g);
    return until(async () => { const s = await k.evaluate(() => Screens.persona.state.say); return [...GOURMAND.plus, ...GOURMAND.moins, ...GOURMAND.base].includes(s) ? s : null; }, 6000, 100);
  };
  const sHi = await said(95), sLo = await said(5), sMid = await said(50);
  check('after a meal, a glutton asks for more, a small eater has had enough, the Pixel of every day says thanks',
    GOURMAND.plus.includes(sHi) && GOURMAND.moins.includes(sLo) && GOURMAND.base.includes(sMid), `${sHi} | ${sLo} | ${sMid}`);
  await character(k, { preset: 'gourmand' }, { gourmand: 95 });
  await k.evaluate(() => { window.__meals = []; const e0 = Screens.event; Screens.event = (n, d, f) => { if (n === 'nourrir-repas') window.__meals.push(d); return e0(n, d, f); }; });
  act('nourrir.donner', { plat: 'pomme' });
  const meal = await until(() => k.evaluate(() => window.__meals[0] || null), 5000);
  check('a real meal: his screen hands his scene the gourmand trait of the moment (95)', !!meal && meal.gourmand === 95, JSON.stringify(meal));
  await wait(400); await shot(k, 'kiosk-gourmand-meal');
  await character(k, { preset: 'pixel' }, { gourmand: 50, studieux: 50 });

  /* ---- who comes first over his face: quick menu > cast > exercise > its offer > food tray ---- */
  await free(k);
  await until(() => k.evaluate(() => PixelNourrir.shown), 4000);
  check('nothing else: the plate is on his face screen', await k.evaluate(() => PixelNourrir.shown && !PixelNourrir.trayOpen));
  await k.evaluate(() => PixelNourrir.open()); await wait(400);
  check('the food tray open: no offer of a question over it', await k.evaluate(() => PixelNourrir.trayOpen && !PixelExos.canPropose({ day: true })));
  await shot(k, 'kiosk-retro-tray');
  await exercise(k); await wait(400);
  check('an exercise opens: the tray goes away, the plate too', await k.evaluate(() => PixelExos.open && !PixelNourrir.trayOpen && !PixelNourrir.shown));
  check('…the tray cannot open (a touch, a swipe up) while it is open', await k.evaluate(() => !PixelNourrir.open() && !PixelNourrir.swipe(-200, 470) && !PixelNourrir.trayOpen));
  check('…and no food hint interrupts it', await k.evaluate(() => PixelNourrir.hint(2) === ''));
  await shot(k, 'kiosk-retro-exercise');
  act('theme.set', { name: 'lcd' }); await until(() => k.evaluate(() => Screens.local.theme === 'lcd')); await wait(500);
  await shot(k, 'kiosk-lcd-exercise');
  // the quick menu over the exercise: on top, the exercise waits under it
  await k.evaluate(() => { Screens.local.inputAt = performance.now(); Screens.menu(true); }); await wait(400);   // as a swipe down opens it
  check('the quick menu opens over an exercise, and the exercise waits under it', await k.evaluate(() => Screens.menuOpen && PixelExos.open && !PixelNourrir.shown));
  await shot(k, 'kiosk-lcd-menu-over-exercise');
  await k.evaluate(() => Screens.menu(false)); await wait(300);
  // a cast (pixel/cast.py: « Caster sur Pixel », here a text) comes before all of it: drawn instead of the exercise and the plate
  act('cast.text', { text: 'Coucou Pixel' });
  const casting = await until(() => k.evaluate(() => Screens.casting && Screens.cast.id && Screens.cast.kind === 'text'), 5000); await wait(300);
  const c0 = S.exos.cur, mark = () => JSON.stringify(S.exos.cur && [S.exos.cur.id, S.exos.cur.etat, S.exos.cur.faux, S.exos.cur.tries]), m0 = mark();
  check('a cast over everything: the exercise stays open under it, no plate, no tray, no offer, no food hint',
    !!casting && !!c0 && await k.evaluate(() => PixelExos.open && !PixelNourrir.shown && !PixelNourrir.open() && !PixelNourrir.swipe(-200, 470)
      && !PixelExos.canPropose({ day: true }) && PixelNourrir.hint(2) === ''));
  await shot(k, 'kiosk-lcd-cast-over-exercise');
  await k.evaluate(() => { Screens.local.inputAt = performance.now(); Screens.menu(true); }); await wait(400);   // the quick menu: over the cast too
  check('the quick menu opens over a cast, which stays on (and the exercise under both)', await k.evaluate(() => Screens.menuOpen && Screens.casting && PixelExos.open) && !!S.cast);
  await shot(k, 'kiosk-lcd-menu-over-cast');
  await k.evaluate(() => Screens.menu(false)); await wait(300);
  await k.keyboard.press('1'); await wait(200);
  check('…its keys are off: a digit does not go to the hidden exercise', await k.evaluate(() => PixelExos.buffer === '') && mark() === m0 && !!S.cast, `${m0} -> ${mark()}`);
  await k.evaluate(() => { const i = document.getElementById('cmd'); if (i) { i.value = ''; i.blur(); } });   // the digit went to the command bar instead
  const choice = await k.evaluate(() => { const b = PixelExos.layout.choices[0]; return [b.x + b.w / 2, b.y + b.h / 2]; });
  await tap(k, ...choice);
  await until(() => !S.cast, 4000); await wait(300);
  check('…a touch on its answers does not answer it: it ends the cast (a touch anywhere), the exercise is back as it was',
    mark() === m0 && !S.cast && await k.evaluate(() => !Screens.casting && PixelExos.open), `${m0} -> ${mark()}, cast ${JSON.stringify(S.cast)}`);
  await wait(700);
  await tap(k, ...choice);
  await until(() => mark() !== m0, 3000);
  check('…the cast over, the exercise is back and its answers answer again', mark() !== m0, `${m0} -> ${mark()}`);
  // the nudge « Tu réfléchis ? » after 40 s on a question (web/exos.js): the time under a cast does not count
  await exercise(k); await k.evaluate(() => Screens.persona.stop()); await wait(300);
  act('cast.text', { text: 'Un instant' });
  await until(() => k.evaluate(() => Screens.casting), 5000); await wait(2500);
  act('cast.stop');
  await until(() => k.evaluate(() => !Screens.casting), 5000); await wait(300);
  const nudged = ago => k.evaluate(async t0 => {             // as if the question had opened earlier, whatever snapshot comes
    Screens.persona.stop();
    for (let i = 0; i < 16; i++) {
      const c = PixelExos.state.cur; if (c) c.t0 = Math.min(c.t0, t0); Screens.local.dirty = true;
      await new Promise(r => setTimeout(r, 50)); if (Screens.persona.state.cur === 'exo-attente') return true;
    }
    return false;
  }, S.exos.cur.t0 - ago);
  check('after a cast of about 3 s, a question opened 41 s ago that showed about 38 s: no « Tu réfléchis ? » yet', !(await nudged(37500)));
  check('…once it has shown for 40 s, he asks', await nudged(41500));
  await noExercise(k); await free(k);
  await until(() => k.evaluate(() => PixelNourrir.shown), 4000);
  check('the exercise put away: the plate is back', await k.evaluate(() => PixelNourrir.shown));
  // his offer: the plate waits for it
  await k.evaluate(() => Screens.persona.play('exo-envie')); await wait(1900);
  check('his offer « Une petite question ? »: the plate waits under it', await k.evaluate(() => PixelExos.offering && !PixelNourrir.shown && !PixelNourrir.open()));
  await shot(k, 'kiosk-lcd-offer');
  await free(k); await wait(300);
  check('…and comes back after it', await k.evaluate(() => !PixelExos.offering && PixelNourrir.shown));
  // a change of character during an exercise: he takes it in his small face, the exercise stays
  act('theme.set', { name: 'neon' }); await until(() => k.evaluate(() => Screens.local.theme === 'neon'));
  await exercise(k, { mode: 'table', table: 7 });
  await character(k, { preset: 'grognon' }, { grognon: 92 }); await wait(900);
  check('a change of character during an exercise: the exercise stays on his screen', await k.evaluate(() => PixelExos.open && Screens.local.scr === 'visage'));
  await shot(k, 'kiosk-neon-exercise-grognon');
  await noExercise(k);
  act('theme.set', { name: 'retro' }); await until(() => k.evaluate(() => Screens.local.theme === 'retro'));
  await character(k, { preset: 'pixel' }, { grognon: 50 });
  check('the Pi\'s screen: no page or console errors', kErr.length === 0, kErr.slice(0, 3).join(' | '));
  await kc.close();
}

async function poche(browser) {
  const qc = await browser.newContext({ ...devices['Pixel 7 landscape'] });
  const q = await qc.newPage(), qErr = errors(q);
  await q.goto(BASE + '/'); await until(() => q.evaluate(() => !!window.PixelPoche && PixelPoche.on && !!window.PixelExos), 8000); await q.waitForTimeout(600);
  await free(q);
  const ok = await character(q, { preset: 'farceur' }, { farceur: 92 });
  check('the Pixel de poche lives by the same character (farceur 92)', !!ok);
  await until(() => q.evaluate(() => PixelNourrir.shown), 4000);
  check('…its plate is there', await q.evaluate(() => PixelNourrir.shown));
  await exercise(q); await wait(500);
  check('…and gives way to an exercise there too', await q.evaluate(() => PixelExos.open && !PixelNourrir.shown));
  await shot(q, 'poche-exercise');
  await noExercise(q);
  await character(q, { preset: 'pixel' }, { farceur: 50 });
  check('the Pixel de poche: no page or console errors', qErr.length === 0, qErr.slice(0, 3).join(' | '));
  await qc.close();
}

async function phone(browser) {
  const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await pc.newPage(), pErr = errors(p);
  await p.goto(BASE + '/'); await until(() => p.evaluate(() => !!document.querySelector('.exos-go') && !!document.querySelector('.nour-go')), 8000);
  await p.evaluate(() => { const a = document.getElementById('apk'); if (a) a.hidden = false; });   // as when the Android app is there
  const order = await p.evaluate(() => [...document.querySelector('.kfoot > span').children].filter(e => !e.hidden).map(e => e.textContent.trim()));
  const i = n => order.indexOf(n);
  const want = ['Agendas', 'Caractère', 'Son look', 'Nourrir', 'Exos', 'Souvenirs', 'Album', 'Amis', 'Appli Android'];   // app.js FOOT_ORDER
  check('under the keys, side by side in this order: ' + want.join(', '), i('Agendas') >= 0 && want.every((n, k) => i(n) === i('Agendas') + k), order.join(' · '));
  await p.evaluate(() => { const a = document.getElementById('apk'); if (a) a.hidden = true; });
  check('…each once', ['Caractère', 'Nourrir', 'Exos'].every(n => order.filter(x => x === n).length === 1), order.join(' · '));
  await shot(p, 'phone-buttons');
  const vis = sel => p.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; }, sel);
  await p.click('.exos-go'); await wait(400);
  check('« Exos » opens its panel', await vis('#exos'));
  await p.click('.nour-go'); await wait(500);
  check('« Nourrir » opens its sheet over it', await vis('.nour-sheet') || await vis('#nour'));
  await shot(p, 'phone-nourrir');
  await p.click('.nour-x'); await wait(400);
  await p.click('button:text-is("Caractère")'); await wait(500);
  check('« Caractère » opens its sheet', await vis('.car-sheet'));
  await shot(p, 'phone-caractere');
  await p.keyboard.press('Escape'); await wait(300);
  if (await vis('.car-sheet')) await p.click('.car-sheet button[aria-label^="Fermer"]').catch(() => {});
  await wait(300);
  await p.click('button[data-mode="pixel"]'); await wait(400);
  check('in « Pixel » mode none of the three shows (the keys and their panels hide)', !(await vis('.exos-go')) && !(await vis('#exos')) && !(await vis('.nour-go')), '');
  await p.click('button[data-mode="both"]'); await wait(300);
  await p.evaluate(() => PixelExos.panel(false));
  check('the phone: no page or console errors', pErr.length === 0, pErr.slice(0, 3).join(' | '));
  await pc.close();
}

async function lab(browser) {
  const lc = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const l = await lc.newPage(), lErr = errors(l);
  await l.goto(BASE + '/app/lab/index.html?themes=all');
  await until(() => l.evaluate(() => !!window.PixelLab && !!document.getElementById('hCaractere') && !!document.getElementById('hNourrir') && !!document.getElementById('hExos')), 10000);
  const order = await l.evaluate(() => [...document.querySelectorAll('#panel > section h2')].map(h => h.id));
  const at = order.indexOf('hPerso');
  check('Pixel Lab: the panels side by side, Personnalité, Caractère, Nourrir, Exos de maths', at >= 0 && order.slice(at, at + 4).join() === 'hPerso,hCaractere,hNourrir,hExos', order.join(','));
  // the same commands as the server, in the same order
  const run = text => l.evaluate(t => {
    const H = PixelHub, S0 = JSON.parse(JSON.stringify({ c: H.S.caractere, n: H.S.nourrir && H.S.nourrir.dernier, e: H.S.exos && H.S.exos.cur, sc: H.S.scene }));
    const asked = H.S.chat && H.S.chat.log ? H.S.chat.log.length : 0;
    const d0 = H.dispatch, seen = []; H.dispatch = (a, x) => { seen.push(a); return d0.call(H, a, x); };
    try { H.dispatch('cmd', { text: t }); } finally { H.dispatch = d0; }
    const S1 = H.S;
    if (JSON.stringify(S1.caractere) !== JSON.stringify(S0.c) && S1.caractere.change) return 'caractere';
    if (JSON.stringify(S1.nourrir && S1.nourrir.dernier) !== JSON.stringify(S0.n)) return 'meal';
    if (JSON.stringify(S1.exos && S1.exos.cur) !== JSON.stringify(S0.e)) return 'exos';
    if (S1.chat && S1.chat.log && S1.chat.log.length !== asked) return 'claude';
    if (/^nourrir-/.test((S1.scene || {}).id || '') || (window.Screens && /^nourrir-/.test(Screens.persona.state.cur))) return 'scene';
    return S1.chat && S1.chat.phase !== 'idle' ? 'claude' : 'other';
  }, text);
  const cases = [['sois gourmand', 'caractere'], ['plus studieux', 'caractere'], ['mange une pomme', 'meal'], ['exo', 'exos'], ['42', null], ['sois grognon', 'caractere'],
    ['stop', 'exos'], ['table de 7', 'exos'], ['stop', 'exos'], ['à table !', 'meal'], ['fais-le manger', 'meal'], ['pizza', 'claude'], ['fais un exo de maths', 'claude']];
  const bad = [];
  for (const [text, want] of cases) {
    if (want === 'meal') await l.evaluate(() => PixelHub.dispatch('lab.nourrir', { ventre: 30 }));
    if (want === 'meal') await wait(6100);                          // one meal every 6 s, as on the server
    const got = await run(text);
    if (want && got !== want) bad.push(`${text}: ${got} (${want})`);
  }
  check('Pixel Lab: the commands go where they go on the server (his character, his meals, the exercises, Claude)', bad.length === 0, bad.join(' | '));
  /* the exercises' words, an exercise open: one list through the server (commands.run) and through the lab (its command(),
     which Pixel sans Pi runs too): the same outcome. A mixed exercise's kind is drawn by lot: only its mode is compared. */
  const MIXED = ['exo difficile', 'exo très difficile', 'exo simple', 'un exercice de maths', 'exo de mathématiques', 'une petite question de maths', 'un petit calcul', 'défi de maths', 'mon défi'];
  const PHRASES = ['termine', 'j\'arrête', 'on arrête', 'fini', 'stop', 'mes exos', 'mes statistiques', 'mes scores', 'aide-moi', 'help', 'indice', 'je sais pas',
    'passe', 'joker', 'suivante', 'encore', 'révisons la table de 7', 'révise la table de 8', 'la table de 9', 'les tables de 3', 'un défi chrono', 'une énigme logique',
    'des devinettes', 'calcul mental', '10 questions', 'série de 3 calculs', 'exos sur les fractions', 'exo avec des additions', 'un exo de calcul mental',
    'exo de fractions facile', 'stop les exos', 'arrête les exercices', 'la réponse est 4', '= 4', 'pizza', ...MIXED];
  const outcome = (c0, c, toast0, toast1, scr, mixed) => (scr === 'claude' ? 'claude' : !c ? 'stop'
    : c.id !== c0.id ? `new:${c.mode}/${c.mode === 'table' ? c.table : c.mode === 'serie' ? c.n : c.mode === 'exo' && !mixed ? c.kind : ''}`
    : c.hint && !c0.hint ? 'hint' : c.etat !== c0.etat || c.tries !== c0.tries ? 'answer' : toast1 !== toast0 ? 'toast' : 'none');
  const onServer = {}, inLab = {};
  for (const ph of PHRASES) {
    const before = S.exos.cur ? S.exos.cur.id : -1;
    act('exos.nouveau', { mode: 'exo', kind: 'addition', niveau: 1 });
    await until(() => S.exos.cur && S.exos.cur.id !== before && S.exos.cur.etat === 'question' && S.screen === 'visage', 3000, 30);
    const c0 = S.exos.cur, t0 = (S.toast || {}).id, sent = Date.now();
    act('cmd', { text: ph });
    await until(() => S.act && S.act.t0 >= sent - 5, 3000, 30); await wait(150);
    onServer[ph] = outcome(c0, S.exos.cur, t0, (S.toast || {}).id, S.screen, MIXED.includes(ph));
  }
  act('exos.stop');
  for (const ph of PHRASES) {
    inLab[ph] = await l.evaluate(async ([text, mixed, src]) => {
      const H = PixelHub, S = H.S, outcome = new Function('return ' + src)();   // the same outcome() as above
      for (let i = 0; i < 100 && H.busy().chat; i++) await new Promise(r => setTimeout(r, 50));
      H.dispatch('exos.nouveau', { mode: 'exo', kind: 'addition', niveau: 1 }); S.screen = 'visage';
      const c0 = JSON.parse(JSON.stringify(S.exos.cur)), t0 = (S.toast || {}).id;
      H.dispatch('cmd', { text });
      return outcome(c0, S.exos.cur, t0, (S.toast || {}).id, S.screen, mixed);
    }, [ph, MIXED.includes(ph), outcome.toString()]).catch(e => 'error: ' + e.message);
  }
  const took = (p, o) => (/\d/.test(p) && (o === 'hint' || o === 'answer') ? 'answered' : o);   // « = 4 »: right or wrong depends on the addition drawn (4 at times)
  const differ = PHRASES.filter(p => took(p, onServer[p]) !== took(p, inLab[p])).map(p => `${p}: ${onServer[p]} / lab ${inLab[p]}`);
  check(`…an exercise open, the same ${PHRASES.length} phrases have the same outcome on the server and in the lab (stop, hint, scores, a table, a series…)`,
    differ.length === 0 && onServer.termine === 'stop' && onServer['aide-moi'] === 'hint' && onServer['révisons la table de 7'] === 'new:table/7'
    && onServer['calcul mental'] === 'new:exo/mental' && onServer['10 questions'] === 'new:serie/10' && onServer.pizza === 'claude', differ.join(' | ') || JSON.stringify(onServer));
  await l.evaluate(() => PixelHub.dispatch('exos.stop'));
  const refused = await l.evaluate(async () => {
    const H = PixelHub; H.dispatch('caractere.set', { preset: 'grognon' }); H.dispatch('lab.nourrir', { ventre: 30 });
    const hate = H.S.nourrir.gouts.deteste[0]; await new Promise(r => setTimeout(r, 6100)); H.dispatch('nourrir.donner', { plat: hate });
    const r = H.S.nourrir.dernier.reaction; H.dispatch('caractere.set', { preset: 'pixel' }); return r;
  });
  check('Pixel Lab: a grumpy Pixel refuses what he dislikes, as on the server', refused === 'refuse', refused);
  await l.evaluate(() => PixelHub.dispatch('exos.stop'));
  await shot(l, 'lab-desktop');
  for (const id of ['caractere', 'hNourrir', 'hExos']) {
    await l.evaluate(i => { const e = document.getElementById(i); (e.closest('section') || e).scrollIntoView({ block: 'start' }); }, id); await wait(300);
    await shot(l, `lab-panel-${id}`);
  }
  check('Pixel Lab: no page or console errors', lErr.length === 0, lErr.slice(0, 3).join(' | '));
  await lc.close();
}

(async () => {
  if (await portOpen()) throw new Error(`le port ${PORT} est déjà pris (PERSO_PORT=… pour un autre)`);
  srv = spawn('python3', [path.join(APP, 'server.py'), '--demo', '--port', String(PORT), '--host', '127.0.0.1', '--config', cfg], { cwd: APP, stdio: 'ignore' });
  if (!(await until(portOpen, 15000))) throw new Error('le serveur de démo ne démarre pas');
  hub = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  hub.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'state') S = m.data; };
  await until(() => hub.readyState === 1 && S, 5000);
  check('the server\'s snapshot has the three: caractere, nourrir, exos', !!S.caractere && !!S.nourrir && !!S.exos, Object.keys(S).join(','));
  const browser = await chromium.launch();
  try {
    await kiosk(browser);
    await poche(browser);
    await phone(browser);
    await lab(browser);
  } finally {
    await browser.close();
    hub.close(); srv.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`\n${fails} failure(s)`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); if (srv) srv.kill(); process.exit(1); });
