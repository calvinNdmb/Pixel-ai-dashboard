// Modèle de données d'un monde Archipel (même format que l'export du prototype),
// stockage dans un fichier JSON, moteur de liens automatiques et lecture du terrain.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const ENTRY_TYPES = ['personnage', 'lieu', 'faction', 'objet', 'evenement'] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export interface Entry {
  id: string;
  type: EntryType;
  name: string;
  aliases: string[];
  summary: string;
  body: string;
  year?: number;
  image?: string;
  x?: number; // position sur la Toile (graphe), gérée par le prototype
  y?: number;
  job?: string; // métier d'un habitant
  home?: { town: string; x?: number | null; y?: number | null }; // ville (et maison) où il habite
  kind?: string;
}
/** Ville peinte dans l'application : une suite de pastilles [x, y, rayon, signe]. */
export interface Town { id: string; entryId: string | null; seed?: number; discs: number[][] }
export interface Relation { id: string; from: string; to: string; label: string; ai?: boolean }
export interface Pin { id: string; entryId: string; x: number; y: number }
export interface Chapter { id: string; title: string; text: string }
export interface World {
  version: 2;
  world: { name: string; tagline: string };
  entries: Entry[];
  relations: Relation[];
  pins: Pin[];
  map: { image: string | null; seed: number; h?: number };
  chapters: Chapter[];
  terrain?: { h: string; b: string };
  towns?: Town[];
  features?: Record<string, unknown[]>;
}

export const MAP_W = 1000;
export const MAP_H = 700;
export const uid = (prefix: string) => prefix + randomUUID().replace(/-/g, '').slice(0, 8);

// ---------- stockage ----------
export class WorldStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(readonly file: string) {}

  async read(): Promise<World> {
    try {
      const w = JSON.parse(await readFile(this.file, 'utf8')) as World;
      if (w && w.version === 2 && Array.isArray(w.entries)) return normalize(w);
      throw new Error(`${this.file} n'est pas un monde Archipel (version 2 attendue).`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      const seed = JSON.parse(await readFile(new URL('../data/seed-world.json', import.meta.url), 'utf8')) as World;
      await this.write(seed);
      return normalize(seed);
    }
  }

  /** Lit le monde à jour, applique `fn`, puis l'écrit de façon atomique. Les écritures passent une par une. */
  update<T>(fn: (w: World) => T): Promise<T> {
    const run = this.queue.then(async () => {
      const w = await this.read();
      const out = fn(w);
      await this.write(w);
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async write(w: World) {
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(w));
    await rename(tmp, this.file);
  }
}

function normalize(w: World): World {
  w.relations ??= [];
  w.pins ??= [];
  w.chapters ??= [];
  for (const e of w.entries) { e.aliases ??= []; e.summary ??= ''; e.body ??= ''; }
  return w;
}

// ---------- recherche d'une fiche par id ou par nom ----------
export const norm = (s: string) => s.toLocaleLowerCase('fr').normalize('NFC').replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
/** Comparaison tolérante : sans accents, casse, tirets ni apostrophes (« port sel » = « Port-Sel »). */
export const fold = (s: string) => norm(s).normalize('NFD').replace(/\p{M}/gu, '').replace(/[-‐–—_'’.,]/g, ' ').replace(/\s+/g, ' ').trim();

export function resolveEntry(w: World, ref: string): Entry {
  const byId = w.entries.find((e) => e.id === ref);
  if (byId) return byId;
  const k = fold(ref);
  const exact = w.entries.filter((e) => [e.name, ...e.aliases].some((n) => fold(n) === k));
  if (exact.length === 1) return exact[0];
  const partial = w.entries.filter((e) => [e.name, ...e.aliases].some((n) => fold(n).includes(k)));
  if (exact.length === 0 && partial.length === 1) return partial[0];
  const options = (exact.length ? exact : partial).slice(0, 8).map((e) => `${e.name} (${e.id})`);
  throw new Error(options.length
    ? `« ${ref} » est ambigu. Précise l'id parmi : ${options.join(', ')}.`
    : `Aucune fiche ne correspond à « ${ref} ». Utilise search_entries pour trouver la bonne.`);
}

// ---------- liens automatiques (même règle que le prototype) ----------
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]").replace(/\s+/g, '\\s+');

export function matcher(w: World) {
  const lookup = new Map<string, string>();
  for (const e of w.entries) for (const n of [e.name, ...e.aliases]) {
    const k = norm(n || '');
    if (k.length >= 2 && !lookup.has(k)) lookup.set(k, e.id);
  }
  const names = [...lookup.keys()].sort((a, b) => b.length - a.length);
  const re = names.length ? new RegExp(`(?<![\\p{L}\\p{N}])(${names.map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'giu') : null;
  return { re, lookup };
}

/** Fiches citées dans un texte : id -> { count, as: formes rencontrées }. */
export function mentions(w: World, text: string, m = matcher(w)) {
  const out = new Map<string, { count: number; as: Set<string> }>();
  if (!m.re || !text) return out;
  for (const hit of text.matchAll(m.re)) {
    const id = m.lookup.get(norm(hit[0]));
    if (!id) continue;
    const cur = out.get(id) ?? { count: 0, as: new Set<string>() };
    cur.count++;
    cur.as.add(hit[0]);
    out.set(id, cur);
  }
  return out;
}

/** Une phrase du texte qui contient le nom, pour citer une preuve. */
export function snippet(text: string, needle: string, max = 220) {
  const sentences = text.split(/(?<=[.!?…])\s+|\n+/);
  const k = norm(needle);
  const s = sentences.find((x) => norm(x).includes(k)) ?? '';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// ---------- terrain (grille 160 × 112 du prototype) ----------
const GW = 160, GH = 112, SEA = 97;
export const BIOMES = ['mer', 'sable', 'prairie', 'forêt', 'pinède', 'marais', 'désert', 'toundra', 'roche'];

export function terrainAt(w: World, x: number, y: number) {
  if (!w.terrain) return null;
  const H = Buffer.from(w.terrain.h, 'base64'), B = Buffer.from(w.terrain.b, 'base64');
  if (H.length !== GW * GH || B.length !== GW * GH) return null;
  const fx = Math.max(0, Math.min(GW - 1, (x / MAP_W) * (GW - 1))), fy = Math.max(0, Math.min(GH - 1, (y / MAP_H) * (GH - 1)));
  const x0 = Math.min(GW - 2, Math.floor(fx)), y0 = Math.min(GH - 2, Math.floor(fy)), tx = fx - x0, ty = fy - y0, i = y0 * GW + x0;
  const h = (H[i] + (H[i + 1] - H[i]) * tx + (H[i + GW] - H[i]) * ty + (H[i] - H[i + 1] - H[i + GW] + H[i + GW + 1]) * tx * ty) / 255;
  const sea = SEA / 255;
  if (h < sea) return { milieu: 'mer', profondeur_m: Math.round(((sea - h) / sea) * 90) };
  const t = (h - sea) / (1 - sea);
  const biome = t > 0.8 ? 'neiges' : BIOMES[B[Math.round(fy) * GW + Math.round(fx)]] ?? 'inconnu';
  return { milieu: 'terre', biome, altitude_m: Math.round(t * 1800) };
}
