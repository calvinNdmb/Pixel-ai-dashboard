"""Pixel as a target of the YouTube app's Cast button (optional, [ytcast] enabled = true in config.toml; off by default).

The YouTube protocols (DIAL on the home network, YouTube's "Lounge", "Link with TV code") live in a small Node program,
sidecar/ytcast/index.js (the yt-cast-receiver library). It plays nothing: each video goes to Pixel's own player
(web/ytplayer.js, the same as for a shared link) through this server. This module starts it, restarts it when it stops
(slower and slower), and stops it with the server; Pixel goes on without it.

    GET /ytcast     its WebSocket: the Pi itself only (127.0.0.1, ::1), no browser page (they all send an Origin), and the
                    sidecar's own code in its first message ({"type": "hello", "token": ...}); a phone's code does not open it.

The sidecar says (JSON, one message each):
    hello {token, v}                       first, or it is closed
    status {status: running, starting, error; error}
    pairing {code}                         the "Link with TV code" code (it changes every 5 minutes), or {code: null, error}
    sender {event: connect, disconnect; name; count}
    play {id, pos, list}                   a video from the YouTube app; pause, resume, seek {pos}, volume {level, muted}, stop
The server says:
    welcome {v}
    state {id, state, pos, dur, vol, muted}   what Pixel's player does (state: YouTube's -1, 0, 1, 2, 3, 5)
    ended {id}                             the video is over: the sidecar plays the next one of the app's list, or says stop
    stopped                                the cast was stopped on Pixel (a touch, the phone, another cast, another screen)
    error {id, code}                       Pixel's player cannot play it (embedding not allowed: 101, 150...)
"""
import asyncio
import json
import logging
import os
import re
import secrets
import shutil
import time
from pathlib import Path

from aiohttp import WSMsgType, web

from .youtube import ID, LIST, _num

log = logging.getLogger("pixel")
LOCAL = {"127.0.0.1", "::1"}
HERE = Path(__file__).resolve().parent.parent
SCRIPT = HERE / "sidecar" / "ytcast" / "index.js"
MISSING = 78                    # the sidecar's exit code when Node.js is too old or "npm ci" was not run (EX_CONFIG)
NEXT_WAIT = 6                   # seconds the YouTube app has, after a video, to send the next one


def _flag(v):
    return str(v).strip().lower() in ("1", "true", "on", "oui", "yes")


def sidecar_request(request):
    """Only the Pi itself, and not a browser page (a page always sends Origin with a WebSocket: the kiosk's own, a video player)."""
    return request.remote in LOCAL and "Origin" not in request.headers and "Sec-Fetch-Site" not in request.headers


def tv_code(v):
    """The TV code as YouTube's app shows it: 123 456 789 012."""
    d = re.sub(r"\D", "", str(v or ""))[:16]
    return " ".join(d[i:i + 3] for i in range(0, len(d), 3)) or None


class YtCast:
    def __init__(self, hub, cfg, datadir, port, cast, player, host=None):
        self.hub, self.cast, self.player = hub, cast, player
        self.on = _flag(cfg.get("enabled", False))
        self.name = str(cfg.get("name") or "Pixel").strip()[:40] or "Pixel"
        self.dial = int(_num(cfg.get("port", 3000), 1024, 65535, 3000))
        self.url = f"ws://{host if host and host not in ('0.0.0.0', '::') else '127.0.0.1'}:{port}/ytcast"
        self.data = Path(datadir) / "ytcast"
        cmd = cfg.get("command")                        # another program instead of the sidecar (the tests' fake one)
        self.cmd = [str(a) for a in cmd] if isinstance(cmd, list) and cmd else [str(cfg.get("node") or shutil.which("node") or shutil.which("nodejs") or "node"), str(SCRIPT)]
        self.cwd = HERE if isinstance(cmd, list) and cmd else SCRIPT.parent
        self.token = str(cfg.get("token") or "") or secrets.token_urlsafe(24)
        self.link = self.proc = None
        self.app_id = None                              # the cast that came from the YouTube app, to tell it when it stops
        hub.s["ytcast"] = {"on": self.on, "status": "démarrage…" if self.on else "éteint", "ok": False, "code": None, "code_at": 0,
                           "senders": [], "name": self.name}
        player.app = self if self.on else None
        if self.on:
            self.data.mkdir(parents=True, exist_ok=True)
            tf = self.data / "token"                    # for a sidecar started by hand (node index.js), never sent to a phone
            tf.touch(mode=0o600, exist_ok=True)
            tf.chmod(0o600)                             # before the code goes in
            tf.write_text(self.token)
            hub.listeners.append(self._watch)

        @hub.action("ytcast.code")
        async def code():
            """The "Link with TV code" code, in big on Pixel's screen (5 minutes, until a phone pairs, or a touch)."""
            if not self.on:
                return hub.toast("Le cast depuis l'appli YouTube n'est pas activé sur Pixel (docs/CAST.md).", 5000)
            self.cast._start({"kind": "ytcode", "title": "Code TV YouTube"}, 300)

    def set(self, **kw):
        self.hub.s["ytcast"].update(kw)
        self.hub.mark()

    # ---- the sidecar's process: started, restarted, stopped ----
    async def run(self):
        if not self.on:
            return
        delay = 1
        try:
            while True:
                try:
                    delay = await self._once(delay)
                except asyncio.CancelledError:
                    raise
                except Exception:                       # Pixel goes on whatever happens here
                    log.exception("ytcast: le superviseur a eu un problème")
                    await self.stop()
                    await asyncio.sleep(30)
        finally:
            await self.stop()

    async def _once(self, delay):
        """Starts the sidecar, waits for its end; returns the next restart delay, after waiting it."""
        env = {k: os.environ[k] for k in ("PATH", "HOME", "LANG", "LC_ALL", "TZ", "NODE_EXTRA_CA_CERTS") if k in os.environ}
        env.update(PIXEL_YTCAST_URL=self.url, PIXEL_YTCAST_TOKEN=self.token, PIXEL_YTCAST_NAME=self.name, PIXEL_YTCAST_PORT=str(self.dial),
                   PIXEL_YTCAST_DATA=str(self.data), PIXEL_YTCAST_PARENT="1", NODE_ENV="production")
        t0 = time.monotonic()
        try:                                            # no shell, and its code in its environment, not on its command line
            self.proc = await asyncio.create_subprocess_exec(*self.cmd, cwd=self.cwd, env=env, stdin=asyncio.subprocess.PIPE,
                                                             stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        except OSError as e:
            log.warning("ytcast: impossible de lancer %s (%s)", self.cmd[0], e)
            self.set(status="Node.js introuvable : installe-le (docs/CAST.md, YouTube).", ok=False)
            await asyncio.sleep(300)
            return delay
        log.info("ytcast: lancé (pid %s)", self.proc.pid)
        self.set(status="démarrage…", ok=False)
        await self._pump(self.proc.stdout)
        code = await self.proc.wait()
        self.proc = None
        self.set(ok=False, code=None, senders=[])
        if code == MISSING:
            self.set(status="Module absent : lance « npm ci --omit=dev » dans sidecar/ytcast (docs/CAST.md).")
            await asyncio.sleep(300)
            return delay
        delay = 1 if time.monotonic() - t0 > 120 else min(delay * 2, 120)     # it stops at once: slower each time (2, 4... 120 s)
        log.warning("ytcast: arrêté (code %s), relance dans %s s", code, delay)
        self.set(status=f"relance dans {delay} s (arrêt : code {code})")
        await asyncio.sleep(delay)
        return delay

    async def stop(self):
        p, self.proc = self.proc, None
        if p and p.returncode is None:
            try:
                p.terminate()
                await asyncio.wait_for(p.wait(), 4)
            except asyncio.TimeoutError:
                p.kill()
            except ProcessLookupError:
                pass

    @staticmethod
    async def _pump(stream):
        """Its log lines, in Pixel's log (it writes few; too long a line is cut)."""
        try:
            while line := await stream.readline():
                text = line.decode("utf-8", "replace").rstrip()
                if text:
                    log.info("ytcast: %s", text[:300])
        except ValueError:                              # a line longer than 64 Ko: the rest is not read, only drained
            while await stream.read(65536):
                pass

    # ---- its WebSocket ----
    async def ws(self, request):
        if not self.on:
            raise web.HTTPNotFound(text="Le cast depuis l'appli YouTube n'est pas activé ([ytcast] dans config.toml).")
        if not sidecar_request(request):
            raise web.HTTPForbidden(text="Réservé au module YouTube de Pixel, sur le Pi lui-même.")
        ws = web.WebSocketResponse(heartbeat=20, max_msg_size=64 * 1024)
        await ws.prepare(request)
        try:
            m = await ws.receive(timeout=5)
            hello = json.loads(m.data) if m.type == WSMsgType.TEXT else {}
        except (asyncio.TimeoutError, ValueError):
            hello = {}
        tok = hello.get("token") if isinstance(hello, dict) and hello.get("type") == "hello" else None
        if not isinstance(tok, str) or not secrets.compare_digest(tok.encode(), self.token.encode()):
            log.warning("ytcast: connexion refusée (mauvais code)")
            await ws.close(code=4003, message=b"code")
            return ws
        old, self.link = self.link, ws
        if old is not None:
            await old.close()
        await ws.send_json({"type": "welcome", "v": 1})
        try:
            async for msg in ws:
                if msg.type != WSMsgType.TEXT:
                    continue
                try:
                    m = json.loads(msg.data)
                    if isinstance(m, dict):
                        self.on_message(m)
                except (ValueError, TypeError, KeyError):
                    log.warning("ytcast: message illisible %.120s", msg.data)
        finally:
            if self.link is ws:
                self.link = None
                self.set(ok=False, status="déconnecté")
        return ws

    def send(self, m):
        ws = self.link
        if ws is None or ws.closed:
            return False

        async def go():
            try:
                await ws.send_json(m)
            except Exception:                           # gone meanwhile: it will come back
                pass
        asyncio.get_running_loop().create_task(go())
        return True

    def on_message(self, m):
        t, s = m.get("type"), self.hub.s["ytcast"]
        if t == "status":
            ok = m.get("status") == "running"
            err = re.sub(r"\s+", " ", str(m.get("error") or "")).strip()[:160]
            self.set(ok=ok, status="prêt" if ok else ("erreur : " + err if err else "démarrage…"))
        elif t == "pairing":
            self.set(code=tv_code(m.get("code")), code_at=time.time() * 1000)
        elif t == "sender":
            name = re.sub(r"\s+", " ", str(m.get("name") or "")).strip()[:60] or "Un appareil"
            names = [n for n in s["senders"] if n != name]
            if m.get("event") == "connect":
                self.set(senders=(names + [name])[-5:])
                self.hub.toast(f"YOUTUBE : {name.upper()} EST CONNECTÉ", 3500)
                c = self.hub.s.get("cast")
                if c and c["kind"] == "ytcode":         # paired: the code can go
                    self.cast.stop()
            else:
                self.set(senders=names if int(_num(m.get("count"), 0, 99, len(names))) else [])
        elif t == "play":
            vid, lst = str(m.get("id") or ""), str(m.get("list") or "")
            if ID.fullmatch(vid):
                c = self.player.from_app(vid, _num(m.get("pos"), 0, 86400, 0), lst if LIST.fullmatch(lst) else "")
                self.app_id = c["id"]
        elif t in ("pause", "resume", "seek", "volume", "stop"):
            c = self.player.current()
            if not c or c["id"] != self.app_id:         # Pixel shows something else now
                return
            if t == "stop":
                self.app_id = None
                self.cast.stop()
            elif t == "seek":
                p = _num(m.get("pos"), 0, 86400)
                if p is not None:
                    self.player.order("seek", to=round(p, 1))
            elif t == "volume":
                lv = _num(m.get("level"), 0, 100)
                if lv is not None:
                    self.player.order("volume", level=round(lv))
                if "muted" in m:
                    self.player.order("mute", on=bool(m.get("muted")))
            else:
                self.player.order("pause" if t == "pause" else "play")

    # ---- what Pixel's player does, for the YouTube app ----
    def state(self, c):
        st = c["ytp"]["st"] or {}
        if st.get("err"):
            self.send({"type": "error", "id": c["yt"]["id"], "code": st["err"]})
        self.send({"type": "state", "id": st.get("vid") or c["yt"]["id"], **{k: st.get(k) for k in ("state", "pos", "dur", "vol", "muted")}})

    def ended(self, c):
        """The video is over: the YouTube app may have a next one (its list, its autoplay). False: end the cast now."""
        if not self.send({"type": "ended", "id": c["yt"]["id"]}):
            return False
        cid, v = c["id"], c["ytp"]["v"]

        def check():
            now = self.hub.s.get("cast")
            if now and now["id"] == cid and now.get("ytp", {}).get("v") == v:
                self.cast.stop()
        asyncio.get_running_loop().call_later(NEXT_WAIT, check)
        return True

    def _watch(self, snap):
        """After each broadcast: the YouTube app's cast is gone from Pixel's screen? Tell it."""
        c = snap.get("cast")
        if self.app_id and not (c and c["id"] == self.app_id):
            self.app_id = None
            self.send({"type": "stopped"})
