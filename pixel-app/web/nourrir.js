/* Nourrir: feeding Pixel. pixel/nourrir.py keeps his belly, his tastes and his meals (snapshot "nourrir"); the scene pack
   web/scenes/nourrir.js has the menu, its pixel-art drawings (PixelFoods) and the scenes. This file:
   - hears every snapshot (it wraps Screens.setState, so app.js and the lab need nothing): it gives the pack his belly, plays
     the meal ('nourrir-repas') on every screen when the server says he ate, and a rumble ('nourrir-faim') when his belly
     gets emptier: never at night, never within 20 min of another hint, never over another scene;
   - on the Pi's touch screen and the Pixel de poche: his food tray. A small plate on the right edge of his face screen, just
     above the bottom right corner (outside his face box PBOX: its touch zones, strokes and the long press stay as they were;
     above the info line at y 440, which may run from x 20 to 780; off the lab's corner menus, the 64 px corners), or a
     swipe up from the bottom edge (app.js), slides up a tray of the 24 foods; touch one and he eats it. A swipe down,
     a touch above the tray, « Fermer » or 20 s untouched put it away. screens.js calls over(K) after drawing each screen,
     K being its own drawing helpers; the grid of drawings is drawn once into a canvas, then copied: cheap on the Pi;
   - on the phone (the app, not the Pi's screen nor the lab): a « Nourrir » button under the keys (by « Agendas ») opens a panel: his
     belly, the menu with the same drawings, his tastes, his last meals and the settings. The sheet stops just under Pixel's
     screen when there is room (place()), so you see him eat what you give him; else it fills the screen and closes on a meal.
   Loaded after screens.js (and poche.js) and before app.js; in the lab after demo-hub.js and before lab.js. */
window.PixelNourrir = (() => {
const Sc = typeof Screens !== 'undefined' ? Screens : null, PF = window.PixelFoods;
if (!Sc || !PF) return null;
const L = Sc.local, PER = Sc.persona, W = 800, H = 480;
const qs = new URLSearchParams(location.search), KIOSK = qs.has('kiosk'), LAB = !!window.PixelHub;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), out = x => 1 - (1 - clamp(x, 0, 1)) ** 3;
const realNow = () => (window.PixelClock ? window.PixelClock.real() : performance.now());
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fastFor = ms => { L.fastUntil = Math.max(L.fastUntil || 0, realNow() + ms); L.dirty = true; };
let P = null, send = () => {}, seenMeal = null, seenFaim = 0, sentAt = -1e9;

/* ---------- the server's word: every snapshot goes through Screens.setState ---------- */
const set0 = Sc.setState, ss0 = Sc.setSend;
Sc.setState = p => { set0(p); try { heard(p); } catch (e) { console.warn('Pixel: nourrir', e); } };
Sc.setSend = fn => { send = fn; ss0(fn); };
function heard(p) {
  const first = !P; P = p;
  const n = p && p.nourrir; PF.set(n);
  if (!n) { if (tray.open) closeTray(true); return panelDraw(); }
  const d = n.dernier, faim = n.faim | 0;
  if (first) { seenMeal = d ? d.t : 0; seenFaim = faim; return panelDraw(); }      // old news stays old
  if (d && d.t !== seenMeal) {
    seenMeal = d.t;
    if ((p.server_now || Date.now()) - d.t < 15000) { closeTray(true); Sc.event('nourrir-repas', { plat: d.plat, reaction: d.reaction, rot: !!d.rot, gourmand: gourmand() }, true); }
  }
  if (n.on && faim > seenFaim) hint(faim);
  seenFaim = faim;
  if (tray.open && (!n.on || Sc.casting)) closeTray(true);                         // a cast covers his face: the tray is put away
  panelDraw();
}
function hint(niveau) {             // his belly just got emptier: he may say so, if nothing else is going on
  const h = new Date().getHours(), cur = PER && PER.state.cur, g = cur && (PER.scenes.find(s => s.id === cur) || {}).group;
  const night = PER && PER.isNight ? PER.isNight(h) : h >= 23 || h < 6;           // his quiet hours (his character's, 23 h to 6 h by default)
  if (night || !PF.hintOk() || (g && g !== 'vie') || Sc.casting || (window.PixelExos && window.PixelExos.open)) return '';   // nor during a cast or an exercise
  return Sc.event('nourrir-faim', { niveau });
}
function gourmand() {               // his character's trait of today (web/persona.js, web/caractere.js), 50 without one
  const v = PER && PER.traits && PER.traits.gourmand; return typeof v === 'number' && isFinite(v) ? v : 50;
}
const feed = id => { if (!PF.BY[id]) return; send('nourrir.donner', { plat: id }); sentAt = Date.now(); panelDraw(); };

/* ---------- the tray (the Pi's touch screen, the Pixel de poche, the lab) ---------- */
const tray = { open: false, t: -1e9 }, TR = { x: 8, w: 784, h: 196, gx: 19, gy: 62, cell: 58, step: 64 }, HANDLE = { x: 736, y: 352, w: 64, h: 64 };
const shown = () => !!(P && P.nourrir && P.nourrir.on) && L.scr === 'visage' && L.boot < 0 && !Sc.menuOpen
  && (L.kiosk || !!(window.PixelPoche && window.PixelPoche.on)) && !(PER && PER.state.cur === 'poche-part') && !above();   // not on the Pi's empty screen while he is in your pocket
/* over his face screen, these come first: the quick menu (over everything, a cast too), a cast (pixel/cast.py: screens.js draws
   it instead, and does not call over()), an open exercise and its offer « Une petite question ? » (web/exos.js); the tray and
   its plate wait, and come back after */
function above() {
  const X = window.PixelExos;
  return !!Sc.casting || !!(X && (X.open || X.offering));
}
function openTray() { if (tray.open || !shown()) return false; tray.open = true; tray.t = realNow(); fastFor(320); return true; }
function closeTray(quick) { if (!tray.open) return; tray.open = false; tray.t = quick || RM ? -1e9 : realNow(); fastFor(320); }
let grid = null;
function gridImage(K) {             // the 24 cells and their drawings, at the screen's scale, again only when the theme or his favourite changes
  const T = K.T, S = K.S, fav = PF.state.gouts.prefere, key = [T.id, S, fav].join('|');
  if (grid && grid.key === key) return grid;
  const cv = document.createElement('canvas'), w = TR.step * 12 - (TR.step - TR.cell), h = TR.step * 2 - (TR.step - TR.cell);
  cv.width = w * S; cv.height = h * S; cv.key = key;
  const g = cv.getContext('2d'), col = PF.theme(T.c), c = T.c; g.scale(S, S);
  PF.FOODS.slice(0, 24).forEach((f, i) => {
    const x = (i % 12) * TR.step, y = Math.floor(i / 12) * TR.step;
    g.strokeStyle = f.id === fav ? c.pink || c.fg : c.dim || c.fg; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, TR.cell - 2, TR.cell - 2);
    PF.draw(g, f.id, x + 5, y + 5, 4, col, 0);
    if (f.id === fav) { g.fillStyle = c.pink || c.accent; for (const [dx, dy, ww] of [[1, 0, 2], [4, 0, 2], [0, 1, 7], [1, 3, 5], [2, 5, 3], [3, 7, 1]]) g.fillRect(x + TR.cell - 13 + dx, y + 4 + dy, ww, 2); }   // a little heart: his favourite
  });
  grid = cv; return cv;
}
function over(K) {                  // screens.js, after each drawn screen
  const r = realNow();
  if (!shown()) { if (tray.open) { tray.open = false; tray.t = -1e9; } return; }
  if (tray.open && r - Math.max(tray.t, L.inputAt || 0) > 20000) closeTray();      // left alone: it goes away
  const k = RM ? (tray.open ? 1 : 0) : tray.open ? out((r - tray.t) / 220) : 1 - out((r - tray.t) / 220);
  if (k > 0) drawTray(K, k); else if (!L.sleepy) drawHandle(K);
}
function drawHandle(K) {            // a small plate in the corner, a dot when he is hungry
  const X = K.X, T = K.T, c = T.c, n = P.nourrir, x = HANDLE.x + 8, y = HANDLE.y + 8, s = 48;
  X.save(); X.globalAlpha = 0.85;
  K.box(x, y, s, s, c.dim || c.fg, c.bg);
  PF.draw(X, 'pomme', x + 6, y + 6, 3, PF.theme(c), 0);
  if (n.faim) { X.globalAlpha = RM ? 1 : 0.55 + 0.45 * Math.sin(K.now / 320); X.fillStyle = c.accent || c.fg; X.shadowColor = X.fillStyle; X.fillRect(x + s - 8, y - 4, 10, 10); }
  X.restore();
  K.hit(HANDLE.x, HANDLE.y, HANDLE.w, HANDLE.h, () => openTray());
}
function drawTray(K, k) {
  const X = K.X, T = K.T, c = T.c, n = P.nourrir, y0 = Math.round(H - TR.h * k), up = s => (T.upper ? s.toUpperCase() : s);
  X.save(); X.shadowBlur = 0; X.globalAlpha = 0.45 * k; X.fillStyle = c.bg; X.fillRect(0, 0, W, y0); X.restore();
  K.hit(0, 0, W, H, () => closeTray());                                             // a touch above it puts it away
  K.hit(TR.x, y0, TR.w, TR.h, () => {});
  K.box(TR.x, y0, TR.w, TR.h + 8, c.fg, c.bg);
  K.txt(up('À table !'), 26, y0 + 14, 30, c.hi || c.fg, 'left', 'title');
  K.txt(up('Ventre'), 232, y0 + 18, 24, c.dim || c.fg);
  const v = clamp(n.ventre, 0, 100);
  K.bar(316, y0 + 20, 10, v / 10, 18, 18, 4, n.faim >= 2 ? c.pink || c.accent : c.accent || c.fg, c.faint || c.dim);
  K.txt(`${Math.round(v)} %`, 538, y0 + 16, 26, c.fg);
  K.box(656, y0 + 10, 120, 44, c.dim || c.fg, c.bg); K.txt(K.fit(up('Fermer'), 108, 26), 716, y0 + 18, 26, c.fg, 'center');
  K.hit(648, y0, 144, 60, () => closeTray());
  X.drawImage(gridImage(K), TR.gx, y0 + TR.gy, TR.step * 12 - 6, TR.step * 2 - 6);
  PF.FOODS.slice(0, 24).forEach((f, i) => K.hit(TR.gx + (i % 12) * TR.step - 2, y0 + TR.gy + Math.floor(i / 12) * TR.step - 2, TR.cell + 4, TR.cell + 4, () => { closeTray(); feed(f.id); }));
}

/* ---------- the panel (the phone) ---------- */
const THEMES = (() => {
  try {
    const t = window.PixelThemes({ X: document.createElement('canvas').getContext('2d'), RM: true, get now() { return 0; }, blinkP: () => 9, txt() {}, wrap: () => [], fit: s => s });
    return Object.fromEntries(Object.values(t).filter(x => x && x.id && x.c).map(x => [x.id, x.c]));
  } catch { return {}; }
})();
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
// a long word may break between two syllables near its middle, with a hyphen (« crous-tillant », « Élec-tricité »), never anywhere else:
// between two consonants, not inside a consonant + l, r or h, nor gn
const shy = s => s.replace(/\p{L}{10,}/gu, w => {
  const C = ch => !/[aeiouyàâäéèêëîïôöùûüÿœæ]/i.test(ch), m = w.length >> 1;
  for (let d = 0; d < m - 2; d++) for (const i of [m - d, m + d]) {
    const a = w[i - 1], b = w[i]; if (i < 3 || i > w.length - 3 || !C(a) || !C(b)) continue;
    if (/[lrh]/i.test(b) && /[bcdfgkpt]/i.test(a) || (a + b).toLowerCase() === 'gn') continue;
    return w.slice(0, i) + '\u00ad' + w.slice(i);
  }
  return w;
});
const STATE = v => (v >= 92 ? 'Repu' : v >= 55 ? 'Ça va' : v >= 25 ? 'Un petit creux' : 'Très faim');
const hhmm = t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
let pv = null, iconsFor = '';
function icon(id, cls = 'nour-ic') { const c = el('canvas', cls); c.width = c.height = 12; c.dataset.food = id; c.setAttribute('aria-hidden', 'true'); return c; }
function paintIcons(force) {        // the drawings, in the colours of the current theme
  const th = (P && P.view && P.view.theme) || 'retro', c = THEMES[th] || THEMES.retro; if (!c || !pv) return;
  if (!force && iconsFor === th) return; iconsFor = th;
  const col = PF.theme(c);
  pv.root.querySelectorAll('canvas[data-food]').forEach(cv => { const g = cv.getContext('2d'); g.clearRect(0, 0, 12, 12); const s = PF.sprite(cv.dataset.food, col, 0); if (s) g.drawImage(s, 0, 0); });
}
function build() {
  const links = document.querySelector('main.device .kfoot span'), agendas = links && links.querySelector('a[href="app/reglages.html"]');
  if (KIOSK || LAB || !links) return;
  const go = el('button', 'follow nour-go', 'Nourrir'); go.type = 'button'; go.title = 'Donner à manger à Pixel';   // with the other pages, under the keys
  if (agendas) agendas.after(go); else links.append(go);
  const root = el('div', 'nour'); root.id = 'nour'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'nourTitle');
  const sheet = el('div', 'nour-sheet'), head = el('header', 'nour-head'), h2 = el('h2', null, 'Nourrir Pixel'), x = el('button', 'nour-x', '×');
  h2.id = 'nourTitle'; x.type = 'button'; x.setAttribute('aria-label', 'Fermer'); head.append(h2, x);
  const belly = el('section', 'nour-belly'), gauge = el('div', 'nour-gauge'), fill = el('i'), word = el('p', 'nour-word');
  gauge.setAttribute('role', 'meter'); gauge.setAttribute('aria-valuemin', '0'); gauge.setAttribute('aria-valuemax', '100'); gauge.setAttribute('aria-label', 'Son ventre');
  gauge.append(fill); belly.append(el('h3', null, 'Son ventre'), gauge, word);
  const msg = el('p', 'nour-msg'); msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
  const off = el('p', 'nour-off', 'Ses repas sont en pause : il n’a jamais faim et ne mange pas. Réactive-les plus bas, dans Réglages.');
  const menu = el('section', 'nour-menu'); menu.append(el('h3', null, 'Que veux-tu lui donner ?'));
  const foods = {};
  for (const [cat, name] of PF.CATS) {
    const list = PF.FOODS.filter(f => f.cat === cat); if (!list.length) continue;
    const box = el('div', 'nour-cat'); box.append(el('h4', null, name));
    const gridEl = el('div', 'nour-grid');
    for (const f of list) {
      const b = el('button', 'nour-food'); b.type = 'button'; b.dataset.id = f.id;
      b.append(icon(f.id), el('span', 'nour-label', shy(f.label)), el('i', 'nour-tag'));
      b.addEventListener('click', () => { feed(f.id); if (!pv.root.classList.contains('peek') && screenBox()) panel(false); });   // no room to see him eat: the sheet makes way
      foods[f.id] = b; gridEl.append(b);
    }
    box.append(gridEl); menu.append(box);
  }
  const tastes = el('section', 'nour-gouts'); tastes.append(el('h3', null, 'Ses goûts'));
  const dl = el('dl'), row = (t) => { const dt = el('dt', null, t), dd = el('dd'); dl.append(dt, dd); return dd; };
  const fav = row('Son plat préféré'), likes = row('Il aime'), hates = row('Il n’aime pas');
  const roll = el('button', 'nour-btn', 'Changer ses goûts'); roll.type = 'button';
  let rollSure = 0;
  roll.addEventListener('click', () => {
    if (Date.now() < rollSure) { rollSure = 0; roll.textContent = 'Changer ses goûts'; send('nourrir.gouts'); return; }
    rollSure = Date.now() + 4000; roll.textContent = 'Sûr ? Touche encore'; setTimeout(() => { if (Date.now() >= rollSure) roll.textContent = 'Changer ses goûts'; }, 4100);
  });
  tastes.append(dl, roll);
  const journal = el('section', 'nour-journal'), ol = el('ol'); journal.append(el('h3', null, 'Ses derniers repas'), ol);
  const set = el('section', 'nour-set'); set.append(el('h3', null, 'Réglages'));
  const sw = el('label', 'nour-switch'), chk = el('input'); chk.type = 'checkbox'; sw.append(chk, el('span', null, 'Repas activés'));
  chk.addEventListener('change', () => send('nourrir.reglages', { on: chk.checked }));
  const swHint = el('p', 'nour-hint', 'Son ventre se vide doucement dans la journée, jamais la nuit. Quand il a un creux, il te le dit, sans insister. Coupé : il n’a jamais faim et ne mange pas.');
  const seg = el('div', 'nour-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Vitesse de la faim');
  const speeds = {};
  for (const [id, name] of [['lente', 'Lente'], ['normale', 'Normale'], ['rapide', 'Rapide']]) { const b = el('button', null, name); b.type = 'button'; b.addEventListener('click', () => send('nourrir.reglages', { vitesse: id })); speeds[id] = b; seg.append(b); }
  const segLine = el('div', 'nour-line'); segLine.append(el('span', 'nour-lbl', 'Vitesse'), seg);
  set.append(sw, swHint, segLine);
  sheet.append(head, belly, msg, off, menu, tastes, journal, set); root.append(sheet); document.body.append(root);
  pv = { root, go, x, fill, gauge, word, msg, off, menu, foods, fav, likes, hates, ol, chk, speeds, sheet };
  go.addEventListener('click', () => panel(true));
  x.addEventListener('click', () => panel(false));
  root.addEventListener('click', e => { if (e.target === root) panel(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !root.hidden) panel(false); });
  panelDraw();
}
const PEEK_MIN = 300;                 // px the sheet needs under Pixel's screen: its title, his belly and a row of the menu
const screenBox = () => { const c = document.getElementById('crt'); if (!c || c.offsetParent === null) return null; const r = c.getBoundingClientRect(); return r.height > 40 ? r : null; };
function place() {                  // the sheet stops under Pixel's screen (he is seen eating), or fills the screen when there is no room
  if (!pv || pv.root.hidden) return;
  const r = screenBox(), top = r && r.top >= -1 ? Math.ceil(r.bottom + 8) : 0, peek = top > 0 && innerHeight - top >= PEEK_MIN;
  pv.root.classList.toggle('peek', peek); pv.root.style.setProperty('--nour-top', peek ? top + 'px' : '');
}
function panel(open) {
  if (!pv) return;
  if (open) { const r = screenBox(); if (r && r.top < 0) window.scrollBy(0, r.top - 8); }      // his screen in sight first
  pv.root.hidden = !open; document.body.classList.toggle('nour-on', !!open);
  if (open) { place(); paintIcons(true); panelDraw(); pv.x.focus({ preventScroll: true }); } else pv.go.focus({ preventScroll: true });
}
addEventListener('resize', place);
function chips(dd, ids) {
  dd.replaceChildren(...(ids.length ? ids.map(id => { const s = el('span', 'nour-chip'); s.append(icon(id, 'nour-ic small'), document.createTextNode(PF.BY[id].label)); return s; }) : [el('span', 'nour-none', '—')]));
}
let drawnKey = '', chewT = 0;
function panelDraw() {
  if (!pv) return;
  const n = P && P.nourrir;
  pv.go.hidden = !n;
  if (!n) { if (!pv.root.hidden) panel(false); return; }
  if (document.body.classList.contains('poche') && !pv.root.hidden) panel(false);
  const v = clamp(n.ventre, 0, 100), chewing = Date.now() - sentAt < 6000 || (n.dernier && (P.server_now || Date.now()) - n.dernier.t < 6000);
  pv.fill.style.width = v + '%'; pv.gauge.setAttribute('aria-valuenow', String(Math.round(v))); pv.gauge.dataset.faim = String(n.faim | 0);
  pv.word.textContent = n.on ? `${STATE(v)} · ${Math.round(v)} %` : 'Repas en pause';
  pv.off.hidden = !!n.on; pv.root.classList.toggle('is-off', !n.on);
  const d = n.dernier, f = d && PF.BY[d.plat];
  const said = r => { const t = PF.REACTIONS[r] || 'Miam !'; return t.charAt(0).toLowerCase() + t.slice(1); };
  pv.msg.textContent = chewing && f ? `${f.label} : ${said(d.reaction)}` : chewing ? 'Il mange…' : n.on ? 'Touche un plat : il le mange.' : '';
  for (const [id, b] of Object.entries(pv.foods)) {
    b.disabled = !n.on || chewing;
    const tag = b.querySelector('.nour-tag'), g = n.gouts || {}, t = id === g.prefere ? '♥' : (g.deteste || []).includes(id) ? '✕' : '';
    if (tag.textContent !== t) tag.textContent = t;
    b.classList.toggle('fav', id === g.prefere); b.classList.toggle('hate', (g.deteste || []).includes(id));
    b.setAttribute('aria-label', PF.BY[id].label + (id === g.prefere ? ', son plat préféré' : (g.deteste || []).includes(id) ? ', il n’aime pas' : ''));
  }
  const g = n.gouts || {}, key = JSON.stringify([g, n.journal, (P.view || {}).theme]);
  if (key !== drawnKey) {
    drawnKey = key;
    chips(pv.fav, g.prefere ? [g.prefere] : []); chips(pv.likes, (g.aime || []).filter(i => PF.BY[i])); chips(pv.hates, (g.deteste || []).filter(i => PF.BY[i]));
    const items = (n.journal || []).filter(j => PF.BY[j.plat]).map(j => {
      const li = el('li'); li.append(el('time', null, hhmm(j.t)), icon(j.plat, 'nour-ic small'), el('b', null, PF.BY[j.plat].label), el('span', null, PF.REACTIONS[j.reaction] || ''));
      return li;
    });
    pv.ol.replaceChildren(...(items.length ? items : [el('li', 'nour-none', 'Pas encore de repas.')]));
    paintIcons(true);
  } else paintIcons(false);
  pv.chk.checked = !!n.on;
  const sp = (n.reglages && n.reglages.vitesse) || 'normale';
  for (const [id, b] of Object.entries(pv.speeds)) { b.setAttribute('aria-pressed', String(id === sp)); b.disabled = !n.on; }
  clearTimeout(chewT); if (chewing) chewT = setTimeout(panelDraw, 1000);       // the buttons come back once he has eaten
}
build();

return {
  over, swipe(dy, y0) {             // app.js: a vertical swipe on the canvas (dy < 0: up), y0 where it started
    if (!shown()) return false;
    if (tray.open) { if (dy > 0) { closeTray(); return true; } return false; }
    return dy < 0 && y0 > 430 ? openTray() : false;
  },
  open: openTray, close: () => closeTray(), panel, feed, hint,
  get trayOpen() { return tray.open; }, get shown() { return shown(); }, HANDLE, TR,
};
})();
