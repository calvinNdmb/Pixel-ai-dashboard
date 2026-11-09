"""YouTube on Pixel's screen: its links, and the remote control of Pixel's player, from the phone and from the YouTube app.

The video plays in YouTube's own player (the IFrame Player API, web/ytplayer.js), over the canvas of Pixel's screen. The
server never plays nor fetches anything. A YouTube cast (pixel/cast.py) carries:
    yt    what to play, from the link alone: {id, list, start, music} (parse)
    ytp   the remote control: {src: "lien" (a link) or "appli" (the YouTube app, pixel/ytcast.py), v: the video's load number
          (the YouTube app changes the video of the same cast), n and cmds: the last orders, numbered, each run once by
          Pixel's player, st: what the player last said, with "at" (server ms) to work out where it is now}

    yt.play, yt.pause, yt.toggle            the phone's ⏯
    yt.seek {by: ±10} or {to: seconds}      ±10 s, or a place in the video
    yt.volume {level: 0-100} or {by: ±10}, yt.mute {on}
    yt.report {id, vid, state, pos, dur, vol, muted, title, err}   from Pixel's player. state: YouTube's -1 (not started),
                                            0 (over), 1 (playing), 2 (paused), 3 (buffering), 5 (cued); err: YouTube's error
                                            code (2, 5, 100, 101, 150, 152, 153), or "api" (YouTube does not answer)
    yt.ended {id}                           from Pixel's player: the video (the last one of a playlist) is over
"""
import re
import time
from urllib.parse import parse_qs, urlsplit

ID = re.compile(r"[A-Za-z0-9_-]{11}")
LIST = re.compile(r"[A-Za-z0-9_-]{2,64}")
HOSTS = {"youtube.com", "music.youtube.com", "youtube-nocookie.com", "youtu.be"}
PRIVATE = {"WL", "LL"}                     # "À regarder plus tard", "J'aime": only their owner sees them, not a player
DEFAULT = ("Vidéo YouTube", "Vidéo YouTube Music", "Playlist YouTube")
ERROR_SHOWN = 90_000                       # an error stays on Pixel's screen 1 min 30 s (with its QR code), unless stopped


def start_s(v):
    """t=, start=: 90, 90s, 1m30s, 1h2m3s, 1:30, 1:02:03 -> seconds (0 for anything else), a day at most."""
    v = str(v or "").strip().lower()
    m = re.fullmatch(r"(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?", v) if v else None
    if m:
        s = int(m.group(1) or 0) * 3600 + int(m.group(2) or 0) * 60 + int(m.group(3) or 0)
    elif m := re.fullmatch(r"(?:(\d+):)?(\d{1,2}):(\d{2})", v):
        s = int(m.group(1) or 0) * 3600 + int(m.group(2)) * 60 + int(m.group(3))
    else:
        s = 0
    return min(s, 86400)


def parse(url):
    """The video and the playlist a YouTube link shows, from its address alone (never fetched); None if it is not one.
    {"id": 11 characters or "" (a playlist alone), "list": a playlist or "", "start": seconds, "music": YouTube Music}.
    youtube.com/watch?v=, m., music., youtube-nocookie.com, /shorts/, /live/, /embed/, /v/, youtu.be/, /playlist?list=,
    t= or start= (also after #)."""
    try:
        p = urlsplit(str(url or "").strip())
        host = (p.hostname or "").lower()
    except ValueError:
        return None
    if p.scheme.lower() not in ("http", "https"):
        return None
    host = host.removeprefix("www.").removeprefix("m.")
    if host not in HOSTS:
        return None
    q, path = parse_qs(p.query), re.sub(r"/+", "/", p.path)
    one = lambda k: (q.get(k) or [""])[0]      # noqa: E731
    if host == "youtu.be":
        vid = path.strip("/").split("/")[0]
    elif path.rstrip("/") == "/watch":
        vid = one("v")
    else:
        m = re.match(r"^/(?:shorts|embed|live|v|e)/([^/]+)", path)
        vid = m.group(1) if m and m.group(1) != "videoseries" else ""      # "videoseries" has 11 letters too
    vid = vid if ID.fullmatch(vid) else ""
    lst = one("list") if LIST.fullmatch(one("list")) and one("list") not in PRIVATE else ""
    if not vid and not lst:
        return None
    frag = parse_qs(p.fragment)
    start = start_s(one("t") or one("start") or (frag.get("t") or [""])[0]) if vid else 0
    return {"id": vid, "list": lst, "start": start, "music": host == "music.youtube.com"}


def watch_url(yt):
    """Its address on YouTube, short, for the QR code (to open it on a phone)."""
    if not yt.get("id"):
        return f"https://www.youtube.com/playlist?list={yt['list']}"
    base = "https://music.youtube.com" if yt.get("music") else "https://www.youtube.com"
    return f"{base}/watch?v={yt['id']}" + (f"&list={yt['list']}" if yt.get("list") else "") + (f"&t={yt['start']}s" if yt.get("start") else "")


def embed_url(yt):
    """YouTube's player without cookies (youtube-nocookie.com), the IFrame API on (enablejsapi); Pixel's screen adds its origin."""
    return (f"https://www.youtube-nocookie.com/embed/{yt.get('id') or 'videoseries'}?autoplay=1&playsinline=1&rel=0&enablejsapi=1"
            + (f"&start={yt['start']}" if yt.get("start") else "") + (f"&list={yt['list']}" if yt.get("list") else ""))


def item(yt, title=""):
    """A YouTube cast, for cast.py (_start): a link, with its player."""
    site = "YouTube Music" if yt.get("music") else "YouTube"
    return {"kind": "link", "site": site, "url": watch_url(yt), "title": str(title or "").strip()[:200] or (f"Vidéo {site}" if yt.get("id") else "Playlist YouTube"),
            "embed": embed_url(yt), "yt": yt}


def _num(v, lo, hi, default=None):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return default
    return default if v != v else max(lo, min(hi, v))          # NaN


class Player:
    """The remote control of Pixel's YouTube player: the hub actions yt.*, for the phone and the YouTube app (pixel/ytcast.py)."""

    def __init__(self, hub, cast):
        self.hub, self.cast = hub, cast
        self.app = None                 # pixel/ytcast.py, when it is on: hears what the player does, plays the next video

        @hub.action("yt.play")
        async def play():
            self.order("play")

        @hub.action("yt.pause")
        async def pause():
            self.order("pause")

        @hub.action("yt.toggle")
        async def toggle():
            c = self.current()
            st = c and self.ytp(c)["st"]
            self.order("play" if st and st.get("state") in (0, 2, 5, -1) else "pause")

        @hub.action("yt.seek")
        async def seek(by=None, to=None):
            c = self.current()
            if not c:
                return
            t = _num(to, 0, 86400) if to is not None else max(0.0, self.pos(c) + _num(by, -3600, 3600, 0))
            if t is not None:
                self.order("seek", to=round(t, 1))

        @hub.action("yt.volume")
        async def volume(level=None, by=None):
            c = self.current()
            if c:
                st = self.ytp(c)["st"] or {}
                v = _num(level, 0, 100) if level is not None else _num((st.get("vol") if st.get("vol") is not None else 100) + _num(by, -100, 100, 0), 0, 100)
                if v is not None:
                    self.order("volume", level=round(v))

        @hub.action("yt.mute")
        async def mute(on=None):
            c = self.current()
            if c:
                st = self.ytp(c)["st"] or {}
                self.order("mute", on=(not st.get("muted")) if on is None else str(on).lower() in ("1", "true", "on", "oui"))

        @hub.action("yt.report")
        async def report(id, vid="", state=-1, pos=0, dur=0, vol=None, muted=None, title="", err=None, **_):
            self.report(id, vid, state, pos, dur, vol, muted, title, err)

        @hub.action("yt.ended")
        async def ended(id):
            c = self.current()
            if not c or c["id"] != id:
                return
            if self.ytp(c)["src"] == "appli" and self.app and self.app.ended(c):
                return                  # the YouTube app plays the next one of its list, or ends the cast
            self.cast.stop()

    # ---- the cast that plays ----
    def current(self):
        c = self.hub.s.get("cast")
        return c if c and c.get("yt") else None

    @staticmethod
    def ytp(c):
        return c.setdefault("ytp", {"src": "lien", "v": 1, "n": 0, "cmds": [], "st": None})

    def pos(self, c):
        """Where the video is now: where the player last said, plus the time since, if it plays."""
        st = self.ytp(c)["st"]
        if not st:
            return float(c["yt"].get("start") or 0)
        p = st.get("pos") or 0
        if st.get("state") == 1:
            p += max(0.0, time.time() * 1000 - st.get("at", 0)) / 1000
        return min(p, st["dur"]) if st.get("dur") else p

    def order(self, op, **kw):
        """An order for Pixel's player (the phone's, or the YouTube app's). What it will do shows on the phone at once."""
        c = self.current()
        if not c:
            return False
        p = self.ytp(c)
        p["n"] += 1
        p["cmds"] = (p["cmds"] + [{"n": p["n"], "op": op, **kw}])[-8:]
        st = p["st"] = dict(p["st"] or {"state": -1, "pos": float(c["yt"].get("start") or 0), "dur": 0})
        if op in ("play", "pause"):
            st.update(pos=self.pos(c), state=1 if op == "play" else 2)
        elif op == "seek":
            st["pos"] = min(kw["to"], st["dur"]) if st.get("dur") else kw["to"]
        elif op == "volume":
            st.update(vol=kw["level"], muted=False if kw["level"] > 0 else st.get("muted", False))
        elif op == "mute":
            st["muted"] = kw["on"]
        st["at"] = time.time() * 1000
        self.hub.mark()
        return True

    def report(self, id, vid, state, pos, dur, vol, muted, title, err):
        """What Pixel's player says: kept for the phone (and the YouTube app), its title, its errors."""
        c = self.current()
        if not c or c["id"] != id:
            return
        p = self.ytp(c)
        st = {"state": int(_num(state, -1, 5, -1)), "pos": _num(pos, 0, 86400, 0), "dur": _num(dur, 0, 86400, 0), "at": time.time() * 1000,
              "vid": vid if isinstance(vid, str) and ID.fullmatch(vid) else c["yt"].get("id", "")}
        if vol is not None:
            st["vol"] = round(_num(vol, 0, 100, 100))
        if muted is not None:
            st["muted"] = bool(muted)
        if err == "api" or (isinstance(err, int) and not isinstance(err, bool) and 0 < err < 1000):
            st["err"] = err
            now = time.time() * 1000
            c["until"] = min(c["until"] or now + ERROR_SHOWN, now + ERROR_SHOWN)
        title = re.sub(r"\s+", " ", str(title or "")).strip()[:200]
        if title and c["title"] in DEFAULT:
            c["title"] = title
            for e in self.hub.s.get("cast_recent", []):
                if e.get("url") == c.get("url") and e.get("title") in DEFAULT:
                    e["title"] = title
                    self.cast._save()
        p["st"] = st
        if self.app and p["src"] == "appli":
            self.app.state(c)
        self.hub.mark()

    def from_app(self, vid, pos=0, lst=""):
        """A video from the YouTube app (pixel/ytcast.py): in the cast already on Pixel's screen if it is the app's, else a new one."""
        yt = {"id": vid, "list": lst if LIST.fullmatch(lst or "") else "", "start": int(_num(pos, 0, 86400, 0)), "music": False}
        new, c = item(yt), self.current()
        if c and self.ytp(c)["src"] == "appli":
            p = c["ytp"]
            c.update({k: new[k] for k in ("site", "url", "title", "embed", "yt")}, until=0, qr=self.cast._qr(new["url"]))
            p["v"] += 1
            p["st"] = None
            self.cast._remember(new)
            self.hub.mark()
            return c
        c = self.cast._start(new)
        c["ytp"] = {"src": "appli", "v": 1, "n": 0, "cmds": [], "st": None}
        return c
