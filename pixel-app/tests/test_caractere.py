"""Pixel's character, the server's side (pixel/caractere.py): presets, clamping, saving, the typed commands, Claude's tool and note.

    python3 tests/test_caractere.py        # the rules, then a demo server on port 8163 (temporary data folder), started twice
    CARACTERE_PY_PORT=8167 python3 tests/test_caractere.py     # another port for the demo server

The same rules in JavaScript (web/caractere.js, for Pixel Lab) are compared with node. What he does with his character on the
screens (persona.js: weights, sulks, cuddles, bubbles; the « Caractère » panel) is tested in a browser by tests/test_caractere.js.
"""
import asyncio
import importlib.machinery
import json
import os
import random
import re
import socket
import subprocess
import sys
import tempfile
import time
import types
from pathlib import Path

import aiohttp

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
from pixel import anims, caractere as C, commands, scenes  # noqa: E402
from pixel.claude import SYSTEM, TOOLS, Claude, check, system_for, system_text  # noqa: E402
from pixel.state import Hub  # noqa: E402

PORT = int(os.environ.get("CARACTERE_PY_PORT") or 8163)
fails = []


def ok(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


def run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def js_rules():
    """web/caractere.js's data and a few of its answers, through node."""
    code = r"""
const fs = require('fs'), vm = require('vm'), sb = { window: {}, console, Math, JSON, Object, Array, String, Number, Date, Set, Map };
sb.window = sb; vm.createContext(sb); vm.runInContext(fs.readFileSync(process.argv[1], 'utf8'), sb);
const K = sb.PixelCaractere, out = { TRAITS: K.TRAITS, ENDS: K.ENDS, PRESETS: K.PRESETS, KINDS: K.KINDS, ADJ: K.ADJ, DEFAULT: K.DEFAULT };
out.drift = ['2026-11-09', '2026-12-25', '2027-01-01'].map(d => K.TRAITS.map(t => K.drift(d, t)));
out.kind = [K.kind({ ...K.DEFAULT.traits, grognon: 90 }), K.kind({ ...K.DEFAULT.traits, bavard: 10 }), K.kind(K.DEFAULT.traits),
  K.kind({ ...K.DEFAULT.traits, calin: 70, grognon: 80 }, { ...K.DEFAULT.traits, grognon: 80 })];
out.clean = K.clean({ traits: { calin: 150, grognon: -4, bavard: 'x', foo: 3 }, nom: '  Bip<script> ', surnom: 'Max!!', calme: { de: 30, a: -2 }, boude: 'non', parle: false });
out.cmd = ['sois grognon', 'caractère câlin', 'plus câlin', 'un peu moins bavard', 'appelle-toi Bip', 'appelle-moi max', 'je m’appelle comment ?',
  'sois gentil et allume la lumière', 'tais-toi', 'caractère', 'caractère de cochon', 'deviens une pile électrique', 'oublie mon surnom'].map(t => K.command(t, { ...K.DEFAULT, surnom: 'Lou' }));
const said = JSON.parse(process.argv[2]);
out.phrases = said.map(([t, st]) => { const r = K.command(t, K.clean({ ...K.DEFAULT, ...st })); return !r ? 'claude' : r.toast ? (r.mood ? 'inconnu' : 'toast') : r.args; });
const g = K.apply(K.clean({}), { preset: 'grognon' })[0];
out.merge = [K.apply(g, { traits: { grognon: 'x', calin: 80 } })[0].traits, K.apply(g, { traits: { grognon: null, bavard: NaN, curieux: Infinity } })[1],
  K.apply(K.apply(g, { calme: { de: 21 } })[0], { calme: { de: 'x', a: null } })[1]];
out.notice = [K.notice({ nom: 'Bip' }, { what: 'parle', value: false }), K.notice({ nom: 'Bip' }, { what: 'parle', value: true }), K.notice({ nom: 'Bip' }, null)];
out.sur = [K.surMesure(K.clean({ traits: { calin: 55 } })), K.surMesure(K.clean({ traits: { studieux: 20 } })), K.surMesure(K.clean({ traits: { calin: 85 } }))];
out.names = JSON.parse(process.argv[3]).map(n => K.cleanName(n, 16));
console.log(JSON.stringify(out));
"""
    return json.loads(subprocess.check_output(["node", "-e", code, str(APP / "web" / "caractere.js"),
                                               json.dumps([[t, st] for t, st, _ in PHRASES], ensure_ascii=False), json.dumps(NAMES)], text=True))


# names typed with accents written apart, vowel signs, emoji, letters beyond 16 bits: the Pi and the screens must agree
NAMES = ["प्रिया", "Zoe\u0301", "Zoé", "שָׁלוֹם", "<b>Bip</b>\n", "_Lu_lu_", "Jean-Paul", "  .Max.  ", "😀Léo", "𝓐lice" + "x" * 30, "Ça\u200bva"]


# what the review found, typed: (text, his state, what must happen: the caractere.set arguments, "claude", or "toast" (the list))
PHRASES = [
    ("parle-moi", {}, "claude"), ("chut", {}, "claude"),
    ("tu peux parler", {}, "claude"), ("tu peux parler", {"parle": False}, {"parle": True}),     # he already speaks: Claude answers
    ("tais-toi", {}, {"parle": False}), ("tais-toi", {"parle": False}, "claude"),
    ("oublie mon surnom", {}, "claude"), ("oublie mon surnom", {"surnom": "Max"}, {"surnom": ""}),
    ("Tu t'appelles vraiment Pixel", {}, "claude"), ("tu t’appelles aussi Bip", {}, "claude"), ("je t'appelle maman", {}, "claude"),
    ("je t'appelle ce soir", {}, "claude"), ("tu t'appelles Bip", {}, {"nom": "Bip"}), ("appelle-toi Petit Bip", {}, {"nom": "Petit Bip"}),
    ("appelle-toi Pixel", {}, "claude"), ("appelle-toi Bip.", {}, {"nom": "Bip"}), ("je m'appelle vraiment Max", {}, "claude"),
    ("appelle-moi Max…", {}, {"surnom": "Max"}), ("sois grognon.", {}, {"preset": "grognon"}), ("caractère câlin !", {}, {"preset": "calin"}),
    ("caractère ?", {}, "toast"), ("Caractère.", {}, "toast"), ("caractère pirate", {}, "inconnu"),
]


def rules():
    named = [i for i in C.PRESETS if i != "surprise"]
    ok(f"at least 10 named presets ({len(named)}), plus « Surprise »", len(named) >= 10 and "surprise" in C.PRESETS)
    ok("every preset has a French name and a one-line description",
       all(n and d and d.endswith((".", "!")) and len(d) < 60 for n, d, _ in C.PRESETS.values()), str([d for _, d, _ in C.PRESETS.values() if len(d) >= 60]))
    ok("every named preset sets all 8 traits, from 0 to 100", all(set(t) == set(C.TRAITS) and all(0 <= v <= 100 for v in t.values())
                                                                 for i, (_, _, t) in C.PRESETS.items() if i != "surprise"))
    ok("« Pixel » is the Pixel of every day: every trait at 50", C.PRESETS["pixel"][2] == {t: 50 for t in C.TRAITS} and C.DEFAULT["traits"] == C.PRESETS["pixel"][2])
    for need in ("calin", "grognon", "farceur", "timide", "bavard", "paresseux", "pile", "gourmand", "prof", "reveur"):
        ok(f"preset {need} ({C.PRESETS.get(need, ('?',))[0]})", need in C.PRESETS)
    ok("each named preset leans to its own side (a grumpy one is grognon, a cuddly one calin...)",
       C.PRESETS["grognon"][2]["grognon"] >= 85 and C.PRESETS["calin"][2]["calin"] >= 85 and C.PRESETS["timide"][2]["bavard"] <= 20
       and C.PRESETS["paresseux"][2]["energique"] <= 15 and C.PRESETS["pile"][2]["energique"] >= 85 and C.PRESETS["gourmand"][2]["gourmand"] >= 85
       and C.PRESETS["prof"][2]["studieux"] >= 85)
    ok("every trait has its two French ends", set(C.ENDS) == set(C.TRAITS) and all(a and b for a, b in C.ENDS.values()))
    ok("every kind has a scene in web/scenes/caractere.js", all(k in (APP / "web" / "scenes" / "caractere.js").read_text() for k in C.KINDS.values()))

    # clean: anything -> a valid character
    ok("clean(garbage) gives the defaults", C.clean(None) == C.DEFAULT and C.clean("x") == C.DEFAULT and C.clean({"traits": "x", "calme": 3}) == C.DEFAULT)
    c = C.clean({"traits": {"calin": 150, "grognon": -4, "bavard": "x", "farceur": 61.6, "curieux": True, "foo": 3}, "nom": "  Bip<script> ",
                 "surnom": "Max!!", "calme": {"de": 30, "a": -2}, "boude": "non", "parle": False, "preset": "pirate"})
    ok("traits clamped to 0..100, rounded, bad ones kept at 50, unknown ones dropped",
       c["traits"]["calin"] == 100 and c["traits"]["grognon"] == 0 and c["traits"]["bavard"] == 50 and c["traits"]["farceur"] == 62
       and c["traits"]["curieux"] == 50 and "foo" not in c["traits"], str(c["traits"]))
    ok("names cleaned (letters, digits, spaces, - ' .), quiet hours clamped, bad booleans and presets ignored",
       c["nom"] == "Bipscript" and c["surnom"] == "Max" and c["calme"] == {"de": 23, "a": 0} and c["boude"] is True and c["parle"] is False
       and c["preset"] == "pixel", json.dumps(c, ensure_ascii=False))
    ok("an empty or too long name: Pixel, or cut at 16", C.clean({"nom": "   "})["nom"] == "Pixel" and C.clean({"nom": "Abcdefghijklmnopqrstu"})["nom"] == "Abcdefghijklmnop")
    c = C.clean(json.loads('{"traits": {"calin": 1e400, "grognon": -1e400, "bavard": NaN, "farceur": Infinity, "curieux": 70}, "calme": {"de": -Infinity}}'))
    ok("infinite numbers (1e400, Infinity, NaN, as json reads them): ignored, no OverflowError",
       c["traits"]["calin"] == 50 and c["traits"]["grognon"] == 50 and c["traits"]["bavard"] == 50 and c["traits"]["farceur"] == 50
       and c["traits"]["curieux"] == 70 and c["calme"]["de"] == 23 and C.clean({"traits": {"calin": 10 ** 400}})["traits"]["calin"] == 100, str(c))

    # apply: what caractere.set does
    base = C.clean({})
    n, ch = C.apply(base, {"preset": "grognon"})
    ok("a preset sets its traits; his reaction: kind grognon", n["traits"] == C.PRESETS["grognon"][2] and n["preset"] == "grognon" and ch["kind"] == "grognon" and ch["quoi"] == "preset")
    n2, ch2 = C.apply(n, {"preset": "grognon"})
    ok("the same preset again is still news (he shows it again)", ch2 is not None and ch2["kind"] == "grognon")
    n, ch = C.apply(base, {"traits": {"calin": 80}})
    ok("one slider: the trait moves, « Sur mesure », the reaction shows which way it moved", n["traits"]["calin"] == 80 and n["preset"] == "perso" and ch["kind"] == "calin")
    n, ch = C.apply(n, {"traits": {"calin": 60}})
    ok("…back down: the other way (indépendant)", ch["kind"] == "independant")
    n, ch = C.apply(base, {"traits": {t: 50 for t in C.TRAITS}})
    ok("nothing moved: no news", ch is None and n == base)
    n, ch = C.apply(base, {"traits": dict(C.PRESETS["timide"][2])})
    ok("sliders that land on a preset: that preset", n["preset"] == "timide")
    rs = [C.apply(base, {"preset": "surprise"}, random.Random(i))[0]["traits"] for i in range(40)]
    ok("« Surprise »: a different character each time, two or three strong traits, never all at 50",
       len({json.dumps(r, sort_keys=True) for r in rs}) > 30 and all(2 <= sum(abs(v - 50) >= 30 for v in r.values()) <= 3 for r in rs))
    n, ch = C.apply(base, {"preset": "surprise"}, random.Random(3))
    ok("…and he says what he became", ch["kind"] == "surprise" and ch["adj"] in C.ADJ.values() and ch["adj"] != C.ADJ["pixel"], str(ch))
    n, ch = C.apply(base, {"nom": "Bip"})
    ok("his name: kind nom", n["nom"] == "Bip" and ch["kind"] == "nom")
    n, ch = C.apply(n, {"nom": ""})
    ok("an empty name is Pixel again", n["nom"] == "Pixel" and ch["kind"] == "nom")
    n, ch = C.apply(base, {"nom": 42})
    ok("a name that is not text is ignored (not reset)", ch is None and n["nom"] == "Pixel")
    n, ch = C.apply(base, {"surnom": "Max"})
    ok("your nickname: kind surnom", n["surnom"] == "Max" and ch["kind"] == "surnom")
    n, ch = C.apply(base, {"boude": False})
    ok("may he sulk: a little « c’est noté » (reglage)", n["boude"] is False and ch["kind"] == "reglage" and ch["what"] == "boude" and ch["value"] is False)
    n, ch = C.apply(base, {"calme": {"de": 21}})
    ok("quiet hours: merged, clamped", n["calme"] == {"de": 21, "a": 6} and ch["what"] == "calme")
    n, ch = C.apply(base, {"preset": "calin", "nom": "Bip"})
    ok("a preset and a name at once: he shows the preset, the name is kept", n["nom"] == "Bip" and ch["kind"] == "calin")
    g = C.apply(base, {"preset": "grognon"})[0]
    n, ch = C.apply(g, {"traits": {"grognon": "x", "calin": 80}})
    ok("a bad value for one trait leaves it as it was (not 50); the good one moves", n["traits"]["grognon"] == 92 and n["traits"]["calin"] == 80 and ch["kind"] == "calin", str(n["traits"]))
    n, ch = C.apply(g, {"traits": {"grognon": None, "bavard": float("nan"), "curieux": float("inf")}})
    ok("…only bad values: no change, no reaction", ch is None and n == g)
    q = C.apply(g, {"calme": {"de": 21}})[0]
    n, ch = C.apply(q, {"calme": {"de": "x", "a": None}})
    ok("…the same for the quiet hours", ch is None and n["calme"] == {"de": 21, "a": 6})
    ok("« tais-toi »: a toast says how to hear him again", "tu peux parler" in C.notice({"nom": "Bip"}, {"what": "parle", "value": False})
       and C.notice({"nom": "Bip"}, {"what": "parle", "value": True}) == "" and C.notice({}, None) == "")

    # kinds, the mood of the day
    t50 = dict(C.DEFAULT["traits"])
    ok("kind: the trait furthest from 50 and its side; nearly 50: pixel",
       C.kind({**t50, "grognon": 90}) == "grognon" and C.kind({**t50, "bavard": 10}) == "timide" and C.kind({**t50, "calin": 55}) == "pixel")
    d = [C.drift("2026-11-09", t) for t in C.TRAITS]
    ok("the mood of the day: a small drift (-10..10), the same all day, another one the next day",
       all(-10 <= v <= 10 for v in d) and d == [C.drift("2026-11-09", t) for t in C.TRAITS] and d != [C.drift("2026-11-10", t) for t in C.TRAITS], str(d))
    car = C.clean({"humeur_jour": True})
    ok("…only when it is on", C.today_traits(C.clean({})) == t50 and C.today_traits(car, "2026-11-09") == {t: 50 + C.drift("2026-11-09", t) for t in C.TRAITS})

    # Claude: the note and the tool
    ok("Claude: no note for the Pixel of every day", C.describe(C.clean({})) == "" and C.describe(None) == "")
    note = C.describe(C.apply(C.apply(base, {"preset": "grognon", "nom": "Bip"})[0], {"surnom": "Max"})[0])
    ok("Claude's note: his character, « râleur mais gentil », his name, what he calls you",
       "Grognon" in note and "râleur mais gentil" in note and "Bip" in note and "« Max »" in note, note)
    ok("tool input checks", C.tool_ok({"preset": "calin"}) and C.tool_ok({"traits": {"bavard": 90}, "nom": "Bip"}) and not C.tool_ok({})
       and not C.tool_ok({"preset": "pirate"}) and not C.tool_ok({"traits": {"bavard": 120}}) and not C.tool_ok({"traits": {"foo": 3}})
       and not C.tool_ok({"nom": 3}) and not C.tool_ok({"couleur": "rouge"}))
    tool = next((t for t in TOOLS if t["name"] == "set_character"), None)
    ok("Claude has a set_character tool, with every preset and trait",
       tool and tool["input_schema"]["properties"]["preset"]["enum"] == list(C.PRESETS) and set(tool["input_schema"]["properties"]["traits"]["properties"]) == set(C.TRAITS)
       and tool.get("eager_input_streaming") and check("set_character", {"preset": "zen"}) is None and check("set_character", {"preset": "x"}))
    words = lambda own: {k for i, label, _ in scenes.SCENES if i.startswith("caractere-") == own  # noqa: E731
                         for w in (i, i.replace("-", " "), label) for k in (anims.key(w), scenes._bare(anims.key(w)))}
    ok("his scenes' labels name no other pack's scene (scenes.py keeps the first, and his pack comes first)", not (words(True) & words(False)), str(words(True) & words(False)))
    ok("…so « fais c'est noté » plays taf-act-agenda again (travail.js)", scenes.find("c'est noté") == "taf-act-agenda", scenes.find("c'est noté"))
    ok("Claude's play_scene does not offer his reactions to a change (they need a reason)",
       not [i for i in next(t for t in TOOLS if t["name"] == "play_scene")["input_schema"]["properties"]["scene"]["enum"] if scenes.BY_ID[i][1] == "evt" and i.startswith("caractere-")])

    # the same rules in JavaScript (web/caractere.js), for Pixel Lab
    J = js_rules()
    ok("web/caractere.js: the same traits, ends and presets",
       J["TRAITS"] == list(C.TRAITS) and J["ENDS"] == {k: list(v) for k, v in C.ENDS.items()}
       and [[p["id"], p["name"], p["desc"], p["traits"]] for p in J["PRESETS"]] == [[i, n, d, t] for i, (n, d, t) in C.PRESETS.items()])
    ok("web/caractere.js: the same kinds, adjectives and defaults",
       J["KINDS"] == {f"{t}{'+' if s > 0 else '-'}": k for (t, s), k in C.KINDS.items()} and J["ADJ"] == C.ADJ and J["DEFAULT"] == C.DEFAULT)
    ok("web/caractere.js: the same mood of the day (the screens and Claude agree)",
       J["drift"] == [[C.drift(d, t) for t in C.TRAITS] for d in ("2026-11-09", "2026-12-25", "2027-01-01")])
    ok("web/caractere.js: the same merge of bad values (left as they were), the same toast",
       J["merge"][0] == C.apply(C.apply(C.clean({}), {"preset": "grognon"})[0], {"traits": {"grognon": "x", "calin": 80}})[0]["traits"]
       and J["merge"][1] is None and J["merge"][2] is None
       and J["notice"] == [C.notice({"nom": "Bip"}, {"what": "parle", "value": False}), "", ""], json.dumps(J["notice"], ensure_ascii=False))
    ok(f"« Sur mesure » in plain French: {' / '.join(J['sur'])}", J["sur"] == ["Un caractère à toi, presque le Pixel de tous les jours.",
                                                                         "Un caractère à toi, plutôt peu scolaire.", "Un caractère à toi, plutôt câlin."])
    ok("web/caractere.js: the same kinds and cleaning", J["kind"] == [C.kind({**t50, "grognon": 90}), C.kind({**t50, "bavard": 10}), C.kind(t50),
                                                                    C.kind({**t50, "calin": 70, "grognon": 80}, {**t50, "grognon": 80})]
       and J["clean"] == C.clean({"traits": {"calin": 150, "grognon": -4, "bavard": "x", "foo": 3}, "nom": "  Bip<script> ", "surnom": "Max!!",
                                  "calme": {"de": 30, "a": -2}, "boude": "non", "parle": False}), json.dumps(J["clean"], ensure_ascii=False))
    names = [C.clean_name(n, 16) for n in NAMES]
    ok("names: the same on the Pi and the screens, accents and vowel signs kept (« प्रिया », « Zoé » typed as e + ´), at most 16 letters",
       J["names"] == names and names[0] == "प्रिया" and names[1] == names[2] == "Zoé" and names[4] == "bBipb" and names[8] == "Léo" and len(names[9]) == 16,
       json.dumps([names, J["names"]], ensure_ascii=False))
    return J


class Rec:
    """A hub with the real character actions, and every other action only recorded (to see what a command does)."""
    def __init__(self, datadir):
        self.hub = Hub({}, demo=True)
        self.hub.s["lights"]["rooms"] = [{"id": "0", "name": "Salon", "on": True, "bri": 80}]
        self.calls = []
        for name in ("chat.ask", "chat.clear", "screen.show", "timer.start", "timer.toggle", "lights.set", "lights.scene", "theme.set", "theme.step",
                     "mood.set", "face.set", "scene.play", "anim.play", "codex.run"):
            self.hub.actions[name] = self._rec(name)
        C.setup(self.hub, datadir)

    def _rec(self, name):
        async def fn(**a):
            self.calls.append((name, a))
        return fn

    def cmd(self, text):
        self.calls = []
        run(commands.run(self.hub, text))
        return self.calls


def commands_and_saving(J):
    C.NOTICE_AFTER = 0                               # the toast at once here (its delay: notice_later())
    tmp = Path(tempfile.mkdtemp())
    R = Rec(tmp)
    s = R.hub.s["caractere"]
    ok("no file yet: the Pixel of every day, in the snapshot under « caractere »", {k: s[k] for k in C.SAVED} == C.DEFAULT and s["change"] is None)
    R.cmd("sois grognon")
    ok("« sois grognon »", s["preset"] == "grognon" and s["change"]["kind"] == "grognon" and R.hub.s["screen"] == "visage")
    R.cmd("caractère câlin")
    ok("« caractère câlin »", s["preset"] == "calin")
    R.cmd("Caractère surprise !")
    ok("« caractère surprise »", s["preset"] == "surprise" and s["change"]["kind"] == "surprise" and s["traits"] != C.DEFAULT["traits"])
    R.cmd("caractère normal")
    ok("« caractère normal »: back to Pixel", s["preset"] == "pixel" and s["traits"] == C.DEFAULT["traits"])
    R.cmd("plus câlin")
    ok("« plus câlin »: +20, he shows that side", s["traits"]["calin"] == 70 and s["change"]["kind"] == "calin")
    R.cmd("un peu moins bavard")
    ok("« un peu moins bavard »: -10, he shows the quiet side", s["traits"]["bavard"] == 40 and s["change"]["kind"] == "timide")
    for _ in range(3):
        R.cmd("plus câlin")
    ok("…up to 100 at most, and he still shows it", s["traits"]["calin"] == 100 and s["change"]["kind"] == "calin")
    R.cmd("deviens une pile électrique")
    ok("« deviens une pile électrique »", s["preset"] == "pile")
    R.cmd("Appelle-toi Bip")
    ok("« appelle-toi Bip »", s["nom"] == "Bip" and s["change"]["kind"] == "nom")
    R.cmd("appelle-moi max")
    ok("« appelle-moi max »: Max, with a capital", s["surnom"] == "Max" and s["change"]["kind"] == "surnom")
    R.cmd("tais-toi")
    ok("« tais-toi »: no more bubbles", s["parle"] is False)
    R.cmd("tu peux parler")
    ok("« tu peux parler »", s["parle"] is True)
    R.cmd("oublie mon surnom")
    ok("« oublie mon surnom »", s["surnom"] == "")
    calls = R.cmd("caractère")
    ok("« caractère »: the list of presets on the screen", R.hub.s["toast"] and "Grognon" in R.hub.s["toast"]["msg"] and not calls)
    real = R.hub.actions["caractere.set"]

    async def spy(**a):
        R.calls.append(("caractere.set", a))
        await real(**a)
    R.hub.actions["caractere.set"] = spy
    for text, state, want in PHRASES:
        run(R.hub.dispatch("caractere.reset"))
        s.update(state)
        R.hub.s["toast"] = None
        calls = R.cmd(text)
        toast = (R.hub.s["toast"] or {}).get("msg", "")
        got = ("claude" if calls == [("chat.ask", {"text": text})] else calls[0][1] if len(calls) == 1 and calls[0][0] == "caractere.set"
               else ("inconnu" if "Je ne connais pas" in toast else "toast") if not calls and "Les caractères" in toast else calls)
        ok(f"« {text} »{' (' + json.dumps(state, ensure_ascii=False) + ')' if state else ''}: {want if isinstance(want, str) else 'caractere.set ' + json.dumps(want, ensure_ascii=False)}",
           got == want, str(got))
    ok("the lab (web/caractere.js) answers them the same", J["phrases"] == [w for _, _, w in PHRASES],
       str([(t, j) for (t, _, w), j in zip(PHRASES, J["phrases"]) if j != w]))
    run(R.hub.dispatch("caractere.reset"))
    R.cmd("tais-toi")
    ok("« tais-toi »: the toast says how to hear him again", "tu peux parler" in (R.hub.s["toast"] or {}).get("msg", ""), str(R.hub.s["toast"]))
    R.hub.actions["caractere.set"] = real
    run(R.hub.dispatch("caractere.reset"))
    for text in ("sois gentil et allume la lumière", "je m'appelle comment ?", "appelle-moi demain", "appelle-moi quand tu peux", "caractère de cochon",
                 "plus de lumière", "tu t'appelles comment ?", "sois sympa"):
        ok(f"« {text} » goes to Claude", R.cmd(text) == [("chat.ask", {"text": text})], str(R.calls))
    for text, action in (("fais le poisson", "scene.play"), ("salon 40", "lights.set"), ("thème néon", "theme.set"), ("minuteur 10", "timer.start"),
                         ("humeur triste", "mood.set"), ("anim danse", "anim.play"), ("visage vivant", "face.set"), ("météo", "screen.show")):
        ok(f"« {text} » still does what it did ({action})", action in [c[0] for c in R.cmd(text)], str(R.calls))
    ok("the commands in web/caractere.js (the lab) answer the same", [x and (x.get("action"), x.get("args")) for x in J["cmd"]] == [
        ("caractere.set", {"preset": "grognon"}), ("caractere.set", {"preset": "calin"}), ("caractere.ajuste", {"trait": "calin", "d": 20}),
        ("caractere.ajuste", {"trait": "bavard", "d": -10}), ("caractere.set", {"nom": "Bip"}), ("caractere.set", {"surnom": "Max"}), None, None,
        ("caractere.set", {"parle": False}), (None, None), None, ("caractere.set", {"preset": "pile"}), ("caractere.set", {"surnom": ""})], json.dumps(J["cmd"], ensure_ascii=False))
    run(R.hub.dispatch("caractere.set", {"traits": {"calin": float("inf"), "bavard": float("nan")}}))
    ok("caractere.set with Infinity or NaN through the hub: no change, no error", s["traits"]["calin"] == 50 and s["traits"]["bavard"] == 50
       and "ERREUR" not in (R.hub.s["toast"] or {}).get("msg", ""), str(R.hub.s["toast"]))

    # saving
    saved = json.loads((tmp / "caractere.json").read_text())
    ok("saved in caractere.json (his character, not the screens' news)", saved == {k: s[k] for k in C.SAVED} and "change" not in saved)
    R2 = Rec(tmp)
    ok("…and read back by a new server", {k: R2.hub.s["caractere"][k] for k in C.SAVED} == {k: s[k] for k in C.SAVED} and R2.hub.s["caractere"]["change"] is None)
    (tmp / "caractere.json").write_text("{pas du json")
    broken = Rec(tmp).hub.s["caractere"]
    ok("a broken file: the Pixel of every day, no crash", {k: broken[k] for k in C.SAVED} == C.DEFAULT)
    (tmp / "caractere.json").write_text(json.dumps({"traits": {"calin": 999, "grognon": "x"}, "nom": 7, "parle": "oui", "calme": {"de": 22}}))
    r = Rec(tmp).hub.s["caractere"]
    ok("a file with bad fields: only those get their defaults", r["traits"]["calin"] == 100 and r["traits"]["grognon"] == 50 and r["nom"] == "Pixel"
       and r["parle"] is True and r["calme"] == {"de": 22, "a": 6})
    for bad in ('{"traits": {"calin": 1e400, "grognon": Infinity, "bavard": 80}}', "[" * 200000):
        (tmp / "caractere.json").write_text(bad)
        try:
            r, err = Rec(tmp).hub.s["caractere"], ""
        except Exception as e:                       # before the fix: OverflowError, RecursionError, and the server did not start
            r, err = None, repr(e)[:80]
        ok(f"a file with {'1e400 and Infinity' if bad.startswith('{') else 'a JSON bomb'}: the server still starts",
           r is not None and r["traits"]["calin"] == 50 and r["traits"]["bavard"] == (80 if bad.startswith("{") else 50), err)
    run(R.hub.dispatch("caractere.reset"))
    ok("caractere.reset: everything back, his reaction « pixel »", {k: s[k] for k in C.SAVED} == C.DEFAULT and s["change"]["kind"] == "pixel")
    t0 = time.time() * 1000
    run(R.hub.dispatch("caractere.essai"))
    ok("caractere.essai: a stamp for the screens, on his face", s["essai"] >= t0 and R.hub.s["screen"] == "visage")
    run(R.hub.dispatch("caractere.ajuste", {"trait": "pirate", "d": 20}))
    run(R.hub.dispatch("caractere.set", {"traits": "beaucoup"}))
    ok("bad arguments change nothing", {k: s[k] for k in C.SAVED} == C.DEFAULT)

    # Claude
    hub = R.hub
    ok("Claude's system prompt: exactly SYSTEM for the Pixel of every day", system_for(hub) == SYSTEM and system_text(hub) == SYSTEM)
    claude = Claude(hub, {})
    out = run(claude.run_tool("set_character", {"preset": "farceur", "surnom": "Léa"}))
    ok("Claude's tool changes his character", s["preset"] == "farceur" and s["surnom"] == "Léa" and "Farceur" in out, out)
    sp = system_for(hub)
    ok("…and then his character is a block of its own, after the unchanged SYSTEM (the cached prefix)",
       isinstance(sp, list) and sp[0] == {"type": "text", "text": SYSTEM} and "Farceur" in sp[1]["text"] and "Léa" in sp[1]["text"]
       and system_text(hub).startswith(SYSTEM + "\n"))
    ok("…and Claude knows nothing of it without the feature", system_for(Hub({}, demo=True)) == SYSTEM)


def notice_later():
    """« tais-toi »: the toast comes after his own « Chut… je me tais. », and not at all if he may speak again by then."""
    async def go():
        C.NOTICE_AFTER = 0.3
        hub = Hub({}, demo=True)
        C.setup(hub, tempfile.mkdtemp())
        await hub.dispatch("caractere.set", {"parle": False})
        now = hub.s["toast"]
        await asyncio.sleep(0.45)
        later = (hub.s["toast"] or {}).get("msg", "")
        ok("« tais-toi »: the toast waits for the end of his own line", now is None and "tu peux parler" in later, f"{now} / {later}")
        hub.s["toast"] = None
        await hub.dispatch("caractere.set", {"parle": True})
        await hub.dispatch("caractere.set", {"parle": False})
        await hub.dispatch("caractere.set", {"parle": True})
        await asyncio.sleep(0.45)
        ok("…and does not come if he may speak again by then", hub.s["toast"] is None, str(hub.s["toast"]))
    asyncio.new_event_loop().run_until_complete(go())
    C.NOTICE_AFTER = 3.6


def subscription():
    """With the Claude subscription (abonnement.py, a fake Claude Agent SDK): a change of character keeps the conversation."""
    clients = []
    Said = type("AssistantMessage", (types.SimpleNamespace,), {})

    class Client:
        def __init__(self, options):
            self.options, self.prompts, self.closed = options, [], False
            clients.append(self)

        async def connect(self):
            pass

        async def disconnect(self):
            self.closed = True

        async def query(self, prompt):
            self.prompts.append(prompt)

        async def receive_response(self):
            yield Said(content=[types.SimpleNamespace(text="D'accord !")], error=None, message_id=f"m{len(self.prompts)}")

    sdk = types.ModuleType("claude_agent_sdk")
    sdk.__spec__ = importlib.machinery.ModuleSpec("claude_agent_sdk", None)
    sdk.tool = lambda name, desc, schema: (lambda fn: types.SimpleNamespace(name=name, handler=fn))
    sdk.create_sdk_mcp_server = lambda name, version="1.0.0", tools=None: {"type": "sdk", "name": name, "tools": tools}
    sdk.ClaudeAgentOptions = lambda **kw: types.SimpleNamespace(**kw)
    sdk.ClaudeSDKClient = Client
    before = sys.modules.get("claude_agent_sdk")
    sys.modules["claude_agent_sdk"] = sdk
    try:
        from pixel import abonnement
        hub = Hub({}, demo=True)
        C.setup(hub, tempfile.mkdtemp())
        claude = Claude(hub, {})
        claude.sub = abonnement.Abonnement(claude, {})
        loop = asyncio.new_event_loop()
        loop.run_until_complete(claude.send("coucou"))
        loop.run_until_complete(hub.dispatch("caractere.set", {"preset": "grognon", "surnom": "Max"}))
        loop.run_until_complete(claude.send("ça va ?"))
        p = clients[0].prompts
        ok("Claude subscription: a new character keeps the conversation (the same client, not closed)", len(clients) == 1 and not clients[0].closed, str(len(clients)))
        ok("…and Claude hears it at the start of the next message", len(p) == 2 and p[1].startswith("[Ton caractère vient de changer.") and "Grognon" in p[1]
           and "« Max »" in p[1] and p[1].endswith("\n\nça va ?"), p[-1][:160])
        loop.run_until_complete(claude.send("et alors ?"))
        ok("…only once", p[2] == "et alors ?", p[2][:80])
        loop.run_until_complete(claude.run_tool("set_character", {"preset": "calin"}))        # the change Claude makes himself
        loop.run_until_complete(claude.send("tu es comment ?"))
        ok("…the change Claude made himself too: no new conversation", len(clients) == 1 and "Câlin" in p[3], p[3][:120])
        loop.run_until_complete(hub.dispatch("caractere.reset"))
        loop.run_until_complete(claude.send("et maintenant ?"))
        ok("…and back to the Pixel of every day", len(clients) == 1 and "caractère habituel" in p[4], p[4][:120])
        loop.close()
    finally:
        if before is None:
            sys.modules.pop("claude_agent_sdk", None)
        else:
            sys.modules["claude_agent_sdk"] = before


def start_server(port, datadir):
    try:
        socket.create_connection(("127.0.0.1", port), 0.2).close()
        raise SystemExit(f"le port {port} est déjà pris")
    except OSError:
        pass
    cfg = Path(datadir) / "config.toml"
    cfg.write_text(f'data_dir = "{datadir}"\n')
    p = subprocess.Popen([sys.executable, str(APP / "server.py"), "--demo", "--port", str(port), "--host", "127.0.0.1", "--config", str(cfg)],
                         cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(100):
        try:
            socket.create_connection(("127.0.0.1", port), 0.2).close()
            return p
        except OSError:
            time.sleep(0.1)
    p.kill()
    raise SystemExit(f"le serveur de démo ne démarre pas sur le port {port}")


async def through_the_server(first):
    async with aiohttp.ClientSession() as http:
        async with http.ws_connect(f"http://127.0.0.1:{PORT}/ws") as ws:
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

            await pump(0.5)
            c = lambda: state["caractere"]  # noqa: E731
            if first:
                ok("the server's snapshot: « caractere », the Pixel of every day", {k: c()[k] for k in C.SAVED} == C.DEFAULT, str(c()))
                await act("screen.show", screen="meteo")
                await act("caractere.set", preset="grognon")
                ok("caractere.set through the WebSocket: grumpy, and his face comes up to show it",
                   c()["preset"] == "grognon" and c()["change"]["kind"] == "grognon" and state["screen"] == "visage")
                await act("cmd", text="appelle-toi Bip")
                await act("cmd", text="plus gourmand")
                ok("typed commands reach him", c()["nom"] == "Bip" and c()["traits"]["gourmand"] == 70)
            else:
                ok("after a restart: still grumpy, still Bip", c()["preset"] == "perso" and c()["traits"]["grognon"] == 92 and c()["nom"] == "Bip"
                   and c()["traits"]["gourmand"] == 70 and c()["change"] is None, str(c()))


if __name__ == "__main__":
    J = rules()
    commands_and_saving(J)
    notice_later()
    subscription()
    with tempfile.TemporaryDirectory() as tmp:
        for first in (True, False):
            srv = start_server(PORT, tmp)
            try:
                asyncio.run(through_the_server(first))
            finally:
                srv.terminate()
                srv.wait()
    print("\n%d failure(s)" % len(fails))
    sys.exit(1 if fails else 0)
