// Terrain : grille de hauteurs + biomes, génération, pinceaux, rendu 2D peint.
(function () {
  const GW = 160, GH = 112, WW = 1000, WH = 700, SEA = 97;
  const BIOMES = [
    { name: 'Mer', color: [44, 132, 196] },
    { name: 'Sable', color: [242, 224, 164] },
    { name: 'Prairie', color: [182, 214, 96] },
    { name: 'Forêt', color: [92, 172, 76] },
    { name: 'Pinède', color: [46, 124, 86] },
    { name: 'Marais', color: [116, 152, 98] },
    { name: 'Désert', color: [238, 198, 114] },
    { name: 'Toundra', color: [198, 206, 182] },
    { name: 'Roche', color: [176, 132, 100] },
  ];
  const SNOW = [244, 245, 240], SHALLOW = [116, 196, 214], DEEP = [38, 104, 160];
  const T = (window.TERRAIN = { GW, GH, WW, WH, SEA, BIOMES, version: 0 });
  let H = null, B = null;

  // ---------- bruit déterministe ----------
  function hash(x, y, s) { let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s, oct = 4) { let t = 0, amp = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { t += vnoise(x * f, y * f, s + i * 17) * amp; n += amp; amp *= 0.5; f *= 2; } return t / n; }

  // ---------- génération (mêmes îles que la carte d'origine) ----------
  const ISLES = [[370, 330, 160, 0.3, 1], [770, 215, 78, 0.34, 0], [195, 575, 40, 0.3, 0], [560, 160, 26, 0.12, 0], [628, 262, 17, 0.1, 0], [865, 430, 34, 0.16, 0], [118, 235, 30, 0.14, 0], [470, 610, 22, 0.1, 0], [905, 610, 20, 0.1, 0], [712, 612, 13, 0.08, 0]];
  function generate(seed) {
    H = new Uint8Array(GW * GH); B = new Uint8Array(GW * GH);
    const ph = ISLES.map((_, i) => [0, 1, 2, 3].map((k) => hash(i, k, seed) * Math.PI * 2));
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const wx = (gx / (GW - 1)) * WW, wy = (gy / (GH - 1)) * WH;
      let land = -1, ridge = 0;
      ISLES.forEach(([cx, cy, R, A, mtn], i) => {
        const a = Math.atan2(wy - cy, wx - cx), p = ph[i];
        const k = 1 + 0.17 * Math.sin(2 * a + p[0]) + 0.11 * Math.sin(3 * a + p[1]) + 0.07 * Math.sin(5 * a + p[2]) + 0.04 * Math.sin(9 * a + p[3]);
        const d = Math.hypot(wx - cx, wy - cy) / (R * k), inside = 1 - d;
        const v = inside > 0 ? A * Math.pow(inside, 0.8) + 0.02 : inside * 0.6;
        if (v > land) land = v;
        if (mtn && inside > 0) ridge = Math.max(ridge, Math.pow(inside, 1.6) * (1 - Math.abs(fbm(wx / 90, wy / 90, seed + 5) - 0.5) * 2));
      });
      let h = 0.38 + land + ridge * 0.26 + (fbm(wx / 70, wy / 70, seed) - 0.5) * 0.1;
      h = Math.max(0, Math.min(1, h));
      const i = gy * GW + gx;
      H[i] = Math.round(h * 255);
      B[i] = biomeFor(h, fbm(wx / 120, wy / 120, seed + 9), wx, wy);
    }
    T.version++;
  }
  function biomeFor(h, m, wx, wy) {
    const sea = SEA / 255;
    if (h < sea) return 0;
    const t = (h - sea) / (1 - sea);
    if (t < 0.03) return 1;
    if (t > 0.5) return 8;
    if (wx > 660 && wy < 330) return m > 0.5 ? 5 : 4; // Île Morne : marais et pins sombres
    if (wy > 520 && wx < 280) return t > 0.2 ? 8 : 7; // Kerhold : rocaille et toundra
    if (m > 0.6 && t < 0.12) return 5;
    if (m > 0.55) return t > 0.22 ? 4 : 3;
    if (m > 0.44) return 3;
    if (m < 0.3 && t < 0.2) return 6;
    return 2;
  }

  // ---------- sauvegarde ----------
  const enc = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); };
  const dec = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  T.init = function (state) {
    const t = state.terrain;
    if (t && t.h && t.b) { try { H = dec(t.h); B = dec(t.b); if (H.length === GW * GH && B.length === GW * GH) { T.version++; return; } } catch (e) {} }
    generate((state.map && state.map.seed) || 11);
    T.save(state);
  };
  T.save = (state) => { state.terrain = { h: enc(H), b: enc(B) }; };
  T.regenerate = (state, seed) => { generate(seed); T.save(state); };

  // ---------- lecture ----------
  T.cell = (gx, gy) => gy * GW + gx;
  T.hAt = (gx, gy) => H[Math.max(0, Math.min(GH - 1, gy)) * GW + Math.max(0, Math.min(GW - 1, gx))] / 255;
  T.bAt = (gx, gy) => B[Math.max(0, Math.min(GH - 1, gy)) * GW + Math.max(0, Math.min(GW - 1, gx))];
  T.sample = function (fx, fy) { // coordonnées de grille flottantes -> hauteur 0..1 (bilinéaire)
    const x0 = Math.max(0, Math.min(GW - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(GH - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0)), i = y0 * GW + x0;
    const a = H[i], b = H[i + 1], c = H[i + GW], d = H[i + GW + 1];
    return (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty) / 255;
  };
  T.heightAtWorld = (wx, wy) => T.sample((wx / WW) * (GW - 1), (wy / WH) * (GH - 1));
  T.colorFor = function (b, h) {
    const sea = SEA / 255;
    if (h < sea) { const k = Math.min(1, (sea - h) / 0.22); return SHALLOW.map((c, j) => c + (DEEP[j] - c) * k); }
    const t = (h - sea) / (1 - sea);
    if (t > 0.8) return SNOW;
    return BIOMES[b === 0 ? 1 : b].color;
  };

  // ---------- pinceaux ----------
  T.brush = function (op, wx, wy, r, biome) {
    const gx = (wx / WW) * (GW - 1), gy = (wy / WH) * (GH - 1), gr = (r / WW) * (GW - 1);
    const sea = SEA;
    for (let y = Math.max(0, Math.floor(gy - gr)); y <= Math.min(GH - 1, Math.ceil(gy + gr)); y++) {
      for (let x = Math.max(0, Math.floor(gx - gr)); x <= Math.min(GW - 1, Math.ceil(gx + gr)); x++) {
        const d = Math.hypot(x - gx, y - gy) / gr;
        if (d > 1) continue;
        const f = (1 - d) * (1 - d), i = y * GW + x;
        if (op === 'raise') H[i] = Math.min(255, H[i] + Math.ceil(7 * f));
        else if (op === 'lower') H[i] = Math.max(0, H[i] - Math.ceil(7 * f));
        else if (op === 'smooth') {
          let s = 0, n = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < GW && yy < GH) { s += H[yy * GW + xx]; n++; } }
          H[i] = Math.round(H[i] + (s / n - H[i]) * 0.6 * f);
        } else if (op === 'paint' && d < 0.85) {
          if (biome === 0) { if (H[i] >= sea) H[i] = sea - 4; }
          else if (H[i] < sea) H[i] = sea + 3;
          B[i] = biome === 0 ? 0 : biome;
        }
        if (op !== 'paint') { if (H[i] >= sea && B[i] === 0) B[i] = 1; if (H[i] < sea) B[i] = 0; }
      }
    }
    T.version++;
  };

  // ---------- rendu 2D (relief ombré, courbes de niveau, arbres) ----------
  const small = document.createElement('canvas');
  T.render2D = function (canvas, opts = {}) {
    const CW = 640, CH = 448, sea = SEA / 255, contours = opts.contours !== false;
    small.width = CW; small.height = CH;
    const sctx = small.getContext('2d'), img = sctx.createImageData(CW, CH), px = img.data;
    const sx = (GW - 1) / CW, sy = (GH - 1) / CH;
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const fx = (x + 0.5) * sx, fy = (y + 0.5) * sy, h = T.sample(fx, fy);
      const jx = Math.max(0, Math.min(GW - 1, Math.round(fx + (hash(x, y, 7) - 0.5) * 1.1))), jy = Math.max(0, Math.min(GH - 1, Math.round(fy + (hash(y, x, 8) - 0.5) * 1.1)));
      const b = B[jy * GW + jx];
      let c = T.colorFor(b, h), shade = 1;
      if (h >= sea) {
        const dx = T.sample(fx + 0.5, fy) - T.sample(fx - 0.5, fy), dy = T.sample(fx, fy + 0.5) - T.sample(fx, fy - 0.5);
        shade = Math.max(0.72, Math.min(1.22, 1 - (dx + dy) * 9));
        const t = (h - sea) / (1 - sea), fr = (t / 0.055) % 1;
        if (contours && t > 0.04 && fr < 0.14) shade *= 0.86;
      } else if (sea - h < 0.014) c = c.map((v) => v + (255 - v) * 0.45);
      const o = (y * CW + x) * 4;
      px[o] = c[0] * shade; px[o + 1] = c[1] * shade; px[o + 2] = c[2] * shade; px[o + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);
    const ctx = canvas.getContext('2d'), W = canvas.width, Hh = canvas.height;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, W, Hh);
    // arbres
    const cw = W / (GW - 1), ch = Hh / (GH - 1);
    if (opts.trees !== false) for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const b = B[gy * GW + gx];
      if (b !== 3 && b !== 4 && !(b === 5 && hash(gx, gy, 3) > 0.7)) continue;
      if (hash(gx, gy, 4) > 0.8) continue;
      const t = (H[gy * GW + gx] / 255 - sea) / (1 - sea);
      if (t < 0.03 || t > 0.6) continue;
      const x = (gx + (hash(gx, gy, 1) - 0.5) * 1.3) * cw, y = (gy + (hash(gx, gy, 2) - 0.5) * 1.3) * ch, s = cw * (0.34 + hash(gx, gy, 5) * 0.18);
      if (b === 4) { ctx.fillStyle = 'rgb(38,82,58)'; ctx.beginPath(); ctx.moveTo(x, y - s * 1.3); ctx.lineTo(x + s * 0.75, y + s * 0.6); ctx.lineTo(x - s * 0.75, y + s * 0.6); ctx.fill(); }
      else { ctx.fillStyle = b === 5 ? 'rgb(84,104,66)' : 'rgb(58,110,52)'; ctx.beginPath(); ctx.arc(x, y, s * 0.8, 0, 6.283); ctx.fill(); ctx.fillStyle = 'rgba(190,220,140,.35)'; ctx.beginPath(); ctx.arc(x - s * 0.25, y - s * 0.25, s * 0.35, 0, 6.283); ctx.fill(); }
    }
  };
  // Sommets : maxima locaux les plus hauts, espacés, avec altitude (même échelle que le serveur MCP)
  T.peaks = function (n = 4, minDist = 24) {
    const cand = [];
    for (let gy = 1; gy < GH - 1; gy++) for (let gx = 1; gx < GW - 1; gx++) {
      const v = H[gy * GW + gx]; if (v <= SEA + 25) continue;
      let top = true;
      for (let dy = -2; dy <= 2 && top; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = gx + dx, yy = gy + dy; if (xx >= 0 && yy >= 0 && xx < GW && yy < GH && H[yy * GW + xx] > v) { top = false; break; } }
      if (top) cand.push([v, gx, gy]);
    }
    cand.sort((a, b) => b[0] - a[0]);
    const out = [];
    for (const c of cand) { if (out.every((o) => Math.hypot(o[1] - c[1], o[2] - c[2]) > minDist)) out.push(c); if (out.length >= n) break; }
    return out.map(([v, gx, gy]) => ({ x: (gx / (GW - 1)) * WW, y: (gy / (GH - 1)) * WH, alt: Math.round(((v / 255 - SEA / 255) / (1 - SEA / 255)) * 1800) }));
  };
  T.raw = () => ({ H, B });
})();
