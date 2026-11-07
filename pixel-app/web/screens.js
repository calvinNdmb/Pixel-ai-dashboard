/* Pixel's screens, drawn on the 800x480 canvas in the current theme (themes.js). Data comes from the server state (P). */
const Screens = (() => {
const cv = document.getElementById('crt'), X = cv.getContext('2d'), W = 800, H = 480;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const rnd = Math.random, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), ease = (a, b, k) => a + (b - a) * k;
const pad = n => String(Math.floor(n)).padStart(2, '0');
let now = performance.now(), hits = [], P = null, send = () => {}, offset = 0, first = true, S = 2;
const L = { inputAt: 0, changeAt: 0, scr: 'visage', ptr: null, blink: { t: -1e9, next: 2500 }, local: null, petted: false,
  lastInput: now, sleepy: false, banner: null, lastToast: 0, boot: -1, lastBootAt: 0, lightV: {}, kiosk: false, theme: 'retro' };
const srv = () => Date.now() + offset;
let T, G, D, DK, B, AM, PK, WH;

/* backing store: 1x on Pixel's own 800x480 screen, 2x on phones and computers */
function fitCanvas() {
  const w = cv.getBoundingClientRect().width, s = !w ? S : (window.devicePixelRatio || 1) * w / W <= 1.05 ? 1 : 2;
  if (s !== S || cv.width !== W * s) { S = s; cv.width = W * S; cv.height = H * S; }
}

/* ---------- drawing helpers (theme-aware) ---------- */
const F = (s, k) => T.font(s, k);
function txt(s, x, y, size, c = G, al = 'left', k) { X.font = F(size, k); X.shadowColor = c; X.fillStyle = c; X.textAlign = al; X.textBaseline = 'top'; X.fillText(s, x, y); }
function wrap(s, maxW, size, k) { X.font = F(size, k); const out = []; for (const para of String(s).split('\n')) { let line = ''; for (const w of para.split(' ')) { const t = line ? line + ' ' + w : w; if (X.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } out.push(line); } return out; }
function fit(s, maxW, size, k) { X.font = F(size, k); s = String(s); if (X.measureText(s).width <= maxW) return s; while (s.length > 1 && X.measureText(s + '…').width > maxW) s = s.slice(0, -1); return s + '…'; }
function para(s, x, y, maxW, size, c, lh = size + 4) { wrap(s, maxW, size).forEach((l, i) => txt(l, x, y + i * lh, size, c)); }
const box = (x, y, w, h, c = G, fill) => T.box(x, y, w, h, c, fill);
const bar = (x, y, n, filled, w, h, gap, on = G, off = DK) => T.bar(x, y, n, filled, w, h, gap, on, off);
const face = (cx, cy, s, md, lx = 0, ly = 0, a) => T.face(cx, cy, s, md, lx, ly, a);
const glow = () => { X.shadowBlur = RM ? 0 : T.glow * S / 2; };
function rule(x, y, w, h) { if (T.rule) return T.rule(x, y, w, h); X.fillStyle = D; X.globalAlpha = 0.35; X.fillRect(x, y, w, h); X.globalAlpha = 1; }
function hit(x, y, w, h, fn) { hits.push([x, y, w, h, fn]); }
function clock() { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
const header = title => T.header(title, clock());
const hm = h => pad(h) + ':' + pad(Math.round(h % 1 * 60));
const nowH = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
const temp = c => P.view.units_f ? Math.round(c * 9 / 5 + 32) + ' °F' : c + ' °C';
function nextEvent() { return (P.agenda.events || []).find(e => e.day === 0 && !e.allday && e.start > nowH()); }
function mood() {
  if (L.local && now < L.local.until) return L.local.name;
  const m = P && P.mood; if (m && m.name !== 'neutre' && (!m.until || srv() < m.until)) return m.name;
  if (L.sleepy) return 'endormi';
  if (P && P.sys && P.sys.temp > 80) return 'malade';
  return 'neutre';
}
const THEMES = PixelThemes({ X, RM, get now() { return now; }, get S() { return S; }, get scr() { return L.boot >= 0 ? 'boot' : L.scr; },
  blinkP: () => (now - L.blink.t) / 180, txt, wrap, fit });
const IDS = Object.keys(THEMES);
function useTheme(id) { if (T && T.id === id) return; T = THEMES[id] || THEMES.retro; ({ fg: G, dim: D, faint: DK, bg: B, accent: AM, pink: PK, hi: WH } = T.c); L.theme = T.id; }
useTheme('retro');
/* one life per face on screen: the big face, the Claude panel, the sleeping face, the boot splash */
const LIFE = { face: PixelLife(), mini: PixelLife(), nap: PixelLife(), boot: PixelLife() };
function live(life, cx, cy, u, md, o = {}) { const a = life.update(now, md, o); face(cx, cy, u, a.mood, a.lx, a.ly, a); return a; }

/* ---------- the user's animation pack (web/pack52): Pixel's face by default, view.face = "pack"; "vivant" = the living face ---------- */
const PACK = (window.Pixel52 && window.Pixel52.animations) || [], PBY = Object.fromEntries(PACK.map(a => [a.id, a]));
const IDLES = PACK.filter(a => a.group === 'Idle');
const MOOD_ANIM = { content: 'content', surpris: 'surpris', amoureux: 'amoureux', clin: 'clin-oeil', endormi: 'sommeil', reflechit: 'reflechit', ecoute: 'ecoute',
  triste: 'triste', fache: 'colere', confus: 'confus', excite: 'etoiles', fier: 'fier', malade: 'batterie-faible', baille: 'baille' };
function PackPlayer() {             // what one pack face plays: an animation while it is wanted, else the idle
  const st = { id: 'idle-respire', time: 0, from: null, k: 1 }; let idling = true;
  const go = id => { if (!PBY[id] || id === st.id) return; st.from = { id: st.id, time: st.time }; st.id = id; st.time = 0; st.k = 0; };
  function nextIdle() {             // a weighted draw over the 18 idles, never the same one twice in a row
    const c = IDLES.filter(a => a.id !== st.id); let r = rnd() * c.reduce((s, a) => s + (a.idleWeight || 1), 0);
    for (const a of c) { r -= a.idleWeight || 1; if (r < 0) return a.id; }
    return c[c.length - 1].id;
  }
  return {
    st,
    update(dt, want, idle = true) {
      st.time += dt / 1000; st.k = Math.min(1, st.k + dt / 260);
      if (want) { go(want); idling = false; }
      else if (!idling) { idling = true; if (idle) go(nextIdle()); }
      else if (idle && IDLES.length && st.time >= (PBY[st.id] ? PBY[st.id].duration : 4)) go(nextIdle());    // one loop of each idle
      return st;
    },
  };
}
const PLAY = { face: PackPlayer(), mini: PackPlayer(), nap: PackPlayer() };
const packMode = () => PACK.length > 0 && !!T.packFace && !(P && P.view && P.view.face === 'vivant');
const serverAnim = () => { const a = P && P.anim; return a && PBY[a.id] && (!a.until || srv() < a.until) ? a.id : null; };
const sleepCycle = () => (now / 1000) % 15 < 10 ? 'sommeil' : 'reve';
function packWant() {               // touch first, then what was asked, then the events, then the mood, then the idle
  if (L.pack && now < L.pack.until) return L.pack.id;                       // a laugh, waking up
  if (L.local && now < L.local.until) return MOOD_ANIM[L.local.name] || null;   // happy, angry, in love (touch)
  const sa = serverAnim(); if (sa) return sa;
  if (L.packEv && now < L.packEv.until) return L.packEv.id;                 // notification, Codex result
  if (P.chat && P.chat.phase === 'answer') return 'parle';
  const md = mood();
  if (md === 'endormi') return sleepCycle();
  if (md !== 'neutre') return MOOD_ANIM[md] || null;
  if (P.codex && P.codex.running) return 'code';
  if (L.kiosk && (P.settings.sleep_min || 10) * 60000 - (now - L.lastInput) < 10000) return 'idle-somnole';   // nodding off
  return null;
}
function packDraw(player, want, x, y, w, h, a) {   // a: life state for the touch physics (squash under the finger, bounce)
  const st = player.update(fdt, want, L.packIdle !== false);
  if (player === PLAY.face) L.packNow = st.id;            // for the lab: what the big face plays
  X.save();
  if (a) { const px = x + w / 2, py = y + h; X.translate(px, py - a.hop * 16); X.scale(1 + 0.5 * a.sq, 1 - 0.5 * a.sq); X.translate(-px, -py); }
  T.packFace(x, y, w, h, st); X.restore();
  return st;
}
const PBOX = { x: 64, y: 50, w: 672, h: 378 };       // 16:9 between the header and the bottom line (7 screen pixels per pack pixel)

/* ---------- Visage ---------- */
function drawVisage() {
  if (T.top) T.top(clock()); else txt(clock(), W - 24, 16, 30, D, 'right', 'title');
  const md = mood(), pack = packMode(), anim = serverAnim(), ptr = L.ptr && !['endormi', 'reflechit'].includes(md) ? { x: clamp((L.ptr.x - 400) / 120, -1.6, 1.6), y: clamp((L.ptr.y - 230) / 110, -1, 1) } : null;
  const sleepIn = L.kiosk && P ? (P.settings.sleep_min || 10) * 60000 - (now - L.lastInput) : Infinity;
  const a = LIFE.face.update(now, md, { look: ptr, idle: now - L.lastInput, sleepIn, calm: RM || pack || !!anim });
  if (pack || (anim && T.packFace)) packDraw(PLAY.face, pack ? packWant() : anim, PBOX.x, PBOX.y, PBOX.w, PBOX.h, a);
  else {
    const nap = (a.mood === 'endormi' ? a.k : 0) + (a.from === 'endormi' ? 1 - a.k : 0);
    X.globalAlpha = 1 - (1 - (T.sleepA ?? 0.6)) * clamp(nap, 0, 1);
    face(400, 236, 16, a.mood, a.lx, a.ly, a); X.globalAlpha = 1;
  }
  const parts = [], r = P.lights.rooms[0], w = P.weather, e = nextEvent();
  if (r) parts.push(`${r.name} ${r.on ? r.bri + ' %' : 'éteint'}`);
  if (w && w.now) parts.push(temp(w.now.t));
  if (e) parts.push(`${hm(e.start)} ${e.title}`);
  const tick = parts.join('   ·   ');
  txt(fit(T.upper ? tick.toUpperCase() : tick, 760, 24), 400, 440, 24, D, 'center');
  hit(0, 0, W, H, () => {
    if (md === 'endormi') { send('mood.set', { name: 'neutre' }); L.sleepy = false; L.local = { name: 'surpris', until: now + 900 }; L.pack = { id: 'reveil', until: now + 5000 }; return; }
    if (L.petted) { L.petted = false; return; }
    const r2 = LIFE.face.tap(now); L.local = r2 ? { name: r2, until: now + 2600 } : { name: 'content', until: now + 1800 };
    if (r2) L.pack = null; else if (rnd() < 0.3) L.pack = { id: 'rire', until: now + 3000 };      // sometimes a tap makes him laugh
  });
}
/* touch: squash under the finger, petting makes him fall in love (taps are handled by the hit above) */
let rubAt = null;
const onFace = p => L.scr === 'visage' && L.boot < 0 && P && Math.abs(p.x - 400) < 330 && p.y > 40 && p.y < 430;
// every new touch clears "petted", so a swipe on another screen still changes screen
cv.addEventListener('pointerdown', e => { const p = toCanvas(e); L.petted = false; if (onFace(p)) { LIFE.face.press(true); rubAt = p; } });
cv.addEventListener('pointermove', e => {
  if (!rubAt) return;
  const p = toCanvas(e), r = LIFE.face.rub(p.x - rubAt.x, p.y - rubAt.y, now); rubAt = p;
  if (r) { L.local = { name: r, until: now + 3200 }; L.petted = true; L.pack = null; }
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) cv.addEventListener(ev, () => { if (rubAt) { LIFE.face.press(false); rubAt = null; } });

/* ---------- Lumières ---------- */
function drawLights() {
  header('Lumières');
  const rooms = P.lights.rooms.slice(0, 5);
  if (!rooms.length) { para(`Lampes Hue : ${P.lights.status}. Ouvre Réglages et touche ASSOCIER HUE, puis appuie sur le bouton du pont.`, 24, 80, 752, 32, G); return; }
  const rh = rooms.length > 4 ? 58 : 70;
  rooms.forEach((r, i) => {
    const goal = r.on ? r.bri : 0, e = ease(L.lightV[r.id] ?? goal, goal, 0.12), y = 62 + i * rh;
    const v = L.lightV[r.id] = Math.abs(e - goal) < 0.5 ? goal : (fast(), e);
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
  txt(fit("Touche une pièce pour l'allumer · touche la barre pour régler", 760, 22), 400, 440, 22, D, 'center');
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
      else it.lines.forEach((l, j) => txt(l, x + 17, it.y + 11 + j * 30, 28, T.bubbleInk ? T.bubbleInk(mine) : WH));
    }
    X.restore();
  } else {
    const lines = [];
    C.messages.forEach(m => { lines.push([m.role, null]); wrap(m.text || ' ', 560, 30).forEach(l => lines.push([m.role, l])); });
    const vis = lines.slice(-10);
    vis.forEach(([who, l], i) => { const y = 56 + i * 33; if (l === null) txt(who === 'user' ? 'TOI >' : 'CLAUDE >', 24, y + 4, 24, who === 'user' ? D : AM); else txt(l, 40, y, 30, who === 'user' ? G : WH); });
    if (C.phase === 'answer' && Math.floor(now / 300) % 2 && vis.length) { const last = vis[vis.length - 1][1] || ''; X.font = F(30); X.fillRect(40 + X.measureText(last).width + 4, 56 + (vis.length - 1) * 33 + 4, 12, 24); }
  }
  const typing = document.activeElement && document.activeElement.id === 'cmd' && document.activeElement.value, sm = P.mood && (!P.mood.until || srv() < P.mood.until) ? P.mood.name : 'neutre';
  if (packMode()) packDraw(PLAY.mini, C.phase === 'think' ? 'reflechit' : C.phase === 'answer' ? 'parle' : typing ? 'ecoute' : serverAnim() || (sm !== 'endormi' && MOOD_ANIM[sm]) || null, 606, 96, 192, 108);
  else live(LIFE.mini, 700, 150, 6, C.phase === 'think' ? 'reflechit' : C.phase === 'answer' ? 'content' : typing ? 'ecoute' : sm === 'endormi' ? 'neutre' : sm, { calm: true });
  rule(612, 60, 2, 360);
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
  txt(temp(di === 0 ? w.now.t : d.tmax), 380, 56, 120, WH, 'left', 'title'); txt(fit(cur.label, 392, 46), 384, 180, 46, G);
  txt(fit(w.city, 390, 28), 384, 230, 28, D); txt(fit(`${di ? `${d.tmin} à ${d.tmax} °C · ` : ''}Vent ${cur.wind} km/h · Humidité ${cur.hum} %`, 392, 24), 384, 262, 24, D);
  hit(0, 48, W, 260, () => send('weather.say'));
  w.days.forEach((e, i) => {
    const x = 26 + i * 152, y = 316, a = i === di;
    box(x, y, 140, 104, a ? G : D); txt(e.name, x + 70, y + 7, 26, a ? WH : D, 'center'); T.weather(e.kind, x + 70, y + 52, 'mini', a);
    txt(temp(e.tmax), x + 70, y + 74, 26, a ? G : D, 'center');
    hit(x, y, 140, 104, () => send('view.set', { key: 'meteo_day', value: i }));
  });
  txt(fit("Touche un jour pour l'afficher · touche le haut pour l'annonce", 760, 22), 400, 440, 22, D, 'center');
}

/* ---------- Minuteur ---------- */
function drawTimer() {
  header('Minuteur');
  const t = P.timer, left = t.running ? Math.max(0, (t.ends_at - srv()) / 1000) : t.left, done = !t.running && left <= 0;
  txt(t.mode, 400, 58, 38, t.mode === 'TRAVAIL' ? G : AM, 'center', 'title');
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
  txt(day ? 'DEMAIN' : "AUJOURD'HUI", 24, 58, 32, WH, 'left', 'title');
  const allday = evs.filter(e => e.allday).map(e => e.title).join(' · ');
  if (allday) txt(fit(allday, 360, 24), 210, 64, 24, AM);
  for (let h = h0; h <= h1; h += 2) txt(pad(h), 24, y0 + (h - h0) * ph - 10, 22, D);
  X.globalAlpha = T.gridA ?? 0.5;
  for (let h = h0; h <= h1; h++) { X.fillStyle = DK; X.shadowColor = DK; X.fillRect(64, y0 + (h - h0) * ph, 500, 2); }
  X.globalAlpha = 1;
  evs.filter(e => !e.allday).forEach(e => {
    const s = clamp(e.start, h0, h1), f = clamp(e.end, s, h1), y = y0 + (s - h0) * ph, hh = Math.max(26, (f - s) * ph);
    box(80, y, 484, hh, e === nx ? WH : G, DK); txt(fit(hm(e.start) + '  ' + e.title, 460, 24), 92, y + (hh - 24) / 2, 24, e === nx ? WH : G);
  });
  if (!evs.length) para(P.agenda.status && P.agenda.status !== 'ok' ? P.agenda.status : 'Rien de prévu.', 90, 180, 460, 28, D);
  if (!day) { const n = nowH(); if (n >= h0 && n <= h1) { const y = y0 + (n - h0) * ph; X.fillStyle = AM; X.shadowColor = AM; X.fillRect(64, y - 1, 500, 3); X.beginPath(); X.arc(62, y, 6, 0, 7); X.fill(); } }
  rule(588, 60, 2, 380);
  txt('PROCHAIN', 604, 64, 24, D);
  if (nx) { const ls = wrap(nx.title, 172, 32).slice(0, 4); ls.forEach((l, i) => txt(fit(l, 180, 32), 604, 94 + i * 32, 32, WH)); const y = 102 + ls.length * 32, mins = Math.round((nx.start - nowH()) * 60);
    txt(hm(nx.start), 604, y, 32, G); txt(fit('dans ' + (mins >= 60 ? Math.floor(mins / 60) + ' h ' + pad(mins % 60) : mins + ' min'), 180, 28), 604, y + 36, 28, AM); }
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
  rows.forEach(([l, v, f, warn], i) => { const y = 56 + i * 56; txt(fit(l, 180, 24), 24, y + 10, 24, D); txt(fit(v, 220, 34), 210, y + 2, 34, warn ? AM : G); f(y); });
}

/* ---------- Réglages ---------- */
let qrC = null;
function qrImage(q, m, qs) {          // the QR code drawn once (about 420 squares), again only if it, the theme or the scale changes
  const key = q.join('') + T.qr.join() + m + 'x' + S;
  if (qrC && qrC.key === key) return qrC;
  const c = qrC = document.createElement('canvas'), g = c.getContext('2d'); c.key = key; c.width = c.height = qs * S;
  g.scale(S, S); g.fillStyle = T.qr[0]; g.fillRect(0, 0, qs, qs); g.fillStyle = T.qr[1];
  q.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '1') g.fillRect((i + 4) * m, (j + 4) * m, m, m); });
  return c;
}
function drawSettings() {
  header('Réglages');
  const st = P.settings, q = st.qr || [], n = q.length || 21, m = Math.floor(220 / (n + 8)), qs = m * (n + 8), qx = 24, qy = 64;
  X.shadowBlur = 0; X.drawImage(qrImage(q, m, qs), qx, qy, qs, qs); glow();
  const short = u => (u || '').replace(/\?.*$/, '');
  txt(fit('SUR TON TÉLÉPHONE OU TON PC', 500, 24), 274, 62, 24, D); txt(fit(short(st.url), 500, 32), 274, 88, 32, WH); txt(fit('ou ' + short(st.ip_url), 500, 26), 274, 124, 26, G);
  para("Scanne le code : il ouvre l'appli avec ton code d'accès. Ensuite : « Ajouter à l'écran d'accueil ».", 274, 158, 500, 24, D, 26);
  txt('VISAGE', 274, 230, 24, D);
  [['pack', 'Pack 52'], ['vivant', 'Vivant']].forEach(([id, name], i) => {
    const x = 380 + i * 142, on = (P.view.face || 'pack') === id;
    box(x, 222, 134, 34, on ? G : D, on ? G : null); txt(name, x + 67, 227, 24, on ? (T.onFg || B) : G, 'center');
    hit(x, 222, 134, 34, () => send('face.set', { name: id }));
  });
  [['HUE', P.lights.status], ['CLAUDE', st.claude], ['STREAM DECK', st.deck], ['MODE', st.demo ? 'DÉMO (fausses données)' : 'normal']].forEach(([k, v], i) => {
    txt(fit(k, 176, 22), 24, 292 + i * 26, 22, D); txt(fit(String(v || '—'), 566, 24), 210, 291 + i * 26, 24, G); });
  // theme picker: chips in rows of 4, as many rows as needed
  const per = 4, rows = Math.ceil(IDS.length / per), ch = rows > 1 ? 34 : 44, cw = 134, y0 = 480 - 8 - rows * (ch + 6) + 6;
  txt('THÈME', 24, y0 + (rows > 1 ? ch - 6 : 8), 26, D);
  IDS.forEach((id, i) => {
    const x = 210 + (i % per) * (cw + 8), y = y0 + Math.floor(i / per) * (ch + 6), on = T.id === id, sz = rows > 1 ? 24 : 28;
    box(x, y, cw, ch, on ? G : D, on ? G : null); txt(fit(THEMES[id].name, cw - 12, sz), x + cw / 2, y + (ch - sz) / 2 + 1, sz, on ? (T.onFg || B) : G, 'center');
    hit(x, y, cw, ch, () => send('theme.set', { name: id }));
  });
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
  glow();
  drift.x += drift.vx * dt; drift.y += drift.vy * dt;
  if (drift.x < 110 || drift.x > W - 110) drift.vx *= -1; if (drift.y < 90 || drift.y > H - 90) drift.vy *= -1;
  X.globalAlpha = 0.85;
  if (packMode()) packDraw(PLAY.nap, sleepCycle(), Math.round(drift.x) - 96, Math.round(drift.y) - 54, 192, 108); else live(LIFE.nap, Math.round(drift.x), Math.round(drift.y), 6, 'endormi', { calm: true });
  X.globalAlpha = 0.45 + 0.35 * Math.sin(now / 900);
  txt("Touche l'écran pour réveiller Pixel", 400, 440, 24, D, 'center'); X.globalAlpha = 1;
  hit(0, 0, W, H, () => send('screen.show', { screen: 'visage' }));
}

/* ---------- Démarrage, notifications ---------- */
const BOOT_MS = 3500;
function bootRows() {
  const st = P.settings;          // a connected Stream Deck reads "Stream Deck MK.2 (15 touches)"; a working Claude reads "prêt"
  return [['Raspberry Pi 4', P.sys.ram_total ? Math.round(P.sys.ram_total / 1.05e9) + ' Go' : '', true], ['Écran 7"', '800x480', true],
    ['Stream Deck', (st.deck || '').split(' (')[0], /touches/.test(st.deck || '')], ['Pont Hue', P.lights.rooms.length + ' pièces', P.lights.status === 'ok' || P.lights.status === 'démo'],
    ['Claude', st.claude || '', st.claude === 'prêt']];
}
function splash(e, info) {                       // default boot: Pixel wakes up under his name
  info.face(400, 190, 9, e < 2300 ? 'endormi' : 'content');
  txt('Pixel', 400, 316, 70, WH, 'center', 'title');
  bar(250, 412, 20, clamp((e - 300) / 2600, 0, 1) * 20, 13, 12, 2, G);
}
function drawBoot() {
  const e = now - L.boot, pack = packMode();
  const info = { rows: bootRows(), face: (cx, cy, u, md) => { if (!pack) return live(LIFE.boot, cx, cy, u, md, { calm: true }); const w = 96 * Math.max(2, Math.round(u * 40 / 96)), h = w * 9 / 16; packDraw(PLAY.face, md === 'endormi' ? 'sommeil' : 'reveil', cx - w / 2, cy - h / 2, w, h); } };
  (T.boot || splash)(e, info);
  if (e > BOOT_MS) { L.boot = -1; L.local = { name: 'content', until: now + 1500 }; if (pack) L.pack = { id: 'reveil', until: now + 4000 }; }
}
function drawBanner() {
  const b = L.banner; if (!b) return; const e = now - b.t; if (e > b.ms + 440) { L.banner = null; return; }
  const big = b.msg.length > 180, fs = big ? 21 : 26, lh = fs + 2, ls = wrap(b.msg, 680, fs).slice(0, big ? 12 : 4), h = 24 + ls.length * lh;
  const k = e < 220 ? e / 220 : e > b.ms + 220 ? (b.ms + 440 - e) / 220 : 1, y = -h - 8 + k * (h + 16);
  box(50, y, 700, h, AM, B); ls.forEach((l, i) => txt(l, 400, y + 12 + i * lh, fs, AM, 'center'));
}

/* ---------- loop and API ---------- */
const DRAW = { visage: drawVisage, lumieres: drawLights, claude: drawClaude, codex: drawCodex, meteo: drawMeteo, minuteur: drawTimer,
  agenda: drawAgenda, systeme: drawSys, reglages: drawSettings, veille: drawVeille };
let last = performance.now(), fitAt = 0, fdt = 16;
/* ---------- frame rate: full speed only while something moves fast ----------
   Most screens are still between two clock ticks, and the Rétro and LCD faces change about 20 times a second:
   drawing them 60 times a second costs the Pi's processor (and heat) for nothing. 60 im/s while a finger is on the
   screen, for 2.5 s after any input, after a change of screen or theme, during a banner and for the quick
   animations; less the rest of the time. A new state from the server is drawn at once. ?fps=full: 60 everywhere. */
const realNow = () => (window.PixelClock ? window.PixelClock.real() : performance.now());   // the lab's slow motion must stay smooth
Object.assign(L, { full: typeof location !== "undefined" && /[?&]fps=full\b/.test(location.search), fastUntil: 0, dirty: true, fpsWant: 60 });
function fast(ms = 150) { L.fastUntil = Math.max(L.fastUntil, realNow() + ms); }
function wantFps() {
  const r = realNow();
  if (L.full || !P || L.boot >= 0 || L.banner || rubAt || (L.local && now < L.local.until) || (L.pack && now < L.pack.until) || r < L.fastUntil || r - L.inputAt < 2500 || r - L.changeAt < 1200) return 60;
  const calm = T.calmFps || 10;                       // still screens: the clock, a blinking cursor
  switch (L.scr) {
    case 'visage': {
      if (!packMode()) return mood() === 'neutre' ? 30 : 60;            // the living face: its idle is slow
      const w = packWant();
      return w && !w.startsWith('idle-') ? (T.faceFps || 60) : Math.min(T.faceFps || 30, 30);   // the idles breathe and blink slowly
    }
    case 'veille': return 15;
    case 'claude': return P.chat.phase !== 'idle' ? 60 : Math.max(calm, 20);
    case 'codex': return P.codex.running ? 30 : calm;
    case 'meteo': return 30;
    case 'minuteur': return P.timer.running ? 20 : calm;
    default: return calm;
  }
}
let drawnAt = -1e9, seenScr = '', seenTheme = '';
function update() {
  if (now > L.blink.next) { L.blink.t = now; L.blink.next = now + 2000 + rnd() * 4000; }   // for faces drawn without a life state
  if (L.kiosk && P && L.scr === 'visage' && !L.sleepy && now - L.lastInput > (P.settings.sleep_min || 10) * 60000) L.sleepy = true;
  if (now > fitAt) { fitAt = now + 1000; fitCanvas(); }
}
function frame(t) {
  requestAnimationFrame(frame);
  now = t;
  const r = realNow();
  if (L.scr !== seenScr || T.id !== seenTheme) { seenScr = L.scr; seenTheme = T.id; L.changeAt = r; }
  L.fpsWant = wantFps();
  if (!L.dirty && r - drawnAt < 1000 / L.fpsWant - 3) return false;   // skipped: the lab's clock does not count it
  L.dirty = false; drawnAt = r;
  const dt = Math.min(120, t - last); last = t; fdt = dt; update(); hits = [];
  X.setTransform(S, 0, 0, S, 0, 0); X.globalAlpha = 1; X.shadowBlur = 0; T.bg(dt); glow();
  if (!P) { txt('CONNEXION À PIXEL' + '.'.repeat(1 + Math.floor(now / 400) % 3), 40, 200, 40, G); if (L.error) para(L.error, 40, 260, 720, 28, AM); }
  else if (L.boot >= 0) drawBoot();
  else (DRAW[L.scr] || drawVisage)(dt);
  drawBanner();
  if (T.fg) { X.shadowBlur = 0; X.globalAlpha = 1; T.fg(dt); }
}
function toCanvas(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
addEventListener('resize', () => { fitAt = 0; });
return {
  local: L,
  start() {
    const fonts = new Set(Object.values(THEMES).flatMap(t => t.fonts || []));
    for (const f of fonts) document.fonts?.load(f).catch(() => {});
    fitCanvas(); requestAnimationFrame(frame);
  },
  setSend(fn) { send = fn; },
  setState(p) {
    offset = p.server_now - Date.now(); useTheme(p.view.theme);
    if (first) { L.lastToast = p.toast?.id || 0; L.lastBootAt = p.boot_at; if (L.kiosk) L.boot = now; first = false; }
    if (P && P.codex && P.codex.running && p.codex && !p.codex.running && p.codex.status !== 'arrêté') L.packEv = { id: /^terminé/.test(p.codex.status) ? 'succes' : 'erreur', until: now + 4000 };
    if (p.toast && p.toast.id !== L.lastToast) {
      L.lastToast = p.toast.id; L.banner = { msg: p.toast.msg, ms: p.toast.ms || 3000, t: now };
      const busy = p.mood && p.mood.name !== 'neutre' && (!p.mood.until || p.server_now < p.mood.until);
      if (!busy && !(L.packEv && now < L.packEv.until) && !/^(THÈME|VISAGE) /.test(p.toast.msg)) L.packEv = { id: 'notification', until: now + 4000 };   // not for our own settings
    }
    if (P && P.screen === 'veille' && p.screen === 'visage') L.pack = { id: 'reveil', until: now + 5000 };
    if (p.anim && p.anim.t0 !== (P && P.anim && P.anim.t0)) { L.pack = null; L.local = null; }   // a new animation asked for takes over at once
    if (p.boot_at > L.lastBootAt) { L.lastBootAt = p.boot_at; L.boot = now; }
    P = p; L.dirty = true;
  },
  input() { L.lastInput = now; L.inputAt = realNow(); if (L.sleepy) { L.sleepy = false; L.local = { name: 'surpris', until: now + 900 }; L.pack = { id: 'reveil', until: now + 5000 }; return true; } return false; },
  hit(x, y) { for (let i = hits.length - 1; i >= 0; i--) { const [hx, hy, w, h, fn] = hits[i]; if (x >= hx && x <= hx + w && y >= hy && y <= hy + h) { fn({ x, y }); return; } } },
  toCanvas,
};
})();
