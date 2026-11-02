import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Hub } from '../shared/hub';
import { Simulator } from '../shared/simulator';
import type { Commands, PermissionDecision, SpawnWorkerRequest } from '../shared/types';
import { CHEF_ID, Manager } from './agents/manager';
import { PermissionBroker } from './agents/permissions';
import { PoolError, WorkerPool } from './agents/pool';
import { isLoopback, loadConfig } from './config';
import { HookIngestor } from './hooks';
import { Persistence } from './persist';
import { securityMiddleware } from './security';

const VERSION = '0.1.0';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const cfg = loadConfig();
if (!isLoopback(cfg.host) && !cfg.token) {
  console.error(`✖ HOST=${cfg.host} expose le dashboard sur le réseau : définis PIXEL_TOKEN pour protéger l'API.`);
  process.exit(1);
}

const hub = new Hub({
  mode: cfg.demo ? 'demo' : 'live',
  version: VERSION,
  sdkAvailable: !cfg.demo && cfg.sdkEnabled,
  defaultCwd: cfg.defaultCwd,
  maxWorkers: cfg.maxWorkers,
  defaultPermissionMode: cfg.defaultPermissionMode,
  authRequired: Boolean(cfg.token),
});

let commands: Commands;
let ingestor: HookIngestor;
let shutdownHooks: Array<() => void> = [];

if (cfg.demo) {
  const sim = new Simulator(hub);
  sim.start();
  commands = sim;
  ingestor = new HookIngestor(hub, () => false);
  shutdownHooks.push(() => sim.dispose());
} else {
  const persistence = cfg.persist ? new Persistence(hub, cfg.dataDir) : null;
  persistence?.load();
  const broker = new PermissionBroker(hub);
  // `manager` est créé juste après : les callbacks ne sont appelés qu'une fois tout initialisé.
  let manager: Manager | null = null;
  const pool = new WorkerPool(hub, broker, cfg, {
    onTurnResult: (s, r) => manager?.onWorkerTurn(s, r),
    onExit: (s, e) => manager?.onWorkerExit(s, e),
  });
  const chef = new Manager(hub, pool, cfg);
  manager = chef;
  chef.ensureHubSession();
  ingestor = new HookIngestor(hub, (sid) => pool.isManagedClaudeSession(sid) || chef.isClaudeSession(sid));

  const requireSdk = () => {
    if (!cfg.sdkEnabled) throw new HttpError(409, 'Le SDK Agent est désactivé (DISABLE_SDK=1).');
  };
  const guard = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (err) {
      if (err instanceof PoolError) throw new HttpError(400, err.message);
      throw err;
    }
  };

  commands = {
    async sendToManager(text) {
      guard(() => chef.userMessage(text));
    },
    async spawnWorker(req) {
      requireSdk();
      const s = guard(() => pool.spawn(req));
      return { id: s.id };
    },
    async sendToSession(id, text) {
      if (id === CHEF_ID) return guard(() => chef.userMessage(text));
      const s = hub.getSession(id);
      if (!s) throw new HttpError(404, 'Session introuvable.');
      if (s.source === 'hook') throw new HttpError(409, 'Session terminal : réponds-lui directement dans ton terminal.');
      chef.resetFollowUps(id);
      guard(() => pool.send(id, text));
    },
    async interrupt(id) {
      if (id === CHEF_ID) return chef.interrupt();
      await guard(() => pool.interrupt(id));
    },
    async stop(id) {
      if (id === CHEF_ID) return chef.stop();
      guard(() => pool.stop(id));
    },
    async resume(id) {
      requireSdk();
      if (id === CHEF_ID) throw new HttpError(400, 'Envoie simplement un message au Chef pour le relancer.');
      guard(() => pool.resume(id));
    },
    async dismiss(id) {
      if (id === CHEF_ID) throw new HttpError(400, 'Le Chef reste au QG.');
      const s = hub.getSession(id);
      if (!s) return;
      if (s.source === 'sdk' && pool.get(id)?.alive) throw new HttpError(409, 'Arrête la session avant de la retirer.');
      hub.removeSession(id);
    },
    async answerPermission(requestId, decision, message) {
      if (!broker.answer(requestId, decision, message)) {
        throw new HttpError(404, 'Demande introuvable (déjà traitée, ou session terminal : réponds dans le terminal).');
      }
    },
  };

  const reaper = setInterval(() => ingestor.reap(), 10 * 60 * 1000);
  const unwatch = persistence?.watch();
  shutdownHooks = [
    () => clearInterval(reaper),
    () => pool.stopAll(),
    () => chef.stop(),
    () => unwatch?.(),
    () => persistence?.save(),
  ];
}

// ------------------------------------------------------------------ HTTP

const app = express();
app.disable('x-powered-by');
app.use(securityMiddleware(cfg));

const json = express.json({ limit: '1mb' });

const route =
  (fn: (req: Request, res: Response) => Promise<unknown> | unknown) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const out = await fn(req, res);
      if (!res.headersSent) res.json(out ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) res.status(err.status).json({ error: err.message });
      else next(err);
    }
  };

const text = (req: Request, field = 'text'): string => {
  const v = (req.body as Record<string, unknown> | undefined)?.[field];
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `Champ « ${field} » requis.`);
  if (v.length > 50_000) throw new HttpError(413, 'Message trop long.');
  return v;
};

const param = (req: Request, name: string): string => {
  const v = req.params[name];
  if (typeof v !== 'string' || !v) throw new HttpError(400, `Paramètre « ${name} » manquant.`);
  return v;
};

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: hub.info.mode, version: VERSION });
});

app.get('/api/state', (_req, res) => {
  res.json(hub.snapshot());
});

app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');
  const send = (msg: unknown) => res.write(`data: ${JSON.stringify(msg)}\n\n`);
  send(hub.snapshot());
  const unsubscribe = hub.subscribe(send);
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
  req.on('close', () => {
    clearInterval(ping);
    unsubscribe();
  });
});

app.post(
  '/api/manager/message',
  json,
  route(async (req) => commands.sendToManager(text(req))),
);

app.post(
  '/api/sessions',
  json,
  route(async (req) => {
    const body = (req.body ?? {}) as Partial<SpawnWorkerRequest>;
    const spawn: SpawnWorkerRequest = {
      task: text(req, 'task'),
      ...(typeof body.name === 'string' ? { name: body.name } : {}),
      ...(typeof body.cwd === 'string' ? { cwd: body.cwd } : {}),
      ...(typeof body.model === 'string' ? { model: body.model } : {}),
      ...(typeof body.permissionMode === 'string' ? { permissionMode: body.permissionMode } : {}),
      ...(typeof body.supervised === 'boolean' ? { supervised: body.supervised } : {}),
    };
    return commands.spawnWorker(spawn);
  }),
);

app.post(
  '/api/sessions/:id/message',
  json,
  route(async (req) => commands.sendToSession(param(req, 'id'), text(req))),
);
app.post(
  '/api/sessions/:id/interrupt',
  route(async (req) => commands.interrupt(param(req, 'id'))),
);
app.post(
  '/api/sessions/:id/stop',
  route(async (req) => commands.stop(param(req, 'id'))),
);
app.post(
  '/api/sessions/:id/resume',
  route(async (req) => commands.resume(param(req, 'id'))),
);
app.delete(
  '/api/sessions/:id',
  route(async (req) => commands.dismiss(param(req, 'id'))),
);

app.post(
  '/api/permissions/:id',
  json,
  route(async (req) => {
    const decision = (req.body as { decision?: unknown } | undefined)?.decision;
    if (decision !== 'allow' && decision !== 'always' && decision !== 'deny') {
      throw new HttpError(400, 'decision doit valoir allow, always ou deny.');
    }
    const message = (req.body as { message?: unknown }).message;
    return commands.answerPermission(param(req, 'id'), decision as PermissionDecision, typeof message === 'string' ? message : undefined);
  }),
);

// Événements des hooks Claude Code (sessions terminal / IDE). Toujours une
// réponse vide et rapide : le dashboard ne bloque jamais Claude Code.
app.post('/api/hooks', express.json({ limit: '5mb', type: () => true }), (req, res) => {
  try {
    ingestor.handle(req.body, { managed: req.get('x-pixel-managed') === '1' });
  } catch (err) {
    console.warn('[hooks] événement ignoré :', err);
  }
  res.json({});
});

// Interface web (build de production).
const webDir = path.join(ROOT, 'dist', 'web');
if (existsSync(path.join(webDir, 'index.html'))) {
  app.use(express.static(webDir, { index: 'index.html', maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(webDir, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res
      .type('html')
      .send(
        `<meta charset="utf-8"><body style="font-family:monospace;background:#1b1830;color:#f4e9d8;padding:2rem">` +
          `<h1>Pixel AI Dashboard — API en ligne ✔</h1>` +
          `<p>L'interface n'est pas encore construite.</p>` +
          `<p>En développement : <code>npm run dev</code> puis ouvre <a style="color:#ffd166" href="http://localhost:5173">http://localhost:5173</a>.</p>` +
          `<p>En production : <code>npm run build</code> puis <code>npm start</code>.</p></body>`,
      );
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: 'Introuvable' });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[http]', err);
  const status = typeof err === 'object' && err && 'status' in err && typeof err.status === 'number' ? err.status : 500;
  if (!res.headersSent) res.status(status).json({ error: status === 500 ? 'Erreur interne' : String((err as Error).message) });
});

const server = app.listen(cfg.port, cfg.host, () => {
  const url = `http://${cfg.host.includes(':') ? `[${cfg.host}]` : cfg.host}:${cfg.port}`;
  console.log(`\n  ▶ Pixel AI Dashboard ${VERSION} — ${cfg.demo ? 'mode DÉMO (simulation)' : 'mode LIVE'}`);
  console.log(`    API      : ${url}/api`);
  console.log(`    Interface: ${existsSync(path.join(webDir, 'index.html')) ? url : 'http://localhost:5173 (npm run dev)'}`);
  console.log(`    Hooks    : POST ${url}/api/hooks  (installe-les avec : npm run hooks:install)`);
  console.log(`    Dossier  : ${cfg.defaultCwd}`);
  if (cfg.token) console.log('    Jeton    : requis (PIXEL_TOKEN)');
  console.log('');
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') console.error(`✖ Le port ${cfg.port} est déjà utilisé (PORT=... pour en choisir un autre).`);
  else console.error(err);
  process.exit(1);
});

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n  ■ Arrêt (${signal})…`);
  for (const fn of shutdownHooks) {
    try {
      fn();
    } catch (err) {
      console.warn(err);
    }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
