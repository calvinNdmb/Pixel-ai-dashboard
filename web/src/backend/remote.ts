import type { PermissionDecision, SpawnWorkerRequest, StreamMessage } from '../../../shared/types';
import type { AuthStatus, Backend, ConnStatus, PairingInfo, RemoteApi } from './types';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new HttpError(res.status, data.error ?? `Erreur ${res.status}`);
  return data as T;
}

/**
 * Connexion au serveur Node : flux SSE pour l'état, REST pour les commandes.
 * L'authentification (accès à distance) passe par un cookie d'appareil.
 */
export class RemoteBackend implements Backend {
  readonly kind = 'remote' as const;

  readonly api: RemoteApi = {
    authStatus: () => call<AuthStatus>('GET', '/api/auth/status'),
    login: async (token) => {
      await call('POST', '/api/auth/login', { token });
    },
    pair: async (code) => {
      await call('POST', '/api/auth/pair', { code });
    },
    logout: async () => {
      await call('POST', '/api/auth/logout');
    },
    pairing: () => call<PairingInfo>('GET', '/api/auth/pairing'),
    revokeDevices: async () => (await call<{ revoked: number }>('POST', '/api/auth/revoke')).revoked,
    testNotifications: async () => (await call<{ sent: string[] }>('POST', '/api/notify/test')).sent,
  };

  private prepared?: Promise<string | null>;

  /**
   * Gère les liens d'appairage (`?pair=CODE`) et d'accès (`?token=…`), puis
   * nettoie l'URL. Renvoie une erreur lisible si le code est refusé.
   * Idempotent : un code d'appairage n'est utilisable qu'une fois.
   */
  prepare(): Promise<string | null> {
    this.prepared ??= this.consumeUrlCredentials();
    return this.prepared;
  }

  private async consumeUrlCredentials(): Promise<string | null> {
    let url: URL;
    try {
      url = new URL(location.href);
    } catch {
      return null;
    }
    const pair = url.searchParams.get('pair');
    const token = url.searchParams.get('token');
    if (!pair && !token) return null;
    url.searchParams.delete('pair');
    url.searchParams.delete('token');
    try {
      history.replaceState(null, '', url.toString());
    } catch {
      /* historique indisponible */
    }
    try {
      if (pair) await this.api.pair(pair);
      else if (token) await this.api.login(token);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  connect(h: { onMessage(m: StreamMessage): void; onStatus(s: ConnStatus): void }): () => void {
    const es = new EventSource('/api/stream', { withCredentials: true });
    h.onStatus('connecting');
    es.onopen = () => h.onStatus('open');
    es.onmessage = (e) => {
      try {
        h.onMessage(JSON.parse(e.data) as StreamMessage);
      } catch (err) {
        console.warn('Message SSE illisible', err);
      }
    };
    es.onerror = () => h.onStatus('error');
    return () => es.close();
  }

  async sendToManager(text: string) {
    await call('POST', '/api/manager/message', { text });
  }
  spawnWorker(req: SpawnWorkerRequest) {
    return call<{ id: string }>('POST', '/api/sessions', req);
  }
  async sendToSession(id: string, text: string) {
    await call('POST', `/api/sessions/${encodeURIComponent(id)}/message`, { text });
  }
  async interrupt(id: string) {
    await call('POST', `/api/sessions/${encodeURIComponent(id)}/interrupt`);
  }
  async stop(id: string) {
    await call('POST', `/api/sessions/${encodeURIComponent(id)}/stop`);
  }
  async resume(id: string) {
    await call('POST', `/api/sessions/${encodeURIComponent(id)}/resume`);
  }
  async dismiss(id: string) {
    await call('DELETE', `/api/sessions/${encodeURIComponent(id)}`);
  }
  async answerPermission(requestId: string, decision: PermissionDecision, message?: string) {
    await call('POST', `/api/permissions/${encodeURIComponent(requestId)}`, { decision, message });
  }
  async setRemoteMode(on: boolean) {
    await call('POST', '/api/remote', { on });
  }
}
