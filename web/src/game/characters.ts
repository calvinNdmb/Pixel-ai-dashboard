import type { Appearance, HairStyle } from './palette';
import { C } from './palette';

/**
 * Personnages 16×20 dessinés en « pixel strings ». Chaque frame superpose des
 * calques (jambes, corps, tête/coiffure, bras) ; '.' = vide, '_' = efface.
 *
 * Légende : o contour · h/H cheveux · s/S peau · e yeux · b joues · w/W blanc
 *           c/C haut · p/P bas · f chaussures · r accent (foulard du Chef)
 */

export const SPRITE_W = 16;
export const SPRITE_H = 20;

export type Dir = 'down' | 'up' | 'right' | 'left';
export type Pose = 'stand' | 'walk' | 'sit' | 'type' | 'raise' | 'cheer' | 'drink' | 'sleep';
type View = 'down' | 'up' | 'side';
type Layer = Record<number, string>;

const VALID = /^[.\-_ohHsSebwWcCpPfr]+$/;

function at(start: number, lines: string[]): Layer {
  const layer: Layer = {};
  lines.forEach((line, i) => {
    if (line.length !== SPRITE_W || !VALID.test(line)) {
      throw new Error(`Ligne de sprite invalide (ligne ${start + i}, ${line.length} car.) : "${line}"`);
    }
    layer[start + i] = line;
  });
  return layer;
}

const merge = (...layers: Layer[]): Layer => Object.assign({}, ...layers);

// ------------------------------------------------------------------ visages

const FACE_FRONT = at(7, [
  '...ohsssssSho...',
  '...ossessesSo...',
  '...ossessesSo...',
  '...osbssssbSo...',
  '....ossssSSo....',
]);

const FACE_SIDE = at(7, [
  '...ohhhhsssso...',
  '...ohhhssseso...',
  '...ohhhsssesso..',
  '...ohhssbssso...',
  '....ohhsssSo....',
]);

const NAPE = at(10, ['...oHhhhhhhHo...', '....oSssssSo....']);

// ----------------------------------------------------------------- coiffures

const SHORT_TOP = at(3, ['.....oooooo.....', '....ohHhhhho....', '...ohhHhhhhho...', '...ohhhhhhhho...']);

const HEADS: Record<Exclude<HairStyle, 'chef'>, Record<View, Layer>> = {
  short: {
    down: merge(SHORT_TOP, FACE_FRONT),
    up: merge(
      at(3, [
        '.....oooooo.....',
        '....ohhhhhho....',
        '...ohhhHhhhho...',
        '...ohhhhhhhho...',
        '...ohhhhhhhho...',
        '...ohhhhhhhho...',
        '...ohhhhhhhho...',
      ]),
      NAPE,
    ),
    side: merge(SHORT_TOP, FACE_SIDE),
  },
  long: {
    down: at(3, [
      '.....oooooo.....',
      '....ohHhhhho....',
      '...ohhHhhhhho...',
      '..ohhhhhhhhhho..',
      '..ohhsssssShho..',
      '..ohssessesSho..',
      '..ohssessesSho..',
      '..ohsbssssbSho..',
      '..ohhssssSShho..',
      '..ohh......hho..',
      '..ooo......ooo..',
    ]),
    up: at(3, [
      '.....oooooo.....',
      '....ohhhhhho....',
      '...ohhhHhhhho...',
      '..ohhhhhhhhhho..',
      '..ohhhhhhhhhho..',
      '..ohhhhhhhhhho..',
      '..ohhhhhhhhhho..',
      '..ohHhhhhhhHho..',
      '..ohhhhhhhhhho..',
      '...ohhhhhhhho...',
      '....oooooooo....',
    ]),
    side: at(3, [
      '.....oooooo.....',
      '....ohHhhhho....',
      '...ohhHhhhhho...',
      '..ohhhhhhhhho...',
      '..ohhhhhsssso...',
      '..ohhhhssseso...',
      '..ohhhhsssesso..',
      '..ohhhhsbssso...',
      '..ohhhhhssSo....',
      '..ohhho.........',
      '...ooo..........',
    ]),
  },
  curly: {
    down: at(2, [
      '.....oooooo.....',
      '....ohhHhhho....',
      '...ohhhhhhHho...',
      '..ohHhhhhhhhho..',
      '..ohhhhhhhhhho..',
      '..ohhsssssShho..',
      '..ohssessesSho..',
      '..ohssessesSho..',
      '...osbssssbSo...',
      '....ossssSSo....',
    ]),
    up: merge(
      at(2, [
        '.....oooooo.....',
        '....ohhhhhho....',
        '...ohhhHhhhho...',
        '..ohhhhhhhhhho..',
        '..ohhhhhhhhhho..',
        '..ohhhhhhhhhho..',
        '..ohhhhhhhhhho..',
        '..ohhhhhhhhhho..',
        '...ohhhhhhhho...',
      ]),
      at(11, ['....oSssssSo....']),
    ),
    side: at(2, [
      '.....oooooo.....',
      '....ohhHhhho....',
      '...ohhhhhhhho...',
      '..ohhhhhhhhho...',
      '..ohhhhhhhhho...',
      '..ohhhhhsssso...',
      '..ohhhhssseso...',
      '..ohhhhsssesso..',
      '...ohhhsbssso...',
      '....ohhsssSo....',
    ]),
  },
  bun: {
    down: merge(
      at(0, ['......oooo......', '.....ohHhho.....', '.....ohhhho.....', '.....oohhoo.....']),
      at(4, ['....ohHhhhho....', '...ohhHhhhhho...', '...ohhhhhhhho...']),
      FACE_FRONT,
    ),
    up: merge(
      at(0, ['......oooo......', '.....ohhHho.....', '.....ohhhho.....', '.....oohhoo.....']),
      at(4, ['....ohhhhhho....', '...ohhhHhhhho...', '...ohhhhhhhho...', '...ohhhhhhhho...', '...ohhhhhhhho...', '...ohhhhhhhho...']),
      NAPE,
    ),
    side: merge(
      at(1, ['..oooo..........', '.ohHhho.........', '.ohhhhoooooo....', '..ooohHhhhho....', '...ohhHhhhhho...', '...ohhhhhhhho...']),
      FACE_SIDE,
    ),
  },
  cap: {
    down: merge(
      at(2, ['.....oooooo.....', '....occcccco....', '...occCccccco...', '...occcccccco...', '..oCCCCCCCCCCo..']),
      FACE_FRONT,
    ),
    up: merge(
      at(2, ['.....oooooo.....', '....occcccco....', '...occccCccco...', '...occcccccco...', '...oCCCCCCCCo...']),
      at(7, ['...ohhhhhhhho...', '...ohhhhhhhho...', '...ohhhhhhhho...']),
      NAPE,
    ),
    side: merge(
      at(2, ['.....oooooo.....', '....occcccco....', '...occCccccco...', '...occcccccco...', '...ohhCCCCCCCCo.']),
      FACE_SIDE,
    ),
  },
};

// Le Chef porte une toque blanche (et un foulard rouge, voir plus bas).
const TOQUE = at(0, ['....oooooooo....', '...owwwwwwwwo...', '...owwwWwwwwo...', '...owwwwwwwwo...', '....oWWWWWWo....']);
const TOQUE_HAIR = at(5, ['...ohhhhhhhho...', '...ohhhhhhhho...']);

const CHEF_HEAD: Record<View, Layer> = {
  down: merge(TOQUE, TOQUE_HAIR, FACE_FRONT),
  up: merge(TOQUE, TOQUE_HAIR, at(7, ['...ohhhhhhhho...', '...ohhhhhhhho...', '...ohhhhhhhho...']), NAPE),
  side: merge(TOQUE, TOQUE_HAIR, FACE_SIDE),
};

// ------------------------------------------------------------------- corps

const BODY_FRONT = at(12, ['....occcccco....', '...occcccccco...', '...oCccccccCo...', '...osccccccso...']);
const BODY_SIDE = at(12, ['.....occcco.....', '....occcccco....', '....occCccco....', '....occsccco....']);
const BODY_SIDE_A = at(12, ['.....occcco.....', '....occcccco....', '....occcCcco....', '....occccsco....']);
const BODY_SIDE_B = at(12, ['.....occcco.....', '....occcccco....', '....oCccccco....', '....osccccco....']);

const SCARF_FRONT = at(12, ['....orrrrrro....']);
const SCARF_SIDE = at(12, ['.....orrrro.....']);

const ARM_UP_RIGHT = at(3, [
  '.............oo.',
  '............osso',
  '............osso',
  '............occo',
  '............occo',
  '............occo',
  '............occo',
  '............occo',
  '............occo',
  '............occo',
  '...........occo.',
  '...........o_...',
  '...........o_...',
]);
const ARM_UP_LEFT = at(3, [
  '.oo.............',
  'osso............',
  'osso............',
  'occo............',
  'occo............',
  'occo............',
  'occo............',
  'occo............',
  'occo............',
  'occo............',
  '.occo...........',
  '..._o...........',
  '..._o...........',
]);

// Frappe au clavier (vue de dos) : les coudes bougent l'un après l'autre.
const TYPE_A = at(14, ['..oC............', '....c......c....']);
const TYPE_B = at(14, ['............Co..', '....c......c....']);

// Tasse de café.
const CUP_LOW = at(12, ['..........owwo..', '..........owwoo.', '..........owwo..', '...........oo...']);
const CUP_HIGH = at(10, ['..........owwo..', '..........owwoo.', '..........owwo..', '...........oo...']);

const EYES_CLOSED = at(8, ['......s..s......', '......o..o......']);

// ------------------------------------------------------------------ jambes

const LEGS_FRONT = {
  stand: at(16, ['....oppppppo....', '....oppooppo....', '....offooffo....', '.....oo..oo.....']),
  stepA: at(16, ['....oppppppo....', '....oppooffo....', '....offo.oo.....', '.....oo.........']),
  stepB: at(16, ['....oppppppo....', '....offooppo....', '.....oo.offo....', '.........oo.....']),
  sit: at(16, ['...oppppppppo...', '...offo..offo...']),
};
const LEGS_SIDE = {
  stand: at(16, ['.....oppppo.....', '.....oppppo.....', '.....offfffo....', '......ooooo.....']),
  stepA: at(16, ['.....oppppo.....', '....oppoppo.....', '...offo.offfo...', '....oo...ooo....']),
  stepB: at(16, ['.....oppppo.....', '......oppo......', '......offfo.....', '.......ooo......']),
};
const LEGS_BACK_SIT = at(16, ['....oppppppo....']);

// ------------------------------------------------------------------- rendu

function compose(layers: Layer[]): string[] {
  const grid: string[][] = Array.from({ length: SPRITE_H }, () => Array<string>(SPRITE_W).fill('.'));
  for (const layer of layers) {
    for (const [r, line] of Object.entries(layer)) {
      const row = grid[Number(r)];
      if (!row) continue;
      for (let i = 0; i < SPRITE_W; i++) {
        const ch = line[i]!;
        if (ch === '.') continue;
        row[i] = ch === '_' ? '.' : ch;
      }
    }
  }
  return grid.map((r) => r.join(''));
}

function colorMap(a: Appearance): Record<string, string> {
  const p = a.palette;
  return {
    o: C.outline,
    h: p.hair,
    H: p.hairShade,
    s: p.skin,
    S: p.skinShade,
    e: p.eyes,
    b: p.blush,
    w: '#fbf7ef',
    W: '#ddd3c4',
    c: p.shirt,
    C: p.shirtShade,
    p: p.pants,
    P: p.pantsShade,
    f: p.shoes,
    r: p.accent,
  };
}

export interface FrameSpec {
  dir: Dir;
  pose: Pose;
  /** Index d'animation (0..3). */
  frame: number;
}

/** Les poses assises sont dessinées 2 px plus bas (sur le siège). */
export function poseOffsetY(pose: Pose): number {
  return pose === 'sit' || pose === 'type' || pose === 'sleep' ? 2 : 0;
}

function layersFor(a: Appearance, spec: FrameSpec): Layer[] {
  const { pose, frame } = spec;
  const view: View = spec.dir === 'down' ? 'down' : spec.dir === 'up' ? 'up' : 'side';
  const head = a.hair === 'chef' ? CHEF_HEAD[view] : HEADS[a.hair][view];
  const seated = pose === 'sit' || pose === 'type' || pose === 'sleep';
  const layers: Layer[] = [];

  if (pose === 'walk') {
    const step = frame % 4;
    const legs = view === 'side' ? LEGS_SIDE : LEGS_FRONT;
    layers.push(step === 0 ? legs.stepA : step === 2 ? legs.stepB : legs.stand);
  } else if (seated) {
    layers.push(view === 'up' ? LEGS_BACK_SIT : view === 'down' ? LEGS_FRONT.sit : LEGS_SIDE.stand);
  } else {
    layers.push(view === 'side' ? LEGS_SIDE.stand : LEGS_FRONT.stand);
  }

  if (view === 'side') {
    layers.push(pose === 'walk' ? (frame % 4 === 0 ? BODY_SIDE_A : frame % 4 === 2 ? BODY_SIDE_B : BODY_SIDE) : BODY_SIDE);
    if (a.hair === 'chef') layers.push(SCARF_SIDE);
  } else {
    layers.push(BODY_FRONT);
    if (a.hair === 'chef' && view === 'down') layers.push(SCARF_FRONT);
    if (pose === 'type' && view === 'up') layers.push(frame % 2 === 0 ? TYPE_A : TYPE_B);
  }

  layers.push(head);
  if (pose === 'sleep' && view === 'down') layers.push(EYES_CLOSED);

  if (pose === 'raise') {
    layers.push(ARM_UP_RIGHT);
  } else if (pose === 'cheer') {
    layers.push(ARM_UP_LEFT, ARM_UP_RIGHT);
  } else if (pose === 'drink' && view === 'down') {
    layers.push(frame % 4 < 2 ? CUP_LOW : CUP_HIGH);
  }
  return layers;
}

const cache = new Map<string, HTMLCanvasElement>();
const appearanceKeys = new WeakMap<Appearance, string>();

function appearanceKey(a: Appearance): string {
  let k = appearanceKeys.get(a);
  if (!k) {
    k = `${a.hair}:${Object.values(a.palette).join(',')}`;
    appearanceKeys.set(a, k);
  }
  return k;
}

/** Renvoie (et met en cache) le canvas 16×20 d'une frame de personnage. */
export function characterFrame(a: Appearance, spec: FrameSpec): HTMLCanvasElement {
  const animated = spec.pose === 'walk' || spec.pose === 'type' || spec.pose === 'drink';
  const frame = animated ? spec.frame % 4 : 0;
  const key = `${appearanceKey(a)}|${spec.dir}|${spec.pose}|${frame}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const rows = compose(layersFor(a, { ...spec, frame }));
  const colors = colorMap(a);
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_W;
  canvas.height = SPRITE_H;
  const ctx = canvas.getContext('2d')!;
  rows.forEach((row, y) => {
    for (let x = 0; x < SPRITE_W; x++) {
      const ch = row[x]!;
      const color = colors[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      // Vue de gauche = miroir de la vue de droite.
      ctx.fillRect(spec.dir === 'left' ? SPRITE_W - 1 - x : x, y, 1, 1);
    }
  });
  cache.set(key, canvas);
  return canvas;
}

/** Version texte d'une frame (utile pour les tests / le débogage). */
export function characterRows(a: Appearance, spec: FrameSpec): string[] {
  return compose(layersFor(a, spec));
}
