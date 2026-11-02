#!/usr/bin/env node
// Relaie un événement de hook Claude Code (JSON reçu sur stdin) vers le
// Pixel AI Dashboard. Conçu pour ne jamais gêner Claude Code : réponse rapide,
// aucune sortie, code de retour 0 même si le dashboard est éteint.
//
// Usage (dans settings.json) :
//   node /chemin/vers/hooks/pixel-hook.mjs --url http://127.0.0.1:7495/api/hooks [--token XXX]

// Les sessions lancées par le dashboard sont déjà suivies : on évite les doublons.
if (process.env.PIXEL_MANAGED === '1') process.exit(0);

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const url = arg('--url') ?? process.env.PIXEL_URL ?? 'http://127.0.0.1:7495/api/hooks';
const token = arg('--token') ?? process.env.PIXEL_TOKEN;

let body = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  body += chunk;
});
process.stdin.on('end', async () => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body || '{}',
      signal: ctrl.signal,
    });
  } catch {
    // Dashboard éteint ou injoignable : on ignore silencieusement.
  } finally {
    clearTimeout(timer);
    process.exit(0);
  }
});
