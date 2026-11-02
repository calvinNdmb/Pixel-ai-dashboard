import { activityForTool, describeTool, fileForTool } from '../shared/activity';
import type { Hub } from '../shared/hub';
import type { AgentKind, SessionInfo } from '../shared/types';
import { basename, safeJson, truncate, uid } from '../shared/util';

/** Durée après laquelle une session terminal silencieuse est considérée fermée. */
const STALE_MS = 3 * 60 * 60 * 1000;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

export interface HookResult {
  accepted: boolean;
  reason?: string;
  /** Session du QG concernée. */
  sessionId?: string;
  event?: string;
  /** Demande d'autorisation créée (PermissionRequest). */
  requestId?: string;
}

/** Claude Code ou Codex ? (le relais l'indique ; sinon on devine). */
export function detectAgent(p: Rec): AgentKind {
  const tag = str(p.pixel_agent);
  if (tag === 'codex' || tag === 'claude') return tag;
  const transcript = str(p.transcript_path) ?? '';
  if (/[\\/]\.codex[\\/]/.test(transcript) || typeof p.turn_id === 'string') return 'codex';
  return 'claude';
}

const SUBAGENT_EVENTS = new Set(['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'PermissionDenied']);

/**
 * Transforme les événements des hooks de Claude Code et de Codex (sessions
 * lancées dans un terminal, un IDE…) en personnages du QG.
 */
export class HookIngestor {
  /** Dernier événement de hook reçu par session (pour la déduplication avec les transcripts). */
  readonly lastHookAt = new Map<string, number>();

  constructor(
    private hub: Hub,
    /** Vrai si cet identifiant appartient à une session pilotée par le dashboard. */
    private isManaged: (agentSessionId: string) => boolean,
    private serverHost = '',
  ) {}

  handle(payload: unknown, opts: { managed?: boolean } = {}): HookResult {
    if (!isRec(payload)) return { accepted: false, reason: 'payload invalide' };
    const sid = str(payload.session_id);
    const event = str(payload.hook_event_name);
    if (!sid || !event) return { accepted: false, reason: 'session_id / hook_event_name manquant' };
    if (opts.managed || this.isManaged(sid)) return { accepted: false, reason: 'session pilotée par le dashboard' };

    let session = this.hub.findByAgentSessionId(sid);
    if (session && (session.source === 'sdk' || session.source === 'demo')) {
      return { accepted: false, reason: 'session pilotée par le dashboard' };
    }
    if (!session) {
      if (event === 'SessionEnd') return { accepted: false, reason: 'session inconnue' };
      session = this.createExternal(sid, payload);
    } else {
      const patch: Partial<SessionInfo> = {};
      // Une session repérée via son transcript passe en mode « hooks » (plus précis).
      if (session.source === 'watch') patch.source = 'hook';
      if (session.status === 'ended' && event !== 'SessionEnd') {
        Object.assign(patch, { status: 'idle', activity: 'idle', activityLabel: 'De retour' });
      }
      if (Object.keys(patch).length) session = this.hub.updateSession(session.id, patch) ?? session;
    }
    this.lastHookAt.set(sid, Date.now());

    // Les outils lancés par un sous-agent animent son propre personnage.
    const agentId = str(payload.agent_id);
    let target = session;
    if (agentId && SUBAGENT_EVENTS.has(event)) target = this.subagent(session, agentId, str(payload.agent_type));

    const requestId = this.apply(target, session, event, payload);
    return { accepted: true, sessionId: target.id, event, ...(requestId ? { requestId } : {}) };
  }

  private createExternal(sid: string, p: Rec): SessionInfo {
    const cwd = str(p.cwd) ?? '';
    const agent = detectAgent(p);
    const host = str(p.pixel_host);
    const base = basename(cwd) || (agent === 'codex' ? 'codex' : 'terminal');
    const taken = new Set(this.hub.listSessions().map((s) => s.name));
    let name = base;
    for (let i = 2; taken.has(name); i++) name = `${base} ${i}`;
    const session = this.hub.createSession({
      id: uid('h_'),
      name,
      role: 'external',
      source: 'hook',
      agent,
      status: 'idle',
      activity: 'idle',
      activityLabel: 'Session terminal',
      cwd,
      agentSessionId: sid,
      permissionMode: str(p.permission_mode),
      controllable: false,
      ...(host && host !== this.serverHost ? { host } : {}),
      ...(str(p.model) ? { model: str(p.model) } : {}),
    });
    this.hub.addEvent(
      session.id,
      'system',
      `Session ${agent === 'codex' ? 'Codex' : 'Claude Code'} détectée (${cwd || 'dossier inconnu'}${host ? ` sur ${host}` : ''})`,
    );
    return session;
  }

  /** Personnage d'un sous-agent (créé à la volée). */
  private subagent(parent: SessionInfo, agentId: string, agentType?: string): SessionInfo {
    const ref = `${parent.agentSessionId}:${agentId}`;
    const existing = this.hub.findByAgentSessionId(ref);
    if (existing) {
      return existing.status === 'ended'
        ? (this.hub.updateSession(existing.id, { status: 'working', activity: 'thinking' }) ?? existing)
        : existing;
    }
    const label = agentType && agentType !== 'general-purpose' ? agentType : 'aide';
    const child = this.hub.createSession({
      id: uid('h_'),
      name: `${parent.name}·${label}`,
      role: 'subagent',
      source: 'hook',
      agent: parent.agent,
      status: 'working',
      activity: 'thinking',
      activityLabel: 'Sous-agent au travail',
      cwd: parent.cwd,
      agentSessionId: ref,
      parentId: parent.id,
      controllable: false,
      ...(parent.host ? { host: parent.host } : {}),
      ...(agentType ? { task: `Sous-agent ${agentType} de ${parent.name}` } : {}),
    });
    this.hub.addEvent(child.id, 'system', `Sous-agent lancé par ${parent.name}`);
    return child;
  }

  private endSubagent(parent: SessionInfo, agentId: string, lastText?: string): void {
    const child = this.hub.findByAgentSessionId(`${parent.agentSessionId}:${agentId}`);
    if (!child || child.status === 'ended') return;
    this.hub.updateSession(child.id, {
      status: 'ended',
      activity: 'leaving',
      activityLabel: 'Mission accomplie',
      currentTool: undefined,
      pending: undefined,
      ...(lastText ? { lastText: truncate(lastText, 1200) } : {}),
    });
    this.hub.addEvent(child.id, 'result', lastText ? truncate(lastText, 400) : 'Sous-agent terminé');
  }

  /** Applique l'événement ; renvoie l'id de la demande d'autorisation créée, le cas échéant. */
  private apply(s: SessionInfo, root: SessionInfo, event: string, p: Rec): string | undefined {
    const id = s.id;
    const hub = this.hub;
    const base: Partial<SessionInfo> = {};
    const mode = str(p.permission_mode);
    if (mode) base.permissionMode = mode;
    const model = str(p.model);
    if (model && model !== s.model) base.model = model;
    // Toute activité après une demande d'autorisation signifie qu'elle a été traitée.
    if (s.pending && event !== 'Notification' && event !== 'PermissionRequest') base.pending = undefined;
    // Une nouvelle consigne tapée dans le terminal annule une retenue de fin de tour.
    if (s.hold && event === 'UserPromptSubmit') base.hold = undefined;
    const toolName = str(p.tool_name) ?? '';
    const toolInput = isRec(p.tool_input) ? p.tool_input : undefined;

    switch (event) {
      case 'SessionStart': {
        hub.updateSession(id, {
          ...base,
          status: 'idle',
          activity: 'idle',
          activityLabel: str(p.source) === 'resume' ? 'Session reprise' : 'Prêt',
          ...(str(p.session_title) ? { title: str(p.session_title) } : {}),
        });
        hub.addEvent(id, 'system', `Session démarrée (${str(p.source) ?? 'nouvelle'})`);
        break;
      }
      case 'UserPromptSubmit': {
        const prompt = str(p.prompt) ?? '';
        hub.updateSession(id, {
          ...base,
          status: 'working',
          activity: 'thinking',
          activityLabel: 'Réfléchit',
          task: s.task ?? truncate(prompt, 200),
          turns: s.turns + 1,
          ...(str(p.session_title) ? { title: str(p.session_title) } : {}),
        });
        hub.addEvent(id, 'prompt', prompt);
        break;
      }
      case 'PreToolUse': {
        const label = describeTool(toolName, toolInput);
        hub.updateSession(id, {
          ...base,
          status: 'working',
          activity: activityForTool(toolName),
          activityLabel: label,
          currentTool: toolName,
          toolUses: s.toolUses + 1,
        });
        const file = fileForTool(toolName, toolInput);
        if (file) hub.touchFile(id, file);
        hub.addEvent(id, 'tool', label, { tool: toolName });
        // Le parent « délègue » pendant qu'un sous-agent travaille.
        if (s.id !== root.id && root.activity !== 'delegating') {
          hub.updateSession(root.id, { activity: 'delegating', activityLabel: `Délègue à ${s.name}` });
        }
        break;
      }
      case 'PostToolUse': {
        hub.updateSession(id, { ...base, status: 'working', activity: 'thinking', activityLabel: 'Réfléchit', currentTool: undefined });
        break;
      }
      case 'PostToolUseFailure': {
        hub.updateSession(id, { ...base, activity: 'thinking', activityLabel: 'Réfléchit', currentTool: undefined });
        if (!p.is_interrupt) {
          hub.addEvent(id, 'error', `${toolName} a échoué : ${truncate(str(p.error), 300)}`, { tool: toolName, isError: true });
        }
        break;
      }
      case 'PermissionRequest': {
        const summary = describeTool(toolName, toolInput);
        const requestId = uid('p_');
        const suggestions = p.permission_suggestions;
        hub.updateSession(id, {
          ...base,
          status: 'waiting',
          activity: 'waiting',
          activityLabel: `Attend ta réponse dans le terminal : ${summary}`,
          pending: {
            id: requestId,
            sessionId: id,
            toolName,
            summary,
            detail: safeJson(p.tool_input, 800),
            canAlwaysAllow: Array.isArray(suggestions) && suggestions.length > 0,
            answerable: false,
            createdAt: Date.now(),
          },
        });
        hub.addEvent(id, 'permission', `Demande d'autorisation : ${summary}`, { tool: toolName });
        return requestId;
      }
      case 'PermissionDenied': {
        hub.updateSession(id, { ...base, activity: 'thinking', activityLabel: 'Réfléchit' });
        hub.addEvent(id, 'permission', `Refusé : ${describeTool(toolName, toolInput)}`);
        break;
      }
      case 'Notification': {
        const type = str(p.notification_type) ?? '';
        const message = str(p.message) ?? '';
        if (/permission/i.test(type)) {
          hub.updateSession(id, { ...base, status: 'waiting', activity: 'waiting', activityLabel: truncate(message, 80) });
        } else if (/idle/i.test(type) && !s.hold) {
          hub.updateSession(id, { ...base, status: 'idle', activity: 'idle', activityLabel: 'Attend ta prochaine demande' });
        }
        if (message) hub.addEvent(id, 'system', message);
        break;
      }
      case 'Stop': {
        const last = str(p.last_assistant_message);
        hub.updateSession(id, {
          ...base,
          pending: undefined,
          status: 'idle',
          activity: 'done',
          activityLabel: 'Tour terminé',
          currentTool: undefined,
          ...(last ? { lastText: truncate(last, 1200) } : {}),
        });
        hub.addEvent(id, 'result', last ? truncate(last, 600) : 'Tour terminé');
        break;
      }
      case 'StopFailure': {
        hub.updateSession(id, { ...base, status: 'error', activity: 'error', activityLabel: `Erreur : ${str(p.error) ?? 'inconnue'}` });
        hub.addEvent(id, 'error', `Erreur API : ${str(p.error) ?? 'inconnue'}${str(p.error_details) ? ` — ${truncate(str(p.error_details), 200)}` : ''}`, {
          isError: true,
        });
        break;
      }
      case 'Interrupt': {
        hub.updateSession(id, { ...base, status: 'idle', activity: 'idle', activityLabel: 'Interrompu', currentTool: undefined, pending: undefined });
        hub.addEvent(id, 'system', 'Interrompu dans le terminal');
        break;
      }
      case 'SubagentStart': {
        const agentId = str(p.agent_id);
        if (agentId) this.subagent(s, agentId, str(p.agent_type));
        hub.updateSession(id, { ...base, activity: 'delegating', activityLabel: `Lance un sous-agent (${str(p.agent_type) ?? 'aide'})` });
        break;
      }
      case 'SubagentStop': {
        const agentId = str(p.agent_id);
        if (agentId) this.endSubagent(s, agentId, str(p.last_assistant_message));
        hub.addEvent(id, 'system', `Sous-agent terminé : ${str(p.agent_type) ?? 'aide'}`);
        break;
      }
      case 'PreCompact': {
        hub.updateSession(id, { ...base, activity: 'thinking', activityLabel: 'Compacte sa mémoire' });
        hub.addEvent(id, 'system', `Compaction du contexte (${str(p.trigger) ?? 'auto'})`);
        break;
      }
      case 'SessionEnd': {
        hub.updateSession(id, {
          ...base,
          pending: undefined,
          hold: undefined,
          status: 'ended',
          activity: 'leaving',
          activityLabel: 'Session fermée',
          currentTool: undefined,
        });
        hub.addEvent(id, 'system', `Session terminée (${str(p.reason) ?? 'fin'})`);
        for (const child of this.hub.listSessions()) {
          if (child.parentId === id && child.role === 'subagent' && child.status !== 'ended') {
            this.hub.updateSession(child.id, { status: 'ended', activity: 'leaving' });
          }
        }
        break;
      }
      default:
        if (Object.keys(base).length) hub.updateSession(id, base);
        break;
    }
    return undefined;
  }

  /** Ferme les sessions terminal muettes depuis longtemps (fenêtre fermée sans SessionEnd). */
  reap(now = Date.now()): void {
    for (const s of this.hub.listSessions()) {
      if (s.source === 'hook' && s.status !== 'ended' && !s.hold && now - s.updatedAt > STALE_MS) {
        this.hub.updateSession(s.id, { status: 'ended', activity: 'leaving', activityLabel: 'Inactive', pending: undefined });
        this.hub.addEvent(s.id, 'system', 'Session sans nouvelles depuis 3 h : considérée comme fermée');
      }
    }
  }
}
