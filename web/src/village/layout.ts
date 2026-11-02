import type { Activity } from '../../../shared/types';

export interface Point {
  x: number;
  z: number;
}
export const SIZE = { x: 19, z: 15 };
export const HOUSES = [
  { x: -10, z: -7, width: 4.8, depth: 4, roof: '#92705b', label: 'Bibliothèque', kind: 'library' },
  { x: -2, z: -9, width: 5, depth: 4, roof: '#b76f49', label: 'Atelier du code', kind: 'code' },
  { x: 7, z: -8, width: 4.8, depth: 4, roof: '#a86646', label: 'Laboratoire de tests', kind: 'tests' },
  { x: -11, z: 1, width: 4.5, depth: 3.8, roof: '#626d67', label: 'Maison du chef', kind: 'chief' },
  { x: -10, z: 9, width: 4.3, depth: 3.5, roof: '#ab9671', label: 'Livraison', kind: 'delivery' },
] as const;

export const DESTINATIONS: Record<Activity, Point> = {
  idle: { x: 1, z: 5 },
  thinking: { x: -2, z: -5 },
  planning: { x: -5, z: 2 },
  reading: { x: -10, z: -3 },
  writing: { x: -2, z: -5 },
  running: { x: 7, z: -4 },
  browsing: { x: -10, z: -3 },
  delegating: { x: -7, z: 3 },
  waiting: { x: -3, z: 3 },
  done: { x: -4, z: 9 },
  error: { x: 5, z: -3 },
  leaving: { x: -2, z: 12 },
};

export function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function onIsland(x: number, z: number): boolean {
  const angle = Math.atan2(z / SIZE.z, x / SIZE.x);
  const r = 1 + 0.055 * Math.sin(angle * 5) + 0.04 * Math.cos(angle * 7);
  return (x / SIZE.x) ** 2 + (z / SIZE.z) ** 2 < r * r;
}

export function inPond(x: number, z: number): boolean {
  return ((x - 8.5) / 5.4) ** 2 + ((z - 6.2) / 3.8) ** 2 < 1;
}

export function inBuilding(x: number, z: number, margin = 0): boolean {
  return HOUSES.some((h) => Math.abs(x - h.x) < h.width / 2 + margin && Math.abs(z - h.z) < h.depth / 2 + margin);
}

export function walkable(x: number, z: number): boolean {
  return Math.abs(x) < 17 && Math.abs(z) < 13 && onIsland(x, z) && !inPond(x, z) && !inBuilding(x, z, 0.45);
}

export function pathDistance(x: number, z: number): number {
  // Shared by the soil texture, paving, grass exclusion and tree placement.
  const segments = [
    [-1, -6, -1, 12],
    [-11, -3.5, 7.5, -3.5],
    [-11, 4.5, 2, 4.5],
    [-10, 12, -1, 12],
    [-7, 0, -1, 0],
    [0, 1, 5, 1],
  ];
  return Math.min(
    ...segments.map(([ax, az, bx, bz]) => {
      const dx = bx! - ax!,
        dz = bz! - az!;
      const t = Math.max(0, Math.min(1, ((x - ax!) * dx + (z - az!) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - ax! - dx * t, z - az! - dz * t);
    }),
  );
}

/** Stable personal work spots; no actor is sent through a wall or the pond. */
export function workSpot(activity: Activity, seed: number): Point {
  const home = DESTINATIONS[activity];
  const candidates: Point[] = [];
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      if (walkable(home.x + dx, home.z + dz)) candidates.push({ x: home.x + dx, z: home.z + dz });
    }
  return candidates[(seed >>> 0) % candidates.length] ?? home;
}

/** Breadth-first routing on this small fixed grid. Empty means already there/unreachable. */
export function route(from: Point, to: Point): Point[] {
  const start = { x: Math.round(from.x), z: Math.round(from.z) };
  const goal = { x: Math.round(to.x), z: Math.round(to.z) };
  const key = (p: Point) => `${p.x},${p.z}`;
  const queue: Point[] = [start];
  const parents = new Map<string, Point | null>([[key(start), null]]);
  if (!walkable(goal.x, goal.z)) return [];
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i]!;
    if (p.x === goal.x && p.z === goal.z) {
      const result: Point[] = [];
      let at: Point | null = p;
      while (at && key(at) !== key(start)) {
        result.push(at);
        at = parents.get(key(at)) ?? null;
      }
      return result.reverse();
    }
    for (const [dx, dz] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ]) {
      const next = { x: p.x + dx!, z: p.z + dz! };
      if (!walkable(next.x, next.z) || parents.has(key(next))) continue;
      parents.set(key(next), p);
      queue.push(next);
    }
  }
  return [];
}
