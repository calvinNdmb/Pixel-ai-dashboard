/* Pixel OS: a shared screen on Pixel (pixel/ecran.py, pixel/airplay.py). Two halves:
   - On Pixel's own screen (the kiosk), screens.js calls PixelEcran.open(cast, CA, ctx) when a cast of kind "screen" starts,
     and PixelEcran.close() when it ends. What it receives goes in CA.vid (a <video>) or CA.img (an <img>), and screens.js
     draws it like a video: letterboxed on black, in its true colours, at full speed.
       via "webrtc"  a computer's screen (or a phone's, where its browser can share it): WebRTC, signalled on /ecran/ws,
                     the kiosk answers; H.264 first (the Pi 4 decodes it in hardware), no STUN on the home network
       via "mjpeg"   Android with ScreenStream: its http://<phone>:<port>/stream.mjpeg, loaded here, never by the server
       via "demo"    the lab's fake desktop (a canvas stream), to see it without a computer
       via "airplay" nothing to receive: UxPlay's own window covers Pixel; screens.js draws a slow card underneath
     A phone that mirrors Pixel's screen receives nothing: it shows the card.
   - In the phone app, PixelEcran.panel(P, send, token) drives "Partager un écran" in the Caster panel (index.html).
   Everything is feature-detected: a browser without WebRTC says so to the server instead of breaking. */
window.PixelEcran = (() => {
const H264 = /^video\/h264$/i;
let cur = null;                      // what the open cast holds: { id, ws, pc, v, im, ... }

/* H.264 first, the browser's order for the rest (and nothing changes if the browser cannot say) */
function preferH264(tr) {
  try {
    const caps = window.RTCRtpReceiver && RTCRtpReceiver.getCapabilities && RTCRtpReceiver.getCapabilities('video');
    if (!caps || !tr || typeof tr.setCodecPreferences !== 'function') return;
    tr.setCodecPreferences([...caps.codecs.filter(c => H264.test(c.mimeType)), ...caps.codecs.filter(c => !H264.test(c.mimeType))]);
  } catch (e) { /* the browser's own order */ }
}
function video(ctx) {
  const v = document.createElement('video');
  v.playsInline = true; v.autoplay = true; v.muted = !!ctx.muted;       // the computer's sound plays on Pixel (kiosk.sh lets it start alone)
  return v;
}
function play(v) {                    // with its sound if allowed, else without rather than not at all
  const go = () => { const p = v.play(); if (p && p.catch) p.catch(() => { if (!v.muted) { v.muted = true; go(); } }); };
  try { go(); } catch (e) { /* not a real video */ }
}

/* ---------- WebRTC: the kiosk answers the computer's offer ---------- */
function rtc(c, CA, ctx) {
  if (typeof RTCPeerConnection !== 'function' || typeof WebSocket !== 'function') { ctx.send('ecran.fail', { id: c.id, why: 'webrtc' }); return; }
  const v = video(ctx), pc = new RTCPeerConnection({ iceServers: [] });           // the home network: the host candidates are enough
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ecran/ws');
  const s = cur = { id: c.id, ws, pc, v, said: false, lost: 0 };
  const say = m => { try { if (ws.readyState === 1) ws.send(JSON.stringify(m)); } catch (e) { /* closed */ } };
  const fail = why => { if (cur !== s || s.failed) return; s.failed = true; if (ws.readyState === 1) say({ type: 'fail', why }); else ctx.send('ecran.fail', { id: c.id, why }); };
  ws.onopen = () => say({ type: 'kiosk', session: c.session });
  ws.onmessage = async e => {
    let m; try { m = JSON.parse(e.data); } catch (err) { return; }
    if (cur !== s || !m) return;
    try {
      if (m.type === 'offer' && typeof m.sdp === 'string') {
        await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
        pc.getTransceivers().forEach(t => { if (t.receiver && t.receiver.track && t.receiver.track.kind === 'video') preferH264(t); });
        await pc.setLocalDescription(await pc.createAnswer());
        say({ type: 'answer', sdp: pc.localDescription.sdp });
      } else if (m.type === 'ice') await pc.addIceCandidate(m.candidate || null).catch(() => {});
      else if (m.type === 'stop') { /* the server ends the cast too: the state takes it away */ }
    } catch (err) { fail('webrtc'); }
  };
  ws.onclose = () => { if (cur === s && !s.live) fail('signal'); };
  pc.onicecandidate = e => say({ type: 'ice', candidate: e.candidate ? (e.candidate.toJSON ? e.candidate.toJSON() : e.candidate) : null });
  pc.ontrack = e => {
    if (cur !== s) return;
    if (e.receiver && 'jitterBufferTarget' in e.receiver) { try { e.receiver.jitterBufferTarget = 0; } catch (err) { /* older */ } }   // the lowest delay
    const st = (e.streams && e.streams[0]) || s.ms || (s.ms = new MediaStream());
    if (st === s.ms && !st.getTracks().includes(e.track)) st.addTrack(e.track);
    if (v.srcObject !== st) { v.srcObject = st; play(v); }
    ctx.redraw();
  };
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState; clearTimeout(s.lost);
    if (st === 'failed') fail('reseau');
    else if (st === 'disconnected') s.lost = setTimeout(() => fail('reseau'), 5000);    // a Wi-Fi hiccup: 5 s to come back
  };
  const shown = () => { if (cur === s && !s.live && v.videoWidth) { s.live = true; say({ type: 'live' }); ctx.redraw(); } };
  v.onloadeddata = shown; v.onplaying = shown; v.onresize = () => ctx.redraw();
  CA.vid = v;
}

/* ---------- ScreenStream (Android): its MJPEG stream in an <img> ---------- */
function mjpeg(c, CA, ctx) {
  if (typeof Image !== 'function') return;
  const im = new Image(), s = cur = { id: c.id, im };
  im.decoding = 'async'; im.referrerPolicy = 'no-referrer';
  im.onload = () => { if (cur === s) { s.ok = true; ctx.redraw(); } };     // the first picture (Chromium: then it keeps changing)
  im.onerror = () => { if (cur === s) ctx.send('ecran.fail', { id: c.id, why: 'mjpeg' }); };
  s.timer = setTimeout(() => { if (cur === s && !s.ok) ctx.send('ecran.fail', { id: c.id, why: 'mjpeg' }); }, 15000);
  im.src = c.src; CA.img = im; CA.fps = 30;                                // a new picture all the time: drawn 30 times a second
}

/* ---------- the lab: a fake desktop, so that the shared screen can be seen without a computer ---------- */
function demo(c, CA, ctx) {
  const cv = document.createElement('canvas'); if (!cv.getContext || !cv.captureStream) return;
  const tall = c.shape === 'portrait', w = tall ? 720 : 1280, h = tall ? 1280 : 720, g = cv.getContext('2d'); cv.width = w; cv.height = h;
  const v = video({ muted: true }), s = cur = { id: c.id, v, t0: Date.now() };
  const draw = () => {
    const t = (Date.now() - s.t0) / 1000;
    const sky = g.createLinearGradient(0, 0, w, h); sky.addColorStop(0, '#1d5fd1'); sky.addColorStop(1, '#e8457a'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.92)'; g.fillRect(w * 0.08, h * 0.1, w * 0.56, h * 0.6);                       // a window
    g.fillStyle = '#2b2b33'; g.fillRect(w * 0.08, h * 0.1, w * 0.56, h * 0.06);
    ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(w * 0.1 + i * h * 0.035, h * 0.13, h * 0.012, 0, 7); g.fill(); });
    g.fillStyle = '#2b2b33'; g.font = `bold ${Math.round(h * 0.05)}px sans-serif`; g.fillText(tall ? 'Mon téléphone' : 'Mon ordinateur', w * 0.11, h * 0.26);
    g.font = `${Math.round(h * 0.035)}px sans-serif`; g.fillText('Partagé sur Pixel, en direct', w * 0.11, h * 0.33);
    ['#ff3b30', '#34c759', '#007aff', '#ffcc00'].forEach((col, i) => { g.fillStyle = col; g.fillRect(w * 0.11 + i * w * 0.12, h * 0.4, w * 0.1, h * 0.2); });   // true colours
    g.fillStyle = '#111'; g.fillRect(0, h - h * 0.07, w, h * 0.07);                                                // the task bar, its clock
    g.fillStyle = '#fff'; g.font = `${Math.round(w * 0.03)}px sans-serif`; g.textAlign = 'right'; g.fillText(new Date().toLocaleTimeString('fr-FR'), w * 0.97, h - h * 0.02); g.textAlign = 'left';
    const x = w * 0.5 + Math.cos(t * 1.3) * w * 0.3, y = h * 0.5 + Math.sin(t * 1.7) * h * 0.3;                    // the mouse moves about
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + h * 0.06); g.lineTo(x + h * 0.017, y + h * 0.045); g.lineTo(x + h * 0.04, y + h * 0.045); g.closePath(); g.fill(); g.stroke();
  };
  draw(); s.iv = setInterval(draw, 33);                                     // setInterval: the lab's slow motion must not slow it
  try { s.ms = cv.captureStream(30); v.srcObject = s.ms; s.own = true; play(v); } catch (e) { return; }
  CA.vid = v;
}

function close() {
  const s = cur; cur = null; if (!s) return;
  clearTimeout(s.timer); clearTimeout(s.lost); clearInterval(s.iv);
  if (s.ws) { s.ws.onclose = s.ws.onmessage = null; try { s.ws.close(); } catch (e) { /* closed */ } }
  if (s.pc) { try { s.pc.close(); } catch (e) { /* closed */ } }
  if (s.v) { try { const st = s.v.srcObject; s.v.srcObject = null; if (st && s.own) st.getTracks().forEach(t => t.stop()); } catch (e) { /* gone */ } }
  if (s.im) { s.im.onload = s.im.onerror = null; try { s.im.removeAttribute('src'); } catch (e) { s.im.src = ''; } }   // ends the MJPEG download
}

/* ---------- the phone app: "Partager un écran" (index.html, in the Caster panel) ---------- */
let bound = null;
function panel(P, send, token) {
  const $ = id => document.getElementById(id);
  if (!P || !$('ecranPanel')) return;
  const say = t => { if ($('ecranMsg').textContent !== t) $('ecranMsg').textContent = t; };
  if (!bound) {
    bound = { send, token };
    const canShare = !!(window.isSecureContext && navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function' && typeof RTCPeerConnection === 'function');
    $('ecranSelf').hidden = !canShare;                                      // a computer, or Safari on iOS 27 over https
    $('ecranSelf').addEventListener('click', () => { window.open('/ecran', '_blank', 'noopener'); });
    $('ecranCode').addEventListener('click', () => { bound.send('ecran.code'); say(''); });
    $('ecranPhone').addEventListener('click', async () => {
      const port = Number($('ecranPort').value) || 8080, address = $('ecranAddr').value.trim();
      say('Pixel cherche ton téléphone…');
      try {
        const r = await fetch('/ecran/telephone', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(bound.token ? { 'X-Pixel-Token': bound.token } : {}) },
          body: JSON.stringify({ port, address }), credentials: 'same-origin' });
        const j = await r.json().catch(() => ({}));
        say(j.ok ? "C'est sur l'écran de Pixel !" : j.error || `Erreur ${r.status}.`);
        const f = !j.ok && j.field && $(j.field === 'port' ? 'ecranPort' : 'ecranAddr'); if (f) f.focus();   // what to type (an IPv6 phone: its IPv4 address)
      } catch (e) { say('Pixel ne répond pas. Ton téléphone est-il sur le même Wi-Fi ?'); }
    });
  }
  bound.send = send; bound.token = token;
  const st = P.settings && P.settings.ecran || {}, c = P.cast && P.cast.kind === 'screen' ? P.cast : null;
  const page = st.page || location.origin + '/ecran';
  if ($('ecranPage').textContent !== page.replace(/^https?:\/\//, '')) $('ecranPage').textContent = page.replace(/^https?:\/\//, '');
  const code = c && c.phase === 'code' && c.code ? String(c.code).replace(/^(\d{3})(\d{3})$/, '$1 $2') : '';
  if ($('ecranCodeNow').textContent !== code) $('ecranCodeNow').textContent = code;
  $('ecranCodeNow').hidden = !code;
  const a = P.airplay || {}, words = { off: "pas activé sur ce Pixel (docs/CAST.md, partie AirPlay).", absent: "UxPlay n'est pas installé sur le Pi (docs/CAST.md).",
    attente: "Pixel attend son écran.", pret: 'prêt : Centre de contrôle → Recopie de l\'écran → « ' + (a.name || 'Pixel') + ' ».',
    connecte: 'connecté' + (a.client ? ' : ' + a.client : '') + '.', erreur: 'UxPlay a un souci' + (a.error ? ' : ' + a.error : '') + '.' };
  const air = 'AirPlay : ' + (words[a.status] || words.off);
  if ($('ecranAirplay').textContent !== air) $('ecranAirplay').textContent = air;
}
return {
  open(c, CA, ctx) {
    close();
    if (c.via === 'airplay') { if (ctx.kiosk && c.phase === 'live') CA.fps = 4; return; }   // UxPlay decodes: Pixel draws little underneath
    if (c.via === 'demo') return demo(c, CA, ctx);
    if (!ctx.kiosk) return;                                                 // a phone: the card, nothing to receive
    if (c.via === 'webrtc' && c.session && (c.phase === 'connecting' || c.phase === 'live')) rtc(c, CA, ctx);
    else if (c.via === 'mjpeg' && /^https?:\/\//.test(c.src || '')) mjpeg(c, CA, ctx);
  },
  close,
  get status() { return cur ? { id: cur.id, rtc: !!cur.pc, mjpeg: !!cur.im, demo: !!cur.iv, live: !!cur.live } : null; },   // tests, lab
  panel,
};
})();
