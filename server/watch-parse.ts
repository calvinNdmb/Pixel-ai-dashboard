import { activityForTool, describeTool, fileForTool, patchFiles } from '../shared/activity';
import type { Hub } from '../shared/hub';
import type { AgentKind, SessionInfo } from '../shared/types';
import { basename, truncate, uid } from '../shared/util';

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

interface PendingTool {
  name: string;
  label: string;
  at: number;
  /** Délai au-delà duquel on soupçonne une demande d'autorisation dans le terminal. */
  suspectAfterMs: number;
  /** Codex a explicitement demandé une élévation : une approbation est certaine. */
  needsApproval: boolean;
}

/** État de lecture d'un fichier de transcript. */
export interface Tracker {
  file: string;
  agent: AgentKind;
  sessionId?: string;
  agentSessionId?: string;
  cwd?: string;
  /** Session pilotée par un SDK (dont le dashboard) : ignorée. */
  ignore?: boolean;
  pending: Map<string, PendingTool>;
  countedMessages: Set<string>;
  recentPrompts: string[];
  lastText?: string;
  lastLineAt: number;
  approvalPolicy?: string;
  /** Rattrapage initial : on met l'état à jour sans inonder le journal. */
  silent: boolean;
}

export function newTracker(file: string, agent: AgentKind): Tracker {
  return { file, agent, pending: new Map(), countedMessages: new Set(), recentPrompts: [], lastLineAt: Date.now(), silent: false };
}

export interface ParseContext {
  hub: Hub;
  /** Identifiant appartenant à une session pilotée par le dashboard ? */
  isManaged(agentSessionId: string): boolean;
  serverHost?: string;
}

/** Ces outils demandent souvent une autorisation : on soupçonne une attente après ce délai (ms). */
function suspectDelay(tool: string): number {
  if (/^(Edit|MultiEdit|Write|NotebookEdit|apply_patch)$/.test(tool)) return 4000;
  if (/^(WebFetch)$/.test(tool) || tool.startsWith('mcp__')) return 15_000;
  if (/^(Bash|PowerShell|shell|exec_command|shell_command|local_shell)$/.test(tool)) return 25_000;
  return 0;
}

// ---------------------------------------------------------------- sessions

function ensureSession(ctx: ParseContext, t: Tracker, agentSessionId: string, cwd: string | undefined): SessionInfo | null {
  if (t.ignore) return null;
  if (ctx.isManaged(agentSessionId)) {
    t.ignore = true;
    return null;
  }
  const hub = ctx.hub;
  t.agentSessionId = agentSessionId;
  if (cwd) t.cwd = cwd;
  if (t.sessionId) {
    const s = hub.getSession(t.sessionId);
    if (s) return s;
  }
  const existing = hub.findByAgentSessionId(agentSessionId);
  if (existing) {
    if (existing.source === 'sdk' || existing.source === 'demo') {
      t.ignore = true;
      return null;
    }
    t.sessionId = existing.id;
    if (existing.status === 'ended' && existing.source === 'watch') {
      hub.updateSession(existing.id, { status: 'idle', activity: 'idle', activityLabel: 'De retour' });
    }
    return hub.getSession(existing.id) ?? existing;
  }
  const base = basename(t.cwd) || (t.agent === 'codex' ? 'codex' : 'terminal');
  const taken = new Set(hub.listSessions().map((s) => s.name));
  let name = base;
  for (let i = 2; taken.has(name); i++) name = `${base} ${i}`;
  const s = hub.createSession({
    id: uid('w_'),
    name,
    role: 'external',
    source: 'watch',
    agent: t.agent,
    status: 'idle',
    activity: 'idle',
    activityLabel: 'Session terminal',
    cwd: t.cwd,
    agentSessionId,
    controllable: false,
  });
  t.sessionId = s.id;
  hub.addEvent(s.id, 'system', `Session ${t.agent === 'codex' ? 'Codex' : 'Claude Code'} repérée via son transcript (${t.cwd ?? 'dossier inconnu'})`);
  return s;
}

/** Les hooks sont plus précis : quand ils sont actifs, le transcript ne sert qu'aux détails. */
const passive = (s: SessionInfo) => s.source === 'hook';

function event(ctx: ParseContext, t: Tracker, s: SessionInfo, kind: Parameters<Hub['addEvent']>[1], text: string, extra?: Parameters<Hub['addEvent']>[3]) {
  if (t.silent || passive(s)) return;
  ctx.hub.addEvent(s.id, kind, text, extra);
}

function update(ctx: ParseContext, s: SessionInfo, patch: Partial<SessionInfo>, passiveKeys: Array<keyof SessionInfo> = []) {
  if (!passive(s)) {
    ctx.hub.updateSession(s.id, patch);
    return;
  }
  const allowed: Partial<SessionInfo> = {};
  for (const k of passiveKeys) if (k in patch) (allowed as Record<string, unknown>)[k] = patch[k];
  if (Object.keys(allowed).length) ctx.hub.updateSession(s.id, allowed);
}

function prompt(ctx: ParseContext, t: Tracker, s: SessionInfo, text: string) {
  const clean = text.trim();
  if (!clean || t.recentPrompts.includes(clean)) return;
  t.recentPrompts = [clean, ...t.recentPrompts].slice(0, 5);
  update(ctx, s, {
    status: 'working',
    activity: 'thinking',
    activityLabel: 'Réfléchit',
    task: s.task ?? truncate(clean, 200),
    turns: s.turns + 1,
    pending: undefined,
  });
  event(ctx, t, s, 'prompt', clean);
}

function toolStart(ctx: ParseContext, t: Tracker, s: SessionInfo, id: string, name: string, input: Rec | undefined, opts: { needsApproval?: boolean } = {}) {
  const label = describeTool(name, input);
  t.pending.set(id, { name, label, at: t.lastLineAt, suspectAfterMs: suspectDelay(name), needsApproval: Boolean(opts.needsApproval) });
  const file = fileForTool(name, input);
  update(ctx, s, {
    status: 'working',
    activity: activityForTool(name),
    activityLabel: label,
    currentTool: name,
    toolUses: s.toolUses + 1,
  });
  if (file && !passive(s)) ctx.hub.touchFile(s.id, file);
  event(ctx, t, s, 'tool', label, { tool: name });
}

function toolEnd(ctx: ParseContext, t: Tracker, s: SessionInfo, id: string, error?: string) {
  const p = t.pending.get(id);
  t.pending.delete(id);
  const fresh = ctx.hub.getSession(s.id) ?? s;
  update(ctx, fresh, {
    status: 'working',
    activity: 'thinking',
    activityLabel: 'Réfléchit',
    currentTool: undefined,
    ...(fresh.pending ? { pending: undefined } : {}),
  });
  if (error) event(ctx, t, s, 'error', `${p?.name ?? 'Outil'} : ${truncate(error, 300)}`, { isError: true, tool: p?.name });
}

function assistantText(ctx: ParseContext, t: Tracker, s: SessionInfo, text: string) {
  const clean = text.trim();
  if (!clean || clean === t.lastText) return;
  t.lastText = clean;
  update(ctx, s, { lastText: truncate(clean, 1200) }, ['lastText']);
  event(ctx, t, s, 'text', clean);
}

function turnDone(ctx: ParseContext, t: Tracker, s: SessionInfo, last?: string) {
  t.pending.clear();
  const text = last?.trim() || t.lastText;
  update(
    ctx,
    s,
    {
      status: 'idle',
      activity: 'done',
      activityLabel: 'Tour terminé',
      currentTool: undefined,
      pending: undefined,
      ...(text ? { lastText: truncate(text, 1200) } : {}),
    },
    ['lastText'],
  );
  event(ctx, t, s, 'result', text ? truncate(text, 600) : 'Tour terminé');
}

// ------------------------------------------------------------- Claude Code

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (isRec(b) && (b.type === 'text' || b.type === 'input_text') && typeof b.text === 'string' ? b.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/** Messages « techniques » de Claude Code (commandes locales, rappels) : pas des consignes. */
function isNoise(text: string): boolean {
  const t = text.trimStart();
  return t.startsWith('<') || t.startsWith('Caveat:') || t.startsWith('[Request interrupted');
}

export function parseClaudeLine(ctx: ParseContext, t: Tracker, line: unknown): void {
  if (!isRec(line)) return;
  const type = str(line.type);
  const sid = str(line.sessionId);
  if (!sid || !type) return;
  const entry = str(line.entrypoint);
  if (entry?.startsWith('sdk')) {
    t.ignore = true;
    return;
  }
  if (type === 'ai-title') {
    const s = t.sessionId ? ctx.hub.getSession(t.sessionId) : undefined;
    const title = str(line.aiTitle);
    if (s && title) ctx.hub.updateSession(s.id, { title });
    return;
  }
  if (type !== 'user' && type !== 'assistant' && type !== 'system') return;
  const s = ensureSession(ctx, t, sid, str(line.cwd));
  if (!s) return;
  if (line.isSidechain === true || line.isMeta === true) return;
  const message = isRec(line.message) ? line.message : undefined;

  if (type === 'system') {
    const subtype = str(line.subtype);
    if (subtype === 'compact_boundary') event(ctx, t, s, 'system', 'Compaction du contexte');
    // Fin de tour explicite (versions récentes de Claude Code, signal utilisé par pixel-agents).
    else if (subtype === 'turn_duration' && (s.status === 'working' || s.status === 'waiting')) turnDone(ctx, t, s);
    return;
  }

  if (type === 'user') {
    if (typeof line.permissionMode === 'string' && !passive(s)) ctx.hub.updateSession(s.id, { permissionMode: line.permissionMode });
    const content = message?.content;
    if (typeof content === 'string') {
      if (!isNoise(content)) prompt(ctx, t, s, content);
      return;
    }
    if (!Array.isArray(content)) return;
    let sawResult = false;
    for (const b of content) {
      if (!isRec(b)) continue;
      if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
        sawResult = true;
        toolEnd(ctx, t, ctx.hub.getSession(s.id) ?? s, b.tool_use_id, b.is_error ? textOf(b.content) || 'échec' : undefined);
      }
    }
    if (!sawResult) {
      const text = textOf(content);
      if (text && !isNoise(text)) prompt(ctx, t, s, text);
    }
    return;
  }

  // assistant
  if (!message) return;
  const msgId = str(message.id);
  const usage = isRec(message.usage) ? message.usage : undefined;
  if (usage && msgId && !t.countedMessages.has(msgId)) {
    t.countedMessages.add(msgId);
    const n = (k: string) => (typeof usage[k] === 'number' ? (usage[k] as number) : 0);
    const cur = ctx.hub.getSession(s.id) ?? s;
    ctx.hub.updateSession(s.id, {
      tokensIn: cur.tokensIn + n('input_tokens') + n('cache_read_input_tokens') + n('cache_creation_input_tokens'),
      tokensOut: cur.tokensOut + n('output_tokens'),
      ...(str(message.model) && !passive(cur) ? { model: str(message.model) } : {}),
    });
  }
  const content = Array.isArray(message.content) ? message.content : [];
  for (const b of content) {
    if (!isRec(b)) continue;
    const cur = ctx.hub.getSession(s.id) ?? s;
    if (b.type === 'tool_use' && typeof b.id === 'string' && typeof b.name === 'string') {
      toolStart(ctx, t, cur, b.id, b.name, isRec(b.input) ? b.input : undefined);
    } else if (b.type === 'text' && typeof b.text === 'string') {
      assistantText(ctx, t, cur, b.text);
    } else if (b.type === 'thinking' && cur.activity !== 'thinking' && !t.pending.size) {
      update(ctx, cur, { status: 'working', activity: 'thinking', activityLabel: 'Réfléchit' });
    }
  }
  if (str(message.stop_reason) === 'end_turn' && !t.pending.size) turnDone(ctx, t, ctx.hub.getSession(s.id) ?? s);
}

// ------------------------------------------------------------------ Codex

function parseArgs(raw: unknown): Rec | undefined {
  if (isRec(raw)) return raw;
  if (typeof raw !== 'string') return undefined;
  try {
    const v = JSON.parse(raw) as unknown;
    return isRec(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

function codexOutputError(output: unknown): string | undefined {
  const raw = isRec(output) ? output : parseArgs(output);
  const meta = raw && isRec(raw.metadata) ? raw.metadata : undefined;
  const code = meta && typeof meta.exit_code === 'number' ? meta.exit_code : undefined;
  if (code !== undefined && code !== 0) return `code de sortie ${code}`;
  return undefined;
}

/** Contexte injecté par Codex dans la conversation (pas une consigne de l'utilisateur). */
function isCodexContext(text: string): boolean {
  const t = text.trimStart();
  return t.startsWith('<') || t.startsWith('# AGENTS.md') || t.startsWith('# Instructions');
}

export function parseCodexLine(ctx: ParseContext, t: Tracker, line: unknown): void {
  if (!isRec(line)) return;
  const type = str(line.type);
  const payload = isRec(line.payload) ? line.payload : undefined;
  if (!type || !payload) return;

  if (type === 'session_meta') {
    const id = str(payload.id);
    if (!id) return;
    ensureSession(ctx, t, id, str(payload.cwd));
    return;
  }
  if (!t.agentSessionId) return;
  const s = ensureSession(ctx, t, t.agentSessionId, t.cwd);
  if (!s) return;
  const cur = () => ctx.hub.getSession(s.id) ?? s;

  if (type === 'turn_context') {
    t.approvalPolicy = str(payload.approval_policy);
    const sandbox = isRec(payload.sandbox_policy) ? str(payload.sandbox_policy.type) ?? str(payload.sandbox_policy.mode) : str(payload.sandbox_policy);
    update(ctx, cur(), {
      ...(str(payload.model) ? { model: str(payload.model) } : {}),
      permissionMode: [t.approvalPolicy, sandbox].filter(Boolean).join(' · ') || undefined,
    });
    return;
  }

  if (type === 'event_msg') {
    switch (str(payload.type)) {
      case 'task_started':
      case 'turn_started':
        update(ctx, cur(), { status: 'working', activity: 'thinking', activityLabel: 'Réfléchit' });
        return;
      case 'user_message': {
        const text = str(payload.message);
        if (text && !isCodexContext(text)) prompt(ctx, t, cur(), text);
        return;
      }
      case 'agent_message': {
        const text = str(payload.message);
        if (text) assistantText(ctx, t, cur(), text);
        return;
      }
      case 'token_count': {
        const info = isRec(payload.info) ? payload.info : undefined;
        const total = info && isRec(info.total_token_usage) ? info.total_token_usage : undefined;
        if (total) {
          const n = (k: string) => (typeof total[k] === 'number' ? (total[k] as number) : 0);
          ctx.hub.updateSession(s.id, { tokensIn: n('input_tokens'), tokensOut: n('output_tokens') });
        }
        return;
      }
      case 'task_complete':
      case 'turn_complete':
        turnDone(ctx, t, cur(), str(payload.last_agent_message));
        return;
      case 'turn_aborted':
        t.pending.clear();
        update(ctx, cur(), { status: 'idle', activity: 'idle', activityLabel: 'Interrompu', currentTool: undefined, pending: undefined });
        event(ctx, t, cur(), 'system', 'Tour interrompu');
        return;
      case 'error':
        event(ctx, t, cur(), 'error', truncate(str(payload.message) ?? 'Erreur', 400), { isError: true });
        return;
      default:
        return;
    }
  }

  if (type === 'response_item') {
    switch (str(payload.type)) {
      case 'message': {
        const text = textOf(payload.content);
        if (str(payload.role) === 'user') {
          if (text && !isCodexContext(text)) prompt(ctx, t, cur(), text);
        } else if (str(payload.role) === 'assistant' && text) {
          assistantText(ctx, t, cur(), text);
        }
        return;
      }
      case 'function_call': {
        const name = str(payload.name) ?? 'outil';
        const callId = str(payload.call_id) ?? uid('c');
        const args = parseArgs(payload.arguments);
        const escalated = args?.with_escalated_permissions === true || args?.sandbox_permissions === 'require_escalated';
        toolStart(ctx, t, cur(), callId, name, args, { needsApproval: escalated && t.approvalPolicy !== 'never' });
        return;
      }
      case 'custom_tool_call': {
        const name = str(payload.name) ?? 'outil';
        const callId = str(payload.call_id) ?? uid('c');
        const input = payload.input;
        if (name === 'apply_patch') {
          const files = patchFiles(input);
          toolStart(ctx, t, cur(), callId, 'apply_patch', { input });
          if (!passive(cur())) for (const f of files) ctx.hub.touchFile(s.id, f);
        } else {
          toolStart(ctx, t, cur(), callId, name, parseArgs(input));
        }
        return;
      }
      case 'local_shell_call': {
        const action = isRec(payload.action) ? payload.action : undefined;
        const callId = str(payload.call_id) ?? str(payload.id) ?? uid('c');
        toolStart(ctx, t, cur(), callId, 'local_shell', action ? { command: action.command } : undefined);
        return;
      }
      case 'function_call_output':
      case 'custom_tool_call_output': {
        const callId = str(payload.call_id);
        if (callId) toolEnd(ctx, t, cur(), callId, codexOutputError(payload.output));
        return;
      }
      case 'web_search_call': {
        const action = isRec(payload.action) ? payload.action : undefined;
        const q = action ? str(action.query) : undefined;
        update(ctx, cur(), { status: 'working', activity: 'browsing', activityLabel: q ? `Recherche « ${truncate(q, 40)} »` : 'Recherche sur le web' });
        if (q) event(ctx, t, cur(), 'tool', `Recherche « ${truncate(q, 40)} »`, { tool: 'web_search' });
        return;
      }
      case 'reasoning':
        if (!t.pending.size) update(ctx, cur(), { status: 'working', activity: 'thinking', activityLabel: 'Réfléchit' });
        return;
      default:
        return;
    }
  }
}

// ------------------------------------------------------------- heuristique

/**
 * Sans hooks, le transcript ne dit pas qu'une autorisation est demandée : un
 * outil sans résultat au-delà d'un délai raisonnable (ou une élévation Codex
 * explicite) fait lever la main au personnage.
 */
export function checkWaiting(ctx: ParseContext, t: Tracker, now = Date.now()): void {
  if (!t.sessionId || t.ignore) return;
  const s = ctx.hub.getSession(t.sessionId);
  if (!s || passive(s) || s.status === 'ended') return;
  let suspect: PendingTool | undefined;
  for (const p of t.pending.values()) {
    if (p.needsApproval || (p.suspectAfterMs > 0 && now - p.at > p.suspectAfterMs)) {
      suspect = p;
      break;
    }
  }
  if (suspect && s.status !== 'waiting') {
    ctx.hub.updateSession(s.id, {
      status: 'waiting',
      activity: 'waiting',
      activityLabel: suspect.needsApproval ? `Attend ton approbation dans le terminal : ${suspect.label}` : `Bloqué ? (autorisation probable dans le terminal) : ${suspect.label}`,
      pending: {
        id: uid('p_'),
        sessionId: s.id,
        toolName: suspect.name,
        summary: suspect.label,
        canAlwaysAllow: false,
        answerable: false,
        createdAt: now,
      },
    });
  } else if (!suspect && s.status === 'waiting' && s.pending && !s.hold) {
    ctx.hub.updateSession(s.id, { status: 'working', activity: 'thinking', activityLabel: 'Réfléchit', pending: undefined });
  }
}

