// Test de bout en bout : lance le serveur (stdio puis HTTP), appelle les outils, vérifie les réponses.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const dir = mkdtempSync(join(tmpdir(), 'archipel-'));
const world = join(dir, 'world.json');
// un monde tel que l'application le sauve : avec une ville peinte
const seedWorld = JSON.parse(readFileSync(new URL('../data/seed-world.json', import.meta.url), 'utf8'));
seedWorld.towns = [{ id: 't-portsel', entryId: 'portsel', seed: 3, discs: [[372, 456, 27, 1], [348, 452, 19, 1]] }];
writeFileSync(world, JSON.stringify(seedWorld));
const json = (r) => { assert.ok(!r.isError, r.content?.[0]?.text); return JSON.parse(r.content[0].text); };
let passed = 0;
const ok = (label) => { passed++; console.log('  ✓', label); };

const client = new Client({ name: 'smoke', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: 'node', args: ['dist/index.js'], env: { ...process.env, ARCHIPEL_WORLD: world } }));
const call = (name, args = {}) => client.callTool({ name, arguments: args });

const { tools } = await client.listTools();
assert.equal(tools.length, 21); ok(`${tools.length} outils exposés`);

const ov = json(await call('get_world_overview'));
assert.equal(ov.world.name, 'Les Îles Cendrées'); assert.equal(ov.counts.personnage, 4); ok('vue d’ensemble');

const ys = json(await call('get_entry', { entry: 'ysolde' }));
assert.ok(ys.mentions.some((m) => m.name === 'Port-Sel')); assert.ok(ys.relations.length >= 3); ok('fiche + liens automatiques');

const ps = json(await call('get_entry', { entry: 'port sel' }));
assert.equal(ps.map.terrain.milieu, 'terre'); ok(`terrain de Port-Sel : ${ps.map.terrain.biome}, ${ps.map.terrain.altitude_m} m`);

const cands = json(await call('find_link_candidates', { only_characters: true }));
assert.ok(cands.length > 0 && cands[0].evidence.length > 0); ok(`${cands.length} liens candidats entre personnages`);

const rel = json(await call('add_relation', { from: 'Brisa', label: 'protège', to: 'Ysolde Varn' }));
assert.match(rel.added.sentence, /Brisa Holm protège Ysolde Varn/); ok('relation ajoutée');

const ev = json(await call('add_event', { title: 'La Tempête de Sel', year: 312, at: 'Port-Sel', participants: ['Brisa', 'Ysolde'], text: 'Maître Oren sonne la cloche du port.' }));
assert.ok(ev.created.map && ev.created.mentions.some((m) => m.name === 'Maître Oren')); ok('événement posé sur la carte');

const tl = json(await call('get_timeline', { from_year: 300 }));
assert.deepEqual(tl.map((e) => e.year), [...tl.map((e) => e.year)].sort((a, b) => a - b)); assert.equal(tl.at(-1).name, 'La Tempête de Sel'); ok('chronologie triée');

const land = json(await call('describe_location', { x: 770, y: 215 }));
assert.equal(land.terrain.milieu, 'terre'); assert.equal(land.nearby[0].name, 'Île Morne');
const sea = json(await call('describe_location', { x: 30, y: 30 }));
assert.equal(sea.terrain.milieu, 'mer'); ok('terrain : terre / mer');

const ch = json(await call('write_chapter', { title: 'III. La cloche', text: 'Ysolde entendit la cloche de Port-Sel.' }));
assert.ok(ch.cites.length === 2); ok('chapitre écrit, noms reconnus');

const towns = json(await call('list_towns'));
assert.equal(towns.length, 1); assert.equal(towns[0].name, 'Port-Sel'); assert.equal(towns[0].terrain.milieu, 'terre');
const hab = json(await call('add_inhabitant', { town: 'port sel', name: 'Maren Tallec', job: 'saunière', summary: 'Elle récolte le sel des trois collines.' }));
assert.equal(hab.created.lives_in, 'Port-Sel'); assert.equal(hab.created.job, 'saunière');
assert.equal(json(await call('list_towns'))[0].inhabitants[0].name, 'Maren Tallec'); ok('villes et habitants');
const notTown = await call('add_inhabitant', { town: 'Île Morne', name: 'Personne' });
assert.ok(notTown.isError && /pas une ville peinte/.test(notTown.content[0].text)); ok('habitant refusé hors d’une ville');

const found = json(await call('search_entries', { query: 'faille' }));
assert.equal(found[0].name, 'La Faille de Verre'); ok('recherche sans accents');

const bad = await call('get_entry', { entry: 'Zorglub' });
assert.ok(bad.isError && /Aucune fiche/.test(bad.content[0].text)); ok('erreur lisible pour une fiche inconnue');
await client.close();

// HTTP + jeton
const port = 18787, token = 'secret-test';
const http = spawn('node', ['dist/http.js'], { env: { ...process.env, ARCHIPEL_WORLD: world, PORT: String(port), ARCHIPEL_TOKEN: token }, stdio: ['ignore', 'ignore', 'pipe'] });
await new Promise((r) => http.stderr.once('data', r));
const denied = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
assert.equal(denied.status, 401); ok('HTTP sans jeton refusé');
const hc = new Client({ name: 'smoke-http', version: '1.0.0' });
await hc.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
const ov2 = JSON.parse((await hc.callTool({ name: 'get_world_overview', arguments: {} })).content[0].text);
assert.equal(ov2.timeline.to, 312); ok('HTTP avec jeton : le monde modifié est bien partagé');
await hc.close(); http.kill(); rmSync(dir, { recursive: true, force: true });
console.log(`\n${passed} vérifications réussies.`);
