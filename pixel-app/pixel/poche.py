"""Pixel de poche: the phone held sideways becomes a second, living Pixel (web/poche.js). The two Pixels know each other.

The server only passes the news on, and not too often:
- poche.touch: "the Pixel of the phone was touched, petted, shaken, switched on" (by="poche"), or "the Pi's Pixel was
  touched or petted" (by="pi"). kind "la" (still there) and "au-revoir" only say whether a Pixel de poche is around.
- poche.voyage: the voyage gag. to="poche": Pixel walks off the Pi's screen and comes in on the phone's, for a minute
  at most; to="pi": back home before that.
The snapshot carries "poche": {"ev": {"id", "by", "kind", "t0"} or None, "voyage": {"to", "t0", "until"} or None,
"here": the last word from a Pixel de poche (ms, 0: none)}. Each screen plays its own scenes (web/scenes/poche.js);
web/lab/demo-hub.js does the same for Pixel Lab.
"""
import time

KINDS = ("bonjour", "tape", "caresse", "secoue", "la", "au-revoir")
BY = ("poche", "pi")
GAP_MS = 2500           # the same news from the same side: at most once every 2.5 s
VOYAGE_MS = 60000       # how long Pixel stays in your pocket before he walks home by himself


def now_ms():
    return time.time() * 1000


def setup(hub):
    P = hub.s.setdefault("poche", {"ev": None, "voyage": None, "here": 0})
    last = {}

    def visiting():
        v = P["voyage"]
        return bool(v) and v["to"] == "poche" and now_ms() < v["until"]

    @hub.action("poche.touch")
    async def touch(kind, by="poche"):
        """Something happened to one of the two Pixels: the other one may react (jealous, curious, he waves)."""
        if kind not in KINDS or by not in BY:
            return
        t = now_ms()
        if t - last.get((by, kind), -1e15) < GAP_MS:
            return
        last[(by, kind)] = t
        if by == "poche":
            P["here"] = 0 if kind == "au-revoir" else t
        if kind in ("la", "au-revoir"):
            return
        P["ev"] = {"id": ((P["ev"] or {}).get("id") or 0) + 1, "by": by, "kind": kind, "t0": t}

    @hub.action("poche.voyage")
    async def voyage(to="poche"):
        """Pixel goes into your pocket (to="poche") for a minute, or comes back home (to="pi")."""
        t = now_ms()
        if to == "poche" and not visiting():
            P["voyage"] = {"to": "poche", "t0": t, "until": t + VOYAGE_MS}
        elif to == "pi" and visiting():
            P["voyage"] = {"to": "pi", "t0": t, "until": t}
        else:
            return
        hub.s["anim"] = None
        hub.s["screen"] = "visage"           # he walks off (or in) on his face screen
