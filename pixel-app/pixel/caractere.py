"""Pixel's character (« caractère »): eight traits that change how he behaves, named presets, his name and yours.

Each trait goes from 0 to 100, and 50 is the Pixel of every day, exactly (web/persona.js then behaves byte for byte as
before). The screens read the snapshot "caractere" and play it on his face (web/caractere.js hands it to persona.js):
    {"preset": "grognon", "traits": {"calin": 30, "grognon": 92, ...}, "nom": "Pixel", "surnom": "",
     "humeur_jour": False, "calme": {"de": 23, "a": 6}, "boude": True, "parle": True,
     "change": {"t0", "quoi", "kind", "adj", ...} or None,   # the last change: each screen plays his reaction once
     "essai": 0}                                             # « Essayer »: each screen plays a typical scene of his
Other features read it defensively: hub.s.get("caractere", {}).get("traits", {}).get("gourmand", 50).
Actions: caractere.set {preset?, traits?, nom?, surnom?, humeur_jour?, calme?, boude?, parle?} (everything validated and
clamped), caractere.ajuste {trait, d} (« plus câlin »), caractere.reset, caractere.essai. Saved in data_dir/caractere.json
(a missing or broken file gives the defaults). The same presets and rules, in JavaScript: web/caractere.js (Pixel Lab).
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
from pathlib import Path

log = logging.getLogger("pixel")

TRAITS = ("calin", "grognon", "bavard", "farceur", "energique", "curieux", "gourmand", "studieux")
ENDS = {"calin": ("Indépendant", "Câlin"), "grognon": ("Patient", "Grognon"), "bavard": ("Taiseux", "Bavard"),
        "farceur": ("Sérieux", "Farceur"), "energique": ("Calme", "Énergique"), "curieux": ("Blasé", "Curieux"),
        "gourmand": ("Petit appétit", "Gourmand"), "studieux": ("Pas scolaire", "Studieux")}


def _t(calin=50, grognon=50, bavard=50, farceur=50, energique=50, curieux=50, gourmand=50, studieux=50):
    return {"calin": calin, "grognon": grognon, "bavard": bavard, "farceur": farceur, "energique": energique,
            "curieux": curieux, "gourmand": gourmand, "studieux": studieux}


# id: (name, one line, traits). "surprise" is a roll of the dice. Same list in web/caractere.js (tests/test_caractere.py).
PRESETS = {
    "pixel": ("Pixel", "Équilibré\u00a0: le Pixel de tous les jours.", _t()),
    "calin": ("Câlin", "Il adore les câlins et te couvre de cœurs.", _t(92, 25, 55, 45, 50, 50, 50, 50)),
    "grognon": ("Grognon", "Râleur et susceptible, mais gentil au fond.", _t(30, 92, 55, 30, 50, 40, 50, 50)),
    "farceur": ("Farceur", "Blagues, grimaces et petites farces.", _t(55, 35, 65, 92, 65, 55, 50, 35)),
    "timide": ("Timide", "Discret, il rougit vite et parle peu.", _t(60, 35, 12, 25, 35, 40, 50, 55)),
    "bavard": ("Bavard", "Une vraie pipelette\u00a0: il commente tout.", _t(55, 45, 95, 60, 60, 70, 50, 50)),
    "paresseux": ("Paresseux", "Toujours fatigué, il adore la sieste.", _t(55, 45, 35, 40, 8, 30, 65, 25)),
    "pile": ("Pile électrique", "Il ne tient pas en place\u00a0!", _t(50, 30, 70, 65, 95, 70, 50, 40)),
    "gourmand": ("Gourmand", "Il pense tout le temps à manger.", _t(60, 40, 55, 50, 45, 50, 95, 40)),
    "prof": ("Petit prof", "Il adore apprendre et te poser des colles.", _t(50, 45, 65, 35, 55, 80, 45, 95)),
    "reveur": ("Rêveur", "La tête dans les étoiles.", _t(60, 25, 35, 45, 30, 75, 50, 40)),
    "curieux": ("Curieux", "Il veut tout voir et tout savoir.", _t(50, 40, 65, 50, 65, 95, 50, 65)),
    "zen": ("Zen", "Rien ne l’énerve, jamais.", _t(60, 5, 40, 40, 30, 45, 50, 50)),
    "independant": ("Indépendant", "Il vit sa vie et n’aime pas trop les câlins.", _t(10, 55, 35, 45, 55, 55, 50, 50)),
    "surprise": ("Surprise", "Un caractère tiré au hasard.", None),
}
# the reaction a screen plays (web/scenes/caractere.js): the side a trait leans to, or the preset itself
KINDS = {("calin", 1): "calin", ("calin", -1): "independant", ("grognon", 1): "grognon", ("grognon", -1): "zen",
         ("bavard", 1): "bavard", ("bavard", -1): "timide", ("farceur", 1): "farceur", ("farceur", -1): "serieux",
         ("energique", 1): "pile", ("energique", -1): "paresseux", ("curieux", 1): "curieux", ("curieux", -1): "blase",
         ("gourmand", 1): "gourmand", ("gourmand", -1): "petit-appetit", ("studieux", 1): "prof", ("studieux", -1): "cancre"}
ADJ = {"pixel": "comme d’habitude", "calin": "câlin", "independant": "indépendant", "grognon": "grognon", "zen": "zen",
       "bavard": "bavard", "timide": "timide", "farceur": "farceur", "serieux": "sérieux", "pile": "plein d’énergie",
       "paresseux": "paresseux", "curieux": "curieux", "blase": "blasé", "gourmand": "gourmand", "petit-appetit": "petit mangeur",
       "prof": "studieux", "cancre": "pas très scolaire", "reveur": "rêveur"}
NOM, NOM_MAX, SURNOM_MAX = "Pixel", 16, 20
NOTICE_AFTER = 3.6                           # s: a toast (notice) waits for the end of his reaction's line (web/scenes/caractere.js)
DEFAULT = {"preset": "pixel", "traits": _t(), "nom": NOM, "surnom": "", "humeur_jour": False, "calme": {"de": 23, "a": 6},
           "boude": True, "parle": True}
SAVED = tuple(DEFAULT)                       # what caractere.json keeps ("change" and "essai" are for the screens only)


def now_ms():
    return time.time() * 1000


def _int(v, lo, hi):
    """An int in [lo, hi], or None (a bool is not a number here, nor NaN or infinity: json reads 1e400 as inf)."""
    if isinstance(v, bool) or not isinstance(v, (int, float)) or (isinstance(v, float) and not math.isfinite(v)):
        return None
    return max(lo, min(hi, int(round(v))))


def clean_name(v, most):
    """A name typed anywhere: letters, digits, spaces, - ' . only, trimmed, at most `most` characters."""
    if not isinstance(v, str):
        return None
    s = re.sub(r"[^\w\s'’.-]|_", "", v)
    return re.sub(r"\s+", " ", s).strip(" .-'’")[:most].strip()


def clean(d):
    """A complete, valid character from anything (the saved file, a request): every bad field gets its default."""
    d = d if isinstance(d, dict) else {}
    out = json.loads(json.dumps(DEFAULT))
    if isinstance(d.get("preset"), str) and (d["preset"] in PRESETS or d["preset"] == "perso"):
        out["preset"] = d["preset"]
    tr = d.get("traits") if isinstance(d.get("traits"), dict) else {}
    for t in TRAITS:
        v = _int(tr.get(t), 0, 100)
        if v is not None:
            out["traits"][t] = v
    nom = clean_name(d.get("nom"), NOM_MAX)
    out["nom"] = nom or NOM
    sur = clean_name(d.get("surnom"), SURNOM_MAX)
    out["surnom"] = sur or ""
    for k in ("humeur_jour", "boude", "parle"):
        if isinstance(d.get(k), bool):
            out[k] = d[k]
    q = d.get("calme") if isinstance(d.get("calme"), dict) else {}
    for k in ("de", "a"):
        v = _int(q.get(k), 0, 23)
        if v is not None:
            out["calme"][k] = v
    return out


def matching(traits):
    """The named preset these traits are, or "perso" (« Sur mesure »)."""
    for i, (_, _, t) in PRESETS.items():
        if t and t == traits:
            return i
    return "perso"


def roll(rnd=random):
    """« Surprise »: two or three strong traits, the others close to 50."""
    t = {k: rnd.randint(35, 65) for k in TRAITS}
    for k in rnd.sample(TRAITS, rnd.choice((2, 3))):
        t[k] = rnd.choice((rnd.randint(4, 20), rnd.randint(80, 96)))
    return t


def kind(traits, old=None):
    """The side his character leans to: the trait furthest from 50 (or, with `old`, the one that moved most)."""
    if old:
        moved = max(TRAITS, key=lambda k: abs(traits[k] - old.get(k, 50)))
        if traits[moved] != old.get(moved, 50):
            return KINDS[(moved, 1 if traits[moved] > old.get(moved, 50) else -1)]
    far = max(TRAITS, key=lambda k: abs(traits[k] - 50))
    if abs(traits[far] - 50) < 10:
        return "pixel"
    return KINDS[(far, 1 if traits[far] > 50 else -1)]


def drift(day, trait):
    """« Humeur du jour »: a small drift of a trait (-10..10), the same all day and on every screen (FNV-1a, as in
    web/persona.js)."""
    h = 2166136261
    for b in f"{day}:{trait}".encode():
        h = ((h ^ b) * 16777619) & 0xFFFFFFFF
    return h % 21 - 10


def today_traits(car, day=None):
    """The traits he lives by today: his own, plus the mood of the day when it is on."""
    tr = {k: (car.get("traits") or {}).get(k, 50) for k in TRAITS}
    if not car.get("humeur_jour"):
        return tr
    day = day or dt.date.today().isoformat()
    return {k: max(0, min(100, v + drift(day, k))) for k, v in tr.items()}


def apply(car, args, rnd=random):
    """A new character from caractere.set's arguments: (new, change) with change None when nothing moved."""
    new, quoi, extra = json.loads(json.dumps(car)), [], {}
    p = args.get("preset")
    if isinstance(p, str) and p in PRESETS:                  # a preset is always news, even the same one again: he shows it again
        new["preset"], new["traits"] = p, (roll(rnd) if p == "surprise" else dict(PRESETS[p][2]))
        quoi.append("surprise" if p == "surprise" else "preset")
    elif isinstance(args.get("traits"), dict):
        tr = dict(new["traits"])                         # only the valid values move a trait: a bad one leaves it as it was
        for t, v in args["traits"].items():
            v = _int(v, 0, 100) if t in TRAITS else None
            if v is not None:
                tr[t] = v
        if tr != new["traits"]:
            new["traits"], new["preset"] = tr, matching(tr)
            quoi.append("traits")
    for k, most in (("nom", NOM_MAX), ("surnom", SURNOM_MAX)):
        v = clean_name(args.get(k), most)
        if v is not None:
            v = v or (NOM if k == "nom" else "")
            if v != new[k]:
                new[k] = v
                quoi.append(k)
    for k in ("humeur_jour", "boude", "parle"):
        if isinstance(args.get(k), bool) and args[k] != new[k]:
            new[k] = args[k]
            quoi.append("reglage")
            extra = {"what": "humeur" if k == "humeur_jour" else k, "value": args[k]}
    if isinstance(args.get("calme"), dict):
        q = dict(new["calme"])
        for h in ("de", "a"):
            v = _int(args["calme"].get(h), 0, 23)
            if v is not None:
                q[h] = v
        if q != new["calme"]:
            new["calme"] = q
            quoi.append("reglage")
            extra = {"what": "calme", "value": q}
    if not quoi:
        return new, None
    first = next(q for q in ("surprise", "preset", "traits", "nom", "surnom", "reglage") if q in quoi)
    if first == "preset":
        k = new["preset"] if new["preset"] in ADJ else kind(new["traits"])
    elif first == "surprise":
        k = "surprise"
    elif first == "traits":
        k = kind(new["traits"], car["traits"])
    else:
        k = first
    return new, {"quoi": first, "kind": k, "adj": ADJ.get(kind(new["traits"]), ""), **(extra if first == "reglage" else {})}


def is_default(car):
    return all(car.get(k) == DEFAULT[k] for k in ("traits", "nom", "surnom", "humeur_jour"))


def describe(car):
    """A short French note for Claude's system prompt: his character and the names. Empty for the Pixel of every day."""
    car = clean(car) if car else clean({})
    if is_default(car):
        return ""
    tr, parts = today_traits(car), []
    for t in TRAITS:
        v = tr[t]
        if abs(v - 50) >= 15:
            parts.append(f"{'très' if abs(v - 50) >= 30 else 'plutôt'} {ENDS[t][1 if v > 50 else 0].lower()} ({v}/100)")
    out = []
    p = car["preset"]
    if p in PRESETS and p not in ("pixel", "surprise"):
        name, desc = PRESETS[p][0], PRESETS[p][1].rstrip(".")
        out.append(f"Ton caractère du moment, choisi par la personne : {name}, {desc[0].lower() + desc[1:]}{'' if desc.endswith('!') else '.'}")
    if parts:
        out.append("Tes traits (50 = ton caractère habituel) : " + ", ".join(parts) + ".")
    if tr["grognon"] >= 65:
        out.append("Grognon veut dire râleur mais gentil, jamais méchant.")
    if car["humeur_jour"]:
        out.append("Ton humeur change un peu chaque jour.")
    if out:
        out.append("Réponds avec ce caractère, avec légèreté, sans en faire trop.")
    if car["nom"] != NOM:
        out.append(f"Tu t’appelles {car['nom']} (et non plus Pixel).")
    if car["surnom"]:
        out.append(f"Appelle la personne « {car['surnom']} ».")
    return " ".join(out)


def change_note(car):
    """Told to Claude in the conversation when his character changed since it began (abonnement.py keeps the conversation)."""
    note = describe(car)
    return "[Ton caractère vient de changer. " + (note or "Tu retrouves ton caractère habituel, et tu t’appelles Pixel.") + "]"


def notice(car, change):
    """A toast for a change that the screens alone would not explain (the same in web/caractere.js), or ""."""
    if change and change.get("what") == "parle" and change.get("value") is False and car.get("parle") is not True:
        return f"{car.get('nom') or NOM} ne bavarde plus. Tape « tu peux parler » pour le réentendre."
    return ""


def tool_ok(a):
    """Claude's set_character input (claude.py check())."""
    if not isinstance(a, dict) or not a or set(a) - {"preset", "traits", "nom", "surnom"}:
        return False
    if "preset" in a and a["preset"] not in PRESETS:
        return False
    if "traits" in a and not (isinstance(a["traits"], dict) and all(k in TRAITS and _int(v, 0, 100) == v for k, v in a["traits"].items())):
        return False
    return all(isinstance(a[k], str) for k in ("nom", "surnom") if k in a)


# ---------- typed commands (pixel/commands.py hands them over before Claude): conservative, exact phrases only ----------
PRESET_WORDS = {"pixel": "pixel", "normal": "pixel", "equilibre": "pixel", "toi-meme": "pixel", "toi meme": "pixel",
                "comme d'habitude": "pixel", "par defaut": "pixel", "calin": "calin", "affectueux": "calin", "tendre": "calin",
                "grognon": "grognon", "ronchon": "grognon", "raleur": "grognon", "bougon": "grognon", "susceptible": "grognon",
                "farceur": "farceur", "blagueur": "farceur", "rigolo": "farceur", "drole": "farceur", "timide": "timide",
                "discret": "timide", "bavard": "bavard", "pipelette": "bavard", "paresseux": "paresseux", "flemmard": "paresseux",
                "faineant": "paresseux", "pile electrique": "pile", "une pile electrique": "pile", "energique": "pile",
                "survolte": "pile", "gourmand": "gourmand", "glouton": "gourmand", "petit prof": "prof", "un petit prof": "prof",
                "prof": "prof", "professeur": "prof", "studieux": "prof", "intello": "prof", "reveur": "reveur", "curieux": "curieux",
                "zen": "zen", "patient": "zen", "independant": "independant", "surprise": "surprise", "au hasard": "surprise",
                "hasard": "surprise", "aleatoire": "surprise"}
TRAIT_WORDS = {"calin": ("calin", 1), "affectueux": ("calin", 1), "independant": ("calin", -1), "grognon": ("grognon", 1),
               "raleur": ("grognon", 1), "ronchon": ("grognon", 1), "patient": ("grognon", -1), "zen": ("grognon", -1),
               "bavard": ("bavard", 1), "taiseux": ("bavard", -1), "timide": ("bavard", -1), "farceur": ("farceur", 1),
               "blagueur": ("farceur", 1), "serieux": ("farceur", -1), "energique": ("energique", 1), "calme": ("energique", -1),
               "paresseux": ("energique", -1), "curieux": ("curieux", 1), "blase": ("curieux", -1), "gourmand": ("gourmand", 1),
               "studieux": ("studieux", 1), "scolaire": ("studieux", 1)}
NOT_NAMES = {"comment", "demain", "plus", "tard", "quand", "vite", "maintenant", "ce", "soir", "ici", "la", "tout", "rien", "si",
             "que", "qui", "comme", "pour", "dans", "avec", "un", "une", "des", "de", "du", "le", "les", "tu", "je", "il", "elle",
             "me", "te", "moi", "toi", "encore", "pas", "ne", "jamais", "souvent", "stp", "svp", "taxi", "bientot", "apres",
             "vraiment", "aussi", "bien", "toujours", "deja", "juste", "seulement", "enfin", "donc", "alors", "pareil", "mieux",
             "ainsi", "presque", "quoi", "ou", "oui", "non", "merci", "bon", "bonjour", "salut", "coucou", "au", "aux", "en", "et",
             "mais", "ca", "pourquoi", "combien", "sur", "par", "chez", "sans", "mon", "ma", "mes", "ton", "ta", "tes", "son", "sa",
             "ses", "lui", "nous", "vous", "on", "y", "a", "tres", "trop", "peu", "beaucoup", "autrement", "parfois", "plutot"}
# (the regexes run on the text as typed; ". ! …" at the end are dropped, a "?" makes it a question for Claude)
_TOI = re.compile(r"^(?:appelle[- ]?toi|tu t['’]appelleras|tu vas t['’]appeler|ton nom (?:est|sera|c['’]est))\s+(.+?)\s*[!.…]*$", re.I)
_TOI1 = re.compile(r"^(?:tu t['’]appelles?|je vais t['’]appeler)\s+(.+?)\s*[!.…]*$", re.I)     # sounds like chat: one word only
_MOI = re.compile(r"^(?:appelle[- ]?moi|je m['’]appelle|mon (?:pr[ée]nom|nom|surnom) (?:est|c['’]est))\s+(.+?)\s*[!.…]*$", re.I)
_OUBLIE = re.compile(r"^(?:ne m['’]appelle plus (?:comme [çc]a|par mon (?:nom|pr[ée]nom|surnom))|oublie mon (?:surnom|pr[ée]nom|nom)|pas de surnom)\s*[!.…]*$", re.I)


def a_name(s, most, words=2):
    """A name in a command: one (or two) words of letters, nothing that looks like a question or a sentence."""
    s = s.strip()
    if not s or "?" in s or len(s) > most or not re.fullmatch(r"[^\W\d_]+" + (r"(?:[ '’-][^\W\d_]+)?" if words > 1 else r"(?:[-][^\W\d_]+)?"), s):
        return None
    from .commands import norm
    if any(w in NOT_NAMES for w in re.split(r"[ '’-]", norm(s))):
        return None
    return s[0].upper() + s[1:]


def presets_text():
    return ", ".join(PRESETS[i][0] for i in PRESETS)


def _news(hub, args):
    """Would caractere.set change anything? A command that changes nothing is left to Claude (« tu peux parler » when he does)."""
    car = hub.s.get("caractere")
    return isinstance(car, dict) and apply(car, args, random.Random(0))[1] is not None


async def command(hub, t, raw):
    """« sois grognon », « caractère câlin », « plus câlin », « appelle-toi Bip », « appelle-moi Max », « tais-toi »…
    True when the text was one of them (and changed something, or showed something)."""
    raw = raw.strip()
    t = re.sub(r"\s*[.!…]+$", "", t)                   # « sois grognon. » as « sois grognon »
    m = re.match(r"^(?:sois|deviens)\s+(un peu\s+|tres\s+)?(?:une?\s+)?(plus\s+|moins\s+)?(.+?)\s*!*$", t)
    if m:
        more, word = m.group(2), m.group(3)
        if more and word in TRAIT_WORDS:
            trait, sign = TRAIT_WORDS[word]
            step = 10 if m.group(1) == "un peu " else 20
            await hub.dispatch("caractere.ajuste", {"trait": trait, "d": step * sign * (1 if more.strip() == "plus" else -1)})
            return True
        if not more and word in PRESET_WORDS:
            await hub.dispatch("caractere.set", {"preset": PRESET_WORDS[word]})
            return True
        return False
    m = re.match(r"^(?:caractere|personnalite)(?:\s+([^?]+?))?\s*\??$", t)   # « caractère ? »: the list
    if m:
        word = (m.group(1) or "").strip()
        if word in PRESET_WORDS:
            await hub.dispatch("caractere.set", {"preset": PRESET_WORDS[word]})
        elif word in ("reset", "reinitialise", "reinitialiser", "par defaut", "normal"):
            await hub.dispatch("caractere.reset")
        elif not word:
            car = hub.s.get("caractere") or DEFAULT
            name = PRESETS.get(car.get("preset"), ("Sur mesure",))[0]
            hub.toast(f"Son caractère : {name}. Les caractères : {presets_text()}. Tape « caractère câlin », « sois grognon »…", 12000)
        elif " " in word:                            # « personnalité de … »: a question for Claude
            return False
        else:
            hub.mood("confus", 2500)
            hub.toast(f"Je ne connais pas ce caractère. Les caractères : {presets_text()}.", 8000)
        return True
    m = re.match(r"^(un peu\s+)?(plus|moins)\s+(.+?)\s*!*$", t)
    if m and m.group(3) in TRAIT_WORDS:
        trait, sign = TRAIT_WORDS[m.group(3)]
        await hub.dispatch("caractere.ajuste", {"trait": trait, "d": (10 if m.group(1) else 20) * sign * (1 if m.group(2) == "plus" else -1)})
        return True
    args = None
    if _OUBLIE.match(raw):
        args = {"surnom": ""}
    for rx, key, most, words in ((_TOI, "nom", NOM_MAX, 2), (_TOI1, "nom", NOM_MAX, 1), (_MOI, "surnom", SURNOM_MAX, 2)):
        m = not args and rx.match(raw)
        if m:
            name = a_name(m.group(1), most, words)
            if not name:
                return False
            args = {key: name}
    if t in ("tais-toi", "tais toi"):
        args = {"parle": False}
    if t in ("tu peux parler", "tu peux reparler", "reparle", "tu peux parler maintenant"):
        args = {"parle": True}
    if not args or not _news(hub, args):                 # nothing to change: Claude answers
        return False
    await hub.dispatch("caractere.set", args)
    return True


def setup(hub, datadir=None):
    """The character: loaded from data_dir/caractere.json, its actions, saved after every change."""
    datadir = Path(datadir or os.path.expanduser(hub.cfg.get("data_dir", "~/.config/pixel")))
    path = datadir / "caractere.json"
    try:
        saved = clean(json.loads(path.read_text(encoding="utf-8")))
    except FileNotFoundError:
        saved = clean({})
    except Exception as e:                               # unreadable, not JSON, absurd values...: never stop the server
        log.warning("caractere.json unreadable (%s): the Pixel of every day", e)
        saved = clean({})
    C = hub.s["caractere"] = {**saved, "change": None, "essai": 0}

    def save():
        try:
            datadir.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".tmp")
            tmp.write_text(json.dumps({k: C[k] for k in SAVED}, ensure_ascii=False, indent=1), encoding="utf-8")
            tmp.replace(path)
        except OSError as e:
            log.warning("caractere.json not saved: %s", e)

    def commit(new, change):
        if change is None:
            return
        C.update({k: new[k] for k in SAVED})
        C["change"] = {"t0": now_ms(), **change}
        hub.s["anim"] = None
        hub.s["screen"] = "visage"                 # he shows his new character on his face
        save()

    @hub.action("caractere.set")
    async def set_(preset=None, traits=None, nom=None, surnom=None, humeur_jour=None, calme=None, boude=None, parle=None):
        """Change his character: a preset (or "surprise"), some traits (0..100), his name, yours, his little settings."""
        args = {k: v for k, v in (("preset", preset), ("traits", traits), ("nom", nom), ("surnom", surnom), ("humeur_jour", humeur_jour),
                                  ("calme", calme), ("boude", boude), ("parle", parle)) if v is not None}
        new, change = apply(C, args)
        commit(new, change)
        msg = notice(C, change)
        if msg:                                      # after his own « Chut… je me tais. » (the banner would hide his bubble)
            def tell():
                if notice(C, change):                # still true: not « tu peux parler » in between
                    hub.toast(msg, 7000)
            asyncio.get_running_loop().call_later(NOTICE_AFTER, tell) if NOTICE_AFTER else tell()

    @hub.action("caractere.ajuste")
    async def ajuste(trait, d=20):
        """« plus câlin » (d > 0), « moins bavard » (d < 0): one trait moves, his reaction shows which way."""
        step = _int(d, -100, 100)
        if trait not in TRAITS or not step:
            return
        new, change = apply(C, {"traits": {trait: C["traits"][trait] + step}})
        change = {**(change or {"quoi": "traits", "adj": ADJ.get(kind(new["traits"]), "")}), "kind": KINDS[(trait, 1 if step > 0 else -1)]}
        commit(new, change)                          # already as far as it goes: he shows that side again

    @hub.action("caractere.reset")
    async def reset():
        """Back to the Pixel of every day (all traits at 50, his name, no nickname, the usual settings)."""
        commit(clean({}), {"quoi": "reset", "kind": "pixel", "adj": ADJ["pixel"]})

    @hub.action("caractere.essai")
    async def essai():
        """« Essayer »: every screen plays a scene typical of his character, on his face."""
        C["essai"] = now_ms()
        hub.s["anim"] = None
        hub.s["screen"] = "visage"
