/* YouTube on Pixel's screen: YouTube's own player (the IFrame Player API) over the canvas, with a remote control on the phone
   and the YouTube app (pixel/youtube.py, pixel/ytcast.py). screens.js makes one for a YouTube cast, on Pixel's screen only
   (a phone shows a card), and draws around it; this file loads the API, runs the orders (cast.ytp.cmds) once each, says what
   the player does (yt.report), when the video is over (yt.ended), and puts its errors in French.
   Defensive: the API is loaded only for a YouTube cast; the iframe is made here, so that its referrer policy (YouTube's
   error 153 without it) and its permissions hold from its first request; youtube-nocookie.com first, youtube.com if
   YouTube refuses it there (152, 153); when YouTube does not answer at all, the screen says so, with a QR code.
   PixelYT.parse: the links, as pixel/youtube.py parse() (the lab's server, the tests). */
window.PixelYT = (() => {
const ID = /^[A-Za-z0-9_-]{11}$/, LIST = /^[A-Za-z0-9_-]{2,64}$/, PRIVATE = ['WL', 'LL'];
const HOSTS = ['youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'youtu.be'];
const C = { apiMs: 15000, readyMs: 20000, nextMs: 3000, reportMs: 5000 };     // how long to wait (the tests make it shorter)

/* ---------- the links (pixel/youtube.py) ---------- */
function startS(v) {                    // t=, start=: 90, 90s, 1m30s, 1h2m3s, 1:30 -> seconds
  v = String(v ?? '').trim().toLowerCase(); let m, s = 0;
  if (v && (m = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/))) s = (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
  else if ((m = v.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/))) s = (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3];
  return Math.min(s, 86400);
}
function parse(url) {                   // {id, list, start, music} or null
  let u; try { u = new URL(String(url ?? '').trim()); } catch { return null; }
  if (!['http:', 'https:'].includes(u.protocol)) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, ''), path = u.pathname.replace(/\/+/g, '/'), q = u.searchParams;
  if (!HOSTS.includes(host)) return null;
  let vid = '';
  if (host === 'youtu.be') vid = path.replace(/^\/+/, '').split('/')[0];
  else if (path.replace(/\/$/, '') === '/watch') vid = q.get('v') || '';
  else { const m = path.match(/^\/(?:shorts|embed|live|v|e)\/([^/]+)/); vid = m && m[1] !== 'videoseries' ? m[1] : ''; }
  if (!ID.test(vid)) vid = '';
  const l = q.get('list') || '', list = LIST.test(l) && !PRIVATE.includes(l) ? l : '';
  if (!vid && !list) return null;
  const frag = new URLSearchParams(u.hash.replace(/^#/, ''));
  return { id: vid, list, start: vid ? startS(q.get('t') || q.get('start') || frag.get('t') || '') : 0, music: host === 'music.youtube.com' };
}
const watchUrl = yt => !yt.id ? `https://www.youtube.com/playlist?list=${yt.list}`
  : `${yt.music ? 'https://music.youtube.com' : 'https://www.youtube.com'}/watch?v=${yt.id}${yt.list ? '&list=' + yt.list : ''}${yt.start ? `&t=${yt.start}s` : ''}`;
const embedUrl = yt => `https://www.youtube-nocookie.com/embed/${yt.id || 'videoseries'}?autoplay=1&playsinline=1&rel=0&enablejsapi=1${yt.start ? '&start=' + yt.start : ''}${yt.list ? '&list=' + yt.list : ''}`;
function item(yt, title = '') {         // youtube.py item(): a YouTube cast
  const site = yt.music ? 'YouTube Music' : 'YouTube';
  return { kind: 'link', site, url: watchUrl(yt), title: String(title || '').trim().slice(0, 200) || (yt.id ? `Vidéo ${site}` : 'Playlist YouTube'), embed: embedUrl(yt), yt };
}

/* ---------- what YouTube's errors mean ---------- */
const NOT_HERE = 'Son auteur ne permet pas de la regarder ailleurs que sur YouTube.';
const MSG = { 2: "Ce lien YouTube n'est pas valable.", 5: "Le lecteur de Pixel n'arrive pas à lire cette vidéo.", 100: "Cette vidéo n'existe plus, ou elle est privée.",
  101: NOT_HERE, 150: NOT_HERE, 152: 'YouTube refuse de la lire sur Pixel.', 153: "YouTube refuse le lecteur de Pixel (erreur 153 : il ne sait pas d'où vient la demande).",
  api: 'YouTube ne répond pas. Pixel est-il connecté à Internet ?' };
const message = code => MSG[code] || (Math.floor(code / 1000) === 152 ? MSG[152] : `YouTube ne peut pas la lire ici (erreur ${code}).`);
const retryable = code => code === 152 || code === 153 || Math.floor(code / 1000) === 152;   // 152-x: a newer code of the same refusal

/* ---------- the IFrame Player API, loaded the first time a YouTube video plays on Pixel's screen ---------- */
let api = null;
function loadApi() {
  if (window.YT && typeof window.YT.Player === 'function') return Promise.resolve(window.YT);
  if (api) return api;
  api = new Promise((ok, ko) => {
    const prev = window.onYouTubeIframeAPIReady, t = setTimeout(() => ko(new Error('api')), C.apiMs);
    window.onYouTubeIframeAPIReady = () => { clearTimeout(t); try { if (typeof prev === 'function') prev(); } catch (e) { /* not ours */ } ok(window.YT); };
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.async = true;
    s.onerror = () => { clearTimeout(t); ko(new Error('api')); };
    (document.head || document.body).append(s);
  });
  api.catch(() => { api = null; });     // the next video tries again
  return api;
}

/* ---------- one player, for one cast ----------
   create(host, cast, {send, rect: {x, y, w, h} on the 800 x 480 canvas, muted, dirty}) -> {sync(cast, hidden), drop(), info(),
   err, state}. sync() every frame: the new orders, the YouTube app's next video, hidden under the quick menu. */
function create(host, c, o = {}) {
  const send = o.send || (() => {}), dirty = o.dirty || (() => {}), r = o.rect || { x: 0, y: 0, w: 800, h: 450 };
  const p0 = c.ytp || {}, st0 = p0.st;
  const ctl = { id: c.id, err: 0, state: -1, ready: false, v: p0.v || 1, seen: p0.n || 0, ended: false, retried: false, www: false, yt: c.yt, src: p0.src || 'lien',
    p: null, frame: null, made: Date.now(), lastRep: 0, vol: null, muted: null, nextAt: 0, hidden: false };
  const box = document.createElement('div');
  box.className = 'yt-player';
  box.style.cssText = `position:absolute;z-index:3;left:${r.x / 8}%;top:${r.y / 4.8}%;width:${r.w / 8}%;height:${r.h / 4.8}%;background:#000;overflow:hidden`;
  const before = host.querySelector && host.querySelector('.cmd, .osk');   // above the page's scanlines (z-index 2), under its command bar
  if (before && before.parentElement === host) host.insertBefore(box, before); else host.append(box);
  // where to start: where Pixel's player was (the kiosk page was reloaded), else where the link says
  const startAt = yt => st0 && st0.vid === yt.id && st0.pos > 2 && !st0.err ? Math.floor(st0.pos + (st0.state === 1 ? Math.max(0, (Date.now() - (st0.at || Date.now())) / 1000) : 0)) : yt.start || 0;
  const call = (f, ...a) => { try { return ctl.p && typeof ctl.p[f] === 'function' ? ctl.p[f](...a) : undefined; } catch (e) { return undefined; } };

  function frame(yt) {                  // the iframe, its address, its referrer policy and permissions before it loads
    if (ctl.frame) ctl.frame.remove();
    const f = document.createElement('iframe'), list = ctl.src === 'appli' ? '' : yt.list;   // the YouTube app plays its own list
    let src = embedUrl({ id: ID.test(yt.id || '') ? yt.id : '', list: LIST.test(list || '') ? list : '', start: Math.max(0, Math.floor(Number(startAt(yt)) || 0)) }) + '&origin=' + encodeURIComponent(location.origin);
    if (ctl.www) src = src.replace('https://www.youtube-nocookie.com/', 'https://www.youtube.com/');
    f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin'); f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen'); f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.title = c.title || 'Vidéo YouTube'; f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0';
    f.src = src; box.append(f); ctl.frame = f; ctl.ready = false; ctl.made = Date.now();
    return f;
  }
  function report(extra = {}) {
    if (ctl.dropped) return;
    const d = call('getVideoData') || {}, num = v => (typeof v === 'number' && isFinite(v) ? v : 0);
    ctl.vol = call('getVolume'); ctl.muted = call('isMuted'); ctl.lastRep = Date.now();
    send('yt.report', { id: ctl.id, vid: d.video_id || ctl.yt.id, state: ctl.state, pos: num(call('getCurrentTime')), dur: num(call('getDuration')),
      vol: typeof ctl.vol === 'number' ? ctl.vol : null, muted: typeof ctl.muted === 'boolean' ? ctl.muted : null, title: d.title || '', err: ctl.err || null, ...extra });
  }
  function fail(code) {
    if (ctl.err === code || ctl.dropped) return;
    ctl.err = code; box.style.visibility = 'hidden'; dirty(); report({ err: code });
  }
  function over() {                     // the end: of the video, or of the playlist
    const list = call('getPlaylist'), i = call('getPlaylistIndex');
    if (Array.isArray(list) && list.length > 1 && typeof i === 'number' && i < list.length - 1) { ctl.nextAt = Date.now() + C.nextMs; return; }   // it goes on by itself
    if (!ctl.ended) { ctl.ended = true; send('yt.ended', { id: ctl.id }); }
  }
  const events = {
    onReady: () => { ctl.ready = true; if (o.muted) call('mute'); dirty(); report(); },
    onStateChange: e => { ctl.state = Number(e && e.data); ctl.nextAt = 0; if (ctl.state === 1) ctl.err = 0; dirty(); report(); if (ctl.state === 0) over(); },
    onError: e => {
      const code = Number(e && e.data) || 5;
      if (retryable(code) && !ctl.retried) { ctl.retried = true; ctl.www = true; return start(); }   // youtube.com instead of youtube-nocookie.com
      fail(code);
    },
    onAutoplayBlocked: () => { call('mute'); call('playVideo'); report(); },   // without sound, rather than not at all
  };
  function start() {
    if (!ID.test(ctl.yt.id || '') && !(ctl.yt.list && LIST.test(ctl.yt.list))) return fail(2);   // the server checked it already
    loadApi().then(YT => {
      if (ctl.dropped) return;
      if (ctl.p) call('destroy');
      try { ctl.p = new YT.Player(frame(ctl.yt), { events }); } catch (e) { fail('api'); }
    }, () => fail('api'));
  }
  function run(cmd) {
    switch (cmd.op) {
      case 'play': return call('playVideo');
      case 'pause': return call('pauseVideo');
      case 'seek': return call('seekTo', Number(cmd.to) || 0, true);
      case 'volume': call('setVolume', Number(cmd.level) || 0); if (cmd.level > 0 && call('isMuted')) call('unMute'); return report();
      case 'mute': cmd.on ? call('mute') : call('unMute'); return report();
    }
  }
  const timer = setInterval(() => {     // the player that never starts, the next of a playlist, and what changes without an event
    if (ctl.dropped || ctl.err) return;
    if (!ctl.ready) { if (Date.now() - ctl.made > C.readyMs) fail('api'); return; }
    if (ctl.nextAt && Date.now() > ctl.nextAt) { ctl.nextAt = 0; if (ctl.state === 0) call('nextVideo'); }
    if (call('getVolume') !== ctl.vol || call('isMuted') !== ctl.muted || (ctl.state === 1 && Date.now() - ctl.lastRep > C.reportMs)) report();
  }, 1000);
  start();

  return Object.assign(ctl, {
    sync(cast, hidden) {
      const p = cast.ytp || {};
      if ((p.v || 1) !== ctl.v && cast.yt && ID.test(cast.yt.id)) {      // the YouTube app's next video, in the same player
        ctl.v = p.v || 1; ctl.yt = cast.yt; ctl.ended = false; ctl.state = -1; ctl.nextAt = 0;
        if (ctl.err || !ctl.ready) { ctl.err = 0; box.style.visibility = ''; start(); }
        else call('loadVideoById', { videoId: cast.yt.id, startSeconds: cast.yt.start || 0 });
        dirty();
      }
      if (ctl.ready) for (const cmd of p.cmds || []) if (cmd.n > ctl.seen) { ctl.seen = cmd.n; run(cmd); }
      const vis = hidden || ctl.err ? 'hidden' : 'visible';
      if (box.style.visibility !== vis) box.style.visibility = vis;
    },
    time() { return [Number(call('getCurrentTime')) || 0, Number(call('getDuration')) || 0]; },
    drop() { ctl.dropped = true; clearInterval(timer); call('destroy'); box.remove(); },
    info() { return { id: ctl.id, ready: ctl.ready, state: ctl.state, err: ctl.err, vid: ctl.yt.id, www: ctl.www, seen: ctl.seen, v: ctl.v, src: ctl.frame ? ctl.frame.src : '' }; },
    el: box,
  });
}

return { parse, watchUrl, embedUrl, item, message, create, loadApi, config: C };
})();
