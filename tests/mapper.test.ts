import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { applySdkMessage, type TurnResult } from '../server/agents/mapper';
import { makeHub } from './helpers';

// Messages au format du Claude Agent SDK (champs non utilisés omis).
const msg = (m: Record<string, unknown>) => m as unknown as SDKMessage;

function setup() {
  const hub = makeHub();
  const s = hub.createSession({ name: 'Nova', role: 'worker', source: 'sdk', status: 'starting', controllable: true });
  return { hub, id: s.id };
}

test('system/init renseigne la session Claude', () => {
  const { hub, id } = setup();
  let initId = '';
  applySdkMessage(
    hub,
    id,
    msg({
      type: 'system',
      subtype: 'init',
      session_id: 'abc-123',
      model: 'modele-test-b',
      cwd: '/repo',
      permissionMode: 'default',
      tools: ['Read'],
      mcp_servers: [],
      apiKeySource: 'none',
      claude_code_version: '2.1.316',
      slash_commands: [],
      output_style: 'default',
      skills: [],
      plugins: [],
      uuid: 'u1',
    }),
    { onInit: (sid) => (initId = sid) },
  );
  const s = hub.getSession(id)!;
  assert.equal(s.agentSessionId, 'abc-123');
  assert.equal(s.model, 'modele-test-b');
  assert.equal(s.cwd, '/repo');
  assert.equal(initId, 'abc-123');
});

test("un appel d'outil Read envoie l'agent à la bibliothèque", () => {
  const { hub, id } = setup();
  applySdkMessage(
    hub,
    id,
    msg({
      type: 'assistant',
      parent_tool_use_id: null,
      session_id: 'abc',
      uuid: 'u2',
      message: { content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/repo/src/app.ts' } }] },
    }),
  );
  const s = hub.getSession(id)!;
  assert.equal(s.activity, 'reading');
  assert.equal(s.activityLabel, 'Lit app.ts');
  assert.equal(s.currentTool, 'Read');
  assert.equal(s.toolUses, 1);
  assert.deepEqual(s.files, ['/repo/src/app.ts']);
  assert.equal(hub.sessionEvents(id).at(-1)?.kind, 'tool');
});

test('le texte de l’agent est remonté (dernier message + callback)', () => {
  const { hub, id } = setup();
  const texts: string[] = [];
  applySdkMessage(
    hub,
    id,
    msg({
      type: 'assistant',
      parent_tool_use_id: null,
      session_id: 'abc',
      uuid: 'u3',
      message: { content: [{ type: 'text', text: 'Je regarde le routeur.' }] },
    }),
    { onAssistantText: (t) => texts.push(t) },
  );
  assert.deepEqual(texts, ['Je regarde le routeur.']);
  assert.equal(hub.getSession(id)!.lastText, 'Je regarde le routeur.');
});

test('les messages de sous-agents ne déplacent pas le personnage', () => {
  const { hub, id } = setup();
  hub.updateSession(id, { activity: 'delegating' });
  applySdkMessage(
    hub,
    id,
    msg({
      type: 'assistant',
      parent_tool_use_id: 'task-1',
      session_id: 'abc',
      uuid: 'u4',
      message: { content: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'ls' } }] },
    }),
  );
  const s = hub.getSession(id)!;
  assert.equal(s.activity, 'delegating');
  assert.equal(s.toolUses, 1);
});

test("un résultat d'outil en erreur est journalisé comme erreur", () => {
  const { hub, id } = setup();
  applySdkMessage(
    hub,
    id,
    msg({
      type: 'user',
      parent_tool_use_id: null,
      session_id: 'abc',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'ENOENT: fichier introuvable' }] },
    }),
  );
  const last = hub.sessionEvents(id).at(-1)!;
  assert.equal(last.kind, 'error');
  assert.match(last.text, /ENOENT/);
  assert.equal(hub.getSession(id)!.activity, 'thinking');
});

test('fin de tour réussie : coût cumulé remplacé, statut disponible, fête', () => {
  const { hub, id } = setup();
  let result: TurnResult | undefined;
  const base = {
    type: 'result',
    duration_ms: 12_000,
    duration_api_ms: 9000,
    num_turns: 4,
    stop_reason: 'end_turn',
    usage: {},
    permission_denials: [],
    uuid: 'u5',
    session_id: 'abc',
    modelUsage: {
      'modele-test-b': {
        inputTokens: 1000,
        outputTokens: 200,
        cacheReadInputTokens: 500,
        cacheCreationInputTokens: 100,
        webSearchRequests: 0,
        costUSD: 0.02,
        contextWindow: 1_000_000,
        maxOutputTokens: 128_000,
      },
    },
  };
  applySdkMessage(hub, id, msg({ ...base, subtype: 'success', is_error: false, result: 'Pagination ajoutée.', total_cost_usd: 0.02 }), {
    onTurnResult: (r) => (result = r),
  });
  applySdkMessage(hub, id, msg({ ...base, subtype: 'success', is_error: false, result: 'Tests ajoutés.', total_cost_usd: 0.05 }));
  const s = hub.getSession(id)!;
  assert.equal(s.costUsd, 0.05, 'total_cost_usd est cumulatif : on remplace, on n’additionne pas');
  assert.equal(s.tokensIn, 1600);
  assert.equal(s.tokensOut, 200);
  assert.equal(s.turns, 2);
  assert.equal(s.status, 'idle');
  assert.equal(s.activity, 'done');
  assert.equal(s.lastText, 'Tests ajoutés.');
  assert.equal(result?.success, true);
  assert.equal(result?.text, 'Pagination ajoutée.');
});

test('fin de tour en erreur (max turns)', () => {
  const { hub, id } = setup();
  applySdkMessage(
    hub,
    id,
    msg({
      type: 'result',
      subtype: 'error_max_turns',
      is_error: true,
      duration_ms: 1,
      duration_api_ms: 1,
      num_turns: 30,
      stop_reason: null,
      total_cost_usd: 0.4,
      usage: {},
      modelUsage: {},
      permission_denials: [],
      errors: [],
      uuid: 'u6',
      session_id: 'abc',
    }),
  );
  const s = hub.getSession(id)!;
  assert.equal(s.status, 'error');
  assert.equal(s.activity, 'error');
  assert.match(hub.sessionEvents(id).at(-1)!.text, /nombre maximal de tours/);
});
