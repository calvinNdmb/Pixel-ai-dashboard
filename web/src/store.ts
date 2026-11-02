import { create } from 'zustand';
import type { ChatMessage, Report, ServerInfo, SessionInfo, StreamMessage, TimelineEvent } from '../../shared/types';
import { uid } from '../../shared/util';
import type { ConnStatus } from './backend';

export type Tab = 'chef' | 'agents' | 'journal';
export type ThemeChoice = 'system' | 'light' | 'dark';

export interface Toast {
  id: string;
  kind: 'info' | 'success' | 'warning' | 'error';
  text: string;
  action?: { label: string; tab: Tab; sessionId?: string };
}

const MAX_EVENTS = 2500;

interface State {
  conn: ConnStatus;
  everConnected: boolean;
  ready: boolean;
  info: ServerInfo | null;
  sessions: Record<string, SessionInfo>;
  events: TimelineEvent[];
  reports: Report[];
  chat: ChatMessage[];
  lastReportAt: number;
  selectedId: string | null;
  tab: Tab;
  unreadReports: number;
  toasts: Toast[];
  showNames: boolean;
  theme: ThemeChoice;
  newAgentOpen: boolean;
  helpOpen: boolean;

  apply(m: StreamMessage): void;
  setConn(c: ConnStatus): void;
  select(id: string | null, opts?: { openTab?: boolean }): void;
  setTab(tab: Tab): void;
  toast(t: Omit<Toast, 'id'>): void;
  dismissToast(id: string): void;
  setShowNames(v: boolean): void;
  setTheme(t: ThemeChoice): void;
  setNewAgentOpen(v: boolean): void;
  setHelpOpen(v: boolean): void;
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage indisponible : préférence non mémorisée */
  }
}

export const useStore = create<State>((set, get) => ({
  conn: 'connecting',
  everConnected: false,
  ready: false,
  info: null,
  sessions: {},
  events: [],
  reports: [],
  chat: [],
  lastReportAt: 0,
  selectedId: null,
  tab: 'chef',
  unreadReports: 0,
  toasts: [],
  showNames: load('pixel-show-names', true),
  theme: load<ThemeChoice>('pixel-theme', 'system'),
  newAgentOpen: false,
  helpOpen: false,

  apply(m) {
    switch (m.type) {
      case 'snapshot': {
        const sessions: Record<string, SessionInfo> = {};
        for (const s of m.sessions) sessions[s.id] = s;
        const last = m.reports[m.reports.length - 1];
        set({
          info: m.info,
          sessions,
          events: m.events.slice(-MAX_EVENTS),
          reports: m.reports,
          chat: m.chat,
          ready: true,
          lastReportAt: Math.max(get().lastReportAt, last?.ts ?? 0),
        });
        break;
      }
      case 'info':
        set({ info: m.info });
        break;
      case 'session': {
        const prev = get().sessions[m.session.id];
        set({ sessions: { ...get().sessions, [m.session.id]: m.session } });
        // Nouvelle demande d'autorisation : on prévient.
        if (m.session.pending && m.session.pending.id !== prev?.pending?.id && m.session.source !== 'hook') {
          notify(`${m.session.name} attend ton feu vert`, m.session.pending.summary);
        }
        break;
      }
      case 'session_removed': {
        const { [m.id]: _removed, ...rest } = get().sessions;
        void _removed;
        set({ sessions: rest, selectedId: get().selectedId === m.id ? null : get().selectedId });
        break;
      }
      case 'event': {
        const events = get().events;
        const next = events.length >= MAX_EVENTS ? events.slice(-MAX_EVENTS + 200) : events.slice();
        next.push(m.event);
        set({ events: next });
        break;
      }
      case 'report': {
        const s = get();
        set({
          reports: [...s.reports, m.report],
          lastReportAt: m.report.ts,
          unreadReports: s.tab === 'chef' ? s.unreadReports : s.unreadReports + 1,
        });
        get().toast({
          kind: m.report.level === 'warning' ? 'warning' : m.report.level === 'success' ? 'success' : 'info',
          text: `Rapport du Chef : ${m.report.title}`,
          action: { label: 'Lire', tab: 'chef' },
        });
        notify('Rapport du Chef', m.report.title);
        break;
      }
      case 'chat':
        set({ chat: [...get().chat, m.message].slice(-600) });
        break;
      default:
        break;
    }
  },

  setConn(c) {
    set({ conn: c, everConnected: get().everConnected || c === 'open' });
  },

  select(id, opts) {
    const s = get();
    const session = id ? s.sessions[id] : undefined;
    let tab = s.tab;
    if (opts?.openTab && session) tab = session.role === 'manager' ? 'chef' : 'agents';
    set({ selectedId: id, tab, unreadReports: tab === 'chef' ? 0 : s.unreadReports });
  },

  setTab(tab) {
    set({ tab, unreadReports: tab === 'chef' ? 0 : get().unreadReports });
  },

  toast(t) {
    const toast: Toast = { ...t, id: uid('t_') };
    set({ toasts: [...get().toasts.slice(-3), toast] });
    setTimeout(() => get().dismissToast(toast.id), t.kind === 'error' ? 8000 : 5000);
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },

  setShowNames(v) {
    save('pixel-show-names', v);
    set({ showNames: v });
  },

  setTheme(theme) {
    save('pixel-theme', theme);
    set({ theme });
  },

  setNewAgentOpen(v) {
    set({ newAgentOpen: v });
  },

  setHelpOpen(v) {
    set({ helpOpen: v });
  },
}));

/** Notification système quand l'onglet est en arrière-plan (si l'utilisateur l'a autorisée). */
function notify(title: string, body: string): void {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !document.hidden) return;
    new Notification(title, { body, tag: 'pixel-ai-dashboard' });
  } catch {
    /* notifications indisponibles */
  }
}

export function sessionList(sessions: Record<string, SessionInfo>): SessionInfo[] {
  return Object.values(sessions);
}

const STATUS_ORDER: Record<SessionInfo['status'], number> = {
  waiting: 0,
  error: 1,
  working: 2,
  starting: 3,
  idle: 4,
  ended: 5,
};

export function sortSessions(list: SessionInfo[]): SessionInfo[] {
  return [...list].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.updatedAt - a.updatedAt);
}
