/* Scene pack « vie » — Moments of life: what he does alone, by time of day and weather.
   See the top of web/persona.js: scenes are defined with S('id', 'Label', 'group', { ... }) on one line each
   (pixel/scenes.py reads them), groups tap / fache / calin / retour / vie / evt, plus "on" (events) and "pool" (touch pools).
   Every scene here is a 'vie' one: persona.js picks one every 45 s to 2.5 min when nobody touches him, among those whose
   when(c) agrees (c: wet, sunny, day, night, xmas, meal, h, mn, wd, mo, dd, kind, date); at night (23 h - 6 h) only the
   quiet ones (quiet: true). Three kinds:
     - hobbies, any time of the day: he reads, juggles, paints, plays the guitar or a tiny video game, builds a tower...
     - the hours: the morning coffee (7-10 h), the afternoon slump (14-16 h), the 4 pm snack, the evening herbal tea (20-23 h),
       and, at night, quiet ones: counting stars or sheep, the telescope, a dream, a firefly;
     - the weather (c.kind: soleil, nuage, pluie, neige, orage): puddles, the umbrella, sunglasses, a snowman, the fog, the storm, the wind.
   The props are pixel art: small sprites (strings, one character per pixel: f fg, h hi, d dim, a acc, p pink, b bg) drawn
   with the face's own pixel (D.U, or 7 screen px for what stands on the "floor" of the screen), snapped to the pixel themes' grid.
   Our props are declared below with prop('vieXxx', ...) and called D.vieXxx(...) in the scenes (a prop never stops him). */
(window.PixelScenePacks ||= []).push(({ S: S0, L, pick, sm, out, inn, seg, bump, tri, jumps, clamp, rnd, TAU, W, HT, A, H, prop }) => {
const MINE = [];                                     // our scenes (for the wet days, at the end)
const S = (id, label, group, o) => { const s = S0(id, label, group, o); MINE.push(s); return s; };

/* ---------- small helpers ---------- */
const fin = (e, a, b) => 1 - sm(seg(e, a, b));                                   // 1, then down to 0 between a and b
const io = (e, a, b, c, d) => sm(seg(e, a, b)) * fin(e, c, d);                     // 0 -> 1 (a..b), then 1 -> 0 (c..d)
const lin = (e, a, b, c, d) => Math.min(seg(e, a, b), 1 - seg(e, c, d));           // the same, linear (for pop())
const hop = (e, a, b, h) => -h * bump(seg(e, a, b));                               // one hop, h px up
const pop = q => (q <= 0 ? 0 : q >= 1 ? 1 : out(q) * (1 + 0.3 * Math.sin(Math.PI * q)));   // a pop-in scale that overshoots a little
const boing = (e, t, tau = 200, per = 45) => (e < t ? 0 : Math.exp(-(e - t) / tau) * Math.cos((e - t) / per));   // a damped spring after a shock at t
const squash = (e, t, k = 0.22) => { const q = boing(e, t); return { sx: 1 + 0.6 * k * q, sy: 1 - k * q }; };
const lerp = (a, b, q) => a + (b - a) * q;
const V = (...ls) => o => { const x = pick(ls); return typeof x === 'function' ? x(o) : x; };   // a line picked when the scene starts, that may use its data
function mv(...ps) {                                                               // several motions added together
  const m = { x: 0, y: 0, s: 1, r: 0, sx: 1, sy: 1 };
  for (const p of ps) if (p) { m.x += p.x || 0; m.y += p.y || 0; m.r += p.r || 0; m.s *= p.s ?? 1; m.sx *= p.sx ?? 1; m.sy *= p.sy ?? 1; }
  return m;
}
const G = 7;                                         // a pack pixel on the screen at his normal size (the face's box: 672 px for 96 pixels)
const FLOOR = 427;                                   // the "floor" of the screen, just above the bottom line

/* ---------- drawing helpers ---------- */
// a rectangle; in the pixel themes (Rétro, LCD) snapped to their grid, never thinner than one of their pixels (no rotation then)
function box(D, x, y, w, h, c) {
  const g = D.g; g.fillStyle = c;
  if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
  if (D.pix) { const k = D.k, x0 = Math.round(x / k) * k, y0 = Math.round(y / k) * k; g.fillRect(x0, y0, Math.max(k, Math.round((x + w) / k) * k - x0), Math.max(k, Math.round((y + h) / k) * k - y0)); }
  else g.fillRect(x, y, w, h);
}
const disc = (D, x, y, r, c) => { if (r <= 0) return; const g = D.g; g.fillStyle = c; g.beginPath(); g.arc(x, y, Math.max(r, D.pix ? D.k * 0.6 : 0.5), 0, TAU); g.fill(); };
const poly = (D, pts, c) => { const g = D.g; g.fillStyle = c; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
const line = (D, pts, w, c, cap = 'round') => { const g = D.g; g.strokeStyle = c; g.lineWidth = D.lw(w); g.lineCap = cap; g.lineJoin = 'round'; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
const tilt = D => { const a = D.P(0, 27), b = D.P(96, 27); return Math.atan2(b.y - a.y, b.x - a.x); };   // how he leans, on the screen
const onScr = (x, y, r = 0) => ({ x: clamp(x, 10 + r, W - 10 - r), y: clamp(y, 56 + r, HT - 48 - r) });  // a point kept on the screen

/* pixel-art sprites: one string per row, one character per pixel (f fg, h hi, d dim, a acc, p pink, b bg, anything else: nothing) */
const SPR = {}, CK = { f: 'fg', h: 'hi', d: 'dim', a: 'acc', p: 'pink', b: 'bg' };
function sprite(name, rows) {
  const runs = [];
  rows.forEach((row, y) => { for (let x = 0; x < row.length;) { const k = CK[row[x]]; if (!k) { x++; continue; } let n = 1; while (row[x + n] === row[x]) n++; runs.push([x, y, n, k]); x += n; } });
  return (SPR[name] = { w: Math.max(...rows.map(r => r.length)), h: rows.length, runs });
}
// a sprite centred on (x, y), u screen px per pixel; r: turned, flip: mirrored, upto: only its first runs (a drawing being painted)
function spr(D, name, x, y, u, r = 0, flip = false, upto = 1e9) {
  const s = SPR[name]; if (!s || !(u > 0)) return;
  const g = D.g, c = D.col, snap = D.pix && !r, ov = D.pix ? 0 : 0.45;
  let ox = -s.w * u / 2, oy = -s.h * u / 2;
  g.save();
  if (snap) { const k = D.k, uu = Math.max(k, Math.round(u / k) * k); u = uu; ox = Math.round((x - s.w * u / 2) / k) * k; oy = Math.round((y - s.h * u / 2) / k) * k; if (flip) { g.translate(2 * ox + s.w * u, 0); g.scale(-1, 1); } }
  else { g.translate(x, y); if (r) g.rotate(r); if (flip) g.scale(-1, 1); }
  let cur = '';
  const n = Math.min(upto, s.runs.length);
  for (let i = 0; i < n; i++) { const [rx, ry, len, k] = s.runs[i], col = c[k]; if (col !== cur) { g.fillStyle = col; cur = col; } g.fillRect(ox + rx * u, oy + ry * u, len * u + ov, u + ov); }
  g.restore();
}

/* ---------- the sprites ---------- */
const ART = {                                        // what he paints (vie-peinture)
  coeur: ['.ppp...ppp.', 'pphpp.ppppp', 'phppppppppp', 'ppppppppppp', '.ppppppppp.', '..ppppppp..', '...ppppp...', '....ppp....', '.....p.....'],
  soleil: ['.....a.....', '.a...a...a.', '....aaa....', '...aaaaa...', 'aa.aahaa.aa', '...aaaaa...', '....aaa....', '.a...a...a.', '.....a.....'],
  toi: ['...hhhhh...', '..hhhhhhh..', '..hfhhhfh..', '..hhhhhhh..', '..hfhhhfh..', '...hfffh...', '....hhh....', '.fffffffff.', 'fffffffffff'],
  pixel: ['...........', '..ff...ff..', '..ff...ff..', '..ff...ff..', '...........', '.pp.....pp.', '...f...f...', '....fff....', '...........'],
  fleur: ['...p...p...', '..ppp.ppp..', '...paaap...', '..ppaaapp..', '...ppppp...', '.....f.....', '.ff..f..ff.', '..fffffff..', '.....f.....'],
};
for (const k in ART) sprite('vieArt-' + k, ART[k]);
sprite('vieBrush', ['.f.', 'fff', 'fff', '.a.', '.a.', '.a.', '.d.', '.d.']);
sprite('viePot', ['dddddddd', '.ffffff.', '.aaaaaa.', '.aaaaaa.', '..aaaa..', '..aaaa..']);
sprite('vieCan', ['..ddd......', '.d...d....a', '.aaaaaa..a.', '.aaaaaaaa..', '.aaaaaa....', '.aaaaaa....', '..aaaa.....']);
sprite('vieFlower', ['.p.p.', 'ppppp', '.pap.', 'ppppp', '.p.p.']);
sprite('vieHat', ['...dddddd...', '...ffffff...', '...ffffff...', '...ffffff...', '...ffffff...', '...pppppp...', '...ffffff...', 'ffffffffffff', '.ffffffffff.']);
sprite('vieRabbit', ['.h...h.', '.h...h.', '.hp.ph.', '.hhhhh.', 'hhfhfhh', 'hhhphhh', '.hhhhh.', '.hhhhh.', '..h.h..']);
sprite('vieMug', ['hhhhhh..', 'hddddh..', 'hhhhhhhh', 'hhpphh.h', 'hpppph.h', 'hhpphhhh', '.hhhh...']);
sprite('vieCup', ['.hhhhhhh....', '.hdddddh.hh.', '.hhhhhhhh..h', '..hhhhhh.hh.', '...hhhh.....', 'hhhhhhhhhhh.', '.hhhhhhhhh..']);
sprite('vieFence', ['.d....d....d.', 'fffffffffffff', '.d....d....d.', 'fffffffffffff', '.d....d....d.', '.d....d....d.']);
sprite('vieSheep0', ['...hhhhh..', '.ffhhhhhhh', 'fffhhhhhhh', '.f.hhhhhhh', '....f...f.', '....f...f.']);
sprite('vieSheep1', ['...hhhhh..', '.ffhhhhhhh', 'fffhhhhhhh', '.f.hhhhhhh', '...f...f..', '....f...f.']);
sprite('vieBall', ['..fff..', '.fhhhf.', 'fhhfhhf', 'fhfffhf', 'fhhfhhf', '.fhhhf.', '..fff..']);
sprite('vieCloth', ['hhhhhhhhh', 'hhhhhhhdh', 'hhdhhhhhh', 'hhhhhdhhh', 'hdhhhhhhh', 'hhhhhhdhh', 'h.h.h.h.h']);
sprite('vieBolt', ['...aaaa', '..aaaa.', '..aaa..', '.aaa...', '.aaaaaa', 'aaaaaa.', '...aaa.', '..aaa..', '..aa...', '.aa....', '.a.....', 'a......']);
sprite('vieLeaf', ['.a.', 'aaa', '.a.']);
sprite('vieNote', ['..aa.', '..aaa', '..a.a', '..a..', 'aaa..', 'aaa..']);
sprite('vieLeafP', ['p.', 'pp', '.p']);
// the 4 pm cookie, bite after bite (its pixels within each bite are gone)
{
  const base = ['..aaaaa..', '.aaafaaa.', 'aafaaaaaa', 'aaaaaafaa', 'aaafaaaaa', 'aaaaaaaaa', 'afaaaafaa', '.aaaaaaa.', '..aaaaa..'];
  const bites = [[8.5, 1.5, 2.3], [9, 5.5, 2.7], [7, 9, 3], [3, 9.2, 3.3], [0.5, 4, 4.2]];
  for (let k = 0; k <= bites.length; k++) sprite('vieCookie' + k, base.map((row, y) => [...row].map((ch, x) => (bites.slice(0, k).some(([bx, by, r]) => Math.hypot(x + 0.5 - bx, y + 0.5 - by) < r) ? '.' : ch)).join('')));
}

/* ---------- our props ---------- */
// an open book held under his eyes; flip: a page turning (0..1)
prop('vieBook', (D, q, flip = 0) => {
  if (q <= 0) return; const g = D.g, c = D.col, p = D.P(48, 46), u = D.U * pop(q);
  g.save(); g.translate(p.x, p.y); g.rotate(tilt(D));
  g.fillStyle = c.acc; g.fillRect(-11 * u, -6.5 * u, 22 * u, 13 * u);
  g.fillStyle = c.hi; g.fillRect(-10 * u, -5.5 * u, 9.4 * u, 11 * u); g.fillRect(0.6 * u, -5.5 * u, 9.4 * u, 11 * u);
  g.fillStyle = c.dim; for (let i = 0; i < 4; i++) { g.fillRect(-8.5 * u, (-3.8 + i * 2.2) * u, (i === 3 ? 4 : 6.5) * u, u); g.fillRect(2 * u, (-3.8 + i * 2.2) * u, (i === 1 ? 4 : 6.5) * u, u); }
  g.fillStyle = c.fg; g.fillRect(-0.6 * u, -6.5 * u, 1.2 * u, 13 * u);
  if (flip > 0 && flip < 1) {
    const w = 9.4 * u * Math.cos(Math.PI * flip), aw = Math.max(u, Math.abs(w)), x0 = w >= 0 ? 0.6 * u : -0.6 * u - aw;
    g.fillStyle = c.hi; g.fillRect(x0, -6.5 * u, aw, 11 * u); g.fillStyle = c.dim; g.fillRect(w >= 0 ? x0 + aw - u : x0, -6.5 * u, u, 11 * u);
  }
  g.restore();
});
// three pixels to juggle: [u, v, colour] in his grid
prop('vieBalls', (D, balls, q) => { if (q <= 0) return; const s = 3 * D.U * pop(q); for (const [u, v, c] of balls) { if (v > 60 || v < -30) continue; const p = D.P(u, v); box(D, p.x - s / 2, p.y - s / 2, s, s, D.col[c]); } });
// a yo-yo on its string, from (ax, ay) to (bx, by) in his grid
prop('vieYoyo', (D, a, b, spin, q) => {
  if (q <= 0) return; const g = D.g, c = D.col, U = D.U, pa = D.P(a[0], a[1]), pb = D.P(b[0], b[1]);
  line(D, [[pa.x, pa.y], [pb.x, pb.y]], 0.7 * U, c.fg); disc(D, pa.x, pa.y, 1.1 * U, c.fg);
  disc(D, pb.x, pb.y, 2.6 * U * pop(q), c.acc);
  g.save(); g.translate(pb.x, pb.y); g.rotate(spin); g.fillStyle = c.hi; g.fillRect(-1.8 * U, -0.5 * U, 3.6 * U, U); g.restore();
});
// the easel and the painting (prog 0..1: how much is painted), the brush on the pixel being painted
prop('vieEasel', (D, q, prog, motif, e, brush) => {
  if (q <= 0) return; const c = D.col, s = pop(q), u = G * s, x = 616, y = 246, art = SPR['vieArt-' + motif];
  for (const [dx, dy] of [[-9.5, 26], [9.5, 26], [0, 24]]) line(D, [[x + dx * 0.35 * u, y], [x + dx * u, y + dy * u]], u, c.dim);
  box(D, x - 9 * u, y + 6.5 * u, 18 * u, u, c.acc);
  box(D, x - 8 * u, y - 7 * u, 16 * u, 13 * u, c.acc); box(D, x - 7 * u, y - 6 * u, 14 * u, 11 * u, c.bg);
  if (!art) return;
  const n = Math.floor(clamp(prog, 0, 1) * art.runs.length);
  spr(D, 'vieArt-' + motif, x, y - 0.5 * u, u, 0, false, n);
  if (brush && n < art.runs.length) {
    const [rx, ry, len] = art.runs[n], bx = x - art.w * u / 2 + (rx + len / 2) * u, by = y - 0.5 * u - art.h * u / 2 + ry * u;
    spr(D, 'vieBrush', bx + 1.2 * u, by + 3.5 * u - Math.abs(Math.sin(e / 90)) * u, u * 0.9, 0.45);
  }
});
// a guitar across his chin; strum: the strings thicken; snap 0..1: a string springing out
prop('vieGuitar', (D, q, strum = 0, snap = 0) => {
  if (q <= 0) return; const g = D.g, c = D.col, p = D.P(53, 45), u = D.U * pop(q);
  g.save(); g.translate(p.x, p.y); g.rotate(tilt(D) - 0.35);
  g.fillStyle = c.fg; g.fillRect(-16 * u, -1.8 * u, 3.5 * u, 3.6 * u);
  g.fillStyle = c.dim; g.fillRect(-12.5 * u, -1 * u, 14 * u, 2 * u);
  g.fillStyle = c.acc; g.beginPath(); g.arc(2.6 * u, 0, 3.7 * u, 0, TAU); g.moveTo(12.6 * u, 0); g.arc(8 * u, 0, 4.6 * u, 0, TAU); g.fill();
  g.fillStyle = c.bg; g.beginPath(); g.arc(5 * u, 0, 1.6 * u, 0, TAU); g.fill();
  g.fillStyle = c.fg; g.fillRect(10 * u, -2.2 * u, 1.2 * u, 4.4 * u);
  g.fillStyle = c.hi; g.fillRect(-14 * u, -0.5 * u, 25 * u, u * (1 + 0.5 * strum));
  if (snap > 0) { g.save(); g.translate(10.6 * u, -0.5 * u); g.rotate(-0.9 - 0.6 * Math.sin(snap * 18) * (1 - snap)); g.fillRect(0, -u / 2, 6.5 * u, u); g.restore(); }
  g.restore();
});
// a handheld game console under his face, a tiny runner game on its screen (over: game over)
prop('vieConsole', (D, e, q, over, step) => {
  if (q <= 0) return; const g = D.g, c = D.col, p = D.P(48, 47), u = D.U * pop(q);
  g.save(); g.translate(p.x, p.y); g.rotate(tilt(D));
  g.fillStyle = c.dim; g.fillRect(-13 * u, -6 * u, 26 * u, 12 * u);
  g.fillStyle = c.fg; g.fillRect(-7 * u, -5 * u, 14 * u, 10 * u); g.fillRect(-11 * u, -1 * u, 3 * u, u); g.fillRect(-10 * u, -2 * u, u, 3 * u);
  g.fillStyle = c.bg; g.fillRect(-6 * u, -4 * u, 12 * u, 8 * u);
  const press = Math.floor(e / 170) % 4;
  g.fillStyle = press === 0 ? c.hi : c.acc; g.fillRect(9 * u, -2.5 * u, 2 * u, 2 * u);
  g.fillStyle = press === 2 ? c.hi : c.pink; g.fillRect(7.5 * u, 0.5 * u, 2 * u, 2 * u);
  if (!over) {
    g.fillStyle = c.dim; g.fillRect(-6 * u, 3 * u, 12 * u, u);
    g.fillStyle = c.fg; for (let col = 0; col < 12; col++) { const w = col + step; if (w % 6 === 0) g.fillRect((-6 + col) * u, (w % 12 === 0 ? 1 : 2) * u, u, (w % 12 === 0 ? 2 : 1) * u); }
    const jump = (2 + step) % 6 === 0 || (3 + step) % 6 === 0 || (4 + step) % 6 === 0;
    g.fillStyle = c.hi; g.fillRect(-4 * u, (jump ? -1 : 2) * u, u, u);
  }
  g.restore();
  if (over && (e % 500) < 350) { D.glyph('GAME', p.x, p.y - 1.8 * u, 3 * u, c.acc); D.glyph('OVER', p.x, p.y + 1.6 * u, 3 * u, c.acc); }
});
// a butterfly (s: its size), wings flapping
prop('vieButterfly', (D, x, y, e, s = 1, slow = false) => {
  const g = D.g, c = D.col, u = G * s, fl = 0.3 + 0.7 * Math.abs(Math.cos(e / (slow ? 260 : 70)));
  for (const sd of [-1, 1]) {
    g.fillStyle = c.pink; g.beginPath(); g.ellipse(x + sd * 2.3 * u * fl, y - 1.3 * u, 2.3 * u * fl + 0.5, 1.9 * u, 0, 0, TAU); g.fill();
    g.fillStyle = c.acc; g.beginPath(); g.ellipse(x + sd * 1.6 * u * fl, y + 1.4 * u, 1.5 * u * fl + 0.5, 1.2 * u, 0, 0, TAU); g.fill();
  }
  box(D, x - 0.5 * u, y - 2 * u, u, 4.2 * u, c.fg); box(D, x - 1.5 * u, y - 3.4 * u, u, u, c.fg); box(D, x + 0.5 * u, y - 3.4 * u, u, u, c.fg);
});
// a soap bubble (r: its radius in px); popped 0..1: it bursts
prop('vieSoap', (D, x, y, r, popped = 0) => {
  const U = D.U, c = D.col;
  if (popped > 0) { const d = r * (0.8 + popped); for (let i = 0; i < 6; i++) { const a = i * TAU / 6; box(D, x + Math.cos(a) * d - U / 2, y + Math.sin(a) * d - U / 2, U, U, c.hi); } return; }
  D.ring(x, y, r, c.hi, 0.8 * U); box(D, x - 0.55 * r, y - 0.6 * r, U, U, c.hi);
});
// the bubble wand at his right
prop('vieWand', (D, q) => {
  if (q <= 0) return; const c = D.col, U = D.U, a = D.P(76, 52), b = D.P(82, 39), r = D.P(82, 36);
  line(D, [[a.x, a.y + (1 - q) * 60], [b.x, b.y + (1 - q) * 60]], U, c.acc); D.ring(r.x, r.y + (1 - q) * 60, 2.4 * U, c.hi, 0.9 * U);
});
// knitting: two needles under his chin, a striped scarf growing down (len, in his pixels), the ball of yarn shrinking
prop('vieKnit', (D, e, q, len, ball) => {
  if (q <= 0) return; const g = D.g, c = D.col, U = D.U, u = U * pop(q), p = D.P(48, 46), click = Math.sin(e / 140) * 0.12;
  const bottom = HT - 48, room = Math.max(0, (bottom - p.y) / u - 1), down = Math.min(len, room), rest = Math.max(0, len - room);
  for (let j = 0; j < down; j += 2) box(D, p.x - 3 * u, p.y + (1 + j) * u, 6 * u, Math.min(2, down - j) * u, Math.floor(j / 2) % 2 ? c.pink : c.acc);
  for (let j = 0; j < rest; j += 2) box(D, p.x + (3 + j) * u, bottom - 2 * u, Math.min(2, rest - j) * u, 2 * u, Math.floor(j / 2) % 2 ? c.acc : c.pink);
  for (const sd of [-1, 1]) { const a = sd * (0.62 + sd * click); g.save(); g.translate(p.x, p.y); g.rotate(a + tilt(D)); g.fillStyle = c.fg; g.fillRect(-0.5 * u, -9 * u, u, 18 * u); g.fillStyle = c.hi; g.fillRect(-0.7 * u, -10 * u, 1.4 * u, 1.4 * u); g.restore(); }
  const b = D.P(14, 49), br = 3 * u * clamp(ball, 0.35, 1);
  line(D, [[b.x, b.y], [lerp(b.x, p.x, 0.5), b.y + 2 * u], [p.x, p.y]], 0.6 * U, c.pink);
  disc(D, b.x, b.y, br, c.pink); const a = e / 300; box(D, b.x + Math.cos(a) * br * 0.5 - U / 2, b.y + Math.sin(a) * br * 0.5 - U / 2, U, U, c.hi);
});
// the plant in its pot, at the left of the floor: grow 0..1, bloom 0..1
prop('viePlant', (D, q, grow, bloom) => {
  if (q <= 0) return; const c = D.col, u = G, x = 168, top = FLOOR - 5 * u, s = pop(q);
  spr(D, 'viePot', x, FLOOR - 3 * u * s, u * s);
  if (q < 1) return;
  const h = (1 + 12 * grow) * u;
  box(D, x - u / 2, top - h, u, h, c.fg);
  if (grow > 0.3) box(D, x - 2.5 * u, top - 4 * u, 2 * u, u, c.hi);
  if (grow > 0.6) box(D, x + 0.5 * u, top - 8 * u, 2 * u, u, c.hi);
  if (bloom > 0) spr(D, 'vieFlower', x, top - h - 1.5 * u, u * pop(bloom)); else if (grow > 0.9) box(D, x - u, top - h - u, 2 * u, 2 * u, c.dim);
});
// the watering can at his left, tilted by a (rad); water falls on the pot while it pours
prop('vieCan', (D, q, a, e) => {
  if (q <= 0) return; const p = D.P(12, 30), u = D.U * pop(q), r = tilt(D) + a;
  spr(D, 'vieCan', p.x, p.y, u, r);
  if (a > 0.4) { const tx = p.x + Math.cos(r) * 5 * u + Math.sin(r) * 2 * u, ty = p.y + Math.sin(r) * 5 * u - Math.cos(r) * 2 * u, top = FLOOR - 5 * G;
    for (let i = 0; i < 4; i++) { const k = ((e / 380) + i / 4) % 1; box(D, tx + (i % 2) * 3, lerp(ty, top, k), G, G, D.col.hi); } }
});
/* ================= the scenes ================= */
/* ---------- hobbies ---------- */
S('vie-lecture', 'La lecture', 'vie', { dur: 10000, w: 2, anim: [[0, 'idle-bas'], [2600, 'reflechit'], [5200, 'surpris'], [5900, 'rire'], [8400, 'content']], mood: 'reflechit',
  say: [[500, 2400, L('Chapitre 1…', 'Il était une fois…', 'Bon, où j’en étais ?', 'Une petite lecture…')], [5200, 5900, L('Oh !', 'Quoi ?!', 'Non !')],
    [6000, 8200, L('Le dragon a le hoquet !', 'Hihi, trop drôle !', 'Le héros est un robot !', 'Ce livre est génial !')], [8500, 9800, L('Encore un chapitre…', 'Je te le prêterai.', 'Vivement la suite !')]],
  secret: L('Chut, je lis !', 'Pas de spoiler, hein !', 'Attends, la fin du chapitre !'),
  move: e => { const k = io(e, 0, 900, 9000, 10000), lg = io(e, 5900, 6100, 7900, 8300);
    return { y: 14 * k + hop(e, 5200, 5700, 16) - 4 * Math.abs(Math.sin(e / 110)) * lg, r: 0.03 * Math.sin(e / 700) * k + 0.05 * Math.sin(e / 70) * lg }; },
  props: (D, e) => { const t = [2500, 4600, 7300].find(t => e >= t && e < t + 600); D.vieBook(lin(e, 150, 650, 9300, 9800), t ? (e - t) / 600 : 0); } });

const JUG = e => (e < 3600 ? (e - 800) / 1400 : 2 + (e - 3600) / 1000);          // the juggling's rhythm: faster after 3.6 s
function jugBall(i, e) {
  const q = (((JUG(e) + i / 3) % 1) + 1) % 1;
  if (q < 0.72) { const t = q / 0.72; return [18 + 60 * t, 44 - 160 * t * (1 - t)]; }
  const t = (q - 0.72) / 0.28; return [78 - 60 * t, 44 + 3 * bump(t)];
}
S('vie-jongle', 'Le jongleur', 'vie', { dur: 8400, w: 2, anim: [[0, 'curieux'], [800, 'fier'], [5600, 'surpris'], [6200, 'confus'], [7400, 'rire']], mood: 'fier',
  say: [[300, 2000, L('Regarde ça !', 'Un, deux, trois…', 'Attention… hop !')], [3700, 5200, L('Plus vite !', 'Je suis un pro !', 'Et sans les mains !')],
    [5850, 6800, L('Bonk.', 'Aïe !', 'Ouille…')], [6900, 8200, L('C’était voulu.', 'Ça fait partie du show !', 'Applaudis quand même.')]],
  move: e => { const k = io(e, 0, 700, 7500, 8400), jg = io(e, 600, 900, 5100, 5500);
    return mv({ y: 24 * k - 5 * Math.abs(Math.sin(Math.PI * JUG(e))) * jg, r: 0.07 * Math.sin((e - 6000) / 260) * io(e, 6000, 6200, 7200, 7600) }, squash(e, 5850, 0.3)); },
  props: (D, e) => {
    if (e > 400 && e < 7000) {
      const cols = ['acc', 'pink', 'hi'], bs = [];
      for (let i = 0; i < 3; i++) {
        let uv;
        if (e < 5200) uv = jugBall(i, e);
        else if (i < 2) { const [u, v] = jugBall(i, 5200), t = (e - 5200) / 1000; uv = [u, v + 120 * t * t]; }
        else if (e < 5500) { const [u, v] = jugBall(2, 5200), t = out(seg(e, 5200, 5500)); uv = [lerp(u, 48, t), lerp(v, -26, t)]; }
        else if (e < 5850) uv = [48, lerp(-26, 9, inn(seg(e, 5500, 5850)))];
        else { const t = seg(e, 5850, 6900); uv = [48 + 46 * t, 9 - 48 * t + 110 * t * t]; }
        bs.push([uv[0], uv[1], cols[i]]);
      }
      D.vieBalls(bs, seg(e, 400, 800));
    }
    D.dizzy(e, io(e, 5900, 6100, 7100, 7500));
  } });

function yoyoAt(e) {                                   // where the yo-yo is, from his finger (in his pixels)
  if (e < 2800) return [0, 3 + 21 * Math.abs(Math.sin(Math.PI * Math.max(0, e - 400) / 800))];
  if (e < 5000) { const th = Math.PI / 2 - 2 * TAU * sm(seg(e, 2800, 5000)), R = 3 + 15 * io(e, 2800, 3100, 4700, 5000); return [R * Math.cos(th), R * Math.sin(th)]; }
  return [0, 3];
}
S('vie-yoyo', 'Le yo-yo', 'vie', { dur: 7800, w: 1, anim: [[0, 'content'], [2800, 'etoiles'], [5600, 'fier']], mood: 'content',
  say: [[300, 2400, L('Yo-yo !', 'Monte… descends…', 'Hop, hop, hop.')], [2900, 4900, L('Le tour du monde !', 'Wouhou !', 'Regarde, regarde !')], [5700, 7500, L('Pas mal, hein ?', 'Champion du yo-yo !', 'Et hop, dans la poche.')]],
  move: e => { const k = io(e, 0, 400, 7000, 7800), [dx, dy] = yoyoAt(e);
    return { y: (e < 2800 ? 7 * (dy - 3) / 21 : 0) * k + hop(e, 5500, 6100, 20), r: (e > 2800 && e < 5000 ? 0.06 * dx / 18 : 0) * k, x: (e > 2800 && e < 5000 ? 8 * dx / 18 : 0) * k }; },
  props: (D, e) => { const [dx, dy] = yoyoAt(e); D.vieYoyo([80, 30], [80 + dx, 30 + dy], e / 40, lin(e, 200, 500, 7000, 7400)); } });

const PAINT = { coeur: 'Un cœur, pour toi !', soleil: 'Un grand soleil !', toi: 'C’est ton portrait !', pixel: 'Mon autoportrait !', fleur: 'Une jolie fleur !' };
S('vie-peinture', 'Le peintre', 'vie', { dur: 10800, w: 2, anim: [[0, 'curieux'], [1800, 'reflechit'], [6800, 'fier'], [8800, 'content']], mood: 'reflechit',
  init: o => { o.motif = pick(Object.keys(PAINT)); },
  say: [[300, 1800, L('Un peu d’art…', 'Je vais peindre !', 'Où est mon pinceau ?')], [2600, 6200, L('Un peu de couleur ici…', 'Concentration…', 'Un trait… parfait.', 'Je suis un génie.')],
    [7000, 9000, o => PAINT[o.motif] || 'Tadaa !'], [9100, 10600, L('Je l’exposerai au Louvre.', 'Pas mal, non ?', 'Tu l’accroches où ?')]],
  secret: L('Bouge pas, je te peins !', 'Chut, l’artiste travaille !'),
  move: e => { const k = io(e, 0, 1200, 9600, 10800), pt = io(e, 2000, 2300, 6400, 6700), back = io(e, 7000, 7400, 8800, 9400);
    return { x: -150 * k - 20 * back, y: -3 * Math.abs(Math.sin(e / 180)) * pt + hop(e, 7000, 7600, 22), r: 0.04 * Math.sin(e / 180) * pt }; },
  props: (D, e, p, o) => D.vieEasel(lin(e, 600, 1100, 9900, 10500), seg(e, 2000, 6600), o.motif, e, e > 1900 && e < 6700) });

S('vie-guitare', 'La guitare', 'vie', { dur: 9200, w: 2, anim: [[0, 'chante'], [3600, 'danse'], [7200, 'surpris'], [7900, 'timide']], mood: 'content',
  say: [[400, 3200, L('♪ Une petite chanson…', '♪ Do, ré, mi…', '♪ Pour mon humain…')], [3700, 6900, L('Et maintenant… ROCK !', 'Yeaaah !', 'Solo de guitare !')], [7900, 9000, L('Oups, une corde…', 'C’est ça, le rock.', 'Elle était vieille.')]],
  move: e => { const a = io(e, 0, 400, 3400, 3700), b = io(e, 3500, 3800, 6900, 7200), jolt = io(e, 7200, 7250, 7600, 7800), shy = io(e, 7900, 8200, 8700, 9200);
    return { y: 7 * Math.abs(Math.sin(e / 260)) * a + jumps(e - 3600, 520, 13) * b, r: 0.04 * Math.sin(e / 520) * a + 0.13 * Math.sin((e - 3600) / 260) * b - 0.06 * shy, x: 45 * Math.sin((e - 3600) / 1040) * b + 8 * Math.sin(e / 25) * jolt }; },
  props: (D, e) => {
    const strum = e < 7200 ? Math.max(0, Math.sin(e / (e > 3600 ? 65 : 130))) : 0;
    D.vieGuitar(lin(e, 0, 500, 8600, 9100), strum, e > 7200 && e < 8800 ? seg(e, 7200, 8800) : 0);
    if (e > 400 && e < 7100) D.notes(e);
    if (e > 7200 && e < 7900) { const p = D.P(86, 40); D.glyph('PLOING !', Math.min(p.x, W - 70), p.y - 4 * D.U * seg(e, 7200, 7900), 4.5 * D.U, D.col.acc); }
  } });

const GAME = e => (e < 4500 ? Math.floor(e / 110) : Math.floor(4500 / 110 + (e - 4500) / 60));   // the console's scrolling
S('vie-console', 'Le jeu vidéo', 'vie', { dur: 9600, w: 2, side: true, anim: [[0, 'idle-bas'], [4500, 'panique'], [6200, 'triste'], [7800, 'idee'], [8600, 'content']], mood: 'reflechit',
  say: [[300, 1900, L('Une petite partie ?', 'Niveau 1… go !', 'Je bats mon record !')], [4600, 6100, L('Le boss !', 'Saute ! SAUTE !', 'Non, non, non…')],
    [6300, 7700, L('Game over…', 'Perdu…', 'Il triche, ce boss.')], [7900, 9300, L('Encore une !', 'Allez, la dernière !', 'La revanche !')]],
  secret: L('Chut, je vais battre le boss !', 'Attends, je sauvegarde !', 'Pause ! Pause !'),
  move: e => { const k = io(e, 0, 600, 8900, 9600), lean = io(e, 1500, 1900, 4300, 4500), boss = io(e, 4500, 4600, 6000, 6200), sad = io(e, 6200, 6600, 7500, 7900);
    return { x: (10 * Math.sin(e / 400) * lean + 6 * Math.sin(e / 90) * boss) * k, y: 8 * k + 18 * sad + hop(e, 7800, 8300, 24), r: (0.06 * Math.sin(e / 400) * lean + 0.08 * Math.sin(e / 120) * boss) * k }; },
  props: (D, e) => D.vieConsole(e, lin(e, 100, 600, 9000, 9500), e > 6200 && e < 7900, GAME(e)) });

const flyB = e => ({ x: 400 + 290 * Math.sin(e / 1300 - 1.4) + 50 * Math.sin(e / 310), y: 185 + 70 * Math.sin(e / 830 + 0.5) + 25 * Math.sin(e / 210) - 90 * bump(seg(e, 3800, 4800)) });
S('vie-papillon', 'Le papillon', 'vie', { dur: 11000, w: 2, side: true, when: c => c.h >= 8 && c.h < 20,
  anim: [[0, 'curieux'], [1000, 'idle-regard'], [3800, 'surpris'], [4600, 'curieux'], [7000, 'timide'], [9000, 'salut'], [10300, 'content']], mood: 'ecoute',
  say: [[600, 2800, L('Oh, un papillon !', 'Qu’il est joli !', 'Viens par ici, toi…')], [3800, 4700, L('Hop !', 'Je t’ai… raté.')], [5400, 6300, L('Reviens !', 'Presque !')],
    [7200, 8900, L('Chut… il est posé.', 'Je bouge plus…', 'Il m’aime bien !')], [9100, 10800, L('Au revoir, papillon !', 'Reviens quand tu veux !', 'Bon vol !')]],
  secret: L('Chut ! Tu vas lui faire peur !', 'Il est posé sur moi !'),
  move: e => { const f = flyB(e), fol = io(e, 800, 1500, 6000, 6800), side = Math.sign(f.x - 400) || 1;
    return mv({ x: clamp((f.x - 400) * 0.3, -100, 100) * fol + 50 * side * bump(seg(e, 5400, 6100)), y: hop(e, 3800, 4500, 60) + hop(e, 5400, 6100, 30) + hop(e, 9100, 9500, 10), sy: 1 + 0.12 * bump(seg(e, 3800, 4500)) },
      squash(e, 4500, 0.2), squash(e, 6100, 0.15)); },
  props: (D, e) => {
    if (e > 10400) return;
    const f = flyB(e), head = D.P(50, 8);
    let x = f.x, y = f.y;
    if (e > 6300 && e < 9000) { const q = sm(seg(e, 6300, 7000)); x = lerp(f.x, head.x, q); y = lerp(f.y, head.y, q); }
    else if (e >= 9000) { const q = inn(seg(e, 9000, 10400)); x = lerp(head.x, 860, q); y = lerp(head.y, 40, q); }
    const s = pop(seg(e, 0, 400));
    if (s > 0) D.vieButterfly(x, y, e, s, e > 7000 && e < 9000);
    if (e > 7000 && e < 9200) D.blush(io(e, 7000, 7400, 8800, 9200));
  } });

const SOAP = [900, 1500, 2100, 2800, 3400];
const SOAPDX = [6, -16, 9, -30, 1];
const soapAt = (i, t) => ({ u: 82 + SOAPDX[i] * t + 2 * Math.sin(t * 6 + i), v: 36 - 30 * t - 2 * Math.sin(t * 4 + i), r: (1.8 + (i % 3) * 1.1) * Math.min(1, t * 6) });
S('vie-bulles', 'Les bulles de savon', 'vie', { dur: 9000, w: 2, anim: [[0, 'content'], [700, 'bisou'], [5500, 'surpris'], [5900, 'clin-oeil'], [6800, 'rire']], mood: 'content',
  say: [[300, 2200, L('Des bulles !', 'Fffffff…', 'Regarde comme elles brillent !')], [5500, 6300, L('Pop !', 'Aïe, dans l’œil !')], [6800, 8800, L('Ça pique un peu !', 'Hihi, encore !', 'Celle-là, elle m’aimait.')]],
  move: e => { const blow = SOAP.concat([4000]).reduce((a, t) => a + bump(seg(e, t - 250, t + 100)), 0), lg = io(e, 6800, 7000, 8200, 8800);
    return mv({ s: 1 + 0.03 * blow, y: hop(e, 5500, 5900, 14) - 4 * Math.abs(Math.sin(e / 100)) * lg, r: 0.05 * Math.sin(e / 80) * lg }, squash(e, 5900, 0.15)); },
  props: (D, e) => {
    D.vieWand(lin(e, 200, 700, 7800, 8400));
    const U = D.U;
    SOAP.forEach((t0, i) => { const t = (e - t0) / 3000; if (t < 0 || t > 1.06) return; const b = soapAt(i, Math.min(t, 1)), p = D.P(b.u, b.v); D.vieSoap(p.x, p.y, b.r * U, t > 1 ? (t - 1) / 0.06 : 0); });
    if (e > 4000 && e < 5800) {
      const t = seg(e, 4000, 5500), p = D.P(lerp(82, 34, sm(t)), lerp(36, 23, t) - 10 * bump(t));
      D.vieSoap(p.x, p.y, 2.6 * U * Math.min(1, t * 8), e > 5500 ? seg(e, 5500, 5800) : 0);
    }
  } });

S('vie-tricot', 'Le tricot', 'vie', { dur: 10200, w: 1, anim: [[0, 'idle-bas'], [3000, 'content'], [7000, 'fier'], [8600, 'amoureux']], mood: 'content',
  say: [[400, 2600, L('Une maille à l’endroit…', 'Tricoti, tricota…', 'Clic, clic, clic…')], [3200, 6400, L('…une maille à l’envers.', 'Ça avance bien !', 'Encore un rang…')],
    [7000, 8500, L('Tadaa ! Une écharpe !', 'Une écharpe pour toi !', 'Pour cet hiver !')], [8600, 10000, L('Elle fait trois mètres.', 'Elle t’ira bien !', 'Tricotée avec amour.')]],
  secret: L('Chut, je compte mes mailles !', 'Oh non, j’ai perdu le fil !', 'C’est une surprise !'),
  move: e => { const k = io(e, 0, 800, 9300, 10200), st = io(e, 800, 1100, 6700, 7000);
    return { y: 6 * k + 2.5 * Math.abs(Math.sin(e / 140)) * st + hop(e, 7000, 7500, 22), r: 0.02 * Math.sin(e / 280) * st }; },
  props: (D, e) => { D.vieKnit(e, lin(e, 200, 700, 9500, 10100), 2 + 20 * seg(e, 800, 7000), 1 - seg(e, 800, 7000)); if (e > 8600 && e < 10000) D.hearts(e - 8600, 0.7); } });

S('vie-plante', 'La plante', 'vie', { dur: 11200, w: 2, anim: [[0, 'content'], [3800, 'idle-impatient'], [7300, 'etoiles'], [8600, 'amoureux']], mood: 'content',
  say: [[300, 1800, L('Ma petite plante…', 'C’est l’heure d’arroser !', 'Tu as soif, toi ?')], [4200, 7000, L('Pousse, pousse…', 'Allez, grandis !', 'C’est long, la nature…')],
    [7400, 9000, L('Elle a fleuri !', 'Regarde ma fleur !', 'Trop belle !')], [9200, 11000, L('Je l’appelle Rose.', 'Elle me ressemble.', 'Ma fleur à moi.')]],
  move: e => { const water = io(e, 1200, 1600, 3200, 3600), wait = io(e, 3800, 4300, 7000, 7300);
    return { r: -0.06 * water - 0.07 * wait, x: -30 * wait, y: jumps(e - 3800, 400, 6) * wait + hop(e, 7300, 7900, 30) }; },
  props: (D, e) => { D.vieCan(lin(e, 700, 1100, 3600, 4000), 0.7 * sm(seg(e, 1200, 1600)) * fin(e, 3200, 3600), e); D.viePlant(lin(e, 200, 700, 10400, 11000), seg(e, 2600, 7000), seg(e, 7300, 7700)); if (e > 7400 && e < 8600) D.stars(e - 7400); } });

/* ---------- props for the next hobbies ---------- */
const TOW = { x: 610, n: 7, b: 35, t: i => 800 + i * 620 }, TCOL = ['acc', 'pink', 'hi', 'fg', 'acc', 'pink', 'hi'];
const towSway = e => (e < 4600 ? 0 : 0.07 * Math.sin((Math.min(e, 6900) - 4600) / 170) * seg(e, 4600, 6600));
const towTilt = e => towSway(e) + 1.1 * inn(seg(e, 6900, 7500));
// the tower of pixel blocks at the right of the floor: built block after block, it sways, falls and its blocks tumble
prop('vieTower', (D, e) => {
  const c = D.col, B = TOW.b, X = TOW.x, g = D.g;
  const block = (x, y, a, k) => { const col = c[TCOL[k]], hl = TCOL[k] === 'hi' ? c.fg : c.hi;
    if (!a) { box(D, x - B / 2, y - B / 2, B, B, col); box(D, x - B / 2 + G, y - B / 2 + G, G, G, hl); return; }
    g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = col; g.fillRect(-B / 2, -B / 2, B, B); g.fillStyle = hl; g.fillRect(-B / 2 + G, -B / 2 + G, G, G); g.restore(); };
  const th = towTilt(e), th1 = towTilt(7500), w = 3.3 / 600, fl = FLOOR - B / 2, grav = 0.002;
  for (let i = 0; i < TOW.n; i++) {
    const t0 = TOW.t(i); if (e < t0) break;
    const rr = B * (i + 0.5);
    if (e < t0 + 380) { const L = D.P(82, 24), q = seg(e, t0, t0 + 380); block(lerp(L.x, X, q), lerp(L.y, FLOOR - rr, q) - 70 * bump(q), 0, i); continue; }
    if (e < 7500) { block(X + rr * Math.sin(th), FLOOR - rr * Math.cos(th), Math.abs(th) < 0.004 ? 0 : th, i); continue; }
    const x0 = X + rr * Math.sin(th1), y0 = FLOOR - rr * Math.cos(th1), vx = w * rr * Math.cos(th1), vy = w * rr * Math.sin(th1), t = e - 7500;
    const hit = y0 >= fl ? 0 : (-vy + Math.sqrt(vy * vy + 2 * grav * (fl - y0))) / grav;
    const x = t < hit ? x0 + vx * t : x0 + vx * hit + vx * 100 * (1 - Math.exp(-(t - hit) / 250)), y = t < hit ? y0 + vy * t + grav * t * t / 2 : fl;
    const a = t < hit ? th1 + 0.006 * t * (i % 2 ? 1 : -1) : 0;
    if (x < W + B) block(x, y, a, i);
  }
});
// binoculars raised to his eyes
prop('vieBinoc', (D, q) => {
  if (q <= 0) return; const c = D.col, U = D.U, dv = (1 - out(q)) * 26, l = D.P(34, 23 + dv), r = D.P(66, 23 + dv);
  line(D, [[l.x, l.y], [r.x, r.y]], 3.4 * U, c.fg, 'butt');
  for (const p of [l, r]) { D.ring(p.x, p.y, 6.6 * U, c.fg, 2.4 * U); box(D, p.x - 4.4 * U, p.y - 4.8 * U, 1.2 * U, 1.2 * U, c.hi); }
});
// the magician's hat on the floor, his wand, and what comes out of it (trick: lapin, colombe, rien)
prop('vieMagic', (D, e, trick) => {
  const c = D.col, g = D.g, U = D.U, hx = 616, top = FLOOR - 9 * G, hq = lin(e, 300, 800, 8600, 9100);
  if (hq <= 0) return;
  if (trick === 'lapin' && e > 3700) {
    const rise = out(seg(e, 3700, 4200)), away = seg(e, 5200, 6800);
    const x = hx + 260 * away, y = away > 0 ? lerp(top - 24, FLOOR - 4.5 * G, sm(away)) - 46 * Math.abs(Math.sin(Math.PI * away * 3)) : top + 4.5 * G - 8 * G * rise;
    if (x < W + 40) spr(D, 'vieRabbit', x, y, G);
  }
  if (trick === 'colombe' && e > 3700) {
    const rise = out(seg(e, 3700, 4100)), q = inn(seg(e, 4100, 6200)), x = lerp(hx, 880, q), y = lerp(top + 2 * G - 6 * G * rise, 30, q), fl = Math.sin(e / 55);
    if (x < W + 40) {
      g.fillStyle = c.hi; g.beginPath(); g.ellipse(x, y, 3 * G, 2 * G, 0, 0, TAU); g.fill(); disc(D, x + 2.6 * G, y - 1.6 * G, 1.4 * G, c.hi);
      box(D, x + 3.6 * G, y - 1.8 * G, G, G, c.acc); box(D, x + 2.4 * G, y - 2.2 * G, G * 0.9, G * 0.9, c.fg);
      for (const sd of [-1, 1]) { g.save(); g.translate(x - 0.5 * G, y - 0.5 * G); g.rotate(sd * (0.4 + 0.7 * fl)); g.fillStyle = c.hi; g.fillRect(-1.2 * G, sd < 0 ? -5 * G : 0, 2.4 * G, 5 * G); g.restore(); }
    }
  }
  const wig = trick === 'rien' ? 3 * Math.sin(e / 30) * io(e, 3600, 3700, 4300, 4500) : 0;
  spr(D, 'vieHat', hx + wig, FLOOR - 4.5 * G, G * pop(hq));
  if (trick === 'rien' && e > 3600 && e < 4800) { const q = seg(e, 3600, 4800); for (let i = 0; i < 3; i++) disc(D, hx + (i - 1) * 16 + (i - 1) * 20 * q, top - 10 - 40 * q - i * 6, (8 + 14 * q) * (1 - q * 0.6), c.dim); }
  if (e > 1200 && e < 6000) {                          // the wand, tapping the hat three times
    const p = D.P(80, 40), a0 = Math.atan2(top - p.y, hx - p.x), tap = e > 2000 && e < 3500 ? Math.abs(Math.sin(Math.PI * (e - 2000) / 500)) : 1;
    const a = a0 - 0.35 * (1 - tap) * (e > 2000 ? 1 : 0) - 0.5 * fin(e, 1200, 1600), len = 15 * U * lin(e, 1200, 1500, 5600, 6000), tx = p.x + Math.cos(a) * len, ty = p.y + Math.sin(a) * len;
    line(D, [[p.x, p.y], [tx, ty]], 1.2 * U, c.fg); box(D, tx - 0.9 * U, ty - 0.9 * U, 1.8 * U, 1.8 * U, c.hi);
    if (e > 2000 && e < 3500 && tap > 0.92) D.star(hx, top - 6, 2.4 * U, c.acc, e / 100);
  }
  if (e > 3600 && e < 4400 && trick !== 'rien') { const q = seg(e, 3600, 4400); for (let i = 0; i < 8; i++) { const a = i * TAU / 8; D.star(hx + Math.cos(a) * 90 * q, top - 10 + Math.sin(a) * 60 * q, 2.6 * U * (1 - q), i % 2 ? c.hi : c.acc, a + q * 3); } }
});
// the window cleaner's cloth (x, y on the screen), rubbing
prop('vieCloth', (D, x, y, a) => spr(D, 'vieCloth', x, y, D.U * 1.2, a));
// the bright line rolling down (dir 1) or up (dir -1) the screen
prop('vieScan', (D, y, dir) => { box(D, 0, y, W, G, D.col.hi); box(D, 0, y - dir * G, W, G, D.col.dim); });
// a skipping rope from one side of him to the other; front: in front of him (else behind, darker)
prop('vieRope', (D, apex, front, q) => {
  if (q <= 0) return; const c = D.col, U = D.U, L = D.P(6, 44), R = D.P(90, 44), C = D.P(48, 2 * apex - 44), g = D.g;
  g.strokeStyle = front ? c.fg : c.dim; g.lineWidth = D.lw(U); g.lineCap = 'round'; g.beginPath(); g.moveTo(L.x, L.y); g.quadraticCurveTo(C.x, C.y, R.x, R.y); g.stroke();
  for (const p of [L, R]) box(D, p.x - U, p.y - 1.5 * U, 2 * U, 3 * U, c.acc);
});
// the paper plane, nose first along a
prop('viePlane', (D, x, y, a, s = 1) => {
  const g = D.g, c = D.col, u = G * s; g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = c.hi; g.beginPath(); g.moveTo(6 * u, 0); g.lineTo(-5 * u, -3.5 * u); g.lineTo(-3 * u, 0); g.closePath(); g.fill();
  g.fillStyle = c.dim; g.beginPath(); g.moveTo(6 * u, 0); g.lineTo(-3 * u, 0); g.lineTo(-5 * u, 2.5 * u); g.closePath(); g.fill();
  g.restore();
});
// a big cardboard box at the bottom of the screen (q: slid in), its flaps opening (flaps, rad)
prop('vieCarton', (D, q, flaps) => {
  if (q <= 0) return; const c = D.col, g = D.g, x0 = 232 + (1 - out(q)) * 600, w = 336, top = 329, h = FLOOR + 7 - top;
  for (const sd of [-1, 1]) { g.save(); g.translate(sd < 0 ? x0 : x0 + w, top); g.rotate(sd * (0.55 + flaps)); g.fillStyle = c.acc; g.fillRect(sd < 0 ? -11 * G : 0, -2 * G, 11 * G, 2 * G); g.fillStyle = c.dim; g.fillRect(sd < 0 ? -11 * G : 0, -G, 11 * G, G); g.restore(); }
  box(D, x0, top, w, h, c.acc); box(D, x0, top, w, G, c.dim); box(D, x0 + w / 2 - 2 * G, top + G, 4 * G, h - G, c.dim);
  D.glyph('FRAGILE', x0 + w / 4 - 6, top + h / 2 + 8, 26, c.bg); D.glyph('↑↑', x0 + w * 0.78, top + h / 2 + 8, 26, c.bg);
});
// the phone on its selfie stick: its back (camera, flash) or its screen showing the photo (eyes open or closed)
prop('viePhone', (D, x, y, a, front, flash, eyes) => {
  const g = D.g, c = D.col, u = D.U; g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = c.fg; g.fillRect(-3.5 * u, -6 * u, 7 * u, 12 * u);
  if (!front) { g.fillStyle = c.bg; g.fillRect(-2.5 * u, -5 * u, 2 * u, 2 * u); g.fillStyle = flash ? c.hi : c.dim; g.fillRect(0.5 * u, -5 * u, 2 * u, 2 * u); }
  else {
    g.fillStyle = c.bg; g.fillRect(-2.5 * u, -5 * u, 5 * u, 10 * u); g.fillStyle = c.fg;
    if (eyes) { g.fillRect(-1.8 * u, -3 * u, u, 2 * u); g.fillRect(0.8 * u, -3 * u, u, 2 * u); } else { g.fillRect(-2.2 * u, -2 * u, 1.8 * u, u); g.fillRect(0.4 * u, -2 * u, 1.8 * u, u); }
    g.fillRect(-1 * u, 1 * u, 2 * u, u); g.fillStyle = c.pink; g.fillRect(-2.5 * u, 0, u, u); g.fillRect(1.5 * u, 0, u, u);
  }
  g.restore();
});
// a pencil standing on its point at (x, y), leaning by a
prop('viePencil', (D, x, y, a, u) => {
  const g = D.g, c = D.col; g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = c.dim; g.beginPath(); g.moveTo(0, 0); g.lineTo(-1.3 * u, -2.4 * u); g.lineTo(1.3 * u, -2.4 * u); g.closePath(); g.fill();
  g.fillStyle = c.acc; g.fillRect(-1.3 * u, -11.5 * u, 2.6 * u, 9.2 * u); g.fillStyle = c.hi; g.fillRect(-1.3 * u, -12.6 * u, 2.6 * u, 1.2 * u);
  g.fillStyle = c.pink; g.fillRect(-1.3 * u, -14.5 * u, 2.6 * u, 2 * u); g.restore();
});

S('vie-tour', 'La tour de pixels', 'vie', { dur: 10400, w: 2, anim: [[0, 'curieux'], [700, 'fier'], [4600, 'panique'], [6900, 'surpris'], [7700, 'triste'], [8600, 'idee']], mood: 'fier',
  say: [[300, 2600, L('Une tour de pixels !', 'Un bloc… deux blocs…', 'Je fais un gratte-ciel !')], [4800, 6800, L('Ça penche…', 'Doucement… doucement…', 'Non, non, non…')],
    [7000, 8400, L('Patatras !', 'Oh non…', 'Ma tour !')], [8600, 10200, L('Bon, on recommence !', 'C’est la faute au vent.', 'C’était de l’art moderne.')]],
  move: e => { const k = io(e, 0, 800, 9600, 10400); let y = 0; for (let i = 0; i < TOW.n; i++) y += hop(e, TOW.t(i) - 150, TOW.t(i) + 200, 10);
    return mv({ x: -60 * k + 4 * Math.sin(e / 30) * io(e, 6000, 6200, 6800, 6900), y: y + hop(e, 6900, 7300, 26) + 14 * io(e, 7700, 8000, 8400, 8600) + hop(e, 8600, 9100, 22), r: -towSway(e) * 0.9 * fin(e, 6900, 7600) }, squash(e, 7300, 0.2)); },
  props: (D, e) => D.vieTower(e) });

S('vie-jumelles', 'Les jumelles', 'vie', { dur: 8800, w: 2, anim: [[0, 'curieux'], [1000, 'idle-regard'], [5200, 'surpris'], [5800, 'rire'], [7300, 'content']], mood: 'ecoute',
  say: [[1100, 2900, L('Rien à l’horizon…', 'Capitaine Pixel, au rapport.', 'Je surveille le salon.')], [3100, 4800, L('Un pigeon !', 'Oh, une poussière !', 'Là-bas, un chat !')],
    [5300, 6800, L('Je te vois !', 'Toi, là ! Je te vois !', 'Coucou, gros œil !')], [7000, 8600, L('T’as vu ta tête ?', 'Mission accomplie.', 'Hihi !')]],
  move: e => { const sc = io(e, 1000, 1500, 4600, 5000), z = io(e, 5200, 5600, 6600, 7100);
    return { x: 70 * Math.sin((e - 1000) / 700) * sc, r: 0.08 * Math.sin((e - 1000) / 700) * sc + 0.03 * Math.sin(e / 90) * io(e, 6000, 6100, 6900, 7100), s: 1 + 0.38 * z, y: 30 * z }; },
  props: (D, e) => D.vieBinoc(lin(e, 300, 900, 7600, 8200)) });

const MAGIC = { lapin: 'Un lapin !', colombe: 'Une colombe !', rien: 'Euh… y a rien.' };
const MAGIC_OK = [[0, 'reflechit'], [1800, 'parle'], [3600, 'etoiles'], [5600, 'fier'], [7600, 'content']], MAGIC_KO = [[0, 'reflechit'], [1800, 'parle'], [3600, 'confus'], [5600, 'timide'], [7600, 'content']];
S('vie-magie', 'Le tour de magie', 'vie', { dur: 9400, w: 2, anim: MAGIC_OK, mood: 'fier',
  init(o) { o.trick = pick(['lapin', 'lapin', 'colombe', 'rien']); this.anim = o.trick === 'rien' ? MAGIC_KO : MAGIC_OK; },   // persona.js calls sc.init(o): this is the scene
  say: [[300, 1900, L('Mesdames, messieurs…', 'Un tour de magie !', 'Rien dans les manches…')], [2000, 3500, L('Abracadabra !', 'Hocus pocus !', 'Pixelus magicus !')],
    [3700, 5400, o => MAGIC[o.trick] || 'Tadaa !'],
    [5600, 9000, V(o => (o.trick === 'rien' ? pick(['Il était là, juré !', 'Il a dû s’échapper…', 'C’est un lapin invisible.']) : pick(['Merci, merci !', 'Applaudis, applaudis !', 'Je suis un magicien !'])))]],
  move: (e, p, o) => { const k = io(e, 0, 800, 8600, 9400), ok = o.trick !== 'rien';
    return mv({ x: -100 * k, r: -0.04 * (e > 2000 && e < 3500 ? Math.abs(Math.sin(Math.PI * (e - 2000) / 500)) : 0), y: hop(e, 3600, 4000, ok ? 18 : 0) + (ok ? 22 * bump(seg(e, 5600, 6600)) : hop(e, 5600, 6000, 10)), sy: ok ? 1 - 0.08 * bump(seg(e, 5600, 6600)) : 1 }); },
  props: (D, e, p, o) => D.vieMagic(e, o.trick) });

const ROBO = [[0, {}], [500, { x: -45 }], [900, { x: -45, r: -0.22 }], [1300, {}], [1700, { x: 45 }], [2100, { x: 45, r: 0.22 }], [2500, {}],
  [2900, { y: 12, sy: 0.84, sx: 1.1 }], [3200, { y: -16, sy: 1.12, sx: 0.92 }], [3500, { y: 12, sy: 0.84, sx: 1.1 }], [3800, {}],
  [6200, { r: 0.35, x: -20 }], [6500, { r: -0.35, x: 20 }], [6800, {}], [7000, { y: -12, r: 0.14, s: 1.1 }], [8200, {}]];
function robo(e) {                                     // the robot dance: snaps from one pose to the next in 110 ms
  let i = 0; while (i + 1 < ROBO.length && ROBO[i + 1][0] <= e) i++;
  const [t, b] = ROBO[i], a = i ? ROBO[i - 1][1] : {}, q = out(seg(e, t, t + 110)), m = { i, t };
  for (const k of ['x', 'y', 'r']) m[k] = lerp(a[k] || 0, b[k] || 0, q);
  for (const k of ['s', 'sx', 'sy']) m[k] = lerp(a[k] ?? 1, b[k] ?? 1, q);
  return m;
}
S('vie-robot', 'La danse du robot', 'vie', { dur: 9000, w: 2, anim: [[0, 'idle-respire'], [4000, 'danse'], [6200, 'idle-respire'], [7000, 'fier'], [8300, 'content']], mood: 'fier',
  say: [[200, 1800, L('Bip. Boup.', 'Mode danse : activé.', 'Danse… du… ro-bot.')], [4100, 5900, L('Le moonwalk !', 'Bip bip boup !', 'Je glisse, je glisse…')], [7100, 8800, L('Pose finale.', 'Bip. Merci.', '100 % de style.')]],
  move: e => { const m = robo(e), mw = io(e, 4000, 4100, 5800, 6000);
    return { x: m.x - 110 * sm(seg(e, 4000, 5600)) * fin(e, 5800, 6000), y: m.y - 6 * Math.abs(Math.sin(e / 150)) * mw, r: m.r, s: m.s, sx: m.sx, sy: m.sy }; },
  props: (D, e) => { const m = robo(e); if (m.i > 0 && m.i < ROBO.length - 1 && e - m.t < 300) { const p = D.P(m.i % 2 ? 6 : 90, 12), o = onScr(p.x, p.y, 40); D.glyph(m.i % 2 ? 'BIP' : 'BOUP', o.x, o.y, 4.5 * D.U * pop(seg(e, m.t, m.t + 140)), m.i % 2 ? D.col.acc : D.col.hi); } } });

const BEAT = 'B-T-B-BT-B-T-BBT-W-W-B-T-BBTB', BT0 = 700, BTS = 210;
const beatAt = e => { const i = Math.floor((e - BT0) / BTS); return i >= 0 && i < BEAT.length ? { ch: BEAT[i], t: e - BT0 - i * BTS } : null; };
S('vie-beatbox', 'Le beatbox', 'vie', { dur: 8200, w: 2, anim: [[0, 'parle'], [6600, 'fier'], [7600, 'content']], mood: 'excite',
  say: [[100, 700, L('Attention…', 'Un, deux…', 'Écoute ça !')], [6700, 8000, L('Merci, Paris !', 'Yo !', 'Pixel MC !', 'Le roi du beatbox !')]],
  move: e => { const b = beatAt(e), end = hop(e, 6600, 7000, 16); if (!b) return { y: end }; const d = Math.exp(-b.t / 110);
    if (b.ch === 'B') return { sy: 1 - 0.16 * d, sx: 1 + 0.1 * d, y: 8 * d };
    if (b.ch === 'T') return { sy: 1 + 0.1 * d, sx: 1 - 0.06 * d, y: -6 * d };
    if (b.ch === 'W') return { r: 0.1 * Math.sin(b.t / 30) * bump(b.t / BTS) };
    return {}; },
  props: (D, e) => { const b = beatAt(e); if (!b || b.ch === '-') return; const d = Math.exp(-b.t / 140), U = D.U, c = D.col;
    if (b.ch === 'B') { const p = D.P(10, 20); D.glyph('BOUM', Math.max(p.x, 60), p.y, (5 + 1.5 * d) * U, c.acc); }
    else if (b.ch === 'T') { const p = D.P(86, 20); D.glyph('TCHAK', Math.min(p.x, W - 70), p.y, (4.5 + 1.5 * d) * U, c.hi); }
    else { const p = D.P(48, 50); D.glyph('WIKI-WIKI', p.x, Math.min(p.y, HT - 70), 4 * U, c.pink); } } });

S('vie-siffler', 'Il essaie de siffler', 'vie', { dur: 8200, w: 1, anim: [[0, 'content'], [1800, 'bisou'], [4900, 'etoiles'], [6200, 'bisou'], [6500, 'timide'], [7400, 'content']], mood: 'content',
  say: [[200, 1700, L('Je vais siffler.', 'Regarde, je sais siffler !', 'Facile, siffler.')], [1900, 3300, L('Fffff…', 'Fuuuu…', 'Pfff…')], [3400, 4800, L('Hmmmmf !', 'Pfffiii…', 'Concentration…')],
    [5000, 6100, L('Tu as entendu ?!', 'J’AI SIFFLÉ !', 'Une note !')], [6600, 8000, L('Oups, pardon.', 'Bon, je m’entraîne.', 'C’était presque.')]],
  move: e => { const inf = io(e, 3400, 3700, 4600, 4900);
    return mv({ sx: 1 + 0.07 * inf, sy: 1 - 0.05 * inf, x: 2 * Math.sin(e / 22) * inf, y: hop(e, 4900, 5500, 30) }, squash(e, 5500, 0.15), { x: -12 * bump(seg(e, 6200, 6700)) }); },
  props: (D, e) => { const U = D.U;
    if (e > 1800 && e < 3300) for (let i = 0; i < 3; i++) { const q = ((e - 1800) / 450 + i / 3) % 1, p = D.P(52 + 14 * q, 38 - 3 * q + i); box(D, p.x, p.y, U, U, D.col.hi); }
    if (e > 3400 && e < 4900) D.blush(io(e, 3400, 3700, 4600, 4900));
    if (e > 4900 && e < 6200) { const q = seg(e, 4900, 6200), p = D.P(58 + 22 * q, 38 - 12 * q); spr(D, 'vieNote', p.x, p.y, U * (0.6 + 0.6 * pop(seg(e, 4900, 5200)))); }
    if (e > 6200 && e < 6900) D.spray(seg(e, 6200, 6900)); } });

const SNZ = [1300, 3000, 4900];                      // the three sneezes
S('vie-atchoums', 'Les éternuements en série', 'vie', { dur: 9200, w: 1, anim: [[0, 'baille'], [1300, 'surpris'], [1700, 'baille'], [3000, 'surpris'], [3400, 'baille'], [4900, 'surpris'], [5800, 'confus'], [7000, 'timide']], mood: 'baille',
  say: [[200, 1200, L('Ah… ah…')], [1300, 1900, L('ATCHOUM !')], [2000, 2900, L('Et de un… ah…', 'Oh non… encore…')], [3000, 3500, L('ATCHOUM !')],
    [3600, 4800, L('Aaah… aaaah…', 'Le dernier… ah…')], [4900, 5700, L('ATCHAAAA !', 'ATCHOUMBA !')], [6900, 9000, L('À mes souhaits, trois fois.', 'Je suis enrhumé…', 'Un mouchoir ?', 'Pardon, pardon.')]],
  move: e => {
    const pre = [[300, 1300], [2000, 3000], [3600, 4900]].reduce((a, [s0, s1]) => a + sm(seg(e, s0, s1)) * (e < s1 ? 1 : 0), 0), back = fin(e, 5600, 6800);
    const x = (-40 * out(seg(e, 1300, 1500)) - 60 * out(seg(e, 3000, 3200)) - 70 * out(seg(e, 4900, 5200))) * back;
    return mv({ x, y: -10 * pre, r: -0.07 * pre + TAU * out(seg(e, 4900, 5600)), sy: 1 + 0.1 * pre }, ...SNZ.map(t => squash(e, t, 0.25))); },
  props: (D, e) => { for (const t of SNZ) if (e > t && e < t + 700) D.spray(seg(e, t, t + 700)); if (e > 5600 && e < 6800) D.dizzy(e, io(e, 5600, 5800, 6500, 6800)); } });

const clothAt = e => {                                 // where the cloth rubs, in his pixels
  const a = e / 70, path = e < 3600 ? [lerp(30, 66, sm(seg(e, 1600, 3600))), 20] : [lerp(66, 48, sm(seg(e, 3600, 5000))), lerp(20, 34, sm(seg(e, 3600, 5000)))];
  const k = fin(e, 5200, 5600) * sm(seg(e, 1200, 1600)), u = lerp(104, path[0], k), v = lerp(40, path[1], k);
  return [u + 4 * Math.cos(a) * k, v + 3 * Math.sin(a) * k];
};
S('vie-chiffon', 'Le chiffon', 'vie', { dur: 8400, w: 2, anim: [[0, 'idle-gratouille'], [1600, 'idle-cligne'], [5600, 'etoiles'], [6800, 'content']], mood: 'content',
  say: [[300, 1500, L('Une poussière…', 'Mon écran est sale.', 'Qui a mis ses doigts là ?')], [2000, 5200, L('Frotte, frotte…', 'Couic, couic…', 'Ça part pas, ce truc…')], [5700, 8200, L('Tout propre !', 'Ça brille !', 'Je te vois mieux, là !')]],
  secret: L('Hé ! Je viens de nettoyer !', 'Tes doigts ! Mes traces !', 'Pas touche, c’est propre !'),
  move: e => { const [u] = clothAt(e), k = io(e, 1600, 2000, 5000, 5600); return { x: -(u - 48) * 0.6 * k, r: 0.02 * Math.sin(e / 70) * k }; },
  props: (D, e) => {
    if (e > 1100 && e < 5700) { const [u, v] = clothAt(e), p = D.P(u, v); D.vieCloth(p.x, p.y, 0.25 * Math.sin(e / 140));
      if (e > 1700 && e < 5100 && (e % 520) < 260) { const g = onScr(p.x + 40, p.y - 40, 30); D.glyph('couic', g.x, g.y, 3.2 * D.U, D.col.hi); } }
    if (e > 5600 && e < 8000) for (const [i, [u, v]] of [[30, 14], [64, 12], [50, 32]].entries()) { const q = Math.abs(Math.sin((e - 5600) / 220 + i * 1.7)), p = D.P(u, v); D.star(p.x, p.y, (2.2 + 2 * q) * D.U * fin(e, 7400, 8000), i === 1 ? D.col.acc : D.col.hi, 0); } } });

function scanAt(e) {                                   // the rolling line: [y, direction]
  if (e >= 400 && e < 2000) return [56 + 370 * seg(e, 400, 2000), 1];
  if (e >= 2200 && e < 3800) return [56 + 370 * seg(e, 2200, 3800), 1];
  if (e >= 4200 && e < 5400) return [426 - 370 * seg(e, 4200, 5400), -1];
  if (e >= 6800 && e < 8400) return [56 + 370 * seg(e, 6800, 8400), 1];
  return null;
}
const RIDE0 = 4200 + 1200 * (68 / 370), RIDE1 = 4200 + 1200 * (178 / 370);   // the line under his chin (358 px), until he is 110 px up
S('vie-scanline', 'La ligne qui passe', 'vie', { dur: 9200, w: 2, anim: [[0, 'idle-regard'], [600, 'curieux'], [2200, 'idle-haut'], [3800, 'idee'], [4300, 'etoiles'], [RIDE1, 'surpris'], [5700, 'rire'], [7400, 'content']], mood: 'ecoute',
  say: [[500, 2000, L('Tiens, la ligne…', 'Elle repasse…', 'Qu’est-ce que c’est ?')], [2300, 3800, L('Elle revient tout le temps.', 'Je vais l’attraper.')], [4300, 5000, L('Je surfe !', 'Wouhou !')],
    [5700, 7200, L('Elle m’a lâché…', 'Quelle glissade !')], [7400, 9000, L('Demain, je la dompte.', 'C’est ma ligne à moi.', 'Le balayage, quel sport !')]],
  move: e => { const s = scanAt(e), fol = s && s[1] > 0 ? (s[0] - 240) * 0.12 : 0;
    let y = fol;
    if (e >= 3900 && e < RIDE0) y = 8 * bump(seg(e, 3900, RIDE0));
    else if (e >= RIDE0 && e < RIDE1) y = 426 - 370 * seg(e, 4200, 5400) - 358;
    else if (e >= RIDE1 && e < RIDE1 + 500) y = -110 * (1 - inn(seg(e, RIDE1, RIDE1 + 500)));
    return mv({ y, r: 0.1 * Math.sin(e / 120) * io(e, RIDE0, RIDE0 + 60, RIDE1 - 60, RIDE1) }, squash(e, RIDE1 + 500, 0.25)); },
  props: (D, e) => { const s = scanAt(e); if (s) D.vieScan(s[0], s[1]); } });

const ropePh = e => (e < 500 ? 0 : e < 3600 ? (e - 500) / 720 : e < 6000 ? 3100 / 720 + (e - 3600) * ((8.5 - 3100 / 720) / 2400) : 8.5);
S('vie-corde', 'La corde à sauter', 'vie', { dur: 8600, w: 2, anim: [[0, 'content'], [600, 'fier'], [6000, 'surpris'], [6600, 'rire']], mood: 'excite',
  say: [[200, 1400, L('Corde à sauter !', 'Allez, on saute !')], [3000, 5600, L('Plus vite !', 'Je suis trop fort !', 'Et hop, et hop !')], [6000, 6700, L('Aïe !', 'Oups !')], [6800, 8400, L('Je me suis emmêlé…', 'Ma corde m’a trahi.', 'Bon, une pause.')]],
  move: e => { const th = TAU * ropePh(e), j = e > 500 && e < 6000 ? Math.max(0, -Math.cos(th)) ** 4 * fin(e, 5650, 5800) : 0, trip = io(e, 6000, 6200, 6800, 7300);
    return mv({ y: -40 * j + 18 * trip, r: 0.25 * trip }, { sy: 1 - 0.06 * (j > 0 && j < 0.2 ? 1 - j * 5 : 0) }); },
  props: (D, e) => { const ph = ropePh(e), th = TAU * ph, q = lin(e, 0, 400, 7600, 8200);
    if (e < 6000) D.vieRope(29 - 25 * Math.cos(th), Math.cos(th) < 0, q); else D.vieRope(46 + 2 * Math.sin(e / 60) * fin(e, 6000, 7000), true, q);
    const n = Math.floor(ph + 0.5); if (n >= 1 && e > 1000 && e < 6000) { const p = onScr(D.P(90, 10).x, D.P(90, 10).y, 30); D.glyph(String(n), p.x, p.y, 5 * D.U, D.col.acc); } } });

S('vie-yoga', 'Le yoga', 'vie', { dur: 10800, w: 1, anim: [[0, 'zen'], [2000, 'fier'], [3800, 'zen'], [6400, 'surpris'], [7000, 'fier'], [8400, 'zen'], [9600, 'content']], mood: 'content',
  say: [[300, 1800, L('Séance de yoga !', 'On inspire…')], [1900, 3600, L('L’arbre…', 'Je suis un arbre.')], [4200, 6000, L('La demi-lune…', 'Le flamant rose…')],
    [6900, 8200, L('La chandelle !', 'Tête en bas !')], [9300, 10600, L('Namasté.', 'Je suis tout souple.')]],
  move: e => { const tree = io(e, 300, 1300, 3400, 3800), half = io(e, 3800, 4400, 6000, 6400), cand = io(e, 6400, 7000, 8200, 8800);
    const r = 0.55 * sm(seg(e, 3800, 4400)) + (Math.PI - 0.55) * sm(seg(e, 6400, 7000)) + Math.PI * sm(seg(e, 8400, 9200));
    return { sy: 1 + 0.2 * tree, sx: 1 - 0.15 * tree, y: -26 * tree - 30 * cand, x: 40 * half, r: r + 0.03 * Math.sin(e / 150) * (tree + half + cand) }; } });

const KICK = [1500, 2300, 3100, 3900, 4700, 5500];
function ballAt(D, e) {                                // the ball on the screen: rolls in, bounces on his head, flies off and comes back on his face
  const R = 3.5 * G, rest = FLOOR - R, head = () => { const p = D.P(48, 12); return { x: p.x, y: p.y - R }; };
  if (e < KICK[0]) { const x = lerp(-40, 400, out(seg(e, 300, KICK[0]))); return { x, y: rest, a: x / R }; }
  for (let j = 0; j < 5; j++) if (e < KICK[j + 1]) { const s0 = j ? head() : { x: 400, y: rest }, s1 = head(), q = seg(e, KICK[j], KICK[j + 1]);
    return { x: lerp(s0.x, s1.x, q) + (j % 2 ? 1 : -1) * 18 * bump(q), y: lerp(s0.y, s1.y, q) - (j ? 200 : 480) * q * (1 - q), a: e / 120 }; }
  if (e < 6100) { const h = head(), q = out(seg(e, 5500, 6100)); return { x: h.x + 30 * q, y: lerp(h.y, -40, q), a: e / 100 }; }
  const f = D.P(48, 27);
  if (e < 6450) { const q = inn(seg(e, 6100, 6450)); return { x: lerp(f.x + 30, f.x, q), y: lerp(-40, f.y, q), a: e / 100 }; }
  const q = seg(e, 6450, 7700), k = Math.min(1, q / 0.6);
  return { x: lerp(f.x, 880, q), y: q < 0.6 ? lerp(f.y, rest, k) - 140 * k * (1 - k) : rest - 40 * bump((q - 0.6) / 0.4), a: e / 80 };
}
S('vie-ballon', 'Le ballon', 'vie', { dur: 8800, w: 2, anim: [[0, 'curieux'], [1400, 'fier'], [6450, 'surpris'], [7000, 'rire']], mood: 'excite',
  say: [[300, 1400, L('Oh, un ballon !', 'Une petite partie ?')], [1600, 5400, L('Jongle, jongle…', 'Regarde, de la tête !', 'Le roi du ballon !')], [6450, 7100, L('Bonk !', 'Aïe, le nez !')],
    [7200, 8600, L('Et… but !', 'C’est pour toi, la passe !', 'Je suis pas footballeur.')]],
  move: e => mv({ y: KICK.slice(1).reduce((a, t) => a + hop(e, t - 150, t + 150, 16), 0), x: 5 * Math.sin(e / 25) * io(e, 6450, 6500, 6900, 7100) }, squash(e, 6450, 0.3)),
  props: (D, e) => { if (e > 7700) return; const b = ballAt(D, e); spr(D, 'vieBall', b.x, b.y, G, b.a);
    const j = KICK.slice(1, 5).findIndex(t => e > t && e < t + 450); if (j >= 0) { const p = onScr(b.x + 60, b.y - 30, 24); D.glyph(String(j + 1), p.x, p.y, 5 * D.U, D.col.acc); } } });

const lemn = th => { const s = Math.sin(th), c = Math.cos(th), d = 1 + s * s; return { x: 400 + 300 * c / d, y: 215 + 300 * s * c / d }; };
const PLANE_OK = [[0, 'idee'], [1600, 'reflechit'], [2200, 'content'], [5400, 'surpris'], [6200, 'fier'], [7400, 'rire']], PLANE_KO = [[0, 'idee'], [1600, 'reflechit'], [2200, 'content'], [5400, 'surpris'], [6400, 'confus'], [7200, 'rire']];
function planeAt(D, e, o) {
  const hand = D.P(84, 32), tgt = o.catch ? D.P(48, 36) : D.P(34, 23);
  if (e < 2200) return { x: hand.x, y: hand.y, a: -0.3 };
  if (e < 6200) { const q = seg(e, 2200, 6200), th = 2.5 * Math.PI * q, p = lemn(th), p2 = lemn(th + 0.02), k0 = sm(seg(e, 2200, 2500)), k1 = sm(seg(e, 5700, 6200));
    return { x: lerp(lerp(hand.x, p.x, k0), tgt.x, k1), y: lerp(lerp(hand.y, p.y, k0), tgt.y, k1), a: Math.atan2(p2.y - p.y, p2.x - p.x) }; }
  if (o.catch) return { x: tgt.x, y: tgt.y, a: 0.45 };
  const q = seg(e, 6200, 7400); return { x: tgt.x - 30 * q, y: lerp(tgt.y, FLOOR - 10, inn(q)), a: 0.5 + 3 * q };
}
S('vie-avion', 'L’avion en papier', 'vie', { dur: 9000, w: 2, anim: PLANE_OK, mood: 'content',
  init(o) { o.catch = rnd() < 0.5; this.anim = o.catch ? PLANE_OK : PLANE_KO; },
  say: [[300, 1500, L('Un avion en papier !', 'Pliage express…')], [2300, 4800, L('Vole, petit avion !', 'Wouuuuh !', 'Il fait des loopings !')], [5400, 6200, L('Il revient ?!', 'Euh… il revient…')],
    [6300, 8800, V(o => (o.catch ? pick(['Attrapé !', 'Pilote expert !', 'Retour à la base !']) : pick(['Pile dans l’œil !', 'Aïe ! Atterrissage raté.', 'Il m’a visé !'])))]],
  move: (e, p, o) => { const back = io(e, 1600, 1900, 2150, 2250), q = seg(e, 2200, 6200), watch = io(e, 2500, 2900, 5300, 5700), lx = lemn(2.5 * Math.PI * q).x;
    return mv({ r: -0.15 * back + 0.1 * bump(seg(e, 2200, 2500)) + (lx - 400) * 0.0002 * watch, x: -20 * back + (lx - 400) * 0.08 * watch, y: o.catch ? hop(e, 6200, 6700, 22) : 0 }, o.catch ? null : squash(e, 6200, 0.25)); },
  props: (D, e, p, o) => { const s = pop(lin(e, 300, 700, o.catch ? 8000 : 7600, o.catch ? 8400 : 7900)); if (s <= 0) return; const b = planeAt(D, e, o); D.viePlane(b.x, b.y, b.a, s); } });

S('vie-carton', 'Cache-cache dans le carton', 'vie', { dur: 9400, w: 2, anim: [[0, 'curieux'], [1400, 'rire'], [3800, 'idle-regard'], [5000, 'timide'], [6000, 'rire'], [7600, 'content']], mood: 'content',
  say: [[300, 1300, L('Oh, un carton !', 'Un carton vide…')], [2600, 3700, L('Tu me vois pas, hein ?', 'Je suis bien caché…', 'Cherche-moi !')], [4100, 4900, L('Chuuut…', 'Hihi…', 'Je suis pas là.')],
    [6000, 7400, L('Coucou !', 'Bouh ! Trouvé !', 'Tu m’avais pas vu, hein ?')], [7500, 9100, L('Le carton, c’est la vie.', 'Je suis un chat, en fait.')]],
  secret: L('Chut ! Je suis caché !', 'Tu m’as trouvé ?!', 'Pas de triche !'),
  move: e => {
    let y = 0, x = 0;
    if (e >= 1400 && e < 2250) y = -40 * bump(seg(e, 1400, 2000)) + 125 * inn(seg(e, 1750, 2250));
    else if (e >= 2250 && e < 6000) { y = 125 - 27 * io(e, 3800, 4100, 4700, 5000); x = 2 * Math.sin(e / 30) * io(e, 2600, 2700, 3500, 3600) + 30 * Math.sin((e - 3800) / 250) * io(e, 3800, 4100, 4700, 5000); }
    else if (e >= 6000) y = lerp(125, 0, out(seg(e, 6000, 6400))) - 60 * bump(seg(e, 6000, 6700));
    return mv({ x, y }, squash(e, 6700, 0.2)); },
  props: (D, e) => D.vieCarton(lin(e, 300, 1100, 7600, 8600), 0.5 * bump(seg(e, 6000, 6800)) + 0.1 * Math.sin(e / 40) * io(e, 2600, 2700, 3500, 3600)) });

const SHOTS = [2000, 3600, 5200];
S('vie-selfie', 'Le selfie', 'vie', { dur: 8600, w: 2, anim: [[0, 'content'], [1500, 'bisou'], [2900, 'clin-oeil'], [4500, 'fier'], [6200, 'idle-bas'], [7000, 'rire']], mood: 'fier',
  init: o => { o.bad = rnd() < 0.35; },
  say: [[300, 1400, L('Petit selfie !', 'Souris !', 'Photo !')], [1500, 2000, L('Ouistiti !', 'Cheese !')], [6300, 8400, V(o => (o.bad ? pick(['J’ai les yeux fermés…', 'Raté, on recommence ?']) : pick(['Trop beau !', 'Je la poste !', 'Mon meilleur profil.'])))]],
  move: e => { const p1 = io(e, 1700, 1900, 2200, 2400), p2 = io(e, 3300, 3500, 3800, 4000), p3 = io(e, 4900, 5100, 5400, 5600);
    return { r: 0.12 * p1 - 0.14 * p2 + 0.06 * p3, s: 1 + 0.04 * (p1 + p3), x: 20 * p1 + 30 * p2, y: -10 * p3 + hop(e, 7000, 7400, 14) }; },
  props: (D, e, p, o) => {
    const q = lin(e, 200, 700, 7900, 8500); if (q <= 0) return;
    const base = D.P(78, 48), up = D.P(88, 10), dn = D.P(48, 44), k = sm(seg(e, 6200, 6700)), x = lerp(up.x, dn.x, k), y = lerp(up.y + (1 - pop(q)) * 120, dn.y, k), flash = SHOTS.some(t => e > t && e < t + 140);
    if (k < 1) line(D, [[base.x, base.y], [lerp(x, base.x, 0.15), lerp(y, base.y, 0.15) + 6 * D.U]], D.U, D.col.dim);
    D.viePhone(x, y, lerp(0.3, 0, k) + tilt(D), e > 6450, flash, !o.bad);
    if (flash) { const c = D.col.hi; box(D, 0, 54, W, G, c); box(D, 0, HT - 48 - G, W, G, c); box(D, 0, 54, G, HT - 102, c); box(D, W - G, 54, G, HT - 102, c); }
    const shot = SHOTS.find(t => e > t && e < t + 500); if (shot) { const g = onScr(x - 70, y + 10, 40); D.glyph('CLIC !', g.x, g.y, 4 * D.U, D.col.acc); } } });

const GUM = [[30, 20, 3], [64, 18, 3.5], [48, 33, 4], [22, 32, 2.5], [74, 32, 2.5], [40, 12, 2], [58, 44, 2.5]];
S('vie-chewing-gum', 'Le chewing-gum', 'vie', { dur: 7600, w: 2, anim: [[0, 'parle'], [2000, 'bisou'], [4800, 'surpris'], [5400, 'confus'], [6600, 'rire']], mood: 'content',
  say: [[300, 2000, L('Mâche, mâche…', 'Chewing-gum fraise !', 'Miam, du chewing-gum.')], [2300, 4400, L('Regarde ma bulle !', 'Plus grosse…', 'Encore plus grosse…')], [4800, 5400, L('POP !')], [5600, 7400, L('Ça colle !', 'J’en ai partout…', 'Hihi, raté !')]],
  move: e => mv({ sy: 1 - 0.04 * Math.abs(Math.sin(e / 100)) * io(e, 200, 400, 1800, 2000), x: 7 * Math.sin(e / 35) * io(e, 5400, 5500, 6400, 6600) }, squash(e, 4800, 0.18)),
  props: (D, e) => { const U = D.U, c = D.col;
    if (e > 2100 && e < 4800) { const p = D.P(48, 39), r = (0.8 + 12 * inn(seg(e, 2200, 4800))) * U * (1 + 0.03 * Math.sin(e / 60)); disc(D, p.x, p.y, r, c.pink); box(D, p.x - 0.55 * r, p.y - 0.6 * r, 1.4 * U, 1.4 * U, c.hi); }
    if (e >= 4800 && e < 7000) GUM.forEach(([u, v, r], i) => { const k = fin(e, 5400 + i * 150, 6400 + i * 100) * pop(seg(e, 4800, 4950)), p = D.P(u, v + 6 * seg(e, 5400 + i * 150, 6400 + i * 100)); disc(D, p.x, p.y, r * U * k, c.pink); }); } });

const penAng = e => (0.08 + 0.3 * seg(e, 1000, 6000)) * Math.sin(e / 380) + 0.05 * Math.sin(e / 170);
S('vie-equilibre', 'L’équilibriste', 'vie', { dur: 8800, w: 1, side: true, anim: [[0, 'curieux'], [800, 'reflechit'], [3600, 'panique'], [6400, 'surpris'], [7100, 'timide']], mood: 'reflechit',
  say: [[300, 1800, L('Regarde, en équilibre !', 'Un crayon sur la tête…')], [2200, 3400, L('Facile…', 'Concentration…')], [3700, 6200, L('Oh… oh…', 'Il penche…', 'Non, par là !')],
    [6500, 7200, L('Oups…')], [7300, 8600, L('Je recommence demain.', 'C’est le crayon, pas moi.')]],
  move: e => { const k = io(e, 0, 800, 6400, 7200), a = penAng(Math.min(e, 6400)); return { y: 40 * k, x: 140 * a * k, r: -0.4 * a * k }; },
  props: (D, e) => { const U = D.U, head = D.P(48, 12), t0 = penAng(6400), sg = Math.sign(t0) || 1;
    if (e < 300 || e > 8400) return;
    if (e < 6400) D.viePencil(head.x, head.y, penAng(e) + tilt(D), U * pop(seg(e, 300, 700)));
    else if (e < 6800) D.viePencil(head.x, head.y, lerp(t0, sg * 1.55, inn(seg(e, 6400, 6800))), U);
    else { const q = seg(e, 6800, 7300), x = head.x + sg * 70 * q, y = lerp(head.y, FLOOR - 1.4 * G, inn(q)); D.viePencil(x, y, sg * 1.57, U); if (e > 7300 && e < 8000) { const g = onScr(x + sg * 50, y - 40, 40); D.glyph('CLONG !', g.x, g.y, 4.5 * U, D.col.acc); } } } });

function lostPix(D, e) {                               // the lost pixel: on the screen, fleeing, coming back, on his cheek, home in his eye
  const cheek = D.P(76, 33), eye = D.P(66, 23);
  if (e < 3300) return { x: 620, y: 150, on: e > 300 && (e > 1800 || Math.floor(e / 250) % 2 === 0) };
  if (e < 4300) { const q = seg(e, 3300, 4300); return { x: lerp(620, 190, q), y: lerp(150, 330, q) - 50 * Math.abs(Math.sin(3 * Math.PI * q)), on: true }; }
  if (e < 5200) { const q = seg(e, 4300, 5200); return { x: lerp(190, cheek.x, q), y: lerp(330, cheek.y, q) - 40 * Math.abs(Math.sin(2 * Math.PI * q)), on: true }; }
  if (e < 7800) return { x: cheek.x, y: cheek.y - 1.5 * D.U * Math.abs(Math.sin(Math.PI * (e - 5200) / 600)), on: true };
  if (e < 8400) { const q = sm(seg(e, 7800, 8400)); return { x: lerp(cheek.x, eye.x, q), y: lerp(cheek.y, eye.y, q), on: true }; }
  return { x: eye.x, y: eye.y, on: false };
}
S('vie-pixel-perdu', 'Le pixel perdu', 'vie', { dur: 9800, w: 2, anim: [[0, 'idle-regard'], [1200, 'curieux'], [3000, 'bisou'], [3600, 'surpris'], [4300, 'curieux'], [5300, 'amoureux'], [8400, 'etoiles'], [9200, 'content']], mood: 'ecoute',
  say: [[600, 2000, L('Tiens… un pixel ?', 'Un pixel perdu !')], [2100, 3000, L('Il est tout seul…', 'Coucou, toi !')], [3100, 3700, L('Fffff…')], [3800, 5000, L('Reviens !', 'N’aie pas peur !')],
    [5400, 7600, L('Tu veux rester avec moi ?', 'Je t’adopte !', 'Mon pixel de compagnie !')], [8400, 9600, L('Il est rentré à la maison.', 'Bienvenue chez toi !')]],
  secret: L('Chut, tu vas lui faire peur !', 'Il est tout petit, doucement !'),
  move: e => { const near = io(e, 1800, 2400, 3400, 3800), fol = io(e, 4300, 4500, 5000, 5200), lx = lerp(190, 620, seg(e, 4300, 5200));
    return mv({ x: 60 * near + (lx - 400) * 0.1 * fol, y: -10 * near + hop(e, 8400, 8900, 20), r: 0.08 * near, s: 1 + 0.03 * Math.sin(e / 200) * io(e, 5300, 5600, 7600, 7800) }, { sx: 1 - 0.05 * bump(seg(e, 3000, 3600)) }); },
  props: (D, e) => { const b = lostPix(D, e); if (b.on) box(D, b.x - G, b.y - G, 2 * G, 2 * G, D.col.hi);
    if (e > 8400 && e < 9400) { const p = D.P(66, 23); D.star(p.x, p.y, 3 * D.U * bump(seg(e, 8400, 9400)), D.col.acc, e / 200); }
    if (e > 5300 && e < 7800) D.hearts(e - 5300, 0.6); } });

/* ---------- props for the hours, the night and the weather ---------- */
sprite('vieBoltS', ['.aa', 'aa.', 'aaa', '.aa', 'aa.']);
// the morning mug at his right, lifted to his mouth (lift 0..1), steaming
prop('vieMug', (D, e, q, lift) => {
  if (q <= 0) return; const U = D.U, a = D.P(80, 46), b = D.P(60, 41), x = lerp(a.x, b.x, lift), y = lerp(a.y, b.y, lift) + (1 - pop(q)) * 80;
  spr(D, 'vieMug', x, y, U, -0.5 * lift);
  if (lift < 0.2) for (let i = 0; i < 3; i++) { const k = ((e / 900) + i / 3) % 1; if (k < 0.8) box(D, x + (-2.5 + i * 1.5) * U + Math.sin(k * 6 + i) * U, y - (4.5 + k * 7) * U, U, U, D.col.hi); }
  if (lift > 0.8) { const g = onScr(x + 50, y - 40, 30); D.glyph('slurp', g.x, g.y, 3.4 * U, D.col.hi); }
});
// a battery at the top right of the screen: level 0..5, plug: charging
prop('vieBattery', (D, e, q, level, plug) => {
  if (q <= 0) return; const c = D.col, u = G, x = 658, y = 92 - (1 - out(q)) * 60, n = Math.ceil(clamp(level, 0, 5) - 0.001), col = n >= 3 ? c.hi : n === 2 ? c.acc : c.pink;
  box(D, x, y, 13 * u, u, c.fg); box(D, x, y + 4 * u, 13 * u, u, c.fg); box(D, x, y, u, 5 * u, c.fg); box(D, x + 12 * u, y, u, 5 * u, c.fg); box(D, x + 13 * u, y + 1.5 * u, u, 2 * u, c.fg);
  if (n > 1 || plug || (e % 600) < 380) for (let i = 0; i < n; i++) box(D, x + (2 + 2 * i) * u, y + 1.5 * u, u, 2 * u, col);
  if (plug) spr(D, 'vieBoltS', x - 2.5 * u, y + 2.5 * u, u);
});
// the 4 pm cookie near his mouth, bitten (k bites), crumbs falling after each bite
const BITES = [2000, 2700, 3400, 4100, 4800];
prop('vieCookie', (D, e, q) => {
  if (q <= 0) return; const U = D.U, k = BITES.filter(t => e >= t).length, chew = BITES.reduce((a, t) => a + bump(seg(e, t - 150, t + 100)), 0);
  const a = D.P(63, 41), b = D.P(57, 39), x = lerp(a.x, b.x, chew), y = lerp(a.y, b.y, chew) + (1 - pop(q)) * 70;
  if (e < 5500) spr(D, 'vieCookie' + k, x, y, U);
  for (const t of BITES) { const qq = (e - t) / 900; if (qq < 0 || qq > 1) continue; for (let i = 0; i < 4; i++) { const p = D.P(54 + (i - 1.5) * (2.2 + 1.2 * qq), 41 + 40 * qq * qq); box(D, p.x, p.y, U, U, D.col.acc); } }
});
// the evening cup of herbal tea, held under his chin, steaming slowly
prop('vieTea', (D, e, q, sip) => {
  if (q <= 0) return; const U = D.U, p = D.P(48, 46), y = p.y + (1 - pop(q)) * 80 - sip * 3 * U;
  spr(D, 'vieCup', p.x, y, U, -0.25 * sip);
  if (sip < 0.3) for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) { const k = ((e / 1400) + j / 3) % 1; if (k < 0.85) box(D, p.x + (-2 + i * 3) * U + Math.sin(k * 5 + i * 2) * 1.2 * U, y - (5 + k * 9) * U, U, U, D.col.hi); }
});
// a plaid blanket over the bottom of the screen, pink and orange checks
prop('viePlaid', (D, q) => {
  if (q <= 0) return; const c = D.col, top = 378 + (1 - out(q)) * 70, x0 = 120, n = 20;
  box(D, x0, top, n * 4 * G, FLOOR + 7 - top, c.pink);
  for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2 === 0) box(D, x0 + i * 4 * G, top + G + j * 4 * G, 4 * G, 4 * G, c.acc);
  box(D, x0, top, n * 4 * G, G, c.hi);
});
// the night sky: n stars appearing one after another from t0, every gap ms, twinkling; the newest one counted
const SKY = [[90, 92], [210, 72], [330, 112], [480, 78], [610, 98], [720, 72], [150, 170], [690, 176], [60, 250], [750, 262], [270, 150], [540, 142], [420, 66], [110, 330]];
prop('vieSky', (D, e, n, t0, gap, count) => {
  const c = D.col;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * gap; if (e < t) break; const [x, y] = SKY[i % SKY.length], tw = Math.sin(e / 300 + i * 1.3) > 0.1;
    box(D, x - G / 2, y - G / 2, G, G, c.hi);
    if (tw && e - t > 150) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) box(D, x - G / 2 + dx * G, y - G / 2 + dy * G, G, G, i % 3 ? c.acc : c.hi);
    if (count && e - t < 450) D.glyph(String(i + 1), x, y + 3 * G, 30, c.fg);
  }
});
// the fence at the right of the floor and the sheep jumping over it, counted
const SHEEP_T = i => 500 + i * 1800;
prop('vieSheep', (D, e, q) => {
  if (q <= 0) return; const c = D.col;
  spr(D, 'vieFence', 588, FLOOR - 3 * G + (1 - out(q)) * 60, G);
  for (let i = 0; i < 5; i++) {
    const t = e - SHEEP_T(i); if (t < 0) break; const x = 860 - 0.28 * t; if (x < -60) continue;
    const hq = clamp((676 - x) / 176, 0, 1), y = FLOOR - 3 * G - 56 * bump(hq), walk = hq === 0 || hq === 1;
    spr(D, walk && Math.floor(t / 160) % 2 ? 'vieSheep1' : 'vieSheep0', x, y, G);
    if (hq > 0.35 && hq < 0.75) D.glyph(String(i + 1), 588, FLOOR - 11 * G, 34, c.hi);
  }
});
// the telescope on its tripod at the right, pointing at the sky (dy: sliding in from below)
prop('vieTelescope', (D, q) => {
  if (q <= 0) return; const c = D.col, g = D.g, dy = (1 - out(q)) * 320, E = { x: 612, y: 214 + dy }, O = { x: 742, y: 104 + dy }, M = { x: lerp(E.x, O.x, 0.42), y: lerp(E.y, O.y, 0.42) };
  for (const fx of [628, 708, 668]) line(D, [[M.x, M.y], [fx, FLOOR + dy]], G, fx === 668 ? c.dim : c.fg);
  const a = Math.atan2(O.y - E.y, O.x - E.x), len = Math.hypot(O.x - E.x, O.y - E.y);
  g.save(); g.translate(E.x, E.y); g.rotate(a);
  g.fillStyle = c.dim; g.fillRect(0, -1.6 * G, len, 3.2 * G); g.fillStyle = c.fg; g.fillRect(-1.2 * G, -1 * G, 1.6 * G, 2 * G); g.fillRect(len * 0.42 - G, -2 * G, 2 * G, 4 * G);
  g.fillStyle = c.hi; g.fillRect(len - G, -2.2 * G, 1.6 * G, 4.4 * G); g.restore();
});
// a shooting star crossing the top left of the sky (q 0..1)
prop('vieComet', (D, q) => {
  if (q <= 0 || q >= 1) return; const c = D.col, x = lerp(90, 470, q), y = lerp(80, 150, q), dx = (470 - 90) / 27, dy = (150 - 80) / 27;
  box(D, x - G, y - G, 2 * G, 2 * G, c.hi);
  for (let i = 1; i <= 5; i++) box(D, x - i * dx - G / 2, y - i * dy - G / 2, G, G, i < 3 ? c.hi : i < 5 ? c.acc : c.dim);
});
// the dream bubble: a tiny Pixel with a pink cape flying among clouds
prop('vieDream', (D, e, q) => {
  if (q <= 0) return; const c = D.col, g = D.g, U = D.U, p0 = D.P(80, 4), o = { x: Math.min(p0.x, W - 14 - 15 * G), y: Math.max(p0.y, 58 + 10 * G) };
  for (const [u, v, r] of [[70, 12, 1.1], [75, 7, 1.7]]) { const p = D.P(u, v); disc(D, p.x, p.y, (r + 0.7) * U, c.fg); disc(D, p.x, p.y, r * U, c.bg); }
  g.fillStyle = c.fg; g.beginPath(); g.ellipse(o.x, o.y, 15 * G * pop(q), 10 * G * pop(q), 0, 0, TAU); g.fill();
  g.fillStyle = c.bg; g.beginPath(); g.ellipse(o.x, o.y, 14 * G * pop(q), 9 * G * pop(q), 0, 0, TAU); g.fill();
  if (q < 1) return;
  for (let i = 0; i < 2; i++) { const cx = o.x + 11 * G - ((e / 22 + i * 110) % (22 * G)), cy = o.y + (i ? 4 : -4) * G; box(D, cx, cy, 4 * G, G, c.hi); box(D, cx + G, cy - G, 2 * G, G, c.hi); }
  const bob = Math.round(Math.sin(e / 300) * 1.4) * G, mx = o.x - 2 * G, my = o.y + bob, fl = Math.floor(e / 180) % 2;
  box(D, mx - 5 * G, my - (fl ? G : 0), 3 * G, G, c.pink); box(D, mx - 4 * G, my + (fl ? 0 : G), 2 * G, G, c.pink);
  box(D, mx - 2 * G, my - 2 * G, G, 2 * G, c.fg); box(D, mx + G, my - 2 * G, G, 2 * G, c.fg); box(D, mx - G, my + G, 2 * G, G, c.fg);
});
// a firefly, blinking
prop('vieFirefly', (D, x, y, e) => {
  const c = D.col;
  if ((e % 1100) < 700) { box(D, x - G / 2, y - G / 2, G, G, c.hi); for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) box(D, x - G / 2 + dx * G, y - G / 2 + dy * G, G, G, c.acc); }
  else box(D, x - G / 2, y - G / 2, G, G, c.dim);
});
// rain falling all over the screen (q: how much)
prop('vieRain', (D, e, q, n = 18) => {
  if (q <= 0) return; const c = D.col;
  for (let i = 0; i < Math.round(n * q); i++) { const x = (i * 97 + 31) % 780 + 10, y = 56 + ((e * 0.45 + i * 113) % 366); box(D, x, y, G / 2, 2 * G, i % 3 ? c.dim : c.hi); }
});
// a puddle under him on the floor; splashes: the times he lands in it
prop('viePuddle', (D, e, q, splashes) => {
  if (q <= 0) return; const c = D.col, g = D.g, rx = 34 * G * pop(q);
  g.fillStyle = c.dim; g.beginPath(); g.ellipse(400, FLOOR - 4, rx, 2 * G, 0, 0, TAU); g.fill();
  box(D, 400 - rx * 0.6, FLOOR - 4 - G, 5 * G, G, c.hi); box(D, 400 + rx * 0.3, FLOOR - 4, 4 * G, G, c.hi);
  for (const t of splashes) {
    const k = e - t; if (k < 0 || k > 700) continue;
    for (let j = 0; j < 8; j++) { const sx = j - 3.5, x = 400 + sx * 34 + sx * k * 0.12, y = FLOOR - 8 - (0.62 * k - 0.0011 * k * k); if (y < FLOOR - 4) box(D, x, y, G, G, c.hi); }
    if (k < 500) D.glyph('PLOUF !', 640, FLOOR - 50, 34, c.hi);
  }
});
// an umbrella over his head; open 1, inside out -1 (in between: turning over); rot: blown by the wind
prop('vieUmbrella', (D, q, f, rot) => {
  if (q <= 0) return; const g = D.g, c = D.col, U = D.U, p = D.P(48, 9), s = pop(q), rx = 22 * U * s, ry = Math.max(0.6, 7 * U * s * Math.abs(f)), up = f >= 0;
  g.save(); g.translate(p.x, p.y); g.rotate(tilt(D) + rot);
  g.fillStyle = c.fg; g.fillRect(-0.5 * U, 0, U, 9 * U * s); g.fillRect(-0.5 * U, 8 * U * s, 3 * U, U); g.fillRect(1.5 * U, 6.5 * U * s, U, 2.5 * U);
  g.fillStyle = c.acc; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, up ? Math.PI : 0, up ? TAU : Math.PI); g.closePath(); g.fill();
  g.fillStyle = c.pink; g.beginPath(); g.ellipse(0, 0, rx * 0.36, ry, 0, up ? Math.PI : 0, up ? TAU : Math.PI); g.closePath(); g.fill();
  g.fillStyle = c.fg; g.fillRect(-0.5 * U, up ? -ry - 1.6 * U : ry, U, 1.6 * U);
  g.restore();
});
// wind: streaks rushing from the right to the left, and leaves tumbling
prop('vieWind', (D, e, q, leaves = true) => {
  if (q <= 0) return; const c = D.col;
  for (let i = 0; i < Math.round(9 * q); i++) { const y = 80 + i * 38, x = W + 120 - ((e * 1.3 + i * 173) % (W + 300)); box(D, x, y, 6 * G, G, i % 2 ? c.hi : c.dim); }
  if (leaves) for (let i = 0; i < Math.round(4 * q); i++) { const x = W + 60 - ((e * 0.9 + i * 260) % (W + 200)), y = 120 + i * 70 + 30 * Math.sin(e / 200 + i); spr(D, i % 2 ? 'vieLeafP' : 'vieLeaf', x, y, G, e / 150 + i); }
});
// sunglasses dropping onto his eyes (q), sliding down his nose (slide, px), a glint crossing the lenses (gl 0..1)
prop('vieShades', (D, q, slide, gl) => {
  if (q <= 0) return; const g = D.g, c = D.col, U = D.U, p = D.P(48, 23), dv = -(1 - out(q)) * 34 * U + slide;
  g.save(); g.translate(p.x, p.y + dv); g.rotate(tilt(D));
  for (const sd of [-1, 1]) {
    g.fillStyle = c.fg; g.fillRect((sd * 16 - 7) * U, -5.5 * U, 14 * U, 10 * U); g.fillStyle = c.dim; g.fillRect((sd * 16 - 6) * U, -4.5 * U, 12 * U, 8 * U);
    g.fillStyle = c.fg; g.fillRect(sd > 0 ? 23 * U : -31 * U, -5 * U, 8 * U, U);
  }
  g.fillRect(-9 * U, -4.5 * U, 18 * U, 1.5 * U);
  if (gl > 0 && gl < 1) { const x = lerp(-21, 21, gl), lens = x < 0 ? -16 : 16; if (Math.abs(x - lens) < 5) { g.fillStyle = c.hi; g.fillRect((x - 0.5) * U, -3.5 * U, U, 2 * U); g.fillRect((x + 0.5) * U, -1.5 * U, U, 2 * U); } }
  g.restore();
});
// the snowman being built at the right: st = { b, m, h: balls (0..1), face, arms, hat (0..1), wink }
prop('vieSnowman', (D, st) => {
  const c = D.col, x = 620;
  const ball = (bx, by, r) => { disc(D, bx + 0.12 * r, by + 0.12 * r, r, c.dim); disc(D, bx - 0.04 * r, by - 0.04 * r, r * 0.9, c.hi); };
  if (st.b > 0) { const r = lerp(2, 7, st.b) * G; ball(lerp(790, x, out(st.b)), FLOOR - r, r); }
  if (st.m > 0) ball(x, lerp(-40, 301, out(st.m)), 5 * G);
  if (st.h > 0) ball(x, lerp(-40, 246, out(st.h)), 3.6 * G);
  if (st.face > 0) {
    box(D, x - 1.6 * G, 236, G, G, c.fg); if (st.wink) box(D, x + 0.3 * G, 238, 1.8 * G, G * 0.6, c.fg); else box(D, x + 0.6 * G, 236, G, G, c.fg);
    poly(D, [[x, 245], [x + 3.6 * G * pop(st.face), 249], [x, 253]], c.acc);
    box(D, x - 0.5 * G, 289, G, G, c.fg); box(D, x - 0.5 * G, 309, G, G, c.fg);
  }
  if (st.arms > 0) { const k = st.arms; line(D, [[x - 4.6 * G, 296], [x - 4.6 * G - 6 * G * k, 296 - 3.6 * G * k]], G, c.dim); line(D, [[x + 4.6 * G, 296], [x + 4.6 * G + 6 * G * k, 296 - 3 * G * k]], G, c.dim); }
  if (st.hat > 0) { const y = lerp(60, 0, out(st.hat)); box(D, x - 4 * G, 218 - y, 8 * G, G, c.fg); box(D, x - 2.5 * G, 197 - y, 5 * G, 3 * G, c.fg); box(D, x - 2.5 * G, 213 - y, 5 * G, G, c.pink); }
});
// fog: grey bands drifting across the screen, in front of him (q: how thick)
prop('vieFog', (D, e, q) => {
  if (q <= 0) return; const c = D.col, g = D.g, h = 3 * G * q;
  g.globalAlpha = 0.62;                              // translucent in the smooth themes (in the pixel ones every pixel above the threshold shows)
  [[122, 0.05], [200, -0.07], [285, 0.04], [365, -0.06]].forEach(([y, v], j) => { for (let s = 0; s < 3; s++) {
    const len = [240, 180, 300][(s + j) % 3], x = (((e * v + s * 380 + j * 170) % 1140) + 1140) % 1140 - 170;
    box(D, x, y - h / 2, len, h, c.dim); box(D, x + 3 * G, y - h / 2 - G, len - 6 * G, G, c.dim);
  } });
  g.globalAlpha = 1;
});
// the thick quilt he hides under during the storm (q: pulled up)
prop('vieQuilt', (D, q) => {
  if (q <= 0) return; const c = D.col, top = 318 + (1 - out(q)) * 130, x0 = 140, w = 520;
  box(D, x0, top, w, FLOOR + 7 - top, c.pink);
  for (let y = top + 4 * G; y < FLOOR; y += 4 * G) box(D, x0, y, w, G, c.acc);
  box(D, x0, top, w, G, c.hi); box(D, x0 + 2 * G, top + 2 * G, 10 * G, G, c.hi);
});
// mist on the glass (a big patch over his right eye) and what his finger draws in it: a heart, then a smile (prog 0..1)
prop('vieMist', (D, q, prog) => {
  if (q <= 0) return; const c = D.col, g = D.g, x = 566, y = 238;
  g.globalAlpha = 0.62; g.fillStyle = c.dim; g.beginPath(); g.ellipse(x, y, 16 * G * pop(q), 11 * G * pop(q), 0, 0, TAU); g.fill(); g.globalAlpha = 1;
  if (q < 1) return;
  const n = Math.floor(clamp(prog, 0, 1) * 46);
  for (let i = 0; i < Math.min(n, 36); i++) { const t = i / 36 * TAU, hx = 16 * Math.sin(t) ** 3, hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)); box(D, x + hx * 0.5 * G - G / 2, y - 6 + hy * 0.5 * G - G / 2, G, G, c.bg); }
  for (let i = 36; i < n; i++) box(D, x + (i - 41) * G - G / 2, y + 9 * G, G, G, c.bg);
});

/* ---------- the hours of the day ---------- */
S('vie-cafe', 'Le café du matin', 'vie', { dur: 9200, w: 3, side: true, when: c => c.h >= 7 && c.h < 10,
  anim: [[0, 'fatigue'], [1500, 'bisou'], [2700, 'fatigue'], [3500, 'bisou'], [4400, 'etoiles'], [6400, 'content']], mood: 'baille',
  say: [[300, 1500, L('Mmmh… café…', 'Pas avant mon café…', 'Bonjour… presque.')], [1700, 2600, L('Slurp…', 'Ahhh…')], [4500, 6200, L('Ouh ! Ça réveille !', 'CAFÉ !!!', 'Je vois les sons !')],
    [6500, 9000, L('Prêt pour la journée !', 'Allez, au boulot !', 'Un deuxième ?')]],
  secret: L('Chut, pas avant mon café…', 'Laisse-moi émerger…'),
  move: e => { const sleepy = io(e, 0, 600, 4200, 4500), jit = io(e, 4400, 4500, 6000, 6300);
    return { y: 16 * sleepy + jumps(e - 4400, 260, 14) * jit, r: 0.05 * sleepy * Math.sin(e / 900), x: 3 * Math.sin(e / 17) * jit }; },
  props: (D, e) => D.vieMug(e, lin(e, 0, 400, 8600, 9100), io(e, 1500, 1900, 2400, 2700) + io(e, 3500, 3800, 4100, 4400)) });

const batLevel = e => (e < 7000 ? 5 - 4.2 * seg(e, 400, 5000) : 0.8 + 4.2 * seg(e, 7000, 8400));
S('vie-coup-de-barre', 'Le coup de barre', 'vie', { dur: 10200, w: 3, when: c => c.h >= 14 && c.h < 16,
  anim: [[0, 'fatigue'], [2600, 'surpris'], [2900, 'idle-somnole'], [4400, 'surpris'], [4700, 'batterie-faible'], [7000, 'recharge'], [8600, 'content']], mood: 'baille',
  say: [[400, 2400, L('Le coup de barre…', 'La digestion…', 'Mmh… l’après-midi…')], [2600, 3200, L('Hein ?!')], [3300, 4300, L('Je dors pas… je…', 'Mes yeux… se ferment…')],
    [4800, 6800, L('Batterie faible…', '3 %…', 'Mode économie…')], [7100, 10000, L('Rechaaarge !', 'Ah, ça va mieux !', 'Plein d’énergie !')]],
  move: e => { const d = sm(seg(e, 300, 5200)) * fin(e, 7000, 8200);
    return mv({ y: 65 * d - 32 * bump(seg(e, 2600, 3000)) - 32 * bump(seg(e, 4400, 4800)) + hop(e, 8300, 8800, 20), r: 0.12 * d, s: 1 - 0.08 * d }, squash(e, 8800, 0.15)); },
  props: (D, e) => D.vieBattery(e, lin(e, 200, 600, 9400, 9900), batLevel(e), e > 7000 && e < 8600) });

S('vie-gouter', 'Le goûter', 'vie', { dur: 8200, w: 3, side: true, when: c => c.h === 16 || (c.h === 17 && c.mn < 30),
  anim: [[0, 'idee'], [1400, 'content'], [2000, 'parle'], [5600, 'amoureux']], mood: 'content',
  say: [[200, 1800, L('16 h : le goûter !', 'C’est l’heure du goûter !', 'Un petit cookie ?')], [2100, 5400, L('Miam miam…', 'Crunch, crunch…', 'Mmmh, chocolat !')], [5700, 8000, L('Délicieux !', 'Tu en voulais ? Oups.', 'Il en reste plus…')]],
  secret: L('Pas touche, c’est mon goûter !', 'Miam… tu en veux ? Non.'),
  move: e => ({ sy: 1 - 0.05 * Math.abs(Math.sin(e / 95)) * io(e, 2000, 2200, 5400, 5700), y: hop(e, 300, 800, 18) + hop(e, 5600, 6000, 12) }),
  props: (D, e) => { D.vieCookie(e, lin(e, 900, 1400, 5400, 5600)); if (e > 5700 && e < 7800) D.hearts(e - 5700, 0.6); } });

S('vie-tisane', 'La tisane du soir', 'vie', { dur: 9800, w: 3, when: c => c.h >= 20 && c.h < 23,
  anim: [[0, 'content'], [1500, 'bisou'], [2600, 'idle-sourit'], [4000, 'zen'], [7400, 'idle-somnole'], [9200, 'content']], mood: 'content',
  say: [[400, 1400, L('Une petite tisane…', 'Verveine-menthe…', 'Le soir, c’est tisane.')], [1500, 2500, L('Fffou… chaud !', 'Je souffle…')], [4200, 7000, L('Ahhh, ça détend.', 'On est bien, là.', 'Quelle douce soirée…')],
    [7800, 9400, L('Bientôt dodo…', 'Mmmh…')]],
  move: e => { const k = io(e, 0, 1000, 8800, 9800), blow = io(e, 1500, 1700, 2300, 2500), sip = io(e, 2800, 3100, 3400, 3700);
    return { y: 14 * k + 6 * io(e, 7400, 7800, 8800, 9200), r: 0.025 * Math.sin(e / 900) * k - 0.05 * sip, sx: 1 - 0.04 * blow, sy: 1 + 0.03 * blow, s: 1 + 0.02 * Math.sin(e / 500) * io(e, 4000, 4400, 7000, 7400) }; },
  props: (D, e) => { D.viePlaid(lin(e, 0, 700, 9000, 9700)); D.vieTea(e, lin(e, 300, 800, 8900, 9500), io(e, 2800, 3100, 3400, 3700)); } });

/* ---------- the night: quiet ones (calm, nothing loud) ---------- */
S('vie-etoiles', 'Il compte les étoiles', 'vie', { quiet: true, dur: 11500, w: 3, when: c => c.night, anim: [[0, 'idle-haut'], [8000, 'confus'], [9300, 'idle-sourit']], mood: 'reflechit',
  say: [[900, 3000, L('Une… deux… trois…', 'Je compte les étoiles…')], [3600, 6200, L('…sept, huit…', '…onze, douze…')], [8000, 10200, L('…j’ai perdu le fil.', 'Bon, il y en a beaucoup.', 'Mille, environ.')]],
  secret: L('Chut… quatorze… quinze…', 'Tu m’as fait perdre le compte !'),
  move: e => { const k = io(e, 0, 1200, 10200, 11500), i = clamp(Math.floor((e - 900) / 480), 0, SKY.length - 1), sx = SKY[i][0], look = io(e, 900, 1400, 7600, 8000);
    return { y: 22 * k, x: (sx - 400) * 0.08 * look, r: (sx - 400) * 0.0003 * look + 0.05 * Math.sin((e - 8000) / 140) * io(e, 8000, 8200, 8800, 9100) }; },
  props: (D, e) => D.vieSky(e, e < 10600 ? 14 : 0, 900, 480, e < 7800) });

S('vie-moutons', 'Il compte les moutons', 'vie', { quiet: true, dur: 12000, w: 3, when: c => c.night, anim: [[0, 'idle-somnole'], [7800, 'sommeil']], mood: 'endormi',
  say: [[600, 2400, L('Un mouton…', 'Allez, on compte…')], [2600, 4400, L('…deux moutons…', '…deux…')], [4500, 6300, L('…trois mou… tons…', '…trois…')], [6400, 7600, L('…qua… tre…', '…zzz… quatre…')]],
  secret: L('Chut… je compte…', 'Tu m’as fait perdre le compte !'),
  move: e => { const d = fin(e, 10600, 11800); return { y: 34 * sm(seg(e, 2000, 8500)) * d, s: 1 - 0.08 * sm(seg(e, 3000, 9000)) * d, r: 0.04 * Math.sin(e / 1100) * sm(seg(e, 7800, 8600)) * d }; },
  props: (D, e) => { D.vieSheep(e, lin(e, 0, 500, 11300, 11900)); if (e > 7800 && e < 11600) D.zzz(e - 7800, io(e, 7800, 8200, 11000, 11600)); } });

S('vie-telescope', 'Le télescope', 'vie', { quiet: true, dur: 10800, w: 2, when: c => c.night,
  anim: [[0, 'curieux'], [1300, 'clin-oeil'], [2400, 'idle-regard'], [4700, 'surpris'], [5600, 'etoiles'], [6600, 'amoureux'], [9200, 'idle-sourit']], mood: 'reflechit',
  say: [[400, 1800, L('Voyons les étoiles…', 'Mon télescope !', 'Cap sur la Lune…')], [2400, 4400, L('Je vois… mon œil.', 'Oh, Saturne !', 'C’est flou…')], [4800, 6200, L('Une étoile filante !', 'Là ! Regarde !')],
    [6600, 9000, L('Fais un vœu, vite !', 'J’ai fait un vœu…', 'Chut, c’est secret.')]],
  secret: L('Mon vœu ? C’est un secret.', 'Mon vœu ? Que tu restes.'),
  move: e => { const k = io(e, 300, 1300, 4500, 4800), back = io(e, 4600, 5000, 9600, 10600);
    return { x: 72 * k + 20 * back, r: 0.1 * k - 0.08 * back, y: -10 * back }; },
  props: (D, e) => { D.vieSky(e, 6, 0, 120, false); D.vieTelescope(lin(e, 0, 700, 10000, 10700)); D.vieComet(seg(e, 4700, 5500)); } });

S('vie-reve', 'Le rêve', 'vie', { quiet: true, dur: 12000, w: 2, side: true, when: c => c.night || c.h < 7, anim: [[0, 'idle-somnole'], [1500, 'sommeil'], [3000, 'reve'], [9500, 'sommeil']], mood: 'endormi',
  say: [[5600, 7600, L('…je vole…', '…super Pixel…', '…encore une pizza…', '…hihi…')]],
  secret: L('…mmh… pas maintenant…', '…je vole… chut…'),
  move: e => { const k = sm(seg(e, 2500, 4500)) * fin(e, 9500, 11500), sw = io(e, 2500, 4000, 8500, 10500);
    return { y: 10 * sm(seg(e, 0, 1500)) * fin(e, 10500, 11800) - 30 * k + 8 * Math.sin(e / 600) * sw, x: 60 * Math.sin((e - 2500) / 1500) * sw, r: 0.08 * Math.cos((e - 2500) / 1500) * sw }; },
  props: (D, e) => { D.vieDream(e, lin(e, 3000, 3600, 9300, 9900)); D.zzz(e, io(e, 1200, 1800, 10800, 11600)); } });

const bug = e => ({ x: 400 + 260 * Math.sin(e / 1700 + 1) + 40 * Math.sin(e / 430), y: 200 + 90 * Math.sin(e / 1300) + 20 * Math.sin(e / 310) });
S('vie-luciole', 'La luciole', 'vie', { quiet: true, dur: 10500, w: 2, when: c => c.night, anim: [[0, 'idle-regard'], [1200, 'curieux'], [6000, 'timide'], [8600, 'idle-sourit']], mood: 'ecoute',
  say: [[800, 2800, L('Oh… une luciole.', 'Une petite lumière…')], [6400, 8400, L('Une veilleuse rien qu’à moi.', 'Elle brille pour moi…', 'Chut… elle se repose.')]],
  secret: L('Chut… elle dort sur moi.', 'Doucement, tu vas l’envoler.'),
  move: e => { const f = bug(Math.min(e, 5800)), fol = io(e, 600, 1400, 5400, 6000); return { x: (f.x - 400) * 0.15 * fol, y: (f.y - 240) * 0.08 * fol, s: 1 + 0.02 * io(e, 6200, 6600, 8200, 8600) }; },
  props: (D, e) => { if (e < 200 || e > 10000) return; const nose = D.P(48, 26), f = bug(e);
    let x = f.x, y = f.y;
    if (e > 5800 && e < 8600) { const q = sm(seg(e, 5800, 6400)); x = lerp(f.x, nose.x, q); y = lerp(f.y, nose.y, q); }
    else if (e >= 8600) { const q = sm(seg(e, 8600, 10000)); x = lerp(nose.x, -40, q); y = lerp(nose.y, 60, q); }
    D.vieFirefly(x, y, e); if (e > 6000 && e < 8600) D.blush(io(e, 6000, 6400, 8200, 8600)); } });

/* ---------- the weather ---------- */
const SPLASH = [2300, 3900, 5700];
S('vie-flaques', 'Les flaques', 'vie', { wx: true, dur: 8800, w: 2, when: c => c.kind === 'pluie', anim: [[0, 'curieux'], [1300, 'rire'], [6000, 'etoiles'], [7300, 'content']], mood: 'excite',
  say: [[300, 1400, L('Une flaque !', 'Oh, une flaque d’eau…')], [2300, 2900, L('Plouf !', 'Splash !')], [3900, 4500, L('Re-plouf !', 'Encore !')], [5700, 7200, L('SPLAAASH !', 'Le plus gros plouf !')],
    [7300, 8600, L('Les flaques, c’est la vie.', 'Je suis trempé !', 'Encore une ?')]],
  move: e => mv({ y: 58 * io(e, 300, 1200, 7400, 8500) + hop(e, 1500, 2300, 70) + hop(e, 3000, 3900, 95) + hop(e, 4600, 5700, 118) }, ...SPLASH.map(t => squash(e, t, 0.25))),
  props: (D, e) => { const q = lin(e, 0, 600, 8000, 8700); D.vieRain(e, q); D.viePuddle(e, q, SPLASH); } });

S('vie-parapluie', 'Le parapluie', 'vie', { wx: true, dur: 9400, w: 2, side: true, when: c => c.kind === 'pluie' || c.kind === 'orage',
  anim: [[0, 'content'], [1200, 'idle-sourit'], [5600, 'panique'], [7400, 'confus'], [8200, 'content']], mood: 'content',
  say: [[400, 2600, L('Vive mon parapluie !', 'Même pas mouillé !', 'Chantons sous la pluie…')], [2800, 5200, L('♪ Je chante sous la pluie…', 'Plic, ploc, plic…')], [5700, 7300, L('Mon parapluie !', 'Au secours, le vent !', 'Il s’envole !')],
    [7500, 9200, L('Bon… ça ira.', 'Un peu mouillé, quand même.', 'Le vent a gagné.')]],
  move: e => { const gust = io(e, 5600, 6000, 7000, 7600), k = io(e, 0, 900, 8500, 9400); return { x: -170 * k + 150 * gust + 3 * Math.sin(e / 40) * gust, r: 0.18 * gust, y: 4 * Math.abs(Math.sin(e / 300)) * io(e, 2800, 3000, 5000, 5400) }; },
  props: (D, e) => { const q = lin(e, 300, 900, 8700, 9300), f = e < 5900 ? 1 : e < 7300 ? Math.cos(Math.PI * seg(e, 5900, 6300)) : -Math.cos(Math.PI * seg(e, 7300, 7700));
    D.vieRain(e, lin(e, 0, 400, 8800, 9400)); D.vieUmbrella(q, f, 0.25 * io(e, 5600, 5900, 7200, 7600) + 0.06 * Math.sin(e / 90) * io(e, 5600, 5800, 7200, 7400)); D.vieWind(e, io(e, 5500, 5800, 7100, 7500), false);
    if (q >= 1 && e < 5600) for (const sd of [-1, 1]) { const p = D.P(48 + sd * 22, 10), k = ((e / 700) + (sd > 0 ? 0.5 : 0)) % 1; box(D, p.x, p.y + k * 120, G / 2, 2 * G * 0.7, D.col.hi); } } });

S('vie-lunettes', 'Les lunettes de soleil', 'vie', { wx: true, dur: 7800, w: 3, when: c => c.sunny && c.h >= 8 && c.h < 20, anim: [[0, 'fier'], [5200, 'clin-oeil'], [6500, 'content']], mood: 'fier',
  say: [[700, 2600, L('Trop stylé.', 'Le soleil me va bien.', 'Classe, non ?')], [3200, 4900, L('Cool, cool, cool…', 'Pixel, star de cinéma.', 'Pas de photos, merci.')], [5300, 6400, L('Clin d’œil.', 'Je t’ai vu, toi.')],
    [6600, 7600, L('Bon, ça éblouit.', 'Allez, je range tout ça.')]],
  move: e => { const cool = io(e, 1000, 1500, 2600, 3000), strut = io(e, 3200, 3500, 4700, 5000), lean = io(e, 5200, 5500, 6200, 6500);
    return mv({ r: -0.08 * cool + 0.05 * Math.sin((e - 3200) / 250) * strut, y: -6 * cool - 8 * Math.abs(Math.sin((e - 3200) / 250)) * strut, x: 20 * Math.sin((e - 3200) / 500) * strut, s: 1 + 0.05 * lean }, squash(e, 650, 0.12)); },
  props: (D, e) => D.vieShades(e < 6500 ? seg(e, 200, 650) : 1 - seg(e, 6500, 7000), 3 * D.U * io(e, 5200, 5500, 6200, 6500) - (e > 6500 ? 40 * D.U * inn(seg(e, 6500, 7000)) : 0), seg(e, 2600, 3200)) });

const snowSt = e => ({ b: seg(e, 800, 2400), m: seg(e, 2600, 3400), h: seg(e, 3800, 4500), face: seg(e, 5000, 5400), arms: seg(e, 5800, 6200), hat: seg(e, 6400, 6900), wink: e > 8000 && e < 8500 });
S('vie-bonhomme', 'Le bonhomme de neige', 'vie', { wx: true, dur: 11500, w: 3, side: true, when: c => c.kind === 'neige',
  anim: [[0, 'curieux'], [800, 'content'], [6900, 'fier'], [8000, 'surpris'], [8900, 'rire']], mood: 'excite',
  say: [[300, 2200, L('Il neige !', 'Un bonhomme de neige !', 'On fait un bonhomme ?')], [2600, 6400, L('Une boule… deux boules…', 'Une carotte pour le nez…', 'Il lui faut un chapeau.')],
    [6900, 7900, L('Tadaa !', 'Je te présente Bernard.', 'Il est beau, hein ?')], [8100, 9400, L('Il m’a fait un clin d’œil !', 'Il… il a bougé ?!')], [9500, 11300, L('Il est vivant !', 'On est copains, lui et moi.', 'Brrr… il fait froid.')]],
  move: e => { const k = io(e, 0, 1000, 10400, 11500), work = [2600, 3800, 5000, 5800, 6400].reduce((a, t) => a + hop(e, t - 200, t + 200, 10), 0);
    return mv({ x: -130 * k, y: work + hop(e, 6900, 7400, 20) + hop(e, 8000, 8400, 24) }, squash(e, 8400, 0.2)); },
  props: (D, e) => { const q = lin(e, 0, 800, 10600, 11400); D.snow(e, q); if (q > 0) { const s = snowSt(e); if (e > 10600) { const k = 1 - seg(e, 10600, 11400); for (const n of ['b', 'm', 'h', 'face', 'arms', 'hat']) s[n] = Math.min(s[n], k); } D.vieSnowman(s); } } });

S('vie-brume', 'Le brouillard', 'vie', { wx: true, dur: 9800, w: 2, when: c => c.kind === 'nuage' && c.h >= 6 && c.h < 12,
  anim: [[0, 'curieux'], [2000, 'idle-regard'], [4500, 'confus'], [6200, 'surpris'], [6900, 'rire'], [8400, 'content']], mood: 'ecoute',
  say: [[400, 1900, L('Quel brouillard…', 'On n’y voit rien !', 'Tout est gris…')], [2400, 4400, L('Y a quelqu’un ?', 'Ohé ?', 'Je suis perdu…')], [4600, 6000, L('Par ici ? Par là ?', 'Où est mon écran ?')],
    [6300, 8200, L('Ah, te voilà !', 'Je t’ai retrouvé !', 'Ouf, c’est toi !')]],
  move: e => { const far = io(e, 2000, 3600, 5600, 6200), wan = io(e, 4500, 4800, 5600, 6000), big = io(e, 6200, 6500, 7400, 8200);
    return { s: 1 - 0.45 * far + 0.12 * big, y: -40 * far, x: -60 * far + 140 * (seg(e, 4500, 5800) - 0.5) * wan }; },
  props: (D, e) => D.vieFog(e, io(e, 0, 1400, 8400, 9700)) });

const BOLTS = [900, 4200];
S('vie-orage', 'Peur de l’orage', 'vie', { wx: true, dur: 8400, w: 3, when: c => c.kind === 'orage',
  anim: [[0, 'curieux'], [900, 'surpris'], [1300, 'panique'], [2600, 'timide'], [4200, 'panique'], [5600, 'timide'], [6600, 'fier'], [7600, 'content']], mood: 'surpris',
  say: [[1000, 1600, L('Aaah !', 'Au secours !')], [2700, 4000, L('C’est fini ?', 'Il est parti, l’orage ?', 'Je suis pas là.')], [4300, 4900, L('Iiiih !', 'Non non non !')],
    [6500, 8200, L('J’ai même pas peur.', 'C’est le ciel qui a peur.', 'J’étais pas caché, hein.')]],
  secret: L('Chut ! L’orage va m’entendre !', 'Je suis pas là !'),
  move: e => { let y = 0;
    if (e > 900 && e < 1400) y = hop(e, 900, 1300, 40);
    else if (e >= 1400 && e < 6400) y = 125 * sm(seg(e, 1400, 1800)) - 27 * io(e, 2600, 2900, 3900, 4200) - 27 * io(e, 5600, 5900, 6100, 6400);
    else if (e >= 6400) y = 125 * fin(e, 6400, 7000);
    return mv({ y, x: 2 * Math.sin(e / 18) * (io(e, 1800, 1900, 2500, 2600) + io(e, 4200, 4300, 5400, 5600)) }, squash(e, 900, 0.2)); },
  props: (D, e) => { D.vieRain(e, lin(e, 0, 500, 7800, 8400), 14); D.vieQuilt(lin(e, 1200, 1500, 7000, 7600));
    for (const [i, t] of BOLTS.entries()) if (e > t && e < t + 360 && ((e - t) % 180) < 120) spr(D, 'vieBolt', i ? 660 : 140, 150, G);
    for (const [i, t] of BOLTS.entries()) if (e > t + 150 && e < t + 900) D.glyph(i ? 'BRRRAOUM !' : 'BOUM !', i ? 600 : 220, 260, 44, D.col.acc); } });

S('vie-vent', 'Le coup de vent', 'vie', { wx: true, dur: 7800, w: 2, when: c => c.kind === 'nuage' || c.kind === 'orage',
  anim: [[0, 'curieux'], [1200, 'surpris'], [2400, 'panique'], [4400, 'confus'], [5600, 'rire']], mood: 'surpris',
  say: [[400, 1500, L('Tiens, du vent…', 'Ça souffle !')], [2000, 4300, L('Wooo !', 'Je m’envole !', 'Accroche-toi, Pixel !')], [5600, 7600, L('Pfiou, quel vent !', 'Je suis tout décoiffé.', 'Même pas envolé !')]],
  move: e => { const t = e - 4400, push = e < 4400 ? -190 * sm(seg(e, 600, 3000)) : -190 * Math.exp(-t / 350) * Math.cos(t / 190), hold = io(e, 2800, 3000, 4200, 4400);
    return { x: push + 4 * Math.sin(e / 20) * hold, r: e < 4400 ? 0.15 * sm(seg(e, 600, 3000)) : 0.15 * Math.exp(-t / 300) * Math.cos(t / 160), sx: 1 - 0.1 * hold, sy: 1 + 0.05 * hold }; },
  props: (D, e) => D.vieWind(e, io(e, 300, 900, 4200, 4600)) });

S('vie-buee', 'Le dessin sur la buée', 'vie', { wx: true, dur: 9000, w: 1, when: c => c.wet,
  anim: [[0, 'curieux'], [600, 'bisou'], [1800, 'idle-regard'], [5600, 'fier'], [7000, 'amoureux']], mood: 'content',
  say: [[400, 1600, L('Haaaaa…', 'De la buée !')], [2000, 5200, L('Un petit dessin…', 'Avec le doigt…', 'Attends, attends…')], [5600, 8600, L('Pour toi !', 'Un cœur et un sourire !', 'Tu aimes ?')]],
  move: e => ({ x: 26 * io(e, 300, 900, 1500, 1900), s: 1 + 0.08 * io(e, 300, 900, 1500, 1900), r: 0.04 * Math.sin(e / 160) * io(e, 2000, 2300, 5000, 5400) }),
  props: (D, e) => D.vieMist(lin(e, 700, 1500, 8000, 8900), seg(e, 2000, 5200)) });

/* ---------- wet days and December: the world's own moments first ----------
   On a wet day (rain, storm, snow) he stays with the weather's scenes (wx: true) and persona.js's rain; all December, the
   Christmas snow and the Christmas surprises come first. Our other scenes step aside then (their weight drops), so that a
   big pack of everyday moments does not drown them. persona.js calls s.when(c) just before its weighted draw, so the
   weight is set there, and it is back to normal as soon as it is dry, or January. */
const WET = 0.03, XMAS = 0.2;
for (const s of MINE) { const w0 = s.w, f = s.when, wx = !!s.wx; s.when = function (c) { this.w = w0 * (c.wet && !wx ? WET : 1) * (c.xmas ? XMAS : 1); return !f || f(c); }; }
});
