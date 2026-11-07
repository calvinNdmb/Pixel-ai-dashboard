// Affichage : dessine les personnages pixel art et les anime en direct
// selon qui parle dans le salon vocal Discord.

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
  key: params.get('key') ?? storageGet('viewKey') ?? '',
};
if (params.has('key')) storageSet('viewKey', opt.key);

function storageGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function storageSet(k, v) {
  try { localStorage.setItem(k, v); } catch { /* navigation privée */ }
}

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
// Données d'animation par personne (persistent entre deux mises à jour).
const anim = new Map();

function animFor(id) {
  let a = anim.get(id);
  if (!a) {
    a = { energy: 0, appear: 0, speakingSince: 0, nextBlink: performance.now() + rand(id, 1) * 4000 };
    anim.set(id, a);
  }
  return a;
}

// ---------- Connexion WebSocket (avec reconnexion auto) ----------
let retryDelay = 500;
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${location.host}/ws${opt.key ? `?key=${encodeURIComponent(opt.key)}` : ''}`;
  const ws = new WebSocket(url);

  ws.onopen = () => {
    state.connected = true;
    state.error = null;
    retryDelay = 500;
    updateStatus();
  };
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'state') {
      state.channel = msg.channel;
      state.members = msg.members;
      state.characters = msg.characters ?? {};
      for (const m of state.members) {
        const a = animFor(m.id);
        if (m.speaking && !a.speakingSince) a.speakingSince = performance.now();
      }
      preloadSprites();
    } else if (msg.type === 'speaking') {
      const m = state.members.find((x) => x.id === msg.id);
      if (m) {
        m.speaking = msg.speaking;
        const a = animFor(m.id);
        if (msg.speaking) a.speakingSince ||= performance.now();
        else a.speakingSince = 0;
      }
    }
    updateStatus();
  };
  ws.onclose = (event) => {
    state.connected = false;
    if (event.code === 4001) state.error = 'Clé invalide : ajoute ?key=... à l’adresse';
    updateStatus();
    setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 5000);
  };
}

const statusEl = document.getElementById('status');
function updateStatus() {
  let text = '';
  if (state.error) text = state.error;
  else if (!state.connected) text = 'Connexion au serveur…';
  statusEl.hidden = !text;
  statusEl.textContent = text;
  statusEl.classList.toggle('error', Boolean(state.error));
}

// ---------- Plein écran, écran allumé, curseur ----------
const hint = document.getElementById('hint');
setTimeout(() => hint.classList.add('gone'), 5000);
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

// ---------- Apparence des personnages ----------
const SKINS = ['#f5d0b5', '#e8b48f', '#c98d63', '#a26a42', '#7a4b2c', '#ffe0c9'];
const HAIRS = ['#2b1d16', '#5a3825', '#b0663a', '#e8c26a', '#d9d4cf', '#c9415a', '#4a6fd6', '#7b4ad6', '#3ca37a'];
const SHIRTS = ['#e04f5f', '#4f8be0', '#3ba55d', '#f0b232', '#9b59d0', '#e07a3b', '#2fb5b5', '#e05fa8', '#5b6170'];
const EYES = ['#1d1b26', '#2a4a8a', '#3d6b2f', '#5a3420'];
const HAIR_STYLES = ['short', 'spiky', 'long', 'cap', 'buns', 'mohawk'];

// Hash stable à partir de l'ID : chaque personne garde le même look partout.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rand(id, salt) {
  return (hash(`${id}:${salt}`) % 10000) / 10000;
}
const pick = (list, id, salt) => list[hash(`${id}:${salt}`) % list.length];

function lookFor(member) {
  const custom = state.characters[member.id] ?? {};
  return {
    skin: custom.skin ?? pick(SKINS, member.id, 'skin'),
    hair: custom.hair ?? pick(HAIRS, member.id, 'hair'),
    hairStyle: custom.hairStyle ?? pick(HAIR_STYLES, member.id, 'style'),
    shirt: custom.shirt ?? pick(SHIRTS, member.id, 'shirt'),
    eyes: custom.eyes ?? pick(EYES, member.id, 'eyes'),
    accessory: custom.accessory ?? (rand(member.id, 'acc') < 0.25 ? 'glasses' : null),
    sprite: custom.sprite ?? null,
    name: custom.name ?? member.name,
  };
}

// Sprites personnalisés (images) déclarés dans config/characters.json.
const images = new Map();
function image(src) {
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    images.set(src, img);
  }
  return img;
}
function preloadSprites() {
  for (const c of Object.values(state.characters)) {
    if (!c.sprite) continue;
    [c.sprite.idle, ...[].concat(c.sprite.talk ?? [])].filter(Boolean).forEach(image);
  }
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c * (1 + amount))));
  return `rgb(${f(n >> 16)} ${f((n >> 8) & 255)} ${f(n & 255)})`;
}

// ---------- Rendu ----------
const canvas = document.getElementById('scene');
const alpha = (v) => (ctx.globalAlpha = v);
const mainCtx = canvas.getContext('2d');
// Calque intermédiaire : un personnage semi-transparent y est d'abord dessiné
// opaque, puis posé d'un bloc (sinon on verrait ses couches en transparence).
const layer = document.createElement('canvas');
const layerCtx = layer.getContext('2d');
let ctx = mainCtx;
let W = 0;
let H = 0;
let dpr = 1;

function resize() {
  dpr = window.devicePixelRatio || 1;
  W = Math.floor(window.innerWidth * dpr);
  H = Math.floor(window.innerHeight * dpr);
  canvas.width = layer.width = W;
  canvas.height = layer.height = H;
}
window.addEventListener('resize', resize);
resize();

// Taille d'un personnage en "pixels logiques".
const CHAR_W = 24;
const CHAR_H = 30;
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

function mouthFrame(id, now, a) {
  // Cycle irrégulier ouvert / mi-ouvert / fermé, propre à chaque personne.
  const t = (now - a.speakingSince) / 1000;
  const v = Math.sin(t * 17 + rand(id, 'm') * 6) + Math.sin(t * 29 + rand(id, 'n') * 6) * 0.6;
  if (t < 0.05) return 1;
  return v > 0.5 ? 2 : v > -0.4 ? 1 : 0;
}

function drawCharacter(member, look, x, y, s, now) {
  const a = animFor(member.id);
  const px = (cx, cy, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + cx * s, y + cy * s, w * s, h * s);
  };
  const speaking = member.speaking;
  const phase = rand(member.id, 'phase') * Math.PI * 2;

  // Rebond : léger au repos, plus vif quand on parle.
  const bob = speaking
    ? Math.round(Math.abs(Math.sin(now / 110 + phase)) * -1.5)
    : Math.round(Math.sin(now / 700 + phase) * 0.6);
  const oy = bob;

  // Ombre au sol + halo vert façon Discord quand on parle.
  alpha(0.35);
  px(5, 29, 14, 1, '#000');
  px(4, 28, 16, 1, '#000');
  alpha(1);
  if (a.energy > 0.02) {
    alpha(a.energy);
    px(3, 29, 18, 1, '#3ba55d');
    px(5, 30, 14, 1, '#3ba55d');
    alpha(1);
  }

  if (look.sprite) {
    drawSprite(member, look, x, y + oy * s, s, now, a);
  } else {
    drawProcedural(member, look, px, oy, now, a);
  }

  // Ondes sonores à côté de la tête.
  if (speaking) {
    const w = Math.floor(now / 160) % 3;
    alpha(0.85);
    px(21, 7 + oy, 1, 3, '#ffffff');
    if (w > 0) px(23, 6 + oy, 1, 5, '#ffffff');
    px(2, 7 + oy, 1, 3, '#ffffff');
    if (w > 0) px(0, 6 + oy, 1, 5, '#ffffff');
    alpha(1);
  }
}

function drawSprite(member, look, x, y, s, now, a) {
  const talk = [].concat(look.sprite.talk ?? []);
  let src = look.sprite.idle;
  if (member.speaking && talk.length) {
    src = talk[Math.floor((now - a.speakingSince) / 120) % talk.length];
  }
  const img = image(src);
  if (!img.complete || !img.naturalWidth) return;
  const k = Math.min((CHAR_W * s) / img.naturalWidth, (CHAR_H * s) / img.naturalHeight);
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k;
  ctx.drawImage(img, x + (CHAR_W * s - w) / 2, y + (CHAR_H - 1) * s - h, w, h);
}

function drawProcedural(member, look, px, oy, now, a) {
  const { skin, hair, shirt, eyes } = look;
  const outline = '#16141f';
  const skinDark = shade(skin, -0.18);
  const hairDark = shade(hair, -0.3);
  const shirtDark = shade(shirt, -0.25);
  const speaking = member.speaking;

  // --- Corps ---
  const armLift = speaking ? Math.round(Math.abs(Math.sin(now / 180)) * 2) : 0;
  px(6, 16 + oy, 12, 12, outline);
  px(7, 18 + oy, 10, 9, shirt);
  px(7, 25 + oy, 10, 2, shirtDark);
  px(10, 18 + oy, 4, 1, shirtDark); // col
  // bras
  px(4, 18 + oy - armLift, 3, 7, outline);
  px(5, 19 + oy - armLift, 2, 5, shirt);
  px(5, 24 + oy - armLift, 2, 1, skin);
  px(17, 18 + oy, 3, 7, outline);
  px(17, 19 + oy, 2, 5, shirt);
  px(17, 24 + oy, 2, 1, skin);
  // jambes
  px(8, 27 + oy, 3, 2, outline);
  px(13, 27 + oy, 3, 2, outline);

  // --- Tête ---
  px(5, 3 + oy, 14, 14, outline);
  px(6, 4 + oy, 12, 12, skin);
  px(6, 15 + oy, 12, 1, skinDark);
  px(10, 16 + oy, 4, 1, skinDark); // cou
  px(4, 9 + oy, 1, 3, outline); // oreilles
  px(19, 9 + oy, 1, 3, outline);

  drawHair(look.hairStyle, px, oy, hair, hairDark, outline);

  // --- Yeux (clignement) ---
  if (now > a.nextBlink + 130) a.nextBlink = now + 2200 + Math.random() * 3500;
  const blinking = now > a.nextBlink;
  if (blinking) {
    px(8, 10 + oy, 2, 1, eyes);
    px(14, 10 + oy, 2, 1, eyes);
  } else {
    px(8, 9 + oy, 2, 2, eyes);
    px(14, 9 + oy, 2, 2, eyes);
    px(8, 9 + oy, 1, 1, '#ffffff');
    px(14, 9 + oy, 1, 1, '#ffffff');
  }
  if (look.accessory === 'glasses') {
    px(7, 8 + oy, 4, 1, outline);
    px(13, 8 + oy, 4, 1, outline);
    px(7, 11 + oy, 4, 1, outline);
    px(13, 11 + oy, 4, 1, outline);
    px(7, 8 + oy, 1, 4, outline);
    px(10, 8 + oy, 1, 4, outline);
    px(13, 8 + oy, 1, 4, outline);
    px(16, 8 + oy, 1, 4, outline);
    px(11, 9 + oy, 2, 1, outline);
  }

  // Joues roses quand on parle
  if (a.energy > 0.3) {
    px(7, 12 + oy, 2, 1, '#f08a9b');
    px(15, 12 + oy, 2, 1, '#f08a9b');
  }

  // --- Bouche ---
  const mouth = speaking ? mouthFrame(member.id, now, a) : 0;
  if (mouth === 0) {
    px(10, 13 + oy, 4, 1, outline);
  } else if (mouth === 1) {
    px(10, 12 + oy, 4, 2, outline);
    px(11, 13 + oy, 2, 1, '#c9415a');
  } else {
    px(10, 12 + oy, 4, 3, outline);
    px(11, 13 + oy, 2, 2, '#9e2b3f');
    px(11, 14 + oy, 2, 1, '#e86a7e');
  }
}

function drawHair(style, px, oy, hair, hairDark, outline) {
  switch (style) {
    case 'spiky':
      px(5, 2 + oy, 14, 4, hair);
      for (let i = 0; i < 5; i++) px(5 + i * 3, 0 + oy, 2, 2, hair);
      px(5, 6 + oy, 2, 3, hair);
      px(17, 6 + oy, 2, 3, hair);
      px(5, 5 + oy, 14, 1, hairDark);
      break;
    case 'long':
      px(5, 2 + oy, 14, 5, hair);
      px(4, 4 + oy, 3, 14, hair);
      px(17, 4 + oy, 3, 14, hair);
      px(4, 17 + oy, 3, 1, hairDark);
      px(17, 17 + oy, 3, 1, hairDark);
      px(7, 6 + oy, 3, 1, hairDark);
      break;
    case 'cap':
      px(5, 2 + oy, 14, 4, outline);
      px(6, 2 + oy, 12, 3, hair);
      px(6, 5 + oy, 16, 2, hairDark);
      px(11, 3 + oy, 2, 1, '#ffffff');
      break;
    case 'buns':
      px(5, 2 + oy, 14, 4, hair);
      px(3, 1 + oy, 4, 4, hair);
      px(17, 1 + oy, 4, 4, hair);
      px(3, 4 + oy, 4, 1, hairDark);
      px(17, 4 + oy, 4, 1, hairDark);
      px(5, 6 + oy, 2, 2, hair);
      px(17, 6 + oy, 2, 2, hair);
      break;
    case 'mohawk':
      px(10, -1 + oy, 4, 7, hair);
      px(10, 5 + oy, 4, 1, hairDark);
      px(5, 4 + oy, 2, 2, hairDark);
      px(17, 4 + oy, 2, 2, hairDark);
      break;
    case 'bald':
      break;
    default: // short
      px(5, 2 + oy, 14, 4, hair);
      px(5, 6 + oy, 3, 3, hair);
      px(16, 6 + oy, 3, 2, hair);
      px(8, 6 + oy, 5, 1, hair);
      px(5, 5 + oy, 14, 1, hairDark);
  }
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

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

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
  if (opt.silent === 'hide') members = members.filter((m) => animFor(m.id).energy > 0.05);

  if (!members.length) {
    if (!transparent) {
      drawMessage(!state.connected ? '' : state.channel ? 'Personne dans le salon' : 'En attente du salon vocal…');
    }
    requestAnimationFrame(frame);
    return;
  }

  const { cols, rows, s } = layout(members.length);
  const gridW = cols * CELL_W * s;
  const gridH = rows * CELL_H * s;
  const x0 = Math.round((W - gridW) / 2);
  const y0 = Math.round((H - gridH) / 2);

  members.forEach((m, i) => {
    const look = lookFor(m);
    const a = animFor(m.id);
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? members.length - row * cols : cols;
    const rowX = x0 + Math.round(((cols - inRow) * CELL_W * s) / 2); // centre la dernière ligne
    const cellX = rowX + (i - row * cols) * CELL_W * s;
    const cellY = y0 + row * CELL_H * s;
    const x = cellX + ((CELL_W - CHAR_W) / 2) * s;
    const y = cellY + 3 * s + Math.round((1 - easeOut(a.appear)) * 6) * s;

    const opacity = (opt.silent === 'dim' ? 0.4 + 0.6 * a.energy : 1) * a.appear;
    const draw = () => {
      drawCharacter(m, look, x, y, s, now);
      if (opt.names) drawLabel(look.name, cellX + (CELL_W * s) / 2, y + (CHAR_H + 2) * s, s, m.speaking);
    };
    if (opacity > 0.999) return draw();
    const cw = CELL_W * s;
    const ch = CELL_H * s + 8 * s;
    layerCtx.clearRect(cellX, cellY, cw, ch);
    layerCtx.imageSmoothingEnabled = false;
    ctx = layerCtx;
    draw();
    ctx = mainCtx;
    ctx.globalAlpha = opacity;
    ctx.drawImage(layer, cellX, cellY, cw, ch, cellX, cellY, cw, ch);
    ctx.globalAlpha = 1;
  });

  requestAnimationFrame(frame);
}

const easeOut = (t) => 1 - (1 - t) ** 3;

document.fonts?.load("12px 'Press Start 2P'").catch(() => {});
connect();
requestAnimationFrame(frame);
