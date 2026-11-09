/* Pixel de poche in the app, on either page (his Pi's, or the phone's own Pixel: the bundle has web/poche.js too). The page
   says {poche: true, bg} when the phone becomes a second Pixel and {poche: false} when it goes back to the remote. Meanwhile
   the app holds the screen sideways, hides the system bars (App.tsx reads usePoche()), and lends him the phone's senses, which
   a page on Pixel's plain http address (or a file:// page) never gets: the accelerometer (shaken, tilted, picked up) and the
   battery (low, plugged in), fed to PixelPoche.native as the page's own devicemotion and getBattery() would.
   Held upright again, the screen may turn: the page then goes back to the remote, as it does in a browser. Keeping the
   screen on is the keepAwake plug's: poche.js says {mode: 'pixel'} while he is shown and awake. */
import { useSyncExternalStore } from 'react';
import * as Battery from 'expo-battery';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Accelerometer } from 'expo-sensors';
import type { Page, Plug } from './webBridge';

const G = 9.80665;                                  // expo-sensors gives g, devicemotion m/s² (Android's own axes and signs)
// before the page's scripts (and again once loaded): poche.js then leaves its devicemotion alone, and does not say it needs https
const SENSES = 'window.PixelApp=Object.assign(window.PixelApp||{},{senses:true});';

/* shown or not, and the theme's background for the edges: for App.tsx (the bars, the safe areas) and the banner of Linked.tsx */
export type Poche = { on: boolean; bg: string | null };
let now: Poche = { on: false, bg: null };
const subs = new Set<() => void>();
function set(p: Poche) {
  if (p.on === now.on && p.bg === now.bg) return;
  now = p; for (const f of subs) f();
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const usePoche = () => useSyncExternalStore(subscribe, () => now);

/* his senses for one page, while he is shown there; returns how to stop */
function senses(page: Page): () => void {
  let alive = true, locked = true, sideways = false, uprightAt = 0;
  const run = (call: string) => { if (alive) page.inject(`window.PixelPoche&&PixelPoche.native&&PixelPoche.native.${call};`); };
  const lock = () => ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
  lock();

  // about 30 a second: enough for a shake, light on the bridge. On Android 12 and up, expo-sensors asks for more than 5 a
  // second only with HIGH_SAMPLING_RATE_SENSORS (app.json; a normal permission, never asked to the user)
  Accelerometer.setUpdateInterval(33);
  const motion = Accelerometer.addListener(({ x, y, z }) => {
    run(`motion(${(x * G).toFixed(2)},${(y * G).toFixed(2)},${(z * G).toFixed(2)})`);
    const side = Math.abs(x) > 0.7 && Math.abs(y) < 0.45, up = Math.abs(y) > 0.7 && Math.abs(x) < 0.45;   // lying flat: neither
    if (side) {
      sideways = true; uprightAt = 0;
      if (!locked) { locked = true; lock(); }
    } else if (up && sideways && locked) {
      const t = Date.now();
      if (!uprightAt) uprightAt = t;
      else if (t - uprightAt > 700) { locked = false; sideways = false; uprightAt = 0; ScreenOrientation.unlockAsync().catch(() => {}); }
    } else uprightAt = 0;
  });

  let level = -1, plugged = false;
  const charging = (st: Battery.BatteryState) => st === Battery.BatteryState.CHARGING || st === Battery.BatteryState.FULL;
  const tell = () => { if (level >= 0) run(`battery(${level.toFixed(3)},${plugged})`); };
  const read = () => Promise.all([Battery.getBatteryLevelAsync(), Battery.getBatteryStateAsync()])
    .then(([l, st]) => { level = l; plugged = charging(st); tell(); }, () => {});
  read();
  const every = setInterval(read, 60000);          // Android only tells "low" and "okay": its level, once a minute
  const lvl = Battery.addBatteryLevelListener(e => { level = e.batteryLevel; tell(); });
  const plug = Battery.addBatteryStateListener(e => { plugged = charging(e.batteryState); tell(); });

  return () => {
    alive = false;
    motion.remove(); lvl.remove(); plug.remove(); clearInterval(every);
    ScreenOrientation.unlockAsync().catch(() => {});
  };
}

let shown: { page: Page; stop(): void } | null = null;   // one page at a time is on screen
function off(page: Page) {
  if (!shown || shown.page !== page) return;
  shown.stop(); shown = null; set({ on: false, bg: now.bg });
}
const COLOR = /^#[0-9a-f]{3,8}$/i;

export const pochePlug: Plug = {
  beforeLoad: SENSES,
  ready(page) { page.inject(SENSES); },              // the first may come too late on Android (react-native-webview's docs)
  start: off,                                         // a new load (a reload, a load error): he is not shown any more
  gone: off,
  message(m, page) {
    if (typeof m.poche !== 'boolean') return;
    const bg = typeof m.bg === 'string' && COLOR.test(m.bg) ? m.bg : now.bg;
    if (!m.poche) { off(page); return; }
    if (shown && shown.page !== page) off(shown.page);
    if (!shown) shown = { page, stop: senses(page) };
    set({ on: true, bg });                            // shown again with another theme: only its colour changes
  },
};
