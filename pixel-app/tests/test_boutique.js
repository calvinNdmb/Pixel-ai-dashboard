// Pixel's shop in a real browser:  node tests/test_boutique.js [--shots DIR]
// Starts a demo server (port 8177, BOUTIQUE_PORT=… for another, a temporary data folder, every theme on), then, in Chromium:
// - Pixel Lab (the same code on its fake server): the 24 accessories, each one's picture drawn in every theme's colours; a
//   list of typed commands gives the same purse and the same clothes on the lab's mirror and on the real server;
// - the Pi's screen (800x480): the small hat on the left edge, outside his face and above the info line, the twin of Nourrir's
//   plate; a touch slides the tray up; an accessory touched: he tries it on (this screen only, nothing bought); touched
//   again: bought, worn, his reaction plays; too dear: a word, nothing bought; his own: a touch takes it off or puts it on;
//   the gift of the day; the tray and Nourrir's never both open;
// - the coins he wins show on his screen (« +1 »); what he wears is drawn on his face in every theme, with the pack's face and
//   the living one, and follows his head;
// - the phone (390x844): the « Boutique » button by « Nourrir », its panel: his purse, the gift, the accessories by place with
//   their pictures, trying on, buying, wearing, taking off, how to win coins, the last ones won; no horizontal scroll, touch
//   targets ≥ 44 px (6 themes).
// Playwright must be installed (require('playwright')); nothing else.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const APP = path.join(__dirname, '..'), PORT = Number(process.env.BOUTIQUE_PORT) || 8177, BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = (i => (i >= 0 ? process.argv[i + 1] : null))(process.argv.indexOf('--shots'));
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (name, ok, info = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (!ok && info ? `  [${info}]` : '')); if (!ok) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const portOpen = () => new Promise(r => { const s = net.connect(PORT, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
const until = async (fn, ms = 6000, step = 100) => { const end = Date.now() + ms; let v; while (Date.now() < end) { if ((v = await fn())) return v; await wait(step); } return v; };
const THEMES = ['retro', 'moderne', 'manga', 'neon', 'croquis', 'lcd'];

/* ---------- the demo server, and our own WebSocket to it ---------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-boutique-')), cfg = path.join(tmp, 'config.toml');
fs.writeFileSync(cfg, `data_dir = "${tmp}"\n[ui]\nthemes = ${JSON.stringify(THEMES)}\n`);
let srv = null, hub = null, S = null;
const act = (action, args = {}) => hub.send(JSON.stringify({ action, args }));
const shop = () => (S && S.boutique) || {};
const errors = page => {
  const e = [];
  page.on('pageerror', x => e.push('pageerror: ' + x.message));
  page.on('console', m => { if (m.type() === 'error' && !/\/pixel\.apk$/.test(m.location().url || '')) e.push('console.error: ' + m.text()); });
  return e;
};
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
const cur = page => page.evaluate(() => Screens.persona.state.cur);
const wear = page => page.evaluate(() => Screens.persona.state.wear.join());
const free = page => page.evaluate(() => { Screens.persona.stop(); Screens.persona.setLife(false); Screens.local.local = null; Screens.local.pack = null; Screens.local.lastInput = performance.now(); });
const HAT = { x: 32, y: 384 };        // the middle of the little hat (boutique.js HANDLE)
const CELL = id => `(() => { const i = PixelWardrobe.ITEMS.findIndex(x => x.id === '${id}'); return { x: 19 + (i % 12) * 64 + 29, y: 284 + 62 + Math.floor(i / 12) * 64 + 29 }; })()`;   // an accessory of the open tray (boutique.js TR)
const WORDS = ['boutique', 'achète le bonnet', 'cadeau', 'cadeau', 'achète la couronne', 'mets les lunettes', 'achète le pansement', 'enlève le bonnet', 'mets ton bonnet', 'mes pièces', 'enlève tout', 'mets le pansement'];

(async () => {
  if (await portOpen()) throw new Error(`le port ${PORT} est déjà pris (BOUTIQUE_PORT=… pour un autre)`);
  srv = spawn('python3', [path.join(APP, 'server.py'), '--demo', '--port', String(PORT), '--config', cfg], { cwd: APP, stdio: 'ignore' });
  if (!(await until(portOpen, 15000))) throw new Error('le serveur de démo ne démarre pas');
  hub = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  hub.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'state') S = m.data; };
  await until(() => hub.readyState === 1 && S, 5000);
  check('the server\'s snapshot has his shop', !!S.boutique && S.boutique.pieces === 20 && S.boutique.cadeau === true, JSON.stringify(S.boutique));
  const browser = await chromium.launch();

  /* ================= Pixel Lab: the catalogue, the pictures, the mirror ================= */
  const lc = await browser.newContext({ viewport: { width: 1280, height: 900 } }), l = await lc.newPage(), lErr = errors(l);
  await l.goto(BASE + '/app/lab/index.html'); await until(() => l.evaluate(() => !!window.PixelHub && !!window.PixelBoutique && !!window.PixelWardrobe), 9000);
  await l.evaluate(() => localStorage.removeItem('pixel_lab_boutique')); await l.reload(); await until(() => l.evaluate(() => !!window.PixelHub && !!window.PixelBoutique), 9000);
  const cat = await l.evaluate(() => PixelWardrobe.ITEMS.map(i => ({ id: i.id, slot: i.slot, prix: i.prix })));
  check('the catalogue: 24 accessories in 4 places', cat.length === 24 && new Set(cat.map(i => i.slot)).size === 4 && new Set(cat.map(i => i.id)).size === 24, String(cat.length));
  const blank = await l.evaluate(() => {
    const out = [];
    for (const t of PixelHub.ALLT) for (const it of PixelWardrobe.ITEMS) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 48;
      if (!PixelWardrobe.icon(cv, it.id, t.c)) { out.push(t.id + ':' + it.id + ' (not drawn)'); continue; }
      const d = cv.getContext('2d').getImageData(0, 0, 48, 48).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
      if (n < 20) out.push(t.id + ':' + it.id + ' (' + n + ' px)');
    }
    return out;
  });
  check('every accessory has a picture in every theme\'s colours', blank.length === 0, blank.slice(0, 5).join(', '));
  const mirror = await l.evaluate(async words => { const out = []; for (const w of words) { PixelHub.dispatch('cmd', { text: w }); await new Promise(r => setTimeout(r, 30)); const b = PixelHub.S.boutique; out.push([b.pieces, b.possede.join(), JSON.stringify(b.porte), b.cadeau].join('|')); } return out; }, WORDS);
  const real = []; for (const w of WORDS) { act('cmd', { text: w }); await wait(250); const b = shop(); real.push([b.pieces, b.possede.join(), JSON.stringify(b.porte), b.cadeau].join('|')); }
  check('the same typed commands give the same purse and clothes on the lab\'s mirror and on the server', JSON.stringify(mirror) === JSON.stringify(real), `${mirror.find((m, i) => m !== real[i])} / ${real.find((m, i) => m !== mirror[i])}`);
  check('…and they did something: a bonnet and a plaster bought, the plaster on', shop().possede.join() === 'bonnet,pansement' && JSON.stringify(shop().porte) === '{"plus":"pansement"}' && shop().pieces === 0, JSON.stringify(shop()));
  await l.evaluate(() => { PixelHub.dispatch('lab.boutique', { pieces: 500, vide: true }); PixelHub.dispatch('screen.show', { screen: 'visage' }); }); await l.waitForTimeout(200);
  await l.click('.bout-lab-menu button[data-item="couronne"]'); await l.waitForTimeout(250);
  const tried = await l.evaluate(() => ({ t: PixelBoutique.trying, own: PixelHub.S.boutique.possede.join(), w: Screens.persona.state.wear.join() }));
  await l.click('.bout-lab-menu button[data-item="couronne"]'); await l.waitForTimeout(400);
  const bought = await l.evaluate(() => ({ own: PixelHub.S.boutique.possede.join(), p: PixelHub.S.boutique.pieces, cur: Screens.persona.state.cur, n: document.querySelectorAll('.bout-lab-menu button').length }));
  check('the lab\'s Boutique panel: a touch tries the crown on, a second one buys it, his reaction plays', tried.t === 'couronne' && tried.own === '' && tried.w === 'couronne'
    && bought.own === 'couronne' && bought.p === 380 && bought.cur === 'boutique-nouveau' && bought.n === 24, JSON.stringify([tried, bought]));
  for (const id of ['boutique-nouveau', 'boutique-miroir', 'boutique-range', 'boutique-cadeau']) {
    await l.evaluate(id => { Screens.persona.stop(); Screens.persona.play(id); }, id);
    await l.waitForTimeout(700);
    check(`the scene ${id} plays and says something`, (await cur(l)) === id && (await l.evaluate(() => Screens.persona.state.say)).length > 0, await cur(l));
  }
  check('Pixel Lab: no page or console errors', lErr.length === 0, lErr.slice(0, 3).join(' | '));
  await lc.close();

  /* ================= the Pi's screen ================= */
  act('cmd', { text: 'enlève tout' }); await wait(300);
  const kc = await browser.newContext({ viewport: { width: 800, height: 480 }, deviceScaleFactor: 1, hasTouch: true });
  const k = await kc.newPage(), kErr = errors(k);
  await k.goto(BASE + '/?kiosk=1'); await until(() => k.evaluate(() => Screens.local.boot < 0 && !!window.PixelBoutique), 9000);
  await free(k); await k.waitForTimeout(300);
  check('the Pi\'s screen: the little hat is there, the tray closed', await k.evaluate(() => PixelBoutique.shown && !PixelBoutique.trayOpen));
  check('the hat is outside his face box (x ≤ 64), above the info line (y 440), off the corners, ≥ 56 px, the twin of Nourrir\'s plate',
    await k.evaluate(() => { const h = PixelBoutique.HANDLE, n = PixelNourrir.HANDLE; return h.x === 0 && h.x + h.w <= 64 && h.y >= 64 && h.y + h.h <= 416 && h.w >= 56 && h.h >= 56 && h.y === n.y && h.x + h.w <= n.x; }));
  await shot(k, 'kiosk-hat');
  await k.touchscreen.tap(HAT.x, HAT.y); await k.waitForTimeout(450);
  check('a touch on the hat slides the tray up', await k.evaluate(() => PixelBoutique.trayOpen));
  await shot(k, 'kiosk-tray');
  const fete = await k.evaluate(CELL('chapeau-fete')), crown = await k.evaluate(CELL('couronne')), bonnet = await k.evaluate(CELL('bonnet'));
  const p0 = shop().pieces;
  await k.touchscreen.tap(crown.x, crown.y); await k.waitForTimeout(350);
  check('too dear (the crown): he tries it on, nothing is bought, however often it is touched', (await k.evaluate(() => PixelBoutique.trying)) === 'couronne' && (await wear(k)) === 'couronne' && !shop().possede.includes('couronne'));
  await k.touchscreen.tap(crown.x, crown.y); await wait(400);
  check('…touched again: still not his', !shop().possede.includes('couronne') && shop().pieces === p0 && await k.evaluate(() => PixelBoutique.trayOpen));
  act('cmd', { text: 'enlève tout' }); await wait(200);
  await hubCoins(40);
  const p1 = shop().pieces;
  await k.touchscreen.tap(fete.x, fete.y); await k.waitForTimeout(350);
  check('a first touch on the party hat: he tries it on, on this screen only', (await k.evaluate(() => PixelBoutique.trying)) === 'chapeau-fete' && (await wear(k)).includes('chapeau-fete') && !shop().possede.includes('chapeau-fete') && shop().pieces === p1);
  await shot(k, 'kiosk-try');
  await k.touchscreen.tap(fete.x, fete.y);
  await until(() => shop().possede.includes('chapeau-fete'), 3000);
  await k.waitForTimeout(500);
  check('a second touch buys it: paid, his, worn, the tray away, his reaction plays', shop().possede.includes('chapeau-fete') && shop().pieces === p1 - 10 && shop().porte.tete === 'chapeau-fete'
    && (await wear(k)).includes('chapeau-fete') && !(await k.evaluate(() => PixelBoutique.trayOpen)) && (await cur(k)) === 'boutique-nouveau', `${JSON.stringify(shop())} ${await cur(k)}`);
  await shot(k, 'kiosk-new');
  await free(k); await k.touchscreen.tap(HAT.x, HAT.y); await k.waitForTimeout(450);
  await k.touchscreen.tap(fete.x, fete.y); await until(() => !shop().porte.tete, 3000); await k.waitForTimeout(300);
  check('his own accessory: a touch takes it off', !shop().porte.tete && !(await wear(k)).includes('chapeau-fete') && shop().possede.includes('chapeau-fete'));
  await free(k); await k.touchscreen.tap(HAT.x, HAT.y); await k.waitForTimeout(450);
  await k.touchscreen.tap(fete.x, fete.y); await until(() => shop().porte.tete === 'chapeau-fete', 3000);
  check('…and another one puts it back on, for free', shop().porte.tete === 'chapeau-fete' && shop().pieces === p1 - 10);
  await free(k); await k.touchscreen.tap(HAT.x, HAT.y); await k.waitForTimeout(450);
  await k.touchscreen.tap(bonnet.x, bonnet.y); await until(() => shop().porte.tete === 'bonnet', 3000);
  check('a hat he owns takes the other one\'s place (one per place)', shop().porte.tete === 'bonnet' && (await until(async () => (await wear(k)) === (shop().porte.plus ? 'pansement,bonnet' : 'bonnet'), 2000)), await wear(k));
  // the two trays
  await free(k); await k.waitForTimeout(300); await k.touchscreen.tap(HAT.x, HAT.y); await k.waitForTimeout(450);
  await k.touchscreen.tap(400, 120); await k.waitForTimeout(450);
  check('a touch above the tray puts it away', !(await k.evaluate(() => PixelBoutique.trayOpen)));
  await k.evaluate(() => PixelNourrir.open()); await k.waitForTimeout(400);
  check('Nourrir\'s tray open: the hat waits', await k.evaluate(() => PixelNourrir.trayOpen && !PixelBoutique.shown));
  await k.evaluate(() => PixelNourrir.close()); await k.waitForTimeout(400);
  await k.touchscreen.tap(HAT.x, HAT.y); await k.waitForTimeout(450);
  check('…and comes back after', await k.evaluate(() => PixelBoutique.trayOpen && !PixelNourrir.trayOpen));
  await k.touchscreen.tap(716, 284 + 30); await k.waitForTimeout(450);
  check('« Fermer » closes it; his face still answers a tap', !(await k.evaluate(() => PixelBoutique.trayOpen)));
  await free(k); await k.evaluate(() => Screens.persona.setLife(true)); await k.touchscreen.tap(400, 240); await k.waitForTimeout(300);
  check('a tap on his face: he reacts as before', (await cur(k)) !== '', await cur(k));
  // the coins he wins show on his screen
  await free(k);
  await k.evaluate(() => { const C = CanvasRenderingContext2D.prototype, f0 = C.fillText; window.__plus = ''; C.fillText = function (s, ...a) { if (/^\+\d+$/.test(String(s))) window.__plus = String(s); return f0.call(this, s, ...a); }; });
  const g0 = (shop().gain || {}).id || 0;
  act('nourrir.donner', { plat: 'pomme' }); await until(() => S.nourrir.dernier && S.nourrir.dernier.plat === 'pomme', 3000); await k.waitForTimeout(900);
  const won = (shop().gain || {}).id !== g0 ? shop().gain.n : 0, plus = await k.evaluate(() => window.__plus);
  check('a meal he eats: the coin won shows on his screen (« +1 »); a meal he refuses: nothing', won ? plus === '+' + won && shop().gain.raison === 'repas' : plus === '', `${won} ${plus} ${JSON.stringify(S.nourrir.dernier)}`);
  await k.waitForTimeout(7000); await free(k);                                    // his meal ends
  check('the gift of the day was opened by « cadeau »: the tray has no gift button left, the panel will say so', shop().cadeau === false);

  /* ---- what he wears, in every theme, with both faces ---- */
  await hubCoins(900);
  for (const id of ['haut-de-forme', 'lunettes', 'noeud-pap', 'moustache']) { act('boutique.acheter', { objet: id }); await wait(120); }
  await until(() => Object.keys(shop().porte).length === 4, 3000);
  await k.evaluate(() => { window.__worn = []; const d0 = PixelWardrobe.draw; PixelWardrobe.draw = (D, ids) => { window.__worn.push({ ids: ids.join(), pix: !!D.pix, p: D.P(48, 12) }); return d0(D, ids); }; });
  for (const face of ['pack', 'vivant']) for (const th of THEMES) {
    act('face.set', { name: face }); act('theme.set', { name: th }); await wait(350);
    await free(k); await k.evaluate(() => { window.__worn.length = 0; }); await k.waitForTimeout(500);
    const w = await k.evaluate(() => ({ n: window.__worn.length, ids: (window.__worn[0] || {}).ids, pix: (window.__worn[0] || {}).pix, p: (window.__worn[0] || {}).p, theme: Screens.local.theme }));
    check(`${th}, face ${face}: his hat, glasses, bow tie and moustache are drawn on his face, each frame, above his eyes`,
      w.theme === th && w.n >= 3 && w.ids.split(',').sort().join() === 'haut-de-forme,lunettes,moustache,noeud-pap' && w.pix === ['retro', 'lcd'].includes(th) && w.p && Math.abs(w.p.x - 400) < 60 && w.p.y > 60 && w.p.y < 190, JSON.stringify(w));
    if (th === 'retro' || th === 'manga') await shot(k, `kiosk-${face}-${th}`);
  }
  act('face.set', { name: 'pack' }); act('theme.set', { name: 'retro' }); await wait(300);
  // he dances: what he wears follows his head
  act('anim.play', { id: 'danse', loops: 3 }); await wait(400);
  const xs = await k.evaluate(async () => { const xs = []; for (let i = 0; i < 24; i++) { window.__worn.length = 0; await new Promise(r => setTimeout(r, 90)); if (window.__worn[0]) xs.push(Math.round(window.__worn[0].p.x)); } return xs; });
  check('while he dances, his hat follows his head from side to side', Math.max(...xs) - Math.min(...xs) >= 20, xs.join(' '));
  act('anim.stop'); act('cmd', { text: 'enlève tout' }); await wait(300);
  check('« enlève tout »: nothing left on his face', (await wear(k)) === '' && Object.keys(shop().porte).length === 0);
  check('the Pi\'s screen: no page or console errors', kErr.length === 0, kErr.slice(0, 3).join(' | '));
  await kc.close();

  /* ================= the phone ================= */
  const token = fs.readFileSync(path.join(tmp, 'token'), 'utf8').trim();
  const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await pc.newPage(), pErr = errors(p);
  await p.goto(`${BASE}/?t=${token}`); await until(() => p.evaluate(() => Screens.local.boot < 0 && !!window.PixelBoutique), 9000);
  await p.evaluate(() => Screens.persona.setLife(false));
  check('the phone: a « Boutique » button under the keys, right after « Nourrir »', await p.evaluate(() => { const b = document.querySelector('.bout-go'), n = document.querySelector('.nour-go'); return !!b && !b.hidden && b.textContent === 'Boutique' && !!n && n.nextElementSibling === b; }));
  await p.click('.bout-go'); await p.waitForTimeout(400);
  const open = await p.evaluate(() => ({
    shown: !document.getElementById('bout').hidden, items: document.querySelectorAll('.bout-item').length, cats: [...document.querySelectorAll('.bout-cat h3')].map(h => h.textContent).join(),
    purse: document.querySelector('.bout-purse b').textContent, blank: [...document.querySelectorAll('.bout-item canvas')].filter(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) return false; return true; }).length,
    how: document.querySelectorAll('.bout-how li').length, gift: document.querySelector('.bout-gift').disabled,
  }));
  check('its panel: his purse, 24 accessories in 4 places, each with its picture, how to win coins, the gift already opened',
    open.shown && open.items === 24 && open.cats === 'Sur la tête,Lunettes,Autour du cou,Petits plus' && open.purse === `${shop().pieces} pièces` && open.blank === 0 && open.how === 5 && open.gift === true, JSON.stringify(open));
  await shot(p, 'phone-panel');
  const state = id => p.evaluate(id => { const b = document.querySelector(`.bout-item[data-id="${id}"]`); return { cls: b.className.replace('bout-item', '').trim(), tag: b.querySelector('.bout-tag').textContent, msg: document.querySelector('.bout-msg').textContent }; }, id);
  const before = shop().pieces;
  await p.click('.bout-item[data-id="monocle"]'); await p.waitForTimeout(350);
  const s1 = await state('monocle');
  check('a touch on the monocle: he tries it on above the sheet, « Acheter ? », nothing bought yet', s1.cls.includes('armed') && s1.tag === 'Acheter ?' && /Touche encore/.test(s1.msg) && (await wear(p)) === 'monocle' && !shop().possede.includes('monocle'), JSON.stringify(s1));
  await shot(p, 'phone-try');
  await p.click('.bout-item[data-id="monocle"]'); await until(() => shop().possede.includes('monocle'), 3000); await p.waitForTimeout(400);
  const s2 = await state('monocle');
  check('a second touch buys it: « Porté », his purse lighter', s2.cls.includes('worn') && s2.tag === 'Porté' && shop().pieces === before - 45 && (await p.evaluate(() => document.querySelector('.bout-purse b').textContent)) === `${before - 45} pièces`, JSON.stringify(s2));
  await p.click('.bout-item[data-id="monocle"]'); await until(() => !shop().porte.yeux, 3000); await p.waitForTimeout(300);
  check('a touch on what he wears takes it off: « Mettre »', (await state('monocle')).tag === 'Mettre' && (await wear(p)) === '');
  await hubCoins(0); await p.waitForTimeout(300);
  await p.click('.bout-item[data-id="couronne"]'); await p.waitForTimeout(300);
  const s3 = await state('couronne');
  check('not enough coins: he still tries it on, the panel says how many are missing', s3.cls.includes('poor') && s3.tag === '120' && /il te manque 120 pièces/.test(s3.msg) && (await wear(p)) === 'couronne', JSON.stringify(s3));
  await p.click('.bout-item[data-id="couronne"]'); await wait(400);
  check('…and a second touch buys nothing', !shop().possede.includes('couronne') && shop().pieces === 0);
  for (const th of THEMES) {
    act('theme.set', { name: th }); await wait(300);
    const m = await p.evaluate(() => ({
      theme: document.body.dataset.theme || 'retro', scroll: document.documentElement.scrollWidth > innerWidth + 1,
      small: [...document.querySelectorAll('#bout button')].filter(b => b.getClientRects().length && (b.getBoundingClientRect().width < 44 || b.getBoundingClientRect().height < 44)).map(b => b.className + ' ' + Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height)),
      wide: [...document.querySelectorAll('#bout .bout-item')].filter(b => b.scrollWidth > b.clientWidth + 1).length,
    }));
    check(`the panel in ${th}: no horizontal scroll, touch targets ≥ 44 px, no label wider than its card`, m.theme === th && !m.scroll && m.small.length === 0 && m.wide === 0, JSON.stringify(m));
  }
  await shot(p, 'phone-lcd');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  check('Escape closes the panel, and what was being tried on comes off', await p.evaluate(() => document.getElementById('bout').hidden) && (await wear(p)) === '');
  check('the phone app\'s menu can open it, its back button closes it', await p.evaluate(() => window.PixelPanel('boutique') && !document.getElementById('bout').hidden && window.PixelSheet.close() && document.getElementById('bout').hidden));
  check('the phone: no page or console errors', pErr.length === 0, pErr.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${fails} failure(s)`);

  async function hubCoins(n) {          // the test's own purse: boutique.json rewritten, the server restarted (no cheat action on a real Pixel)
    hub.close(); srv.kill('SIGTERM'); await until(async () => !(await portOpen()), 5000);
    const f = path.join(tmp, 'boutique.json'), d = JSON.parse(fs.readFileSync(f, 'utf8')); d.pieces = n; fs.writeFileSync(f, JSON.stringify(d));
    srv = spawn('python3', [path.join(APP, 'server.py'), '--demo', '--port', String(PORT), '--config', cfg], { cwd: APP, stdio: 'ignore' });
    if (!(await until(portOpen, 15000))) throw new Error('le serveur de démo ne redémarre pas');
    S = null; hub = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    hub.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'state') S = m.data; };
    await until(() => hub.readyState === 1 && S && S.boutique && S.boutique.pieces === n, 6000);
    await wait(1500);                   // the pages find the server again
  }
})().catch(e => { console.error(e); fails++; }).finally(() => { if (hub) hub.close(); if (srv) srv.kill('SIGTERM'); fs.rmSync(tmp, { recursive: true, force: true }); setTimeout(() => process.exit(fails ? 1 : 0), 200); });
