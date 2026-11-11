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
  const w = cv.getBoundingClientRect().width, s = L.scale || (!w ? S : (window.devicePixelRatio || 1) * w / W <= 1.05 ? 1 : 2);   // L.scale: the Pixel de poche's own (poche.js)
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
const THEMES = PixelThemes({ X, RM, get now() { return now; }, get S() { return S; }, get crt() { return !(P && P.view && P.view.crt_off); }, get scr() { return L.boot >= 0 ? 'boot' : L.scr; },
  blinkP: () => (now - L.blink.t) / 180, txt, wrap, fit });
const IDS = Object.keys(THEMES);
/* Pixel's personality (persona.js): reactions to touch, moods that last, moments of life when nobody looks */
const SON = () => window.PixelSon;                    // his voice (son.js), on the Pi's own screen only
const PER = window.PixelPersona ? window.PixelPersona({ X, rnd, rm: RM, now: () => now, theme: () => T, txt, fit, wrap,
  onScene: id => { if (SON()) SON().scene(id); }, onSay: line => { if (SON()) SON().say(line); } }) : null;
let PV = { id: '', group: '', anim: null, mood: null, m: { x: 0, y: 0, s: 1, r: 0, f: false, sx: 1, sy: 1 } };   // what it asks this frame
const fontsAsked = new Set();
function loadFonts(t) { for (const f of (t && t.fonts) || []) if (!fontsAsked.has(f)) { fontsAsked.add(f); document.fonts?.load(f).catch(() => {}); } }   // a theme's fonts, once
function useTheme(id) { if (T && T.id === id) return; T = THEMES[id] || THEMES.retro; loadFonts(T); ({ fg: G, dim: D, faint: DK, bg: B, accent: AM, pink: PK, hi: WH } = T.c); L.theme = T.id; }
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
  if (PV.id && PV.group !== 'vie') return PV.anim;                          // his personality: a touch, you come back, the lights
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
  if (PV.id) return PV.anim;                                                // a moment of life: the fish, the walk, the nap...
  return null;
}
function moveFace(m, x, y, w, h) {   // the scene's motion around the centre of the face's box
  if (!m || (m.x === 0 && m.y === 0 && m.s === 1 && m.r === 0 && !m.f && (m.sx ?? 1) === 1 && (m.sy ?? 1) === 1)) return;
  const cx = x + w / 2, cy = y + h / 2;
  X.translate(cx + m.x, cy + m.y); X.rotate(m.r); X.scale(m.s * (m.sx ?? 1) * (m.f ? -1 : 1), m.s * (m.sy ?? 1)); X.translate(-cx, -cy);
}
/* pixel themes (Rétro, LCD): a smaller or bigger face is drawn again with whole pixels (2 to 14 screen pixels per
   pack pixel), not squeezed by the canvas, so it stays crisp; the scale is snapped to those sizes */
const snapPix = m => ({ ...m, s: clamp(Math.round(PBOX.w / 96 * m.s), 2, 14) / (PBOX.w / 96), x: Math.round(m.x), y: Math.round(m.y) });
function packDraw(player, want, x, y, w, h, a, m) {   // a: life state for the touch physics (squash under the finger, bounce); m: motion
  const st = player.update(fdt, want, L.packIdle !== false);
  if (player === PLAY.face) L.packNow = st.id;            // for the lab: what the big face plays
  X.save();
  if (m && T.faceFps) {
    const k = clamp(Math.round(w / 96 * m.s), 2, 14), cx = Math.round(x + w / 2 + m.x), cy = Math.round(y + h / 2 + m.y);
    w = 96 * k; h = 54 * k; x = cx - w / 2; y = cy - h / 2;
    if (m.r || m.f || (m.sx ?? 1) !== 1 || (m.sy ?? 1) !== 1) { X.translate(cx, cy); X.rotate(m.r); X.scale((m.f ? -1 : 1) * (m.sx ?? 1), m.sy ?? 1); X.translate(-cx, -cy); }
  } else moveFace(m, x, y, w, h);
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
  let pm = PV.id ? PV.m : L.lean || null; if (pm && pack && T.faceFps) pm = snapPix(pm);   // L.lean: the Pixel de poche leans as you tilt the phone (poche.js)
  const lmd = PV.id && PV.mood && (PV.group !== 'vie' || md === 'neutre') ? PV.mood : md;
  const a = LIFE.face.update(now, lmd, { look: PV.id ? null : ptr, idle: now - L.lastInput, sleepIn, calm: RM || pack || !!anim || !!PV.id });
  if (pack || (anim && T.packFace)) packDraw(PLAY.face, pack ? packWant() : anim, PBOX.x, PBOX.y, PBOX.w, PBOX.h, a, pm);
  else {
    const nap = (a.mood === 'endormi' ? a.k : 0) + (a.from === 'endormi' ? 1 - a.k : 0);
    X.save(); moveFace(pm, PBOX.x, PBOX.y, PBOX.w, PBOX.h);
    X.globalAlpha = 1 - (1 - (T.sleepA ?? 0.6)) * clamp(nap, 0, 1);
    face(400, 236, 16, a.mood, a.lx, a.ly, a); X.globalAlpha = 1; X.restore();
  }
  if (PER && PER.decor) { X.shadowBlur = 0; PER.decor(PBOX, pm || PV.m); glow(); }   // what he wears (his Santa hat in December)
  if (PER && PV.id) { X.shadowBlur = 0; PER.drawOver(PBOX, pm || PV.m); glow(); }
  const parts = [], r = P.lights.rooms[0], w = P.weather, e = nextEvent();
  if (r) parts.push(`${r.name} ${r.on ? r.bri + ' %' : 'éteint'}`);
  if (w && w.now) parts.push(temp(w.now.t));
  if (e) parts.push(`${hm(e.start)} ${e.title}`);
  const tick = parts.join('   ·   ');
  if (!L.shot) txt(fit(T.upper ? tick.toUpperCase() : tick, 760, 24), 400, 440, 24, D, 'center');   // L.shot: not in an album photo (web/album.js)
  hit(0, 0, W, H, pt => {
    if (md === 'endormi') { send('mood.set', { name: 'neutre' }); L.sleepy = false; L.local = { name: 'surpris', until: now + 900 }; L.pack = { id: 'reveil', until: now + 5000 }; if (PER) PER.play('reveille'); return; }
    if (L.petted) { L.petted = false; return; }
    if (PER) { const h = new Date().getHours(); PER.tap(pt || { x: 400, y: 240 }, PBOX, { night: h >= 23 || h < 6 }); L.local = null; L.pack = null; return; }
    const r2 = LIFE.face.tap(now); L.local = r2 ? { name: r2, until: now + 2600 } : { name: 'content', until: now + 1800 };
    if (r2) L.pack = null; else if (rnd() < 0.3) L.pack = { id: 'rire', until: now + 3000 };      // sometimes a tap makes him laugh
  });
}
/* touch: squash under the finger, petting makes him fall in love (taps are handled by the hit above) */
let rubAt = null;
const onFace = p => L.scr === 'visage' && L.boot < 0 && P && !L.menu && !CA.id && Math.abs(p.x - 400) < 330 && p.y > 40 && p.y < 430;
// every new touch clears "petted", so a swipe on another screen still changes screen
cv.addEventListener('pointerdown', e => { const p = toCanvas(e); L.petted = false; if (onFace(p)) { LIFE.face.press(true); rubAt = p; } });
cv.addEventListener('pointermove', e => {
  if (!rubAt) return;
  const p = toCanvas(e), r = LIFE.face.rub(p.x - rubAt.x, p.y - rubAt.y, now); rubAt = p;
  if (r) { L.petted = true; L.pack = null; if (PER) { L.local = null; PER.pet(); } else L.local = { name: r, until: now + 3200 }; }
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
  buddy(t.running, done);
}
/* the little Pixel of the Minuteur screen. His big face is not on this screen, so a small Pixel lives in the free corner,
   bottom right: he walks about (seen from the side, legs going), stops, blinks, looks at the timer or around, leaves by
   the edge and comes back, dozes when nothing happens, and jumps for joy when the time is up. Touch him: he jumps.
   Drawn in whole 5 px pixels with the theme's colours. */
const BUD = { x: 700, dir: -1, act: 'idle', until: 0, to: 700, back: false, cheered: false, jumpAt: -1e9 };
function buddy(running, done) {
  const x0 = 575, x1 = 755, p = 5, step = 46 * fdt / 1000;                    // p: his pixel, in screen pixels
  if (!done) BUD.cheered = false;
  if (done && !BUD.cheered && BUD.act !== 'cheer') { BUD.act = 'cheer'; BUD.until = now + 6000; BUD.x = Math.min(BUD.x, x1); }   // time is up!
  if (BUD.act !== 'walk' && now >= BUD.until) {
    const r = rnd(), quiet = !running && now - L.lastInput > 90000;
    if (BUD.act === 'cheer') { BUD.cheered = true; BUD.act = 'idle'; BUD.until = now + 2000; }   // once per alarm
    else if (BUD.act === 'away') { BUD.act = 'walk'; BUD.to = x1 - 20 - rnd() * 80; }           // back from beyond the edge
    else if (quiet && r < 0.6) { BUD.act = 'nap'; BUD.until = now + 9000 + rnd() * 9000; }
    else if (r < 0.42) { BUD.act = 'walk'; BUD.to = x0 + rnd() * (x1 - x0); }
    else if (r < 0.58) { BUD.act = 'look'; BUD.until = now + 2200 + rnd() * 2000; }             // at the timer
    else if (r < 0.68) { BUD.act = 'walk'; BUD.to = W + 60; BUD.back = true; }                   // off the screen for a moment
    else { BUD.act = 'idle'; BUD.until = now + 1800 + rnd() * 3000; }
  }
  if (BUD.act === 'walk') {
    const d = BUD.to - BUD.x; BUD.dir = d < 0 ? -1 : 1;
    if (Math.abs(d) > step) BUD.x += Math.sign(d) * step;
    else { BUD.x = BUD.to; BUD.act = BUD.back ? 'away' : 'idle'; BUD.until = now + (BUD.back ? 2000 + rnd() * 2500 : 1200 + rnd() * 2500); BUD.back = false; }
  }
  if (BUD.act === 'away') return;                                                                 // behind the edge of the screen
  const hop = BUD.act === 'cheer' ? Math.abs(Math.sin((now - BUD.until) / 170)) * 22 : now - BUD.jumpAt < 500 ? Math.sin((now - BUD.jumpAt) / 500 * Math.PI) * 26 : 0;
  const cx = Math.round(BUD.x / p) * p, gy = Math.round((466 - hop) / p) * p;
  drawBud(cx, gy, p);
  hit(cx - 9 * p, gy - 17 * p, 18 * p, 17 * p, () => {
    BUD.jumpAt = now; if (BUD.act !== 'cheer') { BUD.act = 'surpris'; BUD.until = now + 1100; }
    fast(900); if (SON() && SON().play) SON().play('bip');
  });
}
function drawBud(cx, gy, p) {
  const a = BUD.act, f = BUD.dir, blink = a !== 'nap' && now % 3700 < 140;
  const R = (x, y, w, h, c) => { X.fillStyle = c; X.shadowColor = c; X.fillRect(cx + x * p, gy + y * p, w * p, h * p); };   // in his pixels, from his feet
  const S = (x, y, w, h, c) => R(f > 0 ? x : -x - w, y, w, h, c);                                // drawn facing right, mirrored to the left
  if (a === 'walk') {                                                                              // three-quarter view, legs going
    const s = Math.floor(now / 150) % 2;
    S(s, -3, 1, 3, G); S(3 - s, -3, 1, 3, G); S(-1, -4, 6, 1, D);                                 // legs, stand
    S(-7, -14, 4, 9, G); S(-6, -13, 3, 7, DK);                                                    // the back of his case, in perspective
    S(-3, -15, 10, 11, G); S(-2, -14, 8, 9, B); S(-1, -13, 6, 7, DK);                             // his front, his screen
    if (blink) { S(1, -11, 1, 1, G); S(4, -11, 1, 1, G); } else { S(1, -12, 1, 2, WH); S(4, -12, 1, 2, WH); }
    S(2, -8, 3, 1, G);
    return;
  }
  R(-3, -3, 1, 3, G); R(2, -3, 1, 3, G); R(-3, -4, 6, 1, D);                                      // legs, stand
  R(-7, -15, 14, 11, G); R(-6, -14, 12, 9, B); R(-5, -13, 10, 7, DK);                             // his case, his screen
  if (a === 'nap') {
    R(-4, -11, 2, 1, G); R(2, -11, 2, 1, G); R(-1, -8, 2, 1, G);
    for (let i = 0; i < 3; i++) { const q = ((now / 2400) + i / 3) % 1; X.globalAlpha = 1 - q; txt('z', cx + 32 + q * 22, gy - 64 - q * 34, Math.round(18 + q * 10), D); }
    X.globalAlpha = 1; return;
  }
  const [lx, ly] = a === 'look' ? [-1, -1] : a === 'idle' ? [[0, 0], [-1, 0], [0, 0], [1, 0]][Math.floor(now / 1300) % 4] : [0, 0];   // at the timer, or around
  if (a === 'cheer') { for (const e of [-5, 1]) { R(e, -11, 1, 1, WH); R(e + 1, -12, 2, 1, WH); R(e + 3, -11, 1, 1, WH); } }   // ^ ^
  else if (a === 'surpris') { R(-4, -13, 2, 3, WH); R(2, -13, 2, 3, WH); }
  else if (blink) { R(-4, -11, 2, 1, G); R(2, -11, 2, 1, G); }
  else { R(-4 + lx, -12 + ly, 2, 2, WH); R(2 + lx, -12 + ly, 2, 2, WH); }
  if (a === 'surpris') R(-1, -9, 2, 2, G);
  else if (a === 'cheer') { R(-3, -8, 6, 1, G); R(-4, -9, 1, 1, G); R(3, -9, 1, 1, G); }
  else { R(-2, -8, 4, 1, G); R(-3, -9, 1, 1, G); R(2, -9, 1, 1, G); }
  if (a === 'cheer') for (let i = 0; i < 3; i++) { const an = now / 600 + i * 2.1; T.star(cx + Math.cos(an) * 46, gy - 40 + Math.sin(an) * 22, 3, false); }
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
  const wf = P.wifi, wy = 56 + 3 * 56;            // the Wi-Fi line: its network's name, and a touch opens the Wi-Fi view (web/wifi.js)
  if (wf && wf.ok && window.PixelWifi) {
    txt(fit(wf.ssid || (wf.eth ? 'câble réseau' : 'aucun réseau'), 230, 24), W - 24, wy + 12, 24, wf.ssid || wf.eth ? D : AM, 'right');
    hit(0, wy, W, 56, () => window.PixelWifi.open());
  }
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
  // theme picker: the themes switched on ([ui] themes in config.toml), chips in rows of 4; none when there is only one
  const ON = ((st.themes && st.themes.length) ? st.themes : IDS).filter(id => THEMES[id]);
  if (ON.length < 2) return;
  const per = 4, rows = Math.ceil(ON.length / per), ch = rows > 1 ? 34 : 44, cw = 134, y0 = 480 - 8 - rows * (ch + 6) + 6;
  txt('THÈME', 24, y0 + (rows > 1 ? ch - 6 : 8), 26, D);
  ON.forEach((id, i) => {
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
  const b = L.banner; if (!b || L.shot) return; const e = now - b.t; if (e > b.ms + 440) { L.banner = null; return; }   // L.shot: no banner in an album photo
  const big = b.msg.length > 180, fs = big ? 21 : 26, lh = fs + 2, ls = wrap(b.msg, 680, fs).slice(0, big ? 12 : 4), h = 24 + ls.length * lh;
  const k = e < 220 ? e / 220 : e > b.ms + 220 ? (b.ms + 440 - e) / 220 : 1, y = -h - 8 + k * (h + 16);
  box(50, y, 700, h, AM, B); ls.forEach((l, i) => txt(l, 400, y + 12 + i * lh, fs, AM, 'center'));
}

/* ---------- Cast: a photo, a GIF, a video, a text or a link sent from a phone (pixel/cast.py) ----------
   Drawn over whatever screen is open, which comes back when it ends: pictures and texts after a while (the server's
   [cast] seconds), videos at their end (Pixel's screen tells the server: cast.end), at once on a touch (cast.stop).
   The picture keeps its true colours, sharp, letterboxed on black: while anything is cast, no CRT effect in any theme
   (frame(): no theme.fg, and the "casting" class hides the page's scanlines, style.css); all of it is back when it ends.
   A little Pixel peeks in from the corner and reacts. A shared screen (kind "screen": a computer by WebRTC, Android with
   ScreenStream, AirPlay) is received by ecran.js, and drawn here like a video, but 30 times a second at most (what the
   computer sends) and, where the browser tells when a new picture comes (requestVideoFrameCallback), only then.
   A video plays in a hidden <video>, drawn at each of its new frames (requestVideoFrameCallback); a GIF is decoded frame by
   frame (ImageDecoder: a canvas only ever draws the first frame of a GIF); a photo is drawn from a copy at the screen's size.
   YouTube plays in its IFrame API player (web/ytplayer.js), driven from the phone; Vimeo (and YouTube without ytplayer.js)
   in its own player over the canvas, sandboxed (no popup, no leaving Pixel); on Pixel's screen only (a phone shows a card);
   their errors and their silence end the cast. The sound plays on Pixel's screen only (kiosk.sh lets it start alone). */
const CA = { id: null, kind: '', t: 0, img: null, bmp: null, vid: null, vfc: false, gif: null, frame: null, ifr: null, ifrYt: false, yt: null,
  heard: false, wait: 0, hello: 0, err: '', ended: false, peek: 0, fps: 0, rvfc: false };   // fps: ecran.js's own rate
const PEEK = PackPlayer(), PEEKLIFE = PixelLife();
const EMB = { x: 16, y: 58, w: 584, h: 328 };          // where YouTube and Vimeo play (16:9), Pixel beside them
const caps = s => T.upper ? s.toUpperCase() : s;
const castLive = () => { const c = P && P.cast; return c && c.id && (!c.until || srv() < c.until) ? c : null; };
function castFail(id, what) { if (CA.id !== id) return; CA.err = what; L.dirty = true; if (L.kiosk) send('cast.end', { id, error: what }); }
function castLoad(c) {                // a new cast: its picture, its animation, its video or its player
  castDrop();
  Object.assign(CA, { id: c.id, kind: c.kind, t: now, err: '', ended: false });
  if (L.kiosk) { L.sleepy = false; L.lastInput = now; }       // something happened: he is awake, his nap counts from now
  if (PER) PER.event('cast', { kind: c.kind, title: c.title || '' }, { visage: false });   // his reaction waits for his face screen
  fast(1500);
  if (c.kind === 'image' || (c.kind === 'gif' && !gifDecodes())) castImage(c);   // a GIF: decoded (one download), or its first frame
  if (c.kind === 'gif' && gifDecodes()) castGif(c);
  else if (c.kind === 'video') castVideo(c);
  else if (c.kind === 'link' && c.embed && L.kiosk) {
    const host = cv.parentElement;    // YouTube: its IFrame API, driven from the phone and the YouTube app (web/ytplayer.js)
    if (c.yt && window.PixelYT && host && typeof host.append === 'function') CA.yt = PixelYT.create(host, c, { send: (a, g) => send(a, g), rect: EMB,
      muted: !!(SON() && SON().on && SON().volume === 0), dirty: () => { L.dirty = true; } });
    else castFrame(c);
  }
  else if (c.kind === 'screen' && window.PixelEcran) {
    window.PixelEcran.open(c, CA, { kiosk: L.kiosk, send, redraw: () => { L.dirty = true; },
      muted: !!(SON() && SON().on && SON().volume === 0) });   // a shared screen: its <video> or <img> lands in CA.vid / CA.img
    castFrames(c.id);
  }
}
function castFrames(id) {             // a shared screen: drawn when a new picture comes (the computer sends fewer when nothing moves)
  const v = CA.vid; if (!v || typeof v.requestVideoFrameCallback !== 'function') return;
  const next = () => { if (CA.id !== id || CA.vid !== v) return; L.dirty = true; v.requestVideoFrameCallback(next); };
  CA.rvfc = true; v.requestVideoFrameCallback(next);
}
const gifDecodes = () => typeof ImageDecoder === 'function' && typeof fetch === 'function';
function castImage(c) {               // a picture: decoded once at the size it shows (a phone's 12 to 50 Mpx would be resampled every frame)
  if (typeof Image !== 'function') return;
  const im = CA.img = new Image(), id = c.id;
  im.decoding = 'async'; im.referrerPolicy = 'no-referrer'; im.onerror = () => castFail(id, 'image');
  im.onload = () => {
    L.dirty = true; const w = im.naturalWidth, h = im.naturalHeight, k = Math.min(W / w, H / h) * S;
    if (typeof createImageBitmap !== 'function' || CA.img !== im || !w || !h) return;
    createImageBitmap(im, { resizeWidth: Math.max(1, Math.round(w * k)), resizeHeight: Math.max(1, Math.round(h * k)), resizeQuality: 'high' }).then(b => {
      if (CA.img !== im) { b.close(); return; }
      CA.bmp = [b, w, h]; CA.img = null; L.dirty = true;              // drawn at its own place, the size it was made for
    }, () => { /* the full picture, then */ });
  };
  im.src = c.src;
}
async function castGif(c) {
  const id = c.id;
  try {
    const r = await fetch(c.src, { referrerPolicy: 'no-referrer' }); if (!r.ok) throw new Error(r.status); if (CA.id !== id) return;
    const type = (r.headers.get('content-type') || '').split(';')[0] || (/\.webp(\?|$)/i.test(c.src) ? 'image/webp' : 'image/gif');
    const dec = new ImageDecoder({ data: await r.arrayBuffer(), type }); await dec.tracks.ready;
    if (CA.id !== id) { dec.close(); return; }
    const n = dec.tracks.selectedTrack ? dec.tracks.selectedTrack.frameCount : 1;
    if (n <= 1) {                     // a still GIF: its one frame, decoded once, and the decoder goes
      const f = (await dec.decode({ frameIndex: 0 }).finally(() => dec.close())).image;
      if (CA.id !== id) { f.close(); return; }
      CA.frame = f; L.dirty = true; return;
    }
    CA.gif = { dec, n, i: 0, busy: false };
    gifNext(CA.gif);
  } catch (e) { if (CA.id === id && !CA.frame && !CA.gif) castImage(c); }   // a site that does not allow it (CORS), a broken file: its first frame
}
function gifNext(g) {                 // the next frame, decoded when the one on screen has had its own delay
  if (!g || CA.gif !== g || g.busy) return; g.busy = true;
  g.dec.decode({ frameIndex: g.i }).then(r => {
    if (CA.gif !== g) { r.image.close(); return; }
    if (CA.frame) CA.frame.close();
    const d = (r.image.duration || 0) / 1000;                // µs -> ms; 10 ms or less means 100 ms, as in the browsers
    CA.frame = r.image; g.i = (g.i + 1) % g.n; g.busy = false; L.dirty = true;
    setTimeout(() => gifNext(g), d > 10 ? d : 100);
  }, () => { g.busy = false; if (g.i) { g.i = 0; setTimeout(() => gifNext(g), 100); } else CA.gif = null; });
}
function castVideo(c) {
  const v = document.createElement('video'); if (!v || typeof v.play !== 'function') return;
  const id = c.id; CA.vid = v;
  v.playsInline = true; v.preload = 'auto'; v.muted = !L.kiosk || !!(SON() && SON().on && SON().volume === 0);   // sound on Pixel only
  v.onended = () => { if (CA.id === id && !CA.ended) { CA.ended = true; if (L.kiosk) send('cast.end', { id }); } };
  v.onerror = () => castFail(id, 'video');
  if (typeof v.requestVideoFrameCallback === 'function') {   // drawn when it has a new frame (24, 30 im/s...), not 60 times a second
    const next = () => { if (CA.vid !== v) return; L.dirty = true; v.requestVideoFrameCallback(next); };
    CA.vfc = true; v.requestVideoFrameCallback(next);
  }
  v.onloadedmetadata = () => { const t = (srv() - c.t0) / 1000; if (!L.kiosk && t > 1 && t < v.duration - 1) v.currentTime = t; };   // a phone joins in where Pixel is
  v.src = c.src;
  const go = () => v.play().catch(() => { if (!v.muted && CA.vid === v) { v.muted = true; go(); } });   // no sound allowed: without sound, rather than not at all
  go();
}
function castFrame(c) {               // YouTube or Vimeo: their player, over the canvas (the scanlines of the page go over it)
  const host = cv.parentElement; if (!host || typeof host.append !== 'function') return;
  const f = document.createElement('iframe'), yt = /youtube/.test(c.embed);
  f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');   // its links can neither open a window nor take Pixel's place
  f.src = c.embed + (yt ? '&origin=' + encodeURIComponent(location.origin) : '');
  f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.referrerPolicy = 'strict-origin-when-cross-origin'; f.title = c.title || 'Vidéo';
  f.style.cssText = `position:absolute;z-index:1;border:0;background:#000;left:${EMB.x / 8}%;top:${EMB.y / 4.8}%;width:${EMB.w / 8}%;height:${EMB.h / 4.8}%`;
  f.addEventListener('load', () => { if (CA.ifr === f) { CA.wait = now + 15000; playerHello(); } });
  host.append(f); Object.assign(CA, { ifr: f, ifrYt: yt, heard: false, wait: now + 30000, hello: 0 });   // silent for too long: it does not play
}
function playerHello() {              // ask the player to say how it goes: its end, its errors (the postMessage APIs of YouTube and Vimeo)
  const f = CA.ifr; CA.hello = now;
  const say = m => { try { f.contentWindow.postMessage(JSON.stringify(m), '*'); } catch (e) { /* gone */ } };
  if (CA.ifrYt) { say({ event: 'listening', id: 1, channel: 'widget' }); for (const ev of ['onStateChange', 'onError']) say({ event: 'command', func: 'addEventListener', args: [ev], id: 1, channel: 'widget' }); }
  else { say({ method: 'ping' }); for (const ev of ['ended', 'error']) say({ method: 'addEventListener', value: ev }); }   // Vimeo answers a ping
}
function playerOver(error) {          // the video is over, or it cannot play here (embedding refused, private, removed): the server hears it
  if (CA.ended) return; CA.ended = true; if (error) { CA.err = error; L.dirty = true; }
  if (L.kiosk) send('cast.end', error ? { id: CA.id, error } : { id: CA.id });
}
addEventListener('message', e => {
  if (!CA.ifr || e.source !== CA.ifr.contentWindow) return;
  let d = e.data; try { if (typeof d === 'string') d = JSON.parse(d); } catch (err) { return; }
  if (!d || typeof d !== 'object') return;
  if (!CA.heard) { CA.heard = true; playerHello(); }   // it answers (YouTube's handshake, Vimeo's 'ready'): now it surely hears what we ask
  if (d.event === 'onError' || d.event === 'error') playerOver('video');
  else if (d.event === 'ended' || (d.event === 'onStateChange' && d.info === 0) || (d.event === 'infoDelivery' && d.info && d.info.playerState === 0)) playerOver();
});
function castDrop() {                 // the cast is over: its video, its decoder and its player go
  if (CA.kind === 'screen' && window.PixelEcran) window.PixelEcran.close();   // the shared screen's connection
  const v = CA.vid; if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { /* already gone */ } }
  try { if (CA.gif) CA.gif.dec.close(); if (CA.frame) CA.frame.close(); if (CA.bmp) CA.bmp[0].close(); } catch (e) { /* already closed */ }
  if (CA.ifr) CA.ifr.remove();
  if (CA.yt) CA.yt.drop();
  if (CA.id && L.kiosk) L.lastInput = now;
  Object.assign(CA, { id: null, kind: '', img: null, bmp: null, vid: null, vfc: false, gif: null, frame: null, ifr: null, ifrYt: false, yt: null, heard: false, wait: 0, err: '', peek: 0, fps: 0, rvfc: false });
}
function castSync() {                 // every frame: what is cast now (null: nothing, or Pixel is starting up)
  const c = L.boot >= 0 ? null : castLive();
  if (!c) { if (CA.id) { castDrop(); L.dirty = true; } return null; }
  if (c.id !== CA.id) castLoad(c);
  return c;
}
function castSrc() {                  // what to draw, and its size: the GIF's frame, the video's, the picture
  if (CA.frame) return [CA.frame, CA.frame.displayWidth, CA.frame.displayHeight];
  if (CA.bmp) return CA.bmp;
  if (CA.vid && CA.vid.readyState >= 2 && CA.vid.videoWidth) return [CA.vid, CA.vid.videoWidth, CA.vid.videoHeight];
  if (CA.img && CA.img.complete && CA.img.naturalWidth) return [CA.img, CA.img.naturalWidth, CA.img.naturalHeight];
  return null;
}
function castMedia(c) {               // a photo, a GIF, a video or a shared screen: as big as it fits, centred on black, in its own colours
  X.shadowBlur = 0; X.fillStyle = '#000'; X.fillRect(0, 0, W, H);
  const s = castSrc();
  if (!s) { glow(); txt(CA.err ? caps("Impossible de l'afficher") : caps('Chargement') + '.'.repeat(1 + Math.floor(now / 400) % 3), 400, 214, 36, CA.err ? AM : D, 'center'); return; }
  const [src, w, h] = s, k = Math.min(W / w, H / h), r = { w: w * k, h: h * k };
  r.x = (W - r.w) / 2; r.y = (H - r.h) / 2;
  X.imageSmoothingEnabled = true; X.imageSmoothingQuality = !(CA.vid || c.kind === 'screen') ? 'high' : k < 0.5 ? 'medium' : 'low';   // a moving picture: cheaper on the Pi
  X.drawImage(src, r.x, r.y, r.w, r.h);
  if (CA.vid && CA.vid.duration > 0 && CA.vid.duration < Infinity) { X.globalAlpha = 0.8; X.fillStyle = D; X.fillRect(0, H - 3, W * CA.vid.currentTime / CA.vid.duration, 3); X.globalAlpha = 1; }   // how far the video is
  glow();
}
function castSign(c) {                // a text: a big sign, in the theme's font, as big as it fits
  header('Message');
  const aw = 720, ah = 296, ay = 64, text = String(c.text || '').replace(/ ([!?:;»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');   // « ! » stays with its word
  let size = 120, lines = [];
  for (; size > 26; size -= 6) {
    lines = wrap(text, aw, size, 'title'); X.font = F(size, 'title');
    if (lines.length * size * 1.12 <= ah && lines.every(l => X.measureText(l).width <= aw)) break;
  }
  lines = lines.slice(0, Math.max(1, Math.floor(ah / (size * 1.12)))).map(l => fit(l, aw, size, 'title'));
  const lh = size * 1.12, y0 = ay + (ah - lines.length * lh) / 2;
  lines.forEach((l, i) => txt(l, 400, y0 + i * lh, size, WH, 'center', 'title'));
}
function castCard(c) {                // a page (or, on a phone, a YouTube video): its title, its site, a QR code to open it on the phone
  header(c.embed ? c.site || 'Vidéo' : 'Lien');
  const q = c.qr || []; let tx = 24;
  if (q.length) { const n = q.length, m = Math.max(2, Math.floor(236 / (n + 8))), qs = m * (n + 8); X.shadowBlur = 0; X.drawImage(qrImage(q, m, qs), 24, 66, qs, qs); glow(); tx = 24 + qs + 26; }
  const tw = W - 24 - tx, tl = wrap(c.title || c.url || '', tw, 40, 'title').slice(0, 3);
  tl.forEach((l, i) => txt(fit(l, tw, 40, 'title'), tx, 70 + i * 44, 40, WH, 'left', 'title'));
  let y = 76 + tl.length * 44;
  txt(fit(c.site || '', tw, 30), tx, y, 30, G); y += 46;
  const yerr = CA.yt ? CA.yt.err : c.ytp && c.ytp.st && c.ytp.st.err;    // YouTube cannot play it on Pixel (web/ytplayer.js)
  if (yerr) return para((window.PixelYT ? PixelYT.message(yerr) : 'YouTube ne peut pas la lire ici.') + (q.length ? ' Scanne le code pour la regarder sur ton téléphone.' : ' ' + (c.url || '')), tx, y, tw, 26, AM, 31);
  para(c.embed ? "La vidéo joue sur l'écran de Pixel." : q.length ? "Scanne le code avec ton téléphone pour ouvrir la page." : c.url || '', tx, y, Math.min(tw, q.length ? tw : 560), 24, D, 28);
}
function castPlayer(c) {              // Pixel's screen, YouTube or Vimeo: a TV with their player, Pixel watching beside it
  header(c.site || 'Vidéo');
  box(EMB.x - 4, EMB.y - 4, EMB.w + 8, EMB.h + 8, D, '#000');
  txt(fit(c.title || '', EMB.w, 26), EMB.x, EMB.y + EMB.h + 16, 26, G);
  rule(612, 60, 2, 360);
  box(626, 376, 160, 54, AM); txt(fit(caps('Arrêter'), 148, 28), 706, 389, 28, AM, 'center');
  hit(612, 48, W - 612, H - 48, () => send('cast.stop'));                  // the column beside the player stops it
  if (CA.yt) return castYtBar();                                           // (YouTube hides under the quick menu by itself)
  const vis = L.menu ? 'hidden' : 'visible'; if (CA.ifr.style.visibility !== vis) CA.ifr.style.visibility = vis;   // under the quick menu
  if (!CA.heard && !CA.ended) {       // the player has not said a word yet: ask again; still nothing after 15 s, it does not play
    if (CA.hello && now - CA.hello > 1000) playerHello();
    if (now > CA.wait) playerOver('video');
  }
}
const mmss = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600); return (h ? h + ':' + pad(s / 60 % 60) : Math.floor(s / 60)) + ':' + pad(s % 60); };
function castYtBar() {                // YouTube on Pixel's screen: how far it is, and a key to pause it (the phone has the rest)
  const [t, d] = CA.yt.time(), on = CA.yt.state === 1 || CA.yt.state === 3, by = EMB.y + EMB.h + 52;
  if (d > 0) {
    X.shadowBlur = 0; X.fillStyle = DK; X.fillRect(EMB.x, by, EMB.w, 4); X.fillStyle = G; X.fillRect(EMB.x, by, EMB.w * Math.min(1, t / d), 4); glow();
    txt(fit(mmss(t) + ' / ' + mmss(d), 176, 24), 706, 238, 24, D, 'center');
  }
  box(626, 300, 160, 54, G); txt(fit(caps(on ? 'Pause' : 'Lecture'), 148, 28), 706, 313, 28, G, 'center');
  hit(618, 292, 176, 70, () => send('yt.toggle'));
}
function castCode() {                 // the YouTube app's "Link with TV code" (pixel/ytcast.py): the code, in big
  header('YouTube');
  const code = P.ytcast && P.ytcast.code, s = code || caps('Code en préparation…');
  txt(caps('Code TV'), 400, 64, 30, D, 'center');
  let size = code ? 104 : 44;
  for (; size > 28; size -= 4) { X.font = F(size, 'title'); if (X.measureText(s).width <= 720) break; }
  txt(s, 400, 108, size, code ? WH : AM, 'center', 'title');
  para("Sur ton téléphone : l'appli YouTube, ta photo, Paramètres, Regarder sur la télé, Saisir le code TV. Le code change toutes les 5 minutes.", 70, 250, 660, 26, G, 32);
}
function castScreen(c) {              // a shared screen before its picture: the code to type, "connecting…", AirPlay (its window is above)
  header(c.title || "Partage d'écran");
  let y = 196;
  if (c.code) {                                                           // the one-time code (pixel/ecran.py), AirPlay's PIN
    txt(caps(c.via === 'airplay' ? 'Code AirPlay' : 'Code'), 400, 70, 30, D, 'center');
    txt(String(c.code).replace(/^(\d{3})(\d{3})$/, '$1 $2'), 400, 104, 118, WH, 'center', 'title'); y = 246;
  } else txt(fit(caps({ paired: 'Prêt', live: 'En direct' }[c.phase] || 'Connexion' + '.'.repeat(1 + Math.floor(now / 400) % 3)), 720, 48), 400, 116, 48, WH, 'center', 'title');
  wrap(c.note || '', 720, 26).slice(0, 3).forEach((l, i) => txt(l, 40, y + i * 32, 26, G));
}
function castFace(c, e, player) {     // the little Pixel: he peeks in from the corner, reacts, ducks away, comes back now and then
  const shot = c.kind === 'screen' && !!castSrc();                       // a shared screen: he looks once, then leaves it alone
  const media = c.kind === 'image' || c.kind === 'gif' || c.kind === 'video' || shot, show = !media || e < 7000 || (!shot && (e - 7000) % 30000 > 25000);
  CA.peek = clamp(CA.peek + (show ? 1 : -1) * fdt / 450, 0, 1);
  if (CA.peek <= 0) return;
  const k = 1 - (1 - CA.peek) ** 3, w = 192, h = 108;
  const react = e < 1400 ? 'surpris' : e < 4600 ? { image: 'amoureux', gif: 'rire', video: 'etoiles', text: 'reflechit', link: c.embed ? 'etoiles' : 'idee', screen: 'etoiles' }[c.kind] : (c.kind === 'video' || c.embed || c.kind === 'screen' ? 'ecoute' : null);
  const md = { surpris: 'surpris', amoureux: 'amoureux', rire: 'content', etoiles: 'excite', reflechit: 'reflechit', idee: 'content', ecoute: 'ecoute' }[react] || 'neutre';
  let x = W - w - 26, y = Math.round(H - h - 6 + (1 - k) * (h + 50));     // his box goes on under the edge, as if he leaned in
  if (player) { x = 606; y = 110; X.globalAlpha = k; }
  else { X.globalAlpha = 0.92; box(x - 8, y - 8, w + 16, h + 80, D, B); X.globalAlpha = 1; }
  if (packMode()) packDraw(PEEK, react, x, y, w, h);
  else { const a = PEEKLIFE.update(now, md, { look: player ? { x: -1.5, y: 0.2 } : { x: -1.3, y: -0.9 }, calm: true }); face(x + w / 2, y + h / 2 + 4, 6, a.mood, a.lx, a.ly, a); }
  X.globalAlpha = 1;
}
function drawCast(c) {
  if (CA.yt) CA.yt.sync(c, !!L.menu);                                      // web/ytplayer.js: the phone's orders, the app's next video
  const e = now - CA.t, player = c.kind === 'link' && !!c.embed && (!!CA.ifr || (!!CA.yt && !CA.yt.err));
  if (c.kind === 'text') castSign(c);
  else if (c.kind === 'ytcode') castCode();
  else if (player) castPlayer(c);
  else if (c.kind === 'link') castCard(c);
  else if (c.kind === 'screen' && !castSrc()) castScreen(c);
  else castMedia(c);
  if (!player) hit(0, 0, W, H, () => send('cast.stop'));                   // a touch anywhere: back to where he was
  X.shadowBlur = 0; castFace(c, e, player); glow();
  if (!player && e < 4500) {                                              // how to stop it, for a few seconds
    X.globalAlpha = clamp((4500 - e) / 600, 0, 1) * 0.92; box(16, H - 52, 340, 38, D, B);
    txt(fit(caps("Touche l'écran pour arrêter"), 324, 24), 186, H - 45, 24, G, 'center'); X.globalAlpha = 1;
  }
}

/* ---------- quick menu: swipe down to open, swipe up (or touch outside) to close ----------
   Theme, brightness, restart and power off. Restart and power off need a second touch within 4 s. */
const MENU = { x: 40, w: 720, h: 460, y: 16 };        // h: with its three rows (theme, brightness, sound)
function menuBtn(x, y, w, h, label, fn, warn) {
  const c = warn ? AM : G;
  box(x, y, w, h, c, null); txt(fit(T.upper ? label.toUpperCase() : label, w - 12, 26), x + w / 2, y + (h - 26) / 2 + 1, 26, c, 'center');
  hit(x, y, w, h, () => { L.dirty = true; fn(); });
}
function drawMenuPhone(x, y, MH) {       // the menu's "Téléphone" page: the QR code of Réglages, bigger, to open the app on a phone
  const st = P.settings, q = st.qr || [], n = q.length || 21, m = Math.floor(296 / (n + 8)), qs = m * (n + 8), qx = x + 24, qy = y + 68;
  X.shadowBlur = 0; X.drawImage(qrImage(q, m, qs), qx, qy, qs, qs); glow();
  const short = u => (u || '').replace(/\?.*$/, ''), tx = qx + qs + 24, tw = x + MENU.w - 24 - tx;
  const lines = (t, yy, size, c, lh) => { para(t, tx, yy, tw, size, c, lh); return yy + wrap(t, tw, size).length * lh; };
  const ty = lines("Scanne-le avec l'appareil photo du téléphone, sur le même Wi-Fi que Pixel.", y + 70, 24, D, 28) + 14;
  txt(fit(short(st.url), tw, 28), tx, ty, 28, WH); txt(fit('ou ' + short(st.ip_url), tw, 24), tx, ty + 36, 24, G);
  lines("Puis, dans le navigateur : « Ajouter à l'écran d'accueil ».", ty + 82, 24, D, 28);
  if (L.menu.direct) { X.globalAlpha = 0.8; txt('Glisse vers la droite pour revenir', x + MENU.w / 2, y + MH - 40, 22, D, 'center'); X.globalAlpha = 1; }
  else menuBtn(x + MENU.w - 224, y + MH - 78, 200, 54, 'Retour', () => { L.menu.view = null; });
}
function drawMenu() {
  // the rows: the theme only when Pixel offers more than one ([ui] themes in config.toml, sent as settings.themes),
  // the sound only on the screen that plays it (son.js: the Pi's own screen)
  const on = ((P.settings && P.settings.themes) || IDS).filter(id => THEMES[id]), themes = on.length > 1, son = !!(SON() && SON().on);
  const sh = 120 - 60 * ((themes ? 1 : 0) + (son ? 1 : 0));    // how much shorter than with the three rows
  const m = L.menu, phone = m.view === 'phone', MH = phone ? 448 : MENU.h - sh;
  const e = now - m.t, k = RM ? 1 : clamp(e / 220, 0, 1), q = 1 - (1 - k) ** 3;
  const y = m.direct ? MENU.y : ease(-MH - 8, MENU.y, q), x = m.direct ? ease(W + 8, MENU.x, q) : MENU.x;   // from the top, or from the right
  if (k < 1) L.dirty = true;
  if (m.confirm && now > m.confirm.until) m.confirm = null;
  X.globalAlpha = 0.55 * k; X.fillStyle = B; X.fillRect(0, 0, W, H); X.globalAlpha = 1;
  hit(0, 0, W, H, () => { L.menu = null; L.dirty = true; });                 // touching outside the panel closes it
  hit(x, y, MENU.w, MH, () => {});                                            // the panel itself swallows touches
  box(x, y, MENU.w, MH, G, B);
  txt(phone ? 'TÉLÉPHONE' : 'MENU', x + 24, y + 16, 30, WH, 'left', 'title');
  menuBtn(x + MENU.w - 164, y + 12, 140, 40, 'Fermer', () => { L.menu = null; });
  if (m.off) {
    para(m.off === 'poweroff' ? 'Pixel s\'éteint. Attends que la petite lumière verte du Pi s\'arrête avant de le débrancher.' : 'Pixel redémarre…', x + 24, y + 110, MENU.w - 48, 30, AM, 36);
    return;
  }
  if (phone) { drawMenuPhone(x, y, MH); return; }
  const row = (yy, label, minus, value, plus) => {
    txt(label, x + 24, yy + 10, 24, D);
    menuBtn(x + 220, yy, 70, 44, '<', minus);
    txt(fit(value, 230, 28), x + 220 + 70 + 125, yy + 8, 28, WH, 'center');
    menuBtn(x + 550, yy, 70, 44, '>', plus);
  };
  let yy = y + 70;
  if (themes) { row(yy, 'THÈME', () => send('theme.step', { d: -1 }), T.name, () => send('theme.step', { d: 1 })); yy += 60; }   // steps through the themes that are on
  row(yy, 'LUMINOSITÉ', () => send('sys.bright', { d: -0.1 }), Math.round((P.sys.bright || 1) * 100) + ' %', () => send('sys.bright', { d: 0.1 })); yy += 60;
  if (son) { const v = SON().volume; row(yy, 'SON', () => SON().setVolume(v - 0.2), v > 0 ? Math.round(v * 100) + ' %' : 'coupé', () => SON().setVolume(v + 0.2)); yy += 60; }
  const ask = what => () => {
    if (m.confirm && m.confirm.what === what) { m.off = what; m.confirm = null; send('sys.power', { what }); return; }
    m.confirm = { what, until: now + 4000 };
  };
  const sure = what => m.confirm && m.confirm.what === what;
  // the phone app (its QR code), his Wi-Fi (web/wifi.js, when the Pi has NetworkManager) and Pixel's fish; the power buttons stay last
  const wifi = !!(P.wifi && P.wifi.ok && window.PixelWifi), bw = wifi ? 208 : 324;     // three across, or two
  menuBtn(x + 24, yy + 10, bw, 54, 'Téléphone', () => { m.view = 'phone'; m.confirm = null; });
  if (wifi) menuBtn(x + 48 + bw, yy + 10, bw, 54, 'Wi-Fi', () => { L.menu = null; window.PixelWifi.open(); });
  menuBtn(x + MENU.w - 24 - bw, yy + 10, bw, 54, 'Poisson', () => { L.menu = null; send('scene.play', { id: 'poisson' }); });
  menuBtn(x + 24, yy + 80, 324, 54, sure('reboot') ? 'Sûr ? Touche encore' : 'Redémarrer', ask('reboot'), sure('reboot'));
  menuBtn(x + 372, yy + 80, 324, 54, sure('poweroff') ? 'Sûr ? Touche encore' : 'Éteindre', ask('poweroff'), true);
  X.globalAlpha = 0.8; txt('Glisse vers le haut pour fermer', x + MENU.w / 2, yy + 162, 22, D, 'center'); X.globalAlpha = 1;
}

/* ---------- Nourrir: web/nourrir.js draws his food tray over the face screen, with the screen's own helpers ---------- */
const NOUR = { X, W, H, RM, L, hit, txt, fit, box, bar, fast: ms => fast(ms), get T() { return T; }, get S() { return S; }, get now() { return now; } };

/* ---------- add-ons (web/exos.js…): a view drawn over a screen, or instead of it, with the screens' own helpers ----------
   Screens.addon({ name, on(scr), instead(), draw(k, dt), state(p, prev), fps(calm), busy() }) returns k, the kit: the canvas
   and the theme, text and boxes, touch zones, a face in any box (the pack or the living face), his personality, the state,
   send. on: drawn on that screen now; instead: in place of the screen; fps: its frame rate (0: the screen's); busy: no
   moments of life meanwhile; state: every snapshot, before it is drawn.
   Une chose à la fois, over his face screen: the boot, a cast (drawn instead of everything) and the quick menu (over
   everything) come first; then the one add-on drawn is the first of ORDER whose on() is true (each still decides when it is
   on); an add-on of another name comes after them, in load order; Nourrir's tray and plate (web/nourrir.js) come last, under
   every add-on (Screens.addonTop: the one drawn now, '' when none). The Wi-Fi view (web/wifi.js) is opened by hand, over
   any screen: it comes first of them all. */
const ORDER = [
  'wifi',       // the Wi-Fi view, opened from the menu, from Système or from the reminder over his face (web/wifi.js)
  'exo',        // an open exercise (web/exos.js)
  'jeu',        // a game (web/habitudes.js)
  'amis',       // a friend's visit here, his house « Chez Bip » while he is away, a friend knocking, his code, a peek (web/amis.js)
  'souvenirs',  // the album's slideshow, the birthday picker, the mood question and its words, « Je te dis ! » (web/souvenirs.js)
  'habitudes',  // his offer « On joue à… ? », the night veil (web/habitudes.js)
  'exo-offre',  // his offer « Une petite question ? » (web/exos.js)
];
const ADDONS = [], AFACE = {};
let RANKED = [];
const rank = a => { const i = ORDER.indexOf(a.name); return i >= 0 ? i : ORDER.length + ADDONS.indexOf(a); };
function addonOn() { for (const a of RANKED) { try { if (a.on(L.scr)) return a; } catch (e) { /* an add-on must never stop the screen */ } } return null; }
function addonBusy() { return ADDONS.some(a => { try { return !!(a.busy && a.busy()); } catch (e) { return false; } }); }
function addonDraw(a, dt) { X.save(); try { a.draw(KIT, dt); } catch (e) { console.warn('Pixel: an add-on failed', e); } X.restore(); glow(); }
function addonFace(key, want, md, x, y, w, h, m) {   // his face in a box: the pack's animation `want` (null: the idle), or the living face's mood
  const f = AFACE[key] || (AFACE[key] = { play: PackPlayer(), life: PixelLife() });
  if (packMode()) return packDraw(f.play, want, x, y, w, h, null, m);
  X.save(); moveFace(m, x, y, w, h); live(f.life, x + w / 2, y + h / 2, w / 42, md || 'neutre', { calm: true }); X.restore();
  return null;
}
const KIT = { X, W, H, L, PER, txt, wrap, fit, para, box, bar, hit, fast, glow, header, clock, srv, mood, packMode, face: addonFace,
  send: (a, x) => send(a, x), get T() { return T; }, get c() { return { G, D, DK, B, AM, PK, WH }; }, get now() { return now; }, get P() { return P; }, get PV() { return PV; } };

/* ---------- loop and API ---------- */
const DRAW = { visage: drawVisage, lumieres: drawLights, claude: drawClaude, codex: drawCodex, meteo: drawMeteo, minuteur: drawTimer,
  agenda: drawAgenda, systeme: drawSys, reglages: drawSettings, veille: drawVeille };
/* ---------- Pixel sans Pi (local.js: the phone app's own Pixel, with no Pi; its state carries P.solo) ----------
   A screen that needs the Pi says so (solo.off), Système shows the phone's own measures (solo.rows), Réglages and the menu's
   Téléphone page say how to link him to his Pi instead of a QR code (solo.note). */
function drawSolo(id, f, dt) {
  const so = P.solo, name = ((P.keys.nav || []).find(k => k.id === id) || {}).label || id;
  if (so.off && so.off[id]) {
    header(name);
    const ls = wrap(so.pi, 700, 44, 'title'), y = 150 - (ls.length - 1) * 24;
    ls.forEach((l, i) => txt(l, 400, y + i * 50, 44, WH, 'center', 'title'));
    wrap(so.off[id], 660, 28).slice(0, 4).forEach((l, i) => txt(l, 400, y + ls.length * 50 + 30 + i * 34, 28, G, 'center'));
    if (so.hint) txt(fit(T.upper ? so.hint.toUpperCase() : so.hint, 760, 22), 400, 440, 22, D, 'center');
    return;
  }
  if (so.rows && so.rows[id]) {
    header(name);
    so.rows[id].slice(0, 7).forEach(([k, v], i) => { const y = 56 + i * 56; txt(fit(k, 180, 24), 24, y + 10, 24, D); txt(fit(String(v), 560, 34), 210, y + 2, 34, G); });
    return;
  }
  const note = so.note && so.note[id];
  if (!note) { f(dt); return; }
  X.save(); X.beginPath(); X.rect(0, 0, W, H); X.rect(16, 56, 238, 220); X.rect(262, 52, 522, 166); X.clip('evenodd');   // no QR code: room for the note
  f(dt); X.restore();
  box(60, 72, 146, 188, D); live(LIFE.mini, 133, 166, 5, 'content', { calm: true });   // a phone with him in it (no Claude screen here: its face is free)
  txt(fit(note.title, 500, 24), 274, 62, 24, D); txt(fit(note.head, 500, 32), 274, 88, 32, WH);
  para(note.text, 274, 128, 500, 24, G, 26);
}
for (const id of Object.keys(DRAW)) { const f = DRAW[id]; DRAW[id] = dt => (P && P.solo ? drawSolo(id, f, dt) : f(dt)); }
const menuPhone0 = drawMenuPhone;     // function declarations are bindings: drawMenu() calls this one
drawMenuPhone = (x, y, MH) => {     // eslint-disable-line no-func-assign
  const note = P.solo && P.solo.note && P.solo.note.phone; if (!note) { menuPhone0(x, y, MH); return; }
  txt(fit(note.head, MENU.w - 48, 32), x + 24, y + 74, 32, WH); para(note.text, x + 24, y + 120, MENU.w - 48, 26, G, 32);
  menuBtn(x + MENU.w - 224, y + MH - 78, 200, 54, 'Retour', () => { L.menu.view = null; });
};
const bootRows0 = bootRows;           // his boot check (Rétro): the phone's own parts, not a Pi's (solo.boot)
bootRows = () => (P.solo && Array.isArray(P.solo.boot) && P.solo.boot.length ? P.solo.boot : bootRows0());   // eslint-disable-line no-func-assign
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
  if (L.full || !P || L.boot >= 0 || L.banner || rubAt || (PV.id && L.scr === 'visage' && !CA.id) || (L.local && now < L.local.until) || (L.pack && now < L.pack.until) || r < L.fastUntil || r - L.inputAt < 2500 || r - L.changeAt < 1200) return 60;
  if (CA.yt && !CA.yt.err && now - CA.t > 1500) return 10;                // YouTube plays in its own frame: the canvas around it rests
  if (CA.id) {                        // a cast: a new frame of a video or a GIF is drawn when it comes (L.dirty); the little Pixel beside it
    if (now - CA.t < 1500) return 60;
    if (CA.kind === 'screen') return CA.fps || (!castSrc() ? Math.min(T.faceFps || 30, 30) : CA.rvfc && !CA.peek ? 10 : 30);   // a shared screen: 30 im/s at most, as the computer sends them
    if (CA.ifr) return 10;            // YouTube, Vimeo: their player shows the video, the Pi decodes it
    if (CA.vid && !CA.vfc && !CA.ended && !CA.err) return 60;   // without requestVideoFrameCallback: every frame
    return CA.vid || CA.gif ? 15 : Math.min(T.faceFps || 30, 30);
  }
  const calm = T.calmFps || 10;                       // still screens: the clock, a blinking cursor
  const ad = addonOn(); if (ad && ad.fps) { const f = ad.fps(calm); if (f) return f; }   // an add-on's view (web/exos.js)
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
    case 'minuteur': return 20;                       // the little Pixel walks about
    default: return calm;
  }
}
let drawnAt = -1e9, seenScr = '', seenTheme = '';
function personaCtx() {               // what the personality needs to know about the world
  const vis = L.scr === 'visage' && L.boot < 0 && !CA.id, rooms = P.lights && P.lights.rooms || [], h = new Date().getHours();
  const free = vis && !L.sleepy && mood() === 'neutre' && !serverAnim() && P.chat.phase === 'idle' && !(P.codex && P.codex.running) && !L.banner
    && !(L.packEv && now < L.packEv.until) && !(L.kiosk && (P.settings.sleep_min || 10) * 60000 - (now - L.lastInput) < 20000);
  return { visage: vis, canLive: free && !addonBusy(), idle: now - L.lastInput, weather: P.weather && P.weather.now ? P.weather.now.kind : '',
    lightsOn: rooms.length ? rooms.some(r => r.on) : null, night: h >= 23 || h < 6, rm: RM,
    events: ((P.agenda && P.agenda.events) || []).filter(e => e.day === 0 && !e.allday),           // today's, for his reminders
    temp: P.sys && P.sys.temp != null ? P.sys.temp : null, wifi: P.sys && 'wifi' in P.sys ? P.sys.wifi : undefined };
}
function update() {
  if (now > L.blink.next) { L.blink.t = now; L.blink.next = now + 2000 + rnd() * 4000; }   // for faces drawn without a life state
  if (L.kiosk && P && L.scr === 'visage' && !L.sleepy && now - L.lastInput > (P.settings.sleep_min || 10) * 60000) L.sleepy = true;
  if (now > fitAt) { fitAt = now + 1000; fitCanvas(); }
  if (L.menu && !L.menu.off && realNow() - L.inputAt > (L.menu.view === 'phone' ? 90000 : 20000)) L.menu = null;   // closes itself after 20 s untouched (90 s on the QR code: time to scan it)
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
  const cast = P ? castSync() : null;                 // a photo, a video... from a phone, over the screen that is open
  if (!cast !== !L.casting) { L.casting = !!cast; const sc = cv.parentElement; if (sc && sc.classList) sc.classList.toggle('casting', L.casting); }   // style.css: no scanlines over a cast
  if (!P) { txt('CONNEXION À PIXEL' + '.'.repeat(1 + Math.floor(now / 400) % 3), 40, 200, 40, G); if (L.error) para(L.error, 40, 260, 720, 28, AM); }
  else if (L.boot >= 0) drawBoot();
  else {                                            // a cast covers everything: the exercises (an add-on) and the food tray wait under it
    if (PER) PV = PER.update(dt, personaCtx());
    if (cast) drawCast(cast);
    else { const ad = addonOn(); if (!ad || !ad.instead()) (DRAW[L.scr] || drawVisage)(dt); if (ad) addonDraw(ad, dt); }
  }
  if (P && L.boot < 0 && !cast && window.PixelNourrir) window.PixelNourrir.over(NOUR);   // Nourrir: his food tray (web/nourrir.js), never over a cast
  if (P && L.boot < 0 && !cast && window.PixelAlbum && window.PixelAlbum.over) { X.save(); try { window.PixelAlbum.over(KIT); } catch (e) { /* never stops him */ } X.restore(); }   // the album's flash (web/album.js), never over a cast
  if (P && L.boot < 0 && !cast && window.PixelWifi && window.PixelWifi.over) { X.save(); try { window.PixelWifi.over(KIT); } catch (e) { /* never stops him */ } X.restore(); }   // « Pas de Wi-Fi » over his face (web/wifi.js)
  if (P && L.menu && L.boot < 0) drawMenu();
  drawBanner();
  if (T.fg && !cast) { X.shadowBlur = 0; X.globalAlpha = 1; T.fg(dt); }     // the CRT effects (Rétro), the LCD's glass: never over a cast
}
function toCanvas(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
addEventListener('resize', () => { fitAt = 0; });
return {
  local: L,
  start() {
    loadFonts(T);                                   // the other themes' fonts come with the server's list of themes
    fitCanvas(); requestAnimationFrame(frame);
  },
  setSend(fn) { send = fn; },
  setState(p) {
    offset = p.server_now - Date.now(); useTheme(p.view.theme);
    for (const id of (p.settings && p.settings.themes) || IDS) loadFonts(THEMES[id]);   // the themes Pixel offers: ready before you pick one
    if (first) { L.lastToast = p.toast?.id || 0; L.lastBootAt = p.boot_at; if (L.kiosk) L.boot = now; first = false; }
    if (P && P.codex && P.codex.running && p.codex && !p.codex.running && p.codex.status !== 'arrêté') L.packEv = { id: /^terminé/.test(p.codex.status) ? 'succes' : 'erreur', until: now + 4000 };
    if (PER && P) {                                   // what happened, for his personality (persona.js EVENTS)
      const ev = (n, d) => PER.event(n, d || {}, { visage: L.scr === 'visage' && L.boot < 0 });
      if (P.codex && p.codex && !P.codex.running && p.codex.running) ev('codex-start');
      if (P.codex && p.codex && P.codex.running && !p.codex.running && p.codex.status !== 'arrêté') ev(/^terminé/.test(p.codex.status) ? 'codex-ok' : 'codex-fail');
      if (P.timer && p.timer && !P.timer.running && p.timer.running) ev('timer-start');
      if (P.timer && p.timer && (p.timer.done || 0) > (P.timer.done || 0)) ev('timer-done');
      const lit = r => (r || []).map(x => (x.on ? x.bri : 0)).join(), anyOn = r => (r || []).some(x => x.on);
      if (P.lights && p.lights && lit(P.lights.rooms) !== lit(p.lights.rooms) && anyOn(P.lights.rooms) && anyOn(p.lights.rooms)) ev('lights-change');
      const wk = w => w && w.now && w.now.kind;
      if (wk(P.weather) && wk(p.weather) && wk(P.weather) !== wk(p.weather)) ev('weather', { kind: wk(p.weather) });
      if (p.act && p.act.t0 !== (P.act && P.act.t0) && !/^(screen\.show|view\.|mood\.|anim\.|scene\.|face\.|theme\.|lab\.|cmd$|chat\.|caractere\.|nourrir\.|exos\.|poche\.|cast\.|yt\.|ytcast\.|ecran\.|airplay\.|amis\.|wifi\.)/.test(p.act.name)) ev('action', { name: p.act.name });   // not his own face's business
    }
    if (PER && window.PixelCaractere) window.PixelCaractere.screen(PER, P, p);   // his character (caractere.js): his traits, and how he takes a change
    if (window.PixelLook) window.PixelLook.screen(PER, P, p, { visage: L.scr === 'visage' && L.boot < 0 && !CA.id });   // his look (look.js): what he wears, his reactions
    if (p.toast && p.toast.id !== L.lastToast) {
      L.lastToast = p.toast.id; L.banner = { msg: p.toast.msg, ms: p.toast.ms || 3000, t: now };
      const busy = p.mood && p.mood.name !== 'neutre' && (!p.mood.until || p.server_now < p.mood.until);
      if (!busy && !(L.packEv && now < L.packEv.until) && !/^(THÈME|VISAGE) /.test(p.toast.msg)) {   // not for our own settings
        L.packEv = { id: 'notification', until: now + 4000 };
        if (PER && P) PER.event('notif', { msg: p.toast.msg }, { visage: L.scr === 'visage' && L.boot < 0 });
      }
    }
    if (P && P.screen === 'veille' && p.screen === 'visage') L.pack = { id: 'reveil', until: now + 5000 };
    if (p.anim && p.anim.t0 !== (P && P.anim && P.anim.t0)) { L.pack = null; L.local = null; if (PER && PER.busy()) PER.stop(); }   // a new animation asked for takes over at once
    if (PER && P && p.scene && p.scene.t0 !== (P.scene && P.scene.t0) && p.server_now - p.scene.t0 < 10000) PER.play(p.scene.id);   // "fais le poisson"
    if (p.boot_at > L.lastBootAt) { L.lastBootAt = p.boot_at; L.boot = now; }
    for (const a of ADDONS) if (a.state) try { a.state(p, P); } catch (e) { console.warn('Pixel: an add-on failed', e); }   // web/exos.js
    P = p; L.dirty = true;
  },
  input() {
    L.lastInput = now; L.inputAt = realNow();
    if (L.sleepy) { L.sleepy = false; L.local = { name: 'surpris', until: now + 900 }; L.pack = { id: 'reveil', until: now + 5000 }; if (PER) PER.input({ wake: true }); return true; }
    if (PER) PER.input();                                     // back after a while: he says so
    return false;
  },
  persona: PER,
  event(name, data, force) { return PER ? PER.event(name, data || {}, { visage: L.scr === 'visage' && L.boot < 0, force: !!force }) : ''; },   // app.js: typing; the lab: force
  menu(open, view) {              // view 'phone': straight to the QR code page, sliding in from the right (swipe left on his face)
    if (open === !!L.menu && !view) return;
    L.menu = open ? { t: now, confirm: null, off: null, view: view || null, direct: !!view } : null; fast(300); L.dirty = true;
  },
  get menuOpen() { return !!L.menu; },
  get buddy() { return { x: BUD.x, act: BUD.act, dir: BUD.dir }; },   // the little Pixel of the Minuteur screen (tests, lab)
  get cast() { return { id: CA.id, kind: CA.kind, ready: !!castSrc(), err: CA.err, frame: CA.gif ? CA.gif.i : -1, bitmap: !!CA.bmp, video: !!CA.vid, playing: !!(CA.vid && !CA.vid.paused), player: !!(CA.ifr || (CA.yt && !CA.yt.err)), yt: CA.yt ? CA.yt.info() : null, peek: CA.peek, frames: CA.rvfc }; },   // tests, lab
  get casting() { return !!(P && castLive()); },   // a cast is on (pixel/cast.py): drawn over everything, the add-ons and Nourrir wait (web/exos.js, web/nourrir.js)
  addon(a) { ADDONS.push({ on: () => false, instead: () => false, ...a }); RANKED = [...ADDONS].sort((x, y) => rank(x) - rank(y)); L.dirty = true; return KIT; },   // web/exos.js…: ORDER above
  get addonTop() { const a = P ? addonOn() : null; return a ? a.name || 'addon' : ''; },   // the add-on over his face now ('': none): Nourrir waits under all of them
  order: ORDER,
  hit(x, y) { for (let i = hits.length - 1; i >= 0; i--) { const [hx, hy, w, h, fn] = hits[i]; if (x >= hx && x <= hx + w && y >= hy && y <= hy + h) { fn({ x, y }); return; } } },
  toCanvas,
};
})();
