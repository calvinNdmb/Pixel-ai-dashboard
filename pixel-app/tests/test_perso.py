"""The three customisations together, the server's side: his character (pixel/caractere.py), feeding him (pixel/nourrir.py)
and the math exercises (pixel/exos.py), on one hub set up as server.py does.

    python3 tests/test_perso.py

- the typed commands: each feature keeps its own words, none takes another's, a bare number goes to an open exercise only;
- Claude: the three tools side by side (set_character, feed_pixel, start_exercise), each checked and run; his system prompt
  carries his character; get_status tells his belly and the exercises, never an open exercise's answer;
- his character drives the others: gourmand (how fast his belly empties, when he is full), grognon (refuses what he dislikes),
  farceur (burps), the mood of the day (« Humeur du jour ») included; at 50 nothing changes.
The screens (the overlays' order on the Pi, studieux and his offers, the scenes' weights, the phone, Pixel Lab) are tested in a
browser by tests/test_perso.js. No server and no port: everything runs in this process.
"""
import asyncio
import json
import random
import sys
import tempfile
import time
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
import server  # noqa: E402
from pixel import caractere, commands, exos, nourrir, poche  # noqa: E402
from pixel.claude import SYSTEM, TOOLS, Claude, check as claude_check, system_for, system_text, tools_for  # noqa: E402
from pixel.state import Hub  # noqa: E402

fails = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


class Clock:
    def __init__(self, t):
        self.t = t

    def __call__(self):
        return self.t


def make_hub(tmp):
    """The hub as server.py serve() builds it (core actions, poche, caractère, nourrir, exos), Claude's chat replaced by a log."""
    hub = Hub({"data_dir": str(tmp)}, demo=True)
    server.core_actions(hub, tmp)
    poche.setup(hub)
    caractere.setup(hub, tmp)
    nourrir.setup(hub, tmp)
    exos.setup(hub, tmp)
    seen = []
    d0 = hub.dispatch

    async def dispatch(name, args=None):
        seen.append(name)
        if name == "chat.ask":
            return None
        return await d0(name, args)
    hub.dispatch = dispatch
    return hub, seen, d0


async def routing(tmp):
    hub, seen, d0 = make_hub(tmp)

    async def run(text):
        seen.clear()
        hub.nourrir.last_meal = -1e9                       # no « il mâche encore » between two meals of this test
        meal0 = (hub.s["nourrir"]["dernier"] or {}).get("id")
        await commands.run(hub, text)
        ate = (hub.s["nourrir"]["dernier"] or {}).get("id") != meal0
        return (seen[0] if seen else ("meal" if ate else "toast"))

    # no exercise open
    for text, want in (("sois gourmand", "caractere.set"), ("caractère petit prof", "caractere.set"), ("plus studieux", "caractere.ajuste"),
                       ("moins gourmand", "caractere.ajuste"), ("appelle-toi Bip", "caractere.set"),
                       ("mange une pomme", "meal"), ("donne-lui un gâteau", "meal"), ("à table !", "meal"), ("fais-le manger", "meal"),
                       ("tu as faim ?", "scene.play"),
                       ("exo", "exos.nouveau"), ("table de 7", "exos.nouveau"), ("une énigme", "exos.nouveau"), ("défi chrono", "exos.nouveau")):
        if hub.exos.cur:
            await d0("exos.stop", {})
        got = await run(text)
        check(f"« {text} » goes to {want}", got == want, got)
    await d0("exos.stop", {})
    for text in ("42", "fais un exo de maths", "mange moins", "sois", "gâteau", "fais le gourmand", "pizza"):
        got = await run(text)
        check(f"« {text} » with no exercise open goes to Claude", got == "chat.ask", got)
    # an exercise open: a bare number is its answer; the other features keep their words
    await d0("exos.nouveau", {"mode": "exo", "kind": "addition"})
    c = hub.exos.cur
    got = await run("12")
    check("a bare number answers the open exercise (exos.repondre), not Claude", got == "exos.repondre", got)
    for text, want in (("mange une pomme", "meal"), ("sois grognon", "caractere.set"), ("tu as faim ?", "scene.play")):
        if not hub.exos.cur or hub.exos.cur["etat"] != "question":
            await d0("exos.nouveau", {"mode": "exo", "kind": "addition"})
        got = await run(text)
        check(f"…an exercise open, « {text} » still goes to {want}", got == want, got)
    check("…and the exercise is still open after a meal and a change of character", bool(hub.exos.cur), json.dumps(c)[:80])
    hub.toast(commands.HELP)
    help_ = hub.s["toast"]["msg"]
    check("« aide » names one command of each feature", all(w in help_ for w in ("caractère câlin", "mange une pomme", "exo", "table de 7")), help_)


async def claude_side(tmp):
    hub, seen, d0 = make_hub(tmp)
    names = [t["name"] for t in TOOLS]
    check("Claude's tools: the three features' side by side, no name twice",
          {"set_character", "feed_pixel", "start_exercise"} <= set(names) and len(names) == len(set(names)), names)
    for_ui = [t["name"] for t in tools_for(["retro"])]
    check("…and all three offered to Claude", {"set_character", "feed_pixel", "start_exercise"} <= set(for_ui), for_ui)
    for name, good, bad in (("set_character", {"preset": "gourmand"}, {"preset": "glouton"}), ("feed_pixel", {"plat": "pizza"}, {"plat": "caillou"}),
                            ("start_exercise", {"kind": "table", "mode": "table", "table": 7}, {"mode": "marathon"})):
        check(f"check({name}): a good input passes, a bad one is refused", claude_check(name, good) is None and claude_check(name, bad), (claude_check(name, good), claude_check(name, bad)))
    cl = Claude(hub, {})
    check("his system prompt is exactly SYSTEM for the Pixel of every day", system_for(hub) == SYSTEM and system_text(hub) == SYSTEM)
    out = await cl.run_tool("set_character", {"preset": "gourmand", "surnom": "Léa"})
    sp, st = system_for(hub), system_text(hub)
    check("set_character: done, and his system prompt now carries his character (both forms)",
          out.startswith("ok") and isinstance(sp, list) and "Gourmand" in sp[1]["text"] and "Léa" in sp[1]["text"] and st.startswith(SYSTEM) and "Gourmand" in st, (out, st[-200:]))
    hub.nourrir.ventre = 40.0
    hub.nourrir.last_meal = -1e9
    out = await cl.run_tool("feed_pixel", {"plat": "au-choix"})
    check("feed_pixel: he eats, and says how his belly is", "ventre à" in out and hub.s["nourrir"]["dernier"]["plat"], out)
    out = await cl.run_tool("start_exercise", {"kind": "addition", "niveau": 1})
    c = hub.exos.cur
    check("start_exercise: an exercise opens; Claude is told not to give the answer", bool(c) and "Ne donne pas la réponse" in out, out)
    status = json.loads(await cl.run_tool("get_status", {}))
    blob = json.dumps(status, ensure_ascii=False)
    check("get_status: his belly, with his last meal", "ventre à" in status.get("ventre", "") and "dernier repas" in status["ventre"], status.get("ventre"))
    check("get_status: the exercises of the day and the open question, never its answer nor its choices",
          "Aujourd'hui" in status.get("exos", "") and c["q"] in status["exos"] and "Ne donne pas la réponse" in status["exos"]
          and '"answer"' not in blob and '"choices"' not in blob and '"reponse"' not in blob, status.get("exos"))
    await d0("exos.stop", {})
    status = json.loads(await cl.run_tool("get_status", {}))
    check("…and no question once it is put away", "ouvert" not in status["exos"], status["exos"])
    bare = Claude(Hub({}, demo=True), {})
    try:
        bare_status = bare.status()
        check("get_status without the features: as before, no belly nor exercises", "ventre" not in bare_status and "exos" not in bare_status, list(bare_status))
    except Exception as e:      # noqa: BLE001
        check("get_status without the features", False, repr(e))


async def traits(tmp):
    hub, seen, d0 = make_hub(tmp)
    clock = Clock(time.mktime((2026, 11, 9, 12, 0, 0, 0, 0, -1)))
    N = nourrir.Nourrir(hub, None, clock, random.Random(5))

    async def car(**a):
        await d0("caractere.set", a)

    await car(preset="pixel")
    r50, f50 = N.rate(), N.full_at()
    await car(preset="gourmand")
    rg, fg = N.rate(), N.full_at()
    await car(traits={"gourmand": 5})
    rp, fp = N.rate(), N.full_at()
    check("gourmand: his belly empties faster, and he has room left longer (and a small eater: slower, full sooner)",
          rg > r50 > rp and fg > f50 > fp, (rp, r50, rg, fp, f50, fg))
    check("…at 50 exactly the old speed (6 points an hour) and fullness (92)", abs(r50 - 6.0) < 1e-9 and f50 == 92, (r50, f50))

    hate = N.gouts["deteste"][0]

    async def eat(plat):
        clock.t += 60
        N.ventre = 40.0
        return N.donner(plat)
    await car(preset="pixel")
    r_pixel = await eat(hate)
    await car(preset="grognon")
    r_grognon = await eat(hate)
    check("grognon: the Pixel of every day eats what he dislikes (beurk), a grumpy one refuses it", r_pixel == "beurk" and r_grognon == "refuse", (r_pixel, r_grognon))

    async def burps(preset, n=500):
        await car(preset=preset)
        N.rng = random.Random(11)
        food = next(f["id"] for f in nourrir.FOODS if f["id"] not in N.gouts["deteste"] and f["id"] != N.gouts["prefere"] and f["cat"] in ("plat", "fruit"))
        k = 0
        for _ in range(n):
            clock.t += 60
            N.ventre, N.sucres = 30.0, 0
            N.donner(food)
            k += bool(N.dernier["rot"])
        return k / n
    b_far, b_pix, b_gro = await burps("farceur"), await burps("pixel"), await burps("grognon")
    check("farceur: he burps more often (farceur > Pixel > a serious one)", b_far > b_pix + 0.05 and b_pix > b_gro + 0.02, (b_far, b_pix, b_gro))

    await car(preset="gourmand", humeur_jour=True)
    today = caractere.today_traits(hub.s["caractere"])
    check("« Humeur du jour »: his belly follows the traits he lives by today",
          nourrir._traits(hub) == today and today != hub.s["caractere"]["traits"] and nourrir.trait(hub, "gourmand") == today["gourmand"], (nourrir._traits(hub), today))
    hub.s["caractere"] = {"traits": {"gourmand": "beaucoup"}, "humeur_jour": True}
    check("…and a strange character snapshot never stops his belly (50)", nourrir.trait(hub, "gourmand") == 50)
    hub.s.pop("caractere")
    check("…nor no character at all (50)", nourrir.trait(hub, "gourmand") == 50 and abs(N.rate() - 6.0) < 1e-9)


def main():
    with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b, tempfile.TemporaryDirectory() as c:
        asyncio.run(routing(Path(a)))
        asyncio.run(claude_side(Path(b)))
        asyncio.run(traits(Path(c)))
    print(f"\n{len(fails)} failure(s)")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
