"""Casting to Pixel's screen (pixel/cast.py): a demo server driven like the phone and the share sheet drive it, and its pieces.

    python3 tests/test_cast.py          # starts its own demo server (port 8104, temporary data folder, a 1 Mo limit, 3 files kept)
    CAST_PY_PORT=8105 python3 tests/test_cast.py     # another port for it

- what a file is comes from its first bytes (PNG, JPEG, GIF, WebP, MP4, WebM), never from its name; anything else is refused;
- the upload goes to disk as it arrives, under a random name, and stops at the size limit; no path from the phone is used;
- links are sorted by their address alone (the server never fetches them); the state's "cast" field, its end, cast.stop,
  cast.again, cast.colors, cast.end; opening a screen ends it; the typed commands; the share sheet's /share and its 303;
- the access rule: the Pi itself, or the access code (?t=, header, cookie); a page of another site shown on the Pi is refused,
  and so is a sandboxed frame (Origin: null) and another site's name that leads to the Pi (DNS rebinding: its Host).
"""
import asyncio
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import aiohttp

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
from pixel import cast  # noqa: E402
from pixel.system import local_ip  # noqa: E402

PORT = int(os.environ.get("CAST_PY_PORT") or 8104)   # CAST_PY_PORT=… for another
fails = []
PNG = b"\x89PNG\r\n\x1a\n" + b"\0\0\0\rIHDR" + bytes(200)
JPG = b"\xff\xd8\xff\xe0\0\x10JFIF\0" + bytes(200)
GIF = b"GIF89a\x10\0\x10\0" + bytes(200)
WEBP = b"RIFF\xc8\0\0\0WEBPVP8 " + bytes(200)
WEBP_ANIM = b"RIFF\xc8\0\0\0WEBPVP8X\x0a\0\0\0\x12\0\0\0" + bytes(200)
WEBM = b"\x1a\x45\xdf\xa3\x9f\x42\x86\x81\x01\x42\xf7\x81\x01\x42\xf2\x81\x04\x42\xf3\x81\x08\x42\x82\x84webm" + bytes(200)
MP4 = b"\0\0\0\x18ftypisom\0\0\x02\0isomiso2" + bytes(200)
MOV = b"\0\0\0\x14ftypqt  \0\0\x02\0qt  " + bytes(200)
HEIC = b"\0\0\0\x18ftypheic\0\0\0\0mif1heic" + bytes(200)
MKV = b"\x1a\x45\xdf\xa3\x9f\x42\x86\x81\x01\x42\xf7\x81\x01\x42\xf2\x81\x04\x42\xf3\x81\x08\x42\x82\x88matroska" + bytes(200)
HTML = b"<!doctype html><script>alert(1)</script>" + bytes(200)


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


def start_server(port, datadir):
    try:
        socket.create_connection(("127.0.0.1", port), 0.2).close()
        raise SystemExit(f"le port {port} est déjà pris : arrête ce serveur, ou change de port (CAST_PY_PORT=…)")
    except OSError:
        pass
    cfg = Path(datadir) / "config.toml"
    cfg.write_text(f'data_dir = "{datadir}"\n[security]\ntoken = "le-code-de-test"\n[cast]\nmax_mb = 1\nkeep = 3\nseconds = 2\n')
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


def pieces():
    """sniff, classify, clean_url, has_access: on their own."""
    want = {PNG: ("png", "image"), JPG: ("jpg", "image"), GIF: ("gif", "gif"), WEBP: ("webp", "image"), WEBP_ANIM: ("webp", "gif"),
            WEBM: ("webm", "video"), MP4: ("mp4", "video"), MOV: ("mp4", "video")}
    got = {k: cast.sniff(k[:64]) for k in want}
    check("sniff: PNG, JPEG, GIF, WebP (still and animated), WebM, MP4 and an iPhone's .mov, from their first bytes", got == want, str(got))
    check("sniff: HEIC, Matroska, HTML, a text, an empty file are refused", all(cast.sniff(b[:64]) is None for b in (HEIC, MKV, HTML, b"bonjour", b"")))
    c = cast.classify
    yt = c("https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=1m30s")
    check("classify: a YouTube link plays in YouTube's player (no cookies), from where it was shared", yt["kind"] == "link" and yt["embed"].startswith(
        "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?autoplay=1") and "start=90" in yt["embed"], str(yt))
    check("classify: youtu.be, shorts, m.youtube.com, Vimeo", c("https://youtu.be/aqz-KE-bpKQ")["embed"].endswith("enablejsapi=1")
          and "embed/aqz-KE-bpKQ" in c("https://www.youtube.com/shorts/aqz-KE-bpKQ")["embed"] and "embed" in c("https://m.youtube.com/watch?v=aqz-KE-bpKQ")
          and c("https://vimeo.com/76979871")["embed"] == "https://player.vimeo.com/video/76979871?autoplay=1")
    check("classify: a picture, a GIF, a video by their address; anything else is a page", [c(u)["kind"] for u in (
        "https://ex.org/a.JPG?x=1", "https://ex.org/b.gif", "https://ex.org/c.mp4", "https://ex.org/page", "https://youtube.com/watch?v=court")]
          == ["image", "gif", "video", "link", "link"] and "embed" not in c("https://youtube.com/watch?v=court"))
    bad = ["javascript:alert(1)", "data:text/html,x", "ftp://ex.org/a.png", "http://moi:secret@box.local/", "https://ex.org/a b", "file:///etc/passwd", "", "x" * 3000]
    check("clean_url: http and https only, no password, no spaces", all(cast.clean_url(u) is None for u in bad) and cast.clean_url(" https://ex.org/a ") == "https://ex.org/a")
    check("first_url: the link in a shared text", cast.first_url("Regarde ça : https://youtu.be/aqz-KE-bpKQ.") == "https://youtu.be/aqz-KE-bpKQ")

    class Sock:                                     # the server's end of the connection: the port the request came in on
        def __init__(self, port):
            self.port = port

        def get_extra_info(self, k):
            return ("127.0.0.1", self.port) if k == "sockname" else None

    class Req:
        def __init__(self, remote, query=None, headers=None, cookies=None, host="pixel.local:8080", port=8080):
            self.remote, self.query, self.headers, self.cookies, self.host = remote, query or {}, headers or {}, cookies or {}, host
            self.transport = Sock(port)
    T = "le-code"
    ts, fwd = "pixel.tail1.ts.net", {"X-Forwarded-For": "100.101.102.103"}       # tailscale serve: from 127.0.0.1, for another device
    yes = [Req("127.0.0.1", host="localhost:8080"), Req("::1", host="[::1]:8080"), Req("127.0.0.1", headers={"Origin": "http://localhost:8080"}, host="localhost:8080"),
           Req("127.0.0.1", headers={"Origin": "http://127.0.0.1:8080"}, host="127.0.0.1:8080"),
           Req("127.0.0.1", headers={"Origin": "http://127.0.0.1:8104"}, host="127.0.0.1:8104", port=8104), Req("::1", headers={"Origin": "http://[::1]:8080"}, host="[::1]:8080"), Req("::1", headers={"Origin": "https://[::1]:8443"}, host="[::1]:8443", port=8443),
           Req("192.168.1.9", query={"t": T}), Req("192.168.1.9", headers={"X-Pixel-Token": T}), Req("192.168.1.9", cookies={"pixel_t": T}),
           Req("127.0.0.1", headers={"Origin": "https://www.youtube-nocookie.com"}, query={"t": T}),
           Req("127.0.0.1", headers={**fwd, "Origin": "https://" + ts}, host=ts, cookies={"pixel_t": T})]
    no = [Req("192.168.1.9"), Req("192.168.1.9", query={"t": "faux"}), Req("192.168.1.9", headers={"X-Pixel-Token": "le-cod"}),
          Req("127.0.0.1", headers={"Origin": "https://www.youtube-nocookie.com"}, host="localhost:8080"), Req("127.0.0.1", headers={"Origin": "https://evil.example"}),
          Req("127.0.0.1", headers={"Origin": "null"}, host="localhost:8080"), Req("::1", headers={"Origin": "null"}, host="[::1]:8080"), Req("127.0.0.1", headers={"Origin": "http://evil:8080"}, host="evil:8080"),
          Req("127.0.0.1", headers=fwd, host=ts), Req("127.0.0.1", headers={**fwd, "Origin": "https://" + ts}, host=ts), Req("127.0.0.1", host=ts), Req("127.0.0.1", headers={"Origin": "http://localhost:9999"}, host="localhost:9999"),
          Req("127.0.0.1", headers=fwd, host="localhost:8080"), Req("127.0.0.1", headers={"Forwarded": "for=100.101.102.103"}, host="localhost:8080"),
          Req("127.0.0.1", headers={"X-Forwarded-Host": ts}, host="localhost:8080"), Req("127.0.0.1", headers={"Tailscale-User-Login": "a@b.c"}, host="localhost:8080"),
          Req("127.0.0.1", headers={"Origin": "http://evil.example:8080"}, host="evil.example:8080"), Req("127.0.0.1", host="evil.example:8080"),
          Req("127.0.0.1", headers={"Origin": "http://localhost:9000"}, host="localhost:8080"), Req("127.0.0.1", headers={"Origin": "http://localhost:8080"}, host="pixel.local:8080"),
          Req("127.0.0.1"), Req("127.0.0.1", host="[::1")]
    check("access: the Pi from Pixel's page, or the code (?t=, header, cookie)", all(cast.has_access(r, T) for r in yes), str([r.__dict__ for r in yes if not cast.has_access(r, T)]))
    check("access: no code, a wrong code, another site's page on the Pi (a video player, a frame of it: Origin null), a proxy on the Pi "
          "(tailscale serve), another name for the Pi (DNS rebinding), another port: refused", not any(cast.has_access(r, T) for r in no),
          str([r.__dict__ for r in no if cast.has_access(r, T)]))
    example = (APP / "config.example.toml").read_text()
    check("config.example.toml: the [cast] settings", "[cast]" in example and "max_mb" in example and "seconds" in example)


async def main(datadir):
    d = Path(datadir) / "cast"
    base = f"http://127.0.0.1:{PORT}"
    async with aiohttp.ClientSession() as http:
        async with http.ws_connect(f"{base}/ws") as ws:
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

            async def up(data, name="photo.png", ctype="image/png", fields=None, url="/api/cast", headers=None, **kw):
                form = aiohttp.FormData(default_to_multipart=True)    # like the share sheet, even without a file
                for k, v in (fields or {}).items():
                    form.add_field(k, v)
                if data is not None:
                    form.add_field("file" if url == "/api/cast" else "media", data, filename=name, content_type=ctype)
                async with http.post(base + url, data=form, headers=headers or {}, allow_redirects=False, **kw) as r:
                    body = await r.json() if r.content_type == "application/json" else await r.text()
                    await pump(0.25)
                    return r.status, body, r.headers.get("Location")

            async def js(body, headers=None):
                async with http.post(base + "/api/cast", json=body, headers=headers or {}) as r:
                    out = r.status, await r.json()
                await pump(0.25)
                return out

            files = lambda: sorted(f.name for f in d.iterdir() if cast.NAME.match(f.name))       # noqa: E731
            stray = lambda: [f.name for f in d.iterdir() if f.name.startswith(".up-")]          # noqa: E731

            await pump(0.5)
            check("state: no cast yet, the list of the last ones, the limits for the phone", state.get("cast") is None and state.get("cast_recent") == []
                  and state["settings"].get("cast") == {"max_mb": 1.0, "seconds": 2}, str(state["settings"].get("cast")))

            # ---- every type that is accepted, and what is kept ----
            for data, name, kind, ext in [(PNG, "a.png", "image", "png"), (JPG, "IMG_2041.JPG", "image", "jpg"), (GIF, "chat.gif", "gif", "gif"),
                                          (WEBP_ANIM, "x.webp", "gif", "webp"), (WEBM, "clip.webm", "video", "webm"), (MP4, "VID.mp4", "video", "mp4"),
                                          (MOV, "IMG_0001.MOV", "video", "mp4")]:
                st, body, _ = await up(data, name, "application/octet-stream")
                c = state.get("cast") or {}
                ok = st == 200 and body["ok"] and c.get("kind") == kind and c.get("src", "").endswith("." + ext) and cast.NAME.match(c["src"][6:])
                check(f"upload {name}: shows as {kind}, under a random name", ok and name not in c["src"], f"{st} {body} {c.get('src')}")
            c = state["cast"]
            check("the cast field: id, kind, src, title, t0, until, raw", all(k in c for k in ("id", "kind", "src", "title", "t0", "until", "raw")) and c["until"] == 0, str(c))
            check("only the last 3 files stay (keep = 3)", len(files()) == 3 and not stray(), str(files()))
            check("the list of the last ones forgets the files that are gone", len(state["cast_recent"]) == 3
                  and all((d / e["src"][6:]).is_file() for e in state["cast_recent"] if e.get("src", "").startswith("/cast/")), str(state["cast_recent"]))
            name = c["src"][6:]
            async with http.get(f"{base}/cast/{name}") as r:
                got = await r.read()
                check("GET /cast/NAME: the same bytes, its real type, no sniffing by the browser", r.status == 200 and got == MOV and r.headers["Content-Type"] == "video/mp4"
                      and r.headers.get("X-Content-Type-Options") == "nosniff", f"{r.status} {r.headers.get('Content-Type')}")
            async with http.get(f"{base}/cast/{name}", headers={"Range": "bytes=0-9"}) as r:
                check("GET /cast/NAME answers a range (a video can seek)", r.status == 206 and await r.read() == MOV[:10], str(r.status))

            # ---- what is refused ----
            before = files()
            for data, name, why in [(HTML, "photo.png", "HTML named .png"), (HEIC, "IMG.HEIC", "HEIC"), (MKV, "film.mkv", "Matroska"), (b"bonjour", "a.txt", "a text")]:
                st, body, _ = await up(data, name, "image/png")
                check(f"refused: {why} (415, in French)", st == 415 and not body["ok"] and "Format non pris en charge" in body["error"], f"{st} {body}")
            st, body, _ = await up(b"", "vide.png")
            check("refused: an empty file", st == 400 and not body["ok"], f"{st} {body}")
            check("nothing refused was kept", files() == before and not stray(), str(files()))

            # ---- the size limit (1 Mo here) ----
            big = PNG + bytes(1024 * 1024)
            st, body, _ = await up(big, "grosse.png")
            check("too big: 413, with the limit in French", st == 413 and "1 Mo au plus" in body["error"], f"{st} {body}")

            async def chunks():                              # no Content-Length: the limit stops it while it arrives
                yield b"--XYZ\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.png\"\r\nContent-Type: image/png\r\n\r\n" + PNG
                for _ in range(24):
                    yield bytes(64 * 1024)
                yield b"\r\n--XYZ--\r\n"
            try:
                async with http.post(base + "/api/cast", data=chunks(), headers={"Content-Type": "multipart/form-data; boundary=XYZ"}) as r:
                    status = r.status
            except aiohttp.ClientError:
                status = "coupé"
            await asyncio.sleep(0.3)
            check("too big, sent without its size (chunked): stopped at the limit", status in (413, "coupé"), str(status))
            check("nothing too big was kept, no piece left behind", files() == before and not stray(), f"{files()} {stray()}")

            # ---- no path from the phone ----
            st, body, _ = await up(PNG, "../../../evil.png")
            check("a file name with ../ only gives a random name in cast/", st == 200 and not (Path(datadir) / "evil.png").exists()
                  and not (APP / "evil.png").exists() and cast.NAME.match(state["cast"]["src"][6:]) and "evil" not in state["cast"]["src"])
            (Path(datadir) / "secret.png").write_bytes(PNG)
            for path in ("/cast/..%2Fsecret.png", "/cast/..%2F..%2Fconfig.toml", "/cast/%2e%2e/token", "/cast/recent.json", "/cast/AAAAAAAAAAAAAAAA.txt",
                         "/cast/AAAAAAAAAAAAAAAA.png", "/cast/.up-0123456789abcdef"):
                async with http.get(base + path) as r:
                    if r.status != 404:
                        check(f"GET {path} is refused", False, str(r.status))
            check("GET /cast/: only the names Pixel made, inside cast/ (../, other files, other extensions: 404)", True)

            # ---- texts and links: from JSON; the server never fetches a link ----
            hits = []

            async def trap(reader, writer):
                hits.append(1)
                writer.close()
            srv = await asyncio.start_server(trap, "127.0.0.1", 0)
            tp = srv.sockets[0].getsockname()[1]
            st, body = await js({"text": "  À   table !\n\n Le dîner est prêt. "})
            check("JSON {text}: a text, tidied up", st == 200 and state["cast"]["kind"] == "text" and state["cast"]["text"] == "À table !\nLe dîner est prêt."
                  and state["cast"]["until"] > state["cast"]["t0"], str(state["cast"]))
            st, body = await js({"text": "x" * 500})
            check("a long text is cut at 280 characters", len(state["cast"]["text"]) == 280 and state["cast"]["text"].endswith("…"))
            st, body = await js({"url": "https://youtu.be/aqz-KE-bpKQ"})
            c = state["cast"]
            check("JSON {url}: YouTube, with its player address, until it ends", c["kind"] == "link" and c["embed"].startswith("https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ")
                  and c["until"] == 0 and c["title"] == "Vidéo YouTube", str(c))
            st, body = await js({"url": f"http://127.0.0.1:{tp}/une-page", "title": "Ma page"})
            c = state["cast"]
            check("a page: a card with its title, its site and a QR code of the link", c["kind"] == "link" and c["title"] == "Ma page" and c["site"] == "127.0.0.1"
                  and isinstance(c.get("qr"), list) and len(c["qr"]) >= 21 and "embed" not in c, str(c)[:200])
            st, body = await js({"url": f"http://127.0.0.1:{tp}/chat.png"})
            check("a picture link: shown like an upload, loaded by the screen's browser", state["cast"]["kind"] == "image" and state["cast"]["src"] == f"http://127.0.0.1:{tp}/chat.png")
            await asyncio.sleep(0.5)
            srv.close()
            check("the server never fetched any of those links (no SSRF on the home network)", not hits, str(len(hits)))
            for u in ("javascript:alert(1)", "file:///etc/passwd", "http://moi:secret@box.local/"):
                st, body = await js({"url": u})
                if st != 400 or "adresse web" not in body["error"]:
                    check(f"refused link {u}", False, f"{st} {body}")
            st, body = await js({})
            check("refused links (javascript:, file:, a password) and an empty request say why", st == 400 and "Rien à afficher" in body["error"], str(body))

            # ---- the cast's life: until, stop, colours, again, end, a screen ----
            await js({"text": "Deux secondes"})
            await pump(3.2)
            check("a text goes away by itself after [cast] seconds (2 s here)", state["cast"] is None, str(state["cast"]))
            await up(PNG, "p.png", fields={"raw": "1", "seconds": "0"})
            c = state["cast"]
            check("a photo with 'couleurs d'origine' and 'jusqu'à Arrêter'", c["raw"] is True and c["until"] == 0, str(c))
            await act("cast.colors")
            check("cast.colors switches to the tube's green", state["cast"]["raw"] is False)
            await act("cast.end", id="pas-le-bon")
            check("cast.end of another cast changes nothing", state["cast"] and state["cast"]["id"] == c["id"])
            await act("cast.stop")
            check("cast.stop", state["cast"] is None)
            e = next(x for x in state["cast_recent"] if x["kind"] == "image")
            await act("cast.again", id=e["id"])
            check("cast.again shows one of the last ones again, with a new id", state["cast"] and state["cast"]["src"] == e["src"] and state["cast"]["id"] != c["id"]
                  and state["cast_recent"][0]["id"] == e["id"], str(state["cast"]))
            await act("cast.again", id="disparu")
            check("cast.again of one that is gone says so", "plus sur Pixel" in state["toast"]["msg"])
            await up(WEBM, "v.webm")
            vid = state["cast"]["id"]
            await act("cast.end", id=vid, error="video")
            check("cast.end from Pixel's screen: the video is over (and why it failed)", state["cast"] is None and "lire cette vidéo" in state["toast"]["msg"])
            await js({"text": "Coucou"})
            await act("screen.show", screen="agenda")
            check("opening a screen (a Stream Deck key, a swipe) ends the cast", state["cast"] is None and state["screen"] == "agenda")
            await act("cast.text", text="Depuis le WebSocket")
            check("cast.text and cast.link work as actions too", state["cast"]["text"] == "Depuis le WebSocket")
            await act("cast.link", url="pas un lien")
            check("a bad link sent as an action: a toast in French", "adresse web" in state["toast"]["msg"])

            # ---- the typed commands ----
            await act("cmd", text="caste Le bus passe dans 5 min")
            check("'caste <texte>' shows a text", state["cast"]["kind"] == "text" and state["cast"]["text"] == "Le bus passe dans 5 min")
            await act("cmd", text="caste https://youtu.be/aqz-KE-bpKQ")
            check("'caste <lien>' shows the link", state["cast"]["kind"] == "link" and "embed" in state["cast"])
            await act("timer.start", minutes=5)
            await act("cmd", text="stop")
            check("'stop' ends the cast first (the timer keeps going)", state["cast"] is None and state["timer"]["running"])
            await act("cmd", text="stop")
            check("then 'stop' is the timer's again", not state["timer"]["running"])
            await act("cmd", text="caste bonjour")
            await act("cmd", text="stop cast")
            check("'stop cast'", state["cast"] is None)

            # ---- the share sheet (/share), then 303 back to the app ----
            st, body, loc = await up(None, fields={"title": "Une vidéo", "text": "Regarde ça https://youtu.be/aqz-KE-bpKQ"}, url="/share")
            check("/share with a link in the text: 303 to /?cast=ok, the link shows with its title", st == 303 and loc == "/?cast=ok" and state["cast"]["kind"] == "link"
                  and state["cast"]["title"] == "Une vidéo", f"{st} {loc} {state['cast']}")
            st, body, loc = await up(JPG, "IMG.jpg", "image/jpeg", fields={"title": "", "text": "", "url": ""}, url="/share")
            check("/share with a photo (field media)", st == 303 and loc == "/?cast=ok" and state["cast"]["kind"] == "image", f"{st} {loc}")
            st, body, loc = await up(HTML, "x.png", url="/share")
            check("/share with a file that is not a photo: back with ?cast=format", st == 303 and loc == "/?cast=format", f"{st} {loc}")
            st, body, loc = await up(None, fields={"text": "   "}, url="/share")
            check("/share with nothing: back with ?cast=vide", st == 303 and loc == "/?cast=vide", f"{st} {loc}")
            async with http.post(base + "/api/cast", data={"text": "Depuis un Raccourci"}) as r:     # a plain form (urlencoded)
                await pump(0.25)
                check("a plain form (an iOS Shortcut's 'Formulaire') works too", r.status == 200 and state["cast"]["text"] == "Depuis un Raccourci", str(r.status))
            st, body, loc = await up(PNG, "a.png", url="/share", headers={"Origin": "https://evil.example"})
            check("/share from another site's page on the Pi: no access", st == 303 and loc == "/?cast=acces", f"{st} {loc}")
            st, body, _ = await up(PNG, "a.png", headers={"Origin": "https://www.youtube-nocookie.com"})
            check("/api/cast from a video player shown on the Pi: 403", st == 403, str(st))
            for why, hd in (("another site's page on the Pi", {"Origin": "https://www.youtube-nocookie.com"}),
                            ("a frame of it (Origin null)", {"Origin": "null"}),
                            ("tailscale serve (a proxy on the Pi)", {"Host": "pixel.tail1.ts.net", "X-Forwarded-For": "100.101.102.103"}),
                            ("tailscale serve, a browser", {"Host": "pixel.tail1.ts.net", "Origin": "https://pixel.tail1.ts.net", "X-Forwarded-For": "100.101.102.103"}),
                            ("a DNS rebinding page, its Origin its own Host", {"Origin": f"http://evil:{PORT}", "Host": f"evil:{PORT}"})):
                try:
                    async with http.ws_connect(f"{base}/ws", headers=hd):
                        check(f"the WebSocket from {why} is refused", False)
                except aiohttp.WSServerHandshakeError as e:
                    check(f"the WebSocket from {why} is refused (403)", e.status == 403, str(e.status))
            st, body, _ = await up(PNG, "a.png", headers={"Origin": "null"})
            check("/api/cast from a frame with Origin null on the Pi: 403", st == 403, str(st))
            st, body, _ = await up(PNG, "a.png", headers={"Host": "pixel.tail1.ts.net", "X-Forwarded-For": "100.101.102.103"})
            check("/api/cast through tailscale serve without the code: 403", st == 403, str(st))
            rebind = {"Host": f"evil.example:{PORT}", "Origin": f"http://evil.example:{PORT}"}
            for hdrs, why in (({"Origin": "null"}, "a sandboxed frame of a page on the Pi (Origin: null)"),
                              (rebind, "another site's name that leads to the Pi (DNS rebinding)")):
                try:
                    async with http.ws_connect(f"{base}/ws", headers=hdrs):
                        check(f"the WebSocket from {why}, without the code: refused", False)
                except aiohttp.WSServerHandshakeError as e:
                    check(f"the WebSocket from {why}, without the code: refused (403)", e.status == 403, str(e.status))
                st, body = await js({"text": "piège"}, headers=hdrs)
                check(f"/api/cast from {why}: 403, nothing shows", st == 403 and (state.get("cast") or {}).get("text") != "piège", str(st))
            async with http.ws_connect(f"{base}/ws", headers={"Origin": base}) as w2:
                m = await w2.receive(timeout=2)
                check("the WebSocket from Pixel's own page on the Pi still works", json.loads(m.data)["type"] == "state")
            async with http.ws_connect(f"{base}/ws?t=le-code-de-test", headers={"Origin": "https://www.youtube-nocookie.com"}) as w3:
                m = await w3.receive(timeout=2)
                check("... and with the access code, from anywhere", json.loads(m.data)["type"] == "state")

        # ---- from another device of the house: the access code, like the WebSocket ----
        ip = local_ip()
        if ip:
            lan = f"http://{ip}:{PORT}"
            try:
                async with http.post(lan + "/api/cast", json={"text": "sans code"}) as r:
                    check("from the LAN without the code: 403, in French", r.status == 403 and "Code d'accès" in (await r.json())["error"], str(r.status))
                async with http.post(lan + "/api/cast", json={"text": "faux"}, headers={"X-Pixel-Token": "faux"}) as r:
                    check("from the LAN with a wrong code: 403", r.status == 403)
                async with http.post(lan + "/api/cast", json={"text": "avec le code"}, headers={"X-Pixel-Token": "le-code-de-test"}) as r:
                    check("from the LAN with the code (header): OK", r.status == 200 and (await r.json())["ok"])
                async with http.post(lan + "/api/cast?t=le-code-de-test", json={"text": "iOS"}) as r:
                    check("from the LAN with ?t= (an iOS Shortcut): OK", r.status == 200)
                name = next(f for f in files())
                async with http.get(f"{lan}/cast/{name}") as r:
                    check("GET /cast/NAME from the LAN without the code: 403", r.status == 403, str(r.status))
                async with http.get(f"{lan}/cast/{name}", cookies={"pixel_t": "le-code-de-test"}) as r:
                    check("GET /cast/NAME from the LAN with the app's cookie: OK", r.status == 200, str(r.status))
                form = aiohttp.FormData()
                form.add_field("text", "partagé")
                async with http.post(lan + "/share", data=form, allow_redirects=False) as r:
                    check("/share from the LAN without the code: back with ?cast=acces", r.status == 303 and r.headers["Location"] == "/?cast=acces")
                form = aiohttp.FormData()
                form.add_field("text", "partagé")
                async with http.post(lan + "/share", data=form, allow_redirects=False, headers={"X-Pixel-Token": "le-code-de-test"}) as r:
                    check("/share from the LAN with the code (the service worker adds it): ?cast=ok", r.status == 303 and r.headers["Location"] == "/?cast=ok")
            except aiohttp.ClientConnectorError:
                print("SKIP LAN checks: the server only listens on 127.0.0.1")


async def after_restart(recent):
    async with aiohttp.ClientSession() as http:
        async with http.ws_connect(f"http://127.0.0.1:{PORT}/ws") as ws:
            s = json.loads((await ws.receive(timeout=3)).data)["data"]
            check("after a restart: no cast on the screen, the last ones are still there", s["cast"] is None and [x["id"] for x in s["cast_recent"]] == recent and recent,
                  f"{[x['id'] for x in s['cast_recent']]} {recent}")


if __name__ == "__main__":
    pieces()
    with tempfile.TemporaryDirectory() as tmp:
        srv = start_server(PORT, tmp)
        try:
            asyncio.run(main(tmp))
        finally:
            srv.terminate()
            srv.wait()
        recent = [x["id"] for x in json.loads((Path(tmp) / "cast" / "recent.json").read_text())]
        srv = start_server(PORT, tmp)
        try:
            asyncio.run(after_restart(recent))
        finally:
            srv.terminate()
            srv.wait()
    print("\n%d failure(s)" % len(fails))
    sys.exit(1 if fails else 0)
