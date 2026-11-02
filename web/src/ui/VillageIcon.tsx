const PATHS = {
  agents:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  missions: 'M9 11l2 2 4-4M9 4H5v17h14V4h-4M9 2h6v4H9z',
  journal: 'M12 4v17M12 4C9 2 5 2 2 3v16c3-1 7-1 10 2 3-3 7-3 10-2V3c-3-1-7-1-10 1Z',
  chef: 'M4 10a5 5 0 0 1 3-9 5 5 0 0 1 10 0 5 5 0 0 1 3 9l-2 9H6l-2-9Zm2 5h12',
  settings:
    'M9.5 3h5l.7 3 2.3 1.3 3-.9 2.5 4.2-2.3 2.1v2.6l2.3 2.1-2.5 4.2-3-.9-2.3 1.3-.7 3h-5l-.7-3L6.5 21l-3 .9L1 17.7l2.3-2.1V13L1 10.9l2.5-4.2 3 .9L8.8 6l.7-3Z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-7v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2',
  world: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-18 0h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18Z',
  close: 'm6 6 12 12M6 18 18 6',
  chat: 'M21 11a8 8 0 0 1-8 8H8l-5 3v-7a8 8 0 1 1 18-4ZM8 10h.01M12 10h.01M16 10h.01',
  check: 'm5 12 4 4L19 6',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  pause: 'M8 5v14M16 5v14',
  play: 'm8 4 12 8-12 8Z',
  plus: 'M12 5v14M5 12h14',
  leaf: 'M20 3C9 1 2 8 5 15s14 7 15-12ZM4 21 16 9',
} as const;
export type VillageIconName = keyof typeof PATHS;
export function VillageIcon({ name, size = 22 }: { name: VillageIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={name === 'settings' ? '0 0 26 27' : '0 0 24 24'}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
      {name === 'settings' ? <circle cx="12" cy="14" r="3" /> : null}
    </svg>
  );
}
