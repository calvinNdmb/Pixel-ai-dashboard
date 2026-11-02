import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DESTINATIONS, inBuilding, inPond, onIsland, route, walkable, workSpot } from '../web/src/village/layout';
import type { Activity } from '../shared/types';

test('les activités conduisent vers des postes accessibles, sans traverser le lac ni les maisons', () => {
  const activities = Object.keys(DESTINATIONS) as Activity[];
  for (const activity of activities)
    for (let seed = 0; seed < 25; seed++) {
      const goal = workSpot(activity, seed);
      assert.ok(walkable(goal.x, goal.z), `${activity}/${seed} : poste accessible`);
      const from = workSpot('idle', seed);
      const steps = route(from, goal);
      if (from.x !== goal.x || from.z !== goal.z) assert.ok(steps.length, `${activity}/${seed} : trajet trouvé`);
      let prev = from;
      for (const at of steps) {
        assert.ok(onIsland(at.x, at.z) && !inPond(at.x, at.z) && !inBuilding(at.x, at.z, 0.45));
        assert.equal(Math.abs(at.x - prev.x) + Math.abs(at.z - prev.z), 1);
        prev = at;
      }
      assert.deepEqual(prev, goal);
    }
});

test('une nouvelle activité peut interrompre un trajet depuis une position intermédiaire', () => {
  for (const start of Object.values(DESTINATIONS))
    for (const goal of Object.values(DESTINATIONS)) {
      const p = { x: start.x + 0.15, z: start.z - 0.12 };
      const steps = route(p, goal);
      if (Math.round(p.x) !== goal.x || Math.round(p.z) !== goal.z) assert.ok(steps.length);
      if (steps.length) assert.deepEqual(steps.at(-1), goal);
    }
});

test('un point hors carte, dans le lac ou une maison ne peut pas devenir une destination', () => {
  for (const goal of [
    { x: 100, z: 100 },
    { x: 8, z: 6 },
    { x: -10, z: -7 },
  ]) {
    assert.deepEqual(route({ x: 0, z: 0 }, goal), []);
  }
  assert.deepEqual(workSpot('writing', 12), workSpot('writing', 12));
});
