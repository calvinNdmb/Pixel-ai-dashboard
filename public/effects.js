// Moteur des interactions : un perso fonce sur un autre, le tape, lui lance
// une tomate... Gère les déplacements, les poses, les particules et les bulles.
import { EMOTES } from './actions.js';
import { OUTLINE } from './character.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const seg = (t, a, b) => clamp01((t - a) / (b - a)); // avancement de t entre a et b
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeInOut = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);

const EMOJI_FONT = `'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`;
const PIXEL_FONT = `'Press Start 2P', ui-monospace, monospace`;

const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
const NOTE = ['..###', '..#.#', '..#..', '###..', '###..'];
const TOMATO = ['.###.', '#####', '#####', '#####', '.###.'];

// ---------- Les actions ----------
// frame(e) est appelée à chaque image tant que l'action dure. e.t = temps écoulé (ms).
const DEFS = {
  taper: {
    duration: 1000,
    stop: 17, // distance (pixels logiques) à laquelle on s'arrête devant la cible
    frame(e) {
      e.move(easeOut(seg(e.t, 0, 220)) * (1 - easeInOut(seg(e.t, 520, 1000))));
      const arm = e.dir > 0 ? 'armR' : 'armL';
      if (e.t >= 200 && e.t < 330) e.A.pose[arm] = 'up';
      else if (e.t >= 330 && e.t < 520) e.A.pose[arm] = 'slap';
      e.at(330, () =>
        e.hit({ power: 4, eyes: 'x', eyesMs: 550, mouth: 'o', mouthMs: 550, dizzyMs: 900, markMs: 2500, text: 'PAF!', shake: 1 }),
      );
    },
  },

  bonk: {
    duration: 1350,
    stop: 19,
    frame(e) {
      e.move(easeOut(seg(e.t, 0, 220)) * (1 - easeInOut(seg(e.t, 850, 1350))));
      const side = e.dir;
      const arm = side > 0 ? 'armR' : 'armL';
      const aim = e.aim(12, 2);
      if (e.t >= 150 && e.t < 520) {
        e.A.pose[arm] = 'up';
        e.A.pose.prop = { kind: 'hammer', side };
      } else if (e.t >= 520 && e.t < 780 && aim) {
        e.A.pose[arm] = 'reach';
        e.A.pose.prop = { kind: 'hammer', side, aim };
      } else if (e.t >= 520 && e.t < 850) {
        e.A.pose[arm] = 'up';
        e.A.pose.prop = { kind: 'hammer', side };
      }
      e.at(520, () =>
        e.hit({ power: 1, squash: true, eyes: 'x', eyesMs: 1100, mouth: 'o', mouthMs: 900, dizzyMs: 1800, text: 'BONK!', at: 'head', shake: 2 }),
      );
    },
  },

  tomate: {
    duration: 1000,
    frame(e) {
      const side = e.dir;
      const arm = side > 0 ? 'armR' : 'armL';
      if (e.t < 220) {
        e.A.pose[arm] = 'up';
        e.A.pose.prop = { kind: 'tomato', side };
      } else if (e.t < 380) {
        e.A.pose[arm] = 'out';
      }
      if (e.t >= 220 && e.t < 680 && e.B0) {
        const from = e.point('A', side > 0 ? 19 : 4, 7);
        const to = e.point('B', 12, 10);
        const k = seg(e.t, 220, 680);
        const h = Math.max(14 * e.s, Math.abs(to[0] - from[0]) * 0.3);
        const x = from[0] + (to[0] - from[0]) * k;
        const y = from[1] + (to[1] - from[1]) * k - 4 * h * k * (1 - k);
        const ps = Math.max(1, Math.round(e.s * 0.8));
        e.draw((ctx) => {
          drawPattern(ctx, TOMATO, x, y, ps, '#e5413a');
          ctx.fillStyle = '#f58a7e';
          ctx.fillRect(Math.round(x - ps), Math.round(y - ps), ps, ps);
          ctx.fillStyle = '#3ca37a';
          ctx.fillRect(Math.round(x - ps / 2), Math.round(y - 3.5 * ps), ps, ps);
        });
      }
      e.at(680, () =>
        e.hit({ power: 2, eyes: 'closed', eyesMs: 800, mouth: 'o', mouthMs: 800, splatMs: 3500, text: 'SPLAT!', burst: 'drops' }),
      );
    },
  },

  calin: {
    duration: 2100,
    stop: 12,
    frame(e) {
      e.move(easeOut(seg(e.t, 0, 300)) * (1 - easeInOut(seg(e.t, 1600, 2100))));
      if (e.t < 280 || e.t >= 1600) return;
      const side = e.dir;
      e.A.pose[side > 0 ? 'armR' : 'armL'] = 'hug';
      Object.assign(e.A.pose, { eyes: 'happy', mouth: 'smile' });
      if (e.B && e.B !== e.A) {
        e.B.pose[side > 0 ? 'armL' : 'armR'] = 'hug';
        Object.assign(e.B.pose, { eyes: 'happy', mouth: 'smile' });
        e.B.z = Math.max(e.B.z, 1);
      }
      e.every(220, () => {
        const a = e.point('A', 12, 2);
        const b = e.B0 ? e.point('B', 12, 2) : a;
        e.heart((a[0] + b[0]) / 2, Math.min(a[1], b[1]));
      });
    },
  },

  danse: {
    duration: 3200,
    frame(e) {
      const beat = Math.floor(e.t / 300);
      const ph = (e.t % 300) / 300;
      e.A.dx += (beat % 2 ? 1 : -1) * e.s;
      e.A.pose.lift = Math.round(Math.sin(ph * Math.PI) * 2);
      e.A.pose.armL = beat % 2 ? 'up' : 'out';
      e.A.pose.armR = beat % 2 ? 'out' : 'up';
      Object.assign(e.A.pose, { eyes: 'happy', mouth: 'smile' });
      e.every(450, () => {
        const [x, y] = e.point('A', Math.random() < 0.5 ? 2 : 22, 2);
        e.note(x, y);
      });
    },
  },

  saut: {
    duration: 760,
    frame(e) {
      if (e.t < 90 || e.t >= 650) {
        e.A.pose.squash = 1;
      } else {
        const k = seg(e.t, 90, 650);
        e.A.pose.lift = Math.round(18 * 4 * k * (1 - k));
        e.A.pose.armL = 'up';
        e.A.pose.armR = 'up';
      }
      e.at(650, () => {
        const [x, y] = e.point('A', 12, 29);
        e.dust(x, y);
      });
    },
  },

  coucou: {
    duration: 1700,
    frame(e) {
      e.A.pose.armR = 'up';
      e.A.pose.wiggleR = Math.floor(e.t / 140) % 2 ? 1 : -1;
      e.A.pose.mouth = 'smile';
      e.at(0, () => e.bubble({ text: 'Coucou!' }, 1700));
    },
  },
};

// ---------- Dessins utilitaires ----------
function drawPattern(ctx, pattern, cx, cy, s, color) {
  const w = pattern[0].length * s;
  const h = pattern.length * s;
  const x0 = Math.round(cx - w / 2);
  const y0 = Math.round(cy - h / 2);
  ctx.fillStyle = color;
  pattern.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '#') ctx.fillRect(x0 + c * s, y0 + r * s, s, s);
    }
  });
}

export function createEffects() {
  const running = []; // actions en cours
  const queues = new Map(); // id -> actions en attente (un perso fait une chose à la fois)
  const lingering = new Map(); // id -> effets qui durent (étoiles, tomate sur la figure, bulle...)
  const particles = [];
  let overlayDraws = [];
  let shake = { until: 0, dur: 1, amp: 0 };

  const linger = (id) => {
    let l = lingering.get(id);
    if (!l) lingering.set(id, (l = {}));
    return l;
  };

  function spawn(p) {
    particles.push(p);
    if (particles.length > 500) particles.shift();
  }

  function burst(x, y, s, now, { colors, count = 10, speed = 45, gravity = 90, life = 550 }) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const v = (0.5 + Math.random() * 0.8) * speed * s;
      spawn({ kind: 'square', x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 20 * s, g: gravity * s, born: now, life, color: colors[i % colors.length], size: s });
    }
  }

  function start(msg, now) {
    running.push({ ...msg, def: DEFS[msg.action], start: now, fired: new Set(), ticks: new Map() });
  }

  /** Reçoit une action du serveur. */
  function trigger(msg, now = performance.now()) {
    if (msg.action === 'emote') {
      const emote = EMOTES.find((x) => x.id === msg.emote);
      if (emote) linger(msg.from).bubble = { emoji: emote.emoji, start: now, until: now + 2600 };
      return;
    }
    if (!DEFS[msg.action]) return;
    if (running.some((r) => r.from === msg.from)) {
      const q = queues.get(msg.from) ?? [];
      if (q.length < 3) q.push(msg);
      queues.set(msg.from, q);
      return;
    }
    start(msg, now);
  }

  /** Ce perso est-il impliqué dans quelque chose (utile pour ?silent=hide) ? */
  function involved(id) {
    return lingering.has(id) || queues.get(id)?.length > 0 || running.some((r) => r.from === id || r.target === id);
  }

  /**
   * Calcule, pour l'image en cours, le décalage et la pose de chaque perso.
   * positions : Map id -> { x, y } (position normale à l'écran), s : taille d'un pixel logique.
   */
  function compute(now, positions, s) {
    overlayDraws = [];
    const members = new Map();
    const get = (id) => {
      let o = members.get(id);
      if (!o) members.set(id, (o = { dx: 0, dy: 0, z: 0, pose: {} }));
      return o;
    };

    // Actions terminées -> on passe à la suivante dans la file.
    for (let i = running.length - 1; i >= 0; i--) {
      const r = running[i];
      if (now - r.start < r.def.duration) continue;
      running.splice(i, 1);
      const next = queues.get(r.from)?.shift();
      if (next) start(next, now);
    }

    for (const r of running) {
      const A0 = positions.get(r.from);
      if (!A0) continue;
      const self = r.target === r.from;
      const B0 = r.target ? positions.get(r.target) ?? null : null;
      const A = get(r.from);
      const B = B0 ? (self ? A : get(r.target)) : null;
      const t = now - r.start;

      let dir = 1;
      let reachX = 0;
      let reachY = 0;
      if (B0 && !self) {
        const vx = B0.x - A0.x;
        const vy = B0.y - A0.y;
        const dist = Math.hypot(vx, vy);
        dir = vx < 0 ? -1 : 1;
        const stop = (r.def.stop ?? 18) * s;
        const k = dist > stop ? 1 - stop / dist : 0;
        reachX = vx * k;
        reachY = vy * k;
      }

      const small = Math.max(1, Math.round(s * 0.6)); // taille des petites particules (cœurs, notes)
      const point = (who, lx, ly) => {
        const [P, O] = who === 'A' ? [A0, A] : [B0, B];
        return [P.x + O.dx + lx * s, P.y + O.dy + ly * s];
      };

      const e = {
        t, s, dir, A, B, A0, B0,
        move(k) {
          A.dx += reachX * k;
          A.dy += reachY * k;
          if (k > 0) A.z = Math.max(A.z, 2);
          if (B && B !== A) B.z = Math.max(B.z, 1);
        },
        at(ms, fn) {
          if (t >= ms && !r.fired.has(ms)) {
            r.fired.add(ms);
            fn();
          }
        },
        every(ms, fn) {
          const n = Math.floor(t / ms);
          if (r.ticks.get(ms) !== n) {
            r.ticks.set(ms, n);
            fn();
          }
        },
        point,
        // Un point (lx, ly) de la cible, exprimé dans les coordonnées locales de l'acteur.
        aim(lx, ly) {
          if (!B0) return null;
          return [Math.round((B0.x - (A0.x + A.dx)) / s + lx), Math.round((B0.y - (A0.y + A.dy)) / s + ly)];
        },
        draw(fn) {
          overlayDraws.push(fn);
        },
        hit(o) {
          if (!r.target) return;
          const l = linger(r.target);
          l.hitAt = now;
          l.hitDir = dir;
          l.hitPower = o.power ?? 3;
          if (o.eyes) Object.assign(l, { eyes: o.eyes, eyesUntil: now + (o.eyesMs ?? 500) });
          if (o.mouth) Object.assign(l, { mouth: o.mouth, mouthUntil: now + (o.mouthMs ?? 600) });
          if (o.dizzyMs) l.dizzyUntil = now + o.dizzyMs;
          if (o.markMs) Object.assign(l, { markSide: -dir, markUntil: now + o.markMs });
          if (o.squash) l.squashAt = now;
          if (o.splatMs) l.splatUntil = now + o.splatMs;
          if (o.shake) shake = { until: now + 260, dur: 260, amp: o.shake };
          if (!B0) return;
          const face = [B0.x + (12 - dir * 5) * s, B0.y + 11 * s];
          const head = [B0.x + 12 * s, B0.y + 1 * s];
          const [bx, by] = o.at === 'head' ? head : face;
          if (o.burst === 'drops') burst(bx, by, s, now, { colors: ['#d8342c', '#f0604f', '#f5e08a'], count: 14, speed: 55, gravity: 160 });
          else burst(bx, by, s, now, { colors: ['#ffd23f', '#ffffff', '#ffb347'], count: 12 });
          if (o.text) {
            spawn({ kind: 'text', text: o.text, x: B0.x + (12 + dir * 4) * s, y: B0.y - (o.at === 'head' ? 10 : 3) * s, vx: 0, vy: -10 * s, g: 0, born: now, life: 900, size: s, rot: (Math.random() - 0.5) * 0.3 });
          }
        },
        heart(x, y) {
          spawn({ kind: 'pattern', pattern: HEART, color: '#ff5c8a', x, y, vx: (Math.random() - 0.5) * 10 * s, vy: -18 * s, g: 0, sway: 2 * s, born: now, life: 1300, size: small });
        },
        note(x, y) {
          spawn({ kind: 'pattern', pattern: NOTE, color: '#ffffff', x, y, vx: (Math.random() - 0.5) * 8 * s, vy: -16 * s, g: 0, sway: 3 * s, born: now, life: 1300, size: small });
        },
        dust(x, y) {
          for (let i = 0; i < 8; i++) {
            const side = i % 2 ? 1 : -1;
            spawn({ kind: 'square', x: x + side * 4 * s, y, vx: side * (10 + Math.random() * 25) * s, vy: -(4 + Math.random() * 12) * s, g: 50 * s, born: now, life: 450, color: i % 3 ? '#b9b4c7' : '#8b8aa3', size: s });
          }
        },
        bubble(content, ms) {
          linger(r.from).bubble = { ...content, start: now, until: now + ms };
        },
      };
      r.def.frame(e);
    }

    // Effets qui durent après l'action (recul, yeux en croix, étoiles, tomate...).
    for (const [id, l] of lingering) {
      const until = Math.max(
        (l.hitAt ?? -1e9) + 450, (l.squashAt ?? -1e9) + 380, l.eyesUntil ?? 0, l.mouthUntil ?? 0,
        l.dizzyUntil ?? 0, l.markUntil ?? 0, l.splatUntil ?? 0, l.bubble?.until ?? 0,
      );
      if (now > until) {
        lingering.delete(id);
        continue;
      }
      if (!positions.has(id)) continue;
      const o = get(id);
      const tau = now - (l.hitAt ?? -1e9);
      if (tau < 450) {
        const k = 1 - tau / 450;
        o.dx += (l.hitDir * l.hitPower * k * k + Math.sin(tau / 16) * k * 1.2) * s;
      }
      const sq = now - (l.squashAt ?? -1e9);
      if (sq < 380) o.pose.squash = Math.max(o.pose.squash ?? 0, Math.round(3 * (1 - sq / 380)));
      if (now < (l.eyesUntil ?? 0)) o.pose.eyes = l.eyes;
      if (now < (l.mouthUntil ?? 0)) o.pose.mouth = l.mouth;
      if (now < (l.dizzyUntil ?? 0)) o.pose.dizzy = true;
      if (now < (l.markUntil ?? 0)) o.pose.mark = { side: l.markSide, alpha: clamp01((l.markUntil - now) / 600) };
      if (now < (l.splatUntil ?? 0)) o.pose.splat = clamp01((l.splatUntil - now) / 800);
    }

    // Tremblement de l'écran sur les gros coups.
    let sx = 0;
    let sy = 0;
    if (now < shake.until) {
      const k = (shake.until - now) / shake.dur;
      sx = Math.round((Math.random() * 2 - 1) * shake.amp * k) * s;
      sy = Math.round((Math.random() * 2 - 1) * shake.amp * k) * s;
    }
    return { members, shake: { x: sx, y: sy } };
  }

  /** Dessine ce qui passe au-dessus des persos : projectiles, particules, bulles. */
  function drawOverlay(ctx, now, positions, members, s) {
    for (const fn of overlayDraws) fn(ctx);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const age = now - p.born;
      if (age >= p.life || age < 0) {
        if (age >= p.life) particles.splice(i, 1);
        continue;
      }
      const t = age / 1000;
      let x = p.x + p.vx * t;
      const y = p.y + p.vy * t + 0.5 * p.g * t * t;
      if (p.sway) x += Math.sin(age / 180 + p.born) * p.sway;
      ctx.globalAlpha = clamp01((p.life - age) / 300);
      if (p.kind === 'square') {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(x), Math.round(y), p.size, p.size);
      } else if (p.kind === 'pattern') {
        drawPattern(ctx, p.pattern, x, y, p.size, p.color);
      } else if (p.kind === 'text') {
        const size = Math.max(10, Math.round(p.size * 4.5));
        const pop = 1 + 0.5 * clamp01(1 - age / 140);
        ctx.save();
        ctx.translate(Math.round(x), Math.round(y));
        ctx.rotate(p.rot);
        ctx.scale(pop, pop);
        ctx.font = `${size}px ${PIXEL_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(3, size * 0.4);
        ctx.strokeStyle = OUTLINE;
        ctx.strokeText(p.text, 0, 0);
        ctx.fillStyle = '#ffd23f';
        ctx.fillText(p.text, 0, 0);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;

    // Bulles (réactions emoji, "Coucou !")
    for (const [id, l] of lingering) {
      const b = l.bubble;
      if (!b || now > b.until) continue;
      const P = positions.get(id);
      if (!P) continue;
      const o = members.get(id);
      const lift = o?.pose.lift ?? 0;
      const cx = Math.round(P.x + (o?.dx ?? 0) + 12 * s);
      const top = P.y + (o?.dy ?? 0) - lift * s - 2 * s;
      const rise = Math.round((1 - easeOut(clamp01((now - b.start) / 160))) * 4) * s;

      let w;
      let h;
      if (b.emoji) {
        ctx.font = `${Math.round(8 * s)}px ${EMOJI_FONT}`;
        w = Math.round(12 * s);
        h = Math.round(11 * s);
      } else {
        ctx.font = `${Math.max(8, Math.round(s * 2.6))}px ${PIXEL_FONT}`;
        w = Math.round(ctx.measureText(b.text).width + 5 * s);
        h = Math.round(7 * s);
      }
      const bx = cx - Math.round(w / 2);
      const by = Math.round(top - h - 3 * s + rise);

      ctx.globalAlpha = clamp01((b.until - now) / 300);
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(bx - s, by - s, w + 2 * s, h + 2 * s);
      ctx.fillRect(cx - 2 * s, by + h, 4 * s, 2 * s);
      ctx.fillRect(cx - s, by + h + 2 * s, 2 * s, s);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx, by, w, h);
      ctx.fillRect(cx - s, by + h, 2 * s, s);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = OUTLINE;
      ctx.fillText(b.emoji ?? b.text, cx, by + h / 2 + (b.emoji ? s * 0.6 : s * 0.4));
      ctx.globalAlpha = 1;
    }
  }

  return { trigger, compute, drawOverlay, involved };
}
