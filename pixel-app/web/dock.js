/* The right edge of Pixel's face screen, on his own touch screen: his buttons, in the 64 px column outside his face box
   (PBOX), above Nourrir's plate (web/nourrir.js: the food, at y 352) and in its style:
     Réglages (the quick menu: brightness, sound, Wi-Fi, the phone, restart), Agenda (his calendar screen), the micro
     (pixel/voix.py: he listens, then what he heard goes as a command or to Claude).
   While he listens, on every screen: what he hears, live, in a box at the bottom of his face screen (a touch on it stops
   him), elsewhere a red « MICRO »; then, for a moment, what he heard.
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
function button(K, i, name, on, fn, off) {
  const c = K.c, X = K.X, y = TOP + i * STEP, x = COL + 8, s = 48;
  X.save(); X.globalAlpha = off ? 0.45 : 0.85;
  K.box(x, y + 8, s, s, on ? c.PK || c.AM : c.D, on ? c.PK || c.AM : c.B);
  if (on && !RM) { X.globalAlpha = 0.25 + 0.25 * Math.sin(K.now / 250); K.box(x - 3, y + 5, s + 6, s + 6, c.PK || c.AM, null); X.globalAlpha = 0.85; }
  icon(K, name, x + s / 2, y + 8 + s / 2, 4, on ? c.B : c.G);
  X.restore();
  K.hit(COL, y, 64, 64, () => { L.dirty = true; K.fast(300); fn(); });
}

/* ---------- what he hears ---------- */
function tail(K, s, maxW, size) {               // the end of a long sentence: the words he just heard stay in sight
  const w = String(s).split(' ');
  for (let i = 0; i < w.length; i++) { const t = (i ? '… ' : '') + w.slice(i).join(' '); if (K.fit(t, maxW, size) === t) return t; }
  return K.fit(String(s), maxW, size);
}
function listening(K, v) {
  const c = K.c, X = K.X, red = c.PK || c.AM, beat = 0.6 + 0.4 * Math.max(v.level || 0, Math.abs(Math.sin(K.now / 300)) * 0.5);
  if (L.scr !== 'visage') {                      // another screen: a red « MICRO », a touch stops him
    X.save(); X.globalAlpha = 0.9; K.box(320, 438, 160, 34, red, c.B);
    X.fillStyle = red; X.globalAlpha = beat; X.beginPath(); X.arc(340, 455, 7, 0, 7); X.fill(); X.globalAlpha = 1;
    K.txt(K.T.upper ? 'MICRO' : 'Micro', 408, 444, 22, red, 'center'); X.restore();
    K.hit(320, 438, 160, 34, () => K.send('voix.stop'));
    return;
  }
  X.save(); X.globalAlpha = 0.92; K.box(64, 360, 664, 72, red, c.B); X.globalAlpha = 1;
  X.fillStyle = red; X.globalAlpha = beat; X.beginPath(); X.arc(92, 396, 10, 0, 7); X.fill(); X.globalAlpha = 1;
  K.txt(K.T.upper ? "JE T'ÉCOUTE…" : "Je t'écoute…", 116, 366, 20, c.D);
  K.txt(v.partial ? tail(K, v.partial, 590, 28) : (K.T.upper ? 'PARLE-MOI' : 'Parle-moi'), 116, 392, 28, v.partial ? c.WH : c.D);
  X.restore();
  K.hit(64, 360, 664, 72, () => K.send('voix.stop'));             // a touch: he stops, what he heard goes on
}
function heard(K, v) {                           // a moment after: what he heard (the Claude screen comes for a question)
  const last = v.last, age = last ? K.srv() - last.t : 1e9;
  if (!last || !last.text || age > 2500 || L.scr !== 'visage') return;
  const c = K.c, X = K.X;
  X.save(); X.globalAlpha = Math.min(1, (2500 - age) / 400) * 0.92; K.box(64, 360, 664, 72, c.D, c.B);
  K.txt(K.T.upper ? "J'AI ENTENDU" : "J'ai entendu", 84, 366, 20, c.D);
  K.txt(tail(K, '« ' + last.text + ' »', 620, 28), 84, 392, 28, c.G); X.restore();
}

function over(K) {                               // screens.js, after each drawn screen and Nourrir's plate
  const P = K.P, v = P && P.voix && typeof P.voix === 'object' ? P.voix : null;
  if (v && v.on) listening(K, v); else if (v) heard(K, v);
  if (!shown(K)) return;
  button(K, 0, 'reglages', !!Sc.menuOpen, () => Sc.menu(true));
  button(K, 1, 'agenda', false, () => K.send('screen.show', { screen: 'agenda' }));
  if (v) button(K, 2, 'micro', !!v.on, () => K.send('voix.toggle'), !v.ok);
}
return { over, ICONS, TOP, STEP, COL };
})();
