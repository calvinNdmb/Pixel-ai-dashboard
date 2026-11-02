import type { Activity } from '../../../shared/types';
import { drawText } from './font';
import { DESKS, PROPS, TILE, type PropDef } from './map';
import { C, seededRandom } from './palette';

/** Informations utiles aux éléments animés du décor. */
export interface DynEnv {
  t: number;
  /** Activité affichée par le propriétaire d'un bureau (undefined = libre). */
  deskActivity(desk: number): Activity | undefined;
  /** Nombre de personnages présents dans une zone. */
  zoneCount(zone: string): number;
  /** Statuts des missions en cours (pour les post-it du tableau). */
  notes: string[];
  /** Deux joueurs au babyfoot ? */
  babyfootActive: boolean;
  night: boolean;
}

export interface PropInstance {
  def: PropDef;
  sprite: HTMLCanvasElement;
  px: number;
  py: number;
  sortY: number;
  dynamic?: (ctx: CanvasRenderingContext2D, env: DynEnv) => void;
}

// --------------------------------------------------------------- utilitaires

interface Painter {
  c: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  r(x: number, y: number, w: number, h: number, color: string): void;
  p(x: number, y: number, color: string): void;
  box(x: number, y: number, w: number, h: number, fill: string, outline?: string): void;
}

function paint(w: number, h: number): Painter {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const r = (x: number, y: number, ww: number, hh: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(x, y, ww, hh);
  };
  return {
    c,
    g,
    r,
    p: (x, y, color) => r(x, y, 1, 1, color),
    box: (x, y, ww, hh, fill, outline = C.outline) => {
      r(x, y, ww, hh, outline);
      r(x + 1, y + 1, ww - 2, hh - 2, fill);
    },
  };
}

const BOOK_COLORS = ['#c0504d', '#4f81bd', '#9bbb59', '#f2c14e', '#8064a2', '#4bacc6', '#e07a3a', '#d77fa1', '#7a8b99'];
const MUGS = [C.red, C.blue, C.yellow, C.green, C.purple, C.teal, C.pink, C.orange];

// ------------------------------------------------------------------- bureau

function desk(def: PropDef): PropInstance {
  const v = def.variant ?? 0;
  const P = paint(32, 24);
  // plateau
  P.r(0, 9, 32, 14, C.outline);
  P.r(1, 10, 30, 7, C.deskTop);
  P.r(1, 10, 30, 1, C.deskTopHi);
  P.r(1, 17, 30, 1, C.deskDark);
  P.r(1, 18, 30, 4, C.deskFront);
  P.r(22, 19, 5, 1, C.deskTopHi);
  P.r(1, 22, 2, 2, C.deskDark);
  P.r(29, 22, 2, 2, C.deskDark);
  // écran
  P.r(8, 0, 16, 11, C.outline);
  P.r(9, 1, 14, 9, '#3b3b52');
  P.r(10, 2, 12, 7, C.screenOff);
  P.r(15, 11, 2, 2, '#3b3b52');
  P.r(13, 13, 6, 1, C.outline);
  // clavier + souris
  P.r(10, 14, 12, 3, '#8a8598');
  P.r(10, 14, 12, 2, '#dcd8e4');
  for (let x = 11; x < 21; x += 2) P.p(x, 14, '#b4afc2');
  P.r(24, 15, 2, 2, '#dcd8e4');
  // tasse et papiers
  const mug = MUGS[v % MUGS.length]!;
  P.r(3, 12, 3, 3, mug);
  P.p(6, 13, mug);
  P.p(4, 12, '#ffffff');
  if (v % 2 === 0) {
    P.r(26, 11, 4, 3, '#f4efe4');
    P.r(27, 10, 4, 3, '#fffaf0');
  } else {
    // petite plante
    P.r(26, 6, 4, 4, C.leaf);
    P.p(27, 5, C.leafHi);
    P.p(26, 7, C.leafDark);
    P.r(26, 10, 4, 3, C.pot);
  }
  const px = def.x * TILE;
  const py = def.y * TILE - 8;
  const deskIndex = def.desk ?? 0;
  return {
    def,
    sprite: P.c,
    px,
    py,
    sortY: def.y * TILE + 16,
    dynamic: (ctx, env) => drawScreen(ctx, px + 10, py + 2, env.deskActivity(deskIndex), env.t, deskIndex),
  };
}

const CODE_COLORS = ['#8be08b', '#f0d060', '#e88aa0', '#7ac8f0', '#c9b6ff'];

/** Écran 12×7 d'un poste, qui reflète l'activité de son occupant. */
function drawScreen(ctx: CanvasRenderingContext2D, x: number, y: number, activity: Activity | undefined, t: number, seed: number) {
  if (!activity || activity === 'leaving') {
    // veille : petit voyant
    ctx.fillStyle = '#2a2d44';
    ctx.fillRect(x + 10, y + 5, 1, 1);
    return;
  }
  const blink = Math.floor(t * 2) % 2 === 0;
  switch (activity) {
    case 'waiting': {
      ctx.fillStyle = blink ? '#5c4a12' : '#3a300c';
      ctx.fillRect(x, y, 12, 7);
      ctx.fillStyle = C.yellow;
      ctx.fillRect(x + 5, y + 1, 2, 3);
      ctx.fillRect(x + 5, y + 5, 2, 1);
      return;
    }
    case 'error': {
      ctx.fillStyle = blink ? '#6e1f22' : '#4a1416';
      ctx.fillRect(x, y, 12, 7);
      ctx.fillStyle = '#ff8a80';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(x + 4 + i, y + 2 + i, 1, 1);
        ctx.fillRect(x + 7 - i, y + 2 + i, 1, 1);
      }
      return;
    }
    case 'done': {
      ctx.fillStyle = '#163a22';
      ctx.fillRect(x, y, 12, 7);
      ctx.fillStyle = '#7fe08a';
      [[3, 3], [4, 4], [5, 5], [6, 4], [7, 3], [8, 2]].forEach(([dx, dy]) => ctx.fillRect(x + dx!, y + dy!, 1, 1));
      return;
    }
    default:
      break;
  }
  ctx.fillStyle = C.screenOn;
  ctx.fillRect(x, y, 12, 7);
  // lignes de code qui défilent (vite quand l'agent écrit)
  const speed = activity === 'writing' ? 6 : activity === 'thinking' ? 1.2 : 0.6;
  const scroll = Math.floor(t * speed);
  const rnd = seededRandom(seed * 977 + 13);
  const lines: Array<[number, number, string]> = [];
  for (let i = 0; i < 40; i++) lines.push([Math.floor(rnd() * 3), 2 + Math.floor(rnd() * 8), CODE_COLORS[Math.floor(rnd() * CODE_COLORS.length)]!]);
  for (let row = 0; row < 6; row++) {
    const [indent, len, color] = lines[(row + scroll) % lines.length]!;
    ctx.fillStyle = color;
    ctx.fillRect(x + 1 + indent, y + 1 + row, Math.min(len, 10 - indent), 1);
  }
  if (activity === 'thinking' && blink) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 10, y + 5, 1, 1);
  }
}

// ------------------------------------------------------------------- chaises

function chairBack(def: PropDef): PropInstance {
  const P = paint(14, 12);
  P.r(2, 0, 10, 1, C.outline);
  P.r(1, 1, 1, 5, C.outline);
  P.r(12, 1, 1, 5, C.outline);
  P.r(2, 1, 10, 5, C.chairA);
  P.r(2, 1, 10, 1, C.chairHi);
  P.r(2, 5, 10, 1, C.chairB);
  P.r(0, 6, 14, 3, C.outline);
  P.r(1, 6, 12, 2, C.chairB);
  P.r(6, 9, 2, 2, C.metalDark);
  P.r(2, 11, 10, 1, C.outline);
  P.p(2, 11, C.metal);
  P.p(11, 11, C.metal);
  const ox = def.ox ?? 0;
  const px = def.x * TILE + ox + 1;
  const py = def.y * TILE + 10;
  return { def, sprite: P.c, px, py, sortY: def.y * TILE + 15.5 };
}

function chairFront(def: PropDef): PropInstance {
  const P = paint(14, 16);
  P.box(2, 0, 10, 9, C.chairA);
  P.r(3, 1, 8, 1, C.chairHi);
  P.r(3, 7, 8, 1, C.chairB);
  P.box(0, 9, 14, 4, C.chairB);
  P.r(1, 10, 12, 1, C.chairHi);
  P.r(2, 13, 2, 3, C.metalDark);
  P.r(10, 13, 2, 3, C.metalDark);
  return { def, sprite: P.c, px: def.x * TILE + 1, py: def.y * TILE - 2, sortY: def.y * TILE + 14 };
}

// ------------------------------------------------------------ bureau du Chef

function chefDesk(def: PropDef): PropInstance {
  const P = paint(48, 30);
  // plateau (profond)
  P.r(0, 2, 48, 26, C.outline);
  P.r(1, 3, 46, 11, '#a3653c');
  P.r(1, 3, 46, 1, '#c4834f');
  P.r(1, 14, 46, 1, '#5e3520');
  // façade à panneaux
  P.r(1, 15, 46, 11, '#7d4728');
  P.r(3, 17, 12, 7, '#6a3b21');
  P.r(33, 17, 12, 7, '#6a3b21');
  P.r(4, 18, 10, 5, '#86502e');
  P.r(34, 18, 10, 5, '#86502e');
  // plaque dorée
  P.r(16, 17, 16, 7, C.goldDark);
  P.r(17, 18, 14, 5, C.gold);
  drawText(P.g, 'CHEF', 18, 18, '#5a3b10');
  // pieds
  P.r(1, 28, 3, 2, C.goldDark);
  P.r(44, 28, 3, 2, C.goldDark);
  // objets : papiers, téléphone, portable vu de dos, mug
  P.r(3, 5, 9, 6, '#e9e2d2');
  P.r(4, 4, 9, 6, '#fffaf0');
  for (let y = 6; y < 9; y++) P.r(5, y, 6, 1, '#c9c2b2');
  P.r(13, 6, 4, 3, C.outline);
  P.r(14, 7, 2, 1, C.red);
  P.r(32, 0, 12, 9, C.outline);
  P.r(33, 1, 10, 7, '#c9cdd6');
  P.r(37, 3, 2, 2, '#fbf7ef');
  P.r(31, 9, 14, 2, '#9aa0aa');
  P.r(26, 8, 3, 3, C.red);
  P.p(29, 9, C.red);
  return { def, sprite: P.c, px: def.x * TILE, py: def.y * TILE - 6, sortY: def.y * TILE + 16 };
}

function chefChair(def: PropDef): PropInstance {
  const P = paint(20, 22);
  P.r(3, 0, 14, 1, C.outline);
  P.r(2, 1, 16, 15, C.outline);
  P.r(3, 1, 14, 14, '#8e2f3a');
  P.r(3, 1, 14, 2, '#b0485a');
  for (const [x, y] of [[6, 5], [10, 5], [14, 5], [8, 9], [12, 9]]) P.p(x!, y!, '#5e1c27');
  P.r(0, 9, 4, 8, C.outline);
  P.r(16, 9, 4, 8, C.outline);
  P.r(1, 10, 2, 6, '#7a2632');
  P.r(17, 10, 2, 6, '#7a2632');
  P.r(4, 16, 12, 3, '#5e1c27');
  P.r(9, 19, 2, 3, C.metalDark);
  return { def, sprite: P.c, px: def.x * TILE - 2, py: def.y * TILE - 10, sortY: def.y * TILE + 10 };
}

// ------------------------------------------------------------- bibliothèque

function bookshelf(def: PropDef): PropInstance {
  const P = paint(32, 32);
  const rnd = seededRandom((def.variant ?? 0) * 131 + 7);
  P.r(0, 0, 32, 32, C.outline);
  P.r(1, 1, 30, 30, '#5a3420');
  P.r(1, 1, 30, 2, '#8a5530');
  for (const shelfY of [11, 21, 29]) {
    P.r(1, shelfY, 30, 2, '#8a5530');
    P.r(1, shelfY, 30, 1, '#a66a3c');
  }
  for (const [top, bottom] of [[3, 11], [13, 21], [23, 29]] as const) {
    let x = 2;
    while (x < 30) {
      const roll = rnd();
      if (roll < 0.08 && x < 26) {
        // petit pot de plante ou boîte
        P.r(x, bottom - 4, 4, 4, rnd() < 0.5 ? C.pot : '#c9b48a');
        if (rnd() < 0.6) P.r(x, bottom - 7, 4, 3, C.leaf);
        x += 5;
        continue;
      }
      const w = rnd() < 0.3 ? 3 : 2;
      const h = Math.min(bottom - top, 5 + Math.floor(rnd() * 4));
      const color = BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)]!;
      if (x + w > 30) break;
      P.r(x, bottom - h, w, h, color);
      P.r(x, bottom - h, 1, h, 'rgba(255,255,255,0.18)');
      P.r(x, bottom - h + 1, w, 1, 'rgba(0,0,0,0.18)');
      x += w + (rnd() < 0.15 ? 1 : 0);
    }
  }
  return { def, sprite: P.c, px: def.x * TILE, py: (def.y - 1) * TILE, sortY: def.y * TILE + 16 };
}

function readingTable(def: PropDef): PropInstance {
  const P = paint(64, 18);
  P.r(0, 0, 64, 14, C.outline);
  P.r(1, 1, 62, 8, '#9b6a44');
  P.r(1, 1, 62, 1, '#b8845a');
  P.r(1, 9, 62, 4, '#7b4f30');
  P.r(2, 13, 2, 5, '#5a3824');
  P.r(60, 13, 2, 5, '#5a3824');
  // livres ouverts + lampe de banquier
  P.r(8, 3, 10, 4, '#fbf7ef');
  P.r(13, 3, 1, 4, '#c9c2b2');
  P.r(42, 4, 9, 4, '#fbf7ef');
  P.r(46, 4, 1, 4, '#c9c2b2');
  P.r(28, 0, 8, 3, '#2f7a4a');
  P.r(28, 0, 8, 1, '#4fa36b');
  P.r(31, 3, 2, 3, C.gold);
  return { def, sprite: P.c, px: def.x * TILE, py: def.y * TILE + 2, sortY: def.y * TILE + 15 };
}

function stool(def: PropDef): PropInstance {
  const P = paint(12, 9);
  P.box(1, 0, 10, 4, '#a05a3a');
  P.r(2, 1, 8, 1, '#c27a52');
  P.r(3, 4, 1, 5, '#5a3824');
  P.r(8, 4, 1, 5, '#5a3824');
  return { def, sprite: P.c, px: def.x * TILE + 2, py: def.y * TILE + 8, sortY: def.y * TILE + 1 };
}

// ---------------------------------------------------------- salle serveurs

function rack(def: PropDef): PropInstance {
  const P = paint(16, 32);
  P.r(0, 0, 16, 32, C.outline);
  P.r(1, 1, 14, 30, '#2b2f3a');
  P.r(1, 1, 14, 1, '#4a5060');
  for (let y = 3; y < 6; y++) P.r(3, y, 10, 1, y % 2 ? '#1a1d24' : '#3a4050');
  for (let y = 8; y < 28; y += 3) {
    P.r(2, y, 12, 2, '#363b48');
    P.r(2, y + 2, 12, 1, '#1e2129');
    P.r(9, y, 4, 1, '#4a5060');
  }
  P.r(1, 29, 14, 2, '#1e2129');
  const px = def.x * TILE;
  const py = (def.y - 1) * TILE;
  const seed = def.variant ?? 0;
  return {
    def,
    sprite: P.c,
    px,
    py,
    sortY: def.y * TILE + 16,
    dynamic: (ctx, env) => {
      const busy = env.zoneCount('server') > 0;
      const speed = busy ? 7 : 2;
      for (let i = 0; i < 7; i++) {
        const y = py + 8 + i * 3;
        const phase = Math.sin(env.t * speed + seed * 1.7 + i * 2.3);
        ctx.fillStyle = phase > 0.2 ? '#4cff8a' : '#1d5c35';
        ctx.fillRect(px + 3, y, 1, 1);
        const p2 = Math.sin(env.t * speed * 1.3 + seed + i * 4.1);
        ctx.fillStyle = p2 > 0.6 ? (busy ? '#ffb84c' : '#5ac8ff') : '#23303f';
        ctx.fillRect(px + 5, y, 1, 1);
      }
    },
  };
}

function extinguisher(def: PropDef): PropInstance {
  const P = paint(8, 14);
  P.box(1, 3, 6, 11, '#d6453f');
  P.r(2, 4, 1, 8, '#ff7a6e');
  P.r(3, 0, 3, 3, C.outline);
  P.p(6, 1, C.outline);
  return { def, sprite: P.c, px: def.x * TILE + 4, py: def.y * TILE + 2, sortY: def.y * TILE + 15 };
}

// ------------------------------------------------------------------- plantes

function plant(def: PropDef): PropInstance {
  const v = def.variant ?? 0;
  const P = paint(16, 24);
  // pot
  P.r(3, 15, 10, 9, C.outline);
  P.r(4, 16, 8, 7, C.pot);
  P.r(3, 15, 10, 2, C.potDark);
  P.r(4, 15, 8, 1, '#d98a62');
  P.r(5, 18, 1, 4, '#d98a62');
  if (v === 1) {
    // sansevière
    for (const [x, h, c] of [[5, 12, C.leafDark], [7, 15, C.leaf], [9, 13, C.leafDark], [10, 10, C.leaf], [6, 9, C.leafHi]] as const) {
      P.r(x, 15 - h, 2, h, C.outline);
      P.r(x, 16 - h, 1, h - 1, c);
      P.r(x + 1, 16 - h, 1, h - 1, '#9fd27f');
    }
  } else if (v === 2) {
    // petit arbre
    P.r(7, 8, 2, 8, '#6b4226');
    P.r(2, 0, 12, 10, C.outline);
    P.r(3, 1, 10, 8, C.leaf);
    P.r(4, 1, 5, 3, C.leafHi);
    P.r(9, 6, 3, 2, C.leafDark);
    P.r(1, 3, 2, 5, C.outline);
    P.r(13, 3, 2, 5, C.outline);
  } else {
    // plante touffue
    P.r(2, 4, 12, 12, C.outline);
    P.r(3, 5, 10, 10, C.leaf);
    P.r(1, 7, 3, 6, C.outline);
    P.r(12, 7, 3, 6, C.outline);
    P.r(2, 8, 2, 4, C.leafDark);
    P.r(12, 8, 2, 4, C.leafDark);
    P.r(5, 2, 6, 3, C.outline);
    P.r(6, 3, 4, 3, C.leafHi);
    P.r(4, 6, 3, 3, C.leafHi);
    P.r(9, 10, 3, 3, C.leafDark);
  }
  return { def, sprite: P.c, px: def.x * TILE, py: def.y * TILE - 8, sortY: def.y * TILE + 15 };
}

// --------------------------------------------------------------------- salon

function couch(def: PropDef): PropInstance {
  const P = paint(48, 24);
  const A = '#4f8fb0';
  const B = '#3d7392';
  const H = '#79b3d0';
  P.r(2, 0, 44, 10, C.outline);
  P.r(3, 1, 42, 8, A);
  P.r(3, 1, 42, 1, H);
  P.r(16, 2, 1, 6, B);
  P.r(31, 2, 1, 6, B);
  P.r(0, 6, 48, 16, C.outline);
  P.r(5, 9, 38, 7, A);
  P.r(5, 9, 38, 1, H);
  P.r(17, 9, 1, 7, B);
  P.r(31, 9, 1, 7, B);
  P.r(1, 7, 4, 14, B);
  P.r(43, 7, 4, 14, B);
  P.r(1, 7, 4, 1, H);
  P.r(43, 7, 4, 1, H);
  P.r(5, 16, 38, 5, B);
  P.r(2, 22, 2, 2, '#3a2a20');
  P.r(44, 22, 2, 2, '#3a2a20');
  return { def, sprite: P.c, px: def.x * TILE, py: def.y * TILE - 8, sortY: def.y * TILE + 8 };
}

function coffeeTable(def: PropDef): PropInstance {
  const P = paint(48, 12);
  P.r(2, 0, 44, 9, C.outline);
  P.r(3, 1, 42, 5, '#a0663c');
  P.r(3, 1, 42, 1, '#c0844f');
  P.r(3, 6, 42, 2, '#7a4a2b');
  P.r(4, 9, 2, 3, '#5a3824');
  P.r(42, 9, 2, 3, '#5a3824');
  P.r(10, 2, 8, 3, '#e9e2d2');
  P.r(11, 2, 6, 1, C.blue);
  P.r(30, 2, 3, 3, '#fbf7ef');
  P.p(33, 3, '#fbf7ef');
  return { def, sprite: P.c, px: def.x * TILE, py: def.y * TILE + 2, sortY: def.y * TILE + 14 };
}

function coffeeCounter(def: PropDef): PropInstance {
  const P = paint(32, 26);
  // comptoir
  P.r(0, 9, 32, 17, C.outline);
  P.r(1, 10, 30, 3, '#ebe5d9');
  P.r(1, 10, 30, 1, '#ffffff');
  P.r(1, 13, 30, 11, '#9a6a46');
  P.r(15, 14, 1, 10, '#7a4f32');
  P.r(12, 18, 2, 1, '#c79b6a');
  P.r(18, 18, 2, 1, '#c79b6a');
  // machine à café
  P.r(3, 0, 12, 12, C.outline);
  P.r(4, 1, 10, 10, '#c8c8d0');
  P.r(4, 1, 10, 1, '#ececf2');
  P.r(5, 3, 8, 3, '#2b2b3a');
  P.p(11, 4, C.red);
  P.p(6, 4, '#4cff8a');
  P.r(8, 7, 2, 2, '#4a4a5a');
  P.r(7, 9, 4, 2, '#fbf7ef');
  // tasses et sucre
  P.r(19, 6, 3, 4, '#fbf7ef');
  P.r(23, 6, 3, 4, C.red);
  P.r(27, 5, 3, 5, '#d8c9a8');
  P.r(27, 5, 3, 1, '#b8a988');
  const px = def.x * TILE;
  const py = def.y * TILE - 10;
  return {
    def,
    sprite: P.c,
    px,
    py,
    sortY: def.y * TILE + 16,
    dynamic: (ctx, env) => {
      // vapeur
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let i = 0; i < 3; i++) {
        const k = (env.t * 0.8 + i / 3) % 1;
        const y = py - 1 - k * 8;
        const x = px + 8 + Math.round(Math.sin(k * 6 + i) * 1.5);
        if (k < 0.85) ctx.fillRect(x, Math.round(y), 1, 1);
      }
    },
  };
}

function cooler(def: PropDef): PropInstance {
  const P = paint(12, 26);
  P.r(2, 0, 8, 10, C.outline);
  P.r(3, 1, 6, 8, '#9fd8f0');
  P.r(3, 1, 2, 7, '#d7f1fb');
  P.r(4, 9, 4, 2, C.outline);
  P.r(0, 10, 12, 16, C.outline);
  P.r(1, 11, 10, 14, '#e6e6ee');
  P.r(1, 11, 10, 1, '#ffffff');
  P.p(3, 14, C.blue);
  P.p(8, 14, C.red);
  P.r(3, 16, 6, 1, '#b9b9c6');
  P.r(1, 23, 10, 2, '#b9b9c6');
  return { def, sprite: P.c, px: def.x * TILE + 2, py: def.y * TILE - 10, sortY: def.y * TILE + 16 };
}

function beanbag(def: PropDef): PropInstance {
  const colors = [
    ['#e8833a', '#c26a2a', '#f7a85f'],
    ['#8e5fd0', '#6f45ad', '#b08ae6'],
    ['#2f9e9a', '#237a77', '#5cc4c0'],
  ][(def.variant ?? 0) % 3]!;
  const P = paint(16, 12);
  P.r(2, 0, 12, 12, C.outline);
  P.r(0, 3, 16, 8, C.outline);
  P.r(3, 1, 10, 10, colors[0]!);
  P.r(1, 4, 14, 6, colors[0]!);
  P.r(4, 2, 5, 2, colors[2]!);
  P.r(2, 8, 12, 2, colors[1]!);
  return { def, sprite: P.c, px: def.x * TILE, py: def.y * TILE + 5, sortY: def.y * TILE + 1 };
}

function basket(def: PropDef): PropInstance {
  const P = paint(16, 10);
  P.r(0, 2, 16, 8, C.outline);
  P.r(1, 3, 14, 6, '#c8925a');
  for (let x = 2; x < 15; x += 3) P.r(x, 3, 1, 6, '#a8723e');
  P.r(3, 0, 10, 4, C.outline);
  P.r(4, 1, 8, 3, '#e86f6f');
  P.r(4, 1, 8, 1, '#ff9a9a');
  return { def, sprite: P.c, px: def.x * TILE, py: def.y * TILE + 6, sortY: def.y * TILE + 2 };
}

function lamp(def: PropDef): PropInstance {
  const P = paint(16, 30);
  P.r(3, 0, 10, 8, C.outline);
  P.r(4, 1, 8, 6, '#f2d48a');
  P.r(4, 1, 8, 1, '#fff1c2');
  P.r(7, 8, 2, 18, '#4a4050');
  P.r(4, 26, 8, 3, C.outline);
  P.r(5, 26, 6, 2, '#6a6070');
  const px = def.x * TILE;
  const py = def.y * TILE - 14;
  return {
    def,
    sprite: P.c,
    px,
    py,
    sortY: def.y * TILE + 15,
    dynamic: (ctx, env) => {
      if (!env.night) return;
      ctx.fillStyle = 'rgba(255, 220, 130, 0.16)';
      ctx.beginPath();
      ctx.arc(px + 8, py + 10, 18, 0, Math.PI * 2);
      ctx.fill();
    },
  };
}

function cabinet(def: PropDef): PropInstance {
  const P = paint(16, 24);
  P.box(1, 0, 14, 24, '#8b93a3');
  P.r(2, 1, 12, 1, '#b3bac7');
  for (const y of [3, 10, 17]) {
    P.r(2, y, 12, 6, '#7a8292');
    P.r(6, y + 2, 4, 1, '#d2d7e0');
  }
  return { def, sprite: P.c, px: def.x * TILE, py: def.y * TILE - 8, sortY: def.y * TILE + 16 };
}

function coatRack(def: PropDef): PropInstance {
  const P = paint(16, 30);
  P.r(7, 2, 2, 25, '#5a3824');
  P.r(4, 1, 8, 2, '#5a3824');
  P.r(4, 27, 8, 2, '#5a3824');
  P.r(2, 3, 5, 13, C.outline);
  P.r(3, 4, 3, 11, '#c0504d');
  P.r(10, 3, 3, 9, C.outline);
  P.r(11, 4, 1, 7, C.yellow);
  return { def, sprite: P.c, px: def.x * TILE, py: def.y * TILE - 14, sortY: def.y * TILE + 15 };
}

// -------------------------------------------------------------------- arcade

function arcade(def: PropDef): PropInstance {
  const v = def.variant ?? 0;
  const body = v === 0 ? '#c2366f' : '#3657c2';
  const bodyHi = v === 0 ? '#e85d9a' : '#5a7fe8';
  const P = paint(16, 30);
  P.r(0, 0, 16, 30, C.outline);
  P.r(1, 1, 14, 28, body);
  P.r(1, 1, 14, 4, bodyHi);
  P.r(2, 2, 12, 2, '#fff1a8');
  P.r(2, 6, 12, 9, '#141220');
  P.r(1, 15, 14, 4, '#2b2b3a');
  P.r(4, 15, 1, 2, '#9aa0aa');
  P.p(4, 15, C.red);
  P.p(9, 16, C.yellow);
  P.p(11, 16, C.green);
  P.r(5, 21, 6, 5, '#2b2b3a');
  P.r(7, 22, 2, 2, C.gold);
  const px = def.x * TILE;
  const py = def.y * TILE - 14;
  return {
    def,
    sprite: P.c,
    px,
    py,
    sortY: def.y * TILE + 16,
    dynamic: (ctx, env) => {
      const sx = px + 3;
      const sy = py + 7;
      const t = env.t + v * 2.1;
      ctx.fillStyle = v === 0 ? '#2a1838' : '#10233a';
      ctx.fillRect(sx, sy, 10, 7);
      // petit « jeu » : un vaisseau et des envahisseurs
      ctx.fillStyle = '#7fe0b0';
      const shipX = sx + 4 + Math.round(Math.sin(t * 1.7) * 3.5);
      ctx.fillRect(shipX, sy + 6, 3, 1);
      ctx.fillRect(shipX + 1, sy + 5, 1, 1);
      ctx.fillStyle = v === 0 ? '#ff8ad0' : '#ffd166';
      const off = Math.floor(t * 2) % 2;
      for (let i = 0; i < 3; i++) ctx.fillRect(sx + 1 + i * 3 + off, sy + 1, 2, 1);
      if (Math.floor(t * 4) % 3 === 0) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(shipX + 1, sy + 2 + (Math.floor(t * 8) % 3), 1, 1);
      }
    },
  };
}

function vending(def: PropDef): PropInstance {
  const P = paint(28, 30);
  P.r(0, 0, 28, 30, C.outline);
  P.r(1, 1, 26, 28, '#c43f3f');
  P.r(1, 1, 26, 2, '#e46060');
  P.r(3, 4, 16, 19, '#1e2a3a');
  const snack = [C.yellow, C.green, '#ff8ad0', C.orange, C.sky, '#fbf7ef'];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      P.r(4 + col * 3, 5 + row * 5, 2, 3, snack[(row * 2 + col) % snack.length]!);
    }
    P.r(4, 8 + row * 5, 14, 1, '#4a5a6a');
  }
  P.r(3, 4, 2, 19, 'rgba(255,255,255,0.12)');
  P.r(21, 5, 4, 6, '#2b2b3a');
  for (let i = 0; i < 3; i++) P.r(22, 6 + i * 2, 2, 1, '#9aa0aa');
  P.r(21, 13, 4, 2, '#1e1e28');
  P.r(4, 25, 14, 3, '#1e1e28');
  return { def, sprite: P.c, px: def.x * TILE + 2, py: def.y * TILE - 14, sortY: def.y * TILE + 16 };
}

function babyfoot(def: PropDef): PropInstance {
  const P = paint(48, 22);
  P.r(0, 0, 48, 16, C.outline);
  P.r(1, 1, 46, 14, '#8a5a36');
  P.r(1, 1, 46, 1, '#a8744a');
  P.r(4, 3, 40, 10, '#3f9b4f');
  P.r(23, 3, 1, 10, '#c8f0c8');
  P.r(4, 6, 1, 4, '#c8f0c8');
  P.r(43, 6, 1, 4, '#c8f0c8');
  P.r(2, 6, 2, 4, '#1e1e28');
  P.r(44, 6, 2, 4, '#1e1e28');
  P.r(2, 16, 3, 6, '#5a3824');
  P.r(43, 16, 3, 6, '#5a3824');
  const rods: Array<[number, string]> = [
    [9, C.red],
    [15, C.blue],
    [21, C.red],
    [27, C.blue],
    [33, C.red],
    [39, C.blue],
  ];
  const px = def.x * TILE;
  const py = def.y * TILE - 5;
  return {
    def,
    sprite: P.c,
    px,
    py,
    sortY: def.y * TILE + 12,
    dynamic: (ctx, env) => {
      const active = env.babyfootActive;
      const t = env.t;
      for (const [i, [x, color]] of rods.entries()) {
        ctx.fillStyle = '#cfd4dc';
        ctx.fillRect(px + x, py, 1, 16);
        const shift = active ? Math.round(Math.sin(t * 5 + i) * 2) : 0;
        ctx.fillStyle = color;
        ctx.fillRect(px + x - 1, py + 5 + shift, 3, 2);
        ctx.fillRect(px + x - 1, py + 9 + shift, 3, 2);
      }
      if (active) {
        const bx = px + 24 + Math.round(Math.sin(t * 2.3) * 17);
        const by = py + 7 + Math.round(Math.sin(t * 3.7) * 3);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(bx, by, 2, 2);
      }
    },
  };
}

// ------------------------------------------------------- planning & réunion

const NOTE_COLORS: Record<string, string> = {
  working: '#ffe27a',
  waiting: '#ffb04a',
  idle: '#9be59b',
  done: '#9be59b',
  error: '#ff8a80',
  starting: '#bfe3ff',
};

function whiteboard(def: PropDef): PropInstance {
  const P = paint(48, 30);
  P.r(0, 0, 48, 21, C.outline);
  P.r(1, 1, 46, 19, '#9aa0a6');
  P.r(2, 2, 44, 17, '#f7f7f2');
  // gribouillis
  P.r(5, 4, 10, 1, '#4a74d9');
  P.r(5, 6, 7, 1, '#4a74d9');
  P.r(30, 14, 12, 1, '#e05a54');
  P.r(33, 12, 1, 3, '#e05a54');
  P.r(38, 11, 1, 4, '#e05a54');
  P.r(2, 20, 44, 2, '#7a8088');
  P.r(10, 20, 3, 1, C.red);
  P.r(15, 20, 3, 1, C.blue);
  P.r(5, 22, 2, 7, '#7a8088');
  P.r(41, 22, 2, 7, '#7a8088');
  P.r(3, 28, 6, 2, C.outline);
  P.r(39, 28, 6, 2, C.outline);
  const px = def.x * TILE;
  const py = def.y * TILE - 14;
  return {
    def,
    sprite: P.c,
    px,
    py,
    sortY: def.y * TILE + 16,
    dynamic: (ctx, env) => {
      env.notes.slice(0, 12).forEach((status, i) => {
        const col = i % 6;
        const row = Math.floor(i / 6);
        const x = px + 5 + col * 7;
        const y = py + 8 + row * 5;
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(x + 1, y + 1, 5, 4);
        ctx.fillStyle = NOTE_COLORS[status] ?? '#ffe27a';
        ctx.fillRect(x, y, 5, 4);
      });
    },
  };
}

function flipchart(def: PropDef): PropInstance {
  const P = paint(16, 28);
  P.r(2, 0, 12, 16, C.outline);
  P.r(3, 1, 10, 14, '#fbf7ef');
  P.r(4, 11, 2, 3, C.blue);
  P.r(7, 8, 2, 6, C.green);
  P.r(10, 5, 2, 9, C.red);
  P.r(3, 2, 10, 1, '#d9d0c2');
  P.r(4, 16, 1, 12, '#5a3824');
  P.r(11, 16, 1, 12, '#5a3824');
  P.r(7, 16, 2, 10, '#5a3824');
  return { def, sprite: P.c, px: def.x * TILE, py: def.y * TILE - 12, sortY: def.y * TILE + 16 };
}

function meetingTable(def: PropDef): PropInstance {
  const P = paint(64, 20);
  P.r(1, 0, 62, 15, C.outline);
  P.r(0, 2, 64, 11, C.outline);
  P.r(2, 1, 60, 9, '#a8714a');
  P.r(1, 3, 62, 7, '#a8714a');
  P.r(3, 1, 58, 1, '#c78c5f');
  P.r(1, 10, 62, 4, '#7d4e2f');
  P.r(4, 15, 2, 5, '#5a3824');
  P.r(58, 15, 2, 5, '#5a3824');
  // objets
  P.r(29, 4, 6, 3, '#2b2b3a');
  P.p(31, 5, C.green);
  P.r(8, 3, 6, 4, '#fbf7ef');
  P.r(48, 4, 7, 3, '#c9cdd6');
  P.r(48, 3, 7, 1, '#9aa0aa');
  for (const x of [20, 40]) {
    P.r(x, 4, 2, 3, '#bfe3ff');
    P.p(x, 4, '#ffffff');
  }
  return { def, sprite: P.c, px: def.x * TILE, py: def.y * TILE - 2, sortY: def.y * TILE + 15 };
}

// ------------------------------------------------------------------ coin Web

function globe(def: PropDef): PropInstance {
  const P = paint(32, 32);
  P.r(9, 27, 14, 4, C.outline);
  P.r(10, 27, 12, 3, '#7a4a2b');
  P.r(15, 23, 2, 4, '#b08a3e');
  // méridien
  P.g.strokeStyle = '#c9a24a';
  P.g.lineWidth = 1;
  P.g.beginPath();
  P.g.arc(16, 13, 12.5, Math.PI * 0.62, Math.PI * 2.38);
  P.g.stroke();
  const px = def.x * TILE;
  const py = (def.y - 1) * TILE;
  // continents « déroulés » sur 40 colonnes, projetés sur la sphère
  const map = [
    '....###...........##.........####.......',
    '...#####.........####.......######......',
    '..######.......#####.......########.....',
    '...####........####.........#####.......',
    '....##..........###..........###........',
    '.....#.........###.............##.......',
    '..............###...............#.......',
    '.............##.....................##..',
    '....................................###.',
    '...................................##...',
  ];
  return {
    def,
    sprite: P.c,
    px,
    py,
    sortY: def.y * TILE + 16,
    dynamic: (ctx, env) => {
      const cx = px + 16;
      const cy = py + 13;
      const R = 10;
      const spin = env.t * (env.zoneCount('web') > 0 ? 6 : 2);
      for (let y = -R; y <= R; y++) {
        const half = Math.floor(Math.sqrt(R * R - y * y));
        for (let x = -half; x <= half; x++) {
          const edge = x === -half || x === half || y === -R || y === R;
          let color = '#3d7fd0';
          const lat = Math.floor(((y + R) / (2 * R + 1)) * map.length);
          const lon = Math.floor((Math.asin(x / (half || 1)) / Math.PI + 0.5) * 20 + spin) % 40;
          if (map[lat]?.[(lon + 40) % 40] === '#') color = '#5fb85f';
          if (x < -half / 2 && y < -R / 3) color = color === '#5fb85f' ? '#8ee08e' : '#6fa8ec';
          ctx.fillStyle = edge ? C.outline : color;
          ctx.fillRect(cx + x, cy + y, 1, 1);
        }
      }
    },
  };
}

function radar(def: PropDef): PropInstance {
  const P = paint(32, 24);
  P.r(0, 9, 32, 14, C.outline);
  P.r(1, 10, 30, 7, '#4a5468');
  P.r(1, 10, 30, 1, '#6a768c');
  P.r(1, 17, 30, 5, '#353d4e');
  P.r(4, 19, 3, 1, C.red);
  P.r(9, 19, 3, 1, C.yellow);
  P.r(24, 18, 4, 2, '#1e2430');
  // écran rond
  P.r(8, 0, 16, 13, C.outline);
  P.r(7, 2, 18, 9, C.outline);
  P.r(9, 1, 14, 11, '#0f2a1e');
  P.r(8, 3, 16, 7, '#0f2a1e');
  const px = def.x * TILE;
  const py = def.y * TILE - 8;
  return {
    def,
    sprite: P.c,
    px,
    py,
    sortY: def.y * TILE + 16,
    dynamic: (ctx, env) => {
      const cx = px + 16;
      const cy = py + 6;
      const a = env.t * 2.4;
      ctx.fillStyle = '#2fbf6a';
      for (let r = 1; r <= 5; r++) {
        ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.9), 1, 1);
      }
      ctx.fillStyle = '#1d6b40';
      ctx.fillRect(cx - 6, cy, 13, 1);
      ctx.fillRect(cx, cy - 5, 1, 11);
      if (Math.sin(env.t * 1.3) > 0.3) {
        ctx.fillStyle = '#9dffb8';
        ctx.fillRect(cx + 3, cy - 2, 1, 1);
      }
    },
  };
}

function antenna(def: PropDef): PropInstance {
  const P = paint(16, 40);
  P.r(7, 14, 2, 22, '#7a828c');
  P.r(4, 35, 8, 3, C.outline);
  P.r(5, 35, 6, 2, '#5a626c');
  // parabole
  P.r(1, 4, 14, 10, C.outline);
  P.r(2, 5, 12, 8, '#e8ecf2');
  P.r(2, 5, 12, 2, '#ffffff');
  P.r(3, 11, 10, 2, '#c4cad4');
  P.r(7, 0, 2, 6, '#7a828c');
  const px = def.x * TILE;
  const py = def.y * TILE - 24;
  return {
    def,
    sprite: P.c,
    px,
    py,
    sortY: def.y * TILE + 16,
    dynamic: (ctx, env) => {
      ctx.fillStyle = Math.floor(env.t * 1.5) % 2 === 0 ? '#ff4a4a' : '#5a1a1a';
      ctx.fillRect(px + 7, py - 1, 2, 2);
      if (env.zoneCount('web') > 0) {
        // ondes radio
        const k = (env.t * 1.2) % 1;
        ctx.fillStyle = `rgba(160, 230, 255, ${0.8 - k * 0.8})`;
        const r = 3 + k * 8;
        ctx.fillRect(Math.round(px + 8 - r), py + 2, 1, 1);
        ctx.fillRect(Math.round(px + 8 + r), py + 2, 1, 1);
        ctx.fillRect(px + 8, Math.round(py + 2 - r), 1, 1);
      }
    },
  };
}

function copier(def: PropDef): PropInstance {
  const P = paint(16, 22);
  P.box(0, 4, 16, 18, '#d4d6dc');
  P.r(1, 5, 14, 1, '#f0f1f4');
  P.r(2, 0, 12, 5, C.outline);
  P.r(3, 1, 10, 3, '#9aa0aa');
  P.r(2, 9, 6, 2, '#2b2b3a');
  P.p(11, 9, C.green);
  P.r(3, 14, 10, 5, '#b4b8c2');
  P.r(4, 13, 8, 2, '#fbf7ef');
  return { def, sprite: P.c, px: def.x * TILE, py: def.y * TILE - 6, sortY: def.y * TILE + 16 };
}

function glassH(def: PropDef): PropInstance {
  const P = paint(16, 18);
  P.r(0, 0, 16, 1, C.glassFrame);
  P.r(0, 1, 16, 11, C.glass);
  P.r(0, 12, 16, 3, C.glassFrame);
  P.r(0, 12, 16, 1, '#7d92a2');
  P.r(3, 2, 1, 4, C.glassHi);
  P.r(4, 2, 1, 2, C.glassHi);
  P.r(0, 15, 16, 2, 'rgba(20,12,30,0.18)');
  return { def, sprite: P.c, px: def.x * TILE, py: def.y * TILE - 2, sortY: def.y * TILE + 10 };
}

// ------------------------------------------------------------------ fabrique

const FACTORY: Record<PropDef['kind'], (def: PropDef) => PropInstance> = {
  desk,
  chair: chairBack,
  chairFront,
  chefDesk,
  chefChair,
  bookshelf,
  rack,
  plant,
  couch,
  coffee: coffeeCounter,
  cooler,
  arcade,
  vending,
  babyfoot,
  whiteboard,
  meetingTable,
  globe,
  radar,
  antenna,
  glassH,
  coffeeTable,
  beanbag,
  basket,
  flipchart,
  lamp,
  cabinet,
  readingTable,
  stool,
  coatRack,
  copier,
  extinguisher,
};

export function buildProps(): PropInstance[] {
  return PROPS.map((def) => FACTORY[def.kind](def));
}

export const DESK_COUNT = DESKS.length;
