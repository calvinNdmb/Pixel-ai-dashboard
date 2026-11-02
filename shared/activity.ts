import type { Activity } from './types';
import { basename, truncate } from './util';

type Input = Record<string, unknown> | undefined;

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Préfixe des outils MCP internes du Chef. */
export const MANAGER_TOOL_PREFIX = 'mcp__pixel__';

/** Associe un outil Claude Code à une activité (et donc à une zone du QG). */
export function activityForTool(toolName: string): Activity {
  const t = toolName.toLowerCase();
  if (t.startsWith(MANAGER_TOOL_PREFIX)) return 'delegating';
  if (t.startsWith('mcp__')) return 'browsing';
  switch (t) {
    case 'read':
    case 'grep':
    case 'glob':
    case 'ls':
    case 'lsp':
    case 'notebookread':
    case 'listmcpresourcestool':
    case 'readmcpresourcetool':
    case 'toolsearch':
    case 'skill':
      return 'reading';
    case 'edit':
    case 'multiedit':
    case 'write':
    case 'notebookedit':
      return 'writing';
    case 'bash':
    case 'bashoutput':
    case 'killshell':
    case 'killbash':
    case 'powershell':
    case 'monitor':
      return 'running';
    case 'webfetch':
    case 'websearch':
      return 'browsing';
    case 'task':
    case 'agent':
    case 'workflow':
    case 'sendmessage':
      return 'delegating';
    case 'todowrite':
    case 'taskcreate':
    case 'taskupdate':
    case 'tasklist':
    case 'taskget':
    case 'enterplanmode':
      return 'planning';
    case 'askuserquestion':
    case 'exitplanmode':
      return 'waiting';
    default:
      return 'thinking';
  }
}

/** Décrit en français, en une ligne, ce que fait un appel d'outil. */
export function describeTool(toolName: string, input: Input): string {
  const i = input ?? {};
  const file = str(i.file_path) ?? str(i.notebook_path) ?? str(i.path);
  switch (toolName) {
    case 'Read':
      return `Lit ${basename(file) || 'un fichier'}`;
    case 'Grep':
      return `Cherche « ${truncate(str(i.pattern), 40)} »`;
    case 'Glob':
      return `Liste ${truncate(str(i.pattern), 40)}`;
    case 'LS':
      return `Explore ${basename(file) || 'un dossier'}`;
    case 'Edit':
    case 'MultiEdit':
      return `Modifie ${basename(file) || 'un fichier'}`;
    case 'Write':
      return `Écrit ${basename(file) || 'un fichier'}`;
    case 'NotebookEdit':
      return `Modifie le notebook ${basename(file)}`;
    case 'Bash':
    case 'PowerShell':
      return `$ ${truncate(str(i.description) ?? str(i.command), 60)}`;
    case 'WebFetch': {
      const url = str(i.url);
      let host = url ?? '';
      try {
        if (url) host = new URL(url).hostname;
      } catch {
        /* URL invalide : on garde la chaîne brute */
      }
      return `Consulte ${truncate(host, 40) || 'le web'}`;
    }
    case 'WebSearch':
      return `Recherche « ${truncate(str(i.query), 40)} »`;
    case 'Task':
    case 'Agent':
      return `Délègue : ${truncate(str(i.description) ?? str(i.prompt), 50)}`;
    case 'TodoWrite': {
      const todos = Array.isArray(i.todos) ? i.todos.length : 0;
      return todos ? `Planifie (${todos} tâches)` : 'Planifie';
    }
    case 'AskUserQuestion':
      return 'Pose une question';
    case 'ExitPlanMode':
      return 'Propose un plan';
    default:
      break;
  }
  if (toolName.startsWith(MANAGER_TOOL_PREFIX)) {
    const short = toolName.slice(MANAGER_TOOL_PREFIX.length);
    switch (short) {
      case 'spawn_agent':
        return `Recrute un agent : ${truncate(str(i.task), 40)}`;
      case 'message_agent':
        return 'Briefe un agent';
      case 'list_agents':
        return "Fait le point sur l'équipe";
      case 'get_agent_log':
        return "Relit le journal d'un agent";
      case 'stop_agent':
        return 'Libère un agent';
      case 'interrupt_agent':
        return 'Interrompt un agent';
      case 'report_to_user':
        return `Rédige un rapport : ${truncate(str(i.title), 40)}`;
      default:
        return short;
    }
  }
  if (toolName.startsWith('mcp__')) {
    const [, server, tool] = toolName.split('__');
    return `${server ?? 'MCP'} · ${tool ?? toolName}`;
  }
  return toolName;
}

/** Fichier ciblé par un appel d'outil, s'il y en a un. */
export function fileForTool(toolName: string, input: Input): string | undefined {
  if (!input) return undefined;
  if (['Read', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(toolName)) {
    return str(input.file_path) ?? str(input.notebook_path);
  }
  return undefined;
}

export function isMutatingTool(toolName: string): boolean {
  return ['Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(toolName);
}

/** Libellés français des activités (pour l'interface). */
export const ACTIVITY_LABELS: Record<Activity, string> = {
  idle: 'En pause',
  thinking: 'Réfléchit',
  planning: 'Planifie',
  reading: 'Lit',
  writing: 'Code',
  running: 'Exécute',
  browsing: 'Sur le web',
  delegating: 'Coordonne',
  waiting: 'Attend une réponse',
  done: 'Terminé',
  error: 'Erreur',
  leaving: 'Quitte le QG',
};
