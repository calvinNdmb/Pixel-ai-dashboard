import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { SessionInfo, TimelineEvent } from '../../../shared/types';
import { formatCost, formatTokens } from '../../../shared/util';
import { useStore } from '../store';
import { Avatar, SourceBadge, StatusChip, activityText, ago, timeOf, useAction, useBackend } from './common';
import { Icon } from './icons';
import { Markdown } from './markdown';
import { PermissionCard } from './PermissionQueue';

const KIND_LABEL: Record<TimelineEvent['kind'], string> = {
  prompt: 'Consigne',
  text: 'Message',
  tool: 'Outil',
  tool_result: 'Résultat',
  permission: 'Autorisation',
  status: 'Statut',
  result: 'Fin de tour',
  error: 'Erreur',
  system: 'Système',
};

export function AgentDetail({ session: s }: { session: SessionInfo }) {
  const select = useStore((st) => st.select);
  const allEvents = useStore((st) => st.events);
  const backend = useBackend();
  const run = useAction();
  const [text, setText] = useState('');
  const [confirmStop, setConfirmStop] = useState(false);
  const logRef = useRef<HTMLOListElement>(null);
  const events = useMemo(() => allEvents.filter((e) => e.sessionId === s.id).slice(-200), [allEvents, s.id]);
  const alive = s.status !== 'ended';
  const controllable = s.controllable && s.source !== 'hook';
  const busy = s.status === 'working' || s.status === 'waiting' || s.status === 'starting';

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  useEffect(() => setConfirmStop(false), [s.id]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    const ok = await run(() => backend.sendToSession(s.id, t));
    if (!ok) setText(t);
  };

  return (
    <section className="panel panel-detail" aria-label={`Détail de ${s.name}`}>
      <header className="panel-head">
        <button type="button" className="icon-btn" onClick={() => select(null)} title="Retour à la liste">
          <Icon name="back" />
          <span className="sr-only">Retour</span>
        </button>
        <Avatar session={s} scale={2} />
        <div className="panel-title">
          <h2>
            {s.name} <SourceBadge session={s} />
          </h2>
          <p className="muted">
            <StatusChip session={s} /> <span>mis à jour {ago(s.updatedAt)}</span>
          </p>
        </div>
      </header>

      <div className="detail-scroll">
        <p className={`now-doing activity-${s.activity}`}>
          <span className="now-label">En ce moment</span>
          <span>{activityText(s)}</span>
        </p>

        {s.pending ? <PermissionCard session={s} /> : null}

        {s.task ? (
          <div className="block">
            <h3>Mission</h3>
            <Markdown text={s.task} />
          </div>
        ) : null}

        {s.lastText ? (
          <div className="block">
            <h3>Dernier message</h3>
            <Markdown text={s.lastText} />
          </div>
        ) : null}

        <dl className="facts">
          <div>
            <dt>Coût estimé</dt>
            <dd>{formatCost(s.costUsd)}</dd>
          </div>
          <div>
            <dt>Tokens</dt>
            <dd>
              {formatTokens(s.tokensIn)} ↓ · {formatTokens(s.tokensOut)} ↑
            </dd>
          </div>
          <div>
            <dt>Outils · tours</dt>
            <dd>
              {s.toolUses} · {s.turns}
            </dd>
          </div>
          <div>
            <dt>Modèle</dt>
            <dd>{s.model || 'par défaut'}</dd>
          </div>
          <div>
            <dt>Autorisations</dt>
            <dd>{s.permissionMode || '—'}</dd>
          </div>
          <div className="wide">
            <dt>Dossier</dt>
            <dd className="mono">{s.cwd || '—'}</dd>
          </div>
        </dl>

        {s.files.length ? (
          <div className="block">
            <h3>Fichiers touchés</h3>
            <ul className="files">
              {s.files.map((f) => (
                <li key={f} className="mono" title={f}>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="block">
          <h3>Journal</h3>
          <ol className="timeline" ref={logRef}>
            {events.length === 0 ? <li className="muted">Rien pour l'instant.</li> : null}
            {events.map((e) => (
              <li key={e.id} className={`tl tl-${e.kind}`}>
                <span className="tl-time">{timeOf(e.ts)}</span>
                <span className="tl-kind">{KIND_LABEL[e.kind]}</span>
                <span className="tl-text">{e.text}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <footer className="detail-actions">
        {controllable && alive ? (
          <form className="composer composer-small" onSubmit={send}>
            <label htmlFor="agent-input" className="sr-only">
              Message à {s.name}
            </label>
            <input
              id="agent-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={busy ? `Message (traité après son tour)…` : `Écrire à ${s.name}…`}
            />
            <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
              <Icon name="send" />
              <span className="sr-only">Envoyer</span>
            </button>
          </form>
        ) : null}
        {s.source === 'hook' ? (
          <p className="muted small">Session terminal observée : pour lui répondre, utilise ton terminal.</p>
        ) : null}
        <div className="row">
          {controllable && busy ? (
            <button type="button" className="btn btn-ghost" onClick={() => run(() => backend.interrupt(s.id), `${s.name} interrompu`)}>
              <Icon name="pause" /> Interrompre
            </button>
          ) : null}
          {controllable && alive ? (
            confirmStop ? (
              <>
                <button type="button" className="btn btn-danger" onClick={() => run(() => backend.stop(s.id), `Session de ${s.name} arrêtée`)}>
                  Confirmer l'arrêt
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmStop(false)}>
                  Annuler
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmStop(true)}>
                <Icon name="stop" /> Arrêter
              </button>
            )
          ) : null}
          {!alive && s.resumable ? (
            <button type="button" className="btn btn-primary" onClick={() => run(() => backend.resume(s.id), `${s.name} est de retour`)}>
              <Icon name="play" /> Reprendre
            </button>
          ) : null}
          {!alive || s.source === 'hook' ? (
            <button type="button" className="btn btn-ghost" onClick={() => run(() => backend.dismiss(s.id))}>
              <Icon name="trash" /> Retirer
            </button>
          ) : null}
        </div>
      </footer>
    </section>
  );
}
