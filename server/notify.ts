import type { Hub } from '../shared/hub';
import type { SessionInfo, StreamMessage } from '../shared/types';
import { truncate } from '../shared/util';
import type { Config } from './config';

export interface Notification {
  title: string;
  message: string;
  /** 1 (min) à 5 (urgent), comme ntfy. */
  priority: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  sessionId?: string;
}

type Sender = (n: Notification) => Promise<void>;

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

/** ntfy : https://ntfy.sh/mon-sujet (ou serveur auto-hébergé). Publication JSON (UTF-8 sûr). */
export function ntfySender(topicUrl: string, token: string | undefined, clickUrl: string | undefined): Sender {
  const u = new URL(topicUrl);
  const topic = u.pathname.replace(/^\/+|\/+$/g, '');
  if (!topic) throw new Error('NOTIFY_NTFY doit contenir un sujet, ex. https://ntfy.sh/mon-qg-secret');
  const base = `${u.protocol}//${u.host}/`;
  return (n) =>
    postJson(
      base,
      {
        topic,
        title: n.title,
        message: n.message,
        priority: n.priority,
        tags: n.tags,
        ...(clickUrl ? { click: n.sessionId ? `${clickUrl}/#agent-${encodeURIComponent(n.sessionId)}` : clickUrl } : {}),
      },
      token ? { authorization: `Bearer ${token}` } : {},
    );
}

/** Webhook Discord, Slack, ou JSON générique. */
export function webhookSender(url: string, clickUrl: string | undefined): Sender {
  const host = new URL(url).hostname;
  return (n) => {
    const link = clickUrl ? (n.sessionId ? `${clickUrl}/#agent-${encodeURIComponent(n.sessionId)}` : clickUrl) : undefined;
    if (/(^|\.)discord(app)?\.com$/.test(host)) {
      return postJson(url, { username: 'Pixel AI Dashboard', content: truncate(`**${n.title}**\n${n.message}${link ? `\n${link}` : ''}`, 1900) });
    }
    if (/(^|\.)slack\.com$/.test(host)) {
      return postJson(url, { text: `*${n.title}*\n${n.message}${link ? `\n<${link}|Ouvrir le dashboard>` : ''}` });
    }
    return postJson(url, { ...n, url: link });
  };
}

/**
 * Pousse vers ton téléphone ce qui demande ton attention : demandes
 * d'autorisation, sessions qui attendent une consigne, rapports du Chef,
 * erreurs. Regroupe et limite les envois pour ne pas spammer.
 */
export class Notifier {
  private senders: Array<{ name: string; send: Sender }> = [];
  private lastByKey = new Map<string, number>();
  private sentThisMinute: number[] = [];
  private failures = new Map<string, number>();
  private prev = new Map<string, SessionInfo>();
  private unsubscribe?: () => void;

  constructor(
    private hub: Hub,
    cfg: Config,
  ) {
    const click = cfg.publicUrl;
    if (cfg.ntfyUrl) {
      try {
        this.senders.push({ name: 'ntfy', send: ntfySender(cfg.ntfyUrl, cfg.ntfyToken, click) });
      } catch (err) {
        console.warn(`[notify] ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (cfg.webhookUrl) {
      try {
        this.senders.push({ name: 'webhook', send: webhookSender(cfg.webhookUrl, click) });
      } catch {
        console.warn('[notify] NOTIFY_WEBHOOK invalide');
      }
    }
  }

  get channels(): string[] {
    return this.senders.map((s) => s.name);
  }

  start(): void {
    if (!this.senders.length) return;
    for (const s of this.hub.listSessions()) this.prev.set(s.id, s);
    this.unsubscribe = this.hub.subscribe((m) => this.onMessage(m));
  }

  stop(): void {
    this.unsubscribe?.();
  }

  private onMessage(m: StreamMessage): void {
    if (m.type === 'report') {
      const level = m.report.level;
      this.push(`report:${m.report.id}`, {
        title: `Rapport du Chef : ${m.report.title}`,
        message: truncate(m.report.body, 600),
        priority: level === 'warning' || level === 'question' ? 4 : 3,
        tags: [level === 'success' ? 'white_check_mark' : level === 'warning' ? 'warning' : level === 'question' ? 'question' : 'scroll'],
      });
      return;
    }
    if (m.type !== 'session') return;
    const s = m.session;
    const before = this.prev.get(s.id);
    this.prev.set(s.id, s);
    const where = s.host ? ` (${s.host})` : '';
    if (s.pending?.answerable && s.pending.id !== before?.pending?.id) {
      this.push(`perm:${s.id}`, {
        title: `${s.name}${where} attend ton feu vert`,
        message: s.pending.summary,
        priority: 4,
        tags: ['raised_hand'],
        sessionId: s.id,
      });
    } else if (s.hold && !before?.hold) {
      this.push(`hold:${s.id}`, {
        title: `${s.name}${where} attend ta prochaine consigne`,
        message: truncate(s.lastText, 400) || 'Tour terminé.',
        priority: 3,
        tags: ['speech_balloon'],
        sessionId: s.id,
      });
    } else if (s.status === 'error' && before && before.status !== 'error' && s.role !== 'subagent') {
      this.push(`err:${s.id}`, {
        title: `${s.name}${where} a rencontré une erreur`,
        message: s.activityLabel ?? 'Erreur',
        priority: 4,
        tags: ['x'],
        sessionId: s.id,
      });
    }
  }

  private push(key: string, n: Notification): void {
    const now = Date.now();
    const last = this.lastByKey.get(key) ?? 0;
    if (now - last < 15_000) return;
    this.sentThisMinute = this.sentThisMinute.filter((t) => now - t < 60_000);
    if (this.sentThisMinute.length >= 12) return;
    this.lastByKey.set(key, now);
    this.sentThisMinute.push(now);
    for (const { name, send } of this.senders) {
      send(n).then(
        () => this.failures.delete(name),
        (err) => {
          const count = (this.failures.get(name) ?? 0) + 1;
          this.failures.set(name, count);
          if (count === 1 || count % 20 === 0) console.warn(`[notify] envoi ${name} impossible :`, err instanceof Error ? err.message : err);
        },
      );
    }
  }

  /** Message de test (bouton « Tester » de l'interface). */
  async test(): Promise<string[]> {
    const ok: string[] = [];
    for (const { name, send } of this.senders) {
      try {
        await send({ title: 'Pixel AI Dashboard', message: 'Les notifications fonctionnent 🎉', priority: 3, tags: ['tada'] });
        ok.push(name);
      } catch (err) {
        throw new Error(`${name} : ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return ok;
  }
}
