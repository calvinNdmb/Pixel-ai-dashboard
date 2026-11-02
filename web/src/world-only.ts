// Page de développement : le monde pixel art seul, alimenté par le simulateur.
// Ouvre http://localhost:5173/world.html (npm run dev:web).
import { Hub } from '../../shared/hub';
import { Simulator } from '../../shared/simulator';
import type { SessionInfo } from '../../shared/types';
import { World } from './game/world';

const hub = new Hub({
  mode: 'demo',
  version: 'dev',
  sdkAvailable: false,
  defaultCwd: '~/projets/boutique',
  maxWorkers: 6,
  defaultPermissionMode: 'default',
  authRequired: false,
});
const params = new URLSearchParams(location.search);
const sim = new Simulator(hub, { speed: Number(params.get('speed') ?? 1) });
sim.start();

let lastReportAt = 0;
hub.subscribe((m) => {
  if (m.type === 'report') lastReportAt = m.report.ts;
});
let selected: string | null = null;
const world = new World(document.getElementById('world') as HTMLCanvasElement, {
  getSnapshot: () => ({
    ready: true,
    sessions: hub.listSessions() as SessionInfo[],
    selectedId: selected,
    showNames: params.get('names') !== '0',
    reducedMotion: false,
    lastReportAt,
  }),
  onSelect: (id) => {
    selected = id;
  },
});
world.start();
(window as unknown as { __hub: Hub }).__hub = hub;
