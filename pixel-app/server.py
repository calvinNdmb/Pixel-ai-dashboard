#!/usr/bin/env python3
"""Pixel's server.

Serves the app to Pixel's own screen (kiosk) and to phones and computers on the same
Wi-Fi, drives the Stream Deck, and talks to Hue, Claude, Codex, the weather and the calendar.
"""
import argparse
import asyncio
import ipaddress
import json
import logging
import os
import secrets
import socket
import time
import tomllib
from pathlib import Path

import psutil
import segno
from aiohttp import WSMsgType, web

from pixel import anims, commands, scenes, timer
from pixel.agenda import Agenda
from pixel.airplay import AirPlay
from pixel.cast import Cast, local_page
from pixel.claude import Claude
from pixel.codex import Codex
from pixel.deck import Deck
from pixel.ecran import Ecran
from pixel.hue import Hue
from pixel.keys import FACES, NAV, THEMES
from pixel.state import Hub
from pixel.system import System, local_ip
from pixel.weather import Weather
from pixel import poche                  # Pixel de poche: the phone held sideways
from pixel.youtube import Player as YtPlayer
from pixel.ytcast import YtCast
from pixel import telephone              # the Android app: the phone's notifications
from pixel import caractere              # his character: traits, presets, his name and yours
from pixel import nourrir                # Nourrir: his belly, his tastes, his meals
from pixel import exos                   # little math exercises (and riddles)
from pixel import souvenirs, album       # his memories and your mood journal; his photo album (/api/album, /album/NAME)
from pixel import amis                   # les amis de Pixel: visits from house to house, through a relay (docs/AMIS.md)
from pixel import look                   # his look: eyes, colours, what he wears, the seasons' outfits, his pyjama

HERE = Path(__file__).resolve().parent
log = logging.getLogger("pixel")


def home_networks():
    """The networks of the Pi's own addresses, IPv4 and IPv6 (its Wi-Fi's /24, its /64...)."""
    nets = []
    for addrs in psutil.net_if_addrs().values():
        for a in addrs:
            if a.family in (socket.AF_INET, socket.AF_INET6) and a.netmask:
                try:
                    bits = bin(int(ipaddress.ip_address(a.netmask.split("/")[0]))).count("1")
                    nets.append(ipaddress.ip_network(f"{a.address.split('%')[0]}/{bits}", strict=False))
                except ValueError:
                    pass
    return nets


@web.middleware
async def home_only(request, handler):
    """Pixel answers its home network only. It listens on IPv6 too (a phone often finds pixel.local by its IPv6
    address), and there the Pi has a public address that a box does not always filter."""
    try:
        ip = ipaddress.ip_address((request.remote or "").split("%")[0])
        ip = getattr(ip, "ipv4_mapped", None) or ip
    except ValueError:
        ip = None
    if ip and (ip.is_loopback or ip.is_private or ip.is_link_local or any(ip in n for n in home_networks())):
        return await handler(request)
    raise web.HTTPForbidden(text="Pixel ne répond qu'aux appareils de la maison.")


def core_actions(hub, datadir):
    v = hub.s["view"]
    ui_file = datadir / "ui.json"
    saved = json.loads(ui_file.read_text()) if ui_file.exists() else {}
    ui = hub.cfg.get("ui", {})
    # the themes Pixel offers: [ui] themes in config.toml; only Rétro for now when the line is missing
    on = [t for t in ui.get("themes", ["retro"]) if t in THEMES] or ["retro"]
    hub.s["settings"]["themes"] = on
    v["theme"] = saved.get("theme") or ui.get("theme", on[0])
    if v["theme"] not in on:
        v["theme"] = on[0]
    v["face"] = saved.get("face") or hub.cfg.get("ui", {}).get("face", "pack")      # the animation pack, or the living face
    if v["face"] not in FACES:
        v["face"] = "pack"
    hub.s.setdefault("anim", None)
    hub.s.setdefault("scene", None)

    def save():
        ui_file.write_text(json.dumps({"theme": v["theme"], "face": v["face"]}))

    @hub.action("theme.set")
    async def theme(name):
        if name in on:
            v["theme"] = name
            save()
            hub.toast("THÈME " + THEMES[name].upper())
        elif name in THEMES:
            hub.toast(f"Pour le moment, seul le thème {THEMES[on[0]]} est activé." if len(on) == 1
                      else "Ce thème n'est pas activé. Les thèmes : " + ", ".join(THEMES[t] for t in on) + ".", 5000)

    @hub.action("face.set")
    async def face(name):
        """The face: "pack" (the 52 animations of the user's pack) or "vivant" (the living face). Saved like the theme."""
        if name in FACES:
            v["face"] = name
            save()
            hub.toast("VISAGE : " + FACES[name].upper())

    @hub.action("anim.play")
    async def anim_play(id, loops=None):
        """Plays one of the pack's animations once or a few times (loops=0: until another one), then back to the mood or the idle."""
        if id not in anims.BY_ID:
            return
        n = anims.loops(id) if loops is None else max(0, min(20, int(loops)))
        t0 = time.time() * 1000
        hub.s["anim"] = {"id": id, "t0": t0, "loops": n, "until": t0 + n * anims.BY_ID[id]["duration"] * 1000 if n else 0}

    @hub.action("anim.stop")
    async def anim_stop():
        hub.s["anim"] = None

    @hub.action("scene.play")
    async def scene_play(id):
        """One of Pixel's personality scenes (web/persona.js): the fish, the nap... Each screen plays it on the face."""
        if id in scenes.BY_ID:
            hub.s["anim"] = None
            hub.s["scene"] = {"id": id, "t0": time.time() * 1000}
            hub.s["screen"] = "visage"

    @hub.action("theme.step")
    async def theme_step(d=1):
        """Next (d=1) or previous (d=-1) theme, for the "Thème −" / "Thème +" keys. Saved like theme.set."""
        if len(on) < 2:
            return hub.toast(f"Pour le moment, seul le thème {THEMES[on[0]]} est activé.", 4000)
        i = on.index(v["theme"]) if v["theme"] in on else 0
        await theme(on[(i + int(d)) % len(on)])

    @hub.action("screen.show")
    async def show(screen):
        if screen in NAV:
            hub.s["cast"] = None                        # opening a screen ends what was cast on Pixel (pixel/cast.py)
            if hub.s["screen"] == "veille" and screen != "veille":
                hub.mood("surpris", 900)
            hub.s["screen"] = screen

    @hub.action("mood.set")
    async def mood(name, ms=0):
        hub.mood(str(name), int(ms))

    @hub.action("view.set")
    async def vset(key, value):
        if key in v:
            v[key] = value

    @hub.action("view.toggle")
    async def vtoggle(key):
        if key in v:
            v[key] = not v[key]

    @hub.action("view.step")
    async def vstep(key, d=1, lo=0, hi=4):
        if key in v:
            v[key] = max(lo, min(hi, int(v[key]) + int(d)))


def qr_rows(url):
    return ["".join("1" if c else "0" for c in row) for row in segno.make(url, error="m").matrix]


async def serve(args, cfg, datadir, token):
    hub = Hub(cfg, args.demo)
    core_actions(hub, datadir)
    poche.setup(hub)                     # Pixel de poche: the two Pixels pass news, the voyage
    caractere.setup(hub, datadir)        # his character, saved in caractere.json
    nourrir.setup(hub, datadir)          # Nourrir: feeding Pixel (data_dir/nourrir.json)
    exos.setup(hub, datadir)             # math exercises: the exos.* actions, data_dir/exos.json
    souvenirs.setup(hub, datadir)        # souvenirs.* and humeur.*: data_dir/souvenirs.json, humeur.json (after exos and nourrir: he reads them)
    amis.setup(hub, datadir)             # his friends: the amis.* actions, data_dir/amis.json, the relay once there is a friend
    look.setup(hub, datadir)             # « Son look »: the look.* actions, data_dir/look.json
    port = args.port
    host = socket.gethostname()
    url = f"http://{host}.local:{port}/?t={token}"
    hub.s["settings"].update(url=url, ip_url=f"http://{local_ip()}:{port}/?t={token}", qr=qr_rows(url), demo=args.demo,
                             sleep_min=cfg.get("ui", {}).get("sleep_minutes", 10))

    hue = Hue(hub, cfg.get("hue", {}), datadir)
    weather = Weather(hub, cfg.get("weather", {}))
    agenda = Agenda(hub, cfg.get("agenda", {}))
    system = System(hub)
    claude = Claude(hub, cfg.get("claude", {}))
    Codex(hub, cfg.get("codex", {}))
    tick = timer.setup(hub)
    deck = Deck(hub, cfg.get("streamdeck", {}))
    hub.s["settings"]["claude"] = claude.C["status"]
    cast = Cast(hub, cfg.get("cast", {}), datadir, token, qr_rows)     # photos, videos, texts and links from a phone
    ytp = YtPlayer(hub, cast)                                           # YouTube on Pixel's screen: the phone's remote control
    ytcast = YtCast(hub, cfg.get("ytcast", {}), datadir, port, cast, ytp, args.host)   # optional: the YouTube app's Cast button
    ecran = Ecran(hub, cfg.get("ecran", {}), HERE / "web", datadir, token, host=host, port=port, ip=local_ip())   # a PC's screen (WebRTC), Android's
    airplay = AirPlay(hub, cfg.get("airplay", {}))                    # iPhone, iPad, Mac: UxPlay, when [airplay] enabled = true

    @hub.action("cmd")
    async def cmd(text):
        await commands.run(hub, str(text)[:2000])

    async def index(request):
        return web.FileResponse(HERE / "web" / "index.html", headers={"Cache-Control": "no-cache"})

    async def lab(request):
        """Short addresses for Pixel Lab (the static route does not serve a folder's index.html)."""
        q = request.query_string
        raise web.HTTPFound("/app/lab/index.html" + ("?" + q if q else ""))

    async def ws_handler(request):
        # the Pi itself, from Pixel's own page (not from a video player shown on the screen), or the access code
        if not local_page(request) and request.query.get("t") != token:
            raise web.HTTPForbidden(text="Code d'accès manquant : scanne le QR code dans Réglages sur l'écran de Pixel.")
        ws = web.WebSocketResponse(heartbeat=20)
        await ws.prepare(request)
        hub.clients.add(ws)
        await ws.send_str(json.dumps({"type": "state", "data": hub.snapshot()}, ensure_ascii=False))
        try:
            async for msg in ws:
                if msg.type != WSMsgType.TEXT:
                    continue
                try:
                    m = json.loads(msg.data)
                    await hub.dispatch(str(m["action"]), m.get("args") or {})
                except (ValueError, KeyError, TypeError):
                    log.warning("bad message: %.200s", msg.data)
        finally:
            hub.clients.discard(ws)
        return ws

    async def revalidate(request, response):
        """After an update (git pull), the screen must not keep old copies of the app's files: it asks again every time
        (a 304 when nothing changed, nothing to download)."""
        if request.path.startswith("/app/"):
            response.headers["Cache-Control"] = "no-cache"

    async def worker(request):
        """The app's service worker, at the root so that it covers the whole app: what lets a phone install it."""
        return web.FileResponse(HERE / "web" / "sw.js", headers={"Cache-Control": "no-cache", "Service-Worker-Allowed": "/"})

    async def apk(request):
        """The Android app (pixel-mobile), once it is in the data folder as pixel.apk: the phone downloads it from Pixel."""
        f = datadir / "pixel.apk"
        if not f.exists():
            raise web.HTTPNotFound(text="Pas encore d'appli Android sur ce Pixel.")
        return web.FileResponse(f, headers={"Content-Type": "application/vnd.android.package-archive",
                                            "Content-Disposition": 'attachment; filename="Pixel.apk"', "Cache-Control": "no-cache"})

    app = web.Application(middlewares=[home_only])
    app.on_response_prepare.append(revalidate)
    app.router.add_get("/", index)
    app.router.add_get("/sw.js", worker)
    app.router.add_get("/pixel.apk", apk)
    app.router.add_get("/ws", ws_handler)
    app.router.add_post("/api/cast", cast.api)
    app.router.add_post("/share", cast.share)              # the Android share sheet (manifest.webmanifest share_target)
    app.router.add_get("/cast/{name}", cast.file)
    app.router.add_get("/ytcast", ytcast.ws)               # the YouTube sidecar only (pixel/ytcast.py): the Pi itself, its own code
    ecran.routes(app.router)                               # /ecran: « Partager mon écran », its signalling, Android's screen
    telephone.setup(hub, app, token)       # POST /api/notif: the phone's notifications, a toast for his scenes
    album.setup(hub, app, datadir, token)  # POST /api/album (his own screen's photos), GET /album/NAME: same access rules
    for path in ("/lab", "/lab/", "/app/lab", "/app/lab/"):    # before the static route, which would answer 403
        app.router.add_get(path, lab)
    app.router.add_static("/app/", HERE / "web")
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, args.host, port).start()
    await ecran.serve_tls(runner, args.host)                # the optional https address ([ecran] https_port)

    jobs = [hub.broadcaster(), hub.every(1, system.sample), hub.every(5, hue.refresh), hub.every(1200, weather.refresh),
            hub.every(600, agenda.refresh), hub.every(0.25, tick), hub.every(10, deck.connect), hub.every(1, cast.tick), ytcast.run(),
            hub.every(1, ecran.tick), airplay.run()]
    log.info("Pixel prêt. Écran : http://localhost:%s/?kiosk=1   Téléphone : %s", port, url)
    hub.s["boot_at"] = 0
    hub.mark()
    await asyncio.gather(*jobs)


def main():
    ap = argparse.ArgumentParser(description="Serveur de Pixel")
    ap.add_argument("--config", default=os.environ.get("PIXEL_CONFIG", str(HERE / "config.toml")))
    ap.add_argument("--demo", action="store_true", help="fausses lampes, météo et agenda ; Claude en mode démo")
    ap.add_argument("--host", default=None, help="par défaut : toutes les adresses, IPv4 et IPv6")
    ap.add_argument("--port", type=int, default=8080)
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

    cfg_path = Path(args.config)
    cfg = tomllib.loads(cfg_path.read_text()) if cfg_path.exists() else {}
    if not cfg_path.exists():
        log.warning("pas de %s : réglages par défaut (copie config.example.toml)", cfg_path)
    datadir = Path(os.path.expanduser(cfg.get("data_dir", "~/.config/pixel")))
    datadir.mkdir(parents=True, exist_ok=True)
    token = cfg.get("security", {}).get("token")
    if not token:
        tf = datadir / "token"
        if not tf.exists():
            tf.write_text(secrets.token_urlsafe(9))
            tf.chmod(0o600)
        token = tf.read_text().strip()
    try:
        asyncio.run(serve(args, cfg, datadir, token))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
