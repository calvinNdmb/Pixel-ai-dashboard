import type { Commands, StreamMessage } from '../../../shared/types';

export type ConnStatus = 'connecting' | 'open' | 'error';

export interface AuthStatus {
  required: boolean;
  authenticated: boolean;
  devices: number;
}

export interface PairingInfo {
  enabled: boolean;
  hint: string;
  code?: string;
  url?: string;
  svg?: string;
  expiresAt?: number;
  reachable?: boolean;
}

/** Fonctions propres au serveur réel (connexion à distance, notifications). */
export interface RemoteApi {
  authStatus(): Promise<AuthStatus>;
  login(token: string): Promise<void>;
  pair(code: string): Promise<void>;
  logout(): Promise<void>;
  pairing(): Promise<PairingInfo>;
  revokeDevices(): Promise<number>;
  testNotifications(): Promise<string[]>;
}

export interface Backend extends Commands {
  readonly kind: 'remote' | 'demo';
  /** Disponible uniquement avec le serveur réel. */
  readonly api?: RemoteApi;
  /** Traite les liens d'appairage / d'accès présents dans l'URL. Renvoie une erreur lisible. */
  prepare?(): Promise<string | null>;
  connect(handlers: { onMessage(m: StreamMessage): void; onStatus(s: ConnStatus): void }): () => void;
}
