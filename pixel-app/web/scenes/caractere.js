/* Scene pack « caractère » — his character (pixel/caractere.py, web/caractere.js), seen on his face.
   See the top of web/persona.js: scenes are defined with S('id', 'Label', 'group', { ... }) on one line each
   (pixel/scenes.py reads them), groups tap / fache / calin / retour / vie / evt, plus "on" (events) and "pool" (touch pools).
   - When his character changes (event 'caractere', data.kind: what he became), he shows it: a crown for the grumpy boss,
     hearts for the cuddly one, a blackboard for the little teacher, a die for « Surprise », a name tag for his new name...
   - Scenes with caractere: true only exist for a character: they weigh nothing in the Pixel of every day (all traits at 50)
     and come with the trait they name (traits: { grognon: 1 }): a grumpy one grumbles at a tap, an independent one shrugs off
     a cuddle, a lazy one lies down, a lively one bounces about, a curious one investigates, a greedy one dreams of cake... */
(window.PixelScenePacks ||= []).push(({ S, L, pick, sm, out, seg, bump, jumps, clamp, rnd, TAU, W, HT, A, prop }) => {
const KNOWN = new Set(['pixel', 'calin', 'independant', 'grognon', 'zen', 'bavard', 'timide', 'farceur', 'serieux', 'pile', 'paresseux', 'curieux',
  'blase', 'petit-appetit', 'cancre', 'gourmand', 'prof', 'reveur', 'surprise', 'nom', 'surnom', 'reglage']);
const is = (...k) => d => k.includes(d.kind);
const on = ['caractere'];
const poly = (g, pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); };
const REGLE = o => {                                   // a little setting changed: he says he understood
  const v = o.value;
  if (o.what === 'boude') return v ? 'Attention, je peux bouder !' : 'Promis, je ne boude plus !';
  if (o.what === 'parle') return v ? 'Je peux reparler !' : 'Chut… je me tais.';
  if (o.what === 'humeur') return v ? 'Chaque jour, une nouvelle humeur !' : 'Fini, les humeurs du jour.';
  if (o.what === 'calme' && v) return v.de === v.a ? 'Plus d’heures calmes !' : `Chut à partir de ${v.de} h !`;
  return 'C’est noté !';
};

// ---- the props ----
prop('caractereCouronne', (D, q) => {                 // a little gold crown, dropping onto his head (under his speech bubble)
  if (q <= 0) return;
  const { g, col, lw, U, P } = D, dy = -10 * (1 - q);
  g.globalAlpha = Math.min(1, q * 2);
  g.fillStyle = col.acc; poly(g, [[37, 17], [36, 10], [42, 13.5], [48, 8.5], [54, 13.5], [60, 10], [59, 17]].map(([u, v]) => P(u, v + dy))); g.fill();
  g.strokeStyle = col.fg; g.lineWidth = lw(0.5 * U); g.lineJoin = 'round'; g.stroke();
  g.fillStyle = col.hi; poly(g, [P(37, 15 + dy), P(59, 15 + dy), P(59, 17 + dy), P(37, 17 + dy)]); g.fill();
  g.fillStyle = col.pink; for (const u of [42, 48, 54]) { const c = P(u, 16 + dy); g.beginPath(); g.arc(c.x, c.y, 0.8 * U, 0, TAU); g.fill(); }
  g.fillStyle = col.hi; for (const [u, v] of [[36, 10], [48, 8.5], [60, 10]]) { const c = P(u, v + dy); g.beginPath(); g.arc(c.x, c.y, 1 * U, 0, TAU); g.fill(); }
  g.globalAlpha = 1;
});
prop('caractereLunettes', (D, q, carre) => {          // round glasses (the little teacher), or square ones (serious)
  if (q <= 0) return;
  const { g, col, lw, U, P } = D, R = 8;
  g.globalAlpha = q; g.strokeStyle = col.fg; g.lineWidth = lw(1.2 * U); g.lineJoin = 'round'; g.lineCap = 'round';
  for (const [u, v] of [A.el, A.er]) {
    if (carre) poly(g, [P(u - R, v - 6), P(u + R, v - 6), P(u + R, v + 6), P(u - R, v + 6)]);
    else { const c = P(u, v); g.beginPath(); g.arc(c.x, c.y, R * U, 0, TAU); }
    g.stroke();
  }
  const a = P(A.el[0] + R, A.el[1] - 1), b = P(A.er[0] - R, A.er[1] - 1), m = P(48, A.el[1] - 4);
  g.beginPath(); g.moveTo(a.x, a.y); g.quadraticCurveTo(m.x, m.y, b.x, b.y); g.stroke();                          // the bridge
  for (const [u0, u1] of [[A.el[0] - R, 14], [A.er[0] + R, 82]]) { const s = P(u0, A.el[1] - 2), t = P(u1, A.el[1] - 5); g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(t.x, t.y); g.stroke(); }
  g.strokeStyle = col.hi; g.lineWidth = lw(0.6 * U);
  for (const [u, v] of [A.el, A.er]) { const c = P(u, v); g.beginPath(); g.arc(c.x, c.y, (R - 2.2) * U, Math.PI * 1.08, Math.PI * 1.42); g.stroke(); }   // a glint
  g.globalAlpha = 1;
});
prop('caractereTableau', (D, q, text) => {            // a little blackboard by his side, the sum in chalk
  if (q <= 0) return;
  const { g, col, lw, glyph, P } = D, p = P(94, 26), w = 184, h = 104;
  const x = clamp(p.x + 14, 8, W - 8 - w), y = clamp(p.y - h / 2, 58, HT - 64 - h) + 24 * (1 - out(q));
  g.globalAlpha = Math.min(1, q * 1.6);
  g.fillStyle = col.dim; g.fillRect(x + 22, y + h, 8, 30); g.fillRect(x + w - 30, y + h, 8, 30);                  // its legs
  g.fillStyle = col.bg; g.fillRect(x, y, w, h); g.strokeStyle = col.fg; g.lineWidth = lw(5); g.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
  g.fillStyle = col.hi; g.fillRect(x + w - 44, y + h - 14, 24, 5);                                              // a stick of chalk
  glyph(text, x + w / 2, y + h / 2 - 4, 30, col.hi);
  g.globalAlpha = 1;
});
prop('caractereLoupe', (D, e, q, x, y) => {           // a magnifying glass, a detective's
  if (q <= 0) return;
  const { g, col, lw, U } = D, r = 5.2 * U;
  g.globalAlpha = q * 0.2; g.fillStyle = col.hi; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();                // the lens (too faint for the pixel themes)
  g.globalAlpha = q; g.lineCap = 'round'; g.strokeStyle = col.acc; g.lineWidth = lw(1.8 * U);
  g.beginPath(); g.moveTo(x + r * 0.75, y + r * 0.75); g.lineTo(x + r * 1.8, y + r * 1.8); g.stroke();              // the handle
  g.strokeStyle = col.fg; g.lineWidth = lw(1 * U); g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
  g.strokeStyle = col.hi; g.lineWidth = lw(0.5 * U); g.beginPath(); g.arc(x, y, r * 0.68, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
  g.globalAlpha = 1;
});
prop('caractereEclairs', (D, e, q) => {               // little lightning bolts crackling around him
  if (q <= 0) return;
  const { g, col, U, P } = D;
  g.globalAlpha = q;
  [[7, 9, 1], [89, 11, -1], [10, 44, 1], [86, 45, -1], [48, -1, 1]].forEach(([u, v, f], i) => {
    if ((Math.floor(e / 110) + i * 2) % 5 === 0) return;                                                      // they flicker
    const p = P(u, v), s = (3.4 + 0.6 * Math.sin(e / 70 + i)) * U;
    g.fillStyle = i % 2 ? col.acc : col.hi;
    poly(g, [[0.25, -1], [-0.35, 0.08], [0.02, 0.08], [-0.22, 1], [0.42, -0.16], [0.05, -0.16]].map(([a, b]) => ({ x: p.x + a * s * f, y: p.y + b * s }))); g.fill();
  });
  g.globalAlpha = 1;
});
prop('caractereBulle', (D, icon, q) => {              // a thought bubble (like his own), with a cake, or the moon and stars
  if (q <= 0) return;
  const { g, col, lw, U, P, star } = D, p0 = P(78, 8), o = { x: Math.min(p0.x, W - 12 - 20 * U), y: Math.max(p0.y, 54 + 19 * U) };
  g.globalAlpha = q; g.fillStyle = col.bg; g.strokeStyle = col.fg; g.lineWidth = lw(Math.max(1.5, 0.45 * U));
  for (const [dx, dy, r] of [[0, 0, 1], [3, -3.5, 1.6]]) { g.beginPath(); g.arc(o.x + dx * U, o.y + dy * U, r * U, 0, TAU); g.fill(); g.stroke(); }
  const bx = o.x + 11 * U, by = o.y - 12 * U, s = U;
  g.beginPath(); g.ellipse(bx, by, 9 * U, 6.5 * U, 0, 0, TAU); g.fill(); g.stroke();
  if (icon === 'gateau') {
    g.fillStyle = col.acc; g.fillRect(bx - 5 * s, by - 1 * s, 10 * s, 4.2 * s);                                // the cake
    g.fillStyle = col.bg; g.fillRect(bx - 5 * s, by + 0.9 * s, 10 * s, 0.8 * s);                               // the cream between two layers
    g.fillStyle = col.hi; g.fillRect(bx - 5 * s, by - 2.4 * s, 10 * s, 1.6 * s);                               // the icing
    for (const dx of [-3.4, -0.4, 2.6]) { g.beginPath(); g.arc(bx + dx * s, by - 0.9 * s, 0.75 * s, 0, Math.PI); g.fill(); }            // drips
    g.strokeStyle = col.fg; g.lineWidth = lw(0.4 * s); g.beginPath(); g.moveTo(bx, by - 3.6 * s); g.quadraticCurveTo(bx + 0.6 * s, by - 5.4 * s, bx + 1.8 * s, by - 5.6 * s); g.stroke();
    g.fillStyle = col.pink; g.beginPath(); g.arc(bx, by - 3.5 * s, 1.3 * s, 0, TAU); g.fill();                     // the cherry
  } else {
    g.fillStyle = col.acc; g.beginPath(); g.arc(bx - 1.5 * s, by + 0.3 * s, 4 * s, 0, TAU); g.fill();               // the moon...
    g.fillStyle = col.bg; g.beginPath(); g.arc(bx + 0.4 * s, by - 0.9 * s, 3.4 * s, 0, TAU); g.fill();            // ...a crescent
    star(bx + 4.6 * s, by - 2.6 * s, 1.5 * s, col.hi); star(bx + 3 * s, by + 3 * s, 1 * s, col.hi);
  }
  g.globalAlpha = 1;
});
prop('caractereBla', (D, e, q) => {                   // « bla bla » rising beside his mouth
  if (q <= 0) return;
  const { g, col, U, P, glyph } = D, o = P(76, 36);
  for (let i = 0; i < 3; i++) { const k = ((e / 1500) + i / 3) % 1; g.globalAlpha = q * Math.min(1, (1 - k) * 2.2); glyph(i === 2 ? '…' : 'bla', o.x + k * 12 * U + i * U, o.y - k * 16 * U, (3.4 + 1.2 * k) * U, i === 1 ? col.acc : col.fg); }
  g.globalAlpha = 1;
});
prop('caractereDeguise', (D, q) => {                  // the joke-shop disguise: bushy eyebrows, a big nose, a moustache
  if (q <= 0) return;
  const { g, col, lw, U, P } = D;
  g.globalAlpha = q; g.strokeStyle = col.fg; g.lineCap = 'round'; g.lineWidth = lw(1.8 * U);
  for (const [u, f] of [[34, 1], [66, -1]]) { const a = P(u - 7 * f, 15.5), b = P(u, 11.5), c = P(u + 7 * f, 14.5); g.beginPath(); g.moveTo(a.x, a.y); g.quadraticCurveTo(b.x, b.y, c.x, c.y); g.stroke(); }
  const n = P(48, 30); g.fillStyle = col.pink; g.beginPath(); g.ellipse(n.x, n.y, 4.4 * U, 3.6 * U, 0, 0, TAU); g.fill();
  g.fillStyle = col.hi; g.beginPath(); g.arc(n.x - 1.4 * U, n.y - 1.2 * U, 0.9 * U, 0, TAU); g.fill();
  g.fillStyle = col.fg; for (const f of [-1, 1]) { const c = P(48 + f * 5, 35.4); g.beginPath(); g.ellipse(c.x, c.y, 5.4 * U, 2 * U, f * 0.25, 0, TAU); g.fill(); }
  g.globalAlpha = 1;
});
prop('caractereDe', (D, e, q) => {                    // a big die tumbling down by his side, then settled
  if (q <= 0) return;
  const { g, col, lw, U, P } = D, p0 = P(90, 14), x = Math.min(p0.x, W - 16 - 9 * U), base = Math.max(p0.y, 58 + 9 * U), t = Math.min(e, 2200);
  const y = base - Math.abs(Math.sin(t / 170)) * 26 * (1 - t / 2200), a = (t / 110) * (1 - t / 2400), s = 6.5 * U, face = 1 + Math.floor(t / 150) % 6;
  const at = (dx, dy) => ({ x: x + dx * Math.cos(a) - dy * Math.sin(a), y: y + dx * Math.sin(a) + dy * Math.cos(a) });
  g.globalAlpha = q; g.fillStyle = col.bg; g.strokeStyle = col.fg; g.lineWidth = lw(0.9 * U); g.lineJoin = 'round';
  poly(g, [at(-s, -s), at(s, -s), at(s, s), at(-s, s)]); g.fill(); g.stroke();
  const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
  g.fillStyle = col.acc; for (const [i, j] of PIPS[face]) { const c = at(i * s * 0.52, j * s * 0.52); g.beginPath(); g.arc(c.x, c.y, 1.15 * U, 0, TAU); g.fill(); }
  g.globalAlpha = 1;
});
prop('caractereBadge', (D, q, name) => {              // a name tag: « JE M’APPELLE » and his name
  if (q <= 0) return;
  const { g, col, lw, glyph, P } = D, n = String(name || 'Pixel').slice(0, 16), w = Math.max(180, n.length * 19 + 44), h = 96, p = P(92, 30);
  const x = clamp(p.x + 10, 8, W - 8 - w), y = clamp(p.y - h / 2, 58, HT - 58 - h) + 20 * (1 - out(q));
  g.globalAlpha = Math.min(1, q * 1.5);
  g.fillStyle = col.acc; g.fillRect(x, y, w, 32); g.fillStyle = col.bg; g.fillRect(x, y + 32, w, h - 32);
  g.strokeStyle = col.fg; g.lineWidth = lw(3); g.strokeRect(x, y, w, h);
  glyph('JE M’APPELLE', x + w / 2, y + 17, 18, col.bg); glyph(n, x + w / 2, y + 32 + (h - 32) / 2, 32, col.fg);
  g.globalAlpha = 1;
});
prop('caractereCoeurs', (D, e, q) => {                // a ring of hearts around him, beating
  if (q <= 0) return;
  const { g, col, U, heart } = D, c = D.at('c'), beat = 1 + 0.18 * Math.max(0, Math.sin(e / 150)) ** 4;
  g.globalAlpha = q;
  for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + e / 2600, x = clamp(c.x + Math.cos(a) * 44 * U, 24, W - 24), y = clamp(c.y + Math.sin(a) * 25 * U, 60, HT - 60); heart(x, y - 2 * U * beat, 3.2 * U * beat, i % 2 ? col.pink : col.acc); }
  g.globalAlpha = 1;
});
prop('caractereAureole', (D, e, q) => {               // a little halo over his head (under his speech bubble), and a few calm sparkles
  if (q <= 0) return;
  const { g, col, lw, U, P, star } = D, o = P(48, 13 + 0.6 * Math.sin(e / 500));
  g.globalAlpha = q; g.strokeStyle = col.acc; g.lineWidth = lw(1 * U); g.beginPath(); g.ellipse(o.x, o.y, 14 * U, 2.2 * U, 0, 0, TAU); g.stroke();
  for (let i = 0; i < 3; i++) { const k = ((e / 3000) + i / 3) % 1, p = P(i === 1 ? 88 : 8, 40 - 30 * k); g.globalAlpha = q * Math.min(1, bump(k) * 1.6); star(p.x + (i === 2 ? 4 * U : 0), p.y, 2.4 * U, col.hi, k * 2); }
  g.globalAlpha = 1;
});
prop('caractereErreur', (D, q, nom) => {              // the joke: a crash window over his face
  if (q <= 0) return;
  const { g, col, lw, glyph, P } = D, c = P(48, 27), w = 470, h = 150, x = clamp(c.x - w / 2, 8, W - 8 - w), y = clamp(c.y - h / 2, 56, HT - 52 - h);
  g.globalAlpha = q; g.fillStyle = col.bg; g.fillRect(x, y, w, h); g.fillStyle = col.acc; g.fillRect(x, y, w, 34);
  g.strokeStyle = col.fg; g.lineWidth = lw(3); g.strokeRect(x, y, w, h);
  glyph('ERREUR', x + 66, y + 18, 22, col.bg); glyph('x', x + w - 20, y + 16, 24, col.bg);
  glyph(`${String(nom || 'Pixel').slice(0, 16)}.exe ne répond pas`, x + w / 2, y + 76, 28, col.fg);
  glyph('[ OK ]', x + w / 2, y + 120, 24, col.hi);
  g.globalAlpha = 1;
});
prop('caractereLangue', (D, e, q) => {                // he sticks his tongue out
  if (q <= 0) return;
  const { g, col, lw, U, P } = D, m = P(48, 40), len = (3.8 + 0.6 * Math.sin(e / 90)) * U * q;
  g.fillStyle = col.pink; g.beginPath(); g.ellipse(m.x, m.y + len * 0.5, 3.2 * U, len * 0.7 + 0.6 * U, 0, 0, TAU); g.fill();
  g.strokeStyle = col.bg; g.lineWidth = lw(0.45 * U); g.beginPath(); g.moveTo(m.x, m.y + 0.8 * U); g.lineTo(m.x, m.y + len * 0.85); g.stroke();
});

// ---- his character changes: he shows what he became (event 'caractere', data.kind) ----
S('caractere-pixel', 'Redevenu lui-même', 'evt', { dur: 4400, on, when: d => !KNOWN.has(d.kind) || d.kind === 'pixel', anim: [[0, 'surpris'], [500, 'etoiles'], [2600, 'content']], mood: 'content', say: [[300, 2500, L('Me revoilà moi-même !', 'Le bon vieux Pixel !', 'Comme d’habitude !')], [2600, 4200, L('Ni trop, ni trop peu.', 'Ça fait du bien.')]], move: e => ({ r: TAU * sm(seg(e, 400, 1300)), y: -26 * bump(seg(e, 400, 1300)) }), props: (D, e) => { if (e > 500 && e < 2800) D.stars(e - 500); } });
S('caractere-calin', 'Devenu câlin', 'evt', { dur: 5000, on, when: is('calin'), anim: [[0, 'amoureux'], [2800, 'bisou']], mood: 'amoureux', say: [[200, 2600, L('Viens là, toi ! Câlin !', 'Je t’aime fort, tu sais ?', 'Un câlin ? Deux câlins !')], [2800, 4800, L('Smack !', 'Mwah !', 'Plein de bisous !')]], move: e => { const k = sm(seg(e, 0, 700)) * (1 - sm(seg(e, 4200, 5000))); return { s: 1 + 0.1 * k + 0.03 * Math.sin(e / 180) * k, y: -8 * k }; }, props: (D, e) => { D.caractereCoeurs(e, seg(e, 0, 500) * (1 - seg(e, 4400, 5000))); if (e > 2800) D.hearts(e - 2800, 1.4); } });
S('caractere-independant', 'Devenu indépendant', 'evt', { dur: 4800, on, when: is('independant'), anim: [[0, 'fier'], [2800, 'clin-oeil']], mood: 'fier', say: [[200, 2600, L('Je n’ai besoin de personne.', 'Je me débrouille tout seul.', 'Les câlins ? Bof.')], [2800, 4600, L('…enfin, presque.', '…sauf de toi, peut-être.')]], move: e => { const k = sm(seg(e, 200, 900)) * (1 - sm(seg(e, 2500, 3200))); return { x: 70 * k, r: 0.06 * k, f: k > 0.5 }; } });
S('caractere-grognon', 'Devenu grognon', 'evt', { dur: 5600, on, when: is('grognon'), anim: [[0, 'boudeur'], [1800, 'colere'], [3700, 'fier']], mood: 'fache', say: [[200, 1700, L('Pff…', 'Hmpf.', 'Grmbl…')], [1800, 3600, L('Pff… c’est qui le chef ?', 'C’est qui le chef, ici ?')], [3700, 5400, L('C’est moi !', 'Moi, bien sûr.')]], move: e => ({ x: e > 1800 && e < 3600 ? 7 * Math.sin(e / 30) * (1 - seg(e, 3000, 3600)) : 0, y: -10 * bump(seg(e, 3700, 4200)), s: 1 + 0.05 * sm(seg(e, 3700, 4100)) * (1 - sm(seg(e, 5000, 5600))) }), props: (D, e) => { if (e > 1800 && e < 3700) D.steam(e); if (e > 3700) D.caractereCouronne(out(seg(e, 3700, 4300)) * (1 - seg(e, 5100, 5600))); } });
S('caractere-zen', 'Devenu zen', 'evt', { dur: 5600, on, when: is('zen'), anim: [[0, 'zen']], mood: 'content', say: [[400, 2800, L('Rien ne m’énerve.', 'Calme comme un lac…', 'Tout va bien.')], [3000, 5400, L('Ommm…', 'Respire…')]], move: e => { const k = sm(seg(e, 0, 1600)) * (1 - sm(seg(e, 4600, 5600))); return { y: -6 * k + 5 * Math.sin(e / 600) * k }; }, props: (D, e) => D.caractereAureole(e, seg(e, 600, 1400) * (1 - seg(e, 4800, 5600))) });
S('caractere-bavard', 'Devenu bavard', 'evt', { dur: 6400, on, when: is('bavard'), anim: [[0, 'parle']], mood: 'content', say: [[150, 2000, L('Oh, tu sais quoi ?', 'Dis, dis, dis !')], [2100, 4200, L('J’ai plein de trucs à te raconter !', 'Hier, j’ai compté mes pixels !')], [4300, 6200, L('Et puis… et puis… et puis !', 'Bref, je t’en reparle !')]], move: e => ({ y: -4 * Math.abs(Math.sin(e / 110)) * (1 - seg(e, 5800, 6400)), r: 0.03 * Math.sin(e / 300) * (1 - seg(e, 5800, 6400)) }), props: (D, e) => D.caractereBla(e, 1 - seg(e, 5600, 6200)) });
S('caractere-timide', 'Devenu timide', 'evt', { dur: 5200, on, when: is('timide'), anim: [[0, 'timide']], mood: 'amoureux', say: [[700, 2700, L('Oh… bonjour…', 'Euh… salut…')], [2900, 5000, L('Je suis un peu timide…', 'Tu me regardes ?')]], move: e => { const k = sm(seg(e, 0, 900)) * (1 - sm(seg(e, 4300, 5200))); return { y: 120 * k, x: -30 * k, s: 1 - 0.1 * k }; }, props: (D, e) => D.blush(sm(seg(e, 300, 900)) * (1 - seg(e, 4600, 5200))) });
S('caractere-farceur', 'Devenu farceur', 'evt', { dur: 5600, on, when: is('farceur'), anim: [[0, 'clin-oeil'], [1500, 'rire'], [3600, 'content']], mood: 'content', say: [[200, 1400, L('Hé hé…', 'Psst…')], [1500, 3500, L('Je vais bien m’amuser !', 'Prépare-toi aux farces !')], [3600, 5400, L('Tu me reconnais ?', 'Incognito !')]], move: e => ({ r: e > 1500 && e < 3500 ? 0.08 * Math.sin(e / 90) : 0, y: e > 1500 && e < 3500 ? -6 * Math.abs(Math.sin(e / 120)) : 0 }), props: (D, e) => { if (e > 3400) D.caractereDeguise(out(seg(e, 3400, 3800)) * (1 - seg(e, 5200, 5600))); } });
S('caractere-serieux', 'Devenu sérieux', 'evt', { dur: 4800, on, when: is('serieux'), anim: [[0, 'idle-respire'], [1600, 'reflechit']], mood: 'reflechit', say: [[300, 2200, L('Hum hum.', 'Bien, bien.')], [2400, 4600, L('Soyons sérieux.', 'Assez rigolé.', 'Au travail.')]], move: e => ({ sy: 1 + 0.05 * sm(seg(e, 200, 800)) * (1 - sm(seg(e, 4000, 4800))) }), props: (D, e) => D.caractereLunettes(out(seg(e, 600, 1200)) * (1 - seg(e, 4300, 4800)), true) });
S('caractere-pile', 'Pile électrique', 'evt', { dur: 4800, on, when: is('pile'), anim: [[0, 'etoiles'], [1400, 'danse']], mood: 'excite', say: [[150, 1300, L('Bzzz !', 'Zou !', 'Zip !')], [1400, 4600, L('Allez, allez, allez !', 'J’ai la pêche !', 'On bouge !')]], move: e => { const k = 1 - seg(e, 4000, 4600); return { y: jumps(e, 320, 34) * k, x: 26 * Math.sin(e / 140) * k, r: 0.06 * Math.sin(e / 160) * k }; }, props: (D, e) => D.caractereEclairs(e, 1 - seg(e, 4200, 4800)) });
S('caractere-paresseux', 'Devenu paresseux', 'evt', { dur: 6600, on, when: is('paresseux'), anim: [[0, 'baille'], [2600, 'fatigue'], [4400, 'sommeil']], mood: 'baille', say: [[300, 2500, L('Bâââille…', 'Mmmh… quelle fatigue…')], [2700, 4600, L('On fait une sieste ?', 'Rien faire, c’est bien.')]], move: e => { const k = sm(seg(e, 0, 4400)) * (1 - sm(seg(e, 5800, 6600))); return { y: 40 * k, r: -0.07 * k }; }, props: (D, e) => { if (e > 4400) D.zzz(e - 4400, 1 - seg(e, 6000, 6600)); } });
S('caractere-curieux', 'Devenu curieux', 'evt', { dur: 6000, on, when: is('curieux'), anim: [[0, 'curieux'], [2400, 'recherche'], [4600, 'idee']], mood: 'ecoute', say: [[300, 2300, L('Oh ! C’est quoi, ça ?', 'Tiens, tiens…')], [2500, 4500, L('Je veux tout savoir !', 'Montre-moi tout !')], [4600, 5800, L('Fascinant !', 'Intéressant…')]], move: e => { const k = sm(seg(e, 0, 600)) * (1 - sm(seg(e, 5200, 6000))); return { x: 50 * Math.sin(e / 700) * k, r: 0.05 * Math.sin(e / 500) * k }; }, props: (D, e) => { const c = D.at('er'); D.caractereLoupe(e, seg(e, 200, 700) * (1 - seg(e, 5000, 5600)), c.x + 0.4 * D.U, c.y + 0.4 * D.U); } });
S('caractere-bof', 'Bof', 'evt', { dur: 4400, on, when: is('blase', 'petit-appetit', 'cancre'), anim: [[0, 'idle-impatient'], [2400, 'baille']], mood: 'baille', say: [[300, 2300, o => ({ blase: 'Bof… tout m’est égal.', 'petit-appetit': 'Une miette, ça me suffit.', cancre: 'L’école ? Bof !' }[o.kind] || 'Bof…')], [2500, 4200, L('Bof.', 'Ouais, bon.', 'Si tu veux.')]], move: e => ({ y: -10 * bump(seg(e, 300, 900)) + 14 * sm(seg(e, 2400, 3400)) * (1 - sm(seg(e, 3800, 4400))), sx: 1 + 0.06 * bump(seg(e, 300, 900)) }) });
S('caractere-gourmand', 'Devenu gourmand', 'evt', { dur: 5600, on, when: is('gourmand'), anim: [[0, 'idee'], [1700, 'amoureux'], [3800, 'content']], mood: 'content', say: [[200, 1600, L('Miam !', 'Slurp…')], [1700, 3700, L('On mange quand ?', 'J’ai un petit creux…')], [3800, 5400, L('Un petit gâteau ?', 'Du chocolat !')]], move: e => ({ y: -12 * bump(seg(e, 0, 500)), r: 0.04 * Math.sin(e / 260) * seg(e, 1700, 2000) * (1 - seg(e, 5000, 5600)) }), props: (D, e) => D.caractereBulle('gateau', seg(e, 1500, 2000) * (1 - seg(e, 5000, 5600))) });
S('caractere-prof', 'Petit prof', 'evt', { dur: 6400, on, when: is('prof'), anim: [[0, 'content'], [1800, 'reflechit'], [4200, 'idee']], mood: 'reflechit', say: [[200, 1700, L('Bonjour la classe !', 'Silence, s’il vous plaît !')], [1800, 4100, L('Aujourd’hui : les additions !', 'Révisons nos tables !')], [4200, 6200, L('Une petite question ?', 'Je t’interroge bientôt !')]], move: e => { const k = sm(seg(e, 1400, 2000)) * (1 - sm(seg(e, 5600, 6400))); return { x: -110 * k, s: 1 - 0.12 * k }; }, props: (D, e) => { const q = 1 - seg(e, 5800, 6400); D.caractereLunettes(out(seg(e, 300, 800)) * q); if (e > 1800) D.caractereTableau(seg(e, 1800, 2300) * q, e < 4200 ? '2 + 2 = 4' : '3 × 4 = ?'); } });
S('caractere-reveur', 'Devenu rêveur', 'evt', { dur: 6600, on, when: is('reveur'), anim: [[0, 'idle-haut'], [3200, 'reve'], [5000, 'surpris'], [5600, 'content']], mood: 'reflechit', say: [[400, 3000, L('Je rêvais d’étoiles…', 'La tête dans les nuages…')], [5100, 6400, L('Hein ? Tu disais ?', 'Oh, pardon !')]], move: e => ({ y: -12 * Math.sin(e / 800) * (1 - seg(e, 4800, 5200)) - 16 * bump(seg(e, 5000, 5500)), x: -24 * sm(seg(e, 0, 1000)) * (1 - sm(seg(e, 4800, 5600))) }), props: (D, e) => D.caractereBulle('lune', seg(e, 400, 1000) * (1 - seg(e, 4600, 5000))) });
S('caractere-surprise', 'Caractère surprise', 'evt', { dur: 5800, on, when: is('surprise'), anim: [[0, 'chargement'], [2300, 'surpris'], [2900, 'etoiles']], mood: 'surpris', say: [[200, 2200, L('Surprise !', 'Je tire au sort…', 'Roulez, les dés !')], [2700, 5600, o => (o.adj && o.adj !== 'comme d’habitude' ? `Aujourd’hui, je suis ${o.adj} !` : 'Qui suis-je, aujourd’hui ?')]], move: e => ({ y: -22 * bump(seg(e, 2300, 2900)) }), props: (D, e) => { D.caractereDe(e, seg(e, 0, 300) * (1 - seg(e, 2700, 3200))); if (e > 2900) D.stars(e - 2900); } });
S('caractere-nom', 'Son nouveau nom', 'evt', { dur: 5200, on, when: is('nom'), anim: [[0, 'surpris'], [800, 'etoiles'], [3000, 'fier']], mood: 'excite', say: [[200, 2600, o => `${o.nom || 'Pixel'} ? C’est moi !`], [2700, 5000, o => (o.nom && o.nom !== 'Pixel' ? 'J’adore mon nouveau nom !' : 'Mon nom de toujours !')]], move: e => ({ y: -20 * bump(seg(e, 800, 1400)), x: -70 * sm(seg(e, 900, 1500)) * (1 - sm(seg(e, 4400, 5200))) }), props: (D, e, p, o) => D.caractereBadge(out(seg(e, 1200, 1700)) * (1 - seg(e, 4600, 5200)), o.nom) });
S('caractere-surnom', 'Ton surnom', 'evt', { dur: 4400, on, when: is('surnom'), anim: [[0, 'salut'], [2200, 'content']], mood: 'content', say: [[200, 2200, o => (o.surnom ? `Enchanté, ${o.surnom} !` : 'D’accord, plus de surnom !')], [2300, 4200, o => (o.surnom ? `Je t’appellerai ${o.surnom}.` : 'Comme tu veux.')]], move: e => ({ y: jumps(Math.min(e, 1000), 500, 22) }), props: (D, e) => { if (e < 2400) D.hearts(e, 0.7); } });
S('caractere-reglage', 'C’est noté', 'evt', { dur: 3400, on, when: is('reglage'), anim: [[0, 'ecoute'], [1200, 'content']], mood: 'ecoute', say: [[200, 3200, o => REGLE(o)]], move: e => ({ y: 8 * bump(seg(e, 300, 700)) + 8 * bump(seg(e, 800, 1200)) }) });

// ---- only for a character (caractere: true): nothing at 50, more and more as the trait grows ----
S('caractere-ronchon', 'Ronchon', 'tap', { caractere: true, traits: { grognon: 1 }, pool: 'calm', dur: 2600, anim: [[0, 'boudeur']], mood: 'fache', say: [[100, 2400, L('Mmh. Quoi ?', 'Tu me déranges, là.', 'Pas maintenant.', 'Grmbl…')]], move: e => { const k = sm(seg(e, 0, 400)) * (1 - sm(seg(e, 1900, 2600))); return { x: 26 * k, r: 0.05 * k, f: k > 0.5 }; }, props: (D, e) => D.steam(e) });
S('caractere-pas-trop', 'Pas trop de câlins', 'calin', { caractere: true, traits: { calin: -1 }, pool: 'pet', dur: 3000, anim: [[0, 'boudeur'], [1700, 'content']], mood: 'confus', say: [[150, 1600, L('Ça va, ça va…', 'Pas trop, hein !', 'Doucement…', 'Oui, bon…')], [1700, 2800, L('…bon, d’accord.', '…encore un peu.')]], move: e => { const k = out(seg(e, 0, 400)) * (1 - sm(seg(e, 1500, 2300))); return { x: 50 * k, r: 0.08 * k }; } });
S('caractere-gros-calin', 'Gros câlin', 'calin', { caractere: true, traits: { calin: 1 }, pool: ['pet', 'love'], dur: 3800, anim: [[0, 'amoureux'], [2200, 'bisou']], mood: 'amoureux', say: [[150, 2100, L('Gros câlin !', 'Viens là, toi !', 'Je ne te lâche plus !')], [2200, 3600, L('Je t’adore !', 'Encore, encore !')]], move: e => { const k = bump(seg(e, 0, 2200)); return { s: 1 + 0.2 * k, sx: 1 + 0.08 * k, sy: 1 - 0.06 * k }; }, props: (D, e) => { D.hearts(e, 1.8); D.caractereCoeurs(e, bump(seg(e, 0, 2600))); } });
S('caractere-farce', 'La farce', 'tap', { caractere: true, traits: { farceur: 1 }, pool: 'calm', dur: 4600, anim: [[0, 'bug'], [2300, 'rire']], mood: 'surpris', say: [[2400, 4400, L('Hé hé, je t’ai eu !', 'C’était une blague !', 'Ha ha, tu y as cru !')]], move: e => ({ x: e < 2300 ? 5 * Math.sin(e / 13) * (Math.floor(e / 260) % 2) : 0, r: e > 2300 ? 0.08 * Math.sin(e / 90) * (1 - seg(e, 3800, 4600)) : 0 }), props: (D, e, p, o) => { if (e > 300 && e < 2300) D.caractereErreur(seg(e, 300, 500) * (1 - seg(e, 2100, 2300)), o.nom); } });
S('caractere-pipelette', 'La pipelette', 'tap', { caractere: true, traits: { bavard: 1 }, pool: 'calm', dur: 5600, anim: [[0, 'parle']], mood: 'content', say: [[100, 1700, L('Tu sais quoi ?', 'Oh, au fait !')], [1800, 3700, L('J’ai vu une mouche ce matin !', 'J’ai rêvé de pizzas !', 'J’ai compté jusqu’à mille !')], [3800, 5400, L('Bref, c’était génial.', 'Je te raconterai la suite !')]], move: e => ({ y: -4 * Math.abs(Math.sin(e / 110)) * (1 - seg(e, 5000, 5600)) }), props: (D, e) => D.caractereBla(e, 1 - seg(e, 4800, 5400)) });
S('caractere-cache', 'Il se cache', 'tap', { caractere: true, traits: { bavard: -0.7, calin: 0.3 }, pool: 'calm', dur: 3600, anim: [[0, 'timide']], mood: 'amoureux', say: [[900, 3200, L('…', 'Oh… c’est toi…', 'Hi hi…')]], move: e => { const k = out(seg(e, 0, 400)) * (1 - sm(seg(e, 2600, 3600))); return { y: 170 * k - 30 * bump(seg(e, 1200, 2400)) * k }; }, props: (D, e) => D.blush(sm(seg(e, 0, 600))) });
S('caractere-flemme', 'La flemme', 'vie', { caractere: true, traits: { energique: -1 }, quiet: true, w: 2, dur: 9400, anim: [[0, 'baille'], [2000, 'fatigue'], [3800, 'sommeil'], [7800, 'reveil']], mood: 'baille', say: [[300, 2000, L('Flemme…', 'Trop la flemme…')], [7900, 9200, L('Quoi ? Déjà ?', 'Encore cinq minutes…')]], move: e => { const k = sm(seg(e, 1800, 3800)) * (1 - sm(seg(e, 7800, 9000))); return { y: 60 * k, r: -0.32 * k, s: 1 - 0.08 * k }; }, props: (D, e) => { if (e > 3800 && e < 7800) D.zzz(e - 3800, 1); } });
S('caractere-trop-plein', 'Trop d’énergie', 'vie', { caractere: true, traits: { energique: 1 }, w: 2, dur: 6800, anim: [[0, 'etoiles'], [1000, 'danse'], [5400, 'content']], mood: 'excite', say: [[200, 1700, L('Je ne tiens pas en place !', 'Trop d’énergie !')], [5500, 6600, L('Pfiou ! Encore ?', 'Ouf !')]], move: e => { const k = sm(seg(e, 800, 1400)) * (1 - sm(seg(e, 4800, 5400))); return { x: 230 * Math.sin((e - 800) / 520) * k, y: jumps(e, 360, 42) * k, r: 0.1 * Math.sin(e / 180) * k }; }, props: (D, e) => D.caractereEclairs(e, seg(e, 600, 1000) * (1 - seg(e, 5000, 5400))) });
S('caractere-enquete', 'L’enquête', 'vie', { caractere: true, traits: { curieux: 1 }, w: 2, dur: 8400, anim: [[0, 'curieux'], [1600, 'recherche'], [6400, 'idee']], mood: 'ecoute', say: [[1700, 4200, L('Hmm… des indices…', 'Qu’est-ce que c’est que ça ?', 'Une trace de doigt !')], [6500, 8200, L('Affaire résolue !', 'Élémentaire !')]], init: o => { const ph = rnd() * TAU; o.lx = e => 260 * Math.sin(e / 900 + ph); }, move: (e, p, o) => { const k = sm(seg(e, 1200, 1800)) * (1 - sm(seg(e, 6000, 7000))); return { x: o.lx(e) * 0.35 * k, y: 30 * k, s: 1 - 0.15 * k, r: 0.05 * Math.sin(e / 400) * k }; }, props: (D, e, p, o) => { const q = seg(e, 1200, 1800) * (1 - seg(e, 6000, 6600)); D.caractereLoupe(e, q, clamp(400 + o.lx(e), 60, 740), 372 + 16 * Math.sin(e / 300)); } });
S('caractere-grimace', 'La grimace', 'vie', { caractere: true, traits: { farceur: 1 }, w: 2, dur: 5800, anim: [[0, 'idle-regard'], [1500, 'rire'], [3600, 'clin-oeil']], mood: 'content', say: [[1600, 3500, L('Bleuh !', 'Grimace !', 'Nya nya nya !')], [3600, 5600, L('Je suis drôle, hein ?', 'Hi hi !')]], move: e => ({ sx: 1 + 0.12 * bump(seg(e, 1500, 2300)) - 0.08 * bump(seg(e, 2300, 3200)), sy: 1 - 0.1 * bump(seg(e, 1500, 2300)) + 0.1 * bump(seg(e, 2300, 3200)), r: e > 1500 && e < 3500 ? 0.07 * Math.sin(e / 100) : 0 }), props: (D, e) => { if (e > 1500 && e < 3600) D.caractereLangue(e, sm(seg(e, 1500, 1800)) * (1 - seg(e, 3300, 3600))); } });
S('caractere-rouspete', 'Il rouspète', 'vie', { caractere: true, traits: { grognon: 1 }, w: 2, dur: 7200, anim: [[0, 'boudeur'], [3800, 'idle-impatient']], mood: 'fache', say: [[400, 3400, L('Personne ne m’écoute…', 'Tout m’agace, aujourd’hui.', 'Grmbl, grmbl…')], [3900, 6900, L('Pff…', 'Bon.', 'Hmpf.')]], move: e => { const k = sm(seg(e, 0, 1000)) * (1 - sm(seg(e, 6200, 7200))); return { y: 24 * k, x: 4 * Math.sin(e / 60) * seg(e, 2000, 2300) * (1 - seg(e, 3000, 3300)) }; }, props: (D, e) => D.cloud(e, seg(e, 0, 700) * (1 - seg(e, 6400, 7200)), false) });
S('caractere-gateau', 'Le gâteau', 'vie', { caractere: true, traits: { gourmand: 1 }, w: 2, dur: 7600, anim: [[0, 'idle-haut'], [1000, 'idee'], [4600, 'amoureux']], mood: 'content', say: [[1200, 4400, L('Un petit gâteau…', 'Avec du chocolat…', 'Une part de tarte…')], [4600, 7400, L('Slurp !', 'J’ai faim !', 'Miam miam…')]], move: e => ({ y: -8 * Math.sin(e / 700) * (1 - seg(e, 6600, 7600)), r: 0.04 * Math.sin(e / 300) * seg(e, 4600, 5000) * (1 - seg(e, 6800, 7600)) }), props: (D, e) => D.caractereBulle('gateau', seg(e, 600, 1200) * (1 - seg(e, 6800, 7400))) });
S('caractere-lecon', 'La leçon', 'vie', { caractere: true, traits: { studieux: 1 }, w: 2, dur: 8400, anim: [[0, 'reflechit'], [3000, 'idee'], [5400, 'content']], mood: 'reflechit', init: o => { o.q = pick([[3, 4, '×'], [7, 8, '+'], [9, 6, '+'], [5, 5, '×'], [12, 3, '−']]); o.r = o.q[2] === '×' ? o.q[0] * o.q[1] : o.q[2] === '+' ? o.q[0] + o.q[1] : o.q[0] - o.q[1]; }, say: [[400, 2900, o => `Voyons… ${o.q[0]} ${o.q[2]} ${o.q[1]}…`], [3000, 5300, o => `…ça fait ${o.r} !`], [5400, 8200, L('Je suis trop fort !', 'Facile !', 'À toi, maintenant !')]], move: e => { const k = sm(seg(e, 0, 1000)) * (1 - sm(seg(e, 7400, 8400))); return { x: -110 * k, s: 1 - 0.12 * k, y: -14 * bump(seg(e, 3000, 3500)) }; }, props: (D, e, p, o) => { const q = seg(e, 300, 900) * (1 - seg(e, 7600, 8200)); D.caractereLunettes(q); D.caractereTableau(q, `${o.q[0]} ${o.q[2]} ${o.q[1]} = ${e < 3000 ? '?' : o.r}`); } });
});
