import {
  query,
  type CanUseTool,
  type McpServerConfig,
  type Options,
  type PermissionMode,
  type Query,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { Hub } from '../../shared/hub';
import { applySdkMessage, type MapperCallbacks } from './mapper';
import { AsyncQueue } from './queue';

export interface ManagedSessionConfig {
  hubId: string;
  cwd: string;
  model?: string;
  permissionMode: PermissionMode;
  /** Instructions ajoutées au prompt système Claude Code. */
  systemPromptAppend?: string;
  tools?: string[];
  allowedTools?: string[];
  disallowedTools?: string[];
  mcpServers?: Record<string, McpServerConfig>;
  resume?: string;
  maxBudgetUsd?: number;
  canUseTool: CanUseTool;
  callbacks?: MapperCallbacks;
  debug?: boolean;
  /** Appelé quand le processus Claude Code s'arrête (normalement ou non). */
  onExit?: (error?: unknown) => void;
}

/**
 * Une session Claude Code pilotée par le dashboard via le Claude Agent SDK, en
 * mode « streaming input » : la session reste ouverte et accepte de nouveaux
 * messages tant qu'on ne l'arrête pas.
 */
export class ManagedSession {
  private input = new AsyncQueue<SDKUserMessage>();
  private q: Query | null = null;
  private abort = new AbortController();
  private stopped = false;
  private turnActive = false;

  constructor(
    private hub: Hub,
    readonly cfg: ManagedSessionConfig,
  ) {}

  get alive(): boolean {
    return this.q !== null && !this.stopped;
  }

  /** Un tour est-il en cours (l'agent travaille) ? */
  get busy(): boolean {
    return this.turnActive;
  }

  start(initialPrompt?: string): void {
    if (this.q) return;
    const { cfg } = this;
    const options: Options = {
      cwd: cfg.cwd,
      permissionMode: cfg.permissionMode,
      abortController: this.abort,
      canUseTool: cfg.canUseTool,
      systemPrompt: { type: 'preset', preset: 'claude_code', ...(cfg.systemPromptAppend ? { append: cfg.systemPromptAppend } : {}) },
      // PIXEL_MANAGED permet aux hooks du dashboard d'ignorer cette session (pas de doublon).
      env: { ...process.env, PIXEL_MANAGED: '1', CLAUDE_AGENT_SDK_CLIENT_APP: 'pixel-ai-dashboard/0.1.0' },
      ...(cfg.model ? { model: cfg.model } : {}),
      ...(cfg.tools ? { tools: cfg.tools } : {}),
      ...(cfg.allowedTools ? { allowedTools: cfg.allowedTools } : {}),
      ...(cfg.disallowedTools ? { disallowedTools: cfg.disallowedTools } : {}),
      ...(cfg.mcpServers ? { mcpServers: cfg.mcpServers } : {}),
      ...(cfg.resume ? { resume: cfg.resume } : {}),
      ...(cfg.maxBudgetUsd ? { maxBudgetUsd: cfg.maxBudgetUsd } : {}),
      ...(cfg.permissionMode === 'bypassPermissions' ? { allowDangerouslySkipPermissions: true } : {}),
      ...(cfg.debug ? { stderr: (data: string) => process.stderr.write(`[claude:${cfg.hubId}] ${data}`) } : {}),
    };
    this.q = query({ prompt: this.input, options });
    void this.pump();
    if (initialPrompt) this.send(initialPrompt);
  }

  /** Envoie un message utilisateur (mis en file si un tour est déjà en cours). */
  send(text: string): boolean {
    if (this.stopped || !this.q) return false;
    const queued = this.turnActive;
    this.turnActive = true;
    this.input.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null });
    const s = this.hub.getSession(this.cfg.hubId);
    if (s && s.status !== 'waiting' && !queued) {
      this.hub.updateSession(this.cfg.hubId, { status: 'working', activity: 'thinking', activityLabel: 'Réfléchit' });
    }
    return true;
  }

  async interrupt(): Promise<void> {
    if (!this.q || this.stopped) return;
    try {
      await this.q.interrupt();
    } catch (err) {
      console.warn(`[session ${this.cfg.hubId}] interrupt a échoué`, err);
    }
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.input.close();
    try {
      this.q?.close();
    } catch {
      /* déjà fermé */
    }
    this.abort.abort();
  }

  private async pump(): Promise<void> {
    let failure: unknown;
    try {
      for await (const msg of this.q!) {
        // queued_turn_count > 0 : d'autres messages déjà envoyés vont lancer un nouveau tour.
        if (msg.type === 'result') this.turnActive = (msg.queued_turn_count ?? 0) > 0;
        applySdkMessage(this.hub, this.cfg.hubId, msg, this.cfg.callbacks);
      }
    } catch (err) {
      if (!this.stopped) failure = err;
    } finally {
      this.stopped = true;
      this.turnActive = false;
      this.cfg.onExit?.(failure);
    }
  }
}
