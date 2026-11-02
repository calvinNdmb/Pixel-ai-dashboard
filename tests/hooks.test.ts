import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HookIngestor } from '../server/hooks';
import { makeHub } from './helpers';

const base = (event: string, extra: Record<string, unknown> = {}, sid = 's-1', cwd = '/home/me/projets/mon-app') => ({
  session_id: sid,
  transcript_path: '/tmp/t.jsonl',
  cwd,
  hook_event_name: event,
  ...extra,
});

test('une session terminal apparaît au premier événement, nommée d’après son dossier', () => {
  const hub = makeHub();
  const ing = new HookIngestor(hub, () => false);
  assert.equal(ing.handle(base('SessionStart', { source: 'startup', model: 'modele-test-a' })).accepted, true);
  const [s] = hub.listSessions();
  assert.equal(s?.name, 'mon-app');
  assert.equal(s?.source, 'hook');
  assert.equal(s?.role, 'external');
  assert.equal(s?.controllable, false);
  assert.equal(s?.model, 'modele-test-a');
});

test('cycle complet : prompt, outil, autorisation, fin de tour, fin de session', () => {
  const hub = makeHub();
  const ing = new HookIngestor(hub, () => false);
  ing.handle(base('UserPromptSubmit', { prompt: 'Ajoute un bouton' }));
  const id = hub.listSessions()[0]!.id;
  assert.equal(hub.getSession(id)!.task, 'Ajoute un bouton');
  assert.equal(hub.getSession(id)!.activity, 'thinking');

  ing.handle(base('PreToolUse', { tool_name: 'Edit', tool_input: { file_path: '/home/me/projets/mon-app/src/Header.tsx' }, tool_use_id: 't1' }));
  assert.equal(hub.getSession(id)!.activity, 'writing');
  assert.equal(hub.getSession(id)!.activityLabel, 'Modifie Header.tsx');
  assert.deepEqual(hub.getSession(id)!.files, ['/home/me/projets/mon-app/src/Header.tsx']);

  ing.handle(base('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'npm test' } }));
  assert.equal(hub.getSession(id)!.status, 'waiting');
  assert.equal(hub.getSession(id)!.pending?.summary, '$ npm test');
  assert.equal(hub.getSession(id)!.pending?.canAlwaysAllow, false);

  ing.handle(base('PostToolUse', { tool_name: 'Bash', tool_input: {}, tool_response: {}, tool_use_id: 't2' }));
  assert.equal(hub.getSession(id)!.pending, undefined, 'la demande est levée dès que la session reprend');

  ing.handle(base('Stop', { stop_hook_active: false, last_assistant_message: 'Bouton ajouté.' }));
  assert.equal(hub.getSession(id)!.activity, 'done');
  assert.equal(hub.getSession(id)!.lastText, 'Bouton ajouté.');

  ing.handle(base('SessionEnd', { reason: 'prompt_input_exit' }));
  assert.equal(hub.getSession(id)!.status, 'ended');
  assert.equal(hub.getSession(id)!.activity, 'leaving');
});

test('les sessions pilotées par le dashboard sont ignorées (en-tête ou session connue)', () => {
  const hub = makeHub();
  const ing = new HookIngestor(hub, (sid) => sid === 'managed-1');
  assert.equal(ing.handle(base('SessionStart', {}, 'x'), { managed: true }).accepted, false);
  assert.equal(ing.handle(base('SessionStart', {}, 'managed-1')).accepted, false);
  const sdk = hub.createSession({ name: 'Nova', role: 'worker', source: 'sdk', claudeSessionId: 'sdk-9' });
  assert.equal(ing.handle(base('PreToolUse', { tool_name: 'Read', tool_input: {} }, 'sdk-9')).accepted, false);
  assert.equal(hub.getSession(sdk.id)!.activity, 'idle');
  assert.equal(hub.listSessions().length, 1);
});

test('deux sessions du même projet reçoivent des noms distincts', () => {
  const hub = makeHub();
  const ing = new HookIngestor(hub, () => false);
  ing.handle(base('SessionStart', { source: 'startup' }, 'a'));
  ing.handle(base('SessionStart', { source: 'startup' }, 'b'));
  assert.deepEqual(
    hub
      .listSessions()
      .map((s) => s.name)
      .sort(),
    ['mon-app', 'mon-app 2'],
  );
});

test('payloads invalides refusés sans planter', () => {
  const hub = makeHub();
  const ing = new HookIngestor(hub, () => false);
  assert.equal(ing.handle(null).accepted, false);
  assert.equal(ing.handle('texte').accepted, false);
  assert.equal(ing.handle({ hook_event_name: 'Stop' }).accepted, false);
  assert.equal(ing.handle(base('SessionEnd', { reason: 'other' }, 'inconnue')).accepted, false);
  assert.equal(hub.listSessions().length, 0);
});

test('une session terminée qui se manifeste à nouveau revient au QG', () => {
  const hub = makeHub();
  const ing = new HookIngestor(hub, () => false);
  ing.handle(base('SessionStart', { source: 'startup' }));
  ing.handle(base('SessionEnd', { reason: 'other' }));
  ing.handle(base('UserPromptSubmit', { prompt: 'Encore une chose' }));
  assert.equal(hub.listSessions()[0]!.status, 'working');
});

test('reap() ferme les sessions muettes depuis longtemps', () => {
  const hub = makeHub();
  const ing = new HookIngestor(hub, () => false);
  ing.handle(base('SessionStart', { source: 'startup' }));
  ing.reap(Date.now() + 4 * 60 * 60 * 1000);
  assert.equal(hub.listSessions()[0]!.status, 'ended');
});
