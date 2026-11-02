import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Request } from 'express';

const COOKIE = 'pixel_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PAIRING_TTL_MS = 10 * 60 * 1000;
/** Alphabet sans caractères ambigus (0/O, 1/I…). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

interface DeviceSession {
  hash: string;
  label: string;
  createdAt: number;
  lastSeen: number;
}

const sha = (v: string) => createHash('sha256').update(v).digest('hex');

function sameSecret(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const k = part.slice(0, i).trim();
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[k] = part.slice(i + 1).trim();
    }
  }
  return out;
}

/** Code d'appairage lisible : « K7P-4QX ». */
export function pairingCode(): string {
  const bytes = randomBytes(6);
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]);
  return `${chars.slice(0, 3).join('')}-${chars.slice(3).join('')}`;
}

/**
 * Authentification pour l'accès à distance. Deux façons d'entrer :
 * - le jeton (PIXEL_TOKEN), pour les scripts et les hooks (en-tête Bearer) ;
 * - un appareil appairé (téléphone…) : code ou QR code à usage unique, échangé
 *   contre un cookie HttpOnly valable 30 jours.
 * Les identifiants d'appareils sont stockés hachés.
 */
export class Auth {
  private devices = new Map<string, DeviceSession>();
  private pairings = new Map<string, number>();
  private file?: string;

  constructor(
    private token: string | undefined,
    dataDir?: string,
  ) {
    if (dataDir) {
      this.file = path.join(dataDir, 'devices.json');
      this.load();
    }
  }

  get required(): boolean {
    return Boolean(this.token);
  }

  /** La requête est-elle authentifiée (jeton ou cookie d'appareil) ? */
  check(req: Request): boolean {
    if (!this.token) return true;
    const auth = req.headers.authorization;
    const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
    const fromQuery = typeof req.query.token === 'string' ? req.query.token : undefined;
    const supplied = bearer ?? fromQuery ?? (typeof req.headers['x-pixel-token'] === 'string' ? req.headers['x-pixel-token'] : undefined);
    if (supplied && sameSecret(supplied, this.token)) return true;
    const sid = parseCookies(req.headers.cookie)[COOKIE];
    if (!sid) return false;
    const device = this.devices.get(sha(sid));
    if (!device || Date.now() - device.createdAt > SESSION_TTL_MS) return false;
    if (Date.now() - device.lastSeen > 60_000) {
      device.lastSeen = Date.now();
      this.save();
    }
    return true;
  }

  /** Échange le jeton contre un cookie d'appareil. */
  login(token: string, label: string): string | null {
    if (!this.token || !sameSecret(token, this.token)) return null;
    return this.newDevice(label);
  }

  createPairing(): { code: string; expiresAt: number } {
    const now = Date.now();
    for (const [code, exp] of this.pairings) if (exp < now) this.pairings.delete(code);
    const code = pairingCode();
    const expiresAt = now + PAIRING_TTL_MS;
    this.pairings.set(code, expiresAt);
    return { code, expiresAt };
  }

  /** Utilise un code d'appairage (une seule fois). */
  pair(code: string, label: string): string | null {
    const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    for (const [c, exp] of this.pairings) {
      if (c.replace('-', '') === normalized) {
        this.pairings.delete(c);
        return exp >= Date.now() ? this.newDevice(label) : null;
      }
    }
    return null;
  }

  logout(req: Request): void {
    const sid = parseCookies(req.headers.cookie)[COOKIE];
    if (sid && this.devices.delete(sha(sid))) this.save();
  }

  /** Révoque tous les appareils appairés. */
  revokeAll(): number {
    const n = this.devices.size;
    this.devices.clear();
    this.save();
    return n;
  }

  deviceCount(): number {
    return this.devices.size;
  }

  cookie(sid: string, secure: boolean): string {
    return `${COOKIE}=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure ? '; Secure' : ''}`;
  }

  clearCookie(secure: boolean): string {
    return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
  }

  private newDevice(label: string): string {
    const sid = randomBytes(32).toString('base64url');
    const now = Date.now();
    this.devices.set(sha(sid), { hash: sha(sid), label: label.slice(0, 80) || 'appareil', createdAt: now, lastSeen: now });
    this.save();
    return sid;
  }

  private load(): void {
    if (!this.file || !existsSync(this.file)) return;
    try {
      const list = JSON.parse(readFileSync(this.file, 'utf8')) as DeviceSession[];
      for (const d of list) if (Date.now() - d.createdAt < SESSION_TTL_MS) this.devices.set(d.hash, d);
    } catch {
      /* fichier illisible : on repart de zéro */
    }
  }

  private save(): void {
    if (!this.file) return;
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify([...this.devices.values()]), { mode: 0o600 });
    } catch (err) {
      console.warn('[auth] sauvegarde impossible :', err);
    }
  }
}
