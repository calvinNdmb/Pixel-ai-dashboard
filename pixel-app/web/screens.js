/* Pixel's screens, drawn on the 800x480 canvas in the current theme (themes.js). Data comes from the server state (P). */
const Screens = (() => {
const cv = document.getElementById('crt'), X = cv.getContext('2d'), W = 800, H = 480;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const rnd = Math.random, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), ease = (a, b, k) => a + (b - a) * k;
const pad = n => String(Math.floor(n)).padStart(2, '0');
let now = performance.now(), hits = [], P = null, send = () => {}, offset = 0, first = true;
const L = { scr: 'visage', ptr: null, look: { x: 0, y: 0, tx: 0, ty: 0, next: 0 }, blink: { t: -1e9, next: 2500 }, local: null,
  lastInput: now, sleepy: false, banner: null, lastToast: 0, boot: -1, lastBootAt: 0, lightV: {}, kiosk: false, theme: 'retro' };
const srv = () => Date.now() + offset;
let T, G, D, DK, B, AM, PK, WH;

/* ---------- drawing helpers (theme-aware) ---------- */
const F = (s, k) => T.font(s, k);
function txt(s, x, y, size, c = G, al = 'left', k) { X.font = F(size, k); X.shadowColor = c; X.fillStyle = c; X.textAlign = al; X.textBaseline = 'top'; X.fillText(s, x, y); }
function wrap(s, maxW, size, k) { X.font = F(size, k); const out = []; for (const para of String(s).split('\n')) { let line = ''; for (const w of para.split(' ')) { const t = line ? line + ' ' + w : w; if (X.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } out.push(line); } return out; }
function fit(s, maxW, size, k) { X.font = F(size, k); s = String(s); if (X.measureText(s).width <= maxW) return s; while (s.length > 1 && X.measureText(s + '…').width > maxW) s = s.slice(0, -1); return s + '…'; }
function para(s, x, y, maxW, size, c, lh = size + 4) { wrap(s, maxW, size).forEach((l, i) => txt(l, x, y + i * lh, size, c)); }
const box = (x, y, w, h, c = G, fill) => T.box(x, y, w, h, c, fill);
const bar = (x, y, n, filled, w, h, gap, on = G, off = DK) => T.bar(x, y, n, filled, w, h, gap, on, off);
const face = (cx, cy, s, md, lx = 0, ly = 0) => T.face(cx, cy, s, md, lx, ly);
function hit(x, y, w, h, fn) { hits.push([x, y, w, h, fn]); }
function clock() { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
const header = title => T.header(title, clock());
const hm = h => pad(h) + ':' + pad(Math.round(h % 1 * 60));
const nowH = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
const temp = c => P.view.units_f ? Math.round(c * 9 / 5 + 32) + ' °F' : c + ' °C';
function nextEvent() { return (P.agenda.events || []).find(e => e.day === 0 && !e.allday && e.start > nowH()); }
function mood() {
  if (L.local && now < L.local.until) return L.local.name;
  const m = P && P.mood; if (m && (!m.until || srv() < m.until)) return m.name;
  return L.sleepy ? 'endormi' : 'neutre';
}
const THEMES = PixelThemes({ X, RM, get now() { return now; }, blinkP: () => (now - L.blink.t) / 180, txt, wrap, fit });
function useTheme(id) { if (T && T.id === id) return; T = THEMES[id] || THEMES.retro; ({ fg: G, dim: D, faint: DK, bg: B, accent: AM, pink: PK, hi: WH } = T.c); L.theme = T.id; }
useTheme('retro');

/* ---------- Visage ---------- */
function drawVisage() {
  if (T.id === 'retro') { txt('PIXEL OS 1.0', 24, 14, 24, D); txt(clock(), W - 24, 14, 24, D, 'right'); }
  else txt(clock(), W - 24, 16, 30, D, 'right', 'title');
  const md = mood(); let tx = L.look.tx, ty = L.look.ty;
  if (md === 'reflechit') { tx = 1.5; ty = -1; } else if (L.ptr) { tx = clamp((L.ptr.x - 400) / 120, -1.6, 1.6); ty = clamp((L.ptr.y - 230) / 110, -1, 1); }
  if (md === 'endormi') { tx = 0; ty = 0.4; }
  L.look.x = ease(L.look.x, tx, 0.16); L.look.y = ease(L.look.y, ty, 0.16);
  if (md === 'endormi' && T.id !== 'manga') X.globalAlpha = 0.6;
  face(400, 236, 16, md, L.look.x, L.look.y); X.globalAlpha = 1;
  const parts = [], r = P.lights.rooms[0], w = P.weather, e = nextEvent();
  if (r) parts.push(`${r.name} ${r.on ? r.bri + ' %' : 'éteint'}`);
  if (w && w.now) parts.push(temp(w.now.t));
  if (e) parts.push(`${hm(e.start)} ${e.title}`);
  const tick = parts.join('   ·   ');
  txt(fit(T.id === 'retro' ? tick.toUpperCase() : tick, 760, 24), 400, 440, 24, D, 'center');
  hit(0, 0, W, H, () => { if (md === 'endormi') { send('mood.set', { name: 'neutre' }); L.sleepy = false; L.local = { name: 'surpris', until: now + 900 }; } else L.local = { name: 'content', until: now + 1800 }; });
}

/* ---------- Lumières ---------- */
function drawLights() {
  header('Lumières');
  const rooms = P.lights.rooms.slice(0, 5);
  if (!rooms.length) { para(`Lampes Hue : ${P.lights.status}. Ouvre Réglages et touche ASSOCIER HUE, puis appuie sur le bouton du pont.`, 24, 80, 752, 32, G); return; }
  const rh = rooms.length > 4 ? 58 : 70;
  rooms.forEach((r, i) => {
    const y = 62 + i * rh, v = L.lightV[r.id] = ease(L.lightV[r.id] ?? (r.on ? r.bri : 0), r.on ? r.bri : 0, 0.12);
    T.bulb(48, y + 22, r.on, i);
    txt(fit(r.name, 180, 36), 84, y + 6, 36, r.on ? G : D);
    bar(272, y + 10, 10, v / 10, 30, 28, 6, r.on ? G : D);
    txt(r.on ? Math.round(v) + ' %' : 'ÉTEINT', W - 24, y + 8, 34, r.on ? G : D, 'right');
    hit(20, y, 240, rh - 12, () => send('lights.set', { room: r.id, on: !r.on }));
    hit(266, y, 364, rh - 12, p => send('lights.set', { room: r.id, bri: clamp(Math.ceil((p.x - 266) / 36) * 10, 10, 100) }));
  });
  P.lights.scenes.slice(0, 4).forEach((n, i) => {
    const x = 24 + i * 192, y = 368;
    box(x, y, 176, 50, D); txt(fit(n, 164, 30), x + 88, y + 12, 30, G, 'center');
    hit(x, y, 176, 50, () => send('lights.scene', { name: n }));
  });
  txt("Touche une pièce pour l'allumer · touche la barre pour régler", 400, 440, 22, D, 'center');
}

/* ---------- Claude ---------- */
function drawClaude() {
  header('Claude');
  const C = P.chat;
  if (!C.messages.length) para("Écris ta question en bas de l'écran, ou depuis ton téléphone. Claude peut allumer les lampes, lancer le minuteur, lire la météo et ton agenda.", 24, 74, 560, 30, D);
  if (T.bubbles) {
    const items = []; let y = 404;
    for (let i = C.messages.length - 1; i >= 0 && y > 60; i--) {
      const m = C.messages[i], empty = !m.text && m.role === 'assistant', lines = empty ? [' '] : wrap(m.text, 430, 28);
      X.font = F(28); const w = Math.max(...lines.map(l => X.measureText(l).width), empty ? 60 : 0) + 34, h = lines.length * 30 + 22;
      y -= h + 18; items.push({ m, lines, w, h, y, empty });
    }
    X.save(); X.beginPath(); X.rect(0, 54, 612, 362); X.clip();
    for (const it of items) {
      const mine = it.m.role === 'user', x = mine ? 596 - it.w : 18;
      T.bubble(x, it.y, it.w, it.h, mine);
      if (it.empty) for (let k = 0; k < 3; k++) { X.globalAlpha = 0.3 + 0.7 * ((Math.floor(now / 250) % 3) === k ? 1 : 0.3); X.fillStyle = WH; X.beginPath(); X.arc(x + 22 + k * 16, it.y + it.h / 2, 5, 0, 7); X.fill(); X.globalAlpha = 1; }
      else it.lines.forEach((l, j) => txt(l, x + 17, it.y + 11 + j * 30, 28, mine && T.id === 'moderne' ? G : WH));
    }
    X.restore();
  } else {
    const lines = [];
    C.messages.forEach(m => { lines.push([m.role, null]); wrap(m.text || ' ', 560, 30).forEach(l => lines.push([m.role, l])); });
    const vis = lines.slice(-10);
    vis.forEach(([who, l], i) => { const y = 56 + i * 33; if (l === null) txt(who === 'user' ? 'TOI >' : 'CLAUDE >', 24, y + 4, 24, who === 'user' ? D : AM); else txt(l, 40, y, 30, who === 'user' ? G : WH); });
    if (C.phase === 'answer' && Math.floor(now / 300) % 2 && vis.length) { const last = vis[vis.length - 1][1] || ''; X.font = F(30); X.fillRect(40 + X.measureText(last).width + 4, 56 + (vis.length - 1) * 33 + 4, 12, 24); }
  }
  face(700, 150, 6, C.phase === 'think' ? 'reflechit' : C.phase === 'answer' ? 'content' : 'neutre');
  X.fillStyle = T.id === 'manga' ? G : D; X.globalAlpha = T.id === 'retro' ? 1 : 0.35; X.fillRect(612, 60, 2, 360); X.globalAlpha = 1;
  txt(C.phase === 'think' ? 'RÉFLÉCHIT' + '.'.repeat(1 + Math.floor(now / 300) % 3) : C.phase === 'answer' ? 'RÉPOND' : 'PRÊT', 700, 250, 30, C.phase === 'idle' ? D : AM, 'center');
  if (C.status && C.status !== 'prêt') wrap(C.status, 160, 22).forEach((l, i) => txt(l, 700, 294 + i * 24, 22, D, 'center'));
}

/* ---------- Codex ---------- */
function drawCodex() {
  header('Codex');
  const c = P.codex, spin = '|/-\\'[Math.floor(now / 120) % 4];
  if (!c.task) { para("Tape « codex » suivi de ta tâche, par exemple :\ncodex corrige le test qui échoue\n\nCodex travaille dans le dossier de projet choisi dans config.toml. Une notification s'affiche quand il a fini.", 24, 68, 752, 30, D); return; }
  txt(fit('Tâche : ' + c.task, 752, 30), 24, 60, 30, WH);
  const ls = c.lines.slice(-9);
  ls.forEach((l, i) => { const last = i === ls.length - 1; txt((last && c.running ? spin : '>') + ' ' + fit(l, 736, 26), 24, 98 + i * 30, 26, /erreur|error|fail|échec/i.test(l) ? AM : /\bok\b|passed|réussi/i.test(l) ? WH : last ? G : D); });
  if (c.running) { const k = Math.floor(now / 90) % 32; for (let i = 0; i < 25; i++) bar(24 + i * 30, 380, 1, Math.abs(i - k + 4) < 3 ? 1 : 0, 24, 20, 0, G); }
  else bar(24, 380, 25, 25, 24, 20, 6, /terminé/.test(c.status) ? WH : AM);
  txt(c.running ? `EN COURS · ${Math.round((srv() / 1000 - c.started) || 0)} S` : c.status.toUpperCase(), 24, 414, 28, c.running ? G : WH);
}

/* ---------- Météo ---------- */
function drawMeteo() {
  header('Météo');
  const w = P.weather;
  if (!w || w.error) { para(w ? w.error : 'Chargement de la météo…', 24, 80, 752, 32, G); return; }
  const di = clamp(P.view.meteo_day, 0, w.days.length - 1), d = w.days[di], cur = di === 0 ? { ...d, ...w.now } : d;
  T.weather(d.kind, 180, 200, 'big', true);
  txt(temp(di === 0 ? w.now.t : d.tmax), 380, 56, 120, WH, 'left', T.id === 'retro' ? undefined : 'title'); txt(cur.label, 384, 180, 46, G);
  txt(fit(w.city, 390, 28), 384, 230, 28, D); txt(`${di ? `${d.tmin} à ${d.tmax} °C · ` : ''}Vent ${cur.wind} km/h · Humidité ${cur.hum} %`, 384, 262, 24, D);
  hit(0, 48, W, 260, () => send('weather.say'));
  w.days.forEach((e, i) => {
    const x = 26 + i * 152, y = 316, a = i === di;
    box(x, y, 140, 104, a ? G : D); txt(e.name, x + 70, y + 7, 26, a ? WH : D, 'center'); T.weather(e.kind, x + 70, y + 52, 'mini', a);
    txt(temp(e.tmax), x + 70, y + 74, 26, a ? G : D, 'center');
    hit(x, y, 140, 104, () => send('view.set', { key: 'meteo_day', value: i }));
  });
  txt("Touche un jour pour l'afficher · touche le haut pour l'annonce", 400, 440, 22, D, 'center');
}

/* ---------- Minuteur ---------- */
function drawTimer() {
  header('Minuteur');
  const t = P.timer, left = t.running ? Math.max(0, (t.ends_at - srv()) / 1000) : t.left, done = !t.running && left <= 0;
  txt(t.mode, 400, 58, 38, t.mode === 'TRAVAIL' ? G : AM, 'center', T.id === 'retro' ? undefined : 'title');
  const s = Math.ceil(left), m = Math.floor(s / 60);
  T.digits((m > 99 ? String(m) : pad(m)) + ':' + pad(s % 60), 400, 116, done && Math.floor(now / 250) % 2 ? AM : WH);
  bar(26, 252, 25, left / t.total * 25, 24, 22, 6, AM);
  txt(t.running ? 'EN COURS' : done ? 'TERMINÉ !' : left === t.total ? "TOUCHE L'ÉCRAN POUR DÉMARRER" : 'EN PAUSE', 400, 292, 30, done ? AM : G, 'center');
  txt("SÉANCES AUJOURD'HUI", 24, 362, 26, D); for (let i = 0; i < 8; i++) bar(280 + i * 32, 362, 1, i < t.done ? 1 : 0, 24, 24, 0, AM);
  txt('Tape « minuteur 10 » pour 10 minutes', 24, 412, 26, D);
  hit(0, 48, W, 300, () => send('timer.toggle'));
}

/* ---------- Agenda ---------- */
function drawAgenda() {
  header('Agenda');
  const day = P.view.agenda_day, evs = (P.agenda.events || []).filter(e => e.day === day), y0 = 104, ph = 26, h0 = 8, h1 = 20, nx = nextEvent();
  txt(day ? 'DEMAIN' : "AUJOURD'HUI", 24, 58, 32, WH, 'left', T.id === 'retro' ? undefined : 'title');
  const allday = evs.filter(e => e.allday).map(e => e.title).join(' · ');
  if (allday) txt(fit(allday, 360, 24), 210, 64, 24, AM);
  for (let h = h0; h <= h1; h += 2) txt(pad(h), 24, y0 + (h - h0) * ph - 10, 22, D);
  X.globalAlpha = T.id === 'retro' ? 1 : 0.5;
  for (let h = h0; h <= h1; h++) { X.fillStyle = DK; X.shadowColor = DK; X.fillRect(64, y0 + (h - h0) * ph, 500, 2); }
  X.globalAlpha = 1;
  evs.filter(e => !e.allday).forEach(e => {
    const s = clamp(e.start, h0, h1), f = clamp(e.end, s, h1), y = y0 + (s - h0) * ph, hh = Math.max(26, (f - s) * ph);
    box(80, y, 484, hh, e === nx ? WH : G, DK); txt(fit(hm(e.start) + '  ' + e.title, 460, 24), 92, y + (hh - 24) / 2, 24, e === nx ? WH : G);
  });
  if (!evs.length) para(P.agenda.status && P.agenda.status !== 'ok' ? P.agenda.status : 'Rien de prévu.', 90, 180, 460, 28, D);
  if (!day) { const n = nowH(); if (n >= h0 && n <= h1) { const y = y0 + (n - h0) * ph; X.fillStyle = AM; X.shadowColor = AM; X.fillRect(64, y - 1, 500, 3); X.beginPath(); X.arc(62, y, 6, 0, 7); X.fill(); } }
  X.fillStyle = D; X.globalAlpha = T.id === 'retro' ? 1 : 0.35; X.fillRect(588, 60, 2, 380); X.globalAlpha = 1;
  txt('PROCHAIN', 604, 64, 24, D);
  if (nx) { const ls = wrap(nx.title, 172, 32).slice(0, 4); ls.forEach((l, i) => txt(l, 604, 94 + i * 32, 32, WH)); const y = 102 + ls.length * 32, mins = Math.round((nx.start - nowH()) * 60);
    txt(hm(nx.start), 604, y, 32, G); txt('dans ' + (mins >= 60 ? Math.floor(mins / 60) + ' h ' + pad(mins % 60) : mins + ' min'), 604, y + 36, 28, AM); }
  else para("Plus rien aujourd'hui", 604, 94, 170, 28, G);
}

/* ---------- Système ---------- */
function spark(a, x, y, w, h, lo, hi, c) { box(x, y, w, h, DK); if (a.length < 2) return; X.strokeStyle = c; X.shadowColor = c; X.lineWidth = 3; X.lineJoin = 'round'; X.beginPath(); a.forEach((v, i) => { const xx = x + 6 + i / (a.length - 1) * (w - 12), yy = y + h - 6 - (clamp(v, lo, hi) - lo) / (hi - lo) * (h - 12); i ? X.lineTo(xx, yy) : X.moveTo(xx, yy); }); X.stroke(); }
const go = b => (b / 1e9).toFixed(1).replace('.', ',');
function drawSys() {
  header('Système');
  const s = P.sys, up = (s.uptime || 0) / 60;
  const rows = [['TEMPÉRATURE', s.temp == null ? '—' : Math.round(s.temp) + ' °C', y => spark(s.temps || [], 440, y, 336, 40, 30, 80, G), s.temp > 70],
    ['PROCESSEUR', Math.round(s.cpu || 0) + ' %', y => spark(s.cpus || [], 440, y, 336, 40, 0, 100, AM)],
    ['MÉMOIRE', s.ram_total ? `${go(s.ram_used)} / ${go(s.ram_total)} Go` : '—', y => bar(440, y + 10, 12, 12 * (s.ram_used / s.ram_total || 0), 22, 20, 6)],
    ['WI-FI', s.wifi == null ? '—' : Math.round(s.wifi) + ' dBm', y => { const q = s.wifi == null ? 0 : s.wifi > -55 ? 4 : s.wifi > -65 ? 3 : s.wifi > -75 ? 2 : 1; for (let i = 0; i < 4; i++) bar(440 + i * 22, y + 38 - (i + 1) * 9, 1, i < q ? 1 : 0, 14, (i + 1) * 9, 0); }],
    ['LUMINOSITÉ', Math.round((s.bright || 1) * 100) + ' %', y => bar(440, y + 10, 10, (s.bright || 1) * 10, 26, 20, 6)],
    ['DISQUE', s.disk == null ? '—' : Math.round(s.disk) + ' % utilisé', y => bar(440, y + 10, 10, (s.disk || 0) / 10, 26, 20, 6, (s.disk || 0) > 90 ? AM : G)],
    ['ALLUMÉ DEPUIS', `${Math.floor(up / 1440)} j ${Math.floor(up % 1440 / 60)} h ${pad(up % 60)} min`, () => {}]];
  rows.forEach(([l, v, f, warn], i) => { const y = 56 + i * 56; txt(l, 24, y + 10, 24, D); txt(v, 210, y + 2, 34, warn ? AM : G); f(y); });
}

/* ---------- Réglages ---------- */
const THEME_LIST = [['retro', 'Rétro'], ['moderne', 'Moderne'], ['manga', 'Manga']];
function drawSettings() {
  header('Réglages');
  const st = P.settings, q = st.qr || [], n = q.length || 21, m = Math.floor(220 / (n + 8)), qs = m * (n + 8), qx = 24, qy = 64;
  X.shadowBlur = 0; X.fillStyle = T.qr[0]; X.fillRect(qx, qy, qs, qs); X.fillStyle = T.qr[1];
  q.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '1') X.fillRect(qx + (i + 4) * m, qy + (j + 4) * m, m, m); });
  X.shadowBlur = RM ? 0 : T.glow;
  const short = u => (u || '').replace(/\?.*$/, '');
  txt('SUR TON TÉLÉPHONE OU TON PC', 274, 62, 24, D); txt(fit(short(st.url), 500, 32), 274, 88, 32, WH); txt(fit('ou ' + short(st.ip_url), 500, 26), 274, 124, 26, G);
  para("Scanne le code : il ouvre l'appli avec ton code d'accès. Ensuite : « Ajouter à l'écran d'accueil ».", 274, 158, 500, 24, D, 26);
  [['HUE', P.lights.status], ['CLAUDE', st.claude], ['STREAM DECK', st.deck], ['MODE', st.demo ? 'DÉMO (fausses données)' : 'normal']].forEach(([k, v], i) => {
    txt(k, 24, 300 + i * 30, 24, D); txt(fit(String(v || '—'), 560, 26), 210, 299 + i * 30, 26, G); });
  txt('THÈME', 24, 432, 26, D);
  THEME_LIST.forEach(([id, name], i) => { const x = 210 + i * 176, a = T.id === id; box(x, 420, 160, 46, a ? G : D, a ? G : null); txt(name, x + 80, 431, 28, a ? B : G, 'center'); hit(x, 420, 160, 46, () => send('theme.set', { name: id })); });
}

/* ---------- Veille ---------- */
const stars = Array.from({ length: 150 }, () => ({ x: rnd() * 2 - 1, y: rnd() * 2 - 1, z: rnd() }));
const drift = { x: 300, y: 200, vx: 0.045, vy: 0.03 };
function drawVeille(dt) {
  X.shadowBlur = 0;
  for (const st of stars) {
    st.z -= dt * 0.00018; if (st.z < 0.04) { st.x = rnd() * 2 - 1; st.y = rnd() * 2 - 1; st.z = 1; }
    const sx = 400 + st.x / st.z * 260, sy = 240 + st.y / st.z * 160; if (sx < 0 || sx > W || sy < 0 || sy > H) { st.z = 0; continue; }
    T.star(sx, sy, st.z < 0.3 ? 4 : st.z < 0.6 ? 3 : 2, st.z < 0.4);
  }
  X.shadowBlur = RM ? 0 : T.glow;
  drift.x += drift.vx * dt; drift.y += drift.vy * dt;
  if (drift.x < 110 || drift.x > W - 110) drift.vx *= -1; if (drift.y < 90 || drift.y > H - 90) drift.vy *= -1;
  X.globalAlpha = 0.85; face(Math.round(drift.x), Math.round(drift.y), 6, 'endormi'); X.globalAlpha = 0.45 + 0.35 * Math.sin(now / 900);
  txt("Touche l'écran pour réveiller Pixel", 400, 440, 24, D, 'center'); X.globalAlpha = 1;
  hit(0, 0, W, H, () => send('screen.show', { screen: 'visage' }));
}

/* ---------- Démarrage, notifications ---------- */
function drawBoot() {
  const e = now - L.boot, st = P.settings;
  if (T.id !== 'retro') {                          // splash: Pixel wakes up
    const p = clamp((e - 300) / 2600, 0, 1);
    face(400, 190, 9, e < 2300 ? 'endormi' : 'content');
    txt('Pixel', 400, 316, 70, WH, 'center', 'title');
    bar(250, 412, 20, p * 20, 13, 12, 2, G);
    if (e > 3500) { L.boot = -1; L.local = { name: 'content', until: now + 1500 }; }
    return;
  }
  const ok = v => v && !/non|erreur|absente|démo|pas|injoignable|associer/i.test(v), ram = P.sys.ram_total ? Math.round(P.sys.ram_total / 1.05e9) + ' Go' : '';
  const rows = [['PIXEL BIOS 1.0', null], [`Raspberry Pi 4 ........ ${ram}`, true], ['Écran 7" .............. 800x480', true],
    [`Stream Deck ........... ${(st.deck || '').split(' (')[0]}`, ok(st.deck)], [`Pont Hue .............. ${P.lights.rooms.length} pièces`, P.lights.status === 'ok' || P.lights.status === 'démo'],
    [`Claude ................ ${st.claude || ''}`, ok(st.claude)], ['Chargement de Pixel OS', null]];
  rows.forEach(([l, good], i) => { if (e > i * 330) txt(fit(l, 640, 30), 40, 40 + i * 40, 30, i ? G : WH); if (good !== null && e > i * 330 + 180) txt(good ? 'OK' : '--', 760, 40 + i * 40, 30, good ? WH : AM, 'right'); });
  if (e > 2000) { const p = clamp((e - 2000) / 1200, 0, 1); bar(40, 340, 30, p * 30, 18, 24, 6); txt(Math.round(p * 100) + ' %', 760, 338, 30, G, 'right'); }
  if (Math.floor(now / 400) % 2) X.fillRect(40, 400, 16, 26);
  if (e > 3500) { L.boot = -1; L.local = { name: 'content', until: now + 1500 }; }
}
function drawBanner() {
  const b = L.banner; if (!b) return; const e = now - b.t; if (e > b.ms + 440) { L.banner = null; return; }
  const ls = wrap(b.msg, 680, 26).slice(0, 4), h = 24 + ls.length * 28;
  const k = e < 220 ? e / 220 : e > b.ms + 220 ? (b.ms + 440 - e) / 220 : 1, y = -h - 8 + k * (h + 16);
  box(50, y, 700, h, AM, B); ls.forEach((l, i) => txt(l, 400, y + 12 + i * 28, 26, AM, 'center'));
}

/* ---------- loop and API ---------- */
const DRAW = { visage: drawVisage, lumieres: drawLights, claude: drawClaude, codex: drawCodex, meteo: drawMeteo, minuteur: drawTimer,
  agenda: drawAgenda, systeme: drawSys, reglages: drawSettings, veille: drawVeille };
let last = performance.now();
function update() {
  if (now > L.blink.next) { L.blink.t = now; L.blink.next = now + 2000 + rnd() * 4000; }
  if (now > L.look.next) { const c = rnd() < 0.35; L.look.tx = c ? 0 : (rnd() * 2 - 1) * 1.5; L.look.ty = c ? 0 : (rnd() * 2 - 1) * 0.8; L.look.next = now + 1400 + rnd() * 2600; }
  if (L.kiosk && P && L.scr === 'visage' && !L.sleepy && now - L.lastInput > (P.settings.sleep_min || 10) * 60000) L.sleepy = true;
}
function frame(t) {
  const dt = Math.min(60, t - last); last = t; now = t; update(); hits = [];
  X.setTransform(2, 0, 0, 2, 0, 0); X.globalAlpha = 1; X.shadowBlur = 0; T.bg(dt); X.shadowBlur = RM ? 0 : T.glow;
  if (!P) { txt('CONNEXION À PIXEL' + '.'.repeat(1 + Math.floor(now / 400) % 3), 40, 200, 40, G); if (L.error) para(L.error, 40, 260, 720, 28, AM); }
  else if (L.boot >= 0) drawBoot();
  else (DRAW[L.scr] || drawVisage)(dt);
  drawBanner();
  requestAnimationFrame(frame);
}
return {
  local: L,
  start() { for (const f of ['30px VT323', '30px Fredoka', '30px Bangers', 'bold 30px "Comic Neue"']) document.fonts?.load(f).catch(() => {}); requestAnimationFrame(frame); },
  setSend(fn) { send = fn; },
  setState(p) {
    offset = p.server_now - Date.now(); useTheme(p.view.theme);
    if (first) { L.lastToast = p.toast?.id || 0; L.lastBootAt = p.boot_at; if (L.kiosk) L.boot = now; first = false; }
    if (p.toast && p.toast.id !== L.lastToast) { L.lastToast = p.toast.id; L.banner = { msg: p.toast.msg, ms: p.toast.ms || 3000, t: now }; }
    if (p.boot_at > L.lastBootAt) { L.lastBootAt = p.boot_at; L.boot = now; }
    P = p;
  },
  input() { L.lastInput = now; if (L.sleepy) { L.sleepy = false; L.local = { name: 'surpris', until: now + 900 }; return true; } return false; },
  hit(x, y) { for (let i = hits.length - 1; i >= 0; i--) { const [hx, hy, w, h, fn] = hits[i]; if (x >= hx && x <= hx + w && y >= hy && y <= hy + h) { fn({ x, y }); return; } } },
  toCanvas(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; },
};
})();
