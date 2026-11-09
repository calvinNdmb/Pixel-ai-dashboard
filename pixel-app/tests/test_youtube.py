"""YouTube on Pixel (pixel/youtube.py, pixel/ytcast.py), without the Internet: the links, the phone's remote control, what
Pixel's player says, and the YouTube app's Cast button through a fake sidecar (tests/fake_ytcast.py) started by the server.

    python3 tests/test_youtube.py      # its own demo servers: port 8164 ([ytcast] on, the fake sidecar), 8165 (off)

- the links (tests/youtube_links.json, the same cases as tests/test_youtube.js for web/ytplayer.js): watch, youtu.be,
  shorts, live, embed, music.youtube.com, playlists, t= / start=, and what is not YouTube;
- a YouTube cast: its player address, its QR code, the orders of the phone (pause, ±10 s, volume, mute), what Pixel's
  player says (its title, its errors: the cast goes after a while), its end;
- the sidecar: started by the server, restarted when it crashes (the server goes on), ended with the server; its code in
  its environment only, nothing else of the server's environment; /ytcast only from the Pi itself, with its code, never
  from a browser page or with the phone's code; the YouTube app's video in Pixel's player, its orders, its next video,
  its end, a stop on Pixel told back to it; the TV code on Pixel's screen until a phone pairs.
"""
import asyncio
import json
import os
import signal
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import aiohttp

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
from pixel import cast, youtube, ytcast  # noqa: E402

PORT, PORT_OFF = 8164, 8165
PHONE = "le-code-du-telephone"
fails = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


def start_server(port, datadir, ytcfg=""):
    try:
        socket.create_connection(("127.0.0.1", port), 0.2).close()
        raise SystemExit(f"le port {port} est déjà pris : arrête ce serveur, ou change PORT")
    except OSError:
        pass
    cfg = Path(datadir) / "config.toml"
    cfg.write_text(f'data_dir = "{datadir}"\n[security]\ntoken = "{PHONE}"\n{ytcfg}')
    env = {**os.environ, "PIXEL_TEST_SECRET": "ne-doit-pas-passer"}       # a secret of the server's: not for the sidecar
    p = subprocess.Popen([sys.executable, str(APP / "server.py"), "--demo", "--port", str(port), "--config", str(cfg)], cwd=APP, env=env,
                         stdout=open(Path(datadir) / "server.log", "w"), stderr=subprocess.STDOUT)
    for _ in range(100):
        try:
            socket.create_connection(("127.0.0.1", port), 0.2).close()
            return p
        except OSError:
            time.sleep(0.1)
    p.kill()
    raise SystemExit(f"le serveur de démo ne démarre pas sur le port {port}")


def pieces():
    cases = json.loads((APP / "tests" / "youtube_links.json").read_text())
    bad = [(c["url"], youtube.parse(c["url"])) for c in cases if youtube.parse(c["url"]) != c["yt"]]
    check(f"parse: the {len(cases)} links of youtube_links.json (watch, youtu.be, shorts, live, embed, Music, playlists, t=, not YouTube)", not bad, str(bad[:3]))
    check("start_s: 90, 90s, 1m30s, 1h2m3s, 1:30, 1:02:03, nonsense", [youtube.start_s(v) for v in ("90", "90s", "1m30s", "1h2m3s", "1:30", "1:02:03", "x", "", "-5")]
          == [90, 90, 90, 3723, 90, 3723, 0, 0, 0])
    v = {"id": "aqz-KE-bpKQ", "list": "", "start": 0, "music": False}
    check("embed_url: youtube-nocookie, the IFrame API on, from where it was shared, its playlist",
          youtube.embed_url(v) == "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?autoplay=1&playsinline=1&rel=0&enablejsapi=1"
          and youtube.embed_url({**v, "start": 90, "list": "PL123"}).endswith("enablejsapi=1&start=90&list=PL123")
          and youtube.embed_url({**v, "id": "", "list": "PL123"}).startswith("https://www.youtube-nocookie.com/embed/videoseries?"))
    check("watch_url: short, for the QR code", youtube.watch_url({**v, "start": 30}) == "https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=30s"
          and youtube.watch_url({**v, "id": "", "list": "PL1"}) == "https://www.youtube.com/playlist?list=PL1"
          and youtube.watch_url({**v, "music": True}).startswith("https://music.youtube.com/"))
    c = cast.classify("https://music.youtube.com/watch?v=aqz-KE-bpKQ&t=2m")
    check("cast.classify: a YouTube link carries what to play (yt), YouTube Music by its name", c.get("yt", {}).get("start") == 120 and c["site"] == "YouTube Music"
          and c["embed"].startswith("https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ"), str(c))
    pl = cast.classify("https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG")
    check("cast.classify: a playlist alone plays too", pl.get("yt", {}).get("list") == "PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG" and "videoseries" in pl["embed"], str(pl))
    check("tv_code: as the YouTube app shows it", ytcast.tv_code("349433568226") == "349 433 568 226" and ytcast.tv_code("abc") is None)

    class Req:
        def __init__(self, remote, headers=None):
            self.remote, self.headers = remote, headers or {}
    ok = [Req("127.0.0.1"), Req("::1")]
    no = [Req("192.168.1.20"), Req("127.0.0.1", {"Origin": "http://localhost:8080"}), Req("127.0.0.1", {"Origin": "null"}),
          Req("127.0.0.1", {"Origin": "https://www.youtube-nocookie.com"}), Req("::1", {"Sec-Fetch-Site": "same-origin"})]
    check("/ytcast: the Pi itself, not a browser page (Origin, Sec-Fetch-Site), not the home network", all(map(ytcast.sidecar_request, ok)) and not any(map(ytcast.sidecar_request, no)))
    ex = (APP / "config.example.toml").read_text()
    check("config.example.toml: [ytcast], off by default", "[ytcast]" in ex and "enabled = false" in ex.split("[ytcast]", 1)[1].split("[", 1)[0])
    pkg = json.loads((APP / "sidecar" / "ytcast" / "package.json").read_text())
    lock = json.loads((APP / "sidecar" / "ytcast" / "package-lock.json").read_text())
    check("the sidecar: exact versions, a lockfile for npm ci, Node 18 or later", all(v[0].isdigit() for v in pkg["dependencies"].values())
          and lock["packages"]["node_modules/yt-cast-receiver"]["version"] == pkg["dependencies"]["yt-cast-receiver"] and pkg["engines"]["node"] == ">=18")
    side = (APP / "sidecar" / "ytcast" / "index.js").read_text()
    check("the sidecar: speaks the protocol of pixel/ytcast.py, ends with the server (stdin), says when a module is missing (78)",
          all(f"type: '{t}'" in side for t in ("hello", "play", "pause", "resume", "seek", "volume", "stop", "pairing", "sender", "status"))
          and "PIXEL_YTCAST_PARENT" in side and "MISSING = 78" in side and "process.stdin.on('end'" in side)
    inst = (APP / "deploy" / "install.sh").read_text()
    check("install.sh: the sidecar only when asked (PIXEL_YTCAST=1), npm ci --omit=dev", 'PIXEL_YTCAST:-0' in inst and "npm ci --omit=dev" in inst)


def lines(f):
    return [json.loads(x) for x in f.read_text().splitlines()] if f.exists() else []


async def main(datadir):
    yd = Path(datadir) / "ytcast"
    ctl, got = yd / "ctl.jsonl", yd / "got.jsonl"
    base = f"http://127.0.0.1:{PORT}"
    tell = lambda m: ctl.open("a").write(json.dumps(m) + "\n")        # noqa: E731   what the fake sidecar sends next

    async with aiohttp.ClientSession() as http:
        async with http.ws_connect(f"{base}/ws") as ws:               # as Pixel's own screen (the Pi itself)
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

            async def until(cond, seconds=8):
                end = time.time() + seconds
                while time.time() < end and not cond():
                    await pump(0.2)
                return cond()

            def got_types():
                return [m.get("type") for m in lines(got)]

            # ---- the sidecar is started by the server ----
            ok = await until(lambda: state.get("ytcast", {}).get("ok"))
            y = state.get("ytcast", {})
            check("the server starts the sidecar: on, ready, the TV code as the app shows it", ok and y["on"] and y["status"] == "prêt" and y["code"] == "123 456 789 012", str(y))
            pid = int((yd / "pids.txt").read_text().split()[0])
            env = (Path(f"/proc/{pid}/environ").read_bytes().split(b"\0") if Path(f"/proc/{pid}/environ").exists() else [])
            cmdline = Path(f"/proc/{pid}/cmdline").read_bytes() if Path(f"/proc/{pid}/cmdline").exists() else b""
            tok = (yd / "token").read_text()
            check("its code: in its environment, not on its command line; nothing else of the server's secrets",
                  f"PIXEL_YTCAST_TOKEN={tok}".encode() in env and tok.encode() not in cmdline and not any(e.startswith(b"PIXEL_TEST_SECRET") for e in env)
                  and oct((yd / "token").stat().st_mode)[-3:] == "600", str(cmdline))
            check("its code is not the phone's", tok != PHONE and len(tok) >= 24)

            # ---- /ytcast: only the sidecar ----
            async with http.ws_connect(f"{base}/ytcast") as w:
                await w.send_json({"type": "hello", "token": PHONE})
                m = await w.receive(timeout=3)
                check("/ytcast with the phone's code: closed (4003)", m.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED) and w.close_code == 4003, f"{m.type} {w.close_code}")
            async with http.ws_connect(f"{base}/ytcast") as w:
                await w.send_json({"type": "play", "id": "dQw4w9WgXcQ"})
                await w.receive(timeout=3)
                check("/ytcast without hello: closed, nothing plays", w.close_code == 4003 and not state.get("cast"))
            for hd in ({"Origin": "http://localhost:8080"}, {"Origin": "null"}):
                try:
                    async with http.ws_connect(f"{base}/ytcast?t={PHONE}", headers=hd):
                        check(f"/ytcast from a browser page ({hd['Origin']}): refused", False)
                except aiohttp.WSServerHandshakeError as e:
                    check(f"/ytcast from a browser page ({hd['Origin']}): refused", e.status == 403, str(e.status))
            async with http.get(f"{base}/ytcast?t={PHONE}") as r:
                check("/ytcast as a plain page: not served", r.status in (400, 403, 404, 405) or r.status >= 400, str(r.status))

            # ---- a YouTube link from the phone, and the phone's remote control ----
            async with http.post(f"{base}/api/cast", json={"url": "https://youtu.be/aqz-KE-bpKQ?t=30"}, headers={"X-Pixel-Token": PHONE}) as r:
                await r.json()
            await pump(0.3)
            c = state["cast"]
            check("a YouTube link: what to play, its player address, its QR code (to watch it on a phone), until its end",
                  c["yt"] == {"id": "aqz-KE-bpKQ", "list": "", "start": 30, "music": False} and "start=30" in c["embed"] and len(c.get("qr") or []) >= 21 and c["until"] == 0, str(c)[:300])
            cid = c["id"]
            await act("yt.report", id=cid, vid="aqz-KE-bpKQ", state=1, pos=31.5, dur=596, vol=80, muted=False, title="Big Buck Bunny 60fps 4K")
            c = state["cast"]
            check("Pixel's player says what it plays: its real title, for the phone and the last casts", c["title"] == "Big Buck Bunny 60fps 4K"
                  and c["ytp"]["st"]["state"] == 1 and c["ytp"]["st"]["dur"] == 596 and state["cast_recent"][0]["title"] == "Big Buck Bunny 60fps 4K", str(c.get("ytp")))
            await act("yt.pause")
            p = state["cast"]["ytp"]
            check("yt.pause: an order for Pixel's player, numbered; the phone sees it paused at once", p["cmds"][-1]["op"] == "pause" and p["cmds"][-1]["n"] == p["n"] and p["st"]["state"] == 2, str(p))
            pos0 = p["st"]["pos"]
            await act("yt.seek", by=10)
            p = state["cast"]["ytp"]
            check("yt.seek by=10: 10 s further than where it was", p["cmds"][-1]["op"] == "seek" and abs(p["cmds"][-1]["to"] - (pos0 + 10)) < 0.5, str(p["cmds"][-1]))
            await act("yt.seek", by=-3600)
            check("yt.seek: never before the start", state["cast"]["ytp"]["cmds"][-1]["to"] == 0)
            await act("yt.seek", to=99999)
            check("yt.seek to=: never after the end", state["cast"]["ytp"]["st"]["pos"] == 596, str(state["cast"]["ytp"]["st"]))
            await act("yt.volume", by=-30)
            await act("yt.mute")
            p = state["cast"]["ytp"]
            check("yt.volume by=-30 from 80, then yt.mute", [x["op"] for x in p["cmds"][-2:]] == ["volume", "mute"] and p["cmds"][-2]["level"] == 50 and p["cmds"][-1]["on"] is True, str(p["cmds"][-2:]))
            await act("yt.toggle")
            check("yt.toggle: paused -> play", state["cast"]["ytp"]["cmds"][-1]["op"] == "play")
            for _ in range(8):
                await act("yt.play", wait=0.05)
            await pump(0.3)
            check("the last 8 orders only", len(state["cast"]["ytp"]["cmds"]) == 8)
            await act("yt.report", id="un-autre", state=2, pos=1)
            check("a report for another cast changes nothing", state["cast"]["ytp"]["st"]["state"] != 2 or state["cast"]["ytp"]["cmds"][-1]["op"] != "play")
            await act("yt.ended", id=cid)
            check("its end (yt.ended) ends the cast", state["cast"] is None)

            # ---- an error: the cast stays a while, with its QR code ----
            async with http.post(f"{base}/api/cast", json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}, headers={"X-Pixel-Token": PHONE}) as r:
                await r.json()
            await pump(0.3)
            c = state["cast"]
            await act("yt.report", id=c["id"], state=-1, err=150)
            c = state["cast"]
            left = (c["until"] - state["server_now"]) / 1000
            check("error 150 (embedding not allowed): kept for the phone, the cast ends by itself in 1 min 30", c["ytp"]["st"]["err"] == 150 and 80 < left <= 91, f"{left}")
            await act("yt.report", id=c["id"], state=-1, err="<script>")
            check("an error that is not one is not kept", "err" not in state["cast"]["ytp"]["st"])
            await act("cast.stop")

            # ---- the YouTube app, through the fake sidecar ----
            tell({"type": "sender", "event": "connect", "name": "Pixel 9 de Léa", "count": 1})
            await until(lambda: state["ytcast"]["senders"])
            check("a phone connects in the YouTube app: Pixel says so", state["ytcast"]["senders"] == ["Pixel 9 de Léa"] and "LÉA" in (state.get("toast") or {}).get("msg", ""), str(state.get("toast")))
            tell({"type": "play", "id": "aqz-KE-bpKQ", "pos": 12.5, "list": "RDaqz-KE-bpKQ"})
            await until(lambda: state.get("cast"))
            c = state["cast"] or {}
            check("its video plays in Pixel's player: a YouTube cast from the app, where the app was", c.get("yt", {}).get("id") == "aqz-KE-bpKQ" and c["yt"]["start"] == 12
                  and c["ytp"]["src"] == "appli" and len(c.get("qr") or []) >= 21, str(c)[:300])
            aid = c.get("id")
            await act("yt.report", id=aid, vid="aqz-KE-bpKQ", state=1, pos=13, dur=596, vol=100, muted=False)
            await until(lambda: "state" in got_types(), 3)
            st = [m for m in lines(got) if m.get("type") == "state"]
            check("what Pixel's player does goes back to the app", st and st[-1]["state"] == 1 and st[-1]["id"] == "aqz-KE-bpKQ" and st[-1]["dur"] == 596, str(st[-1:]))
            for m in ({"type": "pause"}, {"type": "seek", "pos": 100}, {"type": "volume", "level": 30, "muted": False}, {"type": "resume"}):
                tell(m)
            await until(lambda: len(state["cast"]["ytp"]["cmds"]) >= 5)
            ops = [(x["op"], x.get("to"), x.get("level")) for x in state["cast"]["ytp"]["cmds"]]
            check("the app's pause, seek, volume, resume: orders for Pixel's player", ops == [("pause", None, None), ("seek", 100, None), ("volume", None, 30), ("mute", None, None), ("play", None, None)], str(ops))
            tell({"type": "play", "id": "not-an-id!", "pos": 0})
            tell({"type": "seek", "pos": "nan"})
            await pump(0.5)
            check("nonsense from the sidecar changes nothing", state["cast"]["id"] == aid and state["cast"]["yt"]["id"] == "aqz-KE-bpKQ" and len(state["cast"]["ytp"]["cmds"]) == 5)
            # the end of its video: the app plays the next one in the same cast
            await act("yt.ended", id=aid)
            await until(lambda: "ended" in got_types(), 3)
            check("its end goes to the app (it may have a next one)", "ended" in got_types() and state["cast"] and state["cast"]["id"] == aid)
            tell({"type": "play", "id": "dQw4w9WgXcQ", "pos": 0})
            await until(lambda: state["cast"] and state["cast"]["yt"]["id"] == "dQw4w9WgXcQ")
            c = state["cast"]
            check("the app's next video: in the same cast, the player loads it (v)", c["id"] == aid and c["ytp"]["v"] == 2 and c["ytp"]["st"] is None and c["title"] == "Vidéo YouTube", str(c.get("ytp")))
            await act("yt.ended", id=aid)
            await pump(0.5)
            check("its end, and the app has nothing next: still on for a few seconds", state["cast"] is not None)
            await until(lambda: state["cast"] is None, ytcast.NEXT_WAIT + 3)
            check(f"... then the cast ends ({ytcast.NEXT_WAIT} s later)", state["cast"] is None)
            # a stop on Pixel is told to the app; the app's stop ends Pixel's cast
            n0 = got_types().count("stopped")
            tell({"type": "play", "id": "aqz-KE-bpKQ", "pos": 0})
            await until(lambda: state.get("cast"))
            await act("cast.stop")
            await until(lambda: got_types().count("stopped") > n0, 3)
            check("stopped on Pixel (a touch, the phone): the app hears it", got_types().count("stopped") == n0 + 1)
            tell({"type": "play", "id": "aqz-KE-bpKQ", "pos": 0})
            await until(lambda: state.get("cast"))
            tell({"type": "stop"})
            await until(lambda: state.get("cast") is None, 3)
            check("stopped in the app: the cast ends", state.get("cast") is None)
            tell({"type": "play", "id": "aqz-KE-bpKQ", "pos": 0})
            await until(lambda: state.get("cast"))
            await act("screen.show", screen="meteo")
            await until(lambda: got_types().count("stopped") > n0 + 1, 3)
            check("another screen opened: the app hears it too", state.get("cast") is None and got_types().count("stopped") == n0 + 2)
            tell({"type": "play", "id": "aqz-KE-bpKQ", "pos": 0})
            await until(lambda: state.get("cast"))
            await act("yt.report", id=state["cast"]["id"], state=-1, err=101)
            await until(lambda: "error" in got_types(), 3)
            check("an error of Pixel's player goes to the app", [m for m in lines(got) if m.get("type") == "error"][-1]["code"] == 101)
            await act("cast.stop")
            # the TV code on Pixel's screen, until a phone pairs
            await act("ytcast.code")
            c = state["cast"] or {}
            check("ytcast.code: the TV code on Pixel's screen for 5 minutes, not in the last casts", c.get("kind") == "ytcode" and 295 < (c["until"] - state["server_now"]) / 1000 <= 301
                  and all(e["kind"] != "ytcode" for e in state["cast_recent"]), str(c))
            await act("cmd", text="code télé")
            check("typed: « code télé »", (state.get("cast") or {}).get("kind") == "ytcode")
            tell({"type": "sender", "event": "connect", "name": "iPhone de Sam", "count": 2})
            await until(lambda: state.get("cast") is None, 3)
            check("a phone pairs: the code goes", state.get("cast") is None and state["ytcast"]["senders"] == ["Pixel 9 de Léa", "iPhone de Sam"])
            tell({"type": "sender", "event": "disconnect", "name": "Pixel 9 de Léa", "count": 1})
            await until(lambda: len(state["ytcast"]["senders"]) == 1, 3)
            check("a phone leaves", state["ytcast"]["senders"] == ["iPhone de Sam"])

            # ---- the sidecar crashes: Pixel goes on, and starts it again ----
            tell({"do": "exit", "code": 3})
            await until(lambda: not state["ytcast"]["ok"], 4)
            status = state["ytcast"]["status"]
            async with http.get(base + "/") as r:
                check("the sidecar crashed: Pixel goes on, and says it starts it again", r.status == 200 and "relance" in status, status)
            await until(lambda: state["ytcast"]["ok"], 10)
            pids = (yd / "pids.txt").read_text().split()
            check("... and starts it again", state["ytcast"]["ok"] and len(pids) == 2 and pids[0] != pids[1], f"{pids} {state['ytcast']}")
            return int(pids[-1])


async def off(datadir):
    async with aiohttp.ClientSession() as http:
        async with http.ws_connect(f"http://127.0.0.1:{PORT_OFF}/ws") as ws:
            s = json.loads((await ws.receive(timeout=3)).data)["data"]
            check("without [ytcast]: off, and the phone can say so", s["ytcast"]["on"] is False and s["ytcast"]["status"] == "éteint")
            await ws.send_str(json.dumps({"action": "ytcast.code", "args": {}}))
            m = json.loads((await ws.receive(timeout=3)).data)["data"]
            check("without [ytcast]: the TV code says it is not on", "pas activé" in (m.get("toast") or {}).get("msg", "") and m["cast"] is None)
        async with http.get(f"http://127.0.0.1:{PORT_OFF}/ytcast") as r:
            check("without [ytcast]: /ytcast is not there", r.status == 404, str(r.status))
    check("without [ytcast]: no sidecar started", not (Path(datadir) / "ytcast").exists())


def gone(pid, seconds=5):
    end = time.time() + seconds
    while time.time() < end:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return True
        time.sleep(0.1)
    return False


if __name__ == "__main__":
    pieces()
    with tempfile.TemporaryDirectory() as tmp:
        yt = f'[ytcast]\nenabled = true\ncommand = ["{sys.executable}", "tests/fake_ytcast.py"]\n'
        srv = start_server(PORT, tmp, yt)
        pid = None
        try:
            pid = asyncio.run(main(tmp))
        finally:
            srv.send_signal(signal.SIGTERM)        # as systemd stops it: no cleanup in Python, the sidecar's stdin closes
            srv.wait()
        if pid:
            check("the server stopped: so is the sidecar", gone(pid))
        if fails:
            print((Path(tmp) / "server.log").read_text()[-3000:])
    with tempfile.TemporaryDirectory() as tmp:
        srv = start_server(PORT_OFF, tmp)
        try:
            asyncio.run(off(tmp))
        finally:
            srv.terminate()
            srv.wait()
    print("\n%d failure(s)" % len(fails))
    sys.exit(1 if fails else 0)
