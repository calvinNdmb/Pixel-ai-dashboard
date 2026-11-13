// Scène 3D : terrain, eau, arbres, villes, détails, passants, étiquettes, caméra.
(function () {
  const T = TERRAIN, G = TOWN, { GW, GH } = T, SEA = T.SEA / 255, HS = 250, STEP = 8, DEEP = [12, 44, 84];
  const SC = (window.SC = { ok: !!window.THREE, towns: {}, walkers: [], monuments: [], input: {}, dirty: true, follow: null });
  if (!SC.ok) return;
  const TEST = !!window.ARCHIPEL_TEST; // tests sans carte graphique : pas d'ombres, rendu à la demande

  const toY = (h) => { const y = (h - SEA) * HS; return y >= 0 ? Math.max(2, Math.round(y / STEP) * STEP) : y * 0.85; };
  const lin = (c) => new THREE.Color(Math.pow(c[0] / 255, 2.2), Math.pow(c[1] / 255, 2.2), Math.pow(c[2] / 255, 2.2));
  const hex = (s) => lin([parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function meshY(wx, wy) { // hauteur exacte de la surface
    const fx = clamp((wx / 1000) * (GW - 1), 0, GW - 1.001), fy = clamp((wy / 700) * (GH - 1), 0, GH - 1.001);
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const a = toY(T.hAt(x0, y0)), b = toY(T.hAt(x0 + 1, y0)), c = toY(T.hAt(x0, y0 + 1)), d = toY(T.hAt(x0 + 1, y0 + 1));
    return tx + ty <= 1 ? a + (b - a) * tx + (c - a) * ty : d + (c - d) * (1 - tx) + (b - d) * (1 - ty);
  }
  SC.meshY = meshY;

  let renderer, scene, camera, sun, host, labelsEl, terrainGeo, pines, rounds, houseBody, houseRoof, walkerMesh, ringMesh, GABLE, shadeAt = null;
  const groups = {}, dummy = new THREE.Object3D(), white = new THREE.Color(1, 1, 1);
  const cam = (SC.cam = { x: 392, y: 470, dist: 430, theta: 0.35, phi: 0.9 });
  const std = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: hex(color), flatShading: true, roughness: 0.85 }, extra || {}));

  function mergeGeos(list) { // fusionne des géométries simples en une seule
    const pos = [];
    list.forEach((g) => { const n = g.toNonIndexed(); pos.push(...n.attributes.position.array); });
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.computeVertexNormals(); return out;
  }
  function instanced(geo, mat, cap, colored) { // `colored` : une couleur par exemplaire (maisons, passants)
    const m = new THREE.InstancedMesh(geo, mat, cap);
    if (colored) m.setColorAt(0, white);
    m.count = 0; m.frustumCulled = false; m.castShadow = m.receiveShadow = true; scene.add(m); return m;
  }

  SC.init = function (el, lab) {
    host = el; labelsEl = lab;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (e) { SC.ok = false; return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !TEST; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
    renderer.outputEncoding = THREE.sRGBEncoding;
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x0a1220);
    camera = new THREE.PerspectiveCamera(55, 1, 2, 7000);
    scene.add(new THREE.HemisphereLight(0xdcecff, 0x4a3d30, 0.82));
    sun = new THREE.DirectionalLight(0xfff0d8, 1.02); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0008; scene.add(sun); scene.add(sun.target);

    const idx = [];
    for (let gy = 0; gy < GH - 1; gy++) for (let gx = 0; gx < GW - 1; gx++) { const i = gy * GW + gx; idx.push(i, i + GW, i + 1, i + 1, i + GW, i + GW + 1); }
    terrainGeo = new THREE.BufferGeometry();
    terrainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(GW * GH * 3), 3));
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(GW * GH * 3), 3));
    terrainGeo.setIndex(idx);
    const tm = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }));
    tm.castShadow = tm.receiveShadow = true; tm.frustumCulled = false; scene.add(tm);
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), new THREE.MeshStandardMaterial({ color: lin(DEEP), roughness: 1 })); bed.rotation.x = -Math.PI / 2; bed.position.y = toY(0) - 1; scene.add(bed);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), new THREE.MeshStandardMaterial({ color: lin([44, 132, 196]), transparent: true, opacity: 0.74, roughness: 0.22, metalness: 0.08 })); water.rotation.x = -Math.PI / 2; water.position.y = -0.6; water.receiveShadow = true; water.renderOrder = 2; scene.add(water);

    const cone = new THREE.ConeGeometry(2.7, 9.5, 6); cone.translate(0, 4.7, 0);
    const ball = new THREE.IcosahedronGeometry(3.3, 0); ball.translate(0, 3.5, 0);
    pines = instanced(cone, new THREE.MeshStandardMaterial({ color: lin([34, 104, 70]), flatShading: true, roughness: 0.85 }), 8000);
    rounds = instanced(ball, new THREE.MeshStandardMaterial({ color: lin([70, 150, 62]), flatShading: true, roughness: 0.85 }), 10000);

    const A = [-0.5, 0, -0.5], B = [0.5, 0, -0.5], C = [0.5, 0, 0.5], D = [-0.5, 0, 0.5], E = [-0.5, 1, 0], F = [0.5, 1, 0];
    GABLE = new THREE.BufferGeometry(); GABLE.setAttribute('position', new THREE.Float32BufferAttribute([].concat(A, F, B, A, E, F, D, C, F, D, F, E, A, D, E, B, F, C), 3)); GABLE.computeVertexNormals();
    houseBody = instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }), 3200, true);
    houseRoof = instanced(GABLE, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8, side: THREE.DoubleSide }), 3200, true);

    const body = new THREE.CylinderGeometry(0.34, 0.46, 1.5, 6); body.translate(0, 0.75, 0);
    const head = new THREE.SphereGeometry(0.36, 6, 5); head.translate(0, 1.85, 0);
    walkerMesh = instanced(mergeGeos([body, head]), new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8 }), 700, true);
    walkerMesh.receiveShadow = false; walkerMesh.castShadow = false;

    const rg = new THREE.RingGeometry(0.92, 1, 56); rg.rotateX(-Math.PI / 2);
    ringMesh = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffc94d, depthTest: false, transparent: true, side: THREE.DoubleSide, fog: false }));
    ringMesh.renderOrder = 10; ringMesh.visible = false; scene.add(ringMesh);
    ['decals', 'marks'].forEach((k) => scene.add((groups[k] = new THREE.Group())));

    el.prepend(renderer.domElement); renderer.domElement.className = 'gl';
    new ResizeObserver(resize).observe(el); resize();
    controls(renderer.domElement);
    requestAnimationFrame(frame);
    return true;
  };
  function resize() { if (!host) return; const w = host.clientWidth || 1, h = host.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); SC.dirty = true; }

  // ---------- terrain ----------
  function updateTerrain() {
    const pos = terrainGeo.attributes.position.array, col = terrainGeo.attributes.color.array;
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const i = gy * GW + gx, h = T.hAt(gx, gy);
      pos[i * 3] = (gx / (GW - 1)) * 1000 - 500; pos[i * 3 + 1] = toY(h); pos[i * 3 + 2] = (gy / (GH - 1)) * 700 - 350;
      let c = T.colorFor(T.bAt(gx, gy), h);
      if (h < SEA) { const k = Math.min(1, (SEA - h) / 0.17); c = [214, 204, 150].map((v, j) => v + (DEEP[j] - v) * k); }
      const n = 0.95 + ((gx * 7 + gy * 13) % 5) * 0.022;
      for (let j = 0; j < 3; j++) col[i * 3 + j] = Math.pow((c[j] * n) / 255, 2.2);
    }
    terrainGeo.attributes.position.needsUpdate = true; terrainGeo.attributes.color.needsUpdate = true;
    if (!terrainGeo.attributes.normal) terrainGeo.computeVertexNormals();
  }

  SC.terrainOnly = function () { updateTerrain(); SC.dirty = true; };

  // ---------- décalques posés sur le relief (rues, places, rivières, routes, champs) ----------
  function Decals() {
    const by = {}, get = (c) => by[c] || (by[c] = { pos: [], idx: [] });
    return {
      ribbon(pts, width, color, lift) {
        const dense = G.resample(pts, 1.6); if (dense.length < 2) return;
        const B = get(color), base = B.pos.length / 3;
        dense.forEach(([x, y], i) => {
          const p = dense[Math.max(0, i - 1)], q = dense[Math.min(dense.length - 1, i + 1)], tx = q[0] - p[0], ty = q[1] - p[1], l = Math.hypot(tx, ty) || 1, nx = ((-ty / l) * width) / 2, ny = ((tx / l) * width) / 2;
          for (const s of [-1, 1]) { const wx = x + nx * s, wy = y + ny * s; B.pos.push(wx - 500, Math.max(-0.2, meshY(wx, wy)) + lift, wy - 350); }
          if (i) { const a = base + (i - 1) * 2; B.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        });
      },
      disc(cx, cy, r, color, lift) {
        const B = get(color), base = B.pos.length / 3, rings = 4, seg = 28;
        B.pos.push(cx - 500, meshY(cx, cy) + lift, cy - 350);
        for (let k = 1; k <= rings; k++) for (let i = 0; i < seg; i++) { const a = (i / seg) * 6.2832, wx = cx + (Math.cos(a) * r * k) / rings, wy = cy + (Math.sin(a) * r * k) / rings; B.pos.push(wx - 500, Math.max(-0.2, meshY(wx, wy)) + lift, wy - 350); }
        for (let i = 0; i < seg; i++) B.idx.push(base, base + 1 + i, base + 1 + ((i + 1) % seg));
        for (let k = 1; k < rings; k++) for (let i = 0; i < seg; i++) { const a = base + 1 + (k - 1) * seg + i, b = base + 1 + (k - 1) * seg + ((i + 1) % seg); B.idx.push(a, a + seg, b, b, a + seg, b + seg); }
      },
      build(group) {
        for (const color in by) {
          const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(by[color].pos, 3)); g.setIndex(by[color].idx); g.computeVertexNormals();
          const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: hex(color), roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
          m.receiveShadow = true; m.frustumCulled = false; group.add(m);
        }
      },
    };
  }

  // ---------- petits modèles : monuments, pont, quai ----------
  const cyl = (g, rt, rb, h, y, c, basic) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 10), basic ? new THREE.MeshBasicMaterial({ color: basic }) : std(c)); m.position.y = y; m.castShadow = true; g.add(m); return m; };
  const box = (g, w, h, d, x, y, z, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), std(c)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const spire = (g, r, h, seg, x, y, z, c) => { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), std(c)); if (seg === 4) m.rotation.y = Math.PI / 4; m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const gable = (g, sx, sy, sz, x, y, z, c) => { const m = new THREE.Mesh(GABLE, new THREE.MeshStandardMaterial({ color: hex(c), flatShading: true, side: THREE.DoubleSide })); m.scale.set(sx, sy, sz); m.rotation.y = Math.PI / 2; m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const MODELS = {
    phare(g) { cyl(g, 3.4, 3.9, 2.4, 1.2, '#b9b2a4'); cyl(g, 1.7, 2.6, 18, 11.4, '#f6f3ec'); cyl(g, 2.05, 2.3, 3.2, 9, '#c9412f'); cyl(g, 2.9, 2.9, 0.7, 20.7, '#3a3f4a'); cyl(g, 1.5, 1.5, 2.4, 22.2, null, 0xffe08a); spire(g, 2.2, 2.4, 10, 0, 24.6, 0, '#c9412f'); return 27; },
    eglise(g) { box(g, 7, 10, 12, 0, 3, 1, '#efe8d8'); gable(g, 12.6, 4, 7.8, 0, 8, 1, '#46546b'); box(g, 4.6, 18, 4.6, 0, 7, -6.6, '#f4eee0'); spire(g, 3.5, 9, 4, 0, 20.5, -6.6, '#46546b'); return 26; },
    halle(g) { box(g, 8, 9, 10, 0, 2.5, 0, '#f1d9a8'); gable(g, 10.8, 3.6, 9, 0, 7, 0, '#a8472f'); return 12; },
    moulin(g) { cyl(g, 1.5, 2.4, 9, 4.5, '#f3efe6'); spire(g, 2.1, 2.6, 8, 0, 10.3, 0, '#8a5a3c'); [Math.PI / 4, -Math.PI / 4].forEach((rz) => { const b = box(g, 0.6, 14, 0.25, 0, 9, 2.1, '#e9dfc8'); b.rotation.z = rz; }); return 17; },
    tour(g) { box(g, 5.4, 18, 5.4, 0, 7, 0, '#d8d0c0'); box(g, 6.6, 1.4, 6.6, 0, 16.5, 0, '#c2b8a2'); spire(g, 4.4, 6, 4, 0, 20.2, 0, '#46546b'); return 24; },
    statue(g) { box(g, 3.4, 2.4, 3.4, 0, 0.6, 0, '#cfc6b4'); cyl(g, 0.6, 0.9, 4.4, 4, '#6f8a78'); const s = new THREE.Mesh(new THREE.SphereGeometry(0.85, 8, 6), std('#6f8a78')); s.position.y = 6.8; s.castShadow = true; g.add(s); return 9; },
  };
  SC.monumentKinds = { phare: 'Phare', eglise: 'Église', halle: 'Halle', moulin: 'Moulin', tour: 'Tour', statue: 'Statue' };
  function placeModel(kind, x, y, rot) { const g = new THREE.Group(); g.position.set(x - 500, meshY(x, y) - 0.4, y - 350); g.rotation.y = rot || 0; const up = MODELS[kind](g); groups.marks.add(g); return up; }
  function disposeGroup(g) { g.traverse((o) => { if (o.isMesh) { if (o.geometry !== GABLE) o.geometry.dispose(); o.material.dispose(); } }); while (g.children.length) g.remove(g.children[0]); }

  const CROPS = (SC.crops = { lavande: ['Lavande', '#9274c9'], ble: ['Blé', '#dcb64f'], vigne: ['Vigne', '#8fbf5a'] });

  // ---------- tout reconstruire à partir du monde ----------
  SC.rebuild = function () {
    const S = APP.state, F = S.features;
    updateTerrain();
    disposeGroup(groups.decals); disposeGroup(groups.marks);
    const decals = Decals();

    const rivers = F.rivers.map((r) => G.riverPath(r.from)).filter((p) => p.length > 3);
    const roads = F.roads.map((r) => G.chaikin(r.pts, 2));
    const CELL = 8, lh = new Map(), lput = (x, y, v) => { const k = Math.floor(x / CELL) + ',' + Math.floor(y / CELL), L = lh.get(k); if (L) L.push(v); else lh.set(k, [v]); };
    rivers.forEach((p) => G.resample(p, 2).forEach(([x, y]) => lput(x, y, [x, y, 1])));
    roads.forEach((p) => G.resample(p, 2).forEach(([x, y]) => lput(x, y, [x, y, 0])));
    const lnear = (x, y, d, riverOnly) => { const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const L = lh.get(gx + i + ',' + (gy + j)); if (L) for (const q of L) if ((!riverOnly || q[2]) && Math.hypot(x - q[0], y - q[1]) < d) return true; } return false; };
    const ctx = { nearLine: (x, y) => lnear(x, y, 5.5), nearRiver: (x, y, d) => lnear(x, y, d, true), monuments: F.monuments.map((m) => ({ x: m.x, y: m.y, r: 7 })) };

    // villes
    SC.towns = {}; let hi = 0; const extraTrees = [];
    for (const town of S.towns) {
      const gen = G.generate(town, ctx); gen.start = hi; SC.towns[town.id] = gen;
      gen.houses.forEach((hs) => {
        if (hi >= 3200) return;
        const y0 = meshY(hs.x, hs.y);
        dummy.position.set(hs.x - 500, y0 + hs.wallH / 2 - 2, hs.y - 350); dummy.scale.set(hs.w, hs.wallH + 4, hs.d); dummy.rotation.set(0, -hs.ang, 0); dummy.updateMatrix(); houseBody.setMatrixAt(hi, dummy.matrix); houseBody.setColorAt(hi, hex(hs.col));
        dummy.position.set(hs.x - 500, y0 + hs.wallH, hs.y - 350); dummy.scale.set(hs.w + 0.25, 2.5, hs.d + 0.9); dummy.updateMatrix(); houseRoof.setMatrixAt(hi, dummy.matrix); houseRoof.setColorAt(hi, hex(hs.roof));
        hi++;
      });
      gen.runs.forEach((r) => decals.ribbon(r, 2.5, '#eadcbd', 0.7));
      gen.decals.forEach((d) => decals.disc(d.x, d.y, d.r, d.color, d.lift));
      gen.marks.forEach((m) => placeModel(m.kind, m.x, m.y, m.rot));
      gen.trees.forEach((t) => extraTrees.push(t));
      if (gen.quay) {
        const q = gen.quay, g = new THREE.Group(); g.position.set(q.x - 500, 0, q.y - 350); g.rotation.y = -q.ang;
        box(g, q.len, 1.2, 4.2, q.len / 2, 1, 0, '#b28f63'); for (let i = 0; i < 4; i++) box(g, 0.9, 5, 0.9, 3 + (i * (q.len - 5)) / 3, -1, 2, '#8a6a48');
        [[q.len * 0.55, 7], [q.len * 0.9, -7.5]].forEach(([bx, bz], i) => { box(g, 7, 1.6, 2.6, bx, 0.3, bz, i ? '#7a4a36' : '#5d6f86'); box(g, 0.4, 6.5, 0.4, bx, 3.6, bz, '#6b5440'); box(g, 0.25, 3.6, 2.6, bx + 0.4, 4.6, bz, '#f4efe2'); });
        groups.marks.add(g);
      }
    }
    houseBody.count = houseRoof.count = hi;
    [houseBody, houseRoof].forEach((m) => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });

    // détails : rivières, routes, ponts, monuments, champs
    rivers.forEach((p) => decals.ribbon(p, 5, '#6cc0ee', 0.55));
    roads.forEach((p) => {
      decals.ribbon(p, 3.4, '#e6d6a8', 0.75);
      const dense = G.resample(p, 2); let run = [];
      const flush = () => { if (run.length) { const m = run[Math.floor(run.length / 2)], a = dense[Math.max(0, m - 2)], b = dense[Math.min(dense.length - 1, m + 2)], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), [bx, by] = dense[m], L = Math.max(14, run.length * 2 + 8), g = new THREE.Group(); g.position.set(bx - 500, meshY(bx, by) + 3.2, by - 350); g.rotation.y = -ang; box(g, L, 1, 5, 0, 0, 0, '#d9d0bd'); box(g, L, 1.1, 0.5, 0, 0.95, 2.25, '#c2b8a2'); box(g, L, 1.1, 0.5, 0, 0.95, -2.25, '#c2b8a2'); box(g, 2.2, 7, 5.2, -L / 2 + 1, -3.4, 0, '#c9bfa9'); box(g, 2.2, 7, 5.2, L / 2 - 1, -3.4, 0, '#c9bfa9'); groups.marks.add(g); run = []; } };
      dense.forEach(([x, y], i) => { if (lnear(x, y, 3.4, true)) run.push(i); else flush(); }); flush();
    });
    SC.monuments = F.monuments.map((m) => Object.assign({}, m, { up: placeModel(m.kind, m.x, m.y, m.rot) }));
    F.fields.forEach((f) => { const n = 8, ux = Math.cos(f.ang), uy = Math.sin(f.ang), vx = -uy, vy = ux, col = (CROPS[f.crop] || CROPS.ble)[1]; for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 2.5; decals.ribbon([[f.x + vx * o - ux * 12, f.y + vy * o - uy * 12], [f.x + vx * o + ux * 12, f.y + vy * o + uy * 12]], 1.7, col, 0.6); } });
    decals.build(groups.decals);

    // arbres : partout où le biome en veut, sauf là où l'on a construit
    const blocked = (x, y) => lnear(x, y, 6) || F.fields.some((f) => Math.hypot(x - f.x, y - f.y) < 16) || F.monuments.some((m) => Math.hypot(x - m.x, y - m.y) < 8) || S.towns.some((t) => G.inMask(t, x, y));
    let np = 0, nr = 0;
    const tree = (mesh, i, x, y, r) => { dummy.position.set(x - 500, meshY(x, y), y - 350); const s = 0.85 + r * 0.65; dummy.scale.set(s, s, s); dummy.rotation.set(0, r * 6.28, 0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); };
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const b = T.bAt(gx, gy); if (b !== 3 && b !== 4 && b !== 5) continue;
      const t = (T.hAt(gx, gy) - SEA) / (1 - SEA); if (t < 0.03 || t > 0.6) continue;
      const r = ((gx * 92821 + gy * 68917) % 1000) / 1000; if (b === 5 && r <= 0.7) continue;
      const x = ((gx + (r - 0.5) * 0.7) / (GW - 1)) * 1000, y = ((gy + (((r * 7) % 1) - 0.5) * 0.7) / (GH - 1)) * 700;
      if (blocked(x, y)) continue;
      if (b === 4) { if (np < 8000) tree(pines, np++, x, y, r); } else if (nr < 10000) tree(rounds, nr++, x, y, r);
    }
    extraTrees.forEach(([x, y, r]) => { if (nr < 10000) tree(rounds, nr++, x, y, r); });
    pines.count = np; rounds.count = nr; pines.instanceMatrix.needsUpdate = rounds.instanceMatrix.needsUpdate = true;

    syncWalkers();
    shadeAt = null; SC.dirty = true;
  };

  // ---------- passants ----------
  const CLOTHES = ['#c9563c', '#3f6f9e', '#6a8f4f', '#8a5a9a', '#c79a3e', '#4f8f8a', '#a8574f', '#5f6f86'];
  function nearestRunPoint(gen, x, y) { let best = [0, 0], bd = 1e9; gen.runs.forEach((r, ri) => { for (let i = 0; i < r.length; i += 2) { const d = (r[i][0] - x) ** 2 + (r[i][1] - y) ** 2; if (d < bd) { bd = d; best = [ri, i]; } } }); return best; }
  function syncWalkers() {
    const S = APP.state, old = new Map(SC.walkers.map((w) => [w.key, w])), list = [];
    for (const town of S.towns) {
      const gen = SC.towns[town.id]; if (!gen || !gen.runs.length) continue;
      const residents = S.entries.filter((e) => e.home && e.home.town === town.id);
      const anon = clamp(Math.round(gen.houses.length * 0.35), gen.houses.length ? 2 : 0, 40);
      const make = (key, entry, k) => {
        const prev = old.get(key), rnd = G.rng((town.seed || 7) * 131 + k * 977 + 3);
        const w = prev || { key, speed: 2 + rnd() * 1.6, ph: rnd() * 6, ox: (rnd() - 0.5) * 1.2, oy: (rnd() - 0.5) * 1.2, pause: 0, dir: rnd() < 0.5 ? 1 : -1, s: 0.9 + rnd() * 0.25, x: 0, y: 0 };
        w.town = town.id; w.entry = entry ? entry.id : null; w.color = entry ? '#ffd34d' : CLOTHES[Math.floor(rnd() * CLOTHES.length)];
        let at;
        if (prev && prev.x) at = nearestRunPoint(gen, prev.x, prev.y);
        else if (entry && entry.home.x != null) at = nearestRunPoint(gen, entry.home.x, entry.home.y);
        else { const ri = Math.floor(rnd() * gen.runs.length); at = [ri, Math.floor(rnd() * gen.runs[ri].length)]; }
        w.r = at[0]; w.i = clamp(at[1], 0, gen.runs[at[0]].length - 1); w.last = Math.floor(w.i);
        list.push(w);
      };
      residents.forEach((e, k) => make('r:' + e.id, e, k));
      for (let k = 0; k < anon; k++) make('a:' + town.id + ':' + k, null, 100 + k);
    }
    SC.walkers = list.slice(0, 700);
    SC.walkers.forEach((w, i) => walkerMesh.setColorAt(i, hex(w.color)));
    if (walkerMesh.instanceColor) walkerMesh.instanceColor.needsUpdate = true;
    if (SC.follow) SC.follow = SC.walkers.find((w) => w.key === SC.follow.key) || null;
    stepWalkers(0);
  }
  let clock = 0;
  function stepWalkers(dt) {
    clock += dt; let n = 0;
    for (const w of SC.walkers) {
      const gen = SC.towns[w.town], run = gen && gen.runs[w.r]; if (!run) continue;
      if (w.pause > 0) w.pause -= dt;
      else {
        w.i += (w.dir * w.speed * dt) / 1.5;
        if (w.i <= 0 || w.i >= run.length - 1) { w.i = clamp(w.i, 0, run.length - 1); w.dir *= -1; hop(w, gen, 1); }
        else if (Math.floor(w.i) !== w.last) { w.last = Math.floor(w.i); const r = Math.random(); if (r < 0.2) hop(w, gen, 0); else if (r < 0.23) w.pause = 1 + Math.random() * 3; }
      }
      const cur = gen.runs[w.r], i0 = Math.min(cur.length - 2, Math.floor(w.i)), t = w.i - i0, a = cur[Math.max(0, i0)], b = cur[Math.min(cur.length - 1, i0 + 1)];
      w.x = a[0] + (b[0] - a[0]) * t + w.ox; w.y = a[1] + (b[1] - a[1]) * t + w.oy;
      dummy.position.set(w.x - 500, meshY(w.x, w.y) + 0.7 + (w.pause > 0 ? 0 : Math.abs(Math.sin(w.ph + clock * 9)) * 0.22), w.y - 350);
      dummy.rotation.set(0, Math.atan2((b[0] - a[0]) * w.dir, (b[1] - a[1]) * w.dir), 0); dummy.scale.setScalar(w.entry ? w.s * 1.75 : w.s * 1.45); dummy.updateMatrix();
      walkerMesh.setMatrixAt(n++, dummy.matrix);
    }
    walkerMesh.count = n; walkerMesh.instanceMatrix.needsUpdate = true;
  }
  function hop(w, gen, must) { const L = gen.links[w.r] && gen.links[w.r][clamp(Math.round(w.i), 0, gen.runs[w.r].length - 1)]; if (L && L.length) { const [r2, i2] = L[Math.floor(Math.random() * L.length)]; w.r = r2; w.i = i2; w.last = i2; w.dir = Math.random() < 0.5 ? 1 : -1; const len = gen.runs[r2].length; if (i2 <= 0) w.dir = 1; if (i2 >= len - 1) w.dir = -1; } }

  // ---------- caméra ----------
  function place() {
    cam.dist = clamp(cam.dist, 55, 1500); cam.phi = clamp(cam.phi, 0.12, 1.32); cam.x = clamp(cam.x, -60, 1060); cam.y = clamp(cam.y, -60, 760);
    const X = cam.x - 500, Z = cam.y - 350, ty = Math.max(0, meshY(cam.x, cam.y)) * 0.6;
    camera.position.set(X + cam.dist * Math.sin(cam.phi) * Math.sin(cam.theta), ty + cam.dist * Math.cos(cam.phi), Z + cam.dist * Math.sin(cam.phi) * Math.cos(cam.theta));
    camera.lookAt(X, ty, Z); camera.updateMatrixWorld();
    scene.fog = scene.fog || new THREE.Fog(scene.background, 100, 1000); scene.fog.near = cam.dist * 1.1 + 200; scene.fog.far = cam.dist * 3 + 900;
    if (!shadeAt || Math.hypot(cam.x - shadeAt.x, cam.y - shadeAt.y) > shadeAt.R * 0.35 || cam.dist > shadeAt.d * 1.4 || cam.dist < shadeAt.d * 0.55 || Math.abs(cam.theta - shadeAt.t) > 0.6) {
      const R = Math.max(240, cam.dist * 0.95), az = cam.theta - 1.1;
      sun.position.set(X + 900 * Math.sin(az), 760, Z + 900 * Math.cos(az)); sun.target.position.set(X, 0, Z); sun.target.updateMatrixWorld();
      Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 10, far: 2600 }); sun.shadow.camera.updateProjectionMatrix();
      renderer.shadowMap.needsUpdate = true; shadeAt = { x: cam.x, y: cam.y, d: cam.dist, t: cam.theta, R };
    }
  }
  let tween = null;
  SC.flyTo = function (to, ms) { const from = Object.assign({}, cam); if (to.theta != null) { while (to.theta - from.theta > Math.PI) to.theta -= 2 * Math.PI; while (to.theta - from.theta < -Math.PI) to.theta += 2 * Math.PI; } tween = { from, to, t: 0, ms: ms || 700 }; SC.follow = null; };
  SC.ring = function (x, y, r) { if (x == null) { ringMesh.visible = false; } else { ringMesh.visible = true; ringMesh.position.set(x - 500, Math.max(0, meshY(x, y)) + 2.5, y - 350); ringMesh.scale.set(r, 1, r); } SC.dirty = true; };

  const v3 = new THREE.Vector3();
  function project(x, y, up) { v3.set(x - 500, Math.max(0, meshY(x, y)) + (up || 0), y - 350).project(camera); return { sx: ((v3.x + 1) / 2) * host.clientWidth, sy: ((1 - v3.y) / 2) * host.clientHeight, vis: v3.z < 1 && v3.z > -1 }; }
  SC.project = project;
  SC.pickGround = function (cx, cy) { // où le doigt touche-t-il le relief ?
    const r = host.getBoundingClientRect(), nx = ((cx - r.left) / r.width) * 2 - 1, ny = -(((cy - r.top) / r.height) * 2 - 1);
    const o = camera.position.clone(), d = v3.set(nx, ny, 0.5).unproject(camera).sub(o).normalize().clone();
    const ground = (p) => { const wx = p.x + 500, wy = p.z + 350; return wx < 0 || wy < 0 || wx > 1000 || wy > 700 ? -0.6 : Math.max(-0.6, meshY(wx, wy)); };
    let t0 = 0; const step = Math.max(1.5, cam.dist / 160), p = new THREE.Vector3();
    for (let t = step; t < cam.dist * 6 + 600; t += step) {
      p.copy(o).addScaledVector(d, t);
      if (p.y <= ground(p)) { let a = t0, b = t; for (let k = 0; k < 8; k++) { const m = (a + b) / 2; p.copy(o).addScaledVector(d, m); if (p.y <= ground(p)) b = m; else a = m; } p.copy(o).addScaledVector(d, b); return [p.x + 500, p.z + 350]; }
      t0 = t;
    }
    return null;
  };
  SC.pickPlane = function (cx, cy) { const r = host.getBoundingClientRect(), o = camera.position, d = v3.set(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1), 0.5).unproject(camera).sub(o).normalize(); if (d.y > -0.03) return null; const t = -o.y / d.y; return [o.x + d.x * t + 500, o.z + d.z * t + 350]; };
  SC.hit = function (cx, cy) { // quel passant, monument ou maison est sous le doigt ?
    const r = host.getBoundingClientRect(), px = cx - r.left, py = cy - r.top; let best = null;
    const test = (type, x, y, up, radius, data, bias) => { const s = project(x, y, up); if (!s.vis) return; const d = Math.hypot(s.sx - px, s.sy - py); if (d < radius && (!best || d * bias < best.score)) best = { type, score: d * bias, data }; };
    if (cam.dist < 700) SC.walkers.forEach((w) => test('walker', w.x, w.y, 1.4, 20, w, 0.5));
    SC.monuments.forEach((m) => test('monument', m.x, m.y, m.up * 0.5, 30, m, 0.8));
    if (cam.dist < 520) APP.state.towns.forEach((town) => { const gen = SC.towns[town.id]; if (gen) gen.houses.forEach((hs) => test('house', hs.x, hs.y, 3, 17, { town, house: hs }, 1)); });
    if (!best) APP.state.towns.forEach((town) => { const gen = SC.towns[town.id]; if (gen && gen.houses.length) test('town', gen.cx, gen.cy, 4, clamp((gen.meanR * 380) / cam.dist, 18, 90), { town }, 1); });
    return best;
  };

  // ---------- étiquettes ----------
  let labels = [];
  SC.setLabels = function (specs) {
    labels = specs;
    labelsEl.replaceChildren(...specs.map((L) => { const b = document.createElement('button'); b.className = 'lbl lbl-' + L.kind; if (L.color) b.style.setProperty('--c', L.color); b.innerHTML = '<i></i>'; b.append(L.text); b.addEventListener('click', (e) => { e.stopPropagation(); L.onTap && L.onTap(e); }); L.el = b; return b; }));
    SC.dirty = true;
  };
  function drawLabels() {
    for (const L of labels) {
      const p = L.pos ? L.pos() : [L.x, L.y, L.up || 0]; let show = !!p && cam.dist <= (L.maxDist || 1e9) && cam.dist >= (L.minDist || 0);
      if (show) { const s = project(p[0], p[1], p[2]); show = s.vis && s.sx > -40 && s.sx < host.clientWidth + 40 && s.sy > 40 && s.sy < host.clientHeight; if (show) L.el.style.transform = `translate(${s.sx.toFixed(1)}px, ${s.sy.toFixed(1)}px) translate(-50%, -100%)`; }
      if (L.el.hidden === show) L.el.hidden = !show;
    }
  }

  // ---------- boucle ----------
  let last = 0, skip = false;
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || !host) return;
    const dt = Math.min(0.1, (now - last) / 1000 || 0); last = now;
    if (tween) { tween.t = Math.min(1, tween.t + (dt * 1000) / tween.ms); const e = 1 - Math.pow(1 - tween.t, 3); for (const k in tween.to) cam[k] = tween.from[k] + (tween.to[k] - tween.from[k]) * e; if (tween.t >= 1) tween = null; SC.dirty = true; }
    if (SC.follow) { const k = Math.min(1, dt * 4); cam.x += (SC.follow.x - cam.x) * k; cam.y += (SC.follow.y - cam.y) * k; SC.dirty = true; }
    const live = !TEST && SC.walkers.length > 0 && cam.dist < 900;
    if (!live && !SC.dirty) return;
    if (!SC.dirty && (skip = !skip)) { last -= dt * 1000; return; }
    if (live) stepWalkers(dt);
    place(); renderer.render(scene, camera); drawLabels(); SC.dirty = false;
  }
  SC.renderNow = function (dt) { if (dt) stepWalkers(dt); place(); renderer.render(scene, camera); drawLabels(); };

  // ---------- gestes : un doigt déplace (ou peint), deux doigts zooment et tournent ----------
  function controls(el) {
    const ptrs = new Map(); let mode = null, moved = 0, t0 = 0, pinch = null, stroking = false, multi = false;
    el.style.touchAction = 'none';
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    const pan = (x0, y0, x1, y1) => { // le sol reste sous le doigt
      place(); const a = SC.pickPlane(x0, y0), b = SC.pickPlane(x1, y1); SC.follow = null;
      if (a && b && Math.hypot(a[0] - b[0], a[1] - b[1]) < cam.dist * 2) { cam.x += a[0] - b[0]; cam.y += a[1] - b[1]; return; }
      const dx = x1 - x0, dy = y1 - y0, k = (2 * cam.dist * Math.tan((camera.fov * Math.PI) / 360)) / host.clientHeight, s = Math.sin(cam.theta), c = Math.cos(cam.theta), f = k / Math.max(0.35, Math.cos(cam.phi)); cam.x += -dx * k * c + -dy * f * s; cam.y += dx * k * s + -dy * f * c;
    };
    const two = () => { const [a, b] = [...ptrs.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; };
    const endStroke = (cancel) => { if (stroking) { stroking = false; SC.input.strokeEnd && SC.input.strokeEnd(cancel); } };
    el.addEventListener('pointerdown', (e) => {
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) { moved = 0; multi = false; t0 = performance.now(); mode = e.button === 2 || e.shiftKey ? 'orbit' : SC.input.tool && SC.input.tool() ? 'stroke' : 'pan'; }
      else if (ptrs.size === 2) { endStroke(true); multi = true; mode = 'pinch'; pinch = two(); }
    });
    el.addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId);
      if (!p) { if (e.pointerType === 'mouse' && SC.input.tool && SC.input.tool()) { const g = SC.pickGround(e.clientX, e.clientY); SC.input.hover && SC.input.hover(g); } return; }
      const px = p.x, py = p.y, dx = e.clientX - px, dy = e.clientY - py; p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
      if (mode === 'pinch' && ptrs.size >= 2) { const n = two(); cam.dist *= pinch.d / n.d; let da = n.ang - pinch.ang; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; cam.theta -= da; pan(pinch.mx, pinch.my, n.mx, n.my); pinch = n; }
      else if (mode === 'pan') pan(px, py, e.clientX, e.clientY);
      else if (mode === 'orbit') { cam.theta -= dx * 0.006; cam.phi -= dy * 0.005; }
      else if (mode === 'stroke' && moved > 4) { const g = SC.pickGround(e.clientX, e.clientY); if (g) { if (!stroking) { stroking = true; SC.input.strokeStart && SC.input.strokeStart(g); } else SC.input.stroke && SC.input.stroke(g); } }
      SC.dirty = true;
    });
    const up = (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (ptrs.size === 0) {
        const quick = moved < 8 && performance.now() - t0 < 500 && !multi;
        if (mode === 'stroke') { if (!stroking && quick) { const g = SC.pickGround(e.clientX, e.clientY); if (g) { SC.input.strokeStart && SC.input.strokeStart(g); stroking = true; } } endStroke(false); }
        else if (quick && mode === 'pan' && e.type === 'pointerup') SC.input.tap && SC.input.tap(SC.hit(e.clientX, e.clientY), e);
        mode = null;
      } else if (ptrs.size === 1) { mode = 'none'; }
      SC.dirty = true;
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist *= Math.exp(e.deltaY * 0.0012); SC.dirty = true; }, { passive: false });
  }
})();
