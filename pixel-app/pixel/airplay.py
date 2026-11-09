"""AirPlay on Pixel (optional): the « Recopie de l'écran » of an iPhone, an iPad or a Mac, with UxPlay.

    [airplay]
    enabled = true        # off by default: UxPlay must be installed first (install.sh with PIXEL_AIRPLAY=1, docs/CAST.md)

The server starts UxPlay (https://github.com/FDH2/UxPlay, 1.73 or later) in the desktop session (Wayland: it waits for its
socket), keeps it running (it starts again after a crash, more and more slowly if it crashes at once), and reads what it
writes, line by line. UxPlay has no other way to say what happens: no callback, no D-Bus. Its lines (UxPlay 1.73.7):

    Accepted IPv4 client on socket 23                     a connection (the iPhone's AirPlay menu opens some, to look)
    *** CLIENT MUST NOW ENTER PIN = "4821" AS AIRPLAY PASSWORD      -pin: the code Pixel shows, for the iPhone
    connection request from Marie's iPhone (iPhone14,2) with deviceID = 4A:...   an iPhone starts: its name
    raop_rtp_mirror starting mirroring                    the picture: AirPlay mode
    on_video_play: location = http://...                   -hls: a video from the YouTube app
    on_video_stop / hls video has sent EOS                 that video is over
    Connection closed on socket 23 / Removing connection for socket 23
    ERROR lost connection with client                      the iPhone went away (-reset 5: after 5 s of silence): UxPlay is
                                                           started again, and -nofreeze closes its window (else it keeps the
                                                           last picture full screen over Pixel)

The state's "cast" becomes {kind: "screen", via: "airplay", phase: pin | connecting | live, title, note, code}; UxPlay's own
window, full screen, covers Pixel's while the picture is there. Stopping the cast on Pixel (a touch, the phone's Arrêter,
another cast) restarts UxPlay, which sends the iPhone away. The state's "airplay" is {on, status, client, name, error} for the
phone app: status off, absent (no uxplay), attente (no Wayland session yet), pret, connecte, erreur.
"""
import asyncio
import logging
import os
import re
import secrets
import shutil
import time
from pathlib import Path

log = logging.getLogger("pixel")
PATTERNS = [                                   # (event, pattern): the first one that matches a line wins
    ("pin", re.compile(r'\*\*\* CLIENT MUST NOW ENTER PIN = "(\d{4,8})" AS AIRPLAY PASSWORD')),
    ("connect", re.compile(r"connection request from (.+?) \(([^()]*)\) with deviceID = (\S+)")),
    ("mirror", re.compile(r"raop_rtp_mirror starting mirroring")),
    ("hls", re.compile(r"on_video_play: location = (\S+)")),
    ("hls_end", re.compile(r"on_video_stop|hls video has sent EOS")),
    ("open", re.compile(r"Accepted IPv[46] client on socket (\d+)")),
    ("close", re.compile(r"(?:Connection closed on socket|Removing connection for socket) (\d+)")),
    ("lost", re.compile(r"ERROR lost connection with client")),
]
PIN_S, CONNECT_S = 90, 30                      # how long the code card and the "connecting" card stay without news


def parse(line):
    """(event, groups) for one of UxPlay's lines, or None."""
    for ev, rx in PATTERNS:
        m = rx.search(line)
        if m:
            return ev, m.groups()
    return None


class UxState:
    """What UxPlay's lines say, one after the other: phase idle, pin, connecting or live; the client's name; the code."""
    def __init__(self):
        self.reset()

    def reset(self):
        self.phase, self.client, self.pin, self.what, self.socks = "idle", "", "", "", set()

    def feed(self, line):
        """Returns True when the phase, the client or the code changed."""
        got = parse(line)
        if not got:
            return False
        ev, g = got
        before = (self.phase, self.client, self.pin, self.what)
        if ev == "open":
            self.socks.add(g[0])
        elif ev == "close":
            self.socks.discard(g[0])
            if not self.socks and self.phase != "idle":        # the last connection gone: the iPhone left
                self.reset()
        elif ev == "lost":
            self.reset()
        elif ev == "pin":
            self.phase, self.pin = "pin", g[0]
        elif ev == "connect":
            self.client = g[0].strip()[:60]
            if self.phase != "live":
                self.phase, self.pin = "connecting", ""
        elif ev == "mirror":
            self.phase, self.pin, self.what = "live", "", "mirror"
        elif ev == "hls":
            self.phase, self.pin, self.what = "live", "", self.what or "video"
        elif ev == "hls_end" and self.what == "video":
            self.phase, self.what = ("connecting" if self.client else "idle"), ""
        return (self.phase, self.client, self.pin, self.what) != before


class AirPlay:
    def __init__(self, hub, cfg):
        self.hub, self.on = hub, bool(cfg.get("enabled", False))
        self.name = str(cfg.get("name", "Pixel"))[:40] or "Pixel"
        self.exe = str(cfg.get("uxplay", "uxplay"))
        self.pin, self.hls = bool(cfg.get("pin", True)), bool(cfg.get("hls", True))
        self.size = str(cfg.get("size", "1280x720@60"))
        self.extra = [str(a) for a in cfg.get("args", [])]          # e.g. ["-bt709"] (Pi 4 colours), ["-avdec"] (no hardware decoder)
        self.wayland = str(cfg.get("wayland_display") or os.environ.get("WAYLAND_DISPLAY") or "wayland-0")
        self.runtime = str(cfg.get("runtime_dir") or os.environ.get("XDG_RUNTIME_DIR") or f"/run/user/{os.getuid()}")
        self.retry = float(cfg.get("retry_s", 3))                   # the pause before starting it again (tests: shorter)
        self.quick = 10.0                                           # it stopped sooner than this after starting: something is wrong
        self.st, self.proc, self.card, self.restarting = UxState(), None, None, False
        self.lines = []                                             # its last lines, for the logs when it stops
        hub.s["airplay"] = {"on": self.on, "status": "off" if not self.on else "attente", "client": "", "name": self.name, "error": ""}
        hub.listeners.append(lambda snap: self._watch())

        @hub.action("airplay.stop")
        async def stop():
            """Sends the iPhone away (UxPlay starts again, ready for the next one)."""
            self.kick()

    def command(self):
        exe = shutil.which(self.exe) or (self.exe if Path(self.exe).is_file() and os.access(self.exe, os.X_OK) else None)
        if not exe:
            return None
        # -nofreeze: a client lost (its connection reset) must not leave its last picture full screen over Pixel's touchscreen
        args = [exe, "-n", self.name, "-nh", "-fs", "-vs", "waylandsink", "-s", self.size, "-fps", "30", "-p", "-reset", "5", "-nohold",
                "-nofreeze", "-srgb", "no"] + (["-pin"] if self.pin else []) + (["-hls"] if self.hls else []) + self.extra
        sb = shutil.which("stdbuf")                                 # UxPlay writes with printf: line by line through a pipe
        return [sb, "-oL"] + args if sb else args

    def _status(self, status, error=""):
        a = self.hub.s["airplay"]
        if (a["status"], a["error"]) != (status, error):
            a.update(status=status, error=error)
            self.hub.mark()

    # ---- the cast that goes with it ----
    def _show(self):
        st, now = self.st, time.time() * 1000
        a = self.hub.s["airplay"]
        a["client"] = st.client
        self._status("connecte" if st.phase != "idle" else "pret")
        c = self.hub.s.get("cast")
        mine = c and c.get("via") == "airplay"
        if st.phase == "idle":
            if mine:
                self.hub.s["cast"] = None
            self.card = None
        else:
            who, dev = st.client or "un appareil Apple", st.client or "l'iPhone"
            title, note, until = {
                "pin": ("AirPlay", f"Sur {dev}, tape ce code pour recopier ton écran sur Pixel.", now + PIN_S * 1000),
                "connecting": (f"AirPlay : {who}", f"{dev[0].upper() + dev[1:]} se connecte…", now + CONNECT_S * 1000),
                "live": (f"AirPlay : {who}", "Son écran s'affiche par-dessus Pixel. Pour arrêter : « Arrêter la recopie » sur l'iPhone, ou Arrêter dans l'appli de Pixel.", 0),
            }[st.phase]
            if mine and c.get("phase") == st.phase and c.get("code", "") == st.pin and c.get("title") == title:
                self.card = c
                return self.hub.mark()
            self.card = {"kind": "screen", "via": "airplay", "phase": st.phase, "title": title, "note": note, "code": st.pin,
                         "id": secrets.token_urlsafe(6), "t0": now, "until": until, "raw": False}
            self.hub.s["cast"] = self.card
        self.hub.mark()

    def _watch(self):
        """The picture is there, but its cast is gone from Pixel (a touch, Arrêter, another cast): send the iPhone away."""
        if self.st.phase == "live" and self.card and self.hub.s.get("cast") is not self.card and not self.restarting:
            log.info("AirPlay : arrêté depuis Pixel")
            self.kick()

    def kick(self):
        self.card = None
        if self.proc and self.proc.returncode is None:
            self.restarting = True
            self._stop_proc()

    def _stop_proc(self):
        p = self.proc
        if not p or p.returncode is not None:
            return
        try:
            p.terminate()
        except ProcessLookupError:
            return

        async def hard():
            try:
                await asyncio.wait_for(p.wait(), 3)
            except asyncio.TimeoutError:
                try:
                    p.kill()
                except ProcessLookupError:
                    pass
        asyncio.ensure_future(hard())

    # ---- the process ----
    async def run(self):
        """Forever, while [airplay] enabled: wait for the desktop's Wayland socket, start UxPlay, read it, start it again."""
        if not self.on:
            return
        fast = 0
        try:
            while True:
                cmd = self.command()
                if not cmd:
                    self._status("absent", f"{self.exe} introuvable")
                    await asyncio.sleep(60)
                    continue
                if not (Path(self.runtime) / self.wayland).exists():
                    self._status("attente")
                    await asyncio.sleep(2)
                    continue
                env = {**os.environ, "WAYLAND_DISPLAY": self.wayland, "XDG_RUNTIME_DIR": self.runtime}
                t0, self.lines = time.time(), []
                try:
                    self.proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
                                                                     stdin=asyncio.subprocess.DEVNULL, env=env, start_new_session=True, limit=1 << 20)
                except OSError as e:
                    self._status("erreur", str(e)[:120])
                    await asyncio.sleep(60)
                    continue
                log.info("AirPlay : UxPlay démarré (%s)", " ".join(cmd[-12:]))
                self._status("pret")
                await self._read(self.proc)
                rc = await self.proc.wait()
                was_kick, self.restarting = self.restarting, False
                self.st.reset()
                self._show()
                if was_kick:
                    await asyncio.sleep(0.5)
                    continue
                fast = fast + 1 if time.time() - t0 < self.quick else 0  # it stops at once: something is wrong, slow down
                last = next((ln for ln in reversed(self.lines) if ln.strip()), "")
                log.warning("AirPlay : UxPlay s'est arrêté (code %s) : %s", rc, last[:200])
                self._status("erreur" if fast else "pret", last[:120] if fast else "")
                await asyncio.sleep(min(60, self.retry * (2 ** min(fast, 5))) if fast else self.retry)
        finally:
            self._stop_proc()

    async def _read(self, proc):
        while True:
            try:
                raw = await proc.stdout.readline()
            except ValueError:                                  # a line longer than 1 Mo: skip it
                continue
            if not raw:
                return
            line = raw.decode("utf-8", "replace").rstrip()
            self.lines = (self.lines + [line])[-20:]
            if self.st.feed(line):
                log.info("AirPlay : %s %s", self.st.phase, self.st.client)
                self._show()
            if (parse(line) or ("",))[0] == "lost":              # and UxPlay starts again: no window of the lost client left over Pixel
                self.kick()
