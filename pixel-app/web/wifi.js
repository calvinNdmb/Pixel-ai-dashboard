/* Pixel's Wi-Fi on his screens (pixel/wifi.py: the snapshot's "wifi", the actions wifi.scan and wifi.connect).
   - The view, a screens.js add-on (first of its ORDER), drawn instead of the screen it was opened on: the network he is on,
     the ones around him five at a time (< > for the others), Actualiser and Fermer. A touch on a network joins it: a known
     or open one at once; one with a password asks for it in the command bar (app.js PixelAsk), with the on-screen keyboard
     on Pixel's own screen. Then « Connexion… » with his face small beside it, and how it went; refused: « Retaper ».
   - Opened by the quick menu's « Wi-Fi », a touch on the Wi-Fi line of Système, or the reminder « Pas de Wi-Fi » drawn over
     his face when no network has been up for 20 s (over(): screens.js draws it after Nourrir, like the album's flash).
   - Closed by Fermer (or Échap), by another screen, after 2 minutes untouched, and by itself 4 s after a join that worked.
   - Nothing at all when the snapshot has no "wifi" (an older Pi, the phone's own Pixel) or nmcli does not answer (ok false).
   Loaded after screens.js and before app.js. */
window.PixelWifi = (() => {
const Sc = typeof Screens !== 'undefined' ? Screens : null; if (!Sc || !Sc.addon) return null;
const L = Sc.local, PAGE = 5, IDLE = 120000, OFF_AFTER = 20000, OK_SHOWN = 4000;
const kioskPage = typeof location !== 'undefined' && /[?&]kiosk\b/.test(location.search);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const realNow = () => (window.PixelClock ? window.PixelClock.real() : performance.now());
let Wf = null, K = null;
/* the view: open on which screen, its page; the join it follows (mine: its id, once the server names the one just asked:
   follow, sentAt), a result already seen (seen), when the one that worked was seen (okAt); the network whose password is
   asked (asking); a short note under the list */
const V = { open: false, scr: '', page: 0, mine: 0, follow: '', sentAt: 0, seen: 0, okAt: 0, asking: '', note: '', noteAt: 0, scanAt: 0 };

const avail = () => !!(Wf && Wf.ok);
const connecting = () => !!(Wf && Wf.job && Wf.job.state === 'connecting');
function send(action, args) { if (K) K.send(action, args || {}); }
function note(msg) { V.note = msg; V.noteAt = Date.now(); L.dirty = true; }
function scan() { if (Date.now() - V.scanAt > 3000) { V.scanAt = Date.now(); send('wifi.scan'); } }
function open() {
  if (!avail()) return false;
  Object.assign(V, { open: true, scr: L.scr, page: 0, note: '', seen: Wf.job ? Wf.job.id : 0, mine: 0, follow: '', okAt: 0 });
  scan(); L.dirty = true;
  return true;
}
function close() {
  V.open = false; V.okAt = 0;
  if (V.asking && window.PixelAsk) window.PixelAsk.close();
  V.asking = ''; L.dirty = true;
}
function join(ssid, password) {
  Object.assign(V, { follow: ssid, sentAt: K ? K.srv() : Date.now(), mine: 0, okAt: 0, note: '' });
  send('wifi.connect', password == null ? { ssid } : { ssid, password });
}
function ask(ssid) {
  const A = window.PixelAsk; if (!A) return note('Le clavier de Pixel ne répond pas.');
  V.asking = ssid; L.dirty = true;
  A.open({ label: 'MOT DE PASSE', placeholder: 'mot de passe de « ' + ssid + ' »', secret: true,
    submit: pw => { V.asking = ''; join(ssid, pw); L.dirty = true; },
    cancel: () => { V.asking = ''; L.dirty = true; } });
}
function tap(n) {
  if (n.on) return note('Pixel est déjà sur « ' + n.ssid + ' ».');
  if (n.lock === 'entreprise') return note('« ' + n.ssid + ' » demande un identifiant : Pixel ne sait pas s\'y connecter.');
  if (n.lock === 'wep') return note('« ' + n.ssid + ' » utilise WEP, trop ancien pour Pixel.');
  if (n.known || !n.lock) return join(n.ssid);
  ask(n.ssid);
}
function shownJob() {                   // a join running (whoever asked), else the result of the one asked here, until seen
  const j = Wf && Wf.job;
  if (!j) return null;
  if (j.state === 'connecting') return j;
  return j.id !== V.seen && j.id === V.mine ? j : null;
}

/* ---------- snapshots ---------- */
function state(p) {
  Wf = p && p.wifi && typeof p.wifi === 'object' ? p.wifi : null;
  const j = Wf && Wf.job;
  if (j && V.follow && j.ssid === V.follow && j.t0 >= V.sentAt - 5000) { V.mine = j.id; V.follow = ''; }
  if (j && j.id === V.mine && j.state === 'ok' && !V.okAt) V.okAt = Date.now();
}

/* ---------- drawing, with the screens' kit (k): its theme, text, boxes and touch zones ---------- */
function btn(k, x, y, w, h, label, fn) {
  const c = k.c.G, s = h >= 50 ? 26 : 24;
  k.box(x, y, w, h, c, null);
  k.txt(k.fit(k.T.upper ? label.toUpperCase() : label, w - 12, s), x + w / 2, y + (h - s) / 2 + 1, s, c, 'center');
  k.hit(x, y, w, h, () => { L.dirty = true; k.fast(300); fn(); });
}
function bars(k, x, y, sig, c) {         // four bars, like Système's
  const q = sig >= 70 ? 4 : sig >= 50 ? 3 : sig >= 30 ? 2 : sig > 0 ? 1 : 0;
  for (let i = 0; i < 4; i++) k.bar(x + i * 14, y + 28 - (i + 1) * 7, 1, i < q ? 1 : 0, 10, (i + 1) * 7, 0, c, k.c.DK);
}
const LOCK = ['.###.', '#...#', '#...#', '#####', '##.##', '#####'];
function lock(k, x, y, u, c) {            // a little padlock in whole pixels: crisp in every theme
  const X = k.X; X.save(); X.shadowBlur = 0; X.fillStyle = c;
  LOCK.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') X.fillRect(Math.round(x + i * u), Math.round(y + j * u), Math.ceil(u), Math.ceil(u)); });
  X.restore();
}
const dots = k => '.'.repeat(1 + Math.floor(k.now / 400) % 3);

function drawList(k) {
  const { G, D, DK, AM, WH } = k.c, nets = Wf.nets || [];
  if (Wf.ssid) {                          // where he is
    k.txt('CONNECTÉ À', 24, 64, 22, D);
    k.txt(k.fit(Wf.ssid, 500, 30), 170, 59, 30, WH);
    bars(k, 720, 56, Wf.signal, WH);
  } else if (Wf.eth) k.txt('PAS DE WI-FI · CÂBLE RÉSEAU BRANCHÉ', 24, 62, 24, G);
  else {
    k.txt('PAS DE WI-FI', 24, 58, 30, AM, 'left', 'title');
    k.txt(k.fit('Touche ton réseau, puis tape son mot de passe.', 470, 22), 306, 66, 22, D);
  }
  const pages = Math.max(1, Math.ceil(nets.length / PAGE)); V.page = clamp(V.page, 0, pages - 1);
  nets.slice(V.page * PAGE, V.page * PAGE + PAGE).forEach((n, i) => {
    const y = 100 + i * 56, off = n.lock === 'entreprise' || n.lock === 'wep', c = n.on ? WH : off ? D : G;
    k.box(24, y, 752, 48, c, n.on ? DK : null);
    if (n.lock) lock(k, 38, y + 12, 4, c);
    k.txt(k.fit(n.ssid, 480, 28), 70, y + 10, 28, c);
    const tag = n.on ? 'CONNECTÉ' : n.known ? 'ENREGISTRÉ' : n.lock === 'entreprise' ? 'ENTREPRISE' : n.lock === 'wep' ? 'WEP' : !n.lock ? 'OUVERT' : '';
    if (tag) k.txt(tag, 692, y + 15, 20, n.on ? WH : D, 'right');
    bars(k, 706, y + 10, n.signal, c);
    k.hit(24, y, 752, 48, () => { L.dirty = true; k.fast(300); tap(n); });
  });
  if (!nets.length) k.para(Wf.scanning ? 'Pixel cherche les réseaux autour de lui…' : 'Aucun réseau trouvé. Touche Actualiser, ou rapproche Pixel de la box.', 40, 160, 720, 28, D, 34);
  const msg = V.note && Date.now() - V.noteAt < 6000 ? V.note
    : Wf.perm === false ? 'Pixel n\'a pas le droit de changer le Wi-Fi : sur le Pi, relance sh deploy/install.sh.'
      : Wf.scanning && nets.length ? 'Recherche des réseaux' + dots(k) : '';
  if (msg) k.txt(k.fit(msg, 752, 22), 24, 383, 22, V.note || Wf.perm === false ? AM : D);
  btn(k, 24, 412, 220, 54, 'Actualiser', () => { if (Date.now() - V.scanAt > 3000) scan(); else note('Pixel regarde déjà.'); });
  if (pages > 1) {
    btn(k, 280, 412, 70, 54, '<', () => { V.page = (V.page + pages - 1) % pages; });
    k.txt(`${V.page + 1}/${pages}`, 400, 426, 26, G, 'center');
    btn(k, 450, 412, 70, 54, '>', () => { V.page = (V.page + 1) % pages; });
  }
  btn(k, 556, 412, 220, 54, 'Fermer', close);
}
function drawAsk(k) {                     // the password is typed in the command bar: what to type it for stays in sight
  const { G, D, WH } = k.c;
  k.txt('MOT DE PASSE DU WI-FI', 24, 62, 24, D);
  k.txt(k.fit('« ' + V.asking + ' »', 752, 34), 24, 92, 34, WH);
  k.para(kioskPage ? 'Tape-le avec le clavier, en bas, puis ↵. Les majuscules comptent. ✕ pour annuler.'
    : 'Tape-le dans la barre de commande, puis Entrée. Échap pour annuler.', 24, 138, 752, 24, G, 28);
}
function drawJob(k, j) {
  const { G, D, AM, WH } = k.c, wait = j.state === 'connecting', ok = j.state === 'ok', want = wait ? 'reflechit' : ok ? 'content' : 'triste';
  k.face('wifi', want, want, 24, 96, 288, 162);
  k.txt(wait ? 'CONNEXION' + dots(k) : ok ? 'CONNECTÉ !' : 'PAS CONNECTÉ', 336, 100, 34, wait ? G : ok ? WH : AM, 'left', 'title');
  k.txt(k.fit('« ' + j.ssid + ' »', 440, 30), 336, 146, 30, WH);
  k.para(wait ? 'Pixel demande à entrer. Ça peut prendre jusqu\'à 40 secondes.' : j.msg || '', 336, 192, 440, 24, wait ? D : ok ? G : AM, 28);
  if (wait) return;
  if (j.code === 'password') btn(k, 336, 330, 220, 54, 'Retaper', () => { V.seen = j.id; ask(j.ssid); });
  btn(k, 576, 330, 200, 54, ok ? 'OK' : 'Retour', () => { V.seen = j.id; if (ok) close(); });
}
function draw(k) {
  k.header('Wi-Fi');
  if (V.asking) return drawAsk(k);
  const j = shownJob();
  if (j) return drawJob(k, j);
  drawList(k);
}

/* ---------- « Pas de Wi-Fi » over his face: no network up for 20 s; a touch opens the view ---------- */
function over(k) {
  if (!avail() || V.open || Wf.online || !(Wf.offline_at > 0) || k.srv() - Wf.offline_at < OFF_AFTER) return;
  if (L.scr !== 'visage' || L.boot >= 0 || Sc.menuOpen || Sc.addonTop || Sc.casting) return;
  const { AM, B } = k.c, x = 16, y = 10, w = 340, h = 36;
  k.X.globalAlpha = 0.75 + 0.25 * Math.sin(k.now / 600);
  k.box(x, y, w, h, AM, B);
  k.txt(k.fit(k.T.upper ? 'PAS DE WI-FI · TOUCHE ICI' : 'Pas de Wi-Fi · touche ici', w - 16, 22), x + w / 2, y + 7, 22, AM, 'center');
  k.X.globalAlpha = 1;
  k.hit(x, y, w, h, () => { L.dirty = true; k.fast(300); open(); });
}

function on(scr) {
  if (!V.open) return false;
  if (!avail() || scr !== V.scr) { close(); return false; }
  const idle = realNow() - L.inputAt > IDLE && !connecting();
  if (!V.asking && ((V.okAt && Date.now() - V.okAt > OK_SHOWN) || idle)) { close(); return false; }
  return L.boot < 0 && !Sc.casting;
}
K = Sc.addon({
  name: 'wifi',
  on,
  instead: () => true,
  busy: () => V.open,
  fps: calm => (!V.open ? 0 : Wf && (Wf.scanning || connecting()) ? 12 : calm),
  state,
  draw,
});
if (typeof document !== 'undefined') document.addEventListener('keydown', e => { if (V.open && !V.asking && e.key === 'Escape') close(); });

return { open, close, over, get shown() { return V.open; }, get available() { return avail(); } };
})();
