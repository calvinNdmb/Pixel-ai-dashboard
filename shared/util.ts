let counter = 0;

/** Identifiant court, unique dans le processus (pas besoin de crypto ici). */
export function uid(prefix = ''): string {
  counter = (counter + 1) % 1_000_000;
  const rand = Math.floor(Math.random() * 36 ** 4)
    .toString(36)
    .padStart(4, '0');
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

/** Hash 32 bits stable (FNV-1a) — sert de graine d'apparence. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function truncate(s: string | undefined | null, max: number): string {
  if (!s) return '';
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function basename(p: string | undefined | null): string {
  if (!p) return '';
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

const NAMES = [
  'Nova',
  'Pixel',
  'Octet',
  'Luma',
  'Kiwi',
  'Miso',
  'Yuzu',
  'Sora',
  'Volt',
  'Nori',
  'Echo',
  'Rune',
  'Flux',
  'Mochi',
  'Zest',
  'Onyx',
  'Prisme',
  'Cobalt',
  'Tofu',
  'Sirius',
  'Quartz',
  'Lumen',
  'Bulle',
  'Praline',
];

/** Choisit un prénom d'agent pas encore utilisé. */
export function pickName(taken: Iterable<string>): string {
  const used = new Set([...taken].map((n) => n.toLowerCase()));
  const free = NAMES.filter((n) => !used.has(n.toLowerCase()));
  if (free.length > 0) return free[Math.floor(Math.random() * free.length)]!;
  let i = 2;
  for (;;) {
    for (const n of NAMES) {
      const candidate = `${n}${i}`;
      if (!used.has(candidate.toLowerCase())) return candidate;
    }
    i++;
  }
}

export function formatCost(usd: number): string {
  if (usd <= 0) return '0 $';
  if (usd < 0.01) return '<0,01 $';
  return `${usd.toFixed(2).replace('.', ',')} $`;
}

export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace('.', ',')}k`;
  return `${(n / 1_000_000).toFixed(1).replace('.', ',')}M`;
}

export function safeJson(value: unknown, max = 600): string {
  try {
    const s = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch {
    return String(value);
  }
}
