import express, { type Request, type Response, type Router } from 'express';
import type { HookIngestor } from './hooks';
import type { PollResult, RemoteControl } from './remote';

/** Durée d'un appel d'attente : courte pour survivre aux proxys et tunnels. */
export const POLL_MS = 45_000;

export interface HookRoutesDeps {
  ingestor: Pick<HookIngestor, 'handle'>;
  remote: Pick<RemoteControl, 'enabled' | 'holdPermission' | 'holdStop' | 'poll'>;
  pollMs?: number;
}

/**
 * Routes des hooks de Claude Code et de Codex (relayés par hooks/pixel-hook.mjs
 * ou envoyés directement par un hook HTTP).
 *
 * - `POST /api/hooks` : événement ordinaire, réponse vide immédiate.
 * - `POST /api/hooks/decide` : PermissionRequest et Stop. En mode télécommande,
 *   la demande est retenue : la réponse arrive dès que tu décides, ou
 *   `{ wait: ticket }` au bout de `pollMs` pour que le hook rappelle
 *   `POST /api/hooks/decide/:ticket`. Avec `?sync=1` (hook HTTP natif), la
 *   requête attend jusqu'au bout et renvoie directement la sortie du hook.
 */
export function hookRoutes({ ingestor, remote, pollMs = POLL_MS }: HookRoutesDeps): Router {
  const router = express.Router();
  const hookJson = express.json({ limit: '5mb', type: () => true });
  const managed = (req: Request) => req.get('x-pixel-managed') === '1';

  router.post('/api/hooks', hookJson, (req, res) => {
    try {
      ingestor.handle(req.body, { managed: managed(req) });
    } catch (err) {
      console.warn('[hooks] événement ignoré :', err);
    }
    res.json({});
  });

  /** Attend une réponse pour un ticket ; `sync` boucle jusqu'au bout (hooks HTTP natifs). */
  async function answer(res: Response, ticket: string | null, sync: boolean): Promise<void> {
    const ctrl = new AbortController();
    // Attention : depuis Node 16, `req` émet « close » dès que le corps JSON est lu.
    // Seule la fermeture de la réponse avant son envoi signale un client parti.
    res.on('close', () => {
      if (!res.writableFinished) ctrl.abort();
    });
    if (!ticket) {
      res.json(sync ? {} : { output: null });
      return;
    }
    let result: PollResult = await remote.poll(ticket, pollMs, ctrl.signal);
    while (sync && 'wait' in result && !ctrl.signal.aborted) result = await remote.poll(ticket, pollMs, ctrl.signal);
    if (ctrl.signal.aborted || res.headersSent) return;
    if (sync) res.json('output' in result ? (result.output ?? {}) : {});
    else res.json(result);
  }

  router.post('/api/hooks/decide', hookJson, async (req, res) => {
    let ticket: string | null = null;
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const result = ingestor.handle(body, { managed: managed(req) });
      if (result.accepted && result.sessionId && remote.enabled) {
        if (result.event === 'PermissionRequest' && result.requestId) {
          ticket = remote.holdPermission(result.sessionId, result.requestId, body.permission_suggestions);
        } else if (result.event === 'Stop') {
          ticket = remote.holdStop(result.sessionId, { stopHookActive: body.stop_hook_active === true });
        }
      }
    } catch (err) {
      console.warn('[hooks] décision impossible :', err);
    }
    await answer(res, ticket, req.query.sync === '1');
  });

  router.post('/api/hooks/decide/:ticket', async (req: Request, res: Response) => {
    const ticket = typeof req.params.ticket === 'string' ? req.params.ticket : null;
    await answer(res, ticket, req.query.sync === '1');
  });

  return router;
}
