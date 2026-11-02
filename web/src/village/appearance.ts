import type { SessionInfo } from '../../../shared/types';

const OUTFITS = ['#9b5342', '#798653', '#788c96', '#ba9154', '#a28aaa', '#6f9385'];
const HAIR = ['#965c3a', '#d5ad5f', '#51463b', '#a64932', '#d6d0b5', '#58676c'];
const SKIN = ['#e3bb91', '#c9946f', '#a57652', '#edcaa4', '#80563e'];

/** One shared palette for the scene and the accessible SVG portraits. */
export function villageAppearance(s: Pick<SessionInfo, 'seed' | 'role' | 'agent'>) {
  const seed = s.seed >>> 0;
  const manager = s.role === 'manager';
  return {
    skin: SKIN[(seed >>> 3) % SKIN.length]!,
    hair: manager ? '#52676d' : HAIR[(seed >>> 1) % HAIR.length]!,
    coat: manager ? '#668363' : s.agent === 'codex' ? '#607f86' : OUTFITS[seed % OUTFITS.length]!,
    trousers: '#60533f',
    boots: '#453b31',
    hat: !manager && seed % 4 === 0,
    manager,
  };
}
