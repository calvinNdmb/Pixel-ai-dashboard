import { useCallback, useEffect, useRef, useState } from 'react';
import type { Backend } from '../backend';
import { useStore } from '../store';
import { AgentsPanel } from './AgentsPanel';
import { ChefPanel } from './ChefPanel';
import { BackendProvider } from './common';
import { HelpDialog } from './HelpDialog';
import { Icon } from './icons';
import { JournalPanel } from './JournalPanel';
import { LoginScreen } from './LoginScreen';
import { NewAgentDialog } from './NewAgentDialog';
import { PermissionQueue } from './PermissionQueue';
import { RemoteDialog } from './RemoteDialog';
import { ChefOverview } from './ChefOverview';
import { MissionsPanel } from './MissionsPanel';
import { VillageDock, VillageHUD } from './VillageHUD';
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
  const panelOpen = useStore((s) => s.panelOpen);
  const chefChat = useStore((s) => s.chefChat);
  const setPanelOpen = useStore((s) => s.setPanelOpen);
  const setChefChat = useStore((s) => s.setChefChat);
  const panelRef = useRef<HTMLElement>(null);
  const previousPanel = useRef({ open: panelOpen, tab });
  useTheme();
  useEffect(() => {
    const before = previousPanel.current;
    if (panelOpen && (!before.open || before.tab !== tab)) panelRef.current?.focus({ preventScroll: true });
    previousPanel.current = { open: panelOpen, tab };
  }, [panelOpen, tab]);
  useEffect(() => {
    const close = (e: globalThis.KeyboardEvent) => {
      const s = useStore.getState();
      if (
        e.key !== 'Escape' ||
        e.defaultPrevented ||
        s.newAgentOpen ||
        s.helpOpen ||
        s.remoteOpen ||
        document.querySelector(':popover-open')
      )
        return;
      setPanelOpen(false);
      document.querySelector<HTMLButtonElement>(`.dock-tile[data-tab="${s.tab}"]`)?.focus();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [setPanelOpen]);
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
      <div className={`app village-app ${panelOpen ? 'panel-is-open' : ''}`}>
        <VillageHUD />
        <ConnectionBanner backend={backend} />
        <main className="stage">
          <WorldView />
          <aside
            className={`side village-side ${tab === 'chef' && !chefChat ? 'is-overview' : ''}`}
            id="side-panel"
            hidden={!panelOpen}
            ref={panelRef}
            tabIndex={-1}
            aria-label={
              tab === 'chef'
                ? 'Le chef du village'
                : tab === 'missions'
                  ? 'Les missions'
                  : tab === 'agents'
                    ? 'Les agents'
                    : 'Le journal'
            }
          >
            <button
              type="button"
              className="panel-close"
              title="Fermer le panneau"
              aria-label="Fermer le panneau"
              onClick={() => {
                setPanelOpen(false);
                document.querySelector<HTMLButtonElement>(`.dock-tile[data-tab="${tab}"]`)?.focus();
              }}
            >
              <Icon name="close" size={12} />
            </button>
            {tab === 'chef' && chefChat ? (
              <button type="button" className="back-to-summary" onClick={() => setChefChat(false)}>
                <Icon name="back" size={12} /> Le point du chef
              </button>
            ) : null}
            {panelOpen ? (
              <>
                {tab === 'missions' || tab === 'journal' || (tab === 'chef' && chefChat) ? <PermissionQueue /> : null}
                <div className="side-panel">
                  {tab === 'chef' ? (
                    chefChat ? (
                      <ChefPanel />
                    ) : (
                      <ChefOverview />
                    )
                  ) : tab === 'agents' ? (
                    <AgentsPanel />
                  ) : tab === 'missions' ? (
                    <MissionsPanel />
                  ) : (
                    <JournalPanel />
                  )}
                </div>
              </>
            ) : null}
          </aside>
        </main>
        <VillageDock />
        <NewAgentDialog />
        <HelpDialog />
        <RemoteDialog />
        <Toasts />
      </div>
    </BackendProvider>
  );
}
