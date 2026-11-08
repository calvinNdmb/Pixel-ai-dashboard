#!/usr/bin/env python3
"""Pixel's server.

Serves the app to Pixel's own screen (kiosk) and to phones and computers on the same
Wi-Fi, drives the Stream Deck, and talks to Hue, Claude, Codex, the weather and the calendar.
"""
import argparse
import asyncio
import json
import logging
import os
import secrets
import socket
import time
import tomllib
from pathlib import Path

import segno
from aiohttp import WSMsgType, web

from pixel import anims, commands, scenes, timer
from pixel.agenda import Agenda
from pixel.claude import Claude
from pixel.codex import Codex
from pixel.deck import Deck
from pixel.hue import Hue
from pixel.keys import FACES, NAV, THEMES
from pixel.state import Hub
from pixel.system import System, local_ip
from pixel.weather import Weather

HERE = Path(__file__).resolve().parent
log = logging.getLogger("pixel")
LOCAL = {"127.0.0.1", "::1"}


def core_actions(hub, datadir):
    v = hub.s["view"]
    ui_file = datadir / "ui.json"
    saved = json.loads(ui_file.read_text()) if ui_file.exists() else {}
    v["theme"] = saved.get("theme") or hub.cfg.get("ui", {}).get("theme", "retro")
    if v["theme"] not in THEMES:
        v["theme"] = "retro"
    v["face"] = saved.get("face") or hub.cfg.get("ui", {}).get("face", "pack")      # the animation pack, or the living face
    if v["face"] not in FACES:
        v["face"] = "pack"
    hub.s.setdefault("anim", None)
    hub.s.setdefault("scene", None)

    def save():
        ui_file.write_text(json.dumps({"theme": v["theme"], "face": v["face"]}))

    @hub.action("theme.set")
    async def theme(name):
        if name in THEMES:
            v["theme"] = name
            save()
            hub.toast("THÈME " + THEMES[name].upper())

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
        ids = list(THEMES)
        i = ids.index(v["theme"]) if v["theme"] in ids else 0
        await theme(ids[(i + int(d)) % len(ids)])

    @hub.action("screen.show")
    async def show(screen):
        if screen in NAV:
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
        if request.remote not in LOCAL and request.query.get("t") != token:
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

    app = web.Application()
    app.on_response_prepare.append(revalidate)
    app.router.add_get("/", index)
    app.router.add_get("/ws", ws_handler)
    for path in ("/lab", "/lab/", "/app/lab", "/app/lab/"):    # before the static route, which would answer 403
        app.router.add_get(path, lab)
    app.router.add_static("/app/", HERE / "web")
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, args.host, port).start()

    jobs = [hub.broadcaster(), hub.every(1, system.sample), hub.every(5, hue.refresh), hub.every(1200, weather.refresh),
            hub.every(600, agenda.refresh), hub.every(0.25, tick), hub.every(10, deck.connect)]
    log.info("Pixel prêt. Écran : http://localhost:%s/?kiosk=1   Téléphone : %s", port, url)
    hub.s["boot_at"] = 0
    hub.mark()
    await asyncio.gather(*jobs)


def main():
    ap = argparse.ArgumentParser(description="Serveur de Pixel")
    ap.add_argument("--config", default=os.environ.get("PIXEL_CONFIG", str(HERE / "config.toml")))
    ap.add_argument("--demo", action="store_true", help="fausses lampes, météo et agenda ; Claude en mode démo")
    ap.add_argument("--host", default="0.0.0.0")
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
