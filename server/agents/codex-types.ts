/**
 * Sous-ensemble de l'API du SDK Codex (`@openai/codex-sdk`) utilisé par le
 * dashboard. Le SDK est chargé dynamiquement : il n'est pas une dépendance
 * obligatoire (son binaire pèse plusieurs centaines de Mo). Ces types suivent
 * la version 0.166 du SDK (événements JSONL de `codex exec`).
 */

export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';
export type CodexApprovalPolicy = 'never' | 'on-request' | 'on-failure' | 'untrusted';

export interface CodexThreadOptions {
  model?: string;
  sandboxMode?: CodexSandboxMode;
  workingDirectory?: string;
  skipGitRepoCheck?: boolean;
  approvalPolicy?: CodexApprovalPolicy;
  networkAccessEnabled?: boolean;
  webSearchEnabled?: boolean;
}

export interface CodexUsage {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens?: number;
}

export type CodexItem =
  | { id: string; type: 'agent_message'; text: string }
  | { id: string; type: 'reasoning'; text: string }
  | {
      id: string;
      type: 'command_execution';
      command: string;
      aggregated_output: string;
      exit_code?: number;
      status: 'in_progress' | 'completed' | 'failed';
    }
  | { id: string; type: 'file_change'; changes: Array<{ path: string; kind: 'add' | 'delete' | 'update' }>; status: 'completed' | 'failed' }
  | { id: string; type: 'mcp_tool_call'; server: string; tool: string; status: string; error?: { message: string } }
  | { id: string; type: 'web_search'; query: string }
  | { id: string; type: 'todo_list'; items: Array<{ text: string; completed: boolean }> }
  | { id: string; type: 'error'; message: string };

export type CodexEvent =
  | { type: 'thread.started'; thread_id: string }
  | { type: 'turn.started' }
  | { type: 'turn.completed'; usage: CodexUsage }
  | { type: 'turn.failed'; error: { message: string } }
  | { type: 'item.started'; item: CodexItem }
  | { type: 'item.updated'; item: CodexItem }
  | { type: 'item.completed'; item: CodexItem }
  | { type: 'error'; message: string };

export interface CodexThread {
  readonly id: string | null;
  runStreamed(input: string, options?: { signal?: AbortSignal }): Promise<{ events: AsyncGenerator<CodexEvent> }>;
}

export interface CodexClient {
  startThread(options?: CodexThreadOptions): CodexThread;
  resumeThread(id: string, options?: CodexThreadOptions): CodexThread;
}

export interface CodexModule {
  Codex: new (options?: { codexPathOverride?: string; env?: Record<string, string>; apiKey?: string }) => CodexClient;
}
