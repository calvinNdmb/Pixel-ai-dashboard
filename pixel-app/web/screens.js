/* Pixel's screens, drawn on the 800x480 canvas. Data comes from the server state (P). */
const Screens = (() => {
const cv = document.getElementById('crt'), X = cv.getContext('2d'), W = 800, H = 480;
const G = '#46ff82', D = '#1e7840', DK = '#0d3019', B = '#061009', AM = '#ffb347', PK = '#ff7aa8', WH = '#d6ffe2';
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const F = s => `${s}px VT323, "DejaVu Sans Mono", monospace`;
const rnd = Math.random, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), ease = (a, b, k) => a + (b - a) * k;
const pad = n => String(Math.floor(n)).padStart(2, '0');
let now = performance.now(), hits = [], P = null, send = () => {}, offset = 0, first = true;
const L = { scr: 'visage', ptr: null, look: { x: 0, y: 0, tx: 0, ty: 0, next: 0 }, blink: { t: -1e9, next: 2500 }, local: null,
  lastInput: now, sleepy: false, banner: null, lastToast: 0, boot: -1, lastBootAt: 0, lightV: {}, kiosk: false };
const srv = () => Date.now() + offset;

/* ---------- drawing helpers ---------- */
function px(x, y, s, c) { X.shadowColor = c; X.fillStyle = c; X.fillRect(x + 1, y + 1, s - 2, s - 2); }
function bmp(rows, x, y, s, c) {
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
    const v = rows[j][i]; if (v === '.' || v === ' ') continue;
    px(x + i * s, y + j * s, s, v === 'p' ? PK : v === 'a' ? AM : v === 'w' ? WH : c);
  }
}
function txt(s, x, y, size, c = G, al = 'left') { X.font = F(size); X.shadowColor = c; X.fillStyle = c; X.textAlign = al; X.textBaseline = 'top'; X.fillText(s, x, y); }
function box(x, y, w, h, c = G, fill) { if (fill) { X.fillStyle = fill; X.shadowColor = fill; X.fillRect(x, y, w, h); } X.strokeStyle = c; X.shadowColor = c; X.lineWidth = 2; X.strokeRect(x + 1, y + 1, w - 2, h - 2); }
function bar(x, y, n, filled, w, h, gap, on = G, off = DK) { for (let i = 0; i < n; i++) { const f = clamp(filled - i, 0, 1); X.fillStyle = off; X.shadowColor = off; X.fillRect(x + i * (w + gap), y, w, h); if (f > 0) { X.fillStyle = on; X.shadowColor = on; X.fillRect(x + i * (w + gap), y, w * f, h); } } }
function hit(x, y, w, h, fn) { hits.push([x, y, w, h, fn]); }
function wrap(s, maxW, size) { X.font = F(size); const out = []; for (const para of String(s).split('\n')) { let line = ''; for (const w of para.split(' ')) { const t = line ? line + ' ' + w : w; if (X.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } out.push(line); } return out; }
function fit(s, maxW, size) { X.font = F(size); s = String(s); if (X.measureText(s).width <= maxW) return s; while (s.length > 1 && X.measureText(s + '…').width > maxW) s = s.slice(0, -1); return s + '…'; }
function para(s, x, y, maxW, size, c, lh = size + 4) { wrap(s, maxW, size).forEach((l, i) => txt(l, x, y + i * lh, size, c)); }
function clock() { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function header(title) { txt('PIXEL OS', 24, 12, 26, D); txt('> ' + title.toUpperCase(), 132, 12, 26, G); txt(clock(), W - 24, 12, 26, D, 'right'); X.fillStyle = D; X.shadowColor = D; X.fillRect(20, 44, W - 40, 3); }
const hm = h => pad(h) + ':' + pad(Math.round(h % 1 * 60));
const nowH = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
const temp = c => P.view.units_f ? Math.round(c * 9 / 5 + 32) + ' °F' : c + ' °C';
function nextEvent() { return (P.agenda.events || []).find(e => e.day === 0 && !e.allday && e.start > nowH()); }
function mood() {
  if (L.local && now < L.local.until) return L.local.name;
  const m = P && P.mood; if (m && (!m.until || srv() < m.until)) return m.name;
  return L.sleepy ? 'endormi' : 'neutre';
}

/* ---------- the face ---------- */
const EYE = {
  o: ['.###.', '#w###', '#####', '#####', '#####', '.###.'], big: ['.###.', '#####', '#w###', '#####', '#####', '#####', '.###.'],
  arc: ['.....', '.###.', '#...#', '#...#', '.....', '.....'], shut: ['.....', '.....', '.....', '#####', '.....', '.....'],
  heart: ['.p.p.', 'ppppp', 'ppppp', '.ppp.', '..p..', '.....'] };
const MOUTH = { smile: ['#...#', '.###.'], big: ['#.....#', '.#...#.', '..###..'], flat: ['#####'], O: ['.##.', '#..#', '#..#', '.##.'], o: ['.#.', '#.#', '.#.'] };
const HEART = ['.p.p.', 'ppppp', '.ppp.', '..p..'];
function face(cx, cy, s, md, lx = 0, ly = 0) {
  if (md === 'content') cy -= Math.round(Math.abs(Math.sin(now / 240)) * 0.8) * s;
  let Le = 'o', R = 'o', M = 'smile', cheeks = true;
  switch (md) {
    case 'content': Le = R = 'arc'; M = 'big'; break;
    case 'surpris': Le = R = 'big'; M = 'O'; cheeks = false; break;
    case 'amoureux': Le = R = 'heart'; M = 'big'; break;
    case 'clin': R = 'arc'; M = 'big'; break;
    case 'endormi': Le = R = 'shut'; M = 'o'; cheeks = false; break;
    case 'reflechit': M = 'flat'; cheeks = false; break;
    case 'ecoute': M = null; break;
  }
  if (now - L.blink.t < 150) { if (Le === 'o' || Le === 'big') Le = 'shut'; if (R === 'o' || R === 'big') R = 'shut'; }
  const ex = Math.round(lx) * s, ey = Math.round(ly) * s;
  bmp(EYE[Le], cx - 10.5 * s + ex, cy - (EYE[Le].length > 6 ? 6.5 : 6) * s + ey, s, G);
  bmp(EYE[R], cx + 5.5 * s + ex, cy - (EYE[R].length > 6 ? 6.5 : 6) * s + ey, s, G);
  if (M) { const m = MOUTH[M]; bmp(m, cx - m[0].length * s / 2 + Math.round(lx / 2) * s, cy + 3.5 * s, s, G); }
  else for (let i = 0; i < 7; i++) { const h = Math.round((0.5 + 0.5 * Math.sin(now / 85 + i * 1.9)) * 2.2 * Math.sin((i + 0.5) / 7 * Math.PI)); for (let k = -h; k <= h; k++) px(cx - 3.5 * s + i * s, cy + 4.5 * s + k * s, s, G); }
  if (cheeks) for (let c = 0; c < 3; c++) { px(cx - 15.5 * s + c * s, cy + 2.5 * s, s, PK); px(cx + 12.5 * s + c * s, cy + 2.5 * s, s, PK); }
  if (md === 'endormi') for (let k = 0; k < 3; k++) { const p = (now / 1500 + k / 3) % 1; X.globalAlpha = 1 - p; txt('z', cx + 9 * s + p * 4 * s, cy - 8 * s - p * 6 * s, Math.round((1.6 + p * 2) * s), G); X.globalAlpha = 1; }
  if (md === 'amoureux') for (let k = 0; k < 3; k++) { const p = (now / 1800 + k / 3) % 1; X.globalAlpha = 1 - p; bmp(HEART, cx + [-17, 14, 2][k] * s, cy - 2 * s - p * 9 * s, Math.max(2, Math.round(s * 0.45)), PK); X.globalAlpha = 1; }
  if (md === 'reflechit') { const n = Math.floor(now / 380) % 4; for (let i = 0; i < n; i++) px(cx + 10 * s + i * 1.7 * s, cy - 9.5 * s, s, G); }
  if (md === 'surpris') bmp(['#', '#', '#', '.', '#'], cx + 13 * s, cy - 11 * s, s, AM);
}

/* ---------- Visage ---------- */
function drawVisage() {
  txt('PIXEL OS 1.0', 24, 14, 24, D); txt(clock(), W - 24, 14, 24, D, 'right');
  const md = mood(); let tx = L.look.tx, ty = L.look.ty;
  if (md === 'reflechit') { tx = 1.5; ty = -1; } else if (L.ptr) { tx = clamp((L.ptr.x - 400) / 120, -1.6, 1.6); ty = clamp((L.ptr.y - 230) / 110, -1, 1); }
  if (md === 'endormi') { tx = 0; ty = 0.4; }
  L.look.x = ease(L.look.x, tx, 0.16); L.look.y = ease(L.look.y, ty, 0.16);
  if (md === 'endormi') X.globalAlpha = 0.55;
  face(400, 236, 16, md, L.look.x, L.look.y); X.globalAlpha = 1;
  const parts = [], r = P.lights.rooms[0], w = P.weather, e = nextEvent();
  if (r) parts.push(`${r.name.toUpperCase()} ${r.on ? r.bri + ' %' : 'ÉTEINT'}`);
  if (w && w.now) parts.push(temp(w.now.t));
  if (e) parts.push(`${hm(e.start)} ${e.title.toUpperCase()}`);
  txt(fit(parts.join('   ·   '), 760, 24), 400, 440, 24, D, 'center');
  hit(0, 0, W, H, () => { if (md === 'endormi') { send('mood.set', { name: 'neutre' }); L.sleepy = false; L.local = { name: 'surpris', until: now + 900 }; } else L.local = { name: 'content', until: now + 1800 }; });
}

/* ---------- Lumières ---------- */
const BULB = ['.###.', '#####', '#####', '.###.', '.....', '.###.'];
function drawLights() {
  header('Lumières');
  const rooms = P.lights.rooms.slice(0, 5);
  if (!rooms.length) { para(`Lampes Hue : ${P.lights.status}. Ouvre Réglages et touche ASSOCIER HUE, puis appuie sur le bouton du pont.`, 24, 80, 752, 32, G); return; }
  const rh = rooms.length > 4 ? 58 : 70;
  rooms.forEach((r, i) => {
    const y = 60 + i * rh, v = L.lightV[r.id] = ease(L.lightV[r.id] ?? (r.on ? r.bri : 0), r.on ? r.bri : 0, 0.12);
    if (r.on) { X.globalAlpha = 0.25 + 0.2 * Math.sin(now / 500 + i); X.fillStyle = AM; X.shadowColor = AM; X.beginPath(); X.arc(48, y + 22, 24, 0, 7); X.fill(); X.globalAlpha = 1; }
    bmp(BULB, 30, y + 2, 7, r.on ? AM : DK);
    txt(fit(r.name, 180, 36), 84, y + 4, 36, r.on ? G : D);
    bar(272, y + 10, 10, v / 10, 30, 28, 6, r.on ? G : D);
    txt(r.on ? Math.round(v) + ' %' : 'ÉTEINT', W - 24, y + 6, 34, r.on ? G : D, 'right');
    hit(20, y, 240, rh - 12, () => send('lights.set', { room: r.id, on: !r.on }));
    hit(266, y, 364, rh - 12, p => send('lights.set', { room: r.id, bri: clamp(Math.ceil((p.x - 266) / 36) * 10, 10, 100) }));
  });
  P.lights.scenes.slice(0, 4).forEach((n, i) => {
    const x = 24 + i * 192, y = 368;
    box(x, y, 176, 50, D); txt(fit(n, 164, 30), x + 88, y + 11, 30, G, 'center');
    hit(x, y, 176, 50, () => send('lights.scene', { name: n }));
  });
  txt("Touche une pièce pour l'allumer · touche la barre pour régler", 400, 440, 22, D, 'center');
}

/* ---------- Claude ---------- */
function drawClaude() {
  header('Claude');
  const C = P.chat, lines = [];
  C.messages.forEach(m => { lines.push([m.role, null]); wrap(m.text || ' ', 560, 30).forEach(l => lines.push([m.role, l])); });
  const vis = lines.slice(-10);
  if (!vis.length) para("Écris ta question en bas de l'écran, ou depuis ton téléphone. Claude peut allumer les lampes, lancer le minuteur, lire la météo et ton agenda.", 24, 70, 560, 30, D);
  vis.forEach(([who, l], i) => { const y = 56 + i * 33; if (l === null) txt(who === 'user' ? 'TOI >' : 'CLAUDE >', 24, y + 4, 24, who === 'user' ? D : AM); else txt(l, 40, y, 30, who === 'user' ? G : WH); });
  if (C.phase === 'answer' && Math.floor(now / 300) % 2 && vis.length) { const last = vis[vis.length - 1][1] || ''; X.font = F(30); X.fillRect(40 + X.measureText(last).width + 4, 56 + (vis.length - 1) * 33 + 4, 12, 24); }
  face(700, 140, 6, C.phase === 'think' ? 'reflechit' : C.phase === 'answer' ? 'content' : 'neutre');
  X.fillStyle = D; X.fillRect(612, 60, 2, 360);
  txt(C.phase === 'think' ? 'RÉFLÉCHIT' + '.'.repeat(1 + Math.floor(now / 300) % 3) : C.phase === 'answer' ? 'RÉPOND' : 'PRÊT', 700, 236, 30, C.phase === 'idle' ? D : AM, 'center');
  if (C.status && C.status !== 'prêt') wrap(C.status, 160, 22).forEach((l, i) => txt(l, 700, 280 + i * 24, 22, D, 'center'));
}

/* ---------- Codex ---------- */
function drawCodex() {
  header('Codex');
  const c = P.codex, spin = '|/-\\'[Math.floor(now / 120) % 4];
  if (!c.task) { para("Tape « codex » suivi de ta tâche, par exemple :\ncodex corrige le test qui échoue\n\nCodex travaille dans le dossier de projet choisi dans config.toml. Une notification s'affiche quand il a fini.", 24, 64, 752, 30, D); return; }
  txt(fit('Tâche : ' + c.task, 752, 30), 24, 56, 30, WH);
  const ls = c.lines.slice(-9);
  ls.forEach((l, i) => { const last = i === ls.length - 1; txt((last && c.running ? spin : '>') + ' ' + fit(l, 736, 26), 24, 96 + i * 30, 26, /erreur|error|fail|échec/i.test(l) ? AM : /\bok\b|passed|réussi/i.test(l) ? WH : last ? G : D); });
  if (c.running) { const k = Math.floor(now / 90) % 32; for (let i = 0; i < 25; i++) { const on = Math.abs(i - k + 4) < 3; X.fillStyle = on ? G : DK; X.shadowColor = X.fillStyle; X.fillRect(24 + i * 30, 380, 24, 20); } }
  else bar(24, 380, 25, 25, 24, 20, 6, /terminé/.test(c.status) ? WH : AM);
  txt(c.running ? `EN COURS · ${Math.round((srv() / 1000 - c.started) || 0)} S` : c.status.toUpperCase(), 24, 412, 28, c.running ? G : WH);
}

/* ---------- Météo ---------- */
const CLOUD = ['...###....', '..#####.##', '.#########', '##########', '.########.'];
const MINI = { soleil: ['a.a.a', '.aaa.', 'aaaaa', '.aaa.', 'a.a.a'], nuage: ['.##..', '####.', '#####', '.....', '.....'], pluie: ['.##..', '####.', '#####', '.#.#.', '#.#..'],
  neige: ['.##..', '####.', '#####', 'w.w.w', '.w.w.'], orage: ['.##..', '####.', '#####', '..a..', '.a...'] };
function sun(cx, cy, u) {
  for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) if (i * i + j * j <= 18) px(cx + i * u, cy + j * u, u, AM);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + now / 2200; for (let r = 0; r < (k % 2 ? 2 : 3); r++) px(cx + Math.round(Math.cos(a) * (6 + r)) * u, cy + Math.round(Math.sin(a) * (6 + r)) * u, u, AM); }
}
function drawMeteo() {
  header('Météo');
  const w = P.weather;
  if (!w || w.error) { para(w ? w.error : 'Chargement de la météo…', 24, 80, 752, 32, G); return; }
  const di = clamp(P.view.meteo_day, 0, w.days.length - 1), d = w.days[di], cur = di === 0 ? { ...d, ...w.now } : d;
  if (d.kind === 'soleil') sun(180, 190, 12);
  else {
    if (d.kind === 'nuage') sun(230, 150, 8);
    bmp(CLOUD, 70 + Math.round(Math.sin(now / 1400) * 2) * 9, 150, 22, d.kind === 'nuage' ? WH : D);
    if (d.kind === 'pluie') for (let k = 0; k < 16; k++) { const p = (now / 700 + k * 0.137) % 1, x = 84 + (k * 47) % 200; px(x, 270 + p * 70, 8, G); px(x, 278 + p * 70, 8, G); }
    if (d.kind === 'neige') for (let k = 0; k < 14; k++) { const p = (now / 2600 + k * 0.17) % 1, x = 84 + (k * 53) % 200 + Math.sin(now / 500 + k) * 6; px(x, 266 + p * 74, 8, WH); }
    if (d.kind === 'orage' && Math.floor(now / 160) % 9 === 0) bmp(['..##', '.##.', '####', '.##.', '##..'], 160, 262, 10, AM);
  }
  txt(temp(di === 0 ? w.now.t : d.tmax), 380, 56, 120, WH); txt(cur.label, 384, 176, 46, G);
  txt(fit(w.city, 390, 28), 384, 226, 28, D); txt(`${di ? `${d.tmin} à ${d.tmax} °C · ` : ''}Vent ${cur.wind} km/h · Humidité ${cur.hum} %`, 384, 258, 24, D);
  hit(0, 48, W, 260, () => send('weather.say'));
  w.days.forEach((e, i) => {
    const x = 26 + i * 152, y = 316, a = i === di;
    box(x, y, 140, 104, a ? G : D); txt(e.name, x + 70, y + 6, 26, a ? WH : D, 'center'); bmp(MINI[e.kind] || MINI.nuage, x + 55, y + 38, 6, a ? G : D);
    txt(temp(e.tmax), x + 70, y + 72, 26, a ? G : D, 'center');
    hit(x, y, 140, 104, () => send('view.set', { key: 'meteo_day', value: i }));
  });
  txt("Touche un jour pour l'afficher · touche le haut pour l'annonce", 400, 438, 22, D, 'center');
}

/* ---------- Minuteur ---------- */
const DIG = { 0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'], 3: ['###', '..#', '###', '..#', '###'], 4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '###', '..#', '###'], 6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '###'], ':': ['.', '#', '.', '#', '.'] };
function drawTimer() {
  header('Minuteur');
  const t = P.timer, left = t.running ? Math.max(0, (t.ends_at - srv()) / 1000) : t.left, done = !t.running && left <= 0;
  txt(t.mode, 400, 58, 38, t.mode === 'TRAVAIL' ? G : AM, 'center');
  const s = Math.ceil(left), m = Math.floor(s / 60), str = (m > 99 ? String(m) : pad(m)) + ':' + pad(s % 60), u = 20;
  let w = -u; for (const ch of str) w += DIG[ch][0].length * u + u;
  let x = 400 - w / 2; const col = done && Math.floor(now / 250) % 2 ? AM : WH;
  for (const ch of str) { bmp(DIG[ch], x, 116, u, col); x += DIG[ch][0].length * u + u; }
  bar(26, 248, 25, left / t.total * 25, 24, 22, 6, AM);
  txt(t.running ? 'EN COURS' : done ? 'TERMINÉ !' : left === t.total ? "TOUCHE L'ÉCRAN POUR DÉMARRER" : 'EN PAUSE', 400, 290, 30, done ? AM : G, 'center');
  txt("SÉANCES AUJOURD'HUI", 24, 362, 26, D); for (let i = 0; i < 8; i++) px(270 + i * 30, 362, 26, i < t.done ? AM : DK);
  txt('Tape « minuteur 10 » pour 10 minutes', 24, 412, 26, D);
  hit(0, 48, W, 300, () => send('timer.toggle'));
}

/* ---------- Agenda ---------- */
function drawAgenda() {
  header('Agenda');
  const day = P.view.agenda_day, evs = (P.agenda.events || []).filter(e => e.day === day), y0 = 100, ph = 26, h0 = 8, h1 = 20, nx = nextEvent();
  txt(day ? 'DEMAIN' : "AUJOURD'HUI", 24, 54, 32, WH);
  const allday = evs.filter(e => e.allday).map(e => e.title).join(' · ');
  if (allday) txt(fit(allday, 380, 24), 200, 60, 24, AM);
  for (let h = h0; h <= h1; h += 2) { const y = y0 + (h - h0) * ph; txt(pad(h), 24, y - 10, 22, D); }
  for (let h = h0; h <= h1; h++) { const y = y0 + (h - h0) * ph; X.fillStyle = DK; X.shadowColor = DK; X.fillRect(64, y, 500, 2); }
  evs.filter(e => !e.allday).forEach(e => {
    const s = clamp(e.start, h0, h1), f = clamp(e.end, s, h1), y = y0 + (s - h0) * ph, hh = Math.max(26, (f - s) * ph);
    box(80, y, 484, hh, e === nx ? WH : G, DK); txt(fit(hm(e.start) + '  ' + e.title, 460, 24), 92, y + (hh - 24) / 2, 24, e === nx ? WH : G);
  });
  if (!evs.length) para(P.agenda.status && P.agenda.status !== 'ok' ? P.agenda.status : 'Rien de prévu.', 90, 180, 460, 28, D);
  if (!day) { const n = nowH(); if (n >= h0 && n <= h1) { const y = y0 + (n - h0) * ph; X.fillStyle = AM; X.shadowColor = AM; X.fillRect(64, y - 1, 500, 3); px(56, y - 6, 12, AM); } }
  X.fillStyle = D; X.fillRect(588, 60, 2, 380);
  txt('PROCHAIN', 604, 62, 24, D);
  if (nx) { const ls = wrap(nx.title, 172, 32).slice(0, 4); ls.forEach((l, i) => txt(l, 604, 92 + i * 32, 32, WH)); const y = 100 + ls.length * 32, mins = Math.round((nx.start - nowH()) * 60);
    txt(hm(nx.start), 604, y, 32, G); txt('dans ' + (mins >= 60 ? Math.floor(mins / 60) + ' h ' + pad(mins % 60) : mins + ' min'), 604, y + 36, 28, AM); }
  else para("Plus rien aujourd'hui", 604, 92, 170, 28, G);
}

/* ---------- Système ---------- */
function spark(a, x, y, w, h, lo, hi, c) { box(x, y, w, h, DK); if (a.length < 2) return; X.strokeStyle = c; X.shadowColor = c; X.lineWidth = 3; X.beginPath(); a.forEach((v, i) => { const xx = x + 4 + i / (a.length - 1) * (w - 8), yy = y + h - 4 - (clamp(v, lo, hi) - lo) / (hi - lo) * (h - 8); i ? X.lineTo(xx, yy) : X.moveTo(xx, yy); }); X.stroke(); }
const go = b => (b / 1e9).toFixed(1).replace('.', ',');
function drawSys() {
  header('Système');
  const s = P.sys, up = (s.uptime || 0) / 60;
  const rows = [['TEMPÉRATURE', s.temp == null ? '—' : Math.round(s.temp) + ' °C', y => spark(s.temps || [], 440, y, 336, 40, 30, 80, G), s.temp > 70],
    ['PROCESSEUR', Math.round(s.cpu || 0) + ' %', y => spark(s.cpus || [], 440, y, 336, 40, 0, 100, AM)],
    ['MÉMOIRE', s.ram_total ? `${go(s.ram_used)} / ${go(s.ram_total)} Go` : '—', y => bar(440, y + 10, 12, 12 * (s.ram_used / s.ram_total || 0), 22, 20, 6)],
    ['WI-FI', s.wifi == null ? '—' : Math.round(s.wifi) + ' dBm', y => { const q = s.wifi == null ? 0 : s.wifi > -55 ? 4 : s.wifi > -65 ? 3 : s.wifi > -75 ? 2 : 1; for (let i = 0; i < 4; i++) { X.fillStyle = i < q ? G : DK; X.shadowColor = X.fillStyle; X.fillRect(440 + i * 22, y + 38 - (i + 1) * 9, 14, (i + 1) * 9); } }],
    ['LUMINOSITÉ', Math.round((s.bright || 1) * 100) + ' %', y => bar(440, y + 10, 10, (s.bright || 1) * 10, 26, 20, 6)],
    ['DISQUE', s.disk == null ? '—' : Math.round(s.disk) + ' % utilisé', y => bar(440, y + 10, 10, (s.disk || 0) / 10, 26, 20, 6, (s.disk || 0) > 90 ? AM : G)],
    ['ALLUMÉ DEPUIS', `${Math.floor(up / 1440)} j ${Math.floor(up % 1440 / 60)} h ${pad(up % 60)} min`, () => {}]];
  rows.forEach(([l, v, f, warn], i) => { const y = 54 + i * 56; txt(l, 24, y + 10, 24, D); txt(v, 210, y + 2, 34, warn ? AM : G); f(y); });
}

/* ---------- Réglages ---------- */
function drawSettings() {
  header('Réglages');
  const st = P.settings, q = st.qr || [], n = q.length || 21, m = Math.floor(236 / (n + 8)), qs = m * (n + 8), qx = 24, qy = 62;
  X.shadowBlur = 0; X.fillStyle = '#e4ffe9'; X.fillRect(qx, qy, qs, qs); X.fillStyle = B;
  q.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '1') X.fillRect(qx + (i + 4) * m, qy + (j + 4) * m, m, m); });
  X.shadowBlur = RM ? 0 : 10;
  const short = u => (u || '').replace(/\?.*$/, '');
  txt('SUR TON TÉLÉPHONE OU TON PC', 290, 60, 24, D); txt(fit(short(st.url), 486, 32), 290, 86, 32, WH); txt(fit('ou ' + short(st.ip_url), 486, 26), 290, 122, 26, G);
  para("Scanne le code : il ouvre l'appli avec ton code d'accès. Ensuite : « Ajouter à l'écran d'accueil ».", 290, 156, 486, 24, D, 26);
  [['HUE', P.lights.status], ['CLAUDE', st.claude], ['STREAM DECK', st.deck], ['MODE', st.demo ? 'DÉMO (fausses données)' : 'normal']].forEach(([k, v], i) => {
    txt(k, 24, 320 + i * 34, 26, D); txt(fit(String(v || '—'), 560, 28), 210, 318 + i * 34, 28, G); });
}

/* ---------- Veille ---------- */
const stars = Array.from({ length: 150 }, () => ({ x: rnd() * 2 - 1, y: rnd() * 2 - 1, z: rnd() }));
const drift = { x: 300, y: 200, vx: 0.045, vy: 0.03 };
function drawVeille(dt) {
  X.shadowBlur = 0;
  for (const st of stars) {
    st.z -= dt * 0.00018; if (st.z < 0.04) { st.x = rnd() * 2 - 1; st.y = rnd() * 2 - 1; st.z = 1; }
    const sx = 400 + st.x / st.z * 260, sy = 240 + st.y / st.z * 160; if (sx < 0 || sx > W || sy < 0 || sy > H) { st.z = 0; continue; }
    const sz = st.z < 0.3 ? 4 : st.z < 0.6 ? 3 : 2; X.fillStyle = st.z < 0.4 ? G : D; X.fillRect(sx, sy, sz, sz);
  }
  X.shadowBlur = RM ? 0 : 10;
  drift.x += drift.vx * dt; drift.y += drift.vy * dt;
  if (drift.x < 110 || drift.x > W - 110) drift.vx *= -1; if (drift.y < 90 || drift.y > H - 90) drift.vy *= -1;
  X.globalAlpha = 0.8; face(Math.round(drift.x), Math.round(drift.y), 6, 'endormi'); X.globalAlpha = 0.45 + 0.35 * Math.sin(now / 900);
  txt("Touche l'écran pour réveiller Pixel", 400, 440, 24, D, 'center'); X.globalAlpha = 1;
  hit(0, 0, W, H, () => send('screen.show', { screen: 'visage' }));
}

/* ---------- Démarrage, notifications ---------- */
function drawBoot() {
  const e = now - L.boot, st = P.settings, ok = v => v && !/non|erreur|absente|démo|pas|injoignable|associer/i.test(v);
  const ram = P.sys.ram_total ? Math.round(P.sys.ram_total / 1.05e9) + ' Go' : '';
  const rows = [['PIXEL BIOS 1.0', null], [`Raspberry Pi 4 ........ ${ram}`, true], ['Écran 4,3" ............ 800x480', true],
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
  X.setTransform(2, 0, 0, 2, 0, 0); X.globalAlpha = 1; X.shadowBlur = 0; X.fillStyle = B; X.fillRect(0, 0, W, H); X.shadowBlur = RM ? 0 : 10;
  if (!P) { txt('CONNEXION À PIXEL' + '.'.repeat(1 + Math.floor(now / 400) % 3), 40, 200, 40, G); if (L.error) para(L.error, 40, 260, 720, 28, AM); }
  else if (L.boot >= 0) drawBoot();
  else (DRAW[L.scr] || drawVisage)(dt);
  drawBanner();
  requestAnimationFrame(frame);
}
return {
  local: L,
  start() { document.fonts?.load('30px VT323').catch(() => {}); requestAnimationFrame(frame); },
  setSend(fn) { send = fn; },
  setState(p) {
    offset = p.server_now - Date.now();
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
