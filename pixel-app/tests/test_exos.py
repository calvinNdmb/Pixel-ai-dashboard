"""Pixel's math exercises, the server's side (pixel/exos.py):

    python3 tests/test_exos.py                     # also starts its own demo server (port 8181, temporary data folder)

- the generator: every kind at every level gives a question whose answer is right (checked by computing it again) and
  among 4 distinct choices, a hint and a correction; the same seed gives the same exercise; the classic mistakes are there;
- the game, on a fake clock: the hint and the second try, the correction, a series, a table, the 60 s challenge, the levels
  that go up and down (or stay, when fixed), the daily goal, the streaks, the trophies, an exercise left alone, the files;
- the right answer never in what the screens get before it is answered;
- an answer names its exercise: a double tap, a late screen or the same wrong answer twice never use up the second try, nor
  answer the next question; a milestone's celebration is not cut; a wrong-shaped exos.json never stops Pixel;
- through a demo server (started on an exos.json that holds `null`): the typed commands (a bare number only while an exercise
  is open, and then never Claude's, even during the correction; « 4 025 » the French way), « encore » / « une autre » only
  during or just after an exercise, the actions, Claude's tool.
The kiosk, the phone panel and Pixel's scenes are tested in a browser by tests/test_exos.js.
"""
import asyncio
import json
import random
import re
import socket
import subprocess
import sys
import tempfile
import time
from fractions import Fraction
from pathlib import Path

import aiohttp

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
from pixel import exos  # noqa: E402
from pixel.claude import TOOLS, check as claude_check  # noqa: E402
from pixel.state import Hub  # noqa: E402

PORT = 8181
fails = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


def ev(calc):
    """The answer computed again from the exercise's own expression, exactly (fractions)."""
    py = re.sub(r"\d+(?:\.\d+)?", lambda m: f"Fraction('{m.group(0)}')", calc)
    return eval(py, {"Fraction": Fraction, "max": max, "min": min, "__builtins__": {}})


# ---------- the generator ----------
def generator():
    bad, long_q, missing, n = [], [], [], 0
    for kind in exos.IDS:
        for lv in range(1, 6):
            qs = set()
            for seed in range(120):
                e = exos.generate(kind, lv, random.Random(seed))
                n += 1
                ch = e["choices"]
                qs.add((e["q"], tuple(sorted(ch))))                   # comparisons: the numbers are the choices
                ok = len(ch) == 4 and e["answer"] in ch and len({exos.canon(c) for c in ch}) == 4 and e["kind"] == kind and e["niveau"] == lv
                if ok and e["calc"]:
                    a = exos.canon(e["answer"])
                    ok = not re.fullmatch(r"-?[\d.]+", a) or Fraction(a) == ev(e["calc"])
                if not ok:
                    bad.append(f"{kind} {lv} {seed}: {e['q']} {ch} -> {e['answer']}")
                if len(e["q"]) > 100:
                    long_q.append(e["q"])
                if not (e["hint"] and e["explication"] and e["q"].strip()):
                    missing.append(f"{kind} {lv}")
            if len(qs) < (3 if kind == "enigme" else 4):
                bad.append(f"{kind} {lv}: only {len(qs)} different questions")
    check(f"every kind at every level: {n} exercises, the right answer among 4 distinct choices, checked by computing it again",
          not bad, " | ".join(bad[:3]))
    check("every exercise has a hint and a correction, and a question short enough for the screen", not missing and not long_q, str((missing[:2], long_q[:2])))
    a, b = exos.generate("table", 3, random.Random(42)), exos.generate("table", 3, random.Random(42))
    check("the same seed gives the same exercise", a == b and exos.generate("mental", 5, random.Random(7)) == exos.generate("mental", 5, random.Random(7)))
    check("15 kinds, 5 levels, labels in French", len(exos.KINDS) == 15 and exos.LABEL["enigme"] == "Énigmes" and exos.LABEL["heure"] == "Heures et durées")
    empty, zero = [], []
    for kind in exos.IDS:
        for lv in range(1, 6):
            for seed in range(300):
                e = exos.generate(kind, lv, random.Random(seed))
                m = re.fullmatch(r"([^:]*) = ([^:=]+) : ([^:=]+)\.", e["explication"])
                if m and exos.canon(m.group(2)) == exos.canon(m.group(3)):          # « 35 % de 40 = 14 : 14. »
                    empty.append(e["explication"])
                if re.search(r"(?<![\d,])0 min", e["explication"]):                  # « puis encore 0 min »
                    zero.append(e["explication"])
    check("every correction says how (never « 35 % de 40 = 14 : 14. », never « encore 0 min »)", not empty and not zero, str((empty[:2], zero[:2])))

    def find(kind, lv, pred, tries=400):
        for s in range(tries):
            e = exos.generate(kind, lv, random.Random(s))
            if pred(e):
                return e
        return None

    e = find("table", 4, lambda e: e["q"] in ("7 × 8 = ?", "8 × 7 = ?"))
    check("7 × 8: 56, its neighbours as mistakes (54, 49, 63, 48…), and « 7 × 8 = 7 × 4 × 2 » in the correction",
          e and "56" in e["choices"] and len({"54", "49", "63", "48", "64"} & set(e["choices"])) >= 2 and "7 × 4" in e["explication"], str(e))
    e = find("mental", 3, lambda e: re.fullmatch(r"\d \+ \d × \d = \?", e["q"]) is not None)
    a, b, c = map(int, re.findall(r"\d", e["q"]))
    check("2 + 3 × 4: computing left to right is one of the mistakes", str((a + b) * c) in e["choices"] and e["answer"] == str(a + b * c), str(e))
    e = find("complement", 3, lambda e: True)
    x = int(e["q"].split(" ")[0])
    check("37 + ? = 100: taking each digit to 10 (73) is one of the mistakes", e["answer"] == str(100 - x) and str(100 - x + 10) in e["choices"], str(e))
    e = find("heure", 5, lambda e: e["q"].startswith("1,5 heures"))
    check("1,5 h = 90 min, and « 1 h 50 » (110 min) is one of the mistakes", e and e["answer"] == "90\u00a0min" and "110\u00a0min" in e["choices"], str(e))
    e = find("carre", 3, lambda e: "²" in e["q"])
    n2 = int(e["q"].split("²")[0])
    check("n²: n × 2 is one of the mistakes", e["answer"] == str(n2 * n2) and str(2 * n2) in e["choices"], str(e))
    e = find("comparaison", 4, lambda e: True)
    check("comparisons: the 4 decimals are the choices, the answer is the biggest or the smallest",
          e["answer"] in e["choices"] and float(exos.canon(e["answer"])) == (max if "grand" in e["q"] else min)(float(exos.canon(c)) for c in e["choices"]), str(e))
    e = find("probleme", 1, lambda e: "Pixel" in e["q"] or "lampes" in e["q"])
    check("word problems with Pixel in them", e is not None and len(e["q"]) > 30, str(e))
    e = find("enigme", 3, lambda e: "Léa" in e["q"])
    check("riddles: « le père de Léa… » answers Léa", e and e["answer"] == "Léa" and not e["num"], str(e))
    t = exos.generate("table", 2, random.Random(3), table=7, k=9)
    check("a given table and factor: 7 × 9 = 63", t["q"] == "7 × 9 = ?" and t["answer"] == "63" and t["clavier"] == "num", str(t))
    h = find("heure", 3, lambda e: e["q"].startswith("Il est"))
    check("times of day are typed with an « h » (keypad with h)", h and h["clavier"] == "heure" and re.fullmatch(r"\d+\u00a0h(\u00a0\d\d)?", h["answer"]), str(h))

    same = exos.same
    check("answers compared whatever the way they are typed", same("10h15", "10\u00a0h\u00a015") and same("10:15", "10\u00a0h\u00a015") and same("10", "10\u00a0h")
          and same("4.5", "4,5") and same("85", "85\u00a0min") and same("lea", "Léa") and same(" 56 ", "56") and same("1 250", "1\u00a0250")
          and same("0,05", "0,05 €") and same("2", "2 kg") and not same("8", "9") and not same("10", "10\u00a0h\u00a015") and not same("", "0"))


# ---------- the game, on a fake clock ----------
class Clock:
    def __init__(self):
        self.t = time.mktime((2026, 11, 9, 15, 0, 0, 0, 0, -1))

    def __call__(self):
        return self.t

    def go(self, s):
        self.t += s


def answer_of(ex):
    return ex.cur["answer"]                 # the server's own copy (never in public())


def wrong_of(ex):
    """A wrong choice not given yet (the same wrong answer twice is ignored: a double tap)."""
    return next(c for c in ex.cur["choices"] if not exos.same(c, ex.cur["answer"]) and c not in ex.cur["faux"])


LEAK = ("answer", "explication", "calc", "hint")


def game(tmp):
    clk, toasts = Clock(), []
    path = Path(tmp) / "exos.json"
    ex = exos.Exos(path, clock=clk, rng=random.Random(1))
    ex.on_toast = toasts.append
    pub = ex.public()
    check("nothing in play at first; default settings: level 2, adapts, every kind, goal 5, no spontaneous questions",
          pub["cur"] is None and pub["reglages"] == {"niveau": 2, "auto": True, "types": exos.IDS, "objectif": 5, "propose": False} and len(pub["kinds"]) == 15)

    ex.nouveau(kind="table", niveau=3)
    p = ex.public()["cur"]
    check("a new exercise: the question, 4 choices, no answer, no hint, no correction in what the screens get",
          p and p["etat"] == "question" and len(p["choices"]) == 4 and not set(LEAK) & set(p) and ex.public()["ev"]["kind"] == "propose", str(p))
    check("…nor anywhere else in the snapshot (the correction text is nowhere)", ex.cur["explication"] not in json.dumps(ex.public(), ensure_ascii=False))
    wrong = wrong_of(ex)
    r = ex.repondre(wrong)
    p = ex.public()["cur"]
    check("a first wrong answer: the hint and a second try, the wrong choice remembered, Pixel encourages",
          r == "indice" and p["tries"] == 1 and p["hint"] and p["faux"] == [wrong] and "answer" not in p and ex.ev["kind"] == "faux" and ex.ev["essai"] == 1, str(p))
    ex.repondre(wrong_of(ex))
    p = ex.public()["cur"]
    check("a second wrong answer: the correction (the answer and how to find it)",
          p["etat"] == "resultat" and p["ok"] is False and p["answer"] and p["explication"] and ex.ev["kind"] == "faux" and ex.ev["essai"] == 2, str(p))
    st = ex.public()["stats"]
    check("…counted once: 1 exercise, 0 right, today 1", st["total"] == 1 and st["justes"] == 0 and st["aujourdhui"] == 1 and st["serie"] == 0, str(st))
    check("the first exercise brings a trophy (with a banner)", "premier" in st["trophees"] and toasts == ["Trophée : Premier exo !"], str(toasts))
    clk.go(3)
    check("the correction stays on the screen a while…", not ex.tick() and ex.cur is not None)
    clk.go(10)
    check("…then the exercise goes away (back to the face)", ex.tick() and ex.cur is None and ex.public()["last"]["ok"] is False)

    ex.nouveau(kind="addition", niveau=1)
    a = answer_of(ex)
    check("a right answer at once: « juste », a streak of 1", ex.repondre(a) is True and ex.ev["kind"] == "juste" and ex.ev["essai"] == 1 and ex.stats["serie"] == 1)
    ex.nouveau(kind="addition", niveau=1)
    ex.repondre(wrong_of(ex))
    check("right on the second try: right, but the streak starts again", ex.repondre(answer_of(ex)) is True and ex.ev["essai"] == 2 and ex.stats["serie"] == 0)
    ex.nouveau(kind="soustraction", niveau=1)
    ex.indice()
    check("asking for the hint shows it without a wrong answer", ex.public()["cur"]["hint"] == ex.cur["hint"] and ex.cur["tries"] == 0)
    total = ex.stats["total"]
    ex.passer()
    check("skipping shows the answer, is not counted", ex.cur["etat"] == "resultat" and ex.cur["passe"] and ex.stats["total"] == total)
    ex.passer()
    check("…and skipping again goes on (an exercise alone: it is over)", ex.cur is None)

    # a series of 5, all right
    ex.nouveau(mode="serie", kind="double", niveau=2)
    seen = []
    for i in range(5):
        seen.append(ex.cur["i"])
        ex.repondre(answer_of(ex))
        clk.go(1)
        ex.tick()
        check(f"series: question {i + 1}/5, the next one waits a moment", ex.cur["etat"] == "resultat") if i == 0 else None
        clk.go(4)                           # 5 s: a milestone holds the result a little longer (CHEER_MS)
        ex.tick()
    p = ex.public()["cur"]
    check("a series of 5: 1/5 to 5/5, then the summary 5/5 and Pixel celebrates", seen == [1, 2, 3, 4, 5] and p["etat"] == "bilan" and p["bons"] == 5 and p["total"] == 5
          and ex.ev["kind"] == "serie" and ex.ev["fin"] is True, str(p))
    check("a streak of 5 right answers is a milestone too (and a trophy)", ex.stats["serie"] >= 5 and "serie5" in ex.stats["trophees"])
    clk.go(15)
    ex.tick()
    check("the summary goes away by itself", ex.cur is None)

    # the table of 7
    ex.nouveau(mode="table", table=7)
    ks = []
    while ex.cur and ex.cur["etat"] != "bilan":
        m = re.fullmatch(r"7 × (\d+) = \?", ex.cur["q"])
        ks.append(int(m.group(1)) if m else -1)
        ex.repondre(str(7 * ks[-1]))
        clk.go(5)
        ex.tick()
    check("« table de 7 »: 10 questions 7 × 1 to 7 × 10 in any order, all right by typing the product", sorted(ks) == list(range(1, 11)) and ex.cur["bons"] == 10, str(ks))
    ex.stop()

    # the 60 s challenge
    ex.nouveau(mode="chrono", kind="addition", niveau=1)
    p = ex.public()["cur"]
    check("the challenge: 60 s on the clock, sent to the screens", p["mode"] == "chrono" and p["left"] == 60 and p["ends_at"] > clk() * 1000, str(p))
    first = ex.cur["id"]
    ex.repondre(answer_of(ex))
    check("…a right answer: the next one at once", ex.cur["id"] != first and ex.cur["etat"] == "question" and ex.last["ok"])
    before = ex.cur["id"]
    ex.repondre(wrong_of(ex))
    check("…a wrong one: no second try in the challenge, on to the next one", ex.cur["id"] != before and ex.last["ok"] is False and ex.last["id"] == before)
    ex.repondre(answer_of(ex))
    ex.repondre(answer_of(ex))
    clk.go(61)
    ex.tick()
    p = ex.public()["cur"]
    check("time is up: the summary, 3 right, a new record", p["etat"] == "bilan" and p["bons"] == 3 and p["total"] == 4 and p["nouveau_record"] and ex.stats["record_chrono"] == 3, str(p))
    ex.stop()

    # levels
    ex2 = exos.Exos(None, clock=clk, rng=random.Random(2))
    ex2.set_reglages(niveau=2)
    for _ in range(3):
        ex2.nouveau(kind="carre")
        ex2.repondre(answer_of(ex2))
    up = ex2.level("carre")
    ex2.nouveau(kind="carre")
    ex2.repondre(wrong_of(ex2))
    ex2.repondre(wrong_of(ex2))
    down = ex2.level("carre")
    check("3 right answers in a row: one level up; a mistake: one level down", up == 3 and down == 2 and ex2.last.get("monte") is False, f"{up} {down}")
    check("…and the overall level moves too", ex2.global_level() == 2)
    ex2.nouveau(kind="carre", niveau=5)
    check("a level asked for (« exo difficile »): that level, and his own level does not move", ex2.cur["niveau"] == 5)
    ex2.repondre(wrong_of(ex2))
    ex2.repondre(wrong_of(ex2))
    check("…even after a mistake", ex2.level("carre") == 2)
    ex2.set_reglages(auto=False, niveau=4)
    for _ in range(4):
        ex2.nouveau(kind="carre")
        ex2.repondre(answer_of(ex2))
    check("a fixed level (settings): it stays", ex2.level("carre") == 4 and ex2.cur["niveau"] == 4)
    ex2.set_reglages(auto=True, niveau=1, types=["addition", "pas-un-type"], objectif=3)
    check("settings: a new start level for every kind, unknown kinds dropped", ex2.level("carre") == 1 and ex2.reglages["types"] == ["addition"] and ex2.reglages["objectif"] == 3)
    ex2.nouveau()
    check("a mixed exercise takes the chosen kinds", ex2.cur["kind"] == "addition")

    # double taps, late screens
    ex4 = exos.Exos(None, clock=clk, rng=random.Random(4))
    ex4.nouveau(kind="table", niveau=3)
    w, i0 = wrong_of(ex4), ex4.cur["id"]
    r1, r2 = ex4.repondre(w, i0), ex4.repondre(w, i0)
    check("a double tap on a wrong choice: the hint and a second try, the second tap ignored (not the correction)",
          r1 == "indice" and r2 is None and ex4.cur["etat"] == "question" and ex4.cur["tries"] == 1 and ex4.cur["faux"] == [w], str(ex4.cur["faux"]))
    check("…the same wrong number typed again is ignored too", ex4.repondre(" " + w + " ") is None and ex4.cur["tries"] == 1)
    check("an answer naming another exercise (a late screen) is ignored", ex4.repondre(answer_of(ex4), i0 - 1) is None and ex4.cur["etat"] == "question")
    check("…its own id answers it", ex4.repondre(answer_of(ex4), str(i0)) is True)
    ex4.nouveau(mode="serie", kind="double", niveau=1)
    i1 = ex4.cur["id"]
    ex4.passer(i1, "question")
    ex4.passer(i1, "question")
    check("a double tap on « Passer »: the answer shown, the second tap does not skip it", ex4.cur["etat"] == "resultat" and ex4.cur["id"] == i1 and ex4.cur["passe"])
    ex4.passer(i1, "resultat")
    check("…« Suivant » then goes on", ex4.cur["id"] != i1 and ex4.cur["etat"] == "question")
    ex4.nouveau(mode="chrono", kind="addition", niveau=1)
    i2, a2 = ex4.cur["id"], answer_of(ex4)
    ex4.repondre(a2, i2)
    i3, total = ex4.cur["id"], ex4.stats["total"]
    check("the challenge: a double tap on the right answer is not a mistake on the next question",
          ex4.repondre(a2, i2) is None and ex4.cur["id"] == i3 and ex4.stats["total"] == total and ex4.run["bons"] == 1 and ex4.last["ok"])
    ex4.stop()

    # his celebrations are not cut
    ex5 = exos.Exos(None, clock=clk, rng=random.Random(5))
    ex5.set_reglages(objectif=2)
    ex5.nouveau(mode="serie", n=2, kind="double", niveau=1)
    ex5.repondre(answer_of(ex5))
    check("a series: a right answer, the next question 2 s later", ex5.cur["next_at"] - ex5.ms() == 2000)
    clk.go(2)
    ex5.tick()
    ex5.repondre(answer_of(ex5))
    wait = ex5.cur["next_at"] - ex5.ms()
    check("its last one reaches the daily goal: the result stays 5 s, so « Objectif du jour » plays to its end before the summary",
          ex5.ev["kind"] == "objectif" and wait >= exos.CHEER_MS, f"{ex5.ev} {wait}")
    clk.go(2.2)
    ex5.tick()
    check("…no summary 2 s later", ex5.cur["etat"] == "resultat")
    clk.go(3)
    ex5.tick()
    check("…then the summary", ex5.cur["etat"] == "bilan" and ex5.ev["kind"] == "serie" and ex5.ev["fin"])
    ex5.stop()
    ex5.nouveau(mode="serie", n=2, kind="double", niveau=1)
    ex5.repondre(answer_of(ex5))
    clk.go(2)
    ex5.tick()
    ex5.repondre(answer_of(ex5))
    check("the last one of a series, no milestone: 3 s, his cheer ends before the summary", ex5.cur["next_at"] - ex5.ms() == 3000 and ex5.ev["kind"] == "juste")
    ex5.stop()

    # « encore », « une autre »
    ex6 = exos.Exos(None, clock=clk, rng=random.Random(6))
    check("nothing played: « encore » is not for the exercises", not ex6.wants_again())
    ex6.nouveau(kind="double", niveau=1)
    check("an exercise open: it is", ex6.wants_again())
    ex6.repondre(answer_of(ex6))
    clk.go(7)
    ex6.tick()
    check("just after one ended by itself: it is", ex6.cur is None and ex6.wants_again())
    clk.go(150)
    check("…but not minutes later (« une autre » is Claude's again)", not ex6.wants_again())
    ex6.nouveau(kind="double", niveau=1)
    ex6.stop(user=True)
    check("nor after « Fini » or « stop exo »", not ex6.wants_again())

    # the daily goal
    ex3 = exos.Exos(None, clock=clk, rng=random.Random(3))
    got = []
    ex3.on_toast = got.append
    ex3.set_reglages(objectif=3)
    for _ in range(3):
        ex3.nouveau(kind="double", niveau=1)
        ex3.repondre(answer_of(ex3))
    check("the daily goal (3): reached on the 3rd, a cup, Pixel celebrates", ex3.ev["kind"] == "objectif" and ex3.stats["coupes"] == 1 and ex3.public()["stats"]["fait"]
          and any("Objectif du jour" in m for m in got), str(ex3.ev))
    ex3.nouveau(kind="double", niveau=1)
    ex3.repondre(answer_of(ex3))
    check("…only once a day", ex3.stats["coupes"] == 1 and ex3.ev["kind"] == "juste")
    clk.go(24 * 3600)
    ex3.tick()
    check("a new day: today's count starts again", ex3.stats["aujourdhui"] == 0 and not ex3.public()["stats"]["fait"])

    # left alone, and the files
    ex.nouveau(kind="suite")
    clk.go(9 * 60)
    check("an exercise left alone 8 minutes is put away", ex.tick() and ex.cur is None)
    ex.set_reglages(propose=True, objectif=7)
    again = exos.Exos(path, clock=clk)
    check("stats, levels and settings are kept in exos.json", again.stats["total"] == ex.stats["total"] and again.stats["record_chrono"] == 3
          and again.reglages["propose"] is True and again.reglages["objectif"] == 7 and again.stats["niveaux"] == ex.stats["niveaux"], str(again.stats["total"]))
    path.write_text("{pas du json")
    broken = exos.Exos(path, clock=clk)
    check("a broken exos.json: a fresh start, no crash", broken.stats["total"] == 0 and broken.reglages["objectif"] == 5)
    shapes, crashed = ["null", "[]", '"x"', '{"reglages": "x"}', '{"reglages": {"save": true, "niveau": [1], "types": [{}]}}', '{"stats": "x"}',
                       '{"stats": {"par_type": {"table": 5, "carre": {"n": 3, "ok": 9}}, "niveaux": {"table": "x", "carre": 9}, "trophees": [1, {}],'
                       ' "montee": {"table": 99}, "total": true, "jour": 5, "niveau": 8}}'], []
    for bad in shapes:
        path.write_text(bad)
        try:
            b = exos.Exos(path, clock=clk)
            b.public()
            b.nouveau(kind="carre")
            b.repondre(answer_of(b))
            b.public()
            b.summary()
            if b.stats["par_type"].get("carre", {}).get("ok", 0) > b.stats["par_type"].get("carre", {}).get("n", 0) or b.stats["trophees"] != ["premier"]:
                crashed.append(bad + " (kept as it was)")
        except Exception as e:
            crashed.append(f"{bad}: {type(e).__name__} {e}")
    check("an exos.json of the wrong shape (null, a list, odd values): a fresh start for what is wrong, no crash", not crashed, " | ".join(crashed[:2]))
    s = exos.Exos(None, clock=clk)
    s.stats.update(total=12, justes=9, aujourdhui=2, serie_max=4)
    check("« mes scores »: a short summary", "Aujourd'hui : 2 exos sur 5" in s.summary() and "75 % de justes" in s.summary(), s.summary())


# ---------- through a demo server ----------
def start_server(port, datadir):
    try:
        socket.create_connection(("127.0.0.1", port), 0.2).close()
        raise SystemExit(f"le port {port} est déjà pris")
    except OSError:
        pass
    cfg = Path(datadir) / "config.toml"
    cfg.write_text(f'data_dir = "{datadir}"\n')
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


async def server(tmp):
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

            async def cmd(text, wait=0.35):
                await act("cmd", wait, text=text)

            E = lambda: state["exos"]  # noqa: E731
            C = lambda: state["exos"]["cur"]  # noqa: E731
            await pump(0.5)
            check("the snapshot has 'exos': nothing in play, the settings, 15 kinds", E()["cur"] is None and len(E()["kinds"]) == 15 and E()["reglages"]["objectif"] == 5)
            msgs = len(state["chat"]["messages"])
            await cmd("42", 1.6)
            check("no exercise open: a bare number still goes to Claude", len(state["chat"]["messages"]) > msgs and state["screen"] == "claude", state["screen"])
            await cmd("une question")
            check("« une question » alone is still for Claude", C() is None and state["screen"] == "claude")
            await cmd("une question de maths")
            check("« une question de maths »: an exercise", C() is not None and C()["etat"] == "question")
            await cmd("exo")
            check("« exo »: an exercise on his face screen", C() and C()["etat"] == "question" and state["screen"] == "visage" and C()["mode"] == "exo", str(C()))
            check("…the snapshot never has its answer", not set(LEAK) & set(C()))
            msgs = len(state["chat"]["messages"])
            await cmd("123456")
            check("an exercise open: a bare number is its answer, not a question for Claude",
                  len(state["chat"]["messages"]) == msgs and (C()["tries"] == 1 or C()["etat"] == "resultat"), str(C()))
            await cmd("salon 40")
            check("…but « salon 40 » is still for the lights", state["lights"]["rooms"][0]["bri"] == 40)
            await cmd("stop exo")
            check("« stop exo »", C() is None)
            await cmd("table de 7")
            q = C()["q"]
            k = int(re.fullmatch(r"7 × (\d+) = \?", q).group(1))
            await cmd(f"réponse {7 * k}")
            check("« table de 7 », then « réponse 56 » typed: right", C()["mode"] == "table" and C()["etat"] == "resultat" and C()["ok"] and E()["ev"]["kind"] == "juste", str(C()))
            await pump(2.3)
            q2 = C()["q"]
            k2 = int(re.fullmatch(r"7 × (\d+) = \?", q2).group(1))
            await cmd(str(7 * k2 + 1))
            check("a wrong number typed: the hint", C()["tries"] == 1 and C().get("hint"), str(C()))
            await cmd(f"{7 * k2} !")
            check("…then the right one (« 63 ! »)", C()["ok"] and C()["i"] == 2, str(C()))
            await cmd("indice")
            await cmd("mes scores")
            check("« mes scores »: a banner with today's count", "Aujourd'hui : 2 exos" in state["toast"]["msg"], state["toast"]["msg"])
            await cmd("défi chrono")
            check("« défi chrono »: 60 s", C()["mode"] == "chrono" and 55 <= C()["left"] <= 60, str(C()))
            await cmd("une énigme")
            check("« une énigme »", C()["kind"] == "enigme" and C()["mode"] == "exo")
            await cmd("un calcul")
            check("« un calcul »: a calculation", C()["kind"] in exos.CALCUL, C()["kind"])
            lv = E()["niveau"]
            await cmd("exo difficile")
            check("« exo difficile »: two levels above his own", C()["niveau"] == min(5, lv + 2), f"{C()['niveau']} {lv}")
            await cmd("exo de fractions")
            check("« exo de fractions »", C()["kind"] == "fraction")
            await cmd("série de 5")
            check("« série de 5 »", C()["mode"] == "serie" and C()["n"] == 5)
            await cmd("exo de maths")
            check("« exo de maths »", C()["mode"] == "exo" and C()["etat"] == "question")
            await act("exos.indice")
            check("exos.indice: the hint", bool(C().get("hint")))
            await act("exos.passer")
            check("exos.passer: the answer shown", C()["etat"] == "resultat" and C()["passe"] and C()["answer"])
            await act("exos.reglages", niveau=4, auto=False, objectif=8, propose=True, types=["table", "carre"])
            g = E()["reglages"]
            check("exos.reglages: level, fixed, goal, spontaneous questions, kinds", g == {"niveau": 4, "auto": False, "types": ["table", "carre"], "objectif": 8, "propose": True}, str(g))
            await act("exos.nouveau", mode="serie", n=3)
            check("exos.nouveau: a mixed series of 3 with the chosen kinds, at the fixed level", C()["n"] == 3 and C()["kind"] in ("table", "carre") and C()["niveau"] == 4, str(C()))
            await act("exos.stop")
            await act("exos.nouveau", kind="pas-un-type", mode="n'importe", niveau=99)
            check("unknown kind and mode: a plain exercise, the level kept in 1..5", C()["mode"] == "exo" and C()["niveau"] == 5)
            await act("exos.repondre", value="")
            check("an empty answer does nothing", C()["tries"] == 0)
            await act("exos.stop")
            await cmd("pause")
            check("« pause » is still the timer's (no exercise open)", C() is None)
            data = json.loads((Path(tmp) / "exos.json").read_text())
            check("the stats are saved in the data folder (exos.json)", data["stats"]["total"] >= 2 and data["reglages"]["objectif"] == 8)


async def commands_direct(tmp):
    """The typed commands on a hub of their own, on a fake clock: what goes to the exercise, what stays Claude's."""
    from pixel import commands
    hub = Hub({"data_dir": tmp}, demo=True)
    asked, toasts = [], []

    @hub.action("chat.ask")
    async def ask(text=""):
        asked.append(text)
        hub.s["screen"] = "claude"

    hub.toast = lambda msg, ms=3000: toasts.append(msg)
    ex = exos.setup(hub, tmp)
    clk = Clock()
    ex.clock = clk
    ex.R = random.Random(8)

    async def say(text):
        n = len(asked)
        await commands.run(hub, text)
        return len(asked) > n                                 # True: it went to Claude

    await say("exo")
    await say("stop exo")
    await say("raconte-moi une blague")
    check("« une autre » after « stop exo » and a joke: Claude's (another joke), not an exercise", await say("une autre") and ex.cur is None)
    check("« encore » too", await say("encore") and ex.cur is None)
    await say("exo")
    ex.repondre(answer_of(ex))
    clk.go(7)
    ex.tick()
    check("« une autre » just after an exercise ended by itself: another exercise", not await say("une autre") and ex.cur is not None)
    ex.stop()
    clk.go(200)
    check("…minutes later: Claude's", await say("une autre") and ex.cur is None)
    ex.nouveau(kind="table", niveau=2)
    hub.s["screen"] = "visage"
    ex.repondre(answer_of(ex))
    check("a number typed during the correction: neither Claude's nor an answer, a short word instead",
          not await say("12") and hub.s["screen"] == "visage" and ex.cur["etat"] == "resultat" and toasts and "fini" in toasts[-1], str(toasts[-1:]))
    ex.nouveau(mode="serie", kind="table", niveau=2)
    ex.repondre(answer_of(ex))
    check("…during a series: « La question suivante arrive ! »", not await say("réponse 12") and toasts[-1] == "La question suivante arrive !")
    ex.stop()
    for _ in range(50):
        ex.nouveau(kind="addition", niveau=5)
        if len(re.sub(r"\D", "", ex.cur["answer"])) >= 4:
            break
    v = int(re.sub(r"\D", "", ex.cur["answer"])) + 100
    typed = f"{v // 1000} {v % 1000:03d}"
    check(f"a number with a thousands space (« {typed} »): the exercise's answer, not Claude's", not await say(typed) and ex.cur["tries"] == 1, str(ex.cur["faux"]))
    check("…and the right one the same way", not await say(ex.cur["answer"].replace("\u00a0", " ")) and ex.cur["ok"])
    hub.exos_task.cancel()


async def claude_tool(tmp):
    tool = next((t for t in TOOLS if t["name"] == "start_exercise"), None)
    check("Claude has a start_exercise tool (kind, mode, level, table)", tool and set(tool["input_schema"]["properties"]) == {"kind", "mode", "niveau", "table"}
          and tool["eager_input_streaming"])
    check("…its input is checked", claude_check("start_exercise", {}) is None and claude_check("start_exercise", {"kind": "table", "mode": "table", "table": 7}) is None
          and claude_check("start_exercise", {"kind": "pirate"}) and claude_check("start_exercise", {"niveau": 9}))
    hub = Hub({"data_dir": tmp}, demo=True)
    exos.setup(hub, tmp)
    from pixel.claude import Claude
    c = Claude(hub, {})
    out = await c.run_tool("start_exercise", {"kind": "table", "mode": "table", "table": 8})
    cur = hub.exos.cur
    check("Claude's tool shows the exercise; what it hears back has the question, not the answer",
          cur and cur["mode"] == "table" and cur["q"] in out and cur["explication"] not in out and "Ne donne pas la réponse" in out and hub.s["screen"] == "visage", out)


if __name__ == "__main__":
    generator()
    with tempfile.TemporaryDirectory() as tmp:
        game(tmp)
    with tempfile.TemporaryDirectory() as tmp:
        asyncio.run(claude_tool(tmp))
    with tempfile.TemporaryDirectory() as tmp:
        asyncio.run(commands_direct(tmp))
    with tempfile.TemporaryDirectory() as tmp:
        (Path(tmp) / "exos.json").write_text("null")          # valid JSON of the wrong shape: Pixel starts all the same
        srv = start_server(PORT, tmp)
        try:
            asyncio.run(server(tmp))
        finally:
            srv.terminate()
            srv.wait()
    print("\n%d failure(s)" % len(fails))
    sys.exit(1 if fails else 0)
