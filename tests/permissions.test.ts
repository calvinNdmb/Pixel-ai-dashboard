import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PermissionUpdate } from '@anthropic-ai/claude-agent-sdk';
import { PermissionBroker } from '../server/agents/permissions';
import { makeHub } from './helpers';

function setup() {
  const hub = makeHub();
  const s = hub.createSession({ name: 'Nova', role: 'worker', source: 'sdk', status: 'working', controllable: true });
  const broker = new PermissionBroker(hub);
  return { hub, id: s.id, canUseTool: broker.forSession(s.id), broker };
}

const opts = (extra: Record<string, unknown> = {}) =>
  ({ signal: new AbortController().signal, toolUseID: 'tu1', requestId: 'r1', ...extra }) as Parameters<
    ReturnType<PermissionBroker['forSession']>
  >[2];

test('une demande lève la main du personnage puis « Autoriser » la libère', async () => {
  const { hub, id, canUseTool, broker } = setup();
  const pending = canUseTool('Bash', { command: 'npm test' }, opts());
  const s = hub.getSession(id)!;
  assert.equal(s.status, 'waiting');
  assert.equal(s.activity, 'waiting');
  assert.equal(s.pending?.summary, '$ npm test');
  assert.equal(broker.answer(s.pending!.id, 'allow'), true);
  const result = await pending;
  assert.equal(result?.behavior, 'allow');
  assert.deepEqual(result?.behavior === 'allow' ? result.updatedInput : undefined, { command: 'npm test' });
  assert.equal(hub.getSession(id)!.pending, undefined);
  assert.equal(hub.getSession(id)!.status, 'working');
});

test('« Toujours » renvoie les règles suggérées par Claude Code', async () => {
  const { hub, id, canUseTool, broker } = setup();
  const suggestions: PermissionUpdate[] = [
    { type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'npm test' }], behavior: 'allow', destination: 'session' },
  ];
  const pending = canUseTool('Bash', { command: 'npm test' }, opts({ suggestions }));
  assert.equal(hub.getSession(id)!.pending?.canAlwaysAllow, true);
  broker.answer(hub.getSession(id)!.pending!.id, 'always');
  const result = await pending;
  assert.equal(result?.behavior, 'allow');
  assert.deepEqual(result?.behavior === 'allow' ? result.updatedPermissions : undefined, suggestions);
});

test('« Refuser » renvoie un refus explicite', async () => {
  const { hub, id, canUseTool, broker } = setup();
  const pending = canUseTool('Write', { file_path: '/etc/hosts' }, opts());
  broker.answer(hub.getSession(id)!.pending!.id, 'deny', 'Pas ce fichier');
  const result = await pending;
  assert.equal(result?.behavior, 'deny');
  assert.equal(result?.behavior === 'deny' ? result.message : '', 'Pas ce fichier');
});

test("l'annulation côté SDK (signal) refuse et nettoie la demande", async () => {
  const { hub, id, canUseTool } = setup();
  const ctrl = new AbortController();
  const pending = canUseTool('Bash', { command: 'sleep 100' }, opts({ signal: ctrl.signal }));
  ctrl.abort();
  const result = await pending;
  assert.equal(result?.behavior, 'deny');
  assert.equal(hub.getSession(id)!.pending, undefined);
});

test('plusieurs demandes simultanées : la suivante reste affichée', async () => {
  const { hub, id, canUseTool, broker } = setup();
  const a = canUseTool('Bash', { command: 'npm test' }, opts());
  const firstId = hub.getSession(id)!.pending!.id;
  const b = canUseTool('Bash', { command: 'npm run lint' }, opts());
  const secondId = hub.getSession(id)!.pending!.id;
  broker.answer(secondId, 'allow');
  await b;
  assert.equal(hub.getSession(id)!.pending?.id, firstId);
  broker.cancelSession(id);
  assert.equal((await a)?.behavior, 'deny');
  assert.equal(hub.getSession(id)!.pending, undefined);
});
