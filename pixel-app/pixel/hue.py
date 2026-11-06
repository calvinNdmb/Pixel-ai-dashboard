"""Philips Hue bridge (local REST API v1): rooms, brightness, scenes, pairing."""
import asyncio
import json
import logging
import socket

import aiohttp

from .commands import norm

log = logging.getLogger("pixel.hue")
DEMO_ROOMS = [("Salon", True, 80), ("Bureau", True, 100), ("Chambre", False, 30), ("Cuisine", True, 40)]
DEMO_SCENES = {"Lecture": [(1, 90), (1, 100), (0, 30), (1, 60)], "Film": [(1, 15), (0, 0), (0, 0), (1, 10)],
               "Détente": [(1, 45), (1, 30), (1, 25), (0, 40)], "Focus": [(1, 70), (1, 100), (0, 0), (1, 50)]}


class Hue:
    def __init__(self, hub, cfg, datadir):
        self.hub, self.L = hub, hub.s["lights"]
        self.file = datadir / "hue.json"
        saved = json.loads(self.file.read_text()) if self.file.exists() else {}
        self.ip = cfg.get("bridge") or saved.get("bridge")
        self.user = cfg.get("username") or saved.get("username")
        self.scene_ids = {}
        self.http = None
        if hub.demo:
            self.L.update(status="démo", rooms=[{"id": str(i), "name": n, "on": o, "bri": b} for i, (n, o, b) in enumerate(DEMO_ROOMS)],
                          scenes=list(DEMO_SCENES))
        self._register()

    def _url(self, path=""):
        return f"http://{self.ip}/api/{self.user}{path}"

    async def _req(self, method, path, body=None):
        self.http = self.http or aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5))
        async with self.http.request(method, self._url(path), json=body) as r:
            return await r.json(content_type=None)

    async def refresh(self):
        if self.hub.demo:
            return
        if not self.ip or not self.user:
            self.L["status"] = "à associer (Réglages)"
            self.hub.mark()
            return
        try:
            groups = await self._req("GET", "/groups")
            scenes = await self._req("GET", "/scenes")
        except (aiohttp.ClientError, asyncio.TimeoutError, socket.gaierror) as e:
            self.L["status"] = "pont injoignable"
            log.warning("hue: %s", e)
            self.hub.mark()
            return
        if isinstance(groups, list):        # [{"error": ...}] : user no longer valid
            self.L["status"] = "à associer (Réglages)"
            self.hub.mark()
            return
        rooms = [{"id": gid, "name": g["name"], "on": g["state"]["any_on"], "bri": round(g["action"].get("bri", 254) / 2.54)}
                 for gid, g in groups.items() if g.get("type") in ("Room", "Zone")]
        ids = {g["id"] for g in rooms}
        self.scene_ids = {}
        for sid, sc in scenes.items():
            if sc.get("group") in ids and sc["name"] not in self.scene_ids:
                self.scene_ids[sc["name"]] = (sid, sc["group"])
        self.L.update(status="ok", rooms=sorted(rooms, key=lambda r: r["name"]), scenes=sorted(self.scene_ids))
        self.hub.mark()

    def _targets(self, room):
        if room in ("*", None):
            return self.L["rooms"]
        n = norm(str(room))
        return [r for r in self.L["rooms"] if r["id"] == room or norm(r["name"]) == n] or \
               [r for r in self.L["rooms"] if norm(r["name"]).startswith(n)][:1]

    async def set(self, room="*", on=None, bri=None):
        rooms = self._targets(room)
        if not rooms:
            self.hub.toast(f"PIÈCE INCONNUE : {room}")
            return False
        for r in rooms:
            body = {}
            if bri is not None:
                bri = max(0, min(100, int(bri)))
                body = {"on": bri > 0} | ({"bri": max(1, round(bri * 2.54))} if bri > 0 else {})
                r["on"] = bri > 0
                if bri > 0:
                    r["bri"] = bri
            if on is not None:
                body["on"] = r["on"] = bool(on)
            if not self.hub.demo:
                await self._req("PUT", f"/groups/{r['id']}/action", body)
        self.hub.mark()
        if not self.hub.demo:
            asyncio.get_running_loop().call_later(1.0, lambda: asyncio.ensure_future(self.refresh()))
        return True

    async def scene(self, name):
        n = norm(name)
        match = next((s for s in self.L["scenes"] if norm(s) == n), None) or next((s for s in self.L["scenes"] if norm(s).startswith(n)), None)
        if not match:
            self.hub.toast(f"SCÈNE INCONNUE : {name}")
            return False
        if self.hub.demo:
            for r, (on, b) in zip(self.L["rooms"], DEMO_SCENES[match]):
                r["on"] = bool(on)
                r["bri"] = b or r["bri"]
        else:
            sid, group = self.scene_ids[match]
            await self._req("PUT", f"/groups/{group}/action", {"scene": sid})
            asyncio.get_running_loop().call_later(1.0, lambda: asyncio.ensure_future(self.refresh()))
        self.hub.toast("SCÈNE : " + match.upper())
        return True

    async def pair(self):
        """Find the bridge, then wait up to 30 s for its link button."""
        if self.hub.demo:
            self.hub.toast("MODE DÉMO : PAS DE PONT HUE")
            return
        self.http = self.http or aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5))
        if not self.ip:
            try:
                async with self.http.get("https://discovery.meethue.com/") as r:
                    found = await r.json(content_type=None)
                self.ip = found[0]["internalipaddress"]
            except Exception:
                self.hub.toast("PONT HUE INTROUVABLE : mets son adresse IP dans config.toml", 6000)
                return
        self.hub.toast("APPUIE SUR LE BOUTON DU PONT HUE", 30000)
        for _ in range(30):
            async with self.http.post(f"http://{self.ip}/api", json={"devicetype": "pixel#raspberrypi"}) as r:
                res = await r.json(content_type=None)
            if res and "success" in res[0]:
                self.user = res[0]["success"]["username"]
                self.file.write_text(json.dumps({"bridge": self.ip, "username": self.user}))
                self.hub.toast("PONT HUE ASSOCIÉ !")
                await self.refresh()
                return
            await asyncio.sleep(1)
        self.hub.toast("BOUTON NON PRESSÉ : RÉESSAIE")

    def _register(self):
        h = self.hub

        @h.action("lights.set")
        async def _set(room="*", on=None, bri=None):
            await self.set(room, on, bri)

        @h.action("lights.scene")
        async def _scene(name):
            await self.scene(name)

        @h.action("lights.pair")
        async def _pair():
            asyncio.ensure_future(self.pair())
