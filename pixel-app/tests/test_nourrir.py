"""Feeding Pixel, the server's side (pixel/nourrir.py): his belly, his tastes, his meals, the commands and Claude's tool.

    python3 tests/test_nourrir.py                  # pure logic on a fake clock, then a demo server on port 8174 (NOURRIR_PY_PORT=…)

The belly empties in the day only, faster for a glutton, not much while the server was down or its clock jumped (ticks
come every minute, as on the Pi); a hand-edited nourrir.json never stops the server; meals are rate-limited and get
their reaction (favourite, liked, disliked, grumpy refusal, full, bloated, sugar rush, vegetables, robot food, a burp);
the tastes stay across restarts and can be drawn again; the commands do not take other commands' words. The menu is read
from web/scenes/nourrir.js: the files that must agree (pack, events, pages) are checked too. In Paris time.
"""
import asyncio
import datetime as dt
import json
import os
import random
import re
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

os.environ["TZ"] = "Europe/Paris"
time.tzset()

import aiohttp  # noqa: E402

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
from pixel import commands, nourrir, scenes  # noqa: E402
from pixel.claude import TOOLS, check as claude_check, tools_for  # noqa: E402
from pixel.state import Hub  # noqa: E402

PORT = int(os.environ.get("NOURRIR_PY_PORT") or 8174)   # NOURRIR_PY_PORT=… (test_nourrir.js has NOURRIR_PORT)
fails = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


def at(y, mo, d, h, mi=0):
    return dt.datetime(y, mo, d, h, mi).timestamp()


class Clock:
    def __init__(self, t):
        self.t = t

    def __call__(self):
        return self.t


def walk(N, c, t1, step=60):
    """The server's clock ticks every minute up to t1 (pixel/nourrir.py setup(): hub.every(60, ...))."""
    while c.t < t1:
        c.t = min(t1, c.t + step)
        N.tick()


def hub_with(traits=None):
    hub = Hub({}, demo=True)
    if traits is not None:
        hub.s["caractere"] = {"preset": "test", "traits": traits}
    return hub


def belly(datadir=None, start=None, traits=None, seed=1, **saved):
    """A Nourrir on a fake clock; saved: what nourrir.json holds before it starts."""
    clock = Clock(start or at(2026, 11, 9, 9))
    if saved and datadir:
        (Path(datadir) / "nourrir.json").write_text(json.dumps(saved))
    hub = hub_with(traits)
    N = nourrir.Nourrir(hub, datadir, clock, random.Random(seed))
    return hub, N, clock


def static_checks():
    pack = (APP / "web" / "scenes" / "nourrir.js").read_text()
    F = nourrir.FOODS
    ids = [f["id"] for f in F]
    check(f"the menu: {len(F)} foods read from web/scenes/nourrir.js, one per F( line", len(F) >= 20 and len(F) == len(re.findall(r"^\s*F\('", pack, re.M)), str(len(F)))
    check("ids unique, categories known, values 1..100", len(set(ids)) == len(ids) and all(f["cat"] in nourrir.CATS for f in F) and all(1 <= f["valeur"] <= 100 for f in F))
    check("every category has its foods", {f["cat"] for f in F} == set(nourrir.CATS), str({f["cat"] for f in F}))
    need = {"pomme", "banane", "fraise", "carotte", "brocoli", "croissant", "baguette", "pizza", "frites", "burger", "sushi", "pates", "soupe",
            "fromage", "glace", "gateau", "cookie", "bonbon", "chocolat", "lait", "pile", "octet", "prise", "cookie-web"}
    check("the 20 foods asked for, and the robot jokes (battery, crunchy byte, electricity, « accepter les cookies »)", need <= set(ids), str(need - set(ids)))
    check("every food has a label and a name with its article", all(f["label"] and re.match(r"^(un |une |des |du |de l’|de la )", f["nom"]) for f in F),
          str([f["nom"] for f in F if not re.match(r"^(un |une |des |du |de l’|de la )", f["nom"])]))
    ours = [i for i, _, _ in scenes.SCENES if i.startswith("nourrir-")]
    check(f"the scene pack: {len(ours)} scenes, read by pixel/scenes.py, all prefixed nourrir-", len(ours) >= 12 and len(re.findall(r"\bS\('", re.sub(r"/\*.*?\*/", "", pack, flags=re.S))) == len(ours), str(ours))
    for r in nourrir.REACTIONS:
        if r != "miam":
            check(f"reaction {r}: its scene answers 'nourrir-repas'", f"meal('{r}')" in pack)
    check("the hints are moments of life (calm when nothing else plays), not quiet (never at night)",
          all(scenes.BY_ID[i][1] == "vie" for i in ("nourrir-creux", "nourrir-affame", "nourrir-heure")) and "quiet" not in pack.split("the hints")[1])
    persona = (APP / "web" / "persona.js").read_text()
    events = set(re.findall(r"^\s+'?([a-z-]+)'?: '", persona.split("const EVENTS = {", 1)[1].split("};", 1)[0], re.M))
    check("persona.js EVENTS has nourrir-repas and nourrir-faim", {"nourrir-repas", "nourrir-faim"} <= events)
    for f, scripts in (("index.html", ("app/scenes/nourrir.js", "app/screens.js", "app/nourrir.js", "app/app.js")),
                       ("lab/index.html", ("../scenes/nourrir.js", "../screens.js", "demo-hub.js", "../nourrir.js", "lab.js", "nourrir-lab.js"))):
        page = (APP / "web" / f).read_text()
        pos = [page.find(f'"{s}"') for s in scripts]
        check(f"{f} loads the pack before screens.js, nourrir.js after it and before {scripts[-2] if f.startswith('lab') else 'app.js'}", -1 not in pos and pos == sorted(pos), str(pos))
    check("index.html loads nourrir.css", 'href="app/nourrir.css"' in (APP / "web" / "index.html").read_text())
    names = [t["name"] for t in TOOLS]
    check("Claude has the feed_pixel tool, its input streams, it is offered with any themes", "feed_pixel" in names and nourrir.TOOL["eager_input_streaming"]
          and "feed_pixel" in [t["name"] for t in tools_for(["retro"])])
    check("feed_pixel: a food or « au-choix », nothing else", claude_check("feed_pixel", {"plat": "pizza"}) is None and claude_check("feed_pixel", {"plat": "au-choix"}) is None
          and claude_check("feed_pixel", {"plat": "caillou"}) and claude_check("feed_pixel", {}))
    enum = next(t for t in TOOLS if t["name"] == "play_scene")["input_schema"]["properties"]["scene"]["enum"]
    check("Claude does not play the meal scenes (they need a meal)", not [i for i in enum if i.startswith("nourrir-") and scenes.BY_ID[i][1] != "vie"])


def time_checks():
    # the belly, in the day: normale empties 6 points an hour at gourmand 50
    hub, N, c = belly(None, at(2026, 11, 9, 9))
    N.ventre = 80.0
    walk(N, c, at(2026, 11, 9, 11))
    check("2 h in the day at normal speed: 12 points", abs(N.ventre - 68) < 0.01, f"{N.ventre:.2f}")
    check("the snapshot follows (int, faim 0)", hub.s["nourrir"]["ventre"] == 68 and hub.s["nourrir"]["faim"] == 0, str(hub.s["nourrir"]["ventre"]))
    N.ventre, N.t = 60.0, c.t
    walk(N, c, at(2026, 11, 9, 12))
    check("below 55: a little hungry (faim 1); below 25: very hungry (faim 2)", hub.s["nourrir"]["faim"] == 1 and nourrir.level(24) == 2 and nourrir.level(25) == 1, str(hub.s["nourrir"]))
    for traits, want in (({"gourmand": 100}, 1.4), ({"gourmand": 0}, 0.6), ({"grognon": 80}, 1.0), ({"gourmand": "beaucoup"}, 1.0), (None, 1.0)):
        hub, N, c = belly(None, at(2026, 11, 9, 9), traits)
        N.ventre = 80.0
        walk(N, c, at(2026, 11, 9, 10))
        check(f"traits {traits}: {6 * want:.1f} points an hour (gourmand read defensively)", abs(80 - N.ventre - 6 * want) < 0.01, f"{80 - N.ventre:.2f}")
    hub.s["caractere"] = "pas un dict"
    check("a caractère that is not a dict: gourmand 50", nourrir.trait(hub, "gourmand") == 50)
    for speed, per_h in (("lente", 3), ("rapide", 12)):
        hub, N, c = belly(None, at(2026, 11, 9, 9))
        N.reglages(vitesse=speed)
        N.ventre, N.t = 80.0, c.t
        walk(N, c, at(2026, 11, 9, 10))
        check(f"speed {speed}: {per_h} points an hour", abs(80 - N.ventre - per_h) < 0.01, f"{80 - N.ventre:.2f}")
    # the night
    hub, N, c = belly(None, at(2026, 11, 9, 23, 30))
    N.ventre = 70.0
    walk(N, c, at(2026, 11, 10, 5, 30))
    check("23:30 to 5:30: his belly sleeps too", abs(N.ventre - 70) < 0.01, f"{N.ventre:.2f}")
    hub, N, c = belly(None, at(2026, 11, 9, 22))
    N.ventre = 70.0
    walk(N, c, at(2026, 11, 10, 7))
    check("22:00 to 7:00: only 22-23 and 6-7 count (12 points)", abs(N.ventre - 58) < 0.01, f"{N.ventre:.2f}")
    check("awake hours over a day: 17", abs(nourrir.awake_hours(at(2026, 11, 9, 0), at(2026, 11, 10, 0)) - 17) < 1e-6)
    hub, N, c = belly(None, at(2026, 11, 9, 9))
    N.ventre = 3.0
    walk(N, c, at(2026, 11, 9, 18))
    check("a whole day without food: 0, never less (he never dies)", N.ventre == 0, str(N.ventre))
    # switched off
    hub, N, c = belly(None, at(2026, 11, 9, 9))
    N.ventre = 50.0
    N.reglages(on=False)
    walk(N, c, at(2026, 11, 9, 15))
    check("off: his belly stays as it is", N.ventre == 50 and hub.s["nourrir"]["on"] is False and hub.s["nourrir"]["reglages"]["on"] is False)
    check("off: a meal is refused with a word", N.donner("pizza") is None and "pause" in (hub.s["toast"] or {}).get("msg", ""))
    N.reglages(on=True)
    walk(N, c, at(2026, 11, 9, 16))
    check("on again: the time it was off does not count", abs(N.ventre - 44) < 0.01, f"{N.ventre:.2f}")
    # the clock jumps once he runs: the Pi has no RTC, it boots on the time it saved, then NTP sets it
    with tempfile.TemporaryDirectory() as d:
        _, N, c = belly(d, at(2026, 11, 6, 12, 1), ventre=90, t=at(2026, 11, 6, 12), on=True, vitesse="normale")
        v0 = N.ventre
        c.t = at(2026, 11, 9, 12)
        N.tick()
        check("a jump of 3 days after the start counts like the server down: 6 awake hours at most (-36), not starving",
              abs(N.ventre - (v0 - 36)) < 0.01 and v0 > 89, f"{v0:.2f} -> {N.ventre:.2f}")
        _, N, c = belly(d, at(2026, 11, 6, 12, 1), ventre=40, t=at(2026, 11, 6, 12), on=True, vitesse="rapide")
        c.t = at(2026, 11, 9, 12)
        N.tick()
        check("…fast, or already a little hungry: never below 25 (a little hungry at worst)", abs(N.ventre - 25) < 0.01, f"{N.ventre:.2f}")
    hub, N, c = belly(None, at(2026, 11, 9, 9))
    N.ventre = 80.0
    c.t += 10 * 60
    N.tick()
    check("a stalled loop (10 min between two ticks) still counts its 10 min", abs(N.ventre - 79) < 0.01, f"{N.ventre:.2f}")
    c.t += 10
    check("a meal", N.donner("pomme") is not None)
    c.t -= 3600
    N.tick()
    v = N.ventre
    check("the clock set back an hour: his belly does not change…", N.t == c.t and abs(v - min(100, 79 + 15)) < 0.05, f"{N.t} {c.t} {v}")
    c.t += 10
    check("…he can eat again 10 s later (not an hour)", N.donner("banane") is not None)
    v = N.ventre
    walk(N, c, c.t + 3600)
    check("…and his belly empties again from there", abs(N.ventre - (v - 6)) < 0.05, f"{v:.2f} -> {N.ventre:.2f}")


def meal_checks():
    hub, N, c = belly(None, at(2026, 11, 9, 12))
    g = N.gouts
    check("tastes: a favourite, 5 likes, 3 dislikes, all different", g["prefere"] in nourrir.BY_ID and len(g["aime"]) == 5 and len(g["deteste"]) == 3
          and len({g["prefere"], *g["aime"], *g["deteste"]}) == 9, str(g))
    N.gouts = {"prefere": "pizza", "aime": ["frites", "cookie", "soupe", "sushi", "pomme"], "deteste": ["brocoli", "lait", "fraise"]}

    def eat(plat, v=40.0, step=10):
        c.t += step
        N.ventre, N.t = v, c.t                      # his belly at v right now
        return N.donner(plat)

    check("his favourite: prefere", eat("pizza") == "prefere" and abs(N.ventre - 75) < 0.01, f"{N.ventre}")
    check("a meal is on his face screen, the animation stops", hub.s["screen"] == "visage" and hub.s["anim"] is None)
    d = hub.s["nourrir"]["dernier"]
    check("the snapshot's dernier: id, plat, t (ms), reaction, rot", d["plat"] == "pizza" and d["reaction"] == "prefere" and d["id"] == 1 and abs(d["t"] - c.t * 1000) < 1
          and isinstance(d["rot"], bool), str(d))
    c.t += 2
    check("again 2 s later: too soon, nothing happens", N.donner("frites") is None and hub.s["nourrir"]["dernier"]["id"] == 1)
    check("liked: aime", eat("frites") == "aime")
    check("disliked: beurk, he eats it anyway (a little less filling)", eat("brocoli") == "beurk" and abs(N.ventre - (40 + 12 * 0.7)) < 0.01, f"{N.ventre}")
    check("a vegetable he does not mind: legume", eat("carotte") == "legume")
    check("robot food: robot", eat("pile") == "robot")
    check("something else: miam", eat("baguette") == "miam")
    check("full: he refuses kindly, his belly does not change", eat("baguette", 95) == "plein" and N.ventre == 95)
    check("a big meal on a nearly full belly: eclate, he always burps, belly 100", eat("burger", 80) == "eclate" and N.ventre == 100 and hub.s["nourrir"]["dernier"]["rot"] is True)
    N.sucres = 0
    r = [eat("glace", 30), eat("bonbon", 30), eat("gateau", 30), eat("glace", 30)]
    check("the third sweet in a row: a sugar rush, and the count starts again", r == ["miam", "miam", "sucre", "miam"], str(r))
    N.sucres = 0
    r = [eat("glace", 30), eat("pomme", 30), eat("bonbon", 30), eat("gateau", 30)]
    check("…not when something else came in between", "sucre" not in r, str(r))
    N.sucres = 0
    r = [eat("glace", 30, 3000), eat("bonbon", 30, 3000), eat("gateau", 30, 3000)]
    check("…nor when they are more than 45 min apart", "sucre" not in r, str(r))
    hub.s["caractere"] = {"traits": {"grognon": 80}}
    check("grognon 80 and a food he dislikes: he refuses, his belly does not change", eat("brocoli", 40) == "refuse" and N.ventre == 40)
    hub.s["caractere"] = {"traits": {"gourmand": 100}}
    check("gourmand 100: room left at 95", eat("cookie", 95) != "plein")
    hub.s["caractere"] = {"traits": {"farceur": 100}}
    rots = sum(1 for _ in range(60) if eat("pomme", 20) == "aime" and hub.s["nourrir"]["dernier"]["rot"])
    hub.s["caractere"] = {"traits": {"farceur": 0}}
    rots0 = sum(1 for _ in range(60) if eat("pomme", 20) == "aime" and hub.s["nourrir"]["dernier"]["rot"])
    check(f"a burp sometimes, more when he is farceur ({rots0}/60 at 0, {rots}/60 at 100)", 0 <= rots0 < rots and rots >= 8, f"{rots0} {rots}")
    hub.s.pop("caractere")
    check("the journal: the last 10 meals, newest first", len(hub.s["nourrir"]["journal"]) == 10 and hub.s["nourrir"]["journal"][0]["plat"] == "pomme")
    check("an unknown food: nothing", N.donner("caillou") is None)
    picks = {N.choisir() for _ in range(200)}
    check("what he picks himself: often his favourite, never what he dislikes", "pizza" in picks and not picks & set(N.gouts["deteste"]), str(picks))


def file_checks():
    with tempfile.TemporaryDirectory() as d:
        hub, N, c = belly(d, at(2026, 11, 9, 9), seed=5)
        g = dict(N.gouts)
        N.ventre = 64.0
        c.t += 10
        N.donner("pomme")
        saved = json.loads((Path(d) / "nourrir.json").read_text())
        check("data_dir/nourrir.json: belly, time, seed, tastes, journal", {"ventre", "t", "graine", "gouts", "journal", "on", "vitesse"} <= set(saved) and saved["journal"][0]["plat"] == "pomme")
        hub2, N2, c2 = belly(d, c.t + 60, seed=99)
        check("the tastes stay across a restart (another random seed would give others)", N2.gouts == g and N2.gouts != nourrir.roll(99), f"{N2.gouts} {g}")
        check("…and the journal and the last meal", N2.journal and N2.journal[0]["plat"] == "pomme" and hub2.s["nourrir"]["dernier"]["plat"] == "pomme")
        N2.new_tastes()
        hub3, N3, _ = belly(d, c.t + 120, seed=7)
        check("new tastes: drawn again, and kept", N2.gouts != g and N3.gouts == N2.gouts)
        check("the same seed always gives the same tastes", nourrir.roll(1234) == nourrir.roll(1234) and nourrir.roll(1234) != nourrir.roll(4321))
        # the server was down
        t0 = at(2026, 11, 6, 12)
        _, Nd, _ = belly(d, at(2026, 11, 9, 12), ventre=90, t=t0, on=True, vitesse="normale")
        check("down for 3 days at 90: at most 6 awake hours count (54)", abs(Nd.ventre - 54) < 0.01, f"{Nd.ventre:.2f}")
        _, Nd, _ = belly(d, at(2026, 11, 9, 12), ventre=90, t=t0, on=True, vitesse="rapide")
        check("…fast: he wakes up a little hungry at worst (25), not starving", abs(Nd.ventre - 25) < 0.01, f"{Nd.ventre:.2f}")
        _, Nd, _ = belly(d, at(2026, 11, 9, 12), ventre=12, t=t0, on=True)
        check("…already very hungry: no worse", abs(Nd.ventre - 12) < 0.01, f"{Nd.ventre:.2f}")
        _, Nd, _ = belly(d, at(2026, 11, 10, 7), ventre=70, t=at(2026, 11, 9, 23, 30), on=True)
        check("…down overnight: only the morning hour counts", abs(Nd.ventre - 64) < 0.01, f"{Nd.ventre:.2f}")
        _, Nd, _ = belly(d, at(2026, 11, 9, 12), ventre=70, t=t0, on=False)
        check("…switched off: nothing counts", abs(Nd.ventre - 70) < 0.01)
        (Path(d) / "nourrir.json").write_text("{ pas du json")
        hub4, N4, _ = belly(d, at(2026, 11, 9, 12))
        check("a broken nourrir.json: a new belly, no crash", hub4.s["nourrir"]["ventre"] == 80)
        # a hand-edited file: every value out of place takes its default, the server starts, meals work
        now = at(2026, 11, 9, 12)
        for name, saved, want in (
                ("a time before 2000 (-1e13)", {"ventre": 70, "t": -1e13}, 70),
                ("a time that is not a number", {"ventre": 70, "t": "hier"}, 70),
                ("ventre NaN", {"ventre": float("nan"), "t": now}, 80),
                ("ventre Infinity", {"ventre": float("inf"), "t": now}, 80),
                ("ventre 1e9", {"ventre": 1e9, "t": now}, 100),
                ("ventre -5", {"ventre": -5, "t": now}, 0),
                ("ventre as text", {"ventre": "plein", "t": now}, 80),
                ("a last meal with an id that is not a number", {"ventre": 40, "t": now, "dernier": {"id": "x", "plat": "pomme", "t": now * 1000}}, 40),
                ("a last meal with no food", {"ventre": 40, "t": now, "dernier": {"id": 3}}, 40),
                ("a journal of junk", {"ventre": 40, "t": now, "journal": [{"plat": "pomme", "t": "x"}, 5, {"plat": ["pizza"]}, {"plat": "caillou", "t": 1}]}, 40),
                ("a journal that is not a list", {"ventre": 40, "t": now, "journal": {"plat": "pomme"}}, 40),
                ("a speed that is a list", {"ventre": 40, "t": now, "vitesse": []}, 40),
                ("tastes made of lists", {"ventre": 40, "t": now, "gouts": {"prefere": ["pizza"], "aime": [[1]], "deteste": []}}, 40),
                ("a seed that is true, sweets out of range", {"ventre": 40, "t": now, "graine": True, "sucres": 1e9, "sucre_t": float("nan")}, 40),
                ("on as text", {"ventre": 40, "t": now, "on": "non"}, 40),
                ("a number too big for a float", {"ventre": 40, "t": now, "sucres": 10 ** 400}, None)):
            (Path(d) / "nourrir.json").write_text(json.dumps(saved))
            try:
                hub5, N5, c5 = belly(d, now, seed=11)
                n = hub5.s["nourrir"]
                c5.t += 10
                r = N5.donner("pomme")
                ok = ((want is None or n["ventre"] == want) and r in nourrir.REACTIONS and hub5.s["nourrir"]["dernier"]["plat"] == "pomme"
                      and n["reglages"]["vitesse"] in nourrir.SPEEDS and n["gouts"]["prefere"] in nourrir.BY_ID and all(j["plat"] in nourrir.BY_ID for j in n["journal"]))
                json.dumps(hub5.s["nourrir"], allow_nan=False)
                check(f"nourrir.json with {name}: he starts (ventre {n['ventre']}), eats, and his snapshot is clean JSON", ok, json.dumps(n)[:200])
            except Exception as e:      # noqa: BLE001
                check(f"nourrir.json with {name}: he starts", False, repr(e))


async def command_checks():
    hub = Hub({}, demo=True)
    clock = Clock(at(2026, 11, 9, 12))
    N = nourrir.Nourrir(hub, None, clock, random.Random(3))
    hub.nourrir = N
    seen = []

    @hub.action("chat.ask")
    async def ask(text):
        seen.append(("chat", text))

    @hub.action("scene.play")
    async def play(id):
        hub.s["scene"] = {"id": id}

    @hub.action("anim.play")
    async def anim(id, loops=None):
        seen.append(("anim", id))

    @hub.action("screen.show")
    async def show(screen):
        hub.s["screen"] = screen

    async def cmd(text, step=10):
        clock.t += step
        N.ventre = 30.0
        seen.clear()
        hub.s["scene"] = None
        before = (hub.s["nourrir"]["dernier"] or {}).get("id")
        await commands.run(hub, text)
        d = hub.s["nourrir"]["dernier"] or {}
        return d.get("plat") if d.get("id") != before else None

    for text, want in (("mange une pomme", "pomme"), ("Mange la pizza !", "pizza"), ("donne-lui une pizza", "pizza"), ("donne lui des frites", "frites"),
                       ("donne une banane à Pixel", "banane"), ("bois un verre de lait", "lait"), ("mange donc un cookie", "cookie"), ("mange de l’électricité", "prise"),
                       ("Pixel, mange un octet croustillant", "octet"), ("offre-lui un gâteau", "gateau"), ("mange des spaghettis", "pates")):
        check(f"« {text} »: he eats {want}", await cmd(text) == want and not seen)
    for text in ("nourris Pixel", "à table !", "A table", "nourris-le", "donne-lui à manger"):
        got = await cmd(text)
        check(f"« {text} »: he picks something himself", got in nourrir.BY_ID and hub.s["nourrir"]["dernier"]["choisi"] is True, str(got))
    for text in ("tu as faim ?", "Pixel, tu as faim ?", "t'as faim", "as-tu faim ?"):
        await cmd(text)
        check(f"« {text} »: he answers with his belly (nourrir-ventre)", (hub.s["scene"] or {}).get("id") == "nourrir-ventre" and not seen)
    for text in ("donne-moi la météo", "mange", "mange quoi ce soir ?", "tu as faim de quoi", "donne-lui un bisou", "fais une liste de courses", "nourriture"):
        got = await cmd(text)
        check(f"« {text} »: not a meal, Claude gets it", got is None and seen == [("chat", text)], str(seen))
    await cmd("danse")
    check("« danse » is still an animation", seen == [("anim", "danse")], str(seen))
    clock.t += 10
    await commands.run(hub, "mange une pomme")
    t0 = hub.s["nourrir"]["dernier"]["t"]
    await commands.run(hub, "mange une poire")
    await commands.run(hub, "mange une banane")
    check("too soon after a meal: « Doucement, il mâche encore ! »", hub.s["nourrir"]["dernier"]["t"] == t0 and "mâche" in hub.s["toast"]["msg"], str(hub.s["toast"]))
    N.reglages(on=False)
    clock.t += 10
    await commands.run(hub, "mange une pomme")
    check("off: the command says so", hub.s["nourrir"]["dernier"]["t"] == t0 and "pause" in hub.s["toast"]["msg"])
    N.reglages(on=True)
    # Claude's tool
    clock.t += 10
    out = await nourrir.run_tool(hub, {"plat": "pizza"})
    check("Claude's tool: he eats, and the answer says how it went and his belly", hub.s["nourrir"]["dernier"]["plat"] == "pizza" and "ventre à" in out and "pizza" in out, out)
    out2 = await nourrir.run_tool(hub, {"plat": "au-choix"})
    check("Claude's tool too soon: he is still chewing", "mâches" in out2, out2)
    clock.t += 10
    out3 = await nourrir.run_tool(hub, {"plat": "au-choix"})
    check("Claude's tool, « au-choix »: he picks", hub.s["nourrir"]["dernier"]["choisi"] is True and "ventre" in out3, out3)


def start_server(port, datadir):
    try:
        socket.create_connection(("127.0.0.1", port), 0.2).close()
        raise SystemExit(f"le port {port} est déjà pris (NOURRIR_PY_PORT=… pour un autre)")
    except OSError:
        pass
    cfg = Path(datadir) / "config.toml"
    cfg.write_text(f'data_dir = "{datadir}"\n')
    p = subprocess.Popen([sys.executable, str(APP / "server.py"), "--demo", "--port", str(port), "--config", str(cfg)], cwd=APP,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(100):
        try:
            socket.create_connection(("127.0.0.1", port), 0.2).close()
            return p
        except OSError:
            time.sleep(0.1)
    p.kill()
    raise SystemExit(f"le serveur de démo ne démarre pas sur le port {port}")


async def server_checks(first):
    async with aiohttp.ClientSession() as http:
        async with http.ws_connect(f"http://127.0.0.1:{PORT}/ws") as ws:
            state = {}

            async def pump(seconds):
                end = asyncio.get_event_loop().time() + seconds
                while (left := end - asyncio.get_event_loop().time()) > 0:
                    try:
                        m = await ws.receive(timeout=left)
                    except asyncio.TimeoutError:
                        break
                    if m.type == aiohttp.WSMsgType.TEXT:
                        state.update(json.loads(m.data)["data"])

            async def act(action, wait=0.3, **a):
                await ws.send_str(json.dumps({"action": action, "args": a}))
                await pump(wait)

            await pump(0.5)
            n = state.get("nourrir") or {}
            if first:
                check("the demo server's snapshot has 'nourrir'", {"on", "ventre", "faim", "dernier", "gouts", "journal", "reglages"} <= set(n), str(n))
                await act("screen.show", screen="meteo")
                await act("nourrir.donner", plat="pomme")
                d = state["nourrir"]["dernier"] or {}
                check("nourrir.donner over the WebSocket: he eats, on his face screen", d.get("plat") == "pomme" and state["screen"] == "visage", str(d))
                await act("nourrir.donner", plat="pizza")
                check("…and not again at once", state["nourrir"]["dernier"]["plat"] == "pomme")
                await act("nourrir.donner", plat="<script>")
                await act("nourrir.reglages", vitesse="turbo")
                check("an unknown food or speed is refused", state["nourrir"]["reglages"]["vitesse"] == "normale")
                await act("nourrir.reglages", vitesse="rapide")
                await act("nourrir.gouts")
                return state["nourrir"]["gouts"]
            return n


async def main():
    static_checks()
    time_checks()
    meal_checks()
    file_checks()
    await command_checks()
    with tempfile.TemporaryDirectory() as tmp:
        srv = start_server(PORT, tmp)
        try:
            tastes = await server_checks(True)
        finally:
            srv.terminate()
            srv.wait()
        srv = start_server(PORT, tmp)
        try:
            n = await server_checks(False)
            check("after a restart of the server: the same tastes, the speed, the last meal", n["gouts"] == tastes and n["reglages"]["vitesse"] == "rapide"
                  and (n["dernier"] or {}).get("plat") == "pomme", str(n))
        finally:
            srv.terminate()
            srv.wait()


if __name__ == "__main__":
    asyncio.run(main())
    print("\n%d failure(s)" % len(fails))
    sys.exit(1 if fails else 0)
