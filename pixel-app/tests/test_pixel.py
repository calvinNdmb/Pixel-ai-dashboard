"""Drives a demo server through its WebSocket like the app does, and checks the results.

    python3 tests/test_pixel.py                    # starts its own demo server (port 8102, temporary data folder)
    python3 tests/test_pixel.py --port 8102 --external --data-dir ~/.config/pixel
                                                   # uses a demo server that is already running there
"""
import argparse
import asyncio
import json
import os
import re
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import aiohttp

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
from pixel.claude import TOOLS  # noqa: E402
from pixel.commands import norm  # noqa: E402
from pixel.deck import STYLES  # noqa: E402
from pixel import anims  # noqa: E402
from pixel.keys import FACES, MOODS, THEMES  # noqa: E402
from pixel.system import local_ip  # noqa: E402

fails = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


def start_server(port, datadir):
    try:
        socket.create_connection(("127.0.0.1", port), 0.2).close()
        raise SystemExit(f"le port {port} est déjà pris : arrête ce serveur, ou lance le test avec --external ou un autre --port")
    except OSError:
        pass
    cfg = Path(datadir) / "config.toml"
    cfg.write_text(f'data_dir = "{datadir}"\n[ui]\nthemes = {json.dumps(list(THEMES))}\n')   # every theme on: the theme checks below need them
    p = subprocess.Popen([sys.executable, str(APP / "server.py"), "--demo", "--port", str(port), "--config", str(cfg)],
                         cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(100):
        try:
            socket.create_connection(("127.0.0.1", port), 0.2).close()
            return p
        except OSError:
            time.sleep(0.1)
    p.kill()
    raise SystemExit(f"le serveur de démo ne démarre pas sur le port {port}")


def static_checks():
    """The theme and mood lists agree everywhere (web, server, keys, Claude, Stream Deck, CSS, fonts)."""
    web = APP / "web"
    js = (web / "themes.js").read_text()
    moods_js = re.findall(r"\{ id: '(\w+)', name: ", js.split("window.PixelLife")[0])
    check("PixelMoods (themes.js) and keys.MOODS list the same moods", moods_js == MOODS, f"{moods_js} != {MOODS}")
    check("at least 12 moods", len(MOODS) >= 12, str(len(MOODS)))
    ids = re.findall(r"^  id: '(\w+)', name: '([^']+)'", js, re.M)
    check("every theme of keys.THEMES is drawn in themes.js, with the same name", dict(ids) == THEMES, f"{ids}")
    check("at least 6 themes", len(THEMES) >= 6, str(len(THEMES)))
    css = (web / "style.css").read_text()
    check("style.css styles the keys of every theme", all(f'body[data-theme="{t}"]' in css for t in THEMES if t != "retro"))
    check("the Stream Deck has a style for every theme", set(STYLES) == set(THEMES), str(set(THEMES) - set(STYLES)))
    own = [s["font"][0] for s in STYLES.values() if "/web/" in s["font"][0].replace(os.sep, "/")]       # DejaVu is a system font
    check("the Stream Deck fonts of the themes are bundled", len(own) == len(THEMES) - 1 and all(os.path.exists(f) for f in own), str(own))
    fonts = json.loads((web / "fonts.json").read_text())
    check("fonts.json: every font and licence file is bundled", all((web / f["file"]).exists() and (web / f["license"]).exists() for f in fonts))
    check("fonts.json: every licence is the SIL OFL", all("SIL OPEN FONT LICENSE" in (web / f["license"]).read_text().upper() for f in fonts))
    check("style.css loads every bundled font", all(f'font-family:"{f["family"]}";src:url({f["file"]})' in css for f in fonts))
    tools = {t["name"]: t["input_schema"]["properties"] for t in TOOLS}
    check("Claude can pick every theme", tools["set_theme"]["theme"]["enum"] == list(THEMES))
    check("Claude can pick every mood", tools["set_mood"]["mood"]["enum"] == MOODS)
    pack = (web / "pack52" / "pixel52.js").read_text()
    engine_ids = re.findall(r"^    \['([a-z-]+)',", pack, re.M)
    check("the pack: 52 animations, 18 idles, the same ids in animations.json and in the engine", len(anims.IDS) == 52 and engine_ids == anims.IDS
          and sum(a["group"] == "Idle" for a in anims.ANIMS) == 18, f"{len(engine_ids)} {len(anims.IDS)}")
    check("the pack's globals are renamed (Pixel52, Pixel52Themes)", "scope.Pixel52=api" in pack and "scope.PixelThemes" not in pack
          and "scope.Pixel52Themes=" in (web / "pack52" / "pixel52-themes.js").read_text())
    check("the app and the lab load the pack before themes.js", all(
        (web / f).read_text().index("pack52/pixel52-themes.js") < (web / f).read_text().index("themes.js\"") for f in ("index.html", "lab/index.html")))
    check("Claude can play every animation", tools["play_animation"]["animation"]["enum"] == anims.IDS)
    from pixel import scenes
    check("Claude can play his moments of life, reactions and moods (not the greetings and events, they need a reason)",
          set(tools["play_scene"]["scene"]["enum"]) == {i for i, _, g in scenes.SCENES if g in ("vie", "tap", "fache", "calin")}
          and "poisson" in tools["play_scene"]["scene"]["enum"] and "bonjour" not in tools["play_scene"]["scene"]["enum"])
    check("the app and the lab load persona.js between themes.js and screens.js", all(
        (web / f).read_text().index("themes.js\"") < (web / f).read_text().index("persona.js") < (web / f).read_text().index("screens.js") for f in ("index.html", "lab/index.html")))


async def retro_only():
    """Without [ui] themes in config.toml (the Pi's config), Pixel offers Rétro only: nowhere to pick another theme."""
    import server
    from pixel import commands, keys
    from pixel.claude import tools_for
    from pixel.state import Hub
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        (d / "ui.json").write_text(json.dumps({"theme": "neon"}))        # a theme picked before Rétro became the only one
        hub = Hub({}, demo=True)
        server.core_actions(hub, d)
        v = hub.s["view"]
        check("default config: Rétro only, even if Néon was saved before", hub.s["settings"]["themes"] == ["retro"] and v["theme"] == "retro",
              f"{hub.s['settings'].get('themes')} {v['theme']}")
        await hub.dispatch("theme.set", {"name": "neon"})
        check("theme.set néon is refused, with the reason", v["theme"] == "retro" and "seul le thème Rétro" in hub.s["toast"]["msg"], hub.s["toast"]["msg"])
        hub.s["toast"] = None
        await hub.dispatch("theme.step", {"d": 1})
        check("Thème + changes nothing and says so", v["theme"] == "retro" and "seul le thème Rétro" in (hub.s["toast"] or {}).get("msg", ""))
        for text in ("thème néon", "thème suivant", "thème bidule"):
            hub.s["toast"] = None
            await commands.run(hub, text)
            check(f"'{text}': Rétro stays, with a message", v["theme"] == "retro" and "Rétro" in (hub.s["toast"] or {}).get("msg", ""), str(hub.s["toast"]))
        row = [k["label"] if k else None for k in keys.row3("reglages", hub.s)]
        check("Stream Deck, Réglages: no theme keys, the face and the CRT effect instead",
              row == ["Associer\nHue", "Clavier", "Effet\nCRT", "Visage\nPack 52", "Visage\nVivant"], str(row))
    names = [t["name"] for t in tools_for(["retro"])]
    check("Claude: no theme tool with Rétro only, every other tool still there", "set_theme" not in names and len(names) == len(TOOLS) - 1, str(names))
    two = {t["name"]: t for t in tools_for(["retro", "neon"])}["set_theme"]
    check("Claude: the theme tool lists only the themes that are on", two["input_schema"]["properties"]["theme"]["enum"] == ["retro", "neon"]
          and "manga" not in two["description"] and "neon" in two["description"], two["description"])
    every = {t["name"]: t for t in tools_for(list(THEMES))}["set_theme"]
    check("Claude: with every theme on, every theme", every["input_schema"]["properties"]["theme"]["enum"] == list(THEMES))
    example = (APP / "config.example.toml").read_text()
    check("config.example.toml: Rétro only, and how to bring the others back", 'themes = ["retro"]' in example and '"lcd"]' in example)


async def main(args):
    static_checks()
    datadir = Path(args.data_dir).expanduser()
    async with aiohttp.ClientSession() as http:
        async with http.ws_connect(f"http://127.0.0.1:{args.port}/ws") as ws:
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

            async def cmd(text, wait=0.4):
                await act("cmd", wait, text=text)

            def saved():
                try:
                    return json.loads((datadir / "ui.json").read_text()).get("theme")
                except (OSError, ValueError):
                    return None

            await pump(0.5)
            check("state has 10 nav keys", len(state["keys"]["nav"]) == 10)
            check("demo rooms loaded", [r["name"] for r in state["lights"]["rooms"]] == ["Salon", "Bureau", "Chambre", "Cuisine"])
            await cmd("salon 40")
            check("'salon 40' sets the living room to 40 %", state["lights"]["rooms"][0]["bri"] == 40 and state["lights"]["rooms"][0]["on"])
            await cmd("éteins tout")
            check("'éteins tout' turns everything off", not any(r["on"] for r in state["lights"]["rooms"]))
            await cmd("allume bureau")
            check("'allume bureau' turns the office on", state["lights"]["rooms"][1]["on"])
            await cmd("cuisine off")
            check("'cuisine off' keeps the kitchen off", not state["lights"]["rooms"][3]["on"])
            await cmd("scène film")
            check("'scène film' shows a toast", "FILM" in state["toast"]["msg"])
            await cmd("minuteur 1")
            check("'minuteur 1' starts a 1-minute timer", state["timer"]["running"] and state["timer"]["total"] == 60 and state["screen"] == "minuteur")
            await cmd("pause")
            check("'pause' pauses the timer", not state["timer"]["running"])
            await cmd("météo")
            check("'météo' opens the weather screen", state["screen"] == "meteo")
            await cmd("aide")
            check("'aide' lists the commands", "minuteur" in state["toast"]["msg"] and "thème" in state["toast"]["msg"])

            # ---- moods ----
            for m in MOODS:
                await act("screen.show", 0.1, screen="meteo")
                await cmd(f"humeur {m}", 0.3)
                ok = state["mood"]["name"] == m and state["screen"] == "visage" and (m == "endormi") == (state["mood"]["until"] == 0)
                check(f"'humeur {m}' shows that mood on the face", ok, str(state["mood"]))
            for text, m in [("humeur fâchée", "fache"), ("humeur clin d'œil", "clin"), ("humeur bâille", "baille"), ("humeur excité", "excite"),
                            ("humeur Réfléchit", "reflechit"), ("humeur écoute", "ecoute"), ("humeur cool", "fier")]:
                await cmd(text, 0.3)
                check(f"'{text}' (French word) works", state["mood"]["name"] == m, state["mood"]["name"])
            await cmd("humeur pirate", 0.3)
            check("an unknown mood makes him confused and says so", state["mood"]["name"] == "confus" and "humeur" in state["toast"]["msg"])
            await act("mood.set", name="triste", ms=0)
            key = state["keys"]["row3"]["visage"][4]
            check("the 'Humeur +' key goes to the next mood", key["label"] == "Humeur +" and key["action"] == "mood.set" and key["args"]["name"] == MOODS[MOODS.index("triste") + 1], str(key))
            await act(key["action"], **key["args"])
            check("pressing 'Humeur +' changes the mood", state["mood"]["name"] == MOODS[MOODS.index("triste") + 1])
            await act("mood.set", name="neutre", ms=0)

            await cmd("raconte-moi une blague", wait=4.5)
            last = state["chat"]["messages"][-1]
            check("free text goes to Claude (demo reply)", state["screen"] == "claude" and "servos" in last["text"] and state["chat"]["phase"] == "idle")
            check("after a joke he winks", state["mood"]["name"] == "clin", state["mood"]["name"])
            await cmd("codex corrige le test du minuteur", wait=8)
            check("'codex ...' runs a task to the end", state["codex"]["status"].startswith("terminé") and "42/42 OK" in state["codex"]["lines"])
            await act("view.set", key="meteo_day", value=0)
            await act("view.step", key="meteo_day", d=1, hi=4)
            check("deck action view.step works", state["view"]["meteo_day"] == 1)
            check("row 3 keys for minuteur exist", state["keys"]["row3"]["minuteur"][0]["label"] in ("Démarrer", "Pause"))
            check("settings carry a QR code", len(state["settings"]["qr"]) >= 21)

            # ---- themes ----
            ids = list(THEMES)
            for t in ids:
                await act("theme.set", name=t)
                check(f"theme.set {t}", state["view"]["theme"] == t and state["toast"]["msg"] == "THÈME " + THEMES[t].upper(), state["toast"]["msg"])
                check(f"theme {t} is saved", saved() == t, str(saved()))
            await act("theme.set", name="nimporte")
            check("an unknown theme is refused", state["view"]["theme"] == ids[-1])
            await act("theme.set", name=ids[0])
            for i in range(1, len(ids) + 1):
                await act("theme.step", d=1)
                check(f"theme.step +1 goes to {ids[i % len(ids)]}", state["view"]["theme"] == ids[i % len(ids)] and saved() == ids[i % len(ids)])
            await act("theme.step", d=-1)
            check("theme.step -1 wraps to the last theme", state["view"]["theme"] == ids[-1] and saved() == ids[-1])
            row = state["keys"]["row3"]["reglages"]
            check("Réglages keys: Thème − / current theme / Thème +",
                  [k["label"] for k in row[2:]] == ["Thème −", "Thème\n" + THEMES[ids[-1]], "Thème +"] and [k["args"]["d"] for k in row[2:]] == [-1, 1, 1], str(row[2:]))
            await act(row[4]["action"], **row[4]["args"])
            check("the 'Thème +' key changes the theme", state["view"]["theme"] == ids[0])
            await act(row[2]["action"], **row[2]["args"])
            check("the 'Thème −' key changes the theme", state["view"]["theme"] == ids[-1])
            for t, name in THEMES.items():
                await cmd(f"thème {name.lower()}")
                check(f"'thème {name.lower()}' switches to {t}", state["view"]["theme"] == t and saved() == t)
            for text, t in [("theme moderne", "moderne"), ("thème rétro", "retro"), ("style synthwave", "neon"), ("thème crayon", "croquis"),
                            ("thème console", "lcd"), ("THÈME NÉON", "neon")]:
                await cmd(text)
                check(f"'{text}' (alias, accents, capitals) works", state["view"]["theme"] == t, state["view"]["theme"])
            await cmd("thème suivant")
            check("'thème suivant' goes to the next theme", state["view"]["theme"] == ids[(ids.index("neon") + 1) % len(ids)])
            await cmd("thème précédent")
            check("'thème précédent' goes back", state["view"]["theme"] == "neon")
            await cmd("thème bidule")
            check("an unknown theme lists the themes", state["view"]["theme"] == "neon" and "Les thèmes" in state["toast"]["msg"], state["toast"]["msg"])
            await cmd(f"thème {norm(THEMES['croquis'])}")

            # ---- the animation pack ----
            check("the face is the pack by default", state["view"]["face"] == "pack", state["view"].get("face"))
            await act("anim.play", id="danse")
            a = state["anim"] or {}
            check("anim.play danse", a.get("id") == "danse" and a.get("loops") == 2 and abs(a["until"] - a["t0"] - 8000) < 1, str(a))
            await act("anim.play", id="reve")
            check("a long animation plays once", (state["anim"] or {}).get("loops") == 1)
            await act("anim.play", id="pas-une-animation")
            check("an unknown animation is refused", state["anim"]["id"] == "reve")
            await act("anim.play", id="rire", loops=0)
            check("anim.play with loops=0 keeps playing", state["anim"]["id"] == "rire" and state["anim"]["until"] == 0)
            await act("anim.stop")
            check("anim.stop", state["anim"] is None)
            for text, want in [("anim danse", "danse"), ("animation fou rire", "rire"), ("anim clin d'oeil", "clin-oeil"), ("anim Eurêka !", "idee"),
                               ("ANIMATION BRAVO", "succes"), ("anim mise a jour", "mise-a-jour"), ("anim idle-luciole", "idle-luciole"),
                               ("danse", "danse"), ("chante", "chante"), ("coucou", "salut"), ("bisou", "bisou")]:
                await act("screen.show", 0.1, screen="meteo")
                await act("anim.stop", 0.1)
                await cmd(text, 0.3)
                check(f"'{text}' plays {want}", (state["anim"] or {}).get("id") == want and state["screen"] == "visage", str(state["anim"]))
            await cmd("anim pirate")
            check("an unknown animation makes him confused and says so", state["mood"]["name"] == "confus" and "animation" in state["toast"]["msg"])
            await cmd("animations")
            check("'animations' lists them", state["toast"]["msg"].startswith("Les 52 animations") and "Gratouille" in state["toast"]["msg"] and state["toast"]["ms"] == 15000)

            # ---- his personality: scenes asked for by a command ----
            await act("anim.play", id="danse")
            await act("screen.show", screen="meteo")
            await act("scene.play", id="poisson")
            sc = state.get("scene") or {}
            check("scene.play poisson: on the face, the animation stops", sc.get("id") == "poisson" and sc.get("t0") and state["screen"] == "visage" and state["anim"] is None, str(sc))
            await act("scene.play", id="pas-une-scene")
            check("an unknown scene is refused", state["scene"]["id"] == "poisson")
            for text, want in [("fais le poisson", "poisson"), ("fais la sieste", "sieste"), ("Fais la toupie", "toupie"), ("fais l'économiseur d'écran", "dvd"),
                               ("fais coucou caché", "cache"), ("joue la gym", "gym"), ("fais dodo", "sieste"), ("fais la danse en cachette", "danse"), ("fais le hoquet", "hoquet")]:
                await act("scene.play", 0.1, id="joie")
                await cmd(text, 0.3)
                check(f"'{text}' plays the scene {want}", state["scene"]["id"] == want, str(state["scene"]))
            before = state["scene"]
            await cmd("fais une liste de courses", 0.3)
            check("'fais une liste de courses' is not a scene: it goes to Claude", state["scene"] == before and state["screen"] == "claude", state["screen"])
            await cmd("scènes")
            check("'scènes' lists his moments of life", state["toast"]["msg"].startswith("Ses moments de vie") and "Le poisson" in state["toast"]["msg"] and "fais le poisson" in state["toast"]["msg"])
            await cmd("scène film")
            check("'scène film' is still a Hue scene, not a personality scene", state["scene"] == before, str(state["scene"]))
            await act("anim.play", id="bisou")                 # back to the last animation the checks below expect
            await cmd("minuteur 5")
            await cmd("pause")
            check("'pause' is still the timer's command", not state["timer"]["running"] and state["screen"] == "minuteur")
            await cmd("météo")
            check("'météo' still opens its screen", state["screen"] == "meteo")
            key = state["keys"]["row3"]["visage"]
            check("Visage keys: Anim + and Humeur +", [k["label"] for k in key[3:]] == ["Anim +", "Humeur +"] and key[3]["action"] == "anim.play"
                  and key[3]["args"]["id"] == anims.SHOW[(anims.SHOW.index("bisou") + 1) % len(anims.SHOW)], str(key[3:]))
            await act(key[3]["action"], **key[3]["args"])
            check("pressing Anim + plays the next one", state["anim"]["id"] == key[3]["args"]["id"])
            for _ in range(len(anims.SHOW)):
                k = state["keys"]["row3"]["visage"][3]
                await act(k["action"], 0.15, **k["args"])
            check("Anim + walks through the 34 that are not idles", state["anim"]["id"] == key[3]["args"]["id"])
            for name in FACES:
                await act("face.set", name=name)
                check(f"face.set {name} is saved", state["view"]["face"] == name and json.loads((datadir / "ui.json").read_text()) == {"theme": "croquis", "face": name})
            await cmd("visage pack")
            check("'visage pack'", state["view"]["face"] == "pack" and state["screen"] == "visage")
            await cmd("visage vivant")
            check("'visage vivant'", state["view"]["face"] == "vivant")
            await act("face.set", name="autre")
            check("an unknown face is refused", state["view"]["face"] == "vivant")
            await act("screen.show", screen="meteo")
            await cmd("visage")
            check("'visage' alone still opens the screen", state["screen"] == "visage")

        ip = local_ip()
        token_file = datadir / "token"
        if ip and token_file.exists():
            token = token_file.read_text().strip()
            try:
                async with http.ws_connect(f"http://{ip}:{args.port}/ws"):
                    check("remote client without code is refused", False)
                return
            except aiohttp.WSServerHandshakeError as e:
                check("remote client without code is refused", e.status == 403)
            except aiohttp.ClientConnectorError:
                print("SKIP remote client checks: the server only listens on 127.0.0.1")
                return
            async with http.ws_connect(f"http://{ip}:{args.port}/ws?t={token}") as ws2:
                m = await ws2.receive(timeout=2)
                check("remote client with the code is accepted", json.loads(m.data)["type"] == "state")


async def after_restart(args):
    async with aiohttp.ClientSession() as http:
        async with http.ws_connect(f"http://127.0.0.1:{args.port}/ws") as ws:
            m = await ws.receive(timeout=3)
            v = json.loads(m.data)["data"]["view"]
            check("the theme choice survives a restart", v["theme"] == "croquis")
            check("the face choice survives a restart", v["face"] == "vivant", v.get("face"))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8102)
    ap.add_argument("--external", action="store_true", help="use a demo server that already runs on --port")
    ap.add_argument("--data-dir", default="~/.config/pixel", help="its data folder (with --external)")
    args = ap.parse_args()
    if args.external:
        asyncio.run(main(args))
    else:
        with tempfile.TemporaryDirectory() as tmp:
            args.data_dir = tmp
            srv = start_server(args.port, tmp)
            try:
                asyncio.run(main(args))
            finally:
                srv.terminate()
                srv.wait()
            srv = start_server(args.port, tmp)
            try:
                asyncio.run(after_restart(args))
            finally:
                srv.terminate()
                srv.wait()
    asyncio.run(retro_only())
    print("\n%d failure(s)" % len(fails))
    sys.exit(1 if fails else 0)
