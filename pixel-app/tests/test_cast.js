// Casting to Pixel's screen (screens.js, the cast layer), without a browser:  node tests/test_cast.js
// Runs the pack, themes.js, persona.js, the scene packs and screens.js in a VM with a stub canvas, a fake frame clock and stub
// media (a picture that loads, a video that plays, a GIF decoder, a player frame), then:
// - every kind of cast (photo, GIF, video, text, page link, YouTube on Pixel's screen and on a phone) draws in every theme,
//   with both faces, in Rétro with and without the tube's green, with the CRT effect off, under the quick menu;
// - the screen that was open comes back when it ends, it waits for the boot splash, an expired cast does not show;
// - a touch stops it; a video is drawn at each of its new frames, with its sound on Pixel's screen only; its end and its errors go
//   to the server; a photo is drawn from a copy at the screen's size; a still GIF is decoded once, an animated one at its own pace;
// - YouTube and Vimeo play in a sandboxed frame; their errors, or their silence, end the cast;
// - his personality hears about it (the "cast" event), and the cast's own actions are not "an action of the phone".
const fs = require('fs'), path = require('path'), vm = require('vm');
const WEB = path.join(__dirname, '..', 'web');
let fails = 0;
const check = (name, ok, info = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (!ok && info ? `  [${info}]` : '')); if (!ok) fails++; };

const stub = () => new Proxy(function () {}, {
  get: (t, k) => k === 'width' || k === 'height' ? 100 : k === Symbol.toPrimitive ? () => 0 : k === 'measureText' ? s => ({ width: String(s).length * 10 }) : k === 'data' ? new Uint8ClampedArray(400 * 4) : stub(),
  set: () => true, apply: () => stub(), construct: () => stub(),
});
const ops = [];                                      // what the main canvas was asked to do (the tint: compositing)
const ctx2d = new Proxy(stub(), { set: (t, k, v) => { if (k === 'globalCompositeOperation') ops.push(v); return true; } });
const el = tag => ({ tag, width: 0, height: 0, style: {}, attrs: {}, getContext: () => stub(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 480 }),
  addEventListener(n, f) { (this.on ||= {})[n] = f; }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; if (k === 'src') this.src = ''; }, remove() { this.removed = true; } });
const videos = [], frames = [];
let vfc = true;                                      // requestVideoFrameCallback (Chromium has it; without it: 60 im/s)
function makeVideo() {                               // a <video> that plays: 640 x 360, 10 s
  const v = { ...el('video'), readyState: 4, videoWidth: 640, videoHeight: 360, duration: 10, currentTime: 0, paused: true, muted: false, volume: 1,
    play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; }, load() {} };
  if (vfc) v.requestVideoFrameCallback = cb => { v.vfc = cb; };
  videos.push(v); return v;
}
const host = { append(f) { frames.push(f); } };
const crt = { ...el('canvas'), width: 800, height: 480, parentElement: host, getContext: () => ctx2d };
let clock = 1000, pending = null;
class FakeImage { constructor() { this.complete = false; this.naturalWidth = 0; images++; } set src(v) { this._src = v; this.complete = true; this.naturalWidth = 1200; this.naturalHeight = 800; if (this.onload) setTimeout(() => this.onload(), 0); } get src() { return this._src; } }
let gifFrames = 3, decodes = 0, fetches = 0, images = 0;
const decoders = [];
class FakeDecoder {                                  // ImageDecoder: a GIF of 3 frames of 50 ms (gifFrames)
  constructor() { this.tracks = { ready: Promise.resolve(), selectedTrack: { frameCount: gifFrames } }; decoders.push(this); }
  decode({ frameIndex }) { decodes++; return Promise.resolve({ image: { displayWidth: 160, displayHeight: 120, duration: gifFrames > 1 ? 50000 : 0, index: frameIndex, close() {} } }); }
  close() { this.closed = true; }
}
const bitmaps = [];                                  // createImageBitmap: the picture at the size it shows
const createImageBitmap = async (im, o) => { const b = { width: o.resizeWidth, height: o.resizeHeight, o, closed: false, close() { this.closed = true; } }; bitmaps.push(b); return b; };
let onMessage = null;                                // the page's 'message' listener: what the players say
const sb = {
  document: { createElement: t => t === 'video' ? makeVideo() : el(t), getElementById: () => crt, activeElement: null },
  matchMedia: () => ({ matches: false }), performance: { now: () => clock }, requestAnimationFrame: cb => { pending = cb; },
  addEventListener(n, f) { if (n === 'message') onMessage = f; }, devicePixelRatio: 1, DOMMatrix: function () {}, console, Math, Image: FakeImage, ImageDecoder: FakeDecoder,
  createImageBitmap, fetch: async () => { fetches++; return { ok: true, headers: { get: () => 'image/gif' }, arrayBuffer: async () => new ArrayBuffer(16) }; },
  location: { origin: 'http://localhost:8080', search: '?kiosk=1' }, setTimeout, Promise,
  Date, Uint8Array, Uint8ClampedArray, Object, JSON, Number, String, Array, Set, Map,
};
sb.PixelSon = { on: true, volume: 0.6, scene() {}, say() {}, play() {}, setVolume() {} };
sb.window = sb; vm.createContext(sb);
const PACKS = fs.readdirSync(path.join(WEB, 'scenes')).filter(f => f.endsWith('.js')).sort().map(f => 'scenes/' + f);
for (const f of ['pack52/pixel52.js', 'pack52/pixel52-themes.js', 'themes.js', 'persona.js', ...PACKS, 'screens.js']) vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), sb, { filename: f });
const Screens = vm.runInContext('Screens', sb), L = Screens.local, PER = Screens.persona;
const themes = Object.keys(sb.PixelThemes({ X: stub(), RM: false, now: 0, blinkP: () => -1, txt() {}, wrap: () => [], fit: s => s }));
const sent = []; Screens.setSend((a, args) => sent.push([a, args || {}]));
const events = []; const ev0 = PER.event; PER.event = (n, d, c) => { events.push([n, d, c]); return ev0(n, d, c); };

const snap = (o = {}) => ({
  screen: 'meteo', mood: { name: 'neutre', until: 0 }, anim: null, scene: null, toast: null, boot_at: 0, server_now: Date.now(), cast: null, cast_recent: [],
  view: { theme: 'retro', face: 'pack', meteo_day: 0, units_f: false, agenda_day: 0, crt_off: false, osk: false },
  lights: { status: 'démo', rooms: [{ id: '0', name: 'Salon', on: true, bri: 80 }], scenes: ['Film'] },
  chat: { phase: 'idle', status: 'prêt', messages: [] }, codex: { task: '', running: false, status: '', lines: [] },
  weather: { city: 'Paris', now: { t: 11, kind: 'soleil', label: 'Soleil', wind: 9, hum: 50 }, days: [0, 1, 2, 3, 4].map(i => ({ name: 'J' + i, full: 'Jour', tmax: 12, tmin: 4, kind: 'nuage', label: 'Nuages', wind: 9, hum: 60 })) },
  agenda: { status: 'ok', events: [] }, timer: { mode: 'TRAVAIL', total: 1500, left: 1500, running: false, ends_at: 0, done: 0 },
  sys: { temp: 50, temps: [], cpus: [], ram_used: 1e9, ram_total: 4e9, bright: 1, wifi: -50 },
  settings: { sleep_min: 10, qr: [], url: '', ip_url: '', claude: 'prêt', deck: '', demo: true, themes, cast: { max_mb: 40, seconds: 120 } }, ...o,
});
let errs = [];
const tick = (ms = 16) => { clock += ms; const cb = pending; pending = null; try { cb(clock); } catch (e) { errs.push(e.stack.split('\n').slice(0, 3).join(' ')); } };
const flush = () => new Promise(r => setImmediate(r));
const wait = ms => new Promise(r => setTimeout(r, ms));
let S = snap(); const set = o => { S = { ...S, ...o, server_now: Date.now() }; Screens.setState(S); };
const QR = Array.from({ length: 25 }, (_, j) => Array.from({ length: 25 }, (_, i) => (i * j + i) % 3 ? '1' : '0').join(''));
let n = 0;
const C = (kind, o = {}) => ({ id: 'c' + ++n, kind, t0: Date.now(), until: 0, raw: false, title: 'Titre', ...o });
const KINDS = {
  photo: () => C('image', { src: '/cast/AAAAAAAAAAAAAAAA.jpg', until: Date.now() + 60000 }),
  gif: () => C('gif', { src: '/cast/BBBBBBBBBBBBBBBB.gif', until: Date.now() + 60000 }),
  video: () => C('video', { src: '/cast/CCCCCCCCCCCCCCCC.mp4' }),
  text: () => C('text', { text: "À table ! Le dîner est prêt dans 5 minutes, n'oublie pas le pain.", until: Date.now() + 60000 }),
  long: () => C('text', { text: 'Anticonstitutionnellementissimementextraordinairement '.repeat(5), until: Date.now() + 60000 }),
  page: () => C('link', { url: 'https://fr.wikipedia.org/wiki/Pixel_art', site: 'fr.wikipedia.org', qr: QR, until: Date.now() + 60000 }),
  bare: () => C('link', { url: 'https://example.org/une/page/tres/longue?avec=des&parametres=1', site: 'example.org', qr: null, until: Date.now() + 60000 }),
  youtube: () => C('link', { url: 'https://youtu.be/aqz-KE-bpKQ', site: 'YouTube', embed: 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?autoplay=1&enablejsapi=1' }),
  remote: () => C('image', { src: 'https://example.org/chat.png', url: 'https://example.org/chat.png', until: Date.now() + 60000 }),
};

(async () => {
  Screens.start(); set({}); tick(); L.boot = -1; L.kiosk = true; L.scr = 'meteo';
  // ---- every kind, every theme, both faces, both colour modes ----
  for (const face of ['pack', 'vivant']) for (const th of themes) {
    errs = [];
    set({ view: { ...S.view, theme: th, face } });
    for (const [k, make] of Object.entries(KINDS)) for (const raw of th === 'retro' || th === 'lcd' ? [false, true] : [false]) {
      set({ cast: { ...make(), raw } }); await flush();
      for (const ms of [16, 120, 600, 1500, 3000, 5000, 8000, 30000]) { tick(ms); await flush(); }
      L.inputAt = clock; Screens.menu(true); tick(16); tick(300); Screens.menu(false); tick(16);   // the menu closes itself 20 s after a touch
    }
    set({ cast: null }); tick(); tick();
    check(`${th}, face ${face}: photo, GIF, video, texts, links and YouTube draw without an error, under the menu too`, errs.length === 0, errs.slice(0, 2).join(' | '));
  }
  set({ view: { ...S.view, theme: 'retro', face: 'pack' }, cast: null }); tick();

  // ---- the tube's green (Rétro), the colours of origin, the CRT effect off ----
  const tinted = async (o, view = {}) => { set({ view: { ...S.view, theme: 'retro', crt_off: false, ...view }, cast: { ...KINDS.photo(), ...o } }); await flush(); tick(); await flush(); ops.length = 0; tick(600); return ops.includes('color'); };
  check('Rétro: the photo takes the green of the tube', await tinted({}));
  check("Rétro: 'couleurs d'origine' keeps its colours", !(await tinted({ raw: true })));
  check('Rétro with the CRT effect off: its own colours', !(await tinted({}, { crt_off: true })));
  check('LCD: in its greens; Moderne: as it is', await tinted({}, { theme: 'lcd' }) && !(await tinted({}, { theme: 'moderne' })));
  set({ view: { ...S.view, theme: 'retro', crt_off: false }, cast: null }); tick();

  // ---- it shows over the open screen, which comes back ----
  L.scr = 'meteo'; let c = KINDS.photo(); events.length = 0;
  set({ cast: c }); tick(); await flush(); tick();
  check('a photo: drawn over the open screen, loaded', Screens.cast.id === c.id && Screens.cast.ready && L.scr === 'meteo', JSON.stringify(Screens.cast));
  await wait(5); await flush(); tick(); const bmp = bitmaps[bitmaps.length - 1];
  check("a photo is drawn from a copy at the screen's size (1200 x 800 -> 720 x 480), not from the full picture",
    bmp && bmp.o.resizeWidth === 720 && bmp.o.resizeHeight === 480 && bmp.o.resizeQuality === 'high' && Screens.cast.bitmap && Screens.cast.ready, JSON.stringify(bmp && bmp.o));
  check('his personality hears about it: the "cast" event, kept for his face screen', events.some(([nm, d, x]) => nm === 'cast' && d.kind === 'image' && x.visage === false), JSON.stringify(events));
  check('the "cast" event is listed with the others', PER.events.some(e => e.id === 'cast' && /cast/.test(e.label)));
  sent.length = 0; Screens.hit(400, 240);
  check('a touch on the screen stops it', sent.some(([a]) => a === 'cast.stop'), JSON.stringify(sent));
  set({ cast: null }); tick();
  check('then the screen that was open comes back, the copy of the photo let go', Screens.cast.id === null && L.scr === 'meteo' && bmp.closed);
  set({ cast: { ...KINDS.photo(), until: Date.now() - 1000 } }); tick();
  check('an expired cast does not show', Screens.cast.id === null);
  L.boot = clock; c = KINDS.text(); set({ cast: c }); tick();
  const during = Screens.cast.id; for (let e = 0; e < 3800; e += 250) tick(250);
  check('it waits for the boot splash, then shows', during === null && Screens.cast.id === c.id, `${during} ${Screens.cast.id}`);
  set({ cast: null }); tick();
  events.length = 0; set({ act: { name: 'cast.text', t0: Date.now() } }); set({ act: { name: 'lights.set', t0: Date.now() + 1 } });
  check("the cast's own actions are not 'an action of the phone' for his personality", !events.some(([nm, d]) => nm === 'action' && /^cast\./.test(d.name)) && events.some(([nm, d]) => nm === 'action' && d.name === 'lights.set'), JSON.stringify(events));

  // ---- the video: full speed, the sound on Pixel's screen only, its end and its errors ----
  videos.length = 0; L.kiosk = true; c = KINDS.video(); set({ cast: c }); tick(); await flush(); tick(16); tick(2000);
  let v = videos[videos.length - 1];
  check('a video plays on Pixel, with its sound', v && !v.paused && !v.muted && v.src === c.src && Screens.cast.playing);
  tick(3000); tick(16); const calm = L.fpsWant;        // (once his wake-up scene, from the boot splash above, is over)
  L.dirty = false; const cb = v.vfc; cb(); const fresh = L.dirty;
  check('a video: each of its new frames is drawn (requestVideoFrameCallback), 15 im/s the rest of the time, not 60', calm === 15 && fresh && v.vfc === cb, `${calm} ${fresh}`);
  sent.length = 0; v.onended(); check('its end goes to the server (cast.end)', sent.some(([a, g]) => a === 'cast.end' && g.id === c.id && !g.error), JSON.stringify(sent));
  tick(16); check('once it is over: not 60 im/s', L.fpsWant < 60, String(L.fpsWant));
  set({ cast: null }); tick();
  check('then the video is stopped and let go', v.paused && v.src === '' && Screens.cast.video === false);
  c = KINDS.video(); set({ cast: c }); tick(); await flush(); v = videos[videos.length - 1]; sent.length = 0; v.onerror();
  check('a video Pixel cannot read: the server hears why', sent.some(([a, g]) => a === 'cast.end' && g.error === 'video'));
  set({ cast: null }); tick();
  vfc = false; c = KINDS.video(); set({ cast: c }); tick(); await flush(); tick(16); tick(2000); tick(16);
  check('without requestVideoFrameCallback: 60 im/s while it plays, as before', L.fpsWant === 60, String(L.fpsWant));
  videos[videos.length - 1].onended(); tick(16); check('... and no more once it is over', L.fpsWant < 60, String(L.fpsWant));
  set({ cast: null }); tick(); vfc = true;
  L.kiosk = false; c = { ...KINDS.video(), t0: Date.now() - 4000 }; set({ cast: c }); tick(); await flush(); v = videos[videos.length - 1]; v.onloadedmetadata(); sent.length = 0; v.onended();
  check('on a phone: without sound, it joins in where Pixel is, and it is not the one that ends it', v.muted && Math.abs(v.currentTime - 4) < 0.5 && !sent.some(([a]) => a === 'cast.end'), `${v.muted} ${v.currentTime}`);
  set({ cast: null }); tick(); L.kiosk = true;
  sb.PixelSon.volume = 0; c = KINDS.video(); set({ cast: c }); tick(); v = videos[videos.length - 1];
  check("the quick menu's sound cut: the video plays without sound", v.muted); sb.PixelSon.volume = 0.6;
  set({ cast: null }); tick();
  // ---- the GIF: decoded frame by frame ----
  fetches = 0; images = 0; c = KINDS.gif(); set({ cast: c }); tick(); for (let i = 0; i < 6; i++) { await flush(); tick(16); }
  const f1 = Screens.cast.frame; await wait(70); await flush(); tick(16); const f2 = Screens.cast.frame;
  tick(2000); tick(16); const gfps = L.fpsWant;
  check('a GIF is decoded frame by frame at its own pace (a canvas only draws its first frame), 15 im/s between its frames',
    f1 >= 0 && f2 >= 0 && f1 !== f2 && Screens.cast.ready && gfps === 15, `${f1} ${f2} ${gfps}`);
  check('a GIF is downloaded once (ImageDecoder, no Image beside it)', fetches === 1 && images === 0, `${fetches} ${images}`);
  set({ cast: null }); tick();
  check('then its decoder is closed', decoders[decoders.length - 1].closed);
  gifFrames = 1; decodes = 0; c = KINDS.gif(); set({ cast: c }); tick(); for (let i = 0; i < 6; i++) { await flush(); tick(16); }
  await wait(250); await flush(); tick(2000); tick(16);
  check('a still GIF: decoded once, its decoder closed, drawn like a photo', decodes === 1 && decoders[decoders.length - 1].closed && Screens.cast.ready
    && Screens.cast.frame === -1 && L.fpsWant < 60, `${decodes} ${Screens.cast.frame} ${L.fpsWant}`);
  set({ cast: null }); tick(); gifFrames = 3;
  // ---- YouTube: their player on Pixel's screen, a card on a phone ----
  frames.length = 0; L.kiosk = true; c = KINDS.youtube(); set({ cast: c }); tick();
  const f = frames[0];
  check('YouTube on Pixel: their player over the canvas, the embed address, autoplay allowed', f && f.tag === 'iframe' && f.src.startsWith(c.embed) && /origin=/.test(f.src) && /autoplay/.test(f.allow) && Screens.cast.player);
  const sbx = (f.attrs.sandbox || '').split(' ');
  check("the player is sandboxed: it plays, but its links open no window and cannot take Pixel's place",
    ['allow-scripts', 'allow-same-origin', 'allow-presentation'].every(t => sbx.includes(t)) && !sbx.some(t => /popups|top-navigation|forms/.test(t)), f.attrs.sandbox);
  tick(2000); tick(16); check('the canvas behind the player: 10 im/s', L.fpsWant === 10, String(L.fpsWant));
  sent.length = 0; Screens.hit(100, 200); const fromPlayer = sent.length; Screens.hit(700, 400);
  check("a touch on the player is the player's; the column beside it stops it", fromPlayer === 0 && sent.some(([a]) => a === 'cast.stop'), JSON.stringify(sent));
  L.inputAt = clock; Screens.menu(true); tick(16); check('the player hides under the quick menu', f.style.visibility === 'hidden'); Screens.menu(false); tick(16);
  set({ cast: null }); tick(); check('then the player goes', f.removed === true);
  // ---- the player's end, its errors, its silence ----
  const player = async (kind, o = {}) => {
    frames.length = 0; const k = { ...KINDS[kind](), ...o }; set({ cast: k }); tick(); const p = frames[0], said = [];
    p.contentWindow = { postMessage: m => said.push(JSON.parse(m)) }; p.on.load(); sent.length = 0;
    const say = d => onMessage({ source: p.contentWindow, data: JSON.stringify(d) });
    return { k, p, said, say };
  };
  let pl = await player('youtube');
  check('YouTube: asked for its end and its errors', pl.said.some(m => m.event === 'listening')
    && ['onStateChange', 'onError'].every(ev => pl.said.some(m => m.func === 'addEventListener' && m.args[0] === ev)), JSON.stringify(pl.said));
  pl.say({ event: 'onReady' }); pl.say({ event: 'onError', info: 150 }); pl.say({ event: 'onError', info: 150 });
  check('YouTube: a video it will not play here (embedding refused: 150) ends the cast, once, and the server hears why',
    sent.filter(([a, g]) => a === 'cast.end' && g.id === pl.k.id && g.error === 'video').length === 1, JSON.stringify(sent));
  set({ cast: null }); tick();
  pl = await player('youtube'); pl.say({ event: 'infoDelivery', info: { playerState: 1 } }); for (let i = 0; i < 20; i++) tick(1000);
  check('YouTube: a video that plays, and says so, is not ended by the watchdog', !sent.some(([a]) => a === 'cast.end'), JSON.stringify(sent));
  pl.say({ event: 'onStateChange', info: 0 });
  check('YouTube: its end goes to the server, once', sent.filter(([a, g]) => a === 'cast.end' && g.id === pl.k.id && !g.error).length === 1, JSON.stringify(sent));
  set({ cast: null }); tick();
  pl = await player('youtube'); const n0 = pl.said.length; for (let i = 0; i < 17; i++) tick(1000);
  check('a player that never answers: asked again, then the cast ends after about 15 s, with an error',
    pl.said.length > n0 && sent.filter(([a, g]) => a === 'cast.end' && g.id === pl.k.id && g.error === 'video').length === 1, `${pl.said.length} ${JSON.stringify(sent)}`);
  set({ cast: null }); tick();
  const vimeo = { site: 'Vimeo', embed: 'https://player.vimeo.com/video/76979871?autoplay=1' };
  pl = await player('youtube', vimeo); pl.say({ event: 'ready' });
  check('Vimeo: asked again for its end and its errors once ready',
    ['ended', 'error'].every(ev => pl.said.filter(m => m.method === 'addEventListener' && m.value === ev).length === 2), JSON.stringify(pl.said));
  pl.say({ event: 'error', data: { name: 'PrivacyError' } });
  check('Vimeo: its error ends the cast', sent.some(([a, g]) => a === 'cast.end' && g.id === pl.k.id && g.error === 'video'), JSON.stringify(sent));
  set({ cast: null }); tick();
  pl = await player('youtube', vimeo); pl.say({ method: 'ping' }); for (let i = 0; i < 20; i++) tick(1000);
  check('Vimeo: a player that answers our ping (its ready already gone) is not ended by the watchdog', pl.said.some(m => m.method === 'ping') && !sent.some(([a]) => a === 'cast.end'), JSON.stringify(sent));
  set({ cast: null }); tick();
  frames.length = 0; L.kiosk = false; set({ cast: KINDS.youtube() }); tick(); check('YouTube on a phone: a card, no player', frames.length === 0 && Screens.cast.player === false);
  set({ cast: null }); tick(); L.kiosk = true;
  check('no error in all of it', errs.length === 0, errs.slice(0, 2).join(' | '));

  // ---- the files that ship it ----
  const kiosk = fs.readFileSync(path.join(__dirname, '..', 'deploy', 'kiosk.sh'), 'utf8'), man = JSON.parse(fs.readFileSync(path.join(WEB, 'manifest.webmanifest'), 'utf8'));
  check('kiosk.sh lets the videos play with their sound without a touch', /--autoplay-policy=no-user-gesture-required/.test(kiosk));
  const st = man.share_target || {};
  check('manifest: a share target, POST multipart to /share, pictures and videos, title, text, url',
    st.action === '/share' && st.method === 'POST' && st.enctype === 'multipart/form-data' && st.params.title === 'title' && st.params.text === 'text' && st.params.url === 'url'
    && st.params.files[0].name === 'media' && st.params.files[0].accept.join() === 'image/*,video/*', JSON.stringify(st));
  const sw = fs.readFileSync(path.join(WEB, 'sw.js'), 'utf8'), app = fs.readFileSync(path.join(WEB, 'app.js'), 'utf8'), html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  check('sw.js passes the share on to /share with the access code', /pathname === '\/share'/.test(sw) && /X-Pixel-Token/.test(sw));
  check('the app: the Caster panel (file, link, text, stop, colours), with the access code', ['castFile', 'castLink', 'castText', 'castStop', 'castRaw'].every(id => html.includes(`id="${id}"`))
    && /accept="image\/\*,video\/\*"/.test(html) && /X-Pixel-Token/.test(app) && /samesite=strict/i.test(app));
  const lab = fs.readFileSync(path.join(WEB, 'lab', 'demo-hub.js'), 'utf8');
  check('the lab mirrors every cast action of the server', ['cast.stop', 'cast.text', 'cast.link', 'cast.again', 'cast.end', 'cast.colors'].every(a => lab.includes(`'${a}'`)));
  console.log(`\n${fails} failure(s)`);
  process.exit(fails ? 1 : 0);
})();
