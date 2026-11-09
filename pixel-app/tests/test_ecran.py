"""Screen sharing on the server side (pixel/ecran.py): a demo server driven like the computer's page, Pixel's screen and the phone.

    python3 tests/test_ecran.py        # starts its own demo server (port 8152, https on 8158 if openssl is there, a temporary data folder)
    ECRAN_PY_PORT=8252 ECRAN_HTTPS_PORT=8258 ECRAN_TRAP_PORT=8257 python3 tests/test_ecran.py   # other ports (the trap: a fake ScreenStream)

- its pieces: ICE candidates and SDPs cleaned, the sender's name, the phone's address for ScreenStream;
- the signalling: nothing is relayed before the one-time code (or the access code); the code is shown on Pixel and in the
  state, never told to the computer; wrong codes are counted and burn the code; codes are spaced, and a page without the
  access code cannot cover a cast nor reopen a code closed on Pixel; too many wrong codes lock out that device only, never
  the phone app's code; only Pixel's own screen can receive; another site's page cannot even connect, by its Origin or by
  a name of its own that leads to Pixel (DNS rebinding), nor a sandboxed frame (Origin: null); the downloaded page
  (Origin: null, with the launcher's key) can; the offer, the answer and the ICE candidates relayed with their own fields only;
- the connections: a few without a code per device, never counting Pixel's own screen; one without a code is closed soon;
- the session: connecting, live, then every way it ends (the computer, a touch or Arrêter, another screen, another cast,
  Pixel's screen not answering, no picture, a lost connection, the page closed, another computer);
- Android's ScreenStream: the phone's address from its request, a typed one checked, the server never connects to it;
- the downloaded launcher (no secret in it) and the optional https address.
"""
import asyncio
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import aiohttp

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
from pixel import ecran  # noqa: E402
from pixel.state import Hub  # noqa: E402
from pixel.system import local_ip  # noqa: E402

PORT, HTTPS, TRAP = (int(os.environ.get(k) or d) for k, d in (("ECRAN_PY_PORT", 8152), ("ECRAN_HTTPS_PORT", 8158), ("ECRAN_TRAP_PORT", 8157)))
TOKEN = "le-code-de-test"
IDLE = 2                    # [ecran] idle_wait here: a connection without a code is closed after 2 s
fails = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


def start_server(datadir, tls):
    try:
        socket.create_connection(("127.0.0.1", PORT), 0.2).close()
        raise SystemExit(f"le port {PORT} est déjà pris : arrête ce serveur, ou change de port (ECRAN_PY_PORT=…)")
    except OSError:
        pass
    cfg = Path(datadir) / "config.toml"
    cfg.write_text(f'data_dir = "{datadir}"\n[security]\ntoken = "{TOKEN}"\n[ecran]\nkiosk_wait = 1.5\nlive_wait = 3\nidle_wait = {IDLE}\n'
                   + (f"https_port = {HTTPS}\n" if tls else ""))
    p = subprocess.Popen([sys.executable, str(APP / "server.py"), "--demo", "--port", str(PORT), "--config", str(cfg)], cwd=APP,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(100):
        try:
            socket.create_connection(("127.0.0.1", PORT), 0.2).close()
            return p
        except OSError:
            time.sleep(0.1)
    p.kill()
    raise SystemExit(f"le serveur de démo ne démarre pas sur le port {PORT}")


def make_cert(datadir):
    """The certificate install.sh makes (openssl, a SAN, serverAuth), in the data folder's tls/."""
    if not shutil.which("openssl"):
        return False
    d = Path(datadir) / "tls"
    d.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-days", "825", "-nodes", "-keyout", str(d / "pixel.key"),
                        "-out", str(d / "pixel.crt"), "-subj", "/CN=pixel.local", "-addext", "subjectAltName=DNS:pixel.local,DNS:localhost,IP:127.0.0.1",
                        "-addext", "extendedKeyUsage=serverAuth", "-addext", "basicConstraints=critical,CA:FALSE"], capture_output=True)
    return r.returncode == 0


def pieces():
    ice = ecran.clean_ice({"candidate": "candidate:1 1 udp 2122 192.168.1.9 50000 typ host", "sdpMid": "0", "sdpMLineIndex": 0, "usernameFragment": "ab", "evil": "<script>"})
    check("clean_ice: its four fields only", ice == {"candidate": "candidate:1 1 udp 2122 192.168.1.9 50000 typ host", "sdpMid": "0", "sdpMLineIndex": 0, "usernameFragment": "ab"}, str(ice))
    check("clean_ice: the end of the candidates (None) passes", ecran.clean_ice(None) is None)
    bad = 0
    for c in ("x", {"candidate": 3}, {"candidate": "c" * 2000}, ["candidate"]):
        try:
            ecran.clean_ice(c)
        except ValueError:
            bad += 1
    check("clean_ice: anything else is refused", bad == 4)
    bad = 0
    for s in (None, "", "<html>", "v=0" + "x" * 300000, 42):
        try:
            ecran.clean_sdp(s)
        except ValueError:
            bad += 1
    check("clean_sdp: an SDP starts with v=0 and stays small", bad == 5 and ecran.clean_sdp("v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n").startswith("v=0"))
    check("clean_name: letters, digits, a few marks, 40 characters", ecran.clean_name("PC <b>Windows</b> de Léa") == "PC bWindowsb de Léa" and len(ecran.clean_name("x" * 99)) == 40)
    pa = ecran.phone_address
    ok = [(("192.168.1.23", ""), ("192.168.1.23", None)), (("10.0.0.5", ""), ("10.0.0.5", None)), (("::ffff:192.168.1.23", ""), ("192.168.1.23", None)),
          (("127.0.0.1", "192.168.1.30:8081"), ("192.168.1.30", 8081)), (("192.168.1.2", "http://172.16.4.4:8080/"), ("172.16.4.4", 8080)),
          (("192.168.1.2", "192.168.1.31:8080/stream.mjpeg"), ("192.168.1.31", 8080)), (("192.168.1.2", "[fd00::5]:8080"), ("fd00::5", 8080))]
    got = [(str(ip), port) for (r, t), _ in ok for ip, port in [pa(r, t)]]
    check("phone_address: the phone's own address, or the one ScreenStream shows (IPv4, IPv4 in IPv6, a home IPv6)", got == [w for _, w in ok], str(got))
    refused = []
    for r, t in (("127.0.0.1", ""), ("::1", ""), ("fe80::1%wlan0", ""), ("192.168.1.2", "example.com:8080"), ("192.168.1.2", "8.8.8.8:8080"), ("192.168.1.2", "127.0.0.1:8080"),
                 ("192.168.1.2", "http://moi:secret@192.168.1.3/"), ("192.168.1.2", "https://192.168.1.3/"), ("192.168.1.2", "192.168.1.3:8080/../config"),
                 ("192.168.1.2", "192.168.1.3:8080/?x=1"), ("192.168.1.2", "224.0.0.1"), ("192.168.1.2", "x" * 200), ("8.8.8.8", "")):
        try:
            pa(r, t)
            refused.append(f"{r} {t}: accepted")
        except ecran.AddressError as e:
            if not str(e):
                refused.append(f"{r} {t}: no reason")
    check("phone_address: the Pi itself, a name, a public or loopback address, a password, https, another path, IPv6 link-local: refused, in French", not refused, str(refused))
    why = []
    for r in ("2a01:e0a:1f2:3a40::5", "fd00::5", "fe80::1%wlan0"):
        try:
            pa(r, "")
            why.append(f"{r}: accepted")
        except ecran.AddressError as e:
            why.append("" if "IPv4" in str(e) and "Adresse" in str(e) else f"{r}: {e}")
    check("phone_address: a phone seen by IPv6 (a public one too, as on French boxes): asked to type the IPv4 address ScreenStream shows", not any(why), str(why))


def lockout():
    """In one process: wrong codes counted per device, the launcher's key, Pixel's own names."""
    with tempfile.TemporaryDirectory() as tmp:
        hub = Hub({})
        e = ecran.Ecran(hub, {"https_port": 8443}, APP / "web", tmp, TOKEN, host="pixel", port=8080)
        bad, good = ecran.device("192.168.1.66"), ecran.device("192.168.1.20")
        for _ in range(ecran.MAX_FAILS // ecran.TRIES):
            e.last_code, hub.s["cast"] = 0, None                # no spacing between codes here
            e._pair(who=bad)
            wrong = f"{(int(e.code['code']) + 1) % 10 ** 6:06d}"
            for _ in range(ecran.TRIES):
                e._check(wrong, bad)
        e.last_code = 0
        check(f"{ecran.MAX_FAILS} wrong codes from one device: no more codes for it", "Trop de codes faux" in (e._pair(who=bad) or ""))
        check("... but the phone app's « Afficher un code » still shows one", e._pair(app=True) is None and e.code is not None)
        code = e.code["code"]
        ok, why = e._check(code, bad)
        check("... that the locked device cannot even try", not ok and "Trop de codes faux" in why and e.code["tries"] == 0, why)
        check("... and another device pairs with it", e._check(code, good) == (True, ""))
        e.last_code, hub.s["cast"] = 0, None
        check("another device still gets codes from its page", e._pair(who=good) is None)
        check("a device: its IPv4 address, or its IPv6 /64 (a phone has many IPv6 addresses)", ecran.device("::ffff:192.168.1.66") == bad
              and ecran.device("2a01:e0a:1f2:3a40::5") == ecran.device("2a01:e0a:1f2:3a40:aaaa::9") == "2a01:e0a:1f2:3a40::/64")
        k = e.launch_key
        again = ecran.Ecran(Hub({}), {}, APP / "web", tmp, TOKEN)
        check("the launcher's key: random, not the access code, kept in the data folder (delete the file for a new one)",
              len(k) >= 16 and k != TOKEN and again.launch_key == k and (Path(tmp) / "ecran-lanceur.key").read_text().strip() == k)

        class Req:
            def __init__(self, host, secure=False):
                self.host, self.secure = host, secure
        ip = local_ip()
        yes = ["pixel.local:8080", "PIXEL.local:8080", "pixel:8080", "localhost:8080", "127.0.0.1:8080", "[::1]:8080"] + ([f"{ip}:8080"] if ip else [])
        no = ["evil.example:8080", "pixel.evil.example:8080", "pixel.local.evil.example:8080", "localhost:9000", "pixel.local", "8.8.8.8:8080", "[2001:db8::1]:8080", ""]
        check("own_host: Pixel's names and addresses, on its port (and https_port)", all(e.own_host(Req(h)) for h in yes) and e.own_host(Req("pixel.local:8443", True)),
              str([h for h in yes if not e.own_host(Req(h))]))
        check("own_host: another site's name that leads to Pixel (DNS rebinding), another port: refused", not any(e.own_host(Req(h)) for h in no),
              str([h for h in no if e.own_host(Req(h))]))


class Ws:
    """A WebSocket client of /ecran/ws that keeps what it is told."""
    def __init__(self, ws):
        self.ws, self.got = ws, []

    async def send(self, **m):
        await self.ws.send_str(json.dumps(m))

    async def wait(self, typ, seconds=3.0):
        end = time.time() + seconds
        while time.time() < end:
            m = next((x for x in self.got if x.get("type") == typ), None)
            if m:
                self.got.remove(m)
                return m
            try:
                msg = await self.ws.receive(timeout=max(0.01, end - time.time()))
            except asyncio.TimeoutError:
                break
            if msg.type == aiohttp.WSMsgType.TEXT:
                self.got.append(json.loads(msg.data))
            elif msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.CLOSING):
                break
        return None

    async def drain(self, seconds=0.3):
        end = time.time() + seconds
        while time.time() < end:
            try:
                msg = await self.ws.receive(timeout=max(0.01, end - time.time()))
            except asyncio.TimeoutError:
                break
            if msg.type == aiohttp.WSMsgType.TEXT:
                self.got.append(json.loads(msg.data))
            else:
                break
        out, self.got = self.got, []
        return out


async def main(tls):
    base, wsurl = f"http://127.0.0.1:{PORT}", f"ws://127.0.0.1:{PORT}/ecran/ws"
    pixel_origin = {"Origin": base}
    async with aiohttp.ClientSession() as http:
        async with http.ws_connect(f"{base}/ws?t={TOKEN}") as app:
            state = {}

            async def pump(seconds=0.3):
                end = time.time() + seconds
                while (left := end - time.time()) > 0:
                    try:
                        m = await app.receive(timeout=left)
                    except asyncio.TimeoutError:
                        break
                    if m.type == aiohttp.WSMsgType.TEXT:
                        state.update(json.loads(m.data)["data"])

            async def act(action, wait=0.3, **a):
                await app.send_str(json.dumps({"action": action, "args": a}))
                await pump(wait)

            cast = lambda: state.get("cast") or {}       # noqa: E731
            await pump(0.5)
            st = state["settings"].get("ecran", {})
            check("state: the addresses for the phone app (the page, by name and by IP, the launcher)", st.get("page", "").endswith(f":{PORT}/ecran")
                  and st.get("ip_page", "").endswith(f":{PORT}/ecran") and st.get("launcher") == "/ecran/lanceur.html", str(st))
            check("state: AirPlay off by default", state.get("airplay", {}).get("status") == "off" and state["airplay"]["on"] is False, str(state.get("airplay")))

            # ---- who may connect ----
            async with http.get(f"{base}/ecran/lanceur.html") as r:
                lcfg = json.loads((await r.text()).split("window.PIXEL_ECRAN = ", 1)[1].split(";</script>", 1)[0])
            key = parse_qs(urlsplit(lcfg["ws"][1]).query).get("k", [""])[0]
            launcher = f"{wsurl}?k={key}"
            rebind = {"Host": f"evil.example:{PORT}", "Origin": f"http://evil.example:{PORT}"}
            for url, headers, why in ((wsurl, {"Origin": "https://evil.example"}, "another site"), (wsurl, {"Origin": "https://www.youtube-nocookie.com"}, "a video player on the Pi"),
                                      (wsurl, {"Origin": "null"}, "a sandboxed frame of any page (Origin: null, without the launcher's key)"),
                                      (wsurl + "?k=faux", {"Origin": "null"}, "the same, with a wrong key"),
                                      (wsurl, rebind, "another site's name that leads to Pixel (DNS rebinding)"),
                                      (wsurl, {"Host": f"evil.example:{PORT}", "Origin": "null"}, "the same, from a sandboxed frame")):
                try:
                    async with http.ws_connect(url, headers=headers):
                        check(f"/ecran/ws from {why}: refused", False)
                except aiohttp.WSServerHandshakeError as e:
                    check(f"/ecran/ws from {why}: refused (403)", e.status == 403, str(e.status))
            await pump()
            check("... so none of them can put a code on Pixel's screen", not state.get("cast"), str(state.get("cast")))
            async with http.get(f"{base}/ecran/lanceur.html", headers={"Host": f"evil.example:{PORT}"}) as r:
                check("the launcher (its key) is not given to another site's name that leads to Pixel (DNS rebinding)", r.status == 403, str(r.status))

            pc = Ws(await http.ws_connect(launcher, headers={"Origin": "null"}))    # the downloaded page (file://), with its key
            await pc.send(type="offer", sdp="v=0 x")
            m = await pc.wait("error")
            check("from file:// (Origin: null, the launcher's key): connected, but nothing before the code", m and "code" in m["msg"], str(m))
            await pc.send(type="start")
            check("... not even a start", (await pc.wait("error")) is not None and cast().get("kind") != "screen")

            # ---- the one-time code ----
            await pc.send(type="pair")
            m = await pc.wait("code")
            await pump()
            c = cast()
            code = c.get("code", "")
            check("pair: Pixel shows a 6-digit code (the state has it, for the phone app)", m and c.get("kind") == "screen" and c.get("phase") == "code" and len(code) == 6 and code.isdigit(), str(c))
            check("... the computer is told it is there, never the code itself", m and code not in json.dumps(m) and m["until"] > time.time() * 1000, str(m))
            first = c["id"]
            await pc.send(type="pair")
            await pc.wait("code")
            await pump()
            check("pair again: the same code, the same card", cast().get("id") == first and cast().get("code") == code)
            wrong = f"{(int(code) + 1) % 10 ** 6:06d}"
            await pc.send(type="hello", code=wrong, name="PC Windows")
            m = await pc.wait("bad")
            check("a wrong code: refused, 4 tries left", m and m["left"] == 4 and "Encore 4 essais" in m["msg"], str(m))
            await pc.send(type="hello", code=f"{code[:3]} {code[3:]}", name="PC <i>Windows</i>")
            check("the right code (typed with a space): paired", (await pc.wait("ok")) is not None)
            await pump()
            check("Pixel says the computer is connected (a card for a minute)", cast().get("phase") == "paired" and cast().get("until", 0) > time.time() * 1000, str(cast()))

            # ---- a session: Pixel's screen receives ----
            await pc.send(type="start")
            await pump()
            c = cast()
            check("start: Pixel shows 'connecting', with the computer's name and a session", c.get("phase") == "connecting" and c.get("via") == "webrtc" and c.get("session")
                  and c.get("title") == "Écran : PC iWindowsi", str(c))
            ip = local_ip()
            lan = None
            if ip and ip != "127.0.0.1":
                try:
                    lan = Ws(await http.ws_connect(f"ws://{ip}:{PORT}/ecran/ws"))
                except aiohttp.ClientError:
                    lan = None
            if lan:
                await lan.send(type="kiosk", session=c["session"])
                m = await lan.wait("error")
                check("another device cannot be the receiver", m and "Seul l'écran de Pixel" in m["msg"], str(m))
                await lan.ws.close()
            else:
                print("SKIP the receiver from another device: the server only answers on 127.0.0.1 here")
            fake = Ws(await http.ws_connect(launcher, headers={"Origin": "null"}))
            await fake.send(type="kiosk", session=c["session"])
            m = await fake.wait("error")
            check("a page opened from the disk on the Pi cannot be the receiver either", m and "Seul l'écran de Pixel" in m["msg"], str(m))
            await fake.ws.close()
            await pc.drain()
            kiosk = Ws(await http.ws_connect(wsurl, headers=pixel_origin))
            await kiosk.send(type="kiosk", session=c["session"])
            check("Pixel's own screen joins: the computer is told it can send its offer", (await pc.wait("ready")) is not None)
            await pc.send(type="offer", sdp="v=0\r\noffer\r\n", extra="<script>", to="someone")
            m = await kiosk.wait("offer")
            check("the offer is relayed to Pixel's screen, with its sdp only", m == {"type": "offer", "sdp": "v=0\r\noffer\r\n"}, str(m))
            await pc.send(type="offer", sdp="<html>")
            check("an offer that is not an SDP is refused", (await pc.wait("error")) is not None and not await kiosk.wait("offer", 0.3))
            await kiosk.send(type="answer", sdp="v=0\r\nanswer\r\n")
            check("the answer goes back to the computer", (await pc.wait("answer")) == {"type": "answer", "sdp": "v=0\r\nanswer\r\n"})
            await pc.send(type="ice", candidate={"candidate": "candidate:1 1 udp 1 192.168.1.9 5000 typ host", "sdpMid": "0", "sdpMLineIndex": 0, "x": 1})
            m = await kiosk.wait("ice")
            await kiosk.send(type="ice", candidate=None)
            m2 = await pc.wait("ice")
            check("ICE candidates both ways, with their own fields only", m and m["candidate"] == {"candidate": "candidate:1 1 udp 1 192.168.1.9 5000 typ host", "sdpMid": "0", "sdpMLineIndex": 0}
                  and m2 == {"type": "ice", "candidate": None}, f"{m} {m2}")
            await kiosk.send(type="live")
            check("Pixel's screen has the picture: the computer hears it", (await pc.wait("live")) is not None)
            await pump()
            check("... and the state says live", cast().get("phase") == "live", str(cast()))
            await act("ecran.code")
            check("asking for a code while a screen is shared: refused, the share goes on", cast().get("phase") == "live" and "déjà partagé" in state["toast"]["msg"])

            async def again():
                await pc.drain()
                await kiosk.drain()
                await pc.send(type="start")
                await pump(0.2)
                c = cast()
                await kiosk.send(type="kiosk", session=c.get("session"))
                await pc.wait("ready")
                await kiosk.send(type="live")
                await pc.wait("live")
                await pump(0.2)
                return cast().get("phase") == "live"

            # ---- every way it ends ----
            await act("cast.stop")
            m = await pc.wait("stopped")
            check("a touch on Pixel or the phone's Arrêter (cast.stop): the computer is told, Pixel's screen lets go", m and m["why"] == "pixel" and (await kiosk.wait("stop")) is not None
                  and not state.get("cast"), str(m))
            check("the same page shares again without a new code", await again())
            await act("screen.show", screen="meteo")
            check("another screen opened on Pixel: it ends", (await pc.wait("stopped")) is not None and not state.get("cast"))
            await again()
            await act("cast.text", text="À table !")
            check("another cast over it: it ends", (await pc.wait("stopped")) is not None and cast().get("kind") == "text")
            await again()
            await pc.send(type="stop")
            m = await pc.wait("stopped")
            await pump()
            check("stopped from the computer: Pixel goes back", m and m["why"] == "toi" and not state.get("cast") and (await kiosk.wait("stop")) is not None, str(m))
            await again()
            await kiosk.send(type="fail", why="reseau")
            m = await pc.wait("stopped")
            await pump()
            check("Pixel's screen lost the connection: both sides hear why, in French", m and m["why"] == "reseau" and "perdue" in m["msg"] and "perdue" in state["toast"]["msg"], str(m))
            await pc.drain()
            await kiosk.drain()
            await pc.send(type="start")
            m = await pc.wait("stopped", 4)
            await pump()
            check("Pixel's screen does not answer (kiosk_wait): the computer is told", m and m["why"] == "kiosk" and not state.get("cast"), str(m))
            await pc.send(type="start")
            await pump(0.2)
            await kiosk.send(type="kiosk", session=cast().get("session"))
            await pc.wait("ready")
            m = await pc.wait("stopped", 5)
            check("no picture in time (live_wait): it ends, with a hint about the network", m and m["why"] == "reseau" and "réseau" in m["msg"], str(m))
            await again()
            await kiosk.ws.close()
            m = await pc.wait("stopped")
            check("Pixel's screen closed (a reload): the computer is told", m and m["why"] == "kiosk", str(m))
            kiosk = Ws(await http.ws_connect(wsurl, headers=pixel_origin))
            await kiosk.send(type="kiosk", session="ancienne")
            check("a stale session on Pixel's screen: told to stop", (await kiosk.wait("stop")) is not None)
            await again()
            other = Ws(await http.ws_connect(wsurl))
            await other.send(type="hello", t=TOKEN, name="Mac")
            check("with the access code (the app's page): no code to type", (await other.wait("ok")) is not None)
            await other.send(type="start")
            m = await pc.wait("stopped")
            await pump(0.2)
            check("another computer takes over: the first one is told", m and m["why"] == "autre" and cast().get("title") == "Écran : Mac", str(m))
            await other.ws.close()
            await pump(0.3)
            check("the page closed: Pixel goes back to its screen", not state.get("cast"))

            # ---- wrong codes, spacing ----
            bad = Ws(await http.ws_connect(wsurl))
            await asyncio.sleep(ecran.SPACING)
            await bad.send(type="pair")
            await bad.wait("code")
            await pump()
            code = cast().get("code", "")
            wrong = f"{(int(code) + 7) % 10 ** 6:06d}"
            lefts = []
            for _ in range(5):
                await bad.send(type="hello", code=wrong)
                m = await bad.wait("bad")
                lefts.append(m and m["left"])
            await pump()
            check("five wrong codes: that code is thrown away, Pixel's card goes", lefts == [4, 3, 2, 1, 0] and not state.get("cast"), str(lefts))
            await bad.send(type="hello", code=code)
            m = await bad.wait("bad")
            check("... even the right one no longer works", m and "Pas de code" in m["msg"], str(m))
            await bad.send(type="pair")
            m = await bad.wait("error")
            check("a new code right away: wait a few seconds (codes are spaced)", m and "Attends" in m["msg"], str(m))
            await asyncio.sleep(ecran.SPACING)
            await act("cast.text", text="Le dîner est prêt")
            await bad.send(type="pair")
            m = await bad.wait("error")
            check("a page without the access code cannot cover what is cast with a code card", m and "montre déjà" in m["msg"] and cast().get("kind") == "text", str(m))
            await act("ecran.code")
            check("the phone app's « Afficher un code » can: a code on Pixel, in the state", cast().get("phase") == "code" and len(cast().get("code", "")) == 6)
            await act("cast.stop")
            await asyncio.sleep(ecran.SPACING)
            await bad.send(type="pair")
            m = await bad.wait("error")
            check("a code card closed on Pixel: no new one for a page without the access code, for a while", m and "vient d'être fermé" in m["msg"] and not state.get("cast"), str(m))
            await bad.ws.close()
            await kiosk.ws.close()
            await pc.ws.close()

            # ---- the connections: a few without a code per device; Pixel's own screen always connects ----
            waiting = [Ws(await http.ws_connect(launcher, headers={"Origin": "null"})) for _ in range(ecran.PER_DEVICE)]
            try:
                async with http.ws_connect(launcher, headers={"Origin": "null"}):
                    check(f"{ecran.PER_DEVICE} connections without a code from one device: no more", False)
            except aiohttp.WSServerHandshakeError as e:
                check(f"{ecran.PER_DEVICE} connections without a code from one device: no more (503)", e.status == 503, str(e.status))
            async with http.ws_connect(wsurl, headers=pixel_origin) as k2:
                await k2.send_str(json.dumps({"type": "kiosk", "session": "x"}))
                m = json.loads((await k2.receive(timeout=3)).data)
                check("... Pixel's own screen still connects (it is never counted)", m.get("type") == "stop", str(m))
            for w in waiting:
                await w.wait("nothing", IDLE + 3)
            check(f"a connection that never asked for a code is closed soon (idle_wait, {IDLE} s here)", all(w.ws.closed for w in waiting))
            again = Ws(await http.ws_connect(launcher, headers={"Origin": "null"}))
            check("... which frees its place", not again.ws.closed)
            await again.ws.close()

            # ---- Android: ScreenStream ----
            hits = []

            async def trap(reader, writer):
                hits.append(1)
                writer.close()
            srv = await asyncio.start_server(trap, "0.0.0.0", TRAP)
            async with http.post(f"{base}/ecran/telephone", json={"port": TRAP}, headers={"X-Pixel-Token": TOKEN}) as r:
                j = await r.json()
                check("from the Pi itself: it says to use the phone", r.status == 400 and "depuis le téléphone" in j["error"], str(j))
            if ip and ip != "127.0.0.1":
                lanbase = f"http://{ip}:{PORT}"
                async with http.post(f"{lanbase}/ecran/telephone", json={"port": TRAP}) as r:
                    check("POST /ecran/telephone from a phone without the access code: 403", r.status == 403, str(r.status))
                async with http.post(f"{lanbase}/ecran/telephone", json={"port": TRAP}, headers={"X-Pixel-Token": TOKEN}) as r:
                    j = await r.json()
                    await pump()
                    c = cast()
                    check("from the phone: its own address, ScreenStream's path", j.get("ok") and j["src"] == f"http://{ip}:{TRAP}/stream.mjpeg" and c.get("via") == "mjpeg"
                          and c.get("src") == j["src"] and c.get("kind") == "screen", f"{j} {c}")
                async with http.post(f"{lanbase}/ecran/telephone", json={"address": "192.168.1.23:8081"}, headers={"X-Pixel-Token": TOKEN}) as r:
                    j = await r.json()
                    check("the address ScreenStream shows, typed: used as it is", j.get("ok") and j["src"] == "http://192.168.1.23:8081/stream.mjpeg", str(j))
                for body in ({"address": "example.com"}, {"address": "127.0.0.1:8080"}, {"port": 0}, {"port": 70000}, {"port": "abc"}, {"address": "8.8.8.8:8080"}):
                    async with http.post(f"{lanbase}/ecran/telephone", json=body, headers={"X-Pixel-Token": TOKEN}) as r:
                        if r.status != 400 or (await r.json()).get("ok"):
                            check(f"refused: {body}", False, str(r.status))
                check("a name, the Pi, a bad port, a public address: refused (400, in French)", True)
                await pump()
                await act("ecran.fail", id=cast().get("id"), why="mjpeg")
                check("Pixel's screen cannot find ScreenStream: a clear message, back to its screen", not state.get("cast") and "ScreenStream" in state["toast"]["msg"])
            else:
                print("SKIP ScreenStream from the phone: no network address here")
            await asyncio.sleep(0.3)
            srv.close()
            check("the server never connected to the phone (Pixel's screen loads the stream itself)", not hits, str(len(hits)))

            # ---- the pages, the launcher, https ----
            async with http.get(f"{base}/ecran") as r:
                page = await r.text()
                check("GET /ecran: the sender page with Pixel's addresses, not as a file", r.status == 200 and "window.PIXEL_ECRAN = {" in page and '"file": true' not in page
                      and TOKEN not in page)
            async with http.get(f"{base}/ecran/lanceur.html") as r:
                page = await r.text()
                cfg = json.loads(page.split("window.PIXEL_ECRAN = ", 1)[1].split(";</script>", 1)[0])
                check("the launcher: a download (Pixel-ecran.html), Pixel's WebSocket by name then by IP, with its key, not the access code",
                      'attachment; filename="Pixel-ecran.html"' == r.headers.get("Content-Disposition") and cfg["file"] is True
                      and cfg["ws"][0].endswith(f".local:{PORT}/ecran/ws?k={key}") and cfg["ws"][1].endswith(f":{PORT}/ecran/ws?k={key}")
                      and len(key) >= 16 and TOKEN not in page, str(cfg))
            if tls:
                async with http.get(f"https://127.0.0.1:{HTTPS}/ecran", ssl=False) as r:
                    check(f"https on {HTTPS} (the certificate install.sh makes): the same page", r.status == 200 and "Partager mon écran" in await r.text())
                async with http.ws_connect(f"wss://127.0.0.1:{HTTPS}/ecran/ws", ssl=False) as w:
                    await w.send_str(json.dumps({"type": "hello", "t": TOKEN}))
                    m = json.loads((await w.receive(timeout=3)).data)
                    check("... and its signalling (wss://)", m.get("type") == "ok", str(m))
                check("the phone app gets the https address", state["settings"]["ecran"]["https"].endswith(f":{HTTPS}/ecran"), str(state["settings"]["ecran"]))
            else:
                print("SKIP https: no openssl here")


if __name__ == "__main__":
    pieces()
    lockout()
    with tempfile.TemporaryDirectory() as tmp:
        tls = make_cert(tmp)
        srv = start_server(tmp, tls)
        try:
            asyncio.run(main(tls))
        finally:
            srv.terminate()
            srv.wait()
    print("\n%d failure(s)" % len(fails))
    sys.exit(1 if fails else 0)
