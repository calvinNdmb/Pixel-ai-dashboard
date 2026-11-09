/* The phone's remote control for YouTube on Pixel's screen (pixel/youtube.py, web/ytplayer.js), in the Caster panel of the app:
   the title, where it is (and a slider to go elsewhere), ±10 s, pause, the sound, and what YouTube said when it cannot play it.
   Under it, the YouTube app's side (pixel/ytcast.py): is Pixel in its Cast button, the TV code, who is connected.
   app.js calls PixelYTRemote.render(P, send) with each state; the position moves on by itself between two states. */
window.PixelYTRemote = (() => {
let root = null, P = null, send = () => {}, off = 0, drag = false, ui = null, timer = null;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const setT = (e, t) => { if (e.textContent !== t) e.textContent = t; };
const pad = n => String(Math.floor(n)).padStart(2, '0');
const mmss = s => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600); return (h ? h + ':' + pad(s / 60 % 60) : Math.floor(s / 60)) + ':' + pad(s % 60); };
const btn = (label, aria, fn, cls = '') => { const b = el('button', 'cbtn ' + cls, label); b.type = 'button'; b.setAttribute('aria-label', aria); b.addEventListener('click', fn); return b; };

function build() {
  const r = el('div', 'ytr'); r.hidden = true;
  const title = el('p', 'ytr-title'), from = el('p', 'ytr-from');
  const seek = el('input', 'ytr-range'); seek.type = 'range'; seek.min = '0'; seek.max = '1'; seek.step = '1'; seek.value = '0'; seek.setAttribute('aria-label', 'Position dans la vidéo');
  seek.addEventListener('input', () => { drag = true; setT(ui.time, mmss(seek.value) + ' / ' + mmss(seek.max)); });
  seek.addEventListener('change', () => { drag = false; send('yt.seek', { to: Number(seek.value) }); });
  const time = el('p', 'ytr-time');
  const play = btn('Pause', 'Pause ou lecture', () => send('yt.toggle'), 'big');
  const row1 = el('div', 'ytr-row'); row1.append(btn('−10 s', 'Reculer de 10 secondes', () => send('yt.seek', { by: -10 })), play, btn('+10 s', 'Avancer de 10 secondes', () => send('yt.seek', { by: 10 })));
  const vol = el('input', 'ytr-range'); vol.type = 'range'; vol.min = '0'; vol.max = '100'; vol.step = '5'; vol.value = '100'; vol.setAttribute('aria-label', 'Volume sur Pixel');
  vol.addEventListener('change', () => send('yt.volume', { level: Number(vol.value) }));
  const mute = btn('Couper le son', 'Couper ou remettre le son', () => send('yt.mute'));
  const row2 = el('div', 'ytr-row ytr-vol'); row2.append(el('span', 'ytr-lbl', 'Son'), vol, mute);
  const err = el('p', 'ytr-err'), open = el('a', 'cbtn ytr-open', 'Ouvrir sur YouTube'); open.target = '_blank'; open.rel = 'noopener noreferrer';
  r.append(title, from, seek, time, row1, row2, err, open);
  // the YouTube app's side
  const app = el('div', 'ytc'); app.hidden = true;
  const status = el('p', 'ytc-status'), code = el('p', 'ytc-code'), who = el('p', 'ytc-who');
  const show = btn('Afficher le code TV sur Pixel', 'Afficher le code TV sur l’écran de Pixel', () => send('ytcast.code'));
  app.append(status, code, who, show);
  ui = { r, title, from, seek, time, play, vol, mute, err, open, app, status, code, who, show };
  return [r, app];
}

function cast() {                       // the YouTube cast on Pixel's screen, if there is one
  const c = P && P.cast;
  return c && c.yt && (!c.until || P.server_now < c.until) ? c : null;
}
function pos(st) {
  if (!st) return 0;
  let p = st.pos || 0;
  if (st.state === 1) p += Math.max(0, Date.now() + off - (st.at || 0)) / 1000;
  return st.dur ? Math.min(p, st.dur) : p;
}
function tick() {                       // twice a second: where the video is now
  const c = cast(); if (!c || !ui) return;
  const st = (c.ytp && c.ytp.st) || null, d = st && st.dur ? st.dur : 0, p = pos(st);
  if (!drag) { ui.seek.max = String(Math.max(1, Math.round(d))); ui.seek.value = String(Math.round(p)); setT(ui.time, d ? mmss(p) + ' / ' + mmss(d) + ' · ' + label(st) : label(st)); }
  ui.seek.disabled = !d;
}
function label(st) {
  if (!st) return 'Chargement…';
  if (st.err) return 'Erreur';
  return { 1: 'Lecture', 2: 'En pause', 3: 'Chargement…', 0: 'Terminé', 5: 'Prêt' }[st.state] || 'Chargement…';
}

function render(p, sendFn) {
  P = p; send = sendFn || send; if (!P) return;
  if (!root) {
    root = document.getElementById('ytRemote'); if (!root) return;
    root.append(...build()); timer = setInterval(tick, 500);
  }
  off = (P.server_now || Date.now()) - Date.now();
  const c = cast(), st = c && c.ytp && c.ytp.st;
  ui.r.hidden = !c;
  if (c) {
    setT(ui.title, (c.site || 'YouTube') + ' : ' + (c.title || 'Vidéo'));
    setT(ui.from, c.ytp && c.ytp.src === 'appli' ? "Envoyée depuis l'appli YouTube." : '');
    setT(ui.play, st && (st.state === 1 || st.state === 3) ? 'Pause' : 'Lecture');
    if (st && typeof st.vol === 'number' && document.activeElement !== ui.vol) ui.vol.value = String(st.vol);
    setT(ui.mute, st && st.muted ? 'Remettre le son' : 'Couper le son');
    const msg = st && st.err ? (window.PixelYT ? PixelYT.message(st.err) : 'YouTube ne peut pas la lire sur Pixel.') : '';
    setT(ui.err, msg ? msg + ' Tu peux la regarder sur ton téléphone :' : '');
    ui.open.hidden = !msg; if (msg && window.PixelYT) ui.open.href = PixelYT.watchUrl(c.yt);
    [ui.seek, ui.play, ui.vol, ui.mute].forEach(e => { e.disabled = !!msg; });
    tick();
  }
  const y = P.ytcast || {};
  ui.app.hidden = !y.on && !!c;
  if (!y.on) {
    setT(ui.status, "Caster depuis le bouton de l'appli YouTube : à activer sur le Pi ([ytcast] dans config.toml, voir docs/CAST.md).");
    setT(ui.code, ''); setT(ui.who, ''); ui.show.hidden = true;
  } else {
    setT(ui.status, y.ok ? `Appli YouTube : « ${y.name || 'Pixel'} » est dans le bouton Caster (même Wi-Fi).` : `Appli YouTube : ${y.status || 'démarrage…'}`);
    setT(ui.code, y.code ? 'Code TV : ' + y.code : '');
    setT(ui.who, y.senders && y.senders.length ? 'Connecté : ' + y.senders.join(', ') : '');
    ui.show.hidden = !y.ok;
  }
}
return { render, _tick: tick };
})();
