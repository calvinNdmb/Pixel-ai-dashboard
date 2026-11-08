/* Pixel's service worker: it is there so that the app can be installed on a phone. It keeps nothing, since Pixel lives
   on the Pi. When the Pi does not answer, the app says so instead of showing the browser's error page. */
const OFFLINE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pixel</title>
<body style="margin:0;display:grid;place-items:center;height:100vh;background:#141713;color:#d9d2bd;font:16px/1.5 system-ui,sans-serif;text-align:center">
<div style="padding:24px"><p style="font:44px monospace;margin:0 0 12px;color:#46ff82">:(</p>
<p>Pixel ne répond pas.<br>Vérifie qu'il est allumé et que ton téléphone est sur le même Wi-Fi.</p>
<p><button onclick="location.reload()" style="font:inherit;padding:10px 20px;border-radius:999px;border:0;background:#d9d2bd;color:#141713">Réessayer</button></p></div>`;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;          // the app's files and its WebSocket: the network, as usual
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
