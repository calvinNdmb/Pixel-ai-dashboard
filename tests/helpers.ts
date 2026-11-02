import { Hub, makeInfo } from '../shared/hub';

export function makeHub(): Hub {
  return new Hub(makeInfo({ mode: 'live', version: 'test', sdkAvailable: true, defaultCwd: '/tmp', hostName: 'test-host' }));
}
