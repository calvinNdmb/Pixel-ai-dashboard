import type { NextFunction, Request, Response } from 'express';
import type { Auth } from './auth';
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

/** Routes accessibles sans être connecté (écran de connexion, état). */
const OPEN_ROUTES = new Set(['/api/health', '/api/auth/status', '/api/auth/login', '/api/auth/pair']);

/**
 * Le dashboard peut lancer des agents capables d'exécuter des commandes : on
 * protège l'API contre les requêtes venues d'autres sites.
 * - Sans jeton (usage local) : en-tête Host limité à localhost (+ ALLOWED_HOSTS),
 *   ce qui bloque le DNS rebinding.
 * - Avec jeton (accès à distance) : n'importe quel nom d'hôte (réseau local,
 *   tunnel…), mais toute l'API exige le jeton ou un appareil appairé.
 * - Dans les deux cas, l'en-tête Origin doit correspondre au dashboard lui-même.
 */
export function securityMiddleware(cfg: Config, auth: Auth) {
  const local = new Set(['localhost', '127.0.0.1', '[::1]', ...cfg.allowedHosts]);
  let publicHost: string | undefined;
  try {
    publicHost = cfg.publicUrl ? new URL(cfg.publicUrl).host.toLowerCase() : undefined;
  } catch {
    publicHost = undefined;
  }

  const originAllowed = (origin: string, req: Request): boolean => {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      return false;
    }
    const originHost = url.host.toLowerCase();
    const candidates = [req.headers.host, req.headers['x-forwarded-host'], publicHost]
      .flatMap((h) => (Array.isArray(h) ? h : [h]))
      .filter((h): h is string => typeof h === 'string')
      .map((h) => h.split(',')[0]!.trim().toLowerCase());
    return candidates.includes(originHost) || local.has(url.hostname.toLowerCase());
  };

  return (req: Request, res: Response, next: NextFunction) => {
    const host = hostnameOf(req.headers.host ?? '');
    if (!auth.required && !local.has(host)) {
      res.status(403).json({
        error: `Hôte non autorisé : ${host || '(vide)'}. Pour un accès à distance, lance « npm run remote » (ou définis PIXEL_TOKEN).`,
      });
      return;
    }
    const origin = req.headers.origin;
    if (origin !== undefined && (origin === 'null' || !originAllowed(origin, req))) {
      res.status(403).json({ error: 'Origine non autorisée' });
      return;
    }
    if (req.path.startsWith('/api/') && !OPEN_ROUTES.has(req.path) && !auth.check(req)) {
      res.status(401).json({ error: 'Connexion requise', auth: true });
      return;
    }
    next();
  };
}
