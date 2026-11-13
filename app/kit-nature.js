// Kit nature : arbres, arbustes, cultures, rochers et touffes, façon maquette peinte à la main.
// Tout est géométrie + couleurs de sommet (ombrage cuit), en lots InstancedMesh : 12 appels de dessin au plus.
// Couleur d'exemplaire détournée : pour les arbres elle porte (ton, variante de fleur, éclat), pour les rochers
// (forme, éclat, lichen) ; pour les cultures et touffes c'est une vraie teinte, masquée par sommet.
(function () {
  const L = (h) => LOOK.lin(h);
  const TAU = Math.PI * 2;

  // ---------- hasard ----------
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const hash = (x, z, k) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mixC = (a, b, t) => [a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t];
  const ramp = (p, t) => (t < 0.5 ? mixC(p[0], p[1], t * 2) : mixC(p[1], p[2], t * 2 - 1)); // sombre → moyen → clair
  const pal = (a, b, c) => [L(a), L(b), L(c)];
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

  // ---------- assembleur de maillage ----------
  // Chaque sommet : position, normale, couleur (linéaire), aFx = (masque feuillage, poids du vent, masque fleur), aPart (variante).
  function Builder() { this.p = []; this.n = []; this.c = []; this.f = []; this.a = []; this.i = []; this.parts = false; }
  Builder.prototype.v = function (p, n, c, f, part) {
    this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.c.push(c[0], c[1], c[2]);
    this.f.push(f ? f[0] : 0, f ? f[1] : 0, f ? f[2] : 0); this.a.push(part || 0); return this.p.length / 3 - 1;
  };
  Builder.prototype.t = function (a, b, c) { this.i.push(a, b, c); };
  // Normales lissées, pondérées par l'aire, pour les sommets ajoutés depuis `v0` (formes sans normale explicite).
  Builder.prototype.autoNormals = function (v0, i0) {
    const P = this.p, N = this.n;
    for (let k = v0 * 3; k < N.length; k++) N[k] = 0;
    for (let k = i0; k < this.i.length; k += 3) {
      const a = this.i[k], b = this.i[k + 1], c = this.i[k + 2];
      const pa = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], pb = [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]], pc = [P[c * 3], P[c * 3 + 1], P[c * 3 + 2]];
      const fn = cross(sub(pb, pa), sub(pc, pa));
      for (const v of [a, b, c]) { N[v * 3] += fn[0]; N[v * 3 + 1] += fn[1]; N[v * 3 + 2] += fn[2]; }
    }
    for (let v = v0; v < N.length / 3; v++) { const n = norm([N[v * 3], N[v * 3 + 1], N[v * 3 + 2]]); N[v * 3] = n[0]; N[v * 3 + 1] = n[1]; N[v * 3 + 2] = n[2]; }
  };
  Builder.prototype.build = function () {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aFx', new THREE.Float32BufferAttribute(this.f, 3));
    if (this.parts) g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.a, 1));
    g.setIndex(this.i); g.computeBoundingSphere();
    g.userData.tris = this.i.length / 3;
    return g;
  };

  // Icosaèdre indexé (12 sommets, 20 faces), orienté vers l'extérieur ; `sub` le subdivise une fois (42 / 80).
  function ico(subdiv) {
    const t = (1 + Math.sqrt(5)) / 2;
    let V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm);
    let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    if (subdiv) {
      const cache = {}, mid = (a, b) => { const k = a < b ? a + '_' + b : b + '_' + a; if (cache[k] == null) { cache[k] = V.length; V.push(norm([(V[a][0] + V[b][0]) / 2, (V[a][1] + V[b][1]) / 2, (V[a][2] + V[b][2]) / 2])); } return cache[k]; };
      const F2 = [];
      F.forEach(([a, b, c]) => { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); F2.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); });
      F = F2;
    }
    F = F.map(([a, b, c]) => { const n = cross(sub(V[b], V[a]), sub(V[c], V[a])), m = [V[a][0] + V[b][0] + V[c][0], V[a][1] + V[b][1] + V[c][1], V[a][2] + V[b][2] + V[c][2]]; return n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0 ? [a, c, b] : [a, b, c]; });
    return { V, F };
  }
  const ICO0 = ico(0), ICO1 = ico(1);

  // ---------- pièces d'arbre ----------
  // Un lobe de feuillage : icosaèdre bosselé. La normale penche vers celle de la couronne entière (volume doux et
  // cohérent), la couleur dépend de la hauteur dans la couronne, de l'orientation et de la profondeur (creux sombres).
  function lobe(B, o) {
    const R = o.rnd, C = o.cc, CR = o.cr, H = o.H, first = B.p.length / 3;
    const ry = R() * TAU, rx = (R() - 0.5) * 0.8, cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
    ICO0.V.forEach((dd) => {
      const d1 = [dd[0], dd[1] * cx - dd[2] * sx, dd[1] * sx + dd[2] * cx], d0 = [d1[0] * cy + d1[2] * sy, d1[1], -d1[0] * sy + d1[2] * cy];
      const k = 1 + (R() - 0.5) * 2 * (o.jit == null ? 0.16 : o.jit);
      const d = [d0[0], d0[1] < 0 ? d0[1] * (o.flat == null ? 0.72 : o.flat) : d0[1], d0[2]];
      const p = [o.c[0] + d[0] * o.r[0] * k, o.c[1] + d[1] * o.r[1] * k, o.c[2] + d[2] * o.r[2] * k];
      const rel = [(p[0] - C[0]) / CR[0], (p[1] - C[1]) / CR[1], (p[2] - C[2]) / CR[2]];
      const depth = Math.hypot(rel[0], rel[1], rel[2]);
      const nl = norm([d0[0] / o.r[0], d0[1] / o.r[1], d0[2] / o.r[2]]), nc = norm(rel), bl = o.blend == null ? 0.6 : o.blend;
      const n = norm([nl[0] * (1 - bl) + nc[0] * bl, nl[1] * (1 - bl) + nc[1] * bl + 0.12, nl[2] * (1 - bl) + nc[2] * bl]);
      const h = clamp((p[1] - (C[1] - CR[1])) / (2 * CR[1]), 0, 1);
      let s = clamp(0.02 + 0.42 * h + 0.22 * n[1] + 0.55 * (depth - 0.72) + (R() - 0.5) * 0.16, 0, 1);
      const wind = (o.wind || 0.12) * Math.pow(p[1] / H, 2);
      B.v(p, n, ramp(o.pal, s), [1, wind, o.flowers && n[1] > 0.0 && R() < o.flowers ? 1 : 0]);
    });
    ICO0.F.forEach(([a, b, c]) => B.t(first + a, first + b, first + c));
  }

  // Tube effilé le long d'un chemin (tronc, branche) : anneaux de `n` côtés, sans bouchons.
  function tube(B, pts, radii, n, o) {
    const R = o.rnd, first = B.p.length / 3;
    pts.forEach((p, j) => {
      const q = pts[Math.min(j + 1, pts.length - 1)], pr = pts[Math.max(j - 1, 0)], ax = norm(sub(q, pr));
      let u = norm(cross(ax, Math.abs(ax[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])); const w = cross(ax, u);
      const along = j / (pts.length - 1);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + (o.twist || 0), ca = Math.cos(a), sa = Math.sin(a), r = radii[j] * (1 + (R() - 0.5) * 0.12);
        const nn = [u[0] * ca + w[0] * sa, u[1] * ca + w[1] * sa, u[2] * ca + w[2] * sa];
        const sh = clamp(0.35 + 0.35 * along + 0.25 * nn[1] + (R() - 0.5) * 0.25, 0, 1);
        B.v([p[0] + nn[0] * r, p[1] + nn[1] * r, p[2] + nn[2] * r], nn, ramp(o.pal, sh), [0, (o.wind || 0) * Math.pow(p[1] / o.H, 2), 0]);
      }
    });
    for (let j = 0; j < pts.length - 1; j++) for (let k = 0; k < n; k++) {
      const a = first + j * n + k, b = first + j * n + ((k + 1) % n), c = a + n, d = b + n;
      B.t(a, b, d); B.t(a, d, c);
    }
  }

  // Étage de sapin : cône à bord étoilé (pointes de branches tombantes) + dessous creux.
  function tier(B, y0, h, r, n, o) {
    const R = o.rnd, first = B.p.length / 3, sway = (y) => (o.wind || 0.1) * Math.pow(y / o.H, 2);
    const ax = (R() - 0.5) * 0.15, az = (R() - 0.5) * 0.15;
    B.v([ax, y0 + h, az], [0, 1, 0], ramp(o.pal, 0.75), [1, sway(y0 + h), 0]);
    const rot = R() * TAU;
    for (let k = 0; k < n * 2; k++) {
      const a = rot + (k / (n * 2)) * TAU, tip = k % 2 === 0, rr = r * (tip ? 1 + (R() - 0.5) * 0.2 : 0.62), y = y0 + (tip ? -0.12 * h : 0.12 * h);
      const nn = norm([Math.cos(a) * 0.8, 0.75, Math.sin(a) * 0.8]);
      B.v([Math.cos(a) * rr, y, Math.sin(a) * rr], nn, ramp(o.pal, clamp((tip ? 0.62 : 0.3) + (R() - 0.5) * 0.15 + o.lift, 0, 1)), [1, sway(y), 0]);
    }
    const ci = B.v([0, y0 + 0.3 * h, 0], [0, -1, 0], ramp(o.pal, 0.02), [1, sway(y0), 0]);
    for (let k = 0; k < n * 2; k++) {
      const a = first + 1 + k, b = first + 1 + ((k + 1) % (n * 2));
      B.t(first, b, a); B.t(ci, a, b);
    }
  }

  // Petits points (fruits, fleurs) : tétraèdres posés à la surface d'un ellipsoïde de couronne.
  function specks(B, count, C, Rr, o) {
    const R = o.rnd;
    for (let s = 0; s < count; s++) {
      const a = R() * TAU, e = 0.15 + R() * 0.9, d = [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)];
      const c = [C[0] + d[0] * Rr[0] * 1.02, C[1] + d[1] * Rr[1] * 1.02, C[2] + d[2] * Rr[2] * 1.02], sz = o.size, g = 0.85 + R() * 0.15;
      const first = B.p.length / 3, wind = (o.wind || 0.1) * Math.pow(c[1] / o.H, 2);
      [[0, 1.2, 0], [1, -0.4, 0.2], [-0.5, -0.4, 0.9], [-0.5, -0.4, -0.9]].forEach((q) => B.v([c[0] + q[0] * sz, c[1] + q[1] * sz, c[2] + q[2] * sz], norm([d[0] + q[0] * 0.5, d[1] + q[1] * 0.5 + 0.4, d[2] + q[2] * 0.5]), [g, g, g], [0, wind, 1]));
      B.t(first, first + 2, first + 1); B.t(first, first + 3, first + 2); B.t(first, first + 1, first + 3); B.t(first + 1, first + 2, first + 3);
    }
  }

  // ---------- espèces ----------
  const BARK = pal('#3b2c22', '#5d4635', '#8a705a');
  function makeFeuillu() { // chêne / châtaignier : tronc visible, couronne ronde de 8 lobes
    const B = new Builder(), R = rng(11), H = 8.5, cc = [0, 5.9, 0], cr = [3.4, 2.7, 3.4];
    const P = pal('#16290f', '#355a1e', '#7a9a3a');
    tube(B, [[0, 0, 0], [0.12, 2.2, 0.05], [0.05, 4.2, -0.05]], [0.42, 0.3, 0.22], 6, { rnd: R, pal: BARK, H, wind: 0.02 });
    const lobes = [[0.2, 7.05, -0.1, 2.05]];
    for (let k = 0; k < 5; k++) { const a = k * TAU / 5 + (R() - 0.5) * 0.5, d = 1.85 + R() * 0.35; lobes.push([Math.cos(a) * d, 5.3 + R() * 1.1, Math.sin(a) * d, 1.55 + R() * 0.35]); }
    lobes.push([0.9, 7.2, 1.2, 1.35], [-1.6, 4.45, 0.4, 1.25]);
    lobes.slice(1, 4).forEach((l) => tube(B, [[0.05, 3.7, 0], [l[0] * 0.7, l[2] * 0 + l[1] - 0.4, l[2] * 0.7]], [0.16, 0.08], 4, { rnd: R, pal: BARK, H, wind: 0.05 }));
    lobes.forEach((l) => lobe(B, { rnd: R, c: [l[0], l[1], l[2]], r: [l[3], l[3] * 0.86, l[3]], cc, cr, H, pal: P, wind: 0.14 }));
    return B.build();
  }
  function makePin() { // pin maritime : long fût penché et nu, couronne aplatie en plateaux
    const B = new Builder(), R = rng(23), H = 10;
    const P = pal('#16291c', '#2f4f2c', '#6a8a48');
    const bark = pal('#3a2420', '#6e4430', '#a06a48');
    tube(B, [[0, 0, 0], [0.25, 3.6, 0], [0.85, 7.0, 0.1]], [0.34, 0.24, 0.16], 6, { rnd: R, pal: bark, H, wind: 0.03 });
    const cc = [1.0, 8.4, 0.1], cr = [3.4, 1.5, 3.1];
    const L5 = [[1.0, 9.0, 0.1, 2.2, 0.85, 2.0], [2.7, 8.4, -0.9, 1.5, 0.7, 1.4], [-0.6, 8.5, 0.9, 1.5, 0.7, 1.35], [0.3, 7.75, -1.5, 1.35, 0.6, 1.25], [2.4, 7.8, 1.5, 1.25, 0.6, 1.15], [-0.9, 7.7, -0.6, 1.1, 0.55, 1.0], [1.4, 9.55, 1.0, 1.1, 0.5, 1.0]];
    L5.slice(1).forEach((l) => tube(B, [[0.8, 6.9, 0.1], [l[0] * 0.8 + 0.15, l[1] - 0.2, l[2] * 0.8]], [0.11, 0.06], 3, { rnd: R, pal: bark, H, wind: 0.06 }));
    L5.forEach((l) => lobe(B, { rnd: R, c: [l[0], l[1], l[2]], r: [l[3], l[4] * 1.25, l[5]], cc, cr, H, pal: P, wind: 0.16, flat: 0.55, jit: 0.2 }));
    return B.build();
  }
  function makeSapin() { // variante dense, façon sapin : étages étoilés
    const B = new Builder(), R = rng(31), H = 10;
    const P = pal('#14291f', '#2a4f36', '#62875a');
    tube(B, [[0, 0, 0], [0, 2.2, 0]], [0.3, 0.22], 5, { rnd: R, pal: BARK, H });
    const T = [[1.4, 2.6, 3.0], [3.0, 2.4, 2.5], [4.6, 2.2, 2.0], [6.1, 2.1, 1.5], [7.5, 2.5, 0.95]];
    T.forEach((t, i) => tier(B, t[0], t[1], t[2], 6, { rnd: R, pal: P, H, wind: 0.1, lift: i * 0.04 }));
    return B.build();
  }
  function makePeuplier() { // peuplier d'Italie : colonne étroite
    const B = new Builder(), R = rng(47), H = 12, cc = [0, 7, 0], cr = [1.5, 5.2, 1.5];
    const P = pal('#24401a', '#4f7a2e', '#a3b655');
    tube(B, [[0, 0, 0], [0, 3.5, 0]], [0.3, 0.2], 5, { rnd: R, pal: pal('#4a463c', '#77705f', '#a49d88'), H });
    const L6 = [[0, 3.4, 0, 1.15, 1.3], [0.35, 5.0, 0.15, 1.3, 1.6], [-0.3, 6.7, -0.1, 1.3, 1.6], [0.2, 8.4, -0.2, 1.15, 1.55], [-0.1, 9.9, 0.15, 0.9, 1.4], [0.05, 11.2, 0, 0.55, 0.9]];
    L6.forEach((l) => lobe(B, { rnd: R, c: [l[0], l[1], l[2]], r: [l[3], l[4], l[3] * 0.95], cc, cr, H, pal: P, wind: 0.2, blend: 0.45, flat: 0.9 }));
    return B.build();
  }
  function makePommier() { // pommier de verger : tronc court, couronne basse, fruits ou fleurs
    const B = new Builder(), R = rng(59), H = 4.5, cc = [0, 3.0, 0], cr = [2.3, 1.5, 2.3];
    const P = pal('#223c18', '#4a7028', '#97b04c');
    tube(B, [[0, 0, 0], [0.1, 1.0, 0], [0, 1.6, 0.05]], [0.22, 0.17, 0.14], 5, { rnd: R, pal: BARK, H });
    const L6 = [[0.1, 3.55, 0, 1.25]];
    for (let k = 0; k < 4; k++) { const a = k * TAU / 4 + 0.4 + (R() - 0.5) * 0.4; L6.push([Math.cos(a) * 1.25, 2.75 + R() * 0.35, Math.sin(a) * 1.25, 1.0 + R() * 0.2]); }
    L6.slice(1, 4).forEach((l) => tube(B, [[0, 1.5, 0.05], [l[0] * 0.75, l[1] - 0.3, l[2] * 0.75]], [0.1, 0.05], 3, { rnd: R, pal: BARK, H, wind: 0.04 }));
    L6.forEach((l) => lobe(B, { rnd: R, c: [l[0], l[1], l[2]], r: [l[3], l[3] * 0.82, l[3]], cc, cr, H, pal: P, wind: 0.08 }));
    specks(B, 12, [0, 3.0, 0], [2.0, 1.25, 2.0], { rnd: R, size: 0.12, H, wind: 0.08 });
    return B.build();
  }
  function makeBuisson() { // ajonc / bruyère : trois coussins, taches de fleurs
    const B = new Builder(), R = rng(71), H = 1.6, cc = [0, 0.75, 0], cr = [1.3, 0.85, 1.1];
    const P = pal('#1a2c14', '#36532a', '#6f8a40');
    [[0.15, 0.8, 0, 0.8], [-0.55, 0.55, 0.3, 0.62], [0.45, 0.5, -0.45, 0.58]].forEach((l) => lobe(B, { rnd: R, c: [l[0], l[1], l[2]], r: [l[3], l[3] * 0.85, l[3]], cc, cr, H, pal: P, wind: 0.05, flowers: 0.75, jit: 0.25 }));
    return B.build();
  }
  function makeRoseau() { // touffe de roseaux : lames fines et plumets bruns (double face)
    const B = new Builder(), R = rng(83), H = 1.8;
    const P = pal('#4d6a2a', '#88a04a', '#c9c27a');
    for (let k = 0; k < 13; k++) {
      const a = R() * TAU, d = R() * 0.3, bx = Math.cos(a) * d, bz = Math.sin(a) * d, lean = 0.15 + R() * 0.45, h = 1.0 + R() * 0.75;
      const tx = bx + Math.cos(a) * lean, tz = bz + Math.sin(a) * lean, w = 0.06, pa = a + Math.PI / 2;
      const f = B.v([bx + Math.cos(pa) * w, 0, bz + Math.sin(pa) * w], [0, 1, 0], ramp(P, 0.1), [0, 0, 0]);
      B.v([bx - Math.cos(pa) * w, 0, bz - Math.sin(pa) * w], [0, 1, 0], ramp(P, 0.15), [0, 0, 0]);
      B.v([tx, h, tz], norm([Math.cos(a), 1.5, Math.sin(a)]), ramp(P, 0.6 + R() * 0.4), [1, 0.12 * Math.pow(h / H, 2), 0]);
      B.t(f, f + 1, f + 2);
    }
    const plume = L('#7a5a3a'), plumeD = L('#4e3826');
    for (let k = 0; k < 5; k++) {
      const a = R() * TAU, d = 0.1 + R() * 0.35, x = Math.cos(a) * d, z = Math.sin(a) * d, y = 1.35 + R() * 0.45, pa = a + Math.PI / 2, w = 0.07;
      const f = B.v([x * 0.8, y - 0.35, z * 0.8], [0, 1, 0], [plumeD.r, plumeD.g, plumeD.b], [0, 0.1, 0]);
      B.v([x + Math.cos(pa) * w, y, z + Math.sin(pa) * w], [0, 1, 0], [plume.r, plume.g, plume.b], [0, 0.12, 0]);
      B.v([x - Math.cos(pa) * w, y, z - Math.sin(pa) * w], [0, 1, 0], [plume.r, plume.g, plume.b], [0, 0.12, 0]);
      B.v([x * 1.1, y + 0.3, z * 1.1], [0, 1, 0], [plume.r * 1.2, plume.g * 1.2, plume.b * 1.2], [0, 0.16, 0]);
      B.t(f, f + 1, f + 3); B.t(f, f + 3, f + 2);
    }
    return B.build();
  }

  // ---------- cultures : un rang de 3 unités le long de X ----------
  // Profil transversal [z, y, teinte] extrudé sur des stations x ; `bump(x)` module la hauteur / la largeur.
  function extrude(B, prof, xs, bump, o) {
    const v0 = B.p.length / 3, i0 = B.i.length, R = o.rnd, np = prof.length;
    xs.forEach((x, j) => {
      const [bw, bh] = bump(x), inner = j > 0 && j < xs.length - 1; // pas d'aléa aux bouts : raccords sans couture
      prof.forEach(([z, y, t]) => { const yy = y * bh * (y > 0.1 && inner ? 1 + (R() - 0.5) * (o.jit || 0) : 1); B.v([x, yy, z * bw], [0, 1, 0], ramp(o.pal, clamp(t + (inner ? (R() - 0.5) * 0.14 : 0), 0, 1)), [1, (o.wind || 0) * Math.max(0, yy - 0.3), o.bloom != null && y > o.bloom ? 1 : 0]); });
    });
    const ring = o.closed ? np : np - 1;
    for (let j = 0; j < xs.length - 1; j++) for (let k = 0; k < ring; k++) {
      const a = v0 + j * np + k, b = v0 + j * np + ((k + 1) % np), c = a + np, d = b + np;
      B.t(a, d, c); B.t(a, b, d);
    }
    B.autoNormals(v0, i0);
    const N = B.n, last = v0 + (xs.length - 1) * np;
    for (let k = 0; k < np; k++) for (const v of [v0 + k, last + k]) { const n = norm([0, N[v * 3 + 1], N[v * 3 + 2]]); N[v * 3] = 0; N[v * 3 + 1] = n[1]; N[v * 3 + 2] = n[2]; }
  }
  function apron(B, w, col) { // bande de terre entre les rangs (2 triangles)
    const c = [col.r, col.g, col.b], f = B.v([-1.5, 0.06, -w / 2], [0, 1, 0], c, [0, 0, 0]);
    B.v([1.5, 0.06, -w / 2], [0, 1, 0], c); B.v([1.5, 0.06, w / 2], [0, 1, 0], c); B.v([-1.5, 0.06, w / 2], [0, 1, 0], c);
    B.t(f, f + 2, f + 1); B.t(f, f + 3, f + 2);
  }
  function makeLavande() {
    const B = new Builder(), R = rng(101);
    apron(B, 2.3, L('#9a7a58'));
    const prof = [[-0.6, 0.04, 0.0], [-0.5, 0.42, 0.45], [0, 0.7, 0.9], [0.5, 0.42, 0.6], [0.6, 0.04, 0.0]];
    extrude(B, prof, [-1.5, -0.75, 0, 0.75, 1.5], (x) => { const c = Math.cos((x + 0.75) * TAU / 1.5); return [0.86 + 0.14 * c, 0.74 + 0.26 * c]; }, { rnd: R, pal: pal('#3c4a36', '#6a7a5c', '#9aa88a'), jit: 0.12, wind: 0.03, bloom: 0.3 });
    return B.build();
  }
  function makeBle() {
    const B = new Builder(), R = rng(113);
    apron(B, 2.45, L('#8a6c40'));
    const prof = [[-0.92, 0.04, 0.05], [-0.8, 0.82, 0.55], [0, 0.9, 0.95], [0.8, 0.82, 0.7], [0.92, 0.04, 0.05]];
    extrude(B, prof, [-1.5, -0.75, 0, 0.75, 1.5], (x) => [1, 1 + 0.08 * Math.sin(x * 4.19)], { rnd: R, pal: pal('#6e4e1e', '#b7862f', '#e2b955'), jit: 0.16, wind: 0.05, bloom: 0.5 });
    return B.build();
  }
  function makeVigne() {
    const B = new Builder(), R = rng(127);
    apron(B, 2.1, L('#8d7a55'));
    const prof = [[-0.26, 0.5, 0.15], [-0.36, 1.15, 0.55], [0, 1.5, 0.95], [0.36, 1.15, 0.6], [0.26, 0.5, 0.1]];
    extrude(B, prof, [-1.5, -0.5, 0.5, 1.5], (x) => [1 + 0.3 * Math.sin(x * 3.1 + 1), 1 + 0.1 * Math.cos(x * 4.2)], { rnd: R, pal: pal('#13260d', '#2b4a18', '#5c7c2c'), jit: 0.18, closed: true, wind: 0.04 });
    // piquet de bois en début de segment (4 faces)
    const v0 = B.p.length / 3, i0 = B.i.length, w = 0.06, wood = pal('#4a3c2c', '#7d6a50', '#a8957a');
    [[-w, -w], [w, -w], [w, w], [-w, w]].forEach(([dx, dz], k) => { B.v([-1.5 + dx, 0, dz], [0, 1, 0], ramp(wood, 0.2 + k * 0.15), [0, 0, 0]); B.v([-1.5 + dx, 1.65, dz], [0, 1, 0], ramp(wood, 0.6 + k * 0.1), [0, 0, 0]); });
    for (let k = 0; k < 4; k++) { const a = v0 + k * 2, b = v0 + ((k + 1) % 4) * 2; B.t(a, b + 1, b); B.t(a, a + 1, b + 1); }
    B.autoNormals(v0, i0);
    return B.build();
  }

  // ---------- rochers : trois formes dans une même géométrie, la forme choisie par exemplaire ----------
  function makeRocks() {
    const B = new Builder(); B.parts = true;
    const G = pal('#4a4644', '#77716b', '#a8a196');
    const shapes = [{ s: [1.25, 0.8, 1.0], y: -0.2, j: 0.18 }, { s: [1.7, 0.5, 1.15], y: -0.12, j: 0.14 }, { s: [0.85, 1.35, 0.9], y: -0.25, j: 0.24 }];
    shapes.forEach((sh, part) => {
      const R = rng(200 + part * 17), v0 = B.p.length / 3, i0 = B.i.length;
      // facettes franches : sommets dédoublés par face, bruit basse fréquence partagé par position
      const off = ICO1.V.map((d) => { const k = 1 + Math.sin(d[0] * 3.1 + part) * Math.cos(d[2] * 2.7) * sh.j + (R() - 0.5) * sh.j * 0.8; return [d[0] * sh.s[0] * k, Math.max(d[1] * sh.s[1] * k + sh.y, sh.y - 0.15), d[2] * sh.s[2] * k]; });
      ICO1.F.forEach((f) => {
        const ps = f.map((i) => off[i]), fn = norm(cross(sub(ps[1], ps[0]), sub(ps[2], ps[0]))), first = B.p.length / 3;
        ps.forEach((p) => { const t = clamp(0.25 + 0.45 * ((p[1] - sh.y) / (sh.s[1] + 0.2)) + 0.3 * fn[1] + (R() - 0.5) * 0.18, 0, 1); B.v(p, fn, ramp(G, t), [1, 0, fn[1] > 0.55 && R() < 0.6 ? 1 : 0], part); });
        B.t(first, first + 1, first + 2);
      });
    });
    return B.build();
  }

  // ---------- touffes : 5 brins évasés + 6 têtes de fleurs à plat (11 triangles, double face) ----------
  function makeTuft() {
    const B = new Builder(), R = rng(301), P = pal('#557530', '#88a645', '#c6d27a');
    for (let k = 0; k < 5; k++) {
      const a = k * TAU / 5 + R() * 0.6, w = 0.07, pa = a + Math.PI / 2, d = 0.28 + R() * 0.15, h = 0.32 + R() * 0.22;
      const f = B.v([Math.cos(pa) * w, 0, Math.sin(pa) * w], [0, 1, 0], ramp(P, 0.05), [0, 0, 0]);
      B.v([-Math.cos(pa) * w, 0, -Math.sin(pa) * w], [0, 1, 0], ramp(P, 0.1), [0, 0, 0]);
      B.v([Math.cos(a) * d, h, Math.sin(a) * d], [0, 1, 0], ramp(P, 0.7 + R() * 0.3), [0, 0.04, 0]);
      B.t(f, f + 1, f + 2);
    }
    for (let k = 0; k < 6; k++) {
      const a = k * TAU / 6 + 0.3 + R() * 0.5, d = 0.12 + R() * 0.32, x = Math.cos(a) * d, z = Math.sin(a) * d, y = 0.22 + R() * 0.22, s = 0.09, g = 0.85 + R() * 0.15;
      const f = B.v([x + s, y, z], [0, 1, 0], [g, g, g], [1, 0.04, 0]);
      B.v([x - s * 0.5, y + 0.01, z + s * 0.87], [0, 1, 0], [g, g, g], [1, 0.04, 0]);
      B.v([x - s * 0.5, y - 0.01, z - s * 0.87], [0, 1, 0], [g * 0.8, g * 0.8, g * 0.8], [1, 0.04, 0]);
      B.t(f, f + 2, f + 1);
    }
    return B.build();
  }

  // ---------- texture de feuilles (grise, linéaire) : taches de feuillage modulant la couleur ----------
  function leafTexture() {
    const t = LOOK.canvasTexture(256, (c, s) => {
      const R = rng(7); c.fillStyle = 'rgb(105,105,105)'; c.fillRect(0, 0, s, s);
      const dab = (x, y, r, v, rot) => { for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) { c.save(); c.translate(x + ox, y + oy); c.rotate(rot); c.scale(1, 0.62); c.beginPath(); c.arc(0, 0, r, 0, TAU); c.restore(); c.fillStyle = `rgb(${v},${v},${v})`; c.fill(); } };
      for (let k = 0; k < 260; k++) dab(R() * s, R() * s, 8 + R() * 10, 55 + R() * 40 | 0, R() * TAU); // creux
      for (let k = 0; k < 900; k++) { const v = 120 + R() * 125 | 0; dab(R() * s, R() * s, 3 + R() * 6, v, R() * TAU); } // feuilles éclairées
    });
    t.encoding = THREE.LinearEncoding;
    return t;
  }

  // ---------- matériaux : vent, variantes, teintes masquées ----------
  const MODE = { arbre: 1, roche: 2, simple: 3 };
  function patch(shader, U, mode, opts, depth) {
    Object.assign(shader.uniforms, U.shared, opts.uniforms || {});
    let decl = 'attribute vec3 aFx;\nuniform float uTime;\nuniform float uWind;\n';
    if (opts.parts) decl += 'attribute float aPart;\n';
    if (!depth) decl += 'varying vec3 vFx;\nvarying vec3 vLp;\nvarying vec3 vLn;\nuniform vec3 uTone0;\nuniform vec3 uTone1;\nuniform vec3 uTone2;\nuniform vec3 uFlowerA;\nuniform vec3 uFlowerB;\nvarying vec3 vFlo;\n';
    const begin = [
      'vec3 transformed = vec3( position );',
      opts.parts ? 'if ( abs( aPart - instanceColor.r ) > 0.5 ) transformed = vec3( 0.0 );' : '',
      '#ifdef USE_INSTANCING',
      'float natPh = dot( instanceMatrix[3].xz, vec2( 0.13, 0.09 ) );',
      '#else',
      'float natPh = 0.0;',
      '#endif',
      'float natW = aFx.y * uWind;',
      'transformed.x += natW * ( sin( uTime * 1.3 + natPh ) * 0.7 + sin( uTime * 3.1 + natPh * 1.9 ) * 0.3 );',
      'transformed.z += natW * sin( uTime * 1.05 + natPh * 1.3 ) * 0.5;',
      depth ? '' : 'vFx = aFx; vLp = position; vLn = normal;',
    ].join('\n');
    let color = '';
    if (mode === MODE.arbre) color = [
      'vColor = color;',
      'float natT = clamp( instanceColor.r, 0.0, 1.0 );',
      'vec3 natTint = natT < 0.5 ? mix( uTone0, uTone1, natT * 2.0 ) : mix( uTone1, uTone2, natT * 2.0 - 1.0 );',
      'vColor = mix( vColor, vColor * natTint * instanceColor.b, aFx.x );',
      'vFlo = mix( uFlowerA, uFlowerB, instanceColor.g ) * clamp( dot( color, vec3( 0.3, 0.6, 0.1 ) ) * 3.5, 0.3, 1.0 );',
    ].join('\n');
    else if (mode === MODE.roche) color = 'vColor = color * instanceColor.g;\nvColor = mix( vColor, uFlowerA * ( 0.6 + 0.4 * color.g / max( 0.05, color.r ) ) * dot( color, vec3( 0.4 ) ), aFx.z * instanceColor.b );\nvFlo = vec3( 0.0 );';
    else color = 'vColor = mix( color, color * instanceColor, aFx.x );\nvFlo = uFlowerA * clamp( dot( color, vec3( 0.3, 0.6, 0.1 ) ) * 3.5, 0.3, 1.0 );';
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + decl).replace('#include <begin_vertex>', begin);
    if (!depth) shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', color);
    if (!depth && opts.noflip) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\nnormal = normal * ( float( gl_FrontFacing ) * 2.0 - 1.0 );\n#endif');
    if (!depth && opts.leaf) {
      shader.uniforms.uLeaf = U.leaf;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFx;\nvarying vec3 vLp;\nvarying vec3 vLn;\nvarying vec3 vFlo;\nuniform sampler2D uLeaf;\nuniform float uFloCut;\nuniform float uLeafAmt;\nuniform float uLeafScale;')
        .replace('#include <color_fragment>', [
          '#include <color_fragment>',
          'float natA = texture2D( uLeaf, vLp.xz * uLeafScale ).r;',
          'float natB = texture2D( uLeaf, vec2( vLp.x * 0.7 + vLp.z * 0.7, vLp.y ) * uLeafScale + 0.37 ).r;',
          'float natL = mix( natB, natA, clamp( abs( vLn.y ) * 1.4 - 0.2, 0.0, 1.0 ) );',
          'diffuseColor.rgb *= mix( 1.0, 0.45 + natL * 1.25, vFx.x * uLeafAmt );',
          // fleurs en mouchetis : sur le feuillage, seules les taches claires de la texture fleurissent
          'float natAmt = vFx.z * mix( 1.0, smoothstep( uFloCut, uFloCut + 0.12, natL ), step( 0.01, vFx.x ) );',
          'diffuseColor.rgb = mix( diffuseColor.rgb, vFlo * ( 0.7 + 0.6 * natL ), clamp( natAmt, 0.0, 1.0 ) );',
        ].join('\n'));
    }
  }
  function materials(U, mode, opts) {
    const key = 'nature-' + mode + (opts.parts ? 'p' : '') + (opts.leaf ? 'l' : '') + (opts.noflip ? 'n' : '');
    const m = new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.92, metalness: 0 }, opts.mat || {}));
    m.onBeforeCompile = (sh) => patch(sh, U, mode, opts, false);
    m.customProgramCacheKey = () => key + JSON.stringify(Object.keys(opts.uniforms || {}));
    const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    d.onBeforeCompile = (sh) => patch(sh, U, mode, opts, true);
    d.customProgramCacheKey = () => key + '-depth';
    if (opts.mat && opts.mat.side === THREE.DoubleSide) d.side = THREE.DoubleSide;
    return { m, d };
  }

  // Teintes de ton (multiplicateurs linéaires du feuillage) : vert profond → vert frais → vert-jaune / début d'automne.
  const TONE0 = new THREE.Vector3(0.6, 0.76, 0.74), TONE1 = new THREE.Vector3(1, 1, 1), TONE2 = new THREE.Vector3(1.5, 1.08, 0.4);

  window.KIT_NATURE = {
    create(opts) {
      const o = Object.assign({ maxTrees: 12000, maxCrops: 6000, maxRocks: 600, maxTufts: 4000 }, opts || {});
      const leaf = leafTexture();
      const U = { shared: { uTime: { value: 0 }, uWind: { value: 1 }, uTone0: { value: TONE0 }, uTone1: { value: TONE1 }, uTone2: { value: TONE2 } }, leaf: { value: leaf } };
      const v3 = (h) => { const c = L(h); return { value: new THREE.Vector3(c.r, c.g, c.b) }; };
      const group = new THREE.Group(); group.name = 'kit-nature';
      const white = new THREE.Color(1, 1, 1), dummy = new THREE.Object3D(), meshes = [];
      function batch(name, geo, mode, cap, mo) {
        const { m, d } = materials(U, mode, mo);
        const mesh = new THREE.InstancedMesh(geo, m, cap);
        mesh.customDepthMaterial = d; mesh.name = 'nature-' + name;
        mesh.setColorAt(0, white); mesh.count = 0; // instanceColor alloué à pleine capacité (piège r128)
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false; mesh.castShadow = mo.cast !== false; mesh.receiveShadow = true;
        group.add(mesh); meshes.push(mesh); return mesh;
      }
      const f1 = (v) => ({ value: v });
      const tree = (geo, fa, fb, mat) => ({ leaf: true, uniforms: { uFlowerA: v3(fa || '#ffffff'), uFlowerB: v3(fb || '#ffffff'), uFloCut: f1(0.62), uLeafAmt: f1(1), uLeafScale: f1(0.42) }, mat });
      const T = {
        feuillu: batch('feuillu', makeFeuillu(), MODE.arbre, o.maxTrees, tree()),
        pin: batch('pin', makePin(), MODE.arbre, o.maxTrees, tree()),
        sapin: batch('sapin', makeSapin(), MODE.arbre, o.maxTrees, tree()),
        peuplier: batch('peuplier', makePeuplier(), MODE.arbre, o.maxTrees, tree()),
        pommier: batch('pommier', makePommier(), MODE.arbre, o.maxTrees, tree(null, '#c8281c', '#fbe6ea')), // pommes / fleurs
        buisson: batch('buisson', makeBuisson(), MODE.arbre, o.maxTrees, tree(null, '#f2c21b', '#b06ab8')), // ajonc / bruyère
        roseau: batch('roseau', makeRoseau(), MODE.arbre, o.maxTrees, { noflip: true, uniforms: { uFlowerA: v3('#ffffff'), uFlowerB: v3('#ffffff') }, mat: { side: THREE.DoubleSide } }),
      };
      const plain = (extra, fa, cut) => ({ leaf: true, uniforms: { uFlowerA: v3(fa || '#ffffff'), uFlowerB: v3('#ffffff'), uFloCut: f1(cut == null ? 0.5 : cut), uLeafAmt: f1(0.6), uLeafScale: f1(1 / 1.5) }, mat: Object.assign({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }, extra || {}) });
      const C = { lavande: batch('lavande', makeLavande(), MODE.simple, o.maxCrops, plain(null, '#7a52c0', 0.3)), ble: batch('ble', makeBle(), MODE.simple, o.maxCrops, plain(null, '#eccb6c', 0.6)), vigne: batch('vigne', makeVigne(), MODE.simple, o.maxCrops, plain()) };
      const rocks = batch('rochers', makeRocks(), MODE.roche, o.maxRocks, { parts: true, uniforms: { uFlowerA: v3('#c9c48a'), uFlowerB: v3('#ffffff') }, mat: { flatShading: true, roughness: 0.85 } });
      const tufts = batch('touffes', makeTuft(), MODE.simple, o.maxTufts, Object.assign(plain({ side: THREE.DoubleSide }), { cast: false, noflip: true }));
      tufts.castShadow = false;

      const col = new THREE.Color();
      function put(mesh, x, y, z, rotY, sx, sy, sz, r, g, b) {
        if (mesh.count >= mesh.instanceMatrix.count) return false;
        dummy.position.set(x, y, z); dummy.rotation.set(0, rotY || 0, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
        mesh.setMatrixAt(mesh.count, dummy.matrix); col.setRGB(r, g, b); mesh.setColorAt(mesh.count, col); mesh.count++;
        return true;
      }
      const kit = {
        group,
        meshes: Object.assign({}, T, C, { rochers: rocks, touffes: tufts }),
        reset() { meshes.forEach((m) => { m.count = 0; }); },
        // 'pin' tire au hasard (stable par position) un tiers de sapins ; 'sapin' force la variante dense.
        addTree(species, x, y, z, rotY, scale, tone) {
          let sp = species;
          const h1 = hash(x, z, 1), h2 = hash(x, z, 2), h3 = hash(x, z, 3), s = scale == null ? 1 : scale;
          if (sp === 'pin' && h1 < 0.33) sp = 'sapin';
          const mesh = T[sp] || T.feuillu, t = tone == null ? 0.5 : tone;
          const st = sp === 'peuplier' ? 0.06 : sp === 'buisson' || sp === 'roseau' ? 0.25 : 0.12; // élancement propre à chaque exemplaire
          const sxz = s * (1 + (h2 - 0.5) * st), sy = s * (1 + (h3 - 0.5) * st * 1.4);
          let fl = 0;
          if (sp === 'buisson') fl = h1 < 0.55 ? 0 : 1; // ajonc jaune ou bruyère mauve
          if (sp === 'pommier') fl = t < 0.35 ? 1 : 0; // ton bas : floraison ; sinon pommes
          return put(mesh, x, y, z, rotY, sxz, sy, sxz * (1 + (h1 - 0.5) * 0.1), t, fl, 0.9 + h2 * 0.2);
        },
        addCrop(kind, x, y, z, rotY, scale) {
          const s = scale == null ? 1 : scale, b = 0.92 + hash(x, z, 4) * 0.16;
          return put(C[kind] || C.ble, x, y, z, rotY, s, s, s, b, b, b);
        },
        addRock(x, y, z, rotY, scale, seed) {
          const sd = seed == null ? hash(x, z, 5) * 1000 : seed, R = rng(Math.floor(sd * 7919) + 1), s = scale == null ? 1 : scale;
          return put(rocks, x, y, z, rotY, s * (0.85 + R() * 0.3), s * (0.8 + R() * 0.4), s * (0.85 + R() * 0.3), Math.floor(R() * 3), 0.85 + R() * 0.3, R());
        },
        addTuft(kind, x, y, z, rotY, scale, tint) {
          const s = scale == null ? 1 : scale;
          const c = kind === 'fleurs' ? L(tint || '#f4f0e0') : L('#b9c070'); // l'herbe porte des épis pâles
          return put(tufts, x, y, z, rotY, s, s, s, c.r, c.g, c.b);
        },
        commit() { meshes.forEach((m) => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }); },
        update(t) { U.shared.uTime.value = t || 0; },
        // Nombre de triangles par exemplaire, par lot (pour contrôle du budget).
        triangles() { const r = {}; meshes.forEach((m) => { r[m.name.replace('nature-', '')] = m.geometry.userData.tris; }); return r; },
        dispose() { meshes.forEach((m) => { m.geometry.dispose(); m.material.dispose(); m.customDepthMaterial.dispose(); m.dispose && m.dispose(); }); leaf.dispose(); group.clear(); meshes.length = 0; },
      };
      return kit;
    },
  };
})();
