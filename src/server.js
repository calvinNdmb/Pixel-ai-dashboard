// Serveur web + WebSocket : sert la page d'affichage et diffuse en direct
// l'état du salon vocal à tous les écrans/appareils connectés.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { ACTIONS, EMOTES } from '../public/actions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const CHARACTERS_FILE = path.join(ROOT, 'config', 'characters.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function loadCharacters() {
  try {
    return JSON.parse(fs.readFileSync(CHARACTERS_FILE, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`[config] characters.json illisible : ${err.message}`);
    return {};
  }
}

/** Liste les adresses IP locales, pour savoir quoi taper sur l'autre appareil. */
function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

export function createServer({ port = 3000, viewKey = '' } = {}) {
  // État partagé : ce que tous les écrans affichent.
  const state = {
    channel: null, // { name } quand le bot est dans un salon
    members: new Map(), // id -> { id, name, avatar, speaking }
  };
  let characters = loadCharacters();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    if (pathname === '/manette') pathname = '/manette.html';

    if (pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, clients: wss.clients.size }));
      return;
    }

    const filePath = path.join(PUBLIC_DIR, pathname);
    if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('Introuvable');
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      res.end(data);
    });
  });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

  const snapshot = () => ({
    type: 'state',
    channel: state.channel,
    members: [...state.members.values()],
    characters,
  });

  const broadcast = (msg) => {
    const data = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(data);
    }
  };

  wss.on('connection', (ws, req) => {
    const key = new URL(req.url, 'http://localhost').searchParams.get('key') ?? '';
    if (viewKey && key !== viewKey) {
      ws.close(4001, 'Clé invalide');
      return;
    }
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));
    ws.send(JSON.stringify(snapshot()));

    // Les manettes envoient des actions (taper, danser...).
    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      if (msg?.type !== 'action') return;
      const str = (v) => (typeof v === 'string' && v.length <= 64 ? v : undefined);
      const result = triggerAction({ from: str(msg.from), action: str(msg.action), target: str(msg.target), emote: str(msg.emote) });
      if (!result.ok) ws.send(JSON.stringify({ type: 'error', message: result.error }));
    });
  });

  // Valide une action (manette, commande Discord ou démo) puis la diffuse à tous les écrans.
  const lastAction = new Map();
  function triggerAction({ from, action, target, emote }) {
    const fail = (error) => ({ ok: false, error });
    const def = ACTIONS.find((a) => a.id === action);
    const emoteDef = action === 'emote' ? EMOTES.find((e) => e.id === emote) : null;
    if (!def && !emoteDef) return fail('Action inconnue.');
    if (!state.members.has(from)) return fail('Tu dois être dans le salon vocal où se trouve le bot.');
    if (def?.target && !state.members.has(target)) return fail("Ta cible n'est pas dans le salon vocal.");
    const now = Date.now();
    if (now - (lastAction.get(from) ?? 0) < 250) return fail('Doucement ! 😅');
    lastAction.set(from, now);
    broadcast({ type: 'action', action, from, target: def?.target ? target : undefined, emote: emoteDef?.id });
    return { ok: true, def, emote: emoteDef };
  }

  // Détecte les écrans déconnectés brutalement (Wi-Fi coupé, veille...).
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 15000);
  wss.on('close', () => clearInterval(heartbeat));

  // Recharge la config des personnages à chaud : modifier le fichier
  // met à jour tous les écrans sans redémarrer.
  let reloadTimer;
  fs.watchFile(CHARACTERS_FILE, { interval: 1000 }, () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      characters = loadCharacters();
      console.log('[config] characters.json rechargé');
      broadcast(snapshot());
    }, 200);
  });

  server.listen(port, '0.0.0.0', () => {
    const key = viewKey ? `?key=${encodeURIComponent(viewKey)}` : '';
    console.log('\nAffichage disponible sur :');
    console.log(`  ce PC           → http://localhost:${port}/${key}`);
    for (const ip of lanAddresses()) {
      console.log(`  autre appareil  → http://${ip}:${port}/${key}`);
    }
    console.log('Manette (taper, danser, réactions...) :');
    for (const host of ['localhost', ...lanAddresses()]) {
      console.log(`                    http://${host}:${port}/manette${key}`);
    }
    console.log('');
  });

  // API utilisée par le bot (ou le mode démo) pour pousser les changements.
  return {
    setChannel(channel) {
      state.channel = channel;
      if (!channel) state.members.clear();
      broadcast(snapshot());
    },
    setMembers(members) {
      const next = new Map();
      for (const m of members) {
        next.set(m.id, { ...m, speaking: state.members.get(m.id)?.speaking ?? false });
      }
      state.members = next;
      broadcast(snapshot());
    },
    triggerAction,
    setSpeaking(id, speaking) {
      const member = state.members.get(id);
      if (!member || member.speaking === speaking) return;
      member.speaking = speaking;
      broadcast({ type: 'speaking', id, speaking });
    },
  };
}
