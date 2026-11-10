/* L'album de Pixel, on the screens: his own screen takes the photos (pixel/album.py keeps them; web/souvenirs.js shows them).
   window.PixelAlbum = { snap(reason, o), pose(), flash(q), over(K), store, ... }:
   - snap(reason): a photo of his screen now, or as soon as it can be taken (within a few seconds, else none). Only Pixel's own
     screen captures: the Pi's (?kiosk=1), Pixel sans Pi (the phone app's own Pixel) and Pixel Lab; anywhere else snap()
     does nothing. Other features call it defensively for their special moments (a friend's visit, a won game, a new look):
       window.PixelAlbum && window.PixelAlbum.snap('ami');        // reason: [a-z][a-z0-9-], 24 at most
     Never during a cast (nothing of what you cast is copied), only on his face screen, never with the quick menu, a question
     of his or the album open, never while he sleeps, nor during a scene that shows a notification or an agenda title; the
     info line (lights, weather, the agenda's next title) and the banner are not drawn for the shot (screens.js L.shot).
     Automatic photos: one every 20 s at most.
   - the shot: the canvas at 800 x 480 (640 x 384 without a Pi), WebP (JPEG where a browser cannot make WebP), quality 0.8
     and less until it is under 120 Ko; then POST /api/album (the Pi's screen), or the in-page album (Pixel Lab: in memory;
     Pixel sans Pi: IndexedDB, or a small localStorage key; never in the state S, which the app copies as JSON);
   - pose(): « prends une photo »: he poses (scene album-pose: « Cheese ! »), his own screen shoots just before the flash;
   - over(K): screens.js, after each screen (never over a cast): the flash, then a little polaroid of the new photo.
   Loaded after screens.js, before web/souvenirs.js and app.js; in the lab, before demo-hub.js. */
window.PixelAlbum = (() => {
const Sc = typeof Screens !== 'undefined' ? Screens : null;
const qs = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const LAB = typeof document !== 'undefined' && !!document.getElementById('lab');
const KIOSK = qs.has('kiosk') && !LAB, LOCAL = !!window.PIXEL_LOCAL;
const HOME = KIOSK || LOCAL || LAB;                  // Pixel's own screen: the one that takes the photos
const REASON = /^[a-z][a-z0-9-]{0,23}$/, MAX = 120 * 1024, AUTO_GAP = 20000, WAIT = 8000;
const SIZE = LOCAL ? [640, 384] : [800, 480];
const L = Sc ? Sc.local : {}, PER = Sc ? Sc.persona : null;
const realNow = () => (window.PixelClock ? window.PixelClock.real() : performance.now());
const Q = { pending: null, autoAt: -1e9, busy: false, flash: null, shown: null, n: 0, last: '' };

/* the scenes that show a banner's text or an agenda title in his bubble: no photo meanwhile */
const PRIVATE = (() => {
  const ids = new Set(['rdv', 'rdv-fin']);
  try { for (const e of (PER && PER.events) || []) if (['notif', 'cast', 'action', 'typing'].includes(e.id)) for (const s of e.scenes) ids.add(s); } catch (e) { /* none */ }
  return ids;
})();
function why() {                                     // why no photo can be taken now ('' when it can)
  if (!Sc || !HOME) return 'ailleurs';
  if (Sc.casting) return 'cast';
  if (L.scr !== 'visage' || L.boot >= 0) return 'ecran';
  if (Sc.menuOpen) return 'menu';
  if (L.sleepy) return 'dodo';
  const SV = window.PixelSouvenirs; if (SV && ('drawn' in SV ? SV.drawn : SV.view && SV.view())) return 'question';   // on screen (one waiting under a visit is not)
  const cur = PER && PER.state.cur; if (cur && PRIVATE.has(cur)) return 'prive';
  if (SV && SV.asleep && SV.asleep()) return 'dodo';                // he sleeps (habitudes, read defensively)
  return '';
}
function snap(reason = 'photo', o = {}) {
  if (!HOME || !Sc) return false;
  reason = typeof reason === 'string' && REASON.test(reason) ? reason : 'photo';
  const manual = reason === 'photo';
  if (!manual && (Date.now() - Q.autoAt < AUTO_GAP || (Q.pending && Q.pending.manual))) return false;   // one taken every 20 s at most
  const t = realNow();
  Q.pending = { reason, manual, at: t + Math.max(0, Number(o.delay) || 0), until: t + Math.max(0, Number(o.delay) || 0) + (o.wait || WAIT), scene: o.scene || '', e: o.e || 0 };
  return true;
}
setInterval(() => {                                  // the pending photo: as soon as it can be taken
  const p = Q.pending; if (!p || Q.busy) return;
  const t = realNow();
  if (p.scene) {                                     // the pose: just before the flash, while he still poses
    const cur = PER && PER.state.cur;
    if (cur !== p.scene) { if (t > p.at + 1500) Q.pending = null; return; }
    if ((PER.current().e || 0) < p.e) return;
  } else if (t < p.at) return;
  if (why()) { if (t > p.until) Q.pending = null; return; }
  Q.pending = null; if (!p.manual) Q.autoAt = Date.now(); shoot(p.reason);
}, 60);

/* ---------- the shot: one frame drawn without the info line and the banner, then copied ---------- */
function shoot(reason) {
  const cv = document.getElementById('crt'); if (!cv || !cv.width) return;
  Q.busy = true; L.shot = true; L.dirty = true;
  requestAnimationFrame(() => {                      // after screens.js's frame (registered before this one): it drew with L.shot
    let off = null;
    try {
      if (!why()) {
        off = document.createElement('canvas'); [off.width, off.height] = SIZE;
        const g = off.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        g.drawImage(cv, 0, 0, off.width, off.height);
      }
    } catch (e) { off = null; }
    L.shot = false; L.dirty = true;
    if (!off) { Q.busy = false; return; }
    Q.shown = { c: off, t: realNow() };             // the little polaroid
    encode(off).then(b => (b ? save(b, reason, off.width, off.height) : null)).catch(e => console.warn('Pixel: album', e)).finally(() => { Q.busy = false; });
  });
}
const toBlob = (c, type, q) => new Promise(res => { try { c.toBlob(b => res(b), type, q); } catch (e) { res(null); } });
async function encode(c) {
  for (const q of [0.8, 0.7, 0.6, 0.5, 0.4]) {
    let b = await toBlob(c, 'image/webp', q);
    if (b && b.type !== 'image/webp') b = await toBlob(c, 'image/jpeg', q);   // a browser with no WebP encoder: JPEG
    if (b && b.size <= MAX) return b;
  }
  return null;
}
async function save(blob, reason, w, h) {
  Q.n++; Q.last = reason;
  const M = window.PixelSouvenirs && window.PixelSouvenirs.mirror;   // Pixel Lab, Pixel sans Pi: the in-page album
  if (M && M.addPhoto) return M.addPhoto(blob, reason, w, h);
  let t = null; try { t = localStorage.getItem('pixel_t'); } catch (e) { /* none */ }
  const r = await fetch('/api/album?raison=' + encodeURIComponent(reason), { method: 'POST', body: blob, cache: 'no-store',
    headers: { 'Content-Type': blob.type, ...(t ? { 'X-Pixel-Token': t } : {}) } });
  if (!r.ok) console.warn('Pixel: album', r.status);
  return r.ok;
}

/* ---------- « prends une photo »: he poses on every screen; his own screen shoots just before the flash ---------- */
function pose() {
  if (!PER) return false;
  L.sleepy = false; L.local = null; L.pack = null;
  PER.play('album-pose');
  if (HOME) snap('photo', { scene: 'album-pose', e: 2500, wait: 4000 });
  return true;
}

/* ---------- the flash and the little polaroid (screens.js calls over(K) after each screen, never over a cast) ---------- */
function flash(q) { Q.flash = { q: Math.max(0, Math.min(1, q)), t: realNow() }; L.dirty = true; }
function over(K) {
  if (L.shot) return;                                // not in the photo itself
  const t = realNow(), X = K.X;
  if (Q.flash && t - Q.flash.t < 120 && Q.flash.q > 0) {
    X.save(); X.shadowBlur = 0; X.globalAlpha = Q.flash.q * 0.9; X.fillStyle = '#ffffff'; X.fillRect(0, 0, K.W, K.H); X.restore();
    K.fast(200);
  }
  const s = Q.shown; if (!s) return;
  const e = t - s.t; if (e > 2600) { Q.shown = null; return; }
  const k = Math.min(1, e / 260) * (1 - Math.max(0, (e - 2200) / 400)), w = 132, h = 80, x = 22, y = 62 + (1 - k) * -40;
  X.save(); X.shadowBlur = 0; X.globalAlpha = Math.max(0, k);
  X.translate(x + w / 2, y + h / 2); X.rotate(-0.06); X.translate(-(x + w / 2), -(y + h / 2));
  X.fillStyle = '#fbfaf5'; X.fillRect(x - 6, y - 6, w + 12, h + 26);
  X.drawImage(s.c, x, y, w, h);
  X.fillStyle = '#2c2c30'; X.font = K.T.font(16); X.textAlign = 'center'; X.textBaseline = 'top'; X.fillText('Clic !', x + w / 2, y + h + 3);
  X.restore(); K.fast(100);
}

/* ---------- the in-page album (Pixel Lab: in memory; Pixel sans Pi: IndexedDB, or a small localStorage key) ---------- */
const store = (() => {
  const mem = new Map();                             // id -> { id, t, raison, fav, w, h, blob }
  let db = null, mode = LOCAL ? 'idb' : 'mem';
  const KEY = 'pixel_album', LS_MAX = 1200 * 1024;
  const idb = () => new Promise((res, rej) => {
    if (db) return res(db);
    if (!window.indexedDB) return rej(new Error('no IndexedDB'));
    const r = indexedDB.open('pixel-album', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('photos', { keyPath: 'id' }); };
    r.onsuccess = () => { db = r.result; res(db); }; r.onerror = () => rej(r.error);
  });
  const tx = (m, fn) => idb().then(d => new Promise((res, rej) => { const t = d.transaction('photos', m), s = t.objectStore('photos'), out = fn(s); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); }));
  const toData = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
  const fromData = async s => (await fetch(s)).blob();
  function lsRead() { try { const a = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  async function lsWrite(list) {
    const out = [];
    for (const p of list) out.push({ id: p.id, t: p.t, raison: p.raison, fav: p.fav, w: p.w, h: p.h, data: p.data || await toData(p.blob) });
    while (JSON.stringify(out).length > LS_MAX && out.some(p => !p.fav)) out.splice(out.findLastIndex(p => !p.fav), 1);   // too big: the oldest that is not a favourite
    try { localStorage.setItem(KEY, JSON.stringify(out)); } catch (e) { /* full: what is in memory stays for now */ }
  }
  async function all() {
    if (mode === 'idb') {
      try { const list = await tx('readonly', s => s.getAll()); return (list || []).filter(p => p && p.blob).sort((a, b) => b.t - a.t); }
      catch (e) { mode = 'ls'; }
    }
    if (mode === 'ls') {
      const out = [];
      for (const p of lsRead()) { try { out.push({ ...p, blob: await fromData(p.data) }); } catch (e) { /* a broken one */ } }
      mem.clear(); for (const p of out) mem.set(p.id, p);
      return out.sort((a, b) => b.t - a.t);
    }
    return [...mem.values()].sort((a, b) => b.t - a.t);
  }
  async function put(p) {
    mem.set(p.id, p);
    if (mode === 'idb') { try { await tx('readwrite', s => s.put(p)); return; } catch (e) { mode = 'ls'; } }
    if (mode === 'ls') await lsWrite([...mem.values()].sort((a, b) => b.t - a.t));
  }
  async function del(id) {
    mem.delete(id);
    if (mode === 'idb') { try { await tx('readwrite', s => s.delete(id)); return; } catch (e) { mode = 'ls'; } }
    if (mode === 'ls') await lsWrite([...mem.values()].sort((a, b) => b.t - a.t));
  }
  return { all, put, del, get mode() { return mode; }, set mode(m) { mode = m; } };
})();

return {
  snap, pose, flash, over, store, why, home: HOME,
  get pending() { return Q.pending ? { ...Q.pending } : null; }, get taken() { return Q.n; }, get lastReason() { return Q.last; },
  get busy() { return Q.busy; },
};
})();
