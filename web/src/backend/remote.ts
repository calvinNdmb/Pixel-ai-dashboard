import type { PermissionDecision, SpawnWorkerRequest, StreamMessage } from '../../../shared/types';
import type { Backend, ConnStatus } from './types';

const TOKEN_KEY = 'pixel-token';

/** Jeton d'accès : passé une fois dans l'URL (?token=…), puis gardé pour l'onglet. */
function readToken(): string | undefined {
  try {
    const url = new URL(location.href);
    const fromUrl = url.searchParams.get('token');
    if (fromUrl) {
      sessionStorage.setItem(TOKEN_KEY, fromUrl);
      url.searchParams.delete('token');
      history.replaceState(null, '', url.toString());
      return fromUrl;
    }
    return sessionStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Connexion au serveur Node : flux SSE pour l'état, REST pour les commandes. */
export class RemoteBackend implements Backend {
  readonly kind = 'remote' as const;
  private token = readToken();

  connect(h: { onMessage(m: StreamMessage): void; onStatus(s: ConnStatus): void }): () => void {
    const url = `/api/stream${this.token ? `?token=${encodeURIComponent(this.token)}` : ''}`;
    const es = new EventSource(url);
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

  private async call<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
    return data as T;
  }

  async sendToManager(text: string) {
    await this.call('POST', '/api/manager/message', { text });
  }
  spawnWorker(req: SpawnWorkerRequest) {
    return this.call<{ id: string }>('POST', '/api/sessions', req);
  }
  async sendToSession(id: string, text: string) {
    await this.call('POST', `/api/sessions/${encodeURIComponent(id)}/message`, { text });
  }
  async interrupt(id: string) {
    await this.call('POST', `/api/sessions/${encodeURIComponent(id)}/interrupt`);
  }
  async stop(id: string) {
    await this.call('POST', `/api/sessions/${encodeURIComponent(id)}/stop`);
  }
  async resume(id: string) {
    await this.call('POST', `/api/sessions/${encodeURIComponent(id)}/resume`);
  }
  async dismiss(id: string) {
    await this.call('DELETE', `/api/sessions/${encodeURIComponent(id)}`);
  }
  async answerPermission(requestId: string, decision: PermissionDecision, message?: string) {
    await this.call('POST', `/api/permissions/${encodeURIComponent(requestId)}`, { decision, message });
  }
}
