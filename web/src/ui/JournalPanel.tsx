import { useMemo, useState } from 'react';
import type { TimelineEvent } from '../../../shared/types';
import { useStore } from '../store';
import { timeOf } from './common';

type KindFilter = 'all' | 'tools' | 'talk' | 'alerts';

const MATCH: Record<KindFilter, (e: TimelineEvent) => boolean> = {
  all: (e) => e.kind !== 'tool_result',
  tools: (e) => e.kind === 'tool' || e.kind === 'tool_result',
  talk: (e) => e.kind === 'prompt' || e.kind === 'text' || e.kind === 'result',
  alerts: (e) => e.kind === 'error' || e.kind === 'permission' || Boolean(e.isError),
};

const KIND_ICON: Record<TimelineEvent['kind'], string> = {
  prompt: '»',
  text: '“',
  tool: '›',
  tool_result: '=',
  permission: '!',
  status: '·',
  result: '✓',
  error: '×',
  system: '·',
};

export function JournalPanel() {
  const events = useStore((s) => s.events);
  const sessions = useStore((s) => s.sessions);
  const select = useStore((s) => s.select);
  const [who, setWho] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');

  const list = useMemo(
    () =>
      events
        .filter((e) => (!who || e.sessionId === who) && MATCH[kind](e))
        .slice(-300)
        .reverse(),
    [events, who, kind],
  );
  const people = useMemo(() => Object.values(sessions).sort((a, b) => a.name.localeCompare(b.name)), [sessions]);

  return (
    <section className="panel" aria-label="Journal d'activité">
      <header className="panel-head">
        <div className="panel-title">
          <h2>Journal</h2>
          <p className="muted">Tout ce qui se passe au QG, en direct</p>
        </div>
      </header>
      <div className="journal-filters">
        <label htmlFor="journal-who" className="sr-only">
          Filtrer par agent
        </label>
        <select id="journal-who" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Tout le monde</option>
          {people.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="segmented" role="group" aria-label="Type d'événement">
          {(
            [
              ['all', 'Tout'],
              ['tools', 'Outils'],
              ['talk', 'Échanges'],
              ['alerts', 'Alertes'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <ol className="journal">
        {list.length === 0 ? <li className="muted">Aucun événement.</li> : null}
        {list.map((e) => {
          const s = sessions[e.sessionId];
          return (
            <li key={e.id} className={`jr jr-${e.kind} ${e.isError ? 'jr-error' : ''}`}>
              <span className="jr-icon" aria-hidden>
                {KIND_ICON[e.kind]}
              </span>
              <span className="jr-time">{timeOf(e.ts)}</span>
              <button type="button" className="jr-who" onClick={() => s && select(s.id, { openTab: true })} disabled={!s}>
                {s?.name ?? 'session retirée'}
              </button>
              <span className="jr-text">{e.text}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
