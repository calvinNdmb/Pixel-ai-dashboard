import type { Hub } from '../shared/hub';
import type { PermissionDecision } from '../shared/types';
import { truncate, uid } from '../shared/util';

/** Sortie JSON d'un hook (format commun à Claude Code et Codex). */
export type HookOutput = Record<string, unknown>;

export type PollResult = { output: HookOutput | null } | { wait: string };

interface Hold {
  ticket: string;
  kind: 'permission' | 'stop';
  sessionId: string;
  /** Demande d'autorisation concernée (kind = permission). */
  requestId?: string;
  suggestions?: unknown[];
  /** undefined = pas encore de réponse ; null = rendre la main au terminal. */
  result?: HookOutput | null;
  listeners: Set<() => void>;
  lastPollAt: number;
  expiresAt: number;
}

export interface RemoteOptions {
  /** Durée max d'attente d'une réponse à une demande d'autorisation. */
  permissionWaitMs: number;
  /** Durée max d'attente d'une nouvelle consigne après une fin de tour. */
  stopWaitMs: number;
  /** Un hook qui ne revient plus interroger le serveur est considéré abandonné. */
  abandonAfterMs?: number;
  /** Appelé quand une session commence à attendre l'utilisateur (notifications). */
  onHold?: (sessionId: string, kind: Hold['kind'], summary: string) => void;
}

/**
 * Mode télécommande : les hooks `PermissionRequest` et `Stop` des sessions
 * terminal (Claude Code ou Codex) sont retenus jusqu'à ce que tu répondes
 * depuis le dashboard — téléphone compris. Sans réponse (ou télécommande
 * coupée), la main revient au terminal comme d'habitude.
 *
 * Le hook interroge le serveur par appels successifs de ~45 s (« tickets »),
 * ce qui survit aux proxys et tunnels qui coupent les requêtes longues.
 */
export class RemoteControl {
  private holds = new Map<string, Hold>();
  private reaper: ReturnType<typeof setInterval>;

  constructor(
    private hub: Hub,
    private opts: RemoteOptions,
  ) {
    this.reaper = setInterval(() => this.reap(), 5000);
    this.reaper.unref?.();
  }

  get enabled(): boolean {
    return this.hub.info.remoteMode;
  }

  setEnabled(on: boolean): void {
    if (this.hub.info.remoteMode === on) return;
    this.hub.setInfo({ remoteMode: on });
    if (!on) this.releaseAll();
  }

  dispose(): void {
    clearInterval(this.reaper);
    this.releaseAll();
  }

  // ------------------------------------------------------------ retenues

  /** Retient une demande d'autorisation d'une session terminal. Renvoie le ticket, ou null. */
  holdPermission(sessionId: string, requestId: string, suggestions?: unknown): string | null {
    if (!this.enabled) return null;
    const session = this.hub.getSession(sessionId);
    if (!session?.pending || session.pending.id !== requestId) return null;
    const hold = this.createHold('permission', sessionId, this.opts.permissionWaitMs, {
      requestId,
      // Codex refuse `updatedPermissions` dans sa réponse (la demande serait rejetée) :
      // les règles « toujours autoriser » ne concernent que Claude Code.
      suggestions: session.agent === 'claude' && Array.isArray(suggestions) ? suggestions : undefined,
    });
    this.hub.updateSession(sessionId, {
      pending: { ...session.pending, answerable: true },
      activityLabel: `Attend ton feu vert : ${session.pending.summary}`,
    });
    this.hub.addEvent(sessionId, 'permission', 'Télécommande : la demande attend ta réponse dans le dashboard');
    this.opts.onHold?.(sessionId, 'permission', session.pending.summary);
    return hold.ticket;
  }

  /** Retient une fin de tour : la session attend ta prochaine consigne. Renvoie le ticket, ou null. */
  holdStop(sessionId: string, opts: { stopHookActive?: boolean } = {}): string | null {
    if (!this.enabled) return null;
    const session = this.hub.getSession(sessionId);
    if (!session || session.status === 'ended') return null;
    // Une seule retenue par session.
    for (const h of this.holds.values()) if (h.sessionId === sessionId && h.kind === 'stop') this.finish(h, null);
    const hold = this.createHold('stop', sessionId, this.opts.stopWaitMs, {});
    this.hub.updateSession(sessionId, {
      hold: { kind: 'stop', since: Date.now(), expiresAt: hold.expiresAt },
      status: 'waiting',
      activity: 'waiting',
      activityLabel: 'Attend ta prochaine consigne (télécommande)',
    });
    this.hub.addEvent(
      sessionId,
      'system',
      opts.stopHookActive ? 'Consigne traitée — attend la suivante' : 'Tour terminé — attend ta prochaine consigne depuis le dashboard',
    );
    this.opts.onHold?.(sessionId, 'stop', truncate(session.lastText, 140) || 'Tour terminé');
    return hold.ticket;
  }

  private createHold(kind: Hold['kind'], sessionId: string, waitMs: number, extra: Partial<Hold>): Hold {
    const now = Date.now();
    const hold: Hold = {
      ticket: uid('k_'),
      kind,
      sessionId,
      listeners: new Set(),
      lastPollAt: now,
      expiresAt: now + waitMs,
      ...extra,
    };
    this.holds.set(hold.ticket, hold);
    return hold;
  }

  // -------------------------------------------------------------- réponses

  answerPermission(requestId: string, decision: PermissionDecision, message?: string): boolean {
    const hold = [...this.holds.values()].find((h) => h.kind === 'permission' && h.requestId === requestId);
    if (!hold || hold.result !== undefined) return false;
    const behavior =
      decision === 'deny'
        ? { behavior: 'deny', message: message?.trim() || "Refusé par l'utilisateur depuis le Pixel AI Dashboard." }
        : {
            behavior: 'allow',
            ...(decision === 'always' && hold.suggestions?.length ? { updatedPermissions: hold.suggestions } : {}),
          };
    this.finish(hold, { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: behavior } });
    this.hub.updateSession(hold.sessionId, {
      pending: undefined,
      status: 'working',
      activity: 'thinking',
      activityLabel: decision === 'deny' ? 'Demande refusée' : 'Reprend le travail',
    });
    this.hub.addEvent(
      hold.sessionId,
      'permission',
      decision === 'deny' ? 'Autorisation refusée (télécommande)' : decision === 'always' ? 'Autorisation accordée (toujours, télécommande)' : 'Autorisation accordée (télécommande)',
    );
    return true;
  }

  /** Donne une nouvelle consigne à une session retenue en fin de tour. */
  reply(sessionId: string, text: string): boolean {
    const hold = [...this.holds.values()].find((h) => h.kind === 'stop' && h.sessionId === sessionId);
    if (!hold || hold.result !== undefined) return false;
    const clean = text.trim();
    if (!clean) return false;
    this.finish(hold, {
      decision: 'block',
      reason: `Nouvelle consigne de l'utilisateur, envoyée à distance depuis le Pixel AI Dashboard :\n\n${clean}`,
    });
    this.hub.updateSession(sessionId, {
      hold: undefined,
      status: 'working',
      activity: 'thinking',
      activityLabel: 'Reprend avec ta consigne',
    });
    this.hub.addEvent(sessionId, 'prompt', clean);
    return true;
  }

  /** Rend la main au terminal sans répondre (la session termine son tour normalement). */
  release(sessionId: string): boolean {
    let released = false;
    for (const h of this.holds.values()) {
      if (h.sessionId === sessionId && h.result === undefined) {
        this.finish(h, null);
        released = true;
      }
    }
    if (released) this.hub.addEvent(sessionId, 'system', 'Télécommande : la main revient au terminal');
    return released;
  }

  /** La session a-t-elle une retenue active (réponse possible) ? */
  isHeld(sessionId: string): boolean {
    for (const h of this.holds.values()) if (h.sessionId === sessionId && h.result === undefined) return true;
    return false;
  }

  // --------------------------------------------------------------- attente

  /** Attend une réponse (au plus waitMs) pour un ticket. */
  poll(ticket: string, waitMs: number, signal?: AbortSignal): Promise<PollResult> {
    const hold = this.holds.get(ticket);
    if (!hold) return Promise.resolve({ output: null });
    hold.lastPollAt = Date.now();
    if (hold.result !== undefined) {
      this.holds.delete(ticket);
      return Promise.resolve({ output: hold.result });
    }
    if (signal?.aborted) return Promise.resolve({ wait: ticket });
    return new Promise((resolve) => {
      const done = (r: PollResult) => {
        clearTimeout(timer);
        hold.listeners.delete(onResult);
        signal?.removeEventListener('abort', onAbort);
        resolve(r);
      };
      const onResult = () => {
        this.holds.delete(ticket);
        done({ output: hold.result ?? null });
      };
      const onAbort = () => done({ wait: ticket });
      const timer = setTimeout(() => {
        hold.lastPollAt = Date.now();
        done({ wait: ticket });
      }, Math.max(1000, waitMs));
      hold.listeners.add(onResult);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private finish(hold: Hold, result: HookOutput | null): void {
    if (hold.result !== undefined) return;
    hold.result = result;
    if (result === null) this.restoreTerminal(hold);
    for (const l of [...hold.listeners]) l();
    // Personne n'attend ce ticket : on le garde un peu pour le prochain appel.
    if (!hold.listeners.size) hold.lastPollAt = Date.now();
  }

  /** La main revient au terminal : on met à jour l'affichage. */
  private restoreTerminal(hold: Hold): void {
    const s = this.hub.getSession(hold.sessionId);
    if (!s) return;
    const pending = s.pending;
    if (hold.kind === 'permission' && pending && pending.id === hold.requestId) {
      this.hub.updateSession(hold.sessionId, {
        pending: { ...pending, answerable: false },
        activityLabel: `Attend ta réponse dans le terminal : ${pending.summary}`,
      });
    }
    if (hold.kind === 'stop' && s.hold) {
      this.hub.updateSession(hold.sessionId, {
        hold: undefined,
        status: 'idle',
        activity: 'idle',
        activityLabel: 'Attend ta prochaine demande (terminal)',
      });
    }
  }

  private releaseAll(): void {
    for (const h of this.holds.values()) this.finish(h, null);
  }

  private reap(now = Date.now()): void {
    const abandon = this.opts.abandonAfterMs ?? 90_000;
    for (const [ticket, h] of this.holds) {
      if (h.result !== undefined) {
        // réponse jamais récupérée : on nettoie
        if (now - h.lastPollAt > abandon) this.holds.delete(ticket);
        continue;
      }
      if (now > h.expiresAt) {
        this.finish(h, null);
        this.hub.addEvent(h.sessionId, 'system', 'Télécommande : délai dépassé, la main revient au terminal');
      } else if (now - h.lastPollAt > abandon && !h.listeners.size) {
        // Le hook ne demande plus rien (session fermée, Échap dans le terminal…).
        this.finish(h, null);
        this.holds.delete(ticket);
      }
    }
  }
}
