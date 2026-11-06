"""Typed commands ("salon 40", "minuteur 10", "codex ...").

Anything that is not a command goes to Claude.
"""
import re
import unicodedata

from .keys import NAV, NAMES

THEME_WORDS = {"retro": "retro", "moderne": "moderne", "actuel": "moderne", "manga": "manga", "anime": "manga"}
HELP = ("salon 40 · allume bureau · éteins tout · scène film · minuteur 10 · pause · thème manga · "
        "codex <tâche> · météo, agenda… (nom d'un écran) · humeur content · sinon : Claude")
MOODS = {"neutre", "content", "surpris", "amoureux", "clin", "endormi"}


def norm(s):
    s = unicodedata.normalize("NFD", s.lower().strip())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


SCREEN_WORDS = {norm(NAMES[i]): i for i in NAV} | {"lumiere": "lumieres", "lampes": "lumieres", "timer": "minuteur",
                                                    "meteo": "meteo", "systeme": "systeme", "visage": "visage"}


def find_room(hub, word):
    w = norm(word)
    w = re.sub(r"^(le|la|les|l')\s*", "", w)
    if w in ("tout", "toutes", "tous", "partout", "lumieres", "lampes", "*"):
        return "*"
    for r in hub.s["lights"]["rooms"]:
        if norm(r["name"]) == w or norm(r["name"]).startswith(w):
            return r["name"]
    return None


async def run(hub, text):
    raw = text.strip()
    t = norm(raw)
    if not t:
        return
    if t in ("aide", "help", "?", "/aide"):
        hub.toast(HELP, 9000)
        return
    if t in ("/effacer", "/clear", "effacer"):
        return await hub.dispatch("chat.clear")

    if t.startswith("codex ") and len(raw) > 6:
        await hub.dispatch("screen.show", {"screen": "codex"})
        return await hub.dispatch("codex.run", {"task": raw[6:].strip()})

    m = re.match(r"^(minuteur|timer|chrono)(?:\s+(\d+(?:[.,]\d+)?))?\s*(?:min|minutes?)?$", t)
    if m:
        await hub.dispatch("screen.show", {"screen": "minuteur"})
        if m.group(2):
            return await hub.dispatch("timer.start", {"minutes": float(m.group(2).replace(",", "."))})
        return
    if t in ("pause", "reprendre", "stop") and (hub.s["timer"]["running"] or t == "reprendre"):
        return await hub.dispatch("timer.toggle")

    m = re.match(r"^(?:scene|ambiance)\s+(.+)$", t)
    if m:
        return await hub.dispatch("lights.scene", {"name": m.group(1)})

    m = re.match(r"^(allume|allumer|eteins|eteindre|eteint)\s+(.+)$", t)
    if m and find_room(hub, m.group(2)):
        return await hub.dispatch("lights.set", {"room": find_room(hub, m.group(2)), "on": m.group(1).startswith("allum")})
    m = re.match(r"^(?:(allume|eteins)\s+)?(tout|toutes les lumieres|les lumieres)(?:\s+(on|off))?$", t)
    if m:
        return await hub.dispatch("lights.set", {"room": "*", "on": (m.group(1) or "allume") == "allume" and m.group(3) != "off"})
    m = re.match(r"^(.+?)\s+(on|off|\d{1,3})\s*%?$", t)
    if m and find_room(hub, m.group(1)):
        room, v = find_room(hub, m.group(1)), m.group(2)
        if v in ("on", "off"):
            return await hub.dispatch("lights.set", {"room": room, "on": v == "on"})
        return await hub.dispatch("lights.set", {"room": room, "bri": max(0, min(100, int(v)))})

    m = re.match(r"^(?:theme|style)\s+(\w+)$", t)
    if m and m.group(1) in THEME_WORDS:
        return await hub.dispatch("theme.set", {"name": THEME_WORDS[m.group(1)]})

    m = re.match(r"^humeur\s+(\w+)$", t)
    if m and m.group(1) in MOODS:
        await hub.dispatch("screen.show", {"screen": "visage"})
        return await hub.dispatch("mood.set", {"name": m.group(1), "ms": 0 if m.group(1) == "endormi" else 3000})

    if t in SCREEN_WORDS:
        return await hub.dispatch("screen.show", {"screen": SCREEN_WORDS[t]})

    await hub.dispatch("chat.ask", {"text": raw})
