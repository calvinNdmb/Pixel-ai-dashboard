"""AirPlay with UxPlay (pixel/airplay.py), without UxPlay and without an iPhone:  python3 tests/test_airplay.py

- the parser and its state, on the log sample tests/uxplay-sample.log (a probe connection, the PIN, a connection request,
  mirroring, a YouTube video by -hls, connections closed, a client lost);
- the process manager, with a fake uxplay (a small script that writes what the test gives it): it waits for the desktop's
  Wayland socket, starts UxPlay with the right options and environment, puts Pixel into cast mode (the PIN, connecting,
  live) and back; a cast stopped on Pixel restarts UxPlay to send the iPhone away; it starts again after a crash, says
  why when it stops at once, says when UxPlay is missing, and stops it with the server; off, it does nothing.
"""
import asyncio
import json
import os
import sys
import tempfile
import time
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
from pixel import airplay  # noqa: E402
from pixel.state import Hub  # noqa: E402

fails = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


def sample():
    st, lines, seen, want = airplay.UxState(), (Path(__file__).parent / "uxplay-sample.log").read_text().splitlines(), [], []
    for ln in lines:
        if ln.startswith("#"):
            continue
        if ln.startswith("= "):
            want.append(ln[2:])
            seen.append(st.phase + (" " + st.pin if st.phase == "pin" else " " + st.client if st.phase in ("connecting", "live") else ""))
            continue
        st.feed(ln)
    check("the log sample: probe, PIN, connection request, mirroring, a YouTube video, connections closed, a client lost", seen == want,
          str([(w, s) for w, s in zip(want, seen) if w != s]))
    p = airplay.parse
    check("parse: the PIN, the name and model of the device", p('*** CLIENT MUST NOW ENTER PIN = "0042" AS AIRPLAY PASSWORD') == ("pin", ("0042",))
          and p("connection request from Léa's MacBook Air (Mac14,2) with deviceID = AA:BB:CC:DD:EE:FF") == ("connect", ("Léa's MacBook Air", "Mac14,2", "AA:BB:CC:DD:EE:FF")))
    check("parse: the other lines are nothing", all(p(x) is None for x in ("", "begin video stream wxh = 1170x2532", "raop_rtp starting audio", "random text")))
    st = airplay.UxState()
    changed = [st.feed(x) for x in ("Accepted IPv4 client on socket 9", "Connection closed on socket 9")]
    check("a probe (the iPhone's AirPlay menu opening) changes nothing", changed == [False, False] and st.phase == "idle")


FAKE = r'''#!/usr/bin/env python3
# a fake uxplay: says it started, then writes whatever the test appends to say.txt; crash: exits at once
import json, os, sys, time
d = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(d, "runs.txt"), "a") as f:
    f.write(json.dumps({"argv": sys.argv[1:], "wayland": os.environ.get("WAYLAND_DISPLAY"), "runtime": os.environ.get("XDG_RUNTIME_DIR"), "pid": os.getpid()}) + "\n")
if os.path.exists(os.path.join(d, "crash")):
    print("ERROR: unknown option -nohold", flush=True)
    sys.exit(1)
print("UxPlay 1.73.7: An Open-Source AirPlay mirroring and audio-streaming server.", flush=True)
ctl = os.path.join(d, "say.txt")
pos = os.path.getsize(ctl) if os.path.exists(ctl) else 0
while True:
    data = open(ctl).read() if os.path.exists(ctl) else ""
    if len(data) > pos:
        sys.stdout.write(data[pos:]); sys.stdout.flush(); pos = len(data)
    time.sleep(0.03)
'''


async def until(fn, seconds=5.0):
    end = time.time() + seconds
    while time.time() < end:
        v = fn()
        if v:
            return v
        await asyncio.sleep(0.03)
    return fn()


async def manager(tmp):
    d = Path(tmp)
    fake = d / "uxplay"
    fake.write_text(FAKE)
    fake.chmod(0o755)
    run = d / "run"
    run.mkdir()
    runs = lambda: [json.loads(x) for x in (d / "runs.txt").read_text().splitlines()] if (d / "runs.txt").exists() else []   # noqa: E731
    say = lambda *lines: (d / "say.txt").open("a").write("".join(x + "\n" for x in lines))   # noqa: E731
    alive = lambda pid: os.path.exists(f"/proc/{pid}") and "zombie" not in Path(f"/proc/{pid}/status").read_text().lower()     # noqa: E731

    hub = Hub({})
    a = airplay.AirPlay(hub, {"enabled": True, "uxplay": str(fake), "runtime_dir": str(run), "wayland_display": "wayland-0", "retry_s": 0.2, "name": "Pixel"})
    bc = asyncio.ensure_future(hub.broadcaster())                  # the listeners run after each change, like on the server
    a.quick = 0.8                                                    # its runs here are short: "at once" is shorter
    task = asyncio.ensure_future(a.run())
    await asyncio.sleep(0.4)
    check("no Wayland session yet: it waits (status attente), UxPlay not started", hub.s["airplay"]["status"] == "attente" and not runs(), str(hub.s["airplay"]))
    (run / "wayland-0").write_text("")
    await until(lambda: hub.s["airplay"]["status"] == "pret" and runs())
    r = runs()[0]
    argv = r["argv"]
    want = ["-n", "Pixel", "-nh", "-fs", "-vs", "waylandsink", "-s", "1280x720@60", "-fps", "30", "-p", "-reset", "5", "-nohold", "-nofreeze",
            "-srgb", "no", "-pin", "-hls"]
    check("the desktop is there: UxPlay starts, with its options (full screen on Wayland, -nofreeze, -srgb no, -pin, -hls)", argv == want, str(argv))
    check("... in the desktop's session (WAYLAND_DISPLAY, XDG_RUNTIME_DIR)", r["wayland"] == "wayland-0" and r["runtime"] == str(run), str(r))

    cast = lambda: hub.s.get("cast") or {}                         # noqa: E731
    say("Accepted IPv4 client on socket 30", "Connection closed on socket 30")
    await asyncio.sleep(0.3)
    check("a probe connection: Pixel does not move", not hub.s.get("cast"))
    say("Accepted IPv4 client on socket 31", '*** CLIENT MUST NOW ENTER PIN = "4821" AS AIRPLAY PASSWORD')
    await until(lambda: cast().get("phase") == "pin")
    c = cast()
    check("the PIN: on Pixel's screen, in big, for a while", c.get("kind") == "screen" and c.get("via") == "airplay" and c.get("code") == "4821" and c.get("until", 0) > time.time() * 1000, str(c))
    say("connection request from Marie's iPhone (iPhone14,2) with deviceID = 4A:3B:2C:1D:0E:9F")
    await until(lambda: cast().get("phase") == "connecting")
    check("a connection request: Pixel shows who comes", cast().get("title") == "AirPlay : Marie's iPhone" and hub.s["airplay"]["client"] == "Marie's iPhone"
          and hub.s["airplay"]["status"] == "connecte", str(cast()))
    say("raop_rtp_mirror starting mirroring")
    await until(lambda: cast().get("phase") == "live")
    check("mirroring: AirPlay mode until it ends (no time limit)", cast().get("phase") == "live" and cast().get("until") == 0)
    say("Connection closed on socket 31")
    await until(lambda: not hub.s.get("cast"))
    check("the iPhone stops: Pixel goes back to its screen", not hub.s.get("cast") and hub.s["airplay"]["status"] == "pret" and hub.s["airplay"]["client"] == "")

    say("Accepted IPv4 client on socket 40", "connection request from Paul's iPad (iPad13,1) with deviceID = 11:22", "raop_rtp_mirror starting mirroring")
    await until(lambda: cast().get("phase") == "live")
    pid = runs()[-1]["pid"]
    hub.s["cast"] = None                                             # cast.stop (pixel/cast.py): a touch on Pixel, or the phone's Arrêter
    hub.mark()
    await until(lambda: len(runs()) == 2, 6)
    check("stopped on Pixel: UxPlay starts again, which sends the iPad away", len(runs()) == 2 and not alive(pid) and not hub.s.get("cast"), str(len(runs())))
    await until(lambda: hub.s["airplay"]["status"] == "pret")
    say("Accepted IPv4 client on socket 41", "connection request from Paul's iPad (iPad13,1) with deviceID = 11:22", "on_video_play: location = http://192.168.1.24:7100/master.m3u8")
    await until(lambda: cast().get("phase") == "live")
    check("a video from the YouTube app (-hls): AirPlay mode too", cast().get("phase") == "live")
    hub.s["cast"] = {"kind": "text", "text": "À table !", "id": "x", "t0": 0, "until": 0, "raw": False}   # another cast takes Pixel's screen
    hub.mark()
    await until(lambda: len(runs()) == 3, 6)
    check("another cast over it: the iPad is sent away too (UxPlay's window would hide it)", len(runs()) == 3 and cast().get("kind") == "text")
    hub.s["cast"] = None
    await until(lambda: hub.s["airplay"]["status"] == "pret")
    say("Accepted IPv4 client on socket 50", "connection request from Marie's iPhone (iPhone14,2) with deviceID = 4A", "raop_rtp_mirror starting mirroring")
    await until(lambda: cast().get("phase") == "live")
    pid = runs()[-1]["pid"]
    say("*** ERROR lost connection with client (network problem?)")
    await until(lambda: not hub.s.get("cast"))
    check("a client lost (-reset 5): back to Pixel", not hub.s.get("cast"))
    await until(lambda: len(runs()) == 4, 6)
    check("... and UxPlay starts again, so that no frozen picture of the iPhone stays over Pixel", len(runs()) == 4 and not alive(pid), str(len(runs())))
    await until(lambda: hub.s["airplay"]["status"] == "pret")

    pid = runs()[-1]["pid"]
    os.kill(pid, 9)                                                  # UxPlay crashes
    await until(lambda: len(runs()) == 5, 6)
    check("UxPlay crashes: it starts again", len(runs()) == 5)
    await asyncio.sleep(1.0)                                          # it has been running for a while: this is not "at once"
    (d / "crash").write_text("")
    os.kill(runs()[-1]["pid"], 9)
    await until(lambda: hub.s["airplay"]["status"] == "erreur" and "unknown option" in hub.s["airplay"]["error"], 6)
    check("it stops at once: status erreur, with its last line, and it slows down", hub.s["airplay"]["status"] == "erreur" and "unknown option" in hub.s["airplay"]["error"], str(hub.s["airplay"]))
    n = len(runs())
    await asyncio.sleep(1.0)
    check("... more and more slowly (not in a loop)", len(runs()) - n <= 2, str(len(runs()) - n))
    (d / "crash").unlink()
    await until(lambda: hub.s["airplay"]["status"] == "pret", 8)
    pid = runs()[-1]["pid"]
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    await until(lambda: not alive(pid), 5)
    check("the server stops: UxPlay stops with it", not alive(pid))
    bc.cancel()

    hub2 = Hub({})
    b = airplay.AirPlay(hub2, {"enabled": True, "uxplay": str(d / "nothing-here"), "runtime_dir": str(run)})
    t2 = asyncio.ensure_future(b.run())
    await asyncio.sleep(0.3)
    check("UxPlay not installed: status absent (the phone app says so)", hub2.s["airplay"]["status"] == "absent", str(hub2.s["airplay"]))
    t2.cancel()
    hub3 = Hub({})
    c = airplay.AirPlay(hub3, {})
    t0 = time.time()
    await c.run()
    check("off by default: nothing starts, status off", hub3.s["airplay"] == {"on": False, "status": "off", "client": "", "name": "Pixel", "error": ""} and time.time() - t0 < 0.1)
    example = (APP / "config.example.toml").read_text()
    check("config.example.toml: the [airplay] and [ecran] settings, AirPlay off", "[airplay]" in example and "enabled = false" in example and "[ecran]" in example)
    inst = (APP / "deploy" / "install.sh").read_text()
    check("install.sh: UxPlay only if asked (PIXEL_AIRPLAY=1), built from its 1.73.7 tag", "PIXEL_AIRPLAY" in inst and "v1.73.7" in inst and "NO_X11_DEPS=ON" in inst)


if __name__ == "__main__":
    sample()
    with tempfile.TemporaryDirectory() as tmp:
        asyncio.run(manager(tmp))
    print("\n%d failure(s)" % len(fails))
    sys.exit(1 if fails else 0)
