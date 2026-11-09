/* Pixel app: connection to the server, keys, typed commands, on-screen keyboard. */
(() => {
const $ = id => document.getElementById(id);
const qs = new URLSearchParams(location.search), kiosk = qs.has('kiosk');
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
let token = qs.get('t') || store.get('pixel_t');
if (qs.get('t')) { store.set('pixel_t', qs.get('t')); history.replaceState(null, '', location.pathname + (kiosk ? '?kiosk=1' : '')); }
document.body.classList.toggle('kiosk', kiosk);
if (!kiosk) document.querySelector('.recess').after($('cmdForm'));    // phone/PC: the command bar sits under the screen
const L = Screens.local; L.kiosk = kiosk;
let P = null, ws = null, retry = 500, opened = false, follow = store.get('pixel_follow') !== '0', oskLocal = false;
const NAV = ['visage', 'lumieres', 'claude', 'codex', 'meteo', 'minuteur', 'agenda', 'systeme', 'reglages', 'veille'];

/* inside the Pixel phone app (pixel-mobile, a WebView): a word to the app */
const toApp = m => { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
/* Pixel sans Pi: in the phone app's own Pixel (its bundle sets window.PIXEL_LOCAL), the hub in this page (lab/demo-hub.js
   with local.js) stands in for the Pi, behind a socket shaped like the WebSocket; everything else is the same page */
const LOCAL = !!(window.PIXEL_LOCAL && window.PixelLocal);

/* ---------- connection ---------- */
const WS = `/ws${token ? '?t=' + encodeURIComponent(token) : ''}`;
let reT = 0;
function connect() {
  ws = LOCAL ? PixelLocal.socket() : new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${WS}`);
  ws.onopen = () => { opened = true; retry = 500; L.error = null; $('conn').textContent = 'connecté'; $('conn').classList.add('ok'); };
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.type !== 'state') return; P = m.data; Screens.setState(P); keep(P); if (kiosk || follow) L.scr = P.screen; render(); };
  ws.onclose = () => {
    $('conn').textContent = 'déconnecté'; $('conn').classList.remove('ok');
    if (!opened && !kiosk) never();
    clearTimeout(reT); reT = setTimeout(connect, retry = Math.min(retry * 2, 8000));
  };
  if (!LOCAL) { ws.addEventListener('open', () => toApp({ pi: true })); ws.addEventListener('close', () => toApp({ pi: false })); }   // the phone app: the Pi answers, or no more
  if (POCHE) POCHE.watch(ws);                         // the Pixel de poche hears the snapshots, and whether the Pi answers
}
addEventListener('online', () => { if (ws && ws.readyState === WebSocket.CLOSED) { clearTimeout(reT); retry = 500; connect(); } });   // a network again: try the Pi now
function never() {                                    // never connected: no access (a 403), or no Pi at all (away from home)
  if (!P) { const s = kept(); if (s) { P = s; Screens.setState(s); if (POCHE) POCHE.state(s); render(); } }   // he wakes up anyway, from the last snapshot
  fetch(WS, { cache: 'no-store' }).then(r => {
    if (opened) return;
    if (r.status === 403) { L.error = "Pas d'accès : scanne le QR code dans Réglages, sur l'écran de Pixel."; toApp({ access: false }); }
  }, () => { if (!opened) L.error = "Pixel ne répond pas. Vérifie qu'il est allumé et que ton téléphone est sur le même Wi-Fi."; });
}
/* the last snapshot, kept on the phone (without the chat and Codex's lines): when the Pi does not answer at all, away
   from home and the page loaded again (sw.js keeps the app's files), Pixel still wakes up here, his theme, his personality */
let keptAt = 0;
function keep(p, now) {
  if (kiosk || (!now && Date.now() - keptAt < 20000)) return;
  keptAt = Date.now();
  store.set('pixel_snap', JSON.stringify({ ...p, chat: p.chat && { ...p.chat, messages: [] }, codex: p.codex && { ...p.codex, lines: [] }, kept_at: keptAt }));
}
function kept() {
  try { const s = JSON.parse(store.get('pixel_snap')); if (!s || !s.view || !s.keys) return null; s.server_now += Date.now() - s.kept_at; return s; } catch { return null; }   // his clock goes on
}
document.addEventListener('visibilitychange', () => { if (document.hidden && P && ws && ws.readyState === 1) keep(P, true); });
function send(action, args = {}) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ action, args })); }
Screens.setSend(send);
const POCHE = window.PixelPoche ? window.PixelPoche.app({ send, kiosk }) : null;   // poche.js: the phone sideways becomes a second Pixel

function show(screen) {
  if (!NAV.includes(screen)) return;
  L.scr = screen;
  if (kiosk || follow) send('screen.show', { screen });
  render();
}

/* ---------- keys (phone / computer) ---------- */
const KB = [];
if (!kiosk) for (let i = 0; i < 15; i++) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'key' + (i >= 10 ? ' act' : '');
  b.addEventListener('click', () => press(i)); $('keys').append(b); KB.push(b);
}
function press(i) {
  if (!P) return;
  if (Screens.input()) return;
  if (i < 10) return show(NAV[i]);
  const k = P.keys.row3[L.scr]?.[i - 10]; if (!k) return;
  if (k.action === 'view.toggle' && k.args.key === 'osk') { $('cmd').focus(); return; }
  if (k.action === 'screen.show') return show(k.args.screen);
  send(k.action, k.args);
}
/* ---------- modes (phone / computer): Pixel (his screen), Clavier (the keys and the command bar), Les deux ---------- */
const MODES = ['pixel', 'clavier', 'both'];
function setMode(m) {
  store.set('pixel_mode', m); document.body.dataset.mode = m;
  if (m === 'clavier') $('keys').before($('cmdForm')); else document.querySelector('.recess').after($('cmdForm'));   // the command bar goes with the keys
  document.querySelectorAll('#modes button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  dispatchEvent(new Event('resize'));                 // his screen takes its new size
  toApp({ mode: m });                                 // the phone app keeps the screen on in Pixel mode
  render();
}
if (!kiosk) {
  document.querySelectorAll('#modes button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  setMode(MODES.includes(qs.get('mode')) ? qs.get('mode') : MODES.includes(store.get('pixel_mode')) ? store.get('pixel_mode') : 'both');   // ?mode=: the app's shortcuts
  if (!LOCAL && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});   // so that it installs as an app (on a secure address)
  if (!LOCAL && /Android/i.test(navigator.userAgent) && !window.ReactNativeWebView)                       // in Chrome on Android: the link to the real app, if Pixel has it
    fetch('/pixel.apk', { method: 'HEAD' }).then(r => { if (r.ok) $('apk').hidden = false; }, () => {});
}
const setT = (el, t) => { if (el.textContent !== t) el.textContent = t; };
function render() {
  if (!P) return;
  if (!kiosk) {
    P.keys.nav.forEach((k, i) => { setT(KB[i], k.label); KB[i].classList.toggle('cur', k.id === L.scr); KB[i].setAttribute('aria-label', 'Écran ' + k.label); });
    (P.keys.row3[L.scr] || []).forEach((k, j) => { const b = KB[10 + j]; setT(b, k ? k.label : ''); b.disabled = !k; if (k) b.setAttribute('aria-label', k.label.replace('\n', ' ')); });
  }
  document.body.dataset.theme = P.view.theme || 'retro';
  $('screen').classList.toggle('flat', !!P.view.crt_off || (P.view.theme || 'retro') !== 'retro');
  $('crt').style.filter = kiosk && !P.sys.hw_bright && P.sys.bright < 1 ? `brightness(${P.sys.bright})` : '';
  const osk = kiosk && (oskLocal || P.view.osk);
  $('osk').hidden = !osk;
  $('cmdForm').style.bottom = osk ? $('osk').offsetHeight + 'px' : '';
  $('cmdForm').classList.toggle('hide', kiosk && !osk && !['claude', 'codex'].includes(L.scr) && document.activeElement !== $('cmd'));
  castRender();
  if (window.PixelEcran && !kiosk) PixelEcran.panel(P, send, token);   // « Partager un écran » (ecran.js)
}
$('follow').setAttribute('aria-pressed', String(follow));
$('follow').addEventListener('click', () => {
  follow = !follow; store.set('pixel_follow', follow ? '1' : '0'); $('follow').setAttribute('aria-pressed', String(follow));
  if (follow && P) L.scr = P.screen; render();
});

/* ---------- typed commands ---------- */
const input = $('cmd'), hist = []; let hi = 0;
$('cmdForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = input.value.trim(); if (!text) return;
  send('cmd', { text }); hist.push(text); hi = hist.length; input.value = '';
  if (kiosk && !['claude', 'codex'].includes(L.scr)) input.blur();
  render();
});
input.addEventListener('keydown', e => {
  if (e.key === 'ArrowUp' && hi > 0) { input.value = hist[--hi]; e.preventDefault(); }
  else if (e.key === 'ArrowDown') { hi = Math.min(hist.length, hi + 1); input.value = hist[hi] || ''; e.preventDefault(); }
  else if (e.key === 'Escape') { input.value = ''; input.blur(); oskLocal = false; render(); }
});
input.addEventListener('focus', () => { Screens.input(); render(); });
input.addEventListener('input', () => Screens.event && Screens.event('typing'));   // he sees you typing
input.addEventListener('blur', () => setTimeout(render, 50));
if (kiosk) input.addEventListener('pointerdown', () => { oskLocal = true; render(); });
document.addEventListener('keydown', e => {
  if (e.target === input || e.ctrlKey || e.metaKey || e.altKey) return;
  Screens.input();
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const i = NAV.indexOf(L.scr); show(NAV[(i + (e.key === 'ArrowRight' ? 1 : NAV.length - 1)) % NAV.length]); return; }
  if (e.key.length === 1 && !e.target.closest?.('button')) { input.focus(); render(); }
});

/* ---------- touch / mouse on the screen ---------- */
const cv = $('crt'); let down = null;
cv.addEventListener('pointermove', e => { L.ptr = Screens.toCanvas(e); if (e.pointerType === 'mouse') L.lastInput = L.inputAt = performance.now(); });
cv.addEventListener('pointerleave', () => { L.ptr = null; });
cv.addEventListener('pointerdown', e => { down = { ...Screens.toCanvas(e), t: performance.now() }; });
cv.addEventListener('pointerup', e => {
  if (!down) return; const p = Screens.toCanvas(e), dx = p.x - down.x, dy = p.y - down.y, down0y = down.y; down = null;
  if (Screens.input()) return;
  if (POCHE && POCHE.up(p)) return;                  // Pixel de poche: only his face, no swipe nor quick menu
  // swipe down opens the quick menu (from the top edge even while petting Pixel), swipe up closes it
  const vertical = Math.abs(dy) > 90 && Math.abs(dy) > 1.5 * Math.abs(dx), across = Math.abs(dx) > 90 && Math.abs(dx) > 2 * Math.abs(dy);
  if (Screens.menuOpen) { if ((vertical && dy < 0) || (across && dx > 0)) Screens.menu(false); else if (!vertical && Math.abs(dx) < 20 && Math.abs(dy) < 20) Screens.hit(p.x, p.y); return; }
  if (vertical && dy > 0 && (!L.petted || down0y < 120)) { L.petted = false; Screens.menu(true); return; }
  // a swipe changes screen (not while petting Pixel); on the Pi's screen, a swipe left on his face shows the QR code to install the app
  if (!L.petted && across) {
    if (kiosk && L.scr === 'visage' && dx < 0) { Screens.menu(true, 'phone'); return; }
    const i = NAV.indexOf(L.scr); show(NAV[(i + (dx < 0 ? 1 : NAV.length - 1)) % NAV.length]); return;
  }
  Screens.hit(p.x, p.y);
});

/* ---------- on-screen keyboard (Pixel's touch screen) ---------- */
const LETTERS = ['azertyuiop', 'qsdfghjklm', 'wxcvbn,.'], DIGITS = ['1234567890', '@#€%&-+()/', "'\":;!?,."];
let caps = false, digits = false;
function buildOsk() {
  const o = $('osk'); o.replaceChildren();
  const rows = (digits ? DIGITS : LETTERS).map(r => [...r].map(c => [caps ? c.toUpperCase() : c, c]));
  rows[2].unshift(['⇧', 'shift', 'w2']); rows[2].push(['⌫', 'back', 'w2']);
  rows.push([[digits ? 'abc' : '123', 'digits', 'w2'], ['é', 'é'], ['è', 'è'], ['à', 'à'], ['ç', 'ç'], ['espace', ' ', 'w5'], ['↵', 'enter', 'w2'], ['✕', 'close']]);
  for (const r of rows) {
    const row = document.createElement('div'); row.className = 'row';
    for (const [label, val, cls] of r) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (cls) b.className = cls;
      b.addEventListener('pointerdown', e => { e.preventDefault(); key(val.length === 1 && caps ? val.toUpperCase() : val); });
      row.append(b);
    }
    o.append(row);
  }
}
function key(v) {
  Screens.input();
  if (v === 'shift') { caps = !caps; return buildOsk(); }
  if (v === 'digits') { digits = !digits; return buildOsk(); }
  if (v === 'close') { oskLocal = false; if (P?.view.osk) send('view.set', { key: 'osk', value: false }); input.blur(); return render(); }
  if (v === 'enter') return $('cmdForm').requestSubmit();
  const s = input.selectionStart ?? input.value.length, f = input.selectionEnd ?? s;
  if (v === 'back') { input.setRangeText('', s === f ? Math.max(0, s - 1) : s, f, 'end'); return; }
  input.setRangeText(v, s, f, 'end');
  if (caps) { caps = false; buildOsk(); }
}
/* ---------- Caster sur Pixel (phone / computer): a photo, a video, a link or a text on his screen (pixel/cast.py) ----------
   Files go to /api/cast (XMLHttpRequest, for the progress), with the access code; the server checks what they really are.
   The share sheet of Android (manifest share_target) lands on /share, then back here with ?cast=ok or why it failed. */
const CMSG = { ok: "C'est sur l'écran de Pixel !", acces: "Pas d'accès : ouvre l'appli une fois avec le QR code de Pixel.", 'trop-gros': 'Fichier trop gros.',
  format: 'Format non pris en charge. Photos : JPEG, PNG, GIF, WebP. Vidéos : MP4, WebM.', vide: 'Rien à afficher.', lien: "Ce lien n'est pas une adresse web.",
  erreur: "Pixel n'a pas pu l'afficher.", 'hors-ligne': 'Pixel ne répond pas. Ton téléphone est-il sur le même Wi-Fi ?' };
const castMsg = t => setT($('castMsg'), t || '');
let castKey = '';
if (!kiosk) {
  // the code in a cookie too: the pictures of the casts (/cast/...) and the share sheet carry it (SameSite=Strict: never another site)
  if (token) document.cookie = `pixel_t=${encodeURIComponent(token)}; path=/; max-age=31536000; samesite=strict`;
  if (token && 'serviceWorker' in navigator) navigator.serviceWorker.ready.then(r => r.active && r.active.postMessage({ token })).catch(() => {});   // sw.js: for the share sheet
  if (qs.has('cast')) {                                     // back from the share sheet
    $('cast').open = true; castMsg(CMSG[qs.get('cast')] || CMSG.erreur);
    const u = new URL(location.href); u.searchParams.delete('cast'); history.replaceState(null, '', u.pathname + u.search);
  } else if (store.get('pixel_cast') === '1') $('cast').open = true;
  $('cast').addEventListener('toggle', () => store.set('pixel_cast', $('cast').open ? '1' : '0'));
  $('castRaw').checked = store.get('pixel_cast_raw') === '1';
  if ([...$('castSecs').options].some(o => o.value === store.get('pixel_cast_secs'))) $('castSecs').value = store.get('pixel_cast_secs');
  $('castRaw').addEventListener('change', () => { store.set('pixel_cast_raw', $('castRaw').checked ? '1' : '0'); if (P && P.cast) send('cast.colors', { raw: $('castRaw').checked }); });
  $('castSecs').addEventListener('change', () => store.set('pixel_cast_secs', $('castSecs').value));
  $('castPick').addEventListener('click', () => $('castFile').click());
  $('castStop').addEventListener('click', () => send('cast.stop'));
  $('castFile').addEventListener('change', () => { const f = $('castFile').files[0]; $('castFile').value = ''; if (f) castFile(f); });
  $('castLinkForm').addEventListener('submit', e => { e.preventDefault(); let url = $('castLink').value.trim(); if (url && !/^[a-z]+:/i.test(url)) url = 'https://' + url;   // youtu.be/… without https://
    if (url) castSend({ url, raw: $('castRaw').checked, seconds: $('castSecs').value }).then(ok => { if (ok) $('castLink').value = ''; }); });
  $('castTextForm').addEventListener('submit', e => { e.preventDefault(); const text = $('castText').value.trim(); if (text) castSend({ text, seconds: $('castSecs').value }).then(ok => { if (ok) $('castText').value = ''; }); });
}
function castSend(body) {                                   // a file (FormData) or {text} / {url}; resolves true when it shows
  const file = body instanceof FormData;
  return new Promise(done => {
    const x = new XMLHttpRequest(); x.open('POST', '/api/cast');
    if (token) x.setRequestHeader('X-Pixel-Token', token);
    if (!file) x.setRequestHeader('Content-Type', 'application/json');
    if (file) x.upload.onprogress = e => { if (e.lengthComputable) castMsg(`Envoi… ${Math.round(e.loaded / e.total * 100)} %`); };
    x.onload = () => { let r = {}; try { r = JSON.parse(x.responseText); } catch { /* not JSON */ } castMsg(r.ok ? CMSG.ok : r.error || `Erreur ${x.status}.`); done(!!r.ok); };
    x.onerror = () => { castMsg(CMSG['hors-ligne']); done(false); };
    castMsg(file ? 'Envoi…' : ''); x.send(file ? body : JSON.stringify(body));
  });
}
function castFile(f) {
  const max = (P && P.settings.cast && P.settings.cast.max_mb) || 40;
  if (f.size > max * 1048576) return castMsg(`Fichier trop gros : ${String(max).replace('.', ',')} Mo au plus.`);
  const fd = new FormData(); fd.append('raw', $('castRaw').checked ? '1' : ''); fd.append('seconds', $('castSecs').value); fd.append('file', f, f.name);
  castSend(fd);
}
const castLabel = c => c.kind === 'text' ? '« ' + c.text + ' »' : c.kind === 'link' ? c.title || c.site : c.title || c.kind;
function castRender() {                                     // what is on his screen, the stop button, the last ones to show again
  if (kiosk || !P) return;
  if (window.PixelYTRemote) PixelYTRemote.render(P, send);    // YouTube on Pixel: its remote control, the YouTube app (ytremote.js)
  const c = P.cast && (!P.cast.until || P.server_now < P.cast.until) ? P.cast : null;
  setT($('castNow'), c ? "À l'écran : " + castLabel(c) : "Rien à l'écran pour le moment.");
  $('castStop').disabled = !c;
  const list = P.cast_recent || [], key = list.map(e => e.id).join() + '|' + (c ? c.src || c.url || c.text : '');
  if (key === castKey) return; castKey = key;
  $('castRecent').replaceChildren(...list.map(e => {
    const b = document.createElement('button'); b.type = 'button'; b.title = 'Afficher encore : ' + castLabel(e);
    const cur = c && (c.src || c.url || 't:' + c.text) === (e.src || e.url || 't:' + e.text); b.classList.toggle('cur', !!cur);
    if ((e.kind === 'image' || e.kind === 'gif') && /^\/cast\//.test(e.src || '')) b.style.backgroundImage = `url("${e.src}")`;
    else b.textContent = e.kind === 'video' ? '▶' : e.kind === 'text' ? '« ' + e.text.slice(0, 24) + ' »' : (e.site || 'lien');
    const s = document.createElement('span'); s.textContent = e.kind === 'text' ? 'Texte' : e.title || e.kind; b.append(s);
    b.addEventListener('click', () => send('cast.again', { id: e.id, raw: $('castRaw').checked }));
    return b;
  }));
}

buildOsk();
connect();
Screens.start();
})();
