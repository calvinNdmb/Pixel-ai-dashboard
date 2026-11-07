// Dessin d'un personnage pixel art, avec ses poses (bras levés, yeux, marteau...).
// Partagé par l'affichage et la manette.

export const CHAR_W = 24;
export const CHAR_H = 30;
export const OUTLINE = '#16141f';

const SKINS = ['#f5d0b5', '#e8b48f', '#c98d63', '#a26a42', '#7a4b2c', '#ffe0c9'];
const HAIRS = ['#2b1d16', '#5a3825', '#b0663a', '#e8c26a', '#d9d4cf', '#c9415a', '#4a6fd6', '#7b4ad6', '#3ca37a'];
const SHIRTS = ['#e04f5f', '#4f8be0', '#3ba55d', '#f0b232', '#9b59d0', '#e07a3b', '#2fb5b5', '#e05fa8', '#5b6170'];
const EYES = ['#1d1b26', '#2a4a8a', '#3d6b2f', '#5a3420'];
const HAIR_STYLES = ['short', 'spiky', 'long', 'cap', 'buns', 'mohawk'];

// Hash stable à partir de l'ID : chaque personne garde le même look partout.
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function rand(id, salt) {
  return (hash(`${id}:${salt}`) % 10000) / 10000;
}
const pick = (list, id, salt) => list[hash(`${id}:${salt}`) % list.length];

export function lookFor(member, characters = {}) {
  const custom = characters[member.id] ?? {};
  return {
    skin: custom.skin ?? pick(SKINS, member.id, 'skin'),
    hair: custom.hair ?? pick(HAIRS, member.id, 'hair'),
    hairStyle: custom.hairStyle ?? pick(HAIR_STYLES, member.id, 'style'),
    shirt: custom.shirt ?? pick(SHIRTS, member.id, 'shirt'),
    eyes: custom.eyes ?? pick(EYES, member.id, 'eyes'),
    accessory: custom.accessory !== undefined ? custom.accessory : rand(member.id, 'acc') < 0.25 ? 'glasses' : null,
    sprite: custom.sprite ?? null,
    name: custom.name ?? member.name,
  };
}

/** État d'animation propre à chaque personne (clignement, halo...). */
export function newAnim(id, now = performance.now()) {
  return { energy: 0, appear: 0, speakingSince: 0, nextBlink: now + rand(id, 'blink') * 4000 };
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
export function preloadSprites(characters = {}) {
  for (const c of Object.values(characters)) {
    if (!c?.sprite) continue;
    [c.sprite.idle, ...[].concat(c.sprite.talk ?? [])].filter(Boolean).forEach(image);
  }
}

function shade(color, amount) {
  let hex = String(color).trim();
  if (/^#[0-9a-f]{3}$/i.test(hex)) hex = `#${[...hex.slice(1)].map((c) => c + c).join('')}`;
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return color;
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c * (1 + amount))));
  return `rgb(${f(n >> 16)} ${f((n >> 8) & 255)} ${f(n & 255)})`;
}

// Position de la main (bras côté droit de l'écran) pour chaque pose ; le gauche est le miroir.
const HANDS = { up: [22, 9], reach: [23, 6], out: [25, 19], slap: [25, 14], hug: [23, 17] };
const SHOULDER_R = [18, 19];
const mirror = ([x, y], side) => (side > 0 ? [x, y] : [23 - x, y]);

function handPos(pose, side) {
  const p = side > 0 ? pose.armR : pose.armL;
  if (!p) return mirror([18, 24], side); // bras au repos
  const [x, y] = mirror(HANDS[p] ?? HANDS.up, side);
  return [x + ((side > 0 ? pose.wiggleR : pose.wiggleL) ?? 0), y];
}

// Ligne épaisse sur la grille de pixels (Bresenham).
function thickLine(px, x0, y0, x1, y1, size, color) {
  [x0, y0, x1, y1] = [x0, y0, x1, y1].map(Math.round);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  const off = Math.floor(size / 2);
  let err = dx + dy;
  for (let i = 0; i < 200; i++) {
    px(x0 - off, y0 - off, size, size, color);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function mouthFrame(id, now, anim) {
  // Cycle irrégulier ouvert / mi-ouvert / fermé, propre à chaque personne.
  const t = (now - anim.speakingSince) / 1000;
  const v = Math.sin(t * 17 + rand(id, 'm') * 6) + Math.sin(t * 29 + rand(id, 'n') * 6) * 0.6;
  if (t < 0.05) return 'half';
  return v > 0.5 ? 'open' : v > -0.4 ? 'half' : 'closed';
}

/**
 * Dessine un personnage. (x, y) = coin haut-gauche de sa boîte 24×30, au sol.
 * pose (facultatif) : { armL, armR: 'up'|'reach'|'out'|'slap'|'hug', wiggleL, wiggleR,
 *   eyes: 'closed'|'happy'|'x', mouth: 'smile'|'o', lift, squash, dizzy,
 *   mark: { side, alpha }, splat (opacité), prop: { kind: 'hammer'|'tomato', side, aim } }
 */
export function drawCharacter({ ctx, id, look, x, y, s, now, anim, speaking = false, pose = {} }) {
  const px = (cx, cy, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + cx * s, y + cy * s, w * s, h * s);
  };
  px.ctx = ctx;
  const phase = rand(id, 'phase') * Math.PI * 2;
  const lift = pose.lift ?? 0;

  // Rebond : léger au repos, plus vif quand on parle.
  const bob = lift
    ? 0
    : speaking
      ? Math.round(Math.abs(Math.sin(now / 110 + phase)) * -1.5)
      : Math.round(Math.sin(now / 700 + phase) * 0.6);
  const oy = bob - lift;

  // Ombre au sol (elle reste au sol pendant un saut) + halo vert quand on parle.
  const shrink = Math.min(4, Math.floor(lift / 4));
  ctx.globalAlpha = 0.35;
  px(5 + shrink, 29, 14 - shrink * 2, 1, '#000');
  px(4 + shrink, 28, 16 - shrink * 2, 1, '#000');
  ctx.globalAlpha = 1;
  if (anim.energy > 0.02) {
    ctx.globalAlpha = anim.energy;
    px(3, 29, 18, 1, '#3ba55d');
    px(5, 30, 14, 1, '#3ba55d');
    ctx.globalAlpha = 1;
  }

  if (look.sprite) drawSprite(ctx, look, x, y + oy * s, s, now, anim, speaking);
  else drawProcedural(px, id, look, oy, pose, speaking, now, anim);

  if (pose.prop) drawProp(px, pose, oy);
  if (pose.dizzy) drawDizzy(px, oy + (pose.squash ?? 0), now);

  // Ondes sonores à côté de la tête.
  if (speaking) {
    const w = Math.floor(now / 160) % 3;
    ctx.globalAlpha = 0.85;
    px(21, 7 + oy, 1, 3, '#ffffff');
    px(2, 7 + oy, 1, 3, '#ffffff');
    if (w > 0) {
      px(23, 6 + oy, 1, 5, '#ffffff');
      px(0, 6 + oy, 1, 5, '#ffffff');
    }
    ctx.globalAlpha = 1;
  }
}

function drawSprite(ctx, look, x, y, s, now, anim, speaking) {
  const talk = [].concat(look.sprite.talk ?? []);
  let src = look.sprite.idle;
  if (speaking && talk.length) src = talk[Math.floor((now - anim.speakingSince) / 120) % talk.length];
  if (!src) return;
  const img = image(src);
  if (!img.complete || !img.naturalWidth) return;
  const k = Math.min((CHAR_W * s) / img.naturalWidth, (CHAR_H * s) / img.naturalHeight);
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k;
  ctx.drawImage(img, x + (CHAR_W * s - w) / 2, y + (CHAR_H - 1) * s - h, w, h);
}

function drawProcedural(px, id, look, oy, pose, speaking, now, anim) {
  const { skin, hair, shirt, eyes } = look;
  const skinDark = shade(skin, -0.18);
  const hairDark = shade(hair, -0.3);
  const shirtDark = shade(shirt, -0.25);
  const hy = oy + (pose.squash ?? 0); // la tête s'enfonce quand on se prend un coup de marteau

  // --- Corps ---
  px(6, 16 + oy, 12, 12, OUTLINE);
  px(7, 18 + oy, 10, 9, shirt);
  px(7, 25 + oy, 10, 2, shirtDark);
  px(10, 18 + oy, 4, 1, shirtDark); // col
  // Bras au repos (les bras en pose sont dessinés plus loin, devant la tête).
  const armLift = speaking ? Math.round(Math.abs(Math.sin(now / 180)) * 2) : 0;
  if (!pose.armL) {
    px(4, 18 + oy - armLift, 3, 7, OUTLINE);
    px(5, 19 + oy - armLift, 2, 5, shirt);
    px(5, 24 + oy - armLift, 2, 1, skin);
  }
  if (!pose.armR) {
    px(17, 18 + oy, 3, 7, OUTLINE);
    px(17, 19 + oy, 2, 5, shirt);
    px(17, 24 + oy, 2, 1, skin);
  }
  // jambes
  px(8, 27 + oy, 3, 2, OUTLINE);
  px(13, 27 + oy, 3, 2, OUTLINE);

  // --- Tête ---
  px(5, 3 + hy, 14, 14, OUTLINE);
  px(6, 4 + hy, 12, 12, skin);
  px(6, 15 + hy, 12, 1, skinDark);
  px(10, 16 + oy, 4, 1, skinDark); // cou
  px(4, 9 + hy, 1, 3, OUTLINE); // oreilles
  px(19, 9 + hy, 1, 3, OUTLINE);

  drawHair(look.hairStyle, px, hy, hair, hairDark);

  // --- Yeux ---
  if (now > anim.nextBlink + 130) anim.nextBlink = now + 2200 + Math.random() * 3500;
  const eyeMode = pose.eyes ?? (now > anim.nextBlink ? 'closed' : 'open');
  if (eyeMode === 'closed') {
    px(8, 10 + hy, 2, 1, eyes);
    px(14, 10 + hy, 2, 1, eyes);
  } else if (eyeMode === 'happy') {
    for (const ex of [8, 14]) {
      px(ex - 1, 10 + hy, 1, 1, OUTLINE);
      px(ex, 9 + hy, 2, 1, OUTLINE);
      px(ex + 2, 10 + hy, 1, 1, OUTLINE);
    }
  } else if (eyeMode === 'x') {
    for (const ex of [7, 13]) {
      px(ex, 8 + hy, 1, 1, OUTLINE);
      px(ex + 2, 8 + hy, 1, 1, OUTLINE);
      px(ex + 1, 9 + hy, 1, 1, OUTLINE);
      px(ex, 10 + hy, 1, 1, OUTLINE);
      px(ex + 2, 10 + hy, 1, 1, OUTLINE);
    }
  } else {
    px(8, 9 + hy, 2, 2, eyes);
    px(14, 9 + hy, 2, 2, eyes);
    px(8, 9 + hy, 1, 1, '#ffffff');
    px(14, 9 + hy, 1, 1, '#ffffff');
  }
  if (look.accessory === 'glasses') {
    px(7, 8 + hy, 4, 1, OUTLINE);
    px(13, 8 + hy, 4, 1, OUTLINE);
    px(7, 11 + hy, 4, 1, OUTLINE);
    px(13, 11 + hy, 4, 1, OUTLINE);
    px(7, 8 + hy, 1, 4, OUTLINE);
    px(10, 8 + hy, 1, 4, OUTLINE);
    px(13, 8 + hy, 1, 4, OUTLINE);
    px(16, 8 + hy, 1, 4, OUTLINE);
    px(11, 9 + hy, 2, 1, OUTLINE);
  }

  // Joues roses quand on parle ou qu'on est content
  if (anim.energy > 0.3 || pose.mouth === 'smile') {
    px(7, 12 + hy, 2, 1, '#f08a9b');
    px(15, 12 + hy, 2, 1, '#f08a9b');
  }

  // --- Bouche ---
  const mouth = pose.mouth === 'o' ? 'o' : speaking ? mouthFrame(id, now, anim) : pose.mouth ?? 'closed';
  if (mouth === 'closed') {
    px(10, 13 + hy, 4, 1, OUTLINE);
  } else if (mouth === 'half') {
    px(10, 12 + hy, 4, 2, OUTLINE);
    px(11, 13 + hy, 2, 1, '#c9415a');
  } else if (mouth === 'open') {
    px(10, 12 + hy, 4, 3, OUTLINE);
    px(11, 13 + hy, 2, 2, '#9e2b3f');
    px(11, 14 + hy, 2, 1, '#e86a7e');
  } else if (mouth === 'smile') {
    px(9, 12 + hy, 1, 1, OUTLINE);
    px(10, 13 + hy, 4, 1, OUTLINE);
    px(14, 12 + hy, 1, 1, OUTLINE);
  } else if (mouth === 'o') {
    px(11, 12 + hy, 2, 3, OUTLINE);
  }

  // Trace de claque sur la joue
  if (pose.mark) {
    const mx = pose.mark.side < 0 ? 6 : 16;
    withAlpha(px, pose.mark.alpha, () => {
      px(mx, 10 + hy, 2, 3, '#ff4d64');
      px(mx + (pose.mark.side < 0 ? 2 : -1), 11 + hy, 1, 1, '#ff4d64');
    });
  }
  // Tomate écrasée sur la figure
  if (pose.splat) {
    withAlpha(px, pose.splat, () => {
      const red = '#d8342c';
      px(7, 7 + hy, 4, 3, red);
      px(12, 9 + hy, 5, 3, red);
      px(9, 11 + hy, 3, 3, red);
      px(14, 6 + hy, 2, 2, red);
      px(6, 12 + hy, 2, 2, red);
      px(10, 14 + hy, 1, 2, red);
      px(8, 8 + hy, 1, 1, '#f0604f');
      px(13, 10 + hy, 1, 1, '#f0604f');
      px(10, 12 + hy, 1, 1, '#f5e08a');
      px(15, 10 + hy, 1, 1, '#f5e08a');
    });
  }

  // --- Bras en pose (devant la tête) ---
  for (const side of [-1, 1]) {
    if (!(side > 0 ? pose.armR : pose.armL)) continue;
    const [sx, sy] = mirror(SHOULDER_R, side);
    const [hx, hyy] = handPos(pose, side);
    thickLine(px, sx, sy + oy, hx, hyy + oy, 4, OUTLINE);
    thickLine(px, sx, sy + oy, hx, hyy + oy, 2, shirt);
    px(hx - 1, hyy + oy - 1, 2, 2, skin);
  }
}

// Applique une opacité temporaire à ce que dessine fn.
function withAlpha(px, alpha, fn) {
  const { ctx } = px;
  const before = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  fn();
  ctx.globalAlpha = before;
}

function drawProp(px, pose, oy) {
  const { kind, side = 1, aim } = pose.prop;
  const [hx, hy] = handPos(pose, side);
  const y = hy + oy;
  if (kind === 'tomato') {
    px(hx - 1, y - 4, 3, 3, '#e5413a');
    px(hx - 1, y - 4, 1, 1, '#f58a7e');
    px(hx, y - 5, 1, 1, '#3ca37a');
    return;
  }
  // Marteau : levé au-dessus de la main, ou abattu sur la tête visée (aim).
  const [ax, ay] = aim ? [aim[0], aim[1]] : [hx, y - 8];
  thickLine(px, hx, y, ax, ay + (aim ? 0 : 2), 2, '#8a5a2b');
  px(ax - 4, ay - 3, 8, 5, OUTLINE);
  px(ax - 3, ay - 2, 6, 3, '#d94a4a');
  px(ax - 3, ay - 2, 6, 1, '#f08080');
}

function drawDizzy(px, hy, now) {
  for (let i = 0; i < 3; i++) {
    const ang = now / 160 + (i * Math.PI * 2) / 3;
    const sx = Math.round(12 + Math.cos(ang) * 8);
    const sy = Math.round(1 + hy + Math.sin(ang) * 2);
    px(sx, sy - 1, 1, 3, '#ffd23f');
    px(sx - 1, sy, 3, 1, '#ffd23f');
    px(sx, sy, 1, 1, '#fff6c2');
  }
}

function drawHair(style, px, oy, hair, hairDark) {
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
      px(5, 2 + oy, 14, 4, OUTLINE);
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
