// Pixel sans Pi in a real browser:  node tests/test_local.js [--shots DIR]
// Builds the phone app's offline page (tools/build_app_bundle.py) and opens it as a file:// page, as the Android app does,
// with every network request blocked (none must be made), in Chromium (Playwright):
// - the bundle: one file, every script of web/index.html, the local hub just before app.js, the fonts inside, nothing to fetch;
// - a phone held upright (390x844): no page or console error, no WebSocket; he lives and reacts to a tap; nothing fake
//   (no lights, agenda, Claude or Codex lines, no Pi measures, no demo city); the screens that need the Pi say so, their keys
//   stay dark, and so do the typed commands that need it; Système shows the phone's own measures, and its Démarrage replays
//   his boot check with the phone's parts; every theme is his to wear; the commands that work here work (moods, scenes, the
//   help); the timer runs and rings; the settings, a lasting mood and the timer survive a reload (localStorage), and so does
//   the state of a feature this file does not know (a key of the hub's state), also one whose truth is in a closure;
// - in the app (window.ReactNativeWebView stubbed): the page sends its state ({local_save}), its mode, opens the app's menu
//   from "Pixel sur ce téléphone ⋯", answers the app's ping; the app's copy (window.PIXEL_LOCAL_STATE) restores him, and
//   so does the last snapshot of his Pi (the same theme, themes and settings), the newest one winning, also when it comes
//   late, also after the weather of the day came in; a broken or foreign state is ignored; a phone notification the app
//   hands over (no Pi linked) is shown as his Pi would show it, and he reacts;
// - his character, his meals and his exercises (caractère, nourrir, exos) with no Pi: seeded from his Pi's snapshot (its
//   shapes), they work here, survive a restart; his belly counts the time the app was closed as nourrir.py counts the Pi
//   down; the page tells the app its panels ({panels}) and the app's menu opens them (PixelPanel), even from Pixel mode;
//   the back button closes an open one first ({sheet}, PixelSheet); a touch in them is use and an open exercise is busy
//   for the app's ping; his Pi's snapshot as old as the phone's copy does not undo what he lived here; nothing of the
//   Pi's own (« telephone ») is kept, here or in the app (local.js SKIP = localStore.ts PI_ONLY);
// - the weather: real (Open-Meteo, here answered by the test), for the city typed, kept; a city typed while another one's
//   forecast is on its way never gets that one's forecast; a typo keeps the good city; without network, a word, no error;
// - a phone held sideways: the Pixel de poche, his face alone; a tap, a long press (a cuddle); no voyage button (no Pi);
//   the phone going offline is no reason to say he is far from home; his plate and tray (Nourrir) feed him; the app hears {poche: true, bg} and its accelerometer
//   (PixelPoche.native, as pixel-mobile/src/poche.ts feeds it) makes him dizzy; the phone tilted in hand counts as play for
//   the app's ping, a phone still on its stand does not.
// --shots DIR: screenshots. Playwright must be installed (require('playwright')); nothing else.
const { chromium, devices } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const APP = path.join(__dirname, '..'), WEB = path.join(APP, 'web');
const SHOTS = (i => (i >= 0 ? process.argv[i + 1] : null))(process.argv.indexOf('--shots'));
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (name, ok, info = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (!ok && info ? `  [${info}]` : '')); if (!ok) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 6000, step = 100) => { const end = Date.now() + ms; let v; while (Date.now() < end) { if ((v = await fn())) return v; await wait(step); } return v; };

/* ---------- the bundle ---------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-local-')), FILE = path.join(tmp, 'pixel-local.html'), PAGE = 'file://' + FILE;
execFileSync('python3', [path.join(APP, 'tools', 'build_app_bundle.py'), FILE], { stdio: 'pipe' });
const html = fs.readFileSync(FILE, 'utf8'), index = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const want = [...index.matchAll(/<script\s+src="app\/([^"]+)"/g)].map(m => m[1]), got = [...html.matchAll(/<script>\/\* ([^ ]+) \*\//g)].map(m => m[1]);
check('the bundle: every script of index.html, in order, with the local hub (demo-hub.js, local.js) just before app.js',
  JSON.stringify(got) === JSON.stringify([...want.slice(0, -1), 'lab/demo-hub.js', 'local.js', 'app.js']), got.join(' '));
const sheets = [...index.matchAll(/<link\s+rel="stylesheet"\s+href="app\/([^"]+)"/g)].map(m => m[1]);
check(`…every stylesheet of index.html inside (${sheets.join(', ')})`, sheets.length >= 5 && sheets.every(f => {
  const css = fs.readFileSync(path.join(WEB, f), 'utf8').split('\n').find(l => l.trim() && !/url\(|^\s*\/\*|^@font-face/.test(l));
  return !!css && html.includes(css.trim());
}), sheets.join(' '));
check('…window.PIXEL_LOCAL set before any script', html.indexOf('window.PIXEL_LOCAL =') > 0 && html.indexOf('window.PIXEL_LOCAL =') < html.indexOf('<script>/* '));
check('…nothing it would fetch: no <link>, no src=, no url() but data:', !/<link\b/i.test(html) && !/\ssrc=["']/i.test(html.replace(/<script>[\s\S]*?<\/script>/g, '')) && !/url\((?!"data:)/.test(html.split('</style>')[0]));
const fonts = JSON.parse(fs.readFileSync(path.join(WEB, 'fonts.json'), 'utf8'));
check(`…the ${fonts.length} fonts inside (base64 @font-face)`, (html.match(/url\("data:font\/ttf;base64,/g) || []).length >= fonts.length);
check('…one file, under 6 MB', html.length < 6e6, String(html.length));
/* the Pi's own parts are kept neither here (local.js SKIP) nor in the app's copy of his Pi's snapshot (localStore.ts PI_ONLY) */
const listed = (file, name) => { try { const m = new RegExp(`const ${name} = new Set\\(\\[([^\\]]+)\\]`).exec(fs.readFileSync(file, 'utf8')); return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : null; } catch { return null; } };
const SKIP = listed(path.join(WEB, 'local.js'), 'SKIP'), PI_ONLY = listed(path.join(APP, '..', 'pixel-mobile', 'src', 'localStore.ts'), 'PI_ONLY');
if (PI_ONLY) check('local.js SKIP and the app\'s PI_ONLY (pixel-mobile localStore.ts) name the same parts of his Pi (« telephone » too)', !!SKIP && SKIP.includes('telephone')
  && PI_ONLY.every(k => SKIP.includes(k)) && SKIP.every(k => PI_ONLY.includes(k) || ['view', 'settings', 'weather', 'kept_at'].includes(k)), JSON.stringify({ SKIP, PI_ONLY }));

/* ---------- the browser: nothing but the page itself may load ---------- */
const net = [];
async function phone(browser, opt = {}) {
  const ctx = await browser.newContext(opt.device || { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.route('**/*', r => {
    const u = r.request().url();
    if (u === PAGE) return r.continue();
    if (opt.weather && /open-meteo\.com/.test(u)) return opt.weather(r);
    net.push(u); return r.abort();
  });
  await ctx.addInitScript(() => {
    window.__ws = 0; const WS = window.WebSocket; window.WebSocket = function (...a) { window.__ws++; return new WS(...a); }; Object.assign(window.WebSocket, WS);
    window.__txt = []; const ft = CanvasRenderingContext2D.prototype.fillText;   // what his screen says
    CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { if (window.__txt.length < 3000) window.__txt.push(String(t)); return ft.call(this, t, ...a); };
  });
  if (opt.app) await ctx.addInitScript(() => { window.__rn = []; window.ReactNativeWebView = { postMessage: m => window.__rn.push(JSON.parse(m)) }; });
  if (opt.senses) await ctx.addInitScript(() => { window.PixelApp = Object.assign(window.PixelApp || {}, { senses: true }); });   // src/poche.ts beforeLoad
  if (opt.given) await ctx.addInitScript(g => { window.PIXEL_LOCAL_STATE = g; }, opt.given);
  if (opt.feature) await ctx.addInitScript(() => {     // a feature this test knows nothing about: a key of the hub's state
    let hub; Object.defineProperty(window, 'PixelHub', { configurable: true, get: () => hub, set: v => { if (v && v.S && !v.S.jouet) v.S.jouet = { trait: 'calme', faim: 3 }; hub = v; } });
  });
  if (opt.closure) await ctx.addInitScript(() => {     // a feature whose truth is in a closure (like nourrir): S.ventre is only its published copy
    let hub; Object.defineProperty(window, 'PixelHub', { configurable: true, get: () => hub, set: v => {
      hub = v; if (!v || !v.local) return;
      const N = { ventre: 70, repas: [] }, publish = () => { v.S.ventre = { ventre: N.ventre, repas: N.repas.slice() }; };
      v.local.A['ventre.donner'] = () => { N.ventre = Math.min(100, N.ventre + 10); N.repas = [Date.now(), ...N.repas].slice(0, 10); publish(); };
      if (v.local.restorable) v.local.restorable('ventre', x => { if (x && Number.isFinite(x.ventre)) N.ventre = Math.max(0, Math.min(100, x.ventre)); if (x && Array.isArray(x.repas)) N.repas = x.repas.slice(0, 10); publish(); });
      setInterval(() => { publish(); v.local.mark(); }, 250);   // its clock (nourrir: every minute), from the closure
      publish();
    } });
  });
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !(opt.offlineOk && /Failed to load resource|ERR_FAILED/.test(m.text()))) errs.push('console.error: ' + m.text()); });
  await page.goto(PAGE);
  await until(() => page.evaluate(() => !!window.PixelLocal && /téléphone/.test(document.getElementById('conn').textContent)), 8000);
  await page.waitForTimeout(400);
  return { ctx, page, errs };
}
const S = (page, f) => page.evaluate(f);
const said = async (page, ms = 700) => { await page.evaluate(() => { window.__txt.length = 0; }); await page.waitForTimeout(ms); return page.evaluate(() => window.__txt.join(' | ')); };
const toast = page => page.evaluate(() => (PixelHub.S.toast || {}).msg || '');
const key = (page, i) => page.locator('#keys .key').nth(i).click();
const NAV = ['visage', 'lumieres', 'claude', 'codex', 'meteo', 'minuteur', 'agenda', 'systeme', 'reglages', 'veille'];
const go = async (page, scr) => { await key(page, NAV.indexOf(scr)); await page.waitForTimeout(250); };
const type = async (page, text) => { await page.fill('#cmd', text); await page.press('#cmd', 'Enter'); await page.waitForTimeout(250); };
const point = async (page, u = 400, v = 240) => { const r = await page.locator('#crt').boundingBox(); return { x: r.x + u / 800 * r.width, y: r.y + v / 480 * r.height }; };
const scene = page => page.evaluate(() => Screens.persona.state.cur);
const group = (page, id) => page.evaluate(id => (Screens.persona.scenes.find(s => s.id === id) || {}).group || '', id);
const free = page => page.evaluate(() => { Screens.persona.stop(); Screens.local.local = null; Screens.local.pack = null; Screens.input(); });
const moving = page => page.evaluate(async () => {
  const c = document.getElementById('crt'), g = c.getContext('2d'), a = g.getImageData(0, 0, c.width, c.height).data.slice();
  await new Promise(r => setTimeout(r, 1500));
  const b = g.getImageData(0, 0, c.width, c.height).data; let n = 0;
  for (let i = 0; i < a.length; i += 16) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) n++;
  return n;
});
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
const kept = page => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('pixel_local')); } catch { return null; } });

(async () => {
  const browser = await chromium.launch();

  /* ================= a phone, no Pi, no app ================= */
  let { ctx, page, errs } = await phone(browser);
  check('local mode: the local hub and its socket, no WebSocket at all', await S(page, () => window.__ws === 0 && !!PixelLocal && document.body.classList.contains('solo')));
  check('the page says where he lives, without the Pi\'s links (mirror, agendas, the APK)', await S(page, () =>
    document.getElementById('conn').textContent === 'Pixel sur ce téléphone' && document.getElementById('follow').hidden && document.querySelector('a[href$="reglages.html"]').hidden && document.getElementById('apk').hidden));
  check('he lives: his face moves by itself', (await moving(page)) > 30);
  await free(page); await page.waitForTimeout(300);
  const fp = await point(page); await page.touchscreen.tap(fp.x, fp.y); await page.waitForTimeout(400);
  const sc = await scene(page);
  check('a tap on his face: he reacts', ['tap', 'fache', 'retour'].includes(await group(page, sc)), String(sc));
  await shot(page, 'phone-visage');
  const fake = await S(page, () => {
    const s = PixelHub.S, snap = JSON.stringify(PixelHub.snapshot());
    return { rooms: s.lights.rooms.length + s.lights.scenes.length, chat: s.chat.messages.length, agenda: s.agenda.events.length, codex: s.codex.lines.length + s.codex.task.length,
      sys: Object.keys(s.sys).filter(k => !['bright', 'hw_bright'].includes(k)), demo: s.settings.demo, qr: (s.settings.qr || []).length, done: s.timer.done, days: !!(s.weather && s.weather.days),
      words: (snap.match(/démo|Salon|Bureau|Cuisine|Stand-up|Léa|Dentiste|192\.168|Paris|Raspberry|Stream Deck MK/g) || []) };
  });
  check('nothing fake: no lights, Claude, agenda or Codex lines, no Pi measures, no demo data', !fake.rooms && !fake.chat && !fake.agenda && !fake.codex && !fake.sys.length && fake.demo === false && !fake.qr && !fake.done && !fake.days && !fake.words.length, JSON.stringify(fake));
  for (const [scr, word] of [['lumieres', 'lampes'], ['claude', 'Claude'], ['codex', 'Codex'], ['agenda', 'agendas']]) {
    await go(page, scr); const t = await said(page);
    const dark = await page.evaluate(() => [...document.querySelectorAll('#keys .key.act')].every(b => b.disabled));
    check(`${scr}: « Relie Pixel à ton Pi pour ça », why, and its keys stay dark`, t.includes('Relie Pixel à ton Pi pour ça') && t.includes(word) && dark, t.slice(0, 200));
    await shot(page, 'phone-' + scr);
  }
  await go(page, 'systeme'); let t = await said(page);
  check('Système: the phone\'s own measures (network, screen), none of the Pi\'s', /RÉSEAU/.test(t) && /ÉCRAN/.test(t) && /390 × 844/.test(t) && !/TEMPÉRATURE|DISQUE|MÉMOIRE/.test(t), t.slice(0, 300));
  const sysKeys = () => S(page, () => [...document.querySelectorAll('#keys .key.act')].map(b => b.disabled ? '-' : b.textContent).join('|'));
  check('…its keys: brightness, CRT, his boot, sleep', (await sysKeys()) === 'Lumi. −|Lumi. +|Effet\nCRT|Démar-\nrage|Veille', await sysKeys());
  await page.locator('#keys .key').nth(10).click(); await page.waitForTimeout(200);
  check('…Lumi. − dims his screen on the phone', await S(page, () => PixelHub.S.sys.bright < 1 && /brightness/.test(document.getElementById('screen').style.filter)));
  await page.locator('#keys .key').nth(11).click(); await page.waitForTimeout(200);
  await shot(page, 'phone-systeme');
  await page.locator('#keys .key').nth(13).click(); await page.waitForTimeout(1900); t = await said(page, 400);
  check('…Démarrage: his boot check, with the phone\'s parts, no Pi\'s', await S(page, () => PixelHub.S.boot_at > 0 && Screens.local.boot >= 0) && /Téléphone/i.test(t) && /pas relié/i.test(t) && !/Pont Hue|Stream Deck|Raspberry Pi 4|Écran 7/i.test(t) && !/Relie Pixel/.test(await toast(page)), t.slice(0, 300));
  await shot(page, 'phone-demarrage');
  await until(() => S(page, () => Screens.local.boot < 0), 4000);
  await go(page, 'reglages'); t = await said(page);
  const qr = await S(page, () => {                     // the QR code's light square (Rétro: #e4ffe9) where the Pi shows it
    const c = document.getElementById('crt'), k = c.width / 800, d = c.getContext('2d').getImageData(24 * k, 64 * k, 200 * k, 200 * k).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 230 && d[i + 2] > 200) n++;
    return n;
  });
  check('Réglages: no QR code, how to link his Pi; the face choice is there', /Pas de Pi relié/.test(t) && /«\sRelier\sà\smon\sPixel\s»/.test(t) && /Vivant/.test(t) && qr < 50, `${qr} light pixels · ${t.slice(0, 200)}`);
  check('…and every theme to choose from (no Pi to switch them on)', /THÈME/i.test(t) && ['Rétro', 'Néon', 'Croquis', 'LCD'].every(n => t.toLowerCase().includes(n.toLowerCase())) && await S(page, () => PixelHub.THEMES.length === PixelHub.ALLT.length && PixelHub.ALLT.length > 1), t.slice(0, 300));
  check('…its keys: no "Associer Hue"', await S(page, () => ![...document.querySelectorAll('#keys .key.act')].some(b => /Hue/.test(b.textContent))));
  await shot(page, 'phone-reglages');
  await go(page, 'meteo'); t = await said(page);
  check('Météo with no city: how to choose one, no fake weather', /météo Lyon/.test(t) && !/°C/.test(t), t.slice(0, 200));
  await page.evaluate(() => Screens.menu(true, 'phone')); t = await said(page);
  check('the quick menu\'s Téléphone page: no QR code, how to link him', /Pixel vit sur ce téléphone/.test(t) && /«\sRelier\sà\smon\sPixel\s»/.test(t), t.slice(0, 200));
  await shot(page, 'phone-menu-telephone'); await page.evaluate(() => Screens.menu(false));
  await go(page, 'visage');

  /* typed commands */
  await type(page, 'salon 40');
  check('"salon 40": the lights need the Pi, he says so, nothing changes', /Relie Pixel à ton Pi/.test(await toast(page)) && await S(page, () => !PixelHub.S.lights.rooms.length), await toast(page));
  await type(page, 'bonjour Pixel, ça va ?');
  check('any other text (Claude): he says Claude is on the Pi, no fake answer', /Claude/.test(await toast(page)) && await S(page, () => !PixelHub.S.chat.messages.length && PixelHub.S.screen === 'visage'), await toast(page));
  await type(page, 'codex corrige le test');
  check('"codex …": the same', /Codex/.test(await toast(page)) && await S(page, () => !PixelHub.S.codex.running && !PixelHub.S.codex.lines.length));
  await type(page, 'aide');
  check('"aide": what works here', /minuteur/.test(await toast(page)) && /relie Pixel à ton Pi/.test(await toast(page)) && !/salon 40/.test(await toast(page)));
  await type(page, 'thème néon');
  check('"thème néon": he wears it, with no Pi', await S(page, () => PixelHub.S.view.theme === 'neon'), await toast(page));
  await shot(page, 'phone-neon'); await type(page, 'thème rétro');
  await type(page, 'humeur content');
  check('"humeur content": his mood', await S(page, () => PixelHub.S.mood.name === 'content'));
  await type(page, 'fais le poisson');
  check('"fais le poisson": his scene', await until(() => scene(page).then(s => s === 'poisson'), 2000), String(await scene(page)));
  await page.evaluate(() => PixelHub.dispatch('sys.power', { what: 'reboot' }));
  check('the quick menu\'s Redémarrer: no pretending, it is the phone', /téléphone/.test(await toast(page)));
  await page.evaluate(() => PixelHub.dispatch('ecran.code'));
  check('sharing a screen (a code to type): it is his Pi\'s screen, he says so, no code', /Relie Pixel à ton Pi/.test(await toast(page)) && await S(page, () => !PixelHub.S.cast), await toast(page));

  /* the timer */
  await go(page, 'minuteur'); await page.locator('#keys .key').nth(10).click(); await page.waitForTimeout(200);
  check('Minuteur: Démarrer starts it', await S(page, () => PixelHub.S.timer.running));
  await type(page, 'minuteur 1');
  check('"minuteur 1": one minute', await S(page, () => PixelHub.S.timer.running && PixelHub.S.timer.total === 60));
  await page.evaluate(() => { PixelHub.S.timer.ends_at = Date.now() + 400; });
  check('…and it rings', await until(() => S(page, () => !PixelHub.S.timer.running && PixelHub.S.timer.done === 1 && /MINUTEUR/.test((PixelHub.S.toast || {}).msg || '')), 3000));
  await shot(page, 'phone-minuteur');

  /* what survives a reload: the settings, a lasting mood, the timer */
  await go(page, 'reglages'); const vp = await point(page, 589, 239); await page.mouse.click(vp.x, vp.y); await page.waitForTimeout(200);
  await go(page, 'meteo'); await page.locator('#keys .key').nth(13).click();                   // °C / °F
  await go(page, 'systeme'); await page.locator('#keys .key').nth(12).click(); await page.locator('#keys .key').nth(10).click();   // Effet CRT, Lumi. −
  await type(page, 'minuteur 25'); await type(page, 'humeur endormi');
  const before = await S(page, () => ({ face: PixelHub.S.view.face, units: PixelHub.S.view.units_f, crt: PixelHub.S.view.crt_off, bright: PixelHub.S.sys.bright, ends: PixelHub.S.timer.ends_at, mood: PixelHub.S.mood.name }));
  check('the settings changed (face Vivant, °F, no CRT, dimmer), a 25 min timer, asleep', before.face === 'vivant' && before.units && before.crt && before.bright < 1 && before.mood === 'endormi' && before.ends > Date.now(), JSON.stringify(before));
  await page.waitForTimeout(1200);
  check('…kept in localStorage', ((k) => k && k.v === 1 && k.view.face === 'vivant' && k.timer.running)(await kept(page)));
  await page.reload(); await until(() => page.evaluate(() => !!window.PixelLocal), 6000); await page.waitForTimeout(300);
  const after = await S(page, () => ({ bright: PixelHub.S.sys.bright, face: PixelHub.S.view.face, units: PixelHub.S.view.units_f, crt: PixelHub.S.view.crt_off, ends: PixelHub.S.timer.ends_at, run: PixelHub.S.timer.running, mood: PixelHub.S.mood.name, done: PixelHub.S.timer.done }));
  check('a reload: the settings, the mood, the running timer and its count are back', after.face === 'vivant' && after.units && after.crt && after.bright === before.bright && after.run && after.ends === before.ends && after.mood === 'endormi' && after.done === 1, JSON.stringify(after));
  check('the phone (no app): no page or console errors', errs.length === 0, errs.slice(0, 4).join(' | '));
  await ctx.close();

  /* ================= in the app: the bridge, the app's copy, his Pi's snapshot ================= */
  const now = Date.now(), ALL = ['retro', 'moderne', 'manga', 'neon', 'croquis', 'lcd'];
  const pi = { view: { theme: 'lcd', face: 'pack', units_f: false, crt_off: false }, settings: { themes: ALL, sleep_min: 7, demo: false, qr: ['1'] }, kept_at: now - 60000,
    keys: {}, lights: { status: 'ok', rooms: [{ id: '1', name: 'Salon', on: true, bri: 80 }], scenes: ['Film'] }, chat: { phase: 'idle', messages: [{ role: 'assistant', text: 'Coucou' }] },
    weather: null, mood: { name: 'amoureux', until: 0 }, jouet: { trait: 'joueur', faim: 1 } };
  ({ ctx, page, errs } = await phone(browser, { app: true, feature: true, given: { state: null, seed: pi } }));
  const seeded = await S(page, () => ({ theme: PixelHub.S.view.theme, themes: PixelHub.THEMES.map(t => t.id), sleep: PixelHub.S.settings.sleep_min, rooms: PixelHub.S.lights.rooms.length, chat: PixelHub.S.chat.messages.length, mood: PixelHub.S.mood.name, car: PixelHub.S.jouet }));
  check('his Pi\'s last snapshot: the same theme, themes and settings (and a feature\'s state)', seeded.theme === 'lcd' && seeded.themes.length === 6 && seeded.sleep === 7 && seeded.car.trait === 'joueur', JSON.stringify(seeded));
  check('…but none of the Pi\'s data (lights, chat) and not its passing mood', !seeded.rooms && !seeded.chat && seeded.mood === 'neutre', JSON.stringify(seeded));
  await page.waitForTimeout(1200);
  let rn = await S(page, () => window.__rn);
  const ls0 = rn.filter(m => m.local_save).pop();
  check('the app gets his state ({local_save}): his Pi\'s look is now his own', !!ls0 && ls0.local_save.v === 1 && ls0.local_save.view.theme === 'lcd' && ls0.local_save.extra.jouet.trait === 'joueur', JSON.stringify(ls0 || {}).slice(0, 200));
  check('…and his mode; never a word about a Pi', rn.some(m => m.mode === 'both') && !rn.some(m => 'pi' in m || 'access' in m), JSON.stringify(rn.filter(m => !m.local_save)));
  check('"Pixel sur ce téléphone ⋯" opens the app\'s menu', await (async () => { const c = page.locator('#conn'); const ok = /⋯/.test(await c.textContent()) && (await c.getAttribute('role')) === 'button'; await c.click(); await page.waitForTimeout(100); return ok && (await S(page, () => window.__rn.some(m => m.menu === true))); })());
  await page.evaluate(() => PixelLocal.ping()); rn = await S(page, () => window.__rn);
  check('…and answers the app\'s ping (how long untouched, a timer running)', rn.some(m => typeof m.local_idle === 'number' && m.busy === false));
  await type(page, 'thème néon'); await page.evaluate(() => { PixelHub.S.jouet.faim = 5; PixelHub.local.mark(); });
  await page.waitForTimeout(1200);
  const ls1 = (await S(page, () => window.__rn)).filter(m => m.local_save).pop().local_save;
  check('a change: sent again, newer (néon, the feature\'s new value)', ls1.view.theme === 'neon' && ls1.extra.jouet.faim === 5 && ls1.at > ls0.local_save.at, JSON.stringify(ls1.view));
  await page.evaluate(() => PixelHub.dispatch('theme.step', { d: 1 })); await page.waitForTimeout(100);
  check('the quick menu\'s theme < >: the next theme', await S(page, () => PixelHub.S.view.theme === 'croquis'));
  await page.evaluate(() => PixelHub.dispatch('theme.set', { name: 'neon' })); await page.waitForTimeout(1200);
  await page.reload(); await until(() => page.evaluate(() => !!window.PixelLocal), 6000); await page.waitForTimeout(300);
  check('a reload with the same, older snapshot of his Pi: his own newer choice stays (néon), the feature too',
    await S(page, () => PixelHub.S.view.theme === 'neon' && PixelHub.S.jouet.faim === 5));
  await page.evaluate(p => PixelLocal.restore({ seed: { ...p, kept_at: Date.now() + 5, view: { ...p.view, theme: 'manga' } } }), pi); await page.waitForTimeout(200);
  check('a newer snapshot of his Pi, given late (after the page started): it wins', await S(page, () => PixelHub.S.view.theme === 'manga'));
  await page.evaluate(() => PixelLocal.restore({ state: { v: 2, at: Date.now() + 1e6, view: { theme: 'retro' } }, seed: { view: 'x' } })); await page.evaluate(() => PixelLocal.restore('garbage'));
  check('a foreign or broken state: ignored', await S(page, () => PixelHub.S.view.theme === 'manga'));
  /* the phone's notifications, as the app hands them over (no Pi linked, switched on there) */
  await free(page); await page.waitForTimeout(200);
  const n1 = await S(page, () => PixelLocal.notif({ app: 'WhatsApp', title: 'Maman', category: 'msg' }));
  check('a phone notification with its title: « 📱 WhatsApp : Maman », as on his Pi', n1 && (await toast(page)) === '📱 WhatsApp : Maman', await toast(page));
  check('…he reacts: a notification scene, or his pack\'s notification animation', !!(await until(() => S(page, () => {
    const id = Screens.persona.state.cur, sc = Screens.persona.scenes.find(x => x.id === id);
    return (sc && (sc.on || []).includes('notif')) || (Screens.local.packEv && Screens.local.packEv.id === 'notification');
  }), 2000)), String(await scene(page)));
  await page.waitForTimeout(300);
  await page.evaluate(() => PixelLocal.notif({ app: '  Gmail\n', category: 'email' }));
  check('…without a title: what it is (« 📱 Nouvel e-mail Gmail »)', (await toast(page)) === '📱 Nouvel e-mail Gmail', await toast(page));
  await page.evaluate(() => PixelLocal.notif({ app: 'X'.repeat(80), category: 'Pas un mot' }));
  check('…a long name cut, a category that is not a word left out', (await toast(page)) === '📱 ' + 'X'.repeat(39) + '…', await toast(page));
  const before0 = await toast(page);
  check('…no app name, or not an object: nothing', !(await S(page, () => PixelLocal.notif({ title: 'Maman' }) || PixelLocal.notif('WhatsApp') || PixelLocal.notif(null))) && (await toast(page)) === before0);
  await shot(page, 'app-seeded');
  check('the app: no page or console errors', errs.length === 0, errs.slice(0, 4).join(' | '));
  await ctx.close();

  /* the app's own copy, alone (a new phone storage: no localStorage) */
  ({ ctx, page, errs } = await phone(browser, { app: true, given: { state: { v: 1, at: now, view: { theme: 'croquis', face: 'vivant' }, settings: { themes: ['retro', 'croquis'], sleep_min: 12 }, timer: {}, extra: {} }, seed: null } }));
  check('PIXEL_LOCAL_STATE (the app\'s copy) restores him before the page starts', await S(page, () => PixelHub.S.view.theme === 'croquis' && PixelHub.S.view.face === 'vivant' && PixelHub.S.settings.sleep_min === 12 && localStorage.getItem('pixel_local') !== 'x'));
  check('…no errors', errs.length === 0, errs.slice(0, 4).join(' | '));
  await ctx.close();

  /* the app's late copy (Android: its injection can come after the page started), once the weather of the day came in */
  const fc = (t = 13) => { const days = [0, 1, 2, 3, 4].map(i => { const d = new Date(Date.now() + i * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
    return JSON.stringify({ current: { temperature_2m: t, weather_code: 3, wind_speed_10m: 11.2, relative_humidity_2m: 71 },
      daily: { time: days, weather_code: [3, 61, 0, 2, 71], temperature_2m_max: [14, 12, 16, 15, 4], temperature_2m_min: [7, 6, 5, 8, -1], wind_speed_10m_max: [20, 25, 10, 12, 18], relative_humidity_2m_mean: [70, 85, 60, 65, 90] } }); };
  const CORS = { 'access-control-allow-origin': '*' };
  ({ ctx, page, errs } = await phone(browser, { app: true, weather: r => r.fulfill({ contentType: 'application/json', headers: CORS, body: fc() }) }));
  await page.evaluate(() => localStorage.setItem('pixel_local', JSON.stringify({ v: 1, at: Date.now() - 3600e3, view: { theme: 'retro' }, settings: { themes: ['retro', 'lcd'] }, sys: {}, timer: {}, extra: {}, city: { name: 'Lyon', lat: 45.75, lon: 4.85 } })));
  await page.reload(); await until(() => page.evaluate(() => !!window.PixelLocal), 6000);
  check('(a kept city: its weather comes in by itself)', await until(() => S(page, () => !!(PixelHub.S.weather && PixelHub.S.weather.days)), 4000));
  await page.waitForTimeout(300);
  await page.evaluate(() => PixelLocal.restore({ state: null, seed: { view: { theme: 'lcd', face: 'vivant' }, settings: { themes: ['retro', 'lcd'] }, keys: {}, kept_at: Date.now() - 30e3 } }));
  await page.waitForTimeout(200);
  check('his Pi\'s snapshot given late, after the weather came in: newer than what he had here, it wins', await S(page, () => PixelHub.S.view.theme === 'lcd' && PixelHub.S.view.face === 'vivant'), await S(page, () => PixelHub.S.view.theme));
  check('…no errors', errs.length === 0, errs.slice(0, 4).join(' | '));
  await ctx.close();

  /* a feature whose truth is in a closure (S.ventre is only what it publishes): kept, given back, seeded from his Pi */
  ({ ctx, page, errs } = await phone(browser, { app: true, closure: true }));
  const belly = () => S(page, () => PixelHub.S.ventre && { ventre: PixelHub.S.ventre.ventre, repas: PixelHub.S.ventre.repas.length });
  await page.evaluate(() => { PixelHub.dispatch('ventre.donner'); PixelHub.dispatch('ventre.donner'); }); await page.waitForTimeout(1200);
  check('(the feature: fed twice, kept)', JSON.stringify(await belly()) === '{"ventre":90,"repas":2}' && ((k) => k && k.extra.ventre && k.extra.ventre.ventre === 90)(await kept(page)), JSON.stringify(await belly()));
  await page.reload(); await until(() => page.evaluate(() => !!window.PixelLocal), 6000); await page.waitForTimeout(900);
  check('a reload: its state is back, and stays after its own clock publishes again', JSON.stringify(await belly()) === '{"ventre":90,"repas":2}', JSON.stringify(await belly()));
  await page.evaluate(() => PixelHub.dispatch('ventre.donner')); await page.waitForTimeout(600);
  check('…and it goes on from there', JSON.stringify(await belly()) === '{"ventre":100,"repas":3}', JSON.stringify(await belly()));
  await page.evaluate(() => PixelLocal.restore({ seed: { view: { theme: 'retro' }, settings: {}, keys: {}, kept_at: Date.now() + 5, ventre: { ventre: 12, repas: [1] } } }));
  await page.waitForTimeout(1200);
  check('a newer snapshot of his Pi: its value, kept after the next publish and saved', JSON.stringify(await belly()) === '{"ventre":12,"repas":1}'
    && (await S(page, () => window.__rn.filter(m => m.local_save).pop().local_save.extra.ventre.ventre)) === 12, JSON.stringify(await belly()));
  check('…no errors', errs.length === 0, errs.slice(0, 4).join(' | '));
  await ctx.close();

  /* ================= his character, his meals, his exercises: here too, kept, and seeded from his Pi ================= */
  const DAY = 864e5, t0 = Date.now(), OLD = t0 - 3 * DAY;          // his Pi's snapshot, kept 3 days ago (the shapes the Pi publishes)
  const piPerso = { view: { theme: 'retro', face: 'vivant' }, settings: { themes: ALL }, keys: {}, kept_at: OLD,
    caractere: { preset: 'grognon', traits: { calin: 30, grognon: 92, bavard: 55, farceur: 30, energique: 50, curieux: 40, gourmand: 50, studieux: 50 }, nom: 'Bip', surnom: 'Max',
      humeur_jour: false, calme: { de: 22, a: 7 }, boude: true, parle: true, change: { t0: OLD, quoi: 'preset', kind: 'grognon', adj: 'grognon' }, essai: 0 },
    nourrir: { on: true, ventre: 80, faim: 0, dernier: { id: 7, plat: 'pizza', t: OLD - 6e5, reaction: 'aime', rot: false, choisi: false },
      gouts: { prefere: 'pizza', aime: ['frites', 'glace'], deteste: ['brocoli'] }, journal: [{ plat: 'pizza', t: OLD - 6e5, reaction: 'aime' }, { plat: 'nimporte', t: 1, reaction: 'x' }],
      reglages: { on: true, vitesse: 'normale' } },
    exos: { cur: { id: 5, etat: 'question', q: '2 + 2 = ?' }, last: null, ev: null, niveau: 3, reglages: { niveau: 2, auto: true, types: ['addition', 'table', 'bidon'], objectif: 7, propose: true },
      stats: { total: 12, justes: 10, serie: 2, serie_max: 6, aujourdhui: 3, justes_jour: 3, objectif: 7, coupes: 1, fait: true, record_chrono: 4, trophees: ['premier', 'serie5', 'inconnu'],
        par_type: { addition: [8, 7, 4], table: [4, 3, 3], bidon: [1, 1, 1] } }, kinds: [], trophees: [] } };
  ({ ctx, page, errs } = await phone(browser, { app: true, given: { state: null, seed: piPerso } }));
  const perso = () => S(page, () => { const s = PixelHub.S; return { car: s.caractere, n: s.nourrir, e: s.exos, traits: Screens.persona.traits }; });
  let ps = await perso();
  check('sans Pi, from his Pi: his character (cleaned: no old reaction replayed), his name and yours', ps.car.preset === 'grognon' && ps.car.traits.grognon === 92 && ps.car.nom === 'Bip'
    && ps.car.surnom === 'Max' && ps.car.calme.de === 22 && ps.car.change === null && ps.traits.grognon === 92, JSON.stringify(ps.car));
  check('…his tastes, his meals (a bad one left out), his settings', ps.n.gouts.prefere === 'pizza' && ps.n.gouts.deteste.join() === 'brocoli' && ps.n.journal.length === 1
    && ps.n.dernier && ps.n.dernier.plat === 'pizza' && ps.n.reglages.vitesse === 'normale', JSON.stringify(ps.n));
  check('…his belly 3 days later: as nourrir.py counts the Pi down (6 awake hours at most), 80 → 44, neither frozen nor empty', ps.n.ventre === 44 && ps.n.faim === 1, String(ps.n.ventre));
  check('…his exercises: scores, trophies, levels, settings; « today » is not today; the open one stays on the Pi', ps.e.stats.total === 12 && ps.e.stats.serie_max === 6
    && ps.e.stats.trophees.join() === 'premier,serie5' && ps.e.stats.par_type.addition.join() === '8,7,4' && ps.e.stats.par_type.table.join() === '4,3,3' && !ps.e.stats.par_type.bidon
    && ps.e.niveau === 3 && ps.e.reglages.objectif === 7 && ps.e.reglages.propose === true && ps.e.reglages.types.join() === 'addition,table'
    && ps.e.stats.aujourdhui === 0 && ps.e.stats.fait === false && ps.e.cur === null, JSON.stringify(ps.e.stats));
  await page.evaluate(() => { PixelHub.dispatch('nourrir.donner', { plat: 'pomme' }); PixelHub.dispatch('exos.nouveau', { kind: 'addition' }); PixelHub.dispatch('lab.exos', { juste: true });
    PixelHub.dispatch('caractere.set', { preset: 'calin' }); });
  await page.waitForTimeout(1200);
  ps = await perso();
  const ls2 = (await S(page, () => window.__rn)).filter(m => m.local_save).pop().local_save;
  check('they work here: a meal, an exercise answered, another character; the app keeps it all ({local_save})', ps.n.journal.length === 2 && ps.e.stats.total === 13 && ps.car.preset === 'calin'
    && ls2.extra.nourrir.journal.length === 2 && ls2.extra.exos.stats.total === 13 && ls2.extra.caractere.preset === 'calin' && ls2.saved_at >= t0, JSON.stringify({ j: ps.n.journal.length, t: ps.e.stats.total }));
  const belly0 = ps.n.ventre;
  await page.reload(); await until(() => page.evaluate(() => !!window.PixelLocal), 6000); await page.waitForTimeout(400);
  ps = await perso();
  check('a restart (his Pi\'s old snapshot given again): what he lived here stays', ps.car.preset === 'calin' && ps.car.nom === 'Bip' && ps.e.stats.total === 13 && ps.n.journal.length === 2
    && Math.abs(ps.n.ventre - belly0) <= 1 && ps.traits.calin === 92, JSON.stringify({ car: ps.car.preset, total: ps.e.stats.total, ventre: ps.n.ventre, was: belly0 }));
  let newer = 10 * DAY;                                   // each copy newer than the last (local.js keeps the newest)
  const k2 = await kept(page), back = async (ventre, ago) => {
    await page.evaluate(([k, v, a, n]) => PixelLocal.restore({ state: { ...k, at: Date.now() + n, saved_at: Date.now() - a, extra: { ...k.extra, nourrir: { ...k.extra.nourrir, ventre: v } } } }), [k2, ventre, ago, newer += DAY]);
    await page.waitForTimeout(200); return S(page, () => PixelHub.S.nourrir.ventre);
  };
  check('the app closed 2 days: his belly counts the time as nourrir.py does, at most a little hungry (70 → 34)', (await back(70, 2 * DAY)) === 34);
  check('…already hungry (20): no hungrier than that, never empty', (await back(20, 2 * DAY)) === 20);
  check('…closed a moment ago: nothing changes', (await back(61, 1000)) === 61);
  /* the app's menu opens his panels here (PixelMenu.tsx, plugs.ts openPanel): the page says which it has */
  const offered = (await S(page, () => window.__rn)).filter(m => Array.isArray(m.panels)).pop();
  check('the page tells the app its panels: Caractère, Nourrir, Exos', !!offered && offered.panels.join() === 'caractere,nourrir,exos', JSON.stringify(offered));
  await page.click('#modes button[data-mode="pixel"]'); await page.waitForTimeout(200);
  const opened = {};
  for (const [id, sel] of [['nourrir', '#nour'], ['exos', '#exos'], ['caractere', '.car-sheet']]) {
    await page.evaluate(i => window.PixelPanel(i), id); await page.waitForTimeout(400);
    opened[id] = await page.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && e.getBoundingClientRect().height > 50 && document.body.dataset.mode === 'both'; }, sel);
    await shot(page, 'app-menu-' + id);
    await page.evaluate(() => { PixelNourrir.panel(false); PixelExos.panel(false); PixelCaractere.close(false); });
    await page.click('#modes button[data-mode="pixel"]'); await page.waitForTimeout(200);
  }
  check('…in Pixel mode, the menu\'s « Le nourrir », « Exos de maths », « Son caractère » bring the keys back and open their panel', Object.values(opened).every(Boolean), JSON.stringify(opened));
  check('…an unknown one: nothing', await S(page, () => window.PixelPanel('lampes') === false && document.body.dataset.mode === 'pixel'));
  await page.click('#modes button[data-mode="both"]');
  /* the app's back button (plugs.ts closeSheet): the page says whether a panel is open ({sheet}); PixelSheet.close() */
  await page.evaluate(() => { window.__rn.length = 0; window.PixelPanel('exos'); window.PixelPanel('nourrir'); }); await page.waitForTimeout(300);
  const back1 = await S(page, () => [PixelSheet.close(), document.getElementById('nour').hidden, document.getElementById('exos').hidden]);
  await page.waitForTimeout(200);
  const back2 = await S(page, () => [PixelSheet.close(), document.getElementById('exos').hidden, PixelSheet.close()]);
  await page.waitForTimeout(200);
  const told = await S(page, () => window.__rn.filter(m => 'sheet' in m).map(m => m.sheet).join());
  check('the app\'s back button: the topmost panel closes first (Nourrir over Exos), then the other, then none; the page tells the app ({sheet}), again after each',
    back1.join() === 'true,true,false' && back2.join() === 'true,true,false' && told === 'true,true,false', JSON.stringify({ back1, back2, told }));
  /* the app's ping (Linked.tsx takes him back to his Pi when nobody uses this one): his panels are use too, an exercise open is busy */
  await page.evaluate(() => { PixelHub.dispatch('exos.stop'); window.PixelPanel('exos'); Screens.local.lastInput -= 600000; }); await page.waitForTimeout(1500);
  const idle0 = await S(page, () => PixelLocal.ping());
  await page.locator('#exBody button').first().click(); await page.waitForTimeout(300);
  const idle1 = await S(page, () => PixelLocal.ping());
  await page.evaluate(() => { PixelHub.dispatch('exos.stop'); PixelExos.panel(false); });
  const idle2 = await S(page, () => PixelLocal.ping());
  check('the app\'s ping: a touch in his Exos panel is using him, and an exercise open is busy (the app stays on this phone)',
    idle0.idle >= 1400 && !idle0.busy && idle1.idle < 1000 && idle1.busy && !idle2.busy, JSON.stringify([idle0, idle1, idle2]));
  /* his Pi's snapshot and the phone's copy of the same time (once seeded, only an action makes the copy newer): the copy wins */
  const tie = Date.now() + (newer += DAY), k3 = await kept(page);
  await page.evaluate(([k, p, at]) => PixelLocal.restore({ state: { ...k, at, saved_at: Date.now(), extra: { ...k.extra, nourrir: { ...k.extra.nourrir, ventre: 33 } } },
    seed: { ...p, kept_at: at, nourrir: { ...p.nourrir, ventre: 90 }, telephone: { last: { app: 'Messages', category: 'msg', t: 1 } } } }), [k3, piPerso, tie]);
  await page.waitForTimeout(300);
  const tied = await S(page, () => ({ ventre: PixelHub.S.nourrir.ventre, tel: 'telephone' in PixelHub.S || 'telephone' in PixelLocal.state.extra }));
  check('his Pi\'s snapshot as old as the phone\'s own copy: what he lived on the phone stays (his belly 33, not the Pi\'s 90); the Pi\'s « telephone » is not kept',
    tied.ventre === 33 && !tied.tel, JSON.stringify(tied));
  check('his character, his meals, his exercises sans Pi: no page or console errors', errs.length === 0, errs.slice(0, 4).join(' | '));
  await ctx.close();

  /* ================= the weather ================= */
  const asked = [];
  const meteo = r => {
    const u = new URL(r.request().url()); asked.push(u.hostname);
    if (u.hostname.startsWith('geocoding')) return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ results: [{ name: 'Lyon', latitude: 45.75, longitude: 4.85 }] }) });
    const days = [0, 1, 2, 3, 4].map(i => { const d = new Date(Date.now() + i * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
    return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({
      current: { temperature_2m: 13.4, weather_code: 3, wind_speed_10m: 11.2, relative_humidity_2m: 71 },
      daily: { time: days, weather_code: [3, 61, 0, 2, 71], temperature_2m_max: [14, 12, 16, 15, 4], temperature_2m_min: [7, 6, 5, 8, -1], wind_speed_10m_max: [20, 25, 10, 12, 18], relative_humidity_2m_mean: [70, 85, 60, 65, 90] } }) });
  };
  ({ ctx, page, errs } = await phone(browser, { weather: meteo }));
  check('no city: no request at all', asked.length === 0);
  await type(page, 'météo Lyon');
  const w = await until(() => S(page, () => PixelHub.S.weather && PixelHub.S.weather.days && PixelHub.S.weather), 4000);
  check('"météo Lyon": the real weather of Lyon (Open-Meteo), on the Météo screen', !!w && w.city === 'Lyon' && w.days.length === 5 && w.now.t === 13 && w.days[1].kind === 'pluie' && await S(page, () => PixelHub.S.screen === 'meteo'), JSON.stringify(w).slice(0, 200));
  t = await said(page);
  check('…drawn, with today\'s forecast said', /Lyon/.test(t) && /13 °C/.test(t) && /Aujourd'hui/.test(await toast(page)), t.slice(0, 200));
  await shot(page, 'phone-meteo');
  await page.waitForTimeout(1000); await page.reload(); await until(() => page.evaluate(() => !!window.PixelLocal), 6000);
  check('a reload: the city is kept, the weather comes back', await until(() => S(page, () => PixelHub.S.weather && PixelHub.S.weather.city === 'Lyon' && !!PixelHub.S.weather.days), 4000));
  check('the weather: no errors', errs.length === 0, errs.slice(0, 4).join(' | '));
  await ctx.close();
  /* a typo keeps the good city; a city typed while another one's forecast is on its way never gets that one */
  const PLACES = { Lyon: [45.75, 4.85], Brest: [48.39, -4.49] };
  let slowLyon = false;
  ({ ctx, page, errs } = await phone(browser, { offlineOk: true, weather: async r => {
    const u = new URL(r.request().url());
    if (u.hostname.startsWith('geocoding')) { const p = PLACES[u.searchParams.get('name')]; return r.fulfill({ contentType: 'application/json', headers: CORS, body: JSON.stringify(p ? { results: [{ name: u.searchParams.get('name'), latitude: p[0], longitude: p[1] }] } : {}) }); }
    if (u.searchParams.get('latitude') === '45.75') { if (slowLyon) await wait(1500); return r.fulfill({ contentType: 'application/json', headers: CORS, body: fc(13) }); }
    return r.abort();                                     // Brest's forecast: no network for it
  } }));
  await type(page, 'météo Lyon');
  await until(() => S(page, () => PixelHub.S.weather && PixelHub.S.weather.city === 'Lyon'), 4000);
  await type(page, 'météo lundi'); await page.waitForTimeout(600);
  const typo = await S(page, () => ({ city: PixelLocal.city && PixelLocal.city.name, shown: PixelHub.S.weather && PixelHub.S.weather.city, toast: (PixelHub.S.toast || {}).msg }));
  check('"météo lundi" (not a city): Lyon and its weather stay, he says so', typo.city === 'Lyon' && typo.shown === 'Lyon' && /VILLE INTROUVABLE : LUNDI/.test(typo.toast), JSON.stringify(typo));
  slowLyon = true; await type(page, 'météo Lyon'); await page.waitForTimeout(200); await type(page, 'météo Brest'); await page.waitForTimeout(2600);
  const race = await S(page, () => ({ city: PixelLocal.city && PixelLocal.city.name, shown: PixelHub.S.weather, kept: PixelLocal.state.wcache || null }));
  check('Lyon\'s forecast late, Brest typed meanwhile (and away): Brest, a word, never Lyon\'s weather under its name', race.city === 'Brest' && !race.shown.days && /Brest/.test(race.shown.error || '') && !race.kept, JSON.stringify(race).slice(0, 300));
  check('…no page error', errs.length === 0, errs.slice(0, 4).join(' | '));
  await ctx.close();
  ({ ctx, page, errs } = await phone(browser, { weather: r => r.abort(), offlineOk: true }));
  await type(page, 'météo Brest');
  check('no network: a word, not a fake forecast', await until(() => S(page, () => /Brest/.test((PixelHub.S.weather || {}).error || '') && /RÉSEAU/.test((PixelHub.S.toast || {}).msg || '')), 4000), JSON.stringify(await S(page, () => PixelHub.S.weather)));
  check('…no page error', errs.length === 0, errs.slice(0, 4).join(' | '));
  await ctx.close();

  /* ================= a phone held sideways: the Pixel de poche ================= */
  ({ ctx, page, errs } = await phone(browser, { device: devices['Pixel 7 landscape'], app: true, senses: true }));
  await until(() => page.evaluate(() => !!window.PixelPoche && PixelPoche.on), 4000); await page.waitForTimeout(600);
  const lay = await S(page, () => { const r = document.getElementById('crt').getBoundingClientRect(), v = document.querySelector('.poche-voyage'); return { on: PixelPoche.on, h: r.height, ih: innerHeight, voyage: v ? getComputedStyle(v).display : 'none', scr: Screens.local.scr }; });
  check('sideways: the Pixel de poche, his face alone, full height', lay.on && lay.scr === 'visage' && Math.abs(lay.h - lay.ih) <= 2, JSON.stringify(lay));
  check('…no voyage button: there is no Pi to come from', lay.voyage === 'none', lay.voyage);
  check('…he lives', (await moving(page)) > 30);
  await free(page); await page.waitForTimeout(300);
  const pp = await point(page); await page.touchscreen.tap(pp.x, pp.y); await page.waitForTimeout(400);
  check('…a tap: he reacts', ['tap', 'fache', 'retour'].includes(await group(page, await scene(page))), String(await scene(page)));
  await free(page); await page.waitForTimeout(300);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pp.x, y: pp.y }] }); await page.waitForTimeout(900);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(300);
  check('…a long press: a cuddle', (await group(page, await scene(page))) === 'calin', String(await scene(page)));
  await shot(page, 'poche');
  await free(page); await page.waitForTimeout(300);           // Nourrir: the Pi's plate and tray, on the phone's own Pixel de poche too
  check('…his plate is there, bottom right (Nourrir)', await S(page, () => PixelNourrir.shown && !PixelNourrir.trayOpen));
  const plate = await point(page, 768, 384); await page.touchscreen.tap(plate.x, plate.y); await page.waitForTimeout(500);
  check('…a touch on it: his tray of 24 foods', await S(page, () => PixelNourrir.trayOpen));
  await shot(page, 'poche-tray');
  const food = await point(page, 48, 375); await page.touchscreen.tap(food.x, food.y);   // the first food of the tray (nourrir.js TR)
  const ate = await until(() => S(page, () => PixelHub.S.nourrir.dernier && PixelHub.S.nourrir.dernier.plat), 3000);
  check('…a touch on a food: he eats it, the tray goes away', ate === 'pomme' && await S(page, () => !PixelNourrir.trayOpen), String(ate));
  await page.waitForTimeout(6500); await free(page);
  await free(page); await ctx.setOffline(true); await page.waitForTimeout(3500);
  check('…the phone offline: he is at home here, never "far from home"', (await scene(page)) !== 'poche-loin' && await S(page, () => PixelPoche.linked));
  await ctx.setOffline(false);
  check('…the app keeps the screen on ({mode: "pixel"})', await S(page, () => window.__rn.filter(m => m.mode).pop().mode === 'pixel'));
  const apo = await S(page, () => window.__rn.filter(m => 'poche' in m));
  check('…the app hears {poche: true} with his theme\'s background (sideways, no system bars, its senses)', apo.length > 0 && apo[apo.length - 1].poche === true && /^#[0-9a-f]{3,8}$/i.test(apo[apo.length - 1].bg || ''), JSON.stringify(apo));
  await page.waitForTimeout(2500); await free(page);
  await page.evaluate(async () => {                       // what the app's accelerometer feeds (src/poche.ts), in the phone's own axes
    const a = ((screen.orientation && screen.orientation.angle) ?? 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    for (const [rx, ry] of [[0, 9.8], [0, 9.8], [0, 9.8], [-22, 18], [20, -6], [-24, 25], [22, -8], [-20, 20]]) { PixelPoche.native.motion(rx * c + ry * s, -rx * s + ry * c, 0); await new Promise(r => setTimeout(r, 120)); }
  });
  check('…the app\'s accelerometer: shaken, he gets dizzy (Pixel de poche works on the phone\'s own Pixel too)', ['poche-tournis', 'poche-cocktail'].includes(await scene(page)), String(await scene(page)));
  // the app's ping before it goes back to his Pi by itself (Linked.tsx): the phone in hand is play, a phone on its stand is not
  await page.evaluate(() => PixelPoche.native.motion(0, 9.8, 0)); await page.waitForTimeout(1500);
  await page.evaluate(() => PixelPoche.native.motion(0.03, 9.79, 0.02));
  const still = await S(page, () => PixelLocal.ping().idle);
  await page.evaluate(() => PixelPoche.native.motion(4, 8.9, 0.5));
  const tilted = await S(page, () => PixelLocal.ping().idle);
  check('…tilted by hand, he is played with (the app\'s ping); still on a stand, he is not', still >= 1400 && tilted < 300, `${Math.round(still)} ${Math.round(tilted)}`);
  check('the Pixel de poche: no page or console errors', errs.length === 0, errs.slice(0, 4).join(' | '));
  await ctx.close();

  check('nothing was fetched from the network, by any page', net.length === 0, net.slice(0, 5).join(' '));
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
