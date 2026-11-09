/* What Pixel's two WebViews share: the Pi's page (App.tsx, PixelPage) and Pixel on the phone itself (LocalPixel.tsx).
   - webProps: the props both pages need;
   - the plugs (plugs.ts: keeping the screen on, Pixel de poche's senses, the phone's notifications, his Pi's snapshot): each
     one is written once and works on whichever page is shown. It hears every message of the page
     (window.ReactNativeWebView.postMessage), may run a script before the page's own (beforeLoad) or send it one
     (page.inject), and knows when the page starts loading, is ready, or goes away. */
import { useEffect, useMemo, type RefObject } from 'react';
import type { WebView } from 'react-native-webview';
import { PLUGS } from './plugs';

export type PageMessage = Record<string, unknown>;
export type Page = { kind: 'pi' | 'phone'; view: number; inject(js: string): void };   // view: which WebView (its key)
export type Plug = {
  beforeLoad?: string;                                   // runs before the page's own scripts (injectedJavaScriptBeforeContentLoaded)
  start?(page: Page): void;                              // a new document starts loading in it: what the old one asked for is over
  message?(m: PageMessage, page: Page): void;            // a message of the page
  ready?(page: Page): void;                              // the page has loaded
  gone?(page: Page): void;                               // the WebView goes away
};

export const webProps = {
  javaScriptEnabled: true, domStorageEnabled: true, setSupportMultipleWindows: false, overScrollMode: 'never', textZoom: 100,
} as const;

/* a message of the page, if it is one (an object, as JSON) */
export function parseMessage(data: string): PageMessage | null {
  try { const m: unknown = JSON.parse(data); return m && typeof m === 'object' && !Array.isArray(m) ? m as PageMessage : null; } catch { return null; }
}

/* is the page that speaks still the one the app opened (its scheme and host)? A link or a redirect may lead the WebView
   elsewhere, and another site must not speak for Pixel. The message's url is the WebView's page (react-native-webview). */
const originOf = (u: string) => (/^([a-z][a-z0-9+.-]*:\/\/[^/?#]*)/i.exec(u)?.[1] ?? '').toLowerCase()
  .replace(/^(http:\/\/[^/]*):80$|^(https:\/\/[^/]*):443$/, '$1$2');           // the message's origin leaves the default port out
export const sameOrigin = (url: string | undefined, base: string) => !!url && originOf(url) !== '' && originOf(url) === originOf(base);
/* the phone's own Pixel (a file:// page; its WebView opens nothing else): its messages' origin is file://, or "null" if the
   WebView counts file pages as opaque origins */
export const fromFile = (url: string | undefined) => url === 'null' || (!!url && originOf(url) === 'file://');
/* the document a URL names: without its query and hash. react-native-webview (14.0.1, Android) says onLoadStart from
   doUpdateVisitedHistory, so history.replaceState (app.js drops ?t=) fires it too, maybe after the page's first messages */
const docOf = (u: string) => u.replace(/[?#].*$/, '');
const docs = new WeakMap<Page, string>();                // the document each WebView shows: start() only for a new one

/* the plugs, for one WebView; view: its key, a new one (its process was gone) is a new page, the old one is gone */
export function usePlugs(kind: Page['kind'], web: RefObject<WebView<object> | null>, view = 0) {
  const page = useMemo<Page>(() => ({ kind, view, inject: js => web.current?.injectJavaScript(`${js}\ntrue;`) }), [kind, web, view]);
  useEffect(() => () => { for (const p of PLUGS) { try { p.gone?.(page); } catch { /* one plug failing leaves the others */ } } }, [page]);
  return useMemo(() => {
    const each = (f: (p: Plug) => void) => { for (const p of PLUGS) { try { f(p); } catch { /* idem */ } } };
    return {
      page,
      beforeLoad: PLUGS.map(p => p.beforeLoad).filter(Boolean).join('\n'),
      start(url?: string) {                              // onLoadStart, with its url: a history change in the same page is no new start
        const d = docOf(url ?? '');
        if (d && d === docs.get(page)) return;
        docs.set(page, d); each(p => p.start?.(page));
      },
      message(m: PageMessage) { each(p => p.message?.(m, page)); },
      ready() { each(p => p.ready?.(page)); },
    };
  }, [page]);
}
