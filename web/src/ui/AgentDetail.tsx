import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { SessionInfo, TimelineEvent } from '../../../shared/types';
import { formatCost, formatTokens } from '../../../shared/util';
import { useStore } from '../store';
import { AGENT_LABELS, Avatar, OriginBadges, SourceBadge, StatusChip, activityText, ago, isExternal, timeOf, useAction, useBackend } from './common';
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

const hhmm = (ts: number) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Session terminal retenue par la télécommande : on lui répond d'ici. */
function HoldReply({ session: s }: { session: SessionInfo }) {
  const backend = useBackend();
  const run = useAction();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    const ok = await run(() => backend.sendToSession(s.id, t), `Consigne envoyée à ${s.name}`);
    setBusy(false);
    if (ok) setText('');
  };
  return (
    <div className="hold-reply">
      <p className="hold-note">
        <Icon name="remote" /> {s.name} a fini son tour et attend ta consigne
        {s.hold ? <span className="muted"> (jusqu'à {hhmm(s.hold.expiresAt)}, ensuite la main revient au terminal)</span> : null}.
      </p>
      <form className="composer composer-small" onSubmit={send}>
        <label htmlFor="hold-input" className="sr-only">
          Consigne pour {s.name}
        </label>
        <input id="hold-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Prochaine consigne pour ${s.name}…`} autoComplete="off" />
        <button type="submit" className="btn btn-primary" disabled={!text.trim() || busy}>
          <Icon name="send" />
          <span className="sr-only">Envoyer</span>
        </button>
      </form>
      <div className="row">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => run(() => backend.interrupt(s.id), 'La main revient au terminal')}>
          <Icon name="back" /> Rendre la main au terminal
        </button>
      </div>
    </div>
  );
}

function ExternalNote({ session: s }: { session: SessionInfo }) {
  const remoteMode = useStore((st) => Boolean(st.info?.remoteMode));
  const sessions = useStore((st) => st.sessions);
  const select = useStore((st) => st.select);
  if (s.role === 'subagent') {
    const parent = s.parentId ? sessions[s.parentId] : undefined;
    return (
      <p className="muted small">
        Sous-agent : il rend son travail à{' '}
        {parent ? (
          <button type="button" className="link-btn" onClick={() => select(parent.id)}>
            {parent.name}
          </button>
        ) : (
          'son agent parent'
        )}
        , c'est à lui qu'il faut parler.
      </p>
    );
  }
  if (s.source === 'watch')
    return (
      <p className="muted small">
        Session lue dans son transcript : lecture seule. Pour lui répondre d'ici, installe les hooks (<code>npm run hooks:install</code>
        {s.agent === 'codex' ? <code> -- --codex</code> : null}) puis active la télécommande.
      </p>
    );
  return (
    <p className="muted small">
      {remoteMode
        ? `Télécommande active : quand ${s.name} aura fini son tour, il t'attendra ici pour sa prochaine consigne.`
        : 'Session terminal : réponds-lui dans ton terminal, ou active la télécommande pour lui répondre d’ici.'}
    </p>
  );
}

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
  const controllable = s.controllable && !isExternal(s);
  const held = Boolean(s.hold) && alive;
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
            {s.name} <SourceBadge session={s} /> <OriginBadges session={s} />
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

        {s.title && s.title !== s.task ? (
          <div className="block">
            <h3>Sujet</h3>
            <p>{s.title}</p>
          </div>
        ) : null}

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
            <dt>Outil · modèle</dt>
            <dd>
              {AGENT_LABELS[s.agent]} · {s.model || 'par défaut'}
            </dd>
          </div>
          <div>
            <dt>{s.agent === 'codex' ? 'Bac à sable' : 'Autorisations'}</dt>
            <dd>{s.permissionMode || '—'}</dd>
          </div>
          {s.host ? (
            <div>
              <dt>Machine</dt>
              <dd className="mono">{s.host}</dd>
            </div>
          ) : null}
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
        {held ? <HoldReply session={s} /> : null}
        {!controllable && !held && alive && (isExternal(s) || s.role === 'subagent') ? <ExternalNote session={s} /> : null}
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
          {!alive || (isExternal(s) && s.role !== 'subagent') ? (
            <button type="button" className="btn btn-ghost" onClick={() => run(() => backend.dismiss(s.id))}>
              <Icon name="trash" /> Retirer
            </button>
          ) : null}
        </div>
      </footer>
    </section>
  );
}
