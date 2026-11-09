/* The back button, for the whole app: what lies on top gets it (the link screen, then the notification settings, then the
   menu, then the page shown), whatever order they were mounted in. React Native asks BackHandler's listeners newest first,
   so a page that changes under the menu (Linked falling back to the phone's Pixel, or going back to the Pi) would take the
   button from the menu. */
import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

export const LAYER = { page: 0, menu: 1, notifs: 2, setup: 3 } as const;
type Layer = { level: number; seq: number; run(): void };
const layers = new Set<Layer>();
let seq = 0, sub: { remove(): void } | null = null;

function onBack(): boolean {
  let top: Layer | null = null;
  for (const l of layers) if (!top || l.level > top.level || (l.level === top.level && l.seq > top.seq)) top = l;
  if (!top) return false;                               // nothing shown: Android's own back
  top.run();
  return true;
}

/* while mounted: the back button runs run(), unless a higher layer is shown */
export function useBack(level: number, run: () => void) {
  const fn = useRef(run);
  useEffect(() => { fn.current = run; });
  useEffect(() => {
    const l: Layer = { level, seq: ++seq, run: () => fn.current() };
    layers.add(l);
    sub ??= BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => {
      layers.delete(l);
      if (!layers.size && sub) { sub.remove(); sub = null; }
    };
  }, [level]);
}
