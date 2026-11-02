import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Config } from './config';

/** Retire le port d'un en-tête Host (gère les adresses IPv6 entre crochets). */
export function hostnameOf(hostHeader: string): string {
  const h = hostHeader.trim().toLowerCase();
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    return end > 0 ? h.slice(0, end + 1) : h;
  }
  const colon = h.lastIndexOf(':');
  return colon > 0 ? h.slice(0, colon) : h;
}

function sameToken(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Le dashboard peut lancer des agents capables d'exécuter des commandes : on
 * protège donc l'API contre les requêtes venues d'autres sites.
 * - en-tête Host limité à localhost (+ ALLOWED_HOSTS) → bloque le DNS rebinding ;
 * - en-tête Origin, s'il est présent, limité aux mêmes hôtes → bloque le CSRF ;
 * - jeton optionnel (PIXEL_TOKEN), obligatoire si le serveur écoute hors loopback.
 */
export function securityMiddleware(cfg: Config) {
  const allowed = new Set(['localhost', '127.0.0.1', '[::1]', ...cfg.allowedHosts]);
  return (req: Request, res: Response, next: NextFunction) => {
    const host = hostnameOf(req.headers.host ?? '');
    if (!allowed.has(host)) {
      res.status(403).json({ error: `Hôte non autorisé : ${host || '(vide)'} — ajoute-le à ALLOWED_HOSTS` });
      return;
    }
    const origin = req.headers.origin;
    if (origin && origin !== 'null') {
      let ok = false;
      try {
        ok = allowed.has(new URL(origin).hostname.toLowerCase());
      } catch {
        ok = false;
      }
      if (!ok) {
        res.status(403).json({ error: 'Origine non autorisée' });
        return;
      }
    } else if (origin === 'null') {
      res.status(403).json({ error: 'Origine non autorisée' });
      return;
    }
    if (cfg.token && req.path.startsWith('/api/') && req.path !== '/api/health') {
      const auth = req.headers.authorization;
      const supplied =
        (auth?.startsWith('Bearer ') ? auth.slice(7) : undefined) ??
        (typeof req.query.token === 'string' ? req.query.token : undefined) ??
        (typeof req.headers['x-pixel-token'] === 'string' ? req.headers['x-pixel-token'] : undefined);
      if (!supplied || !sameToken(supplied, cfg.token)) {
        res.status(401).json({ error: 'Jeton manquant ou invalide' });
        return;
      }
    }
    next();
  };
}
