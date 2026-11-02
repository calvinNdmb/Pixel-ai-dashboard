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
  const sdk = hub.createSession({ name: 'Nova', role: 'worker', source: 'sdk', agentSessionId: 'sdk-9' });
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

test('Codex : détecté via le relais, son transcript ou turn_id ; machine distante notée', () => {
  const hub = makeHub();
  const ing = new HookIngestor(hub, () => false, 'test-host');
  ing.handle(base('SessionStart', { pixel_agent: 'codex', pixel_host: 'mac-mini' }, 'c-1', '/home/me/api'));
  ing.handle(base('UserPromptSubmit', { prompt: 'Go', transcript_path: '/home/me/.codex/sessions/2026/11/02/rollout-x.jsonl' }, 'c-2', '/home/me/cli'));
  ing.handle(base('UserPromptSubmit', { prompt: 'Go', turn_id: 't-1' }, 'c-3', '/home/me/web'));
  ing.handle(base('SessionStart', { pixel_agent: 'claude', pixel_host: 'test-host' }, 'k-1', '/home/me/blog'));
  const byName = Object.fromEntries(hub.listSessions().map((s) => [s.name, s]));
  assert.equal(byName.api?.agent, 'codex');
  assert.equal(byName.api?.host, 'mac-mini');
  assert.equal(byName.cli?.agent, 'codex');
  assert.equal(byName.web?.agent, 'codex');
  assert.equal(byName.blog?.agent, 'claude');
  assert.equal(byName.blog?.host, undefined, 'même machine que le dashboard : pas de badge');
});

test('commande Codex lisible (sans « bash -lc ») et demande d’autorisation identifiée', () => {
  const hub = makeHub();
  const ing = new HookIngestor(hub, () => false);
  ing.handle(base('PreToolUse', { pixel_agent: 'codex', tool_name: 'shell', tool_input: { command: ['bash', '-lc', 'cargo test'] }, tool_use_id: 'c1' }));
  const id = hub.listSessions()[0]!.id;
  assert.equal(hub.getSession(id)!.activity, 'running');
  assert.equal(hub.getSession(id)!.activityLabel, '$ cargo test');
  const r = ing.handle(base('PermissionRequest', { tool_name: 'shell', tool_input: { command: ['bash', '-lc', 'rm -rf target'] } }));
  assert.equal(r.event, 'PermissionRequest');
  assert.equal(r.sessionId, id);
  assert.equal(r.requestId, hub.getSession(id)!.pending?.id);
  assert.equal(hub.getSession(id)!.pending?.answerable, false, 'sans télécommande, on répond dans le terminal');
});

test('sous-agents : un personnage par agent_id, qui repart quand il a fini', () => {
  const hub = makeHub();
  const ing = new HookIngestor(hub, () => false);
  ing.handle(base('UserPromptSubmit', { prompt: 'Audite le code' }));
  const parent = hub.listSessions()[0]!;
  ing.handle(base('SubagentStart', { agent_id: 'a-1', agent_type: 'Explore' }));
  ing.handle(base('PreToolUse', { agent_id: 'a-1', agent_type: 'Explore', tool_name: 'Grep', tool_input: { pattern: 'TODO' }, tool_use_id: 'g1' }));
  const child = hub.listSessions().find((s) => s.role === 'subagent')!;
  assert.ok(child);
  assert.equal(child.parentId, parent.id);
  assert.equal(child.name, 'mon-app·Explore');
  assert.equal(child.activity, 'reading', 'l’outil anime le sous-agent…');
  assert.notEqual(hub.getSession(parent.id)!.activity, 'reading', '… pas son parent');
  ing.handle(base('SubagentStop', { agent_id: 'a-1', agent_type: 'Explore', last_assistant_message: '3 TODO trouvés.' }));
  assert.equal(hub.getSession(child.id)!.status, 'ended');
  assert.equal(hub.getSession(child.id)!.lastText, '3 TODO trouvés.');
  ing.handle(base('SubagentStart', { agent_id: 'a-2' }));
  ing.handle(base('SessionEnd', { reason: 'exit' }));
  assert.ok(hub.listSessions().filter((s) => s.role === 'subagent').every((s) => s.status === 'ended'), 'fin de session : tout le monde sort');
});

test('une session repérée par son transcript passe en mode hooks', () => {
  const hub = makeHub();
  const s = hub.createSession({ name: 'blog', role: 'external', source: 'watch', agent: 'claude', agentSessionId: 's-1', controllable: false });
  const ing = new HookIngestor(hub, () => false);
  const r = ing.handle(base('UserPromptSubmit', { prompt: 'Corrige le RSS' }));
  assert.equal(r.sessionId, s.id);
  assert.equal(hub.getSession(s.id)!.source, 'hook');
  assert.equal(hub.listSessions().length, 1, 'pas de doublon');
});
