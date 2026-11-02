import type { CanUseTool, PermissionResult, PermissionUpdate } from '@anthropic-ai/claude-agent-sdk';
import { describeTool } from '../../shared/activity';
import type { Hub } from '../../shared/hub';
import type { PermissionDecision, PermissionRequest } from '../../shared/types';
import { safeJson, uid } from '../../shared/util';

interface Pending {
  req: PermissionRequest;
  input: Record<string, unknown>;
  suggestions?: PermissionUpdate[];
  resolve: (r: PermissionResult) => void;
}

/**
 * Relais des demandes d'autorisation : quand un agent veut exécuter une action
 * sensible, son personnage lève la main et l'utilisateur tranche dans le
 * dashboard (Autoriser / Toujours / Refuser).
 */
export class PermissionBroker {
  private pending = new Map<string, Pending>();

  constructor(
    private hub: Hub,
    private onRequest?: (req: PermissionRequest) => void,
  ) {}

  /** Callback `canUseTool` à passer au SDK pour une session donnée. */
  forSession(sessionId: string): CanUseTool {
    return (toolName, input, options) =>
      new Promise<PermissionResult>((resolve) => {
        const summary = options.title?.trim() || describeTool(toolName, input);
        const detail =
          toolName === 'ExitPlanMode' && typeof input.plan === 'string' ? input.plan.slice(0, 4000) : safeJson(input, 1500);
        const req: PermissionRequest = {
          id: uid('p_'),
          sessionId,
          toolName,
          summary,
          detail,
          canAlwaysAllow: Boolean(options.suggestions?.length) && !options.suppressAlwaysAllowRule,
          answerable: true,
          createdAt: Date.now(),
        };
        this.pending.set(req.id, { req, input, suggestions: options.suggestions, resolve });
        this.hub.updateSession(sessionId, {
          pending: req,
          status: 'waiting',
          activity: 'waiting',
          activityLabel: `Attend ton feu vert : ${summary}`,
        });
        this.hub.addEvent(sessionId, 'permission', `Demande d'autorisation : ${summary}`, { tool: toolName });
        options.signal.addEventListener(
          'abort',
          () => this.settle(req.id, { behavior: 'deny', message: 'Demande annulée.' }, 'Demande annulée'),
          { once: true },
        );
        this.onRequest?.(req);
      });
  }

  answer(requestId: string, decision: PermissionDecision, message?: string): boolean {
    const p = this.pending.get(requestId);
    if (!p) return false;
    if (decision === 'deny') {
      this.settle(
        requestId,
        {
          behavior: 'deny',
          message: message?.trim() || "L'utilisateur a refusé cette action. Propose une alternative ou demande-lui comment procéder.",
          decisionClassification: 'user_reject',
        },
        'Autorisation refusée',
      );
    } else {
      this.settle(
        requestId,
        {
          behavior: 'allow',
          updatedInput: p.input,
          ...(decision === 'always' && p.suggestions?.length ? { updatedPermissions: p.suggestions } : {}),
          decisionClassification: decision === 'always' ? 'user_permanent' : 'user_temporary',
        },
        decision === 'always' ? 'Autorisation accordée (toujours)' : 'Autorisation accordée',
      );
    }
    return true;
  }

  /** Refuse toutes les demandes en attente d'une session (arrêt, interruption…). */
  cancelSession(sessionId: string, label = 'Demande annulée'): void {
    for (const [id, p] of this.pending) {
      if (p.req.sessionId === sessionId) this.settle(id, { behavior: 'deny', message: label }, label);
    }
  }

  private settle(requestId: string, result: PermissionResult, label: string): void {
    const p = this.pending.get(requestId);
    if (!p) return;
    this.pending.delete(requestId);
    const next = [...this.pending.values()].find((o) => o.req.sessionId === p.req.sessionId);
    const session = this.hub.getSession(p.req.sessionId);
    if (session && session.status !== 'ended') {
      this.hub.updateSession(
        p.req.sessionId,
        next
          ? { pending: next.req, activityLabel: `Attend ton feu vert : ${next.req.summary}` }
          : { pending: undefined, status: 'working', activity: 'thinking', activityLabel: 'Reprend le travail' },
      );
    }
    this.hub.addEvent(p.req.sessionId, 'permission', label);
    p.resolve(result);
  }
}
