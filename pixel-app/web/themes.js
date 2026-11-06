/* Pixel OS themes. Each theme draws the background, headers, panels, bars, icons, the boot splash and the face:
   retro (green CRT, pixel blocks), moderne (glowing eyes that bounce), manga (big shiny anime eyes on paper),
   neon (synthwave tubes on a scrolling grid), croquis (pencil sketch on lined paper), lcd (4-shade pocket console).
   The face is alive: PixelLife (below) moves it, the theme draws it. Vector themes share a mood rig (numbers blended
   during transitions), pixel themes share bitmaps (dissolved block by block). */
/* Every face mood that every theme can draw. Used by the server, the Stream Deck and the test lab:
   add new moods here (id = ascii, used in commands; name = French label; desc = when it shows). */
window.PixelMoods = [
  { id: 'neutre', name: 'Neutre', desc: 'Par défaut : cligne des yeux, regarde autour de lui, suit ton doigt.' },
  { id: 'content', name: 'Content', desc: 'Quand tu le touches, quand Codex réussit.' },
  { id: 'surpris', name: 'Surpris', desc: 'Notification, fin du minuteur, réveil en sursaut.' },
  { id: 'amoureux', name: 'Amoureux', desc: 'Quand tu lui dis merci, ou quand tu le caresses du doigt.' },
  { id: 'clin', name: "Clin d'œil", desc: 'Après une blague.' },
  { id: 'endormi', name: 'Endormi', desc: 'Après un moment sans rien faire.' },
  { id: 'reflechit', name: 'Réfléchit', desc: 'Pendant que Claude prépare sa réponse.' },
  { id: 'ecoute', name: 'Écoute', desc: 'Pendant que tu écris à Claude.' },
  { id: 'triste', name: 'Triste', desc: 'Quand quelque chose rate : Claude injoignable, erreur.' },
  { id: 'fache', name: 'Fâché', desc: 'Quand tu le tapotes trop vite.' },
  { id: 'confus', name: 'Confus', desc: "Quand il n'a pas compris." },
  { id: 'excite', name: 'Excité', desc: 'Des étoiles plein les yeux : une super nouvelle.' },
  { id: 'fier', name: 'Fier', desc: 'Lunettes de soleil : il a réussi un truc.' },
  { id: 'malade', name: 'Malade', desc: 'Quand le Raspberry Pi chauffe trop (plus de 80 °C).' },
  { id: 'baille', name: 'Bâille', desc: "Quand il s'ennuie, juste avant de s'endormir." },
];

/* ---------- Pixel's life (shared by every theme) ----------
   One PixelLife per face on screen. Call life.update(now, mood, opts) once per frame: it returns the state `a`
   that theme.face(cx, cy, u, a.mood, a.lx, a.ly, a) draws from:
     a.mood, a.from, a.k  mood shown, previous mood, transition progress (0 -> 1, eased, about 220 ms)
     a.since              ms since a.mood started (yawns, tears and other loops start from there)
     a.blink              0 open .. 1 closed (single blinks, sometimes double)
     a.lx, a.ly           gaze, about -1.6..1.6 and -1..1: saccades, slow drift, follows the finger
     a.sq                 squash: + wider and flatter, - taller and thinner (touch, landings, stretch)
     a.hop                lift in face units u (bounces, little hops)
     a.tilt               head tilt in radians (confused, shaken when angry, fidgets)
     a.squint             0..1 eyes narrowed (a bored fidget)
     a.breath             -1..1 slow breathing wave
     a.press              a finger is on the face
     a.act                idle action: '', 'baille' (yawn), 'etire' (stretch), 'saut' (hop), 'bof' (fidget)
   opts: { look: {x, y} gaze target from the finger or null, idle: ms without input, sleepIn: ms before Pixel
   falls asleep, calm: true = no idle actions (mini faces, reduced motion) }.
   When it shows a neutral face, life can swap in 'baille' for a yawn: always draw a.mood. */
window.PixelLife = (cfg = {}) => {
  const rnd = Math.random, clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v)), smooth = x => x * x * (3 - 2 * x);
  const TR = cfg.transition || 220;
  // where the eyes go in some moods
  const GAZE = { reflechit: [1.5, -1], endormi: [0, 0.45], triste: [-0.25, 0.8], malade: [0.1, 0.4], baille: [0, -0.45], fier: [0.55, -0.15] };
  // a little physical kick when the mood changes: [hop, squash]
  const KICK = { surpris: [1.5, -0.4], excite: [1.3, -0.3], content: [0.8, -0.15], amoureux: [0.6, -0.1], clin: [0.5, -0.05], fier: [0.6, -0.15],
    confus: [0.4, 0.1], fache: [0.2, 0.35], triste: [0, 0.3], malade: [0, 0.25], baille: [0.2, -0.3], ecoute: [0.35, -0.05], reflechit: [0.25, 0.05],
    neutre: [0.25, 0.1], endormi: [0, 0.2] };
  const a = { t: 0, mood: null, from: null, k: 1, since: 0, blink: 0, lx: 0, ly: 0, sq: 0, hop: 0, tilt: 0, squint: 0, breath: 0, press: false, act: '' };
  const sq = { x: 0, v: 0 }, hop = { x: 0, v: 0 }, tilt = { x: 0, v: 0 }, gaze = { tx: 0, ty: 0, next: 0 };
  const blink = { t: -1e9, next: 1200 + rnd() * 1500, again: 0 };
  let born = null, t0 = 0, last = -1, act = null, next = null, yawned = false, taps = [], pet = { d: 0, turns: 0, dir: 0, t: 0 }, shake = 0;
  const spring = (s, to, k, c, dt) => { for (let i = 0; i < 2; i++) { s.v += (-k * (s.x - to) - c * s.v) * dt / 2; s.x += s.v * dt / 2; } };
  const start = (id, now, dur, kind = '') => { act = { id, t0: now, dur, kind }; a.act = id; };
  function idle(now, o, mood) {
    if (o.calm || mood !== 'neutre' || a.press || o.look) { if (act && (mood !== 'neutre' || a.press)) { act = null; a.act = ''; } return; }
    if (act) return;
    const quiet = o.idle == null ? now - born : o.idle, sleepIn = o.sleepIn == null ? Infinity : o.sleepIn;
    if (!next) next = { saut: now + 6000 + rnd() * 7000, bof: now + 11000 + rnd() * 9000, etire: now + 26000 + rnd() * 20000, baille: now + 48000 + rnd() * 40000 };
    if (sleepIn < 25000 && !yawned) { yawned = true; return start('baille', now, 3000); }
    if (sleepIn > 25000) yawned = false;
    if (quiet > 40000 && now > next.baille) { next.baille = now + 70000 + rnd() * 70000; return start('baille', now, 3000); }
    if (quiet > 20000 && now > next.etire) { next.etire = now + 40000 + rnd() * 40000; return start('etire', now, 1600); }
    if (quiet > 9000 && now > next.bof) { next.bof = now + 10000 + rnd() * 14000; return start('bof', now, 1500, ['squint', 'wiggle', 'down', 'puff'][Math.floor(rnd() * 4)]); }
    if (quiet > 4000 && now > next.saut) { next.saut = now + 7000 + rnd() * 9000; hop.v += 7 + rnd() * 3; return start('saut', now, 700); }
  }
  return {
    state: a,
    update(now, mood, o = {}) {
      if (born === null) born = now;
      const dt = last < 0 ? 16 : clamp(now - last, 0, 60), s = dt / 1000; last = now; a.t = now;
      idle(now, o, mood);
      let eff = mood, p = 0;
      if (act) { p = (now - act.t0) / act.dur; if (p >= 1) { act = null; a.act = ''; } else if (act.id === 'baille') eff = 'baille'; }
      // mood transitions
      if (a.mood === null) { a.mood = a.from = eff; t0 = now - TR; }
      if (eff !== a.mood) {
        a.from = a.k < 0.5 ? a.from : a.mood; a.mood = eff; t0 = now;
        const kk = KICK[eff] || KICK.neutre; if (!o.calm) { hop.v += kk[0] * 9; sq.v += kk[1] * 9; }
        if (eff === 'fache') shake = now + 500;
      }
      a.k = smooth(clamp((now - t0) / TR, 0, 1)); a.since = now - t0;
      // blinks: every 2 to 6 s, one in five is double
      if (now > blink.next) { blink.t = now; blink.again = rnd() < 0.2 ? now + 300 : 0; blink.next = now + 2200 + rnd() * 4200; }
      if (blink.again && now > blink.again) { blink.t = now; blink.again = 0; }
      const bp = (now - blink.t) / 170;
      a.blink = bp < 0 || bp >= 1 ? 0 : bp < 0.38 ? smooth(bp / 0.38) : 1 - smooth((bp - 0.38) / 0.62);
      // gaze: the finger, a mood, or looking around (quick saccades, then a slow drift)
      let tx, ty, lag;
      if (o.look) { tx = o.look.x; ty = o.look.y; lag = 60; }
      else if (eff === 'confus') { tx = 0.9 * Math.sign(Math.sin(a.since / 950 + 0.3)); ty = -0.35; lag = 110; }
      else if (GAZE[eff]) { [tx, ty] = GAZE[eff]; lag = 140; }
      else if (act && act.kind === 'down') { tx = -0.6; ty = 0.95; lag = 160; }
      else {
        if (now > gaze.next) {
          const c = rnd() < 0.33, nx = c ? 0 : (rnd() * 2 - 1) * 1.5, ny = c ? 0 : (rnd() * 2 - 1) * 0.85;
          if (Math.hypot(nx - gaze.tx, ny - gaze.ty) > 1.2 && now - blink.t > 800 && rnd() < 0.4) blink.t = now;   // big jumps come with a blink
          gaze.tx = nx; gaze.ty = ny; gaze.next = now + 1100 + rnd() * 2900;
        }
        tx = gaze.tx + 0.13 * Math.sin(now / 1270) + 0.06 * Math.sin(now / 530 + 1.3); ty = gaze.ty + 0.09 * Math.sin(now / 1610 + 0.7); lag = 36;
      }
      const ge = 1 - Math.exp(-dt / lag); a.lx += (tx - a.lx) * ge; a.ly += (ty - a.ly) * ge;
      // body: squash spring, hop spring (with a squash when it lands), tilt spring
      const st = act && act.id === 'etire' ? -0.34 * Math.sin(Math.min(1, p * 1.25) * Math.PI) : 0, puff = act && act.kind === 'puff' ? 0.12 * Math.sin(p * Math.PI) : 0;
      spring(sq, a.press ? 0.22 : st + puff, 170, 11, s);
      const up = hop.x > 0.1; spring(hop, 0, 95, 9.5, s); if (up && hop.x <= 0 && hop.v < -2) sq.v += -hop.v * 0.35;
      let tt = eff === 'confus' ? 0.14 : eff === 'fier' ? -0.05 : 0;
      if (now < shake) tt += 0.08 * Math.sin((shake - now) / 22);
      if (act && act.kind === 'wiggle') tt += 0.08 * Math.sin(p * Math.PI * 4);
      if (act && act.id === 'etire') tt += 0.05 * Math.sin(p * Math.PI * 2);
      spring(tilt, tt, 75, 9, s);
      a.sq = clamp(sq.x, -0.45, 0.45); a.hop = clamp(hop.x, -0.5, 3); a.tilt = clamp(tilt.x, -0.35, 0.35);
      a.squint += ((act && act.kind === 'squint' ? 0.55 : 0) - a.squint) * (1 - Math.exp(-dt / 90));
      a.breath = Math.sin(now / 1300);
      return a;
    },
    press(on) { if (a.press && !on) hop.v += 8; a.press = !!on; },              // squash under the finger, bounce on release
    tap(now) { taps = taps.filter(t => now - t < 2500); taps.push(now); if (taps.length >= 5) { taps = []; return 'fache'; } return ''; },
    rub(dx, dy, now) {                                                            // petting: back-and-forth strokes while pressed
      if (!a.press) return '';
      if (now - pet.t > 600) pet = { d: 0, turns: 0, dir: 0, t: now };
      const dir = Math.abs(dx) > 2 ? Math.sign(dx) : 0;
      pet.d += Math.hypot(dx, dy); pet.t = now; if (dir && dir !== pet.dir) { if (pet.dir) pet.turns++; pet.dir = dir; }
      if (pet.d > 420 && pet.turns >= 3) { pet = { d: 0, turns: 0, dir: 0, t: now }; return 'amoureux'; }
      return '';
    },
    kick(h = 1, q = -0.1) { hop.v += h * 9; sq.v += q * 9; },
  };
};

window.PixelThemes = H => {
const X = H.X, W = 800, HT = 480, TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, k) => a + (b - a) * k, smooth = x => x * x * (3 - 2 * x);
const SC = () => H.S || 2;                                  // backing store scale (2 = 1600x960)
const sb = v => H.RM ? 0 : v * SC() / 2;                    // shadowBlur ignores the transform: keep glows the same size at any scale
function rr(x, y, w, h, r) { X.beginPath(); if (X.roundRect) X.roundRect(x, y, w, Math.max(0, h), Math.max(0, Math.min(r, w / 2, h / 2))); else X.rect(x, y, w, h); }
function ell(x, y, rx, ry) { X.beginPath(); X.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU); }
function heart(x, y, s) {
  X.beginPath(); X.moveTo(x, y + s * 0.95);
  X.bezierCurveTo(x - s * 1.35, y + s * 0.1, x - s * 0.95, y - s * 1.05, x, y - s * 0.35);
  X.bezierCurveTo(x + s * 0.95, y - s * 1.05, x + s * 1.35, y + s * 0.1, x, y + s * 0.95); X.closePath();
}
function star(x, y, r, points = 4, inner = 0.3, rot = 0) { X.beginPath(); for (let i = 0; i < points * 2; i++) { const a = i / (points * 2) * TAU - Math.PI / 2 + rot, d = i % 2 ? r * inner : r; X.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); } X.closePath(); }
function cloudPath(x, y, k) {   // puffy cloud centred on x, y; k = scale (1 = 180 px wide)
  X.beginPath();
  for (const [dx, dy, r] of [[-52, 14, 34], [-14, -14, 46], [34, -2, 38], [62, 22, 26]]) { X.moveTo(x + (dx + r) * k, y + dy * k); X.arc(x + dx * k, y + dy * k, r * k, 0, TAU); }
  X.rect(x - 52 * k, y + 14 * k, 114 * k, 34 * k);
}
const hexA = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
/* the life state for a face; without one (test lab, old callers) a still face that still blinks and breathes */
function life(a, md, lx = 0, ly = 0) {
  if (a && a.mood === md) return a;
  const t = H.now, p = H.blinkP ? H.blinkP() : -1;
  return { t, mood: md, from: md, k: 1, since: t, blink: p >= 0 && p < 1 ? Math.sin(p * Math.PI) : 0, lx, ly, sq: 0, hop: 0, tilt: 0, squint: 0, breath: Math.sin(t / 1300), press: false, act: '' };
}
/* vector faces: blend two mood parameter sets during a transition. table[mood] = {key: number}, base = every key with its default */
function mixP(table, a, base) {
  const A = table[a.from] || table.neutre || {}, B = table[a.mood] || table.neutre || {}, o = {};
  for (const key in base) { const va = key in A ? A[key] : base[key], vb = key in B ? B[key] : base[key]; o[key] = a.k >= 1 ? vb : va + (vb - va) * a.k; }
  return o;
}
/* squash and stretch around a point under the face (piv face units below cy), lift and tilt. Call between save/restore. */
function body(cx, cy, u, a, piv = 9) { const py = cy + piv * u; X.translate(cx, py - a.hop * u); X.rotate(a.tilt); X.scale(1 + 0.5 * a.sq, 1 - 0.5 * a.sq); X.translate(-cx, -py); }
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (i, j) => (B4[(j & 3) * 4 + (i & 3)] + 0.5) / 16;   // ordered dither threshold for pixel transitions
/* shared timings so every theme yawns, cries and sparkles in step */
function yawn(a) {           // {m: mouth opening 0..1, e: eyes squeezed 0..1}; one yawn every 3 s
  const p = (a.since % 3000) / 3000;
  const m = p < 0.12 ? 0.2 * p / 0.12 : p < 0.45 ? 0.2 + 0.8 * smooth((p - 0.12) / 0.33) : p < 0.62 ? 1 - 0.06 * Math.sin((p - 0.45) / 0.17 * Math.PI) : p < 0.85 ? 1 - smooth((p - 0.62) / 0.23) : 0;
  return { m, e: clamp(m * 1.6 - 0.25, 0, 1) };
}
const cyc = (a, ms, off = 0) => ((a.since + off) % ms) / ms;     // 0..1 loop since the mood started
const caches = {};
function cached(key, w, h, draw) {   // offscreen canvas at the backing scale, drawn once (again if the scale changes)
  const S = SC(); let c = caches[key];
  if (!c || c.S !== S) { c = caches[key] = document.createElement('canvas'); c.S = S; c.width = Math.ceil(w * S); c.height = Math.ceil(h * S); const g = c.getContext('2d'); g.scale(S, S); draw(g, w, h); }
  return c;
}
const blink = () => { const p = H.blinkP(); return p >= 0 && p < 1 ? Math.sin(p * Math.PI) : 0; };   // 0 open .. 1 closed

/* =================== shared vector face rig ===================
   Every mood is a set of numbers (eyes, mouth, extras). During a transition two sets are blended (mixP), so the
   vector themes morph from one mood to the next instead of cutting. Each theme draws the numbers its own way.
   Eyes: ew/eh size, open (blinks), happy (^ eyes, a lid pushed up from below), lid (top lid cover), slant
   (+ angry: inner corners down, - sad: inner corners up), pup (pupil size), heart / star / shades (special eyes),
   rOpen / rHappy (right eye only: wink, confused squint), eyeY (u). Mouth: mw width (u), mc curve (+ smile,
   - frown), mo opening, mround (O shape), mwave (wobbly), mbars (sound bars), mskew (smirk), mteeth.
   Extras (0..1): blush, zzz, hearts, dots, bang, tear, anger, quest, sweat, sparkle, tint (sick), yawn. */
const FB = { ew: 1, eh: 1, open: 1, happy: 0, lid: 0, slant: 0, pup: 1, heart: 0, star: 0, shades: 0, rOpen: 1, rHappy: 0, eyeY: 0,
  mw: 3.6, mc: 0.55, mo: 0, mround: 0, mwave: 0, mbars: 0, mskew: 0, mteeth: 0,
  blush: 0.7, zzz: 0, hearts: 0, dots: 0, bang: 0, tear: 0, anger: 0, quest: 0, sweat: 0, sparkle: 0, tint: 0, yawn: 0 };
const FM = {
  neutre: {},
  content: { happy: 1, mc: 1, mo: 0.5, mw: 4.6, blush: 1 },
  surpris: { ew: 1.12, eh: 1.08, pup: 0.5, mc: 0, mo: 0.45, mround: 1, mw: 2.4, bang: 1, blush: 0 },
  amoureux: { heart: 1, mc: 1, mo: 0.28, mw: 4.4, hearts: 1, blush: 1 },
  clin: { rHappy: 1, mc: 1, mo: 0.32, mw: 4.4, mskew: 0.3, sparkle: 1, blush: 1 },
  endormi: { lid: 1, eyeY: 0.6, mc: 0, mo: 0.16, mround: 1, mw: 1.6, zzz: 1, blush: 0.45 },
  reflechit: { lid: 0.36, mc: 0.05, mw: 2.6, mskew: 0.7, dots: 1, blush: 0 },
  ecoute: { ew: 1.05, eh: 1.06, mc: 0, mbars: 1, mw: 4.2 },
  triste: { slant: -1, lid: 0.18, pup: 1.1, mc: -0.9, mw: 3.2, tear: 1, blush: 0.25, eyeY: 0.3 },
  fache: { slant: 1, lid: 0.28, pup: 0.8, mc: -0.8, mo: 0.42, mw: 4, mteeth: 1, anger: 1, blush: 0 },
  confus: { ew: 1.08, eh: 1.06, rOpen: 0.45, mc: 0, mwave: 1, mw: 3.8, quest: 1, blush: 0.3 },
  excite: { ew: 1.08, eh: 1.08, star: 1, mc: 1, mo: 0.95, mw: 5.4, sparkle: 1, blush: 1 },
  fier: { shades: 1, mc: 0.85, mskew: 0.85, mw: 4.2, blush: 0.35 },
  malade: { lid: 0.48, slant: -0.35, pup: 0.85, mc: -0.15, mwave: 1, mw: 3.8, tint: 1, sweat: 1, blush: 0 },
  baille: { yawn: 1, mc: 0, mround: 1, mw: 2.8, blush: 0.4 },
};
const moodTable = over => Object.fromEntries(Object.keys(FM).map(k => [k, { ...FM[k], ...(over[k] || {}) }]));
function rig(a, table = FM, base = FB) {   // this frame's numbers: the blended mood, plus blinks, squints and yawns
  const p = mixP(table, a, base);
  p.open *= 1 - 0.94 * a.blink * (1 - p.happy) * (1 - p.lid * p.lid) * (1 - p.shades);
  p.lid = Math.max(p.lid, 0.42 * a.squint);
  if (p.yawn > 0.01) { const y = yawn(a); p.open = lerp(p.open, 1 - 0.9 * y.e, p.yawn); p.lid = lerp(p.lid, 0.25 * (1 - y.e), p.yawn); p.mo = lerp(p.mo, 0.1 + 0.9 * y.m, p.yawn); p.eyeY += 0.5 * y.e * p.yawn; }
  return p;
}
/* mouth outline from the numbers: upper lip left to right, then lower lip right to left (a closed polygon) */
function mouthPts(mx, my, u, p, t) {
  const N = 10, hw = p.mw * u / 2, sk = p.mskew, pts = [];
  const cL = -p.mc * 1.15 * u * (1 - 0.85 * sk), cR = -p.mc * 1.15 * u * (1 + 0.3 * sk), mid = p.mc * 0.55 * u + sk * 0.15 * u;
  const op = p.mo * (p.mc >= 0 ? 3.2 : 2.2) * u, rx = (0.9 + 0.9 * p.mo) * u, ry = (0.5 + 2.6 * p.mo) * u, oy = my + 0.25 * u + ry * 0.3;
  const q = (y0, y1, ym, s) => { const c = 2 * ym - (y0 + y1) / 2; return (1 - s) * (1 - s) * y0 + 2 * s * (1 - s) * c + s * s * y1; };
  const midU = lerp(mid, (cL + cR) / 2 + 0.2 * u, clamp(p.mo * 1.7, 0, 1) * (p.mc > 0 ? Math.min(1, p.mc) : 0));   // open smiles get a flatter upper lip
  for (let i = 0; i <= 2 * N + 1; i++) {
    const up = i <= N, s = up ? i / N : 1 - (i - N - 1) / N;
    let x = mx - hw + 2 * hw * s + sk * 0.5 * u, y = my + q(cL, cR, up ? midU : mid + op, s);
    if (p.mwave > 0.01) y += p.mwave * 0.45 * u * Math.sin(s * Math.PI * 4 + t / 240) * Math.sin(s * Math.PI);
    if (p.mround > 0.01) { const th = up ? Math.PI + s * Math.PI : (1 - s) * Math.PI; x = lerp(x, mx + rx * Math.cos(th), p.mround); y = lerp(y, oy + ry * Math.sin(th), p.mround); }
    pts.push(x, y);
  }
  return pts;
}
function poly(pts) { X.beginPath(); for (let i = 0; i < pts.length; i += 2) i ? X.lineTo(pts[i], pts[i + 1]) : X.moveTo(pts[i], pts[i + 1]); X.closePath(); }
function lipLine(pts) { const n = pts.length / 4; X.beginPath(); for (let i = 0; i < n; i++) i ? X.lineTo(pts[2 * i], pts[2 * i + 1]) : X.moveTo(pts[0], pts[1]); }
/* clip away the lids of an eye centred on x, y (w x h): the top lid (sleepy, slanted when sad or angry) and the
   lower "happy" lid that turns the eye into a ^ arch. side: -1 left eye, +1 right eye. */
function lidClip(x, y, w, h, lid, slant, happy, side) {
  const cover = clamp(lid * 0.87 + Math.abs(slant) * 0.2, 0, 1) * h, sl = -side * slant * 0.5, top = y - h / 2 + cover, L = x - 2 * w, R = x + 2 * w;
  if (cover > 0.01 || Math.abs(slant) > 0.01) { X.beginPath(); X.moveTo(L, top + sl * (L - x)); X.lineTo(R, top + sl * (R - x)); X.lineTo(R, y + 3 * h); X.lineTo(L, y + 3 * h); X.closePath(); X.clip(); }
  if (happy > 0.01) { const r = 0.66 * w; X.beginPath(); X.rect(L, y - 3 * h, 4 * w, 6 * h + 4 * r); X.arc(x, y + h / 2 + r - happy * h * 0.75, r, 0, TAU); X.clip('evenodd'); }
}
/* the outline of an eye as a polygon, for the outlined styles (neon tubes, pencil): a rounded rect w x h whose
   bottom is pushed up onto the happy-lid disc (^ eyes), then cut by the top lid line (sleepy, sad, angry) */
function eyePoly(x, y, w, h, lid, slant, happy, side, rad = 0.44) {
  const r = Math.min(w, h) * rad, x0 = x - w / 2 + r, x1 = x + w / 2 - r, y0 = y - h / 2 + r, y1 = y + h / 2 - r;
  let pts = [];
  for (const [ax, ay, a0] of [[x1, y0, -Math.PI / 2], [x1, y1, 0], [x0, y1, Math.PI / 2], [x0, y0, Math.PI]]) {
    for (let i = 0; i <= 6; i++) { const t = a0 + i / 6 * Math.PI / 2; pts.push([ax + Math.cos(t) * r, ay + Math.sin(t) * r]); }
    const [bx, by] = pts[pts.length - 1], nx = a0 === -Math.PI / 2 ? [x1 + r, y1] : a0 === 0 ? [x0, y1 + r] : a0 === Math.PI / 2 ? [x0 - r, y0] : [x1, y0 - r];
    for (let i = 1; i < 4; i++) pts.push([lerp(bx, nx[0], i / 4), lerp(by, nx[1], i / 4)]);
  }
  if (happy > 0.01) {                  // push the points inside the lid disc up onto its edge
    const R = 0.66 * w, dc = y + h / 2 + R - happy * h * 0.75;
    pts = pts.map(([px, py]) => { const dx = px - x; if (Math.abs(dx) >= R) return [px, py]; const top = dc - Math.sqrt(R * R - dx * dx); return [px, Math.min(py, top)]; });
  }
  const cover = clamp(lid * 0.87 + Math.abs(slant) * 0.2, 0, 1) * h;
  if (cover > 0.01 || Math.abs(slant) > 0.01) {   // keep what is under the lid line (Sutherland-Hodgman against one line)
    const sl = -side * slant * 0.5, top = y - h / 2 + cover, f = ([px, py]) => py - (top + sl * (px - x)), out = [];
    for (let i = 0; i < pts.length; i++) {
      const A = pts[i], B = pts[(i + 1) % pts.length], fa = f(A), fb = f(B);
      if (fa >= 0) out.push(A);
      if ((fa >= 0) !== (fb >= 0)) { const k = fa / (fa - fb); out.push([lerp(A[0], B[0], k), lerp(A[1], B[1], k)]); }
    }
    pts = out.length > 2 ? out : [[x - w / 2, top], [x + w / 2, top + sl * w]];
  }
  return pts.flat();
}
const mixC = (c1, c2, k) => { const p = (c, i) => parseInt(c.slice(1 + 2 * i, 3 + 2 * i), 16), m = i => Math.round(lerp(p(c1, i), p(c2, i), clamp(k, 0, 1))); return `rgb(${m(0)},${m(1)},${m(2)})`; };
function drop(x, y, s) { X.beginPath(); X.moveTo(x, y - s * 1.6); X.bezierCurveTo(x + s * 0.4, y - s * 0.8, x + s, y - s * 0.2, x + s, y + s * 0.35); X.arc(x, y + s * 0.35, s, 0, Math.PI); X.bezierCurveTo(x - s, y - s * 0.2, x - s * 0.4, y - s * 0.8, x, y - s * 1.6); X.closePath(); }
/* extras shared by the vector themes, drawn with a pen: { ink (lines and letters), fill, accent, love (hearts),
   water (tears), lens (sunglasses), lw (line width in u), z ('z' or 'Z'), out (outline colour or null) } */
const FX = {
  zzz(x, y, u, k, t, pen) { for (let i = 0; i < 3; i++) { const q = (t / 1800 + i / 3) % 1; X.globalAlpha = k * (1 - q) * 0.95; H.txt(pen.z || 'z', x + q * 4 * u, y - q * 6 * u, (1.6 + q * 1.8) * u, pen.ink, 'left', 'title'); } X.globalAlpha = 1; },
  hearts(cx, cy, u, k, t, pen) {
    for (let i = 0; i < 4; i++) { const q = (t / 2000 + i / 4) % 1; X.globalAlpha = k * (1 - q); X.fillStyle = pen.love; heart(cx + [-17, 15, -6, 8][i] * u + Math.sin(t / 300 + i) * u, cy - 1 * u - q * 10 * u, (0.8 + q * 0.5) * u * k); X.fill(); if (pen.out) { X.strokeStyle = pen.out; X.lineWidth = 0.15 * u; X.stroke(); } }
    X.globalAlpha = 1;
  },
  dots(x, y, u, k, t, pen) { for (let i = 0; i < 3; i++) { X.globalAlpha = k * (0.25 + 0.75 * ((Math.floor(t / 300) % 3) === i ? 1 : 0.2)); X.fillStyle = pen.ink; ell(x + i * 2.3 * u, y - i * 0.5 * u, 0.8 * u, 0.8 * u); X.fill(); if (pen.out) { X.strokeStyle = pen.out; X.lineWidth = 0.18 * u; X.stroke(); } } X.globalAlpha = 1; },
  bang(x, y, u, k, t, pen) { if (k < 0.05) return; X.globalAlpha = Math.min(1, k * 1.5); H.txt('!', x, y + (1 - k) * 2 * u, 4.5 * u * (0.6 + 0.4 * k), pen.accent, 'center', 'title'); X.globalAlpha = 1; },
  quest(x, y, u, k, t, pen) {
    if (k < 0.05) return; X.save(); X.globalAlpha = Math.min(1, k * 1.5); X.translate(x, y + Math.sin(t / 320) * 0.6 * u); X.rotate(0.18 * Math.sin(t / 640));
    H.txt('?', 0, -2.4 * u, 4.6 * u * (0.6 + 0.4 * k), pen.accent, 'center', 'title'); X.restore();
  },
  anger(x, y, u, k, t, pen) {
    if (k < 0.05) return; const s = 1.7 * u * k * (1 + 0.14 * Math.sin(t / 110));
    X.save(); X.translate(x, y); X.strokeStyle = pen.anger || pen.accent; X.lineWidth = (pen.lw || 0.45) * u * 0.9; X.lineCap = 'round';
    for (let i = 0; i < 4; i++) { X.rotate(Math.PI / 2); X.beginPath(); X.moveTo(-0.28 * s, -s); X.quadraticCurveTo(-0.28 * s, -0.28 * s, -s, -0.28 * s); X.stroke(); }
    X.restore();
  },
  tear(x, y, u, k, t, pen, a) {
    if (k < 0.05) return; const q = cyc(a, 2200), s = 0.75 * u * (0.5 + 0.5 * k);
    X.globalAlpha = k * (q < 0.8 ? 1 : (1 - q) / 0.2); X.fillStyle = pen.water || '#8fd3ff'; drop(x, y + q * 7 * u, s); X.fill();
    if (pen.out) { X.strokeStyle = pen.out; X.lineWidth = 0.15 * u; X.stroke(); }
    X.fillStyle = 'rgba(255,255,255,0.85)'; ell(x - s * 0.35, y + q * 7 * u, s * 0.22, s * 0.3); X.fill(); X.globalAlpha = 1;
  },
  sweat(x, y, u, k, t, pen) { if (k < 0.05) return; X.globalAlpha = k; X.fillStyle = pen.water || '#8fd3ff'; drop(x, y + Math.sin(t / 700) * 0.3 * u, 0.9 * u); X.fill(); if (pen.out) { X.strokeStyle = pen.out; X.lineWidth = 0.15 * u; X.stroke(); } X.globalAlpha = 1; },
  sparkle(cx, cy, u, k, t, pen) {
    if (k < 0.05) return; X.fillStyle = pen.spark || pen.ink;
    [[-15, -9, 0], [15, -10, 1], [-12, -13, 2], [14, -4, 3]].forEach(([dx, dy, i]) => { const q = 0.5 + 0.5 * Math.sin(t / 200 + i * 1.7); X.globalAlpha = k; star(cx + dx * u, cy + dy * u, (0.5 + 0.9 * q) * u * k, 4, 0.22); X.fill(); });
    X.globalAlpha = 1;
  },
  shades(Lx, Rx, y, u, k, t, pen) {     // sunglasses that slide down, with a glint sweeping across
    if (k < 0.02) return; const dy = (1 - k) * -7 * u, lens = (x, s) => { X.beginPath(); X.moveTo(x - 4.4 * u, y - 2.6 * u + dy); X.lineTo(x + 4.4 * u, y - 2.6 * u + dy); X.quadraticCurveTo(x + 4.6 * u, y + 2.8 * u + dy, x + s * 0.8 * u, y + 2.9 * u + dy); X.quadraticCurveTo(x - 4.2 * u, y + 2.6 * u + dy, x - 4.4 * u, y - 2.6 * u + dy); X.closePath(); };
    X.save(); X.globalAlpha = Math.min(1, k * 1.3); X.lineJoin = 'round';
    X.strokeStyle = pen.frame || pen.lens; X.lineWidth = 0.7 * u; X.beginPath(); X.moveTo(Lx + 3.6 * u, y - 1.9 * u + dy); X.quadraticCurveTo((Lx + Rx) / 2, y - 3 * u + dy, Rx - 3.6 * u, y - 1.9 * u + dy); X.stroke();
    for (const [x, s] of [[Lx, -1], [Rx, 1]]) { lens(x, s); X.fillStyle = pen.lens; X.fill(); if (pen.frame) X.stroke(); }
    for (const [x, s] of [[Lx, -1], [Rx, 1]]) {
      X.save(); lens(x, s); X.clip(); const g = cyc({ since: t }, 2600), gx = x - 7 * u + g * 26 * u;
      X.fillStyle = 'rgba(255,255,255,0.55)'; X.beginPath(); X.moveTo(gx, y - 4 * u + dy); X.lineTo(gx + 1.4 * u, y - 4 * u + dy); X.lineTo(gx - 1.2 * u, y + 4 * u + dy); X.lineTo(gx - 2.6 * u, y + 4 * u + dy); X.closePath(); X.fill();
      X.fillStyle = 'rgba(255,255,255,0.22)'; X.fillRect(x - 3.4 * u, y - 1.9 * u + dy, 2.6 * u, 0.6 * u); X.restore();
    }
    X.restore();
  },
  thermo(x, y, u, k, t, pen) {           // a thermometer in the corner of the mouth
    if (k < 0.05) return; X.save(); X.globalAlpha = k; X.translate(x, y); X.rotate(-0.42 + 0.04 * Math.sin(t / 500)); X.lineCap = 'round';
    X.strokeStyle = pen.out || '#c9d2e6'; X.lineWidth = 1.15 * u; X.beginPath(); X.moveTo(0, 0); X.lineTo(5.2 * u, 0); X.stroke();
    X.strokeStyle = '#ffffff'; X.lineWidth = 0.75 * u; X.beginPath(); X.moveTo(0, 0); X.lineTo(5.2 * u, 0); X.stroke();
    X.strokeStyle = '#ff5a6e'; X.lineWidth = 0.35 * u; X.beginPath(); X.moveTo(0, 0); X.lineTo(3.4 * u, 0); X.stroke();
    X.fillStyle = '#ff5a6e'; ell(0, 0, 0.75 * u, 0.75 * u); X.fill(); X.restore();
  },
  bars(mx, my, u, k, t, pen) { if (k < 0.05) return; X.globalAlpha = k; X.fillStyle = pen.ink; for (let i = 0; i < 7; i++) { const h = (0.6 + 2 * (0.5 + 0.5 * Math.sin(t / 90 + i * 1.9)) * Math.sin((i + 0.5) / 7 * Math.PI)) * u; rr(mx - 3.7 * u + i * 1.07 * u, my - h / 2, 0.72 * u, h, 0.36 * u); X.fill(); } X.globalAlpha = 1; },
};
/* the extras every vector face shows, at the usual places around a face centred on cx, cy */
function extras(cx, cy, u, p, a, pen) {
  const t = H.now;
  FX.hearts(cx, cy, u, p.hearts, t, pen); FX.sparkle(cx, cy, u, p.sparkle, t, pen);
  FX.zzz(cx + 9 * u, cy - 6 * u, u, p.zzz, t, pen); FX.dots(cx + 10.5 * u, cy - 9.5 * u, u, p.dots, t, pen);
  FX.bang(cx + 12.5 * u, cy - 14 * u, u, p.bang, t, pen); FX.quest(cx + 13 * u, cy - 10 * u, u, p.quest, t, pen);
  FX.anger(cx + 12.5 * u, cy - 9.5 * u, u, p.anger, t, pen); FX.sweat(cx + 13.5 * u, cy - 6.5 * u, u, p.sweat, t, pen);
}
/* =================== shared pixel face rig (retro, lcd) ===================
   Bitmaps per mood; bounces, squash and tilt move whole blocks; a mood change dissolves block by block
   (ordered dither). put(x, y, s, key) draws one block; keys: '#' main colour, 'w' highlight, 'p' pink, 'a' accent, 'd' dim. */
const PE = {   // eyes, 5 blocks wide (star: 7)
  o: ['.###.', '#w###', '#####', '#####', '#####', '.###.'], big: ['.###.', '#####', '#w###', '#####', '#####', '#####', '.###.'],
  arc: ['.....', '.###.', '#...#', '#...#', '.....', '.....'], shut: ['.....', '.....', '.....', '#####', '.....', '.....'],
  sleep: ['.....', '.....', '.....', '#...#', '.###.', '.....'], half: ['.....', '.....', '#####', '#w###', '#####', '.###.'],
  sadL: ['.....', '...##', '.####', '#w###', '#####', '.###.'], sadR: ['.....', '##...', '####.', '#w###', '#####', '.###.'],
  squint: ['.....', '.....', '.....', '#####', '.###.', '.....'], sqL: ['.....', '#....', '.##..', '...##', '.##..', '#....'], sqR: ['.....', '....#', '..##.', '##...', '..##.', '....#'],
  heart: ['.p.p.', 'ppppp', 'ppppp', '.ppp.', '..p..', '.....'], star: ['...a...', '..aaa..', 'aaaaaaa', '.aaaaa.', '..aaa..', '.aa.aa.', 'a.....a'],
};
PE.angL = PE.sadR; PE.angR = PE.sadL;
const PM = {   // mouths
  smile: ['#...#', '.###.'], big: ['#######', '#.....#', '.#ppp#.', '..###..'], flat: ['#####'], O: ['.##.', '#..#', '#..#', '.##.'], o: ['.#.', '#.#', '.#.'],
  frown: ['.###.', '#...#'], wave: ['.#...#.', '#.#.#.#', '...#...'], grit: ['#######', '#.#.#.#', '#######'], smirk: ['......#', '#....#.', '.####..'],
  y0: ['.##.', '#..#', '.##.'], y1: ['.###.', '#...#', '#...#', '#...#', '.###.'], y2: ['.####.', '#....#', '#....#', '#....#', '#.pp.#', '#pppp#', '.####.'],
};
const PMOOD = {
  neutre: { L: 'o', R: 'o', M: 'smile', ch: 1 }, content: { L: 'arc', R: 'arc', M: 'big', ch: 1, fx: 'bob' },
  surpris: { L: 'big', R: 'big', M: 'O', fx: 'bang' }, amoureux: { L: 'heart', R: 'heart', M: 'big', ch: 1, fx: 'hearts' },
  clin: { L: 'o', R: 'arc', M: 'big', ch: 1, fx: 'spark1' }, endormi: { L: 'sleep', R: 'sleep', M: 'o', fx: 'zzz' },
  reflechit: { L: 'half', R: 'half', M: 'flat', fx: 'dots' }, ecoute: { L: 'o', R: 'o', M: 'bars', ch: 1 },
  triste: { L: 'sadL', R: 'sadR', M: 'frown', fx: 'tear' }, fache: { L: 'angL', R: 'angR', M: 'grit', fx: 'anger' },
  confus: { L: 'big', R: 'squint', M: 'wave', fx: 'quest' }, excite: { L: 'star', R: 'star', M: 'big', ch: 1, fx: 'sparks' },
  fier: { L: null, R: null, M: 'smirk', ch: 1, fx: 'shades' }, malade: { L: 'half', R: 'half', M: 'wave', fx: 'sick' },
  baille: { L: 'sqL', R: 'sqR', M: 'y1', fx: 'yawn' },
};
const PHEART = ['.p.p.', 'ppppp', '.ppp.', '..p..'], PBANG = ['#', '#', '#', '.', '#'], PQ = ['.###.', '#...#', '...#.', '..#..', '.....', '..#..'];
const PANG = ['.#.#.', '##.##', '.....', '##.##', '.#.#.'], PDROP = ['.w.', 'www', 'www', '.w.'], PSPARK = ['.w.', 'www', '.w.'];
const PSHADES = ['#######################', '#ddddd#.........#ddddd#', '#ddddd#.........#ddddd#', '.#ddd#...........#ddd#.'];
function bm(rows, x, y, s, put) { for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) { const v = rows[j][i]; if (v !== '.' && v !== ' ') put(x + i * s, y + j * s, s, v); } }
/* one pixel face; w = weight of this mood during a dissolve (for the text-like extras); L = layout in blocks */
function pixFace(cx, cy, s, md, a, put, ink, w, L = PL) {
  const m = PMOOD[md] || PMOOD.neutre, t = H.now, opens = e => e === 'o' || e === 'big' || e === 'half' || e === 'sadL' || e === 'sadR' || e === 'angL' || e === 'angR';
  let le = m.L, re = m.R, mo = m.M;
  if (a.blink > 0.5) { if (opens(le)) le = 'shut'; if (opens(re)) re = 'shut'; }
  else if (a.squint > 0.3) { if (le === 'o') le = 'half'; if (re === 'o') re = 'half'; }
  if (md === 'baille') { const y = yawn(a); mo = y.m < 0.2 ? 'y0' : y.m < 0.65 ? 'y1' : 'y2'; if (y.e < 0.25) le = re = 'half'; }
  if (m.fx === 'bob' || md === 'excite') cy -= Math.round(Math.abs(Math.sin(t / 240)) * 0.8) * s;
  cy -= Math.round(a.hop * 1.2) * s;
  const q = Math.round(a.sq * 3), tl = Math.round(a.tilt * 9), ex = Math.round(a.lx) * s, ey = Math.round(a.ly) * s;
  const sick = md === 'malade', P = sick ? (x, y, ss, k) => put(x, y, ss, k === '#' ? 'd' : k) : put;
  const eye = (id, x0, side) => { if (!id) return; const b = PE[id], bw = b[0].length; bm(b, x0 - (bw - 5) / 2 * s + side * q * s + ex, cy - (b.length > 6 ? L.ey + 0.5 : L.ey) * s + q * s + ey - side * tl * s, s, P); };
  eye(le, cx - L.ex * s, -1); eye(re, cx + (L.ex - 5) * s, 1);
  const mx = Math.round(a.lx / 2) * s, my = cy + L.my * s - q * s;
  if (mo === 'bars') for (let i = 0; i < 7; i++) { const h = Math.round((0.5 + 0.5 * Math.sin(t / 85 + i * 1.9)) * 2.2 * Math.sin((i + 0.5) / 7 * Math.PI)); for (let k = -h; k <= h; k++) P(cx - 3.5 * s + i * s + mx, my + s + k * s, s, '#'); }
  else if (mo) { const b = PM[mo]; bm(b, cx - b[0].length * s / 2 + mx, my, s, P); }
  if (m.ch) for (let c = 0; c < 3; c++) { P(cx - L.ch * s + c * s, cy + (L.cy ?? 2.5) * s, s, 'p'); P(cx + (L.ch - 3) * s + c * s, cy + (L.cy ?? 2.5) * s, s, 'p'); }
  const fx = m.fx, hs = Math.max(2, Math.round(s * 0.45)), half = Math.max(2, Math.round(s / 2)), f = L.fx || 1, A = (x, y, ss) => P(x, y, ss, 'a');
  if (fx === 'zzz') for (let k = 0; k < 3; k++) { const p = (t / 1500 + k / 3) % 1; X.globalAlpha = (1 - p) * w; H.txt('z', cx + 9 * f * s + p * 4 * s, cy - 8 * f * s - p * 6 * s, Math.round((1.6 + p * 2) * s), ink); X.globalAlpha = 1; }
  if (fx === 'hearts') for (let k = 0; k < 3; k++) { const p = (t / 1800 + k / 3) % 1; X.globalAlpha = 1 - p; bm(PHEART, cx + [-17, 14, 2][k] * f * s, cy - 2 * f * s - Math.round(p * 18) * s / 2, hs, P); X.globalAlpha = 1; }
  if (fx === 'dots') { const n = Math.floor(t / 380) % 4; for (let i = 0; i < n; i++) P(cx + (10 * f + i * 1.7) * s, cy - 9.5 * f * s, s, '#'); }
  if (fx === 'bang') bm(PBANG, cx + 13 * f * s, cy - 11 * f * s, s, A);
  if (fx === 'quest') bm(PQ, cx + 12.5 * f * s, cy - 12.5 * f * s + (Math.floor(t / 300) % 2) * half, Math.max(2, Math.round(s * 0.6)), A);
  if (fx === 'anger' && Math.floor(t / 260) % 3) bm(PANG, cx + 12 * f * s, cy - 11 * f * s, Math.floor(t / 260) % 3 === 1 ? half + 1 : half + 2, A);
  if (fx === 'tear') { const p = cyc(a, 2200); if (p < 0.85) bm(['w', 'w'], cx - (L.ex - 1) * s + ex, cy + Math.round(p * 12) * half, half, P); }
  if (fx === 'sparks') [[-15, -9, 0], [14, -10, 1], [-3, -12, 2]].forEach(([dx, dy, i]) => { if ((Math.floor(t / 220) + i) % 3) bm(PSPARK, cx + dx * f * s, cy + dy * f * s, half, P); });
  if (fx === 'spark1' && Math.floor(t / 300) % 3) bm(PSPARK, cx + 12 * f * s, cy - 9 * f * s, half, P);
  if (fx === 'shades') {                 // sunglasses sized to the eyes, with a glint that sweeps across
    const B = Math.round((L.ex - 5) * 2 - 1), gap = '.'.repeat(B), x0 = cx - (L.ex + 1) * s + ex, y0 = cy - (L.ey - 1) * s + q * s + ey;
    bm(['#'.repeat(14 + B), '#ddddd#' + gap + '#ddddd#', '#ddddd#' + gap + '#ddddd#', '.#ddd#.' + gap + '.#ddd#.'], x0, y0, s, P);
    const g = Math.floor(cyc(a, 2400) * 14); if (g < 5) for (const lx of [1, 8 + B]) { P(x0 + (lx + g) * s, y0 + s, s, 'w'); if (g < 4) P(x0 + (lx + g + 1) * s, y0 + s, s, 'w'); }
  }
  if (fx === 'sick') { bm(PDROP, cx + 13 * f * s, cy - 8 * f * s + (Math.floor(t / 600) % 2) * half, half, P); for (let i = 0; i < 4; i++) P(cx + 3.5 * s + i * s, my - i * s + s, s, i ? 'w' : 'p'); }
  if (fx === 'yawn') { const p = cyc(a, 3000); if (p > 0.55 && p < 0.9) P(cx - (L.ex + 0.5) * s, cy - 2 * s + Math.round((p - 0.55) * 10) * half, half, 'w'); }
}
const PL = { ex: 10.5, ey: 6, my: 3.5, ch: 15.5 };
function pixMorph(cx, cy, s, a, put, ink, L) {
  if (a.k >= 1 || a.from === a.mood) return pixFace(cx, cy, s, a.mood, a, put, ink, 1, L);
  const sel = k => (x, y, ss, key) => { if ((bayer(Math.round((x - cx) / s) + 40, Math.round((y - cy) / s) + 40) < a.k) === k) put(x, y, ss, key); };
  pixFace(cx, cy, s, a.from, a, sel(false), ink, 1 - a.k, L);
  pixFace(cx, cy, s, a.mood, a, sel(true), ink, a.k, L);
}

/* =================== RETRO =================== */
const R = { fg: '#46ff82', dim: '#1e7840', faint: '#0d3019', bg: '#061009', accent: '#ffb347', pink: '#ff7aa8', hi: '#d6ffe2' };
function px(x, y, s, c) {      // one glowing block: a sprite drawn once per colour and size (much cheaper than shadowBlur)
  const P = 8, spr = cached('rpx' + c + s, s + 2 * P, s + 2 * P, g => { g.shadowColor = c; g.shadowBlur = sb(10); g.fillStyle = c; g.fillRect(P + 1, P + 1, s - 2, s - 2); });
  const b = X.shadowBlur; X.shadowBlur = 0; X.drawImage(spr, x - P, y - P, s + 2 * P, s + 2 * P); X.shadowBlur = b;
}
function bmp(rows, x, y, s, c) {
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
    const v = rows[j][i]; if (v === '.' || v === ' ') continue;
    px(x + i * s, y + j * s, s, v === 'p' ? R.pink : v === 'a' ? R.accent : v === 'w' ? R.hi : c);
  }
}
const RK = { '#': R.fg, w: R.hi, p: R.pink, a: R.accent, d: R.dim, f: R.faint };
const rput = (x, y, s, k) => px(x, y, s, RK[k] || R.fg);
const BULB = ['.###.', '#####', '#####', '.###.', '.....', '.###.'], CLOUD = ['...###....', '..#####.##', '.#########', '##########', '.########.'];
const MINI = { soleil: ['a.a.a', '.aaa.', 'aaaaa', '.aaa.', 'a.a.a'], nuage: ['.##..', '####.', '#####', '.....', '.....'], pluie: ['.##..', '####.', '#####', '.#.#.', '#.#..'],
  neige: ['.##..', '####.', '#####', 'w.w.w', '.w.w.'], orage: ['.##..', '####.', '#####', '..a..', '.a...'] };
const DIG = { 0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'], 3: ['###', '..#', '###', '..#', '###'], 4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '###', '..#', '###'], 6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '###'], ':': ['.', '#', '.', '#', '.'] };
function retroSun(cx, cy, u) {
  for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) if (i * i + j * j <= 18) px(cx + i * u, cy + j * u, u, R.accent);
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + H.now / 2200; for (let r = 0; r < (k % 2 ? 2 : 3); r++) px(cx + Math.round(Math.cos(a) * (6 + r)) * u, cy + Math.round(Math.sin(a) * (6 + r)) * u, u, R.accent); }
}
const retro = {
  id: 'retro', name: 'Rétro', c: R, glow: 10, bubbles: false, qr: ['#e4ffe9', R.bg], upper: true, gridA: 1, fonts: ['30px VT323'],
  top(clock) { H.txt('PIXEL OS 2.0', 24, 14, 24, R.dim); H.txt(clock, W - 24, 14, 24, R.dim, 'right'); },
  rule(x, y, w, h) { X.fillStyle = R.dim; X.fillRect(x, y, w, h); },
  boot(e, info) {                                   // a BIOS check, then the loading bar
    const rows = [['PIXEL BIOS 2.0', null, null], ...info.rows, ['Chargement de Pixel OS', null, null]];
    rows.forEach(([l, v, good], i) => {
      if (e > i * 330) H.txt(H.fit(v == null ? l : (l + ' ').padEnd(24, '.') + ' ' + v, 640, 30), 40, 40 + i * 40, 30, i ? R.fg : R.hi);
      if (good !== null && e > i * 330 + 180) H.txt(good ? 'OK' : '--', 760, 40 + i * 40, 30, good ? R.hi : R.accent, 'right');
    });
    if (e > 2000) { const p = clamp((e - 2000) / 1200, 0, 1); retro.bar(40, 340, 30, p * 30, 18, 24, 6); H.txt(Math.round(p * 100) + ' %', 760, 338, 30, R.fg, 'right'); }
    if (Math.floor(H.now / 400) % 2) { X.fillStyle = R.fg; X.fillRect(40, 400, 16, 26); }
  },
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
  face(cx, cy, s, md, lx = 0, ly = 0, a) { a = life(a, md, lx, ly); pixMorph(cx, cy, s, a, rput, R.fg); },
};

/* =================== MODERNE =================== */
const M = { fg: '#7ff3ff', dim: '#8a93b8', faint: '#262d4d', bg: '#0c1124', accent: '#ffb86b', pink: '#ff8fb1', hi: '#f4f7ff' };
function modCloud(x, y, k, fill, alpha = 1) { X.save(); X.globalAlpha = alpha; X.fillStyle = fill; X.shadowColor = 'rgba(0,0,0,0.35)'; X.shadowBlur = sb(18 * k); X.shadowOffsetY = 6 * k * SC() / 2; cloudPath(x, y, k); X.fill(); X.restore(); }
function modSun(x, y, k) {
  const disc = cached('mod-sun-' + k, 240 * k, 240 * k, (g, w) => {
    const c = w / 2, r = g.createRadialGradient(c, c, 0, c, c, 110 * k); r.addColorStop(0, 'rgba(255,200,110,0.45)'); r.addColorStop(1, 'rgba(255,200,110,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
    const s = g.createLinearGradient(c, c - 50 * k, c, c + 50 * k); s.addColorStop(0, '#ffe29a'); s.addColorStop(1, '#ffa95e'); g.fillStyle = s; g.beginPath(); g.arc(c, c, 50 * k, 0, TAU); g.fill();
  });
  X.save(); X.strokeStyle = '#ffcf7a'; X.lineCap = 'round'; X.lineWidth = 9 * k;
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + H.now / 3000, l = (12 + 5 * Math.sin(H.now / 400 + i)) * k; X.beginPath(); X.moveTo(x + Math.cos(a) * 66 * k, y + Math.sin(a) * 66 * k); X.lineTo(x + Math.cos(a) * (66 * k + l), y + Math.sin(a) * (66 * k + l)); X.stroke(); }
  X.drawImage(disc, x - 120 * k, y - 120 * k, 240 * k, 240 * k); X.restore();
}
const MT = moodTable({ surpris: { ew: 1.34, eh: 1.04 } }), modBG = { c: null, t: -1e9 };
const MPEN = { ink: M.hi, accent: M.accent, love: M.pink, water: '#8fd3ff', lens: '#070b1a', frame: M.fg, spark: M.hi, lw: 0.45, z: 'z' };
function modEye(x, y, u, p, side, t, col, g) {
  const right = side > 0, open = p.open * (right ? p.rOpen : 1), happy = right ? Math.max(p.happy, p.rHappy) : p.happy, k = 1 - Math.max(p.heart, p.star);
  if (k > 0.03) {
    const s = 0.35 + 0.65 * k, w = 7 * u * p.ew * s, h = Math.max(0.5 * u, 9 * u * p.eh * open) * s;
    X.save(); lidClip(x, y, w, h, p.lid, p.slant, happy, side); X.globalAlpha = 1 - p.shades;
    X.fillStyle = X.shadowColor = col; X.shadowBlur = g; rr(x - w / 2, y - h / 2, w, h, Math.min(w, h) * lerp(0.44, 0.5, clamp((p.ew - 1) / 0.3, 0, 1))); X.fill();
    const sh = (1 - happy) * (1 - p.lid) * (1 - p.shades) * clamp((open - 0.4) / 0.3, 0, 1) * k;
    if (sh > 0.02) { X.shadowBlur = 0; X.globalAlpha = sh * 0.9; X.fillStyle = '#ffffff'; const q = clamp(p.pup, 0.45, 1.2); ell(x - w * 0.17, y - h * 0.2, 0.95 * u * q, 1.2 * u * q); X.fill(); ell(x + w * 0.15, y + h * 0.12, 0.45 * u * q, 0.45 * u * q); X.fill(); X.globalAlpha = 1; }
    X.restore();
  }
  if (p.heart > 0.03) { X.fillStyle = X.shadowColor = M.pink; X.shadowBlur = g; heart(x, y, 4.3 * u * p.heart * (1 + 0.1 * Math.sin(t / 170))); X.fill(); X.shadowBlur = 0; }
  if (p.star > 0.03) {
    X.fillStyle = X.shadowColor = '#ffe27a'; X.shadowBlur = g; star(x, y + 0.4 * u, 5.3 * u * p.star * (1 + 0.08 * Math.sin(t / 130)), 5, 0.5, 0.12 * Math.sin(t / 420)); X.fill();
    X.shadowBlur = 0; X.fillStyle = '#ffffff'; star(x - 1.6 * u, y - 1.1 * u, 1.0 * u * p.star, 4, 0.3); X.fill();
  }
}
function modFace(cx, cy, u, md, lx = 0, ly = 0, a) {
  a = life(a, md, lx, ly);
  const t = H.now, p = rig(a, MT), g = sb(26 * u / 16), col = p.tint > 0.01 ? mixC(M.fg, '#b8f27c', 0.85 * p.tint) : M.fg;
  cy += a.breath * 0.25 * u;                                        // floats gently
  X.save(); body(cx, cy, u, a);
  const ex = a.lx * 1.35 * u, ey = a.ly * 1.15 * u, Ey = cy - 2.5 * u + ey + p.eyeY * u;
  if (p.blush > 0.02) {
    const ck = cached('mod-cheek-' + u, 6 * u, 6 * u, (q, w) => { const r = q.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,143,177,0.6)'); r.addColorStop(1, 'rgba(255,143,177,0)'); q.fillStyle = r; q.fillRect(0, 0, w, w); });
    X.globalAlpha = p.blush; for (const s of [-1, 1]) X.drawImage(ck, cx + s * 13.4 * u - 3 * u, cy + 0.4 * u, 6 * u, 6 * u); X.globalAlpha = 1;
  }
  for (const side of [-1, 1]) modEye(cx + side * 8.5 * u + ex, Ey, u, p, side, t, col, g);
  FX.shades(cx - 8.5 * u + ex * 0.7, cx + 8.5 * u + ex * 0.7, Ey, u, p.shades, t, MPEN);
  const mx = cx + a.lx * 0.6 * u, my = cy + 5.3 * u + ey * 0.4, pts = mouthPts(mx, my, u, p, t), la = 1 - p.mbars;
  X.lineCap = X.lineJoin = 'round'; X.strokeStyle = X.fillStyle = X.shadowColor = col; X.shadowBlur = g * 0.5; X.lineWidth = 0.95 * u;
  if (la > 0.02) {
    const fa = smooth(clamp(p.mo / 0.25, 0, 1));
    X.globalAlpha = la; poly(pts); if (fa > 0.01) { X.globalAlpha = la * fa * 0.3; X.fill(); X.globalAlpha = la; } X.stroke();
    if (p.mteeth > 0.02) {
      X.save(); poly(pts); X.clip(); X.shadowBlur = 0; X.globalAlpha = la * p.mteeth; X.fillStyle = M.hi; X.fill();
      X.strokeStyle = M.bg; X.lineWidth = 0.28 * u; X.beginPath(); X.moveTo(mx - 3 * u, my + 0.1 * u); X.lineTo(mx + 3 * u, my + 0.1 * u);
      for (const dx of [-1.1, 0, 1.1]) { X.moveTo(mx + dx * u, my - 2 * u); X.lineTo(mx + dx * u, my + 2 * u); } X.stroke(); X.restore();
    }
    X.globalAlpha = 1;
  }
  FX.bars(mx, my, u, p.mbars, t, { ink: col });
  X.shadowBlur = 0;
  FX.thermo(mx + 1.4 * u, my + 0.6 * u, u, p.tint, t, {});
  FX.tear(cx - 11.6 * u + ex, Ey + 3.2 * u, u, p.tear, t, MPEN, a);
  extras(cx, cy, u, p, a, MPEN);
  X.restore();
}
const moderne = {
  id: 'moderne', name: 'Moderne', c: M, glow: 0, bubbles: true, qr: ['#ffffff', '#0c1124'], fonts: ['30px Fredoka'],
  bubbleInk: mine => mine ? M.fg : M.hi,
  font: (s, k) => k === 'title' ? `600 ${Math.round(s * 0.8)}px Fredoka, "DejaVu Sans", sans-serif` : `500 ${Math.round(s * 0.76)}px Fredoka, "DejaVu Sans", sans-serif`,
  bg() {                              // night blue with three soft lights drifting; the layer is redrawn 5 times a second
    const S = SC(), t = H.now;
    if (!modBG.c || modBG.c.S !== S) { modBG.c = document.createElement('canvas'); modBG.c.S = S; modBG.c.width = W * S; modBG.c.height = HT * S; modBG.t = -1e9; }
    if (t - modBG.t > 200 || t < modBG.t) {
      modBG.t = t; const g = modBG.c.getContext('2d'); g.setTransform(S, 0, 0, S, 0, 0);
      g.drawImage(cached('mod-bg', W, HT, q => { const l = q.createLinearGradient(0, 0, 0, HT); l.addColorStop(0, '#151c3a'); l.addColorStop(1, '#090d1c'); q.fillStyle = l; q.fillRect(0, 0, W, HT); }), 0, 0, W, HT);
      [['127,243,255', 0], ['255,143,177', 2], ['255,184,107', 4]].forEach(([c, i]) => {
        const x = W * (0.15 + 0.7 * (Math.sin(t / 1000 * 0.07 + i) + 1) / 2), y = HT * (0.2 + 0.6 * (Math.cos(t / 1000 * 0.05 + i * 1.7) + 1) / 2), r = 190;
        g.drawImage(cached('mod-blob-' + i, 2 * r, 2 * r, q => { const rg = q.createRadialGradient(r, r, 0, r, r, r); rg.addColorStop(0, `rgba(${c},0.09)`); rg.addColorStop(1, `rgba(${c},0)`); q.fillStyle = rg; q.fillRect(0, 0, 2 * r, 2 * r); }), x - r, y - r, 2 * r, 2 * r);
      });
    }
    X.drawImage(modBG.c, 0, 0, W, HT);
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
  onFg: M.hi,
  bar(x, y, n, filled, w, h, gap, on = M.fg) {
    const tw = n * (w + gap) - gap, f = clamp(filled / n, 0, 1);
    X.fillStyle = 'rgba(255,255,255,0.08)'; rr(x, y, tw, h, h / 2); X.fill();
    if (f > 0) { const g = X.createLinearGradient(x, 0, x + tw, 0); g.addColorStop(0, hexA(on, 0.7)); g.addColorStop(1, on); X.fillStyle = g; rr(x, y, Math.max(h, tw * f), h, h / 2); X.fill(); }
  },
  bubble(x, y, w, h, mine) { rr(x, y, w, h, 18); X.fillStyle = mine ? 'rgba(127,243,255,0.16)' : 'rgba(255,255,255,0.08)'; X.fill(); },
  bulb(cx, cy, on) {
    if (on) X.drawImage(cached('mod-bulb', 68, 68, g => { const r = g.createRadialGradient(34, 34, 0, 34, 34, 34); r.addColorStop(0, 'rgba(255,207,122,0.55)'); r.addColorStop(1, 'rgba(255,207,122,0)'); g.fillStyle = r; g.fillRect(0, 0, 68, 68); }), cx - 34, cy - 34, 68, 68);
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
      if (kind === 'orage' && (size === 'mini' || Math.floor(t / 150) % 10 < 2)) { X.globalAlpha = a; X.fillStyle = '#ffe066'; X.beginPath(); X.moveTo(cx + 4 * k, cy + 30 * k); X.lineTo(cx - 18 * k, cy + 72 * k); X.lineTo(cx, cy + 70 * k); X.lineTo(cx - 10 * k, cy + 104 * k); X.lineTo(cx + 22 * k, cy + 56 * k); X.lineTo(cx + 4 * k, cy + 58 * k); X.closePath(); X.fill(); }
    }
    X.restore();
  },
  digits(str, cx, y, col) { X.save(); X.font = `600 150px Fredoka, "DejaVu Sans", sans-serif`; X.textAlign = 'center'; X.textBaseline = 'top'; X.shadowColor = M.fg; X.shadowBlur = sb(30); X.fillStyle = col; X.fillText(str, cx, y - 22); X.restore(); },
  star(x, y, sz, near) { X.fillStyle = near ? 'rgba(244,247,255,0.9)' : 'rgba(138,147,184,0.6)'; X.fillRect(x - sz * 0.5, y - sz * 0.5, sz, sz); },
  face: modFace,
  boot(e, info) {                     // a glowing ring fills up around Pixel, who wakes up
    const p = smooth(clamp((e - 200) / 2800, 0, 1));
    X.save(); X.lineCap = 'round'; X.lineWidth = 6; X.strokeStyle = 'rgba(255,255,255,0.08)'; X.beginPath(); X.arc(400, 196, 150, 0, TAU); X.stroke();
    X.strokeStyle = X.shadowColor = M.fg; X.shadowBlur = sb(16); X.beginPath(); X.arc(400, 196, 150, -Math.PI / 2, -Math.PI / 2 + TAU * p); X.stroke(); X.restore();
    info.face(400, 192, 9, e < 2200 ? 'endormi' : 'content');
    X.globalAlpha = clamp((e - 500) / 600, 0, 1); H.txt('Pixel', 400, 362, 70, M.hi, 'center', 'title');
    X.globalAlpha = clamp((e - 2400) / 500, 0, 1); H.txt('Bonjour !', 400, 426, 30, M.dim, 'center'); X.globalAlpha = 1;
  },
};

/* =================== MANGA =================== */
const K = { fg: '#1b1b1f', dim: '#6d6a66', faint: '#d9d3c4', bg: '#fbf7ee', accent: '#e8384f', pink: '#ff9fb5', hi: '#000000' }, INK = K.fg;
function screentone() {                       // paper with halftone dots in two corners, drawn once at the backing scale
  return cached('manga-tone', W, HT, g => {
    g.fillStyle = K.bg; g.fillRect(0, 0, W, HT); g.fillStyle = '#dcd5c5';
    for (let y = 0; y <= HT; y += 7) for (let x = (y / 7) % 2 ? 3.5 : 0; x <= W; x += 7) {
      const r = Math.max(2.2 - Math.hypot((W - x) / W, (HT - y) / HT) * 3.5, 1.6 - Math.hypot(x / W, y / HT) * 4);
      if (r > 0.2) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    }
  });
}
function speedLines(cx, cy) { X.save(); X.strokeStyle = INK; for (let i = 0; i < 44; i++) { const a = i / 44 * TAU + (i % 3) * 0.03, r = 230 + (i * 13) % 60; X.lineWidth = 1 + (i * 7) % 4; X.beginPath(); X.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); X.lineTo(cx + Math.cos(a) * 900, cy + Math.sin(a) * 900); X.stroke(); } X.restore(); }
function mEye(x, y, u, o) {           // a big shiny anime eye; o = {open, iris, lx, ly, heart, star, side, wide, lid, slant}
  const rx = 3.6 * u * (1 + 0.1 * o.wide), ry = 4.7 * u * (1 + 0.1 * o.wide) * o.open, cover = clamp(o.lid * 0.87 + Math.abs(o.slant) * 0.2, 0, 1);
  X.save(); if (cover > 0.01) lidClip(x, y, 2 * rx, 2 * ry, o.lid, o.slant, 0, o.side);
  X.fillStyle = '#ffffff'; ell(x, y, rx, ry); X.fill();
  X.save(); ell(x, y, rx, ry); X.clip();
  const ix = x + o.lx * 0.9 * u, iy = y + o.ly * 0.8 * u + 0.3 * u, irx = 2.9 * u * o.iris, iry = 3.9 * u * o.iris, sp = Math.max(o.heart, o.star);
  if (sp < 0.98) {
    const g = X.createLinearGradient(ix, iy - iry, ix, iy + iry); g.addColorStop(0, '#14204d'); g.addColorStop(0.55, '#2f63c9'); g.addColorStop(1, '#7fd0ff');
    X.globalAlpha = 1 - sp; X.fillStyle = g; ell(ix, iy, irx, iry); X.fill(); X.lineWidth = 0.22 * u; X.strokeStyle = '#0c122c'; X.stroke();
    X.fillStyle = '#0b1028'; ell(ix, iy - 0.3 * u, irx * 0.48, iry * 0.52); X.fill();
    const tw = 0.85 + 0.15 * Math.sin(H.now / 260);
    X.fillStyle = '#ffffff'; ell(ix - irx * 0.38, iy - iry * 0.38, 1.05 * u * tw * o.iris, 1.35 * u * tw * o.iris); X.fill();
    ell(ix + irx * 0.42, iy + iry * 0.36, 0.5 * u * o.iris, 0.5 * u * o.iris); X.fill();
    X.globalAlpha = 0.45 * (1 - sp); ell(ix + irx * 0.1, iy + iry * 0.64, irx * 0.55, iry * 0.17); X.fill(); X.globalAlpha = 1;
  }
  if (o.heart > 0.02) { const k = o.heart * (1 + 0.08 * Math.sin(H.now / 170)); X.fillStyle = '#ff4f86'; heart(ix, iy, 3 * u * k); X.fill(); X.fillStyle = '#fff'; ell(ix - 1.1 * u * k, iy - 1.0 * u * k, 0.75 * u * k, 0.55 * u * k); X.fill(); }
  if (o.star > 0.02) { const k = o.star * (1 + 0.1 * Math.sin(H.now / 140)); X.fillStyle = '#ffd400'; X.strokeStyle = INK; X.lineWidth = 0.22 * u; star(ix, iy + 0.2 * u, 3.4 * u * k, 5, 0.48, 0.1 * Math.sin(H.now / 500)); X.fill(); X.stroke(); X.fillStyle = '#fff'; ell(ix - 0.9 * u * k, iy - 0.9 * u * k, 0.55 * u * k, 0.45 * u * k); X.fill(); }
  X.restore(); X.restore();
  X.strokeStyle = INK; X.lineCap = 'round'; X.lineWidth = 0.95 * u;
  if (cover > 0.04) {                  // the upper lid line follows the lid (sleepy, sad, angry)
    const sl = -o.side * o.slant * 0.5, top = y - ry + cover * 2 * ry, x0 = x - rx * 1.02, x1 = x + rx * 1.02;
    X.beginPath(); X.moveTo(x0, top + sl * (x0 - x)); X.lineTo(x1, top + sl * (x1 - x)); X.stroke();
  } else { X.beginPath(); X.ellipse(x, y, rx * 1.04, ry * 1.02 + 0.1 * u, 0, Math.PI * 1.08, Math.PI * 1.92); X.stroke(); }
  const ox = x + o.side * rx * 0.98, oy = y - ry * 0.35 + cover * ry * (o.side * o.slant < 0 ? 1.2 : 0.6);
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
function mSqueeze(x, y, u, side) {   // eyes squeezed shut (> <) for a big yawn
  X.strokeStyle = INK; X.lineCap = X.lineJoin = 'round'; X.lineWidth = 0.8 * u; X.beginPath();
  X.moveTo(x - side * 2.6 * u, y - 2 * u); X.lineTo(x + side * 2.2 * u, y); X.lineTo(x - side * 2.6 * u, y + 2 * u); X.stroke();
}
function brow(x, y, u, side, lift, tilt) { X.strokeStyle = INK; X.lineCap = 'round'; X.lineWidth = 0.5 * u; X.beginPath(); X.moveTo(x - side * 2.3 * u, y - lift * u + tilt * u); X.quadraticCurveTo(x, y - (lift + 0.9) * u, x + side * 2.3 * u, y - lift * u - tilt * 0.3 * u); X.stroke(); }
function blush(x, y, u) { X.fillStyle = 'rgba(255,159,181,0.6)'; ell(x, y, 2.4 * u, 1.05 * u); X.fill(); X.strokeStyle = '#e0607e'; X.lineWidth = 0.22 * u; X.lineCap = 'round'; for (let i = -1; i <= 1; i++) { X.beginPath(); X.moveTo(x + i * u - 0.4 * u, y + 0.5 * u); X.lineTo(x + i * u + 0.4 * u, y - 0.5 * u); X.stroke(); } }
function catMouth(mx, my, u) { X.strokeStyle = INK; X.lineCap = 'round'; X.lineWidth = 0.32 * u; for (const s of [-1, 1]) { X.beginPath(); X.arc(mx + s * 0.85 * u, my, 0.85 * u, 0.05 * Math.PI, 0.95 * Math.PI); X.stroke(); } }
function mMouth(mx, my, u, p, t) {   // the morphing mouth, in ink: open = dark red with a tongue
  const pts = mouthPts(mx, my, u, p, t), op = smooth(clamp(p.mo / 0.18, 0, 1));
  X.strokeStyle = INK; X.lineCap = X.lineJoin = 'round'; X.lineWidth = 0.32 * u;
  if (op > 0.02) {
    const ga = X.globalAlpha; X.globalAlpha = ga * op; poly(pts); X.fillStyle = '#8c2233'; X.fill();
    X.save(); poly(pts); X.clip();
    if (p.mteeth > 0.02) { X.globalAlpha = ga * op * p.mteeth; X.fillStyle = '#ffffff'; X.fillRect(mx - 4 * u, my - 3 * u, 8 * u, 6 * u); X.lineWidth = 0.18 * u; X.beginPath(); X.moveTo(mx - 4 * u, my + 0.1 * u); X.lineTo(mx + 4 * u, my + 0.1 * u); for (const d of [-1.2, 0, 1.2]) { X.moveTo(mx + d * u, my - 3 * u); X.lineTo(mx + d * u, my + 3 * u); } X.stroke(); X.globalAlpha = ga * op; }
    X.fillStyle = '#ff8fa3'; ell(mx + p.mskew * 0.5 * u, my + (0.5 + 2.4 * p.mo) * u, (0.6 + 0.7 * p.mo) * u * (1 - p.mteeth), (0.35 + 0.45 * p.mo) * u); X.fill(); X.restore();
    poly(pts); X.stroke(); X.globalAlpha = ga;
  }
  if (op < 0.98) { const ga = X.globalAlpha; X.globalAlpha = ga * (1 - op); lipLine(pts); X.stroke(); X.globalAlpha = ga; }
}
/* manga reads the shared numbers, plus: cat (the little cat mouth), arcs (listening sound arcs), cloud (thought bubble) */
const KB = { ...FB, cat: 0, arcs: 0 };
const KT = moodTable({ neutre: { cat: 1 }, ecoute: { cat: 1, mbars: 0, arcs: 1 }, amoureux: { cat: 1, mo: 0 }, endormi: { mo: 0.06, mw: 1.2 },
  surpris: { ew: 1.12, pup: 0.42 }, triste: { mw: 2.6, lid: 0.04, slant: -0.75 }, reflechit: { mw: 2, mc: -0.1 } });
const KPEN = { ink: INK, out: INK, accent: K.accent, love: '#ff4f86', water: '#bfe6ff', lens: '#141418', frame: INK, anger: K.accent, spark: '#ffd400', lw: 0.4, z: 'Z' };
function mangaFace(cx, cy, u, md, lx = 0, ly = 0, a) {
  a = life(a, md, lx, ly);
  const t = H.now, p = rig(a, KT, KB);
  if (p.bang > 0.02 && u >= 12) { X.globalAlpha = p.bang; speedLines(cx, cy); X.globalAlpha = 1; }
  X.save(); body(cx, cy, u, a);
  cy -= Math.abs(Math.sin(t / 260)) * 0.6 * u * Math.max(p.happy, p.star);
  const Lx = cx - 8.6 * u, Rx = cx + 8.6 * u, Ey = cy - 3 * u + p.eyeY * u, by = Ey - 6.6 * u - p.eyeY * u * 0.5;
  if (p.tint > 0.02) {                 // gloom lines on the forehead when sick
    X.strokeStyle = '#7d8fb3'; X.lineCap = 'round'; X.lineWidth = 0.22 * u; X.globalAlpha = p.tint;
    for (let i = 0; i < 9; i++) { const x = cx - 13 * u + i * 3.2 * u; X.beginPath(); X.moveTo(x, cy - 15 * u); X.lineTo(x, cy - (11 - (i % 3)) * u); X.stroke(); }
    X.globalAlpha = 1;
  }
  const lift = clamp((p.ew - 1) * 14, 0, 1.6) + 0.6 * p.happy - 0.3 * p.lid + 0.4 * p.star, tilt = p.slant * (p.slant > 0 ? 2.4 : 1.7);
  brow(Lx, by, u, -1, lift, tilt); brow(Rx, by, u, 1, lift + 0.9 * (p.dots + p.quest), tilt - 0.5 * p.quest);
  for (const side of [-1, 1]) {
    const x = side < 0 ? Lx : Rx, right = side > 0, happy = right ? Math.max(p.happy, p.rHappy) : p.happy, sleep = smooth(clamp((p.lid - 0.7) / 0.25, 0, 1));
    const squeeze = p.yawn * yawn(a).e, open = p.open * (right ? p.rOpen : 1) * (1 - happy) * (1 - sleep) * (1 - squeeze);
    if (open > 0.2) { X.globalAlpha = smooth(clamp((open - 0.2) / 0.15, 0, 1)) * (1 - p.shades); mEye(x, Ey, u, { open, iris: p.pup, lx: a.lx, ly: a.ly, heart: p.heart, star: p.star, side, wide: clamp((p.ew - 1) / 0.12, 0, 1), lid: Math.min(p.lid, 0.6), slant: p.slant }); }
    const ca = 1 - smooth(clamp((open - 0.2) / 0.15, 0, 1));
    if (ca > 0.02) { X.globalAlpha = ca * (1 - p.shades); if (squeeze > 0.5) mSqueeze(x, Ey, u, side); else if (happy >= sleep) mClosed(x, Ey, u, true, side); else mClosed(x, Ey + u, u, false, side); }
    X.globalAlpha = 1;
  }
  FX.shades(Lx, Rx, Ey, u, p.shades, t, KPEN);
  X.strokeStyle = INK; X.lineWidth = 0.25 * u; X.beginPath(); X.moveTo(cx + 0.2 * u, cy + 1.0 * u); X.lineTo(cx - 0.2 * u, cy + 1.5 * u); X.stroke();
  if (p.blush > 0.02) { X.globalAlpha = p.blush; blush(cx - 12.6 * u, cy + 2.4 * u, u); blush(cx + 12.6 * u, cy + 2.4 * u, u); X.globalAlpha = 1; }
  const mx = cx + a.lx * 0.4 * u, my = cy + 3.6 * u;
  if (p.cat > 0.02) { X.globalAlpha = p.cat; catMouth(mx, my, u); X.globalAlpha = 1; }
  if (p.cat < 0.98) { X.globalAlpha = 1 - p.cat; mMouth(mx, my - 0.2 * u, u * 0.78, p, t); X.globalAlpha = 1; }
  FX.thermo(mx + 1.2 * u, my + 0.5 * u, u, p.tint, t, KPEN);
  if (p.rHappy > 0.02) { X.globalAlpha = p.rHappy; X.fillStyle = '#ffd400'; X.strokeStyle = INK; X.lineWidth = 0.25 * u; star(Rx + 5 * u, Ey - 5 * u, 1.8 * u * (1 + 0.2 * Math.sin(t / 150)), 5, 0.45); X.fill(); X.stroke(); X.globalAlpha = 1; }
  const sp = Math.max(p.happy * (1 - p.rHappy), p.star);
  if (sp > 0.02) [[-15, -9, 0], [15, -10, 1], [-12, -13, 2], [14, -4, 3]].forEach(([dx, dy, i]) => { const k = 0.5 + 0.5 * Math.sin(t / 200 + i * 1.7); X.globalAlpha = sp; X.fillStyle = p.star > 0.5 ? '#ffd400' : INK; star(cx + dx * u, cy + dy * u, (0.6 + 0.8 * k) * u, 4, 0.22); X.fill(); if (p.star > 0.5) { X.strokeStyle = INK; X.lineWidth = 0.15 * u; X.stroke(); } X.globalAlpha = 1; });
  if (p.bang > 0.02) {
    X.globalAlpha = p.bang; const dx = cx + 15 * u, dy = cy - 8 * u + Math.sin(t / 200) * 0.3 * u;
    X.beginPath(); X.moveTo(dx, dy - 2.2 * u); X.quadraticCurveTo(dx + 1.6 * u, dy + 0.2 * u, dx, dy + 1.1 * u); X.quadraticCurveTo(dx - 1.6 * u, dy + 0.2 * u, dx, dy - 2.2 * u);
    X.fillStyle = '#bfe6ff'; X.fill(); X.strokeStyle = INK; X.lineWidth = 0.22 * u; X.stroke();
    X.fillStyle = '#ffffff'; star(cx + 12.5 * u, cy - 13 * u, 3 * u, 12, 0.72); X.fill(); X.lineWidth = 0.25 * u; X.stroke();
    H.txt('!', cx + 12.5 * u, cy - 14.8 * u, 3.8 * u, K.accent, 'center', 'title'); X.globalAlpha = 1;
  }
  FX.hearts(cx, cy - u, u, p.hearts, t, KPEN);
  if (p.zzz > 0.02) {
    X.globalAlpha = p.zzz; const r = (1 + 1.3 * (0.5 + 0.5 * Math.sin(t / 1100))) * u, bx = cx + 1.8 * u + r * 0.7, byy = cy + 1.8 * u;
    X.fillStyle = 'rgba(170,220,255,0.4)'; ell(bx, byy, r, r); X.fill(); X.strokeStyle = INK; X.lineWidth = 0.2 * u; X.stroke();
    X.strokeStyle = '#ffffff'; X.lineWidth = 0.25 * u; X.beginPath(); X.arc(bx, byy, r * 0.65, Math.PI * 1.1, Math.PI * 1.45); X.stroke();
    X.globalAlpha = 1; FX.zzz(cx + 9 * u, cy - 7 * u, u, p.zzz, t, KPEN);
  }
  if (p.dots > 0.02) {
    X.globalAlpha = p.dots; X.fillStyle = '#ffffff'; X.strokeStyle = INK; X.lineWidth = 0.2 * u;
    for (const [dx, dy, r] of [[10.5, -8, 0.5], [12, -10, 0.8]]) { ell(cx + dx * u, cy + dy * u, r * u, r * u); X.fill(); X.stroke(); }
    const k = 6.5 * u / 180; X.lineWidth = 0.45 * u; cloudPath(cx + 15.5 * u, cy - 14 * u, k); X.stroke(); X.fillStyle = '#ffffff'; cloudPath(cx + 15.5 * u, cy - 14 * u, k); X.fill();
    const n = Math.floor(t / 350) % 4; X.fillStyle = INK; for (let i = 0; i < n; i++) { ell(cx + (14 + i * 1.3) * u, cy - 13.8 * u, 0.3 * u, 0.3 * u); X.fill(); }
    X.globalAlpha = 1;
  }
  if (p.arcs > 0.02) for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { X.globalAlpha = p.arcs * (((Math.floor(t / 250) + i) % 3) === 0 ? 1 : 0.35); X.strokeStyle = INK; X.lineWidth = 0.3 * u; X.beginPath(); X.arc(cx + s * 16 * u, cy - u, (0.8 + i * 0.9) * u, s > 0 ? -0.6 : Math.PI - 0.6, s > 0 ? 0.6 : Math.PI + 0.6); X.stroke(); X.globalAlpha = 1; }
  FX.tear(cx - 11.8 * u, Ey + 3.5 * u, u, p.tear, t, KPEN, a);
  FX.anger(cx + 12.5 * u, cy - 10 * u, u, p.anger, t, KPEN); FX.quest(cx + 14 * u, cy - 10 * u, u, p.quest, t, KPEN); FX.sweat(cx + 14 * u, cy - 6.5 * u, u, p.sweat, t, KPEN);
  X.restore();
}
function mCloud(x, y, k, lw) { X.lineWidth = lw * 2; X.strokeStyle = INK; cloudPath(x, y, k); X.stroke(); X.fillStyle = '#ffffff'; cloudPath(x, y, k); X.fill(); }
const manga = {
  id: 'manga', name: 'Manga', c: K, glow: 0, bubbles: true, qr: ['#ffffff', '#000000'], sleepA: 1, onFg: INK, fonts: ['30px Bangers', 'bold 30px "Comic Neue"'],
  rule(x, y, w, h) { X.fillStyle = K.fg; X.globalAlpha = 0.35; X.fillRect(x, y, w, h); X.globalAlpha = 1; },
  font: (s, k) => k === 'title' ? `${Math.round(s * 0.92)}px Bangers, Impact, sans-serif` : `700 ${Math.round(s * 0.74)}px "Comic Neue", "Comic Sans MS", sans-serif`,
  bg() { X.drawImage(screentone(), 0, 0, W, HT); },
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
  boot(e, info) {                     // a comic panel: speed lines, a "PIXEL !" burst, then Pixel wakes up
    const k = clamp(e / 500, 0, 1);
    X.save(); X.globalAlpha = 0.35 + 0.65 * k; X.translate(400, 180); X.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k); speedLines(0, 0); X.restore();
    const p = clamp((e - 300) / 450, 0, 1), sc = p < 1 ? smooth(p) * 1.15 - 0.15 * Math.sin(p * Math.PI) : 1 + 0.03 * Math.sin(e / 160);
    if (p > 0) {
      X.save(); X.translate(400, 132); X.rotate(-0.06); X.scale(sc, sc);
      X.fillStyle = INK; star(8, 8, 150, 14, 0.74); X.fill(); X.fillStyle = '#ffe36e'; star(0, 0, 150, 14, 0.74); X.fill(); X.lineWidth = 4; X.strokeStyle = INK; X.stroke();
      X.font = manga.font(96, 'title'); X.textAlign = 'center'; X.textBaseline = 'middle'; X.fillStyle = K.accent; X.fillText('PIXEL !', 6, 6); X.fillStyle = INK; X.fillText('PIXEL !', 0, 0);
      X.restore();
    }
    if (e > 1300) {
      X.save(); X.globalAlpha = clamp((e - 1300) / 300, 0, 1); X.fillStyle = INK; rr(214, 262, 380, 170, 8); X.fill(); X.fillStyle = '#ffffff'; rr(208, 256, 380, 170, 8); X.fill(); X.lineWidth = 3; X.strokeStyle = INK; X.stroke();
      X.beginPath(); rr(208, 256, 380, 170, 8); X.clip(); info.face(398, 340, 6.5, e < 2300 ? 'endormi' : 'surpris'); X.restore();
    }
    H.txt('Chargement' + '.'.repeat(1 + Math.floor(e / 300) % 3), 400, 444, 26, K.dim, 'center');
  },
};
/* =================== NÉON =================== */
/* Synthwave night: a striped sunset on a scrolling grid, the face drawn in neon tubes that flicker on. */
const N = { fg: '#3ff6ff', dim: '#a08ad8', faint: '#2d1b55', bg: '#0c0522', accent: '#ffa03d', pink: '#ff4fd8', hi: '#fff0fb' };
function tube(c, w, path) {           // a neon tube without shadowBlur: soft halo, coloured tube, white-hot core
  const ga = X.globalAlpha; path(); X.strokeStyle = c; X.lineCap = X.lineJoin = 'round';
  X.globalAlpha = ga * 0.2; X.lineWidth = w * 3.4; X.stroke();
  X.globalAlpha = ga; X.lineWidth = w; X.stroke();
  X.globalAlpha = ga * 0.75; X.strokeStyle = '#ffffff'; X.lineWidth = Math.max(0.8, w * 0.32); X.stroke(); X.globalAlpha = ga;
}
function neonSun(g, x, y, r) {        // the striped sunset disc
  const l = g.createLinearGradient(0, y - r, 0, y + r); l.addColorStop(0, '#ffe46b'); l.addColorStop(0.45, '#ff9b3d'); l.addColorStop(1, '#ff3fb4');
  g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip(); g.fillStyle = l; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 7; i++) { const yy = y + r * (0.05 + i * 0.14), hh = r * (0.02 + i * 0.012); g.fillRect(x - r, yy, 2 * r, hh); }
  g.restore();
}
function neonCloud(x, y, k) {         // a cloud outline made of three bumps
  X.beginPath(); X.moveTo(x - 82 * k, y + 36 * k); X.arc(x - 50 * k, y + 8 * k, 30 * k, Math.PI * 0.85, Math.PI * 1.62); X.arc(x - 4 * k, y - 14 * k, 40 * k, Math.PI * 1.1, Math.PI * 1.92);
  X.arc(x + 46 * k, y + 6 * k, 30 * k, Math.PI * 1.35, Math.PI * 2.22); X.lineTo(x - 82 * k, y + 36 * k); X.closePath();
}
const NT = moodTable({ surpris: { ew: 1.3, eh: 1.0 } });
const NPEN = { ink: N.hi, accent: N.accent, love: N.pink, water: N.fg, lens: '#12062e', frame: N.pink, spark: N.hi, z: 'Z', anger: N.accent };
function neonFace(cx, cy, u, md, lx = 0, ly = 0, a) {
  a = life(a, md, lx, ly);
  const t = H.now, p = rig(a, NT), lw = Math.max(1.6, 0.6 * u), flick = t % 23000 < 420 && Math.floor(t / 60) % 3 === 0;
  X.save(); X.shadowBlur = 0; cy += a.breath * 0.2 * u; body(cx, cy, u, a);
  const ex = a.lx * 1.2 * u, ey = a.ly * 1.0 * u, Ey = cy - 2.5 * u + ey + p.eyeY * u, eyeC = p.tint > 0.01 ? mixC(N.pink, '#9dff6a', 0.85 * p.tint) : N.pink;
  if (p.blush > 0.02) for (const s of [-1, 1]) { X.globalAlpha = p.blush * 0.85; tube(N.pink, Math.max(1.2, 0.32 * u), () => { X.beginPath(); for (let i = 0; i < 3; i++) { const x = cx + s * 13.6 * u + (i - 1) * 1.3 * u; X.moveTo(x - 0.5 * u, Ey + 6.6 * u); X.lineTo(x + 0.5 * u, Ey + 5.2 * u); } }); }
  X.globalAlpha = 1;
  for (const side of [-1, 1]) {
    const x = cx + side * 8.5 * u + ex, right = side > 0, happy = right ? Math.max(p.happy, p.rHappy) : p.happy, open = p.open * (right ? p.rOpen : 1), k = 1 - Math.max(p.heart, p.star);
    if (k > 0.03 && p.shades < 0.98) {
      const s = 0.35 + 0.65 * k, w = 6.6 * u * p.ew * s, h = Math.max(0.6 * u, 8.4 * u * p.eh * open) * s, pts = eyePoly(x, Ey, w, h, p.lid, p.slant, happy, side, lerp(0.44, 0.5, clamp((p.ew - 1) / 0.3, 0, 1)));
      X.globalAlpha = (1 - p.shades) * (flick && side < 0 ? 0.25 : 1);
      poly(pts); X.fillStyle = hexA(N.pink, 0.1); X.fill();
      tube(eyeC, lw, () => poly(pts));
      const vis = open * (1 - happy) * (1 - p.lid) * k;
      if (vis > 0.25) {                // the pupil, a cyan dot that follows the gaze
        X.save(); poly(pts); X.clip(); X.globalAlpha *= clamp((vis - 0.25) / 0.2, 0, 1);
        const px = x + a.lx * 1.0 * u, py = Ey + a.ly * 1.2 * u + 0.5 * u, pr = 1.55 * u * p.pup;
        X.fillStyle = hexA(N.fg, 0.3); ell(px, py, pr * 1.7, pr * 1.7); X.fill(); X.fillStyle = N.fg; ell(px, py, pr, pr); X.fill();
        X.fillStyle = '#ffffff'; ell(px - pr * 0.35, py - pr * 0.35, pr * 0.35, pr * 0.35); X.fill(); X.restore();
      }
      X.globalAlpha = 1;
    }
    if (p.heart > 0.03) tube(N.pink, lw, () => heart(x, Ey, 4.2 * u * p.heart * (1 + 0.1 * Math.sin(t / 170))));
    if (p.star > 0.03) tube('#ffe66b', lw, () => star(x, Ey + 0.4 * u, 5.2 * u * p.star * (1 + 0.08 * Math.sin(t / 130)), 5, 0.5, 0.15 * Math.sin(t / 400)));
  }
  if (p.shades > 0.02) {                // neon sunglasses with a light sweeping across
    const dy = (1 - p.shades) * -7 * u, k = p.shades, Lx = cx - 8.5 * u + ex * 0.7, Rx = cx + 8.5 * u + ex * 0.7;
    const lens = x => { X.beginPath(); X.moveTo(x - 4.4 * u, Ey - 2.4 * u + dy); X.lineTo(x + 4.4 * u, Ey - 2.4 * u + dy); X.lineTo(x + 3.6 * u, Ey + 2.6 * u + dy); X.lineTo(x - 3.2 * u, Ey + 2.6 * u + dy); X.closePath(); };
    X.globalAlpha = k;
    for (const x of [Lx, Rx]) { lens(x); X.fillStyle = 'rgba(18,6,46,0.92)'; X.fill(); tube(N.pink, lw, () => lens(x)); }
    tube(N.pink, lw * 0.8, () => { X.beginPath(); X.moveTo(Lx + 4.4 * u, Ey - 1.6 * u + dy); X.lineTo(Rx - 4.4 * u, Ey - 1.6 * u + dy); });
    const g = cyc({ since: t }, 2400);
    for (const x of [Lx, Rx]) { X.save(); lens(x); X.clip(); const gx = x - 8 * u + g * 26 * u; tube(N.fg, lw * 0.7, () => { X.beginPath(); X.moveTo(gx, Ey - 3 * u + dy); X.lineTo(gx - 2.6 * u, Ey + 3 * u + dy); }); X.restore(); }
    X.globalAlpha = 1;
  }
  const mx = cx + a.lx * 0.6 * u, my = cy + 5.3 * u + ey * 0.4, pts = mouthPts(mx, my, u, p, t), la = 1 - p.mbars;
  if (la > 0.02) {
    const fa = smooth(clamp(p.mo / 0.25, 0, 1)); X.globalAlpha = la;
    if (fa > 0.02) { poly(pts); X.fillStyle = hexA(N.fg, 0.16 * fa); X.fill(); tube(N.fg, lw * 0.85, () => poly(pts)); }
    else tube(N.fg, lw * 0.85, () => lipLine(pts));
    if (p.mteeth > 0.02) { X.save(); poly(pts); X.clip(); X.globalAlpha = la * p.mteeth; tube(N.hi, lw * 0.4, () => { X.beginPath(); X.moveTo(mx - 3 * u, my + 0.1 * u); X.lineTo(mx + 3 * u, my + 0.1 * u); for (const d of [-1.1, 0, 1.1]) { X.moveTo(mx + d * u, my - 2 * u); X.lineTo(mx + d * u, my + 2 * u); } }); X.restore(); }
    X.globalAlpha = 1;
  }
  if (p.mbars > 0.02) { X.globalAlpha = p.mbars; for (let i = 0; i < 7; i++) { const h = (0.6 + 2 * (0.5 + 0.5 * Math.sin(t / 90 + i * 1.9)) * Math.sin((i + 0.5) / 7 * Math.PI)) * u, x = mx - 3.2 * u + i * 1.07 * u; tube(N.fg, lw * 0.6, () => { X.beginPath(); X.moveTo(x, my - h / 2); X.lineTo(x, my + h / 2); }); } X.globalAlpha = 1; }
  FX.thermo(mx + 1.4 * u, my + 0.6 * u, u, p.tint, t, {});
  X.shadowBlur = sb(10); X.shadowColor = N.pink;
  FX.tear(cx - 11.6 * u + ex, Ey + 3.2 * u, u, p.tear, t, NPEN, a);
  extras(cx, cy, u, p, a, NPEN);
  X.restore();
}
const NWX = { sun: '#ffd15a', cloud: '#b9a6ff', rain: N.fg, snow: '#ffffff', bolt: '#ffe66b' };
const neon = {
  id: 'neon', name: 'Néon', c: N, glow: 8, bubbles: true, qr: ['#ffffff', '#0c0522'], gridA: 0.7, onFg: N.bg, fonts: ['30px Audiowide', '600 30px "Chakra Petch"'],
  bubbleInk: mine => mine ? N.hi : N.fg,
  font: (s, k) => k === 'title' ? `${Math.round(s * 0.8)}px Audiowide, "DejaVu Sans", sans-serif` : `600 ${Math.round(s * 0.86)}px "Chakra Petch", "DejaVu Sans", sans-serif`,
  bg() {
    const big = H.scr === 'visage' || H.scr === 'veille' || H.scr === 'boot', sunny = H.scr === 'veille', hz = big ? 362 : 404;
    X.drawImage(cached('neon-sky' + (big ? 1 : 0) + (sunny ? 1 : 0), W, HT, g => {
      const l = g.createLinearGradient(0, 0, 0, HT); l.addColorStop(0, '#06021a'); l.addColorStop(hz / HT, '#24073f'); l.addColorStop(1, '#14042a'); g.fillStyle = l; g.fillRect(0, 0, W, HT);
      for (let i = 0; i < 80; i++) { const x = (i * 137.508) % W, y = (i * 61.3 + (i % 3) * 17) % (hz - 30); g.fillStyle = `rgba(255,240,251,${0.12 + (i % 5) * 0.09})`; const s = i % 9 === 0 ? 2 : 1; g.fillRect(x, y, s, s); }
      if (big) {
        if (sunny) { g.save(); g.globalAlpha = 0.85; neonSun(g, 400, hz - 8, 104); g.restore(); }
        g.fillStyle = '#12052a'; g.beginPath(); g.moveTo(0, hz);                     // mountains on the horizon
        [[0, 330], [70, 300], [130, 322], [200, 288], [250, 314], [310, 296], [340, hz], [460, hz], [500, 300], [560, 322], [620, 284], [690, 318], [740, 302], [800, 326]].forEach(([x, y]) => g.lineTo(x, y - (362 - hz)));
        g.lineTo(800, hz); g.closePath(); g.fill(); g.strokeStyle = 'rgba(255,79,216,0.55)'; g.lineWidth = 1.5; g.stroke();
      }
      const hl = g.createLinearGradient(0, 0, W, 0); hl.addColorStop(0, 'rgba(255,79,216,0)'); hl.addColorStop(0.5, 'rgba(255,79,216,0.9)'); hl.addColorStop(1, 'rgba(255,79,216,0)');
      g.fillStyle = hl; g.fillRect(0, hz - 1, W, 2); g.fillStyle = 'rgba(255,79,216,0.12)'; g.fillRect(0, hz - 6, W, 12);
    }), 0, 0, W, HT);
    X.save(); X.beginPath(); X.rect(0, hz, W, HT - hz); X.clip(); X.strokeStyle = N.pink; X.lineWidth = 1.2;   // the grid floor scrolls toward you
    X.globalAlpha = big ? 0.5 : 0.3; X.beginPath(); for (let i = -9; i <= 9; i++) { X.moveTo(400 + i * 14, hz); X.lineTo(400 + i * 150, HT + 40); } X.stroke();
    const ph = H.RM ? 0 : (H.now / 2200) % 1;
    for (let k = 0; k < 8; k++) { const d = (k + ph) / 8, y = hz + (HT - hz) * d * d; X.globalAlpha = (big ? 0.6 : 0.35) * d; X.beginPath(); X.moveTo(0, y); X.lineTo(W, y); X.stroke(); }
    X.restore();
  },
  header(title, clock) {
    H.txt(title, 24, 12, 34, N.hi, 'left', 'title'); H.txt(clock, W - 24, 14, 30, N.dim, 'right', 'title');
    const b = X.shadowBlur; X.shadowBlur = 0;
    X.drawImage(cached('neon-rule', W, 8, g => { const l = g.createLinearGradient(20, 0, W - 20, 0); l.addColorStop(0, N.pink); l.addColorStop(1, N.fg); g.fillStyle = l; g.globalAlpha = 0.25; g.fillRect(20, 1, W - 40, 6); g.globalAlpha = 1; g.fillRect(20, 3, W - 40, 2); }), 0, 46, W, 8);
    X.shadowBlur = b;
  },
  box(x, y, w, h, c = N.fg, fill) {
    const b = X.shadowBlur; X.shadowBlur = 0; rr(x, y, w, h, Math.min(10, h / 2));
    X.fillStyle = fill === N.bg ? 'rgba(12,5,34,0.96)' : fill === N.faint ? 'rgba(45,27,85,0.6)' : fill ? fill : 'rgba(12,5,34,0.4)'; X.fill();
    const ga = X.globalAlpha; X.strokeStyle = c; X.globalAlpha = ga * 0.22; X.lineWidth = 5; X.stroke(); X.globalAlpha = ga; X.lineWidth = 1.8; X.stroke(); X.shadowBlur = b;
  },
  bar(x, y, n, filled, w, h, gap, on = N.fg, off = N.faint) {
    const b = X.shadowBlur;
    for (let i = 0; i < n; i++) {
      const f = clamp(filled - i, 0, 1), xx = x + i * (w + gap); X.shadowBlur = 0; X.fillStyle = off; rr(xx, y, w, h, Math.min(3, w / 2)); X.fill();
      if (f > 0) { X.shadowBlur = b; X.shadowColor = on; X.fillStyle = on; rr(xx, y, w * f, h, Math.min(3, w / 2)); X.fill(); }
    }
    X.shadowBlur = b;
  },
  bubble(x, y, w, h, mine) { const b = X.shadowBlur; X.shadowBlur = 0; rr(x, y, w, h, 16); X.fillStyle = 'rgba(12,5,34,0.7)'; X.fill(); tube(mine ? N.pink : N.fg, 1.6, () => rr(x, y, w, h, 16)); X.shadowBlur = b; },
  bulb(cx, cy, on, i) {
    const b = X.shadowBlur; X.shadowBlur = 0;
    if (on) { X.fillStyle = hexA(N.accent, 0.18 + 0.06 * Math.sin(H.now / 500 + i)); ell(cx, cy - 4, 22, 22); X.fill(); X.fillStyle = hexA(N.accent, 0.5); ell(cx, cy - 4, 11, 11); X.fill(); }
    X.globalAlpha = on ? 1 : 0.45; tube(on ? N.accent : N.dim, 2, () => { X.beginPath(); X.arc(cx, cy - 4, 12, Math.PI * 0.72, Math.PI * 2.28); X.moveTo(cx - 5, cy + 8); X.lineTo(cx + 5, cy + 8); X.moveTo(cx - 4, cy + 13); X.lineTo(cx + 4, cy + 13); }); X.globalAlpha = 1; X.shadowBlur = b;
  },
  weather(kind, cx, cy, size, active) {
    const mini = size === 'mini', k = mini ? 0.22 : 1, t = H.now, b = X.shadowBlur, lw = mini ? 1.6 : 4;
    X.save(); X.shadowBlur = 0; X.globalAlpha = mini && !active ? 0.55 : 1;
    const sun = (x, y, s) => { const r = Math.round(80 * s); X.drawImage(cached('neon-wsun' + r, 2 * r + 4, 2 * r + 4, g => neonSun(g, r + 2, r + 2, r)), x - r - 2, y - r - 2 + (mini ? 0 : Math.sin(t / 900) * 3), 2 * r + 4, 2 * r + 4); };
    if (kind === 'soleil') sun(cx, cy - 10 * k, k);
    else {
      if (kind === 'nuage') sun(cx + 44 * k, cy - 44 * k, 0.55 * k);
      const dx = mini ? 0 : Math.sin(t / 1600) * 8;
      neonCloud(cx + dx, cy - 10 * k, k); X.fillStyle = 'rgba(20,6,44,0.85)'; X.fill(); tube(kind === 'orage' ? '#8f7bd6' : NWX.cloud, lw, () => neonCloud(cx + dx, cy - 10 * k, k));
      if (kind === 'pluie' || kind === 'orage') for (let i = 0; i < (mini ? 3 : 8); i++) { const p = mini ? 0.35 : (t / 800 + i * 0.29) % 1, x = cx - 56 * k + (i * 37 % 120) * k, y = cy + 44 * k + p * 70 * k; X.globalAlpha = (mini && !active ? 0.55 : 1) * (1 - p * 0.6); tube(NWX.rain, lw * 0.8, () => { X.beginPath(); X.moveTo(x, y); X.lineTo(x - 5 * k, y + 16 * k); }); }
      if (kind === 'neige') for (let i = 0; i < (mini ? 3 : 10); i++) { const p = mini ? 0.35 : (t / 2600 + i * 0.21) % 1, x = cx - 56 * k + (i * 41 % 120) * k + Math.sin(t / 600 + i) * 6 * k, y = cy + 48 * k + p * 70 * k, r = 6 * k; tube(NWX.snow, lw * 0.6, () => { X.beginPath(); for (let j = 0; j < 3; j++) { const a = j * Math.PI / 3; X.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); X.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } }); }
      if (kind === 'orage' && (mini || Math.floor(t / 150) % 10 < 3)) tube(NWX.bolt, lw, () => { X.beginPath(); X.moveTo(cx + 6 * k, cy + 22 * k); X.lineTo(cx - 14 * k, cy + 60 * k); X.lineTo(cx + 2 * k, cy + 58 * k); X.lineTo(cx - 10 * k, cy + 96 * k); });
    }
    X.restore(); X.shadowBlur = b;
  },
  digits(str, cx, y, col) {
    X.save(); X.font = '124px Audiowide, "DejaVu Sans", sans-serif'; X.textAlign = 'center'; X.textBaseline = 'top';
    X.shadowBlur = 0; X.globalAlpha = 0.75; X.fillStyle = N.pink; X.fillText(str, cx + 5, y - 2);
    X.globalAlpha = 1; X.shadowColor = col === N.accent ? N.accent : N.fg; X.shadowBlur = sb(24); X.fillStyle = col; X.fillText(str, cx, y - 7); X.restore();
  },
  star(x, y, sz, near) { X.fillStyle = near ? N.hi : N.dim; X.fillRect(x, y, sz * 0.8, sz * 0.8); },
  face: neonFace,
  boot(e, info) {                     // the sign flickers on, then Pixel wakes up
    const on = i => { const s = e - 250 - i * 160; return s > 0 && !(s < 380 && Math.floor(s / 55) % 3 === 1); };
    X.save(); X.font = '92px Audiowide, "DejaVu Sans", sans-serif'; X.textBaseline = 'top'; X.textAlign = 'left';
    const word = 'PIXEL', ws = [...word].map(c => X.measureText(c).width), tw = ws.reduce((a, b) => a + b + 6, -6); let x = 400 - tw / 2;
    [...word].forEach((c, i) => { X.globalAlpha = on(i) ? 1 : 0.12; X.shadowColor = N.pink; X.shadowBlur = sb(22); X.fillStyle = on(i) ? N.hi : N.pink; X.fillText(c, x, 70); x += ws[i] + 6; });
    X.restore();
    if (e > 1300) { X.globalAlpha = clamp((e - 1300) / 300, 0, 1); info.face(400, 268, 6.5, e < 2300 ? 'endormi' : 'content'); X.globalAlpha = 1; }
    const p = smooth(clamp((e - 300) / 2900, 0, 1)), b = X.shadowBlur; X.shadowBlur = 0;
    tube(N.faint, 3, () => { X.beginPath(); X.moveTo(250, 436); X.lineTo(550, 436); }); if (p > 0.01) tube(N.fg, 3, () => { X.beginPath(); X.moveTo(250, 436); X.lineTo(250 + 300 * p, 436); });
    X.shadowBlur = b;
  },
};

/* =================== CROQUIS =================== */
/* Pencil sketch on lined notebook paper: wobbly graphite lines that boil gently, a red pen, a yellow highlighter. */
const Q = { fg: '#2c2c30', dim: '#77736a', faint: '#d9d3c3', bg: '#fbf8ef', accent: '#d2412c', pink: '#ec87a3', hi: '#18181b' };
const jit = (i, s) => { const h = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return (h - Math.floor(h)) * 2 - 1; };
const boil = () => H.RM ? 1 : Math.floor(H.now / 140);          // the lines are redrawn 7 times a second, like an animated sketch
/* a hand-drawn polyline: two passes with a little jitter; pts = flat [x, y, ...] */
function pencil(pts, closed, amp, seed, lw = 2, col = Q.fg, fill, C = X) {
  const n = pts.length / 2, ga = C.globalAlpha;
  for (let pass = 0; pass < 2; pass++) {
    C.beginPath();
    for (let i = 0; i <= (closed ? n : n - 1); i++) { const j = i % n, x = pts[2 * j] + amp * jit(j + pass * 31, seed), y = pts[2 * j + 1] + amp * jit(j + pass * 57 + 7, seed); i ? C.lineTo(x, y) : C.moveTo(x, y); }
    if (pass === 0 && fill) { C.fillStyle = fill; C.fill(); }
    C.strokeStyle = col; C.lineWidth = pass ? lw * 0.6 : lw; C.lineCap = C.lineJoin = 'round'; C.globalAlpha = ga * (pass ? 0.5 : 0.9); C.stroke();
  }
  C.globalAlpha = ga;
}
function skLine(x0, y0, x1, y1, seed, lw = 2, col = Q.fg, amp = 1.2, C = X) {       // overshoots a little at the ends, like a quick stroke
  const dx = x1 - x0, dy = y1 - y0, o = 0.03;
  pencil([x0 - dx * o, y0 - dy * o, lerp(x0, x1, 0.5) + amp * jit(3, seed) * 1.5, lerp(y0, y1, 0.5) + amp * jit(4, seed) * 1.5, x1 + dx * o, y1 + dy * o], false, amp, seed, lw, col, null, C);
}
function skRect(x, y, w, h, seed, lw = 2, col = Q.fg, fill, C = X) {
  if (fill) { C.fillStyle = fill; C.fillRect(x + 1, y + 1, w - 2, h - 2); }
  skLine(x, y, x + w, y + 0.5, seed, lw, col, 1.2, C); skLine(x + w, y, x + w - 0.5, y + h, seed + 1, lw, col, 1.2, C);
  skLine(x + w, y + h, x, y + h - 0.5, seed + 2, lw, col, 1.2, C); skLine(x, y + h, x + 0.5, y, seed + 3, lw, col, 1.2, C);
}
/* the static sketched outlines (boxes, bar segments) are drawn once into a sprite and reused */
function skRectC(x, y, w, h, lw, col) {
  const k = `q-r${Math.round(w)}_${Math.round(h)}_${lw}_${col}`, seed = (Math.round(w) * 7 + Math.round(h) * 13) % 97;
  X.drawImage(cached(k, w + 10, h + 10, g => skRect(5, 5, w, h, seed, lw, col, null, g)), x - 5, y - 5, w + 10, h + 10);
}
function skBarC(x, y, n, w, h, gap, col, a0, a1) {   // n sketched squares, shown from x + a0 to x + a1 only
  const tw = n * (w + gap) - gap, k = `q-b${n}_${w}_${h}_${gap}_${col}`;
  if (a1 <= a0) return;
  const spr = cached(k, tw + 10, h + 10, g => { for (let i = 0; i < n; i++) skRect(5 + i * (w + gap), 5, w, h, i * 17 + 3, 1.4, col, null, g); });
  const s0 = x + (a0 > 0 ? a0 : -5), s1 = x + a1;
  X.save(); X.beginPath(); X.rect(s0, y - 5, s1 - s0, h + 10); X.clip(); X.drawImage(spr, x - 5, y - 5, tw + 10, h + 10); X.restore();
}
function ellPts(x, y, rx, ry, n = 22, over = 0.08) { const p = []; for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + i / n * TAU * (1 + over); p.push(x + Math.cos(a) * rx, y + Math.sin(a) * ry); } return p; }
const QPAT = {};
function hatchPat(col, gap = 6, cross = false) {   // a cached hatching pattern (pencil shading); filled shapes get it as fillStyle
  const S = SC(), key = col + gap + cross + S;
  if (QPAT[key]) return QPAT[key];
  const c = cached('q-h' + key, gap * 4, gap * 4, (g, w) => { g.strokeStyle = col; g.lineWidth = 1.1; g.globalAlpha = 0.7; g.beginPath(); for (let i = -4; i <= 8; i++) { g.moveTo(i * gap, w); g.lineTo(i * gap + w, 0); if (cross) { g.moveTo(i * gap, 0); g.lineTo(i * gap + w, w); } } g.stroke(); });
  const p = X.createPattern(c, 'repeat'); p.setTransform(new DOMMatrix([1 / S, 0, 0, 1 / S, 0, 0])); return (QPAT[key] = p);
}
const HL = 'rgba(255,233,77,0.72)';                  // yellow highlighter
const QT = moodTable({ surpris: { ew: 1.28, eh: 1.0 } });
const QPEN = { ink: Q.fg, out: Q.fg, accent: Q.accent, love: Q.pink, water: '#7fb6e8', lens: '#2c2c30', frame: Q.fg, spark: Q.fg, anger: Q.accent, z: 'z', lw: 0.32 };
function croquisFace(cx, cy, u, md, lx = 0, ly = 0, a) {
  a = life(a, md, lx, ly);
  const t = H.now, p = rig(a, QT), sd = boil(), lw = Math.max(1.3, 0.34 * u), amp = Math.max(0.5, 0.09 * u);
  X.save(); X.shadowBlur = 0; body(cx, cy, u, a);
  const ex = a.lx * 1.2 * u, ey = a.ly * 1.0 * u, Ey = cy - 2.5 * u + ey + p.eyeY * u;
  if (p.blush > 0.02 || p.tint > 0.02) for (const s of [-1, 1]) {           // coloured-pencil cheeks (green when sick)
    X.globalAlpha = Math.max(p.blush, p.tint); X.fillStyle = hatchPat(p.tint > 0.5 ? '#6fae4f' : Q.pink, Math.max(3, 0.32 * u)); ell(cx + s * 13 * u, cy + 3.2 * u, 2.6 * u, 1.3 * u); X.fill();
  }
  X.globalAlpha = 1;
  for (const side of [-1, 1]) {
    const x = cx + side * 8.5 * u + ex, right = side > 0, happy = right ? Math.max(p.happy, p.rHappy) : p.happy, open = p.open * (right ? p.rOpen : 1), k = 1 - Math.max(p.heart, p.star);
    if (k > 0.03 && p.shades < 0.98) {
      const s = 0.35 + 0.65 * k, w = 6.4 * u * p.ew * s, h = Math.max(0.6 * u, 8.2 * u * p.eh * open) * s, pts = eyePoly(x, Ey, w, h, p.lid, p.slant, happy, side, lerp(0.46, 0.5, clamp((p.ew - 1) / 0.3, 0, 1)));
      X.globalAlpha = 1 - p.shades;
      poly(pts); X.fillStyle = '#ffffff'; X.fill();
      const vis = open * (1 - happy) * (1 - p.lid) * k;
      if (vis > 0.2) {                 // graphite pupil with a shine, inside the eye
        X.save(); poly(pts); X.clip(); X.globalAlpha *= clamp((vis - 0.2) / 0.2, 0, 1);
        const px = x + a.lx * 1.0 * u, py = Ey + a.ly * 1.2 * u + 0.6 * u, pr = 1.9 * u * p.pup;
        X.fillStyle = Q.fg; ell(px, py, pr, pr * 1.08); X.fill(); X.fillStyle = hatchPat('#000000', 3, true); ell(px, py, pr, pr * 1.08); X.fill();
        X.fillStyle = '#ffffff'; ell(px - pr * 0.38, py - pr * 0.4, pr * 0.34, pr * 0.34); X.fill(); X.restore();
      }
      pencil(pts, true, amp, sd + side * 3, lw);
      X.globalAlpha = 1;
    }
    if (p.heart > 0.03) { const s = 4.2 * u * p.heart * (1 + 0.1 * Math.sin(t / 170)); heart(x, Ey, s); X.fillStyle = hatchPat(Q.accent, Math.max(3, 0.3 * u), true); X.fill(); const hp = []; for (let i = 0; i <= 24; i++) { const th = i / 24 * TAU, hx = 16 * Math.pow(Math.sin(th), 3), hy = -(13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th)); hp.push(x + hx * s / 15, Ey + hy * s / 15 - s * 0.05); } pencil(hp, true, amp, sd + side, lw, Q.accent); }
    if (p.star > 0.03) { const r = 5.2 * u * p.star * (1 + 0.08 * Math.sin(t / 130)), sp = []; for (let i = 0; i <= 10; i++) { const an = i / 10 * TAU - Math.PI / 2, d = i % 2 ? r * 0.48 : r; sp.push(x + Math.cos(an) * d, Ey + 0.4 * u + Math.sin(an) * d); } X.beginPath(); for (let i = 0; i < sp.length; i += 2) i ? X.lineTo(sp[i], sp[i + 1]) : X.moveTo(sp[i], sp[i + 1]); X.fillStyle = HL; X.fill(); pencil(sp, true, amp, sd + side, lw); }
  }
  if (p.shades > 0.02) FX.shades(cx - 8.5 * u + ex * 0.7, cx + 8.5 * u + ex * 0.7, Ey, u, p.shades, t, QPEN);
  const mx = cx + a.lx * 0.6 * u, my = cy + 5.3 * u + ey * 0.4, pts = mouthPts(mx, my, u, p, t), la = 1 - p.mbars;
  if (la > 0.02) {
    const fa = smooth(clamp(p.mo / 0.22, 0, 1)); X.globalAlpha = la;
    if (fa > 0.02) {
      X.globalAlpha = la * fa; poly(pts); X.fillStyle = '#5a2b2b'; X.fill(); X.save(); poly(pts); X.clip();
      if (p.mteeth > 0.02) { X.fillStyle = '#ffffff'; X.globalAlpha = la * fa * p.mteeth; X.fillRect(mx - 4 * u, my - 3 * u, 8 * u, 6 * u); }
      X.globalAlpha = la * fa * (1 - p.mteeth); X.fillStyle = Q.pink; ell(mx, my + (0.6 + 2.4 * p.mo) * u, (0.9 + 0.7 * p.mo) * u, (0.5 + 0.5 * p.mo) * u); X.fill(); X.restore();
      X.globalAlpha = la; pencil(pts, true, amp, sd + 9, lw);
      if (p.mteeth > 0.02) { X.save(); poly(pts); X.clip(); X.globalAlpha = la * p.mteeth; for (const d of [-1.1, 0, 1.1]) skLine(mx + d * u, my - 2 * u, mx + d * u, my + 2 * u, sd + d * 5, lw * 0.6); skLine(mx - 3 * u, my + 0.1 * u, mx + 3 * u, my + 0.1 * u, sd + 4, lw * 0.6); X.restore(); }
    } else pencil(pts.slice(0, pts.length / 2), false, amp, sd + 9, lw);
    X.globalAlpha = 1;
  }
  if (p.mbars > 0.02) { X.globalAlpha = p.mbars; for (let i = 0; i < 7; i++) { const h = (0.6 + 2 * (0.5 + 0.5 * Math.sin(t / 90 + i * 1.9)) * Math.sin((i + 0.5) / 7 * Math.PI)) * u, x = mx - 3.2 * u + i * 1.07 * u; skLine(x, my - h / 2, x, my + h / 2, sd + i, lw * 1.2); } X.globalAlpha = 1; }
  FX.thermo(mx + 1.4 * u, my + 0.6 * u, u, p.tint, t, { out: Q.fg });
  FX.tear(cx - 11.6 * u + ex, Ey + 3.2 * u, u, p.tear, t, QPEN, a);
  extras(cx, cy, u, p, a, QPEN);
  X.restore();
}
function qSun(x, y, s, mini) {
  const t = mini ? 0 : H.now, sd = mini ? 3 : boil();
  for (let i = 0; i < 10; i++) { const an = i / 10 * TAU + t / 4000, r0 = 58 * s, r1 = (78 + 6 * Math.sin(t / 300 + i)) * s; skLine(x + Math.cos(an) * r0, y + Math.sin(an) * r0, x + Math.cos(an) * r1, y + Math.sin(an) * r1, sd + i, mini ? 1.2 : 2.4); }
  X.fillStyle = HL; ell(x, y, 48 * s, 48 * s); X.fill(); X.fillStyle = hatchPat('#c98a1a', mini ? 3 : 6); X.save(); ell(x, y, 48 * s, 48 * s); X.clip(); X.fillRect(x, y - 10 * s, 50 * s, 60 * s); X.restore();
  pencil(ellPts(x, y, 48 * s, 48 * s), false, mini ? 0.4 : 1.4, sd, mini ? 1.3 : 2.6);
}
function qCloud(x, y, k, mini, dark) {
  const sd = mini ? 5 : boil(); neonCloud(x, y, k); X.fillStyle = '#ffffff'; X.fill(); X.fillStyle = hatchPat(dark ? '#55555b' : '#9a978e', mini ? 3 : 7, !!dark); X.fill();
  const pts = []; for (const [cx2, cy2, r, a0, a1] of [[-50, 8, 30, 0.85, 1.62], [-4, -14, 40, 1.1, 1.92], [46, 6, 30, 1.35, 2.22]]) for (let i = 0; i <= 6; i++) { const an = Math.PI * lerp(a0, a1, i / 6); pts.push(x + (cx2 + Math.cos(an) * r) * k, y + (cy2 + Math.sin(an) * r) * k); }
  pts.push(x + 76 * k, y + 36 * k, x - 82 * k, y + 36 * k); pencil(pts, true, mini ? 0.4 : 1.3, sd, mini ? 1.2 : 2.6);
}
const croquis = {
  id: 'croquis', name: 'Croquis', c: Q, glow: 0, bubbles: true, qr: ['#ffffff', '#2c2c30'], gridA: 0.9, sleepA: 0.8, onFg: Q.hi,
  fonts: ['700 30px Caveat', '30px "Patrick Hand"'],
  font: (s, k) => k === 'title' ? `700 ${Math.round(s * 1.08)}px Caveat, "Comic Neue", cursive` : `${Math.round(s * 0.94)}px "Patrick Hand", "Comic Neue", sans-serif`,
  bg() {
    X.drawImage(cached('q-paper', W, HT, g => {
      g.fillStyle = Q.bg; g.fillRect(0, 0, W, HT);
      g.fillStyle = 'rgba(120,110,90,0.05)'; for (let i = 0; i < 1400; i++) { const x = (Math.sin(i * 91.7) * 0.5 + 0.5) * W, y = (Math.sin(i * 47.3 + 1) * 0.5 + 0.5) * HT; g.fillRect(x, y, 1 + (i % 3 === 0), 1); }
      g.fillStyle = 'rgba(126,168,214,0.42)'; for (let y = 86; y < HT; y += 32) g.fillRect(0, y, W, 1.2);
      g.fillStyle = 'rgba(220,90,80,0.45)'; g.fillRect(14, 0, 1.5, HT);
      const v = g.createRadialGradient(W / 2, HT / 2, HT * 0.45, W / 2, HT / 2, W * 0.62); v.addColorStop(0, 'rgba(120,100,60,0)'); v.addColorStop(1, 'rgba(120,100,60,0.1)'); g.fillStyle = v; g.fillRect(0, 0, W, HT);
    }), 0, 0, W, HT);
  },
  header(title, clock) {
    X.font = croquis.font(36, 'title'); const tw = X.measureText(title).width;
    X.fillStyle = HL; X.beginPath(); X.moveTo(20, 16); X.lineTo(34 + tw, 12); X.lineTo(36 + tw, 44); X.lineTo(22, 46); X.closePath(); X.fill();
    H.txt(title, 28, 6, 36, Q.hi, 'left', 'title'); H.txt(clock, W - 24, 12, 30, Q.dim, 'right');
    skLine(20, 51, W - 20, 50, 11, 1.6, Q.dim, 0.8);
  },
  box(x, y, w, h, c = Q.fg, fill) {
    const col = c === Q.accent ? Q.accent : c === Q.dim ? '#9d998f' : c === Q.hi ? Q.hi : Q.fg;
    if (fill === Q.bg) { X.fillStyle = 'rgba(60,50,30,0.12)'; X.fillRect(x + 4, y + 5, w, h); X.fillStyle = '#fffdf6'; X.fillRect(x, y, w, h); }
    else if (fill === Q.faint) { X.fillStyle = hatchPat('#a39f93', 6); X.fillRect(x + 2, y + 2, w - 4, h - 4); }
    else if (fill === Q.fg) { X.fillStyle = HL; X.beginPath(); X.moveTo(x + 2, y + 4); X.lineTo(x + w - 3, y + 1); X.lineTo(x + w - 1, y + h - 3); X.lineTo(x + 3, y + h - 1); X.closePath(); X.fill(); }
    else if (fill) { X.fillStyle = hexA(fill, 0.25); X.fillRect(x, y, w, h); }
    skRectC(x, y, w, h, c === Q.hi ? 2.6 : 2, col);
  },
  bar(x, y, n, filled, w, h, gap, on = Q.fg, off = Q.faint) {
    const pat = hatchPat(on === Q.accent ? Q.accent : on === Q.dim ? '#8d897f' : Q.fg, 4, true), nf = Math.ceil(clamp(filled, 0, n)), cut = nf * (w + gap) - gap / 2;
    for (let i = 0; i < nf; i++) { const f = clamp(filled - i, 0, 1); X.fillStyle = pat; X.fillRect(x + i * (w + gap) + 1, y + 1, Math.max(0, w * f - 2), h - 2); }
    skBarC(x, y, n, w, h, gap, on === Q.accent ? Q.accent : Q.fg, 0, cut);           // lit squares in ink, the others in light pencil
    skBarC(x, y, n, w, h, gap, '#aaa597', cut, n * (w + gap) + 5);
  },
  bubble(x, y, w, h, mine) {
    const tx = mine ? x + w - 30 : x + 30, d = mine ? 1 : -1, sd = Math.round(x + y);
    X.fillStyle = mine ? 'rgba(255,240,150,0.55)' : '#fffdf6'; rr(x, y, w, h, 16); X.fill();
    const pts = []; for (const [ax, ay, a0] of [[x + w - 16, y + 16, -Math.PI / 2], [x + w - 16, y + h - 16, 0], [x + 16, y + h - 16, Math.PI / 2], [x + 16, y + 16, Math.PI]]) for (let i = 0; i <= 4; i++) { const an = a0 + i / 4 * Math.PI / 2; pts.push(ax + Math.cos(an) * 16, ay + Math.sin(an) * 16); }
    pencil(pts, true, 0.9, sd, 1.8); pencil([tx - 10, y + h, tx + d * 22, y + h + 14, tx + 8, y + h], false, 0.8, sd + 1, 1.8);
  },
  bulb(cx, cy, on, i) {
    if (on) { X.fillStyle = HL; ell(cx, cy - 4, 13, 13); X.fill(); for (let k = 0; k < 8; k++) { const an = k / 8 * TAU; skLine(cx + Math.cos(an) * 18, cy - 4 + Math.sin(an) * 18, cx + Math.cos(an) * 25, cy - 4 + Math.sin(an) * 25, i * 9 + k, 1.4); } }
    pencil(ellPts(cx, cy - 4, 13, 13, 16), false, 0.6, i * 3 + 1, 1.8, on ? Q.fg : '#9d998f');
    skRect(cx - 6, cy + 9, 12, 8, i * 5, 1.4, on ? Q.fg : '#9d998f');
  },
  weather(kind, cx, cy, size, active) {
    const mini = size === 'mini', k = mini ? 0.22 : 1, t = H.now, sd = mini ? 2 : boil();
    X.save(); X.globalAlpha = mini && !active ? 0.5 : 1;
    if (kind === 'soleil') qSun(cx, cy - 10 * k, k, mini);
    else {
      if (kind === 'nuage') qSun(cx + 42 * k, cy - 42 * k, 0.55 * k, mini);
      qCloud(cx + (mini ? 0 : Math.sin(t / 1600) * 8), cy - 10 * k, k, mini, kind === 'orage');
      if (kind === 'pluie' || kind === 'orage') for (let i = 0; i < (mini ? 3 : 8); i++) { const p = mini ? 0.35 : (t / 800 + i * 0.29) % 1, x = cx - 56 * k + (i * 37 % 120) * k, y = cy + 44 * k + p * 70 * k; skLine(x, y, x - 6 * k, y + 18 * k, sd + i, mini ? 1.2 : 2.2, '#3f6fa8', 0.6); }
      if (kind === 'neige') for (let i = 0; i < (mini ? 3 : 10); i++) { const p = mini ? 0.35 : (t / 2600 + i * 0.21) % 1, x = cx - 56 * k + (i * 41 % 120) * k + Math.sin(t / 600 + i) * 6 * k, y = cy + 48 * k + p * 70 * k, r = 6 * k; for (let j = 0; j < 3; j++) { const an = j * Math.PI / 3; skLine(x - Math.cos(an) * r, y - Math.sin(an) * r, x + Math.cos(an) * r, y + Math.sin(an) * r, sd + i * 3 + j, mini ? 1 : 1.6, Q.fg, 0.4); } }
      if (kind === 'orage' && (mini || Math.floor(t / 150) % 10 < 3)) { const b = [cx + 6 * k, cy + 22 * k, cx - 14 * k, cy + 60 * k, cx + 2 * k, cy + 58 * k, cx - 10 * k, cy + 96 * k, cx + 18 * k, cy + 50 * k, cx + 2 * k, cy + 52 * k]; X.beginPath(); for (let i = 0; i < b.length; i += 2) i ? X.lineTo(b[i], b[i + 1]) : X.moveTo(b[i], b[i + 1]); X.closePath(); X.fillStyle = HL; X.fill(); pencil(b, true, mini ? 0.3 : 1, sd, mini ? 1.2 : 2.4, Q.accent); }
    }
    X.restore();
  },
  digits(str, cx, y, col) {
    X.save(); X.font = '700 168px Caveat, "Comic Neue", cursive'; X.textAlign = 'center'; X.textBaseline = 'top'; const w = X.measureText(str).width;
    X.fillStyle = HL; X.beginPath(); X.moveTo(cx - w / 2 - 10, y + 72); X.lineTo(cx + w / 2 + 12, y + 62); X.lineTo(cx + w / 2 + 8, y + 112); X.lineTo(cx - w / 2 - 6, y + 118); X.closePath(); X.fill();
    X.fillStyle = col === Q.accent ? Q.accent : Q.hi; X.fillText(str, cx, y - 26); X.restore();
  },
  star(x, y, sz, near) { X.fillStyle = near ? Q.fg : '#a8a397'; X.fillRect(x - sz / 2, y - 0.6, sz, 1.2); X.fillRect(x - 0.6, y - sz / 2, 1.2, sz); },
  rule(x, y, w, h) { skLine(x + w / 2, y, x + w / 2, y + h, 23, 1.4, '#9d998f', 0.8); },
  bubbleInk: () => Q.hi,
  face: croquisFace,
  boot(e, info) {                     // a pencil draws Pixel, then writes his name
    const p = clamp((e - 200) / 1700, 0, 1), px = 120 + 560 * p;
    X.save(); X.beginPath(); X.rect(0, 0, px, HT); X.clip(); info.face(400, 196, 9, e < 2300 ? 'endormi' : 'content'); X.restore();
    const q = clamp((e - 1900) / 900, 0, 1);
    X.save(); X.font = croquis.font(84, 'title'); X.textAlign = 'center'; X.textBaseline = 'top'; const tw = X.measureText('Pixel').width;
    X.beginPath(); X.rect(400 - tw / 2 - 10, 300, (tw + 20) * q, 110); X.clip(); H.txt('Pixel', 400, 306, 84, Q.hi, 'center', 'title'); X.restore();
    if (e > 2800) { X.globalAlpha = clamp((e - 2800) / 400, 0, 1); H.txt('Bonjour !', 400, 410, 30, Q.dim, 'center'); X.globalAlpha = 1; }
    const tx = p < 1 ? px : 400 - tw / 2 + (tw + 20) * q, ty = p < 1 ? 190 + Math.sin(e / 60) * 26 : 350 + Math.sin(e / 50) * 14;
    if (q < 1) { X.save(); X.translate(tx, ty); X.rotate(0.6); X.fillStyle = '#f2c14e'; X.fillRect(-5, -60, 10, 48); X.fillStyle = '#ec87a3'; X.fillRect(-5, -70, 10, 10); X.fillStyle = '#e9d3a8'; X.beginPath(); X.moveTo(-5, -12); X.lineTo(5, -12); X.lineTo(0, 0); X.closePath(); X.fill(); X.fillStyle = Q.fg; X.beginPath(); X.moveTo(-1.6, -4); X.lineTo(1.6, -4); X.lineTo(0, 0); X.closePath(); X.fill(); X.restore(); }
  },
};

/* =================== LCD =================== */
/* A pocket console screen: four shades of green, a dot-matrix grid, pixels that cast a soft shadow on the glass,
   and Pixel as a little pixel creature with an antenna. */
const S0 = '#c5d08b', S1 = '#94a45c', S2 = '#526637', S3 = '#202c18';
const LC = { fg: S3, dim: S2, faint: S1, bg: S0, accent: S3, pink: S2, hi: S3 };
const LK = { '#': S3, w: S0, p: S2, a: S3, d: S2, f: S1 };
function lpx(x, y, s, c) {          // one LCD pixel and its shadow (a cached sprite per shade and size)
  const spr = cached('lpx' + c + s, s + 3, s + 3, g => { g.fillStyle = 'rgba(32,44,24,0.2)'; g.fillRect(2.5, 2.5, s - 1, s - 1); g.fillStyle = c; g.fillRect(0.5, 0.5, s - 1, s - 1); });
  X.drawImage(spr, x, y, s + 3, s + 3);
}
const lput = (x, y, s, k) => lpx(Math.round(x), Math.round(y), s, LK[k] || S3);
function lbmp(rows, x, y, s, c) { for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) { const v = rows[j][i]; if (v !== '.' && v !== ' ') lpx(Math.round(x + i * s), Math.round(y + j * s), s, v === '#' ? c : LK[v] || c); } }
const LL = { ex: 8.5, ey: 5, my: 2.5, ch: 12, cy: 1.2, fx: 1.3 };
function lcdHead(s, q) {            // the creature's head: a rounded block outline, shaded at the bottom right, with an antenna
  const hw = 32 + 2 * q, hh = 20 - 2 * q, pad = 2;
  return cached('lhead' + s + '_' + q, (hw + pad * 2) * s, (hh + pad * 2 + 4) * s, g => {
    const inside = (i, j) => { const r = 5, cx = clamp(i, r, hw - 1 - r), cy = clamp(j, r, hh - 1 - r); return i >= 0 && j >= 0 && i < hw && j < hh && (i - cx) ** 2 + (j - cy) ** 2 <= r * r + 1; };
    const dot = (i, j, c) => { const x = (i + pad) * s, y = (j + pad + 4) * s; g.fillStyle = 'rgba(32,44,24,0.2)'; g.fillRect(x + 2.5, y + 2.5, s - 1, s - 1); g.fillStyle = c; g.fillRect(x + 0.5, y + 0.5, s - 1, s - 1); };
    for (let j = 0; j < hh; j++) for (let i = 0; i < hw; i++) {
      if (!inside(i, j)) continue;
      const edge = !inside(i - 1, j) || !inside(i + 1, j) || !inside(i, j - 1) || !inside(i, j + 1);
      const shade = !edge && (!inside(i + 2, j) || !inside(i, j + 2)) && (i > hw / 2 || j > hh / 2);
      if (edge) dot(i, j, S3); else if (shade) dot(i, j, S1);
    }
    const ax = Math.floor(hw / 2); for (let j = -3; j < 0; j++) dot(ax, j, S3);
  });
}
function lcdFace(cx, cy, u, md, lx = 0, ly = 0, a) {
  a = life(a, md, lx, ly);
  const s = Math.max(2, Math.round(u * 0.62)), q = clamp(Math.round(a.sq * 3), -2, 2), lift = Math.round(a.hop * 1.2) * s, t = H.now;
  const tilt = Math.round(a.tilt * 6) * s, bob = (md === 'content' || md === 'excite' ? Math.round(Math.abs(Math.sin(t / 240)) * 0.8) : 0) * s;
  const head = lcdHead(s, q), hw = 32 + 2 * q, hh = 20 - 2 * q, hx = Math.round(cx - (hw / 2 + 2) * s) + tilt, hy = Math.round(cy - (hh / 2 + 6) * s) - lift - bob;
  X.drawImage(head, hx, hy, head.width / SC(), head.height / SC());
  const on = Math.floor(t / 600) % 2 || a.mood === 'excite' || a.mood === 'surpris';     // the antenna light blinks
  const bx = hx + (2 + Math.floor(hw / 2)) * s - s / 2, by = hy + s;
  lpx(bx, by, s * 2, on ? S3 : S2);
  pixMorph(Math.round(cx) + tilt, Math.round(cy - s) - lift, s, a, lput, S3, LL);
}
function lcdSun(cx, cy, u) {
  for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) { const d = i * i + j * j; if (d <= 18) lpx(cx + i * u, cy + j * u, u, d >= 12 ? S3 : (i + j) % 2 ? S1 : S2); }
  for (let k = 0; k < 8; k++) { const an = k / 8 * TAU + Math.floor(H.now / 400) * TAU / 32; for (let r = 0; r < (k % 2 ? 2 : 3); r++) lpx(cx + Math.round(Math.cos(an) * (6 + r)) * u, cy + Math.round(Math.sin(an) * (6 + r)) * u, u, S3); }
}
const lcd = {
  id: 'lcd', name: 'LCD', c: LC, glow: 0, bubbles: true, qr: ['#e4ecbd', S3], upper: true, gridA: 1, sleepA: 1, onFg: S0, fonts: ['500 30px "Pixelify Sans"', '700 30px "Pixelify Sans"'],
  font: (s, k) => k === 'title' ? `700 ${Math.round(s * 0.84)}px "Pixelify Sans", monospace` : `500 ${Math.round(s * 0.8)}px "Pixelify Sans", monospace`,
  bg() { X.fillStyle = S0; X.fillRect(0, 0, W, HT); },
  fg() {                               // the dot-matrix grid and the recessed glass, over everything
    X.drawImage(cached('lcd-glass', W, HT, g => {
      g.fillStyle = 'rgba(82,102,55,0.09)'; for (let x = 0; x < W; x += 4) g.fillRect(x, 0, 1, HT); for (let y = 0; y < HT; y += 4) g.fillRect(0, y, W, 1);
      const v = g.createRadialGradient(W / 2, HT / 2, HT * 0.4, W / 2, HT / 2, W * 0.6); v.addColorStop(0, 'rgba(32,44,24,0)'); v.addColorStop(1, 'rgba(32,44,24,0.16)'); g.fillStyle = v; g.fillRect(0, 0, W, HT);
      const r = g.createLinearGradient(0, 0, W, HT); r.addColorStop(0, 'rgba(255,255,230,0.12)'); r.addColorStop(0.35, 'rgba(255,255,230,0)'); g.fillStyle = r; g.fillRect(0, 0, W, HT);
    }), 0, 0, W, HT);
  },
  header(title, clock) {
    X.fillStyle = S3; X.fillRect(0, 0, W, 44); X.fillRect(4, 44, W - 8, 4);
    H.txt(title.toUpperCase(), 22, 6, 32, S0, 'left', 'title'); H.txt(clock, W - 22, 8, 30, S0, 'right');
    X.fillStyle = S0; X.fillRect(W - 134, 14, 30, 16); X.fillRect(W - 104, 18, 3, 8); X.fillStyle = S3; X.fillRect(W - 132, 16, 26, 12); X.fillStyle = S0; for (let i = 0; i < 3; i++) X.fillRect(W - 130 + i * 8, 18, 6, 8);
  },
  box(x, y, w, h, c = S3, fill) {
    const col = c === S2 ? S2 : c === S1 ? S1 : S3;
    if (fill === S0) { X.fillStyle = 'rgba(32,44,24,0.22)'; X.fillRect(x + 4, y + 4, w, h); X.fillStyle = S0; X.fillRect(x, y, w, h); }
    else if (fill === S1) { X.fillStyle = S1; X.fillRect(x + 2, y + 2, w - 4, h - 4); }
    else if (fill === S3) { X.fillStyle = S3; X.fillRect(x + 2, y + 2, w - 4, h - 4); }
    else if (fill) { X.fillStyle = fill; X.fillRect(x + 2, y + 2, w - 4, h - 4); }
    X.fillStyle = col; X.fillRect(x + 4, y, w - 8, 3); X.fillRect(x + 4, y + h - 3, w - 8, 3); X.fillRect(x, y + 4, 3, h - 8); X.fillRect(x + w - 3, y + 4, 3, h - 8);
    X.fillRect(x + 2, y + 2, 3, 3); X.fillRect(x + w - 5, y + 2, 3, 3); X.fillRect(x + 2, y + h - 5, 3, 3); X.fillRect(x + w - 5, y + h - 5, 3, 3);
  },
  bar(x, y, n, filled, w, h, gap, on = S3, off = S1) {
    const c = on === S2 ? S2 : S3;
    for (let i = 0; i < n; i++) {
      const f = clamp(filled - i, 0, 1), xx = Math.round(x + i * (w + gap));
      X.fillStyle = 'rgba(32,44,24,0.16)'; X.fillRect(xx + 2, y + 2, w, h); X.fillStyle = S1; X.fillRect(xx, y, w, h);
      if (f > 0) { X.fillStyle = c; X.fillRect(xx, y, Math.round(w * f), h); }
    }
  },
  bubble(x, y, w, h, mine) {
    X.fillStyle = 'rgba(32,44,24,0.18)'; X.fillRect(x + 4, y + 4, w, h);
    lcd.box(x, y, w, h, S3, mine ? S1 : S0);
    const tx = mine ? x + w - 34 : x + 22; X.fillStyle = S3; for (let i = 0; i < 4; i++) X.fillRect(tx + (mine ? i * 4 : -i * 4), y + h + i * 4 - 2, 12 - i * 2, 4);
  },
  bubbleInk: () => S3,
  bulb(cx, cy, on, i) {
    lbmp(BULB, cx - 18, cy - 20, 7, on ? S3 : S1);
    if (on && Math.floor(H.now / 400 + i) % 2) for (const [dx, dy] of [[-26, -18], [20, -18], [-30, 0], [24, 0]]) lpx(cx + dx, cy + dy - 4, 6, S2);
  },
  weather(kind, cx, cy, size, active) {
    if (size === 'mini') return lbmp(MINI[kind] || MINI.nuage, cx - 15, cy - 15, 6, active ? S3 : S2);
    const dx = cx - 180, dy = cy - 200, now = H.now;
    if (kind === 'soleil') return lcdSun(cx, cy - 10, 12);
    if (kind === 'nuage') lcdSun(230 + dx, 150 + dy, 8);
    lbmp(CLOUD, 70 + dx + Math.round(Math.sin(now / 1400) * 2) * 9, 150 + dy, 22, kind === 'orage' ? S3 : S2);
    if (kind === 'pluie' || kind === 'orage') for (let k = 0; k < 12; k++) { const p = Math.floor(((now / 700 + k * 0.137) % 1) * 8) / 8, x = 84 + dx + (k * 47) % 200; lpx(x, 270 + dy + p * 70, 8, S3); lpx(x, 278 + dy + p * 70, 8, S3); }
    if (kind === 'neige') for (let k = 0; k < 12; k++) { const p = Math.floor(((now / 2600 + k * 0.17) % 1) * 10) / 10, x = 84 + dx + (k * 53) % 200 + Math.round(Math.sin(now / 500 + k)) * 6; lbmp(['.#.', '#.#', '.#.'], x, 266 + dy + p * 74, 4, S2); }
    if (kind === 'orage' && Math.floor(now / 160) % 9 < 2) lbmp(['..##', '.##.', '####', '.##.', '##..'], 160 + dx, 262 + dy, 10, S3);
  },
  digits(str, cx, y, col) {
    const u = 20; let w = -u; for (const ch of str) w += DIG[ch][0].length * u + u;
    let x = cx - w / 2; for (const ch of str) { lbmp(DIG[ch], x, y, u, col === S3 ? S3 : S2); x += DIG[ch][0].length * u + u; }
  },
  star(x, y, sz, near) { X.fillStyle = near ? S3 : S2; X.fillRect(Math.round(x / 4) * 4, Math.round(y / 4) * 4, sz < 3 ? 2 : 4, sz < 3 ? 2 : 4); },
  rule(x, y, w, h) { X.fillStyle = S2; for (let yy = y; yy < y + h; yy += 8) X.fillRect(x, yy, w, 4); },
  face: lcdFace,
  boot(e, info) {                      // the logo slides down, a sparkle, then the creature wakes up
    const ly = Math.min(96, Math.round((-90 + e * 0.17) / 6) * 6);
    X.save(); X.font = '700 88px "Pixelify Sans", monospace'; X.textAlign = 'center'; X.textBaseline = 'top';
    X.fillStyle = 'rgba(32,44,24,0.2)'; X.fillText('PIXEL', 405, ly + 5); X.fillStyle = S3; X.fillText('PIXEL', 400, ly); X.restore();
    if (e > 1150 && e < 1900 && Math.floor(e / 120) % 2) lbmp(['..#..', '..#..', '##.##', '..#..', '..#..'], 588, 96, 5, S3);
    if (e > 1300) H.txt('PIXEL OS 2.0', 400, 196, 26, S2, 'center');
    if (e > 1700) info.face(400, 330, 7, e < 2400 ? 'endormi' : 'content');
  },
};

return { retro, moderne, manga, neon, croquis, lcd };
};
