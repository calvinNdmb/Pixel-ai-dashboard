/* Pixel's service worker: it is there so that the app can be installed on a phone (on a secure address: https or
   localhost; a phone does not run it on plain http). Pixel lives on the Pi, so the network always comes first; the app's
   own files (the page, its scripts, styles and fonts) are kept too, so that away from home the page still opens and the
   Pixel de poche wakes up from the last snapshot app.js kept. Only a page it never kept gets the "Pixel ne répond pas" page.
   It also keeps the access code, for the share sheet (below). The WebSocket, /pixel.apk and the rest: the network only. */
const OFFLINE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pixel</title>
<body style="margin:0;display:grid;place-items:center;height:100vh;background:#141713;color:#d9d2bd;font:16px/1.5 system-ui,sans-serif;text-align:center">
<div style="padding:24px"><p style="font:44px monospace;margin:0 0 12px;color:#46ff82">:(</p>
<p>Pixel ne répond pas.<br>Vérifie qu'il est allumé et que ton téléphone est sur le même Wi-Fi.</p>
<p><button onclick="location.reload()" style="font:inherit;padding:10px 20px;border-radius:999px;border:0;background:#d9d2bd;color:#141713">Réessayer</button></p></div>`;
const SHELL = 'pixel-app';
async function keepShell() {        // the page, the files it loads (index.html says which) and the fonts of its styles
  const page = await fetch('/', { cache: 'no-cache' }); if (!page.ok) return;
  const html = await page.clone().text(), c = await caches.open(SHELL), files = [...html.matchAll(/(?:src|href)="(app\/[^"?#]+)"/g)].map(m => '/' + m[1]);
  for (const f of files.filter(f => f.endsWith('.css'))) {
    const css = await fetch(f).then(r => r.text(), () => '');
    for (const m of css.matchAll(/url\(["']?([\w.-]+\.(?:ttf|otf|woff2?))["']?\)/g)) files.push('/app/' + m[1]);
  }
  await c.put('/', page); await c.addAll([...new Set(files)]);
}
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(keepShell().catch(() => {})); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
/* "Partager → Pixel" on Android (manifest share_target): the photo, the video or the link arrives here as a POST to /share.
   The app gives us its access code (app.js), and we pass the share on to Pixel with it, then go back to the app. */
self.addEventListener('message', e => {
  if (e.data && typeof e.data.token === 'string') e.waitUntil(caches.open('pixel').then(c => c.put('/__pixel_t', new Response(e.data.token))));
});
async function share(req) {
  let t = '';
  try { const r = await (await caches.open('pixel')).match('/__pixel_t'); if (r) t = await r.text(); } catch (e) { /* no code yet: the cookie, maybe */ }
  try {
    const r = await fetch('/share', { method: 'POST', body: await req.formData(), headers: t ? { 'X-Pixel-Token': t } : {}, credentials: 'same-origin' });
    return Response.redirect(r.redirected ? r.url : '/?cast=' + (r.ok ? 'ok' : 'erreur'), 303);
  } catch (e) { return Response.redirect('/?cast=hors-ligne', 303); }
}
self.addEventListener('fetch', e => {
  if (e.request.method === 'POST' && new URL(e.request.url).pathname === '/share') { e.respondWith(share(e.request)); return; }
  const q = e.request, u = new URL(q.url), nav = q.mode === 'navigate';
  if (q.method !== 'GET' || u.origin !== location.origin || (!nav && !u.pathname.startsWith('/app/'))) return;
  const key = nav && u.pathname === '/' ? '/' : q;     // the page, whatever its ?t= or ?mode=
  e.respondWith(fetch(q).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(SHELL).then(c => c.put(key, copy)).catch(() => {}); }
    return r;
  }, () => caches.match(key, { ignoreSearch: true }).then(r => r || (nav ? new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }) : Response.error()))));
});
