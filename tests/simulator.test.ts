import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hostnameOf } from '../server/security';
import { Simulator } from '../shared/simulator';
import { makeHub } from './helpers';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('la démo fait vivre le QG et le Chef répond', async () => {
  const hub = makeHub();
  const sim = new Simulator(hub, { speed: 40 });
  sim.start();
  try {
    await wait(600);
    const workers = hub.listSessions().filter((s) => s.role === 'worker');
    assert.ok(workers.length >= 2, 'des agents sont recrutés');
    assert.ok(hub.snapshot().events.length > 3, 'des événements circulent');

    await sim.sendToManager("Fais le point sur l'équipe");
    const reports = hub.listReports();
    assert.ok(reports.some((r) => r.title === "Point d'équipe"));

    const { id } = await sim.spawnWorker({ task: 'Écrire les tests du panier' });
    assert.equal(hub.getSession(id)?.task, 'Écrire les tests du panier');
    await sim.stop(id);
    assert.equal(hub.getSession(id)?.status, 'ended');
    await sim.resume(id);
    assert.equal(hub.getSession(id)?.status, 'idle');
    await sim.dismiss(id);
    assert.equal(hub.getSession(id), undefined);
  } finally {
    sim.dispose();
  }
});

test('hostnameOf gère ports et IPv6', () => {
  assert.equal(hostnameOf('localhost:7495'), 'localhost');
  assert.equal(hostnameOf('127.0.0.1'), '127.0.0.1');
  assert.equal(hostnameOf('[::1]:5173'), '[::1]');
  assert.equal(hostnameOf('EVIL.example.com:80'), 'evil.example.com');
});
