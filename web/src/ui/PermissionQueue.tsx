import { useMemo, useState } from 'react';
import type { SessionInfo } from '../../../shared/types';
import { useStore } from '../store';
import { Avatar, useAction, useBackend } from './common';
import { Icon } from './icons';

/** Demande d'autorisation d'un agent : Autoriser / Toujours / Refuser. */
export function PermissionCard({ session: s, compact = false }: { session: SessionInfo; compact?: boolean }) {
  const backend = useBackend();
  const run = useAction();
  const select = useStore((st) => st.select);
  const [busy, setBusy] = useState(false);
  const p = s.pending;
  if (!p) return null;
  const terminal = s.source === 'hook';

  const answer = async (decision: 'allow' | 'always' | 'deny') => {
    setBusy(true);
    await run(() => backend.answerPermission(p.id, decision));
    setBusy(false);
  };

  return (
    <div className={`perm-card ${terminal ? 'perm-terminal' : ''}`} role="group" aria-label={`Demande d'autorisation de ${s.name}`}>
      <div className="perm-head">
        <span className="perm-icon" aria-hidden>
          <Icon name="alert" size={12} />
        </span>
        {compact ? (
          <button type="button" className="perm-who" onClick={() => select(s.id, { openTab: true })}>
            <Avatar session={s} scale={1} />
            {s.name}
          </button>
        ) : null}
        <p className="perm-summary">
          {compact ? 'demande : ' : 'Demande : '}
          <strong>{p.summary}</strong>
        </p>
      </div>
      {p.detail ? (
        <details className="perm-detail">
          <summary>Voir le détail ({p.toolName})</summary>
          <pre>{p.detail}</pre>
        </details>
      ) : null}
      {terminal ? (
        <p className="muted small">Session terminal : la question s'affiche dans ton terminal, réponds-y là-bas.</p>
      ) : (
        <div className="row">
          <button type="button" className="btn btn-good" disabled={busy} onClick={() => answer('allow')}>
            <Icon name="check" /> Autoriser
          </button>
          {p.canAlwaysAllow ? (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => answer('always')} title="Autoriser ce type d'action pour le reste de la session">
              Toujours
            </button>
          ) : null}
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => answer('deny')}>
            <Icon name="close" /> Refuser
          </button>
        </div>
      )}
    </div>
  );
}

/** File des demandes en attente, visible quel que soit l'onglet. */
export function PermissionQueue() {
  const sessions = useStore((s) => s.sessions);
  const [expanded, setExpanded] = useState(false);
  const pending = useMemo(
    () =>
      Object.values(sessions)
        .filter((s) => s.pending && s.status !== 'ended')
        .sort((a, b) => Number(a.source === 'hook') - Number(b.source === 'hook') || (a.pending!.createdAt - b.pending!.createdAt)),
    [sessions],
  );
  if (!pending.length) return null;
  const shown = expanded ? pending : pending.slice(0, 2);
  return (
    <div className="perm-queue" aria-label="Autorisations en attente">
      {shown.map((s) => (
        <PermissionCard key={s.id} session={s} compact />
      ))}
      {pending.length > 2 ? (
        <button type="button" className="link-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Réduire' : `+ ${pending.length - 2} autre${pending.length > 3 ? 's' : ''} demande${pending.length > 3 ? 's' : ''}`}
        </button>
      ) : null}
    </div>
  );
}
