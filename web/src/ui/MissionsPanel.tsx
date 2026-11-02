import { useState } from 'react';
import { formatCost } from '../../../shared/util';
import { sortSessions, useStore } from '../store';
import { Avatar, StatusChip, activityText, useBackend } from './common';
import { VillageIcon } from './VillageIcon';

export function MissionsPanel() {
  const sessions = useStore((s) => s.sessions);
  const select = useStore((s) => s.select);
  const setNew = useStore((s) => s.setNewAgentOpen);
  const info = useStore((s) => s.info);
  const backend = useBackend();
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const list = sortSessions(
    Object.values(sessions).filter((s) => s.role !== 'manager' && (filter === 'all' || s.status !== 'ended')),
  );
  return (
    <section className="panel panel-missions" aria-label="Missions du village">
      <header className="panel-head">
        <div className="panel-title">
          <h2>Les missions</h2>
          <p>Chaque objectif a son artisan.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={backend.kind !== 'demo' && !info?.sdkAvailable && !info?.codexAvailable}
          onClick={() => setNew(true)}
        >
          <VillageIcon name="plus" size={17} /> Nouvelle
        </button>
      </header>
      <div className="segmented" role="group" aria-label="Filtrer les missions">
        <button
          type="button"
          aria-pressed={filter === 'active'}
          className={filter === 'active' ? 'on' : ''}
          onClick={() => setFilter('active')}
        >
          En cours
        </button>
        <button
          type="button"
          aria-pressed={filter === 'all'}
          className={filter === 'all' ? 'on' : ''}
          onClick={() => setFilter('all')}
        >
          Toutes
        </button>
      </div>
      <div className="mission-list">
        {list.map((s) => (
          <button type="button" className="mission-card" key={s.id} onClick={() => select(s.id, { openTab: true })}>
            <div className="mission-person">
              <Avatar session={s} scale={1.3} />
              <strong>{s.name}</strong>
              <StatusChip session={s} />
            </div>
            <h3>{s.task || s.title || 'Session sans mission renseignée'}</h3>
            <p>{activityText(s)}</p>
            <footer>
              <span>{s.agent === 'codex' ? 'Codex' : 'Claude Code'}</span>
              <span>
                {s.toolUses} outils <b>·</b> {formatCost(s.costUsd)}
              </span>
            </footer>
          </button>
        ))}
        {!list.length ? (
          <div className="empty">
            <VillageIcon name="missions" size={30} />
            <p>Aucune mission en cours. Confie un objectif au chef ou crée une mission.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
