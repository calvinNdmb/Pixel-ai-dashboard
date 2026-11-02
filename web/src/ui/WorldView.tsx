import { useEffect, useMemo, useRef } from 'react';
import { World } from '../game/world';
import { useStore } from '../store';
import { timeOf } from './common';

const reducedMotion = () => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/** Le QG en pixel art + le fil d'activité en direct juste en dessous. */
export function WorldView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const world = new World(canvas, {
      getSnapshot: () => {
        const s = useStore.getState();
        return {
          ready: s.ready,
          sessions: Object.values(s.sessions),
          selectedId: s.selectedId,
          showNames: s.showNames,
          reducedMotion: reducedMotion(),
          lastReportAt: s.lastReportAt,
        };
      },
      onSelect: (id) => useStore.getState().select(id, { openTab: true }),
    });
    world.start();
    return () => world.destroy();
  }, []);

  return (
    <section className="world-pane" aria-label="Le QG">
      <div className="world-frame">
        <canvas
          ref={canvasRef}
          className="world-canvas"
          role="img"
          aria-label="Vue pixel art du QG : chaque personnage est une session Claude Code ou Codex. Clique sur un personnage pour voir ce qu'il fait."
        />
      </div>
      <LiveFeed />
    </section>
  );
}

function LiveFeed() {
  const events = useStore((s) => s.events);
  const sessions = useStore((s) => s.sessions);
  const select = useStore((s) => s.select);
  const latest = useMemo(
    () => events.filter((e) => e.kind !== 'tool_result').slice(-3).reverse(),
    [events],
  );
  return (
    <ol className="live-feed" aria-label="Dernières actions" aria-live="off">
      {latest.length === 0 ? <li className="muted">En attente d'activité…</li> : null}
      {latest.map((e) => {
        const s = sessions[e.sessionId];
        return (
          <li key={e.id} className={`feed-${e.kind}`}>
            <span className="feed-time">{timeOf(e.ts)}</span>
            <button type="button" className="feed-who" onClick={() => s && select(s.id, { openTab: true })}>
              {s?.name ?? '—'}
            </button>
            <span className="feed-text">{e.text}</span>
          </li>
        );
      })}
    </ol>
  );
}
