#!/usr/bin/env node
// Point d'entrée HTTP (Streamable HTTP, sans session) pour un connecteur distant.
// Écoute sur 127.0.0.1 par défaut. Pour l'exposer, définis ARCHIPEL_TOKEN : chaque requête
// devra alors porter « Authorization: Bearer <jeton> ».
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { storeFromEnv } from './config.js';
import { buildServer } from './server.js';

const store = storeFromEnv();
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '127.0.0.1';
const token = process.env.ARCHIPEL_TOKEN || '';
if (host !== '127.0.0.1' && host !== 'localhost' && !token) {
  console.error('Refus de démarrer : ARCHIPEL_TOKEN est obligatoire quand HOST n’est pas local.');
  process.exit(1);
}

function authorized(header: string | undefined) {
  if (!token) return true;
  const got = Buffer.from(header?.replace(/^Bearer\s+/i, '') ?? ''), want = Buffer.from(token);
  return got.length === want.length && timingSafeEqual(got, want);
}

createServer(async (req, res) => {
  const path = (req.url || '/').split('?')[0];
  if (path === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }).end('ok'); return; }
  if (path !== '/mcp') { res.writeHead(404).end(); return; }
  if (!authorized(req.headers.authorization)) { res.writeHead(401, { 'www-authenticate': 'Bearer' }).end(); return; }
  if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }).end(); return; }
  try {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
    const server = buildServer(store);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (e) {
    if (!res.headersSent) res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Requête invalide' }, id: null }));
  }
}).listen(port, host, () => console.error(`Archipel MCP prêt sur http://${host}:${port}/mcp — monde : ${store.file}`));
