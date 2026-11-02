#!/usr/bin/env node
// Installe (ou retire) les hooks qui envoient l'activité de tes sessions
// Claude Code au Pixel AI Dashboard.
//
//   npm run hooks:install                      → ~/.claude/settings.json (toutes tes sessions)
//   npm run hooks:install -- --project ~/code/mon-app   → mon-app/.claude/settings.local.json
//   npm run hooks:install -- --mode http       → hooks HTTP natifs (pas de processus Node)
//   npm run hooks:install -- --minimal         → seulement les événements historiques
//   npm run hooks:install -- --dry-run         → affiche le résultat sans écrire
//   npm run hooks:uninstall                    → retire les hooks du dashboard
//
// Un fichier de sauvegarde est créé avant toute modification.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK_SCRIPT = path.join(ROOT, 'hooks', 'pixel-hook.mjs');
const MARKER_HEADER = 'X-Pixel-Dashboard';

const TOOL_EVENTS = new Set(['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'PermissionDenied']);
const BASE_EVENTS = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SubagentStop', 'PreCompact'];
const EXTRA_EVENTS = ['PermissionRequest', 'PostToolUseFailure', 'PermissionDenied', 'StopFailure', 'SubagentStart'];

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};

const uninstall = has('--uninstall');
const dryRun = has('--dry-run');
const mode = val('--mode') ?? 'command';
const port = process.env.PORT ?? '7495';
const baseUrl = (val('--url') ?? `http://127.0.0.1:${port}`).replace(/\/+$/, '');
const hookUrl = `${baseUrl}/api/hooks`;
const token = val('--token') ?? process.env.PIXEL_TOKEN;
const project = val('--project');
const events = has('--minimal') ? BASE_EVENTS : [...BASE_EVENTS, ...EXTRA_EVENTS];

if (!['command', 'http'].includes(mode)) {
  console.error(`--mode doit valoir "command" ou "http" (reçu : ${mode})`);
  process.exit(1);
}

const expand = (p) => path.resolve(p.replace(/^~(?=$|\/)/, homedir()));
const target = project ? path.join(expand(project), '.claude', 'settings.local.json') : path.join(homedir(), '.claude', 'settings.json');

function isOurs(hook) {
  if (!hook || typeof hook !== 'object') return false;
  if (hook.type === 'command' && typeof hook.command === 'string') return hook.command.includes('pixel-hook.mjs');
  if (hook.type === 'http') return Boolean(hook.headers && hook.headers[MARKER_HEADER]);
  return false;
}

function ourHook() {
  if (mode === 'http') {
    return {
      type: 'http',
      url: hookUrl,
      timeout: 2,
      headers: {
        [MARKER_HEADER]: '1',
        'X-Pixel-Managed': '$PIXEL_MANAGED',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      allowedEnvVars: ['PIXEL_MANAGED'],
    };
  }
  const q = (s) => (/[\s"']/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
  const parts = ['node', q(HOOK_SCRIPT), '--url', q(hookUrl), ...(token ? ['--token', q(token)] : [])];
  return { type: 'command', command: parts.join(' '), timeout: 5, async: true };
}

let settings = {};
if (existsSync(target)) {
  try {
    settings = JSON.parse(readFileSync(target, 'utf8'));
  } catch (err) {
    console.error(`✖ ${target} n'est pas un JSON valide : je ne le modifie pas.\n  ${err.message}`);
    process.exit(1);
  }
}
if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
  console.error(`✖ Contenu inattendu dans ${target}`);
  process.exit(1);
}

const hooks = typeof settings.hooks === 'object' && settings.hooks !== null ? settings.hooks : {};
let removed = 0;
for (const [event, groups] of Object.entries(hooks)) {
  if (!Array.isArray(groups)) continue;
  const kept = [];
  for (const group of groups) {
    if (!group || !Array.isArray(group.hooks)) {
      kept.push(group);
      continue;
    }
    const remaining = group.hooks.filter((h) => !isOurs(h));
    removed += group.hooks.length - remaining.length;
    if (remaining.length) kept.push({ ...group, hooks: remaining });
  }
  if (kept.length) hooks[event] = kept;
  else delete hooks[event];
}

if (!uninstall) {
  for (const event of events) {
    const group = { ...(TOOL_EVENTS.has(event) ? { matcher: '*' } : {}), hooks: [ourHook()] };
    hooks[event] = [...(hooks[event] ?? []), group];
  }
}

if (Object.keys(hooks).length) settings.hooks = hooks;
else delete settings.hooks;

const output = `${JSON.stringify(settings, null, 2)}\n`;
if (dryRun) {
  console.log(`# ${target}\n${output}`);
  process.exit(0);
}

mkdirSync(path.dirname(target), { recursive: true });
if (existsSync(target)) {
  const backup = `${target}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  copyFileSync(target, backup);
  console.log(`  sauvegarde : ${backup}`);
}
writeFileSync(target, output);

if (uninstall) {
  console.log(`✔ ${removed} hook(s) du dashboard retiré(s) de ${target}`);
} else {
  console.log(`✔ Hooks Pixel AI Dashboard installés (${mode}, ${events.length} événements) dans ${target}`);
  console.log(`  → les sessions Claude Code apparaîtront dans le QG tant que le serveur écoute sur ${baseUrl}`);
  if (removed) console.log(`  (${removed} ancien(s) hook(s) du dashboard remplacé(s))`);
  console.log('  Les sessions déjà ouvertes doivent être relancées pour prendre en compte les hooks.');
}
