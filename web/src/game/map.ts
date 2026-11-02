import type { Dir } from './characters';

export const TILE = 16;
export const COLS = 32;
export const ROWS = 20;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

/**
 * Plan du QG (une lettre par tuile) :
 *  # mur · c bureau du Chef · l bibliothèque · s salle serveurs · G/g cloisons vitrées
 *  . parquet · w coin Web · r salon · m salle de réunion · a arcade · d paillasson
 */
export const FLOOR: string[] = [
  '################################',
  '################################',
  '#ccccccccGllllllllllllGssssssss#',
  '#ccccccccGllllllllllllGssssssss#',
  '#ccccccccGllllllllllllGssssssss#',
  '#ccccccccGllllllllllllGssssssss#',
  '#ccccccccGllllllllllllGssssssss#',
  '#gggggccgGllllllllllllGgssggggg#',
  '#..............................#',
  '#.......................wwwwwww#',
  '#.......................wwwwwww#',
  '#.......................wwwwwww#',
  '#.......................wwwwwww#',
  '#.......................wwwwwww#',
  '#..............................#',
  '#rrrrrrrrrr.mmmmmmmmm...aaaaaaa#',
  '#rrrrrrrrrr.mmmmmmmmm...aaaaaaa#',
  '#rrrrrrrrrr.mmmmmmmmm...aaaaaaa#',
  '#rrrrrrrrrr.mmmmmmmmm.ddaaaaaaa#',
  '################################',
];

for (const [i, row] of FLOOR.entries()) {
  if (row.length !== COLS) throw new Error(`Ligne ${i} du plan : ${row.length} colonnes`);
}

export const floorAt = (x: number, y: number): string => FLOOR[y]?.[x] ?? '#';

export type ZoneId =
  | 'chef'
  | 'library'
  | 'server'
  | 'desks'
  | 'planning'
  | 'web'
  | 'meeting'
  | 'lounge'
  | 'arcade'
  | 'door'
  | 'brief';

export interface Spot {
  id: string;
  zone: ZoneId;
  x: number;
  y: number;
  face: Dir;
  pose: 'stand' | 'sit';
  /** Décalage de rendu en pixels (ex. chaise centrée sous un bureau de 2 tuiles). */
  ox?: number;
  oy?: number;
  desk?: number;
  tag?: string;
}

export type PropKind =
  | 'desk'
  | 'chair'
  | 'chairFront'
  | 'chefDesk'
  | 'chefChair'
  | 'bookshelf'
  | 'rack'
  | 'plant'
  | 'couch'
  | 'coffee'
  | 'cooler'
  | 'arcade'
  | 'vending'
  | 'babyfoot'
  | 'whiteboard'
  | 'meetingTable'
  | 'globe'
  | 'radar'
  | 'antenna'
  | 'glassH'
  | 'coffeeTable'
  | 'beanbag'
  | 'basket'
  | 'flipchart'
  | 'lamp'
  | 'cabinet'
  | 'readingTable'
  | 'stool'
  | 'coatRack'
  | 'copier'
  | 'extinguisher';

export interface PropDef {
  kind: PropKind;
  x: number;
  y: number;
  /** Largeur au sol en tuiles. */
  w?: number;
  /** Bloque le passage (défaut : oui, sur toute la largeur). */
  block?: boolean;
  /** Décalage horizontal de rendu (px). */
  ox?: number;
  variant?: number;
  desk?: number;
}

// ------------------------------------------------------------------ bureaux

/** Postes de travail : 2 rangées de 5 bureaux (2 tuiles de large). */
export const DESKS: Array<{ x: number; y: number }> = [9, 12].flatMap((y) => [2, 5, 8, 11, 14].map((x) => ({ x, y })));

const props: PropDef[] = [];
const spots: Spot[] = [];
/** Tuiles infranchissables (en plus des murs). */
const hardBlocks = new Set<string>();
/** Tuiles « sièges » : on peut s'y rendre mais pas les traverser. */
const seats = new Set<string>();

const key = (x: number, y: number) => `${x},${y}`;

function prop(def: PropDef) {
  props.push(def);
  if (def.block === false) return;
  for (let i = 0; i < (def.w ?? 1); i++) hardBlocks.add(key(def.x + i, def.y));
}
function spot(s: Spot, seat = false) {
  spots.push(s);
  if (seat) seats.add(key(s.x, s.y));
}

// Bureau du Chef
prop({ kind: 'plant', x: 1, y: 2 });
prop({ kind: 'bookshelf', x: 7, y: 2, w: 2, variant: 7 });
prop({ kind: 'chefChair', x: 4, y: 3, block: false });
prop({ kind: 'chefDesk', x: 3, y: 4, w: 3 });
prop({ kind: 'lamp', x: 1, y: 5 });
prop({ kind: 'cabinet', x: 8, y: 5 });
prop({ kind: 'plant', x: 1, y: 6, variant: 1 });
spot({ id: 'chef-seat', zone: 'chef', x: 4, y: 3, face: 'down', pose: 'sit' }, true);
spot({ id: 'chef-shelf-1', zone: 'chef', x: 7, y: 3, face: 'up', pose: 'stand' });
spot({ id: 'chef-shelf-2', zone: 'chef', x: 8, y: 3, face: 'up', pose: 'stand' });
spot({ id: 'chef-window', zone: 'chef', x: 2, y: 3, face: 'up', pose: 'stand' });

// Bibliothèque
for (const [i, x] of [10, 12, 16, 18, 20].entries()) prop({ kind: 'bookshelf', x, y: 2, w: 2, variant: i });
prop({ kind: 'stool', x: 14, y: 4, block: false });
prop({ kind: 'stool', x: 15, y: 4, block: false });
prop({ kind: 'readingTable', x: 13, y: 5, w: 4 });
prop({ kind: 'stool', x: 14, y: 6, block: false });
prop({ kind: 'stool', x: 15, y: 6, block: false });
prop({ kind: 'plant', x: 21, y: 7, variant: 2 });
prop({ kind: 'plant', x: 10, y: 7, variant: 1 });
for (const x of [10, 11, 12, 13, 16, 17, 18, 19, 20, 21]) {
  spot({ id: `lib-shelf-${x}`, zone: 'library', x, y: 3, face: 'up', pose: 'stand' });
}
spot({ id: 'lib-table-n1', zone: 'library', x: 14, y: 4, face: 'down', pose: 'sit' }, true);
spot({ id: 'lib-table-n2', zone: 'library', x: 15, y: 4, face: 'down', pose: 'sit' }, true);
spot({ id: 'lib-table-s1', zone: 'library', x: 14, y: 6, face: 'up', pose: 'sit' }, true);
spot({ id: 'lib-table-s2', zone: 'library', x: 15, y: 6, face: 'up', pose: 'sit' }, true);

// Salle serveurs
for (const x of [23, 24, 25, 26, 28, 29, 30]) prop({ kind: 'rack', x, y: 2, variant: x });
for (const x of [27, 28, 29, 30]) prop({ kind: 'rack', x, y: 5, variant: x + 10 });
prop({ kind: 'extinguisher', x: 23, y: 6 });
for (const x of [23, 24, 25, 26, 28, 29, 30]) spot({ id: `srv-${x}`, zone: 'server', x, y: 3, face: 'up', pose: 'stand' });
for (const x of [27, 28, 29, 30]) spot({ id: `srv-b-${x}`, zone: 'server', x, y: 6, face: 'up', pose: 'stand' });

// Cloisons vitrées horizontales (portes laissées libres)
for (const x of [1, 2, 3, 4, 5, 8]) prop({ kind: 'glassH', x, y: 7 });
for (const x of [23, 26, 27, 28, 29, 30]) prop({ kind: 'glassH', x, y: 7 });

// Open space
DESKS.forEach((d, i) => {
  prop({ kind: 'desk', x: d.x, y: d.y, w: 2, desk: i, variant: i });
  prop({ kind: 'chair', x: d.x, y: d.y + 1, ox: 8, block: false, desk: i });
  hardBlocks.add(key(d.x + 1, d.y + 1));
  spot({ id: `desk-${i}`, zone: 'desks', x: d.x, y: d.y + 1, face: 'up', pose: 'sit', ox: 8, desk: i }, true);
  spot({ id: `brief-${i}`, zone: 'brief', x: d.x + 1, y: d.y + 2, face: 'up', pose: 'stand', desk: i });
});
prop({ kind: 'whiteboard', x: 18, y: 9, w: 3 });
for (const x of [18, 19, 20]) spot({ id: `plan-${x}`, zone: 'planning', x, y: 10, face: 'up', pose: 'stand' });
prop({ kind: 'copier', x: 22, y: 9 });
prop({ kind: 'plant', x: 16, y: 13, variant: 2 });
prop({ kind: 'plant', x: 22, y: 13, variant: 1 });

// Coin Web
prop({ kind: 'radar', x: 25, y: 9, w: 2 });
prop({ kind: 'chair', x: 25, y: 10, ox: 8, block: false });
hardBlocks.add(key(26, 10));
prop({ kind: 'globe', x: 27, y: 11, w: 2 });
prop({ kind: 'antenna', x: 30, y: 9 });
prop({ kind: 'plant', x: 30, y: 13 });
spot({ id: 'web-console', zone: 'web', x: 25, y: 10, face: 'up', pose: 'sit', ox: 8 }, true);
spot({ id: 'web-globe-1', zone: 'web', x: 27, y: 12, face: 'up', pose: 'stand' });
spot({ id: 'web-globe-2', zone: 'web', x: 28, y: 12, face: 'up', pose: 'stand' });
spot({ id: 'web-globe-e', zone: 'web', x: 29, y: 11, face: 'left', pose: 'stand' });
spot({ id: 'web-globe-w', zone: 'web', x: 26, y: 11, face: 'right', pose: 'stand' });
spot({ id: 'web-antenna', zone: 'web', x: 30, y: 10, face: 'up', pose: 'stand' });

// Salle de réunion
prop({ kind: 'flipchart', x: 12, y: 15 });
for (const x of [14, 15, 16, 17]) prop({ kind: 'chairFront', x, y: 15, block: false });
prop({ kind: 'meetingTable', x: 14, y: 16, w: 4 });
for (const x of [14, 15, 16, 17]) prop({ kind: 'chair', x, y: 17, block: false });
prop({ kind: 'plant', x: 20, y: 15, variant: 2 });
prop({ kind: 'plant', x: 12, y: 18, variant: 1 });
for (const x of [14, 15, 16, 17]) {
  spot({ id: `meet-n-${x}`, zone: 'meeting', x, y: 15, face: 'down', pose: 'sit' }, true);
  spot({ id: `meet-s-${x}`, zone: 'meeting', x, y: 17, face: 'up', pose: 'sit' }, true);
}
spot({ id: 'meet-head-w', zone: 'meeting', x: 13, y: 16, face: 'right', pose: 'stand', tag: 'presenter' });
spot({ id: 'meet-head-e', zone: 'meeting', x: 18, y: 16, face: 'left', pose: 'stand' });

// Salon
prop({ kind: 'lamp', x: 1, y: 15 });
prop({ kind: 'couch', x: 2, y: 15, w: 3, block: false });
prop({ kind: 'coffeeTable', x: 2, y: 17, w: 3 });
prop({ kind: 'coffee', x: 6, y: 15, w: 2 });
prop({ kind: 'cooler', x: 9, y: 15 });
prop({ kind: 'basket', x: 5, y: 18, block: false });
seats.add(key(5, 18)); // panier du chat : seul le chat s'y installe
prop({ kind: 'beanbag', x: 7, y: 18, block: false });
prop({ kind: 'beanbag', x: 9, y: 18, block: false, variant: 1 });
prop({ kind: 'plant', x: 1, y: 18 });
prop({ kind: 'plant', x: 10, y: 15, variant: 2 });
for (const x of [2, 3, 4]) spot({ id: `couch-${x}`, zone: 'lounge', x, y: 15, face: 'down', pose: 'sit', tag: 'couch' }, true);
spot({ id: 'coffee-1', zone: 'lounge', x: 6, y: 16, face: 'up', pose: 'stand', tag: 'coffee' });
spot({ id: 'coffee-2', zone: 'lounge', x: 7, y: 16, face: 'up', pose: 'stand', tag: 'coffee' });
spot({ id: 'cooler', zone: 'lounge', x: 9, y: 16, face: 'up', pose: 'stand', tag: 'coffee' });
spot({ id: 'beanbag-1', zone: 'lounge', x: 7, y: 18, face: 'down', pose: 'sit', tag: 'beanbag' }, true);
spot({ id: 'beanbag-2', zone: 'lounge', x: 9, y: 18, face: 'down', pose: 'sit', tag: 'beanbag' }, true);
spot({ id: 'lounge-a', zone: 'lounge', x: 5, y: 16, face: 'left', pose: 'stand' });
spot({ id: 'lounge-b', zone: 'lounge', x: 8, y: 17, face: 'down', pose: 'stand' });
spot({ id: 'lounge-c', zone: 'lounge', x: 10, y: 17, face: 'left', pose: 'stand' });

// Arcade
prop({ kind: 'arcade', x: 24, y: 15, variant: 0 });
prop({ kind: 'arcade', x: 25, y: 15, variant: 1 });
prop({ kind: 'vending', x: 28, y: 15, w: 2 });
prop({ kind: 'plant', x: 30, y: 15 });
prop({ kind: 'babyfoot', x: 26, y: 17, w: 3 });
prop({ kind: 'plant', x: 30, y: 18, variant: 1 });
prop({ kind: 'beanbag', x: 24, y: 18, block: false, variant: 2 });
spot({ id: 'arcade-1', zone: 'arcade', x: 24, y: 16, face: 'up', pose: 'stand', tag: 'arcade' });
spot({ id: 'arcade-2', zone: 'arcade', x: 25, y: 16, face: 'up', pose: 'stand', tag: 'arcade' });
spot({ id: 'vending', zone: 'arcade', x: 28, y: 16, face: 'up', pose: 'stand', tag: 'coffee' });
spot({ id: 'babyfoot-l', zone: 'arcade', x: 25, y: 17, face: 'right', pose: 'stand', tag: 'babyfoot' });
spot({ id: 'babyfoot-r', zone: 'arcade', x: 29, y: 17, face: 'left', pose: 'stand', tag: 'babyfoot' });
spot({ id: 'beanbag-3', zone: 'arcade', x: 24, y: 18, face: 'down', pose: 'sit', tag: 'beanbag' }, true);
spot({ id: 'arcade-c', zone: 'arcade', x: 27, y: 16, face: 'down', pose: 'stand' });

// Entrée
prop({ kind: 'coatRack', x: 21, y: 18 });
spot({ id: 'door-1', zone: 'door', x: 22, y: 18, face: 'down', pose: 'stand' });
spot({ id: 'door-2', zone: 'door', x: 23, y: 18, face: 'down', pose: 'stand' });

export const PROPS: readonly PropDef[] = props;
export const SPOTS: readonly Spot[] = spots;

/** Murs et cloisons. */
function isSolidFloor(ch: string): boolean {
  return ch === '#' || ch === 'G' || ch === 'g';
}

/** Peut-on traverser cette tuile ? */
export function isTransit(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
  if (isSolidFloor(floorAt(x, y))) return false;
  const k = key(x, y);
  return !hardBlocks.has(k) && !seats.has(k);
}

/** Peut-on s'arrêter sur cette tuile (passage ou siège) ? */
export function isStandable(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
  if (isSolidFloor(floorAt(x, y))) return false;
  const k = key(x, y);
  return !hardBlocks.has(k);
}

export const DOOR = { x: 22, y: 18 };

/** Étiquettes peintes au sol / plaques murales. */
export const LABELS: Array<{ text: string; x: number; y: number; wall?: boolean }> = [
  { text: 'BUREAU DU CHEF', x: 4.5, y: 0.2, wall: true },
  { text: 'BIBLIOTHEQUE', x: 15.5, y: 0.2, wall: true },
  { text: 'SERVEURS', x: 27, y: 0.2, wall: true },
  { text: 'PLANNING', x: 19.5, y: 11.2 },
  { text: 'WEB', x: 27.5, y: 13.4 },
  { text: 'REUNION', x: 16, y: 18.55 },
  { text: 'SALON', x: 3.5, y: 18.55 },
  { text: 'ARCADE', x: 27.5, y: 18.55 },
];
