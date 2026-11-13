// Scène 3D : relief, mer, villes, détails, passants, étiquettes, caméra.
// Les modèles viennent des kits (bâtiments, rues, nature) ; l'éclairage commun de look.js.
(function () {
  const T = TERRAIN, G = TOWN, { GW, GH } = T, SEA = T.SEA / 255, HS = 150, SEA_Y = -0.3;
  const SC = (window.SC = { ok: !!window.THREE, towns: {}, walkers: [], monuments: [], input: {}, dirty: true, follow: null });
  if (!SC.ok) return;
  const TEST = !!window.ARCHIPEL_TEST, FAST = window.ARCHIPEL_TEST === 'fast'; // tests sans carte graphique : rendu à la demande ; 'fast' coupe aussi les ombres
  const lin = LOOK.lin, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hashf = (a, b, s) => { let n = (a * 374761393 + b * 668265263 + s * 2147483647) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

  // ---------- hauteur du sol ----------
  const Y = new Float32Array(GW * GH); // hauteurs adoucies, celles du maillage
  const toY = (h) => { const y = (h - SEA) * HS; return y >= 0 ? y : y * 0.85; };
  function meshY(wx, wy) { // hauteur exacte de la surface
    const fx = clamp((wx / 1000) * (GW - 1), 0, GW - 1.001), fy = clamp((wy / 700) * (GH - 1), 0, GH - 1.001);
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, i = y0 * GW + x0;
    const a = Y[i], b = Y[i + 1], c = Y[i + GW], d = Y[i + GW + 1];
    return tx + ty <= 1 ? a + (b - a) * tx + (c - a) * ty : d + (c - d) * (1 - tx) + (b - d) * (1 - ty);
  }
  SC.meshY = meshY;
  const groundY = (x, y) => Math.max(SEA_Y, meshY(x, y));

  let renderer, scene, camera, lights, dome, host, labelsEl, terrainGeo, biomeTex, biomeData, water, waterTex, riverTex, ringMesh, blobs, KB, KS, KN, shadeAt = null;
  const groups = {}, cam = (SC.cam = { x: 392, y: 470, dist: 430, theta: 0.35, phi: 0.9 });
  const GROUND = [null, [222, 205, 160], [126, 154, 74], [86, 120, 62], [80, 102, 66], [100, 118, 80], [212, 180, 122], [150, 156, 124], [140, 130, 118]]; // sol par biome (la mer n'en a pas)
  const SNOW = [238, 241, 240], SHORE = [206, 208, 168], DEEP = [14, 52, 86], WORN = [172, 156, 124]; // WORN : terre battue des villes

  // ---------- textures dessinées ----------
  function noiseTexture() { // bruit répétable : R = grain fin, G et B = ondulations lentes
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const ctx = c.getContext('2d'), img = ctx.createImageData(S, S), px = img.data;
    const vn = (x, y, p, s) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), h = (a, b) => hashf(((a % p) + p) % p, ((b % p) + p) % p, s); const a = h(xi, yi), b = h(xi + 1, yi), cc = h(xi, yi + 1), d = h(xi + 1, yi + 1); return a + (b - a) * u + (cc - a) * v + (a - b - cc + d) * u * v; };
    const fbm = (x, y, p0, oct, s) => { let t = 0, amp = 0.5, n = 0, p = p0; for (let i = 0; i < oct; i++) { t += vn((x / S) * p, (y / S) * p, p, s + i * 13) * amp; n += amp; amp *= 0.55; p *= 2; } return t / n; };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const o = (y * S + x) * 4; px[o] = 255 * clamp(0.5 + (fbm(x, y, 8, 5, 3) - 0.5) * 1.5 + (hashf(x, y, 9) - 0.5) * 0.16, 0, 1); px[o + 1] = 255 * fbm(x, y, 4, 3, 21); px[o + 2] = 255 * fbm(x, y, 4, 3, 47); px[o + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
  }
  function rippleTexture() { // carte de normales répétable pour l'eau, tirée d'un bruit
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
    const ctx = c.getContext('2d'), img = ctx.createImageData(S, S), px = img.data, hf = new Float32Array(S * S);
    const vn = (x, y, p, s) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), h = (a, b) => hashf(((a % p) + p) % p, ((b % p) + p) % p, s); const a = h(xi, yi), b = h(xi + 1, yi), cc = h(xi, yi + 1), d = h(xi + 1, yi + 1); return a + (b - a) * u + (cc - a) * v + (a - b - cc + d) * u * v; };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { let t = 0, amp = 1, p = 6; for (let i = 0; i < 4; i++) { t += Math.abs(vn((x / S) * p, (y / S) * p * 1.6, p, 5 + i * 7) - 0.5) * amp; amp *= 0.5; p *= 2; } hf[y * S + x] = t; }
    const at = (x, y) => hf[((y + S) % S) * S + ((x + S) % S)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const nx = (at(x - 1, y) - at(x + 1, y)) * 7, ny = (at(x, y - 1) - at(x, y + 1)) * 7, l = Math.hypot(nx, ny, 1), o = (y * S + x) * 4; px[o] = 127.5 + (nx / l) * 127.5; px[o + 1] = 127.5 + (ny / l) * 127.5; px[o + 2] = 127.5 + (1 / l) * 127.5; px[o + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
  }

  // Sol : couleur par biome lue dans une petite texture (une case par maille), contours ondulés par le bruit,
  // roche sur les pentes, plage au ras de l'eau, grain fin de près.
  function terrainMaterial(noise) {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.biomeMap = { value: biomeTex }; sh.uniforms.noiseMap = { value: noise };
      sh.vertexShader = 'varying vec3 vWP;\nvarying vec3 vWN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWP = position; vWN = normal;');
      sh.fragmentShader = 'uniform sampler2D biomeMap;\nuniform sampler2D noiseMap;\nvarying vec3 vWP;\nvarying vec3 vWN;\n' + sh.fragmentShader.replace('#include <map_fragment>', [
        'vec4 nA = texture2D( noiseMap, vWP.xz / 23.0 );', 'vec4 nB = texture2D( noiseMap, vWP.xz / 131.0 );', 'vec4 nC = texture2D( noiseMap, vWP.xz / 5.3 );',
        'vec2 wob = ( nB.gb - 0.5 ) * 20.0 + ( nA.gb - 0.5 ) * 5.0;',
        `vec2 buv = ( ( vWP.xz + wob + vec2( 500.0, 350.0 ) ) / vec2( 1000.0, 700.0 ) * vec2( ${GW - 1}.0, ${GH - 1}.0 ) + 0.5 ) / vec2( ${GW}.0, ${GH}.0 );`,
        'vec3 base = pow( texture2D( biomeMap, buv ).rgb, vec3( 2.2 ) );',
        'float up = normalize( vWN ).y;',
        'float land = smoothstep( -0.2, 0.5, vWP.y );',
        'float rock = smoothstep( 0.76, 0.6, up + ( nB.r - 0.5 ) * 0.14 ) * land;',
        'vec3 rockCol = mix( vec3( 0.29, 0.265, 0.235 ), vec3( 0.2, 0.19, 0.18 ), nB.r );',
        'base = mix( base, rockCol, rock );',
        'float beach = ( 1.0 - smoothstep( 0.7, 2.6, vWP.y + ( nA.r - 0.5 ) * 1.6 ) ) * land * ( 1.0 - rock );',
        'base = mix( base, vec3( 0.72, 0.62, 0.38 ), beach );',
        'float wet = smoothstep( -0.25, 0.05, vWP.y ) * ( 1.0 - smoothstep( 0.05, 0.9, vWP.y ) );',
        'base *= 1.0 - 0.3 * wet;',
        'float foam = smoothstep( -2.4, -0.5, vWP.y + ( nA.g - 0.5 ) * 1.2 ) * ( 1.0 - smoothstep( -0.5, -0.1, vWP.y ) );',
        'base = mix( base, vec3( 0.62, 0.78, 0.74 ), foam * 0.75 );',
        'base *= ( 0.8 + 0.4 * nB.r ) * ( 0.88 + 0.24 * nA.r ) * ( 0.93 + 0.14 * nC.r );',
        'diffuseColor.rgb *= base;',
      ].join('\n'));
    };
    return m;
  }
  // Mer : transparente quand on la regarde d'en haut, couleur du ciel quand le regard rase la surface.
  function waterMaterial(tex, color, opacity) {
    const m = new THREE.MeshStandardMaterial({ color: lin(color), transparent: true, opacity, roughness: 0.16, metalness: 0, normalMap: tex, normalScale: new THREE.Vector2(0.22, 0.22) });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.skyCol = { value: lin(LOOK.SKY) };
      sh.fragmentShader = 'uniform vec3 skyCol;\n' + sh.fragmentShader.replace('vec3 mapN = texture2D( normalMap, vUv ).xyz * 2.0 - 1.0;', 'vec3 mapN = normalize( texture2D( normalMap, vUv ).xyz * 2.0 - 1.0 + ( texture2D( normalMap, vUv.yx * 0.23 + 0.37 ).xyz * 2.0 - 1.0 ) * vec3( 1.4, 1.4, 1.0 ) );').replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', 'float fres = pow( 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) ), 3.0 );\n  outgoingLight = mix( outgoingLight, skyCol * 0.92, fres * 0.7 );\n  gl_FragColor = vec4( outgoingLight, mix( diffuseColor.a, 0.96, fres ) );');
    };
    return m;
  }

  // ---------- démarrage ----------
  SC.init = function (el, lab) {
    host = el; labelsEl = lab;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (e) { SC.ok = false; return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    LOOK.setupRenderer(renderer); renderer.shadowMap.enabled = !FAST; renderer.shadowMap.autoUpdate = false;
    scene = new THREE.Scene(); scene.background = new THREE.Color(LOOK.SKY);
    camera = new THREE.PerspectiveCamera(46, 1, 1, 9000);
    dome = LOOK.sky(scene, 5600); lights = LOOK.lights(scene, FAST ? 512 : 2048);

    const idx = [];
    for (let gy = 0; gy < GH - 1; gy++) for (let gx = 0; gx < GW - 1; gx++) { const i = gy * GW + gx; idx.push(i, i + GW, i + 1, i + 1, i + GW, i + GW + 1); }
    terrainGeo = new THREE.BufferGeometry();
    terrainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(GW * GH * 3), 3));
    terrainGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(GW * GH * 3), 3));
    terrainGeo.setIndex(idx);
    biomeData = new Uint8Array(GW * GH * 4);
    biomeTex = new THREE.DataTexture(biomeData, GW, GH, THREE.RGBAFormat); biomeTex.magFilter = biomeTex.minFilter = THREE.LinearFilter;
    const noise = noiseTexture();
    const tm = new THREE.Mesh(terrainGeo, terrainMaterial(noise)); tm.castShadow = tm.receiveShadow = true; tm.frustumCulled = false; scene.add(tm);
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), new THREE.MeshBasicMaterial({ color: lin('#0e3456') })); bed.rotation.x = -Math.PI / 2; bed.position.y = toY(0) - 1; scene.add(bed);
    waterTex = rippleTexture(); waterTex.repeat.set(16000 / 46, 16000 / 46);
    water = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), waterMaterial(waterTex, '#1c5f85', 0.8)); water.rotation.x = -Math.PI / 2; water.position.y = SEA_Y; water.receiveShadow = true; water.renderOrder = 2; scene.add(water);
    riverTex = rippleTexture(); riverTex.repeat.set(1, 0.5);

    KB = KIT_BUILDINGS.create({ maxHouses: 3200 }); KS = KIT_STREET.create({ maxProps: 3000, maxPeople: 700 }); KN = KIT_NATURE.create({ maxTrees: 9000, maxCrops: 6000, maxRocks: 700, maxTufts: 4000 });
    scene.add(KB.group, KS.group, KN.group);
    KS.people.mesh.castShadow = false; // l'ombre portée est figée entre deux mouvements de caméra : les passants ont une ombre de contact

    // ombre de contact sous chaque passant (l'ombre portée, elle, n'est recalculée que lorsque la vue bouge)
    const bt = LOOK.canvasTexture(64, (c, s) => { const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(0.55, 'rgba(0,0,0,.28)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, s, s); });
    const bg = new THREE.PlaneGeometry(1.5, 1.5); bg.rotateX(-Math.PI / 2);
    blobs = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ map: bt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }), 700);
    blobs.count = 0; blobs.frustumCulled = false; blobs.renderOrder = 1; scene.add(blobs);

    const rg = new THREE.RingGeometry(0.92, 1, 56); rg.rotateX(-Math.PI / 2);
    ringMesh = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffc94d, depthTest: false, transparent: true, side: THREE.DoubleSide, fog: false, toneMapped: false }));
    ringMesh.renderOrder = 10; ringMesh.visible = false; scene.add(ringMesh);
    ['decals', 'marks'].forEach((k) => scene.add((groups[k] = new THREE.Group())));

    el.prepend(renderer.domElement); renderer.domElement.className = 'gl';
    new ResizeObserver(resize).observe(el); resize();
    controls(renderer.domElement);
    requestAnimationFrame(frame);
    return true;
  };
  function resize() { if (!host) return; const w = host.clientWidth || 1, h = host.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); SC.dirty = true; }

  // ---------- relief ----------
  function updateTerrain() {
    const pos = terrainGeo.attributes.position.array, nor = terrainGeo.attributes.normal.array, { H, B } = T.raw();
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) { // on adoucit : les hauteurs ne comptent que 256 niveaux
      const x0 = gx > 0 ? gx - 1 : gx, x1 = gx < GW - 1 ? gx + 1 : gx, r0 = (gy > 0 ? gy - 1 : gy) * GW, r1 = gy * GW, r2 = (gy < GH - 1 ? gy + 1 : gy) * GW;
      const h = (H[r0 + x0] + 2 * H[r0 + gx] + H[r0 + x1] + 2 * H[r1 + x0] + 4 * H[r1 + gx] + 2 * H[r1 + x1] + H[r2 + x0] + 2 * H[r2 + gx] + H[r2 + x1]) / 4080;
      Y[r1 + gx] = toY(h);
    }
    const dx = 1000 / (GW - 1), dz = 700 / (GH - 1), towns = (window.APP && APP.state && APP.state.towns) || [];
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const i = gy * GW + gx, y = Y[i], h = H[i] / 255;
      pos[i * 3] = gx * dx - 500; pos[i * 3 + 1] = y; pos[i * 3 + 2] = gy * dz - 350;
      const nx = (Y[gy * GW + Math.max(0, gx - 1)] - Y[gy * GW + Math.min(GW - 1, gx + 1)]) / (2 * dx), nz = (Y[Math.max(0, gy - 1) * GW + gx] - Y[Math.min(GH - 1, gy + 1) * GW + gx]) / (2 * dz), l = Math.hypot(nx, 1, nz);
      nor[i * 3] = nx / l; nor[i * 3 + 1] = 1 / l; nor[i * 3 + 2] = nz / l;
      let c;
      if (h < SEA) { const k = Math.min(1, (SEA - h) / 0.15); c = [SHORE[0] + (DEEP[0] - SHORE[0]) * k, SHORE[1] + (DEEP[1] - SHORE[1]) * k, SHORE[2] + (DEEP[2] - SHORE[2]) * k]; }
      else { const t = (h - SEA) / (1 - SEA); c = t > 0.8 ? SNOW : GROUND[B[i] || 1]; if (towns.length && towns.some((tw) => G.inMask(tw, gx * dx, gy * dz))) c = [c[0] * 0.3 + WORN[0] * 0.7, c[1] * 0.3 + WORN[1] * 0.7, c[2] * 0.3 + WORN[2] * 0.7]; }
      biomeData[i * 4] = c[0]; biomeData[i * 4 + 1] = c[1]; biomeData[i * 4 + 2] = c[2]; biomeData[i * 4 + 3] = 255;
    }
    terrainGeo.attributes.position.needsUpdate = terrainGeo.attributes.normal.needsUpdate = true; biomeTex.needsUpdate = true;
  }
  SC.terrainOnly = function () { updateTerrain(); shadeAt = null; SC.dirty = true; };

  // ---------- revêtements posés sur le relief : rues, places, routes, rivières, champs ----------
  const mats = {};
  function groundMat(kind) {
    if (mats[kind]) return mats[kind];
    const off = { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 };
    if (kind === 'eau') return (mats.eau = new THREE.MeshStandardMaterial(Object.assign({ color: lin('#2f7698'), roughness: 0.18, normalMap: riverTex, normalScale: new THREE.Vector2(0.5, 0.5) }, off)));
    if (kind === 'berge') return (mats.berge = new THREE.MeshStandardMaterial(Object.assign({ color: lin('#8a8562'), roughness: 1 }, off)));
    if (kind === 'champ') {
      const tex = LOOK.canvasTexture(128, (c, s) => { c.fillStyle = '#7d6347'; c.fillRect(0, 0, s, s); for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${i % 2 ? '50,36,24' : '150,124,92'},${0.1 + (i % 5) * 0.035})`; c.fillRect((i * 53) % s, (i * 97) % s, 3 + (i % 4), 2 + (i % 3)); } const g = c.createLinearGradient(0, 0, s, 0); g.addColorStop(0, 'rgba(40,26,14,.5)'); g.addColorStop(0.25, 'rgba(40,26,14,0)'); g.addColorStop(0.75, 'rgba(40,26,14,0)'); g.addColorStop(1, 'rgba(40,26,14,.5)'); c.fillStyle = g; c.fillRect(0, 0, s, s); });
      return (mats.champ = new THREE.MeshStandardMaterial(Object.assign({ map: tex, roughness: 1 }, off)));
    }
    return (mats[kind] = KIT_STREET.groundMaterial(kind));
  }
  const LIFT = { berge: 0.06, champ: 0.09, parc: 0.1, eau: 0.12, place: 0.14, sentier: 0.17, route: 0.19, pave: 0.21, quai: 0.2 };
  function Decals() {
    const by = {}, get = (k) => by[k] || (by[k] = { pos: [], uv: [], idx: [] });
    return {
      // ruban : u de 0 à 1 en travers, v le long (une unité de v par largeur, ou `uPer` rangs en travers)
      ribbon(pts, width, kind, uRep) {
        const dense = G.resample(pts, 1.6); if (dense.length < 2) return;
        const B = get(kind), base = B.pos.length / 3, lift = LIFT[kind] || 0.15; let v = 0;
        dense.forEach(([x, y], i) => {
          const p = dense[Math.max(0, i - 1)], q = dense[Math.min(dense.length - 1, i + 1)], tx = q[0] - p[0], ty = q[1] - p[1], l = Math.hypot(tx, ty) || 1, nx = ((-ty / l) * width) / 2, ny = ((tx / l) * width) / 2;
          if (i) v += Math.hypot(x - dense[i - 1][0], y - dense[i - 1][1]) / width;
          for (const s of [-1, 0, 1]) { const wx = x + nx * s, wy = y + ny * s; B.pos.push(wx - 500, groundY(wx, wy) + lift, wy - 350); B.uv.push((s + 1) / 2 * (uRep || 1), v * (uRep || 1)); }
          if (i) { const a = base + (i - 1) * 3; B.idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
        });
      },
      disc(cx, cy, r, kind) {
        const B = get(kind), base = B.pos.length / 3, rings = 4, seg = 32, lift = LIFT[kind] || 0.15;
        B.pos.push(cx - 500, groundY(cx, cy) + lift, cy - 350); B.uv.push(cx / 8, cy / 8);
        for (let k = 1; k <= rings; k++) for (let i = 0; i < seg; i++) { const a = (i / seg) * 6.2832, wx = cx + (Math.cos(a) * r * k) / rings, wy = cy + (Math.sin(a) * r * k) / rings; B.pos.push(wx - 500, groundY(wx, wy) + lift, wy - 350); B.uv.push(wx / 8, wy / 8); }
        for (let i = 0; i < seg; i++) B.idx.push(base, base + 1 + i, base + 1 + ((i + 1) % seg));
        for (let k = 1; k < rings; k++) for (let i = 0; i < seg; i++) { const a = base + 1 + (k - 1) * seg + i, b = base + 1 + (k - 1) * seg + ((i + 1) % seg); B.idx.push(a, a + seg, b, b, a + seg, b + seg); }
      },
      build(group) {
        for (const kind in by) {
          const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(by[kind].pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(by[kind].uv, 2)); g.setIndex(by[kind].idx); g.computeVertexNormals();
          const m = new THREE.Mesh(g, groundMat(kind)); m.receiveShadow = true; m.frustumCulled = false; group.add(m);
        }
      },
    };
  }

  // ---------- modèles uniques (monuments, fontaines, quais, ponts) : gardés d'une reconstruction à l'autre ----------
  const pool = new Map(); let tick = 0, anims = [];
  function model(key, make, x, y, yy, rot) {
    let e = pool.get(key);
    if (!e) { e = make(); pool.set(key, e); groups.marks.add(e.group); e.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); }
    e.tick = tick; e.group.position.set(x - 500, yy, y - 350); e.group.rotation.y = rot || 0;
    if (e.animate) anims.push(e);
    return e;
  }
  function sweep() { for (const [k, e] of pool) if (e.tick !== tick) { groups.marks.remove(e.group); e.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); pool.delete(k); } }
  function clearDecals() { const g = groups.decals; g.children.forEach((o) => o.geometry.dispose()); while (g.children.length) g.remove(g.children[0]); }

  SC.monumentKinds = { phare: 'Phare', eglise: 'Église', halle: 'Halle', moulin: 'Moulin', tour: 'Tour', statue: 'Statue' };
  const CROPS = (SC.crops = { lavande: ['Lavande', '#9274c9'], ble: ['Blé', '#dcb64f'], vigne: ['Vigne', '#8fbf5a'] });
  const landmark = (key, kind, x, y, rot, seed) => { const e = model(key, () => KB.landmark(kind, { seed: seed || 1 }), x, y, meshY(x, y) - 0.15, rot), k = G.SCALE[kind] || 1; e.group.scale.setScalar(k); e.up = (e.height || 12) * k; return e; };

  // ---------- tout reconstruire à partir du monde ----------
  SC.rebuild = function () {
    const S = APP.state, F = S.features;
    updateTerrain(); clearDecals(); tick++; anims = [];
    KB.reset(); KS.reset(); KN.reset();
    const decals = Decals(), X = (x) => x - 500, Z = (y) => y - 350;

    const rivers = F.rivers.map((r) => G.riverPath(r.from)).filter((p) => p.length > 3);
    const roads = F.roads.map((r) => G.chaikin(r.pts, 2));
    const CELL = 8, lh = new Map(), lput = (x, y, v) => { const k = Math.floor(x / CELL) + ',' + Math.floor(y / CELL), L = lh.get(k); if (L) L.push(v); else lh.set(k, [v]); };
    rivers.forEach((p) => G.resample(p, 2).forEach(([x, y]) => lput(x, y, [x, y, 1])));
    roads.forEach((p) => G.resample(p, 2).forEach(([x, y]) => lput(x, y, [x, y, 0])));
    const lnear = (x, y, d, riverOnly) => { const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const L = lh.get(gx + i + ',' + (gy + j)); if (L) for (const q of L) if ((!riverOnly || q[2]) && Math.hypot(x - q[0], y - q[1]) < d) return true; } return false; };
    const ctx = { nearLine: (x, y) => lnear(x, y, 6), nearRiver: (x, y, d) => lnear(x, y, d, true), monuments: F.monuments.map((m) => ({ x: m.x, y: m.y, r: G.FOOT[m.kind] || 7 })) };
    const prop = (p) => { if (p.kind === 'fleurs') KN.addTuft('fleurs', X(p.x), meshY(p.x, p.y) + 0.1, Z(p.y), p.rot || 0, 1.2, p.tint); else KS.addProp(p.kind, X(p.x), meshY(p.x, p.y) + 0.12, Z(p.y), p.rot || 0, { scale: p.scale || 1, tint: p.tint, seed: Math.floor(p.x * 13 + p.y * 7) }); };

    // villes
    SC.towns = {}; let hi = 0; const townTrees = [];
    for (const town of S.towns) {
      const gen = G.generate(town, ctx); SC.towns[town.id] = gen;
      gen.houses.forEach((hs) => {
        if (hi >= 3200) return; hi++;
        hs.up = KB.addHouse({ x: X(hs.x), y: meshY(hs.x, hs.y), z: Z(hs.y), rotY: hs.rot, w: hs.w, d: hs.d, floors: hs.floors, wall: hs.col, roof: hs.roof, seed: hs.seed });
      });
      gen.runs.forEach((r) => decals.ribbon(r, G.STREET, 'pave'));
      gen.paths.forEach((p) => decals.ribbon(G.chaikin(p, 2), 1.5, 'sentier'));
      gen.decals.forEach((d) => decals.disc(d.x, d.y, d.r, d.kind));
      gen.marks.forEach((m) => landmark(town.id + ':' + m.kind, m.kind, m.x, m.y, m.rot, town.seed));
      gen.models.forEach((m, i) => model(town.id + ':' + m.kind + i + ':' + m.r, () => (m.kind === 'fontaine' ? KIT_STREET.fontaine(m.r) : m.kind === 'bassin' ? KIT_STREET.bassin(m.r) : KIT_STREET.kiosque()), m.x, m.y, meshY(m.x, m.y) + 0.1, m.rot));
      gen.props.forEach(prop);
      gen.trees.forEach((t) => townTrees.push(t));
      if (gen.quay) {
        const q = gen.quay;
        model(town.id + ':quai', () => KIT_STREET.quai(q.len), q.x, q.y, SEA_Y, -q.ang);
        [[q.len * 0.5, 4.6, 0.3], [q.len * 0.86, -4.8, 2.9], [q.len + 6, 1, 1.2]].forEach(([bx, bz, br], i) => { const c = Math.cos(q.ang), s = Math.sin(q.ang); model(town.id + ':bateau' + i, () => KIT_STREET.bateau((town.seed || 7) + i), q.x + c * bx - s * bz, q.y + s * bx + c * bz, SEA_Y, -q.ang + br); });
      }
    }

    // rivières, routes et ponts
    rivers.forEach((p) => { decals.ribbon(p, 6.4, 'berge'); decals.ribbon(p, 4.6, 'eau'); });
    let nb = 0;
    roads.forEach((p) => {
      decals.ribbon(p, 3.6, 'route');
      const dense = G.resample(p, 2); let run = [];
      const flush = () => { if (!run.length) return; const m = run[Math.floor(run.length / 2)], a = dense[Math.max(0, m - 2)], b = dense[Math.min(dense.length - 1, m + 2)], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), [bx, by] = dense[m], L = Math.max(14, run.length * 2 + 8), e0 = dense[Math.max(0, run[0] - 2)], e1 = dense[Math.min(dense.length - 1, run[run.length - 1] + 2)]; model('pont' + nb++ + ':' + L, () => KIT_STREET.pont(L, 5), bx, by, Math.max(meshY(e0[0], e0[1]), meshY(e1[0], e1[1])) + 0.3, -ang); run = []; };
      dense.forEach(([x, y], i) => { if (lnear(x, y, 3.6, true)) run.push(i); else flush(); }); flush();
    });
    SC.monuments = F.monuments.map((m) => Object.assign({}, m, { up: landmark('m:' + m.id + m.kind, m.kind, m.x, m.y, m.rot, Math.floor(m.x * 7 + m.y)).up }));

    // champs : terre labourée, rangs de culture, clôture
    F.fields.forEach((f) => {
      const ux = Math.cos(f.ang), uy = Math.sin(f.ang), vx = -uy, vy = ux, kind = CROPS[f.crop] ? f.crop : 'ble', at = (a, b) => [f.x + ux * a + vx * b, f.y + uy * a + vy * b];
      decals.ribbon([at(-12.6, 0), at(12.6, 0)], 21, 'champ', 8);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { const [x, y] = at((j - 3.5) * 3, (i - 3.5) * 2.5); if (meshY(x, y) > 0.4) KN.addCrop(kind, X(x), meshY(x, y) + 0.08, Z(y), -f.ang, 1); }
      for (let k = -6; k <= 6; k++) for (const s of [-1, 1]) { const [x, y] = at(k * 2 + 0, s * 10.9); if (Math.abs(k) > 0 || s > 0) KS.addProp('cloture', X(x), meshY(x, y) + 0.05, Z(y), -f.ang, {}); }
      for (let k = -5; k <= 5; k++) for (const s of [-1, 1]) { const [x, y] = at(s * 13.1, k * 2); KS.addProp('cloture', X(x), meshY(x, y) + 0.05, Z(y), -f.ang + Math.PI / 2, {}); }
    });
    decals.build(groups.decals);

    // végétation : là où le biome en veut, sauf là où l'on a construit
    const blocked = (x, y, pad) => lnear(x, y, 6) || F.fields.some((f) => Math.hypot(x - f.x, y - f.y) < 17) || F.monuments.some((m) => Math.hypot(x - m.x, y - m.y) < (G.FOOT[m.kind] || 7) + 2) || S.towns.some((t) => G.inMask(t, x, y) || (pad && G.near(t, x, y, pad)));
    const { B } = T.raw(), cw = 1000 / (GW - 1), ch = 700 / (GH - 1);
    const tree = (sp, x, y, r, sc) => KN.addTree(sp, X(x), meshY(x, y) - 0.1, Z(y), r * 6.283, sc, (r * 7.3) % 1);
    for (let gy = 1; gy < GH - 1; gy++) for (let gx = 1; gx < GW - 1; gx++) {
      const b = B[gy * GW + gx]; if (!b) continue;
      const y0 = Y[gy * GW + gx]; if (y0 < 1.2 || y0 > HS * 0.4) continue;
      const slope = Math.max(Math.abs(Y[gy * GW + gx + 1] - Y[gy * GW + gx - 1]), Math.abs(Y[(gy + 1) * GW + gx] - Y[(gy - 1) * GW + gx])) / (2 * cw);
      for (let k = 0; k < 3; k++) {
        const r = hashf(gx, gy, 11 + k), r2 = hashf(gx, gy, 31 + k), x = (gx + (hashf(gx, gy, 51 + k) - 0.5) * 0.96) * cw, y = (gy + (hashf(gx, gy, 71 + k) - 0.5) * 0.96) * ch;
        let sp = null, sc = 0.8 + r2 * 0.5;
        if (b === 3) { if (k < 2 ? r < (k ? 0.62 : 0.95) : r < 0.35) sp = k === 2 ? 'buisson' : r2 < 0.07 ? 'peuplier' : 'feuillu'; }
        else if (b === 4) { if (k < 2 ? r < (k ? 0.55 : 0.95) : r < 0.2) sp = k === 2 ? 'buisson' : 'pin'; }
        else if (b === 5) { if (r < 0.5) sp = k === 0 && r < 0.12 ? 'feuillu' : 'roseau'; }
        else if (b === 2) { if (k === 0 && r < 0.035) sp = r2 < 0.2 ? 'peuplier' : 'feuillu'; else if (r < 0.07) sp = 'buisson'; }
        else if (b === 7) { if (r < 0.16) sp = 'buisson'; else if (r < 0.28) sp = 'roche'; }
        else if (b === 8) { if (r < 0.26) sp = 'roche'; else if (k === 0 && r < 0.3) sp = 'pin'; }
        else if (b === 6) { if (r < 0.08) sp = 'roche'; else if (r < 0.14) sp = 'buisson'; }
        else if (b === 1) { if (r < 0.05) sp = 'roseau'; else if (r < 0.09) sp = 'roche'; }
        if (!sp || meshY(x, y) < 1 || (slope > 0.7 && sp !== 'roche' && sp !== 'buisson') || blocked(x, y, sp === 'roche' ? 2 : 0)) continue;
        if (sp === 'roche') KN.addRock(X(x), meshY(x, y) - 0.2, Z(y), r * 6.283, 0.45 + r2 * r2 * 1.5, Math.floor(r2 * 997)); else tree(sp, x, y, r2, sp === 'buisson' || sp === 'roseau' ? 0.8 + r2 * 0.7 : sc);
      }
    }
    townTrees.forEach(([x, y, r, sp]) => { if (sp === 'jardin') tree('feuillu', x, y, r, 0.55 + r * 0.25); else tree(sp || 'feuillu', x, y, r, sp === 'pommier' ? 0.85 + r * 0.3 : sp === 'buisson' ? 0.9 + r * 0.5 : 0.7 + r * 0.3); });
    // herbes et fleurs autour des villes et des champs, là où l'on regarde de près
    let nt = 0; const tuft = (x, y, r) => { if (nt > 3600 || meshY(x, y) < 1.5 || lnear(x, y, 3.2) || S.towns.some((t) => G.inMask(t, x, y))) return; const b = B[Math.round((y / 700) * (GH - 1)) * GW + Math.round((x / 1000) * (GW - 1))]; if (b !== 2 && b !== 3 && b !== 5 && b !== 7) return; nt++; KN.addTuft(r < 0.22 ? 'fleurs' : 'herbe', X(x), meshY(x, y), Z(y), r * 40, 0.8 + ((r * 13) % 1) * 0.7, ['#f2c14e', '#f4f1e8', '#e0607a', '#b784d6'][Math.floor(r * 97) % 4]); };
    S.towns.forEach((t, ti) => { const gen = SC.towns[t.id]; if (!gen.houses.length) return; const R = gen.meanR + 26, n = Math.min(700, Math.round(R * R * 0.12)); for (let i = 0; i < n; i++) { const a = hashf(i, ti, 5) * 6.283, d = Math.sqrt(hashf(i, ti, 6)) * R; tuft(gen.cx + Math.cos(a) * d, gen.cy + Math.sin(a) * d, hashf(i, ti, 7)); } });
    F.fields.forEach((f, fi) => { for (let i = 0; i < 50; i++) { const a = hashf(i, fi, 8) * 6.283, d = 15 + hashf(i, fi, 9) * 12; tuft(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, hashf(i, fi, 10)); } });

    KB.commit(); KS.commit(); KN.commit(); sweep();
    syncWalkers();
    shadeAt = null; SC.dirty = true;
  };

  // ---------- passants ----------
  const CLOTHES = ['#b5533c', '#3f6f9e', '#6a8f4f', '#7d5a8c', '#c79a3e', '#4f8f8a', '#9c5a52', '#5f6f86', '#d9cdb4', '#2f3e52', '#8a6a48'];
  const one = { x: 0, y: 0, z: 0, rotY: 0, scale: 1, moving: false, phase: 0, color: '#ffffff', variant: 0, named: false, seed: 0 }, mtx = new THREE.Object3D();
  function nearestRunPoint(gen, x, y) { let best = [0, 0], bd = 1e9; gen.runs.forEach((r, ri) => { for (let i = 0; i < r.length; i += 2) { const d = (r[i][0] - x) ** 2 + (r[i][1] - y) ** 2; if (d < bd) { bd = d; best = [ri, i]; } } }); return best; }
  function syncWalkers() {
    const S = APP.state, old = new Map(SC.walkers.map((w) => [w.key, w])), list = [];
    for (const town of S.towns) {
      const gen = SC.towns[town.id]; if (!gen || !gen.runs.length) continue;
      const residents = S.entries.filter((e) => e.home && e.home.town === town.id);
      const anon = clamp(Math.round(gen.houses.length * 0.42), gen.houses.length ? 3 : 0, 60);
      const make = (key, entry, k) => {
        const prev = old.get(key), rnd = G.rng((town.seed || 7) * 131 + k * 977 + 3);
        const w = prev || { key, speed: 1.5 + rnd() * 1.1, ph: rnd() * 6.283, ox: (rnd() - 0.5) * 1.5, oy: (rnd() - 0.5) * 1.5, pause: 0, dir: rnd() < 0.5 ? 1 : -1, s: 1.02 + rnd() * 0.18, variant: Math.floor(rnd() * 4), color: CLOTHES[Math.floor(rnd() * CLOTHES.length)], seed: Math.floor(rnd() * 9999), x: 0, y: 0, rot: 0 };
        w.town = town.id; w.entry = entry ? entry.id : null;
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
        if (w.i <= 0 || w.i >= run.length - 1) { w.i = clamp(w.i, 0, run.length - 1); w.dir *= -1; hop(w, gen); }
        else if (Math.floor(w.i) !== w.last) { w.last = Math.floor(w.i); const r = Math.random(); if (r < 0.2) hop(w, gen); else if (r < 0.24) w.pause = 1.5 + Math.random() * 4; }
      }
      const cur = gen.runs[w.r], i0 = Math.min(cur.length - 2, Math.floor(w.i)), t = w.i - i0, a = cur[Math.max(0, i0)], b = cur[Math.min(cur.length - 1, i0 + 1)];
      w.x = a[0] + (b[0] - a[0]) * t + w.ox; w.y = a[1] + (b[1] - a[1]) * t + w.oy;
      const want = Math.atan2((b[0] - a[0]) * w.dir, (b[1] - a[1]) * w.dir); let da = want - w.rot; while (da > Math.PI) da -= 6.2832; while (da < -Math.PI) da += 6.2832; w.rot += da * Math.min(1, dt * 8 + (dt ? 0 : 1));
      one.x = w.x - 500; one.y = meshY(w.x, w.y) + 0.22; one.z = w.y - 350; one.rotY = w.rot; one.scale = w.entry ? w.s * 1.12 : w.s; one.moving = w.pause <= 0; one.phase = w.ph; one.color = w.color; one.variant = w.variant; one.named = !!w.entry; one.seed = w.seed;
      KS.people.set(n, one);
      mtx.position.set(one.x, one.y + 0.03, one.z); mtx.updateMatrix(); blobs.setMatrixAt(n, mtx.matrix);
      n++;
    }
    KS.people.count = n; KS.people.commit(); KS.people.update(clock);
    blobs.count = n; blobs.instanceMatrix.needsUpdate = true;
  }
  function hop(w, gen) { const L = gen.links[w.r] && gen.links[w.r][clamp(Math.round(w.i), 0, gen.runs[w.r].length - 1)]; if (L && L.length) { const [r2, i2] = L[Math.floor(Math.random() * L.length)]; w.r = r2; w.i = i2; w.last = i2; w.dir = Math.random() < 0.5 ? 1 : -1; const len = gen.runs[r2].length; if (i2 <= 0) w.dir = 1; if (i2 >= len - 1) w.dir = -1; } }

  // ---------- caméra ----------
  function place() {
    cam.dist = clamp(cam.dist, 26, 1500); cam.phi = clamp(cam.phi, 0.12, 1.3); cam.x = clamp(cam.x, -60, 1060); cam.y = clamp(cam.y, -60, 760);
    const X = cam.x - 500, Z = cam.y - 350, ty = Math.max(0, meshY(cam.x, cam.y)) + Math.min(4, cam.dist * 0.02);
    camera.position.set(X + cam.dist * Math.sin(cam.phi) * Math.sin(cam.theta), ty + cam.dist * Math.cos(cam.phi), Z + cam.dist * Math.sin(cam.phi) * Math.cos(cam.theta));
    const floor = groundY(camera.position.x + 500, camera.position.z + 350) + 2.5; if (camera.position.y < floor) camera.position.y = floor; // ne pas passer sous le relief
    camera.lookAt(X, ty, Z);
    const near = clamp(cam.dist * 0.03, 0.6, 30); if (Math.abs(camera.near - near) > near * 0.2) { camera.near = near; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld(); dome.position.copy(camera.position);
    scene.fog.near = cam.dist * 1.2 + 260; scene.fog.far = cam.dist * 3.4 + 1900;
    const R = Math.max(80, cam.dist * 0.95);
    if (!shadeAt || Math.hypot(cam.x - shadeAt.x, cam.y - shadeAt.y) > shadeAt.R * 0.3 || R > shadeAt.R * 1.35 || R < shadeAt.R * 0.55) {
      lights.aim(X, ty, Z, R); renderer.shadowMap.needsUpdate = true; shadeAt = { x: cam.x, y: cam.y, R };
    }
  }
  let tween = null;
  SC.flyTo = function (to, ms) { const from = Object.assign({}, cam); if (to.theta != null) { while (to.theta - from.theta > Math.PI) to.theta -= 2 * Math.PI; while (to.theta - from.theta < -Math.PI) to.theta += 2 * Math.PI; } tween = { from, to, t: 0, ms: ms || 700 }; SC.follow = null; };
  SC.ring = function (x, y, r) { if (x == null) { ringMesh.visible = false; } else { ringMesh.visible = true; ringMesh.position.set(x - 500, Math.max(0, meshY(x, y)) + 1.2, y - 350); ringMesh.scale.set(r, 1, r); } SC.dirty = true; };

  const v3 = new THREE.Vector3();
  function project(x, y, up) { v3.set(x - 500, Math.max(0, meshY(x, y)) + (up || 0), y - 350).project(camera); return { sx: ((v3.x + 1) / 2) * host.clientWidth, sy: ((1 - v3.y) / 2) * host.clientHeight, vis: v3.z < 1 && v3.z > -1 }; }
  SC.project = project;
  SC.pickGround = function (cx, cy) { // où le doigt touche-t-il le relief ?
    const r = host.getBoundingClientRect(), nx = ((cx - r.left) / r.width) * 2 - 1, ny = -(((cy - r.top) / r.height) * 2 - 1);
    const o = camera.position.clone(), d = v3.set(nx, ny, 0.5).unproject(camera).sub(o).normalize().clone();
    const ground = (p) => { const wx = p.x + 500, wy = p.z + 350; return wx < 0 || wy < 0 || wx > 1000 || wy > 700 ? SEA_Y : Math.max(SEA_Y, meshY(wx, wy)); };
    let t0 = 0; const step = Math.max(1, cam.dist / 160), p = new THREE.Vector3();
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
    if (cam.dist < 700) SC.walkers.forEach((w) => test('walker', w.x, w.y, 1, clamp(1400 / cam.dist, 14, 34), w, 0.5));
    SC.monuments.forEach((m) => test('monument', m.x, m.y, m.up * 0.5, 30, m, 0.8));
    if (cam.dist < 520) APP.state.towns.forEach((town) => { const gen = SC.towns[town.id]; if (gen) gen.houses.forEach((hs) => test('house', hs.x, hs.y, (hs.up || 6) * 0.5, clamp(2600 / cam.dist, 12, 44), { town, house: hs }, 1)); });
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
    const placed = []; // les étiquettes d'habitants qui en recouvriraient une autre se cachent
    for (const L of labels) {
      const p = L.pos ? L.pos() : [L.x, L.y, L.up || 0]; let show = !!p && cam.dist <= (L.maxDist || 1e9) && cam.dist >= (L.minDist || 0);
      if (show) {
        const s = project(p[0], p[1], p[2]); show = s.vis && s.sx > -40 && s.sx < host.clientWidth + 40 && s.sy > 40 && s.sy < host.clientHeight;
        if (show) { const w = 30 + String(L.text).length * 7.2; if (L.kind === 'res' && placed.some((q) => Math.abs(q[0] - s.sx) < (q[2] + w) / 2 && Math.abs(q[1] - s.sy) < 26)) show = false; else { placed.push([s.sx, s.sy, w]); L.el.style.transform = `translate(${s.sx.toFixed(1)}px, ${s.sy.toFixed(1)}px) translate(-50%, -100%)`; } }
      }
      if (L.el.hidden === show) L.el.hidden = !show;
    }
  }

  // ---------- boucle ----------
  let last = 0, skip = false, slow = 0, wt = 0;
  function draw(dt) {
    wt += dt; waterTex.offset.set(wt * 0.004, wt * 0.0026); riverTex.offset.y = -wt * 0.22;
    for (const e of anims) e.animate(wt);
    KN.update && KN.update(wt);
    place(); renderer.render(scene, camera); drawLabels(); SC.dirty = false;
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || !host) return;
    const dt = Math.min(0.1, (now - last) / 1000 || 0), raw = now - last; last = now;
    if (tween) { tween.t = Math.min(1, tween.t + (dt * 1000) / tween.ms); const e = 1 - Math.pow(1 - tween.t, 3); for (const k in tween.to) cam[k] = tween.from[k] + (tween.to[k] - tween.from[k]) * e; if (tween.t >= 1) tween = null; SC.dirty = true; }
    if (SC.follow) { const k = Math.min(1, dt * 4); cam.x += (SC.follow.x - cam.x) * k; cam.y += (SC.follow.y - cam.y) * k; SC.dirty = true; }
    const live = !TEST && cam.dist < 900;
    if (!live && !SC.dirty) return;
    if (!SC.dirty && (skip = !skip)) { last -= dt * 1000; return; }
    if (live) { // appareil à la peine : on réduit la finesse plutôt que la fluidité
      slow = raw > 70 && raw < 400 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 24 && renderer.getPixelRatio() > 1) { renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() - 0.5)); resize(); slow = 0; }
      stepWalkers(dt);
    }
    draw(dt);
  }
  SC.renderNow = function (dt) { if (dt) stepWalkers(dt); draw(dt || 0); };
  SC.stats = () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries });

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
