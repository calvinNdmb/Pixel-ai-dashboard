import { Hub } from '../shared/hub';

export function makeHub(): Hub {
  return new Hub({
    mode: 'live',
    version: 'test',
    sdkAvailable: true,
    defaultCwd: '/tmp',
    maxWorkers: 6,
    defaultPermissionMode: 'default',
    authRequired: false,
  });
}
