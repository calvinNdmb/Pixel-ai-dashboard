// Pixel de poche in a real browser:  node tests/test_poche.js [--shots DIR]
// Starts a demo server (port 8143, a temporary data folder, every theme on), then, in Chromium (Playwright):
// - a phone held sideways (Pixel 7): the remote becomes the Pixel de poche, full screen, crisp at the phone's pixel density,
//   the sides in the theme's background, drawn in every theme without an error; the screen stays on (wake lock asked, let go
//   when hidden, asked again); a tap gets a reaction, a long press pets him; shaken: dizzy; tilted: he leans; its battery;
//   the Pi out of reach (the server stopped), then back (started again); out of the pocket after a while: "te revoilà";
//   upright again: the remote;
// - the Pi's screen (?kiosk=1) beside it: the two Pixels know each other (jealous, curious, shaken), the voyage both ways,
//   a touch on the Pi's empty screen calls him back;
// - an iPhone imitated in Chromium (no Fullscreen API, motion only after a yes given on a touch, iOS's axes, window.orientation),
//   the "Pixel de poche" button on an upright phone, what is not a turn (split screen, the keyboard, a wobble), and Pixel
//   Lab's phone frame;
// - the Pi's usual http address (http://pixel.lan, mapped to this machine: not a secure page), with no imitation at all:
//   no motion, battery nor Wake Lock, he lives without them and says so; in the Pixel app, he asks it to keep the screen on.
// --shots DIR: screenshots at the phone's real resolution.
// Playwright must be installed (require('playwright')); nothing else.
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const APP = path.join(__dirname, '..'), PORT = Number(process.env.POCHE_PORT) || 8143, BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = (i => (i >= 0 ? process.argv[i + 1] : null))(process.argv.indexOf('--shots'));
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (name, ok, info = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (!ok && info ? `  [${info}]` : '')); if (!ok) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const portOpen = () => new Promise(r => { const s = net.connect(PORT, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
const until = async (fn, ms = 6000, step = 100) => { const end = Date.now() + ms; let v; while (Date.now() < end) { if ((v = await fn())) return v; await wait(step); } return v; };

/* ---------- the demo server ---------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-poche-')), cfg = path.join(tmp, 'config.toml');
fs.writeFileSync(cfg, `data_dir = "${tmp}"\n[security]\ntoken = "le-code-poche"\n[ui]\nthemes = ["retro", "moderne", "manga", "neon", "croquis", "lcd"]\n`);
let srv = null;
async function startServer() {
  srv = spawn('python3', [path.join(APP, 'server.py'), '--demo', '--port', String(PORT), '--config', cfg], { cwd: APP, stdio: 'ignore' });
  if (!(await until(portOpen, 15000))) throw new Error('le serveur de démo ne démarre pas');
}
async function stopServer() { if (!srv) return; const p = srv; srv = null; p.kill('SIGTERM'); await until(async () => !(await portOpen()), 8000); }
let hub = null, hubState = null;            // our own WebSocket to the server: to send actions and read its state
async function connectHub() {
  hub = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  hub.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'state') hubState = m.data; };
  await until(() => hub.readyState === 1, 5000);
}
const act = (action, args = {}) => hub.send(JSON.stringify({ action, args }));

/* ---------- the phone (on 127.0.0.1, a secure page): a wake lock, a battery and an iPhone we can watch ---------- */
const INIT = ios => {
  window.__wl = { asked: 0, released: 0, type: '' };
  const sentinel = () => { const s = new EventTarget(); s.released = false; s.release = async () => { if (!s.released) { s.released = true; window.__wl.released++; s.dispatchEvent(new Event('release')); } }; return s; };
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async type => { window.__wl.asked++; window.__wl.type = type; return sentinel(); } } });
  window.__bat = Object.assign(new EventTarget(), { level: 0.8, charging: false });
  navigator.getBattery = async () => window.__bat;
  window.__perm = 0; window.__permCalls = 0; window.__permFail = 0;
  if (!ios) return;
  /* an iPhone, as far as Chromium can play one: no Fullscreen API, no screen.orientation (window.orientation, like before
     iOS 16.4), and the motion sensors only after a yes, which Safari asks for only during a touch */
  delete Element.prototype.requestFullscreen;
  Object.defineProperty(Document.prototype, 'fullscreenEnabled', { configurable: true, get: () => false });
  Object.defineProperty(Screen.prototype, 'orientation', { configurable: true, get: () => undefined });
  Object.defineProperty(window, 'orientation', { configurable: true, get: () => (innerWidth > innerHeight ? 90 : 0) });
  window.DeviceMotionEvent.requestPermission = async () => {
    window.__permCalls++;
    if (!navigator.userActivation.isActive) throw new DOMException('requestPermission needs a user gesture', 'NotAllowedError');
    if (window.__permFail > 0) { window.__permFail--; throw new DOMException('the request failed', 'NotAllowedError'); }
    window.__perm++; return 'granted';
  };
};
let serverDown = false;                      // while we stop the server on purpose, the browser logs the failed reconnections
const errors = page => {
  const e = [];
  page.on('pageerror', x => e.push('pageerror: ' + x.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/\/pixel\.apk$/.test(m.location().url || '')) return;                          // app.js looks for the Android app (none in the demo)
    if (serverDown && (/WebSocket connection .* failed/.test(m.text()) || /\/ws(\?|$)/.test(m.location().url || ''))) return;   // and app.js asks /ws why
    e.push('console.error: ' + m.text());
  });
  return e;
};
const scene = page => page.evaluate(() => Screens.persona.state.cur);
const group = (page, id) => page.evaluate(id => (Screens.persona.scenes.find(s => s.id === id) || {}).group || '', id);
const free = page => page.evaluate(() => { Screens.persona.stop(); Screens.local.local = null; Screens.local.pack = null; });
async function facePoint(page, u = 400, v = 240) {        // a point of the 800x480 canvas, on the page
  const r = await page.locator('#crt').boundingBox();
  return { x: r.x + u / 800 * r.width, y: r.y + v / 480 * r.height };
}
async function longPress(page, cdp, ms = 900) {
  const p = await facePoint(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
// [rx, ry] in the screen's axes (y up), as an Android phone reports them; an iPhone (sign -1) reports every axis the other way
const motion = (page, list, every = 120, sign = 1) => page.evaluate(async ({ list, every, sign }) => {
  const a = ((screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  for (const [rx, ry, rz = 0] of list) {
    window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: { x: sign * (rx * c + ry * s), y: sign * (-rx * s + ry * c), z: sign * rz }, interval: 16 }));
    await new Promise(r => setTimeout(r, every));
  }
}, { list, every, sign });
const drawn = page => page.evaluate(() => {               // the canvas shows something (not one flat colour)
  const c = document.getElementById('crt'), t = document.createElement('canvas'); t.width = 80; t.height = 48;
  const g = t.getContext('2d'); g.drawImage(c, 0, 0, 80, 48); const d = g.getImageData(0, 0, 80, 48).data, seen = new Set();
  for (let i = 0; i < d.length; i += 16) seen.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
  return seen.size;
});
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };

(async () => {
  if (await portOpen()) throw new Error(`le port ${PORT} est déjà pris (POCHE_PORT=… pour un autre)`);
  await startServer(); await connectHub();
  // pixel.lan: the Pi's address as a phone sees it (plain http, not localhost); the browser talks to this machine directly
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(https?|all)_proxy$/i.test(k)));
  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP pixel.lan 127.0.0.1'], env });
  const LAN = `http://pixel.lan:${PORT}`;

  /* ================= the Pi's screen ================= */
  const kc = await browser.newContext({ viewport: { width: 800, height: 480 }, deviceScaleFactor: 1, hasTouch: true });
  const kiosk = await kc.newPage(), kErr = errors(kiosk);
  await kiosk.goto(BASE + '/?kiosk=1'); await until(() => kiosk.evaluate(() => Screens.local.boot < 0 && !!PixelPoche && PixelPoche.where === 'pi'), 8000);
  check('the Pi\'s screen: poche.js is there, as the Pi (no Pixel de poche on the Pi)', await kiosk.evaluate(() => PixelPoche.where === 'pi' && !PixelPoche.on && !document.body.classList.contains('poche')));

  /* ================= a phone held sideways ================= */
  const P7 = devices['Pixel 7 landscape'];
  const pc = await browser.newContext({ ...P7 }); await pc.addInitScript(INIT, false);
  const phone = await pc.newPage(), pErr = errors(phone), cdp = await pc.newCDPSession(phone);
  await phone.goto(BASE + '/'); await until(() => phone.evaluate(() => !!PixelPoche && PixelPoche.on && !!document.querySelector('.poche-hud')), 6000);
  await phone.waitForTimeout(900);
  const lay = await phone.evaluate(() => {
    const c = document.getElementById('crt'), r = c.getBoundingClientRect(), dpr = devicePixelRatio, kb = document.querySelector('.kb');
    return { on: PixelPoche.on, how: PixelPoche.how, cls: document.body.classList.contains('poche'), kb: getComputedStyle(kb).display, w: r.width, h: r.height, x: r.x, y: r.y,
      cw: c.width, ch: c.height, dpr, iw: innerWidth, ih: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight,
      bg: getComputedStyle(document.documentElement).getPropertyValue('--poche-bg').trim(), sbg: getComputedStyle(document.getElementById('screen')).backgroundColor, scr: Screens.local.scr };
  });
  check('sideways, the phone shows the Pixel de poche (no keys, his face only)', lay.on && lay.how === 'auto' && lay.cls && lay.kb === 'none' && lay.scr === 'visage', JSON.stringify(lay));
  check('his screen fills the phone\'s height, centred, 5:3 (never stretched)', Math.abs(lay.h - lay.ih) <= 2 && Math.abs(lay.w / lay.h - 5 / 3) < 0.01 && Math.abs(lay.x - (lay.iw - lay.w) / 2) <= 1, JSON.stringify(lay));
  check('crisp: one canvas pixel per device pixel', Math.abs(lay.cw - lay.w * lay.dpr) <= 1 && Math.abs(lay.ch - lay.h * lay.dpr) <= 1 && lay.cw > 1200, `${lay.cw}x${lay.ch} for ${lay.w}x${lay.h} @${lay.dpr}`);
  check('the sides take the theme\'s background (Rétro by default), no scroll', lay.bg === '#061009' && lay.sbg === 'rgb(6, 16, 9)' && lay.sw <= lay.iw && lay.sh <= lay.ih, JSON.stringify(lay));
  const wl = await phone.evaluate(() => window.__wl);
  check('the screen is kept on (Screen Wake Lock asked)', wl.asked >= 1 && wl.type === 'screen', JSON.stringify(wl));
  check('no page zoom while he is there', await phone.evaluate(() => /user-scalable=no/.test(document.querySelector('meta[name=viewport]').content)));
  await until(async () => (hubState && hubState.poche && hubState.poche.here > 0), 3000);
  check('the server knows a Pixel de poche is here', !!(hubState && hubState.poche && hubState.poche.here > 0), JSON.stringify(hubState && hubState.poche));

  // every theme, from the same snapshots as the Pi
  const themes = hubState.settings.themes;
  for (const t of themes) {
    act('theme.set', { name: t });
    await until(() => phone.evaluate(t => Screens.local.theme === t, t), 3000);
    await phone.waitForTimeout(700);
    const d = await drawn(phone), bg = await phone.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--poche-bg').trim());
    check(`theme ${t}: the Pixel de poche draws (${d} colours), the sides in its background ${bg}`, d > 6 && /^#[0-9a-f]{6}$/i.test(bg), String(d));
    await shot(phone, `poche-pixel7-${t}`);
  }
  act('theme.set', { name: 'retro' }); await phone.waitForTimeout(600);

  // touch
  await free(phone); await phone.waitForTimeout(200);
  let p = await facePoint(phone); await phone.touchscreen.tap(p.x, p.y); await phone.waitForTimeout(150);
  let cur = await scene(phone);
  check('a tap on his face: a reaction', ['tap', 'fache', 'retour'].includes(await group(phone, cur)), cur);
  check('…and the first touch puts him full screen (Android)', await phone.evaluate(() => !!document.fullscreenElement));
  await phone.waitForTimeout(3000); await free(phone);
  await kiosk.evaluate(() => Screens.persona.stop());
  await longPress(phone, cdp); await phone.waitForTimeout(150);
  cur = await scene(phone);
  const petted = await phone.evaluate(id => { const P = Screens.persona, s = P.scenes.find(x => x.id === id);   // any cuddle, packs included
    return [...P.pools.pet, 'caresse', 'ronron', 'calme', 'pardon'].includes(id) || (!!s && s.group === 'calin'); }, cur);
  check('a long press pets him (a cuddle, no tap)', petted, cur);
  await shot(phone, 'poche-pixel7-calin');
  const jealous = await until(async () => { const c = await scene(kiosk); return ['poche-jaloux', 'poche-envie'].includes(c) && c; }, 4000);
  check('…and the Pi\'s Pixel saw it: "Hé ! Tu caresses l\'autre ?!"', !!jealous, String(await scene(kiosk)));
  if (SHOTS) await kiosk.waitForTimeout(500), await kiosk.screenshot({ path: path.join(SHOTS, 'poche-pi-jaloux.png') });

  // the other way round: the Pi's Pixel touched
  await phone.waitForTimeout(1500); await free(phone); await kiosk.evaluate(() => Screens.persona.stop()); await kiosk.waitForTimeout(100);
  await kiosk.touchscreen.tap(400, 240);
  const noticed = await until(async () => (await scene(phone)) === 'poche-jumeau', 4000);
  check('a touch on the Pi\'s Pixel: the Pixel de poche notices ("on touche mon jumeau")', noticed, String(await scene(phone)));

  // shaken, tilted
  await phone.waitForTimeout(800); await free(phone); await kiosk.waitForTimeout(3500); await kiosk.evaluate(() => Screens.persona.stop());
  await motion(phone, [[0, 9.8], [0, 9.8], [0, 9.8], [-22, 18], [20, -6], [-24, 25], [22, -8], [-20, 20]]);
  cur = await scene(phone);
  check('shaken: he gets dizzy', ['poche-tournis', 'poche-cocktail'].includes(cur), cur);
  const twinShaken = await until(async () => (await scene(kiosk)) === 'poche-secoue', 4000);
  check('…and the Pi\'s Pixel: "doucement avec mon jumeau !"', twinShaken, String(await scene(kiosk)));
  await phone.waitForTimeout(3800); await free(phone);
  await motion(phone, [[0, 9.8], [0, 9.8], [-6, 7.6], [-6, 7.6], [-6, 7.6], [-6, 7.6], [-6, 7.6], [-6, 7.6], [-6, 7.6], [-6, 7.6]], 100);
  const leanR = await phone.evaluate(() => Screens.local.lean);
  check('tilted to the right: he leans and slides that way', !!leanR && leanR.x > 40 && leanR.r < 0, JSON.stringify(leanR));
  await shot(phone, 'poche-pixel7-penche');
  await motion(phone, Array(12).fill([0, 9.8]), 100); await phone.waitForTimeout(800);
  const leanBack = await phone.evaluate(() => Screens.local.lean);
  check('held straight again: back in the middle', !leanBack || Math.abs(leanBack.x) < 3, JSON.stringify(leanBack));

  // the battery
  await free(phone);
  await phone.evaluate(() => { window.__bat.level = 0.12; window.__bat.dispatchEvent(new Event('levelchange')); }); await phone.waitForTimeout(100);
  check('the phone\'s battery low: "plus que 12 % de batterie…"', (await scene(phone)) === 'poche-batterie', await scene(phone));
  await phone.waitForTimeout(1500);
  check('…said with the level', /12 %/.test(await phone.evaluate(() => Screens.persona.state.say)), await phone.evaluate(() => Screens.persona.state.say));
  await shot(phone, 'poche-pixel7-batterie');
  await phone.evaluate(() => { window.__bat.charging = true; window.__bat.dispatchEvent(new Event('chargingchange')); }); await phone.waitForTimeout(100);
  check('plugged in: "miam, de l\'électricité !"', (await scene(phone)) === 'poche-recharge', await scene(phone));

  // hidden (the phone in a pocket), and back after a while
  await phone.waitForTimeout(4200); await free(phone);
  const hide = h => phone.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  const wl0 = await phone.evaluate(() => ({ ...window.__wl })); await hide(true); await phone.waitForTimeout(200);
  const wlHidden = await phone.evaluate(() => ({ ...window.__wl, awake: PixelPoche.awake }));
  await phone.evaluate(() => {                            // five minutes later, out of the pocket
    const real = Date.now; Date.now = () => real() + 5 * 60000;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange')); Date.now = real;
  });
  await phone.waitForTimeout(300);
  const wlBack = await phone.evaluate(() => window.__wl);
  check('in the pocket (page hidden): the wake lock is let go', wlHidden.released > wl0.released && wlHidden.released === wlHidden.asked, JSON.stringify([wl0, wlHidden]));
  check('…and he holds none', !wlHidden.awake, JSON.stringify(wlHidden));
  check('out again: asked again', wlBack.asked > wlHidden.asked, JSON.stringify([wlHidden, wlBack]));
  cur = await scene(phone);
  check('out of the pocket after a while: "il faisait tout noir dans ta poche !"', cur === 'poche-revoila', cur);

  // the Pi out of reach: the server stops; he lives on, says he is far from home; it starts again: he reconnects quietly
  await phone.waitForTimeout(3600); await free(phone);
  check('the app\'s files are kept on the phone (service worker ready) and so is his last snapshot', await phone.evaluate(async () => {
    const r = await navigator.serviceWorker.ready, s = JSON.parse(localStorage.getItem('pixel_snap') || 'null');
    return !!r.active && !!s && !!s.view && Array.isArray(s.chat.messages) && !s.chat.messages.length;
  }));
  serverDown = true; await stopServer();
  const far = await until(async () => (await scene(phone)) === 'poche-loin', 9000);
  check('the Pi out of reach: "je ne capte plus la maison…"', far, String(await scene(phone)));
  const h1 = await drawn(phone); await phone.waitForTimeout(400);
  check('…and he still lives here (the canvas keeps drawing)', h1 > 6 && await phone.evaluate(() => PixelPoche.on), String(h1));
  await shot(phone, 'poche-pixel7-loin');
  await phone.evaluate(() => dispatchEvent(new Event('online'))); await phone.waitForTimeout(1500);   // mobile data back, the Pi still away
  check('a network again ("online") is not the Pi: no "je capte la maison"', (await scene(phone)) !== 'poche-maison' && !(await phone.evaluate(() => PixelPoche.linked)), await scene(phone));
  // the phone closed the page meanwhile: it opens again without the Pi, he wakes up from his last snapshot
  await phone.reload(); await until(() => phone.evaluate(() => !!window.PixelPoche && PixelPoche.on), 6000);
  const far2 = await until(async () => (await scene(phone)) === 'poche-loin', 9000);
  const re = await phone.evaluate(() => ({ on: PixelPoche.on, err: Screens.local.error, theme: Screens.local.theme, conn: document.getElementById('conn').textContent }));
  check('the page loaded again away from home: he wakes up anyway (his theme, his face) and says he is far', far2 && re.on && re.theme === 'retro' && (await drawn(phone)) > 6 && !/Pas d'accès/.test(re.err || ''), JSON.stringify(re));
  await phone.waitForTimeout(3000); await free(phone);
  await startServer(); await connectHub();
  const home = await until(async () => (await scene(phone)) === 'poche-maison', 15000);
  await phone.waitForTimeout(500); serverDown = false;
  check('the Pi back: he reconnects by himself, "ah, je capte la maison !"', home, String(await scene(phone)));
  await until(() => kiosk.evaluate(() => Screens.local.boot < 0), 8000);
  await until(async () => hubState && hubState.poche && hubState.poche.here > 0, 4000);
  check('…and tells the new server he is here', !!(hubState && hubState.poche && hubState.poche.here > 0));

  // the voyage
  await phone.waitForTimeout(3500); await free(phone); await kiosk.evaluate(() => Screens.persona.stop());
  check('the voyage button says "Viens !"', (await phone.locator('.poche-voyage').textContent()) === 'Viens !');
  await phone.locator('.poche-voyage').tap();
  const left = await until(async () => (await scene(kiosk)) === 'poche-part', 4000);
  check('voyage: Pixel walks off the Pi\'s screen…', left, String(await scene(kiosk)));
  const came = await until(async () => (await scene(phone)) === 'poche-arrive', 4000);
  check('…and comes in on the phone (his twin steps aside)', came, String(await scene(phone)));
  await phone.waitForTimeout(5500);
  check('the button now says "Rentre !"', (await phone.locator('.poche-voyage').textContent()) === 'Rentre !');
  await shot(phone, 'poche-pixel7-voyage');
  if (SHOTS) await kiosk.screenshot({ path: path.join(SHOTS, 'poche-pi-parti.png') });
  await phone.locator('.poche-voyage').tap();
  const back = await until(async () => (await scene(kiosk)) === 'poche-revient', 4000);
  check('"Rentre !": he leaves the phone and comes home to the Pi', back && (await scene(phone)) === 'poche-rentre', `${await scene(kiosk)} ${await scene(phone)}`);
  await phone.waitForTimeout(8000);
  act('poche.voyage', { to: 'poche' });
  await until(async () => (await scene(kiosk)) === 'poche-part', 4000); await kiosk.waitForTimeout(4200);
  await kiosk.touchscreen.tap(400, 240);
  const called = await until(async () => hubState.poche.voyage && hubState.poche.voyage.to === 'pi', 3000);
  check('a touch on the Pi\'s empty screen calls him back home', called && await until(async () => (await scene(kiosk)) === 'poche-revient', 3000), JSON.stringify(hubState.poche.voyage));

  // upright again: the remote
  await phone.evaluate(() => document.fullscreenElement && document.exitFullscreen()); await phone.waitForTimeout(300);   // (a test window cannot turn while full screen)
  await phone.setViewportSize({ width: 412, height: 839 }); await phone.waitForTimeout(900);
  const up = await phone.evaluate(() => ({ on: PixelPoche.on, cls: document.body.classList.contains('poche'), kb: getComputedStyle(document.querySelector('.kb')).display, style: document.getElementById('crt').style.width, wl: window.__wl, scale: Screens.local.scale }));
  check('upright again: back to the remote (keys, his small screen)', !up.on && !up.cls && up.kb !== 'none' && !up.style && !up.scale, JSON.stringify(up));
  check('…every wake lock he asked for is let go', up.wl.asked >= 1 && up.wl.released === up.wl.asked, JSON.stringify(up.wl));
  await shot(phone, 'poche-pixel7-portrait');
  await phone.setViewportSize({ width: P7.viewport.width, height: P7.viewport.height }); await phone.waitForTimeout(900);
  check('sideways again: the Pixel de poche again', await phone.evaluate(() => PixelPoche.on && document.body.classList.contains('poche')));
  await phone.evaluate(() => document.fullscreenElement && document.exitFullscreen());
  await phone.locator('.poche-x').tap(); await phone.waitForTimeout(300);
  check('the × button: back to the remote, even sideways', await phone.evaluate(() => !PixelPoche.on && !document.body.classList.contains('poche')));
  check('the phone: no page or console errors', pErr.length === 0, pErr.slice(0, 4).join(' | '));
  await pc.close();

  /* ================= an iPhone sideways (imitated in Chromium: see INIT) ================= */
  const IP = devices['iPhone 14 landscape'];
  const ic = await browser.newContext({ viewport: IP.viewport, screen: IP.screen, deviceScaleFactor: IP.deviceScaleFactor, isMobile: true, hasTouch: true, userAgent: IP.userAgent });
  await ic.addInitScript(INIT, true);
  const ip = await ic.newPage(), iErr = errors(ip);
  await ip.goto(BASE + '/'); await until(() => ip.evaluate(() => !!PixelPoche && PixelPoche.on), 6000); await ip.waitForTimeout(900);
  const il = await ip.evaluate(() => { const c = document.getElementById('crt'), r = c.getBoundingClientRect(); return { on: PixelPoche.on, w: r.width, h: r.height, cw: c.width, dpr: devicePixelRatio, ih: innerHeight, calls: window.__permCalls, so: screen.orientation, wo: window.orientation }; });
  check('iPhone 14 sideways (window.orientation 90, no screen.orientation): the Pixel de poche, crisp at 3x, nothing asked yet', il.on && il.so === undefined && il.wo === 90 && Math.abs(il.h - il.ih) <= 2 && Math.abs(il.cw - il.w * il.dpr) <= 1 && il.calls === 0, JSON.stringify(il));
  await ip.waitForTimeout(3500); await free(ip);
  await ip.evaluate(() => { window.__permFail = 1; });                                   // the first request fails
  p = await facePoint(ip); await ip.touchscreen.tap(p.x, p.y); await ip.waitForTimeout(200);
  const i1 = await ip.evaluate(() => ({ calls: window.__permCalls, perm: window.__perm, full: !!document.fullscreenElement }));
  check('iPhone: the first touch asks for the motion sensors, during the touch, and he reacts (no full screen: an iPhone has none)', i1.calls === 1 && !i1.full && ['tap', 'fache', 'retour'].includes(await group(ip, await scene(ip))), JSON.stringify(i1) + ' ' + await scene(ip));
  await shot(ip, 'poche-iphone14');
  await ip.waitForTimeout(2500); await free(ip);
  p = await facePoint(ip); await ip.touchscreen.tap(p.x, p.y); await ip.waitForTimeout(200);
  const i2 = await ip.evaluate(() => ({ calls: window.__permCalls, perm: window.__perm }));
  check('iPhone: that request failed, so the next touch asks again, and gets a yes', i2.calls === 2 && i2.perm === 1, JSON.stringify(i2));
  await ip.waitForTimeout(2500); await free(ip);
  await motion(ip, [[0, 9.8], [0, 9.8], [-6, 7.6], [-6, 7.6], [-6, 7.6], [-6, 7.6], [-6, 7.6], [-6, 7.6], [-6, 7.6], [-6, 7.6]], 100, -1);
  const ilean = await ip.evaluate(() => Screens.local.lean);
  check('iPhone (its axes the other way round): tilted to the right, he leans to the right too', !!ilean && ilean.x > 40 && ilean.r < 0, JSON.stringify(ilean));
  await motion(ip, Array(12).fill([0, 9.8]), 100, -1); await free(ip);
  await motion(ip, [[0, 9.8], [0, 9.8], [-22, 18], [20, -6], [-24, 25], [22, -8], [-20, 20]], 120, -1);
  check('iPhone: shaken, he gets dizzy', ['poche-tournis', 'poche-cocktail'].includes(await scene(ip)), await scene(ip));
  check('iPhone: no page or console errors', iErr.length === 0, iErr.slice(0, 4).join(' | '));
  await ic.close();

  /* ================= the "Pixel de poche" button, phone upright (a locked rotation) ================= */
  const uc = await browser.newContext({ ...devices['Pixel 7'] }); await uc.addInitScript(INIT, false);
  const uprightPage = await uc.newPage(), uErr = errors(uprightPage);
  await uprightPage.goto(BASE + '/'); await uprightPage.waitForTimeout(900);
  check('upright: the remote, with a "Pixel de poche" button', await uprightPage.evaluate(() => !PixelPoche.on && !!document.querySelector('.poche-go') && document.querySelector('.poche-go').offsetParent !== null));
  await uprightPage.locator('.poche-go').tap(); await uprightPage.waitForTimeout(600);
  const ul = await uprightPage.evaluate(() => { const r = document.getElementById('crt').getBoundingClientRect(); return { on: PixelPoche.on, how: PixelPoche.how, w: r.width, iw: innerWidth, wl: window.__wl.asked }; });
  check('the button: Pixel full screen even upright (as wide as the phone)', ul.on && ul.how === 'fixe' && ul.w <= ul.iw && ul.w > ul.iw * 0.97 && ul.wl >= 1, JSON.stringify(ul));
  await shot(uprightPage, 'poche-pixel7-bouton');
  await uprightPage.locator('.poche-x').tap(); await uprightPage.waitForTimeout(300);
  check('…and × goes back', await uprightPage.evaluate(() => !PixelPoche.on));

  /* what is not a turn */
  const U = devices['Pixel 7'], ucdp = await uc.newCDPSession(uprightPage), isOn = () => uprightPage.evaluate(() => PixelPoche.on);
  const upright = async () => { await uprightPage.setViewportSize(U.viewport); await uprightPage.waitForTimeout(900); };
  await ucdp.send('Emulation.setDeviceMetricsOverride', { width: 760, height: 380, deviceScaleFactor: U.deviceScaleFactor, mobile: true, screenWidth: U.screen.width, screenHeight: U.screen.height, screenOrientation: { angle: 0, type: 'portraitPrimary' } });
  await uprightPage.waitForTimeout(900);
  const split = await uprightPage.evaluate(() => ({ on: PixelPoche.on, land: matchMedia('(orientation: landscape)').matches, o: screen.orientation.type }));
  check('an upright phone in split screen (a wide window, the phone upright): still the remote', split.land && /portrait/.test(split.o) && !split.on, JSON.stringify(split));
  await upright();
  await uprightPage.focus('#cmd'); await uprightPage.setViewportSize({ width: U.viewport.height, height: U.viewport.width }); await uprightPage.waitForTimeout(900);
  check('typing a command (the keyboard up): no Pixel de poche, the command bar stays', !(await isOn()) && await uprightPage.evaluate(() => document.activeElement.id === 'cmd'));
  await uprightPage.evaluate(() => document.activeElement.blur()); await uprightPage.waitForTimeout(900);
  check('…the keyboard gone, the phone is sideways: the Pixel de poche', await isOn());
  await uprightPage.evaluate(() => { window.__flips = 0; new MutationObserver(() => window.__flips++).observe(document.body, { attributes: true, attributeFilter: ['class'] }); });
  await uprightPage.setViewportSize(U.viewport); await uprightPage.waitForTimeout(150);
  await uprightPage.setViewportSize({ width: U.viewport.height, height: U.viewport.width }); await uprightPage.waitForTimeout(900);
  check('a wobble of auto-rotate (upright for a moment): he stays, he never left', await isOn() && (await uprightPage.evaluate(() => window.__flips)) === 0, String(await uprightPage.evaluate(() => window.__flips)));
  const ev0 = hubState.poche.ev && hubState.poche.ev.id;
  await upright(); await uprightPage.waitForTimeout(2600);                                 // (the server lets the same news through every 2.5 s)
  await uprightPage.setViewportSize({ width: U.viewport.height, height: U.viewport.width }); await uprightPage.waitForTimeout(900);
  await until(async () => hubState.poche.here > 0, 2000);
  check('turned again within a minute: no new hello for the Pi ("coucou mon jumeau" once), he only says he is there', await isOn() && (hubState.poche.ev && hubState.poche.ev.id) === ev0 && hubState.poche.here > 0, JSON.stringify([ev0, hubState.poche]));
  await upright();
  check('the button: no page or console errors', uErr.length === 0, uErr.slice(0, 4).join(' | '));
  await uc.close();

  /* ================= the Pi's usual address, plain http: no imitation at all ================= */
  const hc = await browser.newContext({ ...P7 });
  const hp = await hc.newPage(), hErr = errors(hp);
  await hp.goto(LAN + '/?t=le-code-poche');   // another name than localhost: the access code, as a phone has it from the QR code await until(() => hp.evaluate(() => !!window.PixelPoche && PixelPoche.on && document.getElementById('conn').textContent === 'connecté'), 8000);
  await hp.waitForTimeout(900);
  const hs = await hp.evaluate(() => ({ secure: isSecureContext, wl: !!navigator.wakeLock, bat: !!navigator.getBattery, motion: 'DeviceMotionEvent' in window, on: PixelPoche.on, awake: PixelPoche.awake, linked: PixelPoche.linked,
    note: (n => n && !n.hidden && n.textContent)(document.querySelector('.poche-note')) }));
  check('http: not a secure page (no Wake Lock, battery, nor motion for it), and still the Pixel de poche, connected', !hs.secure && !hs.wl && !hs.bat && hs.on && !hs.awake && hs.linked, JSON.stringify(hs));
  check('…he says once why he cannot feel the phone (https needed)', /https/.test(hs.note || '') && /mouvements/.test(hs.note) && /écran allumé/.test(hs.note), String(hs.note));
  check('…and draws', (await drawn(hp)) > 6);
  await shot(hp, 'poche-pixel7-http');
  await hp.locator('.poche-note').tap(); await hp.waitForTimeout(100);
  check('…a touch on the note closes it', await hp.evaluate(() => document.querySelector('.poche-note').hidden));
  await hp.waitForTimeout(2500); await free(hp);
  p = await facePoint(hp); await hp.touchscreen.tap(p.x, p.y); await hp.waitForTimeout(200);
  check('http: a tap still gets a reaction', ['tap', 'fache', 'retour'].includes(await group(hp, await scene(hp))), await scene(hp));
  check('http: no page or console errors', hErr.length === 0, hErr.slice(0, 4).join(' | '));
  await hc.close();

  /* ================= the Pixel app (pixel-mobile, an Android WebView: no Wake Lock) on that address ================= */
  const ac = await browser.newContext({ ...P7 });
  await ac.addInitScript(() => { window.__rn = []; window.ReactNativeWebView = { postMessage: m => window.__rn.push(JSON.parse(m)) }; });
  const ap = await ac.newPage(), aErr = errors(ap);
  const modes = () => ap.evaluate(() => window.__rn.filter(m => m.mode).map(m => m.mode));
  const lastMode = async () => (await modes()).slice(-1)[0];
  await ap.goto(LAN + '/?t=le-code-poche'); await until(() => ap.evaluate(() => !!window.PixelPoche && PixelPoche.on && document.getElementById('conn').textContent === 'connecté'), 8000);
  await ap.waitForTimeout(600);
  check('the app: sideways, he asks the app to keep the screen on ({mode: "pixel"}, after the page\'s own mode)', (await lastMode()) === 'pixel' && (await modes()).length >= 2, JSON.stringify(await modes()));
  check('…and never says "no access"', !(await ap.evaluate(() => window.__rn.some(m => m.access === false))));
  check('…his note leaves the screen out (the app keeps it on)', await ap.evaluate(() => (t => /mouvements/.test(t) && !/écran allumé/.test(t))(document.querySelector('.poche-note').textContent)));
  await ap.evaluate(() => { Screens.local.sleepy = true; }); await ap.waitForTimeout(1500);
  check('he falls asleep: the app may let the screen sleep (the page\'s own mode again)', (await lastMode()) === 'both', JSON.stringify(await modes()));
  await ap.evaluate(() => Screens.input()); await ap.waitForTimeout(1500);
  check('woken up: the screen on again', (await lastMode()) === 'pixel', JSON.stringify(await modes()));
  await ap.locator('.poche-x').tap(); await ap.waitForTimeout(300);
  check('× (back to the remote): the page\'s own mode', !(await ap.evaluate(() => PixelPoche.on)) && (await lastMode()) === 'both', JSON.stringify(await modes()));
  check('the app: no page or console errors', aErr.length === 0, aErr.slice(0, 4).join(' | '));
  await ac.close();

  /* ================= Pixel Lab: the phone frame ================= */
  const lc = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
  const lab = await lc.newPage(), lErr = errors(lab);
  await lab.goto(BASE + '/app/lab/index.html?themes=all'); await lab.waitForTimeout(900);
  await lab.click('#pocheView'); await lab.waitForTimeout(500);
  const fr = await lab.evaluate(() => { const m = document.querySelector('.monitor').getBoundingClientRect(), c = document.getElementById('crt').getBoundingClientRect(); return { on: PixelPoche.on, where: PixelPoche.where, cls: document.getElementById('lab').classList.contains('poche'), m: m.width / m.height, c: c.width / c.height, ch: c.height, sh: document.getElementById('screen').getBoundingClientRect().height }; });
  check('the lab: "Voir sur un téléphone" shows him in a phone held sideways (20:9, his 5:3 inside)', fr.on && fr.where === 'poche' && fr.cls && Math.abs(fr.m - 20 / 9) < 0.05 && Math.abs(fr.c - 5 / 3) < 0.02 && Math.abs(fr.ch - fr.sh) < 2, JSON.stringify(fr));
  for (const t of await lab.evaluate(() => PixelHub.THEMES.map(x => x.id))) {
    await lab.click(`#themeChips .chip[data-id="${t}"]`); await lab.waitForTimeout(450);
    if (SHOTS) await lab.locator('#device').screenshot({ path: path.join(SHOTS, `poche-lab-${t}.png`) });
  }
  check('the lab\'s phone frame draws in every theme', (await drawn(lab)) > 6);
  await lab.click('#themeChips .chip[data-id="retro"]'); await lab.evaluate(() => Screens.persona.stop());
  await lab.click('#pocheSense button >> nth=0'); await lab.waitForTimeout(100);
  check('the lab: "Secouer" makes him dizzy', ['poche-tournis', 'poche-cocktail'].includes(await scene(lab)), await scene(lab));
  await lab.click('#pocheView'); await lab.waitForTimeout(300); await lab.evaluate(() => Screens.persona.stop());
  await lab.click('#pocheTwin button >> nth=2'); await lab.waitForTimeout(150);
  check('the lab, the Pi\'s side: "On le caresse" (on the phone) makes him jealous', ['poche-jaloux', 'poche-envie'].includes(await scene(lab)), await scene(lab));
  check('the lab: no page or console errors', lErr.length === 0, lErr.slice(0, 4).join(' | '));
  await lc.close();

  check('the Pi\'s screen: no page or console errors', kErr.length === 0, kErr.slice(0, 4).join(' | '));
  await browser.close();
  hub.close(); await stopServer();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${fails} failure(s)`);
  process.exit(fails ? 1 : 0);
})().catch(async e => { console.error('CRASH', e); try { await stopServer(); } catch {} process.exit(1); });
