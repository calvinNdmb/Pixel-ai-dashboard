import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Hub } from '../shared/hub';
import type { AgentKind } from '../shared/types';
import { checkWaiting, newTracker, parseClaudeLine, parseCodexLine, type ParseContext, type Tracker } from './watch-parse';

/** Fichier modifié récemment = session probablement ouverte. */
const ACTIVE_WINDOW_MS = 10 * 60 * 1000;
/** Au-delà, on considère la session fermée (sans hooks, rien ne signale la fin). */
const CLOSE_AFTER_MS = 40 * 60 * 1000;
/** Contexte relu à la découverte d'un fichier en cours de route. */
const BACKLOG_BYTES = 256 * 1024;
const MAX_CHUNK = 1024 * 1024;

interface Tracked {
  tracker: Tracker;
  offset: number;
  remainder: Buffer;
  mtimeMs: number;
}

async function listDir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

async function readRange(file: string, start: number, length: number): Promise<Buffer> {
  const fh = await fs.open(file, 'r');
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, start);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

/** Première ligne d'un fichier (la ligne `session_meta` de Codex peut être longue). */
async function firstLine(file: string, max = 2 * 1024 * 1024): Promise<string | null> {
  const buf = await readRange(file, 0, max).catch(() => null);
  if (!buf) return null;
  const nl = buf.indexOf(10);
  return nl >= 0 ? buf.subarray(0, nl).toString('utf8') : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Suit les transcripts de Claude Code (~/.claude/projects) et de Codex
 * (~/.codex/sessions) pour montrer les sessions ouvertes ailleurs, même sans
 * hooks — l'approche « zéro configuration » de pixel-agents. Les hooks, plus
 * précis, prennent le relais dès qu'ils sont installés.
 */
export class TranscriptWatcher {
  private tracked = new Map<string, Tracked>();
  private tickTimer?: ReturnType<typeof setInterval>;
  private scanTimer?: ReturnType<typeof setInterval>;
  private ticking = false;
  private scanning = false;
  private readonly ctx: ParseContext;

  constructor(
    private hub: Hub,
    private opts: { claudeDir: string; codexDir: string; isManaged(agentSessionId: string): boolean; serverHost: string },
  ) {
    this.ctx = { hub, isManaged: opts.isManaged, serverHost: opts.serverHost };
  }

  start(): void {
    void this.scan();
    this.tickTimer = setInterval(() => void this.tick(), 2000);
    this.scanTimer = setInterval(() => void this.scan(), 15_000);
    this.tickTimer.unref?.();
    this.scanTimer.unref?.();
  }

  stop(): void {
    clearInterval(this.tickTimer);
    clearInterval(this.scanTimer);
  }

  /** Fichiers candidats : transcripts Claude Code et sessions Codex récentes. */
  private async candidates(): Promise<Array<{ file: string; agent: AgentKind }>> {
    const out: Array<{ file: string; agent: AgentKind }> = [];
    const projects = path.join(this.opts.claudeDir, 'projects');
    for (const dir of await listDir(projects)) {
      const full = path.join(projects, dir);
      for (const f of await listDir(full)) if (f.endsWith('.jsonl')) out.push({ file: path.join(full, f), agent: 'claude' });
    }
    const now = new Date();
    for (const back of [0, 1]) {
      const d = new Date(now.getTime() - back * 86_400_000);
      const dir = path.join(this.opts.codexDir, 'sessions', String(d.getFullYear()), pad(d.getMonth() + 1), pad(d.getDate()));
      for (const f of await listDir(dir)) {
        if (f.startsWith('rollout-') && f.endsWith('.jsonl')) out.push({ file: path.join(dir, f), agent: 'codex' });
      }
    }
    return out;
  }

  async scan(now = Date.now()): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    try {
      for (const { file, agent } of await this.candidates()) {
        if (this.tracked.has(file)) continue;
        const st = await fs.stat(file).catch(() => null);
        if (!st || now - st.mtimeMs > ACTIVE_WINDOW_MS) continue;
        await this.track(file, agent, st.size, st.mtimeMs);
      }
    } finally {
      this.scanning = false;
    }
  }

  private async track(file: string, agent: AgentKind, size: number, mtimeMs: number): Promise<void> {
    const tracker = newTracker(file, agent);
    if (agent === 'codex') {
      // L'identifiant et le dossier de la session sont dans la première ligne.
      const head = await firstLine(file);
      if (head) {
        try {
          parseCodexLine(this.ctx, tracker, JSON.parse(head));
        } catch {
          /* ligne illisible */
        }
      }
      if (!tracker.agentSessionId) {
        const m = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i.exec(file);
        if (m) tracker.agentSessionId = m[1];
      }
    }
    const start = Math.max(0, size - BACKLOG_BYTES);
    const entry: Tracked = { tracker, offset: start, remainder: Buffer.alloc(0), mtimeMs };
    this.tracked.set(file, entry);
    tracker.silent = true;
    await this.readNew(entry, size, start > 0);
    tracker.silent = false;
  }

  private async readNew(entry: Tracked, size: number, skipFirstPartial = false): Promise<void> {
    if (size < entry.offset) {
      // fichier tronqué ou remplacé : on recommence
      entry.offset = 0;
      entry.remainder = Buffer.alloc(0);
    }
    while (entry.offset < size) {
      const len = Math.min(MAX_CHUNK, size - entry.offset);
      const chunk = await readRange(entry.tracker.file, entry.offset, len).catch(() => null);
      if (!chunk || !chunk.length) return;
      entry.offset += chunk.length;
      let data = entry.remainder.length ? Buffer.concat([entry.remainder, chunk]) : chunk;
      if (skipFirstPartial) {
        const nl = data.indexOf(10);
        data = nl >= 0 ? data.subarray(nl + 1) : Buffer.alloc(0);
        skipFirstPartial = false;
      }
      const lastNl = data.lastIndexOf(10);
      if (lastNl < 0) {
        entry.remainder = data;
        continue;
      }
      entry.remainder = Buffer.from(data.subarray(lastNl + 1));
      const lines = data.subarray(0, lastNl).toString('utf8').split('\n');
      for (const raw of lines) {
        if (!raw.trim()) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          continue;
        }
        entry.tracker.lastLineAt = Date.now();
        if (entry.tracker.agent === 'codex') parseCodexLine(this.ctx, entry.tracker, parsed);
        else parseClaudeLine(this.ctx, entry.tracker, parsed);
        if (entry.tracker.ignore) return;
      }
    }
  }

  async tick(now = Date.now()): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      for (const [file, entry] of this.tracked) {
        if (entry.tracker.ignore) {
          this.tracked.delete(file);
          continue;
        }
        const st = await fs.stat(file).catch(() => null);
        if (!st) {
          this.close(entry);
          this.tracked.delete(file);
          continue;
        }
        if (st.size !== entry.offset) await this.readNew(entry, st.size);
        entry.mtimeMs = st.mtimeMs;
        checkWaiting(this.ctx, entry.tracker, now);
        if (now - st.mtimeMs > CLOSE_AFTER_MS) {
          this.close(entry);
          this.tracked.delete(file);
        }
      }
    } finally {
      this.ticking = false;
    }
  }

  private close(entry: Tracked): void {
    const id = entry.tracker.sessionId;
    const s = id ? this.hub.getSession(id) : undefined;
    if (!s || s.source !== 'watch' || s.status === 'ended') return;
    this.hub.updateSession(s.id, { status: 'ended', activity: 'leaving', activityLabel: 'Inactive', pending: undefined, currentTool: undefined });
    this.hub.addEvent(s.id, 'system', 'Plus de nouvelles depuis 40 min : session considérée comme fermée');
  }

  get trackedCount(): number {
    return this.tracked.size;
  }
}
