import { useState, type FormEvent } from 'react';
import type { Backend } from '../backend';
import { Icon } from './icons';

/** Écran affiché quand le dashboard est protégé (accès à distance) et que cet appareil n'est pas connecté. */
export function LoginScreen({ backend, error: initialError, onDone }: { backend: Backend; error?: string | null; onDone: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!v || !backend.api) return;
    setBusy(true);
    setError(null);
    try {
      // Un code d'appairage ressemble à « K7P-4QX » ; sinon c'est le jeton complet.
      if (/^[A-Za-z0-9]{3}-?[A-Za-z0-9]{3}$/.test(v)) await backend.api.pair(v);
      else await backend.api.login(v);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <span className="brand-mark" aria-hidden>
          <Icon name="hat" size={26} />
        </span>
        <h1>Pixel AI Dashboard</h1>
        <p className="muted">
          Ce QG est protégé. Scanne le QR code affiché par le serveur (ou dans le dashboard d'un appareil déjà connecté), ou saisis
          le code d'appairage ou le jeton d'accès.
        </p>
        <label htmlFor="login-code">Code ou jeton</label>
        <input
          id="login-code"
          className="mono"
          autoComplete="one-time-code"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="K7P-4QX"
        />
        {error ? (
          <p className="login-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={!value.trim() || busy}>
          <Icon name="key" /> Entrer au QG
        </button>
      </form>
    </div>
  );
}
