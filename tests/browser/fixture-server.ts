/** Local-only deterministic UI fixture. No SDK, credentials or paid agent calls. */
import express from 'express';
import { Hub, makeInfo } from '../../shared/hub';
import type { PermissionDecision, SpawnWorkerRequest } from '../../shared/types';

const app = express();
app.use(express.json());
let hub: Hub;
const requests: Array<{ path: string; body: unknown }> = [];
function reset() {
  hub = new Hub(
    makeInfo({
      mode: 'demo',
      sdkAvailable: true,
      codexAvailable: true,
      defaultCwd: '/projets/Atlas',
      version: 'test-village',
      hostName: 'fixture',
    }),
  );
  requests.length = 0;
  hub.createSession({
    id: 'chef',
    name: 'Sam',
    role: 'manager',
    source: 'sdk',
    status: 'idle',
    activity: 'delegating',
    activityLabel: 'Coordonne les missions',
    seed: 1,
    controllable: true,
  });
  hub.createSession({
    id: 'lea',
    name: 'Léa',
    role: 'worker',
    source: 'sdk',
    status: 'working',
    activity: 'writing',
    activityLabel: 'Prépare les composants',
    task: 'Créer le dashboard responsive',
    supervised: true,
    seed: 8,
    controllable: true,
    tokensIn: 8000,
    tokensOut: 2000,
    costUsd: 0.12,
  });
  hub.createSession({
    id: 'bruno',
    name: 'Bruno',
    role: 'worker',
    source: 'sdk',
    status: 'waiting',
    activity: 'waiting',
    activityLabel: 'Attend ton accord pour lancer les tests',
    task: 'Tester le module de paiement',
    supervised: true,
    seed: 2,
    controllable: true,
    pending: {
      id: 'test-permission',
      sessionId: 'bruno',
      toolName: 'Bash',
      summary: 'Exécuter : npm test',
      detail: 'npm test -- --runInBand',
      canAlwaysAllow: false,
      answerable: true,
      createdAt: Date.now(),
    },
  });
  hub.createSession({
    id: 'archive',
    name: 'Mina',
    role: 'worker',
    source: 'sdk',
    status: 'ended',
    activity: 'done',
    task: 'Documenter les routes API',
    seed: 3,
  });
  hub.addEvent('lea', 'tool', 'Modifie Dashboard.tsx', { tool: 'Edit' });
  hub.addEvent('bruno', 'permission', 'Exécuter : npm test');
  hub.addReport(
    'info',
    'Le front avance',
    'Léa prépare l’interface. Bruno attend ton autorisation pour lancer les tests.',
    ['lea', 'bruno'],
  );
}
reset();
app.post('/__test__/reset', (_req, res) => {
  reset();
  res.json({ ok: true });
});
app.get('/__test__/requests', (_req, res) => res.json(requests));
app.post('/__test__/update', (req, res) => {
  hub.updateSession(String(req.body.id), req.body.patch);
  res.json({ ok: true });
});
app.get('/api/auth/status', (_req, res) => res.json({ required: false, authenticated: true, devices: 0 }));
app.get('/api/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write(`data: ${JSON.stringify(hub.snapshot())}\n\n`);
  const off = hub.subscribe((m) => res.write(`data: ${JSON.stringify(m)}\n\n`));
  req.on('close', off);
});
app.post('/api/manager/message', (req, res) => {
  requests.push({ path: req.path, body: req.body });
  hub.addChat('user', String(req.body.text));
  hub.addChat('manager', 'Bien reçu. Je prépare la mission demandée.');
  res.json({ ok: true });
});
app.post('/api/sessions', (req, res) => {
  requests.push({ path: req.path, body: req.body });
  const body = req.body as SpawnWorkerRequest;
  const session = hub.createSession({
    id: 'new-agent',
    name: body.name || 'Nova',
    role: 'worker',
    source: 'sdk',
    agent: body.agent || 'claude',
    task: body.task,
    supervised: body.supervised,
    status: 'working',
    activity: 'thinking',
    controllable: true,
    seed: 10,
  });
  res.json({ id: session.id });
});
app.post('/api/permissions/:id', (req, res) => {
  requests.push({ path: req.path, body: req.body });
  const decision = req.body.decision as PermissionDecision;
  if (req.params.id !== 'test-permission' || !['allow', 'deny'].includes(decision)) {
    res.status(400).json({ error: 'Décision invalide' });
    return;
  }
  hub.updateSession('bruno', {
    pending: undefined,
    status: 'working',
    activity: 'running',
    activityLabel: decision === 'allow' ? 'Lance les tests' : 'Autorisation refusée',
  });
  res.json({ ok: true });
});
app.listen(7497, '127.0.0.1', () => console.log('Village fixture: http://127.0.0.1:7497'));
