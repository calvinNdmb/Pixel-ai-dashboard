"""Pixel's ears: the microphone of his Pi. He hears words on his own machine (Vosk, offline), then they go where typed
words go (pixel/commands.py): a command (« fais le poisson », « météo »…), else Claude, who can answer, write, make a quiz
or an exercise.

The micro button on his screen (web/dock.js) sends voix.toggle. While he listens, arecord streams 16 kHz mono from the
microphone, Vosk turns it into words as they come (his screen shows them), and he stops by himself 1.8 s after the last
word, after 6 s without a word, after 20 s, or at a touch on the button. No sound is kept anywhere: the words only.

The snapshot's "voix":
  ok, why     Vosk, its French model, arecord and a microphone are there (why: what is missing, in French)
  on          he listens; partial: the words heard so far; level: the microphone's level, 0 to 1; t0: since when (ms)
  last        {id, text, t}: the last words he heard (sent as a command, or to Claude); text "" when he heard nothing
[voix] in config.toml: enabled (true), device ("": the first microphone, as plughw:N,0), model (the folder of a Vosk
model; default ~/.local/share/pixel/vosk-model-small-fr-0.22, which deploy/install.sh downloads), max_seconds (20),
silence (1.8), wait_seconds (6: no word at all, he stops).
--demo: pretend ears that hear « fais le poisson » (the tests, a computer without a microphone).
"""
import array
import asyncio
import contextlib
import importlib.util
import json
import logging
import math
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

log = logging.getLogger("pixel")

MODEL = "~/.local/share/pixel/vosk-model-small-fr-0.22"
RATE = 16000
CHUNK = 4000                    # bytes: 0.125 s of 16 kHz 16-bit mono


def ms():
    return time.time() * 1000


def level(chunk):
    """How loud a piece of 16-bit sound is, 0 to 1 (its RMS, scaled so that speech near the microphone reaches about 1)."""
    a = array.array("h")
    a.frombytes(chunk[: len(chunk) // 2 * 2])
    if not a:
        return 0.0
    rms = math.sqrt(sum(x * x for x in a) / len(a)) / 32768
    return round(min(1.0, rms * 8), 2)


def mic_from(listing):
    """The first microphone of a listing of `arecord -l`, as plughw:N,D (None when there is none)."""
    m = re.search(r"^card (\d+):.*device (\d+):", listing or "", re.M)
    return f"plughw:{m.group(1)},{m.group(2)}" if m else None


def first_mic():
    try:
        return mic_from(subprocess.run(["arecord", "-l"], capture_output=True, text=True, timeout=5).stdout)
    except (OSError, subprocess.SubprocessError):
        return None


class VoskEars:
    """The real ears: arecord into Vosk. hear() yields ("partial" | "final", words) and the sound's level as it comes."""
    def __init__(self, model_dir, device):
        self.model_dir, self.device, self.model, self.proc = model_dir, device, None, None

    def problem(self):
        if importlib.util.find_spec("vosk") is None:     # only looked for: loading it costs Pixel's start 2 s, the first listening pays it
            return "Vosk n'est pas installé : relance sh deploy/install.sh."
        if not (self.model_dir / "conf").is_dir():
            return "Le modèle français de Vosk manque : relance sh deploy/install.sh."
        if not shutil.which("arecord"):
            return "arecord manque (sudo apt install alsa-utils)."
        if not (self.device or first_mic()):
            return "Pas de micro branché."
        return ""

    def _load(self):
        import vosk
        vosk.SetLogLevel(-1)
        return vosk.Model(str(self.model_dir))

    async def hear(self, stopping):
        """Words as they come, until stopping() says so or the microphone goes quiet for good."""
        import vosk
        loop = asyncio.get_running_loop()
        if self.model is None:
            self.model = await loop.run_in_executor(None, self._load)      # the first time: a second or two
        rec = vosk.KaldiRecognizer(self.model, RATE)
        dev = self.device or first_mic()
        self.proc = await asyncio.create_subprocess_exec("arecord", "-q", "-D", dev, "-f", "S16_LE", "-r", str(RATE), "-c", "1",
                                                         "-t", "raw", stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        try:
            while not stopping():
                try:
                    chunk = await asyncio.wait_for(self.proc.stdout.readexactly(CHUNK), 3)
                except asyncio.IncompleteReadError as e:
                    chunk = e.partial
                if not chunk:
                    err = (await self.proc.stderr.read()).decode(errors="replace").strip()
                    raise OSError(err or "le micro ne donne plus rien")
                done = await loop.run_in_executor(None, rec.AcceptWaveform, chunk)
                words = json.loads(rec.Result() if done else rec.PartialResult()).get("text" if done else "partial", "")
                yield ("final" if done else "partial"), words, level(chunk)
            yield "final", json.loads(rec.FinalResult()).get("text", ""), 0.0
        finally:
            with contextlib.suppress(ProcessLookupError):
                self.proc.kill()
            with contextlib.suppress(Exception):
                await self.proc.wait()
            self.proc = None


class DemoEars:
    """Pretend ears (--demo, the tests): they hear WORDS, one more every STEP seconds, then nothing."""
    WORDS = "fais le poisson"
    STEP = 0.25

    def __init__(self, words=None):
        self.words = (words if words is not None else self.WORDS).split()

    def problem(self):
        return ""

    async def hear(self, stopping):
        said = 0
        for i in range(1, len(self.words) + 1):
            await asyncio.sleep(self.STEP)
            if stopping():
                break
            said = i
            yield "partial", " ".join(self.words[:i]), 0.6
        yield "final", " ".join(self.words[:said]), 0.0
        while not stopping():                         # then silence, until he stops by himself or by a touch
            await asyncio.sleep(0.05)
            yield "partial", "", 0.02


class Voix:
    def __init__(self, hub, cfg=None, ears=None):
        cfg = cfg or {}
        self.hub = hub
        self.enabled = cfg.get("enabled", True) is not False
        self.ears = ears or VoskEars(Path(os.path.expanduser(str(cfg.get("model") or MODEL))), str(cfg.get("device") or ""))
        self.max_s = float(cfg.get("max_seconds", 20))
        self.silence = float(cfg.get("silence", 1.8))
        self.wait_s = float(cfg.get("wait_seconds", 6))
        self.s = hub.s["voix"] = {"ok": False, "why": "", "on": False, "partial": "", "level": 0.0, "t0": 0, "last": None}
        self.task, self.stop_asked, self.ids = None, False, 0
        self.check()

        @hub.action("voix.start")
        async def start():
            """He listens (the micro button)."""
            self.start()

        @hub.action("voix.stop")
        async def stop():
            """He stops listening: what he heard so far goes on."""
            self.stop_asked = True

        @hub.action("voix.toggle")
        async def toggle():
            if self.s["on"]:
                self.stop_asked = True
            else:
                self.start()

    def check(self):
        why = "" if self.enabled else "Le micro est coupé dans config.toml ([voix] enabled)."
        why = why or self.ears.problem()
        self.s.update(ok=not why, why=why)
        return not why

    def start(self):
        if self.s["on"]:
            return None
        if not self.check():
            self.hub.toast("MICRO : " + self.s["why"], 6000)
            self.hub.mark()
            return None
        self.ids += 1
        self.stop_asked = False
        self.s.update(on=True, partial="", level=0.0, t0=ms())
        self.hub.mood("ecoute", int((self.max_s + 5) * 1000))       # his listening face, on every screen
        self.hub.mark()
        self.task = asyncio.ensure_future(self._listen(self.ids))
        return self.task

    async def _listen(self, lid):
        parts, partial, t0 = [], "", time.monotonic()
        last_word, last_mark = None, 0.0
        stopping = lambda: self.stop_asked or (time.monotonic() - t0 > self.max_s) or (   # noqa: E731
            (time.monotonic() - last_word > self.silence) if last_word else (time.monotonic() - t0 > self.wait_s))
        why = ""
        try:
            async for kind, words, lvl in self.ears.hear(stopping):
                now = time.monotonic()
                if kind == "final":
                    if words:
                        parts.append(words)
                        last_word = now
                    partial = ""
                elif words and words != partial:
                    partial, last_word = words, now
                heard = " ".join(parts + ([partial] if partial else []))
                if heard != self.s["partial"] or now - last_mark > 0.2:
                    self.s.update(partial=heard[-300:], level=lvl)
                    last_mark = now
                    self.hub.mark()
        except Exception as e:                          # noqa: BLE001 - the screens must hear that he stopped
            log.warning("voix : le micro s'arrête (%s)", e)
            why = "Le micro ne marche pas : " + str(e)[:120]
        text = re.sub(r"\s+", " ", " ".join(parts)).strip()
        self.s.update(on=False, partial="", level=0.0, last={"id": lid, "text": text, "t": ms()})
        self.hub.mood("neutre")
        self.hub.mark()
        if why:
            self.hub.toast("MICRO : " + why, 6000)
        elif not text:
            self.hub.toast("JE N'AI RIEN ENTENDU", 3000)
        else:
            log.info("voix : %d mots entendus", len(text.split()))
            await self.hub.dispatch("cmd", {"text": text})


def setup(hub, cfg=None):
    """His ears: hub.s["voix"] and the voix.* actions."""
    return Voix(hub, cfg or {}, DemoEars() if hub.demo else None)
