import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyCodexEvent, cleanCommand, type CodexTurnState } from '../server/agents/codex-mapper';
import type { CodexEvent } from '../server/agents/codex-types';
import { makeHub } from './helpers';

test('commandes Codex débarrassées de l’enveloppe shell', () => {
  assert.equal(cleanCommand(`bash -lc 'npm test'`), 'npm test');
  assert.equal(cleanCommand('/bin/zsh -c "cargo build --release"'), 'cargo build --release');
  assert.equal(cleanCommand('ls -la'), 'ls -la');
});

test('un tour Codex complet anime le personnage et remonte le résultat', () => {
  const hub = makeHub();
  const s = hub.createSession({ name: 'Orion', role: 'worker', source: 'sdk', agent: 'codex', controllable: true });
  const state: CodexTurnState = {};
  const results: Array<{ success: boolean; text: string }> = [];
  let threadId = '';
  const cb = { onInit: (id: string) => (threadId = id), onTurnResult: (r: { success: boolean; text: string }) => results.push(r) };
  const run = (ev: CodexEvent) => applyCodexEvent(hub, s.id, ev, state, cb);

  run({ type: 'thread.started', thread_id: 'th-42' });
  assert.equal(threadId, 'th-42');
  assert.equal(hub.getSession(s.id)!.agentSessionId, 'th-42');
  run({ type: 'turn.started' });
  assert.equal(hub.getSession(s.id)!.status, 'working');

  run({ type: 'item.started', item: { id: 'i1', type: 'command_execution', command: `bash -lc 'npm test'`, aggregated_output: '', status: 'in_progress' } });
  assert.equal(hub.getSession(s.id)!.activity, 'running');
  assert.equal(hub.getSession(s.id)!.activityLabel, '$ npm test');
  run({ type: 'item.completed', item: { id: 'i1', type: 'command_execution', command: `bash -lc 'npm test'`, aggregated_output: '1 failing', exit_code: 1, status: 'failed' } });
  assert.ok(hub.snapshot().events.some((e) => e.kind === 'error' && e.text.includes('npm test')));

  run({ type: 'item.started', item: { id: 'i2', type: 'file_change', changes: [{ path: 'src/cache.ts', kind: 'add' }], status: 'completed' } });
  assert.equal(hub.getSession(s.id)!.activity, 'writing');
  run({ type: 'item.completed', item: { id: 'i2', type: 'file_change', changes: [{ path: 'src/cache.ts', kind: 'add' }], status: 'completed' } });
  assert.deepEqual(hub.getSession(s.id)!.files, ['src/cache.ts']);

  run({ type: 'item.completed', item: { id: 'i3', type: 'agent_message', text: 'Cache ajouté, tests verts.' } });
  run({ type: 'turn.completed', usage: { input_tokens: 1200, cached_input_tokens: 0, output_tokens: 300 } });
  const done = hub.getSession(s.id)!;
  assert.equal(done.status, 'idle');
  assert.equal(done.activity, 'done');
  assert.equal(done.tokensIn, 1200);
  assert.equal(done.tokensOut, 300);
  assert.equal(done.turns, 1);
  assert.equal(done.lastText, 'Cache ajouté, tests verts.');
  assert.deepEqual(results.map((r) => [r.success, r.text]), [[true, 'Cache ajouté, tests verts.']]);

  run({ type: 'turn.started' });
  run({ type: 'turn.failed', error: { message: 'quota dépassé' } });
  assert.equal(hub.getSession(s.id)!.status, 'error');
  assert.deepEqual(results.at(-1), { success: false, text: '', costUsd: 0, errors: ['quota dépassé'] });
});
