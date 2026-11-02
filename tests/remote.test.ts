import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HookIngestor } from '../server/hooks';
import { RemoteControl } from '../server/remote';
import { makeHub } from './helpers';

const OPTS = { permissionWaitMs: 60_000, stopWaitMs: 60_000 };
const ev = (event: string, extra: Record<string, unknown> = {}) => ({ session_id: 's-1', cwd: '/home/me/app', hook_event_name: event, ...extra });

function setup() {
  const hub = makeHub();
  const ing = new HookIngestor(hub, () => false);
  const remote = new RemoteControl(hub, OPTS);
  remote.setEnabled(true);
  const id = ing.handle(ev('UserPromptSubmit', { prompt: 'Refais la page' })).sessionId!;
  const ask = (extra: Record<string, unknown> = {}) =>
    ing.handle(ev('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'npm run build' }, ...extra })).requestId!;
  const reap = (now: number) => (remote as unknown as { reap(now: number): void }).reap(now);
  return { hub, ing, remote, id, ask, reap };
}

test('télécommande coupée : rien n’est retenu, la question reste dans le terminal', () => {
  const { hub, remote, id, ask } = setup();
  remote.setEnabled(false);
  assert.equal(hub.info.remoteMode, false);
  const requestId = ask();
  assert.equal(remote.holdPermission(id, requestId, []), null);
  assert.equal(hub.getSession(id)!.pending?.answerable, false);
  assert.equal(remote.holdStop(id), null);
  remote.dispose();
});

test('autorisation retenue puis « toujours » : la règle proposée par Claude Code est renvoyée', async () => {
  const { hub, remote, id, ask } = setup();
  const suggestions = [{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'npm run build:*' }], behavior: 'allow', destination: 'localSettings' }];
  const requestId = ask({ permission_suggestions: suggestions });
  const ticket = remote.holdPermission(id, requestId, suggestions);
  assert.ok(ticket);
  assert.equal(hub.getSession(id)!.pending?.answerable, true, 'répondable depuis le dashboard');
  const waiting = remote.poll(ticket, 5000);
  assert.equal(remote.answerPermission(requestId, 'always'), true);
  assert.deepEqual(await waiting, {
    output: { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow', updatedPermissions: suggestions } } },
  });
  assert.equal(hub.getSession(id)!.pending, undefined);
  assert.equal(hub.getSession(id)!.status, 'working');
  assert.equal(remote.answerPermission(requestId, 'allow'), false, 'une seule réponse par demande');
  remote.dispose();
});

test('refus avec message, réponse gardée pour le prochain appel du hook', async () => {
  const { remote, id, ask } = setup();
  const requestId = ask();
  const ticket = remote.holdPermission(id, requestId)!;
  remote.answerPermission(requestId, 'deny', 'Pas en prod');
  assert.deepEqual(await remote.poll(ticket, 5000), {
    output: { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: 'Pas en prod' } } },
  });
  assert.deepEqual(await remote.poll(ticket, 5000), { output: null }, 'ticket consommé');
  remote.dispose();
});

test('fin de tour retenue : une nouvelle consigne relance la session', async () => {
  const { hub, ing, remote, id } = setup();
  ing.handle(ev('Stop', { stop_hook_active: false, last_assistant_message: 'Page refaite.' }));
  const ticket = remote.holdStop(id)!;
  const s = hub.getSession(id)!;
  assert.equal(s.status, 'waiting');
  assert.equal(s.hold?.kind, 'stop');
  assert.equal(remote.isHeld(id), true);
  const waiting = remote.poll(ticket, 5000);
  assert.equal(remote.reply(id, '   '), false, 'consigne vide refusée');
  assert.equal(remote.reply(id, '  Ajoute des tests  '), true);
  const out = await waiting;
  assert.ok('output' in out && out.output);
  assert.equal(out.output.decision, 'block');
  assert.match(String(out.output.reason), /\n\nAjoute des tests$/);
  assert.equal(hub.getSession(id)!.hold, undefined);
  assert.equal(hub.getSession(id)!.status, 'working');
  assert.equal(hub.snapshot().events.at(-1)?.text, 'Ajoute des tests');
  remote.dispose();
});

test('rendre la main, couper la télécommande ou dépasser le délai : sortie vide, le terminal reprend', async () => {
  const { hub, remote, id, ask, reap } = setup();
  // « Rendre la main au terminal »
  let ticket = remote.holdStop(id)!;
  let waiting = remote.poll(ticket, 5000);
  assert.equal(remote.release(id), true);
  assert.deepEqual(await waiting, { output: null });
  assert.equal(hub.getSession(id)!.hold, undefined);
  assert.equal(hub.getSession(id)!.status, 'idle');

  // télécommande coupée pendant une demande d'autorisation
  const requestId = ask();
  ticket = remote.holdPermission(id, requestId)!;
  waiting = remote.poll(ticket, 5000);
  remote.setEnabled(false);
  assert.deepEqual(await waiting, { output: null });
  assert.equal(hub.getSession(id)!.pending?.answerable, false, 'la question repasse au terminal');

  // délai dépassé
  remote.setEnabled(true);
  ticket = remote.holdStop(id)!;
  reap(Date.now() + OPTS.stopWaitMs + 1);
  assert.equal(remote.isHeld(id), false);
  assert.deepEqual(await remote.poll(ticket, 5000), { output: null });
  remote.dispose();
});

test('hook abandonné (Échap dans le terminal) : la retenue est levée', () => {
  const { hub, remote, id, reap } = setup();
  remote.holdStop(id);
  reap(Date.now() + 91_000);
  assert.equal(remote.isHeld(id), false);
  assert.equal(hub.getSession(id)!.hold, undefined);
  remote.dispose();
});

test('appels d’attente : ticket au bout du délai, retour immédiat si le client est parti', async () => {
  const { remote, id } = setup();
  const ticket = remote.holdStop(id)!;
  assert.deepEqual(await remote.poll(ticket, 1000), { wait: ticket });
  const ctrl = new AbortController();
  ctrl.abort();
  assert.deepEqual(await remote.poll(ticket, 60_000, ctrl.signal), { wait: ticket });
  assert.deepEqual(await remote.poll('inconnu', 60_000), { output: null });
  assert.equal(remote.isHeld(id), true, 'toujours en attente de ta réponse');
  remote.dispose();
});

test('Codex : jamais de règle « toujours » dans la réponse (Codex rejetterait la demande)', async () => {
  const hub = makeHub();
  const ing = new HookIngestor(hub, () => false);
  const remote = new RemoteControl(hub, OPTS);
  remote.setEnabled(true);
  const r = ing.handle({ session_id: 'cx', cwd: '/home/me/api', hook_event_name: 'PermissionRequest', pixel_agent: 'codex', turn_id: 't1', tool_name: 'Bash', tool_input: { command: 'cargo publish' } });
  const suggestions = [{ type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'localSettings' }];
  const ticket = remote.holdPermission(r.sessionId!, r.requestId!, suggestions)!;
  remote.answerPermission(r.requestId!, 'always');
  assert.deepEqual(await remote.poll(ticket, 5000), { output: { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } } });
  remote.dispose();
});
