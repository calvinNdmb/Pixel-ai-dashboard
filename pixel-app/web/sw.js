/* Pixel's service worker: it is there so that the app can be installed on a phone. It keeps nothing but the access code
   (for the share sheet, below), since Pixel lives on the Pi. When the Pi does not answer, the app says so instead of
   showing the browser's error page. */
const OFFLINE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pixel</title>
<body style="margin:0;display:grid;place-items:center;height:100vh;background:#141713;color:#d9d2bd;font:16px/1.5 system-ui,sans-serif;text-align:center">
<div style="padding:24px"><p style="font:44px monospace;margin:0 0 12px;color:#46ff82">:(</p>
<p>Pixel ne répond pas.<br>Vérifie qu'il est allumé et que ton téléphone est sur le même Wi-Fi.</p>
<p><button onclick="location.reload()" style="font:inherit;padding:10px 20px;border-radius:999px;border:0;background:#d9d2bd;color:#141713">Réessayer</button></p></div>`;
self.addEventListener('install', () => self.skipWaiting());
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
  if (e.request.mode !== 'navigate') return;          // the app's files and its WebSocket: the network, as usual
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
