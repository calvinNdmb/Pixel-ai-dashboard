import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkWaiting, newTracker, parseClaudeLine, parseCodexLine, type ParseContext } from '../server/watch-parse';
import { TranscriptWatcher } from '../server/watch';
import { makeHub } from './helpers';

const SID = '11111111-2222-3333-4444-555555555555';
const CODEX_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const claude = (type: string, extra: Record<string, unknown> = {}) => ({ type, sessionId: SID, cwd: '/home/me/blog', entrypoint: 'cli', ...extra });
const toolUse = (id: string, name: string, input: Record<string, unknown>, msgId = `m-${id}`) =>
  claude('assistant', { message: { id: msgId, role: 'assistant', content: [{ type: 'tool_use', id, name, input }], stop_reason: 'tool_use', usage: { input_tokens: 100, output_tokens: 10 } } });
const toolResult = (id: string, isError = false) =>
  claude('user', { message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: isError ? 'boom' : 'ok', is_error: isError }] } });
const text = (t: string, stop = 'end_turn') => claude('assistant', { message: { id: `m-${t.length}`, role: 'assistant', content: [{ type: 'text', text: t }], stop_reason: stop } });

function ctx(isManaged: (id: string) => boolean = () => false): ParseContext {
  return { hub: makeHub(), isManaged, serverHost: 'test-host' };
}

test('transcript Claude Code : une session observée suit prompt, outils et fin de tour', () => {
  const c = ctx();
  const t = newTracker('/x.jsonl', 'claude');
  parseClaudeLine(c, t, claude('user', { message: { role: 'user', content: 'Corrige le flux RSS' }, permissionMode: 'acceptEdits' }));
  const s = () => c.hub.getSession(t.sessionId!)!;
  assert.equal(s().name, 'blog');
  assert.equal(s().source, 'watch');
  assert.equal(s().agent, 'claude');
  assert.equal(s().task, 'Corrige le flux RSS');
  assert.equal(s().permissionMode, 'acceptEdits');

  parseClaudeLine(c, t, toolUse('t1', 'Read', { file_path: '/home/me/blog/src/rss.ts' }));
  assert.equal(s().activity, 'reading');
  assert.deepEqual(s().files, ['/home/me/blog/src/rss.ts']);
  assert.equal(s().tokensIn, 100);
  parseClaudeLine(c, t, toolUse('t1', 'Read', { file_path: '/home/me/blog/src/rss.ts' }));
  assert.equal(s().tokensIn, 100, 'même message relu : pas de double comptage');
  parseClaudeLine(c, t, toolResult('t1'));
  assert.equal(s().activity, 'thinking');

  parseClaudeLine(c, t, { type: 'ai-title', sessionId: SID, aiTitle: 'Correction du RSS' });
  assert.equal(s().title, 'Correction du RSS');

  parseClaudeLine(c, t, claude('user', { message: { role: 'user', content: '<command-name>/clear</command-name>' } }));
  assert.equal(s().task, 'Corrige le flux RSS', 'les messages techniques ne sont pas des consignes');

  parseClaudeLine(c, t, text('Les dates sont maintenant en UTC.'));
  assert.equal(s().activity, 'done');
  assert.equal(s().lastText, 'Les dates sont maintenant en UTC.');
  const results = () => c.hub.snapshot().events.filter((e) => e.kind === 'result').length;
  assert.equal(results(), 1);
  parseClaudeLine(c, t, claude('system', { subtype: 'turn_duration', durationMs: 4200 }));
  assert.equal(results(), 1, 'turn_duration après end_turn : pas de doublon');

  // turn_duration seul suffit à clore un tour
  parseClaudeLine(c, t, claude('user', { message: { role: 'user', content: 'Et ajoute un test' } }));
  parseClaudeLine(c, t, text('Je regarde.', 'tool_use'));
  assert.equal(s().status, 'working');
  parseClaudeLine(c, t, claude('system', { subtype: 'turn_duration', durationMs: 900 }));
  assert.equal(s().activity, 'done');
});

test('transcripts ignorés : sessions lancées par un SDK ou pilotées par le dashboard', () => {
  const c = ctx((id) => id === 'pilotee');
  const sdk = newTracker('/a.jsonl', 'claude');
  parseClaudeLine(c, sdk, claude('user', { entrypoint: 'sdk-ts', message: { role: 'user', content: 'x' } }));
  assert.equal(sdk.ignore, true);
  const managed = newTracker('/b.jsonl', 'claude');
  parseClaudeLine(c, managed, claude('user', { sessionId: 'pilotee', message: { role: 'user', content: 'x' } }));
  assert.equal(managed.ignore, true);
  assert.equal(c.hub.listSessions().length, 0);
});

test('session suivie par les hooks : le transcript reste discret (pas de doublons)', () => {
  const c = ctx();
  const s = c.hub.createSession({ name: 'blog', role: 'external', source: 'hook', agent: 'claude', agentSessionId: SID, controllable: false, activity: 'running', activityLabel: '$ npm test' });
  const t = newTracker('/x.jsonl', 'claude');
  parseClaudeLine(c, t, toolUse('t9', 'Read', { file_path: '/home/me/blog/a.ts' }));
  parseClaudeLine(c, t, text('Voilà le résumé.'));
  const after = c.hub.getSession(s.id)!;
  assert.equal(after.activityLabel, '$ npm test', 'les hooks gardent la main sur l’activité');
  assert.equal(after.lastText, 'Voilà le résumé.', 'mais le dernier message est complété');
  assert.equal(c.hub.snapshot().events.length, 0);
});

test('sans hooks, un outil qui ne revient pas fait lever la main (autorisation probable)', () => {
  const c = ctx();
  const t = newTracker('/x.jsonl', 'claude');
  parseClaudeLine(c, t, toolUse('t2', 'Bash', { command: 'npm publish' }));
  const id = t.sessionId!;
  checkWaiting(c, t, Date.now() + 5000);
  assert.equal(c.hub.getSession(id)!.status, 'working', 'une commande peut être longue');
  checkWaiting(c, t, Date.now() + 30_000);
  assert.equal(c.hub.getSession(id)!.status, 'waiting');
  assert.equal(c.hub.getSession(id)!.pending?.answerable, false);
  parseClaudeLine(c, t, toolResult('t2'));
  checkWaiting(c, t, Date.now() + 60_000);
  assert.equal(c.hub.getSession(id)!.status, 'working');
  assert.equal(c.hub.getSession(id)!.pending, undefined);
});

test('rollout Codex : session, sandbox, commandes, patchs, jetons et fin de tour', () => {
  const c = ctx();
  const t = newTracker('/rollout.jsonl', 'codex');
  const line = (type: string, payload: Record<string, unknown>) => parseCodexLine(c, t, { timestamp: new Date().toISOString(), type, payload });
  line('session_meta', { id: CODEX_ID, cwd: '/home/me/api-meteo', originator: 'codex_cli_rs' });
  const s = () => c.hub.getSession(t.sessionId!)!;
  assert.equal(s().agent, 'codex');
  assert.equal(s().name, 'api-meteo');
  line('turn_context', { cwd: '/home/me/api-meteo', approval_policy: 'on-request', sandbox_policy: { type: 'workspace-write' }, model: 'modele-test' });
  assert.equal(s().permissionMode, 'on-request · workspace-write');
  assert.equal(s().model, 'modele-test');
  line('event_msg', { type: 'user_message', message: '<environment_context>…</environment_context>' });
  assert.equal(s().task, undefined, 'contexte injecté ignoré');
  line('event_msg', { type: 'user_message', message: 'Ajoute un cache' });
  assert.equal(s().task, 'Ajoute un cache');
  line('response_item', { type: 'function_call', name: 'shell', arguments: JSON.stringify({ command: ['bash', '-lc', 'npm test'] }), call_id: 'c1' });
  assert.equal(s().activity, 'running');
  assert.equal(s().activityLabel, '$ npm test');
  line('response_item', { type: 'function_call_output', call_id: 'c1', output: JSON.stringify({ output: '', metadata: { exit_code: 1 } }) });
  assert.ok(c.hub.snapshot().events.some((e) => e.kind === 'error' && e.text.includes('code de sortie 1')));
  line('response_item', { type: 'custom_tool_call', name: 'apply_patch', call_id: 'c2', input: '*** Begin Patch\n*** Add File: src/cache.ts\n+x\n*** Update File: src/api.ts\n*** End Patch' });
  assert.equal(s().activity, 'writing');
  assert.deepEqual([...s().files].sort(), ['src/api.ts', 'src/cache.ts']);
  line('response_item', { type: 'custom_tool_call_output', call_id: 'c2', output: 'Done!' });
  line('event_msg', { type: 'token_count', info: { total_token_usage: { input_tokens: 5000, output_tokens: 700 } } });
  assert.equal(s().tokensIn, 5000);
  line('event_msg', { type: 'task_complete', last_agent_message: 'Cache ajouté.' });
  assert.equal(s().activity, 'done');
  assert.equal(s().lastText, 'Cache ajouté.');
});

test('élévation demandée par Codex : attente d’approbation certaine', () => {
  const c = ctx();
  const t = newTracker('/rollout.jsonl', 'codex');
  const line = (type: string, payload: Record<string, unknown>) => parseCodexLine(c, t, { type, payload });
  line('session_meta', { id: CODEX_ID, cwd: '/home/me/api' });
  line('turn_context', { approval_policy: 'on-request', sandbox_policy: 'workspace-write' });
  line('response_item', { type: 'function_call', name: 'shell', arguments: JSON.stringify({ command: ['curl', 'https://example.com'], with_escalated_permissions: true }), call_id: 'c9' });
  checkWaiting(c, t, Date.now());
  assert.equal(c.hub.getSession(t.sessionId!)!.status, 'waiting');
});

test('le watcher lit les nouveaux fichiers et suit les ajouts, lignes coupées comprises', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pixel-watch-'));
  try {
    const claudeDir = path.join(dir, 'claude');
    const codexDir = path.join(dir, 'codex');
    const project = path.join(claudeDir, 'projects', '-home-me-blog');
    mkdirSync(project, { recursive: true });
    const file = path.join(project, `${SID}.jsonl`);
    const jl = (o: unknown) => JSON.stringify(o) + '\n';
    writeFileSync(file, jl(claude('user', { message: { role: 'user', content: 'Corrige le RSS' } })) + jl(toolUse('t1', 'Read', { file_path: '/home/me/blog/rss.ts' })));
    // un vieux transcript (fermé depuis longtemps) est ignoré
    const old = path.join(project, '99999999-2222-3333-4444-555555555555.jsonl');
    writeFileSync(old, jl(claude('user', { sessionId: '99999999-2222-3333-4444-555555555555', message: { role: 'user', content: 'vieux' } })));
    const past = new Date(Date.now() - 3 * 3600_000);
    utimesSync(old, past, past);
    // rollout Codex du jour
    const d = new Date();
    const day = path.join(codexDir, 'sessions', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
    mkdirSync(day, { recursive: true });
    writeFileSync(path.join(day, `rollout-2026-11-02T10-00-00-${CODEX_ID}.jsonl`), jl({ type: 'session_meta', payload: { id: CODEX_ID, cwd: '/home/me/api' } }));

    const hub = makeHub();
    const w = new TranscriptWatcher(hub, { claudeDir, codexDir, isManaged: () => false, serverHost: 'test-host' });
    await w.scan();
    assert.equal(w.trackedCount, 2);
    const blog = hub.listSessions().find((s) => s.name === 'blog')!;
    assert.equal(blog.activity, 'reading', 'état rattrapé…');
    assert.equal(hub.snapshot().events.filter((e) => e.sessionId === blog.id).length, 1, '… sans inonder le journal');
    assert.ok(hub.listSessions().some((s) => s.name === 'api' && s.agent === 'codex'));

    const half = jl(toolResult('t1'));
    appendFileSync(file, half.slice(0, 20));
    await w.tick();
    assert.equal(hub.getSession(blog.id)!.activity, 'reading', 'ligne incomplète : on attend la suite');
    appendFileSync(file, half.slice(20) + jl(text('Corrigé.')));
    await w.tick();
    assert.equal(hub.getSession(blog.id)!.activity, 'done');
    assert.ok(hub.snapshot().events.some((e) => e.sessionId === blog.id && e.kind === 'result'));

    await w.tick(Date.now() + 41 * 60_000);
    assert.equal(hub.getSession(blog.id)!.status, 'ended', '40 min sans nouvelles : session fermée');
    w.stop();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
