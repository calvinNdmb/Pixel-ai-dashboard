import { useEffect, useRef, useState } from 'react';
import { ACTIVITY_LABELS } from '../../../shared/activity';
import { truncate } from '../../../shared/util';
import { useStore } from '../store';
import type { VillageScene } from '../village/scene';
import { VillageIcon } from './VillageIcon';

/** The existing 2D renderer remains available when WebGL is unavailable. */
function LegacyCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let disposed = false;
    let world: import('../game/world').World | undefined;
    void import('../game/world').then(({ World }) => {
      if (disposed || !canvasRef.current) return;
      world = new World(canvasRef.current, {
        getSnapshot: () => {
          const s = useStore.getState();
          return {
            ready: s.ready,
            sessions: Object.values(s.sessions),
            selectedId: s.selectedId,
            showNames: s.showNames,
            reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
            lastReportAt: s.lastReportAt,
          };
        },
        onSelect: (id) => useStore.getState().select(id, { openTab: true }),
      });
      world.start();
    });
    return () => {
      disposed = true;
      world?.destroy();
    };
  }, []);
  return (
    <canvas
      ref={canvasRef}
      className="legacy-canvas"
      role="img"
      aria-label="Vue 2D du QG. Les agents restent accessibles dans le menu Agents."
    />
  );
}

export function WorldView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labels = useRef(new Map<string, HTMLButtonElement>());
  const sessions = useStore((s) => s.sessions);
  const selected = useStore((s) => s.selectedId);
  const showNames = useStore((s) => s.showNames);
  const select = useStore((s) => s.select);
  const overview = useStore((s) => s.overview);
  const [fallback, setFallback] = useState<string | null>(() =>
    new URLSearchParams(location.search).get('view') === '2d' ? 'Vue 2D choisie' : null,
  );
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const active = Object.values(sessions).filter((s) => s.status !== 'ended');
  // Bubble priority is stable: selected agent, requests, then current work.
  const speaking = [...active]
    .sort(
      (a, b) =>
        Number(b.id === selected) - Number(a.id === selected) ||
        Number(Boolean(b.pending)) - Number(Boolean(a.pending)) ||
        b.updatedAt - a.updatedAt,
    )
    .slice(0, 3)
    .map((s) => s.id);

  useEffect(() => {
    if (fallback) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false,
      loaded = false;
    let scene: VillageScene | undefined;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const dark = matchMedia('(prefers-color-scheme: dark)');
    setReady(false);
    void import('../village/scene')
      .then(({ VillageScene }) => {
        if (disposed) return;
        scene = new VillageScene(canvas, {
          snapshot: () => {
            const s = useStore.getState();
            return {
              sessions: Object.values(s.sessions),
              selectedId: s.selectedId,
              paused: s.animationPaused,
              overview: s.overview,
              panelOpen: s.panelOpen,
              reducedMotion: motion.matches,
              night: s.theme === 'dark' || (s.theme === 'system' && dark.matches),
            };
          },
          onSelect: (id) => useStore.getState().select(id, { openTab: true }),
          onProject: (points) => {
            const state = useStore.getState();
            const used: Array<{ x: number; y: number }> = [];
            const sorted = [...points].sort(
              (a, b) =>
                Number(b.id === state.selectedId) - Number(a.id === state.selectedId) ||
                Number(Boolean(state.sessions[b.id]?.pending)) - Number(Boolean(state.sessions[a.id]?.pending)),
            );
            for (const p of sorted) {
              const el = labels.current.get(p.id);
              if (!el) continue;
              const crowded = used.some((other) => Math.abs(other.x - p.x) < 150 && Math.abs(other.y - p.y) < 65);
              el.dataset.crowded = String(crowded);
              if (p.visible && !crowded) used.push(p);
              el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
              el.style.visibility = p.visible ? 'visible' : 'hidden';
            }
          },
          onReady: () => {
            if (!loaded && !disposed) {
              loaded = true;
              setReady(true);
            }
          },
          onFailure: (reason) => {
            if (!disposed) setFallback(reason);
          },
        });
      })
      .catch(() => {
        if (!disposed) setFallback('La 3D n’est pas disponible sur ce navigateur.');
      });
    return () => {
      disposed = true;
      scene?.destroy();
    };
  }, [fallback, retry]);

  return (
    <section className={`world-pane village-world ${fallback ? 'is-fallback' : ''}`} aria-label="Le village des agents">
      <div className="world-frame">
        {fallback ? (
          <LegacyCanvas />
        ) : (
          <canvas
            ref={canvasRef}
            className="village-canvas"
            aria-label="Village 3D. Glisse pour déplacer la vue, utilise la molette ou deux doigts pour zoomer. Les sessions sont aussi accessibles via le menu Agents."
            role="img"
          />
        )}
        {!fallback && !ready ? (
          <div className="village-loading" role="status">
            <VillageIcon name="leaf" size={34} />
            <span>Le village prend vie…</span>
          </div>
        ) : null}
        {!fallback ? (
          <div className="world-labels" aria-label="Personnages du village">
            {active.map((s) => (
              <button
                type="button"
                key={s.id}
                className={`world-agent ${selected === s.id ? 'is-selected' : ''} ${s.pending ? 'asks' : ''}`}
                ref={(el) => {
                  if (el) labels.current.set(s.id, el);
                  else labels.current.delete(s.id);
                }}
                style={{ visibility: 'hidden' }}
                aria-label={`${s.name} : ${s.activityLabel || ACTIVITY_LABELS[s.activity]}`}
                onClick={() => select(s.id, { openTab: true })}
              >
                {speaking.includes(s.id) ? (
                  <span className="agent-bubble">
                    {truncate(s.pending ? 'J’attends ton accord' : s.activityLabel || ACTIVITY_LABELS[s.activity], 34)}
                  </span>
                ) : null}
                {showNames || selected === s.id ? (
                  <span className="world-name">{s.name}</span>
                ) : (
                  <span className="agent-hit-area" />
                )}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {fallback ? (
        <div className="fallback-notice paper" role="status">
          <span>{fallback} · Le QG 2D reste disponible.</span>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setFallback(null);
              setRetry((n) => n + 1);
            }}
          >
            Réessayer la 3D
          </button>
        </div>
      ) : (
        <div className="camera-hint" aria-hidden="true">
          {overview ? 'Le monde de ton équipe' : 'Glisser pour explorer · Molette pour zoomer'}
        </div>
      )}
    </section>
  );
}
