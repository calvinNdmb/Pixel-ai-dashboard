import { TILE } from './map';
import { C } from './palette';
import { findPath, type Point } from './path';
import type { Particles } from './particles';

/** Basket du chat (salon). */
export const CAT_BASKET: Point = { x: 5, y: 18 };

const FUR = '#e89a4a';
const FUR_DARK = '#c47a32';
const BELLY = '#fbe3c4';

type CatState = 'walk' | 'sit' | 'sleep';

/** La mascotte du QG : se promène, fait la sieste et rend visite aux agents. */
export class Cat {
  x = CAT_BASKET.x * TILE + 8;
  y = CAT_BASKET.y * TILE + 12;
  tile: Point = { ...CAT_BASKET };
  path: Point[] = [];
  state: CatState = 'sleep';
  face: 1 | -1 = 1;
  private timer = 6 + Math.random() * 10;
  private clock = 0;

  constructor(private pickVisit: () => Point | null, private randomTile: () => Point) {}

  private goTo(goal: Point, then: CatState): boolean {
    const path = findPath(this.tile, goal);
    if (!path || !path.length) return false;
    this.path = path;
    this.state = 'walk';
    this.after = then;
    return true;
  }
  private after: CatState = 'sit';

  pet(particles: Particles) {
    for (let i = 0; i < 3; i++) particles.heart(this.x - 2 + i * 2, this.y - 12 - i * 2);
    if (this.state === 'sleep') {
      this.state = 'sit';
      this.timer = 4;
    }
  }

  update(dt: number) {
    this.clock += dt;
    if (this.state === 'walk') {
      let step = 26 * dt;
      while (step > 0 && this.path.length) {
        const wp = this.path[0]!;
        const isBasket = wp.x === CAT_BASKET.x && wp.y === CAT_BASKET.y && this.path.length === 1;
        const tx = wp.x * TILE + 8;
        const ty = wp.y * TILE + (isBasket ? 12 : 14);
        const dx = tx - this.x;
        const dy = ty - this.y;
        const dist = Math.hypot(dx, dy);
        if (Math.abs(dx) > 0.5) this.face = dx > 0 ? 1 : -1;
        if (dist <= step) {
          this.x = tx;
          this.y = ty;
          this.tile = { ...wp };
          this.path.shift();
          step -= dist;
        } else {
          this.x += (dx / dist) * step;
          this.y += (dy / dist) * step;
          step = 0;
        }
      }
      if (!this.path.length) {
        this.state = this.after;
        this.timer = this.state === 'sleep' ? 40 + Math.random() * 40 : 6 + Math.random() * 10;
      }
      return;
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    const r = Math.random();
    let moved: boolean;
    if (r < 0.3) moved = this.goTo(CAT_BASKET, 'sleep');
    else if (r < 0.65) moved = this.goTo(this.pickVisit() ?? this.randomTile(), 'sit');
    else moved = this.goTo(this.randomTile(), 'sit');
    if (!moved) this.timer = 5;
  }

  get sortY() {
    return this.y + 0.2;
  }

  draw(g: CanvasRenderingContext2D) {
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    const r = (dx: number, dy: number, w: number, h: number, color: string) => {
      g.fillStyle = color;
      // miroir horizontal selon l'orientation
      const px = this.face === 1 ? x + dx : x - dx - w;
      g.fillRect(px, y + dy, w, h);
    };
    if (this.state === 'sleep') {
      r(-6, -5, 12, 6, C.outline);
      r(-5, -4, 10, 4, FUR);
      r(-5, -2, 10, 2, FUR_DARK);
      r(1, -6, 5, 3, C.outline);
      r(2, -5, 3, 2, FUR);
      r(3, -4, 1, 1, C.outline);
      r(-6, -1, 5, 1, FUR_DARK);
      return;
    }
    if (this.state === 'sit') {
      r(-3, -9, 7, 9, C.outline);
      r(-2, -8, 5, 7, FUR);
      r(-1, -5, 3, 4, BELLY);
      r(0, -12, 6, 5, C.outline);
      r(1, -11, 4, 3, FUR);
      r(0, -13, 1, 1, C.outline);
      r(5, -13, 1, 1, C.outline);
      r(3, -10, 1, 1, '#2f7a3a');
      r(5, -9, 1, 1, '#ff9aa8');
      const tail = Math.floor(this.clock * 2) % 2;
      r(-6, -2 - tail, 4, 1, C.outline);
      r(-6, -3 - tail, 1, 1, FUR_DARK);
      return;
    }
    // marche
    const step = Math.floor(this.clock * 8) % 2;
    r(-5, -7, 10, 5, C.outline);
    r(-4, -6, 8, 3, FUR);
    r(-4, -4, 8, 1, FUR_DARK);
    r(3, -10, 5, 5, C.outline);
    r(4, -9, 3, 3, FUR);
    r(3, -11, 1, 1, C.outline);
    r(7, -11, 1, 1, C.outline);
    r(6, -8, 1, 1, '#2f7a3a');
    r(-7, -9, 2, 1, C.outline);
    r(-6, -8, 1, 2, C.outline);
    r(step ? -4 : -3, -2, 1, 2, C.outline);
    r(step ? 2 : 3, -2, 1, 2, C.outline);
    r(step ? -2 : -1, -2, 1, 1, C.outline);
    r(step ? 4 : 1, -2, 1, 1, C.outline);
  }

  hit(px: number, py: number): boolean {
    return Math.abs(px - this.x) <= 7 && py <= this.y + 2 && py >= this.y - 13;
  }
}
