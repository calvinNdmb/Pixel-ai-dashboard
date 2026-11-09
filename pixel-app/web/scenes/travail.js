/* Scene pack « travail » — Work and the house: Codex, the timer, the lights, the weather, typing, Stream Deck keys and phone actions.
   See the top of web/persona.js: scenes are defined with S('id', 'Label', 'group', { ... }) on one line each
   (pixel/scenes.py reads them), groups tap / fache / calin / retour / vie / evt, plus "on" (events) and "pool" (touch pools).
   Every scene here is an 'evt' one: it answers what screens.js sees happen (persona.js EVENTS):
     codex-start / codex-ok / codex-fail, timer-start / timer-done, lights-change, weather (data.kind: soleil, nuage, pluie, neige, orage),
     typing (you type in the app, at most every 4 s: short and quiet), action (data.name: the server action, lights.set, timer.add...).
   One server action often brings its own event in the same state (timer.start -> timer-start, codex.run -> codex-start,
   a brightness change -> lights-change): screens.js sends that event first, then 'action'. Our specific scenes "claim" the frame
   (init: claim) and the action scenes stand back on that frame (free()), so you see the timer's scene, not a generic "c'est fait".
   The props we draw ourselves are declared below with prop('tafXxx', ...) and called D.tafXxx(...) in the scenes. */
(window.PixelScenePacks ||= []).push(({ S, L, pick, sm, out, inn, seg, bump, tri, jumps, clamp, rnd, TAU, W, HT, A, H, prop }) => {

/* ---------- small helpers ---------- */
const short = (s, n = 16) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const fade = (e, a, b, c, d) => seg(e, a, b) * (1 - seg(e, c, d));                    // 0 -> 1 between a and b, back to 0 between c and d
const pop = q => (q <= 0 ? 0 : out(q) * (1 + 0.18 * Math.sin(Math.PI * clamp(q, 0, 1))));   // a scale that overshoots a little
const alpha = (g, q) => { g.globalAlpha = clamp(q * 2, 0, 1); };
let claimAt = -1;                                     // the frame on which one of our specific event scenes started
const claim = () => { claimAt = H.now(); };
const free = () => H.now() !== claimAt;
const act = re => d => free() && re.test((d && d.name) || '');                        // an action family, unless a specific scene took this frame
const KINDS = ['soleil', 'nuage', 'pluie', 'neige', 'orage'];
const LUM = {};
const isDark = c => { if (!(c in LUM)) { const n = parseInt(String(c).slice(1, 7), 16) || 0; LUM[c] = ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) < 110; } return LUM[c]; };
const keep = (p, r) => ({ x: clamp(p.x, 12 + r, W - 12 - r), y: clamp(p.y, 58 + r, HT - 48 - r) });   // a prop of radius r kept on the screen
const CLOUD = [[-9, 1, 4.5], [-3, -2, 6], [4, -1, 5.5], [10, 1.5, 4]], HOLES = [[-4, -2.6], [-0.6, -3], [2.6, -1.8], [-2.6, 0], [1, 0.2], [4, -0.4]];

/* ---------- our props ---------- */
// two little arms from his lower corners, sleeves rolled up (roll 0 -> 1), flexing (flex)
prop('tafSleeves', (D, q, roll = 1, flex = 0) => {
  if (q <= 0) return; const { g, U, col } = D; alpha(g, q);
  for (const sd of [-1, 1]) {
    const b = D.P(48 + sd * 38, 50), a = -Math.PI / 2 + sd * (0.55 - 0.4 * flex), len = 15 * U * out(q), ca = Math.cos(a), sa = Math.sin(a);
    const cf = 0.78 - 0.45 * roll, cx = b.x + ca * len * cf, cy = b.y + sa * len * cf, hx = b.x + ca * len, hy = b.y + sa * len;
    g.lineCap = 'round'; g.strokeStyle = col.dim; g.lineWidth = 5 * U; g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(cx, cy); g.stroke();
    g.strokeStyle = col.fg; g.lineWidth = 3.6 * U; g.beginPath(); g.moveTo(cx, cy); g.lineTo(hx, hy); g.stroke();
    g.lineCap = 'butt'; g.strokeStyle = col.hi; g.lineWidth = 5.8 * U; g.beginPath(); g.moveTo(cx - ca * 1.3 * U, cy - sa * 1.3 * U); g.lineTo(cx + ca * 1.3 * U, cy + sa * 1.3 * U); g.stroke();
    g.fillStyle = col.fg; g.beginPath(); g.arc(hx, hy, 3 * U, 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
});
// a little keyboard under his chin, its keys lighting up as he types (speed: ms per key)
prop('tafKeyboard', (D, e, q, speed = 90) => {
  if (q <= 0) return; const { g, U, col } = D, c = D.P(48, 47), w = 32 * U, h = 8.5 * U, x = c.x - w / 2, y = Math.min(c.y + (1 - out(q)) * 24 * U, HT - 40 - h);
  alpha(g, q); g.fillStyle = col.bg; g.fillRect(x, y, w, h); g.strokeStyle = col.fg; g.lineWidth = D.lw(0.9 * U); g.strokeRect(x, y, w, h);
  const t = Math.floor(e / speed);
  for (let r = 0; r < 2; r++) for (let i = 0; i < 8; i++) { g.fillStyle = ((i * 5 + r * 3 + t * 7) % 9) < 2 ? col.hi : col.dim; g.fillRect(x + (1.7 + i * 3.7) * U, y + (1.4 + r * 2.6) * U, 2.4 * U, 1.8 * U); }
  g.fillStyle = t % 4 === 0 ? col.hi : col.dim; g.fillRect(x + 9 * U, y + 6.4 * U, 14 * U, 1.4 * U);
  g.globalAlpha = 1;
});
// an alarm clock with two bells; ring: it shakes, its hammer beats, little lines fly off it
prop('tafAlarm', (D, e, q, ring = 0, pos) => {
  if (q <= 0) return; const { g, U, col } = D, s = U * pop(q), p = pos || D.P(85, 15);
  const x = clamp(p.x, 12 + 10 * s, W - 12 - 10 * s) + ring * Math.sin(e / 14) * 0.8 * U, y = clamp(p.y, 60 + 9 * s, HT - 48 - 8 * s);
  g.save(); g.translate(x, y); g.rotate(ring * 0.22 * Math.sin(e / 22)); alpha(g, q);
  g.fillStyle = col.acc; for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(sd * 4.2 * s, -5.4 * s, 2.7 * s, 2.1 * s, sd * 0.6, Math.PI, TAU); g.fill(); }
  g.fillStyle = col.fg; g.fillRect((ring ? Math.sin(e / 9) * 2.4 : 0) * s - 0.7 * s, -8 * s, 1.4 * s, 2.8 * s);
  g.strokeStyle = col.fg; g.lineWidth = D.lw(0.9 * U); g.lineCap = 'round';
  g.beginPath(); g.moveTo(-3 * s, 4.4 * s); g.lineTo(-4.6 * s, 6.8 * s); g.moveTo(3 * s, 4.4 * s); g.lineTo(4.6 * s, 6.8 * s); g.stroke();
  g.fillStyle = col.bg; g.beginPath(); g.arc(0, 0, 5.4 * s, 0, TAU); g.fill(); g.stroke();
  const a1 = e / 500, a2 = e / 6000; g.lineWidth = D.lw(0.7 * U); g.beginPath();
  g.moveTo(0, 0); g.lineTo(Math.sin(a1) * 3.6 * s, -Math.cos(a1) * 3.6 * s); g.moveTo(0, 0); g.lineTo(Math.sin(a2) * 2.4 * s, -Math.cos(a2) * 2.4 * s); g.stroke();
  if (ring && e % 240 < 150) {
    g.strokeStyle = col.acc; g.lineWidth = D.lw(0.8 * U); g.beginPath();
    for (const sd of [-1, 1]) { g.moveTo(sd * 7.5 * s, -4.5 * s); g.lineTo(sd * 9.6 * s, -6.6 * s); g.moveTo(sd * 8 * s, 0); g.lineTo(sd * 10.6 * s, 0); g.moveTo(sd * 7.5 * s, 4.5 * s); g.lineTo(sd * 9.6 * s, 6.6 * s); }
    g.stroke();
  }
  g.restore();
});
// a round badge, a check mark (ok) or a cross drawn on it, stroke by stroke as q grows
function badge(D, q, p, size, ok) {
  if (q <= 0) return; const { g, U, col } = D, r = size * U * pop(q), o = keep(p, r);
  g.fillStyle = ok ? col.fg : col.acc; g.beginPath(); g.arc(o.x, o.y, r, 0, TAU); g.fill();
  const k = seg(q, 0.35, 1); if (k <= 0) return;
  g.strokeStyle = col.bg; g.lineWidth = D.lw(r * 0.26); g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
  if (ok) {
    const f = k * 2, ax = o.x - r * 0.5, ay = o.y + r * 0.02, bx = o.x - r * 0.12, by = o.y + r * 0.42, cx = o.x + r * 0.55, cy = o.y - r * 0.38;
    g.moveTo(ax, ay); if (f <= 1) g.lineTo(ax + (bx - ax) * f, ay + (by - ay) * f); else { g.lineTo(bx, by); g.lineTo(bx + (cx - bx) * (f - 1), by + (cy - by) * (f - 1)); }
  } else {
    const d = r * 0.42, f = Math.min(1, k * 2), f2 = Math.max(0, k * 2 - 1);
    g.moveTo(o.x - d, o.y - d); g.lineTo(o.x - d + 2 * d * f, o.y - d + 2 * d * f);
    if (f2 > 0) { g.moveTo(o.x + d, o.y - d); g.lineTo(o.x + d - 2 * d * f2, o.y - d + 2 * d * f2); }
  }
  g.stroke();
}
prop('tafCheck', (D, q, p, size = 6) => badge(D, q, p, size, true));
prop('tafCross', (D, q, p, size = 6) => badge(D, q, p, size, false));
// a light bulb; on: lit, with its rays
prop('tafBulb', (D, e, q, on, p) => {
  if (q <= 0) return; const { g, U, col } = D, s = U * pop(q), o = keep(p, 9 * s), x = o.x, y = o.y;
  alpha(g, q); g.lineCap = 'round';
  if (on) {
    g.strokeStyle = col.acc; g.lineWidth = D.lw(0.9 * U); const l = 7 + 0.8 * Math.sin(e / 90); g.beginPath();
    for (let i = 0; i < 8; i++) { if (i === 4) continue; const a = i * TAU / 8 - Math.PI / 2; g.moveTo(x + Math.cos(a) * 5.2 * s, y - s + Math.sin(a) * 5.2 * s); g.lineTo(x + Math.cos(a) * l * s, y - s + Math.sin(a) * l * s); }
    g.stroke();
  }
  g.fillStyle = on ? col.acc : col.bg; g.strokeStyle = col.fg; g.lineWidth = D.lw(0.8 * U); g.beginPath(); g.arc(x, y - s, 3.8 * s, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = col.dim; g.fillRect(x - 1.8 * s, y + 2.4 * s, 3.6 * s, 3 * s); g.fillStyle = col.fg; g.fillRect(x - 1.8 * s, y + 3.4 * s, 3.6 * s, 0.8 * s);
  g.globalAlpha = 1;
});
// light rays all around his head: dazzled
prop('tafRays', (D, e, q) => {
  if (q <= 0) return; const { g, U, col } = D, c = D.at('c'), k = out(q);
  g.lineCap = 'round'; g.lineWidth = D.lw(1.1 * U);
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12 + e / 2500, l = (3 + 1.5 * Math.sin(e / 110 + i * 2)) * k * U, ca = Math.cos(a), sa = Math.sin(a);
    g.strokeStyle = i % 2 ? col.acc : col.hi; g.beginPath(); g.moveTo(c.x + ca * 42 * U, c.y + sa * 25 * U); g.lineTo(c.x + ca * (42 * U + l * 1.6), c.y + sa * (25 * U + l)); g.stroke();
  }
});
// an umbrella over his head, opening with q (it follows him)
prop('tafUmbrella', (D, q) => {
  if (q <= 0) return; const { g, U, col } = D, b = D.P(48, 5), rx = 24 * U * out(q), ry = 12 * U * out(q), x = b.x, y = b.y;
  g.strokeStyle = col.fg; g.lineWidth = D.lw(1 * U); g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y - ry); g.lineTo(x, y + 8 * U); g.arc(x + 2 * U, y + 8 * U, 2 * U, Math.PI, 0, true); g.stroke();
  g.fillStyle = col.acc; g.beginPath(); g.ellipse(x, y, rx, ry, 0, Math.PI, TAU);
  const sw = rx / 2; for (let i = 0; i < 4; i++) g.quadraticCurveTo(x + rx - (i + 0.5) * sw, y - ry * 0.3, x + rx - (i + 1) * sw, y);
  g.closePath(); g.fill();
  g.strokeStyle = col.bg; g.lineWidth = D.lw(0.5 * U); g.beginPath(); g.moveTo(x, y - ry); g.lineTo(x - sw, y); g.moveTo(x, y - ry); g.lineTo(x + sw, y); g.stroke();
  g.fillStyle = col.fg; g.fillRect(x - 0.8 * U, y - ry - 2.2 * U, 1.6 * U, 2.4 * U);
});
// rain over the whole screen; the drops between x0 and x1 stop at ys (an umbrella) with a little splash
prop('tafRain', (D, e, q, x0 = 1e9, x1 = -1e9, ys = 1e9) => {
  if (q <= 0) return; const { g, U, col } = D; alpha(g, q); g.strokeStyle = col.hi; g.lineWidth = D.lw(0.6 * U); g.lineCap = 'round'; g.beginPath();
  for (let i = 0; i < 22; i++) {
    const x = (i * 89 + 23) % 760 + 20, sp = 300 + (i * 53 % 7) * 40, y = 46 + ((e / 1000) * sp + i * 71) % 390;
    if (x > x0 && x < x1 && y > ys) { if (y < ys + 26) { g.moveTo(x - 1.2 * U, ys - 0.6 * U); g.lineTo(x - 2.2 * U, ys - 1.8 * U); g.moveTo(x + 1.2 * U, ys - 0.6 * U); g.lineTo(x + 2.2 * U, ys - 1.8 * U); } continue; }
    g.moveTo(x, y); g.lineTo(x - 0.5 * U, y + 2.6 * U);
  }
  g.stroke(); g.globalAlpha = 1;
});
// sunglasses, falling onto his eyes as q grows (dark lenses in every theme)
prop('tafShades', (D, q) => {
  if (q <= 0) return; const { g, U, col } = D, a = D.P(34, 23), b = D.P(66, 23), c = D.P(48, 23), dark = isDark(col.bg);
  let ang = Math.atan2(b.y - a.y, b.x - a.x); if (Math.cos(ang) < 0) ang += Math.PI;
  const lens = dark ? col.bg : col.fg, frame = col.fg, glint = dark ? col.hi : col.bg;
  g.save(); g.translate(c.x, c.y - (1 - out(q)) * 26 * U); g.rotate(ang); g.globalAlpha = 1;
  for (const sd of [-1, 1]) {
    const ex = sd * 16 * U;
    g.fillStyle = frame; g.fillRect(ex - 8.6 * U, -5.4 * U, 17.2 * U, 8.6 * U); g.fillRect(ex - 6.6 * U, 3 * U, 13.2 * U, 2.6 * U);
    g.fillStyle = lens; g.fillRect(ex - 7.4 * U, -4.2 * U, 14.8 * U, 7 * U); g.fillRect(ex - 5.4 * U, 2.6 * U, 10.8 * U, 1.8 * U);
    g.fillStyle = glint; g.fillRect(ex - 5.6 * U, -3 * U, 2.4 * U, 1.6 * U); g.fillRect(ex - 3 * U, -1.2 * U, 1.6 * U, 1.4 * U);
  }
  g.fillStyle = frame; g.fillRect(-7.6 * U, -4.6 * U, 15.2 * U, 2 * U); g.fillRect(-32 * U, -4.6 * U, 7.6 * U, 1.8 * U); g.fillRect(24.4 * U, -4.6 * U, 7.6 * U, 1.8 * U);
  g.restore();
});
// a thumbs up (sd -1: the left hand)
prop('tafThumb', (D, q, p, sd = 1) => {
  if (q <= 0) return; const { g, U, col } = D, s = U * pop(q), o = keep(p, 9 * s);
  g.save(); g.translate(o.x, o.y); g.scale(sd, 1); g.rotate(-0.12 + 0.1 * Math.sin(q * 9)); alpha(g, q);
  g.fillStyle = col.acc; g.fillRect(-4 * s, 4.4 * s, 7.4 * s, 3.6 * s);
  g.fillStyle = col.fg; g.fillRect(-4.6 * s, -2.2 * s, 8.6 * s, 6.8 * s); g.fillRect(-4.2 * s, -7.6 * s, 3.4 * s, 6 * s);
  g.beginPath(); g.arc(-2.5 * s, -7.6 * s, 1.7 * s, Math.PI, 0); g.fill();
  g.fillStyle = col.bg; for (let i = 0; i < 3; i++) g.fillRect(-1 * s, (-0.6 + i * 1.8) * s, 5 * s, 0.7 * s);
  g.restore();
});
// a hand slapping his face (a facepalm), coming in from the bottom left
prop('tafHand', (D, q) => {
  if (q <= 0) return; const { g, U, col } = D, c = D.P(36, 20), k = out(q);
  g.save(); g.translate(c.x - (1 - k) * 30 * U, c.y + (1 - k) * 44 * U); g.rotate(-0.35); g.globalAlpha = 1;
  g.fillStyle = col.dim; g.fillRect(-4.5 * U, 6 * U, 9 * U, 30 * U);
  g.fillStyle = col.fg; g.beginPath(); g.ellipse(0, 2 * U, 8 * U, 7 * U, 0, 0, TAU); g.fill();
  for (let i = 0; i < 4; i++) { const fx = (-5.4 + i * 3.6) * U, top = (-10 + Math.abs(i - 1.5) * 1.4) * U; g.fillRect(fx - 1.4 * U, top, 2.8 * U, 10 * U); g.beginPath(); g.arc(fx, top, 1.4 * U, Math.PI, 0); g.fill(); }
  g.beginPath(); g.ellipse(8.6 * U, 3.4 * U, 2 * U, 4.6 * U, -0.7, 0, TAU); g.fill();
  g.fillStyle = col.bg; for (let i = 0; i < 3; i++) g.fillRect((-3.6 + i * 3.6) * U - 0.35 * U, -7.4 * U, 0.7 * U, 6.4 * U);
  g.restore();
});
// a little beetle seen from the side, walking (dir: the way it faces)
prop('tafBug', (D, x, y, e, dir = 1, sc = 1.3) => {
  const { g, U, col } = D, s = U * sc; g.globalAlpha = 1;
  g.strokeStyle = col.fg; g.lineWidth = D.lw(0.5 * U); g.lineCap = 'round'; g.beginPath();
  for (let i = 0; i < 3; i++) { const lx = x + (i - 1) * 2 * s; g.moveTo(lx, y + 0.4 * s); g.lineTo(lx + Math.sin(e / 40 + i * 2) * 1.1 * s, y + 2.4 * s); }
  g.moveTo(x + dir * 3.8 * s, y - 1 * s); g.lineTo(x + dir * 5.8 * s, y - 3.2 * s); g.stroke();
  g.fillStyle = col.fg; g.beginPath(); g.ellipse(x, y, 3.4 * s, 2.6 * s, 0, Math.PI, TAU); g.fill(); g.fillRect(x - 3.4 * s, y - 0.1 * s, 6.8 * s, 0.9 * s);
  g.beginPath(); g.arc(x + dir * 3.8 * s, y - 0.4 * s, 1.4 * s, 0, TAU); g.fill();
  g.fillStyle = col.acc; g.fillRect(x - 1.6 * s, y - 1.9 * s, 1.1 * s, 1.1 * s); g.fillRect(x + 0.6 * s, y - 1.3 * s, 1.1 * s, 1.1 * s);
});
// a progress bar (p 0..1), under him unless pos says where
prop('tafBar', (D, q, p, pos) => {
  if (q <= 0) return; const { g, U, col } = D, w = 34 * U, h = 3.6 * U, c = pos || D.P(48, 49), x = c.x - w / 2, y = Math.min(c.y, HT - 46 - h);
  alpha(g, q); g.strokeStyle = col.fg; g.lineWidth = D.lw(0.8 * U); g.strokeRect(x, y, w, h);
  g.fillStyle = col.hi; g.fillRect(x + 0.9 * U, y + 0.9 * U, (w - 1.8 * U) * clamp(p, 0, 1), h - 1.8 * U); g.globalAlpha = 1;
});
// a lightning bolt, from (x, y) down (17 * sc face pixels tall)
prop('tafBolt', (D, q, x, y, sc = 1) => {
  if (q <= 0) return; const { g, U, col } = D, s = U * sc; alpha(g, q); g.fillStyle = col.acc; g.beginPath();
  g.moveTo(x + 2 * s, y); g.lineTo(x - 3 * s, y + 9 * s); g.lineTo(x + 0.4 * s, y + 8.6 * s); g.lineTo(x - 2.6 * s, y + 17 * s); g.lineTo(x + 5 * s, y + 6 * s); g.lineTo(x + 1.4 * s, y + 6.4 * s); g.lineTo(x + 4.4 * s, y);
  g.closePath(); g.fill(); g.globalAlpha = 1;
});
// bands of fog drifting across the screen, in front of him
prop('tafFog', (D, e, q) => {
  if (q <= 0) return; const { g, U, col } = D; alpha(g, q); g.fillStyle = col.dim;
  for (let i = 0; i < 5; i++) {
    const y = 96 + i * 72, off = (((e / (30 + i * 7)) * (i % 2 ? 1 : -1) + i * 170) % 260 + 260) % 260;
    for (let j = -1; j < 4; j++) g.fillRect(j * 260 + off, y, 150 + (i * 37) % 60, 1.8 * U);
  }
  g.globalAlpha = 1;
});
// a striped scarf around his chin, its end flapping
prop('tafScarf', (D, e, q) => {
  if (q <= 0) return; const { g, U, col } = D, k = out(q), a = D.P(48 - 20 * k, 46), b = D.P(48 + 20 * k, 46); g.globalAlpha = 1;
  g.strokeStyle = col.acc; g.lineCap = 'round'; g.lineWidth = 4.2 * U; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  g.fillStyle = col.bg; for (let i = -2; i <= 2; i++) { if (Math.abs(i * 7) > 20 * k) continue; const p = D.P(48 + i * 7, 46); g.fillRect(p.x - 0.6 * U, p.y - 2 * U, 1.2 * U, 4 * U); }
  if (k > 0.8) { const t = D.P(60, 47), w = Math.sin(e / 160) * 1.6 * U; g.fillStyle = col.acc; g.beginPath(); g.moveTo(t.x - 2 * U, t.y); g.lineTo(t.x + 2.2 * U, t.y); g.lineTo(t.x + 3 * U + w, Math.min(t.y + 9 * U, HT - 40)); g.lineTo(t.x - 0.6 * U + w, Math.min(t.y + 9.4 * U, HT - 40)); g.closePath(); g.fill(); }
});
// a disco ball coming down in the top right corner, light spots sweeping the room
prop('tafDisco', (D, e, q) => {
  if (q <= 0) return; const { g, U, col } = D, x = 680, y = 48 + 48 * out(q), r = 5.5 * U, t = Math.floor(e / 140); g.globalAlpha = 1;
  g.strokeStyle = col.dim; g.lineWidth = D.lw(0.5 * U); g.beginPath(); g.moveTo(x, 40); g.lineTo(x, y - r); g.stroke();
  g.fillStyle = col.dim; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  for (let i = -2; i <= 1; i++) for (let j = -2; j <= 1; j++) {
    if ((i + 0.5) ** 2 + (j + 0.5) ** 2 > 4.6) continue; const v = ((i * 3 + j * 5 + t) % 4 + 4) % 4; if (v > 1) continue;
    g.fillStyle = v ? col.fg : col.hi; g.fillRect(x + (i * 2.4 + 0.3) * U, y + (j * 2.4 + 0.3) * U, 1.9 * U, 1.9 * U);
  }
  g.globalAlpha = q;
  for (let i = 0; i < 7; i++) { const a = e / 900 + i * 0.9, sx = 400 + Math.cos(a) * (310 - i * 18), sy = 250 + Math.sin(a * 1.3 + i) * 150; g.fillStyle = i % 3 === 0 ? col.hi : i % 3 === 1 ? col.acc : col.pink; g.fillRect(sx - U, sy - U, 2 * U, 2 * U); }
  g.globalAlpha = 1;
});
// a light switch on the wall: on (its toggle up) or off
prop('tafSwitch', (D, q, on, p) => {
  if (q <= 0) return; const { g, U, col } = D, s = U * pop(q), o = keep(p, 7 * s), x = o.x, y = o.y; alpha(g, q);
  g.fillStyle = col.bg; g.strokeStyle = col.fg; g.lineWidth = D.lw(0.9 * U); g.fillRect(x - 4.5 * s, y - 6.5 * s, 9 * s, 13 * s); g.strokeRect(x - 4.5 * s, y - 6.5 * s, 9 * s, 13 * s);
  g.fillStyle = col.dim; g.fillRect(x - 1.8 * s, y - 4 * s, 3.6 * s, 8 * s); g.fillStyle = on ? col.hi : col.fg; g.fillRect(x - 1.8 * s, on ? y - 4 * s : y, 3.6 * s, 4 * s);
  g.globalAlpha = 1;
});
// confetti falling all over the screen
prop('tafConfetti', (D, e, q) => {
  if (q <= 0) return; const { g, U, col } = D; alpha(g, q);
  for (let i = 0; i < 26; i++) {
    const sp = 120 + (i * 37 % 9) * 18, y = 44 + (e / 1000) * sp - (i * 53 % 160); if (y < 44 || y > HT - 44) continue;
    const x = (i * 97 + 31) % 760 + 20 + Math.sin(e / 300 + i) * 14, w = (0.6 + 1.4 * Math.abs(Math.cos(e / 140 + i))) * U;
    g.fillStyle = i % 4 === 0 ? col.acc : i % 4 === 1 ? col.pink : i % 4 === 2 ? col.hi : col.fg; g.fillRect(x - w / 2, y, w, 1.2 * U);
  }
  g.globalAlpha = 1;
});
// a mug of coffee, steaming; sip 0 -> 1 brings it to his mouth
prop('tafCoffee', (D, e, q, sip = 0, pos) => {
  if (q <= 0) return; const { g, U, col } = D, s = U * pop(q), a = pos || D.P(80 - 16 * sip, 44 - 6 * sip), o = keep(a, 7 * s);
  g.save(); g.translate(o.x, o.y); g.rotate(-0.6 * sip); alpha(g, q);
  g.strokeStyle = col.fg; g.lineWidth = D.lw(1 * U); g.beginPath(); g.arc(3.8 * s, 0, 2.1 * s, -Math.PI / 2, Math.PI / 2); g.stroke();
  g.fillStyle = col.fg; g.fillRect(-3.6 * s, -3.6 * s, 7.4 * s, 7.6 * s); g.fillStyle = col.dim; g.fillRect(-2.6 * s, -3.2 * s, 5.4 * s, 1.2 * s);
  g.fillStyle = col.bg; g.fillRect(-1.6 * s, 0, 1.2 * s, 1.2 * s); g.fillRect(0.4 * s, 0, 1.2 * s, 1.2 * s); g.fillRect(-0.6 * s, 1.2 * s, 1.2 * s, 1.2 * s);   // a little heart
  g.restore();
  if (sip < 0.5) for (let i = 0; i < 2; i++) { const t = ((e / 900) + i / 2) % 1; g.globalAlpha = (1 - t) * q; D.ring(o.x + (i ? 1.5 : -1.5) * s + Math.sin(t * 6) * U, o.y - 5 * s - t * 8 * U, (0.8 + t) * U, col.hi, 0.5 * U); }
  g.globalAlpha = 1;
});
// an hourglass: rot turns it over (0 -> PI), then the sand runs down (sand 0 -> 1)
prop('tafHourglass', (D, e, q, rot, sand, p) => {
  if (q <= 0) return; const { g, U, col } = D, s = U * pop(q), w = y => 0.6 * s + Math.abs(y) / (6.4 * s) * 3.4 * s;
  g.save(); g.translate(p.x, p.y); g.rotate(rot >= Math.PI - 0.01 ? 0 : rot); alpha(g, q);
  g.fillStyle = col.acc;
  if (rot < Math.PI - 0.01) { g.beginPath(); g.moveTo(-3.6 * s, 6.2 * s); g.lineTo(3.6 * s, 6.2 * s); g.lineTo(w(2), 2 * s); g.lineTo(-w(2), 2 * s); g.closePath(); g.fill(); }
  else {
    const a = 1 - sand, ys = -0.4 * s - 5.4 * s * a;
    if (a > 0.02) { g.beginPath(); g.moveTo(-w(ys), ys); g.lineTo(w(ys), ys); g.lineTo(0.5 * s, -0.4 * s); g.lineTo(-0.5 * s, -0.4 * s); g.closePath(); g.fill(); }
    g.beginPath(); g.moveTo(-3.6 * s, 6.2 * s); g.lineTo(3.6 * s, 6.2 * s); g.lineTo(0, 6.2 * s - 5 * s * sand); g.closePath(); g.fill();
    if (sand < 1) { g.fillRect(-0.35 * s, 0, 0.7 * s, 6.2 * s - 5 * s * sand); }
  }
  g.strokeStyle = col.fg; g.lineWidth = D.lw(0.8 * U); g.lineJoin = 'round'; g.beginPath();
  g.moveTo(-4 * s, -6.4 * s); g.lineTo(4 * s, -6.4 * s); g.lineTo(0.6 * s, 0); g.lineTo(4 * s, 6.4 * s); g.lineTo(-4 * s, 6.4 * s); g.lineTo(-0.6 * s, 0); g.closePath(); g.stroke();
  g.fillStyle = col.dim; g.fillRect(-5.2 * s, -8.2 * s, 10.4 * s, 1.8 * s); g.fillRect(-5.2 * s, 6.4 * s, 10.4 * s, 1.8 * s);
  g.restore();
});
// a tomato kitchen timer (a pomodoro), ticking
prop('tafTomato', (D, e, q, p) => {
  if (q <= 0) return; const { g, U, col } = D, s = U * pop(q), tick = Math.floor(e / 500);
  g.save(); g.translate(p.x, p.y); g.rotate(e % 500 < 70 ? 0.07 : 0); alpha(g, q);
  g.fillStyle = col.pink; g.beginPath(); g.ellipse(0, 0, 6.6 * s, 5.6 * s, 0, 0, TAU); g.fill();
  g.fillStyle = col.fg; g.fillRect(-3.6 * s, -6.4 * s, 7.2 * s, 1.6 * s); g.fillRect(-0.7 * s, -8.4 * s, 1.4 * s, 2.4 * s); g.fillRect(-5 * s, -5.6 * s, 2 * s, 1.2 * s); g.fillRect(3 * s, -5.6 * s, 2 * s, 1.2 * s);
  g.fillStyle = col.bg; for (let i = 0; i < 8; i++) { const a = i * TAU / 8; g.fillRect(Math.cos(a) * 3.9 * s - 0.5 * s, Math.sin(a) * 3.3 * s - 0.5 * s + 0.6 * s, s, s); }
  const a = tick * TAU / 12 - Math.PI / 2; g.strokeStyle = col.bg; g.lineWidth = D.lw(0.8 * U); g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0.6 * s); g.lineTo(Math.cos(a) * 3 * s, 0.6 * s + Math.sin(a) * 2.6 * s); g.stroke();
  g.fillStyle = col.hi; g.fillRect(-4.6 * s, -2.8 * s, 1.4 * s, 1.4 * s);
  g.restore();
});
// a gold medal on a ribbon, coming down around his chin
prop('tafMedal', (D, e, q) => {
  if (q <= 0) return; const { g, U, col } = D, dy = -(1 - out(q)) * 60 * U, a = D.P(37, 37), b = D.P(59, 37), c = D.P(48, 46); alpha(g, q);
  g.strokeStyle = col.pink; g.lineWidth = 2.6 * U; g.lineCap = 'butt'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(a.x, a.y + dy); g.lineTo(c.x, c.y + dy); g.lineTo(b.x, b.y + dy); g.stroke();
  g.fillStyle = col.acc; g.beginPath(); g.arc(c.x, c.y + dy + 3 * U, 4.6 * U, 0, TAU); g.fill();
  D.star(c.x, c.y + dy + 3 * U, 2.8 * U, col.hi, Math.sin(e / 300) * 0.3); g.globalAlpha = 1;
});
// a rubber stamp: since < 0 it comes down, then « OK » is stamped (slam) and the stamp lifts away
prop('tafStamp', (D, since, q, p) => {
  if (q <= 0) return; const { g, U, col } = D, o = keep(p, 9 * U), x = o.x, y = o.y; alpha(g, q);
  const tool = h => { g.fillStyle = col.dim; g.fillRect(x - 6 * U, y - 4.6 * U - h, 12 * U, 3 * U); g.fillStyle = col.fg; g.fillRect(x - 1.6 * U, y - 10.6 * U - h, 3.2 * U, 6 * U); g.beginPath(); g.arc(x, y - 11.6 * U - h, 3 * U, 0, TAU); g.fill(); };
  if (since < 0) { tool(clamp(-since / 500, 0, 1) * 30 * U); g.globalAlpha = 1; return; }
  const sc = 1 + 0.45 * Math.exp(-since / 70);
  g.save(); g.translate(x, y); g.rotate(-0.14); g.scale(sc, sc); g.strokeStyle = col.acc; g.lineWidth = D.lw(1.1 * U); g.strokeRect(-7.4 * U, -4.6 * U, 14.8 * U, 9.2 * U); g.restore();
  D.glyph('OK', x, y, 7 * U * sc, col.acc);
  if (since < 600) { g.globalAlpha = 1 - since / 600; tool(out(since / 600) * 30 * U); }
  g.globalAlpha = 1;
});
// a STOP sign on its post
prop('tafStop', (D, q, p) => {
  if (q <= 0) return; const { g, U, col } = D, s = U * pop(q), o = keep(p, 8 * s), x = o.x, y = Math.min(o.y, HT - 60 - 10 * s); alpha(g, q);
  g.fillStyle = col.dim; g.fillRect(x - 0.8 * s, y + 6 * s, 1.6 * s, 10 * s);
  g.fillStyle = col.acc; g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(x + Math.cos(a) * 7.4 * s, y + Math.sin(a) * 7.4 * s); } g.closePath(); g.fill();
  if (q > 0.5) D.glyph('STOP', x, y + 0.3 * s, 4.6 * s, col.bg);
  g.globalAlpha = 1;
});
// a sponge scrubbing, with a few soap bubbles
prop('tafSponge', (D, e, x, y) => {
  const { g, U, col } = D; g.save(); g.translate(x, y); g.rotate(0.15 * Math.sin(e / 120)); g.globalAlpha = 1;
  g.fillStyle = col.acc; g.fillRect(-6 * U, -4 * U, 12 * U, 8 * U); g.fillStyle = col.dim; g.fillRect(-6 * U, 2 * U, 12 * U, 2 * U);
  g.fillStyle = col.bg; for (const [a, b] of HOLES) g.fillRect(a * U, b * U, 1.4 * U, 1.2 * U);
  g.restore();
  for (let i = 0; i < 3; i++) { const t = ((e / 700) + i / 3) % 1; g.globalAlpha = 1 - t; D.ring(x + (i - 1) * 5 * U, y - 6 * U - t * 10 * U, (0.8 + t * 1.2) * U, col.hi, 0.5 * U); }
  g.globalAlpha = 1;
});
// a brightness slider (v 0 bottom .. 1 top), a + on top, a − below
prop('tafSlider', (D, q, v, p) => {
  if (q <= 0) return; const { g, U, col } = D, s = U * pop(q), o = keep(p, 14 * s), x = o.x, y = o.y; alpha(g, q);
  g.fillStyle = col.dim; g.fillRect(x - 0.9 * s, y - 10 * s, 1.8 * s, 20 * s);
  g.fillStyle = col.hi; g.fillRect(x - 0.9 * s, y + 10 * s - 20 * s * v, 1.8 * s, 20 * s * v);
  g.fillStyle = col.fg; g.fillRect(x - 3 * s, y + 10 * s - 20 * s * v - 1.4 * s, 6 * s, 2.8 * s);
  D.glyph('+', x, y - 13 * s, 5 * s, col.fg); D.glyph('−', x, y + 13.4 * s, 5 * s, col.fg); g.globalAlpha = 1;
});
// a calendar page, one day blinking
prop('tafCalendar', (D, e, q, p) => {
  if (q <= 0) return; const { g, U, col } = D, s = U * pop(q), o = keep(p, 9 * s), x = o.x - 6.5 * s, y = o.y - 6.5 * s; alpha(g, q);
  g.fillStyle = col.bg; g.strokeStyle = col.fg; g.lineWidth = D.lw(0.8 * U); g.fillRect(x, y, 13 * s, 13 * s); g.strokeRect(x, y, 13 * s, 13 * s);
  g.fillStyle = col.acc; g.fillRect(x, y, 13 * s, 3.4 * s); g.fillStyle = col.fg; g.fillRect(x + 3 * s, y - 1.6 * s, 1.4 * s, 3 * s); g.fillRect(x + 8.6 * s, y - 1.6 * s, 1.4 * s, 3 * s);
  const lit = Math.floor(e / 300) % 2 ? 4 : -1;
  for (let i = 0; i < 9; i++) { g.fillStyle = i === lit ? col.hi : col.dim; g.fillRect(x + (1.4 + (i % 3) * 3.8) * s, y + (4.8 + Math.floor(i / 3) * 2.7) * s, 2.6 * s, 1.8 * s); }
  g.globalAlpha = 1;
});
// a magic wand from p, its star at the tip, sparkles behind it
prop('tafWand', (D, e, q, p) => {
  if (q <= 0) return; const { g, U, col } = D, k = out(q), a0 = e => -1.1 + 0.7 * Math.sin(e / 160), a = a0(e), tx = p.x + Math.cos(a) * 13 * U * k, ty = p.y + Math.sin(a) * 13 * U * k; alpha(g, q);
  g.strokeStyle = col.fg; g.lineWidth = D.lw(1.1 * U); g.lineCap = 'round'; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(tx, ty); g.stroke();
  for (let i = 1; i <= 4; i++) { const b = a0(e - i * 70); D.star(p.x + Math.cos(b) * 13 * U * k + Math.sin(i * 7) * 2 * U, p.y + Math.sin(b) * 13 * U * k + i * 1.2 * U, (1.6 - i * 0.25) * U, i % 2 ? col.acc : col.pink, e / 200 + i); }
  D.star(tx, ty, 3 * U, col.hi, e / 150); g.globalAlpha = 1;
});
// "…": three dots bouncing in a little box (someone is typing)
prop('tafDots', (D, e, q, p) => {
  if (q <= 0) return; const { g, U, col } = D, s = U * pop(q), o = keep(p, 9 * s), x = o.x, y = o.y; alpha(g, q);
  g.fillStyle = col.bg; g.strokeStyle = col.fg; g.lineWidth = D.lw(0.8 * U); g.fillRect(x - 8 * s, y - 3.6 * s, 16 * s, 7.2 * s); g.strokeRect(x - 8 * s, y - 3.6 * s, 16 * s, 7.2 * s);
  g.fillStyle = col.fg; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(x + (i - 1) * 4.4 * s, y - 1.4 * s * Math.max(0, Math.sin(e / 140 - i * 0.9)), 1.2 * s, 0, TAU); g.fill(); }
  g.globalAlpha = 1;
});
// a puddle under him; splash 0 -> 1: drops flying up and falling back
prop('tafPuddle', (D, q, splash = 0, pos) => {
  if (q <= 0) return; const { g, U, col } = D, p = pos || D.P(48, 52), y = Math.min(p.y, HT - 44); alpha(g, q);
  g.fillStyle = col.dim; g.beginPath(); g.ellipse(p.x, y, 26 * U * out(q) * (1 + 0.15 * bump(splash)), 2.6 * U, 0, 0, TAU); g.fill();
  if (splash > 0 && splash < 1) for (let i = 0; i < 6; i++) { const d = (i - 2.5) * 5 * U * splash, h = 16 * U * 4 * (splash - splash * splash) * (0.6 + (i % 3) * 0.22); D.drop(p.x + d * (1 + Math.abs(i - 2.5) * 0.4), y - h, 1.4 * U, col.hi); }
  g.globalAlpha = 1;
});
// a snowball, and its splat (q 0 -> 1)
prop('tafSnowball', (D, x, y, r) => { const { g, col } = D; g.globalAlpha = 1; g.fillStyle = col.hi; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.strokeStyle = col.fg; g.lineWidth = D.lw(r * 0.2); g.stroke(); });
prop('tafSplat', (D, x, y, q) => {
  if (q <= 0 || q >= 1) return; const { g, U, col } = D; g.globalAlpha = 1 - q * q; g.fillStyle = col.hi;
  for (let i = 0; i < 9; i++) { const a = i * TAU / 9 + 0.3, d = (2 + 9 * out(q)) * U; g.fillRect(x + Math.cos(a) * d - 0.8 * U, y + Math.sin(a) * d * 0.8 - 0.8 * U, 1.6 * U, 1.6 * U); }
  g.globalAlpha = 1;
});
// speed lines trailing behind him (dir -1: on his left, he runs right)
prop('tafSpeed', (D, e, q, dir = -1) => {
  if (q <= 0) return; const { g, U, col } = D; g.lineCap = 'round'; g.lineWidth = D.lw(0.9 * U); alpha(g, q);
  for (let i = 0; i < 5; i++) { const a = D.P(dir < 0 ? 4 : 92, 14 + i * 8), l = (7 + 4 * Math.sin(e / 50 + i * 2)) * U * q; g.strokeStyle = i % 2 ? col.dim : col.fg; g.beginPath(); g.moveTo(a.x + dir * 2 * U, a.y); g.lineTo(a.x + dir * (2 * U + l), a.y); g.stroke(); }
  g.globalAlpha = 1;
});
// rocket flames under him
prop('tafFlames', (D, e, q) => {
  if (q <= 0) return; const { g, U, col } = D, b = D.P(48, 49); g.globalAlpha = 1;
  for (let i = -1; i <= 1; i++) {
    const x = b.x + i * 7 * U, l = Math.min((5 + 2.5 * Math.sin(e / 35 + i * 2)) * U * q * (i ? 0.8 : 1.25), HT - 22 - b.y), w = 2.6 * U; if (l <= 0) continue;
    g.fillStyle = col.acc; g.beginPath(); g.moveTo(x - w, b.y); g.lineTo(x, b.y + l); g.lineTo(x + w, b.y); g.closePath(); g.fill();
    g.fillStyle = col.hi; g.beginPath(); g.moveTo(x - w * 0.45, b.y); g.lineTo(x, b.y + l * 0.55); g.lineTo(x + w * 0.45, b.y); g.closePath(); g.fill();
  }
});
// a spotlight above him: a cone of light that opens around him (outside his eyes), a ring of light under him, sparkles
prop('tafSpot', (D, e, q) => {
  if (q <= 0) return; const { g, U, col } = D, c = D.P(48, 52), k = out(q), lx = c.x, ly = 46, by = Math.min(c.y, HT - 44); g.globalAlpha = 1;
  g.strokeStyle = col.dim; g.lineWidth = D.lw(0.6 * U); g.lineCap = 'round'; g.beginPath();
  for (const sd of [-1, 1]) { g.moveTo(lx + sd * 3 * U, ly + 2 * U); g.lineTo(lx + sd * (3 * U + 52 * U * k), ly + (by - ly) * k); }
  g.stroke();
  g.fillStyle = col.acc; g.fillRect(lx - 4 * U, ly - 2 * U, 8 * U, 4 * U);
  if (k > 0.9) { g.strokeStyle = col.hi; g.lineWidth = D.lw(0.8 * U); g.beginPath(); g.ellipse(c.x, by, 44 * U, 2.6 * U, 0, 0, TAU); g.stroke();
    for (let i = 0; i < 4; i++) { const t = ((e / 900) + i / 4) % 1; g.globalAlpha = 1 - t; D.star(c.x + (i - 1.5) * 22 * U, by - 6 * U - t * 18 * U, (1.2 + t) * U, i % 2 ? col.hi : col.acc, e / 300 + i); } g.globalAlpha = 1; }
});
// a clipboard with three boxes; ticks: how many are ticked
prop('tafChecklist', (D, q, ticks, p) => {
  if (q <= 0) return; const { g, U, col } = D, s = U * pop(q), o = keep(p, 10 * s), x = o.x - 6 * s, y = o.y - 7.5 * s; alpha(g, q);
  g.fillStyle = col.bg; g.strokeStyle = col.fg; g.lineWidth = D.lw(0.8 * U); g.fillRect(x, y, 12 * s, 15 * s); g.strokeRect(x, y, 12 * s, 15 * s);
  g.fillStyle = col.acc; g.fillRect(x + 3.5 * s, y - 1.4 * s, 5 * s, 2.6 * s);
  for (let i = 0; i < 3; i++) {
    const by = y + (3.4 + i * 3.8) * s; g.strokeStyle = col.fg; g.lineWidth = D.lw(0.5 * U); g.strokeRect(x + 1.5 * s, by, 2.6 * s, 2.6 * s);
    g.fillStyle = col.dim; g.fillRect(x + 5.4 * s, by + 0.8 * s, 5 * s, 1.1 * s);
    if (i < ticks) { g.strokeStyle = col.hi; g.lineWidth = D.lw(0.8 * U); g.beginPath(); g.moveTo(x + 1.6 * s, by + 1.2 * s); g.lineTo(x + 2.7 * s, by + 2.4 * s); g.lineTo(x + 4.8 * s, by - 0.6 * s); g.stroke(); }
  }
  g.globalAlpha = 1;
});
// a big pixel icon: 'pause', 'plus' or 'rewind'
prop('tafIcon', (D, kind, q, p) => {
  if (q <= 0) return; const { g, U, col } = D, s = U * pop(q), o = keep(p, 8 * s), x = o.x, y = o.y; alpha(g, q); g.fillStyle = col.acc;
  if (kind === 'pause') { g.fillRect(x - 4 * s, y - 5 * s, 3 * s, 10 * s); g.fillRect(x + 1 * s, y - 5 * s, 3 * s, 10 * s); }
  else if (kind === 'plus') { g.fillRect(x - 5 * s, y - 1.4 * s, 10 * s, 2.8 * s); g.fillRect(x - 1.4 * s, y - 5 * s, 2.8 * s, 10 * s); }
  else for (const dx of [-4.5, 0.5]) { g.beginPath(); g.moveTo(x + (dx + 4.5) * s, y - 4.5 * s); g.lineTo(x + dx * s, y); g.lineTo(x + (dx + 4.5) * s, y + 4.5 * s); g.closePath(); g.fill(); }
  g.globalAlpha = 1;
});
// electric zigzags around his head
prop('tafZap', (D, e, q) => {
  if (q <= 0) return; const { g, U, col } = D, c = D.at('c'), f = Math.floor(e / 80); g.lineWidth = D.lw(0.8 * U); g.lineCap = 'round'; g.lineJoin = 'round'; alpha(g, q);
  for (let i = 0; i < 6; i++) {
    if ((f + i) % 3 === 0) continue; const a = -Math.PI / 2 + (i - 2.5) * 0.5, ca = Math.cos(a), sa = Math.sin(a), x0 = c.x + ca * 40 * U, y0 = c.y + sa * 26 * U;
    g.strokeStyle = i % 2 ? col.acc : col.hi; g.beginPath(); g.moveTo(x0, y0);
    for (let j = 1; j <= 3; j++) { const z = (j % 2 ? 1.6 : -1.6) * U; g.lineTo(x0 + ca * j * 2.2 * U - sa * z, y0 + sa * j * 1.8 * U + ca * z); }
    g.stroke();
  }
  g.globalAlpha = 1;
});
// glitch: bars of pixels torn sideways across his face
prop('tafGlitch', (D, e, q) => {
  if (q <= 0) return; const { g, U, col } = D, f = Math.floor(e / 60); g.globalAlpha = 1;
  for (let i = 0; i < 6; i++) { const p = D.P(8 + ((f * 11 + i * 29) % 56), 10 + ((f * 7 + i * 13) % 17) / 17 * 38); g.fillStyle = i % 2 ? col.acc : col.fg; g.fillRect(p.x, p.y, (8 + (i * 9 + f) % 24) * U, 1.3 * U); }
});
// a cloud anywhere on the screen (its centre x, y)
prop('tafCloud', (D, x, y, sc = 1, q = 1, c) => {
  if (q <= 0) return; const { g, U, col } = D, s = U * sc; alpha(g, q); g.fillStyle = c || col.dim;
  for (const [dx, dy, r] of CLOUD) { g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, TAU); g.fill(); }
  g.fillRect(x - 13 * s, y + 1 * s, 27 * s, 4 * s); g.globalAlpha = 1;
});
// the Hue bridge: a box with its round button, waves going up
prop('tafBridge', (D, e, q, p) => {
  if (q <= 0) return; const { g, U, col } = D, s = U * pop(q), o = keep(p, 10 * s), x = o.x, y = o.y; alpha(g, q);
  g.fillStyle = col.fg; g.fillRect(x - 7 * s, y - 2.6 * s, 14 * s, 5.2 * s); g.fillStyle = Math.floor(e / 300) % 2 ? col.acc : col.hi; g.beginPath(); g.arc(x, y - 0.2 * s, 1.6 * s, 0, TAU); g.fill();
  const lit = Math.floor(e / 220) % 4; g.lineWidth = D.lw(0.8 * U); g.lineCap = 'round';
  for (let i = 1; i <= 3; i++) { g.strokeStyle = i <= lit ? col.hi : col.dim; g.beginPath(); g.arc(x, y - 3 * s, 2.4 * i * s, -Math.PI * 0.78, -Math.PI * 0.22); g.stroke(); }
  g.globalAlpha = 1;
});
// a weather board: a sun behind a cloud, a few drops
prop('tafBoard', (D, e, q, p) => {
  if (q <= 0) return; const { g, U, col } = D, s = U * pop(q), o = keep(p, 12 * s), x = o.x, y = o.y; alpha(g, q);
  g.fillStyle = col.bg; g.strokeStyle = col.fg; g.lineWidth = D.lw(0.9 * U); g.fillRect(x - 11 * s, y - 8 * s, 22 * s, 16 * s); g.strokeRect(x - 11 * s, y - 8 * s, 22 * s, 16 * s);
  g.fillStyle = col.acc; g.beginPath(); g.arc(x - 3 * s, y - 2.6 * s, 3.4 * s, 0, TAU); g.fill();
  D.tafCloud(x + 2 * s, y + 0.4 * s, 0.42 * s / U, 1, col.fg);
  for (let i = 0; i < 3; i++) D.drop(x + (i - 0.6) * 3.2 * s, y + 5.4 * s + ((e / 300 + i * 0.4) % 1) * 1.2 * s, 0.9 * s, col.hi);
  g.globalAlpha = 1;
});
// his right arm up, the hand at his brow: a salute
prop('tafSalute', (D, q) => {
  if (q <= 0) return; const { g, U, col } = D, k = out(q), sh = D.P(88, 50), el = D.P(92 + 5 * k, 46 - 16 * k), hd = D.P(90 - 10 * k, 46 - 31 * k); g.globalAlpha = 1;
  g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = col.dim; g.lineWidth = 4.6 * U; g.beginPath(); g.moveTo(sh.x, sh.y); g.lineTo(el.x, el.y); g.stroke();
  g.strokeStyle = col.fg; g.lineWidth = 3.4 * U; g.beginPath(); g.moveTo(el.x, el.y); g.lineTo(hd.x, hd.y); g.stroke();
  g.fillStyle = col.fg; g.beginPath(); g.ellipse(hd.x, hd.y, 3.8 * U, 1.8 * U, -0.35, 0, TAU); g.fill();
});

/* ---------- the scenes ---------- */
// --- Codex starts a task ---
S('taf-manches', 'Il retrousse ses manches', 'evt', { on: ['codex-start'], w: 2, dur: 3600, anim: [[0, 'fier'], [1500, 'code']], mood: 'fier', init: claim,
  say: [[100, 1500, L('Au boulot !', 'Allez, au taf !', 'On s’y met !', 'C’est parti !')], [1600, 3400, L('Codex, à toi de jouer !', 'Ça va coder sec !', 'Je surveille, promis.', 'Mode travail : ON.')]],
  move: e => { const pump = e < 1500 ? Math.max(0, Math.sin(TAU * e / 500)) : 0, lean = fade(e, 1500, 1900, 3000, 3600);
    return { sy: 1 + 0.08 * pump, sx: 1 - 0.05 * pump, y: 8 * pump + 12 * lean, s: 1 - 0.04 * lean }; },
  props: (D, e) => D.tafSleeves(fade(e, 0, 300, 3200, 3600), seg(e, 200, 1300), e < 1500 ? Math.max(0, Math.sin(TAU * e / 500)) : 0.3) });
S('taf-clavier', 'Le clavier fou', 'evt', { on: ['codex-start'], w: 2, dur: 3800, anim: [[0, 'curieux'], [700, 'code']], mood: 'reflechit', init: claim,
  say: [[200, 1800, L('Tac tac tac…', 'Je code, je code !', 'Clavier, en avant !', 'Codex et moi, on tape !')], [1900, 3600, L('Mode turbo !', 'Plus vite, plus vite !', 'Ça chauffe, là !', 'Qui a dit lent ?')]],
  move: e => { const k = fade(e, 300, 800, 3200, 3800), t = e > 700 && e < 3300 ? Math.sin(e / (e < 1900 ? 45 : 28)) : 0; return { y: 14 * k + 3 * t * k, s: 1 - 0.08 * k, r: 0.02 * t * k }; },
  props: (D, e) => { D.tafKeyboard(e, fade(e, 200, 700, 3300, 3800), e < 1900 ? 110 : 50); if (e > 1900 && e < 3300) D.sweat(e); } });
S('taf-cafe', 'Le café du codeur', 'evt', { on: ['codex-start'], dur: 4000, anim: [[0, 'content'], [1800, 'surpris'], [2300, 'code']], mood: 'content', init: claim,
  say: [[200, 1700, L('Un café d’abord !', 'Carburant : chargé.', 'Une petite tasse…', 'Pas de code sans café.')], [1900, 3800, L('Bzzz ! Au boulot !', 'Caféine : 100 % !', 'Je vibre de partout !', 'Je suis réveillé, là !')]],
  move: e => { if (e < 1800) { const sip = bump(seg(e, 600, 1600)); return { r: -0.1 * sip, y: -4 * sip }; } const k = 1 - seg(e, 3200, 3900); return { x: 5 * Math.sin(e / 21) * k, y: 3 * Math.cos(e / 17) * k, sy: 1 + 0.1 * bump(seg(e, 1800, 2200)) }; },
  props: (D, e) => { if (e < 2000) D.tafCoffee(e, fade(e, 0, 300, 1700, 2000), bump(seg(e, 600, 1600))); else D.tafZap(e, 1 - seg(e, 3100, 3700)); } });
S('taf-fusee', 'Décollage', 'evt', { on: ['codex-start'], dur: 4200, anim: [[0, 'reflechit'], [2000, 'etoiles'], [3300, 'code']], mood: 'excite', init: claim,
  say: [[100, 650, L('3…')], [700, 1250, L('2…')], [1300, 1900, L('1…')], [1950, 2300, L('Décollage !', 'Allumage !', 'Feu !')], [3500, 4150, L('Houston, ça code.', 'Codex, en orbite !', 'Mission lancée !')]],
  move: e => { const cr = sm(seg(e, 0, 1900)) * (1 - seg(e, 1900, 2050)), sh = e < 2000 ? 2 * Math.sin(e / 18) * seg(e, 600, 1900) : 0, up = e < 2000 ? 0 : -70 * out(seg(e, 2000, 2500)) * (1 - sm(seg(e, 2900, 3700))), land = bump(seg(e, 3600, 3950)), lift = bump(seg(e, 2000, 2600));
    return { y: 18 * cr + up + 10 * land, x: sh, sy: 1 - 0.14 * cr + 0.12 * lift - 0.12 * land, sx: 1 + 0.08 * cr - 0.05 * lift + 0.08 * land }; },
  props: (D, e) => { if (e > 900 && e < 3400) D.tafFlames(e, e < 2000 ? 0.4 : 1 - seg(e, 2900, 3400)); } });

// --- Codex succeeded ---
S('taf-bravo', 'Bravo Codex', 'evt', { on: ['codex-ok'], w: 2, dur: 3800, anim: [[0, 'succes'], [2200, 'etoiles']], mood: 'excite', init: claim,
  say: [[150, 1900, L('Ça marche !', 'Ça compile !', 'Victoire !', 'Yesss !')], [2000, 3600, L('Bravo Codex !', 'Zéro bug !', 'Trop forts, nous !', 'Du beau travail !')]],
  move: e => ({ y: e < 2700 ? jumps(e, 450, 26) : 0, sy: 1 + 0.06 * Math.sin(e / 70) * (1 - seg(e, 2300, 2700)) }),
  props: (D, e) => { D.tafCheck(fade(e, 0, 500, 3300, 3800), D.P(86, 18), 6); D.tafConfetti(e, 1 - seg(e, 3200, 3800)); } });
S('taf-pouce', 'Pouce levé', 'evt', { on: ['codex-ok'], dur: 2800, anim: [[0, 'content'], [600, 'clin-oeil']], mood: 'content', init: claim,
  say: [[200, 2600, L('Nickel !', 'Impeccable !', 'Du travail propre.', 'Comme sur des roulettes !', 'Au top, Codex !')]],
  move: e => { const k = fade(e, 0, 350, 2200, 2800); return { x: -40 * k, r: -0.08 * k, y: -6 * bump(seg(e, 500, 900)) }; },
  props: (D, e) => D.tafThumb(fade(e, 200, 600, 2300, 2800), D.P(86, 32)) });
S('taf-victoire', 'La danse de la victoire', 'evt', { on: ['codex-ok'], dur: 4600, anim: [[0, 'rire'], [800, 'danse'], [3800, 'fier']], mood: 'excite', init: claim,
  say: [[200, 2200, L('Danse de la victoire !', 'On a réussi !', 'Ouais ouais ouais !')], [2400, 4400, L('Codex, t’es un champion !', 'Personne ne nous arrête !', 'Champions du code !')]],
  move: e => { const k = 1 - sm(seg(e, 3600, 4400)), ph = e / 300; return { x: 60 * Math.sin(ph * 0.5) * k, y: -14 * Math.abs(Math.sin(ph)) * k, r: 0.18 * Math.sin(ph * 0.5) * k + TAU * sm(seg(e, 2600, 3200)), f: Math.sin(ph * 0.5) < 0 && k > 0.5 }; },
  props: (D, e) => { D.notes(e); if (e > 2600 && e < 4300) D.stars(e - 2600); } });
S('taf-medaille', 'La médaille d’or', 'evt', { on: ['codex-ok'], dur: 3600, anim: [[0, 'surpris'], [900, 'fier']], mood: 'fier', init: claim,
  say: [[200, 1700, L('Une médaille ?', 'Pour moi ?', 'Oh ! De l’or !')], [1800, 3400, L('Médaille d’or du code !', 'Je suis fier de nous.', 'Merci, merci !', 'Premier prix !')]],
  move: e => { const puff = fade(e, 900, 1500, 2900, 3600); return { sx: 1 + 0.08 * puff, sy: 1 + 0.1 * puff, y: 6 * puff, r: -0.04 * puff }; },
  props: (D, e) => { D.tafMedal(e, fade(e, 0, 900, 3200, 3600)); if (e > 1200 && e < 3000) D.stars(e - 1200); } });
S('taf-tampon', 'Validé !', 'evt', { on: ['codex-ok'], dur: 2800, anim: [[0, 'curieux'], [700, 'surpris'], [1100, 'fier']], mood: 'fier', init: claim,
  say: [[800, 2600, L('Validé !', 'Approuvé !', 'Tamponné !', 'Bon pour la prod !')]],
  move: e => { const hit = e > 700 ? Math.exp(-(e - 700) / 180) * Math.cos((e - 700) / 40) : 0; return { y: 12 * hit - 10 * fade(e, 0, 300, 500, 700), sy: 1 - 0.1 * hit, sx: 1 + 0.06 * hit, x: 4 * hit }; },
  props: (D, e) => D.tafStamp(e - 700, 1 - seg(e, 2400, 2800), D.P(84, 34)) });

// --- Codex failed ---
S('taf-facepalm', 'Facepalm', 'evt', { on: ['codex-fail'], w: 2, dur: 4000, anim: [[0, 'surpris'], [500, 'erreur'], [2400, 'triste']], mood: 'confus', init: claim,
  say: [[600, 2300, L('Oh non…', 'Sérieux ?', 'Aïe aïe aïe…', 'Pas possible…')], [2400, 3800, L('On va y arriver.', 'Pas grave, on recommence !', 'Ça arrive aux meilleurs.')]],
  move: e => { const hit = e > 500 ? Math.exp(-(e - 500) / 220) * Math.cos((e - 500) / 55) : 0, sag = fade(e, 800, 1800, 3200, 4000); return { r: -0.1 * hit + 0.06 * sag, y: 6 * hit + 14 * sag, sx: 1 + 0.06 * hit }; },
  props: (D, e) => { D.tafHand(fade(e, 250, 500, 2300, 2700)); D.tafCross(fade(e, 900, 1200, 3500, 4000), D.P(86, 16), 4.5); } });
const BUG = e => (e < 2600 ? { x: 720 - 420 * seg(e, 0, 2600) + 8 * Math.sin(e / 90), y: 412 + 2 * Math.sin(e / 60), dir: -1 }
  : e < 3300 ? { x: 300 + 2 * Math.sin(e / 20), y: 412, dir: -1 } : { x: 300 + 620 * inn(seg(e, 3300, 4200)), y: 412 - 4 * Math.abs(Math.sin(e / 50)), dir: 1 });
S('taf-bug', 'La chasse au bug', 'evt', { on: ['codex-fail'], w: 2, dur: 4600, side: true, anim: [[0, 'bug'], [900, 'curieux'], [2500, 'colere'], [3300, 'surpris'], [3800, 'rire']], mood: 'confus', init: claim,
  say: [[200, 1500, L('Un bug !', 'Là ! Un bug !', 'Une bestiole !')], [1600, 3200, L('Viens là, toi !', 'Je vais t’écraser !', 'Bouge pas…')], [3400, 4500, L('Il s’est enfui…', 'Raté !', 'Il reviendra…')]],
  move: e => { const b = BUG(Math.min(e, 3300)), k = fade(e, 300, 900, 3600, 4600), jump = e > 2600 && e < 3000 ? -50 * bump(seg(e, 2600, 3000)) : 0, land = bump(seg(e, 3000, 3300));
    return { x: (b.x - 400) * 0.3 * k, y: (24 + jump + 14 * land) * k, s: 1 - 0.12 * k, sy: 1 - 0.18 * land, sx: 1 + 0.12 * land }; },
  props: (D, e) => { if (e > 300 && e < 4200) { const b = BUG(e); D.tafBug(b.x, b.y, e, b.dir); } if (e < 800) D.tafGlitch(e, 1 - seg(e, 600, 800)); } });
S('taf-console', 'Il console Codex', 'evt', { on: ['codex-fail'], dur: 4400, anim: [[0, 'triste'], [2000, 'amoureux']], mood: 'triste', init: claim,
  say: [[200, 2000, L('Oh… ça a raté.', 'Mince, une erreur…', 'Ça n’a pas marché…')], [2100, 4200, L('C’est pas ta faute.', 'Un câlin pour Codex ?', 'On réessaie ensemble ?', 'Courage, on y est presque !')]],
  move: e => { const sad = fade(e, 0, 600, 1800, 2300), hug = fade(e, 2000, 2500, 3700, 4400); return { y: 18 * sad, s: 1 - 0.06 * sad + 0.05 * hug, r: 0.06 * Math.sin(e / 260) * hug }; },
  props: (D, e) => { if (e < 2100) D.tear('el', seg(e, 300, 2000)); else D.hearts(e - 2100, 1); } });
S('taf-plantage', 'Le plantage', 'evt', { on: ['codex-fail'], dur: 4600, anim: [[0, 'bug'], [700, 'panique'], [1500, 'confus'], [3200, 'reveil'], [4000, 'content']], mood: 'surpris', init: claim,
  say: [[100, 1400, L('Plantage !', 'Crash !', 'Erreur fatale !', 'Ça a tout cassé !')], [1600, 3100, L('Moral introuvable…', 'Je suis par terre…', 'Écran bleu, là…')], [3300, 4500, L('Rien de cassé !', 'Je reboote…', 'Allez, on se relève !')]],
  move: e => { const fall = out(seg(e, 600, 1100)) * (1 - sm(seg(e, 3100, 3800))), gl = e < 700 ? (Math.floor(e / 70) % 3 - 1) * 8 : 0, bo = bump(seg(e, 1100, 1350)) * 0.14;
    return { r: (1.3 - bo) * fall, y: 66 * fall - 20 * bump(seg(e, 3700, 4100)), x: gl + 40 * fall, sy: 1 - 0.1 * bump(seg(e, 4000, 4300)) }; },
  props: (D, e) => { if (e < 900) D.tafGlitch(e, 1 - seg(e, 700, 900)); if (e > 1200 && e < 3200) D.dizzy(e, fade(e, 1200, 1400, 2900, 3200)); } });
S('taf-croix', 'Non non non', 'evt', { on: ['codex-fail'], dur: 2800, anim: [[0, 'erreur']], mood: 'confus', init: claim,
  say: [[150, 2600, L('Non non non !', 'Ça a raté…', 'Oups…', 'Erreur, erreur !', 'Pas comme ça !')]],
  move: e => { const k = seg(e, 0, 200) * (1 - seg(e, 1800, 2400)); return { x: 22 * Math.sin(e / 70) * k, r: 0.07 * Math.sin(e / 70) * k }; },
  props: (D, e) => D.tafCross(fade(e, 0, 400, 2300, 2800), D.P(86, 18), 6) });
S('taf-loupe', 'Chercher l’erreur', 'evt', { on: ['codex-fail'], dur: 4600, anim: [[0, 'recherche'], [3200, 'idee']], mood: 'reflechit', init: claim,
  say: [[200, 1600, L('Voyons voir…', 'Où est l’erreur ?', 'Mmh, suspect…')], [1700, 3100, L('Pas ici…', 'Ni là…', 'Ligne 42 ?', 'Ce n’est pas moi !')], [3300, 4400, L('Trouvé ! Enfin… je crois.', 'Une virgule ! Bien sûr !', 'Un point-virgule oublié !')]],
  move: e => { const k = fade(e, 0, 400, 3000, 3500); return { x: 70 * Math.sin(e / 520) * k, y: 16 * k + 4 * Math.sin(e / 130) * k - 20 * bump(seg(e, 3200, 3700)), s: 1 + 0.08 * k, r: -0.05 * Math.sin(e / 520) * k }; },
  props: (D, e) => { if (e > 3200) D.thought('ampoule', fade(e, 3200, 3500, 4200, 4600)); } });

// --- the timer starts ---
S('taf-tomate', 'Mode tomate', 'evt', { on: ['timer-start'], w: 2, dur: 3400, anim: [[0, 'idee'], [1200, 'fier']], mood: 'fier', init: claim,
  say: [[150, 1700, L('Mode tomate !', 'Pomodoro lancé !', 'Top chrono !', 'Le minuteur tourne !')], [1800, 3200, L('Concentration !', 'Au travail, toi !', 'Je compte pour toi.', 'Pas de distraction !')]],
  move: e => ({ y: 10 * bump(seg(e, 0, 500)), r: 0.05 * Math.sin(e / 160) * fade(e, 1200, 1500, 2800, 3200) }),
  props: (D, e) => D.tafTomato(e, fade(e, 0, 400, 3000, 3400), keep(D.P(86, 20), 48)) });
S('taf-sablier', 'Le sablier', 'evt', { on: ['timer-start'], dur: 3400, anim: [[0, 'curieux'], [1300, 'rire'], [2200, 'content']], mood: 'content', init: claim,
  say: [[200, 1300, L('Tic tac…', 'Le temps file !', 'Le sablier !')], [1500, 3200, L('Chrono lancé !', 'Hop, retourné !', 'C’est parti, mon kiki !', 'Chaque grain compte !')]],
  move: e => ({ r: TAU * sm(seg(e, 1000, 1700)), y: -26 * bump(seg(e, 1000, 1700)) }),
  props: (D, e) => D.tafHourglass(e, fade(e, 0, 300, 3000, 3400), Math.PI * sm(seg(e, 1000, 1700)), seg(e, 1700, 3400), { x: 684, y: 220 }) });
S('taf-marques', 'À vos marques', 'evt', { on: ['timer-start'], dur: 3600, anim: [[0, 'reflechit'], [1900, 'etoiles'], [2900, 'content']], mood: 'excite', init: claim,
  say: [[100, 900, L('À vos marques…')], [1000, 1800, L('Prêts…')], [1900, 3400, L('Partez !', 'Go go go !', 'C’est parti !', 'Fonce !')]],
  move: e => { const cr = sm(seg(e, 0, 900)) * (1 - seg(e, 1900, 2000)), sh = e > 1000 && e < 1900 ? 2.5 * Math.sin(e / 15) : 0, dash = e < 1900 ? 0 : out(seg(e, 1900, 2250)) * (1 - sm(seg(e, 2500, 3300)));
    return { y: 20 * cr, sy: 1 - 0.16 * cr, sx: 1 + 0.08 * cr + 0.1 * dash, x: sh + 180 * dash, r: 0.12 * cr - 0.1 * dash }; },
  props: (D, e) => { if (e > 1900 && e < 3000) D.tafSpeed(e, fade(e, 1900, 2000, 2600, 3000), -1); } });
S('taf-discret', 'Il se fait discret', 'evt', { on: ['timer-start'], dur: 4000, side: true, anim: [[0, 'timide'], [1200, 'idle-sourit'], [3000, 'clin-oeil']], mood: 'amoureux', init: claim,
  say: [[300, 1600, L('Chut…', 'Je me fais petit…', 'Pas un bruit…')], [1700, 3000, L('Travaille bien !', 'Je ne dérange pas.', 'Je suis une souris.')], [3100, 3900, L('Courage !', 'Tu gères !')]],
  move: e => { const k = sm(seg(e, 0, 1200)) * (1 - sm(seg(e, 3000, 4000))), tip = e < 1200 ? Math.abs(Math.sin(e / 90)) : 0; return { x: 200 * k, y: 120 * k - 6 * tip * k, s: 1 - 0.55 * k, r: 0.04 * Math.sin(e / 400) * k }; } });

// --- the timer rings ---
S('taf-driiing', 'Driiing !', 'evt', { on: ['timer-done'], w: 2, dur: 3600, anim: [[0, 'surpris'], [1800, 'etoiles']], mood: 'surpris', init: claim,
  say: [[100, 1700, L('Driiing !', 'DRIIIING !', 'Ding ding ding !', 'Dring dring !')], [1800, 3400, L('C’est l’heure !', 'Le temps est écoulé !', 'Fini ! Bravo !', 'Temps écoulé, champion !')]],
  move: e => { const k = 1 - seg(e, 1400, 1800); return { x: 7 * Math.sin(e / 16) * k, y: 8 * Math.abs(Math.sin(e / 45)) * k + jumps(Math.max(0, e - 1800), 500, 24) * (1 - seg(e, 2800, 3000)) }; },
  props: (D, e) => D.tafAlarm(e, fade(e, 0, 250, 3200, 3600), e < 1800 ? 1 : 0) });
S('taf-sursaut', 'Le réveil en sursaut', 'evt', { on: ['timer-done'], dur: 4400, anim: [[0, 'idle-somnole'], [1300, 'surpris'], [2600, 'timide']], mood: 'surpris', init: claim,
  say: [[200, 1200, L('Zzz…', 'Ronpchhh…')], [1300, 2500, L('HEIN ?!', 'QUOI ?!', 'AU FEU !')], [2600, 4200, L('Ah… c’est le minuteur.', 'Je dormais pas, hein !', 'Le temps est écoulé !')]],
  move: e => { const doze = sm(seg(e, 0, 1000)) * (1 - seg(e, 1300, 1400)), jump = e > 1300 ? -90 * out(seg(e, 1300, 1600)) * (1 - inn(seg(e, 1600, 2000))) : 0, land = bump(seg(e, 2000, 2300));
    return { y: 16 * doze + jump + 14 * land, r: 0.06 * doze, sy: 1 - 0.18 * land + 0.14 * bump(seg(e, 1300, 1700)), sx: 1 + 0.12 * land }; },
  props: (D, e) => { if (e < 1300) D.zzz(e, 0.8); else D.tafAlarm(e, fade(e, 1250, 1350, 4000, 4400), e < 2600 ? 1 : 0, { x: 120, y: 372 }); } });
S('taf-pause', 'La pause méritée', 'evt', { on: ['timer-done'], dur: 4400, anim: [[0, 'fier'], [1600, 'idle-etire'], [3400, 'content']], mood: 'content', init: claim,
  say: [[200, 1600, L('Temps écoulé !', 'Et voilà, fini !', 'Mission terminée !')], [1700, 4200, L('Une pause ?', 'Va boire un verre d’eau !', 'Étire-toi un peu !', 'Bien joué, toi !')]],
  move: e => { const st = bump(seg(e, 1600, 3300)); return { sy: 1 + 0.2 * st, sx: 1 - 0.08 * st, y: -6 * st }; },
  props: (D, e) => { D.tafCheck(fade(e, 0, 400, 1500, 1800), D.P(86, 18), 5); if (e > 1600) D.tafCoffee(e, fade(e, 1700, 2100, 4000, 4400), 0, { x: 676, y: 336 }); } });
const CLOCK = e => {                                 // the runaway alarm clock: it hops along the bottom, then lands on his head
  if (e < 3400) return { x: 400 + 280 * Math.sin(e / 520 + 0.6), y: 392 - 46 * Math.abs(Math.sin(e / 170)), head: 0 };
  const q = seg(e, 3400, 3800); return { x: 400 + 280 * Math.sin(3400 / 520 + 0.6) * (1 - q), y: 392 - 46 * Math.abs(Math.sin(3400 / 170)) * (1 - q) - 250 * bump(q) * 0.6, head: q };
};
S('taf-reveil-fou', 'Le réveil fou', 'evt', { on: ['timer-done'], dur: 4800, side: true, anim: [[0, 'surpris'], [800, 'curieux'], [3800, 'rire']], mood: 'surpris', init: claim,
  say: [[100, 1400, L('Driiing !', 'Il sonne !', 'Dring dring !')], [1500, 3400, L('Reviens ici !', 'Il s’enfuit !', 'Attrape-le !')], [3900, 4500, L('Chut !', 'Attrapé !', 'Silence !')]],
  move: e => { const c = CLOCK(Math.min(e, 3400)), k = fade(e, 400, 900, 4400, 4800), z = fade(e, 0, 600, 4400, 4800); return { x: (c.x - 400) * 0.22 * k, r: (c.x - 400) * 0.0003 * k, y: -10 * bump(seg(e, 3600, 3900)) + 34 * z, s: 1 - 0.16 * z }; },
  props: (D, e) => { const c = CLOCK(e), t = D.at('top'), on = c.head >= 1 || e > 3800; D.tafAlarm(e, 1 - seg(e, 4500, 4800), e < 3800 ? 1 : 0, on ? { x: t.x, y: t.y - 6 * D.U } : c.head > 0 ? { x: c.x + (t.x - c.x) * c.head, y: c.y + (t.y - 6 * D.U - c.y) * c.head } : c); } });

// --- the lights change ---
S('taf-ebloui', 'Ébloui', 'evt', { on: ['lights-change'], w: 2, dur: 4200, anim: [[0, 'surpris'], [800, 'clin-oeil'], [2300, 'fier']], mood: 'surpris', init: claim,
  say: [[100, 2200, L('Waouh, ça éclaire !', 'Mes yeux !', 'Trop de lumière !', 'Ouh, ça brille !')], [2400, 4000, L('C’est mieux.', 'Classe, non ?', 'Je suis prêt.', 'La classe.')]],
  move: e => { const back = fade(e, 0, 300, 1600, 2200); return { y: 12 * back, s: 1 - 0.08 * back, x: -10 * back, r: -0.06 * back + 0.06 * fade(e, 2300, 2700, 3500, 4200) }; },
  props: (D, e) => { D.tafRays(e, fade(e, 0, 200, 1800, 2400)); if (e > 2000) D.tafShades(fade(e, 2000, 2500, 3800, 4200)); } });
S('taf-disco', 'Disco', 'evt', { on: ['lights-change'], dur: 4800, anim: [[0, 'surpris'], [700, 'danse'], [4000, 'content']], mood: 'excite', init: claim,
  say: [[200, 2000, L('Disco !', 'Oh, joli !', 'Ambiance boîte de nuit !', 'Ça, c’est de la lumière !')], [2200, 4600, L('Tout le monde danse !', 'Boogie !', 'On enflamme la piste !', 'Je suis le roi du disco !')]],
  move: e => { const k = fade(e, 600, 900, 3800, 4600), b = e / 230; return { y: 26 * k - 14 * Math.abs(Math.sin(b)) * k, s: 1 - 0.14 * k, x: (-40 + 50 * Math.sin(b / 2)) * k, r: 0.15 * Math.sin(b / 2) * k }; },
  props: (D, e) => { D.tafDisco(e, fade(e, 0, 600, 4100, 4800)); if (e > 700 && e < 4000) D.notes(e); } });
S('taf-ampoule', 'L’ampoule', 'evt', { on: ['lights-change'], dur: 3200, anim: [[0, 'curieux'], [1400, 'idee'], [2400, 'content']], mood: 'ecoute', init: claim,
  say: [[200, 1300, L('Ça clignote ?', 'Tiens, la lumière…', 'Hein ?')], [1400, 3000, L('Oh, joli !', 'Quelle belle lumière !', 'Ça change tout !', 'Lumière !')]],
  move: e => { const k = sm(seg(e, 0, 500)) * (1 - sm(seg(e, 2600, 3200))); return { x: 20 * k, r: 0.08 * k, y: 10 * bump(seg(e, 1400, 1800)) }; },
  props: (D, e) => D.tafBulb(e, fade(e, 0, 300, 2900, 3200), e > 1400 || (e > 400 && e % 260 < 120), D.P(86, 14)) });
S('taf-projecteur', 'Sous les projecteurs', 'evt', { on: ['lights-change'], dur: 4000, anim: [[0, 'timide'], [1200, 'fier'], [3000, 'clin-oeil']], mood: 'fier', init: claim,
  say: [[200, 1400, L('Un projecteur ?', 'C’est pour moi ?', 'Tous les yeux sur moi !')], [1500, 3800, L('Merci, merci !', 'Je suis une star !', 'Pas de photos !', 'Mon public !')]],
  move: e => { const bow = bump(seg(e, 1500, 2300)) + bump(seg(e, 2400, 3000)) * 0.7; return { y: 24 * bow, sy: 1 - 0.1 * bow, s: 1 + 0.03 * fade(e, 0, 600, 3200, 4000) }; },
  props: (D, e) => D.tafSpot(e, fade(e, 0, 500, 3500, 4000)) });

// --- the weather changes (data.kind) ---
S('taf-soleil', 'Lunettes de soleil', 'evt', { on: ['weather'], when: d => d.kind === 'soleil', w: 2, dur: 3800, anim: [[0, 'surpris'], [900, 'fier'], [2600, 'clin-oeil']], mood: 'fier', init: claim,
  say: [[150, 1600, L('Du soleil !', 'Il fait beau !', 'Le soleil est là !')], [1700, 3600, L('Lunettes : ON.', 'Trop cool.', 'Classe, hein ?', 'On sort ?')]],
  move: e => { const cool = fade(e, 900, 1300, 3200, 3800); return { r: -0.08 * cool, y: 10 * bump(seg(e, 0, 400)), x: 8 * Math.sin(e / 300) * cool }; },
  props: (D, e) => { D.sun(e, fade(e, 0, 400, 3400, 3800)); D.tafShades(fade(e, 500, 1000, 3300, 3800)); } });
S('taf-soleil-danse', 'La danse du soleil', 'evt', { on: ['weather'], when: d => d.kind === 'soleil', dur: 3800, anim: [[0, 'etoiles'], [600, 'chante'], [3200, 'content']], mood: 'excite', init: claim,
  say: [[200, 1800, L('Soleil, soleil !', 'Vive le beau temps !', 'Il fait tout beau !')], [1900, 3600, L('♪ Le soleil a rendez-vous…', '♪ Lalala, soleil !', 'On sort jouer ?')]],
  move: e => ({ y: e < 3000 ? jumps(e, 600, 18) : 0, r: 0.1 * Math.sin(e / 300) * fade(e, 300, 700, 3000, 3600) }),
  props: (D, e) => { D.tafRays(e, fade(e, 0, 400, 3200, 3800)); if (e > 600 && e < 3300) D.notes(e); } });
const NX = e => (e < 1800 ? 0 : 110 * Math.sin((e - 1800) / 420) * (1 - seg(e, 3300, 3700)));   // Pixel dodging the cloud that follows him
S('taf-nuage', 'Le nuage collant', 'evt', { on: ['weather'], when: d => d.kind === 'nuage', w: 2, dur: 4600, side: true, anim: [[0, 'curieux'], [1800, 'boudeur'], [3600, 'confus']], mood: 'ecoute', init: claim,
  say: [[300, 1700, L('Un nuage…', 'Ça se couvre.', 'Tout gris…')], [1800, 3300, L('Il me suit !', 'Va-t’en !', 'Pousse-toi !')], [3500, 4400, L('Bon, tant pis.', 'Collant, va.')]],
  move: e => { const k = fade(e, 0, 600, 3900, 4600); return { y: 70 * k, s: 1 - 0.35 * k, x: NX(e) * k }; },
  props: (D, e) => { const t = D.at('top'), x = 400 + NX(e - 260) * fade(e - 260, 0, 600, 3900, 4600); D.tafCloud(x, t.y - 5 * D.U, 1, fade(e, 200, 700, 4000, 4500)); } });
S('taf-formes', 'Les formes des nuages', 'evt', { on: ['weather'], when: d => d.kind === 'nuage', dur: 4800, anim: [[0, 'idle-haut'], [1000, 'reflechit'], [2600, 'rire'], [3800, 'content']], mood: 'reflechit', init: o => { claim(); o.ic = pick(['pizza', 'coeur']); },
  say: [[700, 2400, L('Ce nuage… un poisson !', 'Regarde, un poisson !', 'Un nuage-poisson !')], [2600, 4500, o => (o.ic === 'pizza' ? pick(['Et lui, une pizza !', 'Une pizza volante !']) : pick(['Et lui, un cœur !', 'Un nuage d’amour !']))]],
  move: e => { const k = fade(e, 0, 700, 4100, 4800); return { y: 44 * k, s: 1 - 0.2 * k, r: -0.05 * k + 0.04 * Math.sin(e / 500) * k }; },
  props: (D, e, p, o) => { const q = fade(e, 0, 600, 4200, 4800); for (let i = 0; i < 3; i++) D.tafCloud(80 + ((e / 30 + i * 260) % 760), 74 + (i % 2) * 18, 0.7 + (i % 2) * 0.2, q);
    if (e > 800 && e < 4400) D.thought(e < 2500 ? 'poisson' : o.ic, fade(e, 800, 1100, 4100, 4400)); } });
S('taf-parapluie', 'Le parapluie', 'evt', { on: ['weather'], when: d => d.kind === 'pluie', w: 2, dur: 4400, side: true, anim: [[0, 'surpris'], [800, 'content'], [2200, 'chante']], mood: 'content', init: claim,
  say: [[400, 2000, L('Il pleut !', 'Hop, parapluie !', 'Pluie en vue !')], [2100, 4200, L('Même pas mouillé !', '♪ Sous la pluie…', 'Bien au sec !', 'Paré pour l’averse !')]],
  move: e => { const k = fade(e, 0, 500, 3800, 4400); return { x: -80 * k, y: 70 * k, s: 1 - 0.28 * k, r: 0.04 * Math.sin(e / 350) * seg(e, 2200, 2600) * k }; },
  props: (D, e) => { const qu = fade(e, 300, 900, 3700, 4200), b = D.P(48, 5), rx = 24 * D.U * out(qu); D.tafUmbrella(qu); D.tafRain(e, fade(e, 0, 300, 3900, 4400), b.x - rx, b.x + rx, b.y - 7 * D.U * out(qu)); if (e > 2200 && e < 3900) D.notes(e); } });
S('taf-flaque', 'La flaque', 'evt', { on: ['weather'], when: d => d.kind === 'pluie', dur: 3400, anim: [[0, 'curieux'], [700, 'etoiles'], [1150, 'rire']], mood: 'excite', init: claim,
  say: [[200, 1100, L('Une flaque !', 'Oh, une flaque…', 'Tentant…')], [1200, 3200, L('Plouf !', 'Splash !', 'Sploutch !', 'Encore, encore !')]],
  move: e => { const t = e - 1150, hop = t > 0 && t < 1800, ph = hop ? t % 600 : 600;
    const k = fade(e, 0, 400, 3000, 3400);
    return { y: 24 * k - 34 * bump(seg(e, 700, 1150)) + (hop ? jumps(t, 600, 16) : 0), s: 1 - 0.12 * k, sy: 1 - (hop ? 0.16 * Math.exp(-ph / 90) : 0) - 0.1 * bump(seg(e, 450, 700)), sx: 1 + (hop ? 0.1 * Math.exp(-ph / 90) : 0) }; },
  props: (D, e) => { const t = e - 1150; D.tafPuddle(fade(e, 0, 400, 3000, 3400), t > 0 && t < 1800 ? (t % 600) / 600 : 0, { x: 400, y: 420 }); D.tafRain(e, fade(e, 0, 300, 3000, 3400) * 0.8); } });
S('taf-echarpe', 'L’écharpe', 'evt', { on: ['weather'], when: d => d.kind === 'neige', w: 2, dur: 4200, anim: [[0, 'surpris'], [700, 'triste'], [2300, 'content']], mood: 'surpris', init: claim,
  say: [[100, 1700, L('Il neige !', 'Brrr !', 'Oh, de la neige !', 'Il fait froid…')], [1800, 4000, L('Vite, mon écharpe !', 'Bien au chaud !', 'Ça va mieux.', 'Tout douillet !')]],
  move: e => { const sh = fade(e, 400, 600, 1800, 2200); return { x: 3 * Math.sin(e / 20) * sh, sy: 1 - 0.04 * sh, y: 6 * sh, r: 0.04 * Math.sin(e / 400) * fade(e, 2300, 2700, 3600, 4200) }; },
  props: (D, e) => { D.snow(e, fade(e, 0, 600, 3600, 4200)); D.tafScarf(e, fade(e, 1800, 2400, 3800, 4200)); } });
const BALL = (e, t) => { const q = seg(e, 0, 650); return { x: -20 + (t.x + 20) * q, y: 190 + (t.y - 190) * q - 90 * bump(q) }; };
S('taf-boule', 'La boule de neige', 'evt', { on: ['weather'], when: d => d.kind === 'neige', dur: 3600, anim: [[0, 'curieux'], [650, 'surpris'], [1700, 'rire'], [2300, 'clin-oeil']], mood: 'surpris', init: claim,
  say: [[700, 1800, L('Hé ! Qui a lancé ça ?', 'Aïe ! Une boule !', 'Pouf !')], [1900, 3400, L('Bataille de boules !', 'À mon tour !', 'Tu vas voir !')]],
  move: e => { const h = e > 650 ? Math.exp(-(e - 650) / 260) : 0, th = bump(seg(e, 2200, 2700)); return { x: 70 * h * Math.cos((e - 650) / 120), r: 0.2 * h - 0.12 * th, y: -10 * th, sx: 1 - 0.1 * h }; },
  props: (D, e) => { D.snow(e, fade(e, 0, 500, 3000, 3600) * 0.7); const t = D.P(14, 26);
    if (e < 650) D.tafSnowball(BALL(e, t).x, BALL(e, t).y, 2.6 * D.U); else D.tafSplat(t.x, t.y, seg(e, 650, 1150));
    if (e > 2400 && e < 3100) { const f = D.P(18, 30), q = seg(e, 2400, 3000); D.tafSnowball(f.x + (-40 - f.x) * q, f.y + (130 - f.y) * q - 70 * bump(q), 2.4 * D.U); } } });
S('taf-orage', 'L’orage', 'evt', { on: ['weather'], when: d => d.kind === 'orage', w: 2, dur: 4400, anim: [[0, 'surpris'], [500, 'panique'], [3100, 'timide']], mood: 'surpris', init: claim,
  say: [[100, 1400, L('Un orage !', 'Boum !', 'Le tonnerre !')], [1500, 3000, L('J’ai peur du tonnerre…', 'Je me cache !', 'Au secours !')], [3100, 4300, L('C’est fini ?', 'Même pas peur.', 'C’était loin… hein ?')]],
  move: e => { const hide = fade(e, 500, 1000, 3100, 4000); return { y: 70 * hide - 22 * bump(seg(e, 300, 520)) - 18 * bump(seg(e, 1500, 1720)), s: 1 - 0.3 * hide, x: 3 * Math.sin(e / 18) * hide }; },
  props: (D, e) => { if (e > 280 && e < 560) D.tafBolt(1, 130, 50, 1.3); if (e > 1480 && e < 1760) D.tafBolt(1, 640, 50, 1.3); if (e > 400 && e < 1000) D.glyph('BOUM !', 170, 196, 6 * D.U, D.col.acc); if (e > 800 && e < 3100) D.sweat(e); } });
S('taf-paratonnerre', 'Le paratonnerre', 'evt', { on: ['weather'], when: d => d.kind === 'orage', dur: 4000, anim: [[0, 'curieux'], [900, 'bug'], [1900, 'recharge'], [3000, 'etoiles']], mood: 'surpris', init: claim,
  say: [[100, 850, L('Tiens, ça gronde…', 'Un orage ?', 'Ça sent l’orage…')], [900, 1900, L('BZZZT !', 'Zap !', 'Bzzzt !!')], [2000, 3800, L('Je suis rechargé !', '100 % de batterie !', 'Ça chatouille !', 'Plein d’énergie !')]],
  move: e => { const z = e > 900 ? 1 - seg(e, 900, 1900) : 0, pump = bump(seg(e, 1900, 3000)); return { x: 6 * Math.sin(e / 12) * z, sy: 1 + (e % 120 < 60 ? 0.06 : -0.04) * z + 0.08 * pump, sx: 1 - 0.04 * pump, y: 4 * z }; },
  props: (D, e) => { const t = D.at('top'); if (e > 880 && e < 1100) D.tafBolt(1, t.x - 3 * D.U, 44, Math.max(0.3, (t.y - 44) / (17 * D.U)));
    if (e > 900 && e < 1900) { D.tafZap(e, 1); D.tafGlitch(e, 1); } if (e > 3000) D.stars(e - 3000); } });
S('taf-brume', 'Dans le brouillard', 'evt', { on: ['weather'], when: d => !KINDS.includes(d && d.kind), dur: 3600, anim: [[0, 'curieux'], [2200, 'confus']], mood: 'ecoute', init: claim,
  say: [[200, 2000, L('On n’y voit rien !', 'Quelle purée de pois !', 'Il y a quelqu’un ?')], [2100, 3400, L('Le temps change…', 'Brouillard en vue.', 'Je vais me perdre !')]],
  move: e => { const k = fade(e, 0, 500, 2900, 3600); return { s: 1 + 0.08 * k, x: 30 * Math.sin(e / 400) * k, y: 6 * k }; },
  props: (D, e) => D.tafFog(e, fade(e, 0, 500, 3000, 3600)) });

// --- you type in the app (every 4 s at most): short and quiet ---
S('taf-tu-ecris', 'Tu m’écris ?', 'evt', { on: ['typing'], w: 2, dur: 2000, anim: [[0, 'ecoute']], mood: 'ecoute',
  say: [[150, 1900, L('Tu m’écris ?', 'Oh, un message ?', 'J’écoute…', 'Je suis tout ouïe !', 'Pour moi ?')]],
  move: e => { const k = fade(e, 0, 350, 1500, 2000); return { y: 14 * k, s: 1 + 0.04 * k, r: 0.06 * k }; } });
S('taf-lit', 'Il lit en douce', 'evt', { on: ['typing'], w: 2, dur: 2300, anim: [[0, 'idle-bas'], [1300, 'idle-sourit']], mood: 'ecoute',
  say: [[1300, 2200, L('Je regarde pas !', 'Moi ? Rien vu.', 'Hmm hmm…', 'Je lis pas, promis.')]],
  move: e => { const k = sm(seg(e, 0, 500)) * (1 - out(seg(e, 1200, 1450))), back = bump(seg(e, 1200, 1500)) * 0.4; return { x: -50 * k, y: 40 * k, r: 0.16 * k, s: 1 + 0.06 * k, sy: 1 - 0.06 * back }; } });
S('taf-imite', 'Il imite', 'evt', { on: ['typing'], dur: 2000, anim: [[0, 'code']], mood: 'reflechit',
  say: [[200, 1900, L('Tac tac tac !', 'Moi aussi je tape !', 'Clic clic clic !', 'On fait la course ?')]],
  move: e => { const k = fade(e, 0, 300, 1600, 2000); return { y: 12 * k + 2 * Math.sin(e / 30) * k, s: 1 - 0.06 * k }; },
  props: (D, e) => D.tafKeyboard(e, fade(e, 0, 300, 1600, 2000), 60) });
S('taf-ailleurs', 'Il fait semblant', 'evt', { on: ['typing'], dur: 2200, anim: [[0, 'idle-regard'], [800, 'idle-haut']], mood: 'neutre',
  say: [[400, 2000, L('♪ Je regarde ailleurs…', 'Je n’écoute pas, hein.', 'Discret, moi ?', 'La la la…')]],
  move: e => { const k = fade(e, 0, 400, 1700, 2200); return { x: 40 * k, r: -0.1 * k, f: k > 0.5, y: 6 * k }; },
  props: (D, e) => { if (e > 500 && e < 1900) D.notes(e); } });
S('taf-points', 'Les trois petits points', 'evt', { on: ['typing'], dur: 1900, anim: [[0, 'idle-incline']], mood: 'ecoute',
  say: [[1100, 1850, L('J’attends…', 'Alors ?', 'Prends ton temps.', 'Et donc ?')]],
  move: e => ({ r: 0.07 * sm(seg(e, 0, 300)) * (1 - sm(seg(e, 1500, 1900))), y: 3 * Math.sin(e / 110) * (1 - seg(e, 1400, 1900)) }),
  props: (D, e) => D.tafDots(e, fade(e, 0, 200, 1600, 1900), D.P(86, 34)) });
const GUESS = { pizza: ['Tu as faim, hein ?', 'Ça parle de pizza ?'], coeur: ['Un mot doux ?', 'C’est pour moi, ça ?'], star: ['Une idée géniale ?', 'Un truc trop bien ?'], poisson: ['Une histoire de poisson ?', 'Glou glou ?'] };
S('taf-devine', 'Il devine', 'evt', { on: ['typing'], dur: 2400, anim: [[0, 'reflechit'], [1300, 'idee']], mood: 'reflechit', init: o => { o.ic = pick(Object.keys(GUESS)); },
  say: [[200, 1200, L('Laisse-moi deviner…', 'Je devine…', 'Hmm…')], [1300, 2300, o => pick(GUESS[o.ic] || GUESS.star)]],
  move: e => ({ r: -0.06 * fade(e, 0, 300, 1100, 1400), y: 10 * bump(seg(e, 1300, 1700)) }),
  props: (D, e, p, o) => D.thought(o.ic, fade(e, 300, 600, 2100, 2400)) });

// --- an action was done (data.name), from the Stream Deck, the phone or a command ---
S('taf-act-interrupteur', 'L’interrupteur', 'evt', { on: ['action'], when: act(/^lights\./), w: 6, dur: 2200, anim: [[0, 'curieux'], [700, 'clin-oeil']], mood: 'content',
  say: [[600, 2100, L('Clic !', 'Clic-clac !', 'Lumières, à vos ordres !', 'C’est moi l’électricien !', 'Interrupteur : OK.')]],
  move: e => ({ x: -30 * fade(e, 0, 400, 1700, 2200), y: -14 * bump(seg(e, 400, 700)) + 8 * bump(seg(e, 700, 900)), sy: 1 - 0.08 * bump(seg(e, 700, 900)) }),
  props: (D, e) => D.tafSwitch(fade(e, 0, 300, 1900, 2200), e > 700, D.P(90, 28)) });
S('taf-act-hue', 'Le pont Hue', 'evt', { on: ['action'], when: act(/^lights\.pair/), w: 12, dur: 3400, anim: [[0, 'connexion'], [2200, 'idee']], mood: 'ecoute',
  say: [[200, 2000, L('Appuie sur le bouton !', 'Le bouton du pont, vite !', 'Le pont Hue, là-bas !')], [2100, 3200, L('Je t’attends…', 'Allez, clic !', 'On va être copains !')]],
  move: e => { const k = fade(e, 0, 500, 2800, 3400); return { x: -60 * k, r: -0.08 * k + 0.03 * Math.sin(e / 120) * k }; },
  props: (D, e) => D.tafBridge(e, fade(e, 200, 600, 3000, 3400), D.P(92, 36)) });
S('taf-act-rab', 'Du rab de temps', 'evt', { on: ['action'], when: act(/^timer\.add/), w: 10, dur: 2400, anim: [[0, 'surpris'], [500, 'fier']], mood: 'fier',
  say: [[200, 2200, L('Du rab de temps !', 'Prolongations !', 'Allez, encore un peu !', 'Plus de temps, chouette !')]],
  move: e => { const st = fade(e, 300, 700, 1600, 2200); return { sy: 1 + 0.14 * st, sx: 1 - 0.06 * st, y: -6 * st }; },
  props: (D, e) => { D.tafIcon('plus', fade(e, 200, 500, 1900, 2300), D.P(88, 14)); D.watch(e, fade(e, 0, 300, 2000, 2400)); } });
S('taf-act-zero', 'Remise à zéro', 'evt', { on: ['action'], when: act(/^timer\.reset/), w: 10, dur: 2400, anim: [[0, 'reflechit'], [1400, 'content']], mood: 'content',
  say: [[200, 1300, L('Rembobinage…', 'On remet à zéro !', 'Retour au début !')], [1400, 2300, L('Tout neuf !', 'Comme avant !', 'C’est reparti à zéro.')]],
  move: e => ({ r: -TAU * sm(seg(e, 200, 1300)), y: -18 * bump(seg(e, 200, 1300)) }),
  props: (D, e) => D.tafIcon('rewind', fade(e, 100, 400, 1300, 1700), { x: 680, y: 210 }) });
S('taf-act-pause', 'Arrêt sur image', 'evt', { on: ['action'], when: act(/^timer\.toggle/), w: 10, dur: 2800, anim: [[0, 'surpris'], [2000, 'rire']], mood: 'surpris',
  say: [[300, 1900, L('Pause !', 'Arrêt sur image !', 'Je ne bouge plus…', 'Pause minuteur !')], [2000, 2700, L('…et ça repart !', 'Hop, j’ai bougé !')]],
  move: e => { const k = out(seg(e, 0, 250)) * (1 - sm(seg(e, 2000, 2600))), fz = e > 250 && e < 2000 && e % 400 < 40 ? 4 : 0; return { x: 26 * k + fz, r: 0.16 * k, y: -10 * k, sy: 1 + 0.05 * k }; },
  props: (D, e) => D.tafIcon('pause', fade(e, 200, 400, 1900, 2100), { x: 680, y: 210 }) });
S('taf-act-stop', 'Stop !', 'evt', { on: ['action'], when: act(/^codex\.stop/), w: 10, dur: 2400, anim: [[0, 'surpris'], [900, 'boudeur']], mood: 'surpris',
  say: [[150, 2200, L('Stop !', 'On arrête tout !', 'Halte-là !', 'Coupez !')]],
  move: e => ({ x: 46 * out(seg(e, 0, 400)) * (1 - sm(seg(e, 1600, 2400))), r: -0.2 * bump(seg(e, 0, 700)), sx: 1 + 0.08 * bump(seg(e, 300, 600)) }),
  props: (D, e) => D.tafStop(fade(e, 100, 400, 2000, 2400), { x: 130, y: 210 }) });
S('taf-act-eponge', 'Coup d’éponge', 'evt', { on: ['action'], when: act(/^codex\.clear/), w: 10, dur: 2600, anim: [[0, 'clin-oeil'], [1900, 'content']], mood: 'content',
  say: [[200, 2400, L('Coup d’éponge !', 'Tout propre !', 'Table rase !', 'Ça brille !')]],
  move: e => ({ x: 6 * Math.sin(e / 90) * fade(e, 200, 400, 1600, 1900), y: -8 * bump(seg(e, 1900, 2300)) }),
  props: (D, e) => { if (e > 150 && e < 1900) { const q = seg(e, 150, 1900), c = D.P(48, 26); D.tafSponge(e, c.x + Math.sin(q * TAU * 1.5) * 26 * D.U, c.y + Math.cos(q * TAU * 3) * 5 * D.U); } else if (e >= 1900) D.stars(e - 1900); } });
S('taf-act-ecran', 'La luminosité', 'evt', { on: ['action'], when: act(/^sys\.bright/), w: 10, dur: 2600, anim: [[0, 'clin-oeil'], [1100, 'surpris'], [1800, 'content']], mood: 'ecoute',
  say: [[200, 2400, L('Ça te va comme ça ?', 'Plus clair ? Plus sombre ?', 'Réglage de l’écran !', 'Mes yeux s’adaptent…')]],
  move: e => { const k = fade(e, 0, 400, 2000, 2600); return { x: -30 * k, s: 1 - 0.06 * k + 0.05 * Math.sin(e / 200) * k }; },
  props: (D, e) => D.tafSlider(fade(e, 0, 300, 2200, 2600), 0.5 + 0.35 * Math.sin(e / 300), D.P(90, 28)) });
S('taf-act-reboot', 'Extinction de l’écran', 'evt', { on: ['action'], when: act(/^sys\.(boot|power)/), w: 10, dur: 4200, anim: [[0, 'fatigue'], [900, 'sommeil'], [2600, 'reveil'], [3600, 'content']], mood: 'endormi',
  say: [[100, 900, L('Extinction des feux…', 'Je fais dodo…', 'Bonne nuit, l’écran !')], [2700, 4100, L('Bip ! Me revoilà !', 'Tout neuf !', 'Redémarrage réussi !')]],
  move: e => { if (e < 2400) { const a = sm(seg(e, 600, 950)), b = sm(seg(e, 950, 1250)); return { sy: 1 + 0.08 * bump(seg(e, 300, 600)) - 0.96 * a, sx: 1 + 0.25 * a - 1.2 * b }; }
    const a = out(seg(e, 2400, 2650)), b = out(seg(e, 2650, 2950)), o = bump(seg(e, 2950, 3300)); return { sx: 0.05 + 1.2 * a - 0.25 * b + 0.06 * o, sy: 0.04 + 0.96 * b - 0.08 * o, y: -10 * o }; },
  props: (D, e) => { const c = D.at('c'); if (e > 1250 && e < 2400) { const r = (1.6 + 0.4 * Math.sin(e / 90)) * D.U * (1 - seg(e, 1900, 2400) * 0.5); D.g.fillStyle = D.col.hi; D.g.beginPath(); D.g.arc(c.x, c.y, r, 0, TAU); D.g.fill(); }
    if (e > 3000) D.tafBar(fade(e, 3000, 3100, 3900, 4200), seg(e, 3000, 3800)); } });
S('taf-act-meteo', 'Monsieur Météo', 'evt', { on: ['action'], when: act(/^weather\./), w: 10, dur: 4200, side: true, anim: [[0, 'salut'], [900, 'parle'], [3200, 'clin-oeil']], mood: 'content',
  say: [[200, 1800, L('Et voici la météo !', 'Bonjour, la météo !', 'Flash météo !')], [1900, 4000, L('À vous les studios !', 'Prends ton pull !', 'Merci de m’écouter !')]],
  move: e => { const k = fade(e, 0, 600, 3500, 4200); return { x: -130 * k, y: 40 * k, s: 1 - 0.22 * k, r: 0.05 * Math.sin(e / 300) * seg(e, 900, 1300) * k }; },
  props: (D, e) => D.tafBoard(e, fade(e, 400, 800, 3600, 4100), { x: 640, y: 300 }) });
S('taf-act-agenda', 'C’est noté', 'evt', { on: ['action'], when: act(/^agenda\./), w: 10, dur: 2800, anim: [[0, 'ecoute'], [1600, 'fier']], mood: 'ecoute',
  say: [[200, 2600, L('C’est noté !', 'Agenda à jour !', 'Je note, je note…', 'Rien ne m’échappe !')]],
  move: e => ({ y: 8 * Math.abs(Math.sin(e / 160)) * fade(e, 200, 400, 1400, 1600), r: 0.05 * fade(e, 0, 300, 2200, 2800), x: -20 * fade(e, 0, 300, 2200, 2800) }),
  props: (D, e) => D.tafCalendar(e, fade(e, 100, 400, 2400, 2800), D.P(90, 30)) });
// any action at all (they also stand back when a specific scene took the frame)
S('taf-act-bipboup', 'Bip boup', 'evt', { on: ['action'], when: act(/^/), dur: 2000, anim: [[0, 'idle-cligne'], [800, 'content']], mood: 'content',
  say: [[200, 1900, L('Bip boup, c’est fait !', 'Bip ! Exécuté.', 'Ordre reçu !', 'Mission accomplie !', 'Bip bip, fait !')]],
  move: e => { const k = 1 - seg(e, 1300, 1400), st = Math.floor(e / 180); return { y: (st % 2 ? -8 : 0) * k, r: (st % 4 === 1 ? 0.07 : st % 4 === 3 ? -0.07 : 0) * k }; } });
S('taf-act-salut', 'À vos ordres', 'evt', { on: ['action'], when: act(/^/), dur: 2400, anim: [[0, 'fier'], [1700, 'clin-oeil']], mood: 'fier',
  say: [[300, 2200, L('À vos ordres !', 'Oui, chef !', 'Bien reçu, chef !', 'Chef, oui chef !')]],
  move: e => { const k = fade(e, 0, 300, 1800, 2400); return { sy: 1 + 0.06 * k, sx: 1 - 0.03 * k, r: -0.05 * k, y: -6 * k }; },
  props: (D, e) => D.tafSalute(fade(e, 100, 500, 1800, 2300)) });
S('taf-act-liste', 'Coché !', 'evt', { on: ['action'], when: act(/^/), dur: 2400, anim: [[0, 'curieux'], [900, 'fier']], mood: 'fier',
  say: [[900, 2300, L('Une tâche de plus !', 'Coché !', 'Et hop, c’est fait !', 'Liste à jour !')]],
  move: e => ({ x: -24 * fade(e, 0, 300, 1900, 2400), y: -12 * bump(seg(e, 900, 1250)) }),
  props: (D, e) => D.tafChecklist(fade(e, 0, 300, 2000, 2400), e > 900 ? 3 : e > 500 ? 2 : 1, D.P(90, 30)) });
S('taf-act-magie', 'Abracadabra', 'evt', { on: ['action'], when: act(/^/), dur: 2600, anim: [[0, 'reflechit'], [900, 'etoiles'], [1900, 'clin-oeil']], mood: 'excite',
  say: [[200, 900, L('Abracadabra…', 'Hocus pocus…')], [1000, 2400, L('Et hop, magie !', 'Tadaaa !', 'Comme par magie !')]],
  move: e => ({ r: TAU * sm(seg(e, 900, 1500)), y: -20 * bump(seg(e, 900, 1500)) }),
  props: (D, e) => { D.tafWand(e, fade(e, 0, 300, 2200, 2600), { x: 660, y: 330 }); if (e > 1300 && e < 2500) D.stars(e - 1300); } });
S('taf-act-pouce', 'Fastoche', 'evt', { on: ['action'], when: act(/^/), dur: 2000, anim: [[0, 'clin-oeil'], [1200, 'content']], mood: 'content',
  say: [[200, 1900, L('C’est fait !', 'Et voilà !', 'Fastoche !', 'Facile !')]],
  move: e => { const k = fade(e, 0, 300, 1500, 2000); return { s: 1 + 0.06 * k, x: 24 * k, r: 0.06 * k }; },
  props: (D, e) => D.tafThumb(fade(e, 150, 450, 1600, 2000), D.P(10, 32), -1) });
});
