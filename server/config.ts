import { existsSync, statSync } from 'node:fs';
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
  return {
    host: env.HOST ?? '127.0.0.1',
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
  };
}

export function isLoopback(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
}
