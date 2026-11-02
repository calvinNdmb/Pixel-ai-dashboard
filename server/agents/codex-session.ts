import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Hub } from '../../shared/hub';
import { truncate } from '../../shared/util';
import { applyCodexEvent, type CodexTurnState } from './codex-mapper';
import type { CodexClient, CodexModule, CodexSandboxMode, CodexThread, CodexThreadOptions } from './codex-types';
import type { MapperCallbacks } from './mapper';

/** Charge le SDK Codex s'il est installé (`npm install @openai/codex-sdk`). */
export async function loadCodexModule(): Promise<CodexModule | null> {
  const name = '@openai/codex-sdk';
  try {
    const mod = (await import(/* @vite-ignore */ name)) as Partial<CodexModule>;
    return typeof mod.Codex === 'function' ? (mod as CodexModule) : null;
  } catch {
    return null;
  }
}

/** Cherche un exécutable dans le PATH (ex. le `codex` déjà installé). */
export function findInPath(command: string, env = process.env): string | undefined {
  const dirs = (env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const exts = process.platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, command + ext.toLowerCase());
      try {
        if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
      } catch {
        /* dossier illisible */
      }
    }
  }
  return undefined;
}

function cleanEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (typeof v === 'string') out[k] = v;
  return out;
}

export interface CodexSessionConfig {
  hubId: string;
  cwd: string;
  model?: string;
  sandboxMode: CodexSandboxMode;
  networkAccess?: boolean;
  skipGitRepoCheck?: boolean;
  /** Binaire `codex` à utiliser (sinon celui fourni par le SDK, puis celui du PATH). */
  codexPath?: string;
  resume?: string;
  callbacks?: MapperCallbacks;
  onExit?: (error?: unknown) => void;
}

/**
 * Un agent Codex piloté par le dashboard via le SDK Codex. Chaque message
 * lance un tour (`codex exec`) sur le même fil de conversation ; les messages
 * envoyés pendant un tour sont traités ensuite, dans l'ordre.
 *
 * Codex travaille dans un bac à sable (lecture seule ou dossier de travail) :
 * en mode piloté, il ne pose pas de questions d'autorisation.
 */
export class CodexSession {
  private client: CodexClient | null = null;
  private thread: CodexThread | null = null;
  private queue: string[] = [];
  private abort: AbortController | null = null;
  private running = false;
  private stopped = false;
  private exited = false;
  private readonly state: CodexTurnState = {};

  constructor(
    private hub: Hub,
    private mod: CodexModule,
    readonly cfg: CodexSessionConfig,
  ) {}

  get alive(): boolean {
    return this.thread !== null && !this.stopped;
  }

  get busy(): boolean {
    return this.running || this.queue.length > 0;
  }

  private createClient(): CodexClient {
    const env = cleanEnv({ ...process.env, PIXEL_MANAGED: '1' });
    const override = this.cfg.codexPath;
    if (override) return new this.mod.Codex({ codexPathOverride: override, env });
    try {
      return new this.mod.Codex({ env });
    } catch (err) {
      // SDK installé sans son binaire : on se rabat sur le `codex` déjà installé.
      const fromPath = findInPath('codex');
      if (!fromPath) throw err;
      return new this.mod.Codex({ codexPathOverride: fromPath, env });
    }
  }

  start(initialPrompt?: string): void {
    if (this.thread) return;
    this.client = this.createClient();
    const options: CodexThreadOptions = {
      workingDirectory: this.cfg.cwd,
      sandboxMode: this.cfg.sandboxMode,
      approvalPolicy: 'never',
      ...(this.cfg.model ? { model: this.cfg.model } : {}),
      ...(this.cfg.skipGitRepoCheck ? { skipGitRepoCheck: true } : {}),
      ...(this.cfg.networkAccess && this.cfg.sandboxMode === 'workspace-write' ? { networkAccessEnabled: true } : {}),
    };
    this.thread = this.cfg.resume ? this.client.resumeThread(this.cfg.resume, options) : this.client.startThread(options);
    if (this.cfg.resume) this.hub.updateSession(this.cfg.hubId, { agentSessionId: this.cfg.resume });
    if (initialPrompt) this.send(initialPrompt);
  }

  send(text: string): boolean {
    if (this.stopped || !this.thread) return false;
    this.queue.push(text);
    if (!this.running) void this.drain();
    return true;
  }

  private async drain(): Promise<void> {
    this.running = true;
    const id = this.cfg.hubId;
    while (this.queue.length && !this.stopped && this.thread) {
      const text = this.queue.shift()!;
      const abort = new AbortController();
      this.abort = abort;
      this.hub.updateSession(id, { status: 'working', activity: 'thinking', activityLabel: 'Réfléchit' });
      try {
        const { events } = await this.thread.runStreamed(text, { signal: abort.signal });
        for await (const ev of events) applyCodexEvent(this.hub, id, ev, this.state, this.cfg.callbacks);
      } catch (err) {
        if (abort.signal.aborted) {
          if (!this.stopped) {
            this.hub.updateSession(id, { status: 'idle', activity: 'idle', activityLabel: 'Interrompu', currentTool: undefined });
            this.hub.addEvent(id, 'system', 'Tour interrompu');
          }
        } else {
          const message = err instanceof Error ? err.message : String(err);
          this.hub.updateSession(id, { status: 'error', activity: 'error', activityLabel: truncate(`Codex : ${message}`, 80), currentTool: undefined });
          this.hub.addEvent(id, 'error', `Codex : ${truncate(message, 500)}`, { isError: true });
          this.cfg.callbacks?.onTurnResult?.({ success: false, text: '', costUsd: 0, errors: [message] });
        }
      } finally {
        if (this.abort === abort) this.abort = null;
      }
    }
    this.running = false;
    if (this.stopped) this.exit();
  }

  async interrupt(): Promise<void> {
    this.queue = [];
    this.abort?.abort();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.queue = [];
    this.abort?.abort();
    if (!this.running) this.exit();
  }

  private exit(error?: unknown): void {
    if (this.exited) return;
    this.exited = true;
    this.cfg.onExit?.(error);
  }
}
