/* Pixel Lab: a virtual clock for the animations. Load it BEFORE ../screens.js.
   It wraps requestAnimationFrame and performance.now, so the lab can play the face at 0.25x to 2x,
   pause it, or step one frame, without touching screens.js. Date.now stays real
   (the on-screen clock, the timer and the server-side mood times use it). */
(() => {
const perf = window.performance, realNow = perf.now.bind(perf), realRAF = window.requestAnimationFrame.bind(window);
let speed = 1, paused = false, base = realNow(), vbase = base, last = vbase;
const virt = r => { const v = paused ? vbase : vbase + (r - base) * speed; return (last = Math.max(last, v)); };   // monotonic
const now = () => virt(realNow());
const rebase = () => { const r = realNow(); vbase = virt(r); base = r; };
const ring = [];                                   // last Pixel frames: real start time and JS draw time (ms)
try { Object.defineProperty(perf, 'now', { value: now, configurable: true, writable: true }); } catch { perf.now = now; }
window.requestAnimationFrame = cb => realRAF(t => {
  const v = virt(t), t0 = realNow();
  try { cb(v); } finally { ring.push({ t, d: realNow() - t0 }); if (ring.length > 240) ring.splice(0, ring.length - 240); }
});
window.PixelClock = {
  now, real: realNow, raf: realRAF,
  get speed() { return speed; }, get paused() { return paused; },
  setSpeed(s) { s = Number(s); if (!(s > 0)) return; rebase(); speed = s; },
  pause() { if (!paused) { rebase(); paused = true; } },
  play() { if (paused) { rebase(); paused = false; } },
  toggle() { paused ? this.play() : this.pause(); return paused; },
  step(ms = 1000 / 60) { this.pause(); vbase += ms; },          // one frame forward, stays paused
  /* Frame rate of Pixel's own drawing loop over the last second of real time. */
  stats() {
    const end = realNow(), win = ring.filter(f => end - f.t <= 1000), n = win.length;
    const fps = n > 1 ? (n - 1) * 1000 / Math.max(1, win[n - 1].t - win[0].t) : 0;
    return { fps: n > 1 && end - win[n - 1].t < 500 ? fps : 0, drawMs: n ? win.reduce((a, f) => a + f.d, 0) / n : 0, frames: ring.slice(-120) };
  },
};
})();
