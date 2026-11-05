// Rendu 3D (Three.js) : diorama en terrasses, eau, forêts, étiquettes, caméra orbitale, captures.
(function () {
  const T = TERRAIN, R = (window.R3D = { ok: !!window.THREE });
  if (!R.ok) return;
  const HS = 230, STEP = 7, SEA = T.SEA / 255;
  let renderer, scene, camera, terrainMesh, pines, rounds, built = -1, host = null, labelsEl = null, raf = 0, ro = null;
  const cam = { tx: 0, tz: 0, dist: 980, theta: 0.35, phi: 0.92 };
  R.labels = []; // [{id, x, y, name, color, kind, onClick}]

  const toY = (h) => { const y = (h - SEA) * HS; return y >= 0 ? Math.max(2, Math.round(y / STEP) * STEP) : y * 0.85; };
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';

  function init() {
    if (renderer) return true;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); }
    catch (e) { R.ok = false; return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, 1.6, 1, 6000);
    scene.add(new THREE.HemisphereLight(0xe4f1ff, 0x6d5c46, 0.8));
    const sun = new THREE.DirectionalLight(0xfff1dc, 0.95);
    sun.position.set(-420, 640, -260); sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -620, right: 620, top: 620, bottom: -620, near: 10, far: 2000 });
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0008;
    scene.add(sun);
    // socle du diorama : eau translucide sur une tranche de terre
    const base = new THREE.Mesh(new THREE.BoxGeometry(1000, 46, 700), new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.95 }));
    base.position.y = -103; scene.add(base);
    const strata = new THREE.Mesh(new THREE.BoxGeometry(1002, 6, 702), new THREE.MeshStandardMaterial({ color: 0x6d5038, roughness: 1 }));
    strata.position.y = -112; scene.add(strata);
    const water = new THREE.Mesh(new THREE.BoxGeometry(1000, 80, 700), new THREE.MeshStandardMaterial({ color: 0x3f93c8, transparent: true, opacity: 0.72, roughness: 0.2, metalness: 0.05 }));
    water.position.y = -40.6; water.renderOrder = 2; scene.add(water);
    attachControls(renderer.domElement);
    return true;
  }

  function buildTerrain() {
    const { GW, GH } = T;
    if (terrainMesh) { scene.remove(terrainMesh); terrainMesh.geometry.dispose(); }
    const pos = new Float32Array(GW * GH * 3), col = new Float32Array(GW * GH * 3), idx = [];
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const i = gy * GW + gx, h = T.hAt(gx, gy);
      pos[i * 3] = (gx / (GW - 1)) * 1000 - 500; pos[i * 3 + 1] = toY(h); pos[i * 3 + 2] = (gy / (GH - 1)) * 700 - 350;
      let c = T.colorFor(T.bAt(gx, gy), h);
      if (h < SEA) { const k = Math.min(1, (SEA - h) / 0.16); c = [200, 188, 140].map((v, j) => v + ([46, 96, 128][j] - v) * k); }
      const n = 0.94 + ((gx * 7 + gy * 13) % 5) * 0.025;
      col[i * 3] = Math.pow((c[0] * n) / 255, 2.2); col[i * 3 + 1] = Math.pow((c[1] * n) / 255, 2.2); col[i * 3 + 2] = Math.pow((c[2] * n) / 255, 2.2);
      if (gx < GW - 1 && gy < GH - 1) idx.push(i, i + GW, i + 1, i + 1, i + GW, i + GW + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    terrainMesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92 }));
    terrainMesh.castShadow = terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);
    buildTrees();
    built = T.version;
  }

  function buildTrees() {
    [pines, rounds].forEach((m) => m && (scene.remove(m), m.geometry.dispose()));
    const { GW, GH } = T, P = [], Q = [];
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const b = T.bAt(gx, gy), h = T.hAt(gx, gy), t = (h - SEA) / (1 - SEA);
      if (t < 0.03 || t > 0.6) continue;
      const r = ((gx * 92821 + gy * 68917) % 1000) / 1000;
      if (b === 4) P.push([gx, gy, r]); else if (b === 3 || (b === 5 && r > 0.7)) Q.push([gx, gy, r]);
    }
    const place = (list, geo, color) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 }), Math.max(1, list.length));
      const o = new THREE.Object3D();
      list.forEach(([gx, gy, r], i) => {
        const fx = gx + (r - 0.5) * 0.7, fy = gy + (((r * 7) % 1) - 0.5) * 0.7;
        o.position.set((fx / (T.GW - 1)) * 1000 - 500, toY(T.sample(fx, fy)), (fy / (T.GH - 1)) * 700 - 350);
        const s = 0.8 + r * 0.6; o.scale.set(s, s, s); o.rotation.y = r * 6.28; o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
      });
      m.count = list.length; m.castShadow = true; m.receiveShadow = true; scene.add(m);
      return m;
    };
    const cone = new THREE.ConeGeometry(2.6, 9, 6); cone.translate(0, 4.5, 0);
    const ball = new THREE.IcosahedronGeometry(3.2, 0); ball.translate(0, 3.4, 0);
    pines = place(P, cone, 0x2f5f40); rounds = place(Q, ball, 0x4f8a3e);
  }

  function placeCamera() {
    const { tx, tz, dist, theta, phi } = cam;
    camera.position.set(tx + dist * Math.sin(phi) * Math.sin(theta), dist * Math.cos(phi), tz + dist * Math.sin(phi) * Math.cos(theta));
    camera.lookAt(tx, 0, tz);
  }

  function renderNow() {
    raf = 0;
    if (!host) return;
    const bg = new THREE.Color(css('--paper'));
    scene.background = bg; scene.fog = new THREE.Fog(bg, 1400, 3200);
    placeCamera();
    renderer.render(scene, camera);
    // étiquettes HTML projetées
    const w = host.clientWidth, h = host.clientHeight, v = new THREE.Vector3();
    labelsEl.querySelectorAll('[data-lid]').forEach((el) => {
      const L = R.labels[+el.dataset.lid];
      v.set(L.x - 500, toY(T.heightAtWorld(L.x, L.y)) + 12, L.y - 350).project(camera);
      const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      el.hidden = !vis;
      if (vis) el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
    });
  }
  R.request = () => { if (!raf && host) raf = requestAnimationFrame(renderNow); };

  R.mount = function (el, labels) {
    if (!init()) return false;
    host = el; labelsEl = labels;
    if (renderer.domElement.parentNode !== el) el.prepend(renderer.domElement);
    renderer.domElement.className = 'gl';
    if (!ro) ro = new ResizeObserver(() => { if (!host) return; renderer.setSize(host.clientWidth, host.clientHeight, false); camera.aspect = host.clientWidth / Math.max(1, host.clientHeight); camera.updateProjectionMatrix(); R.request(); });
    ro.observe(el);
    renderer.setSize(el.clientWidth, el.clientHeight, false);
    camera.aspect = el.clientWidth / Math.max(1, el.clientHeight); camera.updateProjectionMatrix();
    if (built !== T.version) buildTerrain();
    if (!R.placed) { R.placed = true; cam.dist = camera.aspect < 1 ? 1650 : 980; }
    R.request();
    return true;
  };
  R.unmount = () => { if (ro && host) ro.unobserve(host); host = null; };
  R.setLabels = function (list) {
    R.labels = list;
    if (!labelsEl) return;
    labelsEl.replaceChildren(...list.map((L, i) => {
      const b = document.createElement('button');
      b.className = 'label3d' + (L.kind === 'event' ? ' ev' : ''); b.dataset.lid = i; b.style.setProperty('--c', L.color);
      b.innerHTML = '<span class="dot"></span>'; b.append(L.name);
      b.addEventListener('click', (e) => L.onClick && L.onClick(e));
      return b;
    }));
    R.request();
  };
  R.focus = function (x, y) {
    const from = { ...cam }, to = { tx: x - 500, tz: y - 350, dist: 420, phi: 0.85, theta: cam.theta };
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 700), e = 1 - Math.pow(1 - k, 3);
      for (const key of Object.keys(to)) cam[key] = from[key] + (to[key] - from[key]) * e;
      renderNow();
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  R.reset = () => { Object.assign(cam, { tx: 0, tz: 0, dist: camera && camera.aspect < 1 ? 1650 : 980, theta: 0.35, phi: 0.92 }); R.request(); };

  // Capture d'une vue du lieu, pour l'image d'une fiche
  R.capture = function (x, y) {
    if (!init()) return null;
    if (built !== T.version) buildTerrain();
    const saved = { ...cam }, size = new THREE.Vector2(); renderer.getSize(size);
    Object.assign(cam, { tx: x - 500, tz: y - 350, dist: 300, phi: 1.02, theta: cam.theta + 0.6 });
    renderer.setSize(960, 540, false); camera.aspect = 960 / 540; camera.updateProjectionMatrix();
    const bg = new THREE.Color(css('--paper')); scene.background = bg; scene.fog = new THREE.Fog(bg, 1400, 3200);
    placeCamera(); renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/jpeg', 0.86);
    Object.assign(cam, saved);
    if (size.x) { renderer.setSize(size.x, size.y, false); camera.aspect = size.x / Math.max(1, size.y); camera.updateProjectionMatrix(); }
    R.request();
    return url;
  };

  // Caméra orbitale : glisser = tourner, clic droit / deux doigts = déplacer, molette / pincement = zoom
  function attachControls(el) {
    const ptrs = new Map(); let last = null, pinch = null, moved = 0;
    el.style.touchAction = 'none';
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }); moved = 0; APP.hidePeek(); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: cam.dist }; } });
    el.addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; moved += Math.abs(dx) + Math.abs(dy);
      p.x = e.clientX; p.y = e.clientY;
      if (ptrs.size === 2 && pinch) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        cam.dist = Math.max(140, Math.min(1700, pinch.dist * (pinch.d / Math.max(1, d))));
        pan(m.x - pinch.m.x, m.y - pinch.m.y); pinch.m = m;
      } else if (p.pan) pan(dx, dy);
      else { cam.theta -= dx * 0.006; cam.phi = Math.max(0.18, Math.min(1.38, cam.phi - dy * 0.005)); }
      R.request();
    });
    const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = Math.max(140, Math.min(1700, cam.dist * Math.exp(e.deltaY * 0.0012))); R.request(); }, { passive: false });
    function pan(dx, dy) {
      const k = cam.dist / 900, s = Math.sin(cam.theta), c = Math.cos(cam.theta);
      cam.tx = Math.max(-520, Math.min(520, cam.tx - (dx * c + dy * s) * k));
      cam.tz = Math.max(-380, Math.min(380, cam.tz - (-dx * s + dy * c) * k));
    }
  }
})();
