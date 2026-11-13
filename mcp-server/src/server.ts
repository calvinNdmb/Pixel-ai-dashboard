// Outils MCP d'Archipel : tout ce qu'une IA peut lire et modifier dans un monde.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  ENTRY_TYPES, MAP_H, MAP_W, World, Entry, Town, WorldStore,
  fold, mentions, matcher, norm, resolveEntry, snippet, terrainAt, uid,
} from './world.js';

const TYPE_LABEL: Record<string, string> = { personnage: 'personnage', lieu: 'lieu', faction: 'faction', objet: 'objet', evenement: 'événement' };
const ro = { readOnlyHint: true, openWorldHint: false } as const;
const zType = z.enum(ENTRY_TYPES);
const zRef = z.string().min(1).describe("Id de la fiche (ex. « ysolde ») ou son nom / un de ses autres noms (ex. « Ysolde Varn »).");
const zX = z.number().min(0).max(MAP_W).describe(`Abscisse sur la carte, de 0 (ouest) à ${MAP_W} (est).`);
const zY = z.number().min(0).max(MAP_H).describe(`Ordonnée sur la carte, de 0 (nord) à ${MAP_H} (sud).`);

type Out = { content: { type: 'text'; text: string }[]; isError?: boolean };
const text = (data: unknown): Out => ({ content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 1) }] });
async function run(fn: () => unknown | Promise<unknown>): Promise<Out> {
  try { return text(await fn()); }
  catch (e) { return { isError: true, content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }] }; }
}

const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);
const brief = (e: Entry) => ({ id: e.id, type: e.type, name: e.name, summary: e.summary, ...(Number.isFinite(e.year) ? { year: e.year } : {}) });
const named = (w: World, id: string) => { const e = w.entries.find((x) => x.id === id); return e ? { id, name: e.name, type: e.type } : { id, name: '?', type: '?' }; };
function compass(dx: number, dy: number) {
  const dirs = ['est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest', 'nord', 'nord-est'];
  return dirs[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];
}

function nearby(w: World, x: number, y: number, radius: number, exceptId?: string) {
  return w.pins.filter((p) => p.entryId !== exceptId)
    .map((p) => ({ p, d: Math.hypot(p.x - x, p.y - y) })).filter(({ d }) => d <= radius).sort((a, b) => a.d - b.d)
    .map(({ p, d }) => ({ ...named(w, p.entryId), distance: Math.round(d), direction: d < 1 ? 'ici' : compass(p.x - x, p.y - y) }));
}

const townEntry = (w: World, t: Town) => w.entries.find((e) => e.id === t.entryId) ?? null;
const townName = (w: World, townId: string) => { const t = (w.towns ?? []).find((x) => x.id === townId); return (t && townEntry(w, t)?.name) || 'ville inconnue'; };
function townCenter(t: Town) { // centre et rayon approchés de la zone peinte
  let sx = 0, sy = 0, sw = 0;
  for (const d of t.discs) if (d[3] !== -1) { const k = d[2] * d[2]; sx += d[0] * k; sy += d[1] * k; sw += k; }
  return sw ? { x: Math.round(sx / sw), y: Math.round(sy / sw), radius: Math.round(Math.sqrt(sw)) } : { x: 0, y: 0, radius: 0 };
}
function resolveTown(w: World, ref: string): Town {
  const towns = w.towns ?? [];
  const byId = towns.find((t) => t.id === ref);
  if (byId) return byId;
  const e = resolveEntry(w, ref), t = towns.find((x) => x.entryId === e.id);
  if (!t) throw new Error(`« ${e.name} » n'est pas une ville peinte. Villes : ${towns.map((x) => townEntry(w, x)?.name).filter(Boolean).join(', ') || 'aucune'}.`);
  return t;
}

function entryView(w: World, e: Entry) {
  const m = matcher(w);
  const pin = w.pins.find((p) => p.entryId === e.id);
  const out = [...mentions(w, e.body, m)].filter(([id]) => id !== e.id).map(([id, v]) => ({ ...named(w, id), count: v.count }));
  const fromEntries = w.entries.filter((x) => x.id !== e.id && mentions(w, x.body, m).has(e.id)).map((x) => named(w, x.id));
  const fromChapters = w.chapters.map((c) => ({ c, n: mentions(w, c.text, m).get(e.id)?.count ?? 0 })).filter(({ n }) => n).map(({ c, n }) => ({ id: c.id, title: c.title, count: n }));
  return {
    ...brief(e), aliases: e.aliases, body: e.body, has_image: Boolean(e.image),
    ...(e.job ? { job: e.job } : {}),
    ...(e.home ? { lives_in: townName(w, e.home.town) } : {}),
    map: pin ? { x: Math.round(pin.x), y: Math.round(pin.y), terrain: terrainAt(w, pin.x, pin.y), nearby: nearby(w, pin.x, pin.y, 120, e.id).slice(0, 6) } : null,
    relations: w.relations.filter((r) => r.from === e.id || r.to === e.id).map((r) => ({
      id: r.id, sentence: `${named(w, r.from).name} ${r.label} ${named(w, r.to).name}`, from: r.from, label: r.label, to: r.to,
    })),
    mentions: out,
    mentioned_in: { entries: fromEntries, chapters: fromChapters },
  };
}

export function buildServer(store: WorldStore) {
  const server = new McpServer({ name: 'archipel', version: '0.1.0' }, {
    instructions: [
      "Archipel est un atelier d'univers de fiction. Un monde contient des fiches (personnage, lieu, faction, objet, événement), des relations orientées entre fiches (« Maître Oren » mentor de « Ysolde Varn »), une carte (x de 0 à 1000 d'ouest en est, y de 0 à 700 du nord au sud) avec des repères et un terrain, des événements datés (année entière) et des chapitres de manuscrit.",
      "Les noms des fiches écrits dans un texte deviennent des liens automatiquement : écris les noms exacts (ou leurs autres noms) dans les textes pour relier les fiches.",
      "Commence par get_world_overview. Avant de créer une fiche, vérifie avec search_entries qu'elle n'existe pas déjà. Pour proposer des liens, appelle find_link_candidates puis add_relation pour ceux que l'auteur valide.",
      "Respecte le ton et la langue du monde existant. Ne supprime rien sans que l'auteur l'ait demandé.",
    ].join('\n'),
  });

  // ---------- vue d'ensemble et recherche ----------
  server.registerTool('get_world_overview', {
    title: "Vue d'ensemble du monde",
    description: 'Nom et accroche du monde, toutes les fiches (id, type, nom, résumé) groupées par type, les chapitres et la période couverte par la chronologie. À appeler en premier.',
    annotations: ro,
  }, () => run(async () => {
    const w = await store.read();
    const years = w.entries.filter((e) => Number.isFinite(e.year)).map((e) => e.year as number);
    return {
      world: w.world,
      counts: Object.fromEntries(ENTRY_TYPES.map((t) => [t, w.entries.filter((e) => e.type === t).length])),
      entries: Object.fromEntries(ENTRY_TYPES.map((t) => [t, w.entries.filter((e) => e.type === t).map(brief)])),
      relations: w.relations.length,
      map: { width: MAP_W, height: MAP_H, markers: w.pins.length, has_terrain: Boolean(w.terrain) },
      timeline: years.length ? { from: Math.min(...years), to: Math.max(...years), events: years.length } : null,
      chapters: w.chapters.map((c) => ({ id: c.id, title: c.title, words: words(c.text) })),
    };
  }));

  server.registerTool('search_entries', {
    title: 'Chercher des fiches',
    description: 'Cherche des fiches par nom, autre nom, résumé ou texte (sans tenir compte des accents ni de la casse). Renvoie les meilleures correspondances.',
    inputSchema: { query: z.string().min(1), type: zType.optional(), limit: z.number().int().min(1).max(50).optional() },
    annotations: ro,
  }, ({ query, type, limit }) => run(async () => {
    const w = await store.read();
    const f = fold, q = f(query);
    return w.entries.filter((e) => !type || e.type === type).map((e) => {
      const where: string[] = []; let score = 0;
      if (f(e.name).includes(q)) { score += f(e.name) === q ? 10 : 5; where.push('nom'); }
      if (e.aliases.some((a) => f(a).includes(q))) { score += 4; where.push('autres noms'); }
      if (f(e.summary).includes(q)) { score += 2; where.push('résumé'); }
      if (f(e.body).includes(q)) { score += 1; where.push('texte'); }
      return { e, score, where };
    }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, limit ?? 10)
      .map(({ e, where }) => ({ ...brief(e), found_in: where }));
  }));

  server.registerTool('get_entry', {
    title: 'Lire une fiche',
    description: "Fiche complète : texte, autres noms, année, position sur la carte (avec terrain et lieux proches), relations, fiches qu'elle cite et textes qui la citent.",
    inputSchema: { entry: zRef },
    annotations: ro,
  }, ({ entry }) => run(async () => { const w = await store.read(); return entryView(w, resolveEntry(w, entry)); }));

  // ---------- écrire des fiches ----------
  server.registerTool('create_entry', {
    title: 'Créer une fiche',
    description: "Crée une fiche. Écris dans « body » les noms d'autres fiches pour les relier automatiquement. Une ligne qui commence par « # » devient un intertitre.",
    inputSchema: {
      type: zType, name: z.string().min(1).max(120), summary: z.string().max(400).optional(),
      body: z.string().max(20000).optional(), aliases: z.array(z.string().min(1)).max(10).optional(),
      year: z.number().int().optional().describe('Année, surtout pour les événements.'),
    },
    annotations: { openWorldHint: false },
  }, (a) => run(() => store.update((w) => {
    const dup = w.entries.find((e) => norm(e.name) === norm(a.name));
    if (dup) throw new Error(`Une fiche « ${dup.name} » existe déjà (id ${dup.id}). Utilise update_entry pour la modifier.`);
    const e: Entry = { id: uid('e'), type: a.type, name: a.name.trim(), aliases: a.aliases ?? [], summary: a.summary?.trim() ?? '', body: a.body ?? '' };
    if (a.year != null) e.year = a.year;
    w.entries.push(e);
    return { created: entryView(w, e) };
  })));

  server.registerTool('update_entry', {
    title: 'Modifier une fiche',
    description: 'Modifie les champs donnés. « append_body » ajoute un paragraphe à la fin du texte sans réécrire le reste. « year: null » retire l’année.',
    inputSchema: {
      entry: zRef, name: z.string().min(1).max(120).optional(), type: zType.optional(), summary: z.string().max(400).optional(),
      body: z.string().max(20000).optional(), append_body: z.string().max(20000).optional(),
      aliases: z.array(z.string().min(1)).max(10).optional(), year: z.number().int().nullable().optional(),
    },
    annotations: { openWorldHint: false },
  }, (a) => run(() => store.update((w) => {
    const e = resolveEntry(w, a.entry);
    if (a.name) e.name = a.name.trim();
    if (a.type) e.type = a.type;
    if (a.summary != null) e.summary = a.summary.trim();
    if (a.body != null) e.body = a.body;
    if (a.append_body) e.body = (e.body.trim() ? e.body.trim() + '\n\n' : '') + a.append_body.trim();
    if (a.aliases) e.aliases = a.aliases;
    if (a.year === null) delete e.year; else if (a.year != null) e.year = a.year;
    return { updated: entryView(w, e) };
  })));

  server.registerTool('delete_entry', {
    title: 'Supprimer une fiche',
    description: 'Supprime définitivement une fiche, ses relations et son repère sur la carte. À utiliser seulement si l’auteur l’a demandé.',
    inputSchema: { entry: zRef },
    annotations: { destructiveHint: true, openWorldHint: false },
  }, ({ entry }) => run(() => store.update((w) => {
    const e = resolveEntry(w, entry);
    const rels = w.relations.filter((r) => r.from === e.id || r.to === e.id).length;
    w.entries = w.entries.filter((x) => x.id !== e.id);
    w.relations = w.relations.filter((r) => r.from !== e.id && r.to !== e.id);
    w.pins = w.pins.filter((p) => p.entryId !== e.id);
    return { deleted: brief(e), relations_removed: rels };
  })));

  server.registerTool('set_world_info', {
    title: 'Renommer le monde',
    description: "Change le nom du monde ou sa phrase d'accroche.",
    inputSchema: { name: z.string().min(1).max(80).optional(), tagline: z.string().max(400).optional() },
    annotations: { openWorldHint: false },
  }, (a) => run(() => store.update((w) => { if (a.name) w.world.name = a.name; if (a.tagline != null) w.world.tagline = a.tagline; return w.world; })));

  // ---------- villes et habitants ----------
  server.registerTool('list_towns', {
    title: 'Villes et habitants',
    description: "Les villes peintes sur la carte : nom, position, taille approchée, terrain, et leurs habitants connus (nom, métier). Les passants anonymes ne sont pas listés.",
    annotations: ro,
  }, () => run(async () => {
    const w = await store.read();
    return (w.towns ?? []).map((t) => {
      const e = townEntry(w, t), c = townCenter(t);
      return { town_id: t.id, ...(e ? { entry_id: e.id, name: e.name, summary: e.summary } : { name: 'Ville sans nom' }), x: c.x, y: c.y, radius: c.radius, terrain: terrainAt(w, c.x, c.y),
        inhabitants: w.entries.filter((p) => p.home?.town === t.id).map((p) => ({ id: p.id, name: p.name, job: p.job ?? '', summary: p.summary })) };
    });
  }));

  server.registerTool('add_inhabitant', {
    title: 'Ajouter un habitant',
    description: "Crée un personnage qui habite une ville peinte. Il reçoit une maison à la prochaine ouverture du monde dans l'application et marche dans les rues. Appelle list_towns d'abord pour connaître les villes et ceux qui y vivent déjà.",
    inputSchema: {
      town: z.string().min(1).describe('Nom ou id de la ville (voir list_towns).'),
      name: z.string().min(1).max(120), job: z.string().max(80).optional().describe('Métier, ex. « saunière ».'),
      summary: z.string().max(400).optional(), body: z.string().max(20000).optional(),
    },
    annotations: { openWorldHint: false },
  }, (a) => run(() => store.update((w) => {
    const t = resolveTown(w, a.town);
    const dup = w.entries.find((e) => norm(e.name) === norm(a.name));
    if (dup) throw new Error(`Une fiche « ${dup.name} » existe déjà (id ${dup.id}).`);
    const e: Entry = { id: uid('e'), type: 'personnage', name: a.name.trim(), aliases: [], summary: a.summary?.trim() ?? '', body: a.body ?? '', job: a.job?.trim() ?? '', home: { town: t.id } };
    w.entries.push(e);
    return { created: entryView(w, e) };
  })));

  registerLinkTools(server, store);
  registerMapTools(server, store);
  registerStoryTools(server, store);
  return server;
}

// ---------- relations ----------
function registerLinkTools(server: McpServer, store: WorldStore) {
  server.registerTool('add_relation', {
    title: 'Relier deux fiches',
    description: 'Ajoute une relation orientée qui se lit « from label to », ex. from « Maître Oren », label « mentor de », to « Ysolde Varn ». Le label est un groupe verbal court.',
    inputSchema: { from: zRef, label: z.string().min(1).max(60), to: zRef },
    annotations: { openWorldHint: false },
  }, (a) => run(() => store.update((w) => {
    const f = resolveEntry(w, a.from), t = resolveEntry(w, a.to);
    if (f.id === t.id) throw new Error('Une fiche ne peut pas être reliée à elle-même.');
    const label = a.label.trim();
    const dup = w.relations.find((r) => r.from === f.id && r.to === t.id && norm(r.label) === norm(label));
    if (dup) return { already_exists: dup };
    const r = { id: uid('r'), from: f.id, to: t.id, label, ai: true };
    w.relations.push(r);
    return { added: { ...r, sentence: `${f.name} ${label} ${t.name}` } };
  })));

  server.registerTool('remove_relation', {
    title: 'Retirer une relation',
    description: 'Retire une relation par son id (visible dans get_entry).',
    inputSchema: { relation_id: z.string().min(1) },
    annotations: { destructiveHint: true, openWorldHint: false },
  }, ({ relation_id }) => run(() => store.update((w) => {
    const r = w.relations.find((x) => x.id === relation_id);
    if (!r) throw new Error(`Aucune relation avec l'id ${relation_id}.`);
    w.relations = w.relations.filter((x) => x.id !== relation_id);
    return { removed: `${named(w, r.from).name} ${r.label} ${named(w, r.to).name}` };
  })));

  server.registerTool('find_mentions', {
    title: 'Repérer les fiches citées dans un texte',
    description: "Applique le moteur de liens automatiques à un texte : quelles fiches y sont nommées, combien de fois et sous quelle forme. Utile avant d'écrire, pour vérifier les noms.",
    inputSchema: { text: z.string().min(1).max(100000) },
    annotations: ro,
  }, ({ text: t }) => run(async () => {
    const w = await store.read();
    return [...mentions(w, t)].map(([id, v]) => ({ ...named(w, id), count: v.count, written_as: [...v.as] }));
  }));

  server.registerTool('find_link_candidates', {
    title: 'Trouver des liens à proposer',
    description: "Liste les paires de fiches qui se citent ou apparaissent ensemble dans un même paragraphe de chapitre, sans relation notée entre elles, avec l'extrait qui le montre. Sers-t'en pour proposer des relations à l'auteur, puis appelle add_relation pour celles qu'il valide.",
    inputSchema: { limit: z.number().int().min(1).max(60).optional(), only_characters: z.boolean().optional().describe('Seulement les paires de personnages.') },
    annotations: ro,
  }, ({ limit, only_characters }) => run(async () => {
    const w = await store.read(), m = matcher(w);
    const linked = new Set(w.relations.flatMap((r) => [`${r.from}|${r.to}`, `${r.to}|${r.from}`]));
    const cands = new Map<string, { a: string; b: string; score: number; evidence: string[] }>();
    const add = (a: string, b: string, score: number, ev: string) => {
      if (a === b || linked.has(`${a}|${b}`)) return;
      const key = [a, b].sort().join('|'), c = cands.get(key) ?? { a, b, score: 0, evidence: [] };
      c.score += score; if (ev && c.evidence.length < 3 && !c.evidence.includes(ev)) c.evidence.push(ev);
      cands.set(key, c);
    };
    for (const e of w.entries) for (const [id, v] of mentions(w, e.body, m)) add(e.id, id, 2 * v.count, `Fiche « ${e.name} » : ${snippet(e.body, [...v.as][0])}`);
    for (const c of w.chapters) for (const para of c.text.split(/\n{2,}/)) {
      const ids = [...mentions(w, para, m).keys()];
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) add(ids[i], ids[j], 1, `${c.title} : ${para.length > 240 ? para.slice(0, 239) + '…' : para}`);
    }
    return [...cands.values()]
      .filter((c) => !only_characters || [c.a, c.b].every((id) => named(w, id).type === 'personnage'))
      .sort((x, y) => y.score - x.score).slice(0, limit ?? 15)
      .map((c) => ({ a: named(w, c.a), b: named(w, c.b), strength: c.score, evidence: c.evidence }));
  }));
}

// ---------- carte, terrain, événements ----------
function registerMapTools(server: McpServer, store: WorldStore) {
  server.registerTool('list_map_markers', {
    title: 'Repères de la carte',
    description: "Tous les repères posés sur la carte, avec la fiche liée et le terrain à cet endroit. « year_max » masque les événements postérieurs (comme le curseur de chronologie).",
    inputSchema: { year_max: z.number().int().optional(), type: zType.optional() },
    annotations: ro,
  }, ({ year_max, type }) => run(async () => {
    const w = await store.read();
    return w.pins.map((p) => ({ p, e: w.entries.find((e) => e.id === p.entryId) })).filter(({ e }) => e && (!type || e.type === type) && !(year_max != null && Number.isFinite(e.year) && (e.year as number) > year_max))
      .map(({ p, e }) => ({ ...brief(e as Entry), x: Math.round(p.x), y: Math.round(p.y), terrain: terrainAt(w, p.x, p.y) }));
  }));

  server.registerTool('describe_location', {
    title: 'Décrire un endroit de la carte',
    description: 'Ce qui se trouve à un point de la carte : mer ou terre, biome, altitude ou profondeur approximatives, et les repères les plus proches avec leur distance et leur direction.',
    inputSchema: { x: zX, y: zY, radius: z.number().min(5).max(600).optional().describe('Rayon de recherche des repères proches (défaut 120).') },
    annotations: ro,
  }, ({ x, y, radius }) => run(async () => {
    const w = await store.read();
    return { x, y, terrain: terrainAt(w, x, y), nearby: nearby(w, x, y, radius ?? 120) };
  }));

  server.registerTool('place_on_map', {
    title: 'Placer une fiche sur la carte',
    description: 'Pose (ou déplace) le repère d’une fiche à un point de la carte. Renvoie le terrain à cet endroit.',
    inputSchema: { entry: zRef, x: zX, y: zY },
    annotations: { idempotentHint: true, openWorldHint: false },
  }, (a) => run(() => store.update((w) => {
    const e = resolveEntry(w, a.entry);
    const pin = w.pins.find((p) => p.entryId === e.id);
    if (pin) Object.assign(pin, { x: a.x, y: a.y }); else w.pins.push({ id: uid('p'), entryId: e.id, x: a.x, y: a.y });
    return { placed: brief(e), x: a.x, y: a.y, terrain: terrainAt(w, a.x, a.y), nearby: nearby(w, a.x, a.y, 120, e.id).slice(0, 5) };
  })));

  server.registerTool('add_event', {
    title: 'Noter un événement sur la carte',
    description: "Crée une fiche « événement » datée, posée sur la carte (par coordonnées, ou près du repère d'une fiche avec « at »), et relie les participants avec « a participé à ». Les noms écrits dans « text » deviennent des liens.",
    inputSchema: {
      title: z.string().min(1).max(120), year: z.number().int(), text: z.string().max(20000).optional(),
      x: zX.optional(), y: zY.optional(), at: zRef.optional().describe("Fiche déjà placée sur la carte près de laquelle poser l'événement."),
      participants: z.array(zRef).max(20).optional(),
    },
    annotations: { openWorldHint: false },
  }, (a) => run(() => store.update((w) => {
    if (w.entries.some((e) => norm(e.name) === norm(a.title))) throw new Error(`Une fiche « ${a.title} » existe déjà.`);
    let pos: { x: number; y: number } | null = a.x != null && a.y != null ? { x: a.x, y: a.y } : null;
    if (!pos && a.at) {
      const at = resolveEntry(w, a.at), p = w.pins.find((x) => x.entryId === at.id);
      if (!p) throw new Error(`« ${at.name} » n'est pas sur la carte. Donne x et y, ou place-la d'abord avec place_on_map.`);
      pos = { x: Math.min(MAP_W, p.x + 22), y: Math.max(0, p.y - 16) };
    }
    const people = (a.participants ?? []).map((r) => resolveEntry(w, r));
    const body = a.text?.trim() ?? '';
    const e: Entry = { id: uid('e'), type: 'evenement', name: a.title.trim(), aliases: [], year: a.year, summary: body.split(/(?<=[.!?])\s/)[0] ?? '', body };
    w.entries.push(e);
    if (pos) w.pins.push({ id: uid('p'), entryId: e.id, ...pos });
    for (const p of people) w.relations.push({ id: uid('r'), from: p.id, to: e.id, label: 'a participé à', ai: true });
    return { created: entryView(w, e) };
  })));
}

// ---------- chronologie et manuscrit ----------
function registerStoryTools(server: McpServer, store: WorldStore) {
  server.registerTool('get_timeline', {
    title: 'Chronologie',
    description: "Les événements datés dans l'ordre, avec leur lieu (repère et lieu nommé le plus proche) et les fiches impliquées.",
    inputSchema: { from_year: z.number().int().optional(), to_year: z.number().int().optional() },
    annotations: ro,
  }, ({ from_year, to_year }) => run(async () => {
    const w = await store.read(), m = matcher(w);
    return w.entries.filter((e) => Number.isFinite(e.year) && (from_year == null || (e.year as number) >= from_year) && (to_year == null || (e.year as number) <= to_year))
      .sort((a, b) => (a.year as number) - (b.year as number)).map((e) => {
        const pin = w.pins.find((p) => p.entryId === e.id);
        const place = pin ? nearby(w, pin.x, pin.y, 250, e.id).find((n) => n.type === 'lieu') ?? null : null;
        const involved = new Map<string, string>();
        for (const r of w.relations) { if (r.to === e.id) involved.set(r.from, r.label); if (r.from === e.id) involved.set(r.to, r.label); }
        for (const id of mentions(w, e.body, m).keys()) if (id !== e.id && !involved.has(id)) involved.set(id, 'cité');
        return { year: e.year, ...brief(e), where: pin ? { x: Math.round(pin.x), y: Math.round(pin.y), near: place } : null, involved: [...involved].map(([id, how]) => ({ ...named(w, id), how })) };
      });
  }));

  server.registerTool('list_chapters', {
    title: 'Chapitres',
    description: 'Les chapitres du manuscrit avec leur nombre de mots et les fiches qu’ils citent.',
    annotations: ro,
  }, () => run(async () => {
    const w = await store.read(), m = matcher(w);
    return w.chapters.map((c) => ({ id: c.id, title: c.title, words: words(c.text), cites: [...mentions(w, c.text, m).keys()].map((id) => named(w, id).name) }));
  }));

  server.registerTool('read_chapter', {
    title: 'Lire un chapitre',
    description: 'Texte complet d’un chapitre (par id ou titre) et les fiches qu’il cite.',
    inputSchema: { chapter: z.string().min(1) },
    annotations: ro,
  }, ({ chapter }) => run(async () => {
    const w = await store.read(), c = findChapter(w, chapter);
    return { id: c.id, title: c.title, words: words(c.text), text: c.text, cites: [...mentions(w, c.text)].map(([id, v]) => ({ ...named(w, id), count: v.count })) };
  }));

  server.registerTool('write_chapter', {
    title: 'Écrire un chapitre',
    description: "Crée un chapitre (sans « chapter ») ou modifie un chapitre existant. mode « append » ajoute le texte à la fin, « replace » remplace tout. Renvoie les fiches reconnues dans le texte.",
    inputSchema: { chapter: z.string().optional(), title: z.string().min(1).max(160).optional(), text: z.string().max(200000), mode: z.enum(['replace', 'append']).optional() },
    annotations: { openWorldHint: false },
  }, (a) => run(() => store.update((w) => {
    let c = a.chapter ? findChapter(w, a.chapter) : null;
    if (!c) { c = { id: uid('c'), title: a.title?.trim() || `Chapitre ${w.chapters.length + 1}`, text: '' }; w.chapters.push(c); }
    if (a.title) c.title = a.title.trim();
    c.text = a.mode === 'append' && c.text.trim() ? c.text.trimEnd() + '\n\n' + a.text.trim() : a.text;
    return { id: c.id, title: c.title, words: words(c.text), cites: [...mentions(w, c.text)].map(([id, v]) => ({ ...named(w, id), count: v.count })) };
  })));
}

function findChapter(w: World, ref: string) {
  const c = w.chapters.find((x) => x.id === ref) ?? w.chapters.find((x) => norm(x.title) === norm(ref)) ?? w.chapters.find((x) => norm(x.title).includes(norm(ref)));
  if (!c) throw new Error(`Aucun chapitre « ${ref} ». Chapitres : ${w.chapters.map((x) => `${x.title} (${x.id})`).join(', ') || 'aucun'}.`);
  return c;
}

export { TYPE_LABEL };
