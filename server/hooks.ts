import type { HookInput } from '@anthropic-ai/claude-agent-sdk';
import { activityForTool, describeTool, fileForTool } from '../shared/activity';
import type { Hub } from '../shared/hub';
import type { SessionInfo } from '../shared/types';
import { basename, safeJson, truncate, uid } from '../shared/util';

/** Durée après laquelle une session terminal silencieuse est considérée fermée. */
const STALE_MS = 3 * 60 * 60 * 1000;

type AnyRecord = Record<string, unknown>;

function isRecord(v: unknown): v is AnyRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Transforme les événements des hooks Claude Code (sessions lancées dans un
 * terminal, un IDE…) en personnages du QG. Lecture seule : ces sessions ne
 * peuvent pas être pilotées depuis le dashboard.
 */
export class HookIngestor {
  constructor(
    private hub: Hub,
    /** Vrai si ce session_id appartient à une session pilotée par le SDK. */
    private isManaged: (claudeSessionId: string) => boolean,
  ) {}

  handle(payload: unknown, opts: { managed?: boolean } = {}): { accepted: boolean; reason?: string } {
    if (!isRecord(payload)) return { accepted: false, reason: 'payload invalide' };
    const sid = payload.session_id;
    const event = payload.hook_event_name;
    if (typeof sid !== 'string' || !sid || typeof event !== 'string') {
      return { accepted: false, reason: 'session_id / hook_event_name manquant' };
    }
    if (opts.managed || this.isManaged(sid)) return { accepted: false, reason: 'session pilotée par le dashboard' };
    const input = payload as unknown as HookInput;

    let session = this.hub.findByClaudeSessionId(sid);
    if (session && session.source !== 'hook') return { accepted: false, reason: 'session pilotée par le dashboard' };
    if (!session) {
      if (event === 'SessionEnd') return { accepted: false, reason: 'session inconnue' };
      session = this.createExternal(sid, input);
    } else if (session.status === 'ended' && event !== 'SessionEnd') {
      session = this.hub.updateSession(session.id, { status: 'idle', activity: 'idle', activityLabel: 'De retour' }) ?? session;
    }
    this.apply(session, input);
    return { accepted: true };
  }

  private createExternal(sid: string, input: HookInput): SessionInfo {
    const cwd = input.cwd || '';
    const base = basename(cwd) || 'terminal';
    const taken = new Set(this.hub.listSessions().map((s) => s.name));
    let name = base;
    for (let i = 2; taken.has(name); i++) name = `${base} ${i}`;
    const session = this.hub.createSession({
      id: uid('h_'),
      name,
      role: 'external',
      source: 'hook',
      status: 'idle',
      activity: 'idle',
      activityLabel: 'Session terminal',
      cwd,
      claudeSessionId: sid,
      permissionMode: input.permission_mode,
      controllable: false,
      ...(input.hook_event_name === 'SessionStart' && input.model ? { model: input.model } : {}),
    });
    this.hub.addEvent(session.id, 'system', `Session Claude Code détectée (${cwd || 'dossier inconnu'})`);
    return session;
  }

  private apply(s: SessionInfo, input: HookInput): void {
    const id = s.id;
    const hub = this.hub;
    const base: Partial<SessionInfo> = {};
    if (input.permission_mode) base.permissionMode = input.permission_mode;
    // Toute activité après une demande d'autorisation signifie qu'elle a été traitée.
    if (s.pending && input.hook_event_name !== 'Notification' && input.hook_event_name !== 'PermissionRequest') {
      base.pending = undefined;
    }

    switch (input.hook_event_name) {
      case 'SessionStart': {
        hub.updateSession(id, {
          ...base,
          status: 'idle',
          activity: 'idle',
          activityLabel: input.source === 'resume' ? 'Session reprise' : 'Prêt',
          ...(input.model ? { model: input.model } : {}),
        });
        hub.addEvent(id, 'system', `Session démarrée (${input.source})`);
        break;
      }
      case 'UserPromptSubmit': {
        hub.updateSession(id, {
          ...base,
          status: 'working',
          activity: 'thinking',
          activityLabel: 'Réfléchit',
          task: s.task ?? truncate(input.prompt, 200),
          turns: s.turns + 1,
        });
        hub.addEvent(id, 'prompt', input.prompt);
        break;
      }
      case 'PreToolUse': {
        const toolInput = isRecord(input.tool_input) ? input.tool_input : undefined;
        const label = describeTool(input.tool_name, toolInput);
        hub.updateSession(id, {
          ...base,
          status: 'working',
          activity: activityForTool(input.tool_name),
          activityLabel: label,
          currentTool: input.tool_name,
          toolUses: s.toolUses + 1,
        });
        const file = fileForTool(input.tool_name, toolInput);
        if (file) hub.touchFile(id, file);
        hub.addEvent(id, 'tool', label, { tool: input.tool_name });
        break;
      }
      case 'PostToolUse': {
        hub.updateSession(id, { ...base, status: 'working', activity: 'thinking', activityLabel: 'Réfléchit', currentTool: undefined });
        break;
      }
      case 'PostToolUseFailure': {
        hub.updateSession(id, { ...base, activity: 'thinking', activityLabel: 'Réfléchit', currentTool: undefined });
        if (!input.is_interrupt) {
          hub.addEvent(id, 'error', `${input.tool_name} a échoué : ${truncate(input.error, 300)}`, {
            tool: input.tool_name,
            isError: true,
          });
        }
        break;
      }
      case 'PermissionRequest': {
        const toolInput = isRecord(input.tool_input) ? input.tool_input : undefined;
        const summary = describeTool(input.tool_name, toolInput);
        hub.updateSession(id, {
          ...base,
          status: 'waiting',
          activity: 'waiting',
          activityLabel: `Attend ta réponse dans le terminal : ${summary}`,
          pending: {
            id: uid('p_'),
            sessionId: id,
            toolName: input.tool_name,
            summary,
            detail: safeJson(input.tool_input, 800),
            canAlwaysAllow: false,
            createdAt: Date.now(),
          },
        });
        hub.addEvent(id, 'permission', `Demande d'autorisation (terminal) : ${summary}`, { tool: input.tool_name });
        break;
      }
      case 'PermissionDenied': {
        hub.updateSession(id, { ...base, activity: 'thinking', activityLabel: 'Réfléchit' });
        hub.addEvent(id, 'permission', `Refusé : ${describeTool(input.tool_name, isRecord(input.tool_input) ? input.tool_input : undefined)}`);
        break;
      }
      case 'Notification': {
        const type = input.notification_type ?? '';
        if (/permission/i.test(type)) {
          hub.updateSession(id, { ...base, status: 'waiting', activity: 'waiting', activityLabel: truncate(input.message, 80) });
        } else if (/idle/i.test(type)) {
          hub.updateSession(id, { ...base, status: 'idle', activity: 'idle', activityLabel: 'Attend ta prochaine demande' });
        }
        hub.addEvent(id, 'system', input.message);
        break;
      }
      case 'Stop': {
        hub.updateSession(id, {
          ...base,
          pending: undefined,
          status: 'idle',
          activity: 'done',
          activityLabel: 'Tour terminé',
          currentTool: undefined,
          ...(input.last_assistant_message ? { lastText: truncate(input.last_assistant_message, 1200) } : {}),
        });
        hub.addEvent(id, 'result', input.last_assistant_message ? truncate(input.last_assistant_message, 600) : 'Tour terminé');
        break;
      }
      case 'StopFailure': {
        hub.updateSession(id, { ...base, status: 'error', activity: 'error', activityLabel: `Erreur : ${input.error}` });
        hub.addEvent(id, 'error', `Erreur API : ${input.error}${input.error_details ? ` — ${truncate(input.error_details, 200)}` : ''}`, {
          isError: true,
        });
        break;
      }
      case 'SubagentStart': {
        hub.updateSession(id, { ...base, activity: 'delegating', activityLabel: `Lance un sous-agent (${input.agent_type})` });
        hub.addEvent(id, 'system', `Sous-agent lancé : ${input.agent_type}`);
        break;
      }
      case 'SubagentStop': {
        hub.addEvent(id, 'system', `Sous-agent terminé : ${input.agent_type}`);
        break;
      }
      case 'PreCompact': {
        hub.updateSession(id, { ...base, activity: 'thinking', activityLabel: 'Compacte sa mémoire' });
        hub.addEvent(id, 'system', `Compaction du contexte (${input.trigger})`);
        break;
      }
      case 'SessionEnd': {
        hub.updateSession(id, {
          ...base,
          pending: undefined,
          status: 'ended',
          activity: 'leaving',
          activityLabel: 'Session fermée',
          currentTool: undefined,
        });
        hub.addEvent(id, 'system', `Session terminée (${input.reason})`);
        break;
      }
      default:
        if (Object.keys(base).length) hub.updateSession(id, base);
        break;
    }
  }

  /** Ferme les sessions terminal muettes depuis longtemps (fenêtre fermée sans SessionEnd). */
  reap(now = Date.now()): void {
    for (const s of this.hub.listSessions()) {
      if (s.source === 'hook' && s.status !== 'ended' && now - s.updatedAt > STALE_MS) {
        this.hub.updateSession(s.id, { status: 'ended', activity: 'leaving', activityLabel: 'Inactive', pending: undefined });
        this.hub.addEvent(s.id, 'system', 'Session sans nouvelles depuis 3 h : considérée comme fermée');
      }
    }
  }
}
