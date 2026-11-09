// A clean picture while casting, and the shared screen on Pixel's side (screens.js + ecran.js), without a browser:
//   node tests/test_ecran.js
// Runs the pack, themes.js, persona.js, the scene packs, ecran.js and screens.js in a VM with a stub canvas, a fake clock,
// stub media and a fake WebRTC (RTCPeerConnection, WebSocket), then checks:
// - while anything is cast (a photo, a GIF, a video, a text, a link, YouTube, a shared screen), in every theme: the theme's
//   CRT layer (theme.fg: grain, band, flicker, glass, glitch; the LCD's grid) is not drawn, the page's scanlines are hidden
//   ("casting" class), no tint is laid over the picture, which sits on black; all of it comes back when the cast ends;
// - a shared screen in every phase (the code, paired, connecting, live; WebRTC, ScreenStream, AirPlay, the lab's demo)
//   draws in every theme, on Pixel's screen and on a phone;
// - WebRTC on Pixel's screen: it joins the session on /ecran/ws, answers the offer with H.264 first, relays its ICE
//   candidates, shows the stream at 60 im/s with the lowest delay, says when it is live, reports a lost connection,
//   and lets it all go at the end; a phone never receives anything;
// - ScreenStream: Pixel's screen loads the phone's stream itself (30 im/s), says when it cannot, stops the download at the end;
// - AirPlay: a slow card under UxPlay's window; the little Pixel looks at a shared screen once, then leaves it alone.
const fs = require('fs'), path = require('path'), vm = require('vm');
const WEB = path.join(__dirname, '..', 'web');
let fails = 0;
const check = (name, ok, info = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (!ok && info ? `  [${info}]` : '')); if (!ok) fails++; };

const stub = () => new Proxy(function () {}, {
  get: (t, k) => k === 'width' || k === 'height' ? 100 : k === Symbol.toPrimitive ? () => 0 : k === 'measureText' ? s => ({ width: String(s).length * 10 }) : k === 'data' ? new Uint8ClampedArray(400 * 4) : stub(),
  set: () => true, apply: () => stub(), construct: () => stub(),
});
const ops = [], fills = [], texts = [];
const base = stub();
const ctx2d = new Proxy(base, {
  get: (t, k) => k === 'fillText' ? s => { texts.push(String(s)); } : t[k],
  set: (t, k, v) => { if (k === 'globalCompositeOperation') ops.push(v); if (k === 'fillStyle') fills.push(String(v)); return true; },
});
const el = tag => ({ tag, width: 0, height: 0, style: {}, attrs: {}, getContext: () => stub(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 480 }),
  addEventListener(n, f) { (this.on ||= {})[n] = f; }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; if (k === 'src') this.src = ''; }, remove() { this.removed = true; } });
const videos = [];
function makeVideo() {                               // a <video>: 640 x 360, ready once it has a source
  const v = { ...el('video'), readyState: 0, videoWidth: 0, videoHeight: 0, duration: 10, currentTime: 0, paused: true, muted: false, srcObject: null,
    play() { this.paused = false; if (this.srcObject) { this.readyState = 4; this.videoWidth = 1280; this.videoHeight = 720; this.duration = Infinity; } return Promise.resolve(); },
    pause() { this.paused = true; }, load() {} };
  videos.push(v); return v;
}
const classes = new Set();
const host = { append() {}, classList: { toggle(c, on) { if (on) classes.add(c); else classes.delete(c); }, contains: c => classes.has(c) } };
const crt = { ...el('canvas'), width: 800, height: 480, parentElement: host, getContext: () => ctx2d };
let clock = 1000, pending = null;
const images = [];
class FakeImage {
  constructor() { this.complete = false; this.naturalWidth = 0; images.push(this); }
  set src(v) { this._src = v; if (/^https?:\/\/(192|10)\./.test(v) || /^\/cast\//.test(v)) { this.complete = true; this.naturalWidth = 720; this.naturalHeight = 1280; setTimeout(() => this.onload && this.onload(), 0); } }
  get src() { return this._src; }
  removeAttribute(k) { if (k === 'src') { this._src = ''; this.removed = true; } }
}
const sockets = [], pcs = [];
class FakeWS {                                       // the signalling socket: what Pixel's screen says, what it is told
  constructor(url) { this.url = url; this.sent = []; this.readyState = 0; sockets.push(this); setTimeout(() => { this.readyState = 1; if (this.onopen) this.onopen(); }, 0); }
  send(s) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState = 3; this.closed = true; }
  tell(m) { return this.onmessage({ data: JSON.stringify(m) }); }
}
class FakePC {
  constructor(cfg) { this.cfg = cfg; this.connectionState = 'new'; this.tr = { receiver: { track: { kind: 'video' } }, setCodecPreferences(l) { this.prefs = l; } }; pcs.push(this); }
  getTransceivers() { return [this.tr]; }
  async setRemoteDescription(d) { this.remote = d; }
  async createAnswer() { return { type: 'answer', sdp: 'v=0 answer' }; }
  async setLocalDescription(d) { this.localDescription = d; }
  async addIceCandidate(c) { (this.ice ||= []).push(c); }
  close() { this.closed = true; }
}
class FakeStream { constructor(t = []) { this.t = t; } getTracks() { return this.t; } addTrack(x) { this.t.push(x); } }
const sb = {
  document: { createElement: t => t === 'video' ? makeVideo() : el(t), getElementById: () => crt, activeElement: null },
  matchMedia: () => ({ matches: false }), performance: { now: () => clock }, requestAnimationFrame: cb => { pending = cb; },
  addEventListener() {}, devicePixelRatio: 1, DOMMatrix: function () {}, console, Math, Image: FakeImage,
  location: { origin: 'http://localhost:8080', host: 'localhost:8080', protocol: 'http:', search: '?kiosk=1' }, setTimeout, clearTimeout, setInterval, clearInterval, Promise,
  Date, Uint8Array, Uint8ClampedArray, Object, JSON, Number, String, Array, Set, Map,
  WebSocket: FakeWS, RTCPeerConnection: FakePC, MediaStream: FakeStream,
  RTCRtpReceiver: { getCapabilities: () => ({ codecs: [{ mimeType: 'video/VP8' }, { mimeType: 'video/rtx' }, { mimeType: 'video/H264' }, { mimeType: 'video/AV1' }] }) },
};
sb.PixelSon = { on: true, volume: 0.6, scene() {}, say() {}, play() {}, setVolume() {} };
sb.window = sb; vm.createContext(sb);
const PACKS = fs.readdirSync(path.join(WEB, 'scenes')).filter(f => f.endsWith('.js')).sort().map(f => 'scenes/' + f);
const run = f => vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), sb, { filename: f });
for (const f of ['pack52/pixel52.js', 'pack52/pixel52-themes.js', 'themes.js']) run(f);
let fgCalls = 0;                                     // the theme's CRT layer, counted
const orig = sb.PixelThemes;
sb.PixelThemes = H => { const t = orig(H); for (const k of Object.keys(t)) if (typeof t[k].fg === 'function') { const f = t[k].fg; t[k].fg = (...a) => { fgCalls++; return f(...a); }; } return t; };
for (const f of ['persona.js', ...PACKS, 'ecran.js', 'screens.js']) run(f);
const Screens = vm.runInContext('Screens', sb), L = Screens.local, E = sb.PixelEcran;
const themes = Object.keys(orig({ X: stub(), RM: false, now: 0, blinkP: () => -1, txt() {}, wrap: () => [], fit: s => s }));
const withFg = themes.filter(id => typeof orig({ X: stub(), RM: false, now: 0, blinkP: () => -1, txt() {}, wrap: () => [], fit: s => s })[id].fg === 'function');
const sent = []; Screens.setSend((a, args) => sent.push([a, args || {}]));

const snap = (o = {}) => ({
  screen: 'meteo', mood: { name: 'neutre', until: 0 }, anim: null, scene: null, toast: null, boot_at: 0, server_now: Date.now(), cast: null, cast_recent: [],
  view: { theme: 'retro', face: 'pack', meteo_day: 0, units_f: false, agenda_day: 0, crt_off: false, osk: false },
  lights: { status: 'démo', rooms: [{ id: '0', name: 'Salon', on: true, bri: 80 }], scenes: ['Film'] },
  chat: { phase: 'idle', status: 'prêt', messages: [] }, codex: { task: '', running: false, status: '', lines: [] },
  weather: { city: 'Paris', now: { t: 11, kind: 'soleil', label: 'Soleil', wind: 9, hum: 50 }, days: [0, 1, 2, 3, 4].map(i => ({ name: 'J' + i, full: 'Jour', tmax: 12, tmin: 4, kind: 'nuage', label: 'Nuages', wind: 9, hum: 60 })) },
  agenda: { status: 'ok', events: [] }, timer: { mode: 'TRAVAIL', total: 1500, left: 1500, running: false, ends_at: 0, done: 0 },
  sys: { temp: 50, temps: [], cpus: [], ram_used: 1e9, ram_total: 4e9, bright: 1, wifi: -50 },
  settings: { sleep_min: 10, qr: [], url: '', ip_url: '', claude: 'prêt', deck: '', demo: true, themes, cast: { max_mb: 40, seconds: 120 }, ecran: { page: 'http://pixel.local:8080/ecran' } },
  airplay: { on: false, status: 'off', client: '', name: 'Pixel', error: '' }, ...o,
});
let errs = [];
const tick = (ms = 16) => { clock += ms; const cb = pending; pending = null; try { cb(clock); } catch (e) { errs.push(e.stack.split('\n').slice(0, 3).join(' ')); } };
const flush = () => new Promise(r => setImmediate(r));
let S = snap(); const set = o => { S = { ...S, ...o, server_now: Date.now() }; Screens.setState(S); };
let n = 0;
const C = (kind, o = {}) => ({ id: 'c' + ++n, kind, t0: Date.now(), until: 0, raw: false, title: 'Titre', ...o });
const KINDS = {
  photo: () => C('image', { src: '/cast/AAAAAAAAAAAAAAAA.jpg', until: Date.now() + 60000 }),
  video: () => C('video', { src: '/cast/CCCCCCCCCCCCCCCC.mp4' }),
  text: () => C('text', { text: 'À table !', until: Date.now() + 60000 }),
  page: () => C('link', { url: 'https://fr.wikipedia.org/wiki/Pixel_art', site: 'fr.wikipedia.org', qr: null, until: Date.now() + 60000 }),
  youtube: () => C('link', { url: 'https://youtu.be/aqz-KE-bpKQ', site: 'YouTube', embed: 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?autoplay=1&enablejsapi=1' }),
};
const SCREENS = {
  code: () => C('screen', { via: 'webrtc', phase: 'code', code: '482913', title: "Partage d'écran", note: 'Sur l’ordinateur, tape ce code dans la page « Partager mon écran » (pixel.local:8080/ecran).', until: Date.now() + 180000 }),
  paired: () => C('screen', { via: 'webrtc', phase: 'paired', title: 'Ordinateur connecté', note: 'Choisis ce que tu partages.', until: Date.now() + 60000 }),
  connecting: () => C('screen', { via: 'webrtc', phase: 'connecting', session: 'S' + n, title: 'Écran : PC Windows', note: "Connexion à l'ordinateur…" }),
  live: () => C('screen', { via: 'webrtc', phase: 'live', session: 'S' + n, title: 'Écran : PC Windows', note: "L'écran de l'ordinateur est sur Pixel, en direct." }),
  mjpeg: () => C('screen', { via: 'mjpeg', phase: 'connecting', src: 'http://192.168.1.23:8080/stream.mjpeg', title: 'Écran du téléphone', note: 'Connexion à ScreenStream…' }),
  pin: () => C('screen', { via: 'airplay', phase: 'pin', code: '4821', title: 'AirPlay', note: "Sur l'iPhone, tape ce code.", until: Date.now() + 90000 }),
  airplay: () => C('screen', { via: 'airplay', phase: 'live', title: "AirPlay : iPhone de Marie", note: "Son écran s'affiche par-dessus Pixel.", code: '' }),
  demo: () => C('screen', { via: 'demo', phase: 'live', title: 'Écran : PC du labo', note: '' }),
};

(async () => {
  Screens.start(); set({}); tick(); L.boot = -1; L.kiosk = true; L.scr = 'meteo';

  // ---- 1. no CRT effect over a cast, in any theme; back when it ends ----
  for (const th of themes) {
    set({ view: { ...S.view, theme: th, crt_off: false }, cast: null }); for (let i = 0; i < 3; i++) tick(120);
    fgCalls = 0; tick(120); tick(120);
    const idleFg = fgCalls, idleClass = classes.has('casting');
    let castFg = 0, castClass = true, tinted = false, black = true;
    for (const [k, make] of [...Object.entries(KINDS), ['screen', SCREENS.live]]) {
      set({ cast: make() }); await flush(); tick(16); await flush();
      fgCalls = 0; ops.length = 0; fills.length = 0;
      for (const ms of [120, 600, 1500, 3000]) { tick(ms); await flush(); }
      castFg += fgCalls; castClass = castClass && classes.has('casting'); tinted = tinted || ops.includes('color') || ops.includes('multiply');
      if (k === 'photo' || k === 'video') black = black && fills.includes('#000');      // a picture: on black (a shared screen before its picture: its card)
      set({ cast: null }); tick(16);
    }
    fgCalls = 0; tick(120); tick(120);
    const backFg = fgCalls, backClass = classes.has('casting');
    check(`${th}: while a photo, a video, a text, a link, YouTube or a shared screen is cast: no CRT layer, no scanlines, no tint, on black`,
      castFg === 0 && castClass && !tinted && black, JSON.stringify({ castFg, castClass, tinted, black }));
    check(`${th}: before and after, exactly as it was (its CRT layer${withFg.includes(th) ? '' : ': none in this theme'}, the scanlines)`,
      !idleClass && !backClass && (withFg.includes(th) ? idleFg > 0 && backFg > 0 : idleFg === 0 && backFg === 0), JSON.stringify({ idleFg, backFg, idleClass, backClass }));
  }
  set({ view: { ...S.view, theme: 'retro', crt_off: true }, cast: KINDS.photo() }); tick(); await flush(); fgCalls = 0; tick(120); tick(600);
  check("Rétro with the CRT effect off: the same (no tint, no layer)", fgCalls === 0 && !ops.includes('color'));
  set({ view: { ...S.view, crt_off: false }, cast: null }); tick();
  check('Rétro is the theme most used: it has a CRT layer, which this test did see', withFg.includes('retro'));

  // ---- 2. a shared screen, every phase, every theme, on Pixel's screen and on a phone ----
  for (const kiosk of [true, false]) for (const th of themes) {
    errs = []; L.kiosk = kiosk;
    set({ view: { ...S.view, theme: th } });
    for (const make of Object.values(SCREENS)) {
      set({ cast: make() }); await flush();
      for (const ms of [16, 120, 600, 1600, 5000, 9000]) { tick(ms); await flush(); }
      L.inputAt = clock; Screens.menu(true); tick(16); tick(300); Screens.menu(false); tick(16);
    }
    set({ cast: null }); tick(); tick();
    check(`${th}, ${kiosk ? "Pixel's screen" : 'a phone'}: the code, paired, connecting, live, ScreenStream, AirPlay and the demo draw without an error`, errs.length === 0, errs.slice(0, 2).join(' | '));
  }
  L.kiosk = true; set({ view: { ...S.view, theme: 'retro' }, cast: null }); tick();
  texts.length = 0; set({ cast: SCREENS.code() }); tick(); tick(200);
  check('the code card shows the code in two groups, and where to type it', texts.includes('482 913') && texts.some(t => /pixel\.local:8080\/ecran/.test(t)), JSON.stringify(texts.slice(0, 12)));
  set({ cast: null }); tick();

  // ---- 3. WebRTC on Pixel's screen ----
  sockets.length = 0; pcs.length = 0; videos.length = 0; sent.length = 0;
  const opened = () => new Promise(r => setTimeout(r, 5));         // the fake socket opens on the next turn, like a real one
  let c = SCREENS.connecting(); set({ cast: c }); tick(); await opened();
  const ws = sockets[0], pc = pcs[0];
  check("Pixel's screen joins the session on /ecran/ws, with no STUN server", ws && ws.url === 'ws://localhost:8080/ecran/ws' && ws.sent[0] && ws.sent[0].type === 'kiosk' && ws.sent[0].session === c.session
    && pc && Array.isArray(pc.cfg.iceServers) && pc.cfg.iceServers.length === 0, JSON.stringify([ws && ws.url, ws && ws.sent, pc && pc.cfg]));
  await ws.tell({ type: 'offer', sdp: 'v=0 offer' }); await flush();
  check('it answers the offer, H.264 first in its codecs', pc.remote.sdp === 'v=0 offer' && ws.sent.some(m => m.type === 'answer' && m.sdp === 'v=0 answer') && pc.tr.prefs && pc.tr.prefs[0].mimeType === 'video/H264' && pc.tr.prefs.length === 4,
    JSON.stringify([ws.sent, pc.tr.prefs]));
  await ws.tell({ type: 'ice', candidate: { candidate: 'candidate:1 1 udp 1 192.168.1.9 5000 typ host', sdpMid: '0' } });
  pc.onicecandidate({ candidate: { toJSON: () => ({ candidate: 'candidate:2 1 udp 1 192.168.1.42 6000 typ host', sdpMid: '0' }) } });
  check('ICE candidates both ways', pc.ice && pc.ice[0].sdpMid === '0' && ws.sent.some(m => m.type === 'ice' && /192\.168\.1\.42/.test(m.candidate.candidate)));
  const recv = { jitterBufferTarget: 500 }, stream = new FakeStream([{ kind: 'video' }]);
  pc.ontrack({ receiver: recv, streams: [stream], track: stream.t[0] }); await flush();
  const v = videos[videos.length - 1];
  v.onloadeddata(); tick(16); tick(1600);
  check('the stream plays in a <video> drawn on the canvas, with the lowest delay, with its sound on Pixel', v.srcObject === stream && !v.paused && !v.muted && recv.jitterBufferTarget === 0 && Screens.cast.ready && Screens.cast.video);
  check('... at 60 im/s, and Pixel says it is live', L.fpsWant === 60 && ws.sent.some(m => m.type === 'live'), String(L.fpsWant));
  for (let e = 0; e < 40000; e += 500) tick(500);
  check('the little Pixel looked once, then leaves the shared screen alone (no peek every 30 s)', Screens.cast.peek === 0, String(Screens.cast.peek));
  pc.connectionState = 'failed'; pc.onconnectionstatechange();
  check('a lost connection is told to the server', ws.sent.some(m => m.type === 'fail' && m.why === 'reseau'));
  set({ cast: null }); tick();
  check('the end: the connection, the socket and the video let go', pc.closed && ws.closed && v.srcObject === null && E.status === null && Screens.cast.id === null);
  set({ cast: SCREENS.connecting() }); tick(); await opened();
  const ws2 = sockets[sockets.length - 1]; ws2.readyState = 3; ws2.onclose(); tick();
  check('the signalling lost before the picture: Pixel says so through its main connection (ecran.fail)', sent.some(([a, g]) => a === 'ecran.fail' && g.why === 'signal'), JSON.stringify(sent));
  set({ cast: null }); tick();
  sockets.length = 0; pcs.length = 0; L.kiosk = false; set({ cast: SCREENS.live() }); tick(); await flush();
  check('a phone that mirrors Pixel receives nothing: no socket, no connection, the card', sockets.length === 0 && pcs.length === 0 && E.status === null && !Screens.cast.ready);
  set({ cast: null }); tick(); L.kiosk = true;
  const saved = sb.RTCPeerConnection; sb.RTCPeerConnection = undefined; sent.length = 0;
  c = SCREENS.connecting(); set({ cast: c }); tick();
  check('a browser without WebRTC says so to the server instead of breaking', sent.some(([a, g]) => a === 'ecran.fail' && g.id === c.id && g.why === 'webrtc') && errs.length === 0);
  sb.RTCPeerConnection = saved; set({ cast: null }); tick();

  // ---- 4. ScreenStream ----
  images.length = 0; sent.length = 0; c = SCREENS.mjpeg(); set({ cast: c }); tick(); await flush(); tick(16); tick(1600);
  const im = images[images.length - 1];
  check("Pixel's screen loads the phone's stream itself, and draws it 30 times a second", im && im.src === c.src && Screens.cast.ready && L.fpsWant === 30, `${im && im.src} ${L.fpsWant}`);
  set({ cast: null }); tick();
  check('the end: the download stops (no more src)', im.removed && im.src === '');
  c = { ...SCREENS.mjpeg(), src: 'http://172.16.0.9:8080/stream.mjpeg' }; set({ cast: c }); tick(); await flush();
  images[images.length - 1].onerror();
  check('no ScreenStream there: the server hears why', sent.some(([a, g]) => a === 'ecran.fail' && g.id === c.id && g.why === 'mjpeg'));
  set({ cast: null }); tick();
  images.length = 0; L.kiosk = false; set({ cast: SCREENS.mjpeg() }); tick();
  check('a phone never loads another phone\'s stream', images.length === 0); L.kiosk = true; set({ cast: null }); tick();

  // ---- 5. AirPlay: UxPlay's window is above, Pixel draws little underneath ----
  set({ cast: SCREENS.airplay() }); tick(); for (let e = 0; e < 3000; e += 500) tick(500);
  check('AirPlay live: Pixel draws its card 4 times a second (UxPlay needs the processor)', L.fpsWant === 4 && E.status === null, String(L.fpsWant));
  texts.length = 0; set({ cast: SCREENS.pin() }); tick(); tick(200);
  check("AirPlay's PIN in big", texts.includes('4821'));
  set({ cast: null }); tick();
  check('no error in all of it', errs.length === 0, errs.slice(0, 2).join(' | '));

  // ---- the files that ship it ----
  const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8'), css = fs.readFileSync(path.join(WEB, 'style.css'), 'utf8'), lab = fs.readFileSync(path.join(WEB, 'lab', 'lab.css'), 'utf8');
  const labHtml = fs.readFileSync(path.join(WEB, 'lab', 'index.html'), 'utf8'), hub = fs.readFileSync(path.join(WEB, 'lab', 'demo-hub.js'), 'utf8');
  check('style.css and lab.css hide the scanlines over a cast', /\.screen\.casting::after\{display:none\}/.test(css) && /\.screen\.casting::after\{display:none\}/.test(lab));
  check('the app loads ecran.js before screens.js, with the « Partager un écran » part', html.indexOf('app/ecran.js') > 0 && html.indexOf('app/ecran.js') < html.indexOf('app/screens.js')
    && ['ecranPanel', 'ecranCode', 'ecranPhone', 'ecranPort', 'ecranAirplay', 'ecranSelf'].every(id => html.includes(`id="${id}"`)) && /Afficher l'écran du téléphone/.test(html));
  check("the app no longer offers « Couleurs d'origine » (a cast is always in its own colours)", /<label class="ck" hidden><input type="checkbox" id="castRaw">/.test(html));
  check('the lab loads ecran.js and mirrors the actions of the server', labHtml.indexOf('../ecran.js') > 0 && labHtml.indexOf('../ecran.js') < labHtml.indexOf('../screens.js')
    && ['ecran.code', 'ecran.fail', 'airplay.stop', 'lab.ecran'].every(a => hub.includes(`'${a}'`)));
  const send = fs.readFileSync(path.join(WEB, 'ecran.html'), 'utf8');
  check('the sender page: getDisplayMedia feature-detected, 1280 x 720 at 30 im/s, H.264 first, 4 Mb/s, the help for http',
    /isSecureContext && navigator\.mediaDevices && typeof navigator\.mediaDevices\.getDisplayMedia === 'function'/.test(send) && /max: 1280/.test(send) && /max: 720/.test(send)
    && /max: 30/.test(send) && /video\\\/h264/i.test(send) && /maxBitrate = 4e6/.test(send) && /<!-- PIXEL:CONFIG -->/.test(send) && /unsafely-treat-insecure-origin-as-secure/.test(send));
  check('the sender page has nothing to load (it also opens from the disk)', !/<script\s+src=|<link\s+rel="stylesheet"/.test(send));
  console.log(`\n${fails} failure(s)`);
  process.exit(fails ? 1 : 0);
})();
