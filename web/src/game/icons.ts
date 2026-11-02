import { C } from './palette';

/** Icônes 7×7 affichées dans les bulles au-dessus des personnages. */
export type IconName =
  | 'dots'
  | 'book'
  | 'pencil'
  | 'terminal'
  | 'globe'
  | 'talk'
  | 'list'
  | 'alert'
  | 'check'
  | 'cross'
  | 'zzz'
  | 'coffee'
  | 'heart'
  | 'letter'
  | 'question'
  | 'note';

const ICONS: Record<Exclude<IconName, 'dots'>, string[]> = {
  book: ['.......', '.kk.kk.', 'kwwkwwk', 'kwwkwwk', 'kwwkwwk', 'kbbkbbk', '.kk.kk.'],
  pencil: ['.....pp', '....ypp', '...yyy.', '..yyy..', '.nyy...', '.nn....', 'k......'],
  terminal: ['kkkkkkk', 'kdddddk', 'kgddddk', 'kdgdddk', 'kgdggdk', 'kdddddk', 'kkkkkkk'],
  globe: ['..kkk..', '.kbgbk.', 'kbggbbk', 'kbbgbgk', 'kgbbbgk', '.kbbgk.', '..kkk..'],
  talk: ['kkkk...', 'kwwk...', 'kwwkkkk', 'kkkkyyk', '.k.kyyk', '...kkkk', '.....k.'],
  list: ['kkkkkkk', 'kwwwwwk', 'kgwkkwk', 'kwwwwwk', 'kgwkkwk', 'kwwwwwk', 'kkkkkkk'],
  alert: ['...k...', '..kkk..', '..kkk..', '...k...', '...k...', '.......', '...k...'],
  check: ['.......', '......g', '.....gg', 'g...gg.', 'gg.gg..', '.ggg...', '..g....'],
  cross: ['rr...rr', '.rr.rr.', '..rrr..', '..rrr..', '.rr.rr.', 'rr...rr', '.......'],
  zzz: ['kkkk...', '..k....', '.k..kkk', 'kkkk.k.', '....kkk', '.......', '.......'],
  coffee: ['.l..l..', '..l..l.', 'kkkkk..', 'kwwwkkk', 'kwwwk.k', 'kwwwkkk', '.kkk...'],
  heart: ['.......', '.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'],
  letter: ['.......', 'kkkkkkk', 'kkwwwkk', 'kwkwkwk', 'kwwkwwk', 'kkkkkkk', '.......'],
  question: ['..kkk..', '.k...k.', '.....k.', '...kk..', '...k...', '.......', '...k...'],
  note: ['...kkkk', '...k..k', '...k..k', '...k..k', '.kkk.kk', 'kkkk.kk', '.kk....'],
};

const ICON_COLORS: Record<string, string> = {
  k: C.outline,
  w: '#ffffff',
  b: C.blue,
  g: '#3e9b47',
  y: C.yellow,
  r: C.red,
  p: C.pink,
  n: '#b07a4a',
  d: '#1e2a3a',
  l: '#c9c4d6',
};

export type BubbleStyle = 'normal' | 'alert' | 'success' | 'error';

const BUBBLE_BG: Record<BubbleStyle, string> = {
  normal: '#fffaf0',
  alert: C.yellow,
  success: '#d9f5d4',
  error: '#ffd9d6',
};

const iconCache = new Map<string, HTMLCanvasElement>();

function iconCanvas(name: Exclude<IconName, 'dots'>): HTMLCanvasElement {
  const hit = iconCache.get(name);
  if (hit) return hit;
  const rows = ICONS[name];
  const canvas = document.createElement('canvas');
  canvas.width = 7;
  canvas.height = 7;
  const ctx = canvas.getContext('2d')!;
  rows.forEach((row, y) => {
    for (let x = 0; x < 7; x++) {
      const color = ICON_COLORS[row[x]!];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  iconCache.set(name, canvas);
  return canvas;
}

export const BUBBLE_W = 11;
export const BUBBLE_H = 13; // boîte de 11 + pointe de 2

/**
 * Dessine une bulle dont la pointe touche (cx, bottomY).
 * `t` (secondes) sert à animer les points de suspension.
 */
export function drawBubble(
  ctx: CanvasRenderingContext2D,
  cx: number,
  bottomY: number,
  icon: IconName,
  style: BubbleStyle,
  t: number,
): void {
  const x = Math.round(cx - 5);
  const y = Math.round(bottomY - BUBBLE_H);
  // contour arrondi
  ctx.fillStyle = C.outline;
  ctx.fillRect(x + 1, y, 9, 1);
  ctx.fillRect(x + 1, y + 10, 9, 1);
  ctx.fillRect(x, y + 1, 1, 9);
  ctx.fillRect(x + 10, y + 1, 1, 9);
  // fond
  ctx.fillStyle = BUBBLE_BG[style];
  ctx.fillRect(x + 1, y + 1, 9, 9);
  // pointe : on ouvre le bas de la boîte au milieu
  ctx.fillStyle = BUBBLE_BG[style];
  ctx.fillRect(x + 5, y + 10, 1, 2);
  ctx.fillStyle = C.outline;
  ctx.fillRect(x + 4, y + 11, 1, 1);
  ctx.fillRect(x + 6, y + 11, 1, 1);
  ctx.fillRect(x + 5, y + 12, 1, 1);
  // reflet
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(x + 1, y + 1, 2, 1);

  if (icon === 'dots') {
    const n = Math.floor(t * 3) % 4;
    ctx.fillStyle = C.outline;
    for (let i = 0; i < 3; i++) if (i < n) ctx.fillRect(x + 2 + i * 3, y + 5, 2, 2);
    return;
  }
  ctx.drawImage(iconCanvas(icon), x + 2, y + 2);
}
