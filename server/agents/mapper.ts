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
  onInit?(claudeSessionId: string): void;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

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
          claudeSessionId: msg.session_id,
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
      // Messages des sous-agents (outil Agent/Task) : on montre juste qu'il délègue.
      if (msg.parent_tool_use_id) {
        for (const block of msg.message.content) {
          if (block.type === 'tool_use') {
            hub.updateSession(sessionId, { toolUses: (hub.getSession(sessionId)?.toolUses ?? 0) + 1 });
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
      cb.onTurnResult?.({ success, text, costUsd: msg.total_cost_usd, errors });
      break;
    }

    default:
      break;
  }
}
