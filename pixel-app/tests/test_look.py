"""His look (« Son look »), the server's side (pixel/look.py): the catalogue, cleaning, the changes (look.set and its friends),
the seasons and the night with a fixed clock, saving (look.json, « Remettre comme avant »), the typed commands, Claude's
set_look tool and what get_status says.

    python3 tests/test_look.py        # the rules, then a demo server on port 8406 (a temporary data folder), started twice
    LOOK_PY_PORT=8407 python3 tests/test_look.py      # another port for the demo server

The same rules in JavaScript (web/look.js: Pixel Lab, Pixel sans Pi, the screens) are compared with node, case by case.
How he looks in the six themes, the panel, the lab: tests/test_look.js (Chromium).
"""
import asyncio
import datetime as dt
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
from pixel import anims, caractere, commands, exos, look as L, nourrir, scenes  # noqa: E402
from pixel.claude import TOOLS, Claude, check  # noqa: E402
from pixel.state import Hub  # noqa: E402

PORT = int(os.environ.get("LOOK_PY_PORT") or 8406)
fails = []
D = dt.datetime
FIX = D(2026, 11, 9, 14, 0)                          # a Monday afternoon in November: no season, not the night
TODAY = "2026-11-09"
REAL = L._ymd(dt.datetime.now())                     # the typed commands read the real clock
EMPTY = {s: None for s in L.SLOTS}


def ok(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


def run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


# ---- the cases both sides answer (look.py here, web/look.js through node) ----
CLEAN = [None, "x", [1, 2], {"accessoires": "x", "sans": 3}, {"yeux": ["rond"], "couleur_yeux": {"a": 1}, "couleur_joues": [1]},
         {"yeux": "laser", "couleur_yeux": "arc", "couleur_joues": "arc", "mono": "oui", "saisons": 0, "nuit": False,
          "accessoires": {"tete": "moustache", "cou": "noeud", "visage": ["moustache"], "pieds": "chaussettes", "oreilles": 7},
          "sans": {"tete": TODAY, "cou": "demain", "yeux": 20261109, "nez": TODAY}, "porte": {"tete": "x"}, "x": 1},
         {"yeux": "chat", "couleur_yeux": "vert", "couleur_joues": "rose", "mono": True, "accessoires": {"tete": "couronne", "yeux": "lunettes-soleil"}}]
B = L.clean({})
DRESSED = L.clean({"yeux": "etoile", "couleur_yeux": "violet", "saisons": False, "accessoires": {"tete": "chapeau", "cou": "noeud", "visage": "moustache"}})
GLASSES = L.clean({"yeux": "lunettes"})
APPLY = [
    [B, {"porte": "chapeau"}, TODAY], [L.clean({"accessoires": {"tete": "chapeau"}}), {"porte": "chapeau"}, TODAY],
    [L.clean({"accessoires": {"tete": "chapeau"}}), {"porte": "couronne"}, TODAY], [L.clean({"accessoires": {"tete": "chapeau"}}), {"enleve": "chapeau"}, TODAY],
    [B, {"porte": ["noeud", "moustache", "casque"]}, TODAY], [DRESSED, {"enleve": "tout"}, TODAY], [B, {"enleve": "tout"}, TODAY],
    [L.clean({"sans": {"tete": "2026-11-08"}}), {"porte": "noeud"}, TODAY], [B, {"yeux": "lunettes"}, TODAY],
    [GLASSES, {"porte": "lunettes-soleil"}, TODAY], [L.clean({"accessoires": {"yeux": "lunettes-soleil"}}), {"yeux": "lunettes"}, TODAY],
    [GLASSES, {"enleve": "lunettes"}, TODAY], [B, {"enleve": "lunettes"}, TODAY], [GLASSES, {"enleve": "tout"}, TODAY],
    [B, {"couleur_yeux": "arc"}, TODAY], [B, {"couleur_joues": "arc"}, TODAY], [B, {"couleur_joues": "rose", "couleur_yeux": "bleu"}, TODAY],
    [DRESSED, {"normal": True}, TODAY], [B, {"normal": True}, TODAY], [B, {"tenue": "nuit"}, TODAY], [B, {"tenue": "chic"}, TODAY],
    [B, {"saisons": False}, TODAY], [B, {"saisons": "non"}, TODAY], [B, {"mono": True, "nuit": False}, TODAY],
    [B, {"porte": 3}, TODAY], [B, {"porte": ["x" * 300]}, TODAY], [B, {"yeux": 42}, TODAY], [B, {"enleve": {"a": 1}}, TODAY],
    [B, {"tenue": ["hiver"]}, TODAY], [B, {"normal": "oui"}, TODAY], [B, {"couleur_yeux": None}, TODAY], [B, {}, TODAY],
    [L.clean({"accessoires": {"tete": "chapeau"}}), {"enleve": [1, None, "chapeau"]}, TODAY], [B, {"enleve": "cou"}, TODAY],
    [B, {"porte": "chapeau", "yeux": "chat", "couleur_yeux": "bleu"}, TODAY], [B, {"yeux": "chat", "couleur_yeux": "bleu"}, TODAY],
    [L.clean({"accessoires": {"tete": "bonnet"}}), {"tenue": "hiver"}, TODAY], [L.clean({"sans": {"tete": TODAY}}), {"tenue": "noel"}, TODAY],
    [B, {"porte": ["chapeau", "couronne", "fete"]}, TODAY],
]
SEASON = [[(2026, 10, 23, 12), None, None], [(2026, 10, 24, 12), None, None], [(2026, 10, 25, 12), None, None], [(2026, 10, 31, 23), None, None],
          [(2026, 11, 1, 12), None, None], [(2026, 12, 19, 12), None, None], [(2026, 12, 20, 0), None, None], [(2026, 12, 24, 20), None, None],
          [(2026, 12, 27, 12), None, None], [(2026, 12, 31, 23), None, None], [(2027, 1, 1, 0), None, None], [(2027, 1, 2, 12), None, None],
          [(2027, 2, 28, 12), None, None], [(2027, 3, 1, 12), None, None], [(2026, 7, 14, 15), None, None], [(2026, 8, 1, 22), None, None],
          [(2026, 7, 14, 8), None, None], [(2026, 5, 20, 13), {"now": {"kind": "soleil", "t": 27}, "days": []}, None],
          [(2026, 5, 20, 13), {"now": {"kind": "nuage", "t": 30}}, None], [(2026, 5, 20, 13), {"now": {"kind": "soleil", "t": 20}, "days": [{"tmax": 26}]}, None],
          [(2026, 5, 20, 13), {"now": {"kind": "soleil", "t": 20}}, None], [(2026, 5, 20, 21), {"now": {"kind": "soleil", "t": 30}}, None],
          [(2026, 12, 24, 12), None, "anniversaire"], [(2026, 6, 3, 12), None, "rencontre"], [(2026, 6, 3, 12), None, "x"], [(2026, 6, 3, 12), "pluie", ["x"]]]
RESOLVE = [[B, (2026, 12, 24, 12), {}], [L.clean({"accessoires": {"tete": "chapeau"}}), (2026, 12, 24, 12), {}],
           [L.clean({"sans": {"tete": "2026-12-24"}}), (2026, 12, 24, 12), {}], [L.clean({"sans": {"tete": "2026-12-23"}}), (2026, 12, 24, 12), {}],
           [L.clean({"saisons": False}), (2026, 12, 24, 12), {}], [GLASSES, (2026, 7, 14, 15), {}], [B, (2026, 7, 14, 15), {}],
           [L.clean({"accessoires": {"tete": "couronne", "oreilles": "casque", "visage": "moustache"}}), (2026, 11, 9, 3), {"dort": True}],
           [L.clean({"nuit": False}), (2026, 11, 9, 3), {"dort": True}], [B, (2026, 11, 9, 3), {"dort": False}], [B, (2026, 11, 9, 12), {"dort": True}],
           [B, (2026, 11, 9, 23), {}], [B, (2026, 11, 9, 5), {}], [B, (2026, 11, 9, 22), {}], [B, (2026, 11, 9, 6), {}],
           [B, (2026, 12, 25, 2), {}], [L.clean({"accessoires": {"yeux": "lunettes-soleil"}}), (2026, 8, 2, 23), {}],
           [B, (2026, 11, 9, 14), {"fete": "anniversaire"}], [L.clean({"accessoires": {"tete": "couronne"}}), (2026, 11, 9, 14), {"fete": "anniversaire"}],
           [B, (2026, 5, 20, 13), {"meteo": {"now": {"kind": "soleil", "t": 31}}}]]
NIGHT = [[(2026, 11, 9, 21), None, {"de": 21, "a": 7}], [(2026, 11, 9, 7), None, {"de": 21, "a": 7}], [(2026, 11, 9, 3), None, {"de": 5, "a": 5}],
         [(2026, 11, 9, 23), None, {"de": True, "a": "x"}], [(2026, 11, 9, 14), None, {"de": 13, "a": 15}], [(2026, 11, 9, 15), None, {"de": 13, "a": 15}],
         [(2026, 11, 9, 3), "oui", None], [(2026, 11, 9, 3), None, "x"], [(2026, 11, 9, 12), True, {"de": 21, "a": 7}], [(2026, 11, 9, 23), False, None]]
HOT = [None, "x", {"now": "x"}, {"now": {"kind": "soleil", "t": "30"}}, {"now": {"kind": "soleil", "t": True}}, {"now": {"kind": "soleil"}, "days": "x"},
       {"now": {"kind": "soleil"}, "days": [None]}, {"now": {"kind": "soleil", "t": 25}}, {"now": {"kind": "soleil", "t": 24.9}, "days": [{"tmax": 25.5}]}]
DESCRIBE = [[{"yeux": "chat", "couleur_yeux": "bleu", "couleur_joues": "rose"}, EMPTY, False],
            [{"accessoires": {"tete": "chapeau"}}, {**EMPTY, "tete": "chapeau", "cou": "echarpe", "nuit": False, "saison": "hiver"}, True],
            [{}, {**EMPTY, "tete": "bonnet-nuit", "cou": "pyjama", "nuit": True, "saison": None}, False],
            [{"yeux": "lunettes", "couleur_yeux": "vert", "couleur_joues": "violet"}, EMPTY, True],
            [{"yeux": "coeur", "couleur_yeux": "arc", "accessoires": {"oreilles": "casque", "visage": "moustache"}},
             {**EMPTY, "visage": "moustache", "oreilles": "casque", "yeux": "lunettes-soleil", "saison": "ete"}, False],
            [{}, {**EMPTY, "tete": "citrouille", "saison": [1]}, False], [{"accessoires": {"tete": "antenne"}}, {"tete": "antenne"}, True]]

# typed commands: (text, the snapshot's look (merged into the look of every day), what must happen: look.set's arguments,
# "claude" (as before: anything else, or a phrase that would change nothing), "toast" (« look ? »), "avant")
PHRASES = [
    ("mets ton chapeau", {}, {"porte": "chapeau"}), ("Mets ton chapeau !", {}, {"porte": "chapeau"}),
    ("mets ton chapeau s'il te plaît", {}, {"porte": "chapeau"}), ("Pixel, mets ta couronne", {}, {"porte": "couronne"}),
    ("enfile ton nœud papillon", {}, {"porte": "noeud"}), ("mets tes lunettes de soleil", {}, {"porte": "lunettes-soleil"}),
    ("mets tes lunettes", {}, {"yeux": "lunettes"}), ("mets ton casque", {}, {"porte": "casque"}), ("mets une moustache", {}, {"porte": "moustache"}),
    ("remets ton bonnet de nuit", {}, {"porte": "bonnet-nuit"}), ("mets ton chapeau haut-de-forme", {}, {"porte": "chapeau"}),
    ("mets ton chapeau", {"accessoires": {"tete": "chapeau"}}, "claude"),
    ("enlève ton chapeau", {}, "claude"), ("enlève ton chapeau", {"accessoires": {"tete": "chapeau"}}, {"enleve": "chapeau"}),
    ("enlève ton chapeau", {"porte": {"tete": "bonnet"}}, {"enleve": "tete"}), ("enlève ton bonnet", {"porte": {"tete": "pere-noel"}}, {"enleve": "tete"}),
    ("enlève ta moustache", {"accessoires": {"visage": "moustache"}}, {"enleve": "moustache"}),
    ("enlève tes lunettes", {"yeux": "lunettes"}, {"enleve": "lunettes"}),
    ("enlève tes lunettes", {"accessoires": {"yeux": "lunettes-soleil"}}, {"enleve": "lunettes-soleil"}),
    ("enlève tout", {"accessoires": {"cou": "noeud"}}, {"enleve": "tout"}), ("enlève tout", {}, {"enleve": "tout"}),
    ("enlève tout", {"sans": {s: REAL for s in L.SLOTS}}, "claude"), ("enlève tes lunettes", {}, "claude"),
    ("enlève tes lunettes de soleil", {"porte": {"yeux": "lunettes-soleil"}}, {"enleve": "lunettes-soleil"}), ("déshabille-toi", {"accessoires": {"tete": "chapeau"}}, {"enleve": "tout"}),
    ("yeux de chat", {}, {"yeux": "chat"}), ("yeux en cœur", {}, {"yeux": "coeur"}), ("des yeux en étoile", {}, {"yeux": "etoile"}),
    ("fais-toi des yeux carrés", {}, {"yeux": "carre"}), ("yeux en amande", {}, {"yeux": "amande"}), ("yeux de chat", {"yeux": "chat"}, "claude"),
    ("yeux bleus", {}, {"couleur_yeux": "bleu"}), ("Yeux verts.", {}, {"couleur_yeux": "vert"}), ("yeux arc-en-ciel", {}, {"couleur_yeux": "arc"}),
    ("arc-en-ciel", {}, {"couleur_yeux": "arc"}), ("yeux normaux", {"yeux": "chat", "couleur_yeux": "vert"}, {"yeux": "rond", "couleur_yeux": "theme"}),
    ("joues roses", {}, {"couleur_joues": "rose"}), ("joues violettes", {}, {"couleur_joues": "violet"}), ("joues arc-en-ciel", {}, "claude"),
    ("look normal", {"yeux": "chat"}, {"normal": True}), ("Look normal !", {"accessoires": {"tete": "chapeau"}}, {"normal": True}), ("look normal", {}, "claude"),
    ("habille-toi pour l'hiver", {}, {"tenue": "hiver"}), ("habille-toi pour l’hiver", {}, {"tenue": "hiver"}),
    ("habille-toi pour Halloween", {}, {"tenue": "halloween"}), ("déguise-toi pour Noël", {}, {"tenue": "noel"}),
    ("mets ta tenue de noël", {}, {"tenue": "noel"}), ("habille-toi pour dormir", {}, {"tenue": "nuit"}),
    ("remets comme avant", {"avant": 2}, "avant"), ("remets comme avant", {}, "claude"),
    ("look ?", {}, "toast"), ("ton look", {}, "toast"), ("C'est quoi ton look ?", {}, "toast"),
    ("mets la musique", {}, "claude"), ("mets ton manteau", {}, "claude"), ("mets ton chapeau et allume la lumière", {}, "claude"),
    ("yeux de lynx", {}, "claude"), ("tu as de beaux yeux", {}, "claude"), ("enlève la lumière", {}, "claude"), ("habille-toi", {}, "claude"),
    ("j'aime ton chapeau", {}, "claude"), ("un look d'enfer", {}, "claude"), ("habille-toi pour l'école", {}, "claude"), ("porte-toi bien", {}, "claude"),
]


def snap_look(state):
    """A snapshot's « look » from a few fields: the look of every day under them, "porte" (all slots), "avant"."""
    return {**L.clean(state), "porte": {**EMPTY, "nuit": False, "saison": None, **(state.get("porte") or {})}, "change": None, "avant": state.get("avant", 0)}


def js(cases):
    code = r"""
const fs = require('fs'), vm = require('vm');
const sb = { console, Math, JSON, Object, Array, String, Number, Date, Set, Map, RegExp, isNaN, isFinite, parseInt, parseFloat };
sb.window = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(process.argv[1], 'utf8'), sb, { filename: 'look.js' });
const K = sb.PixelLook, C = JSON.parse(fs.readFileSync(0, 'utf8'));
const D = a => new Date(a[0], a[1] - 1, a[2], a[3] || 0, a[4] || 0);
const out = {
  SHAPES: K.SHAPES, COLORS: K.COLORS, SLOTS: K.SLOTS, ITEMS: K.ITEMS, TENUES: K.TENUES, SAISONS: K.SAISONS, DEFAULT: K.DEFAULT, SAVED: K.SAVED, HISTORY: K.HISTORY,
  clean: C.clean.map(x => K.clean(x)),
  apply: C.apply.map(([l, a, t]) => K.apply(l, a, t)),
  season: C.season.map(([d, m, f]) => K.season(D(d), m, f)),
  resolve: C.resolve.map(([l, d, x]) => K.resolve(l, { ...x, date: D(d) })),
  night: C.night.map(([d, dort, calme]) => K.isNight(D(d), dort, calme)),
  hot: C.hot.map(m => K.hotSun(m)),
  describe: C.describe.map(([l, p, il]) => K.describe(l, p, il)),
  cmd: C.cmd.map(([t, st]) => { const r = K.command(t, st); return !r ? 'claude' : r.toast ? 'toast' : r.action === 'look.avant' ? 'avant' : r.args; }),
  get: K.get(), ctx: [K.context({ habitudes: 'x', souvenirs: [1], caractere: null }, D([2026, 11, 9, 14])), K.context({ habitudes: { dort: true }, souvenirs: { fete: 'anniversaire' }, caractere: { calme: { de: 21, a: 7 } } }, D([2026, 11, 9, 14]))],
};
console.log(JSON.stringify(out));
"""
    r = subprocess.run(["node", "-e", code, str(APP / "web" / "look.js")], input=json.dumps(cases, ensure_ascii=False), capture_output=True, text=True)
    if r.returncode:
        print(r.stderr[-2000:])
    return json.loads(r.stdout)


def py_command(state, text):
    hub = Hub({}, demo=True)
    hub.s["look"] = snap_look(state)
    r = L.command(hub, commands.norm(text), text)
    return "claude" if not r else r[0] if r[0] in ("toast", "avant") else r[1]


def rules():
    # the catalogue
    ok("7 eye shapes: round (as today), square, almond, star, heart, cat, glasses", list(L.SHAPES) == ["rond", "carre", "amande", "etoile", "coeur", "chat", "lunettes"])
    sw = [c for c in L.COLORS if c != "theme"]
    ok(f"{len(sw)} colour swatches and the theme's own, a rainbow for his eyes only", 8 <= len(sw) <= 10 and list(L.COLORS)[0] == "theme" and L.COLORS["theme"][1] is None
       and all(re.fullmatch(r"#[0-9a-f]{6}", L.COLORS[c][1]) for c in sw) and L.EYE_COLORS == [*L.COLORS, "arc"] and L.CHEEK_COLORS == list(L.COLORS))
    need = {"chapeau": "tete", "casquette": "tete", "noeud": "cou", "antenne": "tete", "couronne": "tete", "moustache": "visage", "casque": "oreilles",
            "bonnet": "tete", "lunettes-soleil": "yeux", "fete": "tete", "citrouille": "tete", "sorciere": "tete", "pere-noel": "tete",
            "bonnet-nuit": "tete", "pyjama": "cou", "echarpe": "cou"}
    ok(f"{len(L.ITEMS)} accessories, every one asked for, each in its slot (tête, yeux, visage, cou, oreilles)",
       all(L.ITEMS.get(k, ("", None))[1] == s for k, s in need.items()) and all(s in L.SLOTS for _, s in L.ITEMS.values()) and list(L.SLOTS) == ["tete", "yeux", "visage", "cou", "oreilles"])
    ok("every outfit puts items in their own slot (or empties it)", all(it is None or L.ITEMS[it][1] == s for _, (_, put) in L.TENUES.items() for s, it in put.items()))
    ok("every name is French and short", all(0 < len(n) <= 24 for n in [*L.SHAPES.values(), *(n for n, _ in L.COLORS.values()), *(n for n, _ in L.ITEMS.values()), *(n for n, _ in L.TENUES.values())]))

    # clean
    c = [L.clean(x) for x in CLEAN]
    ok("clean(garbage) gives the look of every day (no crash on lists or dicts where a word should be)", all(x == L.DEFAULT for x in c[:5]), json.dumps(c[4]))
    ok("bad fields get their defaults, good ones stay (an item in another slot dropped, a rainbow only for his eyes, a bad date dropped)",
       c[5] == {**L.DEFAULT, "couleur_yeux": "arc", "nuit": False, "accessoires": {**EMPTY, "cou": "noeud"}, "sans": {"tete": TODAY}}, json.dumps(c[5]))
    ok("a good look stays as it is", c[6] == {**L.DEFAULT, "yeux": "chat", "couleur_yeux": "vert", "couleur_joues": "rose", "mono": True,
                                              "accessoires": {**EMPTY, "tete": "couronne", "yeux": "lunettes-soleil"}})

    # apply (look.set)
    A = [L.apply(look, a, t) for look, a, t in APPLY]
    ok("put on the top hat: on his head; his reaction « porte »", A[0][0]["accessoires"]["tete"] == "chapeau" and A[0][1] == {"quoi": "porte", "item": "chapeau", "slot": "tete"})
    ok("the same hat again: no news (no reaction)", A[1][1] is None and A[1][0] == APPLY[1][0])
    ok("a crown takes the hat's place: one item per slot", A[2][0]["accessoires"]["tete"] == "couronne")
    ok("take it off: the slot empty, and bare today (no season in it until tomorrow)", A[3][0]["accessoires"]["tete"] is None and A[3][0]["sans"] == {"tete": TODAY}
       and A[3][1] == {"quoi": "enleve", "item": "chapeau", "slot": "tete"})
    ok("several items at once", A[4][0]["accessoires"] == {**EMPTY, "cou": "noeud", "visage": "moustache", "oreilles": "casque"} and A[4][1]["item"] == "casque")
    ok("« enlève tout »: every slot empty and bare today (his eyes stay as they are)", A[5][0]["accessoires"] == EMPTY and A[5][0]["sans"] == {s: TODAY for s in L.SLOTS}
       and A[5][0]["yeux"] == "etoile" and A[5][1] == {"quoi": "enleve", "item": "tout"})
    ok("…also when he wears nothing (no season today either)", A[6][1] == {"quoi": "enleve", "item": "tout"})
    ok("yesterday's bare slots are forgotten (the season may come back)", A[7][0]["sans"] == {})
    ok("his own glasses (a shape of eyes); sunglasses take their place, and the other way round",
       A[8][0]["yeux"] == "lunettes" and A[9][0]["yeux"] == "rond" and A[9][0]["accessoires"]["yeux"] == "lunettes-soleil"
       and A[10][0]["yeux"] == "lunettes" and A[10][0]["accessoires"]["yeux"] is None)
    ok("« enlève tes lunettes »: his own glasses off; without any: nothing", A[11][0]["yeux"] == "rond" and A[11][1]["item"] == "lunettes" and A[12][1] is None
       and A[13][0]["yeux"] == "rond")
    ok("colours: a rainbow for his eyes, not for his cheeks", A[14][0]["couleur_yeux"] == "arc" and A[14][1] == {"quoi": "couleur", "couleur": "arc", "ou": "yeux"} and A[15][1] is None
       and A[16][0]["couleur_joues"] == "rose" and A[16][0]["couleur_yeux"] == "bleu")
    ok("« look normal »: his eyes, colours and clothes of every day, the switches as you set them", A[17][0] == {**L.DEFAULT, "saisons": False} and A[17][1] == {"quoi": "normal"}
       and A[18][1] is None)
    ok("outfits: « pour dormir » empties the eyes and ears (bare today), « très chic » dresses three slots",
       A[19][0]["accessoires"] == {**EMPTY, "tete": "bonnet-nuit", "cou": "pyjama"} and A[19][0]["sans"] == {"yeux": TODAY, "oreilles": TODAY}
       and A[19][1] == {"quoi": "tenue", "tenue": "nuit"} and A[20][0]["accessoires"] == {**EMPTY, "tete": "chapeau", "cou": "noeud", "visage": "moustache"})
    ok("the switches: a little « c'est noté » (reglage); a word instead of true/false: nothing", A[21][1] == {"quoi": "reglage", "what": "saisons", "value": False}
       and A[22][1] is None and A[23][0]["mono"] is True and A[23][0]["nuit"] is False)
    junk = A[24:32]
    ok("junk (numbers, long strings, dicts, lists, None, nothing): no change, no reaction", all(ch is None and n == B for n, ch in junk), json.dumps([ch for _, ch in junk]))
    ok("…junk in a list is skipped, the good ones count", A[32][0]["accessoires"]["tete"] is None and A[32][1]["quoi"] == "enleve")
    ok("a slot by its name (the panel's « Rien »)", A[33][0]["sans"] == {"cou": TODAY} and A[33][1] == {"quoi": "enleve", "item": None, "slot": "cou"})
    ok("several changes: he reacts to the biggest (an item before his eyes, his eyes before colours)", A[34][1]["quoi"] == "porte" and A[35][1] == {"quoi": "yeux", "yeux": "chat"}
       and A[35][0]["couleur_yeux"] == "bleu")
    ok("an outfit over what he wears; over a bare slot: it puts it back", A[36][0]["accessoires"]["cou"] == "echarpe" and A[37][0]["sans"] == {}
       and A[37][0]["accessoires"]["tete"] == "pere-noel")
    ok("three hats at once: the last one stays", A[38][0]["accessoires"]["tete"] == "fete")

    # the seasons, with a fixed clock
    S = [L.season(D(*d), m, f) for d, m, f in SEASON]
    ok("Halloween (24-31 October): the witch's hat and the pumpkin, a day each", S[0] == ({}, None) and S[1] == ({"tete": "sorciere"}, "halloween")
       and S[2] == ({"tete": "citrouille"}, "halloween") and S[3][1] == "halloween" and S[4] == ({}, None))
    ok("winter (December - February): a bonnet and a scarf", S[5] == ({"tete": "bonnet", "cou": "echarpe"}, "hiver") and S[8] == S[5] and S[11] == S[5] and S[12] == S[5] and S[13] == ({}, None))
    ok("Christmas (20-26 December): the Santa hat (and the winter's scarf)", S[6] == ({"tete": "pere-noel", "cou": "echarpe"}, "noel") and S[7] == S[6])
    ok("New Year (31 December - 1 January): the party hat", S[9] == ({"tete": "fete", "cou": "echarpe"}, "nouvel-an") and S[10][1] == "nouvel-an")
    ok("July and August in the day (9 h - 20 h): sunglasses; not at night, not at 8 in the morning", S[14] == ({"yeux": "lunettes-soleil"}, "ete") and S[15] == ({}, None) and S[16] == ({}, None))
    ok("a hot sunny day (25 °C or more, now or today's high): sunglasses; cloudy, cool or after 20 h: not",
       S[17] == ({"yeux": "lunettes-soleil"}, "ete") and S[18] == ({}, None) and S[19][0] == {"yeux": "lunettes-soleil"} and S[20] == ({}, None) and S[21] == ({}, None))
    ok("his birthday or the day you met (souvenirs.fete): the party hat, first; anything else there: nothing",
       S[22] == ({"tete": "fete", "cou": "echarpe"}, "anniversaire") and S[23] == ({"tete": "fete"}, "rencontre") and S[24] == ({}, None) and S[25] == ({}, None))
    ok("the weather, read defensively: never an error", all(L.hot_sun(m) is False for m in HOT[:7]) and L.hot_sun(HOT[7]) and L.hot_sun(HOT[8])
       and L.hot_sun({"now": {"kind": "soleil", "t": float("nan")}}) is False and L.hot_sun({"now": {"kind": "soleil", "t": float("inf")}}) is False)

    # what he wears now: your choices, then the season, then the night
    R = [L.resolve(look, {**x, "date": D(*d)}) for look, d, x in RESOLVE]
    ok("Christmas Eve, nothing chosen: the Santa hat and a scarf", R[0] == {**EMPTY, "tete": "pere-noel", "cou": "echarpe", "nuit": False, "saison": "noel"}, json.dumps(R[0]))
    ok("what you choose comes first: his top hat stays on at Christmas; the season dresses the empty slots only (the scarf)",
       R[1]["tete"] == "chapeau" and R[1]["cou"] == "echarpe" and R[1]["saison"] == "noel")
    ok("a slot you emptied today stays bare (« enlève ton bonnet »); yesterday's does not", R[2]["tete"] is None and R[2]["cou"] == "echarpe" and R[3]["tete"] == "pere-noel")
    ok("« Tenues de saison » off: no season", R[4] == {**EMPTY, "nuit": False, "saison": None})
    ok("no sunglasses over his own glasses", R[5]["yeux"] is None and R[6]["yeux"] == "lunettes-soleil")
    ok("asleep (habitudes.dort): nightcap and pyjama over his choices, his headphones and sunglasses off, his moustache stays",
       R[7] == {**EMPTY, "tete": "bonnet-nuit", "visage": "moustache", "cou": "pyjama", "nuit": True, "saison": None}, json.dumps(R[7]))
    ok("…not with « Pyjama la nuit » off", R[8]["nuit"] is False and R[8]["tete"] is None)
    ok("his habits win over the clock: awake at 3 am, asleep at noon", R[9]["nuit"] is False and R[10]["nuit"] is True)
    ok("without his habits: his quiet hours (23 h - 6 h by default)", R[11]["nuit"] and R[12]["nuit"] and not R[13]["nuit"] and not R[14]["nuit"])
    ok("Christmas night: the pyjama wins (no season named)", R[15]["tete"] == "bonnet-nuit" and R[15]["cou"] == "pyjama" and R[15]["saison"] is None)
    ok("his own sunglasses at night: off for sleeping", R[16]["yeux"] is None and R[16]["nuit"])
    ok("his birthday: the party hat, unless he wears his crown", R[17]["tete"] == "fete" and R[17]["saison"] == "anniversaire" and R[18]["tete"] == "couronne")
    ok("a hot sunny day: his sunglasses come", R[19]["yeux"] == "lunettes-soleil" and R[19]["saison"] == "ete")
    N = [L.is_night(D(*d), dort, calme) for d, dort, calme in NIGHT]
    ok("his quiet hours from his character (caractère calme 21 h - 7 h, or a nap 13 h - 15 h); equal hours: never; junk: 23 h - 6 h",
       N[0] and not N[1] and not N[2] and N[3] and N[4] and not N[5] and N[6] is True and N[7] is True and N[8] is True and N[9] is False, str(N))
    hub = Hub({}, demo=True)
    hub.s.update({"habitudes": "x", "souvenirs": [1], "caractere": None})
    c1 = L.context(hub, FIX)
    hub.s.update({"habitudes": {"dort": "oui"}, "souvenirs": {"fete": "anniversaire"}, "caractere": {"calme": {"de": 21, "a": 7}}})
    c2 = L.context(hub, FIX)
    ok("the other features are read defensively (habitudes, souvenirs, caractère: missing, broken, or there)",
       c1["dort"] is None and c1["fete"] is None and c1["calme"] is None and c2["dort"] is None and c2["fete"] == "anniversaire" and c2["calme"] == {"de": 21, "a": 7})

    # words
    W = [L.describe(look, porte, il) for look, porte, il in DESCRIBE]
    ok(f"in words, agreeing in French: « {W[0]} »", W[0] == "Tu as des yeux de chat bleus et les joues roses. Tu ne portes rien de spécial.")
    ok(f"…about him, with why: « {W[1]} »", W[1] == "Il a des yeux ronds. Il porte un chapeau haut-de-forme, une écharpe (l’hiver).")
    ok(f"…for the night: « {W[2]} »", W[2] == "Tu as des yeux ronds. Tu portes un bonnet de nuit, un pyjama pour dormir.")
    ok(f"…with his glasses: « {W[3]} »", W[3] == "Il a des yeux ronds verts, avec des lunettes et les joues violettes. Il ne porte rien de spécial.")
    ok(f"…a rainbow, plural items: « {W[4]} »", W[4] == "Tu as des yeux en cœur arc-en-ciel. Tu portes des lunettes de soleil, une moustache, un casque audio (l’été).")
    ok("…a broken « porte » never breaks it", W[5].startswith("Tu as des yeux ronds. Tu portes une citrouille") and W[6] == "Il a des yeux ronds. Il porte des antennes.")

    # Claude
    tool = next((t for t in TOOLS if t["name"] == "set_look"), None)
    p = tool and tool["input_schema"]["properties"]
    ok("Claude has a set_look tool: every shape, colour, item and outfit, nothing else allowed",
       bool(tool) and p["yeux"]["enum"] == list(L.SHAPES) and p["couleur_yeux"]["enum"] == L.EYE_COLORS and p["couleur_joues"]["enum"] == L.CHEEK_COLORS
       and p["porte"]["items"]["enum"] == list(L.ITEMS) and set(p["enleve"]["items"]["enum"]) == set(L.ITEMS) | {"lunettes", "tout"}
       and p["tenue"]["enum"] == list(L.TENUES) and tool["input_schema"]["additionalProperties"] is False and tool.get("eager_input_streaming")
       and "passe avant" in tool["description"])
    good = [{"yeux": "chat"}, {"porte": ["chapeau", "noeud"]}, {"enleve": ["tout"]}, {"normal": True}, {"couleur_yeux": "arc", "couleur_joues": "rose"}, {"tenue": "hiver"}]
    bad = [{}, {"yeux": "laser"}, {"porte": "chapeau"}, {"porte": []}, {"porte": ["chapeau"] * 6}, {"enleve": ["x"]}, {"normal": False}, {"couleur_joues": "arc"},
           {"foo": 1}, {"tenue": 3}, {"yeux": ["chat"]}, {"porte": [{"a": 1}]}, "x", None, [1]]
    ok("tool input checks (check()): valid ones pass, anything else is refused", all(check("set_look", a) is None for a in good) and all(check("set_look", a) for a in bad),
       str([a for a in good if check("set_look", a)] + [a for a in bad if not check("set_look", a)]))
    ok("Claude's tool does nothing without the feature", run(L.run_tool(Hub({}, demo=True), {"yeux": "chat"})) == "pas de look sur ce Pixel")

    # his scenes (web/scenes/look.js)
    own = [i for i, _, _ in scenes.SCENES if i.startswith("look-")]
    ok(f"{len(own)} scenes of his look, read by pixel/scenes.py", len(own) >= 12 and {"look-miroir", "look-dodo", "look-debout", "look-noel", "look-halloween"} <= set(own))
    words = lambda mine: {k for i, label, _ in scenes.SCENES if i.startswith("look-") == mine  # noqa: E731
                          for w in (i, i.replace("-", " "), label) for k in (anims.key(w), scenes._bare(anims.key(w)))}
    ok("his scenes' labels name no other pack's scene (scenes.py keeps the first)", not (words(True) & words(False)), str(words(True) & words(False)))
    ps = next(t for t in TOOLS if t["name"] == "play_scene")["input_schema"]["properties"]["scene"]["enum"]
    ok("Claude's play_scene does not offer his reactions to a change (they need a reason)", not [i for i in ps if i.startswith("look-") and scenes.BY_ID[i][1] == "evt"])

    # the same rules in JavaScript (web/look.js)
    J = js({"clean": CLEAN, "apply": APPLY, "season": [[d, m, f] for d, m, f in SEASON], "resolve": [[look, d, x] for look, d, x in RESOLVE],
            "night": NIGHT, "hot": HOT, "describe": DESCRIBE, "cmd": [[t, snap_look(st)] for t, st, _ in PHRASES]})
    ok("web/look.js: the same catalogue (shapes, colours, slots, items, outfits, seasons, the look of every day)",
       J["SHAPES"] == [[k, v] for k, v in L.SHAPES.items()] and J["COLORS"] == [[k, n, h] for k, (n, h) in L.COLORS.items()]
       and J["SLOTS"] == [[k, v] for k, v in L.SLOTS.items()] and J["ITEMS"] == [[k, n, s] for k, (n, s) in L.ITEMS.items()]
       and J["TENUES"] == [[k, n, s] for k, (n, s) in L.TENUES.items()] and J["SAISONS"] == L.SAISONS and J["DEFAULT"] == L.DEFAULT
       and J["SAVED"] == list(L.SAVED) and J["HISTORY"] == L.HISTORY)
    ok("web/look.js: the same cleaning", J["clean"] == c, json.dumps([(a, b) for a, b in zip(J["clean"], c) if a != b])[:300])
    diff = [(i, APPLY[i][1], j, list(p)) for i, (j, p) in enumerate(zip(J["apply"], A)) if j != list(p)]
    ok(f"web/look.js: the same changes ({len(APPLY)} cases)", not diff, json.dumps(diff, ensure_ascii=False)[:400])
    ok(f"web/look.js: the same seasons ({len(SEASON)} dates)", J["season"] == [list(s) for s in S], json.dumps([(SEASON[i][0], a, list(b)) for i, (a, b) in enumerate(zip(J["season"], S)) if a != list(b)])[:300])
    ok(f"web/look.js: the same clothes now ({len(RESOLVE)} cases), nights and weather", J["resolve"] == R and J["night"] == N and J["hot"] == [L.hot_sun(m) for m in HOT],
       json.dumps([(i, a, b) for i, (a, b) in enumerate(zip(J["resolve"], R)) if a != b])[:300])
    ok("web/look.js: the same words", J["describe"] == W, json.dumps([(a, b) for a, b in zip(J["describe"], W) if a != b], ensure_ascii=False))
    ok("web/look.js: the same defensive reading of the other features", [x["dort"] for x in J["ctx"]] == [None, True] and J["ctx"][1]["fete"] == "anniversaire"
       and J["ctx"][1]["calme"] == {"de": 21, "a": 7} and not J["ctx"][0].get("fete") and not J["ctx"][0].get("calme"))
    ok("web/look.js get() without a snapshot: the look of every day", {k: J["get"][k] for k in L.SAVED} == L.DEFAULT and "porte" in J["get"])
    return J


class Rec:
    """A hub with the real features (caractère, nourrir, exos, look, as server.py sets them up) and every other action only recorded."""
    def __init__(self, datadir, now=lambda: FIX):
        self.hub = Hub({}, demo=True)
        self.hub.s["lights"]["rooms"] = [{"id": "0", "name": "Salon", "on": True, "bri": 80}]
        self.calls = []
        for name in ("chat.ask", "chat.clear", "screen.show", "timer.start", "timer.toggle", "lights.set", "lights.scene", "theme.set", "theme.step",
                     "mood.set", "face.set", "scene.play", "anim.play", "codex.run"):
            self.hub.actions[name] = self._rec(name)
        caractere.setup(self.hub, datadir)
        nourrir.setup(self.hub, datadir)
        exos.setup(self.hub, datadir)
        self.K = L.setup(self.hub, datadir, now=now)

    def _rec(self, name):
        async def fn(**a):
            self.calls.append((name, a))
        return fn

    def cmd(self, text):
        self.calls = []
        run(commands.run(self.hub, text))
        return self.calls


def commands_saving_claude(J):
    tmp = Path(tempfile.mkdtemp())
    R = Rec(tmp)
    hub, K = R.hub, R.K
    s = hub.s["look"]
    ok("no file yet: the look of every day, in the snapshot under « look » (porte, change, avant)",
       {k: s[k] for k in L.SAVED} == L.DEFAULT and s["change"] is None and s["avant"] == 0 and s["porte"] == {**EMPTY, "nuit": False, "saison": None}
       and set(s) == set(L.SAVED) | {"porte", "change", "avant"})

    # the phrases, through pixel/commands.py (nothing before him takes them; what is not his goes to Claude as before)
    real = {n: hub.actions[n] for n in ("look.set", "look.avant")}

    def spy(name):
        async def fn(**a):
            R.calls.append((name, a))
            await real[name](**a)
        return fn
    for n in real:
        hub.actions[n] = spy(n)
    py = [py_command(st, t) for t, st, _ in PHRASES]
    ok(f"look.py command(): {len(PHRASES)} phrases do what they should", py == [w for _, _, w in PHRASES],
       json.dumps([(t, p) for (t, _, w), p in zip(PHRASES, py) if p != w], ensure_ascii=False))
    ok("…and the lab and Pixel sans Pi (web/look.js) answer them the same", J["cmd"] == [w for _, _, w in PHRASES],
       json.dumps([(t, j) for (t, _, w), j in zip(PHRASES, J["cmd"]) if j != w], ensure_ascii=False))
    for text, state, want in PHRASES:
        K.L.update({k: v for k, v in snap_look(state).items() if k != "change"})
        K.history = [L.clean({})] * state.get("avant", 0)
        hub.s["toast"] = None
        calls = R.cmd(text)
        toast = (hub.s["toast"] or {}).get("msg", "")
        got = ("claude" if calls == [("chat.ask", {"text": text})] else "avant" if calls == [("look.avant", {})]
               else calls[0][1] if len(calls) == 1 and calls[0][0] == "look.set" else "toast" if not calls and "mets ton chapeau" in toast else calls)
        ok(f"« {text} »{' (' + json.dumps(state, ensure_ascii=False) + ')' if state else ''}: {want if isinstance(want, str) else 'look.set ' + json.dumps(want, ensure_ascii=False)}",
           got == want, str(got))
    for n in real:
        hub.actions[n] = real[n]
    run(hub.dispatch("look.reset"))
    for text, action in (("fais le poisson", "scene.play"), ("salon 40", "lights.set"), ("thème néon", "theme.set"), ("minuteur 10", "timer.start"),
                         ("humeur triste", "mood.set"), ("anim danse", "anim.play"), ("visage vivant", "face.set"), ("météo", "screen.show")):
        ok(f"« {text} » still does what it did ({action})", action in [c[0] for c in R.cmd(text)], str(R.calls))
    R.cmd("sois grognon")
    ok("« sois grognon » still changes his character", hub.s["caractere"]["preset"] == "grognon")
    R.cmd("aide")
    ok("« aide » names « mets ton chapeau » and « yeux de chat »", "mets ton chapeau" in hub.s["toast"]["msg"] and "yeux de chat" in hub.s["toast"]["msg"])
    run(hub.dispatch("caractere.reset"))

    # look.set and its friends, through the hub
    K.history, s["avant"] = [], 0
    hub.s["screen"], hub.s["anim"] = "meteo", {"id": "danse"}
    t0 = time.time() * 1000
    run(hub.dispatch("look.set", {"yeux": "chat", "porte": ["chapeau", "noeud"], "couleur_joues": "rose"}))
    ok("look.set: chat eyes, a top hat, a bow tie, pink cheeks; his face comes up to show it",
       s["yeux"] == "chat" and s["accessoires"]["tete"] == "chapeau" and s["accessoires"]["cou"] == "noeud" and s["couleur_joues"] == "rose"
       and s["change"]["quoi"] == "porte" and s["change"]["t0"] >= t0 and hub.s["screen"] == "visage" and hub.s["anim"] is None and s["avant"] == 1)
    ok("…what he wears now follows (porte)", s["porte"]["tete"] == "chapeau" and s["porte"]["cou"] == "noeud" and s["porte"]["nuit"] is False)
    before = json.dumps({k: s[k] for k in L.SAVED})
    for bad in ({"yeux": 42}, {"porte": ["x" * 1000]}, {"enleve": {"a": 1}}, {"tenue": "pirate"}, {"normal": "oui"}, {"couleur_yeux": "#ff0000"}, {"foo": 1},
                {"porte": "chapeau" * 10}, {"yeux": ["chat"]}, {"enleve": 3}):
        run(hub.dispatch("look.set", bad))
    run(hub.dispatch("look.porte", {"item": "couronne", "x": 1}))
    run(hub.dispatch("look.tenue", {"tenue": None}))
    ok("junk through the hub: nothing changes, no error toast", json.dumps({k: s[k] for k in L.SAVED}) == before and "ERREUR" not in ((hub.s["toast"] or {}).get("msg") or ""))
    run(hub.dispatch("look.porte", {"item": "moustache"}))
    ok("look.porte", s["accessoires"]["visage"] == "moustache" and s["change"]["item"] == "moustache")
    run(hub.dispatch("look.enleve", {"slot": "visage"}))
    ok("look.enleve {slot}", s["accessoires"]["visage"] is None and s["sans"] == {"visage": TODAY})
    run(hub.dispatch("look.tenue", {"tenue": "chic"}))
    ok("look.tenue « Très chic »", s["accessoires"] == {**EMPTY, "tete": "chapeau", "cou": "noeud", "visage": "moustache"} and s["change"] == {**s["change"], "quoi": "tenue", "tenue": "chic"})
    run(hub.dispatch("look.enleve"))
    ok("look.enleve with nothing: everything off", s["accessoires"] == EMPTY and s["change"]["item"] == "tout")
    run(hub.dispatch("look.avant"))
    ok("look.avant (« Remettre comme avant »): the outfit is back", s["accessoires"]["tete"] == "chapeau" and s["change"]["quoi"] == "avant")
    for c in ("bleu", "vert", "rose", "violet", "jaune", "orange", "rouge", "marron", "turquoise", "arc"):
        run(hub.dispatch("look.set", {"couleur_yeux": c}))
    ok(f"at most {L.HISTORY} steps back", s["avant"] == L.HISTORY and len(K.history) == L.HISTORY)
    run(hub.dispatch("look.avant"))
    ok("…one step back", s["couleur_yeux"] == "turquoise" and s["avant"] == L.HISTORY - 1)
    for _ in range(12):
        run(hub.dispatch("look.avant"))
    ok("…then nothing more to undo, no error", s["avant"] == 0 and s["couleur_yeux"] == "vert")
    run(hub.dispatch("look.reset"))
    ok("look.reset: the look of every day", {k: s[k] for k in ("yeux", "couleur_yeux", "couleur_joues", "accessoires")} == {k: L.DEFAULT[k] for k in ("yeux", "couleur_yeux", "couleur_joues", "accessoires")}
       and s["change"]["quoi"] == "normal")

    # the clock, the weather, his sleep: what he wears follows (tick, the hub's listeners)
    hub._dirty.clear()
    K.now = lambda: D(2026, 12, 24, 12)
    run(K.tick())
    ok("the clock: on Christmas Eve, the Santa hat and a scarf come by themselves (and the screens hear it)",
       s["porte"]["tete"] == "pere-noel" and s["porte"]["cou"] == "echarpe" and s["porte"]["saison"] == "noel" and hub._dirty.is_set())
    hub._dirty.clear()
    run(K.tick())
    ok("…once (nothing new: no broadcast)", not hub._dirty.is_set())
    hub.s["habitudes"] = {"dort": True}
    for fn in hub.listeners:
        fn(hub.snapshot())
    ok("his habits say he sleeps (habitudes.dort, a stand-in): nightcap and pyjama, at once", s["porte"]["tete"] == "bonnet-nuit" and s["porte"]["cou"] == "pyjama" and s["porte"]["nuit"])
    hub.s["habitudes"] = {"dort": False}
    K.heard({})
    ok("…awake again: the season's clothes are back", s["porte"]["tete"] == "pere-noel" and not s["porte"]["nuit"])
    hub.s["habitudes"] = None
    K.now = lambda: D(2026, 11, 9, 23, 30)
    hub.s["caractere"]["calme"] = {"de": 23, "a": 6}
    K.heard({})
    ok("without his habits: his quiet hours (caractère calme)", s["porte"]["nuit"] is True)
    run(hub.dispatch("look.set", {"nuit": False}))
    ok("« Pyjama la nuit » off", s["porte"]["nuit"] is False and s["nuit"] is False)
    K.now = lambda: FIX

    # Claude
    claude = Claude(hub, {})
    out = run(claude.run_tool("set_look", {"yeux": "coeur", "couleur_yeux": "rose", "porte": ["couronne"]}))
    ok(f"Claude's set_look changes his look and says so (« {out} »)", s["yeux"] == "coeur" and s["accessoires"]["tete"] == "couronne" and out.startswith("ok. Tu as des yeux en cœur roses")
       and "une couronne" in out)
    out = run(claude.run_tool("set_look", {"enleve": ["couronne", "tout"]}))
    ok("…« tout » takes everything off", s["accessoires"] == EMPTY)
    st = json.loads(run(claude.run_tool("get_status", {})))
    ok(f"get_status tells Claude his look (« {st.get('look')} »)", st.get("look", "").startswith("Tu as des yeux en cœur roses"))
    ok("get_status without the feature: no « look »", "look" not in Claude(Hub({}, demo=True), {}).status())

    # saving
    saved = json.loads((tmp / "look.json").read_text())
    ok("saved in look.json: his look and the undo list (not what he wears now, not the screens' news)",
       set(saved) == set(L.SAVED) | {"historique"} and {k: saved[k] for k in L.SAVED} == {k: s[k] for k in L.SAVED} and len(saved["historique"]) == len(K.history))
    R2 = Rec(tmp)
    s2 = R2.hub.s["look"]
    ok("…and read back by a new server, « Remettre comme avant » included", {k: s2[k] for k in L.SAVED} == {k: s[k] for k in L.SAVED} and s2["change"] is None
       and s2["avant"] == s["avant"] > 0)
    for text, want in (("{pas du json", None), ("[" * 200000, None), ("null", None), ('"chapeau"', None),
                       (json.dumps({"yeux": "laser", "accessoires": {"tete": "moustache", "cou": "echarpe"}, "mono": "oui", "sans": {"tete": "demain"},
                                    "historique": "x"}), {"cou": "echarpe"}),
                       (json.dumps({"yeux": "chat", "historique": [{"yeux": "carre"}] * 500 + ["x", 3]}), "hist")):
        (tmp / "look.json").write_text(text)
        try:
            r, err = Rec(tmp), ""
        except Exception as e:                       # a broken file must never stop the server
            r, err = None, repr(e)[:80]
        l2 = r and r.hub.s["look"]
        if want is None:
            ok(f"a file that is {'a JSON bomb' if text.startswith('[[') else repr(text[:16])}: the look of every day, the server starts", bool(r) and {k: l2[k] for k in L.SAVED} == L.DEFAULT, err)
        elif want == "hist":
            ok("a file with 500 steps back: the last 8 kept, junk dropped", bool(r) and l2["yeux"] == "chat" and l2["avant"] == L.HISTORY and len(r.K.history) == L.HISTORY, err)
        else:
            ok("a file with bad fields: only those get their defaults", bool(r) and l2["yeux"] == "rond" and l2["accessoires"] == {**EMPTY, "cou": "echarpe"} and l2["mono"] is False
               and l2["sans"] == {} and l2["avant"] == 0, err)
    blocker = Path(tempfile.mkdtemp()) / "pas-un-dossier"          # a file where his data folder should be: nothing can be read or written
    blocker.write_text("x")
    h3 = Hub({}, demo=True)
    L.setup(h3, blocker, now=lambda: FIX)
    run(h3.dispatch("look.set", {"yeux": "chat"}))
    ok("a data folder he cannot use: he still changes (a warning in the log), no crash", h3.s["look"]["yeux"] == "chat")


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
            lk = lambda: state["look"]  # noqa: E731
            if first:
                ok("the server's snapshot: « look », the look of every day, what he wears now", {k: lk()[k] for k in L.SAVED} == L.DEFAULT
                   and set(lk()["porte"]) == set(L.SLOTS) | {"nuit", "saison"})
                await act("screen.show", screen="meteo")
                await act("look.set", yeux="etoile", couleur_yeux="arc", porte=["casquette"])
                ok("look.set through the WebSocket: star eyes, a rainbow, a cap; his face comes up to show it",
                   lk()["yeux"] == "etoile" and lk()["couleur_yeux"] == "arc" and lk()["accessoires"]["tete"] == "casquette" and lk()["change"]["quoi"] == "porte"
                   and state["screen"] == "visage")
                await act("cmd", text="mets ton nœud papillon")
                await act("cmd", text="joues roses")
                ok("typed commands reach him", lk()["accessoires"]["cou"] == "noeud" and lk()["couleur_joues"] == "rose")
                await act("cmd", text="look ?")
                ok("« look ? »: he says how he looks", "Il a des yeux en étoile arc-en-ciel et les joues roses" in (state.get("toast") or {}).get("msg", ""), str(state.get("toast")))
            else:
                ok("after a restart: the same look, « Remettre comme avant » still there", lk()["yeux"] == "etoile" and lk()["accessoires"]["cou"] == "noeud"
                   and lk()["couleur_joues"] == "rose" and lk()["change"] is None and lk()["avant"] == 3, json.dumps(lk(), ensure_ascii=False))
                await act("look.avant")
                ok("…and it works", lk()["couleur_joues"] == "theme" and lk()["accessoires"]["cou"] == "noeud")


if __name__ == "__main__":
    J = rules()
    commands_saving_claude(J)
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
