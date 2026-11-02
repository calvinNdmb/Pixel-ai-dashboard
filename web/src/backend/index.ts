import { DemoBackend } from './demo';
import { RemoteBackend } from './remote';
import type { Backend } from './types';

export type { AuthStatus, Backend, ConnStatus, PairingInfo, RemoteApi } from './types';

export function isDemoRequested(): boolean {
  if (__DEMO_BUILD__) return true;
  try {
    return new URLSearchParams(location.search).has('demo');
  } catch {
    return false;
  }
}

export function createBackend(): Backend {
  return isDemoRequested() ? new DemoBackend() : new RemoteBackend();
}
