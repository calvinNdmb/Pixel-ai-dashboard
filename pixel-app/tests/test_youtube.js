// YouTube on Pixel's screen (web/ytplayer.js and its place in screens.js), without a browser and without YouTube:
//   node tests/test_youtube.js
// Runs the pack, themes.js, persona.js, the scene packs, ytplayer.js and screens.js in a VM with a stub canvas and a stub
// IFrame Player API (YT.Player), then:
// - the links: the same cases as tests/test_youtube.py (tests/youtube_links.json), so the lab and the server agree;
// - the player: its iframe made with the referrer policy and the permissions, over the page's scanlines and under its
//   command bar; the API loaded only for a YouTube cast; the phone's orders run once each, the old ones never;
//   what it does goes to the server; its end ends the cast (a playlist goes on by itself); errors: 153 tries youtube.com,
//   150 shows a card (QR code, French) and hides the player; no API, a player that never starts: said too;
//   the YouTube app's next video in the same player; hidden under the quick menu; gone with the cast;
// - the TV code, the error card, a phone's card: drawn in every theme without an error; the canvas rests while it plays.
const fs = require('fs'), path = require('path'), vm = require('vm');
const WEB = path.join(__dirname, '..', 'web');
let fails = 0;
const check = (name, ok, info = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (!ok && info ? `  [${info}]` : '')); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const stub = () => new Proxy(function () {}, {
  get: (t, k) => k === 'width' || k === 'height' ? 100 : k === Symbol.toPrimitive ? () => 0 : k === 'measureText' ? s => ({ width: String(s).length * 10 }) : k === 'data' ? new Uint8ClampedArray(400 * 4) : stub(),
  set: () => true, apply: () => stub(), construct: () => stub(),
});
const el = tag => ({ tag, children: [], style: {}, attrs: {}, getContext: () => stub(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 480 }),
  addEventListener(n, f) { (this.on ||= {})[n] = f; }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
  append(...c) { c.forEach(x => { x.parentElement = this; this.children.push(x); }); }, remove() { this.removed = true; if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(x => x !== this); } });
const host = el('div'), cmdBar = el('form'); cmdBar.className = 'cmd'; host.append(cmdBar);
host.querySelector = sel => sel.includes('.cmd') ? cmdBar : null;
host.insertBefore = (x, ref) => { x.parentElement = host; host.children.splice(host.children.indexOf(ref), 0, x); };
const crt = { ...el('canvas'), width: 800, height: 480, parentElement: host };
const scripts = [];
let clock = 1000, pending = null;
const players = [];
let autoReady = true;
class FakePlayer {                       // YT.Player on an existing iframe
  constructor(frame, o) { Object.assign(this, { frame, o, calls: [], t: 0, d: 300, vol: 100, muted: false, list: null, idx: 0 }); players.push(this); if (autoReady) setTimeout(() => o.events.onReady({ target: this }), 0); }
  playVideo() { this.calls.push('play'); } pauseVideo() { this.calls.push('pause'); } seekTo(t, a) { this.calls.push(`seek ${t} ${a}`); this.t = t; }
  setVolume(v) { this.calls.push('volume ' + v); this.vol = v; } getVolume() { return this.vol; } mute() { this.calls.push('mute'); this.muted = true; } unMute() { this.calls.push('unmute'); this.muted = false; }
  isMuted() { return this.muted; } getCurrentTime() { return this.t; } getDuration() { return this.d; } getVideoData() { return { video_id: 'aqz-KE-bpKQ', title: 'Big Buck Bunny' }; }
  getPlaylist() { return this.list; } getPlaylistIndex() { return this.idx; } nextVideo() { this.calls.push('next'); } loadVideoById(a) { this.calls.push('load ' + a.videoId + ' ' + a.startSeconds); }
  destroy() { this.destroyed = true; }
  state(n) { this.o.events.onStateChange({ data: n, target: this }); } error(n) { this.o.events.onError({ data: n, target: this }); }
}
const sb = {
  document: { createElement: t => el(t), getElementById: () => crt, activeElement: null, head: { append: s => scripts.push(s) } },
  matchMedia: () => ({ matches: false }), performance: { now: () => clock }, requestAnimationFrame: cb => { pending = cb; },
  addEventListener() {}, devicePixelRatio: 1, DOMMatrix: function () {}, console, Math, Image: class { set src(v) { this.complete = true; this.naturalWidth = 10; this.naturalHeight = 10; } },
  location: { origin: 'http://localhost:8080', search: '?kiosk=1' }, setTimeout, clearTimeout, setInterval, clearInterval, Promise, URL, URLSearchParams,
  Date, Uint8Array, Uint8ClampedArray, Object, JSON, Number, String, Array, Set, Map, isFinite,
};
sb.PixelSon = { on: true, volume: 0.6, scene() {}, say() {}, play() {}, setVolume() {} };
sb.window = sb; vm.createContext(sb);
const PACKS = fs.readdirSync(path.join(WEB, 'scenes')).filter(f => f.endsWith('.js')).sort().map(f => 'scenes/' + f);
for (const f of ['pack52/pixel52.js', 'pack52/pixel52-themes.js', 'themes.js', 'persona.js', ...PACKS, 'ytplayer.js', 'screens.js']) vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), sb, { filename: f });
const Screens = vm.runInContext('Screens', sb), YT = vm.runInContext('PixelYT', sb), L = Screens.local, PER = Screens.persona;
YT.config.apiMs = 80; YT.config.readyMs = 300; YT.config.nextMs = 50;
const themes = Object.keys(sb.PixelThemes({ X: stub(), RM: false, now: 0, blinkP: () => -1, txt() {}, wrap: () => [], fit: s => s }));
const sent = []; Screens.setSend((a, args) => sent.push([a, args || {}]));
const events = []; const ev0 = PER.event; PER.event = (n, d, c) => { events.push([n, d, c]); return ev0(n, d, c); };

const snap = (o = {}) => ({
  screen: 'meteo', mood: { name: 'neutre', until: 0 }, anim: null, scene: null, toast: null, boot_at: 0, server_now: Date.now(), cast: null, cast_recent: [],
  ytcast: { on: true, status: 'prêt', ok: true, code: '349 433 568 226', senders: [], name: 'Pixel' },
  view: { theme: 'retro', face: 'pack', meteo_day: 0, units_f: false, agenda_day: 0, crt_off: false, osk: false },
  lights: { status: 'démo', rooms: [{ id: '0', name: 'Salon', on: true, bri: 80 }], scenes: ['Film'] },
  chat: { phase: 'idle', status: 'prêt', messages: [] }, codex: { task: '', running: false, status: '', lines: [] },
  weather: { city: 'Paris', now: { t: 11, kind: 'soleil', label: 'Soleil', wind: 9, hum: 50 }, days: [0, 1, 2, 3, 4].map(i => ({ name: 'J' + i, full: 'Jour', tmax: 12, tmin: 4, kind: 'nuage', label: 'Nuages', wind: 9, hum: 60 })) },
  agenda: { status: 'ok', events: [] }, timer: { mode: 'TRAVAIL', total: 1500, left: 1500, running: false, ends_at: 0, done: 0 },
  sys: { temp: 50, temps: [], cpus: [], ram_used: 1e9, ram_total: 4e9, bright: 1, wifi: -50 },
  settings: { sleep_min: 10, qr: [], url: '', ip_url: '', claude: 'prêt', deck: '', demo: true, themes, cast: { max_mb: 40, seconds: 120 } }, ...o,
});
let errs = [];
const tick = (ms = 16) => { clock += ms; const cb = pending; pending = null; try { if (cb) cb(clock); } catch (e) { errs.push(e.stack.split('\n').slice(0, 3).join(' ')); } };
const flush = () => new Promise(r => setImmediate(r));
let S = snap(); const set = o => { S = { ...S, ...o, server_now: Date.now() }; Screens.setState(S); };
const QR = Array.from({ length: 25 }, (_, j) => Array.from({ length: 25 }, (_, i) => (i * j + i) % 3 ? '1' : '0').join(''));
let n = 0;
const ytCast = (o = {}, yt = {}) => { const y = { id: 'aqz-KE-bpKQ', list: '', start: 30, music: false, ...yt }; return { ...YT.item(y), id: 'y' + ++n, t0: Date.now(), until: 0, raw: false, qr: QR, ...o }; };
const last = () => players[players.length - 1];
const box = () => host.children.find(x => x.className === 'yt-player' && !x.removed);
const sends = a => sent.filter(([x]) => x === a);

(async () => {
  // ---- the links: the same as the server ----
  const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'youtube_links.json'), 'utf8'));
  const bad = cases.filter(c => JSON.stringify(YT.parse(c.url)) !== JSON.stringify(c.yt));
  check(`PixelYT.parse: the ${cases.length} links of youtube_links.json, as pixel/youtube.py`, !bad.length, bad.slice(0, 3).map(c => c.url + ' -> ' + JSON.stringify(YT.parse(c.url))).join(' | '));
  const it = YT.item(YT.parse('https://youtu.be/aqz-KE-bpKQ?t=90'));
  check('PixelYT.item: as youtube.py item()', it.kind === 'link' && it.site === 'YouTube' && it.title === 'Vidéo YouTube' && it.url === 'https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=90s'
    && it.embed === 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?autoplay=1&playsinline=1&rel=0&enablejsapi=1&start=90', JSON.stringify(it));
  check('the error messages, in French', /ailleurs que sur YouTube/.test(YT.message(150)) && YT.message(101) === YT.message(150) && /Internet/.test(YT.message('api')) && /153/.test(YT.message(153)) && /erreur 7/.test(YT.message(7)));

  Screens.start(); set({}); tick(); L.boot = -1; L.kiosk = true; L.scr = 'meteo';

  // ---- no API yet, YouTube does not answer: said on the screen ----
  let c = ytCast(); sent.length = 0;
  set({ cast: c }); tick(); await flush();
  check('the API is loaded only now, from youtube.com', scripts.length === 1 && scripts[0].src === 'https://www.youtube.com/iframe_api');
  await sleep(150); tick();
  check('YouTube does not answer: an "api" error for the server, the card instead of a black frame', Screens.cast.yt && Screens.cast.yt.err === 'api' && sends('yt.report').some(([, g]) => g.err === 'api' && g.id === c.id)
    && Screens.cast.player === false, JSON.stringify(Screens.cast.yt));
  sent.length = 0; Screens.hit(400, 240);
  check('... and a touch on it stops the cast', sends('cast.stop').length === 1);
  set({ cast: null }); tick();
  sb.YT = { Player: FakePlayer };

  // ---- the player ----
  c = ytCast({ ytp: { src: 'lien', v: 1, n: 3, cmds: [{ n: 3, op: 'pause' }], st: null } }); sent.length = 0;
  set({ cast: c }); tick(); await flush(); await sleep(5); tick();
  const p = last(), b = box(), f = p && p.frame;
  check('a YouTube cast on Pixel: YouTube\'s player over the canvas', p && b && f && f.tag === 'iframe' && b.children.includes(f) && Screens.cast.player && Screens.cast.yt.ready, JSON.stringify(Screens.cast.yt));
  check('its iframe: youtube-nocookie, IFrame API on, its origin, from where the link says', f.src.startsWith('https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?autoplay=1&playsinline=1&rel=0&enablejsapi=1&start=30')
    && f.src.endsWith('&origin=' + encodeURIComponent('http://localhost:8080')), f.src);
  check('... with the referrer policy (no error 153) and the permissions (autoplay, fullscreen), before it loads',
    f.attrs.referrerpolicy === 'strict-origin-when-cross-origin' && /autoplay/.test(f.attrs.allow) && /fullscreen/.test(f.attrs.allow) && /encrypted-media/.test(f.attrs.allow));
  const sbx = String(f.attrs.sandbox || '').split(/\s+/);
  check('... sandboxed before it loads: its origin and scripts (the IFrame API), no window, no leaving Pixel\'s page (the kiosk has no tabs)',
    ['allow-same-origin', 'allow-scripts'].every(x => sbx.includes(x)) && !sbx.some(x => /popups|top-navigation/.test(x)), String(f.attrs.sandbox));
  check('over the page\'s scanlines (z-index 3 > 2), under its command bar (before it)', /z-index:3/.test(b.style.cssText) && host.children.indexOf(b) < host.children.indexOf(cmdBar)
    && /left:2%;top:12.08\d*%;width:73%;height:68.33\d*%/.test(b.style.cssText), b.style.cssText);
  check('ready: it says so to the server', sends('yt.report').some(([, g]) => g.id === c.id && g.vid === 'aqz-KE-bpKQ' && g.title === 'Big Buck Bunny' && g.dur === 300));
  check('the orders already there are not run again (a reload of the page)', !p.calls.includes('pause'), p.calls.join());
  set({ cast: { ...c, ytp: { ...c.ytp, n: 7, cmds: [{ n: 3, op: 'pause' }, { n: 4, op: 'pause' }, { n: 5, op: 'seek', to: 42 }, { n: 6, op: 'volume', level: 40 }, { n: 7, op: 'mute', on: true }] } } }); tick(); tick();
  check('the new orders: pause, seek, volume, mute, once each, in order', p.calls.join() === 'pause,seek 42 true,volume 40,mute', p.calls.join());
  p.calls.length = 0; p.muted = true;
  set({ cast: { ...S.cast, ytp: { ...S.cast.ytp, n: 8, cmds: [...S.cast.ytp.cmds, { n: 8, op: 'volume', level: 60 }] } } }); tick();
  check('a volume above 0 brings the sound back', p.calls.join() === 'volume 60,unmute', p.calls.join());
  sent.length = 0; p.t = 50; p.state(2);
  check('what it does (paused) goes to the server', sends('yt.report').some(([, g]) => g.state === 2 && g.pos === 50 && g.vol === 60 && g.muted === false));
  // the quick menu
  L.inputAt = clock; Screens.menu(true); tick(16);
  check('it hides under the quick menu', b.style.visibility === 'hidden'); Screens.menu(false); tick(16);
  check('... and comes back', b.style.visibility === 'visible');
  // the column: pause and stop
  sent.length = 0; Screens.hit(700, 320); Screens.hit(700, 400); Screens.hit(100, 200);
  check('the column: its key pauses or plays (yt.toggle), below it stops; a touch on the player is the player\'s', sent.map(([a]) => a).join() === 'yt.toggle,cast.stop', JSON.stringify(sent));
  // the canvas rests
  clock += 3000; L.inputAt = -1e9; L.changeAt = -1e9; L.fastUntil = 0; tick(16); tick(200);
  check('while YouTube plays in its frame, the canvas around it draws 10 times a second', L.fpsWant === 10, String(L.fpsWant));
  events.length = 0; set({ act: { name: 'yt.report', t0: Date.now() } }); tick();
  check('its reports are not "an action of the phone" for his personality', !events.some(([nm]) => nm === 'action'), JSON.stringify(events));
  // the end
  sent.length = 0; p.state(0);
  check('the end of the video: yt.ended, once', sends('yt.ended').length === 1 && sends('yt.ended')[0][1].id === c.id);
  p.state(0); check('... once only', sends('yt.ended').length === 1);
  set({ cast: null }); tick();
  check('the cast gone: the player is destroyed, its frame removed', p.destroyed && b.removed && !box() && Screens.cast.yt === null);

  // ---- a playlist goes on by itself ----
  c = ytCast({}, { list: 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG' }); set({ cast: c }); tick(); await flush(); await sleep(5); tick();
  let q = last(); q.list = ['a', 'b', 'c']; q.idx = 0; sent.length = 0;
  check('a playlist: its list in the iframe', /&list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG/.test(q.frame.src));
  q.state(0); await sleep(1200);
  check('the end of a video that is not the last: no end, the next one if it does not go on by itself', !sends('yt.ended').length && q.calls.includes('next'), q.calls.join());
  q.idx = 2; q.state(0);
  check('the end of the last one: the end', sends('yt.ended').length === 1);
  set({ cast: null }); tick();

  // ---- errors ----
  c = ytCast(); set({ cast: c }); tick(); await flush(); await sleep(5); tick();
  q = last(); sent.length = 0; q.error(153); await flush(); await sleep(5); tick();
  const q2 = last();
  check('error 153 (no referrer): tried again once on youtube.com', q2 !== q && q.destroyed && q2.frame.src.startsWith('https://www.youtube.com/embed/aqz-KE-bpKQ?') && !Screens.cast.yt.err && box().children.length === 1, q2.frame.src);
  q2.error(153); tick();
  check('... and if it is refused there too: the error', Screens.cast.yt.err === 153 && sends('yt.report').some(([, g]) => g.err === 153));
  set({ cast: null }); tick();
  c = ytCast(); set({ cast: c }); tick(); await flush(); await sleep(5); tick();
  q = last(); sent.length = 0; errs = []; q.error(150); tick(16); tick(16);
  check('error 150 (embedding not allowed): the server hears it, the player hides, a card instead', Screens.cast.yt.err === 150 && box().style.visibility === 'hidden'
    && sends('yt.report').some(([, g]) => g.err === 150) && Screens.cast.player === false && !sends('yt.ended').length && errs.length === 0, errs.join());
  sent.length = 0; Screens.hit(400, 240); check('... a touch closes it', sends('cast.stop').length === 1);
  set({ cast: null }); tick();
  // a player that never starts
  autoReady = false; c = ytCast(); set({ cast: c }); tick(); await flush(); await sleep(1300); tick();
  check('a player that never says it is ready: the "api" error after a while', Screens.cast.yt && Screens.cast.yt.err === 'api', JSON.stringify(Screens.cast.yt));
  set({ cast: null }); tick(); autoReady = true;

  // ---- the YouTube app: its next video in the same player, without its list ----
  c = ytCast({ ytp: { src: 'appli', v: 1, n: 0, cmds: [], st: null } }, { list: 'RDaqz-KE-bpKQ' }); set({ cast: c }); tick(); await flush(); await sleep(5); tick();
  q = last();
  check('from the YouTube app: its own list stays in the app (not in the player)', !/list=/.test(q.frame.src), q.frame.src);
  q.calls.length = 0;
  set({ cast: { ...c, yt: { id: 'dQw4w9WgXcQ', list: '', start: 5, music: false }, ytp: { ...c.ytp, v: 2 } } }); tick();
  check("the app's next video: loaded in the same player", q.calls.join() === 'load dQw4w9WgXcQ 5' && last() === q && Screens.cast.yt.vid === 'dQw4w9WgXcQ', q.calls.join());
  set({ cast: null }); tick();
  // reloaded page: where the player was
  c = ytCast({ ytp: { src: 'lien', v: 1, n: 0, cmds: [], st: { vid: 'aqz-KE-bpKQ', state: 2, pos: 200.4, dur: 596, at: Date.now() } } });
  set({ cast: c }); tick(); await flush(); await sleep(5); tick();
  check('Pixel\'s screen reloaded: the video starts where it was', /&start=200&/.test(last().frame.src), last().frame.src);
  set({ cast: null }); tick();
  // Pixel's sound cut in the quick menu
  sb.PixelSon.volume = 0; c = ytCast(); set({ cast: c }); tick(); await flush(); await sleep(5); tick();
  check("the quick menu's sound cut: the player starts without sound", last().calls.includes('mute')); sb.PixelSon.volume = 0.6;
  set({ cast: null }); tick();

  // ---- every theme: the player's frame, the error card, the TV code, a phone's card ----
  for (const face of ['pack', 'vivant']) for (const th of themes) {
    errs = []; set({ view: { ...S.view, theme: th, face } });
    for (const [k, make] of Object.entries({
      player: () => ytCast(), code: () => ({ id: 'k' + ++n, kind: 'ytcode', title: 'Code TV YouTube', t0: Date.now(), until: Date.now() + 300000, raw: false }),
    })) {
      set({ cast: make() }); tick(); await flush(); await sleep(2); tick();
      for (const ms of [16, 600, 1500, 5000]) tick(ms);
      if (k === 'player') { last().error(150); for (const ms of [16, 600]) tick(ms); }
      set({ cast: null }); tick();
    }
    set({ ytcast: { ...S.ytcast, code: null }, cast: { id: 'k' + ++n, kind: 'ytcode', title: 'Code TV YouTube', t0: Date.now(), until: Date.now() + 300000, raw: false } }); tick(); tick(600);
    set({ ytcast: { ...S.ytcast, code: '349 433 568 226' }, cast: null }); tick();
    L.kiosk = false; set({ cast: ytCast({ ytp: { src: 'lien', v: 1, n: 0, cmds: [], st: { state: -1, err: 150 } } }) }); tick(); tick(600); set({ cast: ytCast() }); tick(); tick(600); set({ cast: null }); tick(); L.kiosk = true;
    check(`${th}, face ${face}: the player's frame, the error card, the TV code (and while it comes), a phone's card`, errs.length === 0, errs.slice(0, 2).join(' | '));
  }
  L.kiosk = false; const before = players.length; set({ cast: ytCast() }); tick(); await flush();
  check('on a phone: a card, never a player', players.length === before && !box() && Screens.cast.player === false);
  set({ cast: null }); tick(); L.kiosk = true;

  // ---- the files ----
  const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8'), lab = fs.readFileSync(path.join(WEB, 'lab', 'index.html'), 'utf8');
  check('index.html and the lab load ytplayer.js (and the app its remote control)', /src="app\/ytplayer.js"/.test(html) && /src="app\/ytremote.js"/.test(html) && /id="ytRemote"/.test(html)
    && /src="\.\.\/ytplayer.js"/.test(lab) && /src="demo-yt.js"/.test(lab) && lab.indexOf('demo-yt.js') < lab.indexOf('demo-hub.js'));
  const yj = fs.readFileSync(path.join(WEB, 'ytplayer.js'), 'utf8');
  check('ytplayer.js can be inlined in the lab artifact (no "<script" nor "<!--")', !/<script|<!--/i.test(yj) && !/<script|<!--/i.test(fs.readFileSync(path.join(WEB, 'lab', 'demo-yt.js'), 'utf8')));
  const dh = fs.readFileSync(path.join(WEB, 'lab', 'demo-yt.js'), 'utf8');
  check('the lab mirrors every YouTube action of the server', ['yt.play', 'yt.pause', 'yt.toggle', 'yt.seek', 'yt.volume', 'yt.mute', 'yt.report', 'yt.ended', 'ytcast.code'].every(a => dh.includes(`'${a}'`)));
  console.log(`\n${fails} failure(s)`);
  process.exit(fails ? 1 : 0);
})();
