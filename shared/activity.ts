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
    // Codex
    case 'shell':
    case 'shell_command':
    case 'exec_command':
    case 'local_shell':
    case 'unified_exec':
    case 'write_stdin':
      return 'running';
    case 'apply_patch':
      return 'writing';
    case 'update_plan':
      return 'planning';
    case 'web_search':
      return 'browsing';
    case 'view_image':
    case 'read_file':
    case 'list_dir':
    case 'grep_files':
      return 'reading';
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

/** Commande shell lisible (Codex envoie souvent ['bash', '-lc', '…']). */
export function shellCommand(input: Input): string | undefined {
  const i = input ?? {};
  const raw = i.command ?? i.cmd;
  if (Array.isArray(raw)) {
    const parts = raw.filter((p): p is string => typeof p === 'string');
    if (parts.length >= 3 && /(^|\/)(ba|z)?sh$/.test(parts[0]!) && /^-l?c$/.test(parts[1]!)) return parts.slice(2).join(' ');
    return parts.join(' ');
  }
  return str(raw);
}

/** Fichiers visés par un patch Codex (« *** Update File: chemin »). */
export function patchFiles(input: unknown): string[] {
  const text = typeof input === 'string' ? input : JSON.stringify(input ?? '');
  const files: string[] = [];
  const re = /\*\*\* (?:Update|Add|Delete) File: ([^\n\\"]+)/g;
  for (const m of text.matchAll(re)) {
    const f = m[1]!.trim();
    if (f && !files.includes(f)) files.push(f);
  }
  return files;
}

/** Décrit en français, en une ligne, ce que fait un appel d'outil. */
export function describeTool(toolName: string, input: Input): string {
  const i = input ?? {};
  const file = str(i.file_path) ?? str(i.notebook_path) ?? str(i.path);
  switch (toolName) {
    case 'shell':
    case 'shell_command':
    case 'exec_command':
    case 'local_shell':
    case 'unified_exec':
      return `$ ${truncate(shellCommand(i), 60) || 'commande'}`;
    case 'apply_patch': {
      const files = patchFiles(i);
      return files.length ? `Modifie ${basename(files[0])}${files.length > 1 ? ` (+${files.length - 1})` : ''}` : 'Applique un patch';
    }
    case 'update_plan': {
      const steps = Array.isArray(i.plan) ? i.plan.length : 0;
      return steps ? `Planifie (${steps} étapes)` : 'Planifie';
    }
    case 'web_search':
      return `Recherche « ${truncate(str(i.query), 40)} »`;
    case 'view_image':
      return 'Regarde une image';
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
      // Claude Code : commande en texte ; hooks Codex : parfois un tableau (« bash -lc … »).
      return `$ ${truncate(str(i.description) ?? shellCommand(i), 60)}`;
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
  if (toolName === 'apply_patch') return patchFiles(input)[0];
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
