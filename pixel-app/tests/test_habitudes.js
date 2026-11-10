// His habits in a real browser:  node tests/test_habitudes.js [--shots DIR]
// Starts a demo server (port 8420, or HABITUDES_PORT; a temporary data folder, every theme on, and a caractere.json whose old
// quiet hours, 22 h - 7 h, become his first schedule), then in Chromium (Playwright):
// - the Pi's screen (800x480, ?kiosk=1): each game end to end by touch (cache-cache in Rétro, pierre-feuille-ciseaux in
//   Moderne, Simon in LCD): the moves the server judges, his scene for each, the result, « Rejouer », « Fini », the × and
//   the result closing by itself; a cast comes first and an exercise opened since too (the game waits under them, then goes
//   on as it was); a swipe down still opens the quick menu over a game; Nourrir's tray waits; his offer « On joue à … ? »
//   (« Oui ! », « Plus tard »); every game drawn in the 6 themes;
// - his day (habitudes.demo simulates a time of day; the demo's clock is paused otherwise): bedtime (he yawns, brushes his
//   teeth, asks for his night-light, says goodnight), asleep (the night veil): a touch, he mumbles and sleeps on; petted,
//   he smiles in his sleep; the lights off: he sleeps on; no game at night (he says so), the world's news wait; his
//   quiet hours follow his schedule (Screens.persona.isNight: persona's quiet scenes, nourrir's hints); the morning: he
//   wakes up and stretches;
// - his laughs: a joke (its question, then its answer, in his bubbles), a grimace, a funny noise, the tickles (fast taps;
//   only if they make him laugh);
// - his fears: the storm (a soft flash, he hides; petting him comforts him: courage), the dark (every light off), the
//   spider (touch it: it climbs away), the void (the Pixel de poche tilted: held level again, he is comforted);
// - his phrases: taught (cleaned), he repeats it, then says it instead of his own line, a long one in two bubbles;
// - a phone (390x844): the « Habitudes » button with the others, the panel (his schedule, a refused one coming back, his nap,
//   the weekend, his favourites, his laughs, his fears, his phrases escaped and deleted, 56 px targets, nothing wider than
//   the phone), « Jouer » closes it and the game plays on the phone's own screen; cache-cache, pierre-feuille-ciseaux and
//   Simon end to end on the phone; attrape-étoiles played on the phone and on the Pi's screen at once (the same star twice
//   counts once) to its end; at night the panel says he sleeps, no « Jouer »; caractère's quiet hours lead to it;
//   PixelPanel('habitudes'), the back button (PixelSheet.close()); the Pixel de poche: tilted steeply, vertigo (held level
//   again, comforted); asleep at night, a long press is a cuddle in his sleep;
// - Pixel Lab (demo-hub.js and ../habitudes.js: the same rules in the page): a stand-in weather says orage, a thunder clap;
//   courage reaching 100 (he is not afraid any more); the typed commands; the lab's « Son heure » buttons;
// - Pixel sans Pi (the app's offline page, by the phone's own clock): awake at noon, asleep at 22 h, no fear of the dark
//   (no lights to know), the storm only once a forecast says so, no demo clock;
// - no page error anywhere.  --shots DIR: screenshots of each game and fear in several themes, his night, the panel.
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const APP = path.join(__dirname, '..'), PORT = Number(process.env.HABITUDES_PORT) || 8420, BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = (i => (i >= 0 ? process.argv[i + 1] : null))(process.argv.indexOf('--shots'));
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (name, ok, info = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (!ok && info ? `  [${info}]` : '')); if (!ok) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 6000, step = 80) => { const end = Date.now() + ms; let v; while (Date.now() < end) { if ((v = await fn())) return v; await wait(step); } return v; };
const portOpen = () => new Promise(r => { const s = net.connect(PORT, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
const THEMES = ['retro', 'moderne', 'manga', 'neon', 'croquis', 'lcd'];
const J = x => JSON.stringify(x);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-habitudes-')), cfg = path.join(tmp, 'config.toml');
fs.writeFileSync(cfg, `data_dir = "${tmp}"\n[ui]\nthemes = ${J(THEMES)}\n`);
fs.writeFileSync(path.join(tmp, 'caractere.json'), J({ calme: { de: 22, a: 7 } }));    // his old quiet hours: his first schedule
let srv = null, hub = null, S = null;
const act = (action, args = {}) => hub.send(J({ action, args }));
const H = () => (S && S.habitudes) || {};
const G = () => H().partie || null;
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
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
const scene = page => page.evaluate(() => Screens.persona.state.cur);
const free = page => page.evaluate(() => { Screens.persona.stop(); const L = Screens.local; L.local = null; L.pack = null; L.lastInput = performance.now(); });
const sceneIs = (page, re, ms = 4000) => until(async () => { const s = await scene(page); return re.test(s || '') ? s : null; }, ms, 50);
async function said(page, ms) {                                   // the lines he says during ms, in order
  const out = [], end = Date.now() + ms;
  while (Date.now() < end) { const s = await page.evaluate(() => Screens.persona.state.say); if (s && out[out.length - 1] !== s) out.push(s); await wait(90); }
  return out;
}
const drawn = page => page.evaluate(() => {                         // how many colours the canvas shows
  const c = document.getElementById('crt'), t = document.createElement('canvas'); t.width = 160; t.height = 96;
  const g = t.getContext('2d'); g.drawImage(c, 0, 0, 160, 96); const d = g.getImageData(0, 0, 160, 96).data, seen = new Set();
  for (let i = 0; i < d.length; i += 8) seen.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
  return seen.size;
});
const bright = page => page.evaluate(() => {                        // the mean brightness (0..255) around his face (not his night-light)
  const c = document.getElementById('crt'), t = document.createElement('canvas'); t.width = 96; t.height = 48;
  const g = t.getContext('2d'), k = c.width / 800; g.drawImage(c, 160 * k, 160 * k, 480 * k, 240 * k, 0, 0, 96, 48); const d = g.getImageData(0, 0, 96, 48).data; let s = 0;
  for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3;
  return s / (d.length / 4);
});
async function theme(page, th) { act('theme.set', { name: th }); await until(() => page.evaluate(t => Screens.local.theme === t, th)); await wait(150); }
async function touchSwipe(cdp, x0, y0, x1, y1) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 6, y: y0 + (y1 - y0) * i / 6 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function rub(page, x = 400, y = 240) {                       // petting: a finger rubbing his face
  const a = await at(page, x - 130, y), b = await at(page, x + 130, y);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  for (let i = 0; i < 14; i++) await page.mouse.move(i % 2 ? a.x : b.x, a.y + (i % 3) * 4, { steps: 4 });
  await page.mouse.up();
}

/* ---------- the games, played by touch on a page (the Pi's screen, or the phone's own) ---------- */
async function start(page, jeu, args = {}) {                     // a game the server starts, once the page has it
  const before = G() ? G().id : -1;
  act('habitudes.jouer', { jeu, ...args });
  const g = await until(() => G() && G().id !== before && G().jeu === jeu && G());
  if (g) await until(() => page.evaluate(id => { const x = PixelHabitudes.screen.game; return !!x && x.id === id; }, g.id));
  return g;
}
const sees = (page, want) => until(() => page.evaluate(w => { const g = PixelHabitudes.screen.game; return !!g && Object.keys(w).every(k => g[k] === w[k]); }, want), 5000, 40)
  .then(async ok => { await wait(120); return ok; });              // its screen drew it (its touch areas follow what it shows)
async function stop(page) { act('habitudes.stop'); await until(() => !G()); await until(() => page.evaluate(() => !PixelHabitudes.screen.game)); }
const EDGE = { gauche: [16, 262], droite: [784, 262], haut: [400, 64], bas: [400, 470] };
async function playCache(page, tag, opt = {}) {
  const out = {};
  out.g = opt.started || await start(page, 'cache');
  out.debut = await sceneIs(page, /^jeu-(go|prefere)$/, 2500);
  await wait(600); await shot(page, `${tag}-cache-1`);
  let g = await until(() => G() && G().phase === 'cherche' && G(), 5000);
  out.cherche = !!g;
  await wait(500); await shot(page, `${tag}-cache-2`);
  if (g && opt.miss) {                                          // a wrong edge first
    await sees(page, { id: g.id, manche: 1, phase: 'cherche' });
    const wrong = Object.keys(EDGE).find(s => s !== g.cachette);
    await tap(page, ...EDGE[wrong]);
    out.rate = !!(await until(() => G() && G().rates.includes(wrong), 3000));
    out.rateScene = await sceneIs(page, /^jeu-rate$/, 2500);
    await wait(250); await shot(page, `${tag}-cache-3rate`);
  }
  for (let m = 1; m <= 3; m++) {
    g = await until(() => G() && G().manche === m && G().phase === 'cherche' && G(), 9000);
    if (!g) break;
    await sees(page, { id: g.id, manche: m, phase: 'cherche' });
    await tap(page, ...EDGE[g.cachette]);
    const ok = await until(() => G() && G().manche === m && G().phase === 'trouve', 3000);
    if (m === 1) { out.trouve = !!ok; out.trouveScene = await sceneIs(page, /^jeu-trouve$/, 2500); await wait(500); await shot(page, `${tag}-cache-4trouve`); }
  }
  const f = await until(() => G() && G().etat === 'fin' && G(), 9000);
  out.fin = f ? f.fin : null;
  out.finScene = await sceneIs(page, /^jeu-(gagne|il-gagne|fini)$/, 3000);
  await wait(900); await shot(page, `${tag}-cache-5fin`);
  return out;
}
const HAND_AT = { pierre: [192, 352], feuille: [432, 352], ciseaux: [672, 352] };
async function playPfc(page, tag) {
  const out = { rounds: [] };
  out.g = await start(page, 'pfc');
  await wait(700); await shot(page, `${tag}-pfc-1`);
  for (let n = 0; n < 6; n++) {
    const g = await until(() => G() && (G().etat === 'fin' || G().phase === 'choix') && G(), 6000);
    if (!g || g.etat === 'fin') break;
    const hand = ['pierre', 'feuille', 'ciseaux'][n % 3];
    await sees(page, { id: g.id, manche: g.manche, phase: 'choix' });
    await tap(page, ...HAND_AT[hand]);
    const r = await until(() => G() && G().manche === g.manche && G().phase === 'montre' && G(), 3000);
    if (!r) { out.lost = hand; break; }
    const sc = await sceneIs(page, /^jeu-(manche-toi|manche-lui|egalite)$/, 2500);
    out.rounds.push({ hand, toi: r.toi, lui: r.lui, gagnant: r.gagnant, sc, score: r.score });
    if (n === 0) { await wait(400); await shot(page, `${tag}-pfc-2montre`); }
  }
  const f = await until(() => G() && G().etat === 'fin' && G(), 8000);
  out.fin = f ? f.fin : null; out.score = f ? f.score : null;
  out.finScene = await sceneIs(page, /^jeu-(gagne|il-gagne|fini)$/, 3000);
  await wait(900); await shot(page, `${tag}-pfc-3fin`);
  return out;
}
const PAD_AT = [[431, 144], [673, 144], [431, 324], [673, 324]];
async function playSimon(page, tag, rounds = 2) {
  const out = {};
  out.g = await start(page, 'simon');
  await wait(450); await shot(page, `${tag}-simon-1montre`);
  for (let r = 1; r <= rounds; r++) {
    const g = await until(() => G() && G().manche === r && G().phase === 'joue' && G(), 9000);
    if (!g) { out.stuck = r; break; }
    await sees(page, { id: g.id, manche: r, phase: 'joue' });
    for (let i = 0; i < g.long; i++) { await tap(page, ...PAD_AT[g.seq[i]]); await wait(220); }
    const b = await until(() => G() && G().manche === r && (G().phase === 'bravo' || G().manche > r) && G(), 3000);
    out[`r${r}`] = !!b && b.meilleur === g.long;
    if (r === 1) { out.suite = await sceneIs(page, /^jeu-suite$/, 2000); await shot(page, `${tag}-simon-2bravo`); }
  }
  const g = await until(() => G() && G().manche === rounds + 1 && G().phase === 'joue' && G(), 9000);
  if (g) { await sees(page, { id: g.id, manche: rounds + 1, phase: 'joue' }); await tap(page, ...PAD_AT[(g.seq[0] + 1) % 4]); }   // a wrong pad
  const f = await until(() => G() && G().etat === 'fin' && G(), 3000);
  out.fin = f ? f.fin : null;
  out.finScene = await sceneIs(page, /^jeu-fini$/, 3000);
  out.lines = await said(page, 2300);
  await shot(page, `${tag}-simon-3fin`);
  return out;
}
/* attrape-étoiles: the stars still falling on a page, the lowest first (where its screen draws them) */
const fallingStars = page => page.evaluate(() => {
  const g = PixelHabitudes.screen.game, V = PixelHabitudes.screen.V; if (!g || g.etat !== 'joue' || g.jeu !== 'etoiles') return null;
  const el = Date.now() - g.t0;
  const all = g.etoiles.map((s, i) => ({ i, d: s.d, x: s.x + Math.sin((el - s.t) / 380 + s.x) * 10, y: -40 + s.v * (el - s.t) / 1000 }))
    .filter(s => el >= g.etoiles[s.i].t && s.y > -40 && s.y < 520 && !g.prises.includes(s.i) && !V.caught.has(s.i));
  return all.filter(s => s.y > 110 && s.y < 400).map(s => ({ ...s, alone: all.every(o => o === s || Math.hypot(o.x - s.x, o.y - s.y) > 140) })).sort((a, b) => b.y - a.y);
});
async function playEtoiles(pages, tag) {
  const out = { taps: 0 };
  // the same star touched on two screens at once: it counts once
  const both = await until(async () => { const s = await fallingStars(pages[0]); return (s || []).find(x => x.alone && x.y > 150 && x.y < 330) || null; }, 9000, 60);
  if (both) {
    const s0 = G().score;
    await Promise.all(pages.map(p => tap(p, both.x, both.y + 4)));
    await until(() => G() && G().prises.includes(both.i), 2000);
    await wait(500);
    out.twice = { star: both.i, gained: G().score - s0, worth: both.d ? 3 : 1 };
  }
  await shot(pages[0], `${tag}-etoiles-1`);
  let n = 0;
  while (G() && G().etat === 'joue' && G().jeu === 'etoiles') {
    const page = pages[n++ % pages.length], s = await fallingStars(page);
    if (s && s.length) { await tap(page, s[0].x, s[0].y + 4); out.taps++; }
    if (n === 40) await shot(page, `${tag}-etoiles-2`);
    await wait(90);
  }
  const f = await until(() => G() && G().etat === 'fin' && G(), 5000);
  out.fin = f ? f.fin : null; out.score = f ? f.score : null;
  out.sum = f ? f.prises.reduce((a, i) => a + (f.etoiles[i].d ? 3 : 1), 0) : null;
  return out;
}

/* ---------- the Pi's screen ---------- */
async function kiosk(browser) {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 480 }, deviceScaleFactor: 1, hasTouch: true });
  const k = await ctx.newPage(), errs = errors(k), cdp = await ctx.newCDPSession(k);
  await k.addInitScript(() => { window.__album = []; window.PixelAlbum = { snap: why => window.__album.push(why) }; });   // souvenirs: a moment worth a photo
  await k.goto(BASE + '/?kiosk=1');
  await until(() => k.evaluate(() => !!window.PixelHabitudes && !!PixelHabitudes.screen && !!PixelHabitudes.screen.state && Screens.local.lastBootAt > 0 && Screens.local.boot < 0), 15000);
  const n = await k.evaluate(() => Screens.persona.scenes.filter(s => /^(habitude|jeu|rire|peur)-/.test(s.id)).length);
  check(`his habits are loaded on the Pi's screen (screens.js add-on, ${n} scenes of their own)`, n >= 40, String(n));
  const h0 = H().horaires;
  check('caractère\'s old quiet hours (22 h - 7 h) became his first schedule: in bed at 22 h, up at 7 h', h0 && h0.coucher === 22 * 60 && h0.reveil === 7 * 60 && h0.actif, J(h0));
  check('the demo server: his clock paused (awake whatever the hour), not asleep', H().etat === 'eveille' && H().horloge.pause && !H().dort, J(H().horloge));
  act('habitudes.horaires', { reveil: '7:30', coucher: '21:00' });
  await until(() => H().horaires.coucher === 21 * 60);
  act('habitudes.rires', { aime: ['chatouilles', 'blagues', 'grimaces', 'bruits', 'gagner'] });
  await until(() => H().rires.aime.length === 5);

  // ---- cache-cache, in Rétro ----
  await theme(k, 'retro'); await free(k);
  const c = await playCache(k, 'retro', { miss: true });
  check(`cache-cache starts on his face screen (${c.debut}: « C'est parti ! », or a jump for joy for his favourite)`, !!c.g && !!c.debut && S.screen === 'visage', J(c));
  check('…he hides behind an edge: touch a wrong one, « Pas là ! » (jeu-rate), he giggles', c.cherche && c.rate && c.rateScene === 'jeu-rate', J(c));
  check('…touch his edge: found (jeu-trouve)', c.trouve && c.trouveScene === 'jeu-trouve', J(c));
  check(`…3 rounds: found 3 times, you win, a record (${c.finScene})`, !!c.fin && c.fin.resultat === 'gagne' && c.fin.score === 3 && c.fin.record && c.finScene === 'jeu-gagne', J(c.fin));
  const album = await until(() => k.evaluate(() => window.__album.length && window.__album.slice()), 3000);
  check('…a win: a photo for his album (souvenirs: PixelAlbum.snap, when it is there)', J(album) === J(['jeu-gagne']), J(album));
  check('…the record kept (habitudes.json)', H().jeux.records.cache === 3 && H().jeux.parties >= 1, J(H().jeux));
  await tap(k, 558 + 115, 330 + 32);                                  // « Fini »
  check('« Fini »: back to his face', !!(await until(() => !G(), 3000)) && !!(await until(() => k.evaluate(() => !PixelHabitudes.screen.game))));

  // ---- pierre-feuille-ciseaux, in Moderne ----
  await theme(k, 'moderne'); await free(k);
  const p = await playPfc(k, 'moderne');
  const want = { toi: 'jeu-manche-toi', lui: 'jeu-manche-lui', egal: 'jeu-egalite' };
  check(`pierre-feuille-ciseaux: each touch plays that hand, his against it, the right winner (${p.rounds.length} rounds)`, p.rounds.length >= 2 && !p.lost
    && p.rounds.every(r => r.toi === r.hand && ({ pierre: 'ciseaux', feuille: 'pierre', ciseaux: 'feuille' })[r.toi] === r.lui === (r.gagnant === 'toi') && (r.toi === r.lui) === (r.gagnant === 'egal')), J(p.rounds));
  check('…his reaction to each round (jeu-manche-toi, jeu-manche-lui, jeu-egalite)', p.rounds.every(r => r.sc === want[r.gagnant]), J(p.rounds.map(r => [r.gagnant, r.sc])));
  const [a, b] = p.score || [0, 0];
  check(`…first to 2: ${a} to ${b}, the end says who won (${p.finScene})`, !!p.fin && p.fin.resultat === (a > b ? 'gagne' : b > a ? 'perdu' : 'egal')
    && p.finScene === (a > b ? 'jeu-gagne' : b > a ? 'jeu-il-gagne' : 'jeu-fini'), J([p.score, p.fin]));
  const g1 = G().id;
  await tap(k, 316 + 115, 330 + 32);                                  // « Rejouer »
  const again = await until(() => G() && G().id !== g1 && G().jeu === 'pfc' && G().etat === 'joue' && G(), 3000);
  check('« Rejouer »: a new game of the same', !!again && again.par === 'rejoue');
  await until(() => k.evaluate(id => (PixelHabitudes.screen.game || {}).id === id, again.id));
  await tap(k, 38, 442);                                                // the ×
  check('…the × stops it', !!(await until(() => !G(), 3000)));

  // ---- Simon, in LCD: the result closes by itself ----
  await theme(k, 'lcd'); await free(k);
  const s = await playSimon(k, 'lcd', 2);
  check('Simon: he shows 3 pads, you play them back (a « Bravo ! » between rounds: jeu-suite), then 4', s.r1 && s.r2 && s.suite === 'jeu-suite', J(s));
  check(`…a wrong pad: the end, « 4 couleurs de suite ! » (${s.finScene})`, !!s.fin && s.fin.resultat === 'fini' && s.fin.score === 4 && s.finScene === 'jeu-fini' && s.lines.some(l => /4 couleurs de suite/.test(l)), J([s.fin, s.lines]));
  const closed = await until(() => !G(), 11000, 200);
  check('…the result stays a few seconds, then closes by itself', !!closed);

  // ---- a game never hides a cast, an exercise opened since, nor the quick menu ----
  await theme(k, 'retro'); await free(k);
  let g = await start(k, 'pfc');
  act('cast.text', { text: 'À table !' });
  const paused = await until(() => G() && G().pause && G(), 4000);
  const casting = await until(() => k.evaluate(() => Screens.casting), 3000);
  await wait(300); await shot(k, 'retro-cast-sur-jeu');
  check('a cast comes first: drawn over the game, which waits (paused on the server)', !!paused && casting);
  await wait(1500);
  act('cast.stop');
  const back = await until(() => G() && !G().pause && G(), 4000);
  check('…the cast ends: the game goes on as it was (the same round, still your turn)', !!back && back.id === g.id && back.manche === g.manche && back.phase === 'choix' && back.etat === 'joue', J(back));
  act('exos.nouveau', { kind: 'addition', niveau: 1 });
  const ex = await until(() => S.exos && S.exos.cur && G() && G().pause && G(), 4000);
  const exOpen = await until(() => k.evaluate(() => PixelExos.open), 3000);
  check('an exercise opened during a game: the exercise shows, the game waits under it', !!ex && exOpen);
  act('exos.stop');
  check('…the exercise closed: the game is back', !!(await until(() => G() && !G().pause && !(S.exos && S.exos.cur), 4000)));
  await wait(400);
  await touchSwipe(cdp, 400, 60, 400, 300); await wait(350);
  const menu = await k.evaluate(() => Screens.menuOpen);
  await shot(k, 'retro-menu-sur-jeu');
  check('a swipe down opens the quick menu over a game (the game is still there)', menu && !!G() && G().etat === 'joue');
  await k.evaluate(() => Screens.menu(false));
  const tray = await k.evaluate(() => (window.PixelNourrir && typeof PixelNourrir.swipe === 'function' ? [PixelNourrir.swipe(-200, 470), PixelNourrir.trayOpen] : null));
  check('…and Nourrir\'s tray waits for the game (a swipe up does not open it)', !tray || (tray[0] === false && !tray[1]), J(tray));
  act('habitudes.jouer', { jeu: 'cache' });
  await wait(600);
  check('…a game asked during another one: the first goes on', G() && G().id === g.id);
  await stop(k);

  // ---- his offer: « On joue à … ? » ----
  await free(k);
  await k.evaluate(() => Screens.persona.play('jeu-envie'));
  await wait(2200);
  const offered = await k.evaluate(() => [PixelHabitudes.screen.offering, PixelHabitudes.screen.V.offre]);
  await shot(k, 'retro-offre');
  await tap(k, 408 + 98, 410 + 30);                                    // « Oui ! »
  g = await until(() => G() && G().etat === 'joue' && G(), 3000);
  check(`his offer « On joue à … ? »: « Oui ! » starts the game he offered (${offered[1]}), one of his favourites`, offered[0] && !!g && g.jeu === offered[1] && g.par === 'lui'
    && H().jeux.favoris.includes(g.jeu), J([offered, g && g.jeu]));
  await stop(k); await free(k);
  await k.evaluate(() => Screens.persona.play('jeu-envie')); await wait(2200);
  await tap(k, 196 + 98, 410 + 30);                                    // « Plus tard »
  check('…« Plus tard »: he does not mind (jeu-plustard), no game', (await sceneIs(k, /^jeu-plustard$/, 2000)) === 'jeu-plustard' && !G());

  // ---- every game, in every theme ----
  const thin = [];
  for (const th of THEMES) {
    await theme(k, th);
    for (const jeu of ['cache', 'pfc', 'etoiles', 'simon']) {
      await start(k, jeu);
      await wait(jeu === 'cache' ? 2300 : jeu === 'etoiles' ? 2600 : 1100);
      const cols = await drawn(k); if (cols < 4) thin.push(`${th} ${jeu}: ${cols}`);
      await shot(k, `${th}-${jeu}`);
      await stop(k);
    }
  }
  check('every game drawn in the 6 themes', thin.length === 0, thin.join(' | '));
  check('the Pi\'s screen: no page error during the games', errs.length === 0, errs.slice(0, 4).join(' | '));

  // ---- his laughs, in Manga ----
  await theme(k, 'manga'); await free(k);
  act('habitudes.rire', { kind: 'blague' });
  const jk = await sceneIs(k, /^rire-blague/, 3000);
  const r = H().rire, joke = await k.evaluate(n => PixelHabitudesPack.blagues[n], r ? r.n : 0);
  const jl = await said(k, 6600);
  await shot(k, 'manga-blague');
  check(`« raconte une blague »: his joke, the question then the answer in his bubbles (« ${joke[0]} … ${joke[1]} »), and he laughs (${jk})`,
    /^rire-blague(-fou)?$/.test(jk || '') && jl.indexOf(joke[0]) >= 0 && jl.indexOf(joke[1]) > jl.indexOf(joke[0]), J(jl));
  await free(k);
  act('habitudes.rire', { kind: 'grimace' });
  check('a grimace (rire-grimace)', (await sceneIs(k, /^rire-grimace$/, 3000)) === 'rire-grimace');
  await wait(2200); await shot(k, 'manga-grimace'); await free(k);
  act('habitudes.rire', { kind: 'bruit' });
  const br = await sceneIs(k, /^rire-bruit$/, 3000), bl = await said(k, 1500), noise = await k.evaluate(n => PixelHabitudesPack.bruits[n % 8], H().rire.n);
  await shot(k, 'manga-bruit');
  check(`a funny noise (« ${noise} »)`, br === 'rire-bruit' && bl.includes(noise), J(bl));
  await free(k); await wait(300);
  for (let i = 0; i < 4; i++) { await tap(k, 400, 250); await wait(110); }
  const tk = await sceneIs(k, /^rire-(chatouilles|fou)$/, 1500);
  await wait(400); await shot(k, 'manga-chatouilles');
  check(`the tickles: fast taps on his face, he laughs (${tk})`, !!tk, String(await scene(k)));
  act('habitudes.rires', { kind: 'chatouilles', on: false });
  await until(() => !H().rires.aime.includes('chatouilles'));
  await free(k); await wait(1600);
  for (let i = 0; i < 4; i++) { await tap(k, 400, 250); await wait(110); }
  await wait(250);
  const nt = await scene(k);
  check(`…not ticklish (switched off in his laughs): fast taps are just taps (${nt})`, !/^rire-/.test(nt || ''), nt);
  act('habitudes.rires', { kind: 'chatouilles', on: true });

  // ---- his fears ----
  await theme(k, 'neon'); await free(k); await wait(1500);
  act('habitudes.peur', { kind: 'orage' });                           // the demo's button (the weather says orage on the Pi)
  const st = await sceneIs(k, /^peur-orage/, 3000);
  await wait(120); await shot(k, 'neon-orage-eclair');
  await wait(2400); await shot(k, 'neon-orage-cache');
  check(`the storm: a thunder clap, he startles and hides (${st})`, st === 'peur-orage');
  await rub(k);
  const ras = await sceneIs(k, /^peur-rassure$/, 2500);
  const co = await until(() => H().peurs.orage.courage === 10, 3000);
  await wait(900); await shot(k, 'neon-orage-rassure');
  check('…pet him: comforted (peur-rassure), his courage grows (10)', ras === 'peur-rassure' && !!co, J(H().peurs.orage));
  await free(k); await wait(1200);
  act('lights.set', { room: '*', on: false });
  const dk = await sceneIs(k, /^peur-noir/, 4000);
  await wait(1600); await shot(k, 'neon-noir');
  check(`every light off while he is awake: afraid of the dark (${dk})`, dk === 'peur-noir');
  await rub(k);
  check('…comforted', (await sceneIs(k, /^peur-rassure$/, 2500)) === 'peur-rassure' && !!(await until(() => H().peurs.noir.courage === 10, 3000)));
  act('lights.set', { room: '*', on: true });
  await wait(1500); await free(k);
  for (const th of SHOTS ? ['retro', 'croquis'] : []) {             // the same fears in other themes, for the eyes
    await theme(k, th); await free(k);
    act('habitudes.peur', { kind: 'orage' }); await sceneIs(k, /^peur-orage/, 3000); await wait(150); await shot(k, `${th}-orage-eclair`); await wait(2300); await shot(k, `${th}-orage-cache`);
    await free(k); await wait(1200);
    act('lights.set', { room: '*', on: false }); await sceneIs(k, /^peur-noir/, 4000); await wait(1600); await shot(k, `${th}-noir`);
    act('lights.set', { room: '*', on: true }); await wait(1500); await free(k);
  }
  await theme(k, 'croquis'); await free(k);
  await k.evaluate(() => { Screens.local.sleepy = false; Screens.persona.play('peur-araignee'); });
  await wait(2600);
  const sp = await k.evaluate(() => PixelHabitudesPack.araignee(Screens.persona.current().e));
  await shot(k, 'croquis-araignee');
  const c0 = H().peurs.araignees.courage;
  await tap(k, sp.x, sp.y);
  const gone = await sceneIs(k, /^peur-araignee-partie$/, 2000);
  await wait(600); await shot(k, 'croquis-araignee-partie');
  check('a little spider crosses his screen: touch it, it climbs away (and he is a bit braver)', !!sp && !sp.gone && gone === 'peur-araignee-partie'
    && !!(await until(() => H().peurs.araignees.courage === c0 + 10, 3000)), J([sp, H().peurs.araignees]));
  await free(k);
  act('habitudes.peurs', { peur: 'orage', on: false }); await until(() => !H().peurs.orage.on);
  act('habitudes.peur', { kind: 'orage' }); await wait(1200);
  check('a fear switched off: no storm scene', !/^peur-/.test((await scene(k)) || ''));
  act('habitudes.peurs', { peur: 'orage', on: true });

  // ---- his phrases ----
  await theme(k, 'retro'); await free(k);
  act('habitudes.apprendre', { moment: 'bonjour', phrase: '  « Salut les loulous ! »  ' });
  const ap = await sceneIs(k, /^habitude-appris$/, 3000), al = await said(k, 4200);
  await shot(k, 'retro-appris');
  check('a phrase taught (cleaned: « Salut les loulous ! »): he repeats it', ap === 'habitude-appris' && H().expressions.bonjour[0] === 'Salut les loulous !' && al.includes('« Salut les loulous ! »'), J(al));
  await k.evaluate(() => PixelHabitudes.screen.sayOwn(true)); await free(k);
  await k.evaluate(() => Screens.persona.play('coucou'));
  const own = await said(k, 1600);
  check('…then he says it instead of his own line (coucou)', own[0] === 'Salut les loulous !', J(own));
  act('habitudes.apprendre', { moment: 'faim', phrase: 'J’ai un creux de baleine, on mange une pizza ?' });
  await until(() => H().expressions.faim.length === 1); await wait(6800); await free(k);
  await k.evaluate(() => Screens.persona.play('faim'));
  const lng = await said(k, 4000);
  await shot(k, 'retro-phrase-longue');
  check('…a long one in two bubbles, one after the other', lng.length >= 2 && lng[0].endsWith('…') && lng[1].startsWith('…')
    && (lng[0].slice(0, -1) + ' ' + lng[1].slice(1)).replace(/\s+/g, ' ') === 'J’ai un creux de baleine, on mange une pizza ?', J(lng));
  await k.evaluate(() => PixelHabitudes.screen.sayOwn(false)); await free(k);

  // ---- his day: bedtime, the night, the morning ----
  await free(k); await wait(900);
  const lit = await bright(k);                                         // his screen in the day, for the night's veil
  act('habitudes.demo', { heure: '20:45', avant: 2 });
  const ann = await sceneIs(k, /^habitude-annonce$/, 7000);
  await wait(2800); await shot(k, 'retro-coucher-annonce');
  check('15 minutes before bedtime: he yawns, « Bientôt l\'heure du dodo ! » (habitude-annonce)', ann === 'habitude-annonce' && H().etat === 'coucher', H().etat);
  act('habitudes.demo', { heure: '20:52', avant: 2 });
  const dents = await sceneIs(k, /^habitude-dents$/, 7000);
  await wait(3000); await shot(k, 'retro-dents');
  check('…he brushes his teeth (habitude-dents)', dents === 'habitude-dents');
  act('habitudes.demo', { heure: '20:58', avant: 2 });
  const veil = await sceneIs(k, /^habitude-veilleuse$/, 7000);
  await wait(3600); await shot(k, 'retro-veilleuse');
  check('…afraid of the dark: he asks for his night-light (habitude-veilleuse)', veil === 'habitude-veilleuse');
  act('habitudes.demo', { heure: '21:00', avant: 2 });
  const dodo = await sceneIs(k, /^habitude-dodo$/, 7000), dl = await said(k, 2400);
  check(`21 h: « Bonne nuit ! », he falls asleep (habitude-dodo: ${J(dl)})`, dodo === 'habitude-dodo' && H().etat === 'nuit' && H().dort && /bonne nuit|au dodo/i.test(dl.join(' ')));
  const asleep = await until(() => k.evaluate(() => Screens.local.sleepy && PixelHabitudes.screen.asleep), 12000, 200);
  await wait(2200);
  const dim = await bright(k);
  await shot(k, 'retro-nuit');
  check(`…asleep: dort, the night veil (a dimmer screen: ${Math.round(dim)} against ${Math.round(lit)} in the day), his night-light`, asleep && dim < lit * 0.7, `${dim} ${lit}`);
  await tap(k, 400, 240);
  const mum = await sceneIs(k, /^habitude-marmonne$/, 2000);
  await wait(900); await shot(k, 'retro-marmonne');
  await wait(3200);
  check('…a touch: he mumbles in his sleep, and sleeps on', mum === 'habitude-marmonne' && await k.evaluate(() => Screens.local.sleepy), String(mum));
  await rub(k);
  const pet = await sceneIs(k, /^habitude-dodo-calin$/, 2000);
  await wait(4200);
  check('…petted: a cuddle in his sleep (habitude-dodo-calin), and he sleeps on', pet === 'habitude-dodo-calin' && await k.evaluate(() => Screens.local.sleepy), String(pet));
  act('habitudes.jouer', { jeu: 'cache' });
  const pm = await sceneIs(k, /^habitude-pas-maintenant$/, 3000);
  check('…no game at night: « Chut… il dort », he mumbles it (habitude-pas-maintenant)', !G() && /dort/.test((S.toast || {}).msg || '') && pm === 'habitude-pas-maintenant', J(S.toast));
  await wait(4200);
  const notif = await k.evaluate(() => Screens.event('notif', { app: 'Messages', title: 'Coucou' }));
  check('…the world\'s news wait while he sleeps (a notification: no scene)', notif === '', notif);
  const night = await k.evaluate(() => Screens.persona.isNight(new Date().getHours()));
  check('…his quiet hours are his night (persona\'s quiet scenes, nourrir\'s hints, exercises offered: Screens.persona.isNight)', night === true);
  act('lights.set', { room: '*', on: false });
  const nd = await sceneIs(k, /^habitude-dodo-noir$/, 4000);
  check('…the lights off while he sleeps: no fright, he sleeps on (habitude-dodo-noir)', nd === 'habitude-dodo-noir' && await k.evaluate(() => Screens.local.sleepy));
  act('lights.set', { room: '*', on: true }); await wait(3800);
  for (const th of SHOTS ? ['lcd', 'neon', 'manga'] : []) { await theme(k, th); await wait(1200); await shot(k, `${th}-nuit`); }
  await theme(k, 'retro');
  act('habitudes.demo', { heure: '7:30', avant: 2 });
  const rv = await sceneIs(k, /^habitude-reveil$/, 7000);
  await wait(2500); await shot(k, 'retro-reveil');
  check('7 h 30: he wakes up and stretches, « Bonjour ! » (habitude-reveil)', rv === 'habitude-reveil' && !H().dort && !(await k.evaluate(() => Screens.local.sleepy)));
  act('habitudes.demo', { heure: '10:00' });
  await until(() => H().etat === 'eveille' && !H().horloge.pause);
  check('…at 10 h (whatever the real hour) it is his day: no quiet hours', (await k.evaluate(() => Screens.persona.isNight(new Date().getHours()))) === false);
  const notif2 = await until(() => k.evaluate(() => { Screens.persona.stop(); return Screens.event('notif', { app: 'Messages', title: 'Coucou' }); }), 6000, 500);
  check('…awake, the news reach him again', !!notif2, notif2);
  act('habitudes.demo', { heure: null });
  await until(() => H().horloge.pause);
  check('the Pi\'s screen: no page error', errs.length === 0, errs.slice(0, 4).join(' | '));
  return k;
}

/* ---------- a phone ---------- */
async function phone(browser, kp) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(), errs = errors(page);
  await page.goto(BASE + '/?mode=both');
  await until(() => page.evaluate(() => !!document.querySelector('.hab-go') && Screens.local.boot < 0), 12000);
  await theme(page, 'retro');
  const go = await page.evaluate(() => { const b = document.querySelector('.hab-go'), c = document.querySelector('.car-go'); return b && [b.textContent, !!c && c.parentElement === b.parentElement, b.offsetParent !== null]; });
  check('the phone: a « Habitudes » button under the keys, with Caractère, Nourrir and Exos', !!go && go[0] === 'Habitudes' && go[1] && go[2], J(go));
  await page.click('.hab-go');
  const dom = await page.evaluate(() => ({ open: !document.querySelector('.hab-sheet').hidden, title: document.querySelector('.hab-title').textContent,
    h: [...document.querySelectorAll('.hab-h')].map(x => x.textContent), now: document.querySelector('.hab-now').textContent, w: document.documentElement.scrollWidth }));
  check(`the « Ses habitudes » panel: ${dom.h.join(', ')}`, dom.open && dom.title === 'Ses habitudes' && dom.h.length === 5 && /pause/.test(dom.now) && dom.w <= 390, J(dom));
  await shot(page, 'phone-panneau');
  await page.selectOption('select[aria-label="Coucher"] >> nth=0', String(20 * 60 + 30));
  check('his bedtime: 20 h 30', !!(await until(() => H().horaires.coucher === 20 * 60 + 30)));
  await page.selectOption('select[aria-label="Réveil"] >> nth=0', String(4 * 60));
  await until(() => H().horaires.reveil === 4 * 60);
  const t0 = (S.toast || {}).id;
  await page.selectOption('select[aria-label="Coucher"] >> nth=0', String(2 * 60));    // a 2-hour night
  const refused = await until(() => S.toast && S.toast.id !== t0 && S.toast, 3000);
  const shown = await until(() => page.evaluate(() => document.querySelectorAll('select[aria-label="Coucher"]')[0].value === String(20 * 60 + 30)), 3000);
  check(`an impossible schedule (a 2-hour night) is refused: « ${refused && refused.msg} », the panel shows the kept time again`,
    H().horaires.coucher === 20 * 60 + 30 && !!refused && /4 heures/.test(refused.msg) && !!shown);
  await page.selectOption('select[aria-label="Réveil"] >> nth=0', String(7 * 60 + 30));
  await until(() => H().horaires.reveil === 7 * 60 + 30);
  await page.click('.hab-sched .hab-sw >> nth=1');                       // « Une sieste »
  await until(() => H().horaires.sieste);
  await page.selectOption('select[aria-label="Durée de la sieste"]', '45');
  check('a nap: 13 h 30 by default, 45 minutes', !!(await until(() => H().horaires.sieste && H().horaires.sieste.duree === 45 && H().horaires.sieste.de === 13 * 60 + 30)));
  await page.click('.hab-sched .hab-sw >> nth=2');                       // « Le week-end, d'autres horaires »
  check('the weekend: later times', !!(await until(() => H().horaires.weekend && H().horaires.weekend.reveil === 9 * 60)), J(H().horaires.weekend));
  await shot(page, 'phone-horaires');
  await page.click('.hab-sched .hab-sw >> nth=1'); await page.click('.hab-sched .hab-sw >> nth=2');
  await until(() => !H().horaires.sieste && !H().horaires.weekend);
  const fav0 = H().jeux.favoris, other = ['cache', 'pfc', 'etoiles', 'simon'].find(x => !fav0.includes(x));
  await page.click(`.hab-jeu:nth-child(${['cache', 'pfc', 'etoiles', 'simon'].indexOf(other) + 1}) .hab-fav`);
  const fav = await until(() => H().jeux.favoris.includes(other) && H().jeux.favoris, 3000);
  check(`his favourites: ♥ on ${other}, the older one leaves (${J(fav)})`, !!fav && fav.length === 2 && fav[0] === fav0[1]);
  await page.click('.hab-chip >> nth=2');                                // les grimaces
  check('what makes him laugh: a chip switches one', !!(await until(() => !H().rires.aime.includes('grimaces'))));
  await page.click('.hab-chip >> nth=2'); await until(() => H().rires.aime.includes('grimaces'));
  await page.click('.hab-peur .hab-sw >> nth=2');                        // les araignées
  check('a fear switched off from the panel', !!(await until(() => H().peurs.araignees.on === false)));
  await page.click('.hab-peur .hab-sw >> nth=2'); await until(() => H().peurs.araignees.on);
  await page.selectOption('.hab-moment', 'merci');
  await page.fill('.hab-phrase', '<b>Merci</b> & bisous');
  await page.click('.hab-learn');
  await until(() => H().expressions.merci.length === 1);
  const li = await until(() => page.evaluate(() => { const b = document.querySelectorAll('.hab-expr')[3].querySelector('.hab-say'); return b && [b.textContent, b.querySelector('b') === null]; }), 3000);
  check('a phrase taught from the panel: shown as text (« <b>Merci</b> & bisous », no HTML)', H().expressions.merci[0] === '<b>Merci</b> & bisous' && !!li && li[0] === '<b>Merci</b> & bisous' && li[1], J(li));
  await page.fill('.hab-phrase', 'va sur https://exemple.fr');
  await page.click('.hab-learn');
  check('…a link is not a phrase', /Écris une petite phrase/.test(await page.textContent('.hab-msg')) && H().expressions.merci.length === 1);
  await shot(page, 'phone-phrases');
  await page.click('.hab-expr >> nth=3 >> .hab-del');
  check('…× forgets it', !!(await until(() => H().expressions.merci.length === 0)));
  const small = await page.evaluate(() => [...document.querySelectorAll('.hab-sheet button, .hab-sheet select, .hab-sheet input')].filter(e => e.offsetParent)
    .map(e => { const r = e.getBoundingClientRect(); return [e.className || e.tagName, e.textContent.slice(0, 12), Math.round(r.width), Math.round(r.height)]; }).filter(([, , w, h]) => h < 56 || w < 56));
  check('touch targets of 56 px at least in the panel', small.length === 0, J(small.slice(0, 5)));
  check('nothing wider than the phone', (await page.evaluate(() => [document.documentElement.scrollWidth, document.querySelector('.hab-box').scrollWidth <= document.querySelector('.hab-box').clientWidth])).join() === '390,true');
  for (const th of SHOTS ? ['moderne', 'lcd', 'manga', 'neon', 'croquis'] : []) { await theme(page, th); await wait(300); await page.evaluate(() => document.querySelector('.hab-box').scrollTo(0, 0)); await shot(page, `phone-panneau-${th}`); }
  await theme(page, 'retro');

  // « Jouer »: the panel closes, the game plays on the phone's own screen
  await page.evaluate(() => document.querySelector('.hab-jeu .hab-play').scrollIntoView());
  await page.click('.hab-jeu >> nth=0 >> .hab-play');                  // cache-cache
  const pg = await until(() => G() && G().jeu === 'cache' && G(), 3000);
  check('« Jouer »: the panel closes, the game starts (par: telephone)', !!pg && pg.par === 'telephone' && await page.evaluate(() => document.querySelector('.hab-sheet').hidden));
  await until(() => page.evaluate(id => (PixelHabitudes.screen.game || {}).id === id, pg.id));
  const pc = await playCache(page, 'phone', { miss: true, started: pg });
  const same = await kp.evaluate(() => (PixelHabitudes.screen.game || {}).id);
  check('cache-cache on the phone\'s screen by touch: a wrong edge, then found 3 times, you win', pc.rate && pc.trouve && !!pc.fin && pc.fin.resultat === 'gagne', J(pc.fin));
  check('…the Pi\'s screen shows the same game', same === pg.id, `${same} ${pg.id}`);
  await stop(page);
  const pp = await playPfc(page, 'phone');
  check('pierre-feuille-ciseaux on the phone, to its end', pp.rounds.length >= 2 && !pp.lost && !!pp.fin, J(pp.rounds));
  await stop(page);
  const ps = await playSimon(page, 'phone', 1);
  check('Simon on the phone: one round, then a wrong pad: the end', ps.r1 && !!ps.fin && ps.fin.score === 3, J(ps.fin));
  await stop(page);
  // attrape-étoiles on the phone and on the Pi's screen at once, to its end
  act('theme.set', { name: 'neon' }); await wait(400);
  const ge = await start(page, 'etoiles');
  await until(() => kp.evaluate(id => (PixelHabitudes.screen.game || {}).id === id, ge.id));
  const pe = await playEtoiles([page, kp], 'phone');
  check(`attrape-étoiles on two screens at once: the same star touched on both counts once (${J(pe.twice)})`, !!pe.twice && pe.twice.gained === pe.twice.worth, J(pe.twice));
  check(`…30 seconds: ${pe.score} points (${pe.taps} touches), every star counted once, 12 or more: you win`, !!pe.fin && pe.score === pe.sum && pe.score >= 12 && pe.fin.resultat === 'gagne', J([pe.fin, pe.sum]));
  await wait(1000); await shot(kp, 'neon-etoiles-fin');
  await stop(page);
  act('theme.set', { name: 'retro' });

  // at night: the panel says he sleeps, no « Jouer »
  act('habitudes.demo', { heure: '22:00' });
  await until(() => H().etat === 'nuit');
  await page.click('.hab-go');
  const nightUI = await until(() => page.evaluate(() => { const n = document.querySelector('.hab-now').textContent, p = [...document.querySelectorAll('.hab-play')]; return /Il dort/.test(n) && p.every(b => b.disabled) && n; }), 3000);
  check(`at night the panel says so (« ${nightUI} »), no « Jouer »`, !!nightUI);
  await shot(page, 'phone-nuit');
  act('habitudes.demo', { heure: null }); await until(() => H().horloge.pause);
  await page.click('.hab-x');
  // caractère's quiet hours lead to his schedule
  await page.click('.car-go'); await wait(300);
  const car = await page.evaluate(() => { const n = document.querySelector('.car-calme-n'), b = document.querySelector('.car-hab'); return [n && n.textContent, !!b, document.querySelectorAll('.car-hour select').length]; });
  check(`caractère's quiet hours: « ${car[0]} », and a button to his schedule (no hours of its own)`, /de son coucher \(20 h 30\) à son réveil \(7 h 30\)/.test(car[0] || '') && car[1] && car[2] === 0, J(car));
  await page.click('.car-hab');
  check('…the button opens « Ses habitudes »', !!(await until(() => page.evaluate(() => !document.querySelector('.hab-sheet').hidden && document.querySelector('.car-sheet').hidden), 2000)));
  check('the back button (PixelSheet.close()) closes it', (await page.evaluate(() => PixelSheet.close())) && await page.evaluate(() => document.querySelector('.hab-sheet').hidden));
  check('PixelPanel(\'habitudes\') opens it (the app\'s menu)', await page.evaluate(() => PixelPanel('habitudes') && !document.querySelector('.hab-sheet').hidden));
  await page.keyboard.press('Escape');
  check('Escape closes it', await page.evaluate(() => document.querySelector('.hab-sheet').hidden));
  // the void: the Pixel de poche tilted steeply
  await page.setViewportSize({ width: 844, height: 390 }); await wait(300);
  await page.evaluate(() => { if (window.PixelPoche && !PixelPoche.on) PixelPoche.enter('fixe'); }); await wait(2600);
  await free(page);
  const v0 = H().peurs.vide.courage;
  await page.evaluate(() => PixelPoche.sim.tilt(1));
  let vide = await sceneIs(page, /^(peur-vide|poche-glisse)$/, 2500);
  if (vide !== 'peur-vide') { await page.evaluate(() => Screens.persona.play('peur-vide')); vide = 'peur-vide (played)'; }
  await wait(900); await shot(page, 'poche-vide');
  const calm = await sceneIs(page, /^peur-rassure$/, 7000);
  check(`the Pixel de poche tilted steeply: vertigo (${vide}); held level again, he is comforted`, /^peur-vide/.test(vide) && calm === 'peur-rassure'
    && !!(await until(() => H().peurs.vide.courage === v0 + 10, 3000)), J([vide, calm, H().peurs.vide]));
  // asleep in his pocket: a long press is a cuddle in his sleep, a touch a mumble
  act('habitudes.demo', { heure: '22:00' });
  const ps0 = await until(() => page.evaluate(() => Screens.local.sleepy && PixelHabitudes.screen.asleep), 12000, 200);
  const mid = await at(page, 400, 240);
  await page.mouse.move(mid.x, mid.y); await page.mouse.down(); await wait(900); await page.mouse.up();
  const hug = await sceneIs(page, /^habitude-dodo-calin$/, 2000);
  await wait(800); await shot(page, 'poche-nuit-calin'); await wait(3200);
  check('the Pixel de poche asleep at night: a long press, a cuddle in his sleep; he sleeps on', !!ps0 && hug === 'habitude-dodo-calin' && await page.evaluate(() => Screens.local.sleepy), String(hug));
  act('habitudes.demo', { heure: null }); await until(() => H().horloge.pause);
  await page.evaluate(() => PixelPoche.leave()); await page.setViewportSize({ width: 390, height: 844 });
  check('the phone: no page error', errs.length === 0, errs.slice(0, 4).join(' | '));
  await ctx.close();
}

/* ---------- Pixel Lab: the same rules in the page (demo-hub.js and ../habitudes.js) ---------- */
async function lab(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { try { if (/\/lab\/index\.html$/.test(location.pathname)) localStorage.setItem('pixel_lab_habitudes', JSON.stringify({ peurs: { orage: { on: true, courage: 90 } } })); } catch (e) { /* none */ } });   // brave already
  const page = await ctx.newPage(), errs = errors(page);
  await page.goto(BASE + '/app/lab/index.html');
  await until(() => page.evaluate(() => !!window.PixelHub && !!PixelHub.S.habitudes && !!document.getElementById('hHabitudes') && !!PixelHabitudes.screen), 9000);
  const hs = () => page.evaluate(() => PixelHub.S.habitudes);
  check('Pixel Lab: « Ses habitudes » in the lab, his clock paused', !!(await page.$('#hHabitudes')) && (await hs()).horloge.pause);
  await page.evaluate(() => PixelHub.dispatch('lab.weather', { kind: 'orage' }));         // the lab's weather buttons: a stand-in forecast
  const storm = await until(async () => { const h = await hs(); return h.peur && h.peur.kind === 'orage' && h.peur; }, 4000);
  const ls = await until(() => page.evaluate(() => /^peur-orage/.test(Screens.persona.state.cur || '') && Screens.persona.state.cur), 3000);
  check(`a stand-in weather says orage: a thunder clap on his screen (${ls}: he braves it, courage ${storm && storm.courage})`, !!storm && ls === 'peur-orage-brave', J(storm));
  await page.evaluate(() => PixelHub.dispatch('lab.weather', { kind: 'exemple' }));
  await page.evaluate(() => PixelHub.dispatch('habitudes.rassure', { peur: 'orage' }));
  const won = await until(() => page.evaluate(() => Screens.persona.state.cur === 'peur-vaincue'), 3000);
  check('…comforted once more: courage 100, he is not afraid any more (peur-vaincue)', won && (await hs()).peurs.orage.courage === 100);
  const lab0 = await page.evaluate(() => {
    const D = t => PixelHub.dispatch('cmd', { text: t }), h = () => PixelHub.S.habitudes, out = {};
    D('on joue ?'); out.play = !!h().partie && h().jeux.favoris.includes(h().partie.jeu);
    D('stop'); out.stop = h().partie === null;
    D('pierre feuille ciseaux'); out.pfc = !!h().partie && h().partie.jeu === 'pfc'; D('stop');
    D('raconte une blague'); out.joke = !!h().rire && h().rire.kind === 'blague';
    D('dis bonjour comme ça : Coucou les amis !'); out.teach = h().expressions.bonjour[0] === 'Coucou les amis !';
    D('couche-toi à 20 h'); out.bed = h().horaires.coucher === 1200;
    D('joue cache-cache'); out.scene = h().partie === null;
    return out;
  });
  check('Pixel Lab: the typed commands (« on joue ? », « stop », « pierre feuille ciseaux », « raconte une blague », a phrase, a bedtime; « joue cache-cache » stays a scene)',
    Object.values(lab0).every(Boolean), J(lab0));
  await page.click('section:has(#hHabitudes) button:has-text("Coucher dans 5 s")');
  const ll = await until(async () => (await hs()).etat === 'coucher' && page.evaluate(() => Screens.persona.state.cur), 9000, 200);
  check(`« Coucher dans 5 s »: bedtime comes on the lab's screen (${ll})`, ll === 'habitude-annonce', String(ll));
  await page.click('section:has(#hHabitudes) button:has-text("Horloge en pause")');
  check('« Horloge en pause »: awake again', !!(await until(async () => (await hs()).horloge.pause && (await hs()).etat === 'eveille', 3000)));
  if (SHOTS) { await page.evaluate(() => document.getElementById('hHabitudes').scrollIntoView()); await wait(300); await shot(page, 'lab'); }
  check('Pixel Lab: no page error', errs.length === 0, errs.slice(0, 4).join(' | '));
  await ctx.close();
}

/* ---------- Pixel sans Pi: the app's offline page, by the phone's own clock ---------- */
async function local(browser) {
  const FILE = path.join(tmp, 'pixel-local.html'), PAGE = 'file://' + FILE;
  execFileSync('python3', [path.join(APP, 'tools', 'build_app_bundle.py'), FILE], { stdio: 'pipe' });
  const open = async when => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('**/*', r => (r.request().url() === PAGE ? r.continue() : r.abort()));
    const page = await ctx.newPage(), errs = errors(page);
    await page.clock.setFixedTime(when);
    await page.goto(PAGE);
    await until(() => page.evaluate(() => !!window.PixelLocal && !!PixelHub.S.habitudes && !!PixelHabitudes.screen && !!PixelHabitudes.screen.state), 9000);
    return { ctx, page, errs };
  };
  const day = await open(new Date(2026, 10, 10, 12, 0));
  const d = await day.page.evaluate(() => PixelHub.S.habitudes);
  check('Pixel sans Pi: his clock is the phone\'s (not paused): awake at noon', !d.horloge.pause && d.etat === 'eveille', J(d.horloge));
  await day.page.evaluate(() => PixelHub.dispatch('habitudes.demo', { heure: '22:00' }));
  await day.page.evaluate(() => PixelHub.dispatch('habitudes.peur', { kind: 'orage' }));
  await wait(400);
  const d2 = await day.page.evaluate(() => PixelHub.S.habitudes);
  check('…no demo clock, no demo fear here', d2.etat === 'eveille' && d2.horloge.decalage === 0 && !d2.peur, J(d2.horloge));
  await wait(2500);
  check('…no lights to know: never afraid of the dark here; no forecast: no storm', !/^peur-/.test((await scene(day.page)) || '') && (await day.page.evaluate(() => PixelHub.S.lights.rooms.length)) === 0);
  await day.page.evaluate(() => { PixelHub.S.weather = { now: { kind: 'orage', temp: 12 }, days: [], city: 'Lyon' }; });
  const ls = await until(() => day.page.evaluate(() => (PixelHub.S.habitudes.peur || {}).kind === 'orage' && /^peur-orage/.test(Screens.persona.state.cur || '')), 4000);
  check('…a forecast (the city typed) says orage: then a thunder clap', !!ls);
  check('Pixel sans Pi at noon: no page error', day.errs.length === 0, day.errs.slice(0, 4).join(' | '));
  await day.ctx.close();
  const nt = await open(new Date(2026, 10, 10, 22, 0));
  const n = await nt.page.evaluate(() => PixelHub.S.habitudes);
  const sl = await until(() => nt.page.evaluate(() => Screens.local.sleepy && PixelHabitudes.screen.asleep), 12000, 200);
  await shot(nt.page, 'local-nuit');
  check('Pixel sans Pi at 22 h: his night, he sleeps on the phone too', n.etat === 'nuit' && n.dort && !!sl, J([n.etat, sl]));
  check('Pixel sans Pi at night: no page error', nt.errs.length === 0, nt.errs.slice(0, 4).join(' | '));
  await nt.ctx.close();
}

(async () => {
  if (await portOpen()) throw new Error(`le port ${PORT} est déjà pris (HABITUDES_PORT=… pour un autre)`);
  srv = spawn('python3', [path.join(APP, 'server.py'), '--demo', '--port', String(PORT), '--host', '127.0.0.1', '--config', cfg], { cwd: APP, stdio: 'ignore' });
  if (!(await until(portOpen, 15000))) throw new Error('le serveur de démo ne démarre pas');
  hub = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  hub.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'state') S = m.data; };
  await until(() => hub.readyState === 1 && S && S.habitudes, 5000);
  const browser = await chromium.launch();
  try {
    const k = await kiosk(browser);
    await phone(browser, k);
    await lab(browser);
    await local(browser);
  } finally {
    await browser.close(); hub.close(); srv.kill('SIGTERM');
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`\n${fails} failure(s)`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); if (srv) srv.kill('SIGTERM'); process.exit(1); });
