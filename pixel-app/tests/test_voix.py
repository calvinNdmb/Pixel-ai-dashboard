"""His ears (pixel/voix.py) with pretend ears and no server, and the pieces of his buttons (web/dock.js):

    python3 tests/test_voix.py
    python3 tests/test_voix.py --wav FILE.wav [--expect "mots attendus"]   # also the real Vosk and its French model on a
                                                                           # recording (16 kHz mono), where they are installed

- he listens: his listening face, the words as they come, then he stops by himself after the silence, and the words go
  as typed words do (the "cmd" action: a command, else Claude);
- a touch stops him: what he heard so far goes on; nothing heard: said, nothing sent;
- 20 s at most (here less); no word at all for a while: he stops;
- no Vosk, no model, no microphone, switched off in config.toml: said why, he does not listen; a microphone that fails
  while he listens: said, he stops, nothing sent;
- the level of a sound, the first microphone of `arecord -l`;
- the pieces around: server.py, install.sh, dock.js before app.js, screens.js draws it and leaves voix.* to it.
"""
import argparse
import array
import asyncio
import math
import os
import sys
import time
import wave
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
from pixel import voix  # noqa: E402
from pixel.state import Hub  # noqa: E402

fails = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


def make_hub():
    hub, sent, toasts = Hub({}, demo=True), [], []

    @hub.action("cmd")
    async def cmd(text):
        sent.append(text)

    real = hub.toast
    hub.toast = lambda msg, ms=3000: (toasts.append(msg), real(msg, ms))
    return hub, sent, toasts


async def watch(hub, task, seen):
    while not task.done():
        seen.append((hub.s["voix"]["on"], hub.s["voix"]["partial"], hub.s["mood"]["name"]))
        await asyncio.sleep(0.03)
    await task


class Broken:
    def __init__(self, why="", fail=None):
        self.why, self.fail = why, fail

    def problem(self):
        return self.why

    async def hear(self, stopping):
        yield "partial", "crée un", 0.5
        raise OSError(self.fail or "Device or resource busy")


async def listening():
    hub, sent, toasts = make_hub()
    v = voix.Voix(hub, {"silence": 0.4}, voix.DemoEars())
    check("pretend ears: ready", hub.s["voix"]["ok"] and hub.s["voix"]["why"] == "", hub.s["voix"])
    seen = []
    t = v.start()
    await watch(hub, t, seen)
    s = hub.s["voix"]
    partials = [p for on, p, _ in seen if on and p]
    check("he listens: on, his listening face on every screen", any(on for on, _, _ in seen) and any(m == "ecoute" for on, _, m in seen if on), seen[:3])
    check("…the words as they come", "fais" in partials and "fais le" in partials and "fais le poisson" in partials, partials)
    check("…he stops by himself after the silence, off, his face back", not s["on"] and s["partial"] == "" and hub.s["mood"]["name"] == "neutre", s)
    check("…the words go as typed words (cmd: a command, else Claude)", sent == ["fais le poisson"] and s["last"]["text"] == "fais le poisson", sent)

    hub, sent, toasts = make_hub()
    ears = voix.DemoEars("crée un quiz sur les volcans")
    v = voix.Voix(hub, {"silence": 5}, ears)
    t = v.start()
    await asyncio.sleep(0.6)
    await hub.dispatch("voix.stop")
    t0 = time.monotonic()
    await t
    check("a touch stops him at once, what he heard so far goes on", time.monotonic() - t0 < 0.5 and sent == ["crée un"], sent)

    hub, sent, toasts = make_hub()
    v = voix.Voix(hub, {"wait_seconds": 0.3}, voix.DemoEars(""))
    t0 = time.monotonic()
    await v.start()
    check("no word at all: he stops by himself, says so, sends nothing", time.monotonic() - t0 < 1.5 and sent == [] and "JE N'AI RIEN ENTENDU" in toasts, toasts)

    hub, sent, toasts = make_hub()
    ears = voix.DemoEars("un deux trois quatre cinq six sept huit neuf dix onze douze")
    ears.STEP = 0.1
    v = voix.Voix(hub, {"max_seconds": 0.35, "silence": 5}, ears)
    t0 = time.monotonic()
    await v.start()
    check("a time limit (20 s; here 0.35 s): he stops, what he heard goes on", time.monotonic() - t0 < 1.0 and sent and len(sent[0].split()) <= 4, sent)

    hub, sent, toasts = make_hub()
    v = voix.Voix(hub, {"silence": 0.3}, voix.DemoEars())
    await hub.dispatch("voix.toggle")
    on = hub.s["voix"]["on"]
    await asyncio.sleep(0.4)
    await hub.dispatch("voix.toggle")
    await v.task
    check("voix.toggle: the micro button starts him, then stops him", on and not hub.s["voix"]["on"] and sent == ["fais"], sent)
    check("…started twice: one listening only", v.start() is not None and v.start() is None)
    await v.task


async def troubles():
    for why in ("Pas de micro branché.", "Le modèle français de Vosk manque : relance sh deploy/install.sh."):
        hub, sent, toasts = make_hub()
        v = voix.Voix(hub, {}, Broken(why))
        check(f"missing ({why.split(':')[0]}): said why, he does not listen", v.start() is None and not hub.s["voix"]["ok"]
              and hub.s["voix"]["why"] == why and any(why in m for m in toasts) and not hub.s["voix"]["on"], toasts)
    hub, sent, toasts = make_hub()
    v = voix.Voix(hub, {"enabled": False}, voix.DemoEars())
    check("switched off in config.toml ([voix] enabled = false): said so", v.start() is None and "config.toml" in hub.s["voix"]["why"])
    hub, sent, toasts = make_hub()
    v = voix.Voix(hub, {}, Broken("", "Device or resource busy"))
    await v.start()
    check("a microphone that fails while he listens: said, off, nothing sent", not hub.s["voix"]["on"] and sent == []
          and any("Device or resource busy" in m for m in toasts) and hub.s["mood"]["name"] == "neutre", toasts)
    real = voix.VoskEars(Path("/nulle/part"), "")
    check("the real ears without their model: they say what is missing", real.problem() != "", real.problem())


def helpers():
    quiet = array.array("h", [0] * 2000).tobytes()
    loud = array.array("h", [int(20000 * math.sin(i / 5)) for i in range(2000)]).tobytes()
    check("the level of a sound: silence 0, a loud one 1", voix.level(quiet) == 0.0 and voix.level(loud) == 1.0 and voix.level(b"") == 0.0)
    listing = ("**** List of CAPTURE Hardware Devices ****\ncard 1: Device [USB PnP Sound Device], device 0: USB Audio [USB Audio]\n"
               "  Subdevices: 1/1\n")
    check("the first microphone of arecord -l", voix.mic_from(listing) == "plughw:1,0" and voix.mic_from("") is None)


def pieces():
    srv = (APP / "server.py").read_text(encoding="utf-8")
    check("server.py starts his ears", "voix.setup" in srv)
    inst = (APP / "deploy" / "install.sh").read_text(encoding="utf-8")
    check("install.sh puts Vosk and its French model in place", "pip install -q vosk" in inst and "vosk-model-small-fr-0.22" in inst
          and ".local/share/pixel" in inst and str(voix.MODEL).endswith("vosk-model-small-fr-0.22"))
    page = (APP / "web" / "index.html").read_text(encoding="utf-8")
    check("index.html loads dock.js after nourrir.js and before app.js", page.find("app/nourrir.js") < page.find("app/dock.js") < page.find("app/app.js"))
    sc = (APP / "web" / "screens.js").read_text(encoding="utf-8")
    check("screens.js draws the dock after Nourrir's plate, and leaves voix.* out of his reactions",
          sc.find("PixelNourrir.over(NOUR)") < sc.find("PixelDock.over(KIT)") and "|voix\\.)/" in sc)
    dock = (APP / "web" / "dock.js").read_text(encoding="utf-8")
    check("dock.js: his buttons above the plate (y 352), the micro toggles", "TOP = 136, STEP = 72" in dock and "voix.toggle" in dock
          and "Sc.menu(true)" in dock and "screen: 'agenda'" in dock and "<script" not in dock.lower())


def real_vosk(path, expect):
    """The real Vosk and its model on a recording: what it hears (where Vosk and the model are installed)."""
    try:
        import vosk
    except ImportError:
        print("SKIP --wav : Vosk n'est pas installé ici")
        return
    model_dir = Path(os.path.expanduser(voix.MODEL))
    if not (model_dir / "conf").is_dir():
        print(f"SKIP --wav : pas de modèle dans {model_dir}")
        return
    vosk.SetLogLevel(-1)
    t0 = time.monotonic()
    model = vosk.Model(str(model_dir))
    t1 = time.monotonic()
    with wave.open(path, "rb") as w:
        ok = w.getnchannels() == 1 and w.getsampwidth() == 2 and w.getframerate() == voix.RATE
        check("the recording is 16 kHz mono 16-bit", ok, (w.getnchannels(), w.getsampwidth(), w.getframerate()))
        rec, parts = vosk.KaldiRecognizer(model, voix.RATE), []
        while True:
            chunk = w.readframes(voix.CHUNK // 2)
            if not chunk:
                break
            if rec.AcceptWaveform(chunk):
                parts.append(__import__("json").loads(rec.Result())["text"])
        parts.append(__import__("json").loads(rec.FinalResult())["text"])
        dur = w.getnframes() / w.getframerate()
    text = " ".join(p for p in parts if p)
    t2 = time.monotonic()
    print(f"     Vosk a entendu : « {text} » (modèle chargé en {t1 - t0:.1f} s, {dur:.1f} s de son lus en {t2 - t1:.1f} s)")
    check("the real Vosk hears words in the recording", bool(text))
    if expect:
        want = set(expect.lower().split())
        got = set(text.lower().split())
        check(f"…most of the words expected ({len(want & got)}/{len(want)})", len(want & got) >= max(1, int(len(want) * 0.6)), text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wav")
    ap.add_argument("--expect", default="")
    a = ap.parse_args()
    helpers()
    pieces()
    asyncio.run(listening())
    asyncio.run(troubles())
    if a.wav:
        real_vosk(a.wav, a.expect)
    print(f"\n{len(fails)} failure(s)")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
