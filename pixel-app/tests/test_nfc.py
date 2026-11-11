"""The NFC tag's page (pixel/nfc.py, web/nfc.html, web/nfc.js), driven through a demo server like a phone would:

    python3 tests/test_nfc.py                  # its own demo server on port 8480, temporary data folder
    NFC_PY_PORT=8481 python3 tests/test_nfc.py # another port for it

- the page: no access code in it, except for an old tag that already carries it; the app's link when pixel.apk is there;
- the code on Pixel's screen: a card (a cast of kind "code") with 6 digits, the same one while it is there, never over
  something cast; a touch on Pixel's screen refuses it (then a quiet while); 5 tries; 30 wrong codes in an hour from one
  device, and no more codes for it;
- the right code: a session, the access code, the card gone, « TÉLÉPHONE RELIÉ »;
- the settings need the session: the Wi-Fi (the demo's NetworkManager: a network joined), Claude's API key, write only
  (its form checked, kept in data_dir/claude.env, 0600, never in an answer, the snapshot, the page nor the log; load_key
  reads it back at start);
- a page of another site cannot use the routes (its Origin), and they take JSON only;
- the pieces around: server.py, screens.js draws the card, index.html's « Réglages du Pi ».
"""
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
from pixel import nfc  # noqa: E402

PORT = int(os.environ.get("NFC_PY_PORT") or 8480)
BASE = f"http://127.0.0.1:{PORT}"
KEY = "sk-ant-api03-" + "T3stKey_" * 6
fails = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


def start_server(datadir, log):
    try:
        socket.create_connection(("127.0.0.1", PORT), 0.2).close()
        raise SystemExit(f"le port {PORT} est déjà pris")
    except OSError:
        pass
    d = Path(datadir).as_posix()
    cfg = Path(datadir) / "config.toml"
    cfg.write_text(f'data_dir = "{d}"\n\n[nfc]\nspacing = 0.2\nquiet_seconds = 0.6\n\n[airplay]\nruntime_dir = "{d}/run"\n', encoding="utf-8")
    env = {k: v for k, v in os.environ.items() if k not in ("ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN")}
    env["PYTHONIOENCODING"] = "utf-8"                    # its log, read back below, whatever the system's encoding
    p = subprocess.Popen([sys.executable, str(APP / "server.py"), "--demo", "--port", str(PORT), "--host", "127.0.0.1", "--config", str(cfg)],
                         cwd=APP, stdout=log, stderr=subprocess.STDOUT, env=env)
    for _ in range(150):
        try:
            socket.create_connection(("127.0.0.1", PORT), 0.2).close()
            return p
        except OSError:
            time.sleep(0.1)
    p.kill()
    raise SystemExit(f"le serveur de démo ne démarre pas sur le port {PORT}")


class Phone:
    """A phone on the Wi-Fi: the page's requests (JSON, the session header), and the access code's WebSocket for the state."""
    def __init__(self, http, token):
        self.http, self.token, self.session = http, token, None

    async def post(self, path, body=None, **kw):
        h = {"X-Pixel-Session": self.session} if self.session else {}
        h.update(kw.pop("headers", {}))
        async with self.http.post(BASE + path, json=body if body is not None else {}, headers=h, **kw) as r:
            return r.status, await r.json(content_type=None)

    async def get(self, path):
        h = {"X-Pixel-Session": self.session} if self.session else {}
        async with self.http.get(BASE + path, headers=h) as r:
            return r.status, await r.text()

    async def snap(self):
        async with self.http.ws_connect(f"{BASE}/ws?t={self.token}") as ws:
            return json.loads((await ws.receive(timeout=5)).data)["data"]

    async def act(self, action, args=None):
        async with self.http.ws_connect(f"{BASE}/ws?t={self.token}") as ws:
            await ws.receive(timeout=5)
            await ws.send_str(json.dumps({"action": action, "args": args or {}}))
            await asyncio.sleep(0.3)

    async def card(self):
        c = (await self.snap()).get("cast")
        return c if c and c.get("kind") == "code" else None

    async def fresh_code(self):
        for _ in range(30):
            st, j = await self.post("/api/nfc/code")
            if st == 200:
                return (await self.card())["code"]
            await asyncio.sleep(0.25)
        raise AssertionError(f"pas de code : {j}")


async def run(tmp, log_path):
    token = (tmp / "token").read_text().strip()
    (tmp / "pixel.apk").write_bytes(b"PK\x03\x04 not really an app")
    async with aiohttp.ClientSession() as http:
        ph = Phone(http, token)

        # ---- the page ----
        st, page = await ph.get("/nfc")
        check("GET /nfc: the page, its settings in window.PIXEL_NFC", st == 200 and "window.PIXEL_NFC" in page and "/app/nfc.js" in page, st)
        check("…no access code in it", token not in page)
        cfg = json.loads(re.search(r"window\.PIXEL_NFC = (\{.*?\});", page).group(1))
        check("…the app's link when pixel.apk is on the Pi, no « go » without the code", cfg == {"apk": True, "go": ""}, cfg)
        st, page = await ph.get(f"/nfc?t={token}")
        check("an old tag with the access code: Pixel opens with it", f'"go": "/?t={token}"' in page)
        st, page = await ph.get("/nfc?t=pas-le-bon-code")
        check("…a wrong one: nothing", token not in page and '"go": ""' in page)

        # ---- what the routes take ----
        async with http.post(BASE + "/api/nfc/code", data="x", headers={"Content-Type": "text/plain"}) as r:
            check("JSON only (a form of another site cannot send it without asking)", r.status == 415, r.status)
        st, j = await ph.post("/api/nfc/code", headers={"Origin": "http://evil.example"})
        check("a page of another site (its Origin): refused", st == 403 and not j["ok"], (st, j))
        check("…and no card on Pixel for it", await ph.card() is None)

        # ---- the code ----
        st, j = await ph.post("/api/nfc/code", headers={"Origin": BASE})
        c = await ph.card()
        check("a code: a card on Pixel's screen with 6 digits", st == 200 and j["ok"] and c and re.fullmatch(r"\d{6}", c["code"])
              and c["title"] == "Relier un téléphone" and c["until"] > c["t0"], (st, j, c))
        st, j = await ph.post("/api/nfc/code")
        c2 = await ph.card()
        check("…asked again while it is there: the same one", st == 200 and c2 and c2["id"] == c["id"] and c2["code"] == c["code"])
        st, j = await ph.get("/api/nfc/state")
        check("no settings without the code (401)", st == 401, st)
        wrong = "000000" if c["code"] != "000000" else "111111"
        left = []
        for _ in range(4):
            st, j = await ph.post("/api/nfc/pair", {"code": wrong})
            left.append(j["error"])
        check("wrong codes: refused, the tries left said", all("Encore" in e for e in left) and "Encore 1 essai." in left[-1], left)
        st, j = await ph.post("/api/nfc/pair", {"code": wrong})
        check("…the 5th: « Trop d'essais », the card gone", st == 403 and "Trop d'essais" in j["error"] and await ph.card() is None, j)
        st, j = await ph.post("/api/nfc/pair", {"code": c["code"]})
        check("…and that code no longer works", st == 409 and not j["ok"], (st, j))

        await ph.fresh_code()
        await ph.act("cast.stop")                       # a touch on Pixel's screen
        st, j = await ph.post("/api/nfc/code")
        check("a touch on Pixel refuses the code: no new one at once", st == 429 and "refusé" in j["error"], (st, j))
        await asyncio.sleep(0.8)
        await ph.act("cast.text", {"text": "Coucou"})
        st, j = await ph.post("/api/nfc/code")
        check("never over something cast", st == 409 and "montre déjà" in j["error"], (st, j))
        await ph.act("cast.stop")

        # ---- the right code ----
        code = await ph.fresh_code()
        st, j = await ph.post("/api/nfc/pair", {"code": code[:3] + " " + code[3:]})
        snap = await ph.snap()
        check("the right code (spaces or not): a session and the access code", st == 200 and j["ok"] and j["session"] and j["token"] == token
              and j["ttl"] == 900, j)
        check("…the card gone, « TÉLÉPHONE RELIÉ » on the screens", not snap.get("cast") and (snap.get("toast") or {}).get("msg") == "TÉLÉPHONE RELIÉ", snap.get("toast"))
        ph.session = j["session"]

        # ---- the settings ----
        st, text = await ph.get("/api/nfc/state")
        s = json.loads(text)
        check("the state: his Wi-Fi (demo), whether there is a key", st == 200 and s["wifi"]["ok"] and s["wifi"]["ssid"] == "Maison"
              and len(s["wifi"]["nets"]) == 5 and s["key"] == {"set": False, "mode": "demo"}, s)
        st, j = await ph.post("/api/nfc/wifi/scan")
        check("a Wi-Fi scan", st == 200 and j["ok"], j)
        await asyncio.sleep(4.2)                        # the scans' own spacing (pixel/wifi.py)
        st, j = await ph.post("/api/nfc/wifi/join", {"ssid": "Les voisins:5G", "password": "voisins123"})
        job = None
        for _ in range(40):
            await asyncio.sleep(0.2)
            job = json.loads((await ph.get("/api/nfc/state"))[1])["wifi"]["job"]
            if job and job["state"] != "connecting":
                break
        check("a network joined from the page", st == 200 and job and job["ssid"] == "Les voisins:5G" and job["state"] == "ok", job)
        st, j = await ph.post("/api/nfc/wifi/join", {"ssid": 3})
        check("…a network that is not one: refused", st == 400, (st, j))

        st, j = await ph.post("/api/nfc/key", {"key": "pas-une-cle"})
        check("an API key that is not one: refused, said how it starts", st == 400 and "sk-ant-" in j["error"], j)
        st, j = await ph.post("/api/nfc/key", {"key": KEY})
        check("a new API key: kept (demo: not asked of Anthropic, no restart)", st == 200 and j["ok"] and j["restart"] is False
              and "enregistrée" in j["message"] and KEY not in json.dumps(j), j)
        f = tmp / nfc.KEY_FILE
        check("…in data_dir/claude.env", f.is_file() and f"ANTHROPIC_API_KEY={KEY}" in f.read_text(encoding="utf-8"))
        if os.name == "posix":
            check("…readable by the Pi's user only (0600)", (f.stat().st_mode & 0o777) == 0o600, oct(f.stat().st_mode & 0o777))
        st, text = await ph.get("/api/nfc/state")
        check("…the state says there is one, never which", json.loads(text)["key"]["set"] is True and KEY not in text and "sk-ant" not in text)
        check("…not in the snapshot", KEY not in json.dumps(await ph.snap(), ensure_ascii=False))
        check("…not in the page", KEY not in (await ph.get("/nfc"))[1])
        sess, ph.session = ph.session, None
        st, j = await ph.post("/api/nfc/key", {"key": KEY})
        check("no key without the session (401)", st == 401, (st, j))
        st, j = await ph.post("/api/nfc/key", {"key": KEY}, headers={"X-Pixel-Session": sess, "Origin": "http://evil.example"})
        check("…nor from a page of another site, even with it", st == 403, (st, j))

        # ---- too many wrong codes from one device ----
        locked = False
        for _ in range(60):
            st, j = await ph.post("/api/nfc/code")
            if st == 429 and "codes faux" in j["error"]:
                locked = True
                break
            if st != 200:
                await asyncio.sleep(0.25)
                continue
            for _ in range(5):
                st, j = await ph.post("/api/nfc/pair", {"code": "999999"})
        check("30 wrong codes in an hour from one device: no more codes for it", locked, j)

    log_text = log_path.read_text(encoding="utf-8", errors="replace")
    check("the server's log never has the key", KEY not in log_text and "T3stKey_" not in log_text)
    check("…and says it was saved", "nouvelle clé API enregistrée" in log_text, log_text[-300:])


def load_key_back():
    with tempfile.TemporaryDirectory() as d:
        before = os.environ.pop("ANTHROPIC_API_KEY", None)
        try:
            nfc.save_key(d, KEY)
            ok = nfc.load_key(d)
            check("load_key: the page's key comes back at start, before /etc/pixel.env's", ok and os.environ.get("ANTHROPIC_API_KEY") == KEY)
            Path(d, nfc.KEY_FILE).write_text("ANTHROPIC_API_KEY=pas-une-cle\nLD_PRELOAD=/tmp/x.so\n", encoding="utf-8")
            os.environ.pop("ANTHROPIC_API_KEY", None)
            check("…a file that does not hold a key: nothing taken from it", not nfc.load_key(d) and "ANTHROPIC_API_KEY" not in os.environ
                  and os.environ.get("LD_PRELOAD") != "/tmp/x.so")
        finally:
            os.environ.pop("ANTHROPIC_API_KEY", None)
            if before is not None:
                os.environ["ANTHROPIC_API_KEY"] = before


def pieces():
    srv = (APP / "server.py").read_text(encoding="utf-8")
    check("server.py: the page's routes, the key read at start", "nfc.setup(" in srv and "nfc.load_key(datadir)" in srv and "async def nfc(" not in srv)
    sc = (APP / "web" / "screens.js").read_text(encoding="utf-8")
    check("screens.js draws the code's card", "c.kind === 'code') castScreen(c)" in sc)
    idx = (APP / "web" / "index.html").read_text(encoding="utf-8")
    check("index.html: « Réglages du Pi » leads to /nfc", 'id="piSettings" href="/nfc"' in idx)
    html = (APP / "web" / "nfc.html").read_text(encoding="utf-8")
    check("nfc.html: its settings' slot, its script", "<!-- PIXEL:NFC -->" in html and 'src="/app/nfc.js"' in html)


def main():
    load_key_back()
    pieces()
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        log_path = tmp / "server.log"
        with open(log_path, "wb") as log:
            p = start_server(tmp, log)
            try:
                asyncio.run(run(tmp, log_path))
            finally:
                p.terminate()
                try:
                    p.wait(5)
                except subprocess.TimeoutExpired:
                    p.kill()
    print(f"\n{len(fails)} failure(s)")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
