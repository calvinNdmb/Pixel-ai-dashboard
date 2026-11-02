import { basename, truncate } from '../../shared/util';
import type { Hub } from '../../shared/hub';
import type { CodexEvent, CodexItem } from './codex-types';
import type { MapperCallbacks } from './mapper';

/** Retire l'enveloppe `bash -lc "…"` que Codex ajoute souvent aux commandes. */
export function cleanCommand(command: string): string {
  const m = /^(?:\/\S*\/)?(?:ba|z)?sh\s+-l?c\s+(['"])([\s\S]*)\1\s*$/.exec(command.trim());
  return (m ? m[2]! : command).trim();
}

/** État conservé entre deux événements d'une même session Codex. */
export interface CodexTurnState {
  lastText?: string;
}

/**
 * Applique un événement du SDK Codex (`codex exec --json`) à l'état du QG.
 * Fonction pure vis-à-vis du SDK : testable avec des événements enregistrés.
 */
export function applyCodexEvent(hub: Hub, sessionId: string, ev: CodexEvent, state: CodexTurnState, cb: MapperCallbacks = {}): void {
  const s = hub.getSession(sessionId);
  if (!s) return;

  switch (ev.type) {
    case 'thread.started':
      hub.updateSession(sessionId, { agentSessionId: ev.thread_id });
      cb.onInit?.(ev.thread_id);
      break;
    case 'turn.started':
      state.lastText = undefined;
      hub.updateSession(sessionId, { status: 'working', activity: 'thinking', activityLabel: 'Réfléchit' });
      break;
    case 'item.started':
    case 'item.updated':
      startItem(hub, sessionId, ev.item, ev.type === 'item.started');
      break;
    case 'item.completed':
      completeItem(hub, sessionId, ev.item, state, cb);
      break;
    case 'turn.completed': {
      const current = hub.getSession(sessionId);
      const usage = ev.usage;
      hub.updateSession(sessionId, {
        tokensIn: (current?.tokensIn ?? 0) + usage.input_tokens,
        tokensOut: (current?.tokensOut ?? 0) + usage.output_tokens,
        turns: (current?.turns ?? 0) + 1,
        status: 'idle',
        activity: 'done',
        activityLabel: 'Tour terminé',
        currentTool: undefined,
        ...(state.lastText ? { lastText: truncate(state.lastText, 1200) } : {}),
      });
      hub.addEvent(sessionId, 'result', `Tour terminé (${usage.input_tokens + usage.output_tokens} tokens)`);
      cb.onTurnResult?.({ success: true, text: state.lastText ?? '', costUsd: 0, errors: [] });
      break;
    }
    case 'turn.failed':
      hub.updateSession(sessionId, { status: 'error', activity: 'error', activityLabel: 'Tour en échec', currentTool: undefined });
      hub.addEvent(sessionId, 'error', `Tour en échec : ${truncate(ev.error.message, 400)}`, { isError: true });
      cb.onTurnResult?.({ success: false, text: '', costUsd: 0, errors: [ev.error.message] });
      break;
    case 'error':
      hub.addEvent(sessionId, 'error', truncate(ev.message, 400), { isError: true });
      break;
    default:
      break;
  }
}

function startItem(hub: Hub, sessionId: string, item: CodexItem, first: boolean): void {
  const s = hub.getSession(sessionId);
  if (!s) return;
  const bump = first ? { toolUses: s.toolUses + 1 } : {};
  switch (item.type) {
    case 'command_execution': {
      if (item.status !== 'in_progress') return;
      const label = `$ ${truncate(cleanCommand(item.command), 60)}`;
      hub.updateSession(sessionId, { status: 'working', activity: 'running', activityLabel: label, currentTool: 'shell', ...bump });
      if (first) hub.addEvent(sessionId, 'tool', label, { tool: 'shell' });
      break;
    }
    case 'file_change': {
      const files = item.changes.map((c) => c.path);
      const label = files.length ? `Modifie ${basename(files[0])}${files.length > 1 ? ` (+${files.length - 1})` : ''}` : 'Modifie des fichiers';
      hub.updateSession(sessionId, { status: 'working', activity: 'writing', activityLabel: label, currentTool: 'apply_patch', ...bump });
      break;
    }
    case 'mcp_tool_call': {
      const label = `${item.server} · ${item.tool}`;
      hub.updateSession(sessionId, { status: 'working', activity: 'browsing', activityLabel: label, currentTool: `mcp__${item.server}__${item.tool}`, ...bump });
      if (first) hub.addEvent(sessionId, 'tool', label, { tool: `mcp__${item.server}__${item.tool}` });
      break;
    }
    case 'web_search': {
      const label = `Recherche « ${truncate(item.query, 40)} »`;
      hub.updateSession(sessionId, { status: 'working', activity: 'browsing', activityLabel: label, currentTool: 'web_search', ...bump });
      if (first) hub.addEvent(sessionId, 'tool', label, { tool: 'web_search' });
      break;
    }
    case 'todo_list': {
      const done = item.items.filter((i) => i.completed).length;
      hub.updateSession(sessionId, {
        status: 'working',
        activity: 'planning',
        activityLabel: `Planifie (${done}/${item.items.length} étapes)`,
        currentTool: 'update_plan',
      });
      if (first) hub.addEvent(sessionId, 'tool', `Planifie (${item.items.length} étapes)`, { tool: 'update_plan' });
      break;
    }
    case 'reasoning':
      hub.updateSession(sessionId, { status: 'working', activity: 'thinking', activityLabel: 'Réfléchit' });
      break;
    default:
      break;
  }
}

function completeItem(hub: Hub, sessionId: string, item: CodexItem, state: CodexTurnState, cb: MapperCallbacks): void {
  switch (item.type) {
    case 'agent_message': {
      const text = item.text.trim();
      if (!text) return;
      state.lastText = text;
      hub.updateSession(sessionId, { lastText: truncate(text, 1200) });
      hub.addEvent(sessionId, 'text', text);
      cb.onAssistantText?.(text);
      return;
    }
    case 'command_execution': {
      const failed = item.status === 'failed' || (item.exit_code !== undefined && item.exit_code !== 0);
      if (failed) {
        hub.addEvent(sessionId, 'error', `Commande en échec (code ${item.exit_code ?? '?'}) : ${truncate(cleanCommand(item.command), 120)}`, {
          tool: 'shell',
          isError: true,
        });
      } else if (item.aggregated_output.trim()) {
        hub.addEvent(sessionId, 'tool_result', truncate(item.aggregated_output.trim().split('\n').slice(-3).join(' · '), 300));
      }
      break;
    }
    case 'file_change': {
      for (const change of item.changes) hub.touchFile(sessionId, change.path);
      const list = item.changes.map((c) => `${c.kind === 'add' ? '+' : c.kind === 'delete' ? '−' : '~'}${basename(c.path)}`).join(' ');
      if (item.status === 'failed') hub.addEvent(sessionId, 'error', `Modification en échec : ${list}`, { tool: 'apply_patch', isError: true });
      else hub.addEvent(sessionId, 'tool', `Fichiers modifiés : ${list}`, { tool: 'apply_patch' });
      break;
    }
    case 'mcp_tool_call':
      if (item.error) hub.addEvent(sessionId, 'error', `${item.server} · ${item.tool} : ${truncate(item.error.message, 200)}`, { isError: true });
      break;
    case 'error':
      hub.addEvent(sessionId, 'error', truncate(item.message, 400), { isError: true });
      break;
    default:
      break;
  }
  const s = hub.getSession(sessionId);
  if (s && s.status === 'working') hub.updateSession(sessionId, { activity: 'thinking', activityLabel: 'Réfléchit', currentTool: undefined });
}
