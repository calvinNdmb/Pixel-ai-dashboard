import { useCallback, useEffect, useState } from 'react';
import type { PairingInfo } from '../backend';
import { useStore } from '../store';
import { useAction, useBackend } from './common';
import { Icon } from './icons';

/** Télécommande, téléphone et notifications. */
export function RemoteDialog() {
  const open = useStore((s) => s.remoteOpen);
  const setOpen = useStore((s) => s.setRemoteOpen);
  const info = useStore((s) => s.info);
  const sessions = useStore((s) => s.sessions);
  const backend = useBackend();
  const run = useAction();
  const toast = useStore((s) => s.toast);
  const [pairing, setPairing] = useState<PairingInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const loadPairing = useCallback(async () => {
    if (!backend.api) return;
    setLoading(true);
    try {
      setPairing(await backend.api.pairing());
    } catch (err) {
      setPairing({ enabled: false, hint: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  }, [backend]);

  useEffect(() => {
    if (!open) return;
    void loadPairing();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loadPairing, setOpen]);

  if (!open) return null;
  const remoteMode = Boolean(info?.remoteMode);
  const terminals = Object.values(sessions).filter((s) => (s.source === 'hook' || s.source === 'watch') && s.status !== 'ended');
  const viaHooks = terminals.filter((s) => s.source === 'hook').length;
  const channels = info?.notifyChannels ?? [];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="remote-title">
        <header className="modal-head">
          <h2 id="remote-title">Télécommande & téléphone</h2>
          <button type="button" className="icon-btn" onClick={() => setOpen(false)} title="Fermer">
            <Icon name="close" />
            <span className="sr-only">Fermer</span>
          </button>
        </header>
        <div className="help">
          <section className="remote-section">
            <div className="remote-row">
              <div>
                <h3>Mode télécommande</h3>
                <p>
                  Quand tu t'éloignes de ton ordinateur : les demandes d'autorisation et les fins de tour de tes sessions terminal
                  (Claude Code et Codex) <strong>attendent ta réponse ici</strong>, depuis ton téléphone si tu veux. Coupe-le en revenant à ton
                  poste : la main revient aussitôt au terminal.
                </p>
                <p className="muted small">
                  {terminals.length
                    ? `${terminals.length} session(s) terminal au QG, dont ${viaHooks} branchée(s) via les hooks (seules celles-ci peuvent être pilotées).`
                    : 'Aucune session terminal pour le moment. Installe les hooks : npm run hooks:install (et -- --codex pour Codex).'}
                </p>
              </div>
              <button
                type="button"
                className={`switch ${remoteMode ? 'on' : ''}`}
                role="switch"
                aria-checked={remoteMode}
                onClick={() => run(() => backend.setRemoteMode(!remoteMode), remoteMode ? 'Télécommande coupée' : 'Télécommande activée')}
              >
                <span className="switch-knob" aria-hidden />
                <span>{remoteMode ? 'Activée' : 'Coupée'}</span>
              </button>
            </div>
          </section>

          <section className="remote-section">
            <h3>Connecter ton téléphone</h3>
            {backend.kind === 'demo' ? (
              <p className="muted">
                En démo, rien à connecter. Avec le serveur : lance <code>npm run remote</code> (même Wi-Fi) ou passe par un tunnel
                (Tailscale, Cloudflare), puis scanne le QR code affiché ici.
              </p>
            ) : loading && !pairing ? (
              <p className="muted">Génération du code…</p>
            ) : pairing?.enabled && pairing.svg ? (
              <div className="pairing">
                <img className="qr" alt={`QR code d'appairage : ${pairing.url}`} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(pairing.svg)}`} />
                <div className="pairing-text">
                  <p>{pairing.hint}</p>
                  <p>
                    Code : <strong className="mono pair-code">{pairing.code}</strong>
                  </p>
                  <p className="mono small break">{pairing.url}</p>
                  <div className="row">
                    <button type="button" className="btn btn-ghost" onClick={() => void loadPairing()}>
                      Nouveau code
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() =>
                        run(async () => {
                          const n = await backend.api!.revokeDevices();
                          toast({ kind: 'success', text: `${n} appareil(s) déconnecté(s).` });
                        })
                      }
                    >
                      Déconnecter les appareils
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="muted">{pairing?.hint}</p>
            )}
          </section>

          <section className="remote-section">
            <h3>Notifications sur le téléphone</h3>
            {channels.length ? (
              <div className="remote-row">
                <p>
                  Envoi actif via <strong>{channels.join(', ')}</strong> : demandes d'autorisation, sessions qui t'attendent, rapports du Chef
                  et erreurs.
                </p>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() =>
                    run(async () => {
                      const sent = await backend.api!.testNotifications();
                      toast({ kind: 'success', text: `Notification de test envoyée (${sent.join(', ')}).` });
                    })
                  }
                  disabled={!backend.api}
                >
                  Tester
                </button>
              </div>
            ) : (
              <p className="muted">
                Pour être prévenu même dashboard fermé, définis <code>NOTIFY_NTFY=https://ntfy.sh/ton-sujet-secret</code> (application ntfy) ou
                <code> NOTIFY_WEBHOOK</code> (Discord, Slack), et <code>PUBLIC_URL</code> pour que la notification ouvre le dashboard.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
