#!/usr/bin/env python3
"""Pixel's shop (pixel/boutique.py), and « Son look » wearing what it sells:  python3 tests/test_boutique.py

Without a server: the catalogue read from web/scenes/boutique.js (one B( line per accessory, the files that must agree: the
pages, the lab's mirror, the events), the coins (the start, each way to win some, the gift once a day, a new day), buying
(enough coins or not, he puts it on at once), wearing (one accessory per slot) and taking off, the typed commands (and what
is not one), Claude's tool, boutique.json (kept across a restart; a broken or hand-edited file never stops him).
With « Son look » (pixel/look.py): it wears what was bought, one item per slot with his own free ones (never two hats), never
what was not bought; his pyjama at night; « enlève tout » of the shop leaves his own items; a lost boutique.json takes off what
he no longer owns; what an older boutique.json had him wear goes over to « Son look ».
Then a real demo server on port 8176 (BOUTIQUE_PY_PORT=… for another): the snapshot, the actions, a meal and an exercise
win coins, a restart keeps his purse and his clothes.
"""
import asyncio
import datetime as dt
import json
import os
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
from pixel import boutique, commands, exos, look, nourrir, scenes, timer  # noqa: E402
from pixel.claude import TOOLS, check as claude_check  # noqa: E402
from pixel.state import Hub  # noqa: E402

PORT = int(os.environ.get("BOUTIQUE_PY_PORT") or 8176)   # BOUTIQUE_PY_PORT=… (test_boutique.js has BOUTIQUE_PORT)
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


def shop(datadir=None, start=None, saved=None):
    """A Boutique on a fake clock; saved: what boutique.json holds before it starts."""
    clock = Clock(start or at(2026, 11, 9, 9))
    if saved is not None and datadir:
        (Path(datadir) / "boutique.json").write_text(saved if isinstance(saved, str) else json.dumps(saved))
    hub = Hub({}, demo=True)
    S = boutique.Boutique(hub, datadir, clock)
    hub.boutique = S
    return hub, S, clock


def said(hub):
    return (hub.s.get("toast") or {}).get("msg", "")


def catalogue_checks():
    web = APP / "web"
    pack = (web / "scenes" / "boutique.js").read_text()
    I = boutique.ITEMS
    check(f"the catalogue: {len(I)} accessories read from web/scenes/boutique.js, one per B( line", len(I) == 14 and len(I) == len(re.findall(r"^B\('", pack, re.M)), str(len(I)))
    check("ids are unique, every slot is known and has accessories, every price is 5 to 200", len(boutique.BY_ID) == len(I)
          and {i["slot"] for i in I} == set(boutique.SLOTS) and all(5 <= i["prix"] <= 200 for i in I), str([i for i in I if not 5 <= i["prix"] <= 200]))
    check("every accessory has a label and a name « son… », « sa… » or « ses… »", all(i["label"] and re.match(r"^(son|sa|ses) \S", i["nom"]) for i in I),
          str([i["nom"] for i in I if not re.match(r"^(son|sa|ses) \S", i["nom"])]))
    check("the pack's slots are the module's, with the same names", all(f"['{s}', '{n}']" in pack for s, n in boutique.SLOTS.items()))
    check("something can be bought with the coins he starts with", any(i["prix"] <= boutique.START for i in I))
    js = set(re.findall(r"\bS\('(boutique-[a-z]+)'", pack))
    check("his four reactions are scenes pixel/scenes.py knows", js == {"boutique-nouveau", "boutique-miroir", "boutique-range", "boutique-cadeau"} and js <= set(scenes.BY_ID), str(js))
    persona = (web / "persona.js").read_text()
    check("persona.js lists the shop's events", all(f"'boutique-{e}':" in persona for e in ("achat", "porte", "retire", "cadeau")))
    for f, scripts in (("index.html", ("app/scenes/boutique.js", "app/screens.js", "app/nourrir.js", "app/boutique.js", "app/app.js")),
                       ("lab/index.html", ("../scenes/boutique.js", "../screens.js", "demo-hub.js", "../boutique.js", "lab.js", "boutique-lab.js"))):
        html = (web / f).read_text()
        pos = [html.find(f'src="{s}"') for s in scripts]
        check(f"{f} loads the pack before screens.js, boutique.js after it, in order", -1 not in pos and pos == sorted(pos), str(pos))
    check("index.html loads boutique.css", 'href="app/boutique.css"' in (web / "index.html").read_text())
    hubjs = (web / "lab" / "demo-hub.js").read_text()
    check("the lab's mirror has the same actions, the same start and gift", all(f"'boutique.{a}'" in hubjs for a in ("acheter", "porter", "retirer", "cadeau"))
          and f"START = {boutique.START}, GIFT = {boutique.GIFT}" in hubjs)
    check("the lab's mirror has the same reasons to win coins", all(f"'{r}'" in hubjs.split("const BOUT")[1][:1200] for r in boutique.RAISONS))
    tool = next((t for t in TOOLS if t["name"] == "wear_accessory"), None)
    check("Claude can put on every accessory he owns, or nothing", tool is not None and tool["input_schema"]["properties"]["objet"]["enum"] == boutique.IDS + ["rien"])
    check("…and its input is checked", claude_check("wear_accessory", {"objet": "monocle"}) is None and claude_check("wear_accessory", {"objet": "rien", "enlever": True}) is None
          and claude_check("wear_accessory", {"objet": "epee"}) and claude_check("wear_accessory", {"objet": "monocle", "enlever": "oui"}) and claude_check("wear_accessory", {}))
    check("nothing the shop sells is one of « Son look »'s own free items (no cap, crown or bow tie twice)", not set(boutique.IDS) & set(look.ITEMS), str(set(boutique.IDS) & set(look.ITEMS)))
    check("its slots are « Son look »'s, and « Son look » knows every accessory (name, slot, « une cravate »)", set(boutique.SLOTS) <= set(look.SLOTS)
          and all(look.EXTRA.get(i["id"], ())[:2] == (i["label"], i["slot"]) for i in I) and look.EXTRA["cravate"][2] == "une cravate" and look.EXTRA["oreilles-chat"][2] == "des oreilles de chat")


def coin_checks():
    hub, S, c = shop()
    b = hub.s["boutique"]
    check("a new Pixel: 20 coins, nothing owned, nothing worn, today's gift to open", b["pieces"] == 20 and b["possede"] == [] and b["porte"] == {} and b["cadeau"] is True
          and b["gain"] is None and b["dernier"] is None and b["journal"] == [], str(b))
    check("coins won are added, with their reason and time, newest first", S.gagner(2, "exo") == 2 and S.gagner(1, "repas") == 1 and hub.s["boutique"]["pieces"] == 23
          and [(j["n"], j["raison"]) for j in hub.s["boutique"]["journal"]] == [(1, "repas"), (2, "exo")] and hub.s["boutique"]["gain"]["id"] == 2
          and hub.s["boutique"]["gain"]["t"] == c.t * 1000 and hub.s["boutique"]["total"] == 3, str(hub.s["boutique"]))
    check("nothing for no coin, a negative number, a reason he does not know, not a number", [S.gagner(0, "exo"), S.gagner(-5, "exo"), S.gagner(3, "triche"), S.gagner("3", "exo"),
                                                                                              S.gagner(float("nan"), "exo"), S.gagner(True, "exo")] == [0] * 6 and S.pieces == 23)
    for _ in range(15):
        S.gagner(1, "exo")
    check("the journal keeps the last 10 gains", len(hub.s["boutique"]["journal"]) == 10 and S.pieces == 38)
    S.pieces = boutique.MAX - 3
    check("his purse never holds more than 99 999", S.gagner(10, "exo") == 3 and S.pieces == boutique.MAX and S.gagner(1, "exo") == 0)
    # the gift of the day
    hub, S, c = shop()
    check("the gift of the day: 5 coins, his reaction on his face screen", S.offrir() is True and S.pieces == 25 and hub.s["boutique"]["cadeau"] is False
          and hub.s["boutique"]["dernier"]["quoi"] == "cadeau" and hub.s["boutique"]["dernier"]["n"] == 5 and hub.s["screen"] == "visage" and hub.s["boutique"]["journal"][0]["raison"] == "cadeau")
    hub.s["toast"] = None
    check("…once a day only: a kind word, no coin", S.offrir() is False and S.pieces == 25 and "demain" in said(hub))
    c.t = at(2026, 11, 9, 23, 59)
    S.tick()
    check("still the same day at 23:59", hub.s["boutique"]["cadeau"] is False)
    c.t = at(2026, 11, 10, 0, 1)
    S.tick()
    check("after midnight the gift is there again (the minute's tick says so)", hub.s["boutique"]["cadeau"] is True and S.offrir() is True and S.pieces == 30)


def wardrobe_checks():
    """Without « Son look » (a Pixel without it): the shop keeps what he wears itself."""
    hub, S, c = shop()
    check("buying with enough coins: paid, owned, worn at once, his face screen", S.acheter("lunettes-rondes") == "ok" and S.pieces == 0 and S.possede == ["lunettes-rondes"]
          and S.porte == {"yeux": "lunettes-rondes"} and hub.s["boutique"]["dernier"]["quoi"] == "achat" and hub.s["boutique"]["dernier"]["objet"] == "lunettes-rondes" and hub.s["screen"] == "visage")
    hub.s["toast"] = None
    check("not enough coins: nothing bought, he says how many are missing", S.acheter("cravate") == "pauvre" and S.possede == ["lunettes-rondes"] and S.pieces == 0
          and "Il te manque 20 pièces pour la cravate" in said(hub), said(hub))
    check("an accessory that does not exist: nothing", S.acheter("epee") is None and S.porter("epee") is False and S.retirer("epee") is False)
    S.gagner(200, "labo")
    check("a second pair of glasses takes the first one's place, a hat goes with it", S.acheter("monocle") == "ok" and S.acheter("oreilles-chat") == "ok"
          and S.porte == {"tete": "oreilles-chat", "yeux": "monocle"} and S.pieces == 120 and S.possede == ["oreilles-chat", "lunettes-rondes", "monocle"], str((S.porte, S.pieces, S.possede)))
    check("buying what he already has costs nothing: he just puts it on", S.acheter("lunettes-rondes") == "deja" and S.pieces == 120 and S.porte["yeux"] == "lunettes-rondes")
    n = hub.s["boutique"]["dernier"]["id"]
    check("putting on what he already wears is not news", S.porter("lunettes-rondes") is True and hub.s["boutique"]["dernier"]["id"] == n)
    hub.s["toast"] = None
    check("he cannot wear what he does not own: its price is said", S.porter("aureole") is False and S.porte.get("tete") == "oreilles-chat"
          and "80 pièces" in said(hub) and "l’auréole" in said(hub), said(hub))
    check("taking off by its id, only if he wears it", S.retirer("monocle") is False and S.retirer("oreilles-chat") is True and S.porte == {"yeux": "lunettes-rondes"}
          and hub.s["boutique"]["dernier"]["quoi"] == "retire")
    S.porter("oreilles-chat")
    check("taking off by slot, then everything", S.retirer(slot="yeux") is True and S.porte == {"tete": "oreilles-chat"} and S.retirer(slot="cou") is False
          and S.retirer() is True and S.porte == {} and S.retirer() is False)
    check("what he owns stays his: nothing is ever lost", S.possede == ["oreilles-chat", "lunettes-rondes", "monocle"] and S.pieces == 120)
    check("names: « sa cravate » is « la cravate », « son auréole » « l’auréole », « ses lunettes rondes » « les lunettes rondes »",
          [S._le(boutique.BY_ID[i]) for i in ("cravate", "aureole", "lunettes-rondes", "monocle")] == ["la cravate", "l’auréole", "les lunettes rondes", "le monocle"])
    S.porter("oreilles-chat")
    S.porter("lunettes-rondes")
    check("his outfit in a few words", S.tenue() == "ses oreilles de chat et ses lunettes rondes" and "120 pièces" in S.status() and "Monocle" in S.status(), S.status())


async def look_checks():
    """With « Son look »: it wears what was bought, with his own free items, one per slot."""
    day = [dt.datetime(2026, 11, 9, 12)]
    with tempfile.TemporaryDirectory() as d:
        hub = Hub({}, demo=True)
        L = look.setup(hub, d, now=lambda: day[0])
        clock = Clock(at(2026, 11, 9, 12))
        S = boutique.setup(hub, d, clock)
        S.gagner(200, "labo")
        check("bought: « Son look » wears it at once, the shop's own scene tells it (not his look's)", S.acheter("oreilles-chat") == "ok"
              and hub.s["look"]["accessoires"]["tete"] == "oreilles-chat" and hub.s["look"]["porte"]["tete"] == "oreilles-chat" and S.porte == {"tete": "oreilles-chat"}
              and hub.s["look"]["change"]["par"] == "boutique" and hub.s["boutique"]["dernier"]["quoi"] == "achat", str(hub.s["look"]["change"]))
        L.set({"porte": "chapeau"})
        check("his own top hat takes the cat's ears' place: never two hats", hub.s["look"]["porte"]["tete"] == "chapeau" and S.porte == {}
              and "par" not in hub.s["look"]["change"])
        check("the shop puts the ears back on", S.porter("oreilles-chat") is True and hub.s["look"]["porte"]["tete"] == "oreilles-chat")
        L.set({"porte": "aureole"})
        check("« Son look » never puts on what was not bought", hub.s["look"]["accessoires"]["tete"] == "oreilles-chat" and look.apply(hub.s["look"], {"porte": "aureole"})[1] is None)
        check("he says what he wears, with the shop's words", "des oreilles de chat" in L.status(), L.status())
        L.set({"porte": "noeud"})
        S.acheter("pansement")
        check("his own bow tie, the shop's ears and plaster: one per slot", {k: hub.s["look"]["porte"][k] for k in ("tete", "cou", "visage")} == {"tete": "oreilles-chat", "cou": "noeud", "visage": "pansement"}
              and S.porte == {"tete": "oreilles-chat", "visage": "pansement"})
        day[0] = dt.datetime(2026, 11, 9, 23, 30)
        L.refresh()
        check("at night his nightcap takes the ears' place (they are still his choice for the morning), the plaster stays", hub.s["look"]["porte"]["tete"] == "bonnet-nuit"
              and S.porte == {"visage": "pansement"} and hub.s["look"]["accessoires"]["tete"] == "oreilles-chat")
        day[0] = dt.datetime(2026, 11, 10, 9)
        L.refresh()
        check("…and the morning brings them back", hub.s["look"]["porte"]["tete"] == "oreilles-chat")
        check("the shop's « retirer » (no accessory named) takes off what was bought, his own bow tie stays", S.retirer() is True and hub.s["look"]["accessoires"]["cou"] == "noeud"
              and hub.s["look"]["accessoires"]["tete"] is None and hub.s["look"]["accessoires"]["visage"] is None and S.porte == {})
        S.porter("oreilles-chat")
        hub.s["toast"] = None
        check("a typed « enlève tout » is « Son look »'s: everything comes off, his bow tie too", await boutique.command(hub, "enleve tout") is False and look.command(hub, "enleve tout") == ("set", {"enleve": "tout"}))
        S.porter("oreilles-chat")
        (Path(d) / "boutique.json").unlink()
        hub2 = Hub({}, demo=True)
        look.setup(hub2, d, now=lambda: day[0])
        check("look.json keeps the ears", hub2.s["look"]["accessoires"]["tete"] == "oreilles-chat")
        S2 = boutique.setup(hub2, d, Clock(at(2026, 11, 10, 9)))
        check("boutique.json lost: what he no longer owns comes off « Son look »", hub2.s["look"]["accessoires"]["tete"] is None and S2.possede == [] and hub2.s["look"]["accessoires"]["cou"] == "noeud")
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "boutique.json").write_text(json.dumps({"pieces": 3, "possede": ["cravate", "monocle"], "porte": {"cou": "cravate", "yeux": "monocle"}}))
        hub = Hub({}, demo=True)
        look.setup(hub, d, now=lambda: dt.datetime(2026, 11, 9, 12))
        S = boutique.setup(hub, d, Clock(at(2026, 11, 9, 12)))
        saved = json.loads((Path(d) / "boutique.json").read_text())
        check("an older boutique.json: what he wore goes over to « Son look », once", hub.s["look"]["accessoires"]["cou"] == "cravate" and hub.s["look"]["accessoires"]["yeux"] == "monocle"
              and S.porte == {"yeux": "monocle", "cou": "cravate"} and saved["porte"] == {} and json.loads((Path(d) / "look.json").read_text())["accessoires"]["cou"] == "cravate")


async def earning_checks():
    """What wins coins: a meal, an exercise, a finished work timer."""
    with tempfile.TemporaryDirectory() as d:
        hub = Hub({}, demo=True)
        S = boutique.setup(hub, d)
        N = nourrir.setup(hub, d)
        N.ventre = 40
        r = N.donner(N.gouts["prefere"])
        check("his favourite meal wins 2 coins", r == "prefere" and S.pieces == 22 and S.journal[0]["raison"] == "repas", f"{r} {S.pieces}")
        N.last_meal = -1e9
        N.ventre = 100
        other = next(i for i in nourrir.IDS if i != N.gouts["prefere"])
        check("a meal he refuses (full) wins nothing", N.donner(other) == "plein" and S.pieces == 22)
        N.last_meal = -1e9
        N.ventre = 30
        plain = next(i for i in nourrir.IDS if i != N.gouts["prefere"] and i not in N.gouts["deteste"])
        N.donner(plain)
        check("another meal he eats wins 1", S.pieces == 23, str(S.pieces))
        exos.setup(hub, d)
        ex = hub.exos
        ex.nouveau(kind="addition", mode="exo")
        ex.repondre(ex.cur["answer"])
        check("an exercise right at once wins 2 coins", S.pieces == 25 and S.journal[0]["raison"] == "exo", f"{S.pieces} {S.journal[:1]}")
        ex.nouveau(kind="addition", mode="exo")
        wrong = next(x for x in ex.cur["choices"] if str(x) != str(ex.cur["answer"]))
        ex.repondre(wrong)
        if ex.cur and ex.cur.get("etat") == "question":
            ex.repondre(ex.cur["answer"])
            check("right on the second try wins 1", S.pieces == 26, str(S.pieces))
        before, goal = S.pieces, ex.reglages["objectif"]
        while ex.stats["aujourdhui"] < goal:
            ex.nouveau(kind="addition", mode="exo")
            ex.repondre(ex.cur["answer"])
        check("the exercises' daily goal wins 10 more", any(j["raison"] == "objectif" and j["n"] == 10 for j in S.journal) and S.pieces >= before + 10, str(S.journal[:3]))
        # the timer
        hub2 = Hub({}, demo=True)
        S2 = hub2.boutique = boutique.Boutique(hub2, None)      # no file: nothing is written

        async def run_timer(minutes, mode):
            tick = timer.setup(hub2)
            await hub2.dispatch("timer.start", {"minutes": minutes, "mode": mode})
            hub2.s["timer"]["ends_at"] = time.time() * 1000 - 10
            await tick()
        await run_timer(25, "TRAVAIL")
        check("a finished 25 min work timer wins 5 coins", S2.pieces == 25 and S2.journal[0]["raison"] == "minuteur", str(S2.pieces))
        await run_timer(3, "TRAVAIL")
        await run_timer(25, "PAUSE")
        check("a 3 min timer or a break wins nothing", S2.pieces == 25)
        await run_timer(180, "TRAVAIL")
        check("a very long one wins 10 at most", S2.pieces == 35)
        hub3 = Hub({}, demo=True)                # no shop on this Pixel: nothing breaks
        N3 = nourrir.Nourrir(hub3, None)
        N3.ventre = 40
        check("without a shop a meal is still a meal", N3.donner(plain) is not None)


def file_checks():
    with tempfile.TemporaryDirectory() as d:
        hub, S, c = shop(d)
        S.gagner(100, "labo")
        S.acheter("lunettes-rondes")
        S.acheter("fleur")
        S.offrir()
        saved = json.loads((Path(d) / "boutique.json").read_text())
        check("data_dir/boutique.json: purse, wardrobe, what he wears, the gift's day, the journal", {"pieces", "total", "possede", "porte", "cadeau", "journal", "gain", "dernier"} <= set(saved)
              and saved["pieces"] == 95 and saved["porte"] == {"yeux": "lunettes-rondes", "visage": "fleur"} and saved["cadeau"] == "2026-11-09", json.dumps(saved)[:200])
        hub2, S2, _ = shop(d)
        b = hub2.s["boutique"]
        check("after a restart: the same purse, the same clothes on, the gift already opened today", b["pieces"] == 95 and b["possede"] == ["lunettes-rondes", "fleur"]
              and b["porte"] == {"yeux": "lunettes-rondes", "visage": "fleur"} and b["cadeau"] is False and len(b["journal"]) == 2, str(b))
        hub3, S3, _ = shop(d, start=at(2026, 11, 10, 8))
        check("…and the next morning the gift is there again", hub3.s["boutique"]["cadeau"] is True and S3.pieces == 95)
    with tempfile.TemporaryDirectory() as d:
        hub, S, _ = shop(d, saved="{ pas du json")
        check("a broken boutique.json: a new purse, no crash", hub.s["boutique"]["pieces"] == 20 and S.possede == [])
    bad = {
        "a list": [1, 2, 3], "coins as text": {"pieces": "mille"}, "negative coins": {"pieces": -40}, "huge coins": {"pieces": 10 ** 30}, "NaN coins": '{"pieces": NaN}',
        "unknown accessories": {"possede": ["epee", 3, None, "fleur", "fleur", "bonnet"], "porte": {"tete": "epee", "yeux": "fleur", "cou": 7}},
        "worn but not owned": {"possede": ["fleur"], "porte": {"tete": "aureole", "yeux": "lunettes-rondes"}},
        "wrong types": {"possede": "fleur", "porte": ["tete"], "journal": {"n": 1}, "gain": [1], "dernier": "achat", "cadeau": 20261109},
        "odd journal": {"journal": [{"n": "2", "raison": "exo", "t": 1}, {"n": 2, "raison": "vol", "t": 1}, {"n": 2, "raison": "exo", "t": "hier"}, None, {"n": 3, "raison": "repas", "t": 5}]},
        "odd last": {"dernier": {"id": -3, "quoi": "achat", "objet": "epee", "t": 12}, "gain": {"id": "x", "n": 2, "raison": "exo", "t": -1}},
    }
    for name, saved in bad.items():
        with tempfile.TemporaryDirectory() as d:
            try:
                hub, S, _ = shop(d, saved=saved)
                b = hub.s["boutique"]
                json.dumps(b, allow_nan=False)
                ok = (0 <= b["pieces"] <= boutique.MAX and set(b["possede"]) <= set(boutique.IDS) and len(set(b["possede"])) == len(b["possede"])
                      and all(b["porte"][s] in b["possede"] and boutique.BY_ID[b["porte"][s]]["slot"] == s for s in b["porte"])
                      and all(j["raison"] in boutique.RAISONS and j["n"] > 0 for j in b["journal"]) and S.acheter("pansement") in ("ok", "pauvre"))
                check(f"boutique.json with {name}: he starts ({b['pieces']} coins), his snapshot is clean JSON, he can shop", ok, json.dumps(b)[:200])
            except Exception as e:                 # noqa: BLE001
                check(f"boutique.json with {name}: he starts", False, repr(e))
    with tempfile.TemporaryDirectory() as d:
        hub, S, _ = shop(d, saved={"pieces": 7, "possede": ["fleur", "aureole"], "porte": {"tete": "aureole"}, "journal": [{"n": 3, "raison": "repas", "t": 5}]})
        check("what is right in a hand-edited file is kept", S.pieces == 7 and S.possede == ["aureole", "fleur"] and S.porte == {"tete": "aureole"} and len(S.journal) == 1)


async def command_checks():
    hub, S, c = shop()
    hub.action("chat.ask")(lambda text: asked.append(text))
    asked = []

    async def ask(text):
        asked.append(text)
    hub.actions["chat.ask"] = ask

    async def scr(screen):
        hub.s["screen"] = screen
    hub.actions["screen.show"] = scr

    async def typed(text):
        asked.clear()
        hub.s["toast"] = None
        await commands.run(hub, text)
        return not asked

    check("« boutique » says his purse, what he wears and how to shop", await typed("boutique") and "20 pièces" in said(hub) and "achète" in said(hub), said(hub))
    check("« mes pièces », « combien de pièces ? »", await typed("mes pièces") and "20 pièces" in said(hub) and await typed("Combien de pièces ?") and "20 pièces" in said(hub))
    check("« achète les lunettes rondes » buys them and he wears them", await typed("achète les lunettes rondes") and S.porte == {"yeux": "lunettes-rondes"} and S.pieces == 0)
    check("« achète l'auréole » without the coins: how many are missing", await typed("Achète l'auréole !") and "Il te manque 80 pièces" in said(hub) and "aureole" not in S.possede)
    check("« cadeau » opens the gift of the day, once", await typed("cadeau") and S.pieces == 5 and await typed("cadeau du jour") and S.pieces == 5 and "demain" in said(hub))
    S.gagner(300, "labo")
    for text, want in (("achète-lui des lunettes cœur", {"yeux": "lunettes-coeur"}), ("mets ta cravate", {"yeux": "lunettes-coeur"}),
                       ("achète une cravate s'il te plaît", {"yeux": "lunettes-coeur", "cou": "cravate"}), ("enlève tes lunettes cœur", {"cou": "cravate"}),
                       ("mets les lunettes rondes", {"yeux": "lunettes-rondes", "cou": "cravate"}), ("achète les oreilles", {"tete": "oreilles-chat", "yeux": "lunettes-rondes", "cou": "cravate"}),
                       ("Pixel, mets ton auréole", {"tete": "oreilles-chat", "yeux": "lunettes-rondes", "cou": "cravate"}), ("enlève tout", {})):
        ok = await typed(text)
        check(f"« {text} »", ok and S.porte == want, f"{ok} {S.porte} {said(hub)}")
    check("« enlève la cravate » when he does not wear it: he says so", await typed("enlève la cravate") and "ne le porte pas" in said(hub))
    for text in ("mets la table", "mets de la musique", "enlève la poussière", "achète du pain", "porte-moi", "range ta chambre", "cadeau de Noël pour maman", "un chapeau", "la boutique du coin est ouverte ?"):
        check(f"« {text} » is not for his shop: Claude gets it", not await typed(text) and S.porte == {}, f"{asked} {said(hub)}")
    # his meals keep their words
    with tempfile.TemporaryDirectory() as d:
        nourrir.setup(hub, d)
        hub.nourrir.ventre = 40
        before = dict(S.porte)
        check("« donne-lui une pomme » is still a meal", await typed("donne-lui une pomme") and (hub.s["nourrir"]["dernier"] or {}).get("plat") == "pomme" and S.porte == before)
    # Claude's tool
    purse = S.pieces
    r1 = await boutique.run_tool(hub, {"objet": "monocle"})
    r2 = await boutique.run_tool(hub, {"objet": "cravate"})
    r3 = await boutique.run_tool(hub, {"objet": "cravate", "enlever": True})
    await boutique.run_tool(hub, {"objet": "lunettes-rondes"})
    r4 = await boutique.run_tool(hub, {"objet": "rien"})
    check("Claude: he cannot put on what he does not own (the price is said), puts on, takes off, takes everything off",
          "tu n'as pas encore le monocle" in r1 and "45 pièces" in r1 and "sa cravate" in r2 and "rien de spécial" in r3 and "rien de spécial" in r4 and S.porte == {}, f"{r1} | {r2} | {r3} | {r4}")
    check("Claude never buys: his purse did not move", S.pieces == purse and "monocle" not in S.possede, str(S.pieces))


def free_port(port):
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def start_server(port, tmp):
    cfg = Path(tmp) / "config.toml"
    cfg.write_text(f'data_dir = "{tmp}"\n')
    return subprocess.Popen([sys.executable, str(APP / "server.py"), "--demo", "--port", str(port), "--config", str(cfg)],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, cwd=str(APP))


async def server_checks(first):
    for _ in range(100):
        if not free_port(PORT):
            break
        await asyncio.sleep(0.1)
    async with aiohttp.ClientSession() as http, http.ws_connect(f"http://127.0.0.1:{PORT}/ws") as ws:
        state = {}

        async def settle(seconds=0.5):
            end = time.time() + seconds
            while time.time() < end:
                try:
                    m = await ws.receive(timeout=max(0.05, end - time.time()))
                except asyncio.TimeoutError:
                    break
                if m.type == aiohttp.WSMsgType.TEXT:
                    d = json.loads(m.data)
                    if d.get("type") == "state":
                        state.clear()
                        state.update(d["data"])

        async def act(action, **args):
            await ws.send_str(json.dumps({"action": action, "args": args}))
            await settle()

        await settle(1.0)
        b = state.get("boutique") or {}
        if not first:
            return b
        check("the server's snapshot has his shop: 20 coins, the gift to open", b.get("pieces") == 20 and b.get("cadeau") is True and b.get("possede") == [], str(b))
        await act("boutique.cadeau")
        await act("boutique.acheter", objet="fleur")
        b = state["boutique"]
        check("the actions: the gift, then a flower bought and worn, by « Son look »", b["pieces"] == 15 and b["porte"] == {"visage": "fleur"} and b["dernier"]["quoi"] == "achat"
              and state["screen"] == "visage" and state["look"]["accessoires"]["visage"] == "fleur", str(b))
        await act("boutique.acheter", objet="aureole")
        check("too dear: a banner, nothing bought", "Il te manque" in (state.get("toast") or {}).get("msg", "") and state["boutique"]["possede"] == ["fleur"])
        await act("boutique.acheter")
        await act("boutique.porter", objet=["fleur"])
        await act("boutique.retirer", objet={"x": 1})
        await act("look.porte", item="aureole")
        check("odd arguments never break him, « Son look » cannot put on what was not bought", state["boutique"]["porte"] == {"visage": "fleur"} and state["boutique"]["pieces"] == 15
              and state["look"]["accessoires"]["tete"] is None, str(state["boutique"]))
        await act("nourrir.donner", plat="pomme")
        await settle(0.3)
        eaten = (state["nourrir"]["dernier"] or {}).get("reaction") not in (None, "plein", "refuse")
        check("a meal through the server wins a coin (when he eats it)", state["boutique"]["pieces"] == (16 if eaten and state["nourrir"]["dernier"]["reaction"] != "prefere" else 17 if eaten else 15), str(state["boutique"]["pieces"]))
        coins0 = state["boutique"]["pieces"]
        await act("exos.nouveau", kind="addition", mode="exo")
        cur = (state.get("exos") or {}).get("cur") or {}
        check("an exercise is open, its answer is not in the snapshot", cur.get("etat") == "question" and "answer" not in cur, str(cur)[:120])
        await act("cmd", text="enlève tout")
        check("a typed command through the server: « enlève tout »", state["boutique"]["porte"] == {} and state["boutique"]["pieces"] == coins0)
        await act("cmd", text="mets la fleur")
        return state["boutique"]


async def main():
    catalogue_checks()
    coin_checks()
    wardrobe_checks()
    await look_checks()
    await earning_checks()
    file_checks()
    await command_checks()
    if not free_port(PORT):
        check(f"port {PORT} is free (BOUTIQUE_PY_PORT=… for another)", False)
        return
    with tempfile.TemporaryDirectory() as tmp:
        srv = start_server(PORT, tmp)
        try:
            b1 = await server_checks(True)
        finally:
            srv.terminate()
            srv.wait()
        srv = start_server(PORT, tmp)
        try:
            b2 = await server_checks(False)
            check("after a restart of the server: the same purse, the same wardrobe, the flower still on, the gift opened",
                  b2.get("pieces") == b1["pieces"] and b2.get("possede") == ["fleur"] and b2.get("porte") == {"visage": "fleur"} and b2.get("cadeau") is False, str(b2))
        finally:
            srv.terminate()
            srv.wait()


if __name__ == "__main__":
    asyncio.run(main())
    print("\n%d failure(s)" % len(fails))
    sys.exit(1 if fails else 0)
