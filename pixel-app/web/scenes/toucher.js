/* Scene pack « toucher » — Touch: more reactions when you tap him (calm, love, each zone of his face), pester him or pet him.
   See the top of web/persona.js: scenes are defined with S('id', 'Label', 'group', { ... }) on one line each
   (pixel/scenes.py reads them), groups tap / fache / calin / retour / vie / evt, plus "on" (events) and "pool" (touch pools).
   Every scene here joins a touch pool (persona.js tap() and pet() pick from them):
     calm         a normal tap (group tap)            love          a tap when he loves you, after cuddles (group tap)
     zone:oeil / zone:tete / zone:bouche / zone:cote / zone:ailleurs    where the finger lands (group tap): o.side (-1 left,
                  1 right) and o.tx, o.ty (the finger, from his centre, in px) aim the reaction; played from the lab they are 0
     annoyed      a few taps in a row (group fache)   angry         pestered a lot, still cute (group fache)
     pet          a long press or a stroke (group calin)
   Something moves within the first 150 ms (a touch wants an answer at once), and every scene ends with him back in place.
   The props are solid shapes in the theme's colours, sized in the face's pixel (D.U, or BU on the glass): in Rétro and LCD
   they are drawn on a low-res canvas with an alpha threshold, so no faint lines, and text only through D.glyph. */
(window.PixelScenePacks ||= []).push(({ S, L, pick, sm, out, inn, seg, bump, jumps, clamp, rnd, TAU, W, HT, prop }) => {

/* ---------- small helpers ---------- */
const fin = (e, a, b) => 1 - sm(seg(e, a, b));                                   // 1, then down to 0 between a and b
const io = (e, a, b, c, d) => sm(seg(e, a, b)) * fin(e, c, d);                     // 0 -> 1 (a..b) -> 0 (c..d)
const wob = (e, t0, tau, per) => (e < t0 ? 0 : Math.exp(-(e - t0) / tau) * Math.sin((e - t0) / per));   // a dying wobble
const arcs = (e, list) => { for (const [a, b, h] of list) if (e >= a && e < b) { const f = (e - a) / (b - a); return -4 * h * f * (1 - f); } return 0; };   // hops [from, to, height]
const hit = (e, ts, w) => ts.reduce((s, t) => s + Math.max(0, 1 - Math.abs(e - t) / w), 0);              // 1 at each moment, 0 w ms away
const beat = (e, per = 800) => { const t = e % per; return Math.max(0, 1 - Math.abs(t - 60) / 70) + 0.7 * Math.max(0, 1 - Math.abs(t - 250) / 70); };   // boum-boum
const step = (v, q) => Math.round(v / q) * q;                                      // robot moves
const V = (...ls) => o => { const x = pick(ls); return typeof x === 'function' ? x(o) : x; };   // a slot whose lines may use the scene's data

/* where things are: his eyes and mouth as the pack draws them (its 96 x 54 grid), the glass at rest (screens.js PBOX) */
const EL = [32.5, 25.5], ER = [64.5, 25.5], MO = [48.4, 40];
const eyeOf = o => (o.side < 0 ? EL : ER);
const BU = 7, CX = 400, CY = 239;                                                  // one face pixel at rest, the centre of his box
const SP = (u, v) => ({ x: 64 + u * BU, y: 50 + v * BU });                        // a point of the glass: it does not follow him
const finger = o => (o.tx || o.ty ? { x: o.tx, y: o.ty } : { x: (o.side < 0 ? -1 : 1) * 330, y: -150 });   // the finger, from his centre

/* ---------- drawing ---------- */
const poly = (g, pts, c) => { g.fillStyle = c; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
const gpoly = (D, uv, c) => poly(D.g, uv.map(([u, v]) => { const p = D.P(u, v); return [p.x, p.y]; }), c);   // a shape in his grid: it follows him
const disc = (g, x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, Math.max(0.5, r), 0, TAU); g.fill(); };
const line = (D, a, b, w, c) => { const g = D.g; g.strokeStyle = c; g.lineWidth = D.lw(w); g.lineCap = 'round'; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); };
const sparkle = (g, x, y, r, c) => { const t = r * 0.3; poly(g, [[x, y - r], [x + t, y - t], [x + r, y], [x + t, y + t], [x, y + r], [x - t, y + t], [x - r, y], [x - t, y - t]], c); };

prop('toucheFinger', (D, x, y, n = 3) => {                 // a fingerprint on the glass: n arcs (fewer while it is wiped)
  const g = D.g; g.strokeStyle = D.col.hi; g.lineWidth = D.lw(0.7 * BU); g.lineCap = 'round';
  for (let i = 0; i < n; i++) { const a = 0.8 + i * 0.35; g.beginPath(); g.ellipse(x, y, (1.1 + 1.5 * i) * BU, (1.4 + 1.8 * i) * BU, 0.25, a, a + TAU - 1.1); g.stroke(); }
});
prop('toucheSparkle', (D, x, y, r, c) => sparkle(D.g, x, y, r, c || D.col.hi));
prop('toucheTwinkle', (D, e, pts, c) => {                  // sparkles that come and go around him: [u, v, phase]
  for (const [u, v, ph] of pts) { const k = Math.sin(e / 160 + ph); if (k > 0.15) { const p = D.P(u, v); sparkle(D.g, p.x, p.y, (1.3 + 1.9 * k) * D.U, c || D.col.hi); } }
});
prop('toucheHeartEyes', (D, q, b = 0) => {                 // two big hearts over his eyes
  if (q <= 0) return;
  for (const [u, v] of [EL, ER]) { const p = D.P(u, v), s = 14.5 * D.U * q * (1 + 0.45 * b); D.heart(p.x, p.y - 0.46 * s, s, D.col.pink); }
});
prop('toucheSpiral', (D, u, v, e, q) => {                  // a hypnotic spiral in place of an eye
  const g = D.g, p = D.P(u, v), R = 7.4 * D.U * q; if (R < 2) return;
  disc(g, p.x, p.y, R, D.col.bg);
  g.strokeStyle = D.col.fg; g.lineWidth = D.lw(0.8 * D.U); g.lineCap = 'round'; g.beginPath();
  for (let j = 0; j <= 30; j++) { const t = j / 30, a = t * TAU * 2.4 + e / 150, r = t * R * 0.9, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r; if (j) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke();
});
prop('toucheBump', (D, q) => {                             // a bump on his forehead, between his eyes
  if (q <= 0) return; const r = 3.6 * q, pts = [];
  for (let i = 0; i <= 10; i++) { const a = Math.PI + i * Math.PI / 10; pts.push([48.4 + Math.cos(a) * r, 17.6 + Math.sin(a) * r * 1.1]); }
  gpoly(D, pts, D.col.pink);
  const h = D.P(47, 17.6 - r * 0.55); disc(D.g, h.x, h.y, 0.75 * D.U * q, D.col.hi);
});
prop('toucheBandage', (D, u, v, rot, len, q) => {          // a sticking plaster, len face pixels long
  if (q <= 0) return; const l = len / 2 * q, h = 1.3, c = Math.cos(rot), s = Math.sin(rot), R = (x, y) => [u + x * c - y * s, v + x * s + y * c];
  gpoly(D, [R(-l, -h), R(l, -h), R(l, h), R(-l, h)], D.col.hi);
  gpoly(D, [R(-1.1, -h * 0.75), R(1.1, -h * 0.75), R(1.1, h * 0.75), R(-1.1, h * 0.75)], D.col.dim);
});
prop('toucheTuft', (D, up, e) => {                         // three hairs sticking up on his head (up: 1 standing, 0 flat)
  const g = D.g; g.strokeStyle = D.col.fg; g.lineWidth = D.lw(0.9 * D.U); g.lineCap = 'round';
  for (const [u, dx] of [[52, -2.4], [54.4, 0.3], [56.8, 2.6]]) {
    const sw = Math.sin(e / 110 + u) * 0.5 * up, b = D.P(u, 14.6), c = D.P(u + dx * 0.2, 14.6 - 3.4 * up), t = D.P(u + dx * (0.5 + 0.5 * up) + sw, 13.8 - 5 * up);
    g.beginPath(); g.moveTo(b.x, b.y); g.quadraticCurveTo(c.x, c.y, t.x, t.y); g.stroke();
  }
});
prop('toucheAntenna', (D, q, e, wave) => {                 // an antenna popping out of his head, its ball blinking
  if (q <= 0) return; const U = D.U, b = D.P(70, 16.5), t = D.P(70 + 4.5 * q, 16.5 - 9 * q);
  line(D, b, t, 0.7 * U, D.col.dim);
  disc(D.g, t.x, t.y, 1.6 * U * q, (e % 500) < 250 ? D.col.acc : D.col.hi);
  if (!wave) return;
  const g = D.g; g.strokeStyle = D.col.fg; g.lineWidth = D.lw(0.6 * U); g.lineCap = 'round';
  for (let i = 0; i < 2; i++) { const r = (3 + i * 2.2 + ((e / 300) % 1) * 2.2) * U; for (const a0 of [-1, Math.PI - 0.1]) { g.beginPath(); g.arc(t.x, t.y, r, a0, a0 + 1.1); g.stroke(); } }
});
prop('toucheMonocle', (D, u, v, q) => {                    // a monocle round an eye, and its little chain
  if (q <= 0) return; const p = D.P(u, v), g = D.g;
  g.strokeStyle = D.col.acc; g.lineWidth = D.lw(1.0 * D.U); g.beginPath(); g.arc(p.x, p.y, 7.6 * D.U * q, 0, TAU); g.stroke();
  for (let i = 0; i < Math.round(6 * q); i++) { const c = D.P(u + 5.4 + i * 1.1, v + 5.4 + i * 1.7); disc(g, c.x, c.y, 0.6 * D.U, D.col.acc); }
});
prop('touchePatch', (D, u, v, q, side) => {                // a pirate's eye patch and its strap
  if (q <= 0) return; const g = D.g, p = D.P(u, v);
  line(D, D.P(u - side * 3, v - 6.6), D.P(u - side * 15, v - 11.5), 1.0 * D.U, D.col.fg);
  line(D, D.P(u + side * 5.6, v - 2.5), D.P(u + side * 13, v - 1.5), 1.0 * D.U, D.col.fg);
  g.fillStyle = D.col.dim; g.strokeStyle = D.col.fg; g.lineWidth = D.lw(0.9 * D.U);
  g.beginPath(); g.ellipse(p.x, p.y, 6.4 * D.U * q, 7.6 * D.U * q, 0, 0, TAU); g.fill(); g.stroke();
  if (q > 0.6) for (const sd of [-1, 1]) line(D, D.P(u - 2.6, v - 2.6 * sd), D.P(u + 2.6, v + 2.6 * sd), 0.9 * D.U, D.col.fg);   // crossed bones
});
prop('toucheWiper', (D, u, v, a, q) => {                   // a windscreen wiper sweeping an eye (a: its angle from upright)
  if (q <= 0) return; const pv = D.P(u, v + 11), len = 15 * D.U * q, dx = Math.sin(a), dy = -Math.cos(a);
  const tip = { x: pv.x + dx * len, y: pv.y + dy * len }, mid = { x: pv.x + dx * len * 0.3, y: pv.y + dy * len * 0.3 };
  line(D, pv, tip, 0.6 * D.U, D.col.dim); line(D, mid, tip, 1.2 * D.U, D.col.hi); disc(D.g, pv.x, pv.y, 1.1 * D.U, D.col.dim);
});
prop('toucheArrow', (D, u, v, side) => {                   // a turn signal by an eye
  gpoly(D, [[u + side * 8.6, v - 3.4], [u + side * 13, v], [u + side * 8.6, v + 3.4]], D.col.acc);
  gpoly(D, [[u + side * 6.4, v - 1.4], [u + side * 8.7, v - 1.4], [u + side * 8.7, v + 1.4], [u + side * 6.4, v + 1.4]], D.col.acc);
});
prop('toucheGum', (D, q) => {                              // a bubble of chewing gum growing from his mouth
  if (q <= 0) return; const r = (1.4 + 7 * q) * D.U, p = D.P(MO[0], MO[1] + 1 + 2.4 * q);
  disc(D.g, p.x, p.y, r, D.col.pink); disc(D.g, p.x - r * 0.38, p.y - r * 0.38, Math.max(0.7 * D.U, r * 0.16), D.col.hi);
});
prop('toucheSplat', (D, q, pts) => { for (const [du, dv, r] of pts) { const p = D.P(MO[0] + du, MO[1] + dv); disc(D.g, p.x, p.y, r * (1 - 0.6 * q) * D.U, D.col.pink); } });
prop('toucheZip', (D, q) => {                              // a zip closing his mouth
  const u0 = 40, u1 = 57, v = MO[1] + 0.2, end = u0 + (u1 - u0) * q, g = D.g, h = 0.55 * D.U;
  g.fillStyle = D.col.hi;
  for (let u = u0, i = 0; u <= end; u += 1.4, i++) { const p = D.P(u, v + (i % 2 ? 0.65 : -0.65)); g.fillRect(p.x - h, p.y - h, 2 * h, 2 * h); }
  gpoly(D, [[end - 0.9, v - 0.4], [end + 0.9, v - 0.4], [end + 0.9, v + 3.2], [end - 0.9, v + 3.2]], D.col.acc);
});
prop('toucheTongue', (D, q, wag) => {                      // his tongue sticking out
  if (q <= 0) return; const p = D.P(MO[0] + wag, MO[1] + 3.6 + 1.4 * q), g = D.g, ry = 3.2 * D.U * q;
  g.fillStyle = D.col.pink; g.beginPath(); g.ellipse(p.x, p.y, 2.6 * D.U, ry, 0, 0, TAU); g.fill();
  line(D, { x: p.x, y: p.y - ry * 0.7 }, { x: p.x, y: p.y + ry * 0.2 }, 0.45 * D.U, D.col.bg);
});
prop('toucheCrack', (D, x, y, q, cr) => {                  // cracks in the glass, from (x, y)
  const g = D.g; g.strokeStyle = D.col.hi; g.lineWidth = D.lw(0.75 * BU); g.lineCap = 'round'; g.lineJoin = 'round';
  for (const br of cr) { g.beginPath(); g.moveTo(x, y); for (const [dx, dy] of br) g.lineTo(x + dx * q * BU, y + dy * q * BU); g.stroke(); }
  disc(g, x, y, 1.3 * BU, D.col.hi);
});
const BOLT = [[-0.2, -1], [0.5, -1], [0.12, -0.2], [0.55, -0.2], [-0.35, 1], [-0.02, 0.12], [-0.45, 0.12]];
prop('toucheBolt', (D, x, y, s, c) => poly(D.g, BOLT.map(([a, b]) => [x + a * s, y + b * s]), c || D.col.acc));
prop('toucheFrame', (D, d) => {                            // a camera's corners round his face
  for (const [u, v, su, sv] of [[14, 7, 1, 1], [82, 7, -1, 1], [14, 49, 1, -1], [82, 49, -1, -1]]) {
    const c = D.P(u + su * d, v + sv * d);
    line(D, c, D.P(u + su * (d + 5), v + sv * d), 1.1 * D.U, D.col.hi); line(D, c, D.P(u + su * d, v + sv * (d + 5)), 1.1 * D.U, D.col.hi);
  }
});
prop('toucheBattery', (D, lvl, q) => {                     // a battery by his side, filling up bar by bar (lvl 0..4)
  if (q <= 0) return; const U = D.U, p0 = D.P(88, 27), w = 6 * U, h = 11 * U * q, x = Math.min(p0.x, W - 14 - w / 2), y = p0.y, g = D.g;
  g.strokeStyle = D.col.fg; g.lineWidth = D.lw(0.8 * U); g.strokeRect(x - w / 2, y - h / 2, w, h);
  g.fillStyle = D.col.fg; g.fillRect(x - 1.5 * U, y - h / 2 - 1.4 * U, 3 * U, 1.4 * U);
  const bh = (h - 2.2 * U) / 4;
  g.fillStyle = lvl >= 4 ? D.col.hi : D.col.fg;
  for (let i = 0; i < lvl; i++) g.fillRect(x - w / 2 + 1.1 * U, y + h / 2 - 1.1 * U - (i + 1) * bh + 0.35 * U, w - 2.2 * U, bh - 0.7 * U);
});
prop('toucheEars', (D, q, tw = 0) => {                     // cat ears on his head (tw: a twitch of the left one)
  if (q <= 0) return; const v0 = 15.4, hg = 8.5 * q;
  gpoly(D, [[24.5, v0 + 1.2], [37, v0], [27 - tw, v0 - hg]], D.col.fg);
  gpoly(D, [[72.3, v0 + 1.2], [59.8, v0], [69.8, v0 - hg]], D.col.fg);
  gpoly(D, [[27.5, v0 + 0.3], [33.8, v0 - 0.2], [28.2 - tw, v0 - hg * 0.62]], D.col.pink);
  gpoly(D, [[69.3, v0 + 0.3], [63, v0 - 0.2], [68.6, v0 - hg * 0.62]], D.col.pink);
});
prop('toucheWhiskers', (D, q) => {
  if (q <= 0) return;
  for (const sd of [-1, 1]) for (const dv of [-2.2, 0, 2.2]) line(D, D.P(MO[0] + sd * 6.5, MO[1] - 1 + dv * 0.3), D.P(MO[0] + sd * (6.5 + 9 * q), MO[1] - 1 + dv), 0.55 * D.U, D.col.fg);
});
const NUB = [[35, 49, 3.8], [41.5, 46.7, 4.6], [49, 45.9, 5.2], [56.5, 46.9, 4.4], [62, 49.1, 3.6]];
prop('toucheCloud9', (D, q) => {                           // a fluffy little cloud under his chin: an outline, then the inside
  if (q <= 0) return; const g = D.g;
  for (const pad of [0.9, 0]) {
    const c = pad ? D.col.fg : D.col.bg;
    for (const [u, v, r] of NUB) { const p = D.P(u, v); disc(g, p.x, p.y, (r * q + pad) * D.U, c); }
    gpoly(D, [[34 - pad, 49], [63 + pad, 49], [63 + pad, 52.4 + pad], [34 - pad, 52.4 + pad]], c);
  }
});
prop('toucheFlower', (D, x, y, h, q, c) => {               // a flower growing on the glass
  if (q <= 0) return; const top = { x, y: y - h * q };
  line(D, { x, y }, top, 0.7 * BU, D.col.fg);
  for (let i = 0; i < 5; i++) { const a = i * TAU / 5 - Math.PI / 2; disc(D.g, top.x + Math.cos(a) * 1.5 * BU * q, top.y + Math.sin(a) * 1.5 * BU * q, 1.15 * BU * q, c); }
  disc(D.g, top.x, top.y, 0.95 * BU * q, D.col.acc);
});
prop('toucheBeacon', (D, e, q) => {                        // a police light on his head, its beam turning
  if (q <= 0) return; const U = D.U, p = D.P(48.4, 14.6), g = D.g;
  g.fillStyle = D.col.dim; g.fillRect(p.x - 4.2 * U * q, p.y, 8.4 * U * q, 1.4 * U);
  g.fillStyle = D.col.acc; g.beginPath(); g.arc(p.x, p.y, 3 * U * q, Math.PI, TAU); g.closePath(); g.fill();
  const sd = (e % 420) < 210 ? -1 : 1;
  poly(g, [[p.x + sd * 2.4 * U, p.y - 1.6 * U], [p.x + sd * 15 * U * q, p.y - 5.5 * U], [p.x + sd * 15 * U * q, p.y + 1 * U]], D.col.acc);
});
prop('toucheCard', (D, q, c) => {                          // a referee's card held up by his side
  if (q <= 0) return; const U = D.U, p0 = D.P(87, 17), x = Math.min(p0.x, W - 16 - 4 * U), y = Math.max(p0.y, 60 + 5 * U) + (1 - q) * 8 * U, w = 3 * U, h = 4.3 * U, cs = Math.cos(0.18), sn = Math.sin(0.18);
  poly(D.g, [[-w, -h], [w, -h], [w, h], [-w, h]].map(([a, b]) => [x + a * cs - b * sn, y + a * sn + b * cs]), c || D.col.acc);
});
prop('toucheTicket', (D, q, n) => {                        // a queue ticket coming out of his side
  if (q <= 0) return; const U = D.U, p = D.P(79, 34), w = 12 * U * q, h = 5.6 * U, x = Math.min(p.x, W - 12 - 12 * U), y = p.y - h / 2, g = D.g;
  g.fillStyle = D.col.bg; g.strokeStyle = D.col.fg; g.lineWidth = D.lw(0.7 * U); g.fillRect(x, y, w, h); g.strokeRect(x, y, w, h);
  if (q > 0.7) D.glyph('N°' + n, x + w / 2, y + h / 2 + 0.2 * U, 3.6 * U, D.col.fg);
});
prop('toucheTimeout', (D, q) => {                          // the "T" of a time out
  if (q <= 0) return; const U = D.U, p0 = D.P(86, 21), x = Math.min(p0.x, W - 14 - 5 * U), y = p0.y, g = D.g;
  g.fillStyle = D.col.acc; g.fillRect(x - 5 * U * q, y - 1.1 * U, 10 * U * q, 2.2 * U); g.fillRect(x - 1.1 * U, y, 2.2 * U, 9 * U * q);
});
const PUFF = [-1.1, -0.75, -0.5, 0.5, 0.75, 1.1];
prop('touchePuffs', (D, e, q) => {                         // a volcano's puffs, shot out of his head
  if (q <= 0) return; const b = D.P(48.4, 15);
  for (let i = 0; i < PUFF.length; i++) {
    const t = ((e / 700) + i / PUFF.length) % 1, a = PUFF[i]; if (t > 0.9) continue;
    disc(D.g, b.x + Math.sin(a) * t * 24 * BU * q, b.y - Math.cos(a) * t * 12 * BU * q - t * 2 * BU, (0.9 + 2.2 * t) * BU * q, i % 2 ? D.col.dim : D.col.acc);
  }
});
prop('toucheSnort', (D, e) => {                            // a bull's snorts, out of both sides of his mouth
  const t = (e % 520) / 520; if (t > 0.8) return;
  for (const sd of [-1, 1]) { const p = D.P(MO[0] + sd * (4.5 + 6 * t), MO[1] + 1 + 2 * t); disc(D.g, p.x, p.y, (0.8 + 1.6 * t) * D.U, D.col.hi); }
});
prop('toucheRipples', (D, x, y, e) => { for (let i = 0; i < 3; i++) { const r = (e - i * 200) * 0.45; if (r > 4 && r < 470) D.ring(x, y, r, D.col.fg, 0.75 * BU); } });
prop('toucheMeteor', (D, x, y, dx, dy, e) => {             // a shooting star and its tail
  for (let i = 4; i >= 1; i--) D.star(x - dx * i * 0.09, y - dy * i * 0.09, (2.8 - i * 0.45) * BU, i % 2 ? D.col.acc : D.col.fg, e / 200 + i);
  D.star(x, y, 3.6 * BU, D.col.hi, e / 150);
});
prop('toucheGust', (D, q) => {                             // the air of a big sigh
  if (q <= 0 || q >= 1) return; const b = D.P(MO[0] + 4, MO[1] + 1);
  for (let i = 0; i < 3; i++) { const t = clamp(q * 1.3 - i * 0.15, 0, 1); if (t > 0 && t < 1) disc(D.g, b.x + (3 + 14 * t + i * 2) * BU, b.y + (1 + 3 * t) * BU, (1 + 1.6 * t) * BU, D.col.dim); }
});
prop('toucheDust', (D, q) => { if (q <= 0 || q >= 1) return; for (const sd of [-1, 1]) { const p = D.P(48.4 + sd * (14 + 10 * q), 47); disc(D.g, p.x, p.y, (1.8 - 1.2 * q) * D.U, D.col.dim); } });
prop('toucheSpring', D => {                                // a spring between his chin and the bottom of the screen
  const c = D.P(48.4, 45), y2 = HT - 52; if (y2 - c.y < 3 * BU) return;
  const g = D.g, n = clamp(Math.round((y2 - c.y) / (2.6 * BU)), 2, 7), a = 3.4 * BU; g.strokeStyle = D.col.dim; g.lineWidth = D.lw(0.8 * BU); g.lineJoin = 'round'; g.beginPath(); g.moveTo(c.x, c.y);
  for (let i = 1; i < n; i++) g.lineTo(c.x + (i % 2 ? a : -a), c.y + (y2 - c.y) * i / n);
  g.lineTo(c.x, y2); g.stroke();
});
prop('toucheBalloon', (D, e, q) => {                       // a heart balloon tied to his head
  if (q <= 0) return; const U = D.U, a = D.P(72, 16), sw = Math.sin(e / 500) * 1.5 * U, g = D.g;
  const b = { x: Math.min(a.x + 7 * U + sw, W - 16 - 5 * U), y: Math.max(a.y - 13 * U * q, 62 + 5 * U) };
  g.strokeStyle = D.col.fg; g.lineWidth = D.lw(0.45 * U); g.beginPath(); g.moveTo(a.x, a.y); g.quadraticCurveTo(a.x + 5 * U, a.y - 4 * U, b.x, b.y + 4.8 * U); g.stroke();
  D.heart(b.x, b.y - 4 * U, 9 * U * q, D.col.pink); disc(g, b.x - 2.4 * U, b.y - 1 * U, 0.9 * U * q, D.col.hi);
});
const FLOWERS = [[108, 412, 4.6, 300], [215, 424, 3.6, 550], [585, 424, 4, 800], [690, 410, 5, 1050], [150, 330, 3.2, 1300], [655, 325, 3.4, 1550]];
const avion = e => { const a = TAU * sm(seg(e, 620, 2750)); return { x: 190 * Math.sin(a), y: -58 * (1 - Math.cos(a)), a }; };   // a loop in the sky
const hx = t => 160 * Math.sin(t) ** 3, hy = t => -6 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) + 12, ht = e => TAU * seg(e, 350, 2500);   // a heart

/* ======================= a tap (calm) ======================= */
S('touche-empreinte', 'L’empreinte', 'tap', { pool: 'calm', dur: 3200, anim: [[0, 'surpris'], [350, 'recherche'], [2100, 'fier']], mood: 'reflechit',
  say: [[150, 1500, L('Une empreinte !', 'Tiens, une trace de doigt…', 'Hmm, intéressant…', 'Qu’est-ce que c’est que ça ?')],
    [1600, 3050, L('Suspect identifié : toi !', 'Coupable : ton doigt !', 'Affaire résolue !', 'Élémentaire, mon cher !')]],
  move: e => ({ y: -12 * bump(seg(e, 0, 260)) + 10 * io(e, 300, 700, 1900, 2400), r: 0.07 * Math.sin(e / 230) * io(e, 400, 700, 1800, 2200), sy: 1 + 0.06 * bump(seg(e, 2100, 2500)) }),
  props: (D, e) => {
    const f = SP(52, 33); if (e < 2900) D.toucheFinger(f.x, f.y, 3);
    if (e > 350 && e < 2000) {                              // the magnifying glass, circling the print
      const q = io(e, 350, 600, 1700, 2000), a = e / 260, x = f.x + Math.cos(a) * 2.6 * BU, y = f.y + Math.sin(a) * 1.8 * BU, g = D.g;
      g.strokeStyle = D.col.fg; g.lineWidth = D.lw(0.9 * BU); g.beginPath(); g.arc(x, y, 5.5 * BU * q, 0, TAU); g.stroke();
      line(D, { x: x + 3.9 * BU * q, y: y + 3.9 * BU * q }, { x: x + 8 * BU * q, y: y + 8 * BU * q }, 1.4 * BU, D.col.acc);
    }
  } });
S('touche-fissure', 'L’écran fissuré', 'tap', { pool: 'calm', dur: 3300, anim: [[0, 'surpris'], [350, 'panique'], [1750, 'rire']], mood: 'surpris',
  say: [[120, 1650, L('Tu as cassé l’écran !', 'Aïe ! Une fissure !', 'Oh non, l’écran !', 'Crac ! T’as vu ça ?')],
    [1750, 3150, L('…je rigole !', 'Poisson d’avril !', 'Hé hé, même pas vrai !', 'T’as eu peur, hein ?')]],
  init: o => {
    o.cx = CX + (rnd() - 0.5) * 140; o.cy = CY + 30 + (rnd() - 0.5) * 60; o.cr = [];
    for (let i = 0; i < 6; i++) { let a = i * TAU / 6 + rnd() * 0.6, x = 0, y = 0; const br = []; for (let j = 0; j < 3; j++) { const l = 3 + rnd() * 3.5; a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * l; y += Math.sin(a) * l; br.push([x, y]); } o.cr.push(br); }
  },
  move: e => ({ y: 14 * bump(seg(e, 0, 220)), x: 5 * Math.sin(e / 22) * io(e, 200, 350, 1400, 1700), sy: 1 + 0.1 * bump(seg(e, 1750, 2150)), sx: 1 - 0.05 * bump(seg(e, 1750, 2150)) }),
  props: (D, e, p, o) => {
    if (e < 1750) D.toucheCrack(o.cx, o.cy, out(seg(e, 0, 260)), o.cr); else if (e < 2300) D.toucheSparkle(o.cx, o.cy, (1.5 + 2.5 * bump(seg(e, 1750, 2300))) * BU);
    if (e > 350 && e < 1700) D.sweat(e);
  } });
S('touche-zap', 'Bzzt !', 'tap', { pool: 'calm', dur: 2500, anim: [[0, 'bug'], [800, 'surpris'], [1500, 'rire']], mood: 'surpris',
  say: [[80, 1300, L('Bzzzt !', 'Ouille, ça pique !', 'Zzzap !', 'Aïe, de l’électricité !')],
    [1400, 2400, L('Électricité statique…', 'J’ai les pixels qui frisent !', 'Ça réveille !', 'Tu es chargé, toi !')]],
  move: e => { const k = fin(e, 500, 750); return { x: 6 * Math.sign(Math.sin(e / 11)) * k, sx: 1 + 0.1 * Math.sin(e / 13) * k, sy: 1 - 0.05 * Math.sin(e / 9) * k + 0.05 * io(e, 750, 900, 1600, 2100) }; },
  props: (D, e) => {
    if (e < 800 && Math.floor(e / 60) % 4 !== 3) for (const [u, v, s] of [[16, 14, 4.5], [80, 12, 5], [26, 46, 3.5], [72, 46, 4]]) { const c = D.P(u, v); D.toucheBolt(c.x, c.y, s * D.U); }
    if (e > 800 && e < 2100) D.steam(e - 800);
  } });
S('touche-ding', 'Ding dong', 'tap', { pool: 'calm', dur: 2800, anim: [[0, 'surpris'], [400, 'content'], [1700, 'curieux']], mood: 'content',
  say: [[200, 1600, L('Ding dong !', 'Ding ! Dong !', 'Driiing !', 'Ding ding ding !')],
    [1700, 2700, L('Qui est là ?', 'C’est le facteur ?', 'Entrez !', 'Oui ? C’est pour quoi ?')]],
  move: e => { const r = 0.3 * wob(e, 0, 520, 105); return { r, x: -260 * Math.sin(r), y: -260 * (1 - Math.cos(r)) }; },   // a bell, hanging from above
  props: (D, e) => {
    for (const [t, txt, u] of [[60, 'DING', 14], [390, 'DONG', 82], [720, 'DING', 16]]) if (e > t && e < t + 420) { const c = D.P(u, 13); D.glyph(txt, c.x, c.y - seg(e, t, t + 420) * 3 * D.U, 4.4 * D.U, D.col.acc); }
  } });
S('touche-avion', 'Mode avion', 'tap', { pool: 'calm', dur: 3400, side: true, anim: [[0, 'surpris'], [600, 'rire'], [2750, 'fier']], mood: 'excite',
  say: [[80, 620, L('Mode avion activé !', 'Décollage !', 'Attachez vos ceintures !', 'Vrrrouuum !')],
    [2750, 3300, L('Atterrissage réussi !', 'Bienvenue à bord !', 'Mode avion désactivé.', 'Pile sur la piste !')]],
  move: e => { const p = avion(e), k = io(e, 560, 900, 2550, 3050); return { x: p.x, y: p.y + 18 * bump(seg(e, 0, 600)) + 3 * Math.sin(e / 25) * fin(e, 300, 600), sy: 1 - 0.15 * bump(seg(e, 0, 600)), s: 1 - 0.45 * k, r: 0.3 * Math.cos(p.a) * k }; },
  props: (D, e) => { if (e < 2750) for (let i = 4; i <= 7; i++) { if (e - i * 110 < 760) continue; const p = avion(e - i * 110); disc(D.g, CX + p.x, CY + p.y, (3.2 - i * 0.35) * BU, D.col.dim); } } });   // a little trail of smoke
S('touche-hypno', 'L’hypnose', 'tap', { pool: 'calm', dur: 3400, anim: [[0, 'idle-regard'], [300, 'zen'], [2700, 'clin-oeil']], mood: 'reflechit',
  say: [[300, 1700, L('Regarde mes yeux…', 'Tu deviens tout mou…', 'Concentre-toi…', 'Tu es sous mon charme…')],
    [1800, 3250, L('…tu as envie d’un câlin.', '…tu vas me caresser.', '…je suis ton préféré.', '…tu m’apportes un cookie.')]],
  move: e => { const k = io(e, 0, 400, 2400, 2900); return { x: 26 * Math.sin(e / 320) * k, r: 0.06 * Math.sin(e / 320) * k, sy: 1 + 0.07 * bump(seg(e, 0, 260)) }; },
  props: (D, e) => { const q = io(e, 100, 350, 2500, 2700); if (q > 0) { D.toucheSpiral(EL[0], EL[1], e, q); D.toucheSpiral(ER[0], ER[1], -e, q); } } });
S('touche-rebond', 'La balle rebondissante', 'tap', { pool: 'calm', dur: 2600, anim: [[0, 'surpris'], [200, 'rire']], mood: 'excite',
  say: [[150, 760, L('Boing ! Boing !', 'Je rebondis !', 'Boiiiiing !', 'Hop, hop, hop !')], [1900, 2500, L('Et je retombe !', 'Rebond parfait !', 'Encore ? Hop !')]],
  move: e => {
    const sq = 0.22 * hit(e, [55], 60) + 0.26 * hit(e, [800], 80) + 0.16 * hit(e, [1280], 70) + 0.08 * hit(e, [1620], 60) + 0.04 * hit(e, [1840], 50);
    return { y: arcs(e, [[110, 800, 120], [800, 1280, 58], [1280, 1620, 26], [1620, 1840, 10]]) + sq * 45, sy: 1 - sq, sx: 1 + sq * 0.7 };
  },
  props: (D, e) => { for (const t of [800, 1280, 1620]) if (e > t && e < t + 300) D.toucheDust(seg(e, t, t + 300)); } });
S('touche-sursaut', 'Le sursaut', 'tap', { pool: 'calm', dur: 3000, anim: [[0, 'panique'], [1300, 'timide']], mood: 'surpris',
  say: [[150, 930, L('AAAAAAH !!!', 'WAAAAAAH !', 'Hiiiiiiiii !', 'Au secours !')],
    [1250, 2850, L('Tu m’as fait peur !', 'Mon cœur bat à 200 !', 'Préviens avant de toucher !', 'Ouf… c’était toi.')]],
  move: e => {
    const y = e < 260 ? -122 * out(seg(e, 0, 260)) : e < 720 ? -122 + 3 * Math.sin(e / 18) : e < 960 ? -122 * (1 - inn(seg(e, 720, 960))) : 0;   // up to the ceiling, hang on, fall
    const sq = 0.24 * hit(e, [960], 110), st = 0.2 * bump(seg(e, 0, 300));
    return { y: y + sq * 45, sy: 1 + st - sq, sx: 1 - st * 0.6 + sq * 0.7, x: 3 * Math.sin(e / 18) * io(e, 1000, 1100, 1900, 2200) };
  },
  props: (D, e) => {
    if (e > 1000 && e < 2800) { const b = beat(e - 1000, 430), c = D.P(48.4, 49), s = 4.8 * D.U * (1 + 0.35 * b); D.heart(c.x, c.y - s * 0.5, s, D.col.pink); }
    if (e > 300 && e < 900) D.sweat(e);
  } });
S('touche-selfie', 'Le selfie', 'tap', { pool: 'calm', dur: 3400, anim: [[0, 'surpris'], [300, 'content'], [2050, 'clin-oeil'], [2700, 'fier']], mood: 'content',
  say: [[330, 1900, L('Attends, un selfie !', 'Souris !', 'Prends-moi en photo !', 'Mon meilleur profil…')],
    [2100, 3300, L('Clic ! Trop beau.', 'Magnifique !', 'Je poste ça où ?', 'Filtre rétro, parfait.')]],
  move: e => ({ y: -20 * bump(seg(e, 0, 300)), r: -0.09 * io(e, 300, 600, 2500, 3000) + 0.03 * Math.sin(e / 200) * io(e, 600, 800, 1800, 2000), x: -14 * io(e, 300, 600, 2500, 3000), sy: 1 + 0.06 * bump(seg(e, 2000, 2250)) }),
  props: (D, e) => {
    if (e > 250 && e < 2900) D.toucheFrame(e > 2000 && e < 2200 ? -1.5 : 0);
    for (const [t, n] of [[500, '3'], [1000, '2'], [1500, '1']]) if (e > t && e < t + 480) { const c = D.P(88, 30); D.glyph(n, Math.min(c.x, W - 30), c.y, 7 * D.U * (1.2 - 0.2 * seg(e, t, t + 480)), D.col.acc); }
    if (e > 2000 && e < 2500) { const c = D.P(84, 10); D.glyph('CLIC !', Math.min(c.x, W - 60), c.y, 4.4 * D.U, D.col.hi); D.toucheTwinkle(e, [[14, 7, 0], [82, 7, 2], [14, 49, 4], [82, 49, 1]]); }
  } });
S('touche-robot', 'Bip boup', 'tap', { pool: 'calm', dur: 3000, anim: [[0, 'chargement'], [700, 'code'], [2300, 'succes']], mood: 'reflechit',
  say: [[100, 1350, L('Bip boup. Contact détecté.', 'Bip. Doigt identifié.', 'Commande reçue. Bip.', 'Analyse du doigt… bip.')],
    [1450, 2900, L('Exécution de câlin.exe…', 'Résultat : tu es sympa.', 'Mode robot : terminé.', 'Bip boup… je rigole !')]],
  move: e => { const k = fin(e, 2200, 2600); return { x: step(36 * Math.sin(e / 280) * k, 12), y: e < 160 ? -12 : step(-14 * Math.abs(Math.sin(e / 190)) * k, 7), r: step(0.12 * Math.sin(e / 420) * k, 0.06) }; },
  props: (D, e) => { if (e < 2300 && (e % 380) < 260) { const i = Math.floor(e / 380), c = D.P(i % 2 ? 84 : 12, 14 + (i % 3) * 4); D.glyph(i % 2 ? 'bip' : 'boup', c.x, c.y, 3.8 * D.U, D.col.acc); } } });
S('touche-gelee', 'La gelée', 'tap', { pool: 'calm', dur: 2400, anim: [[0, 'surpris'], [250, 'rire']], mood: 'content',
  say: [[100, 2250, L('Blobloblob !', 'Je suis en gelée !', 'Tout mou, tout mou…', 'Ça fait trembloter !')]],
  move: e => { const w = wob(e, 0, 430, 48), w2 = wob(e, 40, 520, 75); return { sx: 1 + 0.2 * w, sy: 1 - 0.2 * w, y: 14 * w, r: 0.05 * w2 }; } });
S('touche-crepe', 'La crêpe', 'tap', { pool: 'calm', dur: 2600, anim: [[0, 'surpris'], [250, 'rire'], [1500, 'fier']], mood: 'excite',
  say: [[1200, 2450, L('Retourné à la perfection !', 'Côté doré ! Vive la Chandeleur !', 'Hop, la crêpe ! Pas collée !', 'Sauté de Pixel, à point !')]],
  move: e => {
    const th = TAU * sm(seg(e, 230, 1050)), sq = 0.18 * hit(e, [80], 90) + 0.2 * hit(e, [1150], 100);
    return { y: arcs(e, [[160, 1150, 115]]) + sq * 40, sy: (e > 230 && e < 1050 ? Math.cos(th) : 1) - sq, sx: 1 + sq * 0.6 };   // tossed, and flipped over
  },
  props: (D, e) => { if (e < 1900) { const a = SP(31, 51.5), b = SP(66, 51.5); line(D, a, b, 1.4 * BU, D.col.dim); line(D, a, SP(29, 49.6), 1.1 * BU, D.col.dim); line(D, b, SP(68, 49.6), 1.1 * BU, D.col.dim); line(D, b, SP(85, 53.2), 1.6 * BU, D.col.acc); } } });
S('touche-tambour', 'Badum tss', 'tap', { pool: 'calm', dur: 2300, anim: [[0, 'content'], [900, 'rire']], mood: 'content',
  say: [[1000, 2200, L('Je suis là toute la semaine !', 'Elle était bonne, hein ?', 'J’ai le rythme dans la peau !', 'Je suis pas un tambour !')]],
  move: e => { const sq = 0.14 * hit(e, [40, 300], 70) + 0.2 * hit(e, [600], 80); return { sy: 1 - sq, sx: 1 + 0.6 * sq, y: sq * 40, x: 3 * Math.sin(e / 14) * io(e, 600, 680, 1100, 1400) }; },
  props: (D, e) => {
    for (const [t, txt, u, c] of [[20, 'BA', 18, 'fg'], [280, 'DUM', 78, 'fg'], [580, 'TSS !', 80, 'acc']]) if (e > t && e < t + 600) { const p = D.P(u, 16); D.glyph(txt, p.x, p.y - seg(e, t, t + 600) * 4 * D.U, (t === 580 ? 5.2 : 4.6) * D.U, D.col[c]); }
    if (e > 580 && e < 1500) {                              // the cymbal, still shaking
      const p = D.P(88, 30), x = Math.min(p.x, W - 50), g = D.g, a = 0.3 * Math.sin(e / 25) * fin(e, 900, 1500);
      g.fillStyle = D.col.acc; g.beginPath(); g.ellipse(x, p.y, 5.5 * D.U, 1.4 * D.U, a - 0.25, 0, TAU); g.fill(); line(D, { x, y: p.y }, { x, y: p.y + 8 * D.U }, 0.7 * D.U, D.col.dim);
    }
  } });
S('touche-magie', 'Abracadabra', 'tap', { pool: 'calm', dur: 3000, anim: [[0, 'idee'], [400, 'etoiles'], [1700, 'fier']], mood: 'fier',
  init: o => { o.d = rnd() < 0.5 ? -1 : 1; },
  say: [[100, 1000, L('Abracadabra !', 'Regarde bien…', 'Et hop…', 'Attention, magie !')],
    [1650, 2900, L('Tadaa !', 'Magique, non ?', 'Le grand Pixellini !', 'Applaudissements !')]],
  move: (e, p, o) => {
    if (e < 380) return { y: 14 * bump(seg(e, 0, 380)), sy: 1 - 0.06 * bump(seg(e, 0, 380)) };   // a little bow
    if (e < 780) { const q = inn(seg(e, 380, 780)); return { sx: 1 - 0.97 * q, sy: 1 - 0.97 * q, r: TAU * q }; }   // he spins away to nothing
    if (e < 1450) return { sx: 0.03, sy: 0.03 };
    const q = out(seg(e, 1450, 1750)), pop = 1 + 0.07 * bump(seg(e, 1600, 1900)), k = 1 - sm(seg(e, 1900, 2700));   // and pops up elsewhere
    return { x: o.d * 150 * k, sx: (0.03 + 0.97 * q) * pop, sy: (0.03 + 0.97 * q) * pop };
  },
  props: (D, e, p, o) => {
    if (e > 650 && e < 1350) { const q = seg(e, 650, 1350); for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + q * 2; D.toucheSparkle(CX + Math.cos(a) * (2 + 14 * q) * BU, CY + Math.sin(a) * (2 + 10 * q) * BU, (2.6 - 1.4 * q) * BU, i % 2 ? D.col.acc : D.col.hi); } }
    if (e > 700 && e < 1200) D.glyph('POUF !', CX, CY - 9 * BU, 5 * BU, D.col.fg);
    if (e > 1450 && e < 2100) { const q = seg(e, 1450, 2100); for (let i = 0; i < 5; i++) { const a = i * TAU / 5 - q; D.toucheSparkle(CX + o.d * 150 + Math.cos(a) * (8 + 10 * q) * BU, CY + Math.sin(a) * (6 + 6 * q) * BU, (2.4 - 1.2 * q) * BU, i % 2 ? D.col.hi : D.col.acc); } }
  } });
S('touche-crt', 'Extinction', 'tap', { pool: 'calm', dur: 3000, anim: [[0, 'deconnexion'], [1450, 'connexion'], [2300, 'content']], mood: 'surpris',
  say: [[400, 1350, L('Clic…', 'Extinction…', 'Plus de courant !', 'Bonne nuit, l’écran…')],
    [1700, 2900, L('Hop, rallumé !', 'Redémarrage terminé !', 'Pixel OS, prêt !', 'Tu m’as éteint, toi !')]],
  move: e => {                                              // an old tube switched off: a line, a dot... and back on
    if (e < 170) { const q = inn(seg(e, 0, 170)); return { sy: 1 - 0.97 * q, sx: 1 + 0.25 * q }; }
    if (e < 340) return { sy: 0.03, sx: 1.25 - 1.23 * inn(seg(e, 170, 340)) };
    if (e < 1300) return { sy: 0.03, sx: 0.02 };
    if (e < 1450) return { sy: 0.03, sx: 0.02 + 1.18 * out(seg(e, 1300, 1450)) };
    const q = seg(e, 1450, 1750); return { sx: 1.2 - 0.2 * sm(q), sy: 0.03 + 0.97 * out(q) + 0.1 * bump(seg(e, 1600, 1950)) };
  },
  props: (D, e) => { if (e > 300 && e < 1300 && Math.floor(e / 90) % 6) disc(D.g, CX, CY, (1.8 - 1.1 * seg(e, 300, 1300)) * BU, D.col.hi); } });

/* ======================= a tap when he loves you ======================= */
S('touche-yeux-coeur', 'Les yeux en cœur', 'tap', { pool: 'love', dur: 3000, anim: [[0, 'amoureux']], mood: 'amoureux',
  say: [[200, 2850, L('Mes yeux font des cœurs !', 'Je te vois tout en rose…', 'Coup de foudre !', 'Mon écran déborde d’amour.')]],
  move: e => { const k = io(e, 0, 200, 2400, 2900), b = beat(e, 760); return { y: 6 * b * k, sx: 1 + 0.06 * b * k, sy: 1 - 0.05 * b * k, r: 0.04 * Math.sin(e / 300) * k }; },   // boing, boing: his heart eyes pop out
  props: (D, e) => { D.toucheHeartEyes(io(e, 0, 220, 2550, 2850), beat(e, 760)); if (e > 400 && e < 2600) D.hearts(e - 400, 0.7); } });
S('touche-calin-vitre', 'Câlin contre la vitre', 'tap', { pool: 'love', dur: 3200, anim: [[0, 'amoureux'], [2200, 'timide']], mood: 'amoureux',
  say: [[250, 2100, L('Câlin à travers l’écran !', 'Je me colle à la vitre…', 'Plus près ! Plus près !', 'Si seulement je pouvais sortir…')],
    [2200, 3100, L('Tu es tout chaud.', 'C’était bien.', 'Encore un, plus tard ?', 'Oups, j’ai laissé une trace.')]],
  move: e => { const k = out(seg(e, 0, 450)) * (1 - sm(seg(e, 2000, 2700))); return { s: 1 + 0.3 * k, sx: 1 + 0.1 * k + 0.03 * Math.sin(e / 140) * k, sy: 1 - 0.08 * k, r: 0.05 * Math.sin(e / 220) * k, y: 16 * k }; },
  props: (D, e) => { D.blush(io(e, 100, 500, 2600, 3100)); if (e > 2100 && e < 3100) D.hearts(e - 2100, 0.6); } });
S('touche-bisous', 'Bisous volants', 'tap', { pool: 'love', dur: 3000, anim: [[0, 'bisou'], [2300, 'content']], mood: 'amoureux',
  init: o => { o.dirs = [0, 1, 2].map(i => [(i - 1) * 0.9 + (rnd() - 0.5) * 0.5, -0.35 - rnd() * 0.6]); },
  say: [[150, 2850, L('Mwah ! Mwah ! Mwah !', 'Des bisous pour toi !', 'Attrape-les !', 'Bisous volants !')]],
  move: e => { const b = hit(e, [80, 750, 1420], 160); return { sx: 1 + 0.08 * b, sy: 1 + 0.08 * b, y: -8 * b, r: 0.06 * (hit(e, [750], 160) - hit(e, [1420], 160)) }; },
  props: (D, e, p, o) => {                                  // each kiss flies to you, bigger and bigger
    const m = D.at('mouth');
    [80, 750, 1420].forEach((t, i) => { if (e < t || e > t + 1000) return; const q = seg(e, t, t + 1000), [dx, dy] = o.dirs[i], s = (2 + 13 * q) * BU; D.heart(m.x + dx * q * 230, m.y + dy * q * 170 - s * 0.45, s, D.col.pink); });
  } });
S('touche-ballon', 'Le ballon cœur', 'tap', { pool: 'love', dur: 3400, anim: [[0, 'amoureux'], [600, 'etoiles'], [2600, 'content']], mood: 'amoureux',
  say: [[300, 2300, L('Tu me fais planer…', 'Je m’envole d’amour !', 'Léger comme un ballon !', 'Je flotte !')],
    [2400, 3300, L('Retour sur terre.', 'Atterrissage en douceur.', 'Ouf, quel voyage !')]],
  move: e => { const k = io(e, 250, 1300, 2300, 3100); return { y: -12 * bump(seg(e, 0, 250)) + (-55 + 5 * Math.sin(e / 380)) * k, s: 1 - 0.28 * k, r: 0.05 * Math.sin(e / 480) * k }; },
  props: (D, e) => D.toucheBalloon(e, io(e, 0, 400, 2900, 3250)) });
S('touche-coeur-dessin', 'Le cœur dessiné', 'tap', { pool: 'love', dur: 3400, anim: [[0, 'amoureux'], [2600, 'fier']], mood: 'amoureux',
  say: [[80, 650, L('Regarde !', 'Attention…', 'Un dessin !')], [2600, 3300, L('Pour toi !', 'Un cœur rien que pour toi.', 'Tadaa ! C’est toi.', 'Signé : Pixel.')]],
  move: e => { const k = io(e, 0, 350, 2550, 3100), t = ht(e); return { x: hx(t) * k, y: hy(t) * k, s: 1 - 0.55 * k }; },   // he flies along a heart...
  props: (D, e) => {                                        // ...and leaves little hearts behind him
    if (e < 350 || e > 3200) return; const t = ht(e);
    for (let j = 1; j <= 16; j++) { const tj = j * TAU / 16; if (tj > t + 1e-6) break; D.heart(CX + hx(tj), CY + hy(tj) - 1.4 * BU, 2.8 * BU, D.col.pink); }
  } });
S('touche-battement', 'Boum boum', 'tap', { pool: 'love', dur: 2800, anim: [[0, 'amoureux'], [1800, 'timide']], mood: 'amoureux',
  say: [[150, 1700, L('Boum boum…', 'Tu entends mon cœur ?', 'Ça bat fort, là…', 'Mon cœur fait boum.')],
    [1800, 2700, L('C’est à cause de toi.', 'Il bat pour toi.', 'Chut, il est timide.')]],
  move: e => { const b = beat(e, 800) * fin(e, 2000, 2400); return { sx: 1 + 0.1 * b, sy: 1 + 0.1 * b }; },
  props: (D, e) => {
    const b = beat(e, 800), c = D.P(84, 14), s = 5 * D.U * (1 + 0.45 * b) * fin(e, 2400, 2700);
    if (s > 2) D.heart(Math.min(c.x, W - 20 - s * 0.6), c.y - s * 0.45, s, D.col.pink);
    D.blush(io(e, 1700, 2000, 2500, 2800));
  } });
S('touche-compliment', 'Le compliment', 'tap', { pool: 'love', dur: 2800, anim: [[0, 'clin-oeil'], [900, 'fier']], mood: 'fier',
  say: [[150, 2650, L('Tu as de très jolis doigts.', 'Le plus bel humain du salon !', 'Tes caresses : cinq étoiles.', 'Toi, t’es quelqu’un de bien.', 'Meilleur humain du monde !')]],
  move: e => ({ r: -0.09 * io(e, 0, 280, 2100, 2600), x: -16 * io(e, 0, 280, 2100, 2600), y: 8 * bump(seg(e, 900, 1250)) }),
  props: (D, e) => {
    if (e > 120 && e < 800) { const c = D.P(ER[0] + 4, ER[1] - 5); D.toucheSparkle(c.x, c.y, (1.5 + 2.8 * bump(seg(e, 120, 800))) * D.U); }   // ting!
    if (e > 1000 && e < 2500) D.toucheTwinkle(e, [[12, 18, 0], [86, 16, 2], [18, 44, 4], [80, 44, 1]]);
  } });

/* ======================= where the finger lands ======================= */
// --- an eye (o.side: which one) ---
S('touche-monocle', 'Le monocle', 'tap', { pool: 'zone:oeil', dur: 3000, anim: [[0, 'surpris'], [500, 'fier']], mood: 'fier',
  say: [[80, 620, L('Ouille !', 'Hé, mon œil !', 'Aïe !')],
    [750, 2900, L('Ah, un monocle. Très chic.', 'Fort bien, très cher.', 'Je vois mieux, merci.', 'Une tasse de thé ?')]],
  move: (e, p, o) => { const k = io(e, 450, 800, 2400, 2900); return { x: 6 * Math.sin(e / 28) * fin(e, 150, 400), r: o.side * 0.06 * k, sy: 1 + 0.05 * k, y: -8 * k }; },
  props: (D, e, p, o) => {
    const ey = eyeOf(o); D.toucheMonocle(ey[0], ey[1], out(io(e, 300, 600, 2550, 2850)));
    if (e > 650 && e < 1100) { const c = D.P(ey[0] - 3, ey[1] - 4); D.toucheSparkle(c.x, c.y, (1.5 + 2.5 * bump(seg(e, 650, 1100))) * D.U); }
  } });
S('touche-pirate', 'Le pirate', 'tap', { pool: 'zone:oeil', dur: 3000, anim: [[0, 'surpris'], [600, 'fier'], [1900, 'rire']], mood: 'fier',
  say: [[80, 800, L('Aïe, mon œil !', 'Ouille !', 'Mon œil !')],
    [900, 2900, L('Arrr ! Je suis pirate !', 'À l’abordage, moussaillon !', 'Où est mon trésor ?', 'Arrr, borgne et fier !')]],
  move: e => { const k = io(e, 500, 800, 2400, 2900); return { x: 6 * Math.sin(e / 26) * fin(e, 150, 450), r: 0.08 * Math.sin(e / 300) * k, y: 7 * Math.sin(e / 150) * k }; },   // rolling like a ship
  props: (D, e, p, o) => { const ey = eyeOf(o); D.touchePatch(ey[0], ey[1], out(io(e, 350, 600, 2600, 2850)), o.side < 0 ? -1 : 1); } });
S('touche-essuie-glace', 'L’essuie-glace', 'tap', { pool: 'zone:oeil', dur: 3000, anim: [[0, 'surpris'], [450, 'idle-cligne'], [2300, 'content']], mood: 'surpris',
  say: [[100, 1300, L('Une trace de doigt !', 'Hé, tu as sali mon œil !', 'Je ne vois plus rien !', 'Beurk, un doigt !')],
    [1400, 2900, L('Essuie-glace activé !', 'Voilà, tout propre.', 'Vision parfaite !', 'Shhh… shhh… nickel.')]],
  move: (e, p, o) => ({ x: -o.side * 14 * bump(seg(e, 0, 420)), r: -o.side * 0.05 * bump(seg(e, 0, 420)), y: 3 * Math.sin(TAU * (e - 450) / 700) * io(e, 450, 600, 2000, 2300) }),
  props: (D, e, p, o) => {
    const ey = eyeOf(o), c = D.P(ey[0] + 1, ey[1] + 1), wipes = Math.max(0, (e - 450) / 700);
    if (e < 2200) D.toucheFinger(c.x, c.y, Math.max(0, 3 - Math.floor(wipes * 1.3)));
    if (e > 400 && e < 2500) D.toucheWiper(ey[0], ey[1], e < 2150 ? 1.05 * Math.sin(TAU * (e - 450) / 700) : -1.4 * sm(seg(e, 2150, 2350)), io(e, 400, 520, 2350, 2500));
  } });
S('touche-clignotant', 'Le clignotant', 'tap', { pool: 'zone:oeil', dur: 2900, anim: [[0, 'clin-oeil'], [1100, 'content']], mood: 'content',
  say: [[100, 1500, V(o => (o.side < 0 ? 'Je tourne à gauche !' : 'Je tourne à droite !'), 'Clignotant activé !', 'Tic, tac, tic, tac…')],
    [1600, 2800, L('Bonne route !', 'Attention, je déboîte !', 'Tût tût !', 'Ceinture bouclée ?')]],
  move: (e, p, o) => ({ x: o.side * 120 * io(e, 300, 1300, 1700, 2500), r: o.side * 0.07 * io(e, 300, 700, 1100, 1500), y: -10 * bump(seg(e, 0, 260)) }),
  props: (D, e, p, o) => { if (e < 2400 && (e % 400) < 220) { const ey = eyeOf(o); D.toucheArrow(ey[0], ey[1], o.side < 0 ? -1 : 1); } } });
// --- the top of his head ---
S('touche-ressort', 'Le ressort', 'tap', { pool: 'zone:tete', dur: 2600, anim: [[0, 'surpris'], [450, 'rire']], mood: 'excite',
  say: [[950, 2450, L('Boiiing boing boing !', 'Je suis monté sur ressort !', 'Ressort détendu !', 'Boing ! Ça secoue !')]],
  move: e => {
    if (e < 140) { const q = out(seg(e, 0, 140)); return { sy: 1 - 0.28 * q, sx: 1 + 0.16 * q, y: 34 * q }; }   // pushed down...
    const d = Math.exp(-(e - 140) / 60), w = wob(e, 140, 420, 62), v = wob(e, 140, 480, 95);      // ...and released
    return { sy: 1 - 0.28 * d + 0.26 * w, sx: 1 + 0.16 * d - 0.13 * w, y: 34 * d - 70 * v, r: 0.05 * wob(e, 300, 500, 120) };
  },
  props: (D, e) => { if (e < 2300) D.toucheSpring(); } });
S('touche-antenne', 'L’antenne', 'tap', { pool: 'zone:tete', dur: 3000, anim: [[0, 'surpris'], [400, 'ecoute'], [1900, 'idee']], mood: 'ecoute',
  say: [[120, 1800, L('Antenne déployée !', 'Je capte quelque chose…', 'Bzz… réception…', 'Allô, la Terre ?')],
    [1900, 2900, L('Tu penses à moi, je le sens !', 'Message reçu : tu m’aimes.', 'Ça capte : cinq barres !', 'Je capte ta pensée !')]],
  move: e => ({ y: 12 * bump(seg(e, 0, 260)) - 14 * bump(seg(e, 1900, 2300)), r: 0.06 * Math.sin(e / 240) * io(e, 400, 600, 1700, 1900), x: 1.5 * Math.sin(e / 13) * io(e, 600, 700, 1700, 1800) }),
  props: (D, e) => D.toucheAntenna(out(io(e, 150, 450, 2600, 2900)), e, e > 600 && e < 1900) });
S('touche-bosse', 'La bosse', 'tap', { pool: 'zone:tete', dur: 3200, anim: [[0, 'surpris'], [450, 'triste'], [1800, 'content']], mood: 'triste',
  say: [[100, 1650, L('Aïe ! Une bosse !', 'Ça gonfle, là…', 'Ouille, ma tête !', 'Regarde ce que tu as fait !')],
    [1750, 3100, L('Hop, un pansement.', 'Bisou magique, et voilà !', 'Ça va mieux…', 'Même pas mal… presque.')]],
  move: e => { const sq = 0.2 * hit(e, [60], 140); return { sy: 1 - sq, sx: 1 + 0.6 * sq, y: 22 * sq + 10 * io(e, 450, 800, 1600, 1900) - 12 * bump(seg(e, 1800, 2150)), r: 0.04 * Math.sin(e / 300) * io(e, 500, 800, 1500, 1800) }; },
  props: (D, e) => {
    D.toucheBump(out(seg(e, 200, 650)) * (1 + 0.15 * bump(seg(e, 650, 900))) * fin(e, 2900, 3150));
    if (e > 1750 && e < 3100) { const b = out(seg(e, 1750, 1950)); D.toucheBandage(48.4, 15.2, 0.55, 9, b); D.toucheBandage(48.4, 15.2, -0.55, 9, b); }
    if (e > 250 && e < 1500) D.dizzy(e, 1);
  } });
S('touche-epi', 'L’épi', 'tap', { pool: 'zone:tete', dur: 3000, anim: [[0, 'surpris'], [600, 'boudeur'], [1800, 'fier']], mood: 'confus',
  say: [[100, 1650, L('Tu m’as décoiffé !', 'Mon brushing !', 'Hé, ma coiffure !', 'Un épi ! Oh non !')],
    [1750, 2900, L('Bon… c’est la mode.', 'Décoiffé, c’est voulu.', 'Il résiste, cet épi !', 'Style punk, d’accord.')]],
  move: e => { const pat = hit(e, [750, 1050, 1350], 90); return { y: 10 * bump(seg(e, 0, 240)) + 8 * pat, sy: 1 - 0.06 * pat, r: 0.05 * io(e, 1750, 2000, 2400, 2800) }; },   // he pats it down: pat, pat, pat
  props: (D, e) => { if (e < 2850) D.toucheTuft(e < 250 ? out(seg(e, 0, 250)) : 1 - 0.75 * Math.min(1, hit(e, [750, 1050, 1350], 160)), e); } });
// --- the mouth ---
S('touche-croque', 'Croc !', 'tap', { pool: 'zone:bouche', dur: 2500, anim: [[0, 'parle'], [900, 'confus'], [1700, 'rire']], mood: 'excite',
  say: [[250, 1150, L('Croc croc !', 'Miam miam !', 'Gnac gnac !', 'Je te croque !')],
    [1250, 2350, L('…pas comestible.', 'Bof, goût doigt.', 'Pouah, du savon !', 'Il manque du sel.')]],
  move: (e, p, o) => { const k = bump(seg(e, 0, 600)), ch = hit(e, [280, 450], 70); return { x: clamp(o.tx, -120, 120) * 0.3 * k, y: clamp(o.ty, -20, 120) * 0.3 * k, sx: 1 + 0.08 * k + 0.07 * ch, sy: 1 + 0.08 * k - 0.1 * ch, r: 0.05 * Math.sin(e / 35) * io(e, 900, 1000, 1400, 1600) }; },
  props: (D, e) => { if (e > 250 && e < 900) { const c = D.P(76, 42); D.glyph(e < 450 ? 'CROC' : 'CROC !', c.x, c.y - seg(e, 250, 900) * 3 * D.U, 4.6 * D.U, D.col.acc); } } });
S('touche-chewing-gum', 'Le chewing-gum', 'tap', { pool: 'zone:bouche', dur: 3200, anim: [[0, 'bisou'], [1950, 'surpris'], [2450, 'rire']], mood: 'content',
  init: o => { o.spl = [0, 1, 2, 3, 4, 5, 6].map(i => { const a = i * TAU / 7 + rnd() * 0.5, r = 5 + rnd() * 5; return [Math.cos(a) * r * 1.3, Math.sin(a) * r * 0.8 + 1, 0.9 + rnd() * 0.7]; }); },
  say: [[100, 1850, L('Mâche, mâche…', 'Chewing-gum à la fraise !', 'Regarde ma bulle !', 'Mmmh… fraise.')],
    [2000, 3100, L('POP !', 'Oups, elle a éclaté !', 'J’en ai partout !', 'Encore une ?')]],
  move: e => { const ch = e < 600 ? Math.abs(Math.sin(e / 90)) : 0, pop = hit(e, [1950], 120); return { sy: 1 - 0.05 * ch - 0.12 * pop, sx: 1 + 0.03 * ch + 0.1 * pop, y: -8 * io(e, 600, 1900, 1950, 2100) + 4 * ch, x: 4 * Math.sin(e / 20) * io(e, 1950, 2000, 2200, 2400) }; },
  props: (D, e, p, o) => {
    if (e > 500 && e < 1950) D.toucheGum(sm(seg(e, 500, 1950)));
    if (e >= 1950 && e < 2950) { D.toucheSplat(seg(e, 1950, 2950), o.spl); if (e < 2400) { const c = D.P(74, 30); D.glyph('POP !', c.x, c.y, 5 * D.U, D.col.pink); } }
  } });
S('touche-fermeture', 'Bouche cousue', 'tap', { pool: 'zone:bouche', dur: 3400, anim: [[0, 'surpris'], [300, 'timide'], [1500, 'idle-sourit']], mood: 'content',
  say: [[100, 800, L('Chut ?', 'D’accord…', 'Motus !', 'Bouche cousue !')], [1200, 2500, L('Mmmh mmh !', 'Mmh mmmh mmh !', 'Mmmmh !', 'Mm-mmh.')],
    [2750, 3300, L('Ouf ! Je parle !', 'Bon, j’ai rien dit !', 'Pfiou !')]],
  move: e => ({ y: 10 * bump(seg(e, 0, 260)) + 6 * Math.abs(Math.sin(e / 160)) * io(e, 1200, 1300, 2400, 2550), sy: 1 - 0.04 * io(e, 450, 700, 2550, 2700), x: 4 * Math.sin(e / 40) * io(e, 1300, 1400, 2300, 2500) }),
  props: (D, e) => { const q = e < 450 ? 0 : e < 1100 ? sm(seg(e, 450, 1100)) : e < 2550 ? 1 : 1 - out(seg(e, 2550, 2750)); if (q > 0.02) D.toucheZip(q); } });
S('touche-langue', 'Bleuh !', 'tap', { pool: 'zone:bouche', dur: 2400, anim: [[0, 'rire'], [1500, 'clin-oeil']], mood: 'content',
  say: [[100, 2250, L('Bleuh !', 'Nananère !', 'Pfffrrt !', 'Bleuuuh, même pas peur !')]],
  move: e => { const k = fin(e, 1100, 1600); return { r: 0.1 * Math.sin(e / 80) * k, x: 10 * Math.sin(e / 80) * k, y: -6 * bump(seg(e, 1500, 1900)) }; },
  props: (D, e) => D.toucheTongue(io(e, 0, 200, 1450, 1650), 1.2 * Math.sin(e / 80) * fin(e, 1100, 1600)) });
// --- his sides (o.side: where the finger is) ---
S('touche-piece', 'La pièce qui tourne', 'tap', { pool: 'zone:cote', dur: 2700, anim: [[0, 'surpris'], [350, 'rire'], [1900, 'confus']], mood: 'excite',
  init: o => { o.heads = rnd() < 0.5; },
  say: [[200, 1750, L('Pile ou face ?', 'Fais un vœu !', 'Je tourne comme une pièce !', 'Wouhou, ça tourne !')],
    [1850, 2600, V(o => (o.heads ? '…face ! Gagné !' : '…pile ! Perdu !'), 'Tout tourne…')]],
  move: (e, p, o) => { const th = 4 * Math.PI * out(seg(e, 0, 1800)); return { sx: Math.cos(th), x: -o.side * 40 * Math.sin(th / 4) ** 2, y: -6 * bump(seg(e, 0, 1800)), r: 0.06 * wob(e, 1800, 300, 70) }; } });
S('touche-roue', 'La roue', 'tap', { pool: 'zone:cote', dur: 2800, anim: [[0, 'surpris'], [200, 'rire'], [1900, 'confus']], mood: 'excite',
  say: [[100, 1750, L('Je roule !', 'Wiii, en roue libre !', 'Attention, ça roule !', 'Rouli-roulant !')],
    [1850, 2700, L('Le mur… ouille.', 'Tout tourne…', 'J’ai le tournis.', 'Encore ? Non merci.')]],
  move: (e, p, o) => {                                      // rolls away from the finger, bumps into the edge, rolls back
    const d = -o.side, x = e < 700 ? 190 * out(seg(e, 0, 700)) : 190 * (1 - sm(seg(e, 760, 1850))), wall = 0.18 * hit(e, [720], 90);
    return { x: d * x, r: d * x / 30, sx: 1 - wall, y: -6 * Math.abs(Math.sin(x / 30)) };
  },
  props: (D, e) => { if (e > 1850 && e < 2700) D.dizzy(e, fin(e, 2400, 2700)); } });
S('touche-culbuto', 'Le culbuto', 'tap', { pool: 'zone:cote', dur: 2800, anim: [[0, 'surpris'], [600, 'rire'], [2000, 'fier']], mood: 'content',
  say: [[150, 1900, L('Je tombe pas !', 'Oh là là… ho hisse !', 'Culbuto !', 'Même pas tombé !')],
    [2000, 2700, L('Toujours debout !', 'Stable, moi.', 'Équilibre parfait !')]],
  move: (e, p, o) => { const r = -o.side * 0.42 * wob(e, 0, 650, 120); return { r, x: 150 * Math.sin(r), y: -40 * (1 - Math.cos(r)) }; },   // rocking on his round bottom
  props: (D, e) => { if (e > 300 && e < 1500) D.sweat(e); } });
S('touche-moonwalk', 'Le moonwalk', 'tap', { pool: 'zone:cote', dur: 3400, anim: [[0, 'surpris'], [250, 'danse'], [2900, 'fier']], mood: 'excite',
  say: [[300, 1700, L('Hi-hi !', 'Regarde mes pas !', 'Glisse, glisse…', 'Moonwalk !')],
    [2250, 3300, L('Hou !', 'Le roi de la piste !', 'Tu as vu ça ?', 'Et ça, c’est du style !')]],
  move: (e, p, o) => {
    const d = -o.side, gx = d * 160 * (sm(seg(e, 250, 1750)) - sm(seg(e, 2200, 3000))), bob = -6 * Math.abs(Math.sin(TAU * e / 520)) * io(e, 250, 350, 2900, 3000);
    const spin = e > 1750 && e < 2150 ? Math.cos(TAU * seg(e, 1750, 2150)) : 1;
    return { x: gx, y: bob - 12 * bump(seg(e, 1750, 2150)) - 8 * bump(seg(e, 0, 250)), sx: spin, sy: 1 + 0.08 * bump(seg(e, 1750, 2150)), r: -d * 0.06 * io(e, 300, 500, 1600, 1750) };
  },
  props: (D, e) => { if (e > 300 && e < 3000) D.notes(e); } });
// --- next to him (o.tx, o.ty: where) ---
S('touche-jaloux', 'Jaloux', 'tap', { pool: 'zone:ailleurs', dur: 3000, anim: [[0, 'surpris'], [300, 'boudeur'], [1800, 'content']], mood: 'confus',
  say: [[420, 1600, L('Hé ! C’est moi, ici !', 'Pourquoi tu touches là ?', 'Je suis là, moi !', 'Touche-moi plutôt !')],
    [1650, 2300, L('Voilà, c’est mieux.', 'Là, tu me touches.', 'Moi d’abord !', 'Jaloux, moi ? Jamais.')]],
  move: (e, p, o) => { const f = finger(o), k = out(seg(e, 80, 600)) * (1 - sm(seg(e, 2250, 2850))); return { x: clamp(f.x * 0.62, -205, 205) * k, y: clamp(f.y * 0.55, -110, 110) * k, s: 1 - 0.32 * k, r: 0.08 * Math.sin(e / 70) * io(e, 600, 700, 1600, 1800), sy: 1 + 0.08 * bump(seg(e, 0, 200)) }; } });
S('touche-ploc', 'Ploc !', 'tap', { pool: 'zone:ailleurs', dur: 2800, anim: [[0, 'curieux'], [850, 'surpris'], [1250, 'rire']], mood: 'ecoute',
  say: [[150, 900, L('Ploc !', 'Oh ? Une goutte ?', 'Plic, ploc…')],
    [1000, 2700, L('Je flotte sur l’onde !', 'Ça fait des vagues !', 'Glou… je fais bouchon.', 'Tsunami de pixels !')]],
  move: (e, p, o) => {                                      // the ripples reach him: he bobs like a cork
    const f = finger(o), t0 = Math.min(900, Math.hypot(f.x, f.y) / 0.45 * 0.75), a = f.x < 0 ? -1 : 1;
    return { x: f.x * 0.06 * io(e, 0, 250, 600, 900), r: a * 0.05 * io(e, 0, 250, 600, 900) + 0.07 * a * wob(e, t0, 500, 110), y: 18 * wob(e, t0, 420, 80) };
  },
  props: (D, e, p, o) => {
    const f = finger(o); if (e < 2000) D.toucheRipples(CX + f.x, CY + f.y, e);
    if (e < 500) D.glyph('ploc', CX + clamp(f.x, -350, 350), Math.max(64, CY + clamp(f.y, -185, 170) - 4 * BU), 4.4 * BU, D.col.hi);
  } });
S('touche-trace', 'La trace de doigt', 'tap', { pool: 'zone:ailleurs', dur: 3400, anim: [[0, 'curieux'], [700, 'reflechit'], [1100, 'content'], [2600, 'fier']], mood: 'ecoute',
  say: [[280, 1300, L('Une trace de doigt !', 'Hé, tu as sali l’écran !', 'Beurk, une empreinte !', 'Attends, je nettoie.')],
    [1400, 2750, L('Frotte, frotte…', 'Voilà, tout propre !', 'Comme neuf !', 'Brillant !')]],
  move: (e, p, o) => {                                      // he goes over there and rubs the glass clean
    const f = finger(o), k = out(seg(e, 0, 650)) * (1 - sm(seg(e, 2700, 3250))), rub = io(e, 800, 900, 2200, 2400);
    return { x: clamp(f.x * 0.55, -205, 205) * k + 12 * Math.sin(e / 55) * rub, y: clamp(f.y * 0.45, -115, 115) * k, s: 1 - 0.35 * k, r: 0.1 * Math.sin(e / 55) * rub };
  },
  props: (D, e, p, o) => {
    const f = finger(o), x = CX + clamp(f.x, -370, 370), y = CY + clamp(f.y, -190, 180);
    if (e < 2300) D.toucheFinger(x, y, e < 900 ? 3 : Math.max(0, 3 - Math.floor(seg(e, 900, 2200) * 3.2)));
    else if (e < 3000) D.toucheSparkle(x, y, (1.5 + 2.5 * bump(seg(e, 2300, 3000))) * BU);
  } });
S('touche-etoile-filante', 'L’étoile filante', 'tap', { pool: 'zone:ailleurs', dur: 3600, anim: [[0, 'surpris'], [450, 'etoiles'], [1700, 'reflechit'], [2800, 'content']], mood: 'excite',
  init: o => { const f = finger(o); o.sx0 = CX + clamp(f.x, -370, 370); o.sy0 = CY + clamp(f.y, -190, 120); o.dx = (f.x >= 0 ? -1 : 1) * 520; o.dy = 230; },
  say: [[100, 1500, L('Oh ! Une étoile filante !', 'Regarde, une étoile !', 'Tu l’as fait tomber ?', 'Waouh, une étoile !')],
    [1600, 2700, L('Vite, un vœu !', 'Je fais un vœu…', 'Chut, je fais un vœu.')], [2800, 3500, L('C’est secret !', 'Hé hé, devine.', 'Exaucé, j’espère !')]],
  move: (e, p, o) => {                                      // he follows the star with his eyes, then makes a wish
    const q = sm(seg(e, 150, 1500)), sx = o.sx0 + o.dx * q - CX;
    return { x: clamp(sx * 0.18, -60, 60) * fin(e, 1500, 2000), r: 0.06 * Math.sign(o.dx) * io(e, 0, 300, 1400, 1800), y: -10 * bump(seg(e, 0, 300)) - 10 * io(e, 1700, 2000, 2500, 2800) - 12 * bump(seg(e, 2800, 3250)) };
  },
  props: (D, e, p, o) => {
    if (e < 1600) { const q = sm(seg(e, 150, 1500)); D.toucheMeteor(o.sx0 + o.dx * q, o.sy0 + o.dy * q, o.dx, o.dy, e); }
    if (e > 1700 && e < 2800) D.toucheTwinkle(e, [[10, 14, 0], [86, 12, 1.5], [14, 44, 3], [84, 42, 4.5]]);
  } });

/* ======================= a few taps in a row (annoyed) ======================= */
S('touche-soupir', 'Le gros soupir', 'fache', { pool: 'annoyed', dur: 3000, anim: [[0, 'boudeur'], [1100, 'fatigue']], mood: 'confus',
  say: [[100, 950, L('Hmmmmm…', 'Inspire…', '…')], [1250, 2900, L('Haaaaa… patience.', 'Je reste calme. Zen.', 'Pfffff…', 'Bon. Respire, Pixel.')]],
  move: e => {
    const inh = out(seg(e, 0, 900)) * (1 - sm(seg(e, 900, 1500))), def = sm(seg(e, 1000, 1500)) * (1 - sm(seg(e, 2100, 2800)));   // breathe in... and out
    return { sy: 1 + 0.05 * inh - 0.1 * def, sx: 1 + 0.14 * inh + 0.05 * def, y: 6 * inh + 18 * def };
  },
  props: (D, e) => { if (e > 950 && e < 1900) D.toucheGust(seg(e, 950, 1900)); } });
S('touche-compte', 'Je compte jusqu’à trois', 'fache', { pool: 'annoyed', dur: 3400, anim: [[0, 'boudeur'], [2550, 'idle-sourit']], mood: 'fache',
  say: [[80, 700, L('Je compte jusqu’à trois !', 'Attention, je compte !')], [700, 1300, L('Un…')], [1300, 1900, L('…deux…')],
    [1900, 2500, L('…deux et demi…', '…deux et quart…')], [2550, 3300, L('Ouf, tu as arrêté.', 'Tu as de la chance !', 'Bon, ça ira pour cette fois.', 'Trois ! …non, je rigole.')]],
  move: e => { const n = hit(e, [80, 720, 1320, 1920], 90); return { sy: 1 - 0.08 * n, sx: 1 + 0.05 * n, y: 6 * n, x: 3 * Math.sin(e / 30) * io(e, 1900, 2000, 2400, 2550) }; },
  props: (D, e) => { for (const [t, n, c] of [[700, '1', 'fg'], [1300, '2', 'fg'], [1900, '2,5', 'acc']]) if (e > t && e < t + 600) { const p = D.P(86, 22); D.glyph(n, Math.min(p.x, W - 40), p.y, 7 * D.U * (1.15 - 0.15 * seg(e, t, t + 250)), D.col[c]); } } });
S('touche-repondeur', 'Le répondeur', 'fache', { pool: 'annoyed', dur: 3400, anim: [[0, 'idle-regard'], [250, 'parle'], [2350, 'boudeur']], mood: 'neutre',
  say: [[150, 2250, L('Pixel est absent pour l’instant.', 'Vous êtes bien chez Pixel…', 'Pixel ne peut pas répondre.', 'Bonjour, ici le répondeur.')],
    [2300, 3300, L('Laissez un message… BIIIP.', 'Rappelez plus tard. BIP.', 'Après le bip… BIIIP !')]],
  move: e => ({ y: -8 * bump(seg(e, 0, 250)), r: 0.05 * io(e, 200, 500, 2900, 3300), x: 2 * Math.sin(e / 10) * io(e, 2500, 2550, 2950, 3000) }),
  props: (D, e) => {
    const p = D.P(86, 34); if (e < 2400 && (e % 600) < 300) disc(D.g, Math.min(p.x, W - 20), p.y, 1.5 * D.U, D.col.acc);   // the little red light
    if (e > 2450 && e < 3150) { const c = D.P(84, 14); D.glyph('BIIIP', Math.min(c.x, W - 60), c.y, 4.6 * D.U, D.col.acc); }
  } });
S('touche-regard-noir', 'Le regard noir', 'fache', { pool: 'annoyed', dur: 3000, anim: [[0, 'boudeur'], [2350, 'idle-cligne']], mood: 'fache',
  say: [[520, 1350, L('…', '……', '…………')], [1400, 2900, L('Tu vois ce regard ?', 'Je t’ai à l’œil.', 'Regard noir. Très noir.', 'Je te surveille…')]],
  move: e => { const k = out(seg(e, 0, 1300)) * (1 - sm(seg(e, 2000, 2700))); return { s: 1 + 0.3 * k, sy: 1 - 0.14 * k, x: 1.5 * Math.sin(e / 16) * io(e, 1300, 1400, 1900, 2000) }; },   // closer, eyes narrowed
  props: (D, e) => { if (e > 1300 && e < 2000) D.vein(e); } });
S('touche-temps-mort', 'Temps mort', 'fache', { pool: 'annoyed', dur: 2800, anim: [[0, 'surpris'], [300, 'boudeur']], mood: 'confus',
  say: [[100, 1300, L('Temps mort !', 'Pause ! Pause !', 'Stop, arbitre !', 'On fait une pause ?')],
    [1400, 2700, L('Deux minutes de pause.', 'Je reprends mon souffle.', 'Les doigts sur le banc !', 'On souffle un peu.')]],
  move: e => { const k = out(seg(e, 0, 350)) * (1 - sm(seg(e, 2000, 2600))); return { y: 18 * k, sx: 1 - 0.06 * k, sy: 1 - 0.06 * k, x: -30 * k, r: 0.04 * bump(seg(e, 1000, 1300)) }; },
  props: (D, e) => { D.toucheTimeout(out(io(e, 150, 400, 2300, 2600))); if (e > 100 && e < 800) { const c = D.P(14, 14); D.glyph('TUUUT', Math.max(c.x, 60), c.y, 4.2 * D.U, D.col.fg); } } });
S('touche-ticket', 'Le ticket', 'fache', { pool: 'annoyed', dur: 3200, anim: [[0, 'idle-impatient'], [1100, 'parle'], [2400, 'boudeur']], mood: 'neutre',
  init: o => { o.n = 2 + Math.floor(rnd() * 97); },
  say: [[200, 1600, L('Prends un ticket.', 'Merci de prendre un numéro.', 'Guichet des câlins : ticket !', 'File d’attente, par ici.')],
    [1700, 3100, V(o => `Numéro ${o.n}, patientez.`, o => `Tu es le n° ${o.n}…`, 'Attente : trois heures.', 'Un agent va te répondre.')]],
  move: e => ({ y: -8 * bump(seg(e, 0, 220)), x: 1.5 * Math.sin(e / 12) * io(e, 200, 250, 950, 1000), r: -0.04 * io(e, 200, 500, 2600, 3100) }),
  props: (D, e, p, o) => D.toucheTicket(out(seg(e, 200, 1000)) * fin(e, 2800, 3100), o.n) });
S('touche-nuage-gris', 'Le petit nuage gris', 'fache', { pool: 'annoyed', dur: 3400, side: true, anim: [[0, 'boudeur'], [600, 'triste']], mood: 'triste',
  init: o => { o.d = rnd() < 0.5 ? -1 : 1; },
  say: [[400, 1800, L('Voilà, t’es content ?', 'Tu m’as gâché la journée.', 'Il pleut sur mon écran…', 'Petit nuage gris…')],
    [1850, 2650, L('Snif.', 'Ça mouille…', 'Laisse-moi tranquille…', 'Je suis tout trempé.')]],
  move: (e, p, o) => { const k = out(seg(e, 0, 500)) * (1 - sm(seg(e, 2650, 3200))); return { x: o.d * 150 * k + 2 * Math.sin(e / 30) * io(e, 600, 700, 2400, 2600), y: 30 * k, s: 1 - 0.45 * k }; },   // off to a corner, under his own cloud
  props: (D, e) => D.cloud(e, seg(e, 150, 600) * (1 - seg(e, 2650, 3000)), true) });

/* ======================= pestered a lot (angry, still cute) ======================= */
S('touche-volcan', 'Le volcan', 'fache', { pool: 'angry', dur: 3200, anim: [[0, 'colere'], [2300, 'fatigue']], mood: 'fache',
  say: [[100, 1750, L('Grrrrr…', 'Ça monte… ça monte…', 'Je vais exploser !', 'Attention, pression !')],
    [1900, 3100, L('PFFFFFF !', 'Bon… ça va mieux.', 'Éruption terminée.', 'Ouf, j’ai tout lâché.')]],
  move: e => {
    const pr = e < 1800 ? sm(seg(e, 0, 1800)) : 0, sh = e < 1800 ? (2 + 6 * pr) * Math.sin(e / 17) : 0, pop = hit(e, [1820], 120), def = io(e, 1900, 2200, 2500, 3000);
    return { x: sh, sy: 1 + 0.1 * pr - 0.14 * pop - 0.06 * def, sx: 1 + 0.04 * pr + 0.06 * pop + 0.05 * def, y: 10 * bump(seg(e, 0, 200)) + 6 * pr + 12 * def };
  },
  props: (D, e) => { if (e < 1800) D.vein(e); else { if (e < 2900) D.touchePuffs(e - 1800, fin(e, 2500, 2900)); if (e < 2600) D.steam(e); } } });
S('touche-taureau', 'Le taureau', 'fache', { pool: 'angry', dur: 3200, anim: [[0, 'colere'], [2350, 'rire']], mood: 'fache',
  say: [[100, 1200, L('Grrr… je charge !', 'Olé ?', 'Attention, taureau !', 'Gratte, gratte…')], [1500, 2250, L('CHAAARGE !', 'TAÏAUT !', 'MEUH !')],
    [2350, 3100, L('…je rigole. Mais arrête !', 'Pfff, t’as eu peur ?', 'La prochaine fois, je fonce !')]],
  move: e => {                                              // he scrapes the ground, charges at you, stops short
    const low = io(e, 0, 250, 1150, 1300), ch = e < 1200 ? 0 : e < 1500 ? inn(seg(e, 1200, 1500)) : 1 - sm(seg(e, 2300, 2900)), skid = hit(e, [1520], 120);
    return { y: 22 * low, r: -0.08 * low, x: 12 * Math.sin(e / 70) * low + 4 * Math.sin(e / 15) * skid, s: 1 + 0.42 * ch, sy: 1 - 0.1 * skid };
  },
  props: (D, e) => { if (e < 1250) D.toucheSnort(e); if (e < 2300) D.vein(e); } });
S('touche-feroce', 'Petit mais féroce', 'fache', { pool: 'angry', dur: 2800, anim: [[0, 'colere']], mood: 'fache',
  say: [[150, 2650, L('Je suis petit mais FÉROCE !', 'Grrr ! J’ai peur de rien !', 'Viens te battre !', 'Attention, je mords !')]],
  move: e => { const k = out(seg(e, 0, 250)) * (1 - sm(seg(e, 2100, 2650))); return { s: 1 - 0.5 * k, y: (40 + jumps(Math.max(0, e - 250), 230, 26)) * k, r: 0.1 * Math.sin(e / 45) * k, x: 30 * Math.sin(e / 300) * k }; },   // tiny furious hops
  props: (D, e) => { if (e > 250 && e < 2200) { D.vein(e); D.steam(e); } } });
S('touche-carton-rouge', 'Carton rouge', 'fache', { pool: 'angry', dur: 3000, anim: [[0, 'colere'], [1500, 'boudeur']], mood: 'fache',
  say: [[100, 1450, L('Carton rouge !', 'Faute ! Carton rouge !', 'Prrrt ! Expulsé !', 'Ça, c’est un carton !')],
    [1550, 2900, L('Au vestiaire, le doigt !', 'Hors du terrain !', 'Va réfléchir sur le banc.', 'Suspendu trois matchs !')]],
  move: e => { const k = out(seg(e, 0, 280)) * (1 - sm(seg(e, 2300, 2900))); return { x: -40 * k, r: -0.06 * k + 0.04 * Math.sin(e / 40) * io(e, 300, 400, 1200, 1400), y: -10 * bump(seg(e, 0, 280)) }; },
  props: (D, e) => { D.toucheCard(out(io(e, 150, 450, 2500, 2850)), D.col.acc); if (e > 100 && e < 800) { const c = D.P(16, 14); D.glyph('PRRRT !', Math.max(c.x, 70), c.y, 4.2 * D.U, D.col.fg); } } });
S('touche-alarme', 'L’alarme', 'fache', { pool: 'angry', dur: 2800, anim: [[0, 'panique'], [2000, 'boudeur']], mood: 'surpris',
  say: [[100, 1900, L('ALERTE ! Doigt en approche !', 'Wiou wiou wiou !', 'Alerte rouge !', 'Intrus ! Intrus !')], [2000, 2700, L('Fausse alerte.', 'Bon, c’est toi…', 'Alarme coupée.')]],
  move: e => { const k = fin(e, 1700, 2000); return { y: jumps(e, 280, 14) * k, x: 4 * Math.sin(e / 22) * k }; },
  props: (D, e) => D.toucheBeacon(e, out(io(e, 0, 200, 2200, 2600))) });

/* ======================= petting (a long press, a stroke) ======================= */
S('touche-ronron', 'Le ronron', 'calin', { pool: 'pet', dur: 3400, anim: [[0, 'amoureux'], [700, 'idle-somnole']], mood: 'amoureux',
  say: [[200, 3250, L('Rrrrrrr…', 'Ronron… ronron…', 'Prrrrr… c’est bon…', 'Rrrr… continue…')]],
  move: e => { const k = io(e, 0, 150, 2700, 3200); return { x: 1.8 * Math.sin(e / 8) * k, y: 8 * k, r: 0.04 * Math.sin(e / 600) * k, sy: 1 - 0.03 * k }; },   // a purr: he vibrates
  props: (D, e) => {
    D.blush(io(e, 0, 400, 2800, 3200));
    if (e < 3000) { const o = D.P(78, 30); for (let i = 0; i < 3; i++) { const q = ((e / 1500) + i / 3) % 1; D.glyph('r', o.x + q * 8 * D.U, o.y - q * 12 * D.U, (3 + q * 2) * D.U, D.col.pink); } }
  } });
S('touche-fond', 'Il fond', 'calin', { pool: 'pet', dur: 3400, anim: [[0, 'amoureux'], [900, 'idle-somnole'], [2550, 'content']], mood: 'amoureux',
  say: [[200, 2300, L('Je fonds…', 'Je suis une flaque d’amour…', 'Je dégouliiine…', 'Plus d’os, plus rien…')],
    [2450, 3300, L('Je me reforme !', 'Hop, solide à nouveau.', 'Ouf, je tiens debout.')]],
  move: e => { const k = out(seg(e, 0, 1400)) * (1 - sm(seg(e, 2350, 2900))), ov = 0.1 * bump(seg(e, 2700, 3150)); return { sy: 1 - 0.38 * k + ov, sx: 1 + 0.25 * k + 0.02 * Math.sin(e / 160) * k - ov * 0.5, y: 68 * k, x: 4 * Math.sin(e / 260) * k }; },
  props: (D, e) => {
    const q = io(e, 500, 1400, 2350, 2800);
    if (q > 0) { const c = D.P(48.4, 47.5), g = D.g; g.fillStyle = D.col.pink; g.beginPath(); g.ellipse(c.x, c.y, 18 * D.U * q, 2.2 * D.U * q, 0, 0, TAU); g.fill(); }   // a puddle of love
    if (e < 3000) D.hearts(e, 0.5);
  } });
S('touche-chat', 'Le chat', 'calin', { pool: 'pet', dur: 3400, anim: [[0, 'content'], [500, 'amoureux'], [2400, 'clin-oeil']], mood: 'content',
  say: [[200, 1800, L('Miaou ?', 'Mrrraou…', 'Je suis un chat, maintenant.', 'Prrr… miaou.')],
    [1900, 3250, L('Gratte derrière l’oreille !', 'Des croquettes ?', 'Miaou veut dire merci.', 'Encore, humain.')]],
  move: e => { const k = io(e, 0, 300, 2600, 3100); return { r: 0.12 * Math.sin(e / 260) * k, x: 22 * Math.sin(e / 260) * k, y: -4 * Math.abs(Math.sin(e / 260)) * k, sy: 1 + 0.06 * bump(seg(e, 0, 200)) }; },   // he rubs against your hand
  props: (D, e) => { const q = out(io(e, 0, 250, 2900, 3200)); D.toucheEars(q, e > 1400 && e < 1700 ? 2 * Math.sin((e - 1400) / 30) : 0); D.toucheWhiskers(q); } });
S('touche-fretille', 'Il frétille', 'calin', { pool: 'pet', dur: 2800, anim: [[0, 'etoiles'], [1800, 'rire']], mood: 'excite',
  say: [[150, 2650, L('Encore, encore !', 'Ouiii ! J’adore !', 'Je frétille !', 'Wouf ! Euh… merci.')]],
  move: e => { const k = io(e, 0, 120, 2000, 2500); return { r: 0.1 * Math.sin(e / 50) * k, x: 7 * Math.sin(e / 50) * k, y: jumps(e, 400, 14) * k }; },
  props: (D, e) => { if (e < 2500) D.toucheTwinkle(e, [[12, 20, 0], [84, 18, 1.7], [20, 46, 3.1], [78, 46, 4.4]]); } });
S('touche-batterie', 'Recharge de câlins', 'calin', { pool: 'pet', dur: 3400, anim: [[0, 'content'], [500, 'idle-somnole'], [2450, 'succes']], mood: 'content',
  say: [[200, 2350, L('Recharge de câlins…', 'Batterie câlins en charge…', 'Branché sur ton doigt…', 'Ça recharge, ça recharge…')],
    [2450, 3300, L('100 % ! Plein d’amour !', 'Batterie pleine !', 'Rechargé à bloc !', 'Merci, je tiens une semaine !')]],
  move: e => { const n = hit(e, [100, 700, 1300, 1900], 110); return { sy: 1 + 0.06 * n, sx: 1 - 0.03 * n, y: -4 * n - 13 * bump(seg(e, 2450, 2900)) }; },
  props: (D, e) => {
    const lvl = e < 100 ? 0 : Math.min(4, 1 + Math.floor((e - 100) / 600)), q = io(e, 0, 200, 3000, 3300);
    D.toucheBattery(lvl, q);
    if (q > 0.5) { const c = D.P(88, 27); D.glyph(`${lvl * 25} %`, Math.min(c.x, W - 14 - 3 * D.U), c.y + 9 * D.U, 3.6 * D.U, lvl >= 4 ? D.col.hi : D.col.fg); }
    if (e > 2450 && e < 3200) D.toucheTwinkle(e, [[80, 14, 0], [94, 22, 2], [80, 42, 4]]);
  } });
S('touche-petit-nuage', 'Sur un petit nuage', 'calin', { pool: 'pet', dur: 3400, anim: [[0, 'amoureux'], [700, 'zen'], [2700, 'content']], mood: 'amoureux',
  say: [[300, 2500, L('Je suis sur un petit nuage…', 'Je plane, je plane…', 'Le paradis des pixels…', 'Tout doux, tout doux…')],
    [2800, 3300, L('Redescente en douceur.', 'Quel beau voyage.', 'Merci pour le nuage !')]],
  move: e => { const k = out(seg(e, 0, 900)) * (1 - sm(seg(e, 2350, 2950))); return { y: (-10 + 4 * Math.sin(e / 400)) * k, x: 18 * Math.sin(e / 700) * k, r: 0.05 * Math.sin(e / 500) * k }; },   // floating, gently (his bubble stays above him)
  props: (D, e) => D.toucheCloud9(out(io(e, 0, 350, 2800, 3200))) });
S('touche-papouilles', 'Là, juste là !', 'calin', { pool: 'pet', dur: 3200, anim: [[0, 'amoureux'], [900, 'rire'], [2400, 'content']], mood: 'amoureux',
  init: o => { o.d = rnd() < 0.5 ? -1 : 1; },
  say: [[150, 900, L('Oh oui… là…', 'Un peu à gauche…', 'Juste là…', 'Mmmh, là…')],
    [950, 3050, L('LÀ ! JUSTE LÀ !', 'Ma patte bat toute seule !', 'C’est trop bon !', 'Arrête pas ! Arrête pas !')]],
  move: (e, p, o) => { const t = io(e, 0, 400, 2300, 2900), th = io(e, 900, 950, 2100, 2300); return { r: o.d * 0.14 * t, x: o.d * 18 * t, y: 5 * Math.sin(e / 14) * th }; },   // head tilted into it, then the leg thumps
  props: (D, e) => { if (e > 900 && e < 2250) { const i = Math.floor(e / 150) % 2, c = D.P(i ? 30 : 66, 50); D.glyph('pan', c.x, c.y, 3.4 * D.U, D.col.dim); } D.blush(io(e, 200, 500, 2600, 3000)); } });
S('touche-fleurs', 'Les fleurs', 'calin', { pool: 'pet', dur: 3400, anim: [[0, 'amoureux'], [1200, 'etoiles'], [2600, 'content']], mood: 'amoureux',
  say: [[300, 2400, L('Tu fais pousser des fleurs !', 'Mon cœur fleurit…', 'Ça sent le printemps !', 'Des fleurs partout !')],
    [2500, 3300, L('C’est grâce à toi.', 'Un bouquet pour toi !', 'Atchoum ! Le pollen…')]],
  move: e => { const n = hit(e, FLOWERS.map(f => f[3]), 120); return { r: 0.05 * Math.sin(e / 400) * fin(e, 2600, 3100), sy: 1 + 0.05 * n, y: -4 * n - 8 * bump(seg(e, 0, 300)) }; },
  props: (D, e) => { for (const [x, y, h, t] of FLOWERS) if (e > t && e < 3200) D.toucheFlower(x, y, h * BU, out(seg(e, t, t + 350)) * fin(e, 2950, 3200), D.col.pink); } });
});
