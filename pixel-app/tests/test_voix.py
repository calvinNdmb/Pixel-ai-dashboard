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
- his buttons (web/dock.js, run in node with a pretend screen and server): Réglages, Agenda, Exos (« Exos de maths »,
  web/exos.js) and the micro in the right column; the micro starts him, « Arrêter » stops him
  even right after the micro button and before the server answered, a double touch is one touch, the Claude screen and
  the other screens can stop him too, and without news from Pixel nothing pretends he listens;
- the pieces around: server.py, install.sh, dock.js before app.js, screens.js draws it and leaves voix.* to it.
"""
import argparse
import array
import asyncio
import json
import logging
import math
import os
import shutil
import subprocess
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


class Logs(logging.Handler):
    def __init__(self):
        super().__init__()
        self.lines = []

    def emit(self, record):
        self.lines.append(record.getMessage())


async def listening():
    logs = Logs()
    logging.getLogger("pixel").addHandler(logs)
    logging.getLogger("pixel").setLevel(logging.INFO)
    try:
        await _listening(logs)
    finally:
        logging.getLogger("pixel").removeHandler(logs)


async def _listening(logs):
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
    ends = [x for x in logs.lines if x.startswith("voix : fin")]
    check("the log says each listening and why it stopped: the silence, the button, nothing heard, the time",
          len(ends) >= 6 and "par le silence" in ends[0] and "par le bouton" in ends[1] and "par rien entendu" in ends[2]
          and "par 0.35 s" in ends[3] and all("mot" in x for x in ends) and not any("poisson" in x for x in ends), ends)
    check("…never the words themselves", not any("fais le poisson" in x or "crée un" in x for x in logs.lines), logs.lines)


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
    check("dock.js: his buttons above the plate (y 352): Réglages opens the quick menu, Agenda his calendar",
          "TOP = 64, STEP = 72" in dock and "Sc.menu(true)" in dock and "screen: 'agenda'" in dock and "<script" not in dock.lower())


DOCK_JS = r"""
const fs = require('fs'), vm = require('vm');
let T = 1000, srvNow = 1e6, texts = [], voix = { ok: true, why: '', on: false, partial: '', level: 0, last: null }, fresh = true;
const sent = [], hits = [], L = { kiosk: true, scr: 'visage', boot: -1, sleepy: false, dirty: false };
const X = new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
const sb = { console, Math, JSON, Object, Array, String, Number, performance: { now: () => T },
  Screens: { local: L, menuOpen: false, addonTop: false, casting: false, menu: () => sent.push('menu') },
  PixelExos: { choisir: () => sent.push('exos.choisir') } };                                   // web/exos.js: « Exos de maths »
sb.window = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(process.argv[1], 'utf8'), sb, { filename: process.argv[1] });
const D = sb.PixelDock;
const K = { X, c: { PK: '#f4a', AM: '#fa0', D: '#333', B: '#000', G: '#0f0', WH: '#fff', DK: '#111' }, T: { upper: false },
  get P() { return { voix, exos: {}, server_now: fresh ? srvNow : srvNow - 5000 }; }, get now() { return T; }, srv: () => srvNow,
  box() {}, txt: s => texts.push(String(s)), fit: t => t, fast() {}, send: a => sent.push(a), hit: (x, y, w, h, fn) => hits.push([x, y, w, h, fn]) };
const frame = () => { hits.length = 0; texts = []; D.over(K); return texts.slice(); };          // the screen drawn once
const server = on => { voix = { ...voix, on }; return frame(); };                                // the server's answer, drawn
const inside = (x, y) => ([hx, hy, w, h]) => x >= hx && x <= hx + w && y >= hy && y <= hy + h;
const at = (x, y) => hits.some(inside(x, y));
const tap = (x, y) => { const h = [...hits].reverse().find(inside(x, y)); if (h) h[4]({ x, y }); };   // as Screens.hit: the top one
const wait = ms => { T += ms; srvNow += ms; };
const out = {}, step = (name, fn) => { const n = sent.length; fn(); out[name] = sent.slice(n); };
frame(); out.buttons = [at(768, 96), at(768, 168), at(768, 240), at(768, 312)];   // Réglages, Agenda, Exos, the micro: x 736
step('exos', () => tap(768, 240));
step('start', () => tap(768, 312)); out.starting = frame();
wait(100); step('double', () => tap(768, 312));                          // the same finger again, 0.1 s later
out.on = server(true); out.box = at(658, 396);
wait(200); step('stop_soon', () => tap(658, 396)); out.stopping = frame();   // « Arrêter », 0.3 s after the micro button
wait(50); step('stop_again', () => tap(400, 380));                       // anywhere on the box, again
server(false); wait(1000); frame(); out.after = { box: at(658, 396), pending: D.pending };
step('micro_on', () => tap(768, 312));
server(true); wait(600); step('micro_off', () => tap(768, 312));          // the lit micro button stops him too
server(false); wait(600); step('again', () => tap(768, 312));
wait(150); frame(); step('stop_before_server', () => tap(658, 396));     // « Arrêter » before the server answered the micro
server(false); wait(3500); frame();
L.scr = 'claude'; server(true); out.claude = [at(700, 392), at(500, 396), at(768, 312)];   // its micro, the box, no column
wait(500); step('claude_mic', () => tap(700, 392));
server(false); L.scr = 'meteo'; server(true); wait(800); step('badge', () => tap(400, 455));   // the red « MICRO »
server(false); L.scr = 'visage'; voix = { ...voix, on: true }; fresh = false; wait(800); out.stale = { texts: frame(), box: at(400, 380) };
console.log(JSON.stringify(out));
"""


def dock():
    """web/dock.js in node, with a pretend screen and a pretend server: what each touch sends, what the screen says."""
    if not shutil.which("node"):
        print("SKIP dock.js : node n'est pas installé ici")
        return
    out = subprocess.run(["node", "-e", DOCK_JS, str(APP / "web" / "dock.js")], capture_output=True, text=True, encoding="utf-8", timeout=60)
    try:
        g = json.loads(out.stdout)
    except ValueError:
        check("web/dock.js runs in node", False, out.stderr[-600:])
        return
    check("dock.js: Réglages, Agenda, Exos and the micro in the right column", g["buttons"] == [True, True, True, True], g["buttons"])
    check("…Exos opens « Exos de maths » (web/exos.js)", g["exos"] == ["exos.choisir"], g["exos"])
    check("…the micro button starts him, and says so at once (« J'arrive… », « Arrêter »)", g["start"] == ["voix.start"]
          and "J'arrive…" in g["starting"] and "Arrêter" in g["starting"], g)
    check("…a double touch is one touch", g["double"] == [], g["double"])
    check("…he listens: « Je t'écoute… », a box with « Arrêter »", "Je t'écoute…" in g["on"] and g["box"], g["on"])
    check("…« Arrêter » stops him, even 0.3 s after the micro button, and says so at once (« J'arrête… »)",
          g["stop_soon"] == ["voix.stop"] and "J'arrête…" in g["stopping"], g)
    check("…a second touch on it sends nothing more", g["stop_again"] == [], g["stop_again"])
    check("…stopped: the box goes, nothing waits", g["after"] == {"box": False, "pending": None}, g["after"])
    check("…the lit micro button stops him too", g["micro_on"] == ["voix.start"] and g["micro_off"] == ["voix.stop"], g)
    check("…« Arrêter » before the server even answered the micro: he stops", g["again"] == ["voix.start"]
          and g["stop_before_server"] == ["voix.stop"], g)
    check("the Claude screen: its own micro button and the box (no column)", g["claude"] == [True, True, False]
          and g["claude_mic"] == ["voix.stop"], g)
    check("another screen: the red « MICRO » stops him", g["badge"] == ["voix.stop"], g["badge"])
    check("no news from Pixel for 5 s: nothing pretends he listens", not g["stale"]["box"]
          and not any("écoute" in t for t in g["stale"]["texts"]), g["stale"])


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
                parts.append(json.loads(rec.Result())["text"])
        parts.append(json.loads(rec.FinalResult())["text"])
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
    dock()
    asyncio.run(listening())
    asyncio.run(troubles())
    if a.wav:
        real_vosk(a.wav, a.expect)
    print(f"\n{len(fails)} failure(s)")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
