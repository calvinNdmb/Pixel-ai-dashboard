/** Palette du QG : tons chauds, contours prune plutôt que noir pur. */
export const C = {
  outline: '#241a2a',
  ink: '#2b2238',
  white: '#fbf7ef',
  black: '#14101c',
  shadow: 'rgba(20, 12, 30, 0.28)',

  // sols
  woodA: '#c79b6a',
  woodB: '#b8895a',
  woodLine: '#94693f',
  woodGrain: '#a87b4d',
  chefFloorA: '#6f5b8e',
  chefFloorB: '#64517f',
  libFloorA: '#5a8061',
  libFloorB: '#4f7356',
  srvFloorA: '#5e6b78',
  srvFloorB: '#53606c',
  srvLine: '#434e59',
  meetA: '#dccaa6',
  meetB: '#cdb994',
  webFloorA: '#3c4f7a',
  webFloorB: '#35466e',
  webDot: '#5fd0e8',
  lounge: '#c79b6a',
  arcadeA: '#7a4f6e',
  arcadeB: '#6c4462',

  // murs
  wallTop: '#3a2e47',
  wallTopHi: '#544563',
  wallCream: '#efe2c6',
  wallCreamShade: '#e2d2b0',
  wallLav: '#cbb8e0',
  wallLavShade: '#bba6d3',
  wallSage: '#bcd2b0',
  wallSageShade: '#aac39d',
  wallSlate: '#56627a',
  wallSlateShade: '#4b566c',
  baseboard: '#6b4f3a',
  baseboardHi: '#856549',
  glass: 'rgba(170, 220, 240, 0.38)',
  glassHi: 'rgba(235, 250, 255, 0.75)',
  glassFrame: '#5c6f7e',

  // bois / meubles
  deskTop: '#b8794a',
  deskTopHi: '#cf9461',
  deskFront: '#8e5733',
  deskDark: '#6a3f24',
  chairA: '#3f5687',
  chairB: '#30436d',
  chairHi: '#5873a8',
  metal: '#9aa3ad',
  metalDark: '#6c757f',
  monitor: '#2a2a3a',
  screenOff: '#18192a',
  screenOn: '#21456e',

  // couleurs vives
  red: '#e05a54',
  orange: '#ef8f45',
  yellow: '#f6c84c',
  green: '#6cc46a',
  mint: '#7fe0b0',
  teal: '#3fb6b2',
  sky: '#6cb6ff',
  blue: '#4a74d9',
  purple: '#9a68d6',
  pink: '#ea7fb3',
  brown: '#7a4a2b',
  leaf: '#4fa155',
  leafHi: '#78c86a',
  leafDark: '#357a3d',
  pot: '#c26a4a',
  potDark: '#9a4f36',
  gold: '#f2c14e',
  goldDark: '#c08f2a',
} as const;

export interface CharacterPalette {
  hair: string;
  hairShade: string;
  skin: string;
  skinShade: string;
  shirt: string;
  shirtShade: string;
  pants: string;
  pantsShade: string;
  shoes: string;
  eyes: string;
  blush: string;
  accent: string;
}

const SKINS: Array<[string, string]> = [
  ['#f6d4b6', '#e3b38f'],
  ['#eebd94', '#d69f74'],
  ['#d39a6b', '#b77e52'],
  ['#a86f47', '#8c5735'],
  ['#7b4d31', '#633b24'],
];

const HAIRS: Array<[string, string]> = [
  ['#2e211b', '#4a3529'],
  ['#5b3622', '#7a4b31'],
  ['#c98f2e', '#e2ad4b'],
  ['#b8462e', '#d8653f'],
  ['#e9e1d4', '#ffffff'],
  ['#3e5fb0', '#5b7fd0'],
  ['#b0467e', '#d0669e'],
  ['#2f7f5a', '#47a277'],
  ['#1d1d2b', '#36364f'],
];

const SHIRTS: Array<[string, string]> = [
  ['#e05a54', '#b8403b'],
  ['#4a74d9', '#3558b0'],
  ['#5cb85c', '#3f8f41'],
  ['#f2b84b', '#c8902a'],
  ['#9a68d6', '#7a4cb3'],
  ['#ef8f45', '#c96d2c'],
  ['#3fb6b2', '#2b8e8a'],
  ['#ea7fb3', '#c65e92'],
  ['#e8e4dc', '#c2bcb0'],
];

const PANTS: Array<[string, string]> = [
  ['#3b3f5c', '#2c2f47'],
  ['#4d3a2b', '#3a2b1f'],
  ['#2f4f6f', '#233b54'],
  ['#5a5a66', '#45454f'],
];

/** Mélange déterministe d'une graine (xorshift). */
export function seededRandom(seed: number): () => number {
  let s = (Math.imul((seed >>> 0) ^ 0x5bd1e995, 0x9e3779b1) >>> 0) || 0x9e3779b9;
  const next = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
  // Quelques tirages à vide : les petites graines donnent sinon des débuts similaires.
  for (let i = 0; i < 6; i++) next();
  return next;
}

export type HairStyle = 'short' | 'long' | 'curly' | 'bun' | 'cap' | 'chef';

export interface Appearance {
  palette: CharacterPalette;
  hair: HairStyle;
}

export function appearanceFor(seed: number, role: 'manager' | 'worker' | 'external'): Appearance {
  const r = seededRandom(seed);
  const pickPair = (list: Array<[string, string]>) => list[Math.floor(r() * list.length) % list.length]!;
  const [skin, skinShade] = pickPair(SKINS);
  const [hair, hairShade] = pickPair(HAIRS);
  let [shirt, shirtShade] = pickPair(SHIRTS);
  const [pants, pantsShade] = pickPair(PANTS);
  const styles: HairStyle[] = ['short', 'long', 'curly', 'bun', 'cap'];
  let style = styles[Math.floor(r() * styles.length) % styles.length]!;
  if (role === 'manager') {
    style = 'chef';
    shirt = '#fbf7ef';
    shirtShade = '#d9d0c2';
  }
  if (role === 'external') {
    // Les sessions « terminal » portent un sweat gris : ce sont des visiteurs du QG.
    shirt = '#7d8597';
    shirtShade = '#636a7a';
  }
  return {
    hair: style,
    palette: {
      hair,
      hairShade,
      skin,
      skinShade,
      shirt,
      shirtShade,
      pants,
      pantsShade,
      shoes: '#2a2230',
      eyes: '#241a2a',
      blush: '#f08a8a',
      accent: role === 'manager' ? '#e05a54' : shirtShade,
    },
  };
}
