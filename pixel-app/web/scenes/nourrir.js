/* Scene pack « nourrir » — feeding Pixel: his menu (24 foods in pixel art), his belly, and what he does with food.
   pixel/nourrir.py keeps his belly (0..100, 100 = full), his tastes and his meals, and reads the menu below from this file;
   web/nourrir.js hands this pack the server's snapshot ("nourrir", through PixelFoods.set) and starts the scenes:
     'nourrir-repas' { plat, reaction, rot }   a meal. reaction: prefere, aime, miam, beurk, refuse, plein, eclate, sucre,
                                               legume, robot (pixel/nourrir.py react()); rot: he burps at the end
     'nourrir-faim'  { niveau }                his belly just got a little (1) or very (2) empty
   « tu as faim ? » plays nourrir-ventre (pixel/nourrir.py command()). The hints are moments of life ('vie'): a little
   hungry, very hungry, « on mange quoi ? » around meal times. They need the feature on, never come back within 20 min
   (PixelFoods.hintOk), never play at night (they are not quiet) and, like every moment of life, only when nothing else
   needs his face. Every scene works without data too (the lab, tests): it then picks a food of its own.
   See the top of web/persona.js: scenes are S('id', 'Label', 'group', { ... }) on one line each (pixel/scenes.py reads them).
   The food is drawn from 12 x 12 sprites cached as tiny canvases (one drawImage, no smoothing), in the theme's colours;
   in Rétro and LCD it lands on whole pixels of the face. */
window.PixelFoods = (() => {
/* the menu: F(id, label, name with its article, category, value, sprite). pixel/nourrir.py reads the first five from here:
   one F( per line, no straight quote inside the strings (use ’). value: how much it fills his belly (0..100).
   The sprite's letters are the theme's colours: o its line, a its accent, p its pink, d its dim colour, l a light fill (the
   paper in Manga, Croquis and LCD), k a dark mark on a fill; . is empty. Categories: fruit, legume, plat, sucre, boisson, robot. */
const F = (id, label, nom, cat, valeur, art) => ({ id, label, nom, cat, valeur, art });
const FOODS = [
  F('pomme', 'Pomme', 'une pomme', 'fruit', 15, ['......d.....', '......d.oo..', '...oo.dooo..', '.ooaaodaaoo.', 'oaalaaaaaaao', 'oalaaaaaaaao', 'oalaaaaaaaao', 'oaaaaaaaaaao', 'oaaaaaaaaaao', '.oaaaaaaaao.', '..oaaoaaao..', '...oo.ooo...']),
  F('banane', 'Banane', 'une banane', 'fruit', 18, ['.........dd.', '.........ld.', '........olo.', '........olo.', '.......ollo.', '......olllo.', '.....ollllo.', '...ooolllo..', '.ooolllloo..', 'dllllooo....', 'ddoooo......', '............']),
  F('fraise', 'Fraise', 'une fraise', 'fruit', 8, ['....o..o....', '..oo.oo.oo..', '...oooooo...', '.oaaoooaaao.', 'oaalaaaalaao', 'oaaaaalaaaao', 'oalaaaaaalao', '.oaaalaaaao.', '.oaaaaaalao.', '..oalaaaao..', '...oaaaao...', '....oooo....']),
  F('carotte', 'Carotte', 'une carotte', 'legume', 12, ['.........o.o', '........o.oo', '.......ooooo', '......oaoo..', '.....oaaao..', '....oadaao..', '...oaaaado..', '..oaadaao...', '..oaaaao....', '.oadao......', '.oao........', '.oo.........']),
  F('brocoli', 'Brocoli', 'du brocoli', 'legume', 12, ['...oo.oo....', '..oddoddoo..', '.oddddddddo.', 'oddlddddlddo', 'odddddddddo.', '.oddddddddo.', '..oooooooo..', '....ollo....', '....ollo....', '...olllo....', '...ollllo...', '...oooooo...']),
  F('croissant', 'Croissant', 'un croissant', 'plat', 20, ['............', '............', '....oooo....', '..ooadaaoo..', '.oadaadaado.', 'oadaaaaaadao', 'oadaoooodado', '.oao....oao.', '.oo......oo.', '............', '............', '............']),
  F('baguette', 'Baguette', 'une baguette', 'plat', 25, ['.........ooo', '........oaao', '.......oadao', '......oaaao.', '.....oadao..', '....oaaao...', '...oadao....', '..oaaao.....', '.oadao......', 'oaaao.......', 'oaoo........', 'ooo.........']),
  F('pizza', 'Pizza', 'une pizza', 'plat', 35, ['oooooooooooo', 'oddddddddddo', 'oaaaaaaaaaao', '.oapaaaapao.', '.oaaaapaaao.', '..oaaaaaao..', '..oapaaaao..', '...oaaapo...', '...oaaaao...', '....oaao....', '....oaao....', '.....oo.....']),
  F('frites', 'Frites', 'des frites', 'plat', 25, ['..a.a..a.a..', '..a.aa.a.a..', '.aa.aa.aaa..', '.aaaaaaaaa..', '.aaaaaaaaaa.', 'oooooooooooo', 'oppppppppppo', '.ollllllllo.', '.oppppppppo.', '.oppppppppo.', '.oppppppppo.', '.oooooooooo.']),
  F('burger', 'Burger', 'un burger', 'plat', 40, ['............', '...oooooo...', '..oalaalao..', '.oaaaaaaaao.', 'oalaaalaaaao', 'oooooooooooo', '.dodododod..', 'oppppppppppo', 'okkkkkkkkkko', 'oooooooooooo', 'oaaaaaaaaaao', '.oooooooooo.']),
  F('sushi', 'Sushi', 'un sushi', 'plat', 15, ['............', '............', '....oooo....', '..oopppppo..', '.opplpplppo.', '.oooooooooo.', '.ollldddlllo', '.ollldddlllo', '.ollldddlllo', '..oooooooo..', '............', '............']),
  F('pates', 'Pâtes', 'des pâtes', 'plat', 35, ['............', '....oooo....', '...oaapao...', '..olalaalo..', '.ollllllllo.', 'oooooooooooo', 'oddddddddddo', '.oddddddddo.', '..oddddddo..', '...oooooo...', '............', '............']),
  F('soupe', 'Soupe', 'une soupe', 'plat', 25, ['..d...d..d..', '...d.d..d...', '..d...d.d...', '............', 'oooooooooooo', 'oaaaaaaaaaao', 'oalaaaaaaaao', '.oaaaaaaaao.', '.oddddddddo.', '..oddddddo..', '...oooooo...', '............']),
  F('fromage', 'Fromage', 'du fromage', 'plat', 15, ['............', '.........oo.', '.......ooaao', '.....ooaaaao', '...ooaaakaao', '.ooaaaaaaaao', 'oaaaaaaaaaao', 'oakaaaaakkao', 'oaaaakaaaaao', 'oaaaaaaaakao', 'oooooooooooo', '............']),
  F('glace', 'Glace', 'une glace', 'sucre', 12, ['....oooo....', '...oppppo...', '..opplpppo..', '..oplppppo..', '.opppppppo..', '.oooooooooo.', '..oadadado..', '..oaadadao..', '...odadao...', '...oadado...', '....oado....', '.....oo.....']),
  F('gateau', 'Gâteau', 'du gâteau', 'sucre', 18, ['.....a......', '.....d......', '...oooooo...', '..oppppppo..', '.opplpppppo.', '.oppppppppo.', '.olllllllo..', '.oaaaaaaao..', '.olllllllo..', '.oaaaaaaao..', '.oooooooooo.', '............']),
  F('cookie', 'Cookie', 'un cookie', 'sucre', 10, ['............', '....oooo....', '..ooaaaaoo..', '.oaakaaaaao.', '.oaaaaakaao.', 'oaakaaaaaaao', 'oaaaaakaaaao', 'oakaaaaaakao', '.oaaakaaaao.', '.oaaaaaaaao.', '..ooaaaaoo..', '....oooo....']),
  F('bonbon', 'Bonbon', 'un bonbon', 'sucre', 5, ['............', '............', '............', 'd..oooooo..d', 'dd.oplplo.dd', 'ddoplplplodd', 'ddoplplplodd', 'dd.oplplo.dd', 'd..oooooo..d', '............', '............', '............']),
  F('chocolat', 'Chocolat chaud', 'un chocolat chaud', 'boisson', 12, ['..d...d.....', '...d...d....', '..d...d.....', '.oooooooo...', '.ollllllo...', '.oddddddoooo', '.oddddddo..o', '.oddddddo..o', '.oddddddoooo', '.oddddddo...', '..oooooo....', '............']),
  F('lait', 'Verre de lait', 'un verre de lait', 'boisson', 10, ['............', '..oooooooo..', '..o......o..', '..oddddddo..', '..ollllllo..', '..ollllllo..', '...ollllo...', '...ollllo...', '...ollllo...', '...ollllo...', '...oooooo...', '............']),
  F('pile', 'Pile', 'une pile', 'robot', 20, ['............', '.....oo.....', '...oooooo...', '...oddddo...', '...oaaaao...', '...oaaaao...', '...oadaao...', '...oaddao...', '...oadaao...', '...oaaaao...', '...oddddo...', '...oooooo...']),
  F('octet', 'Octet croustillant', 'un octet croustillant', 'robot', 8, ['............', '.oooooooooo.', '.oaaaaaaaao.', '.oakaakkako.', '.oaaaaaaaao.', '.oakkakaako.', '.oaaaaaaaao.', '.oakaakkako.', '.oaaaaaaaao.', '.oakkakakao.', '.oaaaaaaaao.', '.oooooooooo.']),
  F('prise', 'Électricité', 'de l’électricité', 'robot', 30, ['..o..o......', '..o..o....a.', '.oooooo..aa.', '.ollllo.aa..', '.ollllo.aaaa', '.ollllo...a.', '..ollo...a..', '...dd...a...', '...dd.......', '....dd......', '.....ddd....', '.......ddd..']),
  F('cookie-web', 'Accepter les cookies', 'un cookie « accepter les cookies »', 'robot', 3, ['............', '...oooo.....', '.ooaaaaoo...', '.oakaaaaao..', 'oaaaaakaaao.', 'oakaaaoaaao.', 'oaaaaaooaao.', 'oaakaaoloao.', '.oaaaaollo..', '.oakaaolllo.', '..oooaollllo', '......oolloo']),
];
const BY = Object.fromEntries(FOODS.map(f => [f.id, f]));
const CATS = [['fruit', 'Fruits'], ['legume', 'Légumes'], ['plat', 'Plats'], ['sucre', 'Sucreries'], ['boisson', 'Boissons'], ['robot', 'Pour robots']];
const REACTIONS = { prefere: 'Son plat préféré !', aime: 'Il adore !', miam: 'Miam !', beurk: 'Beurk… mais il l’a mangé.', refuse: 'Il n’en veut pas.',
  plein: 'Il n’a plus faim.', eclate: 'Il a trop mangé !', sucre: 'Trop de sucre !', legume: 'Fort comme un robot !', robot: 'Recharge !' };
const HINT_GAP = 20 * 60000;                          // at most one hint every 20 min (scenes and events together)

/* colours: a theme's (persona.js D.col: fg, acc, pink, dim, hi, bg) for the sprite's letters */
const rgb = h => { const s = String(h || '#000').replace('#', ''), f = s.length === 3 ? s.split('').map(c => c + c).join('') : s.padEnd(6, '0'); return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16) || 0); };
const lum = h => { const [r, g, b] = rgb(h); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
const mix = (a, b, k) => '#' + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * k).toString(16).padStart(2, '0')).join('');
function colours(col) {
  const light = lum(col.bg) > 0.5, a = col.acc === col.fg ? mix(col.dim, col.bg, 0.45) : col.acc;   // LCD: its accent is its ink, a fill needs its own tone
  return { o: col.fg, a, p: col.pink, d: col.dim, l: light ? col.bg : col.hi, k: light ? col.fg : col.bg };
}
const theme = c => ({ fg: c.fg, acc: c.accent || c.fg, pink: c.pink || c.accent || c.fg, dim: c.dim || c.fg, hi: c.hi || c.fg, bg: c.bg });   // themes.js c -> col

/* a sprite as a 12 x 12 canvas, cached; bite 1 and 2: a round bite taken from its left side (he eats it from there) */
const cache = new Map(), BITE = [0, 4.6, 8.4];
function sprite(id, col, bite = 0) {
  const f = BY[id]; if (!f || typeof document === 'undefined' || !document.createElement) return null;
  const b = Math.max(0, Math.min(2, bite | 0)), key = `${id}|${b}|${col.fg}|${col.acc}|${col.pink}|${col.dim}|${col.hi}|${col.bg}`;
  let c = cache.get(key); if (c) return c;
  c = document.createElement('canvas'); c.width = 12; c.height = 12;
  const g = c.getContext('2d'), P = colours(col);
  f.art.forEach((row, y) => {
    for (let x = 0; x < 12; x++) {
      const ch = row[x]; if (!P[ch]) continue;
      if (b) { const d = Math.hypot(x + 1, y - 5.5); if (d < BITE[b] || (d < BITE[b] + 1.2 && (x + y) % 2)) continue; }   // teeth marks on the edge
      g.fillStyle = P[ch]; g.fillRect(x, y, 1, 1);
    }
  });
  if (cache.size > 800) cache.clear();
  cache.set(key, c); return c;
}
function draw(g, id, x, y, px, col, bite) {           // its top left corner at x, y; px: one sprite pixel, in g's units
  const c = sprite(id, col, bite); if (!c) return;
  const s0 = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false; g.drawImage(c, x, y, 12 * px, 12 * px); g.imageSmoothingEnabled = s0;
}

/* his belly, as the server last said it (web/nourrir.js calls set() with the snapshot's "nourrir") */
const st = { known: false, on: false, ventre: 100, faim: 0, gouts: { aime: [], deteste: [], prefere: '' } };
const store = { get() { try { return JSON.parse(localStorage.getItem('pixel.nourrir') || '{}') || {}; } catch { return {}; } }, set(o) { try { localStorage.setItem('pixel.nourrir', JSON.stringify(o)); } catch {} } };
let hintAt = Number(store.get().hint) || 0;
function set(n) {
  if (!n || typeof n !== 'object') { st.known = false; return; }
  const g = n.gouts || {}, ok = a => [].concat(a || []).filter(i => BY[i]);
  Object.assign(st, { known: true, on: !!n.on, ventre: Number.isFinite(+n.ventre) ? +n.ventre : 100, faim: n.faim | 0,
    gouts: { aime: ok(g.aime), deteste: ok(g.deteste), prefere: BY[g.prefere] ? g.prefere : '' } });
}
const errors = [];
function guard(fn) { try { fn(); } catch (e) { errors.push(String((e && e.stack) || e).split('\n').slice(0, 2).join(' ')); if (errors.length > 20) errors.shift(); } }
const mealOf = (h, mn) => { const t = h + mn / 60; return t >= 7 && t < 9.5 ? 'petit-dej' : t >= 12 && t < 13.5 ? 'dejeuner' : t >= 16 && t < 17 ? 'gouter' : t >= 19 && t < 20.5 ? 'diner' : ''; };
function envie() {                                    // what he would like: often his favourite, else something he likes
  const g = st.gouts, r = Math.random();
  if (g.prefere && (r < 0.6 || !g.aime.length)) return g.prefere;
  return g.aime.length ? g.aime[Math.floor(Math.random() * g.aime.length)] : 'pizza';
}
return {
  FOODS, BY, CATS, REACTIONS, colours, theme, sprite, draw, state: st, set, errors, guard, mealOf, envie,
  on: () => st.known && st.on,                        // his hunger is on (known: the server keeps his belly, and persona.js 'faim' gives way)
  hintOk: () => st.known && st.on && Date.now() - hintAt > HINT_GAP,
  hinted() { hintAt = Date.now(); store.set({ ...store.get(), hint: hintAt }); },
  resetHint() { hintAt = 0; store.set({ ...store.get(), hint: 0 }); },   // the lab, tests
  get hintAt() { return hintAt; },
};
})();

(window.PixelScenePacks ||= []).push(({ S, L, pick, sm, out, inn, seg, bump, jumps, clamp, TAU, W, HT, prop }) => {
const PF = window.PixelFoods; if (!PF) return;

/* ---------- small helpers ---------- */
const MO = [48.4, 40];                                // his mouth in the pack's 96 x 54 grid (as web/scenes/toucher.js has it)
const fin = (e, a, b) => 1 - sm(seg(e, a, b)), io = (e, a, b, c, d) => sm(seg(e, a, b)) * fin(e, c, d);
const V = (...ls) => o => { const x = pick(ls); return typeof x === 'function' ? x(o) : x; };   // a slot whose lines may use the data
const food = o => PF.BY[o.plat] || PF.BY.pomme, nomOf = id => (PF.BY[id] || PF.BY.pizza).nom;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1), Nom = o => cap(food(o).nom);
const bites = (t0, gap = 650, n = 3) => Array.from({ length: n }, (_, i) => t0 + i * gap);
const chomp = (e, ts) => ts.reduce((s, t) => s + bump(seg(e, t - 40, t + 240)), 0);
const eat = (e, ts) => { const c = chomp(e, ts); return { sy: 1 - 0.07 * c, sx: 1 + 0.045 * c, y: 5 * c }; };   // a squash at each bite
const burp = (e, o, t) => (o.rot ? -14 * bump(seg(e, t, t + 420)) : 0);
const dish = dflt => o => { if (!PF.BY[o.plat]) o.plat = typeof dflt === 'function' ? dflt() : dflt; };   // played without a meal: his own pick
const px = D => (D.pix ? D.k : D.U), snap = (D, v) => (D.pix ? Math.round(v / D.k) * D.k : v);
const P = (name, fn) => prop(name, (D, ...a) => PF.guard(() => fn(D, ...a)));   // a prop that never stops him, its errors kept for the tests

/* ---------- the props ---------- */
// the food: it flies in from the right to his mouth (T.at), shrinks at each bite (T.bites), or goes away again (T.back: [from, to])
P('nourrirPlat', (D, e, o, T) => {
  const p = px(D), size = 12 * p, mo = D.P(MO[0], MO[1]), list = T.bites || [], n = list.filter(t => e >= t).length;
  if (e >= (T.from || 0) && !(list.length && n >= list.length)) {
    const hx = mo.x + ((T.dx ?? 8.5) - n * 1.4) * D.U, hy = mo.y - 0.5 * D.U;
    const k = out(seg(e, T.from || 0, T.at)), sx = W + size, sy = hy - 70;
    let x = sx + (hx - sx) * k, y = sy + (hy - sy) * k - 46 * bump(k);
    const gone = T.back && e > T.back[0];
    if (gone) { const q = inn(seg(e, T.back[0], T.back[1])); x += (W + size - x) * q; y -= 36 * bump(q); }
    else if (k >= 1) y += Math.sin(e / 130) * 0.5 * D.U;                       // it waits, bobbing a little
    if (n && e - list[n - 1] < 140) y += 0.9 * D.U;                             // the chomp
    PF.draw(D.g, food(o).id, snap(D, x - size / 2), snap(D, y - size / 2), p, D.col, list.length ? Math.min(2, Math.floor(n * 3 / list.length)) : 0);
  }
  for (const t of list) {                                                       // crumbs, at each bite
    const q = (e - t) / 700; if (q < 0 || q >= 1) continue;
    for (let i = 0; i < 6; i++) {
      const a = -0.4 - i * 0.5, v = (2.5 + (i % 3) * 1.6) * D.U, s = Math.max(D.pix ? D.k : 2, 0.8 * D.U);
      const x = mo.x + 3 * D.U + Math.cos(a) * v * q * 1.4, y = mo.y + Math.sin(a) * v * q + 16 * D.U * q * q;
      D.g.globalAlpha = q < 0.7 ? 1 : (1 - q) / 0.3; D.g.fillStyle = i % 2 ? D.col.acc : D.col.dim; D.g.fillRect(snap(D, x - s / 2), snap(D, y - s / 2), s, s);
    }
  }
  D.g.globalAlpha = 1;
});
// his tummy rumbles: shaking lines on both sides of his chin, and the noise
P('nourrirGrr', (D, e, q, big) => {
  const g = D.g, U = D.U, c = D.P(48, 49.5), sh = Math.sin(e / 28) * (big ? 1.2 : 0.7) * U;
  g.globalAlpha = q; g.strokeStyle = D.col.acc; g.lineWidth = D.lw(0.7 * U); g.lineCap = 'round';
  for (const s of [-1, 1]) for (let i = 0; i < (big ? 3 : 2); i++) {
    const x = c.x + s * (12 + i * 3) * U, y = c.y - 2 * U + i * 1.3 * U;
    g.beginPath(); g.moveTo(x + sh, y); g.lineTo(x + s * 2.4 * U + sh, y + 0.8 * U); g.stroke();
  }
  D.glyph(big ? 'GRRROUU…' : 'grrr…', c.x + sh, c.y + 2.2 * U, (big ? 4.6 : 3.8) * U, D.col.acc);
  g.globalAlpha = 1;
});
// a thought bubble with a food in it, up on his right, kept on the screen
P('nourrirPense', (D, id, q) => {
  const g = D.g, U = D.U, p0 = D.P(80, 6), o = { x: Math.min(p0.x, W - 14 - 23 * U), y: Math.max(p0.y, 58 + 22 * U) };
  g.globalAlpha = q; g.fillStyle = D.col.bg; g.strokeStyle = D.col.fg; g.lineWidth = D.lw(Math.max(1.5, 0.45 * U));
  for (const [dx, dy, r] of [[0, 0, 1], [3, -3.5, 1.6]]) { g.beginPath(); g.arc(o.x + dx * U, o.y + dy * U, r * U, 0, TAU); g.fill(); g.stroke(); }
  const bx = o.x + 12 * U, by = o.y - 13.5 * U, p = px(D);
  g.beginPath(); g.ellipse(bx, by, 10.5 * U, 8.5 * U, 0, 0, TAU); g.fill(); g.stroke();
  PF.draw(g, PF.BY[id] ? id : 'pizza', snap(D, bx - 6 * p), snap(D, by - 6 * p), p, D.col, 0);
  g.globalAlpha = 1;
});
// his belly as a gauge under his chin, ten segments (the pink ones: very hungry)
P('nourrirJauge', (D, v, q) => {
  const g = D.g, U = D.U, c = D.P(48, 50.5), w = 30 * U, h = 3 * U, x = c.x - w / 2, y = c.y - h / 2, n = 10, gap = 0.5 * U, sw = (w - gap * (n + 1)) / n;
  const lit = Math.round(clamp(v, 0, 100) / 10);
  g.globalAlpha = q; g.fillStyle = D.col.bg; g.fillRect(x, y, w, h); g.strokeStyle = D.col.fg; g.lineWidth = D.lw(0.5 * U); g.strokeRect(x, y, w, h);
  for (let i = 0; i < n; i++) { g.globalAlpha = q * (i < lit ? 1 : 0.35); g.fillStyle = i < lit ? (lit <= 2 ? D.col.pink : D.col.acc) : D.col.dim; g.fillRect(x + gap + i * (sw + gap), y + gap, sw, h - 2 * gap); }
  g.globalAlpha = 1;
});
// a burp: rings out of his mouth, and the word
P('nourrirRot', (D, e, q) => {
  const g = D.g, U = D.U, mo = D.P(MO[0], MO[1]);
  for (let i = 0; i < 3; i++) { const k = ((e / 500) + i / 3) % 1; g.globalAlpha = q * (1 - k); D.ring(mo.x + (6 + k * 6) * U, mo.y - k * 5 * U, (1 + k * 2.5) * U, D.col.hi, 0.5 * U); }
  g.globalAlpha = q; D.glyph('BURP !', mo.x + 17 * U, mo.y - (7 + 3 * Math.min(1, e / 400)) * U, 5 * U, D.col.acc);
  g.globalAlpha = 1;
});
// a glitch: bright slices across his face, changing ten times a second
P('nourrirGlitch', (D, e, q) => {
  const g = D.g, U = D.U, f = Math.floor(e / 90), hh = Math.max(D.pix ? D.k : 2, 0.8 * U);
  g.globalAlpha = q * 0.85;
  for (let i = 0; i < 4; i++) {
    const r = (f * 37 + i * 53) % 97; if (r > 60) continue;
    const p = D.P(10 + (r * 7) % 60, 8 + (r % 40)); g.fillStyle = i % 2 ? D.col.hi : D.col.acc;
    g.fillRect(snap(D, p.x), snap(D, p.y), Math.max(hh, snap(D, (8 + (r % 20)) * U)), hh);
  }
  g.globalAlpha = 1;
});
// a battery by his side, filling up (lvl 0..1)
P('nourrirBatterie', (D, e, q, lvl) => {
  const g = D.g, U = D.U, p0 = D.P(90, 24), w = 7 * U, h = 13 * U, x = Math.min(p0.x, W - 16 - w), y = clamp(p0.y, 70, HT - 70 - h);
  g.globalAlpha = q; g.fillStyle = D.col.bg; g.fillRect(x, y, w, h); g.strokeStyle = D.col.fg; g.lineWidth = D.lw(0.6 * U); g.strokeRect(x, y, w, h);
  g.fillStyle = D.col.fg; g.fillRect(x + 2 * U, y - 1.4 * U, 3 * U, 1.4 * U);
  const n = 4, lit = Math.ceil(clamp(lvl, 0, 1) * n), sh = (h - U) / n;
  for (let i = 0; i < lit; i++) { g.fillStyle = i === lit - 1 && lvl < 1 && (e % 500) < 250 ? D.col.hi : D.col.acc; g.fillRect(x + U, y + h - (i + 1) * sh, w - 2 * U, sh - 0.8 * U); }
  D.glyph(`${Math.round(clamp(lvl, 0, 1) * 100)} %`, x + w / 2, y + h + 4 * U, 3.4 * U, D.col.fg);
  g.globalAlpha = 1;
});
// the cookie banner of every website: « Cookies ? [ACCEPTER] », the button pressed once he has decided
P('nourrirCookies', (D, q, ok) => {
  const g = D.g, U = D.U, p0 = D.P(84, 6), w = 32 * U, h = 15 * U, x = clamp(p0.x - 4 * U, 8, W - 8 - w), y = clamp(p0.y - 12 * U, 58, HT - 120 - h);
  g.globalAlpha = q; g.fillStyle = D.col.bg; g.fillRect(x, y, w, h); g.strokeStyle = D.col.fg; g.lineWidth = D.lw(0.5 * U); g.strokeRect(x, y, w, h);
  D.glyph('Cookies ?', x + w / 2, y + 4 * U, 3.6 * U, D.col.fg);
  const bw = 22 * U, bh = 5 * U, bx = x + (w - bw) / 2, by = y + h - bh - 1.6 * U;
  g.fillStyle = ok ? D.col.fg : D.col.acc; g.fillRect(bx, by, bw, bh);
  D.glyph(ok ? 'ACCEPTÉ ✓' : 'ACCEPTER', bx + bw / 2, by + bh / 2, 3.2 * U, D.col.bg);
  g.globalAlpha = 1;
});
// a plate under his chin, his fork and knife tapping in turn (« tac tac »)
P('nourrirAssiette', (D, e, q) => {
  const g = D.g, U = D.U, c = D.P(48, 51.5), tap = i => Math.max(0, Math.sin(e / 160 + i * Math.PI)) * 2 * U;
  g.globalAlpha = q; g.fillStyle = D.col.bg; g.strokeStyle = D.col.fg; g.lineWidth = D.lw(0.6 * U);
  g.beginPath(); g.ellipse(c.x, c.y, 13 * U, 2.6 * U, 0, 0, TAU); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(c.x, c.y, 8 * U, 1.4 * U, 0, 0, TAU); g.stroke();
  const fx = c.x - 17 * U, fy = c.y - 10 * U - tap(0), kx = c.x + 17 * U, ky = c.y - 10 * U - tap(1);
  const R = (x, y, w, h) => g.fillRect(snap(D, x), snap(D, y), Math.max(1, snap(D, w)), Math.max(1, snap(D, h)));   // on whole pixels
  g.fillStyle = D.col.fg; R(fx - 0.5 * U, fy + 4 * U, U, 6 * U); R(fx - 2.5 * U, fy + 3 * U, 5 * U, U);   // the fork: its handle, three tines
  for (let j = -1; j <= 1; j++) R(fx + (2 * j - 0.5) * U, fy, U, 3 * U);
  g.fillStyle = D.col.hi; R(kx - U, ky, 2 * U, 5 * U); g.fillStyle = D.col.fg; R(kx - 0.5 * U, ky + 5 * U, U, 5 * U);   // the knife
  for (const [i, x] of [[0, fx], [1, kx]]) if (tap(i) < 0.15 * U && Math.sin(e / 160 + i * Math.PI) > -0.4) D.glyph('tac', x + (i ? 4 : -4) * U, c.y - 2 * U, 3 * U, D.col.dim);
  g.globalAlpha = 1;
});
// a sugar rush: sparkles whirling around him
P('nourrirSucre', (D, e, q) => {
  const c = D.at('c'), U = D.U;
  D.g.globalAlpha = q;
  for (let i = 0; i < 7; i++) { const a = i * TAU / 7 + e / 300, r = (22 + 6 * Math.sin(e / 90 + i)) * U; D.star(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r * 0.55, (1.6 + (i % 2)) * U, i % 3 ? D.col.acc : D.col.pink, a); }
  D.g.globalAlpha = 1;
});
// too full: strain marks all around him
P('nourrirEclate', (D, e, q) => {
  const g = D.g, U = D.U; g.globalAlpha = q; g.strokeStyle = D.col.acc; g.lineWidth = D.lw(0.7 * U); g.lineCap = 'round';
  for (const [u, v, a] of [[20, 12, -2.4], [77, 12, -0.7], [14, 30, 3.14], [83, 30, 0], [20, 47, 2.4], [77, 47, 0.7]]) {
    const p = D.P(u, v), k = (2.4 + 0.9 * Math.sin(e / 70 + u)) * U;
    g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + Math.cos(a) * k, p.y + Math.sin(a) * k); g.stroke();
  }
  g.globalAlpha = 1;
});
// it smells: wavy lines over the food he does not like
P('nourrirBeurk', (D, e, q) => {
  const g = D.g, U = D.U, mo = D.P(MO[0], MO[1]), x0 = mo.x + 8.5 * U, y0 = mo.y - 7 * U;
  g.globalAlpha = q; g.strokeStyle = D.col.dim; g.lineWidth = D.lw(0.6 * U); g.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    for (let j = 0; j <= 6; j++) { const y = y0 - j * 1.4 * U, x = x0 + (i - 1) * 3.4 * U + Math.sin(j * 1.1 + e / 200 + i) * 0.9 * U; if (j) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  }
  g.globalAlpha = 1;
});

/* ---------- a meal: one scene per reaction (web/nourrir.js plays 'nourrir-repas' when the server says he ate) ---------- */
const RX = ['prefere', 'aime', 'beurk', 'refuse', 'plein', 'eclate', 'sucre', 'legume', 'robot'];
const meal = r => ({ on: ['nourrir-repas'], urgent: true, when: d => d.reaction === r });
const MIAM = { at: 700, bites: bites(1300) }, AIME = { at: 650, bites: bites(1200) }, PREF = { at: 800, bites: bites(2500, 550) };
const BEURK = { at: 700, bites: bites(3700, 850) }, REF = { at: 700, back: [3000, 3700] }, PLEIN = { at: 700, back: [3100, 3800] };
const ECL = { at: 650, bites: bites(1100, 600) }, SUC = { at: 600, bites: bites(900, 380) }, LEG = { at: 650, bites: bites(1200) };
const ROB = { at: 700, bites: [1800, 2900, 4000], dx: 9 };
const R1 = { pile: 'Une pile ! Miam !', prise: 'De l’électricité !', octet: 'Un octet croustillant !', 'cookie-web': 'Oh, des cookies !' };
const R2 = { pile: 'Bzzzt… recharge…', prise: 'Bzzz… 220 volts… miam…', octet: 'Crunch… 01101… crunch…', 'cookie-web': 'J’accepte les cookies !' };

S('nourrir-miam', 'Il mange', 'evt', { dur: 5600, on: ['nourrir-repas'], urgent: true, when: d => !RX.includes(d.reaction), anim: [[0, 'curieux'], [600, 'surpris'], [1100, 'parle'], [3200, 'content']], mood: 'content',
  init: dish(() => pick(['pomme', 'croissant', 'soupe', 'fromage', 'banane'])),
  say: [[150, 1100, L('Oh, à manger !', 'C’est pour moi ?', 'Miam ?')], [1300, 3100, L('Miam miam…', 'Scrountch…', 'Mmmh…')], [3300, 4600, L('Miam ! Merci !', 'C’était bon !', 'Merci !')], [4700, 5500, o => (o.rot ? 'Burp ! …pardon.' : null)]],
  move: (e, p, o) => { const m = eat(e, MIAM.bites); return { ...m, y: m.y - 8 * bump(seg(e, 3200, 3700)) + burp(e, o, 4700) }; },
  props: (D, e, p, o) => { D.nourrirPlat(e, o, MIAM); if (o.rot && e > 4700) D.nourrirRot(e - 4700, fin(e, 5200, 5600)); } });
S('nourrir-aime', 'Il adore', 'evt', { dur: 6200, ...meal('aime'), anim: [[0, 'curieux'], [500, 'surpris'], [1000, 'parle'], [3200, 'amoureux']], mood: 'amoureux',
  init: dish(() => PF.state.gouts.aime[0] || 'cookie'),
  say: [[150, 1000, L('Oh ! J’adore ça !', 'Ooh, c’est bon ça !')], [1200, 3000, L('Miam miam…', 'Scrountch, scrountch…')], [3300, 5000, L('Trop bon !', 'J’adore ça !', 'Encore, encore !')], [5100, 6000, o => (o.rot ? 'Burp ! Hihi.' : null)]],
  move: (e, p, o) => { const m = eat(e, AIME.bites); return { ...m, r: 0.05 * Math.sin(e / 260) * io(e, 3200, 3500, 5000, 5500), y: m.y + burp(e, o, 5100) }; },
  props: (D, e, p, o) => { D.nourrirPlat(e, o, AIME); if (e > 3200 && e < 5600) D.hearts(e - 3200, fin(e, 5000, 5600)); if (o.rot && e > 5100) D.nourrirRot(e - 5100, 1); } });
S('nourrir-prefere', 'Son plat préféré', 'evt', { dur: 8000, ...meal('prefere'), anim: [[0, 'surpris'], [350, 'etoiles'], [2300, 'parle'], [4200, 'danse'], [7200, 'content']], mood: 'excite',
  init: dish(() => PF.state.gouts.prefere || 'pizza'),
  say: [[250, 2200, L('Mon plat préféré !!', 'Nooon ! Mon plat préféré !!', 'C’est mon plat préféré !!')], [2400, 4100, o => `${Nom(o)} ! Miam !`], [4300, 7100, L('Merci, merci, merci !', 'Tu es le meilleur !', 'Le plus beau jour de ma vie !')], [7200, 7900, o => (o.rot ? 'Burp !' : null)]],
  move: (e, p, o) => {
    if (e < 2300) return { y: jumps(e, 460, 30) * fin(e, 1900, 2300) };
    if (e < 4200) return eat(e, PREF.bites);
    const k = sm(seg(e, 4200, 4500)) * fin(e, 6800, 7300), d = e - 4200;
    return { y: -18 * Math.abs(Math.sin(d / 240)) * k + burp(e, o, 7200), r: 0.13 * Math.sin(d / 480) * k, x: 34 * Math.sin(d / 960) * k };
  },
  props: (D, e, p, o) => { D.nourrirPlat(e, o, PREF); if (e < 2300) D.hearts(e, 1.2); if (e > 4200 && e < 7300) { D.notes(e); D.stars(e - 4200); } if (o.rot && e > 7200) D.nourrirRot(e - 7200, 1); } });
S('nourrir-beurk', 'Beurk', 'evt', { dur: 7400, ...meal('beurk'), anim: [[0, 'curieux'], [700, 'confus'], [1200, 'boudeur'], [2800, 'timide'], [3500, 'parle'], [5900, 'triste']], mood: 'confus',
  init: dish(() => PF.state.gouts.deteste[0] || 'brocoli'),
  say: [[800, 2600, L('Beurk…', 'Berk ! C’est quoi, ça ?', 'Oh non… pas ça…')], [2800, 3600, L('…bon, d’accord.', '…bon. Pour toi.')], [5900, 7200, L('Pas mon truc.', 'Bof bof.', 'Je préfère autre chose…')]],
  move: e => { const back = io(e, 900, 1300, 2400, 2900), m = e > 3500 ? eat(e, BEURK.bites) : {}; return { ...m, x: -26 * back + 4 * Math.sin(e / 24) * io(e, 900, 1000, 1500, 1700), r: -0.07 * back }; },
  props: (D, e, p, o) => { D.nourrirPlat(e, o, BEURK); if (e > 800 && e < 3000) D.nourrirBeurk(e, io(e, 800, 1100, 2600, 3000)); } });
S('nourrir-refuse', 'Il refuse', 'evt', { dur: 5800, ...meal('refuse'), anim: [[0, 'curieux'], [700, 'boudeur'], [4500, 'content']], mood: 'fache',
  init: dish(() => PF.state.gouts.deteste[0] || 'brocoli'),
  say: [[800, 2900, L('Non. Pas ça.', 'Hors de question !', 'Même pas en rêve.', 'Beurk. Non merci.')], [3100, 4400, L('Rapporte ça.', 'Pfff.', 'Je boude.')], [4600, 5600, L('Bon… autre chose ?', 'Tu as autre chose ?')]],
  move: e => { const k = io(e, 800, 1100, 4100, 4600); return { f: k > 0.5, x: 44 * k, r: -0.05 * k, y: -6 * k }; },
  props: (D, e, p, o) => D.nourrirPlat(e, o, REF) });
S('nourrir-plein', 'Plus faim', 'evt', { dur: 5800, ...meal('plein'), anim: [[0, 'content'], [700, 'timide'], [3500, 'content']], mood: 'content',
  init: dish(() => pick(['gateau', 'pizza', 'frites'])),
  say: [[500, 2900, L('Merci, mais j’ai plus faim !', 'Oh non merci, je suis plein !', 'J’ai le ventre plein !')], [3000, 5500, L('On garde ça pour plus tard ?', 'Peut-être tout à l’heure ?', 'Je n’ai plus de place !')]],
  move: e => ({ x: 9 * Math.sin(e / 85) * io(e, 800, 950, 2000, 2300), sx: 1 + 0.05 * io(e, 300, 800, 5000, 5600) }),
  props: (D, e, p, o) => { D.nourrirPlat(e, o, PLEIN); D.nourrirJauge(PF.state.known ? PF.state.ventre : 100, io(e, 400, 800, 5000, 5600)); } });
S('nourrir-eclate', 'Je vais éclater', 'evt', { dur: 7400, ...meal('eclate'), anim: [[0, 'curieux'], [450, 'surpris'], [900, 'parle'], [3000, 'panique'], [6000, 'confus'], [6700, 'content']], mood: 'surpris',
  init: dish('burger'),
  say: [[1000, 2900, L('Miam… scrountch…', 'Encore une bouchée…')], [3200, 5800, L('Je vais éclater !', 'Ouh là… trop mangé !', 'Mon ventre va exploser !')], [6000, 7200, L('BUUURP ! …ça va mieux.', 'BURP ! Pardon !')]],
  move: e => {
    if (e < 3000) return eat(e, ECL.bites);
    const k = sm(seg(e, 3000, 3800)) * fin(e, 6000, 6400), w = 0.025 * Math.sin(e / 55) * k;
    return { sx: 1 + 0.2 * k + w, sy: 1 + 0.12 * k - w, y: -12 * bump(seg(e, 6000, 6450)) };
  },
  props: (D, e, p, o) => { D.nourrirPlat(e, o, ECL); if (e > 3300 && e < 6000) { D.sweat(e); D.nourrirEclate(e, io(e, 3300, 3700, 5600, 6000)); } if (e > 6000) D.nourrirRot(e - 6000, fin(e, 6900, 7400)); } });
S('nourrir-sucre', 'Trop de sucre', 'evt', { dur: 9800, ...meal('sucre'), anim: [[0, 'curieux'], [400, 'surpris'], [800, 'parle'], [2200, 'etoiles'], [3200, 'rire'], [6300, 'fatigue'], [8200, 'idle-somnole'], [9200, 'content']], mood: 'excite',
  init: dish(() => pick(['bonbon', 'cookie', 'gateau', 'glace'])),
  say: [[700, 2100, L('Encore du sucre ? Miam !', 'Sucre, sucre !')], [2500, 4300, L('Wouhouuu !!', 'Je suis une fusée !', 'Ziiiiip !')], [4400, 6100, L('Trop de sucre !!', 'Je peux plus m’arrêter !')], [6500, 8600, L('…je suis tout mou.', '…plus jamais trois sucreries.', '…crash.')], [9100, 9700, L('Ça va mieux.', 'Ouf.')]],
  move: e => {
    if (e < 2300) return eat(e, SUC.bites);
    if (e < 6300) { const k = sm(seg(e, 2300, 2700)) * fin(e, 5800, 6300), d = e - 2300; return { x: 270 * Math.sin(d / 170) * k, y: (-50 + 70 * Math.sin(d / 123)) * k, s: 1 - 0.34 * k, r: 0.35 * Math.sin(d / 85) * k }; }
    const k = sm(seg(e, 6300, 6900)) * fin(e, 8800, 9500); return { y: 26 * k, r: -0.07 * k, sy: 1 - 0.07 * k };
  },
  props: (D, e, p, o) => { D.nourrirPlat(e, o, SUC); if (e > 2300 && e < 6300) D.nourrirSucre(e, io(e, 2300, 2700, 5800, 6300)); if (e > 7000 && e < 8800) D.zzz(e - 7000, 0.7); } });
S('nourrir-legume', 'Fort comme un robot', 'evt', { dur: 6800, ...meal('legume'), anim: [[0, 'curieux'], [500, 'surpris'], [1000, 'parle'], [3300, 'fier'], [6200, 'content']], mood: 'fier',
  init: dish(() => pick(['carotte', 'brocoli'])),
  say: [[1100, 3100, L('Crounch, crounch…', 'Des légumes ? D’accord !', 'Croc, croc…')], [3400, 6200, L('Fort comme un robot !', 'Plein de vitamines !', 'Regarde mes muscles !')], [6250, 6750, o => (o.rot ? 'Burp !' : null)]],
  move: (e, p, o) => { if (e < 3300) return eat(e, LEG.bites); const q = e < 6000 ? Math.max(0, Math.sin(TAU * (e - 3300) / 900)) : 0; return { sy: 1 - 0.14 * q, sx: 1 + 0.08 * q, y: 16 * q + burp(e, o, 6200) }; },
  props: (D, e, p, o) => { D.nourrirPlat(e, o, LEG); if (e > 3400 && e < 6200) D.stars(e - 3400); if (o.rot && e > 6200) D.nourrirRot(e - 6200, 1); } });
S('nourrir-robot', 'Recharge', 'evt', { dur: 7200, ...meal('robot'), anim: [[0, 'curieux'], [700, 'recharge'], [4600, 'succes'], [5800, 'content']], mood: 'content',
  init: dish(() => pick(['pile', 'prise', 'octet', 'cookie-web'])),
  say: [[150, 1500, o => R1[o.plat] || 'Du carburant !'], [1700, 4400, o => R2[o.plat] || 'Bzzzt…'], [4700, 7000, L('100 % ! Merci !', 'Batterie pleine !', 'Je suis rechargé !')]],
  move: e => { const k = io(e, 1400, 1500, 4300, 4500), f = Math.floor(e / 90); return { x: ((f * 7919) % 13 - 6) * k, sx: 1 + 0.05 * (f % 2) * k, y: -10 * bump(seg(e, 4600, 5100)) }; },
  props: (D, e, p, o) => {
    D.nourrirPlat(e, o, ROB);
    if (e > 1400 && e < 4500) D.nourrirGlitch(e, io(e, 1400, 1500, 4300, 4500));
    if (o.plat === 'cookie-web') { if (e > 1500 && e < 4600) D.nourrirCookies(io(e, 1500, 1800, 4200, 4600), e > 2600); }
    else D.nourrirBatterie(e, io(e, 1500, 1900, 6400, 7000), seg(e, 1700, 4600));
  } });

/* ---------- « tu as faim ? » (pixel/nourrir.py command() plays it): he listens to his belly and says how it is ---------- */
function belly() {
  const s = PF.state, v = s.ventre;
  if (!s.known) return 'Tout va bien, merci !';
  if (!s.on) return 'Jamais faim : mes repas sont en pause.';
  return v >= 92 ? 'J’ai le ventre plein !' : v >= 55 ? 'Ça va, merci ! Pas faim.' : v >= 25 ? 'J’ai un petit creux…' : 'J’ai très faim !';
}
S('nourrir-ventre', 'Mon ventre', 'evt', { dur: 5000, anim: [[0, 'reflechit'], [1500, 'content']], mood: 'reflechit',
  say: [[200, 1400, L('Mon ventre ?', 'Voyons voir…', 'Attends, j’écoute…')], [1500, 4800, () => belly()]],
  move: e => ({ y: 6 * io(e, 0, 400, 1200, 1500) }),
  props: (D, e) => D.nourrirJauge(PF.state.known ? PF.state.ventre : 100, io(e, 300, 700, 4400, 5000)) });

/* ---------- the hints: moments of life, gentle, rate-limited (PixelFoods.hintOk: on, 20 min since the last one) ---------- */
const REPAS = { 'petit-dej': 'du petit-déj', dejeuner: 'du déjeuner', gouter: 'du goûter', diner: 'du dîner' };
const wish = o => { PF.hinted(); o.envie = PF.BY[o.envie] ? o.envie : PF.envie(); };
S('nourrir-creux', 'Un petit creux', 'vie', { dur: 7800, w: 6, when: c => !c.night && PF.hintOk() && PF.state.faim === 1, anim: [[0, 'idle-bas'], [1700, 'timide'], [4100, 'idee']], mood: 'ecoute',
  init: wish,
  say: [[1800, 3900, L('J’ai un petit creux…', 'Mon ventre gargouille…', 'Gargl… c’est mon ventre.')], [4200, 7500, V(o => `${cap(nomOf(o.envie))}, peut-être ?`, 'Tu as un petit truc à grignoter ?')]],
  move: e => ({ x: 3 * Math.sin(e / 26) * io(e, 200, 300, 1500, 1700), y: 8 * io(e, 0, 600, 1500, 1900) }),
  props: (D, e, p, o) => { if (e < 1800) D.nourrirGrr(e, io(e, 100, 300, 1500, 1800), false); if (e > 4000 && e < 7600) D.nourrirPense(o.envie, io(e, 4000, 4500, 7100, 7600)); } });
S('nourrir-affame', 'Très faim', 'vie', { dur: 8600, w: 9, when: c => !c.night && PF.hintOk() && PF.state.faim >= 2, anim: [[0, 'surpris'], [600, 'idle-bas'], [1700, 'triste'], [4600, 'idee']], mood: 'triste',
  init: wish,
  say: [[100, 1600, L('GRRROUUU…', 'Gargouilli…')], [1800, 4400, L('J’ai très faim…', 'Mon ventre fait des bruits bizarres…', 'J’ai le ventre tout vide…')], [4700, 8300, V('Tu me donnes un petit quelque chose ?', o => `Et si on mangeait ${nomOf(o.envie)} ?`)]],
  move: e => ({ x: 5 * Math.sin(e / 22) * (io(e, 0, 100, 1300, 1600) + io(e, 2600, 2700, 3100, 3300)), y: 12 * io(e, 600, 1200, 4200, 4700) }),
  props: (D, e, p, o) => { if (e < 1700) D.nourrirGrr(e, io(e, 0, 200, 1300, 1700), true); else if (e > 2600 && e < 3400) D.nourrirGrr(e, io(e, 2600, 2700, 3100, 3400), false); if (e > 4500 && e < 8400) D.nourrirPense(o.envie, io(e, 4500, 5000, 7900, 8400)); } });
S('nourrir-heure', 'On mange quoi ?', 'vie', { dur: 7800, w: 7, when: c => !c.night && PF.hintOk() && !!PF.mealOf(c.h, c.mn) && PF.state.ventre < 75, anim: [[0, 'idee'], [2600, 'curieux'], [5200, 'content']], mood: 'excite',
  init: o => { wish(o); const d = new Date(); o.repas = PF.mealOf(d.getHours(), d.getMinutes()) || 'dejeuner'; },
  say: [[200, 2500, o => `C’est l’heure ${REPAS[o.repas] || 'de manger'} !`], [2700, 5000, L('On mange quoi ?', 'Qu’est-ce qu’on mange ?', 'Il y a quoi au menu ?')], [5300, 7600, V(o => `Moi, je dirais ${nomOf(o.envie)} !`, 'J’ai hâte !', 'Miam, j’y pense déjà !')]],
  move: e => ({ y: jumps(e, 500, 9) * fin(e, 2000, 2500) }),
  props: (D, e, p, o) => { D.nourrirAssiette(e, io(e, 200, 600, 7200, 7800)); if (e > 5200 && e < 7600) D.nourrirPense(o.envie, io(e, 5200, 5600, 7200, 7600)); } });
S('nourrir-gargouille', 'Le ventre gargouille', 'evt', { dur: 5000, on: ['nourrir-faim'], anim: [[0, 'surpris'], [1300, 'timide']], mood: 'surpris',
  init: o => { PF.hinted(); },
  say: [[300, 1500, L('Gargl !', 'Grrrouu !', 'Oh !')], [1600, 4800, o => (o.niveau >= 2 ? pick(['J’ai très faim…', 'Mon ventre gargouille fort !']) : pick(['Oh ! J’ai un petit creux.', 'Tiens, j’ai un petit creux…']))]],
  move: e => ({ x: 4 * Math.sin(e / 24) * io(e, 0, 100, 1000, 1300), y: -10 * bump(seg(e, 0, 400)) }),
  props: (D, e, p, o) => { if (e < 1500) D.nourrirGrr(e, io(e, 0, 150, 1100, 1500), o.niveau >= 2); } });
});
