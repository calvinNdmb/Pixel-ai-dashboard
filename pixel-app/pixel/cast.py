"""Casting to Pixel's screen ("caster sur Pixel"): a photo, a GIF, a video, a short text or a link from a phone.

    POST /api/cast    a file (multipart: file, plus raw, seconds, title), or JSON {"text": ...} / {"url": ..., "title": ...}:
                      the phone app's Caster panel, an iOS Shortcut, curl. Answers JSON.
    POST /share       the Android share sheet (Web Share Target of the installed app: web/manifest.webmanifest, web/sw.js):
                      the same fields (title, text, url, media), then 303 back to the app, /?cast=ok or why it failed
    GET  /cast/NAME   the files, kept under random names in the data folder (cast/); only the last few stay

Same access rule as the WebSocket: the Pi itself, or the access code (?t=, the X-Pixel-Token header, or the app's pixel_t
cookie), on the home network only (server.home_only). The state's "cast" is what shows: the screens draw it over whatever
screen is open (web/screens.js), until it ends by itself (pictures and texts after [cast] seconds, videos at their end),
a touch on the screen, or cast.stop. "cast_recent" lists the last ones, to show them again.
Pixel never fetches a link: that would let anyone who can cast probe the home network from the Pi. A picture or video
link is loaded by the screen's own browser, YouTube and Vimeo play in their player, any other page becomes a card with
a QR code to open it on the phone.
"""
import asyncio
import json
import logging
import re
import secrets
import time
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from aiohttp import web

from . import youtube

log = logging.getLogger("pixel")
LOCAL = {"127.0.0.1", "::1"}
MB = 1024 * 1024
# the ISO media (MP4) brands of phone and camera videos ("qt  ": an iPhone's .mov), not the still pictures in the same box (HEIC, AVIF)
MP4 = {b"isom", b"iso2", b"iso4", b"iso5", b"iso6", b"mp41", b"mp42", b"avc1", b"M4V ", b"M4VH", b"M4VP", b"dash", b"mmp4", b"MSNV",
       b"3gp4", b"3gp5", b"3gp6", b"3g2a", b"qt  "}
NAME = re.compile(r"^[A-Za-z0-9_-]{16}\.(png|jpg|gif|webp|mp4|webm)$")      # what secrets.token_urlsafe(12) makes, and nothing else
MIME = {"png": "image/png", "jpg": "image/jpeg", "gif": "image/gif", "webp": "image/webp", "mp4": "video/mp4", "webm": "video/webm"}
ITEM = ("kind", "src", "text", "url", "title", "embed", "site", "yt")       # what a cast is made of (and what "again" shows again)
BAD_TYPE = "Format non pris en charge. Photos : JPEG, PNG, GIF, WebP. Vidéos : MP4, WebM."
NOTHING = "Rien à afficher : choisis une photo, une vidéo, un lien ou un texte."
MAX_LIVE = 4 * 3600e3                       # a video or a YouTube link nobody stops: gone after 4 hours anyway


class CastError(Exception):
    """What went wrong, in French for the phone, with its HTTP status and the word /share puts in ?cast=."""
    def __init__(self, status, msg, code):
        super().__init__(msg)
        self.status, self.code = status, code


def sniff(head):
    """(extension, kind) from the file's first bytes, never from its name or from what the phone says; None for anything else.
    kind: image, gif (an animation: GIF, animated WebP) or video."""
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png", "image"
    if head.startswith(b"\xff\xd8\xff"):
        return "jpg", "image"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return "gif", "gif"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp", "gif" if head[12:16] == b"VP8X" and len(head) > 20 and head[20] & 2 else "image"   # VP8X flag 2: animated
    if head[:4] == b"\x1a\x45\xdf\xa3" and b"webm" in head[:64]:     # EBML with the DocType webm (not just any Matroska)
        return "webm", "video"
    if head[4:8] == b"ftyp" and head[8:12] in MP4:
        return "mp4", "video"
    return None


def local_page(request):
    """The Pi itself, from Pixel's own page: a page of another site shown on the screen (a video player) is not Pixel."""
    if request.remote not in LOCAL:
        return False
    origin = request.headers.get("Origin")
    return not origin or origin == "null" or urlsplit(origin).netloc.lower() == (request.host or "").lower()


def has_access(request, token):
    """The Pi itself, or the access code: ?t=, the X-Pixel-Token header, or the app's pixel_t cookie (SameSite=Strict:
    another site's page never sends it). The code is the WebSocket's (server.py)."""
    if local_page(request):
        return True
    given = (request.query.get("t"), request.headers.get("X-Pixel-Token"), request.cookies.get("pixel_t"))
    return any(g and secrets.compare_digest(g.encode(), token.encode()) for g in given)


def clean_url(s):
    """A link to show: http or https, a host, no password in it, 2000 characters at most. None otherwise."""
    s = str(s or "").strip()
    if not s or len(s) > 2000 or re.search(r"[\s\"'<>\\]", s):
        return None
    try:
        p = urlsplit(s)
        ok = p.scheme.lower() in ("http", "https") and p.hostname and p.username is None and p.password is None
    except ValueError:
        return None
    return s if ok else None


def first_url(text):
    """The first web address in a shared text ("Regarde ça https://youtu.be/..."): Android often puts the link there."""
    m = re.search(r"https?://[^\s<>\"']+", str(text or ""))
    return m.group(0).rstrip(".,;:!?)»") if m else ""


def classify(url):
    """What a link shows, from its address alone: a picture, an animation or a video file (the screen loads it), a YouTube or
    Vimeo video (their player, with its embed address), or a page (a card)."""
    p = urlsplit(url)
    host, path, q = (p.hostname or "").lower().removeprefix("www.").removeprefix("m."), p.path, parse_qs(p.query)
    last = path.rsplit("/", 1)[-1]
    ext = last.rsplit(".", 1)[-1].lower() if "." in last else ""
    if ext in ("jpg", "jpeg", "png", "webp"):
        return {"kind": "image"}
    if ext == "gif":
        return {"kind": "gif"}
    if ext in ("mp4", "m4v", "mov", "webm"):
        return {"kind": "video"}
    yt = youtube.parse(url)                         # a video, a playlist, a short, YouTube Music (pixel/youtube.py)
    if yt:
        it = youtube.item(yt)
        return {"kind": "link", "site": it["site"], "embed": it["embed"], "yt": yt}
    m = re.match(r"^/(?:video/)?(\d{5,12})(?:/([0-9a-f]{6,20}))?/?$", path) if host in ("vimeo.com", "player.vimeo.com") else None
    if m:
        h = m.group(2) or (q.get("h") or [""])[0]
        return {"kind": "link", "site": "Vimeo", "embed": f"https://player.vimeo.com/video/{m.group(1)}?autoplay=1"
                f"{f'&h={h}' if re.fullmatch(r'[0-9a-f]{6,20}', h) else ''}"}
    return {"kind": "link"}


def _flag(v):
    return str(v).strip().lower() in ("1", "true", "on", "oui", "yes")


class Cast:
    def __init__(self, hub, cfg, datadir, token, qr):
        self.hub, self.token, self.qr = hub, token, qr           # qr: server.qr_rows (segno), for the cards of pages
        self.dir = Path(datadir) / "cast"
        self.dir.mkdir(parents=True, exist_ok=True)
        self.max = max(1, int(float(cfg.get("max_mb", 40)) * MB))   # the biggest file, in bytes
        self.secs = max(0, int(cfg.get("seconds", 120)))           # how long a picture or a text stays (0: until stopped)
        self.keep = max(1, int(cfg.get("keep", 8)))                # the files kept, and the casts offered again
        for f in self.dir.glob(".up-*"):                           # uploads cut short by a restart
            f.unlink(missing_ok=True)
        hub.s["cast"] = None
        hub.s["cast_recent"] = self._load()
        hub.s["settings"]["cast"] = {"max_mb": round(self.max / MB, 1), "seconds": self.secs}

        @hub.action("cast.stop")
        async def stop():
            self.stop()

        @hub.action("cast.text")
        async def text(text, seconds=None):
            self._try(self.show_text, text, seconds)

        @hub.action("cast.link")
        async def link(url, title="", seconds=None, raw=False):
            self._try(self.show_link, url, title, seconds, raw)

        @hub.action("cast.again")
        async def again(id, raw=None):
            """One of the last casts, shown again (the phone's list)."""
            e = next((e for e in hub.s["cast_recent"] if e.get("id") == id), None)
            if e and e.get("src", "").startswith("/cast/") and not (self.dir / e["src"][6:]).is_file():
                self._prune()
                e = None
            if not e:
                return hub.toast("Ce cast n'est plus sur Pixel.", 3000)
            self._start({k: e[k] for k in ITEM if k in e}, raw=_flag(raw) if raw is not None else False)

        @hub.action("cast.end")
        async def end(id, error=""):
            """Pixel's screen says the video is over, or that it could not read the picture or the video."""
            c = hub.s.get("cast")
            if c and c["id"] == id:
                self.stop()
                if error:
                    hub.toast({"video": "Pixel n'arrive pas à lire cette vidéo (format ?).",
                               "image": "Pixel n'arrive pas à afficher cette image."}.get(str(error), "Pixel n'arrive pas à l'afficher."), 4000)

        @hub.action("cast.colors")
        async def colors(raw=None):
            """Rétro: the picture in the tube's green, or in its own colours."""
            c = hub.s.get("cast")
            if c:
                c["raw"] = (not c["raw"]) if raw is None else _flag(raw)

    # ---- what shows ----
    def _try(self, fn, *a):
        try:
            fn(*a)
        except CastError as e:
            self.hub.toast(str(e), 4000)

    def _seconds(self, v):
        try:
            return self.secs if v is None or str(v).strip() == "" else max(0, min(3600, int(float(v))))
        except (TypeError, ValueError):
            return self.secs

    def _start(self, item, seconds=None, raw=False):
        """Shows item now, over whatever screen is open; pictures, texts and pages for a while, videos until their end."""
        now, secs = time.time() * 1000, self._seconds(seconds)
        timed = item["kind"] in ("image", "gif", "text", "ytcode") or (item["kind"] == "link" and not item.get("embed"))
        c = {**item, "id": secrets.token_urlsafe(6), "t0": now, "until": now + secs * 1000 if timed and secs else 0, "raw": bool(raw)}
        if c["kind"] == "link" and (not c.get("embed") or c.get("yt")):    # YouTube too: to open it on a phone (if it cannot play here)
            c["qr"] = self._qr(youtube.watch_url(c["yt"]) if c.get("yt") else c["url"])
        self.hub.s["cast"] = c
        if item["kind"] != "ytcode":                        # the YouTube TV code (pixel/ytcast.py) is not one to show again
            self._remember(item)
        self.hub.mark()
        log.info("cast %s %s", c["kind"], c.get("src") or c.get("url") or "")
        return c

    def _qr(self, url):
        try:
            return self.qr(url)
        except Exception:                                   # too long for a QR code: the card shows the address alone
            return None

    def show_text(self, text, seconds=None):
        lines = [re.sub(r"\s+", " ", ln).strip() for ln in str(text or "").replace("\r", "").split("\n")]
        t = "\n".join(ln for ln in lines if ln)[:400].strip()
        if not t:
            raise CastError(400, "Écris d'abord quelque chose.", "vide")
        if len(t) > 280:
            t = t[:279].rstrip() + "…"
        return self._start({"kind": "text", "text": t, "title": "Message"}, seconds)

    def show_link(self, url, title="", seconds=None, raw=False):
        u = clean_url(url)
        if not u:
            raise CastError(400, "Ce lien n'est pas une adresse web (http:// ou https://).", "lien")
        what, p = classify(u), urlsplit(u)
        site = what.get("site") or (p.hostname or "").removeprefix("www.")
        tail = [s for s in p.path.split("/") if s]
        default = youtube.item(what["yt"])["title"] if what.get("yt") else f"Vidéo {site}" if what.get("embed") else (tail[-1] if tail and what["kind"] != "link" else site + ("/" + tail[-1] if tail else ""))
        item = {"kind": what["kind"], "url": u, "site": site, "title": str(title or "").strip()[:200] or default[:200]}
        if what["kind"] != "link":
            item["src"] = u                                 # a picture or a video: the screen's browser loads it
        if what.get("embed"):
            item["embed"] = what["embed"]
        if what.get("yt"):
            item["yt"] = what["yt"]
        return self._start(item, seconds, raw)

    def stop(self):
        if self.hub.s.get("cast"):
            self.hub.s["cast"] = None
            self.hub.mark()

    async def tick(self):
        c, now = self.hub.s.get("cast"), time.time() * 1000
        if c and ((c["until"] and now >= c["until"]) or now - c["t0"] > MAX_LIVE):
            self.stop()

    # ---- the last casts (cast/recent.json) and the files ----
    def _load(self):
        try:
            recent = json.loads((self.dir / "recent.json").read_text())
        except (OSError, ValueError):
            return []
        ok = [e for e in recent if isinstance(e, dict) and isinstance(e.get("id"), str) and e.get("kind") in ("image", "gif", "video", "text", "link")]
        return [e for e in ok if not str(e.get("src", "")).startswith("/cast/") or (NAME.match(e["src"][6:]) and (self.dir / e["src"][6:]).is_file())][:self.keep]

    def _save(self):
        try:
            (self.dir / "recent.json").write_text(json.dumps(self.hub.s["cast_recent"], ensure_ascii=False))
        except OSError:
            log.warning("cast: cannot save the last casts")

    def _remember(self, item):
        key = lambda e: e.get("src") or e.get("url") or "t:" + e.get("text", "")     # noqa: E731
        recent = self.hub.s["cast_recent"]
        old = next((e for e in recent if key(e) == key(item)), None)
        entry = {**{k: item[k] for k in ITEM if k in item}, "id": old["id"] if old else secrets.token_urlsafe(6), "at": time.time() * 1000}
        self.hub.s["cast_recent"] = [entry] + [e for e in recent if e is not old][:self.keep - 1]
        self._save()

    def _prune(self):
        """Only the last few files stay; the list forgets the ones that are gone."""
        files = sorted((f for f in self.dir.iterdir() if NAME.match(f.name)), key=lambda f: f.stat().st_mtime, reverse=True)
        for f in files[self.keep:]:
            f.unlink(missing_ok=True)
        self.hub.s["cast_recent"] = [e for e in self.hub.s["cast_recent"]
                                     if not e.get("src", "").startswith("/cast/") or (self.dir / e["src"][6:]).is_file()]
        self._save()

    def too_big(self):
        return f"Fichier trop gros : {round(self.max / MB, 1):g} Mo au plus."

    async def _store(self, part):
        """One file to disk as it arrives, under a random name. Its first bytes say what it is (anything else is refused at
        once), and it stops at the size limit. Returns (name, kind, size)."""
        tmp, head, size, kind = self.dir / f".up-{secrets.token_hex(8)}", b"", 0, None
        try:
            with open(tmp, "wb") as f:
                while chunk := await part.read_chunk(256 * 1024):
                    size += len(chunk)
                    if size > self.max:
                        raise CastError(413, self.too_big(), "trop-gros")
                    if kind is None:
                        head += chunk[:64]
                        if len(head) >= 64 and not (kind := sniff(head)):
                            raise CastError(415, BAD_TYPE, "format")
                    await asyncio.to_thread(f.write, chunk)      # the SD card is slow: the screens and the keys go on meanwhile
            if not size:
                raise CastError(400, NOTHING, "vide")
            if kind is None and not (kind := sniff(head)):
                raise CastError(415, BAD_TYPE, "format")
            name = secrets.token_urlsafe(12) + "." + kind[0]
            tmp.replace(self.dir / name)
            return name, kind[1], size
        finally:
            tmp.unlink(missing_ok=True)

    @staticmethod
    async def _field(part, limit=8192):
        data = bytearray()
        while chunk := await part.read_chunk(4096):
            data += chunk
            if len(data) > limit:
                raise CastError(413, "Texte trop long.", "vide")
        return data.decode("utf-8", "replace"), len(data)

    async def _receive(self, request):
        """The cast in a request: JSON {text} / {url, title}, a plain form (an iOS Shortcut), or a multipart form (a file, or the
        share sheet's title, text, url)."""
        if request.content_type == "application/x-www-form-urlencoded":
            try:
                return self._from(dict(await request.post()))      # aiohttp caps it at 1 Mo
            except CastError:
                raise
            except Exception:
                raise CastError(400, "Requête illisible.", "vide")
        if request.content_type == "application/json":
            try:
                d = await request.json()
            except Exception:
                raise CastError(400, "Requête illisible.", "vide")
            return self._from(d if isinstance(d, dict) else {})
        if request.content_type != "multipart/form-data":
            raise CastError(415, "Envoie un fichier (multipart/form-data), un formulaire ou du JSON.", "format")
        if request.content_length and request.content_length > self.max + 64 * 1024:
            raise CastError(413, self.too_big(), "trop-gros")
        reader, fields, up, total = await request.multipart(), {}, None, 0
        try:
            while (part := await reader.next()) is not None:
                if not hasattr(part, "read_chunk"):              # a form inside the form: not ours
                    raise CastError(400, NOTHING, "vide")
                if part.filename is not None and up is None:
                    up = await self._store(part)
                    total += up[2]
                elif part.filename is not None:                  # a second file: only the first one shows
                    while chunk := await part.read_chunk(256 * 1024):
                        total += len(chunk)
                        if total > self.max + 64 * 1024:
                            raise CastError(413, self.too_big(), "trop-gros")
                else:
                    v, n = await self._field(part)
                    total += n
                    if part.name:
                        fields[part.name] = v
            return self._from(fields, up)
        except BaseException:
            if up:
                (self.dir / up[0]).unlink(missing_ok=True)
            raise

    def _from(self, d, up=None):
        title, seconds, raw = str(d.get("title") or "").strip()[:200], d.get("seconds"), _flag(d.get("raw"))
        if up:
            name, kind, _ = up
            c = self._start({"kind": kind, "src": "/cast/" + name, "title": title or {"image": "Photo", "gif": "Animation", "video": "Vidéo"}[kind]},
                            seconds, raw)
            self._prune()
            return c
        text = str(d.get("text") or "").strip()
        url = str(d.get("url") or "").strip() or first_url(text)
        if url:
            rest = text.replace(url, "").strip(" \n-–—:")
            return self.show_link(url, title or rest, seconds, raw)
        if text:
            return self.show_text(text, seconds)
        raise CastError(400, NOTHING, "vide")

    # ---- the routes (server.py adds them) ----
    async def api(self, request):
        """POST /api/cast: {"ok": true, "cast": {id, kind, title}} or {"ok": false, "error": "..."}."""
        if not has_access(request, self.token):
            return web.json_response({"ok": False, "error": "Code d'accès manquant : ouvre l'appli avec le QR code de Pixel."}, status=403)
        try:
            c = await self._receive(request)
        except CastError as e:
            return web.json_response({"ok": False, "error": str(e)}, status=e.status)
        return web.json_response({"ok": True, "cast": {k: c[k] for k in ("id", "kind", "title")}})

    async def share(self, request):
        """POST /share: what the Android share sheet gives the installed app, then back to the app (303), which says how it went."""
        if not has_access(request, self.token):
            raise web.HTTPSeeOther("/?cast=acces")
        try:
            await self._receive(request)
        except CastError as e:
            raise web.HTTPSeeOther("/?cast=" + e.code)
        raise web.HTTPSeeOther("/?cast=ok")

    async def file(self, request):
        """GET /cast/NAME: one of the files, with its real type (it was checked on the way in)."""
        name = request.match_info["name"]
        if not has_access(request, self.token):
            raise web.HTTPForbidden(text="Code d'accès manquant.")
        if not NAME.match(name) or not (self.dir / name).is_file():
            raise web.HTTPNotFound(text="Ce fichier n'est plus sur Pixel.")
        return web.FileResponse(self.dir / name, headers={"Content-Type": MIME[name.rsplit(".", 1)[1]], "X-Content-Type-Options": "nosniff",
                                                          "Cache-Control": "private, max-age=3600", "Content-Security-Policy": "default-src 'none'; sandbox"})
