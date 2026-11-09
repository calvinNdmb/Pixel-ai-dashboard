/* The app's native features for Pixel's pages, each written once for both (webBridge.ts says how a plug works):
   - keepAwake: in Pixel mode (his face alone, or the Pixel de poche while he is awake) the phone's screen stays on;
   - pochePlug (poche.ts): Pixel de poche held sideways, full screen, with the phone's accelerometer and battery;
   - phoneNotifs: no Pi linked, the phone's notifications (only if switched on, only the apps ticked) make the phone's own
     Pixel react while the app is open; nothing leaves the phone (with a Pi linked, the native listener sends them to him);
   - piSeed: while his Pi's page is shown, its last snapshot, so that the phone's Pixel looks and behaves like him;
   - panels: his panels (Caractère, Son look, Nourrir, Exos de maths, Souvenirs, Album, Ses amis), opened from the app's menu on either page;
   - sheets: the back button closes such a panel when one is open, before it opens the app's menu. */
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import PixelNative, { type PhoneNotif } from '../modules/pixel-native';
import { saveSeed } from './localStore';
import { pochePlug } from './poche';
import type { Page, Plug } from './webBridge';

const keepAwake: Plug = {                               // no start(): every page load says its {mode} again (app.js setMode)
  message(m) { if (m.mode === 'pixel') activateKeepAwakeAsync('pixel'); else if (m.mode) deactivateKeepAwake('pixel'); },
  gone() { deactivateKeepAwake('pixel'); },
};

/* ---------- the phone's notifications, for the phone's own Pixel ---------- */
const phones = new Set<Page>();                         // the phone's Pixel, while it is shown
let heard: { remove(): void } | null = null;
/* a notification (or the settings' test) for the phone's Pixel: local.js shows it as the Pi would (pixel/telephone.py) */
export function showOnPhone(n: PhoneNotif): boolean {
  for (const page of phones) page.inject(`window.PixelLocal&&PixelLocal.notif&&PixelLocal.notif(${JSON.stringify(n)});`);
  return phones.size > 0;
}
const phoneNotifs: Plug = {
  ready(page) {
    if (page.kind !== 'phone' || !PixelNative) return;
    phones.add(page);
    heard ??= PixelNative.addListener('onNotif', n => { if (AppState.currentState === 'active') showOnPhone(n); });   // the app open, in front
  },
  gone(page) {
    phones.delete(page);
    if (!phones.size && heard) { heard.remove(); heard = null; }   // nobody listens: the listener stops handing them over
  },
};

/* ---------- his Pi's snapshot: app.js keeps it in the Pi page's localStorage (pixel_snap); read once loaded, then every minute ---------- */
const READ_SNAP = "(function(){try{var s=localStorage.getItem('pixel_snap');if(s&&s.length<500000&&window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({pi_snap:s}));}catch(e){}})();";
const seedTimers = new WeakMap<Page, ReturnType<typeof setInterval>>();
let lastSeed = '';
const piSeed: Plug = {
  ready(page) {
    if (page.kind !== 'pi') return;
    clearInterval(seedTimers.get(page)); page.inject(READ_SNAP);
    seedTimers.set(page, setInterval(() => page.inject(READ_SNAP), 60000));
  },
  gone(page) { clearInterval(seedTimers.get(page)); seedTimers.delete(page); },
  message(m, page) {
    if (page.kind !== 'pi' || typeof m.pi_snap !== 'string' || m.pi_snap === lastSeed) return;
    lastSeed = m.pi_snap; saveSeed(m.pi_snap);
  },
};

/* ---------- his panels: Caractère, Son look, Nourrir, Exos de maths, Souvenirs, Album, Ses amis (pixel-app/web/app.js PixelPanel) ----------
   The page says which ones it has ({panels}); the app's menu (PixelMenu.tsx) offers them, and opens one on the page shown,
   the Pi's or the phone's own Pixel, in this order. An older Pi's page says nothing: no such items; a page without a panel
   (« Ses amis » without a Pi) does not offer it. */
export const PANELS = ['caractere', 'look', 'nourrir', 'exos', 'souvenirs', 'album', 'amis'] as const;
export type PanelId = (typeof PANELS)[number];
const panelPages = new Map<Page, PanelId[]>();
let offered: PanelId[] = [];
const panelSubs = new Set<() => void>();
function offer() {
  const next = [...panelPages.values()].pop() ?? [];   // the page shown last (one at a time)
  if (next.join() === offered.join()) return;
  offered = next; for (const f of panelSubs) f();
}
const subscribePanels = (f: () => void) => { panelSubs.add(f); return () => { panelSubs.delete(f); }; };
export const usePanels = () => useSyncExternalStore(subscribePanels, () => offered);
export function openPanel(id: PanelId) {
  for (const page of panelPages.keys()) page.inject(`window.PixelPanel&&window.PixelPanel(${JSON.stringify(id)});`);
}
const panels: Plug = {                                  // no start(): a new document of the page says {panels} again
  message(m, page) {
    if (!Array.isArray(m.panels)) return;
    panelPages.set(page, PANELS.filter(id => (m.panels as unknown[]).includes(id))); offer();
  },
  gone(page) { panelPages.delete(page); offer(); },
};

/* ---------- the back button: a panel open on the page (app.js {sheet}) closes before anything else ----------
   An older Pi's page says nothing: the button does what it did. */
const sheetPages = new WeakSet<Page>();
const sheets: Plug = {
  start(page) { sheetPages.delete(page); },             // a new document: nothing open on it yet
  message(m, page) { if (m.sheet === true) sheetPages.add(page); else if (m.sheet === false) sheetPages.delete(page); },
  gone(page) { sheetPages.delete(page); },
};
/* the back button, on a page: true when it closed a panel there (the page says again whether another one is open) */
export function closeSheet(page: Page): boolean {
  if (!sheetPages.has(page)) return false;
  sheetPages.delete(page); page.inject('window.PixelSheet&&window.PixelSheet.close();');
  return true;
}

export const PLUGS: Plug[] = [keepAwake, pochePlug, phoneNotifs, piSeed, panels, sheets];
