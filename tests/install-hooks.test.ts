import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const SCRIPT = path.resolve('scripts/install-hooks.mjs');

type Hook = { type: string; command?: string; url?: string; timeout?: number; async?: boolean };
type Settings = { hooks?: Record<string, Array<{ matcher?: string; hooks: Hook[] }>>; [k: string]: unknown };

function sandbox() {
  const dir = mkdtempSync(path.join(tmpdir(), 'pixel-install-'));
  const env = { ...process.env, CODEX_HOME: path.join(dir, 'codex'), CLAUDE_CONFIG_DIR: path.join(dir, 'claude') };
  const run = (...args: string[]) => execFileSync(process.execPath, [SCRIPT, ...args], { env, encoding: 'utf8' });
  const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Settings;
  return { dir, env, run, read, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const ours = (s: Settings, event: string) => (s.hooks?.[event] ?? []).flatMap((g) => g.hooks).filter((h) => /pixel-hook\.mjs|\/api\/hooks/.test(h.command ?? h.url ?? ''));

test('Codex : hooks installés dans $CODEX_HOME/hooks.json, décisions synchrones, hooks existants préservés', () => {
  const { dir, run, read, cleanup } = sandbox();
  try {
    const file = path.join(dir, 'codex', 'hooks.json');
    mkdirSync(path.dirname(file), { recursive: true });
    const mine = { type: 'command', command: 'say fini' };
    writeFileSync(file, JSON.stringify({ hooks: { Stop: [{ hooks: [mine] }] } }));

    const out = run('--codex', '--url', 'http://192.168.1.20:7495', '--token', 'jeton secret');
    assert.match(out, /Hooks Codex installés/);
    assert.match(out, /trust|valider/i, 'rappel : Codex demande de valider les hooks');
    const s = read(file);
    for (const event of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop', 'SessionEnd']) {
      assert.equal(ours(s, event).length, 1, event);
    }
    const stop = ours(s, 'Stop')[0]!;
    assert.equal(stop.async, undefined, 'Stop attend la décision du dashboard');
    assert.equal(stop.timeout, 3600);
    assert.match(stop.command!, /--agent codex/);
    assert.match(stop.command!, /--url http:\/\/192\.168\.1\.20:7495\/api\/hooks/);
    assert.match(stop.command!, /--token "jeton secret"/);
    const pre = ours(s, 'PreToolUse')[0]!;
    assert.equal(pre.async, true, 'les événements ordinaires ne bloquent pas Codex');
    for (const event of ['SessionEnd', 'Interrupt']) assert.equal(ours(s, event)[0]!.timeout, 3, `${event} : 3 s au plus chez Codex`);
    assert.equal(s.hooks!.PreToolUse![0]!.matcher, '*');
    assert.deepEqual(s.hooks!.Stop![0]!.hooks, [mine], 'ton hook Stop est conservé');
    assert.ok(readdirSync(path.dirname(file)).some((f) => f.startsWith('hooks.json.bak-')), 'sauvegarde créée');

    run('--codex');
    assert.equal(ours(read(file), 'Stop').length, 1, 'réinstaller ne duplique pas');

    run('--codex', '--uninstall');
    const after = read(file);
    assert.equal(ours(after, 'Stop').length, 0);
    assert.deepEqual(after.hooks, { Stop: [{ hooks: [mine] }] });
  } finally {
    cleanup();
  }
});

test('Claude Code : settings.json, hooks HTTP natifs possibles, Codex refuse le mode HTTP', () => {
  const { dir, env, run, read, cleanup } = sandbox();
  try {
    run();
    const file = path.join(dir, 'claude', 'settings.json');
    const s = read(file);
    assert.match(ours(s, 'PermissionRequest')[0]!.command!, /--agent claude/);
    assert.ok(ours(s, 'SubagentStart').length, 'événements récents inclus');

    run('--mode', 'http', '--token', 'abc');
    const http = read(file);
    const decide = ours(http, 'PermissionRequest');
    assert.equal(decide.length, 1, 'les hooks « command » ont été remplacés');
    assert.equal(decide[0]!.type, 'http');
    assert.match(decide[0]!.url!, /\/api\/hooks\/decide\?sync=1$/);
    assert.match(ours(http, 'PreToolUse')[0]!.url!, /\/api\/hooks$/);

    const refused = spawnSync(process.execPath, [SCRIPT, '--codex', '--mode', 'http'], { env, encoding: 'utf8' });
    assert.equal(refused.status, 1);
    assert.equal(existsSync(path.join(dir, 'codex', 'hooks.json')), false);
  } finally {
    cleanup();
  }
});
