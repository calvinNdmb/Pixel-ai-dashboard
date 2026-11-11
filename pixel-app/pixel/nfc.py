"""Pixel's NFC tag page (/nfc): a phone that touches the tag pairs with a code Pixel shows on his own screen, then gets his
settings: the Wi-Fi (pixel/wifi.py) and Claude's API key, write only (a new key can be given; the old one is never shown).

The tag holds http://pixel.local:8080/nfc, with no access code on it: whoever touches the tag must also see Pixel's screen.
The page (web/nfc.html, web/nfc.js) asks for a code; Pixel shows it as a card over his screen (a cast of kind "code", drawn
by web/screens.js like the screen sharing's), with the same rules as pixel/ecran.py: 6 digits, 3 minutes, 5 tries, a new
one at most every 5 s, 30 wrong codes in an hour from one device and that device gets no more codes for a while; never over
something cast; a touch on Pixel's screen refuses it, and then no new code for 30 s. The right code opens a session of 15
minutes for that page: the access code (to open Pixel's app, as the QR code gives it), the Wi-Fi, the API key.

Routes (server.py adds them; its home_only middleware already keeps them to the home network):
  GET  /nfc                 the page (an old tag with ?t=<access code> still opens Pixel; the settings still need the code)
  POST /api/nfc/code        a code on Pixel's screen (the same one while it is there)
  POST /api/nfc/pair        {code} -> {session, token, ttl}
  GET  /api/nfc/state       (session) the Wi-Fi, and whether there is an API key: never the key itself
  POST /api/nfc/wifi/scan   (session)
  POST /api/nfc/wifi/join   (session) {ssid, password?}
  POST /api/nfc/key         (session) {key}: asked of Anthropic first (the Models API: no token spent), kept in
                            data_dir/claude.env (0600: the Pi's user only), then Pixel starts again to use it
The session travels in the X-Pixel-Session header; every POST is JSON and, when the browser says where it comes from
(Origin), from this very address: a page of another site can neither send them nor read what they answer.
The API key never goes into the snapshot, the log, a toast, nor an answer. data_dir/claude.env comes before
/etc/pixel.env: load_key() puts it in the environment at start, before Claude starts (server.py).
"""
import asyncio
import json
import logging
import os
import re
import secrets
import time
from pathlib import Path
from urllib.parse import urlsplit

from aiohttp import web

from .abonnement import wanted
from .ecran import device

log = logging.getLogger("pixel")

CODE_S = 180                # a code lasts 3 minutes
TRIES = 5                   # wrong codes before that code is thrown away
SPACING = 5                 # seconds between two new codes
MAX_FAILS = 30              # wrong codes in an hour from one device: no more codes for it for a while
QUIET_S = 30                # a code refused on Pixel (a touch on his screen): no new one for that long
SESSION_S = 900             # what the right code opens: 15 minutes of settings
MAX_SESSIONS = 8
KEY_RE = re.compile(r"sk-ant-[A-Za-z0-9_\-]{20,300}")
KEY_FILE = "claude.env"
RESTART = 75                # the exit code that has systemd start Pixel again (pixel@.service: Restart=on-failure)
WIFI_KEYS = ("ok", "perm", "online", "eth", "ssid", "signal", "nets", "scanning", "job")
STATUS = {400: web.HTTPBadRequest, 401: web.HTTPUnauthorized, 403: web.HTTPForbidden, 409: web.HTTPConflict,
          415: web.HTTPUnsupportedMediaType, 429: web.HTTPTooManyRequests, 500: web.HTTPInternalServerError}


def no(status, msg):
    """An answer the page reads: {"ok": false, "error": "..."} with that status, to raise."""
    return STATUS[status](text=json.dumps({"ok": False, "error": msg}, ensure_ascii=False), content_type="application/json")


def load_key(datadir):
    """At start (server.py, before Claude starts): the API key given on the NFC page, before /etc/pixel.env's."""
    try:
        text = (Path(datadir) / KEY_FILE).read_text(encoding="utf-8")
    except OSError:
        return False
    for line in text.splitlines():
        k, _, v = line.partition("=")
        if k.strip() == "ANTHROPIC_API_KEY" and KEY_RE.fullmatch(v.strip()):
            os.environ["ANTHROPIC_API_KEY"] = v.strip()
            return True
    return False


def save_key(datadir, key):
    """data_dir/claude.env, readable by the Pi's user only (0600), written whole or not at all."""
    path = Path(datadir) / KEY_FILE
    tmp = path.with_name(KEY_FILE + ".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write("# La clé API de Claude, donnée sur la page NFC de Pixel (pixel/nfc.py). Elle passe avant celle de /etc/pixel.env.\n")
        f.write(f"ANTHROPIC_API_KEY={key}\n")
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)


async def check_key(key, model):
    """Asks Anthropic whether the key works, with the Models API (no token spent): (True, "") or (False, why); None first
    when it could not be asked (no network, Anthropic unavailable)."""
    try:
        import anthropic as A
    except ImportError:
        return None, "Pixel n'a pas pu vérifier la clé (bibliothèque anthropic absente)."
    try:
        async with A.AsyncAnthropic(api_key=key, max_retries=0, timeout=10.0) as client:
            await client.models.retrieve(model)
        return True, ""
    except A.AuthenticationError:
        return False, "Anthropic refuse cette clé : vérifie-la sur la console Anthropic."
    except A.PermissionDeniedError:
        return False, "Cette clé n'a pas le droit d'utiliser Claude."
    except A.NotFoundError:
        return True, ""                                 # the key works; the model's name is config.toml's business
    except A.APIConnectionError:
        return None, "Pixel n'a pas pu joindre Anthropic pour vérifier la clé."
    except A.APIStatusError as e:
        return None, f"Anthropic n'a pas pu vérifier la clé (erreur {e.status_code})."


def _restart():
    log.info("nfc : nouvelle clé API, Pixel redémarre")
    raise SystemExit(RESTART)


class Nfc:
    def __init__(self, hub, token, datadir, web_dir, wifi=None, claude_cfg=None, cfg=None):
        cfg = cfg or {}
        self.hub, self.token, self.datadir, self.wifi = hub, token, Path(datadir), wifi
        self.claude_cfg = claude_cfg or {}
        self.page_file = Path(web_dir) / "nfc.html"
        self.spacing = float(cfg.get("spacing", SPACING))        # [nfc] spacing, code_seconds, quiet_seconds: the tests' own
        self.code_s = float(cfg.get("code_seconds", CODE_S))
        self.quiet_s = float(cfg.get("quiet_seconds", QUIET_S))
        self.code = None                                         # {code, until, tries, id (of its card)}
        self.last_code, self.quiet, self.fails = 0.0, 0.0, {}    # fails: device -> times
        self.sessions = {}                                       # session -> {until, who}
        self.restart = not hub.demo                              # a new key: Pixel starts again (not in --demo)

    def routes(self, router):
        router.add_get("/nfc", self.page)
        router.add_post("/api/nfc/code", self.ask_code)
        router.add_post("/api/nfc/pair", self.pair)
        router.add_get("/api/nfc/state", self.state)
        router.add_post("/api/nfc/wifi/scan", self.wifi_scan)
        router.add_post("/api/nfc/wifi/join", self.wifi_join)
        router.add_post("/api/nfc/key", self.set_key)

    # ---- what a request must be ----
    @staticmethod
    def _same_origin(request):
        """No Origin (a program), or this very address: a page of another site cannot use these routes."""
        origin = request.headers.get("Origin")
        if origin is None:
            return True
        try:
            o = urlsplit(origin)
        except ValueError:
            return False
        return o.scheme in ("http", "https") and o.netloc.lower() == (request.host or "").lower()

    async def _body(self, request):
        if not self._same_origin(request):
            raise no(403, "Cette demande ne vient pas de la page de Pixel.")
        if request.content_type != "application/json":
            raise no(415, "Pixel attend du JSON.")
        if (request.content_length or 0) > 4096:
            raise no(400, "C'est trop long.")
        try:
            data = await request.json()
        except ValueError:
            raise no(400, "Pixel n'a pas compris la demande.") from None
        return data if isinstance(data, dict) else {}

    def _session(self, request):
        t, given = time.time(), request.headers.get("X-Pixel-Session", "")
        self.sessions = {k: v for k, v in self.sessions.items() if v["until"] > t}
        for k, v in self.sessions.items():
            if given and secrets.compare_digest(k.encode(), given.encode()):
                return v
        raise no(401, "L'accès aux réglages est fini : demande un nouveau code à Pixel.")

    # ---- the code on Pixel's screen ----
    def _locked(self, who):
        t = time.time()
        self.fails = {w: k for w, k in ((w, [f for f in k if t - f < 3600]) for w, k in self.fails.items()) if k}
        return len(self.fails.get(who, ())) >= MAX_FAILS

    def _watch(self):
        """The code's card is no longer on Pixel's screen: refused by a touch (then a quiet while) or its time is over."""
        if not self.code:
            return
        c = self.hub.s.get("cast")
        if not (c and c.get("id") == self.code["id"]):
            if time.time() < self.code["until"] - 1:
                self.quiet = time.time() + self.quiet_s
            self.code = None

    def _drop_card(self):
        c = self.hub.s.get("cast")
        if self.code and c and c.get("id") == self.code["id"]:
            self.hub.s["cast"] = None
            self.hub.mark()

    async def ask_code(self, request):
        await self._body(request)
        who, t = device(request.remote), time.time()
        self._watch()
        if self._locked(who):
            raise no(429, "Trop de codes faux cette heure-ci : réessaie plus tard.")
        if self.code and t < self.code["until"]:
            return web.json_response({"ok": True, "ttl": round(self.code["until"] - t)})
        if t < self.quiet:
            raise no(429, "Le code vient d'être refusé sur l'écran de Pixel : réessaie dans un moment.")
        if self.hub.s.get("cast"):
            raise no(409, "Pixel montre déjà quelque chose sur son écran : réessaie quand c'est fini.")
        if t - self.last_code < self.spacing:
            raise no(429, "Attends quelques secondes avant de demander un autre code.")
        code, self.last_code = f"{secrets.randbelow(10 ** 6):06d}", t
        card = {"kind": "code", "title": "Relier un téléphone", "code": code, "id": secrets.token_urlsafe(6), "t0": t * 1000,
                "until": (t + self.code_s) * 1000, "raw": False,
                "note": "Sur le téléphone posé sur Pixel, tape ce code. Ce n'est pas toi ? Touche l'écran pour refuser."}
        self.hub.s["cast"] = card
        self.hub.mark()
        self.code = {"code": code, "until": t + self.code_s, "tries": 0, "id": card["id"]}
        log.info("nfc : un code sur l'écran pour %s", who)
        return web.json_response({"ok": True, "ttl": round(self.code_s)})

    async def pair(self, request):
        data = await self._body(request)
        who = device(request.remote)
        self._watch()
        given = re.sub(r"\D", "", str(data.get("code") or ""))[:12]
        if self._locked(who):
            raise no(429, "Trop de codes faux cette heure-ci : réessaie plus tard.")
        if not self.code or time.time() > self.code["until"]:
            raise no(409, "Pas de code en cours : demande-en un à Pixel.")
        if given and secrets.compare_digest(given.encode(), self.code["code"].encode()):
            self._drop_card()
            self.code = None
            sid = secrets.token_urlsafe(24)
            self.sessions[sid] = {"until": time.time() + SESSION_S, "who": who}
            for old in sorted(self.sessions, key=lambda k: self.sessions[k]["until"])[:-MAX_SESSIONS]:
                del self.sessions[old]
            self.hub.toast("TÉLÉPHONE RELIÉ", 3000)
            log.info("nfc : téléphone relié (%s)", who)
            return web.json_response({"ok": True, "session": sid, "token": self.token, "ttl": SESSION_S})
        self.code["tries"] += 1
        self.fails.setdefault(who, []).append(time.time())
        left = TRIES - self.code["tries"]
        if left > 0:
            raise no(403, f"Ce n'est pas le bon code. Encore {left} essai{'s' if left > 1 else ''}.")
        self._drop_card()
        self.code = None
        raise no(403, "Trop d'essais : demande un nouveau code.")

    # ---- the page and the settings ----
    async def page(self, request):
        t = request.query.get("t", "")
        go = "/?t=" + self.token if t and secrets.compare_digest(t.encode(), self.token.encode()) else ""
        cfg = json.dumps({"apk": (self.datadir / "pixel.apk").exists(), "go": go}, ensure_ascii=False).replace("</", "<\\/")
        html = self.page_file.read_text(encoding="utf-8").replace("<!-- PIXEL:NFC -->", f"<script>window.PIXEL_NFC = {cfg};</script>", 1)
        return web.Response(text=html, content_type="text/html", headers={"Cache-Control": "no-store"})

    def key_state(self):
        has = bool(os.environ.get("ANTHROPIC_API_KEY"))
        mode = "demo" if self.hub.demo else "abonnement" if wanted(self.claude_cfg) else "api" if has else "aucun"
        return {"set": has, "mode": mode}

    async def state(self, request):
        self._session(request)
        w = self.hub.s.get("wifi")
        return web.json_response({"ok": True, "wifi": {k: w.get(k) for k in WIFI_KEYS} if w else None, "key": self.key_state()})

    async def wifi_scan(self, request):
        await self._body(request)
        self._session(request)
        if not self.wifi:
            raise no(409, "Le Wi-Fi ne se règle pas d'ici sur ce Pixel.")
        self.wifi.scan()
        return web.json_response({"ok": True})

    async def wifi_join(self, request):
        data = await self._body(request)
        self._session(request)
        if not self.wifi:
            raise no(409, "Le Wi-Fi ne se règle pas d'ici sur ce Pixel.")
        ssid, pw = data.get("ssid"), data.get("password")
        if not isinstance(ssid, str) or not (pw is None or isinstance(pw, str)):
            raise no(400, "Pixel n'a pas compris quel réseau.")
        self.wifi.join(ssid, pw or None)
        return web.json_response({"ok": True})

    async def set_key(self, request):
        data = await self._body(request)
        self._session(request)
        key = str(data.get("key") or "").strip()
        if not KEY_RE.fullmatch(key):
            raise no(400, "Ce n'est pas une clé API de Claude : elle commence par sk-ant- (copie-la depuis la console Anthropic).")
        note = ""
        if not self.hub.demo:
            ok, why = await check_key(key, str(self.claude_cfg.get("model") or "claude-haiku-5-5"))
            if ok is False:
                raise no(400, why)
            if ok is None:
                note = " " + why + " Elle est enregistrée quand même."
        try:
            save_key(self.datadir, key)
        except OSError as e:
            log.warning("nfc : clé API non enregistrée (%s)", e.__class__.__name__)
            raise no(500, "Pixel n'a pas pu enregistrer la clé.") from None
        os.environ["ANTHROPIC_API_KEY"] = key
        log.info("nfc : nouvelle clé API enregistrée")
        msg = "Clé enregistrée." + note
        if self.restart:
            msg += " Pixel redémarre pour l'utiliser : quelques secondes."
            self.hub.toast("NOUVELLE CLÉ CLAUDE : JE REDÉMARRE…", 4000)
            asyncio.get_running_loop().call_later(2.0, _restart)
        return web.json_response({"ok": True, "message": msg, "restart": self.restart})


def setup(hub, app, token, datadir, web_dir, wifi=None, claude_cfg=None, cfg=None):
    """The /nfc page and its routes (server.py, before the static route)."""
    n = Nfc(hub, token, datadir, web_dir, wifi, claude_cfg, cfg)
    n.routes(app.router)
    return n
