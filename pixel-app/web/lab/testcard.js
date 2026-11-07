/* Pixel Lab: "Test de l'écran". A test card on its own canvas, stacked over Pixel's screen, to check
   the real 7" 800x480 touch screen: colours, a 1 px grid and the edges hidden by the case, touch
   alignment and multi-touch, and the frame rate of the current theme. It is drawn at 800x480, so in
   kiosk mode on the Pi one canvas px is one screen px. Its loop uses the real clock (PixelClock.raf). */
window.PixelTestCard = (() => {
const cv = document.getElementById('testcard'), X = cv.getContext('2d'), bar = document.getElementById('tcBar'), W = 800, H = 480;
const raf = window.PixelClock ? window.PixelClock.raf : window.requestAnimationFrame.bind(window);
const PAGES = [{ id: 'couleurs', name: 'Couleurs', short: 'Couleurs' }, { id: 'grille', name: 'Grille et bords', short: 'Grille' }, { id: 'toucher', name: 'Toucher', short: 'Toucher' }, { id: 'vitesse', name: 'Images par seconde', short: 'Images/s' }];
const GREEN = '#46ff82', AMBER = '#ffb347', RED = '#ff5c5c', INK = '#e6efe7', DIM = '#8d998f';
const TGT = []; for (const y of [40, 240, 440]) for (const x of [40, 400, 760]) TGT.push({ x, y });
const HUES = ['#46ff82', '#5fd0ff', '#ff7ad0', '#ffd23f', '#b48cff', '#ff8f5c', '#7dffe0', '#ffffff', '#ff5c5c', '#9dff5c'];
let page = null, toolbar = false, running = false, info = () => ({}), onChange = () => {};
let rec = {}, last = null, press = null, lpTimer = 0;
const ptrs = new Map();                                  // pointerId -> { n, x, y, trail }
let seq = 0;
const fr = (v, d = 1) => v.toFixed(d).replace('.', ',');
const sgn = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);

/* ---------- drawing helpers (800x480 logical px, integer rects for crisp 1 px lines) ---------- */
function txt(s, x, y, size = 14, c = INK, al = 'left', w = 400) { X.font = `${w} ${size}px "DejaVu Sans", system-ui, sans-serif`; X.fillStyle = c; X.textAlign = al; X.textBaseline = 'top'; X.fillText(s, x, y); }
const rect = (x, y, w, h, c) => { X.fillStyle = c; X.fillRect(x, y, w, h); };
function frame(i, c) { rect(i, i, W - 2 * i, 1, c); rect(i, H - 1 - i, W - 2 * i, 1, c); rect(i, i, 1, H - 2 * i, c); rect(W - 1 - i, i, 1, H - 2 * i, c); }
function panel(x, y, w, h, a = 0.86) { X.fillStyle = `rgba(6,10,7,${a})`; X.beginPath(); if (X.roundRect) X.roundRect(x, y, w, h, 10); else X.rect(x, y, w, h); X.fill(); X.strokeStyle = 'rgba(255,255,255,.16)'; X.lineWidth = 1; X.stroke(); }
function scale() { const r = cv.getBoundingClientRect(); return r.width ? r.width * (window.devicePixelRatio || 1) / W : 1; }
const grey = v => `rgb(${v},${v},${v})`;

/* ---------- 1. colour bars, grey ramp, gradients, near-black and near-white steps ---------- */
const BARS = [['#ffffff', 'Blanc'], ['#ffff00', 'Jaune'], ['#00ffff', 'Cyan'], ['#00ff00', 'Vert'], ['#ff00ff', 'Magenta'], ['#ff0000', 'Rouge'], ['#0000ff', 'Bleu'], ['#000000', 'Noir']];
function drawColours() {
  rect(0, 0, W, H, '#000');
  BARS.forEach(([c, n], i) => { rect(i * 100, 0, 100, 240, c); txt(n, i * 100 + 50, 214, 14, i < 4 ? '#000' : '#fff', 'center', 600); });
  for (let i = 0; i < 16; i++) { const v = Math.round(i * 255 / 15); rect(i * 50, 240, 50, 60, grey(v)); txt(String(v), i * 50 + 25, 262, 12, v < 128 ? '#fff' : '#000', 'center'); }
  [[255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255]].forEach(([r, g, b], i) => {
    const gr = X.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#000'); gr.addColorStop(1, `rgb(${r},${g},${b})`); X.fillStyle = gr; X.fillRect(0, 300 + i * 15, W, 15);
  });
  const lo = [0, 2, 4, 6, 8, 10, 12, 16], hi = [239, 243, 247, 249, 251, 253, 255];
  lo.forEach((v, i) => { rect(i * 50, 360, 50, 80, grey(v)); txt(String(v), i * 50 + 25, 392, 13, '#6f6f6f', 'center'); });
  hi.forEach((v, i) => { const x = 400 + Math.round(i * 400 / 7), w = 400 + Math.round((i + 1) * 400 / 7) - x; rect(x, 360, w, 80, grey(v)); txt(String(v), x + w / 2, 392, 13, '#8a8a8a', 'center'); });
  txt('NOIRS', 6, 364, 11, '#5a5a5a', 'left', 600); txt('BLANCS', 794, 364, 11, '#9a9a9a', 'right', 600);
  rect(0, 440, W, 40, '#000');
  txt('Mire de couleurs · 800 × 480', 16, 452, 15, INK, 'left', 600);
  txt('Tu dois voir chaque case sombre et chaque case claire.', 784, 453, 14, DIM, 'right');
}

/* ---------- 2. 1 px grid, edge gauges and frames: what the case's window hides ---------- */
const LEN = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32];     // gauge bars: length from the edge in px
function drawGrid() {
  rect(0, 0, W, H, '#000');
  for (let x = 0; x < W; x += 10) rect(x, 0, 1, H, x % 100 === 0 ? '#4a4a4a' : x % 50 === 0 ? '#2e2e2e' : '#171717');
  for (let y = 0; y < H; y += 10) rect(0, y, W, 1, y % 100 === 0 ? '#4a4a4a' : y % 50 === 0 ? '#2e2e2e' : '#171717');
  for (let x = 100; x < W; x += 100) txt(String(x), x + 3, 92, 11, '#7d7d7d');
  for (let y = 100; y < H; y += 100) txt(String(y), 92, y + 3, 11, '#7d7d7d');
  [[0, '#ff3b3b'], [2, '#ffd000'], [4, '#3bff6a'], [8, '#33c8ff'], [16, '#ff5ad1']].forEach(([i, c]) => frame(i, c));
  const n = LEN.length, gx = Math.round(W / 2 - (n * 26 - 6) / 2), gy = Math.round(H / 2 - (n * 16 - 4) / 2);
  LEN.forEach((v, k) => {
    const c = k % 2 ? '#ffffff' : '#ffd000', x = gx + k * 26, y = gy + k * 16;
    rect(x, 0, 20, v, c); rect(x, H - v, 20, v, c);                // top and bottom edges
    rect(0, y, v, 12, c); rect(W - v, y, v, 12, c);                // left and right edges
    txt(String(v), x + 10, 38, 12, INK, 'center', 600); txt(String(v), x + 10, H - 52, 12, INK, 'center', 600);
    txt(String(v), 40, y, 12, INK, 'left', 600); txt(String(v), W - 40, y, 12, INK, 'right', 600);
  });
  for (const [x, y, sx, sy] of [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]]) {       // corner L marks at 24 px
    rect(sx > 0 ? x + 24 : x - 64, sy > 0 ? y + 24 : y - 25, 40, 1, '#fff'); rect(sx > 0 ? x + 24 : x - 25, sy > 0 ? y + 24 : y - 64, 1, 40, '#fff');
  }
  rect(380, 240, 41, 1, GREEN); rect(400, 220, 1, 41, GREEN);
  panel(200, 300, 400, 104);
  txt('Grille 1 px · 800 × 480', 400, 312, 16, INK, 'center', 700);
  txt('Chaque barre part du bord. Son chiffre = sa longueur en px.', 400, 338, 13, INK, 'center');
  txt('Une barre qui manque : le cadre cache au moins ça.', 400, 358, 13, INK, 'center');
  const k = scale();
  txt(Math.abs(k - 1) < 0.02 ? 'Échelle 1 : 1 px de la mire = 1 px de l’écran.' : `Échelle ${fr(k, 2)} : lance-la sur Pixel, en plein écran.`, 400, 380, 12, Math.abs(k - 1) < 0.02 ? GREEN : AMBER, 'center');
}

/* ---------- 3. touch: 9 targets, every finger with its coordinates ---------- */
function drawTouch() {
  rect(0, 0, W, H, '#0b0f0c');
  for (let x = 0; x < W; x += 50) rect(x, 0, 1, H, x % 100 ? '#152017' : '#1f2e22');
  for (let y = 0; y < H; y += 50) rect(0, y, W, 1, y % 100 ? '#152017' : '#1f2e22');
  TGT.forEach((t, i) => {
    const r = rec[i], c = !r ? '#8a9a8d' : Math.hypot(r.dx, r.dy) <= 6 ? GREEN : AMBER;
    X.strokeStyle = c; X.lineWidth = r ? 3 : 2; X.beginPath(); X.arc(t.x, t.y, 14, 0, Math.PI * 2); X.stroke();
    rect(t.x - 22, t.y, 45, 1, c); rect(t.x, t.y - 22, 1, 45, c);
    if (r) {
      const side = t.x < 100 || t.x > 700, al = t.x < 100 ? 'left' : t.x > 700 ? 'right' : 'center';   // beside the target on the sides, so a finger's label doesn't cover it
      const tx = t.x < 100 ? t.x + 26 : t.x > 700 ? t.x - 26 : t.x, ty = side ? t.y - 8 : t.y > 400 ? t.y - 44 : t.y + 26;
      txt(`${sgn(r.dx)}, ${sgn(r.dy)} px`, tx, ty, 15, c, al, 700);
    }
  });
  const done = Object.keys(rec).length, good = Object.values(rec).filter(r => Math.hypot(r.dx, r.dy) <= 6).length;
  txt("Touche le centre de chaque cible. L'écart s'affiche en pixels.", 400, 104, 16, INK, 'center', 600);
  txt(`${done} / 9 cibles · ${good} à moins de 6 px`, 400, 128, 14, DIM, 'center');
  const n = ptrs.size; txt(n ? `${n} doigt${n > 1 ? 's' : ''}` : 'Aucun doigt', 400, 152, 20, n ? GREEN : DIM, 'center', 700);
  txt(last ? `Dernier toucher : ${last.x}, ${last.y}` : 'Dernier toucher : aucun', 400, 178, 14, INK, 'center');
  for (const p of ptrs.values()) {
    const c = HUES[(p.n - 1) % HUES.length];
    p.trail.forEach((q, i) => { X.globalAlpha = (i + 1) / p.trail.length * 0.5; rect(Math.round(q.x) - 2, Math.round(q.y) - 2, 4, 4, c); });
    X.globalAlpha = 1; X.strokeStyle = c; X.lineWidth = 3; X.beginPath(); X.arc(p.x, p.y, 28, 0, Math.PI * 2); X.stroke();
    rect(Math.round(p.x) - 40, Math.round(p.y), 81, 1, c); rect(Math.round(p.x), Math.round(p.y) - 40, 1, 81, c);
    const lx = p.x > W - 170 ? p.x - 34 : p.x + 34, ly = p.y < 64 ? p.y + 34 : p.y - 50, al = p.x > W - 170 ? 'right' : 'left';
    const s = `#${p.n} · ${Math.round(p.x)}, ${Math.round(p.y)}`; X.font = '700 16px "DejaVu Sans", system-ui, sans-serif'; const w = X.measureText(s).width;
    panel(al === 'left' ? lx - 6 : lx - w - 6, ly - 4, w + 12, 26, 0.75); txt(s, lx, ly, 16, c, al, 700);
  }
}

/* ---------- 4. frame rate of Pixel's own loop, over the live screen ---------- */
function drawSpeed() {
  X.clearRect(0, 0, W, H);
  const C = window.PixelClock, st = C ? C.stats() : { fps: 0, drawMs: 0, frames: [] }, i = info() || {};
  panel(16, 16, 336, 190);
  const SL = typeof Screens !== 'undefined' ? Screens.local : null, want = SL ? (SL.full ? 60 : SL.fpsWant || 60) : 60;   // the rate screens.js asks for right now
  txt(String(Math.round(st.fps)), 32, 26, 44, st.fps >= want * 0.9 ? GREEN : st.fps >= want * 0.5 ? AMBER : RED, 'left', 700);
  X.font = '700 44px "DejaVu Sans", system-ui, sans-serif'; txt('images/s', 40 + X.measureText(String(Math.round(st.fps))).width, 46, 18, INK, 'left', 600);
  txt(`Dessin : ${fr(st.drawMs)} ms par image · voulu : ${want} im/s`, 32, 80, 16, INK);
  txt([i.theme, i.screen, i.speed].filter(Boolean).join(' · '), 32, 102, 14, DIM);
  if (C && C.paused) txt("En pause : l'image ne bouge pas", 32, 122, 14, AMBER, 'left', 600);
  const gx = 32, gy = 192, gh = 60, k = gh / 33.4;                  // 0..33,4 ms -> 0..60 px
  rect(gx, gy, 304, 1, '#3a463c');
  st.frames.forEach((f, j) => { const h = Math.max(1, Math.min(gh, f.d * k)); rect(gx + j * 2.5, gy - h, 2, h, f.d <= 8 ? GREEN : f.d <= 16.7 ? AMBER : RED); });
  X.strokeStyle = 'rgba(255,255,255,.6)'; X.lineWidth = 1; X.setLineDash([4, 4]); X.beginPath(); X.moveTo(gx, gy - 30.5); X.lineTo(gx + 304, gy - 30.5); X.stroke(); X.setLineDash([]);
  txt('16,7 ms = 60 images/s', gx + 304, gy - 46, 11, INK, 'right');
}

const DRAW = { couleurs: drawColours, grille: drawGrid, toucher: drawTouch, vitesse: drawSpeed };
function tick() { if (!page) { running = false; return; } X.setTransform(1, 0, 0, 1, 0, 0); X.globalAlpha = 1; DRAW[page](); raf(tick); }

/* ---------- toolbar (kiosk mode): pages, reset, hide, close ---------- */
function renderBar() {
  bar.replaceChildren();
  const b = (label, on, attrs = {}) => { const e = document.createElement('button'); e.type = 'button'; e.textContent = label; Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); e.addEventListener('click', ev => { ev.stopPropagation(); on(); }); bar.append(e); return e; };
  PAGES.forEach(p => b(p.short, () => api.open(p.id), { 'data-page': p.id, 'aria-pressed': String(p.id === page), 'aria-label': p.name }));
  if (page === 'toucher') b('Remettre à zéro', () => api.reset(), { 'data-tc': 'reset' });
  b('Masquer', () => { bar.hidden = true; }, { 'data-tc': 'hide' });
  b('Fermer', () => api.close(), { 'data-tc': 'close' });
  bar.style.top = page === 'toucher' ? '68%' : '50%';
}

/* ---------- pointers ---------- */
function pos(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
const tracked = e => e.pointerType !== 'mouse' || e.buttons > 0;
cv.addEventListener('pointerdown', e => {
  const p = pos(e);
  if (!press) { press = { id: e.pointerId, x: p.x, y: p.y, moved: false, long: false }; clearTimeout(lpTimer); if (toolbar) lpTimer = setTimeout(() => { if (press && !press.moved) { press.long = true; bar.hidden = false; } }, 1000); }
  if (page !== 'toucher') return;
  try { cv.setPointerCapture(e.pointerId); } catch {}
  ptrs.set(e.pointerId, { n: ++seq > 99 ? (seq = 1) : seq, x: p.x, y: p.y, trail: [p] });
  last = { x: Math.round(p.x), y: Math.round(p.y) };
  let best = -1, bd = 46; TGT.forEach((t, i) => { const d = Math.hypot(p.x - t.x, p.y - t.y); if (d < bd) { bd = d; best = i; } });
  if (best >= 0) rec[best] = { dx: Math.round(p.x - TGT[best].x), dy: Math.round(p.y - TGT[best].y) };
});
cv.addEventListener('pointermove', e => {
  const p = pos(e);
  if (press && press.id === e.pointerId && Math.hypot(p.x - press.x, p.y - press.y) > (press.long ? 1e9 : 15)) { press.moved = true; clearTimeout(lpTimer); }
  const q = ptrs.get(e.pointerId); if (!q || !tracked(e)) return;
  q.x = p.x; q.y = p.y; q.trail.push(p); if (q.trail.length > 24) q.trail.shift();
});
function up(e) {
  ptrs.delete(e.pointerId);
  if (!press || press.id !== e.pointerId) return;
  clearTimeout(lpTimer);
  const p = pos(e), tap = !press.long && Math.hypot(p.x - press.x, p.y - press.y) < 10;
  if (toolbar && tap && page && page !== 'toucher' && e.type === 'pointerup') bar.hidden = !bar.hidden;
  press = null;
}
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) cv.addEventListener(ev, up);

const api = {
  pages: PAGES,
  init(o = {}) { if (typeof o.info === 'function') info = o.info; if (typeof o.onChange === 'function') onChange = o.onChange; },
  open(id = 'couleurs', opts) {
    if (!DRAW[id]) id = 'couleurs';
    if (opts && 'toolbar' in opts) toolbar = !!opts.toolbar; else if (!page) toolbar = false;
    const changed = id !== page; page = id; cv.hidden = false;
    if (toolbar) { renderBar(); bar.hidden = false; } else bar.hidden = true;
    if (!running) { running = true; raf(tick); }
    if (changed) onChange(page);
  },
  close() { if (!page) return; page = null; cv.hidden = true; bar.hidden = true; ptrs.clear(); press = null; clearTimeout(lpTimer); onChange(null); },
  next(d = 1) { const i = PAGES.findIndex(p => p.id === page), n = PAGES.length; api.open(PAGES[((i < 0 ? 0 : i + d) % n + n) % n].id); },
  reset() { rec = {}; last = null; ptrs.clear(); },
  get page() { return page; },
  _debug: () => ({ page, toolbar, barHidden: bar.hidden, pointers: [...ptrs.values()].map(p => ({ n: p.n, x: Math.round(p.x), y: Math.round(p.y) })), records: { ...rec }, last }),
};
return api;
})();
