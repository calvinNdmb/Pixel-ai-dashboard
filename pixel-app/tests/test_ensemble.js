// Son look, ses habitudes, ses souvenirs et ses amis ensemble, in Chromium, on a demo server (port 8427, or ENSEMBLE_PORT; a
// temporary data folder, every theme on) and in Pixel Lab, whose in-page server mirrors the Pi's (Pixel sans Pi runs it too).
//   node tests/test_ensemble.js [--shots DIR]
// - the Pi's screen (800x480, ?kiosk=1): one order over his face, written once (web/screens.js ORDER): an exercise over a
//   game (the server pauses it), a game over everything else; Nourrir's tray and plate under every add-on; asleep by his
//   schedule (habitudes.demo), the night veil, and the tray stays shut (a swipe up, the plate), the phone's panel still feeds
//   him; the demo's paused clock: his quiet hours are his night (his pyjama on, then off);
// - Pixel Lab, his screen and its fake server (a demo friend, Bip): his mood question waiting under a game and under a
//   friend's visit, back after each; no game during a visit; a coucou during a game peeps in after it; a joke during a visit
//   plays to its end, then the visit goes on where its time is; « prends une photo » during a visit (the pose, the shot, no
//   « n'a pas pu »); the visit's photo with that visit's memory, not an older one; a won game's photo (« Une partie
//   gagnée »); the friend refused while he sleeps or plays, the visit ended when he falls asleep; his pyjama at bedtime with
//   no scene of its own, habitudes' routine telling it (and his taught « bonjour » at wake-up); the visitor's look dressed by
//   this house (his chosen look, this Pixel's night); the lower part of the order (souvenirs, his night, the exercise's offer).
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');

const APP = path.join(__dirname, '..'), PORT = Number(process.env.ENSEMBLE_PORT) || 8427, BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = (i => (i >= 0 ? process.argv[i + 1] : null))(process.argv.indexOf('--shots'));
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (name, ok, info = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (!ok && info ? `  [${info}]` : '')); if (!ok) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 6000, step = 80) => { const end = Date.now() + ms; let v; while (Date.now() < end) { if ((v = await fn())) return v; await wait(step); } return v; };
const portOpen = () => new Promise(r => { const s = net.connect(PORT, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
const THEMES = ['retro', 'moderne', 'manga', 'neon', 'croquis', 'lcd'];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-ensemble-')), cfg = path.join(tmp, 'config.toml');
fs.writeFileSync(cfg, `data_dir = "${tmp}"\n[ui]\nthemes = ${JSON.stringify(THEMES)}\n`);
let srv = null, hub = null, S = null;
const act = (action, args = {}) => hub.send(JSON.stringify({ action, args }));
const errors = page => {
  const e = [];
  page.on('pageerror', x => e.push('pageerror: ' + x.message));
  page.on('console', m => { if (m.type() === 'error' && !/\/pixel\.apk$/.test(m.location().url || '')) e.push('console.error: ' + m.text()); });
  return e;
};
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
const free = page => page.evaluate(() => { Screens.persona.stop(); Screens.local.local = null; Screens.local.pack = null; Screens.local.lastInput = performance.now(); Screens.local.inputAt = performance.now() - 5000; Screens.local.sleepy = false; });
const top = page => page.evaluate(() => Screens.addonTop);

/* ================= the Pi's screen, on the demo server ================= */
async function kiosk(browser) {
  const kc = await browser.newContext({ viewport: { width: 800, height: 480 }, deviceScaleFactor: 1, hasTouch: true });
  const k = await kc.newPage(), kErr = errors(k);
  await k.goto(BASE + '/?kiosk=1');
  await until(() => k.evaluate(() => !!window.PixelExos && !!window.PixelHabitudes && !!window.PixelNourrir && !!window.PixelAmis && Screens.local.lastBootAt > 0 && Screens.local.boot < 0), 15000);
  await k.evaluate(() => Screens.persona.setLife(false));     // no moment of life of his own meanwhile
  await free(k);
  check('web/screens.js: one order over his face, highest first (exercise, game, friends, souvenirs, his offers and night, the exercise\'s offer)',
    JSON.stringify(await k.evaluate(() => Screens.order)) === JSON.stringify(['exo', 'jeu', 'amis', 'souvenirs', 'habitudes', 'exo-offre']));
  await until(() => k.evaluate(() => PixelNourrir.shown), 4000);
  check('nothing on: no add-on over his face, the plate is there', (await top(k)) === '' && await k.evaluate(() => PixelNourrir.shown));

  act('habitudes.jouer', { jeu: 'cache', par: 'test' });
  check('a game: drawn over his face (jeu), the plate waits under it', await until(() => k.evaluate(() => Screens.addonTop === 'jeu' && !PixelNourrir.shown && !PixelNourrir.open()), 5000));
  act('exos.nouveau', { mode: 'exo', kind: 'addition', niveau: 1 });
  check('…an exercise opened during it comes first (exo), the server pauses the game', await until(() => k.evaluate(() => Screens.addonTop === 'exo') && S.habitudes.partie && S.habitudes.partie.pause > 0, 5000));
  await shot(k, 'kiosk-exo-over-game');
  act('exos.stop');
  check('…the exercise over: the game again, going on where it was', await until(() => k.evaluate(() => Screens.addonTop === 'jeu') && S.habitudes.partie && !S.habitudes.partie.pause, 5000));
  act('habitudes.stop');
  check('…the game over: his face, and the plate back', await until(() => k.evaluate(() => Screens.addonTop === '' && PixelNourrir.shown), 5000));

  // his night by his schedule: the veil, and the food tray stays shut
  act('habitudes.demo', { heure: '22:30' });
  check('asleep by his schedule (22:30): he sleeps on his face, the night veil is the view (habitudes)', await until(() => S.habitudes.dort && k.evaluate(() => Screens.local.sleepy && Screens.addonTop === 'habitudes'), 6000));
  const r = await k.locator('#crt').boundingBox(), cy = v => r.y + r.height * v / 480;
  await k.mouse.move(r.x + r.width / 2, cy(476)); await k.mouse.down(); await k.mouse.move(r.x + r.width / 2, cy(260), { steps: 6 }); await k.mouse.up(); await wait(400);
  check('…a swipe up from the bottom edge does not bring the food tray over his sleep, nor does PixelNourrir.open()',
    await k.evaluate(() => !PixelNourrir.trayOpen && !PixelNourrir.shown && !PixelNourrir.open() && !PixelNourrir.swipe(-200, 470) && Screens.local.sleepy));
  const meal0 = (S.nourrir.dernier || {}).id;
  act('nourrir.donner', { plat: 'pomme' });
  check('…the phone\'s panel still feeds him (nourrir.donner)', await until(() => (S.nourrir.dernier || {}).id !== meal0, 4000));
  await shot(k, 'kiosk-night-veil');
  act('habitudes.demo', { heure: null });
  await until(() => S.habitudes.horloge.pause, 3000);

  // the demo's paused clock: his quiet hours are his night (his pyjama)
  const h = new Date().getHours();
  act('caractere.set', { calme: { de: h, a: (h + 1) % 24 } });
  check('the demo (his clock paused): in his quiet hours, his pyjama on (the old night speaks again)', await until(() => S.look && S.look.porte && S.look.porte.nuit === true, 25000, 200));
  act('caractere.set', { calme: { de: 23, a: 23 } });
  check('…no quiet hours: off it comes', await until(() => S.look && S.look.porte && S.look.porte.nuit === false, 25000, 200));
  check('the Pi\'s screen: no page or console errors', kErr.length === 0, kErr.slice(0, 3).join(' | '));
  await kc.close();
}

/* ================= Pixel Lab: his screen and its fake server, with his friend Bip ================= */
async function lab(browser) {
  const lc = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const l = await lc.newPage(), lErr = errors(l);
  await l.goto(BASE + '/app/lab/index.html?themes=all');
  await until(() => l.evaluate(() => !!window.PixelHub && !!PixelHub.S.amis && !!PixelHub.S.habitudes && !!PixelHub.S.humeur && !!document.getElementById('amis-lab') && Screens.local.boot < 0), 15000);
  const D = (a, x) => l.evaluate(([aa, xx]) => PixelHub.dispatch(aa, xx || {}), [a, x]);
  const H = () => l.evaluate(() => JSON.parse(JSON.stringify(PixelHub.S)));
  await D('caractere.set', { calme: { de: 23, a: 23 } });     // the lab's paused clock: his quiet hours are his night; none, at any time of the test
  await l.evaluate(() => Screens.persona.setLife(false));     // no moment of life of his own meanwhile (an offer, a spider): the tests play theirs
  await until(() => l.evaluate(() => PixelHub.S.look && PixelHub.S.look.porte && PixelHub.S.look.porte.nuit === false), 5000);   // (at night his pyjama comes off first)
  await wait(600); await free(l);
  const hosting = () => l.evaluate(() => PixelAmis.state.hosting);
  const endVisit = async () => { await D('amis.raccompagne'); return until(async () => !(await hosting()) && !(await H()).amis.visite, 20000, 150); };

  /* ---- his mood question waits under a game and a visit, and comes back ---- */
  await D('lab.souvenirs', { quoi: 'question' });
  check('his mood question on his face (souvenirs)', await until(() => l.evaluate(() => PixelSouvenirs.view() === 'humeur' && Screens.addonTop === 'souvenirs'), 4000));
  await D('habitudes.jouer', { jeu: 'cache', par: 'test' });
  check('…a game comes first: the question waits under it', await until(() => l.evaluate(() => Screens.addonTop === 'jeu' && PixelSouvenirs.view() === 'humeur' && PixelSouvenirs.drawn === null), 4000));
  await D('habitudes.stop');
  check('…the game over: the question again, as it was', await until(() => l.evaluate(() => Screens.addonTop === 'souvenirs' && PixelSouvenirs.drawn === 'humeur'), 4000));
  await D('lab.amis', { quoi: 'visite' });
  check('…a friend comes (Bip): the visit comes first, the question waits under it', await until(() => l.evaluate(() => PixelAmis.state.hosting && Screens.addonTop === 'amis' && PixelSouvenirs.drawn === null && PixelSouvenirs.view() === 'humeur'), 5000));
  const t0 = (await H()).toast;
  await D('habitudes.jouer', { jeu: 'pfc', par: 'test' });
  const s1 = await H();
  check('…no game during a visit (« Pas maintenant : Bip est là ! »)', !s1.habitudes.partie && s1.toast && s1.toast.id !== (t0 && t0.id) && /Bip est là/.test(s1.toast.msg), s1.toast && s1.toast.msg);
  check('…nor a new question while he is busy with his friend (humeur.du false)', s1.humeur.du === false);
  await shot(l, 'lab-visit-over-question');
  check('…the visit over: the question comes back', !!(await endVisit()) && await until(() => l.evaluate(() => Screens.addonTop === 'souvenirs' && PixelSouvenirs.drawn === 'humeur'), 5000));
  await D('humeur.plustard'); await free(l);
  check('« Plus tard »: nothing over his face', await until(async () => (await top(l)) === '', 4000));

  /* ---- a coucou during a game: it peeps in after the game ---- */
  await D('habitudes.jouer', { jeu: 'pfc', par: 'test' });
  await until(() => l.evaluate(() => Screens.addonTop === 'jeu'), 4000);
  await D('lab.amis', { quoi: 'coucou' });
  await wait(1200);
  check('a coucou during a game: the game keeps his face, the news waits (no peek, no scene over the game)',
    await l.evaluate(() => Screens.addonTop === 'jeu' && PixelAmis.state.peek === '' && Screens.persona.state.cur !== 'ami-coucou'));
  await D('habitudes.stop');
  check('…the game over: his friend peeps in (the coucou, his scene)', await until(() => l.evaluate(() => PixelAmis.state.peek === 'coucou' && Screens.addonTop === 'amis' && Screens.persona.state.cur === 'ami-coucou'), 4000));
  await until(() => l.evaluate(() => !PixelAmis.state.peek), 9000);
  await free(l);

  /* ---- a joke during a visit: it plays to its end, then the visit goes on where its time is ---- */
  await D('lab.amis', { quoi: 'scene', s: 'ami-danse' });
  await until(() => l.evaluate(() => Screens.persona.state.cur === 'ami-danse'), 4000);
  await wait(1500);
  await D('habitudes.rire', { kind: 'blague' });
  const joke = await until(() => l.evaluate(() => (/^rire-blague/.test(Screens.persona.state.cur || '') ? Screens.persona.state.cur : '')), 3000);
  const dur = await l.evaluate(id => (Screens.persona.scenes.find(s => s.id === id) || {}).dur || 0, joke), began = Date.now(), kept = [];
  for (const ms of [800, Math.round(dur / 2), dur - 1200]) { await wait(Math.max(0, ms - (Date.now() - began))); kept.push(await l.evaluate(() => Screens.persona.state.cur)); }
  check(`a joke during a visit: it plays to its end (${joke}, ${dur} ms), the visit does not cut it`, !!joke && kept.every(c => c === joke), kept.join(','));
  const back = await until(() => l.evaluate(() => {
    const v = PixelHub.S.amis.visite, cur = Screens.persona.state.cur;
    if (!v || cur !== 'ami-danse') return null;
    return { e: Math.round(Screens.persona.current().e), at: Date.now() - v.t0 - (v.programme.find(x => x.id === 'ami-danse') || { at: 0 }).at };
  }), dur + 3000, 60);
  check('…then the visit goes on, where its time is now (the dance resumed, not from its start)', !!back && back.e > 6000 && Math.abs(back.e - back.at) < 1200, JSON.stringify(back));
  check('…his friend was there all along, beside him', await l.evaluate(() => PixelAmis.state.hosting && PixelAmis.state.guest));

  /* ---- « prends une photo » during a visit: the pose, the shot ---- */
  const taken0 = await l.evaluate(() => PixelAlbum.taken), toast0 = ((await H()).toast || {}).id;
  await D('album.photo');
  const posed = await until(() => l.evaluate(() => (Screens.persona.state.cur === 'album-pose' && (Screens.persona.current().e || 0) > 2700 ? 'posed' : '')), 6000, 60);
  check('« prends une photo » during a visit: he poses, the visit does not cut his pose', posed === 'posed');
  check('…the photo is taken (both of them in it), and the request is answered', await until(() => l.evaluate(t => PixelAlbum.taken > t && !PixelHub.S.album.demande, taken0), 6000));
  check('…then the visit goes on', await until(() => l.evaluate(() => Screens.persona.state.cur === 'ami-danse'), 8000));
  const s2 = await H();
  check('…and no « n\'a pas pu prendre la photo »', !(s2.toast && s2.toast.id !== toast0 && /pas pu/.test(s2.toast.msg)), s2.toast && s2.toast.msg);
  await endVisit(); await free(l);

  /* ---- the visit's photo goes with that visit's memory ---- */
  await D('souvenirs.ajoute', { type: 'ami', texte: 'Zia est venu jouer chez Pixel.' });
  await wait(2300);
  const oldId = (await H()).souvenirs.timeline.find(e => e.type === 'ami').id;
  await D('lab.amis', { quoi: 'scene', s: 'ami-photo' });
  const aphoto = await until(() => l.evaluate(() => { const p = PixelHub.S.album.photos.find(x => x.raison === 'ami'); return p ? p.id : ''; }), 12000, 120), shotAt = Date.now();
  check('« ami-photo »: his screen takes the photo of the two of them', !!aphoto);
  check('…the visit over, its memory has that photo; the older visit\'s memory has none', await until(async () => {
    const s = await H(), tl = s.souvenirs.timeline, m = tl.find(e => e.type === 'ami' && e.id !== oldId), o = tl.find(e => e.id === oldId);
    return !s.amis.visite && m && m.photo === aphoto && /Bip est venu jouer/.test(m.texte) && o && !o.photo;
  }, 15000, 200), JSON.stringify((await H()).souvenirs.timeline.filter(e => e.type === 'ami')));
  await free(l);

  /* ---- a won game's photo (the lab is his own screen too) ---- */
  await wait(Math.max(0, 21000 - (Date.now() - shotAt)));     // web/album.js: an automatic photo every 20 s at most
  await D('habitudes.jouer', { jeu: 'cache', par: 'test' });
  for (let i = 0; i < 60; i++) {
    const p = (await H()).habitudes.partie;
    if (!p || p.etat === 'fin') break;
    if (p.phase === 'cherche') await D('habitudes.coup', { id: p.id, manche: p.manche, cote: p.cachette });
    await wait(400);
  }
  check('a won game (cache-cache): its photo, « Une partie gagnée »', await until(() => l.evaluate(() => PixelHub.S.album.photos.some(p => p.raison === 'jeu')), 8000));
  await D('habitudes.stop'); await free(l);

  /* ---- his friend does not come while he sleeps or plays; falling asleep ends a visit ---- */
  const jr = async () => (await H()).amis.journal[0] || {};
  await D('habitudes.demo', { heure: '22:30' });
  await until(async () => (await H()).habitudes.dort, 3000);
  await D('lab.amis', { quoi: 'visite' });
  let j = await jr(), s3 = await H();
  check('Pixel Lab, his night: Bip does not come (« dort », as the Pi says it)', !s3.amis.visite && j.quoi === 'refuse' && j.refus === 'dort', JSON.stringify(j));
  await D('amis.visite', { ami: s3.amis.amis[0].id });
  s3 = await H();
  check('…and he does not go to Bip\'s (« Chut, Pixel dort… »)', !s3.amis.visite && /dort/.test((s3.toast || {}).msg || ''), (s3.toast || {}).msg);
  const asleepLook = await l.evaluate(() => PixelAmis.lookOf({ yeux: 'chat', accessoires: { tete: 'couronne' }, porte: { tete: 'chapeau', nuit: false } }));
  await D('habitudes.demo', { heure: null });
  await until(async () => (await H()).habitudes.horloge.pause, 3000); await free(l);
  const awakeLook = await l.evaluate(() => { const d = new Date(), y = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; return PixelAmis.lookOf({ yeux: 'chat', accessoires: { tete: 'couronne' }, porte: { tete: 'bonnet-nuit', cou: 'pyjama', nuit: true }, sans: { tete: y } }); });
  check('the visitor\'s look: what he chose (his crown), dressed by this house: not the night his card says, nor the slot he emptied at home',
    !!awakeLook && awakeLook.yeux === 'chat' && awakeLook.porte.tete === 'couronne' && awakeLook.porte.nuit === false && !awakeLook.porte.cou, JSON.stringify(awakeLook));
  check('…and this Pixel\'s night: asleep here, the visitor sleeps in his pyjama too', !!asleepLook && asleepLook.porte.nuit === true && asleepLook.porte.tete === 'bonnet-nuit', JSON.stringify(asleepLook));
  await D('habitudes.jouer', { jeu: 'cache', par: 'test' });
  await D('lab.amis', { quoi: 'visite' });
  j = await jr(); s3 = await H();
  check('…a game on: Bip does not come (« occupe »)', !s3.amis.visite && j.refus === 'occupe', JSON.stringify(j));
  await D('amis.visite', { ami: s3.amis.amis[0].id });
  s3 = await H();
  check('…and he does not set off (« On finit la partie… »)', !s3.amis.visite && /partie/.test((s3.toast || {}).msg || ''), (s3.toast || {}).msg);
  await D('habitudes.stop'); await free(l);
  await D('lab.amis', { quoi: 'scene', s: 'ami-danse' });
  await until(hosting, 4000);
  await D('habitudes.demo', { heure: '20:45', avant: 2 });
  const bye = await until(async () => { const v = (await H()).amis.visite; return v && v.programme[v.programme.length - 1].id === 'ami-aurevoir' ? v.programme.slice(-1)[0] : null; }, 8000, 150);
  check('a visit at his bedtime (his routine starts): his friend says goodbye', !!bye, JSON.stringify(bye));
  check('…and the visit ends', !!(await until(async () => !(await H()).amis.visite, 30000, 250)));

  /* ---- his pyjama at bedtime: no scene of its own, his habits' routine tells it; his own « bonjour » at wake-up ---- */
  await D('habitudes.demo', { heure: '20:45', avant: 6 });
  await free(l);
  const seen = new Set();
  await until(async () => { const c = await l.evaluate(() => Screens.persona.state.cur); if (c) seen.add(c); return seen.has('habitude-annonce') && (await H()).look.porte.nuit; }, 14000, 100);
  await wait(1500); seen.add(await l.evaluate(() => Screens.persona.state.cur));
  check('his bedtime by his schedule: « Bientôt l\'heure du dodo ! » (habitude-annonce), the pyjama comes, no look-dodo cutting it',
    seen.has('habitude-annonce') && !seen.has('look-dodo') && (await H()).look.porte.nuit, [...seen].join(','));
  await D('habitudes.apprendre', { moment: 'bonjour', phrase: 'Salut les loulous !' });
  await l.evaluate(() => PixelHabitudes.screen.sayOwn(true));
  await D('habitudes.demo', { heure: '07:30', avant: 4 });
  const said = new Set(), cur2 = new Set();
  await until(async () => { const x = await l.evaluate(() => [Screens.persona.state.cur, Screens.persona.state.say]); if (x[0]) cur2.add(x[0]); if (x[1]) said.add(x[1]); return said.has('Salut les loulous !'); }, 16000, 100);
  await l.evaluate(() => PixelHabitudes.screen.sayOwn(false));
  check('…his wake-up (habitude-reveil) says the « bonjour » you taught him, and no look-debout replaces it',
    cur2.has('habitude-reveil') && !cur2.has('look-debout') && said.has('Salut les loulous !') && !(await H()).look.porte.nuit, JSON.stringify({ cur: [...cur2], said: [...said] }));
  await D('habitudes.demo', { heure: null });
  await until(async () => (await H()).habitudes.horloge.pause, 3000); await free(l);

  /* ---- the lower part of the order: souvenirs over his night veil, his night veil over the exercise's offer ---- */
  await D('habitudes.demo', { heure: '23:30' });
  check('his night veil (habitudes)', await until(() => l.evaluate(() => Screens.local.sleepy && Screens.addonTop === 'habitudes'), 6000));
  await l.evaluate(() => Screens.persona.play('exo-envie'));
  check('…his offer « Une petite question ? » under it (exo-offre)', await l.evaluate(() => PixelExos.offering && Screens.addonTop === 'habitudes'));
  await D('lab.souvenirs', { quoi: 'question' });
  check('…a mood question over both (souvenirs)', await until(() => l.evaluate(() => Screens.addonTop === 'souvenirs'), 4000));
  await D('humeur.plustard'); await D('habitudes.demo', { heure: null });
  await until(async () => (await H()).habitudes.horloge.pause, 3000);
  check('Pixel Lab: no page or console errors', lErr.length === 0, lErr.slice(0, 3).join(' | '));
  await lc.close();
}

(async () => {
  if (await portOpen()) throw new Error(`le port ${PORT} est déjà pris (ENSEMBLE_PORT=… pour un autre)`);
  srv = spawn('python3', [path.join(APP, 'server.py'), '--demo', '--port', String(PORT), '--host', '127.0.0.1', '--config', cfg], { cwd: APP, stdio: 'ignore' });
  if (!(await until(portOpen, 15000))) throw new Error('le serveur de démo ne démarre pas');
  hub = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  hub.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'state') S = m.data; };
  await until(() => hub.readyState === 1 && S, 5000);
  check('the server\'s snapshot has the four: look, habitudes, souvenirs and humeur, amis', !!S.look && !!S.habitudes && !!S.souvenirs && !!S.humeur && !!S.amis, Object.keys(S).join(','));
  act('caractere.set', { calme: { de: 23, a: 23 } });         // the demo's paused clock: his quiet hours are his night; none, at any time of the test
  await until(() => S.caractere && S.caractere.calme && S.caractere.calme.de === 23 && S.caractere.calme.a === 23, 4000);
  const browser = await chromium.launch();
  try {
    await kiosk(browser);
    await lab(browser);
  } finally {
    await browser.close();
    hub.close(); srv.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`\n${fails} failure(s)`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); if (srv) srv.kill(); process.exit(1); });
