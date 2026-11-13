// Kit « bâtiments » : maisons de ville d'inspiration bretonne et monuments, façon maquette.
// Toute une ville tient en 7 appels de dessin (InstancedMesh) et un seul atlas 2048×1024 peint au canevas.
// Les UV sont calculées dans le shader à partir de la position mise à l'échelle par l'exemplaire : ardoises, pierres
// et étages gardent leur taille réelle quelle que soit la maison. Aucun travail par image côté processeur.
(function () {
  'use strict';
  const STOREY = 2.5, GROUND = 2.7;
  const wallHeight = (floors) => GROUND + (Math.max(1, Math.round(floors || 1)) - 1) * STOREY;
  const lin = (hex) => LOOK.lin(hex);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const PI = Math.PI;

  function rng(seed) {
    let a = seed | 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (arr, R) => arr[Math.floor(R() * arr.length) % arr.length];

  // =====================================================================================================
  // Atlas : régions en pixels [x, y, l, h] (y vers le bas, comme le canevas)
  // =====================================================================================================
  const AW = 2048, AH = 1024;
  const PX = {
    SLATE: [0, 0, 512, 512], TILE: [512, 0, 512, 512], PLASTER: [0, 512, 512, 512], STONE: [512, 512, 512, 512],
    WIN_S: [1024, 0, 320, 256], WIN_Z: [1344, 0, 320, 256], WIN_P: [1664, 0, 320, 256],
    FASCIA: [1984, 0, 64, 64], POT: [1984, 64, 64, 64], DARK: [1984, 128, 64, 64], GOLD: [1984, 192, 64, 64],
    WIN_C: [1024, 256, 320, 256], DOOR: [1344, 256, 256, 320], DOOR_A: [1600, 256, 256, 320],
    DORMER: [1856, 256, 192, 184], RIDGE: [1856, 448, 192, 64], AWNING: [1856, 512, 128, 64], WHITE: [1984, 512, 64, 64],
    WOOD: [1024, 512, 128, 64], VERD: [1152, 512, 64, 64], WIN_F: [1216, 512, 128, 64],
    SHOP: [1024, 576, 420, 250], SHOP2: [1444, 576, 420, 250], LANTERN: [1864, 576, 92, 250], LOUVRE: [1956, 576, 92, 250],
    ROSE: [1024, 826, 198, 198], CLOCK: [1222, 826, 198, 198], LANCET: [1420, 826, 99, 198], ARCH: [1519, 826, 128, 198],
    RAIL: [1647, 826, 128, 64], LATTICE: [1647, 890, 128, 128], SHINGLE: [1775, 826, 128, 128], PAVE: [1903, 826, 128, 128],
  };
  const REG = {};
  for (const k in PX) { const [x, y, w, h] = PX[k]; REG[k] = [x / AW, 1 - (y + h) / AH, w / AW, h / AH]; }
  const REP = { SLATE: 3.2, TILE: 3.2, PLASTER: 5, STONE: 4 };

  // ---------- outils de peinture ----------
  function wrapDo(W, H, x, y, w, h, fn) {
    for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) {
      const X = x + dx, Y = y + dy;
      if (X + w >= 0 && X <= W && Y + h >= 0 && Y <= H) fn(X, Y);
    }
  }
  function noise(c, name, amp, seed, colored) {
    const [x, y, w, h] = PX[name], id = c.getImageData(x, y, w, h), d = id.data, R = rng(seed);
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const n = (R() - 0.5) * amp, m = colored ? (R() - 0.5) * amp * 0.4 : 0;
      d[i] = clamp(d[i] + n + m, 0, 255); d[i + 1] = clamp(d[i + 1] + n, 0, 255); d[i + 2] = clamp(d[i + 2] + n - m, 0, 255);
    }
    c.putImageData(id, x, y);
  }
  function region(c, name, fn) {
    const [x, y, w, h] = PX[name];
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.translate(x, y); fn(c, w, h); c.restore();
  }
  const untintAll = (c, name) => LOOK.untint(c, PX[name]);
  const rgb = (r, g, b, a) => 'rgba(' + (clamp(r, 0, 255) | 0) + ',' + (clamp(g, 0, 255) | 0) + ',' + (clamp(b, 0, 255) | 0) + ',' + (a == null ? 1 : a) + ')';
  function vgrad(c, x, y, w, h, stops) { const g = c.createLinearGradient(0, y, 0, y + h); stops.forEach((s) => g.addColorStop(s[0], s[1])); c.fillStyle = g; c.fillRect(x, y, w, h); }
  function hgrad(c, x, y, w, h, stops) { const g = c.createLinearGradient(x, 0, x + w, 0); stops.forEach((s) => g.addColorStop(s[0], s[1])); c.fillStyle = g; c.fillRect(x, y, w, h); }

  // Granit clair : petits moellons gris-beige irréguliers.
  function granite(c, x, y, w, h, R, opts) {
    const o = Object.assign({ base: [168, 162, 150], rows: 22, mortar: 'rgba(214,206,190,1)' }, opts || {});
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.fillStyle = o.mortar; c.fillRect(x, y, w, h);
    let yy = y;
    while (yy < y + h) {
      const rh = (o.rows * (0.75 + R() * 0.5)); let xx = x - R() * 30;
      while (xx < x + w) {
        const bw = rh * (1.2 + R() * 1.6), l = 0.8 + R() * 0.32, warm = (R() - 0.5) * 18;
        c.fillStyle = rgb(o.base[0] * l + warm, o.base[1] * l + warm * 0.5, o.base[2] * l - warm * 0.3);
        c.fillRect(xx + 1.5, yy + 1.5, bw - 3, rh - 3);
        c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(xx + 1.5, yy + 1.5, bw - 3, 2);
        c.fillStyle = 'rgba(0,0,0,0.16)'; c.fillRect(xx + 1.5, yy + rh - 4, bw - 3, 2.5);
        xx += bw;
      }
      yy += rh;
    }
    c.restore();
  }

  // ---------- les régions ----------
  function paintSlate(c, W, H, R) {
    c.fillStyle = '#d8dce0'; c.fillRect(0, 0, W, H);
    const rows = 14, rh = H / rows;
    for (let r = 0; r < rows; r++) {
      const y0 = r * rh, x0 = R() * W; let x = 0;
      while (x < W - 1) {
        let sw = 40 + R() * 30; if (W - x - sw < 30) sw = W - x;
        const l = 0.76 + R() * 0.22, hu = (R() - 0.5) * 0.08, warm = R() < 0.1 ? 0.05 : 0;
        const col = rgb(255 * l * (1 + hu + warm), 255 * l * (1 + warm * 0.4), 255 * l * (1 - hu));
        wrapDo(W, H, x0 + x, y0, sw, rh, (X, Y) => {
          c.fillStyle = col; c.fillRect(X, Y, sw, rh);
          vgrad(c, X, Y, sw, rh, [[0, 'rgba(0,0,0,0.14)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(255,255,255,0.08)']]);
          c.fillStyle = 'rgba(20,26,36,0.6)'; c.fillRect(X, Y, 2, rh);
          if (R() < 0.15) { c.fillStyle = 'rgba(20,26,36,0.5)'; c.beginPath(); c.moveTo(X + sw, Y + rh); c.lineTo(X + sw - 6, Y + rh); c.lineTo(X + sw, Y + rh - 7); c.fill(); }
        });
        x += sw;
      }
    }
    for (let r = 0; r < rows; r++) {
      const y1 = (r + 1) * rh;
      for (const Y of [y1, y1 - H]) {
        c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(0, Y - 2, W, 1.5);
        vgrad(c, 0, Y, W, 8, [[0, 'rgba(12,16,24,0.6)'], [1, 'rgba(12,16,24,0)']]);
      }
    }
    // lichens jaunes, typiques des toits de la côte
    for (let i = 0; i < 26; i++) {
      const x = R() * W, y = R() * H, r = 2 + R() * 5;
      wrapDo(W, H, x - r, y - r, 2 * r, 2 * r, (X, Y) => { c.fillStyle = 'rgba(214,196,96,' + (0.35 + R() * 0.3) + ')'; c.beginPath(); c.arc(X + r, Y + r, r, 0, 7); c.fill(); });
    }
  }

  function paintTile(c, W, H, R) {
    c.fillStyle = '#b89c88'; c.fillRect(0, 0, W, H);
    const cols = 10, cw = W / cols, rows = 7, rh = H / rows;
    for (const cap of [false, true]) {
      for (let col = cap ? 0 : 1; col < cols; col += 2) {
        const x = col * cw - (cap ? 5 : 0), ww = cw + (cap ? 10 : 0);
        for (let row = 0; row < rows; row++) {
          const y = row * rh + (cap ? 0 : rh * 0.5);
          const l = (cap ? 0.97 : 0.8) * (0.84 + R() * 0.2), g = 0.88 + R() * 0.1, b = 0.8 + R() * 0.16;
          wrapDo(W, H, x, y, ww, rh, (X, Y) => {
            c.fillStyle = rgb(255 * l, 255 * l * g, 255 * l * b); c.fillRect(X, Y, ww, rh);
            if (cap) hgrad(c, X, Y, ww, rh, [[0, 'rgba(40,10,0,0.5)'], [0.12, 'rgba(0,0,0,0.12)'], [0.35, 'rgba(255,240,220,0.22)'], [0.7, 'rgba(0,0,0,0)'], [0.92, 'rgba(40,10,0,0.3)'], [1, 'rgba(40,10,0,0.55)']]);
            else hgrad(c, X, Y, ww, rh, [[0, 'rgba(40,10,0,0.35)'], [0.5, 'rgba(40,10,0,0.12)'], [1, 'rgba(40,10,0,0.4)']]);
            vgrad(c, X, Y, ww, 12, [[0, 'rgba(30,8,0,0.55)'], [1, 'rgba(30,8,0,0)']]);
            c.fillStyle = 'rgba(255,235,210,0.25)'; c.fillRect(X + 3, Y + rh - 3, ww - 6, 2);
            if (R() < 0.08) { c.fillStyle = 'rgba(90,90,60,0.35)'; c.beginPath(); c.arc(X + ww * R(), Y + rh * R(), 3 + R() * 5, 0, 7); c.fill(); }
          });
        }
      }
    }
  }

  function paintPlaster(c, W, H, R) {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 220; i++) {
      const x = R() * W, y = R() * H, r = 14 + R() * 70, dark = R() < 0.6, a = 0.025 + R() * 0.045;
      wrapDo(W, H, x - r, y - r, 2 * r, 2 * r, (X, Y) => {
        const g = c.createRadialGradient(X + r, Y + r, 0, X + r, Y + r, r);
        g.addColorStop(0, dark ? 'rgba(120,100,80,' + a + ')' : 'rgba(255,255,255,' + a * 2 + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(X, Y, 2 * r, 2 * r);
      });
    }
    for (let i = 0; i < 70; i++) {
      const x = R() * W, y = R() * H, l = 30 + R() * 140, w = 2 + R() * 6;
      wrapDo(W, H, x, y, w, l, (X, Y) => vgrad(c, X, Y, w, l, [[0, 'rgba(90,80,70,0.07)'], [1, 'rgba(90,80,70,0)']]));
    }
  }

  function paintStone(c, W, H, R) {
    // moellons de granit en assises irrégulières, raccordables
    c.fillStyle = '#cfc6b4'; c.fillRect(0, 0, W, H);
    const rows = []; let y = 0;
    while (y < H) { let rh = 26 + R() * 26; if (H - y - rh < 22) rh = H - y; rows.push([y, rh]); y += rh; }
    for (const [y0, rh] of rows) {
      const x0 = R() * W; let x = 0;
      while (x < W - 1) {
        let bw = rh * (1.1 + R() * 1.8); if (W - x - bw < 24) bw = W - x;
        const l = 0.8 + R() * 0.26, warm = (R() - 0.4) * 22, blue = R() < 0.15 ? 6 : 0;
        const col = rgb(160 * l + warm, 155 * l + warm * 0.5, 146 * l - warm * 0.2 + blue);
        wrapDo(W, H, x0 + x, y0, bw, rh, (X, Y) => {
          c.fillStyle = col; c.beginPath();
          const j = () => (R() - 0.5) * 3;
          c.moveTo(X + 2 + j(), Y + 2 + j()); c.lineTo(X + bw - 2 + j(), Y + 2 + j()); c.lineTo(X + bw - 2 + j(), Y + rh - 2 + j()); c.lineTo(X + 2 + j(), Y + rh - 2 + j()); c.fill();
          c.fillStyle = 'rgba(255,255,255,0.16)'; c.fillRect(X + 3, Y + 3, bw - 6, 2.5);
          c.fillStyle = 'rgba(30,25,20,0.22)'; c.fillRect(X + 3, Y + rh - 5, bw - 6, 2.5);
          for (let k = 0; k < bw * rh / 60; k++) { c.fillStyle = R() < 0.5 ? 'rgba(30,30,30,0.25)' : 'rgba(255,255,250,0.25)'; c.fillRect(X + R() * bw, Y + R() * rh, 1.5, 1.5); }
        });
        x += bw;
      }
    }
  }

  function paintRidge(c, W, H, R) {
    for (let i = 0; i < 2; i++) {
      const x = i * W / 2, l = 0.9 + R() * 0.15;
      c.fillStyle = rgb(178 * l, 92 * l, 60 * l); c.fillRect(x, 0, W / 2, H);
      vgrad(c, x, 0, W / 2, H, [[0, 'rgba(255,220,190,0.3)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(40,10,0,0.35)']]);
      hgrad(c, x, 0, W / 2, H, [[0, 'rgba(30,8,0,0.6)'], [0.08, 'rgba(30,8,0,0.1)'], [0.9, 'rgba(0,0,0,0)'], [1, 'rgba(255,220,190,0.25)']]);
    }
  }

  // ---------- menuiseries ----------
  function surround(c, x, y, w, h, t, R, arch) {
    // encadrement de granit : linteau monolithe, jambages en blocs alternés
    c.fillStyle = '#bdb5a6'; c.fillRect(x, y, w, h);
    granite(c, x, y, w, h, R, { base: [190, 183, 170], rows: t * 1.4, mortar: 'rgba(150,142,128,1)' });
    c.strokeStyle = 'rgba(60,55,48,0.5)'; c.lineWidth = 1.5; c.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
    if (!arch) { c.fillStyle = 'rgba(70,64,56,0.55)'; c.fillRect(x + t, y + t - 1.5, w - 2 * t, 1.5); }
  }
  function glassPane(c, x, y, w, h, R, leaves, rowsN, frame) {
    vgrad(c, x, y, w, h, [[0, '#3d4e5e'], [0.55, '#2a3846'], [1, '#1d2731']]);
    // reflet du ciel en biais
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.fillStyle = 'rgba(200,222,236,0.28)'; c.beginPath(); c.moveTo(x + w * 0.1, y + h); c.lineTo(x + w * 0.45, y + h); c.lineTo(x + w * 0.95, y); c.lineTo(x + w * 0.6, y); c.fill();
    // voilage
    for (let i = 0; i < leaves; i++) {
      const lx = x + (w / leaves) * i;
      c.fillStyle = 'rgba(236,230,214,0.55)'; c.beginPath(); c.moveTo(lx + 3, y); c.lineTo(lx + w / leaves - 3, y);
      c.quadraticCurveTo(lx + w / leaves * 0.5, y + h * 0.42, lx + 3, y + h * 0.3); c.fill();
    }
    c.restore();
    // ombre de l'embrasure (haut et gauche)
    vgrad(c, x, y, w, 9, [[0, 'rgba(0,0,0,0.55)'], [1, 'rgba(0,0,0,0)']]);
    hgrad(c, x, y, 7, h, [[0, 'rgba(0,0,0,0.4)'], [1, 'rgba(0,0,0,0)']]);
    // bâti blanc et petits bois
    const fr = frame || '#f1eee6';
    c.fillStyle = fr; const ft = Math.max(3, w * 0.045);
    c.fillRect(x, y, w, ft); c.fillRect(x, y + h - ft, w, ft); c.fillRect(x, y, ft, h); c.fillRect(x + w - ft, y, ft, h);
    for (let i = 1; i < leaves; i++) c.fillRect(x + (w / leaves) * i - ft * 0.6, y, ft * 1.2, h);
    for (let r = 1; r < rowsN; r++) c.fillRect(x, y + (h / rowsN) * r - 1.2, w, 2.4);
  }
  function shutterLouvre(c, x, y, w, h) {
    c.fillStyle = '#f2f2f2'; c.fillRect(x, y, w, h);
    c.fillStyle = 'rgba(0,0,0,0.22)';
    for (let yy = y + 8; yy < y + h - 8; yy += 6) { c.fillRect(x + 6, yy, w - 12, 2.2); }
    c.fillStyle = 'rgba(255,255,255,0.35)';
    for (let yy = y + 10; yy < y + h - 8; yy += 6) c.fillRect(x + 6, yy, w - 12, 1);
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2);
    c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(x + 4, y + h * 0.5 - 1.5, w - 8, 3);
    c.fillStyle = 'rgba(30,30,30,0.6)'; c.fillRect(x + w * 0.5 - 1, y + h * 0.2, 2, 3); c.fillRect(x + w * 0.5 - 1, y + h * 0.8, 2, 3);
  }
  function shutterPlank(c, x, y, w, h, flip) {
    c.fillStyle = '#f0f0f0'; c.fillRect(x, y, w, h);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 1; i < 4; i++) c.fillRect(x + (w / 4) * i - 1, y, 2, h);
    // barres et écharpe (le Z)
    const bar = (yy) => { c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x + 3, yy + 9, w - 6, 3); c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(x + 3, yy, w - 6, 9); };
    bar(y + h * 0.12); bar(y + h * 0.78);
    c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 7; c.beginPath();
    c.moveTo(x + (flip ? w - 6 : 6), y + h * 0.78); c.lineTo(x + (flip ? 6 : w - 6), y + h * 0.17); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 5; c.beginPath();
    c.moveTo(x + (flip ? w - 6 : 6), y + h * 0.78 - 2); c.lineTo(x + (flip ? 6 : w - 6), y + h * 0.17 - 2); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }
  function flowers(c, x, y, w, h, R) {
    // jardinière de géraniums
    c.fillStyle = '#5b3d2a'; c.fillRect(x, y + h * 0.55, w, h * 0.45);
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x, y + h * 0.55, w, 3);
    for (let i = 0; i < w * 0.9; i++) {
      const fx = x + R() * w, fy = y + R() * h * 0.7;
      c.fillStyle = R() < 0.55 ? rgb(60 + R() * 30, 110 + R() * 40, 50) : pick(['#d8283a', '#e8506a', '#f07890', '#c81e2e', '#ffffff'], R);
      c.beginPath(); c.arc(fx, fy, 2.5 + R() * 3, 0, 7); c.fill();
    }
  }

  // cellule de fenêtre 320×256 (2,0 × 1,6 unités) : encadrement au centre, volets de part et d'autre
  function paintWindow(c, W, H, R, kind) {
    c.clearRect(0, 0, W, H);
    const sx = 66, sy = 6, sw = 188, sh = 244, t = 18, gx = sx + t, gy = sy + t, gw = sw - 2 * t, gh = sh - 2 * t;
    surround(c, sx, sy, sw, sh, t, R);
    glassPane(c, gx, gy, gw, gh, R, 2, 3);
    if (kind === 'P') flowers(c, gx - 4, gy + gh - 40, gw + 8, 40, R);
    LOOK.untint(c, [sx, sy, sw, sh]);
    if (kind === 'S') { shutterLouvre(c, 3, sy + 14, 62, sh - 26); shutterLouvre(c, W - 65, sy + 14, 62, sh - 26); }
    if (kind === 'Z') { shutterPlank(c, 3, sy + 14, 62, sh - 26, false); shutterPlank(c, W - 65, sy + 14, 62, sh - 26, true); }
    if (kind === 'C') { shutterLouvre(c, gx, gy, gw / 2, gh); shutterLouvre(c, gx + gw / 2, gy, gw / 2, gh); }
  }
  function paintDoor(c, W, H, R, arch) {
    c.clearRect(0, 0, W, H);
    // 128 px par unité ; ouverture 1,0 × 2,15
    const ox = 64, ow = 128, oy = 45, t = 18;
    if (arch) {
      c.save(); c.beginPath(); c.moveTo(ox - t, H); c.lineTo(ox - t, oy + ow / 2); c.arc(ox + ow / 2, oy + ow / 2, ow / 2 + t, PI, 0); c.lineTo(ox + ow + t, H); c.closePath(); c.clip();
      surround(c, ox - t, oy - t, ow + 2 * t, H - oy + t, t, R, true);
      // claveaux
      c.strokeStyle = 'rgba(70,64,56,0.6)'; c.lineWidth = 1.5;
      for (let i = 0; i <= 8; i++) { const a = PI + (PI * i) / 8; c.beginPath(); c.moveTo(ox + ow / 2 + Math.cos(a) * ow / 2, oy + ow / 2 + Math.sin(a) * ow / 2); c.lineTo(ox + ow / 2 + Math.cos(a) * (ow / 2 + t), oy + ow / 2 + Math.sin(a) * (ow / 2 + t)); c.stroke(); }
      c.restore();
      LOOK.untint(c, (k) => { k.beginPath(); k.moveTo(ox - t, H); k.lineTo(ox - t, oy + ow / 2); k.arc(ox + ow / 2, oy + ow / 2, ow / 2 + t, PI, 0); k.lineTo(ox + ow + t, H); k.closePath(); });
      // imposte en éventail
      c.save(); c.beginPath(); c.moveTo(ox, oy + ow / 2); c.arc(ox + ow / 2, oy + ow / 2, ow / 2, PI, 0); c.closePath(); c.clip();
      vgrad(c, ox, oy, ow, ow / 2, [[0, '#3f5060'], [1, '#202a34']]);
      c.strokeStyle = '#efeadf'; c.lineWidth = 3;
      for (let i = 1; i < 6; i++) { const a = PI + (PI * i) / 6; c.beginPath(); c.moveTo(ox + ow / 2, oy + ow / 2); c.lineTo(ox + ow / 2 + Math.cos(a) * ow, oy + ow / 2 + Math.sin(a) * ow); c.stroke(); }
      c.restore();
      LOOK.untint(c, (k) => { k.beginPath(); k.moveTo(ox, oy + ow / 2); k.arc(ox + ow / 2, oy + ow / 2, ow / 2, PI, 0); k.closePath(); });
      doorLeaf(c, ox, oy + ow / 2 + 3, ow, H - oy - ow / 2 - 3, R, true);
    } else {
      surround(c, ox - t, oy - t, ow + 2 * t, H - oy + t, t, R);
      vgrad(c, ox, oy, ow, 36, [[0, '#3f5060'], [1, '#202a34']]);
      c.fillStyle = '#efeadf'; c.fillRect(ox, oy + 33, ow, 4); for (let i = 1; i < 4; i++) c.fillRect(ox + (ow / 4) * i - 1.5, oy, 3, 36);
      LOOK.untint(c, [ox - t, oy - t, ow + 2 * t, H - oy + t]);
      doorLeaf(c, ox, oy + 37, ow, H - oy - 37, R, false);
    }
  }
  function doorLeaf(c, x, y, w, h, R, panels) {
    c.fillStyle = '#ebebeb'; c.fillRect(x, y, w, h);
    hgrad(c, x, y, 10, h, [[0, 'rgba(0,0,0,0.4)'], [1, 'rgba(0,0,0,0)']]);
    if (panels) {
      c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 3;
      for (const [px, py, pw, ph] of [[0.12, 0.06, 0.32, 0.38], [0.56, 0.06, 0.32, 0.38], [0.12, 0.52, 0.32, 0.4], [0.56, 0.52, 0.32, 0.4]]) c.strokeRect(x + w * px, y + h * py, w * pw, h * ph);
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x + w / 2 - 1.5, y, 3, h);
    } else {
      c.fillStyle = 'rgba(0,0,0,0.22)'; for (let i = 1; i < 5; i++) c.fillRect(x + (w / 5) * i - 1, y, 2, h);
      // petite vitre carrée et grille
      c.fillStyle = '#26323e'; c.fillRect(x + w * 0.3, y + h * 0.12, w * 0.4, h * 0.18);
      c.strokeStyle = '#2a2a2a'; c.lineWidth = 2; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x + w * 0.3 + w * 0.1 * i, y + h * 0.12); c.lineTo(x + w * 0.3 + w * 0.1 * i, y + h * 0.3); c.stroke(); }
      LOOK.untint(c, [x + w * 0.3, y + h * 0.12, w * 0.4, h * 0.18]);
    }
    c.fillStyle = '#d9b54a'; c.beginPath(); c.arc(x + w * 0.82, y + h * 0.5, 4, 0, 7); c.fill();
    LOOK.untint(c, [x + w * 0.82 - 5, y + h * 0.5 - 5, 10, 10]);
    // plaque émaillée du numéro
    c.fillStyle = '#1f4f8f'; c.fillRect(x + w + 22, y + 10, 22, 16); c.fillStyle = '#ffffff'; c.fillRect(x + w + 25, y + 13, 16, 10); c.fillStyle = '#1f4f8f'; c.fillRect(x + w + 30, y + 15, 6, 6);
    LOOK.untint(c, [x + w + 22, y + 10, 22, 16]);
  }
  function paintShop(c, W, H, R, which) {
    // devanture en bois peint (100 px par unité) : teintée par la couleur de volets, enseigne dorée
    c.fillStyle = '#e6e6e6'; c.fillRect(4, 0, W - 8, H);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(4, 0, W - 8, 8); c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(4, 8, W - 8, 3);
    c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(10, 14, W - 20, 36);
    c.font = 'bold 26px Georgia, "Times New Roman", serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#e8c766'; c.fillText(which ? 'ÉPICERIE · TABAC' : 'CRÊPERIE', W / 2, 33);
    LOOK.untint(c, [30, 16, W - 60, 34]);
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(4, 52, W - 8, 4);
    const doorX = which ? 300 : 175, dw = 72;
    const wins = which ? [[34, 260]] : [[34, 137], [251, 135]];
    for (const [wx, ww] of wins) {
      const wy = 62, wh = 128;
      vgrad(c, wx, wy, ww, wh, [[0, '#3a4a58'], [1, '#1c252e']]);
      // étalage
      for (let i = 0; i < ww / 9; i++) { c.fillStyle = pick(['#d9a441', '#b8572e', '#e7d7a8', '#8a3b2a', '#c9c06a', '#e8e0d0'], R); const bx = wx + 4 + R() * (ww - 14), bh = 6 + R() * 18; c.fillRect(bx, wy + wh - bh - 4, 6 + R() * 6, bh); }
      c.fillStyle = 'rgba(210,230,240,0.25)'; c.beginPath(); c.moveTo(wx + ww * 0.15, wy + wh); c.lineTo(wx + ww * 0.4, wy + wh); c.lineTo(wx + ww * 0.75, wy); c.lineTo(wx + ww * 0.5, wy); c.fill();
      c.fillStyle = '#efe9dc'; c.fillRect(wx + ww / 2 - 1.5, wy, 3, wh); c.fillRect(wx, wy + 30, ww, 3);
      LOOK.untint(c, [wx, wy, ww, wh]);
      c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 3; c.strokeRect(wx + 6, wy + wh + 10, ww - 12, H - wy - wh - 18);
    }
    // porte vitrée
    vgrad(c, doorX, 62, dw, H - 62, [[0, '#33424f'], [1, '#1a222a']]);
    c.fillStyle = '#efe9dc'; c.fillRect(doorX + dw / 2 - 1.5, 62, 3, H - 62);
    LOOK.untint(c, [doorX, 62, dw, H - 62]);
    c.fillStyle = 'rgba(0,0,0,0.35)'; for (const px of [4, doorX - 6, doorX + dw, W - 10]) c.fillRect(px, 56, 6, H - 56);
  }
  function paintDormer(c, W, H, R) {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(120,100,80,0.05)'; c.beginPath(); c.arc(R() * W, R() * H, 5 + R() * 20, 0, 7); c.fill(); }
    const sx = 40, sy = 20, sw = 112, sh = 150, t = 13;
    surround(c, sx, sy, sw, sh, t, R);
    glassPane(c, sx + t, sy + t, sw - 2 * t, sh - 2 * t, R, 2, 2);
    LOOK.untint(c, [sx, sy, sw, sh]);
    vgrad(c, 0, 0, W, 14, [[0, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']]);
  }
  function paintAwning(c, W, H) {
    for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#f6f6f6' : '#f2ede2'; c.fillRect((W / 4) * i, 0, W / 4, H); if (i % 2 === 0) LOOK.untint(c, [(W / 4) * i, 0, W / 4, H]); }
    vgrad(c, 0, 0, W, H, [[0, 'rgba(0,0,0,0.12)'], [0.5, 'rgba(255,255,255,0.05)'], [1, 'rgba(0,0,0,0.15)']]);
  }
  function paintLancet(c, W, H, R) {
    c.clearRect(0, 0, W, H);
    const arch = (k, x, y, w, h) => { k.beginPath(); k.moveTo(x, y + h); k.lineTo(x, y + w * 0.7); k.quadraticCurveTo(x, y, x + w / 2, y); k.quadraticCurveTo(x + w, y, x + w, y + w * 0.7); k.lineTo(x + w, y + h); k.closePath(); };
    c.save(); arch(c, 0, 0, W, H); c.clip(); granite(c, 0, 0, W, H, R, { base: [176, 170, 158], rows: 16 }); c.restore();
    c.save(); arch(c, 12, 12, W - 24, H - 24); c.clip();
    for (let y = 12; y < H; y += 9) for (let x = 12; x < W; x += 9) { c.fillStyle = pick(['#1d3f7a', '#27508f', '#8c1f26', '#b48a2a', '#1f5d4a', '#3a2f6a', '#1d3f7a'], R); c.fillRect(x, y, 9, 9); }
    c.strokeStyle = 'rgba(15,15,18,0.85)'; c.lineWidth = 1.5;
    for (let y = 12; y < H; y += 9) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    for (let x = 12; x < W; x += 9) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, 0, W, H); c.fillStyle = '#9a9488'; c.fillRect(W / 2 - 2.5, 0, 5, H);
    c.restore();
    LOOK.untint(c, (k) => arch(k, 0, 0, W, H));
  }
  function paintRose(c, W, H, R) {
    c.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, r = W / 2 - 2;
    c.fillStyle = '#b4ad9f'; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.arc(cx, cy, r - 10, 0, 7); c.fill();
    c.save(); c.beginPath(); c.arc(cx, cy, r - 14, 0, 7); c.clip();
    for (let i = 0; i < 400; i++) { c.fillStyle = pick(['#1d3f7a', '#27508f', '#8c1f26', '#b48a2a', '#1f5d4a', '#3a2f6a'], R); c.fillRect(R() * W, R() * H, 8, 8); }
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#a8a294'; c.lineWidth = 6;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; c.beginPath(); c.moveTo(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18); c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.stroke(); }
    c.lineWidth = 5; for (const rr of [18, 50]) { c.beginPath(); c.arc(cx, cy, rr, 0, 7); c.stroke(); }
    for (let i = 0; i < 12; i++) { const a = ((i + 0.5) / 12) * PI * 2; c.beginPath(); c.arc(cx + Math.cos(a) * 66, cy + Math.sin(a) * 66, 12, 0, 7); c.stroke(); }
    c.restore();
    LOOK.untint(c, (k) => { k.beginPath(); k.arc(cx, cy, r, 0, 7); });
  }
  function paintClock(c, W, H) {
    c.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, r = W / 2 - 3;
    c.fillStyle = '#c9a43c'; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill();
    c.fillStyle = '#1d2b45'; c.beginPath(); c.arc(cx, cy, r - 8, 0, 7); c.fill();
    c.fillStyle = '#f4efe2'; c.beginPath(); c.arc(cx, cy, r - 22, 0, 7); c.fill();
    c.fillStyle = '#d9b54a';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; c.save(); c.translate(cx + Math.sin(a) * (r - 15), cy - Math.cos(a) * (r - 15)); c.rotate(a); c.fillRect(-2.5, -6, 5, 12); c.restore(); }
    c.strokeStyle = '#1a1a1a'; c.lineCap = 'round';
    c.lineWidth = 7; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + 30, cy - 22); c.stroke();
    c.lineWidth = 4.5; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx - 8, cy - 62); c.stroke();
    LOOK.untint(c, (k) => { k.beginPath(); k.arc(cx, cy, r, 0, 7); });
  }
  function paintPortal(c, W, H, R) {
    c.clearRect(0, 0, W, H);
    const arch = (k, x, y, w, h) => { k.beginPath(); k.moveTo(x, y + h); k.lineTo(x, y + w * 0.62); k.quadraticCurveTo(x, y, x + w / 2, y); k.quadraticCurveTo(x + w, y, x + w, y + w * 0.62); k.lineTo(x + w, y + h); k.closePath(); };
    c.save(); arch(c, 0, 0, W, H); c.clip(); granite(c, 0, 0, W, H, R, { base: [182, 176, 164], rows: 14 }); c.restore();
    for (const [i, s] of [[1, 0.2], [2, 0.3], [3, 0.4]]) { c.save(); arch(c, i * 9, i * 9, W - i * 18, H - i * 9); c.fillStyle = 'rgba(0,0,0,' + s * 0.5 + ')'; c.fill(); c.restore(); }
    c.save(); arch(c, 30, 30, W - 60, H - 30); c.clip();
    c.fillStyle = '#9d968a'; c.fillRect(0, 0, W, 78);
    c.fillStyle = '#5a3b26'; c.fillRect(0, 78, W, H);
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(W / 2 - 1.5, 78, 3, H);
    c.fillStyle = '#2a2622'; for (const y of [100, 140, 175]) { c.fillRect(32, y, 26, 4); c.fillRect(W - 58, y, 26, 4); }
    c.restore();
    LOOK.untint(c, (k) => arch(k, 0, 0, W, H));
  }
  function paintLouvre(c, W, H, R) {
    c.clearRect(0, 0, W, H);
    const arch = (k, x, y, w, h) => { k.beginPath(); k.moveTo(x, y + h); k.lineTo(x, y + w / 2); k.arc(x + w / 2, y + w / 2, w / 2, PI, 0); k.lineTo(x + w, y + h); k.closePath(); };
    c.save(); arch(c, 0, 0, W, H); c.clip(); granite(c, 0, 0, W, H, R, { base: [176, 170, 158], rows: 14 }); c.restore();
    c.save(); arch(c, 10, 10, W - 20, H - 14); c.clip();
    c.fillStyle = '#16181b'; c.fillRect(0, 0, W, H);
    for (let y = 40; y < H; y += 13) { c.fillStyle = '#4a4744'; c.fillRect(0, y, W, 7); c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(0, y, W, 2); }
    c.restore();
    LOOK.untint(c, (k) => arch(k, 0, 0, W, H));
  }
  function paintLantern(c, W, H) {
    vgrad(c, 0, 0, W, H, [[0, '#fff3c4'], [0.5, '#ffd27a'], [1, '#ffb347']]);
    c.fillStyle = '#2a2d31'; c.fillRect(0, 0, W, 10); c.fillRect(0, H - 10, W, 10); c.fillRect(0, H * 0.5 - 3, W, 6); c.fillRect(0, 0, 5, H); c.fillRect(W - 5, 0, 5, H);
    LOOK.untint(c, [0, 0, W, H]);
  }
  function paintRail(c, W, H) {
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#26292c'; c.fillRect(0, 0, W, 6); c.fillRect(0, H * 0.55, W, 3); c.fillRect(0, H - 4, W, 4);
    for (let x = 4; x < W; x += 16) c.fillRect(x, 0, 3, H);
  }
  function paintLattice(c, W, H) {
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#d6ccb6';
    for (let y = 0; y < H; y += 32) c.fillRect(0, y, W, 6);
    c.fillRect(0, 0, 7, H); c.fillRect(W / 2 - 3, 0, 6, H);
    c.fillStyle = 'rgba(0,0,0,0.3)'; for (let y = 0; y < H; y += 32) c.fillRect(0, y + 5, W, 1.5);
  }
  function paintShingle(c, W, H, R) {
    c.fillStyle = '#4b3b2e'; c.fillRect(0, 0, W, H);
    const rh = 16;
    for (let y = 0; y < H; y += rh) { let x = (y / rh) % 2 ? -8 : 0; while (x < W) { const w = 12 + R() * 10, l = 0.8 + R() * 0.4; c.fillStyle = rgb(110 * l, 92 * l, 74 * l); c.fillRect(x + 1, y, w - 2, rh - 2); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x + 1, y + rh - 4, w - 2, 3); x += w; } }
  }
  function paintPave(c, W, H, R) { granite(c, 0, 0, W, H, R, { base: [150, 146, 138], rows: 16 }); }
  function flat(c, name, col, amp, seed) { region(c, name, (k, w, h) => { k.fillStyle = col; k.fillRect(0, 0, w, h); }); noise(c, name, amp, seed); }

  function paintAtlas() {
    const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH;
    const c = cv.getContext('2d'), R = rng(424242);
    region(c, 'SLATE', (k, w, h) => paintSlate(k, w, h, R)); noise(c, 'SLATE', 16, 1);
    region(c, 'TILE', (k, w, h) => paintTile(k, w, h, R)); noise(c, 'TILE', 14, 2, true);
    region(c, 'PLASTER', (k, w, h) => paintPlaster(k, w, h, R)); noise(c, 'PLASTER', 10, 3);
    region(c, 'STONE', (k, w, h) => paintStone(k, w, h, R)); noise(c, 'STONE', 14, 4); untintAll(c, 'STONE');
    region(c, 'RIDGE', (k, w, h) => paintRidge(k, w, h, R)); noise(c, 'RIDGE', 12, 5);
    for (const [n, kind] of [['WIN_S', 'S'], ['WIN_Z', 'Z'], ['WIN_P', 'P'], ['WIN_C', 'C']]) region(c, n, (k, w, h) => paintWindow(k, w, h, R, kind));
    region(c, 'DOOR', (k, w, h) => paintDoor(k, w, h, R, false));
    region(c, 'DOOR_A', (k, w, h) => paintDoor(k, w, h, R, true));
    region(c, 'SHOP', (k, w, h) => paintShop(k, w, h, R, 0));
    region(c, 'SHOP2', (k, w, h) => paintShop(k, w, h, R, 1));
    region(c, 'DORMER', (k, w, h) => paintDormer(k, w, h, R));
    region(c, 'AWNING', (k, w, h) => paintAwning(k, w, h));
    region(c, 'LANCET', (k, w, h) => paintLancet(k, w, h, R));
    region(c, 'ROSE', (k, w, h) => paintRose(k, w, h, R));
    region(c, 'CLOCK', (k, w, h) => paintClock(k, w, h));
    region(c, 'ARCH', (k, w, h) => paintPortal(k, w, h, R));
    region(c, 'LOUVRE', (k, w, h) => paintLouvre(k, w, h, R));
    region(c, 'LANTERN', (k, w, h) => paintLantern(k, w, h));
    region(c, 'RAIL', (k, w, h) => paintRail(k, w, h));
    region(c, 'LATTICE', (k, w, h) => paintLattice(k, w, h));
    region(c, 'SHINGLE', (k, w, h) => paintShingle(k, w, h, R)); noise(c, 'SHINGLE', 14, 6);
    region(c, 'PAVE', (k, w, h) => paintPave(k, w, h, R)); untintAll(c, 'PAVE');
    region(c, 'WOOD', (k, w, h) => { k.fillStyle = '#c9b8a2'; k.fillRect(0, 0, w, h); for (let i = 0; i < 50; i++) { k.fillStyle = 'rgba(60,40,20,' + (0.06 + R() * 0.1) + ')'; k.fillRect(0, R() * h, w, 1 + R() * 2); } });
    noise(c, 'WOOD', 12, 7);
    flat(c, 'FASCIA', '#9c9890', 10, 8);
    flat(c, 'POT', '#b86a44', 14, 9); untintAll(c, 'POT');
    flat(c, 'DARK', '#1c1a19', 6, 10); untintAll(c, 'DARK');
    region(c, 'GOLD', (k, w, h) => vgrad(k, 0, 0, w, h, [[0, '#f1d27a'], [0.5, '#c79a34'], [1, '#8f6a1e']])); untintAll(c, 'GOLD');
    flat(c, 'WHITE', '#f4f4f2', 8, 11);
    region(c, 'VERD', (k, w, h) => { k.fillStyle = '#ffffff'; k.fillRect(0, 0, w, h); for (let i = 0; i < 30; i++) { k.fillStyle = R() < 0.5 ? 'rgba(20,60,50,0.12)' : 'rgba(90,70,40,0.1)'; k.fillRect(R() * w, 0, 2 + R() * 5, h); } });
    noise(c, 'VERD', 18, 12);
    region(c, 'WIN_F', (k, w, h) => { vgrad(k, 0, 0, w, h, [[0, '#3d4e5e'], [1, '#1d2731']]); }); untintAll(c, 'WIN_F');
    const t = new THREE.CanvasTexture(cv);
    t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    return t;
  }

  // =====================================================================================================
  // Matériau : MeshStandardMaterial + projection d'atlas calculée dans le shader
  // mode 0 répété dans le plan de la face (unités du monde), 1 cellule fixe, 2 mur de maison (soubassement, chaînages),
  //      3 cellule choisie par l'exemplaire, 4 couverture (ardoise ou tuile selon l'exemplaire), 5 pignon (enduit ou granit),
  //      6 cellule lumineuse. Teinte : 0 = iCol1, 1 = iCol2, 2 = aucune (seulement la couleur de sommet aCol).
  // =====================================================================================================
  const v4 = (r) => 'vec4(' + r.map((x) => x.toFixed(6)).join(',') + ')';
  const VDECL = [
    'attribute vec4 aReg; attribute vec4 aMap; attribute vec3 aAnc; attribute vec3 aCol;',
    '#ifdef USE_INSTANCING', 'attribute vec3 iCol1; attribute vec3 iCol2; attribute vec4 iVar;', '#endif',
    'varying vec2 vKbPlan; varying vec4 vKbReg; varying vec4 vKbMap; varying vec3 vKbTint; varying vec4 vKbVar; varying vec2 vKbFace;',
  ].join('\n');
  const VMAIN = [
    '{',
    '  vec3 kbS = vec3(1.0);',
    '  #ifdef USE_INSTANCING',
    '  kbS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));',
    '  #endif',
    '  vec3 kbN = normalize(normal / kbS);',
    '  vec3 kbU = abs(kbN.y) > 0.999 ? vec3(1.0, 0.0, 0.0) : normalize(cross(vec3(0.0, 1.0, 0.0), kbN));',
    '  vec3 kbV = cross(kbN, kbU);',
    '  vec3 kbP = (position - aAnc) * kbS;',
    '  float kbM = aMap.z;',
    '  bool kbFixed = (kbM > 0.5 && kbM < 1.5) || (kbM > 2.5 && kbM < 3.5) || kbM > 5.5;',
    '  vKbPlan = kbFixed ? uv : vec2(dot(kbP, kbU), dot(kbP, kbV));',
    '  vKbFace = vec2(abs(dot(kbU, kbS)), abs(normal.z) > 0.5 ? kbS.y : 1e4);',
    '  vKbReg = aReg; vKbMap = aMap; vKbTint = aCol; vKbVar = vec4(0.0);',
    '  #ifdef USE_INSTANCING',
    '  vKbVar = iVar;',
    '  if (aMap.w < 0.5) vKbTint *= iCol1; else if (aMap.w < 1.5) vKbTint *= iCol2;',
    '  #endif',
    '}',
  ].join('\n');
  const FDECL = [
    'varying vec2 vKbPlan; varying vec4 vKbReg; varying vec4 vKbMap; varying vec3 vKbTint; varying vec4 vKbVar; varying vec2 vKbFace;',
    'const vec4 KB_SLATE = ' + v4(REG.SLATE) + '; const vec4 KB_TILE = ' + v4(REG.TILE) + ';',
    'const vec4 KB_PLASTER = ' + v4(REG.PLASTER) + '; const vec4 KB_STONE = ' + v4(REG.STONE) + ';',
    'const vec2 KB_PLASTER_REP = vec2(' + REP.PLASTER.toFixed(2) + '); const vec2 KB_STONE_REP = vec2(' + REP.STONE.toFixed(2) + ');',
    'const vec2 KB_ATLAS = vec2(' + AW.toFixed(1) + ', ' + AH.toFixed(1) + ');',
  ].join('\n');
  const FMAP = [
    'vec3 kbGlow = vec3(0.0);',
    '{',
    '  float m = vKbMap.z; vec4 reg = vKbReg; vec2 rep = max(vKbMap.xy, vec2(0.001)); vec2 pl = vKbPlan; float shade = 1.0;',
    '  vec2 dpx = dFdx(pl), dpy = dFdy(pl);',
    '  bool fixedUV = false;',
    '  if (m > 0.5 && m < 1.5) fixedUV = true;',
    '  else if (m > 2.5 && m < 3.5) { fixedUV = true; reg = vKbVar; }',
    '  else if (m > 5.5) fixedUV = true;',
    '  else if (m > 1.5 && m < 2.5) {',
    '    float h = pl.y, u = pl.x, fw = vKbFace.x;',
    '    bool stone = vKbVar.x > 0.5 || h < vKbVar.z;',
    '    if (!stone && vKbVar.y > 0.5) { float qw = mod(floor(h / 0.38), 2.0) < 1.0 ? 0.62 : 0.38; stone = u < qw || u > fw - qw; }',
    '    if (stone) { reg = KB_STONE; rep = KB_STONE_REP; }',
    '    else { reg = KB_PLASTER; rep = KB_PLASTER_REP; shade = mix(0.78, 1.0, smoothstep(vKbVar.z, vKbVar.z + 1.3, h)) * mix(0.84, 1.0, smoothstep(0.0, 0.7, vKbFace.y - h)); }',
    '  }',
    '  else if (m > 3.5 && m < 4.5) { reg = vKbVar.x > 0.5 ? KB_TILE : KB_SLATE; }',
    '  else if (m > 4.5) { if (vKbVar.y > 0.5) { reg = KB_STONE; rep = KB_STONE_REP; } }',
    '  vec2 raw = fixedUV ? clamp(pl, 0.0, 1.0) : pl / rep;',
    '  vec2 fr = fixedUV ? raw : fract(raw);',
    '  vec2 ins = vec2(1.5) / KB_ATLAS;',
    '  vec2 span = reg.zw - 2.0 * ins;',
    '  vec2 uvA = reg.xy + ins + fr * span;',
    '  vec2 gx = (fixedUV ? dpx : dpx / rep) * span, gy = (fixedUV ? dpy : dpy / rep) * span;',
    '  if (fixedUV) { float lim = 5.0 / KB_ATLAS.x; gx *= min(1.0, lim / max(length(gx), 1e-6)); gy *= min(1.0, lim / max(length(gy), 1e-6)); }',
    '#if __VERSION__ >= 300',
    '  vec4 kbTex = textureGrad(map, uvA, gx, gy);',
    '#else',
    '  vec4 kbTex = texture2D(map, uvA);',
    '#endif',
    '  if (kbTex.a < 0.25) discard;',
    '  float kbMask = step(0.75, kbTex.a);',
    '  vec4 kbLin = mapTexelToLinear(kbTex);',
    '  diffuseColor.rgb *= kbLin.rgb * mix(vec3(1.0), vKbTint, kbMask) * shade;',
    '  if (m > 5.5) kbGlow = kbLin.rgb * 2.4;',
    '}',
  ].join('\n');

  function makeMaterial(tex, extra) {
    const m = new THREE.MeshStandardMaterial(Object.assign({ map: tex, roughness: 0.86, metalness: 0, flatShading: true }, extra || {}));
    m.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + VDECL).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VMAIN);
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FDECL)
        .replace('#include <map_fragment>', FMAP)
        .replace('#include <color_fragment>', '')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += kbGlow;');
    };
    m.customProgramCacheKey = () => 'kit-buildings-atlas-1';
    return m;
  }

  // =====================================================================================================
  // Constructeur de géométrie : faces planes avec attributs de projection
  // =====================================================================================================
  const TA = 0, TB = 1, TN = 2;
  const _white = new THREE.Color(1, 1, 1);
  function newell(V) {
    const n = new THREE.Vector3();
    for (let i = 0; i < V.length; i++) { const a = V[i], b = V[(i + 1) % V.length]; n.x += (a.y - b.y) * (a.z + b.z); n.y += (a.z - b.z) * (a.x + b.x); n.z += (a.x - b.x) * (a.y + b.y); }
    return n.normalize();
  }
  function Geo() { this.P = []; this.N = []; this.UV = []; this.RG = []; this.MP = []; this.AN = []; this.CO = []; this.mat = null; }
  Geo.prototype.with = function (m, fn) { const prev = this.mat; this.mat = prev ? prev.clone().multiply(m) : m.clone(); fn(); this.mat = prev; return this; };
  // pts : sommets [x,y,z] d'un polygone convexe ; hint : direction voulue de la normale (repère local), corrige l'ordre au besoin.
  Geo.prototype.poly = function (pts, o, hint) {
    let V = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    if (hint) { const n0 = newell(V); if (n0.x * hint[0] + n0.y * hint[1] + n0.z * hint[2] < 0) V.reverse(); }
    if (this.mat) V.forEach((v) => v.applyMatrix4(this.mat));
    const n = newell(V);
    if (!isFinite(n.x) || n.lengthSq() < 0.5) return this;
    const U = Math.abs(n.y) > 0.999 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0).cross(n).normalize();
    const Vv = n.clone().cross(U);
    let mu = Infinity, mv = Infinity, Mu = -Infinity, Mv = -Infinity;
    V.forEach((v) => { const a = v.dot(U), b = v.dot(Vv); mu = Math.min(mu, a); mv = Math.min(mv, b); Mu = Math.max(Mu, a); Mv = Math.max(Mv, b); });
    const anc = U.clone().multiplyScalar(mu - (o.uShift || 0)).addScaledVector(Vv, mv).addScaledVector(n, V[0].dot(n));
    if (o.ay != null) anc.y = o.ay;
    const reg = o.reg || REG.WHITE, rep = o.rep || [1, 1], mode = o.mode || 0, tint = o.tint == null ? TN : o.tint, col = o.col || _white;
    const uvs = V.map((v) => (o.flipU ? [1 - (v.dot(U) - mu) / (Mu - mu || 1), (v.dot(Vv) - mv) / (Mv - mv || 1)] : [(v.dot(U) - mu) / (Mu - mu || 1), (v.dot(Vv) - mv) / (Mv - mv || 1)]));
    const push = (i) => {
      const v = V[i]; this.P.push(v.x, v.y, v.z); this.N.push(n.x, n.y, n.z); this.UV.push(uvs[i][0], uvs[i][1]);
      this.RG.push(reg[0], reg[1], reg[2], reg[3]); this.MP.push(rep[0], rep[1], mode, tint); this.AN.push(anc.x, anc.y, anc.z); this.CO.push(col.r, col.g, col.b);
    };
    for (let i = 1; i < V.length - 1; i++) { push(0); push(i); push(i + 1); }
    return this;
  };
  Geo.prototype.quad = function (a, b, c, d, o, hint) { return this.poly([a, b, c, d], o, hint); };
  // boîte ; skip : lettres des faces à omettre (x X y Y z Z = -x +x -y +y -z +z)
  Geo.prototype.box = function (x0, y0, z0, x1, y1, z1, o, skip) {
    const s = skip || '';
    if (!s.includes('Z')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], o, [0, 0, 1]);
    if (!s.includes('z')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], o, [0, 0, -1]);
    if (!s.includes('X')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], o, [1, 0, 0]);
    if (!s.includes('x')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], o, [-1, 0, 0]);
    if (!s.includes('Y')) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], o, [0, 1, 0]);
    if (!s.includes('y')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], o, [0, -1, 0]);
    return this;
  };
  // cylindre ou tronc de cône à n pans, axe vertical
  Geo.prototype.cyl = function (cx, cz, y0, y1, r0, r1, n, o, opt) {
    const p = opt || {}, ph = p.phase || 0, pt = (a, r, y) => [cx + r * Math.sin(a), y, cz + r * Math.cos(a)];
    const chord = 2 * Math.max(r0, r1) * Math.sin(PI / n);
    for (let i = 0; i < n; i++) {
      const a0 = ph + (2 * PI * i) / n, a1 = ph + (2 * PI * (i + 1)) / n, am = (a0 + a1) / 2;
      const q = [pt(a0, r0, y0), pt(a1, r0, y0), pt(a1, r1, y1), pt(a0, r1, y1)];
      const oo = Object.assign({}, o, { uShift: i * chord });
      if (r1 < 1e-4) this.poly([q[0], q[1], q[2]], oo, [Math.sin(am), 0.3, Math.cos(am)]);
      else if (r0 < 1e-4) this.poly([q[0], q[2], q[3]], oo, [Math.sin(am), -0.3, Math.cos(am)]);
      else this.poly(q, oo, [Math.sin(am), (r0 - r1) / (y1 - y0 || 1), Math.cos(am)]);
      if (p.inside) this.poly(q, oo, [-Math.sin(am), 0, -Math.cos(am)]);
    }
    const ring = (r, y) => { const a = []; for (let i = 0; i < n; i++) a.push(pt(ph + (2 * PI * i) / n, r, y)); return a; };
    if (p.top && r1 > 1e-4) this.poly(ring(r1, y1), p.capO || o, [0, 1, 0]);
    if (p.bottom && r0 > 1e-4) this.poly(ring(r0, y0), p.capO || o, [0, -1, 0]);
    return this;
  };
  // tube entre deux points
  Geo.prototype.tube = function (a, b, r0, r1, n, o, opt) {
    const A = new THREE.Vector3(a[0], a[1], a[2]), B = new THREE.Vector3(b[0], b[1], b[2]), d = B.clone().sub(A), L = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return this.with(new THREE.Matrix4().compose(A, q, new THREE.Vector3(1, 1, 1)), () => this.cyl(0, 0, 0, L, r0, r1, n, o, opt));
  };
  // cellule plaquée sur une façade : centre bas (x, y, z), tournée de ry, l × h, décollée de off
  Geo.prototype.cell = function (x, y, z, ry, w, h, reg, off, extra) {
    return this.with(M(x, y, z, ry), () => this.quad([-w / 2, 0, off || 0.05], [w / 2, 0, off || 0.05], [w / 2, h, off || 0.05], [-w / 2, h, off || 0.05], Object.assign({ mode: 1, reg, tint: TN }, extra || {}), [0, 0, 1]));
  };
  Geo.prototype.build = function () {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.UV, 2));
    g.setAttribute('aReg', new THREE.Float32BufferAttribute(this.RG, 4));
    g.setAttribute('aMap', new THREE.Float32BufferAttribute(this.MP, 4));
    g.setAttribute('aAnc', new THREE.Float32BufferAttribute(this.AN, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(this.CO, 3));
    g.computeBoundingSphere();
    return g;
  };
  function M(x, y, z, ry, sx, sy, sz) {
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry || 0), new THREE.Vector3(sx || 1, sy || sx || 1, sz || sx || 1));
  }

  // ---------- toitures (faîtage selon x, égout à y = 0 en z = ±S/2, hauteur H) ----------
  function roofGable(g, L, S, H, o) {
    const X = L / 2 + o.ox, Z = S / 2 + o.oz, k = (2 * H) / S, yE = -o.oz * k, t = o.t, top = H + t;
    g.quad([-X, yE + t, Z], [X, yE + t, Z], [X, top, 0], [-X, top, 0], o.os, [0, 1, 1]);
    g.quad([X, yE + t, -Z], [-X, yE + t, -Z], [-X, top, 0], [X, top, 0], o.os, [0, 1, -1]);
    g.quad([-X, yE, Z], [X, yE, Z], [X, yE + t, Z], [-X, yE + t, Z], o.of, [0, 0, 1]);
    g.quad([X, yE, -Z], [-X, yE, -Z], [-X, yE + t, -Z], [X, yE + t, -Z], o.of, [0, 0, -1]);
    const zin = o.under ? 0 : S / 2, yin = o.under ? H : 0;
    g.quad([-X, yE, Z], [X, yE, Z], [X, yin, zin], [-X, yin, zin], o.ou || o.of, [0, -1, 0]);
    g.quad([-X, yE, -Z], [X, yE, -Z], [X, yin, -zin], [-X, yin, -zin], o.ou || o.of, [0, -1, 0]);
    for (const sx of [-1, 1]) {
      g.quad([sx * X, yE, Z], [sx * X, yE + t, Z], [sx * X, top, 0], [sx * X, H, 0], o.of, [sx, 0, 0]);
      g.quad([sx * X, H, 0], [sx * X, top, 0], [sx * X, yE + t, -Z], [sx * X, yE, -Z], o.of, [sx, 0, 0]);
      if (o.ox > 0.05 && !o.under) for (const sz of [-1, 1]) g.quad([sx * L / 2, yE, sz * Z], [sx * X, yE, sz * Z], [sx * X, H, 0], [sx * L / 2, H, 0], o.of, [0, -1, 0]);
      if (o.og) g.poly([[sx * L / 2, 0, -S / 2], [sx * L / 2, 0, S / 2], [sx * L / 2, H, 0]], o.og, [sx, 0, 0]);
    }
    if (o.or) {
      const yb = top - k * o.rw, yt = top + o.rc;
      g.quad([-X, yb, o.rw], [X, yb, o.rw], [X, yt, 0], [-X, yt, 0], o.or, [0, 1, 1]);
      g.quad([X, yb, -o.rw], [-X, yb, -o.rw], [-X, yt, 0], [X, yt, 0], o.or, [0, 1, -1]);
      for (const sx of [-1, 1]) g.poly([[sx * X, yb, o.rw], [sx * X, yt, 0], [sx * X, yb, -o.rw]], o.or, [sx, 0, 0]);
    }
  }
  // bande étroite posée sur un pan, le long d'une arête (arêtiers)
  function hipStrip(g, A, B, toward, w, lift, o) {
    const a = new THREE.Vector3(...A), b = new THREE.Vector3(...B), dir = b.clone().sub(a).normalize();
    const tw = new THREE.Vector3(...toward); tw.addScaledVector(dir, -tw.dot(dir)).normalize().multiplyScalar(w);
    const up = new THREE.Vector3(0, lift, 0);
    g.quad(a.clone().add(up).toArray(), b.clone().add(up).toArray(), b.clone().add(tw).toArray(), a.clone().add(tw).toArray(), o, [0, 1, 0]);
  }
  function roofHip(g, L, S, H, o) {
    const X = L / 2 + o.ox, Z = S / 2 + o.oz, k = (2 * H) / S, yE = -o.oz * k, t = o.t, top = H + t, xr = Math.max(0.001, L / 2 - o.hip);
    g.quad([-X, yE + t, Z], [X, yE + t, Z], [xr, top, 0], [-xr, top, 0], o.os, [0, 1, 1]);
    g.quad([X, yE + t, -Z], [-X, yE + t, -Z], [-xr, top, 0], [xr, top, 0], o.os, [0, 1, -1]);
    for (const sx of [-1, 1]) g.poly([[sx * X, yE + t, Z], [sx * X, yE + t, -Z], [sx * xr, top, 0]], o.os, [sx, 1, 0]);
    g.quad([-X, yE, Z], [X, yE, Z], [X, yE + t, Z], [-X, yE + t, Z], o.of, [0, 0, 1]);
    g.quad([X, yE, -Z], [-X, yE, -Z], [-X, yE + t, -Z], [X, yE + t, -Z], o.of, [0, 0, -1]);
    for (const sx of [-1, 1]) g.quad([sx * X, yE, Z], [sx * X, yE, -Z], [sx * X, yE + t, -Z], [sx * X, yE + t, Z], o.of, [sx, 0, 0]);
    g.quad([-X, yE, -Z], [X, yE, -Z], [X, yE, Z], [-X, yE, Z], o.of, [0, -1, 0]);
    if (o.or) {
      const yb = top - k * o.rw, yt = top + o.rc;
      g.quad([-xr, yb, o.rw], [xr, yb, o.rw], [xr, yt, 0], [-xr, yt, 0], o.or, [0, 1, 1]);
      g.quad([xr, yb, -o.rw], [-xr, yb, -o.rw], [-xr, yt, 0], [xr, yt, 0], o.or, [0, 1, -1]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const A = [sx * X, yE + t + o.rc * 0.5, sz * Z], B = [sx * xr, yt, 0];
        hipStrip(g, A, B, [-sx, 0, 0], o.rw * 1.6, 0, o.or);
        hipStrip(g, A, B, [0, 0, -sz], o.rw * 1.6, 0, o.or);
      }
    }
  }

  // =====================================================================================================
  // Gabarits des maisons (espace unité, mis à l'échelle par l'exemplaire)
  // =====================================================================================================
  const RT = 0.075, RC = 0.05, RW = 0.045, FOUND = 1.7;
  function tplBody() {
    const g = new Geo(), o = { mode: 2, tint: TA, ay: 0 };
    g.box(-0.5, -FOUND, -0.5, 0.5, 1, 0.5, o, 'yY');
    return g;
  }
  const roofOpts = (hip) => ({
    ox: hip ? 0.06 : 0.02, oz: 0.1, t: RT, rc: RC, rw: RW, hip: 0.38,
    os: { mode: 4, rep: [REP.SLATE, REP.SLATE], tint: TA },
    of: { mode: 0, reg: REG.FASCIA, rep: [1, 1], tint: TN, col: lin('#8c8780') },
    og: { mode: 5, reg: REG.PLASTER, rep: [REP.PLASTER, REP.PLASTER], tint: TB },
    or: { mode: 0, reg: REG.RIDGE, rep: [1.2, 0.4], tint: TN },
  });
  function tplRoofGable() { const g = new Geo(); roofGable(g, 1, 1, 1, roofOpts(false)); return g; }
  function tplRoofHip() { const g = new Geo(); roofHip(g, 1, 1, 1, roofOpts(true)); return g; }
  function tplChimney() {
    const g = new Geo(), st = { mode: 0, reg: REG.STONE, rep: [REP.STONE, REP.STONE] };
    g.box(-0.28, -2.6, -0.52, 0.28, 0.9, 0.52, st, 'y');
    g.box(-0.35, 0.9, -0.59, 0.35, 1.04, 0.59, st);
    for (const z of [-0.26, 0.26]) {
      g.cyl(0, z, 1.04, 1.36, 0.13, 0.1, 6, { mode: 0, reg: REG.POT, rep: [1, 1] });
      g.cyl(0, z, 1.36, 1.36, 0.1, 0.1, 6, {}, { top: true, capO: { mode: 0, reg: REG.DARK } });
    }
    return g;
  }
  // chien-assis : façade avant au plan z = 0, posé sur le pan, s'enfonce vers l'arrière
  function tplDormer() {
    const g = new Geo(), W = 0.6, yw = 1.0, yr = 1.52, D = 1.6, ov = 0.12, t = 0.07;
    const pl = { mode: 5, reg: REG.PLASTER, rep: [REP.PLASTER, REP.PLASTER], tint: TB };
    g.quad([-W, 0, 0], [W, 0, 0], [W, yw, 0], [-W, yw, 0], { mode: 1, reg: REG.DORMER, tint: TB }, [0, 0, 1]);
    g.quad([-W, -1.0, 0], [W, -1.0, 0], [W, 0, 0], [-W, 0, 0], pl, [0, 0, 1]);
    for (const sx of [-1, 1]) g.quad([sx * W, -1.0, 0], [sx * W, -1.0, -D], [sx * W, yw, -D], [sx * W, yw, 0], pl, [sx, 0, 0]);
    g.poly([[-W, yw, 0], [W, yw, 0], [0, yr, 0]], pl, [0, 0, 1]);
    const k = (yr - yw) / W, X = W + ov, yE = yw - ov * k;
    const sl = { mode: 4, rep: [REP.SLATE, REP.SLATE], tint: TA }, fa = { mode: 0, reg: REG.FASCIA, tint: TN, col: lin('#8c8780') };
    for (const sx of [-1, 1]) {
      g.quad([sx * X, yE + t, ov], [sx * X, yE + t, -D], [0, yr + t, -D], [0, yr + t, ov], sl, [sx, 1, 0]);
      g.quad([sx * X, yE, ov], [0, yr, ov], [0, yr + t, ov], [sx * X, yE + t, ov], fa, [0, 0, 1]);
      g.quad([sx * X, yE, ov], [sx * X, yE, -D], [0, yr, -D], [0, yr, ov], fa, [0, -1, 0]);
    }
    const rr = { mode: 0, reg: REG.RIDGE, rep: [1.2, 0.4] };
    g.quad([-0.06, yr + t - 0.04, ov], [-0.06, yr + t - 0.04, -D], [0, yr + t + 0.05, -D], [0, yr + t + 0.05, ov], rr, [-1, 1, 0]);
    g.quad([0.06, yr + t - 0.04, ov], [0.06, yr + t - 0.04, -D], [0, yr + t + 0.05, -D], [0, yr + t + 0.05, ov], rr, [1, 1, 0]);
    return g;
  }
  // baie : quadrilatère (cellule de l'exemplaire) + appui de granit en saillie
  function tplOpening() {
    const g = new Geo();
    g.quad([-0.5, 0, 0.035], [0.5, 0, 0.035], [0.5, 1, 0.035], [-0.5, 1, 0.035], { mode: 3, tint: TA }, [0, 0, 1]);
    g.box(-0.31, -0.055, 0, 0.31, 0, 0.15, { mode: 0, reg: REG.STONE, rep: [REP.STONE, REP.STONE] }, 'z');
    return g;
  }
  function tplAwning() {
    const g = new Geo(), o = { mode: 0, reg: REG.AWNING, rep: [0.9, 0.9], tint: TA };
    const a = [-0.5, 0, 0.02], b = [0.5, 0, 0.02], c = [0.5, -0.5, 1.05], d = [-0.5, -0.5, 1.05];
    g.quad(a, b, c, d, o, [0, 1, 0.5]); g.quad(a, b, c, d, o, [0, -1, -0.5]);
    const e = [0.5, -0.78, 1.05], f = [-0.5, -0.78, 1.05];
    g.quad(d, c, e, f, o, [0, 0, 1]); g.quad(d, c, e, f, o, [0, 0, -1]);
    for (const sx of [-0.5, 0.5]) { const tri = [[sx, 0, 0.02], [sx, -0.5, 1.05], [sx, -0.78, 1.05]]; g.poly(tri, o, [1, 0, 0]); g.poly(tri, o, [-1, 0, 0]); }
    return g;
  }

  const SHUTTERS = ['#2e5c8a', '#3f78a8', '#2f6a52', '#4c7f5c', '#8e2f2b', '#b5463a', '#6d8fa8', '#2b6f73', '#c49a32', '#e9e6dc', '#4f6d8c', '#7f9fb3'];
  const AWNINGS = ['#b8322c', '#2f5d8a', '#2f6a52', '#c08a28', '#8e2f2b'];
  const isTerracotta = (hex) => { const c = new THREE.Color(hex); return c.r > c.b * 1.3 && c.r > 0.3; };

  // =====================================================================================================
  // Le kit
  // =====================================================================================================
  function create(opts) {
    const cap = Math.max(1, (opts && opts.maxHouses) || 3000);
    const atlas = paintAtlas();
    const matH = makeMaterial(atlas), matO = makeMaterial(atlas, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), matL = makeMaterial(atlas);
    const group = new THREE.Group(); group.name = 'kit-buildings';
    const batches = [];
    function batch(tpl, n, mat, name) {
      const g = tpl.build();
      const ia = (k, sz) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * sz), sz); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, a); return a; };
      const c1 = ia('iCol1', 3), c2 = ia('iCol2', 3), vv = ia('iVar', 4);
      const mesh = new THREE.InstancedMesh(g, mat, n);
      mesh.name = name; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      const b = {
        mesh, n: 0,
        put(m, a, bb, v) {
          if (this.n >= n) return; const i = this.n++;
          m.toArray(mesh.instanceMatrix.array, i * 16);
          if (a) { c1.array[i * 3] = a.r; c1.array[i * 3 + 1] = a.g; c1.array[i * 3 + 2] = a.b; }
          if (bb) { c2.array[i * 3] = bb.r; c2.array[i * 3 + 1] = bb.g; c2.array[i * 3 + 2] = bb.b; }
          if (v) vv.array.set(v, i * 4);
        },
        commit() { mesh.count = this.n; mesh.instanceMatrix.needsUpdate = c1.needsUpdate = c2.needsUpdate = vv.needsUpdate = true; },
      };
      batches.push(b);
      return b;
    }
    const body = batch(tplBody(), cap, matH, 'murs');
    const roofG = batch(tplRoofGable(), cap, matH, 'toits');
    const roofH = batch(tplRoofHip(), Math.ceil(cap * 0.4), matH, 'toits-croupe');
    const chim = batch(tplChimney(), cap * 2, matH, 'cheminees');
    const dorm = batch(tplDormer(), cap * 2, matH, 'lucarnes');
    const open = batch(tplOpening(), cap * 22, matO, 'baies');
    const awn = batch(tplAwning(), cap, matO, 'stores');

    const Mh = new THREE.Matrix4(), Ml = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
    function local(x, y, z, ry, sx, sy, sz) {
      _p.set(x, y, z); _q.setFromAxisAngle(_up, ry); _s.set(sx, sy, sz);
      return Ml.compose(_p, _q, _s).premultiply(Mh);
    }

    function addHouse(h) {
      const R = rng(((h.seed | 0) * 2654435761) ^ 0x5bd1e995);
      const f = clamp(Math.round(h.floors || 2), 1, 4), w = h.w || 4.75, d = h.d || 3.8, H = wallHeight(f);
      const roofHex = h.roof || '#5a6878', tile = isTerracotta(roofHex);
      const wallC = lin(h.wall || '#efe6d4').multiplyScalar(0.93 + R() * 0.12);
      const roofC = lin(roofHex).offsetHSL((R() - 0.5) * 0.02, (R() - 0.5) * 0.06 - (tile ? 0.08 : 0), 0).multiplyScalar(0.82 + R() * 0.32);
      const shutC = lin(h.shutter || pick(SHUTTERS, R));
      const stoneHouse = R() < (f <= 2 ? 0.16 : 0.07), quoins = !stoneHouse && R() < 0.33, plinth = 0.3 + R() * 0.4;
      const dz = (R() - 0.5) * 0.12;
      Mh.compose(_p.set(h.x, h.y, h.z), _q.setFromAxisAngle(_up, h.rotY || 0), _s.set(1, 1, 1));
      const Mhouse = Mh.clone();

      body.put(local(0, 0, dz, 0, w - 0.05, H, d), wallC, null, [stoneHouse ? 1 : 0, quoins ? 1 : 0, plinth, 0]);

      // ---- toit
      const r = R(); let kind = 'g';
      if (f >= 2 && r < 0.17) kind = 'f'; else if (r > 0.9) kind = 'h';
      const pitch = tile ? 0.42 + R() * 0.1 : 0.78 + R() * 0.16;
      const span = kind === 'f' ? w : d, rh = (span / 2) * Math.tan(pitch);
      const rv = [tile ? 1 : 0, stoneHouse ? 1 : 0, 0, 0];
      if (kind === 'g') roofG.put(local(0, H, dz, 0, w, rh, d), roofC, wallC, rv);
      else if (kind === 'f') roofG.put(local(0, H, dz, PI / 2, d, rh, w), roofC, wallC, rv);
      else roofH.put(local(0, H, dz, 0, w, rh, d), roofC, wallC, rv);
      const ry = H + rh * (1 + RT);

      // ---- cheminées de granit sur les pignons
      const chimney = (x, z, rot) => chim.put(local(x, ry - 0.02, z + dz, rot, 1, 0.85 + R() * 0.4, 1), wallC, roofC, [0, 0, 0, 0]);
      if (kind === 'g') { const k = R(), e = w / 2 - 0.42; if (k < 0.28) { chimney(e, 0, 0); chimney(-e, 0, 0); } else if (k < 0.62) chimney(e, 0, 0); else if (k < 0.94) chimney(-e, 0, 0); }
      else if (kind === 'f') chimney(0, -(d / 2 - 0.45), PI / 2);
      else chimney((R() < 0.5 ? 1 : -1) * w * 0.09, 0, 0);

      // ---- baies
      const narrow = w >= 4.4 && R() < 0.16, nb = narrow ? 3 : Math.max(1, Math.round(w / 2.35)), bw = w / nb;
      const sr = R(), style = narrow ? 'P' : sr < 0.45 ? 'S' : sr < 0.75 ? 'Z' : 'P';
      const cellFor = () => (style === 'P' ? REG.WIN_P : R() < 0.14 ? REG.WIN_C : style === 'S' ? REG.WIN_S : REG.WIN_Z);
      const zf = d / 2 + dz, zb = -d / 2 + dz;
      const opening = (x, y, z, rot, sw, sh, reg) => open.put(local(x, y, z, rot, sw, sh, 1), shutC, null, reg);
      const bayX = (i) => -w / 2 + bw * (i + 0.5);
      const shop = f >= 2 && R() < 0.28;
      if (shop) {
        opening(0, 0.06, zf, 0, w - 0.3, 2.5, R() < 0.5 ? REG.SHOP : REG.SHOP2);
        awn.put(local(0, 2.66, zf, 0, w - 0.45, 1, 1), lin(pick(AWNINGS, R)), null, null);
      } else {
        const db = Math.floor(R() * nb);
        for (let i = 0; i < nb; i++) {
          if (i === db) opening(bayX(i), 0.14, zf, 0, 2.0, 2.5, R() < 0.35 ? REG.DOOR_A : REG.DOOR);
          else opening(bayX(i), 0.72, zf, 0, 2.0, 1.6, cellFor());
        }
      }
      for (let k = 1; k < f; k++) { const y = GROUND + (k - 1) * STOREY + 0.55; for (let i = 0; i < nb; i++) opening(bayX(i), y, zf, 0, 2.0, 1.6, cellFor()); }
      // arrière : moins de baies, au hasard
      for (let k = 0; k < f; k++) { const y = k === 0 ? 0.72 : GROUND + (k - 1) * STOREY + 0.55; for (let i = 0; i < nb; i++) if (R() < 0.6) opening(-bayX(i), y, zb, PI, 2.0, 1.6, cellFor()); }
      // pignon sur rue : petite fenêtre de grenier
      if (kind === 'f' && rh > 2.0) { opening(0, H + 0.25, zf, 0, 1.25, 1.0, REG.WIN_P); opening(0, H + 0.25, zb, PI, 1.25, 1.0, REG.WIN_P); }

      // ---- lucarnes (toits d'ardoise assez raides)
      if (kind === 'g' && rh / d >= 0.5 && R() < (f === 1 ? 0.75 : 0.55)) {
        const zD = d / 2 - 0.22, s = clamp(Math.min(1, (zD - 0.05) / 1.6), 0.6, 1);
        const ys = H + rh * (1 - (2 * zD) / d) + RT * rh - 0.05;
        const xs = nb >= 2 && R() < 0.5 ? [bayX(0), bayX(nb - 1)] : [nb === 2 ? bayX(Math.floor(R() * 2)) : 0];
        for (const x of xs) dorm.put(local(x, ys, zD + dz, 0, s, s, s), roofC, wallC, rv);
      }
      Mh.copy(Mhouse);
      return ry + rh * RC;
    }

    function commit() { batches.forEach((b) => b.commit()); }
    function reset() { batches.forEach((b) => { b.n = 0; b.commit(); }); }
    function dispose() {
      batches.forEach((b) => { b.mesh.geometry.dispose(); group.remove(b.mesh); });
      [matH, matO, matL].forEach((m) => m.dispose()); atlas.dispose();
      landmarkStuff.forEach((x) => x.dispose());
    }
    const landmarkStuff = [];
    function landmark(kind, o) {
      const res = LANDMARKS[kind] ? LANDMARKS[kind]((o && o.seed) || 1, matL) : LANDMARKS.statue(1, matL);
      res.group.traverse((m) => { if (m.isMesh) { landmarkStuff.push(m.geometry); if (m.material !== matL) landmarkStuff.push(m.material); } });
      res.group.name = 'monument-' + kind;
      return res;
    }
    return { group, reset, addHouse, commit, landmark, dispose, material: matH };
  }

  // =====================================================================================================
  // Monuments (géométrie à l'échelle réelle, fusionnée par matériau)
  // =====================================================================================================
  const O = {
    stone: { mode: 0, reg: REG.STONE, rep: [REP.STONE, REP.STONE] },
    plaster: (hex) => ({ mode: 0, reg: REG.PLASTER, rep: [REP.PLASTER, REP.PLASTER], col: lin(hex) }),
    white: (hex) => ({ mode: 0, reg: REG.WHITE, rep: [1, 1], col: lin(hex) }),
    slate: (hex) => ({ mode: 0, reg: REG.SLATE, rep: [REP.SLATE, REP.SLATE], col: lin(hex || '#6c7884') }),
    tile: (hex) => ({ mode: 0, reg: REG.TILE, rep: [REP.TILE, REP.TILE], col: lin(hex || '#c0603e') }),
    wood: (hex) => ({ mode: 0, reg: REG.WOOD, rep: [2, 1], col: lin(hex || '#8a6a4a') }),
    fascia: (hex) => ({ mode: 0, reg: REG.FASCIA, rep: [1, 1], col: lin(hex || '#4a4f55') }),
    ridge: { mode: 0, reg: REG.RIDGE, rep: [1.2, 0.4] },
    gold: { mode: 0, reg: REG.GOLD, rep: [1, 1] },
    dark: { mode: 0, reg: REG.DARK, rep: [1, 1] },
  };
  // bloc à pignons : murs + toiture, faîtage selon x local, tourné de rot
  function gabledBlock(g, x, z, L, S, Hw, rh, rot, walls, roof, extra) {
    const e = extra || {};
    g.with(M(x, 0, z, rot), () => {
      g.box(-L / 2, e.base == null ? -3 : e.base, -S / 2, L / 2, Hw, S / 2, walls, 'yY');
      g.with(M(0, Hw, 0), () => roofGable(g, L, S, rh, { ox: e.ox == null ? 0.35 : e.ox, oz: e.oz == null ? 0.45 : e.oz, t: 0.22, rc: 0.18, rw: 0.22, os: roof, of: e.of || O.fascia(), og: e.og === undefined ? walls : e.og, or: O.ridge, under: e.under, ou: e.ou }));
    });
  }
  function mesh(g, mat, shadow) { const m = new THREE.Mesh(g.build(), mat); m.castShadow = shadow !== false; m.receiveShadow = true; return m; }

  const LANDMARKS = {
    // ---------- phare : tour effilée blanche à bandes rouges, galerie, lanterne chaude, maison du gardien
    phare(seed, mat) {
      const g = new Geo(), white = O.white('#f2efe8'), red = O.white('#b8322c');
      const rr = (y) => 3.0 - (0.95 * (y - 1.6)) / 23.4;
      g.cyl(0, 0, -3, 1.6, 3.8, 3.55, 18, O.stone, { top: true });
      [[1.6, 8, white], [8, 10.4, red], [10.4, 16, white], [16, 18.4, red], [18.4, 25, white]].forEach(([a, b, o]) => g.cyl(0, 0, a, b, rr(a), rr(b), 18, o));
      g.cell(0, 1.62, rr(1.6) - 0.02, 0, 1.8, 2.25, REG.DOOR_A, 0.1);
      [[6.5, 0.35], [12.5, -0.4], [20, 0.3]].forEach(([y, a]) => g.cell(Math.sin(a) * rr(y), y, Math.cos(a) * rr(y), a, 1.1, 0.9, REG.WIN_P, 0.1));
      g.cyl(0, 0, 25, 26.1, rr(25), 2.95, 18, O.stone);
      g.cyl(0, 0, 26.1, 26.4, 2.95, 2.95, 18, O.stone, { top: true });
      g.cyl(0, 0, 26.4, 27.5, 2.85, 2.85, 28, { mode: 0, reg: REG.RAIL, rep: [0.8, 1.1] }, { inside: true });
      g.cyl(0, 0, 26.4, 27.2, 1.6, 1.6, 8, O.white('#2c3136'));
      g.cyl(0, 0, 27.2, 29.4, 1.45, 1.45, 8, { mode: 6, reg: REG.LANTERN });
      g.cyl(0, 0, 29.4, 29.65, 1.8, 1.8, 8, O.white('#2c3136'), { top: true, bottom: true });
      g.cyl(0, 0, 29.65, 31.1, 1.75, 0.18, 8, O.white('#b8322c'));
      g.cyl(0, 0, 31.1, 31.9, 0.18, 0.04, 6, O.dark);
      // maison du gardien
      gabledBlock(g, 6.6, 0.4, 7, 5, 3.3, 2.4, 0, O.plaster('#f4f1ea'), O.slate());
      g.cell(6.0, 0.12, 2.9, 0, 2.0, 2.5, REG.DOOR, 0.05);
      g.cell(8.4, 0.75, 2.9, 0, 2.0, 1.6, REG.WIN_Z, 0.05);
      g.box(9.0, 3.0, 0.1, 9.6, 6.6, 0.75, O.stone, 'y');
      g.box(8.9, 6.6, 0.0, 9.7, 6.75, 0.85, O.stone);
      const group = new THREE.Group(); group.add(mesh(g, mat));
      const halo = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 10), new THREE.MeshBasicMaterial({ color: lin('#ffcf7a'), transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.y = 28.3; group.add(halo);
      return { group, height: 31.9 };
    },

    // ---------- église : nef, transept à roses, clocher-porche à flèche de granit, contreforts, porche latéral
    eglise(seed, mat) {
      const g = new Geo(), st = O.stone, sl = O.slate('#67737f');
      gabledBlock(g, 0, -3, 20, 10, 8.5, 7, PI / 2, st, sl);
      gabledBlock(g, 0, -6, 21, 5.5, 7.5, 5.5, 0, st, sl);
      gabledBlock(g, 6.75, 2.0, 3.5, 3.6, 3.8, 2.3, 0, st, sl, { ox: 0.2 });
      // contreforts
      const butt = (x, z, s) => { g.box(x - (s < 0 ? 1.0 : 0), -3, z - 0.4, x + (s > 0 ? 1.0 : 0), 6.2, z + 0.4, st, 'y'); g.box(x - (s < 0 ? 0.6 : 0), 6.2, z - 0.35, x + (s > 0 ? 0.6 : 0), 7.8, z + 0.35, st, 'y'); };
      [-12.4, -9.6, -2.4, 0.2, 3.8, 6.4].forEach((z) => butt(-5, z, -1));
      [-12.4, -9.6, -2.4, 6.4].forEach((z) => butt(5, z, 1));
      // baies
      [-11, -1, 2, 5].forEach((z) => g.cell(-5, 2.6, z, -PI / 2, 1.4, 3.8, REG.LANCET, 0.06));
      [-11, 5].forEach((z) => g.cell(5, 2.6, z, PI / 2, 1.4, 3.8, REG.LANCET, 0.06));
      g.cell(-10.5, 2.4, -6, -PI / 2, 3.4, 3.4, REG.ROSE, 0.06); g.cell(10.5, 2.4, -6, PI / 2, 3.4, 3.4, REG.ROSE, 0.06);
      g.cell(0, 2.2, -13, PI, 2.4, 5.2, REG.LANCET, 0.06);
      g.cell(8.5, 0, 2.0, PI / 2, 2.2, 3.4, REG.ARCH, 0.06);
      // clocher-porche
      const tz = 9.8, hw = 2.8;
      g.box(-hw, -3, tz - hw, hw, 21, tz + hw, st, 'y');
      [[8, 8.35], [14, 14.35], [20.6, 21.1]].forEach(([a, b]) => g.box(-hw - 0.18, a, tz - hw - 0.18, hw + 0.18, b, tz + hw + 0.18, st));
      for (const sx of [-1, 1]) for (const sz of [1]) { g.box(sx * hw - 0.5, -3, tz + sz * hw - 0.5, sx * hw + 0.5, 12, tz + sz * hw + 0.5, st, 'y'); g.with(M(sx * hw, 12, tz + sz * hw), () => g.cyl(0, 0, 0, 1.2, 0.7, 0.05, 4, st, { phase: PI / 4 })); }
      g.cell(0, 0, tz + hw, 0, 3.0, 4.8, REG.ARCH, 0.06);
      g.cell(0, 9.5, tz + hw, 0, 1.2, 2.6, REG.LANCET, 0.06);
      for (let k = 0; k < 4; k++) { const a = (k * PI) / 2, ca = Math.cos(a), sa = Math.sin(a); for (const s of [-1.15, 1.15]) g.cell(sa * hw + ca * s, 15.4, tz + ca * hw - sa * s, a, 1.15, 3.0, REG.LOUVRE, 0.06); }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { g.box(sx * hw - 0.35, 21.1, tz + sz * hw - 0.35, sx * hw + 0.35, 22.2, tz + sz * hw + 0.35, st, 'y'); g.with(M(sx * hw, 22.2, tz + sz * hw), () => g.cyl(0, 0, 0, 1.9, 0.5, 0.03, 4, st, { phase: PI / 4 })); }
      g.cyl(0, tz, 21.1, 36.5, 2.55, 0.08, 8, O.stone, { phase: PI / 8 });
      for (let k = 0; k < 4; k++) { const a = (k * PI) / 2; g.with(M(Math.sin(a) * 1.9, 21.1, tz + Math.cos(a) * 1.9, a), () => { g.box(-0.5, 0, -0.4, 0.5, 1.4, 0.4, st, 'y'); g.with(M(0, 1.4, 0), () => roofGable(g, 1.0, 0.8, 0.6, { ox: 0.05, oz: 0.05, t: 0.06, rc: 0.04, rw: 0.06, os: st, of: st, og: st })); }); }
      g.box(-0.08, 36.3, tz - 0.08, 0.08, 38.6, tz + 0.08, O.gold); g.box(-0.6, 37.6, tz - 0.08, 0.6, 37.76, tz + 0.08, O.gold);
      const group = new THREE.Group(); group.add(mesh(g, mat));
      return { group, height: 38.6 };
    },

    // ---------- halles : grand toit d'ardoise sur piliers de granit et poteaux de chêne, étals dessous
    halle(seed, mat) {
      const g = new Geo(), R = rng(seed * 77 + 5), st = O.stone, wd = O.wood('#8a6a4a');
      g.box(-9, -2, -14, 9, 0.2, 14, { mode: 0, reg: REG.PAVE, rep: [3, 3] }, 'y');
      const zs = []; for (let i = 0; i < 8; i++) zs.push(-12.6 + i * 3.6);
      for (const z of zs) {
        for (const x of [-7.6, 7.6]) g.box(x - 0.35, 0.2, z - 0.35, x + 0.35, 3.0, z + 0.35, st, 'y');
        for (const x of [-3.0, 3.0]) { g.box(x - 0.32, 0.2, z - 0.32, x + 0.32, 0.8, z + 0.32, st, 'y'); g.box(x - 0.21, 0.8, z - 0.21, x + 0.21, 7.0, z + 0.21, wd, 'y'); }
        g.box(-7.6, 3.0, z - 0.17, 7.6, 3.38, z + 0.17, wd);
        for (const sx of [-1, 1]) g.tube([sx * 3.0, 5.2, z], [sx * 5.4, 3.38, z], 0.12, 0.12, 4, wd);
      }
      for (const x of [-7.6, 7.6]) g.box(x - 0.3, 3.0, -13, x + 0.3, 3.45, 13, wd);
      for (const x of [-3.0, 3.0]) g.box(x - 0.24, 7.0, -13, x + 0.24, 7.42, 13, wd);
      g.with(M(0, 3.45, 0, PI / 2), () => roofGable(g, 26.6, 15.2, 8.6, { ox: 0.9, oz: 1.1, t: 0.3, rc: 0.22, rw: 0.28, os: O.slate('#6a7682'), of: O.fascia('#5a4b3c'), og: O.wood('#7b6c5c'), or: O.ridge, under: true, ou: O.wood('#5e4d3d') }));
      for (const z of [-13.35, 13.35]) g.cell(0, 6.2, z, z > 0 ? 0 : PI, 1.6, 3.2, REG.LOUVRE, 0.06);
      // étals
      const cloth = ['#b8322c', '#2f5d8a', '#e2b33c', '#2f6a52', '#f0ece2'];
      for (let i = 0; i < 6; i++) {
        const x = (i % 2 ? 1 : -1) * 5.3, z = -9 + Math.floor(i / 2) * 8 + R() * 1.5;
        g.box(x - 1.1, 0.2, z - 0.6, x + 1.1, 1.0, z + 0.6, wd, 'y');
        g.box(x - 1.15, 1.0, z - 0.65, x + 1.15, 1.1, z + 0.65, O.white(pick(cloth, R)), 'y');
        for (let k = 0; k < 3; k++) g.box(x - 0.9 + k * 0.65, 1.1, z - 0.4, x - 0.45 + k * 0.65, 1.35, z + 0.1, O.white(pick(['#d98b3a', '#7fa34a', '#c4452f', '#e8d9a8'], R)));
      }
      const group = new THREE.Group(); group.add(mesh(g, mat));
      return { group, height: 12.4 };
    },

    // ---------- moulin : tour de granit, calotte conique en bardeaux, guivre, quatre ailes à claire-voie
    moulin(seed, mat) {
      const g = new Geo(), st = O.stone, rr = (y) => 3.4 - 0.08 * y;
      g.cyl(0, 0, -3, 9.5, rr(-3), rr(9.5), 14, st);
      g.cyl(0, 0, 9.4, 9.85, 2.9, 2.9, 14, st, { top: true, bottom: true });
      const sh = { mode: 0, reg: REG.SHINGLE, rep: [1.5, 1.5] };
      g.cyl(0, 0, 9.85, 10.7, 2.75, 2.65, 14, sh);
      g.cyl(0, 0, 10.7, 13.3, 2.65, 0.25, 14, sh);
      g.cyl(0, 0, 13.3, 14.0, 0.25, 0.04, 6, O.dark);
      g.cell(Math.sin(-0.7) * rr(0), 0.0, Math.cos(-0.7) * rr(0), -0.7, 1.9, 2.4, REG.DOOR_A, 0.12);
      g.cell(Math.sin(1.0) * rr(4.5), 4.5, Math.cos(1.0) * rr(4.5), 1.0, 1.1, 0.9, REG.WIN_P, 0.12);
      g.cell(Math.sin(-2.3) * rr(7), 7, Math.cos(-2.3) * rr(7), -2.3, 1.1, 0.9, REG.WIN_P, 0.12);
      const wd = O.wood('#7a6048');
      g.tube([0, 10.9, 1.6], [0, 10.9, 3.4], 0.28, 0.28, 8, wd);
      g.tube([0, 10.1, -2.4], [0, 0.7, -8.6], 0.2, 0.2, 6, wd);
      g.tube([0, 9.9, -2.7], [0, 6.2, -6.2], 0.12, 0.12, 4, wd);
      g.cyl(0, -8.7, 0, 0.9, 0.35, 0.35, 6, wd, { top: true });
      // ailes
      const s = new Geo(), lat = { mode: 0, reg: REG.LATTICE, rep: [1.0, 1.0] }, sp = O.wood('#6e5640');
      s.cyl(0, 0, -0.35, 0.35, 0.55, 0.55, 8, O.dark, { top: true, bottom: true });
      for (let k = 0; k < 4; k++) {
        s.with(new THREE.Matrix4().makeRotationZ((k * PI) / 2), () => {
          s.box(-0.13, -0.3, -0.13, 0.13, 9.6, 0.13, sp);
          for (const hz of [[0, 0, 1], [0, 0, -1]]) {
            s.quad([0.13, 1.5, 0.02], [1.95, 1.5, 0.02], [1.95, 9.4, 0.02], [0.13, 9.4, 0.02], lat, hz);
            s.quad([-0.13, 1.5, 0.02], [-0.5, 1.5, 0.02], [-0.5, 9.4, 0.02], [-0.13, 9.4, 0.02], wd, hz);
          }
          s.box(1.85, 1.5, -0.05, 1.98, 9.4, 0.08, sp);
        });
      }
      // la tige des ailes pointe vers +z, inclinée vers le haut
      const sm = new THREE.Mesh(s.build(), mat); sm.castShadow = true; sm.receiveShadow = true;
      const hub = new THREE.Group(); hub.position.set(0, 10.9, 3.5); hub.rotation.x = -0.14; hub.add(sm);
      const group = new THREE.Group(); group.add(mesh(g, mat)); group.add(hub);
      const ph = rng(seed)() * PI;
      sm.rotation.z = ph;
      return { group, height: 10.9 + 9.6, animate(t) { sm.rotation.z = ph - t * 0.8; } };
    },

    // ---------- beffroi : tour carrée, horloge, abat-sons, mâchicoulis, créneaux, pyramide d'ardoise
    tour(seed, mat) {
      const g = new Geo(), st = O.stone, hw = 3;
      g.box(-3.35, -3, -3.35, 3.35, 1.2, 3.35, st, 'y');
      g.box(-3.45, 1.2, -3.45, 3.45, 1.45, 3.45, st, 'y');
      g.box(-hw, 1.45, -hw, hw, 19.0, hw, st, 'y');
      g.box(-hw - 0.15, 9.6, -hw - 0.15, hw + 0.15, 9.9, hw + 0.15, st);
      g.cell(0, 1.45, hw, 0, 2.0, 2.5, REG.DOOR_A, 0.05);
      for (let k = 0; k < 4; k++) {
        const a = (k * PI) / 2, ca = Math.cos(a), sa = Math.sin(a), at = (u, y, w, h, reg) => g.cell(sa * hw + ca * u, y, ca * hw - sa * u, a, w, h, reg, 0.06);
        at(0, 11.6, 2.7, 2.7, REG.CLOCK);
        at(-1.15, 15.0, 1.05, 2.9, REG.LOUVRE); at(1.15, 15.0, 1.05, 2.9, REG.LOUVRE);
        if (k > 0) at(0, 5.5, 1.1, 0.9, REG.WIN_P);
        for (let i = 0; i < 8; i++) { const u = -hw + 0.4 + i * 0.74; g.with(M(sa * hw + ca * u, 19.0, ca * hw - sa * u, a), () => g.box(-0.17, 0, -0.05, 0.17, 0.6, 0.45, st)); }
      }
      const po = 3.45, pi = 3.0;
      g.box(-po, 19.6, -po, po, 20.6, -pi, st); g.box(-po, 19.6, pi, po, 20.6, po, st);
      g.box(-po, 19.6, -pi, -pi, 20.6, pi, st); g.box(pi, 19.6, -pi, po, 20.6, pi, st);
      for (let k = 0; k < 4; k++) { const a = (k * PI) / 2; for (let i = 0; i < 4; i++) { const u = -po + 0.55 + i * 1.95; g.with(M(Math.sin(a) * (po - 0.22) + Math.cos(a) * u, 20.6, Math.cos(a) * (po - 0.22) - Math.sin(a) * u, a), () => g.box(-0.42, 0, -0.22, 0.42, 0.85, 0.22, st, 'y')); } }
      g.cyl(0, 0, 19.6, 25.6, 2.9 * Math.SQRT2, 0.03, 4, O.slate('#67737f'), { phase: PI / 4 });
      g.box(-0.06, 25.4, -0.06, 0.06, 27.0, 0.06, O.dark); g.cyl(0, 0, 26.2, 26.5, 0.22, 0.22, 6, O.gold, { top: true, bottom: true });
      g.box(-0.04, 26.65, -0.7, 0.04, 26.9, 0.6, O.gold);
      const group = new THREE.Group(); group.add(mesh(g, mat));
      return { group, height: 27 };
    },

    // ---------- statue : socle de granit, femme en coiffe haute regardant la mer, bronze vert-de-gris
    statue(seed, mat) {
      const g = new Geo(), st = O.stone, br = { mode: 0, reg: REG.VERD, rep: [0.9, 0.9], col: lin('#6fae98') }, brD = { mode: 0, reg: REG.VERD, rep: [0.9, 0.9], col: lin('#3f7566') };
      g.box(-2.3, -3, -2.3, 2.3, 0.35, 2.3, st, 'y');
      g.box(-1.85, 0.35, -1.85, 1.85, 0.7, 1.85, st, 'y');
      g.box(-1.38, 0.7, -1.38, 1.38, 1.0, 1.38, st, 'y');
      g.box(-1.15, 1.0, -1.15, 1.15, 3.4, 1.15, st, 'y');
      g.box(-1.4, 3.4, -1.4, 1.4, 3.7, 1.4, st);
      g.box(-1.25, 3.7, -1.25, 1.25, 3.85, 1.25, st, 'y');
      g.box(-0.6, 1.8, 1.15, 0.6, 2.55, 1.2, brD, 'z');
      g.with(M(0, 3.85, 0, 0, 1.5), () => {
        g.cyl(0, 0, 0, 0.12, 0.72, 0.72, 10, brD, { top: true });
        g.cyl(0, 0, 0.12, 0.32, 0.64, 0.6, 10, brD);
        g.cyl(0, 0, 0.32, 1.45, 0.6, 0.36, 10, br);
        g.cyl(0, 0, 1.45, 2.15, 0.36, 0.29, 10, br);
        g.cyl(0, 0, 1.95, 2.22, 0.43, 0.24, 10, brD);
        g.cyl(0, 0, 2.2, 2.32, 0.11, 0.11, 6, br);
        g.cyl(0, 0, 2.3, 2.46, 0.15, 0.2, 8, br, { bottom: true });
        g.cyl(0, 0, 2.46, 2.62, 0.2, 0.18, 8, br);
        g.cyl(0, 0, 2.62, 2.7, 0.18, 0.09, 8, br, { top: true });
        g.box(-0.08, 2.52, -0.13, 0.08, 3.02, 0.12, brD);
        g.tube([0.3, 2.1, 0], [0.48, 2.38, 0.18], 0.1, 0.09, 6, br);
        g.tube([0.48, 2.38, 0.18], [0.16, 2.58, 0.24], 0.09, 0.07, 6, br);
        g.tube([-0.3, 2.1, 0], [-0.4, 1.7, 0.08], 0.1, 0.09, 6, br);
        g.tube([-0.4, 1.7, 0.08], [-0.36, 1.38, 0.24], 0.09, 0.07, 6, br);
        g.cyl(-0.38, 0.32, 1.02, 1.3, 0.2, 0.25, 8, brD, { bottom: true, top: true });
      });
      const group = new THREE.Group(); group.add(mesh(g, mat));
      return { group, height: 3.85 + 3.02 * 1.5 };
    },
  };

  window.KIT_BUILDINGS = { STOREY, GROUND, wallHeight, create };
})();
