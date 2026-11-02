#!/usr/bin/env node
// Relaie un événement de hook de Claude Code ou de Codex (JSON reçu sur stdin)
// vers le Pixel AI Dashboard.
//
// - Événements ordinaires : envoi rapide, sans sortie, code 0 même si le
//   dashboard est éteint : Claude Code / Codex ne sont jamais gênés.
// - PermissionRequest et Stop : si le mode télécommande est actif, le dashboard
//   retient la demande jusqu'à ta réponse (depuis ton téléphone par exemple) et
//   ce script renvoie la décision à l'outil. Sinon, réponse vide immédiate et
//   l'outil se comporte comme d'habitude.
//
// Usage : node pixel-hook.mjs --url http://127.0.0.1:7495/api/hooks [--agent claude|codex] [--token XXX] [--wait 3600]

import { hostname } from 'node:os';

// Les sessions lancées par le dashboard sont déjà suivies : on évite les doublons.
if (process.env.PIXEL_MANAGED === '1') process.exit(0);

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const url = (arg('--url') ?? process.env.PIXEL_URL ?? 'http://127.0.0.1:7495/api/hooks').replace(/\/+$/, '');
const token = arg('--token') ?? process.env.PIXEL_TOKEN;
const agent = arg('--agent') ?? 'claude';
const maxWaitMs = Math.max(5, Number(arg('--wait') ?? 3600)) * 1000;
const headers = { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) };

async function post(path, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url + path, { method: 'POST', headers, body: JSON.stringify(body ?? {}), signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } finally {
    clearTimeout(timer);
  }
}

async function decide(payload) {
  const started = Date.now();
  let res = await post('/decide', payload, 60_000);
  while (res && typeof res.wait === 'string' && Date.now() - started < maxWaitMs) {
    res = await post(`/decide/${encodeURIComponent(res.wait)}`, {}, 60_000);
  }
  if (res && res.output && typeof res.output === 'object') process.stdout.write(JSON.stringify(res.output));
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', async () => {
  try {
    const payload = JSON.parse(raw || '{}');
    payload.pixel_agent = agent;
    payload.pixel_host = hostname();
    const event = payload.hook_event_name;
    if (event === 'PermissionRequest' || event === 'Stop') await decide(payload);
    else await post('', payload, 1500);
  } catch {
    // Dashboard éteint, injoignable ou réponse illisible : on ne bloque jamais l'outil.
  }
  process.exit(0);
});
