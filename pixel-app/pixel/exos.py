"""Little math exercises (and riddles) that Pixel gives: the generator, the game, its stats.

15 kinds (KINDS) at 5 levels, 1 ≈ CP/CE1 to 5 ≈ collège. generate(kind, level, rng) returns a question with 4 choices: the
right answer and 3 classic mistakes (the carry forgotten, × read as +, 1,5 h read as 1 h 50…), a hint for the second try
and a short correction (« 7 × 8 = 56 : 7 × 4 = 28, et 28 × 2 = 56. »). Pure and seedable: random.Random(seed).
The game (Exos): one exercise, a series of 5, a multiplication table, the 60 s challenge. A wrong answer gives the hint and
a second try, a second wrong one the correction (in the challenge, no second try: on to the next one). Three right answers
in a row raise the level of that kind, a mistake lowers it, unless the level is fixed in the settings. Stats, levels and
settings are kept in data_dir/exos.json. The right answer never leaves the server before the exercise is answered:
public() is what the screens get, the snapshot key "exos".
setup(hub, datadir) wires the actions exos.*; command() reads the typed commands for pixel/commands.py; TOOL, check_tool
and run_tool give Claude start_exercise. Each screen plays Pixel's reactions itself (web/scenes/exos.js), from "ev".
"""
import asyncio
import json
import logging
import math
import os
import random
import re
import time
import unicodedata
from decimal import Decimal
from pathlib import Path

log = logging.getLogger("pixel.exos")

KINDS = [("addition", "Additions"), ("soustraction", "Soustractions"), ("table", "Tables de multiplication"),
         ("division", "Divisions"), ("complement", "Compléments"), ("double", "Doubles et moitiés"),
         ("mental", "Calcul mental"), ("comparaison", "Comparaisons"), ("suite", "Suites logiques"),
         ("probleme", "Petits problèmes"), ("heure", "Heures et durées"), ("fraction", "Fractions"),
         ("pourcentage", "Pourcentages"), ("carre", "Carrés"), ("enigme", "Énigmes")]
LABEL = dict(KINDS)
IDS = [k for k, _ in KINDS]
MIN_MIX = {"division": 2, "carre": 2, "pourcentage": 3, "fraction": 2}   # a mixed exercise picks these from that level up
CALCUL = ["addition", "soustraction", "table", "division", "complement", "double", "mental"]   # « un calcul »
MODES = {"exo": 1, "serie": 5, "table": 10, "chrono": 0}
CHRONO_MS = 60000
IDLE_CLOSE_MS = 8 * 60000          # an exercise left alone that long is put away (the face comes back)
MILESTONES = (5, 10, 15, 20, 30, 40, 50, 75, 100)
UP_AFTER = 3                       # right answers in a row (first try, no hint) to go up a level
AGAIN_MS = 2 * 60000               # « encore », « une autre »: an exercise is open, or one ended that recently
CHEER_MS = 5000                    # a milestone (the daily goal, a streak): the result stays that long, his scene plays to its end
NB = "\u00a0"                      # keeps a number or "7 × 8" on one line
D = Decimal
TROPHIES = [("premier", "Premier exo", lambda s: s["total"] >= 1), ("serie5", "5 d'affilée", lambda s: s["serie_max"] >= 5),
            ("serie10", "10 d'affilée", lambda s: s["serie_max"] >= 10), ("serie20", "20 d'affilée", lambda s: s["serie_max"] >= 20),
            ("objectif", "Objectif du jour", lambda s: s["coupes"] >= 1), ("semaine", "7 objectifs", lambda s: s["coupes"] >= 7),
            ("chrono10", "10 en 1 minute", lambda s: s["record_chrono"] >= 10), ("cent", "100 exos", lambda s: s["total"] >= 100),
            ("niveau5", "Niveau 5", lambda s: 5 in s["niveaux"].values()),
            ("enigmes", "5 énigmes", lambda s: s["par_type"].get("enigme", {}).get("ok", 0) >= 5),
            ("tables", "As des tables", lambda s: s["par_type"].get("table", {}).get("ok", 0) >= 50)]
TROPHY = {i: label for i, label, _ in TROPHIES}


# ---------- numbers the French way, and answers compared whatever way they are typed ----------
def fmt(v):
    """4,5 · 1 250 · −3 · strings as they are."""
    if isinstance(v, str):
        return v
    d = v if isinstance(v, Decimal) else D(str(v))
    sign, d = ("−" if d < 0 else ""), abs(d)
    whole = int(d)
    frac = format(d - whole, "f").lstrip("0").rstrip("0").rstrip(".") if d != whole else ""
    ip = f"{whole:,}".replace(",", NB) if whole >= 1000 else str(whole)
    return sign + ip + (("," + frac[1:]) if frac else "")


def hm(minutes):
    """A time of day from minutes after midnight: 9 h · 10 h 05."""
    h, m = divmod(int(minutes) % 1440, 60)
    return f"{h}{NB}h" + (f"{NB}{m:02d}" if m else "")


def dur(minutes):
    return f"{int(minutes)}{NB}min"


def norm(s):
    s = unicodedata.normalize("NFD", str(s).lower().strip())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def canon(s):
    """An answer reduced to compare it: "10 h 05" = "10h5" = "10:05"; "4,5" = "4.5"; "85 min" = "85"; "Léa" = "lea"."""
    s = norm(s).replace("−", "-").replace("–", "-")
    s = re.sub(r"[\s\u00a0\u202f'’]+", "", s).rstrip("!.?")
    s = re.sub(r"^(?:=|lareponseest|lareponse|reponse|cest)", "", s)
    m = re.fullmatch(r"(\d{1,2})(?:h|:)(\d{0,2})", s)
    if m:
        return f"{int(m.group(1))}h{int(m.group(2) or 0):02d}"
    m = re.fullmatch(r"(-?\d+(?:[.,]\d+)?)(?:minutes?|mn|min|euros?|€|%|kg|jours?|pattes?|roues?|ans?)?", s)
    if m:
        return format(D(m.group(1).replace(",", ".")).normalize(), "f")
    return s


def same(value, answer):
    a, b = canon(value), canon(answer)
    if a == b:
        return True
    if re.fullmatch(r"\d{1,2}h00", b) and a == b[:-3]:          # "10" for "10 h"
        return True
    return False


# ---------- the generator ----------
def _choices(R, ans, wrong, steps=(1, 10, 2, 5, 3, 20, 100), nonneg=True):
    """The answer and 3 distinct mistakes: the classic ones first, then near values."""
    key = lambda v: canon(fmt(v))  # noqa: E731
    seen, out = {key(ans)}, []
    numeric = not isinstance(ans, str)
    for w in wrong:
        if w is None or (numeric and isinstance(w, str)):
            continue
        if numeric and nonneg and w < 0:
            continue
        if numeric and isinstance(w, Decimal) and w == w.to_integral_value() and not isinstance(ans, Decimal):
            w = int(w)
        k = key(w)
        if k not in seen:
            seen.add(k)
            out.append(w)
        if len(out) == 3:
            break
    if numeric:
        for st in steps:
            for sg in R.sample((1, -1), 2):
                if len(out) == 3:
                    break
                w = ans + sg * (D(str(st)) if isinstance(ans, Decimal) else st)
                if (nonneg and w < 0) or key(w) in seen:
                    continue
                seen.add(key(w))
                out.append(w)
    out = out[:3]
    ch = [fmt(ans)] + [fmt(w) for w in out]
    R.shuffle(ch)
    return fmt(ans), ch


def _split(b):
    """348 -> (300, 48): the first part to add, then the rest (for the corrections)."""
    p = 10 ** (len(str(b)) - 1)
    return (b - b % p, b % p) if b >= 10 else (b, 0)


def _nocarry(a, b, sub=False):
    """The digit-by-digit mistake: adding without the carry, or the smaller digit from the bigger one."""
    sa, sb = str(a), str(b).rjust(len(str(a)), "0")
    if len(sb) > len(sa):
        sa = sa.rjust(len(sb), "0")
    ds = [abs(int(x) - int(y)) if sub else (int(x) + int(y)) % 10 for x, y in zip(sa, sb)]
    return int("".join(map(str, ds)))


def g_addition(lv, R):
    if lv == 1:
        a = R.randint(1, 9)
        b = R.randint(1, 10 - a) if a < 9 else 1
    elif lv == 2:
        a, b = R.randint(11, 79), R.randint(2, 9)
    elif lv == 3:
        a = R.randint(15, 69)                                       # two digits, with a carry
        b = 10 * R.randint(1, max(1, 8 - a // 10)) + (R.randint(max(1, 10 - a % 10), 9) if a % 10 else R.randint(1, 9))
    elif lv == 4:
        a, b = R.randint(120, 699), R.randint(45, 299)
    else:
        a, b = (D(R.randint(1, 8) * 10 + R.randint(1, 9)) / 10, D(R.randint(1, 8) * 10 + R.randint(1, 9)) / 10) if R.random() < 0.5 else (R.randint(1200, 4800), R.randint(350, 2900))
    s = a + b
    calc = f"{a} + {b}"
    if isinstance(a, Decimal):
        ta, tb = int(a * 10), int(b * 10)
        bad = D(f"{int(a) + int(b)}.{ta % 10 + tb % 10}")          # 3,7 + 4,5 = 7,12: the tenths added like a whole number
        wrong = [bad, s - 1, s + 1, s + D("0.1"), s - D("0.1")]
        return (f"{fmt(a)} + {fmt(b)} = ?", s, wrong, "Aligne les virgules : les dixièmes avec les dixièmes.",
                f"{fmt(a)} + {fmt(b)} = {fmt(s)} : {ta} dixièmes + {tb} dixièmes = {ta + tb} dixièmes.", calc, (D("0.1"), 1, D("0.2")))
    carry = a % 10 + b % 10 >= 10
    wrong = [s - 10 if carry else s + 10, _nocarry(a, b), s + 1, s - 1, a - b if a > b and lv < 3 else None, s + 2]
    if lv == 1:
        hint, ex = f"Compte à partir de {a} : encore {b}.", f"{a} + {b} = {s} : à partir de {a}, avance de {b}."
    else:
        b1, b2 = _split(b)
        hint = "Ajoute d'abord les dizaines, puis les unités." if lv < 4 else f"Ajoute d'abord {fmt(b1)}, puis {fmt(b2)}."
        ex = f"{fmt(a)} + {fmt(b)} = {fmt(s)} : {fmt(a)} + {fmt(b1)} = {fmt(a + b1)}, puis {fmt(a + b1)} + {fmt(b2)} = {fmt(s)}." if b2 else f"{fmt(a)} + {fmt(b)} = {fmt(s)}."
    return f"{fmt(a)} + {fmt(b)} = ?", s, wrong, hint, ex, calc, None


def g_soustraction(lv, R):
    if lv == 1:
        a = R.randint(3, 10)
        b = R.randint(1, a - 1)
    elif lv == 2:
        if R.random() < 0.5:
            a, b = R.randint(11, 20), R.randint(2, 9)
        else:
            a = 10 * R.randint(3, 9)
            b = 10 * R.randint(1, a // 10 - 1)
    elif lv == 3:
        a = R.randint(31, 98)
        b = 10 * R.randint(1, a // 10 - 1) + R.randint(a % 10 + 1, 9) if a % 10 < 9 else R.randint(11, a - 6)
    elif lv == 4:
        a = R.randint(300, 999)
        b = R.randint(105, a - 50)
    else:
        if R.random() < 0.5:
            a = D(R.randint(40, 99)) / 10
            b = D(R.randint(11, int(a * 10) - 5)) / 10
        else:
            a = R.randint(2000, 9000)
            b = R.randint(300, a - 200)
    d = a - b
    calc = f"{a} - {b}"
    if isinstance(a, Decimal):
        wrong = [d + 1, d - 1, d + D("0.1"), d - D("0.1"), a + b]
        ta, tb = int(a * 10), int(b * 10)
        return (f"{fmt(a)} − {fmt(b)} = ?", d, wrong, "Aligne les virgules, et pense aux retenues.",
                f"{fmt(a)} − {fmt(b)} = {fmt(d)} : {ta} dixièmes − {tb} dixièmes = {ta - tb} dixièmes.", calc, (D("0.1"), 1, D("0.2")))
    wrong = [_nocarry(a, b, sub=True), d + 10, d - 10, d + 1, d - 1, a + b if lv < 3 else None, d + 2]
    if lv == 1:
        hint, ex = f"Recule de {b} à partir de {a}.", f"{a} − {b} = {d} : car {d} + {b} = {a}."
    else:
        b1, b2 = _split(b)
        hint = "Enlève d'abord les dizaines, puis les unités." if lv < 4 else f"Enlève d'abord {fmt(b1)}, puis {fmt(b2)}."
        ex = (f"{fmt(a)} − {fmt(b)} = {fmt(d)} : {fmt(a)} − {fmt(b1)} = {fmt(a - b1)}, puis {fmt(a - b1)} − {fmt(b2)} = {fmt(d)}."
              if b2 else f"{fmt(a)} − {fmt(b)} = {fmt(d)} : car {fmt(d)} + {fmt(b)} = {fmt(a)}.")
    return f"{fmt(a)} − {fmt(b)} = ?", d, wrong, hint, ex, calc, None


def _times_help(n, m):
    """How to find n × m from what you know: (hint, correction)."""
    p = n * m
    if m == 1:
        return "Fois 1, le nombre ne change pas.", f"{n} × 1 = {n}."
    if m == 2:
        return f"C'est le double de {n}.", f"{n} × 2 = {p} : {n} + {n} = {p}."
    if m == 5 and n % 2 == 0:
        return f"Fais {n} × 10, puis la moitié.", f"{n} × 5 = {p} : {n} × 10 = {n * 10}, et la moitié, c'est {p}."
    if m == 9:
        return f"Fais {n} × 10, puis enlève {n}.", f"{n} × 9 = {p} : {n} × 10 = {n * 10}, et {n * 10} − {n} = {p}."
    if m == 10:
        return "Ajoute un zéro à droite.", f"{n} × 10 = {p}."
    if n >= 11:
        t, u = n - n % 10, n % 10
        return f"Décompose : {t} × {m}, puis {u} × {m}.", f"{n} × {m} = {p} : {t} × {m} = {t * m}, {u} × {m} = {u * m}, et {t * m} + {u * m} = {p}."
    if m % 2 == 0:
        return f"Calcule {n} × {m // 2}, puis double.", f"{n} × {m} = {p} : {n} × {m} = {n} × {m // 2} × 2, {n} × {m // 2} = {n * m // 2}, et {n * m // 2} × 2 = {p}."
    return f"Calcule {n} × {m - 1}, puis ajoute {n}.", f"{n} × {m} = {p} : {n} × {m - 1} = {n * (m - 1)}, et {n * (m - 1)} + {n} = {p}."


def g_table(lv, R, table=None, k=None):
    if table:
        n = table
        m = k or R.randint(2, 10)
    elif lv == 1:
        n, m = R.choice((2, 5, 10)), R.randint(1, 10)
    elif lv == 2:
        n, m = R.choice((2, 3, 4, 5, 10)), R.randint(2, 10)
    elif lv == 3:
        n, m = R.randint(2, 9), R.randint(2, 9)
    elif lv == 4:
        n, m = R.randint(6, 9), R.randint(6, 9)
    else:
        n, m = R.randint(12, 25), R.randint(3, 9)
    p = n * m
    hint, ex = _times_help(n, m)
    q = f"{n} × {m} = ?" if table or n >= 11 or R.random() < 0.6 else f"{m} × {n} = ?"
    wrong = [n * (m + 1), n * (m - 1), (n + 1) * m, (n - 1) * m, n + m, p + 1, p - 1, p + 10]
    if p == 56:
        wrong.insert(0, 54)                  # 7 × 8 and 6 × 9 get mixed up
    if p == 54:
        wrong.insert(0, 56)
    return q, p, wrong, hint, ex, f"{n} * {m}", None


def g_division(lv, R):
    d = {1: 2, 2: R.choice((2, 5, 10)), 3: R.randint(3, 9), 4: R.randint(3, 9)}.get(lv) or R.choice((4, 6, 7, 8, 9, 12, 15, 25))
    q = {1: R.randint(1, 10), 2: R.randint(2, 10), 3: R.randint(2, 10), 4: R.randint(11, 25)}.get(lv) or R.randint(12, 40)
    n = d * q
    wrong = [q + 1, q - 1, n - d, n // (d + 1) if n % (d + 1) == 0 else None, n // (d - 1) if d > 2 and n % (d - 1) == 0 else None, q + 10, q * 2]
    hint = f"Cherche dans la table de {d} : {d} × ? = {n}." if lv < 4 else f"Pense à {d} × 10 = {d * 10}, puis à ce qui reste."
    ex = f"{fmt(n)} ÷ {d} = {q} : car {d} × {q} = {fmt(n)}."
    return f"{fmt(n)} ÷ {d} = ?", q, wrong, hint, ex, f"{n} / {d}", None


def g_complement(lv, R):
    if lv == 1:
        a, t = R.randint(1, 9), 10
    elif lv == 2:
        if R.random() < 0.5:
            a, t = R.randint(11, 19), 20
        else:
            a = 10 * R.randint(2, 8) + R.randint(1, 9)
            t = a - a % 10 + 10
    elif lv == 3:
        a, t = 10 * R.randint(1, 8) + R.randint(1, 9), 100
    elif lv == 4:
        a, t = 5 * R.randint(21, 179), 1000
    else:
        if R.random() < 0.5:
            a, t = D(R.randint(11, 99)) / 100, D(1)
            if a * 100 % 10 == 0:
                a += D("0.03")
        else:
            a, t = D(R.randint(11, 99)) / 10, D(10)
            if a * 10 % 10 == 0:
                a += D("0.3")
    c = t - a
    calc = f"{t} - {a}"
    if isinstance(a, Decimal):
        if t == 1:                                                  # 0,37 + ? = 1: 0,73 when each digit is taken to 10
            d1, d2 = int(a * 10) % 10, int(a * 100) % 10
            bad, nxt, step = D(f"0.{10 - d1}{10 - d2}"), D(math.ceil(a * 10)) / 10, D("0.01")
        else:                                                       # 6,4 + ? = 10: 4,6
            bad, nxt, step = D(f"{10 - int(a)}.{10 - int(a * 10) % 10}"), D(math.ceil(a)), D("0.1")
        wrong = [bad, c + step * 10, c - step * 10, a, c + step]
        return (f"{fmt(a)} + ? = {fmt(t)}", c, wrong, f"Va d'abord jusqu'à {fmt(nxt)}, puis jusqu'à {fmt(t)}.",
                f"{fmt(a)} + {fmt(c)} = {fmt(t)} : {fmt(a)} + {fmt(nxt - a)} = {fmt(nxt)}, puis {fmt(nxt)} + {fmt(t - nxt)} = {fmt(t)}." if nxt != t else
                f"{fmt(a)} + {fmt(c)} = {fmt(t)}.", calc, (step, step * 10, step * 2))
    nxt = a - a % 10 + 10 if a % 10 else a
    if t == 1000:
        nxt = a - a % 100 + 100 if a % 100 else a
    digit = int("".join(str(10 - int(x)) if x != "0" else "0" for x in str(a))[-3:]) if t >= 100 else None
    wrong = [digit, c + 10, c - 10, c + 1, c - 1, a, t + a if lv == 1 else None]
    if t == 1000:
        wrong = [digit, c + 100, c - 100, c + 10, c - 10, c + 1]
    if nxt == t or lv == 1:
        hint, ex = f"Compte de {a} jusqu'à {t}.", f"{a} + {c} = {t}."
    else:
        hint = f"Va d'abord jusqu'à {nxt}, puis jusqu'à {t}."
        ex = f"{a} + {c} = {t} : {a} + {nxt - a} = {nxt}, puis {nxt} + {t - nxt} = {t}."
    return f"{fmt(a)} + ? = {fmt(t)}", c, wrong, hint, ex, calc, None


def g_double(lv, R):
    dbl = R.random() < 0.5
    if lv == 5 and not dbl:
        x = R.randint(5, 49) * 2 + 1                                  # an odd number: a half with ",5"
        h = D(x) / 2
        return (f"La moitié de {x} ?", h, [D(x) * 2, h + D("0.5"), h - D("0.5"), D(x // 2) + 1, h + 1],
                f"La moitié de {x - 1}, puis la moitié de 1.", f"La moitié de {x} = {fmt(h)} : {fmt(h)} + {fmt(h)} = {x}.", f"{x} / 2", (D("0.5"), 1, 10))
    if lv == 5:
        x = D(R.randint(11, 49)) / 10
        return (f"Le double de {fmt(x)} ?", x * 2, [x / 2, x * 2 + 1, x * 2 - D("0.1"), x + 2, x * 2 + D("0.1")],
                f"Le double, c'est {fmt(x)} + {fmt(x)}.", f"Le double de {fmt(x)} = {fmt(x * 2)} : {fmt(x)} + {fmt(x)} = {fmt(x * 2)}.", f"{x} * 2", (D("0.1"), 1, D("0.2")))
    lo, hi = {1: (1, 10), 2: (11, 30), 3: (26, 99), 4: (105, 499)}[lv]
    x = R.randint(lo, hi)
    if dbl:
        r = 2 * x
        t, u = x - x % 10, x % 10
        ex = (f"Le double de {fmt(x)} = {fmt(r)} : le double de {fmt(t)}, c'est {fmt(2 * t)}, celui de {u}, c'est {2 * u}, et {fmt(2 * t)} + {2 * u} = {fmt(r)}."
              if t and u else f"Le double de {fmt(x)} = {fmt(r)} : {fmt(x)} + {fmt(x)} = {fmt(r)}.")
        return (f"Le double de {fmt(x)} ?", r, [x // 2 if x % 2 == 0 else None, r + 10 if u >= 5 else r - 10, r + 1, r - 1, x + 2, r + 2],
                f"Le double, c'est {fmt(x)} + {fmt(x)}.", ex, f"{x} * 2", None)
    y = 2 * x if lv < 3 or R.random() < 0.6 else 10 * R.randint(3, 19) * (1 if lv == 3 else 3)
    if y % 2:
        y += 1
    h = y // 2
    return (f"La moitié de {fmt(y)} ?", h, [y * 2, h + 10, h - 10, h + 1, h - 1, y - 2],
            f"Cherche le nombre qui, ajouté à lui-même, fait {fmt(y)}.", f"La moitié de {fmt(y)} = {fmt(h)} : {fmt(h)} + {fmt(h)} = {fmt(y)}.", f"{y} / 2", None)


def _ev(expr):
    """Evaluates the little expressions of g_mental (× ÷ − and parentheses, whole numbers): a Fraction."""
    from fractions import Fraction
    py = re.sub(r"\d+", lambda m: f"Fraction({m.group(0)})", expr.replace("×", "*").replace("÷", "/").replace("−", "-"))
    return eval(py, {"__builtins__": {}, "Fraction": Fraction})      # our own expressions only


def _ltr(expr):
    """The mistake of computing left to right, ignoring the priorities (and the parentheses)."""
    toks = re.findall(r"\d+|[×÷+−]", expr.replace("(", "").replace(")", ""))
    v = _ev(toks[0])
    for op, n in zip(toks[1::2], toks[2::2]):
        v = _ev(f"({v.numerator}) {op} {n}") if v.denominator == 1 else v
    return v


def g_mental(lv, R):
    for _ in range(40):
        if lv == 1:
            a, b, c = R.randint(1, 8), R.randint(1, 8), R.randint(1, 5)
            e, hint = f"{a} + {b} + {c}", "Ajoute deux nombres, puis le troisième."
            ex = f"{e} = {a + b + c} : {a} + {b} = {a + b}, puis {a + b} + {c} = {a + b + c}."
            wrong = [a + b + c + 1, a + b, a + b + c - 1, a + b + c + 10]
        elif lv == 2:
            a, b, c = R.randint(8, 20), R.randint(2, 7), R.randint(2, 6)
            e, hint = f"{a} − {b} + {c}", "Calcule de gauche à droite."
            ex = f"{e} = {a - b + c} : {a} − {b} = {a - b}, puis {a - b} + {c} = {a - b + c}."
            wrong = [a - (b + c), a - b + c + 1, a + b + c, a - b + c - 1]
        elif lv == 3:
            a, b, c = R.randint(2, 9), R.randint(2, 6), R.randint(2, 6)
            if R.random() < 0.5:
                e, ex = f"{a} + {b} × {c}", f"{a} + {b} × {c} = {a + b * c} : d'abord {b} × {c} = {b * c}, puis {a} + {b * c} = {a + b * c}."
            else:
                e, ex = f"{a} × {b} + {c}", f"{a} × {b} + {c} = {a * b + c} : d'abord {a} × {b} = {a * b}, puis {a * b} + {c} = {a * b + c}."
            hint, wrong = "D'abord les ×, ensuite les +.", [(a + b) * c if e.startswith(f"{a} +") else a * (b + c), _ev(e) + 1, a + b + c, _ev(e) - 1]
        elif lv == 4:
            a, b, c, d = R.randint(20, 40), R.randint(2, 5), R.randint(2, 5), R.randint(2, 6)
            if R.random() < 0.5:
                e = f"{a} − {b} × {c}"
                ex = f"{e} = {a - b * c} : d'abord {b} × {c} = {b * c}, puis {a} − {b * c} = {a - b * c}."
            else:
                a = R.randint(2, 6)
                e = f"{a} × {b} + {c} × {d}"
                ex = f"{e} = {a * b + c * d} : {a} × {b} = {a * b}, {c} × {d} = {c * d}, puis {a * b} + {c * d} = {a * b + c * d}."
            hint, wrong = "D'abord les ×, ensuite les + et les −.", [_ltr(e), _ev(e) + 1, _ev(e) - 1, _ev(e) + 10]
        else:
            a, b, c, d = R.randint(6, 12), R.randint(1, 5), R.randint(2, 4), R.randint(2, 4)
            if R.random() < 0.5:
                f = d * R.randint(2, 6)
                e = f"({a} − {b}) × {c} + {f} ÷ {d}"
                ex = f"{e} = {(a - b) * c + f // d} : ({a} − {b}) = {a - b}, {a - b} × {c} = {(a - b) * c}, {f} ÷ {d} = {f // d}, et {(a - b) * c} + {f // d} = {(a - b) * c + f // d}."
                wrong = [a - b * c + f // d, _ltr(e), (a - b) * c + f // d + 1, (a - b) * (c + f) // d if (a - b) * (c + f) % d == 0 else None]
            else:
                f = c * d * R.randint(1, 4)
                e = f"{a} + {f} ÷ {c} × {d}"
                ex = f"{e} = {a + f // c * d} : {f} ÷ {c} = {f // c}, {f // c} × {d} = {f // c * d}, puis {a} + {f // c * d} = {a + f // c * d}."
                wrong = [_ltr(e), a + f // (c * d), a + f // c * d + 1, a + f // c * d - 1]
            hint = "D'abord les parenthèses, puis × et ÷, enfin + et −."
        v = _ev(e)
        if v.denominator == 1 and v >= 0:
            wrong = [int(w) if w is not None and getattr(w, "denominator", 1) == 1 else None for w in wrong]
            return e + " = ?", int(v), wrong, hint, ex, e.replace("×", "*").replace("÷", "/").replace("−", "-"), None
    return g_mental(1, R)


def g_comparaison(lv, R):
    big = R.random() < 0.5
    if lv == 1:
        xs = R.sample(range(1, 21), 4)
    elif lv == 2:
        a, b = R.sample(range(1, 10), 2)
        xs = [10 * a + b, 10 * b + a, 11 * a, 11 * b]
    elif lv == 3:
        a, b, c = R.sample(range(1, 10), 3)
        perms = sorted({100 * x + 10 * y + z for x, y, z in ((a, b, c), (a, c, b), (b, a, c), (b, c, a), (c, a, b), (c, b, a))})
        xs = R.sample(perms, 4)
    elif lv == 4:
        i, a, b, c = R.randint(0, 3), R.randint(3, 8), R.randint(1, 9), R.randint(1, 9)
        xs = [i + D(a) / 10, i + D(a - 1) / 10 + D(b) / 100, i + D(a) / 10 + D(c) / 1000, i + D(a - 1) / 10 + D(b) / 100 + D(c) / 1000]
    else:
        xs = R.sample([-9, -7, -6, -4, -3, -2, -1, 1, 2, 3, 5], 3) + [D(-R.randint(1, 8)) - D("0.5")]
    if len({canon(fmt(x)) for x in xs}) < 4:
        return g_comparaison(lv, R)
    ans = max(xs) if big else min(xs)
    order = sorted(xs, reverse=big)
    hint = ("Compare d'abord le nombre de chiffres, puis les chiffres de gauche à droite." if lv < 4 else
            "Écris-les avec autant de chiffres après la virgule : 0,500 et 0,450…" if lv == 4 else
            "Avec les nombres négatifs, plus on est loin de zéro, plus on est petit.")
    sign = " > " if big else " < "
    ex = f"Le plus {'grand' if big else 'petit'}, c'est {fmt(ans)} : " + sign.join(fmt(x) for x in order) + "."
    ch = [fmt(x) for x in xs]
    R.shuffle(ch)
    return {"q": f"Le plus {'grand' if big else 'petit'} ?", "answer": fmt(ans), "choices": ch, "hint": hint, "explication": ex,
            "calc": ("max" if big else "min") + "(" + ", ".join(str(x) for x in xs) + ")"}


def g_suite(lv, R):
    kind = R.choice({1: ["plus"], 2: ["plus", "moins"], 3: ["fois2", "ecart", "moins"], 4: ["fois3", "carres", "alterne"],
                     5: ["fibo", "moitie", "triangle", "carres1"]}[lv])
    if kind in ("plus", "moins"):
        st = R.choice((1, 2, 10) if lv == 1 else (3, 4, 5, 10, 2) if lv == 2 else (3, 5, 4, 6))
        if kind == "moins":
            s0 = st * 4 + R.randint(1, 20)
            terms = [s0 - st * i for i in range(5)]
            hint, ex = "On enlève toujours le même nombre.", f"On enlève {st} à chaque fois : {fmt(terms[3])} − {st} = {fmt(terms[4])}."
        else:
            s0 = R.randint(0, 10 if lv == 1 else 30)
            terms = [s0 + st * i for i in range(5)]
            hint, ex = "On ajoute toujours le même nombre.", f"On ajoute {st} à chaque fois : {fmt(terms[3])} + {st} = {fmt(terms[4])}."
        wrong = [terms[4] + 1, terms[4] - 1, terms[3] + 2 * st, terms[3] + st + 10 if st != 10 else terms[3] + 1]
    elif kind in ("fois2", "fois3"):
        k = 2 if kind == "fois2" else 3
        s0 = R.randint(1, 5 if k == 2 else 3)
        terms = [s0 * k ** i for i in range(5)]
        hint, ex = "Regarde : on ajoute, ou on multiplie ?", f"On multiplie par {k} à chaque fois : {fmt(terms[3])} × {k} = {fmt(terms[4])}."
        wrong = [terms[3] + (terms[3] - terms[2]), terms[4] + k, terms[4] - 1, terms[3] * (k + 1)]
    elif kind == "ecart":
        s0, st = R.randint(1, 10), R.randint(1, 3)
        terms = [s0]
        for i in range(4):
            terms.append(terms[-1] + st + i)
        hint, ex = "L'écart grandit de 1 à chaque fois.", f"On ajoute {st}, puis {st + 1}, {st + 2}, {st + 3} : {terms[3]} + {st + 3} = {terms[4]}."
        wrong = [terms[3] + st + 2, terms[4] + 1, terms[3] + st, terms[4] + 2]
    elif kind in ("carres", "carres1"):
        s0, plus = R.randint(1, 3), 1 if kind == "carres1" else 0
        terms = [(s0 + i) ** 2 + plus for i in range(5)]
        hint = "Pense à 1 × 1, 2 × 2, 3 × 3…" if not plus else "Pense aux carrés : 1, 4, 9, 16… et un petit plus."
        ex = f"Ce sont les carrés{' plus 1' if plus else ''} : {s0 + 4} × {s0 + 4}{' + 1' if plus else ''} = {terms[4]}."
        wrong = [terms[3] + (terms[3] - terms[2]), terms[4] + 1, terms[4] - 2, terms[3] * 2]
    elif kind == "alterne":
        s0, a, b = R.randint(1, 10), R.randint(3, 6), R.randint(1, 2)
        terms = [s0]
        for i in range(4):
            terms.append(terms[-1] + (a if i % 2 == 0 else -b))
        hint, ex = "Deux étapes qui reviennent : + puis −.", f"On fait + {a}, puis − {b}, et ainsi de suite : {terms[3]} + {a} = {terms[4]}."
        wrong = [terms[3] - b, terms[4] + 1, terms[3] + a - b, terms[4] - 1]
    elif kind == "fibo":
        a, b = R.randint(1, 3), R.randint(1, 4)
        terms = [a, b]
        while len(terms) < 6:
            terms.append(terms[-1] + terms[-2])
        hint, ex = "Chaque nombre vient des deux d'avant.", f"Chaque nombre est la somme des deux d'avant : {terms[3]} + {terms[4]} = {terms[5]}."
        wrong = [terms[4] + (terms[4] - terms[3]), terms[5] + 1, terms[4] * 2, terms[5] - 1]
    elif kind == "moitie":
        s0 = R.randint(3, 7) * 16
        terms = [s0 // 2 ** i for i in range(5)]
        hint, ex = "Regarde : on enlève, ou on partage ?", f"On divise par 2 à chaque fois : {terms[3]} ÷ 2 = {terms[4]}."
        wrong = [terms[3] - (terms[2] - terms[3]), terms[4] + 1, terms[3] - 2, terms[4] * 3]
    else:                                                           # the triangle numbers
        terms = [n * (n + 1) // 2 for n in range(1, 6)]
        hint, ex = "L'écart grandit de 1 à chaque fois.", f"On ajoute 2, 3, 4, puis 5 : {terms[3]} + 5 = {terms[4]}."
        wrong = [terms[3] + 4, terms[4] + 1, terms[3] * 2, terms[4] + 2]
    shown, ans = terms[:-1], terms[-1]
    return ", ".join(fmt(t) for t in shown) + ", ?", ans, wrong, hint, ex, str(ans), None


def g_probleme(lv, R):
    """Word problems with Pixel in them. Each template: levels, then (question, answer, mistakes, hint, correction, calc)."""
    def t_sub():
        a = R.randint(6, 10 if lv == 1 else 20 if lv == 2 else 60)
        b = R.randint(2, a - 2)
        thing = R.choice(("piles", "bonbons", "autocollants", "boulons"))
        q = R.choice((f"Pixel a {a} {thing}. Il en mange {b}. Combien lui en reste-t-il ?" if thing in ("piles", "bonbons") else
                      f"Pixel a {a} {thing}. Il en perd {b}. Combien lui en reste-t-il ?",
                      f"Il y a {a} lampes dans la maison. Pixel en éteint {b}. Combien restent allumées ?"))
        return q, a - b, [a + b, a - b + 1, a - b - 1, a - b + 10], "Il en enlève : c'est une soustraction.", f"{a} − {b} = {a - b}.", f"{a} - {b}"
    def t_add():
        a, b = R.randint(2, 9 if lv == 1 else 40), R.randint(2, 9 if lv == 1 else 40)
        q = R.choice((f"Pixel a {a} autocollants. Son ami lui en donne {b}. Combien en a-t-il maintenant ?",
                      f"Pixel range {a} pixels verts et {b} pixels roses. Combien de pixels en tout ?"))
        return q, a + b, [abs(a - b), a + b + 1, a + b - 1, a + b + 10], "Il en ajoute : c'est une addition.", f"{a} + {b} = {a + b}.", f"{a} + {b}"
    def t_mul():
        n, k = R.randint(2, 6), R.choice((2, 3, 4, 5, 10) if lv < 4 else (6, 8, 12, 15, 25))
        q = R.choice((f"Pixel achète {n} paquets de {k} piles. Combien de piles en tout ?",
                      f"Pixel range {n} rangées de {k} pixels. Combien de pixels ?",
                      f"Pixel lit {k} pages par jour. Combien de pages en {n} jours ?"))
        return q, n * k, [n + k, n * k + k, n * k - k, n * k + 1], "La même quantité plusieurs fois : c'est une multiplication.", f"{n} × {k} = {n * k}.", f"{n} * {k}"
    def t_div():
        d, c = R.randint(2, 5 if lv < 4 else 9), R.randint(2, 9 if lv < 4 else 12)
        n = d * c
        q = f"Pixel partage {n} bonbons entre {d} amis. Combien chacun en reçoit-il ?"
        return q, c, [n - d, n + d, c + 1, c - 1], "Partager en parts égales : c'est une division.", f"{n} ÷ {d} = {c}, car {d} × {c} = {n}.", f"{n} / {d}"
    def t_money():
        a = R.choice((20, 30, 50, 100)) if lv > 3 else R.randint(12, 30)
        b = R.randint(3, a - 2)
        q = f"Pixel a {a} €. Il s'achète une antenne à {b} €. Combien lui reste-t-il ?"
        return q, a - b, [a + b, a - b + 10, a - b - 10, a - b + 1], "Il paie : ce qu'il a, moins le prix.", f"{a} − {b} = {a - b} €.", f"{a} - {b}"
    def t_two():
        a, n, k = R.randint(5, 20), R.randint(2, 4), R.choice((4, 5, 6, 10))
        b = R.randint(2, a + n * k - 2)
        q = f"Pixel a {a} piles. Il achète {n} paquets de {k}, puis en mange {b}. Combien lui en reste-t-il ?"
        r = a + n * k - b
        return (q, r, [a + n * k, n * k - b if n * k > b else None, a + n + k - b if a + n + k > b else None, r + 1, r - 10],
                "Deux étapes : d'abord ce qu'il achète, puis ce qu'il mange.", f"{a} + {n} × {k} = {a + n * k}, puis {a + n * k} − {b} = {r}.", f"{a} + {n} * {k} - {b}")
    def t_change():
        p, n = R.randint(2, 9), R.randint(2, 5)
        B = 20 if n * p < 20 else 50
        q = f"Une LED coûte {p} €. Pixel en achète {n} et paie avec un billet de {B} €. Combien lui rend-on ?"
        return q, B - n * p, [n * p, B - p, B - n - p, B - n * p + 1], "Calcule d'abord le prix total.", f"{n} × {p} = {n * p} €, puis {B} − {n * p} = {B - n * p} €.", f"{B} - {n} * {p}"
    def t_quart():
        a = 4 * R.randint(3, 15)
        q = f"Pixel a {a} piles. Il en donne le quart à son jumeau. Combien lui en reste-t-il ?"
        return q, a - a // 4, [a // 4, a - 4, a // 2, a - a // 4 + 1], "D'abord le quart : partage en 4.", f"Le quart de {a}, c'est {a // 4}, et {a} − {a // 4} = {a - a // 4}.", f"{a} - {a} / 4"
    def t_solde():
        p, r = R.choice((20, 40, 60, 80, 120)), R.choice((10, 25, 50))
        cut = p * r // 100
        q = f"Un jeu vidéo coûte {p} €. Il est soldé à −{r} %. Combien coûte-t-il ?"
        return q, p - cut, [cut, p - r, p + cut, p - cut + 1], "Calcule la réduction, puis enlève-la du prix.", f"{r} % de {p} = {cut} €, et {p} − {cut} = {p - cut} €.", f"{p} - {p} * {r} / 100"
    def t_charge():
        r, a = R.choice((10, 20, 25)), R.choice((0, 20, 40, 50))
        if (100 - a) % r:
            a = 0
        q = f"Pixel se recharge de {r} % par heure. Il est à {a} %. Dans combien d'heures sera-t-il à 100 % ?"
        h = (100 - a) // r
        return q, h, [100 - a, h + 1, h - 1, 100 // r], f"Combien de fois {r} % dans ce qu'il manque ?", f"Il manque {100 - a} %, et {100 - a} ÷ {r} = {h} heures.", f"(100 - {a}) / {r}"
    pool = {1: [t_sub, t_add], 2: [t_sub, t_add, t_mul, t_div], 3: [t_sub, t_add, t_mul, t_div, t_money, t_charge],
            4: [t_mul, t_div, t_money, t_two, t_change, t_charge], 5: [t_two, t_change, t_quart, t_solde, t_charge]}[lv]
    q, ans, wrong, hint, ex, calc = R.choice(pool)()
    return q, ans, wrong, hint, ex, calc, None


def g_heure(lv, R):
    """Times of day (answers like "9 h 10") and durations ("85 min")."""
    if lv == 1:
        if R.random() < 0.6:
            h = R.randint(1, 11)
            return (f"Il est {hm(h * 60)}. Dans 1 heure, quelle heure est-il ?", hm((h + 1) * 60), [hm((h + 2) * 60), hm((h - 1) * 60), hm(h * 60 + 30), hm((h + 1) * 60 + 10)],
                    "Avance d'une heure sur l'horloge.", f"{hm(h * 60)} + 1 h = {hm(h * 60 + 60)}.", None, None)
        q, a, w, ex = R.choice([("Combien de minutes dans une heure ?", 60, [100, 30, 24, 12], "Une heure = 60 minutes."),
                                ("Une demi-heure, c'est combien de minutes ?", 30, [50, 15, 60, 20], "Une demi-heure = la moitié de 60 min = 30 min.")])
        return q, a, w, "Pense à la grande aiguille qui fait le tour.", ex, str(a), None
    if lv == 2:
        r = R.random()
        if r < 0.4:
            h = R.randint(6, 20)
            t = h * 60 + 30
            return (f"Il est {hm(t)}. Dans 30 minutes, quelle heure est-il ?", hm(t + 30), [hm(t + 60), hm(h * 60 + 60 + 30), hm(t - 30), f"{h}{NB}h{NB}60"],
                    "30 minutes de plus : on arrive à l'heure pile.", f"{hm(t)} + 30 min = {hm(t + 30)}.", None, None)
        if r < 0.7:
            h, m = R.randint(6, 20), R.choice((15, 30, 45))
            t = h * 60
            return (f"Il est {hm(t)}. Dans {m} minutes, quelle heure est-il ?", hm(t + m), [hm(t + m + 60), hm(t + m + 5), hm(t + m - 5), hm(t + 2 * m) if m < 30 else hm(t + 10)],
                    "Les heures ne bougent pas, les minutes avancent.", f"{hm(t)} + {m} min = {hm(t + m)}.", None, None)
        q, a, w, ex = R.choice([("Une heure et quart, c'est combien de minutes ?", 75, [115, 60, 45, 85], "1 h = 60 min, plus un quart d'heure = 15 min : 75 min."),
                                ("Une heure et demie, c'est combien de minutes ?", 90, [150, 130, 60, 80], "1 h = 60 min, plus une demi-heure = 30 min : 90 min.")])
        return q, a, w, "Une heure = 60 minutes (pas 100 !).", ex, str(a), None
    if lv == 3:
        if R.random() < 0.6:
            h, m, d = R.randint(7, 20), R.choice((35, 40, 45, 50, 55)), R.choice((10, 15, 20, 25, 30))
            if m + d < 60:
                d = 60 - m + 10
            t = h * 60 + m
            e = t + d
            return (f"Il est {hm(t)}. Dans {d} minutes, quelle heure est-il ?", hm(e), [f"{h}{NB}h{NB}{m + d}", hm(e - 60), hm(e + 5), hm(e - 5)],
                    "Va d'abord jusqu'à l'heure pile.", f"{hm(t)} + {60 - m} min = {hm(h * 60 + 60)}, puis encore {d - (60 - m)} min : {hm(e)}."
                    if m + d > 60 else f"{hm(t)} + {d} min = {hm(e)} : on arrive pile à l'heure.", None, None)
        h, k = R.randint(8, 16), R.choice((1, 2, 3))
        a = 60 * k + 30
        return (f"De {hm(h * 60)} à {hm((h + k) * 60 + 30)}, combien de minutes ?", dur(a), [dur(k * 100 + 30), dur(a - 30), dur(a + 10), dur(k * 60)],
                "Compte les heures entières (60 min chacune), puis les minutes.", f"{k} h = {60 * k} min, plus 30 min : {a} min.", str(a), None)
    if lv == 4:
        if R.random() < 0.5:
            h, m, dh, dm = R.randint(14, 20), R.choice((25, 35, 40, 45, 50)), R.randint(1, 2), R.choice((20, 25, 30, 35, 40, 45))
            if m + dm < 60:
                dm = 60 - m + 15
            t = h * 60 + m
            e = t + dh * 60 + dm
            return (f"Le film commence à {hm(t)} et dure {hm(dh * 60 + dm)}. Il finit à quelle heure ?", hm(e),
                    [f"{h + dh}{NB}h{NB}{m + dm}", hm(e - 60), hm(e + 10), hm(e - 15)], "Ajoute d'abord les heures, puis les minutes, et passe l'heure pile.",
                    f"{hm(t)} + {dh} h = {hm(t + dh * 60)}, puis + {dm} min = {hm(e)}.", None, None)
        h1, m1, k, m2 = R.randint(8, 15), R.choice((40, 45, 50)), R.randint(1, 2), R.choice((10, 15, 20, 25))
        a = (60 - m1) + (k - 1) * 60 + m2
        return (f"De {hm(h1 * 60 + m1)} à {hm((h1 + k) * 60 + m2)}, combien de minutes ?", dur(a),
                [dur(k * 100 + m2 - m1), dur(a + 60), dur(a - 10), dur(a + 5)], "Va d'abord jusqu'à l'heure pile.",
                f"{hm(h1 * 60 + m1)} → {hm(h1 * 60 + 60)} : {60 - m1} min" + (f", puis {k - 1} h = {(k - 1) * 60} min" if k > 1 else "") + f", puis {m2} min : {a} min.", str(a), None)
    r = R.random()
    if r < 0.4:
        x, a = R.choice(((D("1.5"), 90), (D("2.5"), 150), (D("0.75"), 45), (D("1.25"), 75), (D("3.5"), 210)))
        whole, rest = int(x), x - int(x)
        bad = whole * 60 + int(rest * 100)                          # 1,5 h read as 1 h 50
        ex = f"{whole} h = {whole * 60} min, et {fmt(rest)} h = {fmt(rest * 60)} min : {a} min." if whole else f"{fmt(x)} h = {fmt(x)} × 60 min = {a} min."
        return (f"{fmt(x)} heures, c'est combien de minutes ?", dur(a), [dur(bad), dur(int(x * 100)), dur(a + 30), dur(a - 15), dur(a + 15), dur(a * 2)],
                "0,5 h, c'est une demi-heure : 30 min.", ex, str(a), None)
    if r < 0.7:
        n = R.choice((75, 95, 105, 125, 135, 150, 165, 195))
        h, m = divmod(n, 60)
        return (f"{n} minutes, c'est combien d'heures ?", f"{h}{NB}h{NB}{m:02d}", [f"{n // 100}{NB}h{NB}{n % 100:02d}", f"{h}{NB}h{NB}{(m + 10) % 60:02d}",
                f"{h + 1}{NB}h{NB}{m:02d}", f"{h - 1 if h > 1 else h + 2}{NB}h{NB}{m:02d}"], "Combien de fois 60 dans ce nombre ?",
                f"{n} min = {h} × 60 + {m} = {hm(n)}.", None, None)
    m1, m2 = R.choice((30, 40, 45, 50)), R.choice((10, 15, 20, 30))
    a = (60 - m1) + 60 + m2
    return (f"De {hm(22 * 60 + m1)} à {hm(m2)}, combien de minutes ?", dur(a), [dur(a - 60), dur(a + 60), dur(200 + m2 - m1), dur(a + 10)],
            "Va jusqu'à 23 h, puis jusqu'à minuit (0 h).", f"{hm(22 * 60 + m1)} → 23 h : {60 - m1} min, 23 h → minuit : 60 min, puis {m2} min : {a} min.", str(a), None)


WORDS = {2: ("La moitié", "moitié"), 3: ("Le tiers", "tiers"), 4: ("Le quart", "quart"), 5: ("Le cinquième", "cinquième"), 10: ("Le dixième", "dixième")}


def g_fraction(lv, R):
    if lv <= 3:
        den = {1: 2, 2: R.choice((2, 4)), 3: R.choice((3, 4, 5, 10))}[lv]
        x = den * R.randint(1 if lv == 1 else 3, 10 if lv == 1 else 12 if lv == 2 else 15)
        r = x // den
        name, word = WORDS[den]
        wrong = [x // 2 if den != 2 else x * 2, x - r, r + 1, r - 1, x // (den + 1) if x % (den + 1) == 0 else None, x * den]
        return (f"{name} de {x} ?", r, wrong, f"{name} : partage {x} en {den} parts égales.", f"{name} de {x} = {r} : {x} ÷ {den} = {r}.", f"{x} / {den}", None)
    if lv == 5 and R.random() < 0.35:
        den = R.choice((2, 3, 4, 5, 10))
        r = R.randint(3, 15)
        x = den * r
        wrong = [f"1/{den + 1}", f"1/{den - 1}" if den > 2 else "1/5", f"{den}/1", f"2/{den}" if den > 2 else "1/4"]
        return (f"{r}, c'est quelle part de {x} ?", f"1/{den}", wrong, f"Combien de fois {r} dans {x} ?", f"{r} × {den} = {x} : c'est 1/{den} de {x}.", None, None)
    num, den = R.choice(((3, 4), (2, 3), (2, 5), (3, 10), (3, 5)) if lv == 4 else ((5, 8), (7, 10), (3, 8), (4, 5), (5, 6)))
    x = den * R.randint(2, 12 if lv == 4 else 15)
    one = x // den
    r = one * num
    return (f"Les {num}/{den} de {x} ?", r, [one, x - one, r + one, r + 1, x // 2, r - 1],
            f"Calcule d'abord 1/{den} de {x}, puis multiplie par {num}.", f"Les {num}/{den} de {x} = {r} : {x} ÷ {den} = {one}, puis {num} × {one} = {r}.", f"{x} * {num} / {den}", None)


def g_pourcentage(lv, R):
    if lv == 5 and R.random() < 0.5:
        p, r = R.choice((20, 40, 60, 80, 120, 200)), R.choice((10, 20, 25, 50))
        cut = p * r // 100
        if R.random() < 0.5:
            return (f"Un jeu à {p} € est soldé à −{r} %. Nouveau prix ?", p - cut, [cut, p - r, p + cut, p - cut + 5],
                    "Calcule la réduction, puis enlève-la du prix.", f"{r} % de {p} = {cut} €, et {p} − {cut} = {p - cut} €.", f"{p} - {p} * {r} / 100", None)
        return (f"Un prix de {p} € augmente de {r} %. Nouveau prix ?", p + cut, [cut, p + r, p - cut, p + cut + 5],
                "Calcule l'augmentation, puis ajoute-la au prix.", f"{r} % de {p} = {cut} €, et {p} + {cut} = {p + cut} €.", f"{p} + {p} * {r} / 100", None)
    r = {1: (50,), 2: (50, 10, 100), 3: (25, 10, 20, 50), 4: (75, 20, 5, 30)}.get(lv) or (15, 12, 40, 35)
    r = R.choice(r)
    unit = {50: 2, 10: 10, 100: 1, 25: 4, 20: 5, 75: 4, 5: 20, 30: 10, 15: 20, 12: 25, 40: 5, 35: 20}[r]
    x = unit * R.randint(1 if lv == 1 else 2, 10 if lv <= 2 else 20)
    if lv >= 3 and x < 20:
        x *= 2
    a = x * r // 100
    t, q = fmt(D(x) / 10), fmt(D(x) / 4)
    help_ = {50: ("50 %, c'est la moitié.", f"c'est la moitié, et {x} ÷ 2 = {a}."), 10: ("10 %, c'est diviser par 10.", f"{x} ÷ 10 = {a}."),
             100: ("100 %, c'est le tout.", f"c'est le tout, {x} en entier."), 25: ("25 %, c'est le quart.", f"c'est le quart, et {x} ÷ 4 = {a}."),
             20: ("20 %, c'est 2 fois 10 %.", f"10 % de {x} = {t}, et 2 × {t} = {a}."),
             75: ("75 %, c'est 3 fois 25 %.", f"25 % de {x} = {x // 4}, et 3 × {x // 4} = {a}."), 5: ("5 %, c'est la moitié de 10 %.", f"10 % de {x} = {x // 10}, et la moitié = {a}."),
             30: ("30 %, c'est 3 fois 10 %.", f"10 % de {x} = {x // 10}, et 3 × {x // 10} = {a}."), 15: ("15 %, c'est 10 % plus 5 %.", f"10 % = {x // 10}, 5 % = {x // 20}, et {x // 10} + {x // 20} = {a}."),
             12: ("12 %, c'est 10 % plus 2 %.", f"10 % = {t}, 2 % = {fmt(D(x) / 50)}, et {t} + {fmt(D(x) / 50)} = {a}."),
             40: ("40 %, c'est 4 fois 10 %.", f"10 % de {x} = {t}, et 4 × {t} = {a}."),
             35: ("35 %, c'est 25 % plus 10 %.", f"25 % = {q}, 10 % = {t}, et {q} + {t} = {a}.")}[r]
    wrong = [r if r != a else None, x - r if x > r else None, x - a, a * 10 if r != 100 else None, x // r if r and x % r == 0 and x // r != a else None, a + 1, a - 1]
    return f"{r} % de {x} ?", a, wrong, help_[0], f"{r} % de {x} = {a} : {help_[1]}", f"{x} * {r} / 100", None


def g_carre(lv, R):
    if lv == 4 and R.random() < 0.4 or lv == 5 and R.random() < 0.35:
        n = R.randint(4, 12 if lv == 4 else 20)
        s = n * n
        return (f"Quel nombre fois lui-même fait {fmt(s)} ?", n, [s // 2 if s % 2 == 0 else None, n + 1, n - 1, n + 2, s // 10 if s >= 20 else None],
                f"Essaie : {n - 1} × {n - 1} ? {n + 1} × {n + 1} ?", f"{n} × {n} = {fmt(s)}.", str(n), None)
    n = {1: R.randint(1, 5), 2: R.randint(2, 10), 3: R.randint(2, 12), 4: R.randint(11, 20)}.get(lv) or R.choice((15, 25, 30, 35, 45, 50, 13, 14, 16, 21))
    s = n * n
    q = f"{n} × {n} = ?" if lv <= 2 else f"{n}² = ?"
    hint = f"{n}², c'est {n} × {n} (pas {n} × 2 !)." if lv > 2 else f"Pense à la table de {n}."
    if n > 10:
        t, u = n - n % 10, n % 10
        ex = f"{n}² = {n} × {n} = {fmt(s)} : {n} × {t} = {n * t}, {n} × {u} = {n * u}, et {n * t} + {n * u} = {fmt(s)}." if u else f"{n}² = {n} × {n} = {fmt(s)}."
    else:
        ex = f"{n} × {n} = {s}." if lv <= 2 else f"{n}² = {n} × {n} = {s}."
    return q, s, [2 * n, s + n, s - n, (n + 1) ** 2, n + n + 1 if n < 3 else None, s + 10], hint, ex, f"{n} * {n}", None


# riddles: level, question, answer, 3 mistakes, hint, correction
ENIGMES = [
    (1, "Dans le jardin, 3 poules et 2 lapins. Combien de pattes en tout ?", "14", ("10", "20", "5"), "Une poule a 2 pattes, un lapin 4.", "3 × 2 + 2 × 4 = 6 + 8 = 14 pattes."),
    (1, "Je suis un nombre. Avec 3 de plus, je fais 10. Qui suis-je ?", "7", ("13", "3", "10"), "Combien faut-il ajouter à 3 pour faire 10 ?", "7 + 3 = 10 : c'est 7."),
    (1, "Pixel a 2 yeux. Combien d'yeux pour 4 Pixels ?", "8", ("6", "4", "2"), "Compte 2 yeux, 4 fois.", "2 + 2 + 2 + 2 = 8 yeux."),
    (1, "Retourné tête en bas, quel chiffre devient un 9 ?", "6", ("8", "0", "1"), "Imagine le chiffre à l'envers.", "Le 6 retourné devient un 9."),
    (2, "Je suis pair, entre 11 et 15, dans la table de 3. Qui suis-je ?", "12", ("14", "13", "15"), "Les pairs entre 11 et 15 : 12 et 14.", "12 est pair et 12 = 3 × 4."),
    (2, "Une araignée a 8 pattes. Combien de pattes pour 3 araignées ?", "24", ("11", "16", "32"), "Compte 8 pattes, 3 fois.", "3 × 8 = 24 pattes."),
    (2, "Hier, c'était lundi. Quel jour serons-nous demain ?", "Mercredi", ("Mardi", "Jeudi", "Dimanche"), "Si hier était lundi, aujourd'hui, c'est…", "Hier lundi, aujourd'hui mardi, donc demain mercredi."),
    (2, "Combien de roues pour 3 vélos et 2 voitures ?", "14", ("10", "5", "12"), "Un vélo a 2 roues, une voiture 4.", "3 × 2 + 2 × 4 = 6 + 8 = 14 roues."),
    (3, "Le père de Léa a 5 filles : Lala, Lélé, Lili, Lolo… et la cinquième ?", "Léa", ("Lulu", "Lyly", "Lala"), "Relis bien le début de la phrase !", "C'est le père de Léa : la cinquième, c'est Léa."),
    (3, "Je pense à un nombre. Je le double et j'ajoute 4 : 20. Quel nombre ?", "8", ("12", "16", "6"), "Fais le chemin à l'envers : 20 − 4, puis la moitié.", "20 − 4 = 16, la moitié de 16 = 8."),
    (3, "Un kilo de plumes ou un kilo de plomb : lequel est le plus lourd ?", "Pareil", ("Le plomb", "Les plumes", "On ne sait pas"), "Regarde bien les quantités.", "Un kilo, c'est un kilo : ils pèsent pareil."),
    (3, "Combien de chiffres pour écrire tous les nombres de 1 à 20 ?", "31", ("20", "29", "30"), "1 à 9 : un chiffre chacun. 10 à 20 : deux chacun.", "9 nombres à 1 chiffre + 11 nombres à 2 chiffres : 9 + 22 = 31."),
    (4, "Dans une course, tu doubles le deuxième. Quelle est ta place ?", "Deuxième", ("Premier", "Troisième", "Dernier"), "Tu prends la place de celui que tu doubles.", "Tu passes devant le deuxième : tu es deuxième."),
    (4, "Une brique pèse 1 kg plus une demi-brique. Combien pèse une brique ?", "2 kg", ("1,5 kg", "1 kg", "3 kg"), "La demi-brique et le kilo, c'est la même chose.", "Une demi-brique = 1 kg, donc une brique = 2 kg."),
    (4, "Une raquette et une balle : 1,10 €. La raquette coûte 1 € de plus. Et la balle ?", "0,05 €", ("0,10 €", "0,01 €", "1 €"), "Si la balle coûtait 0,10 €, la raquette ferait 1,10 €…",
     "Balle 0,05 € + raquette 1,05 € = 1,10 €."),
    (4, "Combien de carrés en tout dans un damier de 2 × 2 cases ?", "5", ("4", "6", "8"), "N'oublie pas le grand carré autour.", "4 petits carrés + 1 grand = 5 carrés."),
    (5, "5 machines font 5 gadgets en 5 min. Et 100 machines, pour 100 gadgets ?", "5 min", ("100 min", "20 min", "1 min"), "Combien de temps met une machine pour un gadget ?",
     "Chaque machine fait 1 gadget en 5 min : 100 machines font 100 gadgets en 5 min."),
    (5, "Un nénuphar double chaque jour. Il couvre le lac en 48 jours. Et la moitié ?", "47 jours", ("24 jours", "46 jours", "12 jours"), "La veille, il était deux fois plus petit.",
     "Il double chaque jour : la veille du 48e jour, il en couvrait la moitié, le 47e jour."),
    (5, "5 amis se serrent tous la main une fois. Combien de poignées de main ?", "10", ("25", "20", "5"), "Le premier en serre 4, le deuxième 3 de plus…", "4 + 3 + 2 + 1 = 10 poignées de main."),
    (5, "3 chats attrapent 3 souris en 3 min. Combien de chats pour 100 souris en 100 min ?", "3", ("100", "33", "9"), "Un chat attrape une souris en 3 min.",
     "Chaque chat attrape 1 souris toutes les 3 min : en 100 min, 3 chats en attrapent 100 (environ 33 chacun)."),
]


def g_enigme(lv, R, recent=()):
    pool = [e for e in ENIGMES if e[0] == lv] or ENIGMES
    fresh = [e for e in pool if e[1] not in recent] or pool
    _, q, ans, wrong, hint, ex = R.choice(fresh)
    ch = [ans, *wrong]
    R.shuffle(ch)
    return {"q": q, "answer": ans, "choices": ch, "hint": hint, "explication": ex, "calc": None}


GEN = {"addition": g_addition, "soustraction": g_soustraction, "table": g_table, "division": g_division, "complement": g_complement,
       "double": g_double, "mental": g_mental, "comparaison": g_comparaison, "suite": g_suite, "probleme": g_probleme, "heure": g_heure,
       "fraction": g_fraction, "pourcentage": g_pourcentage, "carre": g_carre, "enigme": g_enigme}


def generate(kind, level, rng=None, table=None, k=None, recent=()):
    """One exercise: {kind, niveau, q, answer, choices (4, the answer among them), num (a number to type), hint, explication, calc}.
    calc: a Python expression of the answer, for the tests (None for the riddles)."""
    R = rng if rng is not None else random.Random()
    kind = kind if kind in GEN else "addition"
    lv = max(1, min(5, int(level or 1)))
    for _ in range(8):                                  # 4 distinct choices, or another draw
        if kind == "table":
            out = g_table(lv, R, table=table, k=k)
        elif kind == "enigme":
            out = g_enigme(lv, R, recent)
        else:
            out = GEN[kind](lv, R)
        if isinstance(out, tuple):
            q, ans, wrong, hint, ex, calc, steps = out
            answer, choices = _choices(R, ans, wrong, steps or (1, 10, 2, 5, 3, 20, 100), nonneg=not (isinstance(ans, (int, Decimal)) and ans < 0))
            out = {"q": q, "answer": answer, "choices": choices, "hint": hint, "explication": ex, "calc": calc}
        if len({canon(c) for c in out["choices"]}) == 4:
            break
    num = all(re.fullmatch(r"−?[\d\u00a0]+(?:,\d+)?(?:\u00a0min)?", c) for c in out["choices"])
    hour = all(re.fullmatch(r"\d{1,2}" + NB + "h(?:" + NB + r"\d\d)?", c) for c in out["choices"])
    return {"kind": kind, "niveau": lv, **out, "num": num, "clavier": "num" if num else "heure" if hour else ""}


# ---------- the game ----------
def _today(t):
    return time.strftime("%Y-%m-%d", time.localtime(t))


def _int(v, lo, hi, default=None):
    try:
        return max(lo, min(hi, int(v)))
    except (TypeError, ValueError):
        return default


def default_reglages():
    return {"niveau": 2, "auto": True, "types": IDS[:], "objectif": 5, "propose": False}


def default_stats():
    return {"total": 0, "justes": 0, "serie": 0, "serie_max": 0, "jour": "", "aujourdhui": 0, "justes_jour": 0, "coupes": 0,
            "coupe_jour": "", "record_chrono": 0, "trophees": [], "par_type": {}, "niveaux": {}, "niveau": 0, "montee": {}}


def _stats(saved):
    """The stats read back from exos.json: only what has the right shape, the rest as new (a hand-edited file never stops Pixel)."""
    st = default_stats()
    saved = saved if isinstance(saved, dict) else {}
    count = lambda v: isinstance(v, int) and not isinstance(v, bool) and v >= 0  # noqa: E731
    for k in ("total", "justes", "serie", "serie_max", "aujourdhui", "justes_jour", "coupes", "record_chrono"):
        if count(saved.get(k)):
            st[k] = saved[k]
    for k in ("jour", "coupe_jour"):
        if isinstance(saved.get(k), str):
            st[k] = saved[k][:10]
    if isinstance(saved.get("trophees"), list):
        st["trophees"] = [i for i in TROPHY if i in saved["trophees"]]
    if isinstance(saved.get("par_type"), dict):
        st["par_type"] = {k: {"n": v["n"], "ok": min(v["ok"], v["n"])} for k, v in saved["par_type"].items()
                          if k in LABEL and isinstance(v, dict) and count(v.get("n")) and count(v.get("ok"))}
    if isinstance(saved.get("niveaux"), dict):
        st["niveaux"] = {k: v for k, v in saved["niveaux"].items() if k in LABEL and count(v) and 1 <= v <= 5}
    if count(saved.get("niveau")) and saved["niveau"] <= 5:
        st["niveau"] = saved["niveau"]
    if isinstance(saved.get("montee"), dict):
        st["montee"] = {k: v for k, v in saved["montee"].items() if (k in LABEL or k == "*") and count(v) and v < UP_AFTER}
    return st


class Exos:
    """The exercises being played, their stats and settings. clock() in seconds, injectable for the tests."""

    def __init__(self, path=None, clock=time.time, rng=None):
        self.path, self.clock = (Path(path) if path else None), clock
        self.R = rng if rng is not None else random.Random()
        self.cur = None             # the exercise in play, with its answer (public() leaves it out until answered)
        self.run = None             # the series it belongs to: mode, kind, table, level, total, i, right ones, end of the challenge
        self.last = None            # the last answered one: ok, answer, correction
        self.ev = None              # the last thing Pixel reacts to (web/scenes/exos.js): juste, faux, serie, objectif, propose
        self.again = None           # what « encore » starts again
        self.ended = -1e18          # when the last one was put away (ms): « une autre » means another exercise only shortly after
        self.recent = []
        self.on_toast = None        # a trophy: hub.toast
        self._id = int(clock()) % 100000 * 100
        data = self._load()
        self.reglages = default_reglages()
        g = data.get("reglages")
        if isinstance(g, dict):
            self.set_reglages(**{k: g.get(k) for k in self.reglages}, save=False)
        self.stats = _stats(data.get("stats"))
        if not self.stats["niveau"]:
            self.stats["niveau"] = self.reglages["niveau"]
        self._day()

    # ---- files ----
    def _load(self):
        try:
            data = json.loads(self.path.read_text()) if self.path and self.path.exists() else {}
        except (OSError, ValueError):
            data = None
        if not isinstance(data, dict):
            log.warning("exos.json unreadable, starting afresh")
            return {}
        return data

    def save(self):
        if not self.path:
            return
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps({"v": 1, "stats": self.stats, "reglages": self.reglages}, ensure_ascii=False, indent=1))
            tmp.replace(self.path)
        except OSError as e:
            log.warning("exos.json not saved: %s", e)

    # ---- levels ----
    def ms(self):
        return self.clock() * 1000

    def level(self, kind):
        if not self.reglages["auto"]:
            return self.reglages["niveau"]
        return self.stats["niveaux"].get(kind) or self.stats["niveau"] or self.reglages["niveau"]

    def global_level(self):
        return self.reglages["niveau"] if not self.reglages["auto"] else (self.stats["niveau"] or self.reglages["niveau"])

    def _adapt(self, kind, ok, clean):
        if not self.reglages["auto"] or (self.cur or {}).get("force"):
            return False
        up = False
        for key in (kind, "*"):
            lv = self.global_level() if key == "*" else self.level(kind)
            n = self.stats["montee"].get(key, 0)
            if ok and clean:
                n += 1
                if n >= UP_AFTER:
                    if lv < 5:
                        lv, up = lv + 1, up or key == kind
                    n = 0
            elif ok:
                n = 0
            else:
                lv, n = max(1, lv - 1), 0
            self.stats["montee"][key] = n
            if key == "*":
                self.stats["niveau"] = lv
            else:
                self.stats["niveaux"][kind] = lv
        return up

    def pick_kind(self, pool=None):
        types = [k for k in (pool or self.reglages["types"]) if k in LABEL] or IDS
        g = self.global_level()
        ok = [k for k in types if MIN_MIX.get(k, 1) <= g] or types
        last = (self.cur or self.last or {}).get("kind")
        if len(ok) > 1 and last in ok:
            ok = [k for k in ok if k != last]
        w = []
        for k in ok:
            s = self.stats["par_type"].get(k) or {}
            acc = s.get("ok", 0) / s["n"] if s.get("n", 0) >= 3 else 0.5
            w.append(1 + (1 - acc))                      # the kinds that go less well come back a little more often
        return self.R.choices(ok, weights=w)[0]

    # ---- the day ----
    def _day(self):
        d = _today(self.clock())
        if self.stats["jour"] != d:
            self.stats.update(jour=d, aujourdhui=0, justes_jour=0)
            return True
        return False

    # ---- playing ----
    def _event(self, kind, **data):
        self.ev = {"id": ((self.ev or {}).get("id") or 0) + 1, "kind": kind, "t0": self.ms(), **data}

    def nouveau(self, kind=None, niveau=None, mode="exo", n=None, table=None, source=None, pool=None):
        """A new exercise, or the first of a series. Replaces the one in play."""
        mode = mode if mode in MODES else "exo"
        kind = kind if kind in LABEL else None
        table = _int(table, 2, 12)
        if mode == "table":
            kind, table = "table", table or self.R.randint(2, 9)
        elif kind != "table":
            table = None
        lv = _int(niveau, 1, 5)
        total = 0 if mode == "chrono" else (_int(n, 1, 20) or MODES[mode])
        pool = [k for k in (pool or []) if k in LABEL] or None
        self.run = {"mode": mode, "kind": kind, "pool": pool, "table": table, "niveau": lv, "total": total, "i": 0, "bons": 0,
                    "ends_at": self.ms() + CHRONO_MS if mode == "chrono" else 0, "source": source}
        if mode == "table" and table:
            ks = list(range(1, 11))
            self.R.shuffle(ks)
            self.run["ks"] = (ks * 2)[:total]
        self.again = {"kind": kind, "niveau": lv, "mode": mode, "n": n, "table": table, "pool": pool}
        self._day()
        self._next()
        self._event("propose", mode=mode, source=source or "")
        return self.cur

    def encore(self):
        return self.nouveau(**(self.again or {}))

    def _next(self):
        r = self.run
        kind = r["kind"] or self.pick_kind(r["pool"])
        lv = r["niveau"] or self.level(kind)
        k = r["ks"][r["i"] % len(r["ks"])] if r.get("ks") else None
        for _ in range(10):
            ex = generate(kind, lv, self.R, table=r["table"] if kind == "table" else None, k=k, recent=self.recent)
            if ex["q"] not in self.recent:
                break
        self.recent = (self.recent + [ex["q"]])[-14:]
        self._id += 1
        self.cur = {**ex, "id": self._id, "mode": r["mode"], "t0": self.ms(), "tries": 0, "faux": [], "hint_on": False, "etat": "question",
                    "i": r["i"] + 1, "n": r["total"], "force": bool(r["niveau"]), "table": r["table"] if kind == "table" else None}

    def indice(self):
        c = self.cur
        if c and c["etat"] == "question" and not c["hint_on"]:
            c["hint_on"] = True
            return True
        return False

    def repondre(self, value, id=None):
        """An answer: True (right), False (wrong, resolved), "indice" (wrong: the hint and a second try), None (nothing to answer).
        id: the exercise it answers (the screens send it): an answer to another one (a double tap, a late screen) is ignored,
        and so is a wrong answer already given."""
        c = self.cur
        v = str(value if value is not None else "").strip()[:40]
        if not c or c["etat"] != "question" or not v or (id is not None and str(id) != str(c["id"])):
            return None
        ok = same(v, c["answer"])
        if not ok and any(same(v, f) for f in c["faux"]):
            return None
        if not ok and c["tries"] == 0 and c["mode"] != "chrono":
            c["tries"], c["hint_on"] = 1, True
            c["faux"].append(next((x for x in c["choices"] if same(v, x)), v))
            self._event("faux", essai=1, kind_=c["kind"])
            return "indice"
        first = c["tries"] == 0
        if not ok:
            c["faux"].append(next((x for x in c["choices"] if same(v, x)), v))
        c["tries"] += 1
        self._resolve(ok, v, first)
        return ok

    def passer(self, id=None, etat=None):
        """Skip the question (the answer is shown), or go on after a result or a summary. id, etat: what the screen showed
        when it was touched; anything else (a double tap that would skip the correction too) is ignored."""
        c = self.cur
        if not c or (id is not None and str(id) != str(c["id"])) or (etat and etat != c["etat"]):
            return
        if c["etat"] == "question":
            self._resolve(False, "", False, passe=True)
        elif c["etat"] == "resultat":
            self._advance()
        else:
            self.stop()

    def stop(self, user=False):
        """Put the exercise away. user: you asked (« Fini », « stop exo »): « encore » or « une autre » are Claude's again."""
        if self.cur:
            self.ended = self.ms()
        self.cur, self.run = None, None
        if user:
            self.again = None

    def wants_again(self):
        """« encore », « une autre »… are for the exercises while one is open, or just after one ended by itself."""
        return bool(self.cur) or (self.again is not None and self.ms() - self.ended < AGAIN_MS)

    def _resolve(self, ok, value, first, passe=False):
        c, st, r = self.cur, self.stats, self.run
        self._day()
        clean = ok and first and not c["hint_on"]
        up = False
        events = []
        if not passe:
            st["total"] += 1
            st["aujourdhui"] += 1
            pt = st["par_type"].setdefault(c["kind"], {"n": 0, "ok": 0})
            pt["n"] += 1
            if ok:
                st["justes"] += 1
                st["justes_jour"] += 1
                pt["ok"] += 1
            if ok and first:
                st["serie"] += 1
                st["serie_max"] = max(st["serie_max"], st["serie"])
                if st["serie"] in MILESTONES:
                    events.append(("serie", {"n": st["serie"]}))
            else:
                st["serie"] = 0
            up = self._adapt(c["kind"], ok, clean)
            if st["aujourdhui"] >= self.reglages["objectif"] and st["coupe_jour"] != st["jour"]:
                st["coupe_jour"] = st["jour"]
                st["coupes"] += 1
                events.insert(0, ("objectif", {"objectif": self.reglages["objectif"]}))
                self._toast(f"Objectif du jour atteint : {self.reglages['objectif']} exos !")
        else:
            st["serie"] = 0
        if ok and r:
            r["bons"] += 1
        c.update(etat="resultat", ok=bool(ok), valeur=value, passe=passe, fin_at=self.ms(), monte=up)
        self.last = {"id": c["id"], "ok": bool(ok), "answer": c["answer"], "explication": c["explication"], "value": value, "kind": c["kind"],
                     "q": c["q"], "passe": passe, "t": self.ms(), "monte": up}
        chrono = c["mode"] == "chrono"
        if events:
            self._event(events[0][0], **events[0][1])
        elif not chrono and not passe:
            self._event("juste" if ok else "faux", essai=1 if first else 2, serie=st["serie"])
        self._trophies()
        self.save()
        if chrono:
            self._advance()
        else:
            wait = (2000 if ok else 5000) if c["mode"] in ("serie", "table") and c["n"] > 1 else (6000 if ok else 11000)
            if c["mode"] in ("serie", "table") and c["i"] >= c["n"]:
                wait = max(wait, 3000)              # the last one: his cheer plays to its end before the summary
            if events:
                wait = max(wait, CHEER_MS)          # a milestone: his celebration is not cut by the next question or the summary
            c["next_at"] = self.ms() + wait

    def _toast(self, msg):
        if self.on_toast:
            try:
                self.on_toast(msg)
            except Exception:
                log.exception("toast")

    def _trophies(self):
        got = self.stats["trophees"]
        for i, label, cond in TROPHIES:
            if i not in got and cond(self.stats):
                got.append(i)
                self._toast(f"Trophée : {label} !")

    def _advance(self):
        r = self.run
        if not r:
            self.stop()
            return
        r["i"] += 1
        if r["mode"] == "chrono":
            if self.ms() >= r["ends_at"]:
                return self._bilan()
            return self._next()
        if r["i"] >= r["total"]:
            return self._bilan() if r["total"] > 1 else self.stop()
        self._next()

    def _bilan(self):
        r, st = self.run, self.stats
        chrono = r["mode"] == "chrono"
        total = r["i"] if chrono else r["total"]
        record = st["record_chrono"]
        new = chrono and r["bons"] > record
        if new:
            st["record_chrono"] = r["bons"]
        self._id += 1
        label = (f"Table de {r['table']}" if r["mode"] == "table" else LABEL.get(r["kind"]) or "Mélange")
        self.cur = {"id": self._id, "mode": r["mode"], "kind": r["kind"] or "", "type": label, "etat": "bilan", "bons": r["bons"], "total": total,
                    "record": max(record, r["bons"]) if chrono else 0, "nouveau_record": bool(new), "t0": self.ms(), "next_at": self.ms() + 14000}
        self.run = None
        self._event("serie", fin=True, bons=r["bons"], total=total, chrono=chrono, record=bool(new))
        self._trophies()
        self.save()

    def tick(self):
        """Called often (4 times a second): the result shown long enough, the challenge over, an exercise left alone."""
        changed = self._day()
        c, t = self.cur, self.ms()
        if not c:
            return changed
        if c["mode"] == "chrono" and self.run and t >= self.run["ends_at"] and c["etat"] != "bilan":
            self._bilan()
            return True
        if c["etat"] == "resultat" and t >= c.get("next_at", float("inf")):
            self._advance()
            return True
        if c["etat"] == "bilan" and t >= c.get("next_at", float("inf")):
            self.stop()
            return True
        if c["etat"] == "question" and t - c["t0"] > IDLE_CLOSE_MS:
            self.stop()
            return True
        return changed

    def set_reglages(self, niveau=None, auto=None, types=None, objectif=None, propose=None, save=True, **_):
        g = self.reglages
        lv = _int(niveau, 1, 5)
        if lv and lv != g["niveau"]:
            g["niveau"] = lv
            if hasattr(self, "stats"):                     # a new start level: every kind starts again from it
                self.stats.update(niveau=lv, niveaux={}, montee={})
        if isinstance(auto, bool):
            g["auto"] = auto
        if isinstance(types, list):
            t = [k for k in IDS if k in types]
            g["types"] = t or IDS[:]
        o = _int(objectif, 1, 50)
        if o:
            g["objectif"] = o
        if isinstance(propose, bool):
            g["propose"] = propose
        if save:
            self.save()

    # ---- what the screens get ----
    def public(self):
        st, c, t = self.stats, self.cur, self.ms()
        cur = None
        if c and c["etat"] == "bilan":
            cur = {k: c[k] for k in ("id", "mode", "kind", "type", "etat", "bons", "total", "record", "nouveau_record", "t0")}
        elif c:
            cur = {k: c[k] for k in ("id", "kind", "mode", "q", "choices", "num", "clavier", "t0", "tries", "faux", "niveau", "i", "n", "etat", "table")}
            cur["type"] = f"Table de {c['table']}" if c.get("table") else LABEL[c["kind"]]
            if c["hint_on"]:
                cur["hint"] = c["hint"]
            if c["etat"] == "resultat":                        # answered: now it may be shown
                cur.update(ok=c["ok"], answer=c["answer"], explication=c["explication"], valeur=c["valeur"], passe=c["passe"], monte=c["monte"])
            if self.run and self.run["mode"] == "chrono":
                cur.update(ends_at=self.run["ends_at"], left=max(0, math.ceil((self.run["ends_at"] - t) / 1000)), bons=self.run["bons"])
        pt = {k: [v.get("n", 0), v.get("ok", 0), self.level(k)] for k, v in st["par_type"].items()}
        return {"cur": cur, "last": self.last, "ev": self.ev, "niveau": self.global_level(), "reglages": dict(self.reglages),
                "stats": {"total": st["total"], "justes": st["justes"], "serie": st["serie"], "serie_max": st["serie_max"], "aujourdhui": st["aujourdhui"],
                          "justes_jour": st["justes_jour"], "objectif": self.reglages["objectif"], "coupes": st["coupes"], "fait": st["coupe_jour"] == st["jour"],
                          "record_chrono": st["record_chrono"], "trophees": list(st["trophees"]), "par_type": pt},
                "kinds": [{"id": i, "label": label} for i, label in KINDS], "trophees": [{"id": i, "label": label} for i, label, _ in TROPHIES]}

    def summary(self):
        st = self.stats
        pct = round(100 * st["justes"] / st["total"]) if st["total"] else 0
        return (f"Aujourd'hui : {st['aujourdhui']} exo{'s' if st['aujourdhui'] > 1 else ''} sur {self.reglages['objectif']}"
                f" ({st['justes_jour']} juste{'s' if st['justes_jour'] > 1 else ''}). En tout : {st['total']}, {pct} % de justes. "
                f"Meilleure série : {st['serie_max']}. Record du défi chrono : {st['record_chrono']}. Trophées : {len(st['trophees'])}/{len(TROPHIES)}.")


# ---------- typed commands (pixel/commands.py) ----------
KIND_WORDS = {"addition": "addition", "additions": "addition", "plus": "addition", "soustraction": "soustraction", "soustractions": "soustraction",
              "moins": "soustraction", "multiplication": "table", "multiplications": "table", "tables": "table", "table": "table", "fois": "table",
              "division": "division", "divisions": "division", "partage": "division", "complement": "complement", "complements": "complement",
              "double": "double", "doubles": "double", "moitie": "double", "moities": "double", "calcul mental": "mental", "priorites": "mental",
              "mental": "mental", "comparaison": "comparaison", "comparaisons": "comparaison", "suite": "suite", "suites": "suite",
              "suite logique": "suite", "suites logiques": "suite", "probleme": "probleme", "problemes": "probleme", "heure": "heure", "heures": "heure",
              "duree": "heure", "durees": "heure", "fraction": "fraction", "fractions": "fraction", "pourcentage": "pourcentage",
              "pourcentages": "pourcentage", "carre": "carre", "carres": "carre", "enigme": "enigme", "enigmes": "enigme", "devinette": "enigme",
              "devinettes": "enigme", "logique": "enigme"}
EXO = r"(?:un |une |des |mon |un petit |une petite )?(?:exo|exos|exercice|exercices)"
NUMBER = re.compile(r"^(?:(?:la )?reponse(?: est)?|rep|=|c'est|c est)?\s*(−?-?(?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)(?:[.,]\d+)?(?:\s*h\s*\d{0,2})?)"
                    r"\s*(?:min|minutes|€|euros?|%|h)?\s*[!.]?$")     # 4 025 too, the French way


async def command(hub, raw, t):
    """A typed command about the exercises, or a number while one is open. True when it was one (nothing else to do)."""
    ex = getattr(hub, "exos", None)
    if ex is None:
        return False
    t = re.sub(r"\s+", " ", t.replace("’", "'")).strip(" !?.")
    c = ex.cur
    async def go(**a):
        await hub.dispatch("exos.nouveau", a)
        return True
    if c and c["etat"] != "question" and (NUMBER.match(t) or re.match(r"^(?:la )?reponse\b", t)):
        # an exercise is open but waits for no answer (its correction, a summary): the number is not Claude's either
        nxt = ex.run and c["etat"] == "resultat" and c.get("i", 0) < c.get("n", 0)
        hub.toast("La question suivante arrive !" if nxt else "Cet exo est fini. Tape « encore » pour un autre !", 3000)
        return True
    if c and c["etat"] == "question":
        m = NUMBER.match(t)
        if m:
            await hub.dispatch("exos.repondre", {"value": m.group(1), "id": c["id"]})
            return True
        m = re.match(r"^(?:la )?reponse(?: est)?\s*:?\s*(.+)$", t)
        if m:
            await hub.dispatch("exos.repondre", {"value": m.group(1), "id": c["id"]})
            return True
        if any(same(t, x) for x in c["choices"]) and not re.fullmatch(r"[a-z]{1,2}", t):
            await hub.dispatch("exos.repondre", {"value": t, "id": c["id"]})
            return True
        if t in ("indice", "un indice", "aide-moi", "aide moi", "je sais pas", "je ne sais pas", "help"):
            await hub.dispatch("exos.indice")
            return True
    if c and (t in ("passe", "je passe", "passer", "joker") or (c["etat"] != "question" and t in ("suivant", "suivante", "ok", "la suite", "continue"))):
        await hub.dispatch("exos.passer")
        return True
    if c and t in ("stop", "fini", "j'arrete", "arrete", "on arrete", "termine") and not hub.s.get("timer", {}).get("running"):
        await hub.dispatch("exos.stop")
        return True
    if re.fullmatch(r"(?:stop|arrete|arreter|fini|finis|termine)(?: les| l'| le)? ?(?:exo|exos|exercice|exercices|maths?)", t):
        await hub.dispatch("exos.stop")
        return True
    if t in ("mes scores", "scores", "mon score", "mes stats", "mes statistiques", "mes resultats", "mes exos", "mes trophees"):
        hub.toast(ex.summary(), 9000)
        return True
    if t in ("encore", "encore un", "encore une", "un autre", "une autre", "on continue", "on recommence") and ex.wants_again():
        await hub.dispatch("exos.encore")
        return True
    m = re.fullmatch(r"(?:revise |revisons |la |les )?(?:table|tables) (?:de |du |des )?(\d{1,2})", t)
    if m and 2 <= int(m.group(1)) <= 12:
        return await go(mode="table", table=int(m.group(1)))
    if re.fullmatch(r"(?:un |le |mon )?(?:defi chrono|defi|defi maths?|chrono maths?|defi de maths?)", t):
        return await go(mode="chrono")
    m = re.fullmatch(r"(?:une |la )?serie(?: de (\d{1,2}))?(?: (?:exos|exercices|questions|calculs))?|(\d{1,2}) (?:exos|exercices|questions|calculs)", t)
    if m:
        return await go(mode="serie", n=int(m.group(1) or m.group(2) or 5))
    if re.fullmatch(r"(?:une |une petite )?question (?:de )?(?:maths?|calcul)", t):     # not a bare « une question »: that one is for Claude
        return await go()
    if re.fullmatch(r"(?:une |des )?(?:enigme|enigmes|devinette|devinettes)(?: logique| logiques)?", t):
        return await go(kind="enigme")
    if re.fullmatch(r"(?:un |des )?(?:petit )?calculs?(?: mental)?", t):
        return await go(pool=CALCUL) if "mental" not in t else await go(kind="mental")
    m = re.fullmatch(EXO + r"(?: de maths?| maths?| de calcul| de mathematiques)?(?: (facile|difficile|dur|simple|tres difficile))?", t)
    if m:
        lv = ex.global_level()
        hard = m.group(1)
        return await go(niveau=None if not hard else min(5, lv + 2) if hard in ("difficile", "dur", "tres difficile") else max(1, lv - 2))
    m = re.fullmatch(EXO + r" (?:de |d'|sur les |sur |des |avec des |avec les )?(.+?)(?: (facile|difficile|dur))?", t)
    if m and m.group(1).strip() in KIND_WORDS:
        k, hard = KIND_WORDS[m.group(1).strip()], m.group(2)
        lv = ex.level(k)
        return await go(kind=k, niveau=None if not hard else min(5, lv + 2) if hard != "facile" else max(1, lv - 2))
    return False


# ---------- Claude's tool (pixel/claude.py) ----------
TOOL = {"name": "start_exercise", "eager_input_streaming": True,
        "description": "Affiche un petit exercice de maths (ou une énigme) sur l'écran de Pixel : la personne répond en touchant une des 4 réponses "
                       "ou en tapant le nombre. Ne donne jamais la réponse. kind : le type, au hasard s'il manque ("
                       + ", ".join(f"{i} ({label.lower()})" for i, label in KINDS) + "). mode : exo (un seul, par défaut), serie (5 de suite), "
                       "table (la table de multiplication de « table »), chrono (le plus possible en 60 s). niveau : 1 (CP) à 5 (collège) ; "
                       "sans niveau, Pixel prend celui de la personne.",
        "input_schema": {"type": "object", "additionalProperties": False, "required": [], "properties": {
            "kind": {"type": "string", "enum": IDS}, "mode": {"type": "string", "enum": list(MODES)},
            "niveau": {"type": "integer", "minimum": 1, "maximum": 5}, "table": {"type": "integer", "minimum": 2, "maximum": 12}}}}


def check_tool(a):
    return (isinstance(a, dict) and a.get("kind", "addition") in LABEL and a.get("mode", "exo") in MODES
            and (a.get("niveau") is None or (isinstance(a["niveau"], int) and 1 <= a["niveau"] <= 5))
            and (a.get("table") is None or (isinstance(a["table"], int) and 2 <= a["table"] <= 12)))


async def run_tool(hub, a):
    if getattr(hub, "exos", None) is None:
        return "les exercices ne sont pas disponibles"
    await hub.dispatch("exos.nouveau", {"kind": a.get("kind"), "mode": a.get("mode", "exo"), "niveau": a.get("niveau"), "table": a.get("table"), "source": "claude"})
    c = hub.exos.cur or {}
    return (f"Exercice affiché ({c.get('type') or LABEL.get(c.get('kind'), '')}, niveau {c.get('niveau')}) : « {c.get('q', '')} ». "
            "Ne donne pas la réponse : la personne répond sur l'écran. " + hub.exos.summary())


# ---------- the server ----------
def setup(hub, datadir=None):
    """The actions exos.*, the snapshot key "exos", a tick 4 times a second. hub.exos: the game (commands.py, claude.py)."""
    datadir = Path(datadir) if datadir else Path(os.path.expanduser(hub.cfg.get("data_dir", "~/.config/pixel")))
    try:
        ex = Exos(datadir / "exos.json")
    except Exception:                                 # whatever is in exos.json, Pixel starts
        log.exception("exos.json: starting afresh")
        ex = Exos(None)
        ex.path = datadir / "exos.json"
    ex.on_toast = lambda msg: hub.toast(msg, 5000)
    hub.exos = ex

    def pub():
        hub.s["exos"] = ex.public()

    pub()

    @hub.action("exos.nouveau")
    async def nouveau(kind=None, niveau=None, mode="exo", n=None, table=None, source=None, pool=None):
        """A new exercise (kind: one of KINDS, or mixed), or a series: mode serie (n), table (table), chrono (60 s)."""
        ex.nouveau(kind=kind, niveau=niveau, mode=str(mode or "exo"), n=n, table=table, source=source, pool=pool if isinstance(pool, list) else None)
        hub.s["anim"] = None
        hub.s["screen"] = "visage"                    # the exercise shows on his face screen
        pub()

    @hub.action("exos.encore")
    async def encore():
        ex.encore()
        hub.s["screen"] = "visage"
        pub()

    @hub.action("exos.repondre")
    async def repondre(value="", id=None):
        ex.repondre(value, id)
        pub()

    @hub.action("exos.indice")
    async def indice():
        ex.indice()
        pub()

    @hub.action("exos.passer")
    async def passer(id=None, etat=None):
        ex.passer(id, etat)
        pub()

    @hub.action("exos.stop")
    async def stop():
        ex.stop(user=True)
        pub()

    @hub.action("exos.reglages")
    async def reglages(niveau=None, auto=None, types=None, objectif=None, propose=None):
        ex.set_reglages(niveau=niveau, auto=auto, types=types, objectif=objectif, propose=propose)
        pub()

    async def tick():
        if ex.tick():
            pub()
            hub.mark()

    hub.exos_tick = tick
    try:
        hub.exos_task = asyncio.get_running_loop().create_task(hub.every(0.25, tick))
    except RuntimeError:                              # no event loop (a test): the caller ticks
        pass
    return ex
