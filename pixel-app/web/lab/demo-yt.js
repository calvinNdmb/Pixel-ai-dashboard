/* Pixel Lab: YouTube on Pixel's screen as the server does it (pixel/youtube.py, pixel/ytcast.py), for demo-hub.js: the orders
   of the phone and of the YouTube app (cast.ytp.cmds), what Pixel's player says (yt.report), the end of a video, the TV code;
   and a pretend YouTube app (lab.ytapp {op: play, pause, resume, seek, volume, stop, connect, disconnect}), to try the Cast
   button without the Node sidecar. demo-hub.js calls it with its state and helpers, and adds the actions it returns. */
window.PixelHubYT = ({ S, mark, toast, start, stop }) => {
const ID = /^[A-Za-z0-9_-]{11}$/, DEFAULT = ['Vidéo YouTube', 'Vidéo YouTube Music', 'Playlist YouTube'];
const num = (v, lo, hi, d = null) => { const n = Number(v); return v === null || v === undefined || v === '' || !Number.isFinite(n) ? d : Math.max(lo, Math.min(hi, n)); };
let appId = null;
S.ytcast = { on: true, status: 'prêt (démo)', ok: true, code: '314 159 265 358', code_at: Date.now(), senders: [], name: 'Pixel' };
const cur = () => S.cast && S.cast.yt ? S.cast : null;
const ytp = c => c.ytp || (c.ytp = { src: 'lien', v: 1, n: 0, cmds: [], st: null });
function pos(c) {                       // youtube.py Player.pos()
  const st = ytp(c).st; if (!st) return c.yt.start || 0;
  let p = st.pos || 0; if (st.state === 1) p += Math.max(0, Date.now() - (st.at || 0)) / 1000;
  return st.dur ? Math.min(p, st.dur) : p;
}
function order(op, kw = {}) {           // youtube.py Player.order()
  const c = cur(); if (!c) return false;
  const p = ytp(c); p.n++; p.cmds = [...p.cmds, { n: p.n, op, ...kw }].slice(-8);
  const st = p.st = { ...(p.st || { state: -1, pos: c.yt.start || 0, dur: 0 }) };
  if (op === 'play' || op === 'pause') Object.assign(st, { pos: pos(c), state: op === 'play' ? 1 : 2 });
  else if (op === 'seek') st.pos = st.dur ? Math.min(kw.to, st.dur) : kw.to;
  else if (op === 'volume') Object.assign(st, { vol: kw.level, muted: kw.level > 0 ? false : !!st.muted });
  else if (op === 'mute') st.muted = kw.on;
  st.at = Date.now(); mark(); return true;
}
function fromApp(id, at = 0) {          // youtube.py Player.from_app()
  const yt = { id, list: '', start: Math.trunc(num(at, 0, 86400, 0)), music: false }, it = window.PixelYT.item(yt), c = cur();
  if (c && ytp(c).src === 'appli') { Object.assign(c, { site: it.site, url: it.url, title: it.title, embed: it.embed, yt, until: 0 }); c.ytp.v++; c.ytp.st = null; mark(); return c; }
  const n = start(it); n.ytp = { src: 'appli', v: 1, n: 0, cmds: [], st: null }; appId = n.id; return n;
}
const A = {
  'yt.play': () => order('play'),
  'yt.pause': () => order('pause'),
  'yt.toggle': () => { const c = cur(), st = c && ytp(c).st; order(st && [0, 2, 5, -1].includes(st.state) ? 'play' : 'pause'); },
  'yt.seek': ({ by = null, to = null } = {}) => { const c = cur(); if (!c) return; const t = to != null ? num(to, 0, 86400) : Math.max(0, pos(c) + num(by, -3600, 3600, 0)); if (t != null) order('seek', { to: Math.round(t * 10) / 10 }); },
  'yt.volume': ({ level = null, by = null } = {}) => { const c = cur(); if (!c) return; const st = ytp(c).st || {}; const v = level != null ? num(level, 0, 100) : num((st.vol ?? 100) + num(by, -100, 100, 0), 0, 100); if (v != null) order('volume', { level: Math.round(v) }); },
  'yt.mute': ({ on = null } = {}) => { const c = cur(); if (!c) return; const st = ytp(c).st || {}; order('mute', { on: on == null ? !st.muted : !!on }); },
  'yt.report': ({ id, vid = '', state = -1, pos: at = 0, dur = 0, vol = null, muted = null, title = '', err = null }) => {
    const c = cur(); if (!c || c.id !== id) return;
    const st = { state: Math.trunc(num(state, -1, 5, -1)), pos: num(at, 0, 86400, 0), dur: num(dur, 0, 86400, 0), at: Date.now(), vid: ID.test(vid) ? vid : c.yt.id };
    if (vol != null) st.vol = Math.round(num(vol, 0, 100, 100));
    if (muted != null) st.muted = !!muted;
    if (err === 'api' || (Number.isInteger(err) && err > 0 && err < 1000)) { st.err = err; const t = Date.now() + 90000; c.until = Math.min(c.until || t, t); }
    const tt = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (tt && DEFAULT.includes(c.title)) { c.title = tt; S.cast_recent.forEach(e => { if (e.url === c.url && DEFAULT.includes(e.title)) e.title = tt; }); }
    ytp(c).st = st;
  },
  'yt.ended': ({ id }) => { const c = cur(); if (c && c.id === id) stop(); },     // the pretend app has no next video
  'ytcast.code': () => start({ kind: 'ytcode', title: 'Code TV YouTube' }, { seconds: 300 }),
  'lab.ytapp': ({ op = 'play', id = 'aqz-KE-bpKQ', pos: at = 0, level = 50, name = 'Téléphone de démo' } = {}) => {    // ytcast.py on_message()
    const c = cur(), mine = c && c.id === appId;
    if (op === 'connect' || op === 'play') {
      if (!S.ytcast.senders.includes(name)) { S.ytcast.senders = [...S.ytcast.senders, name].slice(-5); toast(`YOUTUBE : ${name.toUpperCase()} EST CONNECTÉ`, 3500); }
      if (S.cast && S.cast.kind === 'ytcode') stop();
      if (op === 'play' && ID.test(id)) fromApp(id, at);
    } else if (op === 'disconnect') S.ytcast.senders = S.ytcast.senders.filter(n => n !== name);
    else if (!mine) return;
    else if (op === 'stop') { appId = null; stop(); }
    else if (op === 'seek') order('seek', { to: num(at, 0, 86400, 0) });
    else if (op === 'volume') order('volume', { level: Math.round(num(level, 0, 100, 50)) });
    else if (op === 'pause' || op === 'resume') order(op === 'pause' ? 'pause' : 'play');
  },
};
return A;
};
