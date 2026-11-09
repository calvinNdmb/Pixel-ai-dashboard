"""Feeding Pixel ("qu'on puisse le nourrir"): a gentle virtual-pet belly. He never dies, never gets sick, never sulks
for long: he only gets a little hungry, says so now and then, and enjoys (or not) what you give him.

- His belly ("ventre", 0..100, 100 = full) empties slowly during the day: SPEEDS points an hour (lente, normale,
  rapide), faster when his character trait "gourmand" is high (hub.s["caractere"]["traits"]["gourmand"], 50 when
  missing: today's Pixel). Never at night (23 h - 6 h). While the server is down, at most DOWN_CAP_H awake hours count,
  and never below DOWN_FLOOR: he wakes up a little hungry at worst. The same once running, when the clock jumps (the Pi
  has no RTC: NTP sets its clock after boot) or the loop stalls: a gap longer than DOWN_GAP between two ticks. It can be
  switched off ("on": false): then his belly stays as it is, he never asks for anything, and meals are refused with a word.
- The menu (24 foods, drawn in pixel art) lives in web/scenes/nourrir.js; this module reads its id, label, name,
  category and value from there (F('id', 'Label', 'nom', 'cat', valeur, ...), one per line), like scenes.py does.
- His tastes: one favourite, a few likes and dislikes, drawn once from a stored seed, so they stay across restarts;
  nourrir.gouts draws new ones.
- A meal (nourrir.donner {plat}, at most one every MEAL_GAP s) gets a reaction: prefere, aime, miam, beurk (he eats it
  anyway), refuse (a disliked food when he is grumpy: trait grognon >= 70), plein (full: he refuses kindly), eclate (too
  much: « Je vais éclater ! »), sucre (the third sweet in a row: a sugar rush, then a crash), legume (« Fort comme un
  robot ! »), robot (a battery, electricity...: a glitchy recharge); and sometimes a burp ("rot", more if he is farceur).
  The screens play the scene (web/scenes/nourrir.js, event 'nourrir-repas') when "dernier" changes.

Snapshot "nourrir": {on, ventre (int), faim (0 fine, 1 a little hungry, 2 very hungry), dernier: {id, plat, t (ms),
reaction, rot, choisi} or None, gouts: {aime, deteste, prefere}, journal (the last 10 meals, newest first: plat, t,
reaction), reglages: {on, vitesse}}. Saved in data_dir/nourrir.json; a hand-edited file is cleaned when read (any value out
of place falls back to its default, never a crash). web/lab/demo-hub.js mirrors it for Pixel Lab.
"""
import asyncio
import datetime as dt
import json
import logging
import math
import os
import random
import re
import time
import unicodedata
from pathlib import Path

log = logging.getLogger("pixel.nourrir")
PACK = Path(__file__).resolve().parent.parent / "web" / "scenes" / "nourrir.js"
_F = re.compile(r"""\bF\(\s*'([a-z0-9-]+)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([a-z]+)'\s*,\s*(\d+)""")
CATS = {"fruit": "Fruits", "legume": "Légumes", "plat": "Plats", "sucre": "Sucreries", "boisson": "Boissons", "robot": "Pour robots"}
SPEEDS = {"lente": 3.0, "normale": 6.0, "rapide": 12.0}      # belly points an awake hour, at gourmand 50
CREUX, FAIM = 55, 25            # below: a little hungry (faim 1), very hungry (faim 2)
FULL, OVERFULL = 92, 104        # from FULL he refuses (gourmand moves it a little); past OVERFULL after the meal: bloated
NIGHT = (23, 6)                 # his belly sleeps too
DOWN_CAP_H, DOWN_FLOOR = 6, 25  # the server was down: at most 6 awake hours count, and not below a little hungry
DOWN_GAP = 300                  # s between two ticks (they come every 60 s) past which the time counts as downtime
T_MIN = 946684800               # 2000-01-01: a saved time before it is not a time
MEAL_GAP = 6.0                  # seconds between two meals (a scene lasts about that long)
SWEET_RUN, SWEET_WINDOW = 3, 45 * 60
JOURNAL = 10
REACTIONS = {"prefere": "son plat préféré !", "aime": "il adore", "miam": "miam", "beurk": "beurk… mais il l’a mangé",
             "refuse": "il n’en veut pas", "plein": "il n’a plus faim", "eclate": "il a trop mangé !", "sucre": "trop de sucre !",
             "legume": "fort comme un robot !", "robot": "recharge !"}
OFF_MSG = "Les repas de Pixel sont en pause : réactive-les dans Nourrir, sur ton téléphone."
# how likely each category is to be his favourite, liked, disliked
W_FAV = {"plat": 3, "sucre": 2, "fruit": 1, "legume": 0.3, "boisson": 0.6, "robot": 1.2}
W_LIKE = {"plat": 2, "sucre": 2, "fruit": 1.2, "legume": 0.6, "boisson": 1, "robot": 1}
W_HATE = {"legume": 3, "fruit": 1.4, "boisson": 1, "plat": 1, "sucre": 0.4, "robot": 0.6}


def _read():
    text = re.sub(r"/\*.*?\*/", "", PACK.read_text(encoding="utf-8"), flags=re.S)
    text = re.sub(r"(?m)^\s*//.*$", "", text)
    return [{"id": i, "label": label, "nom": nom, "cat": cat, "valeur": int(v)} for i, label, nom, cat, v in _F.findall(text)]


FOODS = _read()
BY_ID = {f["id"]: f for f in FOODS}
IDS = [f["id"] for f in FOODS]


# ---- words: what people type after « mange », « donne-lui »… ----
def norm(s):
    s = unicodedata.normalize("NFD", str(s).lower().strip())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").replace("’", "'").replace("œ", "oe")


def key(s):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9' -]+", " ", norm(s))).strip()


ARTICLES = ("un peu de ", "un bout de ", "une part de ", "un morceau de ", "un verre de ", "une tasse de ", "un bol de ",
            "une tranche de ", "une assiette de ", "un ", "une ", "des ", "du ", "de la ", "de l'", "de ", "d'", "le ", "la ",
            "les ", "l'", "ce ", "cette ", "ces ", "ton ", "ta ", "tes ", "mon ", "ma ", "mes ", "son ", "sa ", "ses ")


def bare(k):
    for _ in range(2):
        for a in ARTICLES:
            if k.startswith(a):
                k = k[len(a):].strip()
                break
    return k


WORDS = {}
for _f in FOODS:
    for _w in (_f["id"], _f["id"].replace("-", " "), _f["label"], _f["nom"]):
        _k = bare(key(_w))
        for _v in (_k, _k + "s", key(_w)):
            WORDS.setdefault(_v, _f["id"])
for _w, _i in {"spaghetti": "pates", "spaghettis": "pates", "pate": "pates", "nouilles": "pates", "hamburger": "burger",
               "cheeseburger": "burger", "gateau au chocolat": "gateau", "creme glacee": "glace", "chocolat": "chocolat",
               "lait": "lait", "batterie": "pile", "byte": "octet", "electricite": "prise", "courant": "prise", "jus": "prise",
               "prise electrique": "prise", "cookies web": "cookie-web", "cookie web": "cookie-web", "friandise": "bonbon",
               "pain": "baguette", "sucette": "bonbon", "cafe au lait": "lait"}.items():
    if _i in BY_ID:
        WORDS.setdefault(_w, _i)


def find(text):
    """The food a few words name (« une pizza », « des frites pour Pixel »), or None."""
    k = re.sub(r"\s+(?:a|pour)\s+(?:pixel|toi|lui)$", "", key(text))
    k = bare(k)
    return WORDS.get(k) or WORDS.get(k[:-1] if k.endswith(("s", "x")) else k)


# ---- time: his awake hours ----
def is_night(t):
    h = dt.datetime.fromtimestamp(t).hour
    return h >= NIGHT[0] or h < NIGHT[1]


def awake_hours(t0, t1, cap=None):
    """Hours between t0 and t1 (seconds) outside the night, at most cap."""
    total, t = 0.0, float(t0)
    while t < t1:
        d = dt.datetime.fromtimestamp(t)
        if d.hour >= NIGHT[0]:
            edge = dt.datetime.combine(d.date() + dt.timedelta(days=1), dt.time(NIGHT[1]))
        elif d.hour < NIGHT[1]:
            edge = dt.datetime.combine(d.date(), dt.time(NIGHT[1]))
        else:
            edge = dt.datetime.combine(d.date(), dt.time(NIGHT[0]))
        end = min(max(edge.timestamp(), t + 1), t1)
        if not (d.hour >= NIGHT[0] or d.hour < NIGHT[1]):
            total += (end - t) / 3600
            if cap is not None and total >= cap:
                return cap
        t = end
    return total


def level(v):
    return 0 if v >= CREUX else 1 if v >= FAIM else 2


def roll(seed):
    """His tastes, from a seed: always the same ones for the same seed."""
    r = random.Random(seed)

    def draw(pool, weights, n):
        pool, out = list(pool), []
        while pool and len(out) < n:
            tot = sum(weights[f["cat"]] for f in pool)
            x = r.random() * tot
            for f in pool:
                x -= weights[f["cat"]]
                if x < 0:
                    break
            out.append(f["id"])
            pool.remove(f)
        return out

    prefere = draw(FOODS, W_FAV, 1)[0]
    aime = draw([f for f in FOODS if f["id"] != prefere], W_LIKE, 5)
    deteste = draw([f for f in FOODS if f["id"] != prefere and f["id"] not in aime], W_HATE, 3)
    return {"aime": aime, "deteste": deteste, "prefere": prefere}


def _traits(hub):
    c = hub.s.get("caractere")
    t = c.get("traits") if isinstance(c, dict) else None
    t = t if isinstance(t, dict) else {}
    if t and c.get("humeur_jour") is True:          # his mood of the day: the traits his screens live by today (pixel/caractere.py)
        try:
            from . import caractere
            return caractere.today_traits(c)
        except Exception:                           # noqa: BLE001 - his belly never depends on it
            pass
    return t


def trait(hub, name):
    v = _traits(hub).get(name, 50)
    return max(0, min(100, v)) if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) else 50


class Nourrir:
    def __init__(self, hub, datadir=None, now=time.time, rng=None):
        self.hub, self.now, self.rng = hub, now, rng or random.Random()
        self.file = Path(datadir) / "nourrir.json" if datadir else None
        self.last_meal = -1e9
        t = self.now()
        try:
            self._restore(self._load(), t)
        except Exception as e:                     # whatever the file holds, Pixel starts: a new belly
            log.warning("nourrir.json: %r, a new belly", e)
            self._restore({}, t)
        self.t, self.saved_at, self.saved_v = t, t, self.ventre
        self.publish()
        self.save()

    def _restore(self, d, t):
        """His state from nourrir.json (d), every value checked: one out of place takes its default."""
        self.on = d.get("on") is not False
        self.vitesse = d.get("vitesse") if isinstance(d.get("vitesse"), str) and d.get("vitesse") in SPEEDS else "normale"
        self.ventre = max(0.0, min(100.0, self._num(d.get("ventre"), 80.0)))
        g = d.get("graine")
        self.graine = g if isinstance(g, int) and not isinstance(g, bool) else self.rng.randrange(1 << 30)
        g = d.get("gouts")
        self.gouts = {"aime": list(g["aime"]), "deteste": list(g["deteste"]), "prefere": g["prefere"]} if self._good_tastes(g) else roll(self.graine)
        meals = [m for m in map(self._meal, d.get("journal") if isinstance(d.get("journal"), list) else []) if m]
        self.journal = [{"plat": m["plat"], "t": m["t"], "reaction": m["reaction"]} for m in meals][:JOURNAL]
        self.dernier = self._meal(d.get("dernier"))
        self.sucres = int(max(0, min(SWEET_RUN, self._num(d.get("sucres"), 0))))
        self.sucre_t = self._num(d.get("sucre_t"), 0)
        saved = self._num(d.get("t"), 0)
        if self.on and T_MIN < saved < t:          # the server was down: it counts, but not much
            self.ventre = self._down(saved, t)

    @staticmethod
    def _meal(m):
        """A meal of the journal (or the last one) as saved, cleaned; None when it is not one."""
        if not isinstance(m, dict) or not isinstance(m.get("plat"), str) or m["plat"] not in BY_ID:
            return None
        t, r, i = m.get("t"), m.get("reaction"), m.get("id")
        if not isinstance(t, (int, float)) or isinstance(t, bool) or not math.isfinite(t):
            return None
        return {"id": i if isinstance(i, int) and not isinstance(i, bool) and i >= 0 else 0, "plat": m["plat"], "t": float(t),
                "reaction": r if isinstance(r, str) and r in REACTIONS else "miam", "rot": m.get("rot") is True, "choisi": m.get("choisi") is True}

    @staticmethod
    def _num(v, default):
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            return default
        try:
            v = float(v)
        except OverflowError:                      # an int too big for a float
            return default
        return v if math.isfinite(v) else default

    @staticmethod
    def _good_tastes(g):
        ok = lambda i: isinstance(i, str) and i in BY_ID          # noqa: E731
        return (isinstance(g, dict) and ok(g.get("prefere")) and isinstance(g.get("aime"), list) and isinstance(g.get("deteste"), list)
                and all(ok(i) for i in g["aime"] + g["deteste"]))

    # ---- files ----
    def _load(self):
        if not self.file or not self.file.exists():
            return {}
        try:
            d = json.loads(self.file.read_text())
            return d if isinstance(d, dict) else {}
        except (OSError, ValueError):
            log.warning("nourrir.json unreadable: a new belly")
            return {}

    def save(self):
        if not self.file:
            return
        d = {"on": self.on, "vitesse": self.vitesse, "ventre": round(self.ventre, 2), "t": self.t, "graine": self.graine,
             "gouts": self.gouts, "journal": self.journal, "dernier": self.dernier, "sucres": self.sucres, "sucre_t": self.sucre_t}
        try:
            tmp = self.file.with_suffix(".tmp")
            tmp.write_text(json.dumps(d, ensure_ascii=False, indent=1))
            os.replace(tmp, self.file)
            self.saved_at, self.saved_v = self.t, self.ventre
        except OSError:
            log.exception("nourrir.json not saved")

    # ---- his belly ----
    def rate(self):
        return SPEEDS[self.vitesse] * (0.6 + 0.8 * trait(self.hub, "gourmand") / 100)

    def full_at(self):
        return FULL + (trait(self.hub, "gourmand") - 50) / 10       # a glutton always has a little room left

    def _down(self, t0, t1):
        """His belly after time nobody watched (the server down, a clock jump): DOWN_CAP_H awake hours at most, not below DOWN_FLOOR."""
        if self.ventre <= DOWN_FLOOR:
            return self.ventre
        return max(DOWN_FLOOR, self.ventre - awake_hours(t0, t1, DOWN_CAP_H) * self.rate())

    def tick(self, t=None):
        """Empties his belly up to now (not at night, not when off); publishes and saves when it shows. Ticks come every
        60 s: a longer gap than DOWN_GAP is a clock jump (NTP after boot: the Pi has no RTC) or a stalled loop, and counts
        like the server being down. A clock set back: the time counts again from its new value."""
        t = self.now() if t is None else t
        before = (round(self.ventre), level(self.ventre))
        if self.on and t > self.t:
            self.ventre = self._down(self.t, t) if t - self.t > DOWN_GAP else max(0.0, self.ventre - awake_hours(self.t, t) * self.rate())
        self.t = t if t < self.t - DOWN_GAP else max(self.t, t)
        if (round(self.ventre), level(self.ventre)) != before:
            self.publish()
        if abs(self.ventre - self.saved_v) >= 1 or self.t - self.saved_at > 600:
            self.save()

    async def atick(self):
        self.tick()

    def publish(self):
        self.hub.s["nourrir"] = {
            "on": self.on, "ventre": int(round(self.ventre)), "faim": level(self.ventre), "dernier": self.dernier,
            "gouts": {"aime": list(self.gouts["aime"]), "deteste": list(self.gouts["deteste"]), "prefere": self.gouts["prefere"]},
            "journal": [dict(j) for j in self.journal], "reglages": {"on": self.on, "vitesse": self.vitesse}}
        self.hub.mark()

    def too_soon(self, t=None):
        return 0 <= (self.now() if t is None else t) - self.last_meal < MEAL_GAP     # a clock set back does not stop his meals

    # ---- a meal ----
    def react(self, f, t):
        """(reaction, eaten, sweets in a row after it) for food f now."""
        g, plat, v = self.gouts, f["id"], self.ventre
        if v >= self.full_at():
            return "plein", False, self.sucres
        if plat in g["deteste"] and trait(self.hub, "grognon") >= 70:
            return "refuse", False, self.sucres
        run = (self.sucres + 1 if 0 <= t - self.sucre_t < SWEET_WINDOW else 1) if f["cat"] == "sucre" else 0
        if plat == g["prefere"]:
            r = "prefere"
        elif plat in g["deteste"]:
            r = "beurk"
        elif run >= SWEET_RUN:
            r, run = "sucre", 0
        elif v + f["valeur"] > OVERFULL:
            r = "eclate"
        elif f["cat"] == "robot":
            r = "robot"
        elif f["cat"] == "legume":
            r = "legume"
        elif plat in g["aime"]:
            r = "aime"
        else:
            r = "miam"
        return r, True, run

    def donner(self, plat, choisi=False):
        """He eats (or not) a food: returns the reaction, or None (unknown food, off, too soon)."""
        f = BY_ID.get(str(plat))
        if not f:
            return None
        if not self.on:
            self.hub.toast(OFF_MSG, 5000)
            return None
        t = self.now()
        if self.too_soon(t):
            return None
        self.tick(t)
        r, eaten, run = self.react(f, t)
        if eaten:
            self.ventre = min(100.0, self.ventre + f["valeur"] * (0.7 if r == "beurk" else 1))
            self.sucres = run
            if f["cat"] == "sucre":
                self.sucre_t = t
        rot = r == "eclate" or (r in ("miam", "aime", "prefere", "legume") and self.rng.random() < 0.04 + 0.26 * trait(self.hub, "farceur") / 100)
        self.last_meal = t
        self.dernier = {"id": ((self.dernier or {}).get("id") or 0) + 1, "plat": f["id"], "t": t * 1000, "reaction": r, "rot": rot, "choisi": bool(choisi)}
        self.journal = ([{"plat": f["id"], "t": t * 1000, "reaction": r}] + self.journal)[:JOURNAL]
        self.hub.s["anim"] = None
        self.hub.s["screen"] = "visage"            # he eats on his face screen
        self.publish()
        self.save()
        return r

    def choisir(self):
        """What he picks himself (« à table ! »): often his favourite, else something he likes, never what he dislikes."""
        g, x = self.gouts, self.rng.random()
        if x < 0.35:
            return g["prefere"]
        if x < 0.8 and g["aime"]:
            return self.rng.choice(g["aime"])
        return self.rng.choice([i for i in IDS if i not in g["deteste"] and BY_ID[i]["cat"] != "robot"] or IDS)

    def reglages(self, on=None, vitesse=None):
        if on is not None and bool(on) != self.on:
            self.tick()
            self.on = bool(on)
            self.t = self.now()                     # the time it was off does not count
        if vitesse in SPEEDS:
            self.tick()
            self.vitesse = vitesse
        self.publish()
        self.save()

    def new_tastes(self):
        self.graine = self.rng.randrange(1 << 30)
        self.gouts = roll(self.graine)
        self.publish()
        self.save()

    def status(self):
        """A few words for Claude and the commands."""
        v = round(self.ventre)
        word = "le ventre plein" if v >= self.full_at() else "pas faim" if v >= CREUX else "un petit creux" if v >= FAIM else "très faim"
        return f"ventre à {v} % ({word})" + ("" if self.on else ", repas en pause")


# ---- typed commands (pixel/commands.py calls command() just before handing the text to Claude) ----
_BELLY = re.compile(r"^(?:pixel[, ]+)?(?:est-ce que )?(?:tu as|t'as|t as|as-tu|as tu|tu n'as pas|t'as pas) (?:faim|un petit creux|un creux)(?: pixel)?$")
_TABLE = re.compile(r"^(?:a table|a la soupe|a manger|on mange|c'est l'heure de manger|nourris(?:-le| le| pixel|-toi| toi)?|nourrir pixel|"
                    r"donne(?:-lui| lui)? a manger(?: a pixel)?|fais(?:-le| le)? manger|mange quelque chose|mange un truc)(?: pixel)?$")
_EAT = re.compile(r"^(?:pixel[, ]+)?(?:mange donc|manges|mange|goute|bois|avale|croque|grignote|tiens,? (?:voila|voici))\s+(.+)$")
_GIVE = re.compile(r"^(?:donne-lui|donne lui|donne|file-lui|file lui|offre-lui|offre lui|offre|sers-lui|sers lui|apporte-lui|apporte lui)\s+(.+)$")


async def command(hub, t):
    """True when the (normalized) text was about his meals. Conservative: a food must be named, or the words are exact."""
    N = getattr(hub, "nourrir", None)
    if not N:
        return False
    t = re.sub(r"\s+(?:s'il te plait|s il te plait|stp|svp)$", "", re.sub(r"[\s!?.…]+$", "", norm(t))).strip()
    if _BELLY.match(t):
        await hub.dispatch("scene.play", {"id": "nourrir-ventre"})          # he listens to his belly, and says (web/scenes/nourrir.js)
        return True
    if _TABLE.match(t):
        if not N.on:
            hub.toast(OFF_MSG, 5000)
        elif N.too_soon():
            hub.toast("Doucement, il mâche encore !", 3000)
        else:
            N.donner(N.choisir(), choisi=True)
        return True
    m = _EAT.match(t) or _GIVE.match(t)
    plat = find(m.group(1)) if m else None
    if not plat:
        return False
    if not N.on:
        hub.toast(OFF_MSG, 5000)
    elif N.too_soon():
        hub.toast("Doucement, il mâche encore !", 3000)
    else:
        N.donner(plat)
    return True


# ---- Claude (pixel/claude.py adds TOOL to its tools, and asks check_tool() and run_tool()) ----
TOOL = {"name": "feed_pixel", "eager_input_streaming": True,
        "description": "Tu manges un plat, pour de vrai, sur ton écran : quand on te nourrit, qu'on t'offre à manger ou qu'on te demande "
                       "de manger. Tu réagis selon tes goûts (ton plat préféré, ce que tu aimes ou pas) et ton ventre (plein, tu refuses). "
                       "« au-choix » : tu choisis toi-même. Le résultat dit comment ça s'est passé et où en est ton ventre. Les plats : "
                       + " ; ".join(f"{f['id']} ({f['label']})" for f in FOODS) + ".",
        "input_schema": {"type": "object", "properties": {"plat": {"type": "string", "enum": IDS + ["au-choix"]}}, "required": ["plat"],
                         "additionalProperties": False}}


def check_tool(a):
    ok = isinstance(a, dict) and (a.get("plat") in BY_ID or a.get("plat") == "au-choix")
    return None if ok else "entrée invalide pour feed_pixel : " + json.dumps(a, ensure_ascii=False)


async def run_tool(hub, a):
    N = getattr(hub, "nourrir", None)
    if not N:
        return "pas de repas sur ce Pixel"
    if not N.on:
        return "tes repas sont en pause dans les réglages de Nourrir : tu ne manges pas"
    if N.too_soon():
        return "tu mâches encore : attends quelques secondes"
    plat = N.choisir() if a["plat"] == "au-choix" else a["plat"]
    r = N.donner(plat, choisi=a["plat"] == "au-choix")
    if not r:
        return "tu n'as pas mangé"
    return f"{BY_ID[plat]['nom']} : {REACTIONS[r]}. Tu as maintenant {N.status()}."


def setup(hub, datadir=None, now=time.time, rng=None):
    """The belly, its actions and its clock. datadir: [data_dir] of config.toml by default."""
    if datadir is None:
        datadir = Path(os.path.expanduser(hub.cfg.get("data_dir", "~/.config/pixel")))
    N = Nourrir(hub, datadir, now, rng)
    hub.nourrir = N

    @hub.action("nourrir.donner")
    async def donner(plat, choisi=False):
        """Pixel eats a food of the menu (web/scenes/nourrir.js), at most once every MEAL_GAP s."""
        N.donner(plat, bool(choisi))

    @hub.action("nourrir.reglages")
    async def reglages(on=None, vitesse=None):
        """on: his hunger on or off; vitesse: lente, normale, rapide."""
        N.reglages(None if on is None else bool(on), vitesse)

    @hub.action("nourrir.gouts")
    async def gouts():
        """New tastes: another favourite, other likes and dislikes."""
        N.new_tastes()

    try:
        N.task = asyncio.get_running_loop().create_task(hub.every(60, N.atick, 60))
    except RuntimeError:                         # no loop (tests): they call tick() themselves
        N.task = None
    return N
