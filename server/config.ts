import { existsSync, statSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import path from 'node:path';
import type { PermissionModeChoice } from '../shared/types';

const MODES: PermissionModeChoice[] = ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'];

function bool(v: string | undefined): boolean {
  return v === '1' || v?.toLowerCase() === 'true' || v?.toLowerCase() === 'yes';
}

function resolveDir(p: string | undefined, fallback: string): string {
  if (!p) return fallback;
  const abs = path.resolve(p.replace(/^~(?=$|\/)/, process.env.HOME ?? '~'));
  return abs;
}

export interface Config {
  host: string;
  port: number;
  demo: boolean;
  /** Le SDK peut être désactivé : le dashboard ne fait alors qu'observer (hooks). */
  sdkEnabled: boolean;
  token?: string;
  allowedHosts: string[];
  defaultCwd: string;
  maxWorkers: number;
  defaultPermissionMode: PermissionModeChoice;
  allowBypass: boolean;
  managerModel?: string;
  workerModel?: string;
  /** Budget max (USD) par session SDK, optionnel. */
  maxBudgetUsd?: number;
  dataDir: string;
  persist: boolean;
  debug: boolean;
  /** Nom de cette machine (affiché sur les sessions des autres machines). */
  hostName: string;
  // --- Codex
  codexModel?: string;
  codexPath?: string;
  codexNetwork: boolean;
  codexSkipGitCheck: boolean;
  // --- accès à distance
  /** `npm run remote` : écoute sur le réseau avec un jeton généré si besoin. */
  remote: boolean;
  /** URL publique du dashboard (tunnel, Tailscale…), pour les liens des notifications et le QR code. */
  publicUrl?: string;
  remotePermissionWaitMs: number;
  remoteStopWaitMs: number;
  /** Mode télécommande actif au démarrage. */
  remoteModeAtStart: boolean;
  // --- notifications
  ntfyUrl?: string;
  ntfyToken?: string;
  webhookUrl?: string;
  // --- lecture des transcripts
  watchTranscripts: boolean;
  claudeDir: string;
  codexDir: string;
}

export function loadConfig(env = process.env): Config {
  const defaultCwd = resolveDir(env.WORKSPACE ?? env.DEFAULT_CWD, process.cwd());
  if (!existsSync(defaultCwd) || !statSync(defaultCwd).isDirectory()) {
    throw new Error(`WORKSPACE invalide : ${defaultCwd} n'est pas un dossier`);
  }
  const mode = (env.DEFAULT_PERMISSION_MODE ?? 'default') as PermissionModeChoice;
  const allowBypass = bool(env.ALLOW_BYPASS);
  if (!MODES.includes(mode)) throw new Error(`DEFAULT_PERMISSION_MODE invalide : ${mode}`);
  if (mode === 'bypassPermissions' && !allowBypass) {
    throw new Error('DEFAULT_PERMISSION_MODE=bypassPermissions exige aussi ALLOW_BYPASS=1');
  }
  const budget = env.MAX_BUDGET_USD ? Number(env.MAX_BUDGET_USD) : undefined;
  const remote = bool(env.REMOTE);
  const seconds = (v: string | undefined, fallback: number) => {
    const n = Number(v);
    return (Number.isFinite(n) && n > 0 ? n : fallback) * 1000;
  };
  return {
    host: env.HOST ?? (remote ? '0.0.0.0' : '127.0.0.1'),
    port: Number(env.PORT ?? 7495),
    demo: bool(env.DEMO),
    sdkEnabled: !bool(env.DISABLE_SDK),
    token: env.PIXEL_TOKEN || undefined,
    allowedHosts: (env.ALLOWED_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
    defaultCwd,
    maxWorkers: Math.max(1, Number(env.MAX_WORKERS ?? 6)),
    defaultPermissionMode: mode,
    allowBypass,
    managerModel: env.MANAGER_MODEL || undefined,
    workerModel: env.WORKER_MODEL || undefined,
    maxBudgetUsd: budget && budget > 0 ? budget : undefined,
    dataDir: resolveDir(env.DATA_DIR, path.resolve('data')),
    persist: !bool(env.NO_PERSIST),
    debug: bool(env.DEBUG),
    hostName: env.PIXEL_HOSTNAME || hostname(),
    codexModel: env.CODEX_MODEL || undefined,
    codexPath: env.CODEX_PATH || undefined,
    codexNetwork: bool(env.CODEX_NETWORK),
    codexSkipGitCheck: bool(env.CODEX_SKIP_GIT_CHECK),
    remote,
    publicUrl: env.PUBLIC_URL?.replace(/\/+$/, '') || undefined,
    remotePermissionWaitMs: seconds(env.REMOTE_PERMISSION_WAIT, 600),
    remoteStopWaitMs: seconds(env.REMOTE_STOP_WAIT, 1800),
    remoteModeAtStart: bool(env.REMOTE_MODE),
    ntfyUrl: env.NOTIFY_NTFY || undefined,
    ntfyToken: env.NOTIFY_NTFY_TOKEN || undefined,
    webhookUrl: env.NOTIFY_WEBHOOK || undefined,
    watchTranscripts: env.WATCH_TRANSCRIPTS !== '0' && env.WATCH_TRANSCRIPTS?.toLowerCase() !== 'false',
    claudeDir: resolveDir(env.CLAUDE_CONFIG_DIR, path.join(homedir(), '.claude')),
    codexDir: resolveDir(env.CODEX_HOME, path.join(homedir(), '.codex')),
  };
}

export function isLoopback(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
}
