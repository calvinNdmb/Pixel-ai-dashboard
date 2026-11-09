/* Pixel sans Pi, what the app keeps for the Pixel of the phone:
   - his state, as the page sends it ({local_save}: his theme, settings, mood, timer, city, his character…);
   - the seed: the last snapshot of his Pi, read from the Pi's page while it is linked (app.js keeps it as pixel_snap), so
     that the Pixel of the phone has the same look and the same character;
   - where Pixel lives when a Pi is linked: on the Pi, or on the phone (the menu's choice).
   Plain JSON files in the app's documents directory (expo-file-system Paths.document: kept until the app is uninstalled,
   never cleaned up by the system, unlike the cache). Not SecureStore: it encrypts small key-value pairs (some iOS releases
   refused values above about 2048 bytes, its docs say), and his state is neither secret nor small. Each file has a size
   limit, checked when written and when read. */
import { File, Paths } from 'expo-file-system';

const STATE = 'pixel-local-state.json', SEED = 'pixel-pi-seed.json', HOME = 'pixel-home.json', LINK = 'pixel-link.json';
export const MAX_STATE = 256 * 1024, MAX_SEED = 512 * 1024;
export type Home = 'pi' | 'phone';
type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const file = (name: string) => new File(Paths.document, name);

async function read(name: string, max: number): Promise<unknown> {
  try {
    const f = file(name);
    if (!f.exists || f.size > max) return null;
    return JSON.parse(await f.text());
  } catch { return null; }                                // missing, unreadable or not JSON: as if nothing was kept
}
async function write(name: string, value: unknown, max: number): Promise<boolean> {
  const text = JSON.stringify(value);
  if (text === undefined || text.length > max) return false;
  try {
    const f = file(name);
    if (!f.exists) f.create();
    await f.write(text);
    return true;
  } catch { return false; }
}

/* what the page sent ({local_save}): an object in its own format (v: 1), not too big */
export function validState(v: unknown): v is Obj {
  return isObj(v) && v.v === 1 && typeof v.at === 'number' && JSON.stringify(v).length <= MAX_STATE;
}
export const saveState = (st: unknown) => (validState(st) ? write(STATE, st, MAX_STATE) : Promise.resolve(false));

/* the Pi page's pixel_snap (a JSON string): a snapshot with his look (view) and the time it was kept. Only what the phone's
   Pixel takes from it is kept (pixel-app/web/local.js fromPi): his look, two settings, the city, and the state of his features
   (caractère, nourrir…). Not the rest: the access code (settings.url, the QR code), the agenda's titles, the rooms, the chat… */
const PI_ONLY = new Set(['screen', 'mood', 'timer', 'anim', 'scene', 'toast', 'act', 'boot_at', 'keys', 'server_now', 'lights', 'chat', 'codex',
  'agenda', 'sys', 'poche', 'cast', 'cast_recent', 'airplay', 'solo', 'yt', 'ytcast']);   // local.js SKIP, and the Pi's own parts
const VIEW = ['theme', 'face', 'units_f', 'crt_off'];
function strip(s: Obj): Obj {
  const v = s.view as Obj, st = isObj(s.settings) ? s.settings : {}, out: Obj = { view: {}, settings: {}, kept_at: s.kept_at };
  for (const k of VIEW) if (k in v) (out.view as Obj)[k] = v[k];
  if (Array.isArray(st.themes)) (out.settings as Obj).themes = st.themes.filter(t => typeof t === 'string');
  if (typeof st.sleep_min === 'number') (out.settings as Obj).sleep_min = st.sleep_min;
  if (st.demo === true) (out.settings as Obj).demo = true;
  if (isObj(s.weather) && typeof s.weather.city === 'string') out.weather = { city: s.weather.city.slice(0, 80) };
  for (const k of Object.keys(s)) if (!(k in out) && !PI_ONLY.has(k)) out[k] = s[k];
  return out;
}
export function parseSeed(raw: unknown): Obj | null {
  if (typeof raw !== 'string' || raw.length > MAX_SEED) return null;
  try { const s: unknown = JSON.parse(raw); return isObj(s) && isObj(s.view) && typeof s.kept_at === 'number' ? strip(s) : null; } catch { return null; }
}
export function saveSeed(raw: unknown): Promise<boolean> {
  const s = parseSeed(raw);
  return s ? write(SEED, s, MAX_SEED) : Promise.resolve(false);
}

/* both, for the page: window.PIXEL_LOCAL_STATE = { state, seed } */
export async function readLocal(): Promise<{ state: Obj | null; seed: Obj | null }> {
  const [state, seed] = await Promise.all([read(STATE, MAX_STATE), read(SEED, MAX_SEED)]);
  return { state: validState(state) ? state : null, seed: isObj(seed) && isObj(seed.view) && typeof seed.kept_at === 'number' ? strip(seed) : null };
}

export async function readHome(): Promise<Home> {
  const h = await read(HOME, 1024);
  return isObj(h) && h.home === 'phone' ? 'phone' : 'pi';
}
export const saveHome = (home: Home) => write(HOME, { home }, 1024);

/* the share card's « Relier à mon Pixel » (App.tsx), once: Android gives a recreated activity its first intent again (the
   task kept in Recents), with the same time in it. false: already taken */
export async function takeLink(at: number): Promise<boolean> {
  const was = await read(LINK, 1024);
  if (isObj(was) && was.at === at) return false;
  await write(LINK, { at }, 1024);
  return true;
}

/* "Oublier mon Pixel": his Pi's snapshot goes; the Pixel of the phone keeps what he already has */
export function forgetPi() {
  for (const name of [SEED, HOME]) { try { const f = file(name); if (f.exists) f.delete(); } catch { /* already gone */ } }
}
