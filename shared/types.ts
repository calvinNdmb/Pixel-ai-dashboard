// Types partagés entre le serveur, le navigateur et le simulateur de démo.

/** Rôle d'une session dans le QG. */
export type Role = 'manager' | 'worker' | 'external';

/**
 * Origine d'une session :
 * - `sdk`  : lancée et pilotée par le dashboard via le Claude Agent SDK ;
 * - `hook` : session Claude Code lancée ailleurs (terminal, IDE…) et observée via les hooks ;
 * - `demo` : session simulée.
 */
export type Source = 'sdk' | 'hook' | 'demo';

/** Ce que fait le personnage en ce moment : détermine où il va dans le QG. */
export type Activity =
  | 'idle' // au salon, machine à café
  | 'thinking' // à son bureau, bulle « … »
  | 'planning' // devant le tableau blanc (TodoWrite…)
  | 'reading' // bibliothèque (Read, Grep, Glob…)
  | 'writing' // à son bureau, tape au clavier (Edit, Write…)
  | 'running' // salle serveurs (Bash…)
  | 'browsing' // coin Web / antenne (WebFetch, WebSearch, MCP…)
  | 'delegating' // salle de réunion (sous-agents, outils du Chef)
  | 'waiting' // lève la main : attend une autorisation ou une réponse
  | 'done' // petite célébration, puis salon
  | 'error' // bulle rouge
  | 'leaving'; // session terminée : se dirige vers la sortie

export type SessionStatus = 'starting' | 'working' | 'idle' | 'waiting' | 'error' | 'ended';

export type PermissionModeChoice = 'default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions';

export interface PermissionRequest {
  id: string;
  sessionId: string;
  toolName: string;
  /** Phrase lisible : « Exécuter : npm test ». */
  summary: string;
  /** Aperçu (tronqué) de l'entrée de l'outil. */
  detail?: string;
  /** Une règle « toujours autoriser » est proposée par Claude Code. */
  canAlwaysAllow: boolean;
  createdAt: number;
}

export interface SessionInfo {
  id: string;
  name: string;
  role: Role;
  source: Source;
  status: SessionStatus;
  activity: Activity;
  /** Libellé court de l'action en cours : « Lit src/app.ts ». */
  activityLabel?: string;
  currentTool?: string;
  /** Mission confiée (premier prompt). */
  task?: string;
  /** Dernier texte produit par l'agent (tronqué). */
  lastText?: string;
  cwd?: string;
  model?: string;
  /** Identifiant de session Claude Code (session_id). */
  claudeSessionId?: string;
  permissionMode?: string;
  createdAt: number;
  updatedAt: number;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  toolUses: number;
  turns: number;
  /** Fichiers touchés récemment (le plus récent en premier). */
  files: string[];
  pending?: PermissionRequest;
  /** Graine d'apparence (couleurs du personnage). */
  seed: number;
  /** Le dashboard peut-il lui envoyer des messages / l'interrompre ? */
  controllable: boolean;
  /** Session reprenable (session `sdk` arrêtée avec un session_id connu). */
  resumable?: boolean;
  /** Session lancée par le Chef. */
  parentId?: string;
  /** Le Chef est notifié de l'avancement de cette session. */
  supervised?: boolean;
  /** Session avec laquelle cet agent interagit en ce moment (ex. le Chef qui briefe Nova). */
  focusId?: string;
}

export type EventKind =
  | 'prompt'
  | 'text'
  | 'tool'
  | 'tool_result'
  | 'permission'
  | 'status'
  | 'result'
  | 'error'
  | 'system';

export interface TimelineEvent {
  id: string;
  sessionId: string;
  ts: number;
  kind: EventKind;
  text: string;
  tool?: string;
  isError?: boolean;
}

export type ReportLevel = 'info' | 'success' | 'warning' | 'question';

/** Rapport structuré remonté par le Chef à l'utilisateur. */
export interface Report {
  id: string;
  ts: number;
  level: ReportLevel;
  title: string;
  body: string;
  sessionIds: string[];
}

export interface ChatMessage {
  id: string;
  ts: number;
  from: 'user' | 'manager' | 'system';
  text: string;
  reportId?: string;
}

export interface ServerInfo {
  mode: 'live' | 'demo';
  version: string;
  /** Le SDK Agent est-il utilisable (sinon : observation via hooks uniquement). */
  sdkAvailable: boolean;
  defaultCwd: string;
  maxWorkers: number;
  defaultPermissionMode: PermissionModeChoice;
  /** Un jeton est-il exigé pour l'API ? */
  authRequired: boolean;
}

/** Messages poussés en temps réel (SSE) vers le navigateur. */
export type StreamMessage =
  | {
      type: 'snapshot';
      info: ServerInfo;
      sessions: SessionInfo[];
      events: TimelineEvent[];
      reports: Report[];
      chat: ChatMessage[];
    }
  | { type: 'session'; session: SessionInfo }
  | { type: 'session_removed'; id: string }
  | { type: 'event'; event: TimelineEvent }
  | { type: 'report'; report: Report }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'info'; info: ServerInfo };

export interface SpawnWorkerRequest {
  task: string;
  name?: string;
  cwd?: string;
  model?: string;
  permissionMode?: PermissionModeChoice;
  /** Le Chef suit cet agent et rapporte son avancement (défaut : oui). */
  supervised?: boolean;
}

export type PermissionDecision = 'allow' | 'always' | 'deny';

/** Ensemble des commandes que l'interface peut envoyer (serveur réel ou démo). */
export interface Commands {
  sendToManager(text: string): Promise<void>;
  spawnWorker(req: SpawnWorkerRequest): Promise<{ id: string }>;
  sendToSession(id: string, text: string): Promise<void>;
  interrupt(id: string): Promise<void>;
  stop(id: string): Promise<void>;
  resume(id: string): Promise<void>;
  dismiss(id: string): Promise<void>;
  answerPermission(requestId: string, decision: PermissionDecision, message?: string): Promise<void>;
}
