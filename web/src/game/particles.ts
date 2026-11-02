import { drawText } from './font';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  gravity: number;
  text?: string;
}

const CONFETTI = ['#f6c84c', '#6cc46a', '#6cb6ff', '#ea7fb3', '#ef8f45', '#ffffff'];

export class Particles {
  private list: Particle[] = [];
  enabled = true;

  private add(p: Partial<Particle> & Pick<Particle, 'x' | 'y'>) {
    if (!this.enabled || this.list.length > 400) return;
    this.list.push({ vx: 0, vy: 0, life: 1, max: 1, color: '#ffffff', size: 1, gravity: 0, ...p });
  }

  confetti(x: number, y: number) {
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const s = 30 + Math.random() * 35;
      const life = 0.8 + Math.random() * 0.6;
      this.add({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life,
        max: life,
        gravity: 90,
        color: CONFETTI[i % CONFETTI.length]!,
        size: Math.random() < 0.3 ? 2 : 1,
      });
    }
  }

  smoke(x: number, y: number) {
    const life = 1 + Math.random() * 0.6;
    this.add({ x: x + (Math.random() - 0.5) * 6, y, vx: (Math.random() - 0.5) * 6, vy: -12, life, max: life, color: '#7a7488', size: 2 });
  }

  key(x: number, y: number) {
    this.add({ x: x + (Math.random() - 0.5) * 8, y, vx: (Math.random() - 0.5) * 10, vy: -18, life: 0.35, max: 0.35, color: '#ffffff' });
  }

  zzz(x: number, y: number) {
    this.add({ x, y, vx: 5, vy: -8, life: 2.2, max: 2.2, color: '#c9c4ff', text: 'Z' });
  }

  note(x: number, y: number) {
    this.add({ x, y, vx: (Math.random() - 0.5) * 8, vy: -10, life: 1.6, max: 1.6, color: '#ffd166', text: '*' });
  }

  heart(x: number, y: number) {
    this.add({ x, y, vx: 0, vy: -10, life: 1.4, max: 1.4, color: '#ff7a9a', text: '+' });
  }

  update(dt: number) {
    for (const p of this.list) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.list) {
      const a = Math.max(0, Math.min(1, p.life / p.max));
      ctx.globalAlpha = p.text ? a : Math.min(1, a * 1.5);
      if (p.text) drawText(ctx, p.text, p.x, p.y, p.color);
      else {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }
}
