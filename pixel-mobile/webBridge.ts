/* What Pixel's two WebViews share: the Pi's page (App.tsx, PixelPage) and Pixel on the phone itself (LocalPixel.tsx).
   - webProps: the props both pages need;
   - PLUGS: the native features. Each one is written once and works on whichever page is shown: it hears every message of
     the page (window.ReactNativeWebView.postMessage), may run a script before the page's own (beforeLoad) or send it one
     (page.inject), and knows when the page is ready or goes away. Keeping the screen on in Pixel mode is the first one;
     share to Pixel, the phone's notifications, Pixel de poche's sensors or the orientation lock plug in here the same way. */
import { useEffect, useMemo, type RefObject } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import type { WebView } from 'react-native-webview';

export type PageMessage = Record<string, unknown>;
export type Page = { kind: 'pi' | 'phone'; inject(js: string): void };
export type Plug = {
  beforeLoad?: string;                                   // runs before the page's own scripts (injectedJavaScriptBeforeContentLoaded)
  message?(m: PageMessage, page: Page): void;            // a message of the page
  ready?(page: Page): void;                              // the page has loaded
  gone?(page: Page): void;                               // the WebView goes away
};

/* the page says which mode is on: in Pixel mode (his face alone, or the Pixel de poche) the phone's screen stays on */
const keepAwake: Plug = {
  message(m) { if (m.mode === 'pixel') activateKeepAwakeAsync('pixel'); else if (m.mode) deactivateKeepAwake('pixel'); },
  gone() { deactivateKeepAwake('pixel'); },
};
export const PLUGS: Plug[] = [keepAwake];

export const webProps = {
  javaScriptEnabled: true, domStorageEnabled: true, setSupportMultipleWindows: false, overScrollMode: 'never', textZoom: 100,
} as const;

/* a message of the page, if it is one (an object, as JSON) */
export function parseMessage(data: string): PageMessage | null {
  try { const m: unknown = JSON.parse(data); return m && typeof m === 'object' && !Array.isArray(m) ? m as PageMessage : null; } catch { return null; }
}

/* is the page that speaks still the one the app opened (its scheme and host)? A link or a redirect may lead the WebView
   elsewhere, and another site must not speak for Pixel. The message's url is the WebView's page (react-native-webview). */
const originOf = (u: string) => (/^([a-z][a-z0-9+.-]*:\/\/[^/?#]*)/i.exec(u)?.[1] ?? '').toLowerCase();
export const sameOrigin = (url: string | undefined, base: string) => !!url && originOf(url) !== '' && originOf(url) === originOf(base);

/* the plugs, for one WebView */
export function usePlugs(kind: Page['kind'], web: RefObject<WebView<object> | null>) {
  const page = useMemo<Page>(() => ({ kind, inject: js => web.current?.injectJavaScript(`${js}\ntrue;`) }), [kind, web]);
  useEffect(() => () => { for (const p of PLUGS) p.gone?.(page); }, [page]);
  return useMemo(() => ({
    page,
    beforeLoad: PLUGS.map(p => p.beforeLoad).filter(Boolean).join('\n'),
    message(m: PageMessage) { for (const p of PLUGS) { try { p.message?.(m, page); } catch { /* one plug failing leaves the others */ } } },
    ready() { for (const p of PLUGS) { try { p.ready?.(page); } catch { /* idem */ } } },
  }), [page]);
}
