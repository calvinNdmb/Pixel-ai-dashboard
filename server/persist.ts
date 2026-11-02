import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Hub } from '../shared/hub';
import type { SessionInfo } from '../shared/types';

const FILE = 'state.json';

/** Sauvegarde légère (rapports, conversation, sessions) dans DATA_DIR/state.json. */
export class Persistence {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private file: string;

  constructor(
    private hub: Hub,
    dataDir: string,
  ) {
    mkdirSync(dataDir, { recursive: true });
    this.file = path.join(dataDir, FILE);
  }

  load(): void {
    if (!existsSync(this.file)) return;
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Parameters<Hub['restore']>[0];
      // Après un redémarrage, aucune session n'est réellement active : on les marque terminées.
      const sessions = (raw.sessions ?? []).map(
        (s): SessionInfo => ({
          ...s,
          ...(s.status !== 'ended' || s.pending
            ? { status: 'ended' as const, activity: 'leaving' as const, activityLabel: 'Hors ligne (redémarrage)', pending: undefined }
            : {}),
          resumable: s.source === 'sdk' && s.role === 'worker' && Boolean(s.claudeSessionId),
          focusId: undefined,
          currentTool: undefined,
        }),
      );
      this.hub.restore({ ...raw, sessions });
    } catch (err) {
      console.warn(`[persist] lecture impossible de ${this.file} :`, err);
    }
  }

  watch(): () => void {
    return this.hub.subscribe(() => this.schedule());
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.save();
    }, 1500);
  }

  save(): void {
    try {
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.hub.persistable()));
      renameSync(tmp, this.file);
    } catch (err) {
      console.warn('[persist] sauvegarde impossible :', err);
    }
  }
}
