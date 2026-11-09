// Ses souvenirs, l'album et le carnet d'humeur in Chromium:  node tests/test_souvenirs.js [--shots DIR]
// Starts a demo server (port 8443, SOUVENIRS_PORT=… for another; a temporary data folder, every theme on) whose clock, like
// the pages', says 15:30 today in Paris (his questions are for the day), then:
// - the Pi's screen (800x480) and a phone (390x844), side by side: the mood question asked by Pixel's own screen when you
//   are there, shown on both (the kiosk's 5 big faces, the phone's screen and its « Carnet »); answered with a touch on the
//   kiosk (his hug for a sad day, on every screen), a few words, then changed from the phone; never asked again that day;
// - your birthday: the party once on his screen (souvenirs.fete = 'anniversaire', the cake, « Joyeux anniversaire Léa ! »),
//   and a photo of it, taken by the kiosk at 800 x 480, WebP under 120 Ko, without the info line nor the banner (an agenda
//   title and a notification on screen meanwhile are not in it), linked to its memory;
// - « Prends une photo ! » on the phone: the kiosk poses, the flash, the photo reaches the phone's album (a real picture,
//   800 x 480), ★, the full screen view and its « Enregistrer » link, « Supprimer »; never a photo during a cast;
//   PixelAlbum.snap() for another feature's moment; the phone itself never captures;
// - « montre l'album »: the slideshow on the kiosk, the album on the phone that typed it;
// - the phone's sheet in the 6 themes: no horizontal scroll, touch targets of 44 px at least, every text escaped;
// - Pixel sans Pi (the app's offline page, file://): the album on the phone (IndexedDB), across a reload, never in the state
//   the app copies; the mood journal and the birthday kept there too;
// - the same commands through the server and Pixel Lab's rules (pixel/souvenirs.py command and web/souvenirs.js command);
// - Pixel Lab: its « Souvenirs » panel, the party, a photo in memory, no error.
// Playwright must be installed (require('playwright')); nothing else.
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const APP = path.join(__dirname, '..'), PORT = Number(process.env.SOUVENIRS_PORT) || 8443, BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = (i => (i >= 0 ? process.argv[i + 1] : null))(process.argv.indexOf('--shots'));
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (name, ok, info = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (!ok && info ? `  [${info}]` : '')); if (!ok) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 8000, step = 100) => { const end = Date.now() + ms; let v; while (Date.now() < end) { if ((v = await fn())) return v; await wait(step); } return v; };
const portOpen = () => new Promise(r => { const s = net.connect(PORT, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
const THEMES = ['retro', 'moderne', 'manga', 'neon', 'croquis', 'lcd'];
const TZ = 'Europe/Paris';
process.env.TZ = TZ;
/* 15:30 today, in Paris: the server and the pages share this clock (OFF ms ahead of the real one) */
const OFF = (() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 15, 30).getTime() - n.getTime(); })();
const SHIFT = off => {
  const D = Date;
  class FD extends D { constructor(...a) { super(...(a.length ? a : [D.now() + off])); } static now() { return D.now() + off; } }
  window.Date = FD;
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-souvenirs-')), cfg = path.join(tmp, 'config.toml'), wrap = path.join(tmp, 'clock.py');
fs.writeFileSync(cfg, `data_dir = "${tmp}"\n[ui]\nthemes = ${JSON.stringify(THEMES)}\n`);
/* Pixel first started 40 days ago (his token, the oldest file of his data folder): the day you met is not today, he may ask
   how you are (never on the very first day); 40 days: no monthly celebration today */
fs.writeFileSync(path.join(tmp, 'token'), 'souvenirs-test'); { const t = (Date.now() + OFF) / 1000 - 40 * 86400; fs.utimesSync(path.join(tmp, 'token'), t, t); }
const NO_TALK = () => { try { const d = new Date(), j = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; localStorage.setItem('pixel.souvenirs.rappels', JSON.stringify({ jour: j, n: 9, t: Date.now() })); } catch { /* none */ } };   // no memory told out of the blue meanwhile
fs.writeFileSync(wrap, `import runpy, sys, time\nreal = time.time\noff = float(sys.argv[1]) / 1000\ntime.time = lambda: real() + off\nsys.argv = [${JSON.stringify(path.join(APP, 'server.py'))}] + sys.argv[2:]\nsys.path.insert(0, ${JSON.stringify(APP)})\nrunpy.run_path(sys.argv[0], run_name="__main__")\n`);
let srv = null, hub = null, S = null;
const act = (action, args = {}) => hub.send(JSON.stringify({ action, args }));
const errors = page => {
  const e = [];
  page.on('pageerror', x => e.push('pageerror: ' + x.message));
  page.on('console', m => { if (m.type() === 'error' && !/\/pixel\.apk$/.test(m.location().url || '')) e.push('console.error: ' + m.text()); });
  return e;
};
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
const crt = async (page, name) => { if (!SHOTS) return; const d = await page.evaluate(() => document.getElementById('crt').toDataURL('image/png')); fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(d.split(',')[1], 'base64')); };
async function tap(page, x, y) { const r = await page.locator('#crt').boundingBox(); await page.mouse.click(r.x + x / 800 * r.width, r.y + y / 480 * r.height); }
const here = page => page.evaluate(() => { Screens.local.lastInput = Screens.local.inputAt = performance.now() - 4000; Screens.local.sleepy = false; });   // someone touched him 4 s ago
const calm = page => page.evaluate(() => { Screens.persona.stop(); Screens.local.local = null; Screens.local.pack = null; });
const cur = page => page.evaluate(() => Screens.persona.state.cur);
const theme = async name => { act('theme.set', { name }); await until(() => S.view.theme === name, 3000); await wait(400); };

(async () => {
  if (await portOpen()) throw new Error(`le port ${PORT} est déjà pris (SOUVENIRS_PORT=… pour un autre)`);
  srv = spawn('python3', [wrap, String(OFF), '--demo', '--port', String(PORT), '--config', cfg], { cwd: APP, stdio: 'ignore', env: { ...process.env, TZ } });
  if (!(await until(portOpen, 20000))) throw new Error('le serveur de démo ne démarre pas');
  hub = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  hub.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'state') S = m.data; };
  await until(() => hub.readyState === 1 && S, 5000);
  check('the server\'s clock says 15:30 (the test\'s): his questions are for the day', new Date(S.server_now + 0).getHours() === new Date(Date.now() + OFF).getHours());
  check('the snapshot: souvenirs (fete null, today), humeur (private), album (empty)', S.souvenirs && S.souvenirs.fete === null && S.humeur && S.humeur.claude === false && S.album && S.album.photos.length === 0);
  check('the day you met: Pixel\'s first start, his oldest file (40 days ago)', S.souvenirs.depuis === 40 && S.souvenirs.rencontre_auto === true, JSON.stringify([S.souvenirs.rencontre, S.souvenirs.depuis]));
  const token = fs.readFileSync(path.join(tmp, 'token'), 'utf8').trim();
  const browser = await chromium.launch();

  /* ================= the Pi's screen and a phone ================= */
  const kc = await browser.newContext({ viewport: { width: 800, height: 480 }, deviceScaleFactor: 1, hasTouch: true, timezoneId: TZ });
  await kc.addInitScript(SHIFT, OFF); await kc.addInitScript(NO_TALK);
  const k = await kc.newPage(), kErr = errors(k);
  await k.goto(BASE + '/?kiosk=1');
  await until(() => k.evaluate(() => typeof Screens !== 'undefined' && Screens.local.boot < 0 && Screens.local.lastBootAt > 0 && !!window.PixelSouvenirs && !!window.PixelAlbum), 15000);
  await calm(k);
  const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: TZ });
  await pc.addInitScript(SHIFT, OFF);
  const ph = await pc.newPage(), pErr = errors(ph);
  await ph.goto(BASE + '/?t=' + token);
  await until(() => ph.evaluate(() => !!document.querySelector('.souv-go') && !document.querySelector('.souv-go').hidden), 15000);
  check('the phone: « Souvenirs » and « Album » under the keys', await ph.evaluate(() => [...document.querySelectorAll('.souv-go')].map(b => b.textContent).join() === 'Souvenirs,Album'));
  check('…not on the Pi\'s screen (its own view instead)', await k.evaluate(() => !document.querySelector('.souv-go') && !document.querySelector('#souv')));

  /* ---- the mood question: asked by his own screen when you are there, shown on both ---- */
  act('humeur.reglages', { heure: 7 * 60 }); await until(() => S.humeur.heure === 420 && S.humeur.du, 3000);
  check('from his time on, today\'s question is due (du)', S.humeur.du === true);
  await wait(1500);
  check('…nobody there: he does not ask', !S.humeur.question);
  await ph.evaluate(() => PixelSouvenirs.panel(true, 'carnet'));
  await here(k);
  const asked = await until(() => S.humeur.question, 6000);
  check('someone touched him a moment ago: his screen asks (humeur.pose)', !!asked);
  check('…the kiosk shows « Comment tu vas aujourd’hui ? » and its 5 faces', await until(() => k.evaluate(() => PixelSouvenirs.view() === 'humeur'), 3000));
  check('…so does the phone\'s screen, and its « Carnet »', await until(() => ph.evaluate(() => PixelSouvenirs.view() === 'humeur' && /Pixel te demande/.test(document.querySelector('#souvPane-carnet h3').textContent)), 3000));
  check('…the « Souvenirs » button says so when its sheet is closed', await ph.evaluate(() => { PixelSouvenirs.panel(false); const b = document.querySelector('.souv-go'); const live = b.classList.contains('live') && /•/.test(b.textContent); PixelSouvenirs.panel(true, 'carnet'); return live; }));
  for (const th of THEMES) { await theme(th); await crt(k, `kiosk-humeur-${th}`); }
  /* one thing at a time: an exercise and a cast come first, the food tray waits; the question waits under them, as it is */
  check('the question on his face screen, the food tray put away', await k.evaluate(() => PixelSouvenirs.drawn === 'humeur' && (!window.PixelNourrir || (!PixelNourrir.open() && !PixelNourrir.trayOpen))));
  act('exos.nouveau', { mode: 'exo', kind: 'addition', niveau: 1 });
  check('…an exercise opened (from the phone): it comes first, the question waits', await until(() => k.evaluate(() => PixelExos.open && PixelSouvenirs.drawn === null && PixelSouvenirs.view() === 'humeur'), 4000));
  act('exos.stop');
  check('…put away: the question again, as it was', await until(() => k.evaluate(() => !PixelExos.open && PixelSouvenirs.drawn === 'humeur'), 4000));
  act('cast.text', { text: 'À table !' });
  check('…a cast: over everything, the question under it', await until(() => k.evaluate(() => Screens.casting && PixelSouvenirs.drawn === null), 4000));
  act('cast.stop');
  check('…the cast over: the question again', await until(() => k.evaluate(() => !Screens.casting && PixelSouvenirs.drawn === 'humeur'), 4000) && !!S.humeur.question);
  await k.evaluate(() => Screens.menu(true));
  check('…the quick menu opens over it (its touches are the menu\'s)', await k.evaluate(() => Screens.menuOpen && PixelSouvenirs.drawn === 'humeur'));
  await k.evaluate(() => Screens.menu(false));
  check('…his exercise offer « Une petite question ? » waits while he asks', await k.evaluate(() => !PixelExos.canPropose({ day: true })));
  await theme('retro');
  await shot(ph, 'phone-question');
  const F = await k.evaluate(() => PixelSouvenirs.layout.faces.find(f => f.m === 'triste'));
  await tap(k, F.x + F.w / 2, F.y + F.h / 2);
  await until(() => S.humeur.aujourdhui, 4000);
  check('a touch on « Triste » on the kiosk: today\'s mood', S.humeur.aujourdhui && S.humeur.aujourdhui.m === 'triste', JSON.stringify(S.humeur.aujourdhui));
  check('…the question is gone everywhere', !S.humeur.question && await until(() => ph.evaluate(() => PixelSouvenirs.view() === null), 3000));
  check('…his answer to a sad day on the phone too: a hug (humeur-triste), kind words', await until(async () => (await cur(ph)) === 'humeur-triste', 3000));
  check('…on the kiosk, his hug beside a few words to choose (pas obligé)', await k.evaluate(() => PixelSouvenirs.view() === 'chips') && (await cur(k)) === 'humeur-triste');
  await crt(k, 'kiosk-chips-retro');
  const C = await k.evaluate(() => PixelSouvenirs.layout.chips);
  for (const id of ['ecole', 'fatigue']) { const c = C.find(x => x.id === id); await tap(k, c.x + c.w / 2, c.y + c.h / 2); }
  await tap(k, 654, 437);
  await until(() => S.humeur.aujourdhui && S.humeur.aujourdhui.chips.length === 2, 4000);
  check('…« École », « Fatigue », « C’est tout ! »: the words join the day', JSON.stringify(S.humeur.aujourdhui.chips) === '["ecole","fatigue"]', JSON.stringify(S.humeur.aujourdhui));
  check('…he did not play his hug twice', (await cur(ph)) === 'humeur-triste' || (await cur(ph)) === '');
  await wait(1500);
  await ph.evaluate(() => { const b = [...document.querySelectorAll('.souv-face')].find(x => /Bien/.test(x.textContent)); b.click(); });
  await until(() => S.humeur.aujourdhui.m === 'bien', 4000);
  check('changed from the phone (« Bien »): the day\'s mood, its words kept', S.humeur.aujourdhui.m === 'bien' && S.humeur.aujourdhui.chips.join() === 'ecole,fatigue');
  check('…the kiosk answers that one (humeur-bien)', await until(async () => (await cur(k)) === 'humeur-bien', 3000));
  await shot(ph, 'phone-carnet-answered');
  await calm(k); await here(k); await wait(2500);
  check('answered: he never asks again today', !S.humeur.question && S.humeur.du === false);
  check('the phone\'s week and month show the day in its colour', await ph.evaluate(() => { const d = document.querySelector('#souvPane-carnet .souv-week .souv-day.today'); return !!d && d.classList.contains('has') && /🙂/.test(d.textContent); }));

  /* ---- your birthday: the party once, and a photo of it without the info line nor the banner ---- */
  await calm(k); await k.evaluate(() => { localStorage.removeItem('pixel.souvenirs.fete-anniversaire'); });
  act('caractere.set', { surnom: 'Léa' }); await until(() => S.caractere.surnom === 'Léa', 3000); await wait(4500);
  await k.evaluate(() => {                               // an agenda title and a notification on screen, and a spy on what a photo draws
    const s0 = Screens.setState; window.__s0 = s0;
    Screens.setState = p => s0({ ...p, agenda: { ...(p.agenda || {}), events: [{ day: 0, allday: false, start: 23.5, end: 23.9, title: 'Dentiste secret' }] } });
    const C = CanvasRenderingContext2D.prototype, f0 = C.fillText; window.__shot = [];
    C.fillText = function (s, ...a) { if (this.canvas.id === 'crt' && Screens.local.shot) window.__shot.push(String(s)); return f0.call(this, s, ...a); };
  });
  const d = new Date(Date.now() + OFF);
  act('souvenirs.anniversaire', { jour: d.getDate(), mois: d.getMonth() + 1 });
  await until(() => S.souvenirs.fete === 'anniversaire', 4000);
  check('your birthday is today: souvenirs.fete = \'anniversaire\' (the other features\' party hat)', S.souvenirs.fete === 'anniversaire' && S.souvenirs.anniv_dans === 0);
  check('…the timeline remembers it', S.souvenirs.timeline.some(e => e.type === 'anniversaire'));
  await calm(k);
  await k.evaluate(() => { Screens.local.banner = { msg: '📱 WhatsApp : Maman', ms: 30000, t: performance.now() }; });   // a notification's banner, on screen all along
  await here(k);
  const party = await until(async () => (await cur(k)) === 'souvenir-anniversaire', 30000);   // (25 s at least between two of his initiatives: the question came just before)
  check('you are there: the party on his screen (the cake, the candles, the bunting)', !!party);
  await wait(1200); await crt(k, 'kiosk-fete-retro');
  const said = await k.evaluate(() => Screens.persona.state.say);
  check('…« Joyeux anniversaire, Léa ! »', said === 'Joyeux anniversaire, Léa !', said);
  const photo = await until(() => S.album.photos.find(p => p.raison === 'anniversaire'), 9000);
  check('…and a photo of it, sent by the kiosk', !!photo, JSON.stringify(S.album.photos));
  const drawn = await k.evaluate(() => window.__shot);
  check('…drawn without the info line (the agenda\'s title) nor the banner (the notification)', drawn.length > 0 && !drawn.some(s => /Dentiste|WhatsApp|Maman|SALON/i.test(s)), JSON.stringify(drawn.slice(0, 12)));
  const info = await ph.evaluate(async src => { const r = await fetch(src); const b = await r.blob(); const im = await createImageBitmap(b); return { type: b.type, size: b.size, w: im.width, h: im.height }; }, photo.src);
  check(`…800 x 480, WebP, under 120 Ko (${Math.round(info.size / 1024)} Ko), the phone sees it (its code in a cookie)`, info.w === 800 && info.h === 480 && info.type === 'image/webp' && info.size < 120 * 1024, JSON.stringify(info));
  check('…the memory of your birthday shows it', await until(() => S.souvenirs.timeline.some(e => e.type === 'anniversaire' && e.photo === photo.id), 3000));
  await k.evaluate(() => { Screens.setState = window.__s0; });
  await wait(9000); await calm(k); await here(k); await wait(2500);
  check('…once a day: not again', (await cur(k)) !== 'souvenir-anniversaire' && S.album.photos.filter(p => p.raison === 'anniversaire').length === 1);

  /* ---- « Prends une photo ! » on the phone: the kiosk poses, the flash, the photo reaches the phone ---- */
  await ph.evaluate(() => PixelSouvenirs.panel(true, 'album')); await wait(400);
  const n0 = S.album.photos.length;
  await ph.click('#souvPane-album .souv-btn.big');
  check('the phone\'s button: his screen poses (album-pose)', await until(async () => (await cur(k)) === 'album-pose', 4000));
  await until(() => k.evaluate(() => (Screens.persona.current().e || 0) > 1700), 3000); await crt(k, 'kiosk-pose-retro');
  const got = await until(() => S.album.photos.length > n0 && S.album.photos[0].raison === 'photo', 9000);
  check('…the flash, « Clic ! », and the photo in the album', !!got && !S.album.demande);
  check('…the phone never captures (only Pixel\'s own screen)', await ph.evaluate(() => PixelAlbum.taken === 0 && PixelAlbum.home === false));
  const shown = await until(() => ph.evaluate(() => { const im = document.querySelector('#souvPane-album .souv-ph img'); return im && im.complete && im.naturalWidth === 800 ? im.naturalHeight : 0; }), 5000);
  check('…on the phone, at the top of its grid (800 x 480)', shown === 480);
  await shot(ph, 'phone-album');
  await ph.click('#souvPane-album .souv-ph');
  check('a touch: the full screen view, its date and its reason', await until(() => ph.evaluate(() => !document.querySelector('.souv-view').hidden && /Une photo/.test(document.querySelector('.souv-cap').textContent)), 3000));
  const dl = await ph.evaluate(() => { const a = [...document.querySelectorAll('.souv-vbar a')].find(x => /Enregistrer/.test(x.textContent)); return a && { href: a.getAttribute('href'), dl: a.getAttribute('download') }; });
  check('…« Enregistrer »: a download link (?dl=1), a dated name', !!dl && /^\/album\/[A-Za-z0-9_-]{16}\.webp\?dl=1$/.test(dl.href) && /^pixel-\d{4}-\d\d-\d\d\.webp$/.test(dl.dl), JSON.stringify(dl));
  await ph.evaluate(() => [...document.querySelectorAll('.souv-vbar button')].find(b => /Préférée/.test(b.textContent)).click());
  check('…★ Préférée', await until(() => S.album.photos[0].fav === true, 3000));
  await shot(ph, 'phone-viewer');
  check('the back button closes the full screen view first, then the sheet', await ph.evaluate(() => { const a = PixelSheet.close(), v = document.querySelector('.souv-view').hidden, s1 = !document.getElementById('souv').hidden;
    const b = PixelSheet.close(), s2 = document.getElementById('souv').hidden; return a && v && s1 && b && s2; }));
  await ph.evaluate(() => PixelSouvenirs.panel(true, 'album'));
  await wait(300);
  await ph.evaluate(() => { const i = [...document.querySelectorAll('.souv-ph')]; i[i.length - 1].click(); });   // the oldest: the birthday's
  await wait(300);
  const del = await ph.evaluate(() => { const b = [...document.querySelectorAll('.souv-vbar button')].find(x => /Supprimer/.test(x.textContent)); b.click(); const sure = /Sûr/.test(b.textContent); b.click(); return sure; });
  check('…« Supprimer » asks a second touch, then the photo goes', del && await until(() => S.album.photos.length === n0 && !S.album.photos.some(p => p.raison === 'anniversaire'), 4000), `${S.album.photos.length} ${n0}`);
  check('…and its memory forgets it', await until(() => S.souvenirs.timeline.every(e => !e.photo), 3000));

  /* ---- never during a cast; another feature's moment ---- */
  act('cast.text', { text: 'Un secret de la maison' }); await until(() => S.cast, 3000); await wait(600);
  const nC = S.album.photos.length;
  await k.evaluate(() => PixelAlbum.snap('look'));
  await wait(3500);
  check('a cast on his screen: no photo (nothing of what you cast is copied)', S.album.photos.length === nC);
  act('cast.stop'); await until(() => !S.cast, 3000);
  await calm(k); await wait(1500);
  await k.evaluate(() => PixelAlbum.snap('ami'));
  check('PixelAlbum.snap(\'ami\') from another feature: a photo of that moment', !!(await until(() => S.album.photos.find(p => p.raison === 'ami'), 8000)));
  check('…a reason that is not one: « photo »', await k.evaluate(() => PixelAlbum.snap('<img onerror>') && PixelAlbum.pending && PixelAlbum.pending.reason === 'photo'));
  await wait(3000);

  /* ---- « montre l'album »: the kiosk's slideshow, the album on the phone that typed it ---- */
  await ph.evaluate(() => PixelSouvenirs.panel(false));
  await ph.fill('#cmd', 'montre l’album'); await ph.press('#cmd', 'Enter');
  check('« montre l’album » typed on the phone: the slideshow on his screen', await until(() => k.evaluate(() => PixelSouvenirs.view() === 'album'), 4000));
  check('…and the album opens on the phone', await until(() => ph.evaluate(() => PixelSouvenirs.isOpen && !document.getElementById('souvPane-album').hidden), 3000));
  await wait(700);
  for (const th of ['retro', 'manga', 'neon']) { await theme(th); await crt(k, `kiosk-diapo-${th}`); }
  await theme('retro');
  await tap(k, 748, 36);
  check('…its × closes it', await until(() => k.evaluate(() => PixelSouvenirs.view() === null), 3000));

  /* ---- the phone's sheet in the 6 themes ---- */
  act('souvenirs.ajoute', { type: 'perso', texte: '<img src=x onerror=alert(1)> on a fait un gâteau' }); await wait(2500);
  const layout = [];
  for (const th of THEMES) {
    await theme(th);
    for (const tab of ['souvenirs', 'carnet', 'album']) {
      await ph.evaluate(t => PixelSouvenirs.panel(true, t), tab); await wait(350);
      await shot(ph, `phone-${tab}-${th}`);
      layout.push(await ph.evaluate(([th, tab]) => {
        const sheet = document.querySelector('.souv-sheet'), small = [];
        for (const b of sheet.querySelectorAll('button, select, input, a.souv-btn')) { const r = b.getBoundingClientRect(); if (r.width && (r.height < 44 || r.width < 44)) small.push((b.textContent || b.getAttribute('aria-label') || b.tagName).trim().slice(0, 20) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); }
        return { th, tab, wide: document.documentElement.scrollWidth > innerWidth || sheet.scrollWidth > sheet.clientWidth + 1, small, imgs: sheet.querySelectorAll('img:not([src^="/album/"])').length };
      }, [th, tab]));
    }
  }
  check('the sheet in the 6 themes, its 3 tabs: no horizontal scroll', layout.every(x => !x.wide), JSON.stringify(layout.filter(x => x.wide)));
  check('…touch targets of 44 px at least', layout.every(x => !x.small.length), JSON.stringify(layout.filter(x => x.small.length).map(x => [x.th, x.tab, x.small])));
  check('…what you write stays text (no tag made of it)', layout.every(x => !x.imgs) && await ph.evaluate(() => /<img src=x/.test(document.querySelector('#souvPane-souvenirs') ? document.querySelector('#souvPane-souvenirs').textContent : '') || true));
  await ph.evaluate(() => PixelSouvenirs.panel(true, 'souvenirs')); await wait(300);
  check('…the memory written with a tag in it shows as plain text', await ph.evaluate(() => [...document.querySelectorAll('.souv-tl p')].some(p => p.textContent.startsWith('<img src=x onerror=alert(1)>')) && !document.querySelector('.souv-tl img:not(.souv-thumb)')));
  await theme('retro');
  check('no page or console error on the kiosk', kErr.length === 0, kErr.slice(0, 3).join(' | '));
  check('…nor on the phone', pErr.length === 0, pErr.slice(0, 3).join(' | '));
  await kc.close(); await pc.close();

  /* ================= the same commands through the server and Pixel Lab's rules ================= */
  const phrases = ['prends une photo', 'montre l’album', "mon anniversaire c'est le 12 mars", 'Mon anniversaire, c’est le 1er mai.', 'je suis née le 29 février 2016',
    "mon anniversaire c'est le 31 février", "c'est quand mon anniversaire ?", 'tu te souviens ?', 'je suis contente', 'je suis fatigué', 'je suis en colère aujourd’hui',
    'ça va pas', 'bof', 'mon anniversaire c’est bientôt', 'je suis contente de te voir', 'album de famille', 'photo de chat ?', 'triste'];
  const py = JSON.parse(execFileSync('python3', ['-c', `
import asyncio, json, sys
sys.path.insert(0, ".")
from pixel import souvenirs
from pixel.state import Hub
class Album: pass
out = []
async def go():
    for t in json.load(sys.stdin):
        hub = Hub({}, demo=True); hub.album = Album(); S = souvenirs.Souvenirs(hub, None); hub.souvenirs = S; seen = []
        async def d(n, a=None): seen.append([n, a or {}])
        hub.dispatch = d
        r = await souvenirs.command(hub, souvenirs.norm(t), t)
        out.append(seen[0] if seen else ("toast" if r else None))
asyncio.run(go())
print(json.dumps(out))`], { cwd: APP, input: JSON.stringify(phrases) }).toString());
  const lb = await browser.newPage();
  await lb.goto(BASE + '/app/lab/index.html');
  await until(() => lb.evaluate(() => !!window.PixelSouvenirs && !!PixelSouvenirs.rules), 10000);
  const js = await lb.evaluate(ps => ps.map(t => { const r = PixelSouvenirs.rules.command(t, {}); return r ? (r.toast ? 'toast' : [r.action, r.args]) : null; }), phrases);
  const diff = phrases.filter((t, i) => JSON.stringify(py[i]) !== JSON.stringify(js[i])).map((t, i) => `${t}: ${JSON.stringify(py[phrases.indexOf(t)])} / ${JSON.stringify(js[phrases.indexOf(t)])}`);
  check(`the ${phrases.length} phrases: the same through the server and Pixel Lab (Pixel sans Pi runs the lab's)`, diff.length === 0, diff.join(' ; '));
  const dates = await lb.evaluate(() => { const R = PixelSouvenirs.rules, D = (y, m, d) => new Date(y, m - 1, d), f = (t, a, r) => JSON.stringify(R.fete(t, a, r));
    return [f(D(2027, 2, 28), { jour: 29, mois: 2 }, null), f(D(2028, 2, 29), { jour: 29, mois: 2 }, null), f(D(2026, 2, 28), null, D(2026, 1, 31)), f(D(2027, 1, 15), null, D(2026, 12, 15)),
      f(D(2027, 12, 15), null, D(2026, 12, 15)), f(D(2025, 2, 28), null, D(2024, 2, 29)), f(D(2026, 4, 11), null, D(2026, 1, 1))]; });
  const pyd = JSON.parse(execFileSync('python3', ['-c', `
import json, sys, datetime as dt
sys.path.insert(0, ".")
from pixel.souvenirs import fete
D = dt.date
print(json.dumps([json.dumps(x, separators=(",", ":")) for x in [fete(D(2027, 2, 28), {"jour": 29, "mois": 2}, None), fete(D(2028, 2, 29), {"jour": 29, "mois": 2}, None),
  fete(D(2026, 2, 28), None, D(2026, 1, 31)), fete(D(2027, 1, 15), None, D(2026, 12, 15)), fete(D(2027, 12, 15), None, D(2026, 12, 15)),
  fete(D(2025, 2, 28), None, D(2024, 2, 29)), fete(D(2026, 4, 11), None, D(2026, 1, 1))]]))`], { cwd: APP }).toString());
  check('…and the same celebrations (29 February, 31 January, the year\'s turn, 100 days)', JSON.stringify(dates) === JSON.stringify(pyd), JSON.stringify({ dates, pyd }));
  await lb.close();

  /* ================= Pixel Lab: its panel, the party, a photo in memory ================= */
  const lc = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: TZ });
  await lc.addInitScript(SHIFT, OFF);
  const lab = await lc.newPage(), lErr = errors(lab);
  await lab.goto(BASE + '/app/lab/index.html?themes=all');
  await until(() => lab.evaluate(() => typeof Screens !== 'undefined' && Screens.local.boot < 0 && !!document.getElementById('hSouvenirs')), 15000);
  check('Pixel Lab: a « Souvenirs » panel after « Exos de maths »', await lab.evaluate(() => { const s = document.getElementById('hSouvenirs').closest('section'); return s.previousElementSibling && s.previousElementSibling.querySelector('#hExos') !== null; }));
  await lab.evaluate(() => [...document.querySelectorAll('#souvenirs button')].find(b => /anniversaire aujourd/.test(b.textContent)).click());
  check('…« Ton anniversaire aujourd’hui »: the party', await until(() => lab.evaluate(() => Screens.persona.state.cur === 'souvenir-anniversaire'), 4000));
  check('…its photo, kept in the page', await until(() => lab.evaluate(() => PixelHub.S.album.photos.some(p => p.raison === 'anniversaire' && /^blob:/.test(p.src))), 8000));
  await lab.evaluate(() => { Screens.persona.stop(); [...document.querySelectorAll('#souvenirs button')].find(b => /Il demande maintenant/.test(b.textContent)).click(); });
  check('…« Il demande maintenant »: the mood question on its screen', await until(() => lab.evaluate(() => PixelSouvenirs.view() === 'humeur'), 3000));
  const poses = await lab.evaluate(async () => {           // his character of the day colours his scenes: a farceur makes a face for the photo
    const out = {};
    for (const [name, f] of [['farceur', 92], ['serieux', 10], ['pixel', 50]]) {
      PixelHub.dispatch('caractere.set', { traits: { farceur: f } }); await new Promise(r => setTimeout(r, 300));
      Screens.persona.stop(); Screens.persona.play('album-pose'); await new Promise(r => setTimeout(r, 1900));
      out[name] = Screens.persona.state.say; Screens.persona.stop();
    }
    PixelHub.dispatch('caractere.reset'); return out;
  });
  check('…his character colours them: a farceur pulls a face for the photo, a serious one stands straight, at 50 « Cheese ! »',
    ['Attends… une grimace !', 'Bleuh ! Clic !', 'Tadaa, ma tête de clown !'].includes(poses.farceur) && ['Je me tiens bien droit.', 'Bien sage pour la photo.', 'Je souris poliment.'].includes(poses.serieux)
    && ['Cheese !', 'Ouistiti !', 'Souriez !'].includes(poses.pixel), JSON.stringify(poses));
  check('…no page or console error in the lab', lErr.length === 0, lErr.slice(0, 3).join(' | '));
  await lc.close();

  /* ================= Pixel sans Pi: the album on the phone ================= */
  const FILE = path.join(tmp, 'pixel-local.html'), PAGE = 'file://' + FILE;
  execFileSync('python3', [path.join(APP, 'tools', 'build_app_bundle.py'), FILE], { stdio: 'pipe' });
  const oc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: TZ });
  await oc.addInitScript(SHIFT, OFF);
  const net0 = []; await oc.route('**/*', r => { if (r.request().url() === PAGE) return r.continue(); net0.push(r.request().url()); return r.abort(); });
  const lp = await oc.newPage(), oErr = errors(lp);
  await lp.goto(PAGE);
  await until(() => lp.evaluate(() => !!window.PixelSouvenirs && !!PixelSouvenirs.mirror && typeof Screens !== 'undefined' && Screens.local.boot < 0), 20000);
  check('Pixel sans Pi: this page is Pixel\'s own screen (it takes the photos)', await lp.evaluate(() => PixelAlbum.home === true));
  await lp.evaluate(() => { Screens.persona.stop(); PixelHub.dispatch('album.photo'); });
  check('…« Prends une photo »: he poses here, the photo stays on the phone (IndexedDB)', await until(() => lp.evaluate(() => PixelHub.S.album.photos.length === 1 && PixelAlbum.store.mode === 'idb'), 9000));
  const sz = await lp.evaluate(async () => { const p = PixelHub.S.album.photos[0], b = await (await fetch(p.src)).blob(), im = await createImageBitmap(b); return { w: im.width, h: im.height, kb: Math.round(b.size / 1024) }; });
  check(`…smaller there: 640 x 384 (${sz.kb} Ko)`, sz.w === 640 && sz.h === 384 && sz.kb < 120, JSON.stringify(sz));
  await lp.evaluate(() => { PixelHub.dispatch('humeur.note', { m: 'super', chips: ['jeux'] }); PixelHub.dispatch('souvenirs.anniversaire', { jour: 3, mois: 12 }); });
  await wait(1500);
  const kept = await lp.evaluate(() => { const s = localStorage.getItem('pixel_local') || ''; return { len: s.length, image: /data:image|RIFF|\/9j\//.test(s), humeur: /"super"/.test(s), anniv: /"mois":12/.test(s) }; });
  check('…what the app copies (the state, pixel_local) holds no picture, but the journal and the birthday', !kept.image && kept.len < 60000 && kept.humeur && kept.anniv, JSON.stringify(kept));
  await lp.evaluate(() => PixelSouvenirs.panel(true, 'album')); await wait(500); await shot(lp, 'local-album');
  await lp.reload();
  await until(() => lp.evaluate(() => !!window.PixelSouvenirs && !!PixelSouvenirs.mirror), 20000); await wait(1500);
  const after = await lp.evaluate(() => ({ n: PixelHub.S.album.photos.length, blob: /^blob:/.test((PixelHub.S.album.photos[0] || {}).src || ''), m: PixelHub.S.humeur.aujourdhui && PixelHub.S.humeur.aujourdhui.m, a: PixelHub.S.souvenirs.anniv }));
  check('…after a restart: the photo, today\'s mood, the birthday', after.n === 1 && after.blob && after.m === 'super' && after.a && after.a.mois === 12, JSON.stringify(after));
  check('…nothing fetched, no error', net0.length === 0 && oErr.length === 0, JSON.stringify(net0.slice(0, 3)) + ' ' + oErr.slice(0, 2).join(' | '));
  await oc.close();
  await browser.close();
})().catch(e => { console.log('FAIL ' + (e && e.stack || e)); fails++; }).finally(() => {
  if (srv) srv.kill();
  try { if (hub) hub.close(); } catch { /* closed */ }
  console.log(`\n${fails} failure(s)`);
  process.exit(fails ? 1 : 0);
});
