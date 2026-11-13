// Villes : zone peinte, rues tracées toutes seules, rangées de maisons, noms, habitants.
(function () {
  const T = TERRAIN, SEA = T.SEA / 255, TAU = Math.PI * 2;
  const G = (window.TOWN = {});

  G.rng = function (seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  G.chaikin = function (pts, n = 2) {
    for (let k = 0; k < n; k++) {
      const o = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1]; o.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]); }
      o.push(pts[pts.length - 1]); pts = o;
    }
    return pts;
  };
  G.resample = function (pts, step) {
    const out = [pts[0]]; let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      let [ax, ay] = pts[i - 1]; const [bx, by] = pts[i]; let d = Math.hypot(bx - ax, by - ay);
      while (d > 0 && acc + d >= step) { const t = (step - acc) / d; ax += (bx - ax) * t; ay += (by - ay) * t; out.push([ax, ay]); d = Math.hypot(bx - ax, by - ay); acc = 0; }
      acc += d;
    }
    return out;
  };

  // ---------- zone peinte : une suite de pastilles [x, y, rayon, signe] ; la dernière qui couvre un point décide ----------
  G.bbox = function (town) {
    let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
    for (const s of town.discs) if (s[3] !== -1) { a = Math.min(a, s[0] - s[2]); b = Math.min(b, s[1] - s[2]); c = Math.max(c, s[0] + s[2]); d = Math.max(d, s[1] + s[2]); }
    return (town.bbox = [a, b, c, d]);
  };
  G.inMask = function (town, x, y) {
    const b = town.bbox;
    if (b && (x < b[0] || x > b[2] || y < b[1] || y > b[3])) return false;
    let inside = false;
    for (const d of town.discs) { const dx = x - d[0], dy = y - d[1]; if (dx * dx + dy * dy <= d[2] * d[2]) inside = d[3] !== -1; }
    return inside;
  };
  G.stamp = function (town, x, y, r, sign) {
    const last = town.discs[town.discs.length - 1];
    if (last && last[3] === sign && Math.hypot(last[0] - x, last[1] - y) < r * 0.3) return false;
    town.discs.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10, r, sign]);
    G.bbox(town);
    return true;
  };
  G.near = (town, x, y, pad) => town.discs.some((d) => d[3] !== -1 && Math.hypot(x - d[0], y - d[1]) <= d[2] + pad); // le point touche-t-il la ville, à `pad` près ?

  // ---------- génération : rues d'abord, maisons le long des rues ----------
  const FACADES = ['#f4efe4', '#efe6d2', '#e9dcc0', '#f1e2c4', '#e8cfa6', '#e3b98e', '#d9c7b0', '#cfdde2', '#dfe6d3', '#ecd4cc', '#f6f1e8', '#e6d9c3'];
  const ROOFS = ['#566578', '#5d6b7c', '#4f5d70', '#66727f', '#5a6a80', '#b5553a', '#a94e36', '#c06242', '#b85c3c']; // ardoise surtout, un peu de tuile
  const AWNINGS = ['#c9563c', '#3f6f9e', '#d9a441', '#5f8f6a', '#b0527a', '#e8e0cc'], FLOWERS = ['#e0607a', '#f2c14e', '#b784d6', '#f08a4b', '#f4f1e8', '#d94f4f'];
  G.STREET = 3.2; // largeur d'une rue pavée
  G.FOOT = { eglise: 8.5, halle: 7 }; // place à garder libre autour des grands bâtiments

  G.generate = function (town, ctx) {
    G.bbox(town);
    const rand = G.rng(town.seed || 7), sd = (town.seed || 7) % 10;
    const land = (x, y) => T.heightAtWorld(x, y) >= SEA + 0.012;
    const ok = (x, y) => G.inMask(town, x, y) && land(x, y);
    const empty = { houses: [], runs: [], links: [], decals: [], marks: [], trees: [], props: [], models: [], paths: [], quay: null, cx: 0, cy: 0, meanR: 0, tier: 'Hameau' };

    let sx = 0, sy = 0, sw = 0;
    for (const d of town.discs) if (d[3] !== -1) { const w = d[2] * d[2]; sx += d[0] * w; sy += d[1] * w; sw += w; }
    if (!sw) return empty;
    let cx = sx / sw, cy = sy / sw;
    if (!ok(cx, cy)) {
      let best = null;
      for (const d of town.discs) if (d[3] !== -1 && ok(d[0], d[1])) { const dd = Math.hypot(d[0] - cx, d[1] - cy); if (!best || dd < best[2]) best = [d[0], d[1], dd]; }
      if (!best) return Object.assign(empty, { cx, cy });
      cx = best[0]; cy = best[1];
    }

    // contour vu du centre, et côté mer
    const NA = 48, br = [], wet = [];
    for (let i = 0; i < NA; i++) {
      const a = (i / NA) * TAU, ca = Math.cos(a), sa = Math.sin(a); let r = 0, w = false;
      while (r < 120) { const x = cx + ca * (r + 1.2), y = cy + sa * (r + 1.2); if (!G.inMask(town, x, y)) break; if (!land(x, y)) { w = true; break; } r += 1.2; }
      br.push(r); wet.push(w);
    }
    const bs = br.map((r, i) => Math.min(r, 0.5 * r + 0.25 * (br[(i + NA - 1) % NA] + br[(i + 1) % NA])));
    const bound = (a) => { const f = ((((a % TAU) + TAU) % TAU) / TAU) * NA, i = Math.floor(f), t = f - i; return bs[i % NA] * (1 - t) + bs[(i + 1) % NA] * t; };
    const meanR = bs.reduce((n, r) => n + r, 0) / NA;

    let quay = null;
    if (meanR >= 9) { let bi = -1; for (let i = 0; i < NA; i++) if (wet[i] && (bi < 0 || br[i] < br[bi])) bi = i; if (bi >= 0) { const a = (bi / NA) * TAU; quay = { x: cx + Math.cos(a) * (br[bi] - 1), y: cy + Math.sin(a) * (br[bi] - 1), ang: a, len: 20 }; } }

    // la ville grandit par paliers : croisée de chemins, place, église, parc, halle
    const PL = meanR >= 18 ? 8.4 : meanR >= 11 ? 5.2 : 0;
    const RING = 12.1, maxR = Math.max.apply(null, bs); // rues en anneaux : espacées juste assez pour deux rangées de maisons dos à dos
    const raw = [];
    const loop = (f, fixed) => { const pts = []; for (let i = 0; i <= 96; i++) { const a = (i / 96) * TAU, rr = fixed || f; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } return pts; };
    if (PL) raw.push(loop(0, PL));
    if (meanR >= 12) for (let r = PL + RING; r < maxR - 2.5; r += RING) raw.push(loop(r));
    const nRad = Math.max(3, Math.min(7, Math.round(meanR / 6.5)));
    for (let k = 0; k < nRad; k++) {
      const a0 = (k / nRad) * TAU + sd * 0.37 + (rand() - 0.5) * 0.25, bend = (rand() - 0.5) * 0.5, pts = [];
      for (let t = 0; t <= 8; t++) { const a = a0 + bend * Math.sin((t / 8) * Math.PI) * 0.5, rr = PL + ((Math.max(PL + 1, bound(a) * 0.98) - PL) * t) / 8; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
      raw.push(pts);
    }
    if (quay && PL) raw.push(G.chaikin([[cx + Math.cos(quay.ang) * PL, cy + Math.sin(quay.ang) * PL], [(cx + quay.x) / 2 + (rand() - 0.5) * 4, (cy + quay.y) / 2 + (rand() - 0.5) * 4], [quay.x, quay.y]], 2));

    const reserved = [], decals = [], marks = [], trees = [], props = [], models = [], paths = [];
    const pr = G.rng((town.seed || 7) * 53 + 9), pk = (L) => L[Math.floor(pr() * L.length)]; // tirages à part : le mobilier ne change pas le plan des rues
    const face = (x, y, tx, ty) => Math.atan2(tx - x, ty - y); // rotation Y qui tourne l'avant (+Z) vers un point
    if (PL) {
      const big = PL > 6, R = PL - 1.4;
      reserved.push({ x: cx, y: cy, r: PL - 0.6 }); decals.push({ x: cx, y: cy, r: R, kind: 'place' }); models.push({ kind: 'fontaine', x: cx, y: cy, r: big ? 1.7 : 1.15 });
      const a0 = pr() * TAU;
      if (big) {
        for (let i = 0; i < 5; i++) { const a = a0 + i * 0.52, x = cx + Math.cos(a) * 4.7, y = cy + Math.sin(a) * 4.7; props.push({ kind: 'etal', x, y, rot: face(x, y, cx, cy), tint: pk(AWNINGS) }); if (i % 2 === 0) props.push({ kind: pr() < 0.5 ? 'caisses' : 'tonneau', x: cx + Math.cos(a + 0.26) * 5.6, y: cy + Math.sin(a + 0.26) * 5.6, rot: pr() * TAU }); }
        for (let i = 0; i < 3; i++) { const a = a0 + 3.5 + i * 0.75, x = cx + Math.cos(a) * 4.9, y = cy + Math.sin(a) * 4.9; props.push({ kind: 'banc', x, y, rot: face(x, y, cx, cy) }); }
        for (let i = 0; i < 4; i++) { const a = a0 + 0.4 + (i / 4) * TAU, x = cx + Math.cos(a) * (R - 0.5), y = cy + Math.sin(a) * (R - 0.5); props.push(i % 2 ? { kind: 'fanion', x, y, rot: -a - Math.PI / 2, tint: pk(AWNINGS) } : { kind: 'lampadaire', x, y, rot: face(x, y, cx, cy) }); }
        for (let i = 0; i < 4; i++) { const a = a0 + (i / 4) * TAU + 0.8, x = cx + Math.cos(a) * 3, y = cy + Math.sin(a) * 3; props.push({ kind: 'jardiniere', x, y, rot: a, tint: pk(FLOWERS) }); }
      } else {
        for (let i = 0; i < 2; i++) { const a = a0 + i * Math.PI, x = cx + Math.cos(a) * 2.7, y = cy + Math.sin(a) * 2.7; props.push({ kind: 'banc', x, y, rot: face(x, y, cx, cy) }); }
        for (let i = 0; i < 2; i++) { const a = a0 + 1.57 + i * Math.PI, x = cx + Math.cos(a) * (R - 0.5), y = cy + Math.sin(a) * (R - 0.5); props.push({ kind: 'lampadaire', x, y, rot: face(x, y, cx, cy) }); }
      }
    } else if (ok(cx, cy)) { reserved.push({ x: cx, y: cy, r: 1.6 }); props.push({ kind: 'puits', x: cx + 2.4, y: cy + 1.2, rot: pr() * TAU }); }
    const pa = 2.2 + sd * 0.5;
    if (meanR >= 26) {
      const p = { x: cx + Math.cos(pa) * meanR * 0.4, y: cy + Math.sin(pa) * meanR * 0.4, r: 6.6 };
      if (ok(p.x, p.y)) {
        reserved.push({ x: p.x, y: p.y, r: p.r + 1.6 }); decals.push({ x: p.x, y: p.y, r: p.r, kind: 'parc' });
        const ka = pa + 2.2, bx = p.x + Math.cos(ka + Math.PI) * 2.2, by = p.y + Math.sin(ka + Math.PI) * 2.2, kx = p.x + Math.cos(ka) * 3.2, ky = p.y + Math.sin(ka) * 3.2;
        models.push({ kind: 'bassin', x: bx, y: by, r: 2.3 }, { kind: 'kiosque', x: kx, y: ky, rot: face(kx, ky, p.x, p.y) });
        paths.push([[p.x + Math.cos(ka + 1.57) * p.r, p.y + Math.sin(ka + 1.57) * p.r], [p.x + Math.cos(ka + 1.2) * 1.4, p.y + Math.sin(ka + 1.2) * 1.4], [p.x + Math.cos(ka - 1.2) * 1.4, p.y + Math.sin(ka - 1.2) * 1.4], [p.x + Math.cos(ka - 1.57) * p.r, p.y + Math.sin(ka - 1.57) * p.r]]);
        for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + 0.4, x = p.x + Math.cos(a) * p.r * 0.86, y = p.y + Math.sin(a) * p.r * 0.86; if (Math.abs(Math.sin(a - ka)) > 0.93) continue; trees.push([x, y, 0.25 + pr() * 0.4, i % 4 === 3 ? 'pommier' : 'feuillu']); }
        for (let i = 0; i < 3; i++) { const a = ka + 2.1 + i * 0.9, x = bx + Math.cos(a) * 3.5, y = by + Math.sin(a) * 3.5; if (Math.hypot(x - p.x, y - p.y) < p.r - 0.8) props.push({ kind: 'banc', x, y, rot: face(x, y, bx, by) }); }
        for (let i = 0; i < 6; i++) { const a = pr() * TAU, rr = 1.5 + pr() * (p.r - 2.5); props.push({ kind: 'fleurs', x: p.x + Math.cos(a) * rr, y: p.y + Math.sin(a) * rr, rot: a, tint: pk(FLOWERS) }); }
      }
    }
    if (meanR >= 20) { const a = pa + 2.6, R = G.FOOT.eglise, c = { x: cx + Math.cos(a) * (PL + R + 2.2), y: cy + Math.sin(a) * (PL + R + 2.2), r: R }; if (ok(c.x, c.y)) { reserved.push(c); marks.push({ kind: 'eglise', x: c.x, y: c.y, rot: face(c.x, c.y, cx, cy) }); } }
    if (meanR >= 30) { const a = pa + 4.8, R = G.FOOT.halle, c = { x: cx + Math.cos(a) * (PL + R + 2.2), y: cy + Math.sin(a) * (PL + R + 2.2), r: R }; if (ok(c.x, c.y)) { reserved.push(c); marks.push({ kind: 'halle', x: c.x, y: c.y, rot: face(c.x, c.y, cx, cy) }); } }
    (ctx.monuments || []).forEach((m) => reserved.push({ x: m.x, y: m.y, r: m.r || 6 }));
    const inRes = (x, y, pad) => reserved.some((d) => Math.hypot(x - d.x, y - d.y) < d.r + (pad || 0));

    const runs = [];
    raw.forEach((line) => {
      let run = [];
      G.resample(line, 1.5).forEach((p) => {
        if (ok(p[0], p[1]) && !inRes(p[0], p[1], -1.5) && !ctx.nearRiver(p[0], p[1], 3)) run.push(p);
        else { if (run.length > 4) runs.push(run); run = []; }
      });
      if (run.length > 4) runs.push(run);
    });

    // grille de voisinage pour les rues et les maisons
    const CELL = 4, sHash = new Map(), hHash = new Map(), key = (x, y) => Math.floor(x / CELL) + ',' + Math.floor(y / CELL);
    const put = (m, x, y, v) => { const k = key(x, y), L = m.get(k); if (L) L.push(v); else m.set(k, [v]); };
    const around = (m, x, y, fn) => { const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const L = m.get(gx + i + ',' + (gy + j)); if (L) for (const q of L) if (fn(q)) return true; } return false; };
    runs.forEach((r, ri) => r.forEach((p, pi) => put(sHash, p[0], p[1], [p[0], p[1], ri, pi])));

    // maisons : on longe chaque bord de rue, à pas d'une largeur de maison, pour des rangées serrées même dans les courbes
    const houses = [], D0 = 3.9, OFF = G.STREET / 2 + 0.35 + D0 / 2;
    const walk = (line, step) => { // points espacés de `step` le long d'une ligne, avec la direction locale
      const out = []; let acc = step / 2;
      for (let i = 1; i < line.length; i++) { const ax = line[i - 1][0], ay = line[i - 1][1], dx = line[i][0] - ax, dy = line[i][1] - ay, l = Math.hypot(dx, dy); if (!l) continue; while (acc <= l) { out.push([ax + (dx * acc) / l, ay + (dy * acc) / l, dx / l, dy / l]); acc += step; } acc -= l; }
      return out;
    };
    runs.forEach((run) => {
      for (const side of [-1, 1]) {
        const edge = run.map((p, i) => { const q = run[Math.min(run.length - 1, i + 1)], o = run[Math.max(0, i - 1)], tx = q[0] - o[0], ty = q[1] - o[1], l = Math.hypot(tx, ty) || 1; return [p[0] + (-ty / l) * side * OFF, p[1] + (tx / l) * side * OFF]; });
        walk(edge, 4.78).forEach(([px, py, tx, ty]) => {
          const d = 3.5 + rand() * 0.8, k = rand(), tone = rand(), rf = rand(), wx = px + (-ty * side * (d - D0)) / 2, wy = py + (tx * side * (d - D0)) / 2;
          if (!ok(wx, wy) || inRes(wx, wy, 1.2) || ctx.nearLine(wx, wy)) return;
          if (around(sHash, wx, wy, (q) => Math.hypot(wx - q[0], wy - q[1]) < OFF - 0.8)) return;
          if (around(hHash, wx, wy, (hh) => Math.hypot(wx - hh[0], wy - hh[1]) < 3.85)) return;
          const central = Math.hypot(wx - cx, wy - cy) < meanR * 0.5, ang = Math.atan2(ty, tx), floors = 1 + Math.floor(k * (central ? 3.7 : 2.5));
          put(hHash, wx, wy, [wx, wy]);
          houses.push({ x: wx, y: wy, ang, rot: side > 0 ? Math.PI - ang : -ang, w: 4.75, d, floors, col: FACADES[Math.floor(tone * FACADES.length)], roof: ROOFS[Math.floor(rf * ROOFS.length)], seed: Math.floor(rf * 9973) + houses.length * 131 });
        });
      }
    });

    // carrefours : par où un passant peut changer de rue
    const links = runs.map((r) => r.map(() => null));
    runs.forEach((r, ri) => r.forEach((p, pi) => around(sHash, p[0], p[1], (s) => { if (s[2] !== ri && Math.hypot(p[0] - s[0], p[1] - s[1]) < 2.2) (links[ri][pi] || (links[ri][pi] = [])).push([s[2], s[3]]); return false; })));

    // mobilier : réverbères le long des rues, pots de fleurs et tonneaux devant les façades
    runs.forEach((run, ri) => {
      let side = ri % 2 ? 1 : -1;
      for (let i = 5; i < run.length - 3; i += 10) {
        const a = run[i - 1], b = run[i + 1], tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1; side = -side;
        const x = run[i][0] + (-ty / l) * side * 1.45, y = run[i][1] + (tx / l) * side * 1.45;
        if (!inRes(x, y, 0.4)) props.push({ kind: 'lampadaire', x, y, rot: face(x, y, run[i][0], run[i][1]) });
      }
    });
    houses.forEach((hs) => {
      const r = pr(); if (r > 0.24) return;
      const fx = Math.sin(hs.rot), fy = Math.cos(hs.rot), ax = Math.cos(hs.rot), ay = -Math.sin(hs.rot), s = pr() < 0.5 ? -1.45 : 1.45, f = hs.d / 2 + 0.38;
      const kind = r < 0.12 ? 'jardiniere' : r < 0.17 ? 'tonneau' : r < 0.21 ? 'caisses' : 'banc';
      props.push({ kind, x: hs.x + fx * f + ax * s, y: hs.y + fy * f + ay * s, rot: hs.rot, tint: pk(FLOWERS) });
    });
    // verdure : petits jardins et arbres là où il reste de la place entre les rangées
    const gHash = new Map(), bb = town.bbox, tries = Math.min(700, Math.round(((bb[2] - bb[0]) * (bb[3] - bb[1])) / 9));
    for (let i = 0; i < tries; i++) {
      const x = bb[0] + pr() * (bb[2] - bb[0]), y = bb[1] + pr() * (bb[3] - bb[1]), r = pr();
      if (!ok(x, y) || inRes(x, y, 0.6) || ctx.nearLine(x, y)) continue;
      if (around(sHash, x, y, (q) => Math.hypot(x - q[0], y - q[1]) < 3.3) || around(hHash, x, y, (q) => Math.hypot(x - q[0], y - q[1]) < 3.9) || around(gHash, x, y, (q) => Math.hypot(x - q[0], y - q[1]) < 3)) continue;
      put(gHash, x, y, [x, y]); trees.push([x, y, r, r < 0.45 ? 'pommier' : r < 0.7 ? 'jardin' : 'buisson']);
    }

    const n = houses.length, tier = n < 12 ? 'Hameau' : n < 40 ? 'Village' : n < 90 ? 'Bourg' : 'Ville';
    return { houses, runs, links, decals, marks, trees, props, models, paths, quay, cx, cy, meanR, tier };
  };

  // ---------- noms de villes et d'habitants ----------
  const pick = (rand, L) => L[Math.floor(rand() * L.length)];
  const NA1 = ['Havre', 'Port', 'Roche', 'Brise', 'Cendre', 'Morne', 'Val', 'Pierre', 'Fond', 'Lande', 'Anse', 'Pointe', 'Baie', 'Sel'];
  const NA2 = ['Gris', 'Vieux', 'Lame', 'Brume', 'Écume', 'Noir', 'Rouge', 'Blanc', 'sur-Mer', 'aux-Cendres', 'le-Haut', 'du-Phare', 'des-Brumes'];
  const NK1 = ['Ker', 'Tre', 'Lan', 'Pen', 'Plou'], NK2 = ['hold', 'mor', 'vel', 'gan', 'nec', 'zel', 'ven', 'douar'];
  G.townName = function (rand, taken) {
    for (let i = 0; i < 40; i++) { const n = rand() < 0.3 ? pick(rand, NK1) + pick(rand, NK2) : pick(rand, NA1) + '-' + pick(rand, NA2); if (!taken.has(n.toLowerCase())) return n; }
    return 'Bourg-' + Math.floor(rand() * 900 + 100);
  };
  const FIRST = [['Maren', 'f'], ['Tobias', 'm'], ['Ilse', 'f'], ['Corwin', 'm'], ['Brune', 'f'], ['Aldric', 'm'], ['Solène', 'f'], ['Yann', 'm'], ['Odile', 'f'], ['Garance', 'f'], ['Loïc', 'm'], ['Maëlle', 'f'], ['Evrard', 'm'], ['Nolwenn', 'f'], ['Tristan', 'm'], ['Sibylle', 'f'], ['Gaël', 'm'], ['Azenor', 'f'], ['Hoel', 'm'], ['Perrine', 'f'], ['Malo', 'm'], ['Enora', 'f']];
  const LAST = ['Holt', 'Kerven', 'Morvan', 'Brisac', 'Tallec', 'Guern', 'Rozec', 'Calloc', 'Dantec', 'Madec', 'Penhoat', 'Trevidic', 'Le Sel', 'Bihan', 'Cadiou', 'Floch'];
  const JOBS = [['pêcheur', 'pêcheuse'], ['boulanger', 'boulangère'], ['forgeron', 'forgeronne'], ['aubergiste', 'aubergiste'], ['charpentier', 'charpentière'], ['tisserand', 'tisserande'], ['meunier', 'meunière'], ['herboriste', 'herboriste'], ['marchand', 'marchande'], ['passeur', 'passeuse'], ['scribe', 'scribe'], ['cartographe', 'cartographe'], ['saunier', 'saunière'], ['guetteur', 'guetteuse'], ['cordier', 'cordière']];
  G.person = function (rand, taken) { // `taken` : noms déjà portés ; on évite aussi de redonner un prénom tant qu'il en reste
    const firsts = new Set([...taken].map((n) => n.split(' ')[0]));
    for (let i = 0; i < 60; i++) {
      const f = pick(rand, FIRST), name = f[0] + ' ' + pick(rand, LAST);
      if (i < 40 && firsts.has(f[0].toLowerCase())) continue;
      if (!taken.has(name.toLowerCase())) return { name, job: pick(rand, JOBS)[f[1] === 'f' ? 1 : 0] };
    }
    return { name: 'Habitant ' + Math.floor(rand() * 900 + 100), job: '' };
  };

  // rivière : descend la pente jusqu'à la mer
  G.riverPath = function (from) {
    let x = from[0], y = from[1], dir = null; const pts = [[x, y]];
    for (let i = 0; i < 300; i++) {
      let best = null;
      for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU, dx = Math.cos(a), dy = Math.sin(a); if (dir && dx * dir[0] + dy * dir[1] < -0.1) continue; const hh = T.heightAtWorld(x + dx * 7, y + dy * 7); if (!best || hh < best.h) best = { h: hh, dx, dy }; }
      x += best.dx * 4; y += best.dy * 4; dir = [best.dx, best.dy]; pts.push([x, y]);
      if (x < 0 || y < 0 || x > T.WW || y > T.WH || T.heightAtWorld(x, y) < SEA - 0.03) break;
    }
    return G.chaikin(pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1), 2);
  };
})();
