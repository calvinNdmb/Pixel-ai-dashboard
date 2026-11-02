/**
 * Police bitmap 3×5 (majuscules, chiffres, ponctuation). Les minuscules et les
 * lettres accentuées sont ramenées à leur majuscule de base.
 * Chaque glyphe = 5 lignes de 3 pixels séparées par des espaces.
 */

const RAW: Record<string, string> = {
  A: '.#. #.# ### #.# #.#',
  B: '##. #.# ##. #.# ##.',
  C: '.## #.. #.. #.. .##',
  D: '##. #.# #.# #.# ##.',
  E: '### #.. ##. #.. ###',
  F: '### #.. ##. #.. #..',
  G: '.## #.. #.# #.# .##',
  H: '#.# #.# ### #.# #.#',
  I: '### .#. .#. .#. ###',
  J: '..# ..# ..# #.# .#.',
  K: '#.# #.# ##. #.# #.#',
  L: '#.. #.. #.. #.. ###',
  M: '#.# ### ### #.# #.#',
  N: '##. #.# #.# #.# #.#',
  O: '.#. #.# #.# #.# .#.',
  P: '##. #.# ##. #.. #..',
  Q: '.#. #.# #.# ##. .##',
  R: '##. #.# ##. #.# #.#',
  S: '.## #.. .#. ..# ##.',
  T: '### .#. .#. .#. .#.',
  U: '#.# #.# #.# #.# ###',
  V: '#.# #.# #.# #.# .#.',
  W: '#.# #.# ### ### #.#',
  X: '#.# #.# .#. #.# #.#',
  Y: '#.# #.# .#. .#. .#.',
  Z: '### ..# .#. #.. ###',
  '0': '### #.# #.# #.# ###',
  '1': '.#. ##. .#. .#. ###',
  '2': '##. ..# .#. #.. ###',
  '3': '##. ..# .#. ..# ##.',
  '4': '#.# #.# ### ..# ..#',
  '5': '### #.. ##. ..# ##.',
  '6': '.## #.. ### #.# ###',
  '7': '### ..# .#. .#. .#.',
  '8': '### #.# ### #.# ###',
  '9': '### #.# ### ..# ##.',
  ' ': '... ... ... ... ...',
  '.': '... ... ... ... .#.',
  ',': '... ... ... .#. #..',
  ':': '... .#. ... .#. ...',
  ';': '... .#. ... .#. #..',
  '!': '.#. .#. .#. ... .#.',
  '?': '##. ..# .#. ... .#.',
  '-': '... ... ### ... ...',
  '+': '... .#. ### .#. ...',
  '/': '..# ..# .#. #.. #..',
  "'": '.#. .#. ... ... ...',
  '"': '#.# #.# ... ... ...',
  '(': '.#. #.. #.. #.. .#.',
  ')': '.#. ..# ..# ..# .#.',
  '#': '#.# ### #.# ### #.#',
  '$': '.## ##. .#. .## ##.',
  '%': '#.# ..# .#. #.. #.#',
  '&': '.#. #.# .#. #.# .##',
  '*': '#.# .#. #.# ... ...',
  '<': '..# .#. #.. .#. ..#',
  '>': '#.. .#. ..# .#. #..',
  '=': '... ### ... ### ...',
  '_': '... ... ... ... ###',
  '@': '.#. #.# ##. #.. .##',
  '·': '... ... .#. ... ...',
};

const GLYPHS = new Map<string, boolean[]>();
for (const [ch, def] of Object.entries(RAW)) {
  const rows = def.split(' ');
  if (rows.length !== 5 || rows.some((r) => r.length !== 3)) throw new Error(`Glyphe invalide : ${ch}`);
  GLYPHS.set(
    ch,
    rows.join('').split('').map((c) => c === '#'),
  );
}

const ACCENTS: Record<string, string> = {
  À: 'A', Â: 'A', Ä: 'A', Á: 'A', Ç: 'C', É: 'E', È: 'E', Ê: 'E', Ë: 'E', Î: 'I', Ï: 'I', Í: 'I',
  Ô: 'O', Ö: 'O', Ó: 'O', Ù: 'U', Û: 'U', Ü: 'U', Ú: 'U', Ÿ: 'Y', Ñ: 'N', Œ: 'O', Æ: 'A',
};

export const GLYPH_W = 3;
export const GLYPH_H = 5;

function glyphFor(ch: string): boolean[] {
  const up = ch.toUpperCase();
  return GLYPHS.get(ACCENTS[up] ?? up) ?? GLYPHS.get('?')!;
}

export function textWidth(text: string): number {
  return text.length ? [...text].length * (GLYPH_W + 1) - 1 : 0;
}

const textCache = new Map<string, HTMLCanvasElement>();

/** Rend un texte en canvas (mis en cache par texte + couleur). */
export function textSprite(text: string, color: string): HTMLCanvasElement {
  const key = `${color}|${text}`;
  const hit = textCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, textWidth(text));
  canvas.height = GLYPH_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  let x = 0;
  for (const ch of text) {
    const g = glyphFor(ch);
    for (let i = 0; i < 15; i++) if (g[i]) ctx.fillRect(x + (i % 3), Math.floor(i / 3), 1, 1);
    x += GLYPH_W + 1;
  }
  if (textCache.size > 600) textCache.clear();
  textCache.set(key, canvas);
  return canvas;
}

export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void {
  if (!text) return;
  ctx.drawImage(textSprite(text, color), Math.round(x), Math.round(y));
}

/** Coupe un nom pour qu'il tienne en `max` caractères. */
export function shortLabel(text: string, max = 10): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}.` : clean;
}
