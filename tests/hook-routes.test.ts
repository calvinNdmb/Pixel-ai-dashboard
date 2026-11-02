import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import express from 'express';
import { hookRoutes } from '../server/hook-routes';
import { HookIngestor } from '../server/hooks';
import { RemoteControl } from '../server/remote';
import { makeHub } from './helpers';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ev = (event: string, extra: Record<string, unknown> = {}) => ({ session_id: 's-http', cwd: '/home/me/site', hook_event_name: event, ...extra });

/** Vrai serveur HTTP : le corps JSON est lu par express, comme en production. */
async function serve(pollMs = 5000) {
  const hub = makeHub();
  const ingestor = new HookIngestor(hub, () => false);
  const remote = new RemoteControl(hub, { permissionWaitMs: 60_000, stopWaitMs: 60_000 });
  remote.setEnabled(true);
  const app = express();
  app.use(hookRoutes({ ingestor, remote, pollMs }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown = {}): Promise<Record<string, any>> =>
    // Délai côté client : une réponse qui n'arrive jamais fait échouer le test au lieu de le bloquer.
    fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(4000) }).then(
      (r) => r.json() as Promise<Record<string, any>>,
    );
  const close = () => {
    remote.dispose();
    server.closeAllConnections();
    server.close();
  };
  const session = () => hub.listSessions().find((s) => s.agentSessionId === 's-http');
  return { hub, remote, post, close, session };
}

test('la décision prise dans le dashboard revient au hook qui attend', { timeout: 8000 }, async () => {
  const { remote, post, close, session } = await serve();
  try {
    await post('/api/hooks', ev('UserPromptSubmit', { prompt: 'Build' }));
    const answer = post('/api/hooks/decide', ev('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'npm run build' } }));
    for (let i = 0; i < 100 && !session()?.pending; i++) await sleep(10);
    const pending = session()?.pending;
    assert.ok(pending?.answerable, 'demande retenue et répondable');
    // Régression : la réponse doit arriver même si la requête a déjà été lue.
    await sleep(100);
    assert.equal(remote.answerPermission(pending.id, 'allow'), true);
    assert.deepEqual(await answer, { output: { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } } });
  } finally {
    close();
  }
});

test('sans réponse, le hook reçoit un ticket puis rappelle ; ?sync=1 renvoie la sortie brute', { timeout: 8000 }, async () => {
  const { remote, post, close, session } = await serve(1000);
  try {
    const first = await post('/api/hooks/decide', ev('Stop', { stop_hook_active: false }));
    assert.equal(typeof first.wait, 'string');
    const again = post(`/api/hooks/decide/${first.wait}`);
    await sleep(100);
    assert.equal(remote.reply(session()!.id, 'Continue avec les tests'), true);
    const out = await again;
    assert.equal(out.output.decision, 'block');
    assert.match(out.output.reason, /Continue avec les tests$/);

    // Hook HTTP natif : une seule requête, réponse = sortie du hook.
    const sync = post('/api/hooks/decide?sync=1', ev('Stop', { stop_hook_active: true }));
    await sleep(100);
    remote.reply(session()!.id, 'Et la doc');
    const raw = await sync;
    assert.equal(raw.decision, 'block');
    assert.equal(raw.output, undefined);
  } finally {
    close();
  }
});

test('télécommande coupée : réponse vide immédiate, l’outil fait comme d’habitude', { timeout: 8000 }, async () => {
  const { remote, post, close, session } = await serve();
  try {
    remote.setEnabled(false);
    assert.deepEqual(await post('/api/hooks/decide', ev('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'ls' } })), { output: null });
    assert.equal(session()?.pending?.answerable, false, 'la question reste dans le terminal');
    assert.deepEqual(await post('/api/hooks/decide?sync=1', ev('Stop')), {});
    assert.equal(session()?.hold, undefined);
    assert.deepEqual(await post('/api/hooks/decide/inconnu'), { output: null });
  } finally {
    close();
  }
});
