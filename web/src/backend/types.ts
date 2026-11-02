import type { Commands, StreamMessage } from '../../../shared/types';

export type ConnStatus = 'connecting' | 'open' | 'error';

export interface Backend extends Commands {
  readonly kind: 'remote' | 'demo';
  connect(handlers: { onMessage(m: StreamMessage): void; onStatus(s: ConnStatus): void }): () => void;
}
