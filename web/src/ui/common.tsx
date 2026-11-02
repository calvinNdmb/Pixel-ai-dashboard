import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { ACTIVITY_LABELS } from '../../../shared/activity';
import type { AgentKind, SessionInfo, SessionStatus } from '../../../shared/types';
import type { Backend } from '../backend';
import { characterFrame } from '../game/characters';
import { appearanceFor } from '../game/palette';
import { useStore } from '../store';

// ------------------------------------------------------------------ backend

const BackendContext = createContext<Backend | null>(null);
export const BackendProvider = BackendContext.Provider;

export function useBackend(): Backend {
  const b = useContext(BackendContext);
  if (!b) throw new Error('BackendProvider manquant');
  return b;
}

/** Exécute une commande et affiche une notification en cas d'erreur. */
export function useAction() {
  const toast = useStore((s) => s.toast);
  return useCallback(
    async (fn: () => Promise<unknown>, success?: string): Promise<boolean> => {
      try {
        await fn();
        if (success) toast({ kind: 'success', text: success });
        return true;
      } catch (err) {
        toast({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
        return false;
      }
    },
    [toast],
  );
}

// ------------------------------------------------------------------ avatar

/** Portrait du personnage, issu des mêmes sprites que le monde. */
export function Avatar({ session, scale = 2 }: { session: Pick<SessionInfo, 'seed' | 'role' | 'agent'>; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, 16, 20);
    g.drawImage(characterFrame(appearanceFor(session.seed, session.role, session.agent), { dir: 'down', pose: 'stand', frame: 0 }), 0, 0);
  }, [session.seed, session.role, session.agent]);
  return <canvas ref={ref} width={16} height={20} className="avatar" style={{ width: 16 * scale, height: 20 * scale }} aria-hidden />;
}

// ------------------------------------------------------------- statut, badges

export const STATUS_LABELS: Record<SessionStatus, string> = {
  starting: 'Arrive',
  working: 'Au travail',
  idle: 'Disponible',
  waiting: 'Attend ton feu vert',
  error: 'Erreur',
  ended: 'Terminée',
};

export function StatusChip({ session }: { session: SessionInfo }) {
  let label = STATUS_LABELS[session.status];
  if (session.hold) label = 'Attend ta consigne';
  else if (session.status === 'waiting' && session.pending && !session.pending.answerable) label = 'Attend une réponse (terminal)';
  else if (session.status === 'waiting' && !session.pending && session.source !== 'sdk' && session.source !== 'demo') label = 'Attend une réponse';
  return <span className={`chip status-${session.hold ? 'waiting' : session.status}`}>{label}</span>;
}

export const AGENT_LABELS: Record<AgentKind, string> = { claude: 'Claude Code', codex: 'Codex' };

/** Session lancée hors du dashboard (terminal, IDE…), suivie par hooks ou transcript. */
export const isExternal = (s: Pick<SessionInfo, 'source'>) => s.source === 'hook' || s.source === 'watch';

export function SourceBadge({ session }: { session: SessionInfo }) {
  const tool = AGENT_LABELS[session.agent];
  if (session.role === 'manager') return <span className="badge badge-chef">Chef</span>;
  if (session.role === 'subagent') return <span className="badge badge-sub" title="Sous-agent lancé par un autre agent">Sous-agent</span>;
  if (session.source === 'hook')
    return (
      <span className="badge badge-hook" title={`Session ${tool} ouverte dans un terminal, suivie via les hooks (pilotable avec la télécommande)`}>
        Terminal
      </span>
    );
  if (session.source === 'watch')
    return (
      <span className="badge badge-watch" title={`Session ${tool} ouverte dans un terminal, lue dans son transcript (lecture seule)`}>
        Observée
      </span>
    );
  if (session.source === 'demo') return <span className="badge badge-demo">Démo</span>;
  return (
    <span className="badge badge-sdk" title={`Session pilotée par le dashboard (SDK ${tool})`}>
      Agent
    </span>
  );
}

/** Badges de l'outil (Codex) et de la machine (si ce n'est pas celle du dashboard). */
export function OriginBadges({ session }: { session: SessionInfo }) {
  const serverHost = useStore((st) => st.info?.hostName);
  const remoteHost = session.host && session.host !== serverHost ? session.host : null;
  return (
    <>
      {session.agent === 'codex' ? (
        <span className="badge badge-codex" title="Session Codex (OpenAI)">
          Codex
        </span>
      ) : null}
      {remoteHost ? (
        <span className="badge badge-host" title={`Tourne sur la machine « ${remoteHost} »`}>
          @{remoteHost}
        </span>
      ) : null}
    </>
  );
}

export function activityText(session: SessionInfo): string {
  return session.activityLabel || ACTIVITY_LABELS[session.activity];
}

export function timeOf(ts: number): string {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 10) return "à l'instant";
  if (s < 60) return `il y a ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  return `il y a ${h} h`;
}
