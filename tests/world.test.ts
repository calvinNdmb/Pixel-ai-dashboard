import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activityForTool, describeTool } from '../shared/activity';
import { characterRows } from '../web/src/game/characters';
import { COLS, DESKS, DOOR, isStandable, PROPS, ROWS, SPOTS } from '../web/src/game/map';
import { appearanceFor } from '../web/src/game/palette';
import { findPath } from '../web/src/game/path';

test('chaque place du QG est atteignable depuis la porte', () => {
  for (const spot of SPOTS) {
    assert.ok(isStandable(spot.x, spot.y), `${spot.id} doit être sur une tuile praticable`);
    const path = findPath(DOOR, { x: spot.x, y: spot.y });
    assert.ok(path, `${spot.id} (${spot.x},${spot.y}) inatteignable depuis la porte`);
  }
});

test('on peut aller de n’importe quel bureau à n’importe quelle zone', () => {
  const seats = SPOTS.filter((s) => s.zone === 'desks');
  assert.equal(seats.length, DESKS.length);
  const targets = SPOTS.filter((s) => s.zone !== 'desks');
  for (const from of seats) {
    for (const to of targets) {
      assert.ok(findPath({ x: from.x, y: from.y }, { x: to.x, y: to.y }), `${from.id} → ${to.id}`);
    }
  }
});

test('le mobilier reste dans les murs et les places ne se chevauchent pas', () => {
  for (const p of PROPS) {
    assert.ok(p.x >= 0 && p.x + (p.w ?? 1) <= COLS && p.y >= 0 && p.y < ROWS, `${p.kind} hors du plan`);
  }
  const seen = new Set<string>();
  for (const s of SPOTS) {
    const k = `${s.x},${s.y}`;
    assert.ok(!seen.has(k), `deux places sur la même tuile : ${k}`);
    seen.add(k);
  }
});

test('les sprites de personnages se composent sans erreur (toutes poses)', () => {
  const dirs = ['down', 'up', 'left', 'right'] as const;
  const poses = ['stand', 'walk', 'sit', 'type', 'raise', 'cheer', 'drink', 'sleep'] as const;
  for (const role of ['manager', 'worker', 'external'] as const) {
    for (let seed = 1; seed < 40; seed++) {
      const a = appearanceFor(seed * 7919, role);
      for (const dir of dirs) {
        for (const pose of poses) {
          const rows = characterRows(a, { dir, pose, frame: seed % 4 });
          assert.equal(rows.length, 20);
          assert.ok(rows.every((r) => r.length === 16));
        }
      }
    }
  }
});

test('activités et libellés des outils', () => {
  assert.equal(activityForTool('Read'), 'reading');
  assert.equal(activityForTool('Grep'), 'reading');
  assert.equal(activityForTool('Edit'), 'writing');
  assert.equal(activityForTool('Bash'), 'running');
  assert.equal(activityForTool('WebSearch'), 'browsing');
  assert.equal(activityForTool('mcp__github__create_issue'), 'browsing');
  assert.equal(activityForTool('mcp__pixel__spawn_agent'), 'delegating');
  assert.equal(activityForTool('TodoWrite'), 'planning');
  assert.equal(activityForTool('Agent'), 'delegating');
  assert.equal(activityForTool('OutilInconnu'), 'thinking');
  assert.equal(describeTool('Bash', { command: 'npm test' }), '$ npm test');
  assert.equal(describeTool('Bash', { command: ['bash', '-lc', 'cargo test'] }), '$ cargo test', 'hooks Codex');
  assert.equal(describeTool('apply_patch', { command: '*** Begin Patch\n*** Update File: src/main.rs\n@@\n*** End Patch' }), 'Modifie main.rs');
  assert.equal(activityForTool('apply_patch'), 'writing');
  assert.equal(describeTool('WebFetch', { url: 'https://example.com/docs' }), 'Consulte example.com');
  assert.equal(describeTool('mcp__pixel__report_to_user', { title: 'Fini' }), 'Rédige un rapport : Fini');
});
