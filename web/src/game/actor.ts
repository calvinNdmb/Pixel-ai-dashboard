import type { Activity, SessionInfo } from '../../../shared/types';
import { characterFrame, poseOffsetY, SPRITE_H, SPRITE_W, type Dir, type Pose } from './characters';
import { drawText, shortLabel, textWidth } from './font';
import { drawBubble, type BubbleStyle, type IconName } from './icons';
import { DOOR, TILE, type Spot, type ZoneId } from './map';
import { appearanceFor, C, type Appearance } from './palette';
import { findPath, type Point } from './path';
import type { Particles } from './particles';

const SPEED = 50; // px/s
const DWELL = 2200; // temps minimum passé sur une activité avant de changer de zone
const MIN_STAY = 1400; // temps minimum sur place après être arrivé
const THINK_DELAY = 4500; // entre deux outils, on « réfléchit » sur place
const CELEBRATE = 2600;
const SLEEP_AFTER = 22_000;

export type Target =
  | { kind: 'zone'; zone: ZoneId }
  | { kind: 'desk' }
  | { kind: 'spot'; id: string }
  | { kind: 'focus'; actorId: string }
  | { kind: 'idle'; n: number }
  | { kind: 'door' }
  | { kind: 'stay' };

export interface Director {
  now: number;
  particles: Particles;
  reserve(actor: Actor, target: Target): Spot | null;
  release(actor: Actor): void;
}

function targetKey(t: Target): string {
  switch (t.kind) {
    case 'zone':
      return `zone:${t.zone}`;
    case 'spot':
      return `spot:${t.id}`;
    case 'focus':
      return `focus:${t.actorId}`;
    case 'idle':
      return `idle:${t.n}`;
    default:
      return t.kind;
  }
}

const URGENT: ReadonlySet<Activity> = new Set(['waiting', 'error', 'done', 'leaving']);

/** Groupe de zones d'une activité : deux activités du même groupe ne font pas bouger le personnage. */
function zoneGroup(role: SessionInfo['role'], a: Activity): string {
  if (a === 'leaving') return 'door';
  if (a === 'waiting' || a === 'error' || a === 'done') return 'stay';
  if (role === 'manager') {
    if (a === 'reading') return 'chef-shelf';
    if (a === 'planning') return 'planning';
    if (a === 'delegating') return 'focus';
    if (a === 'browsing') return 'web';
    if (a === 'running') return 'server';
    return 'chef';
  }
  switch (a) {
    case 'idle':
      return 'idle';
    case 'reading':
      return 'library';
    case 'running':
      return 'server';
    case 'browsing':
      return 'web';
    case 'planning':
      return 'planning';
    case 'delegating':
      return 'meeting';
    default:
      return 'desk';
  }
}

export class Actor {
  readonly id: string;
  session: SessionInfo;
  readonly appearance: Appearance;
  x: number;
  y: number;
  tile: Point;
  dir: Dir = 'down';
  pose: Pose = 'stand';
  path: Point[] = [];
  moving = false;
  spot: Spot | null = null;
  atSpot = false;
  arrivedAt = 0;
  display: Activity;
  displaySince = 0;
  wanted: Activity;
  wantedSince = 0;
  celebrateUntil = 0;
  idleSince = 0;
  nextWander = 0;
  wanderCount = 0;
  alpha = 1;
  state: 'entering' | 'active' | 'leaving' | 'gone' = 'active';
  deskIndex: number | null = null;
  focusId?: string;
  bubbleOverride?: { icon: IconName; style: BubbleStyle; until: number };
  private currentKey = '';
  private animClock = Math.random() * 10;
  private fxClock = 0;
  private fadeOut = 0;

  constructor(session: SessionInfo, opts: { spawnAtDoor: boolean; now: number }) {
    this.id = session.id;
    this.session = session;
    this.appearance = appearanceFor(session.seed, session.role, session.agent);
    this.display = opts.spawnAtDoor ? 'idle' : session.activity;
    this.wanted = session.activity;
    this.displaySince = opts.now - DWELL;
    this.wantedSince = opts.now;
    this.idleSince = opts.now;
    this.tile = { ...DOOR };
    this.x = DOOR.x * TILE + 8;
    this.y = DOOR.y * TILE + 15;
    if (opts.spawnAtDoor) {
      this.state = 'entering';
      this.alpha = 0;
      this.y += 8;
      this.dir = 'up';
    }
  }

  get role() {
    return this.session.role;
  }

  /** Place directement le personnage sur une place (chargement initial). */
  placeAt(spot: Spot): void {
    this.spot = spot;
    this.tile = { x: spot.x, y: spot.y };
    this.x = spot.x * TILE + 8 + (spot.ox ?? 0);
    this.y = spot.y * TILE + 15 + (spot.oy ?? 0);
    this.path = [];
    this.atSpot = true;
    this.arrivedAt = 0;
    this.dir = spot.face;
  }

  /** Chargement initial : le personnage apparaît directement à sa place. */
  initialPlace(director: Director): void {
    const target = this.targetFor(director);
    if (target.kind === 'stay') return;
    this.currentKey = targetKey(target);
    const spot = director.reserve(this, target);
    if (spot) this.placeAt(spot);
  }

  /** Après une longue absence (onglet masqué) : on rejoint directement sa destination. */
  snapToGoal(now: number): void {
    if (this.spot && !this.atSpot) {
      this.placeAt(this.spot);
      this.arrivedAt = now;
    }
  }

  leave(): void {
    if (this.state === 'leaving' || this.state === 'gone') return;
    this.state = 'leaving';
  }

  comeBack(): void {
    if (this.state === 'leaving') {
      this.state = 'active';
      this.fadeOut = 0;
      this.alpha = 1;
    }
  }

  // ---------------------------------------------------------- comportement

  private targetFor(director: Director): Target {
    if (this.state === 'leaving') return { kind: 'door' };
    const a = this.display;
    const role = this.role;
    if (a === 'waiting' || a === 'error' || a === 'done') {
      return this.spot || this.path.length ? { kind: 'stay' } : role === 'manager' ? { kind: 'spot', id: 'chef-seat' } : { kind: 'desk' };
    }
    if (role === 'manager') {
      switch (a) {
        case 'reading':
          return { kind: 'spot', id: 'chef-shelf-1' };
        case 'planning':
          return { kind: 'zone', zone: 'planning' };
        case 'delegating':
          return this.focusId ? { kind: 'focus', actorId: this.focusId } : { kind: 'spot', id: 'meet-head-w' };
        case 'browsing':
          return { kind: 'zone', zone: 'web' };
        case 'running':
          return { kind: 'zone', zone: 'server' };
        default:
          return { kind: 'spot', id: 'chef-seat' };
      }
    }
    switch (a) {
      case 'idle':
        // De temps en temps, on change de coin (café, canapé, arcade, babyfoot…).
        if (this.atSpot && this.currentKey.startsWith('idle:') && director.now >= this.nextWander) this.wanderCount++;
        return { kind: 'idle', n: this.wanderCount };
      case 'reading':
        return { kind: 'zone', zone: 'library' };
      case 'running':
        return { kind: 'zone', zone: 'server' };
      case 'browsing':
        return { kind: 'zone', zone: 'web' };
      case 'planning':
        return { kind: 'zone', zone: 'planning' };
      case 'delegating':
        return { kind: 'zone', zone: 'meeting' };
      default:
        return { kind: 'desk' };
    }
  }

  private updateDisplay(now: number): void {
    const incoming: Activity = this.state === 'leaving' ? 'leaving' : this.session.activity;
    if (incoming !== this.wanted) {
      this.wanted = incoming;
      this.wantedSince = now;
      if (incoming === 'done') this.celebrateUntil = now + CELEBRATE;
    }
    let effective = this.wanted;
    if (effective === 'done' && now > this.celebrateUntil) effective = 'idle';
    if (effective === this.display) return;

    const role = this.role;
    const zEff = zoneGroup(role, effective);
    const zDisp = zoneGroup(role, this.display);
    let switchNow: boolean;
    if (zEff === zDisp || URGENT.has(effective) || this.display === 'idle' || this.display === 'done') {
      switchNow = true;
    } else {
      const minStay = role === 'manager' && this.display === 'delegating' ? 4500 : MIN_STAY;
      const settled = (this.atSpot && now - this.arrivedAt >= minStay) || (!this.moving && !this.atSpot);
      switchNow = settled && now - this.displaySince >= DWELL;
      if (switchNow && effective === 'thinking') switchNow = now - this.wantedSince >= THINK_DELAY;
    }
    if (!switchNow) return;
    if (effective === 'delegating' && role === 'manager') this.focusId = this.session.focusId;
    if (effective === 'idle' && this.display !== 'idle') this.idleSince = now;
    this.display = effective;
    this.displaySince = now;
  }

  private retarget(director: Director): void {
    const target = this.targetFor(director);
    if (target.kind === 'stay') return;
    const key = targetKey(target);
    if (key === this.currentKey && (this.spot || this.path.length)) return;
    this.currentKey = key;
    director.release(this);
    const spot = director.reserve(this, target);
    this.spot = spot;
    this.atSpot = false;
    if (!spot) {
      this.path = [];
      return;
    }
    const path = findPath(this.tile, { x: spot.x, y: spot.y });
    if (path === null) {
      // Aucun chemin (cas extrême) : on se téléporte discrètement.
      this.placeAt(spot);
      this.arrivedAt = director.now;
      return;
    }
    this.path = path;
  }

  update(dt: number, director: Director): void {
    const now = director.now;
    this.animClock += dt;
    this.fxClock += dt;

    if (this.state === 'entering') {
      this.alpha = Math.min(1, this.alpha + dt * 3);
      this.y -= dt * 24;
      const floorY = DOOR.y * TILE + 15;
      if (this.y <= floorY) {
        this.y = floorY;
        this.state = 'active';
      } else {
        this.pose = 'walk';
        return;
      }
    }

    if (this.state === 'gone') return;
    if (this.state === 'leaving' && this.fadeOut > 0) {
      this.fadeOut += dt;
      this.alpha = Math.max(0, 1 - this.fadeOut * 2.5);
      this.y += dt * 20;
      this.dir = 'down';
      this.pose = 'walk';
      if (this.alpha <= 0) this.state = 'gone';
      return;
    }

    this.updateDisplay(now);
    this.retarget(director);
    this.move(dt, now);
    this.updatePose(now);
    this.effects(director);
  }

  private move(dt: number, now: number): void {
    const spot = this.spot;
    const goal = spot && !this.atSpot ? spot : null;
    if (!goal) {
      this.moving = false;
      return;
    }
    let step = SPEED * dt;
    while (step > 0) {
      const wp = this.path[0] ?? { x: goal.x, y: goal.y };
      const last = this.path.length <= 1;
      const tx = wp.x * TILE + 8 + (last ? goal.ox ?? 0 : 0);
      const ty = wp.y * TILE + 15 + (last ? goal.oy ?? 0 : 0);
      const dx = tx - this.x;
      const dy = ty - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.01) this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      if (dist <= step) {
        this.x = tx;
        this.y = ty;
        this.tile = { x: wp.x, y: wp.y };
        step -= dist;
        if (this.path.length) this.path.shift();
        if (!this.path.length) {
          this.atSpot = true;
          this.moving = false;
          this.arrivedAt = now;
          this.dir = goal.face;
          if (this.state === 'leaving' && goal.zone === 'door') this.fadeOut = 0.001;
          if (goal.zone === 'lounge' || goal.zone === 'arcade') {
            const seated = goal.pose === 'sit';
            this.nextWander = now + (seated ? 35_000 + Math.random() * 35_000 : 8000 + Math.random() * 9000);
          }
          return;
        }
      } else {
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
        step = 0;
      }
    }
    this.moving = true;
  }

  private updatePose(now: number): void {
    if (this.moving) {
      this.pose = 'walk';
      return;
    }
    if (!this.atSpot || !this.spot) {
      this.pose = 'stand';
      return;
    }
    const sitting = this.spot.pose === 'sit';
    const sitPose: Pose = sitting ? 'sit' : 'stand';
    switch (this.display) {
      case 'writing':
        this.pose = sitting ? 'type' : 'stand';
        break;
      case 'waiting':
        this.pose = 'raise';
        break;
      case 'done':
        if (now < this.celebrateUntil && this.role !== 'manager') {
          this.pose = 'cheer';
          this.dir = 'down';
        } else this.pose = sitPose;
        break;
      case 'idle': {
        const tag = this.spot.tag;
        if (sitting && now - this.arrivedAt > SLEEP_AFTER && (tag === 'couch' || tag === 'beanbag')) this.pose = 'sleep';
        else if (tag === 'coffee') this.pose = Math.floor(this.animClock / 2.5) % 3 === 0 ? 'drink' : 'stand';
        else this.pose = sitPose;
        break;
      }
      default:
        this.pose = sitPose;
    }
    if (this.pose === 'sleep' || this.pose === 'cheer') this.dir = 'down';
    else this.dir = this.spot.face;
  }

  private effects(director: Director): void {
    const p = director.particles;
    if (this.fxClock < 0.18) return;
    this.fxClock = 0;
    const headY = this.y - 18;
    if (this.pose === 'type' && Math.random() < 0.7) p.key(this.x, this.y - 12);
    if (this.display === 'error' && Math.random() < 0.35) p.smoke(this.x, headY - 2);
    if (this.pose === 'sleep' && Math.random() < 0.12) p.zzz(this.x + 3, headY);
    if (this.atSpot && this.spot?.tag === 'arcade' && this.display === 'idle' && Math.random() < 0.08) p.note(this.x, headY);
    if (this.pose === 'cheer' && Math.random() < 0.5) p.confetti(this.x, headY);
  }

  // ------------------------------------------------------------------ rendu

  /** Profondeur d'affichage (y des pieds). */
  get sortY(): number {
    return this.y;
  }

  get offsetY(): number {
    if (this.pose === 'raise' && this.spot?.pose === 'sit' && this.atSpot) return 2;
    return poseOffsetY(this.pose);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.state === 'gone') return;
    const frame = Math.floor(this.animClock * (this.pose === 'type' ? 5 : 8));
    const sprite = characterFrame(this.appearance, { dir: this.dir, pose: this.pose, frame });
    const bob = this.pose === 'walk' && frame % 2 === 1 ? -1 : 0;
    const x = Math.round(this.x) - SPRITE_W / 2;
    const y = Math.round(this.y) - SPRITE_H + 1 + this.offsetY + bob;
    if (this.alpha < 1) ctx.globalAlpha = this.alpha;
    // ombre portée
    if (this.spot?.pose !== 'sit' || !this.atSpot) {
      ctx.fillStyle = C.shadow;
      ctx.fillRect(Math.round(this.x) - 5, Math.round(this.y), 10, 1);
      ctx.fillRect(Math.round(this.x) - 4, Math.round(this.y) + 1, 8, 1);
    }
    ctx.drawImage(sprite, x, y);
    ctx.globalAlpha = 1;
  }

  bubble(now: number): { icon: IconName; style: BubbleStyle } | null {
    if (this.state !== 'active') return null;
    if (this.bubbleOverride && now < this.bubbleOverride.until) return this.bubbleOverride;
    switch (this.display) {
      case 'thinking':
        return this.moving ? null : { icon: 'dots', style: 'normal' };
      case 'writing':
        return { icon: 'pencil', style: 'normal' };
      case 'reading':
        return { icon: 'book', style: 'normal' };
      case 'running':
        return { icon: 'terminal', style: 'normal' };
      case 'browsing':
        return { icon: 'globe', style: 'normal' };
      case 'planning':
        return { icon: 'list', style: 'normal' };
      case 'delegating':
        return { icon: 'talk', style: 'normal' };
      case 'waiting':
        return { icon: 'alert', style: 'alert' };
      case 'error':
        return { icon: 'cross', style: 'error' };
      case 'done':
        return { icon: 'check', style: 'success' };
      case 'idle':
        if (this.pose === 'sleep') return { icon: 'zzz', style: 'normal' };
        if (this.pose === 'drink') return { icon: 'coffee', style: 'normal' };
        return null;
      default:
        return null;
    }
  }

  drawOverlay(ctx: CanvasRenderingContext2D, now: number, t: number, opts: { names: boolean; selected: boolean; hovered: boolean }): void {
    if (this.state === 'gone' || this.alpha < 0.3) return;
    const x = Math.round(this.x);
    const top = Math.round(this.y) - SPRITE_H + 1 + this.offsetY + (this.appearance.hair === 'chef' ? 0 : 2);
    const b = this.bubble(now);
    if (b) {
      const bounce = b.style === 'alert' ? (Math.floor(t * 4) % 2 ? -1 : 0) : 0;
      drawBubble(ctx, x, top - 1 + bounce, b.icon, b.style, t);
    }
    if (opts.selected || opts.hovered) {
      // coins de sélection autour du personnage
      ctx.fillStyle = opts.selected ? (Math.floor(t * 3) % 2 ? C.gold : '#fff6c8') : 'rgba(255,255,255,0.85)';
      const L = x - 10;
      const R = x + 9;
      const T = top - (b ? 14 : 2);
      const B = Math.round(this.y) + 2;
      ctx.fillRect(L, T, 3, 1);
      ctx.fillRect(L, T, 1, 3);
      ctx.fillRect(R - 2, T, 3, 1);
      ctx.fillRect(R, T, 1, 3);
      ctx.fillRect(L, B, 3, 1);
      ctx.fillRect(L, B - 2, 1, 3);
      ctx.fillRect(R - 2, B, 3, 1);
      ctx.fillRect(R, B - 2, 1, 3);
    }
    // Assis à son bureau, le Chef a déjà sa plaque « CHEF » : pas d'étiquette en double.
    const chefAtDesk = this.role === 'manager' && this.atSpot && this.spot?.id === 'chef-seat';
    if ((opts.names && !chefAtDesk) || opts.selected || opts.hovered) {
      const isChef = this.role === 'manager';
      const external = this.session.source === 'hook' || this.session.source === 'watch';
      const label = isChef ? 'CHEF' : `${external ? '>' : ''}${shortLabel(this.session.name, 9)}`;
      const w = textWidth(label) + 4;
      const lx = x - Math.floor(w / 2);
      const ly = Math.round(this.y) + 3;
      ctx.fillStyle = 'rgba(28, 20, 38, 0.78)';
      ctx.fillRect(lx, ly, w, 7);
      ctx.fillStyle = isChef ? C.gold : this.session.agent === 'codex' ? C.teal : external ? '#9aa0b4' : this.appearance.palette.shirt;
      ctx.fillRect(lx, ly + 6, w, 1);
      drawText(ctx, label, lx + 2, ly + 1, isChef ? C.gold : '#fbf7ef');
    }
  }

  hit(px: number, py: number): boolean {
    if (this.state === 'gone') return false;
    const top = this.y - SPRITE_H + this.offsetY;
    return px >= this.x - 8 && px <= this.x + 8 && py >= top && py <= this.y + 10;
  }
}
