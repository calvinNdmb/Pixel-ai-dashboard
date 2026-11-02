import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import QRCode from 'qrcode';
import { Hub, makeInfo } from '../shared/hub';
import { Simulator } from '../shared/simulator';
import type { Commands, PermissionDecision, SpawnWorkerRequest } from '../shared/types';
import { loadCodexModule } from './agents/codex-session';
import { CHEF_ID, Manager } from './agents/manager';
import { PermissionBroker } from './agents/permissions';
import { PoolError, WorkerPool } from './agents/pool';
import { Auth } from './auth';
import { isLoopback, loadConfig } from './config';
import { hookRoutes } from './hook-routes';
import { HookIngestor } from './hooks';
import { Notifier } from './notify';
import { Persistence } from './persist';
import { RemoteControl } from './remote';
import { securityMiddleware } from './security';
import { TranscriptWatcher } from './watch';

const VERSION = '0.2.0';
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

// En mode « remote », un jeton est indispensable : on en génère un (et on le garde).
let tokenFile: string | undefined;
if (cfg.remote && !cfg.token) {
  const file = path.join(cfg.dataDir, 'remote-token');
  tokenFile = file;
  mkdirSync(cfg.dataDir, { recursive: true });
  if (existsSync(file)) cfg.token = readFileSync(file, 'utf8').trim() || undefined;
  if (!cfg.token) {
    cfg.token = randomBytes(24).toString('base64url');
    writeFileSync(file, cfg.token, { mode: 0o600 });
  }
}
if (!isLoopback(cfg.host) && !cfg.token) {
  console.error(`✖ HOST=${cfg.host} expose le dashboard sur le réseau : lance « npm run remote » ou définis PIXEL_TOKEN.`);
  process.exit(1);
}

const auth = new Auth(cfg.token, cfg.persist ? cfg.dataDir : undefined);
const codexModule = cfg.demo ? null : await loadCodexModule();

const hub = new Hub(
  makeInfo({
    mode: cfg.demo ? 'demo' : 'live',
    version: VERSION,
    sdkAvailable: !cfg.demo && cfg.sdkEnabled,
    codexAvailable: cfg.demo || (cfg.sdkEnabled && codexModule !== null),
    defaultCwd: cfg.defaultCwd,
    maxWorkers: cfg.maxWorkers,
    defaultPermissionMode: cfg.defaultPermissionMode,
    authRequired: auth.required,
    remoteMode: cfg.remoteModeAtStart,
    hostName: cfg.hostName,
    watching: !cfg.demo && cfg.watchTranscripts,
  }),
);

const remote = new RemoteControl(hub, {
  permissionWaitMs: cfg.remotePermissionWaitMs,
  stopWaitMs: cfg.remoteStopWaitMs,
});
const notifier = new Notifier(hub, cfg);
hub.setInfo({ notifyChannels: notifier.channels });

let commands: Commands;
let ingestor: HookIngestor;
let shutdownHooks: Array<() => void> = [() => remote.dispose(), () => notifier.stop()];

if (cfg.demo) {
  const sim = new Simulator(hub);
  sim.start();
  commands = sim;
  ingestor = new HookIngestor(hub, () => false, cfg.hostName);
  shutdownHooks.push(() => sim.dispose());
} else {
  const persistence = cfg.persist ? new Persistence(hub, cfg.dataDir) : null;
  persistence?.load();
  const broker = new PermissionBroker(hub);
  // `manager` est créé juste après : les callbacks ne sont appelés qu'une fois tout initialisé.
  let manager: Manager | null = null;
  const pool = new WorkerPool(
    hub,
    broker,
    cfg,
    {
      onTurnResult: (s, r) => manager?.onWorkerTurn(s, r),
      onExit: (s, e) => manager?.onWorkerExit(s, e),
    },
    cfg.sdkEnabled ? codexModule : null,
  );
  const chef = new Manager(hub, pool, cfg);
  manager = chef;
  chef.ensureHubSession();
  const isManaged = (sid: string) => pool.isManagedSession(sid) || chef.isAgentSession(sid);
  ingestor = new HookIngestor(hub, isManaged, cfg.hostName);
  const watcher = cfg.watchTranscripts
    ? new TranscriptWatcher(hub, { claudeDir: cfg.claudeDir, codexDir: cfg.codexDir, isManaged, serverHost: cfg.hostName })
    : null;
  watcher?.start();

  const requireSdk = () => {
    if (!cfg.sdkEnabled) throw new HttpError(409, 'Le pilotage des agents est désactivé (DISABLE_SDK=1).');
  };
  const guard = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (err) {
      if (err instanceof PoolError) throw new HttpError(400, err.message);
      throw err;
    }
  };
  const external = (id: string) => {
    const s = hub.getSession(id);
    if (!s) throw new HttpError(404, 'Session introuvable.');
    return s.source === 'hook' || s.source === 'watch' ? s : null;
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
      const ext = external(id);
      if (ext) {
        if (remote.reply(id, text)) return;
        throw new HttpError(
          409,
          ext.source === 'hook'
            ? "Cette session terminal n'attend pas de consigne. Active la télécommande : à sa prochaine fin de tour, elle t'attendra ici."
            : 'Session suivie via son transcript : installe les hooks (npm run hooks:install) pour lui répondre à distance.',
        );
      }
      chef.resetFollowUps(id);
      guard(() => pool.send(id, text));
    },
    async interrupt(id) {
      if (id === CHEF_ID) return chef.interrupt();
      if (external(id)) {
        if (!remote.release(id)) throw new HttpError(409, 'Session terminal : interromps-la depuis ton terminal.');
        return;
      }
      await guard(() => pool.interrupt(id));
    },
    async stop(id) {
      if (id === CHEF_ID) return chef.stop();
      if (external(id)) throw new HttpError(409, 'Session terminal : ferme-la depuis ton terminal.');
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
      remote.release(id);
      hub.removeSession(id);
    },
    async answerPermission(requestId, decision, message) {
      if (broker.answer(requestId, decision, message)) return;
      if (remote.answerPermission(requestId, decision, message)) return;
      throw new HttpError(404, 'Demande introuvable (déjà traitée, ou session terminal hors télécommande : réponds dans le terminal).');
    },
    async setRemoteMode(on) {
      remote.setEnabled(on);
    },
  };

  const reaper = setInterval(() => ingestor.reap(), 10 * 60 * 1000);
  const unwatch = persistence?.watch();
  shutdownHooks = [
    ...shutdownHooks,
    () => clearInterval(reaper),
    () => watcher?.stop(),
    () => pool.stopAll(),
    () => chef.stop(),
    () => unwatch?.(),
    () => persistence?.save(),
  ];
}

notifier.start();

// ------------------------------------------------------------------ HTTP

const app = express();
app.disable('x-powered-by');
app.use(securityMiddleware(cfg, auth));

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

const isSecure = (req: Request) => req.secure || String(req.headers['x-forwarded-proto'] ?? '').split(',')[0] === 'https';
const deviceLabel = (req: Request) => String(req.headers['user-agent'] ?? 'appareil').slice(0, 80);

/** Adresse à donner au téléphone : URL publique, sinon celle utilisée pour joindre ce serveur. */
function dashboardUrl(req: Request): { url: string; reachable: boolean } {
  if (cfg.publicUrl) return { url: cfg.publicUrl, reachable: true };
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? `localhost:${cfg.port}`).split(',')[0]!.trim();
  const proto = isSecure(req) ? 'https' : 'http';
  const hostname = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  const local = isLoopback(hostname);
  if (local && !isLoopback(cfg.host)) {
    const lan = lanAddresses()[0];
    if (lan) return { url: `http://${lan}:${cfg.port}`, reachable: true };
  }
  return { url: `${proto}://${host}`, reachable: !local };
}

function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

// --- santé et état
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: hub.info.mode, version: VERSION });
});

app.get('/api/state', (_req, res) => {
  res.json(hub.snapshot());
});

/** Flux ouverts : fermés quand l'appareil correspondant est déconnecté ou révoqué. */
const streams = new Set<{ req: Request; res: Response }>();
const closeRevokedStreams = () => {
  for (const s of streams) if (!auth.check(s.req)) s.res.end();
};

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
  const entry = { req, res };
  streams.add(entry);
  // Déconnexion du navigateur : c'est la réponse qui se ferme (voir answerHook).
  res.on('close', () => {
    clearInterval(ping);
    unsubscribe();
    streams.delete(entry);
  });
});

// --- authentification (accès à distance)
app.get('/api/auth/status', (req, res) => {
  res.json({ required: auth.required, authenticated: auth.check(req), devices: auth.deviceCount() });
});

app.post(
  '/api/auth/login',
  json,
  route(async (req, res) => {
    const sid = auth.login(text(req, 'token'), deviceLabel(req));
    if (!sid) throw new HttpError(401, 'Jeton invalide.');
    res.setHeader('Set-Cookie', auth.cookie(sid, isSecure(req)));
  }),
);

app.post(
  '/api/auth/pair',
  json,
  route(async (req, res) => {
    const sid = auth.pair(text(req, 'code'), deviceLabel(req));
    if (!sid) throw new HttpError(401, 'Code invalide ou expiré : génère un nouveau QR code depuis le dashboard.');
    res.setHeader('Set-Cookie', auth.cookie(sid, isSecure(req)));
  }),
);

app.post(
  '/api/auth/logout',
  route(async (req, res) => {
    auth.logout(req);
    res.setHeader('Set-Cookie', auth.clearCookie(isSecure(req)));
    closeRevokedStreams();
  }),
);

app.post(
  '/api/auth/revoke',
  route(async () => {
    const revoked = auth.revokeAll();
    closeRevokedStreams();
    return { revoked };
  }),
);

app.get(
  '/api/auth/pairing',
  route(async (req) => {
    if (!auth.required) {
      return {
        enabled: false,
        hint: 'Le dashboard n’écoute que sur cet ordinateur. Relance-le avec « npm run remote » (même Wi-Fi) ou derrière un tunnel (Tailscale, Cloudflare) avec PIXEL_TOKEN.',
      };
    }
    const { code, expiresAt } = auth.createPairing();
    const { url, reachable } = dashboardUrl(req);
    const pairUrl = `${url}/?pair=${encodeURIComponent(code)}`;
    const svg = await QRCode.toString(pairUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    return {
      enabled: true,
      code,
      url: pairUrl,
      svg,
      expiresAt,
      reachable,
      hint: reachable
        ? 'Scanne ce QR code avec ton téléphone (code valable 10 minutes, une seule fois).'
        : 'Cette adresse est locale : ton téléphone ne pourra pas la joindre. Ouvre le dashboard via son adresse réseau ou définis PUBLIC_URL.',
    };
  }),
);

// --- télécommande et notifications
app.post(
  '/api/remote',
  json,
  route(async (req) => {
    const on = (req.body as { on?: unknown } | undefined)?.on;
    if (typeof on !== 'boolean') throw new HttpError(400, 'Champ « on » (booléen) requis.');
    await commands.setRemoteMode(on);
    return { remoteMode: hub.info.remoteMode };
  }),
);

app.post(
  '/api/notify/test',
  route(async () => {
    if (!notifier.channels.length) throw new HttpError(409, 'Aucun canal configuré (NOTIFY_NTFY ou NOTIFY_WEBHOOK).');
    try {
      return { sent: await notifier.test() };
    } catch (err) {
      throw new HttpError(502, err instanceof Error ? err.message : String(err));
    }
  }),
);

// --- pilotage
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
      ...(body.agent === 'codex' || body.agent === 'claude' ? { agent: body.agent } : {}),
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

// --- hooks de Claude Code et de Codex (voir hook-routes.ts)
app.use(hookRoutes({ ingestor, remote }));

// --- interface web (build de production)
const webDir = path.join(ROOT, 'dist', 'web');
if (existsSync(path.join(webDir, 'index.html'))) {
  app.use(
    express.static(webDir, {
      index: 'index.html',
      maxAge: '1h',
      // La page et le manifeste changent à chaque version : toujours revalider.
      setHeaders: (res, file) => {
        if (file.endsWith('.html') || file.endsWith('.webmanifest')) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.setHeader('Cache-Control', 'no-cache');
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

const server = app.listen(cfg.port, cfg.host, async () => {
  const shown = cfg.host === '0.0.0.0' || cfg.host === '::' ? 'localhost' : cfg.host.includes(':') ? `[${cfg.host}]` : cfg.host;
  const url = `http://${shown}:${cfg.port}`;
  const built = existsSync(path.join(webDir, 'index.html'));
  console.log(`\n  ▶ Pixel AI Dashboard ${VERSION} — ${cfg.demo ? 'mode DÉMO (simulation)' : 'mode LIVE'}`);
  console.log(`    Interface : ${built ? url : 'http://localhost:5173 (npm run dev)'}`);
  console.log(`    Hooks     : ${url}/api/hooks  (npm run hooks:install [-- --codex])`);
  console.log(`    Dossier   : ${cfg.defaultCwd}`);
  console.log(`    Codex     : ${hub.info.codexAvailable ? 'disponible' : 'non installé (npm run codex:install pour lancer des agents Codex)'}`);
  if (hub.info.watching) console.log(`    Transcripts : lus dans ${cfg.claudeDir} et ${cfg.codexDir}`);
  if (notifier.channels.length) console.log(`    Notifications : ${notifier.channels.join(', ')}`);
  if (auth.required) {
    const lan = lanAddresses().map((ip) => `http://${ip}:${cfg.port}`);
    const target = cfg.publicUrl ?? lan[0];
    const where = tokenFile ? ` (jeton dans ${path.relative(process.cwd(), tokenFile) || tokenFile})` : '';
    console.log(`    Accès à distance : protégé par jeton${where}`);
    for (const l of [cfg.publicUrl, ...lan].filter(Boolean)) console.log(`      → ${l}`);
    if (target) {
      const { code } = auth.createPairing();
      const pairUrl = `${target}/?pair=${encodeURIComponent(code)}`;
      console.log(`\n    Connecte ton téléphone (code ${code}, valable 10 min) :`);
      try {
        console.log(await QRCode.toString(pairUrl, { type: 'terminal', small: true }));
      } catch {
        /* affichage du QR impossible */
      }
      console.log(`    ${pairUrl}`);
    }
  }
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
