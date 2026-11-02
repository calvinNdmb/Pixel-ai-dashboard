import type { SessionInfo } from '../../../shared/types';
import { Actor, type Director, type Target } from './actor';
import { drawWallDynamics, renderBackground } from './background';
import { Cat } from './cat';
import { DESKS, isTransit, SPOTS, TILE, WORLD_H, WORLD_W, type Spot } from './map';
import { Particles } from './particles';
import { buildProps, type DynEnv, type PropInstance } from './props';
import type { Point } from './path';

export interface WorldSnapshot {
  /** Le premier état a-t-il été reçu ? (les sessions déjà présentes sont placées directement) */
  ready: boolean;
  sessions: SessionInfo[];
  selectedId?: string | null;
  showNames: boolean;
  reducedMotion: boolean;
  /** Horodatage du dernier rapport du Chef (bulle « lettre »). */
  lastReportAt: number;
}

export interface WorldOptions {
  getSnapshot: () => WorldSnapshot;
  onSelect: (id: string | null) => void;
}

const SPOT_BY_ID = new Map(SPOTS.map((s) => [s.id, s] as const));
const IDLE_SPOTS = SPOTS.filter((s) => s.zone === 'lounge' || s.zone === 'arcade');
const OVERFLOW_SPOTS = SPOTS.filter((s) => (s.zone === 'meeting' || s.zone === 'library') && s.pose === 'sit');

/**
 * Le monde pixel art : synchronise un personnage par session, gère les places,
 * anime et dessine le QG dans un canvas en résolution native (512×320), mis à
 * l'échelle en CSS sans lissage.
 */
export class World implements Director {
  now = performance.now();
  readonly particles = new Particles();
  /** Tampon en résolution native (512×320) ; le canvas visible en est un agrandissement entier. */
  private buffer: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private screen: CanvasRenderingContext2D;
  private factor = 1;
  private background: HTMLCanvasElement;
  private props: PropInstance[];
  private actors = new Map<string, Actor>();
  private reservations = new Map<string, string>();
  private deskOwners = new Map<number, string>();
  private cat: Cat;
  private raf = 0;
  private last = 0;
  private t = 0;
  private hoveredId: string | null = null;
  private hoverCat = false;
  private placedInitial = false;
  private lastUpdates = new Map<string, number>();
  private activity: number[] = Array(14).fill(0);
  private bucketClock = 0;
  private night = false;
  private lastReportSeen = 0;
  private observer: ResizeObserver | null = null;
  private notes: string[] = [];
  private readonly env: DynEnv;

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: WorldOptions,
  ) {
    this.buffer = document.createElement('canvas');
    this.buffer.width = WORLD_W;
    this.buffer.height = WORLD_H;
    this.ctx = this.buffer.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    canvas.width = WORLD_W;
    canvas.height = WORLD_H;
    this.screen = canvas.getContext('2d')!;
    this.background = renderBackground();
    this.props = buildProps();
    this.cat = new Cat(
      () => this.visitTile(),
      () => this.randomTile(),
    );
    const world = this;
    this.env = {
      get t() {
        return world.t;
      },
      deskActivity: (i) => {
        const id = this.deskOwners.get(i);
        const a = id ? this.actors.get(id) : undefined;
        return a && a.atSpot && a.spot?.id === `desk-${i}` ? a.display : undefined;
      },
      zoneCount: (zone) => {
        let n = 0;
        for (const a of this.actors.values()) if (a.atSpot && a.spot?.zone === zone) n++;
        return n;
      },
      get notes() {
        return world.notes;
      },
      get babyfootActive() {
        return world.babyfootActive();
      },
      get night() {
        return world.night;
      },
    };
    this.bindInput();
  }

  // ------------------------------------------------------------ cycle de vie

  start(): void {
    this.observer = new ResizeObserver(() => this.resize());
    if (this.canvas.parentElement) this.observer.observe(this.canvas.parentElement);
    this.resize();
    this.last = performance.now();
    const loop = (ts: number) => {
      this.frame(ts);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.observer?.disconnect();
  }

  /**
   * Taille d'affichage : le QG remplit son cadre. Le canvas visible est un
   * agrandissement *entier* du tampon (pixels nets) ; si la taille finale n'est
   * pas un multiple exact, le navigateur réduit légèrement cette image nette
   * (lissage) au lieu de dupliquer des pixels de façon irrégulière.
   */
  resize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight || w * (WORLD_H / WORLD_W);
    const scale = Math.max(0.25, Math.min(w / WORLD_W, h / WORLD_H));
    const dpr = window.devicePixelRatio || 1;
    const factor = Math.max(1, Math.min(6, Math.ceil(scale * dpr - 0.01)));
    if (factor !== this.factor || this.canvas.width !== WORLD_W * factor) {
      this.factor = factor;
      this.canvas.width = WORLD_W * factor;
      this.canvas.height = WORLD_H * factor;
    }
    const cssW = Math.floor(WORLD_W * scale);
    const cssH = Math.floor(WORLD_H * scale);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.classList.toggle('smooth', Math.abs(cssW * dpr - this.canvas.width) > 1);
  }

  // ------------------------------------------------------------------ places

  reserve(actor: Actor, target: Target): Spot | null {
    const free = (s: Spot) => {
      const owner = this.reservations.get(s.id);
      return !owner || owner === actor.id;
    };
    const take = (s: Spot | undefined | null): Spot | null => {
      if (!s) return null;
      if (!s.id.startsWith('focus-') && s.zone !== 'door') this.reservations.set(s.id, actor.id);
      return s;
    };
    const nearest = (list: Spot[]) => {
      let best: Spot | undefined;
      let bestD = Infinity;
      for (const s of list) {
        const d = Math.abs(s.x - actor.tile.x) + Math.abs(s.y - actor.tile.y) + Math.random() * 2;
        if (d < bestD) {
          best = s;
          bestD = d;
        }
      }
      return best;
    };

    switch (target.kind) {
      case 'desk': {
        if (actor.deskIndex !== null) return take(SPOT_BY_ID.get(`desk-${actor.deskIndex}`));
        const options = OVERFLOW_SPOTS.filter(free);
        return take(nearest(options.length ? options : OVERFLOW_SPOTS));
      }
      case 'spot': {
        const s = SPOT_BY_ID.get(target.id);
        if (s && free(s)) return take(s);
        // place déjà prise (ex. étagère du Chef) : une voisine de la même zone
        const sameZone = SPOTS.filter((o) => o.zone === s?.zone && free(o));
        return take(nearest(sameZone) ?? s);
      }
      case 'zone': {
        const all = SPOTS.filter((s) => s.zone === target.zone);
        const options = all.filter(free);
        return take(nearest(options.length ? options : all));
      }
      case 'idle': {
        const previous = actor.spot?.id;
        const options = IDLE_SPOTS.filter((s) => free(s) && s.id !== previous);
        if (!options.length) return take(IDLE_SPOTS[Math.floor(Math.random() * IDLE_SPOTS.length)]);
        // On aime bien rejoindre quelqu'un au babyfoot.
        const leftTaken = this.reservations.has('babyfoot-l');
        const rightTaken = this.reservations.has('babyfoot-r');
        const weights = options.map((s) => {
          if (s.id === 'babyfoot-r' && leftTaken) return 6;
          if (s.id === 'babyfoot-l' && rightTaken) return 6;
          if (s.tag === 'coffee') return 2;
          if (s.tag === 'couch' || s.tag === 'beanbag') return 1.5;
          return 1;
        });
        let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
        for (let i = 0; i < options.length; i++) {
          roll -= weights[i]!;
          if (roll <= 0) return take(options[i]);
        }
        return take(options[options.length - 1]);
      }
      case 'focus': {
        const other = this.actors.get(target.actorId);
        if (!other || other.state !== 'active') return take(SPOT_BY_ID.get('meet-head-w'));
        if (other.atSpot && other.spot?.zone === 'desks' && other.deskIndex !== null) {
          return take(SPOT_BY_ID.get(`brief-${other.deskIndex}`));
        }
        const around: Array<[number, number, Spot['face']]> = [
          [0, 1, 'up'],
          [-1, 0, 'right'],
          [1, 0, 'left'],
          [0, -1, 'down'],
        ];
        for (const [dx, dy, face] of around) {
          const x = other.tile.x + dx;
          const y = other.tile.y + dy;
          if (isTransit(x, y)) return { id: `focus-${other.id}`, zone: 'brief', x, y, face, pose: 'stand' };
        }
        return take(SPOT_BY_ID.get('meet-head-w'));
      }
      case 'door':
        return SPOT_BY_ID.get(Math.random() < 0.5 ? 'door-1' : 'door-2') ?? null;
      default:
        return null;
    }
  }

  release(actor: Actor): void {
    for (const [spotId, owner] of this.reservations) if (owner === actor.id) this.reservations.delete(spotId);
  }

  private babyfootActive(): boolean {
    const l = this.reservations.get('babyfoot-l');
    const r = this.reservations.get('babyfoot-r');
    if (!l || !r) return false;
    return Boolean(this.actors.get(l)?.atSpot && this.actors.get(r)?.atSpot);
  }

  private assignDesk(actor: Actor): void {
    // Le Chef a son bureau ; les sous-agents (stagiaires) travaillent en salle de réunion.
    if (actor.role === 'manager' || actor.role === 'subagent') return;
    for (let i = 0; i < DESKS.length; i++) {
      if (!this.deskOwners.has(i)) {
        this.deskOwners.set(i, actor.id);
        actor.deskIndex = i;
        return;
      }
    }
  }

  private freeDesk(actor: Actor): void {
    if (actor.deskIndex !== null && this.deskOwners.get(actor.deskIndex) === actor.id) this.deskOwners.delete(actor.deskIndex);
  }

  private visitTile(): Point | null {
    const busy = [...this.actors.values()].filter((a) => a.state === 'active' && a.atSpot && a.role !== 'manager');
    if (!busy.length) return null;
    const a = busy[Math.floor(Math.random() * busy.length)]!;
    for (const [dx, dy] of [
      [1, 1],
      [-1, 1],
      [0, 1],
      [1, 0],
      [-1, 0],
    ] as const) {
      if (isTransit(a.tile.x + dx, a.tile.y + dy)) return { x: a.tile.x + dx, y: a.tile.y + dy };
    }
    return null;
  }

  private randomTile(): Point {
    for (let i = 0; i < 50; i++) {
      const x = 1 + Math.floor(Math.random() * 30);
      const y = 8 + Math.floor(Math.random() * 11);
      if (isTransit(x, y)) return { x, y };
    }
    return { x: 5, y: 16 };
  }

  // ------------------------------------------------------------------ boucle

  private sync(snap: WorldSnapshot): void {
    const seen = new Set<string>();
    const placeDirectly = snap.ready && !this.placedInitial;
    for (const s of snap.sessions) {
      seen.add(s.id);
      const prev = this.lastUpdates.get(s.id);
      if (prev !== s.updatedAt) {
        if (prev !== undefined) this.activity[this.activity.length - 1]!++;
        this.lastUpdates.set(s.id, s.updatedAt);
      }
      let actor = this.actors.get(s.id);
      const ended = s.status === 'ended';
      if (!actor) {
        if (ended || !snap.ready) continue;
        actor = new Actor(s, { spawnAtDoor: !placeDirectly, now: this.now });
        this.assignDesk(actor);
        this.actors.set(s.id, actor);
        if (placeDirectly) actor.initialPlace(this);
        continue;
      }
      actor.session = s;
      if (ended) actor.leave();
      else actor.comeBack();
    }
    if (snap.ready) this.placedInitial = true;
    for (const [id, actor] of this.actors) {
      if (!seen.has(id)) actor.leave();
      if (actor.state === 'gone') {
        this.release(actor);
        this.freeDesk(actor);
        this.actors.delete(id);
        this.lastUpdates.delete(id);
      }
    }
    this.notes = snap.sessions
      .filter((s) => s.role !== 'manager' && s.status !== 'ended')
      .map((s) => (s.activity === 'done' ? 'done' : s.status));
    if (snap.lastReportAt > this.lastReportSeen) {
      if (this.lastReportSeen > 0) {
        const chef = [...this.actors.values()].find((a) => a.role === 'manager');
        if (chef) chef.bubbleOverride = { icon: 'letter', style: 'success', until: this.now + 5000 };
      }
      this.lastReportSeen = snap.lastReportAt;
    }
  }

  private frame(ts: number): void {
    const rawDt = (ts - this.last) / 1000;
    this.last = ts;
    this.now = ts;
    const dt = Math.min(0.1, Math.max(0, rawDt));
    this.t += dt;
    const snap = this.opts.getSnapshot();
    this.particles.enabled = !snap.reducedMotion;
    this.sync(snap);
    if (rawDt > 2) for (const a of this.actors.values()) a.snapToGoal(ts);
    for (const a of this.actors.values()) a.update(dt, this);
    this.cat.update(dt);
    this.particles.update(dt);
    this.bucketClock += dt;
    if (this.bucketClock > 2) {
      this.bucketClock = 0;
      this.activity.push(0);
      if (this.activity.length > 14) this.activity.shift();
    }
    this.render(snap);
  }

  private render(snap: WorldSnapshot): void {
    const g = this.ctx;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.background, 0, 0);
    this.night = drawWallDynamics(g, this.t, new Date(), this.activity);

    const items: Array<{ y: number; draw: () => void }> = [];
    for (const p of this.props) {
      items.push({
        y: p.sortY,
        draw: () => {
          g.drawImage(p.sprite, p.px, p.py);
          p.dynamic?.(g, this.env);
        },
      });
    }
    const actors = [...this.actors.values()];
    for (const a of actors) items.push({ y: a.sortY, draw: () => a.draw(g) });
    items.push({ y: this.cat.sortY, draw: () => this.cat.draw(g) });
    items.sort((a, b) => a.y - b.y);
    for (const item of items) item.draw();

    this.particles.draw(g);
    if (this.night) {
      g.fillStyle = 'rgba(18, 16, 56, 0.2)';
      g.fillRect(0, 0, WORLD_W, WORLD_H);
    }
    actors.sort((a, b) => a.sortY - b.sortY);
    for (const a of actors) {
      a.drawOverlay(g, this.now, this.t, {
        names: snap.showNames,
        selected: a.id === snap.selectedId,
        hovered: a.id === this.hoveredId,
      });
    }
    // Agrandissement entier, sans lissage, vers le canvas visible.
    this.screen.imageSmoothingEnabled = false;
    this.screen.drawImage(this.buffer, 0, 0, this.canvas.width, this.canvas.height);
  }

  // ------------------------------------------------------------------ souris

  private toWorld(e: PointerEvent | MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * WORLD_W,
      y: ((e.clientY - rect.top) / rect.height) * WORLD_H,
    };
  }

  private pick(p: Point): string | null {
    const sorted = [...this.actors.values()].sort((a, b) => b.sortY - a.sortY);
    for (const a of sorted) if (a.hit(p.x, p.y)) return a.id;
    return null;
  }

  private bindInput(): void {
    this.canvas.addEventListener('pointermove', (e) => {
      const p = this.toWorld(e);
      this.hoveredId = this.pick(p);
      this.hoverCat = !this.hoveredId && this.cat.hit(p.x, p.y);
      this.canvas.style.cursor = this.hoveredId || this.hoverCat ? 'pointer' : 'default';
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.hoveredId = null;
      this.hoverCat = false;
    });
    this.canvas.addEventListener('click', (e) => {
      const p = this.toWorld(e);
      const id = this.pick(p);
      if (!id && this.cat.hit(p.x, p.y)) {
        this.cat.pet(this.particles);
        return;
      }
      this.opts.onSelect(id);
    });
  }

  /** Centre (en pixels du monde) d'une tuile — utile pour des tests. */
  static tileCenter(x: number, y: number): Point {
    return { x: x * TILE + 8, y: y * TILE + 8 };
  }
}
