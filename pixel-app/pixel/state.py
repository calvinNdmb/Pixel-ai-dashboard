"""Shared state, broadcast to every screen (Pixel's own display, phones, computers)."""
import asyncio
import json
import logging
import time

log = logging.getLogger("pixel")


class Hub:
    def __init__(self, cfg, demo=False):
        self.cfg, self.demo = cfg, demo
        self.clients = set()
        self.actions = {}
        self.listeners = []          # called after each broadcast (Stream Deck)
        self._dirty = asyncio.Event()
        self._toast_id = 0
        self.s = {
            "screen": "visage",
            "mood": {"name": "neutre", "until": 0},
            "view": {"meteo_day": 0, "units_f": False, "agenda_day": 0, "crt_off": False, "osk": False},
            "lights": {"status": "démarrage", "rooms": [], "scenes": []},
            "chat": {"phase": "idle", "status": "", "messages": []},
            "codex": {"task": "", "running": False, "status": "", "lines": []},
            "weather": None,
            "agenda": {"status": "", "events": []},
            "timer": {"mode": "TRAVAIL", "total": 1500, "left": 1500, "running": False, "ends_at": 0, "done": 0},
            "sys": {},
            "settings": {},
            "toast": None,
            "boot_at": 0,
        }

    # ---- state changes ----
    def mark(self):
        self._dirty.set()

    def toast(self, msg, ms=3000):
        self._toast_id += 1
        self.s["toast"] = {"id": self._toast_id, "msg": msg, "ms": ms}
        self.mark()

    def mood(self, name, ms=0):
        self.s["mood"] = {"name": name, "until": time.time() * 1000 + ms if ms else 0}
        self.mark()

    def snapshot(self):
        from .keys import all_keys
        return {**self.s, "keys": all_keys(self.s), "server_now": time.time() * 1000}

    # ---- actions ----
    def action(self, name):
        def deco(fn):
            self.actions[name] = fn
            return fn
        return deco

    async def dispatch(self, name, args=None):
        fn = self.actions.get(name)
        if not fn:
            log.warning("unknown action %s", name)
            return
        try:
            await fn(**(args or {}))
        except TypeError as e:
            log.warning("bad arguments for %s: %s", name, e)
        except Exception:
            log.exception("action %s failed", name)
            self.toast("ERREUR : " + name)
        self.mark()

    # ---- broadcast loop ----
    async def broadcaster(self):
        while True:
            await self._dirty.wait()
            await asyncio.sleep(0.05)          # batch bursts (Claude streaming, Codex logs)
            self._dirty.clear()
            snap = self.snapshot()
            data = json.dumps({"type": "state", "data": snap}, ensure_ascii=False)
            for ws in list(self.clients):
                try:
                    await ws.send_str(data)
                except Exception:
                    self.clients.discard(ws)
            for fn in self.listeners:
                try:
                    fn(snap)
                except Exception:
                    log.exception("listener failed")

    async def every(self, seconds, fn, first_delay=0):
        """Run fn() forever, every `seconds`, logging errors instead of dying."""
        await asyncio.sleep(first_delay)
        while True:
            try:
                await fn()
            except Exception:
                log.exception("periodic task %s failed", getattr(fn, "__name__", fn))
            await asyncio.sleep(seconds)
