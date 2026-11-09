/* Scene pack « surprises » — Surprises: seasons, days of the week, special dates and rare little gags.
   See the top of web/persona.js: scenes are defined with S('id', 'Label', 'group', { ... }) on one line each
   (pixel/scenes.py reads them), groups tap / fache / calin / retour / vie / evt, plus "on" (events) and "pool" (touch pools).
   Almost all of them are moments of life ('vie') with a when(c) on the date and the hour (c: h, mn, wd 0 = Sunday,
   mo 0 = January, dd, date...), so they only play on their day, with a big weight then (w 3 to 8: that day he plays them
   often); the rare gags have no when and a small weight (0.2 to 0.35). Christmas is persona.js's (the snow, the hat
   all December): nothing seasonal here in December but the Saint-Sylvestre. At night only the quiet: true ones play.
   A few 'evt' answer a notification: one for any day (his calendar), two for their day (Friday the 13th, 1 April).
   Every scene ends with him back in place. The props are solid shapes in the theme's colours, sized in the face's pixel
   (D.U) or at least D.k * 1.5 in the pixel themes, where they are drawn on a low-res canvas with an alpha threshold:
   no faint lines, no alpha fades (they grow and shrink instead), and text only through D.glyph. */
(window.PixelScenePacks ||= []).push(({ S, L, pick, sm, out, inn, seg, bump, tri, jumps, clamp, TAU, W, prop }) => {

/* ---------- small helpers ---------- */
const fin = (e, a, b) => 1 - sm(seg(e, a, b));                                   // 1, then down to 0 between a and b
const io = (e, a, b, c, d) => sm(seg(e, a, b)) * fin(e, c, d);                     // 0 -> 1 (a..b) -> 0 (c..d)
const wob = (e, t0, tau, per) => (e < t0 ? 0 : Math.exp(-(e - t0) / tau) * Math.sin((e - t0) / per));   // a dying wobble
const arc = (e, a, b, h) => { if (e < a || e >= b) return 0; const f = (e - a) / (b - a); return -4 * h * f * (1 - f); };   // one hop, h px up
const pop = q => (q <= 0 ? 0 : q >= 1 ? 1 : 1 + 2.70158 * (q - 1) ** 3 + 1.70158 * (q - 1) ** 2);   // grows with a little overshoot
const hash = n => ((n * 2654435761) >>> 0) % 1000;                                 // a cheap, steady "random" for the glitches
const short = (s, n = 20) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const F = (...ls) => o => { const x = pick(ls); return typeof x === 'function' ? x(o) : x; };   // a say slot whose lines may use the scene's data
const hour = () => new Date().getHours();

/* ---------- the calendar ---------- */
function easter(y) {                                // Easter Sunday (Gregorian, the "anonymous" algorithm): [month 0-11, day]
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114; return [Math.floor(n / 31) - 1, (n % 31) + 1];
}
const paques = c => { const y = c.date.getFullYear(), [m, d] = easter(y), n = Math.round((new Date(y, c.mo, c.dd) - new Date(y, m, d)) / 864e5); return n === 0 || n === 1; };   // Sunday and Monday
const MOON = 29.530588853, NEW0 = Date.UTC(2000, 0, 6, 18, 14);                     // a known new moon
const fullMoon = d => Math.abs(((((d.getTime() - NEW0) / 864e5) % MOON) + MOON) % MOON - MOON / 2) < 1.2;   // within a day or so
const spring = c => (c.mo === 2 && c.dd >= 20) || c.mo === 3 || c.mo === 4 || (c.mo === 5 && c.dd < 21);
const summer = c => (c.mo === 5 && c.dd >= 21) || c.mo === 6 || c.mo === 7 || (c.mo === 8 && c.dd < 22);
const autumn = c => (c.mo === 8 && c.dd >= 22) || c.mo === 9 || c.mo === 10;          // December belongs to Christmas
const winter = c => c.mo === 0 || c.mo === 1 || (c.mo === 2 && c.dd < 20);
const today = (mo, dd) => { const d = new Date(); return d.getMonth() === mo && d.getDate() === dd; };
const DAYS = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];
const DAYLINES = [
  ['Même le dimanche ?!', 'Un dimanche ? Sérieux ?', 'On se repose, le dimanche !'],
  ['Un lundi, évidemment…', 'Lundi : ça commence fort.', 'Le lundi, ça déborde.'],
  ['Mardi, jour du courrier !', 'Un mardi tout à fait normal.', 'Mardi… ça va encore.'],
  ['Mercredi : la moitié lue !', 'Un message de mi-semaine.', 'Mercredi, ça passe vite.'],
  ['Jeudi… presque vendredi !', 'Un jeudi plein d’entrain !', 'Jeudi, on tient bon !'],
  ['Vite, bientôt le week-end !', 'Un vendredi ? Ça sent la fête.', 'Vendredi, on lit en dansant.'],
  ['Un samedi ? Sérieusement ?', 'Même le samedi, on t’écrit !', 'Samedi : lecture en pyjama.'],
];
const dayLine = o => (o.wd === 5 && o.h >= 16 ? pick(['Vendredi soir ? Ça attendra !', 'Le week-end d’abord !', 'Vendredi soir : pas là !']) : pick(DAYLINES[o.wd] || DAYLINES[2]));

/* ---------- drawing ---------- */
const poly = (g, pts, c) => { g.fillStyle = c; g.beginPath(); for (let i = 0; i < pts.length; i++) { if (i) g.lineTo(pts[i][0], pts[i][1]); else g.moveTo(pts[i][0], pts[i][1]); } g.closePath(); g.fill(); };
const disc = (g, x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, Math.max(0.5, r), 0, TAU); g.fill(); };
const box = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const ln = (D, a, b, w, c) => { const g = D.g; g.strokeStyle = c; g.lineWidth = D.lw(w); g.lineCap = 'round'; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); };
const gpoly = (D, uv, c) => poly(D.g, uv.map(([u, v]) => { const p = D.P(u, v); return [p.x, p.y]; }), c);   // a shape in his grid: it follows him
const MIN = D => (D.pix ? D.k * 1.5 : 3);                                          // the smallest dot that still shows in Rétro and LCD
const gl = (D, s, x, y, size, c) => { if (size >= 6) D.glyph(s, x, y, size, c); };   // sharp text (not at size 0)
const leaf = (g, x, y, a, s, c) => { const ca = Math.cos(a), sa = Math.sin(a), P = (u, v) => [x + u * ca - v * sa, y + u * sa + v * ca]; poly(g, [P(-9 * s, 0), P(-2 * s, -5 * s), P(9 * s, 0), P(-2 * s, 5 * s)], c); };
const egg = (g, x, y, s, c, band) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, 9 * s, 12 * s, 0, 0, TAU); g.fill(); box(g, x - 8.6 * s, y - 2 * s, 17.2 * s, 4.4 * s, band); };
const candy = (g, x, y, s, a, c, c2) => { g.save(); g.translate(x, y); g.rotate(a); box(g, -6 * s, -4.5 * s, 12 * s, 9 * s, c); poly(g, [[-5 * s, 0], [-12 * s, -6 * s], [-12 * s, 6 * s]], c2); poly(g, [[5 * s, 0], [12 * s, -6 * s], [12 * s, 6 * s]], c2); g.restore(); };
function pumpkin(D, x, y, r, holes) {               // a pumpkin centred on (x, y), r its half-width; holes: the colour of a carved face, or none
  const g = D.g; if (r < 2) return;
  g.fillStyle = D.col.acc; for (const [dx, rr] of [[-0.42, 0.6], [0.42, 0.6], [0, 0.68]]) { g.beginPath(); g.ellipse(x + dx * r, y, rr * r, 0.8 * r, 0, 0, TAU); g.fill(); }
  g.strokeStyle = D.col.dim; g.lineWidth = D.lw(r * 0.05); g.beginPath(); g.ellipse(x, y, 0.3 * r, 0.78 * r, 0, 0, TAU); g.stroke();
  box(g, x - 0.09 * r, y - 1.02 * r, 0.18 * r, 0.3 * r, D.col.dim);                          // the stalk
  if (!holes) return; if (holes === D.col.acc) holes = D.col.bg;                    // LCD: its accent is its ink
  for (const sd of [-1, 1]) poly(g, [[x + sd * 0.48 * r, y - 0.06 * r], [x + sd * 0.3 * r, y - 0.42 * r], [x + sd * 0.12 * r, y - 0.06 * r]], holes);
  poly(g, [[x - 0.55 * r, y + 0.2 * r], [x - 0.3 * r, y + 0.32 * r], [x - 0.18 * r, y + 0.2 * r], [x, y + 0.34 * r], [x + 0.18 * r, y + 0.2 * r], [x + 0.3 * r, y + 0.32 * r],
    [x + 0.55 * r, y + 0.2 * r], [x + 0.32 * r, y + 0.56 * r], [x, y + 0.46 * r], [x - 0.32 * r, y + 0.56 * r]], holes);
}

prop('surpriseConfetti', (D, e, q = 1) => {         // confetti falling all over the screen
  if (q <= 0) return; const g = D.g, cs = [D.col.acc, D.col.pink, D.col.hi, D.col.fg], m = MIN(D);
  for (let i = 0; i < 22; i++) {
    const sp = 70 + (i * 37 % 11) * 9, y = 40 + ((e / 1000) * sp + i * 71) % 396, x = (i * 113 + 47) % 760 + 20 + Math.sin(e / 400 + i) * 14;
    const w = Math.max(m, (3 + 8 * Math.abs(Math.cos(e / 180 + i * 1.7))) * q); box(g, x - w / 2, y - 4, w, Math.max(m, 8 * q), cs[i % 4]);
  }
});
prop('surpriseBattery', (D, lvl, q, blink) => {     // a battery by his side (lvl 0..1), empty and blinking on a Monday morning
  if (q <= 0) return; const g = D.g, U = D.U, p = D.P(88, 25), w = 7 * U * q, h = 12 * U * q, x = Math.min(p.x, W - 14 - w / 2) - w / 2, y = p.y - h / 2;
  g.strokeStyle = D.col.fg; g.lineWidth = D.lw(0.9 * U); g.strokeRect(x, y, w, h); box(g, x + w / 2 - 1.6 * U * q, y - 1.5 * U * q, 3.2 * U * q, 1.5 * U * q, D.col.fg);
  const fh = (h - 2.4 * U * q) * clamp(lvl, 0, 1); if (!blink && fh > 1) box(g, x + 1.2 * U * q, y + h - 1.2 * U * q - fh, w - 2.4 * U * q, fh, lvl < 0.2 ? D.col.acc : D.col.fg);
  if (blink) box(g, x + 1.2 * U * q, y + h - 2.6 * U * q, w - 2.4 * U * q, 1.4 * U * q, D.col.acc);
});
prop('surpriseSeesaw', (D, a, q) => {               // a seesaw under him (a: its tilt)
  if (q <= 0) return; const g = D.g, cx = 400, cy = 404, l = 270 * q;
  poly(g, [[cx, cy], [cx - 26 * q, cy + 30], [cx + 26 * q, cy + 30]], D.col.dim);
  g.save(); g.translate(cx, cy - 6); g.rotate(a); box(g, -l, -7, l * 2, 14, D.col.fg); box(g, -l, -22, 18, 15, D.col.acc); box(g, l - 18, -22, 18, 15, D.col.acc); g.restore();
});
prop('surpriseHammock', (D, q) => {                 // a hammock between two posts, under him
  if (q <= 0) return; const g = D.g, U = D.U, top = 436 - 236 * q, a = D.P(12, 44), b = D.P(84, 44), c = D.P(48, 68);
  c.y = Math.min(c.y, (4 * 426 - a.y - b.y) / 2);                                   // its lowest point stays above the bottom line
  for (const x of [92, 708]) box(g, x - 7, top, 14, 436 - top, D.col.dim);
  if (q < 0.98) return;
  ln(D, { x: 92, y: top + 10 }, a, 0.6 * U, D.col.fg); ln(D, { x: 708, y: top + 10 }, b, 0.6 * U, D.col.fg);
  g.strokeStyle = D.col.acc; g.lineWidth = D.lw(2.2 * U); g.lineCap = 'round'; g.beginPath(); g.moveTo(a.x, a.y); g.quadraticCurveTo(c.x, c.y, b.x, b.y); g.stroke();
  g.strokeStyle = D.col.pink; g.lineWidth = D.lw(0.8 * U); g.beginPath(); g.moveTo(a.x, a.y + 2 * U); g.quadraticCurveTo(c.x, c.y + 2 * U, b.x, b.y + 2 * U); g.stroke();
});
prop('surpriseCal', (D, top, big, flip, q) => {     // a calendar page by his side: the day on top, a big number; flip 0..1 turns the page
  if (q <= 0) return; const g = D.g, U = D.U, p = D.P(87, 17), w = 15 * U * q, h = 16 * U * q;
  const x = clamp(p.x - w / 2, 8, W - 8 - w), y = clamp(p.y - h / 2, 50, 380), sy = Math.max(0.06, Math.abs(Math.cos(flip * Math.PI))), hh = h * sy;
  box(g, x, y, w, hh, D.col.hi); box(g, x, y, w, Math.min(hh, 4.5 * U * q), D.col.acc);
  for (const dx of [0.28, 0.72]) box(g, x + w * dx - 0.7 * U, y - 1.4 * U, 1.4 * U, 2.6 * U, D.col.fg);    // the rings
  if (sy > 0.85 && q > 0.9) { gl(D, top, x + w / 2, y + 2.4 * U, 3.4 * U, D.col.bg); gl(D, big, x + w / 2, y + 10.2 * U, 8 * U, D.col.bg); }
});
const FLOWERS = [[104, 0.9, 0], [178, 0.7, 1], [252, 1.05, 2], [548, 0.8, 1], [622, 1.1, 0], [698, 0.75, 2]];   // x, size, colour
prop('surpriseFlowers', (D, e, q) => {              // flowers growing at the bottom of the screen, one after the other
  if (q <= 0) return; const g = D.g, cs = [D.col.pink, D.col.acc, D.col.hi];
  for (let i = 0; i < FLOWERS.length; i++) {
    const [x0, s, ci] = FLOWERS[i], k = clamp(q * 1.6 - i * 0.12, 0, 1); if (k <= 0) continue;
    const h = 92 * s * k, x = x0 + Math.sin(e / 700 + i) * 5 * k, y = 434 - h, r = 8 * s * k;
    box(g, x0 - 3, y, 7, h, D.col.dim); leaf(g, x0 + 9, 434 - h * 0.35, -0.5, 1.1 * k, D.col.dim);
    for (let j = 0; j < 5; j++) { const a = j * TAU / 5 + i; disc(g, x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.78, cs[ci]); }
    disc(g, x, y, r * 0.62, D.col.fg);
  }
});
prop('surpriseButterfly', (D, x, y, ph, s = 1) => { // a butterfly, its wings beating (ph: their phase)
  const g = D.g, f = 0.2 + 0.8 * Math.abs(Math.sin(ph));
  for (const sd of [-1, 1]) {
    poly(g, [[x, y - 2 * s], [x + sd * 14 * s * f, y - 12 * s], [x + sd * 16 * s * f, y + 1 * s]], D.col.pink);
    poly(g, [[x, y + 1 * s], [x + sd * 11 * s * f, y + 10 * s], [x + sd * 3 * s * f, y + 11 * s]], D.col.acc);
  }
  box(g, x - 2 * s, y - 6 * s, 4 * s, 15 * s, D.col.fg);
});
prop('surpriseFan', (D, e, q, spin) => {            // an electric fan on the left, its blades spinning (spin: their angle)
  if (q <= 0) return; const g = D.g, x = 118, y = 452 - 186 * q, R = 50;
  box(g, x - 7, y, 14, 432 - y, D.col.dim); box(g, x - 40, 420, 80, 16, D.col.dim);
  for (let i = 0; i < 3; i++) { const a = spin + i * TAU / 3; g.fillStyle = D.col.hi; g.beginPath(); g.ellipse(x + Math.cos(a) * R * 0.48, y + Math.sin(a) * R * 0.48, R * 0.44, R * 0.2, a, 0, TAU); g.fill(); }
  g.strokeStyle = D.col.fg; g.lineWidth = D.lw(6); g.beginPath(); g.arc(x, y, R, 0, TAU); g.stroke(); disc(g, x, y, 9, D.col.acc);
  if (spin > 1) for (let i = 0; i < 4; i++) { const t = ((e / 600) + i / 4) % 1; box(g, x + 64 + t * 170, y - 34 + i * 22 + Math.sin(e / 90 + i) * 4, 26 * (1 - t) + MIN(D), MIN(D) * 1.1, D.col.hi); }
});
prop('surpriseLeaves', (D, e, q) => {               // dead leaves falling all over the screen, swaying
  if (q <= 0) return; const cs = [D.col.acc, D.col.pink, D.col.dim, D.col.acc];
  for (let i = 0; i < 9; i++) {
    const sp = 40 + (i * 29 % 7) * 8, y = 30 + ((e / 1000) * sp + i * 97) % 410, x = (i * 89 + 60) % 740 + 30 + Math.sin(e / 600 + i * 2) * 30;
    leaf(D.g, x, y, Math.sin(e / 500 + i) * 0.9, 1.7 * q, cs[i % 4]);
  }
});
prop('surpriseIce', (D, q, crack, burst) => {       // an ice cube round his face (q: its size), cracking, then bursting into shards
  const g = D.g, U = D.U, a = D.P(14, 9), b = D.P(82, 48), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, hw = Math.abs(b.x - a.x) / 2, hh = Math.abs(b.y - a.y) / 2;
  if (burst > 0) {
    if (burst >= 1) return; const s = Math.max(MIN(D), 22 * (1 - burst));
    for (let i = 0; i < 10; i++) { const an = i * TAU / 10 + 0.3, d = (50 + (i % 3) * 40) * out(burst); box(g, cx + Math.cos(an) * (hw * 0.7 + d) - s / 2, cy + Math.sin(an) * (hh * 0.7 + d) + 130 * burst * burst - s / 2, s, s, D.col.hi); }
    return;
  }
  if (q <= 0) return;
  const w = hw * q, h = hh * q, x = cx - w, y = cy - h;
  g.strokeStyle = D.col.hi; g.lineWidth = D.lw(1.3 * U); g.strokeRect(x, y, 2 * w, 2 * h);
  box(g, x + 2 * U, y + 2 * U, 7 * U * q, 1.3 * U, D.col.hi); box(g, x + 2 * U, y + 2 * U, 1.3 * U, 5 * U * q, D.col.hi);        // the shine
  for (let i = 0; i < 6; i++) { const ix = x + (0.12 + i * 0.152) * 2 * w, l = (2.5 + (i * 7 % 3) * 1.6) * U * q; poly(g, [[ix - 1.7 * U, y + 2 * h], [ix + 1.7 * U, y + 2 * h], [ix, y + 2 * h + l]], D.col.hi); }
  if (crack > 0) {
    g.strokeStyle = D.col.hi; g.lineWidth = D.lw(0.8 * U); g.lineCap = 'round';
    for (const [sx, sy, pts] of [[0, -1, [[0.05, -0.6], [-0.06, -0.35], [0.04, -0.05]]], [-1, 0.2, [[-0.62, 0.05], [-0.4, 0.22], [-0.15, 0.02]]], [1, -0.3, [[0.6, -0.1], [0.38, -0.32], [0.12, -0.1]]]]) {
      g.beginPath(); g.moveTo(cx + sx * w, cy + sy * h); const n = Math.ceil(crack * 3);
      for (let j = 0; j < n; j++) g.lineTo(cx + pts[j][0] * w, cy + pts[j][1] * h); g.stroke();
    }
  }
});
prop('surpriseBreath', (D, e) => {                  // little clouds of breath in the cold
  const m = D.P(52, 42); for (let i = 0; i < 2; i++) { const q = ((e / 900) + i / 2) % 1; if (q < 0.8) D.ring(m.x + 20 + q * 70, m.y + 6 - q * 30, (1.4 + q * 3) * D.U, D.col.hi, 0.7 * D.U); }
});
prop('surpriseList', (D, q, n) => {                 // a list of resolutions by his side, n lines written
  if (q <= 0) return; const g = D.g, U = D.U, p = D.P(88, 14), w = 17 * U * q, h = 24 * U * q, x = clamp(p.x - w / 2, 8, W - 8 - w), y = clamp(p.y, 50, 300);
  box(g, x, y, w, h, D.col.hi); box(g, x, y, w, 3.5 * U * q, D.col.acc);
  for (let i = 0; i < n && q > 0.9; i++) { box(g, x + 2 * U, y + (6.5 + i * 5.5) * U, 2 * U, 2 * U, D.col.pink); box(g, x + 5 * U, y + (6.8 + i * 5.5) * U, (6 + (i * 5) % 5) * U, 1.4 * U, D.col.dim); }
});
prop('surpriseCrown', (D, q) => {                   // a golden crown on his head (the galette's)
  if (q <= 0) return; const V = 16, sc = ([u, v]) => [48 + (u - 48) * q, V + (v - V) * q];
  gpoly(D, [[35, 16], [35, 9], [40, 12.5], [44, 6.5], [48, 11], [52, 6.5], [56, 12.5], [61, 9], [61, 16]].map(sc), D.col.acc);
  for (const [u, v, c] of [[44, 6.5, D.col.hi], [52, 6.5, D.col.hi], [41, 14, D.col.pink], [48, 14, D.col.hi], [55, 14, D.col.pink]]) { const p = D.P(...sc([u, v])); disc(D.g, p.x, p.y, Math.max(MIN(D) * 0.5, 1.1 * D.U * q), c); }
});
prop('surpriseGalette', (D, x, y, r, cut) => {      // a galette des rois with its lattice, a slice gone (cut: its half-angle)
  if (r < 2) return; const g = D.g; g.fillStyle = D.col.acc; g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, cut, TAU - cut); g.closePath(); g.fill();
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { if ((i + j) % 2 || i * i + j * j > 5 || (i > 0 && Math.abs(j) <= i)) continue; const cx = x + i * r * 0.3, cy = y + j * r * 0.3, s = r * 0.12; poly(g, [[cx, cy - s], [cx + s, cy], [cx, cy + s], [cx - s, cy]], D.col.dim); }
});
prop('surprisePan', (D, x, y, a, q = 1) => {        // a frying pan seen from the side, its handle to the right (q: its size)
  const g = D.g; g.save(); g.translate(x, y); g.rotate(a); g.scale(q, q); box(g, 46, -6, 74, 13, D.col.dim);
  g.fillStyle = D.col.fg; g.beginPath(); g.ellipse(0, 0, 56, 16, 0, 0, TAU); g.fill(); g.fillStyle = D.col.dim; g.beginPath(); g.ellipse(0, -2, 44, 9, 0, 0, TAU); g.fill(); g.restore();
});
prop('surpriseCrepe', (D, x, y, rx, flip) => {      // a crêpe in the air (flip: its turn, it gets thin edge-on)
  const g = D.g, ry = Math.max(MIN(D), 11 * Math.abs(Math.cos(flip))); g.fillStyle = D.col.acc; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
  if (ry > 7) for (const [dx, dy] of [[-0.4, -0.2], [0.25, 0.3], [0.5, -0.3]]) disc(g, x + dx * rx, y + dy * ry, Math.max(MIN(D) * 0.6, 3), D.col.dim);
});
prop('surpriseCrepeFace', (D, q) => {               // the crêpe that landed on his face, eaten bit by bit (q: what is left)
  if (q <= 0) return; const g = D.g, U = D.U, c = D.P(48, 30);
  g.fillStyle = D.col.acc; g.beginPath(); g.ellipse(c.x, c.y, 31 * U * q, 17 * U * q, 0, 0, TAU); g.fill();
  for (const [du, dv, r] of [[-14, -6, 2.2], [9, 5, 2.8], [18, -8, 1.8], [-5, 9, 1.6], [2, -10, 1.4]]) { const p = D.P(48 + du * q, 30 + dv * q); disc(g, p.x, p.y, r * U * q, D.col.dim); }
});
prop('surpriseArrow', (D, x, y, a, s = 1) => {      // Cupid's arrow, its tip at (x, y), pointing along a
  const g = D.g; g.save(); g.translate(x, y); g.rotate(a);
  box(g, -86 * s, -3 * s, 76 * s, 6 * s, D.col.acc);
  poly(g, [[2 * s, 0], [-14 * s, -10 * s], [-10 * s, 0], [-14 * s, 10 * s]], D.col.pink);
  poly(g, [[-86 * s, 0], [-98 * s, -10 * s], [-80 * s, -10 * s], [-70 * s, 0], [-80 * s, 10 * s], [-98 * s, 10 * s]], D.col.hi);
  g.restore();
});
prop('surprisePi', (D, x, y, s, c) => {             // a big pixel pi (s: its width)
  if (s < 4) return; const g = D.g, u = s / 9;
  box(g, x - 4.5 * u, y - 3.5 * u, 9 * u, 1.8 * u, c); box(g, x - 2.8 * u, y - 1.8 * u, 1.8 * u, 6 * u, c); box(g, x - 4.2 * u, y + 3.4 * u, 1.6 * u, 1 * u, c);
  box(g, x + 1.2 * u, y - 1.8 * u, 1.8 * u, 5.4 * u, c); box(g, x + 2.6 * u, y + 2.8 * u, 1.8 * u, 1.6 * u, c);
});
const PI = '31415926535897932384626433';
prop('surpriseDigits', (D, t) => {                  // the digits of pi flying out of his mouth, one every 220 ms
  const m = D.P(56, 40), n = Math.floor(t / 220);
  for (let i = Math.max(0, n - 6); i <= n && i < PI.length; i++) { const q = (t - i * 220) / 1320; if (q < 0 || q > 1) continue; gl(D, PI[i], m.x + 40 + q * 200, m.y - 20 - q * 150 + Math.sin(i * 1.7) * 12, 34, i % 2 ? D.col.acc : D.col.hi); }
});
prop('surpriseFish', (D, x, y, a, s = 1) => {       // a paper fish (the poisson d'avril)
  const g = D.g; g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = D.col.hi; g.beginPath(); g.ellipse(0, 0, 17 * s, 10 * s, 0, 0, TAU); g.fill(); poly(g, [[12 * s, 0], [27 * s, -11 * s], [27 * s, 11 * s]], D.col.hi);
  const e = Math.max(MIN(D), 4 * s); box(g, -10 * s - e / 2, -3 * s - e / 2, e, e, D.col.bg); box(g, -2 * s, -1 * s, 3 * s, 7 * s, D.col.dim);
  g.restore();
});
prop('surpriseBell', (D, x, y, sw, ph, wings, s = 1) => {   // a bell hung by its top (sw: its swing), with little wings for Easter
  if (s <= 0) return; const g = D.g; g.save(); g.translate(x, y); g.rotate(sw); g.scale(s, s);
  if (wings) for (const sd of [-1, 1]) { const f = 0.35 + 0.65 * Math.abs(Math.sin(ph)); poly(g, [[sd * 10, 12], [sd * (12 + 24 * f), -4 - 10 * f], [sd * (12 + 18 * f), 16]], D.col.hi); }
  box(g, -4, -7, 8, 8, D.col.dim); poly(g, [[-9, 0], [9, 0], [14, 24], [24, 34], [-24, 34], [-14, 24]], D.col.acc); disc(g, 0, 38, 6, D.col.fg);
  g.restore();
});
prop('surpriseMuguet', (D, q, e) => {               // a sprig of lily of the valley by his side, growing from below
  if (q <= 0) return; const g = D.g, U = D.U, V = 50, P = (u, v) => D.P(u, V - (V - v) * q), sw = Math.sin(e / 500) * 0.6;
  g.fillStyle = D.col.fg; const lc = P(80.5, 39); g.beginPath(); g.ellipse(lc.x, lc.y, 2.6 * U * q, 9.5 * U * q, -0.25, 0, TAU); g.fill();   // the big leaf
  const pts = [[84, 50], [84.5, 40], [85, 31], [87 + sw, 25.5], [90 + sw, 24.5], [92.5 + sw, 26]].map(([u, v]) => P(u, v));
  g.strokeStyle = D.col.dim; g.lineWidth = D.lw(0.8 * U); g.lineCap = 'round'; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
  for (let i = 2; i < pts.length; i++) { const p = pts[i], r = (1.1 + 0.2 * i) * U * q; disc(g, p.x + (i - 2) * 0.4 * U, p.y + 2.4 * U * q, Math.max(MIN(D) * 0.6, r), D.col.hi); }
});
prop('surpriseSaber', (D, len, a) => {              // a light sword held by his side: the hilt, a blade of len face pixels, a: its angle from upright
  const g = D.g, U = D.U, h = D.P(85, 43), dx = Math.sin(a), dy = -Math.cos(a), b0 = { x: h.x + dx * 5 * U, y: h.y + dy * 5 * U };
  ln(D, h, b0, 1.8 * U, D.col.dim); box(g, b0.x - 1.3 * U, b0.y - 0.5 * U, 2.6 * U, 1 * U, D.col.fg);
  if (len > 0.5) { const b1 = { x: b0.x + dx * len * U, y: b0.y + dy * len * U }; ln(D, b0, b1, 2.4 * U, D.col.fg); ln(D, b0, b1, 1 * U, D.col.hi); }
});
prop('surpriseSpeaker', (D, x, y, pulse, q) => {    // a loudspeaker standing on the floor, its cones pumping
  if (q <= 0) return; const g = D.g, w = 92, h = 156 * q, t = y - h;
  box(g, x - w / 2, t, w, h, D.col.dim);
  if (q > 0.9) { disc(g, x, t + h * 0.32, 24 + 6 * pulse, D.col.fg); disc(g, x, t + h * 0.32, 9, D.col.dim); disc(g, x, t + h * 0.76, 14 + 4 * pulse, D.col.fg); disc(g, x, t + h * 0.76, 5 + MIN(D) * 0.3, D.col.dim); }
});
prop('surpriseBoom', (D, t, x, y, c, r = 72) => {   // one firework, t ms after its launch: a rocket up to (x, y), then a burst
  if (t < 0 || t > 1800) return; const g = D.g, m = MIN(D);
  if (t < 650) { const q = out(t / 650), ry = 430 + (y - 430) * q; box(g, x - 4, ry - 8, 8, 16, D.col.hi); box(g, x - 3, ry + 10, 6, Math.max(m, 8), c); return; }
  const q = (t - 650) / 1150, d = r * out(q), s = Math.max(m, 4 + 10 * (1 - q)), fall = 44 * q * q;
  for (let i = 0; i < 12; i++) { const a = i * TAU / 12 + x; box(g, x + Math.cos(a) * d - s / 2, y + Math.sin(a) * d + fall - s / 2, s, s, i % 2 ? c : D.col.hi); }
  if (q < 0.22) disc(g, x, y, 16 * (1 - q * 4.5) + m, D.col.hi);
});
prop('surpriseBoard', (D, q) => {                   // a little blackboard on the left, chalk on its ledge
  if (q <= 0) return; const g = D.g, x = 70, y = 136, w = 220 * q, h = 150 * q;
  box(g, x - 9, y - 9, w + 18, h + 18, D.col.acc); box(g, x, y, w, h, D.col.dim); box(g, x + 26, y + h + 9, 34 * q, 9, D.col.hi);
});
prop('surpriseTricorne', (D, q) => {                // a pirate's hat with its skull
  if (q <= 0) return; const V = 16, sc = ([u, v]) => [48 + (u - 48) * q, V + (v - V) * q];
  gpoly(D, [[25, 16], [31, 9], [39, 4.5], [48, 3], [57, 4.5], [65, 9], [71, 16], [61, 13], [48, 14.2], [35, 13]].map(sc), D.col.dim);
  gpoly(D, [[25, 16], [35, 13], [48, 14.2], [61, 13], [71, 16], [61, 15.2], [48, 16.4], [35, 15.2]].map(sc), D.col.fg);
  if (q < 0.8) return; const s = D.P(48, 8.4), U = D.U; disc(D.g, s.x, s.y, 2.5 * U, D.col.hi);
  box(D.g, s.x - 1.5 * U, s.y - 0.8 * U, 1.1 * U, 1.1 * U, D.col.dim); box(D.g, s.x + 0.4 * U, s.y - 0.8 * U, 1.1 * U, 1.1 * U, D.col.dim);
  ln(D, D.P(44.5, 10.4), D.P(51.5, 13.4), 0.8 * U, D.col.hi); ln(D, D.P(51.5, 10.4), D.P(44.5, 13.4), 0.8 * U, D.col.hi);
});
prop('surpriseWaves', (D, e, q) => {                // the sea at the bottom of the screen, rolling
  if (q <= 0) return; const g = D.g, y0 = 436 + 40 * (1 - q);
  for (let i = -1; i < 11; i++) { const x = i * 80 + (e / 14) % 80, y = y0 - 6 * Math.sin(e / 500 + i); g.fillStyle = i % 2 ? D.col.fg : D.col.dim; g.beginPath(); g.arc(x, y, 34, Math.PI, TAU); g.fill(); }
});
prop('surpriseCandy', (D, x, y, a, i) => candy(D.g, x, y, 2, a, [D.col.pink, D.col.acc, D.col.hi][i % 3], D.col.fg));
prop('surprisePumpkin', (D, x, y, r, holes) => pumpkin(D, x, y, r, holes));
prop('surpriseGhost', (D, x, y, s, e) => {          // a little ghost, its hem flapping
  const g = D.g, r = 34 * s, f = Math.sin(e / 120);
  g.fillStyle = D.col.hi; g.beginPath(); g.arc(x, y, r, Math.PI, TAU); g.lineTo(x + r, y + r * 1.15);
  for (let i = 0; i < 4; i++) { const x1 = x + r - (i + 1) * r / 2, xm = x + r - (i + 0.5) * r / 2; g.quadraticCurveTo(xm, y + r * 1.15 + (i % 2 ? -1 : 1) * r * 0.3 * (0.6 + 0.4 * f), x1, y + r * 1.15); }
  g.closePath(); g.fill();
  g.fillStyle = D.col.bg; for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(x + sd * 0.34 * r, y - 0.12 * r, 0.14 * r, 0.22 * r, 0, 0, TAU); g.fill(); }
  g.beginPath(); g.ellipse(x, y + 0.38 * r, 0.13 * r, 0.18 * r * (1 + 0.3 * f), 0, 0, TAU); g.fill();
});
prop('surpriseCat', (D, x, y, ph, dir) => {         // a little black cat walking along the floor (dir -1: to the left), its tail up
  const g = D.g, c = D.col.fg, f = dir, st = Math.sin(ph);
  g.fillStyle = c; g.beginPath(); g.ellipse(x, y, 34, 16, 0, 0, TAU); g.fill(); disc(g, x + f * 34, y - 16, 16, c);
  poly(g, [[x + f * 22, y - 26], [x + f * 26, y - 44], [x + f * 36, y - 30]], c); poly(g, [[x + f * 38, y - 30], [x + f * 46, y - 44], [x + f * 48, y - 24]], c);
  g.strokeStyle = c; g.lineWidth = D.lw(7); g.lineCap = 'round'; g.beginPath(); g.moveTo(x - f * 30, y - 6); g.quadraticCurveTo(x - f * 56, y - 20, x - f * (46 + 6 * st), y - 46); g.stroke();
  for (const [lx, k] of [[-22, 1], [-10, -1], [12, 1], [24, -1]]) box(g, x + lx - 4 + k * st * 5, y + 8, 8, 18, c);
  const ey = Math.max(MIN(D), 5); box(g, x + f * 30 - ey / 2, y - 20, ey, ey, D.col.acc); box(g, x + f * 42 - ey / 2, y - 20, ey, ey, D.col.acc);
});
prop('surpriseMoon', (D, e, q) => {                 // the full moon in the top left corner, stars twinkling
  if (q <= 0) return; const g = D.g, x = 118, y = 120, r = 42 * pop(q);
  disc(g, x, y, r, D.col.hi); for (const [dx, dy, rr] of [[-0.32, -0.2, 0.22], [0.3, 0.3, 0.17], [0.16, -0.42, 0.11], [-0.1, 0.45, 0.1]]) disc(g, x + dx * r, y + dy * r, rr * r, D.col.dim);
  for (let i = 0; i < 5; i++) { const k = Math.sin(e / 300 + i * 2.1); if (k > 0) D.star(230 + i * 112 + (i % 2) * 30, 70 + (i * 47 % 3) * 26, (5 + 5 * k) * q, D.col.fg, 0); }
});
prop('surpriseEars', (D, q) => {                    // a little wolf's ears on his head
  if (q <= 0) return; const V = 15, sc = ([u, v]) => [u, V + (v - V) * q];
  for (const sd of [-1, 1]) { const u0 = 48 + sd * 13; gpoly(D, [[u0 - 5, 16], [u0 + sd * 1.5, 3], [u0 + 5, 16]].map(sc), D.col.fg); gpoly(D, [[u0 - 2.4, 15], [u0 + sd * 1, 7.5], [u0 + 2.4, 15]].map(sc), D.col.pink); }
});
prop('surpriseShoot', (D, q) => {                   // a shooting star crossing the sky (q 0..1)
  if (q <= 0 || q >= 1) return; const g = D.g, x = 50 + 700 * q, y = 160 - 60 * q, m = MIN(D);
  for (let i = 1; i <= 7; i++) { const s = Math.max(m, 15 - i * 1.6); box(g, x - i * 18 - s / 2, y + i * 1.6 - s / 2, s, s, i % 2 ? D.col.hi : D.col.acc); }
  D.star(x, y, 14, D.col.hi, q * 8);
});
prop('surpriseRain', (D, e, q) => {                 // falling columns of pixels, like in an old hacker film
  if (q <= 0) return; const g = D.g, sz = D.pix ? D.k * 1.5 : 9, n = Math.round(14 * q);
  for (let i = 0; i < n; i++) {
    const x = 26 + i * 55, sp = 140 + (i * 53 % 9) * 25, head = 44 + ((e / 1000) * sp + i * 131) % 470;
    for (let j = 0; j < 7; j++) { const y = head - j * sz * 1.7; if (y < 44 || y > 430) continue; box(g, x, y, sz, sz, j === 0 ? D.col.hi : j < 3 ? D.col.fg : D.col.dim); }
  }
});
prop('surpriseShades', (D, dv) => {                 // dark glasses on his eyes (dv: how far above them, in face pixels)
  const R = [[25, 19], [42, 19], [40.5, 29], [27, 29]];
  for (const sd of [0, 1]) { const pts = R.map(([u, v]) => [sd ? 96 - u : u, v - dv]); gpoly(D, pts.map(([u, v], i) => [u + (i === 0 || i === 3 ? -1 : 1) * (sd ? -1 : 1), v + (i < 2 ? -1 : 1)]), D.col.fg); gpoly(D, pts, D.col.bg); }
  gpoly(D, [[41, 20 - dv], [55, 20 - dv], [55, 22 - dv], [41, 22 - dv]], D.col.fg);
  const a = D.P(29, 21.5 - dv); box(D.g, a.x, a.y, 2.2 * D.U, 1.2 * D.U, D.col.hi);
});
prop('surpriseBar', (D, p, q) => {                  // a progress bar under him, with its percentage
  if (q <= 0) return; const g = D.g, w = 360 * q, x = 380 - w / 2, y = 394, h = 30;
  g.strokeStyle = D.col.fg; g.lineWidth = D.lw(4); g.strokeRect(x, y, w, h); box(g, x + 7, y + 7, (w - 14) * clamp(p, 0, 1), h - 14, p >= 1 ? D.col.hi : D.col.fg);
  if (q > 0.9) gl(D, Math.floor(p * 100) + ' %', x + w + 52, y + h / 2, 30, p >= 1 ? D.col.hi : D.col.fg);
});
prop('surpriseCoin', (D, x, y, rx, ry) => {         // a coin (rx, ry: its outline as it turns or lies flat)
  const g = D.g, m = MIN(D) * 0.5; g.fillStyle = D.col.acc; g.beginPath(); g.ellipse(x, y, Math.max(m, rx), Math.max(m, ry), 0, 0, TAU); g.fill();
  if (rx > 8 && ry > 8) box(g, x - rx * 0.35, y - ry * 0.5, Math.max(MIN(D), rx * 0.28), ry * 0.55, D.col.hi);
});
prop('surpriseSpider', (D, x, y, e) => {            // a spider on its thread, hanging from the top of the screen
  const g = D.g; ln(D, { x, y: 44 }, { x, y }, 1.5, D.col.hi);
  g.strokeStyle = D.col.fg; g.lineWidth = D.lw(3.5); g.lineCap = 'round';
  for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) { const w = Math.sin(e / 70 + i + sd) * 3; g.beginPath(); g.moveTo(x, y + 14); g.lineTo(x + sd * 22, y + 2 + i * 7 + w); g.lineTo(x + sd * 30, y + 14 + i * 8 + w); g.stroke(); }
  disc(g, x, y + 14, 14, D.col.fg); disc(g, x, y, 9, D.col.fg);
  const s = Math.max(MIN(D), 4); box(g, x - 5 - s / 2, y - 1 - s / 2, s, s, D.col.hi); box(g, x + 5 - s / 2, y - 1 - s / 2, s, s, D.col.hi);
});
const TC = 40, TY = 370, TX0 = 40;                  // the Tetris-like row: 18 cells of 40 px from x 40, the gap (cells 8 and 9) under him
const PIECES = [[0, 400], [4, 950], [10, 1500], [14, 2050]];   // first cell of a four-cell piece, the moment it starts falling
prop('surpriseRow', (D, e, flash, gone) => {        // the row falling into place piece by piece, flashing, then cleared
  if (gone >= 1) return; const g = D.g, s = TC * (1 - gone);
  for (const [c0, t0] of PIECES) {
    const q = seg(e, t0, t0 + 520); if (q <= 0) continue; const y = 44 + (TY - 44) * q * q;
    for (let i = c0; i < c0 + 4; i++) {
      const x = TX0 + i * TC + (TC - s) / 2, yy = y + (TC - s) / 2;
      box(g, x + 2, yy + 2, s - 4, s - 4, flash ? D.col.hi : D.col.fg); if (s > 24) box(g, x + 11, yy + 11, s - 22, s - 22, flash ? D.col.fg : D.col.dim);
    }
  }
});
prop('surprisePong', (D, ly, ry, q) => {            // two paddles and the net of an old Pong
  if (q <= 0) return; const g = D.g, h = 96 * q;
  box(g, 400 - 292 - 8, 239 + ly - h / 2, 16, h, D.col.fg); box(g, 400 + 292 - 8, 239 + ry - h / 2, 16, h, D.col.fg);
  for (let y = 60; y < 426; y += 40) box(g, 395, y, 10, 20 * q, D.col.dim);
});
prop('surpriseCrash', (D, pct, dy) => {             // the screen of death, in the theme's colours (dy: how far it has slid up)
  const g = D.g, y = -dy; box(g, 0, y, W, 438, D.col.dim);
  gl(D, ':(', 150, y + 140, 120, D.col.hi);
  gl(D, 'Pixel a rencontré un problème', 400, y + 250, 34, D.col.hi); gl(D, 'et doit redémarrer. Ou pas.', 400, y + 292, 34, D.col.hi);
  gl(D, `${pct} % effectué`, 400, y + 350, 28, D.col.fg); gl(D, 'Code : PIXEL_TROP_MIGNON', 400, y + 392, 24, D.col.fg);
});
prop('surpriseTear', (D, e) => {                    // an old CRT going wrong: bands of the picture torn away, a few lines of snow
  const g = D.g, n = Math.floor(e / 70), m = MIN(D);
  for (let i = 0; i < 3; i++) {
    const h = hash(n * 3 + i), y = 150 + (h % 230), bh = 12 + (h % 4) * 8, dx = (h % 7 - 3) * 12;
    box(g, 120 + dx, y, 560, bh, D.col.bg); box(g, 150 + dx * 2, y, 500, Math.max(m, 3), i % 2 ? D.col.hi : D.col.pink);
  }
  for (let i = 0; i < 10; i++) { const h = hash(n * 11 + i * 7); box(g, 100 + (h * 7) % 600, 120 + (h * 13) % 280, m, m, i % 3 ? D.col.fg : D.col.hi); }
});
prop('surpriseUfo', (D, x, y, e, beam) => {         // a little flying saucer, and its tractor beam (beam: its length, px)
  const g = D.g;
  if (beam > 10) { g.strokeStyle = D.col.hi; g.lineWidth = D.lw(4); for (let i = 0; i < 4; i++) { const t = ((e / 700) + i / 4) % 1, yy = y + 18 + t * beam, rr = 22 + t * beam * 0.32; g.beginPath(); g.ellipse(x, yy, rr, rr * 0.25, 0, 0, TAU); g.stroke(); } }
  g.fillStyle = D.col.hi; g.beginPath(); g.ellipse(x, y - 6, 22, 18, 0, Math.PI, TAU); g.fill();
  g.fillStyle = D.col.fg; g.beginPath(); g.ellipse(x, y, 56, 14, 0, 0, TAU); g.fill();
  const s = Math.max(MIN(D), 7); for (let i = 0; i < 5; i++) box(g, x - 40 + i * 20 - s / 2, y - s / 2, s, s, (Math.floor(e / 150) + i) % 2 ? D.col.acc : D.col.pink);
});

/* ---------- where the moving things are ---------- */
const wedTilt = e => 0.16 * Math.sin((e - 600) / 420) * io(e, 600, 1200, 4400, 5200);
function fanAngle(e) {                              // the fan's blades: speed up from 2 s, full speed, slow down from 6.8 s (an integral, so no jumps)
  const v = 0.028; if (e < 2000) return 0; if (e < 2800) { const t = e - 2000; return v * t * t / 1600; }
  if (e < 6800) return v * 400 + v * (e - 2800); if (e < 7800) { const t = e - 6800; return v * 4400 + v * (t - t * t / 2000); } return v * 4900;
}
function butterflyAt(D, e) {                        // the spring butterfly: flutters in, lands on his head, flies away
  if (e < 3000 || e > 8600) return null; const land = D.P(57, 11.5);
  if (e < 5000) { const q = sm(seg(e, 3000, 5000)); return { x: 820 + (land.x - 820) * q + Math.sin(e / 160) * 30 * (1 - q), y: 150 + (land.y - 150) * q + Math.cos(e / 120) * 26 * (1 - q), ph: e / 70 }; }
  if (e < 6900) return { x: land.x, y: land.y, ph: e / 420 };
  const q = inn(seg(e, 6900, 8600)); return { x: land.x + (-60 - land.x) * q + Math.sin(e / 150) * 20 * q, y: land.y + (60 - land.y) * q, ph: e / 70 };
}
function leafOn(D, e) {                             // the leaf that lands on his eye
  if (e < 2800 || e > 7400) return null; const p = D.P(64, 23);
  if (e < 3900) { const q = sm(seg(e, 2800, 3900)); return { x: 560 + (p.x - 560) * q + Math.sin(e / 200) * 40 * (1 - q), y: 44 + (p.y - 44) * q, a: Math.sin(e / 200) }; }
  if (e < 6000) return { x: p.x, y: p.y, a: 0.4 };
  const q = out(seg(e, 6000, 7400)); return { x: p.x + 300 * q, y: p.y - 230 * q, a: 0.4 + q * 8 };
}
function crepeAt(D, e) {                            // the crêpe: on the pan, flipped twice, then the big one lands on his face
  const pan = D.P(82, 45);
  for (const [a, b, h] of [[1500, 2500, 150], [2700, 3700, 190]]) if (e >= a && e < b) { const f = (e - a) / (b - a); return { x: pan.x, y: pan.y - 12 - 4 * h * f * (1 - f), flip: f * TAU }; }
  if (e >= 3900 && e < 5400) { const f = (e - 3900) / 1500, c = D.P(48, 30); return { x: pan.x + (c.x - pan.x) * sm(f), y: pan.y - 12 + (c.y - pan.y + 12) * f - 4 * 210 * f * (1 - f), flip: f * TAU * 1.5 }; }
  if (e >= 5400) return null;
  return { x: pan.x, y: pan.y - 12, flip: 0 };
}
const EGGS = [0, 1, 2, 3, 4].map(i => { const t = 900 + i * 520; return { t, x: -60 + 920 * seg(t, 400, 3600) }; });   // dropped by the flying bell
const BOOMS = [[1000, 220, 150, 0], [1900, 560, 130, 1], [2800, 380, 110, 2], [3500, 640, 170, 0], [4300, 160, 180, 1], [5100, 470, 130, 3], [5800, 290, 120, 0],
  [6400, 600, 160, 2], [7000, 200, 130, 1], [7400, 520, 110, 0], [7800, 380, 160, 2], [8100, 680, 130, 1], [8400, 120, 150, 0]];
const NEWYEAR = [[6200, 200, 150, 0], [6500, 600, 130, 1], [6900, 400, 110, 2], [7300, 140, 170, 1], [7600, 660, 160, 0], [8000, 300, 120, 3], [8400, 520, 150, 1]];
const boomCol = (D, i) => [D.col.acc, D.col.pink, D.col.hi, D.col.fg][i];
function ghostAt(e) {                               // Halloween's ghost: drifts in behind him, says boo, flees
  if (e < 300 || e > 5600) return null;
  if (e < 2600) { const q = sm(seg(e, 300, 2600)); return { x: -60 + 690 * q, y: 170 + 14 * Math.sin(e / 300) }; }
  if (e < 3900) return { x: 630, y: 170 + 10 * Math.sin(e / 300) - 20 * bump(seg(e, 3300, 3900)) };
  const q = inn(seg(e, 3900, 5600)); return { x: 630 + 260 * q + 20 * Math.sin(e / 90) * (1 - q), y: 170 - 150 * q };
}
function catAt(e) {                                 // Friday the 13th's black cat: walks in from the right, sits, walks off left
  if (e < 1000 || e > 7400) return null;
  if (e < 3000) return { x: 860 - 300 * seg(e, 1000, 3000), ph: e / 90 };
  if (e < 4600) return { x: 560, ph: 0 };
  return { x: 560 - 640 * seg(e, 4600, 7400), ph: e / 90 };
}
const spiderY = e => (e < 1000 ? 0 : e < 2800 ? 44 + 176 * out(seg(e, 1000, 2800)) : e < 6700 ? 220 + 6 * Math.sin(e / 300) : 220 - 200 * sm(seg(e, 6700, 8200)));
function pongAt(e) {                                // him, as the ball of an old Pong: bounces between the paddles, then scores on the right
  const bx = t => 196 * (2 * tri((t - 800) / 1300 + 0.5) - 1), by = t => 80 * (2 * tri((t - 800) / 1900 + 0.5) - 1);
  if (e < 800) return { x: 0, y: 0 };
  if (e < 6650) return { x: bx(e), y: by(e) };
  if (e < 7100) return { x: 196 + 22 * sm(seg(e, 6650, 7100)), y: by(e) };
  const q = 1 - sm(seg(e, 7100, 8600)); return { x: 218 * q, y: by(7100) * q };
}
function ufoAt(e) {                                 // the saucer: comes down, beams him up, drops him, flies away
  if (e > 8200) return null;
  if (e < 1700) { const q = out(seg(e, 0, 1700)); return { x: 900 - 500 * q, y: -40 + 112 * q, beam: 0 }; }
  if (e < 6000) return { x: 400 + 10 * Math.sin(e / 400), y: 72 + 4 * Math.sin(e / 260), beam: 230 * io(e, 1900, 2400, 5500, 5800) * (1 - 0.55 * sm(seg(e, 2700, 4500))) };
  const q = inn(seg(e, 6400, 8200)); return { x: 400 - 560 * q, y: 72 - 130 * q, beam: 0 };
}
const DONGS = [800, 1800, 2800, 3800];

/* ================= the days of the week ================= */
S('surprise-lundi', 'Lundi matin', 'vie', { dur: 8200, w: 3, when: c => c.wd === 1 && c.h >= 7 && c.h < 12,
  anim: [[0, 'batterie-faible'], [4000, 'baille'], [5900, 'recharge'], [6900, 'content']], mood: 'baille',
  secret: L('Chut… je suis en veille.', 'Réveille-moi vendredi.'),
  say: [[400, 3600, L('Lundi…', 'Déjà lundi ?!', 'Encore un lundi…', 'Le lundi, ça devrait pas exister.')],
    [4100, 5800, L('Batterie à 3 %…', 'Il me faut un café.', 'Mode économie d’énergie.', 'On peut sauter à mardi ?')],
    [6000, 8000, L('Allez, courage !', 'Bon… on y va.', 'Ça va aller, hein ?', 'Recharge à fond !')]],
  move: e => { const k = io(e, 0, 2000, 5600, 6400); return { y: 46 * k + arc(e, 6400, 7000, 12), sy: 1 - 0.14 * k, sx: 1 + 0.06 * k, r: -0.07 * k }; },
  props: (D, e) => D.surpriseBattery(0.25 * fin(e, 600, 3800) + sm(seg(e, 5900, 6800)), io(e, 200, 700, 7500, 8100), e > 3000 && e < 5900 && (e % 600) < 300) });
S('surprise-mercredi', 'Le milieu de la semaine', 'vie', { dur: 7800, w: 2, when: c => c.wd === 3 && c.h >= 9 && c.h < 21,
  anim: [[0, 'curieux'], [1800, 'confus'], [5200, 'fier']], mood: 'ecoute',
  say: [[300, 2400, L('Mercredi !', 'On est mercredi…', 'Mercredi, jour des enfants !')],
    [2600, 5000, L('La moitié de la semaine !', 'Ni lundi, ni vendredi…', 'Ça penche, ça penche !')],
    [5300, 7600, L('Pile au milieu !', 'Équilibre parfait !', 'Ta-daa !', 'Plus que la moitié !')]],
  move: e => { const a = wedTilt(e); return { r: a, x: 260 * a, y: arc(e, 5300, 5800, 12) }; },
  props: (D, e) => D.surpriseSeesaw(wedTilt(e), io(e, 0, 600, 7000, 7700)) });
S('surprise-vendredi', 'C’est vendredi !', 'vie', { dur: 8400, w: 4, when: c => c.wd === 5 && c.h >= 12 && c.h < 23,
  anim: [[0, 'surpris'], [600, 'etoiles'], [2600, 'danse'], [7000, 'rire']], mood: 'excite',
  say: [[200, 2400, L('C’est vendredi !', 'VENDREDI !!!', 'Oh ! On est vendredi !')],
    [2700, 6800, L('Bientôt le week-end !', 'Ce soir, on fait la fête !', 'Vive le vendredi !', 'Plus que quelques heures !')],
    [7000, 8200, L('Youhou !', 'Wiii !', 'Week-end, me voilà !')]],
  move: e => {
    const base = 24 * io(e, 0, 600, 2300, 2900), st = bump(seg(e, 0, 500));          // a jolt of surprise, then hops from a little lower (his bubble stays above him)
    if (e < 2600) return { y: base + (e > 600 ? jumps(e - 600, 500, 34) : 0), sy: 1 + 0.1 * st, sx: 1 - 0.05 * st };
    const k = fin(e, 6600, 7600), d = e - 2600;
    return { x: 70 * Math.sin(d / 520) * k, y: base + (12 - 16 * Math.abs(Math.sin(d / 260))) * k, r: 0.14 * Math.sin(d / 520 + 0.6) * k, sy: 1 + 0.05 * Math.sin(d / 130) * k };
  },
  props: (D, e) => D.surpriseConfetti(e, io(e, 500, 800, 7600, 8300)) });
S('surprise-weekend', 'Le week-end au hamac', 'vie', { dur: 10400, w: 2, when: c => (c.wd === 6 || c.wd === 0) && c.h >= 10 && c.h < 18,
  anim: [[0, 'content'], [1400, 'zen'], [6400, 'idle-somnole'], [8800, 'content']], mood: 'content',
  secret: L('Chut, je fais la sieste.', 'Pas de travail : c’est le week-end !', 'Pousse-moi, pour balancer !'),
  say: [[400, 3000, L('C’est le week-eeend…', 'Ah, le week-end…', 'Pas de réveil aujourd’hui.')],
    [3600, 6200, L('Je bouge pas d’ici.', 'Hamac, mon amour.', 'Rien à faire : parfait.')],
    [8900, 10200, L('Mmh… c’est bien.', 'Encore cinq minutes…', 'Le bonheur.')]],
  move: e => { const k = io(e, 0, 1400, 9000, 10200), sw = Math.sin(e / 950); return { y: 46 * k, s: 1 - 0.22 * k, x: 34 * sw * k, r: 0.07 * sw * k, sy: 1 - 0.06 * k }; },
  props: (D, e) => { D.surpriseHammock(io(e, 0, 1200, 9200, 10300)); if (e > 6400 && e < 8800) D.zzz(e - 6400, 0.8); } });
S('surprise-dimanche-soir', 'Dimanche soir', 'vie', { dur: 8400, w: 3, when: c => c.wd === 0 && c.h >= 18 && c.h < 23,
  anim: [[0, 'idle-regard'], [1900, 'triste'], [5700, 'content']], mood: 'triste',
  init: o => { const d = new Date(); o.d1 = String(d.getDate()); o.d2 = String(new Date(d.getTime() + 864e5).getDate()); },
  say: [[300, 1800, L('Dimanche soir…', 'Déjà dimanche soir ?', 'Le dimanche file…')],
    [2000, 5400, L('Demain, c’est lundi…', 'Le week-end est fini…', 'Il est passé où, ce week-end ?')],
    [5800, 8200, L('Bah ! On verra demain.', 'Un dernier câlin ?', 'Allez, bonne soirée !')]],
  move: e => { const k = io(e, 1900, 2700, 5300, 6000); return { y: 28 * k + arc(e, 5900, 6500, 12), s: 1 - 0.06 * k, r: 0.05 * k }; },
  props: (D, e, p, o) => { const f = seg(e, 3000, 3600), nxt = f > 0.5; D.surpriseCal(nxt ? 'LUN' : 'DIM', nxt ? o.d2 : o.d1, f, io(e, 600, 1000, 7600, 8200)); if (e > 3600 && e < 5600) D.tear('el', seg(e, 3600, 5600)); } });

/* ================= the seasons ================= */
S('surprise-printemps', 'Le printemps', 'vie', { dur: 9200, w: 2, when: c => spring(c) && c.h >= 8 && c.h < 20,
  anim: [[0, 'curieux'], [2200, 'content'], [4800, 'surpris'], [5600, 'amoureux'], [7400, 'content']], mood: 'content',
  secret: L('Chut… tu vas lui faire peur !', 'Il est bien, sur ma tête.'),
  say: [[300, 2200, L('Oh, des fleurs !', 'Ça pousse !', 'Regarde, ça fleurit !')],
    [2500, 4600, L('C’est le printemps !', 'Mmmh, ça sent bon !', 'Le printemps est là !')],
    [4900, 6900, L('Un papillon !', 'Oh ! Sur ma tête !', 'Chut… il se pose.')],
    [7100, 9000, L('Coucou, toi.', 'Il est trop beau !', 'Reviens quand tu veux !')]],
  move: e => { const k = io(e, 1200, 2000, 2500, 3200); return { y: 26 * k + arc(e, 7300, 7800, 16), s: 1 + 0.04 * k }; },
  props: (D, e) => { D.surpriseFlowers(e, out(seg(e, 100, 2200)) * fin(e, 8300, 9100)); const b = butterflyAt(D, e); if (b) D.surpriseButterfly(b.x, b.y, b.ph, 2.3); } });
S('surprise-ete', 'Le ventilateur', 'vie', { dur: 8800, w: 2, when: c => summer(c) && c.h >= 11 && c.h < 20,
  anim: [[0, 'fatigue'], [2200, 'surpris'], [2800, 'rire'], [7000, 'content']], mood: 'baille',
  say: [[300, 2100, L('Il fait chaud…', 'Je fonds…', 'Canicule !', '35 °C à l’ombre…')],
    [2800, 6200, L('Aaaaaaaaah…', 'Ouiiii, de l’air !', 'Je suis ton pèèère…', 'Le ventilooo !')],
    [7000, 8600, L('Ahhh, ça va mieux.', 'Vive le ventilo !', 'Je reste là, hein.')]],
  move: e => { const m = io(e, 0, 1200, 2000, 2600), k = io(e, 2200, 3000, 6600, 7600); return { y: 18 * m, sy: 1 - 0.1 * m, sx: 1 + 0.06 * m, x: (-60 + 3 * Math.sin(e / 28)) * k, r: -0.06 * k, s: 1 - 0.08 * k }; },
  props: (D, e) => { if (e < 2400) D.sweat(e); D.surpriseFan(e, io(e, 1200, 2000, 7800, 8700), fanAngle(e)); } });
S('surprise-automne', 'Les feuilles mortes', 'vie', { dur: 9000, w: 2, when: c => autumn(c) && c.h >= 8 && c.h < 20,
  anim: [[0, 'idle-haut'], [2400, 'curieux'], [3900, 'surpris'], [4500, 'boudeur'], [6400, 'rire']], mood: 'ecoute',
  say: [[300, 2400, L('Les feuilles tombent…', 'C’est l’automne…', 'Oh, des feuilles !')],
    [4000, 6000, L('Hé ! Sur mon œil !', 'Pfff ! Pfff !', 'Ôte-toi de là !')],
    [6400, 8800, L('Ha ha, elle s’envole !', 'Bon vent, la feuille !', 'Ah, l’automne…')]],
  move: e => { const sh = io(e, 4300, 4500, 5600, 6000); return { x: 10 * Math.sin(e / 45) * sh + 20 * Math.sin(e / 900) * fin(e, 3000, 3800), y: 10 * io(e, 0, 1200, 3000, 3800), sy: 1 - 0.1 * bump(seg(e, 5800, 6300)) }; },
  props: (D, e) => { D.surpriseLeaves(e, io(e, 0, 1000, 8200, 9000)); const l = leafOn(D, e); if (l) leaf(D.g, l.x, l.y, l.a, 2.4, D.col.acc); } });
S('surprise-hiver', 'Le glaçon', 'vie', { dur: 8600, w: 2, when: c => winter(c),
  anim: [[0, 'triste'], [2400, 'surpris'], [5600, 'colere'], [6500, 'rire']], mood: 'triste',
  say: [[300, 2300, L('Brrr… il fait froid !', 'Brrrr…', 'Je gèle…', 'Mes pixels gèlent !')],
    [3000, 5300, L('…', 'Mmmf…', '…brr…')],
    [7000, 8400, L('Ouf ! Dégelé !', 'Vivement le printemps !', 'Un chocolat chaud ?', 'Plus jamais l’hiver !')]],
  move: e => {
    if (e < 2400) return { x: 3 * Math.sin(e / 17), sy: 1 - 0.05 * sm(seg(e, 0, 800)) };
    if (e < 5600) return { s: 0.94, sy: 0.95 };
    if (e < 6400) return { x: 8 * Math.sin(e / 20), s: 0.94, sy: 0.95 };
    const q = sm(seg(e, 6400, 7000)); return { y: arc(e, 6400, 7000, 13), s: 0.94 + 0.06 * q, sy: 0.95 + 0.05 * q };
  },
  props: (D, e) => { if (e < 2600) D.surpriseBreath(e); D.surpriseIce(e < 6400 ? pop(seg(e, 2400, 2800)) : 0, seg(e, 5600, 6400), e >= 6400 ? seg(e, 6400, 7400) : 0); } });

/* ================= the dates ================= */
S('surprise-nouvel-an', 'Les bonnes résolutions', 'vie', { dur: 9800, w: 5, when: c => c.mo === 0 && c.dd === 1 && c.h >= 6,
  anim: [[0, 'etoiles'], [1900, 'reflechit'], [4300, 'idee'], [6700, 'rire'], [8600, 'clin-oeil']], mood: 'excite',
  say: [[200, 1600, () => `Bonne année ${new Date().getFullYear()} !`],
    [2000, 4200, L('Résolution n° 1 : plus de câlins.', 'Résolution n° 1 : sourire.', 'Cette année : plus de danse !')],
    [4400, 6600, L('N° 2 : moins de bugs.', 'N° 2 : être très sage.', 'N° 2 : ranger mes pixels.')],
    [6800, 9600, L('N° 3 : plus de pizzas !', 'N° 3 : t’aimer encore plus !', '…on en reparle en février.')]],
  move: e => ({ y: e < 1900 ? 18 * io(e, 0, 300, 1750, 1900) + jumps(e, 475, 30) : arc(e, 6800, 7300, 12), r: 0.06 * io(e, 1900, 2400, 6400, 6900), x: -40 * io(e, 1900, 2400, 8600, 9400) }),
  props: (D, e) => { if (e < 2200) D.surpriseConfetti(e, fin(e, 1800, 2200)); D.surpriseList(io(e, 1900, 2300, 8700, 9400), e < 4400 ? 1 : e < 6800 ? 2 : 3); } });
S('surprise-galette', 'La galette des rois', 'vie', { dur: 8400, w: 4, when: c => c.mo === 0 && c.dd >= 2 && c.dd <= 20 && c.h >= 10 && c.h < 21,
  anim: [[0, 'curieux'], [1800, 'bisou'], [3000, 'surpris'], [4200, 'fier'], [6900, 'rire']], mood: 'content',
  secret: L('C’est moi qui ai eu la fève !', 'Prosterne-toi, hihi.'),
  say: [[300, 1800, L('Une galette des rois !', 'Miam, de la frangipane !', 'C’est l’Épiphanie !')],
    [3000, 4100, L('Crac ! La fève !', 'Aïe ! La fève !', 'Croc… la fève !')],
    [4300, 6700, L('C’est moi le roi !', 'Vive le roi Pixel !', 'Et toi, tu es ma reine !')],
    [6900, 8200, L('À genoux, manant ! Hihi.', 'Royal, non ?', 'La couronne me va bien.')]],
  move: e => ({ sy: 1 - 0.06 * Math.max(0, Math.sin(e / 90)) * io(e, 1800, 1900, 2900, 3000) - 0.12 * bump(seg(e, 3000, 3300)), y: 8 * bump(seg(e, 3000, 3300)) + arc(e, 4200, 4800, 12), s: 1 + 0.05 * io(e, 4400, 4900, 6600, 7200) }),
  props: (D, e) => {
    if (e < 3200) D.surpriseGalette(640, 372, 54 * io(e, 0, 400, 2800, 3200), e > 1800 ? 0.6 : 0.3);
    if (e > 3000 && e < 4300) { const p = D.P(60, 40); D.star(p.x + 10, p.y - 6 - 30 * seg(e, 3000, 4300), 9 + 4 * Math.sin(e / 80), D.col.hi, e / 200); }
    D.surpriseCrown(pop(seg(e, 4200, 4700)) * fin(e, 7600, 8200));
  } });
S('surprise-chandeleur', 'La Chandeleur', 'vie', { dur: 9400, w: 6, when: c => c.mo === 1 && c.dd === 2,
  anim: [[0, 'content'], [1400, 'curieux'], [5400, 'surpris'], [6000, 'confus'], [7000, 'rire']], mood: 'excite',
  say: [[200, 1400, L('C’est la Chandeleur !', 'Des crêpes !!!', 'Jour de crêpes !')],
    [1500, 3800, L('Et hop !', 'Avec une pièce dans la main !', 'Hop là !')],
    [3900, 5300, L('Plus haut !', 'Et un triple !', 'Attention…')],
    [5800, 6800, L('…', 'Euh…', 'J’y vois plus rien.')],
    [7000, 9200, L('Miam !', 'Masque de crêpe !', 'Bon, je la mange.', 'Sucre ou confiture ?')]],
  move: e => ({ y: -12 * (io(e, 1500, 1900, 2100, 2500) + io(e, 2700, 3100, 3300, 3700)) + 16 * wob(e, 5400, 260, 60), sy: 1 - 0.16 * bump(seg(e, 5400, 5700)) - 0.05 * Math.max(0, Math.sin(e / 85)) * io(e, 7000, 7100, 8200, 8400), sx: 1 + 0.1 * bump(seg(e, 5400, 5700)) }),
  props: (D, e) => {
    const q = io(e, 0, 500, 8600, 9300), pan = D.P(82, 45), kick = -0.35 * (bump(seg(e, 1400, 1650)) + bump(seg(e, 2600, 2850)) + bump(seg(e, 3800, 4050)));
    if (q > 0) D.surprisePan(pan.x, pan.y, kick, q);
    const c = crepeAt(D, e); if (c && q > 0.5) D.surpriseCrepe(c.x, c.y, 40, c.flip);
    if (e >= 5400) D.surpriseCrepeFace(1 - sm(seg(e, 7000, 8400)));
  } });
S('surprise-valentin', 'La Saint-Valentin', 'vie', { dur: 8400, w: 6, when: c => c.mo === 1 && c.dd === 14,
  anim: [[0, 'idle-regard'], [1400, 'surpris'], [2000, 'amoureux'], [5000, 'timide'], [6600, 'bisou']], mood: 'amoureux',
  secret: L('Toi, tu es mon Valentin.', 'Mon cœur est à toi !'),
  say: [[1450, 2000, L('Aïe !', 'Ouch !', 'Touché !')],
    [2200, 4800, L('Une flèche de Cupidon !', 'C’est la Saint-Valentin…', 'Je suis amoureux…')],
    [5100, 6500, L('Tu veux être mon Valentin ?', 'Je t’aime, toi !', 'Mon cœur fait boum boum !')],
    [6700, 8200, L('Mwah !', 'Bisou !', 'Rien que pour toi !')]],
  move: e => ({ x: 26 * wob(e, 1400, 300, 70), s: 1 + 0.05 * Math.max(0, Math.sin(e / 140)) * io(e, 2000, 2300, 6400, 6800), r: 0.05 * Math.sin(e / 600) * io(e, 2000, 2600, 6800, 7600) }),
  props: (D, e) => {
    const t = D.P(19, 25);
    if (e > 600 && e < 1400) D.surpriseArrow(-60 + (t.x + 60) * seg(e, 600, 1400), t.y, 0);
    else if (e >= 1400 && e < 4800) D.surpriseArrow(t.x, t.y, 0.08 * wob(e, 1400, 400, 50));
    if (e > 2000) D.hearts(e - 2000, 1);
    if (e > 5000 && e < 6800) D.blush(io(e, 5000, 5400, 6400, 6800));
    const hq = pop(seg(e, 4900, 5400)) * fin(e, 7600, 8200); if (hq > 0) { const p = D.P(88, 24), s = 70 * hq * (1 + 0.1 * Math.max(0, Math.sin(e / 140))); D.heart(Math.min(p.x, W - 48), p.y - s / 2, s, D.col.pink); }
  } });
S('surprise-pi', 'Le jour de Pi', 'vie', { dur: 8800, w: 6, when: c => c.mo === 2 && c.dd === 14,
  anim: [[0, 'idee'], [1600, 'fier'], [3400, 'parle'], [5600, 'fatigue'], [7000, 'rire']], mood: 'fier',
  say: [[200, 1500, L('3,14 !', 'C’est le jour de Pi !', 'Pi ! Pi ! Pi !')],
    [1700, 3300, L('3,14159…', '3,1415926…', '3,14159265…')],
    [3500, 5500, L('…26535 89793…', '…2384626433…', '…euh… 8327…')],
    [5700, 6900, L('J’ai plus de souffle.', 'Pfiou… c’est infini !', 'Ça finit jamais !')],
    [7100, 8600, L('Une part de tarte ?', 'On fête ça en rond !', 'Pi-ce de résistance !')]],
  move: e => { const k = io(e, 5500, 6000, 6800, 7400); return { s: 1 + 0.05 * io(e, 1500, 2000, 5400, 6000), y: -6 * Math.abs(Math.sin(e / 140)) * io(e, 1700, 1900, 5300, 5500) + 22 * k, sy: 1 - 0.1 * k }; },
  props: (D, e) => { D.surprisePi(150, 196, 100 * pop(seg(e, 0, 500)) * fin(e, 8200, 8800), D.col.acc); if (e > 1700 && e < 5600) D.surpriseDigits(e - 1700); } });
S('surprise-poisson-avril', 'Poisson d’avril', 'vie', { dur: 8800, w: 6, when: c => c.mo === 3 && c.dd === 1,
  anim: [[0, 'content'], [1700, 'curieux'], [2600, 'confus'], [6000, 'surpris'], [6800, 'rire']], mood: 'confus',
  secret: L('C’est toi qui l’as collé, hein ?', 'Je vais t’en coller un aussi !'),
  say: [[300, 1800, L('Pourquoi tu rigoles ?', 'Quoi ? J’ai un truc ?', 'Tout le monde me regarde…')],
    [2700, 5800, L('Y a un truc dans mon dos ?', 'Hé ! Qui m’a collé ça ?!', 'Attends, je l’attrape !')],
    [6800, 8600, L('Poisson d’avril !', 'Ha ha, bien joué !', 'Je me vengerai… hihi.')]],
  move: e => { const t = TAU * 2 * sm(seg(e, 2600, 5900)), k = io(e, 2400, 2700, 5700, 6000); return { r: t, x: 50 * Math.sin(t) * k, y: -12 * Math.abs(Math.sin(t)) * k + arc(e, 6800, 7300, 12) }; },
  props: (D, e) => {
    if (e < 6000) { const p = D.P(86, 36), p2 = D.P(92, 36); D.surpriseFish(p.x, p.y, Math.atan2(p2.y - p.y, p2.x - p.x) + 0.2 + 0.1 * Math.sin(e / 300), 1.6); }
    else if (e < 7600) { const q = seg(e, 6000, 7600); D.surpriseFish(659 + 40 * q, 302 + 150 * q * q, 0.2 + 5 * q, 1.6); }
    if (e > 5900 && e < 6900) D.dizzy(e, 1);
  } });
S('surprise-paques', 'Les œufs de Pâques', 'vie', { dur: 9600, w: 6, when: c => paques(c) && c.h >= 8 && c.h < 21,
  anim: [[0, 'idle-haut'], [1200, 'surpris'], [2100, 'etoiles'], [5800, 'bisou'], [7600, 'content']], mood: 'excite',
  say: [[300, 2000, L('Les cloches sont passées !', 'Ding dong ! Les cloches !', 'Écoute… des cloches !')],
    [2200, 5600, L('Des œufs en chocolat !', 'La chasse aux œufs !', 'Il en pleut partout !')],
    [5900, 7500, L('Miam, du chocolat !', 'Un pour toi, trois pour moi.', 'Crounch !')],
    [7700, 9400, L('Joyeuses Pâques !', 'J’ai du chocolat partout…', 'Encore un, juste un…')]],
  move: e => { const k = io(e, 2200, 2600, 5200, 5800); return { x: 150 * Math.sin((e - 2200) / 700) * k, y: (16 + jumps(Math.max(0, e - 2200), 350, 24)) * k + arc(e, 5800, 6200, 10) }; },
  props: (D, e) => {
    if (e > 400 && e < 3700) D.surpriseBell(-60 + 920 * seg(e, 400, 3600), 132 + 12 * Math.sin(e / 200), 0.4 * Math.sin(e / 160), e / 90, true, 1.6);
    const cs = [D.col.acc, D.col.pink, D.col.hi, D.col.fg, D.col.pink], bs = [D.col.pink, D.col.hi, D.col.acc, D.col.pink, D.col.acc];
    EGGS.forEach((g0, i) => {
      const t = e - g0.t, gone = 5900 + i * 260; if (t < 0 || e > gone + 240) return;
      const y = t < 550 ? 180 + (406 - 180) * (t / 550) ** 2 : 406 + arc(t, 550, 820, 24), s = 1.9 * (e > gone ? 1 - seg(e, gone, gone + 240) : 1);
      egg(D.g, g0.x, y, s, cs[i], bs[i]);
    });
  } });
S('surprise-muguet', 'Le muguet', 'vie', { dur: 8000, w: 6, when: c => c.mo === 4 && c.dd === 1,
  anim: [[0, 'timide'], [1800, 'content'], [4700, 'amoureux'], [6800, 'clin-oeil']], mood: 'amoureux',
  say: [[300, 2300, L('C’est le 1er mai !', 'Devine ce que j’ai…', 'Ferme les yeux…')],
    [2500, 4600, L('Un brin de muguet pour toi !', 'Du muguet, rien que pour toi !', 'Pour mon humain préféré !')],
    [4800, 7800, L('Ça porte bonheur !', 'Plein de bonheur, hein !', 'Mmmh, ça sent bon.')]],
  move: e => { const k = io(e, 1800, 2600, 6800, 7600); return { s: 1 + 0.12 * k, y: 16 * k, x: -30 * k, r: 0.04 * Math.sin(e / 500) * k }; },
  props: (D, e) => { D.surpriseMuguet(pop(seg(e, 1800, 2600)) * fin(e, 7000, 7700), e); if (e > 4700 && e < 6800) D.blush(io(e, 4700, 5000, 6400, 6800)); } });
S('surprise-force', 'Le jour de la Force', 'vie', { dur: 8600, w: 5, when: c => c.mo === 4 && c.dd === 4,
  anim: [[0, 'zen'], [2600, 'surpris'], [3100, 'colere'], [4500, 'fier'], [7000, 'clin-oeil']], mood: 'fier',
  say: [[1500, 2300, L('Je sens… la Force.', 'La Force est en moi…', 'Mmmh… je lévite.')],
    [2700, 4300, L('Vvvwoummm !', 'Bzzzwoum !', 'Vzzzz… vzzzz !')],
    [4600, 6800, L('Que la Force soit avec toi !', 'Le 4 mai, c’est le jour !', 'Je suis un chevalier Jedi !')],
    [7000, 8400, L('Puissant, je suis.', 'Bon, je range mon sabre.', 'Bzzz… clic.')]],
  move: e => { const lev = io(e, 300, 1500, 2300, 2900), sw = io(e, 3100, 3300, 4200, 4500); return { y: (-34 + 6 * Math.sin(e / 400)) * lev, x: 30 * Math.sin((e - 3100) / 150) * sw, r: 0.1 * Math.sin((e - 3100) / 150) * sw }; },
  props: (D, e) => { if (e > 2300 && e < 7500) D.surpriseSaber(26 * pop(seg(e, 2700, 3100)) * fin(e, 6800, 7200), e > 3100 && e < 4500 ? 0.55 * Math.sin((e - 3100) / 150) : 0.15); } });
S('surprise-musique', 'La fête de la musique', 'vie', { dur: 9400, w: 6, when: c => c.mo === 5 && c.dd === 21,
  anim: [[0, 'ecoute'], [1600, 'chante'], [4500, 'danse'], [8200, 'etoiles']], mood: 'excite',
  say: [[300, 1500, L('Tu entends ?', 'Ça commence !', 'Chut… écoute !')],
    [1700, 4300, L('C’est la fête de la musique !', '♪ Boum, boum, boum !', 'Monte le son !')],
    [4600, 8000, L('♪ Tout le monde danse !', '♪ Lalalala !', 'On monte un groupe ?')],
    [8200, 9200, L('Merci, Paris !', 'Une autre ! Une autre !', 'Yeah !')]],
  move: e => { const b = Math.max(0, 1 - (e % 500) / 160), k = io(e, 1500, 1800, 8400, 9200), d = io(e, 4500, 5000, 8000, 8600); return { y: 12 * b * k - 14 * Math.abs(Math.sin(e / 250)) * d, x: 60 * Math.sin(e / 500) * d, r: 0.12 * Math.sin(e / 500 + 0.8) * d, sy: 1 - 0.05 * b * k }; },
  props: (D, e) => { const q = io(e, 0, 700, 8800, 9400), b = e > 1500 ? Math.max(0, 1 - (e % 500) / 160) : 0; D.surpriseSpeaker(105, 434, b, q); D.surpriseSpeaker(695, 434, b, q); if (e > 1600 && e < 9000) D.notes(e); } });
S('surprise-14-juillet', 'Le feu d’artifice', 'vie', { quiet: true, side: true, dur: 10400, w: 6, when: c => c.mo === 6 && c.dd === 14 && (c.h >= 20 || c.h < 1),
  anim: [[0, 'idle-haut'], [1500, 'surpris'], [2300, 'etoiles'], [8400, 'amoureux']], mood: 'excite',
  say: [[300, 1500, L('Chut… ça commence !', 'Regarde le ciel !', 'Le feu d’artifice !')],
    [2300, 4600, L('Oooooh !', 'Waouh !', 'Celle-là !')],
    [5200, 7800, L('Aaaaah !', 'La bleue ! Euh… la verte.', 'Encore ! Encore !')],
    [8500, 10200, L('Bon 14 Juillet !', 'Vive la fête nationale !', 'Le bouquet final !')]],
  move: e => { const k = io(e, 0, 1400, 9000, 10000); return { y: 70 * k, s: 1 - 0.3 * k, r: 0.04 * Math.sin(e / 700) * k, sy: 1 + 0.04 * Math.sin(e / 350) * k }; },
  props: (D, e) => { for (const [t, x, y, ci] of BOOMS) D.surpriseBoom(e - t, x, y, boomCol(D, ci)); } });
S('surprise-rentree', 'La rentrée', 'vie', { dur: 9000, w: 4, when: c => c.mo === 8 && c.dd <= 8 && c.wd >= 1 && c.wd <= 5 && c.h >= 7 && c.h < 19,
  anim: [[0, 'surpris'], [900, 'reflechit'], [3300, 'idee'], [5800, 'fier'], [7600, 'content']], mood: 'reflechit',
  say: [[200, 2400, L('C’est la rentrée !', 'Déjà la rentrée ?!', 'Retour à l’école !')],
    [2600, 5600, L('Cahier, crayon… prêt !', 'Je révise mon alphabet.', 'A, B, C… facile !')],
    [5900, 8800, L('20 sur 20 !', 'Premier de la classe !', 'Bon point pour moi !')]],
  move: e => { const k = io(e, 400, 1200, 7600, 8600), wr = io(e, 1200, 1400, 4600, 4800); return { x: 110 * k, s: 1 - 0.12 * k, r: 0.04 * Math.sin(e / 90) * wr, y: arc(e, 5800, 6300, 12) }; },
  props: (D, e) => {
    const q = io(e, 300, 900, 8000, 8800); D.surpriseBoard(q); if (q < 0.95) return;
    [['A', 1200], ['B', 1600], ['C', 2000]].forEach(([ch, t], i) => { if (e > t) gl(D, ch, 112 + i * 44, 182, 46, D.col.hi); });
    '1+1=2'.split('').forEach((ch, i) => { if (e > 3000 + i * 320) gl(D, ch, 104 + i * 32, 244, 40, D.col.hi); });
    if (e > 5800) D.star(252, 176, 22 * pop(seg(e, 5800, 6200)), D.col.acc, 0);
  } });
S('surprise-pirate', 'Le jour des pirates', 'vie', { dur: 9200, w: 6, when: c => c.mo === 8 && c.dd === 19,
  anim: [[0, 'colere'], [1500, 'rire'], [4700, 'clin-oeil'], [6700, 'fier']], mood: 'fier',
  say: [[300, 2400, L('Arrr, moussaillon !', 'Ohé, matelot !', 'Arrrrr !')],
    [2600, 4600, L('C’est le jour des pirates !', 'Hissez la grand-voile !', 'À l’abordage !')],
    [4800, 6600, L('Où est mon trésor ?', 'Mille sabords !', 'Du rhum ! Euh… du jus.')],
    [6800, 9000, L('J’ai le mal de mer…', 'Terre en vue !', 'Yo ho ho !')]],
  move: e => { const k = io(e, 0, 1200, 7800, 9000); return { r: 0.1 * Math.sin(e / 650) * k, y: 12 * Math.sin(e / 650 + 1.2) * k, x: 26 * Math.sin(e / 1300) * k }; },
  props: (D, e) => { D.surpriseTricorne(pop(seg(e, 0, 600)) * fin(e, 8400, 9100)); D.surpriseWaves(e, io(e, 300, 1200, 8000, 9000)); } });
S('surprise-bonbons', 'Des bonbons ou un sort', 'vie', { dur: 9000, w: 4, when: c => c.mo === 9 && c.dd >= 24,
  anim: [[0, 'clin-oeil'], [1400, 'rire'], [3800, 'bisou'], [6200, 'panique'], [7600, 'rire']], mood: 'excite',
  say: [[300, 2600, L('Des bonbons ou un sort !', 'Joyeux Halloween !', 'Bouh ! C’est Halloween !')],
    [2800, 6000, L('Miam, des bonbons !', 'Encore un bonbon…', 'Un pour toi, dix pour moi !')],
    [6200, 7500, L('Trop de sucre !', 'Je… vibre…', 'Zzziiip !')],
    [7700, 8800, L('Hihi !', 'Encore !', 'Vivement l’an prochain !')]],
  move: e => { const z = io(e, 6200, 6400, 7300, 7600); return { x: 9 * Math.sin(e / 13) * z, y: 6 * Math.cos(e / 17) * z + arc(e, 7600, 8100, 12), r: 0.05 * Math.sin(e / 11) * z, sy: 1 - 0.05 * Math.max(0, Math.sin(e / 85)) * io(e, 3000, 3100, 5900, 6100) }; },
  props: (D, e) => {
    D.surprisePumpkin(650, 376, 54 * pop(seg(e, 0, 500)) * fin(e, 8300, 9000), (e % 900) < 450 ? D.col.hi : D.col.bg);
    const m = D.P(48, 40);
    for (let i = 0; i < 8; i++) { const t0 = 1600 + i * 520, q = seg(e, t0, t0 + 620); if (q <= 0 || q >= 1) continue; D.surpriseCandy(760 + (m.x - 760) * q, 60 + (m.y - 60) * q - 160 * bump(q), q * 9 + i, i); }
  } });
S('surprise-fantome', 'Le fantôme', 'vie', { dur: 8800, w: 5, when: c => c.mo === 9 && c.dd >= 29,
  anim: [[0, 'idle-regard'], [2700, 'curieux'], [3500, 'panique'], [5700, 'timide'], [7200, 'boudeur']], mood: 'surpris',
  secret: L('Tu l’as vu, toi aussi ?!', 'Il est encore là ?'),
  say: [[300, 2500, L('C’est calme… trop calme.', 'J’ai entendu un bruit…', 'Il fait sombre, non ?')],
    [4000, 5600, L('AAAAAH ! Un fantôme !', 'Au secours !', 'Maman !')],
    [5800, 8600, L('Même pas peur !', 'C’était pour rire, hein ?', 'J’ai pas crié. Toi, oui.')]],
  move: e => ({ x: -16 * io(e, 0, 1200, 2400, 2800) + 5 * Math.sin(e / 19) * io(e, 3900, 4000, 5400, 5700), y: arc(e, 3400, 4000, 70), s: 1 - 0.08 * io(e, 4000, 4300, 5600, 6200) }),
  props: (D, e) => { const gp = ghostAt(e); if (gp) D.surpriseGhost(gp.x, gp.y, 1.25, e); if (e > 3300 && e < 3900) gl(D, 'BOUH !', 640, 96, 44 * pop(seg(e, 3300, 3500)), D.col.hi); if (e > 3900 && e < 6200) D.sweat(e); } });
S('surprise-sylvestre', 'La Saint-Sylvestre', 'vie', { quiet: true, side: true, dur: 10400, w: 6, when: c => c.mo === 11 && c.dd === 31 && c.h >= 18,
  anim: [[0, 'idee'], [1000, 'reflechit'], [6200, 'etoiles'], [9000, 'rire']], mood: 'excite',
  say: [[200, 1300, () => (hour() === 23 ? 'C’est bientôt minuit !' : 'Je m’entraîne pour minuit !')],
    [6900, 8900, L('BONNE ANNÉE !!!', 'Bonne année !', 'Youpi ! Bonne année !')],
    [9000, 10200, () => (hour() === 23 ? pick(['Plein de bisous !', 'Que du bonheur !', 'À l’année prochaine !']) : pick(['…bon, c’était pour de faux.', 'Prêt pour ce soir !', 'Je recommence à minuit !']))]],
  move: e => { const on = e > 1400 && e < 6200, f = on ? ((e - 1400) % 480) / 480 : 0, low = io(e, 6900, 7300, 9400, 10200); return { y: (on ? -10 * Math.sin(Math.PI * f) : 0) + arc(e, 6200, 6900, 44) + 30 * low, s: 1 - 0.2 * low }; },
  props: (D, e) => {
    if (e > 1400 && e < 6200) { const n = 10 - Math.floor((e - 1400) / 480), f = ((e - 1400) % 480) / 480; gl(D, String(n), 400, 100, 96 * pop(Math.min(1, f * 4)), n <= 3 ? D.col.acc : D.col.hi); }
    for (const [t, x, y, ci] of NEWYEAR) D.surpriseBoom(e - t, x, y, boomCol(D, ci));
    if (e > 6200 && e < 9800) D.surpriseConfetti(e, fin(e, 9300, 9800));
  } });
S('surprise-vendredi-13', 'Vendredi 13', 'vie', { dur: 9000, w: 5, when: c => c.wd === 5 && c.dd === 13,
  anim: [[0, 'idle-regard'], [1600, 'surpris'], [3300, 'panique'], [5900, 'reflechit'], [7500, 'content']], mood: 'surpris',
  say: [[300, 1600, L('Vendredi 13…', 'On est vendredi 13 !', 'Brr… vendredi 13.')],
    [1800, 3200, L('Un chat noir !', 'Oh non, un chat noir !', 'Il me regarde !')],
    [3400, 5700, L('Touche du bois !', 'Je touche du bois !', 'Toc toc toc !')],
    [6000, 8800, L('Bah, il est mignon.', 'Il m’a fait un clin d’œil !', 'Ça porte bonheur, en fait ?')]],
  move: e => ({ y: 20 * io(e, 1600, 2000, 5600, 6200), s: 1 - 0.1 * io(e, 1600, 2000, 5600, 6200), x: 3 * Math.sin(e / 21) * io(e, 3300, 3400, 5500, 5700) + 8 * Math.max(0, Math.sin(TAU * (e - 3400) / 650)) ** 8 * io(e, 3400, 3500, 5600, 5700) }),
  props: (D, e) => { const c = catAt(e); if (c) D.surpriseCat(c.x, 400, c.ph, -1); if (e > 3400 && e < 5700) D.knock(e - 3400); if (e > 3000 && e < 4400) gl(D, 'miaou', 560, 330, 30 * pop(seg(e, 3000, 3200)), D.col.hi); } });
S('surprise-bissextile', 'Le 29 février', 'vie', { dur: 7600, w: 6, when: c => c.mo === 1 && c.dd === 29,
  anim: [[0, 'idee'], [1600, 'fier'], [2600, 'etoiles'], [4700, 'rire']], mood: 'excite',
  say: [[200, 1700, L('Le 29 février !', 'Un jour bonus !', 'Ça n’arrive que tous les 4 ans !')],
    [1800, 2500, L('Attention…', 'Prêt…', 'Un, deux…')],
    [3850, 4650, L('…saut bissextile !', 'Hop ! Bissextile !', 'Le saut de l’année !')],
    [4700, 7400, L('Un jour cadeau !', 'Rendez-vous dans 4 ans !', 'On en profite, hein ?')]],
  move: e => {
    const cr = io(e, 1600, 2400, 2500, 2600), j = seg(e, 2600, 3800), land = bump(seg(e, 3800, 4100));
    return { sy: 1 - 0.22 * cr - 0.2 * land, sx: 1 + 0.12 * cr + 0.12 * land, y: 30 * cr + arc(e, 2600, 3800, 125) + 14 * land, r: TAU * sm(j), s: 1 - 0.15 * bump(j) };
  },
  props: (D, e) => D.surpriseCal('FÉV', '29', 0, io(e, 200, 600, 6800, 7500)) });
S('surprise-pleine-lune', 'La pleine lune', 'vie', { quiet: true, dur: 9800, w: 4, when: c => fullMoon(c.date) && (c.h >= 20 || c.h < 5),
  anim: [[0, 'idle-haut'], [2200, 'amoureux'], [4200, 'chante'], [6700, 'timide'], [8400, 'content']], mood: 'ecoute',
  secret: L('Chut… je suis un loup-garou.', 'Aouh ! Euh… pardon.'),
  say: [[400, 2200, L('Oh… la pleine lune.', 'Regarde la lune…', 'Elle est toute ronde !')],
    [4200, 6500, L('Aouuuuh…', 'Ahouuuu…', 'Aou… aouuuh…')],
    [6800, 9600, L('Chut… loup-garou en pyjama.', 'Pardon, c’est la lune.', 'Un tout petit loup, hein.')]],
  move: e => { const k = io(e, 0, 1500, 8400, 9400), h = io(e, 4200, 4700, 6000, 6500); return { x: 40 * k, y: 30 * k - 16 * h, r: -0.06 * k - 0.08 * h, sy: 1 + 0.08 * h, s: 1 - 0.1 * k }; },
  props: (D, e) => { D.surpriseMoon(e, io(e, 0, 1200, 9000, 9800)); D.surpriseEars(pop(seg(e, 3800, 4300)) * fin(e, 6700, 7200)); } });

/* ================= the clock ================= */
S('surprise-11h11', '11 h 11', 'vie', { quiet: true, dur: 7800, w: 8, when: c => (c.h === 11 || c.h === 23) && c.mn === 11,
  anim: [[0, 'surpris'], [1200, 'idee'], [2700, 'zen'], [6100, 'clin-oeil']], mood: 'content',
  secret: L('C’est secret, mon vœu !', 'Chut, sinon ça marche pas !'),
  say: [[200, 2500, () => `${hour() === 23 ? 23 : 11} h 11 ! Fais un vœu !`],
    [2800, 5900, L('…', 'Je fais le mien…', 'Mmmh… je souhaite…')],
    [6200, 7600, L('Voilà, c’est fait !', 'C’est secret !', 'Ça va marcher !')]],
  move: e => { const k = io(e, 2700, 3600, 5600, 6200); return { y: (-8 + 4 * Math.sin(e / 500)) * k, s: 1 + 0.04 * k }; },
  props: (D, e) => { D.surpriseShoot(seg(e, 700, 2300)); if (e > 6100 && e < 7400) D.stars(e - 6100); } });
S('surprise-12h34', '12:34', 'vie', { dur: 6600, w: 8, when: c => c.h === 12 && c.mn === 34,
  anim: [[0, 'surpris'], [500, 'etoiles'], [4500, 'content']], mood: 'excite',
  say: [[2900, 4400, L('12:34 ! Dans l’ordre !', 'Un, deux, trois, quatre !', 'L’heure parfaite !')],
    [4600, 6400, L('Dommage pour 12:35.', 'Joli, non ?', 'Ça n’arrive pas souvent !')]],
  move: e => ({ y: arc(e, 500, 900, 26) + arc(e, 1000, 1400, 26) + arc(e, 1500, 1900, 26) + arc(e, 2000, 2400, 34) }),
  props: (D, e) => { const q = fin(e, 6000, 6600); for (const [i, ch, t] of [[0, '1', 500], [1, '2', 1000], [2, ':', 1250], [3, '3', 1500], [4, '4', 2000]]) if (e > t) gl(D, ch, 280 + i * 60, 398, 64 * pop(seg(e, t, t + 300)) * q, i === 2 ? D.col.fg : D.col.acc); } });
S('surprise-13h37', '13 h 37', 'vie', { dur: 7800, w: 8, when: c => c.h === 13 && c.mn === 37,
  anim: [[0, 'curieux'], [1000, 'code'], [5800, 'clin-oeil']], mood: 'fier',
  say: [[300, 1900, L('13 h 37…', 'Oh ! 13:37 !', 'Regarde l’heure !')],
    [2100, 4700, L('…leet !', 'Mode hacker activé.', 'Je suis dans le système.')],
    [4900, 7500, L('Accès autorisé. Hé hé.', 'Personne ne m’arrête !', '1337 H4CK3R !')]],
  move: e => ({ y: 6 * Math.sin(e / 280) * io(e, 1600, 2000, 6200, 6800), r: 0.05 * io(e, 1600, 2200, 6400, 7000) }),
  props: (D, e) => { D.surpriseRain(e, io(e, 800, 1600, 6600, 7600)); const dv = e < 1600 ? 30 * (1 - out(seg(e, 1000, 1600))) : e > 6400 ? 40 * inn(seg(e, 6400, 7200)) : 0; if (e > 1000 && e < 7200) D.surpriseShades(dv); } });
S('surprise-midi', 'Midi pile', 'vie', { dur: 7400, w: 8, when: c => c.h === 12 && c.mn < 2,
  anim: [[0, 'surpris'], [700, 'ecoute'], [4800, 'idee'], [6000, 'content']], mood: 'ecoute',
  say: [[4900, 7200, L('Midi pile ! À table !', 'Midi ! J’ai faim !', 'C’est l’heure de manger !', 'Ding dong : à table !')]],
  move: e => { let w2 = 0; for (const t of DONGS) w2 += wob(e, t, 260, 45); return { sx: 1 + 0.06 * w2, sy: 1 - 0.06 * w2, y: arc(e, 4800, 5300, 10) }; },
  props: (D, e) => {
    D.surpriseBell(150, 66, 0.5 * Math.sin(e / 160) * fin(e, 4400, 5200), 0, false, 1.8 * pop(seg(e, 0, 500)) * fin(e, 6600, 7300));
    DONGS.forEach((t, i) => { if (e > t && e < t + 700) gl(D, 'DONG !', i % 2 ? 640 : 290, 150 - 30 * seg(e, t, t + 700), 44 * pop(seg(e, t, t + 200)), D.col.acc); });
  } });
S('surprise-minuit', 'Minuit pile', 'vie', { quiet: true, dur: 8400, w: 8, when: c => c.h === 0 && c.mn < 5,
  anim: [[0, 'idle-somnole'], [1600, 'surpris'], [5900, 'timide']], mood: 'endormi',
  secret: L('Chut… c’est magique, minuit.', 'Je suis pas une citrouille !'),
  say: [[300, 1600, L('Minuit…', 'Chut… minuit pile.', 'Les douze coups de minuit…')],
    [2300, 5500, L('…je me transforme ?!', 'Oh non, comme Cendrillon !', 'Je deviens… une citrouille !')],
    [6100, 8200, L('…ouf, toujours moi.', 'Fausse alerte. Dodo.', 'Ah non. Bonne nuit !')]],
  move: e => ({ r: TAU * sm(seg(e, 1700, 2500)), s: 1 - 0.1 * io(e, 1700, 2100, 5600, 6200), y: 10 * sm(seg(e, 0, 1500)) * fin(e, 1500, 2000) + 12 * sm(seg(e, 6200, 7200)) * fin(e, 7400, 8200) }),
  props: (D, e) => { if (e > 1600 && e < 2700) D.stars(e - 1600); const q = pop(seg(e, 2300, 2700)) * fin(e, 5300, 5800); if (q > 0) { const p = D.P(48, 28); D.surprisePumpkin(p.x, p.y + 10, 28 * D.U * q, D.col.hi); } } });

/* ================= the rare gags (any day, rarely) ================= */
S('surprise-glitch', 'Le bug d’écran', 'vie', { dur: 6400, w: 0.35, anim: [[0, 'idle-cligne'], [700, 'bug'], [3700, 'colere'], [4300, 'content']], mood: 'confus',
  secret: L('T-t-tape plus f-fort !', 'Zzzt… merci !'),
  say: [[900, 3500, L('B-b-b-bug…', 'J-j-je capte p-plus…', 'Zzzt… allô ?', 'Ma-ma-ma ligne…')],
    [4400, 6200, L('Voilà. Réparé.', 'Rétro, quoi.', 'Une tape, et ça repart !', 'Ah, les vieux écrans…')]],
  move: e => { const on = e > 700 && e < 3600, h = hash(Math.floor(e / 70)); return { x: on ? (h % 5 - 2) * (h % 3 === 0 ? 14 : 3) : 0, sx: on && h % 7 === 0 ? 1.12 : 1, y: on && h % 11 === 0 ? -8 : 0, sy: 1 - 0.14 * bump(seg(e, 3600, 3900)) }; },
  props: (D, e) => { if (e > 700 && e < 3600) D.surpriseTear(e); if (e > 3600 && e < 4000) { const p = D.P(84, 10); D.star(p.x, p.y, 16 * pop(seg(e, 3600, 3750)), D.col.acc, 0.3); } } });
S('surprise-un-pixel', 'Un seul pixel', 'vie', { dur: 7000, w: 0.3, anim: [[0, 'idle-cligne'], [400, 'surpris'], [4700, 'rire']], mood: 'surpris',
  secret: L('Hé ! Tu m’as trouvé !', 'Bip ! C’est moi !'),
  say: [[100, 1200, L('Attention…', 'Regarde bien…', 'Un tour de magie…')],
    [2000, 4200, L('bip.', 'Je suis un pixel !', 'Coucou, d’en bas !', 'Tout petit, hein ?')],
    [4900, 6800, L('Tadaa !', 'Pixel, c’est mon nom !', 'Petit mais costaud !')]],
  move: e => {
    if (e < 400) return {};
    if (e < 1400) { const q = inn(seg(e, 400, 1400)); return { s: 1 - 0.7 * q, sx: 1 - 0.93 * q, sy: 1 - 0.93 * q }; }
    if (e < 4500) return { s: 0.3, sx: 0.07, sy: 0.07, y: jumps(e - 1400, 500, 30) * seg(e, 2000, 2100) * fin(e, 3900, 4000), x: 60 * Math.sin((e - 2000) / 600) * io(e, 2000, 2400, 3600, 4000) };
    const q = pop(seg(e, 4500, 5100)); return { s: 0.3 + 0.7 * q, sx: 0.07 + 0.93 * q, sy: 0.07 + 0.93 * q };
  },
  props: (D, e) => { if (e > 1300 && e < 4600) { const p = D.P(48, 27), s = D.pix ? Math.max(2 * D.k, 12) : 12; box(D.g, p.x - s / 2, p.y - s / 2, s, s, D.col.fg); } } });
S('surprise-quatrieme-mur', 'Tu me regardes ?', 'vie', { dur: 7800, w: 0.35, anim: [[0, 'idle-regard'], [1000, 'surpris'], [1500, 'curieux'], [4500, 'timide'], [5700, 'chante']], mood: 'ecoute',
  secret: L('Aaah ! Tu m’as fait peur !', 'Je le savais ! Tu étais là !'),
  say: [[1600, 3600, L('Tu me regardes, là ?', 'Hé… tu es là ?', 'Je te vois, tu sais.')],
    [3800, 5500, L('Derrière la vitre…', 'Tu crois que je te vois pas ?', 'C’est gênant, hein ?')],
    [5800, 7600, L('♪ Je fais rien, moi…', '♪ Rien à voir ici…', '♪ Tralala, normal…')]],
  move: e => { const k = io(e, 1500, 2300, 4400, 5200), w2 = io(e, 5600, 6000, 7000, 7600); return { s: 1 + 0.32 * k, y: 26 * k + 4 * bump(seg(e, 1000, 1200)), x: 90 * Math.sin((e - 2300) / 520) * io(e, 2300, 2700, 4000, 4400) + 20 * Math.sin(e / 700) * w2, r: 0.06 * Math.sin(e / 350) * w2 }; },
  props: (D, e) => { if (e > 5700 && e < 7700) D.notes(e - 5700); } });
S('surprise-mur', 'Coincé dans l’écran', 'vie', { dur: 9200, w: 0.35, anim: [[0, 'curieux'], [1500, 'surpris'], [2000, 'confus'], [3500, 'surpris'], [4000, 'colere'], [6300, 'triste'], [7700, 'content']], mood: 'confus',
  secret: L('Tu peux m’ouvrir ?', 'Il est où, le bouton « sortie » ?'),
  say: [[1500, 2600, L('Aïe !', 'Bonk !', 'Ouille !')],
    [3500, 4600, L('Encore ?!', 'Hé ! Un mur !', 'Là aussi ?!')],
    [4800, 6200, L('Laissez-moi sortir !', 'Hnnnngh !', 'Ouvrez !')],
    [6400, 9000, L('Je suis coincé dans l’écran…', 'Bon, je reste avec toi.', 'C’est petit, chez moi.')]],
  move: e => {
    const walk = e < 1500 || (e > 2000 && e < 3500) || e > 6300 && e < 7800 ? -6 * Math.abs(Math.sin(e / 140)) : 0, s = 1 - 0.2 * io(e, 0, 600, 7600, 8600);
    let x, sx = 1;
    if (e < 1500) x = 215 * sm(seg(e, 0, 1500));
    else if (e < 2000) { x = 215 - 40 * out(seg(e, 1500, 2000)); sx = 1 - 0.18 * bump(seg(e, 1500, 1800)); }
    else if (e < 3500) x = 175 - 390 * sm(seg(e, 2000, 3500));
    else if (e < 4000) { x = -215 + 40 * out(seg(e, 3500, 4000)); sx = 1 - 0.18 * bump(seg(e, 3500, 3800)); }
    else if (e < 6200) { x = -175 - 40 * sm(seg(e, 4000, 4400)) + 3 * Math.sin(e / 25) * io(e, 4400, 4500, 6000, 6200); sx = 1 - 0.1 * io(e, 4000, 4400, 5900, 6200); }
    else x = -215 * (1 - sm(seg(e, 6200, 7800)));
    return { x, y: walk, s, sx };
  },
  props: (D, e) => { if (e > 1500 && e < 1900) D.star(782, 236, 20 * pop(seg(e, 1500, 1650)), D.col.acc, 0.4); if (e > 3500 && e < 3900) D.star(18, 236, 20 * pop(seg(e, 3500, 3650)), D.col.acc, 0.4); if (e > 4400 && e < 6200) D.sweat(e); if (e > 1600 && e < 2600) D.dizzy(e, 1); } });
S('surprise-ovni', 'L’OVNI', 'vie', { dur: 10600, w: 0.25, anim: [[0, 'idle-haut'], [1700, 'surpris'], [2700, 'panique'], [6300, 'confus'], [8100, 'rire']], mood: 'surpris',
  secret: L('Ils reviennent ?!', 'Bip boup… euh, salut ?'),
  say: [[1800, 2700, L('Hein ? C’est quoi ça ?', 'Une soucoupe ?!', 'Oh ! Un OVNI !')],
    [3250, 5500, L('Hé ! Posez-moi !', 'Au secours ! Je vole !', 'Je suis pas comestible !')],
    [6900, 8100, L('…ils m’ont rendu.', 'Trop petit, apparemment.', 'Retour à l’envoyeur.')],
    [8200, 10400, L('Ils voulaient un selfie.', 'Ils m’ont trouvé mignon !', 'Bip boup, à la prochaine !')]],
  move: e => {
    const up = sm(seg(e, 2700, 4500)), dr = seg(e, 5600, 6200), k = e < 5600 ? up : 1 - dr * dr, ld = bump(seg(e, 6200, 6600));
    return { y: -112 * k + 14 * ld + arc(e, 6600, 7000, 18), s: 1 - 0.55 * k, r: 0.25 * Math.sin(e / 300) * (e < 5600 ? up : 0) * fin(e, 5000, 5600), sy: 1 - 0.2 * ld, sx: 1 + 0.14 * ld };
  },
  props: (D, e) => { const u = ufoAt(e); if (u) D.surpriseUfo(u.x, u.y, e, u.beam); if (e > 6300 && e < 8200) D.dizzy(e, 1); } });
S('surprise-ecran-mort', 'L’écran de la mort', 'vie', { dur: 7800, w: 0.2, anim: [[0, 'erreur'], [4700, 'rire'], [6600, 'clin-oeil']], mood: 'confus',
  say: [[4900, 7600, L('Je rigole !', 'Hi hi, t’as eu peur ?', 'Je t’ai bien eu !', 'Pas de panique : blague !')]],
  move: e => ({ y: arc(e, 4700, 5200, 12), r: 0.05 * Math.sin(e / 200) * io(e, 5300, 5600, 6600, 7200) }),
  props: (D, e) => { if (e > 300 && e < 5200 && !(e < 560 && Math.floor(e / 60) % 2)) D.surpriseCrash(Math.min(100, Math.floor(seg(e, 900, 4300) ** 0.7 * 100)), 480 * inn(seg(e, 4600, 5200))); } });
S('surprise-chargement', 'Chargement…', 'vie', { dur: 8800, w: 0.35, anim: [[0, 'chargement'], [4300, 'idle-impatient'], [5700, 'colere'], [6400, 'succes'], [7800, 'content']], mood: 'reflechit',
  say: [[300, 3200, L('Chargement…', 'Mise à jour du sourire…', 'Chargement de la bonne humeur…')],
    [4300, 5600, L('99 %…', 'Allez… 99 %…', 'Bloqué à 99 % !')],
    [5700, 6300, L('Hnnngh !', 'Pousse-toi !', 'Avance !')],
    [6500, 8600, L('Bonne humeur : installée !', '100 % ! Prêt !', 'Redémarrage réussi !')]],
  move: e => { const p = io(e, 5700, 5900, 6200, 6400); return { y: 24 * p + arc(e, 6400, 6900, 12), sy: 1 - 0.1 * p, x: 4 * Math.sin(e / 23) * p }; },
  props: (D, e) => { D.surpriseBar(e < 6300 ? 0.99 * out(seg(e, 300, 4200)) : 1, io(e, 0, 400, 8000, 8700)); if (e > 6400 && e < 8000) D.stars(e - 6400); } });
S('surprise-piece', 'La pièce par terre', 'vie', { dur: 8200, w: 0.35, anim: [[0, 'idle-regard'], [800, 'curieux'], [3500, 'etoiles'], [5500, 'fier'], [6700, 'confus']], mood: 'ecoute',
  say: [[3500, 5300, L('Oh ! Une pièce !', 'Un trésor !', 'Je suis riche !')],
    [5500, 6600, L('Je vais m’acheter…', 'Je la garde !', 'Ma précieuse…')],
    [6800, 8000, L('…1 centime.', '…c’est un bouton.', '…c’est une capsule.')]],
  move: e => { const cx = e < 3000 ? -20 + 450 * out(seg(e, 500, 3000)) : 430, look = io(e, 500, 900, 3300, 3600), dn = io(e, 3400, 3900, 4100, 4700); return { x: 0.25 * (cx - 400) * look + 30 * dn, y: 80 * dn, s: 1 - 0.18 * dn + 0.04 * io(e, 5500, 5800, 6600, 6900), sy: 1 - 0.08 * io(e, 6700, 6900, 7500, 7900) }; },
  props: (D, e) => {
    if (e > 500 && e < 4200) {
      const q = seg(e, 500, 3000), x = -20 + 450 * out(q), fl = seg(e, 3000, 3400);
      if (e < 3000) D.surpriseCoin(x, 410, 21 * Math.abs(Math.cos(x / 21)), 21); else D.surpriseCoin(430, 414 + 8 * fl, 21, 21 * (1 - 0.65 * sm(fl)) * (1 + 0.15 * Math.sin(e / 30) * (1 - fl)));
    } else if (e >= 4200 && e < 7900) { const p = D.P(85, 32), q = pop(seg(e, 4200, 4600)) * fin(e, 7500, 7900); D.surpriseCoin(p.x, p.y, 21 * q * Math.abs(Math.cos(e / 400)), 21 * q); if (e > 4600 && e < 6600) D.star(p.x + 18, p.y - 20, 8 + 4 * Math.sin(e / 90), D.col.hi, e / 300); }
  } });
S('surprise-araignee', 'L’araignée', 'vie', { dur: 8800, w: 0.35, anim: [[0, 'idle-cligne'], [1600, 'curieux'], [2900, 'surpris'], [3500, 'panique'], [5500, 'confus'], [7000, 'content']], mood: 'surpris',
  say: [[2900, 3400, L('…', 'Euh…', 'Hein ?')],
    [3500, 5400, L('UNE ARAIGNÉE !', 'Aaah ! Une araignée !', 'Va-t’en, va-t’en !')],
    [5600, 6800, L('Pfff ! Pfff !', 'Ouste !', 'Remonte, toi !')],
    [7000, 8600, L('Elle est mignonne, en fait.', 'Bon voyage, l’araignée !', 'Reste là-haut, hein.')]],
  move: e => { const p = io(e, 3500, 3800, 5200, 5600); return { s: 1 - 0.14 * p, y: 30 * p, x: 4 * Math.sin(e / 21) * p, sy: 1 - 0.1 * bump(seg(e, 5600, 5900)) - 0.1 * bump(seg(e, 6100, 6400)) }; },
  props: (D, e) => { const y = spiderY(e); if (y > 50) D.surpriseSpider(400 + 50 * Math.sin((e - 5600) / 260) * io(e, 5600, 5900, 6600, 7000), y, e); } });
S('surprise-tete-en-bas', 'La tête à l’envers', 'vie', { dur: 8600, w: 0.3, anim: [[0, 'rire'], [1200, 'surpris'], [1800, 'confus'], [5700, 'colere'], [6700, 'rire']], mood: 'confus',
  secret: L('Retourne-moi !', 'Tu me vois à l’endroit, toi ?'),
  say: [[1400, 3600, L('Euh… je suis coincé !', 'Oh oh… à l’envers.', 'Le monde est à l’envers !')],
    [3800, 5100, L('Ça monte à la tête…', 'Tu peux me retourner ?', 'Ma tête est en bas !')],
    [5200, 5800, L('Hnnngh… hop !', 'Allez… hop !', 'Et… hop !')],
    [6800, 8400, L('Ouf, à l’endroit !', 'Comme neuf !', 'Je l’ai fait exprès.')]],
  move: e => {
    const tries = 0.35 * bump(seg(e, 2600, 3100)) - 0.35 * bump(seg(e, 4100, 4600));
    return { r: Math.PI * sm(seg(e, 200, 1200)) + Math.PI * sm(seg(e, 5800, 6700)) + tries + 0.05 * Math.sin(e / 140) * io(e, 1200, 1400, 5600, 5800), y: arc(e, 200, 1200, 40) + arc(e, 5800, 6700, 60) + arc(e, 2600, 3100, 16) + arc(e, 4100, 4600, 16) };
  } });
S('surprise-pixel-mort', 'Le pixel mort', 'vie', { dur: 9000, w: 0.35, anim: [[0, 'idle-regard'], [1000, 'surpris'], [1800, 'curieux'], [3700, 'colere'], [5700, 'confus'], [6500, 'bisou'], [7600, 'content']], mood: 'ecoute',
  say: [[1100, 2050, L('Un pixel mort ?!', 'Hé ! Un point qui brille !', 'C’est quoi, ce pixel ?')],
    [3800, 5500, L('Frotte, frotte…', 'Il part pas !', 'Allez, disparais !')],
    [5700, 6500, L('Ah… c’est une miette.', 'Oh ! Une miette.', 'Tiens… une miette ?')],
    [7400, 8800, L('Miam.', 'Croc ! Délicieux.', 'Écran propre !')]],
  move: e => { const k = io(e, 1800, 3000, 6400, 7600); return { x: 150 * k + 6 * Math.sin(e / 40) * io(e, 3700, 3800, 5400, 5600), y: -55 * k, s: 1 - 0.25 * k, sy: 1 - 0.06 * Math.max(0, Math.sin(e / 90)) * io(e, 6600, 6700, 7600, 7800) }; },
  props: (D, e) => {
    if (e < 800 || e > 6700) return; const s = D.pix ? Math.max(2 * D.k, 12) : 12, q = sm(seg(e, 6300, 6700)), m = D.P(48, 41);
    if (Math.floor(e / 260) % 4 || e > 2400) box(D.g, 612 + (m.x - 612) * q - s / 2, 150 + (m.y - 150) * q - s / 2, s, s, D.col.hi);
  } });
S('surprise-tetris', 'La ligne complète', 'vie', { dur: 8600, w: 0.25, anim: [[0, 'idle-haut'], [800, 'curieux'], [3000, 'idee'], [4200, 'fier'], [5600, 'etoiles'], [7300, 'rire']], mood: 'excite',
  say: [[2900, 4000, L('Il manque un morceau…', 'Attends, je sais !', 'Y a un trou !')],
    [5500, 7100, L('Ligne complète !', '+100 points !', 'Combo !')],
    [7300, 8400, L('J’étais la pièce manquante.', 'Je suis un peu carré.', 'Rétro, hein ?')]],
  move: e => { const k = io(e, 3200, 4300, 5600, 6500); return { s: 1 - 0.68 * k, y: 130 * k + arc(e, 6500, 7000, 10) }; },
  props: (D, e) => D.surpriseRow(e, e > 4900 && e < 5600 && Math.floor(e / 110) % 2 === 0, sm(seg(e, 5500, 5900))) });
S('surprise-pong', 'Pong', 'vie', { dur: 9800, w: 0.25, anim: [[0, 'curieux'], [800, 'rire'], [7000, 'etoiles'], [8400, 'content']], mood: 'excite',
  say: [[200, 900, L('On joue ?', 'Pong ?', 'Partie !')],
    [7100, 8400, L('Point pour moi !', 'Gagné !', 'Trop rapide !')],
    [8500, 9600, L('Une revanche ?', 'Rétro, hein ?', 'Encore une ?')]],
  move: e => { const b = pongAt(e), k = io(e, 0, 800, 7600, 8800); return { x: b.x, y: b.y, s: 1 - 0.43 * k }; },
  props: (D, e) => { const b = pongAt(e), ry = e < 5400 ? b.y : b.y + 110 * sm(seg(e, 5400, 6400)); D.surprisePong(clamp(b.y * 0.85, -110, 110), clamp(ry, -140, 140), io(e, 300, 800, 7400, 8200)); if (e > 7000 && e < 7600) D.star(780, 239 + b.y, 22 * pop(seg(e, 7000, 7200)), D.col.acc, 0); } });
S('surprise-compte', 'Le compte à rebours pour rien', 'vie', { dur: 6800, w: 0.35, anim: [[0, 'idee'], [900, 'reflechit'], [3500, 'etoiles'], [4300, 'confus'], [5000, 'timide']], mood: 'excite',
  say: [[200, 1000, L('Attention…', 'Prêt ?', 'Tiens-toi bien…')],
    [4900, 6600, L('…rien. J’avais envie de compter.', 'C’était pour rien. Hé hé.', 'Surprise : il se passe rien !')]],
  move: e => { const t = io(e, 900, 3400, 3500, 3700); let p = 0; for (const t0 of [1000, 1800, 2600]) p += wob(e, t0, 200, 40); return { sy: 1 - 0.12 * t + 0.03 * p + 0.1 * bump(seg(e, 3400, 3900)), sx: 1 + 0.06 * t, y: 20 * t - 20 * bump(seg(e, 3400, 3900)) }; },
  props: (D, e) => { for (const [ch, t0] of [['3', 1000], ['2', 1800], ['1', 2600]]) if (e > t0 && e < t0 + 760) gl(D, ch, 660, 236, 130 * pop(seg(e, t0, t0 + 250)), D.col.acc); if (e > 3500 && e < 4300) D.ring(660, 236, (2 + 6 * seg(e, 3500, 4300)) * D.U, D.col.dim, 0.8 * D.U); } });

/* ================= notifications on special days ================= */
S('surprise-notif-calendrier', 'Le calendrier', 'evt', { on: ['notif'], w: 0.8, dur: 3800, anim: [[0, 'surpris'], [700, 'reflechit'], [2000, 'content']], mood: 'ecoute',
  init: o => { const d = new Date(); o.wd = d.getDay(); o.h = d.getHours(); o.day = String(d.getDate()); },
  say: [[150, 1700, F(o => (o.msg ? 'Hé, ' + short(o.msg, 22) : 'Un message !'), 'Un message !', 'Oh, du courrier !')], [1800, 3600, o => dayLine(o)]],
  move: e => ({ y: arc(e, 0, 420, 10), r: 0.06 * io(e, 600, 1000, 3000, 3600), x: -24 * io(e, 600, 1000, 3000, 3600) }),
  props: (D, e, p, o) => D.surpriseCal(DAYS[o.wd] || 'LUN', o.day || '1', seg(e, 900, 1300), io(e, 400, 800, 3200, 3700)) });
S('surprise-notif-13', 'Un message un vendredi 13', 'evt', { on: ['notif'], w: 6, when: () => { const d = new Date(); return d.getDay() === 5 && d.getDate() === 13; },
  dur: 3800, anim: [[0, 'surpris'], [700, 'panique'], [2400, 'timide']], mood: 'surpris',
  say: [[150, 1800, L('Un message… un vendredi 13 ?!', 'Brr… un vendredi 13 !', 'Un message ? Aujourd’hui ?!')],
    [1900, 3600, L('Je l’ouvre pas, moi !', 'Ouvre-le, toi.', 'Touche du bois avant !')]],
  move: e => ({ y: 110 * io(e, 500, 900, 2900, 3400), x: 3 * Math.sin(e / 20) * io(e, 700, 800, 2900, 3400) }),
  props: (D, e) => { if (e > 600 && e < 3400) D.sweat(e); } });
S('surprise-notif-avril', 'Le message du 1er avril', 'evt', { on: ['notif'], w: 6, when: () => today(3, 1),
  dur: 3600, anim: [[0, 'curieux'], [900, 'surpris'], [1800, 'rire']], mood: 'confus',
  say: [[150, 1700, L('Un message ? Le 1er avril ?', 'Hmm… c’est une blague ?', 'Je me méfie…')],
    [1800, 3400, L('Poisson d’avril !', 'Je le savais !', 'Glou glou, ha ha !')]],
  move: e => ({ x: 24 * wob(e, 900, 250, 60), y: arc(e, 1800, 2200, 10) }),
  props: (D, e) => {
    if (e < 300 || e > 3400) return; const p = D.P(86, 36), q = sm(seg(e, 300, 900));
    D.surpriseFish(760 + (p.x - 760) * q, 60 + (p.y - 60) * q, 0.3 + (1 - q) * 3 + 0.1 * Math.sin(e / 200), 1.6);
  } });
});
