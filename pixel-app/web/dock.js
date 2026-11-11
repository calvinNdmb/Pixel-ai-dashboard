/* The right edge of Pixel's face screen, on his own touch screen: his buttons, in the 64 px column outside his face box
   (PBOX), above Nourrir's plate (web/nourrir.js: the food, at y 352) and in its style:
     Réglages (the quick menu: brightness, sound, Wi-Fi, the phone, restart), Agenda (his calendar screen), the micro
     (pixel/voix.py: he listens, then what he heard goes as a command or to Claude).
   While he listens: what he hears, live, and the microphone's level, in a box at the bottom of his face screen or under
   the conversation of the Claude screen, with « Arrêter » (a touch anywhere on it stops him); elsewhere a red « MICRO »;
   then, for a moment, what he heard. The Claude screen, where a question by voice lands, has its own micro button (in its
   right panel): talk again, or stop.
   Only on the Pi's own screen (the kiosk page), on his face screen, when nothing else is over it (the quick menu, a cast,
   an add-on of screens.js's ORDER, Nourrir's tray) and he is awake: the same rules as the plate.
   Drawn by screens.js after Nourrir's plate (over(K), K: the screens' kit). Loaded after screens.js and before app.js. */
window.PixelDock = (() => {
const Sc = typeof Screens !== 'undefined' ? Screens : null; if (!Sc) return null;
const L = Sc.local, COL = 736, TOP = 136, STEP = 72;           // the column; its slots at 136, 208, 280 (the plate: 352)
const RM = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ICONS = {
  reglages: ['...####...', '.#.####.#.', '..######..', '####..####', '###....###', '###....###', '####..####', '..######..', '.#.####.#.', '...####...'],
  agenda: ['.##....##.', '##########', '##########', '#........#', '#.##.##..#', '#........#', '#.##.##..#', '#........#', '##########'],
  micro: ['...####...', '..######..', '..######..', '..######..', '#.######.#', '#.######.#', '.#.####.#.', '..#....#..', '...####...', '....##....', '..######..'],
};
function icon(K, name, cx, cy, u, col) {      // whole pixels: crisp in every theme
  const g = ICONS[name], X = K.X, x0 = Math.round(cx - g[0].length * u / 2), y0 = Math.round(cy - g.length * u / 2);
  X.save(); X.shadowBlur = 0; X.fillStyle = col;
  g.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') X.fillRect(x0 + i * u, y0 + j * u, u, u); });
  X.restore();
}
function shown(K) {
  const P = K.P;
  return L.kiosk && !!P && L.scr === 'visage' && L.boot < 0 && !L.sleepy && !Sc.menuOpen && !Sc.addonTop && !Sc.casting
    && !(window.PixelNourrir && window.PixelNourrir.trayOpen);
}
function buttonAt(K, x0, y0, name, on, fn, off) {   // a 64 px touch zone, a 48 px button in it
  const c = K.c, X = K.X, x = x0 + 8, y = y0 + 8, s = 48;
  X.save(); X.globalAlpha = off ? 0.45 : 0.85;
  K.box(x, y, s, s, on ? c.PK || c.AM : c.D, on ? c.PK || c.AM : c.B);
  if (on && !RM) { X.globalAlpha = 0.25 + 0.25 * Math.sin(K.now / 250); K.box(x - 3, y - 3, s + 6, s + 6, c.PK || c.AM, null); X.globalAlpha = 0.85; }
  icon(K, name, x + s / 2, y + s / 2, 4, on ? c.B : c.G);
  X.restore();
  K.hit(x0, y0, 64, 64, () => { L.dirty = true; K.fast(300); fn(); });
}
const button = (K, i, name, on, fn, off) => buttonAt(K, COL, TOP + i * STEP, name, on, fn, off);
const CLAUDE_MIC = { x: 668, y: 360 };          // on the Claude screen: under « PRÊT », above the command bar

/* ---------- what he hears ----------
   A touch shows at once (« J'arrive… », « J'arrête… »), before the server answers; a double touch on the micro button is
   one touch, « Arrêter » always stops him (even right after the micro button); with no news from Pixel for 4 s (his
   server restarting, the Wi-Fi), the screen does not pretend he listens. */
let pend = null, tapAt = -1e9;                   // pend: a touch the server has not answered yet, {what: 'start' | 'stop', at}
const clock = () => performance.now();
function ask(K, what) {
  if (pend && pend.what === what && clock() - pend.at < 700) return;   // asked already: once is enough
  pend = { what, at: clock() };
  K.send(what === 'start' ? 'voix.start' : 'voix.stop');
}
function micTap(K) {                             // the micro button: on, or off, as the screen shows it at this moment
  if (clock() - tapAt < 450) return;             // a double touch (or the screen bouncing) is one touch
  tapAt = clock();
  const v = K.P && K.P.voix;
  if (!v || !v.ok) { K.send('voix.start'); return; }                    // not ok: he says why
  ask(K, (pend ? pend.what === 'start' : !!v.on) ? 'stop' : 'start');
}
function settle(v, stale) {                      // the server answered, or 3 s went by: the screen follows it again
  if (pend && (stale || clock() - pend.at > 3000 || (pend.what === 'start') === !!v.on)) pend = null;
}
function tail(K, s, maxW, size) {               // the end of a long sentence: the words he just heard stay in sight
  const w = String(s).split(' ');
  for (let i = 0; i < w.length; i++) { const t = (i ? '… ' : '') + w.slice(i).join(' '); if (K.fit(t, maxW, size) === t) return t; }
  return K.fit(String(s), maxW, size);
}
const up = (K, s) => (K.T.upper ? s.toUpperCase() : s);
function listening(K, v, phase) {
  const c = K.c, X = K.X, red = c.PK || c.AM, lvl = phase === 'on' ? v.level || 0 : 0;
  const beat = RM ? 1 : 0.55 + 0.45 * Math.max(Math.min(1, lvl * 1.5), Math.abs(Math.sin(K.now / 300)) * 0.4);
  const B = L.scr === 'visage' ? { x: 64, y: 360, w: 664 } : L.scr === 'claude' ? { x: 18, y: 352, w: 580 } : null;
  if (!B) {                                      // another screen: a red « MICRO », a touch stops him
    X.save(); X.globalAlpha = 0.9; K.box(320, 438, 160, 34, red, c.B);
    X.fillStyle = red; X.globalAlpha = beat; X.beginPath(); X.arc(340, 455, 7, 0, 7); X.fill(); X.globalAlpha = 1;
    K.txt(up(K, 'Micro'), 408, 444, 22, red, 'center'); X.restore();
    K.hit(320, 438, 160, 34, () => ask(K, 'stop'));
    return;
  }
  const right = B.x + B.w;                       // his face screen, or under the conversation on the Claude screen
  X.save(); X.globalAlpha = 0.94; K.box(B.x, B.y, B.w, 72, red, c.B); X.globalAlpha = 1;
  X.fillStyle = red; X.globalAlpha = beat; X.beginPath(); X.arc(B.x + 28, B.y + 36, 10, 0, 7); X.fill(); X.globalAlpha = 1;
  K.txt(up(K, { starting: "J'arrive…", on: "Je t'écoute…", stopping: "J'arrête…" }[phase]), B.x + 52, B.y + 6, 20, c.D);
  K.txt(v.partial ? tail(K, v.partial, B.w - 310, 28) : up(K, phase === 'on' ? 'Parle-moi' : '…'), B.x + 52, B.y + 32, 28, v.partial ? c.WH : c.D);
  for (let i = 0; i < 10; i++) {                 // the microphone's level: it moves with your voice (it hears you)
    const h = 6 + i * 3, on = i < Math.round(lvl * 10);
    X.fillStyle = on ? (i > 7 ? red : c.G) : c.DK; X.fillRect(right - 248 + i * 11, B.y + 58 - h, 8, h);
  }
  K.box(right - 128, B.y + 10, 116, 52, red, null); K.txt(K.fit(up(K, 'Arrêter'), 104, 24), right - 70, B.y + 24, 24, red, 'center');
  X.restore();
  K.hit(B.x, B.y, B.w, 72, () => ask(K, 'stop'));                 // a touch anywhere on it: he stops, what he heard goes on
}
function heard(K, v) {                           // a moment after: what he heard (the Claude screen comes for a question)
  const last = v.last, age = last ? K.srv() - last.t : 1e9;
  if (!last || !last.text || age > 2500 || L.scr !== 'visage') return;
  const c = K.c, X = K.X;
  X.save(); X.globalAlpha = Math.min(1, (2500 - age) / 400) * 0.92; K.box(64, 360, 664, 72, c.D, c.B);
  K.txt(up(K, "J'ai entendu"), 84, 366, 20, c.D);
  K.txt(tail(K, '« ' + last.text + ' »', 620, 28), 84, 392, 28, c.G); X.restore();
}

function over(K) {                               // screens.js, after each drawn screen and Nourrir's plate
  const P = K.P, v = P && P.voix && typeof P.voix === 'object' ? P.voix : null;
  const stale = !P || K.srv() - (P.server_now || 0) > 4000;
  if (v) settle(v, stale);
  const phase = !v || stale ? '' : pend ? (pend.what === 'start' ? (v.on ? 'on' : 'starting') : 'stopping') : v.on ? 'on' : '';
  if (phase) listening(K, v, phase); else if (v && !stale) heard(K, v);
  const lit = phase === 'on' || phase === 'starting', mic = () => micTap(K);
  if (v && L.kiosk && L.scr === 'claude' && L.boot < 0 && !Sc.menuOpen && !Sc.casting) {   // the Claude screen: talk again, or stop
    buttonAt(K, CLAUDE_MIC.x, CLAUDE_MIC.y, 'micro', lit, mic, !v.ok || stale);
  }
  if (!shown(K)) return;
  button(K, 0, 'reglages', !!Sc.menuOpen, () => Sc.menu(true));
  button(K, 1, 'agenda', false, () => K.send('screen.show', { screen: 'agenda' }));
  if (v) button(K, 2, 'micro', lit, mic, !v.ok || stale);
}
return { over, ICONS, TOP, STEP, COL, get pending() { return pend && { ...pend }; } };   // pending: the tests'
})();
