// Screen sharing end to end, in Chromium (Playwright):  node tests/test_ecran_web.js
// Starts its own demo server (port 8153, a temporary data folder; ECRAN_WEB_PORT, ECRAN_MJPEG_PORT, ECRAN_EVIL_PORT for others), then:
// - Pixel's screen (the kiosk, ?kiosk=1 from 127.0.0.1) and a computer's page (/ecran) whose getDisplayMedia gives a test
//   pattern (a canvas stream: red, green, blue and white bands, a moving square);
// - pairing with the one-time code (read from the state, like the phone app shows it); the WebRTC picture drawn on Pixel's
//   canvas in its true colours with no CRT effect (no scanlines, no grain on the black bars), 30 im/s at most, as its
//   pictures come; then the stops:
//   from the computer, from the phone, by a tap on Pixel, by closing the computer's page; wrong codes; the access code;
// - the downloaded launcher, opened as file://: a secure context, it finds Pixel by its address and pairs too;
// - another site's page on this machine gets nothing without the code: a sandboxed frame (Origin: null) on /ws and
//   /ecran/ws, and a name of its own that leads to Pixel (DNS rebinding, here Chromium's --host-resolver-rules);
// - Android: a fake ScreenStream (MJPEG, portrait) on this machine, shown on Pixel's screen from the phone's own address,
//   its download ended with the cast; a phone without ScreenStream gets a clear message.
// Screenshots go to $PIXEL_SHOTS (default: a folder in the system's temp folder), never into the repo.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), net = require('net');
const APP = path.join(__dirname, '..'), PORT = Number(process.env.ECRAN_WEB_PORT) || 8153, MJPEG = Number(process.env.ECRAN_MJPEG_PORT) || 8154,
  EVIL = Number(process.env.ECRAN_EVIL_PORT) || 8156, TOKEN = 'le-code-de-test';
const SHOTS = process.env.PIXEL_SHOTS || path.join(os.tmpdir(), 'pixel-ecran-shots');
let fails = 0;
const check = (name, ok, info = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (!ok && info ? `  [${info}]` : '')); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 8000, step = 100) { const end = Date.now() + ms; let v; while (Date.now() < end) { try { v = await fn(); } catch (e) { v = null; } if (v) return v; await sleep(step); } return v; }
const lanIp = () => { for (const l of Object.values(os.networkInterfaces())) for (const a of l || []) if (a.family === 'IPv4' && !a.internal) return a.address; return null; };

function freePort(p) { return new Promise(r => { const s = net.createServer().once('error', () => r(false)).once('listening', () => s.close(() => r(true))).listen(p, '0.0.0.0'); }); }
async function startServer(dir) {
  if (!(await freePort(PORT))) throw new Error(`le port ${PORT} est déjà pris`);
  const cfg = path.join(dir, 'config.toml');
  fs.writeFileSync(cfg, `data_dir = "${dir}"\n[security]\ntoken = "${TOKEN}"\n[ecran]\nkiosk_wait = 6\nlive_wait = 20\n`);
  const p = spawn('python3', [path.join(APP, 'server.py'), '--demo', '--port', String(PORT), '--config', cfg], { cwd: APP, stdio: ['ignore', 'ignore', 'pipe'] });
  let log = ''; p.stderr.on('data', d => { log += d; });
  const ok = await until(async () => (await fetch(`http://127.0.0.1:${PORT}/ecran`)).ok, 15000, 200);
  if (!ok) { p.kill(); throw new Error('le serveur de démo ne démarre pas: ' + log.slice(-500)); }
  return p;
}
/* the phone: the app's WebSocket, with the access code; it keeps the last state */
function phone() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?t=${TOKEN}`), me = { state: null, ws };
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'state') me.state = m.data; };
  me.send = (action, args = {}) => ws.send(JSON.stringify({ action, args }));
  me.ready = until(() => me.state, 5000);
  return me;
}
/* a computer's screen, for the page: a canvas stream with known colours instead of the real capture */
const FAKE_SCREEN = () => {
  const md = navigator.mediaDevices || (navigator.mediaDevices = {});
  md.getDisplayMedia = async constraints => {
    window.__asked = constraints;
    const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; const g = cv.getContext('2d');
    const draw = () => {
      ['#ff0000', '#00ff00', '#0000ff', '#ffffff'].forEach((c, i) => { g.fillStyle = c; g.fillRect(i * 320, 0, 320, 720); });
      g.fillStyle = '#000'; g.fillRect(80 + (Date.now() / 5) % 1000, 420, 90, 90);     // something that moves, low in the picture
    };
    draw(); setInterval(draw, 33);
    const s = cv.captureStream(30); window.__stream = s; return s;
  };
};
/* pixels of Pixel's screen from a screenshot: a cross-origin picture (the phone's stream) taints the canvas for getImageData */
async function shotPx(tool, page, pts) {
  const b64 = (await page.screenshot()).toString('base64');
  return tool.evaluate(async ({ b64, pts }) => {
    const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    return pts.map(([x, y]) => Array.from(g.getImageData(x, y, 1, 1).data.slice(0, 3)));
  }, { b64, pts });
}
const px = (page, pts) => page.evaluate(pts => { const g = document.getElementById('crt').getContext('2d', { willReadFrequently: true }); return pts.map(([x, y]) => Array.from(g.getImageData(x, y, 1, 1).data.slice(0, 3))); }, pts);
const barDirt = page => page.evaluate(() => {         // the black bar above the picture: anything but black is the CRT layer
  const g = document.getElementById('crt').getContext('2d', { willReadFrequently: true }), d = g.getImageData(0, 2, 800, 10).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 0) n++;
  return n;
});
const after = page => page.evaluate(() => getComputedStyle(document.getElementById('screen'), '::after').display);

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-ecran-'));
  const srv = await startServer(dir);
  const browser = await chromium.launch({ args: ['--proxy-server=direct://',   // the house's network, straight (a proxy set here would take the WebSockets)
    '--host-resolver-rules=MAP evil.example 127.0.0.1'] });                      // another site's name that leads to Pixel (DNS rebinding)
  let mj = null, evil = null;
  try {
    const ph = phone(); await ph.ready;
    check('state: the screen-sharing addresses for the phone app, AirPlay off', ph.state.settings.ecran && /\/ecran$/.test(ph.state.settings.ecran.page) && ph.state.airplay && ph.state.airplay.status === 'off', JSON.stringify([ph.state.settings.ecran, ph.state.airplay]));

    // ---- Pixel's screen ----
    const kctx = await browser.newContext({ viewport: { width: 800, height: 480 }, deviceScaleFactor: 1 });
    const kiosk = await kctx.newPage(); const kerr = []; kiosk.on('pageerror', e => kerr.push(e.message));
    await kiosk.goto(`http://127.0.0.1:${PORT}/?kiosk=1`);
    await until(() => kiosk.evaluate(() => Screens.local.boot < 0 && !!window.PixelEcran), 12000);
    await sleep(400);
    const before = await barDirt(kiosk);
    check("Rétro before any cast: the CRT layer and the page's scanlines are there", before > 0 && (await after(kiosk)) !== 'none', `${before} ${await after(kiosk)}`);

    // ---- a computer: its page, the code, the share ----
    const sctx = await browser.newContext({ viewport: { width: 900, height: 800 } }); await sctx.addInitScript(FAKE_SCREEN);
    const pc = await sctx.newPage(); const perr = []; pc.on('pageerror', e => perr.push(e.message));
    await pc.goto(`http://127.0.0.1:${PORT}/ecran`);
    const card = await until(() => ph.state.cast && ph.state.cast.kind === 'screen' && ph.state.cast.phase === 'code' && ph.state.cast);
    check('the page asks for a code: Pixel shows 6 digits (the phone app sees them too)', card && /^\d{6}$/.test(card.code), JSON.stringify(card));
    check('the page itself is never told the code', !(await pc.content()).includes(card.code));
    await pc.fill('#code', card.code.slice(0, 3) + ' ' + card.code.slice(3)); await pc.click('#pairForm button');
    await until(() => pc.isVisible('#go'));
    const paired = await until(() => ph.state.cast && ph.state.cast.phase === 'paired', 3000);
    check('the right code: paired, Pixel says the computer is connected', await pc.isVisible('#go') && paired, ph.state.cast && ph.state.cast.phase);
    await pc.click('#go');
    const live = await until(() => ph.state.cast && ph.state.cast.phase === 'live' && ph.state.cast, 15000);
    check('the share: WebRTC up, the state says live, with its name', live && live.via === 'webrtc' && /^Écran : PC Linux/.test(live.title), JSON.stringify(live));
    const asked = await pc.evaluate(() => window.__asked);
    check('the capture asks for 1280 x 720 at 30 im/s at most', asked && asked.video.width.max === 1280 && asked.video.height.max === 720 && asked.video.frameRate.max === 30, JSON.stringify(asked));
    const shown = await until(() => kiosk.evaluate(() => Screens.cast.ready && Screens.cast.playing), 10000);
    await sleep(1200);
    check('Pixel draws the computer\'s picture from its <video>, 30 im/s at most, as its pictures come (requestVideoFrameCallback)',
      shown && !!(await until(() => kiosk.evaluate(() => Screens.local.fpsWant <= 30 && Screens.cast.frames), 4000)), await kiosk.evaluate(() => [Screens.local.fpsWant, Screens.cast.frames].join()));
    const [red, green, blue, white] = await px(kiosk, [[100, 120], [300, 120], [500, 120], [700, 120]]);
    const near = (c, want) => c.every((v, i) => Math.abs(v - want[i]) < 60);
    check('true colours on Pixel: red, green, blue and white stay so (no green tint)', near(red, [255, 0, 0]) && near(green, [0, 255, 0]) && near(blue, [0, 0, 255]) && near(white, [255, 255, 255]), JSON.stringify([red, green, blue, white]));
    check('no CRT effect over it: the black bar above the picture is pure black, the scanlines hidden', (await barDirt(kiosk)) === 0 && (await after(kiosk)) === 'none' && await kiosk.evaluate(() => document.getElementById('screen').classList.contains('casting')), `${await barDirt(kiosk)} ${await after(kiosk)}`);
    check("the computer's page says it is on Pixel", /sur Pixel/.test(await pc.textContent('#msg')), await pc.textContent('#msg'));
    const calm = await until(() => kiosk.evaluate(() => Screens.cast.peek === 0 && Screens.local.fpsWant === 10), 12000);
    const square = async () => (await px(kiosk, Array.from({ length: 70 }, (_, i) => [10 + i * 11, 305]))).findIndex(c => c[0] + c[1] + c[2] < 60);
    const sq1 = await square(); await sleep(700); const sq2 = await square();
    check('... once the little Pixel has gone (10 im/s asked), the picture still follows the computer, frame by frame', calm && sq1 >= 0 && sq2 >= 0 && sq1 !== sq2,
      `${await kiosk.evaluate(() => Screens.local.fpsWant)} ${sq1} ${sq2}`);
    await kiosk.screenshot({ path: path.join(SHOTS, 'ecran-kiosk-pc.png') });
    await pc.screenshot({ path: path.join(SHOTS, 'ecran-pc-page.png') });

    // ---- the stops ----
    await pc.click('#stop');
    await until(() => !ph.state.cast);
    await sleep(300);
    check('stop from the computer: the cast ends, the Rétro look is back as it was', !ph.state.cast && !(await kiosk.evaluate(() => document.getElementById('screen').classList.contains('casting'))) && (await after(kiosk)) !== 'none' && (await barDirt(kiosk)) > 0);
    check("... and Pixel's screen let the connection go", await kiosk.evaluate(() => PixelEcran.status === null && Screens.cast.id === null));
    const again = async () => { await pc.click('#go'); return until(() => ph.state.cast && ph.state.cast.phase === 'live', 15000); };
    check('the same page shares again without a new code', !!(await again()));
    ph.send('cast.stop');
    check("stop from the phone (Arrêter): the computer's page is told", !!(await until(async () => /arrêté sur Pixel/.test(await pc.textContent('#msg')))), await pc.textContent('#msg'));
    check('... and its capture is let go', await pc.evaluate(() => window.__stream.getTracks().every(t => t.readyState === 'ended')));
    await again(); await until(() => kiosk.evaluate(() => Screens.cast.ready), 8000);
    await kiosk.mouse.move(400, 240); await kiosk.mouse.down(); await kiosk.mouse.up();
    check('a tap on Pixel stops it, and the computer hears it', !!(await until(async () => !ph.state.cast && /arrêté sur Pixel/.test(await pc.textContent('#msg')))));
    await again();
    ph.send('screen.show', { screen: 'agenda' });
    check('opening another screen on Pixel ends it too', !!(await until(() => !ph.state.cast && ph.state.screen === 'agenda')));
    await again();
    await pc.close();
    check("the computer's page closed: Pixel goes back to its screen", !!(await until(() => !ph.state.cast)));
    await sleep(300);
    check('no error on Pixel or on the computer\'s page', kerr.length === 0 && perr.length === 0, JSON.stringify([kerr, perr]));

    // ---- wrong codes, the access code ----
    const pc2 = await sctx.newPage(); await pc2.goto(`http://127.0.0.1:${PORT}/ecran`);
    let card2 = await until(() => ph.state.cast && ph.state.cast.phase === 'code' && ph.state.cast, 3000);
    const spaced = !card2 && /Attends quelques secondes/.test(await pc2.textContent('#msg'));
    check('a new code comes 5 s after the last one at the soonest', card2 || spaced, await pc2.textContent('#msg'));
    if (!card2) { await sleep(5200); await pc2.click('#again'); card2 = await until(() => ph.state.cast && ph.state.cast.phase === 'code' && ph.state.cast); }
    if (!card2) throw new Error('no code for a second page: ' + await pc2.textContent('#msg'));
    const wrong = String((Number(card2.code) + 1) % 1e6).padStart(6, '0');
    for (let i = 0; i < 5; i++) { await pc2.fill('#code', wrong); await pc2.click('#pairForm button'); await sleep(150); }
    check('five wrong codes: that code is gone from Pixel, the page says to ask again', !!(await until(async () => !ph.state.cast && /nouveau code/.test(await pc2.textContent('#msg')))), await pc2.textContent('#msg'));
    check('... and the page never got to share', !(await pc2.isVisible('#go')));
    await pc2.close();
    const pc3 = await sctx.newPage(); await pc3.goto(`http://127.0.0.1:${PORT}/ecran?t=${TOKEN}`);
    check('with the access code (the app opened it): no code to type', !!(await until(() => pc3.isVisible('#go'))) && !(ph.state.cast && ph.state.cast.phase === 'code'));
    await pc3.close();

    // ---- the downloaded launcher, opened from the disk ----
    const ip = lanIp();
    const r = await fetch(`http://127.0.0.1:${PORT}/ecran/lanceur.html`), html = await r.text();
    check('the launcher downloads as Pixel-ecran.html, with no secret in it', /attachment; filename="Pixel-ecran.html"/.test(r.headers.get('content-disposition')) && !html.includes(TOKEN) && /"file": true/.test(html));
    if (ip) {
      const f = path.join(dir, 'Pixel-ecran.html'); fs.writeFileSync(f, html);
      const lp = await sctx.newPage(); const lerr = []; lp.on('pageerror', e => lerr.push(e.message));
      await lp.goto('file://' + f);
      check('opened from the disk (file://), the page is a secure context: it can share', await lp.evaluate(() => isSecureContext && !!navigator.mediaDevices.getDisplayMedia));
      let card3 = await until(() => ph.state.cast && ph.state.cast.phase === 'code' && ph.state.cast, 15000);
      if (!card3 && /Attends quelques secondes/.test(await lp.textContent('#msg'))) { await sleep(5200); await lp.click('#again'); card3 = await until(() => ph.state.cast && ph.state.cast.phase === 'code' && ph.state.cast); }
      if (!card3) console.log('     the launcher says: ' + await lp.textContent('#msg'));
      check('it finds Pixel by its address (the .local name does not answer here) and asks for a code', !!card3);
      if (card3) {
        await lp.fill('#code', card3.code); await lp.click('#pairForm button'); await until(() => lp.isVisible('#go')); await lp.click('#go');
        check('... pairs and shares from file:// (its WebSocket comes with Origin: null)', !!(await until(() => ph.state.cast && ph.state.cast.phase === 'live', 15000)));
        await lp.click('#stop'); await until(() => !ph.state.cast);
      }
      check('no error in the launcher', lerr.length === 0, lerr.join(' | '));
      await lp.close();
    } else console.log('SKIP launcher: no network address here');

    // ---- another site's page on this machine, without the code ----
    const probe = `const out = {}, go = (k, url, m) => new Promise(r => { let w; try { w = new WebSocket(url); } catch (e) { out[k] = 'refused'; return r(); }
      w.onopen = () => { out[k] = 'open'; w.send(m); setTimeout(r, 600); }; w.onerror = () => { out[k] = out[k] || 'refused'; r(); }; });`;
    const tries = host => `Promise.all([go('ws', 'ws://${host}/ws', JSON.stringify({ action: 'cast.text', args: { text: 'piège' } })), go('ecran', 'ws://${host}/ecran/ws', JSON.stringify({ type: 'pair' }))])`;
    evil = http.createServer((req, res) => {          // a page with a sandboxed frame: its WebSockets come with Origin: null
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><iframe sandbox="allow-scripts" srcdoc="<script>${probe} ${tries('127.0.0.1:' + PORT)}.then(() => parent.postMessage(out, '*'));</script>"></iframe>`
        + "<script>addEventListener('message', e => { window.__res = e.data; });</script>");
    }).listen(EVIL, '127.0.0.1');
    await sleep(5200);                                // codes are spaced: a code now would be this page's
    const ectx = await browser.newContext(), ep = await ectx.newPage();
    await ep.goto(`http://127.0.0.1:${EVIL}/`);
    const res = await until(() => ep.evaluate(() => window.__res), 5000);
    await sleep(300);
    check("a sandboxed frame on another site's page (Origin: null): refused on /ws and /ecran/ws, nothing cast, no code",
      res && res.ws === 'refused' && res.ecran === 'refused' && !(ph.state.cast && (ph.state.cast.text === 'piège' || ph.state.cast.phase === 'code')), JSON.stringify([res, ph.state.cast]));
    const rp = await ectx.newPage();
    await rp.goto(`http://evil.example:${PORT}/ecran`);   // Pixel answers it, under that name: its own page asks for a code at once
    const rres = await rp.evaluate(`(async () => { ${probe} await ${tries('evil.example:' + PORT)}; return out; })()`);
    await sleep(500);
    check('another site\'s name that leads to Pixel (DNS rebinding): refused on /ws and /ecran/ws, nothing cast, no code',
      rres.ws === 'refused' && rres.ecran === 'refused' && !(ph.state.cast && (ph.state.cast.text === 'piège' || ph.state.cast.phase === 'code')), JSON.stringify([rres, ph.state.cast]));
    const lr = await rp.evaluate(() => fetch('/ecran/lanceur.html').then(r => r.status));
    check('... nor can it download the launcher (its key)', lr === 403, String(lr));
    await ectx.close();

    // ---- the help, where the page cannot share (plain http from another machine) ----
    const hctx = await browser.newContext(); const hp = await hctx.newPage();
    await hp.addInitScript(() => { Object.defineProperty(window, 'isSecureContext', { get: () => false }); });
    await hp.goto(`http://127.0.0.1:${PORT}/ecran`);
    const origins = await hp.inputValue('#origins');
    check("without a secure context: the three ways, the launcher first, the Chrome setting with Pixel's addresses", await hp.isVisible('#helpSecure') && await hp.isVisible('#launcher')
      && origins.split(',').length === 2 && origins.split(',').every(o => o.endsWith(':' + PORT)), origins);
    await hp.screenshot({ path: path.join(SHOTS, 'ecran-pc-help.png'), fullPage: true });
    await hctx.close();

    // ---- Android: ScreenStream's MJPEG, from the phone's own address ----
    if (ip) {
      const jpeg = Buffer.from((await kiosk.evaluate(() => { const c = document.createElement('canvas'); c.width = 360; c.height = 720; const g = c.getContext('2d'); g.fillStyle = '#ff8800'; g.fillRect(0, 0, 360, 720); return c.toDataURL('image/jpeg', 0.95); })).split(',')[1], 'base64');
      let open = 0, served = 0;
      mj = http.createServer((req, res) => {
        if (req.url !== '/stream.mjpeg') { res.writeHead(404); return res.end(); }
        open++; served++; res.writeHead(200, { 'Content-Type': 'multipart/x-mixed-replace; boundary=frame', 'Cache-Control': 'no-cache' });
        const iv = setInterval(() => res.write(Buffer.concat([Buffer.from(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`), jpeg, Buffer.from('\r\n')])), 60);
        req.on('close', () => { clearInterval(iv); open--; });
      }).listen(MJPEG, '0.0.0.0');
      const rr = await fetch(`http://${ip}:${PORT}/ecran/telephone`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pixel-Token': TOKEN }, body: JSON.stringify({ port: MJPEG }) });
      const j = await rr.json();
      check("the phone's button: Pixel takes the phone's address from its request", j.ok && j.src === `http://${ip}:${MJPEG}/stream.mjpeg`, JSON.stringify(j));
      await until(() => kiosk.evaluate(() => Screens.cast.ready), 8000); await sleep(800);
      const tool = await kctx.newPage();
      const [mid, bar] = await shotPx(tool, kiosk, [[400, 240], [20, 240]]);
      check("Pixel's screen loads the stream itself: the phone's picture, upright, in its colours, black on the sides", served > 0 && near(mid, [255, 136, 0]) && bar.join() === '0,0,0', JSON.stringify([served, mid, bar]));
      await tool.close();
      check('... drawn 30 times a second, with no CRT effect', await kiosk.evaluate(() => Screens.local.fpsWant >= 30) && (await after(kiosk)) === 'none');
      await kiosk.screenshot({ path: path.join(SHOTS, 'ecran-kiosk-android.png') });
      ph.send('cast.stop');
      check('stopped: Pixel lets the stream go (the phone stops sending)', !!(await until(() => open === 0 && !ph.state.cast)), String(open));
      await fetch(`http://${ip}:${PORT}/ecran/telephone`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pixel-Token': TOKEN }, body: JSON.stringify({ port: MJPEG + 1 }) });
      check('no ScreenStream on the phone: Pixel says what to do, and goes back', !!(await until(() => !ph.state.cast && ph.state.toast && /ScreenStream/.test(ph.state.toast.msg), 20000)), JSON.stringify(ph.state.toast));
    } else console.log('SKIP Android: no network address here');
    check('no error on Pixel in all of it', kerr.length === 0, kerr.join(' | '));
    ph.ws.close();
  } catch (e) { console.log('CRASH', e && e.stack || e); fails++; }
  finally {
    await browser.close(); srv.kill(); if (mj) mj.close(); if (evil) evil.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(`\n${fails} failure(s)   (screenshots: ${SHOTS})`);
  process.exit(fails ? 1 : 0);
})();
