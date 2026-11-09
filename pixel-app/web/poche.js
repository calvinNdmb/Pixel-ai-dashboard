/* Pixel de poche: hold the phone sideways and it becomes a second, living Pixel, a pet in your pocket.
   The phone already draws Pixel's screen (screens.js on the #crt canvas: the same theme, the 52 animations, his personality
   and every scene pack, fed by the same snapshots). Sideways, or with the "Pixel de poche" button, this file shows that
   canvas alone, full screen, on his face, and adds what a phone has and the Pi has not:
   - the Pi's touch (the zones of his face, taps in a row, a stroke), plus a long press, which pets him;
   - shaken: dizzy; tilted: he leans and slides; picked up after lying still, or back out of the pocket: "te revoilà";
     its battery (low, charging); the Pi out of reach: he lives on alone, says he is far from home, and comes back quietly;
   - the screen stays on while he is awake (Wake Lock; in the Pixel app, the app keeps it on), full screen and held sideways
     where the phone allows it (Android; on an iPhone a page can do neither), a crisp canvas at the phone's pixel density,
     no scroll, no zoom, no selection.
   A phone gives its motion, its battery and the Wake Lock only to a secure page (https, or localhost): on the Pi's plain
   http address he still lives, is touched and petted, but he cannot feel the phone, and he says so once (README).
   The Pixel app (pixel-mobile 1.1) lends him those senses even on http: the page tells it {poche: true/false}, and while he
   is shown it holds the phone sideways, hides the system bars and feeds PixelPoche.native (window.PixelApp.senses).
   The two Pixels know each other (pixel/poche.py): a touch, a cuddle or a shake of one is news for the other (jealous!),
   and the voyage sends Pixel from the Pi into your pocket for a minute, and back. Their scenes: web/scenes/poche.js.
   Loaded after screens.js and before app.js (PixelPoche.app) or the lab's scripts (PixelPoche.lab, lab/poche-lab.js).
   Silent: son.js only plays on the Pi's own screen (or with ?son=1). */
window.PixelPoche = (() => {
const Sc = typeof Screens !== 'undefined' ? Screens : null; if (!Sc) return null;   // screens.js (a global const, not on window)
const L = Sc.local, PER = Sc.persona, cv = document.getElementById('crt'), W = 800, H = 480;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const realNow = () => (window.PixelClock ? window.PixelClock.real() : performance.now());   // the lab's slow motion
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MQ = { land: matchMedia('(orientation: landscape)'), touch: matchMedia('(hover: none) and (pointer: coarse)') };   // a phone or a tablet
const SECURE = window.isSecureContext !== false;   // http on the home network: no motion, battery nor Wake Lock for the page
const inApp = () => !!window.ReactNativeWebView;   // the Pixel phone app (pixel-mobile, an Android WebView)
const appSenses = () => inApp() && !!(window.PixelApp && window.PixelApp.senses);   // the app's motion and battery (PixelPoche.native)
const toApp = m => { try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch {} };
/* the sides of the screen take the theme's background (themes.js): a phone is wider than Pixel's 5:3 */
const BG = (() => {
  try {
    const t = window.PixelThemes({ X: document.createElement('canvas').getContext('2d'), RM: true, get now() { return 0; }, blinkP: () => 9, txt() {}, wrap: () => [], fit: s => s });
    return Object.fromEntries(Object.values(t).filter(x => x && x.id).map(x => [x.id, (x.c && x.c.bg) || '#000']));
  } catch { return {}; }
})();

let send = () => {}, isApp = false, kioskPage = false, frame = null;
let where = null;              // which Pixel this screen is: 'pi' (the Pi's screen, the lab), 'poche' (the phone sideways), null (the phone's remote)
let on = false, how = '';      // how: 'auto' (follows the rotation), 'fixe' (the button, phone upright), 'labo' (the lab's phone frame)
let before = null, P = null, offset = 0, seenEv = -1, seenVoy = -1, visitUntil = 0, beatAt = 0, dismissed = false, lastBg = '';
let connected = true, greeted = false;   // the app: is its WebSocket open (the lab's fake server always is), did the server hear our hello
const srv = () => Date.now() + offset;
const say = (name, data = {}) => Sc.event(name, { ...data, ici: where || 'pi' });     // an event for his personality (persona.js EVENTS)
const play = id => { if (!PER) return; L.local = null; L.pack = null; L.sleepy = false; PER.play(id); };

/* ---------- the two Pixels: news from the other one, the voyage ---------- */
const visiting = () => { const v = P && P.poche && P.poche.voyage; return !!v && v.to === 'poche' && srv() < v.until; };   // Pixel is in your pocket
const awayPi = () => where === 'pi' && visiting() && !!PER && PER.state.cur === 'poche-part';                          // the Pi's screen is empty
const lastNews = {}; let callAt = 0;
function news(kind) {               // this Pixel was touched: a word to the other one, not too often (the server also checks)
  if (!where) return;
  const q = P && P.poche, t = Date.now();
  if (where === 'pi' && !(q && q.here && P.server_now - q.here < 5 * 60000)) return;   // no Pixel de poche around: nobody to tell
  if (t - (lastNews[kind] || 0) < 4000) return;
  lastNews[kind] = t; send('poche.touch', { kind, by: where });
}
function callBack() { if (Date.now() - callAt < 3000) return; callAt = Date.now(); send('poche.voyage', { to: 'pi' }); }   // touch the Pi's empty screen: he comes home
const HEARD = { pi: { bonjour: 'jumeau-bonjour', tape: 'jumeau-tape', caresse: 'jumeau-caresse', secoue: 'jumeau-secoue' }, poche: { tape: 'jumeau-tape', caresse: 'jumeau-caresse' } };
function state(p) {                 // every snapshot (app.js through watch(), the lab through its listener)
  if (!p) return;
  const first = !P; P = p; offset = (p.server_now || Date.now()) - Date.now();
  const bg = BG[p.view && p.view.theme] || BG.retro || '#000';
  if (bg !== lastBg) { lastBg = bg; document.documentElement.style.setProperty('--poche-bg', bg); if (on && how !== 'labo') { tint(true); if (inApp()) toApp({ poche: true, bg }); } }
  if (on) { L.scr = 'visage'; if (how !== 'labo') L.kiosk = true; label(); }        // his face only; he dozes off like on the Pi
  const q = p.poche; if (!q) return;
  const ev = q.ev, v = q.voyage, fresh = t => p.server_now - t < 10000;
  if (first) { seenEv = ev ? ev.t0 : 0; seenVoy = v ? v.t0 : 0; return; }          // old news stays old
  if (ev && ev.t0 !== seenEv) { seenEv = ev.t0; const n = (HEARD[where] || {})[ev.kind]; if (n && ev.by !== where && fresh(ev.t0) && !awayPi()) say(n); }
  if (v && v.t0 !== seenVoy) {
    seenVoy = v.t0; if (!where || !fresh(v.t0)) return;
    visitUntil = where === 'poche' && v.to === 'poche' ? v.until : 0;
    play(where === 'pi' ? (v.to === 'poche' ? 'poche-part' : 'poche-revient') : (v.to === 'poche' ? 'poche-arrive' : 'poche-rentre'));
    label();
  }
}
/* his personality, seen from here: a touch or a cuddle is news for his twin; on the Pi's empty screen, a touch calls him back;
   and he leans as you tilt the phone (L.lean when no scene plays, added to the scene's motion when one does) */
const lean = { x: 0, r: 0, tx: 0, tr: 0 };
if (PER) {
  const tap0 = PER.tap, pet0 = PER.pet, input0 = PER.input, update0 = PER.update;
  PER.tap = (p, box, ctx) => { if (awayPi()) { callBack(); return true; } const r = tap0(lean.x ? { x: p.x - lean.x, y: p.y } : p, box, ctx); news('tape'); return r; };
  PER.pet = () => { if (awayPi()) { callBack(); return true; } const r = pet0(); news('caresse'); return r; };
  PER.input = info => (awayPi() ? '' : input0(info));                               // no "te revoilà" from an empty screen
  PER.update = (dt, ctx) => { if (on) L.scr = 'visage'; return leaning(update0(dt, ctx), dt); };
}
function leaning(v, dt) {
  const k = 1 - Math.exp(-dt / 220);
  lean.x += (lean.tx - lean.x) * k; lean.r += (lean.tr - lean.r) * k;
  if (Math.abs(lean.x) < 0.5 && !lean.tx) lean.x = 0;
  if (Math.abs(lean.r) < 0.003 && !lean.tr) lean.r = 0;
  if (Math.abs(lean.tx - lean.x) > 1.5 || Math.abs(lean.tr - lean.r) > 0.004) L.fastUntil = Math.max(L.fastUntil || 0, realNow() + 150);   // smooth while he moves
  L.lean = lean.x || lean.r ? { x: Math.round(lean.x), y: 0, s: 1, r: lean.r, f: false, sx: 1, sy: 1 } : null;
  return L.lean && v && v.id ? { ...v, m: { ...v.m, x: v.m.x + lean.x, r: v.m.r + lean.r } } : v;
}

/* ---------- the phone's senses ---------- */
let glisseAt = -1e9, tiltT = 0;
function tiltTo(down) {             // down: how hard gravity pulls him to the right of the screen, in m/s² (negative: to the left)
  const a = Math.abs(down) < 1.4 ? 0 : down - Math.sign(down) * 1.4;              // a hand is never quite still
  lean.tx = RM || !on ? 0 : clamp(a / 7, -1, 1) * 150;
  lean.tr = RM || !on ? 0 : -Math.asin(clamp(a / 9.81, -1, 1)) * 0.45;           // he stays a little upright, like a standing toy
  if (on && Math.abs(down) > 6.5 && performance.now() - glisseAt > 8000) { glisseAt = performance.now(); say('poche-glisse', { side: Math.sign(down) }); }
}
let sgn = 0, lastA = null, peaks = [], shakeAt = -1e9, stillSince = 0;
function feel(rx, ry, rz) {         // the phone's acceleration with gravity, in the screen's axes (x to the right, y up)
  const t = performance.now();
  if (Math.abs(ry) > 5 && Math.abs(rx) < 4) sgn = clamp(sgn + Math.sign(ry), -40, 40);   // held upright: learn which way is up (Android and iOS disagree)
  tiltTo(-(sgn < 0 ? -1 : 1) * rx);
  const d = lastA ? Math.hypot(rx - lastA[0], ry - lastA[1], rz - lastA[2]) : 0, m = Math.hypot(rx, ry, rz); lastA = [rx, ry, rz];
  if ((d > 12 || Math.abs(m - 9.81) > 9) && (!peaks.length || t - peaks[peaks.length - 1] > 90)) peaks = [...peaks.filter(x => t - x < 1200), t];
  if (peaks.length >= 3 && t - shakeAt > 3000) { shakeAt = t; peaks = []; shake(); }   // three jolts within a second: shaken
  if (d < 0.35) { if (!stillSince) stillSince = t; }
  else if (d > 1.5) { if (stillSince && t - stillSince > 120000) revoila(); stillSince = 0; }   // picked up again after lying still
}
function onMotion(e) {
  const a = e.accelerationIncludingGravity; if (!a || a.x == null) return;
  const ang = ((screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0) * Math.PI / 180, c = Math.cos(ang), s = Math.sin(ang);
  feel(a.x * c - a.y * s, a.x * s + a.y * c, a.z || 0);
}
let feeling = false;
function motion(want) {
  want = want && on && how !== 'labo' && !document.hidden;
  if (want === feeling) return; feeling = want;
  if (want) { if (!appSenses()) addEventListener('devicemotion', onMotion); } else { removeEventListener('devicemotion', onMotion); lastA = null; peaks = []; stillSince = 0; tiltTo(0); }
}
let asked = false;
function askMotion() {              // iPhone: motion needs a yes, asked on a touch (an http page never gets it: no use asking)
  const D = window.DeviceMotionEvent;
  if (asked || !SECURE || !D || typeof D.requestPermission !== 'function') return;
  asked = true;
  D.requestPermission().then(r => { if (r === 'granted') { motion(false); motion(true); } }, () => { asked = false; });   // failed (no touch...): again on the next touch
}
function shake() { if (!on) return; Sc.input(); say('poche-secousse'); news('secoue'); }
function revoila() {                // back from the pocket (or picked up again) after a while
  if (!on) return;
  const woke = Sc.input(), c = PER && PER.state.cur, g = c && (PER.scenes.find(s => s.id === c) || {}).group;
  if (!woke && g !== 'retour') say('poche-revoila');
}
let bat = null, wasCharging = null, lowSaid = 100;
function onBattery() {              // low: he says so at 15 % and at 5 %; plugged in: he is happy
  if (!bat) return;
  const lvl = Math.round(bat.level * 100), ch = !!bat.charging;
  if (on && wasCharging === false && ch) say('poche-recharge', { level: lvl });
  if (ch) lowSaid = 100;
  else if (on && ((lvl <= 15 && lowSaid > 15) || (lvl <= 5 && lowSaid > 5))) { lowSaid = lvl; say('poche-batterie', { level: lvl }); }
  wasCharging = ch;
}
let online = true, saidFar = false, farT = 0;
function link(ok, delay = 4000) {   // the Pi reachable or not: he goes on living here, and says so after a few seconds
  if (ok === online) return; online = ok; clearTimeout(farT);
  if (!ok) farLater(delay);
  else if (saidFar) { saidFar = false; if (on) say('poche-maison'); }
}
function farLater(delay) { clearTimeout(farT); farT = setTimeout(() => { if (online || !on || saidFar) return; if (say('poche-loin')) saidFar = true; else farLater(3000); }, delay); }   // busy: a bit later
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); motion(false); wake(); return; }   // the wake lock goes (the browser drops it too), the drawing pauses
  if (!on) return;
  motion(true); wake();
  if (hiddenAt && Date.now() - hiddenAt > 90000) revoila();
  hiddenAt = 0;
});

/* ---------- the screen: awake, full screen, sideways, crisp ---------- */
let lock = null, asking = false, lockFailAt = -1e9, appAwake = false;
async function wake() {             // the screen stays on while he is shown and awake; asleep, the phone may sleep too
  const want = on && how !== 'labo' && !document.hidden && !L.sleepy;
  if (inApp() && want !== appAwake) {                                                 // the Pixel app: an Android WebView has no Wake Lock, the app
    appAwake = want;                                                                  // keeps the screen on in Pixel mode (pixel-mobile/src/plugs.ts)
    toApp({ mode: want ? 'pixel' : document.body.dataset.mode || 'both' });
  }
  if (!want) { if (lock) { const l = lock; lock = null; l.release().catch(() => {}); } return; }
  if (lock || asking || !navigator.wakeLock || Date.now() - lockFailAt < 30000) return;
  asking = true;
  try {
    const l = await navigator.wakeLock.request('screen');
    if (on && !document.hidden && !L.sleepy) { lock = l; l.addEventListener('release', () => { if (lock === l) lock = null; }); } else l.release().catch(() => {});
  } catch { lockFailAt = Date.now(); }                                               // refused (battery saver...): the phone sleeps as usual
  asking = false;
}
function full(sideways) {           // on a touch: full screen, and held sideways when asked with the button (Android)
  if (appSenses()) return;                                                            // the app does both itself ({poche: true})
  const lockIt = () => { if (sideways) try { screen.orientation.lock('landscape').catch(() => {}); } catch {} };
  try {
    if (document.fullscreenEnabled && !document.fullscreenElement) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(lockIt, () => {});
    else lockIt();
  } catch {}
}
function unfull() {
  try { screen.orientation.unlock(); } catch {}
  try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch {}
}
let probe = null;
function insets() {                 // the notch and the rounded corners (safe areas)
  if (!probe) { probe = el('div'); probe.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'; document.body.append(probe); }
  const s = getComputedStyle(probe), n = v => parseFloat(v) || 0;
  return { t: n(s.paddingTop), r: n(s.paddingRight), b: n(s.paddingBottom), l: n(s.paddingLeft) };
}
function layout() {                 // the 800x480 screen as big as it fits, on whole device pixels: a crisp canvas, never stretched
  if (!on || how === 'labo' || !cv) return;
  const i = insets(), aw = Math.max(1, innerWidth - i.l - i.r), ah = Math.max(1, innerHeight - i.t - i.b), dpr = window.devicePixelRatio || 1;
  const fit = Math.min(aw * dpr / W, ah * dpr / H), s = clamp(Math.floor(fit * 32) / 32, 0.5, 3), k = fit > 3 ? fit : s;   // 1/32 steps: exact sizes
  const cw = W * k / dpr, ch = H * k / dpr, x = Math.round((i.l + (aw - cw) / 2) * dpr) / dpr, y = Math.round((i.t + (ah - ch) / 2) * dpr) / dpr;
  Object.assign(cv.style, { left: x + 'px', top: y + 'px', width: cw + 'px', height: ch + 'px' });
  if (L.scale !== s) { L.scale = s; dispatchEvent(new Event('resize')); }         // screens.js: a new backing store
}
function unlayout() { if (!cv) return; for (const k of ['left', 'top', 'width', 'height']) cv.style.removeProperty(k); if (L.scale) { L.scale = 0; dispatchEvent(new Event('resize')); } }
const meta = n => document.querySelector(`meta[name="${n}"]`), VP = meta('viewport'), TC = meta('theme-color'), VP0 = VP && VP.content, TC0 = TC && TC.content;
function noZoom(b) { if (VP) VP.content = b ? VP0 + ',maximum-scale=1,user-scalable=no' : VP0; }
function tint(b) { if (TC) TC.content = b ? (lastBg || TC0) : TC0; }
document.addEventListener('touchmove', e => { if (on && how !== 'labo' && e.cancelable) e.preventDefault(); }, { passive: false });   // no scroll, no pull-to-refresh
document.addEventListener('gesturestart', e => { if (on && how !== 'labo') e.preventDefault(); });                                      // no pinch zoom (iPhone)
if (cv) cv.addEventListener('contextmenu', e => { if (on) e.preventDefault(); });

/* ---------- the long press: a cuddle, again every 1.7 s while the finger stays (strokes are screens.js's) ---------- */
let press = null, pressT = 0, purrT = 0;
const onFace = p => L.scr === 'visage' && L.boot < 0 && !Sc.menuOpen && Math.abs(p.x - 400) < 330 && p.y > 40 && p.y < 430;
function stopPress() { clearTimeout(pressT); clearInterval(purrT); press = null; }
function longPress() {
  if (!press) return;
  L.petted = true; L.pack = null; L.local = null;                                     // the release is not a tap
  if (L.sleepy) { Sc.input(); stopPress(); return; }                                 // asleep: the press wakes him up first
  if (PER) PER.pet();
  purrT = setInterval(() => { if (press && PER) { L.petted = true; PER.pet(); } }, 1700);
}
if (cv) {
  cv.addEventListener('pointerdown', e => {
    stopPress(); if (!(isApp || on) || !e.isPrimary) return;                          // the lab: only in its phone frame (its kiosk keeps the long press for its menu)
    const p = Sc.toCanvas(e); if (!onFace(p)) return;
    press = { x: p.x, y: p.y, id: e.pointerId }; pressT = setTimeout(longPress, 600);
  });
  cv.addEventListener('pointermove', e => { if (press && press.id === e.pointerId) { const p = Sc.toCanvas(e); if (Math.hypot(p.x - press.x, p.y - press.y) > 18) stopPress(); } });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) cv.addEventListener(t, stopPress);
  cv.addEventListener('pointerup', () => { if (on && how !== 'labo') { askMotion(); if (!fullAsked) { fullAsked = true; full(false); } } });   // what a page may only ask on a touch
}
let fullAsked = false;

/* ---------- on and off ---------- */
let hudEl = null, goBtn = null;
function label() {
  if (!goBtn) return;
  const v = visiting(), t = v ? 'Rentre !' : 'Viens !';
  if (goBtn.textContent !== t) goBtn.textContent = t;
  goBtn.title = v ? 'Renvoie Pixel sur l’écran du Pi' : 'Fais venir le Pixel du Pi dans ta poche'; goBtn.setAttribute('aria-label', goBtn.title);
}
function hud(show) {                // two small buttons in the corners: back to the remote, and the voyage
  if (show && !hudEl && cv) {
    hudEl = el('div', 'poche-hud');
    const x = el('button', 'poche-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Revenir à la télécommande'); x.title = 'Revenir à la télécommande';
    x.addEventListener('click', () => { dismissed = sideways(); leave(); });
    goBtn = el('button', 'poche-voyage'); goBtn.type = 'button';
    goBtn.addEventListener('click', () => send('poche.voyage', { to: visiting() ? 'pi' : 'poche' }));
    hudEl.append(x, goBtn); cv.parentElement.append(hudEl);
  }
  if (hudEl) hudEl.hidden = !show;
  label();
}
let noteEl = null;
function note() {                   // on http, once: why he does not feel the phone
  if (SECURE || noteEl || !hudEl || appSenses()) return;
  noteEl = el('p', 'poche-note', `Adresse en http : le téléphone ne lui prête ni ses mouvements, ni sa batterie${inApp() ? '' : ', ni l’écran allumé'}. Il faut une adresse en https.`);
  noteEl.setAttribute('role', 'status'); noteEl.addEventListener('click', () => { noteEl.hidden = true; });
  hudEl.append(noteEl); setTimeout(() => { noteEl.hidden = true; }, 9000);
}
let helloAt = -1e9;
function hello() {                  // his twin waves, once a minute at most (turning the phone to and fro is no new hello): else "still here"
  const t = Date.now(), kind = t - helloAt > 60000 ? 'bonjour' : 'la';
  if (kind === 'bonjour') helloAt = t;
  send('poche.touch', { kind, by: 'poche' }); greeted = true; beatAt = t;
}
function enter(h) {
  if (on) return;
  on = true; how = h; where = 'poche'; before = { scr: L.scr, kiosk: L.kiosk }; fullAsked = false;
  Sc.menu(false); L.scr = 'visage';
  if (h === 'labo') { if (frame) frame.classList.add('poche'); }
  else {
    document.documentElement.classList.add('poche'); document.body.classList.add('poche');
    if (P) L.kiosk = true;                                                          // he dozes off when left alone (no boot splash: that is for the Pi)
    if (inApp()) toApp({ poche: true, bg: lastBg || null });                        // the app: sideways, no system bars, its senses
    noZoom(true); tint(true); hud(true); layout(); motion(true); wake(); note();
    setTimeout(onBattery, 6000);
    if (!online) farLater(4000);
  }
  const c0 = PER && PER.state.cur; Sc.input();                                      // back after a long while: his usual "te revoilà"
  const last = Number(store.get('pixel.poche')) || 0; store.set('pixel.poche', String(Date.now()));
  if (PER && PER.state.cur === c0 && Date.now() - last > 10 * 60000) say('poche-allume');   // or his hello from the phone
  beatAt = Date.now(); greeted = connected; if (connected) hello();                 // his twin waves (else on connecting)
}
function leave() {
  if (!on) return;
  const h = how; on = false; how = ''; where = kioskPage || h === 'labo' ? 'pi' : null; visitUntil = 0; stopPress(); tiltTo(0);
  if (h === 'labo') { if (frame) frame.classList.remove('poche'); }
  else {
    document.documentElement.classList.remove('poche'); document.body.classList.remove('poche');
    L.kiosk = before ? before.kiosk : false; L.sleepy = false;
    noZoom(false); tint(false); hud(false); unlayout(); motion(false); wake(); unfull();
    if (inApp()) toApp({ poche: false });
  }
  if (before) L.scr = before.scr;
  send('poche.touch', { kind: 'au-revoir', by: 'poche' });
}
const sideways = () => {            // the phone itself turned (not an upright phone in split screen or squashed by its keyboard), its page too
  const o = screen.orientation && screen.orientation.type, a = window.orientation;   // window.orientation: older iPhones
  return MQ.land.matches && (o ? o.startsWith('landscape') : typeof a === 'number' ? Math.abs(a) === 90 : true);
};
const typing = () => { const a = document.activeElement; return !!a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable); };
let orientT = 0;
function orientSoon() { clearTimeout(orientT); orientT = setTimeout(orient, 400); }   // once the turn has settled: a wobble of auto-rotate is no turn
function orient() {                 // sideways: the Pixel de poche; upright again: the remote
  if (!isApp || kioskPage || typing()) return;                                        // typing a command: the keyboard is up, not the Pixel de poche
  if (sideways()) { if (on) { if (how === 'fixe') how = 'auto'; } else if (MQ.touch.matches && !dismissed) enter('auto'); }
  else { dismissed = false; if (on && how === 'auto') leave(); }
}
setInterval(() => {
  if (!on) return;
  L.scr = 'visage'; label();
  if (how !== 'labo') wake();
  if (visitUntil && srv() >= visitUntil) { visitUntil = 0; play('poche-rentre'); label(); }   // the minute is up: he walks home
  if (how !== 'labo' && !document.hidden && Date.now() - beatAt > 180000) { beatAt = Date.now(); send('poche.touch', { kind: 'la', by: 'poche' }); }
}, 1000);

const api = {
  /* app.js: the phone (or the Pi's screen with kiosk) */
  app(o) {
    isApp = true; send = o.send || send; kioskPage = !!o.kiosk; where = kioskPage ? 'pi' : null; connected = false;
    if (kioskPage) return api;
    const b = el('button', 'poche-go', 'Pixel de poche'); b.type = 'button'; b.title = 'Pixel en grand, à câliner : ou tourne ton téléphone';
    b.addEventListener('click', () => { dismissed = false; askMotion(); enter(sideways() ? 'auto' : 'fixe'); full(true); fullAsked = true; });   // full screen, sideways where it can
    const badge = document.querySelector('.mfoot .badge'); if (badge) badge.after(b);
    MQ.land.addEventListener('change', orientSoon);
    if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', orientSoon); else addEventListener('orientationchange', orientSoon);
    document.addEventListener('focusout', orientSoon);                               // the keyboard goes: was the phone turned meanwhile?
    addEventListener('resize', layout); if (window.visualViewport) visualViewport.addEventListener('resize', layout);
    addEventListener('offline', () => link(false, 1500));                            // no network at all; "online" proves nothing: only the Pi's answer does
    if (navigator.getBattery) navigator.getBattery().then(x => { bat = x; x.addEventListener('levelchange', onBattery); x.addEventListener('chargingchange', onBattery); onBattery(); }, () => {});
    setTimeout(orient);                                                               // once app.js is ready (its mode said to the Pixel app first)
    return api;
  },
  watch(ws) {                       // app.js: each WebSocket, after its own handlers (so its snapshot is already drawn)
    ws.addEventListener('open', () => { connected = true; link(true); if (on) { if (greeted) send('poche.touch', { kind: 'la', by: 'poche' }); else hello(); greeted = true; beatAt = Date.now(); } });
    ws.addEventListener('close', () => { connected = false; link(false); });
    ws.addEventListener('message', e => {                                             // the Pi answers: he is reachable (the socket may outlive an "offline")
      if (navigator.onLine !== false) link(true);
      try { const m = JSON.parse(e.data); if (m.type === 'state') state(m.data); } catch {}
    });
  },
  up(p) { if (!on) return false; Sc.hit(p.x, p.y); return true; },                // app.js / lab.js: a touch on his face, no swipe nor menu here
  /* the lab: it is the Pi's screen, and its phone frame is a Pixel de poche */
  lab(o) { send = o.send || send; frame = o.frame || null; if (!on) where = 'pi'; return api; },
  view(b) { if (b) enter('labo'); else leave(); },
  enter: h => enter(h || 'fixe'), leave, state,
  get on() { return on; }, get where() { return where; }, get how() { return how; }, get awake() { return !!lock; }, get visiting() { return visiting(); },
  get linked() { return online; },  // does he think the Pi is reachable
  /* the Pixel app's senses (pixel-mobile/src/poche.ts injects them while he is shown): its accelerometer, in m/s² with gravity
     and in the phone's own axes like devicemotion, and its battery (0..1, plugged in or not) */
  native: {
    motion(x, y, z) { if (feeling && appSenses()) onMotion({ accelerationIncludingGravity: { x, y, z } }); },
    battery(level, charging) { const first = !bat; bat = { level, charging: !!charging }; if (first) wasCharging = bat.charging; else onBattery(); },   // the first: said 6 s after he shows (enter)
  },
  /* what the phone would feel: the lab's buttons and the tests */
  sim: {
    shake,
    tilt(side) { tiltTo(side * 7.5); clearTimeout(tiltT); tiltT = setTimeout(() => tiltTo(0), 3000); },
    feel,
    battery(level, charging) { bat = { level, charging: !!charging }; onBattery(); },
    link(ok) { link(!!ok, 0); },
    pocket(ms) { if (PER) PER.away(ms); hiddenAt = Date.now() - ms; revoila(); hiddenAt = 0; },
  },
};
return api;
})();
