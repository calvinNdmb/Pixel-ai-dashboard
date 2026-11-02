import type { Hub } from './hub';
import type {
  Activity,
  AgentKind,
  Commands,
  PermissionDecision,
  PermissionRequest,
  SessionInfo,
  SpawnWorkerRequest,
} from './types';
import { formatCost, pickName, truncate, uid } from './util';

/**
 * Simulateur du QG : fait vivre un Chef, des agents et une session « terminal »
 * fictifs, sans aucun appel à Claude. Il implémente les mêmes commandes que le
 * serveur réel, ce qui rend la démo interactive (on peut parler au Chef,
 * recruter un agent, accorder une autorisation…).
 */

interface Step {
  activity: Activity;
  tool?: string;
  label: string;
  ms: number;
  file?: string;
  ask?: boolean;
  fail?: string;
  say?: string;
  /** Lance un sous-agent (« stagiaire ») avec cette description. */
  sub?: string;
}

interface Job {
  steps: Step[];
  summary: string;
}

class Run {
  cancelled = false;
  private wakers = new Set<() => void>();
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      if (this.cancelled) return resolve();
      const done = () => {
        clearTimeout(t);
        this.wakers.delete(done);
        resolve();
      };
      const t = setTimeout(done, ms);
      this.wakers.add(done);
    });
  }
  cancel(): void {
    this.cancelled = true;
    for (const w of [...this.wakers]) w();
  }
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const chance = (p: number) => Math.random() < p;

const FILES = {
  api: ['src/routes/users.ts', 'src/routes/auth.ts', 'src/db/queries.ts', 'src/services/billing.ts', 'src/middleware/rateLimit.ts'],
  ui: ['src/components/Header.tsx', 'src/components/Cart.tsx', 'src/pages/Checkout.tsx', 'src/styles/theme.css', 'src/hooks/useCart.ts'],
  test: ['tests/users.test.ts', 'tests/auth.test.ts', 'tests/cart.test.ts', 'tests/e2e/checkout.spec.ts'],
  docs: ['README.md', 'docs/API.md', 'docs/ARCHITECTURE.md', 'CHANGELOG.md'],
};

const MISSIONS = [
  "Ajouter la pagination à l'API /users",
  'Corriger le bug du panier qui se vide au rechargement',
  'Écrire les tests du module de paiement',
  'Documenter les routes de l’API dans docs/API.md',
  'Rechercher la meilleure lib de graphiques pour React',
  'Passer le thème du site en mode sombre',
  'Optimiser les requêtes SQL lentes du tableau de bord',
  'Ajouter un rate limiting sur la route de login',
];

const SUMMARIES: Record<string, string[]> = {
  api: [
    'Pagination ajoutée (paramètres page & limit), 12 tests verts. Fichiers : users.ts, queries.ts.',
    'Endpoint refactoré et validé par les tests. Pense à mettre à jour le client front.',
  ],
  ui: [
    'Thème sombre en place via variables CSS, contraste vérifié. Build OK.',
    'Bug corrigé : le panier est maintenant persisté dans le localStorage. Testé manuellement.',
  ],
  test: ['18 nouveaux tests écrits, couverture du module passée de 41 % à 87 %.', 'Tests ajoutés ; 2 cas limites trouvés et corrigés au passage.'],
  docs: ['Documentation rédigée : 9 routes décrites avec exemples curl.', 'README mis à jour (installation, scripts, déploiement).'],
  research: [
    'Comparatif fait : Recharts (simple), visx (flexible), ECharts (complet). Recommandation : Recharts.',
    "J'ai trouvé 3 approches ; la plus simple est détaillée dans docs/notes.md.",
  ],
};

function kindOf(task: string): keyof typeof SUMMARIES {
  const t = task.toLowerCase();
  if (/test|couverture|spec/.test(t)) return 'test';
  if (/doc|readme|changelog/.test(t)) return 'docs';
  if (/recherch|compar|lib|veille|benchmark/.test(t)) return 'research';
  if (/ui|css|thème|theme|design|page|composant|bouton|panier/.test(t)) return 'ui';
  return 'api';
}

function buildJob(task: string, followUp = false): Job {
  const kind = kindOf(task);
  const files = kind === 'test' ? FILES.test : kind === 'docs' ? FILES.docs : kind === 'ui' ? FILES.ui : FILES.api;
  const f1 = pick(files);
  const f2 = pick(files.filter((f) => f !== f1));
  const keyword = pick(['TODO', 'handleError', 'useCart', 'SELECT', 'export function', 'limit']);
  const steps: Step[] = [{ activity: 'thinking', label: followUp ? 'Relit les consignes' : 'Analyse la mission', ms: 2400 }];

  if (kind === 'research') {
    steps.push({ activity: 'delegating', tool: 'Agent', label: 'Délègue : explorer la documentation', ms: 2200, sub: 'Explorer la documentation' });
    steps.push(
      {
        activity: 'browsing',
        tool: 'WebSearch',
        label: `Recherche « ${truncate(task.replace(/^(rechercher|trouver|comparer)\s+(la |le |les |une? )?/i, ''), 34)} »`,
        ms: 3200,
      },
      { activity: 'browsing', tool: 'WebFetch', label: 'Consulte github.com', ms: 2800 },
      { activity: 'browsing', tool: 'WebFetch', label: 'Consulte npmjs.com', ms: 2400 },
      { activity: 'reading', tool: 'Read', label: 'Lit package.json', ms: 1800, file: 'package.json' },
      { activity: 'planning', tool: 'TodoWrite', label: 'Planifie (3 tâches)', ms: 2000 },
      { activity: 'writing', tool: 'Write', label: 'Écrit notes.md', ms: 3600, file: 'docs/notes.md' },
    );
  } else if (kind === 'docs') {
    steps.push(
      { activity: 'reading', tool: 'Glob', label: 'Liste src/**/*.ts', ms: 1600 },
      { activity: 'reading', tool: 'Read', label: `Lit ${f1.split('/').pop()}`, ms: 2600, file: f1 },
      { activity: 'reading', tool: 'Grep', label: `Cherche « router. »`, ms: 2000 },
      { activity: 'writing', tool: 'Write', label: `Écrit ${f2.split('/').pop()}`, ms: 5200, file: f2 },
      { activity: 'browsing', tool: 'WebFetch', label: 'Consulte developer.mozilla.org', ms: 2200 },
      { activity: 'writing', tool: 'Edit', label: `Modifie ${f2.split('/').pop()}`, ms: 2600, file: f2 },
    );
  } else {
    const testCmd = kind === 'ui' ? 'npm run build' : 'npm test';
    steps.push(
      { activity: 'reading', tool: 'Glob', label: 'Liste src/**/*', ms: 1500 },
      { activity: 'reading', tool: 'Read', label: `Lit ${f1.split('/').pop()}`, ms: 2600, file: f1 },
      { activity: 'reading', tool: 'Grep', label: `Cherche « ${keyword} »`, ms: 1900 },
      { activity: 'planning', tool: 'TodoWrite', label: 'Planifie (4 tâches)', ms: 2200 },
      { activity: 'writing', tool: 'Edit', label: `Modifie ${f1.split('/').pop()}`, ms: 4600, file: f1 },
      { activity: 'writing', tool: 'Write', label: `Écrit ${f2.split('/').pop()}`, ms: 3800, file: f2 },
      {
        activity: 'running',
        tool: 'Bash',
        label: `$ ${testCmd}`,
        ms: 4200,
        ask: chance(0.55),
        ...(chance(0.35) ? { fail: kind === 'ui' ? 'Build : 1 erreur de type' : '2 tests échouent' } : {}),
      },
    );
    const last = steps[steps.length - 1]!;
    if (last.fail) {
      steps.push(
        { activity: 'thinking', label: 'Analyse l’erreur', ms: 2200, say: 'Je corrige ça tout de suite.' },
        { activity: 'writing', tool: 'Edit', label: `Modifie ${f1.split('/').pop()}`, ms: 3000, file: f1 },
        { activity: 'running', tool: 'Bash', label: `$ ${testCmd}`, ms: 3600 },
      );
    }
  }
  steps.push({ activity: 'thinking', label: 'Rédige son résumé', ms: 1800 });
  return { steps, summary: pick(SUMMARIES[kind]!) };
}

interface PendingPerm {
  sessionId: string;
  resolve: (ok: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface SimulatorOptions {
  /** Facteur de vitesse (1 = normal). */
  speed?: number;
  /** Nombre d'agents que le Chef maintient en activité quand l'utilisateur ne fait rien. */
  ambientWorkers?: number;
}

export class Simulator implements Commands {
  private runs = new Map<string, Run>();
  private perms = new Map<string, PendingPerm>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private intervals = new Set<ReturnType<typeof setInterval>>();
  private lastUserAction = 0;
  private holds = new Map<string, (text: string | null) => void>();
  private disposed = false;
  private readonly speed: number;
  private readonly ambient: number;
  readonly chefId = 'chef';

  constructor(
    private hub: Hub,
    opts: SimulatorOptions = {},
  ) {
    this.speed = opts.speed ?? 1;
    this.ambient = opts.ambientWorkers ?? 3;
  }

  // ------------------------------------------------------------ cycle de vie

  start(): void {
    this.hub.createSession({
      id: this.chefId,
      name: 'Chef',
      role: 'manager',
      source: 'demo',
      status: 'idle',
      activity: 'idle',
      activityLabel: 'Attend tes instructions',
      task: "Coordonner l'équipe et te faire des rapports",
      controllable: true,
      model: 'opus',
      cwd: '~/projets/boutique',
    });
    this.hub.addChat(
      'manager',
      "Salut ! Je suis le Chef 👨‍🍳 (mode démo : tout est simulé). Donne-moi un objectif, je le découpe en missions, je recrute des agents (Claude Code ou Codex) et je te fais des rapports au fil de l'eau.",
    );
    this.later(900, () => this.spawn({ task: MISSIONS[0]!, supervised: true }, this.chefId));
    this.later(2600, () => this.spawn({ task: MISSIONS[2]!, supervised: true }, this.chefId));
    this.later(4300, () => this.spawn({ task: MISSIONS[4]!, supervised: true, agent: 'codex' }, this.chefId));
    this.later(6000, () =>
      this.spawnExternal({
        name: 'site-vitrine',
        agent: 'claude',
        source: 'hook',
        cwd: '~/projets/site-vitrine',
        tasks: ['Ajuste le footer', 'Ajoute une page contact', 'Corrige les liens cassés', 'Compresse les images'],
      }),
    );
    this.later(8500, () =>
      this.spawnExternal({
        name: 'api-meteo',
        agent: 'codex',
        source: 'watch',
        cwd: '~/projets/api-meteo',
        host: 'mac-mini',
        tasks: ['Ajoute un cache sur /forecast', 'Écris les tests du parseur', 'Mets à jour la doc OpenAPI'],
      }),
    );
    this.every(16000, () => this.director());
  }

  dispose(): void {
    this.disposed = true;
    for (const resolve of this.holds.values()) resolve(null);
    this.holds.clear();
    for (const t of this.timers) clearTimeout(t);
    for (const i of this.intervals) clearInterval(i);
    for (const r of this.runs.values()) r.cancel();
    for (const p of this.perms.values()) clearTimeout(p.timer);
    this.timers.clear();
    this.intervals.clear();
    this.runs.clear();
    this.perms.clear();
  }

  private later(ms: number, fn: () => void): void {
    if (this.disposed) return;
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms / this.speed);
    this.timers.add(t);
  }

  private every(ms: number, fn: () => void): void {
    if (this.disposed) return;
    this.intervals.add(setInterval(fn, ms / this.speed));
  }

  private workers(): SessionInfo[] {
    return this.hub.listSessions().filter((s) => s.role === 'worker' && s.status !== 'ended');
  }

  /** Le Chef garde un peu d'activité quand l'utilisateur ne fait rien. */
  private director(): void {
    if (Date.now() - this.lastUserAction < 60_000) return;
    const active = this.workers();
    const busy = active.filter((s) => s.status === 'working' || s.status === 'waiting').length;
    if (active.length < this.ambient) {
      const taken = new Set(active.map((s) => s.task));
      const task = pick(MISSIONS.filter((m) => !taken.has(m)));
      this.chefSays(`Je recrute un agent pour : ${task}.`);
      this.spawn({ task, supervised: true }, this.chefId);
    } else if (busy === 0) {
      const idle = active.filter((s) => s.status === 'idle');
      const who = idle.length ? pick(idle) : undefined;
      if (who && chance(0.5)) this.release(who.id);
    }
  }

  private chefSays(text: string): void {
    this.hub.addChat('manager', text);
  }

  private setChef(activity: Activity, label: string, focusId?: string): void {
    this.hub.updateSession(this.chefId, {
      activity,
      activityLabel: label,
      status: activity === 'idle' ? 'idle' : 'working',
      focusId,
      ...(activity === 'idle' ? { currentTool: undefined } : {}),
    });
  }

  private bump(id: string, toolUse: boolean): void {
    const s = this.hub.getSession(id);
    if (!s) return;
    this.hub.updateSession(id, {
      costUsd: s.costUsd + rand(0.002, 0.018),
      tokensIn: s.tokensIn + Math.round(rand(800, 4200)),
      tokensOut: s.tokensOut + Math.round(rand(80, 700)),
      toolUses: s.toolUses + (toolUse ? 1 : 0),
    });
  }

  // ----------------------------------------------------------------- agents

  private spawn(req: SpawnWorkerRequest, parentId?: string): SessionInfo {
    const name = req.name?.trim() || pickName(this.hub.listSessions().map((s) => s.name));
    const agent: AgentKind = req.agent === 'codex' ? 'codex' : 'claude';
    const s = this.hub.createSession({
      name,
      role: 'worker',
      source: 'demo',
      agent,
      status: 'starting',
      activity: 'thinking',
      activityLabel: 'Arrive au QG',
      task: req.task,
      controllable: true,
      supervised: req.supervised ?? true,
      model: req.model || (agent === 'codex' ? 'codex' : pick(['sonnet', 'sonnet', 'opus', 'haiku'])),
      cwd: req.cwd || '~/projets/boutique',
      permissionMode: agent === 'codex' ? (req.permissionMode === 'plan' ? 'read-only' : 'workspace-write') : (req.permissionMode ?? 'default'),
      ...(parentId ? { parentId } : {}),
    });
    this.hub.addEvent(s.id, 'prompt', req.task);
    if (parentId === this.chefId) {
      this.setChef('delegating', `Briefe ${name}`, s.id);
      this.later(3500, () => this.setChef('idle', 'Supervise l’équipe'));
    }
    this.later(2500, () => this.runJob(s.id, buildJob(req.task)));
    return s;
  }

  private spawnExternal(opts: { name: string; agent: AgentKind; source: 'hook' | 'watch'; cwd: string; host?: string; tasks: string[] }): void {
    const s = this.hub.createSession({
      name: opts.name,
      role: 'external',
      source: opts.source,
      agent: opts.agent,
      status: 'idle',
      activity: 'idle',
      activityLabel: 'Session terminal',
      task: `Session ${opts.agent === 'codex' ? 'Codex' : 'Claude Code'} ouverte dans un terminal`,
      controllable: false,
      model: opts.agent === 'codex' ? 'codex' : 'sonnet',
      cwd: opts.cwd,
      ...(opts.host ? { host: opts.host } : {}),
    });
    this.hub.addEvent(
      s.id,
      'system',
      opts.source === 'hook'
        ? `Session ${opts.agent === 'codex' ? 'Codex' : 'Claude Code'} détectée via les hooks`
        : `Session ${opts.agent === 'codex' ? 'Codex' : 'Claude Code'} repérée via son transcript${opts.host ? ` sur ${opts.host}` : ''}`,
    );
    const loop = async (prompt?: string) => {
      const current = this.hub.getSession(s.id);
      if (!current || current.status === 'ended' || this.disposed) return;
      const task = prompt ?? pick(opts.tasks);
      if (!prompt) this.hub.addEvent(s.id, 'prompt', task);
      await this.runJob(s.id, buildJob(task));
      // Télécommande : la session hook attend ta prochaine consigne.
      const reply = opts.source === 'hook' && this.hub.info.remoteMode ? await this.holdForReply(s.id) : null;
      if (reply) void loop(reply);
      else this.later(rand(9000, 18000), () => void loop());
    };
    this.later(3000, () => void loop());
  }

  /** Simule le hook Stop retenu par la télécommande. */
  private holdForReply(id: string): Promise<string | null> {
    return new Promise((resolve) => {
      const s = this.hub.getSession(id);
      if (!s || this.disposed) return resolve(null);
      const expiresAt = Date.now() + 90_000 / this.speed;
      this.hub.updateSession(id, {
        hold: { kind: 'stop', since: Date.now(), expiresAt },
        status: 'waiting',
        activity: 'waiting',
        activityLabel: 'Attend ta prochaine consigne (télécommande)',
      });
      this.hub.addEvent(id, 'system', 'Tour terminé — attend ta prochaine consigne depuis le dashboard');
      const timer = setTimeout(() => this.releaseHold(id, null), 90_000 / this.speed);
      this.holds.set(id, (text) => {
        clearTimeout(timer);
        resolve(text);
      });
    });
  }

  private releaseHold(id: string, text: string | null): boolean {
    const resolve = this.holds.get(id);
    if (!resolve) return false;
    this.holds.delete(id);
    this.hub.updateSession(id, text ? { hold: undefined, status: 'working', activity: 'thinking', activityLabel: 'Reprend avec ta consigne' } : { hold: undefined, status: 'idle', activity: 'idle', activityLabel: 'Attend ta prochaine demande (terminal)' });
    if (text) this.hub.addEvent(id, 'prompt', text);
    else this.hub.addEvent(id, 'system', 'Télécommande : la main revient au terminal');
    resolve(text);
    return true;
  }

  /** Sous-agent (« stagiaire ») : quelques recherches puis il repart. */
  private spawnSubagent(parentId: string, description: string): void {
    const parent = this.hub.getSession(parentId);
    if (!parent) return;
    const child = this.hub.createSession({
      name: `${parent.name}·explore`,
      role: 'subagent',
      source: 'demo',
      agent: parent.agent,
      status: 'working',
      activity: 'thinking',
      activityLabel: description,
      task: description,
      parentId,
      controllable: false,
      cwd: parent.cwd,
    });
    this.hub.addEvent(child.id, 'system', `Sous-agent lancé par ${parent.name}`);
    const steps: Step[] = [
      { activity: 'reading', tool: 'Glob', label: 'Liste docs/**/*.md', ms: 2200 },
      { activity: 'browsing', tool: 'WebFetch', label: 'Consulte recharts.org', ms: 3200 },
      { activity: 'reading', tool: 'Read', label: 'Lit package.json', ms: 2400 },
    ];
    void this.runJob(child.id, { steps, summary: 'Notes de lecture transmises.' }).then(() => {
      if (!this.hub.getSession(child.id)) return;
      this.hub.updateSession(child.id, { status: 'ended', activity: 'leaving', activityLabel: 'Mission accomplie' });
      this.later(9000, () => this.hub.removeSession(child.id));
    });
  }

  private async runJob(id: string, job: Job): Promise<void> {
    if (this.disposed) return;
    this.runs.get(id)?.cancel();
    const run = new Run();
    this.runs.set(id, run);
    const sleep = (ms: number) => run.sleep((ms * rand(0.75, 1.3)) / this.speed);

    for (const step of job.steps) {
      if (run.cancelled) return;
      this.hub.updateSession(id, {
        status: 'working',
        activity: step.activity,
        activityLabel: step.label,
        currentTool: step.tool,
        pending: undefined,
      });
      if (step.tool) this.hub.addEvent(id, 'tool', step.label, { tool: step.tool });
      if (step.say) this.hub.addEvent(id, 'text', step.say);
      if (step.sub) this.spawnSubagent(id, step.sub);
      if (step.file) this.hub.touchFile(id, step.file);
      if (step.ask) {
        const ok = await this.askPermission(id, step);
        if (run.cancelled) return;
        if (!ok) {
          this.hub.addEvent(id, 'text', "D'accord, je n'exécute pas cette commande. Je termine sans.");
          continue;
        }
        this.hub.updateSession(id, { status: 'working', activity: step.activity, activityLabel: step.label });
      }
      await sleep(step.ms);
      if (run.cancelled) return;
      this.bump(id, Boolean(step.tool));
      if (step.fail) {
        this.hub.updateSession(id, { activity: 'error', activityLabel: step.fail });
        this.hub.addEvent(id, 'error', step.fail, { isError: true, tool: step.tool });
        await sleep(2600);
        if (run.cancelled) return;
      }
    }
    if (run.cancelled) return;
    this.runs.delete(id);
    const s = this.hub.getSession(id);
    if (!s) return;
    this.hub.updateSession(id, {
      status: 'idle',
      activity: 'done',
      activityLabel: 'Mission accomplie',
      currentTool: undefined,
      lastText: job.summary,
      turns: s.turns + 1,
    });
    this.hub.addEvent(id, 'result', job.summary);
    if (s.role === 'worker' && s.supervised !== false) this.later(1500, () => this.chefReports(id));
  }

  private chefReports(workerId: string): void {
    const w = this.hub.getSession(workerId);
    if (!w) return;
    this.setChef('thinking', `Relit le travail de ${w.name}`, workerId);
    this.later(2200, () => {
      const fresh = this.hub.getSession(workerId);
      if (!fresh) return;
      this.hub.addReport('success', `${fresh.name} a terminé : ${truncate(fresh.task, 60)}`, fresh.lastText ?? 'Mission terminée.', [
        workerId,
      ]);
      if (chance(0.35)) {
        const follow = pick([
          'Ajoute aussi des tests pour ce que tu viens de faire.',
          'Peux-tu mettre à jour la doc correspondante ?',
          'Vérifie les cas limites et durcis la validation.',
        ]);
        this.chefSays(`Je demande à ${fresh.name} de continuer : « ${follow} »`);
        this.setChef('delegating', `Briefe ${fresh.name}`, workerId);
        this.later(2500, () => {
          this.setChef('idle', 'Supervise l’équipe');
          void this.sendToSession(workerId, follow, true);
        });
      } else {
        this.setChef('idle', 'Supervise l’équipe');
      }
    });
  }

  private release(id: string): void {
    const s = this.hub.getSession(id);
    if (!s) return;
    this.runs.get(id)?.cancel();
    this.hub.updateSession(id, { status: 'ended', activity: 'leaving', activityLabel: 'Rentre chez lui', currentTool: undefined });
    this.hub.addEvent(id, 'system', 'Session terminée — à bientôt !');
    this.later(9000, () => this.hub.removeSession(id));
  }

  private askPermission(id: string, step: Step): Promise<boolean> {
    const s = this.hub.getSession(id);
    const command = step.label.replace(/^\$\s*/, '');
    const req: PermissionRequest = {
      id: uid('p_'),
      sessionId: id,
      toolName: step.tool ?? 'Bash',
      summary: `Exécuter : ${command}`,
      detail: JSON.stringify({ command, description: 'Lance la suite de vérifications' }, null, 2),
      canAlwaysAllow: s?.source !== 'hook',
      answerable: s?.source !== 'hook' || this.hub.info.remoteMode,
      createdAt: Date.now(),
    };
    this.hub.updateSession(id, {
      status: 'waiting',
      activity: 'waiting',
      activityLabel: `Attend ton feu vert : ${command}`,
      pending: req,
    });
    this.hub.addEvent(id, 'permission', `Demande d'autorisation : ${req.summary}`, { tool: req.toolName });
    return new Promise((resolve) => {
      if (this.disposed) return resolve(false);
      const external = s?.source === 'hook' && !this.hub.info.remoteMode;
      const timer = setTimeout(
        () => this.settlePermission(req.id, true, external ? 'Autorisé dans le terminal' : 'Autorisé automatiquement (démo)'),
        (external ? 9000 : 45000) / this.speed,
      );
      this.perms.set(req.id, { sessionId: id, resolve, timer });
    });
  }

  private settlePermission(reqId: string, ok: boolean, label: string): boolean {
    const p = this.perms.get(reqId);
    if (!p) return false;
    clearTimeout(p.timer);
    this.perms.delete(reqId);
    this.hub.updateSession(p.sessionId, { pending: undefined });
    this.hub.addEvent(p.sessionId, 'permission', label);
    p.resolve(ok);
    return true;
  }

  // --------------------------------------------------------------- commandes

  async sendToManager(text: string): Promise<void> {
    this.lastUserAction = Date.now();
    this.hub.addChat('user', text);
    this.setChef('thinking', 'Réfléchit à ta demande');
    const lower = text.toLowerCase();
    await new Promise((r) => setTimeout(r, 1600 / this.speed));

    if (/point|statut|status|où en|ou en|résum|resum|équipe|equipe|bilan/.test(lower)) {
      const team = this.workers();
      const lines = team.map((w) => `• ${w.name} — ${w.status === 'waiting' ? '⏸ attend ton feu vert' : w.activityLabel ?? w.status} (${truncate(w.task, 40)})`);
      const cost = this.hub.listSessions().reduce((acc, s) => acc + s.costUsd, 0);
      this.hub.addReport(
        'info',
        "Point d'équipe",
        team.length
          ? `${team.length} agent(s) au QG :\n${lines.join('\n')}\nCoût cumulé : ${formatCost(cost)}.`
          : "Personne au travail pour l'instant. Donne-moi une mission !",
        team.map((w) => w.id),
      );
      this.setChef('idle', 'Supervise l’équipe');
      return;
    }

    const parts = text
      .split(/\n|;|\bpuis\b|\bensuite\b|\bet aussi\b/i)
      .map((p) => p.trim().replace(/^[-•*\d.)\s]+/, ''))
      .filter((p) => p.length > 3)
      .slice(0, 3);
    const tasks = parts.length ? parts : [text.trim()];
    this.chefSays(
      tasks.length > 1
        ? `Compris ! Je découpe ça en ${tasks.length} missions et je recrute l'équipe :\n${tasks.map((t, i) => `${i + 1}. ${t}`).join('\n')}\nJe te fais un rapport dès qu'il y a du nouveau.`
        : `Compris ! Je confie « ${truncate(tasks[0], 80)} » à un agent et je te tiens au courant.`,
    );
    tasks.forEach((task, i) => this.later(i * 1400, () => this.spawn({ task, supervised: true }, this.chefId)));
  }

  async spawnWorker(req: SpawnWorkerRequest): Promise<{ id: string }> {
    this.lastUserAction = Date.now();
    const s = this.spawn(req);
    return { id: s.id };
  }

  async sendToSession(id: string, text: string, fromChef = false): Promise<void> {
    if (!fromChef) this.lastUserAction = Date.now();
    if (id === this.chefId) return this.sendToManager(text);
    const s = this.hub.getSession(id);
    if (s && !s.controllable) {
      if (!this.releaseHold(id, text)) throw new Error("Cette session terminal n'attend pas de consigne : active la télécommande.");
      return;
    }
    if (!s) return;
    this.hub.addEvent(id, 'prompt', text);
    if (this.runs.has(id)) {
      this.hub.addEvent(id, 'text', 'Bien noté, je le prends en compte dès que possible.');
      return;
    }
    if (s.status === 'ended') return;
    this.hub.updateSession(id, { task: s.task ?? text });
    void this.runJob(id, buildJob(`${s.task ?? ''} ${text}`, true));
  }

  async interrupt(id: string): Promise<void> {
    this.lastUserAction = Date.now();
    if (id === this.chefId) {
      this.setChef('idle', 'Attend tes instructions');
      return;
    }
    if (this.releaseHold(id, null)) return;
    this.runs.get(id)?.cancel();
    this.runs.delete(id);
    for (const [reqId, p] of this.perms) if (p.sessionId === id) this.settlePermission(reqId, false, 'Demande annulée');
    this.hub.updateSession(id, { status: 'idle', activity: 'idle', activityLabel: 'Interrompu', currentTool: undefined, pending: undefined });
    this.hub.addEvent(id, 'system', "Interrompu par l'utilisateur");
  }

  async stop(id: string): Promise<void> {
    this.lastUserAction = Date.now();
    if (id === this.chefId) return this.interrupt(id);
    for (const [reqId, p] of this.perms) if (p.sessionId === id) this.settlePermission(reqId, false, 'Demande annulée');
    this.runs.get(id)?.cancel();
    this.runs.delete(id);
    this.hub.updateSession(id, {
      status: 'ended',
      activity: 'leaving',
      activityLabel: 'Session arrêtée',
      currentTool: undefined,
      pending: undefined,
      resumable: true,
    });
    this.hub.addEvent(id, 'system', 'Session arrêtée');
  }

  async resume(id: string): Promise<void> {
    this.lastUserAction = Date.now();
    const s = this.hub.getSession(id);
    if (!s || s.status !== 'ended') return;
    this.hub.updateSession(id, { status: 'idle', activity: 'idle', activityLabel: 'De retour au QG', resumable: false });
    this.hub.addEvent(id, 'system', 'Session reprise');
  }

  async dismiss(id: string): Promise<void> {
    if (id === this.chefId) return;
    this.runs.get(id)?.cancel();
    this.runs.delete(id);
    this.hub.removeSession(id);
  }

  async setRemoteMode(on: boolean): Promise<void> {
    this.lastUserAction = Date.now();
    this.hub.setInfo({ remoteMode: on });
    if (!on) for (const id of [...this.holds.keys()]) this.releaseHold(id, null);
  }

  async answerPermission(requestId: string, decision: PermissionDecision): Promise<void> {
    this.lastUserAction = Date.now();
    const label = decision === 'deny' ? 'Autorisation refusée' : decision === 'always' ? 'Autorisation accordée (toujours)' : 'Autorisation accordée';
    this.settlePermission(requestId, decision !== 'deny', label);
  }
}
