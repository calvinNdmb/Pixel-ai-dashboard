#!/usr/bin/env node
/* Pixel's YouTube cast receiver, optional ([ytcast] enabled = true in config.toml; docs/CAST.md, YouTube).
   It puts Pixel in the YouTube app's Cast button (DIAL, on the home network) and behind "Link with TV code", with the
   yt-cast-receiver library. It plays nothing: each video goes to Pixel's own player (web/ytplayer.js) through Pixel's
   server, on its local WebSocket (ws://127.0.0.1:8080/ytcast, with its own code; the protocol is in pixel/ytcast.py).
   The server starts it, restarts it if it stops, and it ends with the server (its stdin closes). By hand, to try it:
     PIXEL_YTCAST_TOKEN=$(cat ~/.config/pixel/ytcast/token) node index.js */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MISSING = 78;                       // pixel/ytcast.py: Node.js too old, or "npm ci" not run
const env = process.env, HERE = path.dirname(fileURLToPath(import.meta.url));
const say = (...a) => console.log(...a);
const msg = e => String((e && e.message) || e || '').replace(/\s+/g, ' ').slice(0, 160);
const why = e => { let s = ''; for (let x = e, i = 0; x && i < 8; x = x.cause, i++) s += ' ' + String(x.stack || x); return s; };   // the whole chain
const offline = e => /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ConnectionError/.test(why(e) + msg(e));
if (Number(process.versions.node.split('.')[0]) < 18) { say(`Node.js ${process.versions.node} : il faut la version 18 ou plus.`); process.exit(MISSING); }
let YTCR, WS = globalThis.WebSocket;      // Node 22+: its own WebSocket; before: the ws package
try { YTCR = await import('yt-cast-receiver'); if (!WS) WS = (await import('ws')).default; } catch (e) {
  say(`Module manquant (${msg(e)}) : lance « npm ci --omit=dev » dans ${HERE}`); process.exit(MISSING);
}
const { default: YouTubeCastReceiver, Player, Constants, DataStore, DefaultLogger } = YTCR;
const ST = Constants.PLAYER_STATUSES;
const DATA = env.PIXEL_YTCAST_DATA || path.join(os.homedir(), '.config', 'pixel', 'ytcast');
const URL_ = env.PIXEL_YTCAST_URL || 'ws://127.0.0.1:8080/ytcast', NAME = env.PIXEL_YTCAST_NAME || 'Pixel', PORT = Number(env.PIXEL_YTCAST_PORT) || 3000;
let TOKEN = env.PIXEL_YTCAST_TOKEN || '';
if (!TOKEN) try { TOKEN = fs.readFileSync(path.join(DATA, 'token'), 'utf8').trim(); } catch { say(`Pas de code : PIXEL_YTCAST_TOKEN, ou ${path.join(DATA, 'token')} (créé par le serveur de Pixel).`); process.exit(2); }

/* ---------- the link to Pixel's server: hello with the code, then JSON messages; it comes back if the server restarts ---------- */
const last = {};                          // what the server must know again after a reconnection
const link = {
  ws: null, up: false,
  open() {
    let ws; try { ws = this.ws = new WS(URL_); } catch (e) { say('Pixel injoignable : ' + msg(e)); return setTimeout(() => this.open(), 3000); }
    ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', token: TOKEN, v: 1, name: NAME }));
    ws.onmessage = e => {
      let m; try { m = JSON.parse(String(e.data)); } catch { return; }
      if (m.type !== 'welcome') return fromPixel(m);
      this.up = true; say('Relié à Pixel.');
      for (const k of ['status', 'pairing']) if (last[k]) this.send(last[k]);
      for (const s of receiver.getConnectedSenders()) this.send({ type: 'sender', event: 'connect', name: who(s), count: 1 });
    };
    ws.onclose = e => {
      this.up = false; this.ws = null;
      if (e && e.code === 4003) { say('Pixel refuse le code de ce module (PIXEL_YTCAST_TOKEN).'); return quit(2); }
      if (!closing) setTimeout(() => this.open(), 2000);
    };
    ws.onerror = () => {};                // onclose follows
  },
  send(m) { const ws = this.ws; if (this.up && ws && ws.readyState === 1) { ws.send(JSON.stringify(m)); return true; } return false; },
};
const status = (s, error = '') => { last.status = { type: 'status', status: s, error }; link.send(last.status); };
const who = s => (s && (s.name || (s.user && s.user.name))) || 'Un appareil';

/* ---------- the player: every order goes to Pixel; position, duration and volume are what Pixel's player last said ---------- */
class PixelPlayer extends Player {
  st = { id: '', state: -1, pos: 0, dur: 0, vol: 100, muted: false, at: Date.now() };
  quiet = false;                          // an order that came from Pixel itself: not sent back to it
  async doPlay(video, position) {
    if (!link.up) return false;
    this.st = { ...this.st, id: video.id, state: 3, pos: position || 0, dur: 0, at: Date.now() };
    return link.send({ type: 'play', id: video.id, pos: position || 0 });
  }
  async doPause() { return this.quiet || link.send({ type: 'pause' }); }
  async doResume() { return this.quiet || link.send({ type: 'resume' }); }
  async doStop() { if (!this.quiet) link.send({ type: 'stop' }); return true; }
  async doSeek(pos) { Object.assign(this.st, { pos, at: Date.now() }); return link.send({ type: 'seek', pos }); }
  async doSetVolume(v) { Object.assign(this.st, { vol: v.level, muted: v.muted }); return link.send({ type: 'volume', level: v.level, muted: v.muted }); }
  async doGetVolume() { return { level: this.st.vol ?? 100, muted: !!this.st.muted }; }
  async doGetPosition() { const s = this.st; return s.state === 1 ? s.pos + Math.max(0, Date.now() - s.at) / 1000 : s.pos; }
  async doGetDuration() { return this.st.dur || 0; }
  async inner(fn) { this.quiet = true; try { return await fn(); } catch (e) { say('lecteur : ' + msg(e)); return false; } finally { this.quiet = false; } }
}
const player = new PixelPlayer();

async function fromPixel(m) {             // what Pixel's player does, the end of a video, a stop on Pixel
  const s = player.st;
  if (m.type === 'state' && (!m.id || !s.id || m.id === s.id)) {
    const vol = s.vol !== m.vol || s.muted !== m.muted;
    Object.assign(s, { state: m.state, pos: Number(m.pos) || 0, dur: Number(m.dur) || s.dur, at: Date.now() });
    if (typeof m.vol === 'number') s.vol = m.vol;
    if (typeof m.muted === 'boolean') s.muted = m.muted;
    const now = { 1: ST.PLAYING, 2: ST.PAUSED }[m.state];
    if (now && now !== player.status && (player.status === ST.PLAYING || player.status === ST.PAUSED)) await player.notifyExternalStateChange(now);
    else if (vol) await player.notifyExternalStateChange();
  } else if (m.type === 'ended') {
    await player.inner(async () => {      // the next one of the app's list (or its autoplay), else the end
      await player.pause();
      if (!(await player.next())) { await player.stop(); link.send({ type: 'stop' }); }
    });
  } else if (m.type === 'stopped') await player.inner(() => player.stop());
  else if (m.type === 'error') { say(`Pixel ne peut pas lire ${m.id} (erreur ${m.code}).`); await player.inner(() => player.notifyExternalStateChange(ST.STOPPED)); }
}

/* ---------- what must stay across restarts (the app finds Pixel again): a small file in Pixel's data folder ---------- */
class FileStore extends DataStore {
  #file = path.join(DATA, 'store.json'); #d = null;
  #load() { if (!this.#d) try { this.#d = JSON.parse(fs.readFileSync(this.#file, 'utf8')) || {}; } catch { this.#d = {}; } return this.#d; }
  async set(k, v) { const d = this.#load(); d[k] = v; fs.mkdirSync(DATA, { recursive: true, mode: 0o700 }); fs.writeFileSync(this.#file, JSON.stringify(d), { mode: 0o600 }); }
  async get(k) { return this.#load()[k] ?? null; }
}

const receiver = new YouTubeCastReceiver(player, {
  device: { name: NAME, screenName: NAME, brand: 'Pixel OS', model: 'Pixel' },
  dial: { port: PORT, prefix: '/ytcr' },
  dataStore: new FileStore(),
  logger: new (class extends DefaultLogger { toOutput(level, m) { console.log(`[${level}] ` + m.join(' ').replace(/\s+/g, ' ').slice(0, 280)); } })(false),   // one short line each
  logLevel: env.PIXEL_YTCAST_LOG || 'warn',
});
receiver.on('senderConnect', s => { say(`Connecté : ${who(s)}`); link.send({ type: 'sender', event: 'connect', name: who(s), count: receiver.getConnectedSenders().length }); });
receiver.on('senderDisconnect', s => link.send({ type: 'sender', event: 'disconnect', name: who(s), count: receiver.getConnectedSenders().length }));
receiver.on('error', e => say('erreur : ' + msg(e)));
receiver.on('terminate', e => { say('arrêt du récepteur : ' + msg(e)); status('error', msg(e)); quit(1); });

/* "Link with TV code": a new code every 5 minutes; after an error (no Internet), try again in a minute */
const pairing = receiver.getPairingCodeRequestService();
pairing.on('response', code => { last.pairing = { type: 'pairing', code }; link.send(last.pairing); });
pairing.on('error', e => { say('code TV : ' + msg(e)); last.pairing = { type: 'pairing', code: null, error: offline(e) ? "YouTube ne répond pas (pas d'Internet ?)" : msg(e) }; link.send(last.pairing); setTimeout(() => { if (!closing) pairing.start(); }, 60000); });

let closing = false;
async function quit(code = 0) {
  if (closing) return; closing = true;
  setTimeout(() => process.exit(code), 3000).unref();
  try { pairing.stop(); await receiver.stop(); } catch { /* stopping anyway */ }
  process.exit(code);
}
process.on('SIGTERM', () => quit(0));
process.on('SIGINT', () => quit(0));
if (env.PIXEL_YTCAST_PARENT === '1') { process.stdin.on('end', () => quit(0)); process.stdin.on('error', () => quit(0)); process.stdin.resume(); }   // the server is gone

link.open();
status('starting');
try {
  await receiver.start();
  say(`Prêt : « ${NAME} » dans le bouton Caster de l'appli YouTube (DIAL, port ${PORT}).`);
  status('running');
  pairing.start();
} catch (e) {
  const busy = /EADDRINUSE/.test(why(e) + msg(e)), text = busy ? `le port ${PORT} est pris (change [ytcast] port)` : offline(e) ? "YouTube ne répond pas (pas d'Internet ?)" : msg(e);
  say('Le récepteur ne démarre pas : ' + text);
  status('error', text);
  quit(1);
}
