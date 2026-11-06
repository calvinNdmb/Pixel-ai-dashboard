/* Pixel OS themes. Each theme draws the background, headers, panels, bars, icons and the face.
   retro: green CRT, pixel blocks. moderne: smooth glowing eyes that bounce. manga: big shiny anime eyes on paper. */
/* Every face mood that every theme can draw. Used by the server, the Stream Deck and the test lab:
   add new moods here (id = ascii, used in commands; name = French label; desc = when it shows). */
window.PixelMoods = [
  { id: 'neutre', name: 'Neutre', desc: 'Par défaut : cligne des yeux, regarde autour de lui, suit ton doigt.' },
  { id: 'content', name: 'Content', desc: 'Quand tu le touches, quand Codex réussit.' },
  { id: 'surpris', name: 'Surpris', desc: 'Notification, fin du minuteur, réveil en sursaut.' },
  { id: 'amoureux', name: 'Amoureux', desc: 'Quand tu lui dis merci.' },
  { id: 'clin', name: "Clin d'œil", desc: 'Après une blague.' },
  { id: 'endormi', name: 'Endormi', desc: 'Après un moment sans rien faire.' },
  { id: 'reflechit', name: 'Réfléchit', desc: 'Pendant que Claude prépare sa réponse.' },
  { id: 'ecoute', name: 'Écoute', desc: 'Pendant que tu parles à Claude.' },
];

window.PixelThemes = H => {
const X = H.X, W = 800, HT = 480, TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function rr(x, y, w, h, r) { X.beginPath(); if (X.roundRect) X.roundRect(x, y, w, Math.max(0, h), Math.max(0, Math.min(r, w / 2, h / 2))); else X.rect(x, y, w, h); }
function ell(x, y, rx, ry) { X.beginPath(); X.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU); }
function heart(x, y, s) {
  X.beginPath(); X.moveTo(x, y + s * 0.95);
  X.bezierCurveTo(x - s * 1.35, y + s * 0.1, x - s * 0.95, y - s * 1.05, x, y - s * 0.35);
  X.bezierCurveTo(x + s * 0.95, y - s * 1.05, x + s * 1.35, y + s * 0.1, x, y + s * 0.95); X.closePath();
}
function star(x, y, r, points = 4, inner = 0.3) { X.beginPath(); for (let i = 0; i < points * 2; i++) { const a = i / (points * 2) * TAU - Math.PI / 2, d = i % 2 ? r * inner : r; X.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); } X.closePath(); }
function cloudPath(x, y, k) {   // puffy cloud centred on x, y; k = scale (1 = 180 px wide)
  X.beginPath();
  for (const [dx, dy, r] of [[-52, 14, 34], [-14, -14, 46], [34, -2, 38], [62, 22, 26]]) { X.moveTo(x + (dx + r) * k, y + dy * k); X.arc(x + dx * k, y + dy * k, r * k, 0, TAU); }
  X.rect(x - 52 * k, y + 14 * k, 114 * k, 34 * k);
}
const hexA = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
const blink = () => { const p = H.blinkP(); return p >= 0 && p < 1 ? Math.sin(p * Math.PI) : 0; };   // 0 open .. 1 closed

/* =================== RETRO =================== */
const R = { fg: '#46ff82', dim: '#1e7840', faint: '#0d3019', bg: '#061009', accent: '#ffb347', pink: '#ff7aa8', hi: '#d6ffe2' };
function px(x, y, s, c) { X.shadowColor = c; X.fillStyle = c; X.fillRect(x + 1, y + 1, s - 2, s - 2); }
function bmp(rows, x, y, s, c) {
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
    const v = rows[j][i]; if (v === '.' || v === ' ') continue;
    px(x + i * s, y + j * s, s, v === 'p' ? R.pink : v === 'a' ? R.accent : v === 'w' ? R.hi : c);
  }
}
const EYE = { o: ['.###.', '#w###', '#####', '#####', '#####', '.###.'], big: ['.###.', '#####', '#w###', '#####', '#####', '#####', '.###.'],
  arc: ['.....', '.###.', '#...#', '#...#', '.....', '.....'], shut: ['.....', '.....', '.....', '#####', '.....', '.....'], heart: ['.p.p.', 'ppppp', 'ppppp', '.ppp.', '..p..', '.....'] };
const MOUTH = { smile: ['#...#', '.###.'], big: ['#.....#', '.#...#.', '..###..'], flat: ['#####'], O: ['.##.', '#..#', '#..#', '.##.'], o: ['.#.', '#.#', '.#.'] };
const PHEART = ['.p.p.', 'ppppp', '.ppp.', '..p..'], BULB = ['.###.', '#####', '#####', '.###.', '.....', '.###.'], CLOUD = ['...###....', '..#####.##', '.#########', '##########', '.########.'];
const MINI = { soleil: ['a.a.a', '.aaa.', 'aaaaa', '.aaa.', 'a.a.a'], nuage: ['.##..', '####.', '#####', '.....', '.....'], pluie: ['.##..', '####.', '#####', '.#.#.', '#.#..'],
  neige: ['.##..', '####.', '#####', 'w.w.w', '.w.w.'], orage: ['.##..', '####.', '#####', '..a..', '.a...'] };
const DIG = { 0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'], 3: ['###', '..#', '###', '..#', '###'], 4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '###', '..#', '###'], 6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '###'], ':': ['.', '#', '.', '#', '.'] };
function retroSun(cx, cy, u) {
  for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) if (i * i + j * j <= 18) px(cx + i * u, cy + j * u, u, R.accent);
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + H.now / 2200; for (let r = 0; r < (k % 2 ? 2 : 3); r++) px(cx + Math.round(Math.cos(a) * (6 + r)) * u, cy + Math.round(Math.sin(a) * (6 + r)) * u, u, R.accent); }
}
const retro = {
  id: 'retro', name: 'Rétro', c: R, glow: 10, bubbles: false, qr: ['#e4ffe9', R.bg],
  font: (s, k) => `${Math.round(s)}px VT323, "DejaVu Sans Mono", monospace`,
  bg() { X.fillStyle = R.bg; X.fillRect(0, 0, W, HT); },
  header(title, clock) { H.txt('PIXEL OS', 24, 12, 26, R.dim); H.txt('> ' + title.toUpperCase(), 132, 12, 26, R.fg); H.txt(clock, W - 24, 12, 26, R.dim, 'right'); X.fillStyle = R.dim; X.shadowColor = R.dim; X.fillRect(20, 44, W - 40, 3); },
  box(x, y, w, h, c = R.fg, fill) { if (fill) { X.fillStyle = fill; X.shadowColor = fill; X.fillRect(x, y, w, h); } X.strokeStyle = c; X.shadowColor = c; X.lineWidth = 2; X.strokeRect(x + 1, y + 1, w - 2, h - 2); },
  bar(x, y, n, filled, w, h, gap, on = R.fg, off = R.faint) { for (let i = 0; i < n; i++) { const f = clamp(filled - i, 0, 1); X.fillStyle = off; X.shadowColor = off; X.fillRect(x + i * (w + gap), y, w, h); if (f > 0) { X.fillStyle = on; X.shadowColor = on; X.fillRect(x + i * (w + gap), y, w * f, h); } } },
  bubble() {},
  bulb(cx, cy, on, i) {
    if (on) { X.globalAlpha = 0.25 + 0.2 * Math.sin(H.now / 500 + i); X.fillStyle = R.accent; X.shadowColor = R.accent; X.beginPath(); X.arc(cx, cy, 24, 0, 7); X.fill(); X.globalAlpha = 1; }
    bmp(BULB, cx - 18, cy - 20, 7, on ? R.accent : R.faint);
  },
  weather(kind, cx, cy, size, active) {
    if (size === 'mini') return bmp(MINI[kind] || MINI.nuage, cx - 15, cy - 15, 6, active ? R.fg : R.dim);
    const dx = cx - 180, dy = cy - 200, now = H.now;
    if (kind === 'soleil') return retroSun(cx, cy - 10, 12);
    if (kind === 'nuage') retroSun(230 + dx, 150 + dy, 8);
    bmp(CLOUD, 70 + dx + Math.round(Math.sin(now / 1400) * 2) * 9, 150 + dy, 22, kind === 'nuage' ? R.hi : R.dim);
    if (kind === 'pluie') for (let k = 0; k < 16; k++) { const p = (now / 700 + k * 0.137) % 1, x = 84 + dx + (k * 47) % 200; px(x, 270 + dy + p * 70, 8, R.fg); px(x, 278 + dy + p * 70, 8, R.fg); }
    if (kind === 'neige') for (let k = 0; k < 14; k++) { const p = (now / 2600 + k * 0.17) % 1, x = 84 + dx + (k * 53) % 200 + Math.sin(now / 500 + k) * 6; px(x, 266 + dy + p * 74, 8, R.hi); }
    if (kind === 'orage' && Math.floor(now / 160) % 9 === 0) bmp(['..##', '.##.', '####', '.##.', '##..'], 160 + dx, 262 + dy, 10, R.accent);
  },
  digits(str, cx, y, col) {
    const u = 20; let w = -u; for (const ch of str) w += DIG[ch][0].length * u + u;
    let x = cx - w / 2; for (const ch of str) { bmp(DIG[ch], x, y, u, col); x += DIG[ch][0].length * u + u; }
  },
  star(x, y, sz, near) { X.fillStyle = near ? R.fg : R.dim; X.fillRect(x, y, sz, sz); },
  face(cx, cy, s, md, lx = 0, ly = 0) {
    if (md === 'content') cy -= Math.round(Math.abs(Math.sin(H.now / 240)) * 0.8) * s;
    let Le = 'o', Ri = 'o', M = 'smile', cheeks = true;
    switch (md) {
      case 'content': Le = Ri = 'arc'; M = 'big'; break;
      case 'surpris': Le = Ri = 'big'; M = 'O'; cheeks = false; break;
      case 'amoureux': Le = Ri = 'heart'; M = 'big'; break;
      case 'clin': Ri = 'arc'; M = 'big'; break;
      case 'endormi': Le = Ri = 'shut'; M = 'o'; cheeks = false; break;
      case 'reflechit': M = 'flat'; cheeks = false; break;
      case 'ecoute': M = null; break;
    }
    if (H.blinkP() < 0.83 && H.blinkP() >= 0) { if (Le === 'o' || Le === 'big') Le = 'shut'; if (Ri === 'o' || Ri === 'big') Ri = 'shut'; }
    const ex = Math.round(lx) * s, ey = Math.round(ly) * s, now = H.now;
    bmp(EYE[Le], cx - 10.5 * s + ex, cy - (EYE[Le].length > 6 ? 6.5 : 6) * s + ey, s, R.fg);
    bmp(EYE[Ri], cx + 5.5 * s + ex, cy - (EYE[Ri].length > 6 ? 6.5 : 6) * s + ey, s, R.fg);
    if (M) { const m = MOUTH[M]; bmp(m, cx - m[0].length * s / 2 + Math.round(lx / 2) * s, cy + 3.5 * s, s, R.fg); }
    else for (let i = 0; i < 7; i++) { const h = Math.round((0.5 + 0.5 * Math.sin(now / 85 + i * 1.9)) * 2.2 * Math.sin((i + 0.5) / 7 * Math.PI)); for (let k = -h; k <= h; k++) px(cx - 3.5 * s + i * s, cy + 4.5 * s + k * s, s, R.fg); }
    if (cheeks) for (let c = 0; c < 3; c++) { px(cx - 15.5 * s + c * s, cy + 2.5 * s, s, R.pink); px(cx + 12.5 * s + c * s, cy + 2.5 * s, s, R.pink); }
    if (md === 'endormi') for (let k = 0; k < 3; k++) { const p = (now / 1500 + k / 3) % 1; X.globalAlpha = 1 - p; H.txt('z', cx + 9 * s + p * 4 * s, cy - 8 * s - p * 6 * s, Math.round((1.6 + p * 2) * s), R.fg); X.globalAlpha = 1; }
    if (md === 'amoureux') for (let k = 0; k < 3; k++) { const p = (now / 1800 + k / 3) % 1; X.globalAlpha = 1 - p; bmp(PHEART, cx + [-17, 14, 2][k] * s, cy - 2 * s - p * 9 * s, Math.max(2, Math.round(s * 0.45)), R.pink); X.globalAlpha = 1; }
    if (md === 'reflechit') { const n = Math.floor(now / 380) % 4; for (let i = 0; i < n; i++) px(cx + 10 * s + i * 1.7 * s, cy - 9.5 * s, s, R.fg); }
    if (md === 'surpris') bmp(['#', '#', '#', '.', '#'], cx + 13 * s, cy - 11 * s, s, R.accent);
  },
};

/* =================== MODERNE =================== */
const M = { fg: '#7ff3ff', dim: '#8a93b8', faint: '#262d4d', bg: '#0c1124', accent: '#ffb86b', pink: '#ff8fb1', hi: '#f4f7ff' };
function modCloud(x, y, k, fill, alpha = 1) { X.save(); X.globalAlpha = alpha; X.fillStyle = fill; X.shadowColor = 'rgba(0,0,0,0.35)'; X.shadowBlur = 18 * k; X.shadowOffsetY = 6 * k; cloudPath(x, y, k); X.fill(); X.restore(); }
function modSun(x, y, k) {
  X.save();
  const g = X.createRadialGradient(x, y, 0, x, y, 110 * k); g.addColorStop(0, 'rgba(255,200,110,0.45)'); g.addColorStop(1, 'rgba(255,200,110,0)');
  X.fillStyle = g; X.fillRect(x - 110 * k, y - 110 * k, 220 * k, 220 * k);
  X.strokeStyle = '#ffcf7a'; X.lineCap = 'round'; X.lineWidth = 9 * k;
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + H.now / 3000, l = (12 + 5 * Math.sin(H.now / 400 + i)) * k; X.beginPath(); X.moveTo(x + Math.cos(a) * 66 * k, y + Math.sin(a) * 66 * k); X.lineTo(x + Math.cos(a) * (66 * k + l), y + Math.sin(a) * (66 * k + l)); X.stroke(); }
  const s = X.createLinearGradient(x, y - 50 * k, x, y + 50 * k); s.addColorStop(0, '#ffe29a'); s.addColorStop(1, '#ffa95e');
  X.fillStyle = s; ell(x, y, 50 * k, 50 * k); X.fill(); X.restore();
}
function modFace(cx, cy, u, md, lx = 0, ly = 0) {
  const t = H.now, glow = H.RM ? 0 : 26 * u / 16;
  let sq = 0, lift = 0;
  const ht = t % 5200;                                         // a little hop every few seconds
  if (ht < 900) { sq = Math.exp(-ht / 220) * Math.sin(ht / 42); lift = Math.max(0, Math.sin(Math.min(1, ht / 420) * Math.PI)) * 1.1; }
  if (md === 'content') { const p = t % 760; sq = 0.7 * Math.exp(-p / 170) * Math.sin(p / 34); lift = Math.abs(Math.sin(t / 380 * Math.PI)) * 1.0; }
  if (md === 'surpris') { lift = 1.2; sq = -0.25; }
  cy += -lift * u + Math.sin(t / 900) * 0.25 * u;                // floats gently
  const ew = 7 * u * (1 + 0.17 * sq), eh = 9 * u * (1 - 0.17 * sq) * (1 + 0.025 * Math.sin(t / 650));
  const bl = ['neutre', 'ecoute', 'reflechit', 'surpris', 'clin'].includes(md) ? blink() : 0;
  const ex = lx * 1.35 * u, ey = ly * 1.15 * u, Lx = cx - 8.5 * u + ex, Rx = cx + 8.5 * u + ex, Ey = cy - 2.5 * u + ey;
  const pill = (x, w, h) => { rr(x - w / 2, Ey - h / 2, w, h, Math.min(w, h) * 0.44); X.fill(); };
  const happy = x => { X.lineWidth = 2.1 * u; X.beginPath(); X.arc(x, Ey + 1.6 * u, 3.3 * u, Math.PI * 1.13, Math.PI * 1.87); X.stroke(); };
  const sleepy = x => { X.lineWidth = 1.4 * u; X.beginPath(); X.arc(x, Ey - 0.4 * u, 3.1 * u, Math.PI * 0.16, Math.PI * 0.84); X.stroke(); };
  X.save(); X.fillStyle = X.strokeStyle = M.fg; X.shadowColor = M.fg; X.shadowBlur = glow; X.lineCap = 'round';
  if (md === 'content') { happy(Lx); happy(Rx); }
  else if (md === 'clin') { pill(Lx, ew, eh * (1 - 0.93 * bl)); happy(Rx); }
  else if (md === 'endormi') { sleepy(Lx); sleepy(Rx); }
  else if (md === 'amoureux') { const k = 1 + 0.1 * Math.sin(t / 170); X.fillStyle = M.pink; X.shadowColor = M.pink; heart(Lx, Ey, 4.3 * u * k); X.fill(); heart(Rx, Ey, 4.3 * u * k); X.fill(); }
  else if (md === 'surpris') { ell(Lx, Ey, 4.7 * u, 4.7 * u * (1 - 0.9 * bl)); X.fill(); ell(Rx, Ey, 4.7 * u, 4.7 * u * (1 - 0.9 * bl)); X.fill(); }
  else { const k = md === 'reflechit' ? 0.62 : 1; pill(Lx, ew, eh * k * (1 - 0.93 * bl)); pill(Rx, ew, eh * k * (1 - 0.93 * bl)); }
  if (['neutre', 'ecoute', 'reflechit', 'surpris'].includes(md) && bl < 0.4) {      // shine
    X.shadowBlur = 0; X.fillStyle = 'rgba(255,255,255,0.9)';
    for (const x of [Lx, Rx]) { ell(x - ew * 0.17, Ey - eh * 0.2, 0.95 * u, 1.2 * u); X.fill(); ell(x + ew * 0.15, Ey + eh * 0.12, 0.45 * u, 0.45 * u); X.fill(); }
  }
  if (md === 'clin') { X.fillStyle = M.hi; X.shadowColor = M.hi; star(Rx + 4.8 * u, Ey - 4.6 * u, (1.3 + 0.35 * Math.sin(t / 140)) * u); X.fill(); }
  X.restore();
  X.save(); X.strokeStyle = X.fillStyle = M.fg; X.shadowColor = M.fg; X.shadowBlur = glow * 0.5; X.lineCap = 'round'; X.lineWidth = 0.95 * u;
  const mx = cx + lx * 0.6 * u, my = cy + 5.3 * u + ey * 0.4;
  if (md === 'ecoute') for (let i = 0; i < 7; i++) { const h = (0.6 + 2 * (0.5 + 0.5 * Math.sin(t / 90 + i * 1.9)) * Math.sin((i + 0.5) / 7 * Math.PI)) * u; rr(mx - 3.7 * u + i * 1.07 * u, my - h / 2, 0.72 * u, h, 0.36 * u); X.fill(); }
  else if (md === 'surpris') { ell(mx, my + 0.4 * u, 1.3 * u, 1.65 * u); X.stroke(); }
  else if (md === 'endormi') { X.lineWidth = 0.75 * u; ell(mx, my + 0.3 * u, 0.85 * u, 0.85 * u * (0.75 + 0.25 * Math.sin(t / 800))); X.stroke(); }
  else if (md === 'reflechit') { X.beginPath(); X.moveTo(mx - 1.6 * u, my + 0.5 * u); X.quadraticCurveTo(mx, my - 0.2 * u, mx + 1.7 * u, my + 0.1 * u); X.stroke(); }
  else { const big = ['content', 'amoureux', 'clin'].includes(md); X.beginPath(); X.arc(mx, my - (big ? 1.7 : 1.3) * u, (big ? 2.7 : 1.8) * u, 0.18 * Math.PI, 0.82 * Math.PI); X.stroke(); }
  X.restore();
  if (!['surpris', 'reflechit', 'endormi'].includes(md)) for (const sx of [-1, 1]) {
    const x = cx + sx * 13.4 * u, y = cy + 3.4 * u, g = X.createRadialGradient(x, y, 0, x, y, 3 * u);
    g.addColorStop(0, 'rgba(255,143,177,0.6)'); g.addColorStop(1, 'rgba(255,143,177,0)'); X.fillStyle = g; X.fillRect(x - 3 * u, y - 3 * u, 6 * u, 6 * u);
  }
  if (md === 'endormi') for (let k = 0; k < 3; k++) { const p = (t / 1800 + k / 3) % 1; X.globalAlpha = (1 - p) * 0.9; H.txt('z', cx + 9 * u + p * 4 * u, cy - 6 * u - p * 6 * u, (1.6 + p * 1.8) * u, M.hi, 'left', 'title'); X.globalAlpha = 1; }
  if (md === 'amoureux') for (let k = 0; k < 4; k++) { const p = (t / 2000 + k / 4) % 1; X.globalAlpha = 1 - p; X.fillStyle = M.pink; heart(cx + [-17, 15, -5, 7][k] * u + Math.sin(t / 300 + k) * u, cy - 1 * u - p * 10 * u, (0.8 + p * 0.5) * u); X.fill(); X.globalAlpha = 1; }
  if (md === 'reflechit') for (let i = 0; i < 3; i++) { X.globalAlpha = 0.25 + 0.75 * ((Math.floor(t / 300) % 3) === i ? 1 : 0.2); X.fillStyle = M.hi; ell(cx + 10.5 * u + i * 2.3 * u, cy - 9.5 * u, 0.8 * u, 0.8 * u); X.fill(); X.globalAlpha = 1; }
  if (md === 'surpris') H.txt('!', cx + 12.5 * u, cy - 13 * u, 4.5 * u, M.accent, 'left', 'title');
}
const moderne = {
  id: 'moderne', name: 'Moderne', c: M, glow: 0, bubbles: true, qr: ['#ffffff', '#0c1124'],
  font: (s, k) => k === 'title' ? `600 ${Math.round(s * 0.8)}px Fredoka, "DejaVu Sans", sans-serif` : `500 ${Math.round(s * 0.76)}px Fredoka, "DejaVu Sans", sans-serif`,
  bg() {
    const g = X.createLinearGradient(0, 0, 0, HT); g.addColorStop(0, '#151c3a'); g.addColorStop(1, '#090d1c'); X.fillStyle = g; X.fillRect(0, 0, W, HT);
    const t = H.now / 1000;
    [['127,243,255', 0], ['255,143,177', 2], ['255,184,107', 4]].forEach(([c, i]) => {
      const x = W * (0.15 + 0.7 * (Math.sin(t * 0.07 + i) + 1) / 2), y = HT * (0.2 + 0.6 * (Math.cos(t * 0.05 + i * 1.7) + 1) / 2), r = 190;
      const rg = X.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, `rgba(${c},0.09)`); rg.addColorStop(1, `rgba(${c},0)`); X.fillStyle = rg; X.fillRect(x - r, y - r, 2 * r, 2 * r);
    });
  },
  header(title, clock) {
    X.fillStyle = M.fg; ell(30, 29, 6, 6); X.fill();
    H.txt(title, 46, 13, 34, M.hi, 'left', 'title'); H.txt(clock, W - 24, 15, 30, M.dim, 'right', 'title');
    X.fillStyle = 'rgba(255,255,255,0.08)'; rr(20, 50, W - 40, 2, 1); X.fill();
  },
  box(x, y, w, h, c = M.fg, fill) {
    rr(x, y, w, h, Math.min(16, h / 2));
    X.fillStyle = fill === M.bg ? 'rgba(16,22,46,0.97)' : fill === M.faint || !fill ? 'rgba(255,255,255,0.06)' : hexA(fill, 0.22); X.fill();
    X.lineWidth = 2; X.strokeStyle = hexA(c, c === M.dim ? 0.25 : 0.65); X.stroke();
  },
  bar(x, y, n, filled, w, h, gap, on = M.fg) {
    const tw = n * (w + gap) - gap, f = clamp(filled / n, 0, 1);
    X.fillStyle = 'rgba(255,255,255,0.08)'; rr(x, y, tw, h, h / 2); X.fill();
    if (f > 0) { const g = X.createLinearGradient(x, 0, x + tw, 0); g.addColorStop(0, hexA(on, 0.7)); g.addColorStop(1, on); X.fillStyle = g; rr(x, y, Math.max(h, tw * f), h, h / 2); X.fill(); }
  },
  bubble(x, y, w, h, mine) { rr(x, y, w, h, 18); X.fillStyle = mine ? 'rgba(127,243,255,0.16)' : 'rgba(255,255,255,0.08)'; X.fill(); },
  bulb(cx, cy, on) {
    if (on) { const g = X.createRadialGradient(cx, cy, 0, cx, cy, 34); g.addColorStop(0, 'rgba(255,207,122,0.55)'); g.addColorStop(1, 'rgba(255,207,122,0)'); X.fillStyle = g; X.fillRect(cx - 34, cy - 34, 68, 68); }
    X.fillStyle = on ? '#ffcf7a' : 'rgba(255,255,255,0.14)'; ell(cx, cy - 4, 13, 13); X.fill(); rr(cx - 6, cy + 9, 12, 8, 3); X.fill();
  },
  weather(kind, cx, cy, size, active) {
    const k = size === 'mini' ? 0.22 : 1, t = H.now, a = size === 'mini' && !active ? 0.55 : 1;
    X.save(); X.globalAlpha = a;
    if (kind === 'soleil') modSun(cx, cy - 10 * k, k);
    else {
      if (kind === 'nuage') modSun(cx + 40 * k, cy - 40 * k, 0.6 * k);
      const drift = size === 'mini' ? 0 : Math.sin(t / 1600) * 10;
      modCloud(cx + drift, cy - 10 * k, k, kind === 'orage' ? '#9aa3c7' : '#e9eeff', a);
      if (kind === 'pluie' || kind === 'orage') { X.strokeStyle = M.fg; X.lineCap = 'round'; X.lineWidth = 6 * k; for (let i = 0; i < (size === 'mini' ? 3 : 9); i++) { const p = size === 'mini' ? 0.4 : (t / 800 + i * 0.29) % 1, x = cx - 60 * k + (i * 37 % 130) * k; X.globalAlpha = a * (1 - p * 0.6); X.beginPath(); X.moveTo(x, cy + 50 * k + p * 70 * k); X.lineTo(x - 5 * k, cy + 66 * k + p * 70 * k); X.stroke(); } }
      if (kind === 'neige') { X.fillStyle = '#ffffff'; for (let i = 0; i < (size === 'mini' ? 3 : 12); i++) { const p = size === 'mini' ? 0.4 : (t / 2600 + i * 0.21) % 1; ell(cx - 60 * k + (i * 41 % 130) * k + Math.sin(t / 600 + i) * 6 * k, cy + 52 * k + p * 70 * k, 5 * k, 5 * k); X.fill(); } }
      if (kind === 'orage' && (size === 'mini' || Math.floor(t / 150) % 10 < 2)) { X.fillStyle = '#ffe066'; X.beginPath(); X.moveTo(cx + 4 * k, cy + 30 * k); X.lineTo(cx - 18 * k, cy + 72 * k); X.lineTo(cx, cy + 70 * k); X.lineTo(cx - 10 * k, cy + 104 * k); X.lineTo(cx + 22 * k, cy + 56 * k); X.lineTo(cx + 4 * k, cy + 58 * k); X.closePath(); X.fill(); }
    }
    X.restore();
  },
  digits(str, cx, y, col) { X.save(); X.font = `600 150px Fredoka, "DejaVu Sans", sans-serif`; X.textAlign = 'center'; X.textBaseline = 'top'; X.shadowColor = M.fg; X.shadowBlur = H.RM ? 0 : 30; X.fillStyle = col; X.fillText(str, cx, y - 22); X.restore(); },
  star(x, y, sz, near) { X.fillStyle = near ? 'rgba(244,247,255,0.9)' : 'rgba(138,147,184,0.6)'; ell(x, y, sz * 0.6, sz * 0.6); X.fill(); },
  face: modFace,
};

/* =================== MANGA =================== */
const K = { fg: '#1b1b1f', dim: '#6d6a66', faint: '#d9d3c4', bg: '#fbf7ee', accent: '#e8384f', pink: '#ff9fb5', hi: '#000000' }, INK = K.fg;
let tone = null;
function screentone() {                       // halftone dots in two corners, drawn once
  if (tone) return tone;
  const c = document.createElement('canvas'); c.width = 1600; c.height = 960; const g = c.getContext('2d'); g.fillStyle = '#dcd5c5';
  for (let y = 0; y <= 960; y += 14) for (let x = (y / 14) % 2 ? 7 : 0; x <= 1600; x += 14) {
    const r = Math.max(4.4 - Math.hypot((1600 - x) / 1600, (960 - y) / 960) * 7, 3.2 - Math.hypot(x / 1600, y / 960) * 8);
    if (r > 0.4) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  }
  return (tone = c);
}
function speedLines(cx, cy) { X.save(); X.strokeStyle = INK; for (let i = 0; i < 44; i++) { const a = i / 44 * TAU + (i % 3) * 0.03, r = 230 + (i * 13) % 60; X.lineWidth = 1 + (i * 7) % 4; X.beginPath(); X.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); X.lineTo(cx + Math.cos(a) * 900, cy + Math.sin(a) * 900); X.stroke(); } X.restore(); }
function mEye(x, y, u, o) {
  const rx = 3.6 * u * (o.wide ? 1.1 : 1), ry = 4.7 * u * (o.wide ? 1.1 : 1) * o.open;
  X.fillStyle = '#ffffff'; ell(x, y, rx, ry); X.fill();
  X.save(); ell(x, y, rx, ry); X.clip();
  const ix = x + o.lx * 0.9 * u, iy = y + o.ly * 0.8 * u + 0.3 * u;
  if (o.heart) { const k = 1 + 0.08 * Math.sin(H.now / 170); X.fillStyle = '#ff4f86'; heart(ix, iy, 3 * u * k); X.fill(); X.fillStyle = '#fff'; ell(ix - 1.1 * u, iy - 1.0 * u, 0.75 * u, 0.55 * u); X.fill(); }
  else {
    const irx = 2.9 * u * o.iris, iry = 3.9 * u * o.iris, g = X.createLinearGradient(ix, iy - iry, ix, iy + iry);
    g.addColorStop(0, '#14204d'); g.addColorStop(0.55, '#2f63c9'); g.addColorStop(1, '#7fd0ff');
    X.fillStyle = g; ell(ix, iy, irx, iry); X.fill(); X.lineWidth = 0.22 * u; X.strokeStyle = '#0c122c'; X.stroke();
    X.fillStyle = '#0b1028'; ell(ix, iy - 0.3 * u, irx * 0.48, iry * 0.52); X.fill();
    const tw = 0.85 + 0.15 * Math.sin(H.now / 260);
    X.fillStyle = '#ffffff'; ell(ix - irx * 0.38, iy - iry * 0.38, 1.05 * u * tw * o.iris, 1.35 * u * tw * o.iris); X.fill();
    ell(ix + irx * 0.42, iy + iry * 0.36, 0.5 * u * o.iris, 0.5 * u * o.iris); X.fill();
    X.globalAlpha = 0.45; ell(ix + irx * 0.1, iy + iry * 0.64, irx * 0.55, iry * 0.17); X.fill(); X.globalAlpha = 1;
  }
  X.restore();
  X.strokeStyle = INK; X.lineCap = 'round'; X.lineWidth = 0.95 * u;
  X.beginPath(); X.ellipse(x, y, rx * 1.04, ry * 1.02 + 0.1 * u, 0, Math.PI * 1.08, Math.PI * 1.92); X.stroke();
  const ox = x + o.side * rx * 0.98, oy = y - ry * 0.35;
  X.lineWidth = 0.6 * u; X.beginPath(); X.moveTo(ox, oy); X.lineTo(ox + o.side * 1.3 * u, oy - 1.0 * u); X.stroke();
  X.beginPath(); X.moveTo(ox - o.side * 0.2 * u, oy + 0.6 * u); X.lineTo(ox + o.side * 1.0 * u, oy + 0.1 * u); X.stroke();
  X.lineWidth = 0.28 * u; X.beginPath(); X.ellipse(x, y, rx * 0.9, ry, 0, Math.PI * 0.3, Math.PI * 0.7); X.stroke();
}
function mClosed(x, y, u, happy, side) {
  const c = happy ? y + 2.2 * u : y - 1.6 * u, a0 = happy ? Math.PI * 1.15 : Math.PI * 0.15, a1 = happy ? Math.PI * 1.85 : Math.PI * 0.85;
  X.strokeStyle = INK; X.lineCap = 'round'; X.lineWidth = 0.85 * u; X.beginPath(); X.arc(x, c, 3.2 * u, a0, a1); X.stroke();
  const a = (side > 0) === happy ? a1 : a0, ex = x + Math.cos(a) * 3.2 * u, ey = c + Math.sin(a) * 3.2 * u;
  X.lineWidth = 0.5 * u; X.beginPath(); X.moveTo(ex, ey); X.lineTo(ex + side * 1.1 * u, ey + (happy ? -0.5 : 0.6) * u); X.stroke();
}
function brow(x, y, u, side, lift, tilt) { X.strokeStyle = INK; X.lineCap = 'round'; X.lineWidth = 0.5 * u; X.beginPath(); X.moveTo(x - side * 2.3 * u, y - lift * u + tilt * u); X.quadraticCurveTo(x, y - (lift + 0.9) * u, x + side * 2.3 * u, y - lift * u); X.stroke(); }
function blush(x, y, u) { X.fillStyle = 'rgba(255,159,181,0.6)'; ell(x, y, 2.4 * u, 1.05 * u); X.fill(); X.strokeStyle = '#e0607e'; X.lineWidth = 0.22 * u; X.lineCap = 'round'; for (let i = -1; i <= 1; i++) { X.beginPath(); X.moveTo(x + i * u - 0.4 * u, y + 0.5 * u); X.lineTo(x + i * u + 0.4 * u, y - 0.5 * u); X.stroke(); } }
function mMouth(mx, my, u, kind) {
  X.strokeStyle = INK; X.lineCap = 'round'; X.lineJoin = 'round'; X.lineWidth = 0.32 * u;
  if (kind === 'cat') for (const s of [-1, 1]) { X.beginPath(); X.arc(mx + s * 0.85 * u, my, 0.85 * u, 0.05 * Math.PI, 0.95 * Math.PI); X.stroke(); }
  else if (kind === 'open') {
    const path = () => { X.beginPath(); X.moveTo(mx - 2.1 * u, my - 0.2 * u); X.quadraticCurveTo(mx, my + 0.3 * u, mx + 2.1 * u, my - 0.2 * u); X.quadraticCurveTo(mx, my + 3.8 * u, mx - 2.1 * u, my - 0.2 * u); X.closePath(); };
    path(); X.fillStyle = '#8c2233'; X.fill(); X.save(); path(); X.clip(); X.fillStyle = '#ff8fa3'; ell(mx, my + 1.6 * u, 1.25 * u, 0.75 * u); X.fill(); X.restore(); path(); X.stroke();
  }
  else if (kind === 'o') { X.fillStyle = '#8c2233'; ell(mx, my + 0.5 * u, 0.9 * u, 1.25 * u); X.fill(); X.stroke(); }
  else if (kind === 'small') { X.beginPath(); X.arc(mx, my + 0.2 * u, 0.55 * u, 0, TAU); X.stroke(); }
  else { X.beginPath(); X.moveTo(mx - 1.0 * u, my + 0.3 * u); X.quadraticCurveTo(mx + 0.3 * u, my - 0.1 * u, mx + 1.4 * u, my + 0.4 * u); X.stroke(); }
}
function mangaFace(cx, cy, u, md, lx = 0, ly = 0) {
  const t = H.now;
  if (md === 'surpris' && u >= 12) speedLines(cx, cy);
  if (md === 'content') cy -= Math.abs(Math.sin(t / 260)) * 0.6 * u;
  if (md === 'reflechit') { lx = -1.2; ly = -1.1; }
  const Lx = cx - 8.6 * u, Rx = cx + 8.6 * u, Ey = cy - 3 * u, by = Ey - 6.6 * u;
  const bl = ['neutre', 'ecoute', 'reflechit', 'surpris', 'amoureux'].includes(md) ? blink() : 0, open = 1 - 0.95 * bl;
  const lift = md === 'surpris' ? 1.6 : md === 'content' || md === 'clin' ? 0.6 : md === 'endormi' ? -0.3 : 0;
  brow(Lx, by, u, -1, lift, md === 'reflechit' ? -0.6 : 0); brow(Rx, by, u, 1, lift + (md === 'reflechit' ? 0.9 : 0), 0);
  const eo = side => ({ open, iris: md === 'surpris' ? 0.42 : 1, lx, ly, heart: md === 'amoureux', side, wide: md === 'surpris' });
  if (md === 'content') { mClosed(Lx, Ey, u, true, -1); mClosed(Rx, Ey, u, true, 1); }
  else if (md === 'endormi' || open < 0.25) { mClosed(Lx, Ey + u, u, false, -1); mClosed(Rx, Ey + u, u, false, 1); }
  else if (md === 'clin') { mEye(Lx, Ey, u, eo(-1)); mClosed(Rx, Ey, u, true, 1); }
  else { mEye(Lx, Ey, u, eo(-1)); mEye(Rx, Ey, u, eo(1)); }
  X.strokeStyle = INK; X.lineWidth = 0.25 * u; X.beginPath(); X.moveTo(cx + 0.2 * u, cy + 1.0 * u); X.lineTo(cx - 0.2 * u, cy + 1.5 * u); X.stroke();
  if (!['surpris', 'reflechit'].includes(md)) { blush(cx - 12.6 * u, cy + 2.4 * u, u); blush(cx + 12.6 * u, cy + 2.4 * u, u); }
  mMouth(cx + lx * 0.4 * u, cy + 3.6 * u, u, md === 'content' || md === 'clin' ? 'open' : md === 'surpris' ? 'o' : md === 'endormi' ? 'small' : md === 'reflechit' ? 'flat' : 'cat');
  if (md === 'clin') { X.fillStyle = '#ffd400'; X.strokeStyle = INK; X.lineWidth = 0.25 * u; star(Rx + 5 * u, Ey - 5 * u, 1.8 * u * (1 + 0.2 * Math.sin(t / 150)), 5, 0.45); X.fill(); X.stroke(); }
  if (md === 'content') [[-15, -9, 0], [15, -10, 1], [-12, -13, 2], [14, -4, 3]].forEach(([dx, dy, i]) => { const k = 0.5 + 0.5 * Math.sin(t / 200 + i * 1.7); X.fillStyle = INK; star(cx + dx * u, cy + dy * u, (0.6 + 0.8 * k) * u, 4, 0.22); X.fill(); });
  if (md === 'surpris') {
    const dx = cx + 15 * u, dy = cy - 8 * u + Math.sin(t / 200) * 0.3 * u;
    X.beginPath(); X.moveTo(dx, dy - 2.2 * u); X.quadraticCurveTo(dx + 1.6 * u, dy + 0.2 * u, dx, dy + 1.1 * u); X.quadraticCurveTo(dx - 1.6 * u, dy + 0.2 * u, dx, dy - 2.2 * u);
    X.fillStyle = '#bfe6ff'; X.fill(); X.strokeStyle = INK; X.lineWidth = 0.22 * u; X.stroke();
    X.fillStyle = '#ffffff'; star(cx + 12.5 * u, cy - 13 * u, 3 * u, 12, 0.72); X.fill(); X.lineWidth = 0.25 * u; X.stroke();
    H.txt('!', cx + 12.5 * u, cy - 14.8 * u, 3.8 * u, K.accent, 'center', 'title');
  }
  if (md === 'amoureux') for (let k = 0; k < 4; k++) { const p = (t / 2000 + k / 4) % 1; X.globalAlpha = 1 - p; X.fillStyle = '#ff4f86'; heart(cx + [-17, 15, -5, 7][k] * u + Math.sin(t / 300 + k) * u, cy - 2 * u - p * 10 * u, (0.8 + p * 0.5) * u); X.fill(); X.strokeStyle = INK; X.lineWidth = 0.15 * u; X.stroke(); X.globalAlpha = 1; }
  if (md === 'endormi') {
    const r = (1 + 1.3 * (0.5 + 0.5 * Math.sin(t / 1100))) * u, bx = cx + 1.8 * u + r * 0.7, byy = cy + 1.8 * u;
    X.fillStyle = 'rgba(170,220,255,0.4)'; ell(bx, byy, r, r); X.fill(); X.strokeStyle = INK; X.lineWidth = 0.2 * u; X.stroke();
    X.strokeStyle = '#ffffff'; X.lineWidth = 0.25 * u; X.beginPath(); X.arc(bx, byy, r * 0.65, Math.PI * 1.1, Math.PI * 1.45); X.stroke();
    for (let k = 0; k < 3; k++) { const p = (t / 1700 + k / 3) % 1; X.globalAlpha = 1 - p; H.txt('Z', cx + 9 * u + p * 3 * u, cy - 7 * u - p * 5 * u, (1.6 + p * 1.6) * u, INK, 'left', 'title'); X.globalAlpha = 1; }
  }
  if (md === 'reflechit') {
    X.fillStyle = '#ffffff'; X.strokeStyle = INK; X.lineWidth = 0.2 * u;
    for (const [dx, dy, r] of [[10.5, -8, 0.5], [12, -10, 0.8]]) { ell(cx + dx * u, cy + dy * u, r * u, r * u); X.fill(); X.stroke(); }
    const k = 6.5 * u / 180; X.lineWidth = 0.45 * u; cloudPath(cx + 15.5 * u, cy - 14 * u, k); X.stroke(); X.fillStyle = '#ffffff'; cloudPath(cx + 15.5 * u, cy - 14 * u, k); X.fill();
    const n = Math.floor(t / 350) % 4; X.fillStyle = INK; for (let i = 0; i < n; i++) { ell(cx + (14 + i * 1.3) * u, cy - 13.8 * u, 0.3 * u, 0.3 * u); X.fill(); }
  }
  if (md === 'ecoute') for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { X.globalAlpha = ((Math.floor(t / 250) + i) % 3) === 0 ? 1 : 0.35; X.strokeStyle = INK; X.lineWidth = 0.3 * u; X.beginPath(); X.arc(cx + s * 16 * u, cy - u, (0.8 + i * 0.9) * u, s > 0 ? -0.6 : Math.PI - 0.6, s > 0 ? 0.6 : Math.PI + 0.6); X.stroke(); X.globalAlpha = 1; }
}
function mCloud(x, y, k, lw) { X.lineWidth = lw * 2; X.strokeStyle = INK; cloudPath(x, y, k); X.stroke(); X.fillStyle = '#ffffff'; cloudPath(x, y, k); X.fill(); }
const manga = {
  id: 'manga', name: 'Manga', c: K, glow: 0, bubbles: true, qr: ['#ffffff', '#000000'],
  font: (s, k) => k === 'title' ? `${Math.round(s * 0.92)}px Bangers, Impact, sans-serif` : `700 ${Math.round(s * 0.74)}px "Comic Neue", "Comic Sans MS", sans-serif`,
  bg() { X.fillStyle = K.bg; X.fillRect(0, 0, W, HT); X.drawImage(screentone(), 0, 0, W, HT); },
  header(title, clock) {
    const t = title.toUpperCase(); X.font = manga.font(32, 'title'); const tw = X.measureText(t).width;
    X.fillStyle = INK; X.beginPath(); X.moveTo(8, 8); X.lineTo(tw + 58, 8); X.lineTo(tw + 42, 48); X.lineTo(8, 48); X.closePath(); X.fill();
    H.txt(t, 24, 13, 32, '#ffffff', 'left', 'title'); H.txt(clock, W - 22, 14, 30, INK, 'right', 'title'); X.fillStyle = INK; X.fillRect(tw + 50, 45, W - tw - 72, 3);
  },
  box(x, y, w, h, c = INK, fill) {
    const st = c === K.accent ? K.accent : c === K.dim ? '#9a958c' : INK;
    if (fill !== K.bg) { X.fillStyle = st === '#9a958c' ? '#cfc9bc' : INK; rr(x + 4, y + 4, w, h, 6); X.fill(); }
    X.fillStyle = fill === K.fg ? '#ffe36e' : '#ffffff'; rr(x, y, w, h, 6); X.fill(); X.lineWidth = 3; X.strokeStyle = st; X.stroke();
  },
  bar(x, y, n, filled, w, h, gap, on = INK) {
    for (let i = 0; i < n; i++) { const f = clamp(filled - i, 0, 1), xx = x + i * (w + gap); X.fillStyle = '#ffffff'; X.fillRect(xx, y, w, h);
      if (f > 0) { X.fillStyle = on === K.accent ? K.accent : on === K.dim ? '#9a958c' : INK; X.fillRect(xx, y, w * f, h); } X.lineWidth = 2; X.strokeStyle = INK; X.strokeRect(xx, y, w, h); }
  },
  bubble(x, y, w, h, mine) {
    const tx = mine ? x + w - 26 : x + 26, dir = mine ? 1 : -1, fill = mine ? '#fff4c2' : '#ffffff';
    const tail = () => { X.beginPath(); X.moveTo(tx - 10, y + h - 4); X.lineTo(tx + dir * 26, y + h + 14); X.lineTo(tx + 10, y + h - 4); X.closePath(); };
    X.fillStyle = fill; X.strokeStyle = INK; X.lineWidth = 2.5; tail(); X.fill(); X.stroke();
    rr(x, y, w, h, 20); X.fill(); X.stroke(); X.save(); X.translate(0, -3); tail(); X.fill(); X.restore();
  },
  bulb(cx, cy, on) {
    X.strokeStyle = INK; X.lineCap = 'round';
    if (on) { X.lineWidth = 2.5; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; X.beginPath(); X.moveTo(cx + Math.cos(a) * 21, cy - 4 + Math.sin(a) * 21); X.lineTo(cx + Math.cos(a) * 29, cy - 4 + Math.sin(a) * 29); X.stroke(); } }
    X.fillStyle = on ? '#ffe066' : '#ffffff'; ell(cx, cy - 4, 13, 13); X.fill(); X.lineWidth = 2.5; X.stroke(); X.fillStyle = '#bdb7aa'; rr(cx - 6, cy + 9, 12, 8, 2); X.fill(); X.stroke();
  },
  weather(kind, cx, cy, size, active) {
    const mini = size === 'mini', k = mini ? 0.22 : 1, lw = mini ? 1.6 : 3.5, t = H.now;
    X.save(); X.globalAlpha = mini && !active ? 0.5 : 1; X.lineCap = 'round'; X.lineJoin = 'round';
    const sun = (x, y, s) => {
      X.fillStyle = INK; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + (mini ? 0 : t / 4000); X.beginPath(); X.moveTo(x + Math.cos(a - 0.12) * 58 * s, y + Math.sin(a - 0.12) * 58 * s); X.lineTo(x + Math.cos(a) * 84 * s, y + Math.sin(a) * 84 * s); X.lineTo(x + Math.cos(a + 0.12) * 58 * s, y + Math.sin(a + 0.12) * 58 * s); X.fill(); }
      X.fillStyle = '#ffe066'; X.strokeStyle = INK; X.lineWidth = lw; ell(x, y, 50 * s, 50 * s); X.fill(); X.stroke();
      if (!mini && s > 0.8) { X.fillStyle = INK; ell(x - 16 * s, y - 6 * s, 4 * s, 6 * s); X.fill(); ell(x + 16 * s, y - 6 * s, 4 * s, 6 * s); X.fill(); X.lineWidth = 3; X.beginPath(); X.arc(x, y + 6 * s, 12 * s, 0.15 * Math.PI, 0.85 * Math.PI); X.stroke(); }
    };
    if (kind === 'soleil') sun(cx, cy - 10 * k, k);
    else {
      if (kind === 'nuage') sun(cx + 40 * k, cy - 40 * k, 0.6 * k);
      mCloud(cx + (mini ? 0 : Math.sin(t / 1600) * 10), cy - 10 * k, k, lw);
      if (kind === 'pluie' || kind === 'orage') { X.strokeStyle = INK; X.lineWidth = lw; for (let i = 0; i < (mini ? 3 : 9); i++) { const p = mini ? 0.4 : (t / 700 + i * 0.29) % 1, x = cx - 60 * k + (i * 37 % 130) * k; X.beginPath(); X.moveTo(x, cy + 50 * k + p * 70 * k); X.lineTo(x - 8 * k, cy + 70 * k + p * 70 * k); X.stroke(); } }
      if (kind === 'neige') { X.fillStyle = '#ffffff'; X.strokeStyle = INK; X.lineWidth = lw * 0.6; for (let i = 0; i < (mini ? 3 : 12); i++) { const p = mini ? 0.4 : (t / 2600 + i * 0.21) % 1; ell(cx - 60 * k + (i * 41 % 130) * k + Math.sin(t / 600 + i) * 6 * k, cy + 52 * k + p * 70 * k, 6 * k, 6 * k); X.fill(); X.stroke(); } }
      if (kind === 'orage' && (mini || Math.floor(t / 150) % 10 < 3)) { X.fillStyle = '#ffe066'; X.strokeStyle = INK; X.lineWidth = lw * 0.8; X.beginPath(); X.moveTo(cx + 4 * k, cy + 30 * k); X.lineTo(cx - 18 * k, cy + 72 * k); X.lineTo(cx, cy + 70 * k); X.lineTo(cx - 10 * k, cy + 104 * k); X.lineTo(cx + 22 * k, cy + 56 * k); X.lineTo(cx + 4 * k, cy + 58 * k); X.closePath(); X.fill(); X.stroke(); }
    }
    X.restore();
  },
  digits(str, cx, y, col) { X.save(); X.font = '170px Bangers, Impact, sans-serif'; X.textAlign = 'center'; X.textBaseline = 'top'; X.fillStyle = K.accent; X.fillText(str, cx + 7, y - 14); X.fillStyle = col === K.accent ? K.accent : INK; X.fillText(str, cx, y - 20); X.restore(); },
  star(x, y, sz, near) { X.fillStyle = near ? INK : '#aaa397'; star(x, y, sz * 1.5, 4, 0.25); X.fill(); },
  face: mangaFace,
};
return { retro, moderne, manga };
};
