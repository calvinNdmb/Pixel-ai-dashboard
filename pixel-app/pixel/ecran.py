"""Screen mirroring ("partage d'écran"): a computer's screen (or a phone's) live on Pixel's screen.

    GET  /ecran               the sender page (web/ecran.html, with Pixel's addresses in it): « Partager mon écran »
    GET  /ecran/lanceur.html  the same page as a file to download, then open from the computer: a file:// page is a secure
                              context, so the browser lets it share the screen without https. It holds addresses, no code.
    GET  /ecran/ws            the signalling WebSocket. A sender needs the one-time code shown on Pixel's screen (or the
                              access code); only Pixel's own screen (the Pi itself) can be the receiver. The server only
                              relays the offer, the answer and the ICE candidates: the picture goes straight to Pixel's screen.
    POST /ecran/telephone     Android with ScreenStream (its local MJPEG mode): Pixel's screen shows
                              http://<the phone's address>:<port>/stream.mjpeg. Pixel's screen loads it, never the server.

WebRTC: the computer's browser captures its screen (getDisplayMedia, 1280x720 at 30 im/s at most, H.264 first: the Pi 4
decodes it in hardware) and sends it to the kiosk Chromium (http://localhost: a secure context), with no STUN server on
the home network. The state's "cast" is then {kind: "screen", via: "webrtc" | "mjpeg" | "airplay", phase, title, note,
code?, session?, src?}, drawn by web/screens.js like the other casts, without any CRT effect, and stopped like them (a touch
on Pixel, the phone's Arrêter, another screen, another cast): this module notices and tells the computer.
The one-time code: 6 digits, 3 minutes, 5 tries, then a new one must be asked (it shows on Pixel's screen again); a page
stays paired while it is open. The [ecran] settings of config.toml: https_port (the optional https address), kiosk_wait,
live_wait. AirPlay is pixel/airplay.py.
"""
import asyncio
import ipaddress
import json
import logging
import os
import re
import secrets
import ssl
import time
from pathlib import Path
from urllib.parse import urlsplit

from aiohttp import WSMsgType, web

from .cast import has_access, local_page

log = logging.getLogger("pixel")
CODE_S = 180                # a code lasts 3 minutes
TRIES = 5                   # wrong codes before that code is thrown away
SPACING = 5                 # seconds between two new codes
MAX_FAILS = 30              # wrong codes in an hour, then no more codes for a while
PAIRED_S = 60               # the "ready" card, while the computer picks what to share
QUIET_S = 30                # a code card closed on Pixel: no new one for a page without the access code, for that long
MAX_SOCKETS = 12
MAX_MSG = 256 * 1024        # an SDP is a few kilobytes
BAD_NAME = re.compile(r"[^\w .'()+-]")
WHY = {"mjpeg": "Pixel ne trouve pas ScreenStream sur ton téléphone. Lance-le en mode Local, sans code PIN, sur le même Wi-Fi.",
       "webrtc": "Le navigateur de Pixel ne sait pas recevoir un écran partagé (WebRTC).",
       "reseau": "La connexion avec l'écran partagé s'est perdue.",
       "signal": "Pixel a perdu le contact avec l'ordinateur."}


class AddressError(ValueError):
    """Why a phone's address cannot be used, in French."""


def clean_name(s):
    """The sender's own name for itself ("PC Windows"): letters, digits, a few marks, 40 characters."""
    return BAD_NAME.sub("", str(s or "")).strip()[:40]


def clean_sdp(s):
    if not isinstance(s, str) or not s.startswith("v=0") or len(s) > MAX_MSG:
        raise ValueError("sdp")
    return s


def clean_ice(c):
    """An ICE candidate: its four fields and nothing else (None: the end of the candidates)."""
    if c is None:
        return None
    if not isinstance(c, dict) or not isinstance(c.get("candidate"), str) or len(c["candidate"]) > 1024:
        raise ValueError("ice")
    out = {"candidate": c["candidate"]}
    if isinstance(c.get("sdpMid"), str) and len(c["sdpMid"]) <= 64:
        out["sdpMid"] = c["sdpMid"]
    if isinstance(c.get("sdpMLineIndex"), int) and not isinstance(c["sdpMLineIndex"], bool) and 0 <= c["sdpMLineIndex"] < 64:
        out["sdpMLineIndex"] = c["sdpMLineIndex"]
    if isinstance(c.get("usernameFragment"), str) and len(c["usernameFragment"]) <= 256:
        out["usernameFragment"] = c["usernameFragment"]
    return out


def phone_address(remote, typed=""):
    """(ip, port or None) of the phone's ScreenStream: the address it typed (as ScreenStream shows it, "192.168.1.23:8080"),
    or else the one its request came from. An IP address of the home network only: no name, no loopback, no IPv6 link-local
    address (a browser cannot use one), no public address."""
    s, port = str(typed or "").strip(), None
    if s:
        if len(s) > 100:
            raise AddressError("Cette adresse est trop longue.")
        try:
            p = urlsplit(s if "://" in s else "http://" + s)
            host, port = p.hostname or "", p.port
            ok = p.scheme == "http" and not p.username and not p.password and p.path in ("", "/", "/stream.mjpeg") and not p.query
        except ValueError:
            ok = False
        if not ok:
            raise AddressError("Tape l'adresse que ScreenStream affiche, par exemple 192.168.1.23:8080.")
    else:
        host = remote or ""
    try:
        ip = ipaddress.ip_address(host.split("%")[0])
    except ValueError:
        raise AddressError("Tape l'adresse que ScreenStream affiche, des chiffres comme 192.168.1.23:8080.") from None
    ip = getattr(ip, "ipv4_mapped", None) or ip
    if ip.is_loopback or ip.is_unspecified:
        raise AddressError("Ce bouton marche depuis le téléphone qui partage son écran, pas depuis l'écran de Pixel.")
    if ip.version == 6 and ip.is_link_local:
        raise AddressError("Pixel voit ton téléphone par une adresse IPv6 locale : tape l'adresse que ScreenStream affiche (192.168…).")
    if ip.is_multicast or not (ip.is_private or ip.is_link_local):
        raise AddressError("Cette adresse n'est pas sur le réseau de la maison.")
    return ip, port


class Ecran:
    def __init__(self, hub, cfg, web_dir, datadir, token, host="pixel", port=8080, ip="127.0.0.1"):
        self.hub, self.token, self.page_file = hub, token, Path(web_dir) / "ecran.html"
        self.host, self.port, self.ip = host, port, ip
        self.https_port = int(cfg.get("https_port", 0) or 0)
        tls = Path(datadir) / "tls"
        self.cert = Path(os.path.expanduser(str(cfg.get("cert") or tls / "pixel.crt")))
        self.key = Path(os.path.expanduser(str(cfg.get("key") or tls / "pixel.key")))
        self.kiosk_wait = float(cfg.get("kiosk_wait", 10))       # seconds for Pixel's screen to answer
        self.live_wait = float(cfg.get("live_wait", 30))         # seconds for the first picture
        self.code = None            # {code, until, tries, id (of its card)}
        self.last_code, self.fails, self.quiet = 0.0, [], 0.0    # quiet: no code for a page without the access code until then
        self.socks = {}             # WebSocket -> {role, authed, name, t0, local, asked}
        self.sess = None            # {id, sender, kiosk, t0, live}
        self.https_on = False
        hub.s["settings"]["ecran"] = self.settings()
        hub.listeners.append(lambda snap: self._watch())

        @hub.action("ecran.code")
        async def code():
            """« Afficher un code » in the phone app: a code on Pixel's screen, that the app shows too (it is in the state)."""
            why = self._pair(app=True)
            if why:
                hub.toast(why, 4000)

        @hub.action("ecran.fail")
        async def fail(id, why=""):
            """Pixel's screen cannot show the shared screen: no WebRTC, ScreenStream not found, the connection lost."""
            c = hub.s.get("cast")
            if not c or c.get("id") != id or c.get("kind") != "screen":
                return
            msg = WHY.get(str(why), "Pixel n'arrive pas à afficher cet écran.")
            if self.sess and c.get("session") == self.sess["id"]:
                self._end(str(why), msg)
            else:
                hub.s["cast"] = None
            hub.toast(msg, 6000)

    # ---- what the phone app and the sender page are told ----
    def settings(self):
        return {"page": f"http://{self.host}.local:{self.port}/ecran", "ip_page": f"http://{self.ip}:{self.port}/ecran",
                "https": f"https://{self.host}.local:{self.https_port}/ecran" if self.https_on else "", "launcher": "/ecran/lanceur.html"}

    def _page(self, launcher=False):
        cfg = {**self.settings(), "origins": [f"http://{self.host}.local:{self.port}", f"http://{self.ip}:{self.port}"]}
        if launcher:                # opened from the computer's disk: where to find Pixel (by its name, else by its address)
            cfg.update(file=True, ws=[f"ws://{self.host}.local:{self.port}/ecran/ws", f"ws://{self.ip}:{self.port}/ecran/ws"])
        js = json.dumps(cfg, ensure_ascii=False).replace("</", "<\\/")
        return self.page_file.read_text(encoding="utf-8").replace("<!-- PIXEL:CONFIG -->", f"<script>window.PIXEL_ECRAN = {js};</script>", 1)

    # ---- the cards on Pixel's screen ----
    def _show(self, phase, title, note, **extra):
        c = {"kind": "screen", "via": "webrtc", "phase": phase, "title": title, "note": note, "id": secrets.token_urlsafe(6),
             "t0": time.time() * 1000, "until": 0, "raw": False, **extra}
        self.hub.s["cast"] = c
        self.hub.mark()
        return c

    def _addr(self):
        return f"{self.host}.local:{self.port}/ecran"

    def _pair(self, app=False):
        """A one-time code on Pixel's screen (the same one while it is there). None, or why not, in French.
        Asked by a page without the access code (app=False), it never covers what is cast, nor comes back at once after
        a touch closed it on Pixel: someone on the Wi-Fi without the code cannot take Pixel's screen."""
        t, c = time.time(), self.hub.s.get("cast")
        self.fails = [f for f in self.fails if t - f < 3600]
        if len(self.fails) >= MAX_FAILS:
            return "Trop de codes faux cette heure-ci : réessaie plus tard."
        if self.code and t < self.code["until"] and c and c.get("id") == self.code["id"]:
            return None
        if self.sess:
            return "Un écran est déjà partagé sur Pixel : arrête-le d'abord."
        if not app and c:
            return "Pixel montre déjà quelque chose : arrête-le d'abord, ou demande le code dans l'appli de Pixel."
        if not app and t < self.quiet:
            return "Le code vient d'être fermé sur Pixel : réessaie dans un moment, ou demande-le dans l'appli de Pixel."
        if t - self.last_code < SPACING:
            return "Attends quelques secondes avant de demander un autre code."
        code, self.last_code = f"{secrets.randbelow(10 ** 6):06d}", t
        card = self._show("code", "Partage d'écran", f"Sur l'ordinateur, tape ce code dans la page « Partager mon écran » ({self._addr()}).",
                          code=code, until=(t + CODE_S) * 1000)
        self.code = {"code": code, "until": t + CODE_S, "tries": 0, "id": card["id"]}
        return None

    def _check(self, given):
        """The code typed on the computer: (True, "") or (False, why)."""
        given = re.sub(r"\D", "", str(given or ""))[:12]
        self.fails = [f for f in self.fails if time.time() - f < 3600]
        if len(self.fails) >= MAX_FAILS:
            return False, "Trop de codes faux cette heure-ci : réessaie plus tard."
        if not self.code or time.time() > self.code["until"]:
            return False, "Pas de code en cours : demande-en un à Pixel."
        if given and secrets.compare_digest(given.encode(), self.code["code"].encode()):
            self.code = None
            return True, ""
        self.code["tries"] += 1
        self.fails.append(time.time())
        left = TRIES - self.code["tries"]
        if left > 0:
            return False, f"Ce n'est pas le bon code. Encore {left} essai{'s' if left > 1 else ''}."
        c = self.hub.s.get("cast")
        if c and c.get("id") == self.code["id"]:
            self.hub.s["cast"] = None
            self.hub.mark()
        self.code = None
        return False, "Trop d'essais : demande un nouveau code."

    # ---- the session: one computer at a time, Pixel's screen receives ----
    def _end(self, why, msg):
        s, self.sess = self.sess, None
        if not s:
            return
        log.info("écran partagé : fin (%s)", why)
        self._say(s["sender"], {"type": "stopped", "why": why, "msg": msg})
        if s["kiosk"]:
            self._say(s["kiosk"], {"type": "stop"})
        c = self.hub.s.get("cast")
        if c and c.get("session") == s["id"]:
            self.hub.s["cast"] = None
            self.hub.mark()

    def _watch(self):
        """After each change: the code card or the shared screen closed on Pixel (a touch, Arrêter, another cast or screen)."""
        c = self.hub.s.get("cast")
        if self.code and not (c and c.get("id") == self.code["id"]):
            if time.time() < self.code["until"] - 1:                # closed on Pixel before its time: leave Pixel alone a while
                self.quiet = time.time() + QUIET_S
            self.code = None
            for ws, info in list(self.socks.items()):
                if info["asked"] and not info["authed"]:
                    self._say(ws, {"type": "code-off"})
        if self.sess and not (c and c.get("session") == self.sess["id"]):
            self._end("pixel", "Le partage a été arrêté sur Pixel.")

    async def tick(self):
        self._watch()
        t, s = time.time(), self.sess
        if self.code and t > self.code["until"]:
            c = self.hub.s.get("cast")
            if c and c.get("id") == self.code["id"]:
                self.hub.s["cast"] = None
                self.hub.mark()
            self._watch()
        if s and not s["kiosk"] and t - s["t0"] > self.kiosk_wait:
            self._end("kiosk", "L'écran de Pixel ne répond pas. Est-il allumé, sur son écran ?")
            self.hub.toast("Partage d'écran : l'écran de Pixel n'a pas répondu.", 4000)
        elif s and not s["live"] and t - s["t0"] > self.live_wait:
            self._end("reseau", "L'image n'arrive pas jusqu'à Pixel. L'ordinateur et Pixel sont-ils sur le même réseau (pas un Wi-Fi invité) ?")
            self.hub.toast("Partage d'écran : l'image n'arrive pas.", 4000)
        for ws, info in list(self.socks.items()):        # a page left open without a code, for 10 minutes
            if not info["authed"] and info["role"] != "kiosk" and t - info["t0"] > 600 and not info.get("closing"):
                info["closing"] = True
                asyncio.ensure_future(ws.close())

    def _say(self, ws, m):
        if ws is not None and not ws.closed:
            asyncio.ensure_future(self._send(ws, m))

    @staticmethod
    async def _send(ws, m):
        try:
            await ws.send_str(json.dumps(m, ensure_ascii=False))
        except Exception:                                   # gone meanwhile
            pass

    async def _on(self, ws, info, m):
        typ, s, say = m.get("type"), self.sess, (lambda x: self._send(ws, x))
        if typ == "kiosk" or info["role"] == "kiosk":       # ---- Pixel's own screen ----
            if not info["local"]:
                return await say({"type": "error", "msg": "Seul l'écran de Pixel peut recevoir l'image."})
            info["role"] = "kiosk"
            if typ == "kiosk":
                if not s or m.get("session") != s["id"]:
                    return await say({"type": "stop"})
                if s["kiosk"] not in (None, ws):
                    self._say(s["kiosk"], {"type": "stop"})
                s["kiosk"] = ws
                return self._say(s["sender"], {"type": "ready"})
            if not s or s["kiosk"] is not ws:
                return
            if typ == "answer":
                return self._say(s["sender"], {"type": "answer", "sdp": clean_sdp(m.get("sdp"))})
            if typ == "ice":
                return self._say(s["sender"], {"type": "ice", "candidate": clean_ice(m.get("candidate"))})
            if typ == "live" and not s["live"]:
                s["live"] = True
                c = self.hub.s.get("cast")
                if c and c.get("session") == s["id"]:
                    c.update(phase="live", note="L'écran de l'ordinateur est sur Pixel, en direct.")
                    self.hub.mark()
                log.info("écran partagé : en direct")
                return self._say(s["sender"], {"type": "live"})
            if typ == "fail":
                why = str(m.get("why") or "")[:20]
                msg = WHY.get(why, "Pixel n'arrive pas à afficher cet écran.")
                self._end(why, msg)
                return self.hub.toast(msg, 6000)
            return
        # ---- a computer (or a phone) that shares its screen ----
        if typ == "pair":
            info["asked"] = True
            why = self._pair()
            return await say({"type": "error", "msg": why} if why else {"type": "code", "until": self.code["until"] * 1000})
        if typ == "hello":
            if not info["authed"]:
                t = m.get("t")
                if isinstance(t, str) and t and secrets.compare_digest(t.encode(), self.token.encode()):
                    info["authed"] = True
                else:
                    ok, why = self._check(m.get("code"))
                    if not ok:
                        return await say({"type": "bad", "msg": why, "left": TRIES - self.code["tries"] if self.code else 0})
                    info["authed"] = True
                    self._show("paired", "Ordinateur connecté", "Sur l'ordinateur, choisis ce que tu partages : un onglet, une fenêtre ou tout l'écran.",
                               until=(time.time() + PAIRED_S) * 1000)
                info["name"] = clean_name(m.get("name"))
            return await say({"type": "ok"})
        if not info["authed"]:
            return await say({"type": "error", "msg": "Tape d'abord le code affiché sur Pixel."})
        if typ == "start":
            if s:
                self._end("autre", "Un autre appareil partage son écran sur Pixel.")
            sid = secrets.token_urlsafe(9)
            name = info["name"]
            self._show("connecting", f"Écran : {name}" if name else "Écran partagé", "Connexion à l'ordinateur…", session=sid)
            self.sess = {"id": sid, "sender": ws, "kiosk": None, "t0": time.time(), "live": False}
            log.info("écran partagé : %s", name or "un ordinateur")
            return
        if not s or s["sender"] is not ws:
            return await say({"type": "stopped", "why": "pixel", "msg": "Ce partage est terminé."}) if typ in ("offer", "ice") else None
        if typ == "offer":
            return self._say(s["kiosk"], {"type": "offer", "sdp": clean_sdp(m.get("sdp"))})
        if typ == "ice":
            return self._say(s["kiosk"], {"type": "ice", "candidate": clean_ice(m.get("candidate"))})
        if typ == "stop":
            self._end("toi", "Tu as arrêté le partage.")

    def _gone(self, ws, info):
        s = self.sess
        if s and s["sender"] is ws:
            self._end("parti", "La page s'est fermée.")
        elif s and s["kiosk"] is ws:
            self._end("kiosk", "L'écran de Pixel s'est fermé.")

    # ---- the routes (server.py adds them) ----
    def routes(self, router):
        router.add_get("/ecran", self.page)
        router.add_get("/ecran/lanceur.html", self.launcher)
        router.add_get("/ecran/ws", self.ws)
        router.add_post("/ecran/telephone", self.phone)

    async def page(self, request):
        return web.Response(text=self._page(), content_type="text/html", headers={"Cache-Control": "no-cache"})

    async def launcher(self, request):
        return web.Response(text=self._page(launcher=True), content_type="text/html",
                            headers={"Content-Disposition": 'attachment; filename="Pixel-ecran.html"', "Cache-Control": "no-store"})

    async def ws(self, request):
        """The signalling. Pixel's own pages, the downloaded page (Origin: null) and programs; another site's page is refused
        (it could not do anything without the code, but it must not even put a code on Pixel's screen)."""
        origin = request.headers.get("Origin")
        if origin and origin not in ("null", "file://") and urlsplit(origin).netloc.lower() != (request.host or "").lower():
            raise web.HTTPForbidden(text="Pas depuis une autre page que celles de Pixel.")
        if len(self.socks) >= MAX_SOCKETS:
            raise web.HTTPServiceUnavailable(text="Trop de connexions.")
        ws = web.WebSocketResponse(heartbeat=20, max_msg_size=MAX_MSG)
        await ws.prepare(request)
        info = {"role": "", "authed": False, "name": "", "t0": time.time(), "local": local_page(request), "asked": False}
        self.socks[ws] = info
        try:
            async for msg in ws:
                if msg.type != WSMsgType.TEXT:
                    continue
                try:
                    m = json.loads(msg.data)
                    if isinstance(m, dict):
                        await self._on(ws, info, m)
                except (ValueError, TypeError, KeyError):
                    await self._send(ws, {"type": "error", "msg": "Message illisible."})
        finally:
            self.socks.pop(ws, None)
            self._gone(ws, info)
        return ws

    async def phone(self, request):
        """POST /ecran/telephone {port, address}: the phone's ScreenStream on Pixel's screen. Its address comes from its own
        request (or what it typed); the server only checks it, Pixel's screen opens it."""
        if not has_access(request, self.token):
            return web.json_response({"ok": False, "error": "Code d'accès manquant : ouvre l'appli avec le QR code de Pixel."}, status=403)
        try:
            d = await request.json()
        except Exception:
            d = {}
        d = d if isinstance(d, dict) else {}
        try:
            port = 8080 if d.get("port") in (None, "") else int(d["port"])
            if not 1 <= port <= 65535:
                raise ValueError
            ip, typed = phone_address(request.remote, d.get("address"))
        except AddressError as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)
        except (TypeError, ValueError):
            return web.json_response({"ok": False, "error": "Le port est un nombre, 8080 par défaut."}, status=400)
        host = f"[{ip}]" if ip.version == 6 else str(ip)
        src = f"http://{host}:{typed or port}/stream.mjpeg"
        self._show("connecting", "Écran du téléphone", "Connexion à ScreenStream… (mode Local, sans code PIN)", via="mjpeg", src=src)
        log.info("écran du téléphone : %s", src)
        return web.json_response({"ok": True, "src": src})

    async def serve_tls(self, runner, host=None):
        """The same app on https (https_port), with the certificate made by install.sh: what Safari on iOS 27 needs to share
        a screen, and an address for a computer without the downloaded page (after the browser's warning, once a week)."""
        if not self.https_port:
            return
        if not (self.cert.is_file() and self.key.is_file()):
            log.warning("https_port = %s, mais pas de certificat %s : voir docs/CAST.md", self.https_port, self.cert)
            return
        try:
            ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
            ctx.load_cert_chain(self.cert, self.key)
            await web.TCPSite(runner, host, self.https_port, ssl_context=ctx).start()
        except (OSError, ssl.SSLError) as e:
            log.warning("https impossible sur le port %s : %s", self.https_port, e)
            return
        self.https_on = True
        self.hub.s["settings"]["ecran"] = self.settings()
        self.hub.mark()
        log.info("https : %s", self.settings()["https"])
