// YouTube on Pixel from end to end, in a real browser, without the Internet:  node tests/test_youtube_e2e.js
// Starts a demo server (port 8166, or YOUTUBE_E2E_PORT) with [ytcast] on and the fake sidecar (tests/fake_ytcast.py), opens Pixel's screen
// (?kiosk=1, 800 x 480) and the phone app (390 x 844) in Chromium (Playwright), YouTube's IFrame API and player replaced by
// a stub (everything else outside is refused), then:
// - the phone casts a YouTube link: Pixel's screen makes YouTube's player, with its address, its referrer policy;
// - the phone's remote control: the real title, pause, +10 s, the volume reach Pixel's player, its state comes back;
// - the end of the video ends the cast; an error (150) shows a card on Pixel and a link "Ouvrir sur YouTube" on the phone;
// - the YouTube app (the fake sidecar) plays a video and seeks: Pixel's player does it, and says so back;
// - the TV code on Pixel's screen and in the app. Screenshots in the scratchpad folder (PIXEL_SHOTS), never in the repo.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), net = require('net');
const APP = path.join(__dirname, '..'), PORT = Number(process.env.YOUTUBE_E2E_PORT) || 8166, BASE = `http://127.0.0.1:${PORT}`, PHONE = 'le-code-du-telephone';
const SHOTS = process.env.PIXEL_SHOTS || path.join(os.tmpdir(), 'pixel-youtube-shots');
let fails = 0;
const check = (name, ok, info = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (!ok && info ? `  [${info}]` : '')); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 8000) { const end = Date.now() + ms; let v; while (Date.now() < end) { try { v = await fn(); if (v) return v; } catch (e) { /* not yet */ } await sleep(100); } return v; }

/* YouTube's IFrame API, as a stub: YT.Player on the iframe Pixel made; what it is asked to do is in window.__yt */
const STUB = `(() => {
  const log = window.__yt = { players: [] };
  class Player {
    constructor(el, o) {
      this.el = el; this.o = o; this.src = el.src; this.calls = []; this.t = 30; this.d = 596; this.vol = 100; this.m = false; this.st = -1;
      log.players.push(this); setTimeout(() => { o.events.onReady({ target: this }); this.go(1); }, 50);
    }
    go(s) { this.st = s; this.o.events.onStateChange({ data: s, target: this }); }
    playVideo() { this.calls.push('play'); setTimeout(() => this.go(1), 30); }
    pauseVideo() { this.calls.push('pause'); setTimeout(() => this.go(2), 30); }
    seekTo(t) { this.calls.push('seek ' + Math.round(t)); this.t = t; setTimeout(() => this.go(this.st === 2 ? 2 : 1), 30); }
    setVolume(v) { this.calls.push('volume ' + v); this.vol = v; } getVolume() { return this.vol; }
    mute() { this.calls.push('mute'); this.m = true; } unMute() { this.calls.push('unmute'); this.m = false; } isMuted() { return this.m; }
    getCurrentTime() { return this.t; } getDuration() { return this.d; } getVideoData() { return { video_id: 'aqz-KE-bpKQ', title: 'Big Buck Bunny 60fps' }; }
    getPlaylist() { return null; } getPlaylistIndex() { return 0; }
    loadVideoById(a) { this.calls.push('load ' + a.videoId + ' ' + a.startSeconds); setTimeout(() => this.go(1), 30); }
    destroy() { this.destroyed = true; }
  }
  window.YT = { Player };
  setTimeout(() => window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady(), 20);
})();`;
// its links, as the real player's: the title and the logo open youtube.com in a new window (target=_blank), others the whole page
const FRAME = '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#202020;color:#fff;font:28px sans-serif;display:grid;place-items:center;height:100vh">Lecteur YouTube (simulé)'
  + '<a id="out" href="https://www.youtube.com/watch?v=aqz-KE-bpKQ" target="_blank" style="position:absolute;right:16px;bottom:16px;color:#fff;font-size:16px">Regarder sur YouTube</a>'
  + '<a id="top" href="https://www.youtube.com/" target="_top" style="position:absolute;left:16px;bottom:16px;color:#fff;font-size:16px">YouTube</a></body>';

function waitPort() {
  return new Promise((ok, ko) => {
    let n = 0;
    const tryIt = () => { const s = net.connect(PORT, '127.0.0.1', () => { s.end(); ok(); }); s.on('error', () => { if (++n > 100) ko(new Error('le serveur ne démarre pas')); else setTimeout(tryIt, 100); }); };
    tryIt();
  });
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-yt-'));
  fs.writeFileSync(path.join(tmp, 'config.toml'), `data_dir = "${tmp}"\n[security]\ntoken = "${PHONE}"\n[ytcast]\nenabled = true\ncommand = ["python3", "tests/fake_ytcast.py"]\n`);
  const logFd = fs.openSync(path.join(tmp, 'server.log'), 'w');
  const srv = spawn('python3', [path.join(APP, 'server.py'), '--demo', '--port', String(PORT), '--config', path.join(tmp, 'config.toml')], { cwd: APP, stdio: ['ignore', logFd, logFd] });
  const srvGone = new Promise(r => srv.on('exit', r));
  const ctl = m => fs.appendFileSync(path.join(tmp, 'ytcast', 'ctl.jsonl'), JSON.stringify(m) + '\n');
  const got = () => { try { return fs.readFileSync(path.join(tmp, 'ytcast', 'got.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } };
  const browser = await chromium.launch();
  try {
    await waitPort();
    const outside = [], errs = [];
    const ctx = await browser.newContext();
    await ctx.route(u => !u.href.startsWith(BASE), route => {
      const u = route.request().url();
      outside.push(u);
      if (u === 'https://www.youtube.com/iframe_api') return route.fulfill({ contentType: 'text/javascript', body: STUB });
      if (/^https:\/\/www\.youtube(-nocookie)?\.com\/embed\//.test(u)) return route.fulfill({ contentType: 'text/html', body: FRAME });
      return route.abort();
    });
    const kiosk = await ctx.newPage(); await kiosk.setViewportSize({ width: 800, height: 480 });
    const phone = await ctx.newPage(); await phone.setViewportSize({ width: 390, height: 844 });
    const SANDBOXED = /sandboxed|allow-popups|allow-top-navigation/;     // the browser saying it refused what the player's links asked
    for (const p of [kiosk, phone]) { p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load resource/.test(m.text()) && !SANDBOXED.test(m.text())) errs.push(m.text()); }); }
    await kiosk.goto(BASE + '/?kiosk=1');
    await phone.goto(BASE + '/?t=' + PHONE);
    await until(() => kiosk.evaluate(() => Screens.local.boot < 0), 12000);
    await phone.click('#cast summary');
    check('the phone: the YouTube app\'s side says Pixel is in its Cast button, with the TV code',
      await until(() => phone.evaluate(() => /bouton Caster/.test(document.querySelector('.ytc-status').textContent) && document.querySelector('.ytc-code').textContent === 'Code TV : 123 456 789 012')));

    // ---- a link from the phone ----
    await phone.fill('#castLink', 'youtu.be/aqz-KE-bpKQ?t=30'); await phone.press('#castLink', 'Enter');
    const p1 = await until(() => kiosk.evaluate(() => window.__yt && window.__yt.players.length && document.querySelector('.yt-player iframe') && ({ src: __yt.players[0].src, rp: document.querySelector('.yt-player iframe').referrerPolicy, allow: document.querySelector('.yt-player iframe').getAttribute('allow') })));
    check("Pixel's screen: YouTube's player for the link, youtube-nocookie, from 30 s, with its origin and referrer policy", p1 && p1.src.startsWith('https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?autoplay=1')
      && /&start=30&/.test(p1.src) && p1.src.endsWith('&origin=' + encodeURIComponent(BASE)) && p1.rp === 'strict-origin-when-cross-origin' && /autoplay/.test(p1.allow), JSON.stringify(p1));
    check('the page asked for nothing outside but YouTube\'s player', outside.every(u => /^https:\/\/www\.youtube(-nocookie)?\.com\/(iframe_api|embed\/)/.test(u)), outside.join(' '));
    const title = await until(() => phone.evaluate(() => { const t = document.querySelector('.ytr-title'); return t && !document.querySelector('.ytr').hidden && /Big Buck Bunny/.test(t.textContent) && t.textContent; }));
    check('the phone: its remote control, with the real title Pixel\'s player gave', !!title, String(title));
    await sleep(300);
    await phone.screenshot({ path: path.join(SHOTS, 'phone-remote.png') });
    // the page's scanlines switched on for the check (Rétro's .screen::after), whatever a cast does to them: the player must stay above
    const stacked = await kiosk.evaluate(() => { const b = document.querySelector('.yt-player'), s = document.getElementById('screen'), r = b.getBoundingClientRect(); s.classList.remove('flat');
      return { z: +getComputedStyle(b).zIndex, lines: +getComputedStyle(s, '::after').zIndex, crt: !s.classList.contains('flat'), cmd: !!(b.compareDocumentPosition(document.getElementById('cmdForm')) & Node.DOCUMENT_POSITION_FOLLOWING), r: [r.left, r.top, r.width, r.height] }; });
    check("on Pixel's screen (Rétro, scanlines on), the player is above the page's scanlines, under its command bar", stacked.z > stacked.lines && stacked.cmd, JSON.stringify(stacked));
    // the pixels of the player: the frame's own grey, with no line nor tint of the tube over them
    const shot = (await kiosk.screenshot({ clip: { x: stacked.r[0] + 20, y: stacked.r[1] + 16, width: 160, height: 60 } })).toString('base64');
    const px = await phone.evaluate(async b64 => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let off = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 32) + Math.abs(d[i + 1] - 32) + Math.abs(d[i + 2] - 32) > 6) off++; return off; }, shot);
    check('... its pixels are the video\'s own: no scanline, no green over it', px === 0, `${px} pixels changed`);
    await kiosk.screenshot({ path: path.join(SHOTS, 'kiosk-player.png') });
    // a tap on the player's own links (its title, its logo, an ad): no window over Pixel, Pixel's page stays (the kiosk has no tabs, no back)
    const opened = []; ctx.on('page', p => opened.push(p.url()));
    const player = kiosk.frameLocator('.yt-player iframe');
    await player.locator('#out').click(); await sleep(600);
    const popup = opened.length;
    await player.locator('#top').click({ noWaitAfter: true }); await sleep(600);
    const after = await kiosk.evaluate(() => { const f = document.querySelector('.yt-player iframe'); return { frame: !!f, sandbox: f && f.getAttribute('sandbox') }; }).catch(e => ({ frame: false, err: e.message }));
    check("a tap on the player's links (« Regarder sur YouTube », target=_blank or _top): no new window, Pixel's page stays",
      popup === 0 && opened.length === 0 && ctx.pages().length === 2 && kiosk.url() === BASE + '/?kiosk=1' && after.frame, JSON.stringify({ opened, url: kiosk.url(), ...after }));
    // the remote control
    await phone.click('.ytr-row .cbtn.big');
    check('the phone\'s Pause: Pixel\'s player pauses, and the phone shows it', await until(() => kiosk.evaluate(() => __yt.players[0].calls.includes('pause')))
      && await until(() => phone.evaluate(() => document.querySelector('.ytr-row .cbtn.big').textContent === 'Lecture' && /En pause/.test(document.querySelector('.ytr-time').textContent))));
    await phone.click('text=+10 s');
    check('the phone\'s +10 s: Pixel\'s player goes 10 s further', await until(() => kiosk.evaluate(() => __yt.players[0].calls.some(c => /^seek 4\d$/.test(c)))), await kiosk.evaluate(() => __yt.players[0].calls.join()));
    await phone.evaluate(() => { const v = document.querySelector('.ytr-vol .ytr-range'); v.value = '35'; v.dispatchEvent(new Event('change')); });
    check('the phone\'s volume: on Pixel\'s player', await until(() => kiosk.evaluate(() => __yt.players[0].calls.includes('volume 35'))));
    await kiosk.evaluate(() => __yt.players[0].go(0));
    check('the end of the video ends the cast: the player goes, the phone\'s remote too', await until(() => kiosk.evaluate(() => !document.querySelector('.yt-player') && __yt.players[0].destroyed))
      && await until(() => phone.evaluate(() => document.querySelector('.ytr').hidden)));

    // ---- an error: a card on Pixel, a link on the phone ----
    await phone.fill('#castLink', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'); await phone.press('#castLink', 'Enter');
    await until(() => kiosk.evaluate(() => __yt.players.length === 2 && __yt.players[1].o));
    await sleep(200);
    await kiosk.evaluate(() => __yt.players[1].o.events.onError({ data: 150 }));
    const err = await until(() => phone.evaluate(() => { const e = document.querySelector('.ytr-err'), a = document.querySelector('.ytr-open'); return e.textContent && !a.hidden && { e: e.textContent, href: a.href }; }));
    check('error 150: the phone says why, in French, and offers to open it on YouTube', err && /ailleurs que sur YouTube/.test(err.e) && err.href === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', JSON.stringify(err));
    check('... Pixel\'s screen shows a card instead of the player', await until(() => kiosk.evaluate(() => Screens.cast.yt.err === 150 && document.querySelector('.yt-player').style.visibility === 'hidden')));
    await sleep(400);
    await kiosk.screenshot({ path: path.join(SHOTS, 'kiosk-error-150.png') });
    await phone.click('#castStop');
    await until(() => kiosk.evaluate(() => !document.querySelector('.yt-player')));

    // ---- the YouTube app, through the fake sidecar ----
    ctl({ type: 'sender', event: 'connect', name: 'Pixel 9 de Léa', count: 1 });
    ctl({ type: 'play', id: 'aqz-KE-bpKQ', pos: 20 });
    const p3 = await until(() => kiosk.evaluate(() => __yt.players.length === 3 && __yt.players[2].src));
    check('the YouTube app\'s video: in Pixel\'s player, where the app was', p3 && /embed\/aqz-KE-bpKQ\?/.test(p3) && /&start=20&/.test(p3), p3);
    check('the phone says it came from the YouTube app, and who is connected', await until(() => phone.evaluate(() => /appli YouTube/.test(document.querySelector('.ytr-from').textContent) && /Léa/.test(document.querySelector('.ytc-who').textContent))));
    ctl({ type: 'seek', pos: 100 });
    check('the app seeks: Pixel\'s player does it', await until(() => kiosk.evaluate(() => __yt.players[2].calls.includes('seek 100'))));
    check('... and what it does goes back to the app', await until(() => got().some(m => m.type === 'state' && m.id === 'aqz-KE-bpKQ' && Math.round(m.pos) === 100)), JSON.stringify(got().slice(-3)));
    const cid = await kiosk.evaluate(() => Screens.cast.id);
    ctl({ type: 'stop' }); ctl({ type: 'play', id: 'dQw4w9WgXcQ', pos: 0 });   // another video picked in the app: yt-cast-receiver says stop, then play
    const loaded = await until(() => kiosk.evaluate(() => __yt.players.length === 3 && __yt.players[2].calls.includes('load dQw4w9WgXcQ 0')));
    await sleep(900);                                  // the stop held back (pixel/ytcast.py STOP_WAIT) does not come after it
    const same = await kiosk.evaluate(id => ({ n: __yt.players.length, cast: Screens.cast.id === id, frame: !!document.querySelector('.yt-player iframe') }), cid);
    check('the app\'s next video (stop, then play, as the app sends it): loaded in the same player, the same cast', loaded && same.n === 3 && same.cast && same.frame, JSON.stringify(same));
    await kiosk.screenshot({ path: path.join(SHOTS, 'kiosk-from-app.png') });
    await kiosk.mouse.click(700, 400);                 // the column beside the player: stop
    check('a touch on Pixel\'s column stops it, and the app hears it', await until(() => got().some(m => m.type === 'stopped')));

    // ---- the TV code ----
    await phone.click('text=Afficher le code TV sur Pixel');
    check('the TV code on Pixel\'s screen', await until(() => kiosk.evaluate(() => Screens.cast.kind === 'ytcode')));
    await sleep(500);
    await kiosk.screenshot({ path: path.join(SHOTS, 'kiosk-tv-code.png') });
    await phone.screenshot({ path: path.join(SHOTS, 'phone-tv-code.png') });
    ctl({ type: 'sender', event: 'connect', name: 'iPhone de Sam', count: 2 });
    check('a phone pairs: the code goes from Pixel\'s screen', await until(() => kiosk.evaluate(() => Screens.cast.id === null)));
    check('no page error on Pixel\'s screen or the phone', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('no crash', false, e.stack);
  } finally {
    await browser.close();
    srv.kill('SIGTERM'); await srvGone;
    if (fails) console.log(fs.readFileSync(path.join(tmp, 'server.log'), 'utf8').slice(-3000));
    await sleep(300); fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`\n${fails} failure(s)  (screenshots: ${SHOTS})`);
  process.exit(fails ? 1 : 0);
})();
