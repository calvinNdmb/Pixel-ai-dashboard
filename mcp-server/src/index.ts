#!/usr/bin/env node
// Point d'entrée local (stdio) : Claude Desktop, Claude Code, Cursor…
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { storeFromEnv } from './config.js';
import { buildServer } from './server.js';

const store = storeFromEnv();
await buildServer(store).connect(new StdioServerTransport());
console.error(`Archipel MCP prêt (stdio) — monde : ${store.file}`);
