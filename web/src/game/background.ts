import { drawText, textWidth } from './font';
import { COLS, floorAt, LABELS, ROWS, TILE, WORLD_H, WORLD_W } from './map';
import { C } from './palette';

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

type G = CanvasRenderingContext2D;
const rect = (g: G, x: number, y: number, w: number, h: number, color: string) => {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
};

// ---------------------------------------------------------------------- sols

function wood(g: G, tx: number, ty: number) {
  const x0 = tx * TILE;
  const y0 = ty * TILE;
  rect(g, x0, y0, TILE, TILE, C.woodA);
  for (let row = 0; row < 4; row++) {
    const y = y0 + row * 4;
    if ((tx + ty + row) % 3 === 0) rect(g, x0, y, TILE, 4, C.woodB);
    rect(g, x0, y + 3, TILE, 1, C.woodLine);
    const seam = Math.floor(hash(tx, ty * 4 + row) * 16);
    rect(g, x0 + seam, y, 1, 3, C.woodLine);
    if (hash(tx * 7, ty * 3 + row) > 0.6) rect(g, x0 + ((seam + 6) % 15), y + 1, 2, 1, C.woodGrain);
  }
}

function carpet(g: G, tx: number, ty: number, a: string, b: string, pattern: 'dots' | 'check' | 'diamond') {
  const x0 = tx * TILE;
  const y0 = ty * TILE;
  rect(g, x0, y0, TILE, TILE, a);
  if (pattern === 'check') {
    rect(g, x0, y0, 8, 8, b);
    rect(g, x0 + 8, y0 + 8, 8, 8, b);
  } else if (pattern === 'dots') {
    for (let y = 2; y < 16; y += 4) for (let x = (y / 2) % 4; x < 16; x += 4) rect(g, x0 + x, y0 + y, 1, 1, b);
  } else {
    for (const [x, y] of [[8, 1], [7, 2], [9, 2], [8, 3], [0, 9], [15, 9], [1, 8], [1, 10]]) rect(g, x0 + x!, y0 + y!, 1, 1, b);
  }
}

function metal(g: G, tx: number, ty: number) {
  const x0 = tx * TILE;
  const y0 = ty * TILE;
  rect(g, x0, y0, TILE, TILE, C.srvFloorA);
  rect(g, x0, y0, TILE, 1, C.srvLine);
  rect(g, x0, y0, 1, TILE, C.srvLine);
  rect(g, x0 + 8, y0, 1, TILE, '#58656f');
  rect(g, x0, y0 + 8, TILE, 1, '#58656f');
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) rect(g, x0 + x!, y0 + y!, 1, 1, '#8693a0');
}

function webFloor(g: G, tx: number, ty: number) {
  const x0 = tx * TILE;
  const y0 = ty * TILE;
  rect(g, x0, y0, TILE, TILE, (tx + ty) % 2 ? C.webFloorA : C.webFloorB);
  for (let y = 3; y < 16; y += 6) for (let x = 3; x < 16; x += 6) rect(g, x0 + x, y0 + y, 1, 1, C.webDot);
}

function arcadeFloor(g: G, tx: number, ty: number) {
  const x0 = tx * TILE;
  const y0 = ty * TILE;
  rect(g, x0, y0, TILE, TILE, C.arcadeA);
  const shapes = ['#f6c84c', '#5fd0e8', '#ea7fb3', '#7fe0b0'];
  const r = hash(tx, ty);
  const color = shapes[Math.floor(r * shapes.length)]!;
  const sx = x0 + 2 + Math.floor(hash(ty, tx) * 9);
  const sy = y0 + 2 + Math.floor(r * 9);
  // petits triangles façon moquette de salle d'arcade
  rect(g, sx, sy + 2, 3, 1, color);
  rect(g, sx + 1, sy + 1, 1, 1, color);
  rect(g, x0 + ((sx + 7) % 14), y0 + ((sy + 6) % 13), 2, 1, C.arcadeB);
  rect(g, x0 + ((sx + 3) % 14), y0 + ((sy + 10) % 13), 1, 2, '#8a5d7e');
}

function doormat(g: G, tx: number, ty: number) {
  const x0 = tx * TILE;
  const y0 = ty * TILE;
  wood(g, tx, ty);
  rect(g, x0 + (tx === 22 ? 2 : 0), y0 + 2, tx === 22 ? 14 : 14, 13, '#7a5534');
  rect(g, x0 + (tx === 22 ? 3 : 0), y0 + 3, 12, 11, '#94683f');
}

// ---------------------------------------------------------------------- murs

const WALL_ZONES: Array<{ from: number; to: number; face: string; shade: string; stripes: boolean }> = [
  { from: 1, to: 8, face: C.wallLav, shade: C.wallLavShade, stripes: true },
  { from: 9, to: 9, face: C.wallCream, shade: C.wallCreamShade, stripes: false },
  { from: 10, to: 21, face: C.wallSage, shade: C.wallSageShade, stripes: true },
  { from: 22, to: 22, face: C.wallCream, shade: C.wallCreamShade, stripes: false },
  { from: 23, to: 30, face: C.wallSlate, shade: C.wallSlateShade, stripes: false },
];

function wallFace(g: G) {
  for (const z of WALL_ZONES) {
    const x0 = z.from * TILE;
    const w = (z.to - z.from + 1) * TILE;
    rect(g, x0, 0, w, 2, C.wallTop);
    rect(g, x0, 2, w, 1, C.wallTopHi);
    rect(g, x0, 3, w, 24, z.face);
    if (z.stripes) for (let x = x0 + 2; x < x0 + w; x += 4) rect(g, x, 3, 1, 24, z.shade);
    else for (let x = x0; x < x0 + w; x += 16) rect(g, x, 3, 1, 24, z.shade);
    rect(g, x0, 27, w, 1, C.baseboardHi);
    rect(g, x0, 28, w, 3, C.baseboard);
    rect(g, x0, 31, w, 1, '#4a3628');
  }
  // ombre portée sur le sol
  g.fillStyle = 'rgba(20, 12, 30, 0.22)';
  g.fillRect(TILE, 32, WORLD_W - 2 * TILE, 3);
}

function frameWalls(g: G) {
  // murs latéraux
  for (const x of [0, WORLD_W - TILE]) {
    rect(g, x, 0, TILE, WORLD_H, C.wallTop);
    rect(g, x === 0 ? TILE - 2 : x + 1, 0, 1, WORLD_H, C.wallTopHi);
  }
  // mur sud + porte d'entrée (x 22-23)
  const y = (ROWS - 1) * TILE;
  rect(g, 0, y, WORLD_W, TILE, C.wallTop);
  rect(g, TILE - 1, y, WORLD_W - 2 * TILE + 2, 1, C.wallTopHi);
  const doorX = 22 * TILE;
  rect(g, doorX, y, 2 * TILE, TILE, '#2a2f45');
  rect(g, doorX, y, 2 * TILE, 1, '#3d4462');
  rect(g, doorX + 4, y + 3, 24, 13, '#343b58');
  rect(g, doorX - 2, y - 2, 3, TILE + 2, '#7a4a2b');
  rect(g, doorX + 2 * TILE - 1, y - 2, 3, TILE + 2, '#7a4a2b');
  drawText(g, 'EXIT', doorX + 9, y + 6, '#7fe08a');
}

function verticalGlass(g: G, tx: number) {
  const x = tx * TILE + 6;
  const top = 26;
  const bottom = 7 * TILE + 12;
  rect(g, x, top, 4, bottom - top, C.glassFrame);
  g.fillStyle = 'rgba(190, 230, 245, 0.55)';
  g.fillRect(x + 1, top + 2, 2, bottom - top - 4);
  rect(g, x + 1, top + 20, 1, 6, C.glassHi);
  rect(g, x + 1, top + 50, 1, 4, C.glassHi);
}

// --------------------------------------------------------------------- tapis

function rug(g: G, x: number, y: number, w: number, h: number, fill: string, border: string, accent: string) {
  rect(g, x, y, w, h, border);
  rect(g, x + 2, y + 2, w - 4, h - 4, fill);
  for (let i = x + 4; i < x + w - 4; i += 4) {
    rect(g, i, y + 1, 2, 1, accent);
    rect(g, i, y + h - 2, 2, 1, accent);
  }
  for (let j = y + 6; j < y + h - 6; j += 6) {
    for (let i = x + 6; i < x + w - 6; i += 8) rect(g, i + ((j / 6) % 2) * 4, j, 2, 2, accent);
  }
}

function plaque(g: G, text: string, cx: number, y: number) {
  const w = textWidth(text) + 6;
  const x = Math.round(cx - w / 2);
  rect(g, x, y, w, 9, C.outline);
  rect(g, x + 1, y + 1, w - 2, 7, '#4a3628');
  rect(g, x + 1, y + 1, w - 2, 1, '#6b4f3a');
  drawText(g, text, x + 3, y + 2, C.gold);
}

function floorTile(g: G, ch: string, tx: number, ty: number) {
  switch (ch) {
    case '.':
    case 'r':
      wood(g, tx, ty);
      break;
    case 'c':
      carpet(g, tx, ty, C.chefFloorA, C.chefFloorB, 'diamond');
      break;
    case 'l':
      carpet(g, tx, ty, C.libFloorA, C.libFloorB, 'check');
      break;
    case 's':
      metal(g, tx, ty);
      break;
    case 'm':
      carpet(g, tx, ty, C.meetA, C.meetB, 'check');
      break;
    case 'w':
      webFloor(g, tx, ty);
      break;
    case 'a':
      arcadeFloor(g, tx, ty);
      break;
    case 'd':
      doormat(g, tx, ty);
      break;
    case 'g':
      // sol sous les cloisons basses
      if (tx < 9) carpet(g, tx, ty, C.chefFloorA, C.chefFloorB, 'diamond');
      else metal(g, tx, ty);
      break;
    default:
      break;
  }
}

/** Fond statique : sols, murs, tapis, étiquettes. */
export function renderBackground(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = WORLD_W;
  c.height = WORLD_H;
  const g = c.getContext('2d')!;
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      const ch = floorAt(tx, ty);
      if (ch === 'G') {
        // cloison vitrée verticale : moitié gauche = sol de gauche, moitié droite = sol de droite
        floorTile(g, floorAt(tx + 1, ty), tx, ty);
        g.save();
        g.beginPath();
        g.rect(tx * TILE, ty * TILE, TILE / 2, TILE);
        g.clip();
        floorTile(g, floorAt(tx - 1, ty), tx, ty);
        g.restore();
      } else {
        floorTile(g, ch, tx, ty);
      }
    }
  }
  // tapis
  rug(g, 2 * TILE + 4, 3 * TILE + 2, 5 * TILE - 8, 3 * TILE - 2, '#7e3448', '#5a2234', C.gold);
  rug(g, TILE + 6, 15 * TILE + 6, 5 * TILE - 4, 4 * TILE - 10, '#b4524a', '#8a3a34', '#e39a7c');
  rug(g, 26 * TILE + 2, 10 * TILE + 2, 4 * TILE - 4, 3 * TILE - 4, '#22305a', '#1a2448', '#5fd0e8');
  wallFace(g);
  frameWalls(g);
  verticalGlass(g, 9);
  verticalGlass(g, 22);
  // étiquettes
  for (const label of LABELS) {
    const cx = label.x * TILE;
    if (label.wall) plaque(g, label.text, cx, 3);
    else {
      g.globalAlpha = 0.38;
      drawText(g, label.text, Math.round(cx - textWidth(label.text) / 2), Math.round(label.y * TILE), C.outline);
      g.globalAlpha = 1;
    }
  }
  // tapis d'entrée « QG »
  drawText(g, 'QG', 22 * TILE + 12, 18 * TILE + 6, '#d9b98a');
  return c;
}

// ----------------------------------------------------- éléments muraux animés

function skyColors(hour: number): { top: string; bottom: string; night: boolean } {
  if (hour >= 21 || hour < 5) return { top: '#141a3a', bottom: '#27306a', night: true };
  if (hour < 7) return { top: '#3a3f7a', bottom: '#f0a070', night: false };
  if (hour < 18) return { top: '#6cb6ff', bottom: '#bfe6ff', night: false };
  if (hour < 21) return { top: '#5a4a8a', bottom: '#ff9a6a', night: false };
  return { top: '#141a3a', bottom: '#27306a', night: true };
}

function drawWindow(g: G, x: number, y: number, w: number, h: number, now: Date, t: number) {
  const hour = now.getHours() + now.getMinutes() / 60;
  const sky = skyColors(hour);
  rect(g, x - 2, y - 2, w + 4, h + 4, '#6b4f3a');
  rect(g, x - 1, y - 1, w + 2, h + 2, '#8a6a4a');
  const grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, sky.top);
  grad.addColorStop(1, sky.bottom);
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  if (sky.night) {
    for (let i = 0; i < 6; i++) {
      const sx = x + Math.floor(hash(i, x) * w);
      const sy = y + Math.floor(hash(x, i) * (h - 3));
      if (Math.sin(t * 2 + i * 1.7) > -0.3) rect(g, sx, sy, 1, 1, '#fff6c8');
    }
    rect(g, x + w - 7, y + 2, 3, 3, '#fff1c2');
    rect(g, x + w - 6, y + 2, 2, 2, sky.top);
  } else {
    // nuages qui dérivent
    const drift = (t * 1.5) % (w + 12);
    for (const [ox, oy] of [[0, 3], [14, 8]] as const) {
      const cx = x + ((ox + drift) % (w + 12)) - 8;
      g.save();
      g.beginPath();
      g.rect(x, y, w, h);
      g.clip();
      rect(g, Math.round(cx), y + oy, 7, 2, '#ffffff');
      rect(g, Math.round(cx) + 2, y + oy - 1, 3, 1, '#ffffff');
      g.restore();
    }
  }
  // croisillon + rebord
  rect(g, x + Math.floor(w / 2), y, 1, h, '#8a6a4a');
  rect(g, x, y + Math.floor(h / 2), w, 1, '#8a6a4a');
  rect(g, x - 3, y + h + 1, w + 6, 2, '#a07a52');
  return sky.night;
}

function drawClock(g: G, cx: number, cy: number, now: Date) {
  g.fillStyle = C.outline;
  g.beginPath();
  g.arc(cx + 0.5, cy + 0.5, 5.5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fbf7ef';
  g.beginPath();
  g.arc(cx + 0.5, cy + 0.5, 4.5, 0, Math.PI * 2);
  g.fill();
  const h = (now.getHours() % 12) + now.getMinutes() / 60;
  const m = now.getMinutes();
  const hand = (angle: number, len: number, color: string) => {
    for (let i = 1; i <= len; i++) {
      rect(g, Math.round(cx + Math.sin(angle) * i), Math.round(cy - Math.cos(angle) * i), 1, 1, color);
    }
  };
  hand((h / 12) * Math.PI * 2, 2, C.outline);
  hand((m / 60) * Math.PI * 2, 3, C.red);
  rect(g, cx, cy, 1, 1, C.outline);
}

function drawWallScreen(g: G, x: number, y: number, w: number, h: number, activity: number[], t: number) {
  rect(g, x - 1, y - 1, w + 2, h + 2, C.outline);
  rect(g, x, y, w, h, '#0e1a22');
  const max = Math.max(1, ...activity);
  rect(g, x, y + h - 1, w, 1, '#1d3a2a');
  activity.slice(-w).forEach((v, i, arr) => {
    const bar = Math.max(1, Math.round((v / max) * (h - 3)));
    rect(g, x + w - arr.length + i, y + h - 1 - bar, 1, bar, i === arr.length - 1 && Math.floor(t * 2) % 2 ? '#9dffb8' : '#3fcf78');
  });
}

/** Fenêtres (ciel selon l'heure locale), horloge et écran de supervision. Renvoie vrai la nuit. */
export function drawWallDynamics(g: G, t: number, now: Date, activity: number[]): boolean {
  const night = drawWindow(g, 36, 13, 26, 12, now, t);
  drawWindow(g, 14 * TILE + 3, 13, 26, 12, now, t + 3);
  drawClock(g, 92, 19, now);
  drawWallScreen(g, 27 * TILE + 1, 13, 14, 12, activity, t);
  return night;
}
