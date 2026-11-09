/* Scene pack « boutique » — what Pixel wears, and his reactions to it (pixel/boutique.py, web/boutique.js).
   Two things live here:
   - the catalogue: 24 accessories, one B('id', 'Label', 'nom', 'slot', prix, [u0, v0, u1, v1], draw) per line (pixel/boutique.py
     reads the id, label, name, slot and price from here, like pixel/nourrir.py reads the menu). The slot says where it goes:
     tete (on his head), yeux (glasses), cou (around his neck), plus (little extras); he wears one accessory per slot.
     draw(D) draws it on his face with the drawing kit of web/persona.js: D.P(u, v) is a point of the face's 96 x 54 grid on the
     screen (it follows his moves and his head), D.U one grid pixel, D.col the theme's colours, D.pix true in Rétro and LCD (the
     drawing is then blown up in big pixels). The box [u0, v0, u1, v1] is what its picture shows in the shop.
     window.PixelWardrobe = { ITEMS, BY, SLOTS, draw(D, ids), icon(canvas, id, colours) }.
   - the scenes: he admires a new accessory, puts one on, takes one off, opens his gift of the day.
   See the top of web/persona.js: scenes are defined with S('id', 'Label', 'group', { ... }) on one line each (pixel/scenes.py
   reads them). The events come from the server's "boutique" (web/boutique.js): boutique-achat, boutique-porte, boutique-retire
   (data.objet, data.label, data.nom), boutique-cadeau (data.n). */
window.PixelWardrobe = (() => {
const TAU = Math.PI * 2, ITEMS = [], BY = {};
const SLOTS = [['tete', 'Sur la tête'], ['yeux', 'Lunettes'], ['cou', 'Autour du cou'], ['plus', 'Petits plus']];
const ORDER = ['cou', 'plus', 'yeux', 'tete'];           // drawn in this order: his hat over his glasses
function B(id, label, nom, slot, prix, box, draw) { const it = { id, label, nom, slot, prix, box, draw }; ITEMS.push(it); BY[id] = it; }

/* ---- drawing helpers: every shape is made of grid points, so that it turns and flips with him ---- */
const path = (D, pts) => { const g = D.g; g.beginPath(); pts.forEach(([u, v], i) => { const q = D.P(u, v); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); }); };
const fill = (D, pts, c) => { path(D, pts); D.g.closePath(); D.g.fillStyle = c; D.g.fill(); };
const line = (D, pts, c, w = 1, closed = false) => { const g = D.g; path(D, pts); if (closed) g.closePath(); g.strokeStyle = c; g.lineWidth = D.lw(w * D.U); g.lineCap = g.lineJoin = 'round'; g.stroke(); };
const arc = (u, v, ru, rv, a0 = 0, a1 = TAU, n = 22) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [u + Math.cos(a) * ru, v + Math.sin(a) * rv]; });
const disc = (D, u, v, r, c) => fill(D, arc(u, v, r, r, 0, TAU, 14), c);
const mirror = pts => pts.map(([u, v]) => [96 - u, v]);
const both = (D, pts, fn) => { fn(pts); fn(mirror(pts)); };
const heartPts = (u, v, s) => Array.from({ length: 25 }, (_, i) => { const t = i / 24 * TAU; return [u + s * Math.sin(t) ** 3, v - s * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16]; });
const starPts = (u, v, r) => Array.from({ length: 10 }, (_, i) => { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; return [u + Math.cos(a) * rr, v + Math.sin(a) * rr]; });
/* a tinted lens: his eyes show through. Smooth themes: see-through. Pixel themes: one line in two, like a blind. */
function lens(D, pts, c, alpha = 0.7) {
  const g = D.g;
  if (!D.pix) { g.globalAlpha *= alpha; fill(D, pts, c); g.globalAlpha /= alpha; return; }
  const q = pts.map(([u, v]) => D.P(u, v)), k = D.k || 1, y0 = Math.floor(Math.min(...q.map(p => p.y)) / k) * k, y1 = Math.max(...q.map(p => p.y));
  const x0 = Math.min(...q.map(p => p.x)), x1 = Math.max(...q.map(p => p.x));
  g.save(); path(D, pts); g.closePath(); g.clip(); g.fillStyle = c;
  for (let y = y0, i = Math.round(y0 / k); y <= y1; y += k, i++) if (i % 2 === 0) g.fillRect(x0, y, x1 - x0, k);
  g.restore();
}
const LE = [33, 23.5], RE = [63, 23.5];                  // the middle of his eyes, pixel or drawn

/* ---- on his head ---- */
B('casquette', 'Casquette', 'sa casquette', 'tete', 15, [26, -3, 80, 17], D => { const c = D.col;
  fill(D, [...arc(48, 12.5, 15.5, 11.5, Math.PI, TAU), [63.5, 12.5]], c.acc); fill(D, [[58, 9.5], [77, 11], [77, 13.5], [58, 13.5]], c.hi); disc(D, 48, 1.2, 1.3, c.hi); line(D, [[33, 12.5], [63, 12.5]], c.hi, 0.8); });
B('bonnet', 'Bonnet', 'son bonnet', 'tete', 20, [26, -5, 70, 17], D => { const c = D.col;
  fill(D, [...arc(48, 11, 16, 10.5, Math.PI, TAU)], c.pink); fill(D, [[31, 10], [65, 10], [65, 14], [31, 14]], c.hi); for (let u = 35; u < 65; u += 5) line(D, [[u, 10.6], [u, 13.4]], c.bg, 0.7); disc(D, 48, -1, 2.8, c.hi); });
B('chapeau-fete', 'Chapeau de fête', 'son chapeau de fête', 'tete', 10, [30, -5, 68, 17], D => { const c = D.col;
  fill(D, [[40, 13.5], [56, 13.5], [49, -1.5]], c.acc); line(D, [[42.2, 9], [54, 9.4]], c.hi, 1); line(D, [[44.6, 4.4], [51.8, 4.8]], c.hi, 1); disc(D, 49, -2, 2, c.pink); });
B('haut-de-forme', 'Haut-de-forme', 'son haut-de-forme', 'tete', 40, [28, -5, 68, 17], D => { const c = D.col;
  fill(D, [[32, 10.8], [64, 10.8], [64, 13.6], [32, 13.6]], c.fg); fill(D, [[38, -2], [58, -2], [58, 11], [38, 11]], c.fg); fill(D, [[38, 6.6], [58, 6.6], [58, 9.4], [38, 9.4]], c.acc); });
B('oreilles-chat', 'Oreilles de chat', 'ses oreilles de chat', 'tete', 35, [20, -3, 76, 17], D => { const c = D.col;
  both(D, [[27, 13.5], [39, 13.5], [29.5, 1]], p => fill(D, p, c.fg)); both(D, [[29.8, 11.6], [35.8, 11.6], [30.9, 5]], p => fill(D, p, c.pink)); });
B('oreilles-ours', 'Oreilles d’ours', 'ses oreilles d’ours', 'tete', 35, [18, -2, 78, 17], D => { const c = D.col;
  for (const u of [27, 69]) { disc(D, u, 7.5, 5.6, c.fg); disc(D, u, 7.8, 2.9, c.pink); } });
B('sorcier', 'Chapeau de sorcier', 'son chapeau de sorcier', 'tete', 60, [24, -6, 72, 17], D => { const c = D.col;
  fill(D, [[36.5, 11], [59.5, 11], [53.5, 1.5], [58, -3.5], [46, 0.5]], c.dim); fill(D, [[27, 13.6], [69, 13.6], [63, 10.4], [33, 10.4]], c.fg); fill(D, [[38.2, 7.6], [57.8, 7.6], [59, 10.4], [37, 10.4]], c.acc); fill(D, starPts(47.5, 3.6, 2.1), c.hi); });
B('couronne', 'Couronne', 'sa couronne', 'tete', 120, [30, -3, 66, 17], D => { const c = D.col;
  fill(D, [[36, 13], [36, 2.5], [42, 7.5], [48, 0.5], [54, 7.5], [60, 2.5], [60, 13]], c.acc); for (const [u, k] of [[42, c.pink], [48, c.hi], [54, c.pink]]) disc(D, u, 10.3, 1.3, k); for (const u of [36, 48, 60]) disc(D, u, u === 48 ? 0.3 : 2.3, 1.1, c.hi); });
B('aureole', 'Auréole', 'son auréole', 'tete', 80, [30, -4, 66, 14], D => { line(D, arc(48, 4.5, 11.5, 2.8), D.col.acc, 1.5, true); });
B('antenne-coeur', 'Antenne cœur', 'son antenne cœur', 'tete', 45, [34, -7, 62, 16], D => { const c = D.col;
  line(D, [[48, 13], [48, 5.5]], c.fg, 1.1); disc(D, 48, 13, 1.6, c.fg); fill(D, heartPts(48, 1.4, 5), c.pink); });

/* ---- glasses ---- */
B('lunettes', 'Lunettes rondes', 'ses lunettes rondes', 'yeux', 20, [14, 10, 82, 37], D => { const c = D.col;
  for (const [u, v] of [LE, RE]) line(D, arc(u, v, 9.6, 9.8), c.acc, 1.2, true); line(D, [[42.6, 22.5], [53.4, 22.5]], c.acc, 1.2); both(D, [[23.4, 22], [17.5, 20]], p => line(D, p, c.acc, 1.2)); });
B('soleil', 'Lunettes de soleil', 'ses lunettes de soleil', 'yeux', 30, [14, 12, 82, 36], D => { const c = D.col, L0 = [[23, 17.5], [43, 17.5], [42.4, 26.5], [38, 31.5], [28.5, 31.5], [23.8, 26.5]];
  both(D, L0, p => { lens(D, p, c.dim, 0.8); line(D, p, c.fg, 1, true); }); line(D, [[23, 17.5], [73, 17.5]], c.fg, 1.6); both(D, [[23, 18], [17.5, 16.5]], p => line(D, p, c.fg, 1.2)); both(D, [[26.5, 20.5], [30, 20.5]], p => line(D, p, c.hi, 0.9)); });
B('lunettes-coeur', 'Lunettes cœur', 'ses lunettes cœur', 'yeux', 50, [14, 10, 82, 38], D => { const c = D.col;
  for (const [u, v] of [LE, RE]) { lens(D, heartPts(u, v - 1.2, 10.5), c.pink, 0.35); line(D, heartPts(u, v - 1.2, 10.5), c.pink, 1.3, true); } line(D, [[43.5, 21], [52.5, 21]], c.pink, 1.2); both(D, [[21.6, 19.5], [17, 18]], p => line(D, p, c.pink, 1.2)); });
B('monocle', 'Monocle', 'son monocle', 'yeux', 45, [44, 10, 84, 48], D => { const c = D.col;
  line(D, arc(RE[0], RE[1], 9.8, 10), c.acc, 1.3, true); line(D, arc(RE[0], RE[1], 8.4, 8.6, Math.PI * 1.15, Math.PI * 1.45, 5), c.hi, 0.7); line(D, [[71.5, 29], [75, 34], [75.5, 40], [73, 45]], c.dim, 0.7); disc(D, 73, 45.6, 1, c.acc); });
B('masque', 'Masque de héros', 'son masque de héros', 'yeux', 55, [10, 10, 86, 38], D => { const g = D.g;
  path(D, [[16, 14.5], [48, 16.8], [80, 14.5], [82, 27], [69, 35], [54, 31], [48, 30], [42, 31], [27, 35], [14, 27]]); g.closePath();
  for (const [u, v] of [LE, RE]) { const h = arc(u, v + 0.2, 8.6, 9.6); h.forEach(([a, b], i) => { const q = D.P(a, b); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); }); g.closePath(); }
  g.fillStyle = D.col.acc; g.fill('evenodd'); });
B('lunettes-3d', 'Lunettes 3D', 'ses lunettes 3D', 'yeux', 25, [14, 12, 82, 36], D => { const c = D.col, L0 = [[23, 17], [43, 17], [43, 31], [23, 31]];
  lens(D, L0, c.pink, 0.5); lens(D, mirror(L0), c.acc, 0.5); both(D, L0, p => line(D, p, c.hi, 1.2, true)); line(D, [[43, 20], [53, 20]], c.hi, 1.6); both(D, [[23, 19], [17.5, 17.5]], p => line(D, p, c.hi, 1.2)); });

/* ---- around his neck ---- */
B('noeud-pap', 'Nœud papillon', 'son nœud papillon', 'cou', 15, [34, 41, 62, 56], D => { const c = D.col;
  both(D, [[39.5, 45], [48, 49], [39.5, 53]], p => fill(D, p, c.acc)); disc(D, 48, 49, 1.9, c.hi); });
B('cravate', 'Cravate', 'sa cravate', 'cou', 20, [36, 41, 60, 56], D => { const c = D.col;
  fill(D, [[45.4, 44.5], [50.6, 44.5], [49.6, 47.6], [46.4, 47.6]], c.acc); fill(D, [[46.4, 47.6], [49.6, 47.6], [51.2, 52], [48, 54.4], [44.8, 52]], c.acc); line(D, [[46.2, 49.6], [50, 50.8]], c.hi, 0.7); line(D, [[45.6, 51.6], [49.4, 52.9]], c.hi, 0.7); });
B('echarpe', 'Écharpe', 'son écharpe', 'cou', 25, [24, 41, 72, 57], D => { const c = D.col;
  fill(D, [[30, 45.5], [66, 45.5], [67.4, 50], [28.6, 50]], c.pink); for (let u = 34; u < 66; u += 6) line(D, [[u, 46.2], [u - 0.4, 49.3]], c.bg, 0.9); fill(D, [[55, 49.5], [61.5, 49.5], [62.5, 54.2], [56, 54.2]], c.pink); line(D, [[56.6, 52.4], [62, 52.4]], c.bg, 0.9); });
B('medaille', 'Médaille', 'sa médaille', 'cou', 50, [34, 39, 62, 57], D => { const c = D.col;
  line(D, [[41, 42.5], [48, 48.4], [55, 42.5]], c.pink, 1.5); disc(D, 48, 50.4, 3.4, c.acc); fill(D, starPts(48, 50.4, 2), c.hi); });

/* ---- little extras ---- */
B('moustache', 'Moustache', 'sa moustache', 'plus', 30, [28, 24, 68, 40], D => { both(D, [[48.4, 31.4], [42.5, 30.4], [36.5, 32.6], [33, 30.6], [34.6, 34.6], [40.5, 35.4], [48.4, 33.6]], p => fill(D, p, D.col.fg)); });
B('pansement', 'Pansement', 'son pansement', 'plus', 5, [10, 4, 32, 20], D => { const c = D.col;
  fill(D, [[14.6, 12.6], [24.4, 8.6], [26, 12], [16.2, 16]], c.hi); fill(D, [[18.6, 11], [21.8, 9.7], [23.3, 13.1], [20.1, 14.4]], c.acc); });
B('fleur', 'Fleur', 'sa fleur', 'plus', 10, [66, 3, 90, 22], D => { const c = D.col;
  for (let i = 0; i < 5; i++) { const a = i * TAU / 5 - Math.PI / 2; disc(D, 78 + Math.cos(a) * 3.2, 12 + Math.sin(a) * 3.2, 2.5, c.pink); } disc(D, 78, 12, 1.9, c.acc); });
B('etoile', 'Étoile sur la joue', 'son étoile sur la joue', 'plus', 15, [66, 20, 90, 38], D => { fill(D, starPts(78.5, 29, 3.6), D.col.acc); });

/* what he wears, in the right order (web/persona.js decor); an unknown id is skipped, a drawing that fails never stops him */
function draw(D, ids) {
  const worn = (ids || []).map(id => BY[id]).filter(Boolean).sort((a, b) => ORDER.indexOf(a.slot) - ORDER.indexOf(b.slot));
  for (const it of worn) { D.g.save(); try { it.draw(D); } catch (e) { /* never */ } D.g.restore(); }
}
/* its picture for the shop: the same drawing, in a square canvas, in the colours c (a theme's { fg, accent, pink, hi, dim, bg }) */
function icon(cv, id, c) {
  const it = BY[id], g = cv.getContext && cv.getContext('2d'); if (!it || !g) return false;
  const [u0, v0, u1, v1] = it.box, s = Math.min(cv.width / (u1 - u0), cv.height / (v1 - v0)), ox = (cv.width - (u1 - u0) * s) / 2, oy = (cv.height - (v1 - v0) * s) / 2;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
  const col = { fg: c.fg, pink: c.pink || c.accent || c.fg, acc: c.accent || c.fg, hi: c.hi || c.fg, dim: c.dim || c.fg, bg: c.bg };
  const D = { g, U: s, P: (u, v) => ({ x: ox + (u - u0) * s, y: oy + (v - v0) * s }), col, lw: w => Math.max(w, 1), pix: false, k: 1 };
  g.save(); try { it.draw(D); } finally { g.restore(); }
  return true;
}
return { ITEMS, BY, SLOTS, ORDER, draw, icon };
})();

(window.PixelScenePacks ||= []).push(({ S, L, seg, bump, jumps, prop }) => {
const fade = (e, a, b, c, d) => seg(e, a, b) * (1 - seg(e, c, d));
const named = (lines, alt) => o => { const n = o && o.nom, a = lines.filter(s => !s.includes('{nom}') || n); const s = a[Math.floor(Math.random() * a.length)] || alt; return s.replace('{nom}', n || ''); };

// ---- the props: sparkles around a new accessory, a little mirror, a coin, a gift ----
prop('boutiqueEclats', (D, e, q) => {              // sparkles turning around his head
  if (q <= 0) return;
  const { g, U, col, star } = D; g.globalAlpha = q;
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + e / 900, o = D.P(48 + Math.cos(a) * 40, 22 + Math.sin(a) * 22); star(o.x, o.y, (1.6 + 1.2 * Math.abs(Math.sin(e / 260 + i))) * U, i % 2 ? col.acc : col.hi, a); }
  g.globalAlpha = 1;
});
prop('boutiqueMiroir', (D, e, q) => {              // a hand mirror by his side: he looks at himself
  if (q <= 0) return;
  const { g, U, col, lw } = D, o = D.P(86, 26), y = o.y + Math.sin(e / 500) * 0.8 * U;
  g.globalAlpha = q; g.fillStyle = col.dim; g.fillRect(o.x - 0.9 * U, y + 5 * U, 1.8 * U, 7 * U);
  g.fillStyle = col.bg; g.strokeStyle = col.acc; g.lineWidth = lw(1.1 * U); g.beginPath(); g.ellipse(o.x, y, 4.6 * U, 5.6 * U, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.strokeStyle = col.hi; g.lineWidth = lw(0.6 * U); g.beginPath(); g.moveTo(o.x - 2.2 * U, y - 1.2 * U); g.lineTo(o.x - 0.2 * U, y - 3.4 * U); g.stroke();
  g.globalAlpha = 1;
});
prop('boutiquePiece', (D, x, y, r, q = 1) => {      // a coin, at a point of the screen
  if (q <= 0 || r <= 0) return;
  const { g, col, lw } = D; g.globalAlpha = q; g.fillStyle = col.acc; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = col.hi; g.lineWidth = lw(r * 0.22); g.beginPath(); g.arc(x, y, r * 0.62, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
});
prop('boutiqueCadeau', (D, e, open, q) => {        // a gift box by his side; open 0..1: the lid flies off and the coins jump out
  if (q <= 0) return;
  const { g, U, col } = D, o = D.P(84, 36), w = 11 * U, h = 8 * U, x = o.x - w / 2, y = o.y - h / 2;
  g.globalAlpha = q; g.fillStyle = col.pink; g.fillRect(x, y, w, h); g.fillStyle = col.hi; g.fillRect(o.x - 0.9 * U, y, 1.8 * U, h);
  const ly = y - 2.6 * U - 14 * U * open, lx = x - U + 6 * U * open;
  g.fillStyle = col.pink; g.fillRect(lx, ly, w + 2 * U, 2.6 * U); g.fillStyle = col.hi; g.fillRect(lx + w / 2, ly, 1.8 * U, 2.6 * U);
  g.globalAlpha = 1;
  if (open > 0) for (let i = 0; i < 5; i++) { const t = Math.min(1, open * 1.2 + 0.0001), a = -Math.PI / 2 + (i - 2) * 0.32; D.boutiquePiece(o.x + Math.cos(a) * 16 * U * t, y + Math.sin(a) * 16 * U * t + 10 * U * t * t, 1.7 * U, q * (1 - Math.max(0, open - 0.75) * 4)); }
});

// ---- the scenes ----
S('boutique-nouveau', 'Un nouvel accessoire', 'evt', { dur: 5200, on: ['boutique-achat'], urgent: true, anim: [[0, 'surpris'], [500, 'etoiles'], [2600, 'fier'], [4400, 'content']], mood: 'excite', traits: { calin: 0.3 },
  say: [[200, 2400, named(['Oh ! {nom} !', 'C’est pour moi ?', 'Trop beau !', 'Waouh, merci !'], 'Trop beau !')], [2600, 5000, L('Ça me va bien, non ?', 'Trop la classe !', 'Je ne l’enlève plus !', 'Merci, merci, merci !')]],
  move: e => ({ y: jumps(Math.min(e, 2400), 600, 22) * (1 - seg(e, 2200, 2400)), r: 0.06 * Math.sin(e / 300) * fade(e, 2600, 3000, 4600, 5200) }),
  props: (D, e) => D.boutiqueEclats(e, fade(e, 300, 700, 4200, 5000)) });
S('boutique-miroir', 'Devant le miroir', 'evt', { dur: 4200, on: ['boutique-porte'], urgent: true, anim: [[0, 'curieux'], [1200, 'fier'], [3200, 'clin-oeil']], mood: 'fier',
  say: [[300, 2000, named(['Hop, {nom} !', 'Voyons voir…', 'Comment tu me trouves ?'], 'Voyons voir…')], [2200, 4000, L('Pas mal du tout !', 'Quel style !', 'Très chic.', 'J’adore !')]],
  move: e => ({ r: 0.07 * Math.sin(e / 420) * fade(e, 400, 900, 3000, 3600), x: -10 * fade(e, 200, 700, 3400, 4000) }),
  props: (D, e) => D.boutiqueMiroir(e, fade(e, 200, 600, 3300, 3800)) });
S('boutique-range', 'Il range ses affaires', 'evt', { dur: 3000, on: ['boutique-retire'], anim: [[0, 'idle-haut'], [900, 'content']], mood: 'content',
  say: [[200, 2700, named(['Hop, rangé !', 'Je garde {nom} pour plus tard.', 'Au placard !', 'Un peu d’air !'], 'Hop, rangé !')]],
  move: e => ({ y: -12 * bump(seg(e, 0, 600)) }) });
S('boutique-cadeau', 'Le cadeau du jour', 'evt', { dur: 5000, on: ['boutique-cadeau'], urgent: true, anim: [[0, 'curieux'], [1400, 'surpris'], [1900, 'etoiles'], [4000, 'content']], mood: 'excite',
  say: [[200, 1400, L('Un cadeau !', 'C’est quoi, c’est quoi ?', 'Oh, un paquet !')], [1900, 4800, o => `${o && o.n ? o.n : 5} pièces ! ` + ['Merci !', 'On va à la boutique ?', 'Youpi !'][Math.floor(Math.random() * 3)]]],
  move: e => ({ x: -8 * fade(e, 0, 500, 4200, 4800), y: jumps(Math.max(0, e - 1900), 500, 18) * fade(e, 1900, 2000, 3600, 3900) }),
  props: (D, e) => D.boutiqueCadeau(e, seg(e, 1400, 2300), fade(e, 0, 300, 4300, 4800)) });
});
