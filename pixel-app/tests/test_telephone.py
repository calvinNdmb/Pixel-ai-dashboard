"""The phone's notifications (pixel/telephone.py, POST /api/notif), what the Android app (pixel-mobile) sends.

    python3 tests/test_telephone.py                # in-process servers, then a demo server (port 8146, temporary data folder)

- in-process, with a clock of our own: the access rule (the Pi itself from Pixel's own page, else the code in X-Pixel-Token
  or ?t=, from the home network), what is accepted (JSON only, small, an app's name, a short title, a category word), the
  limits (per app, per minute), the toast for his 'notif' scenes and the snapshot's "telephone" (never the title);
- server.py: one import and one setup line, and the real demo server answers /api/notif with a toast on the WebSocket.
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
from aiohttp import web
from aiohttp.test_utils import TestServer

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
import server  # noqa: E402
from pixel import telephone  # noqa: E402
from pixel.state import Hub  # noqa: E402
from pixel.system import local_ip  # noqa: E402

PORT = 8146
TOKEN = "code-secret_42"
fails = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


class Clock:
    t = 1_800_000_000.0


def make(host="127.0.0.1"):
    hub = Hub({}, demo=True)
    app = web.Application(middlewares=[server.home_only])
    telephone.setup(hub, app, TOKEN)
    return hub, TestServer(app, host=host, port=0)


async def post(http, base, body=None, headers=None, raw=None, query=""):
    h = {"Content-Type": "application/json", **(headers or {})}
    data = raw if raw is not None else json.dumps(body).encode()
    async with http.post(base + "/api/notif" + query, data=data, headers=h) as r:
        try:
            j = await r.json(content_type=None)
        except ValueError:
            j = None
        return r.status, j


async def local_checks():
    telephone.now_s = lambda: Clock.t
    hub, srv = make()
    await srv.start_server()
    base = f"http://127.0.0.1:{srv.port}"
    try:
        async with aiohttp.ClientSession() as http:
            s, j = await post(http, base, {"app": "WhatsApp", "title": "Maman", "category": "msg"})
            check("the Pi itself (no Origin): accepted without the code", s == 200 and j == {"ok": True}, f"{s} {j}")
            check("…a toast « 📱 WhatsApp : Maman » (his 'notif' scenes play for it)", (hub.s["toast"] or {}).get("msg") == "📱 WhatsApp : Maman", hub.s["toast"])
            last = hub.s["telephone"]["last"]
            check("…the snapshot's telephone.last: the app, the category, the time, never the title",
                  last == {"app": "WhatsApp", "category": "msg", "t": Clock.t * 1000} and "Maman" not in json.dumps(hub.s["telephone"]), last)
            check("…the snapshot carries it", "telephone" in hub.snapshot())
            Clock.t += 100
            s, j = await post(http, base, {"app": "Gmail"}, headers={"Origin": "http://evil.example"})
            check("the Pi, from a page of another site on its screen: refused without the code", s == 403 and j["ok"] is False and "QR code" in j["error"], f"{s} {j}")
            s, j = await post(http, base, {"app": "Gmail"}, headers={"Origin": f"http://127.0.0.1:{srv.port}"})
            check("the Pi, from Pixel's own page (same origin): accepted", s == 200, f"{s} {j}")

            # what is accepted
            Clock.t += 100
            n0 = hub.s["toast"]["id"]
            for what, kw, want in [
                ("not JSON (a form)", {"raw": b"app=WhatsApp", "headers": {"Content-Type": "application/x-www-form-urlencoded"}}, 415),
                ("unreadable JSON", {"raw": b"{app:"}, 400),
                ("a JSON list", {"body": ["WhatsApp"]}, 400),
                ("no app", {"body": {"title": "Maman"}}, 400),
                ("an app that is not text", {"body": {"app": 42}}, 400),
                ("an app made of spaces and control characters", {"body": {"app": " \n\t\x00 "}}, 400),
                ("a body over 2 kB", {"body": {"app": "WhatsApp", "title": "x" * 3000}}, 413),
            ]:
                s, j = await post(http, base, kw.get("body"), headers=kw.get("headers"), raw=kw.get("raw"))
                check(f"refused: {what} ({want}, a French error)", s == want and j and j["ok"] is False and j["error"], f"{s} {j}")
            check("…and none of them made a toast", hub.s["toast"]["id"] == n0)
            s, j = await post(http, base, {"app": "Une appli au nom vraiment beaucoup trop long pour un bandeau", "title": "Quelqu'un\nqui écrit\x07 " + "très " * 30, "category": "Pas Une Catégorie!"})
            m = hub.s["toast"]["msg"]
            app_part, title_part = m[2:].split(" : ", 1)
            check("a long app name: cut at 40 characters with …", s == 200 and len(app_part) == 40 and app_part.endswith("…"), m)
            check("a title: one line, no control character, cut at 60 with …", "\n" not in m and "\x07" not in m and len(title_part) == 60 and title_part.endswith("…"), m)
            check("a category that is not a word: left out", hub.s["telephone"]["last"]["category"] is None, hub.s["telephone"]["last"])
            Clock.t += 100
            for cat, want in [("msg", "📱 Nouveau message Signal"), ("email", "📱 Nouvel e-mail Signal"), ("missed_call", "📱 Appel manqué Signal"), ("social", "📱 Signal"), (None, "📱 Signal")]:
                body = {"app": "Signal", **({"category": cat} if cat else {})}
                s, j = await post(http, base, body)
                check(f"no title, category {cat}: « {want} »", s == 200 and hub.s["toast"]["msg"] == want, f"{s} {hub.s['toast']}")
                Clock.t += telephone.GAP_S + 1

            # the limits
            Clock.t += 100
            s1, _ = await post(http, base, {"app": "WhatsApp"})
            Clock.t += telephone.GAP_S - 1
            n1 = hub.s["toast"]["id"]
            s2, j2 = await post(http, base, {"app": "whatsapp"})
            check(f"the same app again within {telephone.GAP_S} s: 429, a French error, no toast",
                  s1 == 200 and s2 == 429 and "notifications" in j2["error"] and hub.s["toast"]["id"] == n1, f"{s1} {s2} {j2}")
            Clock.t += 2
            s3, _ = await post(http, base, {"app": "WhatsApp"})
            check("…and accepted again after that", s3 == 200, s3)
            Clock.t += 100
            got = []
            for i in range(telephone.PER_MIN + 1):
                got.append((await post(http, base, {"app": f"Appli {i}"}))[0])
                Clock.t += 1
            check(f"{telephone.PER_MIN} different apps within a minute, then 429", got == [200] * telephone.PER_MIN + [429], got)
            Clock.t += 61
            check("…a minute later, accepted again", (await post(http, base, {"app": "Appli 99"}))[0] == 200)
    finally:
        await srv.close()


async def remote_checks():
    """From another device of the home network: the access code, in the header or in ?t=."""
    ip = local_ip()
    if not ip or ip.startswith("127."):
        print("SKIP remote checks: no network address")
        return
    hub, srv = make(ip)
    try:
        await srv.start_server()
    except OSError:
        print(f"SKIP remote checks: cannot listen on {ip}")
        return
    base = f"http://{ip}:{srv.port}"
    try:
        async with aiohttp.ClientSession() as http:
            Clock.t += 100
            s, j = await post(http, base, {"app": "WhatsApp"})
            check("another device without the code: 403, « scanne à nouveau le QR code »", s == 403 and "QR code" in j["error"], f"{s} {j}")
            s, j = await post(http, base, {"app": "WhatsApp"}, headers={"X-Pixel-Token": "faux"})
            check("…with a wrong code: 403", s == 403, s)
            s, j = await post(http, base, {"app": "WhatsApp"}, query="?t=faux")
            check("…with a wrong ?t=: 403", s == 403, s)
            check("…and no toast", hub.s["toast"] is None, hub.s["toast"])
            s, j = await post(http, base, {"app": "WhatsApp"}, headers={"X-Pixel-Token": TOKEN})
            check("…with the code in X-Pixel-Token: accepted", s == 200 and hub.s["toast"]["msg"] == "📱 WhatsApp", f"{s} {hub.s['toast']}")
            Clock.t += 100
            s, j = await post(http, base, {"app": "Gmail"}, query="?t=" + TOKEN)
            check("…with the code in ?t=: accepted", s == 200, s)
    finally:
        await srv.close()


def wiring_checks():
    src = (APP / "server.py").read_text()
    lines = [ln for ln in src.splitlines() if "telephone" in ln]
    check("server.py: one import and one setup line for pixel/telephone.py, nothing else",
          len(lines) == 2 and re.match(r"^from pixel import telephone\b", lines[0]) and re.match(r"^\s+telephone\.setup\(hub, app, token\)", lines[1]), lines)


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


async def demo_checks(datadir):
    token = (Path(datadir) / "token").read_text().strip()
    ip = local_ip()
    host = ip if ip and not ip.startswith("127.") else "127.0.0.1"
    async with aiohttp.ClientSession() as http:
        async with http.ws_connect(f"http://127.0.0.1:{PORT}/ws") as ws:
            await ws.receive(timeout=3)
            async with http.post(f"http://{host}:{PORT}/api/notif", json={"app": "WhatsApp", "title": "Maman", "category": "msg"},
                                 headers={"X-Pixel-Token": token}) as r:
                ok = r.status == 200 and (await r.json()) == {"ok": True}
            state = None
            end = time.time() + 3
            while time.time() < end:
                m = json.loads((await ws.receive(timeout=3)).data)
                if m["type"] == "state" and (m["data"].get("toast") or {}).get("msg", "").startswith("📱"):
                    state = m["data"]
                    break
            check("the demo server: POST /api/notif with the code, then the toast on the WebSocket", ok and state and state["toast"]["msg"] == "📱 WhatsApp : Maman", state and state.get("toast"))
            check("…and the snapshot's telephone.last", state and state["telephone"]["last"]["app"] == "WhatsApp" and state["telephone"]["last"]["category"] == "msg", state and state.get("telephone"))


if __name__ == "__main__":
    wiring_checks()
    real_now = telephone.now_s
    asyncio.run(local_checks())
    asyncio.run(remote_checks())
    telephone.now_s = real_now
    with tempfile.TemporaryDirectory() as tmp:
        srv = start_server(PORT, tmp)
        try:
            asyncio.run(demo_checks(tmp))
        finally:
            srv.terminate()
            srv.wait()
    print("\n%d failure(s)" % len(fails))
    sys.exit(1 if fails else 0)
