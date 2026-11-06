// Screenshots of every theme on Pixel's own screen (800x480, /?kiosk=1): the 10 screens and the boot splash (with the
// animation pack, the default face), every mood of the living face, and a dozen of the pack's 52 animations,
// driven through the WebSocket like the Stream Deck. Fails if the page logs an error.
//   node tests/shots.js [port=8102] [outdir=shots]       (then: python3 tests/sheets.py outdir . to rebuild the previews)
// Needs Playwright with Chromium, and a demo server: python3 server.py --demo --port 8102
const { chromium } = require('playwright');
const fs = require('fs');
const PORT = process.argv[2] || 8102, OUT = process.argv[3] || 'shots';
const SCREENS = ['visage', 'lumieres', 'claude', 'codex', 'meteo', 'minuteur', 'agenda', 'systeme', 'reglages', 'veille'];
const ANIMS = ['idle-respire', 'content', 'rire', 'amoureux', 'etoiles', 'triste', 'colere', 'danse', 'chante', 'code', 'succes', 'sommeil'];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const errs = [];
  const k = await b.newPage({ viewport: { width: 800, height: 480 }, deviceScaleFactor: 1 });
  k.on('pageerror', e => errs.push(e.message));
  k.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await k.goto(`http://127.0.0.1:${PORT}/?kiosk=1`);
  await k.waitForTimeout(4200);
  const ws = (action, args) => k.evaluate(([a, g]) => new Promise(res => {
    const s = new WebSocket(`ws://${location.host}/ws`); s.onopen = () => { s.send(JSON.stringify({ action: a, args: g })); setTimeout(() => { s.close(); res(); }, 120); };
  }), [action, args]);
  const { themes, moods } = await k.evaluate(() => ({
    themes: Object.keys(PixelThemes({ X: document.createElement('canvas').getContext('2d'), RM: false, now: 0, blinkP: () => -1, txt() {}, wrap: () => [], fit: s => s })),
    moods: PixelMoods.map(m => m.id),
  }));
  await ws('timer.start', { minutes: 25 });
  await ws('view.set', { key: 'meteo_day', value: 0 });
  await ws('cmd', { text: 'raconte-moi une blague' });
  for (const th of themes) {
    await ws('theme.set', { name: th });
    await k.waitForTimeout(3600);                       // let the theme toast go away
    for (const scr of SCREENS) { await ws('screen.show', { screen: scr }); await k.waitForTimeout(700); await k.screenshot({ path: `${OUT}/${th}-${scr}.png` }); }
    await ws('screen.show', { screen: 'visage' });
    for (const a of ANIMS) { await ws('anim.play', { id: a, loops: 0 }); await k.waitForTimeout(1400); await k.screenshot({ path: `${OUT}/${th}-anim-${a}.png` }); }
    await ws('anim.stop', {}); await ws('face.set', { name: 'vivant' }); await k.waitForTimeout(3100);
    for (const m of moods) { await ws('mood.set', { name: m, ms: 0 }); await k.waitForTimeout(900); await k.screenshot({ path: `${OUT}/${th}-mood-${m}.png` }); }
    await ws('mood.set', { name: 'neutre', ms: 0 }); await ws('face.set', { name: 'pack' });
    await ws('sys.boot', {});
    await k.waitForTimeout(1500); await k.screenshot({ path: `${OUT}/${th}-boot-1500.png` });
    await k.waitForTimeout(1300); await k.screenshot({ path: `${OUT}/${th}-boot-2800.png` });
    await k.waitForTimeout(1200);
    console.log(th, 'ok');
  }
  await ws('theme.set', { name: 'retro' }); await ws('face.set', { name: 'pack' });
  console.log('themes:', themes.length, 'moods:', moods.length, 'errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
