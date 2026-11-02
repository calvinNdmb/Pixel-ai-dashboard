import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import type { Hub } from '../../shared/hub';
import type { PermissionModeChoice, SessionInfo, SpawnWorkerRequest } from '../../shared/types';
import { pickName, truncate } from '../../shared/util';
import type { Config } from '../config';
import type { TurnResult } from './mapper';
import type { PermissionBroker } from './permissions';
import { ManagedSession } from './session';

export interface WorkerEvents {
  onTurnResult?(session: SessionInfo, result: TurnResult): void;
  onExit?(session: SessionInfo, error?: unknown): void;
}

export class PoolError extends Error {}

/**
 * Si les hooks du dashboard sont installés sans le filtre PIXEL_MANAGED, une
 * session pilotée peut aussi apparaître comme session « terminal » : on retire
 * ce doublon dès que l'on connaît son identifiant.
 */
export function removeHookDuplicates(hub: Hub, keepId: string, claudeSessionId: string): void {
  for (const s of hub.listSessions()) {
    if (s.id !== keepId && s.source === 'hook' && s.claudeSessionId === claudeSessionId) hub.removeSession(s.id);
  }
}

function workerPrompt(name: string, parent: 'chef' | 'user'): string {
  return [
    `Tu es ${name}, un agent travailleur du « Pixel AI Dashboard », un QG où plusieurs sessions Claude Code collaborent.`,
    parent === 'chef'
      ? 'Ta mission t’a été confiée par « le Chef », l’agent coordinateur, qui rapporte ensuite à l’utilisateur.'
      : 'Ta mission t’a été confiée directement par l’utilisateur depuis le dashboard.',
    'Travaille de façon autonome. Si une information indispensable te manque, termine ton tour en posant une question claire : on te répondra.',
    'D’autres agents peuvent travailler en parallèle dans le même dépôt : ne touche qu’aux fichiers utiles à ta mission.',
    'Quand tu as terminé, conclus par un court résumé en français : ce que tu as fait, les fichiers modifiés, comment vérifier, et ce qui reste éventuellement à faire.',
  ].join('\n');
}

/** Gère les agents travailleurs (sessions Claude Code pilotées par le SDK). */
export class WorkerPool {
  private sessions = new Map<string, ManagedSession>();

  constructor(
    private hub: Hub,
    private broker: PermissionBroker,
    private cfg: Config,
    private events: WorkerEvents = {},
  ) {}

  get(hubId: string): ManagedSession | undefined {
    return this.sessions.get(hubId);
  }

  activeCount(): number {
    let n = 0;
    for (const s of this.sessions.values()) if (s.alive) n++;
    return n;
  }

  private resolveCwd(cwd?: string): string {
    const dir = cwd?.trim() ? path.resolve(this.cfg.defaultCwd, cwd.trim().replace(/^~(?=$|\/)/, process.env.HOME ?? '~')) : this.cfg.defaultCwd;
    if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new PoolError(`Dossier introuvable : ${dir}`);
    return dir;
  }

  private resolveMode(mode?: PermissionModeChoice): PermissionMode {
    const m = mode ?? this.cfg.defaultPermissionMode;
    if (m === 'bypassPermissions' && !this.cfg.allowBypass) {
      throw new PoolError('Le mode bypassPermissions est désactivé (lance le serveur avec ALLOW_BYPASS=1 pour l’autoriser).');
    }
    return m;
  }

  spawn(req: SpawnWorkerRequest & { parentId?: string }): SessionInfo {
    const task = req.task?.trim();
    if (!task) throw new PoolError('La mission est vide.');
    if (this.activeCount() >= this.cfg.maxWorkers) {
      throw new PoolError(`Limite atteinte : ${this.cfg.maxWorkers} agents actifs maximum (MAX_WORKERS).`);
    }
    const cwd = this.resolveCwd(req.cwd);
    const permissionMode = this.resolveMode(req.permissionMode);
    const name = req.name?.trim().slice(0, 24) || pickName(this.hub.listSessions().map((s) => s.name));
    const info = this.hub.createSession({
      name,
      role: 'worker',
      source: 'sdk',
      status: 'starting',
      activity: 'thinking',
      activityLabel: 'Arrive au QG',
      task,
      cwd,
      permissionMode,
      controllable: true,
      supervised: req.supervised ?? true,
      model: req.model || this.cfg.workerModel,
      ...(req.parentId ? { parentId: req.parentId } : {}),
    });
    this.hub.addEvent(info.id, 'prompt', task);
    this.launch(info, permissionMode, req.model || this.cfg.workerModel, task);
    return this.hub.getSession(info.id)!;
  }

  private launch(info: SessionInfo, permissionMode: PermissionMode, model: string | undefined, prompt?: string, resume?: string): void {
    const session = new ManagedSession(this.hub, {
      hubId: info.id,
      cwd: info.cwd ?? this.cfg.defaultCwd,
      model,
      permissionMode,
      systemPromptAppend: workerPrompt(info.name, info.parentId === 'chef' ? 'chef' : 'user'),
      // Pas de questions interactives : l'agent pose ses questions en fin de tour.
      disallowedTools: ['AskUserQuestion'],
      canUseTool: this.broker.forSession(info.id),
      maxBudgetUsd: this.cfg.maxBudgetUsd,
      debug: this.cfg.debug,
      ...(resume ? { resume } : {}),
      callbacks: {
        onInit: (claudeSessionId) => removeHookDuplicates(this.hub, info.id, claudeSessionId),
        onTurnResult: (result) => {
          const s = this.hub.getSession(info.id);
          if (s) this.events.onTurnResult?.(s, result);
        },
      },
      onExit: (error) => {
        if (this.sessions.get(info.id) === session) this.sessions.delete(info.id);
        this.broker.cancelSession(info.id, 'Session terminée');
        const s = this.hub.getSession(info.id);
        if (!s) return;
        const message = error instanceof Error ? error.message : error ? String(error) : '';
        this.hub.updateSession(info.id, {
          status: error ? 'error' : 'ended',
          activity: error ? 'error' : 'leaving',
          activityLabel: error ? truncate(`Plantage : ${message}`, 80) : 'Session terminée',
          currentTool: undefined,
          pending: undefined,
          resumable: Boolean(s.claudeSessionId),
        });
        this.hub.addEvent(info.id, error ? 'error' : 'system', error ? `Session interrompue : ${message}` : 'Session terminée', {
          isError: Boolean(error),
        });
        this.events.onExit?.(this.hub.getSession(info.id)!, error);
      },
    });
    this.sessions.set(info.id, session);
    try {
      session.start(prompt);
    } catch (err) {
      this.sessions.delete(info.id);
      const message = err instanceof Error ? err.message : String(err);
      this.hub.updateSession(info.id, { status: 'error', activity: 'error', activityLabel: 'Démarrage impossible' });
      this.hub.addEvent(info.id, 'error', `Impossible de démarrer la session : ${message}`, { isError: true });
      throw new PoolError(message);
    }
  }

  send(hubId: string, text: string): { queued: boolean } {
    const session = this.sessions.get(hubId);
    if (!session || !session.alive) throw new PoolError('Cette session n’est plus active (utilise « Reprendre »).');
    const queued = session.busy;
    this.hub.addEvent(hubId, 'prompt', text);
    session.send(text);
    return { queued };
  }

  async interrupt(hubId: string): Promise<void> {
    const session = this.sessions.get(hubId);
    if (!session) throw new PoolError('Session introuvable ou déjà arrêtée.');
    this.broker.cancelSession(hubId, 'Demande annulée (interruption)');
    await session.interrupt();
    this.hub.addEvent(hubId, 'system', 'Interrompu');
  }

  stop(hubId: string): void {
    const session = this.sessions.get(hubId);
    this.broker.cancelSession(hubId, 'Demande annulée (arrêt)');
    if (!session) {
      const s = this.hub.getSession(hubId);
      if (s && s.status !== 'ended') {
        this.hub.updateSession(hubId, { status: 'ended', activity: 'leaving', activityLabel: 'Session arrêtée', pending: undefined });
      }
      return;
    }
    session.stop();
  }

  resume(hubId: string): SessionInfo {
    const s = this.hub.getSession(hubId);
    if (!s || s.source !== 'sdk' || s.role !== 'worker') throw new PoolError('Session introuvable.');
    if (this.sessions.get(hubId)?.alive) return s;
    if (!s.claudeSessionId) throw new PoolError('Impossible de reprendre : identifiant de session Claude inconnu.');
    if (this.activeCount() >= this.cfg.maxWorkers) throw new PoolError(`Limite atteinte : ${this.cfg.maxWorkers} agents actifs.`);
    const mode = this.resolveMode((s.permissionMode as PermissionModeChoice | undefined) ?? undefined);
    this.hub.updateSession(hubId, { status: 'idle', activity: 'idle', activityLabel: 'De retour au QG', resumable: false });
    this.hub.addEvent(hubId, 'system', 'Session reprise');
    this.launch(s, mode, s.model, undefined, s.claudeSessionId);
    return this.hub.getSession(hubId)!;
  }

  isManagedClaudeSession(claudeSessionId: string): boolean {
    for (const [hubId, session] of this.sessions) {
      if (session.alive && this.hub.getSession(hubId)?.claudeSessionId === claudeSessionId) return true;
    }
    return false;
  }

  stopAll(): void {
    for (const s of this.sessions.values()) s.stop();
  }
}
