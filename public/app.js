// Affichage : dessine les personnages pixel art, les anime en direct selon
// qui parle dans le salon vocal Discord, et joue les interactions (taper...).
import { connect } from './connection.js';
import { CHAR_H, CHAR_W, drawCharacter, lookFor, newAnim, preloadSprites } from './character.js';
import { createEffects } from './effects.js';

// ---------- Options d'affichage (dans l'URL) ----------
// ?bg=transparent      fond transparent (OBS)      ?bg=%23000  couleur de fond
// ?names=0             masque les pseudos
// ?silent=dim|hide     estompe / masque ceux qui ne parlent pas
// ?only=id1,id2        n'affiche que ces utilisateurs
// ?key=...             clé si VIEW_KEY est défini sur le serveur
const params = new URLSearchParams(location.search);
const opt = {
  bg: params.get('bg') ?? '#1b1d2a',
  names: params.get('names') !== '0',
  silent: params.get('silent') ?? 'show',
  only: params.get('only')?.split(',').filter(Boolean) ?? null,
};
const transparent = opt.bg === 'transparent';
for (const el of [document.documentElement, document.body]) {
  el.style.background = transparent ? 'transparent' : opt.bg;
}

// ---------- État reçu du serveur ----------
const state = {
  connected: false,
  error: null,
  channel: null,
  members: [], // { id, name, avatar, speaking }
  characters: {},
};
const anim = new Map(); // données d'animation par personne
const animFor = (id) => anim.get(id) ?? anim.set(id, newAnim(id)).get(id);
const effects = createEffects();

connect({
  onStatus({ connected, error }) {
    state.connected = connected;
    state.error = error;
    updateStatus();
  },
  onMessage(msg) {
    if (msg.type === 'state') {
      state.channel = msg.channel;
      state.members = msg.members;
      state.characters = msg.characters ?? {};
      for (const m of state.members) {
        const a = animFor(m.id);
        if (m.speaking && !a.speakingSince) a.speakingSince = performance.now();
      }
      preloadSprites(state.characters);
    } else if (msg.type === 'speaking') {
      const m = state.members.find((x) => x.id === msg.id);
      if (m) {
        m.speaking = msg.speaking;
        const a = animFor(m.id);
        if (msg.speaking) a.speakingSince ||= performance.now();
        else a.speakingSince = 0;
      }
    } else if (msg.type === 'action') {
      effects.trigger(msg, performance.now());
    }
  },
});

const statusEl = document.getElementById('status');
function updateStatus() {
  const text = state.error ?? (state.connected ? '' : 'Connexion au serveur…');
  statusEl.hidden = !text;
  statusEl.textContent = text;
  statusEl.classList.toggle('error', Boolean(state.error));
}

// ---------- Plein écran, écran allumé, curseur ----------
const hint = document.getElementById('hint');
hint.textContent = `Touche l'écran pour le plein écran · Manette : ${location.host}/manette`;
setTimeout(() => hint.classList.add('gone'), 8000);
if (transparent) hint.remove();

let wakeLock = null;
async function keepAwake() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch { /* indisponible (http hors localhost, batterie faible...) */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeLock) keepAwake();
});

document.addEventListener('click', async () => {
  hint.classList.add('gone');
  keepAwake();
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen?.();
  } catch { /* iPhone : utiliser "Sur l'écran d'accueil" */ }
});

let cursorTimer;
document.addEventListener('mousemove', () => {
  document.body.classList.remove('hide-cursor');
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => document.body.classList.add('hide-cursor'), 2000);
});

// ---------- Rendu ----------
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
// Calque intermédiaire : un perso semi-transparent y est d'abord dessiné opaque,
// puis posé d'un bloc (sinon on verrait ses couches en transparence).
const layer = document.createElement('canvas');
const layerCtx = layer.getContext('2d');
let W = 0;
let H = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = Math.floor(window.innerWidth * dpr);
  H = Math.floor(window.innerHeight * dpr);
  canvas.width = layer.width = W;
  canvas.height = layer.height = H;
}
window.addEventListener('resize', resize);
resize();

// Taille d'une case (perso + pseudo) en "pixels logiques".
const CELL_W = 34;
const CELL_H = 44;

function layout(count) {
  let best = { cols: 1, rows: 1, s: 1 };
  for (let cols = 1; cols <= Math.max(1, count); cols++) {
    const rows = Math.ceil(count / cols);
    const s = Math.floor(Math.min(W / (cols * CELL_W), H / (rows * CELL_H)));
    if (s > best.s || (s === best.s && cols < best.cols && s > 1)) best = { cols, rows, s };
  }
  best.s = Math.max(1, Math.min(best.s, Math.floor(Math.min(W, H) / 40)));
  return best;
}

function drawLabel(text, cx, y, s, speaking) {
  const size = Math.max(8, Math.round(s * 2.6));
  ctx.font = `${size}px 'Press Start 2P', ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const max = CELL_W * s * 0.95;
  let label = text;
  while (label.length > 1 && ctx.measureText(label).width > max) label = label.slice(0, -1);
  if (label !== text) label = `${label.slice(0, -1)}…`;
  const w = ctx.measureText(label).width + size;
  ctx.fillStyle = speaking ? 'rgb(59 165 93 / 0.9)' : 'rgb(0 0 0 / 0.55)';
  ctx.fillRect(Math.round(cx - w / 2), y, Math.round(w), Math.round(size * 1.8));
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, cx, y + Math.round(size * 0.45));
}

function drawMessage(text) {
  const size = Math.max(10, Math.round(Math.min(W, H) / 40));
  ctx.font = `${size}px 'Press Start 2P', ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#8b8aa3';
  ctx.fillText(text, W / 2, H / 2);
}

// Dessine un perso, en passant par le calque s'il est semi-transparent.
function drawSlot(slot, o, s, now) {
  const snap = (v) => Math.round(v / s) * s; // reste aligné sur la grille de pixels
  const x = slot.x + snap(o?.dx ?? 0);
  const y = slot.y + snap(o?.dy ?? 0);
  const draw = (c) =>
    drawCharacter({ ctx: c, id: slot.m.id, look: slot.look, x, y, s, now, anim: slot.a, speaking: slot.m.speaking, pose: o?.pose });

  if (slot.opacity > 0.999) return draw(ctx);
  let x0 = x - 10 * s;
  let x1 = x + (CHAR_W + 10) * s;
  let y0 = y - 24 * s;
  const y1 = y + (CHAR_H + 3) * s;
  const aim = o?.pose?.prop?.aim;
  if (aim) {
    x0 = Math.min(x0, x + (aim[0] - 6) * s);
    x1 = Math.max(x1, x + (aim[0] + 6) * s);
    y0 = Math.min(y0, y + (aim[1] - 6) * s);
  }
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  const w = Math.min(W, x1) - x0;
  const h = Math.min(H, y1) - y0;
  if (w <= 0 || h <= 0) return;
  layerCtx.clearRect(x0, y0, w, h);
  layerCtx.imageSmoothingEnabled = false;
  draw(layerCtx);
  ctx.globalAlpha = slot.opacity;
  ctx.drawImage(layer, x0, y0, w, h, x0, y0, w, h);
  ctx.globalAlpha = 1;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;

  let members = state.members;
  if (opt.only) members = members.filter((m) => opt.only.includes(m.id));

  for (const m of members) {
    const a = animFor(m.id);
    // "Énergie" lissée : évite que le halo clignote entre deux mots.
    const target = m.speaking ? 1 : 0;
    a.energy += (target - a.energy) * Math.min(1, dt * (m.speaking ? 18 : 3));
    a.appear = Math.min(1, a.appear + dt * 3);
  }
  if (opt.silent === 'hide') members = members.filter((m) => animFor(m.id).energy > 0.05 || effects.involved(m.id));

  if (!members.length) {
    if (!transparent) {
      drawMessage(!state.connected ? '' : state.channel ? 'Personne dans le salon' : 'En attente du salon vocal…');
    }
    requestAnimationFrame(frame);
    return;
  }

  const { cols, rows, s } = layout(members.length);
  const x0 = Math.round((W - cols * CELL_W * s) / 2);
  const y0 = Math.round((H - rows * CELL_H * s) / 2);

  // Position "normale" de chaque perso dans la grille.
  const positions = new Map();
  const slots = members.map((m, i) => {
    const a = animFor(m.id);
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? members.length - row * cols : cols;
    const rowX = x0 + Math.round(((cols - inRow) * CELL_W * s) / 2); // centre la dernière ligne
    const cellX = rowX + (i - row * cols) * CELL_W * s;
    const cellY = y0 + row * CELL_H * s;
    const x = cellX + ((CELL_W - CHAR_W) / 2) * s;
    const y = cellY + 3 * s + Math.round((1 - easeOut(a.appear)) * 6) * s;
    positions.set(m.id, { x, y });
    const opacity = (opt.silent === 'dim' ? 0.4 + 0.6 * a.energy : 1) * a.appear;
    return { m, a, look: lookFor(m, state.characters), x, y, cellX, opacity };
  });

  // Interactions : décalages, poses, tremblement.
  const fx = effects.compute(now, positions, s);
  ctx.translate(fx.shake.x, fx.shake.y);

  // 1. Pseudos (ils restent à leur place pendant que les persos bougent)
  if (opt.names) {
    for (const slot of slots) {
      ctx.globalAlpha = slot.opacity;
      drawLabel(slot.look.name, slot.cellX + (CELL_W * s) / 2, slot.y + (CHAR_H + 2) * s, s, slot.m.speaking);
    }
    ctx.globalAlpha = 1;
  }

  // 2. Persos, ceux qui agissent par-dessus les autres
  const z = (slot) => fx.members.get(slot.m.id)?.z ?? 0;
  for (const slot of [...slots].sort((p, q) => z(p) - z(q))) {
    drawSlot(slot, fx.members.get(slot.m.id), s, now);
  }

  // 3. Projectiles, particules, bulles
  effects.drawOverlay(ctx, now, positions, fx.members, s);

  requestAnimationFrame(frame);
}

const easeOut = (t) => 1 - (1 - t) ** 3;

document.fonts?.load("12px 'Press Start 2P'").catch(() => {});
requestAnimationFrame(frame);
