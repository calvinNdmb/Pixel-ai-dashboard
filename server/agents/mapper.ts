import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { activityForTool, describeTool, fileForTool } from '../../shared/activity';
import type { Hub } from '../../shared/hub';
import { truncate } from '../../shared/util';

export interface TurnResult {
  success: boolean;
  text: string;
  costUsd: number;
  errors: string[];
}

export interface MapperCallbacks {
  /** Texte produit par l'agent (thread principal uniquement). */
  onAssistantText?(text: string): void;
  /** Fin d'un tour (message `result`). */
  onTurnResult?(result: TurnResult): void;
  /** Message `system/init` reçu : identifiant de session Claude Code connu. */
  onInit?(agentSessionId: string): void;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

const SUBAGENT_TOOLS = new Set(['Agent', 'Task']);
const subKey = (parentId: string, toolUseId: string) => `sub:${parentId}:${toolUseId}`;

/** Crée le personnage d'un sous-agent lancé via l'outil Agent/Task. */
function startSubagent(hub: Hub, parentId: string, toolUseId: string, input: Rec | undefined): void {
  const parent = hub.getSession(parentId);
  if (!parent || hub.findByAgentSessionId(subKey(parentId, toolUseId))) return;
  const kind = typeof input?.subagent_type === 'string' && input.subagent_type !== 'general-purpose' ? input.subagent_type : 'aide';
  const description = typeof input?.description === 'string' ? input.description : undefined;
  const child = hub.createSession({
    name: `${parent.name}·${kind}`,
    role: 'subagent',
    source: parent.source,
    agent: parent.agent,
    status: 'working',
    activity: 'thinking',
    activityLabel: description ? truncate(description, 60) : 'Sous-agent au travail',
    task: description ?? `Sous-agent de ${parent.name}`,
    cwd: parent.cwd,
    agentSessionId: subKey(parentId, toolUseId),
    parentId,
    controllable: false,
  });
  hub.addEvent(child.id, 'system', `Sous-agent lancé par ${parent.name}`);
}

function endSubagent(hub: Hub, parentId: string, toolUseId: string, isError: boolean): void {
  const child = hub.findByAgentSessionId(subKey(parentId, toolUseId));
  if (!child || child.status === 'ended') return;
  hub.updateSession(child.id, {
    status: 'ended',
    activity: 'leaving',
    activityLabel: isError ? 'Sous-agent en échec' : 'Mission accomplie',
    currentTool: undefined,
  });
  hub.addEvent(child.id, isError ? 'error' : 'result', isError ? 'Sous-agent en échec' : 'Sous-agent terminé', { isError });
}

/** Fin de tour : les sous-agents encore présents quittent le QG. */
function endAllSubagents(hub: Hub, parentId: string): void {
  for (const s of hub.listSessions()) {
    if (s.parentId === parentId && s.role === 'subagent' && s.status !== 'ended') {
      hub.updateSession(s.id, { status: 'ended', activity: 'leaving', currentTool: undefined });
    }
  }
}

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (isRec(b) && b.type === 'text' && typeof b.text === 'string' ? b.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/**
 * Applique un message du Claude Agent SDK à l'état du QG.
 * Fonction pure vis-à-vis du SDK (testable avec des messages enregistrés).
 */
export function applySdkMessage(hub: Hub, sessionId: string, msg: SDKMessage, cb: MapperCallbacks = {}): void {
  const s = hub.getSession(sessionId);
  if (!s) return;

  switch (msg.type) {
    case 'system': {
      if (msg.subtype === 'init') {
        hub.updateSession(sessionId, {
          agentSessionId: msg.session_id,
          model: msg.model,
          cwd: msg.cwd,
          permissionMode: msg.permissionMode,
        });
        cb.onInit?.(msg.session_id);
      } else if (msg.subtype === 'status') {
        if (msg.status === 'compacting') {
          hub.updateSession(sessionId, { activity: 'thinking', activityLabel: 'Compacte sa mémoire' });
          hub.addEvent(sessionId, 'system', 'Compaction du contexte');
        }
        if (msg.permissionMode) hub.updateSession(sessionId, { permissionMode: msg.permissionMode });
      } else if (msg.subtype === 'api_retry') {
        hub.addEvent(sessionId, 'system', `Nouvelle tentative API (${msg.attempt}/${msg.max_retries}) — ${msg.error}`);
      }
      break;
    }

    case 'assistant': {
      // Messages des sous-agents (outil Agent/Task) : ils animent leur propre personnage.
      if (msg.parent_tool_use_id) {
        const child = hub.findByAgentSessionId(subKey(sessionId, msg.parent_tool_use_id));
        for (const block of msg.message.content) {
          if (block.type !== 'tool_use') continue;
          hub.updateSession(sessionId, { toolUses: (hub.getSession(sessionId)?.toolUses ?? 0) + 1 });
          if (child && child.status !== 'ended') {
            const input = isRec(block.input) ? block.input : undefined;
            hub.updateSession(child.id, {
              activity: activityForTool(block.name),
              activityLabel: describeTool(block.name, input),
              currentTool: block.name,
              toolUses: (hub.getSession(child.id)?.toolUses ?? 0) + 1,
            });
            hub.addEvent(child.id, 'tool', describeTool(block.name, input), { tool: block.name });
          }
        }
        break;
      }
      for (const block of msg.message.content) {
        if (block.type === 'text') {
          const text = block.text.trim();
          if (!text) continue;
          hub.updateSession(sessionId, { lastText: truncate(text, 1200) });
          hub.addEvent(sessionId, 'text', text);
          cb.onAssistantText?.(text);
        } else if (block.type === 'tool_use') {
          const input = isRec(block.input) ? block.input : undefined;
          const label = describeTool(block.name, input);
          const current = hub.getSession(sessionId);
          hub.updateSession(sessionId, {
            status: current?.status === 'waiting' ? 'waiting' : 'working',
            activity: current?.status === 'waiting' ? 'waiting' : activityForTool(block.name),
            activityLabel: label,
            currentTool: block.name,
            toolUses: (current?.toolUses ?? 0) + 1,
          });
          const file = fileForTool(block.name, input);
          if (file) hub.touchFile(sessionId, file);
          hub.addEvent(sessionId, 'tool', label, { tool: block.name });
          if (SUBAGENT_TOOLS.has(block.name)) startSubagent(hub, sessionId, block.id, input);
        } else if (block.type === 'thinking' || block.type === 'redacted_thinking') {
          if (hub.getSession(sessionId)?.status !== 'waiting') {
            hub.updateSession(sessionId, { status: 'working', activity: 'thinking', activityLabel: 'Réfléchit' });
          }
        }
      }
      if (msg.error) {
        hub.addEvent(sessionId, 'error', `Erreur de l'API : ${msg.error}`, { isError: true });
      }
      break;
    }

    case 'user': {
      if (msg.parent_tool_use_id) break;
      const content = msg.message.content;
      if (!Array.isArray(content)) break;
      let sawResult = false;
      for (const block of content) {
        if (!isRec(block) || block.type !== 'tool_result') continue;
        sawResult = true;
        if (typeof block.tool_use_id === 'string') endSubagent(hub, sessionId, block.tool_use_id, Boolean(block.is_error));
        if (block.is_error) {
          hub.addEvent(sessionId, 'error', truncate(toolResultText(block.content) || "L'outil a échoué", 400), { isError: true });
        } else {
          const text = toolResultText(block.content);
          if (text) hub.addEvent(sessionId, 'tool_result', truncate(text, 300));
        }
      }
      if (sawResult && hub.getSession(sessionId)?.status !== 'waiting') {
        hub.updateSession(sessionId, { activity: 'thinking', activityLabel: 'Réfléchit', currentTool: undefined });
      }
      break;
    }

    case 'result': {
      let tokensIn = 0;
      let tokensOut = 0;
      for (const u of Object.values(msg.modelUsage ?? {})) {
        tokensIn += u.inputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens;
        tokensOut += u.outputTokens;
      }
      const success = msg.subtype === 'success' && !msg.is_error;
      const text = msg.subtype === 'success' ? msg.result : '';
      const errors = msg.subtype === 'success' ? [] : msg.errors ?? [];
      const current = hub.getSession(sessionId);
      hub.updateSession(sessionId, {
        // total_cost_usd est cumulatif sur la durée de vie de query() : on remplace.
        costUsd: msg.total_cost_usd > 0 ? msg.total_cost_usd : current?.costUsd ?? 0,
        tokensIn: tokensIn || current?.tokensIn || 0,
        tokensOut: tokensOut || current?.tokensOut || 0,
        turns: (current?.turns ?? 0) + 1,
        status: success ? 'idle' : 'error',
        activity: success ? 'done' : 'error',
        activityLabel: success ? 'Tour terminé' : `Erreur : ${msg.subtype}`,
        currentTool: undefined,
        pending: undefined,
        ...(text ? { lastText: truncate(text, 1200) } : {}),
      });
      if (success) {
        hub.addEvent(sessionId, 'result', `Tour terminé (${(msg.duration_ms / 1000).toFixed(0)} s, ${msg.num_turns} échanges)`);
      } else {
        const why =
          msg.subtype === 'error_max_turns'
            ? 'nombre maximal de tours atteint'
            : msg.subtype === 'error_max_budget_usd'
              ? 'budget maximal atteint'
              : errors.join(' · ') || text || 'erreur pendant l’exécution';
        hub.addEvent(sessionId, 'error', `Tour interrompu : ${truncate(why, 400)}`, { isError: true });
      }
      endAllSubagents(hub, sessionId);
      cb.onTurnResult?.({ success, text, costUsd: msg.total_cost_usd, errors });
      break;
    }

    default:
      break;
  }
}
