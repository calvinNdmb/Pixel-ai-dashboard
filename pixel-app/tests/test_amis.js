// Les amis de Pixel in Chromium: two demo servers (ports 8462 and 8463, or AMIS_A_PORT / AMIS_B_PORT; temporary data folders,
// every theme on) and a fake ntfy relay (tests/fake_ntfy.py, port 8461 or AMIS_RELAY_PORT): never the real ntfy.sh.
//   node tests/test_amis.js [--shots DIR]
// - becoming friends from the phones (390x844): « Amis » under the keys opens « Ses amis »; « Créer mon code »: three words, a
//   number and a QR code; the other Pixel's phone types it; both kiosks play the new friend; the list, the journal;
// - a visit on the host's kiosk (800x480): his friend walks in beside him, they play their programme, their names under them;
//   in several themes; une chose à la fois: a cast and an exercise cover the visit and it comes back, the food plate waits;
//   on the visitor's kiosk the empty screen shows the house « Chez Bip »; at the end he walks home and tells what they did;
// - « Me demander avant »: the card on the host's kiosk, « Oui ! » by touch; « Rappelle-le » by touch on the visitor's kiosk;
// - Pixel Lab: the demo friend Bip comes over, the panel « Les amis »; no page or console error anywhere.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');

const APP = path.join(__dirname, '..');
const RP = Number(process.env.AMIS_RELAY_PORT) || 8461, PA = Number(process.env.AMIS_A_PORT) || 8462, PB = Number(process.env.AMIS_B_PORT) || 8463;
const A_URL = `http://127.0.0.1:${PA}`, B_URL = `http://127.0.0.1:${PB}`;
const SHOTS = (i => (i >= 0 ? process.argv[i + 1] : null))(process.argv.indexOf('--shots'));
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (name, ok, info = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (!ok && info ? `  [${info}]` : '')); if (!ok) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 8000, step = 100) => { const end = Date.now() + ms; let v; while (Date.now() < end) { if ((v = await fn())) return v; await wait(step); } return v; };
const portOpen = port => new Promise(r => { const s = net.connect(port, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
const THEMES = ['retro', 'moderne', 'manga', 'neon', 'croquis', 'lcd'];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-amis-')), procs = [];
const errors = page => {
  const e = [];
  page.on('pageerror', x => e.push('pageerror: ' + x.message));
  page.on('console', m => { if (m.type() === 'error' && !/\/pixel\.apk$/.test(m.location().url || '')) e.push('console.error: ' + m.text()); });
  return e;
};
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
async function tap(page, x, y) { const r = await page.locator('#crt').boundingBox(); await page.mouse.click(r.x + x / 800 * r.width, r.y + y / 480 * r.height); }
function server(port, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const cfg = path.join(dir, 'config.toml');
  fs.writeFileSync(cfg, `data_dir = "${dir}"\n[ui]\nthemes = ${JSON.stringify(THEMES)}\n[amis]\nrelay = "http://127.0.0.1:${RP}"\nvisite_secondes = 30\nrepos_secondes = 0\nsilence = 10\n`);   // (his rest after a visit: tests/test_amis.py)
  const p = spawn('python3', [path.join(APP, 'server.py'), '--demo', '--port', String(port), '--host', '127.0.0.1', '--config', cfg], { cwd: APP, stdio: 'ignore' });
  procs.push(p); return p;
}
function hub(url) {                                     // a WebSocket to a server, like a phone: its last snapshot in h.S
  const h = { S: null, ws: new WebSocket(url.replace('http', 'ws') + '/ws') };
  h.ws.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'state') h.S = m.data; };
  h.act = (action, args = {}) => h.ws.send(JSON.stringify({ action, args }));
  return h;
}
async function kiosk(browser, url) {
  const c = await browser.newContext({ viewport: { width: 800, height: 480 }, deviceScaleFactor: 1, hasTouch: true });
  const k = await c.newPage(), err = errors(k);
  await k.goto(url + '/?kiosk=1');
  await until(() => k.evaluate(() => !!window.PixelAmis && !!PixelAmis.panel && Screens.local.lastBootAt > 0 && Screens.local.boot < 0), 15000);
  await k.evaluate(() => { Screens.persona.stop(); Screens.local.lastInput = performance.now(); Screens.local.sleepy = false; });
  return { k, err, c };
}
async function phone(browser, url) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await c.newPage(), err = errors(p);
  await p.goto(url + '/');
  await until(() => p.evaluate(() => !!document.querySelector('.amis-go')), 10000);
  return { p, err, c };
}
const vis = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; }, sel);

async function main(browser) {
  const A = hub(A_URL), B = hub(B_URL);
  await until(() => A.ws.readyState === 1 && B.ws.readyState === 1 && A.S && B.S, 8000);
  check('both servers have the friends (snapshot "amis"): available, no friend, nothing sent', !!A.S.amis && A.S.amis.dispo && !A.S.amis.amis.length && B.S.amis.lien === 'off', JSON.stringify(A.S.amis && { dispo: A.S.amis.dispo, lien: A.S.amis.lien }));
  const day = { de: 23, a: 23 };                          // no quiet hours: the test runs at any time (else after 23 h they sleep)
  A.act('caractere.set', { nom: 'Pixou', calme: day }); B.act('caractere.set', { nom: 'Bip', preset: 'farceur', calme: day }); B.act('theme.set', { name: 'neon' });
  await until(() => A.S.caractere.nom === 'Pixou' && B.S.caractere.nom === 'Bip' && B.S.view.theme === 'neon');
  const ka = await kiosk(browser, A_URL), kb = await kiosk(browser, B_URL);

  /* ---- becoming friends, from the phones ---- */
  const pa = await phone(browser, A_URL), pb = await phone(browser, B_URL);
  const order = await pa.p.evaluate(() => [...document.querySelector('.kfoot > span').children].filter(e => !e.hidden).map(e => e.textContent.trim()));
  check('under the keys: « Amis », with Caractère, Nourrir and Exos', order.includes('Amis') && order.indexOf('Amis') > order.indexOf('Exos'), order.join(' · '));
  await pa.p.click('.amis-go');
  check('« Amis » opens « Ses amis »', await vis(pa.p, '#amis'));
  check('…no friend yet: it says so, and that nothing leaves the house', /rien ne sort de la maison/.test(await pa.p.textContent('.amis-etat')), await pa.p.textContent('.amis-etat'));
  await shot(pa.p, 'phone-amis-vide');
  await pa.p.click('button:text-is("Créer mon code")');
  await until(() => vis(pa.p, '.amis-mots'));
  const words = await pa.p.evaluate(() => [...document.querySelectorAll('.amis-mots span')].map(s => s.textContent).concat([document.querySelector('.amis-mots b').textContent]));
  check('« Créer mon code »: three words and a number, a QR code', words.length === 4 && /^\d{4}$/.test(words[3]) && await vis(pa.p, '.amis-qr'), words.join(' '));
  await shot(pa.p, 'phone-amis-code');
  const ok = await pa.p.evaluate(() => { const r = document.querySelector('.amis-sheet').getBoundingClientRect(); return r.width <= 390 && r.left >= 0; });
  check('…the sheet fits the phone (390 px)', ok);
  await pb.p.click('.amis-go');
  await pb.p.fill('.amis-form input', 'lapon ' + words.slice(1).join(' '));
  await wait(150);
  check('typing a word that is not in the list: a hint with the closest word, at once', /n’est pas un mot/.test(await pb.p.textContent('.amis-hint')), await pb.p.textContent('.amis-hint'));
  await pb.p.fill('.amis-form input', words.join(' ').toUpperCase());
  await pb.p.click('.amis-form button[type=submit]');
  const paired = await until(() => A.S.amis.amis.length === 1 && B.S.amis.amis.length === 1, 10000);
  check('the other phone types it: both Pixels are friends', !!paired && A.S.amis.amis[0].nom === 'Bip' && B.S.amis.amis[0].nom === 'Pixou', JSON.stringify([A.S.amis.amis, B.S.amis.amis].map(l => l.map(f => f.nom))));
  await until(() => pb.p.evaluate(() => /est ton ami/.test(document.querySelector('.amis-res').textContent)), 4000);
  check('…its phone says « Pixou est ton ami ! »', /Pixou est ton ami/.test(await pb.p.textContent('.amis-res')));
  const newA = await until(() => ka.k.evaluate(() => Screens.persona.state.cur === 'ami-nouveau'), 4000), newB = await until(() => kb.k.evaluate(() => Screens.persona.state.cur === 'ami-nouveau'), 4000);
  check('…both kiosks play the new friend (ami-nouveau), his face peeps in', !!newA && !!newB && await kb.k.evaluate(() => PixelAmis.state.peek === 'nouvel-ami'));
  await shot(kb.k, 'kiosk-nouvel-ami');
  await until(() => pa.p.evaluate(() => document.querySelectorAll('.amis-card').length === 1), 4000);
  check('the friend in the list: his face, his name, « Va le voir », « Coucou », a sticker, « Retirer »', await pa.p.evaluate(() => {
    const c = document.querySelector('.amis-card'); return !!c && c.querySelector('.amis-nom').textContent === 'Bip' && !!c.querySelector('canvas.amis-face')
      && [...c.querySelectorAll('button')].map(b => b.textContent).join('|').startsWith('Va le voir|Coucou|Autocollant|Retirer');
  }));
  check('…and the journal: « Nouvel ami : Bip ! »', /Nouvel ami : Bip/.test(await pa.p.textContent('.amis-journal')));
  await pa.p.click('.amis-card button:text-is("Autocollant")');
  await shot(pa.p, 'phone-amis-liste');
  await pa.p.click('.amis-stickers button[aria-label^="Envoyer un cœur"]');
  await until(() => kb.k.evaluate(() => Screens.persona.state.cur === 'ami-sticker'), 5000);
  check('a sticker from the phone: on the friend\'s kiosk (ami-sticker), the heart beside his face', await kb.k.evaluate(() => Screens.persona.state.cur === 'ami-sticker' && PixelAmis.state.peek === 'sticker'));
  await wait(900); await shot(kb.k, 'kiosk-sticker');

  /* ---- a visit: Pixou goes to Bip's ---- */
  await kb.k.evaluate(() => { Screens.persona.stop(); PixelAmis.state; });
  await wait(6500);                                       // the peek goes
  await pa.p.click('.amis-card button:text-is("Va le voir")');
  await until(() => ka.k.evaluate(() => Screens.persona.state.cur === 'ami-part'), 4000);
  check('« Va le voir »: on his own kiosk he walks off (ami-part)', await ka.k.evaluate(() => Screens.persona.state.cur === 'ami-part'));
  const arrived = await until(() => kb.k.evaluate(() => PixelAmis.state.hosting && Screens.persona.state.cur === 'ami-arrive'), 6000);
  check('…on Bip\'s kiosk Pixou arrives (ami-arrive)', !!arrived);
  await until(() => kb.k.evaluate(() => PixelAmis.state.guest), 6000);
  await wait(2500);
  check('…drawn beside Bip, who moves to the left (both on screen, their names)', await kb.k.evaluate(() => PixelAmis.state.guest && PixelAmis.state.showing));
  await shot(kb.k, 'kiosk-visite-neon');
  for (const th of ['retro', 'manga', 'croquis']) { B.act('theme.set', { name: th }); await wait(1200); await shot(kb.k, 'kiosk-visite-' + th); }
  B.act('theme.set', { name: 'neon' });
  await until(() => ka.k.evaluate(() => PixelAmis.state.away), 3000);
  await wait(1500);
  check('his own kiosk: the house « Chez Bip », what is left, « Rappelle-le »', await ka.k.evaluate(() => PixelAmis.state.away && ['ami-part', 'ami-absent'].includes(Screens.persona.state.cur)));
  await shot(ka.k, 'kiosk-absent');
  const fed = await kb.k.evaluate(() => !!window.PixelNourrir && Screens.addonTop === 'amis' && !PixelNourrir.shown && !PixelNourrir.open() && !PixelNourrir.trayOpen);   // under every add-on (screens.js ORDER)
  check('une chose à la fois: the food tray and its plate wait during the visit', fed);
  B.act('cast.text', { text: 'Coucou !' });
  await until(() => kb.k.evaluate(() => Screens.casting), 4000);
  check('…a cast covers the visit (not drawn, its time goes on)', await kb.k.evaluate(() => Screens.casting && !PixelAmis.state.showing && PixelAmis.state.hosting));
  B.act('cast.stop');
  await until(() => kb.k.evaluate(() => !Screens.casting && PixelAmis.state.showing), 4000);
  check('…and it comes back when the cast ends', await kb.k.evaluate(() => PixelAmis.state.showing));
  const back = await until(() => ka.k.evaluate(() => Screens.persona.state.cur === 'ami-revient'), 40000, 250);
  check('at the end he walks home on his kiosk (ami-revient)', !!back);
  const told = await until(() => ka.k.evaluate(() => { const s = Screens.persona.state.say; return /(On a|On s’est|On n’a pas)/.test(s) ? s : ''; }), 12000);
  check('…and tells what they did (« On a … »)', !!told, String(told));
  await shot(ka.k, 'kiosk-retour');
  check('…Bip\'s kiosk: the visit is over, the plate is back', await until(() => kb.k.evaluate(() => !PixelAmis.state.hosting), 6000));
  check('both journals: « Chez Bip : … », « Pixou est venu jouer … »', await until(() => /Chez Bip/.test(JSON.stringify(A.S.amis.journal.map(j => j.quoi))) || A.S.amis.journal[0].quoi === 'visite', 2000)
    && B.S.amis.journal.some(j => j.quoi === 'accueil'));

  /* ---- « Me demander avant », and « Rappelle-le », by touch ---- */
  B.act('amis.reglages', { demander: true });
  await until(() => B.S.amis.demander);
  await wait(21000);                                      // the cooldown after a visit (pixel/amis.py COOLDOWN)
  A.act('amis.visite', { ami: A.S.amis.amis[0].id });
  const asked = await until(() => kb.k.evaluate(() => PixelAmis.state.asking), 6000);
  await wait(1200);
  check('« Me demander avant »: the card « Bip, Pixou veut venir jouer ! » on the host\'s kiosk', !!asked);
  await shot(kb.k, 'kiosk-question');
  await tap(kb.k, 646, 422);
  await until(() => B.S.amis.visite && B.S.amis.visite.etat === 'chez', 4000);
  check('…« Oui ! » by touch: the visit starts', !!(B.S.amis.visite && B.S.amis.visite.etat === 'chez'));
  await until(() => A.S.amis.visite && A.S.amis.visite.etat === 'chez', 4000);
  await wait(2500);
  await tap(ka.k, 400, 400);
  await until(() => !A.S.amis.visite, 4000);
  check('« Rappelle-le » by touch on his kiosk: he comes home at once', !A.S.amis.visite && (A.S.amis.evs.slice(-1)[0] || {}).par === 'rappel');
  check('…and on Bip\'s kiosk he says goodbye (ami-aurevoir)', await until(() => kb.k.evaluate(() => Screens.persona.state.cur === 'ami-aurevoir'), 4000));
  B.act('amis.reglages', { demander: false });

  /* ---- an exercise over a visit ---- */
  await until(() => !B.S.amis.visite, 15000);
  await wait(20500);
  A.act('amis.visite', { ami: A.S.amis.amis[0].id });
  await until(() => kb.k.evaluate(() => PixelAmis.state.showing && PixelAmis.state.guest), 8000);
  B.act('exos.nouveau', { mode: 'exo', kind: 'addition', niveau: 1 });
  await until(() => kb.k.evaluate(() => window.PixelExos && PixelExos.open), 4000);
  check('une chose à la fois: an exercise opened during a visit takes his face screen, the visit waits under it', await kb.k.evaluate(() => PixelExos.open && !PixelAmis.state.showing && PixelAmis.state.hosting));
  B.act('exos.stop');
  await until(() => kb.k.evaluate(() => !PixelExos.open && PixelAmis.state.showing), 4000);
  check('…and comes back after', await kb.k.evaluate(() => PixelAmis.state.showing));
  A.act('amis.rappel');

  for (const [n, e] of [['kiosk A', ka.err], ['kiosk B', kb.err], ['phone A', pa.err], ['phone B', pb.err]]) check(`${n}: no page or console errors`, e.length === 0, e.slice(0, 3).join(' | '));
  for (const x of [ka, kb, pa, pb]) await x.c.close();
  A.ws.close(); B.ws.close();
}

async function lab(browser) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const l = await c.newPage(), err = errors(l);
  await l.goto(A_URL + '/app/lab/index.html?themes=all');
  await until(() => l.evaluate(() => !!window.PixelHub && !!PixelHub.S.amis && !!document.getElementById('amis-lab')), 15000);
  check('Pixel Lab: the panel « Les amis », after « Exos de maths », with the demo friend Bip', await l.evaluate(() => {
    const order = [...document.querySelectorAll('#panel > section')].map(s => s.getAttribute('aria-labelledby'));
    return order.indexOf('hExos') >= 0 && order.indexOf('hAmis') > order.indexOf('hExos') && PixelHub.S.amis.amis[0].nom === 'Bip';
  }));
  await l.evaluate(() => PixelHub.dispatch('caractere.set', { calme: { de: 23, a: 23 } }));   // the lab's paused clock: his quiet hours are his night; none, at any time of the test
  await until(() => l.evaluate(() => PixelHub.S.look && PixelHub.S.look.porte && PixelHub.S.look.porte.nuit === false), 5000);   // (at night his pyjama comes off first: « Debout ! »)
  await wait(500);
  await l.evaluate(() => { Screens.local.boot = -1; Screens.persona.stop(); });
  await l.click('#amis-lab button:text-is("Il vient te voir")');
  check('« Il vient te voir »: Bip comes over (the same programme as on the Pi)', await until(() => l.evaluate(() => PixelAmis.state.hosting && Screens.persona.state.cur === 'ami-arrive'), 5000));
  await wait(5000);
  check('…drawn beside Pixel', await l.evaluate(() => PixelAmis.state.guest));
  await l.evaluate(() => document.getElementById('amis-lab').scrollIntoView({ block: 'start' })); await wait(300);
  await shot(l, 'lab-amis');
  await l.fill('#cmd', 'mes amis'); await l.press('#cmd', 'Enter'); await wait(200);
  check('the lab knows the commands: « mes amis »', /Ses amis : Bip/.test(await l.evaluate(() => PixelHub.S.toast && PixelHub.S.toast.msg)));
  check('Pixel Lab: no page or console errors', err.length === 0, err.slice(0, 3).join(' | '));
  await c.close();
}

(async () => {
  for (const p of [RP, PA, PB]) if (await portOpen(p)) throw new Error(`le port ${p} est déjà pris (AMIS_RELAY_PORT, AMIS_A_PORT, AMIS_B_PORT)`);
  const relay = spawn('python3', [path.join(__dirname, 'fake_ntfy.py'), '--port', String(RP), '--keepalive', '3'], { cwd: APP, stdio: 'ignore' });
  procs.push(relay);
  server(PA, path.join(tmp, 'a')); server(PB, path.join(tmp, 'b'));
  if (!(await until(async () => (await portOpen(RP)) && (await portOpen(PA)) && (await portOpen(PB)), 20000))) throw new Error('les serveurs ne démarrent pas');
  const browser = await chromium.launch();
  try {
    await main(browser);
    await lab(browser);
  } finally {
    await browser.close();
    for (const p of procs) p.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`\n${fails} failure(s)`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); for (const p of procs) p.kill(); process.exit(1); });
