// Génère data/seed-world.json à partir du prototype (même monde, même terrain).
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../../prototype/', import.meta.url);
const ctx = { window: {}, document: { createElement: () => ({ getContext: () => null }) }, btoa, atob, Math, Uint8Array, String, Object, Array, JSON };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['data.js', 'terrain.js']) vm.runInContext(readFileSync(new URL(f, root), 'utf8'), ctx, { filename: f });
const state = ctx.makeSeed();
ctx.TERRAIN.init(state);
const out = new URL('../data/seed-world.json', import.meta.url);
writeFileSync(out, JSON.stringify(state, null, 1));
console.log('seed écrit :', state.entries.length, 'fiches,', state.pins.length, 'repères, terrain', state.terrain.h.length, 'octets b64');
