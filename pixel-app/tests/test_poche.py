"""Pixel de poche, the server's side (pixel/poche.py): drives a demo server through its WebSocket like the app does.

    python3 tests/test_poche.py                    # starts its own demo server (port 8144, temporary data folder)

The news between the two Pixels (poche.touch: who, what, not too often) and the voyage (poche.voyage), and the files that
must agree: the scene pack web/scenes/poche.js, the events of web/persona.js, the pages that load poche.js.
The phone itself (landscape, touch, sensors, the two Pixels on screen) is tested in a browser by tests/test_poche.js.
"""
import asyncio
import json
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
from pixel import poche, scenes  # noqa: E402
from pixel.claude import TOOLS  # noqa: E402

PORT = 8144
fails = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


def start_server(port, datadir):
    try:
        socket.create_connection(("127.0.0.1", port), 0.2).close()
        raise SystemExit(f"le port {port} est déjà pris")
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
    web = APP / "web"
    pack = re.sub(r"/\*.*?\*/", "", (web / "scenes" / "poche.js").read_text(), flags=re.S)       # without the header's example
    ids = [i for i, _, g in scenes.SCENES if i.startswith("poche-")]
    check(f"the scene pack poche.js: {len(ids)} scenes read by pixel/scenes.py, every id starts with 'poche-'",
          len(ids) >= 18 and len(re.findall(r"\bS\('", pack)) == len(ids) and all(scenes.BY_ID[i][1] == "evt" for i in ids), str(ids))
    for need in ("poche-part", "poche-revient", "poche-arrive", "poche-rentre", "poche-jaloux", "poche-tournis", "poche-batterie", "poche-loin"):
        check(f"scene {need} exists", need in ids)
    enum = next(t for t in TOOLS if t["name"] == "play_scene")["input_schema"]["properties"]["scene"]["enum"]
    check("Claude does not play the Pixel de poche scenes (they need a reason)", not [i for i in enum if i.startswith("poche-")])
    persona = (web / "persona.js").read_text()
    events = set(re.findall(r"^\s+'?([a-z-]+)'?: '", persona.split("const EVENTS = {", 1)[1].split("};", 1)[0], re.M))
    used = {e for group in re.findall(r"on: \[([^\]]*)\]", pack) for e in re.findall(r"'([a-z-]+)'", group)}
    check("every event the pack answers is in persona.js EVENTS", used and used <= events, str(used - events))
    js = (web / "poche.js").read_text()
    sent = set(re.findall(r"'(jumeau-[a-z]+|poche-[a-z]+)'", js.split("/* ---------- the screen")[0])) - set(ids)
    check("every event poche.js sends is in persona.js EVENTS", sent and sent <= events, str(sent - events))
    check("the scenes poche.js plays exist", all(i in ids for i in ("poche-part", "poche-revient", "poche-arrive", "poche-rentre")) and
          all(f"'{i}'" in js for i in ("poche-part", "poche-revient", "poche-arrive", "poche-rentre")))
    check("the news between the Pixels is not a Stream Deck action for screens.js (no generic 'action' scene)",
          bool(re.search(r"\|poche\\\.[|)][^/\n]*/\.test\(p\.act\.name\)", (web / "screens.js").read_text())))   # poche. among the excluded prefixes
    for f, after, before in (("index.html", "app/screens.js", "app/app.js"), ("lab/index.html", "../screens.js", "lab.js")):
        page = (web / f).read_text()
        check(f"{f} loads the scene pack, and poche.js after screens.js and before {before.split('/')[-1]}",
              "scenes/poche.js" in page and page.index(after) < page.index("poche.js\"></script>", page.index(after)) < page.index(before))
    check("the voyage lasts as long as the scene on the Pi (poche-part: 3.6 s to leave, away until 60 s)", poche.VOYAGE_MS == 60000 and "dur: 64000" in pack)
    man = json.loads((web / "manifest.webmanifest").read_text())
    check("the installed app may turn sideways (manifest orientation)", man.get("orientation", "any") in ("any", "natural", "landscape"))


async def main():
    static_checks()
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
            P = lambda: state["poche"]  # noqa: E731
            check("the snapshot has 'poche': no news, no voyage, no Pixel de poche", P() == {"ev": None, "voyage": None, "here": 0}, str(P()))
            await act("poche.touch", kind="bonjour", by="poche")
            ev = P()["ev"] or {}
            check("the phone sideways says hello: news for the Pi, and the server knows a Pixel de poche is here",
                  ev.get("by") == "poche" and ev.get("kind") == "bonjour" and ev.get("id") == 1 and P()["here"] > 0, str(P()))
            await act("poche.touch", kind="caresse", by="poche")
            check("petting the Pixel de poche is news for the Pi", (P()["ev"] or {}).get("kind") == "caresse" and P()["ev"]["id"] == 2)
            t0 = P()["ev"]["t0"]
            await act("poche.touch", kind="caresse", by="poche")
            check("the same news again at once is dropped (at most every 2.5 s)", P()["ev"]["t0"] == t0 and P()["ev"]["id"] == 2)
            await act("poche.touch", kind="tape", by="pi")
            check("a touch on the Pi's Pixel is news for the phone", P()["ev"]["by"] == "pi" and P()["ev"]["kind"] == "tape" and P()["ev"]["id"] == 3)
            await act("poche.touch", kind="danse", by="poche")
            await act("poche.touch", kind="tape", by="lune")
            check("an unknown kind or sender is refused", P()["ev"]["id"] == 3)
            here = P()["here"]
            await act("poche.touch", kind="la", by="poche")
            check("'la' (still there) only refreshes the Pixel de poche's presence", P()["ev"]["id"] == 3 and P()["here"] > here)
            await act("poche.touch", kind="au-revoir", by="poche")
            check("'au-revoir': no Pixel de poche any more, no news", P()["here"] == 0 and P()["ev"]["id"] == 3)
            check("the news does not move the Pi's screen nor his mood", state["screen"] == "visage" and state["mood"]["name"] == "neutre", state["screen"])

            await act("screen.show", screen="meteo")
            await act("anim.play", id="danse")
            await act("poche.voyage", to="poche")
            v = P()["voyage"] or {}
            check("poche.voyage to the phone: for a minute, from his face screen, the animation stops",
                  v.get("to") == "poche" and v["until"] - v["t0"] == poche.VOYAGE_MS and state["screen"] == "visage" and state["anim"] is None, str(v))
            await act("poche.voyage", to="poche")
            check("…already in your pocket: nothing changes", P()["voyage"]["t0"] == v["t0"])
            await act("poche.voyage", to="pi")
            w = P()["voyage"] or {}
            check("poche.voyage back home before the minute is up", w.get("to") == "pi" and w["t0"] > v["t0"] and w["until"] == w["t0"], str(w))
            await act("poche.voyage", to="pi")
            check("…already home: nothing changes", P()["voyage"]["t0"] == w["t0"])
            await act("poche.voyage", to="ailleurs")
            check("an unknown destination is refused", P()["voyage"]["t0"] == w["t0"])
            await act("poche.voyage", to="poche")
            check("he can leave again", P()["voyage"]["to"] == "poche" and P()["voyage"]["t0"] > w["t0"])


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as tmp:
        srv = start_server(PORT, tmp)
        try:
            asyncio.run(main())
        finally:
            srv.terminate()
            srv.wait()
    print("\n%d failure(s)" % len(fails))
    sys.exit(1 if fails else 0)
