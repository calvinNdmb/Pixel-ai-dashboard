"""L'album photo de Pixel: snapshots of his best moments, taken by his own screen (web/album.js).

    POST /api/album?raison=anniversaire    the picture itself (Content-Type image/jpeg or image/webp, MAX_BYTES at most)
    GET  /album/NAME                       a photo (?dl=1: to save it, « Enregistrer »)

Only Pixel's own screen captures (the kiosk page: canvas -> WebP or JPEG, about 800 x 480, under 120 Ko): on a special
moment (his birthday party, a record, a trophy, what other features ask with PixelAlbum.snap), or when asked (album.photo:
the command « prends une photo », the phone's button, Claude): the screens see "demande", his screen poses and shoots.
Never during a cast, never with a notification or the agenda's line on screen (web/album.js hides them for the shot).
The same access rules as the other routes (pixel/cast.py has_access): the Pi itself from Pixel's own page, or the access
code (?t=, the X-Pixel-Token header, the app's pixel_t cookie), on the home network only (server.home_only). What comes in
is checked from its bytes (a JPEG, or a still WebP), its size and its dimensions, never from what it says it is; files get
random names (NAME), and only those are ever served. MAX_PHOTOS photos and MAX_TOTAL bytes at most: the oldest one that is
not a favourite goes first; FAV_MAX favourites at most. Kept in data_dir/album/ (album.json lists them: a broken one is
rebuilt from the files). Snapshot "album": {photos: [{id, src, t, raison, fav, w, h}] newest first, max, fav_max,
demande: {id, t0} | None, ev: {id, kind: 'photo' | 'montre', t0, photo?} | None}.
Actions: album.photo, album.fav {id, on}, album.supprime {id}, album.montre (his screen shows the album, a slideshow).
"""
import asyncio
import json
import logging
import os
import re
import secrets
import struct
import time
from pathlib import Path

from aiohttp import web

from .cast import has_access

log = logging.getLogger("pixel.album")
MAX_PHOTOS, FAV_MAX = 60, 30
MAX_BYTES = 150 * 1024                    # one photo (his screen aims under 120 Ko)
MAX_TOTAL = 6 * 1024 * 1024               # all of them
MAX_W, MAX_H, MIN_SIDE = 1600, 1000, 16
NAME = re.compile(r"^[A-Za-z0-9_-]{16}\.(jpg|webp)$")         # what secrets.token_urlsafe(12) makes, and nothing else
ID = re.compile(r"^[A-Za-z0-9_-]{8}$")
RAISON = re.compile(r"^[a-z][a-z0-9-]{0,23}$")
MIME = {"jpg": "image/jpeg", "webp": "image/webp"}
DEMANDE_S = 25                            # album.photo: his screen has that long to shoot
PER_MIN = 8                               # uploads a minute, at most
RAISONS = {"photo": "Une photo", "anniversaire": "Ton anniversaire", "rencontre": "Notre rencontre", "record": "Un record",
           "trophee": "Un trophée", "look": "Un nouveau look", "ami": "Une visite", "jeu": "Une partie gagnée"}


def dimensions(data):
    """(ext, width, height) of a JPEG or a still WebP, read from its bytes; None for anything else (an animated WebP too)."""
    if data[:3] == b"\xff\xd8\xff":
        i = 2
        while i + 9 < len(data):
            if data[i] != 0xFF:
                return None
            marker = data[i + 1]
            if marker == 0xFF:                       # padding
                i += 1
                continue
            if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
                i += 2
                continue
            seg = struct.unpack(">H", data[i + 2:i + 4])[0]
            if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                h, w = struct.unpack(">HH", data[i + 5:i + 9])
                return "jpg", w, h
            if seg < 2:
                return None
            i += 2 + seg
        return None
    if len(data) >= 30 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        kind = data[12:16]
        if kind == b"VP8 " and data[23:26] == b"\x9d\x01\x2a":
            w, h = struct.unpack("<HH", data[26:30])
            return "webp", w & 0x3FFF, h & 0x3FFF
        if kind == b"VP8L" and data[20] == 0x2F:
            b = int.from_bytes(data[21:25], "little")
            return "webp", (b & 0x3FFF) + 1, ((b >> 14) & 0x3FFF) + 1
        if kind == b"VP8X":
            if data[20] & 0x02:                      # an animation: not a photo of his
                return None
            return "webp", int.from_bytes(data[24:27], "little") + 1, int.from_bytes(data[27:30], "little") + 1
    return None


def clean_entry(e, files):
    if not isinstance(e, dict) or not isinstance(e.get("f"), str) or not NAME.match(e["f"]) or e["f"] not in files:
        return None
    if not isinstance(e.get("id"), str) or not ID.match(e["id"]):
        return None
    t = e.get("t")
    if isinstance(t, bool) or not isinstance(t, (int, float)) or not (946684800000 <= t <= 4102444800000):
        return None
    r = e.get("raison") if isinstance(e.get("raison"), str) and RAISON.match(e["raison"]) else "photo"
    w, h = (e.get(k) if isinstance(e.get(k), int) and not isinstance(e.get(k), bool) and MIN_SIDE <= e.get(k) <= top else d
            for k, top, d in (("w", MAX_W, 800), ("h", MAX_H, 480)))
    return {"id": e["id"], "f": e["f"], "t": float(t), "raison": r, "fav": e.get("fav") is True, "w": w, "h": h, "size": files[e["f"]]}


class Album:
    def __init__(self, hub, datadir, clock=time.time):
        self.hub, self.clock = hub, clock
        self.dir = Path(datadir) / "album"
        self.dir.mkdir(parents=True, exist_ok=True)
        for f in self.dir.glob(".up-*"):              # uploads cut short by a restart
            f.unlink(missing_ok=True)
        self.photos = self._load()
        self.demande, self.ev, self.sent = None, None, []
        self._evid = int(clock()) % 100000 * 100
        self.prune()
        self.save()
        self.publish()

    # ---- the files ----
    def _files(self):
        try:
            return {f.name: f.stat().st_size for f in self.dir.iterdir() if f.is_file() and NAME.match(f.name)}
        except OSError:
            return {}

    def _load(self):
        files = self._files()
        try:
            raw = json.loads((self.dir / "album.json").read_text(encoding="utf-8"))
            items = raw.get("photos") if isinstance(raw, dict) else None
        except FileNotFoundError:
            items = None
        except Exception as e:                       # broken: rebuilt from the files
            log.warning("album.json unreadable (%s): rebuilt from the photos", e)
            items = None
        out, seen = [], set()
        for e in items if isinstance(items, list) else []:
            e = clean_entry(e, files)
            if e and e["f"] not in seen and e["id"] not in {x["id"] for x in out}:
                seen.add(e["f"])
                out.append(e)
        for name, size in files.items():              # a photo the list does not know (a broken list): kept, as a photo
            if name not in seen:
                path = self.dir / name
                try:
                    dims = dimensions(path.read_bytes()[:64 * 1024])
                    t = path.stat().st_mtime * 1000
                except OSError:
                    dims = None
                if not dims:
                    path.unlink(missing_ok=True)
                    continue
                out.append({"id": secrets.token_urlsafe(6), "f": name, "t": t, "raison": "photo", "fav": False, "w": dims[1], "h": dims[2], "size": size})
        return sorted(out, key=lambda e: -e["t"])

    def save(self):
        try:
            tmp = self.dir / "album.tmp"
            tmp.write_text(json.dumps({"v": 1, "photos": [{k: e[k] for k in ("id", "f", "t", "raison", "fav", "w", "h")} for e in self.photos]},
                                      ensure_ascii=False, indent=1), encoding="utf-8")
            os.replace(tmp, self.dir / "album.json")
        except OSError as e:
            log.warning("album.json not saved: %s", e)

    def _drop(self, e):
        self.photos.remove(e)
        (self.dir / e["f"]).unlink(missing_ok=True)
        S = getattr(self.hub, "souvenirs", None)
        if S is not None:
            S.oublie_photo(e["id"])

    def prune(self):
        """MAX_PHOTOS and MAX_TOTAL at most: the oldest one that is not a favourite goes first."""
        while len(self.photos) > MAX_PHOTOS or sum(e["size"] for e in self.photos) > MAX_TOTAL:
            old = min((e for e in self.photos if not e["fav"]), key=lambda e: e["t"], default=None)
            if old is None:
                break
            self._drop(old)

    # ---- what the screens get ----
    def public(self):
        return {"photos": [{"id": e["id"], "src": "/album/" + e["f"], "t": e["t"], "raison": e["raison"], "fav": e["fav"], "w": e["w"], "h": e["h"]}
                           for e in self.photos],
                "max": MAX_PHOTOS, "fav_max": FAV_MAX, "demande": dict(self.demande) if self.demande else None, "ev": self.ev}

    def publish(self):
        self.hub.s["album"] = self.public()
        self.hub.mark()

    def _event(self, kind, **data):
        self._evid += 1
        self.ev = {"id": self._evid, "kind": kind, "t0": self.clock() * 1000, **data}

    def refus(self):
        """Why his screen cannot take a photo now ('' when it can): a cast covers it, an exercise is open."""
        c = self.hub.s.get("cast")
        if isinstance(c, dict) and c.get("id") and (not c.get("until") or c["until"] > self.clock() * 1000):
            return "quelque chose est casté sur mon écran : arrête-le d'abord !"
        ex = getattr(self.hub, "exos", None)
        if ex is not None and getattr(ex, "cur", None):
            return "finis d'abord ton exo, et je prends la pose !"
        return ""

    # ---- the actions ----
    def photo(self):
        why = self.refus()
        if why:
            self.hub.toast("Pas de photo : " + why, 4000)
            return False
        self.demande = {"id": secrets.token_urlsafe(6), "t0": self.clock() * 1000}
        self.hub.s["anim"] = None
        self.hub.s["screen"] = "visage"                # he poses on his face screen
        return True

    def fav(self, id, on=None):
        e = next((e for e in self.photos if e["id"] == id), None)
        if not e:
            return False
        v = (not e["fav"]) if on is None else on is True
        if v and not e["fav"] and sum(1 for x in self.photos if x["fav"]) >= FAV_MAX:
            self.hub.toast(f"{FAV_MAX} photos préférées au plus : enlève une étoile d'abord.", 5000)
            return False
        e["fav"] = v
        self.save()
        return True

    def supprime(self, id):
        e = next((e for e in self.photos if e["id"] == id), None)
        if not e:
            return False
        self._drop(e)
        self.save()
        return True

    def montre(self):
        if not self.photos:
            self.hub.toast("Pas encore de photo dans mon album : dis « prends une photo » !", 5000)
            return False
        ex = getattr(self.hub, "exos", None)
        if ex is not None and getattr(ex, "cur", None):
            self.hub.toast("Finis d'abord ton exo, et je te montre mon album !", 4000)
            return False
        self._event("montre")
        self.hub.s["anim"] = None
        self.hub.s["screen"] = "visage"
        return True

    def tick(self):
        if self.demande and self.clock() * 1000 - self.demande["t0"] > DEMANDE_S * 1000:
            self.demande = None
            self.hub.toast("L'écran de Pixel n'a pas pu prendre la photo.", 4000)
            self.publish()

    # ---- the routes (setup adds them) ----
    @staticmethod
    def fail(status, msg):
        return web.json_response({"ok": False, "error": msg}, status=status)

    async def upload(self, request, token):
        """POST /api/album: {"ok": true, "photo": {...}} or {"ok": false, "error": "..."} (in French)."""
        if not has_access(request, token):
            return self.fail(403, "Code d'accès manquant : scanne à nouveau le QR code de Pixel.")
        ct = request.content_type
        if ct not in ("image/jpeg", "image/webp"):
            return self.fail(415, "Une photo de Pixel : JPEG ou WebP.")
        if request.content_length is not None and request.content_length > MAX_BYTES:
            return self.fail(413, "Photo trop lourde.")
        now = self.clock()
        self.sent = [x for x in self.sent if 0 <= now - x < 60]
        if len(self.sent) >= PER_MIN:
            return self.fail(429, "Trop de photos d'un coup.")
        data = bytearray()
        try:
            while chunk := await request.content.read(32 * 1024):
                data += chunk
                if len(data) > MAX_BYTES:
                    return self.fail(413, "Photo trop lourde.")
        except Exception:
            return self.fail(400, "Photo illisible.")
        dims = dimensions(bytes(data))
        if not dims or MIME[dims[0]] != ct:
            return self.fail(415, "Ce n'est pas une photo de Pixel (JPEG ou WebP).")
        ext, w, h = dims
        if not (MIN_SIDE <= w <= MAX_W and MIN_SIDE <= h <= MAX_H):
            return self.fail(415, "Photo de la mauvaise taille.")
        raison = request.query.get("raison", "photo")
        raison = raison if RAISON.match(raison) else "photo"
        self.sent.append(now)
        name = secrets.token_urlsafe(12) + "." + ext
        tmp = self.dir / f".up-{secrets.token_hex(8)}"
        try:
            tmp.write_bytes(bytes(data))
            os.replace(tmp, self.dir / name)
        except OSError:
            tmp.unlink(missing_ok=True)
            return self.fail(500, "Pixel n'a pas pu ranger la photo.")
        e = {"id": secrets.token_urlsafe(6), "f": name, "t": now * 1000, "raison": raison, "fav": False, "w": w, "h": h, "size": len(data)}
        self.photos.insert(0, e)
        self.prune()
        self.save()
        if self.demande and raison == "photo":
            self.demande = None
        self._event("photo", photo=e["id"], raison=raison)
        S = getattr(self.hub, "souvenirs", None)
        if S is not None and raison != "photo":
            S.lier_photo(raison, e["id"])
        self.publish()
        log.info("album: %s (%s, %d Ko)", name, raison, len(data) // 1024)
        return web.json_response({"ok": True, "photo": {"id": e["id"], "src": "/album/" + name, "t": e["t"], "raison": raison}})

    async def file(self, request, token):
        """GET /album/NAME: one of the photos, with its real type (checked on the way in)."""
        name = request.match_info["name"]
        if not has_access(request, token):
            raise web.HTTPForbidden(text="Code d'accès manquant.")
        e = next((e for e in self.photos if e["f"] == name), None) if NAME.match(name) else None
        if not e or not (self.dir / name).is_file():
            raise web.HTTPNotFound(text="Cette photo n'est plus dans l'album.")
        headers = {"Content-Type": MIME[name.rsplit(".", 1)[1]], "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=86400",
                   "Content-Security-Policy": "default-src 'none'; sandbox"}
        if request.query.get("dl"):
            stamp = time.strftime("%Y-%m-%d-%Hh%M", time.localtime(e["t"] / 1000))
            headers["Content-Disposition"] = f'attachment; filename="pixel-{stamp}.{name.rsplit(".", 1)[1]}"'
        return web.FileResponse(self.dir / name, headers=headers)


def setup(hub, app=None, datadir=None, token="", clock=time.time):
    """The album: its actions, its routes (when app is given), a tick every 2 s (a photo asked and never taken).
    hub.album: for the commands and Claude (pixel/souvenirs.py)."""
    datadir = Path(datadir) if datadir else Path(os.path.expanduser(hub.cfg.get("data_dir", "~/.config/pixel")))
    A = Album(hub, datadir, clock)
    hub.album = A

    @hub.action("album.photo")
    async def photo():
        """A photo now: his screen poses (« Cheese ! »), the flash, « Clic ! »."""
        if A.photo():
            A.publish()

    @hub.action("album.fav")
    async def fav(id=None, on=None):
        """★ a favourite (FAV_MAX at most): never pruned."""
        if A.fav(id, on if isinstance(on, bool) else None):
            A.publish()

    @hub.action("album.supprime")
    async def supprime(id=None):
        if A.supprime(id):
            A.publish()

    @hub.action("album.montre")
    async def montre():
        """His screen shows the album (« montre l'album »)."""
        if A.montre():
            A.publish()

    async def upload(request):
        return await A.upload(request, token)

    async def file(request):
        return await A.file(request, token)

    if app is not None:
        app.router.add_post("/api/album", upload)
        app.router.add_get("/album/{name}", file)

    async def tick():
        A.tick()

    try:
        A.task = asyncio.get_running_loop().create_task(hub.every(2, tick, 2))
    except RuntimeError:                               # no loop (tests): they call tick() themselves
        A.task = None
    return A
