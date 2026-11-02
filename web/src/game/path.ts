import { COLS, isStandable, isTransit, ROWS } from './map';

export interface Point {
  x: number;
  y: number;
}

/**
 * A* sur la grille (4 directions). La destination peut être un « siège »
 * (franchissable uniquement comme point d'arrivée). Le point de départ est
 * toujours accepté, même s'il se trouve sur un siège.
 */
export function findPath(start: Point, goal: Point): Point[] | null {
  if (start.x === goal.x && start.y === goal.y) return [];
  if (!isStandable(goal.x, goal.y)) return null;
  const idx = (x: number, y: number) => y * COLS + x;
  const open: number[] = [idx(start.x, start.y)];
  const came = new Int32Array(COLS * ROWS).fill(-1);
  const g = new Float32Array(COLS * ROWS).fill(Infinity);
  const f = new Float32Array(COLS * ROWS).fill(Infinity);
  const closed = new Uint8Array(COLS * ROWS);
  const h = (x: number, y: number) => Math.abs(x - goal.x) + Math.abs(y - goal.y);
  g[idx(start.x, start.y)] = 0;
  f[idx(start.x, start.y)] = h(start.x, start.y);
  const goalIdx = idx(goal.x, goal.y);

  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]!]! < f[open[best]!]!) best = i;
    const current = open.splice(best, 1)[0]!;
    if (current === goalIdx) {
      const path: Point[] = [];
      let c = current;
      while (c !== idx(start.x, start.y)) {
        path.push({ x: c % COLS, y: Math.floor(c / COLS) });
        c = came[c]!;
      }
      return path.reverse();
    }
    closed[current] = 1;
    const cx = current % COLS;
    const cy = Math.floor(current / COLS);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const n = idx(nx, ny);
      if (closed[n]) continue;
      if (n !== goalIdx && !isTransit(nx, ny)) continue;
      // léger surcoût aux changements de direction : trajets plus naturels
      const turn = came[current] !== -1 && (came[current]! % COLS === cx) !== (dx === 0) ? 0.2 : 0;
      const tentative = g[current]! + 1 + turn;
      if (tentative < g[n]!) {
        came[n] = current;
        g[n] = tentative;
        f[n] = tentative + h(nx, ny);
        if (!open.includes(n)) open.push(n);
      }
    }
  }
  return null;
}

/** Tuile franchissable la plus proche (pour « rattraper » un personnage mal placé). */
export function nearestTransit(p: Point): Point {
  if (isTransit(p.x, p.y)) return p;
  for (let r = 1; r < 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        if (isTransit(p.x + dx, p.y + dy)) return { x: p.x + dx, y: p.y + dy };
      }
    }
  }
  return p;
}
