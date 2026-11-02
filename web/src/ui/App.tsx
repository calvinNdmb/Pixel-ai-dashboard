import { useCallback, useEffect, useRef, useState } from 'react';
import type { Backend } from '../backend';
import { useStore, type Tab } from '../store';
import { AgentsPanel } from './AgentsPanel';
import { ChefPanel } from './ChefPanel';
import { BackendProvider } from './common';
import { HelpDialog } from './HelpDialog';
import { Icon, type IconName } from './icons';
import { JournalPanel } from './JournalPanel';
import { LoginScreen } from './LoginScreen';
import { NewAgentDialog } from './NewAgentDialog';
import { PermissionQueue } from './PermissionQueue';
import { RemoteDialog } from './RemoteDialog';
import { TopBar } from './TopBar';
import { WorldView } from './WorldView';

function useTheme() {
  const theme = useStore((s) => s.theme);
  const applied = useRef(false);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      // On ne retire que l'attribut que l'on a nous-mêmes posé.
      if (applied.current) root.removeAttribute('data-theme');
      applied.current = false;
    } else {
      root.setAttribute('data-theme', theme);
      applied.current = true;
    }
  }, [theme]);
}

function Tabs() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const unread = useStore((s) => s.unreadReports);
  const agents = useStore((s) => Object.values(s.sessions).filter((x) => x.role !== 'manager' && x.status !== 'ended').length);
  const tabs: Array<[Tab, string, IconName, number]> = [
    ['chef', 'Chef', 'hat', unread],
    ['agents', 'Agents', 'agent', agents],
    ['journal', 'Journal', 'scroll', 0],
  ];
  return (
    <div className="tabs" role="tablist" aria-label="Sections">
      {tabs.map(([id, label, icon, count]) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={`tab-${id}`}
          aria-selected={tab === id}
          aria-controls="side-panel"
          className={tab === id ? 'on' : ''}
          onClick={() => setTab(id)}
        >
          <Icon name={icon} /> {label}
          {count ? <span className={`count ${id === 'chef' ? 'count-hot' : ''}`}>{count}</span> : null}
        </button>
      ))}
    </div>
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  const setTab = useStore((s) => s.setTab);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role="status">
          <span>{t.text}</span>
          {t.action ? (
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setTab(t.action!.tab);
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          ) : null}
          <button type="button" className="toast-close" onClick={() => dismiss(t.id)} title="Fermer">
            <Icon name="close" size={10} />
            <span className="sr-only">Fermer</span>
          </button>
        </div>
      ))}
    </div>
  );
}

function ConnectionBanner({ backend }: { backend: Backend }) {
  const conn = useStore((s) => s.conn);
  const everConnected = useStore((s) => s.everConnected);
  if (backend.kind === 'demo' || conn === 'open') return null;
  if (conn === 'connecting' && !everConnected) return null;
  return (
    <div className="banner" role="alert">
      {everConnected ? (
        <span>Connexion au serveur perdue, nouvelle tentative en cours…</span>
      ) : (
        <span>
          Serveur introuvable. Lance <code>npm run dev</code> (ou <code>npm start</code>) puis recharge la page, ou{' '}
          <a href="?demo">ouvre la démo</a> pour voir le QG en simulation.
        </span>
      )}
    </div>
  );
}

type Gate = { state: 'checking' } | { state: 'login'; error: string | null } | { state: 'ready' };

/**
 * Accès protégé (dashboard ouvert à distance) : vérifie que cet appareil est
 * connecté avant d'ouvrir le flux, et revient à l'écran de connexion si
 * l'accès est révoqué en cours de route.
 */
function useAuthGate(backend: Backend) {
  const [gate, setGate] = useState<Gate>(() => (backend.api ? { state: 'checking' } : { state: 'ready' }));

  const check = useCallback(
    async (error: string | null = null) => {
      const api = backend.api;
      if (!api) return setGate({ state: 'ready' });
      try {
        const st = await api.authStatus();
        setGate(st.required && !st.authenticated ? { state: 'login', error } : { state: 'ready' });
      } catch {
        // Serveur injoignable : le bandeau de connexion s'en charge.
        setGate({ state: 'ready' });
      }
    },
    [backend],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const err = backend.prepare ? await backend.prepare() : null;
      if (!cancelled) await check(err);
    })();
    return () => {
      cancelled = true;
    };
  }, [backend, check]);

  return { gate, check };
}

export function App({ backend }: { backend: Backend }) {
  const tab = useStore((s) => s.tab);
  useTheme();
  const { gate, check } = useAuthGate(backend);
  const ready = gate.state === 'ready';

  useEffect(() => {
    if (!ready) return;
    let lastCheck = 0;
    return backend.connect({
      onMessage: (m) => useStore.getState().apply(m),
      onStatus: (s) => {
        useStore.getState().setConn(s);
        // Le flux SSE ne donne pas le code HTTP : on vérifie si l'accès a été révoqué.
        if (s === 'error' && backend.api && Date.now() - lastCheck > 10_000) {
          lastCheck = Date.now();
          void check();
        }
      },
    });
  }, [backend, ready, check]);

  if (gate.state === 'checking') {
    return (
      <div className="login">
        <p className="muted">Connexion au QG…</p>
      </div>
    );
  }
  if (gate.state === 'login') return <LoginScreen backend={backend} error={gate.error} onDone={() => void check()} />;

  return (
    <BackendProvider value={backend}>
      <div className="app">
        <TopBar />
        <ConnectionBanner backend={backend} />
        <main className="stage">
          <WorldView />
          <aside className="side">
            <PermissionQueue />
            <Tabs />
            <div className="side-panel" id="side-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
              {tab === 'chef' ? <ChefPanel /> : tab === 'agents' ? <AgentsPanel /> : <JournalPanel />}
            </div>
          </aside>
        </main>
        <NewAgentDialog />
        <HelpDialog />
        <RemoteDialog />
        <Toasts />
      </div>
    </BackendProvider>
  );
}
