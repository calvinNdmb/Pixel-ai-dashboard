import type {
  ChatMessage,
  EventKind,
  Report,
  ReportLevel,
  ServerInfo,
  SessionInfo,
  StreamMessage,
  TimelineEvent,
} from './types';
import { hashString, truncate, uid } from './util';

const MAX_EVENTS = 4000;
const MAX_CHAT = 600;
const MAX_REPORTS = 300;
const MAX_FILES = 20;

type Listener = (msg: StreamMessage) => void;

/** Construit un ServerInfo complet à partir de quelques champs. */
export function makeInfo(p: Partial<ServerInfo> & Pick<ServerInfo, 'mode'>): ServerInfo {
  return {
    version: 'dev',
    sdkAvailable: false,
    codexAvailable: false,
    defaultCwd: '.',
    maxWorkers: 6,
    defaultPermissionMode: 'default',
    authRequired: false,
    remoteMode: false,
    hostName: 'local',
    notifyChannels: [],
    watching: false,
    ...p,
  };
}

export type NewSession = Pick<SessionInfo, 'name' | 'role' | 'source'> &
  Partial<Omit<SessionInfo, 'name' | 'role' | 'source'>>;

/**
 * Le « Hub » est la source de vérité de l'état du QG : sessions, journal,
 * rapports et conversation avec le Chef. Il ne dépend ni de Node ni du DOM,
 * ce qui permet de l'utiliser côté serveur comme dans la démo navigateur.
 */
export class Hub {
  private sessions = new Map<string, SessionInfo>();
  private events: TimelineEvent[] = [];
  private reports: Report[] = [];
  private chat: ChatMessage[] = [];
  private listeners = new Set<Listener>();

  constructor(public info: ServerInfo) {}

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(msg: StreamMessage): void {
    for (const l of this.listeners) {
      try {
        l(msg);
      } catch (err) {
        console.error('[hub] listener error', err);
      }
    }
  }

  snapshot(): Extract<StreamMessage, { type: 'snapshot' }> {
    return {
      type: 'snapshot',
      info: this.info,
      sessions: [...this.sessions.values()],
      events: this.events.slice(-1500),
      reports: [...this.reports],
      chat: [...this.chat],
    };
  }

  setInfo(patch: Partial<ServerInfo>): void {
    this.info = { ...this.info, ...patch };
    this.emit({ type: 'info', info: this.info });
  }

  // ---------------------------------------------------------------- sessions

  listSessions(): SessionInfo[] {
    return [...this.sessions.values()];
  }

  getSession(id: string): SessionInfo | undefined {
    return this.sessions.get(id);
  }

  findByAgentSessionId(agentSessionId: string): SessionInfo | undefined {
    for (const s of this.sessions.values()) if (s.agentSessionId === agentSessionId) return s;
    return undefined;
  }

  createSession(init: NewSession): SessionInfo {
    const now = Date.now();
    const id = init.id ?? uid('s_');
    const session: SessionInfo = {
      agent: 'claude',
      status: 'starting',
      activity: 'idle',
      createdAt: now,
      updatedAt: now,
      costUsd: 0,
      tokensIn: 0,
      tokensOut: 0,
      toolUses: 0,
      turns: 0,
      files: [],
      seed: hashString(id + init.name),
      controllable: false,
      ...init,
      id,
    };
    this.sessions.set(id, session);
    this.emit({ type: 'session', session });
    return session;
  }

  updateSession(id: string, patch: Partial<SessionInfo>): SessionInfo | undefined {
    const prev = this.sessions.get(id);
    if (!prev) return undefined;
    const next: SessionInfo = { ...prev, ...patch, id, updatedAt: Date.now() };
    this.sessions.set(id, next);
    this.emit({ type: 'session', session: next });
    return next;
  }

  /** Ajoute un fichier en tête de la liste des fichiers touchés. */
  touchFile(id: string, file: string): void {
    const s = this.sessions.get(id);
    if (!s) return;
    const files = [file, ...s.files.filter((f) => f !== file)].slice(0, MAX_FILES);
    this.updateSession(id, { files });
  }

  removeSession(id: string): void {
    if (!this.sessions.delete(id)) return;
    this.emit({ type: 'session_removed', id });
  }

  // ------------------------------------------------------------------ events

  addEvent(
    sessionId: string,
    kind: EventKind,
    text: string,
    extra: { tool?: string; isError?: boolean } = {},
  ): TimelineEvent {
    const event: TimelineEvent = {
      id: uid('e_'),
      sessionId,
      ts: Date.now(),
      kind,
      text: truncate(text, 2000),
      ...extra,
    };
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    this.emit({ type: 'event', event });
    return event;
  }

  sessionEvents(sessionId: string, limit = 50): TimelineEvent[] {
    const out: TimelineEvent[] = [];
    for (let i = this.events.length - 1; i >= 0 && out.length < limit; i--) {
      const e = this.events[i]!;
      if (e.sessionId === sessionId) out.push(e);
    }
    return out.reverse();
  }

  // ----------------------------------------------------------------- reports

  addReport(level: ReportLevel, title: string, body: string, sessionIds: string[] = []): Report {
    const report: Report = { id: uid('r_'), ts: Date.now(), level, title, body, sessionIds };
    this.reports.push(report);
    if (this.reports.length > MAX_REPORTS) this.reports.splice(0, this.reports.length - MAX_REPORTS);
    this.emit({ type: 'report', report });
    this.addChat('manager', body, report.id);
    return report;
  }

  listReports(): Report[] {
    return [...this.reports];
  }

  // -------------------------------------------------------------------- chat

  addChat(from: ChatMessage['from'], text: string, reportId?: string): ChatMessage {
    const message: ChatMessage = { id: uid('c_'), ts: Date.now(), from, text, ...(reportId ? { reportId } : {}) };
    this.chat.push(message);
    if (this.chat.length > MAX_CHAT) this.chat.splice(0, this.chat.length - MAX_CHAT);
    this.emit({ type: 'chat', message });
    return message;
  }

  /** Restaure un état sauvegardé (rapports + conversation + sessions terminées). */
  restore(data: { reports?: Report[]; chat?: ChatMessage[]; sessions?: SessionInfo[]; events?: TimelineEvent[] }): void {
    if (data.reports) this.reports = data.reports.slice(-MAX_REPORTS);
    if (data.chat) this.chat = data.chat.slice(-MAX_CHAT);
    if (data.events) this.events = data.events.slice(-MAX_EVENTS);
    for (const s of data.sessions ?? []) this.sessions.set(s.id, s);
  }

  /** Données à persister sur disque. */
  persistable(): { reports: Report[]; chat: ChatMessage[]; sessions: SessionInfo[]; events: TimelineEvent[] } {
    return {
      reports: this.reports,
      chat: this.chat,
      sessions: [...this.sessions.values()],
      events: this.events.slice(-1500),
    };
  }
}
