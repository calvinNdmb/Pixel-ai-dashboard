import { formatTokens, basename } from '../../../shared/util';
import { type Tab, useStore } from '../store';
import { Avatar } from './common';
import { TopBar } from './TopBar';
import { VillageIcon, type VillageIconName } from './VillageIcon';

export function VillageHUD() {
  const sessions = useStore((s) => s.sessions);
  const info = useStore((s) => s.info);
  const conn = useStore((s) => s.conn);
  const paused = useStore((s) => s.animationPaused);
  const setPaused = useStore((s) => s.setAnimationPaused);
  const overview = useStore((s) => s.overview);
  const setOverview = useStore((s) => s.setOverview);
  const setTab = useStore((s) => s.setTab);
  const list = Object.values(sessions);
  const active = list.filter((s) => s.status !== 'ended');
  const pending = active.filter((s) => s.pending || s.hold).length;
  const demo = info?.mode === 'demo';
  return (
    <>
      <header className="village-hud">
        <div className="village-brand">
          <span className="village-emblem">
            <VillageIcon name="leaf" size={22} />
          </span>
          <div>
            <h1>Le village des agents</h1>
            <span>Un projet. Toute une équipe.</span>
          </div>
        </div>
        <div className="session-pill" aria-label="État du village">
          <VillageIcon name="sun" size={23} />
          <strong className="project-name">{basename(info?.defaultCwd) || 'Mon projet'}</strong>
          <span className="pill-divider" />
          <span className="active-count">
            {active.length} agent{active.length > 1 ? 's' : ''}
            <span className="desktop-word"> actif{active.length > 1 ? 's' : ''}</span>
          </span>
          <i
            className={`connection-light ${conn === 'open' ? 'connected' : ''}`}
            title={conn === 'open' ? 'Connecté' : 'Connexion interrompue'}
          />
          <span className="pill-divider" />
          <button
            type="button"
            className="animation-button"
            aria-pressed={paused}
            onClick={() => setPaused(!paused)}
            title={paused ? 'Reprendre les animations' : 'Suspendre les animations (les sessions continuent)'}
            aria-label={paused ? 'Reprendre les animations' : 'Suspendre les animations'}
          >
            <VillageIcon name={paused ? 'play' : 'pause'} size={18} />
          </button>
          {demo ? (
            <span className="demo-label">Démo</span>
          ) : (
            <span className="live-label">{conn === 'open' ? 'En direct' : 'Hors ligne'}</span>
          )}
        </div>
        <button
          type="button"
          className="settings-button paper"
          popoverTarget="village-settings"
          aria-label="Réglages du village"
        >
          <VillageIcon name="settings" size={23} />
        </button>
      </header>
      <div
        className="village-settings paper"
        id="village-settings"
        popover="auto"
        onClick={(e) => {
          const s = useStore.getState();
          if (s.helpOpen || s.remoteOpen) e.currentTarget.hidePopover();
        }}
      >
        <h2>Les réglages du village</h2>
        <p className="muted">Connexion, téléphone, apparence et notifications.</p>
        <TopBar />
      </div>
      <div className="world-tools">
        <button
          type="button"
          className={`world-view-button paper ${overview ? 'selected' : ''}`}
          onClick={() => setOverview(!overview)}
          aria-pressed={overview}
        >
          <VillageIcon name={overview ? 'leaf' : 'world'} size={24} />
          <span>{overview ? 'Le village' : 'Vue du monde'}</span>
        </button>
        <button
          type="button"
          className={`attention-pill paper ${pending ? 'has-pending' : ''}`}
          onClick={() => setTab('chef')}
        >
          <span className={`status-dot ${pending ? 'dot-waiting' : ''}`} />
          {pending
            ? `${pending} à examiner`
            : `${formatTokens(list.reduce((n, s) => n + s.tokensIn + s.tokensOut, 0))} tokens`}
        </button>
      </div>
    </>
  );
}

export function VillageDock() {
  const tab = useStore((s) => s.tab);
  const open = useStore((s) => s.panelOpen);
  const setOpen = useStore((s) => s.setPanelOpen);
  const setTab = useStore((s) => s.setTab);
  const sessions = useStore((s) => s.sessions);
  const select = useStore((s) => s.select);
  const selected = useStore((s) => s.selectedId);
  const unread = useStore((s) => s.unreadReports);
  const active = Object.values(sessions).filter((s) => s.status !== 'ended');
  const pending = active.filter((s) => s.pending || s.hold).length;
  const nav: Array<[Tab, string, VillageIconName]> = [
    ['agents', 'Agents', 'agents'],
    ['missions', 'Missions', 'missions'],
    ['journal', 'Journal', 'journal'],
    ['chef', 'Chef', 'chef'],
  ];
  return (
    <footer className="village-bottom">
      <div className="village-roster" role="group" aria-label="Accès rapide aux agents">
        {active.slice(0, 4).map((s) => (
          <button
            type="button"
            className={`roster-portrait paper ${selected === s.id && open ? 'selected' : ''}`}
            title={`${s.name} · ${s.activityLabel || s.status}`}
            aria-label={`Voir ${s.name}`}
            key={s.id}
            onClick={() => select(s.id, { openTab: true })}
          >
            <Avatar session={s} scale={2} />
            <i className={`status-dot dot-${s.status}`} />
          </button>
        ))}
        <button
          type="button"
          className="roster-more paper"
          onClick={() => {
            select(null);
            setTab('agents');
          }}
          aria-label="Voir tous les agents"
        >
          ···
        </button>
      </div>
      <div className="village-caption">
        <span className="status-dot" /> Le village vit au rythme de tes sessions
      </div>
      <nav className="village-dock" aria-label="Navigation du village">
        {nav.map(([id, name, icon]) => (
          <button
            key={id}
            data-tab={id}
            type="button"
            className={`dock-tile paper ${tab === id && open ? 'selected' : ''}`}
            aria-label={name}
            aria-controls="side-panel"
            aria-expanded={tab === id && open}
            onClick={() => {
              if (tab === id && open) setOpen(false);
              else {
                if (id === 'agents') select(null);
                setTab(id);
              }
            }}
          >
            <VillageIcon name={icon} size={25} />
            <span>{name}</span>
            {id === 'chef' && (pending || unread) ? (
              <b className="dock-badge" aria-hidden="true">
                {pending || unread}
              </b>
            ) : null}
          </button>
        ))}
      </nav>
    </footer>
  );
}
