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
from pixel.keys import MOODS, THEMES  # noqa: E402
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
    cfg.write_text(f'data_dir = "{datadir}"\n')
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
            check("the theme choice survives a restart", json.loads(m.data)["data"]["view"]["theme"] == "croquis")


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
    print("\n%d failure(s)" % len(fails))
    sys.exit(1 if fails else 0)
