import { useMemo, useState } from 'react';
import type { SessionInfo } from '../../../shared/types';
import { formatCost, truncate } from '../../../shared/util';
import { sortSessions, useStore } from '../store';
import { AgentDetail } from './AgentDetail';
import { Avatar, OriginBadges, SourceBadge, StatusChip, activityText, useBackend } from './common';
import { Icon } from './icons';

type Filter = 'active' | 'all' | 'ended';

function AgentCard({ s, selected }: { s: SessionInfo; selected: boolean }) {
  const select = useStore((st) => st.select);
  return (
    <li>
      <button
        type="button"
        className={`agent-card status-edge-${s.status} ${selected ? 'is-selected' : ''}`}
        onClick={() => select(s.id)}
        aria-current={selected ? 'true' : undefined}
      >
        <Avatar session={s} scale={2} />
        <span className="agent-main">
          <span className="agent-line">
            <strong className="agent-name">{s.name}</strong>
            <SourceBadge session={s} />
            <OriginBadges session={s} />
            <StatusChip session={s} />
          </span>
          <span className="agent-activity">{activityText(s)}</span>
          {s.title || s.task ? <span className="agent-task">{truncate(s.title || s.task || '', 90)}</span> : null}
        </span>
        <span className="agent-meta">
          <span>{formatCost(s.costUsd)}</span>
          <span>{s.toolUses} outils</span>
        </span>
      </button>
    </li>
  );
}

export function AgentsPanel() {
  const sessions = useStore((s) => s.sessions);
  const selectedId = useStore((s) => s.selectedId);
  const setNewAgentOpen = useStore((s) => s.setNewAgentOpen);
  const info = useStore((s) => s.info);
  const backend = useBackend();
  const [filter, setFilter] = useState<Filter>('active');

  const all = useMemo(() => sortSessions(Object.values(sessions).filter((s) => s.role !== 'manager')), [sessions]);
  const list = all.filter((s) => (filter === 'all' ? true : filter === 'ended' ? s.status === 'ended' : s.status !== 'ended'));
  const selected = selectedId ? sessions[selectedId] : undefined;
  const canSpawn = backend.kind === 'demo' || Boolean(info?.sdkAvailable);

  if (selected && selected.role !== 'manager') return <AgentDetail session={selected} />;

  const counts = {
    active: all.filter((s) => s.status !== 'ended').length,
    ended: all.filter((s) => s.status === 'ended').length,
  };

  return (
    <section className="panel" aria-label="Agents">
      <header className="panel-head">
        <div className="panel-title">
          <h2>Agents</h2>
          <p className="muted">
            {counts.active} au QG{counts.ended ? ` · ${counts.ended} terminé${counts.ended > 1 ? 's' : ''}` : ''}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setNewAgentOpen(true)}
          disabled={!canSpawn}
          title={canSpawn ? 'Lancer une nouvelle session Claude Code ou Codex' : 'Le SDK Agent est désactivé sur ce serveur'}
        >
          <Icon name="plus" /> Recruter
        </button>
      </header>
      <div className="segmented" role="group" aria-label="Filtrer les agents">
        {(
          [
            ['active', 'Au QG'],
            ['ended', 'Terminés'],
            ['all', 'Tous'],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" aria-pressed={filter === key} className={filter === key ? 'on' : ''} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>
      {list.length ? (
        <ul className="agent-list">
          {list.map((s) => (
            <AgentCard key={s.id} s={s} selected={s.id === selectedId} />
          ))}
        </ul>
      ) : (
        <div className="empty">
          <p>
            {filter === 'ended'
              ? 'Aucune session terminée.'
              : "Personne au travail pour l'instant. Confie une mission au Chef, recrute un agent, ou branche tes sessions terminal avec les hooks (voir l'aide)."}
          </p>
        </div>
      )}
    </section>
  );
}
