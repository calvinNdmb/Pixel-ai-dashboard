/* Pixel de poche in the app. Pixel's page (web/poche.js) says {poche: true} when the phone becomes a second Pixel and
   {poche: false} when it goes back to the remote. Meanwhile the app holds the screen sideways, and lends him the phone's
   senses, which a page on Pixel's plain http address never gets: the accelerometer (shaken, tilted, picked up) and the
   battery (low, plugged in), fed to PixelPoche.native as the page's own devicemotion and getBattery() would.
   Held upright again, the screen may turn: the page then goes back to the remote, as it does in a browser. */
import { useEffect, type RefObject } from 'react';
import * as Battery from 'expo-battery';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Accelerometer } from 'expo-sensors';
import type { WebView } from 'react-native-webview';

const G = 9.80665;                                  // expo-sensors gives g, devicemotion m/s² (Android's own axes and signs)
// before the page's scripts: poche.js then leaves its devicemotion alone, and does not say that it needs https
export const SENSES = 'window.PixelApp=Object.assign(window.PixelApp||{},{senses:true});true;';

export function usePocheSenses(web: RefObject<WebView<object> | null>, on: boolean) {
  useEffect(() => {
    if (!on) return;
    let alive = true, locked = true, sideways = false, uprightAt = 0;
    const run = (call: string) => { if (alive) web.current?.injectJavaScript(`window.PixelPoche&&PixelPoche.native&&PixelPoche.native.${call};true;`); };
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
  }, [on, web]);
}
