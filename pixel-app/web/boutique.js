/* La boutique: Pixel's shop and wardrobe. pixel/boutique.py keeps his coins, what he owns and what he wears (snapshot
   "boutique"); the scene pack web/scenes/boutique.js has the catalogue, its drawings (PixelWardrobe) and his reactions. This file:
   - hears every snapshot (it wraps Screens.setState, so app.js and the lab need nothing): it tells his personality what he wears
     (persona.setWear: drawn on his face in every theme), plays his reaction on every screen when the server says he bought,
     put on or took off something, or opened the gift of the day, and shows the coins he wins (« +2 », top left) for a moment;
   - trying on: touch an accessory he does not own and he wears it for a few seconds, on this screen only; touch it again to buy it;
   - on the Pi's touch screen and the Pixel de poche: a small hat on the left edge of his face screen, the twin of Nourrir's plate
     on the right (outside his face box, above the info line, off the 64 px corners), slides up a tray of the 24 accessories.
     A touch above the tray, « Fermer » or 20 s untouched put it away. screens.js calls over(K) after drawing each screen;
   - on the phone (the app, not the Pi's screen nor the lab): a « Boutique » button under the keys (by « Nourrir ») opens a panel:
     his coins, the gift of the day, the accessories by place (on his head, glasses, around his neck, little extras), how to win
     coins and the last ones won. Like Nourrir's, the sheet stops just under Pixel's screen when there is room, so you see him
     try things on.
   Loaded after screens.js (and nourrir.js) and before app.js; in the lab after demo-hub.js and before lab.js. */
window.PixelBoutique = (() => {
const Sc = typeof Screens !== 'undefined' ? Screens : null, WR = window.PixelWardrobe;
if (!Sc || !WR) return null;
const L = Sc.local, PER = Sc.persona, W = 800, H = 480;
const qs = new URLSearchParams(location.search), KIOSK = qs.has('kiosk'), LAB = !!window.PixelHub && !window.PIXEL_LOCAL;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), out = x => 1 - (1 - clamp(x, 0, 1)) ** 3;
const realNow = () => (window.PixelClock ? window.PixelClock.real() : performance.now());
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fastFor = ms => { L.fastUntil = Math.max(L.fastUntil || 0, realNow() + ms); L.dirty = true; };
const coins = n => `${n} pièce${n > 1 ? 's' : ''}`;
const EVENT = { achat: 'boutique-achat', porte: 'boutique-porte', retire: 'boutique-retire', cadeau: 'boutique-cadeau' };
const RAISONS = { exo: 'Un exo réussi', objectif: 'L’objectif du jour', repas: 'Un repas', minuteur: 'Le minuteur', cadeau: 'Le cadeau du jour', labo: 'Le labo' };
const TRY_MS = 8000;
let P = null, send = () => {}, seenLast = null, seenGain = null, trying = null, float = null;

/* ---------- the server's word: every snapshot goes through Screens.setState ---------- */
const set0 = Sc.setState, ss0 = Sc.setSend;
Sc.setState = p => { set0(p); try { heard(p); } catch (e) { console.warn('Pixel: boutique', e); } };
Sc.setSend = fn => { send = fn; ss0(fn); };
const B = () => (P && P.boutique) || null;
const worn = () => { const b = B(); return b && b.porte ? Object.values(b.porte).filter(id => WR.BY[id]) : []; };
function dress() {                  // what he wears on this screen: what the server says, and what is being tried on
  if (!PER || !PER.setWear) return;
  let ids = worn();
  if (trying && WR.BY[trying.id]) ids = [...ids.filter(id => WR.BY[id].slot !== WR.BY[trying.id].slot), trying.id];
  PER.setWear(ids); L.dirty = true;
}
function heard(p) {
  const first = !P; P = p;
  const b = p && p.boutique;
  if (!b) { trying = null; dress(); if (tray.open) closeTray(true); return panelDraw(); }
  const d = b.dernier, g = b.gain, dk = d ? d.id + ':' + d.t : '', gk = g ? g.id + ':' + g.t : '';
  if (first) { seenLast = dk; seenGain = gk; dress(); return panelDraw(); }       // old news stays old
  if (dk !== seenLast) {
    seenLast = dk;
    if (d && (p.server_now || Date.now()) - d.t < 15000 && EVENT[d.quoi]) {
      const it = WR.BY[d.objet]; trying = null; closeTray(true);
      Sc.event(EVENT[d.quoi], { objet: d.objet || '', label: it ? it.label : '', nom: it ? it.nom : '', n: d.n || 0 }, true);
    }
  }
  if (gk !== seenGain) { seenGain = gk; if (g && (p.server_now || Date.now()) - g.t < 15000) { float = { n: g.n, t: realNow() }; fastFor(2600); } }
  if (trying && (b.possede || []).includes(trying.id)) trying = null;
  if (tray.open && Sc.casting) closeTray(true);
  dress(); panelDraw();
}
function tryOn(id) {                // he wears it for a few seconds, on this screen only
  trying = { id, until: realNow() + TRY_MS }; dress(); fastFor(400);
  if (P && P.screen !== 'visage' && !KIOSK) send('screen.show', { screen: 'visage' });
}
/* touch an accessory: his own: on or off; not his: a first touch tries it on, a second one (while he wears it) buys it */
function pick(id) {
  const b = B(), it = WR.BY[id]; if (!b || !it) return '';
  if ((b.possede || []).includes(id)) { trying = null; send(b.porte && b.porte[it.slot] === id ? 'boutique.retirer' : 'boutique.porter', { objet: id }); return ''; }
  const armed = trying && trying.id === id && realNow() < trying.until, need = it.prix - b.pieces;
  if (armed && need <= 0) { send('boutique.acheter', { objet: id }); return ''; }
  tryOn(id);
  return need > 0 ? `${it.label} : il te manque ${coins(need)}.` : `${it.label} : ${coins(it.prix)}. Touche encore pour l’acheter.`;
}

/* ---------- the colours of every theme, and the pictures ---------- */
const THEMES = (() => {
  try {
    const t = window.PixelThemes({ X: document.createElement('canvas').getContext('2d'), RM: true, get now() { return 0; }, blinkP: () => 9, txt() {}, wrap: () => [], fit: s => s });
    return Object.fromEntries(Object.values(t).filter(x => x && x.id && x.c).map(x => [x.id, x.c]));
  } catch { return {}; }
})();

/* ---------- the coins he wins, and the tray (the Pi's touch screen, the Pixel de poche, the lab) ---------- */
const tray = { open: false, t: -1e9, msg: '' }, TR = { x: 8, w: 784, h: 196, gx: 19, gy: 62, cell: 58, step: 64 }, HANDLE = { x: 0, y: 352, w: 64, h: 64 };
function above() {                  // what comes first over his face screen: a cast, an exercise and its offer, his food tray
  const X = window.PixelExos, N = window.PixelNourrir;
  return !!Sc.casting || !!(X && (X.open || X.offering)) || !!(N && N.trayOpen);
}
const shown = () => !!B() && L.scr === 'visage' && L.boot < 0 && !Sc.menuOpen
  && (L.kiosk || !!(window.PixelPoche && window.PixelPoche.on)) && !(PER && PER.state.cur === 'poche-part') && !above();
function openTray() { if (tray.open || !shown()) return false; tray.open = true; tray.t = realNow(); tray.msg = ''; fastFor(320); return true; }
function closeTray(quick) { if (!tray.open) return; tray.open = false; tray.t = quick || RM ? -1e9 : realNow(); fastFor(320); }
let grid = null, bag = null;
function gridImage(K) {             // the 24 cells and their drawings, again only when the theme or his wardrobe changes
  const T = K.T, S = K.S, b = B(), key = [T.id, S, (b.possede || []).join(), Object.values(b.porte || {}).join(), trying ? trying.id : ''].join('|');
  if (grid && grid.key === key) return grid;
  const cv = document.createElement('canvas'), w = TR.step * 12 - (TR.step - TR.cell), h = TR.step * 2 - (TR.step - TR.cell), c = T.c;
  cv.width = w * S; cv.height = h * S; cv.key = key;
  const g = cv.getContext('2d'), ic = document.createElement('canvas'); ic.width = ic.height = Math.round(44 * S); g.scale(S, S);
  WR.ITEMS.slice(0, 24).forEach((it, i) => {
    const x = (i % 12) * TR.step, y = Math.floor(i / 12) * TR.step, own = (b.possede || []).includes(it.id), on = b.porte && b.porte[it.slot] === it.id, arm = trying && trying.id === it.id;
    if (on) { g.fillStyle = c.faint || c.dim || c.fg; g.globalAlpha = 0.5; g.fillRect(x + 1, y + 1, TR.cell - 2, TR.cell - 2); g.globalAlpha = 1; }
    g.strokeStyle = on || arm ? c.accent || c.fg : own ? c.fg : c.dim || c.fg; g.lineWidth = on || arm ? 3 : 2; g.strokeRect(x + 1, y + 1, TR.cell - 2, TR.cell - 2);
    if (WR.icon(ic, it.id, c)) { g.globalAlpha = own || arm ? 1 : 0.8; g.drawImage(ic, x + 7, y + 2, 44, 44); g.globalAlpha = 1; }
    g.font = T.font ? T.font(14) : '14px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = own ? c.fg : c.accent || c.fg;
    g.fillText(on ? 'porté' : own ? 'à lui' : arm && it.prix <= b.pieces ? 'acheter ?' : String(it.prix), x + TR.cell / 2, y + TR.cell - 5);
  });
  grid = cv; return cv;
}
function bagImage(K) {              // the little hat of the handle
  const T = K.T, S = K.S, key = T.id + '|' + S; if (bag && bag.key === key) return bag;
  const cv = document.createElement('canvas'); cv.width = cv.height = Math.round(36 * S); cv.key = key; WR.icon(cv, 'haut-de-forme', T.c); bag = cv; return cv;
}
function over(K) {                  // screens.js, after each drawn screen
  const r = realNow();
  if (trying && r > trying.until) { trying = null; dress(); panelDraw(); }
  if (float && r - float.t < 2400 && B()) drawFloat(K, (r - float.t) / 2400); else float = null;
  if (!shown()) { if (tray.open) { tray.open = false; tray.t = -1e9; } return; }
  if (tray.open && r - Math.max(tray.t, L.inputAt || 0) > 20000) closeTray();      // left alone: it goes away
  const k = RM ? (tray.open ? 1 : 0) : tray.open ? out((r - tray.t) / 220) : 1 - out((r - tray.t) / 220);
  if (k > 0) drawTray(K, k); else if (!L.sleepy) drawHandle(K);
}
function coin(X, x, y, r, c) { X.fillStyle = c.accent || c.fg; X.beginPath(); X.arc(x, y, r, 0, 7); X.fill(); X.strokeStyle = c.bg; X.lineWidth = Math.max(1.5, r * 0.22); X.beginPath(); X.arc(x, y, r * 0.58, 0, 7); X.stroke(); }
function drawFloat(K, q) {          // « +2 » and a coin rising in the top left corner, on any screen
  const X = K.X, c = K.T.c, y = 62 - 14 * out(q * 2.5), a = q < 0.75 ? 1 : 1 - (q - 0.75) * 4;
  X.save(); X.shadowBlur = 0; X.globalAlpha = clamp(a, 0, 1);
  coin(X, 36, y + 14, 11, c); K.txt('+' + float.n, 54, y, 30, c.accent || c.fg, 'left', 'title'); X.restore();
}
function drawHandle(K) {            // a small hat in the corner, a dot when today's gift is still to open
  const X = K.X, T = K.T, c = T.c, b = B(), x = HANDLE.x + 8, y = HANDLE.y + 8, s = 48;
  X.save(); X.globalAlpha = 0.85;
  K.box(x, y, s, s, c.dim || c.fg, c.bg);
  X.drawImage(bagImage(K), x + 6, y + 6, 36, 36);
  if (b.cadeau) { X.globalAlpha = RM ? 1 : 0.55 + 0.45 * Math.sin(K.now / 320); X.fillStyle = c.accent || c.fg; X.shadowColor = X.fillStyle; X.fillRect(x - 2, y - 4, 10, 10); }
  X.restore();
  K.hit(HANDLE.x, HANDLE.y, HANDLE.w, HANDLE.h, () => { if (window.PixelNourrir) window.PixelNourrir.close(); openTray(); });
}
function drawTray(K, k) {
  const X = K.X, T = K.T, c = T.c, b = B(), y0 = Math.round(H - TR.h * k), up = s => (T.upper ? s.toUpperCase() : s);
  X.save(); X.shadowBlur = 0; X.globalAlpha = 0.25 * k; X.fillStyle = c.bg; X.fillRect(0, 0, W, y0); X.restore();     // a light veil: he is seen trying things on
  K.hit(0, 0, W, H, () => closeTray());                                             // a touch above it puts it away
  K.hit(TR.x, y0, TR.w, TR.h, () => {});
  K.box(TR.x, y0, TR.w, TR.h + 8, c.fg, c.bg);
  K.txt(up('Boutique'), 26, y0 + 14, 30, c.hi || c.fg, 'left', 'title');
  X.save(); X.shadowBlur = 0; coin(X, 196, y0 + 30, 11, c); X.restore();
  K.txt(String(b.pieces), 214, y0 + 16, 26, c.accent || c.fg);
  if (b.cadeau) { K.box(288, y0 + 10, 176, 44, c.accent || c.fg, c.bg); K.txt(K.fit(up('Cadeau du jour'), 164, 22), 376, y0 + 21, 22, c.accent || c.fg, 'center'); K.hit(280, y0, 192, 60, () => { closeTray(); send('boutique.cadeau'); }); }
  else if (tray.msg) K.txt(K.fit(tray.msg, 360, 22), 288, y0 + 21, 22, c.dim || c.fg);
  K.box(656, y0 + 10, 120, 44, c.dim || c.fg, c.bg); K.txt(K.fit(up('Fermer'), 108, 26), 716, y0 + 18, 26, c.fg, 'center');
  K.hit(648, y0, 144, 60, () => closeTray());
  X.drawImage(gridImage(K), TR.gx, y0 + TR.gy, TR.step * 12 - 6, TR.step * 2 - 6);
  WR.ITEMS.slice(0, 24).forEach((it, i) => K.hit(TR.gx + (i % 12) * TR.step - 2, y0 + TR.gy + Math.floor(i / 12) * TR.step - 2, TR.cell + 4, TR.cell + 4, () => { tray.msg = pick(it.id); tray.t = realNow(); fastFor(200); }));
}

/* ---------- the panel (the phone) ---------- */
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const hhmm = t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
let pv = null, iconsFor = '', said = '', saidAt = 0;
function paintIcons(force) {        // the drawings, in the colours of the current theme
  const th = (P && P.view && P.view.theme) || 'retro', c = THEMES[th] || THEMES.retro; if (!c || !pv) return;
  if (!force && iconsFor === th) return; iconsFor = th;
  pv.root.querySelectorAll('canvas[data-item]').forEach(cv => WR.icon(cv, cv.dataset.item, c));
}
function build() {
  const links = document.querySelector('main.device .kfoot span'), after = links && (links.querySelector('.nour-go') || links.querySelector('a[href="app/reglages.html"]'));
  if (KIOSK || LAB || !links) return;
  const go = el('button', 'follow bout-go', 'Boutique'); go.type = 'button'; go.title = 'La boutique de Pixel : ses accessoires';   // with the other pages, under the keys
  if (after) after.after(go); else links.append(go);
  const root = el('div', 'bout'); root.id = 'bout'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'boutTitle');
  const sheet = el('div', 'bout-sheet'), head = el('header', 'bout-head'), h2 = el('h2', null, 'La boutique'), x = el('button', 'bout-x', '×');
  const purse = el('p', 'bout-purse'), pc = el('i', 'bout-coin'), pn = el('b');
  h2.id = 'boutTitle'; x.type = 'button'; x.setAttribute('aria-label', 'Fermer'); purse.append(pc, pn); head.append(h2, purse, x);
  const msg = el('p', 'bout-msg'); msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
  const gift = el('button', 'bout-gift'); gift.type = 'button';
  gift.addEventListener('click', () => { send('boutique.cadeau'); if (!pv.root.classList.contains('peek') && screenBox()) panel(false); });
  const shop = el('section', 'bout-shop'), items = {};
  for (const [slot, name] of WR.SLOTS) {
    const list = WR.ITEMS.filter(i => i.slot === slot); if (!list.length) continue;
    const box = el('div', 'bout-cat'); box.append(el('h3', null, name));
    const gridEl = el('div', 'bout-grid');
    for (const it of list) {
      const b = el('button', 'bout-item'); b.type = 'button'; b.dataset.id = it.id;
      const cv = el('canvas', 'bout-ic'); cv.width = cv.height = 96; cv.dataset.item = it.id; cv.setAttribute('aria-hidden', 'true');
      b.append(cv, el('span', 'bout-label', it.label), el('span', 'bout-tag'));
      b.addEventListener('click', () => { const s = pick(it.id); said = s; saidAt = Date.now(); panelDraw(); });
      items[it.id] = b; gridEl.append(b);
    }
    box.append(gridEl); shop.append(box);
  }
  const off = el('button', 'bout-btn', 'Tout enlever'); off.type = 'button'; off.addEventListener('click', () => { trying = null; send('boutique.retirer'); });
  const how = el('section', 'bout-how'); how.append(el('h3', null, 'Gagner des pièces'));
  const ul = el('ul');
  for (const [t, n] of [['Un exo de maths réussi', '2'], ['L’objectif d’exos du jour', '10'], ['Un repas (son plat préféré : 2)', '1'], ['Un minuteur de travail fini (25 min)', '5'], ['Le cadeau du jour', '5']]) {
    const li = el('li'); li.append(el('span', null, t), el('b', null, '+' + n)); ul.append(li);
  }
  how.append(ul);
  const journal = el('section', 'bout-journal'), ol = el('ol'); journal.append(el('h3', null, 'Tes dernières pièces'), ol);
  sheet.append(head, msg, gift, shop, off, how, journal); root.append(sheet); document.body.append(root);
  pv = { root, go, x, pn, msg, gift, items, off, ol, sheet };
  go.addEventListener('click', () => panel(true));
  x.addEventListener('click', () => panel(false));
  root.addEventListener('click', e => { if (e.target === root) panel(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !root.hidden) panel(false); });
  panelDraw();
}
const PEEK_MIN = 300;                 // px the sheet needs under Pixel's screen
const screenBox = () => { const c = document.getElementById('crt'); if (!c || c.offsetParent === null) return null; const r = c.getBoundingClientRect(); return r.height > 40 ? r : null; };
function place() {                  // the sheet stops under Pixel's screen (he is seen trying things on), or fills the screen when there is no room
  if (!pv || pv.root.hidden) return;
  const r = screenBox(), top = r && r.top >= -1 ? Math.ceil(r.bottom + 8) : 0, peek = top > 0 && innerHeight - top >= PEEK_MIN;
  pv.root.classList.toggle('peek', peek); pv.root.style.setProperty('--bout-top', peek ? top + 'px' : '');
}
function panel(open) {
  if (!pv) return;
  if (open) { const r = screenBox(); if (r && r.top < 0) window.scrollBy(0, r.top - 8); }      // his screen in sight first
  pv.root.hidden = !open; document.body.classList.toggle('bout-on', !!open);
  if (open) { said = ''; place(); paintIcons(true); panelDraw(); pv.x.focus({ preventScroll: true }); } else { if (trying) { trying = null; dress(); } pv.go.focus({ preventScroll: true }); }
}
addEventListener('resize', place);
let drawnKey = '';
function panelDraw() {
  if (!pv) return;
  const b = B();
  pv.go.hidden = !b;
  if (!b) { if (!pv.root.hidden) panel(false); return; }
  if (document.body.classList.contains('poche') && !pv.root.hidden) panel(false);
  pv.go.classList.toggle('gift', !!b.cadeau);
  pv.pn.textContent = coins(b.pieces);
  pv.gift.disabled = !b.cadeau; pv.gift.textContent = b.cadeau ? 'Ouvrir le cadeau du jour : +5 pièces' : 'Cadeau du jour ouvert. Reviens demain !';
  const own = b.possede || [], on = b.porte || {};
  pv.msg.textContent = said && Date.now() - saidAt < TRY_MS ? said : own.length ? 'Touche un accessoire pour le mettre ou l’enlever.' : 'Touche un accessoire : Pixel l’essaie.';
  for (const [id, btn] of Object.entries(pv.items)) {
    const it = WR.BY[id], mine = own.includes(id), worn1 = on[it.slot] === id, arm = !!trying && trying.id === id, poor = !mine && it.prix > b.pieces;
    btn.classList.toggle('own', mine); btn.classList.toggle('worn', worn1); btn.classList.toggle('armed', arm); btn.classList.toggle('poor', poor);
    const tag = btn.querySelector('.bout-tag'), t = worn1 ? 'Porté' : mine ? 'Mettre' : arm && !poor ? 'Acheter ?' : String(it.prix);
    if (tag.textContent !== t) tag.textContent = t;
    tag.classList.toggle('price', !mine && !(arm && !poor));
    btn.setAttribute('aria-pressed', String(worn1));
    btn.setAttribute('aria-label', it.label + (worn1 ? ', il le porte' : mine ? ', dans sa garde-robe' : `, ${coins(it.prix)}` + (poor ? `, il te manque ${coins(it.prix - b.pieces)}` : '')));
  }
  pv.off.hidden = !Object.keys(on).length;
  const key = JSON.stringify([b.journal, (P.view || {}).theme]);
  if (key !== drawnKey) {
    drawnKey = key;
    const rows = (b.journal || []).filter(j => RAISONS[j.raison]).map(j => { const li = el('li'); li.append(el('time', null, hhmm(j.t)), el('span', null, RAISONS[j.raison]), el('b', null, '+' + j.n)); return li; });
    pv.ol.replaceChildren(...(rows.length ? rows : [el('li', 'bout-none', 'Pas encore de pièces gagnées.')]));
    paintIcons(true);
  } else paintIcons(false);
}
build();

return {
  over, open: openTray, close: () => closeTray(), panel, pick, tryOn,
  get trayOpen() { return tray.open; }, get shown() { return shown(); }, get trying() { return trying ? trying.id : ''; }, HANDLE, TR,
};
})();
