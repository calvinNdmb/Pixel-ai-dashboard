#!/usr/bin/env node
// Installe (ou retire) les hooks qui envoient l'activité de tes sessions
// Claude Code et Codex au Pixel AI Dashboard.
//
//   npm run hooks:install                          → Claude Code, toutes tes sessions (~/.claude/settings.json)
//   npm run hooks:install -- --codex               → Codex (~/.codex/hooks.json)
//   npm run hooks:install -- --project ~/code/app  → Claude Code, un seul projet (.claude/settings.local.json)
//   npm run hooks:install -- --url https://qg.example.com --token XXX
//                                                  → sessions d'une autre machine vers un dashboard distant
//   npm run hooks:install -- --mode http           → hooks HTTP natifs de Claude Code (pas de processus Node)
//   npm run hooks:install -- --minimal             → seulement les événements historiques (Claude Code ancien)
//   npm run hooks:install -- --dry-run             → affiche le résultat sans écrire
//   npm run hooks:uninstall [-- --codex]           → retire les hooks du dashboard
//
// Un fichier de sauvegarde est créé avant toute modification.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK_SCRIPT = path.join(ROOT, 'hooks', 'pixel-hook.mjs');
const MARKER_HEADER = 'X-Pixel-Dashboard';

/** Événements qui attendent une décision (mode télécommande) : hooks synchrones, délai long. */
const DECISION_EVENTS = new Set(['PermissionRequest', 'Stop']);
const DECISION_TIMEOUT_S = 3600;
const TOOL_EVENTS = new Set(['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'PermissionDenied']);

const CLAUDE_BASE = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SubagentStop', 'PreCompact'];
const CLAUDE_EXTRA = ['PermissionRequest', 'PostToolUseFailure', 'PermissionDenied', 'StopFailure', 'SubagentStart'];
const CODEX_EVENTS = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop', 'SubagentStart', 'SubagentStop', 'PreCompact', 'Interrupt'];

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};

const codex = has('--codex');
const uninstall = has('--uninstall');
const dryRun = has('--dry-run');
const mode = val('--mode') ?? 'command';
const port = process.env.PORT ?? '7495';
const baseUrl = (val('--url') ?? `http://127.0.0.1:${port}`).replace(/\/+$/, '');
const hookUrl = `${baseUrl}/api/hooks`;
const token = val('--token') ?? process.env.PIXEL_TOKEN;
const project = val('--project');
const events = codex ? CODEX_EVENTS : has('--minimal') ? CLAUDE_BASE : [...CLAUDE_BASE, ...CLAUDE_EXTRA];

if (!['command', 'http'].includes(mode)) {
  console.error(`--mode doit valoir "command" ou "http" (reçu : ${mode})`);
  process.exit(1);
}
if (codex && mode === 'http') {
  console.error('Codex ne prend en charge que les hooks de type "command" : retire --mode http.');
  process.exit(1);
}

const expand = (p) => path.resolve(p.replace(/^~(?=$|\/)/, homedir()));
const codexHome = process.env.CODEX_HOME ? expand(process.env.CODEX_HOME) : path.join(homedir(), '.codex');
const claudeHome = process.env.CLAUDE_CONFIG_DIR ? expand(process.env.CLAUDE_CONFIG_DIR) : path.join(homedir(), '.claude');
const target = codex
  ? path.join(project ? path.join(expand(project), '.codex') : codexHome, 'hooks.json')
  : project
    ? path.join(expand(project), '.claude', 'settings.local.json')
    : path.join(claudeHome, 'settings.json');

function isOurs(hook) {
  if (!hook || typeof hook !== 'object') return false;
  if (hook.type === 'command' && typeof hook.command === 'string') return hook.command.includes('pixel-hook.mjs');
  if (hook.type === 'http') return Boolean(hook.headers && hook.headers[MARKER_HEADER]);
  return false;
}

function ourHook(event) {
  const decision = DECISION_EVENTS.has(event);
  if (mode === 'http') {
    return {
      type: 'http',
      // L'appel « sync » attend la décision du dashboard dans la même requête.
      url: decision ? `${hookUrl}/decide?sync=1` : hookUrl,
      timeout: decision ? DECISION_TIMEOUT_S : 2,
      headers: {
        [MARKER_HEADER]: '1',
        'X-Pixel-Managed': '$PIXEL_MANAGED',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      allowedEnvVars: ['PIXEL_MANAGED'],
    };
  }
  const q = (s) => (/[\s"']/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
  const parts = ['node', q(HOOK_SCRIPT), '--url', q(hookUrl), '--agent', codex ? 'codex' : 'claude', ...(token ? ['--token', q(token)] : [])];
  if (decision) return { type: 'command', command: parts.join(' '), timeout: DECISION_TIMEOUT_S };
  // Codex limite SessionEnd et Interrupt à 3 s (SessionEnd s'exécute toujours de façon synchrone).
  if (codex && event === 'SessionEnd') return { type: 'command', command: parts.join(' '), timeout: 3 };
  if (codex && event === 'Interrupt') return { type: 'command', command: parts.join(' '), timeout: 3, async: true };
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
    const group = { ...(TOOL_EVENTS.has(event) ? { matcher: '*' } : {}), hooks: [ourHook(event)] };
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

const tool = codex ? 'Codex' : 'Claude Code';
if (uninstall) {
  console.log(`✔ ${removed} hook(s) du dashboard retiré(s) de ${target}`);
} else {
  console.log(`✔ Hooks ${tool} installés (${mode}, ${events.length} événements) dans ${target}`);
  console.log(`  → les sessions ${tool} apparaîtront dans le QG tant que le serveur écoute sur ${baseUrl}`);
  if (removed) console.log(`  (${removed} ancien(s) hook(s) du dashboard remplacé(s))`);
  console.log('  Les sessions déjà ouvertes doivent être relancées pour prendre en compte les hooks.');
  if (codex) {
    console.log('  ⚠ Codex demande de valider (« trust ») les nouveaux hooks avant de les exécuter :');
    console.log('    ouvre Codex et accepte-les (commande /hooks), sinon ils restent inactifs.');
  }
}
