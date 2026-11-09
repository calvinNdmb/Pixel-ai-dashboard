// YouTube in Pixel Lab (web/lab/demo-yt.js, the lab's stand-in for pixel/youtube.py and pixel/ytcast.py), in a real browser:
//   node tests/test_youtube_lab.js        (it serves web/ itself on port 8163, or YOUTUBE_LAB_PORT; screenshots in PIXEL_SHOTS, never in the repo)
// YouTube's IFrame API and player are a stub, everything else outside is refused. The lab's buttons and its hub drive
// Pixel's screen as the phone and the YouTube app would: the player, its orders, its end, an error card, the pretend app's
// video and seek, the TV code; and nothing but YouTube's player is asked from outside.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path'), os = require('os'), fs = require('fs'), net = require('net');
const WEB = path.join(__dirname, '..', 'web'), PORT = Number(process.env.YOUTUBE_LAB_PORT) || 8163, BASE = `http://127.0.0.1:${PORT}/lab/`;
const SHOTS = process.env.PIXEL_SHOTS || path.join(os.tmpdir(), 'pixel-youtube-shots');
let fails = 0;
const check = (name, ok, info = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (!ok && info ? `  [${info}]` : '')); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) { const end = Date.now() + ms; let v; while (Date.now() < end) { try { v = await fn(); if (v) return v; } catch (e) { /* not yet */ } await sleep(80); } return v; }
const STUB = fs.readFileSync(path.join(__dirname, 'test_youtube_e2e.js'), 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];   // the same stub as the end-to-end test
const FRAME = '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#202020;color:#fff;font:28px sans-serif;display:grid;place-items:center;height:100vh">Lecteur YouTube (simulé)</body>';

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', WEB], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { if (await new Promise(r => { const s = net.connect(PORT, '127.0.0.1', () => { s.end(); r(true); }); s.on('error', () => r(false)); })) break; await sleep(100); }
  const browser = await chromium.launch();
  try {
    const outside = [], errs = [];
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.route(u => !u.href.startsWith(`http://127.0.0.1:${PORT}/`), route => {
      const u = route.request().url(); outside.push(u);
      if (u === 'https://www.youtube.com/iframe_api') return route.fulfill({ contentType: 'text/javascript', body: STUB });
      if (/^https:\/\/www\.youtube(-nocookie)?\.com\/embed\//.test(u)) return route.fulfill({ contentType: 'text/html', body: FRAME });
      return route.abort();
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await page.goto(BASE);
    await until(() => page.evaluate(() => Screens.local.boot < 0 && window.PixelHub));
    // ---- a YouTube link, from the lab's button ----
    await page.click('button[data-cast="youtube"]');
    const p = await until(() => page.evaluate(() => window.__yt && __yt.players[0] && __yt.players[0].src));
    check('« Un lien YouTube »: Pixel\'s screen makes YouTube\'s player (youtube-nocookie, from 30 s)', p && p.startsWith('https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?') && /&start=30&/.test(p), p);
    check('the lab\'s hub hears what the player does (its title)', await until(() => page.evaluate(() => PixelHub.S.cast && PixelHub.S.cast.title === 'Big Buck Bunny 60fps' && PixelHub.S.cast.ytp.st.state === 1)));
    await page.evaluate(() => PixelHub.dispatch('yt.pause'));
    check('yt.pause (the phone\'s): the player pauses, the hub sees it', await until(() => page.evaluate(() => __yt.players[0].calls.includes('pause') && PixelHub.S.cast.ytp.st.state === 2)));
    await page.evaluate(() => PixelHub.dispatch('yt.seek', { by: 10 }));
    check('yt.seek by 10', await until(() => page.evaluate(() => __yt.players[0].calls.some(c => /^seek 4\d$/.test(c)))));
    await sleep(300);
    await page.locator('#screen').screenshot({ path: path.join(SHOTS, 'lab-player.png') });
    await page.evaluate(() => __yt.players[0].go(0));
    check('its end ends the cast', await until(() => page.evaluate(() => PixelHub.S.cast === null && !document.querySelector('.yt-player'))));
    // ---- the pretend YouTube app ----
    await page.click('button[data-act="lab.ytapp"]');
    const q = await until(() => page.evaluate(() => __yt.players.length === 2 && __yt.players[1].src));
    check('« Depuis l\'appli YouTube »: its video in Pixel\'s player, where the app was, a phone connected', q && /&start=60&/.test(q)
      && await page.evaluate(() => PixelHub.S.cast.ytp.src === 'appli' && PixelHub.S.ytcast.senders.includes('Téléphone de démo')), q);
    await page.evaluate(() => PixelHub.dispatch('lab.ytapp', { op: 'seek', pos: 120 }));
    check('the app seeks: the player does it', await until(() => page.evaluate(() => __yt.players[1].calls.includes('seek 120'))));
    await page.evaluate(() => PixelHub.dispatch('lab.ytapp', { op: 'play', id: 'dQw4w9WgXcQ', pos: 0 }));
    check("the app's next video: in the same player", await until(() => page.evaluate(() => __yt.players.length === 2 && __yt.players[1].calls.includes('load dQw4w9WgXcQ 0'))));
    await page.evaluate(() => __yt.players[1].o.events.onError({ data: 150 }));
    check('an error (150): a card instead of the player', await until(() => page.evaluate(() => Screens.cast.yt && Screens.cast.yt.err === 150 && PixelHub.S.cast.ytp.st.err === 150
      && document.querySelector('.yt-player').style.visibility === 'hidden')));
    await sleep(300);
    await page.locator('#screen').screenshot({ path: path.join(SHOTS, 'lab-error.png') });
    // ---- the TV code ----
    await page.click('button[data-act="ytcast.code"]');
    check('« Code TV »: the code on Pixel\'s screen, not in the last casts', await until(() => page.evaluate(() => PixelHub.S.cast.kind === 'ytcode' && PixelHub.S.cast_recent.every(e => e.kind !== 'ytcode'))));
    await sleep(300);
    await page.locator('#screen').screenshot({ path: path.join(SHOTS, 'lab-tv-code.png') });
    await page.fill('#cmd', 'code tv'); await page.press('#cmd', 'Enter');
    await page.evaluate(() => PixelHub.dispatch('lab.ytapp', { op: 'connect', name: 'iPhone de Sam' }));
    check('a phone pairs: the code goes', await until(() => page.evaluate(() => PixelHub.S.cast === null)));
    check('nothing asked from outside but YouTube\'s player', outside.every(u => /^https:\/\/(www\.youtube(-nocookie)?\.com\/(iframe_api|embed\/)|fonts\.(googleapis|gstatic)\.com\/)/.test(u)), outside.join(' '));
    check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('no crash', false, e.stack);
  } finally {
    await browser.close(); srv.kill();
  }
  console.log(`\n${fails} failure(s)  (screenshots: ${SHOTS})`);
  process.exit(fails ? 1 : 0);
})();
