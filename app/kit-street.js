// Kit « rue » : pavés, mobilier urbain, pièces du port et habitants animés, dans l'esprit d'une maquette de bourg côtier breton.
// Tout est dessiné au chargement (canevas) et assemblé en lots (InstancedMesh) : aucune ressource externe.
(function () {
  const KIT = (window.KIT_STREET = {});
  const lin = (h) => LOOK.lin(h);
  const TAU = Math.PI * 2;

  // ---------- hasard reproductible ----------
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const pick = (R, arr) => arr[Math.floor(R() * arr.length) % arr.length];
  function hashXZ(x, z) { let h = Math.imul(Math.round(x * 97) | 0, 73856093) ^ Math.imul(Math.round(z * 89) | 0, 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; }

  // ---------- petits outils de dessin ----------
  function rr(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2)); c.beginPath(); c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function tone(hex, f) {
    const n = parseInt(hex.slice(1), 16), k = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
    return 'rgb(' + k((n >> 16) & 255) + ',' + k((n >> 8) & 255) + ',' + k(n & 255) + ')';
  }
  // Répète un dessin de part et d'autre du bord pour que la tuile se raccorde (wx : aussi en largeur).
  function wrap(s, x, y, r, wx, fn) {
    for (const dy of [-s, 0, s]) for (const dx of wx ? [-s, 0, s] : [0]) {
      const X = x + dx, Y = y + dy; if (X > -r && X < s + r && Y > -r && Y < s + r) fn(X, Y);
    }
  }
  // Une pierre : en couleur, teinte + modelé (clair en haut à gauche) ; en relief, bosse arrondie.
  function stone(c, color, x, y, w, h, r, col, dome) {
    rr(c, x, y, w, h, r);
    if (color) {
      c.fillStyle = col; c.fill();
      const g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, 'rgba(255,250,240,0.20)'); g.addColorStop(0.55, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(40,30,20,0.16)');
      c.fillStyle = g; c.fill();
    } else {
      const g = c.createRadialGradient(x + w * 0.5, y + h * 0.45, 0, x + w * 0.5, y + h * 0.5, Math.max(w, h) * 0.62);
      g.addColorStop(0, '#ffffff'); g.addColorStop(dome == null ? 0.55 : dome, '#e8e8e8'); g.addColorStop(1, '#7a7a7a'); c.fillStyle = g; c.fill();
    }
  }
  function grains(c, s, R, n, cols, a0, a1, r0, r1, wx) {
    for (let i = 0; i < n; i++) {
      const x = R() * s, y = R() * s, r = r0 + R() * (r1 - r0); c.globalAlpha = a0 + R() * (a1 - a0); c.fillStyle = pick(R, cols);
      wrap(s, x, y, r, wx, (X, Y) => c.fillRect(X, Y, r, r));
    }
    c.globalAlpha = 1;
  }
  function blotches(c, s, R, n, cols, a, r0, r1, wx) {
    for (let i = 0; i < n; i++) {
      const x = R() * s, y = R() * s, r = r0 + R() * (r1 - r0), col = pick(R, cols);
      wrap(s, x, y, r, wx, (X, Y) => { const g = c.createRadialGradient(X, Y, 0, X, Y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = a; c.fillStyle = g; c.fillRect(X - r, Y - r, 2 * r, 2 * r); });
    }
    c.globalAlpha = 1;
  }
  function tufts(c, s, R, n, xfn, cols, len, wx) {
    c.lineWidth = 1.3; c.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = xfn(R()), y = R() * s, k = 2 + Math.floor(R() * 3), col = pick(R, cols);
      c.strokeStyle = col;
      for (let j = 0; j < k; j++) {
        const a = -Math.PI / 2 + (R() - 0.5) * 1.4, l = len * (0.5 + R());
        wrap(s, x, y, l, wx, (X, Y) => { c.beginPath(); c.moveTo(X, Y); c.lineTo(X + Math.cos(a) * l, Y + Math.sin(a) * l); c.stroke(); });
      }
    }
  }
  // Paire couleur + relief dessinée par la même fonction (le hasard « R » doit être consommé pareil dans les deux cas).
  function twin(size, draw, bumpOnly) {
    const map = bumpOnly ? null : LOOK.canvasTexture(size, (c, s) => draw(c, s, true));
    const bump = LOOK.canvasTexture(size, (c, s) => draw(c, s, false));
    bump.encoding = THREE.LinearEncoding;
    return { map, bump };
  }

  // ---------- textures des sols ----------
  const TEX = {};
  // Rue pavée : bordure de granit, caniveau de pavés en long, chaussée de pavés en rangs croisés.
  TEX.pave = (s) => twin(s, (c, S, C) => {
    const R = rng(11), R2 = rng(12), K = Math.round(S * 0.05), G = Math.round(S * 0.066), A = K + G, B = S - K - G;
    c.fillStyle = C ? '#a3957d' : '#262626'; c.fillRect(0, 0, S, S);
    const MAIN = ['#d9d0bf', '#cfc5b2', '#e0d8c8', '#c8bda9', '#d6cab3', '#cdc6ba', '#dcd2c0', '#c4b8a2', '#d3c3ae', '#bfb6a6'];
    c.save(); c.beginPath(); c.rect(A, 0, B - A, S); c.clip();
    const rows = 18, rh = S / rows;
    for (let r = 0; r < rows; r++) {
      let x = A - R() * 30;
      while (x < B) {
        const w = 21 + R() * 19, col = tone(pick(R, MAIN), 0.92 + R() * 0.14), j = (R() - 0.5) * 2.5;
        stone(c, C, x + 1.6, r * rh + 1.6 + j, w - 3.2, rh - 3.2, 8, col);
        x += w;
      }
    }
    c.restore();
    // bords : bordure puis caniveau, dessinés à gauche puis en miroir à droite
    for (const side of [0, 1]) {
      c.save(); if (side) { c.translate(S, 0); c.scale(-1, 1); }
      c.fillStyle = C ? '#8d8374' : '#151515'; c.fillRect(K, 0, G, S);
      for (let col = 0; col < 2; col++) {
        const n = 13, h = S / n, off = col * h * 0.5 + R() * 6;
        for (let i = 0; i < n; i++) {
          const cl = tone(pick(R, ['#b5ad9f', '#aaa294', '#bcb3a4', '#a59c8c']), 0.9 + R() * 0.12);
          wrap(S, K + col * (G / 2), off + i * h, h, false, (X, Y) => stone(c, C, X + 1.5, Y + 1.5, G / 2 - 3, h - 3, 6, cl, 0.4));
        }
      }
      for (let i = 0; i < 3; i++) {
        const cl = tone(pick(R, ['#d2cec4', '#c8c3b8', '#d8d3c8']), 0.95 + R() * 0.08);
        stone(c, C, 0, i * (S / 3) + 1.5, K - 1.5, S / 3 - 3, 3, cl, 0.85);
      }
      c.restore();
    }
    if (C) { grains(c, S, R2, 2600, ['#8a7e6c', '#f2ece0', '#6f6658', '#b9ab95'], 0.15, 0.4, 1, 2.2, false); blotches(c, S, R2, 26, ['#7d6c55', '#efe6d4'], 0.08, 30, 90, false); }
  });

  // Route de terre battue : ornières, cailloux, herbe sur les bords et au milieu.
  TEX.route = (s) => twin(s, (c, S, C) => {
    const R = rng(21), R2 = rng(22);
    c.fillStyle = C ? '#b4a284' : '#808080'; c.fillRect(0, 0, S, S);
    blotches(c, S, R, 70, C ? ['#9d8a6c', '#c6b596', '#a99677'] : ['#606060', '#a0a0a0', '#707070'], 0.3, 20, 70, false);
    for (const u of [0.31, 0.69]) {
      const g = c.createLinearGradient((u - 0.08) * S, 0, (u + 0.08) * S, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, C ? 'rgba(92,70,48,0.32)' : 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect((u - 0.08) * S, 0, 0.16 * S, S);
    }
    grains(c, S, R, 1400, C ? ['#8d7a62', '#cbb999', '#e0d2b6', '#776550'] : ['#c0c0c0', '#e0e0e0', '#a0a0a0', '#d0d0d0'], 0.5, 0.9, 1.2, 3.2, false);
    for (const side of [0, 1]) {
      const x0 = side ? S : 0, g = c.createLinearGradient(x0, 0, side ? S * 0.86 : S * 0.14, 0);
      g.addColorStop(0, C ? '#86a453' : '#a0a0a0'); g.addColorStop(0.55, C ? 'rgba(134,164,83,0.55)' : 'rgba(160,160,160,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(side ? S * 0.86 : 0, 0, S * 0.14, S);
    }
    const GR = C ? ['#6f9443', '#86a853', '#5b7f38', '#9bb565'] : ['#c8c8c8', '#d8d8d8'];
    tufts(c, S, R, 520, (r) => (r < 0.5 ? Math.pow(r * 2, 2) * S * 0.12 : S - Math.pow((r - 0.5) * 2, 2) * S * 0.12), GR, 6, false);
    tufts(c, S, R, 140, (r) => S * (0.47 + r * 0.06), GR, 4, false);
    if (C) grains(c, S, R2, 1500, ['#6d5841', '#e6d8bd'], 0.12, 0.3, 1, 2, false);
  });

  // Sentier de gravier clair, bordé d'herbe irrégulière.
  TEX.sentier = (s) => twin(s, (c, S, C) => {
    const R = rng(31);
    c.fillStyle = C ? '#cdbf9f' : '#909090'; c.fillRect(0, 0, S, S);
    blotches(c, S, R, 40, C ? ['#b8a886', '#ddd0b2'] : ['#707070', '#b0b0b0'], 0.3, 20, 60, false);
    grains(c, S, R, 5200, C ? ['#a69476', '#e6dcc6', '#8f8270', '#f4ecd9', '#b9a98a'] : ['#ffffff', '#d0d0d0', '#b0b0b0', '#606060'], 0.6, 1, 1.5, 3.4, false);
    for (const side of [0, 1]) {
      const ph = R() * TAU, ph2 = R() * TAU;
      c.beginPath(); c.moveTo(side ? S : 0, 0);
      for (let y = 0; y <= S; y += 8) { const e = S * (0.075 + 0.025 * Math.sin((y / S) * TAU * 3 + ph) + 0.012 * Math.sin((y / S) * TAU * 7 + ph2)); c.lineTo(side ? S - e : e, y); }
      c.lineTo(side ? S : 0, S); c.closePath(); c.fillStyle = C ? '#7d9e4c' : '#a8a8a8'; c.fill();
    }
    tufts(c, S, R, 600, (r) => (r < 0.5 ? r * 2 * S * 0.13 : S - (r - 0.5) * 2 * S * 0.13), C ? ['#6a8f3e', '#8fae5a', '#577a34'] : ['#c0c0c0', '#e0e0e0'], 6, false);
  });

  // Quai de madriers posés en travers, poutres de rive, clous et fentes.
  TEX.quai = (s) => twin(s, (c, S, C) => {
    const R = rng(41), n = 8, h = S / n, E = Math.round(S * 0.045);
    c.fillStyle = C ? '#2e261d' : '#000000'; c.fillRect(0, 0, S, S);
    const WOOD = ['#a08a6c', '#8f7a5e', '#a39784', '#937f66', '#b09a7a', '#9a9080'];
    for (let i = 0; i < n; i++) {
      const y = i * h + 2, hh = h - 4, cut = R() < 0.6 ? E + (0.25 + R() * 0.5) * (S - 2 * E) : -1, segs = cut > 0 ? [[E, cut], [cut, S - E]] : [[E, S - E]];
      for (const [a, b] of segs) {
        const col = tone(pick(R, WOOD), 0.9 + R() * 0.16);
        c.fillStyle = C ? col : '#c8c8c8'; c.fillRect(a + 1.5, y, b - a - 3, hh);
        for (let k = 0; k < 7; k++) {
          const gy = y + 3 + R() * (hh - 6), amp = R() * 2.5, f = 1 + R() * 3;
          c.strokeStyle = C ? 'rgba(60,45,30,0.22)' : 'rgba(0,0,0,0.25)'; c.lineWidth = 0.8 + R();
          c.beginPath(); for (let x = a; x <= b; x += 12) c.lineTo(x, gy + Math.sin((x / S) * TAU * f) * amp); c.stroke();
        }
        if (C) { const g = c.createLinearGradient(0, y, 0, y + hh); g.addColorStop(0, 'rgba(255,245,225,0.12)'); g.addColorStop(1, 'rgba(30,20,10,0.12)'); c.fillStyle = g; c.fillRect(a + 1.5, y, b - a - 3, hh); }
        for (const x of [a + 9, b - 9]) for (const fy of [0.3, 0.7]) { c.fillStyle = C ? '#3b342c' : '#404040'; c.fillRect(x - 1.5, y + hh * fy - 1.5, 3, 3); }
      }
    }
    for (const x of [0, S - E]) {
      c.fillStyle = C ? '#6f5c47' : '#e0e0e0'; c.fillRect(x + 1, 0, E - 2, S);
      for (let k = 0; k < 4; k++) { c.fillStyle = C ? 'rgba(40,30,20,0.25)' : 'rgba(0,0,0,0.2)'; c.fillRect(x + 3 + R() * (E - 6), 0, 1, S); }
      c.fillStyle = C ? '#2e261d' : '#000'; c.fillRect(x, S / 2 - 1, E, 2);
    }
  });

  // Place : dalles de granit clair en rangs irréguliers (8 unités par tuile).
  TEX.place = (s) => twin(s, (c, S, C) => {
    const R = rng(51), R2 = rng(52);
    c.fillStyle = C ? '#9d927f' : '#202020'; c.fillRect(0, 0, S, S);
    const SL = ['#dcd3c3', '#d2c8b6', '#e3dccd', '#cbc2b2', '#d8cdb8', '#c6c0b4', '#e0d5c0', '#d0c3ae'];
    const hs = []; let tot = 0; while (tot < S) { const h = 40 + R() * 22; hs.push(h); tot += h; }
    const k = S / tot; let y = 0;
    for (const h0 of hs) {
      const h = h0 * k, x0 = R() * S; let x = 0;
      while (x < S - 20) {
        let w = 46 + R() * 70; if (S - x - w < 40) w = S - x;
        const col = tone(pick(R, SL), 0.93 + R() * 0.12), X = x0 + x;
        wrap(S, X + w / 2, y + h / 2, w, true, (cx) => stone(c, C, cx - w / 2 + 1.4, y + 1.4, w - 2.8, h - 2.8, 3, col, 0.8));
        x += w;
      }
      y += h;
    }
    if (C) {
      grains(c, S, R2, 6000, ['#6d665c', '#f7f2e8', '#8a8070', '#b8ad9b', '#4d4842'], 0.15, 0.45, 1, 1.8, true);
      blotches(c, S, R2, 30, ['#8a7a62', '#f2ead8', '#7b8070'], 0.1, 20, 70, true);
    }
  });

  // Pelouse : brins, taches de trèfle, quelques pâquerettes.
  TEX.parc = (s) => twin(s, (c, S, C) => {
    const R = rng(61);
    c.fillStyle = C ? '#79a04a' : '#808080'; c.fillRect(0, 0, S, S);
    blotches(c, S, R, 120, C ? ['#94b95e', '#5f8a3c', '#86ad50', '#6c9442'] : ['#a0a0a0', '#606060'], 0.35, 20, 70, true);
    c.lineWidth = 1.1; c.lineCap = 'round';
    const GR = C ? ['#5f8a3a', '#86ad52', '#9cc062', '#6f9a42', '#4f7a32', '#a9c870'] : ['#606060', '#b0b0b0', '#c8c8c8', '#808080'];
    for (let i = 0; i < 11000; i++) {
      const x = R() * S, y = R() * S, a = -Math.PI / 2 + (R() - 0.5) * 1.6, l = 2 + R() * 4, col = pick(R, GR);
      c.strokeStyle = col; wrap(S, x, y, l, true, (X, Y) => { c.beginPath(); c.moveTo(X, Y); c.lineTo(X + Math.cos(a) * l, Y + Math.sin(a) * l); c.stroke(); });
    }
    for (let i = 0; i < 70; i++) {
      const x = R() * S, y = R() * S, yel = R() < 0.25;
      wrap(S, x, y, 4, true, (X, Y) => { c.fillStyle = C ? (yel ? '#f2d34a' : '#fbfaf2') : '#e0e0e0'; c.beginPath(); c.arc(X, Y, 1.8, 0, TAU); c.fill(); if (!yel) { c.fillStyle = C ? '#f0c02a' : '#e0e0e0'; c.fillRect(X - 0.6, Y - 0.6, 1.2, 1.2); } });
    }
  });

  // Textures communes des modèles : grain fin (bois, peinture) et appareil de pierre (2 unités par tuile).
  let _grain = null, _mason = null, _ripple = null;
  function grainTex() {
    return _grain || (_grain = LOOK.canvasTexture(128, (c, S) => {
      const R = rng(71); c.fillStyle = '#efefef'; c.fillRect(0, 0, S, S);
      grains(c, S, R, 900, ['#ffffff', '#d6d6d6', '#c8c8c8'], 0.3, 0.7, 1, 2, true);
      for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(120,120,120,0.10)'; c.fillRect(0, R() * S, S, 1); }
    }));
  }
  function masonTex() {
    return _mason || (_mason = twin(256, (c, S, C) => {
      const R = rng(81), R2 = rng(82);
      c.fillStyle = C ? '#a9a397' : '#303030'; c.fillRect(0, 0, S, S);
      const hs = []; let tot = 0; while (tot < S) { const h = 26 + R() * 18; hs.push(h); tot += h; }
      const k = S / tot; let y = 0;
      for (const h0 of hs) {
        const h = h0 * k, x0 = R() * S; let x = 0;
        while (x < S - 16) {
          let w = 34 + R() * 48; if (S - x - w < 30) w = S - x;
          const col = tone(pick(R, ['#f4f2ec', '#e6e2da', '#ece8df', '#dcd8cf', '#f0ebe0', '#e2ddd0']), 0.95 + R() * 0.08);
          wrap(S, x0 + x + w / 2, y + h / 2, w, true, (cx) => stone(c, C, cx - w / 2 + 1.5, y + 1.5, w - 3, h - 3, 4, col, 0.7));
          x += w;
        }
        y += h;
      }
      if (C) grains(c, S, R2, 1600, ['#8a857a', '#ffffff', '#b5ae9f'], 0.2, 0.5, 1, 1.6, true);
    }));
  }
  function rippleTex() {
    return _ripple || (_ripple = twin(256, (c, S) => {
      const R = rng(91); c.fillStyle = '#808080'; c.fillRect(0, 0, S, S);
      for (let i = 0; i < 160; i++) {
        const x = R() * S, y = R() * S, w = 10 + R() * 30, h = 2 + R() * 4, light = R() < 0.5;
        wrap(S, x, y, w, true, (X, Y) => { c.fillStyle = light ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(X, Y, w, h, 0, 0, TAU); c.fill(); });
      }
    }, true).bump);
  }

  // ---------- matériaux ----------
  const GROUND = { pave: [512, 0.05, 0.92], route: [512, 0.03, 0.97], sentier: [512, 0.035, 0.96], quai: [512, 0.04, 0.88], place: [512, 0.045, 0.9], parc: [512, 0.02, 0.98] };
  const groundCache = {};
  KIT.groundMaterial = function (kind) {
    if (groundCache[kind]) return groundCache[kind];
    const spec = GROUND[kind] || GROUND.pave, t = TEX[GROUND[kind] ? kind : 'pave'](spec[0]);
    return (groundCache[kind] = new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: spec[1], roughness: spec[2], metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  };

  // Matériau des modèles : couleurs de sommet ; aFx.x = part teintée par la couleur d'exemplaire, aFx.y = lueur (lanternes).
  function patchProp(m) {
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute vec2 aFx;\nvarying float vGlow;\n' + sh.vertexShader.replace('#include <color_vertex>', [
        '#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )', '  vColor = vec3( 1.0 );', '#endif',
        '#ifdef USE_COLOR', '  vColor.xyz *= color.xyz;', '#endif',
        '#ifdef USE_INSTANCING_COLOR', '  vColor.xyz *= mix( vec3( 1.0 ), instanceColor.xyz, aFx.x );', '#endif',
        'vGlow = aFx.y;'].join('\n'));
      sh.fragmentShader = 'varying float vGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vGlow;');
    };
    m.customProgramCacheKey = () => 'kitStreetProp';
    return m;
  }
  const MAT = {};
  function mat(kind) {
    if (MAT[kind]) return MAT[kind];
    if (kind === 'plain') return (MAT.plain = patchProp(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, map: grainTex() })));
    if (kind === 'stone') { const t = masonTex(); return (MAT.stone = patchProp(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, map: t.map, bumpMap: t.bump, bumpScale: 0.03 }))); }
    if (kind === 'water') { const t = rippleTex(); t.repeat.set(0.35, 0.35); return (MAT.water = new THREE.MeshStandardMaterial({ color: lin('#3d7486'), emissive: lin('#2b5866'), emissiveIntensity: 0.25, roughness: 0.14, metalness: 0.15, transparent: true, opacity: 0.86, bumpMap: t, bumpScale: 0.02, depthWrite: false })); }
  }
  KIT.material = mat; // accès pour les bancs d'essai : 'plain' | 'stone' | 'water'

  // ---------- assembleur de géométrie (triangles indépendants, couleurs par face, UV projetées) ----------
  const _v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], _n = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _sn = new THREE.Vector3();
  const _q = new THREE.Quaternion(), _eu = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _col = new THREE.Color();
  function M(x, y, z, o) {
    o = o || {}; _eu.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'); _q.setFromEuler(_eu);
    _p.set(x, y, z); _s.set(o.sx || o.s || 1, o.sy || o.s || 1, o.sz || o.s || 1);
    return new THREE.Matrix4().compose(_p, _q, _s);
  }
  function Builder(seed) { this.P = []; this.N = []; this.C = []; this.U = []; this.F = []; this.R = rng(seed || 7); }
  // col : '#hex' ou fonction (centre, normale, n° de triangle) → '#hex'. o : tint, glow, jit, per, noBottom, noTop, flip, double, flat, uvs.
  Builder.prototype.add = function (geo, m, col, o) {
    o = o || {};
    const g = geo.index ? geo.toNonIndexed() : geo, P = g.attributes.position, N = g.attributes.normal, nm = new THREE.Matrix3().getNormalMatrix(m);
    const fixed = typeof col === 'string' ? lin(col) : null, jit = o.jit == null ? 0.07 : o.jit, per = o.per || 2, us = 1 / (o.uvs || 2);
    let f = 1, k = -1;
    for (let t = 0; t < P.count; t += 3) {
      k++;
      for (let j = 0; j < 3; j++) _v[j].fromBufferAttribute(P, t + j).applyMatrix4(m);
      _e1.subVectors(_v[1], _v[0]); _e2.subVectors(_v[2], _v[0]); _n.crossVectors(_e1, _e2); if (_n.lengthSq() < 1e-14) continue; _n.normalize();
      if (k % per === 0) f = 1 + (this.R() * 2 - 1) * jit;
      if ((o.noBottom && _n.y < -0.9) || (o.noTop && _n.y > 0.9)) continue;
      let c = fixed;
      if (!c) { _p.set(0, 0, 0).add(_v[0]).add(_v[1]).add(_v[2]).multiplyScalar(1 / 3); c = _col.copy(lin(col(_p, _n, k))); }
      const tint = typeof o.tint === 'function' ? o.tint(k) : o.tint || 0, glow = o.glow || 0;
      const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
      const emit = (order, sign) => {
        for (const j of order) {
          const v = _v[j]; this.P.push(v.x, v.y, v.z);
          if (o.flat || !N) _sn.copy(_n); else _sn.fromBufferAttribute(N, t + j).applyMatrix3(nm).normalize();
          this.N.push(_sn.x * sign, _sn.y * sign, _sn.z * sign);
          if (ay >= ax && ay >= az) this.U.push(v.x * us, v.z * us); else if (ax >= az) this.U.push(v.z * us, v.y * us); else this.U.push(v.x * us, v.y * us);
          this.C.push(c.r * f, c.g * f, c.b * f); this.F.push(tint, glow);
        }
      };
      if (o.flip) emit([0, 2, 1], -1); else emit([0, 1, 2], 1);
      if (o.double) emit(o.flip ? [0, 1, 2] : [0, 2, 1], o.flip ? 1 : -1);
    }
    return this;
  };
  Builder.prototype.box = function (x, y, z, w, h, d, col, o) { o = o || {}; const sg = o.seg || [1, 1, 1]; return this.add(new THREE.BoxGeometry(w, h, d, sg[0], sg[1], sg[2]), M(x, y, z, o), col, o); };
  Builder.prototype.cyl = function (x, y, z, rt, rb, h, n, col, o) { o = o || {}; return this.add(new THREE.CylinderGeometry(rt, rb, h, n, o.hs || 1, !!o.open, o.t0 || 0, o.tl || TAU), M(x, y, z, o), col, o); };
  Builder.prototype.geo = function (g, x, y, z, col, o) { return this.add(g, M(x, y, z, o), col, o); };
  Builder.prototype.tris = function () { return this.P.length / 9; };
  Builder.prototype.geometry = function () {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('aFx', new THREE.Float32BufferAttribute(this.F, 2)); g.computeBoundingSphere();
    return g;
  };
  function meshOf(b, material, shadow) { const m = new THREE.Mesh(b.geometry(), material); m.castShadow = shadow !== false; m.receiveShadow = true; return m; }

  // ---------- palette ----------
  const C = {
    iron: '#2c3631', ironHi: '#46524a', wood: '#8a6a4a', woodLt: '#a9875f', woodDk: '#5e4632', weather: '#9a8c78', granite: '#aaa69d', graniteLt: '#c9c4b8',
    slate: '#4d5661', white: '#f1ebdc', lime: '#efeae0', glass: '#ffe0a0', soil: '#4a3a2a', leaf: '#4f7d3a', leafDk: '#3b6630', rope: '#b49a6a', canvas: '#efe6d2',
  };

  // ---------- mobilier (géométrie de référence, origine au pied, avant vers +Z) ----------
  const PROPS = {};
  PROPS.lampadaire = () => {
    const b = new Builder(101);
    b.box(0, 0.17, 0, 0.34, 0.34, 0.34, C.iron, { noBottom: true });
    b.cyl(0, 0.52, 0, 0.07, 0.12, 0.36, 6, C.iron, { open: true });
    b.cyl(0, 1.78, 0, 0.045, 0.06, 2.16, 5, C.iron, { open: true });
    b.cyl(0, 2.88, 0, 0.08, 0.06, 0.1, 6, C.ironHi, { open: true });
    b.box(0, 2.95, 0, 0.18, 0.04, 0.18, C.iron, { ry: Math.PI / 4, noBottom: true });
    b.cyl(0, 3.13, 0, 0.19, 0.12, 0.34, 4, C.glass, { open: true, ry: Math.PI / 4, glow: 0.9, jit: 0 });
    b.cyl(0, 3.38, 0, 0, 0.27, 0.2, 4, C.iron, { open: true, ry: Math.PI / 4 });
    b.cyl(0, 3.52, 0, 0.0, 0.04, 0.1, 4, C.ironHi, { open: true });
    return b;
  };
  PROPS.banc = () => {
    const b = new Builder(102);
    for (const z of [0.1, -0.08]) b.box(0, 0.45, z, 1.6, 0.05, 0.16, C.woodLt, { tint: 1 });
    for (const y of [0.64, 0.8]) b.box(0, y, -0.2, 1.6, 0.1, 0.035, C.woodLt, { rx: -0.12, tint: 1 });
    for (const x of [-0.68, 0.68]) {
      b.box(x, 0.43, -0.21, 0.05, 0.86, 0.05, C.iron, { noBottom: true, rx: -0.08 });
      b.box(x, 0.22, 0.15, 0.05, 0.44, 0.05, C.iron, { noBottom: true });
      b.box(x, 0.62, -0.02, 0.05, 0.04, 0.42, C.iron, {});
    }
    return b;
  };
  PROPS.etal = () => {
    const b = new Builder(103), W = 2.4;
    b.box(0, 0.86, 0, 2.3, 0.07, 1.0, C.woodLt, { noBottom: true });
    b.box(0, 0.44, 0.49, 2.3, 0.78, 0.02, C.canvas, { tint: 0 });
    for (const [x, z, h] of [[-1.12, 0.56, 2.05], [1.12, 0.56, 2.05], [-1.12, -0.6, 2.4], [1.12, -0.6, 2.4]]) b.box(x, h / 2, z, 0.07, h, 0.07, C.wood, { noBottom: true, noTop: true });
    // auvent rayé : bandes alternées teinte / écru
    const aw = new THREE.PlaneGeometry(W + 0.2, 1.5, 7, 1), stripe = (k) => (Math.floor(k / 2) % 2 ? 0 : 1);
    const ang = Math.atan2(0.4, 1.35);
    b.geo(aw, 0, 2.24, -0.02, (p, n, k) => (stripe(k) ? '#ffffff' : C.canvas), { rx: -Math.PI / 2 + ang, double: true, tint: stripe, jit: 0.03, flat: true });
    const val = new THREE.PlaneGeometry(W + 0.2, 0.26, 7, 1);
    b.geo(val, 0, 1.92, 0.72, (p, n, k) => (stripe(k) ? '#ffffff' : C.canvas), { double: true, tint: stripe, jit: 0.03, flat: true });
    // marchandises : cagettes et tas de fruits, poissons
    const goods = [[-0.72, '#c9452e'], [0, '#9bbf4a'], [0.72, '#d98a2b']];
    for (const [x, col] of goods) {
      b.box(x, 0.97, 0.12, 0.6, 0.15, 0.5, C.woodLt, { noBottom: true, noTop: true });
      b.geo(new THREE.OctahedronGeometry(0.26, 0), x, 1.02, 0.12, col, { sx: 1.1, sy: 0.38, sz: 0.85, jit: 0.15, per: 1 });
    }
    b.box(0.2, 0.93, -0.33, 1.4, 0.08, 0.22, '#b9c3c8', { noBottom: true, jit: 0.15, per: 1 });
    return b;
  };
  PROPS.tonneau = () => {
    const b = new Builder(104), H = 0.9, g = new THREE.CylinderGeometry(0.3, 0.3, H, 9, 6, true), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) / (H / 2), k = 1 + 0.16 * (1 - y * y); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    g.computeVertexNormals();
    b.geo(g, 0, H / 2, 0, (pt) => { const r = Math.floor((pt.y / H) * 6); return r === 1 || r === 4 ? C.iron : '#8b6a48'; }, { tint: 1, jit: 0.05 });
    b.geo(new THREE.CircleGeometry(0.29, 9), 0, H + 0.001, 0, '#7a5c3e', { rx: -Math.PI / 2, tint: 1 });
    return b;
  };
  PROPS.caisses = () => {
    const b = new Builder(105), crate = '#a98a62';
    b.box(0, 0.2, 0, 0.6, 0.4, 0.45, crate, { noBottom: true, seg: [1, 2, 1], tint: 1, jit: 0.1 });
    b.box(0.04, 0.59, 0.02, 0.55, 0.38, 0.42, '#9c7d58', { noBottom: true, ry: 0.22, seg: [1, 2, 1], tint: 1, jit: 0.1 });
    b.box(0.66, 0.17, 0.12, 0.5, 0.34, 0.4, '#b29670', { noBottom: true, ry: -0.35, noTop: true, seg: [1, 2, 1], tint: 1, jit: 0.1 });
    b.geo(new THREE.OctahedronGeometry(0.22, 0), 0.66, 0.33, 0.12, '#c8d0d4', { sx: 1.0, sy: 0.35, sz: 0.8, ry: -0.35, jit: 0.2, per: 1 });
    b.geo(new THREE.IcosahedronGeometry(0.2, 0), -0.55, 0.16, 0.25, C.rope, { sy: 0.55, jit: 0.1, per: 1 });
    return b;
  };
  PROPS.puits = () => {
    const b = new Builder(106);
    b.cyl(0, 0.42, 0, 0.78, 0.82, 0.84, 10, C.granite, { open: true, hs: 3, jit: 0.12 });
    b.geo(new THREE.RingGeometry(0.56, 0.84, 10, 1), 0, 0.845, 0, C.graniteLt, { rx: -Math.PI / 2, jit: 0.1, per: 2 });
    b.cyl(0, 0.5, 0, 0.56, 0.56, 0.7, 10, '#6d685f', { open: true, flip: true });
    b.geo(new THREE.CircleGeometry(0.56, 10), 0, 0.3, 0, '#1f2a2c', { rx: -Math.PI / 2, jit: 0 });
    for (const x of [-0.66, 0.66]) b.box(x, 1.55, 0, 0.1, 1.42, 0.1, C.wood, { noBottom: true, noTop: true });
    b.cyl(0, 1.95, 0, 0.05, 0.05, 1.42, 6, C.woodDk, { open: true, rz: Math.PI / 2 });
    for (const s of [-1, 1]) b.box(0, 2.36, s * 0.3, 1.6, 0.05, 0.7, C.slate, { rx: s * 0.62, jit: 0.1 });
    b.box(0, 1.7, 0, 0.012, 0.5, 0.012, C.rope, {});
    b.cyl(0, 1.38, 0, 0.12, 0.1, 0.18, 6, C.wood, { open: true });
    return b;
  };
  PROPS.jardiniere = () => {
    const b = new Builder(107);
    b.box(0, 0.22, 0, 1.0, 0.44, 0.44, C.granite, { noBottom: true, noTop: true, jit: 0.08 });
    b.box(0, 0.45, 0, 1.06, 0.05, 0.5, C.graniteLt, { noBottom: true });
    b.geo(new THREE.IcosahedronGeometry(0.3, 0), -0.22, 0.55, 0, C.leaf, { sx: 1.0, sy: 0.6, sz: 0.65, jit: 0.15, per: 1 });
    b.geo(new THREE.IcosahedronGeometry(0.3, 0), 0.22, 0.56, 0.02, C.leafDk, { sx: 1.0, sy: 0.65, sz: 0.65, ry: 0.7, jit: 0.15, per: 1 });
    const R = rng(5);
    for (let i = 0; i < 7; i++) b.geo(new THREE.OctahedronGeometry(0.075, 0), -0.4 + i * 0.13, 0.66 + R() * 0.1, (R() - 0.5) * 0.3, '#ffffff', { tint: 1, jit: 0.1, per: 1 });
    return b;
  };
  PROPS.charrette = () => {
    const b = new Builder(108);
    b.box(-0.1, 0.56, 0, 1.3, 0.07, 0.8, C.wood, { tint: 1 });
    for (const z of [-0.4, 0.4]) b.box(-0.1, 0.72, z, 1.3, 0.26, 0.04, C.woodLt, { tint: 1 });
    b.box(-0.75, 0.72, 0, 0.04, 0.26, 0.8, C.woodLt, { tint: 1 });
    for (const z of [-0.46, 0.46]) {
      b.cyl(-0.1, 0.42, z, 0.42, 0.42, 0.05, 10, C.woodDk, { rx: Math.PI / 2, jit: 0.04 });
      b.cyl(-0.1, 0.42, z * 1.06, 0.07, 0.07, 0.06, 6, C.iron, { rx: Math.PI / 2 });
    }
    for (const z of [-0.33, 0.33]) b.box(1.0, 0.6, z, 1.0, 0.05, 0.05, C.wood, { rz: 0.06 });
    b.box(0.5, 0.27, 0, 0.05, 0.54, 0.05, C.wood, { noBottom: true });
    b.geo(new THREE.IcosahedronGeometry(0.28, 0), -0.35, 0.78, -0.12, '#cdb98f', { sx: 1.1, sy: 0.7, sz: 0.8, jit: 0.1, per: 1 });
    b.geo(new THREE.IcosahedronGeometry(0.26, 0), 0.15, 0.76, 0.12, '#bca67c', { sx: 1.0, sy: 0.65, sz: 0.85, ry: 1, jit: 0.1, per: 1 });
    return b;
  };
  PROPS.cloture = () => {
    const b = new Builder(109);
    for (const x of [-0.9, 0.1]) b.box(x, 0.52, 0, 0.09, 1.04, 0.09, C.weather, { noBottom: true, tint: 1 });
    for (const y of [0.38, 0.78]) b.box(0, y, 0.06, 2.0, 0.09, 0.035, C.weather, { tint: 1 });
    return b;
  };
  PROPS.muret = () => {
    const b = new Builder(110);
    b.box(0, 0.33, 0, 2.0, 0.66, 0.5, C.granite, { noBottom: true, noTop: true, seg: [3, 2, 1], jit: 0.12, uvs: 1.4 });
    b.box(0, 0.7, 0, 2.02, 0.1, 0.56, C.graniteLt, { noBottom: true, seg: [3, 1, 1], jit: 0.1, uvs: 1.4 });
    return b;
  };
  PROPS.fanion = () => {
    const b = new Builder(111), S = 2.5, H = 4.0;
    for (const x of [-S, S]) { b.cyl(x, H / 2, 0, 0.035, 0.05, H, 5, C.weather, { open: true }); b.geo(new THREE.OctahedronGeometry(0.07, 0), x, H + 0.05, 0, '#d9b24a', {}); }
    const sag = (u) => H - 0.12 - 0.75 * Math.sin(Math.PI * u), seg = 5;
    for (let i = 0; i < seg; i++) {
      const u0 = i / seg, u1 = (i + 1) / seg, x0 = -S + 2 * S * u0, x1 = -S + 2 * S * u1, y0 = sag(u0), y1 = sag(u1);
      b.box((x0 + x1) / 2, (y0 + y1) / 2, 0, Math.hypot(x1 - x0, y1 - y0), 0.018, 0.018, C.rope, { rz: Math.atan2(y1 - y0, x1 - x0) });
    }
    const n = 11, FIX = ['#f4efe4', '#f4efe4', '#e4b62e'];
    for (let i = 0; i < n; i++) {
      const u = (i + 0.7) / (n + 0.4), x = -S + 2 * S * u, y = sag(u), g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-0.16, 0, 0, 0, -0.36, 0, 0.16, 0, 0], 3));
      const tinted = i % 2 === 0;
      b.geo(g, x, y, 0, tinted ? '#ffffff' : FIX[(i >> 1) % 3], { double: true, tint: tinted ? 1 : 0, jit: 0.05, flat: true, rz: Math.atan2(sag(u + 0.01) - y, 0.01 * 2 * S) });
    }
    return b;
  };
  const KINDS = Object.keys(PROPS);
  const PROP_MAT = { muret: 'stone' };
  const DEFAULT_TINT = {
    etal: ['#b8322a', '#2f5d8c', '#2f7a52', '#d39a2c', '#7a3b6e', '#c4572a'],
    jardiniere: ['#d8344a', '#e86fa0', '#f2c230', '#6f8fd6', '#f4f4f0', '#e0632e', '#8f6fd0'],
    fanion: ['#c8322b', '#2b5fa8', '#e5b322', '#2f8a57'],
  };
  const geoCache = {};
  function propGeometry(kind) { return geoCache[kind] || (geoCache[kind] = PROPS[kind]().geometry()); }
  KIT.propTriangles = () => { const o = {}; KINDS.forEach((k) => (o[k] = propGeometry(k).attributes.position.count / 3)); return o; };

  // ---------- habitants ----------
  // Rôles de couleur : 0 habit (teinte d'exemplaire), 1 peau, 2 cheveux, 3 chapeau/coiffe, 4 jambes, 5 chaussures, 6 tablier/devant.
  // Membres : 1/2 jambes, 3/4 bras, 5 tête. Morphes : 1 bas de jupe/manteau, 2 base du chapeau, 3 haut du chapeau, 4 bord du chapeau.
  function personGeometry() {
    const P = [], N = [], A = [];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    function tri(a, b, c, part) {
      const sa = a.s || a, sb = b.s || b, sc = c.s || c, e1 = sub(sb, sa), e2 = sub(sc, sa);
      let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const l = Math.hypot(n[0], n[1], n[2]) || 1; n = n.map((v) => v / l);
      for (const v of [a, b, c]) { const p = v.p || v; P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); A.push(part[0], part[1], v.m || 0, 0); }
    }
    // anneau de n points ; m = morphe (position = direction unité, hauteur décidée dans le shader), s = forme de référence pour la normale
    function ring(n, a0, cx, y, cz, rx, rz, m, dz) {
      const out = [];
      for (let k = 0; k < n; k++) {
        const a = a0 + (k * TAU) / n, x = Math.cos(a), z = Math.sin(a), s = [cx + rx * x, y, cz + rz * z + (dz || 0)];
        out.push(m ? { p: [x, 0, z], s, m } : s);
      }
      return out;
    }
    function side(L, U, roleFn, limb) { const n = L.length; for (let k = 0; k < n; k++) { const k1 = (k + 1) % n, r = roleFn(k); tri(L[k], U[k], U[k1], [r, limb]); tri(L[k], U[k1], L[k1], [r, limb]); } }
    function cap(R, role, limb, down) { for (let k = 1; k < R.length - 1; k++) down ? tri(R[0], R[k], R[k + 1], [role, limb]) : tri(R[0], R[k + 1], R[k], [role, limb]); }
    const hex = (k) => (k === 1 ? 6 : 0); // face avant (entre 60° et 120°)
    // jambes : hanche → cheville (jambe), cheville → semelle (chaussure)
    for (const [sx, limb] of [[1, 1], [-1, 2]]) {
      const x = 0.08 * sx, a = Math.PI / 4;
      const hip = ring(4, a, x, 0.7, 0, 0.068 * 1.414, 0.075 * 1.414), ank = ring(4, a, x, 0.1, 0.0, 0.055 * 1.414, 0.06 * 1.414), sole = ring(4, a, x, 0.0, 0.0, 0.06 * 1.414, 0.1 * 1.414, 0, 0.04);
      side(ank, hip, () => 4, limb); side(sole, ank, () => 5, limb);
    }
    // torse et pans (jupe, manteau ou vareuse)
    const hips = ring(6, 0, 0, 0.64, 0, 0.155, 0.112), sh = ring(6, 0, 0, 1.2, 0, 0.19, 0.105);
    side(hips, sh, hex, 0); cap(sh, 0, 0, false);
    const waist = ring(6, 0, 0, 0.76, 0, 0.165, 0.12), hem = ring(6, 0, 0, 0.5, 0, 0.19, 0.15, 1);
    side(hem, waist, hex, 0);
    // bras : épaule → poignet (manche), poignet → bout des doigts (main)
    for (const [sx, limb] of [[1, 3], [-1, 4]]) {
      const a = Math.PI / 4, s0 = ring(4, a, 0.235 * sx, 1.17, 0, 0.05 * 1.414, 0.055 * 1.414), w = ring(4, a, 0.255 * sx, 0.74, 0.01, 0.042 * 1.414, 0.047 * 1.414), h = ring(4, a, 0.258 * sx, 0.63, 0.015, 0.035 * 1.414, 0.042 * 1.414);
      side(w, s0, () => 0, limb); side(h, w, () => 1, limb);
    }
    // tête : facettes du haut et de l'arrière en cheveux
    const head = new THREE.IcosahedronGeometry(0.135, 0).toNonIndexed(), hp = head.attributes.position, HY = 1.335;
    for (let t = 0; t < hp.count; t += 3) {
      const v = [0, 1, 2].map((j) => [hp.getX(t + j), hp.getY(t + j) + HY, hp.getZ(t + j)]), cy = (v[0][1] + v[1][1] + v[2][1]) / 3 - HY, cz = (v[0][2] + v[1][2] + v[2][2]) / 3;
      tri(v[0], v[1], v[2], [cy > 0.04 || cz < -0.035 ? 2 : 1, 5]);
    }
    // chapeau : calotte (base → haut), dessus, bord ; formes réglées par variante dans le shader
    const hb = ring(6, 0, 0, 1.4, 0, 0.14, 0.14, 2), ht = ring(6, 0, 0, 1.48, 0, 0.13, 0.13, 3), brim = ring(6, 0, 0, 1.4, 0, 0.28, 0.28, 4);
    side(hb, ht, () => 3, 5); cap(ht, 3, 5, false); cap(brim, 3, 5, false);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 4));
    return g;
  }
  const v3 = (h) => { const c = lin(h); return 'vec3(' + c.r.toFixed(4) + ',' + c.g.toFixed(4) + ',' + c.b.toFixed(4) + ')'; };
  const POSE_GLSL = [
    'attribute vec4 aPart;', 'attribute vec4 aInfo;', 'uniform float uTime;',
    'vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }',
    'vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }',
    'bool near(float a, float b) { return abs(a - b) < 0.5; }',
    'void pose(inout vec3 p, inout vec3 n) {',
    '  float ph = aInfo.x, mv = aInfo.y, v = floor(aInfo.z + 0.5), limb = aPart.y, mo = aPart.z;',
    '  float w = uTime * 7.5 + ph, sw = sin(w) * mv;',
    // pans : vareuse courte, robe longue, manteau, blouse d'enfant
    '  if (near(mo, 1.0)) { vec2 k = near(v, 1.0) ? vec2(0.07, 0.27) : near(v, 2.0) ? vec2(0.34, 0.215) : vec2(0.5, 0.19); p.y = k.x; p.xz *= vec2(k.y, k.y * 0.8); }',
    // chapeaux : (baseY, baseR, hautY, hautR) et (bordR, décalage avant)
    '  if (mo > 1.5) {',
    '    vec4 H = vec4(1.335, 0.0, 1.335, 0.0); vec2 B = vec2(0.0);',
    '    if (near(v, 0.0)) { H = vec4(1.40, 0.142, 1.47, 0.14); B = vec2(0.165, 0.05); }',
    '    else if (near(v, 1.0)) { H = vec4(1.39, 0.095, 1.68, 0.08); B = vec2(0.11, -0.01); }',
    '    else if (near(v, 2.0)) { H = vec4(1.405, 0.13, 1.52, 0.115); B = vec2(0.30, 0.0); }',
    '    if (near(mo, 2.0)) { p.y = H.x; p.xz *= H.y; }',
    '    else if (near(mo, 3.0)) { p.y = H.z; p.xz *= H.w; }',
    '    else { p.y = H.x + 0.004; p.xz *= B.x; p.z += B.y; }',
    '  }',
    '  if (near(limb, 1.0) || near(limb, 2.0)) { float a = (near(limb, 1.0) ? sw : -sw) * (near(v, 1.0) ? 0.22 : 0.5); vec3 pv = vec3(0.0, 0.7, 0.0); p = pv + rotX(p - pv, a); n = rotX(n, a); }',
    '  if (near(limb, 3.0) || near(limb, 4.0)) { float idle = sin(uTime * 1.3 + ph * 2.0) * 0.07 * (1.0 - mv); float a = (near(limb, 3.0) ? -sw : sw) * 0.5 + (near(limb, 3.0) ? idle : -idle); vec3 pv = vec3(0.0, 1.15, 0.0); p = pv + rotX(p - pv, a); n = rotX(n, a); }',
    '  if (near(limb, 5.0)) { float turn = sin(uTime * 0.6 + ph * 3.0) * 0.45 * (1.0 - mv); vec3 pv = vec3(0.0, 1.2, 0.0); p = pv + rotY(p - pv, turn); n = rotY(n, turn); }',
    '  if (near(v, 3.0)) { if (near(limb, 5.0)) p = vec3(0.0, 1.2, 0.0) + (p - vec3(0.0, 1.2, 0.0)) * 1.28; p *= 0.62; }',
    '  p.y += mv * 0.04 * (1.0 - abs(sin(w)));',
    '}',
  ].join('\n');
  const COLOR_GLSL = [
    '{',
    '  float v = floor(aInfo.z + 0.5), h = aInfo.w, role = aPart.x;',
    '  vec3 skin = h < 0.42 ? ' + v3('#efc4a0') + ' : h < 0.72 ? ' + v3('#dfa882') + ' : h < 0.9 ? ' + v3('#bf8660') + ' : ' + v3('#8a5a3c') + ';',
    '  float h2 = fract(h * 7.31), h3 = fract(h * 3.77);',
    '  vec3 hair = h2 < 0.3 ? ' + v3('#2b1d14') + ' : h2 < 0.55 ? ' + v3('#5a3a22') + ' : h2 < 0.72 ? ' + v3('#8c5a2c') + ' : h2 < 0.86 ? ' + v3('#c9a46a') + ' : ' + v3('#b8b2a8') + ';',
    '  vec3 hat = near(v, 1.0) ? ' + v3('#f6f2e8') + ' : near(v, 2.0) ? ' + v3('#22201e') + ' : ' + v3('#283247') + ';',
    '  vec3 legs = near(v, 1.0) ? ' + v3('#2b2724') + ' : h3 < 0.4 ? ' + v3('#363c4e') + ' : h3 < 0.7 ? ' + v3('#4d3e30') + ' : ' + v3('#5e5c52') + ';',
    '  vec3 cloth = vec3(1.0);',
    '#ifdef USE_INSTANCING_COLOR', '  cloth = instanceColor.rgb;', '#endif',
    '  vec3 apron = near(v, 1.0) ? ' + v3('#ece4d2') + ' : cloth;',
    '  vColor = near(role, 1.0) ? skin : near(role, 2.0) ? hair : near(role, 3.0) ? hat : near(role, 4.0) ? legs : near(role, 5.0) ? ' + v3('#2a2019') + ' : near(role, 6.0) ? apron : cloth;',
    '}',
  ].join('\n');

  function People(cap) {
    const geo = personGeometry(), uniforms = { uTime: { value: 0 } };
    const info = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); info.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aInfo', info);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true });
    material.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uniforms.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + POSE_GLSL)
        .replace('#include <color_vertex>', '#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\n' + COLOR_GLSL + '\n#endif')
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( normal ); vec3 posed = vec3( position ); pose( posed, objectNormal );')
        .replace('#include <begin_vertex>', 'vec3 transformed = posed;');
    };
    material.customProgramCacheKey = () => 'kitStreetPeople';
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uniforms.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + POSE_GLSL).replace('#include <begin_vertex>', 'vec3 transformed = vec3( position ); vec3 dummyN = vec3( 0.0, 1.0, 0.0 ); pose( transformed, dummyN );');
    };
    depth.customProgramCacheKey = () => 'kitStreetPeopleDepth';
    const mesh = new THREE.InstancedMesh(geo, material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.setColorAt(0, new THREE.Color(1, 1, 1)); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.customDepthMaterial = depth; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.count = 0;
    // anneau doré sous les habitants nommés
    const rg = new THREE.RingGeometry(0.62, 0.84, 28, 1); rg.rotateX(-Math.PI / 2);
    const ring = new THREE.InstancedMesh(rg, new THREE.MeshBasicMaterial({ color: lin('#ffc63a'), toneMapped: false, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }), cap);
    ring.material.onBeforeCompile = (sh) => {
      // de loin, l'anneau grossit pour rester lisible (au moins ~15 px à 250 unités)
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', ['vec3 transformed = vec3( position );', '#ifdef USE_INSTANCING', '  vec4 rc = modelViewMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );', '  transformed.xz *= clamp( -rc.z / 60.0, 1.0, 7.0 );', '#endif'].join('\n'));
    };
    ring.material.customProgramCacheKey = () => 'kitStreetRing';
    ring.instanceMatrix.setUsage(THREE.DynamicDrawUsage); ring.frustumCulled = false; ring.castShadow = ring.receiveShadow = false; ring.renderOrder = 3; ring.count = 0;
    const named = new Uint8Array(cap), pos = new Float32Array(cap * 4), colors = new Map(), ia = info.array, ca = mesh.instanceColor.array;
    const linear = (h) => { let c = colors.get(h); if (!c) { c = lin(h); colors.set(h, c); } return c; };
    let n = 0;
    const api = {
      mesh, ring, capacity: cap,
      get count() { return n; },
      set count(v) { n = Math.max(0, Math.min(cap, v | 0)); },
      set(i, p) {
        if (i < 0 || i >= cap) return;
        const s = p.scale == null ? 1 : p.scale, r = p.rotY || 0, c = Math.cos(r) * s, sn = Math.sin(r) * s, e = mesh.instanceMatrix.array, o = i * 16;
        e[o] = c; e[o + 1] = 0; e[o + 2] = -sn; e[o + 3] = 0; e[o + 4] = 0; e[o + 5] = s; e[o + 6] = 0; e[o + 7] = 0;
        e[o + 8] = sn; e[o + 9] = 0; e[o + 10] = c; e[o + 11] = 0; e[o + 12] = p.x; e[o + 13] = p.y; e[o + 14] = p.z; e[o + 15] = 1;
        const seed = p.seed == null ? i * 0.6180339 : p.seed * 0.6180339;
        ia[i * 4] = p.phase || 0; ia[i * 4 + 1] = p.moving ? 1 : 0; ia[i * 4 + 2] = (p.variant | 0) & 3; ia[i * 4 + 3] = seed - Math.floor(seed);
        if (p.color) { const c = linear(p.color); ca[i * 3] = c.r; ca[i * 3 + 1] = c.g; ca[i * 3 + 2] = c.b; }
        named[i] = p.named ? 1 : 0; pos[i * 4] = p.x; pos[i * 4 + 1] = p.y; pos[i * 4 + 2] = p.z; pos[i * 4 + 3] = s;
      },
      commit() {
        mesh.count = n;
        for (const a of [mesh.instanceMatrix, mesh.instanceColor, info]) { a.updateRange.offset = 0; a.updateRange.count = Math.max(1, n) * a.itemSize; a.needsUpdate = true; }
        let k = 0; const e = ring.instanceMatrix.array;
        for (let i = 0; i < n; i++) if (named[i]) {
          const s = Math.max(0.8, pos[i * 4 + 3]), o = k * 16; e.fill(0, o, o + 16);
          e[o] = s; e[o + 5] = 1; e[o + 10] = s; e[o + 12] = pos[i * 4]; e[o + 13] = pos[i * 4 + 1] + 0.03; e[o + 14] = pos[i * 4 + 2]; e[o + 15] = 1; k++;
        }
        ring.count = k; ring.instanceMatrix.updateRange.count = Math.max(1, k) * 16; ring.instanceMatrix.needsUpdate = true;
      },
      update(t) { uniforms.uTime.value = t; },
    };
    return api;
  }

  // ---------- le kit : mobilier en lots + habitants ----------
  KIT.create = function (opts) {
    opts = opts || {};
    const maxProps = opts.maxProps || 2500, maxPeople = opts.maxPeople || 700, group = new THREE.Group(), meshes = {}, dummy = new THREE.Object3D(), col = new THREE.Color();
    group.name = 'kit-street';
    for (const kind of KINDS) {
      const m = new THREE.InstancedMesh(propGeometry(kind), mat(PROP_MAT[kind] || 'plain'), maxProps);
      m.setColorAt(0, col.setRGB(1, 1, 1)); m.count = 0; m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; m.visible = false; m.name = kind;
      meshes[kind] = m; group.add(m);
    }
    const people = People(maxPeople);
    group.add(people.mesh); group.add(people.ring);
    const kit = {
      group, people, meshes,
      reset() { for (const k in meshes) { meshes[k].count = 0; meshes[k].visible = false; } },
      addProp(kind, x, y, z, rotY, o) {
        const m = meshes[kind]; if (!m || m.count >= maxProps) return -1;
        o = o || {}; const i = m.count++, seed = o.seed == null ? hashXZ(x, z) : o.seed | 0, R = rng(seed + 17);
        dummy.position.set(x, y, z); dummy.rotation.set(0, rotY || 0, 0); dummy.scale.setScalar(o.scale == null ? 1 : o.scale); dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        if (o.tint) col.copy(lin(o.tint));
        else if (DEFAULT_TINT[kind]) col.copy(lin(pick(R, DEFAULT_TINT[kind])));
        else { const f = 0.86 + R() * 0.22; col.setRGB(f, f * (0.98 + R() * 0.04), f * (0.95 + R() * 0.06)); }
        m.setColorAt(i, col);
        return i;
      },
      commit() {
        for (const k in meshes) { const m = meshes[k]; m.visible = m.count > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
      },
    };
    return kit;
  };

  // ---------- grands modèles ----------
  function groupOf(parts) { const g = new THREE.Group(); parts.forEach((p) => p && g.add(p)); return g; }
  function waterDisc(r, y, seg) { const g = new THREE.CircleGeometry(r, seg || 24); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); const m = new THREE.Mesh(g, mat('water')); m.receiveShadow = true; return m; }

  KIT.fontaine = function (radius) {
    const r = radius || 1.6, S = new Builder(201), seg = 16;
    S.cyl(0, 0.08, 0, r + 0.38, r + 0.44, 0.16, seg, C.graniteLt, { noBottom: true, jit: 0.1, uvs: 1.5 });
    S.cyl(0, 0.46, 0, r, r + 0.06, 0.6, seg, C.granite, { open: true, hs: 2, jit: 0.1, uvs: 1.5 });
    S.cyl(0, 0.8, 0, r + 0.09, r + 0.09, 0.09, seg, C.graniteLt, { open: true, jit: 0.06 });
    S.geo(new THREE.RingGeometry(r - 0.2, r + 0.09, seg, 1), 0, 0.845, 0, C.graniteLt, { rx: -Math.PI / 2, jit: 0.1, uvs: 1.5 });
    S.cyl(0, 0.55, 0, r - 0.2, r - 0.2, 0.6, seg, '#8d887d', { open: true, flip: true });
    S.cyl(0, 0.3, 0, 0.36, 0.48, 0.5, 8, C.granite, { open: true });
    S.cyl(0, 1.25, 0, 0.13, 0.19, 1.4, 8, C.graniteLt, { open: true });
    S.cyl(0, 1.98, 0, 0.66, 0.2, 0.3, 12, C.granite, { open: true });
    S.cyl(0, 2.14, 0, 0.68, 0.68, 0.04, 12, C.graniteLt, { open: true });
    S.cyl(0, 2.38, 0, 0.07, 0.1, 0.44, 6, C.graniteLt, { open: true });
    S.geo(new THREE.IcosahedronGeometry(0.12, 0), 0, 2.66, 0, C.graniteLt, { jit: 0.05 });
    const W = new Builder(202);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; W.cyl(Math.cos(a) * 0.9, 1.45, Math.sin(a) * 0.9, 0.03, 0.05, 1.3, 4, '#ffffff', { open: true, rz: Math.cos(a) * 0.3, rx: -Math.sin(a) * 0.3, jit: 0 }); }
    const jets = new THREE.Mesh(W.geometry(), mat('water'));
    return { group: groupOf([meshOf(S, mat('stone')), waterDisc(r - 0.2, 0.72, seg), waterDisc(0.62, 2.12, 12), jets]) };
  };

  KIT.kiosque = function () {
    const S = new Builder(211), P = new Builder(212), R0 = 3, cream = '#efe8d6', roof = '#5d7a74';
    S.cyl(0, 0.45, 0, R0, R0 + 0.12, 0.9, 8, C.granite, { noBottom: true, hs: 2, jit: 0.08, uvs: 1.4 });
    S.cyl(0, 0.93, 0, R0 + 0.1, R0 + 0.1, 0.06, 8, C.graniteLt, { open: true });
    for (let i = 0; i < 3; i++) S.box(0, 0.15 + i * 0.3 - 0.15 * i, R0 + 0.55 - i * 0.32, 1.5, 0.3 * (i + 1), 0.34, C.graniteLt, { noBottom: true, jit: 0.05 });
    P.geo(new THREE.CircleGeometry(R0 - 0.05, 8), 0, 0.905, 0, C.woodLt, { rx: -Math.PI / 2, ry: 0, jit: 0.05 });
    const cols = [];
    for (let i = 0; i < 8; i++) { const a = ((i + 0.5) / 8) * TAU; cols.push([Math.cos(a) * (R0 - 0.35), Math.sin(a) * (R0 - 0.35)]); }
    cols.forEach(([x, z]) => P.cyl(x, 2.25, z, 0.07, 0.09, 2.7, 6, cream, { open: true }));
    for (let i = 0; i < 8; i++) {
      const [x0, z0] = cols[i], [x1, z1] = cols[(i + 1) % 8], mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, L = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0);
      if (mz > 2 && Math.abs(mx) < 1) continue; // entrée face à l'escalier
      for (const y of [1.15, 1.8]) P.box(mx, y, mz, L, 0.06, 0.06, cream, { ry });
      for (let k = 1; k < 6; k++) { const t = k / 6; P.box(x0 + (x1 - x0) * t, 1.47, z0 + (z1 - z0) * t, 0.03, 0.62, 0.03, C.iron, { ry }); }
      P.box(mx, 3.48, mz, L, 0.2, 0.05, cream, { ry });
    }
    P.cyl(0, 3.66, 0, R0 + 0.1, R0 + 0.1, 0.16, 8, cream, { open: true, ry: Math.PI / 8 });
    P.cyl(0, 4.45, 0, 0.35, R0 + 0.35, 1.4, 8, (p, n, k) => (k % 2 ? roof : '#678680'), { open: true, ry: Math.PI / 8, jit: 0.03, per: 1 });
    P.cyl(0, 5.35, 0, 0.32, 0.32, 0.4, 8, cream, { open: true, ry: Math.PI / 8 });
    P.cyl(0, 5.8, 0, 0, 0.5, 0.5, 8, roof, { ry: Math.PI / 8, noBottom: true });
    P.cyl(0, 6.2, 0, 0.01, 0.04, 0.4, 4, '#c9a24a', { open: true });
    return { group: groupOf([meshOf(S, mat('stone')), meshOf(P, mat('plain'))]) };
  };

  KIT.bassin = function (radius) {
    const r = radius || 4, S = new Builder(221), P = new Builder(222), seg = Math.max(16, Math.round(r * 6));
    S.cyl(0, 0.2, 0, r + 0.32, r + 0.36, 0.4, seg, C.granite, { open: true, jit: 0.1, per: 2, uvs: 1.4 });
    S.geo(new THREE.RingGeometry(r, r + 0.36, seg, 1), 0, 0.4, 0, C.graniteLt, { rx: -Math.PI / 2, jit: 0.12, per: 1, uvs: 1.4 });
    S.cyl(0, 0.2, 0, r, r, 0.4, seg, '#8a857a', { open: true, flip: true });
    const R = rng(Math.round(r * 13));
    for (let i = 0; i < 7; i++) {
      const a = R() * TAU, d = r * (0.35 + R() * 0.5), x = Math.cos(a) * d, z = Math.sin(a) * d;
      P.cyl(x, 0.27, z, 0.22 + R() * 0.12, 0.22, 0.02, 7, R() < 0.5 ? '#4f8a3c' : '#5c9645', { t0: 0.3, tl: TAU - 0.6, ry: R() * TAU, noBottom: true, jit: 0.04 });
      if (R() < 0.4) P.geo(new THREE.OctahedronGeometry(0.06, 0), x + 0.05, 0.3, z, '#f3b7c8', {});
    }
    return { group: groupOf([meshOf(S, mat('stone')), meshOf(P, mat('plain'), false), waterDisc(r, 0.25, seg)]) };
  };

  KIT.quai = function (length) {
    const L = length || 30, Wd = 3.5, top = 1.4, P = new Builder(231), R = rng(Math.round(L * 7) + 3);
    // tablier : planches (matériau 'quai'), u en travers, v = x / largeur
    const n = Math.max(1, Math.ceil(L / 2)), pos = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) { const x = (i / n) * L; pos.push(x, top, Wd / 2, x, top, -Wd / 2); uv.push(0, x / Wd, 1, x / Wd); if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); dg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); dg.setIndex(idx); dg.computeVertexNormals();
    const deck = new THREE.Mesh(dg, KIT.groundMaterial('quai')); deck.receiveShadow = true;
    P.box(L / 2, top - 0.18, 0, L, 0.3, Wd - 0.2, '#5e4c3a', { noTop: true, jit: 0.03 });
    for (const s of [-1, 1]) P.box(L / 2, top - 0.2, s * (Wd / 2 - 0.05), L, 0.4, 0.12, '#6f5a44', { noTop: false, jit: 0.04 });
    const np = Math.max(2, Math.round(L / 2.5) + 1);
    for (let i = 0; i < np; i++) {
      const x = 0.15 + (i / (np - 1)) * (L - 0.3);
      for (const s of [-1, 1]) {
        P.cyl(x, -2.85, s * (Wd / 2 - 0.12), 0.15, 0.16, 6.3, 6, '#3c4636', { open: true, jit: 0.05 });
        P.cyl(x, 0.85, s * (Wd / 2 - 0.12), 0.15, 0.15, 1.1, 6, '#6b5a48', { open: true, jit: 0.05 });
      }
      if (i % 2 === 0) P.box(x, 0.4, 0, 0.08, 0.1, Math.hypot(Wd, 1.0), C.woodDk, { rx: Math.atan2(1.0, Wd), jit: 0.05 });
    }
    for (let x = 2.5; x < L - 1; x += 6) { P.cyl(x, top + 0.2, Wd / 2 - 0.35, 0.11, 0.14, 0.4, 8, C.iron, { open: true }); P.cyl(x, top + 0.43, Wd / 2 - 0.35, 0.17, 0.17, 0.07, 8, C.ironHi, { noBottom: true }); }
    // échelle vers l'eau
    const lx = L * 0.62;
    for (const dx of [-0.25, 0.25]) P.box(lx + dx, 0.4, Wd / 2 + 0.06, 0.06, 2.2, 0.06, C.woodDk, {});
    for (let y = -0.5; y < top; y += 0.35) P.box(lx, y, Wd / 2 + 0.06, 0.5, 0.04, 0.05, C.woodDk, {});
    // vie du port : caisses, tonneaux, filets, casiers, rouleaux de cordage
    const things = Math.max(2, Math.round(L / 5));
    for (let i = 0; i < things; i++) {
      const x = 1 + R() * (L - 2), z = -Wd / 2 + 0.5 + R() * 0.6, t = R();
      if (t < 0.25) P.box(x, top + 0.2, z, 0.6, 0.4, 0.45, '#a98a62', { noBottom: true, ry: R(), seg: [1, 2, 1], jit: 0.1 });
      else if (t < 0.5) P.geo(new THREE.IcosahedronGeometry(0.45, 0), x, top + 0.12, z, pick(R, ['#b8643a', '#3f6d8c', '#7b8a4a']), { sy: 0.38, ry: R() * 3, jit: 0.15, per: 1 });
      else if (t < 0.75) { for (let k = 0; k < 2; k++) P.cyl(x + k * 0.55, top + 0.18, z, 0.25, 0.25, 0.5, 6, k ? '#8d6b45' : '#7a5c3c', { rz: Math.PI / 2, ry: 0.1, t0: 0, tl: Math.PI, jit: 0.08 }); }
      else P.geo(new THREE.TorusGeometry(0.2, 0.06, 4, 9), x, top + 0.06, z, C.rope, { rx: Math.PI / 2, jit: 0.05 });
    }
    return { group: groupOf([deck, meshOf(P, mat('plain'))]) };
  };

  // Coque : sections de l'arrière (t=0) à l'étrave (t=1), bandes peintes selon la hauteur.
  function hull(b, L, B, o) {
    const n = 12, keelY = (t) => -0.55 + 0.42 * Math.pow(t, 3), sheer = (t) => o.sheer + 0.32 * Math.pow(Math.max(0, t - 0.5) * 2, 2) + 0.12 * Math.pow(Math.max(0, 0.5 - t) * 2, 2);
    const halfW = (t) => (B / 2) * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.86 + 0.14)), 0.62);
    const sec = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = -L / 2 + t * L, k = keelY(t), s = sheer(t), lv = [k, k * 0.5, 0.0, 0.12, s - 0.17, s], pts = [];
      for (let j = 0; j < lv.length; j++) { const y = Math.max(lv[j], j ? pts[j - 1][1] + 0.01 : -9), u = (y - k) / (s - k); pts.push([x, y, halfW(t) * Math.pow(Math.sin((Math.max(0, u) * Math.PI) / 2), 0.55) * (1 + 0.04 * u)]); }
      sec.push(pts);
    }
    const colorAt = (y, ys) => (y < 0.0 ? o.bottom : y < 0.13 ? o.boot : y > ys - 0.18 ? o.strake : o.hull);
    const pos = [], add = (a, b2, c) => pos.push(...a, ...b2, ...c);
    for (const sz of [1, -1]) for (let i = 0; i < n; i++) for (let j = 0; j < 5; j++) {
      const A = sec[i][j], Bp = sec[i + 1][j], Cp = sec[i + 1][j + 1], D = sec[i][j + 1], f = (p) => [p[0], p[1], p[2] * sz];
      if (sz > 0) { add(f(A), f(Cp), f(Bp)); add(f(A), f(D), f(Cp)); } else { add(f(A), f(Bp), f(Cp)); add(f(A), f(Cp), f(D)); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    const ys = sheer(0.5);
    b.add(g, new THREE.Matrix4(), (p) => colorAt(p.y, ys + (p.x > 0 ? 0.2 : 0.05)), { flat: true, jit: 0.03 });
    // tableau arrière
    const st = sec[0], tp = [];
    for (let j = 0; j < 5; j++) { tp.push(...[st[j][0], st[j][1], -st[j][2]], ...[st[j][0], st[j + 1][1], -st[j + 1][2]], ...[st[j][0], st[j][1], st[j][2]]); tp.push(...[st[j][0], st[j][1], st[j][2]], ...[st[j][0], st[j + 1][1], -st[j + 1][2]], ...[st[j][0], st[j + 1][1], st[j + 1][2]]); }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
    b.add(tg, new THREE.Matrix4(), (p) => colorAt(p.y, ys), { flat: true, double: true, jit: 0.02 });
    // intérieur (bordé vu du dedans) et pont ou fond
    const inner = [], deckY = o.open ? -0.25 : ys - 0.12;
    for (let i = 0; i < n; i++) {
      const a = sec[i], c = sec[i + 1], ya = Math.max(deckY, a[4][1] - 0.05), j0 = 4;
      for (const sz of [1, -1]) {
        const p = (q, y, sh) => [q[0], y, q[2] * sz * sh];
        const A = p(a[j0], Math.min(ya, a[5][1]), 0.94), Bp = p(c[j0], Math.min(ya, c[5][1]), 0.94), Cp = p(c[5], c[5][1], 0.94), D = p(a[5], a[5][1], 0.94);
        if (sz > 0) inner.push(...A, ...Bp, ...Cp, ...A, ...Cp, ...D); else inner.push(...A, ...Cp, ...Bp, ...A, ...D, ...Cp);
      }
    }
    const ig = new THREE.BufferGeometry(); ig.setAttribute('position', new THREE.Float32BufferAttribute(inner, 3));
    b.add(ig, new THREE.Matrix4(), o.inside, { flat: true, jit: 0.05 });
    const dk = [];
    for (let i = 0; i < n; i++) {
      const wa = halfW(i / n) * 0.9, wc = halfW((i + 1) / n) * 0.9, xa = sec[i][0][0], xc = sec[i + 1][0][0], ya = o.open ? deckY : sheer(i / n) - 0.12, yc = o.open ? deckY : sheer((i + 1) / n) - 0.12;
      const sa = o.open ? 0.62 : 1, sc = sa;
      dk.push(xa, ya, wa * sa, xc, yc, wc * sc, xc, yc, -wc * sc, xa, ya, wa * sa, xc, yc, -wc * sc, xa, ya, -wa * sa);
    }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(dk, 3));
    b.add(dg, new THREE.Matrix4(), o.deck, { flat: true, jit: 0.06, per: 1 });
    return { sheer, halfW, deckY };
  }
  KIT.bateau = function (seed) {
    seed = seed == null ? 0 : seed | 0;
    const R = rng(seed * 31 + 5), variant = ((seed % 3) + 3) % 3, P = new Builder(240 + seed), Sl = new Builder(250 + seed);
    const HULLS = [['#2d5b8a', '#f2ede0'], ['#2f6b4f', '#e9c84a'], ['#b8432f', '#f2ede0'], ['#e9e3d4', '#2d5b8a'], ['#1f2a36', '#c8432f'], ['#d9a62c', '#25384a']];
    const [hc, sc] = pick(R, HULLS);
    const inner = new THREE.Group(), group = new THREE.Group(); group.add(inner);
    if (variant === 2) {
      // canot à rames
      const L = 3.4, h = hull(P, L, 1.25, { sheer: 0.42, open: true, hull: hc, strake: sc, boot: hc, bottom: '#7a2e22', inside: '#b99a72', deck: '#9c7d58' });
      for (const x of [-0.6, 0.35]) P.box(x, 0.22, 0, 0.22, 0.04, 1.0, C.woodLt, {});
      for (const s of [-1, 1]) { P.box(-0.1, 0.28, s * 0.22, 2.4, 0.035, 0.07, C.woodLt, { ry: s * 0.08 }); P.box(1.05, 0.28, s * 0.25, 0.4, 0.02, 0.13, C.woodLt, { ry: s * 0.08 }); }
      void h;
    } else {
      const L = 7, B = 2.3, h = hull(P, L, B, { sheer: 0.72, hull: hc, strake: sc, boot: '#f2ede0', bottom: '#7a2e22', inside: '#d8d2c4', deck: '#a88a64' });
      const mx = 1.0, dY = h.sheer(0.64) - 0.12;
      P.cyl(mx, dY + 3.0, 0, 0.06, 0.1, 6.0, 6, C.woodLt, { open: true });
      P.cyl(L / 2 + 0.5, h.sheer(1) - 0.05, 0, 0.04, 0.06, 1.6, 5, C.woodLt, { open: true, rz: Math.PI / 2 - 0.12 });
      P.box(-L / 2 - 0.12, 0.05, 0, 0.12, 1.1, 0.07, C.woodDk, {});
      P.box(-1.0, dY + 0.35, 0, 1.3, 0.7, 1.1, '#e8e2d2', { noBottom: true });
      P.box(-1.0, dY + 0.74, 0, 1.45, 0.08, 1.25, sc, { noBottom: true });
      for (let i = 0; i < 3; i++) P.cyl(1.8 + R() * 1.0, dY + 0.15, (R() - 0.5) * 1.0, 0.22, 0.22, 0.45, 6, '#7a5c3c', { rz: Math.PI / 2, t0: 0, tl: Math.PI, jit: 0.08 });
      P.geo(new THREE.IcosahedronGeometry(0.4, 0), 0.0, dY + 0.1, 0.5, pick(R, ['#b8643a', '#3f6d8c']), { sy: 0.35, jit: 0.15, per: 1 });
      const sail = variant === 0 ? '#8b4128' : '#c98a45';
      if (variant === 0) {
        // voile au tiers tannée, à la façon des bateaux de pêche bretons
        const top = dY + 5.6, g = new THREE.BufferGeometry(), nx = 4, ny = 4, pts = [];
        const corner = (u, v) => { const a = [mx + 0.5, dY + 0.55], b = [mx - 2.7, dY + 0.75], c = [mx - 3.0, top], d = [mx + 0.35, top - 1.1]; const lo = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], hi = [d[0] + (c[0] - d[0]) * u, d[1] + (c[1] - d[1]) * u]; return [lo[0] + (hi[0] - lo[0]) * v, lo[1] + (hi[1] - lo[1]) * v, 0.12 + 0.35 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v)]; };
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const a = corner(i / nx, j / ny), b = corner((i + 1) / nx, j / ny), c = corner((i + 1) / nx, (j + 1) / ny), d = corner(i / nx, (j + 1) / ny); pts.push(...a, ...b, ...c, ...a, ...c, ...d); }
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        Sl.add(g, new THREE.Matrix4(), (p) => (Math.abs(p.y - (dY + 1.9)) < 0.18 ? '#6e321f' : sail), { double: true, flat: true, jit: 0.04 });
        const yd = [mx + 0.35, top - 1.1, mx - 3.0, top], yl = Math.hypot(yd[2] - yd[0], yd[3] - yd[1]);
        P.cyl((yd[0] + yd[2]) / 2, (yd[1] + yd[3]) / 2, 0.12, 0.035, 0.035, yl, 4, C.woodDk, { open: true, rz: Math.PI / 2 + Math.atan2(yd[3] - yd[1], yd[2] - yd[0]) });
        // tapecul à l'arrière
        P.cyl(-2.9, dY + 1.6, 0, 0.04, 0.06, 3.2, 5, C.woodLt, { open: true });
        const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute([-2.85, dY + 0.6, 0.08, -2.85, dY + 3.0, 0.08, -4.2, dY + 0.75, 0.08], 3));
        Sl.add(g2, new THREE.Matrix4(), sail, { double: true, flat: true });
      } else {
        // voile ferlée le long de la vergue
        P.cyl(mx - 1.2, dY + 4.6, 0.1, 0.13, 0.1, 3.2, 6, '#e6dcc4', { open: true, rz: Math.PI / 2 - 0.25, jit: 0.06 });
      }
      const fl = new THREE.BufferGeometry(); fl.setAttribute('position', new THREE.Float32BufferAttribute([mx, dY + 6.0, 0, mx - 0.6, dY + 5.9, 0, mx, dY + 5.75, 0], 3));
      Sl.add(fl, new THREE.Matrix4(), '#c8322b', { double: true, flat: true });
    }
    inner.add(meshOf(P, mat('plain')));
    if (Sl.tris()) inner.add(meshOf(Sl, mat('plain')));
    const ph = R() * TAU;
    return {
      group,
      animate(t) { inner.position.y = Math.sin(t * 1.1 + ph) * 0.05; inner.rotation.z = Math.sin(t * 0.9 + ph) * 0.025; inner.rotation.x = Math.sin(t * 0.7 + ph * 2) * 0.035; },
    };
  };

  KIT.pont = function (length, width) {
    const L = length || 14, W = width || 5, E = 1.6, deep = -8, S = new Builder(261), V = new Builder(262);
    const nA = Math.max(1, Math.round(L / 11)), pier = nA > 1 ? 1.4 : 0, span = (L - (nA - 1) * pier) / nA, crown = -0.85;
    const rise = Math.min(span / 2, 6), Rr = (rise * rise + (span / 2) * (span / 2)) / (2 * rise), spring = crown - rise, half = Math.asin(Math.min(1, span / 2 / Rr));
    const arches = [];
    for (let i = 0; i < nA; i++) arches.push(-L / 2 + i * (span + pier) + span / 2);
    const pts = [[-L / 2 - E, 0], [-L / 2 - E, deep]];
    for (const xc of arches) {
      const x0 = xc - span / 2, x1 = xc + span / 2, cy = crown - Rr;
      pts.push([x0, deep], [x0, spring]);
      for (let k = 1; k < 14; k++) { const a = Math.PI / 2 + half - (2 * half * k) / 14; pts.push([xc + Math.cos(a) * Rr, cy + Math.sin(a) * Rr]); }
      pts.push([x1, spring], [x1, deep]);
    }
    pts.push([L / 2 + E, deep], [L / 2 + E, 0]);
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const body = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false, steps: 1 }); body.translate(0, 0, -W / 2);
    S.add(body, new THREE.Matrix4(), (p, n) => (n.y > 0.9 ? '#9d978b' : p.y < -2.6 ? '#8f8a7c' : C.granite), { jit: 0.06, per: 1, uvs: 2.4 });
    // claveaux en saillie autour des arches
    for (const xc of arches) {
      const cy = crown - Rr, ring = [];
      for (let k = 0; k <= 14; k++) { const a = Math.PI / 2 + half - (2 * half * k) / 14; ring.push(new THREE.Vector2(xc + Math.cos(a) * Rr, cy + Math.sin(a) * Rr)); }
      for (let k = 14; k >= 0; k--) { const a = Math.PI / 2 + half - (2 * half * k) / 14; ring.push(new THREE.Vector2(xc + Math.cos(a) * (Rr + 0.5), cy + Math.sin(a) * (Rr + 0.5))); }
      const vg = new THREE.ExtrudeGeometry(new THREE.Shape(ring), { depth: W + 0.16, bevelEnabled: false }); vg.translate(0, 0, -W / 2 - 0.08);
      V.add(vg, new THREE.Matrix4(), C.graniteLt, { jit: 0.1, per: 2, uvs: 1.2 });
    }
    // avant-becs des piles
    for (let i = 1; i < nA; i++) {
      const x = -L / 2 + i * (span + pier) - pier / 2, h = spring + 0.6 - deep;
      for (const s of [-1, 1]) {
        S.cyl(x, deep + h / 2, s * W / 2, pier * 0.58, pier * 0.58, h, 3, C.granite, { ry: s > 0 ? -Math.PI / 2 : Math.PI / 2, open: true, uvs: 2.4, jit: 0.05 });
        S.cyl(x, deep + h + 0.45, s * W / 2, 0, pier * 0.58, 0.9, 3, C.graniteLt, { ry: s > 0 ? -Math.PI / 2 : Math.PI / 2, open: true, jit: 0.05 });
      }
    }
    // corniche, parapets et couvertines
    for (const s of [-1, 1]) {
      V.box(0, -0.12, s * (W / 2 + 0.02), L + 2 * E, 0.18, 0.2, C.graniteLt, { jit: 0.04, uvs: 1.6 });
      S.box(0, 0.42, s * (W / 2 - 0.17), L + 2 * E, 0.84, 0.34, C.granite, { noBottom: true, seg: [Math.round(L / 2) + 2, 1, 1], jit: 0.08, uvs: 1.6 });
      V.box(0, 0.88, s * (W / 2 - 0.17), L + 2 * E + 0.1, 0.1, 0.46, C.graniteLt, { noBottom: true, seg: [Math.round(L) + 3, 1, 1], jit: 0.08, per: 2, uvs: 1.6 });
    }
    // chaussée pavée entre les parapets (matériau 'pave', u en travers, v = x / largeur)
    const dw = W - 0.68, n = Math.ceil((L + 2 * E) / 1.5), pos = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) { const x = -L / 2 - E + ((L + 2 * E) * i) / n; pos.push(x, 0.015, dw / 2, x, 0.015, -dw / 2); uv.push(0, x / dw, 1, x / dw); if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); dg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); dg.setIndex(idx); dg.computeVertexNormals();
    const road = new THREE.Mesh(dg, KIT.groundMaterial('pave')); road.receiveShadow = true;
    return { group: groupOf([meshOf(S, mat('stone')), meshOf(V, mat('stone')), road]) };
  };
})();
