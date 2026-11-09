/* Pixel's math exercises on the screens. pixel/exos.py gives them (snapshot "exos"), web/scenes/exos.js has his reactions.
   - The view (a screens.js add-on): on his face screen, while an exercise is open, the question big, 4 big choices, his face
     small and reacting beside it (his scenes; his lines in a bubble of their own), the chrono bar, the result and its
     correction, the summary of a series; then back to his face. In every theme, drawn on the canvas like the other screens.
     Touch: a choice answers, his face gives the hint (and reacts as usual). A keyboard (the Pi's, a computer's): digits then
     Entrée, 1 to 4 for answers that are not numbers, Retour arrière, i for the hint, Échap to stop.
   - He reacts: the server's "ev" becomes his persona events (exo-juste…), each one played (its own id: no 4 s cooldown);
     after 40 s on a question, a gentle nudge.
   - Every answer names its exercise (id): a double tap, or a late screen, never answers the next one.
   - While an exercise is open it owns his face screen: Nourrir's plate and tray (web/nourrir.js, when there) wait.
   - His offer « Une petite question ? » (the moment of life exo-envie, when the setting is on): « Oui ! » and « Plus tard ».
   - On a phone (app.js's page, not the kiosk): an « Exos » button under the keys opens a panel (exos.css): start buttons,
     the question with its choices and a keypad, the hint, the correction, the scores and the settings.
   Loaded after screens.js and before app.js. Nothing changes until an exercise is opened. */
window.PixelExos = (() => {
const Sc = typeof Screens !== 'undefined' ? Screens : null; if (!Sc || !Sc.addon) return null;
const L = Sc.local, PER = Sc.persona, W = 800;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const kioskPage = typeof location !== 'undefined' && /[?&]kiosk\b/.test(location.search);
let P = null, E = null, K = null;                   // the last snapshot, its "exos", the screens' kit
const V = { buf: '', pressed: -1, pressAt: 0, ev: -1, cur: -1, nudged: false, flash: null, lastId: -1, offerAt: -1e12, exoAt: -1e12, offering: false, line: '', lineAt: 0 };
const cur = () => (E && E.cur) || null;
const open = () => !!cur();
const nowMs = () => (K ? K.now : performance.now());
const srv = () => (K ? K.srv() : Date.now());
const NUM = s => /^−?[\d\u00a0]+(?:,\d+)?(?:\u00a0min)?$/.test(s);
function trait(name) {                              // his character (another add-on): 0..100, 50 when there is none
  const car = P && P.caractere, C = window.PixelCaractere; let t = car && car.traits;
  if (t && car.humeur_jour === true && C && C.today) try { t = C.today(car); } catch (e) { /* the plain traits */ }   // his mood of the day
  const v = t && t[name];
  return typeof v === 'number' && isFinite(v) ? clamp(v, 0, 100) : 50;
}
function send(action, args) { if (K) K.send(action, args || {}); }

/* ---------- what happens: snapshots ---------- */
const EVN = { propose: 'exo-propose', juste: 'exo-juste', faux: 'exo-faux', serie: 'exo-serie', objectif: 'exo-objectif' };
const BIP = { juste: 'youpi', serie: 'danse', objectif: 'youpi', faux: 'hmm' };
function state(p) {
  const first = !P; P = p; E = p.exos || null;
  const c = cur();
  if (c && c.id !== V.cur) { V.cur = c.id; V.buf = ''; V.nudged = false; V.pressed = -1; V.exoAt = Date.now(); }
  if (!c) V.cur = -1;
  const last = E && E.last;
  if (last && last.id !== V.lastId) { if (!first && c && c.mode === 'chrono') V.flash = { ok: last.ok, answer: last.answer, at: nowMs() }; V.lastId = last.id; }
  const ev = E && E.ev;
  if (ev && ev.id !== V.ev) {
    const fresh = !first && (p.server_now || Date.now()) - ev.t0 < 10000;
    V.ev = ev.id;
    if (fresh && EVN[ev.kind] && Sc.event) {
      Sc.event(EVN[ev.kind], { ...ev, n: ev.n, essai: ev.essai }, true);   // each answer gets its scene (the server spaces milestones out)
      const son = window.PixelSon; if (son && son.on && BIP[ev.kind]) try { son.play(BIP[ev.kind]); } catch (e) { /* his voice must never stop him */ }
    }
  }
  guard();
  panelState();
}

/* ---------- other views over his face screen wait while an exercise is open ----------
   web/nourrir.js (another add-on, when both are there) draws its plate in the bottom right corner, over choices 2 and 4,
   and its touch zone would win: while an exercise is open, it is neither drawn nor opened. */
function guard() {
  const N = window.PixelNourrir;
  if (!N || N.exosGuard || typeof N.over !== 'function') return;
  const over = N.over, swipe = N.swipe;
  N.over = k => { if (!open()) return over(k); if (N.trayOpen && N.close) N.close(); };
  if (typeof swipe === 'function') N.swipe = (dy, y0) => (open() ? false : swipe(dy, y0));
  N.exosGuard = true;
}

/* ---------- the view on the canvas ---------- */
const FX = 8, FY = 54, FW = 288, FH = 162, RX = 316, RW = 476;   // his face (left), the question and the choices (right)
const CH = [[RX, 292], [RX + 244, 292], [RX, 380], [RX + 244, 380]], CW = 232, CHH = 80;
const M0 = { x: 0, y: 0, s: 1, r: 0, f: false, sx: 1, sy: 1 };
function offering() { return !!PER && PER.state.cur === 'exo-envie'; }
/* over his face screen, first come: a cast (pixel/cast.py, when there: snapshot "cast"), the quick menu, then an open exercise,
   then its offer, then Nourrir's tray and plate (web/nourrir.js gives way to both) */
function castOn() { const c = P && P.cast; return !!(c && c.id && (!c.until || srv() < c.until)); }
const ad = {
  on: scr => scr === 'visage' && L.boot < 0 && !!E && !castOn() && (open() || offering()),
  instead: () => open(),
  busy: () => open(),
  fps: calm => (!open() ? 0 : cur().mode === 'chrono' && cur().etat === 'question' ? 20 : V.flash && nowMs() - V.flash.at < 1600 ? 30 : calm),
  state,
  draw(k) { if (open()) drawExo(k); else drawOffer(k); },
};
K = Sc.addon(ad);

function label(k, s) { return k.T.upper ? s.toUpperCase() : s; }
function button(k, x, y, w, h, text, fn, o = {}) {           // a touch button of the theme, at least 56 px high
  const { G, D, B } = k.c, on = !!o.fill, c = o.warn ? k.c.AM : o.dim ? D : G;
  k.box(x, y, w, h, c, on ? c : B);
  const size = o.size || 28;
  k.txt(k.fit(label(k, text), w - 14, size), x + w / 2, y + (h - size) / 2 + 1, size, on ? (k.T.onFg || B) : c, 'center');
  k.hit(x, y, w, h, () => { if (L.petted) { L.petted = false; return; } L.dirty = true; fn(); });
}
function star(k, x, y, r, filled) {                          // a star of the daily goal: whole pixels in Rétro and LCD
  const X = k.X, { AM, D } = k.c, col = filled ? AM : D;
  X.save(); X.fillStyle = X.strokeStyle = X.shadowColor = col;
  if (k.T.faceFps) {
    const S = ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '##...##'], u = Math.max(2, Math.round(r / 3.5));
    S.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#' && (filled || j === 0 || j === 6 || i === 0 || i === 6 || row[i - 1] !== '#' || row[i + 1] !== '#' || S[j - 1][i] !== '#' || (S[j + 1] || '')[i] !== '#')) X.fillRect(Math.round(x - 3.5 * u) + i * u, Math.round(y - 3.5 * u) + j * u, u, u); }));
  } else {
    X.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; X.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } X.closePath();
    if (filled) X.fill(); else { X.lineWidth = 2; X.stroke(); }
  }
  X.restore();
}
function title(c) {
  if (c.etat === 'bilan') return c.mode === 'chrono' ? 'Défi chrono' : c.mode === 'table' ? c.type : 'Fin de la série';
  if (c.mode === 'chrono') return 'Défi chrono';
  if (c.mode === 'table') return `${c.type} · ${c.i}/${c.n}`;
  if (c.mode === 'serie') return `Série · ${c.i}/${c.n}`;
  return c.kind === 'enigme' ? 'Une énigme' : 'Exo de maths';
}
function faceWant(c, e) {                                    // what his small face does when no scene plays
  if (c.etat === 'bilan') return c.bons / Math.max(1, c.total) >= 0.6 ? ['fier', 'fier'] : ['content', 'content'];
  if (c.etat === 'resultat') return c.ok ? ['content', 'content'] : ['reflechit', 'reflechit'];
  if (c.mode === 'chrono') return ['code', 'reflechit'];
  return e < 4500 ? ['ecoute', 'ecoute'] : ['reflechit', 'reflechit'];   // he listens, then he thinks along with you
}
function drawExo(k) {
  const c = cur(), { G, D, DK, B, AM, WH } = k.c, X = k.X, t = srv(), e = t - (c.t0 || t), PV = k.PV;
  k.header(title(c), k.clock());
  // his face, small, with his scenes scaled down to its box
  const box = { x: FX, y: FY, w: FW, h: FH }, sc = FW / 672;
  const m = PV.id ? { ...PV.m, x: PV.m.x * sc, y: PV.m.y * sc } : null, [anim, md] = faceWant(c, e);
  X.save(); k.face('exo', PV.id ? PV.anim : anim, PV.id ? (PV.mood || md) : md, FX, FY, FW, FH, m); X.restore();
  let line = '';
  if (PV.id && PER) { X.save(); X.shadowBlur = 0; line = PER.drawOver(box, m || M0, { noBubble: true }) || ''; X.restore(); k.glow(); }
  k.hit(FX, FY, FW, FH, p => {                               // touch his face: the hint, and he reacts as usual
    if (L.petted) { L.petted = false; return; }
    if (c.etat === 'question' && !c.hint) send('exos.indice');
    if (PER) PER.tap(p, box, {});
  });
  // what he says, in a bubble of its own under his face (never over the question)
  const bx = FX + 6, by = FY + FH + 12, bw = FW - 12, bh = 56;
  const say = line || (c.etat === 'question' && !c.hint && c.mode !== 'chrono' ? 'Touche-moi : un indice !' : '');
  if (say) {
    X.fillStyle = B; X.beginPath(); X.moveTo(bx + bw / 2 - 12, by + 1); X.lineTo(bx + bw / 2, by - 12); X.lineTo(bx + bw / 2 + 12, by + 1); X.fill();
    k.box(bx, by, bw, bh, line ? G : D, B);
    const fs = 24, ls = k.wrap(say, bw - 20, fs).slice(0, 2), lh = fs + 2;
    ls.forEach((l, i) => k.txt(k.fit(l, bw - 20, fs), bx + bw / 2, by + (bh - ls.length * lh) / 2 + i * lh + 1, fs, line ? WH : D, 'center'));
  }
  // today: the stars of the daily goal
  const st = E.stats, goal = clamp(st.objectif || 5, 1, 50), done = st.aujourdhui || 0, sy = by + bh + 18;
  k.txt(label(k, "Aujourd'hui"), FX + 6, sy, 22, D);
  if (goal <= 8) for (let i = 0; i < goal; i++) star(k, FX + 14 + i * 34, sy + 44, 13, i < done);
  else k.txt(`${Math.min(done, goal)} / ${goal}`, FX + 6, sy + 28, 32, done >= goal ? AM : G);
  if (st.fait) k.txt(label(k, 'Objectif atteint !'), FX + FW - 2, sy, 22, AM, 'right');
  // the right side
  if (c.etat === 'bilan') drawBilan(k, c); else drawQuestion(k, c, t);
  // the buttons, bottom left
  const yb = 410, hb = 60;
  if (c.etat === 'question') {
    button(k, FX, yb, 116, hb, 'Indice', () => send('exos.indice'), { dim: !!c.hint, size: 26 });
    button(k, FX + 124, yb, 116, hb, 'Passer', () => send('exos.passer', { id: c.id, etat: c.etat }), { size: 26 });
    button(k, FX + 248, yb, 56, hb, '×', () => send('exos.stop'), { size: 36 });
  } else if (c.etat === 'resultat' && (c.mode === 'serie' || c.mode === 'table') && c.i < c.n) {
    button(k, FX, yb, 240, hb, 'Suivant', () => send('exos.passer', { id: c.id, etat: c.etat }), { fill: true });
    button(k, FX + 248, yb, 56, hb, '×', () => send('exos.stop'), { size: 36 });
  } else {
    button(k, FX, yb, 148, hb, 'Encore', () => send('exos.encore'), { fill: true });
    button(k, FX + 156, yb, 148, hb, 'Fini', () => send('exos.stop'));
  }
  // a gentle nudge after 40 s on the same question
  if (c.etat === 'question' && c.mode !== 'chrono' && !V.nudged && e > 40000 && !PV.id) { V.nudged = true; if (Sc.event) Sc.event('exo-attente', {}); }
}
function fitText(k, s, w, h, sizes, kind) {                  // the biggest size at which the text fits the box
  for (const fs of sizes) { const ls = k.wrap(s, w, fs, kind); if (ls.length * (fs + 6) <= h && ls.every(l => { k.X.font = k.T.font(fs, kind); return k.X.measureText(l).width <= w; })) return { fs, ls }; }
  const fs = sizes[sizes.length - 1]; return { fs, ls: k.wrap(s, w, fs, kind).slice(0, Math.floor(h / (fs + 6))) };
}
function drawQuestion(k, c, t) {
  const { G, D, DK, B, AM, WH } = k.c, X = k.X, res = c.etat === 'resultat';
  // the line above: the kind and the level, or the chrono
  if (c.mode === 'chrono' && c.ends_at) {
    const left = clamp((c.ends_at - t) / 1000, 0, 60), n = 15;
    k.bar(RX, 62, n, left / 60 * n, (RW - 200 - (n - 1) * 3) / n, 16, 3, left < 10 ? AM : G, DK);
    k.txt(`${Math.ceil(left)} s`, RX + RW, 56, 28, left < 10 ? AM : WH, 'right');
    k.txt(label(k, `${c.bons || 0} juste${(c.bons || 0) > 1 ? 's' : ''}`), RX + RW - 72, 58, 22, D, 'right');
  } else k.txt(k.fit(label(k, `${c.type} · niveau ${c.niveau}`), RW, 22), RX, 58, 22, D);
  if (res) {                                                 // the verdict and the correction
    const ok = c.ok, head = c.passe ? 'La réponse :' : ok ? (c.monte ? `Juste ! Niveau ${c.niveau + 1} !` : 'Juste !') : 'Pas tout à fait…';
    k.txt(k.fit(label(k, head), RW, 44), RX, 90, 44, ok ? WH : AM, 'left', 'title');
    const r = fitText(k, c.explication || '', RW, 146, [30, 27, 24, 21]);
    r.ls.forEach((l, i) => k.txt(l, RX, 142 + i * (r.fs + 6), r.fs, G));
  } else {                                                   // the question, as big as it fits
    const short = c.q.length <= 26, r = fitText(k, c.q, RW, 140, short ? [72, 64, 56, 48, 40] : [44, 40, 36, 32, 28, 26], short ? 'title' : undefined);
    const h = r.ls.length * (r.fs + 6), y0 = 92 + Math.max(0, (140 - h) / 2);
    r.ls.forEach((l, i) => k.txt(l, RX + RW / 2, y0 + i * (r.fs + 6), r.fs, WH, 'center', short ? 'title' : undefined));
    const fl = V.flash && k.now - V.flash.at < 1500 ? V.flash : null;
    if (V.buf) k.txt(k.fit('› ' + V.buf + (Math.floor(k.now / 450) % 2 ? '_' : ' '), RW, 34), RX + RW / 2, 244, 34, WH, 'center', 'title');
    else if (fl) k.txt(k.fit(fl.ok ? 'Juste !' : `Raté : ${fl.answer}`, RW, 30), RX + RW / 2, 246, 30, fl.ok ? G : AM, 'center');
    else if (c.hint) { const ls = k.wrap('Indice : ' + c.hint, RW, 22).slice(0, 2); ls.forEach((l, i) => k.txt(l, RX, 240 + i * 24, 22, AM)); }
  }
  // the 4 choices
  const pad = c.clavier === '' && !res;                      // 1 to 4 on a keyboard when the answers are not numbers
  const num = c.choices.every(NUM), kind = num ? 'title' : undefined;
  const sizes = c.choices.map(s => fitText(k, s, CW - 28, CHH - 12, [40, 34, 30, 26, 22], kind)), fs = Math.min(...sizes.map(r => r.fs));   // one size for the 4
  c.choices.forEach((s, i) => {
    const [x, y] = CH[i], right = res && c.answer === s, wrongPick = (c.faux || []).includes(s), pressed = V.pressed === i && k.now - V.pressAt < 500;
    const col = right ? G : wrongPick ? AM : res ? D : G, fill = right || pressed ? col : null;
    k.box(x, y, CW, CHH, col, fill);
    const ink = fill ? (k.T.onFg || B) : wrongPick ? AM : res && !right ? D : WH, ls = k.wrap(s, CW - 28, fs, kind).slice(0, 2), lh = fs + 6;
    ls.forEach((l, j) => k.txt(k.fit(l, CW - 20, fs, kind), x + CW / 2, y + (CHH - ls.length * lh) / 2 + j * lh + 3, fs, ink, 'center', kind));
    if (wrongPick) { X.save(); X.strokeStyle = X.shadowColor = AM; X.lineWidth = 3; X.beginPath(); X.moveTo(x + 18, y + CHH - 18); X.lineTo(x + CW - 18, y + 18); X.stroke(); X.restore(); }
    if (pad) k.txt(String(i + 1), x + 10, y + 6, 20, D);
    if (!res && !wrongPick) k.hit(x, y, CW, CHH, () => { if (L.petted) { L.petted = false; return; } V.pressed = i; V.pressAt = k.now; V.buf = ''; L.dirty = true; k.fast(500); send('exos.repondre', { value: s, id: c.id }); });
  });
}
function drawBilan(k, c) {
  const { G, D, AM, WH } = k.c, chrono = c.mode === 'chrono', ratio = c.bons / Math.max(1, c.total);
  k.txt(label(k, chrono ? 'Temps écoulé !' : 'Série terminée !'), RX + RW / 2, 64, 36, WH, 'center', 'title');
  const score = chrono ? String(c.bons) : `${c.bons} / ${c.total}`;
  k.txt(score, RX + RW / 2, 112, 96, chrono || ratio >= 0.6 ? WH : G, 'center', 'title');
  k.txt(label(k, chrono ? `bonne${c.bons > 1 ? 's' : ''} réponse${c.bons > 1 ? 's' : ''} en une minute` : ratio === 1 ? 'Sans faute !' : ratio >= 0.6 ? 'Bien joué !' : 'Tu progresses !'), RX + RW / 2, 222, 28, G, 'center');
  const n = chrono ? Math.min(3, Math.floor(c.bons / 4)) : Math.round(ratio * 3);
  for (let i = 0; i < 3; i++) star(k, RX + RW / 2 + (i - 1) * 64, 300, 24, i < n);
  if (chrono) k.txt(label(k, c.nouveau_record ? 'Nouveau record !' : `Record : ${c.record}`), RX + RW / 2, 346, 30, c.nouveau_record ? AM : D, 'center');
}
function drawOffer(k) {                                     // « Une petite question ? »: two buttons under his face
  if (!V.offering) { V.offering = true; V.offerAt = Date.now(); }
  const e = PER.current().e || 0; if (e < 1400) return;
  const X = k.X, q = clamp((e - 1400) / 300, 0, 1), y = 410 + Math.round((1 - q) * 24);
  X.save(); X.globalAlpha = q; X.shadowBlur = 0; X.fillStyle = k.c.B; X.fillRect(0, 403, W, 77); X.restore();   // over the line of news at the bottom
  X.save(); X.globalAlpha = q;
  button(k, 196, y, 196, 60, 'Plus tard', () => { if (PER) PER.play('exo-plustard'); });
  button(k, 408, y, 196, 60, 'Oui !', () => { if (PER) PER.stop(); send('exos.nouveau', { mode: 'exo', source: 'envie' }); }, { fill: true });
  X.restore();
}
setInterval(() => { if (V.offering && !offering()) V.offering = false; }, 1000);

/* ---------- a keyboard: the Pi's, or a computer's (not while typing in a field) ---------- */
function visible() { const cv = document.getElementById('crt'); return !!cv && cv.offsetParent !== null; }
function choose(i) { const c = cur(); if (!c || c.etat !== 'question' || !c.choices[i] || (c.faux || []).includes(c.choices[i])) return; V.pressed = i; V.pressAt = nowMs(); send('exos.repondre', { value: c.choices[i], id: c.id }); }
function submit() {
  const c = cur(); if (!c || c.etat !== 'question' || !V.buf) return;
  const b = V.buf.trim(); V.buf = '';
  send('exos.repondre', { value: b, id: c.id });
}
addEventListener('keydown', e => {
  const c = cur();
  if (!c || L.scr !== 'visage' || L.boot >= 0 || castOn() || e.ctrlKey || e.metaKey || e.altKey || !visible()) return;
  const t = e.target; if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
  const q = c.etat === 'question', key = e.key;
  let done = true;
  if (q && /^[0-9]$/.test(key)) { if (c.clavier === '' && key >= '1' && key <= '4') choose(+key - 1); else if (V.buf.length < 8) V.buf += key; }
  else if (q && (key === ',' || key === '.') && c.clavier === 'num' && !V.buf.includes(',')) V.buf += ',';
  else if (q && (key === 'h' || key === 'H' || key === ':') && c.clavier === 'heure' && V.buf && !/h/.test(V.buf)) V.buf += ' h ';
  else if (q && key === '-' && !V.buf) V.buf = '−';
  else if (q && key === 'Backspace') { if (!V.buf) done = false; else V.buf = V.buf.endsWith(' h ') ? V.buf.slice(0, -3) : V.buf.slice(0, -1); }
  else if (key === 'Enter') { if (q) submit(); else if (c.etat === 'bilan' || !(c.mode === 'serie' || c.mode === 'table')) send('exos.stop'); else send('exos.passer', { id: c.id, etat: c.etat }); }
  else if (key === 'Escape') { if (V.buf) V.buf = ''; else send('exos.stop'); }
  else if (q && (key === 'i' || key === '?')) send('exos.indice');
  else done = false;
  if (!done) return;
  e.preventDefault(); e.stopImmediatePropagation();
  Sc.input(); L.dirty = true;
}, true);

/* ---------- the phone: the « Exos » panel ---------- */
const $el = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; };
let panel = null, goBtn = null, shown = '', shownStats = '', padBuf = '', chronoT = 0;
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
function mountPanel() {
  const foot = document.querySelector('.kb .kfoot > span'); if (!foot || kioskPage || panel) return;
  goBtn = $el('button', 'follow exos-go', 'Exos'); goBtn.type = 'button'; goBtn.setAttribute('aria-expanded', 'false'); goBtn.title = 'Les exos de maths de Pixel';
  goBtn.addEventListener('click', () => togglePanel());
  const apk = foot.querySelector('#apk'); if (apk) apk.before(goBtn); else foot.append(goBtn);   // with Caractère and Nourrir, before the Android app's link
  panel = $el('section', 'exos'); panel.id = 'exos'; panel.hidden = true; panel.setAttribute('aria-label', 'Exos de maths');
  const head = $el('header', 'ex-head'), h2 = $el('h2', null, 'Exos de maths'), day = $el('span', 'ex-day'), x = $el('button', 'ex-x', '×');
  day.id = 'exDay'; x.type = 'button'; x.setAttribute('aria-label', 'Fermer les exos'); x.addEventListener('click', () => togglePanel(false));
  head.append(h2, day, x);
  const body = $el('div', 'ex-body'); body.id = 'exBody';
  const more = $el('div', 'ex-more'); more.id = 'exMore';
  panel.append(head, body, more);
  document.querySelector('.kb').after(panel);
  if (store.get('pixel.exos.open') === '1') togglePanel(true);
  panelState();
}
function togglePanel(on) {
  if (!panel) return;
  const v = on == null ? panel.hidden : !!on;
  panel.hidden = !v; goBtn.setAttribute('aria-expanded', String(v)); store.set('pixel.exos.open', v ? '1' : '0');
  if (!v) clearInterval(chronoT);                          // the challenge's clock stops with the panel; it starts again when it opens
  if (v) { shown = ''; shownStats = ''; panelState(); panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}
function btn(text, fn, cls) { const b = $el('button', cls || null, text); b.type = 'button'; b.addEventListener('click', fn); return b; }
const go = args => () => { send('exos.nouveau', args); padBuf = ''; };
function panelState() {
  if (!panel) return;
  const c = cur();
  goBtn.classList.toggle('live', !!c && panel.hidden);
  if (goBtn.textContent !== (c && panel.hidden ? 'Exos •' : 'Exos')) goBtn.textContent = c && panel.hidden ? 'Exos •' : 'Exos';
  if (panel.hidden || !E) return;
  const st = E.stats, goal = st.objectif || 5, done = st.aujourdhui || 0;
  const day = document.getElementById('exDay'), dtext = `${'★'.repeat(Math.min(done, goal, 10))}${'☆'.repeat(Math.max(0, Math.min(goal, 10) - done))} ${done}/${goal}`;
  if (day.textContent !== dtext) { day.textContent = dtext; day.title = `Aujourd'hui : ${done} exo${done > 1 ? 's' : ''} sur ${goal}`; }
  const key = JSON.stringify(c ? [c.id, c.etat, c.tries, c.hint, c.faux, c.ok, c.mode === 'chrono' ? 0 : c.i] : null);
  if (key !== shown) { shown = key; if (!c || c.id !== (renderBody.id || -1)) padBuf = ''; renderBody(c); }
  const skey = JSON.stringify([st, E.reglages, E.niveau]);
  if (skey !== shownStats) { shownStats = skey; renderMore(); }
}
function renderBody(c) {
  const body = document.getElementById('exBody'), out = [];
  renderBody.id = c ? c.id : -1;
  clearInterval(chronoT);
  if (!c) {
    const big = $el('div', 'ex-big');
    big.append(btn('Un exo', go({ mode: 'exo' })), btn('Série de 5', go({ mode: 'serie', n: 5 })), btn('Défi chrono', go({ mode: 'chrono' })), btn('Une énigme', go({ kind: 'enigme' })));
    const tables = $el('div', 'ex-chips'); for (let n = 2; n <= 10; n++) tables.append(btn(`× ${n}`, go({ mode: 'table', table: n }), 'chip'));
    const kinds = $el('div', 'ex-chips'); for (const kd of E.kinds || []) kinds.append(btn(kd.label, go({ kind: kd.id }), 'chip'));
    out.push(big, $el('h3', null, 'Les tables'), tables, $el('h3', null, 'Un type d’exo'), kinds);
  } else if (c.etat === 'bilan') {
    const chrono = c.mode === 'chrono', box = $el('div', 'ex-result ok');
    box.append($el('p', 'ex-verdict', chrono ? 'Temps écoulé !' : 'Série terminée !'), $el('p', 'ex-score', chrono ? `${c.bons} en une minute` : `${c.bons} / ${c.total}`));
    if (chrono) box.append($el('p', 'ex-expl', c.nouveau_record ? 'Nouveau record !' : `Record : ${c.record}`));
    const act = $el('div', 'ex-actions'); act.append(btn('Encore', () => send('exos.encore'), 'main'), btn('Fini', () => send('exos.stop')));
    out.push(box, act);
  } else {
    const meta = $el('p', 'ex-meta');
    meta.textContent = c.mode === 'chrono' ? 'Défi chrono' : `${c.type} · niveau ${c.niveau}${c.n > 1 ? ` · ${c.i}/${c.n}` : ''}`;
    out.push(meta);
    if (c.mode === 'chrono' && c.ends_at) {
      const bar = $el('div', 'ex-bar'), fill = $el('i'), txt = $el('span', 'ex-left');
      bar.append(fill); out.push(bar, txt);
      const tick = () => { const left = clamp((c.ends_at - srv()) / 1000, 0, 60); fill.style.width = (left / 60 * 100).toFixed(1) + '%'; txt.textContent = `${Math.ceil(left)} s · ${c.bons || 0} juste${(c.bons || 0) > 1 ? 's' : ''}`; };
      tick(); chronoT = setInterval(tick, 250);
    }
    out.push($el('p', 'ex-question', c.q));
    if (c.etat === 'resultat') {
      const r = $el('div', 'ex-result' + (c.ok ? ' ok' : ''));
      r.append($el('p', 'ex-verdict', c.passe ? 'La réponse :' : c.ok ? (c.monte ? `Juste ! Niveau ${c.niveau + 1} !` : 'Juste !') : 'Pas tout à fait…'), $el('p', 'ex-expl', c.explication || ''));
      out.push(r);
    } else if (c.hint) out.push($el('p', 'ex-hint', 'Indice : ' + c.hint));
    const ch = $el('div', 'ex-choices');
    c.choices.forEach(s => {
      const b = btn(s, () => { send('exos.repondre', { value: s, id: c.id }); padBuf = ''; }), wrong = (c.faux || []).includes(s);
      if (wrong) { b.disabled = true; b.classList.add('wrong'); }
      if (c.etat === 'resultat') { b.disabled = true; if (s === c.answer) b.classList.add('right'); }
      ch.append(b);
    });
    out.push(ch);
    if (c.etat === 'question' && c.clavier) {                // a keypad for numbers (and times: the h key; negative numbers: the − key)
      const typed = $el('output', 'ex-typed'); typed.id = 'exTyped'; typed.textContent = padBuf || ' ';
      const neg = c.clavier === 'num' && c.choices.some(x => x.startsWith('−'));
      const pad = $el('div', 'ex-pad'), keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', c.clavier === 'heure' ? 'h' : ',', '0', '⌫'];
      for (const kk of keys) pad.append(btn(kk, () => { if (kk === '⌫') padBuf = padBuf.slice(0, -1); else if (padBuf.length < 9) padBuf += kk === 'h' ? ' h ' : kk; typed.textContent = padBuf || ' '; }, kk === '⌫' ? 'del' : null));
      pad.lastChild.setAttribute('aria-label', 'Effacer');
      if (neg) {                                             // − puts the sign in front, or takes it away
        const m = btn('−', () => { padBuf = padBuf.startsWith('−') ? padBuf.slice(1) : '−' + padBuf; typed.textContent = padBuf || ' '; }, 'neg');
        m.setAttribute('aria-label', 'Moins'); pad.append(m);
      }
      pad.append(btn('OK', () => { if (padBuf.trim()) { send('exos.repondre', { value: padBuf.trim(), id: c.id }); padBuf = ''; typed.textContent = ' '; } }, 'ok' + (neg ? ' half' : '')));
      out.push(typed, pad);
    }
    const act = $el('div', 'ex-actions');
    if (c.etat === 'question') act.append(btn('Indice', () => send('exos.indice')), btn('Passer', () => send('exos.passer', { id: c.id, etat: c.etat })), btn('Arrêter', () => send('exos.stop')));
    else if ((c.mode === 'serie' || c.mode === 'table') && c.i < c.n) act.append(btn('Suivant', () => send('exos.passer', { id: c.id, etat: c.etat }), 'main'), btn('Arrêter', () => send('exos.stop')));
    else act.append(btn('Encore', () => send('exos.encore'), 'main'), btn('Fini', () => send('exos.stop')));
    if (c.etat === 'question' && c.hint) act.firstChild.disabled = true;
    out.push(act);
  }
  body.replaceChildren(...out);
}
function renderMore() {
  const more = document.getElementById('exMore'), st = E.stats, g = E.reglages;
  const keep = [...more.querySelectorAll('details')].map(d => d.open);
  const scores = $el('details', 'ex-scores'), sum = $el('summary', null, 'Mes scores');
  const pct = st.total ? Math.round(100 * st.justes / st.total) : 0;
  const dl = $el('dl', 'ex-stats');
  for (const [a, b] of [["Aujourd'hui", `${st.aujourdhui} exo${st.aujourdhui > 1 ? 's' : ''} sur ${st.objectif}`], ['En tout', `${st.total} · ${pct} % de justes`],
    ['Meilleure série', String(st.serie_max)], ['Record du défi chrono', String(st.record_chrono)], ['Objectifs atteints', String(st.coupes)], ['Niveau', String(E.niveau)]]) dl.append($el('dt', null, a), $el('dd', null, b));
  const troph = $el('ul', 'ex-troph');
  for (const t of E.trophees || []) { const li = $el('li', st.trophees.includes(t.id) ? 'got' : null, t.label); li.title = st.trophees.includes(t.id) ? 'Gagné !' : 'Pas encore'; troph.append(li); }
  const kinds = $el('ul', 'ex-kinds');
  for (const kd of E.kinds || []) {
    const v = (st.par_type || {})[kd.id]; if (!v || !v[0]) continue;
    const li = $el('li'), bar = $el('span', 'ex-acc'), fill = $el('i');
    fill.style.width = Math.round(100 * v[1] / v[0]) + '%'; bar.append(fill);
    li.append($el('span', null, kd.label), bar, $el('span', 'ex-n', `${v[1]}/${v[0]} · niv. ${v[2]}`)); kinds.append(li);
  }
  scores.append(sum, dl, $el('h3', null, 'Trophées'), troph);
  if (kinds.children.length) scores.append($el('h3', null, 'Par type'), kinds);
  const set = $el('details', 'ex-set'); set.append($el('summary', null, 'Réglages'));
  const row = (lab, ...items) => { const d = $el('div', 'ex-row'); d.append($el('span', 'ex-l', lab), ...items); return d; };
  const lv = $el('div', 'ex-seg'); for (let n = 1; n <= 5; n++) { const b = btn(String(n), () => send('exos.reglages', { niveau: n })); b.setAttribute('aria-pressed', String(g.niveau === n)); b.setAttribute('aria-label', `Niveau ${n}`); lv.append(b); }
  const auto = btn(g.auto ? 'Oui' : 'Non', () => send('exos.reglages', { auto: !g.auto }), 'tog'); auto.setAttribute('aria-pressed', String(g.auto));
  const obj = $el('div', 'ex-seg'); obj.append(btn('−', () => send('exos.reglages', { objectif: Math.max(1, g.objectif - 1) })), $el('output', null, String(g.objectif)), btn('+', () => send('exos.reglages', { objectif: Math.min(50, g.objectif + 1) })));
  obj.firstChild.setAttribute('aria-label', 'Objectif moins un'); obj.lastChild.setAttribute('aria-label', 'Objectif plus un');
  const prop = btn(g.propose ? 'Oui' : 'Non', () => send('exos.reglages', { propose: !g.propose }), 'tog'); prop.setAttribute('aria-pressed', String(g.propose));
  const types = $el('div', 'ex-chips');
  for (const kd of E.kinds || []) {
    const on = g.types.includes(kd.id), b = btn(kd.label, () => send('exos.reglages', { types: on ? g.types.filter(x => x !== kd.id) : [...g.types, kd.id] }), 'chip pick');
    b.setAttribute('aria-pressed', String(on)); types.append(b);
  }
  set.append(row('Niveau de départ', lv), row('S’adapte tout seul', auto), row('Objectif du jour', obj), row('Il te propose des questions', prop),
    $el('h3', null, 'Dans les exos au hasard'), types,
    $el('p', 'ex-note', 'Niveau 1 : CP, CE1 · 5 : collège. Trois bonnes réponses de suite font monter le niveau, une erreur le fait baisser.'));
  more.replaceChildren(scores, set);
  [...more.querySelectorAll('details')].forEach((d, i) => { d.open = !!keep[i]; });
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountPanel); else setTimeout(mountPanel); }

return {
  get state() { return E; }, get open() { return open(); }, get offering() { return offering(); }, get buffer() { return V.buf; }, trait,
  canPropose(c) {                                           // exo-envie (a moment of life): the setting on, in the day, not too often
    if (!E || open() || !E.reglages || !E.reglages.propose || !c || !c.day || castOn() || (window.PixelNourrir && window.PixelNourrir.trayOpen)) return false;   // not over a cast or his food tray
    const t = Date.now(); if (t - V.offerAt < 25 * 60000 || t - V.exoAt < 20 * 60000) return false;
    return Math.random() * 100 < 25 + 0.75 * trait('studieux');
  },
  choose, panel: on => togglePanel(on), layout: { face: { x: FX, y: FY, w: FW, h: FH }, choices: CH.map(([x, y]) => ({ x, y, w: CW, h: CHH })) },
};
})();
