// Feeding Pixel in a real browser:  node tests/test_nourrir.js [--shots DIR]
// Starts a demo server (port 8175, NOURRIR_PORT=… for another, a temporary data folder, every theme on), then, in Chromium:
// - the Pi's screen (800x480): the small plate on the right edge, outside his face and above the info line (a long agenda
//   title never runs under it); a touch slides the tray up; a food touched: he eats
//   it (the meal scene, the food drawn); a swipe up from the bottom edge opens it, a swipe down or a touch above it closes it;
//   closed, his face still answers a tap and a long press, and a swipe down still opens the quick menu; switched off: no plate;
// - a meal through the tray in every theme: its scene plays, the food is drawn, no error;
// - the phone (390x844): the « Nourrir » panel: his belly, the 24 foods drawn in the theme's colours, a touch feeds him (the
//   buttons wait while he chews) and he is seen eating above the sheet, his tastes, his last meals, the settings; no
//   horizontal scroll, touch targets ≥ 44 px, the labels never cut mid-word (6 themes);
// - the Pixel de poche (a phone held sideways): the same plate and tray;
// - Pixel Lab (the same code on its fake server, with its virtual clock): every scene of the pack in every theme, the food
//   drawn and no prop error; the hints: a rumble when his belly gets emptier, then none for 20 min, none at night (the page's
//   clock moved to 23:30), none when off, as moments of life too; off at lunch time, not even the old « J’ai faim… »;
//   the lab's Nourrir panel.
// Playwright must be installed (require('playwright')); nothing else.
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const APP = path.join(__dirname, '..'), PORT = Number(process.env.NOURRIR_PORT) || 8175, BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = (i => (i >= 0 ? process.argv[i + 1] : null))(process.argv.indexOf('--shots'));
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (name, ok, info = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (!ok && info ? `  [${info}]` : '')); if (!ok) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const portOpen = () => new Promise(r => { const s = net.connect(PORT, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
const until = async (fn, ms = 6000, step = 100) => { const end = Date.now() + ms; let v; while (Date.now() < end) { if ((v = await fn())) return v; await wait(step); } return v; };
const THEMES = ['retro', 'moderne', 'manga', 'neon', 'croquis', 'lcd'];

/* ---------- the demo server, and our own WebSocket to it ---------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-nourrir-')), cfg = path.join(tmp, 'config.toml');
fs.writeFileSync(cfg, `data_dir = "${tmp}"\n[ui]\nthemes = ${JSON.stringify(THEMES)}\n`);
let srv = null, hub = null, S = null, lastMeal = 0;
const act = (action, args = {}) => hub.send(JSON.stringify({ action, args }));
const meal = () => (S && S.nourrir && S.nourrir.dernier) || {};
async function mealGap() { const left = lastMeal + 6400 - Date.now(); if (left > 0) await wait(left); }   // the server: one meal every 6 s

const errors = page => {
  const e = [];
  page.on('pageerror', x => e.push('pageerror: ' + x.message));
  page.on('console', m => { if (m.type() === 'error' && !/\/pixel\.apk$/.test(m.location().url || '')) e.push('console.error: ' + m.text()); });
  return e;
};
/* the page's clock can be moved (the night) without touching performance.now: Date only */
const SHIFT = () => {
  const D = Date; let off = 0;
  class FD extends D { constructor(...a) { super(...(a.length ? a : [D.now() + off])); } static now() { return D.now() + off; } }
  window.Date = FD;
  window.__at = (h, m) => { const n = new D(D.now() + off), t = new D(n.getFullYear(), n.getMonth(), n.getDate(), h, m); off = t.getTime() - D.now(); };
  window.__real = () => { off = 0; };
};
// the food drawn by a scene (one sprite pixel of 5 px or more: the plate in the corner and the tray draw smaller ones)
const spy = page => page.evaluate(() => { if (window.__draws != null) return; window.__draws = 0; const d0 = PixelFoods.draw; PixelFoods.draw = (...a) => { if (a[4] >= 5) window.__draws++; return d0(...a); }; });
const draws = page => page.evaluate(() => window.__draws);
const cur = page => page.evaluate(() => Screens.persona.state.cur);
const group = (page, id) => page.evaluate(id => (Screens.persona.scenes.find(s => s.id === id) || {}).group || '', id);
const free = page => page.evaluate(() => { Screens.persona.stop(); Screens.local.local = null; Screens.local.pack = null; Screens.local.lastInput = performance.now(); });
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
async function touchSwipe(cdp, x0, y0, x1, y1) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 6, y: y0 + (y1 - y0) * i / 6 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const CELL = i => ({ x: 19 + (i % 12) * 64 + 29, y: 284 + 62 + Math.floor(i / 12) * 64 + 29 });   // a food of the open tray (nourrir.js TR)
const PLATE = { x: 768, y: 384 };     // the middle of the plate (nourrir.js HANDLE)
// labels whose words (or syllables, at a soft hyphen) run over two lines: cut mid-word
const cutWords = page => page.evaluate(() => [...document.querySelectorAll('#nour .nour-label')].flatMap(l => {
  const t = l.firstChild, out = [];
  const line = i => { const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 1); const rs = r.getClientRects(); return Math.round(rs[rs.length - 1].top); };   // (a char right after a break also gets the break's rect up there: its last one is the char)
  for (const m of t.textContent.matchAll(/[^\s\u00ad]+/g)) if (line(m.index) !== line(m.index + m[0].length - 1)) out.push(m[0]);
  return out;
}));

(async () => {
  if (await portOpen()) throw new Error(`le port ${PORT} est déjà pris (NOURRIR_PORT=… pour un autre)`);
  srv = spawn('python3', [path.join(APP, 'server.py'), '--demo', '--port', String(PORT), '--config', cfg], { cwd: APP, stdio: 'ignore' });
  if (!(await until(portOpen, 15000))) throw new Error('le serveur de démo ne démarre pas');
  hub = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  hub.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'state') S = m.data; };
  await until(() => hub.readyState === 1 && S, 5000);
  check('the server\'s snapshot has his belly', !!S.nourrir && S.nourrir.on === true && typeof S.nourrir.ventre === 'number', JSON.stringify(S.nourrir));
  const browser = await chromium.launch();
  const FOODS = await (async () => { const p = await browser.newPage(); await p.goto(BASE + '/app/lab/index.html'); const f = await p.evaluate(() => PixelFoods.FOODS.map(x => x.id)); await p.close(); return f; })();

  /* ================= the Pi's screen ================= */
  const kc = await browser.newContext({ viewport: { width: 800, height: 480 }, deviceScaleFactor: 1, hasTouch: true });
  const k = await kc.newPage(), kErr = errors(k), cdp = await kc.newCDPSession(k);
  await k.goto(BASE + '/?kiosk=1'); await until(() => k.evaluate(() => Screens.local.boot < 0 && !!window.PixelNourrir), 9000);
  await spy(k); await free(k); await k.waitForTimeout(300);
  check('the Pi\'s screen: the plate is there, the tray closed', await k.evaluate(() => PixelNourrir.shown && !PixelNourrir.trayOpen));
  check('the plate is outside his face box (x ≥ 736), above the info line (y 440), off the lab\'s corners, ≥ 56 px',
    await k.evaluate(() => { const h = PixelNourrir.HANDLE; return h.x >= 736 && h.x + h.w <= 800 && h.y >= 64 && h.y + h.h <= 416 && h.w >= 56 && h.h >= 56; }));
  await shot(k, 'kiosk-plate');
  // a long agenda title: the info line (centred at x 400, up to 760 px wide) never runs under the plate
  const ticker = await k.evaluate(async S0 => {
    const d = new Date(), h = d.getHours() + d.getMinutes() / 60; if (h > 23.9) return { skip: true };
    const ev = { day: 0, allday: false, start: Math.min(23.95, h + 0.1), title: 'Rendez-vous chez le dentiste pour le contrôle annuel des dents de sagesse' };
    const s0 = Screens.setState; Screens.setState = p => s0({ ...p, agenda: { ...(p.agenda || {}), events: [ev] } }); window.__untick = () => { Screens.setState = s0; };
    const C = CanvasRenderingContext2D.prototype, f0 = C.fillText, seen = [];
    C.fillText = function (str, x, y, ...a) {
      if (this.canvas.id === 'crt' && y === 440 && /dentiste/i.test(str)) { const w = this.measureText(str).width, c = this.textAlign === 'center'; seen.push({ x0: Math.round(c ? x - w / 2 : x), x1: Math.round(c ? x + w / 2 : x + w), y0: y, y1: y + 24 }); }
      return f0.call(this, str, x, y, ...a);
    };
    Screens.setState(S0); Screens.local.dirty = true; await new Promise(r => setTimeout(r, 500)); C.fillText = f0;
    const P = PixelNourrir.HANDLE, l = seen[seen.length - 1];
    return { line: l, plate: P, apart: !!l && (l.x1 <= P.x || l.x0 >= P.x + P.w || l.y1 <= P.y || l.y0 >= P.y + P.h) };
  }, S);
  check('a long agenda title in the info line: all of it shows, none under the plate', ticker.skip || (ticker.apart && ticker.line.x1 > 700), JSON.stringify(ticker));
  await shot(k, 'kiosk-longticker-retro');
  act('theme.set', { name: 'moderne' }); await k.waitForTimeout(600); await shot(k, 'kiosk-longticker-moderne');
  act('theme.set', { name: 'retro' }); await k.waitForTimeout(600);
  await k.evaluate(() => window.__untick && window.__untick());
  await k.touchscreen.tap(PLATE.x, PLATE.y); await k.waitForTimeout(400);
  check('a touch on the plate: the tray slides up', await k.evaluate(() => PixelNourrir.trayOpen));
  await shot(k, 'kiosk-tray');
  const fav = S.nourrir.gouts.prefere, iFav = FOODS.indexOf(fav);
  const d0 = await draws(k);
  await k.touchscreen.tap(CELL(iFav).x, CELL(iFav).y); lastMeal = Date.now();
  await until(() => meal().plat === fav, 3000);
  check(`a touch on his favourite (${fav}): the server feeds him`, meal().plat === fav, JSON.stringify(meal()));
  await until(async () => (await cur(k) || '').startsWith('nourrir-'), 3000);
  const sc = await cur(k);
  check(`…the tray goes away and his meal plays on the Pi (${sc}, ${meal().reaction})`, sc === 'nourrir-' + (meal().reaction === 'miam' ? 'miam' : meal().reaction) && !(await k.evaluate(() => PixelNourrir.trayOpen)), sc);
  await k.waitForTimeout(1200);
  check('…the food is drawn, crumbs and all', (await draws(k)) > d0 + 10, `${d0} -> ${await draws(k)}`);
  await shot(k, 'kiosk-meal');
  await k.waitForTimeout(6000); await free(k);
  // the swipes
  await touchSwipe(cdp, 400, 472, 400, 300); await k.waitForTimeout(350);
  check('a swipe up from the bottom edge opens the tray', await k.evaluate(() => PixelNourrir.trayOpen && !Screens.menuOpen));
  await touchSwipe(cdp, 400, 320, 400, 470); await k.waitForTimeout(350);
  check('a swipe down puts it away (and does not open the quick menu)', await k.evaluate(() => !PixelNourrir.trayOpen && !Screens.menuOpen));
  await k.touchscreen.tap(PLATE.x, PLATE.y); await k.waitForTimeout(300); await free(k);
  await k.touchscreen.tap(400, 140); await k.waitForTimeout(300);
  check('a touch above the tray puts it away, and is not a touch on his face', await k.evaluate(() => !PixelNourrir.trayOpen) && !(await cur(k)), await cur(k));
  await k.touchscreen.tap(PLATE.x, PLATE.y); await k.waitForTimeout(300);
  await k.touchscreen.tap(716, 284 + 32); await k.waitForTimeout(300);
  check('« Fermer » puts it away', await k.evaluate(() => !PixelNourrir.trayOpen));
  await k.touchscreen.tap(PLATE.x, PLATE.y); await k.waitForTimeout(300);
  const open1 = await k.evaluate(() => PixelNourrir.trayOpen);
  await k.waitForTimeout(20600);
  check('left alone 20 s, it goes away', open1 && !(await k.evaluate(() => PixelNourrir.trayOpen)));
  // his face, as before
  await free(k); await k.waitForTimeout(200);
  await k.touchscreen.tap(400, 250); await k.waitForTimeout(150);
  const tapped = await cur(k);
  check('tray closed: a tap on his face still gets a reaction', ['tap', 'fache'].includes(await group(k, tapped)), tapped);
  await free(k); await k.waitForTimeout(2500);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 400, y: 240 }] }); await k.waitForTimeout(900);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await k.waitForTimeout(100);
  check('…a long press still cuddles him', (await group(k, await cur(k))) === 'calin', await cur(k));
  await free(k); await k.waitForTimeout(400);
  await touchSwipe(cdp, 400, 60, 400, 300); await k.waitForTimeout(350);
  check('…a swipe down still opens the quick menu', await k.evaluate(() => Screens.menuOpen && !PixelNourrir.trayOpen));
  await touchSwipe(cdp, 400, 300, 400, 60); await k.waitForTimeout(300);
  // off
  act('nourrir.reglages', { on: false }); await until(() => S.nourrir.on === false, 2000); await k.waitForTimeout(300);
  check('switched off: no plate, a swipe up does nothing', await k.evaluate(() => !PixelNourrir.shown && !PixelNourrir.swipe(-200, 470)));
  act('nourrir.reglages', { on: true }); await until(() => S.nourrir.on === true, 2000); await k.waitForTimeout(300);
  check('on again: the plate is back', await k.evaluate(() => PixelNourrir.shown));
  // a meal in every theme
  let i = 0;
  for (const th of THEMES) {
    act('theme.set', { name: th }); await k.waitForTimeout(500); await free(k); await mealGap();
    const before = await draws(k), id = FOODS[(3 + i++ * 5) % FOODS.length];
    await k.touchscreen.tap(PLATE.x, PLATE.y); await k.waitForTimeout(350);
    await k.touchscreen.tap(CELL(FOODS.indexOf(id)).x, CELL(FOODS.indexOf(id)).y); lastMeal = Date.now();
    await until(() => meal().plat === id && meal().t > lastMeal - 3000, 3000);
    await until(async () => (await cur(k) || '').startsWith('nourrir-'), 3000); await k.waitForTimeout(1100);
    const c = await cur(k);
    await shot(k, `kiosk-meal-${th}`);
    check(`${th}: a meal through the tray (${id}, ${meal().reaction}): ${c}, the food drawn, no error`, (c || '').startsWith('nourrir-') && (await draws(k)) > before && kErr.length === 0, `${c} ${kErr.slice(0, 2)}`);
  }
  act('theme.set', { name: 'retro' });
  check('the Pi\'s screen: no page or console errors', kErr.length === 0, kErr.slice(0, 3).join(' | '));

  /* ================= the phone ================= */
  const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await pc.newPage(), pErr = errors(p);
  await p.goto(BASE + '/'); await until(() => p.evaluate(() => !!document.querySelector('.nour-go') && !document.querySelector('.nour-go').hidden), 6000);
  check('the phone: a « Nourrir » button by « Agendas », no plate on his screen', await p.evaluate(() => !!document.querySelector('.kfoot .nour-go') && !PixelNourrir.shown));
  await p.tap('.nour-go'); await p.waitForTimeout(400);
  const pan = await p.evaluate(() => {
    const r = document.getElementById('nour'), cv = [...r.querySelectorAll('.nour-food canvas')];
    const inked = cv.filter(c => { const d = c.getContext('2d').getImageData(0, 0, 12, 12).data; let n = 0; for (let i = 3; i < d.length; i += 4) n += d[i] > 0; return n > 20; }).length;
    return { open: !r.hidden, foods: r.querySelectorAll('.nour-food').length, inked, word: r.querySelector('.nour-word').textContent, chips: r.querySelectorAll('.nour-gouts .nour-chip').length,
      fav: (r.querySelector('.nour-food.fav') || {}).dataset?.id, sw: document.documentElement.scrollWidth, iw: innerWidth };
  });
  check('the panel opens: 24 foods, each drawn', pan.open && pan.foods === FOODS.length && pan.inked === FOODS.length, JSON.stringify(pan));
  check('…his belly, his tastes (favourite, 5 likes, 3 dislikes), the favourite marked', /%/.test(pan.word) && pan.chips === 9 && pan.fav === S.nourrir.gouts.prefere, JSON.stringify(pan));
  check('…no horizontal scroll', pan.sw <= pan.iw, JSON.stringify(pan));
  const small = await p.evaluate(() => [...document.querySelectorAll('#nour button, #nour input')].filter(e => e.offsetParent !== null).map(e => { const r = e.getBoundingClientRect(); return [e.textContent.trim().slice(0, 14) || e.type, Math.round(r.width), Math.round(r.height)]; })
    .filter(([n, w, h]) => n === 'checkbox' ? w < 24 : (w < 44 || h < 44)));
  check('…touch targets ≥ 44 px', small.length === 0, JSON.stringify(small.slice(0, 6)));
  const cut0 = await cutWords(p);
  check('…the labels break between words or at a syllable (« crous-tillant »), never mid-word', cut0.length === 0, JSON.stringify(cut0));
  await shot(p, 'phone-panel');
  await mealGap();
  const pid = FOODS.find(x => x !== S.nourrir.gouts.prefere && !S.nourrir.gouts.deteste.includes(x) && x !== 'pomme') || 'soupe';
  await p.tap(`.nour-food[data-id="${pid}"]`); lastMeal = Date.now();
  await until(() => meal().plat === pid && meal().t > lastMeal - 3000, 3000);
  await p.waitForTimeout(400);
  const fed = await p.evaluate(() => ({ dis: [...document.querySelectorAll('.nour-food')].every(b => b.disabled), msg: document.querySelector('.nour-msg').textContent, j: document.querySelectorAll('.nour-journal li').length }));
  check(`a touch on ${pid}: he eats it, the panel says how it went and waits while he chews`, meal().plat === pid && fed.dis && fed.msg.includes(':') && fed.j >= 2, JSON.stringify(fed));
  const seen = await p.evaluate(() => {
    const r = document.getElementById('nour'), s = r.querySelector('.nour-sheet').getBoundingClientRect(), c = document.getElementById('crt').getBoundingClientRect();
    return { peek: r.classList.contains('peek'), veil: getComputedStyle(r).backgroundColor, sheetTop: Math.round(s.top), cTop: Math.round(c.top), cBottom: Math.round(c.bottom), cur: Screens.persona.state.cur };
  });
  check('…and he is seen eating: his screen stays above the sheet, with no veil over it', seen.peek && seen.cTop >= 0 && seen.sheetTop >= seen.cBottom && seen.veil === 'rgba(0, 0, 0, 0)' && (seen.cur || '').startsWith('nourrir-'), JSON.stringify(seen));
  await shot(p, 'phone-fed');
  await until(() => p.evaluate(() => !document.querySelector('.nour-food').disabled), 9000);
  check('…then the menu is back', await p.evaluate(() => !document.querySelector('.nour-food').disabled));
  await p.evaluate(() => document.querySelector('.nour-sheet').scrollTo(0, 99999)); await p.waitForTimeout(200);
  await p.tap('.nour-seg button:nth-child(1)'); await until(() => S.nourrir.reglages.vitesse === 'lente', 2000);
  check('« Lente »: his hunger slows down (server)', S.nourrir.reglages.vitesse === 'lente');
  await p.tap('.nour-switch input'); await until(() => S.nourrir.on === false, 2000); await p.waitForTimeout(300);
  const off = await p.evaluate(() => ({ dis: [...document.querySelectorAll('.nour-food')].every(b => b.disabled), note: !document.querySelector('.nour-off').hidden, word: document.querySelector('.nour-word').textContent }));
  check('« Repas activés » unticked: off on the server, the menu waits, the panel says so', S.nourrir.on === false && off.dis && off.note && /pause/.test(off.word), JSON.stringify(off));
  await shot(p, 'phone-off');
  await p.tap('.nour-switch input'); await until(() => S.nourrir.on === true, 2000);
  await p.tap('.nour-seg button:nth-child(2)'); await until(() => S.nourrir.reglages.vitesse === 'normale', 2000);
  const g0 = JSON.stringify(S.nourrir.gouts);
  await p.tap('.nour-gouts .nour-btn'); await p.waitForTimeout(200);
  check('« Changer ses goûts » asks to be sure first', JSON.stringify(S.nourrir.gouts) === g0 && /Sûr/.test(await p.textContent('.nour-gouts .nour-btn')));
  await p.tap('.nour-gouts .nour-btn'); await until(() => JSON.stringify(S.nourrir.gouts) !== g0, 2000);
  check('…a second touch: new tastes', JSON.stringify(S.nourrir.gouts) !== g0);
  const cuts = [];
  for (const th of THEMES) {
    act('theme.set', { name: th }); await p.waitForTimeout(600);
    await p.evaluate(() => document.querySelector('.nour-sheet').scrollTo(0, 0)); await p.waitForTimeout(150);
    for (const w of await cutWords(p)) cuts.push(`${th}: ${w}`);
    await shot(p, `phone-panel-${th}`);
    if (th === 'retro' || th === 'lcd') { await p.evaluate(() => document.querySelector('.nour-menu .nour-cat:last-child').scrollIntoView()); await p.waitForTimeout(150); await shot(p, `phone-panel-robots-${th}`); }
  }
  check('…in the 6 themes, no label cut mid-word', cuts.length === 0, JSON.stringify(cuts));
  act('theme.set', { name: 'retro' });
  await p.tap('.nour-x'); await p.waitForTimeout(200);
  check('× closes the panel', await p.evaluate(() => document.getElementById('nour').hidden));
  check('the phone: no page or console errors', pErr.length === 0, pErr.slice(0, 3).join(' | '));

  /* ================= the Pixel de poche ================= */
  const qc = await browser.newContext({ ...devices['Pixel 7 landscape'] });
  const q = await qc.newPage(), qErr = errors(q);
  await q.goto(BASE + '/'); await until(() => q.evaluate(() => !!window.PixelPoche && PixelPoche.on), 6000); await q.waitForTimeout(800);
  await free(q);
  const qp = async (u, v) => { const r = await q.locator('#crt').boundingBox(); return { x: r.x + u / 800 * r.width, y: r.y + v / 480 * r.height }; };
  check('the Pixel de poche: the plate is there too', await q.evaluate(() => PixelNourrir.shown));
  let at = await qp(PLATE.x, PLATE.y); await q.touchscreen.tap(at.x, at.y); await q.waitForTimeout(400);
  check('…a touch on it opens the tray', await q.evaluate(() => PixelNourrir.trayOpen));
  await shot(q, 'poche-tray');
  await mealGap();
  const qid = 'pile'; at = await qp(CELL(FOODS.indexOf(qid)).x, CELL(FOODS.indexOf(qid)).y); await q.touchscreen.tap(at.x, at.y); lastMeal = Date.now();
  await until(() => meal().plat === qid && meal().t > lastMeal - 3000, 3000);
  await until(async () => (await cur(q) || '').startsWith('nourrir-'), 3000);
  check('…and a food fed from the phone held sideways plays his meal there', meal().plat === qid && (await cur(q) || '').startsWith('nourrir-'), `${meal().plat} ${await cur(q)}`);
  await q.waitForTimeout(1500); await shot(q, 'poche-meal');
  check('the Pixel de poche: no page or console errors', qErr.length === 0, qErr.slice(0, 3).join(' | '));
  await qc.close(); await pc.close(); await kc.close();

  /* ================= Pixel Lab: every scene in every theme, and the hints ================= */
  const lc = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await lc.addInitScript(SHIFT);
  const l = await lc.newPage(), lErr = errors(l);
  await l.goto(BASE + '/app/lab/index.html?themes=all'); await until(() => l.evaluate(() => !!window.PixelLab && !!document.getElementById('hNourrir')), 8000);
  // his pyjama follows his quiet hours in the lab (its paused clock: web/look.js), and its scenes (look-dodo, look-debout) are
  // no hints: for his look he stays awake, whatever the hour this suite runs at and the hours it pretends (__at)
  await l.evaluate(() => { PixelHub.dispatch('lab.settings', { sleep_min: 1e6 }); PixelHub.dispatch('screen.show', { screen: 'visage' }); PixelHub.dispatch('lab.look', { dort: false }); });
  await l.waitForTimeout(400); await l.evaluate(() => Screens.persona.stop());
  await spy(l);
  const sweep = await l.evaluate(async THEMES => {
    const hub = PixelHub, PER = Screens.persona, C = PixelClock, frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const ids = PER.scenes.filter(s => s.id.startsWith('nourrir-')).map(s => s.id), bad = [], noFood = [];
    const FOODY = ['miam', 'aime', 'prefere', 'beurk', 'refuse', 'plein', 'eclate', 'sucre', 'legume', 'robot', 'creux', 'affame', 'heure'];
    PER.setLife(false);
    for (const th of THEMES) {
      hub.dispatch('lab.theme', { name: th }); await frame();
      for (const id of ids) {
        C.play(); PER.stop(); await frame(); C.pause();
        const n0 = window.__draws; PER.play(id); let t = 0;
        for (const e of [300, 900, 1600, 2400, 3300, 4400, 5600, 6800, 8000, 9400]) {
          C.step(e - t); t = e; Screens.local.dirty = true; Screens.local.lastInput = performance.now(); await frame();
          if (PER.state.cur !== id) break;
        }
        if (FOODY.some(r => id === 'nourrir-' + r) && window.__draws === n0) noFood.push(th + ' ' + id);
      }
    }
    C.play(); PER.stop(); PER.setLife(true); hub.dispatch('lab.theme', { name: 'retro' });
    return { ids: ids.length, errors: PixelFoods.errors.slice(0, 3), noFood, bad };
  }, THEMES);
  check(`Pixel Lab: the ${sweep.ids} scenes of the pack play in the 6 themes, the food drawn in each, no prop error`, sweep.ids >= 15 && !sweep.noFood.length && !sweep.errors.length && lErr.length === 0,
    JSON.stringify(sweep) + lErr.slice(0, 2).join(' | '));
  // the hints
  const hint = await l.evaluate(async () => {
    const hub = PixelHub, PER = Screens.persona, PF = PixelFoods, wait = ms => new Promise(r => setTimeout(r, ms)), out = {};
    const belly = async v => { await wait(300); hub.dispatch('lab.nourrir', { ventre: v }); await wait(80); };   // 300 ms at x20: past his 4 s pause between two events
    PixelClock.setSpeed(20); window.__at(10, 30);     // the day, whatever the real time: no hint at night
    PER.stop(); PF.resetHint(); await belly(80); await belly(45);
    out.first = PER.state.cur; PER.stop();
    await belly(80); await belly(40); out.again = PER.state.cur || ''; PER.stop();
    PF.resetHint(); await belly(80); window.__at(23, 30); await belly(40); out.night = PER.state.cur || ''; window.__at(10, 30); PER.stop();
    PF.resetHint(); hub.dispatch('nourrir.reglages', { on: false }); await belly(80); await belly(10); out.off = PER.state.cur || '';
    hub.dispatch('nourrir.reglages', { on: true }); PER.stop();
    PF.resetHint(); await belly(80); PER.play('bisou'); hub.dispatch('lab.nourrir', { ventre: 40 }); await wait(30); out.busy = PER.state.cur; PER.stop();
    PF.resetHint(); await belly(80); await belly(15); out.big = PER.state.cur; PER.stop();
    PixelClock.setSpeed(1); window.__real();
    return out;
  });
  check('his belly gets emptier: « Oh ! J’ai un petit creux. » (the rumble)', hint.first === 'nourrir-gargouille', JSON.stringify(hint));
  check('…not again within 20 min', !hint.again, JSON.stringify(hint));
  check('…never at night', !hint.night, JSON.stringify(hint));
  check('…never when his hunger is off', !hint.off, JSON.stringify(hint));
  check('…never over another scene', hint.busy === 'bisou', JSON.stringify(hint));
  check('…and very hungry (faim 2) it rumbles too', hint.big === 'nourrir-gargouille', JSON.stringify(hint));
  const life = await l.evaluate(async () => {
    const hub = PixelHub, PER = Screens.persona, PF = PixelFoods, L = Screens.local, C = PixelClock, wait = ms => new Promise(r => setTimeout(r, ms));
    const run = async n => {           // n moments of life, sped up
      const seen = []; let last = PER.state.cur || '';
      for (let i = 0; i < 4000 && seen.length < n; i++) {
        L.lastInput = performance.now() - 300000; await wait(10);
        const c = PER.state.cur || ''; if (c && c !== last && (PER.scenes.find(s => s.id === c) || {}).group === 'vie') seen.push(c); last = c;
      }
      return seen;
    };
    PER.stop(); hub.dispatch('lab.nourrir', { ventre: 45 }); await wait(80); PER.stop();
    C.setSpeed(30); PER.setEvery(200, 400); window.__at(10, 30);     // the day, whatever the real time
    PF.hinted(); const muted = await run(14);
    PF.resetHint(); const day = await run(60), first = day.findIndex(x => x.startsWith('nourrir-')), after = first >= 0 ? day.slice(first + 1) : [];
    window.__at(23, 40); PF.resetHint(); PER.stop(); const night = await run(5); window.__real();
    C.setSpeed(1); PER.setEvery(45000, 150000); PER.stop(); hub.dispatch('lab.nourrir', { ventre: 80 });
    return { muted, day, first, after, night };
  });
  check('a little hungry, left alone: one of his moments of life asks for food', life.first >= 0 && ['nourrir-creux', 'nourrir-heure'].includes(life.day[life.first]), JSON.stringify(life.day));
  check('…then no other hint among the next moments (20 min)', life.after.length > 5 && !life.after.some(x => x.startsWith('nourrir-')), JSON.stringify(life.after));
  check('…none either within 20 min of the last one', life.muted.length >= 10 && !life.muted.some(x => x.startsWith('nourrir-')), JSON.stringify(life.muted));
  check('…and at night, only quiet moments, no hint', life.night.length >= 4 && !life.night.some(x => x.startsWith('nourrir-')), JSON.stringify(life.night));
  // switched off at lunch time: no hunger at all, not even the old moment 'faim' (persona.js) that plays without Nourrir
  const lunch = await l.evaluate(async () => {
    const hub = PixelHub, PER = Screens.persona, L = Screens.local, C = PixelClock, wait = ms => new Promise(r => setTimeout(r, ms));
    const run = async n => {
      const seen = []; let last = PER.state.cur || '';
      for (let i = 0; i < 6000 && seen.length < n; i++) {
        L.lastInput = performance.now() - 300000; await wait(10);
        const c = PER.state.cur || ''; if (c && c !== last && (PER.scenes.find(s => s.id === c) || {}).group === 'vie') seen.push(c); last = c;
      }
      return seen;
    };
    window.__at(12, 10); C.setSpeed(30); PER.setEvery(200, 400);
    hub.dispatch('nourrir.reglages', { on: false }); await wait(200); PER.stop();
    const off = await run(60);
    hub.dispatch('nourrir.reglages', { on: true }); hub.dispatch('lab.nourrir', { ventre: 90 }); await wait(200); PER.stop();
    const on = await run(30);
    window.__real(); C.setSpeed(1); PER.setEvery(45000, 150000); PER.stop(); hub.dispatch('lab.nourrir', { ventre: 80 });
    return { hour: 12, off, on };
  });
  check('switched off, at lunch time: no hunger moment at all, not even the old « J’ai faim… »', lunch.off.length >= 40 && !lunch.off.some(x => x === 'faim' || x.startsWith('nourrir-')), JSON.stringify(lunch.off));
  check('…on and full at lunch time: no « J’ai faim… » either (his belly speaks for him)', lunch.on.length >= 20 && !lunch.on.includes('faim'), JSON.stringify(lunch.on));
  // the lab's panel
  await l.evaluate(() => { Screens.persona.stop(); PixelHub.dispatch('lab.nourrir', { ventre: 30 }); }); await l.waitForTimeout(6500);
  await l.click('.nour-lab-menu button[data-food="soupe"]'); await l.waitForTimeout(300);
  const lab = await l.evaluate(() => ({ plat: (PixelHub.S.nourrir.dernier || {}).plat, cur: Screens.persona.state.cur, n: document.querySelectorAll('.nour-lab-menu button').length }));
  check('the lab\'s Nourrir panel: the 24 foods, a touch feeds him through the fake server, his meal plays', lab.n === FOODS.length && lab.plat === 'soupe' && (lab.cur || '').startsWith('nourrir-'), JSON.stringify(lab));
  await l.click('#nourLabOn'); await l.waitForTimeout(200);
  check('…and switches his hunger off', await l.evaluate(() => PixelHub.S.nourrir.on === false));
  await l.click('#nourLabOn');
  if (SHOTS) await l.locator('section.nour-lab').screenshot({ path: path.join(SHOTS, 'lab-panel.png') });
  check('Pixel Lab: no page or console errors', lErr.length === 0, lErr.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${fails} failure(s)`);
})().catch(e => { console.error(e); fails++; }).finally(() => { if (hub) hub.close(); if (srv) srv.kill('SIGTERM'); fs.rmSync(tmp, { recursive: true, force: true }); setTimeout(() => process.exit(fails ? 1 : 0), 300); });
