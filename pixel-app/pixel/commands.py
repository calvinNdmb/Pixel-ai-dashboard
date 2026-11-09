"""Typed commands ("salon 40", "minuteur 10", "codex ...").

Anything that is not a command goes to Claude.
"""
import re
import unicodedata

from . import anims, scenes
from .keys import MOODS, NAMES, NAV, THEMES

# accent-free words for each theme ("thème néon" is normalised to "theme neon")
THEME_WORDS = {"retro": "retro", "moderne": "moderne", "actuel": "moderne", "manga": "manga", "anime": "manga",
               "neon": "neon", "synthwave": "neon", "fluo": "neon", "croquis": "croquis", "crayon": "croquis",
               "dessin": "croquis", "cahier": "croquis", "lcd": "lcd", "console": "lcd", "poche": "lcd"}
HELP = ("salon 40 · allume bureau · éteins tout · scène film · minuteur 10 · pause · thème néon · thème suivant · "
        "codex <tâche> · météo, agenda… (nom d'un écran) · humeur triste · anim danse · animations · fais le poisson · scènes · "
        "visage vivant · caste <lien ou texte> · stop cast · sinon : Claude")
# a few words that play an animation on their own
BARE = {"danse": "danse", "chante": "chante", "coucou": "salut", "bisou": "bisou"}
FACE_WORDS = {"pack": "pack", "pack 52": "pack", "52": "pack", "animations": "pack", "vivant": "vivant", "anime": "vivant"}


def norm(s):
    s = unicodedata.normalize("NFD", s.lower().strip())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


SCREEN_WORDS = {norm(NAMES[i]): i for i in NAV} | {"lumiere": "lumieres", "lampes": "lumieres", "timer": "minuteur",
                                                    "meteo": "meteo", "systeme": "systeme", "visage": "visage"}
# every mood by its id, plus the French words people type ("humeur fâchée", "humeur clin d'œil")
MOOD_WORDS = {m: m for m in MOODS} | {"heureux": "content", "joyeux": "content", "amoureuse": "amoureux", "clin d'oeil": "clin",
                                      "clin d'œil": "clin", "dort": "endormi", "endormie": "endormi", "reflechis": "reflechit",
                                      "fachee": "fache", "colere": "fache", "confuse": "confus", "perdu": "confus", "excitee": "excite",
                                      "fiere": "fier", "cool": "fier", "malade": "malade", "baille": "baille", "fatigue": "baille"}


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

    # casting (pixel/cast.py): "caste https://youtu.be/...", "caste À table !"; "stop" ends a cast before it pauses the timer
    if t in ("stop cast", "arrete le cast", "arrete de caster", "fin du cast") or (t in ("stop", "arrete", "arreter") and hub.s.get("cast")):
        return await hub.dispatch("cast.stop")
    m = re.match(r"^(?:cast|caste|caster)\s+\S", t)
    if m:
        rest = raw.split(None, 1)[1].strip()
        if re.match(r"^https?://", rest, re.I):
            return await hub.dispatch("cast.link", {"url": rest})
        return await hub.dispatch("cast.text", {"text": rest})

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

    m = re.match(r"^(?:theme|style)\s+(\S+)$", t)
    if m:
        w = m.group(1)
        if w in ("suivant", "+", "plus"):
            return await hub.dispatch("theme.step", {"d": 1})
        if w in ("precedent", "-", "moins"):
            return await hub.dispatch("theme.step", {"d": -1})
        if w in THEME_WORDS:
            return await hub.dispatch("theme.set", {"name": THEME_WORDS[w]})
        on = hub.s["settings"].get("themes") or list(THEMES)
        if len(on) < 2:
            return hub.toast(f"Pour le moment, seul le thème {THEMES[on[0]]} est activé.", 5000)
        return hub.toast("Les thèmes : " + ", ".join(THEMES[i].lower() for i in on), 5000)

    m = re.match(r"^humeur\s+(.+)$", t)
    if m:
        name = MOOD_WORDS.get(m.group(1).strip())
        if not name:
            hub.mood("confus", 2500)
            return hub.toast("Je ne connais pas cette humeur. Essaie : humeur triste, humeur fier…", 5000)
        await hub.dispatch("screen.show", {"screen": "visage"})
        return await hub.dispatch("mood.set", {"name": name, "ms": 0 if name == "endormi" else 3000})

    m = re.match(r"^visage\s+(.+)$", t)
    if m and m.group(1) in FACE_WORDS:
        await hub.dispatch("face.set", {"name": FACE_WORDS[m.group(1)]})
        return await hub.dispatch("screen.show", {"screen": "visage"})

    if t in ("scenes", "les scenes", "liste des scenes"):
        life = ", ".join(label for i, label, g in scenes.SCENES if g == "vie")
        return hub.toast("Ses moments de vie : " + life + ". Tape « fais le poisson », « fais la sieste »…", 15000)
    m = re.match(r"^(?:fais|fait|faire|joue)\s+(.+)$", t)       # not "scène": that is for the lights
    if m and scenes.find(m.group(1)):                      # otherwise it is a question for Claude ("fais une liste de…")
        return await hub.dispatch("scene.play", {"id": scenes.find(m.group(1))})

    if t in ("animations", "les animations", "liste des animations"):
        groups = [g + " : " + ", ".join(a["label"] for a in anims.ANIMS if a["group"] == g) for g in anims.GROUPS]
        return hub.toast("Les 52 animations. " + " · ".join(groups) + ". Tape « anim » et son nom.", 15000)
    m = re.match(r"^(?:anim|animation)\s+(.+)$", t)
    if m or t in BARE:
        a = BARE.get(t) or anims.WORDS.get(anims.key(m.group(1)))
        if not a:
            hub.mood("confus", 2500)
            return hub.toast("Je ne connais pas cette animation. Tape « animations » pour la liste.", 5000)
        await hub.dispatch("screen.show", {"screen": "visage"})
        return await hub.dispatch("anim.play", {"id": a})

    if t in SCREEN_WORDS:
        return await hub.dispatch("screen.show", {"screen": SCREEN_WORDS[t]})

    await hub.dispatch("chat.ask", {"text": raw})
