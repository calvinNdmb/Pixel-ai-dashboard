import { useMemo, useState } from 'react';
import { formatCost, formatTokens } from '../../../shared/util';
import { useStore } from '../store';
import { useAction, useBackend } from './common';
import { Icon } from './icons';

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'info' | 'warn' | 'good' }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

export function TopBar() {
  const sessions = useStore((s) => s.sessions);
  const info = useStore((s) => s.info);
  const conn = useStore((s) => s.conn);
  const showNames = useStore((s) => s.showNames);
  const setShowNames = useStore((s) => s.setShowNames);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  const setRemoteOpen = useStore((s) => s.setRemoteOpen);
  const sound = useStore((s) => s.sound);
  const setSound = useStore((s) => s.setSound);
  const toast = useStore((s) => s.toast);
  const backend = useBackend();
  const run = useAction();
  const remoteMode = Boolean(info?.remoteMode);
  const [notifOn, setNotifOn] = useState(() => {
    try {
      return typeof Notification !== 'undefined' && Notification.permission === 'granted';
    } catch {
      return false;
    }
  });

  const stats = useMemo(() => {
    const list = Object.values(sessions).filter((s) => s.status !== 'ended');
    return {
      working: list.filter((s) => s.status === 'working' || s.status === 'starting').length,
      waiting: list.filter((s) => s.status === 'waiting').length,
      idle: list.filter((s) => s.status === 'idle').length,
      cost: Object.values(sessions).reduce((acc, s) => acc + s.costUsd, 0),
      tokens: Object.values(sessions).reduce((acc, s) => acc + s.tokensIn + s.tokensOut, 0),
    };
  }, [sessions]);

  const demo = backend.kind === 'demo' || info?.mode === 'demo';
  const nextTheme = theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system';
  const themeLabel = theme === 'system' ? 'Thème : système' : theme === 'dark' ? 'Thème : nuit' : 'Thème : jour';

  const enableNotifications = async () => {
    try {
      if (typeof Notification === 'undefined') throw new Error('indisponible');
      const p = await Notification.requestPermission();
      setNotifOn(p === 'granted');
      toast({
        kind: p === 'granted' ? 'success' : 'warning',
        text: p === 'granted' ? 'Notifications activées lorsque le dashboard est ouvert en arrière-plan.' : 'Notifications refusées par le navigateur.',
      });
    } catch {
      toast({ kind: 'warning', text: 'Les notifications ne sont pas disponibles ici.' });
    }
  };

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          <Icon name="hat" size={22} />
        </span>
        <div className="brand-text">
          <h1>Pixel AI Dashboard</h1>
          <p>Le QG de tes sessions Claude Code et Codex</p>
        </div>
      </div>

      <div className="stats" aria-label="Résumé de l'équipe">
        <Stat label="au travail" value={stats.working} tone="info" />
        <Stat label="en attente" value={stats.waiting} tone={stats.waiting ? 'warn' : undefined} />
        <Stat label="dispos" value={stats.idle} tone="good" />
        <Stat label="coût estimé" value={formatCost(stats.cost)} />
        <Stat label="tokens" value={formatTokens(stats.tokens)} />
      </div>

      <div className="tools">
        <span className={`mode ${demo ? 'mode-demo' : conn === 'open' ? 'mode-live' : 'mode-off'}`}>
          <span className="dot" aria-hidden />
          {demo ? 'Démo' : conn === 'open' ? 'En direct' : conn === 'connecting' ? 'Connexion…' : 'Hors ligne'}
        </span>
        <button
          type="button"
          className={`remote-toggle ${remoteMode ? 'on' : ''}`}
          aria-pressed={remoteMode}
          title={
            remoteMode
              ? 'Télécommande active : les sessions terminal attendent tes réponses ici. Clique pour couper.'
              : 'Activer la télécommande : les autorisations et fins de tour des sessions terminal attendront ta réponse ici (idéal depuis ton téléphone).'
          }
          onClick={() =>
            run(
              () => backend.setRemoteMode(!remoteMode),
              remoteMode ? 'Télécommande coupée : la main revient aux terminaux.' : 'Télécommande activée : tes sessions terminal t’attendent ici.',
            )
          }
        >
          <Icon name="remote" />
          <span className="remote-label">Télécommande</span>
          <span className="remote-state">{remoteMode ? 'ON' : 'OFF'}</span>
        </button>
        <button type="button" className="icon-btn" title="Connecter mon téléphone, notifications" onClick={() => setRemoteOpen(true)}>
          <Icon name="phone" />
          <span className="sr-only">Téléphone et notifications</span>
        </button>
        <button
          type="button"
          className={`icon-btn ${sound ? 'on' : ''}`}
          aria-pressed={sound}
          title="Sons de notification (autorisations, rapports, fins de tour)"
          onClick={() => setSound(!sound)}
        >
          <Icon name={sound ? 'sound' : 'mute'} />
          <span className="sr-only">Sons</span>
        </button>
        <button
          type="button"
          className={`icon-btn ${showNames ? 'on' : ''}`}
          aria-pressed={showNames}
          title="Afficher les noms dans le QG"
          onClick={() => setShowNames(!showNames)}
        >
          <Icon name="tag" />
          <span className="sr-only">Afficher les noms</span>
        </button>
        <button type="button" className="icon-btn" title={`${themeLabel} (cliquer pour changer)`} onClick={() => setTheme(nextTheme)}>
          <Icon name="contrast" />
          <span className="sr-only">{themeLabel}</span>
        </button>
        <button
          type="button"
          className={`icon-btn ${notifOn ? 'on' : ''}`}
          title="Notifications du navigateur (rapports, autorisations)"
          aria-pressed={notifOn}
          onClick={enableNotifications}
        >
          <Icon name="bell" />
          <span className="sr-only">Notifications</span>
        </button>
        <button type="button" className="icon-btn" title="Légende et aide" onClick={() => setHelpOpen(true)}>
          <Icon name="help" />
          <span className="sr-only">Aide</span>
        </button>
      </div>
    </header>
  );
}
