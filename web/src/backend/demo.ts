import { Hub } from '../../../shared/hub';
import { Simulator } from '../../../shared/simulator';
import type { PermissionDecision, SpawnWorkerRequest, StreamMessage } from '../../../shared/types';
import type { Backend, ConnStatus } from './types';

/** Tout le QG simulé dans le navigateur : aucune clé, aucun serveur. */
export class DemoBackend implements Backend {
  readonly kind = 'demo' as const;
  private hub = new Hub({
    mode: 'demo',
    version: 'démo',
    sdkAvailable: false,
    defaultCwd: '~/projets/boutique',
    maxWorkers: 6,
    defaultPermissionMode: 'default',
    authRequired: false,
  });
  private sim = new Simulator(this.hub);
  private started = false;

  connect(h: { onMessage(m: StreamMessage): void; onStatus(s: ConnStatus): void }): () => void {
    const unsubscribe = this.hub.subscribe(h.onMessage);
    h.onStatus('open');
    h.onMessage(this.hub.snapshot());
    if (!this.started) {
      this.started = true;
      this.sim.start();
    }
    return unsubscribe;
  }

  sendToManager(text: string) {
    return this.sim.sendToManager(text);
  }
  spawnWorker(req: SpawnWorkerRequest) {
    return this.sim.spawnWorker(req);
  }
  sendToSession(id: string, text: string) {
    return this.sim.sendToSession(id, text);
  }
  interrupt(id: string) {
    return this.sim.interrupt(id);
  }
  stop(id: string) {
    return this.sim.stop(id);
  }
  resume(id: string) {
    return this.sim.resume(id);
  }
  dismiss(id: string) {
    return this.sim.dismiss(id);
  }
  answerPermission(requestId: string, decision: PermissionDecision) {
    return this.sim.answerPermission(requestId, decision);
  }
}
