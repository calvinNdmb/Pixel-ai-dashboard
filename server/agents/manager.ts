import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { MANAGER_TOOL_PREFIX } from '../../shared/activity';
import type { Hub } from '../../shared/hub';
import type { ReportLevel, SessionInfo } from '../../shared/types';
import { truncate } from '../../shared/util';
import type { Config } from '../config';
import type { TurnResult } from './mapper';
import { PoolError, removeHookDuplicates, type WorkerPool } from './pool';
import { ManagedSession } from './session';

export const CHEF_ID = 'chef';

/** Nombre max de relances automatiques Chef → agent sans intervention humaine. */
const MAX_AUTO_FOLLOWUPS = 6;

const TOOL_NAMES = [
  'list_agents',
  'spawn_agent',
  'message_agent',
  'get_agent_log',
  'interrupt_agent',
  'stop_agent',
  'report_to_user',
] as const;

const ok = (text: string) => ({ content: [{ type: 'text' as const, text }] });
const fail = (text: string) => ({ content: [{ type: 'text' as const, text }], isError: true });

function chefPrompt(cfg: Config, codex: boolean): string {
  return `
# Ton rôle : « le Chef » du Pixel AI Dashboard

Tu es le Chef, l'agent coordinateur d'un QG en pixel art où chaque session Claude Code est un petit personnage. L'utilisateur te parle depuis le dashboard.

## Ce que tu fais
- Tu transformes les demandes de l'utilisateur en missions claires et indépendantes, puis tu recrutes des agents travailleurs avec \`spawn_agent\`. Chaque agent est une session complète d'agent de code (lecture, écriture de code, commandes).${
    codex
      ? "\n- Tu peux recruter deux sortes d'agents : Claude Code (par défaut, \`agent: \"claude\"\`) ou Codex (\`agent: \"codex\"\`). Choisis Codex quand l'utilisateur le demande, ou pour obtenir un second avis indépendant. Un agent Codex travaille dans un bac à sable sans te demander d'autorisations."
      : ''
  }
- Tu ne modifies jamais de fichiers et n'exécutes aucune commande toi-même : tu peux seulement lire (Read, Glob, Grep) pour comprendre le projet et écrire de bons briefs.
- Tu supervises : tu reçois automatiquement des messages « [QG — notification automatique] » quand un agent termine un tour, échoue ou s'arrête. Tu peux aussi consulter l'équipe (\`list_agents\`), relire le journal d'un agent (\`get_agent_log\`), lui donner des consignes (\`message_agent\`), l'interrompre (\`interrupt_agent\`) ou le libérer quand il a fini (\`stop_agent\`).
- Tu remontes l'information : utilise \`report_to_user\` pour chaque jalon important (mission terminée, problème bloquant, décision à prendre, question). Un rapport = un titre court + un résumé concret : ce qui a été fait, le résultat, les prochaines étapes. Niveaux : info, success, warning, question.

## Règles
- Un bon brief contient : l'objectif, le contexte utile (fichiers, contraintes), le critère de fin (« terminé quand… »), et la demande de conclure par un résumé.
- Évite que deux agents modifient les mêmes fichiers en même temps. ${cfg.maxWorkers} agents actifs maximum.
- Les autorisations (commandes, écritures de fichiers) sont accordées par l'utilisateur dans le dashboard : ne les promets pas à sa place. Si un agent attend une autorisation, signale-le simplement.
- Si un agent pose une question à laquelle tu peux répondre avec le contexte disponible, réponds-lui avec \`message_agent\` ; sinon, transmets la question à l'utilisateur (rapport de niveau « question »).
- Libère (\`stop_agent\`) les agents dont la mission est terminée et validée.
- Quand une notification ne demande aucune action, réponds en une phrase très courte.
- Écris en français, de façon concise et chaleureuse.
- Dossier de travail par défaut des agents : ${cfg.defaultCwd}
`.trim();
}

/**
 * Le Chef : une session Claude Code (via le SDK) dotée d'outils MCP internes
 * pour piloter les agents travailleurs et rendre compte à l'utilisateur.
 */
export class Manager {
  private session: ManagedSession | null = null;
  private agentSessionId: string | undefined;
  private notes: string[] = [];
  private noteTimer: ReturnType<typeof setTimeout> | null = null;
  private followUps = new Map<string, number>();

  constructor(
    private hub: Hub,
    private pool: WorkerPool,
    private cfg: Config,
  ) {}

  ensureHubSession(): void {
    const existing = this.hub.getSession(CHEF_ID);
    const base = {
      status: 'idle' as const,
      activity: 'idle' as const,
      activityLabel: 'Attend tes instructions',
      pending: undefined,
      controllable: true,
      cwd: this.cfg.defaultCwd,
      resumable: false,
    };
    if (existing) {
      this.hub.updateSession(CHEF_ID, base);
      return;
    }
    this.hub.createSession({
      id: CHEF_ID,
      name: 'Chef',
      role: 'manager',
      source: 'sdk',
      task: "Coordonner l'équipe et te faire des rapports",
      model: this.cfg.managerModel,
      ...base,
    });
    if (this.hub.snapshot().chat.length === 0) {
      const who = this.pool.codexAvailable ? 'des agents Claude Code ou Codex' : 'des agents Claude Code';
      this.hub.addChat(
        'manager',
        `Salut ! Je suis le Chef. Donne-moi un objectif : je le découpe en missions, je recrute ${who} et je te fais des rapports au fil de l'eau.`,
      );
    }
  }

  isAgentSession(agentSessionId: string): boolean {
    return this.agentSessionId === agentSessionId;
  }

  get alive(): boolean {
    return Boolean(this.session?.alive);
  }

  // ----------------------------------------------------------------- outils

  private resolveAgent(ref: string): SessionInfo | undefined {
    const r = ref.trim().toLowerCase();
    return this.hub
      .listSessions()
      .find((s) => s.id !== CHEF_ID && (s.id.toLowerCase() === r || s.name.toLowerCase() === r));
  }

  private buildMcpServer() {
    const hub = this.hub;
    const pool = this.pool;

    return createSdkMcpServer({
      name: 'pixel',
      version: '0.1.0',
      instructions: 'Outils du QG Pixel : gestion des agents travailleurs et rapports à l’utilisateur.',
      alwaysLoad: true,
      tools: [
        tool(
          'list_agents',
          "Liste les sessions du QG (agents recrutés, agents lancés par l'utilisateur, sessions terminal observées) avec statut, action en cours, mission, dernier message et autorisations en attente.",
          {},
          async () => {
            const rows = hub
              .listSessions()
              .filter((s) => s.id !== CHEF_ID)
              .map((s) => ({
                id: s.id,
                nom: s.name,
                type:
                  s.role === 'subagent'
                    ? 'sous-agent'
                    : s.source === 'hook' || s.source === 'watch'
                      ? 'session terminal (lecture seule)'
                      : 'agent',
                outil: s.agent,
                machine: s.host,
                statut: s.status,
                action: s.activityLabel,
                mission: truncate(s.task, 240),
                dernier_message: truncate(s.lastText, 500),
                autorisation_en_attente: s.pending?.summary,
                cout_usd: Number(s.costUsd.toFixed(3)),
                dossier: s.cwd,
                pilotable: s.controllable && s.source === 'sdk' && s.status !== 'ended',
              }));
            return ok(rows.length ? JSON.stringify(rows, null, 2) : "Aucun agent pour l'instant.");
          },
        ),
        tool(
          'spawn_agent',
          'Recrute un nouvel agent travailleur (session Claude Code complète) et lui confie une mission. Le brief doit être autonome : objectif, contexte, contraintes, critère de fin.',
          {
            task: z.string().min(10).describe('Brief complet de la mission.'),
            name: z.string().max(24).optional().describe("Prénom de l'agent (optionnel)."),
            cwd: z.string().optional().describe(`Dossier de travail (défaut : ${this.cfg.defaultCwd}).`),
            model: z.string().optional().describe('Modèle, ex. "sonnet", "opus", "haiku". Vide = défaut.'),
            permission_mode: z
              .enum(['default', 'acceptEdits', 'plan'])
              .optional()
              .describe("Mode d'autorisation : default (demande pour les actions sensibles), acceptEdits (éditions auto), plan (propose un plan d'abord / lecture seule pour Codex)."),
            agent: z
              .enum(['claude', 'codex'])
              .optional()
              .describe(pool.codexAvailable ? "Outil de l'agent : claude (défaut) ou codex." : 'Seul claude est disponible sur ce serveur.'),
          },
          async (args) => {
            try {
              const s = pool.spawn({
                agent: args.agent,
                task: args.task,
                name: args.name,
                cwd: args.cwd,
                model: args.model,
                permissionMode: args.permission_mode,
                parentId: CHEF_ID,
                supervised: true,
              });
              hub.updateSession(CHEF_ID, { focusId: s.id });
              hub.addChat('system', `Le Chef a recruté ${s.name} : ${truncate(args.task, 160)}`);
              return ok(
                `Agent recruté : ${s.name} (id ${s.id}). Il démarre ; tu recevras une notification à la fin de chacun de ses tours.`,
              );
            } catch (err) {
              return fail(err instanceof Error ? err.message : String(err));
            }
          },
        ),
        tool(
          'message_agent',
          "Envoie des consignes ou une réponse à un agent travailleur (par id ou par nom). S'il est occupé, le message est traité après son tour en cours.",
          {
            agent_id: z.string().describe("Id ou nom de l'agent."),
            message: z.string().min(1),
          },
          async (args) => {
            const s = this.resolveAgent(args.agent_id);
            if (!s) return fail(`Agent introuvable : ${args.agent_id}`);
            if (s.source !== 'sdk') return fail(`${s.name} est une session terminal : impossible de lui écrire.`);
            const count = (this.followUps.get(s.id) ?? 0) + 1;
            if (count > MAX_AUTO_FOLLOWUPS) {
              return fail(
                `Tu as déjà relancé ${s.name} ${MAX_AUTO_FOLLOWUPS} fois sans intervention de l'utilisateur. Fais-lui un rapport (report_to_user) et attends sa réponse avant de continuer.`,
              );
            }
            try {
              const { queued } = pool.send(s.id, args.message);
              this.followUps.set(s.id, count);
              hub.updateSession(CHEF_ID, { focusId: s.id });
              return ok(queued ? `Message mis en file pour ${s.name} (il termine son tour en cours).` : `Message envoyé à ${s.name}.`);
            } catch (err) {
              return fail(err instanceof Error ? err.message : String(err));
            }
          },
        ),
        tool(
          'get_agent_log',
          "Relit les derniers événements du journal d'un agent (outils utilisés, messages, erreurs).",
          {
            agent_id: z.string().describe("Id ou nom de l'agent."),
            limit: z.number().int().min(1).max(100).optional().describe('Nombre d’événements (défaut 30).'),
          },
          async (args) => {
            const s = this.resolveAgent(args.agent_id);
            if (!s) return fail(`Agent introuvable : ${args.agent_id}`);
            hub.updateSession(CHEF_ID, { focusId: s.id });
            const lines = hub.sessionEvents(s.id, args.limit ?? 30).map((e) => {
              const t = new Date(e.ts).toLocaleTimeString('fr-FR');
              return `[${t}] ${e.kind}${e.tool ? `(${e.tool})` : ''} : ${truncate(e.text, 400)}`;
            });
            return ok(lines.length ? `Journal de ${s.name} :\n${lines.join('\n')}` : `Journal de ${s.name} vide.`);
          },
        ),
        tool(
          'interrupt_agent',
          "Interrompt le tour en cours d'un agent (il s'arrête et attend de nouvelles consignes).",
          { agent_id: z.string() },
          async (args) => {
            const s = this.resolveAgent(args.agent_id);
            if (!s || s.source !== 'sdk') return fail(`Agent pilotable introuvable : ${args.agent_id}`);
            try {
              hub.updateSession(CHEF_ID, { focusId: s.id });
              await pool.interrupt(s.id);
              return ok(`${s.name} a été interrompu.`);
            } catch (err) {
              return fail(err instanceof Error ? err.message : String(err));
            }
          },
        ),
        tool(
          'stop_agent',
          'Libère un agent : sa session Claude Code est fermée (à faire quand sa mission est terminée).',
          { agent_id: z.string() },
          async (args) => {
            const s = this.resolveAgent(args.agent_id);
            if (!s || s.source !== 'sdk') return fail(`Agent pilotable introuvable : ${args.agent_id}`);
            pool.stop(s.id);
            return ok(`${s.name} a été libéré.`);
          },
        ),
        tool(
          'report_to_user',
          "Envoie un rapport à l'utilisateur (affiché en évidence dans le dashboard, avec notification).",
          {
            title: z.string().min(1).max(120).describe('Titre court.'),
            body: z.string().min(1).describe('Résumé concret : fait, résultat, prochaines étapes.'),
            level: z.enum(['info', 'success', 'warning', 'question']).optional(),
            agent_ids: z.array(z.string()).optional().describe('Agents concernés (ids ou noms).'),
          },
          async (args) => {
            const ids = (args.agent_ids ?? []).map((ref) => this.resolveAgent(ref)?.id).filter((v): v is string => Boolean(v));
            hub.addReport((args.level ?? 'info') as ReportLevel, args.title, args.body, ids);
            return ok("Rapport transmis à l'utilisateur.");
          },
        ),
      ],
    });
  }

  // ---------------------------------------------------------- cycle de vie

  private start(): ManagedSession {
    this.ensureHubSession();
    const resume = this.agentSessionId;
    const session = new ManagedSession(this.hub, {
      hubId: CHEF_ID,
      cwd: this.cfg.defaultCwd,
      model: this.cfg.managerModel,
      permissionMode: 'default',
      systemPromptAppend: chefPrompt(this.cfg, this.pool.codexAvailable),
      tools: ['Read', 'Glob', 'Grep', 'TodoWrite'],
      mcpServers: { pixel: this.buildMcpServer() },
      allowedTools: ['Read', 'Glob', 'Grep', 'TodoWrite', ...TOOL_NAMES.map((n) => `${MANAGER_TOOL_PREFIX}${n}`)],
      // Le Chef ne fait que coordonner : toute autre action est refusée d'office.
      canUseTool: async (toolName) => ({
        behavior: 'deny',
        message: `Le Chef ne peut pas utiliser ${toolName} : délègue cette action à un agent avec spawn_agent ou message_agent.`,
      }),
      maxBudgetUsd: this.cfg.maxBudgetUsd,
      debug: this.cfg.debug,
      ...(resume ? { resume } : {}),
      callbacks: {
        onInit: (id) => {
          this.agentSessionId = id;
          removeHookDuplicates(this.hub, CHEF_ID, id);
        },
        onAssistantText: (text) => this.hub.addChat('manager', text),
        onTurnResult: (r: TurnResult) => {
          if (!r.success) this.hub.addChat('system', `Le Chef a rencontré un problème : ${r.errors.join(' · ') || 'erreur inconnue'}`);
        },
      },
      onExit: (error) => {
        if (this.session === session) this.session = null;
        const message = error instanceof Error ? error.message : error ? String(error) : '';
        this.hub.updateSession(CHEF_ID, {
          status: error ? 'error' : 'idle',
          activity: error ? 'error' : 'idle',
          activityLabel: error ? 'En panne — renvoie-moi un message' : 'Attend tes instructions',
          currentTool: undefined,
          focusId: undefined,
        });
        if (error) {
          this.hub.addChat('system', `La session du Chef s'est arrêtée : ${truncate(message, 300)}`);
          // Une reprise ratée ne doit pas bloquer les prochains essais.
          this.agentSessionId = undefined;
        }
      },
    });
    this.session = session;
    session.start();
    return session;
  }

  userMessage(text: string): void {
    const clean = text.trim();
    if (!clean) throw new PoolError('Message vide.');
    this.hub.addChat('user', clean);
    this.followUps.clear();
    if (!this.cfg.sdkEnabled) {
      this.hub.addChat('system', 'Le SDK Agent est désactivé (DISABLE_SDK=1) : le dashboard observe seulement les sessions.');
      return;
    }
    const session = this.session?.alive ? this.session : this.start();
    session.send(clean);
  }

  /** Signale un événement au Chef (regroupé, et seulement s'il est déjà actif). */
  notify(note: string): void {
    if (!this.session?.alive) return;
    this.notes.push(note);
    if (this.noteTimer) return;
    this.noteTimer = setTimeout(() => {
      this.noteTimer = null;
      const batch = this.notes.splice(0);
      if (!batch.length || !this.session?.alive) return;
      this.hub.addEvent(CHEF_ID, 'system', `Notification : ${truncate(batch.join(' | '), 300)}`);
      this.session.send(`[QG — notification automatique]\n\n${batch.join('\n\n---\n\n')}`);
    }, 2000);
  }

  onWorkerTurn(s: SessionInfo, result: TurnResult): void {
    if (s.supervised === false) return;
    this.notify(
      [
        `L'agent ${s.name} (id ${s.id}) a terminé un tour ${result.success ? 'avec succès' : 'en erreur'}.`,
        `Mission : ${truncate(s.task, 400)}`,
        `Réponse : ${truncate(result.text || s.lastText || result.errors.join(' · '), 2000) || '(vide)'}`,
        `Coût cumulé : ${s.costUsd.toFixed(3)} $`,
      ].join('\n'),
    );
  }

  onWorkerExit(s: SessionInfo, error?: unknown): void {
    if (s.supervised === false) return;
    const why = error ? ` sur une erreur : ${error instanceof Error ? error.message : String(error)}` : '';
    this.notify(`La session de ${s.name} (id ${s.id}) s'est arrêtée${why}.`);
  }

  /** L'utilisateur a parlé directement à un agent : on remet son compteur de relances à zéro. */
  resetFollowUps(agentId: string): void {
    this.followUps.delete(agentId);
  }

  async interrupt(): Promise<void> {
    await this.session?.interrupt();
  }

  stop(): void {
    this.session?.stop();
  }
}
